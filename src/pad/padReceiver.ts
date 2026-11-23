/**
 * The desktop's phone receiver (docs/PHONE-CONTROLLER.md "Desktop side"), loaded only when the player presses Connect
 * phone. It owns the link (role `desktop`), the mapper into the input-action layer, the status it tells the phone, the
 * pings that measure the round trip, and the stale fail-safe. It never imports game state: the composition root hands
 * it the input layer, a status reader and the pause toggle, as it hands the touch HUD its ports.
 */
import { createPadLink } from './padLink.ts';
import type { PadLink, PadLinkState } from './padLink.ts';
import { PAD_STALE_MS, createPadInputMapper, decodePadAxes, decodePadTour, padActsMask } from './padDesk.ts';
import type { PadCommandPort, PadInputPort } from './padDesk.ts';
import { PAD_TOUR_MS } from './padProtocol.ts';
import type { PadAxes, PadMode, PadStatus, PadTourLayout } from './padProtocol.ts';
import { PAD_CUE_EVENTS, padCueOf } from './padCues.ts';
import { showPadTour } from './padTourScreen.ts';
import { shellIconId } from '../ui/shellIcons.ts';
import { GARAGE_AUXILIARY_SUMMARY } from '../ui/garageAuxiliarySummary.generated.ts';
import { availableVehicleActions, vehicleAction } from '../game/vehicleActions.ts';
import { createShotCadence } from '../game/shotCadence.ts';
import type { HullFlightState } from '../sim/hullFlight.ts';

/** The local player as the receiver reads it (the battle entity's fields the phone shows). */
interface PadPlayer {
  /** The battle entity's id: the bus names the tank each event is about by it (padCues.ts). */
  id?: string;
  combat: { destroyed?: boolean; shellSlot: number; ammo: readonly number[]; reload: { t: number; totalS: number } } | null;
  spec: { id?: string; topSpeedKmh?: number; hydropneumaticAim?: unknown;
    gun: { autoloader?: unknown; shells: ReadonlyArray<{ type: string; guided?: boolean }> } };
  state?: ({ turretYaw: number; speed?: number } & HullFlightState) | null;
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
  /** The sight can lock on (the autoAim tap): the page's own player; a couch seat's sight is its own bearing. */
  lockable?: boolean;
  /** What the player's input drives now (padLayout.ts lays the phone out for it); absent: a tank, or dead once it is
   *  destroyed. Watch and a destroyed player's killcam need no player. */
  mode?: PadMode;
  /** What decides the optional controls this player has in that mode (padGrants): the battle's grants and where the
   *  player stands in Watch and after death. */
  facts?: PadModeFacts;
  /** The granted controls unavailable this moment (padLayout.ts PAD_ACTS ids; turbo-spin-275): the air spin on the ground,
   *  Turbo while it cools. The phone greys their keys (PadStatus.u). */
  unavailable?: readonly string[];
}

/** The facts the phone's optional controls follow (padLayout.ts PAD_ACTS). */
export interface PadModeFacts {
  /** The battle's mode grants a jump, Turbo and the air spin, the drone, Air Support, consumables, the Proving Ground's
   *  range keys. */
  jump?: boolean;
  turbo?: boolean;
  airSpin?: boolean;
  drone?: boolean;
  airSupport?: boolean;
  consumables?: boolean;
  range?: boolean;
  /** Watch: riding a tank (the drone key flies off it); a seat to take, or the one taken to leave. */
  watchRiding?: boolean;
  watchSeat?: boolean;
  /** Destroyed: a killcam replay to skip, a spectator's camera to step. */
  killcam?: boolean;
  spectating?: boolean;
  /** A couch seat: only what its seat controls honour (src/game/couchSeats.ts). */
  couch?: boolean;
}

/** What a couch seat's controls honour beyond the drive, aim, fire, brake, look, rounds and scope (couchSeats.ts
 *  TAP_BITS), and its camera's zoom. */
