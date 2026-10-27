import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { ManagedProcess } from '../src/shared/types';
import { getProject } from './projects';

const URL_RE = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):\d{2,5}[^\s'"\x1b]*/;

class ProcessManager extends EventEmitter {
  private procs = new Map<string, { info: ManagedProcess; child: ChildProcess }>();

  list() {
    return [...this.procs.values()].map((p) => p.info);
  }

  start(projectId: string, command: string): ManagedProcess {
    const cwd = getProject(projectId).path;
    const child = spawn(command, { cwd, shell: true, windowsHide: true, env: { ...process.env, FORCE_COLOR: '0' } });
    const info: ManagedProcess = { id: crypto.randomUUID(), projectId, command, cwd, pid: child.pid, state: 'running', startedAt: Date.now() };
    this.procs.set(info.id, { info, child });

    const onData = (stream: 'stdout' | 'stderr') => (buf: Buffer) => {
      const data = buf.toString('utf8');
      this.emit('output', { processId: info.id, stream, data });
      const url = !info.previewUrl && URL_RE.exec(data)?.[0];
      if (url) {
        info.previewUrl = url.replace('0.0.0.0', 'localhost');
        this.changed();
      }
    };
    child.stdout?.on('data', onData('stdout'));
    child.stderr?.on('data', onData('stderr'));
    child.on('exit', (code) => {
      info.state = code === 0 ? 'exited' : 'failed';
      info.exitCode = code ?? undefined;
      this.changed();
    });
    child.on('error', (err) => {
      info.state = 'failed';
      this.emit('output', { processId: info.id, stream: 'stderr', data: String(err) });
      this.changed();
    });
    this.changed();
    return info;
  }

  stop(id: string) {
    const p = this.procs.get(id);
    if (!p?.info.pid || p.info.state !== 'running') return;
    // No Windows, shell:true cria cmd.exe; mata a arvore inteira para encerrar o servidor de fato.
    if (process.platform === 'win32') execFile('taskkill', ['/pid', String(p.info.pid), '/T', '/F']);
    else p.child.kill('SIGTERM');
  }

  stopAll() {
    for (const id of this.procs.keys()) this.stop(id);
  }

  private changed() {
    this.emit('changed', this.list());
  }
}

export const processes = new ProcessManager();
