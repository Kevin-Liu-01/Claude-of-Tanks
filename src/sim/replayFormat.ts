/**
 * The battle recording's bytes (replay-system-275, docs/REPLAY.md §1). Pure data, no driver: the local driver's recorder
 * writes it, the replayer and tools/replay-verify.mjs read it; the online host's recorder (P5) will too.
 *
 * Layout (before the outer gzip a save adds): "COTR", u8 FORMAT_VERSION, then sections, each `u8 id, varint length,
 * bytes`: HEADER (JSON), SEATS (binary, below), ACTIONS (JSON), EVENTS (JSON), CHECKSUMS (JSON), END (JSON). Unknown
 * section ids are skipped, so a later format can add one without breaking a reader of this one.
 *
 * SEATS: for every recorded step, for every seat in the header's order, a varint change mask over SEAT_CONTROL_FIELDS
 * then each changed field as a zigzag varint of its delta from the seat's previous value (all start at zero). A step
 * where nothing changed costs one byte per seat. A replay reads the steps in order; step k is the k-th fixed step.
 */
import { SEAT_CONTROL_FIELDS, createSeatControl, type SeatControl } from './seatControl.ts';
import type { RuntimeValue } from '../runtimeTypes.ts';

export const REPLAY_MAGIC = 'COTR';
export const REPLAY_FORMAT_VERSION = 1;
/** The checksum cadence in steps (10 s). */
export const REPLAY_CHECKSUM_EVERY = 600;

const SECTION = { HEADER: 1, SEATS: 2, ACTIONS: 3, EVENTS: 4, CHECKSUMS: 5, END: 6 } as const;

/** A hull as the recording seated it (verification and the viewer's roster; the setup fields rebuild the battle). */
export interface ReplayRosterEntry {
  id: string;
  specId: string;
  team: string;
  bot: boolean;
}

export interface ReplayHeader {
  format: number;
  /** The build line (wire/matchBuild.ts MATCH_BUILD) and the replay digest of the sim that recorded it. */
  build: string;
  replayDigest: string;
  driver: 'local' | 'authority';
  recordedAtMs: number;
  /** Everything the driver's battle setup reads; for the local driver, game/replay/replaySetup.ts. */
  setup: Record<string, RuntimeValue>;
  roster: ReplayRosterEntry[];
  /** The hull ids whose controls the SEATS section carries, in its order. */
  seats: string[];
}

/** A seat's discrete action the step does not read from its controls (game/replay/seatActions.ts), before step `tick`;
 *  seat -1 is the battle's own (a footprint, or game/replay/battleActions.ts: a training cue, the proving ground's reset). */
export interface ReplayAction {
  tick: number;
  seat: number;
  kind: string;
  args: number[];
  /** A battle action's name argument: a training cue's actor key. */
  key?: string;
}

/** One timeline mark: [tick, type, subject id, actor id or '', x, z]. */
export type ReplayEventMark = [tick: number, type: string, subject: string, actor: string, x: number, z: number];

export interface ReplayEnd {
  ticks: number;
  result: string | null;
  reason: string | null;
  /** Set when a debug intervention wrote sim state: the recording replays only up to this step. */
  stagedAtTick: number | null;
}

export interface ReplayRecording {
  header: ReplayHeader;
  /** Per step, per seat, the controls; `seatSteps[k][s]` is step k+1's control for seat s. */
  seatSteps: SeatControl[][];
  actions: ReplayAction[];
  events: ReplayEventMark[];
  checksums: Array<[tick: number, digest: string]>;
  end: ReplayEnd;
}

class ByteWriter {
  private buf = new Uint8Array(1 << 14);
  length = 0;
  private ensure(extra: number): void {
    if (this.length + extra <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.length + extra) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.length));
    this.buf = next;
  }
  u8(value: number): void { this.ensure(1); this.buf[this.length++] = value & 255; }
  varint(value: number): void {
    let rest = value >>> 0 === value ? value : Math.max(0, Math.floor(value));
    this.ensure(8);
    while (rest >= 128) { this.buf[this.length++] = (rest % 128) | 128; rest = Math.floor(rest / 128); }
    this.buf[this.length++] = rest;
  }
  zigzag(value: number): void { this.varint(value < 0 ? -value * 2 - 1 : value * 2); }
  bytes(data: Uint8Array): void { this.ensure(data.length); this.buf.set(data, this.length); this.length += data.length; }
  take(): Uint8Array { return this.buf.slice(0, this.length); }
  reset(): void { this.length = 0; }
}

