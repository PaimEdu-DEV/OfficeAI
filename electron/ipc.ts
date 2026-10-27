import { app, dialog, ipcMain, shell, type BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { AgentId } from '../src/shared/types';
import { ClaudeAdapter } from './adapters/claude';
import { CodexAdapter } from './adapters/codex';
import { watchBridgeInbox } from './bridge';
import { bus } from './bus';
import { processes } from './processes';
import * as projects from './projects';

export function registerIpc(getWin: () => BrowserWindow | null) {
  const claude = new ClaudeAdapter();
  const codex = new CodexAdapter();
  void claude.init();
  codex.init();
  const stopBridge = watchBridgeInbox();

  const send = (channel: string) => (payload: unknown) => getWin()?.webContents.send(channel, payload);
  bus.on('agent-event', send('agent-event'));
  bus.on('agents-changed', send('agents-changed'));
  bus.on('bridge-message', send('bridge-message'));
  processes.on('output', send('process-output'));
  processes.on('changed', send('processes-changed'));

  const defaultCwd = path.join(app.getPath('documents'), 'AI Office');
  fs.mkdirSync(defaultCwd, { recursive: true });
  const cwdFor = (projectId?: string) => (projectId ? projects.getProject(projectId).path : defaultCwd);

  const sendToAgent = async (agentId: AgentId, text: string, projectId?: string) => {
    if (agentId === 'claude') return claude.send(text, cwdFor(projectId), projectId);
    if (agentId === 'codex') return codex.send(text, projectId);
    throw new Error(`Agente desconhecido: ${agentId}`);
  };

  ipcMain.handle('agents:list', () => bus.listAgents());
  ipcMain.handle('agents:send', (_, agentId: AgentId, text: string, projectId?: string) => sendToAgent(agentId, text, projectId));
  ipcMain.handle('agents:interrupt', (_, agentId: AgentId) => {
    if (agentId === 'claude') return claude.interrupt();
    throw new Error('Interromper o Codex por aqui ainda nao e suportado; use Esc no terminal do Codex.');
  });
  ipcMain.handle('agents:respondApproval', (_, agentId: AgentId, requestId: string, approved: boolean) => {
    if (agentId === 'claude') claude.respondApproval(requestId, approved);
  });
  ipcMain.handle('agents:history', (_, agentId: AgentId, projectId?: string) => bus.history(agentId, projectId));

  ipcMain.handle('projects:list', () => projects.listProjects());
  ipcMain.handle('projects:create', async (_, p: { name: string; parentDir: string; agent: AgentId; goal?: string }) => {
    const project = projects.createProject(p.name, p.parentDir, p.agent, p.goal);
    if (p.goal) await sendToAgent(p.agent, `Novo projeto "${project.name}" na pasta ${project.path}. Objetivo: ${p.goal}`, project.id);
    return project;
  });
  ipcMain.handle('projects:open', (_, dir: string) => projects.openProject(dir));
  ipcMain.handle('projects:pickDirectory', async () => {
    const win = getWin();
    const r = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle('fs:list', (_, projectId: string, rel?: string) => projects.listDir(projectId, rel));
  ipcMain.handle('fs:read', (_, projectId: string, rel: string) => projects.readFile(projectId, rel));
  ipcMain.handle('fs:write', (_, projectId: string, rel: string, content: string) => projects.writeFile(projectId, rel, content));

  ipcMain.handle('processes:list', () => processes.list());
  ipcMain.handle('processes:start', async (_, projectId: string, command: string) => {
    // Comando vindo da interface: exige confirmacao nativa do usuario antes de executar.
    const project = projects.getProject(projectId);
    const opts = {
      type: 'question' as const,
      buttons: ['Executar', 'Cancelar'],
      defaultId: 1,
      cancelId: 1,
      message: 'Executar comando no projeto?',
      detail: `${command}\n\nPasta: ${project.path}`,
    };
    const win = getWin();
    const { response } = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts);
    if (response !== 0) throw new Error('Execucao cancelada pelo usuario.');
    return processes.start(projectId, command);
  });
  ipcMain.handle('processes:stop', (_, id: string) => processes.stop(id));
  ipcMain.handle('processes:openExternal', (_, url: string) => {
    if (!/^https?:\/\//.test(url)) throw new Error('URL invalida.');
    return shell.openExternal(url);
  });

  ipcMain.handle('bridge:timeline', () => bus.bridgeTimeline());

  app.on('before-quit', () => {
    claude.dispose();
    codex.dispose();
    stopBridge();
    processes.stopAll();
  });
}
