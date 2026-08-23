import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.js';

const tank = createTank('k1a1', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});

try {
  const hull = tank.root.getObjectByName('rig_hull');
  const turret = tank.root.getObjectByName('rig_turret');
  const closure = hull?.userData.k1a1RunningGearClosure;
  const cage = turret?.userData.k1a1SideCageSeating;
  const [gear] = hull?.userData.runningGearReceipts || [];

  assert.ok(hull && turret && closure && cage && gear,
    'K1A1 exposes running-gear, bow-closure, and turret-cage receipts');

  assert.deepEqual(gear.idler, closure.idler,
    'front idler receipt matches the forward/up K1A1 terminal station');
  assert.deepEqual(gear.sprocket, closure.sprocket,
    'rear sprocket receipt matches the rearward/up K1A1 terminal station');
  assert.ok(gear.idler.z >= 3.0 && gear.idler.y >= 0.78,
    'front idler sits visibly forward and above the road-wheel line');
  assert.ok(gear.sprocket.z <= -2.88 && gear.sprocket.y >= 0.68,
    'rear drive sprocket sits visibly aft and above the road-wheel line');
  assert.ok(Math.max(...gear.loopPoints.map(([z]) => z)) > gear.idler.z + gear.idler.r,
    'reseated track course wraps around the relocated front idler');
  assert.ok(Math.min(...gear.loopPoints.map(([z]) => z)) < gear.sprocket.z - gear.sprocket.r,
    'reseated track course wraps around the relocated rear sprocket');

  assert.ok(closure.closureHalfWidth < closure.trackLaneInnerX,
    'under-glacis closure remains inside both animated track lanes');
  assert.ok(closure.closureRearZ < closure.upperRearJoin.z &&
    closure.closureFrontZ === closure.upperFrontJoin.z,
  'closed bow volume overlaps the belly and meets both ends of the upper glacis');
  assert.ok(closure.closureFloorY <= 1.0 && closure.upperRearJoin.y === 1.475,
    'bow closure spans vertically from the belly into the sovereign glacis plane');

  assert.equal(cage.bracketCount, 8,
    'four shell-to-rail basket arms are mirrored on both turret sides');
  assert.equal(cage.weldFootCount, cage.bracketCount,
    'every K1A1 basket arm has a welded shell foot');
  assert.equal(cage.bracketOuterX, cage.outerRailX,
    'basket arms terminate directly inside the relocated outer rails');
  assert.ok(cage.bracketInnerX <= Math.min(...cage.shellFootXs) - 0.10,
    'basket arms overlap the turret loft rather than stopping outside it');
} finally {
  tank.dispose();
}

console.log('k1a1Geometry.selftest: terminal wheels, closed bow and seated turret cages pass');
