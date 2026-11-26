// The battle fleet pass's harness (fleetBattleBuilds.test-support.mjs) on a scripted fleet, no tank build: every role's
// build drains its steps with the battle options, and a planted throw or console.error/console.warn in a loader, in a
// build or in a build's microtask is a finding charged to its id and role; console is restored afterwards. The fleet
// itself is fleetBattleBuilds.selftest.mjs (manual `fleet` suite).
import assert from 'node:assert/strict';
import { battleBuildOptions, battleStaticDrawMerge } from './fleetFactory.ts';
import { BATTLE_BUILD_ROLES, battleBuildFindings, formatBattleBuildFindings } from './fleetBattleBuilds.test-support.mjs';

function scriptedFleet(plants = {}) {
  const built = [], disposed = [], ensured = [];
  return {
    built, disposed, ensured, battleBuildOptions, battleStaticDrawMerge,
    async ensureTankBuilders(ids) { ensured.push(...ids); plants.ensure?.(ids[0]); },
    *createTankSteps(id, engine, options) {
      assert.equal(engine, null);
      built.push({ id, options });
      yield 'core';
      plants.build?.(id, options);
      yield 'decor';
      if (plants.microtask) queueMicrotask(() => plants.microtask(id, options));
      return { dispose: () => disposed.push(id) };
    },
  };
}

const target = { error: () => assert.fail('console.error restored too early'), warn: () => assert.fail('console.warn restored too early') };
const originalError = target.error, originalWarn = target.warn;

{
  // a clean fleet: every role of every id, built once with the battle roster's options, disposed once
  const fleet = scriptedFleet();
  const progress = [];
  const findings = await battleBuildFindings({ fleet, ids: ['a', 'b'], target, onBuilt: (id) => progress.push(id) });
  assert.deepEqual(findings, []);
  assert.deepEqual(fleet.ensured, ['a', 'b']);
  assert.deepEqual(progress, ['a', 'b']);
  assert.equal(fleet.built.length, 2 * BATTLE_BUILD_ROLES.length);
  assert.deepEqual(fleet.disposed, ['a', 'a', 'a', 'b', 'b', 'b']);
  assert.deepEqual(fleet.built.slice(0, 3).map(({ options }) => options), [
    { camoSeed: 4242, quality: 'preview', geometryQuality: 'high', batchStatic: true, battleDetailLod: false, eraVisualBindingReceipt: false, staticDrawMerge: 'dual' },
    { camoSeed: 4242, quality: 'ai', geometryQuality: 'low', batchStatic: true, battleDetailLod: true, eraVisualBindingReceipt: false, staticDrawMerge: 'dual' },
    { camoSeed: 4242, quality: 'ai', geometryQuality: 'low', batchStatic: true, battleDetailLod: false, eraVisualBindingReceipt: false, staticDrawMerge: 'dual' },
  ], 'the desktop player, a desktop bot and a phone build with the battle roster\'s options');
  assert.equal(target.error, originalError, 'console.error restored');
  assert.equal(target.warn, originalWarn, 'console.warn restored');
}

{
  // the control: a builder's planted console.error fails the pass (the battle roster logs exactly so and draws a donor)
  const fleet = scriptedFleet({ build: (id, options) => { if (id === 'b' && options.battleDetailLod) console.error('[builder] planted', new Error('cradle')); } });
  const findings = await battleBuildFindings({ fleet, ids: ['a', 'b'], target: console });
  assert.deepEqual(findings, [{ id: 'b', role: 'bot', kind: 'console.error', message: '[builder] planted cradle' }]);
  assert.match(formatBattleBuildFindings(findings), /^ {2}b \(bot\) console\.error: \[builder\] planted cradle$/);
}

{
  // a throw in a build, a warn from a build's microtask and a failed loader: each is charged to its id and role; a
  // failed loader skips that id's builds, the next id still builds
  const fleet = scriptedFleet({
    ensure: (id) => { if (id === 'c') throw new Error('group chunk failed'); },
    build: (id, options) => { if (id === 'a' && options.quality === 'preview') throw new RangeError('needs a buffer'); },
    microtask: (id, options) => { if (id === 'b' && options.geometryQuality === 'low' && !options.battleDetailLod) console.warn('late', 'warn'); },
  });
  const consoleError = console.error, consoleWarn = console.warn;
  const findings = await battleBuildFindings({ fleet, ids: ['a', 'b', 'c', 'd'] });
  assert.deepEqual(findings, [
    { id: 'a', role: 'player', kind: 'throw', message: 'needs a buffer' },
    { id: 'b', role: 'phone', kind: 'console.warn', message: 'late warn' },
    { id: 'c', role: 'load', kind: 'throw', message: 'group chunk failed' },
  ]);
  assert.equal(fleet.built.filter(({ id }) => id === 'c').length, 0, 'an id whose builders failed to load is not built');
  assert.equal(fleet.built.filter(({ id }) => id === 'd').length, BATTLE_BUILD_ROLES.length);
  assert.deepEqual(fleet.disposed.filter((id) => id === 'a').length, 2, 'a thrown build has no visual to dispose');
  assert.equal(console.error, consoleError, 'console.error restored');
  assert.equal(console.warn, consoleWarn, 'console.warn restored');
}

console.log('fleetBattleBuildsHarness.selftest: PASS (battle options per role, planted throw/error/warn findings, console restored)');
