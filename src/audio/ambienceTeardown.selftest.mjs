// 2026-11-02 audit F11 (machine 2): under the battle loader only the loader's bed is heard. The battle edge's world
// teardown stops every loop, the ambience director's garage beds included, and the director's scene goes with them:
// its self-repair (ensureLoops) must not bring the garage back under the loader before the reveal asks for the
// battle's world. The engine's "battle ambience wanted" intent ends with its battle, as the lazy facade's copy does,
// so the next battle (from the garage, or a network match's next round) also starts behind the loader in silence.
//
// One owner of the rule (round 8 Y3 s1-06, s6-03): the battle world's teardown (stopWorld) stops the director with the
// loops it kills; the scene is played only when the reveal asks for the battle's world (applyScene never stops it, the
// second rule 269 added beside it). Every entry path, driven down the app lifecycle's one phase writer bound to the
// engine's bus as main.ts binds it (game/appLifecycle.ts transitionAppPhase announcing phase:change), plays nothing of the
// hangar from its battle edge (269's world-sfx receipt, folded in here: battleEntryAmbience.selftest.mjs): a solo start,
// an online first battle from the garage, a rematch from the result screen (battle to battle, ambience on) and an
// online battle from a cold boot (the hangar barely started, ambience never asked for). appLifecycle.selftest owns the
// census of the phase's writers.
import assert from 'node:assert/strict';
import { createBus } from '../game/stateCore.ts';
import { createAppLifecycle, transitionAppPhase } from '../game/appLifecycle.ts';
import { installFetch, namedContext, terrain, tank, listener, sounding, probeOf, settle } from './engineHarness.test-support.mjs';

globalThis.window = {};
installFetch();
const { createAudio } = await import('./audioEngine.ts');
const { createLazyAudio } = await import('./lazyAudio.ts');
const { GARAGE_SCENE, sceneForMap } = await import('./environmentScenes.ts');

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

// ---- every entry path, down the lifecycle's one phase writer (each on a fresh engine and page lifecycle)
const HANGAR = new Set([GARAGE_SCENE.bed, ...GARAGE_SCENE.spots.map(([id]) => id)]);
async function page() {
  const pageCtx = namedContext();
  const engine = createAudio({ context: pageCtx, getMapId: () => MAP, getGameMode: () => 'standard', getTerrain: () => terrain, tier: 'desktop' });
  const pageBus = createBus();
  engine.bindBus(pageBus);
  engine.resume();
  const pageProbe = probeOf();
  const game = { phase: 'garage' };
  createAppLifecycle({ game, announce: (announcement) => pageBus.emit('phase:change', announcement) });
  const step = async (seconds) => {
    for (let i = 0; i < Math.round(seconds * 30); i++) { pageCtx.advance(1 / 30); engine.update(1 / 30, listener, tanks); }
    await pageProbe.libraryIdle();
  };
  const mark = () => pageProbe.sfxLog.at(-1)?.seq ?? 0;
  const heardSince = (seq) => pageProbe.sfxLog.filter((e) => e.seq > seq).map((e) => e.n);
  const enter = (reason) => transitionAppPhase(game, 'battle', { reason });
  return { engine, bus: pageBus, probe: pageProbe, game, step, mark, heardSince, enter };
}
// the garage first: its scene and its workshop spots really play (the spots come every 4-10 s)
async function inGarage(p) {
  transitionAppPhase(p.game, 'garage', { reason: 'boot' });
  await p.step(1);
  const seq = p.mark();
  await p.step(25);
  const heard = p.heardSince(seq).filter((id) => HANGAR.has(id));
  assert.ok(heard.some((id) => id !== GARAGE_SCENE.bed), `the hangar's workshop spots play in the garage (${heard})`);
}
// from the battle edge through a long load: nothing of the hangar (its bed or a spot), no scene until the reveal
async function silentLoad(p, path) {
  const seq = p.mark();
  await p.step(25);
  assert.deepEqual(p.heardSince(seq).filter((id) => HANGAR.has(id)), [], `${path}: nothing of the hangar after the battle phase edge`);
  assert.equal(p.probe.ambientState().active, false, `${path}: no scene before the reveal`);
}
async function revealed(p, path) {
  const seq = p.mark();
  p.engine.ambientOn(true);
  await p.step(2);
  assert.ok(p.heardSince(seq).includes(battleBed), `${path}: the reveal starts the battlefield's own scene`);
}

// a solo start: the Garage return turned ambience off (garageReturnRuntime), the start enters the battle before its
// bake and warms (soloBattleStartRuntime), the reveal turns it on (soloBattleLoadingRuntime)
const solo = await page();
await inGarage(solo);
solo.engine.ambientOn(false);
solo.enter('solo-start');
await silentLoad(solo, 'a solo start');
await revealed(solo, 'a solo start');

// an online first battle from the garage (ambience never asked for): the activation enters it (activationRuntime), the
// reveal turns ambience on (browserComposition); then a rematch from the result screen: battle to battle, ambience on
const online = await page();
await inGarage(online);
online.enter('network-activation');
await silentLoad(online, 'an online activation');
await revealed(online, 'an online activation');
online.bus.emit('battle:ended', { result: 'victory' });
await online.step(5);
online.enter('network-activation');
await silentLoad(online, 'a rematch');
await revealed(online, 'a rematch');

// an online battle from a cold boot: the hangar has only just been asked for when the activation enters the battle
const cold = await page();
cold.enter('network-activation');
await silentLoad(cold, 'a cold boot\'s online battle');
await revealed(cold, 'a cold boot\'s online battle');

console.log('ambienceTeardown.selftest: only the loader under the loader (the garage hangar never revived, the battle world at the reveal, the intent per battle), and nothing of the hangar after the battle edge on every entry path (a solo start, an online activation, a rematch, a cold boot) passed');
