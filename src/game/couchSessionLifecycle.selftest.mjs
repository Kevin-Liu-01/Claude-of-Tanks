// The couch session's life (round 8 Y1 s2-01; docs/COUCH-MODE.md): a couch battle's seats (game.couch) belong to that
// battle. couchSeats.ts owns the session (beginCouchSession / endCouchSession: the one writer of game.couch, which also
// gives the seats' tanks their own names back), and every reader asks stateCore.ts couchSeatsActive (a session, the
// ruleset's couch rules and the battle phase). The owners here, on the page's own session object (stateCore
// createGameState) with stand-in hulls, the session begun as setupBattle begins it (the couch ruleset, then
// beginCouchSession over the roster):
// - the Garage return (clearBattleAfterExit and the phase:change 'garage' handler's clearMatchSession) and an online round
//   mounted as the network presentation mounts it: the frame input polls the own actor and a smoke press reaches the
//   authority (before the fix the stale session handed the frame input no player, and every action was refused: no drive,
//   no fire, no smoke for the whole online round);
// - an online round activated straight from the couch battle's result screen (no Garage between): the same;
// - a 'teams' couch battle shows every hull while it runs and nothing of it reveals a later battle's hulls;
// - the session's states: none -> seated -> none, its seat names on its tanks only while it lasts, and no writer of
//   game.couch outside couchSeats.ts (source census: any assignment form, Object.assign onto a game, delete).
// The same three battles seated by the page's setupBattle are src/game/couchSessionBattle.selftest.mjs (MANUAL 'sims':
// a page import, a world and a fleet); this file loads neither, so it costs about a second on every npm test.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as stateCore from './stateCore.ts';
import { clearBattleAfterExit } from './garageTankLifecycle.ts';
import { transitionAppPhase } from './appLifecycle.ts';
import { createBattleFrameRuntime } from './battleFrameRuntime.ts';
import { createPlayerBattleActions } from './playerBattleActions.ts';
import * as couchSeats from './couchSeats.ts';
import { createActivationRuntime } from '../mp/session/activationRuntime.ts';
import { couchRulesetFor, couchSeatSides, matchRulesetFor } from '../sim/matchRuleset.ts';

const { clearMatchSession, createBus, createGameState, watchRevealsAll } = stateCore;
const { beginCouchSession } = couchSeats;

/**
 * A couch battle in Standard as setupBattle seats it (game/state.ts: `options.couch` puts the couch rules on the ruleset,
 * then beginCouchSession seats the lobby's phones on the roster, the first tank's side its allies), on stand-in hulls, then
 * the battle phase (soloBattleStartRuntime).
 */
function couchBattle(sides) {
  const game = createGameState({ rosterSeed: 5 });
  const hulls = ['me', 'ally-1', 'ally-2', 'foe-1', 'foe-2', 'foe-3'].map((id) => ({ id, displayName: null, visual: null, input: null }));
  for (const hull of hulls) { game.allTanks.push(hull); game.tanks.push(hull); game.tankById.set(hull.id, hull); }
  game.player = hulls[0];
  game.ruleset = couchRulesetFor(matchRulesetFor('standard'));
  beginCouchSession(game, { seats: [1, 2], sides, names: ['Seat 1', 'Seat 2'] }, game.tanks, new Set(hulls.slice(0, 3)),
    couchSeatSides('standard', sides, 2));
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

/** The page's activation of a network round (activationRuntime), every port a no-op. */
function activateOnlineRound(game, own) {
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
}

// (the asserts compare flags and ids, never a hull: a failing message would print a whole battle's object graph)
// ---- a couch battle, the Garage, then an online round ------------------------------------------------------------------
{
  const game = couchBattle('together');
  assert.ok(game.couch && game.couch.seats.length === 2, 'the phones took two seats');
  const named = game.couch.seats.map(({ entity }) => entity);
  assert.deepEqual(named.map((entity) => entity.id), ['me', 'ally-1'], 'seat 1 drives the first tank, seat 2 the next ally');
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
  activateOnlineRound(game, game.player);
  const online = onlineControls(game);
  assert.ok(online.polled.length === 1 && online.polled[0] === game.player, 'the round\'s frame input polls the own actor');
  assert.deepEqual(online.queued, ['smoke'], 'the round\'s smoke press reaches the authority');
  assert.ok(game.couch === null, 'a network round\'s activation ends any couch session');
}

// ---- a 'teams' couch battle shows every hull while it runs, never after ------------------------------------------------
{
  const game = couchBattle('teams');
  assert.deepEqual(game.couch.seats.map(({ entity }) => entity.id), ['me', 'foe-1'], 'teams: seat 2 plays the other side');
  assert.equal(watchRevealsAll(game), true, 'a teams couch battle shares one screen: every hull is shown');
  transitionAppPhase(game, 'garage', { reason: 'garage-return' });
  clearBattleAfterExit({ game });
  clearMatchSession(game);
  mountOnlineRound(game);
  transitionAppPhase(game, 'battle', { reason: 'network-activation' });
  assert.equal(watchRevealsAll(game), false, 'the next battle reveals nothing the couch battle did');
}

// ---- the session's states and its one writer ---------------------------------------------------------------------------
{
  const { endCouchSession } = couchSeats;
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
  // the census: nothing but the owner writes game.couch (selftests excluded), in any shape: an assignment (plain, compound
  // or logical), a computed key, Object.assign onto a game, Reflect.set / defineProperty naming it, or a delete. Reads
  // (`game.couch &&`, a ruleset's `couch:` rules, an event's `couch === true`) are none.
  const WRITE = [/\.couch\s*(?:(?:[-+*/%&|^]|\*\*|<<|>>>?|&&|\|\||\?\?)?=(?!=))/, /\[\s*['"]couch['"]\s*\]\s*(?:&&|\|\||\?\?)?=(?!=)/,
    /Object\.assign\(\s*(?:[\w$]+\??\.)*(?:game|host)\s*,[^;]*\bcouch\b/, /(?:Reflect\.set|defineProperty)\([^;]*['"]couch['"]/,
    /\bdelete\s+[\w$.?]*\.couch\b/];
  const writesCouch = (source) => WRITE.some((pattern) => pattern.test(source));
  for (const [plant, expected] of [['game.couch = null', true], ['host.couch ??= s', true], ['game.couch += 1', true],
    ['game["couch"] = s', true], ['Object.assign(game, { couch })', true], ['Object.assign(ports.game, { couch: s })', true],
    ['Reflect.set(game, \'couch\', s)', true], ['delete game.couch', true], ['if (game.couch && x)', false],
    ['const s = ports.game.couch;', false], ['event.couch === true', false], ['game.couch !== null', false],
    ['({ ...ruleset, records: false, couch: COUCH_RULES })', false], ['!!game.ruleset?.couch', false]]) {
    assert.equal(writesCouch(plant), expected, `the census reads \`${plant}\` as ${expected ? 'a write' : 'a read'}`);
  }
  const root = fileURLToPath(new URL('../', import.meta.url));
  const writers = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const file = join(dir, name);
      if (statSync(file).isDirectory()) { walk(file); continue; }
      if (!file.endsWith('.ts') || file.endsWith('couchSeats.ts')) continue;
      if (writesCouch(readFileSync(file, 'utf8'))) writers.push(file.slice(root.length));
    }
  };
  walk(root);
  assert.deepEqual(writers, [], 'game.couch has one writer, game/couchSeats.ts');
}

console.log('couchSessionLifecycle.selftest: the Garage return and a network activation end the couch session; the online '
  + 'round drives and acts; a teams battle reveals only itself; none -> seated -> none with one writer PASS');
process.exit(0);
