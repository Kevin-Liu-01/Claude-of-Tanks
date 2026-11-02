// A lane's red receipts, each its own or inherited (267, Main: "lanes hand-prove 'red on base too' in every READY"). First-party
// tooling: Kevin B. Liu. test:lane hands this every receipt that ended red (STARVED is not red); each is re-run alone
// here and on the lane's merge base, by the gate's own rule (tools/gate.mjs compareRedReceipt: the first error, paths,
// temporary directories and timings normalised, a differing pair re-run once):
//   INHERITED  it fails on the base with the same failure (gate.mjs failureKey: other measurements, counts and lists
//              alike, both texts printed);
//   OWN        it passes on the base (or is new), or its failure differs from the base's;
//   FLAKY      it passes alone here: it went red beside the pool (reported, not the lane's).
// test:lane's exit counts only OWN.
//
// A base result is kept in the shared receipt cache (lane-base/ under tools/selftest-cache-dir.mjs's directory, one per
// repository on this machine) under the receipt's input fingerprint on the base tree (selftest-cache.mjs inputKey), so
// another lane on the same base, or on any base where the receipt's inputs are the same, reuses it. A receipt that reads
// Git state keys on the base commit too; one with a timing check, a browser or a computed import is the machine's and
// runs every time. The fingerprints a base worktree gives are indexed by commit (and Node, platform and NODE_OPTIONS),
// so a lane on a base another lane classified needs no worktree at all.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { compareRedReceipt, failureSignature, openBaselineWorktree } from './gate.mjs';

export const LANE_RED_CLASS = Object.freeze({ inherited: 'INHERITED', flaky: 'FLAKY', regression: 'OWN', changed: 'OWN', unstable: 'OWN' });
const WHY = Object.freeze({
  inherited: 'the same failure on the base', flaky: 'passes alone here (red beside the pool)', regression: 'passes on the base',
  changed: 'its failure differs from the base\'s', unstable: 'the base fails with a different message each run',
});
const sha1 = (text) => createHash('sha1').update(text).digest('hex');

/**
 * How a receipt's base result may be reused: 'inputs' (its input fingerprint holds all it reads), 'commit' (it reads Git
 * state: the fingerprint and the base commit) or null (a timing check, a browser or a computed import: run every time).
 */
export function baseReuse(cache, root, file) {
  const reason = cache.liveReason(file);
  if (!reason) return 'inputs';
  if (!/Git state/.test(reason)) return null;
  const browser = [...cache.runSetOf(resolve(root, file))].some((module) => cache.metadataOf(module)?.browser);
  return browser ? null : 'commit';
}

/** The store of base results: { fingerprintOf, recordFingerprint, resultOf, recordResult } under `dir`. */
export function createBaseStore(dir, { commit, env = process.env }) {
  const salt = sha1(`${process.version}\0${process.platform}/${process.arch}\0${env.NODE_OPTIONS ?? ''}`).slice(0, 12);
  const indexPath = join(dir, `fingerprints-${commit}-${salt}.json`);
  const entryPath = (file, key) => join(dir, `${sha1(file)}-${key}.json`);
  const read = (path) => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; } };
  const write = (path, value) => {
    mkdirSync(dir, { recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(value) + '\n'); renameSync(temporary, path);
  };
  return {
    /** { key } or { missing: true } (no such receipt on the base), or undefined when no lane has looked. */
    fingerprintOf: (file) => read(indexPath)?.[file],
    // racing lanes may each drop the other's row: it costs a worktree later, never a wrong result
    recordFingerprint: (file, value) => write(indexPath, { ...(read(indexPath) ?? {}), [file]: value }),
    resultOf: (file, key) => { const entry = read(entryPath(file, key)); return entry?.file === file && entry.key === key ? entry : null; },
    recordResult: (file, key, result) => write(entryPath(file, key), { file, key, ...result, at: new Date().toISOString() }),
  };
}

/**
 * Classify the lane's red receipts. `runFile(file, { cwd, logFile })` runs one receipt ({ status }); `makeCache(dir)` gives
 * the receipt cache of a checkout (its inputKey, liveReason, runSetOf, metadataOf); `headCache` is this checkout's.
 * Returns { rows: [{ file, verdict, class, why, here, base }], own, worktree } (worktree: whether one was opened).
 */
