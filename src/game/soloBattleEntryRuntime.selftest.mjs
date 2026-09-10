import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createBattleEntryLifecycle } from './battleEntryLifecycle.ts';
import { createSoloBattleEntryRuntime } from './soloBattleEntryRuntime.ts';
import { createSoloBattleLoadingAccess } from './soloBattleLoadingAccess.ts';
import { createLazyAudio } from '../audio/lazyAudio.ts';

const order = [];
let shouldFail = true;
let loadingArgs = null;
const lifecycle = createBattleEntryLifecycle({
  nextFrame: async () => {},
  now: () => 0,
});
const runtime = createSoloBattleEntryRuntime({
  lifecycle,
  loading: {
    async begin(...args) {
      loadingArgs = args;
      order.push('load');
      if (shouldFail) throw new Error('cold chunk failed');
    },
  },
  battleLoad: {
    showPending: () => order.push('cover'),
    hide: async () => { order.push('hide'); },
  },
  audio: { loadingOn: (active) => order.push(`loading:${active}`) },
  enterGarage: () => order.push('garage'),
  nextFrame: async () => { order.push('frame'); },
  isVisibleSpecId: (id) => id === 'm1a2',
  getSelectedSpecId: () => 'leo2a7',
  getSelectedMapId: () => 'desert',
  reportError: () => order.push('error'),
});

await runtime.beginSelected({ specId: 'invalid', randomRoster: false, gameMode: 'horde' });
assert.deepEqual(loadingArgs, [
  'leo2a7', 'desert', { randomRoster: false, gameMode: 'horde' },
]);
assert.deepEqual(order, ['cover', 'load', 'error', 'loading:false', 'garage', 'frame', 'hide'],
  'failure restores and paints the Garage before the opaque loader fades');
assert.equal(lifecycle.pending, false);
assert.equal(lifecycle.renderingCovered, false);

order.length = 0;
shouldFail = false;
await runtime.beginSelected({ specId: 'm1a2', mapId: 'winter' });
assert.deepEqual(loadingArgs, [
  'm1a2', 'winter', { randomRoster: true, gameMode: 'standard' },
]);
assert.deepEqual(order, ['cover', 'load']);
assert.equal(lifecycle.pending, false);
assert.equal(lifecycle.renderingCovered, false);

assert.throws(() => createSoloBattleEntryRuntime({}), /requires every recovery port/);

