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
import { Vector3 } from 'three';
import '../vehicles/fleetFactory.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createTankState, updateTank, SIM_DT } from '../sim/movement.ts';
import { createAI, mulberry32 } from './ai.ts';
import { leaveWatchSeat, openWatchSeats, prepareWatchSeat, takeWatchSeat } from './watchSeat.ts';

let failures = 0;
const ok = (cond, label) => { if (cond) console.log(`  ok  ${label}`); else { failures++; console.error(`FAIL  ${label}`); } };
const field = { getHeightAt: () => 0, getNormalAt: () => ({ x: 0, y: 1, z: 0 }), getGroundType: () => 'firm' };
function tank(id, team, x, z, yaw = 0) {
  const spec = getSpec('t90am');
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

if (failures) { console.error(`ai.watchResume.selftest: ${failures} failure(s)`); process.exit(1); }
console.log('ai.watchResume.selftest: a parked brain resumes from the hull as it stands');
