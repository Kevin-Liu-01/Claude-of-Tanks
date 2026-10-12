// a statically stable stack: a slab on two parallel beams on the ground (a table). Beam section (w x h) and slab mass vary.
const { createRigidBox, createRigidWorld } = await import('../src/sim/rigidBody.ts');
const arg = (k, d) => Number(process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d);
const vi = arg('vi', 8), pi = arg('pi', 3), M = arg('M', 600), bw = arg('bw', 0.14), bh = arg('bh', 0.06), bm = arg('bm', 17);
const world = createRigidWorld({ capacity: 4, kinematicCapacity: 0, spherePool: 512, velocityIterations: vi, positionIterations: pi, contactsPerBody: 28 });
world.bindEnvironment({ groundAt: () => 0 });
const ir = arg('ir', 0), rest = arg('rest', 0.15), mu = arg('mu', 0.7);
const box = (hx, hy, hz, m) => { const s0 = createRigidBox(hx, hy, hz, m / (8 * hx * hy * hz), { restitution: rest, friction: mu });
  if (ir) { const I = Array.from(s0.invInertia, (x) => 1 / x), top = Math.max(...I); for (let k = 0; k < 3; k++) s0.invInertia[k] = 1 / Math.max(I[k], top / ir); } return s0; };
const beam = box(1.43, bh / 2, bw / 2, bm);
const a = world.spawn(beam, { x: 0, y: bh / 2 + 0.0005, z: -0.3 });
const b = world.spawn(beam, { x: 0, y: bh / 2 + 0.0005, z: 0.3 });
const s = world.spawn(box(0.5, 0.04, 0.5, M), { x: 0.05, y: bh + 0.04 + 0.002, z: 0.01 });
let maxW = 0, maxV = 0, sleptAt = -1;
for (let n = 1; n <= 600; n++) {
  world.step();
  if (n > 30) for (const k of [a, b, s]) { maxW = Math.max(maxW, Math.hypot(world.wx[k], world.wy[k], world.wz[k])); maxV = Math.max(maxV, Math.hypot(world.vx[k], world.vy[k], world.vz[k])); }
  if (sleptAt < 0 && world.asleep[a] && world.asleep[b] && world.asleep[s]) sleptAt = n;
}
console.log(`beam ${bw}x${bh} ${bm} kg, slab ${M} kg, vi ${vi} ir ${ir} rest ${rest} mu ${mu}: max spin ${maxW.toFixed(2)} rad/s, max speed ${maxV.toFixed(2)} m/s after 0.5 s, asleep ${sleptAt > 0 ? (sleptAt / 60).toFixed(2) + ' s' : 'never'}, slab y ${world.py[s].toFixed(3)} (${(bh + 0.04).toFixed(3)})`);
