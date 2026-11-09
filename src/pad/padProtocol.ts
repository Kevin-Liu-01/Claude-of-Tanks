/**
 * The phone controller's protocol (docs/PHONE-CONTROLLER.md), shared by the phone page, the desktop receiver, the
 * pairing actor and its two hosts (the rooms Worker's `PadPair` object and the LAN helper). Pure and Node-runnable:
 * codes, routes, the JSON envelopes of the signaling socket and the `ctl` channel, the limits, and the binary `axes`
 * frame. It imports nothing from src/mp: pairing is its own small channel, never a match room.
 */

/** Code symbols: no I, L, O, 0 or 1, which read alike on a phone. 31^6 ≈ 8.9e8 codes. */
export const PAD_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const PAD_CODE_LENGTH = 6;
/** A waiting code's life; the desktop shows the countdown and draws a fresh one on request. */
export const PAD_CODE_TTL_MS = 120_000;
/** A pairing's longest life, and how long a desktop that dropped may take to come back: a laptop's nap, or a reloaded
 *  game's boot on a slow machine (the phone reads Computer away meanwhile). */
export const PAD_PAIR_MAX_MS = 6 * 3600_000;
export const PAD_DESKTOP_GRACE_MS = 5 * 60_000;
/** The longest envelope either side may send (an SDP offer with candidates fits in a few KB). */
export const PAD_MAX_MESSAGE_BYTES = 8192;
/** The longest relay payload the pairing actor takes: a longer one is invalid and drops the socket that sent it, so
 *  padLink refuses to relay one. */
export const PAD_RELAY_DATA_MAX = 512;
/** Signals each side may relay in one window. */
export const PAD_SIGNAL_LIMIT = 60;
export const PAD_SIGNAL_WINDOW_MS = 60_000;
/** ICE grants (STUN, plus TURN when the host holds the relay secrets) each side may ask in one window. */
export const PAD_ICE_LIMIT = 3;
export const PAD_ICE_WINDOW_MS = 600_000;
/** The relay fallback: the phone sends at most this many frames a second, and a pairing may relay this many in all.
 *  Every incoming Durable Object message is billed (20:1 on Workers Free), so the relay is capped, not a transport. */
export const PAD_RELAY_HZ = 15;
export const PAD_RELAY_BUDGET = 12_000;
/** Couch mode (docs/COUCH-MODE.md): a lobby code seats up to this many phones on one desktop, numbered from 1, and
 *  admits joins for this long each time the desktop opens it. The relay budget and the limits count per seat. */
export const PAD_LOBBY_SEATS = 8;
export const PAD_LOBBY_JOIN_MS = 10 * 60_000;
/** The client's keepalive frame, answered by the host without waking a hibernating object (the rooms' pair). */
export const PAD_KEEPALIVE_REQUEST = 'ping';
export const PAD_KEEPALIVE_RESPONSE = 'pong';

export type PadRole = 'desktop' | 'phone';

/** A random code from the injected source of uniform [0, 1) draws (crypto in every host). */
export function drawPadCode(random: () => number): string {
  let code = '';
  for (let i = 0; i < PAD_CODE_LENGTH; i++) {
    code += PAD_CODE_ALPHABET[Math.min(PAD_CODE_ALPHABET.length - 1, Math.floor(random() * PAD_CODE_ALPHABET.length))];
  }
  return code;
}

/** A typed code as its canonical form (upper case, separators dropped), or null. */
export function normalizePadCode(raw: unknown): string | null {
  const text = String(raw ?? '').toUpperCase().replace(/[\s\-_.·]/g, '');
  if (text.length !== PAD_CODE_LENGTH) return null;
  for (const ch of text) if (!PAD_CODE_ALPHABET.includes(ch)) return null;
  return text;
}

/** `K7Q4MZ` → `K7Q 4MZ` for display. */
export function formatPadCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

export type PadRoute =
  | { kind: 'new' }
  | { kind: 'lobby' }
  | { kind: 'join'; code: string }
  | { kind: 'resume'; code: string };

/** `/pad/new`, `/pad/lobby`, `/pad/join/<CODE>`, `/pad/resume/<CODE>`; anything else is not a pad route. */
export function parsePadRoute(pathname: string): PadRoute | null {
  if (pathname === '/pad/new') return { kind: 'new' };
  if (pathname === '/pad/lobby') return { kind: 'lobby' };
  const match = /^\/pad\/(join|resume)\/([A-Za-z0-9]{6})$/.exec(pathname);
  if (!match) return null;
  const code = normalizePadCode(match[2]);
  if (!code) return null;
  return match[1] === 'join' ? { kind: 'join', code } : { kind: 'resume', code };
}

