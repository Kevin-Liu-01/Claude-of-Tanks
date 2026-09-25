import {
  TELEMETRY_MAX_BODY_BYTES, telemetryDataPoint, validateTelemetryRecord, type TelemetryRecordKind,
} from '../../../server/telemetryRecord.ts';

/**
 * cot-telemetry — the entry-telemetry sink (docs/ENTRY-RESILIENCE.md).
 *
 * `POST /v1/session` takes the one `session` record a page load sends (and
 * its `entry` follow-up); `POST /v1/error` takes `error` records. Bodies are
 * `text/plain` so `navigator.sendBeacon` stays a simple cross-origin request
 * — no preflight — and are capped at 2 KB. The Origin allowlist, a per-address
 * rate limit and the shared v2 schema (`server/telemetryRecord.ts`) stand in
 * front of one Workers Analytics Engine data point per accepted record.
 * Nothing personal is stored: no address (the limiter key never leaves the
 * binding), no user agent, no name — a body naming such a field is refused.
 */

/** The bindings the handler touches; the generated `Env` satisfies it and tests pass stubs. */
export interface TelemetryEnv {
  ALLOWED_ORIGINS: string;
  TELEMETRY_LIMITER: { limit(options: { key: string }): Promise<{ success: boolean }> };
  COT_TELEMETRY: { writeDataPoint(point: { blobs?: string[]; doubles?: number[]; indexes?: string[] }): void };
}

const ROUTES: Record<string, readonly TelemetryRecordKind[]> = {
  '/v1/session': ['session', 'entry'],
  '/v1/error': ['error'],
};

/** The production origins from the `ALLOWED_ORIGINS` var, plus any localhost page for `wrangler dev`. */
export function allowedOrigin(origin: string | null, allowed: string): boolean {
  if (!origin) return false;
  if (/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/.test(origin)) return true;
  return allowed.split(',').some((value) => value.trim() === origin);
}

function headers(origin: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    'cache-control': 'no-store',
    vary: 'Origin',
    ...extra,
  };
}

function reply(status: number, body: Record<string, unknown> | null, origin: string, extra?: Record<string, string>): Response {
  if (status === 204 || body === null) return new Response(null, { status, headers: headers(origin, extra) });
  return Response.json(body, { status, headers: headers(origin, extra) });
}

/** Read at most `limit` bytes of the body; `null` means it is larger. */
async function readBounded(request: Request, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(joined);
}

export async function handleTelemetryRequest(request: Request, env: TelemetryEnv): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/healthz' && !url.search) {
    return Response.json({ ok: true, service: 'cot-telemetry', sink: 'analytics-engine' },
      { headers: { 'cache-control': 'no-store' } });
  }
  const kinds = ROUTES[url.pathname];
  if (!kinds) return Response.json({ error: 'not_found' }, { status: 404, headers: { 'cache-control': 'no-store' } });
  const origin = request.headers.get('Origin') || '';
  if (!allowedOrigin(origin, env.ALLOWED_ORIGINS)) {
    return Response.json({ error: 'origin_forbidden' }, { status: 403, headers: { 'cache-control': 'no-store', vary: 'Origin' } });
  }
  if (request.method === 'OPTIONS') return reply(204, null, origin);
  if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' }, origin, { allow: 'POST' });
  const { success } = await env.TELEMETRY_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'local' });
  if (!success) return reply(429, { error: 'rate_limited' }, origin, { 'retry-after': '60' });
  let text: string | null;
  try {
    text = await readBounded(request, TELEMETRY_MAX_BODY_BYTES);
  } catch {
    return reply(400, { error: 'invalid_body' }, origin);
  }
  if (text === null) return reply(413, { error: 'too_large' }, origin);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return reply(400, { error: 'invalid_json' }, origin);
  }
  const validated = validateTelemetryRecord(parsed);
  if (!validated.ok) return reply(400, { error: validated.error }, origin);
  if (!kinds.includes(validated.record.kind)) return reply(400, { error: 'invalid_record:route' }, origin);
  env.COT_TELEMETRY.writeDataPoint(telemetryDataPoint(validated.record));
  return reply(204, null, origin);
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleTelemetryRequest(request, env);
  },
} satisfies ExportedHandler<Env>;
