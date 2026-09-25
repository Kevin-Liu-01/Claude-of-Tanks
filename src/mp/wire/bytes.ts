/**
 * Byte-level primitives for the Multiplayer v2 wire.
 *
 * Pure TypeScript: no DOM, no three, no Node built-ins. Every integer is
 * little-endian. Readers are bounds-checked and raise WireError only; the
 * message decoder converts any other failure into a typed rejection so a
 * malformed frame can never surface a raw TypeError to a caller.
 */

export type WireErrorCode =
  | 'truncated'
  | 'trailing_bytes'
  | 'bad_version'
  | 'unknown_type'
  | 'bad_length'
  | 'range'
  | 'bad_utf8'
  | 'bad_json'
  | 'too_many'
  | 'missing_baseline'
  | 'invalid_message'
  | 'internal';

export class WireError extends Error {
  readonly code: WireErrorCode;

  constructor(code: WireErrorCode, message: string) {
    super(message);
    this.name = 'WireError';
    this.code = code;
  }
}

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

export function utf8ByteLength(text: string): number {
  return utf8Encoder.encode(text).byteLength;
}

/** Growable little-endian writer. Reuse one instance per producer to avoid churn. */
export class ByteWriter {
  private bytes: Uint8Array;
  private view: DataView;
  private cursor = 0;

  constructor(initialCapacity = 256) {
    this.bytes = new Uint8Array(Math.max(16, initialCapacity | 0));
    this.view = new DataView(this.bytes.buffer);
  }

  get length(): number { return this.cursor; }

  reset(): void { this.cursor = 0; }

  private ensure(extra: number): void {
    const needed = this.cursor + extra;
    if (needed <= this.bytes.length) return;
    let capacity = this.bytes.length * 2;
    while (capacity < needed) capacity *= 2;
    const grown = new Uint8Array(capacity);
    grown.set(this.bytes.subarray(0, this.cursor));
    this.bytes = grown;
    this.view = new DataView(grown.buffer);
  }

  u8(value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 0xff) throw new WireError('range', `u8 out of range: ${value}`);
    this.ensure(1);
    this.bytes[this.cursor++] = value;
  }

  i8(value: number): void {
    if (!Number.isInteger(value) || value < -128 || value > 127) throw new WireError('range', `i8 out of range: ${value}`);
    this.ensure(1);
    this.view.setInt8(this.cursor, value);
    this.cursor += 1;
  }

  u16(value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new WireError('range', `u16 out of range: ${value}`);
    this.ensure(2);
    this.view.setUint16(this.cursor, value, true);
    this.cursor += 2;
  }

  i16(value: number): void {
    if (!Number.isInteger(value) || value < -32768 || value > 32767) throw new WireError('range', `i16 out of range: ${value}`);
    this.ensure(2);
    this.view.setInt16(this.cursor, value, true);
    this.cursor += 2;
  }

  u32(value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new WireError('range', `u32 out of range: ${value}`);
    this.ensure(4);
    this.view.setUint32(this.cursor, value, true);
    this.cursor += 4;
  }

  i32(value: number): void {
    if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647) {
      throw new WireError('range', `i32 out of range: ${value}`);
    }
    this.ensure(4);
    this.view.setInt32(this.cursor, value, true);
    this.cursor += 4;
  }

  f32(value: number): void {
    if (!Number.isFinite(value)) throw new WireError('range', 'f32 must be finite');
    this.ensure(4);
    this.view.setFloat32(this.cursor, value, true);
    this.cursor += 4;
  }

  /** Unsigned LEB128, at most five bytes (u32). */
  varint(value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new WireError('range', `varint out of range: ${value}`);
    this.ensure(5);
    let remaining = value >>> 0;
    while (remaining >= 0x80) {
      this.bytes[this.cursor++] = (remaining & 0x7f) | 0x80;
      remaining >>>= 7;
    }
    this.bytes[this.cursor++] = remaining;
  }

  /** varint byte length + UTF-8 bytes, bounded by maxBytes. */
  string(value: string, maxBytes: number): void {
    if (typeof value !== 'string') throw new WireError('range', 'string field must be a string');
    const encoded = utf8Encoder.encode(value);
    if (encoded.byteLength > maxBytes) {
      throw new WireError('bad_length', `string exceeds ${maxBytes} bytes (${encoded.byteLength})`);
    }
    this.varint(encoded.byteLength);
    this.raw(encoded);
  }

  raw(bytes: Uint8Array): void {
    this.ensure(bytes.byteLength);
    this.bytes.set(bytes, this.cursor);
    this.cursor += bytes.byteLength;
  }

  /** Copy of the written bytes (the writer stays reusable). */
  toBytes(): Uint8Array {
    return this.bytes.slice(0, this.cursor);
  }
}

/** Bounds-checked little-endian reader over one frame. */
export class ByteReader {
  private readonly bytes: Uint8Array;
  private readonly view: DataView;
  private cursor = 0;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get offset(): number { return this.cursor; }
  get remaining(): number { return this.bytes.byteLength - this.cursor; }

  private need(count: number): void {
    if (this.cursor + count > this.bytes.byteLength) {
      throw new WireError('truncated', `frame truncated at byte ${this.cursor} (need ${count})`);
    }
  }

  u8(): number { this.need(1); return this.bytes[this.cursor++]!; }
  i8(): number { this.need(1); const value = this.view.getInt8(this.cursor); this.cursor += 1; return value; }
  u16(): number { this.need(2); const value = this.view.getUint16(this.cursor, true); this.cursor += 2; return value; }
  i16(): number { this.need(2); const value = this.view.getInt16(this.cursor, true); this.cursor += 2; return value; }
  u32(): number { this.need(4); const value = this.view.getUint32(this.cursor, true); this.cursor += 4; return value; }
  i32(): number { this.need(4); const value = this.view.getInt32(this.cursor, true); this.cursor += 4; return value; }
  f32(): number {
    this.need(4);
    const value = this.view.getFloat32(this.cursor, true);
    this.cursor += 4;
    if (!Number.isFinite(value)) throw new WireError('range', 'f32 field is not finite');
    return value;
  }

  varint(): number {
    let value = 0;
    let shift = 0;
    for (let index = 0; index < 5; index++) {
      const byte = this.u8();
      value += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) {
        if (value > 0xffffffff) throw new WireError('range', 'varint exceeds u32');
        return value;
      }
      shift += 7;
    }
    throw new WireError('range', 'varint longer than five bytes');
  }

  /** Bounded varint: rejects values above `max` before any allocation happens. */
  count(max: number): number {
    const value = this.varint();
    if (value > max) throw new WireError('too_many', `count ${value} exceeds ${max}`);
    return value;
  }

  string(maxBytes: number): string {
    const length = this.varint();
    if (length > maxBytes) throw new WireError('bad_length', `string length ${length} exceeds ${maxBytes}`);
    this.need(length);
    const slice = this.bytes.subarray(this.cursor, this.cursor + length);
    this.cursor += length;
    try {
      return utf8Decoder.decode(slice);
    } catch {
      throw new WireError('bad_utf8', 'string field is not valid UTF-8');
    }
  }

  /** Fails when a decoder finishes with bytes still unread. */
  finish(): void {
    if (this.cursor !== this.bytes.byteLength) {
      throw new WireError('trailing_bytes', `${this.bytes.byteLength - this.cursor} unread bytes`);
    }
  }
}

/** Normalize any binary frame shape a transport may hand over. */
export function toUint8Array(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return null;
}
