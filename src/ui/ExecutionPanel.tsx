import { useEffect, useRef, useState } from "react";
import type { ManagedProcess, ProcessOutput, Project } from "../shared/types";

// Only local development URLs supported by the desktop CSP can be embedded.
function previewAddress(raw?: string) {
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
export default function ExecutionPanel({
  projectId,
  projects,
  visible,
}: {
  projectId: string;
  projects: Project[];
  visible: boolean;
}) {
  const [processes, setProcesses] = useState<ManagedProcess[]>([]),
    [logs, setLogs] = useState<Record<string, ProcessOutput[]>>({}),
    [selected, setSelected] = useState(""),
    [command, setCommand] = useState(""),
    [busy, setBusy] = useState(false),
    [stopping, setStopping] = useState<Set<string>>(new Set()),
    [error, setError] = useState(""),
    [preview, setPreview] = useState(false),
    [reload, setReload] = useState(0);
  const end = useRef<HTMLDivElement>(null),
    follow = useRef(true);
  useEffect(() => {
    const api = window.aiOffice;
    if (!api) return;
    let live = true,
      received = false;
    const off = api.on("processes-changed", (list) => {
      received = true;
      setProcesses(list);
    });
    const outputOff = api.on("process-output", (output) =>
      setLogs((old) => {
        const list = [
          ...(old[output.processId] ?? []),
          { ...output, data: output.data.slice(-100000) },
        ];
        let size = list.reduce((sum, item) => sum + item.data.length, 0);
        while (list.length > 1 && (size > 500000 || list.length > 2000))
          size -= list.shift()!.data.length;
        return { ...old, [output.processId]: list };
      }),
    );
    void api.processes
      .list()
      .then((list) => {
        if (live && !received) setProcesses(list);
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
      off();
      outputOff();
    };
  }, []);
  const filtered = processes.filter((p) => p.projectId === projectId);
  const process =
    filtered.find((p) => p.id === selected) ?? filtered[filtered.length - 1];
  const url = previewAddress(process?.previewUrl);
  const project = projects.find((p) => p.id === projectId);
  useEffect(() => {
    setSelected("");
    setPreview(false);
    follow.current = true;
  }, [projectId]);
  useEffect(() => {
    setPreview(false);
    follow.current = true;
  }, [process?.id]);
  useEffect(() => {
    if (visible && follow.current)
      end.current?.scrollIntoView({ block: "nearest" });
  }, [logs, visible, process?.id]);
  async function start() {
    if (!command.trim() || !projectId || busy || !window.aiOffice) return;
    setBusy(true);
    setError("");
    try {
      const p = await window.aiOffice.processes.start(
        projectId,
        command.trim(),
      );
      // A status event can arrive before the IPC reply, including a quick exit.
      setProcesses((old) =>
        old.some((item) => item.id === p.id) ? old : [...old, p],
      );
      setSelected(p.id);
      setCommand("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function stop(id: string) {
    setStopping((old) => new Set(old).add(id));
    setError("");
    try {
      await window.aiOffice.processes.stop(id);
    } catch (e) {
      setError(String(e));
    } finally {
      setStopping((old) => {
        const next = new Set(old);
        next.delete(id);
        return next;
      });
    }
  }
  return (
    <section className="execution-workbench" hidden={!visible}>
      <div className="execution-top">
        <div>
          <span className="eyebrow">EXECUÇÃO LOCAL</span>
          <h2>Do código para a tela.</h2>
          <p>
            {project?.path ?? "Selecione um projeto para executar comandos."}
          </p>
        </div>
        <span className="scene-badge">
          {filtered.filter((p) => p.state === "running").length} EM EXECUÇÃO
        </span>
      </div>
      {error && (
        <div className="panel-error" role="alert">
          {error}
        </div>
      )}
      <form
        className="command-form"
        onSubmit={(e) => {
          e.preventDefault();
          void start();
        }}
      >
        <span aria-hidden="true">❯</span>
        <input
          aria-label="Comando para executar no projeto"
          placeholder={window.aiOffice ? "Ex.: npm run dev" : "Desconectado"}
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          disabled={!projectId || !window.aiOffice || busy}
        />
        <button
          className="primary"
          disabled={!projectId || !command.trim() || !window.aiOffice || busy}
        >
          {busy ? "Iniciando…" : "Executar →"}
        </button>
      </form>
      <div className="execution-content">
        <aside className="process-list">
          <div className="section-label">PROCESSOS</div>
          {filtered.map((p) => (
            <button
              key={p.id}
              className={`process-item ${process?.id === p.id ? "active" : ""}`}
              onClick={() => setSelected(p.id)}
            >
              <strong>{p.command}</strong>
              <span className={`process-state ${p.state}`}>
                ●{" "}
                {p.state === "running"
                  ? "Em execução"
                  : p.state === "exited"
                    ? "Concluído"
                    : "Falhou"}
                {p.exitCode !== undefined ? ` · código ${p.exitCode}` : ""}
              </span>
              <small>
                {new Date(p.startedAt).toLocaleTimeString("pt-BR")}
                {p.pid ? ` · PID ${p.pid}` : ""}
              </small>
            </button>
          ))}
          {!filtered.length && (
            <p className="tree-note">Nenhum processo neste projeto.</p>
          )}
        </aside>
        <div className="process-detail">
          {process ? (
            <>
              <div className="process-toolbar">
                <span title={process.command}>{process.command}</span>
                <button
                  className="quiet"
                  disabled={
                    process.state !== "running" || stopping.has(process.id)
                  }
                  onClick={() => void stop(process.id)}
                >
                  {stopping.has(process.id) ? "Parando…" : "■ Parar"}
                </button>
                <button
                  className="quiet"
                  disabled={!url}
                  onClick={() => setPreview((old) => !old)}
                >
                  {preview ? "Ver logs" : "Abrir Preview"}
                </button>
                <button
                  className="quiet"
                  disabled={!url}
                  onClick={() => {
                    if (url)
                      void window.aiOffice.processes
                        .openExternal(url)
                        .catch((e) => setError(String(e)));
                  }}
                >
                  Abrir externo ↗
                </button>
              </div>
              {preview && url ? (
                <div className="preview-panel">
                  <div className="preview-address">
                    <span>{url}</span>
                    <button
                      className="quiet"
                      onClick={() => setReload((n) => n + 1)}
                    >
                      Recarregar ↻
                    </button>
                  </div>
                  <iframe
                    key={`${process.id}:${reload}`}
                    src={url}
                    title={`Preview de ${project?.name ?? process.command}`}
                    sandbox="allow-scripts allow-forms allow-same-origin"
                  />
                </div>
              ) : (
                <div
                  className="terminal"
                  role="log"
                  aria-label="Saída do processo"
                  onScroll={(e) => {
                    const node = e.currentTarget;
                    follow.current =
                      node.scrollHeight - node.scrollTop - node.clientHeight <
                      60;
                  }}
                >
                  {!logs[process.id]?.length && (
                    <p className="terminal-note">
                      Aguardando saída. Os logs são capturados enquanto o
                      aplicativo está aberto.
                    </p>
                  )}
                  {(logs[process.id] ?? []).map((line, index) => (
                    <span className={line.stream} key={index}>
                      {line.data.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")}
                    </span>
                  ))}
                  <div ref={end} />
                </div>
              )}
            </>
          ) : (
            <div className="empty-state">
              <span>❯</span>
              <h3>Pronto para executar</h3>
              <p>
                Inicie um comando para acompanhar stdout, stderr e o preview
                local.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
