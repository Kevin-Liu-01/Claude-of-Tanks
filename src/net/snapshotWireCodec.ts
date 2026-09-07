import type { RuntimeValue } from '../runtimeTypes.ts';
import {
  MESSAGE_TYPES,
  normalizePlayerInput,
  validateEnvelope,
  type NormalizedPlayerInput,
  type ProtocolEnvelope,
} from './protocol.ts';
import type { WireCodec } from './channelTransport.ts';

type WireRow = Record<string, RuntimeValue>;

export interface SnapshotWirePayload {
  tick: number;
  serverTimeMs: number;
  ackInputSeq: number | null;
  baseTick: number;
  entities: WireRow[];
  removedEntityIds: RuntimeValue[];
  shells: WireRow[];
  events: RuntimeValue[];
  meta: Record<string, RuntimeValue> | null;
}

export type ReplaceableWireEnvelope =
  | ProtocolEnvelope<NormalizedPlayerInput>
  | ProtocolEnvelope<SnapshotWirePayload>;

const SNAPSHOT_WIRE_TAG = 2;
const INPUT_WIRE_TAG = 3;
const ENTITY_FIELDS = Object.freeze([
  'id', 'specId', 'team',
  'x', 'y', 'z', 'vx', 'vy', 'vz',
  'yaw', 'pitch', 'roll', 'turretYaw', 'gunPitch',
  'hp', 'maxHp', 'reloadMs', 'reloadTotalMs', 'reloadKind',
  'gunReloadMs', 'gunReloadTotalMs', 'gunReloadKind',
  'magazineRounds', 'magazineCapacity', 'shellSlot',
  'ammo0', 'ammo1', 'ammo2', 'flags', 'eraSpent',
] as const);
const SHELL_FIELDS = Object.freeze([
  'id', 'shooterId', 'x', 'y', 'z', 'vx', 'vy', 'vz', 'type',
] as const);
const MAX_ENTITIES = 32;
const MAX_SHELLS = 256;
const GUIDED_SHELL_IDS = '__cotGuidedShellIds';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function isRecord(value: RuntimeValue): value is Record<string, RuntimeValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toBytes(value: RuntimeValue): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new TypeError('replaceable wire payload must be binary');
}

function packRows(
  rows: RuntimeValue,
  fields: readonly string[],
  limit: number,
  label: string,
): RuntimeValue[][] {
  if (!Array.isArray(rows) || rows.length > limit) {
    throw new TypeError(`${label} rows exceed the wire limit`);
  }
  return rows.map((row) => {
    if (!isRecord(row)) throw new TypeError(`invalid ${label} row`);
    return fields.map((field) => row[field]);
  });
}

function unpackRows(
  rows: RuntimeValue,
  fields: readonly string[],
  limit: number,
  label: string,
): WireRow[] {
  if (!Array.isArray(rows) || rows.length > limit) {
    throw new TypeError(`${label} rows exceed the wire limit`);
  }
  return rows.map((values) => {
    if (!Array.isArray(values) || values.length !== fields.length) {
      throw new TypeError(`invalid ${label} row`);
    }
    const row: WireRow = {};
    for (let index = 0; index < fields.length; index++) {
      // JSON arrays encode an omitted optional column as null. Preserve the
      // sparse object shape so optional state (currently ERA depletion) does
      // not churn every unchanged entity delta after decode.
      if (values[index] != null) row[fields[index]] = values[index];
    }
    return row;
  });
}

function encodeInputEnvelope(envelope: ProtocolEnvelope): RuntimeValue[] {
  const input = normalizePlayerInput(envelope.payload);
  const wire: RuntimeValue[] = [
    INPUT_WIRE_TAG,
    envelope.v,
    envelope.seq,
    envelope.ack,
    envelope.tick,
    input.inputSeq,
    input.clientTick,
    input.snapshotAckTick,
    input.throttle,
    input.steer,
    input.brake ? 1 : 0,
    input.fire ? 1 : 0,
    input.aimYaw,
    input.aimPitch,
    input.aimDistance,
    input.shellSlot,
    input.actionBits,
    input.aimLocked ? 1 : 0,
  ];
  // Only capability-negotiated clients attach this optional extension. Keep
  // legacy input packets byte-shape compatible with 18-column hosts.
  if (input.fireIntentSeq != null) wire.push(input.fireIntentSeq);
  return wire;
}

function decodeInputEnvelope(wire: RuntimeValue[]): ProtocolEnvelope<NormalizedPlayerInput> {
  if (wire.length !== 18 && wire.length !== 19) throw new TypeError('invalid input wire packet');
  const envelope = validateEnvelope({
    v: wire[1],
    type: MESSAGE_TYPES.INPUT,
    seq: wire[2],
    ack: wire[3],
    tick: wire[4],
    payload: {
      inputSeq: wire[5],
      clientTick: wire[6],
      snapshotAckTick: wire[7],
      throttle: wire[8],
      steer: wire[9],
      brake: wire[10] === 1,
      fire: wire[11] === 1,
      aimYaw: wire[12],
      aimPitch: wire[13],
      aimDistance: wire[14],
      shellSlot: wire[15],
      actionBits: wire[16],
      aimLocked: wire[17] === 1,
      ...(wire.length === 19 ? { fireIntentSeq: wire[18] } : {}),
    },
  });
  return {
    ...envelope,
    type: MESSAGE_TYPES.INPUT,
    payload: normalizePlayerInput(envelope.payload),
  };
}

