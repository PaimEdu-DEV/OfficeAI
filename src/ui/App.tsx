import { useEffect, useState } from "react";
import type { AgentEvent, AgentInfo, Project } from "../shared/types";
import Office from "../office/Office";
import { statusLabels } from "../office/OfficeScene";
import AgentPanel from "./AgentPanel";
import ProjectPanel from "./ProjectPanel";
import ExecutionPanel from "./ExecutionPanel";
import "./styles.css";
const offline: AgentInfo[] = ["claude", "codex"].map((id) => ({
  id,
  name: id === "claude" ? "Claude" : "Codex",
  status: "disconnected",
  capabilities: [],
}));
export default function App() {
  const [agents, setAgents] = useState<AgentInfo[]>(offline),
    [selected, setSelected] = useState<string>(),
    [projects, setProjects] = useState<Project[]>([]),
    [projectId, setProjectId] = useState(""),
    [error, setError] = useState(""),
    [meeting, setMeeting] = useState(false),
    [tool, setTool] = useState<"projects" | "execution" | undefined>(),
    [count, setCount] = useState(0);
  useEffect(() => {
    const api = window.aiOffice;
    if (!api) return;
    let live = true,
      received = false;
    const off = api.on("agents-changed", (list) => {
      received = true;
      setAgents(list);
    });
    const ev = api.on("agent-event", (e: AgentEvent) => {
      setCount((n) => n + 1);
      if (e.kind === "status")
        setAgents((old) =>
          old.map((a) => (a.id === e.agentId ? { ...a, status: e.status } : a)),
        );
    });
    void api.agents
      .list()
      .then((list) => {
        if (live && !received) setAgents(list);
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    void api.projects
      .list()
      .then((list) => {
        if (live) {
          setProjects(list);
          setProjectId(list[0]?.id ?? "");
        }
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
      off();
      ev();
    };
  }, []);
  async function openProject() {
    try {
      const dir = await window.aiOffice.projects.pickDirectory();
      if (!dir) return;
      const p = await window.aiOffice.projects.open(dir);
      setProjects((old) => [...old.filter((x) => x.id !== p.id), p]);
      setProjectId(p.id);
    } catch (e) {
      setError(String(e));
    }
  }
  const agent = agents.find((a) => a.id === selected);
  const registerProject = (p: Project) => {
    setProjects((old) => [...old.filter((item) => item.id !== p.id), p]);
    setProjectId(p.id);
  };
  return (
    <main className="app">
      <header>
        <div className="brand">
          <span className="brand-mark">◈</span>
          <div>
            <strong>AI OFFICE</strong>
            <small>Seu time. No mesmo espaço.</small>
          </div>
        </div>
        <div className="project-picker">
          <span className="muted">WORKSPACE</span>
          <select
            aria-label="Projeto ativo"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">Nenhum projeto aberto</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            className="quiet"
            disabled={!window.aiOffice}
            onClick={() => void openProject()}
          >
            Abrir pasta ↗
          </button>
          <button
            className={
              tool === "projects" ? "tool-toggle active" : "tool-toggle"
            }
            onClick={() =>
              setTool(tool === "projects" ? undefined : "projects")
            }
          >
            Projetos
          </button>
          <button
            className={
              tool === "execution" ? "tool-toggle active" : "tool-toggle"
            }
            onClick={() =>
              setTool(tool === "execution" ? undefined : "execution")
            }
          >
            Execução
          </button>
        </div>
        <span className="connection">
          <i className={window.aiOffice ? "online" : ""} />
          {window.aiOffice ? "Ponte conectada" : "Desconectado"}
        </span>
      </header>
      {error && (
        <div className="error-banner" role="alert">
          {error}
          <button onClick={() => setError("")}>×</button>
        </div>
      )}
      <div className="workspace">
        <aside className="sidebar">
          <div className="section-label">
            SEU TIME <span>{agents.length.toString().padStart(2, "0")}</span>
          </div>
          <p className="aside-note">
            Um clique para conversar.
            <br />
            Um espaço para construir.
          </p>
          <nav aria-label="Agentes">
            {agents.map((a) => (
              <button
                key={a.id}
                className={`agent-card ${selected === a.id ? "selected" : ""}`}
                onClick={() => {
                  setSelected(a.id);
                  setMeeting(false);
                  setTool(undefined);
                }}
              >
                <span className={`avatar ${a.id}`}>{a.name[0]}</span>
                <span className="agent-copy">
                  <strong>{a.name}</strong>
                  <small>
                    {a.id === "claude"
                      ? "Direção & estratégia"
                      : "Engenharia & execução"}
                  </small>
                  <span className={`status ${a.status}`}>
                    ● {statusLabels[a.status]}
                  </span>
                </span>
                <span className="arrow">↗</span>
              </button>
            ))}
          </nav>
          <div className="future-slot">
            ＋
            <span>
              Espaço para novas ideias
              <small>Salas reservadas para futuros agentes</small>
            </span>
          </div>
          <div className="sidebar-bottom">
            <span className="section-label">ATIVIDADE REAL</span>
            <p>
              {count
                ? `${count} eventos recebidos nesta sessão`
                : "Aguardando atividade dos agentes"}
            </p>
            <span className="live-line">
              ◌ Eventos sincronizados pela ponte
            </span>
          </div>
        </aside>
        <section className="office-area">
          <div className="scene-title">
            <div>
              <span className="eyebrow">ESPAÇO COMPARTILHADO</span>
              <h1>Boas ideias têm um lugar.</h1>
              <p>Explore o escritório e encontre seu próximo passo.</p>
            </div>
            <span className="scene-badge">◈ ISOMETRIC OFFICE</span>
          </div>
          <Office
            agents={agents}
            controlsEnabled={!tool}
            onInteract={(e) => {
              if (e.kind === "meeting") {
                setMeeting(true);
                setSelected(undefined);
              } else {
                setSelected(e.agentId);
                setMeeting(false);
              }
            }}
          />
          <div className="scene-bottom">
            <span>
              <kbd>W</kbd>
              <kbd>A</kbd>
              <kbd>S</kbd>
              <kbd>D</kbd> mover <b>·</b> Clique para navegar <b>·</b>{" "}
              <kbd>E</kbd> interagir
            </span>
            <span>Todos os agentes, no mesmo lugar</span>
          </div>
        </section>
        {agent && (
          <AgentPanel
            key={`${agent.id}:${projectId}`}
            agent={agent}
            projectId={projectId}
            onClose={() => setSelected(undefined)}
          />
        )}
        {meeting && (
          <section className="agent-panel">
            <div className="panel-heading">
              <h2>Sala de reuniões</h2>
              <button className="quiet" onClick={() => setMeeting(false)}>
                ×
              </button>
            </div>
            <div className="empty-state">
              <span>◎</span>
              <h3>Reúna o time</h3>
              <p>
                O contrato atual oferece conversas individuais. Selecione um
                agente para começar.
              </p>
              {agents.map((a) => (
                <button
                  className="primary"
                  key={a.id}
                  onClick={() => {
                    setSelected(a.id);
                    setMeeting(false);
                  }}
                >
                  {a.name} ↗
                </button>
              ))}
            </div>
          </section>
        )}
        <section
          className="tools-workbench"
          hidden={!tool}
          aria-label={
            tool === "projects" ? "Painel de projetos" : "Painel de execução"
          }
        >
          <div className="tools-heading">
            <div className="tabs">
              <button
                className={tool === "projects" ? "active" : ""}
                onClick={() => setTool("projects")}
              >
                ◇ Projetos
              </button>
              <button
                className={tool === "execution" ? "active" : ""}
                onClick={() => setTool("execution")}
              >
                ❯ Execução
              </button>
            </div>
            <button
              className="quiet"
              aria-label="Voltar ao escritório"
              onClick={() => setTool(undefined)}
            >
              Voltar ao escritório ×
            </button>
          </div>
          {tool === "projects" && (
            <ProjectPanel
              projects={projects}
              projectId={projectId}
              agents={agents}
              onProject={registerProject}
              onSelect={setProjectId}
            />
          )}
          <ExecutionPanel
            projectId={projectId}
            projects={projects}
            visible={tool === "execution"}
          />
        </section>
      </div>
      <footer>
        <span>
          AI OFFICE <b>/</b> COLLABORATIVE WORKSPACE
        </span>
        <span>
          {agents.filter((a) => a.status !== "disconnected").length} agentes
          conectados <b>·</b>{" "}
          {projects.find((p) => p.id === projectId)?.path ??
            "Abra um projeto para acessar arquivos"}
        </span>
      </footer>
    </main>
  );
}
