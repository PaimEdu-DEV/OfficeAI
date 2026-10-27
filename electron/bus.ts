import { EventEmitter } from 'node:events';
import type { AgentEvent, AgentId, AgentInfo, AgentStatus, BridgeMessage } from '../src/shared/types';
import { appendLine, readLines } from './store';

// Barramento central: adaptadores publicam eventos reais; IPC repassa para a interface.
class Bus extends EventEmitter {
  private agents = new Map<AgentId, AgentInfo>();

  registerAgent(info: AgentInfo) {
    this.agents.set(info.id, info);
    this.emit('agents-changed', this.listAgents());
  }

  listAgents() {
    return [...this.agents.values()];
  }

  patchAgent(id: AgentId, patch: Partial<AgentInfo>) {
    const a = this.agents.get(id);
    if (!a) return;
    Object.assign(a, patch, { lastActivity: Date.now() });
    this.emit('agents-changed', this.listAgents());
  }

  agentEvent(e: AgentEvent) {
    // Deltas sao transitorios; o historico guarda a mensagem final.
    if (e.kind !== 'message_delta') appendLine(`history-${e.agentId}.jsonl`, e);
    if (e.kind === 'status') this.patchAgent(e.agentId, { status: e.status });
    else this.patchAgent(e.agentId, {});
    this.emit('agent-event', e);
  }

  setStatus(agentId: AgentId, status: AgentStatus, detail?: string, sessionId?: string) {
    const current = this.agents.get(agentId)?.status;
    if (current === status) return;
    this.agentEvent({ kind: 'status', agentId, ts: Date.now(), status, detail, sessionId });
  }

  bridgeMessage(m: BridgeMessage) {
    appendLine('bridge.jsonl', m);
    this.emit('bridge-message', m);
  }

  history(agentId: AgentId, projectId?: string) {
    const all = readLines<AgentEvent>(`history-${agentId}.jsonl`);
    return projectId ? all.filter((e) => e.projectId === projectId) : all;
  }

  bridgeTimeline() {
    return readLines<BridgeMessage>('bridge.jsonl');
  }
}

export const bus = new Bus();