function encodeSnapshotEnvelope(envelope: ProtocolEnvelope): RuntimeValue[] {
  if (!isRecord(envelope.payload)) throw new TypeError('snapshot payload is required');
  const packet = envelope.payload;
  const shells = Array.isArray(packet.shells) ? packet.shells : [];
  const guidedIds: RuntimeValue[] = [];
  for (const shell of shells) {
    if (isRecord(shell) && shell.guided === true) guidedIds.push(shell.id);
  }
  const meta = isRecord(packet.meta) ? packet.meta : null;
  // Keep v2 shell rows at their existing width. Older clients reject added
  // columns but safely ignore metadata they do not know. New clients restore
  // guided presentation from this optional codec-only sidecar.
  const wireMeta = guidedIds.length ? { ...meta, [GUIDED_SHELL_IDS]: guidedIds } : meta;
  return [
    SNAPSHOT_WIRE_TAG,
    envelope.v,
    envelope.seq,
    envelope.ack,
    envelope.tick,
    packet.serverTimeMs,
    packet.ackInputSeq,
    packet.baseTick == null ? -1 : packet.baseTick,
    packRows(packet.entities, ENTITY_FIELDS, MAX_ENTITIES, 'entity'),
    Array.isArray(packet.removedEntityIds) ? packet.removedEntityIds : [],
    packRows(packet.shells || [], SHELL_FIELDS, MAX_SHELLS, 'shell'),
    Array.isArray(packet.events) ? packet.events : [],
    wireMeta,
  ];
}

function validSnapshotAck(value: RuntimeValue): value is number | null {
  return value === null || (typeof value === 'number' && Number.isSafeInteger(value) &&
    value >= 0 && value < 0x80000000);
}

function readSnapshotEnvelope(wire: RuntimeValue[]): ProtocolEnvelope<SnapshotWirePayload> {
  if (wire.length !== 13 || wire[0] !== SNAPSHOT_WIRE_TAG) {
    throw new TypeError('invalid snapshot wire packet');
  }
  const envelope = validateEnvelope({
    v: wire[1],
    type: MESSAGE_TYPES.SNAPSHOT,
    seq: wire[2],
    ack: wire[3],
    tick: wire[4],
    payload: null,
  });
  const serverTimeMs = Number(wire[5]);
  const ackInputSeq = wire[6];
  const baseTick = Number(wire[7]);
  if (!Number.isFinite(serverTimeMs) || serverTimeMs < 0 ||
      !validSnapshotAck(ackInputSeq) ||
      !Number.isSafeInteger(baseTick) || baseTick < -1) {
    throw new TypeError('invalid snapshot wire metadata');
  }
  let meta = isRecord(wire[12]) ? wire[12] : null;
  const shells = unpackRows(wire[10], SHELL_FIELDS, MAX_SHELLS, 'shell');
  const guidedIds = meta?.[GUIDED_SHELL_IDS];
  const shellIds = new Set(shells.map((shell) => shell.id));
  if (guidedIds != null && (!Array.isArray(guidedIds) || guidedIds.length > MAX_SHELLS ||
      guidedIds.some((id) => typeof id !== 'number' || !Number.isSafeInteger(id) || id < 0 ||
        !shellIds.has(id)) || new Set(guidedIds).size !== guidedIds.length)) {
    throw new TypeError('invalid guided shell wire metadata');
  }
  const guidedSet = new Set(Array.isArray(guidedIds) ? guidedIds : []);
  for (const shell of shells) shell.guided = guidedSet.has(shell.id);
  if (meta && Object.hasOwn(meta, GUIDED_SHELL_IDS)) {
    const restoredMeta = { ...meta };
    delete restoredMeta[GUIDED_SHELL_IDS];
    meta = Object.keys(restoredMeta).length ? restoredMeta : null;
  }
  return {
    ...envelope,
    type: MESSAGE_TYPES.SNAPSHOT,
    payload: {
      tick: envelope.tick,
      serverTimeMs,
      ackInputSeq,
      baseTick,
      entities: unpackRows(wire[8], ENTITY_FIELDS, MAX_ENTITIES, 'entity'),
      removedEntityIds: Array.isArray(wire[9]) ? wire[9] : [],
      shells,
      events: Array.isArray(wire[11]) ? wire[11] : [],
      meta,
    },
  };
}

/** Compact binary JSON-array codec for replaceable snapshot and input envelopes. */
export const snapshotWireCodec: WireCodec & {
  encode(value: RuntimeValue): Uint8Array;
  decode(value: RuntimeValue): ReplaceableWireEnvelope;
} = Object.freeze({
  encode(value: RuntimeValue): Uint8Array {
    const envelope = validateEnvelope(value);
    if (!envelope.payload) throw new TypeError('replaceable envelope is required');
    const wire = envelope.type === MESSAGE_TYPES.INPUT
      ? encodeInputEnvelope(envelope)
      : envelope.type === MESSAGE_TYPES.SNAPSHOT
        ? encodeSnapshotEnvelope(envelope)
        : null;
    if (!wire) throw new TypeError('replaceable envelope is required');
    return encoder.encode(JSON.stringify(wire));
  },

  decode(value: RuntimeValue): ReplaceableWireEnvelope {
    const wire = JSON.parse(decoder.decode(toBytes(value))) as RuntimeValue;
    if (!Array.isArray(wire)) throw new TypeError('invalid replaceable wire packet');
    if (wire[0] === INPUT_WIRE_TAG) return decodeInputEnvelope(wire);
    return readSnapshotEnvelope(wire);
  },

  size(value: RuntimeValue): number {
    if (typeof value === 'string') return encoder.encode(value).byteLength;
    return toBytes(value).byteLength;
  },
});
