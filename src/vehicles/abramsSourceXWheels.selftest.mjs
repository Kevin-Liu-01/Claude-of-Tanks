import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { getSpec } from './specs.ts';
import { createTankState } from '../sim/movement.ts';
import { auditTankWheelQuality } from './wheelQuality.ts';
import { buildAbramsSourceXRoadWheelGeometry } from './profiles/abramsSourceXWheels.ts';
import { ABRAMS_SOURCE_X_ROAD_Z } from './profiles/abramsSourceXHull.ts';

const material = new THREE.MeshBasicMaterial({ side: THREE.FrontSide });
function axialHit(meshes, radius, side) {
  const ray = new THREE.Raycaster(new THREE.Vector3(side * .4, radius, 0),
    new THREE.Vector3(-side, 0, 0), 0, .8);
  return ray.intersectObjects(meshes)[0];
}
function guideAir(meshes, radius) {
  const ray = new THREE.Raycaster(new THREE.Vector3(-.020, radius, 0),
    new THREE.Vector3(1, 0, 0), 0, .040);
  return ray.intersectObjects(meshes).length;
}
for (const quality of ['high', 'low']) {
  const solids = buildAbramsSourceXRoadWheelGeometry(quality === 'high');
  const meshes = [solids.tire, solids.disc].map(geometry => new THREE.Mesh(geometry, material));
  for (const mesh of meshes) mesh.updateMatrixWorld(true);
  // Independent original _110 axial rays (raw outer-side frame). The common
  // turned assembly approximates the small source asymmetry, not a perfect
  // re-registration of source per-station surfaces.
  const gapCenter = 1.422950;
  for (const [radius, sourceX] of [[.10, 1.456649], [.12, 1.456629],
    [.20, 1.479780], [.24, 1.479827], [.27, 1.637360]]) {
    for (const side of [-1, 1]) {
      const hit = axialHit(meshes, radius, side);
      assert.ok(hit, `${quality}: source radial stock ${radius}`);
      const error = Math.abs(Math.abs(hit.point.x) + gapCenter - sourceX);
      assert.ok(error < .002, `${quality}/${radius}: source outer-face error ${error}`);
    }
  }
  for (const radius of [.20, .24, .27]) {
    assert.equal(guideAir(meshes, radius), 0, `${quality}: source-proven inter-disc air at r${radius}`);
  }
  for (const x of [-.15, .15]) {
    const hit = new THREE.Raycaster(new THREE.Vector3(x, .4, 0),
      new THREE.Vector3(0, -1, 0), 0, .2).intersectObjects(meshes)[0];
    assert.ok(hit && Math.abs(hit.point.y - .3166805) < 1e-6,
      'FrontSide radial ray sees the real outward tire crown, never its inner wall');
  }
  const low = axialHit(meshes, .12, 1), rim = axialHit(meshes, .27, 1);
  assert.ok(rim.point.x - low.point.x > .17, 'deep pressed bowl, not a flat/proud wheel');
  solids.tire.computeBoundingBox();
  assert.ok(Math.abs(solids.tire.boundingBox.max.x - solids.tire.boundingBox.min.x - .43087) < 1e-6);
  assert.ok(Math.abs(solids.tire.boundingBox.max.y - .3166805) < 1e-6);
  for (const geometry of [solids.tire, solids.disc]) geometry.dispose();

  const tank = createTank('m1a2_sepv2_x', null,
    { proceduralOnly: true, geometryReceipt: true, quality, batchStatic: false });
  try {
    const tires = tank.root.getObjectByName('gearRoadWheelTires');
    const steel = tank.root.getObjectByName('gearRoadWheelDiscs');
    assert.equal(tires.count, 14); assert.equal(steel.count, 14);
    const actualSolids = [tires, steel].map(m => new THREE.Mesh(m.geometry, material));
    for (const mesh of actualSolids) mesh.updateMatrixWorld(true);
    for (const radius of [.20, .24, .27]) assert.equal(guideAir(actualSolids, radius), 0,
      'actual native wheel emissions retain the source guide gap');
    for (const [radius, expectedX] of [[.12, .03365], [.24, .05688], [.27, .215435]]) {
      const hit = axialHit(actualSolids, radius, 1);
      assert.ok(hit && Math.abs(hit.point.x - expectedX) < .002,
        `actual native wheel uses the source-specific turned stock at radius${radius}`);
    }
    const matrix = new THREE.Matrix4(), centers = [];
    for (let i = 0; i < tires.count; i++) {
      tires.getMatrixAt(i, matrix); centers.push(new THREE.Vector3().setFromMatrixPosition(matrix));
    }
    for (const side of [-1, 1]) {
      const actual = centers.filter(p => Math.sign(p.x) === side).map(p => p.z).sort((a, b) => a - b);
      assert.equal(actual.length, 7);
      actual.forEach((z, i) => assert.ok(Math.abs(z - ABRAMS_SOURCE_X_ROAD_Z[i]) < 1e-6,
        'source axle cadence is untouched'));
    }
    for (const point of centers) assert.ok(Math.abs(point.y - .373782) < 1e-6);
    const before = Array.from(tires.instanceMatrix.array);
    const state = createTankState(getSpec('m1a2_sepv2_x'), new THREE.Vector3(), 0);
    tank.setGroundSampler((x, z) => Math.abs(z) < .3 ? -.05 : 0);
    state.trackScroll.l = .37; state.trackScroll.r = -.21;
    for (let k = 0; k < 8; k++) tank.syncFromState(state, 1 / 30, 20);
    assert.notDeepEqual(Array.from(tires.instanceMatrix.array), before);
    assert.deepEqual(Array.from(tires.instanceMatrix.array), Array.from(steel.instanceMatrix.array),
      'both real tires and pressed webs share their original native axle motion');
    const audit = auditTankWheelQuality(tank.root);
    assert.equal(audit.issues.length, 0, JSON.stringify(audit.issues));
  } finally { tank.dispose(); }
}
material.dispose();
console.log('Abrams source-X wheels: high/low source bowl/tire/air witnesses, unchanged14 axles, native motion and wheel quality PASS');
