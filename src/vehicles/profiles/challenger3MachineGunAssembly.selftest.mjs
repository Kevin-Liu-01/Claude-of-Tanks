import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';

const stationName = 'fitting_browningDerived_m2';
// Nominal authored corners, in the tank turret's frame (the kit bevels box
// edges by up to 15 mm). These cover the
// supporting assembly that formerly stayed behind when the M2 traversed.
const corners = [
  ['fork', 'yaw', [.9775, 1.18, -.17]],
  ['crossmember', 'yaw', [.97, 1.1975, -.17]],
  ['inner sensor', 'yaw', [.50, 1.12, -.10]],
  ['outer sensor bracket', 'yaw', [1.01, 1.02, -.11]],
  ['rear housing lid', 'yaw', [.89, 1.0275, -.305]],
  ['receiver spine', 'pitch', [.885, 1.20, .43]],
  ['right recoil rail', 'pitch', [.9025, 1.2225, .94]],
  ['forward rail tie', 'pitch', [.90, 1.2225, .9525]],
  ['roof foundation', 'fixed', [1.04, .74, .07]],
  ['independent front optic', 'fixed', [.86, .28, .89]],
];

for (const id of ['challenger_3', 'challenger_3x']) for (const quality of ['high', 'low']) {
  const tank = createTank(id, null, {proceduralOnly:true, geometryReceipt:true, quality, batchStatic:true});
  try {
    const turret = tank.root.getObjectByName('rig_turret');
    const mount = tank.root.getObjectByName(stationName);
    const pitch = mount?.getObjectByName('auxiliaryWeaponPitch');
    assert.ok(mount && pitch, `${id}/${quality}: complete live remote station`);
    tank.root.updateMatrixWorld(true);
    const inv = turret.matrixWorld.clone().invert();
    const point = new THREE.Vector3();
    const samples = corners.map(([label, stage, coordinates]) => {
      const target = new THREE.Vector3(...coordinates);
      let best = Infinity, found;
      turret.traverse(mesh => {
        if (!mesh.isMesh || !mesh.geometry || mesh.userData.shadowOnly || mesh.userData.authoredShadowProxy) return;
        if (stage !== 'fixed' && !mesh.name.startsWith(`${stationName}_${stage}_`)) return;
        const position = mesh.geometry.attributes.position;
        for (let i = 0; i < position.count; i++) {
          point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).applyMatrix4(inv);
          const distance = point.distanceTo(target);
          if (distance < best) { best = distance; found = {mesh, i}; }
        }
      });
      assert.ok(best < .02, `${id}/${quality}/${label}: authored stock belongs to ${stage}, gap ${best}`);
      const world = () => new THREE.Vector3().fromBufferAttribute(found.mesh.geometry.attributes.position, found.i).applyMatrix4(found.mesh.matrixWorld);
      return {label, stage, world, rest:world()};
    });
    for (const yaw of [1.1, -1.4, Math.PI]) {
      mount.rotation.y = yaw; pitch.rotation.x = 0; tank.root.updateMatrixWorld(true);
      for (const sample of samples) {
        const distance = sample.world().distanceTo(sample.rest);
        assert.ok(sample.stage === 'fixed' ? distance < 1e-8 : distance > .03,
          `${id}/${quality}/${sample.label}: correct yaw owner`);
      }
      const yawOnly = samples.map(sample => sample.world());
      pitch.rotation.x = -.45; tank.root.updateMatrixWorld(true);
      samples.forEach((sample, i) => {
        const distance = sample.world().distanceTo(yawOnly[i]);
        assert.ok(sample.stage === 'pitch' ? distance > .025 : distance < 1e-8,
          `${id}/${quality}/${sample.label}: correct elevation owner`);
      });
    }
    mount.rotation.y = 0; pitch.rotation.x = 0; tank.root.updateMatrixWorld(true);
    for (const sample of samples) assert.ok(sample.world().distanceTo(sample.rest) < 1e-8,
      `${sample.label}: return to exact authored rest pose`);
    const paint = [];
    pitch.traverse(mesh => {
      if (!mesh.name.startsWith(`${stationName}_pitch_`)) return;
      const color = mesh.geometry?.attributes.color;
      assert.ok(color, `${id}/${quality}: authored support keeps vertex paint`);
      paint.push({color, original:color.array.slice()});
    });
    assert.ok(paint.length, 'expanded supports have damage presentation');
    tank.setWeaponModuleState('roofGun', 'red');
    for (const {color, original} of paint) assert.ok(color.array.some((v, i) => v < original[i]),
      `${id}/${quality}: expanded gun supports show module damage`);
    tank.setWeaponModuleState('roofGun', 'ok');
    for (const {color, original} of paint) assert.deepEqual(color.array, original,
      `${id}/${quality}: module repair restores exact support paint`);
    tank.setDestroyed(true); tank.setDestroyed(false);
    assert.equal(tank.root.getObjectByName(stationName), mount, 'damage/reset retains the complete station');
    console.log(`${id}/${quality}: cradle, sensors, housing, rails and fixed foundations PASS`);
  } finally {tank.dispose();}
}
