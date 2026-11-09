// The couch session's life (round 8 Y1 s2-01; docs/COUCH-MODE.md): a couch battle's seats (game.couch) belong to that
// battle. couchSeats.ts owns the session (beginCouchSession / endCouchSession: the one writer of game.couch, which also
// gives the seats' tanks their own names back), and every reader asks stateCore.ts couchSeatsActive (a session, the
// ruleset's couch rules and the battle phase). Driven here through the page's own code on a stub world (the
// battleSides.selftest seat): setupBattle with phones in Standard, then
// - the Garage return (clearBattleAfterExit and the phase:change 'garage' handler's clearMatchSession) and an online round
//   mounted as the network presentation mounts it: the frame input polls the own actor and a smoke press reaches the
//   authority (before the fix the stale session handed the frame input no player, and every action was refused: no drive,
//   no fire, no smoke for the whole online round);
// - an online round activated straight from the couch battle's result screen (no Garage between): the same;
// - a 'teams' couch battle shows every hull while it runs and nothing of it reveals a later battle's hulls;
// - the session's states: none -> seated -> none, its seat names on its tanks only while it lasts, and no writer of
//   game.couch outside couchSeats.ts (source census).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGameState, setupBattle } from './state.ts';
import * as stateCore from './stateCore.ts';
import { clearBattleAfterExit } from './garageTankLifecycle.ts';
import { transitionAppPhase } from './appLifecycle.ts';
import { createBattleFrameRuntime } from './battleFrameRuntime.ts';
import { createPlayerBattleActions } from './playerBattleActions.ts';
import * as couchSeats from './couchSeats.ts';
import { createActivationRuntime } from '../mp/session/activationRuntime.ts';
import { spawnTanks } from './rosterState.ts';
import { ensureFullFleet } from '../vehicles/fleetFactory.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';
import { matchRulesetFor } from '../sim/matchRuleset.ts';

const { clearMatchSession, createBus, watchRevealsAll } = stateCore;
await ensureFullFleet();
const world = createDedicatedWorldCollision('ruinspires');
const authored = world.heightField._layout.spawns;
const spawnOf = (p) => ({ pos: [p.x, world.heightField.getHeightAt(p.x, p.z), p.z], yaw: p.yaw ?? 0 });
world.spawnPoints = { player: spawnOf(authored.player), enemies: authored.enemies.map(spawnOf) };
const visual = () => ({ root: {}, setVisible() {}, syncFromState() {}, dispose() {}, resetDestroyed() {} });

/** A couch battle in Standard, as the Garage's couch lobby starts it (soloBattleStartRuntime: setupBattle, then the phase). */
function couchBattle(sides) {
  const game = createGameState({ rosterSeed: 5 });
  game.mapId = 'ruinspires';
  spawnTanks(game, { scene: { remove() {} } });
  for (const entity of game.allTanks) entity.visual = visual();
  game.battleCount = 2;
  setupBattle(game, 'm1a1_abrams_hc', world, {
    gameMode: 'standard', random: true, deferVisuals: true, deferCamoRepaint: true, deferOpeningRoutes: true,
    arrangement: { allies: 3, enemies: 3 }, couch: { seats: [1, 2], sides, names: ['Seat 1', 'Seat 2'] },
  });
  transitionAppPhase(game, 'battle', { reason: 'solo-battle' });
  return game;
}

/** The network presentation's mount (battlePresentation applyRoster and applyFrame): the room's ruleset, its own actor. */
function mountOnlineRound(game) {
  const own = { id: 'online-me', spec: { gun: { shells: [] } }, state: { yaw: 0 }, input: { shellSlot: 0, auxiliaryBits: 0 },
    combat: { destroyed: false, shellSlot: 0, ammo: [10], crew: {}, fire: { burning: false } } };
  game.ruleset = matchRulesetFor('standard');
  game.player = own;
  return own;
}

