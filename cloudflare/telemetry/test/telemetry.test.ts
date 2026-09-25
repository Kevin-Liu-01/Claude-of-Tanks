import { env, exports } from 'cloudflare:workers';
import { describe, expect, it, vi } from 'vitest';
import { TELEMETRY_BLOBS, TELEMETRY_DOUBLES } from '../../../server/telemetryRecord.ts';
import { allowedOrigin, handleTelemetryRequest, type TelemetryEnv } from '../src/index.ts';

const origin = 'https://cot.kevinliu.studio';
const session = {
  v: 2, sid: 'sabcdef0123456789', build: 'v1.0.0+gd464a813f', kind: 'session', outcome: 'ready', stage: 'ready', ms: 4200,
  mode: 'unknown', t: { imports: 12, renderer: 40, 'gap>sky': 3, sky: 300, vehicle: 900 },
  cap: { webgl2: true, rendererFamily: 'apple', software: false, maxTextureUnits: 16, maxTextureSize: 16384,
    vertexTextureUnits: 16, colorBufferFloat: true, storage: true, worker: true, memoryClass: 'high', tier: 'desktop',
    autoTier: 'high', requiredTextureUnits: 16 },
  capOutcome: 'ok', entry: { mode: 'solo', outcome: 'ok', ms: 3000 },
};
const error = {
  v: 2, sid: 'sabcdef0123456789', build: 'v1.0.0+gd464a813f', kind: 'error', stage: 'sky', code: 'uncaught', ready: false,
  ms: 900, error: { message: 'Injected failure', frames: ['at bake (/assets/sky-1.js:1:2)'] },
};

interface Stub extends TelemetryEnv {
  points: Array<{ blobs?: string[]; doubles?: number[]; indexes?: string[] }>;
  limiterKeys: string[];
}

function stubEnv({ limited = false, allowed = origin }: { limited?: boolean; allowed?: string } = {}): Stub {
  const stub: Stub = {
    ALLOWED_ORIGINS: allowed,
    points: [],
    limiterKeys: [],
    TELEMETRY_LIMITER: { limit: vi.fn(async ({ key }: { key: string }) => { stub.limiterKeys.push(key); return { success: !limited }; }) },
    COT_TELEMETRY: { writeDataPoint: vi.fn((point) => { stub.points.push(point); }) },
  };
  return stub;
}

function post(path: string, body: unknown, init: { origin?: string | null; headers?: Record<string, string>; method?: string } = {}): Request {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const headers = new Headers({ 'content-type': 'text/plain;charset=UTF-8', ...(init.headers || {}) });
  if (init.origin !== null) headers.set('Origin', init.origin ?? origin);
  return new Request(`https://telemetry.test${path}`, { method: init.method ?? 'POST', headers, body: init.method === 'GET' ? undefined : text });
}

