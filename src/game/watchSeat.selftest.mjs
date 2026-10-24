// Watch mode's seats (watch-mode-243): a watched battle sets up with every seat a bot's, opens with no player, and a
// taken seat is driven through the player's own input path (playerFrameInput -> entity.input -> simStep) while its
// controller is parked — bot -> player -> bot leaves the hull exactly as it was, a replay over the swap is exact, and
// the controller never writes the hull while the watcher drives it. Every watchable mode plays with no human seat.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createBus, createCollider, createGameState, setupBattle, simStep } from './state.ts';
import { spawnTanks } from './rosterState.ts';
import { createPlayerFrameInput } from './playerFrameInput.ts';
import { leaveWatchSeat, openWatchSeats, takeWatchSeat, verdictSeat, watchSeatRefusal } from './watchSeat.ts';
import { ensureFullFleet } from '../vehicles/fleetFactory.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';
import { WATCH_RULES, battleKeepsRecords, isWatchableMode, matchRulesetFor, watchRulesetFor } from '../sim/matchRuleset.ts';

const settings = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true, writable: true,
  value: { getItem: (key) => settings.get(key) ?? null, setItem: (key, value) => settings.set(key, String(value)), removeItem: (key) => settings.delete(key) },
});

// --- the ruleset entry ---------------------------------------------------------------------------------------------
assert.equal(isWatchableMode('standard'), true);
assert.equal(isWatchableMode('ac130'), false, 'the gunship is the human\'s alone');
assert.equal(isWatchableMode('proving_ground'), false, 'the range has no fight');
for (const mode of WATCH_RULES.modes) {
  const base = matchRulesetFor(mode), watched = watchRulesetFor(base);
  assert.equal(watched.watch, WATCH_RULES, `${mode}: carries the watch rules`);
  assert.equal(watched.records, false, `${mode}: keeps no record`);
  for (const key of ['respawnS', 'timeLimitS', 'scoreTarget', 'allies', 'enemies', 'hpScale', 'damageScale', 'reloadScale']) {
    assert.deepEqual(watched[key], base[key], `${mode}: the mode's own ${key}`);
  }
}
assert.equal(watchRulesetFor(matchRulesetFor('ac130')), matchRulesetFor('ac130'), 'an unwatchable mode is unchanged');
assert.equal(battleKeepsRecords({ gameMode: 'standard' }), true);
assert.equal(battleKeepsRecords({ gameMode: 'standard', watch: true }), false, 'a watched battle keeps no record');
assert.equal(battleKeepsRecords({ gameMode: 'proving_ground' }), false);

// --- a watched battle -----------------------------------------------------------------------------------------------
await ensureFullFleet();
const MAP = 'steppe';
/** A battlefield. A replay gets its own: a battle leaves the world it played on changed (crushed props, craters). */
function battlefield() {
  const field = createDedicatedWorldCollision(MAP);
  const authored = field.heightField._layout.spawns;
  const spawnAt = (p) => ({ pos: [p.x, field.heightField.getHeightAt(p.x, p.z), p.z], yaw: p.yaw ?? 0 });
  field.spawnPoints = { player: spawnAt(authored.player), enemies: authored.enemies.map(spawnAt) };
  return field;
}
const world = battlefield();
// a headless hull: the gun's muzzle 2.4 m over the hull and its bore along the turret's lay
const visual = (entity) => ({ root: {}, setVisible() {}, syncFromState() {}, dispose() {}, resetDestroyed() {}, setDestroyed() {}, recoilKick() {},
  gunMuzzleWorld: (out) => out.set(entity.state.pos.x, entity.state.pos.y + 2.4, entity.state.pos.z),
  gunDirWorld: (out) => {
    const yaw = entity.state.yaw + entity.state.turretYaw, pitch = entity.state.gunPitch ?? 0;
    return out.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  } });

