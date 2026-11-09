import assert from 'node:assert/strict';
import { createFakeContext, fakeBuffer } from './fakeAudioContext.test-support.mjs';

// The library's idle clock: eviction looks at performance.now().
let now = 1000;
Object.defineProperty(performance, 'now', { configurable: true, value: () => now });

const { createAssetLibrary } = await import('./assetLibrary.ts');
const { SFX_ASSETS } = await import('./sfxManifest.generated.ts');

const fetched = [];
const fetchImpl = async (url) => {
  fetched.push(String(url));
  return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(16) };
};
const ctx = createFakeContext({ decode: () => fakeBuffer(1.5) });
const options = { context: ctx, base: '/', fetchImpl, createDecoder: () => ctx };

// Desktop: every variant decodes; a pinned asset outlives idle eviction past the soft cap.
const desktop = createAssetLibrary({ ...options, maxDecodedMb: 0.5 });
assert.equal(await desktop.ready, true, 'the format probe decodes');
desktop.pin(['gun_120_close', 'smoke_burst']);
await desktop.load(['gun_120_close', 'smoke_burst', 'pen_heavy', 'ram_heavy']);
assert.equal(fetched.filter((u) => u.includes('/gun_120_close_')).length, SFX_ASSETS.gun_120_close.n, 'desktop decodes every variant');
now += 60_000;
await desktop.load(['tank_explode']);
assert.ok(desktop.has('gun_120_close') && desktop.has('smoke_burst'), 'pinned assets survive a minute idle past the cap');
assert.ok(!desktop.has('pen_heavy') && !desktop.has('ram_heavy'), 'idle unpinned assets are evicted past the cap');
assert.ok(desktop.has('tank_explode'), 'the asset just loaded stays');
assert.equal(desktop.stats().pinned, 2);
desktop.pin(['tank_explode'], true);
assert.equal(desktop.stats().pinned, 1, 'replace starts a new pinned set');

// An evicted asset reloads on request (the request itself returns nothing).
assert.equal(desktop.pick('pen_heavy', Math.random), null);
await desktop.load(['pen_heavy']);
assert.ok(desktop.pick('pen_heavy', Math.random), 'and plays once decoded');

// A receipt holds an asset on one variant whatever the stream draws (audio-mix-balance: each moment at its loudest
// take), and releasing the hold lets the stream choose again.
await desktop.load(['gun_120_close']);
const takes = Array.from({ length: SFX_ASSETS.gun_120_close.n }, (_, i) => desktop.variant('gun_120_close', i));
const last = takes.length - 1;
desktop.holdVariants({ gun_120_close: last });
for (const draw of [0, 0.3, 0.6, 0.99]) assert.equal(desktop.pick('gun_120_close', () => draw), takes[last], 'a held asset plays its held take');
desktop.holdVariants(null);
assert.equal(desktop.pick('gun_120_close', () => 0), takes[0], 'released, the stream chooses again');

// Crew packs never count against the sound-effect cap.
await desktop.loadVoice('ru');
const stats = desktop.stats();
assert.ok(stats.voiceMb > 0 && stats.decodedMb > stats.sfxMb, `voice bytes tracked apart (${JSON.stringify(stats)})`);
// A crew line can be asked for by take (the gunner's "short" is the miss line's second take).
const missTakes = desktop.voiceTakes('ru', 'miss');
assert.ok(missTakes >= 2, `the miss line has a short take (${missTakes})`);
const short = desktop.voice('ru', 'miss', () => 0, 1);
assert.ok(short && short !== desktop.voice('ru', 'miss', () => 0, 0), 'the requested take, not a random one');
assert.equal(desktop.voice('ru', 'miss', () => 0, 1), short, 'and the same take every time');

// One crew pack held at a time (crew-languages-270): a dropped pack's decoded bytes go, and a drop during the load stops it
// without leaving the pack ready or counted.
{
  const one = desktop.stats().voiceMb;
  await desktop.loadVoice('de');
  assert.ok(desktop.stats().voiceMb > one, 'a second pack adds its bytes while both are held');
  const both = desktop.stats().voiceMb;
  desktop.dropVoice('ru');
  assert.ok(desktop.stats().voiceMb < both, 'dropping one releases its bytes');
  assert.equal(desktop.voiceReady('ru'), false, 'a dropped pack is no longer ready');
  assert.equal(desktop.voice('ru', 'miss', () => 0), null, 'and plays nothing');
  assert.deepEqual(desktop.stats().voices, ['de']);
  desktop.dropVoice('de');
  assert.equal(desktop.stats().voiceMb, 0, 'with every pack dropped no crew bytes remain');
  const dropping = desktop.loadVoice('ru');
  desktop.dropVoice('ru');
  await dropping;
  assert.equal(desktop.voiceReady('ru'), false, 'a drop during the load leaves nothing ready');
  assert.equal(desktop.stats().voiceMb, 0, 'and counts no bytes');
  await desktop.loadVoice('ru');
  assert.ok(desktop.voiceReady('ru') && desktop.stats().voiceMb > 0, 'a later load fetches it again');
}

// Crew speech decodes at 16 kHz on every tier: the radio passes nothing above its 4.6 kHz speaker roll-off.
for (const lowMemory of [false, true]) {
  const rates = [];
  const lib = createAssetLibrary({ ...options, lowMemory, createDecoder: (rate) => { rates.push(rate); return ctx; } });
  await lib.ready;
  rates.length = 0;
  await lib.loadVoice('ru');
  assert.deepEqual([...new Set(rates)], [16000], `${lowMemory ? 'mobile' : 'desktop'} crew packs decode at 16 kHz (${rates})`);
}

// Mobile: one variant per asset.
fetched.length = 0;
const mobile = createAssetLibrary({ ...options, lowMemory: true });
await mobile.load(['gun_120_close']);
assert.equal(fetched.filter((u) => u.includes('/gun_120_close_')).length, 1, 'mobile decodes one variant');
assert.ok(mobile.variant('gun_120_close', 0));
assert.equal(mobile.variant('gun_120_close', 1), null);
assert.ok(mobile.pick('gun_120_close', Math.random), 'and still picks it');

// idle(): resolves only when every load in flight has settled (a pick's background load and a voice pack included), so
// receipts await the real completion instead of counting event-loop turns.
{
  const gates = [];
  const gatedFetch = (url) => new Promise((resolve) => gates.push(() => resolve({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(16) })));
  const gated = createAssetLibrary({ ...options, fetchImpl: gatedFetch });
  await gated.ready;
  assert.equal(gated.pick('pen_heavy', () => 0), null, 'a pick before its decode starts the load');
  void gated.loadVoice('ru');
  let settled = false;
  const idle = gated.idle().then(() => { settled = true; });
  for (let turn = 0; turn < 20; turn++) await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(settled, false, 'idle() waits while reads are in flight, however many turns pass');
  assert.ok(gated.stats().pending > 0);
  while (!settled) { while (gates.length) gates.shift()(); await new Promise((resolve) => setTimeout(resolve, 0)); }
  await idle;
  assert.equal(gated.stats().pending, 0, 'and resolves once every load has settled');
  assert.ok(gated.has('pen_heavy') && gated.voiceReady('ru'));
  await gated.idle();
}

console.log('assetLibrary.selftest: pinned battle set survives eviction, idle extras evicted and reloaded, voice bytes apart, takes by index, mobile variant cap, idle() awaits every load in flight passed');
