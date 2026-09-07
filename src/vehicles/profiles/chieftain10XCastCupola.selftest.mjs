import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

const near = (actual, expected, tolerance, message) => assert.ok(Number.isFinite(actual)
  && Math.abs(actual - expected) <= tolerance, `${message}: ${actual}, source ${expected}`);

function hit(meshes, frame, xyz, direction, far = 8) {
  return new THREE.Raycaster(new THREE.Vector3(...xyz).applyMatrix4(frame),
    new THREE.Vector3(...direction).transformDirection(frame), 0, far).intersectObjects(meshes, false)[0];
}

function worldValue(meshes, frame, xyz, direction, coordinate, far = 8) {
  const result = hit(meshes, frame, xyz, direction, far);
  return result?.point.clone().applyMatrix4(frame.clone().invert()).getComponent(coordinate);
}

function checkCast(turret, all, frame) {
  // Held-out complete-source intersections include the actual rear shell
  // (bone_turret_39009), not just the disconnected 39004 surface subset.
  for (const [x, z, y, tolerance] of [[0, -.95, 1.804111, .0003],
    [.5, -.85, 1.795251, .0003], [.8, -.9, 1.807130, .001],
    [0, -1.4, 1.844132, .0003], [.5, -1.5, 1.853056, .0003],
    [.5, -.65, 1.578238, .0002], [0, -.5, 1.512957, .00001]]) {
    near(worldValue(turret, frame, [x, 0, z], [0, 1, 0], 1), y, tolerance,
      'measured raised casting floor or stepped bearing underside');
  }
  for (const [x, z, y, tolerance] of [[0, -1.5, 2.359626, .001],
    [0, -1.3, 2.394261, .001], [.5, -1.5, 2.388812, .0001],
    [-.5, -1.3, 2.424079, .0002]]) {
    near(worldValue(all, frame, [x, 4, z], [0, -1, 0], 1), y, tolerance,
      'sloping source rear casting and separate supported hatch skin');
  }
  for (const side of [-1, 1]) near(worldValue(turret, frame,
    [side * 2, 2.1, -1.3], [-side, 0, 0], 0), side * .977573, .001,
  'previously absent closed rear-body side');
  const hatchMeshes = all.filter(o => o.name === 'turretDetail');
  for (const x of [-.5, .5]) {
    const bottom = worldValue(hatchMeshes, frame, [x, 2.32, -1.4], [0, 1, 0], 1);
    const supportingRoof = worldValue(turret, frame, [x, 3, -1.4], [0, -1, 0], 1);
    assert.ok(supportingRoof - bottom > .001 && supportingRoof - bottom < .004,
      'both separate source-sloped hatches positively overlap permanent rear casting');
  }
  for (const z of [-1.4, -1.0, -.85]) assert.equal(
    hit(all, frame, [0, 1.73, z], [0, 1, 0], .03), undefined,
    'raised rear casting preserves actual hull-to-turret air');
}

function checkCupola(all, frame) {
  // Independent down-rays of bone_mg_aa_h. These broad ring locations
  // must not inherit the much higher isolated MG/hatch hardware maximum.
  for (const [x, z, y] of [[-.8680325, -.2796505, 2.620382],
    [-.9080325, -.2796505, 2.620135], [-.9480325, -.2796505, 2.619887],
    [-.9880325, -.2796505, 2.619639], [-.5, -.7, 2.620125]]) {
    near(worldValue(all, frame, [x, 4, z], [0, -1, 0], 1), y, .001,
      'actual low annular bearing crown');
  }
  for (const x of [-.98, -.92, -.04, .005]) assert.equal(
    hit(all, frame, [x, 2.86, -.28], [0, -1, 0], .19), undefined,
    'source air over the bearing is not a tall opaque cupola cap');
  near(worldValue(all, frame, [-.4872885, 4, -.4119], [0, -1, 0], 1),
    2.738320, .0002, 'source dome center is below localized handle maxima');
  near(worldValue(all, frame, [-.6872885, 4, -.4119], [0, -1, 0], 1),
    2.709759, .001, 'source dome shoulder');
  near(worldValue(all, frame, [-.35805, 4, .70], [0, -1, 0], 1),
    2.80820, .0002, 'source roof-MG barrel axis and outside radius');
  assert.equal(hit(all, frame, [-.46, 2.850, .70], [0, 0, -1], .20), undefined,
    'old displaced generic MG position remains empty');
}

for (const quality of ['high', 'low']) {
  const tank = createTank('chieftain_mk10_x', null, { quality, proceduralOnly: true,
    geometryReceipt: true, batchStatic: false });
  try {
    const root = tank.root, rig = root.getObjectByName('rig_turret');
    root.updateMatrixWorld(true);
    const neutralInverse = rig.matrixWorld.clone().invert();
    const all = [], turret = [];
    root.traverse(o => {
      if (!o.isMesh || o.name.startsWith('procShadow_') || o.userData.vehicleMarking) return;
      all.push(o);
      if (o.name === 'turret') turret.push(o);
    });
    const originalGeometry = all.map(o => [o, o.geometry]);
    for (const angle of [0, -.71, .83]) {
      rig.rotation.y = angle; root.updateMatrixWorld(true);
      const frame = rig.matrixWorld.clone().multiply(neutralInverse);
      checkCast(turret, all, frame);
      checkCupola(all, frame);
      for (const [mesh, geometry] of originalGeometry) assert.equal(mesh.geometry, geometry,
        'yaw does not recreate source-sized casting, optical or MG geometry');
    }
  } finally { tank.dispose(); }
}
console.log('chieftain10XCastCupola: high/low source floor, aft closure, annular crown, dome, MG and genuine air pass');
