import { useEffect, useRef, useState } from 'react';
import type { ManagedProcess } from '../../shared/types';

interface Props { projectId: string; onClose: () => void }

// Processos reais do projeto: iniciar/encerrar, logs ao vivo e Preview do servidor detectado.
export default function ExecPanel({ projectId, onClose }: Props) {
  const api = window.aiOffice;
  const [procs, setProcs] = useState<ManagedProcess[]>([]);
  const [logs, setLogs] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string>();
  const [command, setCommand] = useState('npm run dev');
  const [preview, setPreview] = useState<string>();
  const [error, setError] = useState('');
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    void api.processes.list().then(setProcs);
    const offChanged = api.on('processes-changed', setProcs);
    const offOut = api.on('process-output', (o) =>
      setLogs((old) => ({ ...old, [o.processId]: ((old[o.processId] ?? '') + o.data).slice(-200_000) })));
    return () => { offChanged(); offOut(); };
  }, [api]);

  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight); }, [logs, selected]);

  const mine = procs.filter((p) => p.projectId === projectId);
  const current = mine.find((p) => p.id === selected) ?? mine[mine.length - 1];

  async function start() {
    setError('');
    try {
      const p = await api.processes.start(projectId, command);
      setSelected(p.id);
    } catch (e) {
      setError(String(e));
    }
  }

  if (!projectId)
    return (
      <section className="agent-panel side-panel">
        <div className="panel-heading"><h2>Execucao</h2><button className="quiet" onClick={onClose}>×</button></div>
        <div className="empty-state"><p>Abra ou crie um projeto para executar comandos.</p></div>
      </section>
    );

  return (
    <section className={`agent-panel side-panel ${preview ? 'wide' : ''}`}>
      <div className="panel-heading">
        <h2>Execucao</h2>
        <button className="quiet" onClick={onClose}>×</button>
      </div>
      <div className="panel-body">
        <span className="row">
          <input value={command} onChange={(e) => setCommand(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void start()} />
          <button className="primary" onClick={() => void start()}>Executar</button>
        </span>
        {error && <p className="error-text">{error}</p>}
        <ul className="item-list">
          {mine.map((p) => (
            <li key={p.id} className={p.id === current?.id ? 'active' : ''}>
              <button onClick={() => setSelected(p.id)}>
                <strong>{p.command}</strong>
                <small>
                  {p.state === 'running' ? '● rodando' : p.state === 'failed' ? `✕ falhou (${p.exitCode ?? '?'})` : `✓ encerrado (${p.exitCode ?? 0})`}
                  {p.previewUrl && ` · ${p.previewUrl}`}
                </small>
              </button>
            </li>
          ))}
        </ul>
        {current && (
          <>
            <span className="row">
              {current.state === 'running' && <button className="quiet" onClick={() => void api.processes.stop(current.id)}>Encerrar</button>}
              <button className="quiet" onClick={() => { setCommand(current.command); }}>Reusar comando</button>
              {current.previewUrl && (
                <>
                  <button className="primary" onClick={() => setPreview(current.previewUrl)}>Abrir Preview</button>
                  <button className="quiet" onClick={() => void api.processes.openExternal(current.previewUrl!)}>Navegador ↗</button>
                </>
              )}
            </span>
            <pre ref={logRef} className="log-view">{logs[current.id] ?? '(sem saida ainda)'}</pre>
          </>
        )}
        {preview && (
          <div className="preview">
            <span className="row">
              <code>{preview}</code>
              <button className="quiet" onClick={() => setPreview((u) => (u ? `${u.split('#')[0]}#${Date.now()}` : u))}>Recarregar</button>
              <button className="quiet" onClick={() => setPreview(undefined)}>Fechar</button>
            </span>
            <iframe title="Preview" src={preview} sandbox="allow-scripts allow-forms allow-same-origin" />
          </div>
        )}
      </div>
    </section>
  );
}