const COUCH_GRANTS = new Set(['consumable1', 'consumable2', 'consumable3', 'smoke', 'selfRight', 'turbo', 'airSpin', 'specialAction',
  'reloadMagazine', 'zoomIn', 'zoomOut']);

/** The optional controls a player has in a mode, as padLayout.ts PAD_ACTS ids: the vehicle's own kit by the table the HUD
 *  and the Garage read (game/vehicleActions.ts, the fitted kit from the Garage's light summary), the mode's grants, and
 *  Watch's and death's keys. */
export function padGrants(mode: PadMode, source: PadStatusSource): string[] {
  const facts = source.facts ?? {};
  const out: string[] = [];
  if (mode === 'tank') {
    if (facts.consumables !== false) out.push('consumable1', 'consumable2', 'consumable3');
    const spec = source.player?.spec;
    const [smoke = 0, lights = 0, guns = 0] = (spec?.id && GARAGE_AUXILIARY_SUMMARY[spec.id]) || [];
    for (const id of availableVehicleActions(spec, { smoke, lights: lights === 1, guns }, { jump: facts.jump, turbo: facts.turbo, airSpin: facts.airSpin, drone: facts.drone })) {
      out.push(vehicleAction(id).binding);
    }
    if (source.lockable) out.push('autoAim');
    if (facts.airSupport) out.push('strikeView');
    out.push('hitboxOverlay');
    if (facts.range) out.push('rangeReset', 'rangeMoving');
    if (facts.watchSeat) out.push('watchSeat');
    if (source.sniper || facts.couch) out.push('zoomIn', 'zoomOut');
    return facts.couch ? out.filter((id) => COUCH_GRANTS.has(id)) : out;
  }
  if (mode === 'gunship') out.push('supplyAmmo', 'supplyHeal');
  if (mode === 'watch') {
    if (facts.watchRiding) out.push('watchDrone');
    if (facts.watchSeat) out.push('watchSeat');
  }
  if (mode === 'dead') {
    if (facts.killcam && !facts.couch) out.push('killcamSkip');
    if (facts.spectating && !facts.couch) out.push('spectatePrev', 'spectateNext');
  }
  return out;
}

/** The phone's readout of the local player: ammunition (code, glyph, rounds), the slot, reload, scope, pause. */
export function padStatusOf(source: PadStatusSource | null, locked = false): PadStatus | null {
  if (!source?.battle) return null;
  const player = source.player;
  const combat = player?.combat;
  const mode: PadMode = source.mode ?? (combat?.destroyed ? 'dead' : 'tank');
  const mask = padActsMask(padGrants(mode, source));
  const unavailable = source.unavailable?.length ? padActsMask(source.unavailable) & mask : 0;
  const grants = { m: mode, a: mask, ...(unavailable ? { u: unavailable } : {}) };
  // Watch's camera and a destroyed player's killcam drive no tank of their own: the mode and its keys are the readout
  if (!player || !combat) {
    if (mode !== 'watch' && mode !== 'dead') return null;
    return { battle: true, alive: mode === 'watch', paused: source.paused, sniper: false, slot: 0, shells: [], reloadS: 0,
      reloadTotalS: 0, ...(source.lockable ? { lock: locked } : {}), ...grants };
  }
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
    // whole km/h: the speedometer's grain, so a cruising tank sends no status
    ...(player.state && Number.isFinite(player.state.speed) ? { kmh: Math.round(player.state.speed! * 3.6) } : {}),
    ...(Number.isFinite(player.spec.topSpeedKmh) ? { topKmh: Math.round(player.spec.topSpeedKmh!) } : {}),
    ...(source.lockable ? { lock: locked } : {}),
    ...grants,
  };
}

