// physics lane scratch: one rafter dropped across another (crossing between their contact spheres): does it rest on
// it, sink into it, or stir? Rafters 2.86 x 0.14 x 0.06 m, 17 kg.
const { createRigidBox, createRigidWorld } = await import('../src/sim/rigidBody.ts');
for (const [dx, dz, yaw] of [[0, 0, 90], [0.35, 0.35, 90], [0.35, 0.35, 60], [0.5, -0.4, 35], [1.0, 0.2, 80]]) {
  const world = createRigidWorld({ capacity: 4, kinematicCapacity: 0, spherePool: 512 });
  world.bindEnvironment({ groundAt: () => 0 });
  const box = createRigidBox(1.43, 0.03, 0.07, 17 / (2.86 * 0.06 * 0.14));
  const a = world.spawn(box, { x: 0, y: 0.03 + 0.001, z: 0 });
  const r = yaw * Math.PI / 180;
  const b = world.spawn(box, { x: dx, y: 0.06 + 0.03 + 0.05, z: dz, qy: Math.sin(r / 2), qw: Math.cos(r / 2) });
  let minY = Infinity, maxW = 0, sleptAt = -1;
  for (let s = 1; s <= 600; s++) {
    world.step();
    if (s > 30) { minY = Math.min(minY, world.py[b]); maxW = Math.max(maxW, Math.hypot(world.wx[b], world.wy[b], world.wz[b])); }
    if (sleptAt < 0 && world.asleep[b] && world.asleep[a]) sleptAt = s;
  }
  console.log(`cross at (${dx}, ${dz}) yaw ${yaw}: B centre lowest ${minY.toFixed(3)} m (resting on A = 0.090), final ${world.py[b].toFixed(3)}, max spin after 0.5 s ${maxW.toFixed(2)} rad/s, both asleep at ${sleptAt > 0 ? (sleptAt / 60).toFixed(2) + ' s' : 'never'}`);
}
