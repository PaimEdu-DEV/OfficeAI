import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { AgentEvent, AgentInfo, FileEntry } from "../shared/types";
import { statusLabels } from "../office/OfficeScene";
const FileEditor = lazy(() => import("./FileEditor"));
export default function AgentPanel({
  agent,
  projectId,
  onClose,
}: {
  agent: AgentInfo;
  projectId: string;
  onClose: () => void;
}) {
  const [events, setEvents] = useState<AgentEvent[]>([]),
    [input, setInput] = useState(""),
    [error, setError] = useState(""),
    [sending, setSending] = useState(false),
    [tab, setTab] = useState("chat"),
    [approvals, setApprovals] = useState<Record<string, string>>({}),
    [files, setFiles] = useState<FileEntry[]>([]),
    [directory, setDirectory] = useState(""),
    [file, setFile] = useState(""),
    [loading, setLoading] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const api = window.aiOffice;
    if (!api) return;
    let live = true,
      loaded = false;
    const buffer: AgentEvent[] = [];
    const off = api.on("agent-event", (e) => {
      if (
        e.agentId !== agent.id ||
        (projectId && e.projectId && e.projectId !== projectId)
      )
        return;
      if (!loaded) buffer.push(e);
      else setEvents((old) => [...old, e]);
    });
    void api.agents
      .history(agent.id, projectId || undefined)
      .then((history) => {
        if (!live) return;
        const seen = new Set(history.map((e) => JSON.stringify(e)));
        setEvents([
          ...history,
          ...buffer.filter((e) => !seen.has(JSON.stringify(e))),
        ]);
        loaded = true;
      })
      .catch((e) => {
        if (live) {
          setError(String(e));
          setEvents(buffer);
          loaded = true;
        }
      });
    return () => {
      live = false;
      off();
    };
  }, [agent.id, projectId]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [events]);
  useEffect(() => {
    if (!projectId || !window.aiOffice || tab !== "files") return;
    let live = true;
    setLoading(true);
    setFiles([]);
    void window.aiOffice.fs
      .list(projectId, directory)
      .then((list) => {
        if (live)
          setFiles(
            list.sort(
              (a, b) =>
                Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name),
            ),
          );
      })
      .catch((e) => {
        if (live) setError(String(e));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [directory, projectId, tab]);
  async function send() {
    if (!input.trim() || sending || !window.aiOffice) return;
    setSending(true);
    setError("");
    try {
      await window.aiOffice.agents.send(
        agent.id,
        input.trim(),
        projectId || undefined,
      );
      setInput("");
    } catch (e) {
      setError(String(e));
    } finally {
      setSending(false);
    }
  }
  async function approve(id: string, approved: boolean) {
    setApprovals((old) => ({ ...old, [id]: "Enviando…" }));
    try {
      await window.aiOffice.agents.respondApproval(agent.id, id, approved);
      setApprovals((old) => ({
        ...old,
        [id]: approved ? "Aprovado" : "Negado",
      }));
    } catch (e) {
      setError(String(e));
      setApprovals((old) => {
        const next = { ...old };
        delete next[id];
        return next;
      });
    }
  }
  const rows: {
    key: string;
    type: string;
    text: string;
    event?: AgentEvent;
  }[] = [];
  const messages = new Map<string, number>();
  for (const e of events) {
    if (e.kind === "message" || e.kind === "message_delta") {
      const i = messages.get(e.messageId);
      if (i !== undefined)
        rows[i].text = e.kind === "message" ? e.text : rows[i].text + e.text;
      else {
        messages.set(e.messageId, rows.length);
        rows.push({ key: e.messageId, type: "assistant", text: e.text });
      }
    } else if (e.kind === "user_message")
      rows.push({ key: `user-${rows.length}`, type: "user", text: e.text });
    else if (e.kind === "tool_start")
      rows.push({
        key: `tool-${e.toolId}`,
        type: "tool",
        text: `${e.tool} · ${e.summary}`,
        event: e,
      });
    else if (e.kind === "tool_end") {
      const start = rows.find((r) => r.key === `tool-${e.toolId}`);
      if (start) {
        start.text += `\n${e.ok ? "✓ Concluído" : "✕ Falhou"}${e.output ? `\n${e.output}` : ""}`;
        start.event = e;
      } else
        rows.push({
          key: `end-${rows.length}`,
          type: "tool",
          text: `${e.ok ? "✓ Concluído" : "✕ Falhou"} ${e.output ?? ""}`,
        });
    } else if (e.kind === "approval_request")
      rows.push({
        key: `approval-${e.requestId}`,
        type: "approval",
        text: e.summary,
        event: e,
      });
    else if (e.kind === "error")
      rows.push({
        key: `error-${rows.length}`,
        type: "error",
        text: e.message,
      });
    else if (e.kind === "file_changed")
      rows.push({
        key: `file-${rows.length}`,
        type: "file",
        text: `${e.change} · ${e.path}`,
        event: e,
      });
  }
  return (
    <section className="agent-panel">
      <div className="panel-heading">
        <span className={`avatar ${agent.id}`}>{agent.name[0]}</span>
        <div>
          <h2>{agent.name}</h2>
          <span className={`status ${agent.status}`}>
            ● {statusLabels[agent.status]}
          </span>
        </div>
        <button
          className="quiet close"
          aria-label="Fechar painel"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="tabs">
        <button
          className={tab === "chat" ? "active" : ""}
          onClick={() => setTab("chat")}
        >
          Conversa
        </button>
        <button
          className={tab === "files" ? "active" : ""}
          onClick={() => setTab("files")}
        >
          Arquivos & IDE
        </button>
      </div>
      {error && (
        <div className="panel-error" role="alert">
          {error}
        </div>
      )}
      {agent.unavailable && (
        <div className="panel-error">{agent.unavailable}</div>
      )}
      {tab === "chat" ? (
        <>
          <div className="conversation" aria-live="polite">
            {!rows.length && (
              <div className="empty-state">
                <span>✳</span>
                <h3>Vamos construir algo?</h3>
                <p>
                  {agent.status === "disconnected"
                    ? "Agente desconectado. As mensagens aparecerão quando a conexão estiver disponível."
                    : "Envie uma mensagem para começar. O histórico e a atividade real aparecem aqui."}
                </p>
              </div>
            )}
            {rows.map((row) => (
              <article key={row.key} className={`message ${row.type}`}>
                <span className="message-label">
                  {row.type === "user"
                    ? "VOCÊ"
                    : row.type === "assistant"
                      ? agent.name.toUpperCase()
                      : row.type === "approval"
                        ? "APROVAÇÃO NECESSÁRIA"
                        : "ATIVIDADE"}
                </span>
                {row.type === "tool" ? (
                  <details>
                    <summary>{row.text.split("\n")[0]}</summary>
                    <pre>
                      {row.text.split("\n").slice(1).join("\n") ||
                        "Em execução…"}
                    </pre>
                  </details>
                ) : (
                  <div className="message-text">{row.text}</div>
                )}
                {row.event?.kind === "approval_request" && (
                  <>
                    <p>{row.event.detail}</p>
                    <div className="approval-actions">
                      {approvals[row.event.requestId] ? (
                        <span>{approvals[row.event.requestId]}</span>
                      ) : (
                        <>
                          <button
                            className="primary"
                            onClick={() => {
                              if (row.event?.kind === "approval_request")
                                void approve(row.event.requestId, true);
                            }}
                          >
                            Aprovar
                          </button>
                          <button
                            className="quiet"
                            onClick={() => {
                              if (row.event?.kind === "approval_request")
                                void approve(row.event.requestId, false);
                            }}
                          >
                            Negar
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
                {row.event?.kind === "file_changed" && (
                  <button
                    className="quiet"
                    onClick={() => {
                      if (row.event?.kind === "file_changed") {
                        setFile(row.event.path);
                        setTab("files");
                      }
                    }}
                  >
                    Abrir arquivo ↗
                  </button>
                )}
              </article>
            ))}
            <div ref={bottom} />
          </div>
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <textarea
              aria-label={`Mensagem para ${agent.name}`}
              placeholder={`Converse com ${agent.name}…`}
              value={input}
              disabled={!window.aiOffice || agent.status === "disconnected"}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <div>
              <span>Enter envia · Shift + Enter nova linha</span>
              <button
                className="quiet"
                type="button"
                disabled={
                  !window.aiOffice || !agent.capabilities.includes("interrupt")
                }
                onClick={() =>
                  void window.aiOffice.agents
                    .interrupt(agent.id)
                    .catch((e) => setError(String(e)))
                }
              >
                Parar
              </button>
              <button
                className="primary"
                disabled={
                  sending ||
                  !input.trim() ||
                  !window.aiOffice ||
                  agent.status === "disconnected"
                }
              >
                {sending ? "Enviando…" : "Enviar ↑"}
              </button>
            </div>
          </form>
        </>
      ) : (
        <div className="files-panel">
          {!projectId ? (
            <div className="empty-state">
              <h3>Abra um projeto</h3>
              <p>
                Os arquivos são carregados diretamente do workspace pela ponte.
              </p>
            </div>
          ) : (
            <>
              <div className="file-browser">
                <div className="file-path">
                  <button
                    className="quiet"
                    disabled={!directory}
                    onClick={() =>
                      setDirectory(
                        directory
                          .replace(/\\/g, "/")
                          .split("/")
                          .slice(0, -1)
                          .join("/"),
                      )
                    }
                  >
                    ↑
                  </button>
                  <span>{directory || "/"}</span>
                </div>
                {loading && <p>Carregando…</p>}
                {files.map((entry) => (
                  <button
                    className={`file-entry ${file === entry.path ? "active" : ""}`}
                    key={entry.path}
                    onClick={() =>
                      entry.dir ? setDirectory(entry.path) : setFile(entry.path)
                    }
                  >
                    {entry.dir ? "▸" : "◇"} {entry.name}
                  </button>
                ))}
              </div>
              {file ? (
                <Suspense fallback={<p>Carregando editor…</p>}>
                  <FileEditor projectId={projectId} path={file} />
                </Suspense>
              ) : (
                <div className="editor-empty">
                  Selecione um arquivo para visualizar no editor.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
