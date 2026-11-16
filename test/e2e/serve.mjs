import { spawn } from 'node:child_process';
import path from 'node:path';

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function startServer({ port, dbPath, root = path.resolve('.') } = {}) {
  if (!Number.isInteger(port) || port <= 0) throw new Error(`startServer: invalid port ${port}`);

  const child = spawn(process.execPath, ['server/server.mjs', '--port', String(port), '--db', dbPath], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  const keep = (chunk) => {
    log = (log + chunk).slice(-4000);
  };
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);

  const url = `http://127.0.0.1:${port}`;

  const stop = async () => {
    if (child.exitCode !== null || child.signalCode) return;
    const exited = new Promise((r) => child.once('exit', r));
    child.kill('SIGTERM');
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {}
    }, 5000);
    await exited;
    clearTimeout(timer);
  };

  const deadline = Date.now() + 15_000;
  for (;;) {
    if (child.exitCode !== null) {
      throw new Error(`server exited (${child.exitCode}) before listening on ${port}:\n${log}`);
    }
    try {
      const res = await fetch(`${url}/healthz`);
      if (res.ok) return { url, stop };
    } catch {}
    if (Date.now() > deadline) {
      await stop();
      throw new Error(`server not ready on ${port} after 15s:\n${log}`);
    }
    await delay(100);
  }
}
