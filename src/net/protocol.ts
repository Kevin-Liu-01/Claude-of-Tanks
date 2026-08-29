/**
 * Versioned, transport-agnostic multiplayer protocol primitives.
 *
 * This module deliberately knows nothing about WebRTC, WebSockets, Three.js,
 * or DOM state. Every transport carries the same plain-data envelopes and the
 * authoritative host validates all client-authored fields here.
 */

export const PROTOCOL_VERSION = 8;
export const MATCH_TICK_HZ = 60;
export const SNAPSHOT_HZ = 20;
export const MAX_PLAYERS = 14;
export const MAX_SPECTATORS = 8;
export const MAX_ROOM_CHAT_LENGTH = 240;

// Edge-triggered player actions travel in the same validated input stream as
// driving and gunnery. The authority latches these bits until a simulation
// step consumes them, so a quick key/touch press cannot disappear when a
// newer movement frame replaces the previous one.
export const PLAYER_ACTION_BITS = Object.freeze({
  REPAIR: 1 << 0,
  FIRST_AID: 1 << 1,
  EXTINGUISHER: 1 << 2,
  RELOAD_MAGAZINE: 1 << 3,
  SPECIAL_ACTION: 1 << 4,
} as const);

export const MESSAGE_TYPES = Object.freeze({
  HELLO: 'hello',
  WELCOME: 'welcome',
  READY: 'ready',
  LOBBY_COMMAND: 'lobby_command',
  LOBBY_STATE: 'lobby_state',
  ROOM_COMMAND: 'room_command',
  ROOM_STATE: 'room_state',
  ROOM_CHAT_COMMAND: 'room_chat_command',
  ROOM_CHAT: 'room_chat',
  INPUT: 'input',
  SNAPSHOT: 'snapshot',
  EVENT: 'event',
  PING: 'ping',
  PONG: 'pong',
  ERROR: 'error',
  LEAVE: 'leave',
} as const);

export type MessageType = typeof MESSAGE_TYPES[keyof typeof MESSAGE_TYPES];

export interface ProtocolEnvelope<TPayload = unknown> {
  v: typeof PROTOCOL_VERSION;
  type: MessageType;
  seq: number;
  ack: number;
  tick: number;
  payload: TPayload | null;
}

export interface EnvelopeOptions {
  seq?: number;
  ack?: number;
  tick?: number;
}

export interface NormalizedPlayerInput {
  inputSeq: number;
  clientTick: number;
  snapshotAckTick: number;
  throttle: number;
  steer: number;
  brake: boolean;
  fire: boolean;
  aimLocked: boolean;
  aimYaw: number;
  aimPitch: number;
  aimDistance: number;
  shellSlot: 0 | 1 | 2;
  actionBits: number;
}

const MESSAGE_TYPE_SET = new Set<MessageType>(Object.values(MESSAGE_TYPES));
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 6;
const MAX_SEQUENCE = 0x7fffffff;
const MIN_AIM_DISTANCE_M = 0.01;
const MAX_AIM_DISTANCE_M = 2000;
const AMBIGUOUS_ROOM_CHARACTERS: Readonly<Record<string, string>> = Object.freeze({
  0: 'Q',
  1: 'L',
  I: 'L',
  O: 'Q',
});

export class ProtocolError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ProtocolError';
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertFiniteNumber(value: unknown, field: string): number {
  if (!Number.isFinite(value)) {
    throw new ProtocolError('invalid_number', `${field} must be finite`);
  }
  return Number(value);
}

function assertSequence(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > MAX_SEQUENCE) {
    throw new ProtocolError('invalid_sequence', `${field} must be an unsigned sequence`);
  }
  return Number(value);
}

function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value;
}

/** Normalize a human-entered private-room code. */
export function normalizeRoomCode(value: unknown): string {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/[01IO]/g, (char) => AMBIGUOUS_ROOM_CHARACTERS[char] || char)
    .slice(0, ROOM_CODE_LENGTH);
}

