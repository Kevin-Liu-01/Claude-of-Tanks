import assert from 'node:assert/strict';
import {
  ACTION_BIT_MASK, CLOSE_REASON, CLOSE_REASON_NAMES, ENTITY_FLAGS, EVENT_KIND_NAMES, MAX_ENTITIES, MAX_MESSAGE_BYTES,
  MESSAGE_TYPE, NO_ENTITY, NO_SEAT, NO_TICK, PHASE, ROW_GROUP, SHELL_TYPE_NAMES, TEAM, VERDICT, VIEWER_EQUIPMENT,
  VIEWER_MODULES, WIRE_VERSION, WireError,
  applySnapshotPacket, buildSnapshotPacket, decodeMessage, encodeMessage, peekMessageType,
  dequantizeAngle, dequantizePosition, dequantizeReloadS, quantizeAngle, quantizePosition, quantizeReloadS,
  quantizeVelocity, dequantizeVelocity, angleUnitsDelta, wrapAngle, eraPlateNames, eraPlateIndices,
  quantizeAimPitch, dequantizeAimPitch, quantizeAimDistance, dequantizeAimDistance, shellTypeIndex, shellTypeName,
} from './index.ts';

// ------------------------------------------------------------ deterministic helpers
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0x5eed);
const int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = (list) => list[int(0, list.length - 1)];
const word = (max) => {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789_-';
  let out = '';
  for (let n = int(1, max); n > 0; n--) out += alphabet[int(0, alphabet.length - 1)];
  return out;
};
const unicodeWord = () => `${word(6)} ${pick(['Éclair', 'Панцирь', '戦車', '🚀', 'Käfer'])}`;

function randomControl() {
  return {
    throttle: int(-127, 127), steer: int(-127, 127), flags: int(0, 7),
    aimYaw: int(0, 65535), aimPitch: int(-32767, 32767), aimDistance: int(0, 65535),
    shellSlot: int(0, 2), fireSeq: int(0, 65535), actionSeq: int(0, 65535), actionBits: int(0, ACTION_BIT_MASK),
  };
}

function randomRow(entityId, options = {}) {
  const reload = int(0, 3000), reloadTotal = int(reload, 4000), reloadKind = int(0, 3);
  const distinct = options.distinctGunChannel ?? rng() < 0.2;
  const row = {
    entityId,
    x: int(-500000, 500000), y: int(-20000, 90000), z: int(-500000, 500000),
    speed: int(-2000, 2000), verticalSpeed: int(-800, 800),
    yaw: int(0, 65535), pitch: int(0, 65535), roll: int(0, 65535), turretYaw: int(0, 65535), gunPitch: int(0, 65535),
    hp: int(0, 3000), maxHp: int(1, 3000),
    reload, reloadTotal, reloadKind,
    gunReload: distinct ? int(0, 3000) : reload, gunReloadTotal: distinct ? int(0, 4000) : reloadTotal,
    gunReloadKind: distinct ? int(0, 3) : reloadKind,
    magazineRounds: int(0, 12), magazineCapacity: int(0, 12), shellSlot: int(0, 2),
    ammo0: int(0, 750), ammo1: int(0, 750), ammo2: int(0, 750),
    flags: int(0, 511),
    eraSpent: [],
  };
  if (rng() < 0.3) {
    const count = int(1, 40);
    const set = new Set();
    for (let n = 0; n < count; n++) set.add(int(0, 2400));
    row.eraSpent = [...set].sort((a, b) => a - b);
  }
  return row;
}

function randomShell(shooter) {
  return {
    id: int(0, 65535), shooterEntityId: shooter,
    x: int(-500000, 500000), y: int(-2000, 200000), z: int(-500000, 500000),
    vx: int(-18000, 18000), vy: int(-18000, 18000), vz: int(-18000, 18000),
    shellType: rng() < 0.1 ? 255 : int(0, SHELL_TYPE_NAMES.length - 1), flags: int(0, 1),
  };
}

