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

// ---------------------------------------------------------------------------
// ACQUISITION-THROUGH-SPOTTING GUARD (camo_spotting r7). The one sanctioned
// exception to "AI acquires targets through the spotting sim only" is the
// controls_gunnery r2 hardClaim: a player who fires 2+ times inside one
// muzzle-intel window. These scenarios pin that boundary so a future round
// cannot silently widen it back into the old wallhack:
//   D) 0 shots and 1 shot from a concealment-hidden player: NEVER target.
//   E) 2 shots (hardClaim, personal ray blocked): target claimed, but the
//      chase intel stays at the notifyPlayerFired MUZZLE stamp while the
//      player moves unspotted — the live position must not leak.
//   F) control: a sim-SPOTTED player is acquired through the normal scan.
// ---------------------------------------------------------------------------
function acquisitionScenario(name, { spotted, shots, blockRay, moveAfter }) {
  const bot = mkEntity('bot', 'tiger1', 0, 0, 0, flat);
  bot.team = 'enemy';
  const player = mkEntity('player', 'm4a3e8', 0, 250, 0, flat);
  player.team = 'player';
  player.isPlayer = true;
  const muzzle = { x: player.state.pos.x, z: player.state.pos.z };
  const ai = createAI(bot, {
    difficulty: 'normal',
    rng: mulberry32(7),
    deps: {
      heightField: flat,
      raycast: blockRay ? () => ({ dist: 1 }) : () => null,
      getEnemies: () => [player],
      getObstacles: () => [],
      spotting: { isSpotted: () => spotted },
    },
  });
  let t = 0;
  const step = (dur) => {
    for (let i = 0; i < dur / SIM_DT; i++) {
      t += SIM_DT;
      ai.update(SIM_DT, t);
      bot.input.throttle = 0; bot.input.steer = 0; // hold the bot in place
    }
  };
  step(1.0);                       // settle: no intel yet
  const preShot = ai.debugInfo().targetId;
  for (let s = 0; s < shots; s++) {
    ai.notifyPlayerFired(player, 0); // rank 0 = nearest earshot enemy
    step(0.5);
  }
  if (moveAfter) {
    player.state.pos.x += 80;      // reposition while still formally hidden
    player.state.pos.z += 40;
    step(1.0);
  }
  const d = ai.debugInfo();
  console.log(`${name}: preShotTarget=${preShot} target=${d.targetId} ` +
    `locked=${d.playerLocked} shotsInWindow=${d.playerShotsInWindow} ` +
    `lastSeen=(${d.lastSeenX.toFixed(1)},${d.lastSeenZ.toFixed(1)}) muzzle=(${muzzle.x},${muzzle.z})`);
  return { preShot, d, muzzle, player };
}

let guardsPass = true;
const req = (cond, label) => {
  if (!cond) { guardsPass = false; console.error(`FAIL  ${label}`); }
  else console.log(`  ok  ${label}`);
};

// D) hidden player, 0 then 1 shot — never acquired, never locked.
{
  const { preShot, d } = acquisitionScenario('guard-hidden-1shot',
    { spotted: false, shots: 1, blockRay: false, moveAfter: false });
  req(preShot === null, 'hidden + 0 shots: no target');
  req(d.targetId === null, 'hidden + 1 shot: still no target (no first-flash wallhack)');
  req(d.playerLocked === false, 'hidden + 1 shot: no return-fire lock');
}

// E) hidden player, 2 shots, personal ray blocked — hardClaim engages on the
// MUZZLE stamp only; live position never leaks while unspotted.
{
  const { d, muzzle, player } = acquisitionScenario('guard-hardclaim-muzzle',
    { spotted: false, shots: 2, blockRay: true, moveAfter: true });
  req(d.targetId === 'player', 'hardClaim (2 shots): player claimed as target');
  req(d.playerLocked === false, 'hardClaim with blocked ray: no lock');
  req(Math.hypot(d.lastSeenX - muzzle.x, d.lastSeenZ - muzzle.z) < 1e-6,
    'hardClaim chase intel == notifyPlayerFired muzzle stamp');
  req(Math.hypot(d.lastSeenX - player.state.pos.x, d.lastSeenZ - player.state.pos.z) > 50,
    'hardClaim chase intel != live position while hidden');
}

// F) control — a sim-spotted player is acquired with zero shots fired.
{
  const { d } = acquisitionScenario('guard-spotted-scan',
    { spotted: true, shots: 0, blockRay: false, moveAfter: false });
  req(d.targetId === 'player', 'spotted player acquired through the normal scan');
}

const pass = a > 0 && b > 0 && c > 0 && guardsPass;
console.log(pass ? 'PASS: all scenarios (fire + acquisition guards)' : 'FAIL');
process.exit(pass ? 0 : 1);
