/**
 * Message codec. `encodeMessage` throws WireError on invalid producer input;
 * `decodeMessage` never throws: every malformed, truncated, oversized or
 * out-of-range frame comes back as a typed rejection.
 */
import { ByteReader, ByteWriter, WireError, toUint8Array, utf8ByteLength } from './bytes.ts';
import {
  CLOSE_REASON, EVENT_KIND_NAMES, EVENT_KIND_OTHER, INPUT_MARGIN_UNKNOWN, MAX_BUILD_BYTES, MAX_CHAT_BYTES,
  MAX_CONTROLS_PER_INPUT, MAX_DESTROYED_PER_SNAPSHOT, MAX_DETAIL_BYTES, MAX_ENTITIES, MAX_EVENTS_PER_MESSAGE,
  MAX_EVENT_JSON_BYTES, MAX_ID_BYTES, MAX_MESSAGE_BYTES, MAX_MODE_STATE_JSON_BYTES, MAX_MOVEMENT_VALUES,
  MAX_NAME_BYTES, MAX_REASON_BYTES, MAX_RULESET_JSON_BYTES, MAX_SEATS, MAX_SHELLS, MAX_TOKEN_BYTES,
  MESSAGE_TYPE, NO_ENTITY, NO_SEAT, NO_TICK, SHELL_TYPE_OTHER, SHELL_TYPE_NAMES, SNAPSHOT_FLAGS,
  VIEWER_EQUIPMENT, VIEWER_MODULES, WIRE_VERSION,
} from './constants.ts';
import type { CloseReasonId, PhaseId, TeamId, VerdictId } from './constants.ts';
import type {
  ChatMessage, CloseMessage, ControlFrame, EntityRow, EntityRowPatch, ErrorMessage, EventMessage,
  HelloMessage, InputMessage, LeaveMessage, PingMessage, PongMessage, RosterEntry, ShellRow,
  SnapshotAckMessage, SnapshotFrame, SnapshotMeta, SnapshotPacket, ViewerState, WelcomeMessage,
  WireEvent, WireMessage,
} from './messages.ts';
import {
  applyEntityRowPatch, diffEntityRow, readEntityRowPatch, readIndexList, writeEntityRowPatch, writeIndexList,
} from './rows.ts';

export type DecodeResult =
  | { ok: true; message: WireMessage; bytes: number }
  | { ok: false; error: WireError; bytes: number };

const CLOSE_REASON_MAX = Math.max(...Object.values(CLOSE_REASON));
const EVENT_KIND_INDEX = new Map<string, number>(EVENT_KIND_NAMES.map((name, index) => [name, index]));
const SHELL_TYPE_INDEX = new Map<string, number>(SHELL_TYPE_NAMES.map((name, index) => [name, index]));
const sharedWriter = new ByteWriter(2048);

function reason(value: number): CloseReasonId {
  if (!Number.isInteger(value) || value < 0 || value > CLOSE_REASON_MAX) {
    throw new WireError('range', `close reason out of range: ${value}`);
  }
  return value as CloseReasonId;
}

function tickOrNone(value: number): number {
  if (value === NO_TICK) return NO_TICK;
  if (!Number.isInteger(value) || value < 0 || value >= NO_TICK) throw new WireError('range', `tick out of range: ${value}`);
  return value;
}

function header(writer: ByteWriter, type: number): void {
  writer.u8(WIRE_VERSION);
  writer.u8(type);
}

// ---------------------------------------------------------------- encoders

function writeHello(writer: ByteWriter, message: HelloMessage): void {
  writer.u16(message.protocolVersion);
  writer.u32(message.capabilities);
  writer.string(message.token, MAX_TOKEN_BYTES);
  writer.string(message.clientBuild, MAX_BUILD_BYTES);
}

function writeControl(writer: ByteWriter, control: ControlFrame): void {
  writer.i8(control.throttle);
  writer.i8(control.steer);
  if (control.flags > 7) throw new WireError('range', 'control flags exceed three bits');
  writer.u8(control.flags);
  writer.u16(control.aimYaw);
  writer.i16(control.aimPitch);
  writer.u16(control.aimDistance);
  if (control.shellSlot > 2) throw new WireError('range', 'shell slot must be 0..2');
  writer.u8(control.shellSlot);
  writer.u16(control.fireSeq);
  writer.u16(control.actionSeq);
  if (control.actionBits > 0x3f) throw new WireError('range', 'action bits exceed six bits');
  writer.u8(control.actionBits);
}

