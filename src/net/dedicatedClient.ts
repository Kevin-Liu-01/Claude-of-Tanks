import type { RuntimeValue } from '../runtimeTypes.ts';
import { createWebSocketTransport, type ChannelTransport } from './channelTransport.ts';
import {
  maybeCreateAdverseNetworkTransport,
  type AdverseNetworkTransport,
} from './adverseNetworkTransport.ts';
import {
  MatchClientRuntime,
  type MatchClientOptions,
} from './matchRuntime.ts';
import type { SampledSnapshotFrame } from './snapshot.ts';
import type { NetworkInputFrame } from './networkFramePump.ts';

type Unsubscribe = () => void;
type SocketListener = (event: SocketEvent) => void;

interface SocketEvent {
  error?: RuntimeValue;
}

interface SocketLike {
  readyState: number | string;
  binaryType: string;
  send(data: string): void;
  close(): void;
  addEventListener?(type: string, listener: SocketListener, options?: AddEventListenerOptions): void;
  removeEventListener?(type: string, listener: SocketListener, options?: EventListenerOptions): void;
  on?(type: string, listener: SocketListener): void;
  off?(type: string, listener: SocketListener): void;
}

export interface DedicatedMatchTicket extends Record<string, RuntimeValue> {
  matchId: string;
  playerId: string;
  token: string;
  mapId: string;
  roster?: RuntimeValue[];
}

export interface DedicatedConnectionOptions extends Partial<MatchClientOptions> {
  url?: RuntimeValue;
  matchId?: string;
  playerId?: string;
  token?: string;
  WebSocketImpl?: RuntimeValue;
  timeoutMs?: number;
  clientOptions?: MatchClientOptions;
}

export interface DedicatedConnection {
  socket: SocketLike;
  transport: ChannelTransport | AdverseNetworkTransport;
  client: MatchClientRuntime;
  ready: Promise<MatchClientRuntime>;
}

export interface DedicatedStatus extends Record<string, RuntimeValue> {
  state: string;
}

export interface DedicatedClientMatchOptions {
  url?: RuntimeValue;
  ticket?: DedicatedMatchTicket;
  WebSocketImpl?: RuntimeValue;
  onStatus?: ((status: DedicatedStatus) => void) | null;
  reconnectDelaysMs?: number[];
}

export interface DedicatedClientMatch {
  readonly kind: 'ranked';
  readonly role: 'client';
  readonly playerId: string;
  readonly mapId: string;
  readonly roster: RuntimeValue[];
  readonly client: MatchClientRuntime | null;
  readonly socket: SocketLike | null;
  readonly reconnecting: boolean;
  ready(): boolean;
  update(nowMs: number): SampledSnapshotFrame | null;
  submitInput(input: NetworkInputFrame, clientTick?: number): boolean;
  close(reason?: string): void;
}

function addListener(
  target: SocketLike,
  type: string,
  listener: SocketListener,
  options?: AddEventListenerOptions,
): Unsubscribe {
  if (typeof target.addEventListener === 'function') {
    target.addEventListener(type, listener, options);
    return () => target.removeEventListener?.(type, listener, options);
  }
  if (typeof target.on !== 'function' || typeof target.off !== 'function') {
    throw new TypeError('WebSocket event target is incomplete');
  }
  target.on(type, listener);
  return () => target.off?.(type, listener);
}

function asError(value: RuntimeValue, fallback: string): Error {
  if (value instanceof Error) return value;
  return new Error(fallback);
}

function isRecord(value: RuntimeValue): value is Record<string, RuntimeValue> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isSocketLike(value: RuntimeValue): value is SocketLike {
  return isRecord(value) &&
    (typeof value.readyState === 'number' || typeof value.readyState === 'string') &&
    typeof value.binaryType === 'string' && typeof value.send === 'function' &&
    typeof value.close === 'function';
}

function createSocket(constructorValue: RuntimeValue, endpoint: URL): SocketLike {
  if (typeof constructorValue !== 'function') throw new Error('WebSocket is unavailable');
  const socket: RuntimeValue = Reflect.construct(constructorValue, [endpoint]);
  if (!isSocketLike(socket)) {
    throw new TypeError(
      'WebSocket must expose readyState/binaryType and implement send() and close()',
    );
  }
  return socket;
}

function closeFailedConnection(
  socket: SocketLike,
  transport: ChannelTransport | AdverseNetworkTransport,
): void {
  transport.dispose();
  try { socket.close(); } catch { /* already closing or not yet open */ }
}

