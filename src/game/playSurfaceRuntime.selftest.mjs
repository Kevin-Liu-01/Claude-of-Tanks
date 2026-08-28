import assert from 'node:assert/strict';
import { createPlaySurfaceRuntime } from './playSurfaceRuntime.ts';

const events = [];
let createCalls = 0;
let activeRoom = false;
let menuShowsRoom = false;
let failCreate = false;
let capturedOptions = null;
const menu = {
  show: (mode, invite) => events.push(['show', mode, invite]),
  hide: (closeSession) => events.push(['hide', closeSession]),
  showCurrentRoom: () => menuShowsRoom,
  attachActiveRoom() {},
  updateActiveRoom() {},
  detachActiveRoom() {},
  showActiveRoom: () => menuShowsRoom,
  syncGarageSelection() {},
};
const module = {
  createPlayMenu(options) {
    createCalls++;
    capturedOptions = options;
    if (failCreate) throw new Error('create failed');
    return menu;
  },
  preloadPlayMode: (mode) => events.push(['mode-preload', mode]),
};
const soloStarts = [];
const errors = [];
const runtime = createPlaySurfaceRuntime({
  loadMenuModule: async () => module,
  createMenuOptions: () => ({ maps: ['verdant'] }),
  getSelectedSpecId: () => 'm1a2',
  getSelectedMapId: () => 'winter',
  startSolo: (request) => soloStarts.push(request),
  showActiveRoom: async () => activeRoom,
  preloadCommon: [
    () => events.push(['common', 'hud']),
    () => events.push(['common', 'fx']),
  ],
  preloadNetworkPresentation: () => events.push(['preload', 'network']),
  preloadPrivateMatch: () => events.push(['preload', 'private']),
  preloadDedicatedMatch: () => events.push(['preload', 'dedicated']),
  reportError: (scope, error) => errors.push([scope, error.message]),
});

runtime.preload('private');
await Promise.resolve();
await Promise.resolve();
assert.deepEqual(events.slice(0, 5), [
  ['common', 'hud'],
  ['common', 'fx'],
  ['preload', 'network'],
  ['preload', 'private'],
  ['mode-preload', 'private'],
]);
assert.ok(!events.some((event) => event[1] === 'dedicated'),
  'private intent never warms the dedicated client');

await runtime.open({ mode: 'solo', specId: 't90m', mapId: 'desert' });
assert.deepEqual(soloStarts, [{ specId: 't90m', mapId: 'desert' }]);
assert.equal(createCalls, 0, 'solo entry does not construct the play menu');
await runtime.open({ mode: 'solo', specId: 'm1a2', mapId: 'winter', gameMode: 'zone_control' });
assert.deepEqual(soloStarts.at(-1), {
  specId: 'm1a2', mapId: 'winter', gameMode: 'zone_control',
}, 'solo objective selection reaches the battle-loading boundary');

activeRoom = true;
await runtime.open({ mode: 'private' });
assert.equal(createCalls, 0, 'an active room wins before menu acquisition');
activeRoom = false;

const customStarts = [];
await Promise.all([
  runtime.open({ mode: 'private', invite: { roomCode: 'ABC123' },
    startSolo: () => customStarts.push('custom') }),
  runtime.open({ mode: 'lan' }),
]);
assert.equal(createCalls, 1, 'concurrent opens share one menu instance');
assert.deepEqual(events.filter((event) => event[0] === 'show'), [
  ['show', 'private', { roomCode: 'ABC123' }],
  ['show', 'lan', undefined],
]);
assert.equal(runtime.getMenuPromise() instanceof Promise, true);
capturedOptions.onSolo();
await Promise.resolve();
assert.deepEqual(customStarts, [],
  'the latest operation owns the menu solo fallback instead of stale intent');
assert.deepEqual(soloStarts.at(-1), { specId: 'm1a2', mapId: 'winter' });

menuShowsRoom = true;
await runtime.open({ mode: 'ranked' });
assert.equal(events.filter((event) => event[0] === 'show').length, 2,
  'an already presented room prevents operation replacement');
assert.equal(await runtime.showCurrentRoom(), true);
runtime.hideForBattle();
await Promise.resolve();
assert.deepEqual(events.at(-1), ['hide', false]);

let retryCreates = 0;
const retryRuntime = createPlaySurfaceRuntime({
  loadMenuModule: async () => ({
    ...module,
    createPlayMenu(options) {
      retryCreates++;
      if (retryCreates === 1) throw new Error('cold evaluation failed');
      capturedOptions = options;
      return menu;
    },
  }),
  createMenuOptions: () => ({}),
  getSelectedSpecId: () => 'm1a2',
  getSelectedMapId: () => 'winter',
  startSolo: () => {},
  showActiveRoom: () => false,
  preloadCommon: [],
  preloadNetworkPresentation: () => {},
  preloadPrivateMatch: () => {},
  preloadDedicatedMatch: () => {},
  reportError: (scope, error) => errors.push([scope, error.message]),
});
await assert.rejects(() => retryRuntime.open({ mode: 'private' }), /cold evaluation failed/);
await retryRuntime.open({ mode: 'private' });
assert.equal(retryCreates, 2, 'a failed menu construction remains retryable');

assert.deepEqual(errors, []);
console.log('playSurfaceRuntime.selftest: preload, room, solo, dismissal and retry passed');