function randomViewer(entityId) {
  const count = int(0, 60);
  return {
    entityId,
    modules: VIEWER_MODULES.map(() => int(0, 2)),
    crewBits: int(0, 3),
    equipment: VIEWER_EQUIPMENT.map(() => int(0, 65535)),
    modeSpeedMultiplier: int(0, 65535), modeGravityScale: int(0, 65535),
    movementVersion: count ? 1 : 0, movementFlags: count ? int(0, 1023) : 0,
    movementValues: Array.from({ length: count }, () => Math.fround((rng() - 0.5) * 2000)),
  };
}

function randomFrame(tick, entityCount, options = {}) {
  const ids = new Set();
  while (ids.size < entityCount) ids.add(int(1, MAX_ENTITIES));
  const entities = [...ids].sort((a, b) => a - b).map((id) => randomRow(id, options));
  const verdict = rng() < 0.15 ? int(1, 3) : 0;
  const destroyed = new Set();
  for (let n = int(0, 30); n > 0; n--) destroyed.add(int(0, 5000));
  return {
    tick, serverTimeMs: tick * 1000 / 60 | 0,
    ackedInputTick: rng() < 0.1 ? NO_TICK : int(0, tick), ackedFireSeq: int(0, 65535), ackedActionSeq: int(0, 65535),
    inputMarginTicks: int(-128, 127),
    meta: {
      phase: int(0, 3), countdownMs: int(0, 65535), battleTimeMs: int(0, 900000), verdict,
      verdictReason: verdict ? pick(['elimination', 'time_limit', 'score']) : '', destructibleRevision: int(0, 100000),
    },
    destroyed: [...destroyed].sort((a, b) => a - b),
    entities,
    shells: Array.from({ length: int(0, 12) }, () => randomShell(entities.length ? pick(entities).entityId : 0)),
    viewer: rng() < 0.7 && entities.length ? randomViewer(pick(entities).entityId) : null,
    modeStateJson: rng() < 0.3 ? JSON.stringify({ id: 'turbo_ball', score: { alpha: int(0, 9), bravo: int(0, 9) } }) : null,
  };
}

/** Advance a frame the way a battle would: some rows move, some flip state, some vanish, some appear. */
function evolveFrame(frame, tick) {
  const entities = [];
  for (const row of frame.entities) {
    if (rng() < 0.08) continue; // hidden now
    const next = { ...row, eraSpent: row.eraSpent.slice() };
    if (rng() < 0.7) {
      next.x += int(-2500, 2500); next.y += int(-200, 200); next.z += int(-2500, 2500);
      next.speed = int(-2000, 2000); next.yaw = (next.yaw + int(-300, 300) + 65536) & 0xffff;
      next.pitch = (next.pitch + int(-100, 100) + 65536) & 0xffff; next.roll = (next.roll + int(-100, 100) + 65536) & 0xffff;
      next.turretYaw = int(0, 65535);
    }
    if (rng() < 0.1) { next.x += 40000; }
    if (rng() < 0.2) { next.hp = int(0, next.maxHp); next.flags ^= 1 << int(0, 8); }
    if (rng() < 0.2) { next.reload = int(0, 3000); if (next.gunReload === row.reload) next.gunReload = next.reload; }
    if (rng() < 0.1) { next.gunReload = int(0, 3000); next.gunReloadKind = int(0, 3); }
    if (rng() < 0.15) { next.eraSpent = [...new Set([...next.eraSpent, int(0, 2400)])].sort((a, b) => a - b); }
    if (rng() < 0.05) next.eraSpent = [];
    if (rng() < 0.1) next.ammo0 = int(0, 750);
    entities.push(next);
  }
  if (rng() < 0.3) {
    let id = int(1, MAX_ENTITIES);
    while (entities.some((row) => row.entityId === id)) id = int(1, MAX_ENTITIES);
    entities.push(randomRow(id));
  }
  entities.sort((a, b) => a.entityId - b.entityId);
  const destroyed = new Set(frame.destroyed);
  for (let n = int(0, 3); n > 0; n--) destroyed.add(int(0, 5000));
  return {
    ...frame, tick, serverTimeMs: tick * 1000 / 60 | 0, ackedInputTick: int(0, tick),
    destroyed: [...destroyed].sort((a, b) => a - b), entities,
    shells: Array.from({ length: int(0, 8) }, () => randomShell(entities.length ? pick(entities).entityId : 0)),
    viewer: frame.viewer ? randomViewer(frame.viewer.entityId) : null,
  };
}

