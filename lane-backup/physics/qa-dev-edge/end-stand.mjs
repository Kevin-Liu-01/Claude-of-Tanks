// physics lane scratch (edge stand): a turret body set standing on its rear face (gun up) on flat ground, tilted
// toward its roof by a few degrees: does it stand, and how long does it take to fall? Also a pure box of the same
// size and mass (no barrel) for comparison.
await import('../src/vehicles/tankFactory.ts');
const { TANK_SPECS } = await import('../src/vehicles/specs.ts');
const { wreckTurretProfile } = await import('../src/sim/wreckTurrets.ts');
const { createRigidWorld } = await import('../src/sim/rigidBody.ts');
const id = process.argv.find((a) => a.startsWith('--id='))?.slice(5) ?? 'm1a2';
const prof = wreckTurretProfile(TANK_SPECS[id], 1);
const shape = prof.shape;
// the frame's rear face: z = turretCenter.z − half.z (frame coordinates), y in the box; the COM in the frame = shape.com
const tc = prof.turretCenter, th = prof.turretHalf;
const rearZ = tc[2] - th[2];
console.log(id, 'COM (frame)', Array.from(shape.com, (v) => v.toFixed(2)).join(','), 'rear face z', rearZ.toFixed(2), 'box y', (tc[1] - th[1]).toFixed(2), '..', (tc[1] + th[1]).toFixed(2));
for (const tiltDeg of [0, 2, 4, 6, 8, 10, 14]) {
  const world = createRigidWorld({ capacity: 1, kinematicCapacity: 0, spherePool: 128 });
  world.bindEnvironment({ groundAt: () => 0 });
  // rotate the frame so its −Z (rear) points down: rotation about X by +90° (z → −y... ) then tilt about X more
  const ang = Math.PI / 2 + tiltDeg * Math.PI / 180; // +X rotation: frame +Z → world −Y? (y' = y cos − z sin, z' = y sin + z cos)
  const qx = Math.sin(-ang / 2), qw = Math.cos(-ang / 2);
  // place: the rear face at ground level. Frame point (0, y, rearZ) maps to world y = y cos(a) + rearZ·sin(a) for rotation −a about X
  // (y' = y cos a + z sin a): lowest corner over the box's y range
  const c = Math.cos(ang), s = Math.sin(ang);
  let low = Infinity;
  for (const y of [tc[1] - th[1], tc[1] + th[1]]) for (const z of [rearZ, tc[2] + th[2]]) low = Math.min(low, y * c + z * s);
  const slot = world.spawn(shape, { x: 0, y: -low + 0.045, z: 0, qx, qy: 0, qz: 0, qw });
  let fell = -1, slept = -1;
  for (let k = 1; k <= 600; k++) {
    world.step();
    // the frame's forward axis (+Z) in world: z axis of the rotation
    const x = world.qx[slot], y = world.qy[slot], z = world.qz[slot], w = world.qw[slot];
    const fy = 2 * (y * z - w * x); // world y of the frame +Z axis (R[1][2])
    const upAngle = Math.acos(Math.max(-1, Math.min(1, fy))) * 180 / Math.PI;
    if (fell < 0 && upAngle > 60) fell = k;
    if (slept < 0 && world.asleep[slot]) slept = k;
  }
  const x = world.qx[slot], y = world.qy[slot], z = world.qz[slot], w = world.qw[slot];
  const fy = 2 * (y * z - w * x);
  console.log(`  tilt ${tiltDeg}°: gun axis from vertical at 10 s ${(Math.acos(Math.max(-1, Math.min(1, fy))) * 180 / Math.PI).toFixed(1)}°, fell (gun > 60° off vertical) at ${fell > 0 ? (fell / 60).toFixed(2) + ' s' : 'never'}, asleep ${slept > 0 ? (slept / 60).toFixed(2) + ' s' : '-'}`);
}
