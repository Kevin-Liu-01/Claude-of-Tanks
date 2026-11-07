// 2026-11-02 audit M7: a bot handed its hull back after Watch mode's Take control resumes from the hull as it stands.
// watchSeat.ts parks the controller while the watcher drives and gives it back on Leave; the controller was not
// stepped in between, and what it measures from one tick to the next read the whole stretch as one tick of its own.
// Reproduced on the lane base: the hull the watcher lost booked as one burst and the bot fell back on its first tick
// back, and the watcher's last shot counted on the bot's new spot. Pins: Leave (and the battle's opening hand-off)
// calls the controller's resume() with the battle's clock; after it no fallback, no shot of the watcher's, no progress
// spike, no stalemate push or search leg from the park's silence, and the bot fights on (it keeps its target, and real
// damage after the resume still counts).
// Round 2 (U18): two leftovers of the same class. A round the watcher fired just before Leave that landed after it was
// reported to the brain handed back (shooter.aiCtl) and booked as the bot's own: its miss streak reset, its
// non-penetrations counted toward a flank, its aim error re-drawn from the bot's seeded stream. And the first tick back
// restarted the clocks of the bot's own record in full after any hand-back, so a 0.1 s Take and Leave put the
// stalemate push, the search gate and the passive press back by their whole windows. takeWatchSeat now parks the brain
// with the battle's clock and Leave hands it back with the battle's next shell id: the park's stretch moves those clocks
// on by its length, and a result of a round that left the gun before the hand-back is not the bot's. Pins: [4] the
// watcher's rounds landing after Leave leave the bot as if they had never been reported, its own next round counts;
// [5] a 0.1 s toggle moves the stalemate push by 0.1 s, and the target's silence as the bot saw it runs on.
// Review round 1: the freeze also carried the bot's view of its target (its stillness and silence) over every park, so a
// target that drove and fired while the watcher held the hull read as passive a second after Leave. That view is what
// the bot saw, not its record: [6] it starts again after any park that could have hidden a move or a round (longer than
// one look's shot threshold, a move, a reload begun) and after a resume with no park (a revive), and runs on through a
// short, quiet one.
// Review round 2: the bot's own route legs, planned from where the hull stood, outlived the hand-back on their own
// clocks: a level route's deadline spent in the park gave its live target up as unbearable on the first tick back, and a
// revive's dead stretch booked a failed search leg. [7] a level route and [8] a search leg hold, their clocks moved by the
// park, while the hull lies on its way; otherwise they end with no verdict and are planned from here.
// Round 3 (A2): the hold was keyed on the spot the hull was taken on (6 m), and the proofs never stepped the hull through
// the park. The fixed step keeps stepping a taken hull, and the input Take leaves it (nobody at the keys) lets it coast on
// from speed, past 6 m in half a second at route speed, so every Take and Leave of a moving bot ended its level route
// and planned its search leg again (reproduced on 92f415e879: 0.5 s and 2 s toggles). The hold now reads the route from
// that spot through the waypoints still ahead, and [7]-[9] take and give the hull back through Watch mode's own Take and
// Leave with the hull stepped in between: 0.5 s and 2 s coasting toggles and a coasting in-place park keep the legs, the
// watcher's drives off and a revive still end them, and [9] a displaced leg's wait moves with the park (a mutant without
// that shift planned the search over a commander's point on the first tick back).
// Round 4 (F5, E8): the hold read the way on the ground plan alone, so [11] a drive off a causeway's crest onto the floor
// beside it left the level route held from below until its strikes gave the target up as unbearable; a stretch the hull
// cannot drive to (a face too steep for it between them) is no longer its way. [10] on a tie the earlier stretch keeps
// the cursor (a leg that doubles back over its own line is driven to its apex), and [12] the elevation lock's dwell holds
// through a park that left the hull where it was taken and restarts after a drive off. Fix-up r1 (the round's two
// reviews): the tie rule now holds on a diagonal leg, where rounding breaks the tie ([10] at -48.3 degrees); the level
// test is whether the hull can drive there, not the gun's 8 m band, which held the route from 5.5 m below ([11] taken
// past z 14); and the stood-put test's level half has a case ([12], left on the deck above where it was taken). Fix-up r2
// (the round's second reviews): [10] a hull taken on the way up, off the route's line, and handed back short of the apex
// still skipped it (the first stretch runs from where it was taken), so the cursor now passes a waypoint only where the
// hull has gone by it; [13] a bridge deck's side is a wall to the walk whatever the step, as it is to the planner; and
// [14] a hull on a record's top (a rock) is read from the ground under it, as the follower reads it, not as a drop.
// Round 5 (U5, the round-four correctness review): that reading at both ends of the stood-put walk let a park onto or off
// a record keep the elevation lock's dwell where the record's side is a wall by the slope law; [12] a park onto or off a
// 2.2 m rock now restarts it, and one onto a 1 m rock the hull steps onto and off keeps it.
// Cost (round 5, U6; the default tier): [11] stepped three fixed 60 s windows after Leave, and now runs each only until
// what it reads is settled (a verdict, the road planned again, the route's end), and [12]'s window is a whole dwell and a
// margin. Measured as the process's own CPU at load 100-135: [11] 3.05-3.25 s to 1.31-1.45 s, the file 9.8-10.2 s user
// to 8.5-8.9 s (round three's file 5.9 s, the fleet import 2.2 s of each). It stays in the default tier: the only default
// receipt of the Watch hand-back's route legs and dwell (ai.watchTakeover steps whole battles: MANUAL).
import { Vector3 } from 'three';
import '../vehicles/fleetFactory.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createTankState, resetTankVerticalState, updateTank, SIM_DT } from '../sim/movement.ts';
import { CLASSIC_BOT_DOCTRINE } from '../sim/matchRuleset.ts';
import * as detMath from '../sim/detMath.ts';
import { createHullSupportPose, createStructureSupportField, hullSupportPose } from '../sim/structureSupport.ts';
import { setConvexTopShape } from '../world/collision.ts';
import { createAI, mulberry32 } from './ai.ts';
import { leaveWatchSeat, openWatchSeats, prepareWatchSeat, takeWatchSeat } from './watchSeat.ts';

let failures = 0;
const ok = (cond, label) => { if (cond) console.log(`  ok  ${label}`); else { failures++; console.error(`FAIL  ${label}`); } };
const field = { getHeightAt: () => 0, getNormalAt: () => ({ x: 0, y: 1, z: 0 }), getGroundType: () => 'firm' };
function tank(id, team, x, z, yaw = 0, specId = 't90am') {
  const spec = getSpec(specId);
  return { id, specId: spec.id, spec, team, isPlayer: false, state: createTankState(spec, new Vector3(x, 0, z), yaw),
    combat: { hp: 1000, maxHp: 1000, destroyed: false, reload: { t: 0, totalS: spec.gun.reloadS, kind: 'ready' }, shellSlot: 0,
      modules: {}, crew: {}, fire: { burning: false, tickTimer: 0, ticksLeft: 0 }, magazine: null },
    input: { throttle: 0, steer: 0, brake: false, fire: false, aimPoint: new Vector3(), shellSlot: 0, actionBits: 0 },
    aiCtl: null };
}
function wire(entity, tanks, seed) {
  entity.aiCtl = createAI(entity, { difficulty: 'normal', rng: mulberry32(seed), deps: {
    heightField: field, raycast: () => null, getObstacles: () => [], spotting: { isSpotted: () => true },
    getEnemies: () => tanks.filter((other) => other.team !== entity.team && !other.combat.destroyed),
    getAllies: () => tanks.filter((other) => other !== entity && other.team === entity.team && !other.combat.destroyed),
  } });
}

function battle() {
  const seat = tank('seat', 'alpha', -40, -30);
  const bot = tank('bot', 'alpha', 0, 0);
  const enemy = tank('enemy', 'bravo', 0, 80, Math.PI);
  const tanks = [seat, bot, enemy];
  wire(seat, tanks, 3);
  wire(bot, tanks, 41);
  const game = { player: seat, tanks, ruleset: { watch: { takeControl: true } }, watch: null };
  prepareWatchSeat(game, seat);
  openWatchSeats(game);
  let t = 1;
  const step = (seconds, drive = true) => {
    for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
      t += SIM_DT;
      if (drive && bot.aiCtl) bot.aiCtl.update(SIM_DT, t);
      bot.input.throttle = 0; bot.input.steer = 0; bot.input.brake = false; // the hull holds: the decisions are the subject
      updateTank(bot, field, SIM_DT, null);
    }
  };
  return { game, seat, bot, enemy, step, brain: bot.aiCtl };
}

/**
 * Watch mode's own Take and Leave of `entity` (driven by `ctl`) around a park in which `between(seconds)` steps the taken
 * hull, as the fixed step keeps stepping a player's hull with the input Take left it (nobody at the keys: it coasts);
 * `away` then moves it as a watcher's drive would. The session is the smallest watched battle: a human seat and this bot.
 */
function takeAndLeave(entity, ctl, clock, between, seconds, away) {
  const seat = { id: 'watcher', team: entity.team, isPlayer: true, aiCtl: { park() {}, resume() {} },
    input: { throttle: 0, steer: 0, brake: false, fire: false, actionBits: 0 }, combat: { destroyed: false } };
  const game = { player: seat, tanks: [seat, entity], ruleset: { watch: { takeControl: true } }, watch: null, timeS: clock(), nextShellId: 1 };
  prepareWatchSeat(game, seat);
  openWatchSeats(game);
  entity.aiCtl = ctl;
  game.timeS = clock();
  const speedAtTake = entity.state.speed, x0 = entity.state.pos.x, z0 = entity.state.pos.z;
  if (!takeWatchSeat(game, entity)) throw new Error('setup: the watcher takes the bot');
  between(seconds);
  const coastM = Math.hypot(entity.state.pos.x - x0, entity.state.pos.z - z0);
  away?.();
  game.timeS = clock();
  if (leaveWatchSeat(game) !== entity || entity.aiCtl !== ctl) throw new Error('setup: Leave hands the bot back');
  return { speedAtTake, coastM };
}

