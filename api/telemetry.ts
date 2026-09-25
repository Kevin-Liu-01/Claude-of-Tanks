import { createHash, randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RuntimeValue } from '../src/runtimeTypes.ts';

/**
 * /api/telemetry — the entry-resilience beacon sink (docs/ENTRY-RESILIENCE.md).
 *
 * Accepts one small same-origin POST per flush from `src/entry/telemetry.ts`
 * (and the inline boot watchdog in index.html): anonymous boot stages,
 * capability probes, the first errors of a session and entry outcomes. Every
 * accepted event is written as one structured JSON line to the function log
 * and, when the Upstash/KV REST credentials are configured, pushed onto a
 * bounded Redis list that `tools/telemetry-report.mjs` reads.
 *
 * Nothing personal is accepted or retained: no IP (the rate limiter keys a
 * salted hash that never leaves process memory), no user agent, no player or
 * room names. Fields with those names are rejected outright.
 */

const TELEMETRY_SCHEMA_VERSION = 1;
export const TELEMETRY_LIST_KEY = 'cot:telemetry:v1:events';
export const TELEMETRY_LIST_LIMIT = 5000;
export const TELEMETRY_TTL_SECONDS = 30 * 24 * 60 * 60;
const TELEMETRY_MAX_BODY_BYTES = 4096;
const TELEMETRY_MAX_EVENTS_PER_BODY = 25;

const OFFICIAL_ORIGINS = new Set([
  'https://cot.kevinliu.studio',
  'https://claudeoftanks.kevinliu.studio',
  'https://claude-of-tanks.vercel.app',
  'https://claude-of-tanks-kl01s-projects.vercel.app',
]);

const TELEMETRY_KINDS = Object.freeze([
  'boot_stage', 'boot_ready', 'boot_error', 'entry_result', 'capability',
  'slow_reveal', 'room_failure', 'ice_degraded',
  // 2026-09-25: the damage panel gave up on a tank's top-down masks (code + spec id in reason)
  'hud_mask_failed',
] as const);
export type TelemetryKind = (typeof TELEMETRY_KINDS)[number];
const OUTCOMES = new Set(['ok', 'failed', 'cancelled', 'timeout', 'halted', 'notice']);
const MODES = new Set(['solo', 'private', 'lan', 'studio', 'network', 'unknown']);
const PHASES = new Set(['begin', 'end']);
const MEMORY_CLASSES = new Set(['low', 'mid', 'high', 'unknown']);
const TIERS = new Set(['mobile', 'desktop', 'unknown']);
const AUTO_TIERS = new Set(['low', 'medium', 'high', 'unknown']);
const RENDERER_FAMILIES = new Set([
  'nvidia', 'amd', 'intel', 'apple', 'arm', 'qualcomm', 'imagination', 'software', 'unknown',
]);

/** Field names that would carry personal data; a body naming one is refused. */
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

interface TelemetryCapability {
  webgl2?: boolean;
  rendererFamily?: string;
  maxTextureUnits?: number;
  maxTextureSize?: number;
  vertexTextureUnits?: number;
  colorBufferFloat?: boolean;
  software?: boolean;
  memoryClass?: string;
  tier?: string;
  autoTier?: string;
  storage?: boolean;
  worker?: boolean;
  requiredTextureUnits?: number;
}

interface TelemetryEventRecord {
  v: number;
  at: string;
  sid: string;
  build: string;
  kind: TelemetryKind;
  stage?: string;
  phase?: 'begin' | 'end';
  ms?: number;
  outcome?: string;
  code?: string;
  mode?: string;
  reason?: string;
  error?: { message: string; frames: string[] };
  capability?: TelemetryCapability;
  timings?: Record<string, number>;
}

interface TelemetryStore {
  /** Push one serialized event; the implementation owns trimming and expiry. */
  append(value: string): Promise<void>;
}

interface TelemetryHandlerOptions {
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  /** A store, `null` for log-only, or omit to build one from the environment on first use. */
  store?: TelemetryStore | null | (() => Promise<TelemetryStore | null>);
  log?: (line: string) => void;
  warn?: (line: string) => void;
  /** Rate-limit tuning; production defaults suit one flush every few seconds per session. */
  bucketCapacity?: number;
  bucketRefillPerSecond?: number;
  bucketLimit?: number;
}

type TelemetryHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => Promise<void>;

