import assert from 'node:assert/strict';
import { createKillcamAccess } from './killcamAccess.ts';

const deferred = () => {
  let resolve;
  const promise = new Promise((yes) => { resolve = yes; });
  return { promise, resolve };
};

function createRuntime(log) {
  return {
    fxTimeScale: 0.55,
    lastBeginWallMs: 1234,
    phase: 'impact',
    replayInfo: { shot: 7 },
    spectate: {
      active: true,
      targetId: 'ally-2',
      startObserver: () => { log.push('spectate:start'); return true; },
      stop: (emitEnd) => { log.push(`spectate:stop:${emitEnd}`); },
    },
    isActive: () => true,
    cancel: () => { log.push('cancel'); },
    update: (dt) => { log.push(`update:${dt}`); },
    playForResult: (result) => { log.push(`play:${result}`); return true; },
    stageXrayShot: (shot) => { log.push(`stage:${shot}`); return shot; },
    recordSimStep: (game) => { log.push(`step:${game}`); },
    onShellHit: (hit) => { log.push(`hit:${hit}`); },
  };
}

{
  const moduleGate = deferred();
  const runtimeGate = deferred();
  const log = [];
  let loads = 0;
  let initializations = 0;
  const access = createKillcamAccess({
    loadModule: () => { loads++; return moduleGate.promise; },
    initialize: async (module) => {
      initializations++;
      assert.equal(module.id, 'killcam');
      await runtimeGate.promise;
      return createRuntime(log);
    },
  });
  const stable = access.presentation;
  assert.equal(stable.isActive(), false);
  assert.equal(stable.fxTimeScale, 1);
  assert.equal(stable.spectate.startObserver(), false);
  stable.cancel();
  stable.recordSimStep('garage');
  assert.deepEqual(log, [], 'the garage facade is a complete zero-work fallback');

  const preloadA = access.preloadModule();
  const preloadB = access.preloadModule();
  assert.equal(preloadA, preloadB, 'intent coalesces one replay chunk request');
  assert.equal(access.current, null, 'preloading code does not create replay state');
  moduleGate.resolve({ id: 'killcam' });
  await preloadA;

  const ensureA = access.ensureRuntime();
  const ensureB = access.ensureRuntime();
  assert.equal(ensureA, ensureB, 'battle consumers share one replay initializer');
  runtimeGate.resolve();
  const live = await ensureA;
  assert.equal(access.current, live);
  assert.equal(access.presentation, stable, 'presentation identity stays stable after install');
  assert.equal(stable.isActive(), true);
  assert.equal(stable.fxTimeScale, 0.55);
  assert.equal(stable.lastBeginWallMs, 1234);
  assert.equal(stable.phase, 'impact');
  assert.deepEqual(stable.replayInfo, { shot: 7 });
  assert.equal(stable.spectate.targetId, 'ally-2');
  stable.update(0.25);
  assert.equal(stable.playForResult('victory'), true);
  assert.equal(stable.stageXrayShot('shot-7'), 'shot-7');
  stable.recordSimStep('battle');
  stable.onShellHit('armor');
  stable.cancel();
  assert.deepEqual(log, [
    'update:0.25', 'play:victory', 'stage:shot-7', 'step:battle', 'hit:armor', 'cancel',
  ]);
  assert.equal(await access.ensureRuntime(), live);
  assert.equal(loads, 1);
  assert.equal(initializations, 1);
}

{
  let loads = 0;
  const access = createKillcamAccess({
    loadModule: async () => {
      loads++;
      if (loads === 1) throw new Error('transient replay chunk failure');
      return { id: 'killcam' };
    },
    initialize: async () => createRuntime([]),
  });
  await assert.rejects(access.preloadModule(), /transient replay chunk failure/);
  assert.equal((await access.preloadModule()).id, 'killcam');
  assert.equal(loads, 2, 'a failed replay chunk retries without refreshing the page');
}

{
  let loads = 0;
  let initializations = 0;
  const access = createKillcamAccess({
    loadModule: async () => { loads++; return { id: 'killcam' }; },
    initialize: async () => {
      initializations++;
      if (initializations === 1) throw new Error('transient replay setup failure');
      return createRuntime([]);
    },
  });
  await assert.rejects(access.ensureRuntime(), /transient replay setup failure/);
  assert.equal(access.current, null);
  await access.ensureRuntime();
  assert.equal(loads, 1, 'setup retry reuses the successfully transferred chunk');
  assert.equal(initializations, 2);
}

console.log('killcamAccess.selftest: stable facade, acquisition, and retry ownership passed');