console.log('[1] Leave hands the brain back: the stretch the watcher drove is no tick of the bot\'s');
{
  const { game, bot, step, brain } = battle();
  step(2);
  ok(brain.targetId === 'enemy', 'the bot fights the enemy before the watcher takes it');
  ok(takeWatchSeat(game, bot) && bot.aiCtl === null, 'Take control parks the brain');
  // the watcher drives 70 m off, takes 45 % of the hull and fires one round, for 4 s of the battle
  bot.state.pos.x += 70;
  bot.state.pos.z -= 10;
  bot.combat.hp = 550;
  bot.combat.reload.t = bot.spec.gun.reloadS;
  step(4, false);
  ok(leaveWatchSeat(game) === bot && bot.aiCtl === brain, 'Leave hands the same brain back');
  step(SIM_DT);
  const info = brain.debugInfo();
  ok(!info.fallingBack && info.burstDamage === 0, `no fallback on the first tick back (fallingBack ${info.fallingBack}, burst ${info.burstDamage})`);
  ok(info.shotsFromSpot === 0, `the watcher's round is not the bot's (shotsFromSpot ${info.shotsFromSpot})`);
  ok(info.progressRate < 5, `no progress spike from the parked ground (progressRate ${info.progressRate} m/s)`);
  ok(brain.targetId === 'enemy', 'it keeps its target');
  // real damage after the resume still counts
  bot.combat.hp = 350;
  step(SIM_DT);
  const after = brain.debugInfo();
  ok(after.fallingBack || after.burstDamage > 0, `a hit after the resume is a burst again (burst ${after.burstDamage}, fallingBack ${after.fallingBack})`);
}

console.log('[2] the resume reaches the brain on every hand-off');
{
  const calls = [], parks = [], shellIds = [];
  const fake = (id) => ({ id, park: (timeS) => parks.push(`${id}@${timeS}`),
    resume: (timeS, firstShellId) => { calls.push(`${id}@${timeS}`); shellIds.push(`${id}#${firstShellId}`); } });
  const seat = tank('seat', 'alpha', 0, 0), bot = tank('bot', 'alpha', 10, 0);
  seat.aiCtl = fake('seat'); bot.aiCtl = fake('bot');
  const game = { player: seat, tanks: [seat, bot], ruleset: { watch: { takeControl: true } }, watch: null, timeS: 3, nextShellId: 5 };
  prepareWatchSeat(game, seat);
  ok(calls.length === 0, 'parking resumes nothing');
  openWatchSeats(game);
  ok(calls.join() === 'seat@3', 'the battle opening hands the human seat to its brain, resumed at the battle\'s clock');
  game.timeS = 11;
  takeWatchSeat(game, bot);
  ok(parks.join() === 'bot@11', `Take control parks the taken seat's brain at the battle's clock (${parks.join()})`);
  game.timeS = 17;
  game.nextShellId = 9;
  leaveWatchSeat(game);
  ok(calls.join() === 'seat@3,bot@17', `Leave resumes the taken seat's brain at the battle's clock (${calls.join()})`);
  ok(shellIds.join() === 'seat#5,bot#9', `each hand-back names the battle's next shell id (${shellIds.join()})`);
  const plain = tank('plain', 'alpha', 20, 0);
  plain.aiCtl = { id: 'plain' }; // a controller without resume (a stand-in) is handed back as before
  game.tanks.push(plain);
  ok(takeWatchSeat(game, plain) && leaveWatchSeat(game) === plain && plain.aiCtl.id === 'plain', 'a controller without resume still goes back');
}

console.log('[3] a park longer than the stalemate silence is no silence of the bot\'s gun');
// The clocks that time the bot's own record since an event (its last round, its last penetration) grew through the
// park, though the watcher, not the bot, did the firing. Reproduced on the lane's previous head (f2924b7eea): after a
// 14 s park (the classic doctrine's stalemate silence is 12 s) the first tick back started a stalemate push, and after
// a 30 s park in which the watcher killed the target it started a search leg toward the last unseen enemy. Both
// clocks restart at the first tick back; a 2 s park, as before, starts nothing.
{
  function armed(killTarget) {
    const seat = tank('seat', 'alpha', -40, -30), bot = tank('bot', 'alpha', 0, 0), enemy = tank('enemy', 'bravo', 0, 80, Math.PI);
    const far = tank('far', 'bravo', 300, 500, Math.PI); // never seen
    const tanks = [seat, bot, enemy, far];
    let seen = true;
    for (const [entity, seed] of [[seat, 3], [bot, 41]]) {
      entity.aiCtl = createAI(entity, { difficulty: 'normal', rng: mulberry32(seed), deps: {
        heightField: field, raycast: () => null, getObstacles: () => [], spotting: { isSpotted: (id) => id === 'enemy' && seen },
        getEnemies: () => tanks.filter((other) => other.team !== entity.team && !other.combat.destroyed),
        getAllies: () => tanks.filter((other) => other !== entity && other.team === entity.team && !other.combat.destroyed),
      } });
    }
    const game = { player: seat, tanks, ruleset: { watch: { takeControl: true } }, watch: null, timeS: 1 };
    prepareWatchSeat(game, seat);
    openWatchSeats(game);
    let lastFireS = -1;
    const step = (seconds, drive = true) => {
      for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
        game.timeS += SIM_DT;
        if (drive && bot.aiCtl) bot.aiCtl.update(SIM_DT, game.timeS);
        // the gun fires what the bot pulls, and reloads (the bot's own record of its rounds)
        if (bot.input.fire) { lastFireS = game.timeS; bot.combat.reload.t = bot.spec.gun.reloadS; bot.input.fire = false; }
        if (bot.combat.reload.t > 0) bot.combat.reload.t = Math.max(0, bot.combat.reload.t - SIM_DT);
        bot.input.throttle = 0; bot.input.steer = 0; bot.input.brake = false;
        updateTank(bot, field, SIM_DT, null);
      }
    };
    const park = (seconds) => {
      ok(takeWatchSeat(game, bot), `Take control at ${game.timeS.toFixed(2)} s`);
      if (killTarget) { seen = false; enemy.combat.destroyed = true; enemy.combat.hp = 0; }
      step(seconds, false);
      ok(leaveWatchSeat(game) === bot, `Leave after ${seconds} s`);
      step(SIM_DT);
    };
    return { brain: bot.aiCtl, step, park, lastFire: () => lastFireS };
  }
  for (const parkS of [14, 2]) {
    const { brain, step, park, lastFire } = armed(false);
    step(9);
    ok(lastFire() > 1 && !brain.debugInfo().pressing, `the bot fires before the park (at ${lastFire().toFixed(2)} s) and is not pushing`);
    park(parkS);
    const info = brain.debugInfo();
    ok(!info.pressing, `${parkS} s park: no stalemate push on the first tick back (pressing ${info.pressing})`);
  }
  {
    const { brain, step, park } = armed(true);
    step(9);
    park(30);
    const info = brain.debugInfo();
    ok(!info.searching && info.searchLegs === 0,
      `30 s park, the target killed by the watcher: no search leg on the first tick back (searching ${info.searching}, ${info.searchKind || '-'})`);
    ok(!info.pressing, `and no push (pressing ${info.pressing})`);
  }
}

/** A watched battle whose seat and bot are brains; `trace` records the bot's inputs and decisions tick by tick. */
function tracedBattle({ gunHeld = false } = {}) {
  const seat = tank('seat', 'alpha', -40, -30), bot = tank('bot', 'alpha', 0, 0), enemy = tank('enemy', 'bravo', 0, 80, Math.PI);
  const tanks = [seat, bot, enemy];
  wire(seat, tanks, 3);
  wire(bot, tanks, 41);
  const game = { player: seat, tanks, ruleset: { watch: { takeControl: true } }, watch: null, timeS: 1, nextShellId: 40 };
  prepareWatchSeat(game, seat);
  openWatchSeats(game);
  const trace = [];
  const step = (seconds, drive = true, until = null) => {
    for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
      game.timeS += SIM_DT;
      if (drive && bot.aiCtl) {
        bot.aiCtl.update(SIM_DT, game.timeS);
        const d = bot.aiCtl.debugInfo(), input = bot.input;
        trace.push([input.throttle, input.steer, input.fire, input.aimPoint.x, input.aimPoint.z, d.mode, d.targetId,
          d.reaction, d.missStreak, d.pressing, d.driveOwner].join('|'));
      }
      // the gun fires what the bot pulls (one shell id each), and reloads; a held gun never comes ready
      if (bot.input.fire) { game.nextShellId++; bot.combat.reload.t = bot.spec.gun.reloadS; bot.input.fire = false; }
      if (gunHeld) bot.combat.reload.t = 5;
      else if (bot.combat.reload.t > 0) bot.combat.reload.t = Math.max(0, bot.combat.reload.t - SIM_DT);
      bot.input.throttle = 0; bot.input.steer = 0; bot.input.brake = false;
      updateTank(bot, field, SIM_DT, null);
      if (until && bot.aiCtl && until(bot.aiCtl.debugInfo())) return true;
    }
    return false;
  };
  return { game, bot, enemy, step, trace, brain: bot.aiCtl };
}
const firstDifference = (a, b) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return i;
  return -1;
};

console.log('[4] the watcher\'s rounds that land after Leave are not the bot\'s; its own next round is');
{
  // three twin battles: the watcher fires two rounds and leaves while they fly; B hears them land, C hears its own round
  const runs = ['A', 'B', 'C'].map((name) => {
    const run = tracedBattle();
    run.step(2);
    ok(takeWatchSeat(run.game, run.bot), `${name}: Take control`);
    const watcherRounds = [run.game.nextShellId++, run.game.nextShellId++]; // fired by the watcher, still in flight
    run.step(0.5, false);
    ok(leaveWatchSeat(run.game) === run.bot, `${name}: Leave with both rounds in flight`);
    if (name !== 'A') for (const shellId of watcherRounds) run.brain.notifyShellResult({ targetId: 'enemy', kind: 'nonpen', shellId });
    if (name === 'C') run.brain.notifyShellResult({ targetId: 'enemy', kind: 'nonpen', shellId: run.game.nextShellId++ });
    run.step(3);
    return run;
  });
  const [a, b, c] = runs;
  const diverged = firstDifference(a.trace, b.trace);
  ok(diverged < 0, `the watcher's two non-penetrations landing after Leave change nothing (${diverged < 0
    ? `identical for ${a.trace.length} ticks` : `first difference at tick ${diverged}: ${a.trace[diverged]} / ${b.trace[diverged]}`})`);
  ok(firstDifference(a.trace, c.trace) >= 0, 'a round of the bot\'s own after the hand-back still reports to it');
}

