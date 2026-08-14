import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createWebSocketTransport } from '../src/net/channelTransport.js';
import { DedicatedMatchRegistry } from './dedicatedMatchRegistry.js';

const AUTH_TIMEOUT_MS = 5000;
const MAX_MESSAGES_PER_SECOND = 180;

function json(response, status, body) {
  const data = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data),
    'cache-control': 'no-store',
  });
  response.end(data);
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
} = {}) {
  const origins = parseAllowedOrigins(allowedOrigins);
  const server = http.createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/healthz') {
      json(response, 200, { ok: true, service: 'cot-match', ...registry.stats() });
    } else json(response, 404, { error: 'not_found' });
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
      lastTickMs = now;
    }, 8);
    if (typeof timer.unref === 'function') timer.unref();
  }

  return {
    registry,
    server,
    sockets,
    address: server.address(),
    advance: (elapsedMs) => registry.advance(elapsedMs),
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
