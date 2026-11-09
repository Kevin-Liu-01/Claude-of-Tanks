/**
 * The desktop's couch lobby (docs/COUCH-MODE.md "The lobby"): one signaling socket to `/pad/lobby` shared by up to
 * PAD_LOBBY_SEATS phones, each a numbered seat driven by its own phone receiver (padReceiver.ts) exactly as a single
 * pairing is.
 *
 * Each seat's receiver runs its own link (padLink.ts, role `desktop`) over a seat socket: a stand-in for a WebSocket that
 * carries that seat's share of the lobby socket. Out of it, `signal` and `relay` gain the seat's number and `end` lets
 * the seat go; into it, the lobby's `seat` presence arrives as the pairing's `peer`, and the seat's `signal`, `relay`
 * and `relay_spent` lose their number. So the link, the mapper, the status, the pings and the stale fail-safe are the
 * single pairing's code, unchanged, once per seat. One ICE grant serves every seat. When the lobby socket drops, the
 * seats' data channels carry on; the lobby comes back with its token, as a pairing's desktop does.
 *
 * The view's state is one declared machine (round 8 Y5 s3-08): connecting, then open or closed as the host says, away
 * while the lobby socket reconnects, and ended for good. `move` is its one writer and refuses what padLobbyMoveAllowed
 * refuses (a move PAD_LOBBY_MOVES does not list: nothing leaves `ended`). No product path asks for a refused move today
 * (once ended, the socket is gone and a stale socket's frames are dropped), so the refusal is a guard, proven on the
 * rule itself (padLobbyResume.selftest.mjs). A setOpen asked while the socket cannot carry it (away, or the reconnect
 * still opening) is kept, the last one asked, and sent once the host holds the lobby again ('resumed'); a remembered
 * open flag is never replayed, so the host's own reply stays the truth (a window that lapsed meanwhile stays closed).
 * The resume's roll call (the host's `lobby` names how many seats it holds, a `seat` follows for each) lets go of a
 * seat whose phone left while the socket was away: the host could not tell this side then.
 *
 * Lazy, as the receiver is: loaded when the host opens couch mode. Browser-only (WebSocket), injectable for tests.
 */
import { PAD_KEEPALIVE_REQUEST, readPadHostMessage } from './padProtocol.ts';
import type { PadEndReason, PadHostMessage, PadIceServer, PadSeatState } from './padProtocol.ts';
import { startPadReceiver } from './padReceiver.ts';
import type { PadReceiver, PadReceiverPorts, PadReceiverView } from './padReceiver.ts';

export interface PadLobbySeat {
  seat: number;
  /** The phone's socket to the lobby: here, or away (asleep, changing network) and holding its seat. */
  presence: PadLobbyPresence;
  view: PadReceiverView;
}

/** A held seat's presence (a seat `gone` is no longer held). */
export type PadLobbyPresence = Exclude<PadSeatState, 'gone'>;

/** The lobby as the host's screen shows it: `away` while its socket reconnects (the host's last word stands meanwhile). */
export const PAD_LOBBY_STATES = ['connecting', 'open', 'closed', 'away', 'ended'] as const;
export type PadLobbyState = (typeof PAD_LOBBY_STATES)[number];

/** Each state's moves (a state may always be published again with new fields). */
export const PAD_LOBBY_MOVES: Readonly<Record<PadLobbyState, readonly PadLobbyState[]>> = Object.freeze({
  // a resumed tab's first socket may drop before the host answers
  connecting: ['open', 'closed', 'away', 'ended'],
  open: ['closed', 'away', 'ended'],
  closed: ['open', 'away', 'ended'],
  away: ['open', 'closed', 'ended'],
  ended: [],
});

/** The view's transition rule, which `move` asks before every write: staying is always allowed (the state published
 *  again with new fields); any other move only where PAD_LOBBY_MOVES lists it, so nothing leaves `ended` and nothing
 *  goes back to `connecting`. */
export function padLobbyMoveAllowed(from: PadLobbyState, to: PadLobbyState): boolean {
  return from === to || PAD_LOBBY_MOVES[from].includes(to);
}

export interface PadLobbyView {
  state: PadLobbyState;
  code: string | null;
  /** When the lobby stops admitting phones (epoch ms); null while closed. */
  until: number | null;
  seats: readonly PadLobbySeat[];
  reason: PadEndReason | 'unreachable' | null;
}

