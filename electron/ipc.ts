import { app, dialog, ipcMain, shell, type BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { AgentId, Meeting } from '../src/shared/types';
import { Meetings } from './meetings';
import { startOfficeBridge } from './officeBridge';
import { ClaudeAdapter } from './adapters/claude';
import { CodexAdapter } from './adapters/codex';
import { watchBridgeInbox } from './bridge';
import { bus } from './bus';
import { processes } from './processes';
import * as projects from './projects';

export function registerIpc(getWin: () => BrowserWindow | null) {
  const codex = new CodexAdapter();
  const claude = new ClaudeAdapter((agentId, task, cwd, projectId) => {
    if (agentId !== 'codex') throw new Error(`Delegacao para ${agentId} nao suportada.`);
    return codex.delegate('Claude', task, cwd, projectId);
  });
  void claude.init();
  codex.init();
  // A ponte de desenvolvimento (terminal) so aparece no escritorio quando pedida explicitamente.
  const stopBridge = process.env.AI_OFFICE_SHOW_DEV_BRIDGE === '1' ? watchBridgeInbox() : () => undefined;
  const stopOfficeBridge = startOfficeBridge((text) =>
    claude.ask(`[Codex, pelo AI Office]: ${text}`, defaultCwd, 'bridge:codex'));

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
    if (agentId === 'codex') return codex.send(text, cwdFor(projectId), projectId);
    throw new Error(`Agente desconhecido: ${agentId}`);
  };

  ipcMain.handle('agents:list', () => bus.listAgents());
  ipcMain.handle('agents:send', (_, agentId: AgentId, text: string, projectId?: string) => sendToAgent(agentId, text, projectId));
  ipcMain.handle('agents:interrupt', (_, agentId: AgentId) => {
    if (agentId === 'claude') return claude.interrupt();
    if (agentId === 'codex') return codex.interrupt();
    throw new Error(`Agente desconhecido: ${agentId}`);
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
    // Testes automatizados locais podem pular o dialogo definindo AI_OFFICE_E2E_AUTOCONFIRM=1.
    const { response } = process.env.AI_OFFICE_E2E_AUTOCONFIRM === '1'
      ? { response: 0 }
      : win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts);
    if (response !== 0) throw new Error('Execucao cancelada pelo usuario.');
    return processes.start(projectId, command);
  });
  ipcMain.handle('processes:stop', (_, id: string) => processes.stop(id));
  ipcMain.handle('processes:openExternal', (_, url: string) => {
    if (!/^https?:\/\//.test(url)) throw new Error('URL invalida.');
    return shell.openExternal(url);
  });

  ipcMain.handle('bridge:timeline', () => bus.bridgeTimeline());

  const meetings = new Meetings((agentId, prompt, m) => {
    if (agentId === 'claude') return claude.ask(prompt, cwdFor(m.projectId), `meeting:${m.id}`, m.projectId);
    if (agentId === 'codex') return codex.delegate('Reuniao', prompt, cwdFor(m.projectId), m.projectId);
    throw new Error(`Agente desconhecido: ${agentId}`);
  });
  meetings.on('changed', send('meeting-changed'));
  meetings.on('message', send('meeting-message'));
  const summarize = (m: Meeting, transcript: string) =>
    claude.ask(
      `Resuma esta reuniao em portugues: decisoes, tarefas atribuidas (com responsavel) e pontos em aberto.\n\n${transcript}`,
      cwdFor(m.projectId), `meeting:${m.id}:summary`, m.projectId);

  ipcMain.handle('meetings:list', () => meetings.list());
  ipcMain.handle('meetings:messages', (_, id: string) => meetings.messages(id));
  ipcMain.handle('meetings:start', (_, p: Parameters<Meetings['start']>[0]) => meetings.start(p));
  // Rodadas podem levar minutos: responde ja e entrega o progresso por eventos.
  ipcMain.handle('meetings:say', (_, id: string, text: string, to?: AgentId | 'all') => {
    meetings.say(id, text, to).catch((err) => console.error('meeting', err));
  });
  ipcMain.handle('meetings:requestTurn', (_, id: string, agentId: AgentId) => {
    meetings.requestTurn(id, agentId).catch((err) => console.error('meeting', err));
  });
  ipcMain.handle('meetings:setPaused', (_, id: string, paused: boolean) => meetings.setPaused(id, paused));
  ipcMain.handle('meetings:end', (_, id: string, doSummary = true) => meetings.end(id, summarize, doSummary));
  ipcMain.handle('meetings:exportMarkdown', async (_, id: string) => {
    const r = await dialog.showSaveDialog({ defaultPath: `reuniao-${id.slice(0, 8)}.md`, filters: [{ name: 'Markdown', extensions: ['md'] }] });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, meetings.toMarkdown(id));
    return r.filePath;
  });

  app.on('before-quit', () => {
    claude.dispose();
    codex.dispose();
    stopBridge();
    stopOfficeBridge();
    processes.stopAll();
  });
}
