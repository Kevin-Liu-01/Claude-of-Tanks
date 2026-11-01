/**
 * PadActor: one phone-controller pairing (docs/PHONE-CONTROLLER.md). Runtime-neutral — the rooms Worker's `PadPair`
 * Durable Object and the LAN helper's `localPadService` host the same code, as both host `RoomActor` — so the pairing
 * rules are proven in Node.
 *
 * A pairing is a desktop that asked for a code (`waiting`), then that desktop and one phone (`paired`). The code joins
 * once and lives PAD_CODE_TTL_MS; every refused join is the same `unknown` (a guess learns nothing). Each side holds a
 * resume token (stored as its SHA-256), so a phone that slept or changed network, or a desktop that blinked, comes back
 * to the same pairing; a resumed side replaces its old socket (one phone per player seat). The actor relays WebRTC
 * signaling verbatim (never parsed), grants ICE servers from the host's relay issuer, and relays input frames as a
 * capped last resort. It never sees game state and carries no match traffic.
 */
import {
  PAD_CODE_TTL_MS, PAD_DESKTOP_GRACE_MS, PAD_ICE_LIMIT, PAD_ICE_WINDOW_MS, PAD_PAIR_MAX_MS, PAD_RELAY_BUDGET,
  PAD_RELAY_HZ, PAD_SIGNAL_LIMIT, PAD_SIGNAL_WINDOW_MS, readPadClientMessage,
} from './padProtocol.ts';
import type { PadEndReason, PadHostMessage, PadIceServer, PadRole } from './padProtocol.ts';

export interface PadActorPorts {
  now(): number;
  /** A fresh random token (128 bits, base64url): the host's CSPRNG. */
  randomToken(): string;
  sha256Hex(text: string): string;
  send(socketId: string, message: PadHostMessage): void;
  /** Close a socket after the current event (the host detaches it at once). */
  close(socketId: string, reason: PadEndReason): void;
  /** The next deadline changed (null: none). */
  schedule(atMs: number | null): void;
  /** The durable state changed (the host stores exportState(), or deletes it when null). */
  persist(): void;
  /** ICE servers for one peer connection: STUN, plus TURN when the host holds the relay secrets. Never rejects. */
  iceServers(): Promise<{ iceServers: PadIceServer[]; relay: boolean }>;
}

export interface PadActorState {
  version: 1;
  code: string;
  phase: 'waiting' | 'paired';
  createdAt: number;
  /** waiting: the code's expiry; paired: the pairing's longest life. */
  expiresAt: number;
  desktopToken: string;
  phoneToken: string | null;
  desktopSocket: string | null;
  phoneSocket: string | null;
  desktopAwaySince: number | null;
  relayUsed: number;
}

/** What a socket is, for the host's attachment. */
export interface PadSocketRecord {
  id: string;
  role: PadRole | 'pending';
}

interface Window { start: number; count: number }

export class PadActor {
  readonly code: string;
  #ports: PadActorPorts;
  #state: PadActorState | null = null;
  #sockets = new Map<string, PadSocketRecord>();
  #signals = new Map<string, Window>();
  #ice = new Map<string, Window>();
  #relaySecond = new Map<string, Window>();
  #relaySpentSent = false;
  #relayUnpersisted = 0;

  constructor(code: string, ports: PadActorPorts) {
    this.code = code;
    this.#ports = ports;
  }

