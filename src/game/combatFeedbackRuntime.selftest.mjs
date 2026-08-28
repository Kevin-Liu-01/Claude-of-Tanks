import assert from 'node:assert/strict';
import { createCombatFeedbackRuntime } from './combatFeedbackRuntime.ts';
import { createBus } from './stateCore.ts';

const bus = createBus();
const calls = [];
const target = {
  id: 'target',
  spec: { gun: { caliberMm: 120 } },
  state: { yaw: 0.4 },
  visual: {
    stripEra: (plate) => calls.push(['era', plate]),
    hitFlinch: (...args) => calls.push(['flinch', ...args]),
  },
};
const player = {
  id: 'player',
  spec: {
    gun: {
      caliberMm: 120,
      shells: [
        { name: 'TYPE FALLBACK', type: 'APFSDS', caliberMm: 105 },
        { name: 'M829A4', type: 'APFSDS', caliberMm: 120 },
      ],
    },
  },
};
const game = { player, tankById: new Map([['target', target], ['player', player]]) };
let networkMatch = false;
let fx = null;
let destroyedSink = null;
const runtime = createCombatFeedbackRuntime({
  bus,
  game,
  rig: {
    addTrauma: (amount) => calls.push(['trauma', amount]),
    recoilKick: (...args) => calls.push(['recoil', ...args]),
  },
  audio: { hitConfirm: (...args) => calls.push(['confirm', ...args]) },
  getFx: () => fx,
  hasNetworkMatch: () => networkMatch,
  shotRecoilScale: (_spec, shell) => {
    calls.push(['shell', shell?.name]);
    return 1.5;
  },
  setDestroyedEventSink: (sink) => { destroyedSink = sink; },
  trimGarageTanks: (capacity) => calls.push(['trim', capacity]),
  getDeviceTier: () => 'mobile',
});

bus.emit('shell:hit', {
  targetId: 'target', attackerId: 'player', normal: [1, 0, -1],
  kind: 'pen', damage: 400, caliberMm: 120, eraPlate: 'left-cheek',
});
assert.deepEqual(calls.slice(0, 3), [
  ['era', 'left-cheek'],
  ['flinch', 1, -1, 1.2, 0.4],
  ['confirm', 'pen', 400],
], 'hits preserve ERA, flinch, and attacker confirmation reactions');

bus.emit('shell:hit', { targetId: 'player', kind: 'pen', damage: 240, caliberMm: 120 });
assert.equal(calls.at(-1)[0], 'trauma', 'received damage reaches the camera rig');

bus.emit('shell:fired', { isPlayer: true, shellName: 'M829A4', shellType: 'APFSDS' });
assert.equal(calls.some(([kind]) => kind === 'recoil'), false, 'solo authority owns solo recoil');
networkMatch = true;
bus.emit('shell:fired', { isPlayer: true, shellName: 'M829A4', shellType: 'APFSDS' });
assert.deepEqual(calls.slice(-3).map((entry) => entry[0]), ['shell', 'trauma', 'recoil'],
  'network fire restores shell-specific camera and FOV recoil');
assert.equal(calls.find((entry) => entry[0] === 'shell')[1], 'M829A4',
  'exact shell name wins over an earlier type fallback');

fx = { propCrush: (position, direction, height) => {
  calls.push(['crush', position.toArray(), direction.toArray(), height]);
} };
bus.emit('prop:crushed', { pos: [2, 3, 4], dir: [5, 6, 7], h: 8 });
assert.deepEqual(calls.at(-1), ['crush', [2, 3, 4], [5, 0, 7], 8],
  'prop crush feedback reuses world-position and planar-direction scratch');

bus.emit('phase:change', { phase: 'battle' });
assert.deepEqual(calls.at(-1), ['trim', 1], 'mobile battle entry keeps one Garage hero');
let forwarded = null;
bus.on('prop:destroyed', (event) => { forwarded = event; });
destroyedSink({ kind: 'fence', pos: [0, 1, 2], cause: 'ram' });
assert.equal(forwarded.kind, 'fence', 'world destruction crosses the event-bus seam');

runtime.dispose();
assert.equal(destroyedSink, null, 'disposal clears the global destruction sink');
const countAfterDispose = calls.length;
bus.emit('phase:change', { phase: 'battle' });
assert.equal(calls.length, countAfterDispose, 'disposal removes every bus listener');

console.log('combatFeedbackRuntime.selftest: effects, recoil, damage, and lifecycle passed');
