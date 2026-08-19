import { TransportClosedError } from './loopbackTransport.js';
import { snapshotWireCodec } from './snapshotWireCodec.js';

const DEFAULT_MAX_BUFFERED_BYTES = 512 * 1024;
const DEFAULT_MAX_MESSAGE_BYTES = 256 * 1024;
const DEFAULT_MAX_STATE_BUFFERED_BYTES = 64 * 1024;
const DEFAULT_MAX_INPUT_BUFFERED_BYTES = 1024;

function utf8Size(value) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).byteLength;
  return value.length * 2;
}

const jsonWireCodec = Object.freeze({
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
function createChannelTransport(channel, {
  kind = 'channel',
  codec = jsonWireCodec,
  stateCodec = codec,
  maxBufferedBytes = DEFAULT_MAX_BUFFERED_BYTES,
  maxMessageBytes = DEFAULT_MAX_MESSAGE_BYTES,
  coalesceState = false,
  coalesceInput = false,
  maxStateBufferedBytes = Math.min(maxBufferedBytes, DEFAULT_MAX_STATE_BUFFERED_BYTES),
  maxInputBufferedBytes = Math.min(maxBufferedBytes, DEFAULT_MAX_INPUT_BUFFERED_BYTES),
} = {}) {
  if (!channel || typeof channel.send !== 'function' || typeof channel.close !== 'function') {
    throw new TypeError('channel must implement send() and close()');
  }
  if (!codec || typeof codec.encode !== 'function' || typeof codec.decode !== 'function') {
    throw new TypeError('codec must implement encode() and decode()');
  }
  if (!stateCodec || typeof stateCodec.encode !== 'function' ||
      typeof stateCodec.decode !== 'function') {
    throw new TypeError('stateCodec must implement encode() and decode()');
  }
  const messages = new Set();
  const closes = new Set();
  const errors = new Set();
  let closedReason = null;
  let pendingState = null;
  let pendingInput = null;
  const stats = {
    sent: 0,
    received: 0,
    rejected: 0,
    decodeErrors: 0,
    stateSent: 0,
    stateCoalesced: 0,
    inputSent: 0,
    inputCoalesced: 0,
  };

  if (!Number.isFinite(maxStateBufferedBytes) || maxStateBufferedBytes < 0 ||
      maxStateBufferedBytes > maxBufferedBytes) {
    throw new TypeError('maxStateBufferedBytes must be within the channel buffer limit');
  }
  if (!Number.isFinite(maxInputBufferedBytes) || maxInputBufferedBytes < 0 ||
      maxInputBufferedBytes > maxBufferedBytes) {
    throw new TypeError('maxInputBufferedBytes must be within the channel buffer limit');
  }

  const removeMessage = addListener(channel, 'message', (event) => {
    try {
      const wireCodec = typeof event.data === 'string' ? codec : stateCodec;
      const decoded = wireCodec.decode(event.data);
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
    pendingState = null;
    pendingInput = null;
    for (const listener of [...closes]) listener(closedReason);
    messages.clear();
    closes.clear();
    errors.clear();
  });
  const removeError = addListener(channel, 'error', (event) => {
    const error = event && event.error ? event.error : new Error('transport channel error');
    for (const listener of [...errors]) listener(error);
  });

  function encode(message, wireCodec = codec) {
    const encoded = wireCodec.encode(message);
    const bytes = typeof wireCodec.size === 'function'
      ? wireCodec.size(encoded)
      : utf8Size(String(encoded));
    return { encoded, bytes };
  }

  function sendEncoded(encoded, bytes) {
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
  }

  function flushPendingState() {
    if (!pendingState || normalizedReadyState(channel) !== 'open') return false;
    if ((Number(channel.bufferedAmount) || 0) >= maxStateBufferedBytes) return false;
    const { encoded, bytes } = pendingState;
    if ((Number(channel.bufferedAmount) || 0) + bytes > maxStateBufferedBytes) return false;
    channel.send(encoded);
    pendingState = null;
    stats.sent++;
    stats.stateSent++;
    return true;
  }

  function flushPendingInput() {
    if (!pendingInput || normalizedReadyState(channel) !== 'open') return false;
    if ((Number(channel.bufferedAmount) || 0) >= maxInputBufferedBytes) return false;
    const { encoded, bytes } = pendingInput;
    if ((Number(channel.bufferedAmount) || 0) + bytes > maxInputBufferedBytes) return false;
    channel.send(encoded);
    pendingInput = null;
    stats.sent++;
    stats.inputSent++;
    return true;
  }

  let removeBufferedLow = () => {};
  if (coalesceState || coalesceInput) {
    if ('bufferedAmountLowThreshold' in channel) {
      const lowThreshold = Math.min(
        coalesceState ? maxStateBufferedBytes : Infinity,
        coalesceInput ? maxInputBufferedBytes : Infinity,
      );
      channel.bufferedAmountLowThreshold = Math.floor(lowThreshold / 2);
    }
    removeBufferedLow = addListener(channel, 'bufferedamountlow', () => {
      flushPendingState();
      flushPendingInput();
    });
  }

  const transport = {
    kind,
    send(message) {
      if (normalizedReadyState(channel) !== 'open') throw new TransportClosedError();
      const { encoded, bytes } = encode(message);
      return sendEncoded(encoded, bytes);
    },
    sendState(message) {
      if (!coalesceState) return transport.send(message);
      if (normalizedReadyState(channel) !== 'open') throw new TransportClosedError();
      const encodedState = encode(message, stateCodec);
      if (encodedState.bytes > maxMessageBytes) {
        stats.rejected++;
        return false;
      }
      if (pendingState) stats.stateCoalesced++;
      pendingState = encodedState;
      if ((Number(channel.bufferedAmount) || 0) >= maxStateBufferedBytes) {
        stats.stateCoalesced++;
        return true;
      }
      const accepted = flushPendingState();
      if (!accepted && pendingState == null) return false;
      if (!accepted) stats.stateCoalesced++;
      return true;
    },
    sendInput(message) {
      if (!coalesceInput) return transport.send(message);
      if (normalizedReadyState(channel) !== 'open') throw new TransportClosedError();
      const encodedInput = encode(message, stateCodec);
      if (encodedInput.bytes > maxMessageBytes) {
        stats.rejected++;
        return false;
      }
      if (pendingInput) stats.inputCoalesced++;
      pendingInput = encodedInput;
      if ((Number(channel.bufferedAmount) || 0) >= maxInputBufferedBytes) {
        stats.inputCoalesced++;
        return true;
      }
      const accepted = flushPendingInput();
      if (!accepted && pendingInput == null) return false;
      if (!accepted) stats.inputCoalesced++;
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
      removeBufferedLow();
      pendingState = null;
      pendingInput = null;
      messages.clear();
      closes.clear();
      errors.clear();
    },
    get readyState() { return normalizedReadyState(channel); },
    get bufferedAmount() { return Number(channel.bufferedAmount) || 0; },
    get stats() {
      return {
        ...stats,
        statePending: pendingState ? 1 : 0,
        inputPending: pendingInput ? 1 : 0,
      };
    },
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

/**
 * Route replaceable snapshots and input over an unordered/no-retransmit
 * WebRTC lane while keeping lobby, combat events, and control reliable.
 */
export function createWebRTCSplitTransport(controlChannel, stateChannel, options = {}) {
  if (controlChannel.ordered === false || controlChannel.maxRetransmits != null ||
      controlChannel.maxPacketLifeTime != null) {
    throw new TypeError('control data channel must be ordered and reliable');
  }
  if (stateChannel.ordered !== false || stateChannel.maxRetransmits !== 0) {
    throw new TypeError('state data channel must be unordered with zero retransmits');
  }
  const control = createChannelTransport(controlChannel, {
    ...options,
    kind: 'webrtc-control',
    coalesceState: false,
    coalesceInput: false,
  });
  const state = createChannelTransport(stateChannel, {
    ...options,
    kind: 'webrtc-state',
    coalesceState: true,
    coalesceInput: true,
    codec: options.stateCodec || snapshotWireCodec,
    stateCodec: options.stateCodec || snapshotWireCodec,
    maxBufferedBytes: options.maxStateBufferedBytes ?? DEFAULT_MAX_STATE_BUFFERED_BYTES,
    maxStateBufferedBytes: options.maxStateBufferedBytes ?? DEFAULT_MAX_STATE_BUFFERED_BYTES,
    maxInputBufferedBytes: options.maxInputBufferedBytes ?? DEFAULT_MAX_INPUT_BUFFERED_BYTES,
  });
  const messages = new Set();
  const closes = new Set();
  const errors = new Set();
  let closedReason = null;

  const forwardMessage = (message) => {
    for (const listener of [...messages]) listener(message);
  };
  const forwardError = (error) => {
    for (const listener of [...errors]) listener(error);
  };
  const removeControlMessage = control.onMessage(forwardMessage);
  const removeStateMessage = state.onMessage(forwardMessage);
  const removeControlError = control.onError(forwardError);
  const removeStateError = state.onError(forwardError);

  function finishClose(reason) {
    if (closedReason != null) return;
    closedReason = String(reason || 'remote_closed');
    if (control.readyState !== 'closed') control.close(closedReason);
    if (state.readyState !== 'closed') state.close(closedReason);
    for (const listener of [...closes]) listener(closedReason);
    messages.clear();
    closes.clear();
    errors.clear();
  }

  const removeControlClose = control.onClose((reason) => finishClose(reason));
  const removeStateClose = state.onClose((reason) => finishClose(reason));

  return {
    kind: 'webrtc',
    send(message) { return control.send(message); },
    sendInput(message) { return state.sendInput(message); },
    sendState(message) { return state.sendState(message); },
    onMessage(listener) {
      messages.add(listener);
      return () => messages.delete(listener);
    },
    onClose(listener) {
      if (closedReason != null) queueMicrotask(() => listener(closedReason));
      else closes.add(listener);
      return () => closes.delete(listener);
    },
    onError(listener) {
      errors.add(listener);
      return () => errors.delete(listener);
    },
    close(reason = 'closed') { finishClose(reason); },
    dispose() {
      removeControlMessage();
      removeStateMessage();
      removeControlError();
      removeStateError();
      removeControlClose();
      removeStateClose();
      control.dispose();
      state.dispose();
      messages.clear();
      closes.clear();
      errors.clear();
    },
    get readyState() {
      return closedReason == null && control.readyState === 'open' && state.readyState === 'open'
        ? 'open'
        : 'closed';
    },
    get bufferedAmount() { return control.bufferedAmount + state.bufferedAmount; },
    get stats() {
      return { control: control.stats, state: state.stats };
    },
    rawChannel: controlChannel,
    rawChannels: { control: controlChannel, state: stateChannel },
  };
}

export function createWebSocketTransport(socket, options = {}) {
  const maxBufferedBytes = options.maxBufferedBytes ?? DEFAULT_MAX_BUFFERED_BYTES;
  const transport = createChannelTransport(socket, {
    ...options,
    kind: 'websocket',
    coalesceState: options.coalesceState ?? true,
    coalesceInput: options.coalesceInput ?? true,
    stateCodec: options.stateCodec || snapshotWireCodec,
    maxStateBufferedBytes: Math.min(options.maxStateBufferedBytes ?? 128 * 1024,
      maxBufferedBytes),
    maxInputBufferedBytes: Math.min(
      options.maxInputBufferedBytes ?? DEFAULT_MAX_INPUT_BUFFERED_BYTES,
      maxBufferedBytes,
    ),
  });
  // WebSocket cannot provide an unordered channel, but using the same
  // replaceable queue still prevents old steering frames from consuming
  // reliable control headroom when a connection becomes backpressured.
  return transport;
}
