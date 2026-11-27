// Gate P18 (2026-10-01): where the receipt result cache lives. tools/selftest-cache.mjs keys its
// default directory on the origin remote URL, and GitHub already reports that the repository
// moved: updating the remote would silently cold-start every proof (a 30-70 min run). The
// identity here is the repository's root commit, which no clone, fork or remote rename changes.
// The first run under it adopts the URL-keyed directory through a relative symlink, so existing
// proofs keep counting and runners on older code (which still compute the URL-keyed directory)
// share one store. A shallow clone or a checkout without Git keeps the URL-keyed directory.
// This lives outside selftest-cache.mjs on purpose: that file salts every proof key, so editing
// it would cold-start every receipt by itself.
//
// Practice audit 2026-11-26 (mechanism 10): the store lives under ${XDG_CACHE_HOME:-~/.cache}/cot-selftests, not
// $TMPDIR. The 00:35 reboot wiped $TMPDIR and cold-started every proof. The first run moves the $TMPDIR store there
// and leaves a link at its old place, so runners on older copies of this file (other lanes' worktrees) keep writing
// into the one durable store. Every later run puts that link back after a reboot clears it.
import { execFileSync } from 'node:child_process';
import { lstatSync, mkdirSync, readdirSync, readlinkSync, realpathSync, renameSync, rmdirSync, rmSync, statSync, symlinkSync,
  unlinkSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { cotCacheDir } from './durable-paths.mjs';
import { defaultSelftestCacheDir, SELFTEST_CACHE_VERSION, sha1 } from './selftest-cache.mjs';

const isDir = (path) => { try { return statSync(path).isDirectory(); } catch { return false; } };

/** The oldest root commit of HEAD, or null for a shallow clone, a missing Git or a non-repository. */
export function readRootCommit(root, run = (args) => execFileSync('git', args, {
  cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
})) {
  try {
    if (run(['rev-parse', '--is-shallow-repository']).trim() !== 'false') return null;
    // rev-list lists newest first; the last root is the oldest, which a later merge of an
    // unrelated history does not replace.
    const roots = run(['rev-list', '--max-parents=0', 'HEAD']).split('\n').map((line) => line.trim())
      .filter((line) => /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(line));
    return roots.at(-1) ?? null;
  } catch {
    return null;
  }
}

/** The durable per-format base: ${XDG_CACHE_HOME:-~/.cache}/cot-selftests/v<format>. */
export function durableSelftestCacheBase(env = process.env) {
  return join(cotCacheDir('cot-selftests', { env }), `v${SELFTEST_CACHE_VERSION}`);
}

/**
 * { dir, legacyDir, tmpDir, identity }: dir is the durable store; tmpDir is where copies of this file before the
 * audit kept it (in $TMPDIR, keyed alike), which dir takes over; legacyDir is the URL-keyed directory that tmpDir
 * adopted (Gate P18), if any.
 */
export function selftestCacheLocations(root, env = process.env, { rootCommit = readRootCommit } = {}) {
  if (env.COT_SELFTEST_CACHE_DIR) {
    return { dir: resolve(env.COT_SELFTEST_CACHE_DIR), legacyDir: null, tmpDir: null, identity: 'COT_SELFTEST_CACHE_DIR' };
  }
  const legacyDir = defaultSelftestCacheDir(root, env);
  const base = durableSelftestCacheBase(env);
  const commit = rootCommit(root);
  // no root commit (a shallow clone, no Git): the URL- or path-keyed name, under the durable base
  if (!commit) return { dir: join(base, basename(legacyDir)), legacyDir: null, tmpDir: legacyDir, identity: 'origin remote (no root commit)' };
  const name = sha1(`root-commit:${commit}`);
  return { dir: join(base, name), legacyDir, tmpDir: join(dirname(legacyDir), name), identity: `root commit ${commit}` };
}

const lstatOrNull = (path) => { try { return lstatSync(path); } catch { return null; } };

/** Point `from` at `to` through a link, replacing whatever link is there (never a real directory). */
function linkInPlace(from, to) {
  const stat = lstatOrNull(from);
  if (stat && !stat.isSymbolicLink()) return false;
  if (stat) { try { if (readlinkSync(from) === to) return true; } catch { /* replace it */ } }
  const temporary = `${from}.${process.pid}.link`;
  try {
    mkdirSync(dirname(from), { recursive: true });
    symlinkSync(to, temporary);
    renameSync(temporary, from);
    return true;
  } catch {
    try { unlinkSync(temporary); } catch { /* never created */ }
    return false;
  }
}

const realOrNull = (path) => { try { return realpathSync(path); } catch { return null; } };

/**
 * Move every entry of `from` into `to`: an entry `to` lacks is renamed in; a directory both hold is merged; on a file
 * both hold the newer one stays (proofs are named by their inputs, so either is valid; edges.json and runtimes.json are
 * caches). Returns true when `from` ended empty and was removed (an older copy may write into it meanwhile).
 */
function mergeInto(from, to) {
  let names = [];
  try { names = readdirSync(from); } catch { return false; }
  for (const name of names) {
    const source = join(from, name), target = join(to, name);
    try {
      const targetStat = lstatOrNull(target);
      if (!targetStat) { renameSync(source, target); continue; }
      const sourceStat = lstatSync(source);
      if (sourceStat.isDirectory() && targetStat.isDirectory()) { mergeInto(source, target); continue; }
      if (sourceStat.mtimeMs > targetStat.mtimeMs) { rmSync(target, { recursive: true, force: true }); renameSync(source, target); }
      else rmSync(source, { recursive: true, force: true });
    } catch { /* a concurrent runner moved or wrote it; the next run picks it up */ }
  }
  try { rmdirSync(from); return true; } catch { return false; }
}

/**
 * Move the $TMPDIR store to the durable dir and leave a link at its old place. Returns 'moved' (the store moved),
 * 'merged' (dir already existed, as when a receipt wrote to it first or an older copy made a fresh $TMPDIR store
 * after a reboot: the $TMPDIR store's entries moved in), 'present' (dir exists and $TMPDIR already leads to it; the
 * link is put back after a reboot), 'kept' (a merge left entries an older copy was still writing; the next run
 * finishes it), 'none' (nothing to move) or 'failed' (dir is not usable; the caller falls back to tmpDir).
 */
export function moveTmpSelftestCache(dir, tmpDir) {
  if (!tmpDir || resolve(tmpDir) === resolve(dir)) return 'none';
  if (isDir(dir)) {
    const source = isDir(tmpDir) ? realOrNull(tmpDir) : null;
    if (source && source !== realOrNull(dir)) {
      if (!mergeInto(source, dir)) return 'kept';
      linkInPlace(source, dir);
      if (resolve(source) !== resolve(tmpDir)) linkInPlace(tmpDir, dir);
      return 'merged';
    }
    linkInPlace(tmpDir, dir);
    return 'present';
  }
  let source = null;
  try { source = isDir(tmpDir) ? resolve(dirname(tmpDir), lstatSync(tmpDir).isSymbolicLink() ? readlinkSync(tmpDir) : basename(tmpDir)) : null; } catch { /* none */ }
  if (!source || !isDir(source) || lstatOrNull(source)?.isSymbolicLink()) {
    try { mkdirSync(dir, { recursive: true }); } catch { return 'failed'; }
    linkInPlace(tmpDir, dir);
    return 'none';
  }
  try {
    mkdirSync(dirname(dir), { recursive: true });
    renameSync(source, dir); // one volume on macOS ($TMPDIR and home); a concurrent runner may win the rename
  } catch {
    if (!isDir(dir)) { try { mkdirSync(dir, { recursive: true }); } catch { return 'failed'; } }
  }
  // the old name (and the root-commit alias, when the store was the URL-keyed one) now lead to the durable store
  linkInPlace(source, dir);
  if (resolve(source) !== resolve(tmpDir)) linkInPlace(tmpDir, dir);
  return 'moved';
}

/**
 * One-time migration: link dir to legacyDir when dir does not exist yet. Returns
 * 'linked', 'present' (dir already exists), 'fresh' (nothing to adopt), 'none' or 'failed'.
 * Concurrent runners may race; each renames an identical link into place.
 */
export function adoptLegacySelftestCache(dir, legacyDir) {
  if (!legacyDir || resolve(legacyDir) === resolve(dir)) return 'none';
  let stat = null;
  try { stat = lstatSync(dir); } catch (error) { if (error.code !== 'ENOENT') return 'failed'; }
  if (stat) {
    if (!stat.isSymbolicLink() || isDir(dir)) return 'present';
    try { unlinkSync(dir); } catch { return 'failed'; } // a dangling link: its target was removed
  }
  if (!isDir(legacyDir)) return 'fresh';
  const temporary = `${dir}.${process.pid}.link`;
  try {
    mkdirSync(dirname(dir), { recursive: true });
    // relative: both directories live in the same per-user cache base
    symlinkSync(dirname(dir) === dirname(legacyDir) ? basename(legacyDir) : resolve(legacyDir), temporary);
    renameSync(temporary, dir);
    return 'linked';
  } catch {
    try { unlinkSync(temporary); } catch { /* never created */ }
    return isDir(dir) ? 'present' : 'failed';
  }
}

/**
 * The runner's cache directory. Before the move: the $TMPDIR store adopts the URL-keyed one (Gate P18); then it moves
 * to the durable dir. If the durable dir cannot be made, the run uses the $TMPDIR store as before.
 */
export function resolveSelftestCacheDir(root, env = process.env, options = {}) {
  const location = selftestCacheLocations(root, env, options);
  if (!location.tmpDir) return { ...location, adoption: 'none', move: 'none' };
  const adoption = isDir(location.dir) ? 'present' : adoptLegacySelftestCache(location.tmpDir, location.legacyDir);
  const move = moveTmpSelftestCache(location.dir, location.tmpDir);
  return { ...location, dir: move === 'failed' ? location.tmpDir : location.dir, adoption, move };
}
