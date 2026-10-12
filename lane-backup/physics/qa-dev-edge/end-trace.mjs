// trace one end stand: the gun axis angle from vertical and the body's motion over time
await import('../src/vehicles/tankFactory.ts');
const { TANK_SPECS } = await import('../src/vehicles/specs.ts');
const { wreckTurretProfile } = await import('../src/sim/wreckTurrets.ts');
const { createRigidWorld } = await import('../src/sim/rigidBody.ts');
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const id = arg('id', 'm1a2'), tiltDeg = Number(arg('tilt', '4')), every = Number(arg('every', '15')), secs = Number(arg('secs', '8'));
const prof = wreckTurretProfile(TANK_SPECS[id], 1);
const tc = prof.turretCenter, th = prof.turretHalf, rearZ = tc[2] - th[2];
const world = createRigidWorld({ capacity: 1, kinematicCapacity: 0, spherePool: 128 });
world.bindEnvironment({ groundAt: () => 0 });
const ang = Math.PI / 2 + tiltDeg * Math.PI / 180, c = Math.cos(ang), s = Math.sin(ang);
let low = Infinity;
for (const y of [tc[1] - th[1], tc[1] + th[1]]) for (const z of [rearZ, tc[2] + th[2]]) low = Math.min(low, y * c + z * s);
const slot = world.spawn(prof.shape, { x: 0, y: -low + 0.045, z: 0, qx: Math.sin(-ang / 2), qy: 0, qz: 0, qw: Math.cos(-ang / 2) });
for (let k = 0; k <= secs * 60; k++) {
  if (k) world.step();
  if (k % every) continue;
  const x = world.qx[slot], y = world.qy[slot], z = world.qz[slot], w = world.qw[slot];
  // gun axis (+Z) in world; signed tilt about X: angle of the axis in the y-z plane from vertical
  const fy = 2 * (y * z - w * x), fz = 1 - 2 * (x * x + y * y);
  const tilt = Math.atan2(fz, fy) * 180 / Math.PI;
  const v = Math.hypot(world.vx[slot], world.vy[slot], world.vz[slot]), wm = Math.hypot(world.wx[slot], world.wy[slot], world.wz[slot]);
  console.log(`${(k / 60).toFixed(2)} tilt ${tilt.toFixed(2)} com y ${world.py[slot].toFixed(3)} v ${v.toFixed(3)} w ${wm.toFixed(3)} wx ${world.wx[slot].toFixed(3)}${world.asleep[slot] ? ' ASLEEP' : ''}`);
}