function writeInput(writer: ByteWriter, message: InputMessage): void {
  if (message.controls.length < 1 || message.controls.length > MAX_CONTROLS_PER_INPUT) {
    throw new WireError('too_many', `input frames carry 1..${MAX_CONTROLS_PER_INPUT} controls`);
  }
  writer.u32(tickOrNone(message.clientTick));
  writer.u32(tickOrNone(message.snapshotAckTick));
  writer.u8(message.interpDelayMs);
  writer.u8(message.controls.length);
  for (const control of message.controls) writeControl(writer, control);
}

function writeRoster(writer: ByteWriter, roster: RosterEntry[]): void {
  if (roster.length > MAX_ENTITIES) throw new WireError('too_many', 'roster exceeds MAX_ENTITIES');
  writer.u8(roster.length);
  const seen = new Set<number>();
  for (const entry of roster) {
    if (entry.entityId < 1 || entry.entityId > MAX_ENTITIES || seen.has(entry.entityId)) {
      throw new WireError('invalid_message', `roster entity id invalid or duplicated: ${entry.entityId}`);
    }
    seen.add(entry.entityId);
    if (entry.seat !== NO_SEAT && entry.seat >= MAX_SEATS) throw new WireError('range', 'roster seat out of range');
    writer.u8(entry.entityId);
    writer.u8(entry.seat);
    writer.u8(entry.team);
    writer.u8((entry.bot ? 1 : 0) | (entry.connected ? 2 : 0));
    writer.string(entry.playerId, MAX_ID_BYTES);
    writer.string(entry.name, MAX_NAME_BYTES);
    writer.string(entry.specId, MAX_ID_BYTES);
  }
}

function writeWelcome(writer: ByteWriter, message: WelcomeMessage): void {
  writer.u16(message.protocolVersion);
  writer.u8(message.tickHz);
  writer.u8(message.snapshotHz);
  writer.u8(message.seat);
  writer.u8(message.entityId);
  writer.u8(message.team);
  writer.u32(message.serverTick);
  writer.u32(message.serverTimeMs);
  writer.u32(message.seed);
  writer.u32(message.capabilities);
  writer.string(message.roomId, MAX_ID_BYTES);
  writer.string(message.mapId, MAX_ID_BYTES);
  writer.string(message.mode, MAX_ID_BYTES);
  writer.string(message.rulesetJson, MAX_RULESET_JSON_BYTES);
  writeRoster(writer, message.roster);
}

function writeShell(writer: ByteWriter, shell: ShellRow): void {
  writer.u16(shell.id);
  writer.u8(shell.shooterEntityId);
  writer.i32(shell.x); writer.i32(shell.y); writer.i32(shell.z);
  writer.i16(shell.vx); writer.i16(shell.vy); writer.i16(shell.vz);
  if (shell.shellType !== SHELL_TYPE_OTHER && shell.shellType >= SHELL_TYPE_NAMES.length) {
    throw new WireError('range', 'unknown shell type index');
  }
  writer.u8(shell.shellType);
  writer.u8(shell.flags);
}

function writeViewer(writer: ByteWriter, viewer: ViewerState): void {
  writer.u8(viewer.entityId);
  if (viewer.modules.length !== VIEWER_MODULES.length) throw new WireError('invalid_message', 'viewer modules length');
  let modules = 0;
  for (let index = 0; index < VIEWER_MODULES.length; index++) {
    const state = viewer.modules[index]!;
    if (state < 0 || state > 2) throw new WireError('range', 'module state out of range');
    modules |= state << (index * 2);
  }
  writer.u16(modules);
  writer.u8(viewer.crewBits);
  if (viewer.equipment.length !== VIEWER_EQUIPMENT.length) throw new WireError('invalid_message', 'viewer equipment length');
  for (const value of viewer.equipment) writer.u16(value);
  writer.u16(viewer.modeSpeedMultiplier);
  writer.u16(viewer.modeGravityScale);
  writer.u8(viewer.movementVersion);
  if (viewer.movementVersion !== 0) {
    if (viewer.movementValues.length > MAX_MOVEMENT_VALUES) throw new WireError('too_many', 'movement values');
    writer.u16(viewer.movementFlags);
    writer.u8(viewer.movementValues.length);
    for (const value of viewer.movementValues) writer.f32(value);
  }
}

