// The destroyed-prop set on the wire (wire 6, 2026-10-13, the MP stream; MP-SINCE-0930 §5b D). Wire 5's index list was
// capped at 4,096 and the encoder threw past it, so every later keyframe failed (late joiners, rejoins, reconnects,
// migrations stalled) — below Monsoon's 9,119 crushable props. The set now travels as the smaller of a gap list and a
// bitset; the encoder never throws on a legal set and the worst case — every crushable prop of the densest battlefield
// down — fits a keyframe with the full roster many times over.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ByteReader, ByteWriter, WireError } from './bytes.ts';
import { MAX_DESTROYED_INDEX, destroyedSetBytes, readDestroyedSet, writeDestroyedSet } from './destroyedSet.ts';
import { MAX_MESSAGE_BYTES, PHASE, VERDICT, WIRE_VERSION } from './constants.ts';
import { applySnapshotPacket, buildSnapshotPacket, decodeMessage, encodeMessage } from './codec.ts';
import { decodeCollisionManifest } from '../../../server/collisionManifestCodec.ts';
import { chunkMigrationBlob, decodeMigrationKeyframe, encodeMigrationKeyframe } from '../host/migrationState.ts';

const roundTrip = (indices) => {
  const writer = new ByteWriter();
  writeDestroyedSet(writer, indices);
  const bytes = writer.toBytes();
  const reader = new ByteReader(bytes);
  const out = readDestroyedSet(reader);
  reader.finish();
  return { out, bytes };
};

assert.equal(WIRE_VERSION, 6, 'a layout change: the wire version moved with it');

// ---- round trips and the form each set takes
{
  for (const indices of [[], [0], [5], [3, 9, 4000, 65535], Array.from({ length: 300 }, (_, i) => i * 7), Array.from({ length: 5000 }, (_, i) => i)]) {
    const { out, bytes } = roundTrip(indices);
    assert.deepEqual(out, indices, `${indices.length} indices round-trip`);
    const cost = destroyedSetBytes(indices);
    assert.equal(bytes.byteLength, Math.min(cost.list, cost.bits), 'the encoder writes the smaller form');
  }
  assert.equal(roundTrip([3, 9, 4000]).bytes[0], 0, 'a few scattered falls travel as a list');
  assert.equal(roundTrip(Array.from({ length: 5000 }, (_, i) => i)).bytes[0], 1, 'a dense field travels as a bitset');
  assert.equal(roundTrip([]).bytes.byteLength, 2, 'an empty set is two bytes (form, count)');
  // every index the wire allows, at once: 8 KB
  const all = Array.from({ length: MAX_DESTROYED_INDEX + 1 }, (_, i) => i);
  const full = roundTrip(all);
  assert.deepEqual(full.out.length, all.length);
  assert.ok(full.bytes.byteLength <= 8192 + 4, `the largest legal set is ${full.bytes.byteLength} B`);
}

// ---- the encoder refuses only an illegal set; the decoder refuses malformed frames with typed errors
{
  const encodeThrows = (indices) => assert.throws(() => writeDestroyedSet(new ByteWriter(), indices), (error) => error instanceof WireError && error.code === 'range');
  encodeThrows([2, 1]);
  encodeThrows([1, 1]);
  encodeThrows([-1]);
  encodeThrows([MAX_DESTROYED_INDEX + 1]);
  encodeThrows([1.5]);
  const decode = (bytes) => { const reader = new ByteReader(new Uint8Array(bytes)); return readDestroyedSet(reader); };
  const codeOf = (bytes) => { try { decode(bytes); return 'ok'; } catch (error) { return error instanceof WireError ? error.code : 'untyped'; } };
  assert.equal(codeOf([7, 0]), 'range', 'an unknown form');
  assert.equal(codeOf([0, 0x80, 0x80, 0x08]), 'too_many', 'a list count past the index space');
  assert.equal(codeOf([1, 0x81, 0x40]), 'too_many', 'a bitset past 8 KB');
  assert.equal(codeOf([1, 2, 1, 0]), 'range', 'a bitset with a trailing empty byte is not canonical');
  assert.equal(codeOf([0, 1, 0xff, 0xff, 0x04]), 'range', 'a list index past the index space');
  assert.equal(codeOf([1, 3, 1]), 'truncated', 'a truncated bitset');
  assert.equal(codeOf([0, 2, 1]), 'truncated', 'a truncated list');
}

