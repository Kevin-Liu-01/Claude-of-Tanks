import type { RuntimeValue } from '../src/runtimeTypes.ts';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { pathToFileURL } from 'node:url';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { createIceConfigHandler, type IceConfigHandler } from '../api/ice.ts';
import { installProcessShutdown } from './processShutdown.ts';
import {
  SignalingRoomStore,
  type CreateRoomOptions,
  type JoinRoomOptions,
  type RelaySignalOptions,
  type SignalingConnection,
  type SignalingJoinResult,
  type SignalingMessage,
} from './roomStore.ts';

const MAX_PAYLOAD_BYTES = 128 * 1024;
const RATE_WINDOW_MS = 10_000;
const RATE_MAX_MESSAGES = 120;
const LEGACY_SWEEP_INTERVAL_MS = 60_000;

type MaybePromise<T> = T | Promise<T>;

interface StoreNotification {
  connection?: SignalingConnection | null;
  peerId?: string;
  message: SignalingMessage;
}

interface StoreJoinResponse {
  result: SignalingJoinResult;
  notify: StoreNotification[];
}

export interface SignalingStore {
  rooms?: Map<RuntimeValue, RuntimeValue>;
  membership?: { has(connection: SignalingConnection): boolean };
  create(connection: SignalingConnection, options?: CreateRoomOptions):
    MaybePromise<SignalingJoinResult>;
  join(connection: SignalingConnection, options?: JoinRoomOptions):
    MaybePromise<StoreJoinResponse>;
  relay(connection: SignalingConnection, options?: RelaySignalOptions):
    MaybePromise<StoreNotification>;
  leave(connection: SignalingConnection, reason?: string): MaybePromise<StoreNotification[]>;
  sweepExpired(): MaybePromise<StoreNotification[]>;
  nextExpiryAt?(): number | null;
  detach?(connection: SignalingConnection, reason?: string): MaybePromise<StoreNotification[]>;
  poll?(connection: SignalingConnection): MaybePromise<StoreNotification[]>;
  deliver?(notification: StoreNotification): MaybePromise<boolean>;
  setDeliveryHandler?(
    handler: (connection: SignalingConnection, message: SignalingMessage) => boolean,
  ): void;
  health?(timeoutMs?: number): Promise<RuntimeValue>;
  start?(): Promise<void>;
  close?(): Promise<void>;
}

export interface SignalingServerOptions {
  host?: string;
  port?: number;
  allowedOrigins?: readonly string[] | null;
  webSocketPaths?: readonly string[];
  healthPaths?: readonly string[];
  icePaths?: readonly string[];
  iceConfigHandler?: IceConfigHandler;
  store?: SignalingStore;
  now?: () => number;
  cleanupIntervalMs?: number;
  unauthenticatedTimeoutMs?: number;
}

export interface SignalingServerService {
  server: http.Server;
  webSocketServer: WebSocketServer;
  store: SignalingStore;
  listen(): Promise<AddressInfo>;
  close(): Promise<void>;
}

interface SignalingEnvelope extends Record<string, RuntimeValue> {
  type: string;
  requestId?: RuntimeValue;
  payload?: RuntimeValue;
}

interface RateWindow {
  start: number;
  count: number;
  acceptedAt: number;
  authenticated: boolean;
  retired: boolean;
  terminal?: { message: SignalingMessage; queuedAt: number };
}

interface SignalingHealth {
  ok: boolean;
  rooms: number | null;
  distributed?: boolean;
  redis?: Record<string, RuntimeValue>;
}

function isRecord(value: RuntimeValue): value is Record<string, RuntimeValue> {
  return typeof value === 'object' && value !== null;
}

function errorCode(value: RuntimeValue, fallback: string): string {
  return isRecord(value) && typeof value.code === 'string' ? value.code : fallback;
}

function safeSend(connection: SignalingConnection | null | undefined, message: RuntimeValue): boolean {
  if (!connection) return false;
  const socket = connection as WebSocket;
  if (socket.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify(message));
  return true;
}

