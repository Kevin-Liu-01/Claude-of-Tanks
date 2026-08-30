/**
 * Ordered in-process transport used by solo/campaign and deterministic tests.
 * Its default obeys the same asynchronous delivery and backpressure contract
 * as the network adapters, preventing local play from growing a separate call
 * path. Browser-hosted private matches may opt into synchronous direct mode
 * for their one in-process local peer while retaining the same wire protocol.
 */

type Unsubscribe = () => void;
type TransportReadyState = 'open' | 'closed';

export interface MessageTransport {
  readonly kind: string;
  readonly readyState: string;
  send(message: unknown): boolean;
  onMessage(listener: (message: unknown) => void): Unsubscribe;
  onClose(listener: (reason: string) => void): Unsubscribe;
  close(reason?: string): void;
}

export interface LoopbackTransportStats {
  sent: number;
  received: number;
  rejected: number;
  peakQueue: number;
}

export interface LoopbackTransport extends MessageTransport {
  readonly kind: 'loopback';
  readonly label: string;
  readonly bufferedMessages: number;
  readonly stats: LoopbackTransportStats;
}

export interface LoopbackTransportPair {
  client: LoopbackTransport;
  host: LoopbackTransport;
}

export interface LoopbackTransportOptions {
  maxQueuedMessages?: number;
  direct?: boolean;
}

interface LoopbackEndpoint extends LoopbackTransport {
  _setPeer(value: LoopbackEndpoint): void;
  _enqueue(message: unknown): boolean;
  _finishClose(reason: unknown, notifyPeer: boolean): void;
}

export class TransportClosedError extends Error {
  readonly code = 'transport_closed';

  constructor(message = 'transport is closed') {
    super(message);
    this.name = 'TransportClosedError';
  }
}

function cloneMessage<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function createEndpoint(
  label: string,
  maxQueuedMessages: number,
  direct: boolean,
): LoopbackEndpoint {
  const messageListeners = new Set<(message: unknown) => void>();
  const closeListeners = new Set<(reason: string) => void>();
  const queue: unknown[] = [];
  let peer: LoopbackEndpoint | null = null;
  let scheduled = false;
  let readyState: TransportReadyState = 'open';
  let closeReason: string | null = null;
  const stats: LoopbackTransportStats = {
    sent: 0,
    received: 0,
    rejected: 0,
    peakQueue: 0,
  };

  function drain(): void {
    scheduled = false;
    if (readyState !== 'open') {
      queue.length = 0;
      return;
    }
    while (queue.length) {
      const message = queue.shift();
      stats.received++;
      for (const listener of [...messageListeners]) listener(message);
    }
  }

  function enqueue(message: unknown): boolean {
    if (readyState !== 'open') return false;
    if (direct) {
      stats.received++;
      for (const listener of messageListeners) listener(message);
      return true;
    }
    if (queue.length >= maxQueuedMessages) {
      stats.rejected++;
      return false;
    }
    queue.push(message);
    if (queue.length > stats.peakQueue) stats.peakQueue = queue.length;
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(drain);
    }
    return true;
  }

  function finishClose(reason: unknown, notifyPeer: boolean): void {
    if (readyState === 'closed') return;
    readyState = 'closed';
    closeReason = String(reason || 'closed');
    queue.length = 0;
    for (const listener of [...closeListeners]) listener(closeReason);
    messageListeners.clear();
    closeListeners.clear();
    if (notifyPeer && peer) peer._finishClose(closeReason, false);
  }

  const endpoint: LoopbackEndpoint = {
    kind: 'loopback',
    label,
    send(message: unknown): boolean {
      if (readyState !== 'open' || !peer || peer.readyState !== 'open') {
        throw new TransportClosedError();
      }
      const accepted = peer._enqueue(direct ? message : cloneMessage(message));
      if (accepted) stats.sent++;
      else stats.rejected++;
      return accepted;
    },
    onMessage(listener: (message: unknown) => void): Unsubscribe {
      if (typeof listener !== 'function') throw new TypeError('message listener must be a function');
      messageListeners.add(listener);
      return () => messageListeners.delete(listener);
    },
    onClose(listener: (reason: string) => void): Unsubscribe {
      if (typeof listener !== 'function') throw new TypeError('close listener must be a function');
      if (readyState === 'closed') queueMicrotask(() => listener(closeReason || 'closed'));
      else closeListeners.add(listener);
      return () => closeListeners.delete(listener);
    },
    close(reason = 'closed'): void {
      finishClose(reason, true);
    },
    get readyState() { return readyState; },
    get bufferedMessages() { return queue.length; },
    get stats() { return { ...stats }; },
    _setPeer(value: LoopbackEndpoint): void { peer = value; },
    _enqueue: enqueue,
    _finishClose: finishClose,
  };
  return endpoint;
}

export function createLoopbackTransportPair({
  maxQueuedMessages = 256,
  direct = false,
}: LoopbackTransportOptions = {}): LoopbackTransportPair {
  if (!Number.isInteger(maxQueuedMessages) || maxQueuedMessages < 1) {
    throw new TypeError('maxQueuedMessages must be a positive integer');
  }
  const client = createEndpoint('client', maxQueuedMessages, !!direct);
  const host = createEndpoint('host', maxQueuedMessages, !!direct);
  client._setPeer(host);
  host._setPeer(client);
  return { client, host };
}