/** Authenticate a browser WebSocket before handing it to the shared client. */
export function connectDedicatedMatch({
  url,
  matchId,
  playerId,
  token,
  WebSocketImpl = globalThis.WebSocket,
  timeoutMs = 8000,
  clientOptions = {},
}: DedicatedConnectionOptions = {}): DedicatedConnection {
  const endpoint = new URL(String(url));
  if (endpoint.protocol !== 'ws:' && endpoint.protocol !== 'wss:') {
    throw new TypeError('dedicated match URL must use ws or wss');
  }
  const socket = createSocket(WebSocketImpl, endpoint);
  socket.binaryType = 'arraybuffer';
  const transport = maybeCreateAdverseNetworkTransport(createWebSocketTransport(socket, {
    maxMessageBytes: 64 * 1024,
    maxBufferedBytes: 512 * 1024,
  }));
  const client = new MatchClientRuntime({
    transport,
    playerId: String(playerId || ''),
    ...clientOptions,
  });

  const ready = new Promise<MatchClientRuntime>((resolve, reject) => {
    let settled = false;
    let unsubscribeConnection: Unsubscribe = () => {};
    let removeOpen: Unsubscribe = () => {};
    let removeError: Unsubscribe = () => {};
    let removeClose: Unsubscribe = () => {};
    const cleanup = () => {
      clearTimeout(timeout);
      removeOpen();
      removeError();
      removeClose();
      unsubscribeConnection();
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      closeFailedConnection(socket, transport);
      reject(error);
    };
    const timeout = setTimeout(() => fail(new Error('match connection timed out')), timeoutMs);
    removeOpen = addListener(socket, 'open', () => {
      try {
        socket.send(JSON.stringify({ type: 'match_auth', matchId, playerId, token }));
        client.connect({ mode: 'dedicated' });
      } catch (error) {
        fail(asError(error, 'match authentication failed'));
      }
    }, { once: true });
    removeError = addListener(socket, 'error', (event) => {
      fail(asError(event?.error, 'match connection failed'));
    }, { once: true });
    removeClose = addListener(socket, 'close', () => {
      fail(new Error('match connection closed before authentication'));
    }, { once: true });
    unsubscribeConnection = client.onConnection((connected) => {
      if (!connected || settled) return;
      settled = true;
      cleanup();
      resolve(client);
    });
  });
  return { socket, transport, client, ready };
}

function messageFor(error: RuntimeValue): string {
  return error instanceof Error ? error.message : String(error);
}

/** Dedicated match session with the same surface used by private-room clients. */
export async function beginDedicatedClientMatch({
  url,
  ticket,
  WebSocketImpl,
  onStatus = null,
  reconnectDelaysMs = [250, 500, 1000, 2000, 4000, 5000],
}: DedicatedClientMatchOptions = {}): Promise<DedicatedClientMatch> {
  if (!ticket || !ticket.matchId || !ticket.playerId || !ticket.token || !ticket.mapId) {
    throw new TypeError('complete dedicated match ticket is required');
  }
  let connection: DedicatedConnection | null = null;
  let closed = false;
  let reconnecting = false;
  let readySent = false;
  const report = (state: string, detail: Record<string, RuntimeValue> = {}) => {
    onStatus?.({ state, ...detail });
  };
  const session: DedicatedClientMatch = {
    kind: 'ranked',
    role: 'client',
    playerId: ticket.playerId,
    mapId: ticket.mapId,
    roster: Array.isArray(ticket.roster) ? ticket.roster : [],
    get client() { return connection?.client || null; },
    get socket() { return connection?.socket || null; },
    get reconnecting() { return reconnecting; },
    ready(): boolean {
      readySent = true;
      return connection?.client.readyForMatch() || false;
    },
    update(nowMs: number): SampledSnapshotFrame | null {
      return connection?.client.update(nowMs) || null;
    },
    submitInput(input: Record<string, RuntimeValue>, clientTick?: number): boolean {
      return connection?.client.submitInput(input, clientTick) || false;
    },
    close(reason = 'dedicated_match_closed'): void {
      closed = true;
      reconnecting = false;
      connection?.client.close(reason);
      report('closed', { reason });
    },
  };

  const reconnect = async (): Promise<void> => {
    for (let attempt = 1; attempt <= reconnectDelaysMs.length && !closed; attempt++) {
      const delayMs = Math.max(0, Number(reconnectDelaysMs[attempt - 1]) || 0);
      report('reconnecting', { attempt, delayMs });
      if (delayMs) await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      if (closed) return;
      try {
        if (await connect(attempt)) return;
      } catch (error) {
        report('reconnecting', { attempt, error: messageFor(error) });
      }
    }
    reconnecting = false;
    if (!closed) report('failed', { reason: 'reconnect_exhausted' });
  };

  const connect = async (attempt = 0): Promise<boolean> => {
    report(attempt ? 'reconnecting' : 'connecting', { attempt });
    const next = connectDedicatedMatch({
      url,
      matchId: ticket.matchId,
      playerId: ticket.playerId,
      token: ticket.token,
      WebSocketImpl,
    });
    await next.ready;
    if (closed) {
      next.client.close('session_closed');
      return false;
    }
    connection = next;
    if (readySent) next.client.readyForMatch();
    addListener(next.socket, 'close', () => {
      if (closed || connection !== next || reconnecting) return;
      reconnecting = true;
      void reconnect();
    }, { once: true });
    reconnecting = false;
    report(attempt ? 'reconnected' : 'connected', { attempt });
    return true;
  };

  await connect(0);
  return session;
}
