import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { registerProfiledBuilders } from '../tankFactoryCore.ts';
import { buildChieftain5XPhotoDraft } from './chieftain5XPhotoDraft.ts';
import { buildStrv122X } from './strv122XPhotoDraft.ts';

// Keep the original photo construction contract independent of the newly
// source-authored actual Mk5. Its source model has separate acceptance tests.
registerProfiledBuilders({ chieftain5_x: buildChieftain5XPhotoDraft, strv122_x: buildStrv122X });

const near = (a, b, tolerance, label) => assert.ok(Number.isFinite(a)
  && Math.abs(a - b) <= tolerance, `${label}: ${a} versus ${b}`);

function cast(meshes, frame, point, axis, far = 5) {
  return new THREE.Raycaster(new THREE.Vector3(...point).applyMatrix4(frame),
    new THREE.Vector3(...axis).transformDirection(frame), 0, far).intersectObjects(meshes, false)[0];
}

function equipment(root) {
  const meshes = [];
  root.traverse(o => { if (o.isMesh && !o.name.startsWith('procShadow_') && !o.userData.vehicleMarking) meshes.push(o); });
  return meshes;
}

function strvChecks(tank) {
  const all = equipment(tank.root), turret = tank.root.getObjectByName('rig_turret');
  for (const yaw of [0, -.9, .72]) {
    turret.rotation.y = yaw; tank.root.updateMatrixWorld(true);
    const frame = turret.matrixWorld.clone().multiply(new THREE.Matrix4().makeTranslation(0, -1.61, -.61));
    for (const side of [-1, 1]) {
      const sideFace = cast(all, frame, [side * 1.8, 2.28, -1.8], [-side, 0, 0]);
      assert.equal(sideFace?.object.name, 'turretDetail');
      near(sideFace?.distance, .28, 2e-6, 'positive external bin, not a buried panel');
      for (const z of [-2.07, -1.49]) {
        const root = cast(all.filter(o => o.name === 'turretDetail'), frame,
          [side * 1.1, 2.28, z], [side, 0, 0]);
        near(root?.distance, .04, 2e-6, 'closed bin inboard root');
        const armor = cast(all.filter(o => o.name === 'turret'), frame,
          [side * 1.8, 2.28, z], [-side, 0, 0]);
        assert.ok(.70 - armor.distance > root.distance + .02,
          'both bin ends overlap actual permanent bustle by at least 20 mm');
      }
      // A transverse approach through the middle of each shallow folded handle
      // must see real open air; a side-on ray still sees its supported front bar.
      for (const y of [2.190, 2.355]) {
        assert.equal(cast(all, frame, [side * 1.56, y + .05, -1.8], [0, -1, 0], .10),
          undefined, 'folded handle center is not a filled box');
        const bridge = cast(all, frame, [side * 1.8, y, -1.8], [-side, 0, 0]);
        near(bridge?.distance, .187, 2e-6, 'outer handle bridge remains physical');
      }
      assert.equal(cast(all.filter(o => o.name === 'turret' || o.name === 'turretDetail'), frame,
        [side * 1.32, 2.0, -2.45], [0, 0, 1], .30), undefined,
      'the original aft bustle undercut stays open below the added bin');
    }
  }
}

function mk5Checks(tank) {
  const all = equipment(tank.root), turret = tank.root.getObjectByName('rig_turret');
  const gun = tank.root.getObjectByName('rig_gun'), recoil = tank.root.getObjectByName('rig_recoil');
  const mount = tank.root.getObjectByName('gunMount');
  assert.ok(mount.parent === gun, 'real exterior auxiliaries share the pitch-owned cradle');
  for (const yaw of [0, -.7]) for (const pitch of [-.12, .22]) {
    turret.rotation.y = yaw; gun.rotation.x = pitch; tank.root.updateMatrixWorld(true);
    const frame = gun.matrixWorld.clone().multiply(new THREE.Matrix4().makeTranslation(0, -2.035, -1.69));
    const samples = [[-.358, 2.192, 2.71, .00635, .019], [.15, 2.354, 2.145, .00381, .015]];
    for (const [x, y, front, bore, outside] of samples) for (let i = 0; i < 8; i++) {
      const a = (i + .25) * Math.PI / 4;
      const point = [x + Math.cos(a) * bore * .55, y + Math.sin(a) * bore * .55, front + .04];
      const stock = cast(all, frame, point, [0, 0, -1]);
      assert.equal(stock?.object.name, 'gunMount', 'actual auxiliary bore reaches its own pitched stock');
      near(stock?.distance, .10, 2e-6, '60 mm-deep genuine muzzle recess');
      assert.equal(cast(all, frame, point, [0, 0, -1], .095), undefined,
        'no casting, sleeve or main barrel fills either muzzle mouth');
      const rim = cast(all, frame, [x + outside * .8 * Math.cos(a),
        y + outside * .8 * Math.sin(a), front + .04], [0, 0, -1]);
      near(rim?.distance, .04, 2e-6, 'true metal annulus around auxiliary bore');
    }
    const before = cast(all, frame, [-.358, 2.192, 2.75], [0, 0, -1])?.point.clone();
    recoil.position.z = -.12; tank.root.updateMatrixWorld(true);
    near(before.distanceTo(cast(all, frame, [-.358, 2.192, 2.75], [0, 0, -1])?.point), 0, 1e-6,
      'main barrel recoil never drags the independently cradle-mounted ranging form');
    recoil.position.z = 0;
    // Positive support witnesses are on the actual shared cradle, below the
    // inferred receiver boot and upper sleeve—not detached surface overlays.
    const saddle = cast(all.filter(o => o === mount), frame, [-.26, 2.12, 1.64], [0, 1, 0]);
    near(saddle?.distance, .015, 2e-6, 'left saddle has a real lower attachment surface');
    const upper = cast(all.filter(o => o === mount), frame, [.15, 2.20, 1.56], [0, 1, 0]);
    assert.ok(upper && upper.distance < .05, 'upper sleeve foot reaches actual pitch-owned cradle');
  }
}

for (const quality of ['high', 'low']) for (const id of ['strv122_x', 'chieftain5_x']) {
  const tank = createTank(id, null, { quality, proceduralOnly: true, geometryReceipt: true, batchStatic: false });
  try {
    tank.root.updateMatrixWorld(true);
    if (id === 'strv122_x') strvChecks(tank); else mk5Checks(tank);
  } finally { tank.dispose(); }
}
console.log('primaryPhotoEquipment.selftest: high/low attached bustle bins, open handles and independent pitched auxiliary forms pass');
