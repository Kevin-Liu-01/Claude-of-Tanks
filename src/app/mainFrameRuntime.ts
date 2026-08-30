import { FogExp2, Vector3, type PerspectiveCamera, type Scene } from 'three';

import type { ListenerPoseRuntime } from '../audio/listenerPoseRuntime.ts';
import type { PerfDiagnosticsFacade } from '../dev/perfDiagnosticsAccess.ts';
import type { CameraRig } from '../engine/cameraRig.ts';
import type { GarageFramePacer, GarageFrameRequest } from '../engine/garageFramePacer.ts';
import type { PostRuntime } from '../engine/post.ts';
import type { BattleEntryLifecycle } from '../game/battleEntryLifecycle.ts';
import type { BattleFrameRuntime } from '../game/battleFrameRuntime.ts';
import type { BattleHudFrameRuntime } from '../game/battleHudFrameRuntime.ts';
import type { GaragePedestalRuntime } from '../game/garagePedestalRuntime.ts';
import type { GarageShowroomRuntime } from '../game/garageShowroomRuntime.ts';
import type { KillcamRuntime } from '../game/killcamAccess.ts';
import type { MatchModeWorldPresentation } from '../game/matchModeWorldPresentation.ts';
import type { CameraFrameInput } from '../game/playerFrameInput.ts';
import type { SniperFillRuntime } from '../game/sniperFillRuntime.ts';
import type { MatchModePresentationState } from '../sim/matchModes.ts';
import type { NetworkBrowserSessionRuntime } from '../net/networkBrowserSessionRuntime.ts';
import type { WorldFramePresentationRuntime } from '../world/worldFramePresentationRuntime.ts';
import type {
  MainFxRuntime,
  MainGameState,
  MainLightingRuntime,
  MainMobileAutoAimRuntime,
  MainWorld,
} from './mainContracts.ts';

interface FrameStudio {
  readonly active: boolean;
  tick(dtSeconds: number): void;
}

interface FrameTrace {
  frame(dtMs: number): void;
}

export interface MainFrameRuntimeOptions {
  scene: Scene;
  camera: PerspectiveCamera;
  game: MainGameState;
  scheduleFrame(): void;
  isGraphicsContextLost(): boolean;
  battleEntryLifecycle: BattleEntryLifecycle;
  getFx(): MainFxRuntime | null;
  getWorld(): MainWorld | null;
  getBaseFogDensity(): number;
  getStudio(): FrameStudio;
  getShotMode(): boolean;
  getShotHudFrame(): boolean;
  sniperFill: SniperFillRuntime;
  resolveFxSubject(id: string): unknown;
  battleHudFrame: BattleHudFrameRuntime;
  lighting: MainLightingRuntime;
  post: PostRuntime;
  showroom: GarageShowroomRuntime;
  pedestal: GaragePedestalRuntime;
  networkSession: NetworkBrowserSessionRuntime;
  garageFramePacer: GarageFramePacer;
  battleFrame: BattleFrameRuntime;
  isBattleLoadCovering(): boolean;
  cameraInput: CameraFrameInput;
  getMobileAutoAim(): MainMobileAutoAimRuntime | null;
  rig: CameraRig;
  killcam: KillcamRuntime;
  veilHud(hidden: boolean): void;
  worldFramePresentation: WorldFramePresentationRuntime;
  matchModeWorld: MatchModeWorldPresentation;
  audioListener: ListenerPoseRuntime;
  isGaragePresentationDirty(): boolean;
  clearGaragePresentationDirty(): void;
  perfHud: PerfDiagnosticsFacade;
  trace?: FrameTrace | null;
}

export interface MainFrameRuntime {
  tick(nowMs: number): void;
  noteFovPrimed(fov: number): void;
}

/**
 * Owns the rendered-frame transaction without owning application lifecycle.
 * All scratch objects and latches are retained, so Garage and battle frames
 * remain allocation-neutral while the composition root supplies live ports.
 */
