/**
 * The desktop's phone receiver (docs/PHONE-CONTROLLER.md "Desktop side"), loaded only when the player presses Connect
 * phone. It owns the link (role `desktop`), the mapper into the input-action layer, the status it tells the phone, the
 * pings that measure the round trip, and the stale fail-safe. It never imports game state: the composition root hands
 * it the input layer, a status reader and the pause toggle, as it hands the touch HUD its ports.
 */
import { createPadLink } from './padLink.ts';
import type { PadLink, PadLinkState } from './padLink.ts';
import { createPadInputMapper } from './padInput.ts';
import type { PadInputPort } from './padInput.ts';
import { PAD_STALE_MS, decodePadAxes } from './padProtocol.ts';
import type { PadAxes, PadStatus } from './padProtocol.ts';
import { shellIconId } from '../ui/shellIcons.ts';

/** The local player as the receiver reads it (the battle entity's fields the phone shows). */
interface PadPlayer {
  combat: { destroyed?: boolean; shellSlot: number; ammo: readonly number[]; reload: { t: number; totalS: number } } | null;
  spec: { id?: string; gun: { shells: ReadonlyArray<{ type: string; guided?: boolean }> } };
  state?: { turretYaw: number } | null;
}

/** What the composition root hands over (main.ts): the raw facts, so the mapping rides in this lazy chunk. The shell
 *  codes come through it too (src/ui/shellLabels.ts shellTypeCode, which the game's boot already holds): imported here,
 *  this lazy chunk would split that module out of its boot chunk into a request of its own. */
export interface PadStatusSource {
  battle: boolean;
  paused: boolean;
  sniper: boolean;
  player: PadPlayer | null;
  shellCode(type: string): string;
}

/** The phone's readout of the local player: ammunition (code, glyph, rounds), the slot, reload, scope, pause. */
export function padStatusOf(source: PadStatusSource | null): PadStatus | null {
  const player = source?.player;
  const combat = player?.combat;
  if (!source?.battle || !player || !combat) return null;
  return {
    battle: true,
    alive: !combat.destroyed,
    paused: source.paused,
    sniper: source.sniper,
    slot: combat.shellSlot | 0,
    shells: player.spec.gun.shells.slice(0, 3).map((shell, slot) => {
      const type = shell.guided ? 'ATGM' : shell.type;
      return { type: source.shellCode(type), icon: shellIconId(type), count: Math.max(0, Math.floor(combat.ammo[slot] || 0)) };
    }),
    reloadS: Math.max(0, combat.reload.t),
    reloadTotalS: combat.reload.totalS,
    ...(player.spec.id && /^[a-z0-9_]{1,48}$/.test(player.spec.id) ? { spec: player.spec.id } : {}),
    // a tenth of a degree is the bearing's grain: the readout changes (and is sent) only when the gun moves
    ...(player.state ? { turret: Math.round(player.state.turretYaw * 573) / 573 } : {}),
  };
}

export interface PadReceiverPorts {
  input: PadInputPort;
  /** The local player's battle facts for the phone's ammunition, reload and scope (null outside a battle). */
  source(): PadStatusSource | null;
  /** The phone's pause button: the same Settings toggle as Escape. */
  togglePause(): void;
}

export interface PadReceiverView {
  readonly state: PadLinkState;
  /** The round trip to the phone over the link in use, ms (null until measured). */
  readonly rttMs: number | null;
}

export interface PadReceiver {
  readonly view: PadReceiverView;
  subscribe(listener: (view: PadReceiverView) => void): () => void;
  /** End the pairing for both sides. */
  disconnect(): void;
}

const IDLE_STATUS: PadStatus = Object.freeze({ battle: false, alive: false, paused: false, sniper: false, slot: 0, shells: [], reloadS: 0, reloadTotalS: 0 }) as PadStatus;

/** Diagnostics for the pad e2e and the owner's latency check (dev builds and `?padDebug`). */
interface PadDebug {
  state: string;
  path: string;
  frames: number;
  rttMs: number | null;
  /** Receipt of an axes frame to the next animation frame (when the game samples it), ms, smoothed. */
  applyMs: number;
  lastPhoneT: number;
  /** The newest frames' phone stamps and receipt times (epoch ms, uint32): the e2e splits the latency with them. */
  trace: Array<[number, number]>;
}