function isRecord(value: RuntimeValue): value is Record<string, RuntimeValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function configuredOrigins(env: NodeJS.ProcessEnv): Set<string> {
  const extra = String(env.COT_ALLOWED_ORIGINS || '')
    .split(',').map((value) => value.trim()).filter(Boolean);
  return new Set([...OFFICIAL_ORIGINS, ...extra]);
}

function send(response: ServerResponse, status: number, body: RuntimeValue): void {
  response.statusCode = status;
  response.setHeader('cache-control', 'private, no-store, max-age=0');
  response.setHeader('vary', 'Origin');
  if (status === 204 || body === undefined) {
    response.end();
    return;
  }
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
}

/** Read at most `limit` bytes of the request body; `null` means the body is larger. */
async function readBody(request: IncomingMessage, limit: number): Promise<string | null> {
  const declared = Number(request.headers?.['content-length'] || 0);
  if (Number.isFinite(declared) && declared > limit) return null;
  const preset = (request as IncomingMessage & { body?: RuntimeValue }).body;
  if (preset !== undefined && preset !== null) {
    const text = typeof preset === 'string' ? preset : JSON.stringify(preset);
    return Buffer.byteLength(text, 'utf8') > limit ? null : text;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request as AsyncIterable<Buffer | string>) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
    size += buffer.length;
    if (size > limit) return null;
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function cleanText(value: RuntimeValue, max: number): string {
  // eslint-disable-next-line no-control-regex
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max);
}

function boundedInt(value: RuntimeValue, max = 10_000_000): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return Math.min(max, Math.round(value));
}

function piiField(value: Record<string, RuntimeValue>): string | null {
  for (const key of Object.keys(value)) {
    if (PII_FIELDS.has(key.toLowerCase())) return key;
  }
  return null;
}

