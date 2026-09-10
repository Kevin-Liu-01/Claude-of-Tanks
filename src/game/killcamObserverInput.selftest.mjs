import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Scene, PerspectiveCamera } from 'three';
import { createKillCam } from './killcam.ts';

const previousWindow = globalThis.window;
const previousDocument = globalThis.document;
const listeners = new Map();
const calls = [];
let covered = true;
const scene = new Scene();
const camera = new PerspectiveCamera();
const entities = ['first', 'second'].map((id) => ({
  id, team: 'enemy', state: {}, visual: {}, combat: { destroyed: false },
}));
const game = { phase: 'battle', preBattleS: 5, tanks: entities,
  tankById: new Map(entities.map((entity) => [entity.id, entity])) };
const emit = (type, event) => {
  for (const listener of listeners.get(type) || []) listener(event);
};
globalThis.window = {
  addEventListener(type, listener) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(listener);
  },
  removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
};
globalThis.document = {
  pointerLockElement: null,
  createElement(tag) {
    assert.equal(tag, 'canvas', 'the observer must not create replay UI');
    return { width: 0, height: 0, getContext: () => ({
      createRadialGradient: () => ({ addColorStop() {} }),
      fillRect() {},
    }) };
  },
};

let killcam;
try {
  killcam = createKillCam({
    scene, camera, heightField: { getHeightAt: () => 0 },
    getPlayer: () => null, getGame: () => game,
    isBattleEntryCovered: () => covered,
    rig: {
      startSpectate: (entity) => calls.push(['start', entity.id]),
      setSpectateTarget: (entity) => calls.push(['target', entity.id]),
      spectateLook: (x, y) => calls.push(['look', x, y]),
      spectateZoom: (direction) => calls.push(['zoom', direction]),
      stopSpectate: () => calls.push(['stop']),
    },
  });
  assert.equal(killcam.spectate.startObserver(), true,
    'covered activation can select the initial target for exact camera warming');
  assert.deepEqual(calls, [['start', 'first']]);
  emit('mousemove', { movementX: 90, movementY: 30, clientX: 900, clientY: 300 });
  emit('wheel', { deltaY: 120 });
  emit('keydown', { code: 'ArrowRight', repeat: false });
  killcam.spectate.cycle(-1);
  assert.deepEqual(calls, [['start', 'first']],
    'covered pointer, wheel, key, and exposed target-cycle input cannot change the reveal camera');
  assert.equal(killcam.spectate.targetId, 'first');

  covered = false;
  emit('mousemove', { movementX: 0, movementY: 0, clientX: 100, clientY: 100 });
  assert.equal(calls.length, 1, 'covered cursor positions cannot accumulate a reveal jump');
  emit('mousemove', { movementX: 0, movementY: 0, clientX: 105, clientY: 107 });
  emit('wheel', { deltaY: -120 });
  emit('keydown', { code: 'KeyD', repeat: false });
  assert.deepEqual(calls.slice(1), [['look', 5, 7], ['zoom', -1], ['target', 'second']],
    'revealed five-second countdown retains normal orbit, zoom, and target blending');
  assert.equal(game.preBattleS, 5);

  covered = true;
  emit('mousemove', { movementX: 0, movementY: 0, clientX: 600, clientY: 400 });
  emit('keydown', { code: 'KeyA', repeat: false });
  covered = false;
  emit('mousemove', { movementX: 0, movementY: 0, clientX: 620, clientY: 420 });
  assert.equal(calls.length, 4, 'a later covered interval also resets fallback delta history');
  emit('mousemove', { movementX: 2, movementY: 3, clientX: 622, clientY: 423 });
  assert.deepEqual(calls.at(-1), ['look', 2, 3], 'ordinary pointer movement resumes without a blend reset');
  killcam.spectate.stop();
  assert.ok([...listeners.values()].every((registered) => registered.size === 0),
    'stopping spectate releases every registered input listener');
} finally {
  killcam?.spectate.stop();
  globalThis.window = previousWindow;
  globalThis.document = previousDocument;
}

const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
assert.match(main,
  /isBattleEntryCovered: \(\) => battleEntryLifecycle\.renderingCovered \|\| battleLoad\.covering/,
  'production combines render ownership and the painted loader, not pending or countdown state');
console.log('killcamObserverInput.selftest: covered observer camera, visible countdown, delta reset and listener cleanup pass');