console.log('[5] a short Take and Leave moves the bot\'s own clocks by the park, not by their windows');
{
  // the gun is held (never ready), the target seen and still: the stalemate push comes after the doctrine's 12 s silence
  const pushAt = (toggleAtS) => {
    const run = tracedBattle({ gunHeld: true });
    let passiveBefore = null, passiveAfter = null;
    if (toggleAtS !== null) {
      run.step(toggleAtS - run.game.timeS);
      passiveBefore = run.brain.debugInfo().targetPassiveS;
      ok(takeWatchSeat(run.game, run.bot), `Take control at ${run.game.timeS.toFixed(2)} s`);
      run.step(0.1, false);
      ok(leaveWatchSeat(run.game) === run.bot, `Leave 0.1 s later`);
      run.step(SIM_DT);
      passiveAfter = run.brain.debugInfo().targetPassiveS;
    }
    const pushed = run.step(30, true, (info) => info.pressing);
    return { pushed, atS: run.game.timeS, passiveBefore, passiveAfter };
  };
  const plain = pushAt(null), toggled = pushAt(6);
  ok(plain.pushed && toggled.pushed, `both bots push (at ${plain.atS.toFixed(2)} s and ${toggled.atS.toFixed(2)} s)`);
  ok(Math.abs(toggled.atS - plain.atS - 0.1) < 0.05,
    `the toggle moved the push by its own 0.1 s, not by a fresh silence (${(toggled.atS - plain.atS).toFixed(2)} s later)`);
  ok(toggled.passiveAfter >= toggled.passiveBefore,
    `the target's stillness as the bot saw it runs on (${toggled.passiveBefore} s before the toggle, ${toggled.passiveAfter} s after)`);
}

console.log('[6] after a park that could have hidden a move or a round, the bot looks at its target afresh');
// Reproduced on 6db97c221d (the review's probe): the freeze carried the bot's view of its target over any park, so a
// target that drove and fired while the watcher held the hull read as still and silent for the whole stretch before
// Take, and as passive about 1 s after Leave (targetPassiveS 13.9 at Leave, 14.9 a second later; the passive press, the
// ram finish and the low-health stand all read it). The view now holds only through a park that could hide nothing.
{
  const RELOAD_S = getSpec('t90am').gun.reloadS;
  // the bot watches a still, silent target for 14 s with its gun held; `during(enemy, tick)` acts out the park
  const watched = ({ parkS, during = () => {}, resumeOnly = false }) => {
    const run = tracedBattle({ gunHeld: true });
    run.step(14);
    const before = run.brain.debugInfo().targetPassiveS;
    if (resumeOnly) run.brain.resume(run.game.timeS); // a hand-back with no park: a revive's (both drivers' hooks)
    else {
      takeWatchSeat(run.game, run.bot);
      const ticks = Math.round(parkS / SIM_DT);
      for (let i = 0; i < ticks; i++) {
        run.step(SIM_DT, false);
        during(run.enemy, i, ticks);
        if (run.enemy.combat.reload.t > 0) run.enemy.combat.reload.t = Math.max(0, run.enemy.combat.reload.t - SIM_DT);
      }
      leaveWatchSeat(run.game);
    }
    run.step(1);
    return { before, after: run.brain.debugInfo().targetPassiveS, targetId: run.brain.targetId };
  };
  const fire = (enemy) => { enemy.combat.reload.t = RELOAD_S; };
  const moved = watched({ parkS: 20, during: (enemy, i, ticks) => {
    if (i < ticks / 2) { enemy.state.speed = 6; enemy.state.pos.x += 6 * SIM_DT; } else enemy.state.speed = 0;
    if (i === 30) fire(enemy);
  } });
  ok(moved.before >= 13 && moved.after <= 1.1 && moved.targetId === 'enemy',
    `a 20 s park in which the target drove 60 m and fired: its view restarts (targetPassiveS ${moved.before} s at Take, ${moved.after} s 1 s after Leave)`);
  const firedInPlace = watched({ parkS: 20, during: (enemy, i) => { if (i === 30) fire(enemy); } });
  ok(firedInPlace.after <= 1.1,
    `a 20 s park in which the target fired in place and reloaded by Leave: no trace is left, and the view restarts (${firedInPlace.after} s)`);
  const shortShot = watched({ parkS: 0.5, during: (enemy, i) => { if (i === 10) fire(enemy); } });
  ok(shortShot.after <= 1.1, `a 0.5 s park in which the target fired: its reload shows the round, and the view restarts (${shortShot.after} s)`);
  const shortQuiet = watched({ parkS: 0.5 });
  ok(shortQuiet.after >= shortQuiet.before,
    `a 0.5 s park with the target still and silent: the view runs on (${shortQuiet.before} s at Take, ${shortQuiet.after} s after)`);
  const revived = watched({ resumeOnly: true });
  ok(revived.after <= 1.1, `a resume with no park (a revive) looks at the target afresh (${revived.before} s before, ${revived.after} s after)`);
}

/**
 * ai.levels' deck (as ai.routeOwner [3]-[4]): a 25 m cliff north of z 40, a ramp up it at x 100..130; a floor bot under a
 * deck enemy. With `records`, the hull is stepped through the structure support over them, as the match steps every hull,
 * and the bot reads them as its obstacles, as the match gives both the world's records (state.ts, botConstruction.ts).
 */
async function deckScene(records = null) {
  const DECK_Y = 25, CLIFF_Z = 40;
  const cliff = (z) => Math.max(0, Math.min(DECK_Y, (z - (CLIFF_Z - 2)) / 4 * DECK_Y));
  const getHeightAt = (x, z) => {
    const plateau = cliff(z);
    if (x < 97 || x > 133) return plateau;
    const ramped = z <= CLIFF_Z ? 0 : Math.min(DECK_Y, (z - CLIFF_Z) / 60 * DECK_Y);
    const side = Math.max(0, Math.min(1, Math.max(100 - x, x - 130) / 3));
    return ramped + (plateau - ramped) * side;
  };
  const getNormalAt = (x, z) => {
    const e = 0.5, dx = getHeightAt(x + e, z) - getHeightAt(x - e, z), dz = getHeightAt(x, z + e) - getHeightAt(x, z - e);
    const nx = -dx / (2 * e), nz = -dz / (2 * e), length = Math.hypot(nx, 1, nz);
    return { x: nx / length, y: 1 / length, z: nz / length };
  };
  const deckField = { getHeightAt, getNormalAt, getGroundType: () => 'firm' };
  const raycast = (origin, dir, maxDist) => {
    for (let d = 1; d < maxDist; d += 1) {
      if (origin.y + dir.y * d < getHeightAt(origin.x + dir.x * d, origin.z + dir.z * d)) return { dist: d };
    }
    return null;
  };
  const place = (id, team, x, z, yaw) => {
    const t = tank(id, team, x, z, yaw, 'm1a1_abrams_hc');
    t.state.pos.y = getHeightAt(x, z);
    return t;
  };
  const { createBotNavigationGrid, planBotRoute } = await import('../sim/botRoutePlanner.ts');
  const navigation = createBotNavigationGrid({ heightField: deckField });
  const routeRng = mulberry32(431);
  const floor = place('floor', 'alpha', 0, 30, 0);
  const deck = place('deck', 'bravo', 0, 55, Math.PI);
  const ctl = createAI(floor, { difficulty: 'normal', rng: mulberry32(73), deps: {
    heightField: deckField, raycast, getEnemies: () => [deck], getAllies: () => [], getObstacles: () => records ?? [],
    spotting: { isSpotted: () => true },
    planRoute: (start, goal, options) => planBotRoute({ start, goal, navigation, rng: routeRng, role: 'brawler',
      spec: floor.spec, useRoleDetour: false, requireGoalLevel: options?.requireGoalLevel === true }),
  } });
  const support = records ? createStructureSupportField(deckField, { getObstacles: () => records }) : null;
  const pose = createHullSupportPose();
  const stepHull = () => {
    if (!support) { updateTank(floor, deckField, SIM_DT, null); return; }
    support.beginHull(floor.state.pos.x, floor.state.pos.z, floor.state.pos.y, hullSupportPose(floor.spec, floor.state, pose));
    updateTank(floor, support, SIM_DT, null);
  };
  let t = 300;
  const run = (seconds, until) => {
    for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
      t += SIM_DT;
      ctl.update(SIM_DT, t);
      stepHull();
      if (until && until(ctl.debugInfo())) return true;
    }
    return false;
  };
  const moveTo = (x, z) => { floor.state.pos.x = x; floor.state.pos.z = z; floor.state.pos.y = getHeightAt(x, z); floor.state.speed = 0; };
  // the taken hull: stepped on the input it has (the controller is parked and writes nothing)
  const hull = (seconds) => {
    for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
      t += SIM_DT;
      stepHull();
    }
  };
  return { ctl, floor, run, moveTo, hull, clock: () => t, skip: (seconds) => { t += seconds; } };
}

