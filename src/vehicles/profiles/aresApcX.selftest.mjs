import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { TANK_SPECS, MODEL_SOURCE } from '../specs.ts';
import { tankTier } from '../tier.ts';
import { vehicleEraForId } from '../taxonomy.ts';
import { FLEET_GROUP_BY_ID } from '../fleetManifest.ts';
import { ARES_APC_X_DATUMS } from '../aresApcXFrame.ts';

const ID = 'ares_apc_x';
const source = readFileSync(new URL('./aresApcX.ts', import.meta.url), 'utf8');
assert.ok(!/GLTFLoader|\.glb|community-candidates|loadReferenceGlb/.test(source),
  'playable profile contains no source model loading path');
assert.ok(!/from ['"].*(?:fv510|warrior|ajaxX|bradley)/i.test(source),
  'ARES is not a donor visual variant');

const record = JSON.parse(readFileSync(
  new URL('../../../docs/references/tanks/ares_apc_x.source-measurements.json', import.meta.url), 'utf8'));
const spec = TANK_SPECS[ID];
assert.equal(spec.name, 'Ares APC');
assert.equal(spec.nation, 'UK');
assert.equal(spec.role, 'ifv');
assert.equal(spec.gun.caliberMm, 12.7);
assert.equal(tankTier(ID), 7);
assert.equal(vehicleEraForId(ID), 'modern');
assert.equal(FLEET_GROUP_BY_ID[ID], 'aresApcX');
assert.equal(MODEL_SOURCE[ID].source, 'procedural');
assert.deepEqual(spec.armor.turretPivot, [...ARES_APC_X_DATUMS.turretPivot]);
assert.equal(record.canonicalOracle.sha256.length, 64);
assert.deepEqual([...ARES_APC_X_DATUMS.wheelStations], record.runningGear.roadWheelStationsZ);

const receipts = [];
for (const geometryQuality of ['high', 'low']) {
  const tank = createTank(ID, null, {
    proceduralOnly: true, geometryReceipt: true, geometryQuality, batchStatic: false,
  });
  try {
    tank.root.updateMatrixWorld(true);
    const hull = tank.root.getObjectByName('rig_hull');
    const turret = tank.root.getObjectByName('rig_turret');
    const gun = tank.root.getObjectByName('rig_gun');
    assert.ok(hull && turret && gun, 'real hull/yaw/pitch ownership chain exists');
    assert.deepEqual(turret.position.toArray(), [...ARES_APC_X_DATUMS.turretPivot]);
    assert.deepEqual(gun.position.toArray(), [
      ARES_APC_X_DATUMS.trunnion[0] - ARES_APC_X_DATUMS.turretPivot[0],
      ARES_APC_X_DATUMS.trunnion[1] - ARES_APC_X_DATUMS.turretPivot[1],
      ARES_APC_X_DATUMS.trunnion[2] - ARES_APC_X_DATUMS.turretPivot[2],
    ]);
    const gear = hull.userData.runningGearReceipts.at(-1);
    assert.deepEqual(gear.wheelZs, [...ARES_APC_X_DATUMS.wheelStations]);
    assert.ok(ARES_APC_X_DATUMS.sprocket.z > 0, 'front powerpack drives the source-detailed front sprocket');
    assert.ok(ARES_APC_X_DATUMS.idler.z < 0, 'simpler idler remains at the rear');
    assert.equal(gear.suspensionLinkCount, 14);
    assert.equal(gear.trackPatternId, 'british-rubber-pad');
    assert.equal(gear.coveredTop, true);
    assert.equal(hull.getObjectByName('gearRoadWheelTires').count, 14);
    const build = hull.userData.aresApcReceipt;
    assert.equal(build.roadWheelsPerSide, 7);
    assert.equal(build.returnRollersPerSide, 4);
    assert.equal(build.roofHatches, 4);
    assert.equal(build.smokeTubes, 16);
    assert.equal(build.troopRamp, true);
    assert.equal(build.sourceRuntimeGeometry, false);
    const exactRws = gun.getObjectByName('fitting_pintleMG_exact');
    assert.ok(exactRws?.userData.sourceMeasuredMachineGun, 'L111A1 is a visible exact fitting');
    assert.equal(exactRws.userData.fitting, 'pintleMG');
    assert.equal(exactRws.userData.firingAxis, '+Z');
    assert.ok(Math.abs(exactRws.userData.muzzleLocalZ
      - (ARES_APC_X_DATUMS.muzzleZ - ARES_APC_X_DATUMS.trunnion[2])) < 1e-9);

    const bounds = new THREE.Box3().setFromObject(tank.root);
    const size = bounds.getSize(new THREE.Vector3());
    assert.ok(Math.abs(size.x - record.canonicalOracle.bounds.size[0]) < 0.03);
    assert.ok(Math.abs(size.y - record.canonicalOracle.bounds.size[1]) < 0.04);
    assert.ok(Math.abs(size.z - record.canonicalOracle.bounds.size[2]) < 0.01);
    let triangles = 0;
    tank.root.traverse((object) => {
      if (!object.isMesh || !object.geometry) return;
      triangles += (object.geometry.index?.count || object.geometry.attributes.position.count) / 3;
    });
    assert.ok(triangles < 22000, `${geometryQuality} geometry stays within the vehicle budget`);
    receipts.push({ geometryQuality, triangles: Math.round(triangles), size: size.toArray() });
  } finally {
    tank.dispose();
  }
}
assert.ok(receipts[1].triangles < receipts[0].triangles, 'LOW is materially cheaper than HIGH');
assert.deepEqual(receipts[1].size, receipts[0].size, 'LOW preserves the complete silhouette envelope');
console.log(JSON.stringify({ id: ID, receipts }));
console.log('aresApcX: PASS');
