/**
 * A transport whose connection can be replaced under a running MatchClient (P2 client lane): a peer the room elects
 * as host swaps its WebRTC link for the loopback pair into its own actor; a host the room replaces swaps the other
 * way. `replace(next)` closes the current transport, reports `reconnecting` (no backoff: the next link is already
 * being opened) and, once the new one is open, `open { resumed: true }` — the MatchClient then runs its handshake
 * again, exactly as after a socket reconnect. Frames, states and stats are forwarded; the stats sum over every
 * transport this one has worn. A peer-to-peer reconnect to a NEW remote host needs no replacement: the WebRTC
 * transport retargets by itself.
 */
import { Listeners, TRANSPORT_CLOSE, createTransportStats } from './transport.ts';
import type { Transport, TransportCloseReason, TransportState, TransportStateChange, TransportStats, Unsubscribe } from './transport.ts';

export class MigratingTransport implements Transport {
  readonly kind = 'migrating';
  private current: Transport;
  private readonly frameListeners = new Listeners<Uint8Array>();
  private readonly stateListeners = new Listeners<TransportStateChange>();
  private readonly baseStats: TransportStats = createTransportStats();
  private readonly statsView: TransportStats = createTransportStats();
  private unsubscribe: Unsubscribe[] = [];
  private replacing = false;
  private replacements = 0;
  private closed = false;

  constructor(initial: Transport) {
    if (!initial || typeof initial.send !== 'function') throw new TypeError('a transport is required');
    this.current = initial;
    this.attach(initial, false);
  }

  /** The transport currently carrying the frames. */
  get inner(): Transport { return this.current; }
  get replacementCount(): number { return this.replacements; }

  get state(): TransportState {
    if (this.closed) return 'closed';
    if (this.replacing) return this.current.state === 'open' ? 'open' : 'reconnecting';
    return this.current.state;
  }

  get bufferedBytes(): number { return this.current.bufferedBytes; }

  get stats(): Readonly<TransportStats> {
    const inner = this.current.stats;
    const view = this.statsView;
    view.framesSent = this.baseStats.framesSent + inner.framesSent;
    view.bytesSent = this.baseStats.bytesSent + inner.bytesSent;
    view.framesReceived = this.baseStats.framesReceived + inner.framesReceived;
    view.bytesReceived = this.baseStats.bytesReceived + inner.bytesReceived;
    view.framesDropped = this.baseStats.framesDropped + inner.framesDropped;
    view.framesRejected = this.baseStats.framesRejected + inner.framesRejected;
    view.reconnects = this.baseStats.reconnects + inner.reconnects;
    view.opens = this.baseStats.opens + inner.opens;
    return view;
  }

  onFrame(listener: (frame: Uint8Array) => void): Unsubscribe { return this.frameListeners.add(listener); }
  onState(listener: (change: TransportStateChange) => void): Unsubscribe { return this.stateListeners.add(listener); }

  open(): void { if (!this.closed) this.current.open(); }
  send(frame: Uint8Array): boolean { return !this.closed && this.current.send(frame); }
  reconnect(reason: TransportCloseReason, detail?: string): void { if (!this.closed) this.current.reconnect(reason, detail); }

  close(reason: TransportCloseReason = TRANSPORT_CLOSE.CLIENT, detail = ''): void {
    if (this.closed) return;
    this.closed = true;
    const previous = this.state;
    this.detach();
    this.current.close(reason, detail);
    this.stateListeners.emit({ state: 'closed', previous, reason, detail });
    this.frameListeners.clear();
  }

  /**
   * Carry the client on `next` from now on. The current transport is closed (its frames stop at once); `next` is opened
   * if it is not already; the owner sees `reconnecting` then `open { resumed: true }`.
   */
  replace(next: Transport, detail = 'host migration'): void {
    if (this.closed) throw new Error('transport closed');
    if (next === this.current) return;
    const previous = this.current;
    this.detach();
    const inner = previous.stats;
    this.baseStats.framesSent += inner.framesSent; this.baseStats.bytesSent += inner.bytesSent;
    this.baseStats.framesReceived += inner.framesReceived; this.baseStats.bytesReceived += inner.bytesReceived;
    this.baseStats.framesDropped += inner.framesDropped; this.baseStats.framesRejected += inner.framesRejected;
    this.baseStats.reconnects += inner.reconnects; this.baseStats.opens += inner.opens;
    previous.close(TRANSPORT_CLOSE.CLIENT, detail);
    this.replacements++;
    this.replacing = true;
    this.current = next;
    this.stateListeners.emit({ state: 'reconnecting', previous: 'open', reason: TRANSPORT_CLOSE.NETWORK, detail, attempt: this.replacements, retryDelayMs: 0 });
    this.attach(next, true);
    if (next.state === 'open') this.finishReplacement(next, 0);
    else if (next.state === 'idle' || next.state === 'closed') next.open();
  }

  private finishReplacement(next: Transport, attempt: number): void {
    if (this.current !== next) return;
    this.replacing = false;
    this.stateListeners.emit({ state: 'open', previous: 'reconnecting', attempt, resumed: true });
  }

  private attach(transport: Transport, replacement: boolean): void {
    this.unsubscribe.push(transport.onFrame((frame) => { if (this.current === transport && !this.closed) this.frameListeners.emit(frame); }));
    this.unsubscribe.push(transport.onState((change) => {
      if (this.current !== transport || this.closed) return;
      if (replacement && this.replacing) {
        // The replacement's own connecting/open sequence collapses into one resumed open for the owner.
        if (change.state === 'open') this.finishReplacement(transport, change.attempt ?? 0);
        else if (change.state === 'closed') { this.replacing = false; this.stateListeners.emit(change); }
        return;
      }
      this.stateListeners.emit(change);
    }));
  }

  private detach(): void {
    for (const off of this.unsubscribe.splice(0)) off();
  }
}