function roundTrip(message, baseline = null, resolveBaseline = null) {
  const bytes = encodeMessage(message, baseline);
  const result = decodeMessage(bytes, resolveBaseline ? { resolveBaseline } : {});
  assert.ok(result.ok, `decode failed: ${result.ok ? '' : result.error.code}: ${result.ok ? '' : result.error.message}`);
  assert.equal(result.bytes, bytes.byteLength);
  return { bytes, message: result.message };
}

// ------------------------------------------------------------ 1. property round trips
let frames = 0;
for (let iteration = 0; iteration < 600; iteration++) {
  const hello = {
    type: MESSAGE_TYPE.HELLO, protocolVersion: int(0, 65535), capabilities: int(0, 0xffffffff),
    token: word(200), clientBuild: unicodeWord(),
  };
  assert.deepEqual(roundTrip(hello).message, hello);
  const clientTick = int(2, 1e6);
  const input = {
    type: MESSAGE_TYPE.INPUT, clientTick, snapshotAckTick: rng() < 0.2 ? NO_TICK : int(0, clientTick),
    interpDelayMs: int(0, 255), controls: Array.from({ length: int(1, 3) }, randomControl),
  };
  assert.deepEqual(roundTrip(input).message, input);
  const ack = { type: MESSAGE_TYPE.SNAPSHOT_ACK, tick: int(0, 1e9) };
  assert.deepEqual(roundTrip(ack).message, ack);
  const ping = { type: MESSAGE_TYPE.PING, clientTimeMs: int(0, 0xffffffff), snapshotAckTick: int(0, 1e6) };
  assert.deepEqual(roundTrip(ping).message, ping);
  const chat = { type: MESSAGE_TYPE.CHAT, text: unicodeWord() };
  assert.deepEqual(roundTrip(chat).message, chat);
  const leave = { type: MESSAGE_TYPE.LEAVE, reason: pick(Object.values(CLOSE_REASON)) };
  assert.deepEqual(roundTrip(leave).message, leave);
  const roster = [];
  const usedIds = new Set();
  for (let n = int(0, 28); n > 0; n--) {
    let entityId = int(1, MAX_ENTITIES);
    while (usedIds.has(entityId)) entityId = int(1, MAX_ENTITIES);
    usedIds.add(entityId);
    const bot = rng() < 0.4;
    roster.push({
      entityId, seat: bot ? NO_SEAT : int(0, 63), team: int(0, 2), bot, connected: rng() < 0.5,
      playerId: word(16), name: unicodeWord(), specId: word(24),
    });
  }
  const welcome = {
    type: MESSAGE_TYPE.WELCOME, protocolVersion: 1, tickHz: 60, snapshotHz: pick([30, 20, 60]), seat: pick([NO_SEAT, int(0, 63)]),
    entityId: pick([NO_ENTITY, int(1, MAX_ENTITIES)]), team: int(0, 2), serverTick: int(0, 1e6), serverTimeMs: int(0, 1e8),
    seed: int(0, 0xffffffff), capabilities: int(0, 1), roomId: word(12), mapId: word(12), mode: pick(['standard', 'turbo_ball']),
    rulesetJson: JSON.stringify({ mode: 'standard', gravityScale: 1, hpScale: 1 }), roster,
  };
  assert.deepEqual(roundTrip(welcome).message, welcome);
  const events = {
    type: MESSAGE_TYPE.EVENT, tick: int(0, 1e6),
    events: Array.from({ length: int(0, 8) }, () => ({
      kind: rng() < 0.8 ? pick(EVENT_KIND_NAMES) : word(20),
      payload: { id: word(8), value: int(-1000, 1000), nested: { list: [1, 2, 3], text: unicodeWord() }, flag: rng() < 0.5 },
    })),
  };
  assert.deepEqual(roundTrip(events).message, events);
  const pong = { type: MESSAGE_TYPE.PONG, clientTimeMs: int(0, 0xffffffff), serverTimeMs: int(0, 0xffffffff), serverTick: int(0, 1e6) };
  assert.deepEqual(roundTrip(pong).message, pong);
  const close = { type: pick([MESSAGE_TYPE.CLOSE, MESSAGE_TYPE.ERROR]), reason: pick(Object.values(CLOSE_REASON)), detail: unicodeWord() };
  assert.deepEqual(roundTrip(close).message, close);

  // snapshots: keyframe then a chain of deltas, each resolved against the acked baseline
  let frame = randomFrame(int(1, 1000), int(0, 28));
  const keyPacket = buildSnapshotPacket(frame, null);
  const key = roundTrip(keyPacket);
  assert.equal(key.message.keyframe, true);
  assert.deepEqual(applySnapshotPacket(key.message, null), frame);
  let baseline = frame;
  for (let step = 0; step < 4; step++) {
    const next = evolveFrame(baseline, baseline.tick + int(1, 6));
    const packet = buildSnapshotPacket(next, baseline);
    const acked = baseline;
    const decoded = roundTrip(packet, baseline, (tick) => (tick === acked.tick ? acked : null));
    assert.equal(decoded.message.keyframe, false);
    assert.equal(decoded.message.baseTick, baseline.tick);
    const resolved = applySnapshotPacket(decoded.message, baseline);
    assert.deepEqual(resolved, next, 'delta snapshot resolves bit-exactly to the source frame');
    frames++;
    baseline = rng() < 0.5 ? next : baseline; // sometimes the viewer acks, sometimes it stays on an older baseline
  }
}
console.log(`wire.selftest: 600 rounds of every message type and ${frames} delta snapshots round-tripped bit-exactly`);

