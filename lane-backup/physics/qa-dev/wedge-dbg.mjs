import { createRigidBox, createRigidWorld } from './rigidBodyDbg.ts';
let seed = 1;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const slabShape = createRigidBox(2.8, 0.14, 2.4, 2200, { restitution: 0.12, friction: 0.7 });
const panelShape = createRigidBox(2.2, 1.5, 0.18, 1900, { restitution: 0.12, friction: 0.7 });
const target = Number(process.argv[2] ?? 28);
for (let v = 0; v <= target; v++) {
  const pierH = 1.2 + rnd() * 1.6;
  const pier = { min: [-0.4, 0, -0.4], max: [0.4, pierH, 0.4], shape2: { kind: 'obb', cx: 0, cz: 0, hw: 0.4, hl: 0.4, yaw: 0 } };
  const env = { groundAt: () => 0, queryStatic: (minX, minZ, maxX, maxZ, out) => { out.length = 0; if (!(pier.max[0] < minX || pier.min[0] > maxX || pier.max[2] < minZ || pier.min[2] > maxZ)) out.push(pier); return out; } };
  const world = createRigidWorld({ capacity: 4 });
  world.bindEnvironment(env);
  const lean = rnd() * 1.4, yaw = (rnd() - 0.5) * 1.2;
  const px = 3.2 + rnd() * 1.6, pz = (rnd() - 0.5) * 2;
  const qyaw = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)], qlean = [Math.sin(lean / 2), 0, 0, Math.cos(lean / 2)];
  const q = [qyaw[3] * qlean[0] + qyaw[0] * qlean[3] + qyaw[1] * qlean[2] - qyaw[2] * qlean[1], qyaw[3] * qlean[1] - qyaw[0] * qlean[2] + qyaw[1] * qlean[3] + qyaw[2] * qlean[0], qyaw[3] * qlean[2] + qyaw[0] * qlean[1] - qyaw[1] * qlean[0] + qyaw[2] * qlean[3], qyaw[3] * qlean[3] - qyaw[0] * qlean[0] - qyaw[1] * qlean[1] - qyaw[2] * qlean[2]];
  const panel = world.spawn(panelShape, { x: px, y: 1.6 + rnd(), z: pz, qx: q[0], qy: q[1], qz: q[2], qw: q[3] });
  const tilt = 0.2 + rnd() * 0.35;
  const slab = world.spawn(slabShape, { x: 1.8 + rnd() * 0.6, y: pierH + 1.4 + rnd(), z: (rnd() - 0.5) * 0.8, qx: 0, qy: 0, qz: -Math.sin(tilt / 2), qw: Math.cos(tilt / 2), vx: (rnd() - 0.5), wy: (rnd() - 0.5) });
  if (v !== target) continue;
  for (let n = 0; n < 60 * 14; n++) {
    globalThis.__DBG_SAT = n >= 60 * 13 && n < 60 * 13 + 5 ? [] : null;
    world.step();
    if (globalThis.__DBG_SAT) for (const line of globalThis.__DBG_SAT) if (line.startsWith('a1')) console.log('      SAT', line);
    if (n >= 60 * 13 && n < 60 * 13 + 5) {
      const cs = world.debugContacts();
      const kind = (b) => (b >= 0 ? `body${b}` : b === -1 ? 'ground' : b === -2 ? 'static' : 'kin');
      console.log(`step ${n} asleep slab=${world.asleep[slab]} panel=${world.asleep[panel]} slab v(${world.vx[slab].toFixed(3)},${world.vy[slab].toFixed(3)},${world.vz[slab].toFixed(3)}) w(${world.wx[slab].toFixed(3)},${world.wy[slab].toFixed(3)},${world.wz[slab].toFixed(3)}) panel v(${world.vx[panel].toFixed(3)},${world.vy[panel].toFixed(3)},${world.vz[panel].toFixed(3)})`);
      for (const c of cs) console.log(`   a${c.a}->${kind(c.b)} s${c.s} p(${c.p.map((x) => x.toFixed(2)).join(',')}) n(${c.n.map((x) => x.toFixed(2)).join(',')}) d=${c.d.toFixed(4)} jn=${c.jn.toFixed(1)} jt=${c.jt.toFixed(1)} jp=${c.jp.toFixed(1)}`);
    }
  }
}
