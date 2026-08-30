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
    async leave() { calls.push(['leave']); },
    async battleAgain() { calls.push(['again']); },
  };
  const access = createGarageReturnAccess({
    options: () => ({ marker: 'garage' }),
    load: async () => ({ createGarageReturnRuntime: () => runtime }),
  });
  assert.equal(access.transitioning, false);
  assert.equal(access.lastTrace, null);
  await access.enter({ preserveRoom: true });
  await access.leave();
  await access.battleAgain();
  assert.deepEqual(calls, [
    ['enter', { preserveRoom: true }],
    ['leave'],
    ['again'],
  ]);
  assert.deepEqual(access.lastTrace, runtime.lastTrace);
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
}

console.log('battleLifecycleAccess.selftest: loading, deployment, and return owners passed');
