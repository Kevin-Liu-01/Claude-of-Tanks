/**
 * Explicit browser diagnostics surface.
 *
 * This module is imported only for development, `?debug=1`, and automated
 * browser sessions. Player boot therefore does not parse or install the large
 * engineering API, while probes keep the same live getters and actions.
 */

import type { PrivateBattleLaunchRequest } from '../net/networkBattleLaunchRuntime.ts';

type UnknownAction = CallableFunction;

interface DebugInstallTarget {
  __DEBUG?: unknown;
}

export interface DebugSurfaceDependencies {
  scene: unknown;
  camera: unknown;
  renderer: unknown;
  post: unknown;
  lighting: unknown;
  game: { spotting?: unknown };
  rig: unknown;
  bus: unknown;
  input: unknown;
  settings: unknown;
  pauseInfo: unknown;
  garage: unknown;
  quality: Readonly<Record<string, UnknownAction>>;
  getFx(): unknown;
  getPedestalVisual(): unknown;
  isPedestalOnStage(): boolean;
  getSelectedSpecId(): string;
  getPedestalCacheIds(): readonly string[];
  getWorldCacheIds(): readonly string[];
  getResidentLimits(): Readonly<Record<string, number>>;
  getBattleVisualPoolStats(): unknown;
  getGarageFramePacerStats(): unknown;
  getFrameLoopSchedulerStats(): unknown;
  getPhaseSceneResidency(): unknown;
  getGarageGpuResidency(): unknown;
  getLastWorldRelease(): unknown;
  isGraphicsContextLost(): boolean;
  selectGarageTank(id: string): unknown;
  stagePedestalTank(id: string): unknown;
  getWorld(): unknown;
  switchMap(mapId: string): unknown;
  flags: unknown;
  frameInfo: unknown;
  aimAtNearest: UnknownAction;
  gunAimError: UnknownAction;
  playerShellLog: unknown;
  botPressure: unknown;
  aimState: UnknownAction;
  fastForward: UnknownAction;
  slayEnemies: UnknownAction;
  startBattle: UnknownAction;
  bakeMinimapForMap(mapId: string): Promise<unknown>;
  beginBattleEntry: UnknownAction;
  beginSoloBattle: UnknownAction;
  beginNetworkBattle(request?: PrivateBattleLaunchRequest): unknown;
  enterGarage: UnknownAction;
  leaveBattleToGarage: UnknownAction;
  killcam: unknown;
  showroom: unknown;
  garageDressing: unknown;
  spawnKillShell: UnknownAction;
  getShotMode(): boolean;
  setShotMode(value: boolean): void;
  forceHitMark(bounced: boolean): Promise<void>;
  getDamagePanel(): unknown;
  devTrace: unknown;
  getNetworkDiagnostics(): unknown;
  getNetworkPresentationStats(): unknown;
  collectTelemetry(): unknown;
  sampleShadowContribution(): unknown;
  injectNetworkEvents(events: unknown): boolean;
}

/** Install the full live QA surface on an explicit target. */
export function installDebugSurface(
  deps: DebugSurfaceDependencies,
  target: DebugInstallTarget = globalThis as DebugInstallTarget,
): unknown {
  const surface = {
    scene: deps.scene,
    camera: deps.camera,
    renderer: deps.renderer,
    post: deps.post,
    lighting: deps.lighting,
    game: deps.game,
    rig: deps.rig,
    bus: deps.bus,
    get fx() { return deps.getFx(); },
    input: deps.input,
    settings: deps.settings,
    pauseInfo: deps.pauseInfo,
    garage: deps.garage,
    quality: deps.quality,
    get pedestalVisual() { return deps.getPedestalVisual(); },
    get pedestalOnStage() { return deps.isPedestalOnStage(); },
    get selectedSpecId() { return deps.getSelectedSpecId(); },
    get pedestalCacheIds() { return [...deps.getPedestalCacheIds()]; },
    get worldCacheIds() { return [...deps.getWorldCacheIds()]; },
    get residentLimits() { return { ...deps.getResidentLimits() }; },
    get battleVisualPool() { return deps.getBattleVisualPoolStats(); },
    get garageFramePacer() { return deps.getGarageFramePacerStats(); },
    get frameLoopScheduler() { return deps.getFrameLoopSchedulerStats(); },
    get phaseSceneResidency() { return deps.getPhaseSceneResidency(); },
    get garageGpuResidency() { return deps.getGarageGpuResidency(); },
    get lastWorldRelease() { return deps.getLastWorldRelease(); },
    get graphicsContextLost() { return deps.isGraphicsContextLost(); },
    selectGarageTank: deps.selectGarageTank,
    stagePedestalTank: deps.stagePedestalTank,
    get world() { return deps.getWorld(); },
    switchMap: deps.switchMap,
    flags: deps.flags,
    frameInfo: deps.frameInfo,
    aimAtNearest: deps.aimAtNearest,
    gunAimError: deps.gunAimError,
    playerShellLog: deps.playerShellLog,
    botPressure: deps.botPressure,
    aimState: deps.aimState,
    fastForward: deps.fastForward,
    slayEnemies: deps.slayEnemies,
    startBattle: deps.startBattle,
    bakeMinimapForMap: deps.bakeMinimapForMap,
    beginBattleEntry: deps.beginBattleEntry,
    beginSoloBattle: deps.beginSoloBattle,
    beginNetworkBattle: deps.beginNetworkBattle,
    enterGarage: deps.enterGarage,
    leaveBattleToGarage: deps.leaveBattleToGarage,
    get spotting() { return deps.game.spotting; },
    get killcam() { return deps.killcam; },
    showroom: deps.showroom,
    garageDressing: deps.garageDressing,
    spawnKillShell: deps.spawnKillShell,
    get shotMode() { return deps.getShotMode(); },
    set shotMode(value: boolean) { deps.setShotMode(value); },
    forceHitMark: deps.forceHitMark,
    get damagePanel() { return deps.getDamagePanel(); },
    devTrace: deps.devTrace,
    get network() { return deps.getNetworkDiagnostics(); },
    get networkPresentation() { return deps.getNetworkPresentationStats(); },
    telemetry: deps.collectTelemetry,
    sampleShadowContribution: deps.sampleShadowContribution,
    injectNetworkEvents: deps.injectNetworkEvents,
  };
  target.__DEBUG = surface;
  return surface;
}
