import { FogExp2, Vector3, type PerspectiveCamera, type Scene } from 'three';

import type { ListenerPoseRuntime } from '../audio/listenerPoseRuntime.ts';
import type { PerfDiagnosticsFacade } from '../dev/perfDiagnosticsAccess.ts';
import type { CameraRig } from '../engine/cameraRig.ts';
import type { GarageFramePacer, GarageFrameRequest } from '../engine/garageFramePacer.ts';
import type { PostRuntime } from '../engine/post.ts';
import type { BattleEntryLifecycle } from '../game/battleEntryLifecycle.ts';
import type {
  BattleFrameReceipt,
  BattleFrameRuntime,
} from '../game/battleFrameRuntime.ts';
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
  mark?(name: string, data: Readonly<Record<string, number>>): void;
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
  let lastRenderedPhase = game.phase;

  const noteFovPrimed = (fov: number): void => {
    lastFov = fov;
  };

  const updateFogDensity = (): void => {
    if (!(scene.fog instanceof FogExp2)) return;
    const fogScale = camera.fov < 15
      ? Math.max(0.22, Math.pow(camera.fov / 15, 1.6))
      : 1;
    scene.fog.density = getBaseFogDensity() * fogScale;
  };

  const renderShotFrame = (
    dtSeconds: number,
    fx: MainFxRuntime | null,
    world: MainWorld | null,
  ): void => {
    camera.getWorldDirection(forward);
    world?.update(0, camera.position, forward, null);
    sniperFill.update();
    fx?.update(dtSeconds, game.shells, camera, resolveFxSubject);
    if (getShotHudFrame()) battleHudFrame.redrawFrozen();
    lighting.update(true);
    post.render(dtSeconds);
  };

  const prepareGarageFrame = (nowMs: number, dtSeconds: number): boolean => {
    if (game.phase !== 'garage') return true;
    networkSession.pump(dtSeconds, nowMs);
    garageFrameRequest.animate = showroom.moving || pedestal.switchPending;
    if (!garageFramePacer.shouldRender(nowMs, garageFrameRequest)) return false;
    showroom.update(dtSeconds);
    return true;
  };

  const updateCombatCamera = (
    frame: BattleFrameReceipt,
    dtSeconds: number,
  ): void => {
    cameraInput.autoAimPoint = getMobileAutoAim()
      ?.sample(frame.inBattle && !frame.paused && !frame.killcamActive) || null;
    if (frame.inBattle && !frame.paused && !frame.killcamActive) {
      rig.update(dtSeconds, cameraInput);
    }
    if (frame.killcamActive) killcam.update(dtSeconds);
  };

  const updateCinematicVeil = (killcamActive: boolean): void => {
    if (killcamActive || killcam.isActive()
      || rig.cinematicActive === lastCinematicActive) return;
    lastCinematicActive = rig.cinematicActive;
    veilHud(lastCinematicActive);
  };

  const updateWorldPresentation = (
    frame: BattleFrameReceipt,
    dtSeconds: number,
    fx: MainFxRuntime | null,
  ): void => {
    worldFramePresentation.update(dtSeconds, frame.inBattle, frame.killcamActive);
    fx?.update(
      frame.livePaused ? 0 : dtSeconds * (frame.killcamActive ? killcam.fxTimeScale : 1),
      game.shells,
      camera,
      resolveFxSubject,
    );
    matchModeWorld.update(
      frame.inBattle ? game.matchModeState as MatchModePresentationState : null,
      game.timeS,
    );
    battleHudFrame.update(frame.inBattle, frame.killcamActive);
    audioListener.update(dtSeconds, frame.inBattle, frame.killcamActive);
  };

  const renderPresentation = (
    frame: BattleFrameReceipt,
    dtSeconds: number,
  ): void => {
    const profileGarageReturn = game.phase === 'garage'
      && lastRenderedPhase !== 'garage'
      && typeof trace?.mark === 'function';
    const frameStartedAt = profileGarageReturn ? performance.now() : 0;
    if (camera.fov !== lastFov) {
      lighting.updateFov();
      lastFov = camera.fov;
    }
    const garageShadowsDirty = game.phase === 'garage'
      && (showroom.moving || pedestal.switchPending || isGaragePresentationDirty());
    lighting.setStaticPresentationDormant(
      game.phase === 'garage' && !garageShadowsDirty,
    );
    const lightingStartedAt = profileGarageReturn ? performance.now() : 0;
    lighting.update(false, dtSeconds);
    const postStartedAt = profileGarageReturn ? performance.now() : 0;
    post.render(dtSeconds);
    const frameFinishedAt = profileGarageReturn ? performance.now() : 0;
    if (game.phase === 'garage') clearGaragePresentationDirty();
    if (frame.inBattle) battleEntryLifecycle.noteBattleFrame();
    perfHud.update(dtSeconds * 1000);
    if (profileGarageReturn) {
      trace.mark?.('garage:return-frame', {
        preRenderMs: +(lightingStartedAt - frameStartedAt).toFixed(3),
        lightingMs: +(postStartedAt - lightingStartedAt).toFixed(3),
        postMs: +(frameFinishedAt - postStartedAt).toFixed(3),
        totalMs: +(frameFinishedAt - frameStartedAt).toFixed(3),
      });
    }
    lastRenderedPhase = game.phase;
  };

  const renderLiveFrame = (
    dtSeconds: number,
    frameWallDtSeconds: number,
    nowMs: number,
    fx: MainFxRuntime | null,
  ): void => {
    if (!prepareGarageFrame(nowMs, dtSeconds)) return;
    const frame = battleFrame.advance(
      dtSeconds,
      frameWallDtSeconds,
      nowMs,
      game.phase === 'battle' && isBattleLoadCovering(),
    );
    const appliedDtSeconds = frame.dtSeconds;
    updateCombatCamera(frame, appliedDtSeconds);
    updateCinematicVeil(frame.killcamActive);
    sniperFill.update();
    updateWorldPresentation(frame, appliedDtSeconds, fx);
    renderPresentation(frame, appliedDtSeconds);
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
    updateFogDensity();

    const studio = getStudio();
    if (studio.active) {
      studio.tick(dtR);
      return;
    }

    if (getShotMode()) {
      renderShotFrame(dtR, fx, world);
      return;
    }
    renderLiveFrame(dtR, frameWallDtS, nowMs, fx);
  };

  return { tick, noteFovPrimed };
}
