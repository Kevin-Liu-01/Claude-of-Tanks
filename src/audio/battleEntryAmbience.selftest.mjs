// Receipt (world-sfx-269, 2026-11-04; found in gun-reports-269's renders, logged in TESTS-OWED): leaving the garage ends
// the garage scene on the battle phase edge itself. The battle's scene waits for the reveal or the rollout (ambientOn),
// and until this the hangar's bed and workshop spots (garage_clank, the tools, the crane chain) ran on under the battle's
// loading screen. Every entry path crosses one edge, the audio engine's battle phase: the scan below holds each
// assignment of the battle phase to its phase:change, and the real engine is driven down each path in its own order —
// a solo start (the garage's return turned ambience off, the start emits the phase, the reveal turns it on), an online
// first battle from a cold boot (activation, then the reveal), and a rematch from the result screen (battle to battle).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createFakeContext, fakeBuffer } from './fakeAudioContext.test-support.mjs';
import { createBus } from '../game/stateCore.ts';
import { GARAGE_SCENE, sceneForMap } from './environmentScenes.ts';

// ---- one edge: every write of the battle phase emits it, so no entry path reaches a battle the engine missed. (round 7
// merge of 269 into the state machine fixes) The phase has one writer, the app lifecycle's transitionAppPhase
// (game/appLifecycle.ts, 2026-11-02 audit F1), which announces phase:change; so each entry's write goes through it with
// its announcement on (no `announce: false`), and nothing assigns the battle phase by hand.
const root = fileURLToPath(new URL('../../', import.meta.url));
const gitGrep = (...args) => {
  try {
    return execFileSync('git', ['-C', root, 'grep', '-n', ...args, '--', 'src/*.ts', ':!*.selftest.*'], { encoding: 'utf8' })
      .trim().split('\n').filter(Boolean);
  } catch (error) {
    if (error.status === 1) return []; // git grep: no match
    throw error;
  }
};
const sites = gitGrep('-E', "transitionAppPhase\\([^,]+, 'battle'");
assert.ok(sites.length >= 2, `the solo start and the online activation set the battle phase (${sites.length})`);
for (const site of sites) {
  const [file, line] = site.split(':');
  const call = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8').split('\n').slice(Number(line) - 1, Number(line) + 5).join('\n');
  assert.ok(!/announce:\s*false/.test(call), `${file}:${line} announces the battle phase it sets`);
}
assert.deepEqual(gitGrep('-F', "phase = 'battle'"), [], 'no site assigns the battle phase past its one writer');
const owner = readFileSync(new URL('../game/appLifecycle.ts', import.meta.url), 'utf8');
assert.match(owner, /transition\(next, \{ reason, announce: shouldAnnounce = true, beforeAnnounce \}\) \{[\s\S]{0,600}?game\.phase = next;[\s\S]{0,400}?queued\.push\(/,
  'the one writer announces each phase it writes (phase:change, unless a caller turns it off)');

// ---- the engine down each path.
const publicRoot = new URL('../../public/', import.meta.url);
globalThis.fetch = async (url) => {
  try {
    const bytes = await readFile(new URL(String(url).replace(/^\//, ''), publicRoot));
    return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  } catch {
    return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
  }
};
globalThis.window = {};
const { createAudio } = await import('./audioEngine.ts');
const HANGAR = new Set([GARAGE_SCENE.bed, ...GARAGE_SCENE.spots.map(([id]) => id)]);
const VERDANT = sceneForMap('verdant');

async function engine() {
  const ctx = createFakeContext({ decode: () => fakeBuffer(1.5) });
  const audio = createAudio({ context: ctx, getMapId: () => 'verdant', getGameMode: () => 'standard', tier: 'desktop' });
  const bus = createBus();
  audio.bindBus(bus);
  audio.resume();
  const probe = globalThis.window.__COT_AUDIO;
  const listener = { pos: { x: 0, y: 2, z: 0 }, forward: { x: 0, y: 0, z: 1 }, kind: 'player-tank', ownerId: 'me', scoped: false };
  const step = async (s) => {
    for (let i = 0; i < Math.round(s * 30); i++) { ctx.advance(1 / 30); audio.update(1 / 30, listener, []); }
    await probe.libraryIdle();
  };
  const mark = () => probe.sfxLog.at(-1)?.seq ?? 0;
  const since = (seq) => probe.sfxLog.filter((e) => e.seq > seq).map((e) => e.n);
  return { audio, bus, probe, step, mark, since };
}
// the garage first: its scene and its spots really play (the spots come every 4-10 s)
async function inGarage(e) {
  e.bus.emit('phase:change', { phase: 'garage' });
  await e.step(1);
  const seq = e.mark();
  await e.step(25);
  const heard = e.since(seq).filter((id) => HANGAR.has(id));
  assert.ok(heard.some((id) => id !== GARAGE_SCENE.bed), `the hangar's workshop spots play in the garage (${heard})`);
}
// from the edge through a long load: nothing of the hangar, no scene at all until the battle's is asked for
async function silentLoad(e, path) {
  const seq = e.mark();
  await e.step(25);
  const hangar = e.since(seq).filter((id) => HANGAR.has(id));
  assert.deepEqual(hangar, [], `${path}: nothing of the hangar after the battle phase edge`);
  assert.equal(e.probe.ambientState().active, false, `${path}: no scene before the reveal`);
}
async function revealed(e, path) {
  const seq = e.mark();
  e.audio.ambientOn(true);
  await e.step(2);
  assert.ok(e.since(seq).includes(VERDANT.bed), `${path}: the reveal starts the battlefield's own scene`);
}

// a solo start: the return to the garage turned ambience off (garageReturnRuntime), the start emits the battle phase
// before its bake and warms (soloBattleStartRuntime), the reveal turns it on (soloBattleLoadingRuntime)
const solo = await engine();
await inGarage(solo);
solo.audio.ambientOn(false);
solo.bus.emit('phase:change', { phase: 'battle' });
await silentLoad(solo, 'a solo start');
await revealed(solo, 'a solo start');

// an online first battle from a cold boot (ambience never asked for): the activation emits the phase
// (activationRuntime), the reveal turns ambience on (browserComposition)
const online = await engine();
await inGarage(online);
online.bus.emit('phase:change', { phase: 'battle' });
await silentLoad(online, 'an online activation');
await revealed(online, 'an online activation');

// a rematch from the result screen: battle to battle with ambience on, no garage between
online.bus.emit('battle:ended', { result: 'victory' });
await online.step(5);
const seq = online.mark();
online.bus.emit('phase:change', { phase: 'battle' });
await online.step(25);
assert.deepEqual(online.since(seq).filter((id) => HANGAR.has(id)), [], 'a rematch: nothing of the hangar');

console.log(`battleEntryAmbience.selftest: ${sites.length} battle phase assignments each emit the edge; a solo start, an online activation and a rematch play nothing of the hangar after it, and the reveal starts the battlefield's scene passed`);
