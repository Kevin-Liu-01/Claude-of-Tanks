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
// Round 5 (U5, the round-four correctness review; fix-up r1, the round's two reviews): that reading at both ends of the
// stood-put walk let a park onto, off or between records keep the elevation lock's dwell; [12] the test now reads each
// end's floor as the movement carries the hull (a flat top's side past the 0.55 m step is a wall, a drawn top is driven
// as terrain): a park off or onto a 2.2 m rock, onto a 1 m box or a rock's edge, or from one rock's top onto another's
// restarts it, and one onto a 0.5 m step, up a drawn top, or into the air over the same ground keeps it. Round 6 (V3,
// the review of that fix-up): [12] read the records only through the controller's last obstacle list, not the match's
// obstacle query the solo battle gives every bot (a mutant that finds no solid through the query passed); the deck
// scene now gives both, as the match does, and a park off a 1 m box (the correctness review's example) restarts.
// Cost (round 5, U6; the default tier): [11] stepped three fixed 60 s windows after Leave, and now runs each only until
// what it reads is settled (a verdict, the road planned again, the route's end), and [12]'s window is a whole dwell and a
// margin. Round 6 (V4): the file read 7.8-10 s of user CPU (round three's 5.9 s). Each rule keeps a case here but two
// (below), and the cases that repeat one at another length, height or branch run in
// src/game/ai.watchResumeLevels.selftest.mjs (MANUAL bots): [7]'s 30 s park off the way and its toggles ([8]'s toggles
// pin a short Take and Leave of a moving bot here), [11]'s drop over the gun's band and its toggle on the crest, and [12]'s
// 2.2 m rock (off and onto), its 1 m box read from the last obstacle list, its tiered rock taken on its top and a
// formation's caps. Fix-up r1 (both reviews): the split had left two rules no case here, [11]'s slope walk ([13] pins only
// a deck's side) and [12]'s record walk and step; [11]'s drop under the band and [12]'s off-box, edge, step, rock-to-rock
// and drawn-top hand-backs came back, and a hand-back under an overpass pins the rule that two ends on their ground are
// one level, which no case decided. Fix-up r2 (both second reviews): [12]'s records were plain boxes and single drawn
// tops, so a walk that skipped every compound record (the game's tiered stones, capped formations and buildings) or read
// a building's band over its roof passed, and the step was pinned only between 0.5 m and 1 m; a tiered rock, a roof over
// its building's band and a 0.6 m step came in, and the hull in the air (MANUAL's only case of that rule) came back. The
// fixtures the two files share are ai.watchResume.test-support.mjs, on the authority's fleet (the two specs' combat
// anatomy) for the player's fleet factory, with one navigation grid for every deck scene; [5], [6] and the search scenes'
// waits no longer read the controller's snapshot (debugInfo, the costliest call) on ticks whose answer nothing reads. The
// process's own user CPU, three alternating rounds at load 46-70: b03868e697's file 8.5-8.8 s; this file 6.4-6.8 s
// against 0813e81d5b's 6.0-6.1 s, [12]'s fifteen hand-backs 1.3-1.4 s of it; ai.watchResumeLevels 3.9-4.2 s
// (0813e81d5b's 3.4-3.8 s); the import 1.5-1.7 s of each. Every mutant of the round's matrix (40) but two fails this
// file, and those two fail ai.watchResumeLevels: the obstacle list's branch (a fixture's path: every solo bot has the
// match's query) and the walk's last point under a deck the field publishes (a spot hullReaches reads stood put only
// within one 1.5 m point of the deck's end) (round 6 bots NOTES, fix-up r2).
import { getSpec } from '../vehicles/specs.ts';
import { resetTankVerticalState, updateTank, SIM_DT } from '../sim/movement.ts';
import { CLASSIC_BOT_DOCTRINE } from '../sim/matchRuleset.ts';
import * as detMath from '../sim/detMath.ts';
import { createHullSupportPose, createStructureSupportField, hullSupportPose } from '../sim/structureSupport.ts';
import { setConvexTopShape } from '../world/collision.ts';
import { createAI, mulberry32 } from './ai.ts';
import { leaveWatchSeat, openWatchSeats, prepareWatchSeat, takeWatchSeat } from './watchSeat.ts';
import {
  beside, coasted, column, compoundRecord, crestHandBack, crestLabel, dwellHandBack, dwellLabel, kept, levelRouteHandBack,
  levelRouteLabel, planOf, restarted, setupOk, tank, takeAndLeave, where,
} from './ai.watchResume.test-support.mjs';

