import { createRigidBox, createRigidWorld } from '../src/sim/rigidBody.ts';
let seed = 1;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const slabShape = createRigidBox(2.8, 0.14, 2.4, 2200, { restitution: 0.12, friction: 0.7 });
const panelShape = createRigidBox(2.2, 1.5, 0.18, 1900, { restitution: 0.12, friction: 0.7 });
const target = Number(process.argv[2] ?? 8);
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
  const line = [];
  for (let n = 0; n < 60 * 20; n++) {
    world.step();
    if (n >= 60 * 19 && n < 60 * 19 + 24) line.push(`${Math.hypot(world.vx[slab], world.vy[slab], world.vz[slab]).toFixed(3)}/${Math.hypot(world.wx[slab], world.wy[slab], world.wz[slab]).toFixed(3)}`);
  }
  console.log('slab v/w per step at 19 s:', line.join(' '));
  console.log('slab pos', world.px[slab].toFixed(3), world.py[slab].toFixed(3), world.pz[slab].toFixed(3));
}