export interface PadReceiverPorts {
  input: PadInputPort;
  /** The local player's battle facts for the phone's ammunition, reload and scope (null outside a battle). */
  source(): PadStatusSource | null;
  /** The phone's pause button: the same Settings toggle as Escape. */
  togglePause(): void;
  /** What no input action names (Watch's tank picks, the call-ins, the killcam's skip): the desktop's own calls. A seat
   *  without it (a couch seat) is never offered those keys. */
  command?: PadCommandPort;
  /** Couch mode's briefing as this seat's phone shows it (the status's `b`), while the big screen shows it. */
  brief?(): PadStatus['b'];
  /** This seat's Ready (or Skip) on that briefing. */
  ready?(skip: boolean): void;
  /** False for a couch seat: the phone's controls guide stays on the phone (the room's briefing is the big screen's), so
   *  no phone's guide is mirrored over the couch lobby. */
  mirrorTour?: boolean;
  /** The battle's event bus (its `on`), for the cues the phone feels (padCues.ts); without it the phone feels only its
   *  own presses. */
  listen?(type: string, listener: (payload: unknown) => void): () => void;
  /** The tank is the page's player, so the events that name no tank are its (false for a couch seat but the player's). */
  ownsPlayer?: boolean;
}

export interface PadReceiverView {
  readonly state: PadLinkState;
  /** The round trip to the phone over the link in use, ms (null until measured). */
  readonly rttMs: number | null;
}

export interface PadReceiver {
  readonly view: PadReceiverView;
  /** The controls guide's copy on the game screen (PAD_TOUR_MIRROR_STATES). */
  readonly tour: PadTourMirrorState;
  subscribe(listener: (view: PadReceiverView) => void): () => void;
  /** End the pairing for both sides. */
  disconnect(): void;
}

/** On the relay (each message a billed request) a cue waits this long after the last; a kill and a death never wait. */
const RELAY_CUE_GAP_MS = 500;

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
  /** The cues sent, by name. */
  cues: Record<string, number>;
}

/** The pairing this tab holds (code and resume token), so a reload resumes it (settings.ts reads the same key). */
const DESK_RESUME_KEY = 'cot.pad.desk';
const forgetDeskResume = (): void => { try { sessionStorage.removeItem(DESK_RESUME_KEY); } catch { /* storage blocked */ } };
export function storedDeskResume(): { code: string; token: string } | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(DESK_RESUME_KEY) || 'null') as { code?: unknown; token?: unknown } | null;
    return value && typeof value.code === 'string' && typeof value.token === 'string' ? { code: value.code, token: value.token } : null;
  } catch { return null; }
}

/** How a couch lobby (padLobby.ts) runs one receiver per seat: over its seat's share of the lobby socket, without this
 *  tab's single-pairing resume record, and with its diagnostics under the seat's number. */
export interface PadReceiverOptions {
  createSocket?: (url: string) => WebSocket;
  /** False: the pairing is not this tab's to resume (a lobby seat); nothing is stored or forgotten. */
  remember?: boolean;
  /** The seat number the diagnostics go under (`__COT_PAD_SEATS`), in place of `__COT_PAD`. */
  debugSeat?: number;
}

/** The game screen's copy of the phone's controls guide (round 8 Y5 s6-04): the phone owns the guide; the copy here is
 *  `open` from the phone's on:true until its on:false, Skip here, this link leaving live, or the time the phone's guide
 *  had left (its on:true's `ms`), whichever comes first; then `closed`. */
export const PAD_TOUR_MIRROR_STATES = ['closed', 'open'] as const;
export type PadTourMirrorState = (typeof PAD_TOUR_MIRROR_STATES)[number];