/** The frame owner's input poll and the action owner's smoke press, the two gates the stale session closed. */
function onlineControls(game) {
  const polled = [];
  const frames = createBattleFrameRuntime({
    game, settings: { isOpen: () => false }, killcam: { isActive: () => false },
    input: { poll: (sample) => polled.push(sample.player) },
    network: { isActive: () => true, pump() {} },
    countdown: { isWarmPending: () => false, advance: (seconds) => seconds, show() {}, rollout() {} },
    presentation: { captureSoloPose() {}, update() {}, updateResult() {} },
    getRigMode: () => 'arcade', stepSimulation() {}, emitPause() {},
  });
  frames.advance(1 / 60, 1 / 60, 0, false);
  const bus = createBus(() => {});
  const queued = [];
  const handlers = new Map();
  const input = {
    onAction(action, listener) { handlers.set(action, listener); return () => handlers.delete(action); },
  };
  const actions = createPlayerBattleActions({
    game, bus, input, rules: { hasAmmunition: () => true, rulesetUnlimitedFor: () => false },
    network: { isActive: () => true, queueAction: (action) => queued.push(action), queueConsumable: () => {} },
    isSettingsOpen: () => false,
  });
  handlers.get('smoke')?.('KeyG');
  actions.dispose();
  return { polled, queued };
}

// ---- a couch battle, the Garage, then an online round ------------------------------------------------------------------
{
  const game = couchBattle('together');
  assert.ok(game.couch && game.couch.seats.length === 2, 'the phones took two seats');
  assert.ok(game.ruleset.couch, 'the couch battle plays the couch rules');
  const named = game.couch.seats.map(({ entity }) => entity);
  assert.deepEqual(named.map((entity) => entity.displayName), ['Seat 1', 'Seat 2'], 'each seat\'s tank wears its seat\'s name');
  const during = onlineControls(game);
  assert.ok(during.polled.length === 1 && during.polled[0] === null, 'in the couch battle the keyboard drives no tank');
  assert.deepEqual(during.queued, [], 'in the couch battle the shared screen\'s keys act on no tank');
  // the Garage return: the battle's teardown, then the phase edge's own handler (main.ts phase:change 'garage')
  transitionAppPhase(game, 'garage', { reason: 'garage-return' });
  clearBattleAfterExit({ game });
  clearMatchSession(game);
  const own = mountOnlineRound(game);
  transitionAppPhase(game, 'battle', { reason: 'network-activation' });
  const online = onlineControls(game);
  assert.ok(online.polled.length === 1 && online.polled[0] === own,
    'the online round\'s frame input polls the own actor (its drive and trigger reach the wire)');
  assert.deepEqual(online.queued, ['smoke'], 'the online round\'s smoke press reaches the authority');
  assert.ok(game.couch === null, 'the Garage return ended the couch session');
  assert.deepEqual(named.map((entity) => entity.displayName ?? null), [null, null], 'and the seats\' tanks have their own names back');
}

// ---- an online round activated straight from a couch battle (no Garage between) ------------------------------------------
{
  const game = couchBattle('together');
  const own = mountOnlineRound(game);
  game.player = { ...own, spec: own.spec, aerial: null, visual: null, equip: {} };
  const noop = () => {};
  const activation = createActivationRuntime({
    game, settings: { isOpen: () => false, close: noop }, killcam: { cancel: noop, spectate: { targetId: null, startObserver: () => true } },
    driveTest: { resetAim: noop }, getHud: () => ({ shotInfo: { setPlayer: noop }, setMode: noop }),
    playerActions: { setTank: noop, resetConsumables: noop }, getDamagePanel: () => ({ setTank: noop, setEquipment: noop }),
    rig: { release: noop, snapArcade: noop, snapSpectateForReveal: () => true },
    presentation: Object.fromEntries(['setShotMode', 'setCaptureHidden', 'setNetworkSpectator', 'setSelectedSpecId', 'rememberSpecId',
      'setWorldDormant', 'setCamoBiome', 'hideGarage', 'hideEndOverlay', 'resetBattleResult', 'setGarageSpots', 'setGarageSunTrim',
      'emitConsumableReset', 'stopShowroom'].map((name) => [name, noop]).concat([['getWorld', () => null]])),
  });
  activation.activate({ viewerId: own.id, own: { id: own.id, specId: 'm1a1_abrams_hc' }, spectator: false, mapId: 'verdant',
    bridge: { setPerspective: noop }, fx: { setFrozen: noop, resetAll: noop } });
  const online = onlineControls(game);
  assert.ok(online.polled.length === 1 && online.polled[0] === game.player, 'the round\'s frame input polls the own actor');
  assert.deepEqual(online.queued, ['smoke'], 'the round\'s smoke press reaches the authority');
  assert.ok(game.couch === null, 'a network round\'s activation ends any couch session');
}

