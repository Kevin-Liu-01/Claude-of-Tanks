// Wheel dressing rides its wheel (owner 2026-11-04: "be careful of decorating wheels, they have to be part of and move
// with the actual wheels themselves. check all tanks for anything like this"). tankFactoryCore's seatWheelDressing takes
// what a profile laid on a wheel off the hull: hub rings, bolt rings, spokes and face discs that 43 hulls drew as static
// hull parts now turn with their sprocket or idler, and turn and ride the suspension with their road wheel; what is the
// hull's (the Challenger 2's hydrogas pivots seen through its dished wheels) stays put. A copied visual's dressing turns
// as its source's does. The fleet-wide check is tools/wheel-dressing-audit.mjs.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import '../../tools/tank-surface-collect.mjs'; // node canvas shim
const { createTank } = await import('./tankFactory.ts');
const { cloneTankVisual } = await import('./tankVisualClone.ts');

const OPTIONS = { proceduralOnly: true, quality: 'high', camoSeed: 4242 };
const pose = (scroll) => ({ pos: { x: 0, y: 0, z: 0 }, yaw: 0, visualPitch: 0, visualRoll: 0, yawRate: 0, speed: 4,
  turretYaw: 0, gunPitch: 0, trackScroll: { l: scroll, r: scroll } });
// alternate road wheels stand on 9 cm steps, so a road wheel's dressing has to travel with it
const steps = (_x, z) => (Math.floor((z + 20) / 0.9) % 2 ? 0.09 : 0);
function drive(tank, scroll, sampler) {
  tank.setGroundSampler(sampler);
  for (let frame = 0; frame < 60; frame++) tank.syncFromState(pose(scroll), 1 / 60, 10);
  tank.root.updateMatrixWorld(true);
}
const dressingOf = (root) => {
  const found = [];
  root.traverse((object) => { if (object.userData.wheelDressing || object.userData.wheelDressingOf) found.push(object); });
  return found;
};
const matrices = (objects) => objects.map((object) => Float32Array.from(object.isInstancedMesh
  ? object.instanceMatrix.array : object.matrixWorld.elements));
const moved = (a, b) => a.length === b.length && a.some((value, i) => Math.abs(value - b[i]) > 1e-5);
const translations = (mesh) => {
  const out = [], m = new THREE.Matrix4(), p = new THREE.Vector3();
  for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, m); out.push(p.setFromMatrixPosition(m).toArray()); }
  return out;
};

function check(id, expect) {
  const tank = createTank(id, null, OPTIONS);
  try {
    const dressing = dressingOf(tank.root);
    for (const kind of expect.ends) {
      assert.ok(dressing.some((object) => object.userData.wheelDressingOf === kind), `${id}: its ${kind} dressing turns with it`);
    }
    const road = dressing.filter((object) => object.userData.wheelDressingOf === 'road');
    assert.equal(road.length > 0, expect.road, `${id}: road-wheel dressing ${expect.road ? 'rides' : 'none (its pivots stay the hull\'s)'}`);
    drive(tank, 0, () => 0);
    const rest = matrices(dressing);
    drive(tank, 0.37, steps);
    const driven = matrices(dressing);
    dressing.forEach((object, i) => assert.ok(moved(rest[i], driven[i]), `${id}: ${object.name} turns with its wheel`));
    // a road wheel's dressing sits on that wheel's hub, wherever its suspension has carried it
    const tires = tank.root.getObjectByName('gearRoadWheelTires');
    const hubs = tires ? translations(tires) : [];
    for (const layer of road) {
      if (!layer.geometry.boundingBox) layer.geometry.computeBoundingBox();
      const box = layer.geometry.boundingBox;
      assert.ok(Math.abs(box.min.y + box.max.y) < 2e-3 && Math.abs(box.min.z + box.max.z) < 2e-3,
        `${id}: ${layer.name} is round about its wheel's axle (re-centred where it was drawn off it)`);
      for (const [x, y, z] of translations(layer)) {
        assert.ok(hubs.some(([hx, hy, hz]) => Math.sign(hx) === Math.sign(x) && Math.abs(hy - y) < 1e-4 && Math.abs(hz - z) < 1e-4),
          `${id}: ${layer.name} rides a road wheel's hub (${x.toFixed(2)}, ${y.toFixed(3)}, ${z.toFixed(2)})`);
      }
    }
    if (expect.clone) {
      drive(tank, 0, () => 0);
      const copy = cloneTankVisual(tank, null, OPTIONS);
      try {
        const copied = dressingOf(copy.root);
        assert.equal(copied.length, dressing.length, `${id}: the copy carries the dressing`);
        drive(copy, 0, () => 0);
        const copyRest = matrices(copied);
        drive(copy, 0.37, steps);
        copied.forEach((object, i) => assert.ok(moved(copyRest[i], matrices([object])[0]), `${id}: the copy's ${object.name} turns`));
      } finally { copy.dispose?.(); }
    }
  } finally { tank.dispose?.(); }
}

// sprocket and idler faces, spokes and bolts from its running-gear buckets; the hydrogas pivots behind the dish stay
check('challenger2', { ends: ['sprocket', 'idler'], road: false, clone: true });
// hub rings on the road wheels, the left ones re-centred on its staggered left wheels
check('m48a5_patton', { ends: [], road: true });
// the profile's own static end-wheel dress meshes, split onto the wheels they lie on
check('m1a1', { ends: ['sprocket', 'idler'], road: false });
console.log('wheelDressing: ok');