export interface PadLobbyPorts {
  /** A seat's receiver ports: its own input port and status source (the game's seat), and the shared pause. */
  seat(seat: number): PadReceiverPorts;
  /** A seat left for good (the phone left, the host let it go, the lobby ended): the game lets its tank go. */
  seatGone?(seat: number): void;
}

export interface PadLobbyOptions {
  createSocket?: (url: string) => WebSocket;
  /** A lobby this tab held before a reload. */
  resume?: { code: string; token: string };
  /** The lobby's resume token, for the tab to keep. */
  onToken?(code: string, token: string): void;
}

export interface PadLobby {
  readonly view: PadLobbyView;
  subscribe(listener: (view: PadLobbyView) => void): () => void;
  /** Admit phones (for PAD_LOBBY_JOIN_MS from now), or stop admitting. Asked while the lobby reconnects, it goes once
   *  the host holds the lobby again. */
  setOpen(open: boolean): void;
  /** Let one seat go: its phone reads Removed. */
  remove(seat: number): void;
  /** End the lobby for every phone. */
  end(): void;
}

const OPEN = 1;
const CLOSED = 3;
const KEEPALIVE_MS = 15_000;
const RECONNECT_MAX_MS = 8_000;
const RECONNECT_WINDOW_MS = 60_000;
/** One ICE grant serves every seat's peer for this long (TURN credentials outlive it). */
const ICE_REUSE_MS = 10 * 60_000;

type Listener = (event: { data?: string }) => void;

/** One seat's share of the lobby socket, shaped as the WebSocket a link drives. */
class SeatSocket {
  readyState = 0;
  #listeners: Record<'open' | 'message' | 'close', Listener[]> = { open: [], message: [], close: [] };
  #queued: string[] = [];
  readonly #out: (text: string) => void;