// ---- the worst case through a real keyframe: Monsoon's every crushable prop down, the full 28-hull roster
{
  const index = JSON.parse(readFileSync(new URL('../../../server/world-collision-manifests/index.json', import.meta.url), 'utf8'));
  let worst = { id: null, crushable: [] };
  for (const id of Object.keys(index.maps)) {
    if (index.maps[id].obstacles <= worst.crushable.length) continue;
    const manifest = decodeCollisionManifest(JSON.parse(readFileSync(new URL(`../../../server/world-collision-manifests/${id}.json`, import.meta.url), 'utf8')));
    // (the packed records: `q` is crushable, headlessCollisionWorld.ts)
    const crushable = manifest.obstacles.map((record, i) => (record.q ? i : -1)).filter((i) => i >= 0);
    if (crushable.length > worst.crushable.length) worst = { id, crushable };
    assert.ok(manifest.obstacles.length - 1 <= MAX_DESTROYED_INDEX, `${id}: every obstacle index fits the wire's index space`);
  }
  assert.ok(worst.crushable.length > 4096, `the densest battlefield (${worst.id}, ${worst.crushable.length} crushable) is past wire 5's cap`);
  // a realistic 14v14 keyframe (wire.selftest's section 4 battle): 28 hulls mid-fight, the viewer section, no ERA
  const tick = 600;
  const entities = [];
  for (let id = 1; id <= 28; id++) {
    const speed = 500 + ((id * 37) % 1000);
    const reload = 300 + ((id * 131) % 2500), reloadTotal = 3000 + ((id * 17) % 2000);
    entities.push({
      entityId: id, tick, x: (id - 14) * 30000 + tick * (speed / 60 * 10 | 0), y: 12000 + (id % 5) * 300, z: (id % 2 ? 1 : -1) * 150000 + tick * 100,
      speed, verticalSpeed: 0, yaw: (id * 2000 + tick * 20) & 0xffff, pitch: (65536 - 200 + (tick * 7 + id) % 400) & 0xffff,
      roll: (200 + (tick * 5 + id * 3) % 300) & 0xffff, turretYaw: (id * 3000 + tick * 60) & 0xffff, gunPitch: (400 + tick) & 0xffff,
      hp: 1800 - id * 20, maxHp: 2000, reload, reloadTotal, reloadKind: 1, gunReload: reload, gunReloadTotal: reloadTotal, gunReloadKind: 1,
      magazineRounds: 0, magazineCapacity: 0, shellSlot: id % 3, ammo0: 30 - (id % 7), ammo1: 12, ammo2: 8, flags: 0, eraSpent: [],
    });
  }
  const key = {
    tick, serverTimeMs: tick * 1000 / 60 | 0, ackedInputTick: tick - 3, ackedFireSeq: 4, ackedActionSeq: 2, inputMarginTicks: 2,
    meta: { phase: PHASE.PLAYING, countdownMs: 0, battleTimeMs: tick * 1000 / 60 | 0, verdict: VERDICT.NONE, verdictReason: '', destructibleRevision: worst.crushable.length },
    destroyed: worst.crushable, entities, shells: [],
    viewer: {
      entityId: 7, modules: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], crewBits: 3, equipment: [1000, 1000, 1000, 1000], modeSpeedMultiplier: 1000, modeGravityScale: 1000,
      movementVersion: 1, movementFlags: 3, movementValues: Array.from({ length: 44 }, (_, i) => Math.fround(i * 0.37)),
    },
    modeStateJson: null,
  };
  let bytes;
  try {
    bytes = encodeMessage(buildSnapshotPacket(key, null));
  } catch (error) {
    // the receipt's own keyframe shape differs from the codec's: report it precisely rather than hiding the case
    throw new Error(`the worst-case keyframe could not be built: ${error?.message ?? error}`);
  }
  assert.ok(bytes.byteLength < MAX_MESSAGE_BYTES, `${worst.id} with all ${worst.crushable.length} crushable props down: a ${bytes.byteLength} B keyframe`);
  const decoded = decodeMessage(bytes);
  assert.ok(decoded.ok, decoded.ok ? '' : decoded.error.message);
  assert.deepEqual(applySnapshotPacket(decoded.message, null).destroyed, worst.crushable, 'every index comes back');
  // the sealed migration keyframe rides the same encoding: a migration on that field restores every fall
  const blob = encodeMigrationKeyframe({ tick, battleTimeMs: 10_000, phase: 'playing', frame: key, entities: [] });
  assert.deepEqual(decodeMigrationKeyframe(blob).frame.destroyed, worst.crushable, 'the migration keyframe carries the whole set');
  assert.ok(chunkMigrationBlob('mp:keyframe', 1, tick, blob).length <= 64, 'within the migration chunk budget');
  console.log(`destroyedSet.selftest: list or bitset, the smaller; every legal set encodes (65,536 indices in ${roundTripBytes()} B); malformed frames typed; ${worst.id}'s ${worst.crushable.length} crushable props down in a ${bytes.byteLength} B keyframe (wire 5 threw past 4,096)`);
}

function roundTripBytes() { return roundTrip(Array.from({ length: MAX_DESTROYED_INDEX + 1 }, (_, i) => i)).bytes.byteLength; }
