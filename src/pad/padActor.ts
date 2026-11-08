/**
 * PadActor: one phone-controller pairing (docs/PHONE-CONTROLLER.md), or one couch lobby (docs/COUCH-MODE.md).
 * Runtime-neutral — the rooms Worker's `PadPair` Durable Object and the LAN helper's `localPadService` host the same
 * code, as both host `RoomActor` — so the pairing rules are proven in Node.
 *
 * A pairing is a desktop that asked for a code (`waiting`), then that desktop and one phone (`paired`). The code joins
 * once and lives PAD_CODE_TTL_MS; every refused join is the same `unknown` (a guess learns nothing). A lobby is a
 * desktop and up to PAD_LOBBY_SEATS phones, each a numbered seat: its code admits joins while the desktop holds it open
 * (PAD_LOBBY_JOIN_MS at a time), a full lobby answers `full`, and a phone that leaves or is let go frees its seat. Each
 * side holds a resume token (stored as its SHA-256), so a phone that slept or changed network, or a desktop that
 * blinked, comes back to the same seat; a resumed side replaces its old socket (one phone per seat). The actor relays
 * WebRTC signaling verbatim (never parsed), grants ICE servers from the host's relay issuer, and relays input frames as
 * a capped last resort, budgeted per seat. It never sees game state and carries no match traffic.
 */
import {
  PAD_CODE_TTL_MS, PAD_DESKTOP_GRACE_MS, PAD_ICE_LIMIT, PAD_ICE_WINDOW_MS, PAD_LOBBY_JOIN_MS, PAD_LOBBY_SEATS, PAD_PAIR_MAX_MS,
  PAD_RELAY_BUDGET, PAD_RELAY_HZ, PAD_SIGNAL_LIMIT, PAD_SIGNAL_WINDOW_MS, readPadClientMessage,
} from './padProtocol.ts';
import type { PadEndReason, PadHostMessage, PadIceServer, PadRole, PadSeatState } from './padProtocol.ts';

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

/** One phone's seat: its number (1 in a pairing), its token's hash, its live socket and its share of the relay. */
export interface PadSeat {
  seat: number;
  token: string;
  socket: string | null;
  relayUsed: number;
}

export interface PadActorState {
  version: 2;
  code: string;
  /** `pair`: one desktop and one phone; `lobby`: one desktop and up to PAD_LOBBY_SEATS phones. */
  kind: 'pair' | 'lobby';
  phase: 'waiting' | 'paired';
  createdAt: number;
  /** pair waiting: the code's expiry; otherwise the pairing's longest life. */
  expiresAt: number;
  /** A lobby admits joins until this time (null: closed). */
  joinUntil: number | null;
  desktopToken: string;
  desktopSocket: string | null;
  desktopAwaySince: number | null;
  seats: PadSeat[];
}

/** The state before lobbies: one phone's token, socket and the pairing's relay count. */
interface PadActorStateV1 {
  version: 1;
  code: string;
  phase: 'waiting' | 'paired';
  createdAt: number;
  expiresAt: number;
  desktopToken: string;
  phoneToken: string | null;
  desktopSocket: string | null;
  phoneSocket: string | null;
  desktopAwaySince: number | null;
  relayUsed: number;
}

/** What a socket is, for the host's attachment. A phone's carries its seat. */
export interface PadSocketRecord {
  id: string;
  role: PadRole | 'pending';
  seat?: number;
}

interface Window { start: number; count: number }

/** Live sockets a code may hold: the desktop, its phones, and two resuming. */
const PAIR_SOCKETS = 3;
const LOBBY_SOCKETS = 1 + PAD_LOBBY_SEATS + 2;

export class PadActor {
  readonly code: string;
  #ports: PadActorPorts;
  #state: PadActorState | null = null;
  #sockets = new Map<string, PadSocketRecord>();
  #signals = new Map<string, Window>();
  #ice = new Map<string, Window>();
  #relaySecond = new Map<string, Window>();
  #relaySpentSent = new Set<number>();
  #relayUnpersisted = 0;

  constructor(code: string, ports: PadActorPorts) {
    this.code = code;
    this.#ports = ports;
  }