// ------------------------------------------------------------ 2. mirror-bit regressions
{
  const base = randomRow(5, { distinctGunChannel: true });
  base.reloadKind = 0; base.gunReloadKind = 0; base.reload = 100; base.gunReload = 900; base.reloadTotal = 1000; base.gunReloadTotal = 2000;
  const flagsOnly = { ...base, eraSpent: [], flags: base.flags ^ ENTITY_FLAGS.BURNING };
  base.eraSpent = [];
  const frameA = { ...randomFrame(10, 0), entities: [base], viewer: null, shells: [] };
  const frameB = { ...frameA, tick: 12, entities: [flagsOnly] };
  const packet = buildSnapshotPacket(frameB, frameA);
  assert.equal(packet.entities.length, 1);
  assert.ok(packet.entities[0].mask & ROW_GROUP.STATUS, 'a flag flip writes the status group');
  assert.ok(!(packet.entities[0].mask & ROW_GROUP.GUN_RELOAD), 'an unchanged distinct gun channel is not re-sent');
  const decoded = decodeMessage(encodeMessage(packet, frameA), { resolveBaseline: () => frameA });
  assert.ok(decoded.ok);
  const resolved = applySnapshotPacket(decoded.message, frameA);
  assert.equal(resolved.entities[0].gunReload, 900, 'a status-only delta keeps the distinct gun channel');
  // and the mirror transition: channels become equal -> status bit flips, channel copied
  const merged = { ...flagsOnly, gunReload: flagsOnly.reload, gunReloadTotal: flagsOnly.reloadTotal, gunReloadKind: flagsOnly.reloadKind };
  const frameC = { ...frameB, tick: 14, entities: [merged] };
  const packetC = buildSnapshotPacket(frameC, frameB);
  assert.ok(packetC.entities[0].mask & ROW_GROUP.STATUS);
  assert.ok(!(packetC.entities[0].mask & ROW_GROUP.GUN_RELOAD));
  const resolvedC = applySnapshotPacket(decodeMessage(encodeMessage(packetC, frameB), { resolveBaseline: () => frameB }).message, frameB);
  assert.deepEqual(resolvedC.entities[0], merged);
  // the reverse transition: equal channels diverge -> GUN_RELOAD group appears with the status bit cleared
  const diverged = { ...merged, gunReload: 50, gunReloadTotal: 60 };
  const frameD = { ...frameC, tick: 16, entities: [diverged] };
  const packetD = buildSnapshotPacket(frameD, frameC);
  assert.ok(packetD.entities[0].mask & ROW_GROUP.GUN_RELOAD);
  assert.ok(packetD.entities[0].mask & ROW_GROUP.STATUS);
  const resolvedD = applySnapshotPacket(decodeMessage(encodeMessage(packetD, frameC), { resolveBaseline: () => frameC }).message, frameC);
  assert.deepEqual(resolvedD.entities[0], diverged);
  console.log('wire.selftest: gun-reload mirror transitions decode exactly');
}

