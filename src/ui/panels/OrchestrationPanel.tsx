import { useEffect, useMemo, useState } from 'react';
import type { AgentEvent, AgentInfo, BridgeMessage, ManagedProcess, Project } from '../../shared/types';

interface Props { agents: AgentInfo[]; projects: Project[]; onClose?: () => void }

type Tab = 'agentes' | 'tarefas' | 'comunicacao' | 'execucao';

// Central de orquestracao: tudo vem do historico persistido e de eventos reais; nada e estimado.
export default function OrchestrationPanel({ agents, projects, onClose }: Props) {
  const api = window.aiOffice;
  const [tab, setTab] = useState<Tab>('agentes');
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [bridge, setBridge] = useState<BridgeMessage[]>([]);
  const [procs, setProcs] = useState<ManagedProcess[]>([]);

  useEffect(() => {
    void Promise.all(agents.map((a) => api.agents.history(a.id))).then((all) =>
      setEvents(all.flat().sort((a, b) => a.ts - b.ts)));
    void api.bridge.timeline().then(setBridge);
    void api.processes.list().then(setProcs);
    const offs = [
      api.on('agent-event', (e) => e.kind !== 'message_delta' && setEvents((old) => [...old.slice(-4000), e])),
      api.on('bridge-message', (m) => setBridge((old) => [...old, m])),
      api.on('processes-changed', setProcs),
    ];
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  const projectName = (id?: string) => projects.find((p) => p.id === id)?.name ?? '—';
  const fmt = (ts: number) => new Date(ts).toLocaleTimeString();

  // Tarefas = pedidos reais (mensagens do usuario e delegacoes) com estado derivado dos eventos seguintes.
  const tasks = useMemo(() => {
    const list: { id: string; ts: number; agent: string; text: string; state: string; kind: string }[] = [];
    const delegations = new Map<string, (typeof list)[number]>();
    let open: Record<string, (typeof list)[number] | undefined> = {};
    for (const e of events) {
      if (e.kind === 'user_message') {
        const t = { id: `${e.agentId}-${e.ts}`, ts: e.ts, agent: e.agentId, text: e.text, state: 'em execucao', kind: 'pedido' };
        list.push(t);
        open[e.agentId] = t;
      } else if (e.kind === 'approval_request' && open[e.agentId]) open[e.agentId]!.state = 'aguardando autorizacao';
      else if (e.kind === 'error' && open[e.agentId]) { open[e.agentId]!.state = 'falhou'; open[e.agentId] = undefined; }
      else if ((e.kind === 'final_reply' || (e.kind === 'status' && e.status === 'idle')) && open[e.agentId]) {
        if (open[e.agentId]!.state !== 'falhou') open[e.agentId]!.state = 'concluida';
        open[e.agentId] = undefined;
      } else if (e.kind === 'delegation') {
        if (e.phase === 'sent') {
          const t = { id: e.delegationId, ts: e.ts, agent: `${e.agentId} → ${e.to}`, text: e.summary, state: 'delegada', kind: 'delegacao' };
          delegations.set(e.delegationId, t);
          list.push(t);
        } else {
          const t = delegations.get(e.delegationId);
          if (t) t.state = e.phase === 'done' ? 'concluida' : 'falhou';
        }
      }
    }
    open = {};
    return list.reverse();
  }, [events]);

  const usage = useMemo(() => {
    const u: Record<string, { input: number; output: number; cost: number; hasCost: boolean }> = {};
    for (const e of events)
      if (e.kind === 'usage') {
        const x = (u[e.agentId] ??= { input: 0, output: 0, cost: 0, hasCost: false });
        x.input += e.inputTokens ?? 0;
        x.output += e.outputTokens ?? 0;
        if (e.costUsd != null) { x.cost += e.costUsd; x.hasCost = true; }
      }
    return u;
  }, [events]);

  const lastTool = (agentId: string) => [...events].reverse().find((e) => e.agentId === agentId && e.kind === 'tool_start');

  return (
    <section className="agent-panel side-panel orchestration">
      <div className="panel-heading">
        <h2>Central de orquestracao</h2>
        {onClose && <button className="quiet" onClick={onClose}>×</button>}
      </div>
      <div className="row tabs-row">
        {(['agentes', 'tarefas', 'comunicacao', 'execucao'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'primary' : 'quiet'} onClick={() => setTab(t)}>
            {{ agentes: 'Agentes', tarefas: 'Tarefas', comunicacao: 'Comunicacao', execucao: 'Execucao' }[t]}
          </button>
        ))}
      </div>
      <div className="panel-body">
        {tab === 'agentes' && agents.map((a) => {
          const tool = lastTool(a.id);
          const u = usage[a.id];
          return (
            <div key={a.id} className="orch-card">
              <strong>{a.name}</strong> <span className={`status ${a.status}`}>● {a.status}</span>
              <small>Sessao: {a.sessionId ?? '—'} · Projeto: {projectName(a.projectId)}</small>
              <small>Ultima atividade: {a.lastActivity ? fmt(a.lastActivity) : '—'}{tool?.kind === 'tool_start' && ` · ${tool.tool}: ${tool.summary.slice(0, 80)}`}</small>
              <small>Capacidades: {a.capabilities.join(', ') || '—'}</small>
              {a.unavailable && <small className="error-text">{a.unavailable}</small>}
              {u && (
                <small>
                  Tokens informados pelo CLI: {u.input.toLocaleString()} entrada · {u.output.toLocaleString()} saida
                  {u.hasCost && ` · US$ ${u.cost.toFixed(2)}`}
                </small>
              )}
            </div>
          );
        })}

        {tab === 'tarefas' && (
          <ul className="item-list">
            {tasks.slice(0, 200).map((t) => (
              <li key={t.id}>
                <button>
                  <strong>[{t.state}] {t.agent} · {t.kind}</strong>
                  <small>{fmt(t.ts)} · {t.text.slice(0, 160)}</small>
                </button>
              </li>
            ))}
            {!tasks.length && <li className="muted">Nenhuma tarefa registrada.</li>}
          </ul>
        )}

        {tab === 'comunicacao' && (
          <ul className="item-list">
            {[...bridge].reverse().slice(0, 200).map((m) => (
              <li key={m.id}>
                <button>
                  <strong>{m.from} → {m.to} · {fmt(m.ts)}</strong>
                  <small>{m.text.slice(0, 200)}</small>
                </button>
              </li>
            ))}
            {events.filter((e) => e.kind === 'delegation').reverse().slice(0, 100).map((e) => e.kind === 'delegation' && (
              <li key={`${e.delegationId}-${e.phase}`}>
                <button>
                  <strong>MCP delegate_to_codex · {e.phase} · {fmt(e.ts)}</strong>
                  <small>{e.summary}</small>
                </button>
              </li>
            ))}
            {!bridge.length && !events.some((e) => e.kind === 'delegation') && <li className="muted">Sem mensagens entre agentes ainda.</li>}
          </ul>
        )}

        {tab === 'execucao' && (
          <ul className="item-list">
            {[...procs].reverse().map((p) => (
              <li key={p.id}>
                <button>
                  <strong>{p.command} · {p.state}{p.exitCode != null && ` (${p.exitCode})`}</strong>
                  <small>{projectName(p.projectId)} · {fmt(p.startedAt)}{p.previewUrl && ` · ${p.previewUrl}`}</small>
                </button>
              </li>
            ))}
            {events.filter((e) => e.kind === 'tool_start' && /^(Bash|PowerShell|shell)$/.test(e.tool)).reverse().slice(0, 100).map((e) => e.kind === 'tool_start' && (
              <li key={`${e.agentId}-${e.toolId}`}>
                <button>
                  <strong>{e.agentId} executou · {fmt(e.ts)}</strong>
                  <small>{e.summary}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
