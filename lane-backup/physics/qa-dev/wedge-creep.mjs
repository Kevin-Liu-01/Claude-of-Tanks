// physics lane scratch: dcore's wedge creep — a floor slab resting tilted on a corner pier with a wall panel wedged
// under its edge rises ~5 cm/s for many seconds and never sleeps. Random variants of that pile; report the bodies still
// moving (or climbing) after 12 s, and which contact kinds hold them.
import { createRigidBox, createRigidWorld } from '../src/sim/rigidBody.ts';

const variants = Number(process.argv.find((a) => a.startsWith('--n='))?.slice(4) ?? 60);
let seed = Number(process.argv.find((a) => a.startsWith('--seed='))?.slice(7) ?? 1);
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const slabShape = createRigidBox(2.8, 0.14, 2.4, 2200, { restitution: 0.12, friction: 0.7 });
const panelShape = createRigidBox(2.2, 1.5, 0.18, 1900, { restitution: 0.12, friction: 0.7 });
const pose = new Float64Array(7);
let creepers = 0, unslept = 0, worstClimb = 0, worstSpeed = 0;
const examples = [];
for (let v = 0; v < variants; v++) {
  const pierH = 1.2 + rnd() * 1.6;
  const pier = { min: [-0.4, 0, -0.4], max: [0.4, pierH, 0.4], shape2: { kind: 'obb', cx: 0, cz: 0, hw: 0.4, hl: 0.4, yaw: 0 } };
  const env = { groundAt: () => 0, queryStatic: (minX, minZ, maxX, maxZ, out) => {
    out.length = 0;
    if (!(pier.max[0] < minX || pier.min[0] > maxX || pier.max[2] < minZ || pier.min[2] > maxZ)) out.push(pier);
    return out;
  } };
  const world = createRigidWorld({ capacity: 4 });
  world.bindEnvironment(env);
  // the panel leaning or lying near where the slab's far edge will come down
  const lean = rnd() * 1.4;
  const yaw = (rnd() - 0.5) * 1.2;
  const px = 3.2 + rnd() * 1.6, pz = (rnd() - 0.5) * 2;
  const qyaw = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
  const qlean = [Math.sin(lean / 2), 0, 0, Math.cos(lean / 2)];
  // q = yaw * lean
  const q = [qyaw[3] * qlean[0] + qyaw[0] * qlean[3] + qyaw[1] * qlean[2] - qyaw[2] * qlean[1],
    qyaw[3] * qlean[1] - qyaw[0] * qlean[2] + qyaw[1] * qlean[3] + qyaw[2] * qlean[0],
    qyaw[3] * qlean[2] + qyaw[0] * qlean[1] - qyaw[1] * qlean[0] + qyaw[2] * qlean[3],
    qyaw[3] * qlean[3] - qyaw[0] * qlean[0] - qyaw[1] * qlean[1] - qyaw[2] * qlean[2]];
  const panel = world.spawn(panelShape, { x: px, y: 1.6 + rnd(), z: pz, qx: q[0], qy: q[1], qz: q[2], qw: q[3] });
  // the slab dropped tilted over the pier's corner and the panel
  const tilt = 0.2 + rnd() * 0.35;
  const slab = world.spawn(slabShape, { x: 1.8 + rnd() * 0.6, y: pierH + 1.4 + rnd(), z: (rnd() - 0.5) * 0.8,
    qx: 0, qy: 0, qz: -Math.sin(tilt / 2), qw: Math.cos(tilt / 2), vx: (rnd() - 0.5), wy: (rnd() - 0.5) });
  let y12 = 0;
  const trace = process.argv.includes(`--trace=${v}`);
  for (let n = 0; n < 60 * 20; n++) {
    world.step();
    if (n === 60 * 12) { world.framePose(slab, pose); y12 = pose[1]; }
    if (trace && n % 30 === 0) {
      const f = (i) => `p(${world.px[i].toFixed(3)},${world.py[i].toFixed(3)},${world.pz[i].toFixed(3)}) v(${world.vx[i].toFixed(3)},${world.vy[i].toFixed(3)},${world.vz[i].toFixed(3)}) w(${world.wx[i].toFixed(2)},${world.wy[i].toFixed(2)},${world.wz[i].toFixed(2)}) z${world.asleep[i]}`;
      console.log((n / 60).toFixed(1), 'slab', f(slab), '| panel', f(panel));
    }
  }
  world.framePose(slab, pose);
  const climb = pose[1] - y12;
  const speed = Math.max(Math.hypot(world.vx[slab], world.vy[slab], world.vz[slab]), Math.hypot(world.vx[panel], world.vy[panel], world.vz[panel]));
  const asleep = world.asleep[slab] && world.asleep[panel];
  if (!asleep) { unslept++; if (process.argv.includes('--list')) console.log('unslept', v, 'slab', world.asleep[slab], 'panel', world.asleep[panel], 'vs', Math.hypot(world.vx[slab], world.vy[slab], world.vz[slab]).toFixed(3), 'ws', Math.hypot(world.wx[slab], world.wy[slab], world.wz[slab]).toFixed(3), 'vp', Math.hypot(world.vx[panel], world.vy[panel], world.vz[panel]).toFixed(3), 'wp', Math.hypot(world.wx[panel], world.wy[panel], world.wz[panel]).toFixed(3), 'ys', world.py[slab].toFixed(2), 'yp', world.py[panel].toFixed(2)); }
  if (climb > 0.05) { creepers++; if (examples.length < 4) examples.push({ v, pierH: +pierH.toFixed(2), lean: +lean.toFixed(2), tilt: +tilt.toFixed(2), climb: +climb.toFixed(3), speed: +speed.toFixed(3) }); }
  worstClimb = Math.max(worstClimb, climb);
  worstSpeed = Math.max(worstSpeed, asleep ? 0 : speed);
}
console.log(JSON.stringify({ variants, creepers, unslept, worstClimbOver8s: +worstClimb.toFixed(3), worstSpeedAt20s: +worstSpeed.toFixed(3), examples }));
