import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';

const near = (value, target, tolerance, label) => assert.ok(Number.isFinite(value)
  && Math.abs(value - target) <= tolerance, `${label}: ${value}; source ${target} ± ${tolerance}`);
const ray = (meshes, origin, direction, far = 8) => new THREE.Raycaster(
  new THREE.Vector3(...origin), new THREE.Vector3(...direction), 0, far).intersectObjects(meshes, false)[0];

function sourceHoops(all, lattice) {
  for (const x of [-1.3, -1, -.7, -.3]) {
    near(ray(all, [x, 3, -1.9], [0, -1, 0])?.point.y, 1.855355, .00001,
      'actual source floor is the first surface through the open basket');
    assert.equal(ray(all, [x, 2.27, -1.9], [0, -1, 0], .36), undefined,
      'all three upper hoop levels retain real central air');
  }
  for (const [z, y] of [[-2.305, 2.2045165], [-2.254, 1.9735096], [-2.202, 1.8711768]])
    near(ray(all, [-1, 3, z], [0, -1, 0])?.point.y, y, .001,
      'fixed source hoop crowns have stepped aft stations, not tilted shelves');
  near(ray([lattice], [-1, 2.03, -2.305], [0, 1, 0])?.point.y, 2.049182, .001,
    'actual middle upper stock has a closed measured underside');
  assert.equal(ray(all, [-1, 2.12, -2.20], [0, 0, -1], .08), undefined,
    'source air between upper stocks stays genuinely open');
  // A side post must physically meet both measured upper and bottom hoops;
  // this checks the integrated owner buffers, not a separately made helper.
  const postTop = ray([lattice], [-1.48817, 2.195, -1.94687], [0, -1, 0])?.point.y;
  const hoopBottom = ray([lattice], [-1.48817, 2.17, -1.94687], [0, 1, 0])?.point.y;
  assert.ok(postTop > hoopBottom && postTop < 2.206, 'upper hoop positively engages the actual vertical side post');
}

function sourceBox(all, detail, turret) {
  for (const [x, z, roof, floor] of [[.3, -2.1, 2.2633352, 1.9143386],
    [.6, -2.1, 2.2635496, 1.9136401], [.9, -2.1, 2.263764, 1.9129416],
    [.3, -1.8, 2.2656391, 1.7896449], [.6, -1.8, 2.2656302, 1.7896359],
    [.9, -1.8, 2.2656212, 1.8005985]]) {
    near(ray(all, [x, 3, z], [0, -1, 0])?.point.y, roof, .001,
      'actual source canted rear-box roof');
    near(ray(all, [x, 1.7, z], [0, 1, 0])?.point.y, floor, .002,
      'actual source sloping lower body/attached cover');
  }
  assert.equal(ray(all, [.6, 1.75, -2.1], [0, 1, 0], .15), undefined,
    'real source under-box air remains empty');
  for (const [y, z] of [[2.2, -2.1725846], [2.1, -2.1691102]])
    near(ray(all, [.6, y, -2.4], [0, 0, 1])?.point.z, z, .001,
      'held-out inclined source rear-box face');
  const rootFloor = ray([detail], [.6, 1.7, -1.55], [0, 1, 0])?.point.y;
  const coreRoof = ray([turret], [.6, 2.3, -1.55], [0, -1, 0])?.point.y;
  assert.ok(coreRoof > rootFloor + .20, 'measured box front root overlaps retained permanent turret');
  const floor = ray([detail], [-1, 1.7, -1.34], [0, 1, 0])?.point.y;
  const core = ray([turret], [-1, 2.4, -1.34], [0, -1, 0])?.point.y;
  assert.ok(core > floor + .15, 'actual basket floor seats into retained turret armor');
}

for (const quality of ['high', 'low']) {
  const tank = createTank('leclerc_x', null, {quality, proceduralOnly: true, geometryReceipt: true, batchStatic: false});
  try {
    tank.root.updateMatrixWorld(true);
    const all = [];
    tank.root.traverse(m => {if (m.isMesh && !m.name.startsWith('procShadow_') && !m.userData.vehicleMarking) all.push(m);});
    const detail = tank.root.getObjectByName('turretDetail'), turret = tank.root.getObjectByName('turret');
    const lattice = tank.root.getObjectByName('turretOpenLattice');
    assert.equal(lattice?.userData.continuityRole, 'open-lattice', 'only actual separated rods have open-frame semantics');
    assert.notEqual(detail.userData.continuityRole, 'open-lattice', 'floor and closed box remain ordinary permanent solid equipment');
    sourceHoops(all, lattice); sourceBox(all, detail, turret);
    near(tank.root.getObjectByName('rig_muzzle').getWorldPosition(new THREE.Vector3()).z,
      6.239235, .000001, 'source cannon endpoint unchanged');
    near(tank.root.getObjectByName('gearTrackBandL').position.x, -1.3158745, .000001, 'left lane unchanged');
    near(tank.root.getObjectByName('gearTrackBandR').position.x, 1.2727975, .000001, 'right lane unchanged');
    const yaw = tank.root.getObjectByName('rig_turret');
    const point = new THREE.Vector3(.6, 2.2635496, -2.1).sub(yaw.position)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), .5).add(yaw.position);
    yaw.rotation.y = .5; tank.root.getObjectByName('rig_gun').rotation.x = -.1;
    tank.root.updateMatrixWorld(true);
    near(ray([detail], [point.x, 3, point.z], [0, -1, 0])?.point.y, point.y, .001,
      'real permanent rear-box follows turret yaw, not gun pitch');
  } finally {tank.dispose();}
}
console.log('leclercXRearRack: high/low actual open hoops, source box/floor, support, fixed axes and yaw ownership pass');
