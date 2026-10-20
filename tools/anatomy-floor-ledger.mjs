// The sim-floor ledger (227, the guards stream; the MP lane's draft after the 226 gate): a committed, per-id record of
// each tank's belly pan, track-contact bottom and combat hull box, the authority inputs a visual change can move
// without anyone noticing.
//
// How 226 slipped: an accessory added to close a Garage sightline (the T-90AM / T-90M Proryv folded dozer blade,
// bacd46c57) hung 23 cm under the belly, track to track. The next fleet regen re-measured both tanks: the combat hull
// floor went 0.42 -> 0.1995 and trackContact.panYM 0.42 -> 0.198, and the bots' moving-battle hit rate went 75.0 % ->
// 78.9 %. The anatomy check passed, because it compares a fresh measurement with the regenerated file, which by then
// held the new values; and the regen's commit read as routine. Nothing compared a tank's sim floor across the regen.
//
// This module is the pure half: the ledger's shape, the committed calibration rows, the comparison, the accept notes
// and the ranking of culprit parts. It never builds a tank. tools/anatomy-floor-blame.mjs builds one drifting tank to
// name the parts; tools/anatomy-floor-drift.mjs is the command line; tools/gen-combat-anatomy.mjs gates its own
// fresh measurement against this ledger in both its write and --check modes.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TANK_ID_SCHEMA } from '../src/vehicles/tankIdAliases.ts';

export const SIM_FLOOR_LEDGER = 'docs/geometry-gate/sim-floors.json';
// The calibration the runtime loads: the aggregate names every group file. Both literals let the receipt cache hash
// the inputs this module reads (tools/selftest-inputs.mjs follows path literals; a directory is hashed whole).
const ANATOMY_AGGREGATE = 'src/vehicles/combatAnatomyCalibrations.ts';
const ANATOMY_GROUP_DIR = 'src/vehicles/combatAnatomyGroups';
/** A move larger than this fails unless it is accepted with a reason. Exactly 5 cm still passes. */
export const FLOOR_DRIFT_TOLERANCE_M = 0.05;
const EPS = 1e-9;
/** The local calendar date (the lanes' notes and commits use local dates), YYYY-MM-DD. */
const localDate = () => new Date().toLocaleDateString('en-CA');

/**
 * The gated fields. `frame` is where the value is measured: `root` (the tank root, trackContact as
 * src/vehicles/restPoseContact.ts publishes it), `hull` (the hull rig, the combat hull box gen-combat-anatomy
 * measures from the structural 'hull' / 'hullGun' armour buckets) or `turret` (the turret rig, the combat turret
 * box's floor from the structural 'turret' bucket: a part hung under the turret drops the turret's shell box exactly
 * as the 226 blade dropped the hull's; null for a casemate whose turret is only a gun-pivot helper).
 */
export const FLOOR_FIELDS = Object.freeze([
  Object.freeze({ key: 'panYM', label: 'belly pan (trackContact.panYM)', frame: 'root', axis: 1, side: 'min' }),
  Object.freeze({ key: 'bottomYM', label: 'track contact bottom (trackContact.bottomYM)', frame: 'root', axis: 1, side: 'min' }),
  Object.freeze({ key: 'hullFloorY', label: 'combat hull floor (hull.min[1])', frame: 'hull', axis: 1, side: 'min' }),
  Object.freeze({ key: 'hullRoofY', label: 'combat hull roof (hull.max[1])', frame: 'hull', axis: 1, side: 'max' }),
  Object.freeze({ key: 'hullMinX', label: 'combat hull side -x (hull.min[0])', frame: 'hull', axis: 0, side: 'min' }),
  Object.freeze({ key: 'hullMaxX', label: 'combat hull side +x (hull.max[0])', frame: 'hull', axis: 0, side: 'max' }),
  Object.freeze({ key: 'hullTailZ', label: 'combat hull tail (hull.min[2])', frame: 'hull', axis: 2, side: 'min' }),
  Object.freeze({ key: 'hullBowZ', label: 'combat hull bow (hull.max[2])', frame: 'hull', axis: 2, side: 'max' }),
  Object.freeze({ key: 'turretFloorY', label: 'combat turret floor (turret.min[1])', frame: 'turret', axis: 1, side: 'min' }),
]);