console.log('[7] a level route ends with no verdict at a hand-back that finds the hull off its way, and holds while it is on it');
// Reproduced on dbdbfc2ad5 and 50197fdf43 (the review's probe): the route's deadline (its length at 5 m/s plus 25 s, on
// match time) was neither moved by the park nor ended by resume(), so a park or a dead stretch past it gave the live
// deck target up as unbearable for 75 s on the first tick back, and a hull handed back 270 m off drove the last route
// on from there. The route now holds through a park that left the hull on its way, its deadline moved by the park, and
// otherwise ends with no verdict; the elevation lock re-arms from the hull as it stands, ELEVATION_LOCK_S later.
// Round 3 (A2): the taken hull coasts on from route speed (14 m/s here); on 92f415e879 a 0.5 s toggle (6.5 m) and a 2 s
// one (20 m) ended the route, and the next one came 6 s after Leave.
{
  const handBack = async ({ parkS, far = false, revive = false }) => {
    const { ctl, floor, run, moveTo, hull, clock, skip } = await deckScene();
    const routing = run(30, (info) => info.levelRouting);
    run(4); // up to route speed
    const before = ctl.debugInfo();
    let took = { speedAtTake: floor.state.speed, coastM: 0 };
    if (revive) { skip(parkS); ctl.resume(clock()); } // a revive's resume comes with no park (both drivers' revive hooks)
    else took = takeAndLeave(floor, ctl, clock, hull, parkS, far ? () => moveTo(-200, -150) : null);
    const back = ctl.debugInfo();
    const handBackS = clock();
    let oldRouteTicks = 0, nextRouteAfterS = null;
    run(8, (info) => {
      if (info.levelRouting && info.levelRoutes === before.levelRoutes) oldRouteTicks++;
      if (info.levelRoutes > before.levelRoutes && nextRouteAfterS === null) nextRouteAfterS = clock() - handBackS;
      return false;
    });
    return { routing, before, back, oldRouteTicks, nextRouteAfterS, after: ctl.debugInfo(), ...took };
  };
  const label = (r) => `verdicts ${r.before.unbearableVerdicts} -> ${r.after.unbearableVerdicts}, levelRouting ${r.before.levelRouting} -> ${r.back.levelRouting}, owner ${r.back.routeOwner}, routes ${r.before.levelRoutes} -> ${r.after.levelRoutes}`;
  const coasted = (r) => `taken at ${r.speedAtTake.toFixed(1)} m/s, coasted ${r.coastM.toFixed(1)} m`;
  const held = await handBack({ parkS: 200 });
  ok(held.routing && held.before.routeOwner === 'level', `the floor bot drives a level route to the deck (owner ${held.before.routeOwner})`);
  ok(held.after.unbearableVerdicts === held.before.unbearableVerdicts && held.back.levelRouting && held.oldRouteTicks > 400,
    `a 200 s park with nobody at the keys: the route runs on, its deadline moved by the park (${coasted(held)}; ${label(held)}; ${(held.oldRouteTicks * SIM_DT).toFixed(1)} s driven after)`);
  for (const parkS of [200, 30]) {
    const far = await handBack({ parkS, far: true });
    ok(far.after.unbearableVerdicts === far.before.unbearableVerdicts && !far.back.levelRouting && far.back.routeOwner !== 'level'
      && far.oldRouteTicks === 0,
      `a ${parkS} s park in which the watcher drove 270 m off: the route ends with no verdict and is not driven on from there (${label(far)}; ${(far.oldRouteTicks * SIM_DT).toFixed(1)} s of it after)`);
  }
  const revived = await handBack({ parkS: 200, revive: true });
  ok(revived.after.unbearableVerdicts === revived.before.unbearableVerdicts && !revived.back.levelRouting
    && revived.back.routeOwner !== 'level' && revived.oldRouteTicks === 0,
    `a resume with no park (a revive) 200 s on: the last life's route ends with no verdict (${label(revived)})`);
  ok(revived.nextRouteAfterS !== null && revived.nextRouteAfterS >= 6 - 0.05,
    `and the lock re-arms from the hull as it stands: a new route ${revived.nextRouteAfterS === null ? 'never' : `${revived.nextRouteAfterS.toFixed(2)} s`} after the hand-back (ELEVATION_LOCK_S 6 s)`);
  for (const parkS of [0.1, 0.5, 2]) {
    const toggled = await handBack({ parkS });
    ok(toggled.after.unbearableVerdicts === toggled.before.unbearableVerdicts && toggled.back.levelRouting
      && toggled.back.routeOwner === 'level' && toggled.after.levelRoutes === toggled.before.levelRoutes && toggled.oldRouteTicks > 400,
      `a ${parkS} s Take and Leave of the bot on its route: the hull coasts on along it and the route runs on (${coasted(toggled)}; ${label(toggled)})`);
  }
}

console.log('[8] a search leg planned where the hull stood is planned again from here at a hand-back off its way, counting no failure');
// Measured on dbdbfc2ad5: a revive 200 s after the leg began counted the dead stretch against the leg's budget, and the
// first tick back booked a failed leg (searchFailures 0 -> 1); a hull handed back 200 m off drove the old leg's next
// waypoint on from there (17.8 s). A park that left the hull on its way keeps the leg, its budget moved by the park.
// Round 3 (A2): the taken hull coasts on at 18.6 m/s; on 92f415e879 a 0.5 s toggle (8.8 m), a 2 s one (30 m) and a 30 s
// park with nobody at the keys each displaced the leg and planned another.
function searchScene(hidden = true, planRoute = undefined) {
  const bot = tank('bot', 'alpha', 0, -450, 0, 'm1a1_abrams_hc');
  const enemy = tank('enemy', 'bravo', 5, 150, 0, 'm1a1_abrams_hc'); // hidden, far: the 25 s search heads for its sector
  const ctl = createAI(bot, { difficulty: 'normal', rng: mulberry32(9), doctrine: () => CLASSIC_BOT_DOCTRINE, deps: {
    heightField: field, raycast: () => null, getEnemies: () => [enemy], getAllies: () => [], getObstacles: () => [],
    spotting: { isSpotted: () => !hidden }, getObjective: () => null, ...(planRoute ? { planRoute } : {}),
  } });
  let t = 1;
  const run = (seconds, until) => {
    for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
      t += SIM_DT;
      ctl.update(SIM_DT, t);
      updateTank(bot, field, SIM_DT, null);
      if (until && until(ctl.debugInfo())) return true;
    }
    return false;
  };
  const hull = (seconds) => {
    for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
      t += SIM_DT;
      updateTank(bot, field, SIM_DT, null);
    }
  };
  return { bot, ctl, run, hull, clock: () => t, skip: (seconds) => { t += seconds; } };
}
{
  const searchHandBack = ({ parkS, far = false, revive = false }) => {
    const { bot, ctl, run, hull, clock, skip } = searchScene();
    const searched = run(40, (info) => info.searching);
    run(10);
    const before = ctl.debugInfo();
    let took = { speedAtTake: bot.state.speed, coastM: 0 };
    if (revive) { skip(parkS); ctl.resume(clock()); }
    else took = takeAndLeave(bot, ctl, clock, hull, parkS, far ? () => { bot.state.pos.x += 200; bot.state.speed = 0; } : null);
    run(SIM_DT * 2);
    const first = ctl.debugInfo();
    let oldWaypointTicks = 0;
    run(10, (info) => {
      if (info.searchLegs === before.searchLegs && info.waypointX === before.waypointX && info.waypointZ === before.waypointZ) oldWaypointTicks++;
      return false;
    });
    return { searched, before, first, oldWaypointTicks, ...took };
  };
  const label = (r) => `failures ${r.before.searchFailures} -> ${r.first.searchFailures}, legs ${r.before.searchLegs} -> ${r.first.searchLegs}, displaced ${r.before.searchLegsDisplaced} -> ${r.first.searchLegsDisplaced}, leg age ${r.before.searchLegAgeS} -> ${r.first.searchLegAgeS} s`;
  const coasted = (r) => `taken at ${r.speedAtTake.toFixed(1)} m/s, coasted ${r.coastM.toFixed(1)} m`;
  const revived = searchHandBack({ parkS: 200, revive: true });
  ok(revived.searched && revived.before.routeOwner === 'search', `the bot searches (${revived.before.searchKind}, owner ${revived.before.routeOwner})`);
  ok(revived.first.searchFailures === revived.before.searchFailures && revived.first.searchLegs === revived.before.searchLegs + 1
    && revived.first.searchLegAgeS < 0.1 && revived.first.routeOwner === 'search',
    `a resume with no park (a revive) 200 s on: the next leg is planned from here, and the dead stretch is no failed leg (${label(revived)})`);
  const far = searchHandBack({ parkS: 30, far: true });
  ok(far.first.searchFailures === far.before.searchFailures && far.first.searchLegs === far.before.searchLegs + 1 && far.oldWaypointTicks === 0,
    `a 30 s park in which the watcher drove 200 m off: the old leg is not driven on from there (${label(far)}; ${(far.oldWaypointTicks * SIM_DT).toFixed(1)} s of it after)`);
  const held = searchHandBack({ parkS: 30 });
  ok(held.first.searchLegs === held.before.searchLegs && held.first.searchLegsDisplaced === held.before.searchLegsDisplaced
    && Math.abs(held.first.searchLegAgeS - held.before.searchLegAgeS) < 0.1 && held.oldWaypointTicks > 300,
    `a 30 s park with nobody at the keys: the leg runs on, its budget moved by the park (${coasted(held)}; ${label(held)})`);
  for (const parkS of [0.5, 2]) {
    const toggled = searchHandBack({ parkS });
    ok(toggled.first.searchLegs === toggled.before.searchLegs && toggled.first.searchLegsDisplaced === toggled.before.searchLegsDisplaced
      && toggled.first.searchFailures === toggled.before.searchFailures && toggled.oldWaypointTicks > 300,
      `a ${parkS} s Take and Leave of the bot on its leg: the hull coasts on along it and the leg runs on (${coasted(toggled)}; ${label(toggled)})`);
  }
  // the cursor: taken just short of the leg's first waypoint, the hull coasts past it; handed back, it drives on to the
  // next one, not back to the one behind it (a mutant that keeps the cursor turns round and drives back to 16 m of it)
  {
    const { bot, ctl, run, hull, clock } = searchScene();
    run(40, (info) => info.searching);
    const wp = () => ctl.debugInfo();
    run(60, (info) => info.wpIndex === 0 && Math.hypot(info.waypointX - bot.state.pos.x, info.waypointZ - bot.state.pos.z) < 10);
    const before = wp();
    const passed = { x: before.waypointX, z: before.waypointZ };
    const took = takeAndLeave(bot, ctl, clock, hull, 2, null);
    const back = wp();
    const behindAtLeave = Math.hypot(passed.x - bot.state.pos.x, passed.z - bot.state.pos.z);
    let closest = behindAtLeave;
    run(8, () => { closest = Math.min(closest, Math.hypot(passed.x - bot.state.pos.x, passed.z - bot.state.pos.z)); return false; });
    ok(before.wpCount > 1 && back.searchLegs === before.searchLegs && back.wpIndex === before.wpIndex + 1 && closest >= behindAtLeave - 0.5,
      `a 2 s Take and Leave over the leg's waypoint ${before.wpIndex} of ${before.wpCount}: the cursor moves past it and the hull drives on (${coasted(took)}; cursor ${before.wpIndex} -> ${back.wpIndex}, ${behindAtLeave.toFixed(1)} m past it at Leave, never nearer than ${closest.toFixed(1)} m after)`);
  }
}

