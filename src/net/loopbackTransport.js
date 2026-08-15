/**
 * Ordered in-process transport used by solo/campaign and deterministic tests.
 * Its default obeys the same asynchronous delivery and backpressure contract
 * as the network adapters, preventing local play from growing a separate call
 * path. Browser-hosted private matches may opt into synchronous direct mode
 * for their one in-process local peer while retaining the same wire protocol.
 */

export class TransportClosedError extends Error {
  constructor(message = 'transport is closed') {
    super(message);
    this.name = 'TransportClosedError';
    this.code = 'transport_closed';
  }
}

function cloneMessage(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function createEndpoint(label, maxQueuedMessages, direct) {
  const messageListeners = new Set();
  const closeListeners = new Set();
  const queue = [];
  let peer = null;
  let scheduled = false;
  let readyState = 'open';
  let closeReason = null;
  const stats = {
    sent: 0,
    received: 0,
    rejected: 0,
    peakQueue: 0,
  };

  function drain() {
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

  function enqueue(message) {
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

  function finishClose(reason, notifyPeer) {
    if (readyState === 'closed') return;
    readyState = 'closed';
    closeReason = String(reason || 'closed');
    queue.length = 0;
    for (const listener of [...closeListeners]) listener(closeReason);
    messageListeners.clear();
    closeListeners.clear();
    if (notifyPeer && peer) peer._finishClose(closeReason, false);
  }

  const endpoint = {
    kind: 'loopback',
    label,
    send(message) {
      if (readyState !== 'open' || !peer || peer.readyState !== 'open') {
        throw new TransportClosedError();
      }
      const accepted = peer._enqueue(direct ? message : cloneMessage(message));
      if (accepted) stats.sent++;
      else stats.rejected++;
      return accepted;
    },
    onMessage(listener) {
      if (typeof listener !== 'function') throw new TypeError('message listener must be a function');
      messageListeners.add(listener);
      return () => messageListeners.delete(listener);
    },
    onClose(listener) {
      if (typeof listener !== 'function') throw new TypeError('close listener must be a function');
      if (readyState === 'closed') queueMicrotask(() => listener(closeReason));
      else closeListeners.add(listener);
      return () => closeListeners.delete(listener);
    },
    close(reason = 'closed') {
      finishClose(reason, true);
    },
    get readyState() { return readyState; },
    get bufferedMessages() { return queue.length; },
    get stats() { return { ...stats }; },
    _setPeer(value) { peer = value; },
    _enqueue: enqueue,
    _finishClose: finishClose,
  };
  return endpoint;
}

export function createLoopbackTransportPair({ maxQueuedMessages = 256, direct = false } = {}) {
  if (!Number.isInteger(maxQueuedMessages) || maxQueuedMessages < 1) {
    throw new TypeError('maxQueuedMessages must be a positive integer');
  }
  const client = createEndpoint('client', maxQueuedMessages, !!direct);
  const host = createEndpoint('host', maxQueuedMessages, !!direct);
  client._setPeer(host);
  host._setPeer(client);
  return { client, host };
}
