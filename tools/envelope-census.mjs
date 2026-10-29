// The envelope census (264, envelope honesty; the 262 Leopard 2A3 OTCO lane's read-only screen, promoted). A tank's
// combat turret and hull boxes are the bounds of its primary `turret` and `hull` buckets (tools/gen-combat-anatomy.mjs
// PRIMARY_BUCKETS), and every authored main plate is mapped onto them (reconcileFrame, src/vehicles/combatAnatomy.ts).
// A thin frame, rail, chain, basket floor, bin, mudguard or bolt drawn into those buckets therefore inflates the box,
// and every real plate, the ring, the collision slabs and the crew seats move out with it: shots that should find the
// roof or the ring find thick armour. The OTCO's 22 rim and shroud parts did that (2.90 by 4.35 m of composite against
// the 2A3's 2.54 by 4.00, strength 0.527 against 0.303 on identical combat data); in turretEquipment they no longer do.
//
// The rule, per tank and frame: a primary-bucket part is FLAGGED when it stands more than `pastM` past the tank's own
// authored main plates in x or z, and it is thin (its smallest side at most `thinM`) or small (at most `smallShare` of
// the bucket's largest part by box volume). The GROWTH is how far the frame's box shrinks once the flagged parts are
// removed (side, front, rear). It is a screen: a real thin plate forming the outline can flag; those stay, with the
// reason, in the allowance.
//
// The ratchet: docs/geometry-gate/envelope-allowance.json lists every frame that has flagged parts with its count and
// growth. A frame flagging more parts than its row, or growing more than 1 cm past it, fails (a new offender); a frame
// flagging fewer fails until its row is lowered (the allowance only shrinks: `--write-allowance` lowers, never raises).
// `--all --check` holds the fleet to it (assertEnvelopeShard runs one shard of it; the four fleet shards land as core
// receipts in item/envelope-ratchet-265); tools/envelope-census.selftest.mjs holds the rules.
//
// Measured as the anatomy generator measures: the build it calibrates from ({ proceduralOnly, geometryReceipt } in
// measurement mode, so the plates are the authored ones), its rigid rig frames, each part receipt in its owner rig.
//
//   node tools/envelope-census.mjs --ids=kv2,t80 [--sites] [--json]     the frames' flagged parts, with builder lines
//   node tools/envelope-census.mjs --all [--shard=1/4] [--jsonl=<file>]  the fleet (or a shard), one JSON row per id
//   node tools/envelope-census.mjs --all --check                          the fleet against the allowance (exit 1)
//   node tools/envelope-census.mjs --ids=... --write-allowance            lower (or drop) those ids' rows to the fleet
//
// First-party tooling: Kevin B. Liu.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { TANK_ID_SCHEMA } from '../src/vehicles/tankIdAliases.ts';

export const ENVELOPE_ALLOWANCE = 'docs/geometry-gate/envelope-allowance.json';
/** The census rule (the 262 screen's thresholds, unchanged). */
export const ENVELOPE_RULE = Object.freeze({ pastM: 0.05, thinM: 0.07, smallShare: 0.02 });
/** A listed frame may grow this much past its row before it counts as a new offender (geometry noise, not a part). */
export const GROWTH_SLACK_M = 0.01;
export const ENVELOPE_FRAMES = Object.freeze(['turret', 'hull']);
const PLATES_OF = Object.freeze({ turret: 'turretPlates', hull: 'hullPlates' });

const r3 = (value) => Math.round(value * 1000) / 1000;
// exactly at a threshold is inside it (5.000 cm past passes), whatever the float arithmetic left behind
const EPS = 1e-9;
const dims = (box) => box.max.map((value, axis) => value - box.min[axis]);
const volume = (box) => dims(box).reduce((product, side) => product * Math.max(side, 1e-3), 1);

/** The box of a frame's authored main plates (`kind` absent or 'main'), or null. */
export function mainPlateBox(plates) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const plate of plates || []) {
    if ((plate.kind || 'main') !== 'main') continue;
    for (const vertex of plate.verts || []) {
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], vertex[axis]);
        max[axis] = Math.max(max[axis], vertex[axis]);
      }
    }
  }
  return Number.isFinite(min[0]) ? { min, max } : null;
}

