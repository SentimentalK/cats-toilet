// HTTP app: JSON API + static game files. See server/API.md for the contract.
import { createServer } from 'node:http';
import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { openDb } from './db.mjs';
import { makeStatic } from './static.mjs';

const scrypt = promisify(scryptCb);

export const LIMITS = {
  bodyBytes: 100 * 1024,
  saveBytes: 64 * 1024,
  loginFailures: 10,
  loginWindowMs: 10 * 60 * 1000,
  signupsPerAddress: 20,
  signupWindowMs: 60 * 60 * 1000,
  onlineMs: 30 * 1000,
  plazaMax: 40,
  plazaCoalesceMs: 1000,
  visitTtlMs: 60 * 1000,
  roomAccessMs: 30 * 60 * 1000,
  giftMin: 1,
  giftMax: 500,
  keepAliveMs: 20 * 1000,
};

const SCRYPT_KEYLEN = 64;
const USERNAME_RE = /^[A-Za-z0-9_\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]{3,16}$/u;
const SLUG_RE = /^[a-z0-9-]{1,32}$/;

class ApiError extends Error {
  constructor(status, code, message, extra) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}
const fail = (status, code, message, extra) => { throw new ApiError(status, code, message, extra); };

const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const chars = (s) => [...s].length;
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isId = (v) => Number.isSafeInteger(v) && v > 0;

/**
 * Create the app. Options:
 *   dbPath   SQLite file (or ':memory:')
 *   root     directory the game is served from (default: repo root)
 *   now      clock in ms (tests inject a movable one)
 *   log      function for request/error logs (default console.error; pass null to silence)
 *   keepAliveMs  SSE comment interval
 */
