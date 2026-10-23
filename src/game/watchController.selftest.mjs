// Watch mode's controller (watch-mode-243): the ride-along's handoff on death (a held wreck, then its killer or the
// drone; a fire or a crash credits the hull's last attacker), picking and cycling, and Take control / Leave through the
// player's rig and the seat ledger — the driven hull's death flow, then the drone.
import assert from 'node:assert/strict';
import { Object3D, PerspectiveCamera, Vector3 } from 'three';
import { createWatchCamera } from '../engine/watchCamera.ts';
import { createWatchController } from './watchController.ts';
import { prepareWatchSeat } from './watchSeat.ts';
import { createBus } from './stateCore.ts';
import { WATCH_RULES, matchRulesetFor, watchRulesetFor } from '../sim/matchRuleset.ts';

// a headless window: the controller's listeners, the viewport
const listeners = new Map();
globalThis.window = {
  innerWidth: 1600, innerHeight: 900,
  addEventListener: (type, fn) => { listeners.set(type, (listeners.get(type) ?? new Set()).add(fn)); },
  removeEventListener: (type, fn) => { listeners.get(type)?.delete(fn); },
};
const fire = (type, event) => { for (const fn of listeners.get(type) ?? []) fn(event); };
const key = (code, extra = {}) => {
  const base = { code, repeat: false, shiftKey: false, target: null, preventDefault() {}, ...extra };
  fire('keydown', base);
  fire('keyup', base);
};

const DT = 1 / 60;
const flat = { getHeightAt: () => 0 };
function hull(id, team, x, z) {
  const root = new Object3D();
  root.position.set(x, 0, z);
  root.updateMatrixWorld(true);
  return {
    id, team, isPlayer: false, bot: true, modeActive: true, spec: { id: 'm1a1_abrams_hc', name: id, nation: 'usa', dims: { heightM: 2.4 } },
    state: { pos: root.position, yaw: 0, turretYaw: 0 },
    combat: { destroyed: false },
    input: { throttle: 0, steer: 0, brake: false, fire: false, actionBits: 0, aimLocked: false, aimPoint: new Vector3(x, 2, z + 300) },
    aiCtl: { update() {} },
    visual: {
      root,
      turretTopWorld: (out) => out.set(0, 2.4, 0).applyMatrix4(root.matrixWorld),
      gunPivotWorld: (out) => out.set(0, 2.0, 0.6).applyMatrix4(root.matrixWorld),
    },
  };
}

function setup() {
  const tanks = [hull('seat', 'player', 0, -100), hull('ally', 'player', 30, -110), hull('foe', 'enemy', 0, 100), hull('foe2', 'enemy', 40, 120)];
  const game = { phase: 'battle', player: tanks[0], tanks, result: null, ruleset: watchRulesetFor(matchRulesetFor('standard')), watch: null };
  // setup parks the human seat's brain; the battle opens with every seat a bot's
  prepareWatchSeat(game, tanks[0]);
  const camera = new PerspectiveCamera(60, 16 / 9, 0.1, 4000);
  const watchCamera = createWatchCamera(camera, { heightField: flat, raycast: () => null });
  const bus = createBus();
  const rigCalls = [];
  const rig = { mode: 'ARCADE', release: () => rigCalls.push('release'), snapArcade: (...a) => rigCalls.push(['snapArcade', ...a]),
    snapSniper: (...a) => rigCalls.push(['snapSniper', ...a]), exitSniper: () => rigCalls.push('exitSniper'), stopSpectate: () => rigCalls.push('stopSpectate') };
  const camInput = { mouseDX: 0, mouseDY: 0, wheel: 0, shiftPressed: false };
  const killcam = { active: false, isActive() { return this.active; }, spectate: { active: false, stop() { this.active = false; } } };
  const seats = [];
  let newSeats = 0;
  const controller = createWatchController({
    game, camera, watchCamera, rig, bus, killcam, cameraInput: camInput,
    input: {
      getState: () => ({ forward: false, back: false, left: false, right: false }),
      getVirtualMove: () => false,
      getPadSnapshot: (out) => Object.assign(out, { connected: false, leftX: 0, leftY: 0, rightX: 0, rightY: 0, leftTrigger: 0, rightTrigger: 0, buttons: 0 }),
      isLocked: () => true,
    },
    resultPresentation: { newSeat: () => { newSeats++; } },
    onSeat: (entity) => seats.push(entity?.id ?? null),
    isInputHeld: () => false,
    pickSurface: () => true,
    openingFrame: (out) => { out.position.set(0, 60, -250); out.yaw = 0; out.pitch = -0.35; return true; },
  });
  return { game, tanks, camera, watchCamera, bus, rig, rigCalls, killcam, controller, seats, newSeats: () => newSeats };
}
const run = (controller, seconds) => { for (let t = 0; t < seconds; t += DT) controller.frame(DT); };
const byId = (tanks, id) => tanks.find((tank) => tank.id === id);

