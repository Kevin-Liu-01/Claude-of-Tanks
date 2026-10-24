// The room service's daily limit (security audit 2026-10-22, NV-5/NV-9; owner ruling 2026-10-23: Workers Free stays):
// the status probe reads Cloudflare's 1027/429 refusal; the Play menu shows one limit state; a room interrupted by the
// limit stops instead of reconnecting into it; while a remembered limit lasts no socket is opened; LAN rooms never ask.
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { classifyRoomsHealth, createRoomsStatusHandler } from '../../../api/rooms-status.ts';
import {
  ROOM_SERVICE_LIMIT_KEY, createRoomServiceLimit, isDailyCappedRoomsUrl, nextUtcMidnight,
} from './roomServiceLimit.ts';
import { createRoomConnectionAdapter } from './playMenuAdapter.ts';
import { classifyRoomFailure } from './roomFailure.ts';
import { RoomClient } from '../room/roomClient.ts';
import { createRoomsServer } from '../../../server/rooms/serve.ts';
import { silentLogger } from '../../../server/match/log.ts';

// ---- the probe's classification: Cloudflare's daily-limit refusal (error 1027, a 429) is `limited`
assert.equal(classifyRoomsHealth(200, ''), 'ok');
assert.equal(classifyRoomsHealth(429, '<html>error code: 1027</html>'), 'limited');
assert.equal(classifyRoomsHealth(429, ''), 'limited');
assert.equal(classifyRoomsHealth(503, 'Error 1027 · This website has been temporarily rate limited'), 'limited');
assert.equal(classifyRoomsHealth(503, '{"error":"room_unconfigured"}'), 'unavailable');
assert.equal(classifyRoomsHealth(500, ''), 'unavailable');

// ---- the API: GET only, the state as JSON, cached at the edge
async function invoke(handler, method = 'GET') {
  const headers = new Map();
  let text = '';
  const response = { statusCode: 200, setHeader(name, value) { headers.set(name.toLowerCase(), value); }, end(value = '') { text = String(value); } };
  await handler({ method, headers: {} }, response);
  return { status: response.statusCode, headers, body: text ? JSON.parse(text) : null };
}
const probed = [];
const limitedApi = await invoke(createRoomsStatusHandler({ warn: () => {}, fetchImpl: async (url) => { probed.push(url); return new Response('error code: 1027', { status: 429 }); } }));
assert.deepEqual(limitedApi.body, { state: 'limited' });
assert.equal(probed[0], 'https://cot-rooms.kk23907751.workers.dev/healthz', 'the rooms Worker health route, over https');
assert.match(limitedApi.headers.get('cache-control'), /s-maxage=300/, 'a limit is cached at the edge');
const okApi = await invoke(createRoomsStatusHandler({ fetchImpl: async () => new Response('{"ok":true}', { status: 200 }) }));
assert.deepEqual(okApi.body, { state: 'ok' });
assert.match(okApi.headers.get('cache-control'), /s-maxage=120/);
const downApi = await invoke(createRoomsStatusHandler({ warn: () => {}, fetchImpl: async () => { throw new TypeError('fetch failed'); } }));
assert.deepEqual(downApi.body, { state: 'unavailable' });
assert.equal((await invoke(createRoomsStatusHandler(), 'POST')).status, 405);

// ---- the client's limit: daily-capped hosts only, remembered until the next 00:00 UTC, an `ok` forgets it
assert.equal(isDailyCappedRoomsUrl('wss://cot-rooms.kk23907751.workers.dev'), true);
assert.equal(isDailyCappedRoomsUrl('ws://192.168.1.20:8792'), false, 'a LAN helper has no daily cap');
assert.equal(isDailyCappedRoomsUrl('ws://127.0.0.1:8792'), false);
assert.equal(nextUtcMidnight(Date.UTC(2026, 9, 23, 18, 30)), Date.UTC(2026, 9, 24));
const memory = () => { const map = new Map(); return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k), map }; };
{
  const storage = memory();
  let state = 'limited';
  const at = Date.UTC(2026, 9, 23, 18, 30);
  const limit = createRoomServiceLimit({ storage, now: () => at, fetchImpl: async () => new Response(JSON.stringify({ state }), { status: 200 }) });
  assert.equal(limit.until(), null);
  assert.equal(await limit.check(), 'limited');
  assert.equal(limit.until(), Date.UTC(2026, 9, 24), 'remembered until 00:00 UTC');
  assert.equal(storage.getItem(ROOM_SERVICE_LIMIT_KEY), String(Date.UTC(2026, 9, 24)), 'across reloads');
  const later = createRoomServiceLimit({ storage, now: () => Date.UTC(2026, 9, 24, 0, 0, 1) });
  assert.equal(later.until(), null, 'a new UTC day starts without it');
  state = 'ok';
  assert.equal(await limit.check(), 'ok');
  assert.equal(limit.until(), null, 'an ok status forgets it');
  const unreachable = createRoomServiceLimit({ storage, fetchImpl: async () => { throw new TypeError('offline'); } });
  assert.equal(await unreachable.check(), 'unavailable', 'no answer is not a limit');
}

