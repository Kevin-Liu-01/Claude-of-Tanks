// physics lane scratch: heavy on light. A roof slab (2.5 x 0.08 x 1.6 m, M kg) dropped on two thin rafters (2.86 x
// 0.06 x 0.14, 17 kg) lying crossed on two plates (2.8 x 0.14 x 0.14, 30 kg) on the ground. Does the stack sleep?
const { createRigidBox, createRigidWorld } = await import('../src/sim/rigidBody.ts');
const vi = Number(process.argv.find((a) => a.startsWith('--vi='))?.slice(5) ?? 8), pi = Number(process.argv.find((a) => a.startsWith('--pi='))?.slice(5) ?? 3);
for (const M of [60, 200, 600]) {
  const world = createRigidWorld({ capacity: 8, kinematicCapacity: 0, spherePool: 1024, velocityIterations: vi, positionIterations: pi, contactsPerBody: 28 });
  world.bindEnvironment({ groundAt: () => 0 });
  const ratio = Number(process.argv.find((a) => a.startsWith('--ir='))?.slice(5) ?? 0);
  const box = (hx, hy, hz, m) => {
    const shape = createRigidBox(hx, hy, hz, m / (8 * hx * hy * hz), { restitution: 0.15, friction: 0.7 });
    if (ratio) { const I = Array.from(shape.invInertia, (x) => 1 / x), top = Math.max(...I); for (let k = 0; k < 3; k++) shape.invInertia[k] = 1 / Math.max(I[k], top / ratio); }
    return shape;
  };
  const plate = box(1.4, 0.07, 0.07, 30), rafter = box(1.43, 0.03, 0.07, 17), slab = box(1.25, 0.04, 0.8, M);
  const yaw = (a) => ({ qy: Math.sin(a / 2), qw: Math.cos(a / 2) });
  const s = [];
  s.push(world.spawn(plate, { x: 0, y: 0.071, z: -0.9 }));
  s.push(world.spawn(plate, { x: 0, y: 0.071, z: 0.9 }));
  s.push(world.spawn(rafter, { x: -0.6, y: 0.14 + 0.031, z: 0, ...yaw(Math.PI / 2 + 0.05) }));
  s.push(world.spawn(rafter, { x: 0.55, y: 0.14 + 0.031, z: 0.02, ...yaw(Math.PI / 2 - 0.08) }));
  s.push(world.spawn(slab, { x: 0.02, y: 0.2 + 0.04 + 0.3, z: 0, ...yaw(0.1) }));
  let sleptAt = -1, maxW = 0;
  for (let n = 1; n <= 900; n++) {
    world.step();
    if (n > 120) for (const k of s) maxW = Math.max(maxW, Math.hypot(world.wx[k], world.wy[k], world.wz[k]));
    if (sleptAt < 0 && s.every((k) => world.asleep[k])) sleptAt = n;
  }
  const slabY = world.py[s[4]];
  console.log(`slab ${M} kg: all asleep at ${sleptAt > 0 ? (sleptAt / 60).toFixed(2) + ' s' : 'never (15 s)'}, max spin after 2 s ${maxW.toFixed(2)} rad/s, slab centre ${slabY.toFixed(3)} m (stacked 0.240), rafters at ${world.py[s[2]].toFixed(3)}/${world.py[s[3]].toFixed(3)} (0.170)`);
}