// --- the reveal, the open, picking and cycling ------------------------------------------------------------------------
{
  const { game, tanks, camera, controller } = setup();
  assert.equal(controller.prepareReveal(), true, 'a watched battle places the drone before the reveal');
  assert.deepEqual(camera.position.toArray(), [0, 60, -250], 'on its opening frame');
  assert.equal(controller.frame(DT), true, 'before the battle opens the drone holds the frame (the rig stays out)');
  controller.open();
  assert.equal(game.player, null, 'open: no player');
  assert.ok(tanks[0].aiCtl && !tanks[0].isPlayer, 'the human seat is its bot\'s');
  assert.equal(controller.view, 'drone');
  // the camera looks down +Z from behind the allied side: the tank in the middle of the view is picked
  camera.lookAt(0, 2, 100);
  camera.updateMatrixWorld(true);
  assert.equal(controller.rideAt(0, 0), true, 'a click on a tank rides it');
  assert.equal(controller.focusId, 'foe', 'the tank under the sight');
  assert.equal(controller.rideAt(0.98, 0.98), false, 'empty ground picks nothing');
  key('Tab');
  assert.equal(controller.focusId, 'foe2', 'Tab cycles in roster order');
  key('Tab', { shiftKey: true });
  assert.equal(controller.focusId, 'foe', 'Shift+Tab steps back');
  key('KeyQ');
  assert.equal(controller.focusId, 'ally', 'Q steps back while riding');
  key('KeyE');
  assert.equal(controller.focusId, 'foe');
  key('KeyV');
  assert.equal(controller.view, 'drone', 'V flies off again');
  controller.stop();
}

// --- the ride-along's handoff on death ----------------------------------------------------------------------------------
{
  const { tanks, bus, controller } = setup();
  controller.prepareReveal();
  controller.open();
  controller.rideId('foe');
  run(controller, 1);
  byId(tanks, 'foe').combat.destroyed = true;
  bus.emit('tank:destroyed', { id: 'foe', killerId: 'ally', cause: 'shot' });
  run(controller, WATCH_RULES.deathHoldS - 0.2);
  assert.equal(controller.focusId, 'foe', 'the wreck is held a beat');
  run(controller, 0.4);
  assert.equal(controller.focusId, 'ally', 'then the camera rides on with its killer');
  assert.equal(controller.view, 'ride');

  // a fire or a crash names the hull itself: the last hull that hit it is the killer
  bus.emit('shell:hit', { attackerId: 'foe2', targetId: 'ally' });
  byId(tanks, 'ally').combat.destroyed = true;
  bus.emit('tank:destroyed', { id: 'ally', killerId: 'ally', cause: 'fire' });
  run(controller, WATCH_RULES.deathHoldS + 0.2);
  assert.equal(controller.focusId, 'foe2', 'a burn-out credits the last attacker');

  // a killer already dead: the drone lifts off the wreck
  byId(tanks, 'foe2').combat.destroyed = true;
  byId(tanks, 'seat').combat.destroyed = true;
  bus.emit('tank:destroyed', { id: 'foe2', killerId: 'seat', cause: 'shot' });
  run(controller, WATCH_RULES.deathHoldS + 0.2);
  assert.equal(controller.view, 'drone', 'no living killer: back to the drone');
  controller.stop();
}

// --- Take control and Leave -------------------------------------------------------------------------------------------
{
  const { game, tanks, rigCalls, killcam, controller, seats, newSeats } = setup();
  controller.prepareReveal();
  controller.open();
  controller.rideId('foe');
  run(controller, 2);
  assert.equal(controller.canTake, true);
  const brain = byId(tanks, 'foe').aiCtl;
  key('Enter');
  assert.equal(controller.view, 'drive', 'Enter takes the seat');
  assert.equal(game.player, byId(tanks, 'foe'), 'the hull is the player\'s');
  assert.equal(byId(tanks, 'foe').aiCtl, null, 'its bot is parked');
  assert.equal(newSeats(), 1, 'the player\'s death flow is armed for the seat');
  assert.ok(rigCalls.some((call) => Array.isArray(call) && call[0] === 'snapArcade'), 'the player rig takes the camera');
  assert.equal(controller.frame(DT), false, 'driving, the rig solves the camera');
  assert.equal(seats.at(-1), 'foe');
  key('KeyV');
  key('Tab');
  assert.equal(controller.view, 'drive', 'driving, every key is the tank\'s but the seat\'s own');
  key('Enter');
  assert.equal(controller.view, 'drone', 'Enter again leaves the tank to the drone');
  assert.equal(byId(tanks, 'foe').aiCtl, brain, 'the bot drives it again');
  assert.equal(game.player, null);

  // the driven hull destroyed: the death flow (a replay) plays out, then the drone
  controller.rideId('foe2');
  run(controller, 2);
  controller.toggleSeat();
  assert.equal(controller.view, 'drive');
  byId(tanks, 'foe2').combat.destroyed = true;
  killcam.active = true;
  killcam.spectate.active = true;
  run(controller, WATCH_RULES.takenDeathS + 1);
  assert.equal(controller.view, 'drive', 'the replay plays out first');
  killcam.active = false;
  run(controller, 0.1);
  assert.equal(controller.view, 'drone', 'then the watcher is back on the drone');
  assert.equal(killcam.spectate.active, false, 'the ally spectator the replay opened is closed');
  assert.ok(byId(tanks, 'foe2').aiCtl, 'the wreck goes back to its bot (it revives with it where the mode revives)');
  controller.stop();
  assert.equal(game.watch, null, 'the ledger ends with the battle');
}

console.log('watchController selftest: PASS');
