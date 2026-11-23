// death-flow-275 (Kevin 2026-11-22: "when tanks are dead and you can look through tank perspectives use a and d and q and
// e. also be able to land on yoursel (your dead tank) lol"): the dead player's spectate list is the own wreck first, then
// the living allies; A / Q step back and D / E (and the arrows) on, round the list and back onto the wreck; a pad's
// shoulders and d-pad step it too; the wreck is a stop the view stays on (never auto-advanced as a dead ally is). With no
// ally alive there is nothing to step to and the death orbit holds. Render and input only: no sim or wire change.
// Copyright © 2026 Kevin B. Liu.
import assert from 'node:assert/strict';
import { Scene, PerspectiveCamera } from 'three';
import { createKillCam } from './killcam.ts';

const previousWindow = globalThis.window;
const previousDocument = globalThis.document;
const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const listeners = new Map();
const calls = [];
const intervals = [];
const tank = (id, team, extra = {}) => ({ id, team, state: {}, visual: {}, combat: { destroyed: false }, ...extra });
const player = tank('me', 'player', { isPlayer: true, combat: { destroyed: true } });
const allies = [tank('a1', 'player'), tank('a2', 'player')];
const enemy = tank('e1', 'enemy');
const tanks = [player, ...allies, enemy];
const game = { phase: 'battle', result: null, ruleset: { respawnS: null }, tanks, tankById: new Map(tanks.map((t) => [t.id, t])) };
const emit = (type, event) => { for (const listener of listeners.get(type) || []) listener(event); };
const key = (code) => emit('keydown', { code, repeat: false });
let padButtons = [];
globalThis.window = {
  addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(listener); },
  removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
};
globalThis.document = {
  pointerLockElement: null,
  createElement: () => ({ width: 0, height: 0, getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }),
};
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
  getGamepads: () => [{ buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: padButtons.includes(i) })) }],
} });
const realSetInterval = globalThis.setInterval;
const realClearInterval = globalThis.clearInterval;
globalThis.setInterval = (fn, ms) => { const id = { fn, ms }; intervals.push(id); return id; };
globalThis.clearInterval = (id) => { const i = intervals.indexOf(id); if (i >= 0) intervals.splice(i, 1); };
const padTick = () => { for (const id of intervals.filter((entry) => entry.ms === 50)) id.fn(); };

try {
  const killcam = createKillCam({
    scene: new Scene(), camera: new PerspectiveCamera(), heightField: { getHeightAt: () => 0 },
    getPlayer: () => player, getGame: () => game, isBattleEntryCovered: () => false,
    rig: {
      startSpectate: (entity) => calls.push(['start', entity.id]),
      setSpectateTarget: (entity) => calls.push(['target', entity.id]),
      spectateLook() {}, spectateZoom() {}, stopSpectate: () => calls.push(['stop']),
    },
  });
  assert.equal(killcam.spectate.maybeStart(), true, 'a dead player with allies alive spectates');
  assert.deepEqual(calls, [['start', 'me']], 'the view opens on the player\'s own wreck');
  key('KeyD');
  key('KeyE');
  key('ArrowRight');
  assert.deepEqual(calls.slice(1).map(([, id]) => id), ['a1', 'a2', 'me'], 'D, E and → step on, round onto the wreck');
  key('KeyA');
  key('KeyQ');
  key('ArrowLeft');
  assert.deepEqual(calls.slice(4).map(([, id]) => id), ['a2', 'a1', 'me'], 'A, Q and ← step back');
  assert.ok(!calls.some(([, id]) => id === 'e1'), 'never an enemy (a dead crew sees what its side sees)');
  // the pad: a shoulder press steps once on its edge, a hold does not repeat
  const before = calls.length;
  padButtons = [5]; padTick(); padTick();
  padButtons = []; padTick();
  padButtons = [14]; padTick();
  padButtons = []; padTick();
  assert.deepEqual(calls.slice(before).map(([, id]) => id), ['a1', 'me'], 'RB steps on, d-pad left back, once a press');
  // the wreck is a stop: the watch never auto-advances off it
  const watch = intervals.find((entry) => entry.ms === 400);
  const held = calls.length;
  watch.fn();
  assert.equal(calls.length, held, 'the view stays on the own wreck');
  // with no ally alive there is nothing to step to: spectate ends (the death orbit holds the wreck)
  killcam.spectate.stop(false);
  for (const ally of allies) ally.combat.destroyed = true;
  calls.length = 0;
  assert.equal(killcam.spectate.maybeStart(), false, 'no ally alive: no spectate list, the orbit holds');
  // a mode that revives never spectates (the respawn dial counts)
  for (const ally of allies) ally.combat.destroyed = false;
  game.ruleset = { respawnS: 6 };
  assert.equal(killcam.spectate.maybeStart(), false, 'a reviving mode never hands the camera to the spectate list');
} finally {
  globalThis.window = previousWindow;
  globalThis.document = previousDocument;
  if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
  globalThis.setInterval = realSetInterval;
  globalThis.clearInterval = realClearInterval;
}
console.log('spectateCycle.selftest: the own wreck first, A/Q back and D/E on round the list, the pad\'s shoulders and d-pad, the wreck a stop, no list without allies');