for (const outcome of ['success', 'import-failure', 'paint-failure']) {
  const rejectImport = outcome !== 'success';
  const events = [];
  let resolveModule, rejectModule, releaseGarage, releasePaint, rejectPaint, releaseHide;
  let imports = 0, contexts = 0, mixerLoads = 0, begins = 0;
  let visible = false;
  const entryLifecycle = createBattleEntryLifecycle({ nextFrame: async () => {} });
  const audio = createLazyAudio({
    hasStickyActivation: () => true,
    createContext: () => { contexts++; return null; },
    loadMixer: async () => { mixerLoads++; return null; },
  });
  const screen = {
    showPending() { visible = true; events.push('pending:show'); },
    show() { assert.equal(visible, true); events.push('loader:enrich'); },
    async hide() {
      events.push('cover:hide');
      await new Promise(resolve => { releaseHide = resolve; });
      visible = false;
    },
  };
  const access = createSoloBattleLoadingAccess({
    options: () => ({}),
    load: () => {
      imports++;
      events.push('import');
      return new Promise((resolve, reject) => { resolveModule = resolve; rejectModule = reject; });
    },
  });
  const entry = createSoloBattleEntryRuntime({
    lifecycle: entryLifecycle, loading: access, battleLoad: screen, audio,
    enterGarage: async () => {
      events.push('garage');
      await new Promise(resolve => { releaseGarage = resolve; });
    },
    nextFrame: async () => {
      assert.equal(entryLifecycle.renderingCovered, false, 'restored Garage can render behind its DOM cover');
      events.push('garage:paint');
      await new Promise((resolve, reject) => { releasePaint = resolve; rejectPaint = reject; });
    },
    isVisibleSpecId: () => true,
    getSelectedSpecId: () => 'm1a2', getSelectedMapId: () => 'random',
    reportError: () => events.push('error'),
  });
  const pending = entry.beginSelected();
  assert.equal(visible, true, 'accepted cold entry owns its visible cover before waiting for its loading module');
  assert.equal(entryLifecycle.pending, true);
  assert.equal(entryLifecycle.renderingCovered, true);
  assert.deepEqual(events, ['pending:show'], 'cover is synchronous, before even the importer microtask');
  await Promise.resolve();
  assert.equal(imports, 1);
  assert.deepEqual([contexts, mixerLoads, begins], [0, 0, 0], 'pending import does not prepare audio or start loading work');
  await entry.beginSelected({ mapId: 'winter' });
  assert.deepEqual(events, ['pending:show', 'import'], 'a second click cannot restage the active cover or launch another entry');

  if (rejectImport) {
    rejectModule(new Error('held cold import failed'));
    for (let turn = 0; turn < 8 && !releaseGarage; turn++) await Promise.resolve();
    assert.equal(typeof releaseGarage, 'function');
    assert.equal(visible, true, 'failed import stays covered through asynchronous Garage restoration');
    assert.equal(entryLifecycle.renderingCovered, true);
    releaseGarage();
    for (let turn = 0; turn < 8 && !releasePaint; turn++) await Promise.resolve();
    assert.equal(typeof releasePaint, 'function');
    assert.equal(visible, true, 'recovered Garage must receive its paint opportunity before cover exit');
    assert.equal(releaseHide, undefined);
    await entry.beginSelected();
    assert.equal(events.filter(value => value === 'pending:show').length, 1, 'recovery retains the same exclusive entry owner');
    if (outcome === 'paint-failure') {
      const rejection = assert.rejects(pending, /recovered frame unavailable/);
      rejectPaint(new Error('recovered frame unavailable'));
      await rejection;
      assert.equal(visible, true, 'failed recovery paint cannot expose an unpainted Garage');
      assert.equal(releaseHide, undefined);
      assert.equal(entryLifecycle.pending, false);
      assert.equal(entryLifecycle.renderingCovered, false);
      assert.deepEqual([contexts, mixerLoads, begins], [0, 0, 0]);
      continue;
    }
    releasePaint();
    for (let turn = 0; turn < 8 && !releaseHide; turn++) await Promise.resolve();
    assert.equal(typeof releaseHide, 'function');
    assert.equal(entryLifecycle.pending, true, 'entry ownership lasts through cover exit');
    releaseHide();
    await pending;
    assert.equal(visible, false);
    assert.deepEqual([contexts, mixerLoads, begins], [0, 0, 0], 'a rejected cold import never initializes sound');
  } else {
    resolveModule({ createSoloBattleLoadingRuntime: () => ({
      async begin() {
        begins++;
        screen.show();
        await audio.startLoadingAfterPaint(async () => { events.push('loader:paint'); });
      },
    }) });
    await pending;
    assert.equal(visible, true, 'the enriched loader retains the same cover without an intermediate hide');
    assert.equal(events.includes('cover:hide'), false);
    assert.ok(contexts > 0 && mixerLoads > 0, 'normal gesture-aware audio starts only after loading handoff');
    assert.equal(begins, 1);
  }
  assert.equal(entryLifecycle.pending, false);
  assert.equal(entryLifecycle.renderingCovered, false);
}

const mainSource = await readFile(new URL('../main.ts', import.meta.url), 'utf8');
const entryComposition = mainSource.slice(mainSource.indexOf('const soloBattleEntry = createSoloBattleEntryRuntime({'));
assert.match(entryComposition.slice(0, entryComposition.indexOf('\n});')),
  /nextFrame: nextPaintFrame,/,
  'browser recovery must cross the real post-rAF task boundary before fading its cover');

console.log('soloBattleEntryRuntime.selftest: selection and covered failure recovery pass');