export function createApp(opts = {}) {
  const now = opts.now || Date.now;
  const log = opts.log === undefined ? (...a) => console.error(...a) : (opts.log || (() => {}));
  const root = opts.root || resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const keepAliveMs = opts.keepAliveMs || LIMITS.keepAliveMs;
  const store = openDb(opts.dbPath || ':memory:');
  const { st } = store;
  const serveStatic = makeStatic(root);

  // ---------- in-memory state ----------
  /** userId -> { lastSeen, squatting, squatSince } */
  const presence = new Map();
  /** userId -> Set<{ res, userId, tokenHash }> */
  const streams = new Map();
  let plazaSent = { online: -1, squatting: -1 };
  let plazaSentAt = 0;
  let plazaTimer = null;
  let closed = false;

  const isOnline = (userId) => {
    const p = presence.get(userId);
    return !!p && now() - p.lastSeen < LIMITS.onlineMs;
  };

  function onlineEntries() {
    const t = now();
    const out = [];
    for (const [userId, p] of presence) {
      if (t - p.lastSeen < LIMITS.onlineMs) out.push([userId, p]);
      else if (t - p.lastSeen > 10 * LIMITS.onlineMs) presence.delete(userId);
    }
    return out;
  }

  function plazaCounts() {
    const list = onlineEntries();
    return { online: list.length, squatting: list.filter(([, p]) => p.squatting).length };
  }

  // ---------- SSE ----------
  function writeEvent(res, event, data) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
  function push(userId, event, data) {
    const set = streams.get(userId);
    if (!set) return 0;
    for (const c of set) writeEvent(c.res, event, data);
    return set.size;
  }
  function broadcast(event, data) {
    for (const set of streams.values()) for (const c of set) writeEvent(c.res, event, data);
  }
  /** Ask for a plaza broadcast; sent at most once per second, only if counts changed. */
  function plazaChanged() {
    if (plazaTimer || closed) return;
    const wait = Math.max(0, plazaSentAt + LIMITS.plazaCoalesceMs - Date.now());
    plazaTimer = setTimeout(() => {
      plazaTimer = null;
      const c = plazaCounts();
      if (c.online === plazaSent.online && c.squatting === plazaSent.squatting) return;
      plazaSent = c;
      plazaSentAt = Date.now();
      broadcast('plaza', c);
    }, wait);
  }
  // Presence expires silently, so poll for count changes.
  const sweepTimer = setInterval(plazaChanged, 1000);
  const keepAliveTimer = setInterval(() => {
    for (const set of streams.values()) for (const c of set) c.res.write(': keep-alive\n\n');
  }, keepAliveMs);
  sweepTimer.unref();
  keepAliveTimer.unref();

  // ---------- helpers ----------
  const publicUser = (u) => ({ id: u.id, username: u.username });
  const catOf = (u) => (u.cat_json ? JSON.parse(u.cat_json) : null);
  const profileOf = (u) => ({ cat: catOf(u), allowVisits: !!u.allow_visits });
  const ref = (u) => ({ userId: u.id, username: u.username });

  async function hashPassword(password, salt) {
    return scrypt(password, salt, SCRYPT_KEYLEN);
  }
  function issueToken(userId) {
    const token = randomBytes(32).toString('base64url');
    st.insertToken.run(sha256(token), userId, now());
    return token;
  }
  function authFromToken(token) {
    if (typeof token !== 'string' || !token || token.length > 200) return null;
    const tokenHash = sha256(token);
    const user = st.userByToken.get(tokenHash);
    return user ? { user, tokenHash } : null;
  }
  function requireAuth(req, query) {
    const h = req.headers.authorization || '';
    const m = /^Bearer\s+(\S+)$/i.exec(h);
    const auth = authFromToken(m ? m[1] : query?.get('token'));
    if (!auth) fail(401, 'unauthorized', 'Missing or invalid token');
    return auth;
  }
  function getUser(id) {
    if (!isId(id)) return null;
    return st.userById.get(id) || null;
  }
  function hasAcceptedVisit(fromId, toId) {
    return !!st.acceptedVisit.get(fromId, toId, now() - LIMITS.roomAccessMs);
  }

  function readJson(req) {
    return new Promise((resolveBody, reject) => {
      const declared = Number(req.headers['content-length']);
      if (declared > LIMITS.bodyBytes) {
        reject(new ApiError(413, 'body_too_large', `Body exceeds ${LIMITS.bodyBytes} bytes`));
        return;
      }
      const chunks = [];
      let size = 0;
      let tooBig = false;
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > LIMITS.bodyBytes) tooBig = true;
        if (!tooBig) chunks.push(chunk);
      });
      req.on('error', reject);
      req.on('end', () => {
        if (tooBig) return reject(new ApiError(413, 'body_too_large', `Body exceeds ${LIMITS.bodyBytes} bytes`));
        const text = Buffer.concat(chunks).toString('utf8');
        if (!text.trim()) return resolveBody({});
        let value;
        try { value = JSON.parse(text); } catch { return reject(new ApiError(400, 'bad_json', 'Body is not valid JSON')); }
        if (!isPlainObject(value)) return reject(new ApiError(400, 'bad_json', 'Body must be a JSON object'));
        resolveBody(value);
      });
    });
  }

  function send(res, status, body) {
    if (status === 204) { res.writeHead(204, { 'Cache-Control': 'no-store' }); res.end(); return; }
    const text = JSON.stringify(body);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(text),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(text);
  }

  // ---------- routes ----------
  // Sign-ups per client address, kept in memory: enough to stop one machine
  // filling the database. Behind Cloudflare + Traefik the client address is in
  // CF-Connecting-IP; a request that reaches the pod some other way can fake
  // these headers, which this prototype accepts.
  const signups = new Map();   // address -> timestamps of recent sign-ups
  function clientAddress(req) {
    const cf = req.headers['cf-connecting-ip'];
    if (typeof cf === 'string' && cf) return cf.trim();
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff) return xff.split(',').pop().trim();
    return req.socket.remoteAddress || 'unknown';
  }
  function recentSignups(address) {
    const since = now() - LIMITS.signupWindowMs;
    const list = (signups.get(address) || []).filter((t) => t > since);
    if (list.length) signups.set(address, list); else signups.delete(address);
    return list;
  }

  async function register(req) {
    const address = clientAddress(req);
    if (recentSignups(address).length >= LIMITS.signupsPerAddress) {
      fail(429, 'too_many_registrations', 'Too many new accounts from this address; try again later');
    }
    const { username, password } = await readJson(req);
    if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
      fail(400, 'bad_username', 'Username must be 3-16 letters, digits, _ or CJK characters');
    }
    if (typeof password !== 'string' || chars(password) < 6 || chars(password) > 72) {
      fail(400, 'bad_password', 'Password must be 6-72 characters');
    }
    const lc = username.toLowerCase();
    if (st.userByName.get(lc)) fail(409, 'username_taken', 'That username is taken');
    const salt = randomBytes(16);
    const hash = await hashPassword(password, salt);
    let id;
    try {
      id = Number(st.insertUser.run(username, lc, salt, hash, now()).lastInsertRowid);
    } catch (e) {
      if (/UNIQUE/.test(e.message)) fail(409, 'username_taken', 'That username is taken');
      throw e;
    }
    recentSignups(address);
    signups.set(address, [...(signups.get(address) || []), now()]);
    if (signups.size > 5000) for (const key of [...signups.keys()]) recentSignups(key);
    return [201, { token: issueToken(id), user: { id, username } }];
  }

  // A fixed salt/hash so unknown usernames cost the same scrypt work.
  const DUMMY_SALT = randomBytes(16);
  async function login(req) {
    const { username, password } = await readJson(req);
    if (typeof username !== 'string' || typeof password !== 'string' || username.length > 64 || password.length > 256) {
      fail(401, 'bad_credentials', 'Wrong username or password');
    }
    const lc = username.toLowerCase();
    const t = now();
    const since = t - LIMITS.loginWindowMs;
    if (st.countFailures.get(lc, since).n >= LIMITS.loginFailures) {
      fail(429, 'too_many_attempts', 'Too many failed logins; try again in a few minutes');
    }
    const user = st.userByName.get(lc);
    const hash = await hashPassword(password, user ? user.pass_salt : DUMMY_SALT);
    const ok = !!user && hash.length === user.pass_hash.length && timingSafeEqual(hash, user.pass_hash);
    if (!ok) {
      st.pruneFailures.run(since);
      st.addFailure.run(lc, t);
      fail(401, 'bad_credentials', 'Wrong username or password');
    }
    st.clearFailures.run(lc);
    return [200, { token: issueToken(user.id), user: publicUser(user) }];
  }

  function logout(req, { tokenHash }) {
    st.deleteToken.run(tokenHash);
    for (const set of streams.values()) {
      for (const c of set) if (c.tokenHash === tokenHash) c.res.end();
    }
    return [204];
  }

  function me(req, { user }) {
    const s = st.getSave.get(user.id);
    return [200, {
      user: publicUser(user),
      profile: profileOf(user),
      save: s ? { data: JSON.parse(s.data), rev: s.rev } : null,
    }];
  }

  async function putProfile(req, { user }) {
    const body = await readJson(req);
    let cat = catOf(user);
    let allowVisits = !!user.allow_visits;
    if ('cat' in body) {
      const c = body.cat;
      const name = isPlainObject(c) && typeof c.name === 'string' ? c.name.trim() : null;
      if (!isPlainObject(c)
        || typeof c.breed !== 'string' || !SLUG_RE.test(c.breed)
        || typeof c.coat !== 'string' || !SLUG_RE.test(c.coat)
        || !name || chars(name) > 12 || /\p{Cc}/u.test(name)
        || (c.gender !== 'boy' && c.gender !== 'girl')) {
        fail(400, 'bad_profile', 'cat needs breed and coat (1-32 of a-z 0-9 -), name (1-12 chars) and gender boy|girl');
      }
      cat = { breed: c.breed, coat: c.coat, name, gender: c.gender };
    }
    if ('allowVisits' in body) {
      if (typeof body.allowVisits !== 'boolean') fail(400, 'bad_profile', 'allowVisits must be a boolean');
      allowVisits = body.allowVisits;
    }
    st.setProfile.run(cat ? JSON.stringify(cat) : null, allowVisits ? 1 : 0, user.id);
    return [200, { cat, allowVisits }];
  }

  async function putSave(req, { user }) {
    const { data, baseRev } = await readJson(req);
    if (!isPlainObject(data)) fail(400, 'bad_save', 'data must be a JSON object');
    if (!Number.isSafeInteger(baseRev) || baseRev < 0) fail(400, 'bad_save', 'baseRev must be a non-negative integer');
    const text = JSON.stringify(data);
    if (Buffer.byteLength(text) > LIMITS.saveBytes) fail(413, 'save_too_large', `Save exceeds ${LIMITS.saveBytes} bytes`);
    return store.tx(() => {
      const cur = st.getSave.get(user.id);
      const curRev = cur ? cur.rev : 0;
      if (baseRev !== curRev) {
        fail(409, 'rev_conflict', `Stored save is at rev ${curRev}`, {
          save: cur ? { data: JSON.parse(cur.data), rev: cur.rev } : null,
        });
      }
      if (cur) st.updateSave.run(text, now(), user.id, curRev);
      else st.insertSave.run(user.id, text, now());
      return [200, { rev: curRev + 1 }];
    });
  }

  async function postPresence(req, { user }) {
    const { squatting } = await readJson(req);
    if (typeof squatting !== 'boolean') fail(400, 'bad_request', 'squatting must be a boolean');
    const t = now();
    const prev = presence.get(user.id);
    const wasOnline = isOnline(user.id);
    const squatSince = squatting
      ? (wasOnline && prev.squatting ? prev.squatSince : t)
      : null;
    presence.set(user.id, { lastSeen: t, squatting, squatSince });
    if (!wasOnline || prev.squatting !== squatting) plazaChanged();
    return [204];
  }

  function getPlaza(req, { user }) {
    const t = now();
    const list = onlineEntries().map(([userId, p]) => ({
      userId, squatting: p.squatting,
      squatSeconds: p.squatting ? Math.max(0, Math.floor((t - p.squatSince) / 1000)) : 0,
    }));
    const counts = { online: list.length, squatting: list.filter((e) => e.squatting).length };
    list.sort((a, b) => (b.squatting - a.squatting) || (b.squatSeconds - a.squatSeconds) || (a.userId - b.userId));
    const top = list.slice(0, LIMITS.plazaMax);
    const levels = store.levels(top.map((e) => e.userId));
    const cats = [];
    for (const e of top) {
      const u = st.userById.get(e.userId);
      if (!u) continue;
      const level = levels.get(e.userId);
      cats.push({
        userId: u.id, username: u.username, cat: catOf(u),
        squatting: e.squatting, squatSeconds: e.squatSeconds,
        level: typeof level === 'number' ? level : 0,
        allowVisits: !!u.allow_visits, me: u.id === user.id,
      });
    }
    return [200, { ...counts, cats }];
  }

  function openEvents(req, res, auth) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');
    writeEvent(res, 'plaza', plazaCounts());
    const client = { res, userId: auth.user.id, tokenHash: auth.tokenHash };
    if (!streams.has(client.userId)) streams.set(client.userId, new Set());
    streams.get(client.userId).add(client);
    const drop = () => {
      const set = streams.get(client.userId);
      if (!set) return;
      set.delete(client);
      if (!set.size) streams.delete(client.userId);
    };
    req.on('close', drop);
    res.on('close', drop);
  }

  async function postVisit(req, { user }) {
    const { to } = await readJson(req);
    const target = getUser(to);
    if (!target) fail(404, 'user_not_found', 'No such user');
    if (target.id === user.id) fail(400, 'self_visit', 'You cannot visit yourself');
    if (!target.allow_visits) fail(403, 'visits_off', 'This player does not accept visits');
    if (!isOnline(target.id)) fail(409, 'offline', 'This player is not online');
    const t = now();
    if (st.pendingVisit.get(user.id, target.id, t)) fail(409, 'already_pending', 'You already have a pending request to this player');
    const expiresAt = t + LIMITS.visitTtlMs;
    const id = Number(st.insertVisit.run(user.id, target.id, t, expiresAt).lastInsertRowid);
    push(target.id, 'visit_request', { id, from: { ...ref(user), cat: catOf(user) }, expiresAt });
    return [201, { id }];
  }

  async function answerVisit(req, { user }, visitId) {
    const { accept } = await readJson(req);
    if (typeof accept !== 'boolean') fail(400, 'bad_request', 'accept must be a boolean');
    const v = st.visitById.get(visitId);
    if (!v) fail(404, 'visit_not_found', 'No such visit request');
    if (v.to_id !== user.id) fail(403, 'not_invited', 'Only the invited player can answer');
    if (v.status !== 'pending') fail(409, 'visit_closed', 'This request was already answered');
    const t = now();
    if (v.expires_at <= t) fail(409, 'visit_closed', 'This request has expired');
    st.answerVisit.run(accept ? 'accepted' : 'declined', t, v.id);
    push(v.from_id, 'visit_answer', { id: v.id, accepted: accept, by: ref(user) });
    return [200, { id: v.id, accepted: accept }];
  }

  function getRoom(req, { user }, userId) {
    const target = getUser(userId);
    if (!target) fail(404, 'user_not_found', 'No such user');
    if (target.id !== user.id && !hasAcceptedVisit(user.id, target.id)) {
      fail(403, 'no_visit', 'You need an accepted visit to see this room');
    }
    const s = st.getSave.get(target.id);
    let data = {};
    if (s) { try { data = JSON.parse(s.data); } catch { data = {}; } }
    return [200, {
      userId: target.id, username: target.username, cat: catOf(target),
      level: typeof data.level === 'number' ? data.level : 0,
      owned: isPlainObject(data.owned) ? data.owned : {},
      wall: typeof data.wall === 'string' ? data.wall : 'sky',
    }];
  }

  async function postGift(req, { user }) {
    const { to, kind, amount } = await readJson(req);
    if (kind !== 'points' || !Number.isSafeInteger(amount) || amount < LIMITS.giftMin || amount > LIMITS.giftMax) {
      fail(400, 'bad_gift', `kind must be "points" and amount an integer ${LIMITS.giftMin}-${LIMITS.giftMax}`);
    }
    const target = getUser(to);
    if (!target) fail(404, 'user_not_found', 'No such user');
    if (!hasAcceptedVisit(user.id, target.id)) fail(403, 'no_visit', 'You need an accepted visit to send a gift');
    const t = now();
    const id = Number(st.insertGift.run(user.id, target.id, kind, amount, t).lastInsertRowid);
    push(target.id, 'gift', { id, from: ref(user), kind, amount });
    return [201, { id }];
  }

  function getInbox(req, { user }) {
    const items = st.inbox.all(user.id).map((r) => ({
      id: r.id, kind: r.kind, amount: r.amount,
      from: { userId: r.from_id, username: r.from_name }, createdAt: r.created_at,
    }));
    return [200, { items }];
  }

  async function ackInbox(req, { user }) {
    const { ids } = await readJson(req);
    if (!Array.isArray(ids) || ids.length > 500 || !ids.every(isId)) {
      fail(400, 'bad_request', 'ids must be an array of up to 500 item ids');
    }
    const t = now();
    store.tx(() => { for (const id of ids) st.ackGift.run(t, id, user.id); });
    return [204];
  }

  // [method, pattern, handler, needsAuth]; pattern groups are passed as numbers.
  const ROUTES = [
    ['POST', /^\/api\/register$/, register, false],
    ['POST', /^\/api\/login$/, login, false],
    ['POST', /^\/api\/logout$/, logout, true],
    ['GET', /^\/api\/me$/, me, true],
    ['PUT', /^\/api\/profile$/, putProfile, true],
    ['PUT', /^\/api\/save$/, putSave, true],
    ['POST', /^\/api\/presence$/, postPresence, true],
    ['GET', /^\/api\/plaza$/, getPlaza, true],
    ['GET', /^\/api\/events$/, null, true],
    ['POST', /^\/api\/visits$/, postVisit, true],
    ['POST', /^\/api\/visits\/(\d{1,15})\/answer$/, answerVisit, true],
    ['GET', /^\/api\/rooms\/(\d{1,15})$/, getRoom, true],
    ['POST', /^\/api\/gifts$/, postGift, true],
    ['GET', /^\/api\/inbox$/, getInbox, true],
    ['POST', /^\/api\/inbox\/ack$/, ackInbox, true],
  ];

  async function handleApi(req, res, path, query) {
    let pathMatched = false;
    for (const [method, re, handler, needsAuth] of ROUTES) {
      const m = re.exec(path);
      if (!m) continue;
      pathMatched = true;
      if (method !== req.method) continue;
      const auth = needsAuth ? requireAuth(req, path === '/api/events' ? query : null) : null;
      if (!handler) { openEvents(req, res, auth); return; }
      const [status, body] = await handler(req, auth, ...m.slice(1).map(Number));
      send(res, status, body);
      return;
    }
    if (pathMatched) fail(405, 'method_not_allowed', `${req.method} is not allowed here`);
    fail(404, 'not_found', 'No such API route');
  }

  async function handle(req, res) {
    const raw = req.url || '/';
    const qi = raw.indexOf('?');
    const path = qi === -1 ? raw : raw.slice(0, qi);
    const query = new URLSearchParams(qi === -1 ? '' : raw.slice(qi + 1));
    try {
      if (path === '/healthz') {            // for the orchestrator's probes
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end('ok\n');
        return;
      }
      if (path === '/api' || path.startsWith('/api/')) {
        await handleApi(req, res, path, query);
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') fail(405, 'method_not_allowed', 'Static files are GET only');
      if (!(await serveStatic(req, res, path))) fail(404, 'not_found', 'Not found');
    } catch (e) {
      if (res.headersSent) { res.destroy(); return; }
      if (e instanceof ApiError) {
        if (e.status === 413) res.setHeader('Connection', 'close');
        send(res, e.status, { error: { code: e.code, message: e.message }, ...e.extra });
      } else {
        log('[server] unhandled error', req.method, path, e);
        send(res, 500, { error: { code: 'internal', message: 'Internal server error' } });
      }
    }
  }

  const server = createServer((req, res) => { handle(req, res); });
  server.headersTimeout = 20_000;
  server.requestTimeout = 0; // SSE streams are long-lived

  return {
    server,
    listen(port = 0, host) {
      return new Promise((ok, bad) => {
        server.once('error', bad);
        server.listen(port, host, () => { server.off('error', bad); ok(server.address().port); });
      });
    },
    async close() {
      if (closed) return;
      closed = true;
      clearInterval(sweepTimer);
      clearInterval(keepAliveTimer);
      clearTimeout(plazaTimer);
      for (const set of streams.values()) for (const c of set) c.res.end();
      streams.clear();
      await new Promise((ok) => {
        server.close(() => ok());
        server.closeAllConnections();
      });
      store.close();
    },
  };
}
