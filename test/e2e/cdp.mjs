import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const CHROME = '/usr/bin/google-chrome';

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function connect(url) {
  const ws = new WebSocket(url);
  const pending = new Map();
  const listeners = new Set();
  let nextId = 0;
  const ready = new Promise((ok, bad) => {
    ws.addEventListener('open', () => ok());
    ws.addEventListener('error', (e) => bad(new Error(`CDP socket failed: ${e.message ?? 'unknown error'}`)));
  });
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id != null) {
      const waiter = pending.get(msg.id);
      if (!waiter) return;
      pending.delete(msg.id);
      if (msg.error) waiter.reject(new Error(`CDP ${msg.error.code}: ${msg.error.message}`));
      else waiter.resolve(msg.result);
      return;
    }
    for (const fn of listeners) fn(msg);
  });
  ws.addEventListener('close', () => {
    for (const waiter of pending.values()) waiter.reject(new Error('CDP socket closed'));
    pending.clear();
  });
  return {
    ready,
    send(method, params = {}, sessionId) {
      const id = ++nextId;
      const msg = { id, method, params };
      if (sessionId) msg.sessionId = sessionId;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify(msg));
      });
    },
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    close() {
      try {
        ws.close();
      } catch {}
    },
  };
}

function argText(arg) {
  if (arg.value !== undefined) return typeof arg.value === 'string' ? arg.value : JSON.stringify(arg.value);
  return arg.description ?? arg.unserializableValue ?? String(arg.type);
}

async function killGroup(proc) {
  if (proc.exitCode !== null || proc.signalCode) return;
  const exited = new Promise((r) => proc.once('exit', r));
  try {
    process.kill(-proc.pid, 'SIGKILL');
  } catch (e) {
    if (e.code !== 'ESRCH') throw e;
  }
  const timer = setTimeout(() => {
    try {
      proc.kill('SIGKILL');
    } catch {}
  }, 5000);
  await exited;
  clearTimeout(timer);
}