class ByteReader {
  offset = 0;
  private readonly buf: Uint8Array;
  constructor(buf: Uint8Array) { this.buf = buf; }
  get done(): boolean { return this.offset >= this.buf.length; }
  u8(): number {
    if (this.offset >= this.buf.length) throw new RangeError('replay: truncated');
    return this.buf[this.offset++]!;
  }
  varint(): number {
    let value = 0, scale = 1, byte: number;
    do { byte = this.u8(); value += (byte & 127) * scale; scale *= 128; } while (byte & 128);
    return value;
  }
  zigzag(): number { const v = this.varint(); return v % 2 ? -(v + 1) / 2 : v / 2; }
  bytes(length: number): Uint8Array {
    if (this.offset + length > this.buf.length) throw new RangeError('replay: truncated');
    const out = this.buf.subarray(this.offset, this.offset + length);
    this.offset += length;
    return out;
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** The SEATS section, written a step at a time (the recorder's hot path: no allocation once warm). */
export class SeatStreamWriter {
  private readonly writer = new ByteWriter();
  private readonly previous: SeatControl[];
  steps = 0;
  constructor(seatCount: number) {
    this.previous = Array.from({ length: seatCount }, createSeatControl);
  }
  /** One step's controls, one per seat in header order. */
  writeStep(controls: readonly SeatControl[]): void {
    for (let seat = 0; seat < this.previous.length; seat++) {
      const control = controls[seat]!, prev = this.previous[seat]!;
      let mask = 0;
      for (let f = 0; f < SEAT_CONTROL_FIELDS.length; f++) {
        const key = SEAT_CONTROL_FIELDS[f]!;
        if (control[key] !== prev[key]) mask |= 1 << f;
      }
      this.writer.varint(mask);
      for (let f = 0; f < SEAT_CONTROL_FIELDS.length; f++) {
        if (!(mask & (1 << f))) continue;
        const key = SEAT_CONTROL_FIELDS[f]!;
        this.writer.zigzag(control[key] - prev[key]);
        prev[key] = control[key];
      }
    }
    this.steps++;
  }
  get byteLength(): number { return this.writer.length; }
  take(): Uint8Array { return this.writer.take(); }
}

function readSeatSteps(bytes: Uint8Array, seatCount: number): SeatControl[][] {
  const reader = new ByteReader(bytes);
  const current = Array.from({ length: seatCount }, createSeatControl);
  const steps: SeatControl[][] = [];
  while (!reader.done) {
    const row: SeatControl[] = [];
    for (let seat = 0; seat < seatCount; seat++) {
      const mask = reader.varint(), control = current[seat]!;
      for (let f = 0; f < SEAT_CONTROL_FIELDS.length; f++) {
        if (mask & (1 << f)) control[SEAT_CONTROL_FIELDS[f]!] += reader.zigzag();
      }
      row.push({ ...control });
    }
    steps.push(row);
  }
  return steps;
}

function writeSection(writer: ByteWriter, id: number, data: Uint8Array): void {
  writer.u8(id);
  writer.varint(data.length);
  writer.bytes(data);
}

const json = (value: unknown): Uint8Array => encoder.encode(JSON.stringify(value));

/** The whole recording's bytes (uncompressed). */
export function encodeReplay(parts: Omit<ReplayRecording, 'seatSteps'> & { seats: Uint8Array }): Uint8Array {
  const writer = new ByteWriter();
  writer.bytes(encoder.encode(REPLAY_MAGIC));
  writer.u8(REPLAY_FORMAT_VERSION);
  writeSection(writer, SECTION.HEADER, json(parts.header));
  writeSection(writer, SECTION.SEATS, parts.seats);
  writeSection(writer, SECTION.ACTIONS, json(parts.actions));
  writeSection(writer, SECTION.EVENTS, json(parts.events));
  writeSection(writer, SECTION.CHECKSUMS, json(parts.checksums));
  writeSection(writer, SECTION.END, json(parts.end));
  return writer.take();
}

export class ReplayFormatError extends Error {
  readonly code: 'not_a_replay' | 'format_version' | 'truncated' | 'missing_section';
  constructor(code: ReplayFormatError['code'], message: string) {
    super(message);
    this.code = code;
    this.name = 'ReplayFormatError';
  }
}

/** A recording from its bytes (uncompressed). Throws ReplayFormatError for anything that is not a whole recording. */
export function decodeReplay(bytes: Uint8Array): ReplayRecording {
  if (bytes.length < 5 || decoder.decode(bytes.subarray(0, 4)) !== REPLAY_MAGIC) {
    throw new ReplayFormatError('not_a_replay', 'not a Claude of Tanks replay');
  }
  const version = bytes[4]!;
  if (version !== REPLAY_FORMAT_VERSION) {
    throw new ReplayFormatError('format_version', `replay format ${version} (this build reads ${REPLAY_FORMAT_VERSION})`);
  }
  const reader = new ByteReader(bytes.subarray(5));
  const sections = new Map<number, Uint8Array>();
  try {
    while (!reader.done) {
      const id = reader.u8();
      sections.set(id, reader.bytes(reader.varint()));
    }
  } catch {
    throw new ReplayFormatError('truncated', 'the replay file is cut short');
  }
  const parse = <T>(id: number, name: string): T => {
    const data = sections.get(id);
    if (!data) throw new ReplayFormatError('missing_section', `the replay has no ${name}`);
    return JSON.parse(decoder.decode(data)) as T;
  };
  const header = parse<ReplayHeader>(SECTION.HEADER, 'header');
  const seats = sections.get(SECTION.SEATS);
  if (!seats) throw new ReplayFormatError('missing_section', 'the replay has no seat stream');
  return {
    header,
    seatSteps: readSeatSteps(seats, header.seats.length),
    actions: parse<ReplayAction[]>(SECTION.ACTIONS, 'actions'),
    events: parse<ReplayEventMark[]>(SECTION.EVENTS, 'event index'),
    checksums: parse<Array<[number, string]>>(SECTION.CHECKSUMS, 'checksums'),
    end: parse<ReplayEnd>(SECTION.END, 'end'),
  };
}
