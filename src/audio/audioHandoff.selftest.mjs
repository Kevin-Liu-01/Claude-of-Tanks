// 2026-11-02 audit F11 (machine 4): the lazy facade and the mixer share one device. A mixer the facade builds before
// any gesture (playGarageSting, warmBattleEvents) has no context; at its first resume it adopts the facade's context
// instead of opening a second one, and it has kept the battle mode it heard meanwhile. A mixer rebound to a new bus
// retires the old bus's subscriptions, so a second bindBus never doubles a cue.
import assert from 'node:assert/strict';
import { createBus } from '../game/stateCore.ts';
import { installFetch, namedContext, terrain, tank, listener, probeOf, mark, since, count, settle } from './engineHarness.test-support.mjs';

globalThis.window = {};
installFetch();
const { createLazyAudio } = await import('./lazyAudio.ts');
const { createAudio } = await import('./audioEngine.ts');

// 1. a mixer built before any gesture adopts the facade's device
for (const early of ['playGarageSting', 'warmBattleEvents']) {
  const facadeCtx = namedContext();
  let facadeContexts = 0;
  let ownContexts = 0;
  const previousAC = globalThis.AudioContext;
  globalThis.AudioContext = function SecondAudioContext() { ownContexts++; return namedContext(); };
  try {
    delete globalThis.window.__COT_AUDIO;
    const lazy = createLazyAudio({
      createContext: () => { facadeContexts++; return facadeCtx; },
      loadMixer: () => import('./audioEngine.ts'),
      hasStickyActivation: () => true,
      getMapId: () => 'verdant',
      getTerrain: () => terrain,
    });
    const bus = createBus();
    lazy.bindBus(bus);
    if (early === 'playGarageSting') lazy.playGarageSting();
    else void lazy.warmBattleEvents(['t72b3m_2022']);
    await lazy.preload();
    await settle();
    assert.equal(lazy.ready, true, `${early} before a gesture builds the mixer`);
    assert.equal(facadeContexts, 0, 'with no device yet');
    bus.emit('phase:change', { phase: 'battle' });
    lazy.resume(); // the first gesture
    await settle();
    assert.equal(facadeContexts, 1, 'the gesture opens the one device');
    assert.equal(ownContexts, 0, `the early mixer (${early}) adopts it instead of opening a second context`);
    const probe = probeOf();
    assert.equal(probe.ctx, facadeCtx, 'the mixer plays through the facade\'s context');
    facadeCtx.advance(1 / 30);
    lazy.update(1 / 30, listener, [tank('me', { isPlayer: true })]);
    assert.equal(probe.snapshot, 'battle', 'and kept the battle edge it heard before its graph');
    bus.emit('phase:change', { phase: 'garage' });
  } finally {
    if (previousAC === undefined) delete globalThis.AudioContext;
    else globalThis.AudioContext = previousAC;
  }
}

// 2. a rebound mixer listens to its new bus only
{
  const ctx = namedContext();
  const audio = createAudio({ context: ctx, getMapId: () => 'verdant', getGameMode: () => 'standard', getTerrain: () => terrain, tier: 'desktop' });
  const oldBus = createBus();
  const nextBus = createBus();
  audio.bindBus(oldBus);
  audio.resume();
  const probe = probeOf();
  await probe.libraryIdle();
  audio.bindBus(nextBus);
  nextBus.emit('phase:change', { phase: 'battle' });
  await audio.warmBattleEvents(['t72b3m_2022']);
  await probe.libraryIdle();
  for (let i = 0; i < 5; i++) { ctx.advance(1 / 30); audio.update(1 / 30, listener, [tank('me', { isPlayer: true })]); }
  const shot = { shellId: 1, shooterId: 'foe', muzzlePos: [0, 2, 60], dir: [0, 0, -1], caliberMm: 120, shellType: 'APFSDS', velocityMps: 1650 };
  let seq = mark(probe);
  oldBus.emit('shell:fired', shot);
  assert.equal(count(since(seq, probe), 'gun_120_close'), 0, 'the retired bus is no longer heard');
  oldBus.emit('phase:change', { phase: 'garage' });
  assert.equal(probe.battleState().phase, 'battle', 'nor does it move the battle mode');
  seq = mark(probe);
  nextBus.emit('shell:fired', { ...shot, shellId: 2 });
  assert.equal(count(since(seq, probe), 'gun_120_close'), 1, 'one report a shot on the new bus');
  audio.bindBus(nextBus); // rebinding the same bus
  ctx.advance(0.5);
  seq = mark(probe);
  nextBus.emit('shell:fired', { ...shot, shellId: 3 });
  assert.equal(count(since(seq, probe), 'gun_120_close'), 1, 'a second bindBus of the same bus never doubles a cue');
  nextBus.emit('phase:change', { phase: 'garage' });
}

console.log('audioHandoff.selftest: one device across the facade and an early mixer, and one subscription set per mixer passed');