console.log('[9] a displaced search leg waits for the route that took it through a park: its wait moves with the park, or starts at Leave');
// Review round 2's minor: the wait's shift through a park the hull stayed on its way (searchDisplacedAtS += parkS) had no
// receipt. Without it, a park longer than what is left of SEARCH_DISPLACED_MAX_S (150 s) ends the wait on the first tick
// back, and the next search leg writes over the commander's point (U16's own hazard; 137 m short on the review's mutant).
// After a park off its way the wait starts again at Leave; either way the search plans again once the point is driven out.
{
  const displacedHandBack = ({ parkS, far = false }) => {
    const { bot, ctl, run, hull, clock } = searchScene();
    run(40, (info) => info.searching);
    const leg = ctl.debugInfo();
    const point = [bot.state.pos.x + 120, bot.state.pos.z + 90];
    ctl.setWaypoints([point], { loop: false }); // a commander's point takes the leg's list
    const taken = ctl.debugInfo();
    run(5);
    takeAndLeave(bot, ctl, clock, hull, parkS, far ? () => { bot.state.pos.x -= 200; bot.state.speed = 0; } : null);
    run(SIM_DT * 2);
    const first = ctl.debugInfo();
    let replannedShortM = null;
    run(120, (info) => {
      if (info.searchLegs > leg.searchLegs) { replannedShortM = Math.hypot(bot.state.pos.x - point[0], bot.state.pos.z - point[1]); return true; }
      return false;
    });
    return { leg, taken, first, replannedShortM, after: ctl.debugInfo() };
  };
  const label = (r) => `legs ${r.leg.searchLegs} -> ${r.after.searchLegs}, failures ${r.leg.searchFailures} -> ${r.after.searchFailures}, planned again ${r.replannedShortM === null ? 'never' : `${r.replannedShortM.toFixed(1)} m from the point`}`;
  for (const [parkS, far] of [[200, false], [200, true]]) {
    const r = displacedHandBack({ parkS, far });
    ok(r.taken.routeOwner === 'destination' && r.taken.searchDisplaced, `setup: the commander's point displaces the ${r.leg.searchKind} leg (owner ${r.taken.routeOwner})`);
    ok(r.first.searchLegs === r.leg.searchLegs && r.first.routeOwner === 'destination' && r.replannedShortM !== null && r.replannedShortM < 12
      && r.after.searchFailures === r.leg.searchFailures,
      `a ${parkS} s park ${far ? 'in which the watcher drove 200 m off' : 'with nobody at the keys'}: the search waits for the point and plans again only there, counting no failure (${label(r)})`);
  }
}

console.log('[10] a leg that doubles back over its own line keeps its apex: the cursor passes a waypoint only where the hull lies past it');
// Round 4 (E8): hullOnItsWay moved the cursor on while the next stretch lay no farther (`<=`), so a hull handed back on
// a stretch that doubles back over the one before it (equally near both) went to the later one and turned back short of
// the apex, against the rule its doc states (a route that doubles back past the hull is not skipped ahead). On 0edd0e1ab5
// the hull turns back to the waypoint after the apex. Fix-up r1 (both reviews): a strict `<` kept the apex only where the
// two distances are bit-equal, as on the north-south leg; on a diagonal leg each stretch's nearest point is its own
// projection, rounding leaves the way back ~1e-15 m nearer, and on ab8a817159 the -48.3 degree leg still skipped its apex
// (cursor 0 -> 2); fix-up r1 made a 1 mm tie. Fix-up r2: no tie; the cursor passes a waypoint only where the hull has
// gone by it (lies beyond the line square to the stretch through it), whatever the distances (see the second half).
{
  // segmentNearestXZ's arithmetic (ai.ts), to show the diagonal leg's tie is broken by rounding alone
  const clampTo = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const stretchDistance = (px, pz, ax, az, bx, bz) => {
    const dx = bx - ax, dz = bz - az, lengthSq = dx * dx + dz * dz;
    const along = lengthSq > 1e-9 ? clampTo(((px - ax) * dx + (pz - az) * dz) / lengthSq, 0, 1) : 0;
    return detMath.hypot(px - (ax + dx * along), pz - (az + dz * along));
  };
  for (const headingDeg of [0, -48.3]) {
    // the planner fixture lays a leg up to an apex 40 m on and back down the same line 60 m before it turns for the
    // goal's sector; the watcher drives the hull onto the leg's road halfway up to the apex, 0.5 m beside its line
    const heading = headingDeg * Math.PI / 180, ux = Math.sin(heading), uz = Math.cos(heading);
    const START = [0, -380], APEX = [START[0] + ux * 40, START[1] + uz * 40], BACK = [START[0] - ux * 20, START[1] - uz * 20];
    const HANDED = [START[0] + ux * 20 - uz * 0.5, START[1] + uz * 20 + ux * 0.5];
    const upM = stretchDistance(HANDED[0], HANDED[1], START[0], START[1], APEX[0], APEX[1]);
    const downM = stretchDistance(HANDED[0], HANDED[1], APEX[0], APEX[1], BACK[0], BACK[1]);
    const doublingBack = () => [START.slice(), APEX.slice(), BACK.slice(), [40, 150]];
    const { bot, ctl, run, hull, clock } = searchScene(true, doublingBack);
    run(40, (info) => info.searching && info.routeOwner === 'search');
    const before = ctl.debugInfo();
    const away = () => { bot.state.pos.x = HANDED[0]; bot.state.pos.z = HANDED[1]; bot.state.yaw = heading; bot.state.speed = 0; };
    takeAndLeave(bot, ctl, clock, hull, 0.5, away);
    const back = ctl.debugInfo();
    let closest = Infinity;
    run(8, () => { closest = Math.min(closest, Math.hypot(APEX[0] - bot.state.pos.x, APEX[1] - bot.state.pos.z)); return false; });
    const tie = upM === downM ? 'bit-equal' : `the way back ${(upM - downM).toExponential(1)} m nearer by rounding`;
    ok(before.wpCount === 4 && before.wpIndex === 0 && back.searchLegs === before.searchLegs && back.routeOwner === 'search'
      && Math.abs(upM - 0.5) < 1e-9 && (headingDeg === 0 ? upM === downM : downM < upM && upM - downM < 1e-9),
      `setup, heading ${headingDeg} deg: the search leg runs up to the apex and back (${before.wpCount} waypoints, owner ${back.routeOwner}, legs ${before.searchLegs} -> ${back.searchLegs}); both stretches lie 0.5 m off (${tie})`);
    ok(back.wpIndex === 1 && closest < 6.5,
      `heading ${headingDeg} deg, handed back beside both the stretch up to the apex and the one back down it: the cursor goes to the apex, and the hull drives up to it (cursor ${before.wpIndex} -> ${back.wpIndex}, nearest ${closest.toFixed(1)} m of the apex after)`);
  }
  // Fix-up r2 (the completeness review): the way's first stretch runs from where the hull was taken to the waypoint ahead,
  // not along the route's own line. A hull taken on the way up, off the line (it cut START's corner: 3.3 m off at 0
  // degrees, 15 m at -48.3), and handed back further up, 0.5 m beside the line, lies nearer the way back than that first
  // stretch by far more than any tie: on 40405a3ec7 the cursor went 1 -> 2 and the hull turned back 8.6 m short of the
  // apex (the review's probe: 10 of 12 hand-backs).
  for (const headingDeg of [0, -48.3]) {
    const heading = headingDeg * Math.PI / 180, ux = Math.sin(heading), uz = Math.cos(heading), nx = -uz, nz = ux;
    const START = [0, -380], APEX = [START[0] + ux * 40, START[1] + uz * 40], BACK = [START[0] - ux * 20, START[1] - uz * 20];
    const doublingBack = () => [START.slice(), APEX.slice(), BACK.slice(), [40, 150]];
    const { bot, ctl, run, hull, clock } = searchScene(true, doublingBack);
    run(40, (info) => info.searching && info.routeOwner === 'search');
    const along = () => (bot.state.pos.x - START[0]) * ux + (bot.state.pos.z - START[1]) * uz;
    const lateral = () => (bot.state.pos.x - START[0]) * nx + (bot.state.pos.z - START[1]) * nz;
    const upTheLeg = run(40, (info) => info.wpIndex === 1 && along() > 6);
    const before = ctl.debugInfo();
    const takenAt = [along(), lateral()];
    const HANDED = [START[0] + ux * 30 + nx * 0.5, START[1] + uz * 30 + nz * 0.5];
    const away = () => { bot.state.pos.x = HANDED[0]; bot.state.pos.z = HANDED[1]; bot.state.yaw = heading; bot.state.speed = 0; };
    takeAndLeave(bot, ctl, clock, hull, 0.5, away);
    const back = ctl.debugInfo();
    let closest = Infinity;
    run(8, () => { closest = Math.min(closest, Math.hypot(APEX[0] - bot.state.pos.x, APEX[1] - bot.state.pos.z)); return false; });
    ok(upTheLeg && before.wpIndex === 1 && back.searchLegs === before.searchLegs && back.routeOwner === 'search' && Math.abs(takenAt[1]) > 1,
      `setup, heading ${headingDeg} deg: taken on the way up to the apex (cursor ${before.wpIndex}) ${takenAt[0].toFixed(1)} m along, ${Math.abs(takenAt[1]).toFixed(1)} m off the line; handed back 30 m along, 0.5 m beside it (legs ${before.searchLegs} -> ${back.searchLegs})`);
    ok(back.wpIndex === 1 && closest < 6.5,
      `heading ${headingDeg} deg, taken on the way up and handed back short of the apex: the cursor keeps the apex, and the hull drives up to it (cursor ${before.wpIndex} -> ${back.wpIndex}, nearest ${closest.toFixed(1)} m of the apex after)`);
  }
}

/**
 * A causeway (round 4, F5): a 16 m crest with 2 m sides runs up from the floor at z 0 to a 25 m plateau north of z 100,
 * where the enemy stands; the floor bot below the plateau's cliff takes the road up the crest to it. The planner is a
 * fixture that lays that road: the navigation grid's 25 m cells cannot see a crest narrower than a cell, and over this
 * one the real planner sends the floor bot straight up its 2 m side.
 */
