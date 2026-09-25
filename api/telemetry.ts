import { createHash, randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RuntimeValue } from '../src/runtimeTypes.ts';
import { TELEMETRY_MAX_BODY_BYTES, validateTelemetryRecord } from '../server/telemetryRecord.ts';

/**
 * /api/telemetry — the entry-telemetry fallback sink (docs/ENTRY-RESILIENCE.md).
 *
 * The production sink is the Cloudflare Worker in `cloudflare/telemetry`
 * (Workers Analytics Engine); the client posts here only while
 * `VITE_TELEMETRY_URL` is unset. This function validates one v2 record per
 * request against the shared schema (`server/telemetryRecord.ts`) and
 * writes it as one structured JSON line to the function log — nothing else:
 * the Redis list of deploys 89–90 is gone with its Upstash client and
 * environment names (`tools/telemetry-report.mjs --logs` reads
 * `vercel logs --json` output for the transition).
 *
 * Nothing personal is accepted or retained: no IP (the rate limiter keys a
 * salted hash that never leaves process memory), no user agent, no player or
 * room names. Fields with those names are rejected outright.
 */

const OFFICIAL_ORIGINS = new Set([
  'https://cot.kevinliu.studio',
  'https://claudeoftanks.kevinliu.studio',
  'https://claude-of-tanks.vercel.app',
  'https://claude-of-tanks-kl01s-projects.vercel.app',
]);

interface TelemetryHandlerOptions {
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  log?: (line: string) => void;
  /** Rate-limit tuning; production defaults suit three records per session. */
  bucketCapacity?: number;
  bucketRefillPerSecond?: number;
  bucketLimit?: number;
}

type TelemetryHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => Promise<void>;

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

interface Bucket { tokens: number; at: number }

/** Per-client token bucket keyed by a salted hash; the salt dies with the process. */
export function createTelemetryRateLimiter({
  capacity = 12, refillPerSecond = 0.1, limit = 4096, now = Date.now, salt = randomBytes(16).toString('hex'),
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
  log = (line) => console.log(line),
  bucketCapacity,
  bucketRefillPerSecond,
  bucketLimit,
}: TelemetryHandlerOptions = {}): TelemetryHandler {
  const limiter = createTelemetryRateLimiter({
    capacity: bucketCapacity, refillPerSecond: bucketRefillPerSecond, limit: bucketLimit, now,
  });

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
    const validated = validateTelemetryRecord(parsed);
    if (!validated.ok) {
      send(response, 400, { error: validated.error });
      return;
    }
    log(JSON.stringify({ tag: 'cot-telemetry', at: new Date(now()).toISOString(), ...validated.record }));
    send(response, 204, undefined);
  };
}

export default createTelemetryHandler();
