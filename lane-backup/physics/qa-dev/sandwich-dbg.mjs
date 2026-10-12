const { createRigidBox, createRigidWorld } = await import('../src/sim/rigidBody.ts');
const M = Number(process.argv[2] ?? 200), ratio = Number(process.argv[3] ?? 0);
const world = createRigidWorld({ capacity: 8, kinematicCapacity: 0, spherePool: 1024, velocityIterations: 8, positionIterations: 3, contactsPerBody: 28 });
world.bindEnvironment({ groundAt: () => 0 });
const box = (hx, hy, hz, m) => { const s = createRigidBox(hx, hy, hz, m / (8 * hx * hy * hz), { restitution: 0.15, friction: 0.7 });
  if (ratio) { const I = Array.from(s.invInertia, (x) => 1 / x), top = Math.max(...I); for (let k = 0; k < 3; k++) s.invInertia[k] = 1 / Math.max(I[k], top / ratio); } return s; };
const plate = box(1.4, 0.07, 0.07, 30), rafter = box(1.43, 0.03, 0.07, 17), slab = box(1.25, 0.04, 0.8, M);
const yaw = (a) => ({ qy: Math.sin(a / 2), qw: Math.cos(a / 2) });
const s = [world.spawn(plate, { x: 0, y: 0.071, z: -0.9 }), world.spawn(plate, { x: 0, y: 0.071, z: 0.9 }),
  world.spawn(rafter, { x: -0.6, y: 0.171, z: 0, ...yaw(Math.PI / 2 + 0.05) }), world.spawn(rafter, { x: 0.55, y: 0.171, z: 0.02, ...yaw(Math.PI / 2 - 0.08) }),
  world.spawn(slab, { x: 0.02, y: 0.54, z: 0, ...yaw(0.1) })];
const names = ['plateA', 'plateB', 'raftA', 'raftB', 'slab'];
const D = world._dbg;
for (let n = 1; n <= 300; n++) {
  world.step();
  if (n % 30 === 0 || (n > 240 && n < 247)) {
    const st = s.map((k, i) => `${names[i]} v${Math.hypot(world.vx[k], world.vy[k], world.vz[k]).toFixed(2)} w${Math.hypot(world.wx[k], world.wy[k], world.wz[k]).toFixed(2)}${world.asleep[k] ? 'z' : ''}`).join(' ');
    const cs = [];
    for (let c = 0; c < D.n; c++) {
      const a = s.indexOf(D.cA[c]), b = D.cB[c] >= 0 ? names[s.indexOf(D.cB[c])] : D.cB[c] === -1 ? 'gnd' : 'st';
      if (names[a] === 'raftA' || b === 'raftA') cs.push(`${names[a]}>${b} n(${D.cNx[c].toFixed(2)},${D.cNy[c].toFixed(2)},${D.cNz[c].toFixed(2)}) d${(D.cDepth[c] * 1000).toFixed(1)} j${D.cJn[c].toFixed(1)} t${Math.hypot(D.cJt1[c], D.cJt2[c]).toFixed(1)}`);
    }
    console.log(`${(n / 60).toFixed(2)} ${st}\n    raftA contacts ${cs.length}: ${cs.join(' | ')}`);
  }
}