function watchedBattle(gameMode = 'standard', seed = 11, field = world) {
  const game = createGameState({ rosterSeed: seed });
  game.mapId = MAP;
  spawnTanks(game, { scene: { remove() {} } });
  for (const entity of game.allTanks) entity.visual = visual(entity);
  const events = [];
  const bus = createBus((name, payload) => events.push([name, payload]));
  setupBattle(game, 'm1a1_abrams_hc', field, { gameMode, watch: true, random: true, arrangement: null, brain: null,
    deferVisuals: true, deferCamoRepaint: true, deferOpeningRoutes: false });
  const collider = createCollider(game, field);
  return { game, events, step: () => simStep(game, bus, field, null, collider) };
}

{
  const { game } = watchedBattle();
  const seat = game.tanks[0];
  assert.equal(game.ruleset.watch, WATCH_RULES);
  assert.equal(game.player, seat, 'through loading and the reveal the human seat is the player (the entry pipeline runs as ever)');
  assert.equal(seat.aiCtl, null, 'its brain is parked until the battle opens');
  assert.ok(game.watch.parked.get(seat.id), 'the human seat has a brain of its own');
  assert.ok(game.tanks.slice(1).every((entity) => entity.aiCtl), 'every other seat is a bot');
  assert.equal(watchSeatRefusal(game, game.tanks[3]), 'not-open', 'no seat is taken before the battle opens');
  assert.equal(openWatchSeats(game), true);
  assert.equal(openWatchSeats(game), false, 'opening is idempotent');
  assert.equal(game.player, null, 'open: no player');
  assert.ok(seat.aiCtl && !seat.isPlayer && seat.bot === false,
    'the human seat is driven by its brain and stays the human seat for the mode (bot false)');
  assert.ok(game.tanks.every((entity) => entity.aiCtl), 'every seat is driven by a controller');
  assert.equal(verdictSeat(game), seat, 'the verdict reads the human seat');
}

// --- bot -> player -> bot, a replay over the swap, no double inputs ----------------------------------------------------
const TAKE_AT = 120, LEAVE_AT = 360, END_AT = 480;
const digestOf = (game) => JSON.stringify(game.tanks.map((e) => [e.id, e.team, e.isPlayer, !!e.aiCtl,
  +e.state.pos.x.toFixed(6), +e.state.pos.y.toFixed(6), +e.state.pos.z.toFixed(6), +e.state.yaw.toFixed(6),
  +e.state.turretYaw.toFixed(6), +e.combat.hp.toFixed(6), !!e.combat.destroyed, [...(e.combat.ammo ?? [])],
  +(e.combat.reload?.t ?? 0).toFixed(6)]).concat([[+game.timeS.toFixed(6), game.shells.length, game.result]]));
const hullOf = (e) => JSON.stringify({
  state: Object.fromEntries(Object.entries(e.state).map(([k, v]) => [k, v?.isVector3 ? v.toArray() : v])),
  combat: e.combat, equip: e.equip, team: e.team, bot: e.bot, specialAction: e.specialAction,
});

/** The player's input port, scripted: the watcher drives forward, steers, and fires once. */
function scriptedPort(script) {
  const state = { forward: false, back: false, left: false, right: false, handbrake: false, fire: false };
  return {
    state,
    port: {
      onAction: () => () => {},
      getState: () => script(state),
      getVirtualMove: () => false,
      isLocked: () => true,
      padActive: () => false,
      isCursorAim: () => false,
      virtualActive: () => false,
      consumeMouseDelta: (out) => { out.x = 0; out.y = 0; return out; },
      getCursorNdc: (out) => { out.x = 0; out.y = 0; return out; },
      getSettings: () => ({ rmbMode: 'hold' }),
      isDown: () => false,
      releaseToggles() {},
    },
  };
}