function errorMessage(error: RuntimeValue, requestId: RuntimeValue = null): SignalingMessage {
  return {
    type: 'error',
    ...(requestId ? { requestId: String(requestId) } : {}),
    payload: {
      code: errorCode(error, 'invalid_request'),
      message: error instanceof Error ? error.message : 'invalid request',
    },
  };
}

function validateSignal(signal: RuntimeValue): Record<string, RuntimeValue> {
  if (!isRecord(signal)) throw new Error('invalid RTC signal');
  if (signal.kind === 'restart') return { kind: 'restart' };
  if (signal.kind === 'description') {
    const description = signal.description;
    if (!isRecord(description) || !['offer', 'answer'].includes(String(description.type)) ||
        typeof description.sdp !== 'string' || description.sdp.length > 96_000) {
      throw new Error('invalid RTC description');
    }
    return signal;
  }
  if (signal.kind === 'ice') {
    const candidate = signal.candidate;
    if (!isRecord(candidate) || typeof candidate.candidate !== 'string' ||
        candidate.candidate.length > 8_000) {
      throw new Error('invalid ICE candidate');
    }
    return signal;
  }
  throw new Error('unknown RTC signal');
}

function originAllowed(origin: RuntimeValue, allowedOrigins: readonly string[] | null): boolean {
  if (allowedOrigins === null) return true;
  return typeof origin === 'string' && allowedOrigins.includes(origin);
}

function mayDispatchReceivedEnvelope(connection: WebSocket, message: SignalingEnvelope): boolean {
  return connection.readyState === WebSocket.OPEN || message.type === 'room_leave';
}