/** A ledger row's gated values, as stored: `{ panYM, bottomYM, hullMin: [x, y, z], hullMax: [x, y, z], turretMinY }`. */
export function floorRowOf(calibration, id = '?') {
  const contact = calibration?.trackContact;
  const hull = calibration?.hull;
  if (!contact || !hull || !Array.isArray(hull.min) || !Array.isArray(hull.max)) {
    throw new Error(`[sim-floors] ${id}: the calibration has no trackContact or hull box`);
  }
  const num = (value) => (value == null || !Number.isFinite(value) ? null : Number(value));
  return {
    panYM: num(contact.panYM),
    bottomYM: num(contact.bottomYM ?? 0),
    hullMin: hull.min.map(num),
    hullMax: hull.max.map(num),
    turretMinY: num(calibration.turret?.min?.[1]),
  };
}

export function fieldValue(row, field) {
  if (!row) return null;
  if (field.frame === 'root') return row[field.key] ?? null;
  if (field.frame === 'turret') return row.turretMinY ?? null;
  return (field.side === 'min' ? row.hullMin : row.hullMax)?.[field.axis] ?? null;
}

const sameRow = (a, b) => FLOOR_FIELDS.every((field) => fieldValue(a, field) === fieldValue(b, field));

/**
 * Compare ledger rows with current rows for `ids`. Returns the drifts (per id, every field that moved by more than
 * the tolerance, or appeared/disappeared), the ids without a ledger row, the ledger rows whose id left the fleet
 * (only when `fleetIds` is given), and how many ids moved within the tolerance (reported, never failed).
 */
export function compareFloorRows(ledgerRows, currentRows, { ids, fleetIds = null, toleranceM = FLOOR_DRIFT_TOLERANCE_M } = {}) {
  const drifts = new Map();
  const missing = [];
  const within = [];
  for (const id of ids ?? Object.keys(currentRows)) {
    const current = currentRows[id];
    if (!current) throw new Error(`[sim-floors] ${id}: no current calibration row`);
    const recorded = ledgerRows[id];
    if (!recorded) { missing.push(id); continue; }
    const moved = [];
    for (const field of FLOOR_FIELDS) {
      const from = fieldValue(recorded, field);
      const to = fieldValue(current, field);
      if (from === to) continue;
      const delta = from == null || to == null ? null : to - from;
      if (delta === null || Math.abs(delta) > toleranceM + EPS) moved.push({ field, from, to, delta });
    }
    if (moved.length) drifts.set(id, moved);
    else if (!sameRow(recorded, current)) within.push(id);
  }
  const fleet = fleetIds ? new Set(fleetIds) : null;
  const extra = fleet ? Object.keys(ledgerRows).filter((id) => !fleet.has(id)).sort() : [];
  return { drifts, missing, extra, within, ok: !drifts.size && !missing.length && !extra.length };
}

const fmt = (value) => (value == null ? 'null' : Number(value).toFixed(4).replace(/\.?0+$/, '') || '0');
const signed = (delta) => (delta == null ? 'n/a' : `${delta >= 0 ? '+' : ''}${delta.toFixed(4)} m`);

/** One readable line per moved field, then the culprit parts the blame found (when it ran). */
export function formatFloorDrift(id, moved, culprits = null) {
  const lines = [];
  for (const { field, from, to, delta } of moved) {
    lines.push(`  ${id}: ${field.label} ${fmt(from)} -> ${fmt(to)} (${signed(delta)})`);
    const found = culprits?.get?.(field.key);
    if (!found) continue;
    if (found.note) lines.push(`      ${found.note}`);
    for (const part of found.parts) lines.push(`      ${describePart(part, field)}`);
    if (!found.parts.length && !found.note) lines.push('      no authored part explains it (instanced running gear or a regrouped bucket: inspect the build)');
  }
  return lines;
}