// ---- the Play menu over real sockets: a room interrupted by the limit stops; a remembered limit opens no socket
const SECRET = 'room-service-limit-receipt-0123456789';
const server = await createRoomsServer({ host: '127.0.0.1', port: 0, seatSecret: SECRET, world: 'terrain', matchTransport: 'p2p', log: silentLogger });
const sockets = [];
let status = 'ok';
let checks = 0;
let remembered = null;
const serviceLimit = {
  appliesTo: (url) => url === server.url || url.startsWith('wss://'),
  until: () => remembered,
  check: async () => { checks++; if (status === 'limited') remembered = Date.now() + 60_000; else remembered = null; return status; },
};
const closes = [];
const errors = [];
const adapter = createRoomConnectionAdapter({
  storage: memory(),
  clientBuild: 'receipt',
  serviceLimit,
  createRoomClient: (options) => new RoomClient({
    ...options, pingIntervalMs: 0,
    transport: {
      createSocket: (url) => { const ws = new WebSocket(url); ws.on('error', () => {}); sockets.push(ws); return ws; },
      reconnect: { initialDelayMs: 50, maxDelayMs: 100, factor: 1, jitterFraction: 0, windowMs: 20_000, attemptTimeoutMs: 300 },
    },
  }),
  onClose: (reason) => closes.push(reason),
  onError: (error) => errors.push(error),
});
const request = (overrides = {}) => ({
  kind: 'create', mode: 'private', teamSize: 2, roomsUrl: server.url, player: { id: 'p_limit01', name: 'Limit' },
  selection: { specId: 'm1a1_abrams_hc', mapId: 'verdant' }, ...overrides,
});
const until = (predicate, label, timeoutMs = 8000) => new Promise((resolve, reject) => {
  const started = Date.now();
  const poll = () => { if (predicate()) resolve(); else if (Date.now() - started > timeoutMs) reject(new Error(`timeout: ${label}`)); else setTimeout(poll, 10); };
  poll();
});
try {
  const connection = await adapter.connect(request());
  assert.ok(connection, 'the room opened');
  assert.equal(checks, 0, 'a healthy admission asks nothing');
  // the service starts refusing: the room drops, the status says limited, the client stops instead of reconnecting
  status = 'limited';
  await server.close();
  await until(() => closes.length === 1, 'the interrupted room closes');
  assert.equal(closes[0], 'room_service_limited');
  assert.equal(checks, 1, 'one status ask for the interruption');
  const failure = classifyRoomFailure(closes[0]);
  assert.deepEqual(failure, { code: 'room_service_limited', canRetry: true, roomEnded: false }, 'one limit state: an explicit retry, never an automatic one');
  const socketsAtStop = sockets.length;
  await new Promise((resolve) => setTimeout(resolve, 600));
  assert.equal(sockets.length, socketsAtStop, 'no reconnect attempt into the limit');

  // a remembered limit: the next attempt asks the status once and opens no socket
  await assert.rejects(adapter.connect(request()), (error) => error.code === 'room_service_limited');
  assert.equal(sockets.length, socketsAtStop, 'no socket while the limit holds');
  assert.equal(errors.at(-1)?.code, 'room_service_limited', 'the menu hears the limit state');

  // a failed admission against a daily-capped host asks once and reports the limit, not a generic outage
  remembered = null;
  const before = checks;
  await assert.rejects(adapter.connect(request({ roomsUrl: 'wss://127.0.0.1:9' })), (error) => error.code === 'room_service_limited');
  assert.equal(checks, before + 1);

  // a LAN helper never asks: its failure stays a plain unreachable host
  status = 'ok';
  const lan = createRoomConnectionAdapter({ storage: memory(), serviceLimit: { ...serviceLimit, appliesTo: () => false },
    createRoomClient: (options) => new RoomClient({ ...options, pingIntervalMs: 0, requestTimeoutMs: 400,
      transport: { createSocket: (url) => { const ws = new WebSocket(url); ws.on('error', () => {}); return ws; }, reconnect: { initialDelayMs: 20, maxDelayMs: 40, factor: 1, jitterFraction: 0, windowMs: 600, attemptTimeoutMs: 300 } } }) });
  const lanChecks = checks;
  await assert.rejects(lan.connect(request({ roomsUrl: 'ws://127.0.0.1:9' })), (error) => error.code === 'room_unreachable');
  assert.equal(checks, lanChecks, 'LAN asks nothing');
  console.log('roomServiceLimit: PASS');
} finally {
  adapter.close();
  for (const ws of sockets) { try { ws.terminate(); } catch { /* closed */ } }
}
