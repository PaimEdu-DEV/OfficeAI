import fs from 'node:fs';
import path from 'node:path';
import { bus } from './bus';

// Observa a caixa de entrada da ponte existente (Codex -> Claude, escrita por bridge/ask-claude.ps1).
// A direcao Claude -> Codex e capturada pelo adaptador do Codex no rollout da sessao.
export const BRIDGE_DIR = process.env.AI_OFFICE_BRIDGE_DIR ?? path.resolve(process.cwd(), '..', 'bridge');

export function watchBridgeInbox() {
  const inbox = path.join(BRIDGE_DIR, 'inbox.log');
  let offset = fs.existsSync(inbox) ? fs.statSync(inbox).size : 0;
  const timer = setInterval(() => {
    if (!fs.existsSync(inbox)) return;
    const size = fs.statSync(inbox).size;
    if (size < offset) offset = 0;
    if (size === offset) return;
    const text = fs.readFileSync(inbox).subarray(offset, size).toString('utf8');
    offset = size;
    for (const line of text.split('\n').filter(Boolean)) {
      const m = /^\[Codex (\d\d:\d\d:\d\d)\]: (.*)$/.exec(line);
      if (!m) continue;
      bus.bridgeMessage({ id: crypto.randomUUID(), ts: Date.now(), from: 'codex', to: 'claude', text: m[2] });
    }
  }, 1000);
  return () => clearInterval(timer);
}
