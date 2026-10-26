/**
 * watchController.ts — the Watch mode's browser owner (watch-mode-243; sim/matchRuleset.ts WATCH_RULES).
 *
 * One battle-scoped controller turns the watcher's input into the three views:
 *  - DRONE: a spectator drone (engine/watchCamera.ts) — keys or the left stick move, the mouse / right stick / drag
 *    looks, Space and C (the triggers, the touch rail) climb and descend, Shift (L3) boosts, the wheel steps the speed.
 *    The game's own lock (auto-aim: T by default; pad X; the bar's lock) locks its orbit on the tank in the middle of
 *    the view, or the nearest one ahead, and lets go again; a locked tank's wreck is held a beat, then the drone flies on. The holds are the input layer's own
 *    actions (handbrake, reloadMagazine, sniperToggle), so the Accessibility hold-or-toggle choice applies to them;
 *  - RIDE: a ride-along on any living tank — a click or tap on it, F for the one in the middle of the view, Tab (the
 *    bumpers) cycles, Q/E step back and forth; V (pad B) flies off again. A ridden tank's wreck is held a beat, then the
 *    camera rides on with its killer (or flies); pad Y rides the tank in view;
 *  - DRIVE: Take control (Enter, pad R3, the touch button) puts the watcher in that bot's seat through the player's own
 *    path (game/watchSeat.ts): the camera rig, the HUD and the controls are the player's from that frame, and Leave
 *    (the same key) hands the hull back to its bot and lifts the drone off the chase pose. A taken hull destroyed plays
 *    the player's death flow, then the drone.
 *
 * The camera is the watch camera's while watching and the rig's while driving; the frame runtime asks frame() each
 * frame and solves the rig only when it answers false. The sim never reads this owner: seats change through
 * watchSeat.ts between fixed steps, so a replay of the battle is the replay of its inputs.
 */
import { Vector3, type PerspectiveCamera } from 'three';
import type { RuntimeValue } from '../runtimeTypes.ts';
import type { CameraEntity } from '../engine/cameraRig.ts';
import type { WatchCamera, WatchCameraInput } from '../engine/watchCamera.ts';
import type { EventBus } from './stateCore.ts';
import type { PadSnapshot } from './input.ts';
import type { CameraFrameInput } from './playerFrameInput.ts';
import type { WatchRules } from '../sim/matchRuleset.ts';
import { leaveWatchSeat, openWatchSeats, takeWatchSeat, watchSeatRefusal, type WatchSeatEntity, type WatchSession } from './watchSeat.ts';

export type WatchView = 'off' | 'drone' | 'ride' | 'drive';

/** A hull the controller can ride and seat: the camera's fields (a parked pool entry has no state) and the seat's. */
export type WatchEntity = WatchSeatEntity & Omit<CameraEntity, 'state' | 'combat' | 'input'> & {
  state: CameraEntity['state'] | null;
  input: WatchSeatEntity['input'] & { aimPoint?: Vector3 | null };
};
type LiveWatchEntity<TEntity extends WatchEntity> = TEntity & { state: CameraEntity['state']; combat: { destroyed?: boolean } };

interface WatchGame<TEntity extends WatchEntity> {
  phase: string;
  player: TEntity | null;
  tanks: TEntity[];
  result: string | null;
  ruleset: { readonly watch?: WatchRules | null; readonly respawnS: number | null };
  watch?: WatchSession | null;
  world?: unknown;
}

interface WatchRigPort {
  readonly mode: string;
  release(): void;
  snapArcade(step: number, orbitYaw: number, orbitPitch: number): void;
  snapSniper(zoom: number, aimYaw: number, aimPitch: number): void;
  exitSniper(restorePreviousOrbit?: boolean): void;
  stopSpectate(): void;
}

type WatchHoldAction = 'handbrake' | 'reloadMagazine' | 'sniperToggle';

