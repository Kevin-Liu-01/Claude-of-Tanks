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

function createEntry({ whenGarageSettled, canTakeScene } = {}) {
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
    ...(canTakeScene ? { canTakeScene } : {}),
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

// (round 4 F1) The Garage BATTLE button hands its press's announcement to its entry (begin's fourth argument), which
// runs it once it accepts the start: inside the press's task when no Garage return is in flight (the pointer lock's
// gesture), after the wait when one is, and never for a start it refuses (busy, or the scene after the wait). On
// 0edd0e1ab5 the button announced before begin(), so a start refused after the wait left ui:battleStart's effects
// standing: the pointer lock over the failed return's notice, settings' battle state, the hidden play surface and
// post's 'loading' hold.
{
  const pressAnnouncement = (entry, specId) => () => entry.bus.emit('ui:battleStart', { specId, mapId: 'desert' });
  const entry = createEntry();
  const started = entry.runtime.begin('m1a1_abrams_hc', 'desert', { gameMode: 'standard' },
    pressAnnouncement(entry, 'm1a1_abrams_hc'));
  assert.deepEqual(entry.order.slice(0, 2), ['announce', 'cover'],
    "no return in flight: the press's announcement, inside its task");
  assert.deepEqual(entry.announced, [{ specId: 'm1a1_abrams_hc', mapId: 'desert' }], 'its own payload, once');
  await entry.runtime.begin('t90a', 'desert', undefined, pressAnnouncement(entry, 't90a'));
  assert.equal(entry.announced.length, 1, 'a press refused as busy announces nothing');
  entry.finish();
  await started;
  // without a press's announcement (the debug hook, __DEBUG.beginBattleEntry) the entry announces nothing, as before
  const hook = createEntry();
  const hooked = hook.runtime.begin('m1a1_abrams_hc', 'desert', { gameMode: 'standard' });
  assert.deepEqual(hook.announced, []);
  hook.finish();
  await hooked;
  // a Garage return in flight: the press waits unannounced; refused after the wait, it never announces
  for (const lands of [true, false]) {
    let settle;
    let inFlight = true;
    let refused = false;
    const returning = new Promise((resolve) => { settle = resolve; });
    const waiting = createEntry({ whenGarageSettled: () => (inFlight ? returning : null), canTakeScene: () => !refused });
    const start = waiting.runtime.begin('m1a1_abrams_hc', 'desert', undefined,
      pressAnnouncement(waiting, 'm1a1_abrams_hc'));
    await Promise.resolve();
    assert.deepEqual(waiting.order, [], 'the press announces nothing while it waits for the return');
    refused = !lands; // the return failed: the scene owes the Garage
    inFlight = false;
    settle();
    for (let i = 0; i < 4; i += 1) await Promise.resolve();
    if (lands) {
      assert.deepEqual(waiting.order, ['announce', 'cover', 'load'], 'the return landed: announced, then covered');
      waiting.finish();
    } else assert.deepEqual(waiting.order, [], 'refused after the wait: nothing was announced, so nothing stands');
    await start;
  }
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
  // (round 2 U19) the announcement waits as well: the return's 'garage' comes first
  assert.deepEqual(entry.order, [], 'the announcement, the cover and the load wait for the return');
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

// (round 2 U19) A start queued under a Garage return is the battle the profile and the service record keep. The
// Garage button announced its own press then (a tool's click or a key press under the return's veil reaches it; round
// 4 F1 hands it to the entry, after the wait), and a Play-menu start announced before it waited; the return's own
// 'garage' announcement (the battle before leaving, from its screen) then dropped the queued battle's tally and
// tracker: no match in the history, and the service record's row lost its vehicle and map (mobilelap's map cycle did
// this). (round 4 F1, review r1) Both starts now announce after the return's 'garage', so the records drop a tally at
// every Garage again (round 2 U19's exception is gone; garageReturnState's records case).
{
  const { installServiceRecord, getServiceRecord } = await import('./serviceRecord.ts');
  const serviceContext = {
    playerId: () => 'me', playerTeam: () => 'player', teamOf: () => null, gameMode: () => 'standard', clockS: () => 0,
    playerHpFraction: () => 1, playerMaxHp: () => 2000, playerNation: () => 'Germany', playerAerialKind: () => null,
    respawns: () => false, playerObjectiveTeam: () => null,
  };
  for (const press of ['button', 'menu']) {
    let settle;
    let inFlight = true;
    const returning = new Promise((resolve) => { settle = resolve; });
    const entry = createEntry({ whenGarageSettled: () => (inFlight ? returning : null) });
    installBattleRecords(entry.bus);
    installServiceRecord(entry.bus, serviceContext);
    // the battle before, left from its report: the return is in flight
    entry.bus.emit('phase:change', { phase: 'battle', from: 'garage', reason: 'solo-start' });
    const before = getPlayerRecord().matches;
    let started;
    if (press === 'button') {
      // garage.ts launchBattle hands its announcement to the entry (round 4 F1; on 0edd0e1ab5 it emitted first)
      started = entry.runtime.begin('leo2_improved', 'urban', undefined,
        () => entry.bus.emit('ui:battleStart', { specId: 'leo2_improved', mapId: 'urban' }));
    } else started = entry.runtime.beginSelected({ specId: 'leo2_improved', mapId: 'urban' });
    await Promise.resolve();
    // the return hands the screen to the Garage, then settles; the queued entry goes on
    entry.bus.emit('phase:change', { phase: 'garage', from: 'battle', reason: 'garage-return:screen' });
    inFlight = false;
    settle();
    for (let i = 0; i < 4; i += 1) await Promise.resolve();
    assert.equal(entry.announced.length, 1, `${press}: one announcement`);
    entry.finish();
    await started;
    entry.bus.emit('phase:change', { phase: 'battle', from: 'garage', reason: 'solo-start' });
    entry.bus.emit('battle:ended', { result: 'victory', durationS: 61, mapId: 'urban', gameMode: 'standard', roster: [] });
    assert.equal(getPlayerRecord().matches, before + 1, `${press}: the queued battle is in the match history`);
    assert.equal(getPlayerRecord().lastBattle?.vehicleId, 'leo2_improved', `${press}: under its own vehicle`);
    assert.equal(getServiceRecord().history[0]?.vehicleId, 'leo2_improved', `${press}: and the service record's row names it`);
  }
  // a failed entry's recovery (the Garage again, from the Garage) still drops the tally it never reached
  const entry = createEntry();
  installBattleRecords(entry.bus);
  const before = getPlayerRecord().matches;
  const started = entry.runtime.beginSelected({ specId: 'leo2_improved', mapId: 'urban' });
  entry.finish();
  await started;
  entry.bus.emit('phase:change', { phase: 'garage', from: 'garage', reason: 'garage-return:screen' });
  entry.bus.emit('battle:ended', { result: 'defeat', durationS: 12, mapId: 'urban', gameMode: 'standard' });
  assert.equal(getPlayerRecord().matches, before, 'an entry that never reached its battle leaves no tally behind');
}

console.log('soloBattleEntryAnnounce.selftest: every solo start announces its battle, and waits for a Garage return passed');
