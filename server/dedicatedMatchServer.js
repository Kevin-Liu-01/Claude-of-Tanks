import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createWebSocketTransport } from '../src/net/channelTransport.ts';
import { DedicatedMatchRegistry } from './dedicatedMatchRegistry.js';
import { RankedMatchmaker } from './rankedMatchmaker.js';
import { RatingStore } from './ratingStore.js';

const AUTH_TIMEOUT_MS = 5000;
const MAX_MESSAGES_PER_SECOND = 180;

function json(response, status, body, headers = {}) {
  const data = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data),
    'cache-control': 'no-store',
    ...headers,
  });
  response.end(data);
}

function corsHeaders(request, origins) {
  const origin = request.headers.origin;
  if (!origin || (origins && !origins.has(origin))) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
    vary: 'origin',
  };
}

function bearer(request) {
  const match = /^Bearer\s+(.+)$/i.exec(String(request.headers.authorization || ''));
  return match ? match[1] : '';
}

async function readJson(request, maxBytes = 16 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error('request body is too large'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch (_) { throw Object.assign(new Error('request body must be valid JSON'), { status: 400 }); }
}

function parseAllowedOrigins(value) {
  if (!value) return null;
  const values = Array.isArray(value) ? value : String(value).split(',');
  return new Set(values.map((origin) => origin.trim()).filter(Boolean));
}

export async function createDedicatedMatchServer({
  host = '127.0.0.1',
  port = 0,
  allowedOrigins = null,
  autoTick = true,
  registry = new DedicatedMatchRegistry(),
  matchmaker = new RankedMatchmaker({
    registry,
    ratings: new RatingStore({ filePath: process.env.COT_RATING_FILE || null }),
  }),
} = {}) {
  const origins = parseAllowedOrigins(allowedOrigins);
  const server = http.createServer(async (request, response) => {
    const headers = corsHeaders(request, origins);
    if (origins && request.headers.origin && !origins.has(request.headers.origin)) {
      json(response, 403, { error: 'origin_forbidden' });
      return;
    }
    let url;
    try { url = new URL(request.url, 'http://localhost'); }
    catch (_) { json(response, 400, { error: 'invalid_url' }, headers); return; }
    if (request.method === 'OPTIONS' && url.pathname.startsWith('/ranked/')) {
      response.writeHead(204, headers);
      response.end();
      return;
    }
    try {
      if (request.method === 'GET' && url.pathname === '/healthz') {
        json(response, 200, { ok: true, service: 'cot-match', ...registry.stats(),
          ...matchmaker.stats() }, headers);
      } else if (request.method === 'POST' && url.pathname === '/ranked/identity') {
        const body = await readJson(request);
        json(response, 201, matchmaker.createIdentity({ name: body.name }), headers);
      } else if (request.method === 'GET' && url.pathname === '/ranked/leaderboard') {
        json(response, 200, { players: matchmaker.leaderboard(url.searchParams.get('limit')) }, headers);
      } else if (request.method === 'GET' && url.pathname.startsWith('/ranked/profile/')) {
        const playerId = decodeURIComponent(url.pathname.slice('/ranked/profile/'.length));
        const profile = matchmaker.profile(playerId);
        json(response, profile ? 200 : 404, profile || { error: 'profile_not_found' }, headers);
      } else if (request.method === 'POST' && url.pathname === '/ranked/queue') {
        const body = await readJson(request);
        const queued = matchmaker.join({ ...body, identityToken: bearer(request) });
        json(response, 202, queued, headers);
      } else if (url.pathname.startsWith('/ranked/queue/')) {
        const ticketId = decodeURIComponent(url.pathname.slice('/ranked/queue/'.length));
        const token = bearer(request);
        if (request.method === 'GET') {
          const ticket = matchmaker.poll(ticketId, token);
          json(response, ticket ? 200 : 404, ticket || { error: 'ticket_not_found' }, headers);
        } else if (request.method === 'DELETE') {
          const cancelled = matchmaker.cancel(ticketId, token);
          json(response, cancelled ? 200 : 409,
            cancelled ? { cancelled: true } : { error: 'ticket_not_cancellable' }, headers);
        } else json(response, 405, { error: 'method_not_allowed' }, headers);
      } else json(response, 404, { error: 'not_found' }, headers);
    } catch (error) {
      json(response, error.status || (error.code === 'ranked_auth_failed' ? 401 : 400), {
        error: error.code || 'invalid_request',
        message: error.message,
      }, headers);
    }
  });
  const sockets = new WebSocketServer({
    noServer: true,
    maxPayload: 64 * 1024,
    perMessageDeflate: false,
  });

  server.on('upgrade', (request, socket, head) => {
    let path;
    try { path = new URL(request.url, 'http://localhost').pathname; } catch (_) { path = ''; }
    const origin = request.headers.origin;
    if (path !== '/match' || (origins && (!origin || !origins.has(origin)))) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    sockets.handleUpgrade(request, socket, head, (websocket) => {
      sockets.emit('connection', websocket, request);
    });
  });

  sockets.on('connection', (socket) => {
    let authenticated = false;
    const timeout = setTimeout(() => socket.close(4401, 'authentication_timeout'), AUTH_TIMEOUT_MS);
    const authenticate = (raw) => {
      if (authenticated) return;
      let message;
      try { message = JSON.parse(String(raw)); } catch (_) { message = null; }
      if (!message || message.type !== 'match_auth') {
        socket.close(4401, 'authentication_required');
        return;
      }
      try {
        authenticated = true;
        clearTimeout(timeout);
        socket.off('message', authenticate);
        let windowStartedAt = Date.now();
        let messages = 0;
        socket.on('message', () => {
          const now = Date.now();
          if (now - windowStartedAt >= 1000) { windowStartedAt = now; messages = 0; }
          messages++;
          if (messages > MAX_MESSAGES_PER_SECOND) socket.close(4429, 'rate_limit');
        });
        const transport = createWebSocketTransport(socket, {
          maxMessageBytes: 64 * 1024,
          maxBufferedBytes: 512 * 1024,
        });
        registry.attach({
          matchId: message.matchId,
          playerId: message.playerId,
          token: message.token,
          transport,
        });
      } catch (_) {
        socket.close(4403, 'authentication_failed');
      }
    };
    socket.on('message', authenticate);
    socket.once('close', () => clearTimeout(timeout));
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  let timer = null;
  let lastTickMs = performance.now();
  if (autoTick) {
    timer = setInterval(() => {
      const now = performance.now();
      registry.advance(Math.max(0, now - lastTickMs));
      matchmaker.reconcile();
      lastTickMs = now;
    }, 8);
    if (typeof timer.unref === 'function') timer.unref();
  }

  return {
    registry,
    matchmaker,
    server,
    sockets,
    address: server.address(),
    advance(elapsedMs) {
      const steps = registry.advance(elapsedMs);
      matchmaker.reconcile();
      return steps;
    },
    async close(reason = 'server_closed') {
      if (timer) clearInterval(timer);
      registry.close(reason);
      for (const client of sockets.clients) client.close(1001, reason);
      await new Promise((resolve) => sockets.close(() => resolve()));
      await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) {
  const host = process.env.COT_MATCH_HOST || '127.0.0.1';
  const port = Number(process.env.COT_MATCH_PORT || 8790);
  createDedicatedMatchServer({
    host,
    port,
    allowedOrigins: process.env.COT_ALLOWED_ORIGINS || null,
  }).then(() => {
    console.log(`[match] ws://${host}:${port}/match`);
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
