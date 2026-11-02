// Parallel parts of a per-id generator (268, the changed-only chain's --jobs): each part measures its --ids and writes
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

/** sha256 of each file (repository-relative paths under `root`: the chain expands the step's globs). */
export function sharedDigests(root, paths) {
  return new Map(paths.map((path) => [path, createHash('sha256').update(readFileSync(join(root, path))).digest('hex')]));
}

/** The shared files that differ between two digests (written, created or removed), sorted. */
export function movedShared(before, after) {
  return [...new Set([...before.keys(), ...after.keys()])].filter((path) => before.get(path) !== after.get(path)).sort();
}
