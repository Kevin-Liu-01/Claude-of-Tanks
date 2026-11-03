// 2026-11-02 audit M7: every change of a bot's mode runs the exit actions of the mode it leaves. The declared switch
// (stepFlankState, stepSeekCoverState) cleared a flank's non-penetration count and a cover leg's point, reload roll and
// engage crest, but 19 writes from 15 other places (a ram run, the press, a hit reaction, a commander's order…) set
// `mode` directly and skipped them. Two consequences, both reproduced here on the lane base:
//  - a retreat ordered mid-flank took the hull out of the flank with the count still at 2, so the very next bounce
//    started a new flank and the retreat's engage-mode drive was gone;
//  - a push ordered while the hull ran to cover (it suspends cover-seeking: effCoverIQ 0) left the passed reload roll
//    standing, and the next engage tick sent the hull straight back to cover.
// Pins: both writers now go through setMode; the declared transitions behave as before (a flank still starts on two
// bounces; a reload still sends the hull to a crest).
import { Vector3 } from 'three';
import '../vehicles/fleetFactory.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createTankState, updateTank, SIM_DT } from '../sim/movement.ts';
import { createAI, mulberry32 } from './ai.ts';

let failures = 0;
const ok = (cond, label) => { if (cond) console.log(`  ok  ${label}`); else { failures++; console.error(`FAIL  ${label}`); } };
const flat = { getHeightAt: () => 0, getNormalAt: () => ({ x: 0, y: 1, z: 0 }), getGroundType: () => 'firm' };
// a 3.5 m bank the bot stands on, its foot 6 m behind it: the crest a reloading hull backs down behind
const bank = { getHeightAt: (_x, z) => (z > -6 ? 3.5 : 0), getNormalAt: () => ({ x: 0, y: 1, z: 0 }), getGroundType: () => 'firm' };
function tank(id, specId, team, x, z, yaw, field) {
  const spec = getSpec(specId);
  return { id, specId: spec.id, spec, team, state: createTankState(spec, new Vector3(x, field.getHeightAt(x, z), z), yaw),
    combat: { hp: 1000, maxHp: 1000, destroyed: false, reload: { t: 0, totalS: spec.gun.reloadS, kind: 'ready' }, shellSlot: 0,
      modules: {}, crew: {}, fire: { burning: false, tickTimer: 0, ticksLeft: 0 }, magazine: null },
    input: { throttle: 0, steer: 0, brake: false, fire: false, aimPoint: new Vector3(), shellSlot: 0, actionBits: 0 },
    aiCtl: null };
}
function brain(bot, enemies, field, seed, difficulty = 'normal', startS = 200) {
  const ctl = createAI(bot, { difficulty, rng: mulberry32(seed), deps: {
    heightField: field, raycast: () => null, getEnemies: () => enemies, getAllies: () => [], getObstacles: () => [],
    spotting: { isSpotted: () => true },
  } });
  bot.aiCtl = ctl;
  const clock = { t: startS }; // 200 s: past every role's opening read (DEPLOYMENT_TUNING: 165 s at most)
  const run = (seconds, onTick = null) => {
    for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
      clock.t += SIM_DT;
      ctl.update(SIM_DT, clock.t);
      bot.input.throttle = 0; bot.input.steer = 0; bot.input.brake = false; // hold the hull: the decision is the subject
      updateTank(bot, field, SIM_DT);
      if (onTick) onTick(ctl.debugInfo());
    }
  };
  return { ctl, run, clock };
}
const order = (posture, untilS) => ({ posture, targetId: null, fire: null, threat: 0, point: null, untilS });
const bounce = { targetId: 'enemy', kind: 'nonpen' };

console.log('[1] a retreat ordered mid-flank ends the flank: one more bounce does not start another');
{
  const bot = tank('bot', 't90am', 'alpha', 0, 0, 0, flat);
  const enemy = tank('enemy', 'm1a1_abrams_hc', 'bravo', 0, 150, Math.PI, flat); // nose on the bot: the flank stays open
  const { ctl, run, clock } = brain(bot, [enemy], flat, 41);
  run(1);
  ok(ctl.targetId === 'enemy', 'the visible enemy is the target');
  ctl.notifyShellResult(bounce);
  ctl.notifyShellResult(bounce);
  run(SIM_DT);
  ok(ctl.debugInfo().mode === 'flank', `two bounces start the flank (the declared transition; mode ${ctl.debugInfo().mode})`);
  ctl.setOrder(order('retreat', clock.t + 30));
  run(SIM_DT);
  const retreat = ctl.debugInfo();
  ok(retreat.mode === 'engage' && retreat.fallingBack, `the order falls back in the engage driver (${retreat.mode}, fallingBack ${retreat.fallingBack})`);
  ctl.notifyShellResult(bounce);
  let flanked = false;
  run(0.5, (info) => { if (info.mode === 'flank') flanked = true; });
  ok(!flanked, 'one bounce after the retreat began starts no flank (the count restarted when the flank ended)');
  ok(ctl.debugInfo().fallingBack, 'the retreat runs on');
  ctl.notifyShellResult(bounce);
  run(SIM_DT);
  ok(ctl.debugInfo().mode === 'flank', 'a second bounce starts one, as two always did');
}

console.log('[2] a push ordered while the hull runs to cover keeps it out of cover for the push');
{
  // the reload roll is seeded: take the first seed whose roll sends the reloading hull to the bank's crest
  let found = null;
  for (let seed = 1; seed <= 40 && !found; seed++) {
    // early in the battle, in deployment range (80 m): no stalemate push yet, and the cover discipline at full strength
    const bot = tank('bot', 't90am', 'alpha', 0, 0, 0, bank);
    const enemy = tank('enemy', 'm1a1_abrams_hc', 'bravo', 0, 80, Math.PI, bank);
    const scene = brain(bot, [enemy], bank, seed, 'hard', 1);
    scene.run(1);
    if (scene.ctl.targetId !== 'enemy') continue;
    bot.combat.reload = { t: 8, totalS: 8, kind: 'reloading' }; // a round just left the gun
    let cover = false;
    scene.run(0.5, (info) => { if (info.mode === 'seekCover') cover = true; });
    if (cover && scene.ctl.debugInfo().mode === 'seekCover') found = { ...scene, bot, seed };
  }
  ok(!!found, `a reloading hull goes to the crest (the declared transition; seed ${found?.seed})`);
  if (found) {
    found.ctl.setOrder(order('push', found.clock.t + 20));
    let cover = 0;
    found.run(1, (info) => { if (info.mode === 'seekCover') cover++; });
    ok(cover === 0, `no tick back in cover under the push (${cover} ticks)`);
    ok(found.ctl.debugInfo().pressing, 'the push runs');
  }
}

if (failures) { console.error(`ai.modeExit.selftest: ${failures} failure(s)`); process.exit(1); }
console.log('ai.modeExit.selftest: every mode change runs the exit actions of the mode it leaves');
