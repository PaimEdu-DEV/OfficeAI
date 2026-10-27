import { EventEmitter } from 'node:events';
import type { AgentId, Meeting, MeetingMessage } from '../src/shared/types';
import { appendLine, readJson, readLines, writeJson } from './store';

// Pergunta real a um agente dentro do contexto da reuniao; devolve a resposta final dele.
export type AskAgent = (agentId: AgentId, prompt: string, meeting: Meeting) => Promise<string>;

const DONE = 'SEM_ADICOES';

// Orquestra reunioes multiagente. Cada mensagem de agente e a resposta real de uma chamada;
// as rodadas automaticas de discussao sao limitadas por maxRounds e param quando ninguem acrescenta nada.
export class Meetings extends EventEmitter {
  private meetings = readJson<Meeting[]>('meetings.json', []).map((m) =>
    // Reunioes ativas nao sobrevivem ao reinicio: os turnos em andamento foram perdidos.
    m.state === 'ended' ? m : { ...m, state: 'paused' as const, working: [] });
  // Ultimo indice da transcricao que cada agente ja viu, por reuniao.
  private seen = new Map<string, Map<AgentId, number>>();

  constructor(private ask: AskAgent) {
    super();
  }

  list() {
    return this.meetings;
  }

  messages(id: string) {
    return readLines<MeetingMessage>(`meeting-${id}.jsonl`, 5000);
  }

  start(p: { participants: AgentId[]; goal: string; projectId?: string; maxRounds?: number }): Meeting {
    if (!p.participants.length) throw new Error('Selecione ao menos um agente.');
    const m: Meeting = {
      id: crypto.randomUUID(), goal: p.goal, projectId: p.projectId, participants: p.participants,
      state: 'active', round: 0, maxRounds: Math.min(Math.max(p.maxRounds ?? 2, 0), 6), working: [], createdAt: Date.now(),
    };
    this.meetings.push(m);
    this.post(m, 'system', 'all', `Reuniao iniciada. Objetivo: ${p.goal}`);
    this.changed(m);
    return m;
  }

  async say(id: string, text: string, to: AgentId | 'all' = 'all') {
    const m = this.get(id);
    if (m.state === 'ended') throw new Error('Reuniao encerrada.');
    this.post(m, 'user', to, text);
    m.round = 0;
    const targets = to === 'all' ? m.participants : [to];
    await this.round(m, targets);
    if (to === 'all') await this.discuss(m);
  }

  async requestTurn(id: string, agentId: AgentId) {
    const m = this.get(id);
    await this.round(m, [agentId]);
  }

  setPaused(id: string, paused: boolean) {
    const m = this.get(id);
    if (m.state === 'ended') return;
    m.state = paused ? 'paused' : 'active';
    this.changed(m);
  }

  async end(id: string, summarize: (m: Meeting, transcript: string) => Promise<string>, doSummary = true) {
    const m = this.get(id);
    m.state = 'ended';
    if (doSummary) {
      m.summary = await summarize(m, this.transcript(m.id));
      this.post(m, 'system', 'all', `Resumo final:\n${m.summary}`);
    }
    this.changed(m);
    return m;
  }

  toMarkdown(id: string) {
    const m = this.get(id);
    const lines = this.messages(id).map((x) => `**${x.author}${x.to !== 'all' ? ` → ${x.to}` : ''}** (${new Date(x.ts).toLocaleString()}):\n\n${x.text}\n`);
    return `# Reuniao: ${m.goal}\n\nParticipantes: ${m.participants.join(', ')}\n\n${lines.join('\n')}`;
  }

  // Rodadas seguintes: cada agente ve as respostas novas dos outros e responde ou passa a vez.
  private async discuss(m: Meeting) {
    while (m.state === 'active' && m.round < m.maxRounds && m.participants.length > 1) {
      m.round++;
      this.changed(m);
      const replies = await this.round(m, m.participants, true);
      if (replies.every((r) => r.includes(DONE))) {
        this.post(m, 'system', 'all', 'Os agentes nao tem mais adicoes. Aguardando o usuario.');
        break;
      }
    }
    if (m.round >= m.maxRounds && m.participants.length > 1)
      this.post(m, 'system', 'all', `Limite de ${m.maxRounds} rodada(s) automaticas atingido.`);
  }

  private async round(m: Meeting, agents: AgentId[], discussion = false) {
    const replies = await Promise.all(agents.map(async (agentId) => {
      const prompt = this.promptFor(m, agentId, discussion);
      m.working = [...m.working, agentId];
      this.changed(m);
      try {
        const reply = (await this.ask(agentId, prompt, m)).trim();
        if (!reply.includes(DONE)) this.post(m, agentId, 'all', reply);
        return reply;
      } catch (err) {
        this.post(m, 'system', 'all', `${agentId} falhou: ${err}`);
        return DONE;
      } finally {
        m.working = m.working.filter((a) => a !== agentId);
        this.changed(m);
      }
    }));
    return replies;
  }

  // Envia apenas o que o agente ainda nao viu, para economizar tokens.
  private promptFor(m: Meeting, agentId: AgentId, discussion: boolean) {
    const all = this.messages(m.id);
    const seen = this.seen.get(m.id) ?? new Map<AgentId, number>();
    this.seen.set(m.id, seen);
    const from = seen.get(agentId) ?? 0;
    seen.set(agentId, all.length);
    const fresh = all.slice(from).filter((x) => x.author !== agentId && (x.to === 'all' || x.to === agentId));
    const header = from === 0
      ? `Voce e ${agentId} numa reuniao do AI Office com: ${m.participants.join(', ')} e o usuario. Objetivo: ${m.goal}.` +
        ' Responda de forma objetiva. Voce pode usar suas ferramentas reais (ler codigo, rodar comandos) quando necessario.\n\n'
      : '';
    const tail = discussion
      ? `\n\nComente as respostas acima (concorde, discorde, complemente). Se nao tiver nada novo a acrescentar, responda apenas ${DONE}.`
      : '';
    return `${header}Novas mensagens da reuniao:\n${fresh.map((x) => `[${x.author}]: ${x.text}`).join('\n\n')}${tail}`;
  }

  private transcript(id: string) {
    return this.messages(id).map((x) => `[${x.author}]: ${x.text}`).join('\n\n');
  }

  private post(m: Meeting, author: MeetingMessage['author'], to: MeetingMessage['to'], text: string) {
    const msg: MeetingMessage = { id: crypto.randomUUID(), meetingId: m.id, ts: Date.now(), author, to, text };
    appendLine(`meeting-${m.id}.jsonl`, msg);
    this.emit('message', msg);
  }

  private get(id: string) {
    const m = this.meetings.find((x) => x.id === id);
    if (!m) throw new Error('Reuniao nao encontrada.');
    return m;
  }

  private changed(m: Meeting) {
    writeJson('meetings.json', this.meetings);
    this.emit('changed', { ...m });
  }
}