function writeMeta(writer: ByteWriter, meta: SnapshotMeta, hasVerdict: boolean): void {
  writer.u8(meta.phase);
  writer.u16(meta.countdownMs);
  writer.u32(meta.battleTimeMs);
  writer.u8(meta.verdict);
  if (hasVerdict) writer.string(meta.verdictReason, MAX_REASON_BYTES);
  writer.u32(meta.destructibleRevision);
}

function writeSnapshot(writer: ByteWriter, packet: SnapshotPacket, baseline: SnapshotFrame | null): void {
  const hasVerdict = packet.meta.verdict !== 0;
  const flags = (packet.keyframe ? SNAPSHOT_FLAGS.KEYFRAME : 0) |
    (packet.viewer ? SNAPSHOT_FLAGS.HAS_VIEWER : 0) |
    (packet.modeStateJson != null ? SNAPSHOT_FLAGS.HAS_MODE_STATE : 0) |
    (hasVerdict ? SNAPSHOT_FLAGS.HAS_VERDICT : 0);
  if (!packet.keyframe && (!baseline || baseline.tick !== packet.baseTick)) {
    throw new WireError('missing_baseline', 'delta snapshot needs its baseline frame');
  }
  writer.u32(tickOrNone(packet.tick));
  writer.u32(packet.serverTimeMs);
  writer.u8(flags);
  writer.u32(packet.keyframe ? NO_TICK : tickOrNone(packet.baseTick));
  writer.u32(tickOrNone(packet.ackedInputTick));
  writer.u16(packet.ackedFireSeq);
  writer.u16(packet.ackedActionSeq);
  writer.i8(packet.inputMarginTicks);
  writeMeta(writer, packet.meta, hasVerdict);
  writeIndexList(writer, packet.destroyed, MAX_DESTROYED_PER_SNAPSHOT);
  if (packet.entities.length > MAX_ENTITIES) throw new WireError('too_many', 'snapshot entity rows');
  writer.u8(packet.entities.length);
  const baseRows = baseline ? new Map(baseline.entities.map((row) => [row.entityId, row])) : null;
  for (const patch of packet.entities) {
    writeEntityRowPatch(writer, patch, baseRows?.get(patch.entityId) ?? null);
  }
  if (packet.removed.length > MAX_ENTITIES) throw new WireError('too_many', 'snapshot removals');
  writer.u8(packet.removed.length);
  for (const entityId of packet.removed) writer.u8(entityId);
  if (packet.shells.length > MAX_SHELLS) throw new WireError('too_many', 'snapshot shells');
  writer.u16(packet.shells.length);
  for (const shell of packet.shells) writeShell(writer, shell);
  if (packet.viewer) writeViewer(writer, packet.viewer);
  if (packet.modeStateJson != null) writer.string(packet.modeStateJson, MAX_MODE_STATE_JSON_BYTES);
}

function writeEvents(writer: ByteWriter, message: EventMessage): void {
  if (message.events.length > MAX_EVENTS_PER_MESSAGE) throw new WireError('too_many', 'events per message');
  writer.u32(tickOrNone(message.tick));
  writer.u8(message.events.length);
  for (const event of message.events) {
    const known = EVENT_KIND_INDEX.get(event.kind);
    if (known == null) {
      writer.u8(EVENT_KIND_OTHER);
      writer.string(event.kind, MAX_ID_BYTES);
    } else writer.u8(known);
    const json = JSON.stringify(event.payload);
    if (typeof json !== 'string' || json[0] !== '{') throw new WireError('bad_json', 'event payload must be a JSON object');
    writer.string(json, MAX_EVENT_JSON_BYTES);
  }
}

