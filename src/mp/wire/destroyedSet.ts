/**
 * The destroyed-prop set on the wire (wire 6, 2026-10-13, the MP stream; MP-SINCE-0930 §5b D).
 *
 * A keyframe carries every obstacle the match has felled, a delta the ones its baseline lacked. Wire 5 wrote them as a
 * delta-coded index list capped at 4,096 entries, and the encoder threw past it — every later keyframe failed, so a late
 * joiner, a rejoin, a reconnect and a migration stalled, while Monsoon has 9,119 crushable props and Verdant 6,645. The
 * set now travels as whichever of two forms is smaller, decided per packet:
 *   0  list:   varint count, then each index as the gap after the previous one (varint) — a few scattered falls;
 *   1  bitset: varint byte length, then bit (i & 7) of byte (i >> 3) set for each index i — a dense set (one bit per
 *              obstacle up to the highest felled: Monsoon's whole field is 1,169 bytes).
 * Indices run 0..MAX_DESTROYED_INDEX (every committed collision manifest holds fewer than 10,000 obstacles); the
 * largest possible set is 8 KB as a bitset, so the encoder never throws on a legal set, however long the match.
 */
import { WireError, type ByteReader, type ByteWriter } from './bytes.ts';
import { isObstacleFallCode } from '../../sim/obstacleFall.ts';

/** The highest obstacle index a destroyed set may name. */
export const MAX_DESTROYED_INDEX = 0xffff;
const FORM_LIST = 0;
const FORM_BITS = 1;
const MAX_BITSET_BYTES = (MAX_DESTROYED_INDEX >> 3) + 1;

function varintBytes(value: number): number {
  let bytes = 1;
  while (value >= 0x80) { value = Math.floor(value / 128); bytes++; }
  return bytes;
}

/** Bytes each form would take (with its one form byte): the encoder writes the smaller, the list on a tie. */
export function destroyedSetBytes(indices: readonly number[]): { list: number; bits: number } {
  let list = 1 + varintBytes(indices.length);
  let previous = -1;
  for (const index of indices) { list += varintBytes(index - previous - 1); previous = index; }
  const byteLength = indices.length ? (indices[indices.length - 1] >> 3) + 1 : 0;
  return { list, bits: 1 + varintBytes(byteLength) + byteLength };
}

export function writeDestroyedSet(writer: ByteWriter, indices: readonly number[]): void {
  let previous = -1;
  for (const index of indices) {
    if (!Number.isInteger(index) || index <= previous) throw new WireError('range', 'destroyed set must be strictly increasing non-negative integers');
    if (index > MAX_DESTROYED_INDEX) throw new WireError('range', `destroyed index ${index} exceeds ${MAX_DESTROYED_INDEX}`);
    previous = index;
  }
  const cost = destroyedSetBytes(indices);
  if (cost.list <= cost.bits) {
    writer.u8(FORM_LIST);
    writer.varint(indices.length);
    previous = -1;
    for (const index of indices) { writer.varint(index - previous - 1); previous = index; }
    return;
  }
  const byteLength = (indices[indices.length - 1] >> 3) + 1;
  const bytes = new Uint8Array(byteLength);
  for (const index of indices) bytes[index >> 3] |= 1 << (index & 7);
  writer.u8(FORM_BITS);
  writer.varint(byteLength);
  writer.raw(bytes);
}

export function readDestroyedSet(reader: ByteReader): number[] {
  const form = reader.u8();
  if (form === FORM_LIST) {
    const count = reader.count(MAX_DESTROYED_INDEX + 1);
    const out: number[] = new Array(count);
    let previous = -1;
    for (let position = 0; position < count; position++) {
      const index = previous + 1 + reader.varint();
      if (index > MAX_DESTROYED_INDEX) throw new WireError('range', 'destroyed index out of range');
      out[position] = index;
      previous = index;
    }
    return out;
  }
  if (form === FORM_BITS) {
    const byteLength = reader.count(MAX_BITSET_BYTES);
    const out: number[] = [];
    for (let byte = 0; byte < byteLength; byte++) {
      const bits = reader.u8();
      if (!bits) continue;
      for (let bit = 0; bit < 8; bit++) if (bits & (1 << bit)) out.push(byte * 8 + bit);
    }
    // a canonical bitset ends on a set bit (the encoder trims): anything else is a malformed frame
    if (byteLength && (!out.length || out[out.length - 1] >> 3 !== byteLength - 1)) throw new WireError('range', 'destroyed bitset has a trailing empty byte');
    return out;
  }
  throw new WireError('range', `unknown destroyed set form ${form}`);
}

/**
 * Each listed index's fall (wire 11, 2026-11-05, round 2 of the 2026-11-02 audit, U27; src/sim/obstacleFall.ts), right
 * after a set that names at least one index: `u8 form`, then form 0 (every fall none: nothing follows) or form 1 (one fall
 * byte per index, in the set's ascending order). A set that names nothing carries no falls. A keyframe's whole field
 * felled costs a byte an obstacle more (Monsoon's 9,119 crushable props: 9 KB).
 */
const FALLS_NONE = 0;
const FALLS_BYTES = 1;

export function writeDestroyedFalls(writer: ByteWriter, falls: readonly number[] | null, count: number): void {
  if (count <= 0) return;
  let any = false;
  if (falls) {
    for (let position = 0; position < count; position++) {
      const code = falls[position] ?? 0;
      if (!isObstacleFallCode(code)) throw new WireError('range', `destroyed fall ${code} is no fall code`);
      if (code !== 0) any = true;
    }
  }
  if (!any) { writer.u8(FALLS_NONE); return; }
  writer.u8(FALLS_BYTES);
  for (let position = 0; position < count; position++) writer.u8(falls![position] ?? 0);
}

/** The falls after a set of `count` indices: null when they are all none (form 0, or an empty set). */
export function readDestroyedFalls(reader: ByteReader, count: number): number[] | null {
  if (count <= 0) return null;
  const form = reader.u8();
  if (form === FALLS_NONE) return null;
  if (form !== FALLS_BYTES) throw new WireError('range', `unknown destroyed falls form ${form}`);
  const out: number[] = new Array(count);
  for (let position = 0; position < count; position++) {
    const code = reader.u8();
    if (!isObstacleFallCode(code)) throw new WireError('range', 'destroyed fall out of range');
    out[position] = code;
  }
  return out;
}