function union(boxes) {
  if (!boxes.length) return null;
  return {
    min: [0, 1, 2].map((axis) => Math.min(...boxes.map((box) => box.min[axis]))),
    max: [0, 1, 2].map((axis) => Math.max(...boxes.map((box) => box.max[axis]))),
  };
}

/** How far a part stands past the plate box in x or z (negative: inside it). */
export function pastPlates(part, plate) {
  return Math.max(plate.min[0] - part.min[0], part.max[0] - plate.max[0], plate.min[2] - part.min[2], part.max[2] - plate.max[2]);
}

/**
 * One frame's census. `parts` are the primary bucket's part boxes `{ min, max, site?, caller? }` in the frame the plates
 * are authored in; `plates` the authored plates. Null when there is nothing to judge (no main plates, or fewer than two
 * parts: a lone part is the frame itself).
 */
export function frameCensus(parts, plates, rule = ENVELOPE_RULE) {
  const plate = mainPlateBox(plates);
  if (!plate || parts.length < 2) return null;
  const largest = Math.max(...parts.map(volume));
  const flagged = parts.filter((part) => pastPlates(part, plate) > rule.pastM + EPS
    && (Math.min(...dims(part)) <= rule.thinM + EPS || volume(part) <= largest * rule.smallShare));
  const all = union(parts), kept = union(parts.filter((part) => !flagged.includes(part)));
  if (!kept) return null;
  const growth = {
    side: r3(Math.max(all.max[0] - kept.max[0], kept.min[0] - all.min[0])),
    front: r3(all.max[2] - kept.max[2]),
    rear: r3(kept.min[2] - all.min[2]),
  };
  return {
    parts: parts.length,
    flagged: flagged.sort((a, b) => pastPlates(b, plate) - pastPlates(a, plate)).map((part) => ({
      past: r3(pastPlates(part, plate)),
      dims: dims(part).map(r3),
      at: part.min.map((value, axis) => r3((value + part.max[axis]) / 2)),
      ...(part.site ? { site: part.site } : {}),
      ...(part.caller ? { caller: part.caller } : {}),
    })),
    growth,
    env: [r3(all.max[0] - all.min[0]), r3(all.max[2] - all.min[2])],
    without: [r3(kept.max[0] - kept.min[0]), r3(kept.max[2] - kept.min[2])],
  };
}

/** A frame's growth: the largest of its side, front and rear shrinks. */
export const growthOf = (frame) => (frame ? Math.max(frame.growth.side, frame.growth.front, frame.growth.rear) : 0);

/** The allowance a measured frame would need: [flagged parts, growth m], or null when nothing flags. */
export function allowanceEntry(frame) {
  return frame && frame.flagged.length ? [frame.flagged.length, r3(growthOf(frame))] : null;
}

// ---------------------------------------------------------------- the allowance

/** The committed allowance: `{ schema, tankIdSchema, rule, about, rows: { id: { turret?: [n, g, reason?], hull?: … } } }`. */
export function readAllowance(path = ENVELOPE_ALLOWANCE) {
  const allowance = JSON.parse(readFileSync(path, 'utf8'));
  if (allowance.tankIdSchema !== TANK_ID_SCHEMA) {
    throw new Error(`[envelope-census] ${path} is keyed by tank id schema ${allowance.tankIdSchema}; this build writes `
      + `${TANK_ID_SCHEMA}: re-key it with the rename map (src/vehicles/tankIdAliases.ts) in one pass`);
  }
  return allowance;
}

/** The allowance's canonical text: its header, then one row per id in id order. */
export function serializeAllowance(allowance) {
  const ids = Object.keys(allowance.rows).sort();
  const head = { schema: allowance.schema, tool: 'tools/envelope-census.mjs', tankIdSchema: allowance.tankIdSchema,
    rule: allowance.rule, about: allowance.about };
  const headText = JSON.stringify(head, null, 2).replace(/\n}$/, '');
  const rowText = ids.map((id) => {
    const row = allowance.rows[id];
    const frames = ENVELOPE_FRAMES.filter((frame) => row[frame]).map((frame) => `${JSON.stringify(frame)}: ${JSON.stringify(row[frame])}`);
    return `    ${JSON.stringify(id)}: { ${frames.join(', ')} }`;
  });
  return rowText.length ? `${headText},\n  "rows": {\n${rowText.join(',\n')}\n  }\n}\n` : `${headText},\n  "rows": {}\n}\n`;
}

