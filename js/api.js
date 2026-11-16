/* 俺家的猫厕所 — tiny client for the server API (server/API.md).
   Every call resolves with the JSON body (null for 204) or throws an
   ApiError { status, code, body }. A network failure is code "network";
   a response that is not the API's JSON (e.g. a static file server's 404
   page) is code "no_api". */
(() => {
  'use strict';

  const TOKEN_KEY = 'cats-toilet-token';
  const PROBE_TIMEOUT_MS = 6000;

  class ApiError extends Error {
    constructor(status, code, message, body) {
      super(message || code);
      this.status = status;
      this.code = code;
      this.body = body || null;
    }
  }

  function token() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (_) { return ''; }
  }
  function setToken(t) {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (_) { /* storage blocked: the session lasts until reload */ }
  }

  // The API lives next to the game (same origin), so paths are relative to
  // the page: works at / and from a subdirectory alike.
  const url = (path) => 'api/' + path;

  async function call(method, path, body, opts = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const t = token();
    if (t) headers.Authorization = 'Bearer ' + t;
    let res;
    try {
      res = await fetch(url(path), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
        keepalive: !!opts.keepalive,
        signal: opts.signal,
      });
    } catch (err) {
      throw new ApiError(0, 'network', String(err && err.message || err));
    }
    if (res.status === 204) return null;
    const type = res.headers.get('content-type') || '';
    let data = null;
    if (type.includes('application/json')) {
      try { data = await res.json(); } catch (_) { data = null; }
    }
    if (!data) throw new ApiError(res.status, 'no_api', `HTTP ${res.status} without an API body`);
    if (res.ok) return data;
    const e = data.error || {};
    throw new ApiError(res.status, e.code || 'error', e.message, data);
  }

  /* Is the API there, and is our token good? One request, GET /api/me.
       { mode: 'online', me }   API there, token valid
       { mode: 'login' }        API there, no or invalid token
       { mode: 'guest', why }   no API: file://, static server, offline, timeout */
  async function probe() {
    if (!/^https?:$/.test(location.protocol)) return { mode: 'guest', why: 'file' };
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => ctl && ctl.abort(), PROBE_TIMEOUT_MS);
    try {
      const me = await call('GET', 'me', undefined, { signal: ctl ? ctl.signal : undefined });
      return { mode: 'online', me };
    } catch (err) {
      if (err.status === 401 && err.code === 'unauthorized') return { mode: 'login' };
      return { mode: 'guest', why: err.code };
    } finally {
      clearTimeout(timer);
    }
  }

  function events() {
    return new EventSource(url('events?token=' + encodeURIComponent(token())));
  }

  window.api = { ApiError, call, probe, events, token, setToken, TOKEN_KEY };
})();
