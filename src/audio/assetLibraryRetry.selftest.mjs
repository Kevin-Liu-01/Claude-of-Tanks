// 2026-11-02 audit F11 (machine 7): the asset library's entries and pins. An asset whose every file failed is asked
// for again after a backoff (one transient fetch error used to silence its cue for the session); pins are owned, so
// the battle warm's new set replaces the battle's pins only, never the session's radio net, the aircraft set or a
// live rig's loop; a loop starting on a buffer counts as its use for the idle eviction.
import assert from 'node:assert/strict';
import { createFakeContext, fakeBuffer } from './fakeAudioContext.test-support.mjs';
import { createBus } from '../game/stateCore.ts';
import { installFetch, namedContext, terrain, tank, listener, probeOf } from './engineHarness.test-support.mjs';

let now = 1000;
Object.defineProperty(performance, 'now', { configurable: true, value: () => now });
const { createAssetLibrary } = await import('./assetLibrary.ts');

const ctx = createFakeContext({ decode: () => fakeBuffer(1.5, 1000) });
let down = true;
const fetchImpl = async (url) => (down && String(url).includes('/pen_heavy_')
  ? { ok: false, status: 503, arrayBuffer: async () => new ArrayBuffer(0) }
  : { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(16) });
const lib = createAssetLibrary({ context: ctx, base: '/', fetchImpl, createDecoder: () => ctx });
await lib.ready;

// 1. a transient failure is retried after its backoff
await lib.load(['pen_heavy']);
assert.equal(lib.has('pen_heavy'), false, 'every file of the asset failed');
down = false;
assert.equal(lib.pick('pen_heavy', () => 0), null);
await lib.idle();
assert.equal(lib.has('pen_heavy'), false, 'within its backoff the failed asset is not fetched again');
now += 2500;
assert.equal(lib.pick('pen_heavy', () => 0), null, 'its next request after the backoff fetches it again');
await lib.idle();
assert.equal(lib.has('pen_heavy'), true, 'and the cue plays once the network is back');
down = true;
await lib.load(['missing_never']); // an id the manifest does not name stays a no-op
// a load() past the backoff retries too
const other = createAssetLibrary({ context: ctx, base: '/', fetchImpl, createDecoder: () => ctx });
await other.load(['pen_heavy']);
down = false;
now += 2500;
await other.load(['pen_heavy']);
assert.equal(other.has('pen_heavy'), true, 'a load after the backoff retries the failed asset');

// 2. owned pins: a replace starts a new set for its own group only
const small = createAssetLibrary({ context: ctx, base: '/', fetchImpl, createDecoder: () => ctx, maxDecodedMb: 0.01 });
small.pin(['radio_static_loop'], false, 'session');
small.pin(['gun_120_close'], true, 'battle');
small.pin(['engine_turbine_agt_idle'], false, 'rigs');
small.pin(['tank_explode'], true, 'battle'); // the next battle warm
assert.equal(small.isPinned('radio_static_loop'), true, 'the battle warm leaves the session\'s radio net pinned');
assert.equal(small.isPinned('engine_turbine_agt_idle'), true, 'and a live rig\'s loop');
assert.equal(small.isPinned('gun_120_close'), false, 'it replaces the last battle\'s pins');
assert.equal(small.isPinned('tank_explode'), true);
assert.equal(small.stats().pinned, 3);
small.pin(['tank_explode'], true); // an unnamed owner is the shared group
assert.equal(small.isPinned('radio_static_loop'), true);
await small.load(['radio_static_loop', 'engine_turbine_agt_idle', 'gun_120_close', 'smoke_burst']);
now += 60_000;
await small.load(['pen_light']);
assert.ok(small.has('radio_static_loop') && small.has('engine_turbine_agt_idle'), 'owned pins survive eviction past the cap');
assert.equal(small.has('gun_120_close'), false, 'the unpinned idle bank is evicted');

// 3. a loop starting on a buffer is a use of it
const lru = createAssetLibrary({ context: ctx, base: '/', fetchImpl, createDecoder: () => ctx, maxDecodedMb: 0.01 });
await lru.load(['water_wade_loop', 'smoke_burst']);
now += 60_000;
assert.ok(lru.variant('water_wade_loop', 0), 'a rig starts its loop on the buffer');
await lru.load(['pen_light']);
assert.equal(lru.has('water_wade_loop'), true, 'a buffer a loop just started on is not idle');
assert.equal(lru.has('smoke_burst'), false, 'while an idle one is evicted');

// 4. the engine's owners: the battle warm, before and during a battle, never unpins the radio net or a live rig's loop
globalThis.window = {};
installFetch();
const { createAudio } = await import('./audioEngine.ts');
const ectx = namedContext();
const audio = createAudio({ context: ectx, getMapId: () => 'verdant', getGameMode: () => 'standard', getTerrain: () => terrain, tier: 'desktop' });
const bus = createBus();
audio.bindBus(bus);
audio.resume();
const probe = probeOf();
bus.emit('phase:change', { phase: 'battle' });
await audio.warmBattleEvents(['t72b3m_2022']);
await probe.libraryIdle();
const tanks = [tank('me', { isPlayer: true }), tank('near', { specId: 'm1a1_abrams_hc', nation: 'USA', x: 20, z: 30 })];
for (let i = 0; i < 20; i++) { ectx.advance(1 / 30); audio.update(1 / 30, listener, tanks); }
const nearFamily = probe.engineState().find((rig) => rig.id === 'near')?.family;
assert.ok(nearFamily, 'the near hull has its rig');
assert.equal(probe.pinned('radio_static_loop'), true, 'the radio net stays pinned through the battle warm');
await audio.warmBattleEvents(['t72b3m_2022']); // a later warm in the same battle (a round load, a late call)
assert.equal(probe.pinned('radio_static_loop'), true, 'and through a later warm');
assert.ok(probe.pinned(`engine_${nearFamily}_idle`) || probe.pinned(`engine_${nearFamily}_mid`), 'a live rig\'s loop stays pinned through a later warm');

console.log('assetLibraryRetry.selftest: failed assets retried after a backoff, owned pins (the battle warm replaces its own), a loop start is a use passed');
