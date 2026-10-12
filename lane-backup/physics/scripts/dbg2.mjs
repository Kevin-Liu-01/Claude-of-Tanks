import { createRigidBox, createRigidWorld } from './wt/src/sim/rigidBody.ts';
const world = createRigidWorld({ capacity: 2 });
world.bindEnvironment({ groundAt: () => 0 });
const slot = world.spawn(createRigidBox(0.5, 0.5, 0.5, 900), { x: 2, y: 6, z: 1 });
for (let n = 0; n < 240; n++) {
  world.step();
  for (let k = 0; k < world.impactCount; k++) console.log(n, 'impact', world.impactX[k].toFixed(3), world.impactY[k].toFixed(3), world.impactZ[k].toFixed(3), 'v', world.impactSpeed[k].toFixed(2), 'partner', world.impactPartner[k]);
  if (n % 20 === 0 || (n > 55 && n < 75)) console.log(n, 'y', world.py[slot].toFixed(3), 'vy', world.vy[slot].toFixed(3), 'asleep', world.asleep[slot], 'q', world.qx[slot].toFixed(3), world.qz[slot].toFixed(3));
}