function readCapability(value: RuntimeValue): TelemetryCapability | undefined {
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

function readError(value: RuntimeValue): { message: string; frames: string[] } | undefined {
  if (!isRecord(value)) return undefined;
  const frames = Array.isArray(value.frames)
    ? value.frames.slice(0, 3).map((frame: RuntimeValue) => cleanText(frame, 160)).filter(Boolean)
    : [];
  return { message: cleanText(value.message, 200), frames };
}

function readTimings(value: RuntimeValue): Record<string, number> | undefined {
  if (!isRecord(value)) return undefined;
  const out: Record<string, number> = {};
  for (const [key, item] of Object.entries(value).slice(0, 16)) {
    if (!TIMING_KEY_RE.test(key)) continue;
    const number = boundedInt(item);
    if (number !== undefined) out[key] = number;
  }
  return out;
}

type TelemetryValidation =
  | { ok: true; events: TelemetryEventRecord[] }
  | { ok: false; error: string };

/** The first personal field name in the event or its nested objects, else null. */
function eventPiiField(raw: Record<string, RuntimeValue>): string | null {
  for (const value of [raw, raw.capability, raw.error, raw.timings]) {
    const field = isRecord(value) ? piiField(value) : null;
    if (field) return field;
  }
  return null;
}

/** Optional enumerated string fields; an absent field is fine, an unknown value is an error. */
const ENUM_FIELDS: ReadonlyArray<readonly [key: 'phase' | 'outcome' | 'mode', values: Set<string>]> = [
  ['phase', PHASES], ['outcome', OUTCOMES], ['mode', MODES],
];
/** Optional bounded text fields with their alphabet and length. */
const TEXT_FIELDS: ReadonlyArray<readonly [key: 'stage' | 'code' | 'reason', pattern: RegExp, max: number]> = [
  ['stage', STAGE_RE, 32], ['code', CODE_RE, 48], ['reason', CODE_RE, 48],
];

type EventValidation = { ok: true; event: TelemetryEventRecord } | { ok: false; error: string };

/** Validate one event against the schema; the envelope fields arrive already checked. */
function readEvent(
  raw: RuntimeValue,
  base: Pick<TelemetryEventRecord, 'at' | 'sid' | 'build'>,
): EventValidation {
  if (!isRecord(raw)) return { ok: false, error: 'invalid_event:events' };
  const pii = eventPiiField(raw);
  if (pii) return { ok: false, error: `pii_field:${pii}` };
  const kind = String(raw.kind || '');
  if (!(TELEMETRY_KINDS as readonly string[]).includes(kind)) return { ok: false, error: 'invalid_event:kind' };
  const event: TelemetryEventRecord = { v: TELEMETRY_SCHEMA_VERSION, ...base, kind: kind as TelemetryKind };
  for (const [key, pattern, max] of TEXT_FIELDS) {
    if (raw[key] === undefined) continue;
    const text = cleanText(raw[key], max);
    if (!pattern.test(text)) return { ok: false, error: `invalid_event:${key}` };
    event[key] = text;
  }
  for (const [key, values] of ENUM_FIELDS) {
    if (raw[key] === undefined) continue;
    const value = String(raw[key]);
    if (!values.has(value)) return { ok: false, error: `invalid_event:${key}` };
    if (key === 'phase') event.phase = value as 'begin' | 'end';
    else event[key] = value;
  }
  const ms = boundedInt(raw.ms);
  if (ms !== undefined) event.ms = ms;
  const error = readError(raw.error);
  if (error) event.error = error;
  const capability = readCapability(raw.capability);
  if (capability) event.capability = capability;
  const timings = readTimings(raw.timings);
  if (timings) event.timings = timings;
  return { ok: true, event };
}

/**
 * Validate one beacon body: `{ v, sid, build, events: [...] }` or a single
 * event carrying `v`, `sid`, `build` itself. Unknown fields are dropped;
 * personal fields are refused; every value is bounded before it is stored.
 */
export function validateTelemetryBody(input: RuntimeValue, at: string): TelemetryValidation {
  if (!isRecord(input)) return { ok: false, error: 'invalid_body' };
  const pii = piiField(input);
  if (pii) return { ok: false, error: `pii_field:${pii}` };
  if (input.v !== TELEMETRY_SCHEMA_VERSION) return { ok: false, error: 'invalid_event:v' };
  const sid = String(input.sid || '');
  if (!ID_RE.test(sid)) return { ok: false, error: 'invalid_event:sid' };
  const build = String(input.build || '');
  if (!BUILD_RE.test(build)) return { ok: false, error: 'invalid_event:build' };
  const rawEvents = Array.isArray(input.events) ? input.events : [input];
  if (rawEvents.length === 0 || rawEvents.length > TELEMETRY_MAX_EVENTS_PER_BODY) {
    return { ok: false, error: 'invalid_event:events' };
  }
  const events: TelemetryEventRecord[] = [];
  for (const raw of rawEvents) {
    const validated = readEvent(raw, { at, sid, build });
    if (!validated.ok) return validated;
    events.push(validated.event);
  }
  return { ok: true, events };
}

/** Upstash/KV REST credentials, in the same precedence the signaling function used. */
export function telemetryStoreConfig(env: NodeJS.ProcessEnv): { url: string; token: string } | null {
  const url = String(env.COT_TELEMETRY_REDIS_REST_URL || env.COT_SIGNAL_REDIS_KV_REST_API_URL
    || env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || '').trim();
  const token = String(env.COT_TELEMETRY_REDIS_REST_TOKEN || env.COT_SIGNAL_REDIS_KV_REST_API_TOKEN
    || env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || '').trim();
  return url && token ? { url, token } : null;
}

interface PipelineLike {
  lpush(key: string, value: string): PipelineLike;
  ltrim(key: string, start: number, stop: number): PipelineLike;
  expire(key: string, seconds: number): PipelineLike;
  exec(): Promise<RuntimeValue>;
}

/** Adapt a pipeline-capable Redis client (the `@upstash/redis` REST client) to the store contract. */
export function createRedisTelemetryStore(client: { pipeline(): PipelineLike }): TelemetryStore {
  return {
    async append(value) {
      await client.pipeline()
        .lpush(TELEMETRY_LIST_KEY, value)
        .ltrim(TELEMETRY_LIST_KEY, 0, TELEMETRY_LIST_LIMIT - 1)
        .expire(TELEMETRY_LIST_KEY, TELEMETRY_TTL_SECONDS)
        .exec();
    },
  };
}

async function storeFromEnvironment(env: NodeJS.ProcessEnv): Promise<TelemetryStore | null> {
  const config = telemetryStoreConfig(env);
  if (!config) return null;
  const { Redis } = await import('@upstash/redis');
  return createRedisTelemetryStore(new Redis({ url: config.url, token: config.token }));
}

interface Bucket { tokens: number; at: number }

/** Per-client token bucket keyed by a salted hash; the salt dies with the process. */
export function createTelemetryRateLimiter({
  capacity = 30, refillPerSecond = 0.25, limit = 4096, now = Date.now, salt = randomBytes(16).toString('hex'),
}: { capacity?: number; refillPerSecond?: number; limit?: number; now?: () => number; salt?: string } = {}) {
  const buckets = new Map<string, Bucket>();
  return {
    /** @returns true when the request may proceed. */
    take(clientKey: string): boolean {
      const key = createHash('sha256').update(`${salt}:${clientKey}`).digest('base64url').slice(0, 24);
      const at = now();
      let bucket = buckets.get(key);
      if (!bucket) {
        if (buckets.size >= limit) {
          const oldest = buckets.keys().next().value;
          if (oldest !== undefined) buckets.delete(oldest);
        }
        bucket = { tokens: capacity, at };
        buckets.set(key, bucket);
      } else {
        bucket.tokens = Math.min(capacity, bucket.tokens + Math.max(0, at - bucket.at) / 1000 * refillPerSecond);
        bucket.at = at;
        // Refresh insertion order so the eviction above drops the coldest client.
        buckets.delete(key);
        buckets.set(key, bucket);
      }
      if (bucket.tokens < 1) return false;
      bucket.tokens -= 1;
      return true;
    },
    get size() { return buckets.size; },
  };
}

function clientKey(request: IncomingMessage): string {
  const forwarded = String(request.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  const real = String(request.headers?.['x-real-ip'] || '').trim();
  const socketAddress = request.socket?.remoteAddress || '';
  return forwarded || real || socketAddress || 'unknown';
}

export function createTelemetryHandler({
  env = process.env,
  now = Date.now,
  store,
  log = (line) => console.log(line),
  warn = (line) => console.warn(line),
  bucketCapacity,
  bucketRefillPerSecond,
  bucketLimit,
}: TelemetryHandlerOptions = {}): TelemetryHandler {
  const limiter = createTelemetryRateLimiter({
    capacity: bucketCapacity, refillPerSecond: bucketRefillPerSecond, limit: bucketLimit, now,
  });
  let storePromise: Promise<TelemetryStore | null> | null = null;
  const resolveStore = (): Promise<TelemetryStore | null> => {
    if (store === null) return Promise.resolve(null);
    if (store && typeof store === 'object') return Promise.resolve(store);
    if (!storePromise) {
      storePromise = (typeof store === 'function' ? store() : storeFromEnvironment(env)).catch((error) => {
        warn(`[telemetry] store unavailable: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      });
    }
    return storePromise;
  };

  return async function telemetry(request, response): Promise<void> {
    const origin = String(request.headers?.origin || '');
    if (request.method === 'OPTIONS') {
      response.setHeader('allow', 'POST');
      send(response, 204, undefined);
      return;
    }
    if (request.method !== 'POST') {
      response.setHeader('allow', 'POST');
      send(response, 405, { error: 'method_not_allowed' });
      return;
    }
    if (origin && !configuredOrigins(env).has(origin)) {
      send(response, 403, { error: 'origin_forbidden' });
      return;
    }
    if (!limiter.take(clientKey(request))) {
      response.setHeader('retry-after', '30');
      send(response, 429, { error: 'rate_limited' });
      return;
    }
    let text: string | null;
    try {
      text = await readBody(request, TELEMETRY_MAX_BODY_BYTES);
    } catch (_) {
      send(response, 400, { error: 'invalid_body' });
      return;
    }
    if (text === null) {
      send(response, 413, { error: 'too_large' });
      return;
    }
    let parsed: RuntimeValue;
    try {
      parsed = JSON.parse(text);
    } catch (_) {
      send(response, 400, { error: 'invalid_json' });
      return;
    }
    const validated = validateTelemetryBody(parsed, new Date(now()).toISOString());
    if (!validated.ok) {
      send(response, 400, { error: validated.error });
      return;
    }
    const lines = validated.events.map((event) => JSON.stringify({ tag: 'cot-telemetry', ...event }));
    for (const line of lines) log(line);
    const target = await resolveStore();
    if (target) {
      try {
        for (const line of lines) await target.append(line);
      } catch (error) {
        warn(`[telemetry] store write failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    send(response, 204, undefined);
  };
}

export default createTelemetryHandler();
