/**
 * Event payloads in binary (wire 8, mp-scale-251; docs/MULTIPLAYER-V2.md §13.30).
 *
 * An event's payload travelled as JSON, its keys spelled out on every event to every viewer that may observe it: at
 * 14v14 the events were a quarter of a viewer's downlink, half of them crushed props ({"obstacleIndex":…,"treeIdx":…,
 * "directionX":…} with the authority's doubles). The payload is now a tagged binary value: an object's keys are one
 * byte from EVENT_PAYLOAD_KEYS (any other key inline), integers and decimals zigzag varints (decimals at
 * EVENT_DECIMAL_SCALE: 0.1 mm, 10^-4 rad, 0.1 ms, 10^-4 m/s, below anything the presentation resolves; a fallen prop is
 * found by its centre within 1 cm), strings, arrays and objects as JSON has them. Decoding gives exactly the object
 * JSON.parse gives for the payload serialized with its numbers at that scale (eventPayloadJson): undefined members
 * dropped, non-finite numbers null, a value that is neither plain data nor a plain object carried as its JSON. The
 * encoded payload is length-prefixed and bounded by MAX_EVENT_JSON_BYTES as the JSON was.
 *
 * Pure TypeScript, Node-runnable. The key table is part of the wire layout: changing it changes WIRE_VERSION.
 */
import { ByteReader, ByteWriter, WireError } from './bytes.ts';
import { MAX_EVENT_JSON_BYTES } from './constants.ts';

/** Decimals keep this many parts of a unit (4 decimals). */
export const EVENT_DECIMAL_SCALE = 1e4;

/**
 * Payload keys by their one-byte code, most frequent first (a 14v14 battle's events, 2026-10-24). 255 is an inline key.
 * Part of the layout: append only, with a WIRE_VERSION change.
 */
export const EVENT_PAYLOAD_KEYS = Object.freeze([
  'type', 'timeS', 'x', 'y', 'z', 'kind', 'obstacleIndex', 'treeIdx', 'cause', 'directionX', 'directionZ', 'speedMps',
  'shellId', 'shooterId', 'shellType', 'caliberMm', 'munition', 'module', 'nx', 'ny', 'nz', 'id', 'shellName', 'chargeKg',
  'structureId', 'fireIntentSeq', 'shellSlot', 'muzzleIndex', 'weaponSound', 'velocityMps', 'dx', 'dy', 'dz', 'propIdx',
  'massClass', 'cx', 'cz', 'hw', 'hd', 'yaw', 'baseY', 'topY', 'newState', 'dmg', 'state', 'source', 'surfaceKind',
  'section', 'sectionKind', 'y0', 'y1', 'hole', 'radiusM', 'sectionDown', 'damage', 'destroyed', 'modulesHit', 'crewHit',
  'closingMps', 'guided', 'attackerId', 'targetId', 'pos', 'normal', 'impactAngleDeg', 'effectiveMm', 'penRollMm',
  'targetHpAfter', 'fireStarted', 'ammoRacked', 'eraPlate', 'eraActivations', 'penRollFreshMm', 'dmgRoll', 'zone',
  'plateKind', 'physicalMm', 'nominalMm', 'localPos', 'localDir', 'impactFrame', 'impactLocalPos', 'impactLocalNormal',
  'targetName', 'targetSpecId', 'targetMaxHp', 'targetHp', 'stage', 'previous', 'points', 'integrity', 'sections', 'dirX',
  'dirZ', 'blast', 'team', 'spotterId', 'flightDistM', 'impactLocalDir', 'storeyDown', 'burning', 'killerId', 'aId', 'bId',
  'playerId', 'name', 'text', 'seat', 'countdownMs', 'result', 'reason', 'slot', 'count', 'ammo', 'action', 'specId',
] as const);
const KEY_INLINE = 255;
const KEY_CODE = new Map<string, number>(EVENT_PAYLOAD_KEYS.map((key, index) => [key, index]));