// ------------------------------------------------------------ 3. the section 4 size budget
{
  // A realistic 14v14 keyframe: tanks at 5..15 m/s, reloads in progress, ammo in the tens, no ERA yet.
  const battle = (tick) => {
    const entities = [];
    for (let id = 1; id <= 28; id++) {
      const speed = 500 + ((id * 37) % 1000);
      const reload = 300 + ((id * 131) % 2500), reloadTotal = 3000 + ((id * 17) % 2000);
      entities.push({
        entityId: id, x: (id - 14) * 30000 + tick * (speed / 60 * 10 | 0), y: 12000 + (id % 5) * 300, z: (id % 2 ? 1 : -1) * 150000 + tick * 100,
        speed, verticalSpeed: 0, yaw: (id * 2000 + tick * 20) & 0xffff, pitch: (65536 - 200 + (tick * 7 + id) % 400) & 0xffff,
        roll: (200 + (tick * 5 + id * 3) % 300) & 0xffff, turretYaw: (id * 3000 + tick * 60) & 0xffff, gunPitch: (400 + tick) & 0xffff,
        hp: 1800 - id * 20, maxHp: 2000, reload, reloadTotal, reloadKind: 1, gunReload: reload, gunReloadTotal: reloadTotal, gunReloadKind: 1,
        magazineRounds: 0, magazineCapacity: 0, shellSlot: id % 3, ammo0: 30 - (id % 7), ammo1: 12, ammo2: 8, flags: id % 4 === 0 ? ENTITY_FLAGS.FIRING : 0,
        eraSpent: [],
      });
    }
    return {
      tick, serverTimeMs: tick * 1000 / 60 | 0, ackedInputTick: tick - 3, ackedFireSeq: 4, ackedActionSeq: 2, inputMarginTicks: 2,
      meta: { phase: PHASE.PLAYING, countdownMs: 0, battleTimeMs: tick * 1000 / 60 | 0, verdict: VERDICT.NONE, verdictReason: '', destructibleRevision: 3 },
      destroyed: [12, 77, 401], entities,
      shells: [],
      viewer: {
        entityId: 7, modules: [0, 0, 0, 0, 0, 0, 0], crewBits: 3, equipment: [1000, 1000, 1000, 1000], modeSpeedMultiplier: 1000, modeGravityScale: 1000,
        movementVersion: 1, movementFlags: 3, movementValues: Array.from({ length: 44 }, (_, i) => Math.fround(i * 0.37)),
      },
      modeStateJson: null,
    };
  };
  const key = battle(600);
  const keyBytes = encodeMessage(buildSnapshotPacket(key, null));
  const rowsOnly = encodeMessage(buildSnapshotPacket({ ...key, viewer: null, destroyed: [], shells: [] }, null)).byteLength;
  const headerBytes = encodeMessage(buildSnapshotPacket({ ...key, viewer: null, destroyed: [], shells: [], entities: [] }, null)).byteLength;
  const fullRowMean = (rowsOnly - headerBytes) / 28;
  const delta = battle(606); // two intervals later: every tank moved, tilted and slewed its turret
  const deltaBytes = encodeMessage(buildSnapshotPacket({ ...delta, viewer: null }, key), key);
  const deltaHeader = encodeMessage(buildSnapshotPacket({ ...delta, viewer: null, entities: key.entities, destroyed: key.destroyed }, key), key).byteLength;
  const deltaRowMean = (deltaBytes.byteLength - deltaHeader) / 28;
  const worstRow = { ...key.entities[0], gunReload: 11, gunReloadTotal: 22, gunReloadKind: 2, eraSpent: [3, 9, 14] };
  const worstBytes = encodeMessage(buildSnapshotPacket({ ...key, viewer: null, destroyed: [], entities: [worstRow] }, null)).byteLength - headerBytes;
  console.log(`wire.selftest: keyframe 28 entities + viewer = ${keyBytes.byteLength} B; full row mean ${fullRowMean.toFixed(1)} B (worst distinct-channel + 3 ERA row ${worstBytes} B); typical moving delta row ${deltaRowMean.toFixed(1)} B; delta snapshot ${deltaBytes.byteLength} B; snapshot header ${headerBytes} B`);
  assert.ok(fullRowMean <= 48, `full row mean ${fullRowMean} exceeds 48 B`);
  assert.ok(worstBytes <= 56, `worst full row ${worstBytes} exceeds 56 B`);
  assert.ok(deltaRowMean <= 20, `typical delta row ${deltaRowMean} exceeds 20 B`);
  assert.ok(keyBytes.byteLength <= 1536, `28-entity keyframe ${keyBytes.byteLength} exceeds 1.5 KB`);
  const input = encodeMessage({
    type: MESSAGE_TYPE.INPUT, clientTick: 600, snapshotAckTick: 597, interpDelayMs: 100,
    controls: [randomControl(), randomControl(), randomControl()],
  });
  assert.equal(input.byteLength, 12 + 3 * 15, 'a full input frame is 57 bytes');
}

