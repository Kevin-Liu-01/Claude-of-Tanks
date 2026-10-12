import { getSpec } from './wt/src/vehicles/specs.ts';
import { createWreckEnvironment, createWreckTurrets, wreckTurretProfile } from './wt/src/sim/wreckTurrets.ts';
const spec = getSpec(process.argv[2] || 'm1a2');
const env = createWreckEnvironment((x, z) => 0.08 * Math.sin(x * 0.3) + 0.05 * z, [], []);
const pose = new Float64Array(7);
for (const cause of ['ammorack', 'shot']) for (let tick = 100; tick < 106; tick++) {
  const t = createWreckTurrets({ seed: 42 });
  t.bind(env);
  const tank = { id: 'x', spec, combat: { destroyed: true }, state: { pos: { x: 0, y: env.groundAt(0,0), z: 0 }, yaw: 0.5, visualPitch: 0, visualRoll: 0, turretYaw: 0, speed: 0, verticalSpeed: 0, yawRate: 0 } };
  t.launch(tank, cause, tick);
  t.framePose('x', pose); const seat = Float64Array.from(pose);
  let peak = 0, land = -1, steps = -1, impacts = 0, firstImpact = -1, firstSpeed = 0;
  for (let n = 0; n < 1500; n++) {
    t.step([tank]);
    t.framePose('x', pose);
    peak = Math.max(peak, pose[1] - seat[1]);
    for (let k = 0; k < t.world.impactCount; k++) { impacts++; if (firstImpact < 0) { firstImpact = n; firstSpeed = t.world.impactSpeed[k]; } }
    if (t.settled('x')) { steps = n; break; }
  }
  const d = Math.hypot(pose[0] - seat[0], pose[2] - seat[2]);
  const yawFrom = (q) => Math.atan2(2 * (q[6] * q[4] + q[3] * q[5]), 1 - 2 * (q[4] * q[4] + q[3] * q[3]));
  const up = 1 - 2 * (pose[3] * pose[3] + pose[5] * pose[5]);
  console.log(cause.padEnd(9), 'tick', tick, `peak ${peak.toFixed(2)} m, first impact ${(firstImpact/60).toFixed(2)} s @ ${firstSpeed.toFixed(1)} m/s, impacts ${impacts}, rest ${(steps/60).toFixed(2)} s, ${d.toFixed(2)} m from the ring, dy ${(pose[1]-seat[1]).toFixed(2)}, upY ${up.toFixed(2)}, yaw ${(yawFrom(pose) * 57.3).toFixed(0)}°`);
}