function causewayScene() {
  const TOP = 25, HALF = 8, SIDE = 2;
  const plateau = (z) => Math.max(0, Math.min(TOP, (z - 98) / 4 * TOP));
  const crest = (x, z) => {
    if (z < 0 || z > 104) return 0;
    const top = Math.min(TOP, z / 100 * TOP), ax = Math.abs(x);
    return ax <= HALF ? top : ax >= HALF + SIDE ? 0 : top * (HALF + SIDE - ax) / SIDE;
  };
  const getHeightAt = (x, z) => Math.max(plateau(z), crest(x, z));
  const getNormalAt = (x, z) => {
    const e = 0.5, dx = getHeightAt(x + e, z) - getHeightAt(x - e, z), dz = getHeightAt(x, z + e) - getHeightAt(x, z - e);
    const nx = -dx / (2 * e), nz = -dz / (2 * e), length = Math.hypot(nx, 1, nz);
    return { x: nx / length, y: 1 / length, z: nz / length };
  };
  const causeway = { getHeightAt, getNormalAt, getGroundType: () => 'firm' };
  const raycast = (origin, dir, maxDist) => {
    for (let d = 1; d < maxDist; d += 1) {
      if (origin.y + dir.y * d < getHeightAt(origin.x + dir.x * d, origin.z + dir.z * d)) return { dist: d };
    }
    return null;
  };
  const place = (id, team, x, z, yaw) => {
    const t = tank(id, team, x, z, yaw, 'm1a1_abrams_hc');
    t.state.pos.y = getHeightAt(x, z);
    return t;
  };
  const ROAD = Object.freeze([[25, 0], [0, -10], [0, 25], [0, 50], [0, 75], [0, 100], [30, 112]]);
  const floor = place('floor', 'alpha', 40, 70, Math.PI);
  const plateauEnemy = place('plateau', 'bravo', 30, 112, Math.PI);
  const ctl = createAI(floor, { difficulty: 'normal', rng: mulberry32(73), deps: {
    heightField: causeway, raycast, getEnemies: () => [plateauEnemy], getAllies: () => [], getObstacles: () => [],
    spotting: { isSpotted: () => true },
    planRoute: (_start, _goal, options) => (options?.requireGoalLevel ? ROAD : []),
  } });
  let t = 300;
  const run = (seconds, until) => {
    for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
      t += SIM_DT;
      ctl.update(SIM_DT, t);
      updateTank(floor, causeway, SIM_DT, null);
      if (until && until(ctl.debugInfo())) return true;
    }
    return false;
  };
  const moveTo = (x, z) => { floor.state.pos.x = x; floor.state.pos.z = z; floor.state.pos.y = getHeightAt(x, z); floor.state.speed = 0; };
  const hull = (seconds) => {
    for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
      t += SIM_DT;
      updateTank(floor, causeway, SIM_DT, null);
    }
  };
  return { ctl, floor, run, moveTo, hull, clock: () => t, getHeightAt };
}

console.log('[11] a level route ends with no verdict when the watcher drives its hull off the road onto the level below, within reach of it');
// Round 4 (F5): hullOnItsWay measured the hull's way on the ground plan alone, 12 m either side of the route ahead. A
// watcher who drove the hull off the causeway's crest onto the floor beside it, 11 m from the road and 13 m below it,
// left the level route held from the wrong level: on 0edd0e1ab5 the follower drove at the crest's side, and its stuck
// strikes ended the route with the 75 s unbearable verdict (the class round 2 removed). Fix-up r1 (both reviews): the
// first fix read another level as ELEVATION_LEVEL_M (8 m) above or below, the gun's band, so a drop under it still held
// the route from below: taken on the crest past z 14 and left on the floor 5.5 m under the road, the verdict came 21.4 s
// after Leave on ab8a817159 (44.8 s on 0edd0e1ab5). A stretch is the hull's way only where the hull can drive to it: no
// step of the ground from the hull to the stretch's nearest point (every RESUME_STEP_M, 1.5 m) is steeper than its hull
// can climb or hold (terrainTravelCostFactor, the slope law the planner and the local router read).
{
  const crestHandBack = async ({ parkS, offTheSide, takeZ = 45 }) => {
    const { ctl, floor, run, moveTo, hull, clock, getHeightAt } = causewayScene();
    const routing = run(30, (info) => info.levelRouting);
    const onCrest = run(60, () => Math.abs(floor.state.pos.x) < 3 && floor.state.pos.z > takeZ);
    const before = ctl.debugInfo();
    const took = takeAndLeave(floor, ctl, clock, hull, parkS, offTheSide ? () => moveTo(11, floor.state.pos.z + 3) : null);
    const back = ctl.debugInfo();
    const dropM = getHeightAt(0, floor.state.pos.z) - floor.state.pos.y;
    const handBackS = clock();
    let nextRouteAfterS = null;
    // round 5 (U6): the window after Leave runs only until what the case reads is settled, at most 60 s: a verdict (a
    // route held from the wrong level ends in one, 44.8-46.6 s after Leave on 0edd0e1ab5), the road planned again (the
    // drops), or the route's end (on the crest)
    run(60, (info) => {
      if (info.unbearableVerdicts > before.unbearableVerdicts) return true;
      if (info.levelRoutes > before.levelRoutes) { nextRouteAfterS = clock() - handBackS; return true; }
      return !offTheSide && !info.levelRouting;
    });
    return { routing, onCrest, before, back, after: ctl.debugInfo(), nextRouteAfterS, dropM, windowS: clock() - handBackS, ...took };
  };
  const label = (r) => `verdicts ${r.before.unbearableVerdicts} -> ${r.after.unbearableVerdicts}, levelRouting ${r.before.levelRouting} -> ${r.back.levelRouting}, owner ${r.back.routeOwner}, routes ${r.before.levelRoutes} -> ${r.after.levelRoutes}; window ${r.windowS.toFixed(1)} s`;
  // taken high on the crest (a drop over the gun's 8 m band) and low on it (under the band: the review's case)
  for (const [takeZ, low, high] of [[45, 8, Infinity], [14, 4, 8]]) {
    const dropped = await crestHandBack({ parkS: 0.5, offTheSide: true, takeZ });
    ok(dropped.routing && dropped.onCrest && dropped.before.routeOwner === 'level' && dropped.dropM > low && dropped.dropM < high,
      `setup: the floor bot drives its level route up the causeway's crest past z ${takeZ} (owner ${dropped.before.routeOwner}); the watcher leaves it ${dropped.dropM.toFixed(1)} m below the road`);
    ok(!dropped.back.levelRouting && dropped.back.routeOwner !== 'level'
      && dropped.after.unbearableVerdicts === dropped.before.unbearableVerdicts,
      `a 0.5 s Take and Leave in which the watcher drove off the crest onto the floor 11 m beside the road, ${dropped.dropM.toFixed(1)} m below it: the route ends at the hand-back with no verdict, then or before the road is planned again (${label(dropped)})`);
    ok(dropped.nextRouteAfterS !== null && dropped.nextRouteAfterS >= 6 - 0.05,
      `and the lock plans the road again from the floor (${dropped.nextRouteAfterS === null ? 'never' : `${dropped.nextRouteAfterS.toFixed(2)} s`} after the hand-back; ELEVATION_LOCK_S 6 s)`);
  }
  const stayed = await crestHandBack({ parkS: 0.5, offTheSide: false });
  ok(stayed.back.levelRouting && stayed.back.routeOwner === 'level' && stayed.after.unbearableVerdicts === stayed.before.unbearableVerdicts
    && stayed.after.levelRoutes === stayed.before.levelRoutes,
    `a 0.5 s Take and Leave on the crest: the hull coasts on up the road on its level, and the route runs on to its end (coasted ${stayed.coastM.toFixed(1)} m; ${label(stayed)})`);
}

