#!/usr/bin/env node
// Claude of Tanks — turret-ring side caps (ring-well-close 244).
// Copyright © 2026 Kevin B. Liu. Created, designed and directed by Kevin B. Liu. Reserved Content
// (LicenseRef-Claude-of-Tanks-Proprietary-Content-1.0; LICENSE-POLICY.md, NOTICE.md). Claude was a development tool for
// this file, not an author. provenance: urn:claude-of-tanks:tool:turret-ring-side-caps
//
// A live wreck's cut reaches 0.2 m under its race; a ring measured wider than the hull's own sides through that depth
// opens the side wall into a slot the plate's band cannot close (turretRingWell.ts TURRET_RING_SIDE_CAPS). Per ring
// measured at runtime (no calibration receipt; a receipt carries the cap, tools/gen-combat-anatomy.mjs), on a bot's
// battle build: the hull skin the eye reaches from outside
// (turretRingWell.ts exteriorSkin, the measure's own exterior pass) inside the uncapped race's radius within that
// depth, its nearest radius and its 5th percentile.
//   --check (default: the capped ids)  every cap lies inside that skin (by at least CAP_MARGIN_M) and still guards a
//                                      wall (the uncapped race reaches past it), or the run fails
//   --all                              every receipt-less turreted id: the skin each race reaches, a slot candidate
//                                      where it forms a wall (SLOT_MIN_POINTS points, the race past it by SLOT_MIN_M)
//
//   node tools/turret-ring-side-caps.mjs [--ids=mbt70,...] [--all] [--check]
import * as THREE from 'three';
import { uniqueIds } from './id-list.mjs';

await import('./tank-surface-collect.mjs');
const { createTank, ensureTankBuilder } = await import('../src/vehicles/fleetFactory.ts');
const { measureTurretRing, turretRingRadius, exteriorSkin, TURRET_RING_SIDE_CAPS } = await import('../src/vehicles/turretRingWell.ts');
const { combatAnatomyCalibration } = await import('../src/vehicles/combatAnatomyCalibrationRegistry.ts');
const { FLEET_GROUP_BY_ID } = await import('../src/vehicles/fleetManifest.ts');
const { getSpec } = await import('../src/vehicles/specs.ts');

const args = process.argv.slice(2);
const opt = (name, fallback = '') => { const hit = args.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const ALL = args.includes('--all');
const CHECK = args.includes('--check') || !ALL;
const ids = opt('ids') ? uniqueIds(opt('ids').split(',').filter(Boolean), 'turret-ring-side-caps --ids') : ALL ? Object.keys(FLEET_GROUP_BY_ID) : Object.keys(TURRET_RING_SIDE_CAPS);
/** The depth the live cut reaches under the race (turretRingWell.ts LIVE_CUT_DEPTH_M), and the exterior pass's margin. */
const CUT_DEPTH_M = 0.2, SKIN_MARGIN_M = 0.32;
const CAP_MARGIN_M = 0.02, SLOT_MIN_POINTS = 100, SLOT_MIN_M = 0.1;

/** The hull's triangles in its frame, as the measure collects them (drawn, opaque, not the turret's, LOD level 0). */
function hullTriangles(root, hull, turret) {
  root.updateMatrixWorld(true);
  const inv = hull.matrixWorld.clone().invert(), out = [], v = new THREE.Vector3();
  const stack = [hull];
  while (stack.length) {
    const o = stack.pop();
    if (o === turret || o.visible === false) continue;
    if (o.isLOD && o.levels?.length) { stack.push(o.levels[0].object); continue; }
    stack.push(...o.children);
    if (!o.isMesh || o.isInstancedMesh || o.isBatchedMesh) continue;
    const d = o.userData;
    if (d.interiorFill || d.authoredShadowProxy || d.vehicleMarking || d.turretRingPlate || d.turretSeatRace) continue;
    const drawn = [].concat(o.material).some((m) => m && m.visible !== false && m.colorWrite !== false
      && !(m.transparent && (m.opacity ?? 1) < 0.98) && !(m.alphaTest > 0));
    if (!drawn) continue;
    const toHull = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const position = o.geometry.getAttribute('position'), index = o.geometry.index;
    const count = index ? index.count : position.count;
    for (let k = 0; k < count; k++) { v.fromBufferAttribute(position, index ? index.getX(k) : k).applyMatrix4(toHull); out.push(v.x, v.y, v.z); }
  }
  return out;
}

const failures = [];
for (const id of ids) {
  let visual = null;
  try {
    await ensureTankBuilder(id);
    const spec = getSpec(id);
    if (spec?.armor?.turretless) continue;
    const receipt = combatAnatomyCalibration(id)?.turretRing;
    if (receipt) {
      // the anatomy update measures with the cap too (tools/gen-combat-anatomy.mjs), so a receipt keeps it
      const cap = TURRET_RING_SIDE_CAPS[id];
      if (cap !== undefined && receipt.rimR > cap + 1e-4) failures.push(`${id}: its receipt's ring (${receipt.rimR}) is past its cap ${cap}: rerun the anatomy update`);
      continue;
    }
    visual = createTank(id, null, { camoSeed: 77, quality: 'low', geometryQuality: 'low', batchStatic: true, battleDetailLod: true, eraVisualBindingReceipt: false });
    const root = visual.root, hull = root.getObjectByName('rig_hull'), turret = root.getObjectByName('rig_turret');
    const ring = measureTurretRing(hull, turret, turretRingRadius(spec.armor));
    if (!ring) continue;
    const skin = exteriorSkin(hullTriangles(root, hull, turret), ring.seat[0], ring.seat[2], ring.deckY, ring.rimR, ring.floorY, SKIN_MARGIN_M)
      .filter((p) => p.y >= ring.deckY - CUT_DEPTH_M && p.r < ring.rimR).map((p) => p.r).sort((a, b) => a - b);
    const cap = TURRET_RING_SIDE_CAPS[id];
    const row = { id, rimR: ring.rimR, skin: skin.length, nearestR: skin[0] ?? null, p05R: skin[Math.floor(0.05 * skin.length)] ?? null, cap: cap ?? null };
    const slot = skin.length >= SLOT_MIN_POINTS && ring.rimR - row.p05R >= SLOT_MIN_M;
    console.log(JSON.stringify({ ...row, ...(slot && cap === undefined ? { candidate: true } : {}) }));
    if (CHECK && cap !== undefined) {
      if (!skin.length || cap >= ring.rimR) failures.push(`${id}: the cap ${cap} guards no wall (the uncapped race ${ring.rimR}, ${skin.length} skin points inside it)`);
      else if (cap > row.nearestR - CAP_MARGIN_M) failures.push(`${id}: the cap ${cap} reaches the hull's side (its skin from ${row.nearestR.toFixed(3)} m)`);
    }
  } catch (error) {
    failures.push(`${id}: ${String(error?.message || error).slice(0, 160)}`);
  } finally { visual?.dispose(); }
}
if (CHECK) {
  console.log(`[turret-ring-side-caps] ${ids.length} id(s), ${failures.length} failure(s)`);
  for (const failure of failures) console.log(`  ${failure}`);
  if (failures.length) process.exit(1);
}
