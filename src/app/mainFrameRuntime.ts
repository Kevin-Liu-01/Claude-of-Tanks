import type { RuntimeValue } from '../runtimeTypes.ts';
import { getScopeVision, aerialVisionCode } from '../engine/aerialVision.ts';
import { createThermalVehicles } from '../engine/thermalVehicles.ts';
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
import type { WorldFramePresentationRuntime } from '../world/worldFramePresentationRuntime.ts';
import { FRAME_STAGE, frameStages } from '../game/stateCore.ts';
import type {
  MainFxRuntime,
  MainGameState,
  MainLightingRuntime,
  MainMobileAutoAimRuntime,
  MainWorld,
} from './mainContracts.ts';

interface FrameStudio {
  readonly active: boolean;
  tick(dtSeconds: number, frameWallDtSeconds?: number): void;
}

interface FrameTrace {
  frame(dtMs: number): void;
  mark?(name: string, data: Readonly<Record<string, number>>): void;
}

interface MainFrameRuntimeOptions {
  scene: Scene;
  camera: PerspectiveCamera;
  game: MainGameState;
  thermalVehicles?: ReturnType<typeof createThermalVehicles>;
  scheduleFrame(): void;
  isGraphicsContextLost(): boolean;
  syncViewportPixelRatio(): boolean;
  battleEntryLifecycle: BattleEntryLifecycle;
  getFx(): MainFxRuntime | null;
  getWorld(): MainWorld | null;
  getBaseFogDensity(): number;
  getStudio(): FrameStudio;
  getShotMode(): boolean;
  getShotHudFrame(): boolean;
  sniperFill: SniperFillRuntime;
  updateNightLighting?(): void;
  resolveFxSubject(id: string): RuntimeValue;
  battleHudFrame: BattleHudFrameRuntime;
  lighting: MainLightingRuntime;
  post: PostRuntime;
  showroom: GarageShowroomRuntime;
  pedestal: GaragePedestalRuntime;
  garageModePreview?: { readonly animated: boolean; readonly pending?: boolean; update(dt: number): void; clear(): void };
  /** The Garage's stage overlays (its numbered hotspots), placed after the showroom moves on each rendered frame. */
  garageOverlay?: { frame(): void };
  /** The one network pump every phase shares (the multiplayer composition's session owner). */
  networkSession: { pump(dtSeconds: number, nowMs: number): void };
  garageFramePacer: GarageFramePacer;
  battleFrame: BattleFrameRuntime;
  isBattleLoadCovering(): boolean;
  isPresentationRestoreCovering(): boolean;
  isTransitionHoldingSceneForFadeIn(): boolean;
  /** (perf-247) An opaque boot veil over a phase that presents nothing yet (a direct /studio boot): no scene frame. */
  isBootCovering?(): boolean;
  cameraInput: CameraFrameInput;
  getMobileAutoAim(): MainMobileAutoAimRuntime | null;
  rig: CameraRig;
  /** Watch mode (watch-mode-243): true when the watch camera solved this frame's camera (the rig stays out). */
  watchFrame?(dtSeconds: number): boolean;
  killcam: KillcamRuntime;
  veilHud(hidden: boolean): void;
  worldFramePresentation: WorldFramePresentationRuntime;
  /** (perf-245) a camera hop's destination warm: one batch a battle frame, before the scene renders. */
  destinationWarm?: { update(): void } | null;
  matchModeWorld: MatchModeWorldPresentation;
  audioListener: ListenerPoseRuntime;
  isGaragePresentationDirty(): boolean;
  clearGaragePresentationDirty(): void;
  perfHud: PerfDiagnosticsFacade;
  trace?: FrameTrace | null;
}

interface MainFrameRuntime {
  tick(nowMs: number): void;
  noteFovPrimed(fov: number): void;
}

/**
 * Owns the rendered-frame transaction without owning application lifecycle.
 * All scratch objects and latches are retained, so Garage and battle frames
 * remain allocation-neutral while the composition root supplies live ports.
 */
/**
 * (local-fps-265) How far the lens may move from the cascades' last fit before they refit, in the projection's off-axis
 * terms (elements 8 and 9: 2 x the view offset over the full size). A fifth of the chase framing's usual full shift
 * (~0.23); coverage holds to the whole shift (mainFrameRuntime lensRefitDue).
 */
export const LENS_REFIT_SLACK = 0.05;

