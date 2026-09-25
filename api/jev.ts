import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RuntimeValue } from '../src/runtimeTypes.ts';
import { createTelemetryRateLimiter } from './telemetry.ts';
import {
  buildJevQuestions, JEV_MODEL, JEV_PROTOCOL_VERSION, parseJevAnswers, validateJevRequest,
  type JevAnswer, type JevRequestBody,
} from '../src/game/jevProtocol.ts';

/**
 * /api/jev — the Jev commander proxy (docs/JEV-COMMANDER.md).
 *
 * The browser sends one compact battle document per team (game/jevProtocol.ts);
 * this function validates it, builds the TypeSafe questions SERVER-SIDE, calls
 * `POST https://api.typesafe.ai/v1/systemone` with the server-held
 * `TYPESAFE_API_KEY`, and returns the typed answers plus token usage. The key
 * never leaves this process, no prompt is accepted from the client, and the
 * document carries no personal field (the validator refuses names, room codes,
 * addresses and raw coordinates outright).
 *
 * Abuse guards, all in process memory like the telemetry sink: an origin
 * allow-list, a body cap, a per-address token bucket keyed by a salted hash, a
 * per-session bucket and a hard per-session request budget, a global
 * per-minute ceiling under TypeSafe's published limit, and a cool-down after
 * an upstream 429/529 so a rate-limited key is never hammered. One structured
 * log line per call: counts, status, latency and tokens — never the document.
 */

export const JEV_UPSTREAM_URL = 'https://api.typesafe.ai/v1/systemone';
export const JEV_MAX_BODY_BYTES = 32 * 1024;
/** Requests one session (one browser tab's battle series) may make before the proxy refuses it. */
export const JEV_SESSION_REQUEST_CAP = 2400;
/** Requests per minute across every session; TypeSafe publishes 1,200 per minute per key. */
export const JEV_GLOBAL_PER_MINUTE = 900;
const JEV_UPSTREAM_TIMEOUT_MS = 2500;
const COOLDOWN_MIN_MS = 1000;
const COOLDOWN_MAX_MS = 30_000;

const OFFICIAL_ORIGINS = new Set([
  'https://cot.kevinliu.studio',
  'https://claudeoftanks.kevinliu.studio',
  'https://claude-of-tanks.vercel.app',
  'https://claude-of-tanks-kl01s-projects.vercel.app',
]);
const LOCAL_ORIGIN_RE = /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/;

interface FetchResponseLike {
  readonly status: number;
  text(): Promise<string>;
}

type FetchLike = (url: string, init: {
  method: string; headers: Record<string, string>; body: string; signal: AbortSignal;
}) => Promise<FetchResponseLike>;

interface JevHandlerOptions {
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  fetch?: FetchLike;
  log?: (line: string) => void;
  warn?: (line: string) => void;
  /** Accept `http://localhost:*` origins (the local dev wrapper sets this; production never does). */
  allowLocalOrigins?: boolean;
  upstreamUrl?: string;
  timeoutMs?: number;
  sessionRequestCap?: number;
  globalPerMinute?: number;
  /** Rate-limit tuning; the defaults suit one request every two seconds per team, two teams per session. */
  sessionBucketCapacity?: number;
  sessionBucketRefillPerSecond?: number;
  addressBucketCapacity?: number;
  addressBucketRefillPerSecond?: number;
}

type JevHandler = (request: IncomingMessage, response: ServerResponse) => Promise<void>;

function isRecord(value: RuntimeValue): value is Record<string, RuntimeValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function configuredOrigins(env: NodeJS.ProcessEnv): Set<string> {
  const extra = String(env.COT_ALLOWED_ORIGINS || '')
    .split(',').map((value) => value.trim()).filter(Boolean);
  return new Set([...OFFICIAL_ORIGINS, ...extra]);
}

function originAllowed(origin: string, env: NodeJS.ProcessEnv, allowLocal: boolean): boolean {
  if (!origin) return true;
  if (configuredOrigins(env).has(origin)) return true;
  return allowLocal && LOCAL_ORIGIN_RE.test(origin);
}

