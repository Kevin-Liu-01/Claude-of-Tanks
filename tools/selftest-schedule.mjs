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