// ---- a 'teams' couch battle shows every hull while it runs, never after ------------------------------------------------
{
  const game = couchBattle('teams');
  assert.equal(watchRevealsAll(game), true, 'a teams couch battle shares one screen: every hull is shown');
  transitionAppPhase(game, 'garage', { reason: 'garage-return' });
  clearBattleAfterExit({ game });
  clearMatchSession(game);
  mountOnlineRound(game);
  transitionAppPhase(game, 'battle', { reason: 'network-activation' });
  assert.equal(watchRevealsAll(game), false, 'the next battle reveals nothing the couch battle did');
}

// (the asserts compare flags and ids, never a hull: a failing message would print a whole battle's object graph)
// ---- the session's states and its one writer ---------------------------------------------------------------------------
{
  const { beginCouchSession, endCouchSession } = couchSeats;
  const { couchSeatsActive } = stateCore;
  assert.equal(typeof beginCouchSession, 'function', 'couchSeats.ts owns the session');
  assert.equal(typeof couchSeatsActive, 'function', 'stateCore.ts answers whether the seats are driven');
  const tanks = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const game = { couch: null, ruleset: { couch: {} }, phase: 'battle' };
  const session = beginCouchSession(game, { seats: [2, 1], sides: 'together', names: ['Ann', 'Bo'] }, tanks, new Set(tanks), [true, true]);
  assert.equal(game.couch, session, 'none -> seated');
  assert.deepEqual(tanks.map((tank) => tank.displayName ?? null), ['Ann', 'Bo', null], 'seat order names the tanks');
  assert.equal(couchSeatsActive(game), true);
  assert.equal(couchSeatsActive({ ...game, phase: 'garage' }), false, 'out of the battle phase no seat is driven');
  assert.equal(couchSeatsActive({ ...game, ruleset: matchRulesetFor('standard') }), false, 'under another ruleset no seat is driven');
  const next = beginCouchSession(game, { seats: [1], sides: 'together' }, tanks, new Set(tanks), [true]);
  assert.notEqual(next, session, 'a new couch battle is a new session (couchRuntime aims its seats again)');
  assert.deepEqual(tanks.map((tank) => tank.displayName ?? null), [null, null, null], 'a new session gives the last one\'s names back');
  endCouchSession(game);
  endCouchSession(game);
  assert.equal(game.couch, null, 'seated -> none, and ending no session is a no-op');
  assert.equal(couchSeatsActive(game), false);
  // the census: nothing but the owner writes game.couch (selftests excluded)
  const root = fileURLToPath(new URL('../', import.meta.url));
  const writers = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const file = join(dir, name);
      if (statSync(file).isDirectory()) { walk(file); continue; }
      if (!file.endsWith('.ts') || file.endsWith('couchSeats.ts')) continue;
      const source = readFileSync(file, 'utf8');
      if (/\.couch\s*=[^=]/.test(source)) writers.push(file.slice(root.length));
    }
  };
  walk(root);
  assert.deepEqual(writers, [], 'game.couch has one writer, game/couchSeats.ts');
}

world.release?.();
console.log('couchSessionLifecycle.selftest: the Garage return and a network activation end the couch session; the online '
  + 'round drives and acts; a teams battle reveals only itself; none -> seated -> none with one writer PASS');
process.exit(0);