// ------------------------------------------------------------ 4. malformed, oversized, truncated
{
  const samples = [];
  samples.push(encodeMessage({ type: MESSAGE_TYPE.HELLO, protocolVersion: 1, capabilities: 1, token: word(40), clientBuild: 'x' }));
  samples.push(encodeMessage({ type: MESSAGE_TYPE.INPUT, clientTick: 9, snapshotAckTick: NO_TICK, interpDelayMs: 90, controls: [randomControl(), randomControl()] }));
  samples.push(encodeMessage({ type: MESSAGE_TYPE.WELCOME, protocolVersion: 1, tickHz: 60, snapshotHz: 30, seat: 3, entityId: 4, team: TEAM.BRAVO, serverTick: 1, serverTimeMs: 16, seed: 9, capabilities: 0, roomId: 'r', mapId: 'verdant', mode: 'standard', rulesetJson: '{}', roster: [{ entityId: 4, seat: 3, team: 1, bot: false, connected: true, playerId: 'p', name: 'n', specId: 's' }] }));
  const frame = randomFrame(50, 6);
  samples.push(encodeMessage(buildSnapshotPacket(frame, null)));
  samples.push(encodeMessage({ type: MESSAGE_TYPE.EVENT, tick: 3, events: [{ kind: 'shell_fired', payload: { a: 1 } }, { kind: 'custom_thing', payload: { b: [1] } }] }));
  samples.push(encodeMessage({ type: MESSAGE_TYPE.CLOSE, reason: CLOSE_REASON.SERVER_DRAIN, detail: 'bye' }));
  let rejected = 0;
  for (const sample of samples) {
    for (let length = 0; length < sample.byteLength; length++) {
      const result = decodeMessage(sample.subarray(0, length));
      assert.equal(result.ok, false, `prefix ${length} of a ${sample.byteLength}-byte frame must be rejected`);
      assert.ok(result.error instanceof WireError);
      rejected++;
    }
    const trailing = new Uint8Array(sample.byteLength + 1); trailing.set(sample);
    const extra = decodeMessage(trailing);
    assert.equal(extra.ok, false); assert.equal(extra.error.code, 'trailing_bytes');
    const wrongVersion = sample.slice(); wrongVersion[0] = WIRE_VERSION + 1;
    assert.equal(decodeMessage(wrongVersion).error.code, 'bad_version');
  }
  const unknown = new Uint8Array([WIRE_VERSION, 99, 0, 0]);
  assert.equal(decodeMessage(unknown).error.code, 'unknown_type');
  assert.equal(decodeMessage(new Uint8Array(0)).error.code, 'truncated');
  assert.equal(decodeMessage('not bytes').error.code, 'invalid_message');
  assert.equal(decodeMessage(null).error.code, 'invalid_message');
  assert.equal(decodeMessage(new Uint8Array(MAX_MESSAGE_BYTES + 1)).error.code, 'bad_length');
  assert.equal(decodeMessage(samples[1], { maxBytes: 8 }).error.code, 'bad_length');
  // out-of-range fields inside otherwise valid frames
  const badSlot = samples[1].slice(); badSlot[12 + 9] = 3; // first control's shellSlot (header 12 B, then i8 i8 u8 u16 i16 u16)
  assert.equal(decodeMessage(badSlot).error.code, 'range');
  const badFlags = samples[1].slice(); badFlags[12 + 2] = 8;
  assert.equal(decodeMessage(badFlags).error.code, 'range');
  const badTeam = samples[2].slice(); badTeam[8] = 5; // welcome team byte (version, type, u16 protocol, tickHz, snapshotHz, seat, entityId, team)
  assert.equal(decodeMessage(badTeam).error.code, 'range');
  const badUtf8 = encodeMessage({ type: MESSAGE_TYPE.CHAT, text: 'ab' }).slice(); badUtf8[badUtf8.length - 1] = 0xff;
  assert.equal(decodeMessage(badUtf8).error.code, 'bad_utf8');
  const badJson = encodeMessage({ type: MESSAGE_TYPE.EVENT, tick: 1, events: [{ kind: 'chat', payload: { x: 1 } }] }).slice();
  badJson[badJson.length - 1] = 0x5b; // '}' -> '['
  assert.equal(decodeMessage(badJson).error.code, 'bad_json');
  const arrayJson = new Uint8Array([...encodeMessage({ type: MESSAGE_TYPE.EVENT, tick: 1, events: [] })]);
  arrayJson[arrayJson.length - 1] = 1; // count 1 with no body -> truncated, never a throw
  assert.equal(decodeMessage(arrayJson).error.code, 'truncated');
  // a delta without its baseline: typed, never thrown
  const next = evolveFrame(frame, 53);
  const deltaBytes = encodeMessage(buildSnapshotPacket(next, frame), frame);
  const noBase = decodeMessage(deltaBytes);
  if (!noBase.ok) assert.equal(noBase.error.code, 'missing_baseline');
  else assert.throws(() => applySnapshotPacket(noBase.message, null), (error) => error instanceof WireError && error.code === 'missing_baseline');
  assert.throws(() => encodeMessage(buildSnapshotPacket(next, frame), null), (error) => error instanceof WireError && error.code === 'missing_baseline');
  // encoder input validation is typed too
  assert.throws(() => encodeMessage({ type: MESSAGE_TYPE.CHAT, text: 'x'.repeat(2000) }), (error) => error instanceof WireError && error.code === 'bad_length');
  assert.throws(() => encodeMessage({ type: MESSAGE_TYPE.INPUT, clientTick: 1, snapshotAckTick: 0, interpDelayMs: 0, controls: [] }), (error) => error.code === 'too_many');
  assert.throws(() => encodeMessage({ type: 200 }), (error) => error.code === 'unknown_type');
  assert.equal(peekMessageType(samples[0]), MESSAGE_TYPE.HELLO);
  assert.equal(peekMessageType(new Uint8Array([7, 1])), null);
  console.log(`wire.selftest: ${rejected} truncated prefixes and every malformed class rejected with typed WireError codes`);
}