/**
 * Judge measured rows (`{ id: { turret, hull } }` from measureEnvelope) against the allowance. `ids` are the ids
 * measured; only their rows are judged. Returns `{ offenders, shrinks }`: an offender flags more parts or grows more than
 * its row allows (or has no row); a shrink is a row now larger than its frame needs (lower it, or drop it at zero).
 */
export function judgeEnvelopes(measured, allowance, ids = Object.keys(measured)) {
  const offenders = [], shrinks = [];
  for (const id of ids) {
    for (const frame of ENVELOPE_FRAMES) {
      const census = measured[id]?.[frame] ?? null;
      const need = allowanceEntry(census);
      const row = allowance.rows[id]?.[frame] ?? null;
      const [allowedParts = 0, allowedGrowth = 0, reason = null] = row ?? [];
      if (need && (need[0] > allowedParts || need[1] > allowedGrowth + GROWTH_SLACK_M)) {
        offenders.push({ id, frame, need, row, census });
      } else if (row && (!need || need[0] < allowedParts || need[1] < allowedGrowth - GROWTH_SLACK_M)) {
        shrinks.push({ id, frame, need, row, reason });
      }
    }
  }
  return { offenders, shrinks };
}

/** Lower the rows of `ids` to what their measured frames need (never raise one), keeping each row's reason. */
export function lowerAllowance(allowance, measured, ids) {
  const changed = [];
  for (const id of ids) {
    for (const frame of ENVELOPE_FRAMES) {
      const row = allowance.rows[id]?.[frame];
      if (!row) continue;
      const need = allowanceEntry(measured[id]?.[frame] ?? null);
      if (need && (need[0] > row[0] || need[1] > row[1] + GROWTH_SLACK_M)) continue;
      const next = need ? [Math.min(need[0], row[0]), Math.min(need[1], row[1]), ...row.slice(2)] : null;
      if (JSON.stringify(next) === JSON.stringify(row)) continue;
      changed.push(`${id} ${frame} ${JSON.stringify(row)} -> ${next ? JSON.stringify(next) : 'removed'}`);
      if (next) allowance.rows[id][frame] = next;
      else delete allowance.rows[id][frame];
    }
    if (allowance.rows[id] && !ENVELOPE_FRAMES.some((frame) => allowance.rows[id][frame])) delete allowance.rows[id];
  }
  return changed;
}

/** Human lines for an offender: the frame, its numbers against its row, and its flagged parts with their builder lines. */
export function formatOffender({ id, frame, need, row, census }, { limit = 8 } = {}) {
  const lines = [`  ${id} ${frame}: ${need[0]} flagged part(s), growth ${need[1]} m (side ${census.growth.side}, front `
    + `${census.growth.front}, rear ${census.growth.rear}; box ${census.env.join(' x ')} -> ${census.without.join(' x ')} `
    + `without them) against the allowance ${row ? JSON.stringify(row) : 'none'}`];
  for (const part of census.flagged.slice(0, limit)) {
    lines.push(`    ${part.dims.join(' x ')} m at (${part.at.join(', ')}), ${part.past} m past the plates`
      + (part.site ? ` at ${part.site}${part.caller ? ` <- ${part.caller}` : ''}` : ''));
  }
  if (census.flagged.length > limit) lines.push(`    ... ${census.flagged.length - limit} more`);
  return lines;
}

export const OFFENDER_HINT = '  Fix: draw the non-armour part (frame, rail, chain, basket, bin, mudguard, bolt, stowage) with '
  + 'P.addEquipment(\'turret\'|\'hull\', ...) (turretEquipment/hullEquipment: the same paint), real spaced armour with '
  + 'P.addExternalArmor, ERA through the ERA plate path; then regenerate the anatomy. A real armour part the rule '
  + `mis-flags gets an allowance row with its reason in ${ENVELOPE_ALLOWANCE}.`;

// ---------------------------------------------------------------- measuring

