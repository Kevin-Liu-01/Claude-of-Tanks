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
  'openingRouteJobs', 'ruleset', 'combatRng']);

interface TraceHull {
  id: string;
  state: { pos: { x: number; y: number; z: number }; yaw: number; speed: number; turretYaw: number; gunPitch: number } | null;
  combat: { hp: number; destroyed?: boolean } | null;
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

export interface ReplayTraceExport {
  ids: string[];
  /** Every step's numbers, step 1 first, as little-endian Float64 in base64. */
  rows: string;
  /** Deep dumps keyed by the step they were taken after ('0' is before step 1). */
  snapshots: Record<string, unknown>;
}

const isHull = (value: object): value is { id: string } => typeof (value as { id?: unknown }).id === 'string'
  && 'specId' in value && 'state' in value;

/** A JSON-safe dump of `value`: bounded, cycle-free, another hull by its id, non-finite numbers as strings. */
export function dumpValue(value: unknown, depth = DUMP_DEPTH, ancestors: object[] = []): unknown {
  if (value === null || value === undefined) return null;
  // -0 and the non-finite as JSON cannot carry them (a page's dump arrives as JSON; a replay's is compared in memory)
  if (typeof value === 'number') return Object.is(value, -0) ? '-0' : Number.isFinite(value) ? value : String(value);
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value !== 'object') return undefined;
  if (ancestors.includes(value)) return '[cycle]';
  if (ancestors.length && isHull(value)) return { hull: value.id };
  if (depth <= 0) return '[deep]';
  const next = [...ancestors, value];
  if (value instanceof Map) return { map: [...value].slice(0, DUMP_ITEMS).map(([k, v]) => [String(k), dumpValue(v, depth - 1, next)]), size: value.size };
  if (value instanceof Set) return { set: [...value].slice(0, DUMP_ITEMS).map((v) => dumpValue(v, depth - 1, next)), size: value.size };
  if (ArrayBuffer.isView(value)) {
    const items = value as unknown as ArrayLike<number>;
    return { typed: Array.from(items).slice(0, DUMP_ITEMS).map((v) => dumpValue(v)), length: items.length };
  }
  if (Array.isArray(value)) return { items: value.slice(0, DUMP_ITEMS).map((v) => dumpValue(v, depth - 1, next)), length: value.length };
  const out: Record<string, unknown> = {};
  let keys = 0;
  for (const key of Object.keys(value)) {
    if (SKIP_KEYS.has(key)) continue;
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
  const snapshots: Record<string, unknown> = {};
  const push = (value: number) => {
    if (used === rows.length) { const grown = new Float64Array(Math.max(4096, rows.length * 2)); grown.set(rows); rows = grown; }
    rows[used++] = value;
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
      if (game.tick <= SNAPSHOT_UNTIL && (game.tick === 1 || game.tick % SNAPSHOT_EVERY === 0)) snapshots[String(game.tick)] = snapshotBattle(game);
    },
    export() {
      const bytes = new Uint8Array(rows.buffer, 0, used * 8);
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return { ids, rows: btoa(binary), snapshots };
    },
  };
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
