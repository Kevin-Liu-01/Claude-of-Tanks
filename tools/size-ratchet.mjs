// The size ratchet: a hand-written source file over 1,500 lines may not grow unless the same commit records a bump
// with its reason (practice audit 2026-11-26, mechanism 10). First-party tooling: Kevin B. Liu.
//
// tools/size-ratchet.json records each such file's size. A file's limit is its last bump's `to`, or `start`. The check
// (`npm run lint` runs it) fails on:
//   - growth:     a file past its limit;
//   - unrecorded: a file over the threshold with no entry (a new big file, or one that crossed 1,500 lines);
//   - bad bump:   a bump without a reason, or not above the limit before it;
//   - raised:     a `start` raised above the merge base's limit without a bump (when git can name the base).
// `exempt` names append-only registries (each with its reason) that every lane adds a row to, such as the receipt
// registry: a bump there per lane would only buy merge conflicts on this JSON. Keep the list short.
// A file that shrank, went under the threshold or was deleted is a notice, not a failure: `--tighten` records the
// lower sizes (lanes that only shrink a file never touch the JSON, so they never conflict on it). Hero-tank work in
// tankFactoryCore and the profiles stays possible: grow the file and record the bump in the same commit.
//
//   node tools/size-ratchet.mjs                                   check (exit 1 on a failure)
//   node tools/size-ratchet.mjs --bump=<path> --why="<reason>"    record the file's current size as a bump
//   node tools/size-ratchet.mjs --tighten                         lower every limit to the current size; drop stale rows
//   node tools/size-ratchet.mjs --init                            record every file over the threshold at its size (the
//                                                                 ratchet's start, or a re-baseline Main asks for)
//   node tools/size-ratchet.mjs --base=<ref>                      the ref whose JSON `raised` compares to
//                                                                 (default: the merge base with origin/main)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const RATCHET_FILE = 'tools/size-ratchet.json';
const SOURCE = ['*.ts', '*.tsx', '*.mts', '*.mjs', '*.js', '*.cjs', '*.rs', '*.css', '*.html'];
// generated files are their generator's size, not an author's (.gitattributes marks them linguist-generated)
const GENERATED = /\.generated\.[a-z]+$/;
const MIN_WHY = 10;

/** Lines as `wc -l` counts them. */
export const lineCount = (text) => {
  let lines = 0;
  for (let index = text.indexOf('\n'); index !== -1; index = text.indexOf('\n', index + 1)) lines += 1;
  return lines;
};

/** The ratchet's limit for one entry: its last bump, or its start. */
export const limitOf = (entry) => entry?.bumps?.length ? entry.bumps.at(-1).to : entry?.start;