/** Encode any message; the returned bytes are a fresh copy. */
export function encodeMessage(message: WireMessage, baseline: SnapshotFrame | null = null): Uint8Array {
  const writer = sharedWriter;
  writer.reset();
  header(writer, message.type);
  switch (message.type) {
    case MESSAGE_TYPE.HELLO: writeHello(writer, message); break;
    case MESSAGE_TYPE.INPUT: writeInput(writer, message); break;
    case MESSAGE_TYPE.SNAPSHOT_ACK: writer.u32(tickOrNone(message.tick)); break;
    case MESSAGE_TYPE.PING: writer.u32(message.clientTimeMs); writer.u32(tickOrNone(message.snapshotAckTick)); break;
    case MESSAGE_TYPE.CHAT: writer.string(message.text, MAX_CHAT_BYTES); break;
    case MESSAGE_TYPE.LEAVE: writer.u8(reason(message.reason)); break;
    case MESSAGE_TYPE.WELCOME: writeWelcome(writer, message); break;
    case MESSAGE_TYPE.SNAPSHOT: writeSnapshot(writer, message, baseline); break;
    case MESSAGE_TYPE.EVENT: writeEvents(writer, message); break;
    case MESSAGE_TYPE.PONG:
      writer.u32(message.clientTimeMs); writer.u32(message.serverTimeMs); writer.u32(tickOrNone(message.serverTick));
      break;
    case MESSAGE_TYPE.CLOSE:
    case MESSAGE_TYPE.ERROR:
      writer.u8(reason(message.reason)); writer.string(message.detail, MAX_DETAIL_BYTES);
      break;
    default:
      throw new WireError('unknown_type', `cannot encode message type ${String((message as { type: unknown }).type)}`);
  }
  if (writer.length > MAX_MESSAGE_BYTES) throw new WireError('bad_length', `message exceeds ${MAX_MESSAGE_BYTES} bytes`);
  return writer.toBytes();
}

// ---------------------------------------------------------------- decoders

function readHello(reader: ByteReader): HelloMessage {
  return {
    type: MESSAGE_TYPE.HELLO,
    protocolVersion: reader.u16(),
    capabilities: reader.u32(),
    token: reader.string(MAX_TOKEN_BYTES),
    clientBuild: reader.string(MAX_BUILD_BYTES),
  };
}

function readControl(reader: ByteReader): ControlFrame {
  const control: ControlFrame = {
    throttle: reader.i8(),
    steer: reader.i8(),
    flags: reader.u8(),
    aimYaw: reader.u16(),
    aimPitch: reader.i16(),
    aimDistance: reader.u16(),
    shellSlot: reader.u8(),
    fireSeq: reader.u16(),
    actionSeq: reader.u16(),
    actionBits: reader.u8(),
  };
  if (control.flags > 7) throw new WireError('range', 'control flags exceed three bits');
  if (control.shellSlot > 2) throw new WireError('range', 'shell slot must be 0..2');
  if (control.actionBits > 0x3f) throw new WireError('range', 'action bits exceed six bits');
  return control;
}

function readInput(reader: ByteReader): InputMessage {
  const clientTick = tickOrNone(reader.u32());
  if (clientTick === NO_TICK) throw new WireError('range', 'input tick is required');
  const snapshotAckTick = tickOrNone(reader.u32());
  const interpDelayMs = reader.u8();
  const count = reader.u8();
  if (count < 1 || count > MAX_CONTROLS_PER_INPUT) throw new WireError('too_many', `input frames carry 1..${MAX_CONTROLS_PER_INPUT} controls`);
  if (clientTick < count - 1) throw new WireError('range', 'input ticks would precede tick 0');
  const controls: ControlFrame[] = [];
  for (let index = 0; index < count; index++) controls.push(readControl(reader));
  return { type: MESSAGE_TYPE.INPUT, clientTick, snapshotAckTick, interpDelayMs, controls };
}

function readTeam(value: number): TeamId {
  if (value > 2) throw new WireError('range', `team out of range: ${value}`);
  return value as TeamId;
}

function readRoster(reader: ByteReader): RosterEntry[] {
  const count = reader.u8();
  if (count > MAX_ENTITIES) throw new WireError('too_many', 'roster exceeds MAX_ENTITIES');
  const roster: RosterEntry[] = [];
  const seen = new Set<number>();
  for (let index = 0; index < count; index++) {
    const entityId = reader.u8();
    if (entityId < 1 || entityId > MAX_ENTITIES || seen.has(entityId)) {
      throw new WireError('invalid_message', `roster entity id invalid or duplicated: ${entityId}`);
    }
    seen.add(entityId);
    const seat = reader.u8();
    if (seat !== NO_SEAT && seat >= MAX_SEATS) throw new WireError('range', 'roster seat out of range');
    const team = readTeam(reader.u8());
    const flags = reader.u8();
    if (flags > 3) throw new WireError('range', 'roster flags out of range');
    roster.push({
      entityId, seat, team, bot: (flags & 1) !== 0, connected: (flags & 2) !== 0,
      playerId: reader.string(MAX_ID_BYTES), name: reader.string(MAX_NAME_BYTES), specId: reader.string(MAX_ID_BYTES),
    });
  }
  return roster;
}

