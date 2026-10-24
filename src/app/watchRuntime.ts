/**
 * The Watch mode's composition (watch-mode-243): the drone/ride camera, the controller and the bar, built on demand the
 * first time a watched battle loads (main.ts keeps only the lazy owner), and the few live ports the frame, the HUD and
 * the presentation read from it.
 */
import { Vector3, type PerspectiveCamera } from 'three';
import { createWatchCamera, WATCH_DRONE, type WatchCameraDeps } from '../engine/watchCamera.ts';
import {
  createWatchController,
  type WatchController,
  type WatchControllerOptions,
  type WatchEntity,
} from '../game/watchController.ts';
import { watchRevealsAll } from '../game/stateCore.ts';
import { createWatchHud, type WatchHudTank } from '../ui/watchHud.ts';
type WatchRuntimeEntity = WatchEntity & WatchHudTank;

type ControllerPorts<TEntity extends WatchRuntimeEntity> = Omit<WatchControllerOptions<TEntity>,
  'watchCamera' | 'openingFrame'>;

export interface WatchRuntimePorts<TEntity extends WatchRuntimeEntity> extends ControllerPorts<TEntity> {
  camera: PerspectiveCamera;
  heightField: WatchCameraDeps['heightField'];
  raycast: WatchCameraDeps['raycast'];
  /** Stream a hop's or a far lock's destination ahead of the camera (perf-245's warm; absent until it is wired). */
  prepareDestination?: WatchCameraDeps['prepareDestination'];
  hud: { root(): HTMLElement | null; setWatchDrone(pose: { x: number; z: number } | null): void; setWatchSide(team: string | null): void };
}

/** What the HUD frame reads (battleHudFrameRuntime's watch view). */
interface WatchHudPort<TEntity> {
  focus(): TEntity | null;
  flying(): boolean;
  sight(): boolean;
  zoom(): number;
  revealAll(): boolean;
}

export interface WatchRuntime<TEntity> {
  readonly controller: WatchController;
  readonly hudView: WatchHudPort<TEntity>;
  prepareReveal(): boolean;
  open(): void;
  /** Per rendered frame; true when the watch camera solved the camera. */
  frame(dt: number): boolean;
  stop(): void;
}

const _alpha = new Vector3();
const _bravo = new Vector3();

export function createWatchRuntime<TEntity extends WatchRuntimeEntity>(ports: WatchRuntimePorts<TEntity>): WatchRuntime<TEntity> {
  const { game, camera, heightField } = ports;
  const watchCamera = createWatchCamera(camera, { heightField, raycast: ports.raycast,
    prepareDestination: ports.prepareDestination ? (position, lookAt, durationS) => ports.prepareDestination?.(position, lookAt, durationS) : undefined });

  /** The drone opens behind the human seat's side over the line between the two deployments, looking at the field. */
  const openingFrame: WatchControllerOptions<TEntity>['openingFrame'] = (out) => {
    const rules = game.ruleset?.watch;
    if (!rules) return false;
    _alpha.set(0, 0, 0);
    _bravo.set(0, 0, 0);
    let na = 0, nb = 0;
    for (const entity of game.tanks) {
      if (!entity.state || entity.modeActive === false) continue;
      if (entity.team === 'enemy') { _bravo.add(entity.state.pos); nb++; } else { _alpha.add(entity.state.pos); na++; }
    }
    if (!na) return false;
    _alpha.multiplyScalar(1 / na);
    if (nb) _bravo.multiplyScalar(1 / nb); else _bravo.set(-_alpha.x, 0, -_alpha.z);
    const dx = _bravo.x - _alpha.x, dz = _bravo.z - _alpha.z;
    const len = Math.hypot(dx, dz) || 1;
    const back = Math.min(rules.openBackM, len * 0.35);
    const x = _alpha.x - (dx / len) * back, z = _alpha.z - (dz / len) * back;
    out.position.set(x, heightField.getHeightAt(x, z) + rules.openAltitudeM, z);
    out.yaw = Math.atan2(dx, dz);
    out.pitch = (rules.openPitchDeg * Math.PI) / 180;
    return true;
  };

  const controller = createWatchController<TEntity>({ ...ports, watchCamera, openingFrame });

  const hud = createWatchHud(() => ports.hud.root(), {
    cycle: (direction) => controller.cycle(direction),
    drone: () => controller.drone(),
    toggleLock: () => controller.toggleLock(),
    toggleSeat: () => controller.toggleSeat(),
    setClimb: (direction) => controller.setClimb(direction),
  });

  const byId = (id: string | null): TEntity | null => {
    if (!id) return null;
    for (const entity of game.tanks) if (entity.id === id) return entity;
    return null;
  };
  const hudState = { view: 'off' as WatchController['view'], tank: null as TEntity | null, canTake: false, speedIndex: 0,
    speedSteps: WATCH_DRONE.speeds.length, locked: false };
  const dronePose = { x: 0, z: 0 };

  const present = (): void => {
    hudState.view = controller.view;
    // flying, the bar names the tank the drone's orbit is locked on (the battle HUD's focus stays the drone's)
    const lockedId = controller.view === 'drone' ? controller.lockedId : null;
    hudState.locked = !!lockedId;
    hudState.tank = byId(lockedId ?? controller.focusId);
    hudState.canTake = controller.canTake;
    hudState.speedIndex = controller.speedIndex;
    hud.update(hudState);
    if (controller.view === 'drone') {
      dronePose.x = camera.position.x;
      dronePose.z = camera.position.z;
      ports.hud.setWatchDrone(dronePose);
    } else ports.hud.setWatchDrone(null);
    // flying or riding, the HUD reads the battle from the watched seat's side (its score, rosters, kill feed and inks),
    // the ridden tank only highlighted; a taken seat is the player's own HUD
    const spectating = controller.view === 'drone' || controller.view === 'ride';
    ports.hud.setWatchSide(spectating ? game.watch?.team ?? 'player' : null);
  };

  const hudView: WatchHudPort<TEntity> = {
    focus() {
      if (!controller.active && !game.watch) return null;
      if (!game.ruleset?.watch) return null;
      // flying: the human seat anchors the frame (the HUD draws no tank as its own); riding: the ridden hull
      return byId(controller.focusId) ?? byId(game.watch?.seatId ?? null);
    },
    flying: () => controller.view === 'drone' || (!controller.active && watchCamera.mode === 'drone'),
    sight: () => controller.sight,
    zoom: () => controller.zoom,
    revealAll: () => watchRevealsAll(game),
  };

  return {
    controller,
    hudView,
    prepareReveal: () => controller.prepareReveal(),
    open() {
      controller.open();
      present();
    },
    frame(dt: number): boolean {
      if (!game.ruleset?.watch) return false;
      const solved = controller.frame(dt);
      if (controller.active) present();
      return solved;
    },
    stop() {
      controller.stop();
      hud.update({ view: 'off', tank: null, canTake: false, speedIndex: 0, speedSteps: WATCH_DRONE.speeds.length, locked: false });
      ports.hud.setWatchDrone(null);
      ports.hud.setWatchSide(null);
    },
  };
}