function describePart(part, field) {
  const box = (values) => `[${values.map((v) => v.toFixed(3)).join(', ')}]`;
  const where = part.site ? ` at ${part.site}${part.caller ? ` <- ${part.caller}` : ''}` : ' (site unknown: regrouped after the builder)';
  const extreme = field.side === 'min' ? part.min[field.axis] : part.max[field.axis];
  const axisName = 'xyz'[field.axis];
  return `${part.bucket}${part.module ? `/${part.module}` : ''} part, ${axisName} ${extreme.toFixed(3)}, box ${box(part.min)}..${box(part.max)}${where}`;
}

/**
 * Rank the parts that explain one moved field. `parts` are the tank's live parts in that field's frame:
 * `{ bucket, module, min, max, site, caller, structural, turretStructural, primary, centreSpanning, visible }`: the hull
 * box fields read the structural parts (the roof only the primary ones, gen-combat-anatomy's roof cap), the turret
 * floor the structural turret parts, the belly pan the visible parts of meshes that cross the centreline, the track
 * bottom every visible part.
 * - An outward move (a floor or a side that went further out): the parts beyond the recorded value, the furthest first.
 *   The first one is the new extent.
 * - An inward move: no current part can be the one that left, so the parts that now set the extent are listed, with a
 *   note that the old extreme was removed, raised or moved out of the bucket.
 */
export function rankFloorCulprits(field, from, to, parts, { limit = 6 } = {}) {
  const eligible = parts.filter((part) => {
    if (field.key === 'hullRoofY') return part.primary;
    if (field.frame === 'turret') return part.turretStructural;
    if (field.frame === 'hull') return part.structural;
    if (field.key === 'panYM') return part.centreSpanning && part.visible;
    return part.visible;
  });
  const value = (part) => (field.side === 'min' ? part.min[field.axis] : part.max[field.axis]);
  const outward = from == null || to == null ? true : (field.side === 'min' ? to < from : to > from);
  const beyond = (part) => (field.side === 'min' ? value(part) < from - 0.005 : value(part) > from + 0.005);
  const order = (a, b) => (field.side === 'min' ? value(a) - value(b) : value(b) - value(a));
  if (outward && from != null) {
    return { parts: eligible.filter(beyond).sort(order).slice(0, limit), note: null };
  }
  const setters = to == null ? [] : eligible.filter((part) => Math.abs(value(part) - to) <= 0.01).sort(order).slice(0, limit);
  return {
    parts: setters,
    note: `the part that set ${fmt(from)} was removed, raised or moved out of the measured buckets; the extent now rests on:`,
  };
}

// ---------------------------------------------------------------- author sites

// The factory and its tagging ports forward a profile's P.add: plumbing, never the author (the same rule as
// tools/spare-track-placement-check.mjs authorOf).
const FACTORY_FILE = /^vehicles\/(tankFactoryCore|tankFactory|spareTrackSeat|tankBuilderPort)\.ts$/;
const PLUMBING_FN = /^(add|addEquipment|addHatch|addCupola|addExternalArmor|addModuleVisual|addMudguard|partCensus|<anon>|Proxy\.<anonymous>)$/;
const SRC_FRAME = /\/src\/(.+?\.ts):(\d+):\d+/;

/** The `src/**.ts` frames of a V8 stack, innermost first: `{ fn, file: 'vehicles/profiles/t90.ts', line }`. */
export function parseStackFrames(stack) {
  const frames = [];
  for (const line of String(stack).split('\n').slice(1)) {
    const match = line.match(/at (?:(.+?) \()?(.+?)\)?$/);
    const where = match?.[2]?.match(SRC_FRAME);
    if (!where) continue;
    frames.push({ fn: (match[1] || '<anon>').replace(/^Object\./, '').replace(/^new /, ''), file: where[1], line: Number(where[2]) });
  }
  return frames;
}

/** The innermost vehicle frame outside the factory plumbing (the author), and the vehicle frame that called it. */
export function authorSite(frames) {
  const label = (frame) => `${frame.fn}@${frame.file.replace(/^vehicles\//, '')}:${frame.line}`;
  const index = frames.findIndex((frame) => frame.file.startsWith('vehicles/') && !FACTORY_FILE.test(frame.file)
    && !PLUMBING_FN.test(frame.fn));
  if (index < 0) return { site: null, caller: null };
  const caller = frames.slice(index + 1).find((frame) => frame.file.startsWith('vehicles/') && !FACTORY_FILE.test(frame.file)
    && frame.fn !== frames[index].fn);
  return { site: label(frames[index]), caller: caller ? label(caller) : null };
}

