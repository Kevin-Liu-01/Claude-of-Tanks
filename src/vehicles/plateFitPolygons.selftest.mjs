// plateFitPolygons.selftest.mjs (274.0, coordinator ruling): a hitbox-fit piece cut to other than four corners is traced
// as the convex outline it is (vehicles/combatAnatomy.ts applyPlateFits, planarOutline). Before, it kept its quad plate's
// unflagged trace, which reads four corners: a pentagon lost its fifth corner's wedge and a triangle had no fourth.
//   1. every non-quad fitted piece on every tank that carries one is flagged convexPolygon, is planar and convex
//      (sim/armorOutline.test-support.mjs, the rule fleetBalance holds flagged plates to);
//   2. a known pentagon, the T-90SM (2013)'s slat cage: a shot through the centre of its fifth corner's wedge (the
//      triangle v3, v4, v0 the quad trace dropped) meets the plate, as does one through its centroid.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as THREE from 'three';
import { installCanvasFixture } from './canvasFixture.test-support.mjs';
import { assertConvexArmorOutline } from '../sim/armorOutline.test-support.mjs';

installCanvasFixture();
const { traceTank, tankPoseFromState } = await import('../sim/armor.ts');
const { createTankState } = await import('../sim/movement.ts');
const { getSpec } = await import('./specs.ts');
const { ensureTankBuilder } = await import('./fleetFactory.ts');

// the fitted pieces as the generator wrote them (combatAnatomyGroups/*.generated.ts plateFits)
const dir = new URL('./combatAnatomyGroups/', import.meta.url).pathname;
const nonQuad = new Map(); // id -> Set of layer names with a non-quad piece
for (const file of readdirSync(dir).filter((name) => name.endsWith('.generated.ts'))) {
  const text = readFileSync(dir + file, 'utf8');
  const table = JSON.parse(text.slice(text.indexOf('Object.freeze(') + 'Object.freeze('.length, text.lastIndexOf(')')));
  for (const [id, calibration] of Object.entries(table)) {
    for (const receipt of calibration.plateFits ?? []) {
      if (receipt.action === 'hold' || receipt.action === 'drop' || !receipt.pieces?.some((piece) => piece.length !== 4)) continue;
      if (!nonQuad.has(id)) nonQuad.set(id, new Set());
      nonQuad.get(id).add(`${receipt.owner}:${receipt.name}`);
    }
  }
}
assert.ok(nonQuad.has('t90sm_2013'), 'the T-90SM (2013) slat cage is among the non-quad fits');

// 1. every non-quad fitted plate is a flagged, planar, convex outline with a trace box
let checked = 0, boxed = 0;
for (const [id, layers] of nonQuad) {
  await ensureTankBuilder(id);
  const armor = getSpec(id).armor;
  for (const [owner, plates] of [['hull', armor.hullPlates], ['turret', armor.turretPlates]]) {
    for (const plate of plates) {
      if (!layers.has(`${owner}:${plate.name}`) || plate.verts.length === 4) continue;
      assert.equal(plate.convexPolygon, true, `${id}/${plate.name}: a ${plate.verts.length}-corner piece is a convex outline`);
      assertConvexArmorOutline(plate.verts, `${id}/${plate.name}`, plate.openEdges);
      // the trace box is acceleration only (vehicles/convexArmorTraceBounds.ts): an ill-conditioned outline gets none on
      // purpose and the exact convex trace owns its hits
      if (plate.traceBounds) boxed++;
      checked++;
    }
  }
}
assert.ok(checked >= 40, `the non-quad fitted pieces are all checked (${checked})`);

// 2. the T-90SM (2013)'s slat-cage pentagon traces its whole area
await ensureTankBuilder('t90sm_2013');
const armor = getSpec('t90sm_2013').armor;
const cage = armor.hullPlates.find((plate) => plate.name === 'slat_cage' && plate.verts.length === 5);
assert.ok(cage, 't90sm_2013: the slat cage carries a five-corner piece');
const model = { ...armor, hullPlates: [cage], turretPlates: [], modules: [], crew: [], externalWeapons: [], trackShapes: [],
  collisionShells: null, gunBarrel: null, droneScreens: null };
const state = createTankState(getSpec('t90sm_2013'), new THREE.Vector3(), 0);
const pose = tankPoseFromState(state, { pos: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0 });
const [v0, v1, , v3, v4] = cage.verts.map((point) => new THREE.Vector3(...point));
const normal = new THREE.Vector3().subVectors(v1, v0).cross(new THREE.Vector3().subVectors(v4, v0)).normalize();
/** A shot along the plate's normal, 3 m either side of a point in the hull's frame (the pose stands at the origin). */
function meets(local) {
  const hits = traceTank(local.clone().addScaledVector(normal, 3), local.clone().addScaledVector(normal, -3), pose, model);
  return hits.some((hit) => hit.kind === 'plate' && hit.plate === cage);
}
const centroid = cage.verts.reduce((sum, point) => sum.add(new THREE.Vector3(...point)), new THREE.Vector3())
  .multiplyScalar(1 / cage.verts.length);
const wedge = new THREE.Vector3().add(v3).add(v4).add(v0).multiplyScalar(1 / 3);
assert.ok(meets(centroid), 't90sm_2013/slat_cage: a shot through the centroid meets the pentagon');
assert.ok(meets(wedge), 't90sm_2013/slat_cage: a shot through the fifth corner\'s wedge (v3, v4, v0) meets the pentagon');
console.log(`plateFitPolygons.selftest: ${checked} non-quad fitted pieces on ${nonQuad.size} tanks are flagged, planar, convex `
  + `outlines (${boxed} with a trace box); the T-90SM (2013) slat-cage pentagon meets a shot in its fifth corner's wedge`);
