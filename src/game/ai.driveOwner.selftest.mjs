// 2026-11-02 audit M7: who drives a bot's hull is a declared table, not statement order. ai.ts drove the hull through a
// chain of early returns (mission > hit reaction > level route > arc-limit leg > passive press > settled-shot halt >
// scoot leg > the mode's driver), started the doctrine's overlays in a fixed sequence and ran the recoveries and
// finishStep's safeties after it, each order living only in where the statements stood. The orders are now the
// exported tables AI_DRIVE_OWNERS / AI_DOCTRINE_STARTS / AI_DRIVE_LAYERS that the controller iterates, and
// debugInfo().driveOwner names the owner that drove the last tick. Pins: the tables hold the orders the statements had
// (a reorder is a reviewed edit of these lines, never a side effect of moving code); a free bot's mode drives it; a
// live hit reaction takes the hull; a mission keeps it over that reaction; a wreck has no owner.
// Round 8 Y2 (s2-04): the lay-first clamp is the last layer ('layFirst', after 'finish'), and the recovery turns it
// leaves whole are a declared table (AI_RECOVERY_TURNS) with one owner: each turn has its claim site, and only
// resetStepIntent's openTickTurn and claimRecoveryTurn write the tick's recoveryTurn (ai.layGunFirst.selftest drives
// the claims).
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import '../vehicles/fleetFactory.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createTankState, updateTank, SIM_DT } from '../sim/movement.ts';
import { AI_DOCTRINE_STARTS, AI_DRIVE_LAYERS, AI_DRIVE_OWNERS, AI_RECOVERY_TURNS, createAI, mulberry32 } from './ai.ts';

let failures = 0;
const ok = (cond, label) => { if (cond) console.log(`  ok  ${label}`); else { failures++; console.error(`FAIL  ${label}`); } };
const hf = { getHeightAt: () => 0, getNormalAt: () => ({ x: 0, y: 1, z: 0 }), getGroundType: () => 'firm' };
function tank(id, team, x, z, yaw = 0) {
  const spec = getSpec('t90am');
  return { id, specId: spec.id, spec, team, state: createTankState(spec, new Vector3(x, 0, z), yaw),
    combat: { hp: 1000, maxHp: 1000, destroyed: false, reload: { t: 0, totalS: spec.gun.reloadS, kind: 'ready' }, shellSlot: 0,
      modules: {}, crew: {}, fire: { burning: false, tickTimer: 0, ticksLeft: 0 }, magazine: null },
    input: { throttle: 0, steer: 0, brake: false, fire: false, aimPoint: new Vector3(), shellSlot: 0, actionBits: 0 },
    aiCtl: null };
}
function brain(bot, enemies, extraDeps = {}) {
  const ctl = createAI(bot, { difficulty: 'normal', rng: mulberry32(41), deps: {
    heightField: hf, raycast: () => null, getEnemies: () => enemies, getAllies: () => [], getObstacles: () => [],
    spotting: { isSpotted: () => true }, ...extraDeps,
  } });
  bot.aiCtl = ctl;
  let t = 0;
  const run = (seconds) => {
    for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
      t += SIM_DT;
      ctl.update(SIM_DT, t);
      bot.input.throttle = 0; bot.input.steer = 0; bot.input.brake = false; // hold the hull: each case isolates a decision
      updateTank(bot, hf, SIM_DT);
    }
  };
  return { ctl, run };
}

console.log('[1] the tables hold the orders the statements had');
ok(AI_DRIVE_OWNERS.join() === 'mission,reaction,levelRoute,arcScoot,passivePress,settle,scoot,mode',
  `drive owners, highest first (${AI_DRIVE_OWNERS.join(' > ')})`);
ok(AI_DOCTRINE_STARTS.join() === 'elevationLock,emptyRack,objectiveShift,passivePress,shotRelocation,probeRelocation,'
  + 'penDeniedFlank,fallback,squadManeuver', 'doctrine starts in their tick order');