export function startPadReceiver(serviceUrl: string, ports: PadReceiverPorts): PadReceiver {
  const listeners = new Set<(view: PadReceiverView) => void>();
  let view: PadReceiverView = { state: { kind: 'connecting' }, rttMs: null };
  const mapper = createPadInputMapper(ports.input, ports.togglePause);
  const axes: PadAxes = { flags: 0, seq: 0, t: 0, steer: 0, throttle: 0, aimX: 0, aimY: 0, held: 0 };
  let lastStatus = '';
  let lastStatusAt = -Infinity;
  let lastPingAt = -Infinity;
  let applyMs = 0;
  let pendingApplyAt = -1;
  let frames = 0;
  const debug: PadDebug | null = import.meta.env.DEV || (typeof location !== 'undefined' && /[?&]padDebug\b/.test(location.search))
    ? { state: 'connecting', path: '', frames: 0, rttMs: null, applyMs: 0, lastPhoneT: 0, trace: [] } : null;
  if (debug) (globalThis as { __COT_PAD?: PadDebug }).__COT_PAD = debug;

  const publish = (next: Partial<PadReceiverView>): void => {
    view = { ...view, ...next };
    if (debug) {
      debug.state = view.state.kind;
      debug.path = view.state.kind === 'live' ? view.state.path : '';
      debug.rttMs = view.rttMs;
    }
    for (const listener of listeners) listener(view);
  };

  const onFrame = (at: number): void => {
    if (pendingApplyAt < 0) return;
    // the game samples the input layer in this animation frame: receipt → sample is the desktop's share of the latency
    applyMs = applyMs ? applyMs * 0.8 + (at - pendingApplyAt) * 0.2 : at - pendingApplyAt;
    pendingApplyAt = -1;
    if (debug) debug.applyMs = applyMs;
  };

  const link: PadLink = createPadLink({
    role: 'desktop',
    serviceUrl,
    onState(state) {
      if (state.kind === 'away' || state.kind === 'ended') mapper.releaseAll();
      if (state.kind === 'ended') stop();
      publish({ state, ...(state.kind === 'live' ? {} : { rttMs: null }) });
    },
    onAxes(bytes) {
      if (!decodePadAxes(bytes, axes)) return;
      const now = performance.now();
      if (!mapper.applyAxes(axes, now)) return;
      frames++;
      if (debug) {
        debug.frames = frames; debug.lastPhoneT = axes.t;
        debug.trace.push([axes.t, Math.round(performance.timeOrigin + now) >>> 0]);
        if (debug.trace.length > 128) debug.trace.shift();
      }
      if (pendingApplyAt < 0) { pendingApplyAt = now; requestAnimationFrame(onFrame); }
    },
    onCtl(message) {
      if (message.k === 'ping') link.sendCtl({ k: 'pong', t: message.t, d: performance.now(), apply: Math.round(applyMs * 10) / 10 });
      else if (message.k === 'pong') publish({ rttMs: Math.max(0, performance.now() - message.t) });
      else if (message.k !== 'status') mapper.applyCtl(message);
    },
  });

  const timer = setInterval(() => {
    const now = performance.now();
    const relay = view.state.kind === 'live' && view.state.path === 'relay';
    mapper.tick(now, relay ? 1000 : PAD_STALE_MS);
    if (view.state.kind !== 'live') return;
    // the phone's readout: on change, at most 5 a second (one on the billed relay), and a heartbeat every 2 s
    const status = JSON.stringify(padStatusOf(ports.source()) ?? IDLE_STATUS);
    const gap = now - lastStatusAt;
    if ((status !== lastStatus && gap >= (relay ? 1000 : 200)) || gap >= 2000) {
      if (link.sendCtl({ k: 'status', s: JSON.parse(status) as PadStatus })) { lastStatus = status; lastStatusAt = now; }
    }
    if (now - lastPingAt >= (relay ? 5000 : 1000)) { lastPingAt = now; link.sendCtl({ k: 'ping', t: now }); }
  }, 100);

  function stop(): void {
    clearInterval(timer);
    mapper.releaseAll();
  }

  return {
    get view() { return view; },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    disconnect() {
      stop();
      link.end();
    },
  };
}