export async function launch({ port = 9555, userDataDir, width = 390, height = 844 } = {}) {
  if (!userDataDir) throw new Error('launch: userDataDir is required');

  const proc = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      'about:blank',
    ],
    { detached: true, stdio: ['ignore', 'ignore', 'pipe'] },
  );
  let stderr = '';
  proc.stderr.setEncoding('utf8');
  proc.stderr.on('data', (d) => {
    stderr = (stderr + d).slice(-4000);
  });
  let spawnError = null;
  proc.on('error', (e) => {
    spawnError = e;
  });

  const wsUrl = await (async () => {
    const deadline = Date.now() + 15_000;
    for (;;) {
      if (spawnError) throw new Error(`cannot start ${CHROME}: ${spawnError.message}`);
      if (proc.exitCode !== null) throw new Error(`chrome exited (${proc.exitCode}) before CDP was ready:\n${stderr}`);
      let found = null;
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/version`);
        if (res.ok) found = (await res.json()).webSocketDebuggerUrl ?? null;
      } catch {}
      if (found) return found;
      if (Date.now() > deadline) {
        await killGroup(proc);
        throw new Error(`CDP endpoint on port ${port} not ready after 15s:\n${stderr}`);
      }
      await delay(100);
    }
  })();

  const ws = connect(wsUrl);
  try {
    await ws.ready;
  } catch (e) {
    await killGroup(proc);
    throw e;
  }

  const sessionId = await (async () => {
    try {
      const { targetId } = await ws.send('Target.createTarget', { url: 'about:blank' });
      const attached = await ws.send('Target.attachToTarget', { targetId, flatten: true });
      return { targetId, sessionId: attached.sessionId };
    } catch (e) {
      ws.close();
      await killGroup(proc);
      throw e;
    }
  })();

  const send = (method, params, sid = sessionId.sessionId) => ws.send(method, params, sid);
  const errors = [];
  const network = [];
  const responseStatus = new Map();
  const awaitingStatus = new Map();

  function statusOf(requestId) {
    if (!requestId) return Promise.resolve(null);
    if (responseStatus.has(requestId)) return Promise.resolve(responseStatus.get(requestId));
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        awaitingStatus.delete(requestId);
        resolve(null);
      }, 1000);
      timer.unref?.();
      awaitingStatus.set(requestId, (status) => {
        clearTimeout(timer);
        resolve(status);
      });
    });
  }

  ws.on((msg) => {
    if (msg.sessionId !== sessionId.sessionId) return;
    if (msg.method === 'Network.responseReceived') {
      const { requestId, response } = msg.params;
      network.push({
        url: response.url,
        status: response.status,
        type: response.type,
        headers: response.headers,
        fromServiceWorker: !!response.fromServiceWorker,
      });
      responseStatus.set(requestId, response.status);
      awaitingStatus.get(requestId)?.(response.status);
      awaitingStatus.delete(requestId);
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      if (msg.params.type !== 'error') return;
      errors.push({ type: 'error', text: msg.params.args.map(argText).join(' '), url: null, status: null });
      return;
    }
    if (msg.method === 'Log.entryAdded') {
      const entry = msg.params.entry;
      if (entry.level !== 'error') return;
      statusOf(entry.networkRequestId).then((status) => {
        errors.push({ type: 'error', text: entry.text, url: entry.url ?? null, status });
      });
      return;
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errors.push({
        type: 'exception',
        text: d.exception?.description ?? d.text ?? 'uncaught exception',
        url: null,
        status: null,
      });
    }
  });

  function onceEvent(method, ms, label) {
    return new Promise((resolve, reject) => {
      let off = null;
      const timer = setTimeout(() => {
        off?.();
        reject(new Error(`timeout after ${ms}ms waiting for ${label ?? method}`));
      }, ms);
      off = ws.on((msg) => {
        if (msg.method !== method || msg.sessionId !== sessionId.sessionId) return;
        clearTimeout(timer);
        off();
        resolve(msg.params);
      });
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: true,
  });

  const page = {
    errors,
    network,

    async addInitScript(script) {
      await send('Page.addScriptToEvaluateOnNewDocument', { source: script });
    },

    async goto(url) {
      const loaded = onceEvent('Page.loadEventFired', 25_000, `load of ${url}`);
      const res = await send('Page.navigate', { url });
      if (res.errorText) throw new Error(`navigate ${url} failed: ${res.errorText}`);
      await loaded;
    },

    async evaluate(expression) {
      const res = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
      });
      if (res.exceptionDetails) {
        const d = res.exceptionDetails;
        throw new Error(d.exception?.description ?? d.text ?? `evaluate failed: ${expression}`);
      }
      return res.result.value;
    },

    async waitFor(expression, ms = 8000) {
      const deadline = Date.now() + ms;
      for (;;) {
        let ok = false;
        try {
          ok = !!(await page.evaluate(expression));
        } catch {}
        if (ok) return;
        if (Date.now() >= deadline) {
          let body = '';
          try {
            body = await page.evaluate('document.body ? document.body.innerText.slice(0, 800) : ""');
          } catch {}
          throw new Error(`waitFor timed out after ${ms}ms: ${expression}\n--- body ---\n${body}`);
        }
        await delay(50);
      }
    },

    async click(selector) {
      const clicked = await page.evaluate(
        `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`,
      );
      if (!clicked) throw new Error(`click: no element matches ${selector}`);
    },

    async text(selector) {
      return page.evaluate(
        `(() => { const el = document.querySelector(${JSON.stringify(selector)}); return el ? el.innerText : null; })()`,
      );
    },

    async count(selector) {
      return page.evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
    },

    async viewport(w, h) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    },

    async shot(file) {
      const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      await writeFile(file, Buffer.from(data, 'base64'));
    },

    async shotViewport(file) {
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      await writeFile(file, Buffer.from(data, 'base64'));
    },

    async close() {
      try {
        await ws.send('Target.closeTarget', { targetId: sessionId.targetId });
      } catch {}
      ws.close();
      await killGroup(proc);
    },
  };

  return page;
}
