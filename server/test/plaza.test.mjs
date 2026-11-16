import { test } from 'node:test';
import assert from 'node:assert/strict';
import { start } from './kit.mjs';

test('presence drives plaza counts and ordering', async (t) => {
  const s = await start(t);
  const [a, b, c] = [await s.register('Alpha'), await s.register('Bravo'), await s.register('Charlie')];
  const presence = (u, squatting) => s.api('POST', '/api/presence', { token: u.token, body: { squatting } });
  const plaza = (u) => s.api('GET', '/api/plaza', { token: u.token });

  assert.deepEqual((await plaza(a)).body, { online: 0, squatting: 0, cats: [] });
  const bad = await s.api('POST', '/api/presence', { token: a.token, body: { squatting: 'yes' } });
  assert.equal(bad.status, 400);

  await s.api('PUT', '/api/save', { token: b.token, body: { data: { level: 4 }, baseRev: 0 } });
  await s.api('PUT', '/api/profile', { token: c.token, body: { allowVisits: false, cat: { breed: 'tabby', coat: 'orange', name: '大橘', gender: 'boy' } } });

  assert.equal((await presence(a, false)).status, 204);
  assert.equal((await presence(c, true)).status, 204);
  s.advance(5000);
  await presence(b, true);
  await presence(c, true); // still squatting: squatSince is kept

  const p = (await plaza(a)).body;
  assert.equal(p.online, 3);
  assert.equal(p.squatting, 2);
  assert.deepEqual(p.cats.map((x) => x.username), ['Charlie', 'Bravo', 'Alpha'], 'squatting first, longest squat first');
  const [pc, pb, pa] = p.cats;
  assert.equal(pc.squatSeconds, 5);
  assert.equal(pb.squatSeconds, 0);
  assert.deepEqual(pa, { userId: a.id, username: 'Alpha', cat: null, squatting: false, squatSeconds: 0, level: 0, allowVisits: true, me: true });
  assert.equal(pb.level, 4);
  assert.equal(pb.me, false);
  assert.equal(pc.allowVisits, false);
  assert.deepEqual(pc.cat, { breed: 'tabby', coat: 'orange', name: '大橘', gender: 'boy' });

  // Stand up -> squatSeconds resets; nobody heard from for 30 s -> offline.
  await presence(c, false);
  s.advance(26_000);
  await presence(a, false);
  const p2 = (await plaza(a)).body;
  assert.equal(p2.online, 3);
  assert.equal(p2.squatting, 1);
  assert.deepEqual(p2.cats.map((x) => x.username), ['Bravo', 'Alpha', 'Charlie']);
  s.advance(5000); // b and c last seen 31 s ago, a 5 s ago
  const p3 = (await plaza(a)).body;
  assert.equal(p3.online, 1);
  assert.equal(p3.squatting, 0);
  assert.deepEqual(p3.cats.map((x) => x.username), ['Alpha']);
});

test('plaza list is capped at 40', async (t) => {
  const s = await start(t);
  const users = [];
  for (let i = 0; i < 42; i++) users.push(await s.register(`cap${i}`));
  for (const u of users) await s.api('POST', '/api/presence', { token: u.token, body: { squatting: false } });
  const p = (await s.api('GET', '/api/plaza', { token: users[0].token })).body;
  assert.equal(p.online, 42);
  assert.equal(p.cats.length, 40);
});

test('SSE plaza events follow count changes, coalesced', async (t) => {
  const s = await start(t);
  const a = await s.register();
  const b = await s.register();
  const ev = await s.sse(a.token);
  assert.deepEqual(await ev.next('plaza'), { online: 0, squatting: 0 }, 'initial snapshot on connect');

  // A burst of 6 changes: the first goes out at once, the rest collapse into
  // one trailing event (>= 1 s later) carrying the final counts.
  const stamps = [];
  const collect = async (ms) => {
    const end = Date.now() + ms;
    const out = [];
    while (Date.now() < end) {
      try { out.push(await ev.next('plaza', end - Date.now())); stamps.push(Date.now()); } catch { break; }
    }
    return out;
  };
  const pending = collect(1600);
  await s.api('POST', '/api/presence', { token: a.token, body: { squatting: false } });
  for (const squatting of [true, false, true, false, true]) {
    await s.api('POST', '/api/presence', { token: b.token, body: { squatting } });
  }
  const got = await pending;
  assert.equal(got.length, 2, `burst produced ${JSON.stringify(got)}`);
  assert.deepEqual(got[0], { online: 1, squatting: 0 });
  assert.deepEqual(got[1], { online: 2, squatting: 1 });
  assert.ok(stamps[1] - stamps[0] >= 950, `events ${stamps[1] - stamps[0]} ms apart`);

  // No change -> no event, even after the window.
  await s.api('POST', '/api/presence', { token: b.token, body: { squatting: true } });
  assert.deepEqual(await collect(1200), []);

  // Expiry with no request at all is picked up by the sweep.
  s.advance(31_000);
  assert.deepEqual(await ev.next('plaza', 4000), { online: 0, squatting: 0 });
});

test('SSE keep-alive comments', async (t) => {
  const s = await start(t, { keepAliveMs: 100 });
  const a = await s.register();
  const ev = await s.sse(a.token);
  await ev.next('plaza');
  await new Promise((r) => setTimeout(r, 350));
  assert.ok(ev.comments >= 2, `got ${ev.comments} keep-alive comments`);
});
