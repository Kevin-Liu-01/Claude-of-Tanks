import { createRigidBox, createRigidWorld } from './wt/src/sim/rigidBody.ts';
const world = createRigidWorld({ capacity: 4 });
world.bindEnvironment({ groundAt: () => 0 });
const box = createRigidBox(0.6, 0.3, 0.6, 700);
const slots = [0, 1, 2].map((k) => world.spawn(box, { x: 0.05 * k, y: 0.3 + k * 0.62 + 0.05, z: 0 }));
for (let n = 0; n < 600; n++) {
  world.step();
  if (n % 25 === 0) console.log(n, slots.map((s) => `${world.py[s].toFixed(4)} v${Math.hypot(world.vx[s], world.vy[s], world.vz[s]).toFixed(3)} w${Math.hypot(world.wx[s], world.wy[s], world.wz[s]).toFixed(3)} z${world.asleep[s]} x${world.px[s].toFixed(3)}`).join(' | '));
}
