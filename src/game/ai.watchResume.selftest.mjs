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
import { Vector3 } from 'three';
import '../vehicles/fleetFactory.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createTankState, updateTank, SIM_DT } from '../sim/movement.ts';
import { CLASSIC_BOT_DOCTRINE } from '../sim/matchRuleset.ts';
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

/** ai.levels' deck (as ai.routeOwner [3]-[4]): a 25 m cliff north of z 40, a ramp up it at x 100..130; a floor bot under a deck enemy. */
async function deckScene() {
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
    heightField: deckField, raycast, getEnemies: () => [deck], getAllies: () => [], getObstacles: () => [],
    spotting: { isSpotted: () => true },
    planRoute: (start, goal, options) => planBotRoute({ start, goal, navigation, rng: routeRng, role: 'brawler',
      spec: floor.spec, useRoleDetour: false, requireGoalLevel: options?.requireGoalLevel === true }),
  } });
  let t = 300;
  const run = (seconds, until) => {
    for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
      t += SIM_DT;
      ctl.update(SIM_DT, t);
      updateTank(floor, deckField, SIM_DT, null);
      if (until && until(ctl.debugInfo())) return true;
    }
    return false;
  };
  const moveTo = (x, z) => { floor.state.pos.x = x; floor.state.pos.z = z; floor.state.pos.y = getHeightAt(x, z); floor.state.speed = 0; };
  // the taken hull: stepped on the input it has (the controller is parked and writes nothing)
  const hull = (seconds) => {
    for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
      t += SIM_DT;
      updateTank(floor, deckField, SIM_DT, null);
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
function searchScene(hidden = true) {
  const bot = tank('bot', 'alpha', 0, -450, 0, 'm1a1_abrams_hc');
  const enemy = tank('enemy', 'bravo', 5, 150, 0, 'm1a1_abrams_hc'); // hidden, far: the 25 s search heads for its sector
  const ctl = createAI(bot, { difficulty: 'normal', rng: mulberry32(9), doctrine: () => CLASSIC_BOT_DOCTRINE, deps: {
    heightField: field, raycast: () => null, getEnemies: () => [enemy], getAllies: () => [], getObstacles: () => [],
    spotting: { isSpotted: () => !hidden }, getObjective: () => null,
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

if (failures) { console.error(`ai.watchResume.selftest: ${failures} failure(s)`); process.exit(1); }
console.log('ai.watchResume.selftest: a parked brain resumes from the hull as it stands');