// ---- The signaling socket (JSON text frames) ----------------------------------------------------------------------

export type PadSignalKind = 'offer' | 'answer' | 'candidate';

/** Why a socket or a pairing ended. `unknown` covers every refused join (unknown, expired, used, a second phone, a
 *  closed lobby); `full` is a lobby with every seat taken; `removed` is a seat the desktop let go. */
export type PadEndReason = 'unknown' | 'expired' | 'ended' | 'replaced' | 'desktop_left' | 'too_long' | 'limit' | 'invalid' | 'full' | 'removed';
/** A lobby seat's presence, as the desktop hears it. */
export const PAD_SEAT_STATES = ['here', 'away', 'gone'] as const;
export type PadSeatState = (typeof PAD_SEAT_STATES)[number];

export interface PadIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/** Client → host. A lobby's desktop names the seat its `signal` and `relay` go to; `lobby` and `kick` are its own. */
export type PadClientMessage =
  | { t: 'resume'; token: string }
  | { t: 'signal'; kind: PadSignalKind; sdp?: string; candidate?: unknown; seat?: number }
  | { t: 'ice' }
  | { t: 'relay'; data: string; seat?: number }
  | { t: 'lobby'; open: boolean }
  | { t: 'kick'; seat: number }
  | { t: 'end' };

/** Host → client. A lobby's desktop hears each phone as a numbered seat (`seat`), and its `signal`, `relay` and
 *  `relay_spent` name the seat; a phone in a lobby learns its seat number when it joins and when it resumes. */
export type PadHostMessage =
  | { t: 'code'; code: string; expiresAt: number; token: string }
  | { t: 'joined'; token: string; seat?: number }
  | { t: 'resumed'; seat?: number }
  | { t: 'peer'; state: 'here' | 'away' }
  | { t: 'seat'; seat: number; state: PadSeatState }
  | { t: 'lobby'; open: boolean; until: number | null; seats: number }
  | { t: 'signal'; kind: PadSignalKind; sdp?: string; candidate?: unknown; seat?: number }
  | { t: 'ice'; iceServers: PadIceServer[]; relay: boolean }
  | { t: 'relay'; data: string; seat?: number }
  | { t: 'relay_spent'; seat?: number }
  | { t: 'error'; code: 'rate_limit' | 'invalid' | 'not_paired' }
  | { t: 'end'; reason: PadEndReason };

const SIGNAL_KINDS = new Set<string>(['offer', 'answer', 'candidate']);
const SEAT_STATES = new Set<string>(PAD_SEAT_STATES);

/** A lobby seat number, or undefined (absent or not a seat). */
function seatOf(value: unknown): number | undefined {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= PAD_LOBBY_SEATS ? value as number : undefined;
}

