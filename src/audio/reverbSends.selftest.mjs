// Receipt (world-sfx-269, 2026-11-04; crew-lines-269's finding 11): a settings channel at 0 silences its reverb too.
// The voice pool, the vehicle rigs and the aircraft rigs each sent to the reverb straight into its input, past the bus
// gain that carries the channel, so Engine 0 or Combat 0 still played the engines', guns' and aircraft's reverb. Every
// send now joins its channel's send (mixer.reverbSend), and the reverb has no other input. The graph is walked from
// every started source to the convolver: a remote tank, a remote gunship and an enemy shot each reach it, and a channel
// at 0 leaves nothing of its own on it while the other channels keep theirs.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import '../vehicles/fleetRegistration.ts';
import { TANK_SPECS } from '../vehicles/specs.ts';
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
globalThis.window = {};
const { createAudio } = await import('./audioEngine.ts');
const ctx = createFakeContext({ decode: () => fakeBuffer(1.5) });
const terrain = { getHeightAt: () => 0, getGroundType: () => 'medium', getTrackSurfaceAt: () => 0, getRoadPaveAt: () => 0, getWaterDepthAt: () => 0 };
// the desktop tier has the reverb (mobile keeps the dry mix)
const audio = createAudio({ context: ctx, getMapId: () => 'verdant', getGameMode: () => 'standard', getTerrain: () => terrain, tier: 'desktop' });
const bus = createBus();
audio.bindBus(bus);
audio.resume();
const probe = globalThis.window.__COT_AUDIO;
function hull(id, specId, { x = 0, y = 0, z = 0, team = 'player', isPlayer = false, speed = 0, aerial = undefined } = {}) {
  return {
    id, team, isPlayer, specId, spec: TANK_SPECS[specId], ...(aerial ? { aerial } : {}),
    state: { pos: { x, y, z }, speed, yaw: Math.PI / 2, yawRate: 0, verticalSpeed: 0, grounded: !aerial, turretYawRate: 0, gunPitch: 0 },
    input: { throttle: speed ? 1 : 0 },
    combat: { destroyed: false, hp: 1000, maxHp: 1000, modules: {}, ammo: [20], ammoCapacity: [20], shellSlot: 0 },
  };
}
const listener = { pos: { x: 0, y: 2, z: 0 }, forward: { x: 0, y: 0, z: 1 }, kind: 'player-tank', ownerId: 'me', scoped: false };
const field = [hull('me', 'leo2a4', { isPlayer: true }), hull('foe', 't80u', { x: 40, z: 120, team: 'enemy', speed: 6 })];
bus.emit('phase:change', { phase: 'battle' });
await audio.warmBattleEvents(['leo2a4', 't80u']);
const step = async (n) => {
  for (let i = 0; i < n; i++) { ctx.advance(1 / 30); audio.update(1 / 30, listener, field); }
  await probe.libraryIdle();
};

// The reverb's only input is the reverb input, and that input's only inputs are the channels' sends.
const convolver = ctx.nodes.find((node) => node.kind === 'convolver');
assert.ok(convolver, 'the desktop tier builds the reverb');
const into = (target) => ctx.nodes.filter((node) => node.outputs.includes(target));
const startedSince = (from) => ctx.started.slice(from);
/** The loudest gain from a node to the convolver over every path (filters and panners pass 1). */
function wet(node, memo = new Map()) {
  if (node === convolver) return 1;
  if (memo.has(node)) return memo.get(node);
  memo.set(node, 0);
  let best = 0;
  for (const out of node.outputs) best = Math.max(best, wet(out, memo));
  const value = (node.kind === 'gain' ? node.gain.value : 1) * best;
  memo.set(node, value);
  return value;
}
/** The channel send a node reaches (each source plays on one bus, so one channel). */
function sendOf(node, sends, seen = new Set()) {
  if (sends.includes(node)) return node;
  if (seen.has(node)) return null;
  seen.add(node);
  for (const out of node.outputs) { const send = sendOf(out, sends, seen); if (send) return send; }
  return null;
}

// a remote tank's rig, then a gunship circling overhead, then an enemy's shot
let from = ctx.started.length;
await step(20);
await step(20);
const rigSources = startedSince(from);
from = ctx.started.length;
field.push(hull('spectre', 't80u', { x: -200, y: 600, z: 300, team: 'enemy', aerial: { kind: 'gunship', active: true } }));
await step(20);
await step(20);
const gunshipSources = startedSince(from);
from = ctx.started.length;
bus.emit('shell:fired', { shellId: 1, shooterId: 'foe', muzzlePos: [40, 2, 120], dir: [-0.316, 0, -0.949], caliberMm: 125, shellType: 'APFSDS', velocityMps: 1700 });
await step(4);
const shotSources = startedSince(from);

const reverbInput = into(convolver);
assert.equal(reverbInput.length, 1, `the reverb has one input (${reverbInput.map((n) => n.kind)})`);
const sends = into(reverbInput[0]);
assert.ok(sends.length > 0 && sends.length <= 5 && sends.every((node) => node.kind === 'gain'),
  `only the channels' sends feed the reverb, no voice or rig of its own (${sends.length} inputs)`);

const heard = (sources) => sources.filter((source) => wet(source) > 0);
for (const [what, sources] of [['a remote tank', rigSources], ['a gunship overhead', gunshipSources], ['an enemy shot', shotSources]]) {
  assert.ok(heard(sources).length > 0, `${what} reaches the reverb with every channel up (${sources.length} sources)`);
}

// Engine at 0: nothing of the engine channel's reaches the reverb; the guns keep theirs.
bus.emit('ui:volumes', { engine: 0 });
const engineSend = sends.find((send) => send.gain.value === 0);
assert.ok(engineSend, 'the engine channel has its own send');
const engineSources = [...rigSources, ...gunshipSources].filter((source) => sendOf(source, sends) === engineSend);
assert.ok(engineSources.some((source) => rigSources.includes(source)), 'the tank\'s rig sends on the engine channel');
assert.ok(engineSources.some((source) => gunshipSources.includes(source)), 'the gunship\'s rig sends on the engine channel');
assert.deepEqual(engineSources.filter((source) => wet(source) > 0), [], 'Engine 0: no engine or aircraft reverb');
assert.ok(heard(shotSources).length > 0, 'Engine 0 leaves the guns\' reverb');

// Combat at 0: the shot is gone from the reverb too.
bus.emit('ui:volumes', { combat: 0 });
assert.deepEqual(heard(shotSources), [], 'Combat 0: no gunfire reverb');
bus.emit('ui:volumes', { engine: 1, combat: 1 });
assert.ok(heard(rigSources).length > 0 && heard(shotSources).length > 0, 'the channels back up bring their reverb back');

bus.emit('phase:change', { phase: 'garage' });
console.log(`reverbSends.selftest: the reverb fed only by ${sends.length} channel sends; a tank (${heard(rigSources).length} sources), a gunship and a shot reach it; Engine 0 and Combat 0 leave nothing of theirs on it passed`);
