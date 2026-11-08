/**
 * The desktop's half of the phone controller (docs/PHONE-CONTROLLER.md), pure and Node-runnable: what only the receiving
 * computer runs, so the phone's page never imports it and none of it rides to a phone (padPhoneHalf.selftest.mjs). The
 * pairing page's address, the stale-frame fail-safe, the axes frame and the guide's picture decoded, and the mapper that
 * turns axes frames and ctl messages into calls on the game's input-action layer (src/game/input.ts's virtual controls,
 * the touch HUD's path). The mapper is the only place a phone touches the game; the sim never sees it.
 */
import {
  PAD_AIM_SCALE, PAD_AXES_BYTES, PAD_AXES_TYPE, PAD_HOLD_ACTIONS, PAD_TOUR_MAX_PARTS, PAD_TOUR_PARTS, PAD_TOUR_PART_BYTES,
  PAD_TOUR_STOPS, PAD_TOUR_STOP_BYTES, PAD_TOUR_VERSION, padFromBase64,
} from './padProtocol.ts';
import type { PadAxes, PadCtlMessage, PadHoldAction, PadTapAction, PadTourLayout } from './padProtocol.ts';

/** The phone page's address for a code. The code rides in the fragment, which a browser never sends to a server; the
 *  page speaks the phone's own language (its stored choice, else the device's), whatever the desktop's. */
export function padPageUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, '')}/pad#${code}`;
}

/** The desktop's fail-safe: no axes frame for this long zeroes the stick and releases every held control. */
export const PAD_STALE_MS = 400;

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

/** The picture from its text, or null (a wrong version or length, an unknown part or stop, an empty frame). */
export function decodePadTour(text: string): PadTourLayout | null {
  const bytes = typeof text === 'string' && text.length <= 1024 ? padFromBase64(text) : null;
  if (!bytes || bytes.length < 7 || bytes[0] !== PAD_TOUR_VERSION) return null;
  const view = new DataView(bytes.buffer);
  const layout: PadTourLayout = { w: view.getUint16(1), h: view.getUint16(3), parts: [], stops: [] };
  const partCount = bytes[5]!;
  const stopsAt = 6 + partCount * PAD_TOUR_PART_BYTES;
  if (!layout.w || !layout.h || partCount > PAD_TOUR_MAX_PARTS || bytes.length < stopsAt + 1) return null;
  const stopCount = bytes[stopsAt]!;
  if (stopCount > PAD_TOUR_STOPS.length || bytes.length !== stopsAt + 1 + stopCount * PAD_TOUR_STOP_BYTES) return null;
  for (let at = 6; at < stopsAt; at += PAD_TOUR_PART_BYTES) {
    const kind = PAD_TOUR_PARTS[bytes[at]!];
    if (!kind) return null;
    layout.parts.push([kind, view.getUint16(at + 1), view.getUint16(at + 3), view.getUint16(at + 5), view.getUint16(at + 7)]);
  }
  for (let at = stopsAt + 1; at < bytes.length; at += PAD_TOUR_STOP_BYTES) {
    const id = PAD_TOUR_STOPS[bytes[at]!];
    const flags = bytes[at + 13]!;
    if (!id || flags >> 2 > 2 || (flags & 3) > 2) return null;
    layout.stops.push([id, view.getUint16(at + 1), view.getUint16(at + 3), view.getUint16(at + 5), view.getUint16(at + 7),
      view.getUint16(at + 9), view.getUint16(at + 11), flags >> 2, flags & 3]);
  }
  return layout;
}

// ---- the mapper ---------------------------------------------------------------------------------------------------

/** The input layer's virtual controls (src/game/input.ts InputLayer), the touch HUD's path. */
export interface PadInputPort {
  setVirtualMove(x: number, y: number): void;
  addVirtualAim(dx: number, dy: number): void;
  pressVirtual(actionId: PadHoldAction | PadTapAction): void;
  releaseVirtual(actionId: PadHoldAction | PadTapAction): void;
  tapVirtual(actionId: PadTapAction): void;
}

export interface PadInputMapper {
  /** Apply one decoded axes frame (aim totals in eighths). False when it is older than the newest applied. */
  applyAxes(axes: PadAxes, nowMs: number): boolean;
  applyCtl(message: PadCtlMessage): void;
  /** Once a frame: no axes frame for `staleMs` centres the stick and releases every held control. */
  tick(nowMs: number, staleMs: number): void;
  /** Centre the stick and release everything (unpaired, paused, link lost). */
  releaseAll(): void;
  /** The newest frame's phone clock and when it was applied (latency readout). */
  readonly lastPhoneT: number;
  readonly lastAppliedAt: number;
}

