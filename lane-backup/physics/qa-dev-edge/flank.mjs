import { Quaternion, Vector3, Euler } from 'three';
const { getSpec } = await import('../src/vehicles/specs.ts');
const { createWreckEnvironment, createWreckTurrets } = await import('../src/sim/wreckTurrets.ts');
const m1 = getSpec(process.argv[2] ?? 'm1a2');
const turrets = createWreckTurrets({ seed: 5 });
turrets.bind(createWreckEnvironment(() => 0, [], []));
const tank = { id: 'h9', spec: m1, combat: { destroyed: true }, state: { pos: { x: 40, y: 0, z: 40 }, yaw: 0, visualPitch: 0, visualRoll: 0, turretYaw: 0, speed: 0, verticalSpeed: 0, yawRate: 0 } };
const q0 = new Quaternion().setFromEuler(new Euler(0.02, 0, Math.PI / 2 + 0.03));
turrets.restore(tank, { x: 0, y: 1.95, z: 0, qx: q0.x, qy: q0.y, qz: q0.z, qw: q0.w, asleep: false });
const pose = new Float64Array(7), up = new Vector3();
const w = turrets.world;
for (let n = 1; n <= 600; n++) {
  turrets.step([tank]);
  if (n % 20) continue;
  turrets.framePose(tank.id, pose);
  up.set(0, 1, 0).applyQuaternion(new Quaternion(pose[3], pose[4], pose[5], pose[6]));
  let slot = -1; for (let s = 0; s < w.capacity; s++) if (w.active[s]) slot = s;
  console.log((n / 60).toFixed(2), 'tilt', (Math.acos(up.y) * 57.2958).toFixed(3), 'w', Math.hypot(w.wx[slot], w.wy[slot], w.wz[slot]).toFixed(4), 'v', Math.hypot(w.vx[slot], w.vy[slot], w.vz[slot]).toFixed(4), w.asleep[slot] ? 'ASLEEP' : '');
}
