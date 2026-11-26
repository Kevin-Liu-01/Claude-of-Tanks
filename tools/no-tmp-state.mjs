// No log, receipt or store a later run reads may live in /tmp (practice audit 2026-11-26, mechanism 10). First-party
// tooling: Kevin B. Liu.
//
// The 2026-11-26 00:35 reboot (the system file table filled) wiped /tmp and $TMPDIR: the capture lock's hold log, the
// browser guard's trip log, every queued ticket and the receipt result cache went with it. tools/durable-paths.mjs
// names where such state lives now. This scan reads every tool's code lines (not comments, not receipts: a receipt's
// fixtures are scratch by design) and flags:
//   - persisted: a /tmp path or tmpdir() on a line that names a log, receipt, evidence or proof;
//   - tmp-path:  a fixed /tmp (or /private/tmp, /var/folders) path that no per-run name (process.pid, mkdtemp) makes
//                scratch: shared state or a default output;
//   - tmpdir:    a fixed store under tmpdir() with no per-run name.
// Locks, queues and scratch that a reboot should clear are ALLOWED in tools/no-tmp-state-allowed.mjs, each with its
// reason (a data module: this one runs git, so a path it named would read as a tool it runs).
//
//   node tools/no-tmp-state.mjs            the repository's tools/ (exit 1 on a finding)
//   node tools/no-tmp-state.mjs --lanes    also report (never fail) the lane scripts in ~/cot-lanes/*-notes and
//                                          ~/cot-lanes/*.{sh,zsh}, which live outside the repository
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALLOWED } from './no-tmp-state-allowed.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export { ALLOWED };

const TMP_PATH = /['"`](?:\/private)?\/tmp(?:\/|['"`])|['"`]\/var\/folders\//;
const TMPDIR_CALL = /\btmpdir\(\)/;
const PER_RUN = /process\.pid|mkdtemp|randomUUID|randomBytes/;
// a word that names output a later run or a person reads; `.log` as a file suffix, not console.log(
const PERSISTED = /(?:^|[^A-Za-z.])(?:logs?|log(?:Dir|File|Path)|receipts?|evidence|proofs?)(?![A-Za-z])|\.log(?![A-Za-z(])/i;
const COMMENT = /^\s*(?:\/\/|\/\*|\*|#)/;
const SCANNED = /\.(?:mjs|cjs|js|ts|mts|sh|zsh|bash|py)$/;
const RECEIPT = /\.(?:selftest|test-support)\.mjs$/;
// this scan and its exceptions hold the patterns as data
const SELF = new Set(['tools/no-tmp-state.mjs', 'tools/no-tmp-state-allowed.mjs']);

/** Findings in one file's text: { file, line, rule, text }. */
export function scanText(file, text, { allowed = ALLOWED } = {}) {
  const findings = [];
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (COMMENT.test(line)) continue;
    const code = line.replace(/\s\/\/\s.*$/, ''); // a trailing comment is prose
    const tmpPath = TMP_PATH.test(code), tmpDir = TMPDIR_CALL.test(code);
    if (!tmpPath && !tmpDir) continue;
    if (allowed.some((entry) => entry.file === file && line.includes(entry.includes))) continue;
    const rule = PERSISTED.test(code) ? 'persisted' : PER_RUN.test(code) ? null : tmpPath ? 'tmp-path' : 'tmpdir';
    if (rule) findings.push({ file, line: index + 1, rule, text: line.trim().slice(0, 160) });
  }
  return findings;
}

/** ALLOWED entries that match no line any more (a moved or deleted literal keeps no stale exception). */
export function staleAllowed(texts, allowed = ALLOWED) {
  return allowed.filter((entry) => !(texts.get(entry.file) ?? '').split('\n').some((line) => line.includes(entry.includes)));
}

/** The repository's scanned tool files (git's index), receipts excluded. */
export function repoToolFiles(root = REPO_ROOT) {
  return execFileSync('git', ['ls-files', '-z', '--', 'tools'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0').filter((file) => SCANNED.test(file) && !RECEIPT.test(file) && !SELF.has(file));
}

/** Lane scripts outside the repository: ~/cot-lanes/*.{sh,zsh} and every script under ~/cot-lanes/*-notes. */
export function laneScriptFiles(lanesRoot = join(homedir(), 'cot-lanes')) {
  const files = [];
  let names = [];
  try { names = readdirSync(lanesRoot); } catch { return files; }
  const walk = (dir, depth) => {
    let entries = [];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory() && depth < 3) walk(path, depth + 1);
      else if (entry.isFile() && /\.(?:sh|zsh|bash)$/.test(entry.name)) files.push(path);
    }
  };
  for (const name of names) {
    const path = join(lanesRoot, name);
    if (/\.(?:sh|zsh|bash)$/.test(name)) files.push(path);
    else if (name.endsWith('-notes')) { try { if (statSync(path).isDirectory()) walk(path, 0); } catch { /* gone */ } }
  }
  return files.sort();
}

/** Lane-script findings: every /tmp path (a lane script has no per-run exception: its waits and logs are the risk). */
export function scanLaneText(file, text) {
  const findings = [];
  text.split('\n').forEach((line, index) => {
    if (COMMENT.test(line) || !/(?:^|[\s"'=(:])(?:\/private)?\/tmp\/|\/var\/folders\//.test(line)) return;
    findings.push({ file, line: index + 1, rule: /until|while|sleep/.test(line) ? 'waits-on-tmp' : 'tmp-path', text: line.trim().slice(0, 160) });
  });
  return findings;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = repoToolFiles();
  const texts = new Map(files.map((file) => [file, readFileSync(join(REPO_ROOT, file), 'utf8')]));
  const findings = files.flatMap((file) => scanText(file, texts.get(file)));
  const stale = staleAllowed(texts);
  for (const finding of findings) console.log(`${finding.file}:${finding.line}  ${finding.rule}  ${finding.text}`);
  for (const entry of stale) console.log(`tools/no-tmp-state.mjs ALLOWED: no line of ${entry.file} has ${entry.includes}; remove the entry`);
  console.log(`[no-tmp-state] ${files.length} tool files: ${findings.length} finding(s), ${stale.length} stale exception(s)`
    + `${findings.length ? '; move logs and stores with tools/durable-paths.mjs, or allow a lock or scratch path with its reason' : ''}`);
  if (process.argv.includes('--lanes')) {
    const lanes = laneScriptFiles();
    const laneFindings = lanes.flatMap((file) => { try { return scanLaneText(file, readFileSync(file, 'utf8')); } catch { return []; } });
    const home = homedir();
    for (const finding of laneFindings) console.log(`~/${relative(home, finding.file)}:${finding.line}  ${finding.rule}  ${finding.text}`);
    console.log(`[no-tmp-state] report only: ${lanes.length} lane scripts, ${laneFindings.length} /tmp line(s) in `
      + `${new Set(laneFindings.map((finding) => finding.file)).size} script(s); a reboot clears these paths`);
  }
  if (findings.length || stale.length) process.exitCode = 1;
}
