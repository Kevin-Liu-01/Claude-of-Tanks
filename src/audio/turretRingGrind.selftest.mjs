// turretRingGrind.selftest (release 273, fire-fx-followups): a damaged turret ring's grind is one held loop while the
// turret slews on it. Before, a 0.6 s cut of the loop restarted every 0.2 s (its cue's cooldown) as long as the turret
// slewed, each start a click; now the loop starts at the slew's edge (traverse above 0.08 rad/s on a damaged ring), holds
// through a servo's flicker under the edge, and fades out 0.12 s after the slew stops, when the ring is repaired, or when
// our hull is destroyed. A sound ring never grinds. Drives the real audio engine over a fake AudioContext.
// First-party: Kevin B. Liu (NOTICE.md).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFakeContext, fakeBuffer } from './fakeAudioContext.test-support.mjs';
import { createBus } from '../game/stateCore.ts';

const publicRoot = new URL('../../public/', import.meta.url);
globalThis.fetch = async (url) => {
  try {
    const bytes = await readFile(new URL(String(url).replace(/^\//, ''), publicRoot));
    return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  } catch {
    return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
  }
};
globalThis.window = globalThis.window ?? {};
const { createAudio } = await import('./audioEngine.ts');

const TICK = 1 / 60;
const GRIND = 'traverse_grind_loop';
const ctx = createFakeContext({ decode: () => fakeBuffer(3.1) });
const audio = createAudio({ context: ctx, getMapId: () => 'urban', getGameMode: () => 'standard', tier: 'desktop',
  getTerrain: () => ({ getHeightAt: () => 0, getGroundType: () => 'medium', getTrackSurfaceAt: () => 0, getWaterDepthAt: () => 0 }) });
const bus = createBus();
audio.bindBus(bus);
audio.resume();
const probe = globalThis.window.__COT_AUDIO;
const me = {
  id: 'me', team: 'player', isPlayer: true, specId: 't72b3m_2022',
  spec: { id: 't72b3m_2022', nation: 'Russia', role: 'mbt', weightTons: 46.5, enginePowerHp: 1130, topSpeedKmh: 70, reverseSpeedKmh: 15,
    gun: { caliberMm: 125, shells: [{ type: 'APFSDS' }] } },
  state: { pos: { x: 0, y: 0, z: 0 }, speed: 0, yaw: 0, yawRate: 0, verticalSpeed: 0, grounded: true, turretYawRate: 0, gunPitch: 0 },
  input: { throttle: 0 },
  combat: { destroyed: false, hp: 1000, maxHp: 1000, modules: { turretRing: { state: 'yellow' } }, ammo: [20], ammoCapacity: [20], shellSlot: 0 },
};
const listener = { pos: { x: 0, y: 2, z: 0 }, forward: { x: 0, y: 0, z: 1 }, kind: 'player-tank', ownerId: 'me', scoped: false };
bus.emit('phase:change', { phase: 'battle' });
await audio.warmBattleEvents(['t72b3m_2022']);
for (let i = 0; i < 10; i++) { ctx.advance(TICK); audio.update(TICK, listener, [me]); }
await probe.libraryIdle();
for (let i = 0; i < 30; i++) { ctx.advance(TICK); audio.update(TICK, listener, [me]); }

const starts = () => probe.sfxLog.filter((e) => e.n === GRIND).length;
/** Runs `seconds` of frames with the turret's slew rate from `rate(frame)`; returns the most grind voices, and the least
 *  once one had started (0 when none ever did). */
function run(seconds, rate) {
  let most = 0, least = Infinity;
  for (let f = 0; f * TICK < seconds - 1e-9; f++) {
    me.state.turretYawRate = rate(f);
    ctx.advance(TICK);
    audio.update(TICK, listener, [me]);
    const n = probe.activeVoices(GRIND);
    most = Math.max(most, n);
    if (most > 0) least = Math.min(least, n);
  }
  return { most, least: most > 0 ? least : 0 };
}

const before = starts();
assert.deepEqual(run(0.5, () => 0), { most: 0, least: 0 }, 'a still turret on a damaged ring is quiet');
// a full second's slew: one grind, held the whole slew (the old cut restarted five times a second)
const slew = run(1, () => 0.5);
assert.equal(starts() - before, 1, `one slew, one grind (${starts() - before} starts)`);
assert.equal(slew.most, 1, 'the grind is one voice');
assert.equal(run(0.1, () => 0.5).least, 1, 'held to the slew\'s end');
// the slew stops: the grind holds RING_GRIND_RELEASE_S, then fades
const stopped = run(0.5, () => 0);
assert.equal(stopped.least, 0, 'and fades once the turret stops');
assert.equal(probe.activeVoices(GRIND), 0);
// a servo hunting about the edge (a frame above it, a frame still): one grind held through it, not a start per flicker
const flickerFrom = starts();
const flicker = run(0.6, (f) => (f % 2 ? 0.1 : 0));
assert.equal(starts() - flickerFrom, 1, 'a flickering slew is one grind');
assert.equal(flicker.least, 1, 'held through the flicker');
run(0.5, () => 0);
assert.equal(probe.activeVoices(GRIND), 0);
// the ring repaired mid-slew: the grind fades; a sound ring never grinds
const repairFrom = starts();
run(0.3, () => 0.5);
me.combat.modules.turretRing.state = 'ok';
const repaired = run(0.5, () => 0.5);
assert.equal(repaired.least, 0, 'a repaired ring stops grinding');
assert.equal(starts() - repairFrom, 1);
assert.deepEqual(run(0.5, () => 0.5), { most: 0, least: 0 }, 'a sound ring never grinds');
// our hull destroyed mid-slew: its edges stop updating, and the grind goes with them
me.combat.modules.turretRing.state = 'red';
run(0.3, () => 0.5);
assert.equal(probe.activeVoices(GRIND), 1);
me.combat.destroyed = true;
run(0.1, () => 0.5);
assert.equal(probe.activeVoices(GRIND), 0, 'a destroyed hull\'s grind goes with it');
console.log(`turretRingGrind.selftest: ${starts() - before} grinds over four slews (one through a servo's flicker), each one held voice faded at its edges`);
