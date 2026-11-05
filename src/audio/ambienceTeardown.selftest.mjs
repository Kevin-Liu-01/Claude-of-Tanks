// 2026-11-02 audit F11 (machine 2): under the battle loader only the loader's bed is heard. The battle edge's world
// teardown stops every loop, the ambience director's garage beds included, and the director's scene goes with them:
// its self-repair (ensureLoops) must not bring the garage back under the loader before the reveal asks for the
// battle's world. The engine's "battle ambience wanted" intent ends with its battle, as the lazy facade's copy does,
// so the next battle (from the garage, or a network match's next round) also starts behind the loader in silence.
import assert from 'node:assert/strict';
import { createBus } from '../game/stateCore.ts';
import { installFetch, namedContext, terrain, tank, listener, sounding, probeOf, settle } from './engineHarness.test-support.mjs';

globalThis.window = {};
installFetch();
const { createAudio } = await import('./audioEngine.ts');
const { createLazyAudio } = await import('./lazyAudio.ts');
const { sceneForMap } = await import('./environmentScenes.ts');

const MAP = 'verdant';
const battleBed = sceneForMap(MAP).bed;
const tanks = [tank('me', { isPlayer: true })];
const ctx = namedContext();
const audio = createAudio({ context: ctx, getMapId: () => MAP, getGameMode: () => 'standard', getTerrain: () => terrain, tier: 'desktop' });
const bus = createBus();
audio.bindBus(bus);
audio.resume();
const probe = probeOf();
const frames = (n, list = tanks) => { for (let i = 0; i < n; i++) { ctx.advance(1 / 30); audio.update(1 / 30, listener, list); } };
await audio.warmBattleEvents(['t72b3m_2022']);
await probe.libraryIdle();

// the garage: its hangar bed
frames(30, []);
assert.ok(sounding(ctx).includes('amb_garage'), `the garage plays its hangar (${sounding(ctx)})`);

// the solo battle button: the loader's bed, then the battle set up behind it (the phase edge), frames running under it
audio.ambientOn(false); // garageReturnRuntime / a fresh boot: no battle world wanted yet
audio.loadingOn(true);
bus.emit('phase:change', { phase: 'battle' });
frames(60);
let loops = sounding(ctx);
assert.ok(loops.includes('loading_bed_loop'), `the loader keeps its bed (${loops})`);
assert.ok(!loops.includes('amb_garage'), `the garage hangar never comes back under the loader (${loops})`);
assert.ok(!loops.includes(battleBed), 'nor the battle\'s world before the reveal');
assert.equal(probe.ambientState().active, false, 'the ambience director holds no scene under the loader');
// (U34, round 2) and the room is the battle's from its edge: the loader's bed and the battle's vehicle rigs, already heard
// under it, never ring in the Garage hangar's reverb until the reveal (the convolver's impulse is the room's)
const convolver = ctx.nodes.find((node) => node.kind === 'convolver');
assert.ok(convolver, 'the mixer has its convolver');
assert.equal(probe.reverb, sceneForMap(MAP).reverb, `the battle's room under its loader (${probe.reverb})`);

// the reveal: the loader's bed off, the battle's world on
audio.loadingOn(false);
audio.ambientOn(true);
frames(30);
loops = sounding(ctx);
assert.ok(loops.includes(battleBed) && !loops.includes('amb_garage'), `the reveal brings the battle's world (${loops})`);

// back to the garage, by a path that never says ambientOn(false) (a network battle's end, a debug exit)
bus.emit('phase:change', { phase: 'garage' });
frames(30, []);
assert.ok(sounding(ctx).includes('amb_garage'), 'the garage hangar again');
assert.equal(probe.battleState().ambientWanted, false, 'the battle\'s ambience intent ends with its battle');

// the next battle starts behind its loader in silence too
audio.loadingOn(true);
bus.emit('phase:change', { phase: 'battle' });
frames(60);
loops = sounding(ctx);
assert.ok(!loops.includes(battleBed) && !loops.includes('amb_garage'), `no world under the next battle's loader (${loops})`);
audio.loadingOn(false);
audio.ambientOn(true);
frames(30);
assert.ok(sounding(ctx).includes(battleBed), 'until its reveal');

// a network match's next round: the activation's battle edge over the last round, its loader up again
audio.loadingOn(true);
bus.emit('phase:change', { phase: 'battle' });
frames(60);
loops = sounding(ctx);
assert.ok(!loops.includes(battleBed) && loops.includes('loading_bed_loop'), `the next round's loader is heard alone (${loops})`);
bus.emit('phase:change', { phase: 'garage' });
frames(5, []);

// the lazy facade's own copy follows the same rule: a battle edge, or leaving one, ends the intent
{
  let finish;
  let ambientSeen = null;
  const lazy = createLazyAudio({
    createContext: () => namedContext(),
    loadMixer: () => new Promise((resolve) => { finish = resolve; }),
  });
  const lazyBus = createBus();
  lazy.bindBus(lazyBus);
  lazy.resume();
  lazyBus.emit('phase:change', { phase: 'battle' });
  lazy.ambientOn(true);
  lazyBus.emit('phase:change', { phase: 'battle' }); // the next round, before the mixer has loaded
  finish({ createAudio: () => ({ bindBus() {}, resume() {}, mute() {}, setMasterVolume() {}, loadingOn() {}, ambientOn(on) { ambientSeen = on; } }) });
  await lazy.preload();
  await settle();
  assert.equal(ambientSeen, false, 'the next round\'s mixer does not inherit the last round\'s ambience');
}

console.log('ambienceTeardown.selftest: only the loader under the loader (the garage hangar never revived, the battle world at the reveal, the intent per battle) passed');
