// Receipt (world-sfx-269, 2026-11-04; found in gun-reports-269's renders, logged in TESTS-OWED): leaving the garage ends
// the garage scene on the battle phase edge itself. The battle's scene waits for the reveal or the rollout (ambientOn),
// and until this the hangar's bed and workshop spots (garage_clank, the tools, the crane chain) ran on under the battle's
// loading screen. Every entry path crosses one edge, the audio engine's battle phase: the scan below holds each battle
// entry to the app lifecycle's one phase writer, which announces what it writes as phase:change, and the real engine is
// driven down each path in its own order — a solo start (the garage's return turned ambience off, the start emits the
// phase, the reveal turns it on), an online first battle from a cold boot (activation, then the reveal), and a rematch
// from the result screen (battle to battle).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFakeContext, fakeBuffer } from './fakeAudioContext.test-support.mjs';
import { createBus } from '../game/stateCore.ts';
import { createAppLifecycle, transitionAppPhase } from '../game/appLifecycle.ts';
import { GARAGE_SCENE, sceneForMap } from './environmentScenes.ts';

// ---- one edge: the battle phase has one writer, and it announces what it writes, so no entry path reaches a battle the
// engine missed. (round 8 Y0, the 269 merge) The 2026-11-02 audit F1 made game/appLifecycle.ts's transition the only
// phase writer (it checks the edge, writes the phase and announces it); this scan used to look for scattered
// `phase = 'battle'` writes each followed by its own emit, the pattern that owner replaced. It now pins the owner: no phase
// write outside it, each entry path asking it for the battle phase, and its announcement bound to the bus's phase:change.
// (round 8 Y0b review r1) And no entry turns that announcement off: the owner announces unless a caller passes
// `announce`, and a battle entered unannounced is the bug this receipt is for (the hangar's bed plays on under the
// loader). Round seven's scan (40c6c92fde) pinned it; the Y0b merge first kept only the walk above and dropped it.
const srcRoot = fileURLToPath(new URL('../', import.meta.url));
const writes = [], entries = [], unannounced = [];
// The whole call's code, from its open paren to the one that closes it, so an option on any line counts. Quoted text is
// kept but not counted for parens; comments are dropped (a comment's apostrophe opens no string, its words name no option).
const callAt = (text, start) => {
  const open = text.indexOf('(', start);
  let depth = 0, quote = null, code = text.slice(start, open);
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') { code += ch + (text[i + 1] ?? ''); i++; continue; }
      if (ch === quote) quote = null;
    } else if (ch === '/' && text[i + 1] === '/') {
      const end = text.indexOf('\n', i);
      i = end < 0 ? text.length : end - 1; // the line's newline is kept
      continue;
    } else if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? text.length : end + 1;
      continue;
    } else if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')' && --depth === 0) return code + ch;
    code += ch;
  }
  return code;
};
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { walk(path); continue; }
    if (!name.endsWith('.ts') || name.endsWith('.d.ts') || name.includes('.selftest.')) continue;
    const text = readFileSync(path, 'utf8');
    const at = (index) => `${relative(srcRoot, path)}:${text.slice(0, index).split('\n').length}`;
    for (const match of text.matchAll(/\bgame\.phase\s*=(?!=)|\bphase\s*=\s*'battle'/g)) writes.push(at(match.index));
    for (const match of text.matchAll(/\btransitionAppPhase\([^;]*?,\s*'battle'\s*,/g)) {
      entries.push(at(match.index));
      if (/\bannounce\b/.test(callAt(text, match.index))) unannounced.push(at(match.index));
    }
  }
};
walk(srcRoot);
assert.deepEqual(writes.filter((site) => !site.startsWith('game/appLifecycle.ts:')), [],
  'nothing writes the battle phase but the app lifecycle (game/appLifecycle.ts)');
const entryFiles = new Set(entries.map((site) => site.split(':')[0]));
for (const file of ['game/soloBattleStartRuntime.ts', 'mp/session/activationRuntime.ts']) {
  assert.ok(entryFiles.has(file), `${file} enters the battle through transitionAppPhase (${entries})`);
}
assert.deepEqual(unannounced, [],
  'each battle entry leaves its announcement to the one writer (no `announce` option), so the engine hears the battle');
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
assert.match(main, /createAppLifecycle\(\{\s*game,\s*announce: \(announcement\) => bus\.emit\('phase:change', announcement\),/,
  "the page's lifecycle announces every phase it writes on the bus's phase:change");
{
  // the owner itself: a battle written through it is announced once, as the audio engine hears it
  const bus = createBus(), heard = [];
  bus.on('phase:change', (e) => heard.push(e.phase));
  const game = { phase: 'garage' };
  createAppLifecycle({ game, announce: (announcement) => bus.emit('phase:change', announcement) });
  transitionAppPhase(game, 'battle', { reason: 'solo-start' });
  assert.equal(game.phase, 'battle');
  assert.deepEqual(heard, ['battle'], 'the battle phase it wrote is announced on phase:change');
}

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

console.log(`battleEntryAmbience.selftest: the battle phase has one writer that announces it (${entries.length} entry paths through it); a solo start, an online activation and a rematch play nothing of the hangar after it, and the reveal starts the battlefield's scene passed`);
