import type { BrowserWindow } from 'electron';

// Registro dos handlers IPC. Os modulos (agentes, projetos, processos, ponte) sao ligados aqui.
export function registerIpc(_getWin: () => BrowserWindow | null) {}
