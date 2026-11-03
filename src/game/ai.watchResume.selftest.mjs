// 2026-11-02 audit M7: a bot handed its hull back after Watch mode's Take control resumes from the hull as it stands.
// watchSeat.ts parks the controller while the watcher drives and gives it back on Leave; the controller was not
// stepped in between, and what it measures from one tick to the next read the whole stretch as one tick of its own.
// Reproduced on the lane base: the hull the watcher lost booked as one burst and the bot fell back on its first tick
// back, and the watcher's last shot counted on the bot's new spot. Pins: Leave (and the battle's opening hand-off)
// calls the controller's resume() with the battle's clock; after it no fallback, no shot of the watcher's, no progress
// spike, no stalemate push or search leg from the park's silence, and the bot fights on (it keeps its target, and real
// damage after the resume still counts).
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
  const calls = [];
  const fake = (id) => ({ id, resume: (timeS) => calls.push(`${id}@${timeS}`) });
  const seat = tank('seat', 'alpha', 0, 0), bot = tank('bot', 'alpha', 10, 0);
  seat.aiCtl = fake('seat'); bot.aiCtl = fake('bot');
  const game = { player: seat, tanks: [seat, bot], ruleset: { watch: { takeControl: true } }, watch: null, timeS: 3 };
  prepareWatchSeat(game, seat);
  ok(calls.length === 0, 'parking resumes nothing');
  openWatchSeats(game);
  ok(calls.join() === 'seat@3', 'the battle opening hands the human seat to its brain, resumed at the battle\'s clock');
  takeWatchSeat(game, bot);
  game.timeS = 17;
  leaveWatchSeat(game);
  ok(calls.join() === 'seat@3,bot@17', `Leave resumes the taken seat's brain at the battle's clock (${calls.join()})`);
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

if (failures) { console.error(`ai.watchResume.selftest: ${failures} failure(s)`); process.exit(1); }
console.log('ai.watchResume.selftest: a parked brain resumes from the hull as it stands');
