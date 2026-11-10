// A light harness for driving the real audio engine in Node (2026-11-02 audit F11 receipts): every fetched file
// "decodes" to a short buffer named after its asset, so what sounds reads back by name. Buffers are 1.5 s long at a
// 1 kHz rate: a battle warm decodes a few thousand files, and full-rate fakes would cost hundreds of megabytes.
import { createFakeContext, fakeBuffer } from './fakeAudioContext.test-support.mjs';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** The asset id of an sfx or voice file URL. */
export const assetOf = (url) => String(url).replace(/^.*\/audio\/(?:sfx|voice)\/[^/]+\//, '').replace(/_\d+\.webm$/, '');

/**
 * Install a fetch whose files decode to buffers named after their asset. `hold(url)` files wait for their release();
 * `fail(url)` files answer 404.
 */
export function installFetch({ hold = () => false, fail = () => false } = {}) {
  const order = [];
  const held = [];
  globalThis.fetch = (url) => {
    const href = String(url);
    order.push(href);
    if (fail(href)) return Promise.resolve({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) });
    const response = () => ({ ok: true, status: 200, arrayBuffer: async () => encoder.encode(href).buffer });
    if (!hold(href)) return Promise.resolve(response());
    return new Promise((resolve) => held.push({ url: href, release: () => resolve(response()) }));
  };
  return { order, held };
}

/** A fake context whose decoded buffers carry their asset's name. */
export function namedContext() {
  return createFakeContext({
    sampleRate: 48000,
    decode: (bytes) => Object.assign(fakeBuffer(1.5, 1000), { name: assetOf(decoder.decode(bytes)) }),
  });
}

export const terrain = { getHeightAt: () => 0, getGroundType: () => 'medium', getTrackSurfaceAt: () => 0, getWaterDepthAt: () => 0 };

export function tank(id, { specId = 't72b3m_2022', nation = 'Russia', x = 0, z = 0, team = 'player', isPlayer = false, destroyed = false, aerial } = {}) {
  return {
    id, team, isPlayer, specId,
    spec: { id: specId, nation, role: 'mbt', weightTons: 46, enginePowerHp: 1130, topSpeedKmh: 70, reverseSpeedKmh: 15, gun: { caliberMm: 125, shells: [{ type: 'APFSDS' }] } },
    state: { pos: { x, y: 0, z }, speed: 0, yaw: 0, yawRate: 0, verticalSpeed: 0, grounded: true, turretYawRate: 0, gunPitch: 0 },
    input: { throttle: 0 },
    combat: { destroyed, hp: destroyed ? 0 : 1000, maxHp: 1000, modules: {}, ammo: [20], ammoCapacity: [20], shellSlot: 0 },
    ...(aerial ? { aerial } : {}),
  };
}

export const listener = { pos: { x: 0, y: 2, z: 0 }, forward: { x: 0, y: 0, z: 1 }, kind: 'player-tank', ownerId: 'me', scoped: false };

/** Recorded loops sounding now, by asset. */
export const sounding = (ctx) => ctx.started.filter((n) => n.kind === 'source' && n.loop && n.buffer?.name && n.stopped == null).map((n) => n.buffer.name);

/** The engine's debug surface (each engine installs its own at resume). */
export const probeOf = () => globalThis.window.__COT_AUDIO;
export const mark = (probe = probeOf()) => probe.sfxLog.at(-1)?.seq ?? 0;
export const since = (seq, probe = probeOf()) => probe.sfxLog.filter((e) => e.seq > seq).map((e) => e.n);
export const count = (names, id) => names.filter((n) => n === id).length;
export const settle = async (turns = 8) => { for (let i = 0; i < turns; i++) await new Promise((resolve) => setImmediate(resolve)); };