// ---------------------------------------------------------------- files

/** The committed calibration rows, read as data (the generated group files' frozen JSON), no TypeScript import. */
export function readCommittedCalibrations(root = process.cwd()) {
  const aggregate = readFileSync(join(root, ANATOMY_AGGREGATE), 'utf8');
  const groups = [...aggregate.matchAll(/from '\.\/combatAnatomyGroups\/([\w.-]+\.generated\.ts)'/g)].map((m) => m[1]);
  if (!groups.length) throw new Error(`[sim-floors] ${ANATOMY_AGGREGATE} names no calibration group`);
  const rows = {};
  for (const group of groups) {
    const text = readFileSync(join(root, ANATOMY_GROUP_DIR, group), 'utf8');
    const start = text.indexOf('Object.freeze(');
    const end = text.lastIndexOf(');');
    if (start < 0 || end <= start) throw new Error(`[sim-floors] ${group}: not a gen-combat-anatomy group file`);
    Object.assign(rows, JSON.parse(text.slice(start + 'Object.freeze('.length, end)));
  }
  return rows;
}

/** Ledger schema 2 (2026-10-19, guards 229): rows carry turretMinY (the combat turret floor) beside the hull box. */
export const SIM_FLOOR_SCHEMA = 2;

export function readFloorLedger(root = process.cwd()) {
  const ledger = JSON.parse(readFileSync(join(root, SIM_FLOOR_LEDGER), 'utf8'));
  if (ledger.schema !== SIM_FLOOR_SCHEMA || !ledger.rows || typeof ledger.rows !== 'object') {
    throw new Error(`[sim-floors] ${SIM_FLOOR_LEDGER}: unknown ledger shape`);
  }
  if (ledger.tankIdSchema !== TANK_ID_SCHEMA) {
    throw new Error(`[sim-floors] ${SIM_FLOOR_LEDGER} is keyed by tank id schema ${ledger.tankIdSchema}; this build writes `
      + `${TANK_ID_SCHEMA}: re-key it with the rename map (src/vehicles/tankIdAliases.ts) in one pass`);
  }
  return ledger;
}

export function emptyFloorLedger() {
  return {
    schema: SIM_FLOOR_SCHEMA,
    tool: 'tools/anatomy-floor-drift.mjs',
    tankIdSchema: TANK_ID_SCHEMA,
    toleranceM: FLOOR_DRIFT_TOLERANCE_M,
    about: 'Per tank: trackContact.panYM (belly pan) and bottomYM in the root frame; the combat hull box min/max (x, y, z) '
      + 'in the hull rig frame; turretMinY, the combat turret box floor in the turret rig frame (null without a fighting '
      + 'turret); all in metres, as tools/gen-combat-anatomy.mjs measures them. A move over toleranceM fails '
      + 'the anatomy regen, its --check and npm test, naming the parts responsible. Change a row only with '
      + '`node tools/anatomy-floor-drift.mjs --accept=<ids>:<reason>` (or gen-combat-anatomy --accept-floor=, or '
      + 'COT_ACCEPT_FLOOR_DRIFT): the row records the old values, the reason, who and when.',
    rows: {},
  };
}

