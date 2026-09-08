import assert from 'node:assert/strict';
import { createPlaySurfaceRuntime } from './playSurfaceRuntime.ts';

for (const mode of ['private', 'lan']) {
for (const outcome of ['ready', 'deferred', 'reject', 'throw']) {
  const preloads = [];
  const shown = [];
  const failures = [];
  const invite = { roomCode: 'ABC123', autoJoin: true };
  const failure = new Error('optional preload failed');
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const startPreload = (name) => {
    preloads.push(name);
    if (outcome === 'deferred') return gate;
    if (outcome === 'reject') return Promise.reject(failure);
    if (outcome === 'throw') throw failure;
  };
  const surface = createPlaySurfaceRuntime({
    loadMenuModule: async () => ({
      createPlayMenu: () => ({
        show: (selectedMode, selectedInvite) => shown.push([selectedMode, selectedInvite]),
        showCurrentRoom: () => false,
        hide() {},
      }),
      preloadPlayMode: (selectedMode) => startPreload(`mode:${selectedMode}`),
    }),
    createMenuOptions: () => ({}),
    getSelectedSpecId: () => 'm1a2',
    getSelectedMapId: () => 'winter',
    startSolo: () => assert.fail('an invite must not start solo'),
    showActiveRoom: () => false,
    preloadCommon: [() => startPreload('hud'), () => startPreload('fx')],
    preloadNetworkPresentation: () => startPreload('network'),
    preloadPrivateMatch: () => startPreload('private'),
    reportError: (scope, error) => failures.push({ scope, error }),
  });
  assert.deepEqual(preloads, [], 'constructing the owner does not start passive Garage preparation');
  const opening = surface.open({ mode, invite });
  try {
    const opened = await Promise.race([
      opening.then(() => true),
      new Promise((resolve) => setImmediate(() => resolve(false))),
    ]);
    assert.equal(opened, true, `${mode}/${outcome}: optional preparation never gates room opening`);
    assert.deepEqual(preloads, ['hud', 'fx', 'network', 'private', `mode:${mode}`],
      `${mode}: a fresh no-hover invite starts the existing explicit preload policy`);
    assert.deepEqual(shown, [[mode, invite]], 'native mode and invite pass through unchanged');
    if (outcome === 'reject' || outcome === 'throw') {
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(failures.length, 5, 'every failed optional task is observed without blocking the others');
      assert.ok(failures.every((entry) => entry.error === failure), 'optional failures retain their identity');
    } else assert.deepEqual(failures, []);
  } finally {
    release();
    await opening;
  }
}
}

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

const beforeSolo = events.slice();
await runtime.open({ mode: 'solo', specId: 't90m', mapId: 'desert' });
assert.deepEqual(soloStarts, [{ specId: 't90m', mapId: 'desert' }]);
assert.equal(createCalls, 0, 'solo entry does not construct the play menu');
await runtime.open({ mode: 'solo', specId: 'm1a2', mapId: 'winter', gameMode: 'zone_control' });
assert.deepEqual(soloStarts.at(-1), {
  specId: 'm1a2', mapId: 'winter', gameMode: 'zone_control',
}, 'solo objective selection reaches the battle-loading boundary');
assert.deepEqual(events, beforeSolo, 'direct solo entry adds no common or multiplayer preload');

activeRoom = true;
const beforeActiveRoom = events.slice();
await runtime.open({ mode: 'private' });
assert.equal(createCalls, 0, 'an active room wins before menu acquisition');
assert.deepEqual(events, beforeActiveRoom, 'the active-room guard starts no extra preload');
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
const beforeCurrentRoom = events.slice();
await runtime.open({ mode: 'ranked' });
assert.equal(events.filter((event) => event[0] === 'show').length, 2,
  'an already presented room prevents operation replacement');
assert.deepEqual(events, beforeCurrentRoom, 'the retained-menu room guard starts no extra preload');
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
  reportError: (scope, error) => errors.push([scope, error.message]),
});
await assert.rejects(() => retryRuntime.open({ mode: 'private' }), /cold evaluation failed/);
await retryRuntime.open({ mode: 'private' });
assert.equal(retryCreates, 2, 'a failed menu construction remains retryable');

menuShowsRoom = false;
events.length = 0;
runtime.preload('ranked');
await Promise.resolve();
await Promise.resolve();
assert.ok(events.some((event) => event[0] === 'preload' && event[1] === 'private'),
  'stale Ranked intent warms the supported private path');
assert.ok(!events.some((event) => event.includes('ranked') || event.includes('dedicated')),
  'retired Ranked intent never acquires a ranked or dedicated dependency');
await runtime.open({ mode: 'ranked' });
assert.deepEqual(events.at(-1), ['show', 'private', undefined],
  'stale Ranked selection opens private rooms instead of an unavailable queue');

assert.deepEqual(errors, []);
console.log('playSurfaceRuntime.selftest: preload, room, solo, dismissal and retry passed');
