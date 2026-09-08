import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';

const near = (value, expected, tolerance, label) => assert.ok(Number.isFinite(value)
  && Math.abs(value - expected) <= tolerance, `${label}: ${value}; source ${expected} ± ${tolerance}`);
const ray = (meshes, origin, direction, far = 10) => new THREE.Raycaster(
  new THREE.Vector3(...origin), new THREE.Vector3(...direction), 0, far).intersectObjects(meshes, false)[0];

function guards(all, hull, detail) {
  for (const x of [-1.2, 1.2]) {
    for (const [z, top] of [[3.36, 1.2476051], [3.40, 1.2352391], [3.48, 1.2105071]]) {
      near(ray(all, [x, 1.4, z], [0, -1, 0])?.point.y, top, .00001, 'measured sloping guard roof');
      near(ray(all, [x, .7, z], [0, 1, 0])?.point.y, .8672725, .00001,
        'complete source Object9 supplies the genuine closed underside');
      assert.equal(ray(all, [x, .70, z], [0, 1, 0], .15), undefined, 'real under-guard air');
    }
    for (const [y, front] of [[1, 3.5165089], [1.175, 3.5631038]])
      near(ray(all, [x, y, 3.8], [0, 0, -1])?.point.z, front, .00001,
        'separate main front and proud folded lip planes');
    const guardFloor = ray([detail], [x, .7, 3.348], [0, 1, 0])?.point.y;
    const hullTop = ray([hull], [x, 1.4, 3.348], [0, -1, 0])?.point.y;
    assert.ok(hullTop > guardFloor + .35, 'actual guard root positively intersects retained carrier');
  }
  for (const [start, direction, expected] of [[[-1.8, 1, 3.4], [1, 0, 0], -1.6509963],
    [[1.8, 1, 3.4], [-1, 0, 0], 1.66922]])
    near(ray(all, start, direction)?.point.x, expected, .00001, 'independent unequal left/right source spans');
}

function stocks(all, turret, detail) {
  for (const shift of [0, 2.082124]) {
    for (const [y, left, front] of [[2.4, -1.1380517, -.9043945],
      [2.5, -1.1356635, -.9096066], [2.7, -1.1154927, -.9297144],
      [3.02, -1.1098216, -.9367335]]) {
      near(ray(all, [-1.4 + shift, y, -.95], [1, 0, 0])?.point.x,
        left + shift, .0002, 'actual paired source rectangular stock left plane');
      near(ray(all, [-1.1055 + shift, y, -.7], [0, 0, -1])?.point.z,
        front, .0002, 'actual paired source stock forward plane');
    }
    near(ray(all, [-1.1055 + shift, 3.2, -.95], [0, -1, 0])?.point.y,
      3.0665929317, .000001, 'source terminal height remains unchanged');
    assert.equal(ray(all, [-1.13 + shift, 3.02, -.7], [0, 0, -1], .4), undefined,
      'narrow terminal leaves actual air outside its measured 8 mm width');
    const base = ray([detail], [-1.1055 + shift, 2.1, -.95], [0, 1, 0])?.point.y;
    const roof = ray([turret], [-1.1055 + shift, 2.5, -.95], [0, -1, 0])?.point.y;
    assert.ok(roof > base + .035, 'both actual stock roots remain seated in permanent armor');
  }
}

for (const quality of ['high', 'low']) {
  const tank = createTank('leclerc_x', null, {quality, proceduralOnly: true, geometryReceipt: true, batchStatic: false});
  try {
    tank.root.updateMatrixWorld(true);
    const all = [];
    tank.root.traverse(m => {if (m.isMesh && !m.name.startsWith('procShadow_') && !m.userData.vehicleMarking) all.push(m);});
    guards(all, tank.root.getObjectByName('hull'), tank.root.getObjectByName('hullPaintedDetail'));
    stocks(all, tank.root.getObjectByName('turret'), tank.root.getObjectByName('turretDetail'));
    near(tank.root.getObjectByName('rig_muzzle').getWorldPosition(new THREE.Vector3()).z,
      6.239235, .000001, 'gun endpoint unchanged');
    near(tank.root.getObjectByName('gearTrackBandL').position.x, -1.3158745, .000001, 'left source lane unchanged');
    near(tank.root.getObjectByName('gearTrackBandR').position.x, 1.2727975, .000001, 'right source lane unchanged');
    tank.root.getObjectByName('rig_turret').rotation.y = .4;
    tank.root.getObjectByName('rig_gun').rotation.x = -.12;
    tank.root.updateMatrixWorld(true);
    const pivot = tank.root.getObjectByName('rig_turret').position;
    const point = new THREE.Vector3(.976624, 3.0665929317, -.95).sub(pivot)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), .4).add(pivot);
    near(ray(all, [point.x, 3.2, point.z], [0, -1, 0])?.point.y, point.y, .000001,
      'antenna stocks follow real turret yaw and remain independent of gun pitch');
  } finally {tank.dispose();}
}
console.log('leclercXSourceFittings: high/low full-source guard folds, unequal spans, rectangular stock planes, air, contact and ownership pass');
