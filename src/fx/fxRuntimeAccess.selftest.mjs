import assert from 'node:assert/strict';
import { createFxRuntimeAccess } from './fxRuntimeAccess.ts';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

{
  const moduleGate = deferred();
  const runtimeGate = deferred();
  let loads = 0;
  let initializations = 0;
  const access = createFxRuntimeAccess({
    loadModule: () => { loads++; return moduleGate.promise; },
    initialize: async (module) => {
      initializations++;
      assert.equal(module.id, 'effects');
      await runtimeGate.promise;
      return { id: 'live-fx' };
    },
  });

  const preloadA = access.preloadModule();
  const preloadB = access.preloadModule();
  assert.equal(preloadA, preloadB, 'intent preloads coalesce onto one module request');
  assert.equal(access.current, null, 'module intent never constructs GPU/runtime state');
  moduleGate.resolve({ id: 'effects' });
  await preloadA;

  const ensureA = access.ensureRuntime();
  const ensureB = access.ensureRuntime();
  assert.equal(ensureA, ensureB, 'concurrent battle consumers share one initializer');
  assert.equal(access.current, null, 'runtime is not published before initialization completes');
  runtimeGate.resolve();
  const live = await ensureA;
  assert.equal(access.current, live, 'the completed singleton is published through current');
  assert.equal(await access.ensureRuntime(), live, 'later entries reuse the live singleton');
  assert.equal(loads, 1);
  assert.equal(initializations, 1);
}

{
  let loads = 0;
  const access = createFxRuntimeAccess({
    loadModule: async () => {
      loads++;
      if (loads === 1) throw new Error('transient chunk failure');
      return { id: 'effects' };
    },
    initialize: async () => ({ id: 'live-fx' }),
  });
  await assert.rejects(access.preloadModule(), /transient chunk failure/);
  assert.equal((await access.preloadModule()).id, 'effects',
    'a failed chunk request can recover without reloading the page');
  assert.equal(loads, 2);
}

{
  let loads = 0;
  let initializations = 0;
  const access = createFxRuntimeAccess({
    loadModule: async () => { loads++; return { id: 'effects' }; },
    initialize: async () => {
      initializations++;
      if (initializations === 1) throw new Error('transient WebGL allocation failure');
      return { id: 'live-fx' };
    },
  });
  await assert.rejects(access.ensureRuntime(), /transient WebGL allocation failure/);
  assert.equal(access.current, null, 'failed initialization never leaks a partial runtime');
  assert.equal((await access.ensureRuntime()).id, 'live-fx',
    'a failed initializer can recover on the next entry attempt');
  assert.equal(loads, 1, 'initializer retry reuses the successfully loaded module');
  assert.equal(initializations, 2);
}

console.log('fxRuntimeAccess.selftest: preload, singleton, and retry ownership passed');
