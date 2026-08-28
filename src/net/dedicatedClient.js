import { createWebSocketTransport } from './channelTransport.ts';
import { maybeCreateAdverseNetworkTransport } from './adverseNetworkTransport.ts';
import { MatchClientRuntime } from './matchRuntime.js';

function addListener(target, type, listener, options) {
  if (typeof target.addEventListener === 'function') {
    target.addEventListener(type, listener, options);
    return () => target.removeEventListener(type, listener, options);
  }
  target.on(type, listener);
  return () => target.off(type, listener);
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
} = {}) {
  if (typeof WebSocketImpl !== 'function') throw new Error('WebSocket is unavailable');
  const endpoint = new URL(String(url));
  if (endpoint.protocol !== 'ws:' && endpoint.protocol !== 'wss:') {
    throw new TypeError('dedicated match URL must use ws or wss');
  }
  const socket = new WebSocketImpl(endpoint);
  socket.binaryType = 'arraybuffer';
  const transport = maybeCreateAdverseNetworkTransport(createWebSocketTransport(socket, {
    maxMessageBytes: 64 * 1024,
    maxBufferedBytes: 512 * 1024,
  }));
  const client = new MatchClientRuntime({ transport, playerId, ...clientOptions });

  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('match connection timed out')), timeoutMs);
    const removeOpen = addListener(socket, 'open', () => {
      socket.send(JSON.stringify({ type: 'match_auth', matchId, playerId, token }));
      client.connect({ mode: 'dedicated' });
    }, { once: true });
    const removeError = addListener(socket, 'error', (event) => {
      clearTimeout(timeout);
      removeOpen();
      removeError();
      reject(event && event.error ? event.error : new Error('match connection failed'));
    }, { once: true });
    const unsubscribe = client.onConnection((connected) => {
      if (!connected) return;
      clearTimeout(timeout);
      removeOpen();
      removeError();
      unsubscribe();
      resolve(client);
    });
  });
  return { socket, transport, client, ready };
}

/** Dedicated match session with the same surface used by private-room clients. */
export async function beginDedicatedClientMatch({
  url,
  ticket,
  WebSocketImpl,
  onStatus = null,
  reconnectDelaysMs = [250, 500, 1000, 2000, 4000, 5000],
} = {}) {
  if (!ticket || !ticket.matchId || !ticket.playerId || !ticket.token || !ticket.mapId) {
    throw new TypeError('complete dedicated match ticket is required');
  }
  let connection = null;
  let closed = false;
  let reconnecting = false;
  let readySent = false;
  const report = (state, detail = {}) => {
    if (typeof onStatus === 'function') onStatus({ state, ...detail });
  };
  const session = {
    kind: 'ranked',
    role: 'client',
    playerId: ticket.playerId,
    mapId: ticket.mapId,
    roster: Array.isArray(ticket.roster) ? ticket.roster : [],
    get client() { return connection?.client || null; },
    get socket() { return connection?.socket || null; },
    get reconnecting() { return reconnecting; },
    ready() {
      readySent = true;
      return connection?.client.readyForMatch() || false;
    },
    update(nowMs) { return connection?.client.update(nowMs) || null; },
    submitInput(input, clientTick) {
      return connection?.client.submitInput(input, clientTick) || false;
    },
    close(reason = 'dedicated_match_closed') {
      closed = true;
      reconnecting = false;
      connection?.client.close(reason);
      report('closed', { reason });
    },
  };

  const connect = async (attempt = 0) => {
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

  const reconnect = async () => {
    for (let attempt = 1; attempt <= reconnectDelaysMs.length && !closed; attempt++) {
      const delayMs = Math.max(0, Number(reconnectDelaysMs[attempt - 1]) || 0);
      report('reconnecting', { attempt, delayMs });
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (closed) return;
      try {
        if (await connect(attempt)) return;
      } catch (error) {
        report('reconnecting', { attempt, error: error.message });
      }
    }
    reconnecting = false;
    if (!closed) report('failed', { reason: 'reconnect_exhausted' });
  };

  await connect(0);
  return session;
}