function readWelcome(reader: ByteReader): WelcomeMessage {
  const protocolVersion = reader.u16();
  const tickHz = reader.u8();
  const snapshotHz = reader.u8();
  if (tickHz < 1 || snapshotHz < 1 || snapshotHz > tickHz || tickHz % snapshotHz !== 0) {
    throw new WireError('range', 'snapshot rate must divide the tick rate');
  }
  const seat = reader.u8();
  if (seat !== NO_SEAT && seat >= MAX_SEATS) throw new WireError('range', 'seat out of range');
  const entityId = reader.u8();
  if (entityId > MAX_ENTITIES) throw new WireError('range', 'entity id out of range');
  const team = readTeam(reader.u8());
  return {
    type: MESSAGE_TYPE.WELCOME, protocolVersion, tickHz, snapshotHz, seat, entityId, team,
    serverTick: tickOrNone(reader.u32()), serverTimeMs: reader.u32(), seed: reader.u32(), capabilities: reader.u32(),
    roomId: reader.string(MAX_ID_BYTES), mapId: reader.string(MAX_ID_BYTES), mode: reader.string(MAX_ID_BYTES),
    rulesetJson: reader.string(MAX_RULESET_JSON_BYTES), roster: readRoster(reader),
  };
}

function readShell(reader: ByteReader): ShellRow {
  const shell: ShellRow = {
    id: reader.u16(), shooterEntityId: reader.u8(),
    x: reader.i32(), y: reader.i32(), z: reader.i32(),
    vx: reader.i16(), vy: reader.i16(), vz: reader.i16(),
    shellType: reader.u8(), flags: reader.u8(),
  };
  if (shell.shooterEntityId > MAX_ENTITIES) throw new WireError('range', 'shell shooter out of range');
  if (shell.shellType !== SHELL_TYPE_OTHER && shell.shellType >= SHELL_TYPE_NAMES.length) {
    throw new WireError('range', 'unknown shell type index');
  }
  if (shell.flags > 1) throw new WireError('range', 'shell flags out of range');
  return shell;
}

function readViewer(reader: ByteReader): ViewerState {
  const entityId = reader.u8();
  if (entityId < 1 || entityId > MAX_ENTITIES) throw new WireError('range', 'viewer entity out of range');
  const packedModules = reader.u16();
  const modules: number[] = [];
  for (let index = 0; index < VIEWER_MODULES.length; index++) {
    const state = (packedModules >> (index * 2)) & 3;
    if (state > 2) throw new WireError('range', 'module state out of range');
    modules.push(state);
  }
  if (packedModules >> (VIEWER_MODULES.length * 2)) throw new WireError('range', 'module bits out of range');
  const crewBits = reader.u8();
  if (crewBits > 3) throw new WireError('range', 'crew bits out of range');
  const equipment: number[] = [];
  for (let index = 0; index < VIEWER_EQUIPMENT.length; index++) equipment.push(reader.u16());
  const modeSpeedMultiplier = reader.u16();
  const modeGravityScale = reader.u16();
  const movementVersion = reader.u8();
  let movementFlags = 0;
  const movementValues: number[] = [];
  if (movementVersion !== 0) {
    movementFlags = reader.u16();
    const count = reader.u8();
    if (count > MAX_MOVEMENT_VALUES) throw new WireError('too_many', 'movement values');
    for (let index = 0; index < count; index++) movementValues.push(reader.f32());
  }
  return { entityId, modules, crewBits, equipment, modeSpeedMultiplier, modeGravityScale, movementVersion, movementFlags, movementValues };
}

function readMeta(reader: ByteReader, hasVerdict: boolean): SnapshotMeta {
  const phase = reader.u8();
  if (phase > 3) throw new WireError('range', 'phase out of range');
  const countdownMs = reader.u16();
  const battleTimeMs = reader.u32();
  const verdict = reader.u8();
  if (verdict > 3) throw new WireError('range', 'verdict out of range');
  if (hasVerdict !== (verdict !== 0)) throw new WireError('invalid_message', 'verdict flag disagrees with verdict');
  const verdictReason = hasVerdict ? reader.string(MAX_REASON_BYTES) : '';
  return { phase: phase as PhaseId, countdownMs, battleTimeMs, verdict: verdict as VerdictId, verdictReason, destructibleRevision: reader.u32() };
}

