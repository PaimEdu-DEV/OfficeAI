import { execFile, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { bus } from '../bus';
import { readJson, writeJson } from '../store';
import { statusForCommand } from './classify';

const AGENT = 'codex';

interface Turn {
  text: string;
  toUser: boolean;
  resolve: (reply: string) => void;
  reject: (err: Error) => void;
}

interface Session {
  key: string;
  cwd: string;
  projectId?: string;
  queue: Turn[];
  child?: ChildProcess;
}

// Sessoes proprias do AI Office via `codex exec --json` (interface oficial nao interativa),
// retomadas com `codex exec resume <id>`. Nao usa a sessao do terminal do usuario.
// Sem aprovacoes interativas no exec: revisao automatica do Codex + sandbox workspace-write.
export class CodexAdapter {
  private threads = readJson<Record<string, string>>('codex-threads.json', {});
  private sessions = new Map<string, Session>();

  init() {
    const ok = fs.existsSync(codexJs()) || !!process.env.PATH?.split(path.delimiter).some((d) => fs.existsSync(path.join(d, 'codex.cmd')));
    bus.registerAgent({
      id: AGENT,
      name: 'Codex',
      status: ok ? 'idle' : 'disconnected',
      capabilities: ['streaming-items', 'resume', 'interrupt', 'tools', 'auto-review:workspace-write'],
      unavailable: ok ? undefined : 'Codex CLI nao encontrado.',
    });
  }

  // Chat do usuario: o fim do turno gera final_reply.
  async send(text: string, cwd: string, projectId?: string) {
    bus.patchAgent(AGENT, { projectId });
    this.run(projectId ?? 'default', cwd, projectId, text, true).catch(() => undefined);
  }

  // Delegacao de outro agente: devolve a resposta final real do Codex.
  delegate(from: string, task: string, cwd: string, projectId?: string) {
    return this.run(`delegation:${projectId ?? 'default'}`, cwd, projectId, `[${from}]: ${task}`, false);
  }

  interrupt() {
    for (const s of this.sessions.values()) if (s.child?.pid) killTree(s.child.pid);
  }

  dispose() {
    this.interrupt();
  }

  private run(key: string, cwd: string, projectId: string | undefined, text: string, toUser: boolean) {
    let s = this.sessions.get(key);
    if (!s) this.sessions.set(key, (s = { key, cwd, projectId, queue: [] }));
    bus.agentEvent({ kind: 'user_message', agentId: AGENT, ts: Date.now(), text, projectId, sessionId: this.threads[key] });
    return new Promise<string>((resolve, reject) => {
      s!.queue.push({ text, toUser, resolve, reject });
      if (!s!.child) this.next(s!);
    });
  }

  private next(s: Session) {
    const turn = s.queue.shift();
    if (!turn) return;
    const thread = this.threads[s.key];
    // Sem humano para aprovar no exec: --approve-for-me usa a revisao automatica oficial do Codex
    // dentro da sandbox workspace-write (com -s workspace-write puro, comandos sao rejeitados no Windows).
    const args = ['exec', '--json', '--skip-git-repo-check', '--approve-for-me', '-C', s.cwd];
    if (thread) args.push('resume', thread);
    args.push('-'); // prompt via stdin: evita problemas de aspas no Windows
    const [cmd, full] = fs.existsSync(codexJs()) ? ['node', [codexJs(), ...args]] : ['codex', args];
    const child = spawn(cmd, full, { cwd: s.cwd, windowsHide: true, shell: cmd === 'codex' });
    s.child = child;
    child.stdin.end(turn.text);
    bus.setStatus(AGENT, 'thinking');

    const base = () => ({ agentId: AGENT, ts: Date.now(), projectId: s.projectId, sessionId: this.threads[s.key] });
    let lastMessage = '';
    let failed = '';
    let buffer = '';
    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        let e: any;
        try {
          e = JSON.parse(line);
        } catch {
          continue;
        }
        const item = e.item ?? {};
        if (e.type === 'thread.started') {
          this.threads[s.key] = e.thread_id;
          writeJson('codex-threads.json', this.threads);
          bus.patchAgent(AGENT, { sessionId: e.thread_id });
        } else if (e.type === 'item.started') {
          if (item.type === 'command_execution') {
            bus.agentEvent({ ...base(), kind: 'tool_start', toolId: item.id, tool: 'shell', summary: String(item.command ?? '').slice(0, 200) });
            bus.setStatus(AGENT, statusForCommand(String(item.command ?? '')));
          } else if (item.type === 'file_change') {
            bus.agentEvent({ ...base(), kind: 'tool_start', toolId: item.id, tool: 'apply_patch', summary: describeChanges(item) });
            bus.setStatus(AGENT, 'coding');
          } else if (item.type === 'mcp_tool_call') {
            bus.agentEvent({ ...base(), kind: 'tool_start', toolId: item.id, tool: `${item.server}.${item.tool}`, summary: '' });
            bus.setStatus(AGENT, 'running_command');
          }
        } else if (e.type === 'item.completed') {
          if (item.type === 'agent_message' && item.text) {
            lastMessage = item.text;
            bus.agentEvent({ ...base(), kind: 'message', messageId: item.id, text: item.text });
          } else if (item.type === 'command_execution' || item.type === 'mcp_tool_call') {
            const ok = item.status !== 'failed' && (item.exit_code ?? 0) === 0;
            bus.agentEvent({ ...base(), kind: 'tool_end', toolId: item.id, ok, output: String(item.aggregated_output ?? '').slice(-4000) });
            bus.setStatus(AGENT, ok ? 'thinking' : 'analyzing_error');
          } else if (item.type === 'file_change') {
            for (const c of item.changes ?? [])
              bus.agentEvent({ ...base(), kind: 'file_changed', path: c.path, change: c.kind === 'add' ? 'create' : c.kind === 'delete' ? 'delete' : 'modify' });
            bus.agentEvent({ ...base(), kind: 'tool_end', toolId: item.id, ok: item.status !== 'failed' });
            bus.setStatus(AGENT, 'thinking');
          } else if (item.type === 'reasoning') bus.setStatus(AGENT, 'thinking');
        } else if (e.type === 'turn.completed') {
          bus.agentEvent({ ...base(), kind: 'usage', inputTokens: e.usage?.input_tokens, outputTokens: e.usage?.output_tokens });
        } else if (e.type === 'turn.failed' || e.type === 'error') {
          failed = e.error?.message ?? e.message ?? 'Falha no turno do Codex';
        }
      }
    });
    let stderr = '';
    child.stderr.on('data', (c: Buffer) => (stderr = (stderr + c.toString('utf8')).slice(-4000)));
    child.on('close', (code) => {
      s.child = undefined;
      if (failed || (code !== 0 && !lastMessage)) {
        const msg = failed || stderr.trim() || `codex saiu com codigo ${code}`;
        bus.agentEvent({ ...base(), kind: 'error', message: msg });
        bus.setStatus(AGENT, 'error', msg);
        turn.reject(new Error(msg));
      } else {
        bus.setStatus(AGENT, 'idle');
        if (turn.toUser && lastMessage) bus.agentEvent({ ...base(), kind: 'final_reply', text: lastMessage });
        turn.resolve(lastMessage);
      }
      this.next(s);
    });
  }
}

function describeChanges(item: any) {
  return (item.changes ?? []).map((c: any) => `${c.kind} ${c.path}`).join(', ').slice(0, 200);
}

function codexJs() {
  return path.join(process.env.APPDATA ?? '', 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
}

function killTree(pid: number) {
  if (process.platform === 'win32') execFile('taskkill', ['/pid', String(pid), '/T', '/F']);
  else process.kill(pid, 'SIGTERM');
}