export function createSignalingServer({
  host = '127.0.0.1',
  port = 7777,
  allowedOrigins = null,
  webSocketPaths = ['/signal'],
  healthPaths = ['/healthz'],
  icePaths = ['/api/ice'],
  iceConfigHandler = createIceConfigHandler(),
  store = new SignalingRoomStore(),
  now = Date.now,
  cleanupIntervalMs = 5_000,
  unauthenticatedTimeoutMs = 15_000,
}: SignalingServerOptions = {}): SignalingServerService {
  if (allowedOrigins && allowedOrigins.length === 0) {
    throw new TypeError('COT_ALLOWED_ORIGINS must contain at least one exact origin');
  }
  if (!Number.isFinite(cleanupIntervalMs) || cleanupIntervalMs < 10 || cleanupIntervalMs > 15_000) {
    throw new TypeError('cleanupIntervalMs must be between 10 and 15000');
  }
  if (!Number.isFinite(unauthenticatedTimeoutMs) || unauthenticatedTimeoutMs <= 0) {
    throw new TypeError('unauthenticatedTimeoutMs must be positive');
  }
  const allowedWebSocketPaths = new Set(webSocketPaths);
  const allowedHealthPaths = new Set(healthPaths);
  const allowedIcePaths = new Set(icePaths);
  const webSocketServer = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_PAYLOAD_BYTES,
    perMessageDeflate: false,
  });
  const rate = new WeakMap<WebSocket, RateWindow>();
  let closing = false;
  let cleanupPending: Promise<void> | null = null;
  let closePending: Promise<void> | null = null;
  let lastLegacySweepAt = now();
  const server = http.createServer(async (request, response) => {
    let pathname = '';
    try { pathname = new URL(String(request.url || ''), 'http://localhost').pathname; }
    catch (_) { /* 404 below */ }
    if (allowedIcePaths.has(pathname)) {
      await iceConfigHandler(request, response);
      return;
    }
    if (allowedHealthPaths.has(pathname)) {
      const health: SignalingHealth = {
        ok: true,
        rooms: store.rooms instanceof Map ? store.rooms.size : null,
      };
      if (typeof store.deliver === 'function') health.distributed = true;
      if (typeof store.health === 'function') {
        try {
          const result = await store.health();
          health.redis = isRecord(result) ? result : { ok: false, code: 'redis_invalid_health' };
          health.ok = health.redis.ok === true;
        } catch (error) {
          health.ok = false;
          health.redis = {
            ok: false,
            code: errorCode(error, 'redis_unavailable'),
          };
        }
      }
      response.writeHead(health.ok ? 200 : 503, { 'content-type': 'application/json' });
      response.end(JSON.stringify(health));
      return;
    }
    response.writeHead(404);
    response.end();
  });

  function retire(connection: WebSocket, reason: string): void {
    const state = rate.get(connection);
    if (!state || state.retired) return;
    state.retired = true;
    if (reason === 'resume_denied') {
      safeSend(connection, errorMessage(Object.assign(new Error('room connection was replaced'), {
        code: 'resume_denied',
      })));
    }
    connection.close(1008, reason);
  }

  function deliverLocally(connection: SignalingConnection | null | undefined, message: SignalingMessage): boolean {
    const delivered = safeSend(connection, message);
    // Queue-backed stores call this only when the notification is actually
    // delivered, not when it is merely enqueued for a later room_poll.
    if (connection && message.type === 'room_closed') {
      retire(connection as WebSocket, String(message.payload.reason || 'room_closed'));
    }
    return delivered;
  }

  async function sendNotifications(notifications: StoreNotification[] | null | undefined): Promise<void> {
    for (const notification of notifications || []) {
      if (typeof store.deliver === 'function') {
        const state = notification.connection && rate.get(notification.connection as WebSocket);
        if (state && notification.message.type === 'room_closed') {
          state.terminal = { message: notification.message, queuedAt: now() };
        }
        await store.deliver(notification);
      }
      else deliverLocally(notification.connection, notification.message);
    }
  }
  if (typeof store.setDeliveryHandler === 'function') {
    store.setDeliveryHandler(deliverLocally);
  }

  function retireUnauthenticatedConnections(): void {
    for (const connection of webSocketServer.clients) {
      const state = rate.get(connection);
      if (!state || state.retired) continue;
      if (!state.authenticated && now() - state.acceptedAt >= unauthenticatedTimeoutMs) {
        retire(connection, 'authentication_timeout');
      } else if (state.terminal && now() - state.terminal.queuedAt >= unauthenticatedTimeoutMs) {
        // A local terminal recipient cannot remain open forever if its
        // optional mailbox delivery path stalls. Preserve the terminal reason.
        deliverLocally(connection, state.terminal.message);
      }
    }
  }

  function retireReplacedConnections(): void {
    for (const connection of webSocketServer.clients) {
      const state = rate.get(connection);
      if (state?.authenticated && !state.retired && !state.terminal &&
          store.membership && !store.membership.has(connection)) {
        retire(connection, 'resume_denied');
      }
    }
  }

  async function cleanup(): Promise<void> {
    if (closing) return;
    // Socket deadlines must not wait behind a slow optional distributed sweep.
    retireUnauthenticatedConnections();
    if (cleanupPending) return cleanupPending;
    cleanupPending = (async () => {
      const deadline = store.nextExpiryAt?.();
      const sweepDue = typeof store.nextExpiryAt === 'function'
        ? deadline != null && deadline <= now()
        : now() - lastLegacySweepAt >= LEGACY_SWEEP_INTERVAL_MS;
      if (sweepDue) {
        lastLegacySweepAt = now();
        const notifications = await store.sweepExpired();
        if (closing) return;
        await sendNotifications(notifications);
      }
      retireReplacedConnections();
    })();
    try { await cleanupPending; }
    finally { cleanupPending = null; }
  }

  async function acceptAdmission(connection: WebSocket): Promise<boolean> {
    const state = rate.get(connection);
    if (state && !state.authenticated && now() - state.acceptedAt >= unauthenticatedTimeoutMs) {
      retire(connection, 'authentication_timeout');
    }
    if (!state || state.retired || connection.readyState !== WebSocket.OPEN) {
      // An asynchronous store request may finish after the unauthenticated
      // socket deadline. Do not leave that newly installed seat attached.
      if (typeof store.detach === 'function') await store.detach(connection, 'connection_closed');
      else await sendNotifications(await store.leave(connection, 'connection_closed'));
      return false;
    }
    state.authenticated = true;
    retireReplacedConnections();
    return !state.retired;
  }

  server.on('upgrade', (request, socket, head) => {
    let pathname = '';
    try { pathname = new URL(String(request.url || ''), 'http://localhost').pathname; }
    catch (_) { /* reject below */ }
    if (closing || !allowedWebSocketPaths.has(pathname) || !originAllowed(request.headers.origin, allowedOrigins)) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    webSocketServer.handleUpgrade(request, socket, head, (connection: WebSocket) => {
      webSocketServer.emit('connection', connection, request);
    });
  });

  webSocketServer.on('connection', (connection: WebSocket) => {
    const acceptedAt = now();
    rate.set(connection, { start: acceptedAt, count: 0, acceptedAt, authenticated: false, retired: false });
    let messageChain: Promise<void> = Promise.resolve();
    connection.on('message', (data: RawData, isBinary: boolean) => {
      const limit = rate.get(connection);
      if (!limit || limit.retired || connection.readyState !== WebSocket.OPEN) return;
      const receivedAt = now();
      if (receivedAt - limit.start >= RATE_WINDOW_MS) {
        limit.start = receivedAt;
        limit.count = 0;
      }
      limit.count++;
      if (limit.count > RATE_MAX_MESSAGES) {
        retire(connection, 'rate_limit');
        return;
      }
      messageChain = messageChain.then(async () => {
        // Admission must not revive a lease that expired between timer ticks.
        // Legacy distributed stores keep their existing 60-second sweep;
        // local socket housekeeping never introduces a Redis poll per message.
        await cleanup();
        if (closing || limit.retired) return;
        if (isBinary) {
          safeSend(connection, errorMessage(Object.assign(new Error('binary signaling is unsupported'), {
            code: 'invalid_payload',
          })));
          return;
        }
        let message: SignalingEnvelope | null = null;
        try {
          const parsed: RuntimeValue = JSON.parse(data.toString());
          if (!isRecord(parsed) || typeof parsed.type !== 'string') {
            throw new Error('invalid message');
          }
          message = parsed as SignalingEnvelope;
          // Clients send Leave then native close in order. The frame arrived
          // OPEN, but the asynchronous cleanup above may observe CLOSING by
          // now. Preserve that explicit departure before the close handler's
          // detach; store.leave fences it to this exact connection generation.
          // Closed sockets still cannot create, join, relay, or renew activity.
          if (!mayDispatchReceivedEnvelope(connection, message)) return;
          const requestId = message.requestId == null ? null : String(message.requestId);
          const payload = isRecord(message.payload) ? message.payload : {};
          switch (message.type) {
            case 'room_create': {
              const result = await store.create(connection, payload);
              if (!await acceptAdmission(connection)) break;
              safeSend(connection, { type: 'room_created', requestId, payload: result });
              break;
            }
            case 'room_join': {
              const joined = await store.join(connection, payload);
              if (!await acceptAdmission(connection)) break;
              safeSend(connection, { type: 'room_joined', requestId, payload: joined.result });
              await sendNotifications(joined.notify);
              break;
            }
            case 'room_signal': {
              const notification = await store.relay(connection, {
                roomCode: payload.roomCode,
                toPeerId: payload.toPeerId,
                toSessionId: payload.toSessionId,
                signal: validateSignal(payload.signal),
              });
              await sendNotifications([notification]);
              break;
            }
            case 'room_poll':
              if (typeof store.poll === 'function') {
                await sendNotifications(await store.poll(connection));
              }
              // Browser WebSockets do not expose protocol ping/pong. Correlate
              // the durable-mailbox poll so the client can detect a silently
              // blackholed socket instead of waiting for an RTC rebuild to
              // discover that signaling disappeared minutes earlier.
              if (requestId) {
                safeSend(connection, {
                  type: 'room_polled',
                  requestId,
                  payload: { roomCode: String(payload.roomCode || '') },
                });
              }
              break;
            case 'room_leave':
              await sendNotifications(await store.leave(connection, 'client_leave'));
              if (limit.authenticated) retire(connection, 'client_leave');
              break;
            default:
              throw Object.assign(new Error('unknown signaling message'), { code: 'unknown_message' });
          }
        } catch (error) {
          safeSend(connection, errorMessage(error, message?.requestId));
        }
      }).catch((error) => {
        safeSend(connection, errorMessage(Object.assign(new Error('signaling operation failed'), {
          code: 'signaling_store_unavailable', cause: error,
        })));
      });
    });
    connection.on('close', () => {
      messageChain.then(async () => {
        if (closing) return;
        // A WebSocket is only the rendezvous transport. Mobile radio changes,
        // sleeping tabs, serverless recycling, and temporary Redis outages
        // must not destroy a healthy peer-to-peer room. Explicit room_leave
        // still performs the durable departure; an unclean socket close only
        // detaches this process-local connection so the stable player id can
        // resume the same membership on a replacement socket.
        if (typeof store.detach === 'function') await store.detach(connection, 'connection_closed');
        else await sendNotifications(await store.leave(connection, 'connection_closed'));
      }).catch((error) => console.error('[signal] Failed to close room membership', error));
    });
  });

  const sweepTimer: ReturnType<typeof setInterval> = setInterval(() => {
    cleanup()
      .catch((error) => console.error('[signal] Room sweep failed', error));
  }, cleanupIntervalMs);
  if (typeof sweepTimer.unref === 'function') sweepTimer.unref();

  return {
    server,
    webSocketServer,
    store,
    async listen(): Promise<AddressInfo> {
      if (server.listening) {
        const listeningAddress = server.address();
        if (listeningAddress && typeof listeningAddress !== 'string') return listeningAddress;
        throw new Error('signaling server has no TCP address');
      }
      // A distributed store can serve durable REST-backed signaling while its
      // optional pub/sub accelerator reconnects in the background.
      if (typeof store.start === 'function') store.start().catch((error) => {
        console.warn('[signal] Redis subscriber unavailable; using mailbox polling', error?.code || error);
      });
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error): void => {
          server.off('listening', onListen);
          reject(error);
        };
        const onListen = (): void => { server.off('error', onError); resolve(); };
        server.once('error', onError);
        server.once('listening', onListen);
        server.listen(port, host);
      });
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('signaling server did not bind a TCP address');
      }
      return address;
    },
    close(): Promise<void> {
      if (closePending) return closePending;
      closing = true;
      clearInterval(sweepTimer);
      // A slow or failed optional store sweep must not prevent native socket
      // and HTTP shutdown. Its continuation is fenced by closing above.
      closePending = (async () => {
        for (const connection of webSocketServer.clients) connection.close(1001, 'server_shutdown');
        await new Promise<void>((resolve) => webSocketServer.close(() => resolve()));
        if (server.listening) {
          await new Promise<void>((resolve) => server.close(() => resolve()));
        }
        if (typeof store.close === 'function') await store.close();
      })();
      return closePending;
    },
  };
}

function cliOptions(argv: string[]): SignalingServerOptions {
  const options: SignalingServerOptions & { host: string; port: number } = {
    host: process.env.COT_SIGNAL_HOST || '127.0.0.1',
    port: Number(process.env.COT_SIGNAL_PORT || 7777),
    allowedOrigins: process.env.COT_ALLOWED_ORIGINS !== undefined
      ? process.env.COT_ALLOWED_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean)
      : null,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--host') options.host = argv[++i] || options.host;
    else if (argv[i] === '--port') options.port = Number(argv[++i]);
  }
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const signaling = createSignalingServer(cliOptions(process.argv.slice(2)));
  signaling.listen().then((address) => {
    installProcessShutdown(() => signaling.close());
    const shownHost = address.address === '::' ? '0.0.0.0' : address.address;
    console.log(`Claude of Tanks signaling ready at ws://${shownHost}:${address.port}/signal`);
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
