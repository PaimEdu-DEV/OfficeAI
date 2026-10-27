import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bus } from '../bus';
import { readJson, writeJson } from '../store';
import { statusForCommand } from './classify';

const AGENT = 'codex';
const SESSIONS_DIR = path.join(os.homedir(), '.codex', 'sessions');

// Adaptador v1: conversa com a sessao ativa do Codex (a mesma usada pela ponte) via
// `codex queue`, e acompanha o trabalho real lendo o rollout JSONL dessa sessao.
// Aprovacoes do Codex continuam no TUI do Codex (o rollout nao expoe pedidos pendentes).
export class CodexAdapter {
  private config = readJson<{ thread?: string }>('codex.json', {});
  private file?: string;
  private offset = 0;
  private partial = '';
  private timer?: NodeJS.Timeout;
  private seen = new Set<string>();

  init() {
    bus.registerAgent({
      id: AGENT,
      name: 'Codex',
      status: 'disconnected',
      capabilities: ['send', 'observe', 'tools'],
    });
    this.attach();
    this.timer = setInterval(() => this.poll(), 700);
  }

  get thread() {
    return this.config.thread;
  }

  setThread(thread: string) {
    this.config.thread = thread;
    writeJson('codex.json', this.config);
    this.file = undefined;
    this.attach();
  }

  async send(text: string, projectId?: string) {
    if (!this.thread) throw new Error('Nenhuma sessao do Codex configurada.');
    bus.agentEvent({ kind: 'user_message', agentId: AGENT, ts: Date.now(), text, projectId, sessionId: this.thread });
    await runCodex(['queue', '--thread', this.thread, '--message', text]);
  }

