import assert from 'node:assert/strict';
import { browserRosterTextureQuality, prepareBrowserBattleRosterAssets } from './browserRosterAssets.ts';
import { isNetworkBattleEntryAbortError } from './networkBattleEntryAbort.ts';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const nextTask = () => new Promise((resolve) => setImmediate(resolve));
assert.equal(browserRosterTextureQuality('viewer', 'viewer', false), 'high');
assert.equal(browserRosterTextureQuality('peer', 'viewer', false), 'ai');
assert.equal(browserRosterTextureQuality('viewer', 'viewer', true), 'ai');
const players = [
  { id: 'viewer', name: 'Viewer', specId: 'm1a2', camo: 'auto', team: 'alpha' },
  { id: 'peer', name: 'Peer', specId: 't90m', camo: 'factory', team: 'bravo' },
];

function fixture(options = {}, overrides = {}) {
  const events = [];
  const request = {
    players, viewerId: 'viewer', spectator: false, mapId: 'winter', anisotropy: 4,
    rosterScheduling: { now: () => 0, yieldFrame: async () => {}, yieldTask: async () => {} },
    ...options,
  };
  const dependencies = {
    ensureTankBuilder: async (id) => { events.push(['builder', id]); },
    getSpec: (id) => ({ id }),
    resolveMultiplayerCamoPattern: (id, camo, map) => {
      events.push(['resolve', id, camo, map]);
      return camo === 'auto' ? map : camo;
    },
    acquireSharedTextureLease: async (spec, anisotropy, quality, camo) => {
      events.push(['lease', spec.id, anisotropy, quality, camo]);
      return { release: () => events.push(['release', spec.id, quality, camo]) };
    },
    ...overrides,
  };
  return { events, request, dependencies,
    start: () => prepareBrowserBattleRosterAssets(request, dependencies) };
}

{
  const source = [
    { ...players[0] },
    { id: 'same-auto', specId: 'm1a2', camo: 'auto', team: 'bravo' },
    { id: 'same-fixed', specId: 'm1a2', camo: 'winter', team: 'bravo' },
    { id: 'other-camo', specId: 'm1a2', camo: 'desert', team: 'bravo' },
    { id: 'default-camo', specId: 't90m', team: 'alpha' },
    { id: 'observer', specId: 'leclerc', camo: 'auto', team: 'spectator' },
  ];
  const f = fixture({ players: source });
  const job = f.start();
  assert.notEqual(job.players, source);
  assert.ok(job.players.every((player, index) => player !== source[index]));
  assert.deepEqual(job.players.map((player) => player.camo),
    ['winter', 'winter', 'winter', 'desert', 'factory', 'winter']);
  assert.equal(f.events.length, source.length,
    'every map/camo identity is resolved synchronously, before any builder or painter');
  source[0].specId = 'mutated';
  source[0].name = 'Changed';
  source[1].camo = 'factory';
  source.push({ id: 'late', specId: 'late', team: 'alpha' });
  f.request.mapId = 'desert';
  f.request.viewerId = 'same-auto';
  f.request.spectator = true;
  f.request.anisotropy = 16;
  await job.ready;
  assert.equal(job.players[0].name, 'Viewer');
  assert.deepEqual(f.events.filter(([kind]) => kind === 'builder'),
    [['builder', 'm1a2'], ['builder', 't90m']], 'builders load once per distinct active spec');
  assert.deepEqual(f.events.filter(([kind]) => kind === 'lease'), [
    ['lease', 'm1a2', 4, 'high', 'winter'],
    ['lease', 'm1a2', 4, 'ai', 'winter'],
    ['lease', 'm1a2', 4, 'ai', 'desert'],
    ['lease', 't90m', 4, 'ai', 'factory'],
  ], 'only exact spec/concrete-camo/viewer-quality tuples coalesce');
  assert.equal(f.events.filter(([kind]) => kind === 'release').length, 0,
    'ready retains leases for ordinary visual acquisition');
  const disposed = job.dispose();
  assert.equal(job.dispose(), disposed, 'disposal joins the exact same promise');
  await disposed;
  await job.dispose();
  assert.equal(f.events.filter(([kind]) => kind === 'release').length, 4);
}

{
  const f = fixture({ spectator: true });
  const job = f.start();
  await job.ready;
  assert.deepEqual(f.events.filter(([kind]) => kind === 'lease').map((row) => row[3]),
    ['ai', 'ai'], 'a spectator has no high-quality viewer visual');
  await job.dispose();
}