/** How far behind the newest frame a frame may arrive and still count as late rather than a restarted stream. */
const PAD_LATE_FRAMES = 64;
/** The longest the stale fail-safe waits, however slowly a throttled phone's heartbeat comes. */
const PAD_STALE_MAX_MS = 1500;

/** The aim pad's drag in phone px, scaled to the mouse's units (the touch HUD's aim drag uses 1.18). */
export const PAD_AIM_GAIN = 1.25;

export function createPadInputMapper(input: PadInputPort, onPause?: () => void): PadInputMapper {
  const pressed = new Set<PadHoldAction>();
  /** The phone's axes seq at each hold's newest ctl event: a frame at or past it is the hold's truth. */
  const ctlSeq = new Map<PadHoldAction, number>();
  let haveFrame = false;
  let seq = 0;
  let aimX = 0;
  let aimY = 0;
  let lastAt = -Infinity;
  let lastPhoneT = 0;
  let moving = false;
  /** The last eight gaps between frames: their median is the phone's usual gap, which a throttled phone (low power)
   *  stretches; one long pause or one burst does not move it. */
  const gaps = new Float64Array(8);
  let gapCount = 0;
  const sorted = new Float64Array(8);
  const usualGap = (): number => {
    const n = Math.min(gapCount, 8);
    if (!n) return 0;
    sorted.set(gaps);
    sorted.subarray(0, n).sort();
    return sorted[n >> 1]!;
  };

  const press = (action: PadHoldAction): void => { if (!pressed.has(action)) { pressed.add(action); input.pressVirtual(action); } };
  const release = (action: PadHoldAction): void => { if (pressed.delete(action)) input.releaseVirtual(action); };

  const mapper: PadInputMapper = {
    get lastPhoneT() { return lastPhoneT; },
    get lastAppliedAt() { return lastAt; },
    applyAxes(axes, nowMs) {
      if (haveFrame && !padSeqNewer(axes.seq, seq)) {
        // a frame a few behind the newest arrived late (the channel is unordered); one far behind is a phone whose
        // stream restarted (a reload resumed the pairing): a fresh baseline, never a dropped controller
        if (((seq - axes.seq) & 0xffff) <= PAD_LATE_FRAMES) return false;
        haveFrame = false;
      }
      if (haveFrame) {
        // int32 totals wrap: the difference is the drag since the last frame applied, lost frames included
        const dx = ((axes.aimX - aimX) | 0) / PAD_AIM_SCALE;
        const dy = ((axes.aimY - aimY) | 0) / PAD_AIM_SCALE;
        if (dx !== 0 || dy !== 0) input.addVirtualAim(dx * PAD_AIM_GAIN, dy * PAD_AIM_GAIN);
      }
      if (haveFrame) gaps[gapCount++ % 8] = Math.min(2000, nowMs - lastAt);
      haveFrame = true;
      seq = axes.seq; aimX = axes.aimX; aimY = axes.aimY;
      lastAt = nowMs; lastPhoneT = axes.t;
      moving = axes.steer !== 0 || axes.throttle !== 0;
      input.setVirtualMove(axes.steer, axes.throttle);
      for (let i = 0; i < PAD_HOLD_ACTIONS.length; i++) {
        const action = PAD_HOLD_ACTIONS[i]!;
        const at = ctlSeq.get(action);
        // a frame older than the hold's last ctl event predates it (the two channels are not ordered together)
        if (at !== undefined && padSeqNewer(at, axes.seq)) continue;
        if (axes.held & (1 << i)) press(action); else release(action);
      }
      return true;
    },
    applyCtl(message) {
      switch (message.k) {
        case 'down': ctlSeq.set(message.a, message.s); press(message.a); return;
        case 'up': ctlSeq.set(message.a, message.s); release(message.a); return;
        case 'tap': input.tapVirtual(message.a); return;
        case 'pause': onPause?.(); return;
        default: return;
      }
    },
    tick(nowMs, staleMs) {
      // four of the phone's usual gaps, never less than the link's own window nor more than the cap
      if (!haveFrame || nowMs - lastAt <= Math.min(PAD_STALE_MAX_MS, Math.max(staleMs, usualGap() * 4))) return;
      if (moving || pressed.size) mapper.releaseAll();
    },
    releaseAll() {
      for (const action of [...pressed]) release(action);
      if (moving) { moving = false; input.setVirtualMove(0, 0); }
      // the next frame is a fresh baseline: a phone that slept does not swing the gun by its drag since
      haveFrame = false;
    },
  };
  return mapper;
}
