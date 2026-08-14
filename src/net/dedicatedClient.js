import { createWebSocketTransport } from './channelTransport.js';
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
  const transport = createWebSocketTransport(socket, {
    maxMessageBytes: 64 * 1024,
    maxBufferedBytes: 512 * 1024,
  });
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
