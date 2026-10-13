import assert from 'node:assert/strict';
import {
  ByteReader, ByteWriter, ROW_GROUP, ROW_GROUP_MASK_MAX, WIRE_VERSION, WireError, applyEntityRowPatch, diffEntityRow,
  quantizeUnitComponent, readEntityRowPatch, writeEntityRowPatch, zeroEntityRow,
} from './index.ts';

// Physics lane (2026-10-10): wire 5's WRECK_BODY row group — a wreck's turret body where the authority's physics put it,
// 21 bytes (and a mask byte) while it changes, nothing on a delta once it sleeps, one byte when it goes; malformed groups are refused.

assert.equal(WIRE_VERSION, 5, 'the turret body is a layout change');
assert.equal(ROW_GROUP.WRECK_BODY, 1 << 18);
assert.equal(ROW_GROUP_MASK_MAX, (1 << 19) - 1);

const TICK = 600;
function row(body) {
  const r = zeroEntityRow(3);
  Object.assign(r, { tick: TICK, x: 10_000, y: 2_000, z: -4_000, hp: 0, maxHp: 1200, flags: 1 });
  if (body !== undefined) r.wreckBody = body;
  return r;
}
const q = (x, y, z, w) => { const n = Math.hypot(x, y, z, w); return [x / n, y / n, z / n, w / n].map(quantizeUnitComponent); };
const [qx, qy, qz, qw] = q(0.1, 0.7, -0.2, 0.68);
const flying = { x: 11_234, y: 4_560, z: -3_987, qx, qy, qz, qw, asleep: false };

function roundTrip(next, base) {
  const patch = diffEntityRow(next, base, TICK);
  const writer = new ByteWriter();
  writeEntityRowPatch(writer, patch, base, TICK);
  const bytes = writer.toBytes();
  const decoded = readEntityRowPatch(new ByteReader(bytes), () => base, TICK);
  return { patch, bytes, decoded, row: applyEntityRowPatch(decoded, base) };
}

// a keyframe carries the body
{
  const { patch, row: out } = roundTrip(row(flying), null);
  assert.ok(patch.mask & ROW_GROUP.WRECK_BODY);
  assert.deepEqual(out.wreckBody, flying, 'the body round-trips bit for bit');
  const bare = roundTrip(row(), null);
  assert.equal(bare.patch.mask & ROW_GROUP.WRECK_BODY, 0, 'a hull without a body sends nothing');
  // 21 bytes of group, and the mask's varint grows by a byte (bit 18)
  assert.equal(roundTrip(row(flying), null).bytes.length - bare.bytes.length, 22, 'the group costs 21 bytes and a mask byte');
}

// deltas: a moving body re-sends, a sleeping one costs nothing, a body that goes costs one byte
{
  const base = row(flying);
  const moved = { ...flying, y: flying.y - 160, qw: flying.qw - 7 };
  const delta = roundTrip(row(moved), base);
  assert.ok(delta.patch.mask & ROW_GROUP.WRECK_BODY);
  assert.deepEqual(delta.row.wreckBody, moved);
  const asleep = { ...moved, asleep: true };
  const slept = roundTrip(row(asleep), row(moved));
  assert.deepEqual(slept.row.wreckBody, asleep, 'it went to sleep');
  const still = roundTrip(row({ ...asleep }), row(asleep));
  assert.equal(still.patch.mask, 0, 'asleep and unchanged: the row is untouched');
  const gone = roundTrip(row(null), row(asleep));
  assert.ok(gone.patch.mask & ROW_GROUP.WRECK_BODY);
  assert.equal(gone.row.wreckBody, null, 'a respawned hull drops its body');
  const goneBare = roundTrip(row(undefined), row(asleep));
  assert.equal(goneBare.row.wreckBody, null, 'an absent body reads as none');
}

// malformed: flags out of range, a quaternion component past the scale
{
  const writer = new ByteWriter();
  writer.u8(3); writer.varint(ROW_GROUP.WRECK_BODY); writer.u8(4);
  assert.throws(() => readEntityRowPatch(new ByteReader(writer.toBytes()), () => null, TICK), (e) => e instanceof WireError && e.code === 'range');
  const bad = new ByteWriter();
  bad.u8(3); bad.varint(ROW_GROUP.WRECK_BODY); bad.u8(1);
  bad.i32(0); bad.i32(0); bad.i32(0); bad.i16(-32768); bad.i16(0); bad.i16(0); bad.i16(0);
  assert.throws(() => readEntityRowPatch(new ByteReader(bad.toBytes()), () => null, TICK), (e) => e instanceof WireError && e.code === 'range');
  const wide = new ByteWriter();
  wide.u8(3); wide.varint(ROW_GROUP_MASK_MAX + 1);
  assert.throws(() => readEntityRowPatch(new ByteReader(wide.toBytes()), () => null, TICK), (e) => e instanceof WireError && e.code === 'range');
}

console.log('wreckBody.selftest: wire 5 WRECK_BODY keyframe, moving, sleeping, removal and malformed groups');
