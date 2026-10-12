import { createRigidBox, createRigidShape, createRigidWorld } from './wt/src/sim/rigidBody.ts';
const ground = { groundAt: (x, z) => 0.6 * Math.sin(x * 0.11) * Math.cos(z * 0.07) + 0.02 * x };
function bench(label, n, make, steps = 600) {
  const world = createRigidWorld({ capacity: n, spherePool: n * 64 });
  world.bindEnvironment(ground);
  for (let k = 0; k < n; k++) make(world, k);
  const c0 = process.cpuUsage();
  let awake = 0;
  for (let s = 0; s < steps; s++) { world.step(); awake += world.awakeCount; }
  const c = process.cpuUsage(c0);
  console.log(label, `${n} bodies: ${((c.user + c.system) / 1000 / steps).toFixed(3)} ms CPU/step, ${(((c.user + c.system) / 1000) / Math.max(1, awake)).toFixed(4)} ms per awake body-step, mean awake ${(awake / steps).toFixed(1)}`);
}
const brick = createRigidBox(0.45, 0.2, 0.3, 1900);
const panel = createRigidBox(2.5, 1.6, 0.18, 1900);
const turret = createRigidShape([
  { kind: 'box', center: [0, 0.45, -0.2], half: [1.7, 0.45, 2.1], mass: 14000 },
  { kind: 'capsule', a: [0, 0.5, 1.9], b: [0, 0.38, 6.6], radius: 0.09, mass: 2200 },
]);
console.log('spheres: brick', brick.sphereCount, 'panel', panel.sphereCount, 'turret', turret.sphereCount);
for (let rep = 0; rep < 2; rep++) {
  bench('debris blocks', 128, (w, k) => w.spawn(brick, { x: (k % 8) * 1.1, y: 2 + (k >> 3) * 0.6, z: ((k >> 3) % 4) * 1.2, vx: (k % 5) - 2, vy: 2, vz: (k % 3) - 1, wx: k % 4, wz: (k % 7) - 3 }));
  bench('wall panels', 24, (w, k) => w.spawn(panel, { x: (k % 6) * 3.5, y: 3 + (k >> 2) * 1.2, z: (k >> 2) * 2, qx: 0.3, qw: 0.95, vx: 1, wz: 0.5 }));
  bench('turrets', 16, (w, k) => w.spawn(turret, { x: k * 9, y: 3, z: 0, vx: 1.5, vy: 8, wx: 1.2, wy: 2, wz: -0.8 }));
}
