import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { BRIDGE_DIR } from './bridge';
import { bus } from './bus';

// Canal local para o Codex falar com o Claude DENTRO do AI Office.
// Escuta so em 127.0.0.1 e exige o token gravado em bridge/office.json (lido por ask-office-claude.ps1).
export function startOfficeBridge(askClaude: (text: string) => Promise<string>) {
  const token = randomBytes(24).toString('hex');
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/ask' || req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(403).end();
      return;
    }
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      try {
        const { text } = JSON.parse(body) as { text: string };
        bus.bridgeMessage({ id: crypto.randomUUID(), ts: Date.now(), from: 'codex', to: 'claude', text });
        const reply = await askClaude(text);
        bus.bridgeMessage({ id: crypto.randomUUID(), ts: Date.now(), from: 'claude', to: 'codex', text: reply });
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify({ reply }));
      } catch (err) {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify({ error: String(err) }));
      }
    });
  });
  // Respostas do Claude podem levar minutos.
  server.requestTimeout = 0;
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address() as { port: number };
    fs.writeFileSync(path.join(BRIDGE_DIR, 'office.json'), JSON.stringify({ port, token }));
  });
  return () => {
    server.close();
    fs.rmSync(path.join(BRIDGE_DIR, 'office.json'), { force: true });
  };
}