let fleet = null;
/** The fleet modules in measurement mode (once per process, before the eager factory evaluates). */
export async function loadMeasurementFleet() {
  if (fleet) return fleet;
  const { enableCombatAnatomyMeasurementMode } = await import('../src/vehicles/combatAnatomyMeasurementMode.ts');
  enableCombatAnatomyMeasurementMode();
  const THREE = await import('three');
  const { createTank } = await import('../src/vehicles/tankFactory.ts');
  const { ALL_TANK_IDS, getSpec } = await import('../src/vehicles/specs.ts');
  const { authoredCombatAnatomy } = await import('../src/vehicles/combatAnatomy.ts');
  const { rigidHullFrame, rigidTurretFrame } = await import('./rigid-hull-frame.mjs');
  const { authorSite, parseStackFrames } = await import('./anatomy-floor-ledger.mjs');
  fleet = { THREE, createTank, ALL_TANK_IDS, getSpec, authoredCombatAnatomy, rigidHullFrame, rigidTurretFrame, authorSite,
    parseStackFrames };
  return fleet;
}

const boxKey = (min, max) => [...min, ...max].map((value) => value.toFixed(6)).join(',');

/**
 * Measure one tank's frames. `sites` records each part's builder line (a stack per part: slower, for reports).
 * `edit(tank)` may change the built tank before it is measured (the selftest's negative controls).
 */
export function measureEnvelope(id, measurementFleet, { sites = false, edit = null } = {}) {
  const { THREE, createTank, getSpec, authoredCombatAnatomy, rigidHullFrame, rigidTurretFrame, authorSite, parseStackFrames } = measurementFleet;
  getSpec(id);
  const authored = authoredCombatAnatomy(id);
  if (!authored) throw new Error(`[envelope-census] ${id}: no authored combat anatomy (measurement mode off?)`);
  const census = [];
  const partCensus = sites ? (bucket, part) => {
    if (bucket !== 'turret' && bucket !== 'hull') return;
    const limit = Error.stackTraceLimit;
    Error.stackTraceLimit = 40;
    const stack = new Error().stack || '';
    Error.stackTraceLimit = limit;
    census.push({ part, ...authorSite(parseStackFrames(stack)) });
  } : undefined;
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true, ...(partCensus ? { partCensus } : {}) });
  try {
    edit?.(tank);
    const hullRig = tank.root.getObjectByName('rig_hull');
    const turretRig = tank.root.getObjectByName('rig_turret');
    if (!hullRig || !turretRig) throw new Error(`${id}: articulation rigs missing`);
    rigidHullFrame(tank, id);
    rigidTurretFrame(tank);
    tank.root.updateMatrixWorld(true);
    const siteOf = new Map();
    for (const entry of census) {
      if (!entry.part.boundingBox) entry.part.computeBoundingBox();
      const box = entry.part.boundingBox;
      if (box && !box.isEmpty()) siteOf.set(boxKey(box.min.toArray(), box.max.toArray()), entry);
    }
    const meshes = new Map();
    tank.root.traverse((object) => { if (object.geometry && !meshes.has(object.name)) meshes.set(object.name, object); });
    const row = { id };
    for (const [frame, owner] of [['turret', turretRig], ['hull', hullRig]]) {
      const mesh = meshes.get(frame);
      if (!mesh) { row[frame] = null; continue; }
      const relative = new THREE.Matrix4().multiplyMatrices(owner.matrixWorld.clone().invert(), mesh.matrixWorld);
      const parts = [];
      for (const receipt of tank.root.userData.combatGeometryParts || []) {
        if (receipt.bucket !== frame) continue;
        const box = new THREE.Box3(new THREE.Vector3().fromArray(receipt.min), new THREE.Vector3().fromArray(receipt.max))
          .applyMatrix4(relative);
        const site = siteOf.get(boxKey(receipt.min, receipt.max));
        parts.push({ min: box.min.toArray(), max: box.max.toArray(), site: site?.site ?? null, caller: site?.caller ?? null });
      }
      row[frame] = frameCensus(parts, authored.armor[PLATES_OF[frame]]);
    }
    return row;
  } finally {
    tank.dispose();
  }
}

/** The ids of shard `index` (1-based) of `count`: every count-th id of the roster, so families spread across shards. */
export function shardIds(ids, index, count) {
  return ids.filter((_, position) => position % count === index - 1);
}

