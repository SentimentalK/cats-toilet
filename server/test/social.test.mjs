import { test } from 'node:test';
import assert from 'node:assert/strict';
import { start } from './kit.mjs';

const errCode = (r) => r.body?.error?.code;
const CAT_A = { breed: 'siamese', coat: 'seal-point', name: 'Ace', gender: 'boy' };
const CAT_B = { breed: 'ragdoll', coat: 'blue', name: '小白', gender: 'girl' };

async function trio(t) {
  const s = await start(t);
  const a = await s.register('Amy');
  const b = await s.register('Bob');
  const c = await s.register('Cid');
  await s.api('PUT', '/api/profile', { token: a.token, body: { cat: CAT_A } });
  await s.api('PUT', '/api/profile', { token: b.token, body: { cat: CAT_B } });
  for (const u of [a, b, c]) await s.api('POST', '/api/presence', { token: u.token, body: { squatting: false } });
  return { s, a, b, c };
}

test('full social flow: visit request, answer, room, gift, inbox', async (t) => {
  const { s, a, b, c } = await trio(t);
  const saveB = { points: 999, level: 3, owned: { bowl: true, lamp: true }, walls: { sky: true, mint: true }, wall: 'mint' };
  await s.api('PUT', '/api/save', { token: b.token, body: { data: saveB, baseRev: 0 } });

  const evA = await s.sse(a.token);
  const evB = await s.sse(b.token);

  // Before any visit A cannot see B's room; anyone can see their own.
  assert.equal(errCode(await s.api('GET', `/api/rooms/${b.id}`, { token: a.token })), 'no_visit');
  const own = await s.api('GET', `/api/rooms/${a.id}`, { token: a.token });
  assert.deepEqual(own.body, { userId: a.id, username: 'Amy', cat: CAT_A, level: 0, owned: {}, wall: 'sky' });

  // A -> B request; B gets it over SSE.
  const req = await s.api('POST', '/api/visits', { token: a.token, body: { to: b.id } });
  assert.equal(req.status, 201);
  const visitId = req.body.id;
  assert.ok(Number.isInteger(visitId));
  const got = await evB.next('visit_request');
  assert.equal(got.id, visitId);
  assert.deepEqual(got.from, { userId: a.id, username: 'Amy', cat: CAT_A });
  assert.equal(typeof got.expiresAt, 'number');

  // Only B may answer.
  const wrong = await s.api('POST', `/api/visits/${visitId}/answer`, { token: c.token, body: { accept: true } });
  assert.equal(wrong.status, 403);
  assert.equal(errCode(wrong), 'not_invited');
  assert.equal((await s.api('POST', `/api/visits/${visitId}/answer`, { token: b.token, body: { accept: 'y' } })).status, 400);

  const ans = await s.api('POST', `/api/visits/${visitId}/answer`, { token: b.token, body: { accept: true } });
  assert.equal(ans.status, 200);
  assert.deepEqual(ans.body, { id: visitId, accepted: true });
  assert.deepEqual(await evA.next('visit_answer'), { id: visitId, accepted: true, by: { userId: b.id, username: 'Bob' } });
  const again = await s.api('POST', `/api/visits/${visitId}/answer`, { token: b.token, body: { accept: false } });
  assert.equal(again.status, 409);
  assert.equal(errCode(again), 'visit_closed');

  // A can enter B's room; C cannot.
  const room = await s.api('GET', `/api/rooms/${b.id}`, { token: a.token });
  assert.equal(room.status, 200);
  assert.deepEqual(room.body, { userId: b.id, username: 'Bob', cat: CAT_B, level: 3, owned: saveB.owned, wall: 'mint' });
  const cRoom = await s.api('GET', `/api/rooms/${b.id}`, { token: c.token });
  assert.equal(cRoom.status, 403);
  assert.equal(errCode(cRoom), 'no_visit');
  // Access is one-way: B did not get A's room.
  assert.equal((await s.api('GET', `/api/rooms/${a.id}`, { token: b.token })).status, 403);

  // Gifts.
  for (const body of [{ to: b.id, kind: 'points', amount: 0 }, { to: b.id, kind: 'points', amount: 501 },
    { to: b.id, kind: 'fish', amount: 5 }, { to: b.id, kind: 'points', amount: 2.5 }]) {
    const r = await s.api('POST', '/api/gifts', { token: a.token, body });
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.equal(errCode(r), 'bad_gift');
  }
  const cGift = await s.api('POST', '/api/gifts', { token: c.token, body: { to: b.id, kind: 'points', amount: 5 } });
  assert.equal(cGift.status, 403);
  assert.equal(errCode(cGift), 'no_visit');

  const gift = await s.api('POST', '/api/gifts', { token: a.token, body: { to: b.id, kind: 'points', amount: 50 } });
  assert.equal(gift.status, 201);
  const giftEv = await evB.next('gift');
  assert.deepEqual(giftEv, { id: gift.body.id, from: { userId: a.id, username: 'Amy' }, kind: 'points', amount: 50 });
  const gift2 = await s.api('POST', '/api/gifts', { token: a.token, body: { to: b.id, kind: 'points', amount: 500 } });
  assert.equal(gift2.status, 201);

  const inbox = await s.api('GET', '/api/inbox', { token: b.token });
  assert.equal(inbox.status, 200);
  assert.equal(inbox.body.items.length, 2);
  const [i1, i2] = inbox.body.items;
  assert.deepEqual({ ...i1, createdAt: 0 }, { id: gift.body.id, kind: 'points', amount: 50, from: { userId: a.id, username: 'Amy' }, createdAt: 0 });
  assert.equal(typeof i1.createdAt, 'number');
  assert.equal(i2.amount, 500);
  assert.deepEqual((await s.api('GET', '/api/inbox', { token: a.token })).body, { items: [] });

  // Acking someone else's ids does nothing; B's own ack empties the inbox.
  assert.equal((await s.api('POST', '/api/inbox/ack', { token: c.token, body: { ids: [i1.id, i2.id] } })).status, 204);
  assert.equal((await s.api('GET', '/api/inbox', { token: b.token })).body.items.length, 2);
  assert.equal((await s.api('POST', '/api/inbox/ack', { token: b.token, body: { ids: 'all' } })).status, 400);
  assert.equal((await s.api('POST', '/api/inbox/ack', { token: b.token, body: { ids: [i1.id, i2.id] } })).status, 204);
  assert.deepEqual((await s.api('GET', '/api/inbox', { token: b.token })).body, { items: [] });

  // Room access lapses 30 minutes after the accept.
  s.advance(30 * 60 * 1000 + 1);
  assert.equal(errCode(await s.api('GET', `/api/rooms/${b.id}`, { token: a.token })), 'no_visit');
  assert.equal(errCode(await s.api('POST', '/api/gifts', { token: a.token, body: { to: b.id, kind: 'points', amount: 1 } })), 'no_visit');
});

