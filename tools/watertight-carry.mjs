// Named carries for the fleet watertight gate (test-speed R7c, 2026-10-16).
//
// The gate (src/vehicles/watertightAudit.test-support.mjs, run on every tank by fleetPassDefault) fails any hull whose
// deep interior the exterior water reaches past WATERTIGHT_MAX_LEAK_L with its shipped fills. 32 hulls leaked at the
// 226 freeze, so fleetPassDefault was red on every run: it hid new leaks among the known ones (the 226 fills
// regression, 62 to 71 leaking hulls, surfaced hours late) and its red runs were re-run alone at every gate.
//
// docs/geometry-gate/watertight-carry.json names each inherited leaker with its leak volume in litres (at the
// measurement's own 0.01 L resolution), an owner, the date it was carried and its cause. The gate passes a leaking hull
// only while it is listed and measures exactly its listed volume (0.01 L). It fails on:
//   - any leaking hull without a row (a new leak);
//   - any listed hull that measures more than its row (a carried leak that grew);
//   - any listed hull that now holds water (the row is stale: delete it, so it can never excuse a later leak).
// Rows are deleted or lowered, never raised to make a red pass. A stale moving-clearance record still fails the gate
// whatever the list says.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WATERTIGHT_MAX_LEAK_L } from './tank-watertight-measure.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** The named-carry list the fleet watertight gate reads. */
export const WATERTIGHT_CARRY_FILE = resolve(ROOT, 'docs/geometry-gate/watertight-carry.json');
const ROW_FIELDS = ['cause', 'date', 'leakL', 'owner'];

/** The list's `tanks` table, { [id]: { leakL, owner, date, cause } }. A missing or unreadable list throws. */
export function readWatertightCarries(file = WATERTIGHT_CARRY_FILE) {
  const list = JSON.parse(readFileSync(file, 'utf8'));
  if (!list || typeof list.tanks !== 'object' || Array.isArray(list.tanks)) throw new Error(`${file}: no "tanks" table`);
  return list.tanks;
}

/** Every problem with a carry table, as strings (empty when the table is well formed). `roster` is the fleet's ids. */
export function validateWatertightCarries(tanks, roster) {
  const problems = [];
  const known = new Set(roster);
  const ids = Object.keys(tanks);
  const sorted = [...ids].sort();
  if (ids.join() !== sorted.join()) problems.push('rows are not sorted by id');
  for (const id of ids) {
    const row = tanks[id];
    if (!known.has(id)) problems.push(`${id}: not a fleet id (renamed or retired? move or delete the row)`);
    if (!row || typeof row !== 'object' || Array.isArray(row)) { problems.push(`${id}: the row is not an object`); continue; }
    const fields = Object.keys(row).sort();
    if (fields.join() !== ROW_FIELDS.join()) problems.push(`${id}: fields are ${fields.join(', ')}; expected ${ROW_FIELDS.join(', ')}`);
    const { leakL, owner, date, cause } = row;
    if (!(typeof leakL === 'number' && Number.isFinite(leakL) && leakL > WATERTIGHT_MAX_LEAK_L)) {
      problems.push(`${id}: leakL ${leakL} must be a number of litres above the ${WATERTIGHT_MAX_LEAK_L} L gate`);
    } else if (+leakL.toFixed(2) !== leakL) problems.push(`${id}: leakL ${leakL} is finer than the measurement's 0.01 L`);
    if (typeof owner !== 'string' || !owner.trim()) problems.push(`${id}: no owner`);
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))
      || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) problems.push(`${id}: date ${date} is not YYYY-MM-DD`);
    if (typeof cause !== 'string' || cause.trim().length < 20) problems.push(`${id}: no cause`);
  }
  return problems;
}

/**
 * Judge one pass's measurements against the carries.
 * @param {{ leaks: { id: string, leakL: number, text: string }[], watertight: Iterable<string>,
 *   carries: Record<string, { leakL: number }> }} input leaks = every hull past the gate (text = its measured report),
 *   watertight = every measured hull that held water
 * @returns {{ failures: string[], carried: { id: string, leakL: number, carriedL: number }[] }}
 */
export function judgeWatertightCarries({ leaks, watertight, carries }) {
  const failures = [], carried = [];
  for (const { id, leakL, text } of leaks) {
    const row = Object.hasOwn(carries, id) ? carries[id] : null;
    if (!row) failures.push(`${text} [no named carry]`);
    else if (!(leakL <= row.leakL)) failures.push(`${text} [grew past its named carry of ${row.leakL} L]`);
    // A ratchet (229, critic r1): a carried hull that leaks less pins its row down, so the slack a partial fix leaves
    // can never excuse a later regrowth. The measurement is deterministic at 0.01 L.
    else if (leakL < row.leakL) failures.push(`${text} [below its named carry of ${row.leakL} L: lower its row to ${leakL} L]`);
    else carried.push({ id, leakL, carriedL: row.leakL });
  }
  for (const id of watertight) {
    if (Object.hasOwn(carries, id)) {
      failures.push(`${id}: holds water now [stale named carry of ${carries[id].leakL} L: delete its row]`);
    }
  }
  return { failures, carried };
}
