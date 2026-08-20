const SNAPSHOT_WIRE_TAG = 2;
const INPUT_WIRE_TAG = 3;
const ENTITY_FIELDS = Object.freeze([
  'id', 'specId', 'team',
  'x', 'y', 'z', 'vx', 'vy', 'vz',
  'yaw', 'pitch', 'roll', 'turretYaw', 'gunPitch',
  'hp', 'maxHp', 'reloadMs', 'reloadTotalMs', 'reloadKind',
  'magazineRounds', 'magazineCapacity', 'shellSlot', 'flags',
]);
const SHELL_FIELDS = Object.freeze([
  'id', 'shooterId', 'x', 'y', 'z', 'vx', 'vy', 'vz', 'type',
]);
const MAX_ENTITIES = 32;
const MAX_SHELLS = 256;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new TypeError('replaceable wire payload must be binary');
}

function packRows(rows, fields, limit, label) {
  if (!Array.isArray(rows) || rows.length > limit) {
    throw new TypeError(`${label} rows exceed the wire limit`);
  }
  return rows.map((row) => fields.map((field) => row[field]));
}

function unpackRows(rows, fields, limit, label) {
  if (!Array.isArray(rows) || rows.length > limit) {
    throw new TypeError(`${label} rows exceed the wire limit`);
  }
  return rows.map((values) => {
    if (!Array.isArray(values) || values.length !== fields.length) {
      throw new TypeError(`invalid ${label} row`);
    }
    const row = {};
    for (let index = 0; index < fields.length; index++) row[fields[index]] = values[index];
    return row;
  });
}

function encodeInputEnvelope(envelope) {
  const input = envelope.payload;
  return [
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
  ];
}

function decodeInputEnvelope(wire) {
  if (wire.length !== 17) throw new TypeError('invalid input wire packet');
  return {
    v: wire[1],
    type: 'input',
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
    },
  };
}

/** Compact binary JSON-array codec for replaceable snapshot and input envelopes. */
export const snapshotWireCodec = Object.freeze({
  encode(envelope) {
    if (!envelope || !envelope.payload) {
      throw new TypeError('replaceable envelope is required');
    }
    if (envelope.type === 'input') {
      return encoder.encode(JSON.stringify(encodeInputEnvelope(envelope)));
    }
    if (envelope.type !== 'snapshot') throw new TypeError('replaceable envelope is required');
    const packet = envelope.payload;
    const wire = [
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
      packet.meta && typeof packet.meta === 'object' ? packet.meta : null,
    ];
    return encoder.encode(JSON.stringify(wire));
  },

  decode(value) {
    const wire = JSON.parse(decoder.decode(toBytes(value)));
    if (!Array.isArray(wire)) throw new TypeError('invalid replaceable wire packet');
    if (wire[0] === INPUT_WIRE_TAG) return decodeInputEnvelope(wire);
    if (wire.length !== 13 || wire[0] !== SNAPSHOT_WIRE_TAG) {
      throw new TypeError('invalid snapshot wire packet');
    }
    const tick = wire[4];
    return {
      v: wire[1],
      type: 'snapshot',
      seq: wire[2],
      ack: wire[3],
      tick,
      payload: {
        tick,
        serverTimeMs: wire[5],
        ackInputSeq: wire[6],
        baseTick: wire[7],
        entities: unpackRows(wire[8], ENTITY_FIELDS, MAX_ENTITIES, 'entity'),
        removedEntityIds: Array.isArray(wire[9]) ? wire[9] : [],
        shells: unpackRows(wire[10], SHELL_FIELDS, MAX_SHELLS, 'shell'),
        events: Array.isArray(wire[11]) ? wire[11] : [],
        meta: wire[12] && typeof wire[12] === 'object' ? wire[12] : null,
      },
    };
  },

  size(value) {
    if (typeof value === 'string') return encoder.encode(value).byteLength;
    return toBytes(value).byteLength;
  },
});