  /** The durable state, or null when this code holds nothing. */
  exportState(): PadActorState | null {
    const state = this.#state;
    return state ? { ...state, seats: state.seats.map((seat) => ({ ...seat })) } : null;
  }

  /** Restore a stored state (a version-1 pairing becomes the same pairing with one seat). */
  restore(state: PadActorState | PadActorStateV1 | null): void {
    if (!state || state.code !== this.code) { this.#state = null; return; }
    if (state.version === 2) { this.#state = { ...state, seats: state.seats.map((seat) => ({ ...seat })) }; return; }
    if (state.version !== 1) { this.#state = null; return; }
    this.#state = {
      version: 2, code: state.code, kind: 'pair', phase: state.phase, createdAt: state.createdAt, expiresAt: state.expiresAt,
      joinUntil: null, desktopToken: state.desktopToken, desktopSocket: state.desktopSocket, desktopAwaySince: state.desktopAwaySince,
      seats: state.phoneToken ? [{ seat: 1, token: state.phoneToken, socket: state.phoneSocket, relayUsed: state.relayUsed }] : [],
    };
  }

  /** Re-attach a hibernated socket (a phone's record from before lobbies holds seat 1). */
  attachSocket(record: PadSocketRecord): void {
    this.#sockets.set(record.id, record.role === 'phone' ? { ...record, seat: record.seat ?? 1 } : { ...record });
  }
  socketRecord(socketId: string): PadSocketRecord | null {
    const record = this.#sockets.get(socketId);
    return record ? { ...record } : null;
  }

  /** True when a desktop may take this code (`/pad/new`, `/pad/lobby`): nothing is held here. */
  get vacant(): boolean { return this.#state === null; }
  get phase(): 'vacant' | 'waiting' | 'paired' { return this.#state?.phase ?? 'vacant'; }
  get liveSockets(): number { return this.#sockets.size; }
  /** The most sockets this code holds at once (the host refuses an upgrade past it). */
  get socketCap(): number { return this.#state?.kind === 'lobby' ? LOBBY_SOCKETS : PAIR_SOCKETS; }

  /** The earliest deadline: the code's expiry or the lobby's join window, the desktop's grace, the longest life. */
  nextDeadline(): number | null {
    const state = this.#state;
    if (!state) return null;
    let next = state.expiresAt;
    if (state.joinUntil !== null) next = Math.min(next, state.joinUntil);
    if (state.phase === 'paired' && state.desktopAwaySince !== null) next = Math.min(next, state.desktopAwaySince + PAD_DESKTOP_GRACE_MS);
    return next;
  }

  /** `/pad/new`: the desktop takes a vacant code and receives it with its resume token. False: the code is held. */
  openDesktop(socketId: string): boolean { return this.#open(socketId, 'pair'); }

  /** `/pad/lobby`: the same for a couch lobby, open for joins at once. */
  openLobby(socketId: string): boolean { return this.#open(socketId, 'lobby'); }

  /** `/pad/join/<CODE>`: a waiting pair's code, or an open lobby with a free seat, seats this phone. Anything else is
   *  refused as `unknown`, except a full lobby (`full`). */
  openJoin(socketId: string): void {
    const state = this.#state;
    const now = this.#ports.now();
    if (!state) { this.#refuse(socketId, 'unknown'); return; }
    if (state.kind === 'pair' && (state.phase !== 'waiting' || now >= state.expiresAt || state.seats.length)) {
      this.#refuse(socketId, 'unknown');
      return;
    }
    if (state.kind === 'lobby') {
      if (state.joinUntil === null || now >= state.joinUntil) { this.#refuse(socketId, 'unknown'); return; }
      if (state.seats.length >= PAD_LOBBY_SEATS) { this.#refuse(socketId, 'full'); return; }
    }
    const token = this.#ports.randomToken();
    let seatNumber = 1;
    while (state.seats.some((seat) => seat.seat === seatNumber)) seatNumber++;
    state.seats.push({ seat: seatNumber, token: this.#ports.sha256Hex(token), socket: socketId, relayUsed: 0 });
    state.seats.sort((a, b) => a.seat - b.seat);
    if (state.phase === 'waiting') {
      state.phase = 'paired';
      if (state.kind === 'pair') state.expiresAt = state.createdAt + PAD_PAIR_MAX_MS;
    }
    this.#sockets.set(socketId, { id: socketId, role: 'phone', seat: seatNumber });
    this.#ports.send(socketId, state.kind === 'lobby' ? { t: 'joined', token, seat: seatNumber } : { t: 'joined', token });
    this.#ports.send(socketId, { t: 'peer', state: state.desktopSocket ? 'here' : 'away' });
    this.#tellDesktop(seatNumber, 'here');
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
    const desktop = record.role === 'desktop';
    const lobby = state.kind === 'lobby';
    const seat = desktop ? this.#seatFor('seat' in message ? message.seat : undefined) : this.#seatOf(record);
    const other = desktop ? seat?.socket ?? null : state.desktopSocket;
    switch (message.t) {
      case 'resume': this.#drop(socketId, 'invalid'); return;
      case 'end':
        // a phone leaving a lobby frees its seat; anything else ends the pairing for every side
        if (lobby && !desktop && seat) { this.#release(seat, 'ended'); return; }
        this.#end('ended');
        return;
      case 'lobby': {
        if (!desktop || !lobby) { this.#drop(socketId, 'invalid'); return; }
        state.joinUntil = message.open ? this.#ports.now() + PAD_LOBBY_JOIN_MS : null;
        this.#ports.send(socketId, { t: 'lobby', open: message.open, until: state.joinUntil, seats: state.seats.length });
        this.#changed();
        return;
      }
      case 'kick': {
        if (!desktop || !lobby) { this.#drop(socketId, 'invalid'); return; }
        const kicked = state.seats.find((entry) => entry.seat === message.seat);
        if (kicked) this.#release(kicked, 'removed');
        return;
      }
      case 'signal':
        if (state.phase !== 'paired' || !other || !seat) { this.#ports.send(socketId, { t: 'error', code: 'not_paired' }); return; }
        if (!this.#admit(this.#signals, socketId, desktop && lobby ? PAD_SIGNAL_LIMIT * PAD_LOBBY_SEATS : PAD_SIGNAL_LIMIT, PAD_SIGNAL_WINDOW_MS)) {
          this.#ports.send(socketId, { t: 'error', code: 'rate_limit' });
          return;
        }
        this.#ports.send(other, { t: 'signal', kind: message.kind,
          ...(message.sdp !== undefined ? { sdp: message.sdp } : {}), ...(message.candidate !== undefined ? { candidate: message.candidate } : {}),
          ...(lobby && !desktop ? { seat: seat.seat } : {}) });
        return;
      case 'ice': {
        if (state.phase !== 'paired' && !(desktop && lobby)) { this.#ports.send(socketId, { t: 'error', code: 'not_paired' }); return; }
        if (!this.#admit(this.#ice, socketId, desktop && lobby ? PAD_ICE_LIMIT + PAD_LOBBY_SEATS : PAD_ICE_LIMIT, PAD_ICE_WINDOW_MS)) {
          this.#ports.send(socketId, { t: 'error', code: 'rate_limit' });
          return;
        }
        const role = record.role;
        void this.#ports.iceServers().then((grant) => {
          // a socket that left or was replaced while the grant was minted receives nothing
          if (this.#sockets.get(socketId)?.role === role) this.#ports.send(socketId, { t: 'ice', iceServers: grant.iceServers, relay: grant.relay });
        }, () => {
          if (this.#sockets.get(socketId)?.role === role) this.#ports.send(socketId, { t: 'ice', iceServers: [], relay: false });
        });
        return;
      }
      case 'relay': {
        if (state.phase !== 'paired' || !other || !seat) return;
        if (seat.relayUsed >= PAD_RELAY_BUDGET) {
          if (!this.#relaySpentSent.has(seat.seat)) {
            this.#relaySpentSent.add(seat.seat);
            if (seat.socket) this.#ports.send(seat.socket, { t: 'relay_spent' });
            if (state.desktopSocket) this.#ports.send(state.desktopSocket, lobby ? { t: 'relay_spent', seat: seat.seat } : { t: 'relay_spent' });
          }
          return;
        }
        // a side sending faster than the relay rate (with room for its ctl messages) loses the excess; a lobby's
        // desktop speaks for every seat, so its window is per seat
        const windowKey = desktop && lobby ? `${socketId}#${seat.seat}` : socketId;
        if (!this.#admit(this.#relaySecond, windowKey, PAD_RELAY_HZ + 5, 1000)) return;
        seat.relayUsed++;
        if (++this.#relayUnpersisted >= 100) { this.#relayUnpersisted = 0; this.#ports.persist(); }
        this.#ports.send(other, { t: 'relay', data: message.data, ...(lobby && !desktop ? { seat: seat.seat } : {}) });
        return;
      }
    }
  }

  handleClose(socketId: string): void {
    const record = this.#sockets.get(socketId);
    this.#sockets.delete(socketId);
    this.#signals.delete(socketId); this.#ice.delete(socketId);
    for (const key of [...this.#relaySecond.keys()]) if (key === socketId || key.startsWith(`${socketId}#`)) this.#relaySecond.delete(key);
    const state = this.#state;
    if (!record || !state) return;
    if (record.role === 'desktop' && state.desktopSocket === socketId) {
      state.desktopSocket = null;
      // nobody can use an unseen code
      if (state.phase === 'waiting') { this.#end('desktop_left'); return; }
      state.desktopAwaySince = this.#ports.now();
      for (const seat of state.seats) if (seat.socket) this.#ports.send(seat.socket, { t: 'peer', state: 'away' });
      this.#changed();
    } else if (record.role === 'phone') {
      const seat = this.#seatOf(record);
      if (!seat || seat.socket !== socketId) return;
      seat.socket = null;
      this.#tellDesktop(seat.seat, 'away');
      this.#changed();
    }
  }

  /** The alarm: an expired code or join window, a desktop that did not come back, a pairing past its longest life. */
  tick(): void {
    const state = this.#state;
    if (!state) return;
    const now = this.#ports.now();
    if (state.kind === 'pair' && state.phase === 'waiting' && now >= state.expiresAt) { this.#end('expired'); return; }
    if (state.kind === 'lobby' && state.joinUntil !== null && now >= state.joinUntil) {
      // a lobby nobody joined expires; one with seats only stops admitting
      if (!state.seats.length) { this.#end('expired'); return; }
      state.joinUntil = null;
      if (state.desktopSocket) this.#ports.send(state.desktopSocket, { t: 'lobby', open: false, until: null, seats: state.seats.length });
      this.#changed();
    }
    if ((state.phase === 'paired' || state.kind === 'lobby') && now >= state.expiresAt) { this.#end('too_long'); return; }
    if (state.phase === 'paired' && state.desktopAwaySince !== null && now >= state.desktopAwaySince + PAD_DESKTOP_GRACE_MS) {
      this.#end('desktop_left');
      return;
    }
    this.#ports.schedule(this.nextDeadline());
  }

  #open(socketId: string, kind: 'pair' | 'lobby'): boolean {
    if (this.#state) return false;
    const now = this.#ports.now();
    const token = this.#ports.randomToken();
    const lobby = kind === 'lobby';
    this.#state = {
      version: 2, code: this.code, kind, phase: 'waiting', createdAt: now,
      expiresAt: lobby ? now + PAD_PAIR_MAX_MS : now + PAD_CODE_TTL_MS, joinUntil: lobby ? now + PAD_LOBBY_JOIN_MS : null,
      desktopToken: this.#ports.sha256Hex(token), desktopSocket: socketId, desktopAwaySince: null, seats: [],
    };
    this.#sockets.set(socketId, { id: socketId, role: 'desktop' });
    this.#ports.send(socketId, { t: 'code', code: this.code, expiresAt: lobby ? this.#state.joinUntil! : this.#state.expiresAt, token });
    if (lobby) this.#ports.send(socketId, { t: 'lobby', open: true, until: this.#state.joinUntil, seats: 0 });
    this.#changed();
    return true;
  }

  /** The seat a desktop's message names: a lobby's by number, a pairing's only phone. */
  #seatFor(seatNumber: number | undefined): PadSeat | null {
    const state = this.#state!;
    if (state.kind === 'pair') return state.seats[0] ?? null;
    return seatNumber === undefined ? null : state.seats.find((seat) => seat.seat === seatNumber) ?? null;
  }

  /** The seat a phone socket holds (null once it was let go). */
  #seatOf(record: PadSocketRecord): PadSeat | null {
    return this.#state?.seats.find((seat) => seat.seat === record.seat) ?? null;
  }

  /** The desktop hears a phone come, go away or leave: a pairing's as `peer`, a lobby's as its numbered `seat`. */
  #tellDesktop(seatNumber: number, presence: PadSeatState): void {
    const state = this.#state!;
    if (!state.desktopSocket) return;
    if (state.kind === 'lobby') this.#ports.send(state.desktopSocket, { t: 'seat', seat: seatNumber, state: presence });
    else if (presence !== 'gone') this.#ports.send(state.desktopSocket, { t: 'peer', state: presence });
  }

  /** A lobby seat leaves (the phone's own end, or the desktop let it go): its socket is told and closed, its token
   *  forgotten, its number free again. */
  #release(seat: PadSeat, reason: 'ended' | 'removed'): void {
    const state = this.#state!;
    state.seats = state.seats.filter((entry) => entry !== seat);
    this.#relaySpentSent.delete(seat.seat);
    if (seat.socket) {
      this.#sockets.delete(seat.socket);
      this.#ports.send(seat.socket, { t: 'end', reason });
      this.#ports.close(seat.socket, reason);
    }
    if (!state.seats.length) state.phase = 'waiting';
    this.#tellDesktop(seat.seat, 'gone');
    this.#changed();
  }

  #resume(socketId: string, record: PadSocketRecord, token: string): void {
    const state = this.#state!;
    const hash = this.#ports.sha256Hex(token);
    if (hash === state.desktopToken) {
      const previous = state.desktopSocket;
      if (previous && previous !== socketId) this.#replace(previous);
      record.role = 'desktop';
      state.desktopSocket = socketId;
      state.desktopAwaySince = null;
      this.#ports.send(socketId, { t: 'resumed' });
      if (state.kind === 'lobby') {
        // the desktop learns where its lobby stands: the join window, and each seat as it is
        this.#ports.send(socketId, { t: 'lobby', open: state.joinUntil !== null, until: state.joinUntil, seats: state.seats.length });
        for (const seat of state.seats) this.#ports.send(socketId, { t: 'seat', seat: seat.seat, state: seat.socket ? 'here' : 'away' });
      } else {
        this.#ports.send(socketId, { t: 'peer', state: state.seats[0]?.socket ? 'here' : 'away' });
      }
      for (const seat of state.seats) if (seat.socket) this.#ports.send(seat.socket, { t: 'peer', state: 'here' });
      this.#changed();
      return;
    }
    const seat = state.seats.find((entry) => entry.token === hash);
    if (!seat) { this.#refuse(socketId, 'unknown'); return; }
    if (seat.socket && seat.socket !== socketId) this.#replace(seat.socket);
    record.role = 'phone';
    record.seat = seat.seat;
    seat.socket = socketId;
    this.#ports.send(socketId, { t: 'resumed' });
    this.#ports.send(socketId, { t: 'peer', state: state.desktopSocket ? 'here' : 'away' });
    this.#tellDesktop(seat.seat, 'here');
    this.#changed();
  }

  /** One side came back on a new socket: the old one is told and closed. */
  #replace(previous: string): void {
    this.#sockets.delete(previous);
    this.#ports.send(previous, { t: 'end', reason: 'replaced' });
    this.#ports.close(previous, 'replaced');
  }

  #admit(windows: Map<string, Window>, key: string, limit: number, windowMs: number): boolean {
    const now = this.#ports.now();
    let window = windows.get(key);
    if (!window || now - window.start >= windowMs) { window = { start: now, count: 0 }; windows.set(key, window); }
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

  /** End the pairing for every side and forget it. */
  #end(reason: PadEndReason): void {
    for (const socketId of [...this.#sockets.keys()]) {
      this.#ports.send(socketId, { t: 'end', reason });
      this.#ports.close(socketId, reason);
    }
    this.#sockets.clear();
    this.#signals.clear(); this.#ice.clear(); this.#relaySecond.clear(); this.#relaySpentSent.clear();
    this.#state = null;
    this.#changed();
  }

  #changed(): void {
    this.#ports.persist();
    this.#ports.schedule(this.nextDeadline());
  }
}