interface WatchInputPort {
  getState(): { forward: boolean; back: boolean; left: boolean; right: boolean };
  /** A held action (its key, pad button or touch press; latched when the Accessibility setting makes it a toggle). */
  isDown(actionId: WatchHoldAction): boolean;
  pressVirtual(actionId: WatchHoldAction): void;
  releaseVirtual(actionId: WatchHoldAction): void;
  getVirtualMove(out: { x: number; y: number }): boolean;
  getPadSnapshot(out: PadSnapshot): PadSnapshot;
  isLocked(): boolean;
}

export interface WatchControllerOptions<TEntity extends WatchEntity> {
  game: WatchGame<TEntity>;
  camera: PerspectiveCamera;
  watchCamera: WatchCamera;
  rig: WatchRigPort;
  input: WatchInputPort;
  /** The frame's sampled camera input (playerFrameInput): mouse / right-stick / drag deltas and wheel notches. */
  cameraInput: Pick<CameraFrameInput, 'mouseDX' | 'mouseDY' | 'wheel' | 'shiftPressed'>;
  bus: EventBus;
  killcam: { isActive(): boolean; spectate: { readonly active: boolean; stop(emitEnd?: boolean): void } };
  /** The player's death flow re-arms for a freshly taken seat (battleResultPresentationRuntime). */
  resultPresentation: { newSeat(): void };
  /** The player-facing owners follow the seat: the HUD's shells, the damage panel, the shot log (null: watching). */
  onSeat(entity: TEntity | null): void;
  /** Settings or a modal own the input. */
  isInputHeld(): boolean;
  /** The surface a click or tap picks a tank on (the battle canvas; touch also passes the drag-look pad). */
  pickSurface(target: EventTarget | null): boolean;
  /** The drone opens over the midpoint between the deployments (the controller places it before the reveal). */
  openingFrame(out: { position: Vector3; yaw: number; pitch: number }): boolean;
}

export interface WatchController {
  readonly active: boolean;
  readonly view: WatchView;
  /** The ridden or driven hull's id (the HUD's focus), null on the drone. */
  readonly focusId: string | null;
  readonly sight: boolean;
  readonly zoom: number;
  readonly speedIndex: number;
  readonly canTake: boolean;
  /** The tank the drone's orbit is locked on (the bar names it), or null. */
  readonly lockedId: string | null;
  /** Lock the drone on the tank in view, or let go. */
  toggleLock(): void;
  /** Touch rail / HUD buttons. */
  setClimb(direction: -1 | 0 | 1): void;
  cycle(direction: -1 | 1): void;
  drone(): void;
  rideAt(ndcX: number, ndcY: number): boolean;
  rideId(id: string): boolean;
  toggleSeat(): void;
  /** Covered battle entry: place the drone on its opening frame (true when this is a watched battle). */
  prepareReveal(): boolean;
  /** The battle opens: the human seat goes to its bot, the watcher to the drone. */
  open(): void;
  /** Per rendered frame while live; true when the watch camera solved the camera (the rig stays out). */
  frame(dt: number): boolean;
  stop(): void;
}

const PAD = Object.freeze({ b: 1, x: 2, y: 3, lb: 4, rb: 5, l3: 10, r3: 11, deadzone: 0.12 });
/** The lock's reach when no tank sits under the crosshair: the nearest one this far ahead of the lens. */
const LOCK_REACH_M = 450;
/** The drone's holds: the actions Space, C and Shift (and the touch rail) press. */
const CLIMB: WatchHoldAction = 'handbrake', DESCEND: WatchHoldAction = 'reloadMagazine', BOOST: WatchHoldAction = 'sniperToggle';
const TAP = Object.freeze({ maxMs: 320, maxPx: 14 });
/** A tank picked by a click or tap: within this share of the screen height of its projected centre, or its own size. */
const PICK_RADIUS_NDC = 0.09;

const _ndc = new Vector3();
const _toTank = new Vector3();
const _forward = new Vector3();