let failures = 0;
const ok = (cond, label) => { if (cond) console.log(`  ok  ${label}`); else { failures++; console.error(`FAIL  ${label}`); } };
const field = { getHeightAt: () => 0, getNormalAt: () => ({ x: 0, y: 1, z: 0 }), getGroundType: () => 'firm' };

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

/**
 * A watched battle whose seat and bot are brains; with `traced`, `trace` records the bot's inputs and decisions tick by
 * tick ([4]; round 6 V4: the snapshot each tick, debugInfo, was the receipt's costliest call, and [5] and [6] read none).
 */
function tracedBattle({ gunHeld = false, traced = false } = {}) {
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
        if (traced) {
          const d = bot.aiCtl.debugInfo(), input = bot.input;
          trace.push([input.throttle, input.steer, input.fire, input.aimPoint.x, input.aimPoint.z, d.mode, d.targetId,
            d.reaction, d.missStreak, d.pressing, d.driveOwner].join('|'));
        }
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
    const run = tracedBattle({ traced: true });
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

console.log('[7] a level route ends with no verdict at a hand-back that finds the hull off its way, and holds while it is on it');
// Reproduced on dbdbfc2ad5 and 50197fdf43 (the review's probe): the route's deadline (its length at 5 m/s plus 25 s, on
// match time) was neither moved by the park nor ended by resume(), so a park or a dead stretch past it gave the live
// deck target up as unbearable for 75 s on the first tick back, and a hull handed back 270 m off drove the last route
// on from there. The route now holds through a park that left the hull on its way, its deadline moved by the park, and
// otherwise ends with no verdict; the elevation lock re-arms from the hull as it stands, ELEVATION_LOCK_S later.
// Round 3 (A2): the taken hull coasts on from route speed (14 m/s here); on 92f415e879 a 0.5 s toggle (6.5 m) and a 2 s
// one (20 m) ended the route, and the next one came 6 s after Leave. Round 6 (V4): the 30 s park off the way and the
// 0.1 s, 0.5 s and 2 s toggles run in ai.watchResumeLevels (MANUAL bots); the 200 s park here coasts the hull on along
// the route from the same speed, and [8]'s toggles pin a short Take and Leave of a moving bot.
{
  const label = levelRouteLabel;
  const held = await levelRouteHandBack({ parkS: 200 });
  ok(held.routing && held.before.routeOwner === 'level', `the floor bot drives a level route to the deck (owner ${held.before.routeOwner})`);
  ok(held.after.unbearableVerdicts === held.before.unbearableVerdicts && held.back.levelRouting && held.oldRouteTicks > 400,
    `a 200 s park with nobody at the keys: the route runs on, its deadline moved by the park (${coasted(held)}; ${label(held)}; ${(held.oldRouteTicks * SIM_DT).toFixed(1)} s driven after)`);
  const far = await levelRouteHandBack({ parkS: 200, far: true });
  ok(far.after.unbearableVerdicts === far.before.unbearableVerdicts && !far.back.levelRouting && far.back.routeOwner !== 'level'
    && far.oldRouteTicks === 0,
    `a 200 s park in which the watcher drove 270 m off: the route ends with no verdict and is not driven on from there (${label(far)}; ${(far.oldRouteTicks * SIM_DT).toFixed(1)} s of it after)`);
  const revived = await levelRouteHandBack({ parkS: 200, revive: true });
  ok(revived.after.unbearableVerdicts === revived.before.unbearableVerdicts && !revived.back.levelRouting
    && revived.back.routeOwner !== 'level' && revived.oldRouteTicks === 0,
    `a resume with no park (a revive) 200 s on: the last life's route ends with no verdict (${label(revived)})`);
  ok(revived.nextRouteAfterS !== null && revived.nextRouteAfterS >= 6 - 0.05,
    `and the lock re-arms from the hull as it stands: a new route ${revived.nextRouteAfterS === null ? 'never' : `${revived.nextRouteAfterS.toFixed(2)} s`} after the hand-back (ELEVATION_LOCK_S 6 s)`);
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
      // a wait that reads only the hull (no parameter) takes no snapshot: debugInfo only reads (round 6 V4, fix-up r1)
      if (until && until(until.length ? ctl.debugInfo() : null)) return true;
    }
    return false;
  };
  const hull = (seconds) => {
    for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
      t += SIM_DT;
      updateTank(bot, field, SIM_DT, null);
    }
  };
  return { bot, ctl, run, hull, clock: () => t, skip: (seconds) => { t += seconds; }, toSearch: searchStart(ctl, run) };
}
/**
 * `run(40, until)` for a scene's wait for its search to start (25 s of silence, the doctrine's), reading the snapshot
 * (debugInfo) only from 20 s on (round 6 V4: the snapshot each tick was the receipt's costliest call). Every wait's
 * condition needs a search under way, and a search is under way only after a leg begins (startSearchLeg, the one writer of
 * `searching`, counts it in searchLegs, which never falls); so with no leg begun by 20 s the condition held on no tick
 * before, and the same tick ends both waits. A leg begun in the first 20 s, still under way or not, fails the setup
 * (fix-up r1, both reviews: the guard read the condition at 20 s alone).
 */