export async function classifyLaneReds(reds, { root, commit, headCache, makeCache, storeDir, logDir, runFile,
  openWorktree = openBaselineWorktree, log = console.log }) {
  const store = createBaseStore(storeDir, { commit });
  let worktree = null, baseCache = null;
  const base = () => {
    if (!worktree) {
      log(`[test:lane] reds: a worktree of the merge base ${commit.slice(0, 12)} for the base results no lane has kept`);
      worktree = openWorktree(root, commit, join(logDir, `base-${commit.slice(0, 12)}`));
      baseCache = makeCache(worktree.dir);
    }
    return worktree;
  };
  const signatureOf = (logFile) => {
    try { return failureSignature(readFileSync(logFile, 'utf8'), [root, ...(worktree ? [worktree.dir] : [])]); } catch { return ''; }
  };
  // the base's result for a receipt, reused when a lane kept one for its fingerprint; null when it must run
  const fingerprint = (file, reuse) => {
    const known = store.fingerprintOf(file);
    if (known) return known;
    const dir = base().dir;
    let value;
    if (!existsSync(join(dir, file))) value = { missing: true };
    else {
      const key = baseCache.inputKey(file).key;
      value = { key: reuse === 'commit' ? sha1(`${key}\0${commit}`) : key };
    }
    store.recordFingerprint(file, value);
    return value;
  };
  const baseResults = new Map();
  const baseOf = async (file, logFile) => {
    if (baseResults.has(file)) return baseResults.get(file);
    const reuse = baseReuse(headCache, root, file);
    const known = reuse ? fingerprint(file, reuse) : null;
    let result;
    if (known?.missing) result = { status: 0, missing: true, log: '' };
    else {
      const kept = known && store.resultOf(file, known.key);
      if (kept) result = { status: kept.status, message: kept.message || undefined, cached: true, log: '' };
      else {
        const dir = base().dir;
        if (!existsSync(join(dir, file))) result = { status: 0, missing: true, log: '' };
        else {
          const run = await runFile(file, { cwd: dir, logFile });
          result = { status: run.status, log: logFile, message: run.status === 0 ? '' : (signatureOf(logFile) || `exit status ${run.status}`) };
          if (known?.key && Number.isInteger(run.status) && run.status < 128) {
            store.recordResult(file, known.key, { status: run.status, message: result.message, commit });
          }
        }
      }
    }
    baseResults.set(file, result);
    return result;
  };
  // the gate's pair: here and on the base at once; a base result already known is not run again
  const runPair = async (file, attempt) => {
    const logs = { here: join(logDir, 'here', `${file}.${attempt}.log`), base: join(logDir, 'base', `${file}.${attempt}.log`) };
    const [here, baseResult] = await Promise.all([runFile(file, { cwd: root, logFile: logs.here }), baseOf(file, logs.base)]);
    return { here: { ...here, log: logs.here }, base: baseResult };
  };
  const rows = [];
  try {
    for (const file of reds) {
      const row = await compareRedReceipt(file, { runPair, signatureOf });
      rows.push({ ...row, class: LANE_RED_CLASS[row.verdict], why: WHY[row.verdict] });
    }
  } finally {
    worktree?.remove();
  }
  return { rows, own: rows.filter((row) => row.class === 'OWN').map((row) => row.file), worktree: Boolean(worktree) };
}

/** The lines test:lane prints for the classified reds. */
export function laneRedLines({ rows }, { commit, logDir }) {
  const count = (name) => rows.filter((row) => row.class === name).length;
  const first = (message) => String(message ?? '').split('\n').find((line) => line.trim()) ?? '';
  const lines = [`[test:lane] reds: ${count('OWN')} own, ${count('INHERITED')} inherited, ${count('FLAKY')} flaky (each re-run alone here `
    + `and on the merge base ${commit.slice(0, 12)}; logs ${logDir})`];
  for (const row of rows) {
    const base = row.base.cached ? ' (base result kept by a lane for these inputs)' : row.base.missing ? ' (no such receipt on the base)' : '';
    const message = row.class === 'FLAKY' ? '' : `: ${first((row.confirm ?? row).here.message)}`;
    lines.push(`  ${row.class} ${row.file}: ${row.why}${base}${message}`);
    // both texts whenever they differ: an inherited red keyed alike (gate.mjs failureKey) with other measurements too
    if (row.verdict === 'changed' || row.verdict === 'unstable'
      || (row.class === 'INHERITED' && first(row.base.message) !== first((row.confirm ?? row).here.message))) {
      lines.push(`    base: ${first(row.base.message)}`);
    }
  }
  return lines;
}
