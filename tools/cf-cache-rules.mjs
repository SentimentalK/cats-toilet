#!/usr/bin/env node
/* Cloudflare zone Cache Rules for cats-toilet, without wrangler.
 *
 * wrangler manages Workers/Pages/KV/R2 only; zone cache rules live in the
 * Rulesets API (Cache Rules = phase http_request_cache_settings). This script
 * declares the three rules the origin needs, keeps any other rules already on
 * the zone, and never writes the token to disk or logs.
 *
 *   node tools/cf-cache-rules.mjs             # dry run: print the PUT payload
 *   node tools/cf-cache-rules.mjs --dry-run   # same
 *   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ZONE_ID=... node tools/cf-cache-rules.mjs --apply
 *
 * Needs a token with Zone:Read and Zone:Cache Rules:Edit (plus Zone:Cache
 * Purge for the post-deploy purge described in design/cdn-cache.md).
 */
'use strict';

const API = 'https://api.cloudflare.com/client/v4';
const PHASE = 'http_request_cache_settings';
const PREFIX = 'cats-toilet:';

const RULES = [
  {
    description: `${PREFIX} bypass app shell and API`,
    expression: [
      'starts_with(http.request.uri.path, "/api/")',
      'http.request.uri.path eq "/sw.js"',
      'http.request.uri.path eq "/index.html"',
      'http.request.uri.path eq "/manifest.webmanifest"',
      'http.request.uri.path eq "/"',
    ].join(' or '),
    action: 'set_cache_settings',
    action_parameters: { cache: false },
    enabled: true,
  },
  {
    description: `${PREFIX} static assets`,
    expression: 'starts_with(http.request.uri.path, "/assets/")',
    action: 'set_cache_settings',
    action_parameters: {
      cache: true,
      edge_ttl: { mode: 'override_origin', default: 604800 },
      browser_ttl: { mode: 'override_origin', default: 604800 },
    },
    enabled: true,
  },
  {
    description: `${PREFIX} code`,
    expression: 'starts_with(http.request.uri.path, "/js/") or starts_with(http.request.uri.path, "/css/")',
    action: 'set_cache_settings',
    action_parameters: {
      cache: true,
      edge_ttl: { mode: 'override_origin', default: 3600 },
      browser_ttl: { mode: 'override_origin', default: 3600 },
    },
    enabled: true,
  },
];

function usage(code = 0) {
  console.log(`usage: node tools/cf-cache-rules.mjs [--dry-run | --apply]

  --dry-run   print the ruleset PUT without contacting Cloudflare (default)
  --apply     GET the zone entrypoint, merge ${PREFIX}* rules, PUT it back
  --help      show this message

Environment for --apply: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID.
Neither value is written to the repository or printed.`);
  process.exit(code);
}

function parseArgs(argv) {
  let apply = false;
  for (const a of argv) {
    if (a === '--dry-run') apply = false;
    else if (a === '--apply') apply = true;
    else if (a === '--help' || a === '-h') usage(0);
    else {
      console.error(`unknown argument: ${a}`);
      usage(2);
    }
  }
  return { apply };
}

const redact = (text, secret) => (secret ? String(text).split(secret).join('[redacted]') : String(text));

function endpoint(zone) {
  return `${API}/zones/${encodeURIComponent(zone)}/rulesets/phases/${PHASE}/entrypoint`;
}

async function cf(method, url, token, body) {
  const res = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON error page */ }
  return { status: res.status, json, text };
}

function apiError(step, res, token) {
  const messages = (res.json?.errors ?? []).map((e) => `${e.code}: ${e.message}`).join('; ');
  return `${step} failed (HTTP ${res.status})${messages ? `: ${messages}` : `: ${redact(res.text.slice(0, 300), token)}`}`;
}

async function apply(token, zone) {
  const url = endpoint(zone);
  const got = await cf('GET', url, token);
  if (got.status === 404) {
    // The phase ruleset does not exist yet; create it with our rules.
    const created = await cf('POST', `${API}/zones/${encodeURIComponent(zone)}/rulesets`, token, {
      name: 'cats-toilet cache rules',
      kind: 'zone',
      phase: PHASE,
      rules: RULES,
    });
    if (created.status < 200 || created.status >= 300) throw new Error(apiError('POST ruleset', created, token));
    console.log(`created the cache-rules entrypoint for zone ${zone}: HTTP ${created.status}`);
    for (const r of created.json?.result?.rules ?? RULES) console.log(`  - ${r.description || '(no description)'}`);
    return;
  }
  if (got.status !== 200) throw new Error(apiError('GET entrypoint', got, token));
  const existing = got.json?.result?.rules ?? [];

  const keep = existing.filter((r) => !String(r.description ?? '').startsWith(PREFIX));
  const replaced = existing.length - keep.length;
  // Our rules go first: Cloudflare evaluates in order, and these expressions are
  // narrow path prefixes, so they must win over broad zone defaults.
  const rules = [...RULES, ...keep];
  const put = await cf('PUT', url, token, { rules });
  if (put.status < 200 || put.status >= 300) throw new Error(apiError('PUT entrypoint', put, token));

  const result = put.json?.result ?? {};
  console.log(`applied to zone ${zone}: HTTP ${put.status}`);
  console.log(`  rules now: ${(result.rules ?? rules).length} (replaced ${replaced}, kept ${keep.length} other)`);
  for (const r of result.rules ?? rules) console.log(`  - ${r.description || '(no description)'}`);
  console.log('\nPurge the zone after deploying (dashboard) or:');
  console.log(`  curl -X POST "${API}/zones/${zone}/purge_cache" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \\`);
  console.log('       -H "content-type: application/json" --data \'{"purge_everything":true}\'');
}

async function main() {
  const { apply: doApply } = parseArgs(process.argv.slice(2));
  const token = process.env.CLOUDFLARE_API_TOKEN || '';
  const zone = process.env.CLOUDFLARE_ZONE_ID || '';

  if (!doApply) {
    console.log(JSON.stringify({
      method: 'PUT',
      url: zone ? endpoint(zone) : `${API}/zones/<CLOUDFLARE_ZONE_ID>/rulesets/phases/${PHASE}/entrypoint`,
      note: 'dry run: no network. --apply gets the current entrypoint and merges these rules first; other rules are kept.',
      body: { rules: RULES },
    }, null, 2));
    return;
  }

  if (!token || !zone) {
    const missing = [!token && 'CLOUDFLARE_API_TOKEN', !zone && 'CLOUDFLARE_ZONE_ID'].filter(Boolean);
    console.error(`--apply needs ${missing.join(' and ')} in the environment; nothing was sent.`);
    console.error('Create a scoped token with Zone:Read + Zone:Cache Rules:Edit, then re-run.');
    process.exit(1);
  }

  try {
    await apply(token, zone);
  } catch (err) {
    console.error(redact(err.message, token));
    process.exit(1);
  }
}

main().catch((err) => {
  // Last-resort guard: nothing here should carry the token, but redact anyway.
  console.error(redact(err.message, process.env.CLOUDFLARE_API_TOKEN));
  process.exit(1);
});