describe('cot-telemetry handler', () => {
  it('answers a health probe and refuses unknown routes', async () => {
    const stub = stubEnv();
    const health = await handleTelemetryRequest(new Request('https://telemetry.test/healthz'), stub);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true, service: 'cot-telemetry', sink: 'analytics-engine' });
    for (const path of ['/', '/v1', '/v1/sessions', '/api/telemetry']) {
      expect((await handleTelemetryRequest(post(path, session), stub)).status).toBe(404);
    }
    expect(stub.points).toHaveLength(0);
  });

  it('accepts a session record as a simple text/plain request and writes one data point', async () => {
    const stub = stubEnv();
    const response = await handleTelemetryRequest(post('/v1/session', session, {
      headers: { 'CF-Connecting-IP': '203.0.113.7', 'user-agent': 'Mozilla/5.0 (probe)' },
    }), stub);
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(stub.limiterKeys).toEqual(['203.0.113.7']);
    expect(stub.points).toHaveLength(1);
    const [point] = stub.points;
    expect(point.blobs).toHaveLength(TELEMETRY_BLOBS.length);
    expect(point.doubles).toHaveLength(TELEMETRY_DOUBLES.length);
    expect(point.indexes).toEqual(['v1.0.0+gd464a813f']);
    expect(point.blobs?.[TELEMETRY_BLOBS.indexOf('kind')]).toBe('session');
    expect(point.blobs?.[TELEMETRY_BLOBS.indexOf('rendererFamily')]).toBe('apple');
    expect(point.blobs?.[TELEMETRY_BLOBS.indexOf('entry')]).toBe('solo:ok:');
    expect(point.doubles?.[TELEMETRY_DOUBLES.indexOf('ms')]).toBe(4200);
    expect(point.doubles?.[TELEMETRY_DOUBLES.indexOf('stage:vehicle')]).toBe(900);
    const stored = JSON.stringify(point);
    expect(stored).not.toContain('203.0.113.7');
    expect(stored).not.toContain('Mozilla');
  });

  it('routes entry follow-ups and error records, and refuses a record on the wrong route', async () => {
    const stub = stubEnv();
    expect((await handleTelemetryRequest(post('/v1/session', { ...error, kind: 'entry', outcome: 'failed', mode: 'network', code: 'entry_failed_peer' }), stub)).status).toBe(204);
    expect((await handleTelemetryRequest(post('/v1/error', error), stub)).status).toBe(204);
    const misrouted = await handleTelemetryRequest(post('/v1/session', error), stub);
    expect(misrouted.status).toBe(400);
    expect(await misrouted.json()).toEqual({ error: 'invalid_record:route' });
    expect((await handleTelemetryRequest(post('/v1/error', session), stub)).status).toBe(400);
    expect(stub.points.map((point) => point.blobs?.[0])).toEqual(['entry', 'error']);
    expect(stub.points[1].doubles?.[TELEMETRY_DOUBLES.indexOf('ready')]).toBe(0);
  });

  it('checks the Origin allowlist before anything else, with localhost for wrangler dev', async () => {
    const stub = stubEnv();
    for (const bad of [null, '', 'https://attacker.example', 'http://cot.kevinliu.studio', 'https://cot.kevinliu.studio.evil']) {
      const refused = await handleTelemetryRequest(post('/v1/session', session, { origin: bad }), stub);
      expect(refused.status, String(bad)).toBe(403);
      expect(await refused.json()).toEqual({ error: 'origin_forbidden' });
    }
    expect(stub.limiterKeys).toHaveLength(0);
    expect(stub.points).toHaveLength(0);
    for (const local of ['http://localhost:5173', 'http://127.0.0.1:4187', 'http://localhost']) {
      expect((await handleTelemetryRequest(post('/v1/session', session, { origin: local }), stub)).status, local).toBe(204);
    }
    expect(allowedOrigin('https://claudeoftanks.kevinliu.studio', 'https://cot.kevinliu.studio, https://claudeoftanks.kevinliu.studio')).toBe(true);
    expect(allowedOrigin('http://localhost:4187/', '')).toBe(false);
    expect(allowedOrigin('http://localhost.evil', '')).toBe(false);
  });

  it('answers preflight and refuses other methods', async () => {
    const stub = stubEnv();
    const preflight = await handleTelemetryRequest(post('/v1/session', '', { method: 'OPTIONS' }), stub);
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-methods')).toBe('POST');
    expect(preflight.headers.get('access-control-allow-headers')).toBe('content-type');
    const get = await handleTelemetryRequest(post('/v1/session', '', { method: 'GET' }), stub);
    expect(get.status).toBe(405);
    expect(get.headers.get('allow')).toBe('POST');
    expect(stub.limiterKeys).toHaveLength(0);
  });

  it('rate limits per address through the binding and never stores the key', async () => {
    const stub = stubEnv({ limited: true });
    const limited = await handleTelemetryRequest(post('/v1/session', session, { headers: { 'CF-Connecting-IP': '198.51.100.9' } }), stub);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('60');
    expect(stub.limiterKeys).toEqual(['198.51.100.9']);
    expect(stub.points).toHaveLength(0);
    const local = stubEnv();
    await handleTelemetryRequest(post('/v1/session', session), local);
    expect(local.limiterKeys).toEqual(['local']);
  });

  it('caps bodies at 2 KB, declared or streamed', async () => {
    const stub = stubEnv();
    const large = { ...error, error: { message: 'x'.repeat(2100), frames: [] } };
    const tooLarge = await handleTelemetryRequest(post('/v1/error', large), stub);
    expect(tooLarge.status).toBe(413);
    expect(await tooLarge.json()).toEqual({ error: 'too_large' });
    const declared = await handleTelemetryRequest(post('/v1/session', session, { headers: { 'content-length': '5000' } }), stub);
    expect(declared.status).toBe(413);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 5; i++) controller.enqueue(new TextEncoder().encode('{'.padEnd(500, ' ')));
        controller.close();
      },
    });
    const streamed = await handleTelemetryRequest(new Request('https://telemetry.test/v1/session', {
      method: 'POST', body: stream, headers: { Origin: origin }, duplex: 'half',
    } as RequestInit), stub);
    expect(streamed.status).toBe(413);
    expect(stub.points).toHaveLength(0);
  });

  it('refuses malformed, out-of-schema and personal bodies, dropping unknown fields', async () => {
    const stub = stubEnv();
    for (const [body, refusal] of [
      ['{not json', 'invalid_json'],
      [[1, 2], 'invalid_body'],
      [{ ...session, v: 1 }, 'invalid_record:v'],
      [{ v: 1, sid: 'abcDEF12345', build: 'dev', events: [{ kind: 'boot_ready' }] }, 'invalid_record:v'],
      [{ ...session, sid: 'short' }, 'invalid_record:sid'],
      [{ ...session, outcome: 'maybe' }, 'invalid_record:outcome'],
      [{ ...session, ip: '1.2.3.4' }, 'pii_field:ip'],
      [{ ...session, cap: { ...session.cap, userAgent: 'Mozilla' } }, 'pii_field:userAgent'],
      [{ ...session, entry: { outcome: 'ok', playerName: 'Kevin' } }, 'pii_field:playerName'],
      [{ ...error, error: { message: 'x', frames: [], hostName: 'h' } }, 'pii_field:hostName'],
    ] as const) {
      const route = typeof body === 'object' && !Array.isArray(body) && (body as { kind?: string }).kind === 'error' ? '/v1/error' : '/v1/session';
      const refused = await handleTelemetryRequest(post(route, body), stub);
      expect(refused.status, refusal).toBe(400);
      expect(await refused.json()).toEqual({ error: refusal });
    }
    expect(stub.points).toHaveLength(0);
    const dropped = await handleTelemetryRequest(post('/v1/session', { ...session, unknownField: 1, t: { renderer: 12.4, 'bad key': 9 } }), stub);
    expect(dropped.status).toBe(204);
    expect(stub.points[0].blobs?.[TELEMETRY_BLOBS.indexOf('timings')]).toBe('renderer=12');
  });

  it('never throws past the sink: a body that cannot be read is a 400', async () => {
    const stub = stubEnv();
    const broken = new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error('socket reset')); } });
    const response = await handleTelemetryRequest(new Request('https://telemetry.test/v1/session', {
      method: 'POST', body: broken, headers: { Origin: origin }, duplex: 'half',
    } as RequestInit), stub);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_body' });
  });
});

describe('cot-telemetry Worker (real bindings)', () => {
  it('serves the health probe and accepts a session through the configured bindings', async () => {
    expect(env.ALLOWED_ORIGINS).toContain('https://cot.kevinliu.studio');
    const health = await exports.default.fetch('https://telemetry.test/healthz');
    expect(health.status).toBe(200);
    const accepted = await exports.default.fetch(post('/v1/session', session));
    expect(accepted.status).toBe(204);
    const refused = await exports.default.fetch(post('/v1/session', session, { origin: 'https://attacker.example' }));
    expect(refused.status).toBe(403);
  });
});