function cryptoUnit(): number {
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
export function createRoomCode(rng: () => number = cryptoUnit): string {
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

/**
 * Validate player-authored room chat before it reaches presentation or room
 * authority. Chat stays plain text: controls, bidi overrides, and invisible
 * joiners are removed so a message cannot visually impersonate UI chrome.
 */
export function normalizeRoomChatText(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ProtocolError('invalid_chat', 'chat text must be a string');
  }
  const text = value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[\u200b-\u200d\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
    .replace(/\s+/gu, ' ')
    .trim();
  if (!text) throw new ProtocolError('empty_chat', 'chat message is empty');
  if ([...text].length > MAX_ROOM_CHAT_LENGTH) {
    throw new ProtocolError('chat_too_long',
      `chat messages may contain at most ${MAX_ROOM_CHAT_LENGTH} characters`);
  }
  return text;
}

/** Create one wire envelope. */
export function createEnvelope<TPayload>(
  type: MessageType,
  payload: TPayload,
  { seq = 0, ack = 0, tick = 0 }: EnvelopeOptions = {},
): ProtocolEnvelope<TPayload> {
  if (!MESSAGE_TYPE_SET.has(type)) {
    throw new ProtocolError('unknown_message_type', `unknown message type: ${String(type)}`);
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
export function validateEnvelope(value: unknown): ProtocolEnvelope {
  if (!isRecord(value)) {
    throw new ProtocolError('invalid_envelope', 'message must be an object');
  }
  if (value.v !== PROTOCOL_VERSION) {
    throw new ProtocolError('protocol_mismatch',
      `expected protocol ${PROTOCOL_VERSION}, received ${String(value.v)}`);
  }
  if (typeof value.type !== 'string' || !MESSAGE_TYPE_SET.has(value.type as MessageType)) {
    throw new ProtocolError('unknown_message_type', `unknown message type: ${String(value.type)}`);
  }
  assertSequence(value.seq, 'seq');
  assertSequence(value.ack, 'ack');
  assertSequence(value.tick, 'tick');
  if (!Object.hasOwn(value, 'payload')) {
    throw new ProtocolError('invalid_envelope', 'payload field is required');
  }
  return value as unknown as ProtocolEnvelope;
}

/**
 * Validate and normalize one player input frame. Unknown fields are dropped.
 * Aim is expressed as a bounded polar offset from the tank origin. Distance
 * preserves the finite camera-hit point (and therefore close-range parallax)
 * without accepting an unbounded client-authored world position.
 */
export function normalizePlayerInput(value: unknown): NormalizedPlayerInput {
  if (!isRecord(value)) {
    throw new ProtocolError('invalid_input', 'input must be an object');
  }
  const inputSeq = assertSequence(value.inputSeq, 'inputSeq');
  const clientTick = assertSequence(value.clientTick, 'clientTick');
  const snapshotAckTick = assertSequence(value.snapshotAckTick ?? 0, 'snapshotAckTick');
  const throttle = clamp(assertFiniteNumber(value.throttle, 'throttle'), -1, 1);
  const steer = clamp(assertFiniteNumber(value.steer, 'steer'), -1, 1);
  const aimYaw = assertFiniteNumber(value.aimYaw, 'aimYaw');
  const aimPitch = clamp(assertFiniteNumber(value.aimPitch, 'aimPitch'), -Math.PI / 2, Math.PI / 2);
  const aimDistance = clamp(
    value.aimDistance == null ? 1000 : assertFiniteNumber(value.aimDistance, 'aimDistance'),
    MIN_AIM_DISTANCE_M,
    MAX_AIM_DISTANCE_M,
  );
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
    aimLocked: !!value.aimLocked,
    aimYaw,
    aimPitch,
    aimDistance,
    shellSlot: shellSlot as 0 | 1 | 2,
    actionBits,
  };
}

export function nextSequence(value: number): number {
  return value >= MAX_SEQUENCE ? 0 : value + 1;
}

export function isSequenceNewer(candidate: number, previous: number): boolean {
  if (candidate === previous) return false;
  const range = MAX_SEQUENCE + 1;
  const delta = (candidate - previous + range) % range;
  return delta > 0 && delta < range / 2;
}
