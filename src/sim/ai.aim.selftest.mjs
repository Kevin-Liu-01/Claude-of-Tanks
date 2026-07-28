// AI uphill engagement test: a Tiger I on a nose-up slope must fire at an
// elevated, spotted, LOS-clear target even when its gun pitch is pinned at
// the depression stop (r6 repro). Flat-ground control included.
import { Vector3 } from 'three';
import { getSpec } from '../vehicles/specs.js';
import { createTankState, updateTank, SIM_DT } from './movement.js';
import { createAI, mulberry32 } from '../game/ai.js';

function mkEntity(id, specId, x, z, yaw, hf) {
  const spec = getSpec(specId);
  const pos = new Vector3(x, hf.getHeightAt(x, z), z);
  const state = createTankState(spec, pos, yaw);
  return {
    id, specId, spec, state,
    combat: { destroyed: false, reload: { t: 0, totalS: spec.gun.reloadS }, shellSlot: 0 },
    input: { throttle: 0, steer: 0, brake: false, fire: false, aimPoint: new Vector3(), shellSlot: 0 },
  };
}

function runScenario(name, hf, obsPos, tgtPos, maxS = 30) {
  const shooter = mkEntity('shooter', 'tiger1', obsPos[0], obsPos[1], Math.atan2(tgtPos[0] - obsPos[0], tgtPos[1] - obsPos[1]), hf);
  const target = mkEntity('target', 'm4a3e8', tgtPos[0], tgtPos[1], 0, hf);
  const ai = createAI(shooter, {
    difficulty: 'normal',
    rng: mulberry32(42),
    deps: {
      heightField: hf,
      raycast: () => null, // clear LOS everywhere
      getEnemies: () => [target],
      getObstacles: () => [],
      spotting: { isSpotted: () => true },
    },
  });
  // freeze the shooter in place: null throttle after AI writes it, so the
  // pitch/alignment logic is isolated from driving (matches the r6 repro:
  // stationary observer in engage-hold).
  let firedAt = -1;
  let t = 0;
  let dbg = null;
  for (let i = 0; i < maxS / SIM_DT; i++) {
    t += SIM_DT;
    ai.update(SIM_DT, t);
    shooter.input.throttle = 0; shooter.input.steer = 0; shooter.input.brake = false;
    updateTank(shooter, hf, SIM_DT);
    updateTank(target, hf, SIM_DT);
    if (shooter.input.fire && firedAt < 0) {
      firedAt = t;
      const st = shooter.state;
      dbg = {
        gunPitch: +st.gunPitch.toFixed(4), visualPitch: +st.visualPitch.toFixed(4),
        atGunLimit: st.atGunLimit, mode: ai.state,
      };
      break;
    }
  }
  const st = shooter.state;
  console.log(`${name}: fired=${firedAt >= 0 ? firedAt.toFixed(1) + 's' : 'NEVER'} ` +
    `gunPitch=${st.gunPitch.toFixed(4)} visualPitch=${st.visualPitch.toFixed(4)} ` +
    `atGunLimit=${st.atGunLimit} mode=${ai.state}` + (dbg ? ` dbg=${JSON.stringify(dbg)}` : ''));
  return firedAt;
}

// Scenario A: steep climb — shooter on a 20% (11.3deg) slope facing uphill,
// target 150 m away and ~14 m higher up the same slope. Hull nose-up pitch
// exceeds gun depression + wanted elevation -> gun pins at the stop with the
// settled barrel ~on target (the r6 freeze).
const gt = () => "firm";
// shooter sits nose-up on a 16.7% ramp (hull pitch ~0.165 rad); the target
// plateau needs ~+0.05 rad world elevation -> desiredGun ~= -0.115, just past
// the Tiger's -6.5deg (-0.1134) stop: gun pins with the settled barrel ON
// target (atGunLimit=true, pitchErr ~0) — the exact r6 freeze.
const slope = {
  getHeightAt: (x, z) => (z <= 0 ? 0 : z < 60 ? z * 0.167 : z < 100 ? 10 : 12.6),
  getGroundType: gt,
};
const a = runScenario('uphill-pinned', slope, [0, 30], [0, 180]);

// Scenario B: valley shot — shooter on FLAT ground, target on a plateau 8 m
// up at 150 m (the literal r6 verdant repro geometry).
const step = { getHeightAt: (x, z) => (z > 100 ? 8 : 0), getGroundType: gt };
const b = runScenario('uphill-flat-base', step, [0, 0], [0, 150]);

// Scenario C: flat-ground control — engagement behavior must be unchanged.
const flat = { getHeightAt: () => 0, getGroundType: gt };
const c = runScenario('flat-control', flat, [0, 0], [0, 150]);

const pass = a > 0 && b > 0 && c > 0;
console.log(pass ? 'PASS: all three scenarios fired' : 'FAIL');
process.exit(pass ? 0 : 1);
