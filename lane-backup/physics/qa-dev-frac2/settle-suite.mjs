// physics lane scratch: a settle suite for engine variants — 12 seeded heaps (24-64 boxes of mixed kinds dropped on a
// lattice with random spin and yaw) in a raw world like the debris pool's: asleep share at 6/10/14 s, CPU per step,
// deepest resting penetration into the ground. Aggregates over the seeds (chaos-robust).
const { createRigidWorld, createRigidBox } = await import('../src/sim/rigidBody.ts');
const seeds = Number(process.argv.find((a) => a.startsWith('--seeds='))?.slice(8) ?? 12);
let tot6 = 0, tot10 = 0, tot14 = 0, totN = 0, cpu = 0, steps = 0, deepest = 0, fastest = 0;
for (let seed = 1; seed <= seeds; seed++) {
  let a = (seed * 2654435761) >>> 0;
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const N = 24 + (seed % 5) * 10;
  const world = createRigidWorld({ capacity: 96, kinematicCapacity: 0, spherePool: 96 * 56, velocityIterations: 8, positionIterations: 3, contactsPerBody: 28 });
  world.bindEnvironment({ groundAt: () => 0 });
  const kinds = [
    () => [1.2 + rnd() * 1.6, 0.1 + rnd() * 0.08, 0.9 + rnd() * 1.0, 1900],
    () => [1.5 + rnd() * 1.5, 0.08 + rnd() * 0.06, 1.0 + rnd() * 1.2, 1200],
    () => [1.2 + rnd() * 1.6, 0.04 + rnd() * 0.04, 0.07 + rnd() * 0.04, 600],
    () => [0.2 + rnd() * 0.4, 0.15 + rnd() * 0.3, 0.2 + rnd() * 0.4, 1900],
  ];
  const slots = [];
  for (let i = 0; i < N; i++) {
    const [hx, hy, hz, rho] = kinds[Math.floor(rnd() * 4)]();
    const shape = createRigidBox(hx, hy, hz, rho, { restitution: 0.14, friction: 0.72, rolling: 0.15 });
    const cell = i % 9, layer = (i / 9) | 0, yaw = (rnd() - 0.5) * 0.8;
    slots.push(world.spawn(shape, { x: ((cell % 3) - 1) * 3.4, y: 0.5 + layer * 0.7, z: (((cell / 3) | 0) - 1) * 3.4, qy: Math.sin(yaw / 2), qw: Math.cos(yaw / 2),
      vx: (rnd() - 0.5) * 2, vz: (rnd() - 0.5) * 2, wx: (rnd() - 0.5) * 2, wz: (rnd() - 0.5) * 2 }));
  }
  for (let n = 1; n <= 840; n++) {
    const c0 = process.cpuUsage(); world.step(); const c = process.cpuUsage(c0);
    cpu += (c.user + c.system) / 1000; steps++;
    if (n === 360 || n === 600 || n === 840) {
      let k = 0; for (const s of slots) if (world.asleep[s]) k++;
      if (n === 360) tot6 += k; else if (n === 600) tot10 += k; else tot14 += k;
    }
  }
  totN += N;
  for (const s of slots) {
    // the lowest corner of each body (penetration into the ground)
    const sh = world.shape(s); let low = Infinity;
    const qx = world.qx[s], qy = world.qy[s], qz = world.qz[s], qw = world.qw[s];
    const R = [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qw * qz), 2 * (qx * qz + qw * qy), 2 * (qx * qy + qw * qz), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qw * qx), 2 * (qx * qz - qw * qy), 2 * (qy * qz + qw * qx), 1 - 2 * (qx * qx + qy * qy)];
    const h = sh.solids.slice(8, 11);
    for (let cc = 0; cc < 8; cc++) { const x = (cc & 1 ? 1 : -1) * h[0], y = (cc & 2 ? 1 : -1) * h[1], z = (cc & 4 ? 1 : -1) * h[2]; low = Math.min(low, world.py[s] + R[3] * x + R[4] * y + R[5] * z - (R[3] * sh.com[0] + R[4] * sh.com[1] + R[5] * sh.com[2]) * 0); }
    deepest = Math.min(deepest, low);
    fastest = Math.max(fastest, Math.hypot(world.wx[s], world.wy[s], world.wz[s]));
  }
}
console.log(`settle suite ${seeds} heaps, ${totN} bodies: asleep 6 s ${(100 * tot6 / totN).toFixed(0)} %, 10 s ${(100 * tot10 / totN).toFixed(0)} %, 14 s ${(100 * tot14 / totN).toFixed(0)} %; CPU ${(cpu / steps).toFixed(3)} ms/step; deepest corner ${(deepest * 1000).toFixed(0)} mm; fastest spin at end ${fastest.toFixed(2)} rad/s`);
