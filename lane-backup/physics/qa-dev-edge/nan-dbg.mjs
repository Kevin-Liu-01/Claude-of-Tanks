await import('../src/vehicles/tankFactory.ts');
const { TANK_SPECS } = await import('../src/vehicles/specs.ts');
const { wreckTurretProfile } = await import('../src/sim/wreckTurrets.ts');
const { createRigidWorld } = await import('../src/sim/rigidBody.ts');
const prof = wreckTurretProfile(TANK_SPECS.m1a2, 1);
const world = createRigidWorld({ capacity: 1, kinematicCapacity: 0 });
world.bindEnvironment({ groundAt: () => 0 });
const ang = Math.PI / 2;
const slot = world.spawn(prof.shape, { x: 0, y: 3.385, z: 0, qx: Math.sin(-ang / 2), qy: 0, qz: 0, qw: Math.cos(-ang / 2) });
const f = (v) => v.toFixed(4);
console.log('spawned', f(world.px[slot]), f(world.py[slot]), f(world.pz[slot]), 'q', f(world.qx[slot]), f(world.qw[slot]), 'active', world.active[slot]);
for (let k = 1; k <= 30; k++) {
  world.step();
  const bad = [world.px[slot], world.py[slot], world.qx[slot], world.vx[slot], world.vy[slot], world.wx[slot]].some((v) => !Number.isFinite(v));
  if (k <= 3 || bad) console.log(k, 'p', f(world.px[slot]), f(world.py[slot]), f(world.pz[slot]), 'v', f(world.vx[slot]), f(world.vy[slot]), f(world.vz[slot]), 'w', f(world.wx[slot]), f(world.wy[slot]), f(world.wz[slot]), 'q', f(world.qx[slot]), f(world.qw[slot]));
  if (bad) break;
}