console.log('[12] the elevation lock\'s dwell counts the bot\'s own ticks: it holds through a park that left the hull where it was taken and restarts after a drive off');
// Round 4 (E8): round 3 kept the dwell through every park, a watcher's drive off included, with no receipt either way.
// The dwell counts the bot's own ticks, wherever it drives itself, while its target stays on a level the gun cannot reach
// (updateElevationLock); the watcher's drive is no tick of the bot's, and the bot saw neither that ground nor the target
// from it. So it holds through a park that left the hull where it was taken (within RESUME_ON_WAY_M of that spot, and
// able to drive back to it: hullStoodPut) and restarts otherwise. On 0edd0e1ab5 a drive 30 m along the cliff's foot kept
// 3 s of dwell from the old spot, and the route came 3 s after Leave instead of ELEVATION_LOCK_S. Fix-up r1 (the
// completeness review): the stood-put test's level half had no case; a hull taken at the cliff's foot and left on the
// deck 9 m away on the plan (25 m up the face) is not where it was taken.
{
  // `away`: where the watcher leaves the hull ([x, z], or a function of the spot it was taken on); `rock`: a record the
  // structure support carries the hull on (or a list of them), which it starts on (`onY`: the height it stands at, the
  // first record's top by default) or is left on (`awayY`: the height the watcher leaves it at)
  const dwellHandBack = async (away, from = null, rock = null, { onY = rock && !Array.isArray(rock) ? rock.max[1] : null, awayY = null } = {}) => {
    const { ctl, floor, run, moveTo, hull, clock } = await deckScene(rock ? (Array.isArray(rock) ? rock : [rock]) : null);
    if (from) moveTo(...from);
    if (onY !== null) resetTankVerticalState(floor.state, onY); // the floor bot stands on the rock's top
    run(3); // the floor bot sees the deck target its gun cannot reach: 3 s into the 6 s dwell, no route yet
    const before = ctl.debugInfo();
    const parkedAt = [floor.state.pos.x, floor.state.pos.y, floor.state.pos.z];
    const leave = () => {
      moveTo(...(typeof away === 'function' ? away(parkedAt) : away));
      if (awayY !== null) resetTankVerticalState(floor.state, awayY); // left on a record's top (or over the ground)
    };
    const took = takeAndLeave(floor, ctl, clock, hull, 0.5, away ? leave : null);
    const back = ctl.debugInfo();
    const handedBackAt = [floor.state.pos.x, floor.state.pos.y, floor.state.pos.z];
    const handBackS = clock();
    let decidedAfterS = null;
    // a whole dwell (ELEVATION_LOCK_S, 6 s) and a margin: a dwell that held decides within its rest, one that restarted
    // at 6 s (round 5, U6: 10 s before)
    run(6.5, (info) => {
      if (info.levelRoutes > before.levelRoutes || info.unbearableVerdicts > before.unbearableVerdicts) { decidedAfterS = clock() - handBackS; return true; }
      return false;
    });
    return { before, back, decidedAfterS, parkedAt, handedBackAt, ...took };
  };
  const label = (r) => `dwell ${r.before.elevationLockT} -> ${r.back.elevationLockT} s, the lock decided ${r.decidedAfterS === null ? 'never' : `${r.decidedAfterS.toFixed(2)} s`} after Leave`;
  const held = await dwellHandBack(null);
  ok(held.before.elevationLockT >= 2.5 && held.before.levelRoutes === 0 && held.back.elevationLockT >= 2.5
    && held.decidedAfterS !== null && held.decidedAfterS < 4,
    `a 0.5 s Take and Leave in place: the dwell holds, and the route comes when the rest of it is up (coasted ${held.coastM.toFixed(1)} m; ${label(held)})`);
  const driven = await dwellHandBack([30, 30]);
  ok(driven.back.elevationLockT === 0 && driven.decidedAfterS !== null && driven.decidedAfterS >= 6 - 0.05,
    `a 0.5 s park in which the watcher drove 30 m along the cliff's foot (the deck still out of the gun's reach): the dwell restarts there (${label(driven)}; ELEVATION_LOCK_S 6 s)`);
  // placed 2 m short of the cliff's foot (it backs off a little before the Take), left on the deck past the cliff's
  // edge: near on the plan, on another level
  const climbed = await dwellHandBack([-4, 44], [0, 36]);
  const planM = Math.hypot(-4 - climbed.parkedAt[0], 44 - climbed.parkedAt[2]);
  ok(climbed.before.elevationLockT >= 2.5 && climbed.before.levelRoutes === 0 && planM < 12 && planM > 6,
    `setup: taken at (${climbed.parkedAt.map((v) => v.toFixed(1)).join(', ')}) 3 s into the dwell; handed back on the deck ${planM.toFixed(1)} m away on the plan, 25 m up the cliff`);
  ok(climbed.back.elevationLockT === 0,
    `a 0.5 s park in which the watcher left the hull on the deck above the spot it was taken on: the dwell restarts (${label(climbed)})`);
  // fix-up r2 ([14]'s rule at the other end of the walk): taken and handed back in place on a rock's top 1.5 m up, which
  // the structure support carries the hull on; the spot it was taken on is read from the ground under it, as the hull's
  // own spot is, so the hull stands where it was taken
  const ROCK = Object.freeze({ min: [-10, 0, 18], max: [10, 1.5, 38] });
  const onRock = await dwellHandBack(null, null, ROCK);
  ok(onRock.parkedAt[1] > ROCK.max[1] - 0.3 && onRock.before.elevationLockT >= 2.5 && onRock.before.levelRoutes === 0,
    `setup: the floor bot dwells on a rock's top (taken at ${onRock.parkedAt.map((v) => v.toFixed(1)).join(', ')}, 3 s into the dwell)`);
  ok(onRock.back.elevationLockT >= 2.5 && onRock.decidedAfterS !== null && onRock.decidedAfterS < 4,
    `a 0.5 s Take and Leave in place on the rock: the dwell holds (coasted ${onRock.coastM.toFixed(1)} m; ${label(onRock)})`);
  // round 5 (U5, the round-four correctness review; fix-up r1, the round's two reviews): the walk reads a record's top as
  // the ground under it at both ends, so a park that moved the hull onto, off or between records read only the ground
  // between. The stood-put test now reads each end's floor as the movement carries the hull (hullOnParkLevel): onto a
  // flat top's vertical side it steps no more than HULL_STEP_UP_M (0.55 m: the structure support's floor rule; the
  // review's mount probe drove an M1A1 onto 0.55 m and under 0.6-2.2 m, a wall in game), up a drawn top (a stone's
  // surface) by its slope law, and off any top. On f60d0aa200 each of the five restarts below kept 2.9 s of dwell and
  // the lock decided 3.15 s after Leave; round 5's first fix (a192a5a9a3) read the ride difference as one 1.5 m slope-law
  // step, which kept the 1 m box and the rock-to-rock park and restarted the drawn top and the hull in the air.
  const planOf = (r) => Math.hypot(r.handedBackAt[0] - r.parkedAt[0], r.handedBackAt[2] - r.parkedAt[2]);
  const where = (r) => `taken at (${r.parkedAt.map((v) => v.toFixed(1)).join(', ')}), handed back at (${r.handedBackAt.map((v) => v.toFixed(1)).join(', ')}), ${planOf(r).toFixed(1)} m on the plan`;
  const setupOk = (r, takenY, leftY) => Math.abs(r.parkedAt[1] - takenY) < 0.3 && Math.abs(r.handedBackAt[1] - leftY) < 0.3
    && planOf(r) < 12 && r.before.elevationLockT >= 2.5 && r.before.levelRoutes === 0;
  // the dwell restarts, and the lock decides nothing before a whole dwell from the hand-back (the bot's own drive after
  // Leave may bring the target into the gun's arc first: then it decides nothing in the 6.5 s window)
  const restarted = (r) => r.back.elevationLockT === 0 && (r.decidedAfterS === null || r.decidedAfterS >= 6 - 0.05);
  const kept = (r) => r.back.elevationLockT >= 2.5 && r.decidedAfterS !== null && r.decidedAfterS < 4;
  const HIGH = Object.freeze({ min: [-10, 0, 18], max: [10, 2.2, 38] });
  const offHigh = await dwellHandBack((at) => [-13, at[2]], null, HIGH);
  ok(setupOk(offHigh, 2.2, 0), `setup: the floor bot dwells on a 2.2 m rock's top; the watcher leaves it on the ground beside the rock (${where(offHigh)})`);
  ok(restarted(offHigh),
    `a 0.5 s park that left the hull on the ground below the 2.2 m rock it was taken on: the dwell restarts (${label(offHigh)}; ELEVATION_LOCK_S 6 s)`);
  // a record south of where the bot dwells on the ground (clear of its hull), its top within 12 m of that spot
  const beside = (top, bottom = 0) => Object.freeze({ min: [-40, bottom, 14], max: [-10, top, 26] });
  const ontoHigh = await dwellHandBack((at) => [at[0], 22], [-16, 31], beside(2.2), { onY: null, awayY: 2.2 });
  ok(setupOk(ontoHigh, 0, 2.2), `setup: the floor bot dwells on the ground; the watcher leaves it on a 2.2 m rock's top (${where(ontoHigh)})`);
  ok(restarted(ontoHigh),
    `a 0.5 s park that left the hull on a 2.2 m rock beside the ground it was taken on: the dwell restarts (${label(ontoHigh)}; ELEVATION_LOCK_S 6 s)`);
  // fix-up r1: a hull the watcher pulls up on a rock's edge, its root 0.3 m past it and its rear half on the top (the
  // floor under its root is the ground; under its contact rect, the rock)
  const ontoEdge = await dwellHandBack((at) => [at[0], 26.3], [-16, 31], beside(2.2), { onY: null, awayY: 2.2 });
  ok(setupOk(ontoEdge, 0, 2.2), `setup: the floor bot dwells on the ground; the watcher leaves it on a 2.2 m rock's edge, its root 0.3 m past it (${where(ontoEdge)})`);
  ok(restarted(ontoEdge),
    `a 0.5 s park that left the hull on a 2.2 m rock's edge, its root past it: the dwell restarts (${label(ontoEdge)})`);
  // fix-up r1 (the correctness review, a): a 1 m vertical side is past the step; the slope-law reading held it
  const ontoBox = await dwellHandBack((at) => [at[0], 22], [-16, 31], beside(1), { onY: null, awayY: 1 });
  ok(setupOk(ontoBox, 0, 1), `setup: the floor bot dwells on the ground; the watcher leaves it on a 1 m box's top (${where(ontoBox)})`);
  ok(restarted(ontoBox),
    `a 0.5 s park that left the hull on a 1 m box, whose side is past the 0.55 m step it mounts: the dwell restarts (${label(ontoBox)})`);
  // a step the hull mounts: a record standing 1 m from its foot 0.5 m under the ground, its top 0.5 m over it
  const ontoStep = await dwellHandBack((at) => [at[0], 22], [-16, 31], beside(0.5, -0.5), { onY: null, awayY: 0.5 });
  ok(setupOk(ontoStep, 0, 0.5), `setup: the floor bot dwells on the ground; the watcher leaves it on a record's top 0.5 m over the ground (${where(ontoStep)})`);
  ok(kept(ontoStep), `a 0.5 s park that left the hull on a 0.5 m step it mounts and drives off: the dwell holds (${label(ontoStep)})`);
  // fix-up r1 (the completeness review): from one 2.2 m rock's top onto another's across 3 m of ground
  const rockA = Object.freeze({ min: [-40, 0, 27], max: [-10, 2.2, 37] }), rockB = Object.freeze({ min: [-40, 0, 8], max: [-10, 2.2, 24] });
  const rockToRock = await dwellHandBack((at) => [at[0], 23], [-16, 32], [rockA, rockB], { onY: 2.2, awayY: 2.2 });
  ok(setupOk(rockToRock, 2.2, 2.2), `setup: the floor bot dwells on one 2.2 m rock's top; the watcher leaves it on another's past 3 m of ground (${where(rockToRock)})`);
  ok(restarted(rockToRock),
    `a 0.5 s park from one 2.2 m rock's top onto another's: the dwell restarts (${label(rockToRock)})`);
  // fix-up r1 (the correctness review, b): a drawn top (a formation's cap) rising 0.4 per metre from its edge at z 26,
  // which the hull drives up and back down as terrain (the review's probe: up to 3.1 m and back down to the spot)
  const ramp = setConvexTopShape({ min: [-40, -0.5, 10], max: [-10, 3, 26] }, [-40, 10, -10, 10, -10, 26, -40, 26], [0, 26, 0, -0.4, 0], -0.5, 3);
  const upRamp = await dwellHandBack((at) => [at[0], 22], [-16, 31], ramp, { onY: null, awayY: 1.6 });
  ok(setupOk(upRamp, 0, 1.6), `setup: the floor bot dwells on the ground; the watcher leaves it 1.6 m up a drawn top that rises 0.4 per metre (${where(upRamp)})`);
  ok(kept(upRamp), `a 0.5 s park that left the hull up a drawn top it drives down and back up: the dwell holds (${label(upRamp)})`);
  // fix-up r1 (the completeness review's risk): a hull riding over the ground with no record under it is on that ground
  const aloft = await dwellHandBack((at) => [at[0], at[2]], null, null, { onY: null, awayY: 1.5 });
  ok(Math.abs(aloft.handedBackAt[1] - 1.5) < 0.05 && planOf(aloft) < 12 && aloft.before.elevationLockT >= 2.5,
    `setup: the watcher leaves the hull in the air 1.5 m over the ground it was taken on (${where(aloft)})`);
  ok(kept(aloft), `a 0.5 s park that left the hull in the air over the same ground: the dwell holds (${label(aloft)})`);
}

