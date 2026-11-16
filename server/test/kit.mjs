// Shared test helpers: start an app on an ephemeral port with a temp DB and a
// movable clock, a tiny fetch wrapper, and an SSE reader.
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { request } from 'node:http';
import { createApp } from '../app.mjs';

const TMP = process.env.CATS_TEST_TMP
  || '/tmp/claude-1000/-home-sentimentalk-codes-cats-toilet/01467c37-b451-413e-a308-1f5904bd7010/scratchpad/server';

let seq = 0;
export const uniq = (p = 'u') => `${p}${process.pid % 1000}x${++seq}`;

export async function start(t, opts = {}) {
  mkdirSync(TMP, { recursive: true });
  const dir = mkdtempSync(join(TMP, 'test-'));
  let offset = 0;
  const app = createApp({ dbPath: join(dir, 'cats.db'), log: null, now: () => Date.now() + offset, ...opts });
  const port = await app.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${port}`;
  const streams = [];
  t.after(async () => {
    for (const s of streams) s.close();
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  async function api(method, path, { token, body, rawBody, headers = {} } = {}) {
    const h = { ...headers };
    if (token) h.authorization = `Bearer ${token}`;
    let payload;
    if (rawBody !== undefined) payload = rawBody;
    else if (body !== undefined) { payload = JSON.stringify(body); h['content-type'] = 'application/json'; }
    const res = await fetch(base + path, { method, headers: h, body: payload });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
    return { status: res.status, body: json, text, headers: res.headers };
  }

  async function register(username = uniq(), password = 'secret123') {
    // each helper sign-up comes from its own address, as separate players
    // would, so the per-address sign-up limit only bites in the test for it
    const r = await api('POST', '/api/register', {
      body: { username, password }, headers: { 'cf-connecting-ip': `198.51.100.${++seq % 250}` },
    });
    if (r.status !== 201) throw new Error(`register ${username}: ${r.status} ${r.text}`);
    return { ...r.body.user, token: r.body.token, password };
  }

  /** Open /api/events; next(name) resolves with the next event of that name. */
  async function sse(token) {
    const ctrl = new AbortController();
    const res = await fetch(`${base}/api/events?token=${encodeURIComponent(token)}`, { signal: ctrl.signal });
    if (res.status !== 200) throw new Error(`sse: ${res.status}`);
    const queues = new Map();   // name -> data[]
    const waiters = new Map();  // name -> resolve[]
    const deliver = (name, data) => {
      const w = waiters.get(name);
      if (w && w.length) w.shift()(data);
      else { if (!queues.has(name)) queues.set(name, []); queues.get(name).push(data); }
    };
    let comments = 0;
    (async () => {
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = '';
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += value;
          let i;
          while ((i = buf.indexOf('\n\n')) !== -1) {
            const block = buf.slice(0, i);
            buf = buf.slice(i + 2);
            let event = 'message', data = '';
            for (const line of block.split('\n')) {
              if (line.startsWith(':')) comments++;
              else if (line.startsWith('event: ')) event = line.slice(7);
              else if (line.startsWith('data: ')) data += line.slice(6);
            }
            if (data) deliver(event, JSON.parse(data));
          }
        }
      } catch { /* aborted */ }
    })();
    const stream = {
      next(name, ms = 3000) {
        const q = queues.get(name);
        if (q && q.length) return Promise.resolve(q.shift());
        return new Promise((ok, bad) => {
          if (!waiters.has(name)) waiters.set(name, []);
          const list = waiters.get(name);
          const waiter = (d) => { clearTimeout(timer); ok(d); };
          const timer = setTimeout(() => {
            list.splice(list.indexOf(waiter), 1); // a timed-out waiter must not swallow later events
            bad(new Error(`timed out waiting for SSE "${name}"`));
          }, ms);
          list.push(waiter);
        });
      },
      /** Drain queued events of a name (returns them). */
      drain(name) { const q = queues.get(name) || []; queues.set(name, []); return q; },
      get comments() { return comments; },
      close() { ctrl.abort(); },
    };
    streams.push(stream);
    return stream;
  }

  /** Raw GET with an unnormalised path (fetch would collapse ".."). */
  function rawGet(path) {
    return new Promise((ok, bad) => {
      const req = request({ host: '127.0.0.1', port, path, method: 'GET' }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { body += c; });
        res.on('end', () => ok({ status: res.statusCode, body, headers: res.headers }));
      });
      req.on('error', bad);
      req.end();
    });
  }

  return { app, base, port, api, register, sse, rawGet, advance: (ms) => { offset += ms; } };
}
