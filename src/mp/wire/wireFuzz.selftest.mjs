import assert from 'node:assert/strict';
import {
  MESSAGE_TYPE, NO_TICK, WIRE_VERSION, WireError, buildSnapshotPacket, decodeMessage, encodeMessage,
} from './index.ts';

// 10k random byte strings plus 10k structured mutations of valid frames: the
// decoder must answer every one with a typed result and never throw.
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0xf022);
const int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

const valid = [
  encodeMessage({ type: MESSAGE_TYPE.HELLO, protocolVersion: 1, capabilities: 1, token: 'tok.en', clientBuild: 'b' }),
  encodeMessage({ type: MESSAGE_TYPE.INPUT, clientTick: 100, snapshotAckTick: 98, interpDelayMs: 80, controls: [
    { throttle: 127, steer: -20, flags: 3, aimYaw: 100, aimPitch: -50, aimDistance: 20000, shellSlot: 1, fireSeq: 3, actionSeq: 1, actionBits: 1 },
    { throttle: 127, steer: -20, flags: 3, aimYaw: 101, aimPitch: -50, aimDistance: 20000, shellSlot: 1, fireSeq: 3, actionSeq: 1, actionBits: 0 },
  ] }),
  encodeMessage({ type: MESSAGE_TYPE.PING, clientTimeMs: 1234, snapshotAckTick: NO_TICK }),
  encodeMessage({ type: MESSAGE_TYPE.CHAT, text: 'hello 戦車' }),
  encodeMessage({ type: MESSAGE_TYPE.WELCOME, protocolVersion: 1, tickHz: 60, snapshotHz: 30, seat: 0, entityId: 1, team: 0, serverTick: 5, serverTimeMs: 83, seed: 1, capabilities: 1, roomId: 'room', mapId: 'verdant', mode: 'standard', rulesetJson: '{"mode":"standard"}', roster: [
    { entityId: 1, seat: 0, team: 0, bot: false, connected: true, playerId: 'p1', name: 'One', specId: 'm1a2' },
    { entityId: 2, seat: 255, team: 1, bot: true, connected: false, playerId: 'bot-2', name: 'Bot', specId: 't90m' },
  ] }),
  encodeMessage(buildSnapshotPacket({
    tick: 40, serverTimeMs: 666, ackedInputTick: 38, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: 2,
    meta: { phase: 2, countdownMs: 0, battleTimeMs: 500, verdict: 0, verdictReason: '', destructibleRevision: 1 },
    destroyed: [4, 9], entities: [{
      entityId: 1, x: 1000, y: 2000, z: -3000, speed: 500, verticalSpeed: 0, yaw: 10, pitch: 0, roll: 65530, turretYaw: 20, gunPitch: 30,
      hp: 100, maxHp: 200, reload: 10, reloadTotal: 20, reloadKind: 1, gunReload: 10, gunReloadTotal: 20, gunReloadKind: 1,
      magazineRounds: 0, magazineCapacity: 0, shellSlot: 0, ammo0: 30, ammo1: 300, ammo2: 0, flags: 4, eraSpent: [1, 5, 9],
    }],
    shells: [{ id: 1, shooterEntityId: 1, x: 0, y: 0, z: 0, vx: 10000, vy: 0, vz: 0, shellType: 2, flags: 0 }],
    viewer: { entityId: 1, modules: [0, 0, 0, 0, 0, 0, 0], crewBits: 3, equipment: [1000, 1000, 1000, 1000], modeSpeedMultiplier: 1000, modeGravityScale: 1000, movementVersion: 1, movementFlags: 1, movementValues: [1, 2, 3] },
    modeStateJson: '{"id":"turbo_ball"}',
  }, null)),
  encodeMessage({ type: MESSAGE_TYPE.EVENT, tick: 2, events: [{ kind: 'shell_hit', payload: { damage: 3 } }] }),
  encodeMessage({ type: MESSAGE_TYPE.PONG, clientTimeMs: 1, serverTimeMs: 2, serverTick: 3 }),
  encodeMessage({ type: MESSAGE_TYPE.ERROR, reason: 7, detail: 'malformed' }),
];

let accepted = 0;
let rejected = 0;
const codes = new Map();
const observe = (bytes) => {
  let result;
  try {
    result = decodeMessage(bytes, { resolveBaseline: () => null });
  } catch (error) {
    assert.fail(`decoder threw ${error?.constructor?.name}: ${error?.message}`);
  }
  assert.ok(result && typeof result.ok === 'boolean');
  if (result.ok) { accepted++; return; }
  assert.ok(result.error instanceof WireError, 'rejections are WireError instances');
  assert.equal(typeof result.error.code, 'string');
  rejected++;
  codes.set(result.error.code, (codes.get(result.error.code) || 0) + 1);
};

const started = performance.now();
for (let n = 0; n < 10_000; n++) {
  const length = int(0, 300);
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index++) bytes[index] = int(0, 255);
  if (length > 1 && rng() < 0.5) { bytes[0] = WIRE_VERSION; bytes[1] = [1, 2, 3, 4, 5, 6, 16, 17, 18, 19, 20, 21][int(0, 11)]; }
  observe(bytes);
}
for (let n = 0; n < 10_000; n++) {
  const source = valid[int(0, valid.length - 1)];
  const bytes = source.slice(0, rng() < 0.3 ? int(0, source.byteLength) : source.byteLength);
  for (let flips = int(0, 4); flips > 0 && bytes.byteLength; flips--) {
    const at = int(0, bytes.byteLength - 1);
    bytes[at] = rng() < 0.5 ? bytes[at] ^ (1 << int(0, 7)) : int(0, 255);
  }
  observe(bytes);
}
const elapsed = performance.now() - started;
assert.ok(elapsed < 20_000, `fuzz decode took ${elapsed.toFixed(0)} ms`);
assert.ok(rejected > 15_000, `most fuzzed frames must be rejected (${rejected})`);
assert.ok(!codes.has('internal'), `no rejection may come from an unexpected exception: ${JSON.stringify([...codes])}`);
console.log(`wireFuzz.selftest: 20000 frames decoded in ${elapsed.toFixed(0)} ms, ${accepted} accepted, ${rejected} rejected (${[...codes].map(([code, count]) => `${code}:${count}`).join(' ')}), no throw, no 'internal' code`);