/** Hand-written tracked sources (git's index) and their line counts, as { path: lines }. */
export function measureSources(root = REPO_ROOT) {
  const files = execFileSync('git', ['ls-files', '-z', '--', ...SOURCE], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0').filter((file) => file && !GENERATED.test(file));
  const sizes = {};
  for (const file of files) {
    try { sizes[file] = lineCount(readFileSync(join(root, file), 'utf8')); } catch { /* deleted in the working tree */ }
  }
  return sizes;
}

/**
 * Compare measured sizes with the ratchet. Returns { failures: [{ file, rule, message }], notices: [...] }.
 * `base` is the ratchet at the merge base (or null), for the `raised` rule.
 */
export function checkRatchet(ratchet, sizes, { base = null } = {}) {
  const threshold = ratchet.threshold;
  const failures = [], notices = [];
  const fail = (file, rule, message) => failures.push({ file, rule, message });
  const note = (file, rule, message) => notices.push({ file, rule, message });
  const exempt = ratchet.exempt ?? {};
  for (const [file, why] of Object.entries(exempt)) {
    if (typeof why !== 'string' || why.trim().length < MIN_WHY) fail(file, 'bad-exempt', 'an exemption gives no reason');
    if (ratchet.files[file]) fail(file, 'bad-exempt', 'exempt and recorded at once; keep one');
    if (sizes[file] === undefined) note(file, 'stale', 'exempt but no longer tracked; drop the exemption');
  }
  for (const [file, entry] of Object.entries(ratchet.files)) {
    let previous = entry.start;
    for (const bump of entry.bumps ?? []) {
      if (typeof bump.why !== 'string' || bump.why.trim().length < MIN_WHY) fail(file, 'bad-bump', `a bump to ${bump.to} gives no reason`);
      if (!(Number.isInteger(bump.to) && bump.to > previous)) fail(file, 'bad-bump', `a bump to ${bump.to} is not above ${previous}`);
      previous = bump.to;
    }
    const baseEntry = base?.files?.[file];
    if (baseEntry && entry.start > limitOf(baseEntry) && !(entry.bumps ?? []).length) {
      fail(file, 'raised', `start ${entry.start} is above the base's limit ${limitOf(baseEntry)} with no bump; record a bump with its reason`);
    }
    const lines = sizes[file];
    const limit = limitOf(entry);
    if (lines === undefined) note(file, 'stale', 'no longer tracked; --tighten drops the row');
    else if (lines > limit) {
      fail(file, 'growth', `${lines} lines, ${lines - limit} over its recorded ${limit}: split it, or record a bump in the same commit `
        + `(node tools/size-ratchet.mjs --bump=${file} --why="<reason>")`);
    } else if (lines <= threshold) note(file, 'under', `${lines} lines, under ${threshold}; --tighten drops the row`);
    else if (lines < limit) note(file, 'shrank', `${lines} lines, ${limit - lines} under its recorded ${limit}; --tighten lowers it`);
  }
  for (const [file, lines] of Object.entries(sizes)) {
    if (lines > threshold && !ratchet.files[file] && !Object.hasOwn(exempt, file)) {
      fail(file, 'unrecorded', `${lines} lines, over ${threshold} with no entry: split it, or record it with its reason `
        + `(node tools/size-ratchet.mjs --bump=${file} --why="<reason>")`);
    }
  }
  return { failures, notices };
}

/** Record `file`'s current size as a bump (or, for a new file, its start with the reason). */
export function bumpRatchet(ratchet, file, lines, why) {
  if (typeof why !== 'string' || why.trim().length < MIN_WHY) throw new Error(`--why needs a reason of ${MIN_WHY} characters or more`);
  const entry = ratchet.files[file];
  const files = { ...ratchet.files };
  if (!entry) files[file] = { start: lines, why: why.trim() };
  else if (lines <= limitOf(entry)) throw new Error(`${file}: ${lines} lines is within its recorded ${limitOf(entry)}; no bump needed`);
  else files[file] = { ...entry, bumps: [...(entry.bumps ?? []), { to: lines, why: why.trim() }] };
  return { ...ratchet, files };
}

/** A fresh ratchet: every measured file over the threshold at its current size (exemptions kept). */
export function initRatchet(sizes, threshold = 1500, exempt = {}) {
  return { threshold, exempt, files: Object.fromEntries(Object.entries(sizes)
    .filter(([file, lines]) => lines > threshold && !Object.hasOwn(exempt, file)).map(([file, lines]) => [file, { start: lines }])) };
}

/** Lower each limit to the current size and drop rows that are gone or under the threshold. Never raises. */
export function tightenRatchet(ratchet, sizes) {
  const files = {};
  for (const [file, entry] of Object.entries(ratchet.files)) {
    const lines = sizes[file];
    if (lines === undefined || lines <= ratchet.threshold) continue;
    files[file] = lines < limitOf(entry) ? { start: lines } : entry;
  }
  return { ...ratchet, files };
}

/** The JSON text: one row per file, sorted, so a bump is a one-line diff. */
export function formatRatchet(ratchet) {
  const rows = (map) => Object.keys(map).sort().map((file) => `    ${JSON.stringify(file)}: ${JSON.stringify(map[file])}`).join(',\n');
  return `{\n  "threshold": ${ratchet.threshold},\n  "exempt": {\n${rows(ratchet.exempt ?? {})}\n  },\n  "files": {\n${rows(ratchet.files)}\n  }\n}\n`;
}

/** The ratchet at `ref` (default: the merge base with origin/main), or null when git cannot name it. */
export function baseRatchet(root = REPO_ROOT, ref = null) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  try {
    const commit = ref ?? git('merge-base', 'HEAD', 'origin/main');
    return JSON.parse(git('show', `${commit}:${RATCHET_FILE}`));
  } catch {
    return null;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
  const path = join(REPO_ROOT, RATCHET_FILE);
  const sizes = measureSources();
  let previous = null;
  try { previous = JSON.parse(readFileSync(path, 'utf8')); } catch { /* none yet */ }
  const ratchet = process.argv.includes('--init') ? null : previous;
  if (!ratchet) {
    const fresh = initRatchet(sizes, previous?.threshold ?? 1500, previous?.exempt ?? {});
    writeFileSync(path, formatRatchet(fresh));
    console.log(`[size-ratchet] recorded ${Object.keys(fresh.files).length} files over ${fresh.threshold} lines`);
  } else if (arg('bump')) {
    const file = arg('bump');
    if (sizes[file] === undefined) throw new Error(`${file}: not a tracked hand-written source`);
    writeFileSync(path, formatRatchet(bumpRatchet(ratchet, file, sizes[file], arg('why'))));
    console.log(`[size-ratchet] ${file}: recorded ${sizes[file]} lines; commit ${RATCHET_FILE} with the change`);
  } else if (process.argv.includes('--tighten')) {
    const tightened = tightenRatchet(ratchet, sizes);
    writeFileSync(path, formatRatchet(tightened));
    console.log(`[size-ratchet] tightened: ${Object.keys(ratchet.files).length} → ${Object.keys(tightened.files).length} rows`);
  } else {
    const { failures, notices } = checkRatchet(ratchet, sizes, { base: baseRatchet(REPO_ROOT, arg('base') ?? null) });
    for (const row of failures) console.log(`${row.file}  ${row.rule}  ${row.message}`);
    if (process.argv.includes('--verbose')) for (const row of notices) console.log(`${row.file}  ${row.rule} (notice)  ${row.message}`);
    console.log(`[size-ratchet] ${Object.keys(ratchet.files).length} files over ${ratchet.threshold} lines recorded: `
      + `${failures.length} failure(s), ${notices.length} notice(s)${notices.length ? ' (--verbose lists them; --tighten records them)' : ''}`);
    if (failures.length) process.exitCode = 1;
  }
}
