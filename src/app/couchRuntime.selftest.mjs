// round 8 Y4 s3-02 / s3-09: the couch session's page runtime (src/app/couchRuntime.ts) across battles.
// s3-02: its private `spectating` latch raised body.cot-spectating (the own-tank furniture off on the shared screen) only on
// an edge it saw, through a raw classList toggle in main.ts outside bodyFlags.ts's reasons (2026-11-02 audit F8). The HUD's
// battle end dropped the class behind it (its spectate-bar reason), no couch frame runs in the Garage, so the latch stayed
// true, and every couch battle after the first in a session showed seat 1's shells, drive readout and reticle on the TV.
// Now the runtime calls its port on every frame it runs, main's port holds the class by its own 'couch' reason (writing only
// on a change), and the runtime drops the reason when the phase leaves the battle and when the lobby closes.
// s3-09: the lobby's Start never closed the join window (docs/COUCH-MODE.md: joins wait between battles): a phone with the
// code took a seat mid-battle. The runtime's start edge sends setOpen(false) before it launches.
// Driven over the real bodyFlags.ts (a recording body) and main.ts's own setSpectating binding, with a lobby double through
// the runtime's startLobby port (padLobby.selftest drives the real lobby; the actor's refusal of a closed window is
// padActor.selftest's).
// Round 8 merge review r1, the seams of the couch session's end (battle-core s2-01) with the runtime's ports:
// - a seat's Pause asks the couch session (stateCore couchSeatsActive), not any battle: the lobby outlives its battles and
//   padReceiver.ts applies a seated phone's 'pause' whether or not the seat drives, so a seat that drove nothing (the
//   session ended at a network round's activation or by clearMatchSession; a keyboard battle begun with the lobby's phones
//   still seated) opened and closed the desktop's menu over a battle that was no couch battle, and the open menu then
//   refused every key (playerBattleActions battleInputAllowed). main.ts's own togglePause port, over the real
//   phonePause.ts, stateCore.ts and couchSeats.ts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COUCH_RULES } from '../sim/matchRuleset.ts';
import { togglePhonePause } from '../ui/phonePause.ts';
import { couchSeatsActive } from '../game/stateCore.ts';
import { beginCouchSession, endCouchSession } from '../game/couchSeats.ts';

const bodyClasses = new Set();
globalThis.document = { body: { classList: {
  contains: (name) => bodyClasses.has(name),
  toggle: (name, on) => { if (on) bodyClasses.add(name); else bodyClasses.delete(name); return on; },
} } };
const { setBodyFlag } = await import('../ui/bodyFlags.ts');
const { createCouchRuntime } = await import('./couchRuntime.ts');

// main.ts's own port binding, run over the real bodyFlags and a HUD recorder
const mainSource = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
const portSource = mainSource.match(/\n {4}setSpectating: (\(on\) => \{[^\n]*\}),\n/)?.[1];
assert.ok(portSource, "main.ts binds the couch runtime's setSpectating port on one line");
const couchViews = [];
const hud = { setCouchView: (on) => couchViews.push(on) };
const mainPort = new Function('setBodyFlag', 'currentHud', 'document', `return ${portSource};`)(setBodyFlag, () => hud, globalThis.document);

function createHarness() {
  const listeners = new Map();
  const calls = [];
  let lobbyListener = null;
  const lobby = {
    view: { state: 'open', code: 'ABCD', until: null, seats: [], reason: null },
    subscribe(listener) { lobbyListener = listener; listener(lobby.view); return () => { lobbyListener = null; }; },
    setOpen: (open) => calls.push(['setOpen', open]),
    remove() {},
    end: () => calls.push(['end']),
  };
  const tank = (x) => ({ combat: { destroyed: false, shellSlot: 0, ammo: [10], reload: { t: 0, totalS: 0 } },
    spec: { id: 'm1a1_abrams_hc', gun: { shells: [{ type: 'apfsds' }] } },
    state: { pos: { x, y: 0, z: 0 }, yaw: 0, turretYaw: 0, speed: 0 } });
  const session = () => ({ sides: 'together', seats: [{ seat: 1, entity: tank(0) }, { seat: 2, entity: tank(20) }] });
  const game = { phase: 'garage', couch: null, ruleset: { couch: undefined } };
  const runtime = createCouchRuntime({
    game,
    camera: { fov: 55, aspect: 16 / 9, position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, lookAt() {} },
    paused: () => false,
    shellCode: (type) => type,
    togglePause() {},
    emit() {},
    on: (type, listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
      return () => listeners.get(type).delete(listener);
    },
    setSpectating: (on) => { calls.push(['setSpectating', on]); mainPort(on); },
    startLobby: () => { calls.push(['startLobby']); return lobby; },
  });
  const emit = (type, payload) => { for (const listener of listeners.get(type) ?? []) listener(payload); };
  /** A battle phase with this session (the solo start's transitionAppPhase announces it). */
  const battle = (couch) => {
    game.phase = 'battle';
    game.couch = couch;
    game.ruleset = { couch: COUCH_RULES };
    emit('phase:change', { phase: 'battle' });
  };
  /** The Garage return: the HUD's battle end (its own reason), then the Garage phase; no couch frame runs there. */
  const garage = () => {
    setBodyFlag('cot-spectating', 'spectate-bar', false); // hud.ts endBattle
    game.phase = 'garage';
    game.ruleset = { couch: undefined };
    emit('phase:change', { phase: 'garage' });
  };
  const seat = (seats) => { lobby.view = { ...lobby.view, seats }; lobbyListener?.(lobby.view); };
  return { runtime, calls, battle, garage, session, seat, lobby };
}

