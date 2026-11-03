// 2026-11-02 audit F2/F3: the solo entry owner. Only the Garage BATTLE button announced its battle (ui:battleStart);
// Play-menu solo and campaign starts announced nothing, so the profile kept no record of them. And a start accepted
// while a Garage return was still in flight raced the return's restore instead of waiting for it.
import assert from 'node:assert/strict';
import { createBattleEntryLifecycle } from './battleEntryLifecycle.ts';
import { createSoloBattleEntryRuntime } from './soloBattleEntryRuntime.ts';
import { createBus } from './stateCore.ts';

const storage = new Map();
globalThis.localStorage ??= {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};
const { getPlayerRecord, installBattleRecords } = await import('./profile.ts');

function createEntry({ whenGarageSettled } = {}) {
  const bus = createBus();
  const order = [];
  const announced = [];
  bus.on('ui:battleStart', (payload) => { announced.push(payload); order.push('announce'); });
  const lifecycle = createBattleEntryLifecycle({ nextFrame: async () => {}, now: () => 0 });
  let finishLoad = null;
  const runtime = createSoloBattleEntryRuntime({
    lifecycle,
    loading: { begin: () => { order.push('load'); return new Promise((resolve) => { finishLoad = resolve; }); } },
    battleLoad: { showPending: () => order.push('cover'), hide: async () => {} },
    audio: { loadingOn() {} },
    enterGarage: () => {},
    nextFrame: async () => {},
    isVisibleSpecId: () => true,
    getSelectedSpecId: () => 'm1a1_abrams_hc',
    getSelectedMapId: () => 'desert',
    reportError: () => order.push('error'),
    announce: (payload) => bus.emit('ui:battleStart', payload),
    ...(whenGarageSettled ? { whenGarageSettled } : {}),
  });
  return { bus, order, announced, lifecycle, runtime, finish: () => finishLoad?.() };
}

// A Play-menu or campaign start announces its battle once, before its cover, with its rules and operation.
{
  const entry = createEntry();
  const started = entry.runtime.beginSelected({ specId: 'leo2_improved', mapId: 'urban', gameMode: 'frontline_assault',
    campaignOperationId: 'op-1' });
  assert.deepEqual(entry.announced, [{ specId: 'leo2_improved', mapId: 'urban', gameMode: 'frontline_assault',
    campaignOperationId: 'op-1' }]);
  assert.deepEqual(entry.order.slice(0, 2), ['announce', 'cover'], 'announced inside the press, before the cover');
  assert.equal(await entry.runtime.beginSelected({}), undefined);
  assert.equal(entry.announced.length, 1, 'a start refused as busy announces nothing');
  entry.finish();
  await started;
}

// The Garage BATTLE button announces its own press; its entry does not announce it a second time.
{
  const entry = createEntry();
  const started = entry.runtime.begin('m1a1_abrams_hc', 'desert', { gameMode: 'standard' });
  assert.deepEqual(entry.announced, []);
  entry.finish();
  await started;
}

// The profile records a Play-menu battle (it began its tally only on ui:battleStart).
{
  const entry = createEntry();
  installBattleRecords(entry.bus);
  const before = getPlayerRecord().matches;
  const started = entry.runtime.beginSelected({ specId: 'leo2_improved', mapId: 'urban' });
  entry.finish();
  await started;
  entry.bus.emit('battle:ended', { result: 'victory', durationS: 61, mapId: 'urban', gameMode: 'standard' });
  assert.equal(getPlayerRecord().matches, before + 1, 'a Play-menu battle is in the match history');
  // a battle left without its result keeps no tally into the next one
  const quit = entry.runtime.beginSelected({ specId: 'leo2_improved', mapId: 'urban' });
  entry.finish();
  await quit;
  entry.bus.emit('phase:change', { phase: 'garage' });
  entry.bus.emit('battle:ended', { result: 'defeat', durationS: 12, mapId: 'urban', gameMode: 'standard' });
  assert.equal(getPlayerRecord().matches, before + 1, "a later result never lands on a quit battle's stale tally");
}

// A start accepted during a Garage return waits for the return, holding the entry latch.
{
  let settle;
  const returning = new Promise((resolve) => { settle = resolve; });
  let inFlight = true;
  const entry = createEntry({ whenGarageSettled: () => (inFlight ? returning : null) });
  const started = entry.runtime.beginSelected({});
  await Promise.resolve();
  assert.deepEqual(entry.order, ['announce'], 'the cover and the load wait for the return');
  assert.equal(entry.lifecycle.pending, true, 'the queued start holds the entry latch');
  assert.equal(await entry.runtime.beginSelected({}), undefined, 'a second press while queued is refused, not stacked');
  inFlight = false;
  settle();
  for (let i = 0; i < 4; i += 1) await Promise.resolve();
  assert.deepEqual(entry.order, ['announce', 'cover', 'load']);
  entry.finish();
  await started;
  // no return in flight: the cover lands inside the press's task, as before
  const next = entry.runtime.beginSelected({});
  assert.deepEqual(entry.order.slice(-3), ['announce', 'cover', 'load']);
  entry.finish();
  await next;
}

console.log('soloBattleEntryAnnounce.selftest: every solo start announces its battle, and waits for a Garage return passed');