ok(AI_DRIVE_LAYERS.join() === 'trafficDetour,jockey,progress,slopeRecovery,colliderRecovery,lowSpeedRecovery,orbitRecovery,finish,'
  + 'layFirst', 'the layers after the owner in their tick order, the lay-first clamp last');
ok(AI_RECOVERY_TURNS.join() === 'unstick,terrainEscape,allyEscape,allySwerve,hullBackOff', 'the recovery turns the clamp keeps');
for (const table of [AI_DRIVE_OWNERS, AI_DOCTRINE_STARTS, AI_DRIVE_LAYERS, AI_RECOVERY_TURNS]) {
  ok(Object.isFrozen(table) && new Set(table).size === table.length, `frozen, no name twice (${table[0]}…)`);
}
{
  // the census: every declared recovery turn is claimed somewhere, nothing else claims, and the tick's recoveryTurn has
  // two writers only (the tick's open and the claim)
  const source = readFileSync(new URL('./ai.ts', import.meta.url), 'utf8');
  const claimed = new Set([...source.matchAll(/claimRecoveryTurn\('(\w+)'\)/g)].map((m) => m[1]));
  ok(AI_RECOVERY_TURNS.every((turn) => claimed.has(turn)) && [...claimed].every((turn) => AI_RECOVERY_TURNS.includes(turn)),
    `each recovery turn has a claim site (${[...claimed].join(', ')})`);
  const writers = [...source.matchAll(/\brecoveryTurn = /g)].length;
  ok(writers === 2, `recoveryTurn is written by openTickTurn and claimRecoveryTurn only (${writers} writes)`);
}

console.log('[2] a free bot\'s own mode drives it');
{
  const bot = tank('bot', 'alpha', 0, 0);
  const { ctl, run } = brain(bot, []);
  run(0.5);
  const info = ctl.debugInfo();
  ok(info.mode === 'patrol' && info.driveOwner === 'mode', `patrol, owner ${info.driveOwner}`);
}

console.log('[3] a live hit reaction takes the hull from the mode');
{
  const bot = tank('bot', 'alpha', 0, 0);
  bot.combat.hp = 300;
  const shooter = tank('shooter', 'bravo', 0, 120, Math.PI);
  const { ctl, run } = brain(bot, [shooter]);
  run(0.5);
  ctl.notifyUnderFire(shooter, { selfHit: true, damaging: true, kind: 'pen' });
  run(SIM_DT);
  const info = ctl.debugInfo();
  ok(info.reaction === 'backoff' && info.driveOwner === 'reaction', `backoff, owner ${info.driveOwner}`);
}

console.log('[4] a mission keeps the hull over a live reaction');
{
  const bot = tank('bot', 'alpha', 0, 0);
  const flanker = tank('flanker', 'bravo', 120, 0, -Math.PI / 2);
  const objective = { x: 0, z: 300, radiusM: 30, mission: 'raid' };
  const { ctl, run } = brain(bot, [flanker], { getObjective: () => objective });
  ctl.setWaypoints([[objective.x, objective.z]], { loop: false });
  run(0.5);
  ctl.notifyUnderFire(flanker, { selfHit: true, damaging: false, kind: 'nonpen' });
  run(SIM_DT);
  const info = ctl.debugInfo();
  ok(info.reaction === 'angle', `the struck hull picked a reaction (${info.reaction})`);
  ok(info.driveOwner === 'mission', `the mission still drives (owner ${info.driveOwner})`);
}

console.log('[5] a wreck has no owner');
{
  const bot = tank('bot', 'alpha', 0, 0);
  const { ctl, run } = brain(bot, []);
  run(0.2);
  bot.combat.destroyed = true;
  run(SIM_DT);
  ok(ctl.debugInfo().driveOwner === null, 'driveOwner null on a wreck');
}

if (failures) { console.error(`ai.driveOwner.selftest: ${failures} failure(s)`); process.exit(1); }
console.log('ai.driveOwner.selftest: the drive owners, doctrine starts and layers run from declared tables in the statements\' order');
