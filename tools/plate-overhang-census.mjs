#!/usr/bin/env node
// Plate overhang census (hull-plates-fit-277; Main, fire-center-277: the T95's, M46's and M47's hull plates ran 18 to 27 % past
// their drawn bows, so the wreck's hull box, HE's nearest face and the contact mass stood in the air in front of them).
// First-party tooling: Kevin B. Liu.
//
// Every armour plate a round can strike is measured on the build by tools/hitbox-fit-census.mjs (hitbox-fit-274). This
// census covers the plates that census never sees because the trace skips them (sim/armor.ts tracePlates), yet the
// box readers still read: a legacy external track plate whose module has a measured prism (the prism is traced), and a
// main plate in a frame with collision cells (the cells are traced). The wreck's hull box (sim/wreckTurrets.ts), HE's
// nearest face (sim/damage.ts hullAabbOf) and the contact mass (sim/tankContactShape.ts) read them all.
//
// Each such plate's bounds are held to its frame's drawn envelope, everything the calibration measured off the build:
// the hull's (or turret's) bounds, its collision and structure cells, its structures, its ERA receipts, the tracks and the
// external weapons on the hull. A plate standing past it by more than combatAnatomy.ts plateOverhangTolM (10 cm, or 3 % of
// the drawn hull's run) is off the build. Spec data only: no builds, CPU only.
//   node tools/plate-overhang-census.mjs [--ids=a,b] [--json=out.json]     exit 1 listing the ids off the build
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { plateOverhangTolM } from '../src/vehicles/combatAnatomy.ts';
import { betweenBuilds } from './build-loop-yield.mjs';

const FACES = ['-x', '+x', '-y', '+y', '-z', '+z'];
const pointsOf = (o) => o.verts ?? o.vertices ?? (o.surfaces ? o.surfaces.flat() : o.min && o.max ? [o.min, o.max] : []);

/** The bounds of every point of `items` ([min, max]), or null for none. */
export function boundsOf(items) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const item of items) {
    if (!item) continue;
    for (const point of pointsOf(item)) {
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], point[axis]);
        max[axis] = Math.max(max[axis], point[axis]);
      }
    }
  }
  return min[0] === Infinity ? null : [min, max];
}

/** A frame's drawn envelope: everything the calibration measured off the build in that frame. */
export function drawnEnvelope(calibration, owner) {
  const era = (calibration.eraPlates ?? []).filter((receipt) => receipt.owner === owner);
  if (owner === 'hull') {
    return boundsOf([calibration.hull, calibration.tracks?.left, calibration.tracks?.right, ...(calibration.hullCollision ?? []),
      ...(calibration.hullStructureCollision ?? []), ...(calibration.hullStructures ?? []), ...era,
      ...(calibration.externalWeapons ?? [])]);
  }
  if (!calibration.turret) return null;
  return boundsOf([calibration.turret, ...(calibration.turretCollision ?? []), ...(calibration.turretStructureCollision ?? []),
    ...(calibration.turretStructures ?? []), ...era]);
}

/** Why the trace never meets `plate` (so the build census never measures it), or null when it does. */
export function untraced(plate, armor, hasCells) {
  const prisms = new Set((armor.trackShapes ?? []).map((shape) => shape.module));
  if (plate.kind === 'external' && prisms.has(plate.moduleLink)) return 'trackPair';
  if (hasCells && (plate.kind || 'main') === 'main') return 'mainUnderCells';
  return null;
}

/**
 * One row per untraced plate of a finalized spec: how far (m) it stands past its frame's drawn envelope, on which face,
 * and whether that is past the tolerance (`off`).
 */
export function plateOverhangRows(spec, calibration) {
  const armor = spec.armor;
  const hull = drawnEnvelope(calibration, 'hull');
  if (!armor || !hull) return [];
  const runM = hull[1][2] - hull[0][2];
  const tolM = plateOverhangTolM(runM);
  const rows = [];
  const frames = [['hull', armor.hullPlates, hull, !!armor.collisionShells?.hull?.length],
    ['turret', armor.turretPlates, drawnEnvelope(calibration, 'turret'), !!armor.collisionShells?.turret?.length]];
  for (const [owner, plates, drawn, hasCells] of frames) {
    if (!plates?.length || !drawn) continue;
    for (const plate of plates) {
      const why = untraced(plate, armor, hasCells);
      if (!why) continue;
      const [min, max] = boundsOf([plate]);
      const past = [drawn[0][0] - min[0], max[0] - drawn[1][0], drawn[0][1] - min[1], max[1] - drawn[1][1],
        drawn[0][2] - min[2], max[2] - drawn[1][2]];
      const worst = past.indexOf(Math.max(...past));
      const overM = Math.max(0, past[worst]);
      rows.push({ id: spec.id, owner, plate: plate.name, why, face: FACES[worst], overM: Math.round(overM * 1000) / 1000,
        share: Math.round((overM / runM) * 1000) / 1000, tolM: Math.round(tolM * 1000) / 1000, off: overM > tolM });
    }
  }
  return rows;
}

/** The census over `ids` (every saved id when omitted): its rows and the ids off the build, worst first. */
export async function plateOverhangCensus(ids) {
  const { ensureAuthorityFleet } = await import('../src/vehicles/authorityFleet.ts');
  const { TANK_SPECS, SAVED_TANK_IDS } = await import('../src/vehicles/specs.ts');
  const { combatAnatomyCalibration } = await import('../src/vehicles/combatAnatomyCalibrationRegistry.ts');
  const list = ids?.length ? ids : SAVED_TANK_IDS.slice();
  await ensureAuthorityFleet(list);
  const rows = [];
  for (const id of list) {
    const calibration = combatAnatomyCalibration(id);
    if (!calibration) throw new Error(`plate-overhang-census: ${id} has no calibration`);
    rows.push(...plateOverhangRows(TANK_SPECS[id], calibration));
    await betweenBuilds();
  }
  const off = rows.filter((row) => row.off).sort((a, b) => b.overM - a.overM);
  return { ids: list, rows, off, offIds: [...new Set(off.map((row) => row.id))] };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const ids = (arg('ids') ?? '').split(',').filter(Boolean);
  const census = await plateOverhangCensus(ids);
  const json = arg('json');
  if (json) writeFileSync(json, `${JSON.stringify({ ids: census.ids.length, off: census.off }, null, 2)}\n`);
  const counts = (why) => `${census.rows.filter((row) => row.why === why).length} ${why}`;
  console.log(`plate-overhang-census: ${census.ids.length} ids, ${census.rows.length} untraced plates (${counts('trackPair')}, `
    + `${counts('mainUnderCells')}), ${census.offIds.length} ids off the build`);
  for (const row of census.off) {
    console.log(`  ${row.id} ${row.owner} ${row.plate} (${row.why}) ${row.overM} m past ${row.face} `
      + `(${Math.round(row.share * 1000) / 10} % of the run; tolerance ${row.tolM} m)`);
  }
  if (census.offIds.length) {
    console.error(`plate-overhang-census: off the build: ${census.offIds.join(' ')}`);
    process.exit(1);
  }
}
