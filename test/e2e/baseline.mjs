import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const TMP = '/home/sentimentalk/codes/temp/cat-002';
const WORKTREE = path.join(TMP, 'baseline-wt');
const DB = path.join(TMP, 'e2e', 'base.db');
const OUTPUT = path.join(TMP, 'baseline-output.txt');
const BASE_REV = 'fcc2dc0';
const PORT = 8793;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => {
      out += d;
      process.stdout.write(d);
    });
    child.stderr.on('data', (d) => {
      out += d;
      process.stderr.write(d);
    });
    child.on('error', (e) => resolve({ code: -1, out: out + String(e) }));
    child.on('close', (code) => resolve({ code, out }));
  });
}

function failures(tap) {
  const lines = tap.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^not ok \d+ - (.*)$/.exec(lines[i].trim());
    if (!m) continue;
    let error = '';
    for (let j = i + 1; j < lines.length && !/^not ok \d+ - /.test(lines[j].trim()); j++) {
      const hit = /^\s*error: (.*)$/.exec(lines[j]);
      if (!hit) continue;
      const rest = hit[1].trim();
      if (rest && rest !== '|-' && rest !== '|') {
        error = rest.replace(/^['"]|['"]$/g, '');
        break;
      }
      for (let k = j + 1; k < lines.length; k++) {
        const line = lines[k].trim();
        if (!line) continue;
        error = line;
        break;
      }
      break;
    }
    out.push({ name: m[1].trim(), error });
  }
  return out;
}

function counts(tap) {
  const pick = (label) => {
    const m = new RegExp(`^# ${label} (\\d+)$`, 'm').exec(tap);
    return m ? Number(m[1]) : null;
  };
  return { pass: pick('pass'), fail: pick('fail') };
}

await mkdir(path.join(TMP, 'e2e'), { recursive: true });
await run('git', ['worktree', 'remove', '--force', WORKTREE], { cwd: ROOT });
await run('git', ['worktree', 'prune'], { cwd: ROOT });
for (const suffix of ['', '-wal', '-shm']) await rm(DB + suffix, { force: true });

const added = await run('git', ['worktree', 'add', '--detach', WORKTREE, BASE_REV], { cwd: ROOT });
if (added.code !== 0) {
  console.error(`baseline: could not check out ${BASE_REV}`);
  process.exit(1);
}

let server = null;
try {
  server = await startServer({ port: PORT, dbPath: DB, root: WORKTREE });
  console.log(`\nbaseline: ${BASE_REV} served on ${BASE_URL}\n`);

  const test = await run(process.execPath, ['--test', '--test-reporter=tap', 'test/e2e/requirements.test.mjs'], {
    cwd: ROOT,
    env: { ...process.env, E2E_BASE_URL: BASE_URL },
  });
  await writeFile(OUTPUT, test.out);

  const failed = failures(test.out);
  const { pass, fail } = counts(test.out);
  console.log('\n===== baseline summary =====');
  console.log(`# pass ${pass}`);
  console.log(`# fail ${fail}`);
  for (const f of failed) console.log(`- ${f.name}\n    ${f.error}`);
  console.log(`raw output: ${OUTPUT}`);
} finally {
  if (server) await server.stop().catch(() => {});
  await run('git', ['worktree', 'remove', '--force', WORKTREE], { cwd: ROOT });
}
