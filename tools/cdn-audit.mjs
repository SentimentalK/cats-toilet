#!/usr/bin/env node
/* Read-only CDN/origin cache audit.
 *
 * Requests each path twice and prints status, Cache-Control, Content-Length
 * and Cloudflare's cf-cache-status (when the response came through Cloudflare).
 * --assert-origin checks Cache-Control against the rules served by
 * server/static.mjs; it never fails just because a public URL is not edge
 * cached — that is a Cloudflare rule/token problem, reported as a hint.
 *
 *   node tools/cdn-audit.mjs
 *   node tools/cdn-audit.mjs --base http://127.0.0.1:8790 --assert-origin
 */
'use strict';

const DEFAULT_BASE = 'https://cats.mainstayx.com';

const NO_CACHE = 'no-cache';
const CODE = 'public, max-age=3600, stale-while-revalidate=86400';
const ASSET = 'public, max-age=604800, stale-while-revalidate=86400';

const TARGETS = [
  ['/', NO_CACHE],
  ['/index.html', NO_CACHE],
  ['/sw.js', NO_CACHE],
  ['/manifest.webmanifest', NO_CACHE],
  ['/js/game.js', CODE],
  ['/css/style.css', CODE],
  ['/assets/room-bg.jpg', ASSET],
  ['/assets/fonts/ZCOOLKuaiLe-Regular.woff2', ASSET],
];

const staticTargets = new Set(TARGETS.filter(([, want]) => want !== NO_CACHE).map(([p]) => p));

function usage(code = 0) {
  console.log(`usage: node tools/cdn-audit.mjs [--base <url>] [--assert-origin]

  --base <url>       origin or site to audit (default ${DEFAULT_BASE})
  --assert-origin    fail (exit 1) when Cache-Control differs from the origin rules
  --help             show this message`);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = { base: DEFAULT_BASE, assertOrigin: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base') {
      const v = argv[++i];
      if (!v) usage(2);
      opts.base = v;
    } else if (a.startsWith('--base=')) {
      opts.base = a.slice('--base='.length);
    } else if (a === '--assert-origin') {
      opts.assertOrigin = true;
    } else if (a === '--help' || a === '-h') {
      usage(0);
    } else {
      console.error(`unknown argument: ${a}`);
      usage(2);
    }
  }
  opts.base = opts.base.replace(/\/+$/, '');
  const url = new URL(opts.base);
  if (!/^https?:$/.test(url.protocol)) throw new Error(`unsupported protocol: ${url.protocol}`);
  opts.base = url.origin + url.pathname.replace(/\/+$/, '');
  opts.local = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname);
  return opts;
}

async function probe(url) {
  const res = await fetch(url, { redirect: 'manual' });
  const body = await res.arrayBuffer();
  const len = res.headers.get('content-length');
  return {
    status: res.status,
    cacheControl: res.headers.get('cache-control') ?? '-',
    length: len ?? (body.byteLength ? String(body.byteLength) : '-'),
    cf: res.headers.get('cf-cache-status') ?? '-',
  };
}

function pad(s, w) {
  s = String(s);
  return s + ' '.repeat(Math.max(0, w - [...s].length));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  console.log(`auditing ${opts.base} (${opts.local ? 'origin' : 'public/CDN'})`);

  const rows = [];
  const failures = [];
  for (const [path, want] of TARGETS) {
    const url = opts.base + path;
    let first;
    let second;
    try {
      first = await probe(url);
      second = await probe(url);
    } catch (err) {
      failures.push(`${path}: ${err.message}`);
      rows.push({ path, round: '1', status: 'ERR', cc: '-', len: '-', cf: '-' });
      rows.push({ path, round: '2', status: 'ERR', cc: '-', len: '-', cf: '-' });
      continue;
    }
    for (const [round, r] of [['1', first], ['2', second]]) {
      rows.push({ path, round, status: r.status, cc: r.cacheControl, len: r.length, cf: r.cf });
    }
    if (first.status !== 200) {
      failures.push(`${path}: expected 200, got ${first.status}`);
      continue;
    }
    if (opts.assertOrigin && first.cacheControl !== want) {
      failures.push(`${path}: Cache-Control ${JSON.stringify(first.cacheControl)} != ${JSON.stringify(want)}`);
    }
    if (second.cacheControl !== first.cacheControl) {
      failures.push(`${path}: Cache-Control changed between requests`);
    }
  }

  const cols = [
    ['path', (r) => r.path],
    ['#', (r) => r.round],
    ['status', (r) => r.status],
    ['cache-control', (r) => r.cc],
    ['length', (r) => r.len],
    ['cf-cache-status', (r) => r.cf],
  ];
  const widths = cols.map(([h, get]) => Math.max(...rows.map((r) => [...String(get(r))].length), h.length));
  const line = (cells) => cells.map((c, i) => pad(c, widths[i])).join('  ').trimEnd();
  console.log(line(cols.map(([h]) => h)));
  for (const r of rows) console.log(line(cols.map(([, get]) => get(r))));

  if (!opts.local) {
    const notCached = rows
      .filter((r) => r.round === '2' && staticTargets.has(r.path) && r.cf !== 'HIT')
      .map((r) => `${r.path} (${r.cf})`);
    if (notCached.length) {
      console.log('\nhint: Cloudflare did not serve these from the edge:');
      for (const n of notCached) console.log(`  - ${n}`);
      console.log('      REVALIDATED/DYNAMIC/MISS is a zone cache-rule or token problem, not an origin failure.');
      console.log('      See design/cdn-cache.md (tools/cf-cache-rules.mjs, Zone:Cache Rules:Edit) or configure');
      console.log('      Cache Rules in the Cloudflare dashboard.');
    }
  }

  if (failures.length) {
    console.error(`\nFAIL (${failures.length})`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(opts.assertOrigin ? '\nOK: origin cache-control matches the path rules' : '\nOK');
}

main().catch((err) => {
  console.error(`cdn-audit: ${err.message}`);
  process.exit(1);
});