/** Stable text: one id per line, so a lane's accept is a one-line diff and merges cleanly beside other lanes'. */
export function serializeFloorLedger(ledger) {
  const { rows, ...head } = ledger;
  const ids = Object.keys(rows).sort();
  const body = ids.map((id, index) => `    ${JSON.stringify(id)}: ${JSON.stringify(rows[id])}${index < ids.length - 1 ? ',' : ''}`);
  const headLines = Object.entries(head).map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)},`);
  return `{\n${headLines.join('\n')}\n  "rows": {\n${body.join('\n')}\n  }\n}\n`;
}

export function writeFloorLedger(ledger, root = process.cwd()) {
  writeFileSync(join(root, SIM_FLOOR_LEDGER), serializeFloorLedger(ledger));
}

// ---------------------------------------------------------------- accept

/**
 * Accepts from the command line (`--accept=a,b:reason` or gen-combat-anatomy's `--accept-floor=a,b:reason`, each
 * repeatable) and the environment (`COT_ACCEPT_FLOOR_DRIFT='a,b:reason; c:other reason'`, which reaches
 * gen-combat-anatomy through an npm chain). A reason is required: at least 12 characters, saying what moved and why.
 */
export function parseFloorAccepts(argv = [], env = {}, flag = '--accept=') {
  const specs = argv.filter((arg) => arg.startsWith(flag)).map((arg) => arg.slice(flag.length));
  if (env.COT_ACCEPT_FLOOR_DRIFT) specs.push(...String(env.COT_ACCEPT_FLOOR_DRIFT).split(';'));
  const accepts = [];
  for (const spec of specs.map((s) => s.trim()).filter(Boolean)) {
    const colon = spec.indexOf(':');
    const ids = (colon < 0 ? '' : spec.slice(0, colon)).split(',').map((id) => id.trim()).filter(Boolean);
    const reason = colon < 0 ? '' : spec.slice(colon + 1).trim();
    if (!ids.length || reason.length < 12) {
      throw new Error(`[sim-floors] accept "${spec}": write <id>[,<id>]:<reason>, the reason saying what moved and why `
        + '(at least 12 characters), e.g. t90am:blade re-seated above the belly');
    }
    accepts.push({ ids, reason });
  }
  return accepts;
}

/**
 * Rewrite the accepted ids' rows to their current values with a note of the old values. An id whose row already
 * matches is reported as unchanged and keeps its row (and any earlier note) as it is.
 */
export function acceptFloorRows(ledger, currentRows, accepts, { by = 'unknown', date = localDate() } = {}) {
  const changed = [];
  const unchanged = [];
  for (const { ids, reason } of accepts) {
    for (const id of ids) {
      const current = currentRows[id];
      if (!current) throw new Error(`[sim-floors] accept ${id}: no calibration row for that id`);
      const row = floorRowOf(current, id);
      const recorded = ledger.rows[id];
      if (recorded && sameRow(recorded, row)) { unchanged.push(id); continue; }
      const from = {};
      for (const field of FLOOR_FIELDS) {
        const old = fieldValue(recorded, field);
        if (old !== fieldValue(row, field)) from[field.key] = old;
      }
      ledger.rows[id] = { ...row, accepted: { reason, by, date, from: recorded ? from : 'no earlier row' } };
      changed.push(id);
    }
  }
  return { changed, unchanged };
}

/**
 * Rows for new ids, recorded as their first measurement; never touches an existing row. A new id is one the committed
 * calibration has never measured (`committed`: the calibration rows on disk before this run writes, as
 * readCommittedCalibrations reads them). A calibrated tank without a ledger row is REFUSED, never seeded: its row was
 * removed or lost, and seeding the fresh measurement would launder whatever drift the regen carries as a "first
 * measurement" (critic, 227 guards round 1). The caller fails on a refused id (compareFloorRows reports it missing)
 * after comparing the fresh measurement with the committed calibration; only an accept with a reason records it.
 */
export function seedFloorRows(ledger, currentRows, ids, { committed, by = 'unknown', date = localDate() } = {}) {
  if (!committed || typeof committed !== 'object') throw new Error('[sim-floors] seedFloorRows needs the committed calibration rows');
  const seeded = [];
  const refused = [];
  for (const id of ids) {
    if (ledger.rows[id]) continue;
    if (committed[id]) { refused.push(id); continue; }
    ledger.rows[id] = { ...floorRowOf(currentRows[id], id), accepted: { reason: 'first measurement', by, date, from: 'no earlier row' } };
    seeded.push(id);
  }
  return { seeded, refused };
}

/** The accept command a failure prints, ready to edit. */
export function acceptHint(ids) {
  return `node tools/anatomy-floor-drift.mjs --accept=${ids.join(',')}:'<what moved and why>'`;
}
