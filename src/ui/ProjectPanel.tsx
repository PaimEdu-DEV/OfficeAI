import { lazy, Suspense, useEffect, useState } from "react";
import type { AgentInfo, FileEntry, Project } from "../shared/types";
const FileEditor = lazy(() => import("./FileEditor"));

function Tree({
  projectId,
  directory = "",
  selected,
  onSelect,
  revision,
}: {
  projectId: string;
  directory?: string;
  selected: string;
  onSelect: (path: string) => void;
  revision: number;
}) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    void window.aiOffice.fs
      .list(projectId, directory)
      .then((list) => {
        if (live) setEntries(list);
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
  }, [projectId, directory, revision]);
  return (
    <ul className="file-tree" aria-label={directory || "Arquivos do projeto"}>
      {error && (
        <li className="panel-error" role="alert">
          {error}
        </li>
      )}
      {loading && <li className="tree-note">Carregando…</li>}
      {!loading && !entries.length && !error && (
        <li className="tree-note">Pasta vazia</li>
      )}
      {entries.map((entry) => (
        <li key={entry.path}>
          <button
            className={`file-entry ${selected === entry.path ? "active" : ""}`}
            aria-expanded={entry.dir ? expanded.has(entry.path) : undefined}
            onClick={() =>
              entry.dir
                ? setExpanded((old) => {
                    const next = new Set(old);
                    if (next.has(entry.path)) next.delete(entry.path);
                    else next.add(entry.path);
                    return next;
                  })
                : onSelect(entry.path)
            }
          >
            <span>
              {entry.dir ? (expanded.has(entry.path) ? "▾" : "▸") : "◇"}
            </span>{" "}
            {entry.name}
          </button>
          {entry.dir && expanded.has(entry.path) && (
            <Tree
              projectId={projectId}
              directory={entry.path}
              selected={selected}
              onSelect={onSelect}
              revision={revision}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

export default function ProjectPanel({
  projects,
  projectId,
  agents,
  onProject,
  onSelect,
}: {
  projects: Project[];
  projectId: string;
  agents: AgentInfo[];
  onProject: (p: Project) => void;
  onSelect: (id: string) => void;
}) {
  const [creating, setCreating] = useState(false),
    [name, setName] = useState(""),
    [parentDir, setParentDir] = useState(""),
    [agent, setAgent] = useState(agents[0]?.id ?? "claude"),
    [goal, setGoal] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState(""),
    [revision, setRevision] = useState(0);
  const project = projects.find((p) => p.id === projectId);
  useEffect(() => {
    setSelected("");
    setRevision((n) => n + 1);
  }, [projectId]);
  useEffect(() => {
    if (!window.aiOffice) return;
    return window.aiOffice.on("agent-event", (e) => {
      if (e.kind === "file_changed" && e.projectId === projectId)
        setRevision((n) => n + 1);
    });
  }, [projectId]);
  async function pick(forCreation: boolean) {
    setBusy(true);
    setError("");
    try {
      const dir = await window.aiOffice.projects.pickDirectory();
      if (dir) {
        if (forCreation) setParentDir(dir);
        else onProject(await window.aiOffice.projects.open(dir));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    if (!name.trim() || !parentDir || busy) return;
    setBusy(true);
    setError("");
    try {
      const p = await window.aiOffice.projects.create({
        name: name.trim(),
        parentDir,
        agent,
        goal: goal.trim() || undefined,
      });
      onProject(p);
      setCreating(false);
      setName("");
      setGoal("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="project-workbench">
      <aside className="project-list">
        <div className="section-label">
          PROJETOS <span>{projects.length}</span>
        </div>
        <div className="project-actions">
          <button
            className="primary"
            disabled={!window.aiOffice || busy}
            onClick={() => setCreating(true)}
          >
            ＋ Novo projeto
          </button>
          <button
            className="quiet"
            disabled={!window.aiOffice || busy}
            onClick={() => void pick(false)}
          >
            Abrir existente ↗
          </button>
        </div>
        {projects.map((p) => (
          <button
            className={`project-item ${p.id === projectId ? "active" : ""}`}
            key={p.id}
            onClick={() => {
              onSelect(p.id);
              setCreating(false);
            }}
          >
            <strong>◇ {p.name}</strong>
            <small>{p.path}</small>
          </button>
        ))}
        {!projects.length && (
          <p className="tree-note">
            {window.aiOffice
              ? "Crie um projeto ou abra uma pasta existente."
              : "Desconectado. Conecte a ponte para acessar projetos."}
          </p>
        )}
      </aside>
      <section className="project-detail">
        {error && (
          <div className="panel-error" role="alert">
            {error}
          </div>
        )}
        {creating ? (
          <form
            className="project-form"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <span className="eyebrow">UM NOVO COMEÇO</span>
            <h2>Novo projeto</h2>
            <p>Defina o espaço e escolha quem vai construir com você.</p>
            <label>
              Nome do projeto
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="meu-projeto"
                disabled={busy}
              />
            </label>
            <label>
              Pasta de destino
              <div className="directory-picker">
                <input
                  readOnly
                  required
                  value={parentDir}
                  placeholder="Selecione a pasta onde criar o projeto"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void pick(true)}
                >
                  Escolher…
                </button>
              </div>
            </label>
            <label>
              Agente responsável
              <select
                value={agent}
                onChange={(e) => setAgent(e.target.value)}
                disabled={busy}
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Objetivo <span className="muted">opcional</span>
              <textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="O que vamos construir?"
                disabled={busy}
              />
            </label>
            <div className="form-actions">
              <button
                type="button"
                className="quiet"
                disabled={busy}
                onClick={() => setCreating(false)}
              >
                Cancelar
              </button>
              <button
                className="primary"
                disabled={
                  busy || !name.trim() || !parentDir || !window.aiOffice
                }
              >
                {busy ? "Criando…" : "Criar projeto →"}
              </button>
            </div>
          </form>
        ) : project ? (
          <>
            <div className="project-summary">
              <div>
                <h2>{project.name}</h2>
                <p>{project.path}</p>
                {project.goal && <p className="project-goal">{project.goal}</p>}
              </div>
              <button
                className="quiet"
                onClick={() => setRevision((n) => n + 1)}
              >
                Atualizar arquivos ↻
              </button>
            </div>
            <div className="project-files">
              <aside className="project-tree">
                <div className="section-label">EXPLORADOR</div>
                <Tree
                  key={project.id}
                  projectId={project.id}
                  selected={selected}
                  onSelect={setSelected}
                  revision={revision}
                />
              </aside>
              {selected ? (
                <Suspense fallback={<p>Carregando editor…</p>}>
                  <FileEditor
                    key={`${project.id}:${selected}`}
                    projectId={project.id}
                    path={selected}
                  />
                </Suspense>
              ) : (
                <div className="editor-empty">
                  ◇ Selecione um arquivo na árvore para abrir no Monaco.
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="empty-state">
            <span>◇</span>
            <h3>Um lugar para cada projeto</h3>
            <p>
              Crie um projeto ou abra uma pasta para explorar seus arquivos.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