/** A client frame as a typed message, or null (the host closes the socket as `invalid`). */
export function readPadClientMessage(text: string): PadClientMessage | null {
  if (typeof text !== 'string' || text.length > PAD_MAX_MESSAGE_BYTES) return null;
  let value: unknown;
  try { value = JSON.parse(text); } catch { return null; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  switch (record.t) {
    case 'resume':
      return typeof record.token === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(record.token) ? { t: 'resume', token: record.token } : null;
    case 'signal': {
      if (typeof record.kind !== 'string' || !SIGNAL_KINDS.has(record.kind)) return null;
      if (record.sdp !== undefined && typeof record.sdp !== 'string') return null;
      if (record.seat !== undefined && seatOf(record.seat) === undefined) return null;
      return { t: 'signal', kind: record.kind as PadSignalKind, ...(record.sdp !== undefined ? { sdp: record.sdp } : {}),
        ...(record.candidate !== undefined ? { candidate: record.candidate } : {}),
        ...(record.seat !== undefined ? { seat: record.seat as number } : {}) };
    }
    case 'ice': return { t: 'ice' };
    case 'relay':
      if (record.seat !== undefined && seatOf(record.seat) === undefined) return null;
      return typeof record.data === 'string' && record.data.length <= PAD_RELAY_DATA_MAX
        ? { t: 'relay', data: record.data, ...(record.seat !== undefined ? { seat: record.seat as number } : {}) } : null;
    case 'lobby': return typeof record.open === 'boolean' ? { t: 'lobby', open: record.open } : null;
    case 'kick': { const seat = seatOf(record.seat); return seat === undefined ? null : { t: 'kick', seat }; }
    case 'end': return { t: 'end' };
    default: return null;
  }
}

/** A host frame as a typed message, or null (the client ignores it). */
export function readPadHostMessage(text: string): PadHostMessage | null {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return null; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  switch (record.t) {
    case 'code':
      return typeof record.code === 'string' && Number.isFinite(record.expiresAt) && typeof record.token === 'string'
        ? { t: 'code', code: record.code, expiresAt: Number(record.expiresAt), token: record.token } : null;
    case 'joined': {
      if (typeof record.token !== 'string') return null;
      const seat = seatOf(record.seat);
      return { t: 'joined', token: record.token, ...(seat !== undefined ? { seat } : {}) };
    }
    case 'resumed': { const seat = seatOf(record.seat); return { t: 'resumed', ...(seat !== undefined ? { seat } : {}) }; }
    case 'peer': return record.state === 'here' || record.state === 'away' ? { t: 'peer', state: record.state } : null;
    case 'seat': {
      const seat = seatOf(record.seat);
      return seat !== undefined && typeof record.state === 'string' && SEAT_STATES.has(record.state)
        ? { t: 'seat', seat, state: record.state as PadSeatState } : null;
    }
    case 'lobby':
      return typeof record.open === 'boolean' && Number.isInteger(record.seats) && (record.until === null || Number.isFinite(record.until))
        ? { t: 'lobby', open: record.open, until: record.until as number | null, seats: record.seats as number } : null;
    case 'signal': {
      if (typeof record.kind !== 'string' || !SIGNAL_KINDS.has(record.kind)) return null;
      const seat = seatOf(record.seat);
      return { t: 'signal', kind: record.kind as PadSignalKind, ...(typeof record.sdp === 'string' ? { sdp: record.sdp } : {}),
        ...(record.candidate !== undefined ? { candidate: record.candidate } : {}), ...(seat !== undefined ? { seat } : {}) };
    }
    case 'ice':
      return Array.isArray(record.iceServers) ? { t: 'ice', iceServers: record.iceServers.filter(isIceServer), relay: record.relay === true } : null;
    case 'relay': {
      if (typeof record.data !== 'string') return null;
      const seat = seatOf(record.seat);
      return { t: 'relay', data: record.data, ...(seat !== undefined ? { seat } : {}) };
    }
    case 'relay_spent': { const seat = seatOf(record.seat); return { t: 'relay_spent', ...(seat !== undefined ? { seat } : {}) }; }
    case 'error':
      return record.code === 'rate_limit' || record.code === 'invalid' || record.code === 'not_paired' ? { t: 'error', code: record.code } : null;
    case 'end': return typeof record.reason === 'string' ? { t: 'end', reason: record.reason as PadEndReason } : null;
    default: return null;
  }
}

function isIceServer(value: unknown): value is PadIceServer {
  if (!value || typeof value !== 'object') return false;
  const urls = (value as { urls?: unknown }).urls;
  return typeof urls === 'string' || (Array.isArray(urls) && urls.every((url) => typeof url === 'string'));
}

// ---- The `ctl` channel (reliable, ordered, JSON) -----------------------------------------------------------------

/** The controls a phone may name. Each is an action id of src/game/input.ts (padInput.selftest pins them). */
export const PAD_HOLD_ACTIONS = ['fire', 'handbrake', 'freeLook'] as const;
export const PAD_TAP_ACTIONS = [
  'sniperToggle', 'zoomIn', 'zoomOut', 'shell1', 'shell2', 'shell3', 'consumable1', 'consumable2', 'consumable3',
  'reloadMagazine', 'specialAction', 'selfRight', 'smoke', 'autoAim',
] as const;
export type PadHoldAction = (typeof PAD_HOLD_ACTIONS)[number];
export type PadTapAction = (typeof PAD_TAP_ACTIONS)[number];

/** What the battle tells the phone's hands (desktop → phone, sent the moment it happens; padCues.ts maps the game's
 *  events onto them and names each one's buzz): the gun fired, a hit given that hurt or glanced off, a hit taken that
 *  hurt or glanced off, a module knocked out, the tank on fire, a crash, a kill, the tank destroyed, the sixth sense,
 *  a press the battle refused, and the sight locking on or letting go. */
export const PAD_CUES = [
  'shot', 'hit', 'deflect', 'hurt', 'glance', 'module', 'burning', 'impact', 'kill', 'dead', 'spotted', 'denied', 'lock', 'unlock',
] as const;
export type PadCue = (typeof PAD_CUES)[number];

/** The controls guide's picture of the phone (phone → desktop while the guide shows, so the game screen shows it too):
 *  the phone's frame, every control's box in it, and the guide's stops, each with its ring and where its name sits.
 *  Whole frame px; the desktop names each stop in its own language. It travels as compact text (encodePadTour): the
 *  guide opens while a pairing may still be on the relay, whose payload is at most PAD_RELAY_DATA_MAX. */
export const PAD_TOUR_PARTS = ['chip', 'key', 'round', 'dial', 'lever', 'sight', 'fire'] as const;
export const PAD_TOUR_STOPS = ['tilt', 'throttle', 'stick', 'aim', 'fire', 'scope', 'lock'] as const;
export type PadTourPart = (typeof PAD_TOUR_PARTS)[number];
export type PadTourStop = (typeof PAD_TOUR_STOPS)[number];
/** The guide on the phone, as its diagnostics name it: hidden, shown, or how it last ended (Skip on the phone, its time
 *  running out, the pairing's end, Skip on the game screen). */
export const PAD_TOUR_STATES = ['hidden', 'shown', 'skipped', 'timeout', 'ended', 'screen'] as const;
export type PadTourState = (typeof PAD_TOUR_STATES)[number];
export type PadTourEnd = Exclude<PadTourState, 'hidden' | 'shown'>;
/** The guide's life on the phone. Its on:true tells the game screen the time it has left (`ms`), so the screen's copy
 *  never outlives the phone's (round 8 Y5 s6-04); an on:true without it is given this. */
export const PAD_TOUR_MS = 10_000;
/** The longest time left an on:true may carry. */
const TOUR_MS_MAX = 60_000;
export interface PadTourLayout {
  w: number;
  h: number;
  /** [kind, x, y, w, h]. */
  parts: Array<[PadTourPart, number, number, number, number]>;
  /** [stop, x, y, w, h (its ring's box), its name's centre x, y, ring (0 square, 1 round, 2 none), ghost stroke (0 none,
   *  1 across, 2 up and down)]. */
  stops: Array<[PadTourStop, number, number, number, number, number, number, number, number]>;
}

/** A shell slot as the phone shows it: the type's code as every locale prints it (AP, APCR, HE, HEAT, HESH, ATGM…;
 *  src/ui/shellLabels.ts shellTypeCode), its glyph's sprite id (shellIcons.ts) and the rounds left. The desktop resolves
 *  both, so the phone's page loads neither table. */
export interface PadShell {
  type: string;
  icon: string;
  count: number;
  unlimited?: boolean;
}

/** What the desktop tells the phone, sent on change at most a few times a second. */
export interface PadStatus {
  battle: boolean;
  alive: boolean;
  paused: boolean;
  sniper: boolean;
  slot: number;
  shells: PadShell[];
  /** Seconds of reload left and the reload's length (0, 0 when ready). */
  reloadS: number;
  reloadTotalS: number;
  /** The vehicle's spec id (its plan view, `/icons/<id>_top.webp`) and the turret's bearing off the hull, radians
   *  (+ is the gun to the hull's left, the sim's turretYaw). */
  spec?: string;
  turret?: number;
  /** The hull's speed in whole km/h (negative in reverse) and its top speed, for the phone's speedometer. */
  kmh?: number;
  topKmh?: number;
  /** The sight's lock on the enemy nearest the reticle (the autoAim tap): absent where there is none to have (a couch
   *  seat's sight is its own bearing). */
  lock?: boolean;
}

export type PadCtlMessage =
  /** `s`: the seq of the first axes frame that carries the new state (the two channels are not ordered together). */
  | { k: 'down'; a: PadHoldAction; s: number }
  | { k: 'up'; a: PadHoldAction; s: number }
  | { k: 'tap'; a: PadTapAction }
  | { k: 'pause' }
  | { k: 'ping'; t: number }
  | { k: 'pong'; t: number; d: number; apply: number }
  | { k: 'status'; s: PadStatus }
  /** `m`: the cue's strength, 0..1 (a heavier gun, a deeper hit, a harder crash). */
  | { k: 'cue'; c: PadCue; m?: number }
  /** The controls guide opened (with the phone's picture, `l`, encodePadTour's, and its time left on the phone, `ms`) or
   *  ended, on either side: Skip on one ends it on both. */
  | { k: 'tour'; on: boolean; l?: string; ms?: number };

const HOLDS = new Set<string>(PAD_HOLD_ACTIONS);
const TAPS = new Set<string>(PAD_TAP_ACTIONS);
const CUES = new Set<string>(PAD_CUES);

// ---- The guide's picture as text (base64 of bytes, big-endian) ----------------------------------------------------
// [0] version 1, [1..4] the frame's w and h (uint16), [5] the part count, then per part its kind (uint8) and its x, y,
// w, h (uint16); then the stop count, and per stop its id (uint8), its ring's x, y, w, h and its name's centre x, y
// (uint16) and ring << 2 | stroke (uint8). A full panel (18 parts, 6 stops) is 255 bytes, 340 characters. The phone
// encodes it here; the desktop decodes it (padDesk.ts), so the decoder never rides to a phone.
export const PAD_TOUR_VERSION = 1;
export const PAD_TOUR_PART_BYTES = 9;
export const PAD_TOUR_STOP_BYTES = 14;
/** The most parts the picture carries: with every stop, the message still fits one relay payload. */
export const PAD_TOUR_MAX_PARTS = 24;
/** The picture's text has this shape (base64, from the smallest picture to the largest): the reader checks only that,
 *  and the desktop decodes it. */
const TOUR_TEXT_MAX = Math.ceil((6 + PAD_TOUR_MAX_PARTS * PAD_TOUR_PART_BYTES + 1 + PAD_TOUR_STOPS.length * PAD_TOUR_STOP_BYTES) / 3) * 4;
const TOUR_TEXT = new RegExp(`^(?=.{12,${TOUR_TEXT_MAX}}$)[A-Za-z0-9+/]+={0,2}$`);

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
};
/** Base64 text as bytes, or null (the relay's axes frames, the guide's picture). */
export const padFromBase64 = (text: string): Uint8Array | null => {
  try {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch { return null; }
};

export function encodePadTour(layout: PadTourLayout): string {
  const parts = layout.parts.slice(0, PAD_TOUR_MAX_PARTS);
  const stops = layout.stops.slice(0, PAD_TOUR_STOPS.length);
  const bytes = new Uint8Array(6 + parts.length * PAD_TOUR_PART_BYTES + 1 + stops.length * PAD_TOUR_STOP_BYTES);
  const view = new DataView(bytes.buffer);
  const u16 = (at: number, value: number): void => view.setUint16(at, Math.max(0, Math.min(0xffff, Math.round(value) || 0)));
  bytes[0] = PAD_TOUR_VERSION;
  u16(1, layout.w);
  u16(3, layout.h);
  bytes[5] = parts.length;
  let at = 6;
  for (const [kind, x, y, w, h] of parts) {
    bytes[at] = PAD_TOUR_PARTS.indexOf(kind);
    u16(at + 1, x); u16(at + 3, y); u16(at + 5, w); u16(at + 7, h);
    at += PAD_TOUR_PART_BYTES;
  }
  bytes[at++] = stops.length;
  for (const [id, x, y, w, h, cx, cy, ring, stroke] of stops) {
    bytes[at] = PAD_TOUR_STOPS.indexOf(id);
    u16(at + 1, x); u16(at + 3, y); u16(at + 5, w); u16(at + 7, h); u16(at + 9, cx); u16(at + 11, cy);
    bytes[at + 13] = ((ring & 3) << 2) | (stroke & 3);
    at += PAD_TOUR_STOP_BYTES;
  }
  return toBase64(bytes);
}

export function readPadCtl(text: string): PadCtlMessage | null {
  if (typeof text !== 'string' || text.length > 2048) return null;
  let value: unknown;
  try { value = JSON.parse(text); } catch { return null; }
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  switch (record.k) {
    case 'down': case 'up':
      return typeof record.a === 'string' && HOLDS.has(record.a) && Number.isInteger(record.s)
        ? { k: record.k, a: record.a as PadHoldAction, s: Number(record.s) & 0xffff } : null;
    case 'tap': return typeof record.a === 'string' && TAPS.has(record.a) ? { k: 'tap', a: record.a as PadTapAction } : null;
    case 'pause': return { k: 'pause' };
    case 'ping': return Number.isFinite(record.t) ? { k: 'ping', t: Number(record.t) } : null;
    case 'pong':
      return Number.isFinite(record.t) && Number.isFinite(record.d) ? { k: 'pong', t: Number(record.t), d: Number(record.d), apply: Number(record.apply) || 0 } : null;
    case 'status': return isStatus(record.s) ? { k: 'status', s: record.s } : null;
    case 'cue':
      if (typeof record.c !== 'string' || !CUES.has(record.c)) return null;
      return Number.isFinite(record.m) ? { k: 'cue', c: record.c as PadCue, m: Math.max(0, Math.min(1, Number(record.m))) }
        : { k: 'cue', c: record.c as PadCue };
    case 'tour': {
      if (typeof record.on !== 'boolean') return null;
      const time = record.on && Number.isFinite(record.ms) ? { ms: Math.max(0, Math.min(TOUR_MS_MAX, Number(record.ms))) } : {};
      if (record.l === undefined) return { k: 'tour', on: record.on, ...time };
      return record.on && typeof record.l === 'string' && TOUR_TEXT.test(record.l) ? { k: 'tour', on: true, l: record.l, ...time } : null;
    }
    default: return null;
  }
}

function isStatus(value: unknown): value is PadStatus {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  return typeof s.battle === 'boolean' && typeof s.alive === 'boolean' && typeof s.paused === 'boolean' &&
    typeof s.sniper === 'boolean' && Number.isInteger(s.slot) && Array.isArray(s.shells) &&
    s.shells.length <= 4 && s.shells.every((shell) => !!shell && typeof (shell as PadShell).type === 'string' &&
      typeof (shell as PadShell).icon === 'string' && /^[A-Za-z0-9]{1,32}$/.test((shell as PadShell).icon) &&
      Number.isFinite((shell as PadShell).count)) &&
    Number.isFinite(s.reloadS) && Number.isFinite(s.reloadTotalS) &&
    (s.spec === undefined || (typeof s.spec === 'string' && /^[a-z0-9_]{1,48}$/.test(s.spec))) &&
    (s.turret === undefined || Number.isFinite(s.turret)) &&
    (s.kmh === undefined || Number.isFinite(s.kmh)) && (s.topKmh === undefined || Number.isFinite(s.topKmh)) &&
    (s.lock === undefined || typeof s.lock === 'boolean');
}

// ---- The `axes` frame (binary, 24 bytes) -------------------------------------------------------------------------

export const PAD_AXES_TYPE = 1;
export const PAD_AXES_BYTES = 24;
/** Aim totals travel in eighths of a pixel. */
export const PAD_AIM_SCALE = 8;
/** flags: the steering came from the tilt (not the on-screen stick). */
export const PAD_FLAG_TILT = 1;

export interface PadAxes {
  flags: number;
  /** 0..65535, wrapping. */
  seq: number;
  /** The phone's clock in ms (wrapping uint32). */
  t: number;
  /** -1 (left) .. 1 (right). */
  steer: number;
  /** -1 (reverse) .. 1 (forward). */
  throttle: number;
  /** Running totals of the aim pad's drag in px (int32 in eighths, wrapping). */
  aimX: number;
  aimY: number;
  /** Bit i set: PAD_HOLD_ACTIONS[i] held. */
  held: number;
}

const unit16 = (value: number): number => Math.round(Math.max(-1, Math.min(1, Number(value) || 0)) * 32767);

/** Encode into `out` (reused; no allocation per frame). */
export function encodePadAxes(axes: PadAxes, out: Uint8Array = new Uint8Array(PAD_AXES_BYTES)): Uint8Array {
  const view = new DataView(out.buffer, out.byteOffset, PAD_AXES_BYTES);
  view.setUint8(0, PAD_AXES_TYPE);
  view.setUint8(1, axes.flags & 0xff);
  view.setUint16(2, axes.seq & 0xffff, true);
  view.setUint32(4, axes.t >>> 0, true);
  view.setInt16(8, unit16(axes.steer), true);
  view.setInt16(10, unit16(axes.throttle), true);
  view.setInt32(12, Math.round(axes.aimX * PAD_AIM_SCALE) | 0, true);
  view.setInt32(16, Math.round(axes.aimY * PAD_AIM_SCALE) | 0, true);
  view.setUint32(20, axes.held >>> 0, true);
  return out;
}

/** The relay envelope's payload is text: `a` + the axes frame in base64, or `c` + a ctl message's JSON. */
export const PAD_RELAY_AXES = 'a';
export const PAD_RELAY_CTL = 'c';

/** The axes frame as relay text (base64 of the 24 bytes): the relay envelope is JSON. */
export function padAxesToRelay(bytes: Uint8Array): string {
  return toBase64(bytes);
}

export function padAxesFromRelay(data: string): Uint8Array | null {
  const bytes = padFromBase64(data);
  return bytes && bytes.length === PAD_AXES_BYTES ? bytes : null;
}