// s3-02: every couch battle of a session shows the field, not seat 1's tank; the class leaves with each battle.
{
  const h = createHarness();
  h.battle(h.session());
  assert.equal(h.runtime.frame(1 / 60), true, 'a couch battle owns the frame');
  assert.equal(bodyClasses.has('cot-spectating'), true, 'couch battle 1: the own-tank furniture is off');
  assert.equal(couchViews.at(-1), true, "and the HUD reads the shared screen's view");
  h.garage();
  assert.equal(bodyClasses.has('cot-spectating'), false, 'the Garage shows no spectating class');
  h.battle(h.session()); // the lobby's phones stay seated for the next one: a new session object
  h.runtime.frame(1 / 60);
  assert.equal(bodyClasses.has('cot-spectating'), true,
    'couch battle 2: the furniture is off again from its first frame (before: the latch saw no edge, so seat 1\'s HUD showed)');
  assert.equal(couchViews.at(-1), true);
  // a spectate bar inside the couch battle (a killcam's spectate:end drops its own reason) never strips the couch's
  setBodyFlag('cot-spectating', 'spectate-bar', true);
  setBodyFlag('cot-spectating', 'spectate-bar', false);
  assert.equal(bodyClasses.has('cot-spectating'), true, 'the couch holds its own reason');
  // a non-couch battle after it: the runtime's frame drops the reason (the HUD's endBattle cleared its couch view)
  h.garage();
  h.battle(null);
  assert.equal(h.runtime.frame(1 / 60), false, 'a solo battle is not the couch frame\'s');
  assert.equal(bodyClasses.has('cot-spectating'), false);
  assert.equal(couchViews.at(-1), false);
  // the lobby's end drops the reason too (the runtime holds nothing past its lobby)
  h.battle(h.session());
  h.runtime.frame(1 / 60);
  assert.equal(bodyClasses.has('cot-spectating'), true);
  h.runtime.close();
  assert.equal(bodyClasses.has('cot-spectating'), false, 'close() drops the couch reason');
}

// s3-09: Start closes the join window, then deploys the seats here; with no phone here nothing is sent.
{
  const h = createHarness();
  assert.equal(typeof h.runtime.startBattle, 'function', 'the runtime owns the start edge (before: Start launched without it)');
  assert.equal(h.runtime.open(), h.lobby, 'the lobby comes from the startLobby port');
  const launches = [];
  assert.equal(h.runtime.startBattle((seats) => { h.calls.push(['launch', [...seats]]); return true; }), false,
    'no phone here: no battle, and the window stays as it was');
  assert.equal(h.calls.some(([name]) => name === 'setOpen' || name === 'launch'), false);
  h.seat([{ seat: 1, presence: 'here', view: null }, { seat: 3, presence: 'away', view: null }, { seat: 4, presence: 'here', view: null }]);
  h.calls.length = 0;
  assert.equal(h.runtime.startBattle((seats) => { launches.push([...seats]); h.calls.push(['launch', [...seats]]); return true; }), true);
  assert.deepEqual(h.calls, [['setOpen', false], ['launch', [1, 4]]], 'the join window closes before the seats here deploy');
  assert.equal(h.runtime.startBattle(() => false), false, 'a launch the Garage refused is not a start');
}