function send(response: ServerResponse, status: number, body: RuntimeValue, origin: string | null): void {
  response.statusCode = status;
  response.setHeader('cache-control', 'private, no-store, max-age=0');
  response.setHeader('vary', 'Origin');
  if (origin) {
    // the same-origin production path never needs these; the local dev wrapper is cross-origin
    response.setHeader('access-control-allow-origin', origin);
    response.setHeader('access-control-allow-methods', 'POST, OPTIONS');
    response.setHeader('access-control-allow-headers', 'content-type');
    response.setHeader('access-control-max-age', '600');
  }
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

function clientKey(request: IncomingMessage): string {
  const forwarded = String(request.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  const real = String(request.headers?.['x-real-ip'] || '').trim();
  const socketAddress = request.socket?.remoteAddress || '';
  return forwarded || real || socketAddress || 'unknown';
}

/** Per-session request budget keyed by a salted hash of the session id; bounded like the buckets. */
function createSessionBudget(cap: number, limit = 4096) {
  const salt = randomBytes(16).toString('hex');
  const counts = new Map<string, number>();
  const keyOf = (sid: string): string => {
    // a cheap non-reversible key: the salt dies with the process, the sid never reaches the log
    let hash = 2166136261;
    const text = `${salt}:${sid}`;
    for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return (hash >>> 0).toString(36);
  };
  return {
    /** @returns the requests this session has made including this one, or -1 when the cap is spent. */
    take(sid: string): number {
      const key = keyOf(sid);
      const used = counts.get(key) || 0;
      if (used >= cap) return -1;
      if (!counts.has(key) && counts.size >= limit) {
        const oldest = counts.keys().next().value;
        if (oldest !== undefined) counts.delete(oldest);
      }
      counts.delete(key);
      counts.set(key, used + 1);
      return used + 1;
    },
  };
}

interface UpstreamOutcome {
  status: number;
  body: RuntimeValue;
  upstreamStatus: number | null;
  error: string | null;
  questions: number;
  answers?: Record<string, JevAnswer>;
  usage?: { input_tokens: number; output_tokens: number };
  model?: string;
}

function readUsage(value: RuntimeValue): { input_tokens: number; output_tokens: number } {
  const usage = isRecord(value) ? value : {};
  const int = (item: RuntimeValue): number => (typeof item === 'number' && Number.isFinite(item) ? Math.max(0, Math.round(item)) : 0);
  return { input_tokens: int(usage.input_tokens), output_tokens: int(usage.output_tokens) };
}

export function createJevHandler({
  env = process.env,
  now = Date.now,
  fetch = globalThis.fetch as unknown as FetchLike,
  log = (line) => console.log(line),
  warn = (line) => console.warn(line),
  allowLocalOrigins = false,
  upstreamUrl = JEV_UPSTREAM_URL,
  timeoutMs = JEV_UPSTREAM_TIMEOUT_MS,
  sessionRequestCap = JEV_SESSION_REQUEST_CAP,
  globalPerMinute = JEV_GLOBAL_PER_MINUTE,
  sessionBucketCapacity = 40,
  sessionBucketRefillPerSecond = 1.5,
  addressBucketCapacity = 120,
  addressBucketRefillPerSecond = 3,
}: JevHandlerOptions = {}): JevHandler {
  const addressLimiter = createTelemetryRateLimiter({
    capacity: addressBucketCapacity, refillPerSecond: addressBucketRefillPerSecond, now,
  });
  const sessionLimiter = createTelemetryRateLimiter({
    capacity: sessionBucketCapacity, refillPerSecond: sessionBucketRefillPerSecond, now,
  });
  const budget = createSessionBudget(sessionRequestCap);
  let minuteStart = 0;
  let minuteCount = 0;
  let cooldownUntil = 0;
  let cooldownStep = COOLDOWN_MIN_MS;
  let missingKeyWarned = false;

  const takeGlobal = (): boolean => {
    const at = now();
    if (at - minuteStart >= 60_000) {
      minuteStart = at;
      minuteCount = 0;
    }
    if (minuteCount >= globalPerMinute) return false;
    minuteCount++;
    return true;
  };

  const beginCooldown = (): number => {
    cooldownUntil = now() + cooldownStep;
    const retry = cooldownStep;
    cooldownStep = Math.min(COOLDOWN_MAX_MS, cooldownStep * 2);
    return retry;
  };

  async function callUpstream(key: string, body: JevRequestBody): Promise<UpstreamOutcome> {
    const questions = buildJevQuestions(body.state);
    const count = Object.keys(questions).length;
    const failure = (status: number, error: string, upstreamStatus: number | null, extra: Record<string, number> = {}): UpstreamOutcome =>
      ({ status, body: { error, ...extra }, upstreamStatus, error, questions: count });
    const payload = JSON.stringify({ state: body.state, model: JEV_MODEL, questions });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let upstream: FetchResponseLike;
    try {
      upstream = await fetch(upstreamUrl, {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', accept: 'application/json' },
        body: payload,
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timer);
      const aborted = controller.signal.aborted || (error instanceof Error && error.name === 'AbortError');
      return aborted ? failure(504, 'upstream_timeout', null) : failure(502, 'upstream_unreachable', null);
    }
    let text = '';
    try {
      text = await upstream.text();
    } catch (_) {
      clearTimeout(timer);
      return failure(502, 'upstream_unreadable', upstream.status);
    }
    clearTimeout(timer);
    const status = upstream.status;
    if (status === 200) {
      let parsed: RuntimeValue;
      try {
        parsed = JSON.parse(text);
      } catch (_) {
        return failure(502, 'upstream_invalid_json', status);
      }
      if (!isRecord(parsed)) return failure(502, 'upstream_invalid_json', status);
      cooldownStep = COOLDOWN_MIN_MS;
      const answers = parseJevAnswers(parsed.answers, questions);
      const usage = readUsage(parsed.usage);
      const model = typeof parsed.model === 'string' ? parsed.model.slice(0, 32) : '';
      return { status: 200, body: null, upstreamStatus: status, error: null, questions: count, answers, usage, model };
    }
    if (status === 401) {
      warn('[jev] upstream refused the API key (401)');
      return failure(502, 'upstream_auth', status);
    }
    if (status === 422) {
      warn(`[jev] upstream rejected the request (422): ${text.replace(/[\r\n]+/g, ' ').slice(0, 240)}`);
      return failure(502, 'upstream_invalid', status);
    }
    if (status === 429 || status === 529) {
      const retryAfterMs = beginCooldown();
      return status === 429
        ? failure(429, 'upstream_rate_limited', status, { retryAfterMs })
        : failure(503, 'upstream_overloaded', status, { retryAfterMs });
    }
    return failure(502, 'upstream_error', status);
  }

  return async function jev(request, response): Promise<void> {
    const origin = String(request.headers?.origin || '');
    const allowed = originAllowed(origin, env, allowLocalOrigins);
    const corsOrigin = origin && allowed ? origin : null;
    if (request.method === 'OPTIONS') {
      response.setHeader('allow', 'POST');
      send(response, allowed ? 204 : 403, allowed ? undefined : { error: 'origin_forbidden' }, corsOrigin);
      return;
    }
    if (request.method !== 'POST') {
      response.setHeader('allow', 'POST');
      send(response, 405, { error: 'method_not_allowed' }, corsOrigin);
      return;
    }
    if (!allowed) {
      send(response, 403, { error: 'origin_forbidden' }, null);
      return;
    }
    const key = String(env.TYPESAFE_API_KEY || '').trim();
    if (!key) {
      if (!missingKeyWarned) {
        missingKeyWarned = true;
        warn('[jev] TYPESAFE_API_KEY is not configured; the commander falls back to the classic brain');
      }
      send(response, 503, { error: 'not_configured' }, corsOrigin);
      return;
    }
    if (!addressLimiter.take(clientKey(request))) {
      response.setHeader('retry-after', '10');
      send(response, 429, { error: 'rate_limited', retryAfterMs: 10_000 }, corsOrigin);
      return;
    }
    let text: string | null;
    try {
      text = await readBody(request, JEV_MAX_BODY_BYTES);
    } catch (_) {
      send(response, 400, { error: 'invalid_body' }, corsOrigin);
      return;
    }
    if (text === null) {
      send(response, 413, { error: 'too_large' }, corsOrigin);
      return;
    }
    let parsed: RuntimeValue;
    try {
      parsed = JSON.parse(text);
    } catch (_) {
      send(response, 400, { error: 'invalid_json' }, corsOrigin);
      return;
    }
    const validated = validateJevRequest(parsed);
    if (!validated.ok) {
      send(response, 400, { error: validated.error }, corsOrigin);
      return;
    }
    const body = validated.value;
    if (!sessionLimiter.take(`sid:${body.sid}`)) {
      response.setHeader('retry-after', '5');
      send(response, 429, { error: 'session_rate_limited', retryAfterMs: 5000 }, corsOrigin);
      return;
    }
    const used = budget.take(body.sid);
    if (used < 0) {
      send(response, 429, { error: 'session_budget_spent' }, corsOrigin);
      return;
    }
    if (!takeGlobal()) {
      response.setHeader('retry-after', '15');
      send(response, 429, { error: 'global_rate_limited', retryAfterMs: 15_000 }, corsOrigin);
      return;
    }
    const at = now();
    if (at < cooldownUntil) {
      const retryAfterMs = cooldownUntil - at;
      response.setHeader('retry-after', String(Math.ceil(retryAfterMs / 1000)));
      send(response, 503, { error: 'cooling_down', retryAfterMs }, corsOrigin);
      return;
    }
    const startedAt = now();
    const outcome = await callUpstream(key, body);
    const latencyMs = Math.max(0, now() - startedAt);
    const state = body.state;
    log(JSON.stringify({
      tag: 'cot-jev', at: new Date(at).toISOString(), kind: body.kind, mode: state.battle.mode,
      bots: Object.keys(state.our_tanks).length, enemies: Object.keys(state.enemies).length,
      objectives: Object.keys(state.objectives).length, questions: outcome.questions,
      sessionRequests: used, status: outcome.status, upstreamStatus: outcome.upstreamStatus, error: outcome.error,
      latencyMs, inputTokens: outcome.usage?.input_tokens ?? 0, outputTokens: outcome.usage?.output_tokens ?? 0,
    }));
    if (outcome.status !== 200) {
      if (isRecord(outcome.body) && typeof outcome.body.retryAfterMs === 'number') {
        response.setHeader('retry-after', String(Math.ceil(outcome.body.retryAfterMs / 1000)));
      }
      send(response, outcome.status, outcome.body, corsOrigin);
      return;
    }
    send(response, 200, {
      v: JEV_PROTOCOL_VERSION, model: outcome.model, answers: outcome.answers, usage: outcome.usage, latencyMs,
    }, corsOrigin);
  };
}

export default createJevHandler();
