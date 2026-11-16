import { test } from 'node:test';
import assert from 'node:assert/strict';
import { start, uniq } from './kit.mjs';
import { LIMITS } from '../app.mjs';

test('sign-ups are limited per client address and the limit expires', async (t) => {
  const s = await start(t);
  const reg = (address) => s.api('POST', '/api/register', {
    body: { username: uniq('s'), password: 'secret123' },
    headers: address ? { 'cf-connecting-ip': address } : {},
  });

  for (let i = 0; i < LIMITS.signupsPerAddress; i++) {
    assert.equal((await reg('203.0.113.7')).status, 201, `sign-up ${i + 1}`);
  }
  const blocked = await reg('203.0.113.7');
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.error.code, 'too_many_registrations');

  assert.equal((await reg('203.0.113.8')).status, 201, 'another address is unaffected');
  assert.equal((await reg()).status, 201, 'no proxy header: falls back to the socket address');

  // a rejected attempt (taken name) does not use up the allowance
  const taken = await s.api('POST', '/api/register', {
    body: { username: 'Dup_Name', password: 'secret123' }, headers: { 'cf-connecting-ip': '203.0.113.9' },
  });
  assert.equal(taken.status, 201);
  for (let i = 0; i < LIMITS.signupsPerAddress + 2; i++) {
    const r = await s.api('POST', '/api/register', {
      body: { username: 'dup_name', password: 'secret123' }, headers: { 'cf-connecting-ip': '203.0.113.10' },
    });
    assert.equal(r.status, 409);
  }
  assert.equal((await reg('203.0.113.10')).status, 201);

  s.advance(LIMITS.signupWindowMs + 1000);
  assert.equal((await reg('203.0.113.7')).status, 201, 'allowed again after the window');
});

test('healthz answers without a token', async (t) => {
  const s = await start(t);
  const r = await s.api('GET', '/healthz');
  assert.equal(r.status, 200);
  assert.equal(r.text.trim(), 'ok');
});
