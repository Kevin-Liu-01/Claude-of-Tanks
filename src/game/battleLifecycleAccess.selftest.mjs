import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createGarageReturnAccess } from './garageReturnAccess.ts';
import { createSoloBattleDeploymentAccess } from './soloBattleDeploymentAccess.ts';
import { createSoloBattleLoadingAccess } from './soloBattleLoadingAccess.ts';

{
  let optionsCalls = 0;
  let loads = 0;
  const access = createSoloBattleLoadingAccess({
    options: () => { optionsCalls += 1; return { marker: 'loading' }; },
    load: async () => {
      loads += 1;
      return {
        createSoloBattleLoadingRuntime: (options) => ({
          async begin(specId, mapId, startOptions) {
            return { options, specId, mapId, startOptions };
          },
        }),
      };
    },
  });
  assert.equal(access.current, null);
  assert.equal(optionsCalls, 0, 'loading options stay cold before intent');
  const result = await access.begin('m1a1', 'fjord', { randomRoster: false });
  assert.equal(result.specId, 'm1a1');
  assert.equal(result.mapId, 'fjord');
  assert.equal(result.options.marker, 'loading');
  assert.equal(loads, 1);
  assert.equal(optionsCalls, 1);
  await access.preload();
  assert.equal(loads, 1, 'resolved loading owner is reused');
}

{
  let loads = 0;
  const access = createSoloBattleDeploymentAccess({
    options: () => ({ marker: 'deployment' }),
    load: async () => {
      loads += 1;
      return {
        createSoloBattleDeploymentRuntime: (options) => ({
          async warm(value) { return { generation: value, revealPrimed: options.marker === 'deployment' }; },
        }),
      };
    },
  });
  assert.deepEqual(await access.warm(4), { generation: 4, revealPrimed: true });
  assert.equal(loads, 1);
}

{
  const calls = [];
  const runtime = {
    transitioning: false,
    lastTrace: { stages: { ready: 1 } },
    async enter(options) { calls.push(['enter', options]); },
    async recoverAfterContextRestore(isCurrent) { calls.push(['recover', isCurrent()]); return true; },
    async leave() { calls.push(['leave']); },
    async battleAgain() { calls.push(['again']); },
  };
  const access = createGarageReturnAccess({
    options: () => ({ marker: 'garage' }),
    load: async () => ({ createGarageReturnRuntime: () => runtime }),
  });
  assert.equal(access.transitioning, false);
  assert.equal(access.lastTrace, null);
  assert.equal(await access.recoverAfterContextRestore(() => true), false,
    'pristine context recovery must not acquire an unused Garage return owner');
  assert.equal(access.current, null);
  await access.enter({ preserveRoom: true });
  assert.equal(await access.recoverAfterContextRestore(() => true), true);
  await access.leave();
  await access.battleAgain();
  assert.deepEqual(calls, [
    ['enter', { preserveRoom: true }],
    ['recover', true],
    ['leave'],
    ['again'],
  ]);
  assert.deepEqual(access.lastTrace, runtime.lastTrace);
}

{
  let resolveModule;
  let loads = 0;
  let optionsCalls = 0;
  const actions = [];
  const runtime = {
    transitioning: false,
    lastTrace: null,
    async enter() { actions.push('enter'); },
    async leave() { actions.push('leave'); },
    async battleAgain() { actions.push('again'); },
  };
  const access = createGarageReturnAccess({
    options: () => { optionsCalls += 1; return {}; },
    load: () => {
      loads += 1;
      return new Promise((resolve) => { resolveModule = resolve; });
    },
  });
  assert.equal(loads, 0, 'constructing the facade must not load return code during boot');
  const warm = access.preload();
  assert.equal(access.preload(), warm, 'concurrent covered preloads share the same request');
  const again = access.battleAgain();
  await Promise.resolve();
  assert.equal(loads, 1, 'a result click joins the in-flight covered preload');
  assert.equal(optionsCalls, 0, 'live integration ports bind only after the chunk resolves');
  assert.deepEqual(actions, [], 'preloading cannot perform teardown or trigger battle');
  resolveModule({ createGarageReturnRuntime: () => runtime });
  await Promise.all([warm, again]);
  assert.deepEqual(actions, ['again']);
  assert.equal(optionsCalls, 1);
  await access.preload();
  await access.leave();
  assert.equal(loads, 1, 'warm return clicks do not fetch or reconstruct the owner');
  assert.deepEqual(actions, ['again', 'leave']);
}

{
  const failure = new Error('return chunk unavailable');
  let attempts = 0;
  let creations = 0;
  let leaves = 0;
  const runtime = {
    transitioning: false,
    lastTrace: null,
    async enter() {},
    async leave() { leaves += 1; },
    async battleAgain() {},
  };
  const access = createGarageReturnAccess({
    options: () => ({}),
    load: async () => {
      attempts += 1;
      if (attempts === 1) throw failure;
      return { createGarageReturnRuntime: () => { creations += 1; return runtime; } };
    },
  });
  const warm = access.preload();
  const leave = access.leave();
  await Promise.all([
    assert.rejects(warm, (error) => error === failure),
    assert.rejects(leave, (error) => error === failure),
  ]);
  assert.equal(attempts, 1, 'preload and action observe one rejected request');
  assert.equal(access.current, null);
  assert.equal(leaves, 0, 'failed acquisition must not perform any partial return');
  await access.preload();
  await access.leave();
  assert.equal(attempts, 2, 'a failed covered acquisition can retry through the same facade');
  assert.equal(creations, 1);
  assert.equal(leaves, 1);
}

{
  const mainSource = await readFile(new URL('../main.ts', import.meta.url), 'utf8');
  for (const [factory, runtime] of [
    ['createSoloBattleLoadingRuntime', 'soloBattleLoadingRuntime'],
    ['createSoloBattleDeploymentRuntime', 'soloBattleDeploymentRuntime'],
    ['createGarageReturnRuntime', 'garageReturnRuntime'],
  ]) {
    assert.doesNotMatch(
      mainSource,
      new RegExp(`^import\\s+\\{[^}]*\\b${factory}\\b[^}]*\\}\\s+from\\s+['\"]\\./game/${runtime}\\.ts['\"]`, 'm'),
      `${runtime} must remain outside the boot-critical runtime graph`,
    );
  }
  assert.match(mainSource, /createSoloBattleLoadingAccess\(\{/);
  assert.match(mainSource, /createSoloBattleDeploymentAccess\(\{/);
  assert.match(mainSource, /createGarageReturnAccess<BattleVisual>\(\{/);
  assert.match(mainSource, /preloadGarageReturn: \(\) => garageReturn\.preload\(\)/,
    'solo entry acquires the return owner under its loading cover');
  const networkLoadStart = mainSource.indexOf('loadModules: () => Promise.all([');
  const networkLoadEnd = mainSource.indexOf(']).then(([modules]) => modules)', networkLoadStart);
  assert.ok(networkLoadStart >= 0 && networkLoadEnd > networkLoadStart);
  assert.match(mainSource.slice(networkLoadStart, networkLoadEnd), /garageReturn\.preload\(\)/,
    'private/LAN acquisition also warms return code under its existing cover');
}

console.log('battleLifecycleAccess.selftest: loading, deployment, and return owners passed');
