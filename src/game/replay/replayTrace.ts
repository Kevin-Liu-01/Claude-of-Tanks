/**
 * The replay's divergence trace (replay-system-275, docs/REPLAY.md §4): a diagnostic, off unless asked for
 * (`recorder.trace = true` before a battle's setup; tools/replay-browser-check.mjs sets it on its trace arm). A battle
 * recorded with it also keeps every step's digest numbers per hull, and a deep dump of the battle's state before step 1
 * and every SNAPSHOT_EVERY steps up to SNAPSHOT_UNTIL. tools/replay-diff.mjs replays the recording in Node with the same
 * trace and names the first step, hull and field where the replay leaves the page, and every dumped path that differs
 * before it: the checksums say only that a replay drifted, this says where and in what.
 *
 * Node-runnable; the dump is generic (no field list to keep in step with the hull's shape), bounded in depth and size,
 * and names another hull by its id instead of walking into it.
 */

export const SNAPSHOT_EVERY = 60;
export const SNAPSHOT_UNTIL = 600;
const DUMP_DEPTH = 5;
const DUMP_KEYS = 160;
const DUMP_ITEMS = 48;
/** Keys a dump never walks: render objects, static tables, the world, and the battle's own indexes of hulls. */
const SKIP_KEYS = new Set(['visual', 'root', 'scene', 'mesh', 'parent', 'children', 'spec', 'world', 'heightField', 'allTanks', 'tanks',
  'tankById', 'player', 'spotting', 'jev', '_jevView', '_obstacleQuery', '_obstacleWorld', '_supportField', 'matchModeController',
  'openingRouteJobs', 'ruleset', 'combatRng', '_engineCtx', '_battleVisualPool']);
/** Render objects a page's battle may hold (three.js marks each with one of these). */
const RENDER_MARKS = ['isObject3D', 'isWebGLRenderer', 'isMaterial', 'isTexture', 'isBufferGeometry', 'isRenderTarget'];

interface TraceHull {
  id: string;
  state: { pos: { x: number; y: number; z: number }; yaw: number; speed: number; turretYaw: number; gunPitch: number } | null;
  combat: { hp: number; destroyed?: boolean } | null;
}

interface TraceRound {
  id: number; pos: { x: number; y: number; z: number }; vel: { x: number; y: number; z: number }; distM: number; ageS: number;
  penRollDone?: boolean; remainingPenMm?: number; freshPenRollMm?: number; dmgRoll?: number; bounces?: number;
  carriedThrough?: boolean; dead?: boolean;
}

export interface TraceGame {
  tanks: readonly TraceHull[];
  shells: readonly unknown[];
  nextShellId: number;
  timeS: number;
  tick: number;
}

/** The numbers one step keeps: the battle's three, then nine a hull (the digest's, sim/replayChecksum.ts). */
export const TRACE_GAME_FIELDS = ['timeS', 'shells', 'nextShellId'] as const;
export const TRACE_HULL_FIELDS = ['x', 'y', 'z', 'yaw', 'speed', 'turretYaw', 'gunPitch', 'hp', 'destroyed'] as const;
/**
 * (276 sim-det-trig, Main's ruling (a)) every live round's numbers after each step, so a round that parts from the page
 * is named at the step it parts, not hundreds of steps later when a grazing outcome flips (the first 5-minute Verdant
 * trace saw only a shell count at step 3077 and a checksum at 3600). One record per live round: the step, then these.
 * The pen roll's inputs are the flight (distM) and the battle's combat stream; its results remainingPenMm, freshPenRollMm
 * and dmgRoll; the outcome is the round's end (dead) and its screens and bounces on the way.
 */
export const TRACE_ROUND_FIELDS = ['step', 'id', 'x', 'y', 'z', 'vx', 'vy', 'vz', 'distM', 'ageS', 'penRollDone', 'remainingPenMm',
  'freshPenRollMm', 'dmgRoll', 'bounces', 'carriedThrough', 'dead'] as const;

export interface ReplayTraceExport {
  ids: string[];
  /** Every step's numbers, step 1 first, as little-endian Float64 in base64. */
  rows: string;
  /** Every live round's numbers after each step (TRACE_ROUND_FIELDS per record), Float64 in base64; absent in older traces. */
  rounds?: string;
  /** Deep dumps keyed by the step they were taken after ('0' is before step 1). */
  snapshots: Record<string, unknown>;
}