const TAG = Object.freeze({ NULL: 0, FALSE: 1, TRUE: 2, INT: 3, DECIMAL: 4, NUMBER: 5, STRING: 6, ARRAY: 7, OBJECT: 8, JSON: 9 });
const MAX_DEPTH = 16;
const MAX_MEMBERS = 1024;
const MAX_KEY_BYTES = 64;
const I32_MAX = 0x7fffffff;

/** A number as the payload's JSON has it: at EVENT_DECIMAL_SCALE when it is not an integer, null when not finite. */
function roundedNumber(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  return Number.isInteger(value) ? value : Math.round(value * EVENT_DECIMAL_SCALE) / EVENT_DECIMAL_SCALE;
}

function roundNumbers(_key: string, value: unknown): unknown {
  return typeof value === 'number' ? roundedNumber(value) : value;
}

/** The payload's JSON with its numbers at EVENT_DECIMAL_SCALE: what a decoded payload equals once parsed. */
export function eventPayloadJson(payload: object): string {
  return JSON.stringify(payload, roundNumbers);
}

function zigzag(value: number): number {
  return value >= 0 ? value * 2 : -value * 2 - 1;
}

function unzigzag(value: number): number {
  return value % 2 === 0 ? value / 2 : -(value + 1) / 2;
}

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function writeNumber(writer: ByteWriter, value: number): void {
  if (!Number.isFinite(value)) { writer.u8(TAG.NULL); return; }
  if (Number.isInteger(value)) {
    if (value >= -I32_MAX - 1 && value <= I32_MAX) { writer.u8(TAG.INT); writer.varint(zigzag(value === 0 ? 0 : value)); return; }
    writer.u8(TAG.NUMBER); writer.f64(value); return;
  }
  const scaled = Math.round(value * EVENT_DECIMAL_SCALE);
  if (!Number.isFinite(scaled)) { writer.u8(TAG.NULL); return; } // (JSON's null for a scale that overflows)
  if (scaled >= -I32_MAX - 1 && scaled <= I32_MAX) {
    writer.u8(TAG.DECIMAL); writer.varint(zigzag(scaled === 0 ? 0 : scaled));
    return;
  }
  writer.u8(TAG.NUMBER); writer.f64(scaled / EVENT_DECIMAL_SCALE);
}

function writeValue(writer: ByteWriter, value: unknown, depth: number): void {
  if (value === null) { writer.u8(TAG.NULL); return; }
  switch (typeof value) {
    case 'boolean': writer.u8(value ? TAG.TRUE : TAG.FALSE); return;
    case 'number': writeNumber(writer, value); return;
    case 'string': writer.u8(TAG.STRING); writer.string(value, MAX_EVENT_JSON_BYTES); return;
    case 'object': break;
    // a bigint has no JSON; undefined, a function or a symbol as an array item is null in JSON (members drop them)
    case 'bigint': throw new WireError('bad_json', 'event payload holds a bigint');
    default: writer.u8(TAG.NULL); return;
  }
  if (depth >= MAX_DEPTH) throw new WireError('bad_json', 'event payload nests too deep');
  if (Array.isArray(value)) {
    if (value.length > MAX_MEMBERS) throw new WireError('too_many', 'event payload array too long');
    writer.u8(TAG.ARRAY);
    writer.varint(value.length);
    for (const item of value) writeValue(writer, item, depth + 1);
    return;
  }
  if (!isPlainObject(value as object) || typeof (value as { toJSON?: unknown }).toJSON === 'function') {
    // anything else (a typed array, a Date, a class instance) as its JSON
    const json = JSON.stringify(value, roundNumbers);
    if (json === undefined) { writer.u8(TAG.NULL); return; }
    writer.u8(TAG.JSON); writer.string(json, MAX_EVENT_JSON_BYTES);
    return;
  }
  writeObject(writer, value as Record<string, unknown>, depth);
}