export function createMainFrameRuntime({
  scene,
  camera,
  game,
  scheduleFrame,
  isGraphicsContextLost,
  battleEntryLifecycle,
  getFx,
  getWorld,
  getBaseFogDensity,
  getStudio,
  getShotMode,
  getShotHudFrame,
  sniperFill,
  resolveFxSubject,
  battleHudFrame,
  lighting,
  post,
  showroom,
  pedestal,
  networkSession,
  garageFramePacer,
  battleFrame,
  isBattleLoadCovering,
  cameraInput,
  getMobileAutoAim,
  rig,
  killcam,
  veilHud,
  worldFramePresentation,
  matchModeWorld,
  audioListener,
  isGaragePresentationDirty,
  clearGaragePresentationDirty,
  perfHud,
  trace = null,
}: MainFrameRuntimeOptions): MainFrameRuntime {
  const required = [
    scheduleFrame,
    isGraphicsContextLost,
    getFx,
    getWorld,
    getBaseFogDensity,
    getStudio,
    getShotMode,
    getShotHudFrame,
    resolveFxSubject,
    isBattleLoadCovering,
    getMobileAutoAim,
    veilHud,
    isGaragePresentationDirty,
    clearGaragePresentationDirty,
  ];
  if (required.some((entry) => typeof entry !== 'function')) {
    throw new TypeError('main frame runtime requires every live frame port');
  }

  const forward = new Vector3();
  const garageFrameRequest: GarageFrameRequest = { animate: false };
  let lastMs = -1;
  let lastFov = camera.fov;
  let lastCinematicActive = false;

  const noteFovPrimed = (fov: number): void => {
    lastFov = fov;
  };

  const tick = (nowMs: number): void => {
    scheduleFrame();
    if (lastMs < 0) lastMs = nowMs;
    const frameWallDtS = Math.max(0, (nowMs - lastMs) / 1000);
    // A stalled or backgrounded loop never integrates its whole gap. The
    // battle frame owner extends this protection on the pause-resume edge.
    let dtR = Math.min(0.1, frameWallDtS);
    lastMs = nowMs;
    trace?.frame(dtR * 1000);
    if (isGraphicsContextLost()) return;
    if (battleEntryLifecycle.renderingCovered) {
      // The opaque entry veil suppresses expensive/incomplete scene frames,
      // not transport progress. Fresh peers still need the browser network
      // pump to exchange welcome, ready and first-snapshot messages while the
      // world and roster are warming behind that veil.
      networkSession.pump(dtR, nowMs);
      return;
    }

    const fx = getFx();
    const world = getWorld();

    // At high zoom, reduce exponential fog so the scoped picture retains
    // distant contrast. Shot captures use the identical presentation rule.
    if (scene.fog instanceof FogExp2) {
      const fogScale = camera.fov < 15
        ? Math.max(0.22, Math.pow(camera.fov / 15, 1.6))
        : 1;
      scene.fog.density = getBaseFogDensity() * fogScale;
    }

    const studio = getStudio();
    if (studio.active) {
      studio.tick(dtR);
      return;
    }

    if (getShotMode()) {
      camera.getWorldDirection(forward);
      world?.update(0, camera.position, forward, null);
      sniperFill.update();
      fx?.update(dtR, game.shells, camera, resolveFxSubject);
      if (getShotHudFrame()) battleHudFrame.redrawFrozen();
      lighting.update(true);
      post.render(dtR);
      return;
    }

    const garageAnimating = game.phase === 'garage'
      && (showroom.moving || pedestal.switchPending);
    if (game.phase === 'garage') networkSession.pump(dtR, nowMs);
    if (game.phase === 'garage') {
      garageFrameRequest.animate = garageAnimating;
      if (!garageFramePacer.shouldRender(nowMs, garageFrameRequest)) return;
      showroom.update(dtR);
    }

    const frameState = battleFrame.advance(
      dtR,
      frameWallDtS,
      nowMs,
      game.phase === 'battle' && isBattleLoadCovering(),
    );
    dtR = frameState.dtSeconds;
    const { inBattle, paused, livePaused } = frameState;
    const killcamActive = frameState.killcamActive;
    cameraInput.autoAimPoint = getMobileAutoAim()
      ?.sample(inBattle && !paused && !killcamActive) || null;
    if (inBattle && !paused && !killcamActive) rig.update(dtR, cameraInput);
    if (killcamActive) killcam.update(dtR);

    // The battle-open cinematic owns HUD visibility until the killcam ends.
    if (!killcamActive && !killcam.isActive()
      && rig.cinematicActive !== lastCinematicActive) {
      lastCinematicActive = rig.cinematicActive;
      veilHud(lastCinematicActive);
    }
    sniperFill.update();

    worldFramePresentation.update(dtR, inBattle, killcamActive);
    if (fx) {
      fx.update(
        livePaused ? 0 : dtR * (killcamActive ? killcam.fxTimeScale : 1),
        game.shells,
        camera,
        resolveFxSubject,
      );
    }

    matchModeWorld.update(
      inBattle ? game.matchModeState as MatchModePresentationState : null,
      game.timeS,
    );
    battleHudFrame.update(inBattle, killcamActive);
    audioListener.update(dtR, inBattle, killcamActive);

    // FOV animation only needs cascade geometry refresh; material splits do
    // not depend on FOV and remain untouched.
    if (camera.fov !== lastFov) {
      lighting.updateFov();
      lastFov = camera.fov;
    }
    const garageShadowsDirty = game.phase === 'garage'
      && (garageAnimating || isGaragePresentationDirty());
    lighting.setStaticPresentationDormant(
      game.phase === 'garage' && !garageShadowsDirty,
    );
    lighting.update(false, dtR);
    post.render(dtR);
    if (game.phase === 'garage') clearGaragePresentationDirty();
    if (game.phase === 'battle') battleEntryLifecycle.noteBattleFrame();
    perfHud.update(dtR * 1000);
  };

  return { tick, noteFovPrimed };
}