function readSnapshot(reader: ByteReader, resolveBaseline: (tick: number) => SnapshotFrame | null): SnapshotPacket {
  const tick = tickOrNone(reader.u32());
  if (tick === NO_TICK) throw new WireError('range', 'snapshot tick is required');
  const serverTimeMs = reader.u32();
  const flags = reader.u8();
  if (flags > 15) throw new WireError('range', 'snapshot flags out of range');
  const keyframe = (flags & SNAPSHOT_FLAGS.KEYFRAME) !== 0;
  const baseTick = tickOrNone(reader.u32());
  if (keyframe !== (baseTick === NO_TICK)) throw new WireError('invalid_message', 'keyframe flag disagrees with base tick');
  if (!keyframe && baseTick >= tick) throw new WireError('range', 'baseline must precede the snapshot');
  const ackedInputTick = tickOrNone(reader.u32());
  const ackedFireSeq = reader.u16();
  const ackedActionSeq = reader.u16();
  const inputMarginTicks = reader.i8();
  const meta = readMeta(reader, (flags & SNAPSHOT_FLAGS.HAS_VERDICT) !== 0);
  const destroyed = readIndexList(reader, MAX_DESTROYED_PER_SNAPSHOT);
  const baseline = keyframe ? null : resolveBaseline(baseTick);
  const baseRows = baseline ? new Map(baseline.entities.map((row) => [row.entityId, row])) : null;
  const entityCount = reader.u8();
  if (entityCount > MAX_ENTITIES) throw new WireError('too_many', 'snapshot entity rows');
  const entities: EntityRowPatch[] = [];
  const seen = new Set<number>();
  for (let index = 0; index < entityCount; index++) {
    const patch = readEntityRowPatch(reader, (entityId) => baseRows?.get(entityId) ?? null);
    if (seen.has(patch.entityId)) throw new WireError('invalid_message', `duplicate entity row ${patch.entityId}`);
    seen.add(patch.entityId);
    entities.push(patch);
  }
  const removedCount = reader.u8();
  if (removedCount > MAX_ENTITIES) throw new WireError('too_many', 'snapshot removals');
  const removed: number[] = [];
  for (let index = 0; index < removedCount; index++) {
    const entityId = reader.u8();
    if (entityId < 1 || entityId > MAX_ENTITIES) throw new WireError('range', 'removed entity id out of range');
    removed.push(entityId);
  }
  const shellCount = reader.u16();
  if (shellCount > MAX_SHELLS) throw new WireError('too_many', 'snapshot shells');
  const shells: ShellRow[] = [];
  for (let index = 0; index < shellCount; index++) shells.push(readShell(reader));
  const viewer = flags & SNAPSHOT_FLAGS.HAS_VIEWER ? readViewer(reader) : null;
  const modeStateJson = flags & SNAPSHOT_FLAGS.HAS_MODE_STATE ? reader.string(MAX_MODE_STATE_JSON_BYTES) : null;
  return {
    type: MESSAGE_TYPE.SNAPSHOT, tick, serverTimeMs, keyframe, baseTick, ackedInputTick, ackedFireSeq, ackedActionSeq,
    inputMarginTicks, meta, destroyed, entities, removed, shells, viewer, modeStateJson,
  };
}

function readEvents(reader: ByteReader): EventMessage {
  const tick = tickOrNone(reader.u32());
  const count = reader.u8();
  if (count > MAX_EVENTS_PER_MESSAGE) throw new WireError('too_many', 'events per message');
  const events: WireEvent[] = [];
  for (let index = 0; index < count; index++) {
    const kindIndex = reader.u8();
    let kind: string;
    if (kindIndex === EVENT_KIND_OTHER) kind = reader.string(MAX_ID_BYTES);
    else if (kindIndex < EVENT_KIND_NAMES.length) kind = EVENT_KIND_NAMES[kindIndex]!;
    else throw new WireError('range', `event kind out of range: ${kindIndex}`);
    const json = reader.string(MAX_EVENT_JSON_BYTES);
    let payload: unknown;
    try { payload = JSON.parse(json); } catch { throw new WireError('bad_json', 'event payload is not JSON'); }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new WireError('bad_json', 'event payload must be a JSON object');
    }
    events.push({ kind, payload: payload as Record<string, unknown> });
  }
  return { type: MESSAGE_TYPE.EVENT, tick, events };
}