  // Delegacao vinda de outro agente: enfileira "[<from>]: tarefa" e espera o fim do turno
  // do Codex que processou exatamente essa mensagem, devolvendo a resposta final real.
  async delegate(from: string, task: string, timeoutMs = 15 * 60_000): Promise<string> {
    if (!this.thread) throw new Error('Nenhuma sessao do Codex configurada.');
    const text = `[${from}]: ${task}`;
    const reply = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(text);
        reject(new Error('Tempo esgotado esperando a resposta do Codex.'));
      }, timeoutMs);
      this.waiters.set(text, { resolve: (r) => (clearTimeout(timer), resolve(r)) });
    });
    await runCodex(['queue', '--thread', this.thread, '--message', text]);
    return reply;
  }

  private waiters = new Map<string, { turnId?: string; resolve: (reply: string) => void }>();

  dispose() {
    clearInterval(this.timer);
  }

  private attach() {
    // Sem thread configurada, usa a sessao do Codex mais recente.
    const file = findRollout(this.thread);
    if (!file) {
      bus.patchAgent(AGENT, { status: 'disconnected', unavailable: 'Nenhuma sessao do Codex encontrada. Abra o Codex no terminal.' });
      return;
    }
    this.file = file;
    this.config.thread ??= threadFromFile(file);
    // Comeca do fim: o historico anterior ja esta no proprio Codex.
    this.offset = fs.statSync(file).size;
    this.partial = '';
    bus.patchAgent(AGENT, { status: 'idle', sessionId: this.thread, unavailable: undefined });
  }

  private poll() {
    if (!this.file) return this.attach();
    let size: number;
    try {
      size = fs.statSync(this.file).size;
    } catch {
      this.file = undefined;
      return;
    }
    if (size <= this.offset) return;
    const fd = fs.openSync(this.file, 'r');
    const buf = Buffer.alloc(size - this.offset);
    fs.readSync(fd, buf, 0, buf.length, this.offset);
    fs.closeSync(fd);
    this.offset = size;
    const lines = (this.partial + buf.toString('utf8')).split('\n');
    this.partial = lines.pop() ?? '';
    for (const line of lines) {
      try {
        this.handle(JSON.parse(line));
      } catch {
        /* linha incompleta ou formato desconhecido */
      }
    }
  }

  private handle(e: any) {
    const p = e.payload ?? {};
    const base = { agentId: AGENT, ts: Date.parse(e.timestamp) || Date.now(), sessionId: this.thread };
    if (e.type === 'event_msg') {
      if (p.type === 'task_started') bus.setStatus(AGENT, 'thinking');
      else if (p.type === 'task_complete') {
        bus.setStatus(AGENT, 'idle');
        for (const [key, w] of this.waiters)
          if (w.turnId && w.turnId === p.turn_id) {
            this.waiters.delete(key);
            w.resolve(p.last_agent_message ?? '');
            if (p.last_agent_message)
              bus.bridgeMessage({ id: `${p.turn_id}-reply`, ts: base.ts, from: 'codex', to: 'claude', text: p.last_agent_message });
          }
      }
      else if (p.type === 'token_count' && p.info?.last_token_usage)
        bus.agentEvent({ ...base, kind: 'usage', inputTokens: p.info.last_token_usage.input_tokens, outputTokens: p.info.last_token_usage.output_tokens });
      else if (p.type === 'item_completed' && p.item && !this.seen.has(p.item.id)) {
        this.seen.add(p.item.id);
        const text = (p.item.content ?? []).map((c: any) => c.text ?? '').join('');
        if (p.item.type === 'UserMessage') {
          const waiter = this.waiters.get(text);
          if (waiter && !waiter.turnId) waiter.turnId = p.turn_id;
          // Mensagens vindas do Claude pela ponte chegam como "[Claude]: ...".
          if (text.startsWith('[Claude]:'))
            bus.bridgeMessage({ id: p.item.id, ts: base.ts, from: 'claude', to: 'codex', text: text.slice(9).trim() });
          else bus.agentEvent({ ...base, kind: 'user_message', text });
        } else if (p.item.type === 'AgentMessage' && text)
          bus.agentEvent({ ...base, kind: 'message', messageId: p.item.id, text });
      }
    } else if (e.type === 'response_item') {
      if (p.type === 'custom_tool_call' || p.type === 'function_call') {
        const input = String(p.input ?? p.arguments ?? '');
        bus.agentEvent({ ...base, kind: 'tool_start', toolId: p.call_id, tool: p.name, summary: input.slice(0, 200) });
        bus.setStatus(AGENT, /apply_patch/.test(input) ? 'coding' : statusForCommand(input));
      } else if (p.type === 'custom_tool_call_output' || p.type === 'function_call_output') {
        const out = typeof p.output === 'string' ? p.output : JSON.stringify(p.output ?? '');
        bus.agentEvent({ ...base, kind: 'tool_end', toolId: p.call_id, ok: !/"exit_code":\s*[1-9]|Process exited with code [1-9]/.test(out), output: out.slice(0, 4000) });
        bus.setStatus(AGENT, 'thinking');
      }
    }
  }
}

function findRollout(thread?: string): string | undefined {
  const files: { f: string; t: number }[] = [];
  const walk = (d: string) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, ent.name);
      if (ent.isDirectory()) walk(f);
      else if (ent.name.endsWith('.jsonl') && (!thread || ent.name.includes(thread))) files.push({ f, t: fs.statSync(f).mtimeMs });
    }
  };
  try {
    walk(SESSIONS_DIR);
  } catch {
    return undefined;
  }
  return files.sort((a, b) => b.t - a.t)[0]?.f;
}

function threadFromFile(file: string) {
  return /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/.exec(file)?.[1];
}

// Executa o CLI do Codex sem shell, para que argumentos com aspas cheguem intactos.
export function runCodex(args: string[]) {
  const js = path.join(process.env.APPDATA ?? '', 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
  const [cmd, full] = fs.existsSync(js) ? ['node', [js, ...args]] : ['codex', args];
  return new Promise<string>((resolve, reject) =>
    execFile(cmd, full, { windowsHide: true, shell: cmd === 'codex' }, (err, stdout, stderr) =>
      err ? reject(new Error(stderr || err.message)) : resolve(stdout)));
}
