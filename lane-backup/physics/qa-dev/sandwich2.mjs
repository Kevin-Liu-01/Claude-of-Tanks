// heavy slab on one thin rafter lying on the ground (no plates): solver stability vs iterations and friction
const { createRigidBox, createRigidWorld } = await import('../src/sim/rigidBody.ts');
const arg = (k, d) => Number(process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d);
const vi = arg('vi', 8), pi = arg('pi', 3), mu = arg('mu', 0.7), M = arg('M', 600), edge = arg('edge', 0);
const world = createRigidWorld({ capacity: 4, kinematicCapacity: 0, spherePool: 512, velocityIterations: vi, positionIterations: pi, contactsPerBody: 28 });
world.bindEnvironment({ groundAt: () => 0 });
const box = (hx, hy, hz, m) => createRigidBox(hx, hy, hz, m / (8 * hx * hy * hz), { restitution: 0.15, friction: mu });
// the rafter: lying flat (6 cm tall, 14 cm wide) or on edge (14 cm tall, 6 cm wide)
const rafter = edge ? box(1.43, 0.07, 0.03, 17) : box(1.43, 0.03, 0.07, 17);
const h = edge ? 0.07 : 0.03;
const r = world.spawn(rafter, { x: 0, y: h + 0.0005, z: 0 });
const s = world.spawn(box(0.4, 0.04, 0.4, M), { x: 0.1, y: 2 * h + 0.04 + 0.002, z: 0.02 });
let maxW = 0, sleptAt = -1;
for (let n = 1; n <= 600; n++) {
  world.step();
  if (n > 60) maxW = Math.max(maxW, Math.hypot(world.wx[r], world.wy[r], world.wz[r]), Math.hypot(world.wx[s], world.wy[s], world.wz[s]));
  if (sleptAt < 0 && world.asleep[r] && world.asleep[s]) sleptAt = n;
}
console.log(`vi ${vi} pi ${pi} mu ${mu} M ${M} ${edge ? 'on edge' : 'flat'}: max spin ${maxW.toFixed(2)}, asleep ${sleptAt > 0 ? (sleptAt / 60).toFixed(2) + ' s' : 'never'}, slab y ${world.py[s].toFixed(3)} (${(2 * h + 0.04).toFixed(3)}), rafter y ${world.py[r].toFixed(3)}`);