/** A seat's tank as the runtime and the input stage read it: `ammo` per slot (AP, HE, ATGM). */
function seatTank(id, x, ammo = [10, 4, 2]) {
  const point = () => ({ x: 0, y: 0, z: 0, set(px, py, pz) { this.x = px; this.y = py; this.z = pz; return this; } });
  return {
    id,
    spec: { id: 'm1a1_abrams_hc', era: 'modern', hp: 100,
      gun: { reloadS: 6, shells: [{ type: 'apfsds', name: 'AP' }, { type: 'he', name: 'HE' }, { type: 'atgm', name: 'ATGM', guided: true }] } },
    combat: { destroyed: false, shellSlot: 0, ammo: [...ammo], ammoCapacity: [10, 4, 2], reload: { t: 0, totalS: 6 } },
    state: { pos: { x, y: 0, z: 0 }, yaw: 0, turretYaw: 0, speed: 0 },
    input: { throttle: 0, steer: 0, brake: false, fire: false, fireIntentSeq: null, aimLocked: false, actionBits: 0, shellSlot: 0, aimPoint: point() },
  };
}
const testCamera = () => ({ fov: 55, aspect: 16 / 9, position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, lookAt() {} });
/** A lobby double whose seats are the runtime's own seat ports (padLobby hands each receiver `ports.seat(n)`). */
function portLobby() {
  const lobby = { ports: null, setOpen() {}, remove() {}, end() {},
    subscribe(listener) { listener({ state: 'open', code: 'ABCD', until: null, seats: [], reason: null }); return () => {}; } };
  return { lobby, start: (ports) => { lobby.ports = ports; return lobby; } };
}

// (round 8 merge review r1) a seat's Pause opens the desktop's menu only while a couch battle's phones drive
{
  const pauseSource = mainSource.match(/\n {4}togglePause: (\(\) => togglePhonePause\([^\n]*\)),\n/)?.[1];
  assert.ok(pauseSource, "main.ts binds the couch runtime's togglePause port on one line");
  let open = false;
  const closes = [];
  const settings = { isOpen: () => open, open: () => { open = true; }, close: (options) => { open = false; closes.push(options); } };
  const game = { phase: 'garage', couch: null, ruleset: { couch: undefined }, player: null };
  // the names main.ts's port may read: the settings menu, the phase policy (battlePhase.isBattle(): phase 'battle') and the
  // session's own reader
  const battlePhase = { isBattle: () => game.phase === 'battle' };
  const togglePause = new Function('togglePhonePause', 'settings', 'battlePhase', 'couchSeatsActive', 'game',
    `return ${pauseSource};`)(togglePhonePause, settings, battlePhase, couchSeatsActive, game);
  const { lobby, start } = portLobby();
  const runtime = createCouchRuntime({ game, camera: testCamera(), paused: () => open, shellCode: (type) => type, togglePause,
    emit() {}, on: () => () => {}, setSpectating() {}, startLobby: start });
  assert.equal(runtime.open(), lobby);
  const seat2 = lobby.ports.seat(2);
  const seat1Tank = seatTank('seat-1', 0), seat2Tank = seatTank('seat-2', 20);
  // a couch battle: the session, its couch rules, the battle phase
  beginCouchSession(game, { seats: [1, 2], sides: 'together' }, [seat1Tank, seat2Tank], new Set([seat1Tank, seat2Tank]), [true, true]);
  game.ruleset = { couch: COUCH_RULES };
  game.phase = 'battle';
  game.player = seat1Tank;
  seat2.togglePause();
  assert.equal(open, true, "in a couch battle a seat's Pause opens the menu");
  seat2.togglePause();
  assert.deepEqual([open, closes], [false, [{ noRelock: true }]], 'and closes it with no pointer relock');
  seat1Tank.combat.destroyed = true;
  seat2.togglePause();
  assert.equal(open, true, "a dead seat 1 takes Pause from no other seat (isBattleActive is seat 1's own)");
  seat2.togglePause();
  // the session ends while the phase is a battle's: a network round's activation (activationRuntime endCouchSession), and
  // the round's rules carry no couch
  endCouchSession(game);
  game.ruleset = { couch: undefined };
  seat2.togglePause();
  assert.equal(open, false,
    "after the couch session ended, a seated phone's Pause leaves the network round's menu closed (before: any battle phase opened it)");
  // a keyboard battle begun with the lobby's phones still seated: no session, no couch rules
  game.player = seatTank('keyboard', 0);
  seat2.togglePause();
  assert.equal(open, false, "a keyboard battle is no couch battle: the seated phones' Pause opens nothing");
  // the couch session with a ruleset that has no couch rules (a stale session over another battle) is no couch battle either
  beginCouchSession(game, { seats: [1, 2], sides: 'together' }, [seat1Tank, seat2Tank], new Set([seat1Tank, seat2Tank]), [true, true]);
  seat2.togglePause();
  assert.equal(open, false, 'a session under rules with no couch is no couch battle');
  game.ruleset = { couch: COUCH_RULES };
  game.phase = 'garage';
  seat2.togglePause();
  assert.equal(open, false, 'between battles the seats pause nothing');
}

console.log('couchRuntime.selftest: the couch view by its own reason in every couch battle of a session, dropped as the battle and the lobby end, Start closing the join window before it deploys, and a seat\'s Pause only in a couch battle passed');
