// Outputs that appear whole or not at all (2026-11-02 audit S5). site-loops.mjs encoded every format straight to its
// final name and decided "up to date" by existence and mtime, so a run killed mid-encode (a signal, a laptop sleep) left
// a truncated file newer than its master: the next run reported "formats up to date" and site-media shipped it; a
// truncated film proxy even let --drop-film-masters delete the only good copy. Each output is now written under a
// partial name beside its final one and renamed over it once whole (one atomic step on one filesystem); a failure
// removes the partial. A file at a final name is therefore always complete.
import { copyFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';

const PARTIAL = /^\..+\.partial-(\d+)(\.[^.]*)?$/;

/** The partial name an output is written under: hidden, beside it, its extension kept (ffmpeg picks the muxer by it). */
export function partialPath(final) {
  return join(dirname(final), `.${basename(final)}.partial-${process.pid}${extname(final)}`);
}

/** Write `final` through `write(partial)` (sync), then rename it into place; on a throw the partial goes. Returns `final`. */
export function writeAtomic(final, write) {
  const partial = partialPath(final);
  try {
    write(partial);
    renameSync(partial, final);
  } catch (error) {
    try { unlinkSync(partial); } catch { /* never written */ }
    throw error;
  }
  return final;
}

/** writeFileSync, whole or not at all. */
export const writeFileAtomic = (final, data) => writeAtomic(final, (partial) => writeFileSync(partial, data));
/** copyFileSync, whole or not at all. */
export const copyFileAtomic = (source, final) => writeAtomic(final, (partial) => copyFileSync(source, partial));

/** Remove the partials a killed run left in `dir` (any pid but a live one): returns their names. */
export function sweepPartials(dir) {
  let names;
  try { names = readdirSync(dir); } catch { return []; }
  const removed = [];
  for (const name of names) {
    const match = PARTIAL.exec(name);
    if (!match) continue;
    const pid = Number(match[1]);
    let live = false;
    try { process.kill(pid, 0); live = pid !== process.pid; } catch (error) { live = error.code === 'EPERM'; }
    if (live) continue;
    try { unlinkSync(join(dir, name)); removed.push(name); } catch { /* raced */ }
  }
  return removed;
}