  /** The durable state, or null when this code holds nothing. */
  exportState(): PadActorState | null { return this.#state ? { ...this.#state } : null; }

  restore(state: PadActorState | null): void {
    this.#state = state && state.version === 1 && state.code === this.code ? { ...state } : null;
  }

  /** Re-attach a hibernated socket. */
  attachSocket(record: PadSocketRecord): void { this.#sockets.set(record.id, { ...record }); }
  socketRecord(socketId: string): PadSocketRecord | null {
    const record = this.#sockets.get(socketId);
    return record ? { ...record } : null;
  }

  /** True when a desktop may take this code (`/pad/new`): nothing is held here. */
  get vacant(): boolean { return this.#state === null; }
  get phase(): 'vacant' | 'waiting' | 'paired' { return this.#state?.phase ?? 'vacant'; }
  get liveSockets(): number { return this.#sockets.size; }

  /** The earliest deadline: the code's expiry, the desktop's grace, the pairing's longest life. */
  nextDeadline(): number | null {
    const state = this.#state;
    if (!state) return null;
    let next = state.expiresAt;
    if (state.phase === 'paired' && state.desktopAwaySince !== null) next = Math.min(next, state.desktopAwaySince + PAD_DESKTOP_GRACE_MS);
    return next;
  }

  /** `/pad/new`: the desktop takes a vacant code and receives it with its resume token. False: the code is held. */
  openDesktop(socketId: string): boolean {
    if (this.#state) return false;
    const now = this.#ports.now();
    const token = this.#ports.randomToken();
    this.#state = {
      version: 1, code: this.code, phase: 'waiting', createdAt: now, expiresAt: now + PAD_CODE_TTL_MS,
      desktopToken: this.#ports.sha256Hex(token), phoneToken: null, desktopSocket: socketId, phoneSocket: null,
      desktopAwaySince: null, relayUsed: 0,
    };
    this.#sockets.set(socketId, { id: socketId, role: 'desktop' });
    this.#ports.send(socketId, { t: 'code', code: this.code, expiresAt: this.#state.expiresAt, token });
    this.#changed();
    return true;
  }

  /** `/pad/join/<CODE>`: a waiting, unexpired code pairs with this phone; anything else is refused as `unknown`. */
  openJoin(socketId: string): void {
    const state = this.#state;
    const now = this.#ports.now();
    if (!state || state.phase !== 'waiting' || now >= state.expiresAt || state.phoneSocket !== null) {
      this.#refuse(socketId, 'unknown');
      return;
    }
    const token = this.#ports.randomToken();
    state.phase = 'paired';
    state.phoneToken = this.#ports.sha256Hex(token);
    state.phoneSocket = socketId;
    state.expiresAt = state.createdAt + PAD_PAIR_MAX_MS;
    this.#sockets.set(socketId, { id: socketId, role: 'phone' });
    this.#ports.send(socketId, { t: 'joined', token });
    this.#ports.send(socketId, { t: 'peer', state: state.desktopSocket ? 'here' : 'away' });
    if (state.desktopSocket) this.#ports.send(state.desktopSocket, { t: 'peer', state: 'here' });
    this.#changed();
  }

  /** `/pad/resume/<CODE>`: the socket waits for its `resume` message; with nothing held here it is refused at once. */
  openResume(socketId: string): void {
    if (!this.#state) { this.#refuse(socketId, 'unknown'); return; }
    this.#sockets.set(socketId, { id: socketId, role: 'pending' });
  }

  handleMessage(socketId: string, text: string): void {
    const record = this.#sockets.get(socketId);
    const state = this.#state;
    if (!record || !state) { this.#refuse(socketId, 'unknown'); return; }
    const message = readPadClientMessage(text);
    if (!message) { this.#drop(socketId, 'invalid'); return; }
    if (record.role === 'pending') {
      if (message.t !== 'resume') { this.#drop(socketId, 'invalid'); return; }
      this.#resume(socketId, record, message.token);
      return;
    }
    const role = record.role;
    const other = role === 'desktop' ? state.phoneSocket : state.desktopSocket;
    switch (message.t) {
      case 'resume': this.#drop(socketId, 'invalid'); return;
      case 'end': this.#end('ended'); return;
      case 'signal':
        if (state.phase !== 'paired' || !other) { this.#ports.send(socketId, { t: 'error', code: 'not_paired' }); return; }
        if (!this.#admit(this.#signals, socketId, PAD_SIGNAL_LIMIT, PAD_SIGNAL_WINDOW_MS)) { this.#ports.send(socketId, { t: 'error', code: 'rate_limit' }); return; }
        this.#ports.send(other, { t: 'signal', kind: message.kind,
          ...(message.sdp !== undefined ? { sdp: message.sdp } : {}), ...(message.candidate !== undefined ? { candidate: message.candidate } : {}) });
        return;
      case 'ice':
        if (state.phase !== 'paired') { this.#ports.send(socketId, { t: 'error', code: 'not_paired' }); return; }
        if (!this.#admit(this.#ice, socketId, PAD_ICE_LIMIT, PAD_ICE_WINDOW_MS)) { this.#ports.send(socketId, { t: 'error', code: 'rate_limit' }); return; }
        void this.#ports.iceServers().then((grant) => {
          // a socket that left or was replaced while the grant was minted receives nothing
          if (this.#sockets.get(socketId)?.role === role) this.#ports.send(socketId, { t: 'ice', iceServers: grant.iceServers, relay: grant.relay });
        }, () => {
          if (this.#sockets.get(socketId)?.role === role) this.#ports.send(socketId, { t: 'ice', iceServers: [], relay: false });
        });
        return;
      case 'relay': {
        if (state.phase !== 'paired' || !other) return;
        if (state.relayUsed >= PAD_RELAY_BUDGET) {
          if (!this.#relaySpentSent) {
            this.#relaySpentSent = true;
            this.#ports.send(socketId, { t: 'relay_spent' });
            this.#ports.send(other, { t: 'relay_spent' });
          }
          return;
        }
        // a side sending faster than the relay rate (with room for its ctl messages) loses the excess
        if (!this.#admit(this.#relaySecond, socketId, PAD_RELAY_HZ + 5, 1000)) return;
        state.relayUsed++;
        if (++this.#relayUnpersisted >= 100) { this.#relayUnpersisted = 0; this.#ports.persist(); }
        this.#ports.send(other, { t: 'relay', data: message.data });
        return;
      }
    }
  }

  handleClose(socketId: string): void {
    const record = this.#sockets.get(socketId);
    this.#sockets.delete(socketId);
    this.#signals.delete(socketId); this.#ice.delete(socketId); this.#relaySecond.delete(socketId);
    const state = this.#state;
    if (!record || !state) return;
    if (record.role === 'desktop' && state.desktopSocket === socketId) {
      state.desktopSocket = null;
      if (state.phase === 'waiting') { this.#end('desktop_left'); return; } // nobody can use an unseen code
      state.desktopAwaySince = this.#ports.now();
      if (state.phoneSocket) this.#ports.send(state.phoneSocket, { t: 'peer', state: 'away' });
      this.#changed();
    } else if (record.role === 'phone' && state.phoneSocket === socketId) {
      state.phoneSocket = null;
      if (state.desktopSocket) this.#ports.send(state.desktopSocket, { t: 'peer', state: 'away' });
      this.#changed();
    }
  }

  /** The alarm: an expired code, a desktop that did not come back, a pairing past its longest life. */
  tick(): void {
    const state = this.#state;
    if (!state) return;
    const now = this.#ports.now();
    if (state.phase === 'waiting' && now >= state.expiresAt) { this.#end('expired'); return; }
    if (state.phase === 'paired' && now >= state.expiresAt) { this.#end('too_long'); return; }
    if (state.phase === 'paired' && state.desktopAwaySince !== null && now >= state.desktopAwaySince + PAD_DESKTOP_GRACE_MS) {
      this.#end('desktop_left');
      return;
    }
    this.#ports.schedule(this.nextDeadline());
  }

  #resume(socketId: string, record: PadSocketRecord, token: string): void {
    const state = this.#state!;
    const hash = this.#ports.sha256Hex(token);
    const role: PadRole | null = hash === state.desktopToken ? 'desktop' : state.phoneToken !== null && hash === state.phoneToken ? 'phone' : null;
    if (!role) { this.#refuse(socketId, 'unknown'); return; }
    const previous = role === 'desktop' ? state.desktopSocket : state.phoneSocket;
    if (previous && previous !== socketId) {
      this.#sockets.delete(previous);
      this.#ports.send(previous, { t: 'end', reason: 'replaced' });
      this.#ports.close(previous, 'replaced');
    }
    record.role = role;
    if (role === 'desktop') { state.desktopSocket = socketId; state.desktopAwaySince = null; }
    else state.phoneSocket = socketId;
    const other = role === 'desktop' ? state.phoneSocket : state.desktopSocket;
    this.#ports.send(socketId, { t: 'resumed' });
    this.#ports.send(socketId, { t: 'peer', state: other ? 'here' : 'away' });
    if (other) this.#ports.send(other, { t: 'peer', state: 'here' });
    this.#changed();
  }

  #admit(windows: Map<string, Window>, socketId: string, limit: number, windowMs: number): boolean {
    const now = this.#ports.now();
    let window = windows.get(socketId);
    if (!window || now - window.start >= windowMs) { window = { start: now, count: 0 }; windows.set(socketId, window); }
    if (window.count >= limit) return false;
    window.count++;
    return true;
  }

  /** Refuse one socket that holds no role here. */
  #refuse(socketId: string, reason: PadEndReason): void {
    this.#sockets.delete(socketId);
    this.#ports.send(socketId, { t: 'end', reason });
    this.#ports.close(socketId, reason);
  }

  /** Drop one socket that broke the protocol; a role it held is away (it may resume). */
  #drop(socketId: string, reason: PadEndReason): void {
    this.handleClose(socketId);
    this.#ports.send(socketId, { t: 'end', reason });
    this.#ports.close(socketId, reason);
  }

  /** End the pairing for both sides and forget it. */
  #end(reason: PadEndReason): void {
    for (const socketId of [...this.#sockets.keys()]) {
      this.#ports.send(socketId, { t: 'end', reason });
      this.#ports.close(socketId, reason);
    }
    this.#sockets.clear();
    this.#signals.clear(); this.#ice.clear(); this.#relaySecond.clear();
    this.#state = null;
    this.#changed();
  }

  #changed(): void {
    this.#ports.persist();
    this.#ports.schedule(this.nextDeadline());
  }
}
