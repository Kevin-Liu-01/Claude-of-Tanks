// Functional recovery contract, not a source-fidelity/performance waiver.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ensureTankBuilders, isTankBuilderReady, createTank } from './fleetFactory.ts';
import { ABRAMS_SOURCE_X_IDS } from './abramsSourceXSpecs.ts';
import { getSpec } from './specs.ts';
import { createTankState } from '../sim/movement.ts';
import { combatAnatomyCalibration } from './combatAnatomyCalibrationRegistry.ts';
import { vehicleMarkingSeats } from './vehicleMarkingSeatRegistry.ts';
import { decorManifestFor } from './decorations.ts';

const untouched = ['m1a1','m1a1ha','m1a2','m1a2_tusk','m1a2_sepv2','m1a2_sepv3','ua_m1a1','abramsx','m1a3'];
for (const id of [...ABRAMS_SOURCE_X_IDS, ...untouched]) assert.equal(isTankBuilderReady(id), false);
const originalFetch = globalThis.fetch;
globalThis.fetch = () => { throw new Error('Recovered procedural tanks must not fetch a source mesh'); };
const rows = [];
try {
  await ensureTankBuilders(ABRAMS_SOURCE_X_IDS);
  for (const id of untouched) assert.equal(isTankBuilderReady(id), false, `${id}: no original/concept builder eagerly loaded`);
  for (const quality of ['high','low']) for (const id of ABRAMS_SOURCE_X_IDS) {
    assert.ok(isTankBuilderReady(id));
    assert.ok(combatAnatomyCalibration(id), `${id}: own archived anatomy available through typed loader`);
    assert.ok(vehicleMarkingSeats(id), `${id}: own marking seats available through typed loader`);
    for (const value of [.13,.5,.87]) assert.deepEqual(decorManifestFor(getSpec(id), () => value), [], 'authored equipment has no random cargo overlay');
    const tank = createTank(id, null, { quality, proceduralOnly:true, geometryReceipt:true, batchStatic:true, camoSeed:4242 });
    try {
      const hull = tank.root.getObjectByName('rig_hull');
      const turret = tank.root.getObjectByName('rig_turret');
      const gun = tank.root.getObjectByName('rig_gun');
      assert.equal(gun.parent, turret);
      assert.equal(hull.parent, tank.root);
      const gear = hull.userData.runningGearReceipts;
      assert.equal(gear.length, 1, 'one canonical suspension/track owner');
      for (const name of ['gearTrackBandL','gearTrackBandR','gearRoadWheelTires','gearEndWheelBody']) {
        assert.ok(tank.root.getObjectByName(name), `${id}: actual source-authored ${name}`);
      }
      let meshCount = 0, vertexCount = 0;
      tank.root.traverse(object => {
        if (!object.isMesh) return;
        meshCount++;
        const positions = object.geometry.getAttribute('position');
        assert.ok(positions?.count > 0, `${id}/${object.name}: nonempty geometry`);
        vertexCount += positions.count;
        for (const value of positions.array) assert.ok(Number.isFinite(value), `${id}: finite native position`);
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        assert.ok(materials.length && materials.every(material => material?.isMaterial));
      });
      assert.ok(meshCount > 20 && vertexCount > 10000, 'full detailed source-authored build, not fallback rig');
      const state = createTankState(getSpec(id), new THREE.Vector3(), 0);
      for (const [left,right] of [[0,0],[.37,-.21],[-.13,.49]]) {
        state.trackScroll.l = left; state.trackScroll.r = right;
        tank.syncFromState(state, 1 / 60, 20);
        tank.root.updateMatrixWorld(true);
        tank.root.traverse(object => {
          for (const value of object.matrixWorld.elements) assert.ok(Number.isFinite(value), 'finite posed frame');
        });
      }
      const bounds = new THREE.Box3().setFromObject(tank.root);
      assert.ok(!bounds.isEmpty() && [bounds.min, bounds.max].every(v => v.toArray().every(Number.isFinite)));
      rows.push({ id, quality, meshCount, vertexCount });
    } finally { tank.dispose(); }
  }
} finally { globalThis.fetch = originalFetch; }
assert.equal(rows.length, 14);
console.log(JSON.stringify({ pass:true, contract:'native lazy construction and articulation; not release qualification', rows }));
