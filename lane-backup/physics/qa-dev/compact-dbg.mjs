const { createRigidBox, createRigidWorld } = await import('../src/sim/rigidBody.ts');
const world = createRigidWorld({ capacity: 4, kinematicCapacity: 0, spherePool: 48 });
world.bindEnvironment({ groundAt: () => 0 });
const block = createRigidBox(0.5, 0.25, 0.5, 900);
const big = createRigidBox(0.6, 0.3, 0.6, 900);
console.log('spheres block', block.sphereCount, 'big', big.sphereCount, 'allPlain', block.allPlainBoxes);
const falling = world.spawn(block, { x: -3, y: 12, z: 0 });
const sleeper = world.spawn(block, { x: 0, y: 0.2505, z: 0 });
let n = 0; while (!world.asleep[sleeper] && n < 60) { world.step(); n++; }
console.log('sleeper asleep after', n, 'falling y', world.py[falling].toFixed(2));
world.remove(falling);
const d = world.spawn(big, { x: 4, y: 1.4, z: 0 });
console.log('dropped slot', d);
let woke = -1;
for (let k = 0; k < 150 && woke < 0; k++) { world.step(); if (!world.asleep[sleeper]) woke = k; }
console.log('woke at', woke, 'sleeper y', world.py[sleeper].toFixed(3));
