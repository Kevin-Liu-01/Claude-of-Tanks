// The last run (bots lane, 2026-10-07; see EMPTY_RETIRE_M in ai.ts). Tidegate Polders pacing tail seed 41000, on the
// scenery lane's stone-free tree: by 330 s the K2 and the Type 10 were dead, and the last bravo bot, an AFT-10 at 163 of
// its 2050 hp, had spent its eight HJ-10s (one of them a hit on the idle host). The ram law refused every run (one
// full-speed run costs it 671 hp), the retirement drove it to 248 m from the host, and it faced the host there, in
// sight, throttle and trigger at zero, from 330 s to the 900 s cap. The fixture is that standoff on flat ground: the
// AFT-10 248 m from the idle M1A2 (1834 hp), its rack empty, its only teammate a wreck (the authority hands a bot its
// destroyed teammates too). Real movement drives the bot; the host never moves or fires.
import { Vector3 } from 'three';
// Register the same complete production specs without executing roster tests.
import '../vehicles/fleetFactory.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createTankState, updateTank, SIM_DT } from '../sim/movement.ts';
import { createAI, mulberry32 } from './ai.ts';

let failures = 0;
function ok(cond, label) {
  if (cond) console.log(`  ok  ${label}`);
  else { failures++; console.error(`FAIL  ${label}`); }
}

const flat = {
  getHeightAt: () => 0,
  getNormalAt: () => ({ x: 0, y: 1, z: 0 }),
  getGroundType: () => 'firm',
};

function entity(id, specId, team, x, z, yaw = 0, hp = null) {
  const spec = getSpec(specId);
  const state = createTankState(spec, new Vector3(x, 0, z), yaw);
  return {
    id, specId, spec, team, state,
    combat: {
      hp: hp ?? spec.hp, maxHp: spec.hp, destroyed: false,
      reload: { t: 0, totalS: spec.gun.reloadS, kind: 'ready' }, shellSlot: 0,
      modules: {}, crew: {}, fire: { burning: false, tickTimer: 0, ticksLeft: 0 }, magazine: null,
    },
    input: { throttle: 0, steer: 0, brake: false, fire: false, aimPoint: new Vector3(), shellSlot: 0, actionBits: 0 },
    aiCtl: null,
  };
}

/**
 * The standoff: the empty AFT-10 248 m from the idle host, facing it. `teammate`: 'wreck' (the Type 10 the K2 killed),
 * 'armed' (a living Type 10 with rounds, beyond support range) or 'empty' (a living Type 10 with an empty rack).
 * `host`: 'idle', 'moving' (2 m/s on the spot, as a hull under way reads) or 'firing' (a round every 8 s).
 */
function standoff({ teammate = 'wreck', host: hostMode = 'idle', seconds = 90 } = {}) {
  const host = entity('host', 'm1a2', 'player', 0, 0, 0, 1834);
  host.isPlayer = true;
  const bot = entity('bot-bravo-0', 'aft10_x', 'enemy', 0, 248, Math.PI, 163);
  bot.combat.ammo = [0];
  bot.combat.ammoCapacity = [8];
  const mate = teammate === 'armed'
    ? entity('bot-bravo-1', 'type10', 'enemy', 300, 640, Math.PI) // 512 m off: no support to retire to
    : entity('bot-bravo-1', 'type10', 'enemy', -50, 380, Math.PI);
  if (teammate === 'wreck') { mate.combat.destroyed = true; mate.combat.hp = 0; }
  if (teammate === 'empty') { mate.combat.ammo = [0, 0, 0]; mate.combat.ammoCapacity = [14, 8, 6]; }
  if (teammate === 'armed') { mate.combat.ammo = [9, 4, 2]; mate.combat.ammoCapacity = [14, 8, 6]; }
  const ctl = createAI(bot, {
    difficulty: 'normal',
    rng: mulberry32(41000),
    deps: {
      heightField: flat,
      raycast: () => null,
      getEnemies: () => [host],
      getAllies: () => [mate],
      getObstacles: () => [],
      spotting: { isSpotted: () => true },
    },
  });
  bot.aiCtl = ctl;
  let runAt = null, closest = Infinity, idleS = 0, fired = false, nextShotS = 330 + 8;
  for (let i = 0; i < seconds / SIM_DT; i++) {
    const t = 330 + i * SIM_DT;
    if (hostMode === 'moving') host.state.speed = 2;
    if (hostMode === 'firing') {
      host.combat.reload.t = Math.max(0, host.combat.reload.t - SIM_DT);
      if (t >= nextShotS) { host.combat.reload.t = host.spec.gun.reloadS; nextShotS = t + 8; }
    }
    ctl.update(SIM_DT, t);
    if (bot.input.fire) fired = true;
    const info = ctl.debugInfo();
    if (runAt === null && info.ramming) runAt = t - 330;
    if (Math.abs(bot.input.throttle) < 0.05 && Math.abs(bot.state.speed) < 0.3) idleS += SIM_DT;
    updateTank(bot, flat, SIM_DT);
    closest = Math.min(closest, Math.hypot(bot.state.pos.x - host.state.pos.x, bot.state.pos.z - host.state.pos.z));
    if (closest < 10) break; // the run reaches the hull (the fixture has no tank contact to stop it)
  }
  return { runAt, closest, idleS, fired, info: ctl.debugInfo() };
}

console.log('[1] the last bravo bot, its rack spent and its teammate a wreck, runs at the idle host');
{
  const run = standoff();
  ok(run.info.emptyRack === true && run.fired === false, 'fixture: the rack is empty, the trigger stays at zero');
  ok(run.runAt !== null && run.runAt < 30, `the run starts once the host has been passive (at ${run.runAt?.toFixed(1) ?? 'never'} s)`);
  ok(run.info.lastRuns >= 1, `as the last run (${run.info.lastRuns}): the ram law alone refuses it`);
  ok(run.closest < 10, `it reaches the hull (closest ${run.closest.toFixed(1)} m), where the standoff held 248 m`);
  ok(run.idleS < 30, `no long idle (${run.idleS.toFixed(1)} s at rest)`);
  ok(run.info.ramCapMps === null, 'judged and driven at full speed: no finishing cap on a run that cannot finish the host');
}

console.log('[2] a teammate empty-handed is no one to leave the finish to');
{
  const run = standoff({ teammate: 'empty' });
  ok(run.runAt !== null && run.closest < 10, `the run is taken (at ${run.runAt?.toFixed(1) ?? 'never'} s, closest ${run.closest.toFixed(1)} m)`);
}

console.log('[3] controls: the retirement holds while the team can still finish, or the target is not passive');
{
  const armed = standoff({ teammate: 'armed' });
  ok(armed.runAt === null && !(armed.info.lastRuns > 0) && armed.closest > 230,
    `an armed teammate is left the finish: no run, the hull holds its distance (closest ${armed.closest.toFixed(0)} m)`);
  const moving = standoff({ host: 'moving' });
  ok(moving.runAt === null && moving.closest > 230, `a host under way is no passive target (closest ${moving.closest.toFixed(0)} m)`);
  const firing = standoff({ host: 'firing' });
  ok(firing.runAt === null && firing.closest > 230, `nor is a host whose gun fires (closest ${firing.closest.toFixed(0)} m)`);
}

if (failures) {
  console.error(`ai.lastRun.selftest: ${failures} failure(s)`);
  process.exit(1);
}
console.log('ai.lastRun.selftest: ok');