const isHull = (value: object): value is { id: string } => typeof (value as { id?: unknown }).id === 'string'
  && 'specId' in value && 'state' in value;

function firstItems<T>(iterator: IterableIterator<T>, map: (item: T) => unknown): unknown[] {
  const out: unknown[] = [];
  for (const item of iterator) { if (out.length >= DUMP_ITEMS) break; out.push(map(item)); }
  return out;
}

/** A JSON-safe dump of `value`: bounded, cycle-free, another hull by its id, non-finite numbers as strings. */
export function dumpValue(value: unknown, depth = DUMP_DEPTH, ancestors: object[] = []): unknown {
  if (value === null || value === undefined) return null;
  // -0 and the non-finite as JSON cannot carry them (a page's dump arrives as JSON; a replay's is compared in memory)
  if (typeof value === 'number') return Object.is(value, -0) ? '-0' : Number.isFinite(value) ? value : String(value);
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value !== 'object') return undefined;
  if (ancestors.includes(value)) return '[cycle]';
  if (ancestors.length && isHull(value)) return { hull: value.id };
  if (RENDER_MARKS.some((mark) => (value as Record<string, unknown>)[mark] === true)) return '[render]';
  if (depth <= 0) return '[deep]';
  const next = [...ancestors, value];
  // the first DUMP_ITEMS only, read in place: a battle holds grids of millions of cells, and copying one whole to keep 48
  // (Array.from, a spread) allocated hundreds of MB a dump
  if (value instanceof Map) return { map: firstItems(value.entries(), ([k, v]) => [String(k), dumpValue(v, depth - 1, next)]), size: value.size };
  if (value instanceof Set) return { set: firstItems(value.values(), (v) => dumpValue(v, depth - 1, next)), size: value.size };
  if (ArrayBuffer.isView(value)) {
    const items = value as unknown as ArrayLike<number>;
    const typed: unknown[] = [];
    for (let i = 0; i < Math.min(items.length ?? 0, DUMP_ITEMS); i++) typed.push(dumpValue(items[i]));
    return { typed, length: items.length };
  }
  if (Array.isArray(value)) {
    const items: unknown[] = [];
    for (let i = 0; i < Math.min(value.length, DUMP_ITEMS); i++) items.push(dumpValue(value[i], depth - 1, next));
    return { items, length: value.length };
  }
  const out: Record<string, unknown> = {};
  let keys = 0;
  // (for-in, not Object.keys: a dictionary of a million keys is not listed whole to keep DUMP_KEYS)
  for (const key in value) {
    if (!Object.hasOwn(value, key) || SKIP_KEYS.has(key)) continue;
    const dumped = dumpValue((value as Record<string, unknown>)[key], depth - 1, next);
    if (dumped === undefined) continue;
    out[key] = dumped;
    if (++keys >= DUMP_KEYS) { out['…'] = 'truncated'; break; }
  }
  return out;
}

/** The battle's state as a dump: its own fields, then each fielded hull's. */
export function snapshotBattle(game: TraceGame): unknown {
  return { game: dumpValue(game), hulls: Object.fromEntries(game.tanks.map((hull) => [hull.id, dumpValue(hull)])) };
}

export interface ReplayTrace {
  /** After setup and the actions before step 1: the dump keyed '0'. */
  begin(game: TraceGame): void;
  /** After each step: its numbers, and a dump on the snapshot steps. */
  afterStep(game: TraceGame): void;
  export(): ReplayTraceExport;
}

