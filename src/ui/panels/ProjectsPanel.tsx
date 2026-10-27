import { useState } from 'react';
import type { AgentInfo, Project } from '../../shared/types';

interface Props {
  agents: AgentInfo[];
  projects: Project[];
  projectId: string;
  onProjects: (list: Project[], selectId?: string) => void;
  onClose: () => void;
}

// Novo projeto (pasta real + agente responsavel + objetivo enviado ao agente) e troca de projeto ativo.
export default function ProjectsPanel({ agents, projects, projectId, onProjects, onClose }: Props) {
  const [name, setName] = useState('');
  const [parentDir, setParentDir] = useState('');
  const [agent, setAgent] = useState('claude');
  const [goal, setGoal] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const api = window.aiOffice;

  async function create() {
    setBusy(true);
    setError('');
    try {
      const p = await api.projects.create({ name: name.trim(), parentDir, agent, goal: goal.trim() || undefined });
      onProjects([...projects, p], p.id);
      setName('');
      setGoal('');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function openExisting() {
    const dir = await api.projects.pickDirectory();
    if (!dir) return;
    const p = await api.projects.open(dir);
    onProjects([...projects.filter((x) => x.id !== p.id), p], p.id);
  }

  return (
    <section className="agent-panel side-panel">
      <div className="panel-heading">
        <h2>Projetos</h2>
        <button className="quiet" onClick={onClose}>×</button>
      </div>
      <div className="panel-body">
        <h3 className="panel-sub">Novo projeto</h3>
        <label className="field">Nome
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="sistema-estoque" />
        </label>
        <label className="field">Pasta
          <span className="row">
            <input value={parentDir} readOnly placeholder="Escolha onde criar" />
            <button className="quiet" onClick={async () => setParentDir((await api.projects.pickDirectory()) ?? parentDir)}>Escolher</button>
          </span>
        </label>
        <label className="field">Agente responsavel
          <select value={agent} onChange={(e) => setAgent(e.target.value)}>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <label className="field">Objetivo (enviado ao agente)
          <textarea rows={4} value={goal} onChange={(e) => setGoal(e.target.value)}
            placeholder="Crie um sistema web de gerenciamento de estoque usando React e Node.js." />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button className="primary" disabled={busy || !name.trim() || !parentDir} onClick={() => void create()}>
          {busy ? 'Criando...' : goal.trim() ? 'Criar e iniciar desenvolvimento' : 'Criar projeto'}
        </button>

        <h3 className="panel-sub">Projetos</h3>
        <button className="quiet" onClick={() => void openExisting()}>Abrir pasta existente ↗</button>
        <ul className="item-list">
          {projects.map((p) => (
            <li key={p.id} className={p.id === projectId ? 'active' : ''}>
              <button onClick={() => onProjects(projects, p.id)}>
                <strong>{p.name}</strong>
                <small>{p.path}</small>
              </button>
            </li>
          ))}
          {!projects.length && <li className="muted">Nenhum projeto ainda.</li>}
        </ul>
      </div>
    </section>
  );
}