function run({ take }) {
  const battle = watchedBattle('standard', 23, battlefield());
  const { game } = battle;
  openWatchSeats(game);
  let tick = 0;
  const target = game.tanks.find((e) => e.team === 'enemy');
  const brain = target.aiCtl;
  let brainCalls = 0, brainCallsWhileTaken = 0;
  const update = brain.update.bind(brain);
  brain.update = (dt, t) => { brainCalls++; if (game.watch.takenId === target.id) brainCallsWhileTaken++; update(dt, t); };
  const { port } = scriptedPort((s) => {
    s.forward = tick < LEAVE_AT - 30;
    s.left = tick % 120 < 40;
    s.right = tick % 120 >= 80;
    s.fire = tick === TAKE_AT + 60;
    return s;
  });
  const frameInput = createPlayerFrameInput({ input: port, hasAmmo: () => true, forceFire: () => false });
  const aim = new Vector3();
  const exact = { take: null, leave: null };
  let inputsMatched = 0;
  for (; tick < END_AT; tick++) {
    if (take && tick === TAKE_AT) {
      const before = hullOf(target);
      assert.equal(takeWatchSeat(game, target), true, 'the seat is taken');
      assert.equal(hullOf(target), before, 'taking control changes nothing about the hull');
      assert.equal(game.player, target);
      assert.equal(target.aiCtl, null, 'its controller is parked');
      assert.equal(watchSeatRefusal(game, game.tanks[1]), 'already-driving', 'one seat at a time');
      exact.take = before;
    }
    if (take && tick === LEAVE_AT) {
      const before = hullOf(target);
      assert.equal(leaveWatchSeat(game), target, 'the seat is handed back');
      assert.equal(hullOf(target), before, 'leaving changes nothing about the hull');
      assert.equal(target.aiCtl, brain, 'its own controller drives it again');
      assert.equal(game.player, null);
      exact.leave = before;
    }
    // the frame (main.ts order): the player's input is sampled, the rig lays the sight, then the fixed step
    frameInput.poll({ dtSeconds: 1 / 60, inBattle: true, paused: false, killcamActive: false, cameraLocked: false,
      rigMode: 'ARCADE', player: game.player });
    if (game.player) {
      aim.set(game.player.state.pos.x + Math.sin(game.player.state.yaw) * 200, game.player.state.pos.y + 2,
        game.player.state.pos.z + Math.cos(game.player.state.yaw) * 200);
      game.player.input.aimPoint.copy(aim);
    }
    const sampled = game.player ? { throttle: game.player.input.throttle, steer: game.player.input.steer } : null;
    battle.step();
    if (sampled && game.player === target) {
      // the step read exactly the sampled input: nothing else wrote the hull's controls
      assert.equal(target.input.throttle, sampled.throttle);
      assert.equal(target.input.steer, sampled.steer);
      inputsMatched++;
    }
  }
  return { digest: digestOf(game), brainCalls, brainCallsWhileTaken, inputsMatched, target, game, exact };
}

{
  const a = run({ take: true });
  const b = run({ take: true });
  assert.equal(a.digest, b.digest, 'a replay over the swap is exact');
  assert.equal(a.exact.take, b.exact.take, 'the swap happens on the same hull state in both runs');
  assert.equal(a.brainCallsWhileTaken, 0, 'no double inputs: the parked controller never runs while the watcher drives');
  assert.equal(a.inputsMatched, LEAVE_AT - TAKE_AT, 'every driven step read the player\'s sampled input');
  assert.ok(a.brainCalls > 0 && a.brainCalls <= END_AT - (LEAVE_AT - TAKE_AT), 'the controller runs only outside the window');
  const watchedOnly = run({ take: false });
  assert.notEqual(watchedOnly.digest, a.digest, 'the watcher\'s drive changed the battle (the input really drove the hull)');
  assert.equal(watchedOnly.brainCalls, END_AT, 'untaken, the controller runs every step');
}

// --- every watchable mode plays with no human seat ---------------------------------------------------------------------
for (const mode of WATCH_RULES.modes) {
  const { game, step } = watchedBattle(mode, 5);
  openWatchSeats(game);
  const start = game.tanks.map((e) => e.state.pos.clone());
  for (let i = 0; i < 120; i++) step();
  assert.equal(game.player, null, `${mode}: no player appears`);
  assert.equal(game.result, null, `${mode}: no verdict in the opening two seconds (a mode reading "no human" would end at once)`);
  assert.ok(game.tanks.some((e, i) => e.state.pos.distanceTo(start[i]) > 2), `${mode}: the bots drive`);
}

console.log('watchSeat selftest: PASS');
