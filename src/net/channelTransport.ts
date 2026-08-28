import {
  TransportClosedError,
  type MessageTransport,
} from './loopbackTransport.ts';
import { snapshotWireCodec } from './snapshotWireCodec.ts';

type Unsubscribe = () => void;
type ChannelReadyState = 'connecting' | 'open' | 'closing' | 'closed';

interface ChannelEvent {
  data?: unknown;
  error?: unknown;
}

interface ChannelLike {
  readyState: number | string;
  bufferedAmount?: number;
  bufferedAmountLowThreshold?: number;
  ordered?: boolean;
  maxRetransmits?: number | null;
  maxPacketLifeTime?: number | null;
  send(value: unknown): void;
  close(): void;
  addEventListener?(type: string, listener: (event: ChannelEvent) => void): void;
  removeEventListener?(type: string, listener: (event: ChannelEvent) => void): void;
}

export interface WireCodec {
  encode(value: unknown): unknown;
  decode(value: unknown): unknown;
  size?(value: unknown): number;
}

export interface ChannelTransportOptions {
  kind?: string;
  codec?: WireCodec;
  stateCodec?: WireCodec;
  maxBufferedBytes?: number;
  maxMessageBytes?: number;
  coalesceState?: boolean;
  coalesceInput?: boolean;
  maxStateBufferedBytes?: number;
  maxInputBufferedBytes?: number;
}

export interface ChannelTransportStats {
  sent: number;
  received: number;
  rejected: number;
  decodeErrors: number;
  stateSent: number;
  stateCoalesced: number;
  inputSent: number;
  inputCoalesced: number;
  statePending: number;
  inputPending: number;
}

export interface SplitTransportStats {
  control: ChannelTransportStats;
  state: ChannelTransportStats;
}

export interface ChannelTransport extends MessageTransport {
  sendState(message: unknown): boolean;
  sendInput(message: unknown): boolean;
  onError(listener: (error: unknown) => void): Unsubscribe;
  dispose(): void;
  readonly bufferedAmount: number;
  readonly stats: ChannelTransportStats | SplitTransportStats;
  readonly rawChannel: ChannelLike;
  readonly rawChannels?: { control: ChannelLike; state: ChannelLike };
}

interface SingleChannelTransport extends ChannelTransport {
  readonly stats: ChannelTransportStats;
}

interface EncodedMessage {
  encoded: unknown;
  bytes: number;
}

const DEFAULT_MAX_BUFFERED_BYTES = 512 * 1024;
const DEFAULT_MAX_MESSAGE_BYTES = 256 * 1024;
const DEFAULT_MAX_STATE_BUFFERED_BYTES = 64 * 1024;
const DEFAULT_MAX_INPUT_BUFFERED_BYTES = 1024;
const binarySnapshotCodec: WireCodec = snapshotWireCodec;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readChannel(value: unknown): ChannelLike {
  if (!isRecord(value) || typeof value.send !== 'function' || typeof value.close !== 'function') {
    throw new TypeError('channel must implement send() and close()');
  }
  return value as unknown as ChannelLike;
}

function readCodec(value: unknown, label: string): WireCodec {
  if (!isRecord(value) || typeof value.encode !== 'function' || typeof value.decode !== 'function') {
    throw new TypeError(`${label} must implement encode() and decode()`);
  }
  return value as unknown as WireCodec;
}

function utf8Size(value: unknown): number {
  const text = typeof value === 'string' ? value : String(value);
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).byteLength;
  return text.length * 2;
}

const jsonWireCodec: WireCodec = Object.freeze({
  encode(value: unknown): string { return JSON.stringify(value); },
  decode(value: unknown): unknown {
    if (typeof value !== 'string') {
      throw new TypeError('JSON transport expects string messages');
    }
    return JSON.parse(value) as unknown;
  },
  size(value: unknown): number { return utf8Size(value); },
});

function addListener(
  target: ChannelLike,
  type: string,
  listener: (event: ChannelEvent) => void,
): Unsubscribe {
  if (typeof target.addEventListener === 'function') {
    target.addEventListener(type, listener);
    return () => target.removeEventListener?.(type, listener);
  }
  const key = `on${type}`;
  const slots = target as unknown as Record<string, unknown>;
  const previous = slots[key];
  slots[key] = listener;
  return () => {
    if (slots[key] === listener) slots[key] = previous || null;
  };
}

function normalizedReadyState(channel: ChannelLike): ChannelReadyState {
  if (typeof channel.readyState === 'string') {
    if (channel.readyState === 'connecting' || channel.readyState === 'open' ||
        channel.readyState === 'closing' || channel.readyState === 'closed') {
      return channel.readyState;
    }
    return 'closed';
  }
  if (channel.readyState === 0) return 'connecting';
  if (channel.readyState === 1) return 'open';
  if (channel.readyState === 2) return 'closing';
  return 'closed';
}

function channelBufferedAmount(channel: ChannelLike): number {
  return Number(channel.bufferedAmount) || 0;
}

