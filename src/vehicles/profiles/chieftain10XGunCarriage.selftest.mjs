import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

const PIVOT = [.000026, 1.912199, 1.550505];
const close = (actual, expected, tolerance, label) => assert.ok(Number.isFinite(actual)
  && Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);

function witnesses(mount, pitch) {
  const point = xyz => pitch.localToWorld(new THREE.Vector3(...xyz).sub(new THREE.Vector3(...PIVOT)));
  const direction = xyz => new THREE.Vector3(...xyz).transformDirection(pitch.matrixWorld);
  const cast = (origin, dir, far = 6) => new THREE.Raycaster(point(origin), direction(dir), 0, far)
    .intersectObject(mount, false)[0];
  // Held-out scalar rays on the actual left carriage shield. Neither the
  // large rearward extension nor the small clearance notches are bbox fills.
  for (const [z, lower, upper] of [[.205, 1.762711780, 1.949757880],
    [.25, 1.740312844, 1.994015491], [.32, 1.705470053, 2.062860664],
    [.50, 1.554501179, 2.079132557], [.80, 1.684300091, 2.016608271],
    [1.05, 1.686969314, 2.005613484]]) {
    const bottom = cast([-.258, 0, z], [0, 1, 0]);
    const top = cast([-.258, 2.5, z], [0, -1, 0]);
    close(bottom?.point.distanceTo(point([-.258, lower, z])), 0, .00002, 'source lower shield plane');
    close(top?.point.distanceTo(point([-.258, upper, z])), 0, .00002, 'source upper shield plane');
  }
  assert.equal(cast([-.30, 1.68, .30], [1, 0, 0], .05), undefined,
    'source air below the rear clipped carriage corner remains real');
  assert.equal(cast([-.30, 2.06, .75], [1, 0, 0], .05), undefined,
    'source top shoulder notch is not filled with a rectangular guard');
  const frontRod = cast([.096201, 2.4, 2.09], [0, -1, 0]);
  close(frontRod?.point.distanceTo(point([.096201, 2.171358, 2.09])), 0, .001,
    'source narrow forward linkage rod is present');
}

for (const quality of ['high', 'low']) {
  const tank = createTank('chieftain_mk10_x', null, { quality, proceduralOnly: true,
    geometryReceipt: true, batchStatic: false });
  try {
    const root = tank.root, pitch = root.getObjectByName('rig_gun');
    const yaw = root.getObjectByName('rig_turret'), recoil = root.getObjectByName('rig_recoil');
    const mount = root.getObjectByName('gunMount'), gun = root.getObjectByName('gun');
    assert.equal(mount.parent, pitch, 'real shield and linkage belong to the pitching cradle');
    assert.equal(gun.parent, recoil, 'source breech cap belongs to the recoiling tube/breech');
    for (const [heading, elevation] of [[0, 0], [.63, -.12], [-.45, .15]]) {
      yaw.rotation.y = heading; pitch.rotation.x = elevation;
      recoil.position.z = -.13; root.updateMatrixWorld(true);
      witnesses(mount, pitch);
      const origin = recoil.localToWorld(new THREE.Vector3(-.004299, 1.69, 0)
        .sub(new THREE.Vector3(...PIVOT)));
      const direction = new THREE.Vector3(0, 0, 1).transformDirection(recoil.matrixWorld);
      const hit = new THREE.Raycaster(origin, direction, 0, 1).intersectObject(gun, false)[0];
      const target = recoil.localToWorld(new THREE.Vector3(-.004299, 1.69, .290584856)
        .sub(new THREE.Vector3(...PIVOT)));
      close(hit?.point.distanceTo(target), 0, .00001, 'source rear breech-cap plane recoils in the same frame');
    }
  } finally { tank.dispose(); }
}
console.log('chieftain10XGunCarriage: high/low source shield planes/notches, narrow linkage and true pitching/recoiling ownership pass');
