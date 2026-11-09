// Receipt (round 8 Y1 s1-04, review r2): every round's loader starts in silence, a rematch from the result screen
// included. A rematch stays in the battle phase, so before s1-04 the last battlefield's scene played under the loader
// up to the round's activation edge, where the engine's battle edge ends the intent (audioEngine.ts modeEdge).
// browserComposition.selftest pins the calls the composition sends (ambientOn(false) just before
// loadingOn(true) at every round's loader start, loadingOn(false) then ambientOn(true) at its reveal). This receipt is
// the engine half: it reads the loader start's engine calls from browserComposition.ts as written, plays them on the
// real audio engine at a rematch, and holds no scene under the loader (the s1-04 red on H0), none from the activation
// edge to the reveal, and the battlefield's own scene at the reveal. The edge-to-reveal silence is a regression guard,
// green on H0: on 269 alone the new map's scene started at that edge, and H0's engine edge (F11) already prevents it.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createFakeContext, fakeBuffer } from '../../audio/fakeAudioContext.test-support.mjs';
import { createBus } from '../../game/stateCore.ts';
import { sceneForMap } from '../../audio/environmentScenes.ts';

// ---- the loader start as the composition writes it: the engine calls from the round's cover (showRoundLoad) to its
// first wait. Only the calls that move the scene or the loading bed are played; any other port call is not the engine's.
const composition = readFileSync(new URL('./browserComposition.ts', import.meta.url), 'utf8');
const coverAt = composition.indexOf('showRoundLoad(viewerId,');
assert.ok(coverAt > 0, 'browserComposition.ts covers each round with showRoundLoad(viewerId, ...)');
const afterCover = composition.slice(coverAt, coverAt + 6000).replace(/\/\/[^\n]*/g, '');
const loaderStart = afterCover.slice(0, afterCover.indexOf('await '));
const calls = [...loaderStart.matchAll(/\bload\.audio\.(resume|ambientOn|loadingOn)\((true|false)?\)/g)]
  .map(([, name, arg]) => ({ name, arg: arg === undefined ? undefined : arg === 'true' }));
const said = calls.map(({ name, arg }) => `${name}(${arg ?? ''})`).join(', ');
assert.ok(calls.some(({ name, arg }) => name === 'loadingOn' && arg === true),
  `the composition's loader start turns the loading bed on before its first wait (${said || 'no engine call found'})`);

// ---- the real engine (the audio's own harness: a fake context, the public assets read from disk)
const publicRoot = new URL('../../../public/', import.meta.url);
globalThis.fetch = async (url) => {
  try {
    const bytes = await readFile(new URL(String(url).replace(/^\//, ''), publicRoot));
    return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  } catch {
    return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
  }
};
globalThis.window = {};
const { createAudio } = await import('../../audio/audioEngine.ts');
const VERDANT = sceneForMap('verdant');
const ctx = createFakeContext({ decode: () => fakeBuffer(1.5) });
const audio = createAudio({ context: ctx, getMapId: () => 'verdant', getGameMode: () => 'standard', tier: 'desktop' });
const bus = createBus();
audio.bindBus(bus);
audio.resume();
const probe = globalThis.window.__COT_AUDIO;
const listener = { pos: { x: 0, y: 2, z: 0 }, forward: { x: 0, y: 0, z: 1 }, kind: 'player-tank', ownerId: 'me', scoped: false };
const step = async (seconds) => {
  for (let i = 0; i < Math.round(seconds * 30); i++) { ctx.advance(1 / 30); audio.update(1 / 30, listener, []); }
  await probe.libraryIdle();
};
const scene = () => probe.ambientState().active;
// the reveal as the composition sends it (pinned in browserComposition.selftest): the bed ends, the scene starts
async function reveal(path) {
  const seq = probe.sfxLog.at(-1)?.seq ?? 0;
  audio.loadingOn(false);
  audio.ambientOn(true);
  await step(2);
  assert.ok(probe.sfxLog.some((entry) => entry.seq > seq && entry.n === VERDANT.bed), `${path}: the reveal starts the battlefield's own scene`);
  assert.equal(scene(), true, `${path}: the scene plays after the reveal`);
}

// the first round, from the garage: its activation edge, its reveal, then its result screen, which keeps the scene (so
// the rematch below starts with a scene to end, not from silence)
bus.emit('phase:change', { phase: 'garage' });
await step(1);
bus.emit('phase:change', { phase: 'battle' });
await step(2);
await reveal('the first round');
bus.emit('battle:ended', { result: 'victory' });
await step(5);
assert.equal(scene(), true, 'the result screen keeps the battlefield scene');

// the rematch: its loader start (the composition's calls), the loader's first seconds, its activation edge (battle to
// battle: activationRuntime), the rest of the load, then its reveal
for (const { name, arg } of calls) {
  if (arg === undefined) audio[name]();
  else audio[name](arg);
}
await step(5);
assert.equal(scene(), false, `a rematch: no battlefield scene under the next round's loader (the loader start: ${said})`);
bus.emit('phase:change', { phase: 'battle' });
await step(10);
// a regression guard, green on H0 (the engine's battle edge ends the intent): on 269 alone the new map's scene began here
assert.equal(scene(), false, 'a rematch: no scene from the activation edge to the reveal');
await reveal('a rematch');

console.log(`roundLoaderAmbience.selftest: the composition's loader start (${said}) leaves no scene under a rematch's loader or after its activation edge, and the reveal starts the battlefield's scene passed`);
