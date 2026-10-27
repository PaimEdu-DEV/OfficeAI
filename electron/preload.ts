import { contextBridge, ipcRenderer } from 'electron';
import type { AiOfficeApi } from '../src/shared/types';

const call = (ch: string) => (...args: unknown[]) => ipcRenderer.invoke(ch, ...args);

const api: AiOfficeApi = {
  agents: {
    list: call('agents:list'),
    send: call('agents:send'),
    interrupt: call('agents:interrupt'),
    respondApproval: call('agents:respondApproval'),
    history: call('agents:history'),
  } as AiOfficeApi['agents'],
  projects: {
    list: call('projects:list'),
    create: call('projects:create'),
    open: call('projects:open'),
    pickDirectory: call('projects:pickDirectory'),
  } as AiOfficeApi['projects'],
  fs: {
    list: call('fs:list'),
    read: call('fs:read'),
    write: call('fs:write'),
  } as AiOfficeApi['fs'],
  processes: {
    list: call('processes:list'),
    start: call('processes:start'),
    stop: call('processes:stop'),
    openExternal: call('processes:openExternal'),
  } as AiOfficeApi['processes'],
  bridge: {
    timeline: call('bridge:timeline'),
  } as AiOfficeApi['bridge'],
  on(channel: string, cb: (payload: any) => void) {
    const listener = (_: unknown, payload: unknown) => cb(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
} as AiOfficeApi;

contextBridge.exposeInMainWorld('aiOffice', api);