export function createReplayTrace(): ReplayTrace {
  let ids: string[] = [];
  let rows = new Float64Array(0);
  let used = 0;
  let rounds = new Float64Array(0);
  let roundsUsed = 0;
  const snapshots: Record<string, unknown> = {};
  const push = (value: number) => {
    if (used === rows.length) { const grown = new Float64Array(Math.max(4096, rows.length * 2)); grown.set(rows); rows = grown; }
    rows[used++] = value;
  };
  const pushRound = (value: number | boolean | undefined) => {
    if (roundsUsed === rounds.length) { const grown = new Float64Array(Math.max(4096, rounds.length * 2)); grown.set(rounds); rounds = grown; }
    rounds[roundsUsed++] = typeof value === 'boolean' ? (value ? 1 : 0) : value ?? Number.NaN;
  };
  const toBase64 = (values: Float64Array, count: number) => {
    const bytes = new Uint8Array(values.buffer, 0, count * 8);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  };
  return {
    begin(game) {
      ids = game.tanks.map((hull) => hull.id);
      snapshots['0'] = snapshotBattle(game);
    },
    afterStep(game) {
      push(game.timeS); push(game.shells.length); push(game.nextShellId);
      for (const hull of game.tanks) {
        const s = hull.state, c = hull.combat;
        if (!s || !c) { for (let i = 0; i < TRACE_HULL_FIELDS.length; i++) push(Number.NaN); continue; }
        push(s.pos.x); push(s.pos.y); push(s.pos.z); push(s.yaw); push(s.speed); push(s.turretYaw); push(s.gunPitch); push(c.hp);
        push(c.destroyed ? 1 : 0);
      }
      for (const shell of game.shells as readonly TraceRound[]) {
        pushRound(game.tick); pushRound(shell.id);
        pushRound(shell.pos.x); pushRound(shell.pos.y); pushRound(shell.pos.z); pushRound(shell.vel.x); pushRound(shell.vel.y); pushRound(shell.vel.z);
        pushRound(shell.distM); pushRound(shell.ageS); pushRound(shell.penRollDone); pushRound(shell.remainingPenMm); pushRound(shell.freshPenRollMm);
        pushRound(shell.dmgRoll); pushRound(shell.bounces); pushRound(shell.carriedThrough); pushRound(shell.dead);
      }
      if (game.tick <= SNAPSHOT_UNTIL && (game.tick === 1 || game.tick % SNAPSHOT_EVERY === 0)) snapshots[String(game.tick)] = snapshotBattle(game);
    },
    export() {
      return { ids, rows: toBase64(rows, used), rounds: toBase64(rounds, roundsUsed), snapshots };
    },
  };
}

/** The live rounds of an export as numbers (TRACE_ROUND_FIELDS per record; empty for a trace that predates them). */
export function traceRounds(trace: ReplayTraceExport): Float64Array {
  return trace.rounds ? traceRows({ ...trace, rows: trace.rounds }) : new Float64Array(0);
}

/**
 * The first round that differs between two traces' round streams, step by step: a round only one side has, or the first
 * field that differs (Object.is, so NaN for an absent field matches NaN). Null when every compared step agrees.
 */
export function firstRoundDifference(page: Float64Array, replay: Float64Array, untilStep = Infinity): string | null {
  const width = TRACE_ROUND_FIELDS.length;
  const byStep = (values: Float64Array) => {
    const out = new Map<number, Map<number, Float64Array>>();
    for (let at = 0; at + width <= values.length; at += width) {
      const step = values[at]!, id = values[at + 1]!;
      if (step > untilStep) break;
      let rounds = out.get(step);
      if (!rounds) out.set(step, rounds = new Map());
      rounds.set(id, values.subarray(at, at + width));
    }
    return out;
  };
  const a = byStep(page), b = byStep(replay);
  const steps = [...new Set([...a.keys(), ...b.keys()])].sort((x, y) => x - y);
  for (const step of steps) {
    const ra = a.get(step) ?? new Map(), rb = b.get(step) ?? new Map();
    for (const id of [...new Set([...ra.keys(), ...rb.keys()])].sort((x, y) => x - y)) {
      const x = ra.get(id), y = rb.get(id);
      if (!x || !y) return `after step ${step}: round ${id} is only on the ${x ? 'page' : 'replay'}`;
      const fields: string[] = [];
      for (let i = 2; i < width; i++) if (!Object.is(x[i], y[i])) fields.push(`${TRACE_ROUND_FIELDS[i]} page ${x[i]} replay ${y[i]} (Δ ${y[i]! - x[i]!})`);
      if (fields.length) return `after step ${step}: round ${id}: ${fields.join('; ')}`;
    }
  }
  return null;
}

/** The rows of an export as numbers. */
export function traceRows(trace: ReplayTraceExport): Float64Array {
  const binary = atob(trace.rows);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Float64Array(bytes.buffer);
}

/** Every path where two dumps differ, up to `limit`. */
export function diffDumps(a: unknown, b: unknown, limit = 200, at = '', out: string[] = []): string[] {
  if (out.length >= limit) return out;
  if (Object.is(a, b)) return out;
  const objA = a && typeof a === 'object', objB = b && typeof b === 'object';
  if (!objA || !objB) { out.push(`${at || '.'}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`); return out; }
  const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
  for (const key of keys) diffDumps((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], limit, `${at}.${key}`, out);
  return out;
}