function searchStart(ctl, run) {
  return (until) => {
    run(20);
    const at20 = ctl.debugInfo();
    if (at20.searchLegs !== 0 || at20.searching) throw new Error(`setup: a search leg began within 20 s (legs ${at20.searchLegs})`);
    return run(20, until);
  };
}
{
  const searchHandBack = ({ parkS, far = false, revive = false }) => {
    const { bot, ctl, run, hull, clock, skip, toSearch } = searchScene();
    const searched = toSearch((info) => info.searching);
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
    const { bot, ctl, run, hull, clock, toSearch } = searchScene();
    toSearch((info) => info.searching);
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
    const { bot, ctl, run, hull, clock, toSearch } = searchScene();
    toSearch((info) => info.searching);
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
    const { bot, ctl, run, hull, clock, toSearch } = searchScene(true, doublingBack);
    toSearch((info) => info.searching && info.routeOwner === 'search');
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
    const { bot, ctl, run, hull, clock, toSearch } = searchScene(true, doublingBack);
    toSearch((info) => info.searching && info.routeOwner === 'search');
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

console.log('[11] a level route ends with no verdict when the watcher drives its hull off the road onto the level below, within reach of it');
// Round 4 (F5): hullOnItsWay measured the hull's way on the ground plan alone, 12 m either side of the route ahead. A
// watcher who drove the hull off the causeway's crest onto the floor beside it, 11 m from the road and 13 m below it,
// left the level route held from the wrong level: on 0edd0e1ab5 the follower drove at the crest's side, and its stuck
// strikes ended the route with the 75 s unbearable verdict (the class round 2 removed). Fix-up r1 (both reviews): the
// first fix read another level as ELEVATION_LEVEL_M (8 m) above or below, the gun's band, so a drop under it still held
// the route from below: taken on the crest past z 14 and left on the floor 5.5 m under the road, the verdict came 21.4 s
// after Leave on ab8a817159 (44.8 s on 0edd0e1ab5). A stretch is the hull's way only where the hull can drive to it: no
// step of the ground from the hull to the stretch's nearest point (every RESUME_STEP_M, 1.5 m) is steeper than its hull
// can climb or hold (terrainTravelCostFactor, the slope law the planner and the local router read). Round 6 (V4, fix-up
// r1): this drop is the default check of that walk ([13] pins only a deck's side: a way test that keeps the side and
// drops the slope walk held this route); the drop over the band and a toggle on the crest run in ai.watchResumeLevels.
{
  const dropped = await crestHandBack({ parkS: 0.5, offTheSide: true, takeZ: 14 });
  ok(dropped.routing && dropped.onCrest && dropped.before.routeOwner === 'level' && dropped.dropM > 4 && dropped.dropM < 8,
    `setup: the floor bot drives its level route up the causeway's crest past z 14 (owner ${dropped.before.routeOwner}); the watcher leaves it ${dropped.dropM.toFixed(1)} m below the road`);
  ok(!dropped.back.levelRouting && dropped.back.routeOwner !== 'level'
    && dropped.after.unbearableVerdicts === dropped.before.unbearableVerdicts,
    `a 0.5 s Take and Leave in which the watcher drove off the crest onto the floor 11 m beside the road, ${dropped.dropM.toFixed(1)} m below it: the route ends at the hand-back with no verdict, then or before the road is planned again (${crestLabel(dropped)})`);
  ok(dropped.nextRouteAfterS !== null && dropped.nextRouteAfterS >= 6 - 0.05,
    `and the lock plans the road again from the floor (${dropped.nextRouteAfterS === null ? 'never' : `${dropped.nextRouteAfterS.toFixed(2)} s`} after the hand-back; ELEVATION_LOCK_S 6 s)`);
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
  const label = dwellLabel;
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
  // round's correctness review drove an M1A1 onto 0.55 m and under 0.6-2.2 m, a wall in game), up a drawn top (a stone's
  // surface) by its slope law, and off any top; each end's floor is read under its contact rect where its root is past a
  // record's edge, and the walk between them runs both ways record by record. On f60d0aa200 each restart below kept 2.9 s
  // of dwell and the lock decided 3.15 s after Leave; round 5's first fix (a192a5a9a3) read the ride difference as one
  // 1.5 m slope-law step, which kept the 1 m boxes and the rock-to-rock park and restarted the drawn top and the hull in
  // the air. The records are read through the match's obstacle query (round 6 V3). Round 6 (V4, fix-ups r1 and r2): a
  // case of each part of the rule but one runs here, compound records included; that one (the walk's last point under a
  // deck) and the same parts at another height, direction or branch (a 2.2 m rock, off and onto; the 1 m box from the
  // last obstacle list; off a tiered rock; a formation's caps) run in ai.watchResumeLevels (MANUAL bots).
  const ontoBox = await dwellHandBack((at) => [at[0], 22], [-16, 31], beside(1), { onY: null, awayY: 1 });
  ok(setupOk(ontoBox, 0, 1), `setup: the floor bot dwells on the ground; the watcher leaves it on a 1 m box's top (${where(ontoBox)})`);
  ok(restarted(ontoBox),
    `a 0.5 s park that left the hull on a 1 m box, whose side is past the 0.55 m step it mounts: the dwell restarts (${label(ontoBox)})`);
  // round 6 (V3; the correctness review's example for (a)): taken on a 1 m box's top, left on the ground beside it (the
  // hull drives off the box, never back up its side: the walk back to the spot it was taken on); kept at f60d0aa200 and
  // at a192a5a9a3 (1 m over one 1.5 m step: 0.67)
  const LOW = Object.freeze({ min: [-10, 0, 18], max: [10, 1, 38] });
  const offBox = await dwellHandBack((at) => [-13, at[2]], null, LOW);
  ok(setupOk(offBox, 1, 0), `setup: the floor bot dwells on a 1 m box's top; the watcher leaves it on the ground beside the box (${where(offBox)})`);
  ok(restarted(offBox),
    `a 0.5 s park that left the hull on the ground below the 1 m box it was taken on: the dwell restarts (${label(offBox)})`);
  // fix-up r1: a hull the watcher pulls up on a rock's edge, its root 0.3 m past it and its rear half on the top (the
  // floor under its root is the ground; under its contact rect, the rock)
  const ontoEdge = await dwellHandBack((at) => [at[0], 26.3], [-16, 31], beside(2.2), { onY: null, awayY: 2.2 });
  ok(setupOk(ontoEdge, 0, 2.2), `setup: the floor bot dwells on the ground; the watcher leaves it on a 2.2 m rock's edge, its root 0.3 m past it (${where(ontoEdge)})`);
  ok(restarted(ontoEdge),
    `a 0.5 s park that left the hull on a 2.2 m rock's edge, its root past it: the dwell restarts (${label(ontoEdge)})`);
  // a step the hull mounts: a record standing 1 m from its foot 0.5 m under the ground, its top 0.5 m over it
  const ontoStep = await dwellHandBack((at) => [at[0], 22], [-16, 31], beside(0.5, -0.5), { onY: null, awayY: 0.5 });
  ok(setupOk(ontoStep, 0, 0.5), `setup: the floor bot dwells on the ground; the watcher leaves it on a record's top 0.5 m over the ground (${where(ontoStep)})`);
  ok(kept(ontoStep), `a 0.5 s park that left the hull on a 0.5 m step it mounts and drives off: the dwell holds (${label(ontoStep)})`);
  // fix-up r2 (the correctness review r2): the step's bound from above, 0.05 m past HULL_STEP_UP_M as ontoStep is 0.05 m
  // under it; a floorReached that read a taller step (HULL_STANDABLE_HEIGHT_M's 0.9 m, imported beside it) kept this dwell
  const ontoTallStep = await dwellHandBack((at) => [at[0], 22], [-16, 31], beside(0.6, -0.5), { onY: null, awayY: 0.6 });
  ok(setupOk(ontoTallStep, 0, 0.6), `setup: the floor bot dwells on the ground; the watcher leaves it on a record's top 0.6 m over the ground (${where(ontoTallStep)})`);
  ok(restarted(ontoTallStep),
    `a 0.5 s park that left the hull on a 0.6 m step, past the 0.55 m it mounts: the dwell restarts (${label(ontoTallStep)})`);
  // fix-up r1 (the completeness review, round 5's major): from one 2.2 m rock's top onto another's across 3 m of ground
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
  // fix-up r2 (the completeness review r2; round five's correctness review (a), "a rock's lower tiers"): the game's tiered
  // stones and capless formations are compound records, each tier a column from the record's floor to its own top
  // (rockCollision.ts tierParts), read through recordFloorAt's compound branch; taken on the ground, left on a two-tier
  // rock's 1.3 m top past its 0.7 m first tier. Kept at f60d0aa200 (the ground between) and by a walk that skips every
  // compound record (both ends then read the ground)
  const tiers = compoundRecord([column(-40, 14, -8, 26, 0.7), column(-30, 17, -12, 25, 1.3)], 0, 1.3);
  const ontoTiers = await dwellHandBack((at) => [at[0], 22], [-16, 31], tiers, { onY: null, awayY: 1.3 });
  ok(setupOk(ontoTiers, 0, 1.3), `setup: the floor bot dwells on the ground; the watcher leaves it on a two-tier rock's 1.3 m top, its first tier 0.7 m (${where(ontoTiers)})`);
  ok(restarted(ontoTiers),
    `a 0.5 s park that left the hull on a tiered rock's top past its 0.7 m first tier: the dwell restarts (${label(ontoTiers)})`);
  // fix-up r2 (the completeness review r2): a building's ground-contact band (its walls' footprint up to their highest
  // point, 2 m) under its roof, a deck part with a drawn top rising 0.4 per metre from the ground at its eaves (z 26) to
  // 3 m: under the roof the band's top is the roof's (collision.ts bandRoofTopAt, as the structure support reads it).
  // Left 1.6 m up the roof, 0.4 m under the band's top: a walk that read the band's own top there, or the roof as a flat
  // top, restarted this dwell
  const roofed = compoundRecord([column(-40, 10, -10, 26, 2, -0.5), column(-40, 10, -10, 26, 3, 0.1, [0, 26, 0, -0.4, 0])],
    -0.5, 3);
  const upRoof = await dwellHandBack((at) => [at[0], 22], [-16, 31], roofed, { onY: null, awayY: 1.6 });
  ok(setupOk(upRoof, 0, 1.6), `setup: the floor bot dwells on the ground; the watcher leaves it 1.6 m up a building's roof, under its band's 2 m top (${where(upRoof)})`);
  ok(kept(upRoof), `a 0.5 s park that left the hull up a roof it drives down and back up, over its building's band: the dwell holds (${label(upRoof)})`);
  // fix-up r1 (the completeness review: two ends on their ground are one level, and that had no case): taken on the
  // ground, left on the ground 11.5 m to its side under an overpass, a deck 2.6-3.6 m up (over the hull), with the deck's
  // drawn ramp (0.6 per metre) between the two spots; the walk along the line climbs the ramp onto the deck (without the
  // shortcut the dwell restarts), but the hull stands on the ground under it, the level of the spot it was taken on
  const overRamp = setConvexTopShape({ min: [-25.3, -0.5, 27], max: [-18.7, 3.6, 37.4] },
    [-25.3, 27, -18.7, 27, -18.7, 37.4, -25.3, 37.4], [-18.7, 0, -0.6, 0, 0], -0.5, 3.6);
  const overDeck = Object.freeze({ min: [-40, 2.6, 27], max: [-25.3, 3.6, 37.4] });
  const underDeck = await dwellHandBack((at) => [at[0] - 11.5, at[2]], [-16, 31], [overRamp, overDeck], { onY: null });
  const [leftX, , leftZ] = underDeck.handedBackAt, [takenX] = underDeck.parkedAt;
  ok(setupOk(underDeck, 0, 0) && takenX > overRamp.max[0] && leftX < overDeck.max[0] && leftX > overDeck.min[0]
    && leftZ > overDeck.min[2] && leftZ < overDeck.max[2],
    `setup: the floor bot dwells on the ground east of a ramp; the watcher leaves it on the ground under the deck the ramp climbs to (${where(underDeck)})`);
  ok(kept(underDeck),
    `a 0.5 s park that left the hull on the ground under an overpass, its ramp between: the dwell holds (${label(underDeck)})`);
  // fix-up r1 (the completeness review's risk; fix-up r2, the completeness review r2: from ai.watchResumeLevels, its only
  // case): a hull riding over the ground with no record under it is on that ground (endFloor reads the floor under it as
  // the ground: no record within its step at its root or its contact rect's edges), and the walk between two ends on the
  // ground reads no record here either; a walk that read a hull past its step over no record at its own height restarted it
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
      // a wait that reads only the hull (no parameter) takes no snapshot: debugInfo only reads (round 6 V4, fix-up r1)
      if (until && until(until.length ? ctl.debugInfo() : null)) return true;
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
  return { DECK, bot, ctl, run, hull, moveTo, clock: () => t, toSearch: searchStart(ctl, run) };
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
    const { DECK, bot, ctl, run, hull, moveTo, clock, toSearch } = bridgeScene();
    const searched = toSearch((info) => info.searching && info.routeOwner === 'search');
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
  const { bot, ctl, run, hull, clock, toSearch } = searchScene();
  toSearch((info) => info.searching);
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
