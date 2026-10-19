/**
 * server/telemetryRecord.ts — the lean entry-telemetry record (schema v2,
 * docs/ENTRY-RESILIENCE.md). One module owns the wire schema, the refusals
 * and the Analytics Engine column layout, so the client receipt, the
 * Cloudflare sink (`cloudflare/telemetry`), the Vercel fallback
 * (`api/telemetry.ts`) and the report (`tools/telemetry-report.mjs`) cannot
 * drift apart.
 *
 * Three record kinds travel, each as one small `text/plain` POST:
 *   `session` — once per page load: the whole boot as a timings map, the
 *               capability summary, the outcome, a folded entry result and
 *               the first error when either happened before the beacon;
 *   `entry`   — one small follow-up when a battle entry resolves after the
 *               session beacon left;
 *   `error`   — an uncaught error or a watchdog verdict, only as it happens.
 * Nothing personal is accepted: no address, agent, name, room or token —
 * a body naming such a field is refused outright, and the sink stores only
 * what this module validated.
 *
 * Runs in Node (type-stripped), in workerd and under the Vercel bundler:
 * plain TypeScript, no platform globals.
 */

export const TELEMETRY_SCHEMA_VERSION = 2;
/** The Worker refuses bodies above this many bytes; the client trims to stay well under. */
export const TELEMETRY_MAX_BODY_BYTES = 2048;
export const TELEMETRY_MAX_TIMINGS = 24;
export const TELEMETRY_MAX_NOTES = 6;
export const TELEMETRY_MAX_ERRORS = 3;

export const TELEMETRY_KINDS = Object.freeze(['session', 'entry', 'error'] as const);
export type TelemetryRecordKind = (typeof TELEMETRY_KINDS)[number];

const SESSION_OUTCOMES = new Set(['ready', 'halted', 'error', 'left']);
const ENTRY_OUTCOMES = new Set(['ok', 'failed', 'cancelled', 'timeout']);
const ERROR_OUTCOMES = new Set(['halted', 'failed', 'notice']);
const CAP_OUTCOMES = new Set(['ok', 'notice', 'halted']);
const MODES = new Set(['solo', 'private', 'lan', 'studio', 'network', 'unknown']);
const MEMORY_CLASSES = new Set(['low', 'mid', 'high', 'unknown']);
const TIERS = new Set(['mobile', 'desktop', 'unknown']);
const AUTO_TIERS = new Set(['low', 'medium', 'high', 'unknown']);
const RENDERER_FAMILIES = new Set([
  'nvidia', 'amd', 'intel', 'apple', 'arm', 'qualcomm', 'imagination', 'software', 'unknown',
]);

/** Field names that would carry personal data; a body naming one anywhere is refused. */
const PII_FIELDS = new Set([
  'ip', 'ipaddress', 'ua', 'useragent', 'name', 'playername', 'player', 'email',
  'room', 'roomcode', 'host', 'hostname', 'cookie', 'token', 'sessiontoken', 'auth',
  'password', 'phone', 'address',
]);

const ID_RE = /^[A-Za-z0-9_-]{8,40}$/;
const BUILD_RE = /^[A-Za-z0-9+._-]{1,64}$/;
const STAGE_RE = /^[A-Za-z0-9_:.>-]{1,32}$/;
const CODE_RE = /^[A-Za-z0-9_.:-]{1,48}$/;
const TIMING_KEY_RE = /^[a-z][A-Za-z0-9>_:.-]{0,31}$/;
/** The boot stages that own a fixed Analytics Engine double; gaps and extras stay in the timings blob. */
export const TELEMETRY_STAGE_SLOTS = Object.freeze([
  'imports', 'renderer', 'sky', 'lighting', 'garage', 'vehicle', 'hud', 'ui', 'audio', 'post', 'studio', 'ready',
] as const);

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

export interface TelemetryCapability {
  webgl2?: boolean;
  rendererFamily?: string;
  software?: boolean;
  maxTextureUnits?: number;
  maxTextureSize?: number;
  vertexTextureUnits?: number;
  colorBufferFloat?: boolean;
  storage?: boolean;
  worker?: boolean;
  memoryClass?: string;
  tier?: string;
  autoTier?: string;
  requiredTextureUnits?: number;
}

export interface TelemetryErrorSummary {
  message: string;
  frames: string[];
  /** The boot stage the error interrupted (session-folded errors only). */
  stage?: string;
  code?: string;
}

