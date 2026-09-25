/**
 * The transport contract a match actor speaks. The WebSocket service adapts
 * real sockets; receipts use the in-memory pair. Binary frames only.
 */
import type { CloseReasonId } from '../../src/mp/wire/constants.ts';

export interface ClientLink {
  /** Bytes queued but not yet handed to the network (ws bufferedAmount). */
  readonly bufferedAmount: number;
  readonly closed: boolean;
  /** Human-readable peer label for logs (never an identity). */
  readonly label: string;
  send(bytes: Uint8Array): void;
  /** Close after delivering a CLOSE frame with `reason`. */
  close(reason: CloseReasonId, detail?: string): void;
  onMessage(listener: (bytes: Uint8Array) => void): void;
  onClose(listener: () => void): void;
}

/** The client-side end of an in-memory link (tests, in-process soaks). */
export interface LoopbackClientEnd {
  send(bytes: Uint8Array): void;
  onMessage(listener: (bytes: Uint8Array) => void): void;
  onClose(listener: (reason: CloseReasonId, detail: string) => void): void;
  close(): void;
  readonly closed: boolean;
  /** Simulated outbound congestion seen by the server (bufferedAmount). */
  pressure: number;
  readonly received: number;
}

export function createLoopbackLink(label = 'loopback'): { server: ClientLink; client: LoopbackClientEnd } {
  let closed = false;
  let serverListener: ((bytes: Uint8Array) => void) | null = null;
  let serverClose: (() => void) | null = null;
  let clientListener: ((bytes: Uint8Array) => void) | null = null;
  let clientClose: ((reason: CloseReasonId, detail: string) => void) | null = null;
  let received = 0;
  const client: LoopbackClientEnd = {
    pressure: 0,
    get received() { return received; },
    get closed() { return closed; },
    send(bytes) {
      if (closed) return;
      queueMicrotask(() => { if (!closed) serverListener?.(bytes); });
    },
    onMessage(listener) { clientListener = listener; },
    onClose(listener) { clientClose = listener; },
    close() {
      if (closed) return;
      closed = true;
      queueMicrotask(() => serverClose?.());
    },
  };
  const server: ClientLink = {
    label,
    get bufferedAmount() { return client.pressure; },
    get closed() { return closed; },
    send(bytes) {
      if (closed) throw new Error('link closed');
      received++;
      clientListener?.(bytes);
    },
    close(reason, detail = '') {
      if (closed) return;
      closed = true;
      const notify = clientClose;
      queueMicrotask(() => { notify?.(reason, detail); serverClose?.(); });
    },
    onMessage(listener) { serverListener = listener; },
    onClose(listener) { serverClose = listener; },
  };
  return { server, client };
}