export interface DecodeOptions {
  /** Upper bound for the frame (default MAX_MESSAGE_BYTES). */
  maxBytes?: number;
  /** Baseline lookup for delta snapshots (relative groups need the acked rows). */
  resolveBaseline?: (tick: number) => SnapshotFrame | null;
}

/** Decode one frame. Never throws. */
export function decodeMessage(input: unknown, options: DecodeOptions = {}): DecodeResult {
  const bytes = toUint8Array(input);
  if (!bytes) return { ok: false, error: new WireError('invalid_message', 'frame must be binary'), bytes: 0 };
  const maxBytes = options.maxBytes ?? MAX_MESSAGE_BYTES;
  try {
    if (bytes.byteLength > maxBytes) throw new WireError('bad_length', `frame exceeds ${maxBytes} bytes`);
    const reader = new ByteReader(bytes);
    const version = reader.u8();
    if (version !== WIRE_VERSION) throw new WireError('bad_version', `wire version ${version} (expected ${WIRE_VERSION})`);
    const type = reader.u8();
    let message: WireMessage;
    switch (type) {
      case MESSAGE_TYPE.HELLO: message = readHello(reader); break;
      case MESSAGE_TYPE.INPUT: message = readInput(reader); break;
      case MESSAGE_TYPE.SNAPSHOT_ACK:
        // NO_TICK is a keyframe request: the viewer holds no baseline
        message = { type: MESSAGE_TYPE.SNAPSHOT_ACK, tick: tickOrNone(reader.u32()) } satisfies SnapshotAckMessage;
        break;
      case MESSAGE_TYPE.PING:
        message = { type: MESSAGE_TYPE.PING, clientTimeMs: reader.u32(), snapshotAckTick: tickOrNone(reader.u32()) } satisfies PingMessage;
        break;
      case MESSAGE_TYPE.CHAT: message = { type: MESSAGE_TYPE.CHAT, text: reader.string(MAX_CHAT_BYTES) } satisfies ChatMessage; break;
      case MESSAGE_TYPE.LEAVE: message = { type: MESSAGE_TYPE.LEAVE, reason: reason(reader.u8()) } satisfies LeaveMessage; break;
      case MESSAGE_TYPE.WELCOME: message = readWelcome(reader); break;
      case MESSAGE_TYPE.SNAPSHOT: message = readSnapshot(reader, options.resolveBaseline ?? (() => null)); break;
      case MESSAGE_TYPE.EVENT: message = readEvents(reader); break;
      case MESSAGE_TYPE.PONG:
        message = {
          type: MESSAGE_TYPE.PONG, clientTimeMs: reader.u32(), serverTimeMs: reader.u32(), serverTick: tickOrNone(reader.u32()),
        } satisfies PongMessage;
        break;
      case MESSAGE_TYPE.CLOSE:
        message = { type: MESSAGE_TYPE.CLOSE, reason: reason(reader.u8()), detail: reader.string(MAX_DETAIL_BYTES) } satisfies CloseMessage;
        break;
      case MESSAGE_TYPE.ERROR:
        message = { type: MESSAGE_TYPE.ERROR, reason: reason(reader.u8()), detail: reader.string(MAX_DETAIL_BYTES) } satisfies ErrorMessage;
        break;
      default:
        throw new WireError('unknown_type', `unknown message type ${type}`);
    }
    reader.finish();
    return { ok: true, message, bytes: bytes.byteLength };
  } catch (caught) {
    const error = caught instanceof WireError ? caught
      : new WireError('internal', caught instanceof Error ? caught.message : 'decoder failure');
    return { ok: false, error, bytes: bytes.byteLength };
  }
}

/** Peek the message type of a frame without decoding it (null when unreadable). */
export function peekMessageType(input: unknown): number | null {
  const bytes = toUint8Array(input);
  if (!bytes || bytes.byteLength < 2 || bytes[0] !== WIRE_VERSION) return null;
  return bytes[1]!;
}

// ---------------------------------------------------------------- snapshots