export function startPadReceiver(serviceUrl: string, ports: PadReceiverPorts, resume?: { code: string; token: string },
  options: PadReceiverOptions = {}): PadReceiver {
  const remember = options.remember !== false;
  const listeners = new Set<(view: PadReceiverView) => void>();
  let view: PadReceiverView = { state: { kind: 'connecting' }, rttMs: null };
  const mapper = createPadInputMapper(ports.input, ports.togglePause, ports.command);
  const axes: PadAxes = { flags: 0, seq: 0, t: 0, steer: 0, throttle: 0, aimX: 0, aimY: 0, held: 0 };
  let lastStatus = '';
  let lastStatusAt = -Infinity;
  let lastPingAt = -Infinity;
  let applyMs = 0;
  let pendingApplyAt = -1;
  let frames = 0;
  /** The phone's controls guide on the game screen (padTourScreen.ts): its state, its drawing's hide, its deadline. */
  let tourState: PadTourMirrorState = 'closed';
  let hideTour: (() => void) | null = null;
  let tourDeadline: ReturnType<typeof setTimeout> | undefined;
  /** The phone drives only in a battle, unpaused, with this tab shown: anywhere else its holds are let go and its
   *  frames and presses wait (its pause button still works, to close the menu it opened). */
  let driving = false;
  const debug: PadDebug | null = import.meta.env?.DEV || (typeof location !== 'undefined' && /[?&]padDebug\b/.test(location.search))
    ? { state: 'connecting', path: '', frames: 0, rttMs: null, applyMs: 0, lastPhoneT: 0, trace: [], cues: {} } : null;
  if (debug && options.debugSeat !== undefined) {
    const seats = ((globalThis as { __COT_PAD_SEATS?: Record<number, PadDebug> }).__COT_PAD_SEATS ??= {});
    seats[options.debugSeat] = debug;
  } else if (debug) (globalThis as { __COT_PAD?: PadDebug }).__COT_PAD = debug;

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
    ...(resume ? { resume } : {}),
    ...(options.createSocket ? { createSocket: options.createSocket } : {}),
    onToken(code, token) {
      if (remember) try { sessionStorage.setItem(DESK_RESUME_KEY, JSON.stringify({ code, token })); } catch { /* storage blocked */ }
    },
    onState(state) {
      // the guide's copy here never outlives this link's live state (the phone's on:false may never come)
      if (state.kind !== 'live') setTour(null);
      if (state.kind === 'away' || state.kind === 'ended') mapper.releaseAll();
      if (state.kind === 'ended') { if (remember) forgetDeskResume(); stop(); }
      publish({ state, ...(state.kind === 'live' ? {} : { rttMs: null }) });
    },
    onAxes(bytes) {
      if (!driving || !decodePadAxes(bytes, axes)) return;
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
      // the briefing's Ready comes between battles, so it is heard whether or not the seat drives
      else if (message.k === 'ready') ports.ready?.(message.skip === true);
      else if (message.k === 'tour') {
        if (ports.mirrorTour === false) return;
        // the phone's guide opens here too, battle or not; Skip here ends it on the phone
        const layout = message.on && message.l ? decodePadTour(message.l) : null;
        // a picture that does not decode is refused whole (the reader checked only its shape)
        if (message.l && !layout) return;
        setTour(layout ? { layout, ms: message.ms ?? PAD_TOUR_MS } : null);
      }
      else if (message.k === 'pause' || (driving && message.k !== 'status')) mapper.applyCtl(message);
    },
  });

  // The cues: each of the tank's events goes to the phone the moment the bus carries it, while the phone drives (a
  // paused battle or a hidden tab feels nothing); the sight's lock is also the status's, so the phone's key lights.
  let locked = false;
  let lastCueAt = -Infinity;
  const owner = { id: null as string | null, player: ports.ownsPlayer !== false };
  // (272) a fast gun buzzes the phone once a shake window, as it kicks the camera (game/shotCadence.ts): a burst at the
  // floor's 20 rounds a second sent 20 cues a second; a gun slower than the window buzzes every shot
  const shotBuzz = createShotCadence();
  const unlisten = ports.listen ? PAD_CUE_EVENTS.map((type) => ports.listen!(type, (payload) => {
    if (type === 'ui:autoAimState' && owner.player) locked = !!(payload && typeof payload === 'object' && Reflect.get(payload, 'on') === true);
    if (!driving || view.state.kind !== 'live') return;
    const relay = view.state.path === 'relay';
    owner.id = ports.source()?.player?.id ?? null;
    const cue = padCueOf(type, payload, owner);
    if (!cue) return;
    const now = performance.now();
    if (cue.c === 'shot' && payload && typeof payload === 'object') {
      const timeS = Number(Reflect.get(payload, 'timeS'));
      const weapon = Reflect.get(payload, 'weaponSound') as string | null | undefined;
      if (Number.isFinite(timeS) && shotBuzz.admit('shake', owner.id, weapon || cue.m || 0, timeS) === 0) return;
    }
    // (272) a burst's hits, given or taken, buzz once an impact window per other tank (on the page's clock: a hit names no
    // simulation time); a phone with no vibration motor scheduled every buzz's ticks on top of the last
    if ((cue.c === 'hit' || cue.c === 'deflect' || cue.c === 'hurt' || cue.c === 'glance') && payload && typeof payload === 'object') {
      const other = Reflect.get(payload, cue.c === 'hit' || cue.c === 'deflect' ? 'targetId' : 'attackerId') as string | null | undefined;
      if (shotBuzz.admit('impact', owner.id, other ?? '', now / 1000) === 0) return;
    }
    if (relay && now - lastCueAt < RELAY_CUE_GAP_MS && cue.c !== 'kill' && cue.c !== 'dead') return;
    if (!link.sendCtl({ k: 'cue', ...cue })) return;
    lastCueAt = now;
    if (debug) debug.cues[cue.c] = (debug.cues[cue.c] ?? 0) + 1;
  })) : [];

  const timer = setInterval(() => {
    const now = performance.now();
    const relay = view.state.kind === 'live' && view.state.path === 'relay';
    mapper.tick(now, relay ? 1000 : PAD_STALE_MS);
    // a hidden tab (minimised, another tab, a sleeping laptop's last moments) is a paused game to the phone
    const source = ports.source();
    const hidden = typeof document !== 'undefined' && document.hidden;
    const nowDriving = !!source?.battle && !source.paused && !hidden;
    if (driving && !nowDriving) mapper.releaseAll();
    if (!source?.battle) locked = false;
    driving = nowDriving;
    if (view.state.kind !== 'live') return;
    // the phone's readout: on change, at most 5 a second (one on the billed relay), and a heartbeat every 2 s
    const base = padStatusOf(source && hidden ? { ...source, paused: true } : source, locked) ?? IDLE_STATUS;
    // a couch seat's briefing rides its status between battles (never over one)
    const brief = base.battle ? undefined : ports.brief?.();
    const status = JSON.stringify(brief ? { ...base, b: brief } : base);
    const gap = now - lastStatusAt;
    if ((status !== lastStatus && gap >= (relay ? 1000 : 200)) || gap >= 2000) {
      if (link.sendCtl({ k: 'status', s: JSON.parse(status) as PadStatus })) { lastStatus = status; lastStatusAt = now; }
    }
    if (now - lastPingAt >= (relay ? 5000 : 1000)) { lastPingAt = now; link.sendCtl({ k: 'ping', t: now }); }
  }, 100);

  /** The guide's copy's one writer: open with the phone's picture until `ms` from now, or closed (drawing and deadline
   *  gone). Another phone's showing may replace the drawing meanwhile (a couch lobby); this copy's hide is then a no-op. */
  function setTour(next: { layout: PadTourLayout; ms: number } | null): void {
    clearTimeout(tourDeadline);
    tourDeadline = undefined;
    hideTour?.();
    hideTour = null;
    tourState = 'closed';
    if (!next) return;
    tourState = 'open';
    hideTour = showPadTour(next.layout, () => {
      // Skip here: the screen already closed its drawing; the phone hears it
      hideTour = null;
      setTour(null);
      link.sendCtl({ k: 'tour', on: false });
    }, next.ms);
    tourDeadline = setTimeout(() => setTour(null), next.ms);
  }

  function stop(): void {
    clearInterval(timer);
    for (const off of unlisten.splice(0)) off();
    setTour(null);
    mapper.releaseAll();
  }

  return {
    get view() { return view; },
    get tour() { return tourState; },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    disconnect() {
      if (remember) forgetDeskResume();
      stop();
      link.end();
    },
  };
}