function writeObject(writer: ByteWriter, object: Record<string, unknown>, depth: number): void {
  let members = 0;
  for (const key in object) {
    if (!Object.prototype.hasOwnProperty.call(object, key)) continue;
    const item = object[key];
    if (item === undefined || typeof item === 'function' || typeof item === 'symbol') continue;
    members++;
  }
  if (members > MAX_MEMBERS) throw new WireError('too_many', 'event payload object too large');
  writer.u8(TAG.OBJECT);
  writer.varint(members);
  for (const key in object) {
    if (!Object.prototype.hasOwnProperty.call(object, key)) continue;
    const item = object[key];
    if (item === undefined || typeof item === 'function' || typeof item === 'symbol') continue;
    const code = KEY_CODE.get(key);
    if (code === undefined) { writer.u8(KEY_INLINE); writer.string(key, MAX_KEY_BYTES); } else writer.u8(code);
    writeValue(writer, item, depth + 1);
  }
}

const payloadWriter = new ByteWriter(512);

/** The payload's bytes (a fresh copy): a plain object, encoded once however many viewers receive it. */
export function encodeEventPayload(payload: Record<string, unknown>): Uint8Array {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new WireError('bad_json', 'event payload must be an object');
  payloadWriter.reset();
  writeObject(payloadWriter, payload, 0);
  if (payloadWriter.length > MAX_EVENT_JSON_BYTES) throw new WireError('bad_length', `event payload exceeds ${MAX_EVENT_JSON_BYTES} bytes`);
  return payloadWriter.toBytes();
}

function readValue(reader: ByteReader, depth: number): unknown {
  const tag = reader.u8();
  switch (tag) {
    case TAG.NULL: return null;
    case TAG.FALSE: return false;
    case TAG.TRUE: return true;
    case TAG.INT: return unzigzag(reader.varint());
    case TAG.DECIMAL: return unzigzag(reader.varint()) / EVENT_DECIMAL_SCALE;
    case TAG.NUMBER: return reader.f64();
    case TAG.STRING: return reader.string(MAX_EVENT_JSON_BYTES);
    case TAG.JSON: {
      const json = reader.string(MAX_EVENT_JSON_BYTES);
      try { return JSON.parse(json); } catch { throw new WireError('bad_json', 'event payload member is not JSON'); }
    }
    case TAG.ARRAY: {
      if (depth >= MAX_DEPTH) throw new WireError('bad_json', 'event payload nests too deep');
      const count = reader.count(MAX_MEMBERS);
      const out: unknown[] = new Array(count);
      for (let index = 0; index < count; index++) out[index] = readValue(reader, depth + 1);
      return out;
    }
    case TAG.OBJECT: {
      if (depth >= MAX_DEPTH) throw new WireError('bad_json', 'event payload nests too deep');
      return readObjectBody(reader, depth);
    }
    default: throw new WireError('range', `event payload tag out of range: ${tag}`);
  }
}

function readObjectBody(reader: ByteReader, depth: number): Record<string, unknown> {
  const count = reader.count(MAX_MEMBERS);
  const out: Record<string, unknown> = {};
  for (let index = 0; index < count; index++) {
    const code = reader.u8();
    let key: string;
    if (code === KEY_INLINE) key = reader.string(MAX_KEY_BYTES);
    else if (code < EVENT_PAYLOAD_KEYS.length) key = EVENT_PAYLOAD_KEYS[code]!;
    else throw new WireError('range', `event payload key out of range: ${code}`);
    // a key JSON.parse would make an own property of (never the prototype)
    if (key === '__proto__') Object.defineProperty(out, key, { value: readValue(reader, depth + 1), enumerable: true, writable: true, configurable: true });
    else out[key] = readValue(reader, depth + 1);
  }
  return out;
}

/** Read one encoded payload (exactly the reader's bytes): the object JSON.parse(eventPayloadJson(payload)) gives. */
export function readEventPayload(reader: ByteReader): Record<string, unknown> {
  if (reader.u8() !== TAG.OBJECT) throw new WireError('bad_json', 'event payload must be an object');
  const payload = readObjectBody(reader, 0);
  reader.finish();
  return payload;
}

/** A cache of encodeEventPayload by payload object (a host encodes each authority event once for all its viewers). */
export function createEventPayloadCache(): (payload: Record<string, unknown>) => Uint8Array {
  const cache = new WeakMap<object, Uint8Array>();
  return (payload) => {
    let encoded = cache.get(payload);
    if (encoded === undefined) { encoded = encodeEventPayload(payload); cache.set(payload, encoded); }
    return encoded;
  };
}
