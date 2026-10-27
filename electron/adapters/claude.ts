import type { PermissionResult, Query, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { AgentStatus } from '../../src/shared/types';
import { bus } from '../bus';
import { readJson, writeJson } from '../store';
import { statusForCommand } from './classify';

const AGENT = 'claude';

// Fila assincrona que alimenta o query() em modo de entrada por streaming.
class InputQueue implements AsyncIterable<SDKUserMessage> {
  private items: SDKUserMessage[] = [];
  private waiting?: (r: IteratorResult<SDKUserMessage>) => void;
  private closed = false;

  push(text: string) {
    const msg: SDKUserMessage = {
      type: 'user',
      message: { role: 'user', content: text },
      parent_tool_use_id: null,
      origin: { kind: 'human' },
    } as SDKUserMessage;
    if (this.waiting) {
      this.waiting({ value: msg, done: false });
      this.waiting = undefined;
    } else this.items.push(msg);
  }

  close() {
    this.closed = true;
    this.waiting?.({ value: undefined as never, done: true });
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: () => {
        const item = this.items.shift();
        if (item) return Promise.resolve({ value: item, done: false });
        if (this.closed) return Promise.resolve({ value: undefined as never, done: true });
        return new Promise((resolve) => (this.waiting = resolve));
      },
    };
  }
}

interface Session {
  key: string;
  projectId?: string;
  cwd: string;
  input: InputQueue;
  query: Query;
  sessionId?: string;
}

type PendingApproval = { resolve: (r: PermissionResult) => void; input: Record<string, unknown> };

export class ClaudeAdapter {
  private sessions = new Map<string, Session>();
  private approvals = new Map<string, PendingApproval>();
  private savedSessions = readJson<Record<string, string>>('claude-sessions.json', {});
  private sdk?: typeof import('@anthropic-ai/claude-agent-sdk');

  async init() {
    bus.registerAgent({
      id: AGENT,
      name: 'Claude',
      status: 'idle',
      capabilities: ['streaming', 'approvals', 'resume', 'interrupt', 'tools', 'mcp'],
    });
    try {
      this.sdk = await import('@anthropic-ai/claude-agent-sdk');
    } catch (err) {
      bus.patchAgent(AGENT, { status: 'disconnected', unavailable: `Claude Agent SDK indisponivel: ${err}` });
    }
  }

  async send(text: string, cwd: string, projectId?: string) {
    const s = this.session(cwd, projectId);
    bus.agentEvent({ kind: 'user_message', agentId: AGENT, ts: Date.now(), text, projectId, sessionId: s.sessionId });
    bus.setStatus(AGENT, 'thinking');
    bus.patchAgent(AGENT, { projectId });
    s.input.push(text);
  }

  async interrupt() {
    await Promise.all([...this.sessions.values()].map((s) => s.query.interrupt().catch(() => undefined)));
  }

  respondApproval(requestId: string, approved: boolean) {
    const p = this.approvals.get(requestId);
    if (!p) return;
    this.approvals.delete(requestId);
    p.resolve(approved
      ? { behavior: 'allow', updatedInput: p.input }
      : { behavior: 'deny', message: 'Negado pelo usuario no AI Office.' });
    bus.setStatus(AGENT, approved ? 'thinking' : 'idle');
  }

  dispose() {
    for (const s of this.sessions.values()) s.input.close();
  }

  private session(cwd: string, projectId?: string): Session {
    const key = projectId ?? 'default';
    const existing = this.sessions.get(key);
    if (existing) return existing;
    if (!this.sdk) throw new Error('Claude Agent SDK indisponivel.');

    const input = new InputQueue();
    const resume = this.savedSessions[key];
    const query = this.sdk.query({
      prompt: input,
      options: {
        cwd,
        resume,
        includePartialMessages: true,
        // Mantem as configuracoes e regras de permissao do usuario (mesmo comportamento do CLI).
        canUseTool: (toolName, toolInput, { signal }) => this.askApproval(toolName, toolInput, signal, projectId),
      },
    });
    const s: Session = { key, projectId, cwd, input, query, sessionId: resume };
    this.sessions.set(key, s);
    this.pump(s).catch((err) => {
      bus.agentEvent({ kind: 'error', agentId: AGENT, ts: Date.now(), message: String(err), projectId });
      bus.setStatus(AGENT, 'error', String(err));
      this.sessions.delete(key);
    });
    return s;
  }