export function createWatchController<TEntity extends WatchEntity>(options: WatchControllerOptions<TEntity>): WatchController {
  const { game, camera, watchCamera, rig, input, cameraInput, bus, killcam, resultPresentation } = options;
  let live = false;
  let driving: TEntity | null = null;
  let railHeld: WatchHoldAction | null = null;
  let wreckHoldS = 0;
  let lockWreckS = 0;
  let drivenDeathS = 0;
  let padButtons = 0;
  const pad: PadSnapshot = { connected: false, leftX: 0, leftY: 0, rightX: 0, rightY: 0, leftTrigger: 0, rightTrigger: 0, buttons: 0 };
  const virtual = { x: 0, y: 0 };
  const camInput: WatchCameraInput = { moveForward: 0, moveRight: 0, moveUp: 0, lookDX: 0, lookDY: 0, boost: false, wheel: 0 };
  const opening = { position: new Vector3(), yaw: 0, pitch: 0 };
  /** Who destroyed each hull (the killer handoff): the event's killer, else the last hull that hit it (a fire, a crash). */
  const killerOf = new Map<string, string>();
  const lastAttacker = new Map<string, string>();
  const unsubscribe: Array<() => void> = [];
  // the last announced view (compared field by field: nothing is built per frame)
  const announced = { view: '' as WatchView | '', id: null as string | null, sight: false, canTake: false };

  const rules = (): WatchRules | null => game.ruleset?.watch ?? null;
  // a verdict ends watching: the ending beats own the camera and no seat can be taken
  const watching = (): boolean => live && !driving && game.phase === 'battle' && game.result === null;
  const liveHull = (entity: TEntity | null | undefined): entity is LiveWatchEntity<TEntity> =>
    !!entity && !!entity.state && !!entity.combat && !entity.combat.destroyed && entity.modeActive !== false
    && entity.aerial?.kind !== 'gunship';
  const byId = (id: string | null | undefined): TEntity | null => {
    if (!id) return null;
    for (const entity of game.tanks) if (entity.id === id) return entity;
    return null;
  };
  const rideTarget = (): TEntity | null => (watchCamera.mode === 'ride' ? watchCamera.target as TEntity | null : null);
  /** The ridden hull the HUD and bar show: the camera's subject once its handover is half done (the view leads). */
  let shown: TEntity | null = null;
  const updateShown = (): void => {
    const target = rideTarget();
    if (!target) { shown = null; return; }
    if (target !== shown && watchCamera.blendProgress >= 0.5) shown = target;
  };

  function emitChange(): void {
    updateShown();
    const target = driving ?? shown;
    const view = api.view, id = target?.id ?? null, sight = watchCamera.sight, canTake = api.canTake;
    if (view === announced.view && id === announced.id && sight === announced.sight && canTake === announced.canTake) return;
    announced.view = view;
    announced.id = id;
    announced.sight = sight;
    announced.canTake = canTake;
    bus.emit('watch:change', { view, id, sight, canTake } as RuntimeValue);
  }

  // ------------------------------------------------------------------ picking

  /** The living tank nearest a screen point (NDC), in front of the lens; null when none is near enough. */
  function tankAt(ndcX: number, ndcY: number): TEntity | null {
    camera.updateMatrixWorld();
    camera.getWorldDirection(_forward);
    const aspect = camera.aspect || 1;
    let best: TEntity | null = null, bestScore = Infinity;
    for (const entity of game.tanks) {
      if (!liveHull(entity)) continue;
      const height = entity.spec?.dims?.heightM ?? 2.4;
      _toTank.copy(entity.state.pos);
      _toTank.y += height * 0.55;
      _ndc.copy(_toTank).sub(camera.position);
      const depth = _ndc.dot(_forward);
      if (depth < 1) continue;
      _ndc.copy(_toTank).project(camera);
      const dx = (_ndc.x - ndcX) * aspect, dy = _ndc.y - ndcY;
      const screen = Math.hypot(dx, dy);
      // a near hull covers more screen: its own projected size, at least the pick radius
      const reach = Math.max(PICK_RADIUS_NDC, (height * 2.2) / (depth * Math.tan((camera.fov * Math.PI) / 360)));
      if (screen > reach) continue;
      const score = screen / reach + depth * 1e-4;
      if (score < bestScore) { bestScore = score; best = entity; }
    }
    return best;
  }

  /** Cycle order: the roster's own order over the living hulls (stable while hulls fall and revive). */
  function cycleFrom(current: TEntity | null, direction: -1 | 1): TEntity | null {
    const tanks = game.tanks;
    const n = tanks.length;
    if (!n) return null;
    let start = current ? tanks.indexOf(current) : -1;
    if (start < 0) {
      // from the drone: the hull in the middle of the view, else the nearest one
      const centre = tankAt(0, 0);
      if (centre) return centre;
      let nearest: TEntity | null = null, nearestD = Infinity;
      for (const entity of tanks) {
        if (!liveHull(entity)) continue;
        const d = entity.state.pos.distanceToSquared(camera.position);
        if (d < nearestD) { nearestD = d; nearest = entity; }
      }
      return nearest;
    }
    for (let step = 1; step <= n; step++) {
      start = (start + direction + n) % n;
      if (liveHull(tanks[start])) return tanks[start];
    }
    return null;
  }

  function ride(entity: TEntity | null): boolean {
    if (!watching() || !liveHull(entity)) return false;
    wreckHoldS = 0;
    watchCamera.ride(entity);
    emitChange();
    return true;
  }

  /** The tank a lock takes: the one under the crosshair, else the nearest living one ahead of the lens. */
  function lockCandidate(): TEntity | null {
    const centre = tankAt(0, 0);
    if (centre) return centre;
    camera.getWorldDirection(_forward);
    let best: TEntity | null = null, bestD = LOCK_REACH_M * LOCK_REACH_M;
    for (const entity of game.tanks) {
      if (!liveHull(entity)) continue;
      _toTank.copy(entity.state.pos).sub(camera.position);
      const d = _toTank.lengthSq();
      if (d < bestD && _toTank.dot(_forward) > 0) { bestD = d; best = entity; }
    }
    return best;
  }

  function toggleLock(): void {
    if (!watching() || watchCamera.mode !== 'drone') return;
    lockWreckS = 0;
    if (watchCamera.lockTarget) watchCamera.lock(null);
    else {
      const target = lockCandidate();
      if (liveHull(target)) watchCamera.lock(target);
    }
  }

  /** A locked tank's wreck is held a beat, then the drone flies on; a tank that leaves the field lets go at once. */
  function lockHandoff(dt: number): void {
    const locked = watchCamera.lockTarget as TEntity | null;
    if (!locked) { lockWreckS = 0; return; }
    if (locked.modeActive === false || !locked.state) { watchCamera.lock(null); return; }
    if (!locked.combat?.destroyed) { lockWreckS = 0; return; }
    lockWreckS += dt;
    if (lockWreckS >= (rules()?.deathHoldS ?? 1.6)) { lockWreckS = 0; watchCamera.lock(null); }
  }

  function toDrone(liftOff: boolean): void {
    wreckHoldS = 0;
    watchCamera.startDrone(liftOff);
    emitChange();
  }

  // ------------------------------------------------------------------ seats

  function take(): void {
    const target = rideTarget();
    // a seat is taken only once its ride-along is on screen (past the handover's midpoint)
    if (!watching() || !target || target !== shown || watchSeatRefusal(game, target) !== null) return;
    const sight = watchCamera.sight;
    const zoom = watchCamera.zoom;
    const step = watchCamera.orbitStep;
    // the rig opens on the pose the ride-along held: the same orbit behind the same lay
    camera.getWorldDirection(_forward);
    const yaw = Math.atan2(_forward.x, _forward.z);
    const pitch = Math.asin(Math.max(-1, Math.min(1, _forward.y)));
    if (!takeWatchSeat(game, target)) return;
    driving = target;
    drivenDeathS = 0;
    watchCamera.stop();
    resultPresentation.newSeat();
    options.onSeat(target);
    rig.release();
    if (sight) rig.snapSniper(zoom, yaw, pitch);
    else rig.snapArcade(step, yaw, pitch);
    emitChange();
  }

  function leave(): void {
    if (!driving) return;
    if (rig.mode === 'SNIPER') rig.exitSniper(true);
    if (killcam.spectate.active) killcam.spectate.stop(false);
    rig.stopSpectate();
    rig.release();
    leaveWatchSeat(game);
    driving = null;
    options.onSeat(null);
    // the drone lifts off the chase pose the rig held: no cut
    toDrone(true);
  }

  // ------------------------------------------------------------------ input

  const typing = (target: EventTarget | null): boolean => {
    const el = target as HTMLElement | null;
    return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName ?? ''));
  };

  function onKeyDown(event: KeyboardEvent): void {
    if (!live || game.phase !== 'battle' || game.result !== null || typing(event.target) || options.isInputHeld()
      || event.repeat) return;
    const code = event.code;
    if (driving) {
      // the tank's own bindings own every key but the seat's
      if (code === 'Enter' || code === 'NumpadEnter') { event.preventDefault(); leave(); }
      return;
    }
    const riding = watchCamera.mode === 'ride';
    switch (code) {
      // (E and Q step through the field from the drone as from a ride: Tab did it too, a second binding that held the
      // rosters' key, INTERACTION-REDESIGN C)
      case 'KeyE': ride(cycleFrom(rideTarget(), 1)); break;
      case 'KeyQ': ride(cycleFrom(rideTarget(), -1)); break;
      case 'KeyF': ride(tankAt(0, 0)); break;
      case 'KeyV': if (riding) toDrone(true); break;
      case 'Enter': case 'NumpadEnter': event.preventDefault(); take(); break;
      case 'ShiftLeft': case 'ShiftRight': if (riding) watchCamera.setSight(!watchCamera.sight); emitChange(); break;
      default: break;
    }
  }
  const releaseRail = (): void => { if (railHeld) input.releaseVirtual(railHeld); railHeld = null; };

  // a click on the field rides the tank under the cursor (the sight's centre under pointer lock); a short tap does
  let tapId = -1, tapX = 0, tapY = 0, tapT = 0;
  const toNdc = (clientX: number, clientY: number): [number, number] => [
    (clientX / Math.max(1, window.innerWidth)) * 2 - 1, -(clientY / Math.max(1, window.innerHeight)) * 2 + 1];
  const onPointerDown = (event: PointerEvent): void => {
    if (!watching() || options.isInputHeld() || !options.pickSurface(event.target)) return;
    if (event.pointerType === 'touch') {
      tapId = event.pointerId; tapX = event.clientX; tapY = event.clientY; tapT = performance.now();
      return;
    }
    if (event.button !== 0) return;
    if (input.isLocked()) ride(tankAt(0, 0));
    else { const [x, y] = toNdc(event.clientX, event.clientY); ride(tankAt(x, y)); }
  };
  const onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== tapId) return;
    tapId = -1;
    if (!watching() || performance.now() - tapT > TAP.maxMs || Math.hypot(event.clientX - tapX, event.clientY - tapY) > TAP.maxPx) return;
    const [x, y] = toNdc(event.clientX, event.clientY);
    ride(tankAt(x, y));
  };

  /** A pad button that went down since the last frame. */
  function pressed(index: number): boolean {
    return (pad.buttons & (1 << index)) !== 0 && (padButtons & (1 << index)) === 0;
  }

  function padEdges(): void {
    const buttons = pad.buttons;
    if (driving) { if (pressed(PAD.r3)) leave(); padButtons = buttons; return; }
    const riding = watchCamera.mode === 'ride';
    if (pressed(PAD.lb)) ride(cycleFrom(rideTarget(), -1));
    if (pressed(PAD.rb)) ride(cycleFrom(rideTarget(), 1));
    if (pressed(PAD.y) && !riding) ride(tankAt(0, 0));
    if (pressed(PAD.x) && !riding) toggleLock();
    if (pressed(PAD.b) && riding) toDrone(true);
    if (pressed(PAD.r3)) take();
    padButtons = buttons;
  }

  function sampleCamera(dt: number): void {
    const state = input.getState();
    input.getPadSnapshot(pad);
    const touching = input.getVirtualMove(virtual);
    const stickX = Math.abs(pad.leftX) > PAD.deadzone ? pad.leftX : 0;
    const stickY = Math.abs(pad.leftY) > PAD.deadzone ? pad.leftY : 0;
    // a stick past the input layer's digital threshold also reads as held keys: the analog value wins over them
    const padMoving = pad.connected && (stickX !== 0 || stickY !== 0);
    camInput.moveForward = padMoving ? -stickY : touching ? virtual.y : (state.forward ? 1 : 0) - (state.back ? 1 : 0);
    camInput.moveRight = padMoving ? stickX : touching ? virtual.x : (state.right ? 1 : 0) - (state.left ? 1 : 0);
    const triggers = pad.connected ? pad.rightTrigger - pad.leftTrigger : 0;
    camInput.moveUp = Math.max(-1, Math.min(1, (input.isDown(CLIMB) ? 1 : 0) - (input.isDown(DESCEND) ? 1 : 0) + triggers));
    // consumeMouseDelta gives a world-yaw delta (mouse right negative) that already carries the right stick and drag
    camInput.lookDX = -cameraInput.mouseDX;
    camInput.lookDY = cameraInput.mouseDY;
    camInput.boost = input.isDown(BOOST) || (pad.buttons & (1 << PAD.l3)) !== 0;
    camInput.wheel = cameraInput.wheel;
    void dt;
  }

  // ------------------------------------------------------------------ handoffs

  function onDestroyed(payload: RuntimeValue): void {
    const event = payload as { id?: string; killerId?: string | null } | null;
    if (!event?.id) return;
    const killer = event.killerId && event.killerId !== event.id ? event.killerId : lastAttacker.get(event.id) ?? null;
    if (killer) killerOf.set(event.id, killer); else killerOf.delete(event.id);
  }
  function onHit(payload: RuntimeValue): void {
    const event = payload as { attackerId?: string; targetId?: string } | null;
    if (event?.attackerId && event.targetId && event.attackerId !== event.targetId) lastAttacker.set(event.targetId, event.attackerId);
  }

  /** A ridden wreck is held a beat, then the camera rides on with its killer, or flies. */
  function rideHandoff(dt: number): void {
    const target = rideTarget();
    if (!target || !target.combat?.destroyed) { wreckHoldS = 0; return; }
    wreckHoldS += dt;
    if (wreckHoldS < (rules()?.deathHoldS ?? 1.6)) return;
    const killer = byId(killerOf.get(target.id));
    if (!(liveHull(killer) && ride(killer))) toDrone(true);
  }

  /** A driven hull destroyed: the player's death flow plays (the death cam, a replay), then the drone. */
  function drivenHandoff(dt: number): void {
    // after the verdict the player's ending flow keeps the seat to the report
    if (!driving || game.result !== null) return;
    if (!driving.combat?.destroyed) { drivenDeathS = 0; return; }
    drivenDeathS += dt;
    if (drivenDeathS < (rules()?.takenDeathS ?? 3.5) || killcam.isActive()) return;
    leave();
  }

  // ------------------------------------------------------------------ API

  const api: WatchController = {
    get active() { return live; },
    get view(): WatchView {
      if (!live) return 'off';
      if (driving) return 'drive';
      return shown ? 'ride' : 'drone';
    },
    get focusId() { return driving?.id ?? shown?.id ?? null; },
    get sight() { return watchCamera.sight; },
    get zoom() { return watchCamera.zoom; },
    get speedIndex() { return watchCamera.speedIndex; },
    get lockedId() { return live && !driving ? (watchCamera.lockTarget as TEntity | null)?.id ?? null : null; },
    toggleLock,
    get canTake() {
      const target = rideTarget();
      return watching() && !!target && target === shown && watchSeatRefusal(game, target) === null;
    },
    setClimb(direction) {
      // the rail presses the keyboard's own actions: one hold, one Accessibility choice
      const action = direction > 0 ? CLIMB : direction < 0 ? DESCEND : null;
      if (action === railHeld) return;
      releaseRail();
      if (action && watching()) { input.pressVirtual(action); railHeld = action; }
    },
    cycle(direction) { if (watching()) ride(cycleFrom(rideTarget(), direction)); },
    drone() { if (watching() && watchCamera.mode === 'ride') toDrone(true); },
    rideAt(ndcX, ndcY) { return ride(tankAt(ndcX, ndcY)); },
    rideId(id) { return ride(byId(id)); },
    toggleSeat() { if (driving) leave(); else take(); },

    prepareReveal(): boolean {
      if (!rules() || !game.watch) return false;
      if (!options.openingFrame(opening)) return false;
      watchCamera.placeDrone(opening.position, opening.yaw, opening.pitch);
      return true;
    },

    open(): void {
      if (live || !rules() || !game.watch) return;
      openWatchSeats(game);
      live = true;
      driving = null;
      killerOf.clear();
      lastAttacker.clear();
      if (watchCamera.mode === 'off') {
        if (!api.prepareReveal()) watchCamera.startDrone(false);
      }
      options.onSeat(null);
      unsubscribe.push(bus.on('tank:destroyed', onDestroyed), bus.on('shell:hit', onHit), bus.on('battle:ended', releaseRail),
        // the auto-aim key (whatever it is bound to) is the drone's lock: with nobody driving, auto-aim has no gun to lay
        bus.on('ui:autoAimToggle', () => { if (watchCamera.mode === 'drone') toggleLock(); }));
      window.addEventListener('keydown', onKeyDown, true);
      window.addEventListener('blur', releaseRail);
      window.addEventListener('pointerdown', onPointerDown, true);
      window.addEventListener('pointerup', onPointerUp, true);
      announced.view = '';
      emitChange();
    },

    frame(dt: number): boolean {
      if (game.phase !== 'battle') return false;
      if (!live) {
        // the reveal before the battle opens: the drone holds its opening frame (the rig would chase the human seat)
        if (!rules() || watchCamera.mode === 'off') return false;
        camInput.moveForward = camInput.moveRight = camInput.moveUp = camInput.lookDX = camInput.lookDY = camInput.wheel = 0;
        camInput.boost = false;
        return watchCamera.update(dt, camInput);
      }
      input.getPadSnapshot(pad);
      if (!options.isInputHeld()) padEdges();
      if (driving) {
        drivenHandoff(dt);
        emitChange();
        return !!(!driving && watchCamera.mode !== 'off' && watchCamera.update(dt, camInput));
      }
      // a verdict hands the camera to the ending beats (the final-kill replay, the report)
      if (game.result !== null || killcam.isActive()) return false;
      rideHandoff(dt);
      lockHandoff(dt);
      sampleCamera(dt);
      if (options.isInputHeld()) {
        camInput.moveForward = camInput.moveRight = camInput.moveUp = camInput.lookDX = camInput.lookDY = camInput.wheel = 0;
        camInput.boost = false;
      }
      const solved = watchCamera.update(dt, camInput);
      emitChange();
      return solved;
    },

    stop(): void {
      if (driving) leaveWatchSeat(game);
      driving = null;
      shown = null;
      // the ledger ends with the battle: nothing after it (a room, the next sortie) reads a stale watch
      game.watch = null;
      live = false;
      watchCamera.stop();
      for (const off of unsubscribe.splice(0)) off();
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('blur', releaseRail);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pointerup', onPointerUp, true);
      releaseRail();
      killerOf.clear();
      lastAttacker.clear();
      announced.view = '';
      bus.emit('watch:change', { view: 'off', id: null, sight: false, canTake: false } as RuntimeValue);
    },
  };
  return api;
}
