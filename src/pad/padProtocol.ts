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
/** A pairing's longest life, and how long a desktop that dropped may take to come back. */
export const PAD_PAIR_MAX_MS = 6 * 3600_000;
export const PAD_DESKTOP_GRACE_MS = 60_000;
/** The longest envelope either side may send (an SDP offer with candidates fits in a few KB). */
export const PAD_MAX_MESSAGE_BYTES = 8192;
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
/** The desktop's fail-safe: no axes frame for this long zeroes the stick and releases every held control. */
export const PAD_STALE_MS = 400;
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
  | { kind: 'join'; code: string }
  | { kind: 'resume'; code: string };

/** `/pad/new`, `/pad/join/<CODE>`, `/pad/resume/<CODE>`; anything else is not a pad route. */
export function parsePadRoute(pathname: string): PadRoute | null {
  if (pathname === '/pad/new') return { kind: 'new' };
  const match = /^\/pad\/(join|resume)\/([A-Za-z0-9]{6})$/.exec(pathname);
  if (!match) return null;
  const code = normalizePadCode(match[2]);
  if (!code) return null;
  return match[1] === 'join' ? { kind: 'join', code } : { kind: 'resume', code };
}

// ---- The signaling socket (JSON text frames) ----------------------------------------------------------------------

export type PadSignalKind = 'offer' | 'answer' | 'candidate';

/** Why a socket or a pairing ended. `unknown` covers every refused join (unknown, expired, used, a second phone). */
export type PadEndReason = 'unknown' | 'expired' | 'ended' | 'replaced' | 'desktop_left' | 'too_long' | 'limit' | 'invalid' | 'full';

export interface PadIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/** Client → host. */
export type PadClientMessage =
  | { t: 'resume'; token: string }
  | { t: 'signal'; kind: PadSignalKind; sdp?: string; candidate?: unknown }
  | { t: 'ice' }
  | { t: 'relay'; data: string }
  | { t: 'end' };

/** Host → client. */
export type PadHostMessage =
  | { t: 'code'; code: string; expiresAt: number; token: string }
  | { t: 'joined'; token: string }
  | { t: 'resumed' }
  | { t: 'peer'; state: 'here' | 'away' }
  | { t: 'signal'; kind: PadSignalKind; sdp?: string; candidate?: unknown }
  | { t: 'ice'; iceServers: PadIceServer[]; relay: boolean }
  | { t: 'relay'; data: string }
  | { t: 'relay_spent' }
  | { t: 'error'; code: 'rate_limit' | 'invalid' | 'not_paired' }
  | { t: 'end'; reason: PadEndReason };

const SIGNAL_KINDS = new Set<string>(['offer', 'answer', 'candidate']);

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
      return { t: 'signal', kind: record.kind as PadSignalKind, ...(record.sdp !== undefined ? { sdp: record.sdp } : {}),
        ...(record.candidate !== undefined ? { candidate: record.candidate } : {}) };
    }
    case 'ice': return { t: 'ice' };
    case 'relay': return typeof record.data === 'string' && record.data.length <= 512 ? { t: 'relay', data: record.data } : null;
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
    case 'joined': return typeof record.token === 'string' ? { t: 'joined', token: record.token } : null;
    case 'resumed': return { t: 'resumed' };
    case 'peer': return record.state === 'here' || record.state === 'away' ? { t: 'peer', state: record.state } : null;
    case 'signal':
      return typeof record.kind === 'string' && SIGNAL_KINDS.has(record.kind)
        ? { t: 'signal', kind: record.kind as PadSignalKind, ...(typeof record.sdp === 'string' ? { sdp: record.sdp } : {}),
          ...(record.candidate !== undefined ? { candidate: record.candidate } : {}) } : null;
    case 'ice':
      return Array.isArray(record.iceServers) ? { t: 'ice', iceServers: record.iceServers.filter(isIceServer), relay: record.relay === true } : null;
    case 'relay': return typeof record.data === 'string' ? { t: 'relay', data: record.data } : null;
    case 'relay_spent': return { t: 'relay_spent' };
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

/** A shell slot as the phone shows it: the type's short code (AP, APCR, HE, HEAT, HESH, ATGM…) and the rounds left. */
export interface PadShell {
  type: string;
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
}

export type PadCtlMessage =
  /** `s`: the seq of the first axes frame that carries the new state (the two channels are not ordered together). */
  | { k: 'down'; a: PadHoldAction; s: number }
  | { k: 'up'; a: PadHoldAction; s: number }
  | { k: 'tap'; a: PadTapAction }
  | { k: 'pause' }
  | { k: 'ping'; t: number }
  | { k: 'pong'; t: number; d: number; apply: number }
  | { k: 'status'; s: PadStatus };

const HOLDS = new Set<string>(PAD_HOLD_ACTIONS);
const TAPS = new Set<string>(PAD_TAP_ACTIONS);

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
    default: return null;
  }
}

function isStatus(value: unknown): value is PadStatus {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  return typeof s.battle === 'boolean' && typeof s.alive === 'boolean' && typeof s.paused === 'boolean' &&
    typeof s.sniper === 'boolean' && Number.isInteger(s.slot) && Array.isArray(s.shells) &&
    s.shells.length <= 4 && s.shells.every((shell) => !!shell && typeof (shell as PadShell).type === 'string' &&
      Number.isFinite((shell as PadShell).count)) &&
    Number.isFinite(s.reloadS) && Number.isFinite(s.reloadTotalS);
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

/** Decode into `out`; false when the bytes are not an axes frame. aimX/aimY come back in eighths (raw int32). */
export function decodePadAxes(bytes: ArrayBuffer | Uint8Array, out: PadAxes): boolean {
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (array.byteLength !== PAD_AXES_BYTES || array[0] !== PAD_AXES_TYPE) return false;
  const view = new DataView(array.buffer, array.byteOffset, PAD_AXES_BYTES);
  out.flags = view.getUint8(1);
  out.seq = view.getUint16(2, true);
  out.t = view.getUint32(4, true);
  out.steer = view.getInt16(8, true) / 32767;
  out.throttle = view.getInt16(10, true) / 32767;
  out.aimX = view.getInt32(12, true);
  out.aimY = view.getInt32(16, true);
  out.held = view.getUint32(20, true);
  return true;
}

/** True when uint16 sequence `a` is newer than `b` (wrapping). */
export function padSeqNewer(a: number, b: number): boolean {
  const delta = (a - b) & 0xffff;
  return delta !== 0 && delta < 0x8000;
}

/** The relay envelope's payload is text: `a` + the axes frame in base64, or `c` + a ctl message's JSON. */
export const PAD_RELAY_AXES = 'a';
export const PAD_RELAY_CTL = 'c';

/** The axes frame as relay text (base64 of the 24 bytes): the relay envelope is JSON. */
export function padAxesToRelay(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export function padAxesFromRelay(data: string): Uint8Array | null {
  try {
    const binary = atob(data);
    if (binary.length !== PAD_AXES_BYTES) return null;
    const bytes = new Uint8Array(PAD_AXES_BYTES);
    for (let i = 0; i < PAD_AXES_BYTES; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch { return null; }
}

/** The phone page's address for a code. The code rides in the fragment, which a browser never sends to a server; the
 *  page speaks the phone's own language (its stored choice, else the device's), whatever the desktop's. */
export function padPageUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, '')}/pad#${code}`;
}
