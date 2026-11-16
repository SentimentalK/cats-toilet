import { test } from 'node:test';
import assert from 'node:assert/strict';
import { start } from './kit.mjs';

const errCode = (r) => r.body?.error?.code;

test('save round-trip and rev_conflict', async (t) => {
  const s = await start(t);
  const u = await s.register();
  const put = (body) => s.api('PUT', '/api/save', { token: u.token, body });

  const me0 = await s.api('GET', '/api/me', { token: u.token });
  assert.equal(me0.status, 200);
  assert.deepEqual(me0.body.user, { id: u.id, username: u.username });
  assert.deepEqual(me0.body.profile, { cat: null, allowVisits: true });
  assert.equal(me0.body.save, null);

  const data1 = { points: 120, level: 2, poops: [], owned: { bowl: true }, walls: { sky: true }, wall: 'sky' };
  const r1 = await put({ data: data1, baseRev: 0 });
  assert.equal(r1.status, 200);
  assert.deepEqual(r1.body, { rev: 1 });
  const me1 = await s.api('GET', '/api/me', { token: u.token });
  assert.deepEqual(me1.body.save, { data: data1, rev: 1 });

  const data2 = { ...data1, points: 300 };
  assert.deepEqual((await put({ data: data2, baseRev: 1 })).body, { rev: 2 });

  // A second device still at rev 1 gets the stored save back.
  const stale = await put({ data: { ...data1, points: 5 }, baseRev: 1 });
  assert.equal(stale.status, 409);
  assert.equal(errCode(stale), 'rev_conflict');
  assert.deepEqual(stale.body.save, { data: data2, rev: 2 });
  const zero = await put({ data: data1, baseRev: 0 });
  assert.equal(zero.status, 409);
  assert.deepEqual((await s.api('GET', '/api/me', { token: u.token })).body.save, { data: data2, rev: 2 });

  // No save yet + baseRev != 0 -> conflict with save:null.
  const v = await s.register();
  const noSave = await s.api('PUT', '/api/save', { token: v.token, body: { data: {}, baseRev: 3 } });
  assert.equal(noSave.status, 409);
  assert.equal(noSave.body.save, null);
});

test('save validation', async (t) => {
  const s = await start(t);
  const u = await s.register();
  const put = (body) => s.api('PUT', '/api/save', { token: u.token, body });
  for (const body of [{ baseRev: 0 }, { data: [1], baseRev: 0 }, { data: null, baseRev: 0 }, { data: 'x', baseRev: 0 },
    { data: {} }, { data: {}, baseRev: -1 }, { data: {}, baseRev: 1.5 }, { data: {}, baseRev: '0' }]) {
    const r = await put(body);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.equal(errCode(r), 'bad_save');
  }
  const big = await put({ data: { blob: 'z'.repeat(64 * 1024) }, baseRev: 0 });
  assert.equal(big.status, 413);
  assert.equal(errCode(big), 'save_too_large');
  const justFits = await put({ data: { b: 'z'.repeat(64 * 1024 - 8) }, baseRev: 0 }); // {"b":"…"} = 8 bytes of overhead
  assert.equal(justFits.status, 200);
});

test('profile validation and update', async (t) => {
  const s = await start(t);
  const u = await s.register();
  const put = (body) => s.api('PUT', '/api/profile', { token: u.token, body });
  const cat = { breed: 'british-shorthair', coat: 'blue', name: '团子', gender: 'girl' };

  const bads = [
    { cat: { ...cat, breed: 'British' } }, { cat: { ...cat, breed: '' } }, { cat: { ...cat, breed: 'b'.repeat(33) } },
    { cat: { ...cat, coat: 'blue coat' } }, { cat: { ...cat, name: '' } }, { cat: { ...cat, name: '   ' } },
    { cat: { ...cat, name: 'n'.repeat(13) } }, { cat: { ...cat, gender: 'cat' } }, { cat: { ...cat, gender: undefined } },
    { cat: null }, { cat: 'tabby' }, { allowVisits: 'no' },
  ];
  for (const body of bads) {
    const r = await put(body);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.equal(errCode(r), 'bad_profile');
  }

  const r = await put({ cat: { ...cat, name: '  团子  ', extra: 'dropped' } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { cat, allowVisits: true });
  const r2 = await put({ allowVisits: false });
  assert.deepEqual(r2.body, { cat, allowVisits: false });
  assert.deepEqual((await put({})).body, { cat, allowVisits: false });
  assert.deepEqual((await s.api('GET', '/api/me', { token: u.token })).body.profile, { cat, allowVisits: false });
});
