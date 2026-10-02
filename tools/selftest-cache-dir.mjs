// Gate P18 (2026-10-01): where the receipt result cache lives. tools/selftest-cache.mjs keys its
// default directory on the origin remote URL, and GitHub already reports that the repository
// moved: updating the remote would silently cold-start every proof (a 30-70 min run). The
// identity here is the repository's root commit, which no clone, fork or remote rename changes.
// The first run under it adopts the URL-keyed directory through a relative symlink, so existing
// proofs keep counting and runners on older code (which still compute the URL-keyed directory)
// share one store. A shallow clone or a checkout without Git keeps the URL-keyed directory.
// This lives outside selftest-cache.mjs on purpose: that file salts every proof key, so editing
// it would cold-start every receipt by itself.
import { execFileSync } from 'node:child_process';
import { lstatSync, mkdirSync, renameSync, statSync, symlinkSync, unlinkSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { defaultSelftestCacheDir, sha1 } from './selftest-cache.mjs';

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

/** { dir, legacyDir, identity }: legacyDir is the URL-keyed directory that dir adopts, if any. */
export function selftestCacheLocations(root, env = process.env, { rootCommit = readRootCommit } = {}) {
  if (env.COT_SELFTEST_CACHE_DIR) {
    return { dir: resolve(env.COT_SELFTEST_CACHE_DIR), legacyDir: null, identity: 'COT_SELFTEST_CACHE_DIR' };
  }
  const legacyDir = defaultSelftestCacheDir(root, env);
  const commit = rootCommit(root);
  if (!commit) return { dir: legacyDir, legacyDir: null, identity: 'origin remote (no root commit)' };
  return { dir: join(dirname(legacyDir), sha1(`root-commit:${commit}`)), legacyDir, identity: `root commit ${commit}` };
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

/** The runner's cache directory, adopting the URL-keyed store on first use. */
export function resolveSelftestCacheDir(root, env = process.env, options = {}) {
  const location = selftestCacheLocations(root, env, options);
  return { ...location, adoption: adoptLegacySelftestCache(location.dir, location.legacyDir) };
}
