import { TransportClosedError } from './loopbackTransport.js';

const DEFAULT_MAX_BUFFERED_BYTES = 512 * 1024;
const DEFAULT_MAX_MESSAGE_BYTES = 256 * 1024;

function utf8Size(value) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).byteLength;
  return value.length * 2;
}

export const jsonWireCodec = Object.freeze({
  encode(value) { return JSON.stringify(value); },
  decode(value) {
    if (typeof value !== 'string') {
      throw new TypeError('JSON transport expects string messages');
    }
    return JSON.parse(value);
  },
  size(value) { return utf8Size(value); },
});

function addListener(target, type, listener) {
  if (typeof target.addEventListener === 'function') {
    target.addEventListener(type, listener);
    return () => target.removeEventListener(type, listener);
  }
  const key = `on${type}`;
  const previous = target[key];
  target[key] = listener;
  return () => {
    if (target[key] === listener) target[key] = previous || null;
  };
}

function normalizedReadyState(channel) {
  if (typeof channel.readyState === 'string') return channel.readyState;
  if (channel.readyState === 0) return 'connecting';
  if (channel.readyState === 1) return 'open';
  if (channel.readyState === 2) return 'closing';
  return 'closed';
}

/** Wrap WebRTC RTCDataChannel or WebSocket behind the shared transport seam. */
export function createChannelTransport(channel, {
  kind = 'channel',
  codec = jsonWireCodec,
  maxBufferedBytes = DEFAULT_MAX_BUFFERED_BYTES,
  maxMessageBytes = DEFAULT_MAX_MESSAGE_BYTES,
} = {}) {
  if (!channel || typeof channel.send !== 'function' || typeof channel.close !== 'function') {
    throw new TypeError('channel must implement send() and close()');
  }
  if (!codec || typeof codec.encode !== 'function' || typeof codec.decode !== 'function') {
    throw new TypeError('codec must implement encode() and decode()');
  }
  const messages = new Set();
  const closes = new Set();
  const errors = new Set();
  let closedReason = null;
  const stats = { sent: 0, received: 0, rejected: 0, decodeErrors: 0 };

  const removeMessage = addListener(channel, 'message', (event) => {
    try {
      const decoded = codec.decode(event.data);
      stats.received++;
      for (const listener of [...messages]) listener(decoded);
    } catch (error) {
      stats.decodeErrors++;
      for (const listener of [...errors]) listener(error);
      transport.close('invalid_payload');
    }
  });
  const removeClose = addListener(channel, 'close', () => {
    if (closedReason == null) closedReason = 'remote_closed';
    for (const listener of [...closes]) listener(closedReason);
    messages.clear();
    closes.clear();
    errors.clear();
  });
  const removeError = addListener(channel, 'error', (event) => {
    const error = event && event.error ? event.error : new Error('transport channel error');
    for (const listener of [...errors]) listener(error);
  });

  const transport = {
    kind,
    send(message) {
      if (normalizedReadyState(channel) !== 'open') throw new TransportClosedError();
      const encoded = codec.encode(message);
      const bytes = typeof codec.size === 'function' ? codec.size(encoded) : utf8Size(String(encoded));
      if (bytes > maxMessageBytes) {
        stats.rejected++;
        return false;
      }
      if ((Number(channel.bufferedAmount) || 0) + bytes > maxBufferedBytes) {
        stats.rejected++;
        return false;
      }
      channel.send(encoded);
      stats.sent++;
      return true;
    },
    onMessage(listener) {
      messages.add(listener);
      return () => messages.delete(listener);
    },
    onClose(listener) {
      if (normalizedReadyState(channel) === 'closed') {
        queueMicrotask(() => listener(closedReason || 'closed'));
      } else closes.add(listener);
      return () => closes.delete(listener);
    },
    onError(listener) {
      errors.add(listener);
      return () => errors.delete(listener);
    },
    close(reason = 'closed') {
      if (normalizedReadyState(channel) === 'closed') return;
      closedReason = String(reason);
      channel.close();
    },
    dispose() {
      removeMessage();
      removeClose();
      removeError();
      messages.clear();
      closes.clear();
      errors.clear();
    },
    get readyState() { return normalizedReadyState(channel); },
    get bufferedAmount() { return Number(channel.bufferedAmount) || 0; },
    get stats() { return { ...stats }; },
    rawChannel: channel,
  };
  return transport;
}

export function createWebRTCDataChannelTransport(channel, options = {}) {
  if (channel.ordered === false || channel.maxRetransmits != null || channel.maxPacketLifeTime != null) {
    throw new TypeError('match data channel must be ordered and reliable');
  }
  return createChannelTransport(channel, { ...options, kind: 'webrtc' });
}

export function createWebSocketTransport(socket, options = {}) {
  return createChannelTransport(socket, { ...options, kind: 'websocket' });
}
