import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

// Persistencia simples em JSON/JSONL no diretorio de dados do app.
// Interface pequena de proposito: pode ser trocada por SQLite sem mexer nos modulos.
const dir = () => {
  const d = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(d, { recursive: true });
  return d;
};

export function readJson<T>(name: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir(), name), 'utf8')) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(name: string, value: unknown) {
  const file = path.join(dir(), name);
  fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 2));
  fs.renameSync(file + '.tmp', file);
}

export function appendLine(name: string, value: unknown) {
  fs.appendFileSync(path.join(dir(), name), JSON.stringify(value) + '\n');
}

export function readLines<T>(name: string, limit = 2000): T[] {
  try {
    const lines = fs.readFileSync(path.join(dir(), name), 'utf8').split('\n').filter(Boolean);
    return lines.slice(-limit).map((l) => JSON.parse(l) as T);
  } catch {
    return [];
  }
}
