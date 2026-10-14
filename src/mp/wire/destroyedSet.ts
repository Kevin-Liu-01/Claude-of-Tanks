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