{
  const failure = new Error('second paint failed');
  const released = [];
  const unhandled = [];
  const onUnhandled = (error) => unhandled.push(error);
  process.on('unhandledRejection', onUnhandled);
  try {
    const f = fixture({}, {
      acquireSharedTextureLease: async (spec) => {
        if (spec.id === 't90m') throw failure;
        return { release: () => released.push(spec.id) };
      },
    });
    const job = f.start();
    await nextTask();
    assert.deepEqual(unhandled, [], 'a pending world join cannot expose an unhandled asset failure');
    await assert.rejects(job.ready, (error) => error === failure);
    assert.deepEqual(released, [], 'a failed optional warm keeps earlier successful leases');
    await job.dispose();
    await job.dispose();
    assert.deepEqual(released, ['m1a2']);
    await assert.rejects(job.ready, (error) => error === failure,
      'disposal never replaces the original readiness rejection');
  } finally {
    process.removeListener('unhandledRejection', onUnhandled);
  }
}

{
  const builder = deferred();
  const started = deferred();
  const f = fixture({}, {
    ensureTankBuilder: async (id) => { started.resolve(id); await builder.promise; },
  });
  const job = f.start();
  assert.equal(await started.promise, 'm1a2');
  let disposed = false;
  const draining = job.dispose().then(() => { disposed = true; });
  await nextTask();
  assert.equal(disposed, false, 'pending builder completion is joined before disposal returns');
  builder.resolve();
  await draining;
  await job.ready;
  assert.deepEqual(f.events.filter(([kind]) => kind === 'lease'), [],
    'disposed preparation never starts paint after a late builder completion');
}

{
  const painter = deferred();
  const started = deferred();
  const acquired = [];
  const released = [];
  const f = fixture({}, {
    acquireSharedTextureLease: async (spec) => {
      acquired.push(spec.id);
      started.resolve();
      await painter.promise;
      return { release: () => released.push(spec.id) };
    },
  });
  const job = f.start();
  await started.promise;
  let disposed = false;
  const draining = job.dispose().then(() => { disposed = true; });
  await nextTask();
  assert.equal(disposed, false, 'dispose must not race the active painter');
  assert.deepEqual(released, []);
  painter.resolve();
  await draining;
  await job.ready;
  assert.deepEqual(acquired, ['m1a2'], 'disposal stops before the next texture job');
  assert.deepEqual(released, ['m1a2'], 'late completed lease is retained and then released');
}

{
  const controller = new AbortController();
  controller.abort('already cancelled');
  const f = fixture({ signal: controller.signal });
  const job = f.start();
  await assert.rejects(job.ready, isNetworkBattleEntryAbortError);
  assert.equal(f.events.some(([kind]) => kind === 'builder' || kind === 'lease'), false);
  await job.dispose();
}

{
  const controller = new AbortController();
  const painter = deferred();
  const started = deferred();
  const released = [];
  const f = fixture({ signal: controller.signal }, {
    acquireSharedTextureLease: async (spec, _aniso, _quality, _camo, tick) => {
      started.resolve();
      await painter.promise;
      await assert.doesNotReject(tick, 'abort must not throw inside an in-place painter tick');
      return { release: () => released.push(spec.id) };
    },
  });
  const job = f.start();
  await started.promise;
  controller.abort('cancel during paint');
  const draining = job.dispose();
  painter.resolve();
  await assert.rejects(job.ready, isNetworkBattleEntryAbortError);
  await draining;
  assert.deepEqual(released, ['m1a2']);
}

{
  const failure = new Error('builder failed');
  const f = fixture({}, { ensureTankBuilder: async () => { throw failure; } });
  const job = f.start();
  await assert.rejects(job.ready, (error) => error === failure);
  await job.dispose();
  assert.equal(f.events.some(([kind]) => kind === 'lease'), false);
}

{
  const released = [];
  const f = fixture({}, {
    acquireSharedTextureLease: async (spec) => ({ release() {
      released.push(spec.id);
      if (spec.id === 'm1a2') throw new Error('cleanup failure');
    } }),
  });
  const job = f.start();
  await job.ready;
  await assert.doesNotReject(job.dispose());
  await job.dispose();
  assert.deepEqual(released, ['m1a2', 't90m'],
    'a failing release cannot skip another lease or make cleanup mask an entry error');
}

{
  let clock = 0;
  const waits = [];
  const f = fixture({
    players: [players[0]],
    rosterScheduling: {
      now: () => clock,
      yieldFrame: async () => { waits.push('frame'); },
      yieldTask: async () => { waits.push('task'); },
    },
  }, {
    acquireSharedTextureLease: async (_spec, _aniso, _quality, _camo, tick) => {
      for (const time of [4, 9, 20, 51]) { clock = time; await tick(); }
      return { release() {} };
    },
  });
  const job = f.start();
  await job.ready;
  assert.deepEqual(waits, ['task', 'task', 'frame'],
    'painting reuses the real opaque-loading budget and periodic progress paints');
  await job.dispose();
}

{
  const f = fixture({ players: [] });
  const job = f.start();
  await job.ready;
  await job.dispose();
  assert.deepEqual(job.players, []);
  assert.deepEqual(f.events, []);
}

console.log('browserRosterAssets.selftest: exact assets, identity binding, failure retention and cancellation drain passed');
