import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { start } from './kit.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

test('serves the game and its assets with the right types', async (t) => {
  const s = await start(t);
  const index = await fetch(`${s.base}/`);
  assert.equal(index.status, 200);
  assert.match(index.headers.get('content-type'), /^text\/html/);
  assert.equal(await index.text(), readFileSync(`${root}index.html`, 'utf8'));

  const cases = [
    ['/index.html', /^text\/html/],
    ['/js/game.js', /^text\/javascript/],
    ['/css/style.css', /^text\/css/],
    ['/manifest.webmanifest', /^application\/manifest\+json/],
    ['/sw.js', /^text\/javascript/],
  ];
  // The client is being edited; pick whatever top-level art exists right now.
  const art = readdirSync(`${root}assets`);
  const png = art.find((f) => f.endsWith('.png'));
  const jpg = art.find((f) => f.endsWith('.jpg'));
  assert.ok(png && jpg, 'repo has a png and a jpg under assets/');
  cases.push([`/assets/${png}`, /^image\/png$/], [`/assets/${jpg}`, /^image\/jpeg$/]);
  const font = readdirSync(`${root}assets/fonts`).find((f) => f.endsWith('.ttf'));
  if (font) cases.push([`/assets/fonts/${encodeURIComponent(font)}`, /^font\/ttf$/]);
  for (const [path, type] of cases) {
    const r = await fetch(s.base + path);
    assert.equal(r.status, 200, path);
    assert.match(r.headers.get('content-type'), type, path);
    await r.arrayBuffer();
  }
  const pngRes = await fetch(`${s.base}/assets/${png}`);
  const bytes = Buffer.from(await pngRes.arrayBuffer());
  assert.deepEqual(bytes, readFileSync(`${root}assets/${png}`));

  const head = await fetch(`${s.base}/sw.js`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  const etag = head.headers.get('etag');
  const cached = await fetch(`${s.base}/sw.js`, { headers: { 'if-none-match': etag } });
  assert.equal(cached.status, 304);
});

test('never serves server code, design, tools, raw art, dotfiles or traversal', async (t) => {
  const s = await start(t);
  const designFile = readdirSync(`${root}design`, { withFileTypes: true }).find((d) => d.isFile())?.name || 'x';
  const rawFile = readdirSync(`${root}assets/raw`)[0] || 'x.png';
  const blocked = [
    '/server/server.mjs', '/server/app.mjs', '/server/', '/server/data/cats.db',
    `/design/${designFile}`, '/design/', '/tools/', `/assets/raw/${rawFile}`, '/assets/RAW/../raw/x',
    '/.git/HEAD', '/.gitignore', '/js/.hidden', '/css/', '/package.json', '/favicon.ico',
    '/css/../server/server.mjs', '/assets/../../etc/passwd', '/../server/server.mjs',
    '/%2e%2e/server/server.mjs', '/js/%2e%2e/server/server.mjs', '/js/..%2fserver%2fserver.mjs',
    '/assets/%2e%2e%2fraw%2f' + rawFile, '/js/game.js%00', '/js/%E0%A4%A', '/js\\..\\server\\server.mjs',
  ];
  for (const path of blocked) {
    const r = await s.rawGet(path);
    assert.equal(r.status, 404, path);
    assert.doesNotMatch(r.body, /createApp|import /, path);
  }
  const post = await fetch(`${s.base}/index.html`, { method: 'POST' });
  assert.equal(post.status, 405);
  const err = await post.json();
  assert.equal(err.error.code, 'method_not_allowed');
});