  constructor(out: (text: string) => void) {
    this.#out = out;
    // the link adds its listeners after it creates the socket: open on the next turn, then deliver what waited
    queueMicrotask(() => {
      if (this.readyState !== 0) return;
      this.readyState = OPEN;
      this.#emit('open', {});
      for (const text of this.#queued.splice(0)) this.#emit('message', { data: text });
    });
  }

  addEventListener(type: 'open' | 'message' | 'close', listener: Listener): void { this.#listeners[type].push(listener); }
  send(text: string): void { if (this.readyState === OPEN) this.#out(text); }
  close(): void {
    if (this.readyState === CLOSED) return;
    this.readyState = CLOSED;
    this.#emit('close', {});
  }

  deliver(message: PadHostMessage): void {
    const text = JSON.stringify(message);
    if (this.readyState === 0) this.#queued.push(text);
    else if (this.readyState === OPEN) this.#emit('message', { data: text });
  }

  #emit(type: 'open' | 'message' | 'close', event: { data?: string }): void {
    for (const listener of this.#listeners[type]) listener(event);
  }
}

interface SeatEntry {
  seat: number;
  presence: PadLobbyPresence;
  socket: SeatSocket;
  receiver: PadReceiver;
  view: PadReceiverView;
  unsubscribe: () => void;
}

export function startPadLobby(serviceUrl: string, ports: PadLobbyPorts, options: PadLobbyOptions = {}): PadLobby {
  const createSocket = options.createSocket ?? ((url: string) => new WebSocket(url));
  const listeners = new Set<(view: PadLobbyView) => void>();
  const seats = new Map<number, SeatEntry>();
  let code = options.resume?.code ?? '';
  let token = options.resume?.token ?? '';
  let view: PadLobbyView = { state: 'connecting', code: null, until: null, seats: [], reason: null };
  let socket: WebSocket | null = null;
  let keepalive: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectSince = 0;
  let reconnectDelay = 500;
  let ended = false;
  let grant: { iceServers: PadIceServer[]; relay: boolean; at: number } | null = null;
  let iceAsked = false;
  const iceWaiting = new Set<SeatSocket>();
  /** The last setOpen the socket could not carry, sent once the host holds the lobby (null: none waits). */
  let pendingOpen: boolean | null = null;
  /** A resume's roll call: how many seats the host's `lobby` said it holds (null until it says), and those named since. */
  let rollCall: { expected: number | null; named: Set<number> } | null = null;

  /** Publish the view's other fields (never its state: `move` owns that). */
  const publish = (next: Partial<Omit<PadLobbyView, 'state'>>): void => {
    view = {
      ...view, ...next,
      seats: [...seats.values()].sort((a, b) => a.seat - b.seat).map((entry) => ({ seat: entry.seat, presence: entry.presence, view: entry.view })),
    };
    for (const listener of listeners) listener(view);
  };
  /** The state's one writer: a move padLobbyMoveAllowed refuses returns false and nothing is published. */
  const move = (state: PadLobbyState, next: Partial<Omit<PadLobbyView, 'state'>> = {}): boolean => {
    if (!padLobbyMoveAllowed(view.state, state)) return false;
    view = { ...view, state };
    publish(next);
    return true;
  };
  /** True when the message went out (the socket is open). */
  const send = (message: object): boolean => {
    if (!socket || socket.readyState !== OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  };
  /** The host holds the lobby again (its code, or a resume): a setOpen it missed goes now, once. */
  const flushOpen = (): void => {
    if (pendingOpen === null) return;
    const open = pendingOpen;
    pendingOpen = null;
    send({ t: 'lobby', open });
  };

  // ---- the lobby socket -----------------------------------------------------------------------------------------
  function connect(): void {
    const path = token && code ? `/pad/resume/${code}` : '/pad/lobby';
    let ws: WebSocket;
    try { ws = createSocket(`${serviceUrl}${path}`); } catch { fail('unreachable'); return; }
    socket = ws;
    ws.addEventListener('open', () => {
      if (socket !== ws) return;
      reconnectDelay = 500;
      reconnectSince = 0;
      if (token && code) send({ t: 'resume', token });
      clearInterval(keepalive!);
      keepalive = setInterval(() => { if (ws.readyState === OPEN) ws.send(PAD_KEEPALIVE_REQUEST); }, KEEPALIVE_MS);
    });
    ws.addEventListener('message', (event) => {
      if (socket !== ws || typeof event.data !== 'string' || event.data === 'pong') return;
      const message = readPadHostMessage(event.data);
      if (message) onHost(message);
    });
    ws.addEventListener('close', () => {
      if (socket !== ws) return;
      socket = null;
      clearInterval(keepalive!);
      keepalive = null;
      iceAsked = false;
      rollCall = null;
      if (ended) return;
      // the seats' data channels carry on; the lobby comes back with its token (a code never shown dies with it)
      if (!token) { fail(view.state === 'connecting' ? 'unreachable' : 'unknown'); return; }
      if (!reconnectSince) reconnectSince = Date.now();
      if (Date.now() - reconnectSince > RECONNECT_WINDOW_MS) { fail('unreachable'); return; }
      move('away');
      reconnectTimer = setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(RECONNECT_MAX_MS, reconnectDelay * 2);
    });
  }

  function onHost(message: PadHostMessage): void {
    switch (message.t) {
      case 'code':
        code = message.code; token = message.token;
        options.onToken?.(code, token);
        publish({ code });
        flushOpen();
        return;
      case 'lobby':
        if (rollCall && rollCall.expected === null) rollCall.expected = message.seats;
        move(message.open ? 'open' : 'closed', { until: message.until });
        closeRollCall();
        return;
      // the host's own 'lobby' and its roll call follow at once; a setOpen asked while away goes after them
      case 'resumed':
        rollCall = { expected: null, named: new Set() };
        move(view.until !== null ? 'open' : 'closed', { code });
        flushOpen();
        return;
      case 'seat':
        onSeat(message.seat, message.state);
        if (rollCall && message.state !== 'gone') { rollCall.named.add(message.seat); closeRollCall(); }
        return;
      case 'signal': case 'relay': {
        if (message.seat === undefined) return;
        const { seat, ...rest } = message;
        seats.get(seat)?.socket.deliver(rest);
        return;
      }
      case 'relay_spent':
        if (message.seat !== undefined) seats.get(message.seat)?.socket.deliver({ t: 'relay_spent' });
        return;
      case 'ice':
        grant = { iceServers: message.iceServers, relay: message.relay, at: Date.now() };
        iceAsked = false;
        for (const waiting of iceWaiting) waiting.deliver({ t: 'ice', iceServers: grant.iceServers, relay: grant.relay });
        iceWaiting.clear();
        return;
      case 'error':
        // no grant this window: every waiting seat goes on without servers (host candidates on a LAN)
        if (message.code === 'rate_limit' && iceAsked) {
          iceAsked = false;
          for (const waiting of iceWaiting) waiting.deliver({ t: 'error', code: 'rate_limit' });
          iceWaiting.clear();
        }
        return;
      case 'end': fail(message.reason); return;
      default: return;
    }
  }

  /** The roll call is complete: a seat it did not name left while the socket was away, and is let go here. */
  function closeRollCall(): void {
    if (!rollCall || rollCall.expected === null || rollCall.named.size < rollCall.expected) return;
    const { named } = rollCall;
    rollCall = null;
    for (const entry of [...seats.values()]) if (!named.has(entry.seat)) release(entry, 'ended');
  }

  // ---- the seats ------------------------------------------------------------------------------------------------
  function onSeat(seat: number, presence: PadSeatState): void {
    let entry = seats.get(seat);
    if (presence === 'gone') {
      if (entry) release(entry, 'ended');
      return;
    }
    if (!entry) entry = addSeat(seat);
    entry.presence = presence;
    entry.socket.deliver({ t: 'peer', state: presence });
    publish({});
  }

  function addSeat(seat: number): SeatEntry {
    const socket = new SeatSocket((text) => fromSeat(seat, socket, text));
    const receiver = startPadReceiver(serviceUrl, ports.seat(seat), undefined, { createSocket: () => socket as unknown as WebSocket, remember: false, debugSeat: seat });
    const entry: SeatEntry = { seat, presence: 'here', socket, receiver, view: receiver.view, unsubscribe: () => {} };
    entry.unsubscribe = receiver.subscribe((next) => { entry.view = next; publish({}); });
    seats.set(seat, entry);
    return entry;
  }

  /** A seat leaves: its link hears the end (its receiver lets every control go), and the game lets its tank go. */
  function release(entry: SeatEntry, reason: PadEndReason): void {
    seats.delete(entry.seat);
    iceWaiting.delete(entry.socket);
    entry.socket.deliver({ t: 'end', reason });
    entry.socket.close();
    entry.unsubscribe();
    ports.seatGone?.(entry.seat);
    publish({});
  }

  /** What a seat's link sends: its signals and relay frames go out under its number; its ICE request shares the grant. */
  function fromSeat(seat: number, from: SeatSocket, text: string): void {
    if (text === PAD_KEEPALIVE_REQUEST) return;
    let message: { t?: unknown };
    try { message = JSON.parse(text) as { t?: unknown }; } catch { return; }
    switch (message.t) {
      case 'signal': case 'relay': send({ ...message, seat }); return;
      case 'ice':
        if (grant && Date.now() - grant.at < ICE_REUSE_MS) { from.deliver({ t: 'ice', iceServers: grant.iceServers, relay: grant.relay }); return; }
        iceWaiting.add(from);
        // asked only when the ask went out: a dropped one is asked again by the seat's own retry
        if (!iceAsked) iceAsked = send({ t: 'ice' });
        return;
      // a seat's own Disconnect is the host letting that seat go
      case 'end': send({ t: 'kick', seat }); return;
      default: return;
    }
  }

  function fail(reason: PadEndReason | 'unreachable'): void {
    if (ended) return;
    ended = true;
    pendingOpen = null;
    clearTimeout(reconnectTimer!);
    clearInterval(keepalive!);
    const ws = socket;
    socket = null;
    try { ws?.close(1000, 'end'); } catch { /* closed */ }
    for (const entry of [...seats.values()]) release(entry, reason === 'unreachable' ? 'ended' : reason);
    move('ended', { reason, until: null });
  }

  connect();

  return {
    get view() { return view; },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setOpen(open) {
      if (ended) return;
      // the newest ask wins: one that goes now drops an older one still waiting
      pendingOpen = send({ t: 'lobby', open }) ? null : open;
    },
    remove(seat) { if (seats.has(seat)) send({ t: 'kick', seat }); },
    end() {
      send({ t: 'end' });
      fail('ended');
    },
  };
}