export function createMainFrameRuntime({
  scene,
  camera,
  game,
  thermalVehicles = createThermalVehicles(),
  scheduleFrame,
  isGraphicsContextLost,
  syncViewportPixelRatio,
  battleEntryLifecycle,
  getFx,
  getWorld,
  getBaseFogDensity,
  getStudio,
  getShotMode,
  getShotHudFrame,
  sniperFill,
  updateNightLighting,
  resolveFxSubject,
  battleHudFrame,
  lighting,
  post,
  showroom,
  pedestal,
  garageModePreview,
  garageOverlay,
  networkSession,
  garageFramePacer,
  battleFrame,
  isBattleLoadCovering,
  isPresentationRestoreCovering,
  isTransitionHoldingSceneForFadeIn,
  isBootCovering = () => false,
  cameraInput,
  getMobileAutoAim,
  rig,
  watchFrame,
  killcam,
  veilHud,
  worldFramePresentation,
  destinationWarm = null,
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
    syncViewportPixelRatio,
    getFx,
    getWorld,
    getBaseFogDensity,
    getStudio,
    getShotMode,
    getShotHudFrame,
    resolveFxSubject,
    isBattleLoadCovering,
    isPresentationRestoreCovering,
    isTransitionHoldingSceneForFadeIn,
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
  // (battle-camera-264) the off-axis terms of the projection the cascades were fitted to: the chase framing's lens shift
  // (cameraRig.ts applyLens, cameraLens.ts) moves the frustum without a fov change, and CSM's slices are the projection's
  // unprojection at its last fit
  let lastLensX = camera.projectionMatrix.elements[8];
  let lastLensY = camera.projectionMatrix.elements[9];
  // (local-fps-265) the lens the previous frame drew with: a lens equal to it has settled (the ease snaps to its target)
  let frameLensX = lastLensX;
  let frameLensY = lastLensY;
  let lastCinematicActive = false;
  let lastRenderedPhase = game.phase;
  let viewportChanged = false;

  const noteFovPrimed = (fov: number): void => {
    lastFov = fov;
    lastLensX = frameLensX = camera.projectionMatrix.elements[8];
    lastLensY = frameLensY = camera.projectionMatrix.elements[9];
  };

  /**
   * (local-fps-265) Whether the lens has moved its cascades' fit: past LENS_REFIT_SLACK from the lens of the last fit (a
   * jump: the scope, the isometric view, Watch, a cleared shift), or settled anywhere off it. The chase framing's ease
   * moves the lens a little every frame while the camera works; refitting each step re-shaped CSM's slices every frame, so
   * the cascades' poses moved, the cascade caster proxies recompacted and the static shadow cache drew the tree canopies'
   * shadows as dynamic casters (~150 shadow draws a frame on Verdant against 262's ~5). A fit stale by the slack is
   * covered: fitted to a centred lens, no visible receiver left its cascade's map at any shift the framing makes
   * (battle-camera-264's measurement); and the ease's end refits to the exact lens. The fov keeps its exact refit.
   */
  const lensRefitDue = (lensX: number, lensY: number): boolean => {
    const dx = lensX - lastLensX, dy = lensY - lastLensY;
    if (dx === 0 && dy === 0) return false;
    if (dx > LENS_REFIT_SLACK || dx < -LENS_REFIT_SLACK || dy > LENS_REFIT_SLACK || dy < -LENS_REFIT_SLACK) return true;
    return lensX === frameLensX && lensY === frameLensY;
  };

  // hot-path: every frame (the scoped fog)
  const updateFogDensity = (): void => {
    if (!(scene.fog instanceof FogExp2)) return;
    const fogScale = camera.fov < 15
      ? Math.max(0.22, Math.pow(camera.fov / 15, 1.6))
      : 1;
    scene.fog.density = getBaseFogDensity() * fogScale;
  };

  const renderShotFrame = (
    dtSeconds: number,
    frameWallDtSeconds: number,
    fx: MainFxRuntime | null,
    world: MainWorld | null,
  ): void => {
    camera.getWorldDirection(forward);
    world?.update(0, camera.position, forward, null, camera);
    sniperFill.update();
    fx?.update(dtSeconds, game.shells, camera, resolveFxSubject);
    updateNightLighting?.();
    if (getShotHudFrame()) battleHudFrame.redrawFrozen();
    // A shot frame is never the Garage's static presentation: it releases the static-presentation dormancy latch every
    // frame, as a battle frame does (renderPresentation below). The Garage GPU warm sets that latch in its `finally`
    // (garageGpuWarmRuntime.ts) and can finish after a capture has staged its battlefield; this frame's own forced
    // update bypasses the latch, but a capture tool that samples the live, unforced update (the cost probes) would
    // otherwise freeze every cascade for the whole run (2026-10-08, the clouds lane's F2c: one page of three drew no
    // shadow map). Releasing an already released latch is a no-op.
    lighting.setStaticPresentationDormant(false);
    lighting.update(true);
    post.render(dtSeconds, frameWallDtSeconds);
  };

  // hot-path: every frame in the Garage
  const prepareGarageFrame = (nowMs: number, dtSeconds: number): boolean => {
    if (game.phase !== 'garage') { garageModePreview?.clear(); return true; }
    // (battle-camera-264) the chase's lens shift never rides into the showroom's camera
    rig.suspendFraming();
    networkSession.pump(dtSeconds, nowMs);
    garageFrameRequest.animate = showroom.moving || pedestal.switchPending || !!garageModePreview?.animated || !!garageModePreview?.pending;
    if (!garageFramePacer.shouldRender(nowMs, garageFrameRequest)) return false;
    showroom.update(dtSeconds);
    garageModePreview?.update(dtSeconds);
    garageOverlay?.frame();
    return !garageModePreview?.pending;
  };

  /** The last live battle frame's camera was Watch's (a paused one keeps it: no chase preview over a watched battle). */
  let watchOwnsCamera = false;
  // hot-path: every battle frame
  const updateCombatCamera = (
    frame: BattleFrameReceipt,
    dtSeconds: number,
  ): void => {
    frameStages?.stage(FRAME_STAGE.camera);
    cameraInput.autoAimPoint = getMobileAutoAim()
      ?.sample(frame.inBattle && !frame.paused && !frame.killcamActive) || null;
    if (frame.inBattle && !frame.paused && !frame.killcamActive) {
      // (battle-camera-264) Watch's cameras own the frame: the chase's lens shift comes off
      watchOwnsCamera = !!watchFrame?.(dtSeconds);
      if (watchOwnsCamera) rig.suspendFraming();
      else rig.update(dtSeconds, cameraInput);
    } else if (frame.inBattle && frame.paused && !frame.killcamActive && !watchOwnsCamera) {
      // a changed camera setting glides in behind the pause menu (battle-camera-264: the settings' live preview)
      rig.previewFraming(dtSeconds);
    }
    if (frame.killcamActive) killcam.update(dtSeconds);
  };

  // hot-path: every frame
  const updateCinematicVeil = (killcamActive: boolean): void => {
    if (killcamActive || killcam.isActive()
      || rig.cinematicActive === lastCinematicActive) return;
    lastCinematicActive = rig.cinematicActive;
    veilHud(lastCinematicActive);
  };

  // hot-path: every frame
  const updateWorldPresentation = (
    frame: BattleFrameReceipt,
    dtSeconds: number,
    fx: MainFxRuntime | null,
  ): void => {
    const stages = frameStages;
    stages?.stage(FRAME_STAGE.world);
    worldFramePresentation.update(dtSeconds, frame.inBattle, frame.killcamActive);
    stages?.stage(FRAME_STAGE.fx);
    fx?.update(
      frame.livePaused ? 0 : dtSeconds * (frame.killcamActive ? killcam.fxTimeScale : 1),
      game.shells,
      camera,
      resolveFxSubject,
    );
    stages?.stage(FRAME_STAGE.matchWorld);
    matchModeWorld.update(
      frame.inBattle ? game.matchModeState as MatchModePresentationState : null,
      game.timeS,
    );
    stages?.stage(FRAME_STAGE.hud);
    battleHudFrame.update(frame.inBattle, frame.killcamActive);
    stages?.stage(FRAME_STAGE.audio);
    audioListener.update(dtSeconds, frame.inBattle, frame.killcamActive);
  };

  // hot-path: every rendered frame
  const renderPresentation = (
    frame: BattleFrameReceipt,
    dtSeconds: number,
    frameWallDtSeconds: number,
  ): void => {
    const profileGarageReturn = game.phase === 'garage'
      && lastRenderedPhase !== 'garage'
      && typeof trace?.mark === 'function';
    const frameStartedAt = profileGarageReturn ? performance.now() : 0;
    const projection = camera.projectionMatrix.elements;
    if (camera.fov !== lastFov || lensRefitDue(projection[8], projection[9])) {
      lighting.updateFov();
      lastFov = camera.fov;
      lastLensX = projection[8];
      lastLensY = projection[9];
    }
    frameLensX = projection[8];
    frameLensY = projection[9];
    const garageShadowsDirty = game.phase === 'garage'
      && (viewportChanged || showroom.moving || pedestal.switchPending || isGaragePresentationDirty());
    lighting.setStaticPresentationDormant(
      game.phase === 'garage' && !garageShadowsDirty,
    );
    // (battle-spikes-253) the near hulls' merged shadow casters in a live battle frame only (never the Garage or a killcam)
    lighting.setVehicleShadowMerge(frame.inBattle && !frame.killcamActive);
    const lightingStartedAt = profileGarageReturn ? performance.now() : 0;
    const stages = frameStages;
    stages?.stage(FRAME_STAGE.lighting);
    lighting.update(false, dtSeconds);
    stages?.stage(FRAME_STAGE.post);
    const postStartedAt = profileGarageReturn ? performance.now() : 0;
    camera.userData.scopeVision = rig.mode === 'SNIPER' && !game.player?.aerial?.active ? aerialVisionCode(getScopeVision()) : 0;
    const thermal = frame.inBattle && !frame.killcamActive && !game.player?.combat?.destroyed && camera.userData.thermalFlight === true;
    camera.userData.thermalFlight = thermal;
    const vision=thermal?(camera.userData.flightVision??1):(frame.inBattle&&!frame.killcamActive?camera.userData.scopeVision:0);
    camera.userData.sensorVision=vision;
    thermalVehicles.begin(game.tanks,(vision===1||vision===2),game.player?.team,frame.inBattle?game.timeS:undefined);
    if (frame.inBattle) destinationWarm?.update();
    try { post.render(dtSeconds, frameWallDtSeconds); }
    finally { thermalVehicles.end(); }
    const frameFinishedAt = profileGarageReturn ? performance.now() : 0;
    if (game.phase === 'garage') clearGaragePresentationDirty();
    if (frame.inBattle) battleEntryLifecycle.noteBattleFrame();
    stages?.stage(FRAME_STAGE.perfHud);
    perfHud.update(dtSeconds * 1000);
    if (profileGarageReturn) markGarageReturnFrame(frameStartedAt, lightingStartedAt, postStartedAt, frameFinishedAt);
    lastRenderedPhase = game.phase;
  };

  /** The traced Garage return's first frame (a diagnostics trace only, once per return). */
  const markGarageReturnFrame = (frameStartedAt: number, lightingStartedAt: number, postStartedAt: number,
    frameFinishedAt: number): void => {
    trace?.mark?.('garage:return-frame', {
      preRenderMs: +(lightingStartedAt - frameStartedAt).toFixed(3),
      lightingMs: +(postStartedAt - lightingStartedAt).toFixed(3),
      postMs: +(frameFinishedAt - postStartedAt).toFixed(3),
      totalMs: +(frameFinishedAt - frameStartedAt).toFixed(3),
    });
  };

  // hot-path: every rendered frame
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
    frameStages?.stage(FRAME_STAGE.sniperFill);
    sniperFill.update();
    updateWorldPresentation(frame, appliedDtSeconds, fx);
    frameStages?.stage(FRAME_STAGE.night);
    updateNightLighting?.();
    renderPresentation(frame, appliedDtSeconds, frameWallDtSeconds);
  };

  // hot-path: the animation frame callback
  const tick = (nowMs: number): void => {
    // the spike census's recorder, when installed (game/frameStages.ts): the frame's begin and end around its work
    const stages = frameStages;
    stages?.begin(nowMs);
    runTick(nowMs);
    stages?.end();
  };

  const runTick = (nowMs: number): void => {
    scheduleFrame();
    if (lastMs < 0) lastMs = nowMs;
    const frameWallDtS = Math.max(0, (nowMs - lastMs) / 1000);
    // A stalled or backgrounded loop never integrates its whole gap. The
    // battle frame owner extends this protection on the pause-resume edge.
    let dtR = Math.min(0.1, frameWallDtS);
    lastMs = nowMs;
    trace?.frame(dtR * 1000);
    if (isGraphicsContextLost()) return;
    if (battleEntryLifecycle.renderingCovered || isPresentationRestoreCovering()
      || isTransitionHoldingSceneForFadeIn() || isBootCovering()) {
      // Opaque entry and Garage-restore veils suppress expensive/incomplete
      // scene frames, not transport progress. Fresh peers still need the
      // browser network pump while worlds and presentation state warm behind
      // those veils. An opted-in result transition also keeps its last scene
      // frame during fade-in only; its owner releases before work/fade-out.
      networkSession.pump(dtR, nowMs);
      return;
    }

    viewportChanged = syncViewportPixelRatio();
    if (viewportChanged && game.phase === 'garage') {
      // Resizing clears the canvas. The same existing tick must paint rather
      // than being skipped by the settled-Garage pacer. Do not start a loop.
      garageFramePacer.noteActivity(nowMs);
    }

    const fx = getFx();
    const world = getWorld();

    // At high zoom, reduce exponential fog so the scoped picture retains
    // distant contrast. Shot captures use the identical presentation rule.
    updateFogDensity();

    const studio = getStudio();
    if (studio.active) {
      studio.tick(dtR, frameWallDtS);
      return;
    }

    if (getShotMode()) {
      renderShotFrame(dtR, frameWallDtS, fx, world);
      return;
    }
    renderLiveFrame(dtR, frameWallDtS, nowMs, fx);
  };

  return { tick, noteFovPrimed };
}