function frameRowMap(frame: SnapshotFrame | null): Map<number, EntityRow> {
  return new Map((frame?.entities ?? []).map((row) => [row.entityId, row]));
}

function destroyedAdditions(base: readonly number[], next: readonly number[]): number[] {
  const known = new Set(base);
  return next.filter((index) => !known.has(index));
}

/**
 * Build the wire packet for `frame` against the viewer's acknowledged
 * baseline (null = keyframe). Every row that differs, every hidden entity and
 * every newly destroyed obstacle is expressed relative to that baseline.
 */
export function buildSnapshotPacket(frame: SnapshotFrame, baseline: SnapshotFrame | null): SnapshotPacket {
  const baseRows = frameRowMap(baseline);
  const entities: EntityRowPatch[] = [];
  const present = new Set<number>();
  for (const row of frame.entities) {
    present.add(row.entityId);
    const base = baseRows.get(row.entityId) ?? null;
    const patch = diffEntityRow(row, base);
    if (!base || patch.mask !== 0) entities.push(patch);
  }
  const removed = baseline ? baseline.entities.filter((row) => !present.has(row.entityId)).map((row) => row.entityId) : [];
  return {
    type: MESSAGE_TYPE.SNAPSHOT,
    tick: frame.tick,
    serverTimeMs: frame.serverTimeMs,
    keyframe: !baseline,
    baseTick: baseline ? baseline.tick : NO_TICK,
    ackedInputTick: frame.ackedInputTick,
    ackedFireSeq: frame.ackedFireSeq,
    ackedActionSeq: frame.ackedActionSeq,
    inputMarginTicks: frame.inputMarginTicks,
    meta: frame.meta,
    destroyed: baseline ? destroyedAdditions(baseline.destroyed, frame.destroyed) : frame.destroyed.slice(),
    entities,
    removed,
    shells: frame.shells,
    viewer: frame.viewer,
    modeStateJson: frame.modeStateJson,
  };
}

/** Resolve a packet into a full frame (throws WireError('missing_baseline') for an unknown delta base). */
export function applySnapshotPacket(packet: SnapshotPacket, baseline: SnapshotFrame | null): SnapshotFrame {
  if (!packet.keyframe && (!baseline || baseline.tick !== packet.baseTick)) {
    throw new WireError('missing_baseline', `delta snapshot ${packet.tick} needs baseline ${packet.baseTick}`);
  }
  const base = packet.keyframe ? null : baseline;
  const rows = frameRowMap(base);
  const removed = new Set(packet.removed);
  const entities: EntityRow[] = [];
  const patched = new Set<number>();
  for (const patch of packet.entities) {
    patched.add(patch.entityId);
    entities.push(applyEntityRowPatch(patch, rows.get(patch.entityId) ?? null));
  }
  if (base) {
    for (const row of base.entities) {
      if (!patched.has(row.entityId) && !removed.has(row.entityId)) entities.push(row);
    }
  }
  entities.sort((a, b) => a.entityId - b.entityId);
  const destroyed = base
    ? [...new Set([...base.destroyed, ...packet.destroyed])].sort((a, b) => a - b)
    : packet.destroyed.slice();
  return {
    tick: packet.tick,
    serverTimeMs: packet.serverTimeMs,
    ackedInputTick: packet.ackedInputTick,
    ackedFireSeq: packet.ackedFireSeq,
    ackedActionSeq: packet.ackedActionSeq,
    inputMarginTicks: packet.inputMarginTicks,
    meta: packet.meta,
    destroyed,
    entities,
    shells: packet.shells,
    viewer: packet.viewer,
    modeStateJson: packet.modeStateJson,
  };
}

/** Shell type name for a ShellRow.shellType. */
export function shellTypeName(index: number): string {
  return index === SHELL_TYPE_OTHER ? 'OTHER' : (SHELL_TYPE_NAMES[index] ?? 'OTHER');
}

export function shellTypeIndex(name: string): number {
  return SHELL_TYPE_INDEX.get(name) ?? SHELL_TYPE_OTHER;
}

/** Sanity helper for producers: the encoded byte length of a string field. */
export function encodedStringBytes(text: string): number {
  return utf8ByteLength(text);
}

export function noEntity(): number { return NO_ENTITY; }

export function unknownInputMargin(): number { return INPUT_MARGIN_UNKNOWN; }