/**
 * A bridge (round 4, F5, fix-up r2): a deck 60 m long and 12 m wide stands 1.2 m over a flat bank, with 10 m ramps up to
 * its ends. The height field carries the deck's top, as the structure support carries a hull on the kit's deck record,
 * and publishes the deck as the map's bridge deck (terrainSafety.surfaceY reads it). A searching bot's leg runs up the
 * ramp and along the deck's axis (a planner fixture).
 */
function bridgeScene() {
  const DECK = Object.freeze({ x: 0, z: -300, ux: 0, uz: 1, halfLength: 30, halfWidth: 6, deckY: 1.2, approachM: 10 });
  const getHeightAt = (x, z) => {
    const along = Math.abs(z - DECK.z);
    if (Math.abs(x - DECK.x) > DECK.halfWidth) return 0;
    return along <= DECK.halfLength ? DECK.deckY : DECK.deckY * Math.max(0, 1 - (along - DECK.halfLength) / DECK.approachM);
  };
  const getNormalAt = (x, z) => {
    const e = 0.5, dx = getHeightAt(x + e, z) - getHeightAt(x - e, z), dz = getHeightAt(x, z + e) - getHeightAt(x, z - e);
    const nx = -dx / (2 * e), nz = -dz / (2 * e), length = Math.hypot(nx, 1, nz);
    return { x: nx / length, y: 1 / length, z: nz / length };
  };
  const bridged = { getHeightAt, getNormalAt, getGroundType: () => 'firm', bridgeDecks: Object.freeze([DECK]) };
  const bot = tank('bot', 'alpha', 0, -360, 0, 'm1a1_abrams_hc');
  const enemy = tank('enemy', 'bravo', 5, 150, 0, 'm1a1_abrams_hc'); // hidden, far: the search heads north
  const LEG = Object.freeze([[0, -335], [0, -275], [0, -200], [40, 150]]);
  const ctl = createAI(bot, { difficulty: 'normal', rng: mulberry32(9), doctrine: () => CLASSIC_BOT_DOCTRINE, deps: {
    heightField: bridged, raycast: () => null, getEnemies: () => [enemy], getAllies: () => [], getObstacles: () => [],
    spotting: { isSpotted: () => false }, getObjective: () => null, planRoute: () => LEG.map((point) => point.slice()),
  } });
  let t = 1;
  const run = (seconds, until) => {
    for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
      t += SIM_DT;
      ctl.update(SIM_DT, t);
      updateTank(bot, bridged, SIM_DT, null);
      if (until && until(ctl.debugInfo())) return true;
    }
    return false;
  };
  const hull = (seconds) => {
    for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
      t += SIM_DT;
      updateTank(bot, bridged, SIM_DT, null);
    }
  };
  const moveTo = (x, z) => { bot.state.pos.x = x; bot.state.pos.z = z; bot.state.pos.y = getHeightAt(x, z); bot.state.speed = 0; };
  return { DECK, bot, ctl, run, hull, moveTo, clock: () => t };
}

console.log('[13] a hull handed back beside a bridge deck, outside its parapets, is off the way along the deck, whatever the step');
// Round 4 fix-up r2 (the completeness review): hullReaches read a deck only as a height step (terrainSafety.surfaceY), so
// a hull left on the bank beside a deck that stands within the hull's step limit over the bank (1.2 m here; blackglass's
// decks at (-65, 100) and (70, 100) stand 1.19-1.90 m over the ground beside them) read the deck as its way, and its leg
// held: the follower then drives at the parapet, which the planner never routes through (botRoutePlanner
// bridgeSideEdges: "Bridge parapets are not entrances"). On 40405a3ec7 and 0edd0e1ab5 both hand-backs beside the deck
// hold the leg. A deck's side between its ends is now a wall to the walk, as it is to the planner; the deck and its ends
// stay open.
{
  const deckHandBack = (offX, aheadM) => {
    const { DECK, bot, ctl, run, hull, moveTo, clock } = bridgeScene();
    const searched = run(40, (info) => info.searching && info.routeOwner === 'search');
    const onDeck = run(40, () => bot.state.pos.z > DECK.z - DECK.halfLength + 6 && bot.state.pos.y > DECK.deckY - 0.3);
    const before = ctl.debugInfo();
    const takenZ = bot.state.pos.z;
    takeAndLeave(bot, ctl, clock, hull, 0.5, () => moveTo(offX, takenZ + aheadM));
    const handedBack = [bot.state.pos.x, bot.state.pos.y, bot.state.pos.z];
    run(SIM_DT * 2);
    return { DECK, searched, onDeck, before, first: ctl.debugInfo(), takenZ, handedBack };
  };
  const label = (r) => `legs ${r.before.searchLegs} -> ${r.first.searchLegs}, failures ${r.before.searchFailures} -> ${r.first.searchFailures}, owner ${r.first.routeOwner}`;
  for (const outsideM of [1.5, 3]) {
    const r = deckHandBack(6 + outsideM, 10);
    ok(r.searched && r.onDeck && r.before.routeOwner === 'search' && r.before.wpIndex === 1,
      `setup: the bot drives its search leg along the deck (taken on it ${(r.takenZ - r.DECK.z).toFixed(1)} m from its middle, cursor ${r.before.wpIndex}); handed back on the bank at (${r.handedBack.map((v) => v.toFixed(1)).join(', ')}), ${outsideM} m outside the deck's side, ${(r.DECK.deckY - r.handedBack[1]).toFixed(1)} m under its top`);
    ok(r.first.searchLegs === r.before.searchLegs + 1 && r.first.searchFailures === r.before.searchFailures,
      `a 0.5 s Take and Leave in which the watcher left the hull ${outsideM} m outside the deck's side, within reach of its leg on the plan: the leg ends and is planned again from here, counting no failure (${label(r)})`);
  }
  const onIt = deckHandBack(1.5, 10);
  ok(onIt.first.searchLegs === onIt.before.searchLegs && onIt.first.searchLegsDisplaced === onIt.before.searchLegsDisplaced
    && onIt.first.routeOwner === 'search',
    `a 0.5 s Take and Leave that left the hull on the deck, 1.5 m beside its axis: the leg runs on (${label(onIt)})`);
}

console.log('[14] a hull handed back on a record\'s top beside its leg (a rock, rubble, a roof) is read from the ground under it, as the follower reads it');
// Round 4 fix-up r2 (the completeness review): hullReaches walked from the hull's own height, so a hull standing on a
// record the height field does not carry (a rock's tier, rubble, a wreck, a roof: structureSupport) read the record's
// edge as a drop steeper than it can hold (1.34 m per 1.5 m step for an M1A1 on firm ground, 0.79 m on soft), and its leg
// ended at the hand-back. The follower's edge safety (corridorSafe) and the planner read the ground the field carries,
// not records: the follower drives off a rock as off flat ground. On 40405a3ec7 a Take and Leave that left the hull on a
// rock's top 1.5 m up, 5 m beside its leg, ended the leg (0edd0e1ab5 held it). The walk now starts and ends on the ground
// under a hull that rides above it, and at the hull's own height only where it stands below the ground the field
// carries (under a deck).
{
  const ROCK_TOP = 1.5;
  const { bot, ctl, run, hull, clock } = searchScene();
  run(40, (info) => info.searching);
  run(10);
  const before = ctl.debugInfo();
  let settledY = NaN;
  // the watcher drove the hull onto a rock 5 m to its right: a 10 m block ROCK_TOP high, which the structure support
  // carries the hull on (the match steps every hull through it)
  const ontoTheRock = () => {
    const cx = bot.state.pos.x + Math.cos(bot.state.yaw) * 5, cz = bot.state.pos.z - Math.sin(bot.state.yaw) * 5;
    const rock = { min: [cx - 5, 0, cz - 5], max: [cx + 5, ROCK_TOP, cz + 5] };
    const support = createStructureSupportField(field, { getObstacles: () => [rock] });
    const pose = createHullSupportPose();
    bot.state.pos.x = cx; bot.state.pos.z = cz; bot.state.speed = 0;
    resetTankVerticalState(bot.state, ROCK_TOP);
    for (let i = 0; i < 30; i++) {
      support.beginHull(bot.state.pos.x, bot.state.pos.z, bot.state.pos.y, hullSupportPose(bot.spec, bot.state, pose));
      updateTank(bot, support, SIM_DT, null);
    }
    settledY = bot.state.pos.y;
  };
  const took = takeAndLeave(bot, ctl, clock, hull, 0.5, ontoTheRock);
  run(SIM_DT * 2);
  const first = ctl.debugInfo();
  ok(before.searching && before.routeOwner === 'search' && Math.abs(settledY - ROCK_TOP) < 0.3,
    `setup: taken on its search leg at ${took.speedAtTake.toFixed(1)} m/s; the watcher leaves it on a rock's top 5 m to its right, ${settledY.toFixed(2)} m over the ground`);
  ok(first.searchLegs === before.searchLegs && first.searchLegsDisplaced === before.searchLegsDisplaced && first.routeOwner === 'search',
    `a 0.5 s Take and Leave that left the hull on the rock beside its leg: the leg runs on (legs ${before.searchLegs} -> ${first.searchLegs}, displaced ${before.searchLegsDisplaced} -> ${first.searchLegsDisplaced}, owner ${first.routeOwner})`);
}

if (failures) { console.error(`ai.watchResume.selftest: ${failures} failure(s)`); process.exit(1); }
console.log('ai.watchResume.selftest: a parked brain resumes from the hull as it stands');
