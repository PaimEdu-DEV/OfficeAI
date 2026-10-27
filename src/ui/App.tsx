import { useEffect, useState } from "react";
import type { AgentInfo, Project } from "../shared/types";
import Office from "../office/Office";
import { statusLabels } from "../office/OfficeScene";
import AgentPanel from "./AgentPanel";
import ProjectPanel from "./ProjectPanel";
import ExecutionPanel from "./ExecutionPanel";
import MeetingPanel from "./panels/MeetingPanel";
import FloatingWindow from "./FloatingWindow";
import "./styles.css";
import "./panels/panels.css";
import "./game.css";
const offline: AgentInfo[] = ["claude", "codex"].map((id) => ({
  id,
  name: id === "claude" ? "Claude" : "Codex",
  status: "disconnected",
  capabilities: [],
}));
type WindowId = "agents" | "projects" | "execution" | "meeting" | "chat";
function DockIcon({ kind }: { kind: WindowId }) {
  const paths: Record<WindowId, string> = {
    agents: "M4 4h6v7H4z M14 4h6v7h-6z M2 14h10v7H2z M14 14h8v7h-8z",
    projects: "M2 7h7V4h6v3h7v14H2z M5 11h14",
    execution: "M5 6l6 6-6 6 M13 19h7",
    meeting: "M3 7h18v10H3z M6 2v3 M18 2v3 M6 19v3 M18 19v3",
    chat: "M3 3h18v14h-9l-6 5v-5H3z M7 8h10 M7 12h7",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      width="27"
      height="27"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="miter"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <path d={paths[kind]} />
    </svg>
  );
}
export default function App() {
  const [agents, setAgents] = useState<AgentInfo[]>(offline),
    [projects, setProjects] = useState<Project[]>([]),
    [projectId, setProjectId] = useState(""),
    [selected, setSelected] = useState("claude"),
    [error, setError] = useState("");
  const [open, setOpen] = useState<Record<WindowId, boolean>>({
    agents: false,
    projects: false,
    execution: false,
    meeting: false,
    chat: false,
  });
  const [layers, setLayers] = useState<Record<WindowId, number>>({
    agents: 20,
    projects: 21,
    execution: 22,
    meeting: 23,
    chat: 24,
  });
  const front = (id: WindowId) =>
    setLayers((old) => ({ ...old, [id]: Math.max(...Object.values(old)) + 1 }));
  const show = (id: WindowId) => {
    setOpen((old) => ({ ...old, [id]: true }));
    front(id);
  };
  const close = (id: WindowId) => setOpen((old) => ({ ...old, [id]: false }));
  const toggle = (id: WindowId) => {
    if (open[id]) close(id);
    else show(id);
  };
  const chat = (id: string) => {
    setSelected(id);
    show("chat");
  };
  useEffect(() => {
    const api = window.aiOffice;
    if (!api) return;
    let live = true,
      received = false;
    const off = api.on("agents-changed", (list) => {
      received = true;
      setAgents(list);
    });
    const eventOff = api.on("agent-event", (e) => {
      if (e.kind === "status")
        setAgents((old) =>
          old.map((a) => (a.id === e.agentId ? { ...a, status: e.status } : a)),
        );
      if (e.kind === "approval_request") chat(e.agentId);
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
      eventOff();
    };
  }, []);
  const register = (p: Project) => {
    setProjects((old) => [...old.filter((item) => item.id !== p.id), p]);
    setProjectId(p.id);
  };
  const agent = agents.find((a) => a.id === selected) ?? agents[0];
  const windowProps = (id: WindowId) => ({
    id,
    open: open[id],
    onClose: () => close(id),
    onFocus: () => front(id),
    z: layers[id],
  });
  return (
    <main className="game-app">
      <Office
        agents={agents}
        onInteract={(e) =>
          e.kind === "meeting" ? show("meeting") : chat(e.agentId ?? selected)
        }
      />
      <div className="world-badge">
        <span className="world-logo">◈</span>
        <span>
          AI OFFICE
          <small>
            <i className={window.aiOffice ? "connected" : ""} />
            {window.aiOffice ? "Escritório conectado" : "Desconectado"}
          </small>
        </span>
      </div>
      {error && (
        <div className="game-error" role="alert">
          {error}
          <button aria-label="Fechar erro" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}
      <FloatingWindow
        {...windowProps("agents")}
        title="Seu time"
        color="coral"
        width={340}
        height={400}
      >
        <div className="agent-directory">
          <p>Escolha um agente para conversar ou encontre-o pelo escritório.</p>
          {agents.map((a) => (
            <button
              className="agent-card"
              key={a.id}
              onClick={() => chat(a.id)}
            >
              <span className={`avatar ${a.id}`}>{a.name[0]}</span>
              <span className="agent-copy">
                <strong>{a.name}</strong>
                <span className={`status ${a.status}`}>
                  ● {statusLabels[a.status]}
                </span>
              </span>
              <span>→</span>
            </button>
          ))}
          <p className="offline-note">
            {window.aiOffice
              ? "Atividade sincronizada com os agentes reais."
              : "A ponte não está disponível nesta janela."}
          </p>
        </div>
      </FloatingWindow>
      <FloatingWindow
        {...windowProps("projects")}
        title="Projetos & arquivos"
        color="green"
        width={1030}
        height={650}
      >
        <div className="project-select">
          <label>
            Projeto ativo{" "}
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">Selecione um projeto</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <ProjectPanel
          projects={projects}
          projectId={projectId}
          agents={agents}
          onProject={register}
          onSelect={setProjectId}
        />
      </FloatingWindow>
      <FloatingWindow
        {...windowProps("execution")}
        title="Execução & preview"
        color="blue"
        width={1030}
        height={650}
      >
        <div className="project-select">
          <label>
            Executar no projeto{" "}
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">Selecione um projeto</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <ExecutionPanel
          projectId={projectId}
          projects={projects}
          visible={open.execution}
        />
      </FloatingWindow>
      <FloatingWindow
        {...windowProps("meeting")}
        title="Sala de reunião"
        color="gold"
        width={760}
        height={650}
      >
        {window.aiOffice ? (
          <MeetingPanel
            agents={agents}
            projectId={projectId}
            onClose={() => close("meeting")}
          />
        ) : (
          <div className="empty-state">
            Desconectado. Conecte a ponte para iniciar uma reunião real.
          </div>
        )}
      </FloatingWindow>
      <FloatingWindow
        {...windowProps("chat")}
        title={agent ? `Conversa com ${agent.name}` : "Conversa"}
        color="blue"
        width={460}
        height={620}
      >
        {agent ? (
          <>
            <div className="chat-switcher">
              {agents.map((a) => (
                <button
                  key={a.id}
                  className={selected === a.id ? "active" : ""}
                  onClick={() => setSelected(a.id)}
                >
                  {a.name}
                </button>
              ))}
            </div>
            <AgentPanel
              key={`${agent.id}:${projectId}`}
              agent={agent}
              projectId={projectId}
              onClose={() => close("chat")}
            />
          </>
        ) : (
          <div className="empty-state">Nenhum agente conectado.</div>
        )}
      </FloatingWindow>
      <nav className="game-dock" aria-label="Ferramentas do escritório">
        {(
          [
            ["agents", "Agentes"],
            ["projects", "Projetos"],
            ["execution", "Execução"],
            ["meeting", "Reunião"],
            ["chat", "Chat"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            className={`dock-item dock-${id} ${open[id] ? "active" : ""}`}
            aria-pressed={open[id]}
            onClick={() => toggle(id)}
          >
            <DockIcon kind={id} />
            <span>{label}</span>
            {id === "agents" && (
              <b>{agents.filter((a) => a.status !== "disconnected").length}</b>
            )}
          </button>
        ))}
        <div className="dock-divider" />
        <span
          className="dock-project"
          title={projects.find((p) => p.id === projectId)?.path}
        >
          <small>WORKSPACE</small>
          {projects.find((p) => p.id === projectId)?.name ?? "Sem projeto"}
        </span>
      </nav>
    </main>
  );
}