  private askApproval(tool: string, input: Record<string, unknown>, signal: AbortSignal, projectId?: string) {
    const requestId = crypto.randomUUID();
    return new Promise<PermissionResult>((resolve) => {
      this.approvals.set(requestId, { resolve, input });
      signal.addEventListener('abort', () => {
        this.approvals.delete(requestId);
        resolve({ behavior: 'deny', message: 'Cancelado.' });
      });
      bus.agentEvent({
        kind: 'approval_request', agentId: AGENT, ts: Date.now(), requestId, projectId,
        summary: `${tool}: ${summarize(tool, input)}`,
        detail: JSON.stringify(input, null, 2),
      });
      bus.setStatus(AGENT, 'awaiting_approval');
    });
  }

  private async pump(s: Session) {
    const base = () => ({ agentId: AGENT, ts: Date.now(), projectId: s.projectId, sessionId: s.sessionId });
    let messageId = '';
    for await (const m of s.query as AsyncIterable<SDKMessage>) {
      if ('session_id' in m && m.session_id && m.session_id !== s.sessionId) {
        s.sessionId = m.session_id;
        this.savedSessions[s.key] = m.session_id;
        writeJson('claude-sessions.json', this.savedSessions);
        bus.patchAgent(AGENT, { sessionId: m.session_id });
      }
      switch (m.type) {
        case 'stream_event': {
          const ev = m.event;
          if (ev.type === 'message_start') messageId = ev.message.id;
          else if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta')
            bus.agentEvent({ ...base(), kind: 'message_delta', messageId, text: ev.delta.text });
          break;
        }
        case 'assistant': {
          for (const block of m.message.content) {
            if (block.type === 'text' && block.text.trim())
              bus.agentEvent({ ...base(), kind: 'message', messageId: m.message.id, text: block.text });
            else if (block.type === 'tool_use') {
              const input = block.input as Record<string, unknown>;
              bus.agentEvent({ ...base(), kind: 'tool_start', toolId: block.id, tool: block.name, summary: summarize(block.name, input) });
              bus.setStatus(AGENT, statusForTool(block.name, input));
              const file = (input.file_path ?? input.notebook_path) as string | undefined;
              if (file && /^(Write|Edit|MultiEdit|NotebookEdit)$/.test(block.name))
                bus.agentEvent({ ...base(), kind: 'file_changed', path: file, change: block.name === 'Write' ? 'create' : 'modify' });
            }
          }
          break;
        }
        case 'user': {
          const content = m.message.content;
          if (Array.isArray(content))
            for (const block of content)
              if (block.type === 'tool_result')
                bus.agentEvent({
                  ...base(), kind: 'tool_end', toolId: block.tool_use_id, ok: !block.is_error,
                  output: typeof block.content === 'string' ? block.content.slice(0, 4000) : undefined,
                });
          bus.setStatus(AGENT, 'thinking');
          break;
        }
        case 'result': {
          bus.agentEvent({
            ...base(), kind: 'usage',
            inputTokens: m.usage?.input_tokens, outputTokens: m.usage?.output_tokens, costUsd: m.total_cost_usd,
          });
          if (m.subtype !== 'success') {
            bus.agentEvent({ ...base(), kind: 'error', message: `Turno terminou com ${m.subtype}` });
            bus.setStatus(AGENT, 'error', m.subtype);
          } else bus.setStatus(AGENT, 'idle');
          break;
        }
      }
    }
    this.sessions.delete(s.key);
  }
}

function statusForTool(tool: string, input: Record<string, unknown>): AgentStatus {
  if (tool === 'Bash' || tool === 'PowerShell') return statusForCommand(String(input.command ?? ''));
  if (/^(Write|Edit|MultiEdit|NotebookEdit)$/.test(tool)) return 'coding';
  return 'thinking';
}

function summarize(tool: string, input: Record<string, unknown>) {
  const v = input.command ?? input.file_path ?? input.pattern ?? input.url ?? input.description ?? '';
  return `${tool} ${String(v)}`.slice(0, 200);
}