/** Wrap WebRTC RTCDataChannel or WebSocket behind the shared transport seam. */
function createChannelTransport(
  channelValue: unknown,
  {
    kind = 'channel',
    codec: rawCodec = jsonWireCodec,
    stateCodec: rawStateCodec,
    maxBufferedBytes = DEFAULT_MAX_BUFFERED_BYTES,
    maxMessageBytes = DEFAULT_MAX_MESSAGE_BYTES,
    coalesceState = false,
    coalesceInput = false,
    maxStateBufferedBytes = Math.min(maxBufferedBytes, DEFAULT_MAX_STATE_BUFFERED_BYTES),
    maxInputBufferedBytes = Math.min(maxBufferedBytes, DEFAULT_MAX_INPUT_BUFFERED_BYTES),
  }: ChannelTransportOptions = {},
): SingleChannelTransport {
  const channel = readChannel(channelValue);
  const codec = readCodec(rawCodec, 'codec');
  const stateCodec = readCodec(rawStateCodec || codec, 'stateCodec');
  const messages = new Set<(message: unknown) => void>();
  const closes = new Set<(reason: string) => void>();
  const errors = new Set<(error: unknown) => void>();
  let closedReason: string | null = null;
  let pendingState: EncodedMessage | null = null;
  let pendingInput: EncodedMessage | null = null;
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

  let transport: SingleChannelTransport;
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
    const error = event.error || new Error('transport channel error');
    for (const listener of [...errors]) listener(error);
  });

  function encode(message: unknown, wireCodec: WireCodec = codec): EncodedMessage {
    const encoded = wireCodec.encode(message);
    const bytes = typeof wireCodec.size === 'function'
      ? wireCodec.size(encoded)
      : utf8Size(encoded);
    return { encoded, bytes };
  }

  function sendEncoded(encoded: unknown, bytes: number): boolean {
    if (bytes > maxMessageBytes) {
      stats.rejected++;
      return false;
    }
    if (channelBufferedAmount(channel) + bytes > maxBufferedBytes) {
      stats.rejected++;
      return false;
    }
    channel.send(encoded);
    stats.sent++;
    return true;
  }

  function flushPendingState(): boolean {
    if (!pendingState || normalizedReadyState(channel) !== 'open') return false;
    if (channelBufferedAmount(channel) >= maxStateBufferedBytes) return false;
    const { encoded, bytes } = pendingState;
    if (channelBufferedAmount(channel) + bytes > maxStateBufferedBytes) return false;
    channel.send(encoded);
    pendingState = null;
    stats.sent++;
    stats.stateSent++;
    return true;
  }

  function flushPendingInput(): boolean {
    if (!pendingInput || normalizedReadyState(channel) !== 'open') return false;
    if (channelBufferedAmount(channel) >= maxInputBufferedBytes) return false;
    const { encoded, bytes } = pendingInput;
    if (channelBufferedAmount(channel) + bytes > maxInputBufferedBytes) return false;
    channel.send(encoded);
    pendingInput = null;
    stats.sent++;
    stats.inputSent++;
    return true;
  }

  let removeBufferedLow: Unsubscribe = () => {};
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

  transport = {
    kind,
    send(message: unknown): boolean {
      if (normalizedReadyState(channel) !== 'open') throw new TransportClosedError();
      const { encoded, bytes } = encode(message);
      return sendEncoded(encoded, bytes);
    },
    sendState(message: unknown): boolean {
      if (!coalesceState) return transport.send(message);
      if (normalizedReadyState(channel) !== 'open') throw new TransportClosedError();
      const encodedState = encode(message, stateCodec);
      if (encodedState.bytes > maxMessageBytes) {
        stats.rejected++;
        return false;
      }
      if (pendingState) stats.stateCoalesced++;
      pendingState = encodedState;
      if (channelBufferedAmount(channel) >= maxStateBufferedBytes) {
        stats.stateCoalesced++;
        return true;
      }
      const accepted = flushPendingState();
      if (!accepted && pendingState == null) return false;
      if (!accepted) stats.stateCoalesced++;
      return true;
    },
    sendInput(message: unknown): boolean {
      if (!coalesceInput) return transport.send(message);
      if (normalizedReadyState(channel) !== 'open') throw new TransportClosedError();
      const encodedInput = encode(message, stateCodec);
      if (encodedInput.bytes > maxMessageBytes) {
        stats.rejected++;
        return false;
      }
      if (pendingInput) stats.inputCoalesced++;
      pendingInput = encodedInput;
      if (channelBufferedAmount(channel) >= maxInputBufferedBytes) {
        stats.inputCoalesced++;
        return true;
      }
      const accepted = flushPendingInput();
      if (!accepted && pendingInput == null) return false;
      if (!accepted) stats.inputCoalesced++;
      return true;
    },
    onMessage(listener: (message: unknown) => void): Unsubscribe {
      messages.add(listener);
      return () => messages.delete(listener);
    },
    onClose(listener: (reason: string) => void): Unsubscribe {
      if (normalizedReadyState(channel) === 'closed') {
        queueMicrotask(() => listener(closedReason || 'closed'));
      } else {
        closes.add(listener);
      }
      return () => closes.delete(listener);
    },
    onError(listener: (error: unknown) => void): Unsubscribe {
      errors.add(listener);
      return () => errors.delete(listener);
    },
    close(reason = 'closed'): void {
      if (normalizedReadyState(channel) === 'closed') return;
      closedReason = String(reason);
      channel.close();
    },
    dispose(): void {
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
    get bufferedAmount() { return channelBufferedAmount(channel); },
    get stats(): ChannelTransportStats {
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

export function createWebRTCDataChannelTransport(
  channelValue: unknown,
  options: ChannelTransportOptions = {},
): ChannelTransport {
  const channel = readChannel(channelValue);
  if (channel.ordered === false || channel.maxRetransmits != null ||
      channel.maxPacketLifeTime != null) {
    throw new TypeError('match data channel must be ordered and reliable');
  }
  return createChannelTransport(channel, { ...options, kind: 'webrtc' });
}

/**
 * Route replaceable snapshots and input over an unordered/no-retransmit
 * WebRTC lane while keeping lobby, combat events, and control reliable.
 */
export function createWebRTCSplitTransport(
  controlChannelValue: unknown,
  stateChannelValue: unknown,
  options: ChannelTransportOptions = {},
): ChannelTransport {
  const controlChannel = readChannel(controlChannelValue);
  const stateChannel = readChannel(stateChannelValue);
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
  const stateCodec = options.stateCodec || binarySnapshotCodec;
  const state = createChannelTransport(stateChannel, {
    ...options,
    kind: 'webrtc-state',
    coalesceState: true,
    coalesceInput: true,
    codec: stateCodec,
    stateCodec,
    maxBufferedBytes: options.maxStateBufferedBytes ?? DEFAULT_MAX_STATE_BUFFERED_BYTES,
    maxStateBufferedBytes: options.maxStateBufferedBytes ?? DEFAULT_MAX_STATE_BUFFERED_BYTES,
    maxInputBufferedBytes: options.maxInputBufferedBytes ?? DEFAULT_MAX_INPUT_BUFFERED_BYTES,
  });
  const messages = new Set<(message: unknown) => void>();
  const closes = new Set<(reason: string) => void>();
  const errors = new Set<(error: unknown) => void>();
  let closedReason: string | null = null;

  const forwardMessage = (message: unknown) => {
    for (const listener of [...messages]) listener(message);
  };
  const forwardError = (error: unknown) => {
    for (const listener of [...errors]) listener(error);
  };
  const removeControlMessage = control.onMessage(forwardMessage);
  const removeStateMessage = state.onMessage(forwardMessage);
  const removeControlError = control.onError(forwardError);
  const removeStateError = state.onError(forwardError);

  function finishClose(reason: unknown): void {
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
    send(message: unknown): boolean { return control.send(message); },
    sendInput(message: unknown): boolean { return state.sendInput(message); },
    sendState(message: unknown): boolean { return state.sendState(message); },
    onMessage(listener: (message: unknown) => void): Unsubscribe {
      messages.add(listener);
      return () => messages.delete(listener);
    },
    onClose(listener: (reason: string) => void): Unsubscribe {
      if (closedReason != null) queueMicrotask(() => listener(closedReason || 'closed'));
      else closes.add(listener);
      return () => closes.delete(listener);
    },
    onError(listener: (error: unknown) => void): Unsubscribe {
      errors.add(listener);
      return () => errors.delete(listener);
    },
    close(reason = 'closed'): void { finishClose(reason); },
    dispose(): void {
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
    get stats(): SplitTransportStats {
      return { control: control.stats, state: state.stats };
    },
    rawChannel: controlChannel,
    rawChannels: { control: controlChannel, state: stateChannel },
  };
}

export function createWebSocketTransport(
  socket: unknown,
  options: ChannelTransportOptions = {},
): ChannelTransport {
  const maxBufferedBytes = options.maxBufferedBytes ?? DEFAULT_MAX_BUFFERED_BYTES;
  // WebSocket cannot provide an unordered channel, but using the same
  // replaceable queue still prevents old steering frames from consuming
  // reliable control headroom when a connection becomes backpressured.
  return createChannelTransport(socket, {
    ...options,
    kind: 'websocket',
    coalesceState: options.coalesceState ?? true,
    coalesceInput: options.coalesceInput ?? true,
    stateCodec: options.stateCodec || binarySnapshotCodec,
    maxStateBufferedBytes: Math.min(
      options.maxStateBufferedBytes ?? 128 * 1024,
      maxBufferedBytes,
    ),
    maxInputBufferedBytes: Math.min(
      options.maxInputBufferedBytes ?? DEFAULT_MAX_INPUT_BUFFERED_BYTES,
      maxBufferedBytes,
    ),
  });
}
