// Receipt scheduling for tools/run-selftests.mjs (gate P7, 2026-10-01): which receipts run first.
// Selection and verdicts never depend on this module; only the order in which the pool admits
// work does. The registry order in tools/selftest-suites.mjs stays the reporting order and the
// cold-start fallback.
//
// Run times: the result cache records each PASS's child time (runMs) in its proof records. This
// index keeps the latest observed time per receipt (a PASS, or an ordinary FAIL: red receipts
// re-run every time and include some of the longest) in <cache dir>/runtimes.json, rebuilt once
// from the newest proof record per receipt when absent. It is scheduling metadata only; no proof
// lookup reads it. It lives outside tools/selftest-cache.mjs because that file salts every proof
// key.
import { readdirSync, readFileSync, renameSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const RUNTIME_INDEX_VERSION = 1;
const PROOF_NAME = /^([0-9a-f]{40})-[0-9a-f]{64}\.json$/;
const isRunMs = (value) => Number.isFinite(value) && value >= 0;

function newestProofRunTimes(cacheDir) {
  const found = new Map();
  let names;
  try { names = readdirSync(cacheDir); } catch { return found; }
  const newest = new Map();
  for (const name of names) {
    const match = PROOF_NAME.exec(name);
    if (!match) continue;
    let mtimeMs;
    try { mtimeMs = statSync(join(cacheDir, name)).mtimeMs; } catch { continue; }
    const previous = newest.get(match[1]);
    if (!previous || mtimeMs > previous.mtimeMs) newest.set(match[1], { name, mtimeMs });
  }
  for (const { name } of newest.values()) {
    try {
      const record = JSON.parse(readFileSync(join(cacheDir, name), 'utf8'));
      if (typeof record.file === 'string' && isRunMs(record.runMs)) {
        found.set(record.file, { runMs: Math.round(record.runMs), at: String(record.passedAt ?? '') });
      }
    } catch { /* a racing or partial record is not evidence */ }
  }
  return found;
}

/** The latest observed child run time per receipt, persisted beside the proofs. */
export function createRuntimeIndex(cacheDir, { clock = () => new Date().toISOString() } = {}) {
  const path = join(cacheDir, 'runtimes.json');
  let byFile = null, dirty = false;
  const load = () => {
    if (byFile) return byFile;
    let stored;
    try { stored = JSON.parse(readFileSync(path, 'utf8')); } catch { /* absent or partial */ }
    if (stored?.version === RUNTIME_INDEX_VERSION && stored.byFile && typeof stored.byFile === 'object') {
      byFile = new Map(Object.entries(stored.byFile).filter(([, row]) => isRunMs(row?.runMs)));
    } else {
      byFile = newestProofRunTimes(cacheDir);
      dirty = byFile.size > 0;
    }
    return byFile;
  };
  return {
    path,
    runMsOf(file) { return load().get(file)?.runMs; },
    record(file, runMs) {
      if (!isRunMs(runMs)) return;
      load().set(file, { runMs: Math.round(runMs), at: clock() });
      dirty = true;
    },
    size() { return load().size; },
    persist() {
      if (!dirty || !byFile) return;
      // Concurrent runners merge: the newer observation of a receipt wins.
      let previous;
      try { previous = JSON.parse(readFileSync(path, 'utf8')); } catch { /* absent */ }
      const merged = previous?.version === RUNTIME_INDEX_VERSION && previous.byFile ? { ...previous.byFile } : {};
      for (const [file, row] of byFile) if (!merged[file] || String(merged[file].at) <= row.at) merged[file] = row;
      try {
        mkdirSync(cacheDir, { recursive: true });
        const temporary = `${path}.${process.pid}.tmp`;
        writeFileSync(temporary, JSON.stringify({ version: RUNTIME_INDEX_VERSION, byFile: merged }) + '\n');
        renameSync(temporary, path);
        dirty = false;
      } catch { /* scheduling metadata is best effort */ }
    },
  };
}

/**
 * The run time assumed for a receipt with no observation: the 90th percentile of the known
 * times (at least 1 s). A new receipt is usually short, but a long one admitted last would set
 * the makespan, so unknown work is scheduled early. No observations: 0, i.e. registry order.
 */
export function unknownRunMs(knownRunMs) {
  const known = knownRunMs.filter(isRunMs).sort((a, b) => a - b);
  if (!known.length) return 0;
  return Math.max(1000, known[Math.floor(0.9 * (known.length - 1))]);
}

/**
 * Admission order as registry indices: barrier receipts (exclusive CPU and self-leasing browser
 * checks, which run alone anyway) first in registry order, so no worker idles while the pool
 * drains for them; then longest-first (LPT) by run time; ties keep registry order.
 */
export function admissionOrder(files, { runMsOf = () => undefined, barriers = new Set(), unknownMs } = {}) {
  const observed = files.map((file) => runMsOf(file));
  const fallback = unknownMs ?? unknownRunMs(observed);
  return files.map((file, index) => ({
    index, barrier: barriers.has(file), ms: isRunMs(observed[index]) ? observed[index] : fallback,
  })).sort((a, b) => (Number(b.barrier) - Number(a.barrier))
    || (a.barrier ? 0 : b.ms - a.ms)
    || (a.index - b.index)).map((row) => row.index);
}

// Gate P8 (2026-10-01): receipt selection for targeted runs and CI shards.

/** `--only` globs: `**` spans directories, `*` and `?` stay inside one, `{a,b}` alternates; a trailing `/` selects a tree. */
export function globToRegExp(glob) {
  let source = '', depth = 0;
  for (let index = 0; index < glob.length; index++) {
    const char = glob[index];
    if (char === '*' && glob[index + 1] === '*') {
      index++;
      if (glob[index + 1] === '/') { index++; source += '(?:.*/)?'; } else source += '.*';
    } else if (char === '*') source += '[^/]*';
    else if (char === '?') source += '[^/]';
    else if (char === '{') { depth++; source += '(?:'; }
    else if (char === '}' && depth) { depth--; source += ')'; }
    else if (char === ',' && depth) source += '|';
    else source += char.replace(/[.+^$()|[\]\\{}]/g, '\\$&');
  }
  if (depth) throw new Error(`Unbalanced braces in --only glob: ${glob}`);
  if (glob.endsWith('/')) source += '.*';
  return new RegExp(`^${source}$`);
}

/** Split an `--only` value on commas outside braces. */
export function splitGlobs(value) {
  const parts = [];
  let depth = 0, current = '';
  for (const char of value) {
    if (char === '{') depth++;
    else if (char === '}') depth = Math.max(0, depth - 1);
    if (char === ',' && depth === 0) { if (current) parts.push(current); current = ''; } else current += char;
  }
  if (current) parts.push(current);
  return parts;
}

/** Registry entries matching any glob, in registry order; matching nothing is an error, never an empty gate. */
export function selectReceipts(files, globs) {
  if (!globs?.length) return files;
  const patterns = globs.map(globToRegExp);
  const selected = files.filter((file) => patterns.some((pattern) => pattern.test(file)));
  if (!selected.length) throw new Error(`--only=${globs.join(',')} matched no registered receipt`);
  return selected;
}

/** `i/n` with 1 <= i <= n. */
export function parseShard(value) {
  const match = /^([1-9]\d*)\/([1-9]\d*)$/.exec(value);
  if (!match || Number(match[1]) > Number(match[2])) throw new Error(`--shard must be i/n with 1 <= i <= n, got ${value}`);
  return { index: Number(match[1]), count: Number(match[2]) };
}

/**
 * Deterministic shards balanced by run time: longest-first onto the least-loaded shard (ties:
 * registry order, lowest shard). A barrier runs alone, so it loads its shard as `barrierFactor`
 * workers' worth. Each shard lists registry indices in registry order. Every receipt lands in
 * exactly one shard, and the result depends only on the inputs, so separate CI jobs agree.
 */
export function partitionShards(files, count, { weightOf = () => 1, barriers = new Set(), barrierFactor = 8 } = {}) {
  const loads = new Array(count).fill(0);
  const shards = Array.from({ length: count }, () => []);
  const rows = files.map((file, index) => ({ index, load: (barriers.has(file) ? barrierFactor : 1) * weightOf(file) }))
    .sort((a, b) => b.load - a.load || a.index - b.index);
  for (const row of rows) {
    let target = 0;
    for (let shard = 1; shard < count; shard++) if (loads[shard] < loads[target]) target = shard;
    shards[target].push(row.index);
    loads[target] += row.load;
  }
  return shards.map((list, shard) => ({ indices: list.sort((a, b) => a - b), loadMs: loads[shard] }));
}

/**
 * The committed run-time snapshot (tools/selftest-durations.json) weights shards: the same file at
 * the same commit gives every CI job the same partition, which a per-machine cache could not.
 * Receipts it lacks weigh the median of those it has; without a snapshot every receipt weighs 1.
 */
export const DURATION_SNAPSHOT_URL = new URL('./selftest-durations.json', import.meta.url);
export function loadDurationSnapshot(url = DURATION_SNAPSHOT_URL) {
  try {
    const parsed = JSON.parse(readFileSync(url, 'utf8'));
    return new Map(Object.entries(parsed.runMs ?? {}).filter(([, ms]) => isRunMs(ms)));
  } catch {
    return new Map();
  }
}
export function snapshotWeights(files, snapshot) {
  const known = files.map((file) => snapshot.get(file)).filter(isRunMs).sort((a, b) => a - b);
  if (!known.length) return () => 1;
  const median = known[Math.floor((known.length - 1) / 2)];
  return (file) => isRunMs(snapshot.get(file)) ? snapshot.get(file) : median;
}
export function durationSnapshotText(files, runMsOf) {
  const runMs = {};
  for (const file of [...files].sort()) {
    const ms = runMsOf(file);
    if (isRunMs(ms)) runMs[file] = Math.max(100, Math.round(ms / 100) * 100);
  }
  return JSON.stringify({
    about: 'Per-receipt child run times in ms (rounded to 100) that balance `run-selftests.mjs --shard=i/n` and order a cold pool. Regenerate with `node tools/run-selftests.mjs --write-durations` after a full run; a stale entry only unbalances, it never selects or skips a receipt.',
    runMs,
  }, null, 2) + '\n';
}
