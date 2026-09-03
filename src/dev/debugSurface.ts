import type { RuntimeValue } from '../runtimeTypes.ts';
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
  __DEBUG?: RuntimeValue;
}

export interface DebugSurfaceDependencies {
  scene: RuntimeValue;
  camera: RuntimeValue;
  renderer: RuntimeValue;
  post: RuntimeValue;
  lighting: RuntimeValue;
  game: { spotting?: RuntimeValue };
  rig: RuntimeValue;
  bus: RuntimeValue;
  input: RuntimeValue;
  settings: RuntimeValue;
  pauseInfo: RuntimeValue;
  garage: RuntimeValue;
  quality: Readonly<Record<string, UnknownAction>>;
  getFx(): RuntimeValue;
  getPedestalVisual(): RuntimeValue;
  isPedestalOnStage(): boolean;
  getSelectedSpecId(): string;
  getPedestalCacheIds(): readonly string[];
  getWorldCacheIds(): readonly string[];
  getResidentLimits(): Readonly<Record<string, number>>;
  getBattleVisualPoolStats(): RuntimeValue;
  getGarageFramePacerStats(): RuntimeValue;
  getFrameLoopSchedulerStats(): RuntimeValue;
  getPhaseSceneResidency(): RuntimeValue;
  getGarageGpuResidency(): RuntimeValue;
  getLastWorldRelease(): RuntimeValue;
  isGraphicsContextLost(): boolean;
  selectGarageTank(id: string): RuntimeValue;
  stagePedestalTank(id: string): RuntimeValue;
  getWorld(): RuntimeValue;
  switchMap(mapId: string): RuntimeValue;
  flags: RuntimeValue;
  frameInfo: RuntimeValue;
  aimAtNearest: UnknownAction;
  gunAimError: UnknownAction;
  playerShellLog: RuntimeValue;
  botPressure: RuntimeValue;
  aimState: UnknownAction;
  fastForward: UnknownAction;
  slayEnemies: UnknownAction;
  startBattle: UnknownAction;
  bakeMinimapForMap(mapId: string): Promise<RuntimeValue>;
  beginBattleEntry: UnknownAction;
  beginSoloBattle: UnknownAction;
  beginNetworkBattle(request?: PrivateBattleLaunchRequest): RuntimeValue;
  enterGarage: UnknownAction;
  leaveBattleToGarage: UnknownAction;
  killcam: RuntimeValue;
  showroom: RuntimeValue;
  garageDressing: RuntimeValue;
  spawnKillShell: UnknownAction;
  getShotMode(): boolean;
  setShotMode(value: boolean): void;
  forceHitMark(bounced: boolean): Promise<void>;
  getDamagePanel(): RuntimeValue;
  devTrace: RuntimeValue;
  getNetworkDiagnostics(): RuntimeValue;
  getNetworkPresentationStats(): RuntimeValue;
  collectTelemetry(): RuntimeValue;
  sampleShadowContribution(): RuntimeValue;
  injectNetworkEvents(events: RuntimeValue): boolean;
}

/** Install the full live QA surface on an explicit target. */
export function installDebugSurface(
  deps: DebugSurfaceDependencies,
  target: DebugInstallTarget = globalThis as DebugInstallTarget,
): RuntimeValue {
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
