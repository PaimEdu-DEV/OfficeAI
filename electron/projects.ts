import fs from 'node:fs';
import path from 'node:path';
import type { AgentId, FileEntry, Project } from '../src/shared/types';
import { readJson, writeJson } from './store';

const IGNORED = new Set(['node_modules', '.git', 'dist', 'dist-electron', '.next', '__pycache__']);

let projects = readJson<Project[]>('projects.json', []);
const save = () => writeJson('projects.json', projects);

export const listProjects = () => projects;

export function getProject(id: string) {
  const p = projects.find((x) => x.id === id);
  if (!p) throw new Error(`Projeto ${id} nao encontrado.`);
  return p;
}

export function createProject(name: string, parentDir: string, agent: AgentId, goal?: string): Project {
  if (!/^[\w.\- ]+$/.test(name)) throw new Error('Nome de projeto invalido.');
  const dir = path.join(parentDir, name);
  if (fs.existsSync(dir) && fs.readdirSync(dir).length) throw new Error('A pasta ja existe e nao esta vazia.');
  fs.mkdirSync(dir, { recursive: true });
  return register(dir, [agent], goal);
}

export function openProject(dir: string): Project {
  if (!fs.statSync(dir).isDirectory()) throw new Error('Pasta invalida.');
  return projects.find((p) => path.resolve(p.path) === path.resolve(dir)) ?? register(dir, ['claude', 'codex']);
}

function register(dir: string, agents: AgentId[], goal?: string): Project {
  const p: Project = { id: crypto.randomUUID(), name: path.basename(dir), path: dir, agents, goal, createdAt: Date.now() };
  projects = [...projects, p];
  save();
  return p;
}

// Resolve um caminho relativo garantindo que ele fique dentro da pasta do projeto.
export function resolveInProject(projectId: string, rel = '.') {
  const root = path.resolve(getProject(projectId).path);
  const full = path.resolve(root, rel);
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error('Caminho fora do projeto.');
  return full;
}

export function listDir(projectId: string, rel = '.'): FileEntry[] {
  const root = path.resolve(getProject(projectId).path);
  const dir = resolveInProject(projectId, rel);
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => !IGNORED.has(e.name))
    .map((e) => ({ name: e.name, dir: e.isDirectory(), path: path.relative(root, path.join(dir, e.name)) }))
    .sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));
}

export function readFile(projectId: string, rel: string) {
  const file = resolveInProject(projectId, rel);
  if (fs.statSync(file).size > 2_000_000) throw new Error('Arquivo grande demais para o editor.');
  return fs.readFileSync(file, 'utf8');
}

export function writeFile(projectId: string, rel: string, content: string) {
  fs.writeFileSync(resolveInProject(projectId, rel), content);
}
