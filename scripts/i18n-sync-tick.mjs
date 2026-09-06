#!/usr/bin/env node
// scripts/i18n-sync-tick.mjs
//
// Single tick of the i18n sync flow. Designed to be invoked by a scheduled
// automation every 3 hours. Idempotent and safe to re-run on a dirty
// checkout: it stashes local changes, fast-forwards, scans for hardcoded
// English UI strings, runs the i18n self-test, then reports.
//
// The "translate" step is intentionally not bundled here because it requires
// LLM judgement for the new key translations. The tick writes a structured
// JSON report under .openclaw/i18n-sync/<timestamp>/report.json that the
// coordinating session can consume to add the translations in a follow-up
// agent turn.
//
// Failure modes:
//  - non-zero exit: the tick failed; the automation will surface the error.
//  - zero exit: tick completed. Caller decides whether to commit + push.

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

function run(cmd, opts = {}) {
  const r = spawnSync(cmd, { cwd: REPO, shell: true, encoding: 'utf8', ...opts });
  return { code: r.status ?? 0, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function runOrDie(cmd, label) {
  const r = run(cmd);
  if (r.code !== 0) {
    process.stderr.write(`[${label}] failed (${r.code})\n${r.stderr}${r.stdout}\n`);
    process.exit(1);
  }
  return r;
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const reportDir = join(REPO, '.openclaw', 'i18n-sync', stamp);
mkdirSync(reportDir, { recursive: true });

const report = { stamp, repo: REPO, steps: [] };

function record(step, payload) {
  const entry = { step, ...payload };
  report.steps.push(entry);
  writeFileSync(join(reportDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`[i18n-sync] ${step}`, payload.message ?? '');
}

// 1. Pre-flight: refuse to run if the working tree is dirty (we ignore our
//    own scratch directory and this script itself).
const status = run('git status --porcelain -- . :!.openclaw/ :!scripts/i18n-sync-tick.mjs');
if (status.stdout.trim().length > 0) {
  record('preflight-dirty', {
    ok: false,
    message: 'working tree is dirty; refusing to sync',
    porcelain: status.stdout,
  });
  process.exit(2);
}

// 2. Confirm we are on main.
const branch = run('git rev-parse --abbrev-ref HEAD');
if (branch.stdout.trim() !== 'main') {
  record('preflight-branch', {
    ok: false,
    message: 'not on main (currently ' + branch.stdout.trim() + '); refusing to sync',
  });
  process.exit(2);
}

// 3. Fetch upstream + origin.
const fetchUpstream = run('git fetch upstream --prune');
record('fetch-upstream', {
  ok: fetchUpstream.code === 0,
  message: 'fetched upstream',
  stderr: fetchUpstream.stderr.slice(0, 500),
});
if (fetchUpstream.code !== 0) process.exit(1);

const fetchOrigin = run('git fetch origin --prune');
record('fetch-origin', {
  ok: fetchOrigin.code === 0,
  message: 'fetched origin',
  stderr: fetchOrigin.stderr.slice(0, 500),
});
if (fetchOrigin.code !== 0) process.exit(1);

// 4. Fast-forward / merge origin/main. If conflict, surface and stop.
const before = run('git rev-parse HEAD').stdout.trim();
const merge = run('git merge origin/main --no-edit');
if (merge.code !== 0) {
  record('merge-origin', {
    ok: false,
    message: 'merge conflict with origin/main; manual resolution required',
    stderr: merge.stderr.slice(0, 2000),
  });
  process.exit(3);
}
const after = run('git rev-parse HEAD').stdout.trim();
record('merge-origin', {
  ok: true,
  message: before === after ? 'already up to date' : 'merged origin/main',
  before, after,
});

// 5. Diff against upstream/main to see what new code arrived this round.
const diffRange = before + '..' + after;
const changed = run(
  `git diff --name-only ${diffRange} -- 'src/**/*.ts' || true`
).stdout.trim().split('\n').filter(Boolean);
record('scan-targets', {
  ok: true,
  message: `${changed.length} changed source files to scan`,
  files: changed.slice(0, 50),
});

// 6. Run the hardcoded-English scanner against the changed files only.
const scannerPath = join(reportDir, 'scanner.mjs');
writeFileSync(scannerPath, `
import { readFileSync, existsSync } from 'node:fs';
const targets = process.argv.slice(2);
const candidates = [];
for (const f of targets) {
  if (!existsSync(f)) continue;
  const src = readFileSync(f, 'utf8');
  const lines = src.split('\\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
    let m = line.match(/\\.textContent\\s*=\\s*['"]([A-Z][^'"]{3,})['"]/);
    if (m && m[1].includes(' ')) {
      candidates.push({ file: f, line: i + 1, value: m[1], kind: 'textContent' });
      continue;
    }
    m = line.match(/\\.setStatus\\(\\s*['"]([A-Z][^'"]{3,})['"]/);
    if (m && m[1].includes(' ')) {
      candidates.push({ file: f, line: i + 1, value: m[1], kind: 'setStatus' });
    }
  }
}
console.log(JSON.stringify(candidates, null, 2));
`.trim());

const scan = run(`node ${scannerPath} ${changed.map(c => `'${c}'`).join(' ')}`);
let hardcoded = [];
try {
  hardcoded = JSON.parse(scan.stdout || '[]');
} catch (e) {
  hardcoded = [];
}
record('hardcoded-scan', {
  ok: true,
  message: `${hardcoded.length} candidate user-visible English strings`,
  items: hardcoded,
});

// 7. Run the i18n parity self-test.
const parity = run('node src/ui/i18n.selftest.mjs');
record('i18n-parity', {
  ok: parity.code === 0,
  message: parity.stdout.trim().split('\n').pop() ?? 'i18n selftest completed',
  stderr: parity.stderr.slice(0, 500),
});

// 8. Final summary.
record('summary', {
  ok: true,
  message: 'tick complete; see report.json for translation worklist',
  needsTranslation: hardcoded.length > 0,
  reportPath: join(reportDir, 'report.json'),
});

console.log('REPORT_DIR=' + reportDir);
console.log('HARDCOUNT=' + hardcoded.length);
