import { useEffect, useRef, useState } from 'react';
import type { AgentInfo, Meeting, MeetingMessage } from '../../shared/types';

interface Props { agents: AgentInfo[]; projectId: string; onClose: () => void }

// Reuniao multiagente real: cada mensagem de agente e a resposta de uma chamada real.
export default function MeetingPanel({ agents, projectId, onClose }: Props) {
  const api = window.aiOffice;
  const [meeting, setMeeting] = useState<Meeting>();
  const [messages, setMessages] = useState<MeetingMessage[]>([]);
  const [participants, setParticipants] = useState<string[]>(agents.map((a) => a.id));
  const [goal, setGoal] = useState('');
  const [maxRounds, setMaxRounds] = useState(2);
  const [text, setText] = useState('');
  const [to, setTo] = useState('all');
  const [error, setError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void api.meetings.list().then((all) => {
      const open = [...all].reverse().find((m) => m.state !== 'ended');
      if (open) {
        setMeeting(open);
        void api.meetings.messages(open.id).then(setMessages);
      }
    });
    const offChanged = api.on('meeting-changed', (m) => setMeeting((cur) => (!cur || cur.id === m.id ? m : cur)));
    const offMsg = api.on('meeting-message', (m) => setMessages((old) => [...old, m]));
    return () => { offChanged(); offMsg(); };
  }, [api]);

  useEffect(() => { listRef.current?.scrollTo(0, listRef.current.scrollHeight); }, [messages]);

  const name = (id: string) => (id === 'user' ? 'Voce' : id === 'system' ? 'Sala' : agents.find((a) => a.id === id)?.name ?? id);
  const run = (p: Promise<unknown>) => p.catch((e) => setError(String(e)));

  async function start() {
    setMessages([]);
    const m = await api.meetings.start({ participants, goal, projectId: projectId || undefined, maxRounds });
    setMeeting(m);
  }

  if (!meeting || meeting.state === 'ended' && !messages.length)
    return (
      <section className="agent-panel side-panel">
        <div className="panel-heading"><h2>Nova reuniao</h2><button className="quiet" onClick={onClose}>×</button></div>
        <div className="panel-body">
          <h3 className="panel-sub">Participantes</h3>
          {agents.map((a) => (
            <label key={a.id} className="check">
              <input type="checkbox" checked={participants.includes(a.id)}
                onChange={(e) => setParticipants((p) => (e.target.checked ? [...p, a.id] : p.filter((x) => x !== a.id)))} />
              {a.name}
            </label>
          ))}
          <label className="field">Objetivo
            <textarea rows={3} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Revisar a arquitetura e criar um plano de melhorias" />
          </label>
          <label className="field">Rodadas automaticas de discussao (limite de tokens)
            <input type="number" min={0} max={6} value={maxRounds} onChange={(e) => setMaxRounds(Number(e.target.value))} />
          </label>
          {error && <p className="error-text">{error}</p>}
          <button className="primary" disabled={!participants.length || !goal.trim()} onClick={() => void run(start())}>Iniciar reuniao</button>
        </div>
      </section>
    );

  const ended = meeting.state === 'ended';
  return (
    <section className="agent-panel side-panel">
      <div className="panel-heading">
        <h2>Reuniao</h2>
        <button className="quiet" onClick={onClose}>×</button>
      </div>
      <div className="meeting-meta">
        <strong>{meeting.goal}</strong>
        <small>
          {meeting.participants.map(name).join(', ')} · rodada {meeting.round}/{meeting.maxRounds} · {ended ? 'encerrada' : meeting.state === 'paused' ? 'pausada' : 'ativa'}
          {meeting.working.length > 0 && ` · trabalhando: ${meeting.working.map(name).join(', ')}`}
        </small>
      </div>
      <div className="meeting-log" ref={listRef}>
        {messages.map((m) => (
          <div key={m.id} className={`meeting-msg ${m.author}`}>
            <b>{name(m.author)}{m.to !== 'all' && ` → ${name(m.to)}`}</b>
            <p>{m.text}</p>
          </div>
        ))}
      </div>
      {error && <p className="error-text">{error}</p>}
      {!ended && (
        <div className="panel-body compact">
          <span className="row">
            <select value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="all">Para todos</option>
              {meeting.participants.map((p) => <option key={p} value={p}>Para {name(p)}</option>)}
            </select>
            {meeting.participants.map((p) => (
              <button key={p} className="quiet" disabled={meeting.working.includes(p)} onClick={() => void run(api.meetings.requestTurn(meeting.id, p))}>
                Ouvir {name(p)}
              </button>
            ))}
          </span>
          <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Claude, analise a arquitetura. Codex, procure bugs. Discutam e criem um plano." />
          <span className="row">
            <button className="primary" disabled={!text.trim()} onClick={() => { void run(api.meetings.say(meeting.id, text, to)); setText(''); }}>Enviar</button>
            <button className="quiet" onClick={() => void run(api.meetings.setPaused(meeting.id, meeting.state !== 'paused'))}>
              {meeting.state === 'paused' ? 'Retomar rodadas' : 'Pausar rodadas'}
            </button>
            <button className="quiet" onClick={() => void run(api.meetings.end(meeting.id, true).then(setMeeting))}>Encerrar com resumo</button>
          </span>
        </div>
      )}
      {ended && (
        <div className="panel-body compact">
          <span className="row">
            <button className="quiet" onClick={() => void run(api.meetings.exportMarkdown(meeting.id))}>Exportar resumo .md</button>
            <button className="primary" onClick={() => { setMeeting(undefined); setMessages([]); }}>Nova reuniao</button>
          </span>
        </div>
      )}
    </section>
  );
}
