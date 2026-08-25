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
  assert.equal(gear.sprocket.y, 0.85,
    'rear drive sprocket is raised another 16 cm above its prior station');
  assert.ok(Math.abs(closure.sprocketLiftM -
    (gear.sprocket.y - closure.previousSprocketY)) < 1e-9,
    'sprocket lift receipt matches the live running-gear course');
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
  assert.equal(closure.removedInnerTrackPanelCount, 2,
    'both full-length dark panels behind the tracks are removed');
  assert.deepEqual(closure.lowerHullClosure, {
    lowerHalfWidth: 0.98, lowerY: 1.0,
    upperHalfWidth: 1.42, upperY: 1.22,
    rearZ: -3.70, frontZ: 1.80,
  }, 'structural lower hull fills the complete gap between belly and sponson');
  assert.ok(closure.lowerHullClosure.lowerHalfWidth < closure.trackLaneInnerX,
    'lower hull closure begins inboard of the animated track lane');

  let fullLengthDarkPanels = 0;
  hull.traverse((object) => {
    if (object.name !== 'hullRunningGearDark' || !object.geometry) return;
    object.geometry.computeBoundingBox();
    const bounds = object.geometry.boundingBox;
    if (bounds.max.x - bounds.min.x <= 0.03 &&
        bounds.max.y - bounds.min.y >= 1.0 &&
        bounds.max.z - bounds.min.z >= 6.0) fullLengthDarkPanels++;
  });
  assert.equal(fullLengthDarkPanels, 0,
    'no full-length dark wheel-well panel remains behind either track');

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
