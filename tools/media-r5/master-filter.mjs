// An optional local pass over the masters before any delivery is encoded from them.
//
// When the environment names an executable in COT_MASTER_FILTER (or shots/media-r5/master-filter exists and is
// executable), every master goes through it once:
//   <filter> still <in.png> <out.png> <id>     a still master, written to <out.png>
//   <filter> film  <in> <out.mov> <id>         a film master, written to <out.mov>
// and the deliveries are encoded from its output. With no filter configured, stills are copied byte for byte and
// films are read as rendered, exactly as before. A configured filter that fails stops the run: a delivery is never
// encoded half-filtered.
import { execFileSync } from 'node:child_process';
import { accessSync, constants, copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { SHOTS } from './paths.mjs';

const LOCAL = join(SHOTS, 'master-filter');

function executable(file) {
  try { accessSync(file, constants.X_OK); return statSync(file).isFile(); } catch { return false; }
}

/** The configured filter executable, or null. */
export function masterFilter(env = process.env, local = LOCAL) {
  const named = env.COT_MASTER_FILTER;
  if (named) {
    if (!executable(named)) throw new Error(`COT_MASTER_FILTER=${named} is not an executable file`);
    return named;
  }
  return executable(local) ? local : null;
}

function runFilter(filter, args) {
  execFileSync(filter, args, { stdio: ['ignore', 'inherit', 'inherit'] });
}

/** Writes the still master <src> to <dst> (through the filter when one is configured) and returns <dst>. */
export function filterStill(src, dst, id, filter = masterFilter()) {
  mkdirSync(dirname(dst), { recursive: true });
  if (!filter) { copyFileSync(src, dst); return dst; }
  runFilter(filter, ['still', src, dst, id]);
  if (!existsSync(dst)) throw new Error(`master filter wrote no still for ${id}`);
  return dst;
}

/**
 * The still to encode from: <src> itself with no filter, else its filtered copy in <workDir> (made once and reused
 * while it is newer than <src>).
 */
export function filteredStill(src, workDir, id, filter = masterFilter()) {
  if (!filter) return src;
  const dst = join(workDir, `${id}.master.png`);
  if (existsSync(dst) && statSync(dst).mtimeMs >= statSync(src).mtimeMs) return dst;
  return filterStill(src, dst, id, filter);
}

/** The film to encode from: <src> itself with no filter, else its filtered copy in <workDir>. */
export function filteredFilm(src, workDir, id, filter = masterFilter()) {
  if (!filter) return src;
  mkdirSync(workDir, { recursive: true });
  const dst = join(workDir, `${id}.master.mov`);
  runFilter(filter, ['film', src, dst, id]);
  if (!existsSync(dst)) throw new Error(`master filter wrote no film for ${id}`);
  return dst;
}