export interface TelemetryEntryResult {
  outcome: string;
  mode?: string;
  code?: string;
  ms?: number;
}

export interface TelemetryRecord {
  v: number;
  sid: string;
  build: string;
  kind: TelemetryRecordKind;
  outcome?: string;
  stage?: string;
  code?: string;
  mode?: string;
  ms?: number;
  /** Boot reached ready (error records). */
  ready?: boolean;
  /** Clean-session sample weight (1 = unsampled). */
  w?: number;
  t?: Record<string, number>;
  cap?: TelemetryCapability;
  capOutcome?: string;
  capCode?: string;
  entry?: TelemetryEntryResult;
  error?: TelemetryErrorSummary;
  errors?: TelemetryErrorSummary[];
  notes?: string[];
}

export type TelemetryValidation =
  | { ok: true; record: TelemetryRecord }
  | { ok: false; error: string };

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function cleanTelemetryText(value: unknown, max: number): string {
  // eslint-disable-next-line no-control-regex
  return String(value ?? '').replace(/[\x00-\x1f\x7f]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max);
}

function boundedInt(value: unknown, max = 10_000_000): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return Math.min(max, Math.round(value));
}

/** The first personal field name in the object or any nested object, else null. */
function piiField(value: unknown, depth = 0): string | null {
  if (depth > 3) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = piiField(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  for (const [key, item] of Object.entries(value)) {
    if (PII_FIELDS.has(key.toLowerCase())) return key;
    const found = piiField(item, depth + 1);
    if (found) return found;
  }
  return null;
}

function readCapability(value: unknown): TelemetryCapability | undefined {
  if (!isRecord(value)) return undefined;
  const out: TelemetryCapability = {};
  for (const key of ['webgl2', 'colorBufferFloat', 'software', 'storage', 'worker'] as const) {
    if (typeof value[key] === 'boolean') out[key] = value[key];
  }
  for (const key of ['maxTextureUnits', 'maxTextureSize', 'vertexTextureUnits', 'requiredTextureUnits'] as const) {
    const number = boundedInt(value[key], 1_000_000);
    if (number !== undefined) out[key] = number;
  }
  const family = String(value.rendererFamily || '').toLowerCase();
  if (RENDERER_FAMILIES.has(family)) out.rendererFamily = family;
  const memoryClass = String(value.memoryClass || '');
  if (MEMORY_CLASSES.has(memoryClass)) out.memoryClass = memoryClass;
  const tier = String(value.tier || '');
  if (TIERS.has(tier)) out.tier = tier;
  const autoTier = String(value.autoTier || '');
  if (AUTO_TIERS.has(autoTier)) out.autoTier = autoTier;
  return out;
}

function readError(value: unknown): TelemetryErrorSummary | undefined {
  if (!isRecord(value)) return undefined;
  const frames = Array.isArray(value.frames)
    ? value.frames.slice(0, 3).map((frame) => cleanTelemetryText(frame, 160)).filter(Boolean)
    : [];
  const out: TelemetryErrorSummary = { message: cleanTelemetryText(value.message, 200) || 'unknown', frames };
  const stage = cleanTelemetryText(value.stage, 32);
  if (stage && STAGE_RE.test(stage)) out.stage = stage;
  const code = cleanTelemetryText(value.code, 48);
  if (code && CODE_RE.test(code)) out.code = code;
  return out;
}

function readTimings(value: unknown): Record<string, number> | undefined {
  if (!isRecord(value)) return undefined;
  const out: Record<string, number> = {};
  let count = 0;
  for (const [key, item] of Object.entries(value)) {
    if (count >= TELEMETRY_MAX_TIMINGS) break;
    if (!TIMING_KEY_RE.test(key)) continue;
    const number = boundedInt(item);
    if (number === undefined) continue;
    out[key] = number;
    count += 1;
  }
  return out;
}

function readNotes(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: string[] = [];
  for (const item of value) {
    if (out.length >= TELEMETRY_MAX_NOTES) break;
    const text = cleanTelemetryText(item, 48);
    if (text && CODE_RE.test(text) && !out.includes(text)) out.push(text);
  }
  return out;
}

function readEntry(value: unknown): TelemetryEntryResult | undefined | null {
  if (!isRecord(value)) return undefined;
  const outcome = String(value.outcome || '');
  if (!ENTRY_OUTCOMES.has(outcome)) return null;
  const out: TelemetryEntryResult = { outcome };
  const mode = String(value.mode || '');
  if (mode) {
    if (!MODES.has(mode)) return null;
    out.mode = mode;
  }
  const code = cleanTelemetryText(value.code, 48);
  if (code) {
    if (!CODE_RE.test(code)) return null;
    out.code = code;
  }
  const ms = boundedInt(value.ms);
  if (ms !== undefined) out.ms = ms;
  return out;
}

/**
 * Validate one beacon body. Unknown fields are dropped, personal fields are
 * refused, enumerations must match, and every value is bounded before it is
 * stored. The `at` stamp is the server's; clients send none.
 */
export function validateTelemetryRecord(input: unknown): TelemetryValidation {
  if (!isRecord(input)) return { ok: false, error: 'invalid_body' };
  const pii = piiField(input);
  if (pii) return { ok: false, error: `pii_field:${pii}` };
  if (input.v !== TELEMETRY_SCHEMA_VERSION) return { ok: false, error: 'invalid_record:v' };
  const sid = String(input.sid || '');
  if (!ID_RE.test(sid)) return { ok: false, error: 'invalid_record:sid' };
  const build = String(input.build || '');
  if (!BUILD_RE.test(build)) return { ok: false, error: 'invalid_record:build' };
  const kind = String(input.kind || '');
  if (!(TELEMETRY_KINDS as readonly string[]).includes(kind)) return { ok: false, error: 'invalid_record:kind' };
  const record: TelemetryRecord = { v: TELEMETRY_SCHEMA_VERSION, sid, build, kind: kind as TelemetryRecordKind };

  const outcome = String(input.outcome || '');
  const outcomes = kind === 'session' ? SESSION_OUTCOMES : kind === 'entry' ? ENTRY_OUTCOMES : ERROR_OUTCOMES;
  if (kind !== 'error' || outcome) {
    if (!outcomes.has(outcome)) return { ok: false, error: 'invalid_record:outcome' };
    record.outcome = outcome;
  }
  if (input.stage !== undefined) {
    const stage = cleanTelemetryText(input.stage, 32);
    if (!STAGE_RE.test(stage)) return { ok: false, error: 'invalid_record:stage' };
    record.stage = stage;
  }
  if (input.code !== undefined) {
    const code = cleanTelemetryText(input.code, 48);
    if (!CODE_RE.test(code)) return { ok: false, error: 'invalid_record:code' };
    record.code = code;
  }
  if (input.mode !== undefined) {
    const mode = String(input.mode);
    if (!MODES.has(mode)) return { ok: false, error: 'invalid_record:mode' };
    record.mode = mode;
  }
  const ms = boundedInt(input.ms);
  if (ms !== undefined) record.ms = ms;
  if (typeof input.ready === 'boolean') record.ready = input.ready;
  const weight = boundedInt(input.w, 1_000_000);
  if (weight !== undefined && weight >= 1) record.w = weight;

  if (kind === 'session') {
    const timings = readTimings(input.t);
    if (timings) record.t = timings;
    const cap = readCapability(input.cap);
    if (cap) record.cap = cap;
    if (input.capOutcome !== undefined) {
      const capOutcome = String(input.capOutcome);
      if (!CAP_OUTCOMES.has(capOutcome)) return { ok: false, error: 'invalid_record:capOutcome' };
      record.capOutcome = capOutcome;
    }
    if (input.capCode !== undefined) {
      const capCode = cleanTelemetryText(input.capCode, 48);
      if (!CODE_RE.test(capCode)) return { ok: false, error: 'invalid_record:capCode' };
      record.capCode = capCode;
    }
    const entry = readEntry(input.entry);
    if (entry === null) return { ok: false, error: 'invalid_record:entry' };
    if (entry) record.entry = entry;
  }
  if (kind === 'error' && !isRecord(input.error)) return { ok: false, error: 'invalid_record:error' };
  const error = readError(input.error);
  if (error) record.error = error;
  if (Array.isArray(input.errors)) {
    const errors = input.errors.slice(0, TELEMETRY_MAX_ERRORS).map(readError)
      .filter((item): item is TelemetryErrorSummary => item !== undefined);
    if (errors.length) record.errors = errors;
  }
  const notes = readNotes(input.notes);
  if (notes && notes.length) record.notes = notes;
  return { ok: true, record };
}

// ---------------------------------------------------------------------------
// Analytics Engine layout (cloudflare/telemetry): one data point per record.
// Blobs are the dimensions the report groups by, doubles the measures; the
// index is the build so a runaway build is sampled before the others. Every
// column is named here once; the SQL API returns them as blob1…, double1….
// ---------------------------------------------------------------------------

export const TELEMETRY_BLOBS = Object.freeze([
  'kind', 'build', 'outcome', 'stage', 'code', 'mode', 'rendererFamily', 'tier', 'autoTier', 'memoryClass',
  'capClass', 'capVerdict', 'timings', 'message', 'frames', 'notes', 'sid', 'entry', 'schema',
] as const);
export const TELEMETRY_DOUBLES = Object.freeze([
  'ms', 'weight', 'ready', 'maxTextureUnits', 'maxTextureSize', 'vertexTextureUnits', 'requiredTextureUnits',
  ...TELEMETRY_STAGE_SLOTS.map((stage) => `stage:${stage}`), 'gaps',
] as const);

export interface TelemetryDataPoint {
  blobs: string[];
  doubles: number[];
  indexes: string[];
}

const flag = (value: boolean | undefined, on: string, off: string): string => (
  value === undefined ? '?' : value ? on : off
);

/** The flags that classify a device beside its renderer family and tiers. */
export function telemetryCapabilityClass(cap: TelemetryCapability | undefined): string {
  if (!cap) return '';
  return [
    flag(cap.webgl2, 'gl2', 'nogl2'), flag(cap.software, 'sw', 'hw'), flag(cap.colorBufferFloat, 'cbf', 'nocbf'),
    flag(cap.storage, 'st', 'nost'), flag(cap.worker, 'wk', 'nowk'),
  ].join('/');
}

export function serializeTelemetryTimings(timings: Record<string, number> | undefined): string {
  if (!timings) return '';
  return Object.entries(timings).map(([key, value]) => `${key}=${value}`).join(';');
}

export function parseTelemetryTimings(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of String(text || '').split(';')) {
    const at = part.indexOf('=');
    if (at <= 0) continue;
    const key = part.slice(0, at);
    const value = Number(part.slice(at + 1));
    if (TIMING_KEY_RE.test(key) && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

const entryText = (entry: TelemetryEntryResult | undefined): string => (
  entry ? [entry.mode || 'unknown', entry.outcome, entry.code || ''].join(':') : ''
);

/** Turn a validated record into the ordered arrays `writeDataPoint` expects. */
export function telemetryDataPoint(record: TelemetryRecord): TelemetryDataPoint {
  const cap = record.cap;
  const error = record.error || record.errors?.[0];
  const gaps = Object.entries(record.t || {}).filter(([key]) => key.includes('>'))
    .reduce((sum, [, value]) => sum + value, 0);
  const capVerdict = record.capOutcome
    ? record.capCode ? `${record.capOutcome}:${record.capCode}` : record.capOutcome : '';
  const blobs: Record<(typeof TELEMETRY_BLOBS)[number], string> = {
    kind: record.kind,
    build: record.build,
    outcome: record.outcome || '',
    stage: record.stage || error?.stage || '',
    code: record.code || error?.code || '',
    mode: record.mode || record.entry?.mode || '',
    rendererFamily: cap?.rendererFamily || '',
    tier: cap?.tier || '',
    autoTier: cap?.autoTier || '',
    memoryClass: cap?.memoryClass || '',
    capClass: telemetryCapabilityClass(cap),
    capVerdict,
    timings: serializeTelemetryTimings(record.t),
    message: error?.message || '',
    frames: error ? error.frames.join(' | ') : '',
    notes: record.notes ? record.notes.join(',') : '',
    sid: record.sid,
    entry: entryText(record.entry),
    schema: `v${record.v}`,
  };
  const doubles: Record<(typeof TELEMETRY_DOUBLES)[number], number> = {
    ms: record.ms ?? -1,
    weight: record.w ?? 1,
    ready: record.kind === 'session' ? (record.outcome === 'ready' ? 1 : 0) : record.ready === undefined ? -1 : record.ready ? 1 : 0,
    maxTextureUnits: cap?.maxTextureUnits ?? -1,
    maxTextureSize: cap?.maxTextureSize ?? -1,
    vertexTextureUnits: cap?.vertexTextureUnits ?? -1,
    requiredTextureUnits: cap?.requiredTextureUnits ?? -1,
    ...Object.fromEntries(TELEMETRY_STAGE_SLOTS.map((stage) => [`stage:${stage}`, record.t?.[stage] ?? -1])),
    gaps: record.t ? gaps : -1,
  } as Record<(typeof TELEMETRY_DOUBLES)[number], number>;
  return {
    blobs: TELEMETRY_BLOBS.map((name) => blobs[name]),
    doubles: TELEMETRY_DOUBLES.map((name) => doubles[name]),
    indexes: [record.build],
  };
}

export interface TelemetryRow {
  at: string;
  sampleInterval: number;
  kind: string;
  build: string;
  outcome: string;
  stage: string;
  code: string;
  mode: string;
  rendererFamily: string;
  tier: string;
  autoTier: string;
  memoryClass: string;
  capClass: string;
  capVerdict: string;
  timings: Record<string, number>;
  message: string;
  frames: string;
  notes: string[];
  sid: string;
  entry: TelemetryEntryResult | null;
  ms: number | null;
  weight: number;
  ready: boolean | null;
  maxTextureUnits: number | null;
}

const rowNumber = (value: unknown): number | null => {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

/** Read one SQL API row (`blob1`…, `double1`…) back into named fields for the report. */
export function telemetryRowFromSql(row: Record<string, unknown>): TelemetryRow {
  const blob = (name: (typeof TELEMETRY_BLOBS)[number]): string => String(row[`blob${TELEMETRY_BLOBS.indexOf(name) + 1}`] ?? '');
  const double = (name: (typeof TELEMETRY_DOUBLES)[number]): number | null => rowNumber(row[`double${TELEMETRY_DOUBLES.indexOf(name) + 1}`]);
  const entryParts = blob('entry').split(':');
  const ready = double('ready');
  return {
    at: String(row.timestamp ?? ''),
    sampleInterval: Math.max(1, rowNumber(row._sample_interval) ?? 1),
    kind: blob('kind'),
    build: blob('build'),
    outcome: blob('outcome'),
    stage: blob('stage'),
    code: blob('code'),
    mode: blob('mode'),
    rendererFamily: blob('rendererFamily'),
    tier: blob('tier'),
    autoTier: blob('autoTier'),
    memoryClass: blob('memoryClass'),
    capClass: blob('capClass'),
    capVerdict: blob('capVerdict'),
    timings: parseTelemetryTimings(blob('timings')),
    message: blob('message'),
    frames: blob('frames'),
    notes: blob('notes') ? blob('notes').split(',') : [],
    sid: blob('sid'),
    entry: entryParts.length >= 2 && entryParts[1]
      ? { mode: entryParts[0], outcome: entryParts[1], ...(entryParts[2] ? { code: entryParts[2] } : {}) }
      : null,
    ms: double('ms'),
    weight: Math.max(1, double('weight') ?? 1),
    ready: ready === null ? null : ready >= 1,
    maxTextureUnits: double('maxTextureUnits'),
  };
}

/** The same named row from a validated record (the Vercel log line / a saved dump). */
export function telemetryRowFromRecord(record: TelemetryRecord, at: string): TelemetryRow {
  const point = telemetryDataPoint(record);
  const row: Record<string, unknown> = { timestamp: at, _sample_interval: 1 };
  point.blobs.forEach((value, index) => { row[`blob${index + 1}`] = value; });
  point.doubles.forEach((value, index) => { row[`double${index + 1}`] = value; });
  return telemetryRowFromSql(row);
}

// ---------------------------------------------------------------------------
// The render black-world guard (src/engine/blackWorldGuard.ts, 2026-10-19, black-screen-228): one `error` record per
// incident, stage `render`, code `render-black-world:<class>:<step>` and the receipt as an enumerated, numeric message
// (no names, no text a player typed). The report (tools/telemetry-report.mjs) reads them back with
// readRenderBlackWorld.
// ---------------------------------------------------------------------------

export const RENDER_BLACK_WORLD_STAGE = 'render';
export const RENDER_BLACK_WORLD_CODE = 'render-black-world';
/** What the guard found wrong when the world went black (the first CPU signal that explains it, else the probe's). */
export const RENDER_BLACK_WORLD_CLASSES = Object.freeze([
  'camera-layer-mask', 'scene-hidden', 'override', 'passes', 'viewport', 'roots-hidden', 'empty-scene-pass', 'gl-masked',
  'nan-history',
] as const);
export type RenderBlackWorldClass = (typeof RENDER_BLACK_WORLD_CLASSES)[number];
/** The heal ladder: re-assert state, reallocate targets and histories, MSAA off + rescue, context restore; none healed. */
export const RENDER_BLACK_WORLD_STEPS = Object.freeze(['H1', 'H2', 'H3', 'H4', 'none'] as const);
export type RenderBlackWorldStep = (typeof RENDER_BLACK_WORLD_STEPS)[number];
/** The receipt's message keys, in order; every value is a bounded number or one of a key's own enumerated words. */
export const RENDER_BLACK_WORLD_FIELDS = Object.freeze([
  'calls', 'mask', 'vis', 'ovr', 'pass', 'world', 'roots', 'vp', 'fb', 'err', 'black', 'nan', 'ground', 'dyn', 'trim',
  'msaa', 'preset', 'focus', 'hidden', 'lock', 'settings', 'warm', 'rare', 'reveal', 'resize', 'resume', 'steps', 'heal',
] as const);
const RENDER_BLACK_WORLD_WORDS: Readonly<Record<string, ReadonlySet<string>>> = Object.freeze({
  preset: new Set(['ultra', 'high', 'medium', 'low', 'ultralow', 'mobile-high', 'mobile', 'mobile-low', 'mobile-ultralow', 'unknown']),
  warm: new Set(['none', 'enemyVisuals', 'combatOpeningWarm', 'navigation', 'rareEffects', 'terrainLookahead',
    'visionPrograms', 'done', 'cancelled', 'error']),
  rare: new Set(['none', 'wreckVariants', 'armorScars', 'destructionEffects', 'textures', 'shadows', 'hiddenVariants']),
  steps: new Set(['none', 'H1', 'H1-H2', 'H1-H2-H3', 'H1-H2-H3-H4']),
  heal: new Set(RENDER_BLACK_WORLD_STEPS),
});
const RENDER_BLACK_WORLD_NUMBER = /^-?\d{1,9}(\.\d{1,3})?$/;

/** `render-black-world:<class>:<step>`, or null for a class or step the schema does not name. */
export function renderBlackWorldCode(blackClass: string, step: string): string | null {
  if (!(RENDER_BLACK_WORLD_CLASSES as readonly string[]).includes(blackClass)) return null;
  if (!(RENDER_BLACK_WORLD_STEPS as readonly string[]).includes(step)) return null;
  return `${RENDER_BLACK_WORLD_CODE}:${blackClass}:${step}`;
}

/** The receipt's message: `key=value` pairs in RENDER_BLACK_WORLD_FIELDS order; an unknown key or a free word is dropped. */
export function renderBlackWorldMessage(fields: Readonly<Record<string, string | number | boolean | null | undefined>>): string {
  const parts: string[] = [];
  for (const key of RENDER_BLACK_WORLD_FIELDS) {
    const value = fields[key];
    if (value === undefined || value === null) continue;
    const text = typeof value === 'boolean' ? (value ? '1' : '0')
      : typeof value === 'number' ? (Number.isFinite(value) ? String(Math.round(value * 1000) / 1000) : '')
        : String(value);
    const words = RENDER_BLACK_WORLD_WORDS[key];
    if (words ? !words.has(text) : !RENDER_BLACK_WORLD_NUMBER.test(text)) continue;
    parts.push(`${key}=${text}`);
  }
  return parts.join(' ').slice(0, 200);
}

/** A black-world record's class, step and receipt fields, or null when the record is another kind. */
export function readRenderBlackWorld(record: { stage?: string | null; code?: string | null; message?: string | null; error?: { message?: string } | null }):
  { blackClass: RenderBlackWorldClass; step: RenderBlackWorldStep; fields: Record<string, string> } | null {
  const [prefix, blackClass, step] = String(record.code ?? '').split(':');
  if (prefix !== RENDER_BLACK_WORLD_CODE || renderBlackWorldCode(blackClass, step) === null) return null;
  const fields: Record<string, string> = {};
  for (const pair of String(record.error?.message ?? record.message ?? '').split(' ')) {
    const at = pair.indexOf('=');
    if (at <= 0) continue;
    const key = pair.slice(0, at);
    if ((RENDER_BLACK_WORLD_FIELDS as readonly string[]).includes(key)) fields[key] = pair.slice(at + 1);
  }
  return { blackClass: blackClass as RenderBlackWorldClass, step: step as RenderBlackWorldStep, fields };
}
