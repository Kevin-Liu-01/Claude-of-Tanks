/**
 * Versioned, transport-agnostic multiplayer protocol primitives.
 *
 * This module deliberately knows nothing about WebRTC, WebSockets, Three.js,
 * or DOM state. Every transport carries the same plain-data envelopes and the
 * authoritative host validates all client-authored fields here.
 */

export const PROTOCOL_VERSION = 2;
export const MATCH_TICK_HZ = 60;
export const SNAPSHOT_HZ = 20;
export const MAX_PLAYERS = 14;
export const MAX_SPECTATORS = 8;

// Edge-triggered player actions travel in the same validated input stream as
// driving and gunnery. The authority latches these bits until a simulation
// step consumes them, so a quick key/touch press cannot disappear when a
// newer movement frame replaces the previous one.
export const PLAYER_ACTION_BITS = Object.freeze({
  REPAIR: 1 << 0,
  FIRST_AID: 1 << 1,
  EXTINGUISHER: 1 << 2,
});

export const MESSAGE_TYPES = Object.freeze({
  HELLO: 'hello',
  WELCOME: 'welcome',
  READY: 'ready',
  LOBBY_COMMAND: 'lobby_command',
  LOBBY_STATE: 'lobby_state',
  INPUT: 'input',
  SNAPSHOT: 'snapshot',
  EVENT: 'event',
  PING: 'ping',
  PONG: 'pong',
  ERROR: 'error',
  LEAVE: 'leave',
});

const MESSAGE_TYPE_SET = new Set(Object.values(MESSAGE_TYPES));
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 6;
const MAX_SEQUENCE = 0x7fffffff;

export class ProtocolError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ProtocolError';
    this.code = code;
  }
}

function assertFiniteNumber(value, field) {
  if (!Number.isFinite(value)) {
    throw new ProtocolError('invalid_number', `${field} must be finite`);
  }
  return value;
}

function assertSequence(value, field) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_SEQUENCE) {
    throw new ProtocolError('invalid_sequence', `${field} must be an unsigned sequence`);
  }
  return value;
}

function clamp(value, lo, hi) {
  return value < lo ? lo : value > hi ? hi : value;
}

/** Normalize a human-entered private-room code. */
export function normalizeRoomCode(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/[01IO]/g, (char) => ({ 0: 'Q', 1: 'L', I: 'L', O: 'Q' })[char])
    .slice(0, ROOM_CODE_LENGTH);
}

function cryptoUnit() {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') {
    throw new ProtocolError('secure_random_unavailable',
      'room creation requires crypto.getRandomValues or an injected RNG');
  }
  const word = new Uint32Array(1);
  cryptoApi.getRandomValues(word);
  return word[0] / 0x100000000;
}

/**
 * Create a readable, collision-resistant-enough room code for signaling.
 * Production callers use Web Crypto; deterministic tests inject `rng`.
 */
export function createRoomCode(rng = cryptoUnit) {
  let out = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    const unit = assertFiniteNumber(rng(), 'rng()');
    if (unit < 0 || unit >= 1) {
      throw new ProtocolError('invalid_rng', 'rng() must return a value in [0, 1)');
    }
    out += ROOM_CODE_ALPHABET[(unit * ROOM_CODE_ALPHABET.length) | 0];
  }
  return out;
}

/** Create one wire envelope. */
export function createEnvelope(type, payload, {
  seq = 0,
  ack = 0,
  tick = 0,
} = {}) {
  if (!MESSAGE_TYPE_SET.has(type)) {
    throw new ProtocolError('unknown_message_type', `unknown message type: ${type}`);
  }
  return {
    v: PROTOCOL_VERSION,
    type,
    seq: assertSequence(seq, 'seq'),
    ack: assertSequence(ack, 'ack'),
    tick: assertSequence(tick, 'tick'),
    payload: payload == null ? null : payload,
  };
}

/** Validate untrusted transport data before dispatch. */
export function validateEnvelope(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ProtocolError('invalid_envelope', 'message must be an object');
  }
  if (value.v !== PROTOCOL_VERSION) {
    throw new ProtocolError('protocol_mismatch',
      `expected protocol ${PROTOCOL_VERSION}, received ${String(value.v)}`);
  }
  if (!MESSAGE_TYPE_SET.has(value.type)) {
    throw new ProtocolError('unknown_message_type', `unknown message type: ${value.type}`);
  }
  assertSequence(value.seq, 'seq');
  assertSequence(value.ack, 'ack');
  assertSequence(value.tick, 'tick');
  if (!Object.hasOwn(value, 'payload')) {
    throw new ProtocolError('invalid_envelope', 'payload field is required');
  }
  return value;
}

/**
 * Validate and normalize one player input frame. Unknown fields are dropped.
 * Aim is expressed as world yaw/pitch rather than a trusted target position.
 */
export function normalizePlayerInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ProtocolError('invalid_input', 'input must be an object');
  }
  const inputSeq = assertSequence(value.inputSeq, 'inputSeq');
  const clientTick = assertSequence(value.clientTick, 'clientTick');
  const snapshotAckTick = assertSequence(value.snapshotAckTick ?? 0, 'snapshotAckTick');
  const throttle = clamp(assertFiniteNumber(value.throttle, 'throttle'), -1, 1);
  const steer = clamp(assertFiniteNumber(value.steer, 'steer'), -1, 1);
  const aimYaw = assertFiniteNumber(value.aimYaw, 'aimYaw');
  const aimPitch = clamp(assertFiniteNumber(value.aimPitch, 'aimPitch'), -Math.PI / 2, Math.PI / 2);
  const shellSlot = Number(value.shellSlot);
  if (!Number.isInteger(shellSlot) || shellSlot < 0 || shellSlot > 2) {
    throw new ProtocolError('invalid_input', 'shellSlot must be 0, 1, or 2');
  }
  const actionBits = Number(value.actionBits ?? 0);
  if (!Number.isInteger(actionBits) || actionBits < 0 || actionBits > 0xffff) {
    throw new ProtocolError('invalid_input', 'actionBits must be an unsigned 16-bit integer');
  }
  return {
    inputSeq,
    clientTick,
    snapshotAckTick,
    throttle,
    steer,
    brake: !!value.brake,
    fire: !!value.fire,
    aimYaw,
    aimPitch,
    shellSlot,
    actionBits,
  };
}

export function nextSequence(value) {
  return value >= MAX_SEQUENCE ? 0 : value + 1;
}

export function isSequenceNewer(candidate, previous) {
  if (candidate === previous) return false;
  const range = MAX_SEQUENCE + 1;
  const delta = (candidate - previous + range) % range;
  return delta > 0 && delta < range / 2;
}