test('visit request errors and expiry', async (t) => {
  const { s, a, b, c } = await trio(t);
  const visit = (u, to) => s.api('POST', '/api/visits', { token: u.token, body: { to } });

  const unknown = await visit(a, 99999);
  assert.equal(unknown.status, 404);
  assert.equal(errCode(unknown), 'user_not_found');
  assert.equal((await visit(a, 'Bob')).status, 404);
  assert.equal(errCode(await visit(a, a.id)), 'self_visit');
  assert.equal(errCode(await s.api('GET', '/api/rooms/99999', { token: a.token })), 'user_not_found');

  await s.api('PUT', '/api/profile', { token: c.token, body: { allowVisits: false } });
  const off = await visit(a, c.id);
  assert.equal(off.status, 403);
  assert.equal(errCode(off), 'visits_off');

  const first = await visit(a, b.id);
  assert.equal(first.status, 201);
  const dup = await visit(a, b.id);
  assert.equal(dup.status, 409);
  assert.equal(errCode(dup), 'already_pending');

  // Declined -> answer pushed, no room access, can ask again.
  const evA = await s.sse(a.token);
  await s.api('POST', `/api/visits/${first.body.id}/answer`, { token: b.token, body: { accept: false } });
  assert.deepEqual(await evA.next('visit_answer'), { id: first.body.id, accepted: false, by: { userId: b.id, username: 'Bob' } });
  assert.equal(errCode(await s.api('GET', `/api/rooms/${b.id}`, { token: a.token })), 'no_visit');
  const second = await visit(a, b.id);
  assert.equal(second.status, 201);

  // After 60 s the request expires: it can no longer be accepted, and a new one is allowed.
  s.advance(61_000);
  const late = await s.api('POST', `/api/visits/${second.body.id}/answer`, { token: b.token, body: { accept: true } });
  assert.equal(late.status, 409);
  assert.equal(errCode(late), 'visit_closed');
  assert.equal(errCode(await s.api('POST', '/api/visits/424242/answer', { token: b.token, body: { accept: true } })), 'visit_not_found');

  // Everyone is offline now (61 s without presence).
  const offline = await visit(a, b.id);
  assert.equal(offline.status, 409);
  assert.equal(errCode(offline), 'offline');
  await s.api('POST', '/api/presence', { token: b.token, body: { squatting: true } });
  assert.equal((await visit(a, b.id)).status, 201);
});

test('logout closes that token\'s event streams', async (t) => {
  const s = await start(t);
  const a = await s.register();
  const res = await fetch(`${s.base}/api/events?token=${a.token}`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^text\/event-stream/);
  const done = res.text(); // resolves when the server ends the stream
  await s.api('POST', '/api/logout', { token: a.token });
  const text = await done;
  assert.match(text, /event: plaza/);
});