// ------------------------------------------------------------ 5. quantization and helpers
{
  for (let n = 0; n < 2000; n++) {
    const meters = (rng() - 0.5) * 2000;
    assert.ok(Math.abs(dequantizePosition(quantizePosition(meters)) - meters) <= 0.0005 + 1e-9);
    const mps = (rng() - 0.5) * 60;
    assert.ok(Math.abs(dequantizeVelocity(quantizeVelocity(mps)) - mps) <= 0.005 + 1e-9);
    const angle = (rng() - 0.5) * 40;
    const back = dequantizeAngle(quantizeAngle(angle));
    assert.ok(Math.abs(wrapAngle(back - angle)) <= Math.PI / 65536 + 1e-9, `angle ${angle} -> ${back}`);
    assert.ok(back > -Math.PI && back <= Math.PI);
    const pitch = (rng() - 0.5) * Math.PI;
    assert.ok(Math.abs(dequantizeAimPitch(quantizeAimPitch(pitch)) - pitch) <= (Math.PI / 2) / 32767 + 1e-9);
    const distance = rng() * 2000;
    assert.ok(Math.abs(dequantizeAimDistance(quantizeAimDistance(distance)) - distance) <= 0.025 + 1e-9);
    const seconds = rng() * 60;
    const reload = dequantizeReloadS(quantizeReloadS(seconds));
    assert.ok(reload >= seconds - 1e-9 && reload - seconds <= 0.002 + 1e-9, 'reload rounds up within 2 ms');
  }
  assert.equal(quantizeReloadS(0), 0);
  assert.equal(quantizeReloadS(0.0001), 1, 'any positive reload remainder stays positive');
  assert.equal(angleUnitsDelta(65500, 30), 66);
  assert.equal(angleUnitsDelta(30, 65500), -66);
  assert.equal(quantizeAngle(Math.PI * 2), 0);
  assert.equal(quantizeAngle(-Math.PI / 2), 49152);
  assert.equal(shellTypeName(shellTypeIndex('HEAT')), 'HEAT');
  assert.equal(shellTypeName(shellTypeIndex('PLASMA')), 'OTHER');
  const armor = {
    hullPlates: [{ kind: 'main', name: 'glacis' }, { kind: 'era', name: 'k5_a' }, { kind: 'era', name: 'k5_b' }],
    turretPlates: [{ kind: 'era', name: 'k5_a' }, { kind: 'main', name: 'front' }, { kind: 'era', name: 'k5_c' }],
  };
  assert.deepEqual(eraPlateNames(armor), ['k5_a', 'k5_b', 'k5_a', 'k5_c']);
  assert.deepEqual([...eraPlateIndices(armor)], [['k5_a', 0], ['k5_b', 1], ['k5_c', 3]]);
  assert.equal(CLOSE_REASON_NAMES[CLOSE_REASON.BACKPRESSURE], 'backpressure');
  console.log('wire.selftest: quantization resolutions, wraps and ERA index helpers hold');
}