/** Measure a shard of the fleet and judge it; throws with the offenders and the rows to lower. */
export async function assertEnvelopeShard(index, count, { allowancePath = ENVELOPE_ALLOWANCE } = {}) {
  const measurementFleet = await loadMeasurementFleet();
  const allowance = readAllowance(allowancePath);
  const ids = shardIds(measurementFleet.ALL_TANK_IDS, index, count);
  const measured = {};
  for (const id of ids) measured[id] = measureEnvelope(id, measurementFleet);
  const { offenders, shrinks } = judgeEnvelopes(measured, allowance, ids);
  if (offenders.length || shrinks.length) {
    const lines = [];
    if (offenders.length) {
      // name the builder lines: re-measure only the offenders, with a stack per part
      lines.push(`[envelope-census] ${offenders.length} frame(s) flag primary-bucket parts past their allowance:`);
      for (const offender of offenders) {
        const census = measureEnvelope(offender.id, measurementFleet, { sites: true })[offender.frame] ?? offender.census;
        lines.push(...formatOffender({ ...offender, census }));
      }
      lines.push(OFFENDER_HINT);
    }
    if (shrinks.length) {
      lines.push(`[envelope-census] ${shrinks.length} allowance row(s) are larger than their frames need; the allowance only `
        + `shrinks: node tools/envelope-census.mjs --ids=${[...new Set(shrinks.map((s) => s.id))].join(',')} --write-allowance`);
      for (const { id, frame, need, row } of shrinks) lines.push(`  ${id} ${frame}: ${JSON.stringify(row)} -> ${need ? JSON.stringify([...need, ...row.slice(2)]) : 'remove'}`);
    }
    throw new Error(lines.join('\n'));
  }
  return { ids, measured };
}

// ---------------------------------------------------------------- command line

async function main(argv) {
  const flag = (name) => argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const has = (name) => argv.includes(`--${name}`);
  const measurementFleet = await loadMeasurementFleet();
  let ids = has('all') || flag('ids') === 'all' ? measurementFleet.ALL_TANK_IDS : (flag('ids') || '').split(',').filter(Boolean);
  for (const id of ids) if (!measurementFleet.ALL_TANK_IDS.includes(id)) throw new Error(`[envelope-census] unknown id ${id}`);
  const shard = flag('shard');
  if (shard) {
    const [index, count] = shard.split('/').map(Number);
    ids = shardIds(ids, index, count);
  }
  if (!ids.length) throw new Error('usage: node tools/envelope-census.mjs --ids=<id,…>|--all [--shard=i/n] [--sites] [--json] [--jsonl=<file>] [--check] [--write-allowance]');
  const sites = has('sites'), jsonl = flag('jsonl');
  const measured = {};
  const out = [];
  for (const id of ids) {
    let row;
    try { row = measureEnvelope(id, measurementFleet, { sites }); } catch (error) { row = { id, error: String(error?.message ?? error) }; }
    measured[id] = row;
    out.push(JSON.stringify(row));
    if (has('json')) console.log(JSON.stringify(row));
    else if (!jsonl && !has('check') && !has('write-allowance')) {
      for (const frame of ENVELOPE_FRAMES) {
        const census = row[frame];
        if (!census?.flagged.length) continue;
        console.log(formatOffender({ id, frame, need: allowanceEntry(census), row: null, census }, { limit: 40 }).join('\n'));
      }
    }
  }
  if (jsonl) writeFileSync(jsonl, `${out.join('\n')}\n`);
  const errors = Object.values(measured).filter((row) => row.error);
  for (const row of errors) console.error(`[envelope-census] ${row.id}: ${row.error}`);
  if (has('write-allowance')) {
    const allowance = readAllowance();
    const changed = lowerAllowance(allowance, measured, ids.filter((id) => !measured[id].error));
    writeFileSync(ENVELOPE_ALLOWANCE, serializeAllowance(allowance));
    console.log(changed.length ? `[envelope-census] lowered:\n  ${changed.join('\n  ')}` : '[envelope-census] nothing to lower');
  }
  if (has('check')) {
    const { offenders, shrinks } = judgeEnvelopes(measured, readAllowance(), ids.filter((id) => !measured[id].error));
    for (const offender of offenders) console.log(formatOffender(offender).join('\n'));
    if (offenders.length) console.log(OFFENDER_HINT);
    for (const { id, frame, need, row } of shrinks) console.log(`  shrink ${id} ${frame}: ${JSON.stringify(row)} -> ${need ? JSON.stringify(need) : 'remove'}`);
    console.log(`[envelope-census] ${ids.length} id(s): ${offenders.length} offender(s), ${shrinks.length} row(s) to lower`);
    if (offenders.length || shrinks.length || errors.length) process.exitCode = 1;
  }
  if (errors.length) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main(process.argv.slice(2));
