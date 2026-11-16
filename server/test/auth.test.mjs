import { test } from 'node:test';
import assert from 'node:assert/strict';
import { start, uniq } from './kit.mjs';

const errCode = (r) => r.body?.error?.code;

test('register validates username and password', async (t) => {
  const s = await start(t);
  const reg = (username, password = 'secret123') => s.api('POST', '/api/register', { body: { username, password } });

  for (const bad of ['ab', 'a'.repeat(17), 'has space', 'dash-name', 'emoji😺x', '', 42, null]) {
    const r = await reg(bad);
    assert.equal(r.status, 400, `username ${JSON.stringify(bad)}`);
    assert.equal(errCode(r), 'bad_username');
  }
  for (const bad of ['12345', 'x'.repeat(73), 123456, null]) {
    const r = await reg(uniq(), bad);
    assert.equal(r.status, 400, `password ${JSON.stringify(bad)}`);
    assert.equal(errCode(r), 'bad_password');
  }

  const ok = await reg('Tom_Cat', '123456');
  assert.equal(ok.status, 201);
  assert.equal(typeof ok.body.token, 'string');
  assert.ok(ok.body.token.length >= 40);
  assert.deepEqual(Object.keys(ok.body.user).sort(), ['id', 'username']);
  assert.equal(ok.body.user.username, 'Tom_Cat');

  assert.equal((await reg('橘猫大王')).status, 201, 'CJK username');
  assert.equal((await reg('x'.repeat(16), 'p'.repeat(72))).status, 201, 'max lengths');
});

test('duplicate usernames are rejected ignoring case', async (t) => {
  const s = await start(t);
  await s.register('Mimi', 'secret123');
  for (const name of ['Mimi', 'mimi', 'MIMI']) {
    const r = await s.api('POST', '/api/register', { body: { username: name, password: 'other123' } });
    assert.equal(r.status, 409);
    assert.equal(errCode(r), 'username_taken');
  }
});

test('login, bad password, logout', async (t) => {
  const s = await start(t);
  const u = await s.register('Kitty', 'meowmeow');

  const good = await s.api('POST', '/api/login', { body: { username: 'kitty', password: 'meowmeow' } });
  assert.equal(good.status, 200);
  assert.deepEqual(good.body.user, { id: u.id, username: 'Kitty' });
  assert.notEqual(good.body.token, u.token);

  const bad = await s.api('POST', '/api/login', { body: { username: 'Kitty', password: 'wrongpass' } });
  assert.equal(bad.status, 401);
  assert.equal(errCode(bad), 'bad_credentials');
  const nobody = await s.api('POST', '/api/login', { body: { username: 'nobody', password: 'wrongpass' } });
  assert.equal(nobody.status, 401);
  assert.equal(errCode(nobody), 'bad_credentials');

  const tok = good.body.token;
  assert.equal((await s.api('GET', '/api/me', { token: tok })).status, 200);
  assert.equal((await s.api('POST', '/api/logout', { token: tok })).status, 204);
  const after = await s.api('GET', '/api/me', { token: tok });
  assert.equal(after.status, 401);
  assert.equal(errCode(after), 'unauthorized');
  // The other session is untouched.
  assert.equal((await s.api('GET', '/api/me', { token: u.token })).status, 200);
});

test('login is rate limited after 10 failures per username', async (t) => {
  const s = await start(t);
  await s.register('Target', 'rightpass');
  const login = (password, username = 'Target') => s.api('POST', '/api/login', { body: { username, password } });
  for (let i = 0; i < 10; i++) assert.equal((await login('wrong' + i)).status, 401, `attempt ${i + 1}`);
  const locked = await login('rightpass');
  assert.equal(locked.status, 429, 'locked even with the right password');
  assert.equal(errCode(locked), 'too_many_attempts');
  assert.equal((await login('rightpass', 'TARGET')).status, 429, 'same username, other case');
  // Window passes -> allowed again.
  s.advance(10 * 60 * 1000 + 1);
  assert.equal((await login('rightpass')).status, 200);
});

test('every non-public API route requires a token', async (t) => {
  const s = await start(t);
  const routes = [
    ['POST', '/api/logout'], ['GET', '/api/me'], ['PUT', '/api/profile'], ['PUT', '/api/save'],
    ['POST', '/api/presence'], ['GET', '/api/plaza'], ['GET', '/api/events'], ['POST', '/api/visits'],
    ['POST', '/api/visits/1/answer'], ['GET', '/api/rooms/1'], ['POST', '/api/gifts'],
    ['GET', '/api/inbox'], ['POST', '/api/inbox/ack'],
  ];
  for (const [method, path] of routes) {
    for (const token of [undefined, 'not-a-real-token']) {
      const r = await s.api(method, path, { token, body: method === 'GET' ? undefined : {} });
      assert.equal(r.status, 401, `${method} ${path} token=${token}`);
      assert.equal(errCode(r), 'unauthorized');
      assert.equal(typeof r.body.error.message, 'string');
    }
  }
  const evq = await s.api('GET', '/api/events?token=nope');
  assert.equal(evq.status, 401);
});

test('malformed and oversized bodies', async (t) => {
  const s = await start(t);
  const u = await s.register();
  const broken = await s.api('POST', '/api/login', { rawBody: '{"username":', headers: { 'content-type': 'application/json' } });
  assert.equal(broken.status, 400);
  assert.equal(errCode(broken), 'bad_json');
  const arr = await s.api('PUT', '/api/save', { token: u.token, rawBody: '[1,2]' });
  assert.equal(errCode(arr), 'bad_json');
  const huge = await s.api('PUT', '/api/save', { token: u.token, rawBody: JSON.stringify({ data: { x: 'y'.repeat(101 * 1024) }, baseRev: 0 }) });
  assert.equal(huge.status, 413);
  assert.equal(errCode(huge), 'body_too_large');
  const unknown = await s.api('GET', '/api/nope', { token: u.token });
  assert.equal(unknown.status, 404);
  assert.equal(errCode(unknown), 'not_found');
  const wrongMethod = await s.api('DELETE', '/api/me', { token: u.token });
  assert.equal(wrongMethod.status, 405);
});
