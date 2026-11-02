// Parallel parts of a per-id generator (268, the changed-only chain's --jobs; fills keep their own, anatomy, seats,
// spare track and gun lines use these): each part measures its --ids and writes
// their rows into its own scratch directory, reading the tree and writing nothing in it; one merge run takes those rows
// in place of measuring them and writes the shared files (the tables, their index and loader map, the ledgers) once,
// through the generator's own serializer, so N parts write exactly the bytes one process writes. The chain holds the
// step's shared outputs to their digests across the parts (sharedDigests, movedShared): a part that writes one fails
// the step instead of racing another part for it. First-party tooling: Kevin B. Liu.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

const PART_ROWS = 'rows.json';

/** A part's only writer: a file inside its own directory. Any other path (a shared table, an index, a ledger) throws. */
export function partWriter(dir) {
  const home = resolve(dir);
  return (file, contents) => {
    const target = resolve(file), rel = relative(home, target);
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error(`a part writes only inside its own directory ${home}, never ${target}`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
  };
}

/** A part's measured rows ({ id: row }), for `tool`'s merge. */
export function writePartRows(dir, tool, rows) {
  partWriter(dir)(join(dir, PART_ROWS), `${JSON.stringify({ tool, rows })}\n`);
}

/** The rows `tool`'s parts measured, by id. An id two parts measured, or a part of another tool, throws. */
export function readPartRows(dirs, tool) {
  const rows = new Map(), from = new Map();
  for (const dir of dirs) {
    const part = JSON.parse(readFileSync(join(resolve(dir), PART_ROWS), 'utf8'));
    if (part.tool !== tool) throw new Error(`${dir}: a part of ${part.tool}, not ${tool}`);
    for (const [id, row] of Object.entries(part.rows)) {
      if (rows.has(id)) throw new Error(`${id}: measured by more than one --merge-from part (${from.get(id)}, ${dir})`);
      rows.set(id, row);
      from.set(id, dir);
    }
  }
  return rows;
}

/**
 * A per-id generator's parts arguments: `--out-dir=<dir>` runs one part (its --ids measured into dir alone),
 * `--merge-from=<dir>,<dir>` the merge. `take(id)` hands the merge that id's part row once (undefined when no part
 * measured it: the merge measures it itself); `done()` refuses a part row no id of the merge took.
 */
export function partArgs(argv, tool) {
  const value = (name) => argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? '';
  const partDir = value('out-dir') || null, from = value('merge-from');
  if (partDir && from) throw new Error(`${tool}: --out-dir runs one part and --merge-from the merge, never both`);
  if (partDir && !value('ids')) throw new Error(`${tool}: a part (--out-dir) measures --ids`);
  const merged = from ? readPartRows(from.split(','), tool) : null;
  return {
    partDir, merging: !!merged,
    take: (id) => {
      const row = merged?.get(id);
      merged?.delete(id);
      return row;
    },
    done: () => {
      if (merged?.size) throw new Error(`${tool}: --merge-from rows for ids this run does not measure: ${[...merged.keys()].join(', ')}`);
    },
  };
}

/** The files a parts step's merge alone writes (globs): its tables' files (steps.mjs TABLES), `files`, `writes` and
 *  `sharedWrites`. The chain holds them to their digests while the parts run. */
export function sharedOutputs(step, tables) {
  return [...step.outputs.flatMap((name) => tables[name]?.files ?? []), ...(step.files ?? []), ...(step.writes ?? []),
    ...(step.sharedWrites ?? [])];
}

/** sha256 of each file (repository-relative paths under `root`: the chain expands the step's globs). */
export function sharedDigests(root, paths) {
  return new Map(paths.map((path) => [path, createHash('sha256').update(readFileSync(join(root, path))).digest('hex')]));
}

/** The shared files that differ between two digests (written, created or removed), sorted. */
export function movedShared(before, after) {
  return [...new Set([...before.keys(), ...after.keys()])].filter((path) => before.get(path) !== after.get(path)).sort();
}
