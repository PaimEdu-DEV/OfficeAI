import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { registerIpc } from './ipc';

let win: BrowserWindow | null = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 960,
    backgroundColor: '#14161c',
    title: 'AI Office',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.removeMenu();
  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else win.loadFile(path.join(__dirname, '../dist/index.html'));

  // Verificacao visual: AI_OFFICE_SCREENSHOT=arquivo.png salva a janela apos o carregamento e encerra.
  const shot = process.env.AI_OFFICE_SCREENSHOT;
  if (shot) {
    win.webContents.on('console-message', (_e, level, message) => level >= 2 && console.error('[renderer]', message));
    win.webContents.once('did-finish-load', () => {
      // AI_OFFICE_EVAL: script executado na interface (usa window.aiOffice real) antes da captura.
      if (process.env.AI_OFFICE_EVAL) void win!.webContents.executeJavaScript(process.env.AI_OFFICE_EVAL).catch((e) => console.error('[eval]', e));
      // AI_OFFICE_SCREENSHOT_EVERY=ms: tambem salva quadros numerados (arquivo-001.png...) ate o fim.
      const every = Number(process.env.AI_OFFICE_SCREENSHOT_EVERY ?? 0);
      if (every > 0) {
        let n = 0;
        setInterval(async () => {
          const file = shot.replace(/\.png$/i, `-${String(++n).padStart(3, '0')}.png`);
          fs.writeFileSync(file, (await win!.webContents.capturePage()).toPNG());
        }, every);
      }
      setTimeout(async () => {
        fs.writeFileSync(shot, (await win!.webContents.capturePage()).toPNG());
        app.quit();
      }, Number(process.env.AI_OFFICE_SCREENSHOT_DELAY ?? 5000));
    });
  }
}

app.whenReady().then(() => {
  registerIpc(() => win);
  createWindow();
});

app.on('window-all-closed', () => app.quit());
