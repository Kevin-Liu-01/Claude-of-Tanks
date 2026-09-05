import type { RuntimeValue } from './runtimeTypes.ts';
/**
 * main.ts — typed integration entry point (ARCHITECTURE.md §4, §5).
 *
 * Startup order (locked): createRenderer → createSky → bakeEnvironment →
 * createLighting (CSM before any material compiles) → EngineCtx →
 * spawn tanks → createFx → HUD/garage → createAudio → createCameraRig →
 * applyFog → warm frames → window.__GAME_READY.
 *
 * BOOT SCREENS (boot r8): the module body is now a STAGED, frame-yielding boot
 * sequence (top-level await between stages) behind the branded entry/loading
 * screen whose markup lives inline in index.html. Every stage reports real
 * progress to src/ui/bootScreen.ts, so the bar tracks work instead of a timer,
 * and the browser gets a frame between stages so it can actually paint it.
 *
 * The 1 km battlefield is NOT part of boot any more — nothing on the garage
 * screen can see it (the bay is fully enclosed), so ensureWorld() builds it on
 * first real need, chunked behind the pre-battle loading screen. In the garage
 * the battle world is dormant: hidden (which also drops it from every shadow
 * cascade) and skipped by the per-frame LOD/wind update.
 *
 * Game flow: entry splash → garage (pedestal showcase at -1500,-1500) →
 * battle loading screen → battle (player vs 7 AI tanks) → victory/defeat
 * overlay → back to garage.
 */
import * as THREE from 'three';
// Side-effect import: registers the i18n catalog as the source of truth so
// any `t('module.key')` call resolved later in the boot sequence finds a
// populated dictionary. Keep this line above the rest of the imports.
import './ui/i18nCatalog.ts';
import type {
  WorldActivationRuntime,
  WorldActivationOptions,
} from './world/worldActivationRuntime.ts';
import type { NetworkRoomCoordinator } from './net/networkRoomCoordinator.ts';
import type { NetworkBattleCompositionRuntime } from './net/networkBattleComposition.ts';
import type { PlayerBattleActions } from './game/playerBattleActions.ts';
import type { BattleVisualStreamer } from './game/battleVisualStreamer.ts';
import type {
  MainEntity,
  MainFxModule,
  MainFxRuntime,
  MainGameState,
  MainGarageRuntime,
  MainLightingRuntime,
  MainWorld,
} from './app/mainContracts.ts';
import {
  createMainBattleHudRuntime,
  type MainBattleHudRuntime,
} from './app/mainBattleHudRuntime.ts';
import { createMainFrameRuntime } from './app/mainFrameRuntime.ts';
import { createCombatAimComposition } from './app/combatAimComposition.ts';
import { checkedIntegrationPort } from './app/checkedIntegrationPort.ts';
import { createCombatWarmComposition } from './app/combatWarmComposition.ts';
import { createRenderer } from './engine/renderer.ts';
import {
  installShaderErrorCollector, relaxShaderChecks, runDeviceDiag, applyDiagRescue,
  mountDiagOverlay, runSceneBlackWatchdog, reclaimShadows,
} from './engine/deviceDiag.ts';
import {
  resolveDeviceTier, resolvePresetName, resolveAutoTier,
  reportSustainedOverload, setPresetName, setMobilePresetName,
  noteGpuRenderer, getDeviceTier, shouldReleaseInactivePhaseGpu,
} from './engine/quality.ts';
import { createSky } from './engine/sky.ts';
import { createLighting } from './engine/lighting.ts';
import { createPost } from './engine/post.ts';
import {
  createFrameBudgetYielder,
  createOpaqueLoadingYielder,
  nextFrame,
} from './engine/frameScheduler.ts';
import { createBootLifecycle } from './engine/bootLifecycle.ts';
import { createViewportRuntime } from './engine/viewportRuntime.ts';
import { createFrameLoopScheduler } from './engine/frameLoopScheduler.ts';
import { createGarageFramePacer } from './engine/garageFramePacer.ts';
import { createForwardProgramWarmOwner } from './engine/programWarm.ts';
import {
  restoreGarageGpuPipeline,
  warmGarageGpuPipeline,
} from './engine/garageGpuWarmRuntime.ts';
import { createIsolatedForwardWarmBatches } from './engine/deploymentWarm.ts';
// DESTRUCTIBLES r1: prop-destruction bus seam (audio subscribes to the event)
import { setDestroyedEventSink } from './world/destructibles.ts';
import {
  MAP_IDS,
  getMapName,
  getLocalizedMapName,
  resolveMapId,
} from './world/maps/catalog.ts';
import { t } from './ui/i18n.ts';
import { getGarageSkyPreset } from './game/garageSkyPresets.ts';
import { createWorldActivationRuntime } from './world/worldActivationRuntime.ts';
import { createWorldFramePresentationRuntime } from './world/worldFramePresentationRuntime.ts';
import { createLiveHeightFieldProxy } from './world/liveHeightFieldProxy.ts';
import { MAP_HEROES, MAP_THUMBS } from './ui/mapThumbs.ts';
import { VISIBLE_TANK_IDS, getSpec } from './vehicles/specs.ts';
import {
  createTank, ensureFullFleet, ensureTankBuilder, ensureTankBuilders,
} from './vehicles/fleetFactory.ts';
import { isBuiltInCamoId } from './vehicles/camoPolicy.ts';
// CAMO WIRING: pattern persistence + live repaint (garage picker, AUTO biome)
import {
  CAMO_CATALOG_PATTERN_IDS, CAMO_PATTERN_LABEL, getCamoSelection, setCamoSelection,
  getCustomCamoSelection, setCustomCamoSelection, getMultiplayerCamoSelection,
  setCamoBiome, setCamoOverride, applyCamoPatterns, applyCamoPatternsChunked,
  clearCamoOverrides, warmWreckTextures,
  prebakeSharedTextures, prebakeBurntSteps, discardPrebakedSharedTextures,
} from './vehicles/materials.ts';
import './ui/motion.css';
import './ui/responsiveSurfaces.css';
import './ui/garage.css';
import { createGarage } from './ui/garage.ts';
import { installBattleRecords } from './game/profile.ts';
import {
  createGarageStage, GARAGE_PODIUM_TOP_Y_M, GARAGE_TRACK_AXIS_YAW_RAD,
} from './ui/garageStage.ts';
import { createGarageDressingAccess } from './game/garageDressingAccess.ts';
import { createGarageDressingScheduler } from './game/garageDressingScheduler.ts';
import {
  GARAGE_VARIANTS, getGarageVariant, loadGarageVariantId, saveGarageVariantId,
} from './game/garageVariants.ts';
import {
  createGarageEnvironmentPresentationRuntime,
  GARAGE_CAMERA_LOOK_HEIGHT_M,
  type GarageEnvironmentPresentationRuntime,
} from './game/garageEnvironmentPresentationRuntime.ts';
import {
  GARAGE_CAMERA_AZIMUTH_RAD,
  GARAGE_CAMERA_PITCH_RAD,
} from './game/garagePresentationPose.ts';
import { createGaragePedestalRuntime } from './game/garagePedestalRuntime.ts';
import { createGarageShowroomRuntime } from './game/garageShowroomRuntime.ts';
import { createGarageIdleWorkCoordinator } from './game/garageIdleWorkCoordinator.ts';
import { createGarageReturnAccess } from './game/garageReturnAccess.ts';
import { createGaragePhasePresentationRuntime } from './game/garagePhasePresentationRuntime.ts';
import { createGarageWorkshopDiagnostics } from './game/garageWorkshopDiagnostics.ts';
import { createBattleIntentRuntime } from './game/battleIntentRuntime.ts';
import { createBattlePhasePolicy } from './game/battlePhasePolicy.ts';
import { createBattleRolloutRuntime } from './game/battleRolloutRuntime.ts';
import { createKillcamAccess } from './game/killcamAccess.ts';
import { createPlayerBattleActions } from './game/playerBattleActions.ts';
import { createPlayerFrameInput } from './game/playerFrameInput.ts';
import { createBattleFrameRuntime } from './game/battleFrameRuntime.ts';
import { createBattlePresentationRuntime } from './game/battlePresentationRuntime.ts';
import { createBattleHudFrameRuntime } from './game/battleHudFrameRuntime.ts';
import { createMatchModeWorldPresentation } from './game/matchModeWorldPresentation.ts';
import { createBattleResultPresentationRuntime } from './game/battleResultPresentationRuntime.ts';
import { createSoloBattleDeploymentAccess } from './game/soloBattleDeploymentAccess.ts';
import { createSoloBattleLoadingAccess } from './game/soloBattleLoadingAccess.ts';
import type { SoloBattleLoadingStartOptions } from './game/soloBattleLoadingRuntime.ts';
import { createSoloBattleStartAccess } from './game/soloBattleStartAccess.ts';
import {
  createSoloBattleEntryRuntime,
  type SoloBattleEntryRequest,
} from './game/soloBattleEntryRuntime.ts';
import { createBattleVisualPool } from './game/battleVisualPool.ts';
import { createBattleVisualStreamerAccess } from './game/battleVisualStreamerAccess.ts';
import {
  clearBattleAfterExit,
  resetBattleTankForGarage,
} from './game/garageTankLifecycle.ts';
// Engineering diagnostics stay out of ordinary production boot. A tiny typed
// facade transfers the exact HUD/telemetry runtime only for explicit QA,
// development, or automation sessions.
import { debugModeRequested } from './dev/debugIntent.ts';
import type {
  BotPressureTelemetry,
  CombatTelemetryOptions,
  PlayerShellTelemetryRecord,
} from './dev/combatTelemetry.ts';
import type { DebugSurfaceDependencies } from './dev/debugSurface.ts';
import { createDriveTestAccess } from './dev/driveTestAccess.ts';
import type { DriveTestControllerOptions } from './dev/driveTestController.ts';
import { createPerfDiagnosticsAccess } from './dev/perfDiagnosticsAccess.ts';
import { createLazyAudio } from './audio/lazyAudio.ts';
import { createListenerPoseRuntime } from './audio/listenerPoseRuntime.ts';
import { createInput } from './game/input.ts';
import { createArmorAimOverlayAccess } from './game/armorAimOverlayAccess.ts';
import { createBattleWarmAccess } from './game/battleWarmAccess.ts';
import { createBattleModuleAccess } from './game/battleModuleAccess.ts';
import { createPlaySurfaceRuntime } from './game/playSurfaceRuntime.ts';
import { createNetworkBrowserSessionRuntime } from './net/networkBrowserSessionRuntime.ts';
import { createNetworkCompositionAccess } from './net/networkCompositionAccess.ts';
import { createNetworkBattleIntentCover } from './net/networkBattleIntentCover.ts';
import type { PrivateBattleLaunchRequest } from './net/networkBattleLaunchRuntime.ts';
import { loadEquipment as loadSelectedEquipment } from './game/equipment.ts';
import { createSettingsAccess } from './ui/settingsAccess.ts';
import { createMobileBattleInputAccess } from './game/mobileBattleInputAccess.ts';
import { installResponsiveLayout } from './ui/responsiveLayout.ts';
import {
  spawnTanks, ensureStagedVisuals, nextStagedBake, planBattleParticipantIds,
  planBattleCamoOverrides, type BattleVisual,
} from './game/rosterState.ts';
import { createBus, createGameState } from './game/stateCore.ts';
import { SHOT_VIEWS, type ShotViewName } from './dev/shotContract.ts';
import { createSoloBattleRuntimeAccess } from './game/soloBattleAccess.ts';
import { createBattleEntryAcquisition } from './game/battleEntryAcquisition.ts';
import { createBattleEntryLifecycle } from './game/battleEntryLifecycle.ts';
import { createStudioAccess } from './game/studioAccess.ts';
import { createFxRuntimeAccess } from './fx/fxRuntimeAccess.ts';
import { releaseObject3DGpuResources } from './engine/resourceLifetime.ts';
// BOOT SCREENS: the entry/loading gate (markup inline in index.html so first
// paint never waits on this module graph) and the pre-battle roster screen.
import { createBootScreen } from './ui/bootScreen.ts';
import { createBattleLoadScreen } from './ui/battleLoad.ts';
import { createEndOverlayRuntime } from './ui/endOverlayRuntime.ts';
import { createStartupIntent } from './game/startupIntent.ts';
import { createSelectedVehicleSelection } from './game/selectedVehicleSelection.ts';
import { createPointerLockFeedbackRuntime } from './game/pointerLockFeedbackRuntime.ts';
import { createSniperFillRuntime } from './game/sniperFillRuntime.ts';
import { createCombatFeedbackRuntime } from './game/combatFeedbackRuntime.ts';
import { createRosterPresentation } from './game/rosterPresentation.ts';
import { tankTier, tierNumeral } from './vehicles/tier.ts';
import { createTransition } from './ui/transition.ts';
import type { DamagePanelController } from './ui/damagePanel.ts';
import type { HudMatchModeState, HudMode } from './ui/hud.ts';

type DamagePanelSpec = Parameters<DamagePanelController['setTank']>[0];
type DamagePanelVisual = Parameters<DamagePanelController['setTank']>[1];
type DamagePanelEquipment = Parameters<DamagePanelController['setEquipment']>[0];

// Direct /studio navigation is a distinct boot target, not "boot the garage,
// reveal it, then start a second load".  The intent is captured before any
// staged work so the inline boot screen can report Studio-specific progress
// and main.ts can hand the already-visible veil to createStudio().
const startupIntent = createStartupIntent(globalThis.location);
const STUDIO_BOOT_INTENT = startupIntent.studioRequested;
const STUDIO_BOOT_MAP = startupIntent.studioMapId;

const DEG = Math.PI / 180;
const SIM_DT = 1 / 60;
const VERDANT_GARAGE_POS = Object.freeze({ x: -1500, z: -1500 });
const GARAGE_POS = new THREE.Vector3(VERDANT_GARAGE_POS.x, 0, VERDANT_GARAGE_POS.z);
const pendingRoomInvitePromise = startupIntent.pendingRoomInvite;
const camoPatternLabels: Readonly<Record<string, string>> = CAMO_PATTERN_LABEL;
const mapHeroes: Readonly<Record<string, string>> = MAP_HEROES;
const mapThumbs: Readonly<Record<string, string>> = MAP_THUMBS;
const minimapAssetUrl = (mapId: string): string => (
  `${import.meta.env.BASE_URL || '/'}minimaps/${encodeURIComponent(mapId)}.webp?v=north-up-v5`
);
const isShotViewName = (value: string): value is ShotViewName => (
  SHOT_VIEWS.some((name) => name === value)
);

const {
  preload: preloadSoloBattleRuntime,
  isReady: isSoloBattleRuntimeReady,
  setupBattle,
  simStep,
  createCollider,
  prepareNextOpeningRoute,
} = createSoloBattleRuntimeAccess();
const battleWarm = createBattleWarmAccess();
const battleEntryAcquisition = createBattleEntryAcquisition();

// Resolve the remembered hero and begin its exact family transfers before
// renderer/garage construction. This overlaps network work with the staged
// boot without constructing a tank or touching WebGL ahead of startup order.
const selectedVehicle = createSelectedVehicleSelection({
  visibleIds: VISIBLE_TANK_IDS,
  defaultId: 'm1a3',
});
const bootSelectedBuilderP = STUDIO_BOOT_INTENT
  ? Promise.resolve()
  : ensureTankBuilder(selectedVehicle.id);

// scratch
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _rayO = new THREE.Vector3();

// ---------------------------------------------------------------------------
// BOOT STAGES (src/ui/bootScreen.ts)
//
// The module body below is a staged boot sequence: each heavy step runs inside
// bootStage(), which names the stage on the loading screen, yields a frame so
// the bar paints, runs the work, then advances the bar. Stage keys and their
// weights (measured shares of boot wall-clock) live in bootScreen.ts STAGES.
//
// `bootComplete` gates the render loop: the rAF-starvation fallback below
// registers its listeners mid-module and must never fire tick() while later
// top-level consts are still in their temporal dead zone.
// ---------------------------------------------------------------------------
const boot = createBootScreen({ mode: STUDIO_BOOT_INTENT ? 'studio' : 'garage' });
// Every UI surface consumes the same semantic viewport contract. Install it
// before HUD/garage construction so their first visible frame already has the
// correct width, height, orientation and interaction-mode attributes.
installResponsiveLayout();
let bootComplete = false;
const bootLifecycle = createBootLifecycle({ screen: boot, yieldFrame: nextFrame });
const BOOT_TIMINGS = bootLifecycle.timings;
const BOOT_T0 = bootLifecycle.startedAt;
const bootStage = bootLifecycle.run;
// ---------------------------------------------------------------------------
// Engine bootstrap (§4 startup order)
// ---------------------------------------------------------------------------
const container = document.getElementById('app');
if (!container) throw new Error('application root #app is missing');
boot.begin('renderer');
const renderer = createRenderer(container);
let graphicsContextLost = false;
let rearmRafAfterContext = () => {}; // installed when the main loop is ready
// MOBILE r2: GPU self-test + rescue ladder. The owner's iPhone renders every
// LIT mesh black (unlit sky/HUD fine) and no desktop browser reproduces it —
// so the device itself proves at boot which pipeline stage it can render,
// auto-disables shadow maps when only the depth-compare stage fails
// (flat-lit beats black), and ?diag=1 overlays verdicts + captured shader
// link errors so one phone screenshot names the fault. Runs BEFORE
// createLighting so the CSM compiles against the rescued state.
installShaderErrorCollector(renderer);
const _diag = runDeviceDiag(renderer);
const _diagRescue = applyDiagRescue(renderer, _diag);
const scene = new THREE.Scene();
const matchModeWorld = createMatchModeWorldPresentation(scene);
// The scene root is permanently identity. Leaving matrixAutoUpdate enabled
// marks it dirty every render and propagates `force=true` through every world
// and vehicle descendant, defeating the static-world matrix freeze below.
// Dynamic child roots still update themselves during the normal traversal.
scene.matrixAutoUpdate = false;
// zero-viewport boot hardening: booting inside a pane that has not laid out
// yet (innerWidth/innerHeight 0) used to seed a NaN aspect (0/0) that poisons
// the projection matrix; fall back to 16:9 — the first real layout re-derives
// it through the shared resize seam below.
const _bootVw = container.clientWidth || window.innerWidth;
const _bootVh = container.clientHeight || window.innerHeight;
const camera = new THREE.PerspectiveCamera(
  60, _bootVw > 0 && _bootVh > 0 ? _bootVw / _bootVh : 16 / 9,
  0.5, 4000,
);
bootLifecycle.completeManualStage('renderer', BOOT_T0);

const sky = await bootStage('sky', () => {
  const s = createSky(scene, renderer);
  s.bakeEnvironment();
  return s;
});
// Loading-budget r1: Verdant's sealed bay cannot see the cloud decks, while
// any outdoor Garage, battle, or direct Studio entry can need them immediately.
// Start their two deterministic canvas bakes now and overlap the remaining
// boot stages. ensureWorld still awaits the shared promise before activation.
const bootCloudWarmP = sky.ensureCloudTexturesChunked
  ? sky.ensureCloudTexturesChunked(() => nextFrame()).catch(() => {})
  : Promise.resolve();
const lighting: MainLightingRuntime = await bootStage(
  'lighting',
  () => createLighting(scene, camera, sky.sunDir),
);
// The sealed garage can only see the near/contact shadow bands. Request far
// dormancy now; lighting deliberately renders every native CSM depth map once
// before honoring it because all PCF samplers remain active in the shader.
// Subsequent garage frames skip the invisible 100-700 m shadow redraws.
if (!STUDIO_BOOT_INTENT) lighting.setFarCascadeDormant(true);
mountDiagOverlay({ tier: resolveDeviceTier(renderer), diag: _diag, rescue: _diagRescue, renderer });

const engineCtx = {
  renderer,
  scene,
  camera,
  setupShadowMaterial: (
    mat: THREE.Material,
    extraHook: THREE.Material['onBeforeCompile'] | null = null,
  ) => (
    lighting.setupShadowMaterial(mat, extraHook)
  ),
  releaseShadowMaterial: (mat: THREE.Material) => lighting.releaseShadowMaterial(mat),
  anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()),
  quality: 'high',
};
// --- MAP-CONFIG WIRING + DEFERRED WORLD BUILD ------------------------------
// Worlds are lazy-built per map config and cached. One typed runtime owns the
// active-world choice, atmosphere, collider/minimap readiness, GPU warm,
// dormancy and trace. Long-lived systems reach terrain through the stable
// proxy below, so a map switch — or a boot with no world at all — never leaves
// them holding a stale or missing heightfield.
//
// PERF (boot r8): the battlefield used to be built synchronously right here,
// on the boot-critical path, even though the garage bay is fully enclosed and
// cannot see a single triangle of it. The 1 km terrain bake + vegetation +
// props + minimap capture are now deferred to ensureWorld(), which the battle
// entry (behind the pre-battle loading screen) and the __SHOTS staging path
// call. Boot never touches them.
// Deterministic engineering captures keep the analytic terrain function.
// Ordinary live presentation uses the measured 1 m cache: its sub-centimeter
// error is below the rendered terrain grid while avoiding the complete
// multi-octave height stack in camera, HUD, FX and kill-cam hot paths.
let shotMode = false;
const _upNormal = new THREE.Vector3(0, 1, 0);
let worldRuntime: WorldActivationRuntime<MainWorld, RuntimeValue>;
let battleHudRuntime: MainBattleHudRuntime | null = null;
const currentWorld = () => worldRuntime?.current ?? null;
const currentHud = () => battleHudRuntime?.currentHud() ?? null;
const currentDamagePanel = () => battleHudRuntime?.currentDamagePanel() ?? null;
const hfProxy = createLiveHeightFieldProxy({
  getWorld: currentWorld,
  useExactHeight: () => shotMode,
  upNormal: _upNormal,
});

const garageIdleWorkCoordinator = createGarageIdleWorkCoordinator();
const garageFramePacer = createGarageFramePacer();
let garagePresentationDirty = true;
let invalidateGaragePresentation = () => { garagePresentationDirty = true; };
if (typeof window !== 'undefined') window.__GARAGE_IDLE_WORK = garageIdleWorkCoordinator.stats;
worldRuntime = createWorldActivationRuntime<
  MainWorld,
  RuntimeValue,
  MainWorld['config']['sky']
>({
  initialMapId: 'verdant',
  coordinatorDependencies: {
    engineContext: engineCtx,
    scene,
    renderer,
    deviceTier: getDeviceTier(),
    getGarageActivity: () => ({
      phase: game.phase,
      transitionActive: transition.active,
      lastActivityAt: garageDressingScheduler.getLastActivityAt(),
    }),
    loadModule: () => import('./world/map.ts'),
    releaseShadowMaterial: (resource) => lighting.releaseShadowMaterial(resource),
    acquireBackgroundWork: (kind, stillValid) =>
      garageIdleWorkCoordinator.acquire(kind, stillValid),
  },
  swapSceneWorld: (previous, next) => garagePhasePresentation.swapWorld(previous, next),
  setSceneWorldActive: (root, active) => garagePhasePresentation.setWorldActive(root, active),
  ensureCloudTextures: () => sky.ensureCloudTextures(),
  ensureCloudTexturesChunked: sky.ensureCloudTexturesChunked
    ? (yieldFrame) => sky.ensureCloudTexturesChunked?.(yieldFrame) ?? Promise.resolve()
    : undefined,
  awaitInitialCloudWarm: () => bootCloudWarmP,
  applySkyPreset: (skyConfig) => sky.applyPreset(skyConfig, scene),
  setSun: (skyConfig) => lighting.setSun(sky.sunDir, skyConfig),
  getFogDensity: () => scene.fog instanceof THREE.FogExp2 ? scene.fog.density : 0,
  onFogDensityChanged: (density) => { baseFogDensity = density; },
  canCreateCollider: () => isSoloBattleRuntimeReady(),
  createCollider: (next) => createCollider(game, next),
  placeGarage: () => garagePhasePresentation.place(),
  isMinimapReady: () => !!currentHud(),
  buildMinimap: (next, textured) => {
    const hud = currentHud();
    if (!hud) return;
    hud.buildMinimap(next.heightField, next.getMinimapFeatures(), next.config.minimap,
      textured ? minimapSnapCtx() : null);
  },
  loadMinimapAsset: (next, url) => (
    currentHud()?.buildMinimapFromAsset(next.heightField, url) ?? false
  ),
  compilePrograms: (root) => forwardProgramWarm.compile(root),
  linkerBreathingSlices: (maxSlices) => forwardProgramWarm.linkerBreathingSlices(maxSlices),
  updateShadowFrustums: () => lighting.updateFrustums?.(),
  warmShadowFrame: () => warmRender(),
  nextFrame,
  baseUrl: import.meta.env.BASE_URL || '/',
  publishActivationTrace: (trace) => { window.__WORLD_LOAD = trace; },
  publishMinimapTrace: (trace) => { window.__MINIMAP_LOAD = trace; },
});
const worldCache = worldRuntime.cache;
const residentLimits = worldRuntime.resourceLimits;
const worldPrefetchStats = worldRuntime.prefetchStats;
if (typeof window !== 'undefined') window.__WORLD_PREFETCH = worldPrefetchStats;
const loadWorldModule = worldRuntime.loadModule;
const prefetchWorld = worldRuntime.prefetch;
const cancelBackgroundWorldBuildsExcept = worldRuntime.cancelBackgroundExcept;

/** World raycast that is safe before any battlefield exists. */
function worldRaycast(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number) {
  return worldRuntime.raycast(origin, direction, maxDistance);
}

// --- game state + tanks -----------------------------------------------------
// Device QA: `?debug=1` opts a production build into the same bounded flight
// recorder used in development. The recorder remains a lazy chunk and has
// zero listeners/frame work for ordinary players; the explicit QA URL gives
// remote/mobile testers an optimized-build trace they can export themselves.
const diagnosticsRequested = import.meta.env.DEV || debugModeRequested() || navigator.webdriver;
const traceRequested = import.meta.env.DEV || debugModeRequested();
const devTrace = traceRequested
  ? (await import('./dev/perfTrace.ts')).createDevTrace({
    renderer,
    enabled: true,
    traceMode: import.meta.env.DEV ? 'development' : 'production-qa',
  })
  : null;
const bus = createBus(devTrace ? (ev, payload) => devTrace.event(ev, payload) : null);
installBattleRecords(bus);
const game: MainGameState = createGameState<
  MainEntity,
  NonNullable<MainGameState['spotting']>,
  HudMatchModeState
>();
const rosterPresentation = createRosterPresentation({
  getVehicleName: (specId) => getSpec(specId)?.name,
  getTier: tierNumeral,
});
const playerShellLog: PlayerShellTelemetryRecord[] = [];
const botPressure: BotPressureTelemetry = {
  enemyShells: 0,
  aimedAtPlayer: 0,
  hitsOnPlayer: 0,
  dmgOnPlayer: 0,
};
// Randomized rosters made the two-entry detached bot cache a poor hit-rate
// trade: it retained complete procedural tank graphs, paint canvases and GPU
// programs throughout the mostly-static Garage, yet usually missed the next
// battle's exact roster. The selected player visual still transfers directly
// into the pedestal; all other battle actors now release at the phase edge.
const battleVisualPool = createBattleVisualPool<BattleVisual>({
  capacity: 0,
});
game._battleVisualPool = battleVisualPool;
devTrace?.configure({ game });
spawnTanks(game, engineCtx);
// perf-r2f: handle of the in-flight chunked camo sweep startBattle kicks —
// The covered entry warm awaits it before the wreck dances (burnt bakes copy
// the camo canvases, so paint must be final first).
let camoSweepP = Promise.resolve();
let battleWarmPending = false;
let battleWarmGeneration = 0;

// --- fx ----------------------------------------------------------------------
// The complete particles/effects graph is battle-only. Parsing and building it
// during garage boot delayed first interaction and created GPU objects the
// garage could not display. Intent preloads the module; the opaque battle,
// Studio, and deterministic-shot entry gates below construct exactly one live
// instance before any consumer can emit an effect. The typed owner keeps code
// intent separate from GPU construction and makes either failure retryable
// without a page refresh.
const fxRuntimeAccess = createFxRuntimeAccess<MainFxModule, MainFxRuntime>({
  loadModule: () => import('./fx/effects.ts'),
  initialize: ({ createFx }) => {
    const live = createFx(engineCtx, hfProxy, {
      seed: 5000,
      // Decals must resolve every live struck entity in production. The old
      // window.__DEBUG lookup silently dropped all marks whenever diagnostics
      // were not installed, including incoming hits on the player's tank.
      resolveEntity: (targetId) => resolveFxSubject(String(targetId)),
    });
    live.bindBus(bus);
    // createPost runs during garage boot, before this demand-loaded graph
    // exists. Hand its late-composite activity/depth state to the existing
    // pass now; otherwise every layer-30 effect is simulated but invisible.
    post.attachLateFxState(live.group.userData.softParticles);
    return live;
  },
  activate: (live) => {
    scene.add(live.group);
  },
  suspend: (live) => {
    live.group.removeFromParent();
    // The pool graph remains reusable, but the inactive Garage must not retain
    // its battle-only buffers, textures, or shader programs. Three resources
    // are renewable after dispose(), and the covered battle warm restores the
    // exact authored graph before it can become visible again.
    releaseObject3DGpuResources(live.group, { preserveRoots: [scene] });
  },
});
const preloadFxModule = fxRuntimeAccess.preloadModule;
const ensureFxRuntime = fxRuntimeAccess.ensureRuntime;
function requireFxRuntime() {
  const live = fxRuntimeAccess.current;
  if (!live) throw new Error('combat effects runtime has not been acquired');
  return live;
}

// Per-wheel suspension: give every battle tank the live heightfield so road
// wheels conform to terrain (garage pedestal tank stays rigid on its disc).
// perf-r3b (stack-sampled): the per-wheel gear conform is the single hottest
// terrain consumer (~3.5 k queries/frame across a battle roster, each a
// 9-octave simplex stack). Live battles read the baked 1 m grid (≤ ~1 cm from
// analytic — tighter than the rendered mesh's own 2.7 m discretization);
// capture contexts (shotMode) and the pre-world boot keep the exact analytic
// path so the frozen screenshot/metrology contracts are byte-identical. The
// garage pedestal never conforms at all (rigid on its disc).
const groundSampler = (x: number, z: number) => {
  const world = currentWorld();
  return world && !shotMode && world.heightField.getHeightAtFast
    ? world.heightField.getHeightAtFast(x, z)
    : hfProxy.getHeightAt(x, z);
};
// PERF (performance_budget r4): pool visuals are lazy — remember the sampler
// on the game state so ensureTankVisual applies it to visuals built later.
game._groundSampler = groundSampler;
for (const ent of game.allTanks) {
  if (ent.visual && ent.visual.setGroundSampler) ent.visual.setGroundSampler(groundSampler);
}

// De-track visuals: thrown/repaired track bands follow the module state.
bus.on('module:state', (payload) => {
  if (typeof payload !== 'object' || payload === null) return;
  const moduleId = Reflect.get(payload, 'module');
  const entityId = Reflect.get(payload, 'id');
  const state = Reflect.get(payload, 'state');
  if ((moduleId !== 'trackL' && moduleId !== 'trackR') || typeof entityId !== 'string') return;
  const tank = game.tankById.get(entityId);
  if (tank?.visual?.setTrackState) tank.visual.setTrackState(moduleId, state === 'red');
});

// --- garage stage (12 m disc pad + 2 integration-owned spotlights) -----------
// Garage environments live at an isolated zero-height service coordinate.
// They never inherit the active battlefield's terrain, collision, or services.
GARAGE_POS.y = 0;
let selectedGarageVariantId = loadGarageVariantId();
const { stage: garageStage, dressing: garageDressing } = await bootStage('garage', async () => {
  const gs = createGarageStage(
    engineCtx,
    GARAGE_POS,
    selectedGarageVariantId,
    () => invalidateGaragePresentation(),
  );
  scene.add(gs.group);
  const gd = createGarageDressingAccess(engineCtx, GARAGE_POS, selectedGarageVariantId);
  scene.add(gd.group);
  // The access owner contributes only the final fill light at boot, preserving
  // the compiled light signature. Its authored workshop module and geometry
  // stream after readiness in the same quiet slices used by later repair bays.
  return { stage: gs, dressing: gd };
});
// FEEL r12: stable zero-work diagnostics facade. Explicit QA and automation
// acquire the exact existing HUD + telemetry owner near the ready boundary,
// after every dependency exists. Ordinary players never transfer either
// module and every frame call below remains a single null-checked no-op.
const perfHud = createPerfDiagnosticsAccess(async () => {
  const [{ createPerfHud }, { createDebugTelemetryOwner }] = await Promise.all([
    import('./ui/perfHud.ts'),
    import('./dev/debugTelemetry.ts'),
  ]);
  const telemetry = createDebugTelemetryOwner({
    renderer,
    scene,
    camera,
    lighting,
    post,
    game,
    getWorld: currentWorld,
    getNetworkTelemetry: () => networkSession.diagnostics(),
    resolvePresetName,
    getDeviceTier,
  });
  const hudRuntime = createPerfHud({ renderer, game, trace: devTrace });
  hudRuntime.setTelemetryProvider(telemetry.collect);
  devTrace?.configure({ getTelemetry: telemetry.collect });
  return { hud: hudRuntime, telemetry };
});
if (typeof window !== 'undefined') window.__PERF_HUD = perfHud;
// One typed phase owner keeps the Garage's authored neutral lighting exact,
// detaches its complete scene graph during battle, renews dressing GPU
// residency under the return veil, and re-seats every stage root together.
// Existing camera and pedestal owners remain the only pose solvers.
let garageEnvironmentPresentation: GarageEnvironmentPresentationRuntime;
// Before the showroom exists, the environment owner supplies one deterministic
// boot fallback. Afterwards every placement/variant/return transaction resets
// the same UI-aware showroom solver; no second camera path can win a frame.
let resetGarageShowroom: (() => boolean) | null = null;
let lastGarageProgramRoot: THREE.Object3D | null = null;
const garagePhasePresentation = createGaragePhasePresentationRuntime({
  scene,
  stageRoot: garageStage.group,
  dressingRoot: garageDressing.group,
  garagePosition: GARAGE_POS,
  lighting,
  sunDirection: sky.sunDir,
  getSkyConfig: () => {
    const variant = getGarageVariant(selectedGarageVariantId);
    return getGarageSkyPreset(variant.mapId);
  },
  getGroundHeight: () => 0,
  getPhase: () => game.phase,
  // Detached Garage roots have no render cost. Retain their uploaded programs
  // on normal desktops for an immediate battle exit; constrained/mobile
  // devices still reclaim them to protect the browser's smaller GPU budget.
  shouldReleaseGpuOnBattle: shouldReleaseInactivePhaseGpu,
  posePedestal: () => pedestal.poseCurrent(),
  poseCamera: () => {
    if (!resetGarageShowroom?.()) garageEnvironmentPresentation.poseCamera();
  },
  // Renderer ports are initialized before any covered return can run. The
  // engine owner splits restoration into paintable shadow/upload batches.
  restorePresentationGpu: async ({ resourcesReleased }) => {
    const programRoot = pedestal.current?.root ?? scene;
    const programsNeedWarm = resourcesReleased || lastGarageProgramRoot !== programRoot;
    const receipt = await restoreGarageGpuPipeline({
      renderer,
      scene,
      camera,
      lighting,
      programRoot,
      forwardPrograms: forwardProgramWarm,
      post,
      simDt: SIM_DT,
      resourcesReleased,
      programsNeedWarm,
    });
    lastGarageProgramRoot = programRoot;
    return receipt;
  },
});
const setGarageSpots = garagePhasePresentation.setActive;
const setGarageSunTrim = garagePhasePresentation.setSunTrim;
const placeGarage = garagePhasePresentation.place;
garageEnvironmentPresentation = createGarageEnvironmentPresentationRuntime({
  garagePosition: GARAGE_POS,
  getSelectedVariantId: () => selectedGarageVariantId,
  setWorldDormant,
  applySkyPreset: () => {
    const variant = getGarageVariant(selectedGarageVariantId);
    sky.applyPresentationPreset(getGarageSkyPreset(variant.mapId), scene);
  },
  placeGarage,
  setGarageSunTrim,
  invalidatePresentation: invalidateGaragePresentation,
  setCameraPose: (position, target, fovDegrees) => {
    rig.setExternalPose(position, target, fovDegrees);
  },
});

// The repair bays and component displays remain normal garage content, but
// their complete visual stream is owned by a typed quiet-window scheduler.
const requestQuietIdle = (callback: IdleRequestCallback) => {
  if (window.requestIdleCallback) return window.requestIdleCallback(callback);
  return setTimeout(callback, 800);
};
const garageDressingScheduler = createGarageDressingScheduler({
  dressing: garageDressing,
  getPhase: () => game.phase,
  isTransitionActive: () => transition.active,
  requestIdle: (callback) => requestQuietIdle(callback),
  scheduleDelay: (callback, delayMs) => setTimeout(callback, delayMs),
  acquireBackgroundWork: (kind, stillValid) =>
    garageIdleWorkCoordinator.acquire(kind, stillValid),
  onVisualChange: () => invalidateGaragePresentation(),
});
const scheduleGarageDressingBuild = garageDressingScheduler.schedule;

// Explicit Battle hover/focus and the covered roster handoff share one
// lifecycle owner. Passive Garage dwell is deliberately not Battle intent.
// Keeping the policy here used to expose
// several independent timers/generations in the composition root and made a
// Random-map hover race the eventual click. The typed runtime preserves the
// exact loaders and visuals while owning their ordering and cancellation.
const battleIntent = createBattleIntentRuntime({
  getBattleCount: () => game.battleCount,
  resolveMapId,
  loadWorldModule,
  prefetchWorld,
  ensureTankBuilders,
  planRoster: (specId) => planBattleParticipantIds(game, specId, true),
  getSpec,
  prebakeSharedTextures,
  createBudgetYield: createFrameBudgetYielder,
  anisotropy: engineCtx.anisotropy ?? 4,
  setCamoBiome,
  clearCamoOverrides,
  setCamoOverride,
  applyCamoPatterns: applyCamoPatternsChunked,
  preloadBattleVisuals: () => battleVisualStreamerAccess.preload(),
  preloadAudio: () => audio.preload(),
  preloadSettings: () => settings.preload(),
  preloadArmorOverlay: () => armorAimOverlay.preload(),
  preloadBattleHud: () => ensureBattleHud(),
  preloadTouchControls: () => ensureTouchControls(),
  preloadSoloBattle: () => preloadSoloBattleRuntime(),
  preloadBattleClient: () => preloadBattleClientRuntime(),
  preloadKillcam: () => preloadKillcamModule(),
  ensureFxRuntime,
  preloadMinimap: (mapId) => ensureBattleHud()
    .then(() => currentHud()?.preloadMinimapAsset(minimapAssetUrl(mapId))),
});

// Garage vehicle selection now crosses one typed lifecycle boundary. The
// runtime owns construction, shader submission, LRU residency, convergence,
// and visual handoff; main owns only the player's requested spec.
const pedestal = createGaragePedestalRuntime({
  scene,
  garagePosition: GARAGE_POS,
  podiumTopY: GARAGE_PODIUM_TOP_Y_M,
  trackAxisYawRad: GARAGE_TRACK_AXIS_YAW_RAD,
  residentLimit: residentLimits.pedestalVisuals,
  anisotropy: engineCtx.anisotropy ?? 4,
  createVisual: (specId, options) => createTank(specId, engineCtx, options),
  getSpec,
  ensureTankBuilder,
  ensureTankBuilders,
  prebakeSharedTextures,
  discardSharedTextures: discardPrebakedSharedTextures,
  createBudgetYield: createFrameBudgetYielder,
  // forwardProgramWarm is initialized before the first pedestal warm is
  // invoked; the closure keeps this early lifecycle declaration independent
  // of the later renderer-target owner.
  compilePrograms: (root) => forwardProgramWarm.compile(root),
  nextFrame,
  getDeviceTier,
  getPhase: () => game.phase,
  isBootComplete: () => bootComplete,
  getSelectedId: () => selectedVehicle.id,
  getNeighborIds: () => garage?.getNeighborIds?.(2) || [],
  getBattlePlayer: () => game.player,
  getBattleEntity: (specId) => game.tankById.get(specId),
  groundSampler,
  scheduleDelay: (callback, delayMs) => setTimeout(callback, delayMs),
  acquireBackgroundWork: (kind, stillValid) =>
    garageIdleWorkCoordinator.acquire(kind, stillValid),
  invalidatePresentation: () => invalidateGaragePresentation(),
  debugTarget: typeof window !== 'undefined' ? window : null,
});

const noteGarageActivity = () => {
  invalidateGaragePresentation();
  garageDressingScheduler.noteActivity();
  pedestal.invalidatePreload();
};
// Resize can arrive without pointer input (split view, orientation, browser
// chrome collapse). Treat it as presentation activity so the new viewport is
// painted immediately instead of waiting for the five-second safety frame.
for (const type of ['pointerdown', 'wheel', 'keydown', 'touchstart', 'resize']) {
  window.addEventListener(type, noteGarageActivity, { capture: true, passive: true });
}
// The garage hero uses the dedicated close-up preview tier. A 2048²/1024²
// repaint was visually redundant at showroom distance and added a large cold
// boot task (or, when deferred, an equally disruptive post-ready stall).
// Gallery inspection and battle-player paths still request their own authored
// quality tiers; this changes only the garage presentation cache.
await bootStage('vehicle', async () => {
  if (STUDIO_BOOT_INTENT) return;
  // The branded boot screen is opaque. Keep its animation painting at a
  // bounded cadence, but do not charge one entire display frame for every
  // procedural texture checkpoint in the selected hero's cold bake.
  const bootVehicleYield = createOpaqueLoadingYielder(12, 80);
  await pedestal.prepareInitial(selectedVehicle.id, {
    builderReady: bootSelectedBuilderP,
    yieldForBudget: bootVehicleYield,
  });
});
// LOADING PERF note (boot r9): a KHR_parallel_shader_compile overlap
// (renderer.compileAsync kicked here, awaited in the 'post' stage) was
// measured and REMOVED — headless/ANGLE A/B showed no repeatable win (the
// 'post' stage is dominated by the CSM cascade renders and the post-chain's
// own fullscreen-pass compiles, which compileAsync(scene, camera) does not
// cover), and compileAsync carries a known disposal race (camo_spotting r5).

// Canonical hero box (half-extents, metres) the showroom frames INSTEAD of
// each hull's own measured box — sized to the M1A2 reference (≈3.9 × 2.5 ×
// 9.9 m). Keeping it constant is the whole point: every vehicle is viewed
// from the same eye.
const GARAGE_FRAME_BOX = { hw: 1.95, hh: 1.25, hd: 4.95 };

// --- MAP-CONFIG WIRING: map switching --------------------------------------
function buildWorldMinimap(next: MainWorld, textured = true) {
  worldRuntime.buildMinimap(next, textured);
}

function prepareBattleWorldServices(next = currentWorld()) {
  worldRuntime.prepareBattleServices(next);
}

function switchMap(mapId: string) {
  return worldRuntime.switchMap(mapId);
}

function ensureWorld(
  mapId?: string | null,
  onProgress?: ((fraction: number, label: string) => void) | null,
  opts?: WorldActivationOptions | null,
) {
  return worldRuntime.ensure(mapId, onProgress, opts);
}

/**
 * GARAGE PERF (boot r8): make the battle world genuinely dormant while the
 * garage screen is up. Hiding the group drops its ~370 draw calls and 1.35 M
 * triangles from the main pass AND from every shadow cascade (three skips
 * invisible subtrees in the shadow render), and `worldDormant` also skips the
 * per-frame terrain-LOD / vegetation-wind / prop-animation update in tick().
 * The garage bay is fully sealed, so none of it was ever visible from there.
 * @param {boolean} on true = dormant (garage), false = live (battle/shots)
 */
function setWorldDormant(on: boolean) {
  worldRuntime.setDormant(on);
}

// hud_ui r6: live-scene handles for the minimap's one-time orthographic
// top-down capture (tanks hidden during the capture; ui falls back to the
// procedural cartography when absent).
function minimapSnapCtx() {
  return {
    renderer, scene,
    exclude: (game.tanks || []).flatMap((tank) => (
      tank.visual ? [tank.visual.root] : []
    )),
  };
}

// --- HUD / garage / panels ----------------------------------------------------
// boot r8: the minimap build (a real orthographic top-down capture of the
// battlefield) moved to activateWorld — the HUD is hidden in the garage, so
// nothing on the boot path can see it.
battleHudRuntime = createMainBattleHudRuntime({
  bus,
  engineContext: engineCtx,
  directionalHitValuesEnabled: () => !!input.getSettings().showDirectionalHitValues,
  queueMinimap: () => { worldRuntime.queueMinimap(); },
});
async function ensureBattleHud() {
  if (!battleHudRuntime) throw new Error('battle HUD runtime is not initialized');
  return battleHudRuntime.preload();
}
// Preserve the staged progress contract without transferring battle-only UI
// into a garage first visit. Battle intent/entry joins ensureBattleHud().
await bootStage('hud');

const garageMaps = [
  { id: 'random', name: t('map.random'), thumb: '', hero: '' },
  ...MAP_IDS.map((id) => ({
    id,
    name: getLocalizedMapName(id),
    thumb: MAP_THUMBS[id] || '',
    hero: MAP_HEROES[id] || '',
  })),
];
const networkComposition = createNetworkCompositionAccess(loadNetworkComposition);
const currentNetworkRoom = (): NetworkRoomCoordinator | null => (
  networkComposition.current?.room || null
);
const {
  loadPlayMenuModule,
  preloadNetworkBattleModules,
  preloadPrivateMatchHandoffModule,
  preloadDedicatedClientModule,
  preloadNetworkRoomChatModule,
} = createBattleModuleAccess();

const playSurface = createPlaySurfaceRuntime({
  loadMenuModule: loadPlayMenuModule,
  createMenuOptions: () => ({
      maps: garageMaps,
      vehicles: VISIBLE_TANK_IDS.map((id) => {
        const spec = getSpec(id);
        return { id, name: spec.name, tier: tankTier(id) };
      }),
      getSelection: () => ({
        specId: garage.getSelected(),
        mapId: garage.getSelectedMap(),
        equipment: loadSelectedEquipment(garage.getSelected(), getSpec(garage.getSelected())),
        camo: getMultiplayerCamoSelection(garage.getSelected()),
      }),
      getVehicleLoadout: (specId: string) => ({
        equipment: loadSelectedEquipment(specId, getSpec(specId)),
        camo: getMultiplayerCamoSelection(specId),
      }),
      isVehicleAllowed: (specId: string) => VISIBLE_TANK_IDS.includes(specId),
      isCamoAllowed: (camo: string) => isBuiltInCamoId(camo),
      getCamoName: (camo: string) => camoPatternLabels[camo] || 'Factory',
      getVehicleName: (specId: string) => getSpec(specId).name,
      onNetworkStart: beginNetworkBattle,
      onNetworkClose: (reason: string) => {
        const current = networkComposition.current;
        if (current) current.round.close(reason || 'room_closed');
        else networkSession.close(reason || 'room_closed');
      },
      onRankedStart: async (request) => (
        (await ensureNetworkComposition()).launcher.beginRanked(request)
      ),
      onLobbyChange: (context) => {
        const current = currentNetworkRoom();
        if (current) current.handleLobbyChange(context);
        else if (context) {
          void ensureNetworkComposition().then((runtime) => (
            runtime.room.handleLobbyChange(context)
          ));
        }
      },
  }),
  getSelectedSpecId: () => garage.getSelected(),
  getSelectedMapId: () => garage.getSelectedMap(),
  startSolo: (request) => beginSoloBattle(request),
  showActiveRoom: () => currentNetworkRoom()?.showActiveRoom() || false,
  preloadCommon: [
    ensureBattleHud,
    preloadFxModule,
    // killcam access is composed later in the battle-only section. Keep the
    // lazy port itself behind a closure so a pristine browser can finish the
    // composition root without touching its temporal-dead-zone binding.
    () => preloadKillcamModule(),
  ],
  preloadNetworkPresentation: () => Promise.all([
    ensureNetworkComposition().then((runtime) => runtime.presentation.preload()),
    preloadNetworkBattleModules(),
    preloadNetworkRoomChatModule(),
  ]),
  preloadPrivateMatch: preloadPrivateMatchHandoffModule,
  preloadDedicatedMatch: preloadDedicatedClientModule,
});

// Battle entry owns the play modal's visibility. Every player-facing entry
// path emits this event, so first matches, retained-room rematches, ranked,
// and solo all dismiss the operation picker before the next painted frame.
bus.on('ui:battleStart', () => {
  playSurface.hideForBattle();
});

const garage: MainGarageRuntime = await bootStage('ui', () => createGarage({
  specs: VISIBLE_TANK_IDS.map(getSpec),
  bus,
  onSelect: (specId: string) => {
    battleIntent.invalidateMapPlan();
    selectedVehicle.select(specId);
    pedestal.set(specId);
    applyCamoPatternsChunked({ priorityIds: [specId], onlySpecIds: [specId] });
    currentNetworkRoom()?.syncVehicle(specId);
    currentNetworkRoom()?.syncPendingLobbySelection();
  },
  onBattle: (specId, mapId, options) => (
    beginBattleEntry(specId, mapId, options)
  ), // loading screen owns entry
  onPlayRequest: (request) => playSurface.open(request).catch((error) => {
    console.error('[play-menu] failed to open', error);
  }),
  onPlayModeIntent: playSurface.preload,
  onBattleIntent: battleIntent.preload,
  onTankIntent: pedestal.preloadIntent,
  onStudioIntent: preloadStudioIntent,
  // MAP-CONFIG WIRING: every registered battlefield plus Random.
  maps: garageMaps,
  garageVariants: GARAGE_VARIANTS.map((variant) => ({
    ...variant,
    thumb: MAP_THUMBS[variant.mapId as keyof typeof MAP_THUMBS] || '',
    hero: MAP_HEROES[variant.mapId as keyof typeof MAP_HEROES] || '',
  })),
  selectedGarageVariantId,
  onGarageVariantMenuIntent: () => {
    // Opening the selector is a strong navigation intent. Warm one actual
    // outdoor pack behind the still-open menu so its shared shader/material
    // family and environment asset library cannot land on the first click.
    // Keep the bounded two-pack LRU contract: this is the first non-selected
    // outdoor choice, not an eager sweep across all nine environments.
    const previewWarmVariant = GARAGE_VARIANTS.find((variant) => (
      variant.id !== selectedGarageVariantId && variant.architecture !== 'field_shed'
    ));
    void Promise.all([
      garageStage.prepareSelector(),
      previewWarmVariant
        ? garageStage.prepareVariant(previewWarmVariant.id)
        : Promise.resolve(),
    ]).catch(() => undefined);
  },
  onGarageVariantIntent: (variantId: string) => {
    void garageStage.prepareVariant(variantId).catch(() => undefined);
  },
  onGarageVariantSelect: (variantId: string) => {
    selectedGarageVariantId = saveGarageVariantId(variantId);
    const variant = getGarageVariant(selectedGarageVariantId);
    garageStage.setVariant(selectedGarageVariantId);
    garageDressing.setVariant(selectedGarageVariantId);
    void garageEnvironmentPresentation.activate(variant.id);
    garageDressingScheduler.noteActivity();
    invalidateGaragePresentation();
  },
  // CAMO WIRING: per-tank paint picker — persists the choice and repaints the
  // shared albedo in place, so the pedestal tank updates immediately.
  camo: {
    patterns: CAMO_CATALOG_PATTERN_IDS,
    label: CAMO_PATTERN_LABEL,
    get: (specId: string) => getCamoSelection(specId),
    getCustom: (specId: string) => getCustomCamoSelection(specId),
    set: (specId: string, patternId: string) => {
      setCamoSelection(specId, patternId);
      // Keep the exact high-resolution paint, but yield the triggering UI
      // frame before a cold pattern bake instead of blocking the click.
      camoSweepP = applyCamoPatternsChunked({
        priorityIds: [specId], onlySpecIds: [specId],
      });
      currentNetworkRoom()?.syncCamo(specId);
      currentNetworkRoom()?.syncPendingLobbySelection();
    },
    setCustom: (specId, value) => {
      setCustomCamoSelection(specId, value);
      camoSweepP = applyCamoPatternsChunked({
        priorityIds: [specId], onlySpecIds: [specId],
      });
      // Deliberately sends Factory: custom paint is local single-player only.
      currentNetworkRoom()?.syncCamo(specId);
      currentNetworkRoom()?.syncPendingLobbySelection();
    },
  },
  // CAMO WIRING (r8): AUTO(map) tanks preview the pattern they will actually
  // wear on the highlighted battlefield. 'random' falls back to verdant
  // inside setCamoBiome; startBattle re-calls setCamoBiome(world.mapId) after
  // the roll, so battle state is always correct regardless.
  onMapSelect: (mapId: string) => {
    battleIntent.invalidateMapPlan();
    if (mapId !== 'random') worldRuntime.setPendingMapId(mapId);
    cancelBackgroundWorldBuildsExcept(mapId === 'random' ? null : mapId);
    setCamoBiome(mapId);
    // perf-r2f: chunked — the sync sweep froze the garage ~0.3-1.4 s PER
    // cached tank on a map-card click. The visible hero repaints in the
    // first slice; parked/roster entries follow one frame apart.
    applyCamoPatternsChunked({
      priorityIds: [selectedVehicle.id], onlySpecIds: [selectedVehicle.id],
    });
    currentNetworkRoom()?.syncPendingLobbySelection();
  },
}));

// Stable read-only diagnostics plus an explicit QA switch hook. Workshop
// verification can enumerate every environment and measure its lazily built
// real-fleet exhibits without leaking that policy into the composition root.
window.__GARAGE_WORKSHOP = createGarageWorkshopDiagnostics({
  variants: GARAGE_VARIANTS,
  garage,
  dressing: garageDressing,
  stage: garageStage,
  pedestal,
  environment: garageEnvironmentPresentation,
  phase: garagePhasePresentation,
  renderer,
  garagePosition: GARAGE_POS,
  podiumTopYM: GARAGE_PODIUM_TOP_Y_M,
  getRetainedWorldMapId: () => currentWorld()?.mapId || null,
  invalidatePresentation: invalidateGaragePresentation,
});

// PRE-BATTLE LOADING SCREEN (src/ui/battleLoad.ts): map art + both rosters +
// real build progress + countdown. Created here so its stylesheet/DOM is warm
// before the first BATTLE press.
const battleLoad = createBattleLoadScreen();

// STATE TRANSITIONS (src/ui/transition.ts): the shared branded veil/loading
// screen every non-battle state swap passes through — garage↔studio (wired
// through the studio ctx below) and battle→garage. Headless probes never see
// it (navigator.webdriver ⇒ synchronous no-op, per the screenshot contract).
const transition = createTransition();

// --- audio --------------------------------------------------------------------
const audio = await bootStage('audio', () => {
  const a = createLazyAudio();
  a.bindBus(bus);
  return a;
});

// --- camera rig -----------------------------------------------------------------
// One typed owner resolves both the camera anchor and the articulated physical
// bore. Solo, private-room and diagnostic presentation therefore share the
// same reticle, obstruction and penetration contract.
let playerBattleActions: PlayerBattleActions | null = null;
const {
  battleClient: battleClientAccess,
  rig,
  targetVisible: playerTargetVisible,
} = createCombatAimComposition({
  camera,
  heightField: hfProxy,
  getGame: () => game,
  worldRaycast,
  getShellCards: () => playerBattleActions?.shellCards || [],
});
const {
  aimController,
  computeDispersionRadM,
  shotRecoilScale,
  tankPoseFromState,
  traceTank,
  resolveShellHit,
  createCombatState,
  createShell,
  advancePreBattleCountdown,
  resolveVisiblePreBattleSeconds,
  mobileAutoAimCenter,
  pickMobileAutoAimTarget,
} = battleClientAccess;
const preloadBattleClientRuntime = battleClientAccess.preload;

// GARAGE SHOWROOM CAMERA: auto-framed hero pose + damped drag orbit
// (engine/cameraRig.ts createShowroomOrbit). This adapter owns the on/off
// latch, the canvas pointer wiring, and the per-frame pump — tick() runs it
// in the garage phase only, so shot staging ('shot') and battle keep their
// own camera owners. startBattle()/enterGarage() call stop()/start().
const showroom = createGarageShowroomRuntime({
  camera,
  rig,
  element: renderer.domElement,
  getSubject: () => pedestal.current?.root || null,
  getStageRect: () => (garage.getStageRect ? garage.getStageRect() : null),
  // Canonical front-right three-quarter camera: glacis toward the viewer,
  // bow and gun toward screen-left. All dimensions and camera
  // math remain owned by the existing engine solver; this root supplies only
  // scene anchors and the canonical vehicle-independent frame.
  heroYawRad: GARAGE_CAMERA_AZIMUTH_RAD,
  heroPitchRad: GARAGE_CAMERA_PITCH_RAD,
  fixedFrame: () => ({
    x: GARAGE_POS.x, y: GARAGE_POS.y + GARAGE_CAMERA_LOOK_HEIGHT_M, z: GARAGE_POS.z,
    hw: GARAGE_FRAME_BOX.hw, hh: GARAGE_FRAME_BOX.hh, hd: GARAGE_FRAME_BOX.hd,
  }),
  floorY: () => GARAGE_POS.y,
});
resetGarageShowroom = () => showroom.reset();

// Sniper close-quarters fill (gameplay_feel r1): with the camera at the gun
// trunnion, aiming into nearby shadowed/backfacing geometry (a bush wall, a
// building 5-10 m out) rendered a 100% black scope — zero feedback about the
// blockage. A small camera-riding point light, active only in SNIPER and only
// when the server-aim hit is CLOSE, keeps the obstacle readable exactly like
// WoT's scope does. Range-limited (18 m, quadratic decay) so it can never
// relight the midfield; intensity eases in below ~20 m aim distance.
const sniperFill = createSniperFillRuntime(scene, camera, rig);

// --- KILL-CAM (src/game/killcam.ts) -----------------------------------------
// End-of-battle cinematic: slow-mo tracer replay of the killing shell + x-ray
// module breakdown. Capture hooks live in the KILL-CAM sections of state.ts
// (game.killcam); the camera is driven only via rig.setExternalPose.
const killcamAccess = createKillcamAccess({
  loadModule: () => import('./game/killcam.ts'),
  initialize: ({ createKillCam }) => {
    type KillcamDependencies = Parameters<typeof createKillCam>[0];
    const live = createKillCam(checkedIntegrationPort<KillcamDependencies>({
      scene, camera, rig, heightField: hfProxy, getPlayer: () => game.player,
      getGame: () => game,
      getEntity: (id: string) => game.tankById.get(id),
      getWorld: currentWorld, // r6: flight-cam LOS solve (foliage/terrain/props)
      // Replay impact uses the real pooled destruction effects.
      getFx: () => fxRuntimeAccess.current,
    }, 'killcam', ['getPlayer', 'getGame', 'getEntity', 'getWorld', 'getFx']));
    live.bindBus(bus);
    // Solo fixed-step capture gets the direct implementation after entry;
    // main/debug consumers keep the stable access facade below.
    game.killcam = live;
    return live;
  },
});
const killcam = killcamAccess.presentation;
const preloadKillcamModule = killcamAccess.preloadModule;
const ensureKillcamRuntime = killcamAccess.ensureRuntime;
game.killcam = killcam;

/**
 * KILL-CAM: hide/show the battle HUD around a replay WITHOUT hud.setMode —
 * the hidden→battle mode round-trip resets the shot-info session stats, and
 * the end-of-battle report must survive the cinematic. The stats card lives
 * outside hud.root, so it gets its own visibility veil.
 * @param {boolean} on veiled (replay running)
 */
function veilHud(on: boolean) {
  // Studio and garage are valid before the battle-only HUD graph exists.
  battleHudRuntime?.veil(on);
}

// Discrete shell, ERA, camera-recoil, prop and Garage-residency reactions have
// one typed owner. Its callbacks resolve the late network session lazily, so
// the pristine composition root keeps the existing startup order.
createCombatFeedbackRuntime({
  bus,
  game,
  rig,
  audio,
  getFx: () => fxRuntimeAccess.current,
  hasNetworkMatch: () => !!networkSession.match,
  shotRecoilScale,
  setDestroyedEventSink,
  trimGarageTanks: (capacity: number) => pedestal.trim(capacity),
  getDeviceTier,
});

sky.applyFog(scene);
// High-zoom de-fog (WoT sniper behavior): remember the base density so the
// render loop can scale it by FOV without mutating the sky's baseline.
let baseFogDensity = scene.fog instanceof THREE.FogExp2 ? scene.fog.density : 0;
const post = createPost(renderer, scene, camera);
const viewport = createViewportRuntime({
  container,
  renderer,
  camera,
  post,
  lighting,
});
const forwardProgramWarm = createForwardProgramWarmOwner({
  renderer,
  scene,
  camera,
  getTarget: () => post?.composer?.renderTarget1 || null,
});
// Shader, FX, shadow, private-render-target, and deferred rollout warm state
// share one renderer-lifetime owner. Its lazy ports preserve the boot order:
// battle visuals and the frame owner may be declared later, but are only read
// behind covered Battle/Studio entry after the complete graph exists.
const combatWarmComposition = createCombatWarmComposition({
  game,
  renderer,
  scene,
  camera,
  post,
  lighting,
  battleWarm,
  forwardProgramWarm,
  getFx: requireFxRuntime,
  getWorld: currentWorld,
  getBattleVisuals: () => {
    if (!battleVisuals) throw new Error('battle visual streamer was not loaded');
    return battleVisuals;
  },
  getGeneration: () => battleWarmGeneration,
  setPending: (pending: boolean) => { battleWarmPending = pending; },
  prepareNextOpeningRoute: () => Boolean(prepareNextOpeningRoute(game)),
  ensureStagedVisuals: (count: number) => ensureStagedVisuals(game, count),
  prebakeBurntSteps,
  warmWreckTextures,
  createIsolatedForwardWarmBatches,
  scratch1: _v1,
  scratch2: _v2,
  scratch3: _v3,
  anisotropy: engineCtx.anisotropy ?? 4,
  noteFovPrimed: (fov: number) => mainFrame.noteFovPrimed(fov),
  simDt: SIM_DT,
  publishStudioTrace: (trace: RuntimeValue) => { window.__STUDIO_WARM = trace; },
  devTrace,
});
const {
  combatWarm,
  warmRender,
  deploymentShadowWarm,
} = combatWarmComposition;
const cancelDeferredCombatWarm = combatWarmComposition.cancelDeferred;
const scheduleDeferredCombatWarm = combatWarmComposition.scheduleDeferred;
// WebGL context restoration is recoverable in place. Three rebuilds its GL
// state first; we then step mobile down to the safe preset, trim optional
// residents, resize the post targets and redraw the shadow set. The sim stays
// frozen while the graphics device is unavailable instead of racing ahead
// behind a blocking warning or throwing away the battle with a page reload.
renderer.userData.contextRecovery = {
  onLost() {
    graphicsContextLost = true;
    garagePhasePresentation.invalidateGpu();
    post.setAdaptiveSuspended(true);
  },
  async onRestored() {
    // A restored WebGL context has no linked programs or uploaded buffers,
    // even though the JavaScript-side warm receipts survive. Invalidate every
    // renderer-lifetime combat latch so the next covered transition rebuilds
    // the exact production variants instead of trusting stale GPU state.
    combatWarmComposition.resetRendererWarmState();
    if (getDeviceTier() === 'mobile') {
      setMobilePresetName('mobile-low');
      pedestal.trim(1);
      worldRuntime.enforceCacheBudget();
    }
    await nextFrame();
    viewport.apply();
    post.resetAdaptiveResolution();
    lighting.update(true);
    if (game.phase === 'garage') {
      await garagePhasePresentation.restoreGpu();
      garagePresentationDirty = false;
    }
    graphicsContextLost = false;
    post.setAdaptiveSuspended(false);
    // Some mobile browsers discard the outstanding rAF when the WebGL device
    // is reclaimed. The loop's queued latch would then stay true forever even
    // though no callback exists. Cancel/re-arm explicitly after restoration;
    // restartRaf() owns the handle so a browser that retained it cannot create
    // a duplicate simulation/render loop.
    rearmRafAfterContext();
    return true;
  },
};
// Pixel-density state is workload-local. A pressured battle must never carry
// a reduced render scale back into the garage, and a fresh battle gets a new
// measured baseline instead of inheriting showroom cadence.
bus.on('phase:change', () => post.resetAdaptiveResolution());
// Map construction, roster painting and shader compilation intentionally
// create long frames behind an opaque screen. They are loading throughput,
// not gameplay performance, so exclude them from the live quality governor.
bus.on('ui:battleStart', () => post.setAdaptiveSuspended(true));

// ---------------------------------------------------------------------------
// End-of-battle overlay (integration-owned DOM)
// ---------------------------------------------------------------------------
const endOverlay = createEndOverlayRuntime({
  bus,
  onReturnToGarage: () => leaveBattleToGarage(),
});

// battle_hud r1 (owner): the always-visible LEAVE BATTLE button is GONE — a
// persistent exit control is not WoT battle chrome and it shadowed the
// minimap corner. Leaving stays one Esc away: the settings overlay (Esc, or
// the touch HUD's menu button) carries its red 'Leave Battle' row in every
// battle/spectator/end state (settings.ts canLeaveBattle/onLeaveBattle,
// wired below), and the end-of-battle overlay keeps RETURN TO GARAGE.

// ---------------------------------------------------------------------------
// Input — routed through the rebindable action layer (src/game/input.ts) and
// the settings panel (src/ui/settings.ts). Zoom is the zoomIn/zoomOut actions (wheel by default).
// ---------------------------------------------------------------------------
const debugFlags: { forceFire: boolean; lastEndFlow?: RuntimeValue } = { forceFire: false };
const battleResultPresentation = createBattleResultPresentationRuntime({
  game,
  killcam,
  rig,
  veilHud,
  showEndOverlay: endOverlay.show,
  emitPresented: (result: RuntimeValue) => bus.emit('battle:presented', { result }),
  exitPointerLock: () => { document.exitPointerLock?.(); },
  recordFlow: (receipt: RuntimeValue) => { debugFlags.lastEndFlow = receipt; },
});
const battlePhase = createBattlePhasePolicy({
  getPhase: () => game.phase,
  hasResult: () => !!game.result,
  hasControllablePlayer: () => !!(
    game.player?.combat && !game.player.combat.destroyed
  ),
  isKillcamActive: () => killcam.isActive(),
  isBattleLoadVisible: () => !!document.querySelector('.cot-bl.on'),
});

const input = createInput({ lockElement: renderer.domElement });
bus.on('ui:debugHud', (payload) => {
  const enabled = typeof payload === 'object' && payload !== null
    && Reflect.get(payload, 'on') === true;
  perfHud.setVisible(enabled);
});
const armorAimOverlay = createArmorAimOverlayAccess();
const battleVisualStreamerAccess = createBattleVisualStreamerAccess<MainGameState>({
  game,
  scene,
  renderer,
  anisotropy: engineCtx.anisotropy ?? 4,
  ensureTankBuilders,
  nextStagedBake,
  ensureStagedVisuals,
  getSpec,
  prebakeSharedTextures,
  armorAimOverlay,
  forwardProgramWarm,
  recordTiming(timing) {
    if (typeof window !== 'undefined') (window.__VISUAL_LOAD_TIMINGS ||= []).push(timing);
  },
});
let battleVisuals: BattleVisualStreamer<MainEntity> | null = null;
async function ensureBattleVisualStreamer() {
  battleVisuals = await battleVisualStreamerAccess.preload();
  return battleVisuals;
}
const settings = createSettingsAccess({
  input,
  bus,
  // A dead player is spectating even though the team battle continues. This
  // keeps pointer-unlock from opening settings over the death camera.
  isBattleActive: battlePhase.canOpenBattleSettings,
  canLeaveBattle: battlePhase.canLeaveBattle,
  onLeaveBattle: () => leaveBattleToGarage(),
  gearVisible: battlePhase.isGarage,
  // PAUSE: the overlay shows its PAUSED treatment exactly when opening it
  // freezes a live battle — same predicate the tick() pause gate derives its
  // livePaused from (kill-cam replays close the panel themselves; the end
  // overlay keeps the old non-paused Esc behavior).
  isGamePaused: battlePhase.isPauseEligible,
});
garage.attachSettingsControl(settings.gear);
const mobileBattleInput = createMobileBattleInputAccess<MainEntity>({
  input,
  bus,
  camera,
  isBattleActive: battlePhase.isBattle,
  openSettings: () => settings.open(),
  setSoundMuted: (muted) => audio.mute(muted),
  isSniper: () => rig.mode === 'SNIPER',
  getPhase: () => game.phase,
  getTanks: () => game.tanks,
  getPlayer: () => game.player,
  getTankById: (id) => game.tankById.get(id) || null,
  isVisible: playerTargetVisible,
  pickTarget: pickMobileAutoAimTarget,
  targetCenter: mobileAutoAimCenter,
});
const ensureTouchControls = mobileBattleInput.preload;
// The frame scheduler is created before the lazy Studio access boundary below
// and may deliver its first callback immediately (especially after Vite HMR).
// Keep a fully initialized inert presentation in place until that boundary is
// wired so frame/dev-trace getters can never cross a temporal dead zone.
let studio: ReturnType<typeof createStudioAccess>['presentation'] = Object.freeze({
  active: false,
  tick(_deltaSeconds: number) {},
});
devTrace?.configure({
  input,
  getContext: () => ({
    paused: settings.isOpen(),
    killcam: killcam.isActive(),
    shotMode,
    studio: !!studio?.active,
    cameraMode: rig.mode,
    renderScale: post.dynScale,
  }),
});

// Pointer-lock denial, recovery gestures, the cursor-aim notice, and touch
// refresh now have one typed listener/timer owner outside the composition root.
createPointerLockFeedbackRuntime({
  input,
  bus,
  canvas: renderer.domElement,
  audioResume: () => audio.resume(),
  isBattleStageVisible: battlePhase.isBattleStageVisible,
  canRecapturePointer: () => battlePhase.canRecapturePointer({
    settingsOpen: settings.isOpen(),
    spectating: !!killcam.spectate?.active,
  }),
  ensureTouchControls,
  nextFrame,
});

// Shell inventory, consumable cooldowns, special actions, and the exact
// local-versus-network command split have one typed, renderer-free owner.
// Its ports are stable battle-client facades, so garage boot still transfers
// no combat implementation and input remains inert outside a live battle.
playerBattleActions = createPlayerBattleActions({
  game,
  bus,
  input,
  isSettingsOpen: () => settings.isOpen(),
  network: {
    isActive: () => !!networkSession.match,
    queueConsumable: (slot) => networkSession.queueConsumable(slot),
    queueAction: (action) => networkSession.queueAction(action),
  },
  rules: {
    selectShell: battleClientAccess.selectShell,
    repairAllModules: battleClientAccess.repairAllModules,
    magazineReloadDenialReason: battleClientAccess.magazineReloadDenialReason,
    startMagazineReload: battleClientAccess.startMagazineReload,
    activateSpecialAction: battleClientAccess.activateSpecialAction,
    guidedMissileSlot: battleClientAccess.guidedMissileSlot,
    specialActionKind: battleClientAccess.specialActionKind,
    hasAmmunition: battleClientAccess.hasAmmunition,
    shellAmmunitionCapacity: battleClientAccess.shellAmmunitionCapacity,
    hasConsumableRule: battleClientAccess.hasConsumableRule,
    cooldownRemaining: battleClientAccess.cooldownRemaining,
    resetConsumableCooldowns: battleClientAccess.resetConsumableCooldowns,
    startConsumableCooldown: battleClientAccess.startConsumableCooldown,
    requestTankSelfRight: battleClientAccess.requestTankSelfRight,
  },
});
const playerFrameInput = createPlayerFrameInput({
  input,
  hasAmmo: playerBattleActions.hasAmmo,
  forceFire: () => !!debugFlags.forceFire,
});
const battlePresentation = createBattlePresentationRuntime({
  game,
  camera,
  scene,
  battleClient: battleClientAccess,
  getFx: () => fxRuntimeAccess.current,
  getWorld: currentWorld,
  isNetworkMatchActive: () => !!networkSession.match,
  getPedestalVisual: () => pedestal.current,
  isCinematicActive: () => rig.cinematicActive,
});
// The opaque deployment transition has one typed owner. main.ts coordinates
// acquisition and phase changes; this runtime owns the exact shader, shadow,
// terrain, FX and first-frame warm order plus cancellation/fallback policy.
const soloBattleDeployment = createSoloBattleDeploymentAccess({
  options: () => ({
    game,
    scene,
    camera,
    battleLoad,
    battleWarm,
    armorAimOverlay,
    forwardProgramWarm,
    combatWarm,
    post,
    lighting,
    createShell,
    getWorld: currentWorld,
    getBattleVisuals: () => {
      if (!battleVisuals) throw new Error('battle visual streamer was not loaded');
      return battleVisuals;
    },
    getFx: requireFxRuntime,
    getWarmRender: () => warmRender,
    getDeploymentShadowWarm: () => deploymentShadowWarm,
    getEntryLifecycle: () => battleEntryLifecycle,
    prepareRevealCamera: prepareBattleRevealCamera,
    getGeneration: () => battleWarmGeneration,
    advanceGeneration: () => ++battleWarmGeneration,
    setPending: (pending: boolean) => { battleWarmPending = pending; },
    setDestructionWarmed: combatWarmComposition.setDestructionWarmed,
    devTrace,
  }),
});
// The same persisted setting owns both F8 and the Interface switch. The lazy
// facade makes this available in production without adding ordinary-player
// transfer or per-frame work.
input.onAction('perfHud', () => {
  const next = !perfHud.isVisible();
  input.setSetting('showDebugHud', next);
  perfHud.setVisible(next);
});

// ---------------------------------------------------------------------------
// Game flow
// ---------------------------------------------------------------------------

// WoT-style player-path countdown after the opaque deployment transition.
const PRE_BATTLE_HOLD_S = 5;
const MIN_VISIBLE_PRE_BATTLE_S = 2;
const battleRollout = createBattleRolloutRuntime({
  game,
  bus,
  audio,
  getHud: currentHud,
  defaultPreBattleSeconds: PRE_BATTLE_HOLD_S,
});

// The solo battle loader is an opaque DOM surface. Rendering the newly
// activated 3D world behind it made ordinary `nextFrame()` budget yields pay
// the complete first world/shadow draw before the explicit offscreen warm,
// producing 0.5–1.4 s "Assembling rosters" stalls. Keep rAF alive for the
// loader/progress UI, but suppress redundant scene frames until the covered
// warm is complete and the loader is being dismissed.
// Headless probes drive the battle entry through __DEBUG.startBattle (which is
// synchronous) and skip the in-battle countdown (startBattle arms it only on
// the player path — see opts.preBattleHold). Player/network entry and the
// default-frame reveal share one typed lifecycle owner.
const battleEntryLifecycle = createBattleEntryLifecycle({
  nextFrame,
  getRevealContext: () => ({
    phase: game.phase,
    garageHidden: !garage.isOpen,
    loaderVisible: battleLoad?.visible === true,
  }),
  onReveal: (receipt) => {
    if (typeof window !== 'undefined') window.__BATTLE_REVEAL = receipt;
  },
});
const networkBattleIntentCover = createNetworkBattleIntentCover({
  battleLoad,
  rosterRows: rosterPresentation.lobbyRows,
  getMapPresentation: (mapId, fallback) => ({
    name: mapId ? getMapName(mapId) : fallback,
    thumb: mapId ? mapHeroes[mapId] || mapThumbs[mapId] || '' : '',
    biome: mapId || 'none',
  }),
  coverRendering: battleEntryLifecycle.coverRendering,
  uncoverRendering: battleEntryLifecycle.uncoverRendering,
});
const soloBattleStart = createSoloBattleStartAccess({
  options: () => ({
    state: {
      game,
      getPendingMapId: () => worldRuntime.pendingMapId,
      setSelectedSpecId: selectedVehicle.set,
      rememberSpecId: selectedVehicle.remember,
      setShotMode: (value: boolean) => { shotMode = value; },
      setCaptureHidden: (value: boolean) => perfHud.setCaptureHidden(value),
      setSimulationAccumulator: () => { battleFrame.resetSimulationAccumulator(); },
      setCamoSweep: (work: Promise<void> | void) => { camoSweepP = Promise.resolve(work); },
    },
    world: {
      resolveMapId,
      switchMap,
      getActive: () => {
        const world = currentWorld();
        if (!world) throw new Error('solo battle start requires an active world');
        return world;
      },
      setDormant: setWorldDormant,
      scheduleBlackWatchdog: () => {
        if (!navigator.webdriver) {
          setTimeout(() => runSceneBlackWatchdog(renderer, scene, camera), 1800);
        }
      },
    },
    round: {
      getFx: requireFxRuntime,
      settings,
      killcam,
      armorAim: armorAimOverlay,
      resetDriveAim: () => driveTestController.resetAim(),
      setCamoBiome,
      lendPlayerVisual: (specId: string) => pedestal.lendToBattle(specId),
      setupBattle,
      combatWarm,
      presentation: battlePresentation,
      applyPlayerCamo: (specId: string) => applyCamoPatterns(specId),
      applyRosterCamo: applyCamoPatternsChunked,
    },
    ui: {
      hud: {
        shotInfo: { setPlayer: (playerId: string) => currentHud()?.shotInfo.setPlayer(playerId) },
        setMode: (mode: HudMode) => currentHud()?.setMode(mode),
      },
      playerActions: playerBattleActions,
      damagePanel: {
        setTank: (spec: DamagePanelSpec, visual: DamagePanelVisual) => (
          currentDamagePanel()?.setTank(spec, visual)
        ),
        setEquipment: (equipment: DamagePanelEquipment) => (
          currentDamagePanel()?.setEquipment(equipment)
        ),
      },
      hideGarage: () => garage.hide(),
      hideEndOverlay: endOverlay.hide,
      resetBattleResult: () => battleResultPresentation.reset(),
      setGarageLighting: (active: boolean) => {
        setGarageSpots(active);
        setGarageSunTrim(active);
      },
      emitPhaseChange: (phase: string) => bus.emit('phase:change', { phase }),
      emitConsumableReset: () => bus.emit('ui:consumableReset', {}),
      rig,
      stopShowroom: () => showroom.stop(),
      openBattle: battleRollout.open,
    },
    recordTrace: (trace: RuntimeValue) => {
      if (typeof window !== 'undefined') window.__START_BATTLE_TIMINGS = trace;
    },
  }),
});
const soloBattleLoading = createSoloBattleLoadingAccess({
  options: () => ({
    game,
    post,
    battleIntent,
    battleLoad,
    audio,
    acquisition: battleEntryAcquisition,
    deployment: soloBattleDeployment,
    lifecycle: battleEntryLifecycle,
    getPendingMapId: () => worldRuntime.pendingMapId,
    getMapName,
    loadMapConfig: (mapId: string) => import('./world/maps/index.ts')
      .then(({ getMapConfig }) => getMapConfig(mapId)),
    getMapThumb: (mapId: string) => mapHeroes[mapId] || mapThumbs[mapId] || '',
    hasCachedWorld: (mapId: string) => !!worldCache.get(mapId),
    getWorld: () => {
      const world = currentWorld();
      if (!world) throw new Error('solo battle loading requires an active world');
      return world;
    },
    ensureWorld,
    ensureBattleVisuals: ensureBattleVisualStreamer,
    getBattleVisuals: () => {
      if (!battleVisuals) throw new Error('battle visual streamer was not loaded');
      return battleVisuals;
    },
    ensureBattleHud,
    preloadMinimap: (mapId: string) => ensureBattleHud()
      .then(() => currentHud()?.preloadMinimapAsset(minimapAssetUrl(mapId))),
    ensureTouchControls,
    preloadSettings: () => settings.preload(),
    preloadArmorAim: () => armorAimOverlay.preload(),
    planRoster: (specId: string, randomRoster: boolean) =>
      planBattleParticipantIds(game, specId, randomRoster),
    planCamoOverrides: (specId: string, mapId: string, randomRoster: boolean) =>
      planBattleCamoOverrides(game, specId, mapId, randomRoster),
    ensureTankBuilders,
    preloadSoloAuthority: preloadSoloBattleRuntime,
    preloadBattleClient: preloadBattleClientRuntime,
    preloadBattleWarm: () => battleWarm.preload(),
    preloadBattleStart: () => soloBattleStart.preload(),
    ensureKillcam: ensureKillcamRuntime,
    ensureFx: ensureFxRuntime,
    startBattle: soloBattleStart.start,
    prepareBattleWorldServices,
    getPedestalVisual: () => pedestal.current,
    prebakeSharedTextures,
    anisotropy: engineCtx.anisotropy ?? 4,
    rosterRows: (team: string) => rosterPresentation.battleRows(game.tanks, team),
    warmShotCards: (specIds: readonly string[]) => currentHud()?.warmShotCards(specIds),
    getCamoSweep: () => camoSweepP,
    prepareRevealCamera: prepareBattleRevealCamera,
    resolveVisiblePreBattleSeconds,
    preBattleHoldSeconds: PRE_BATTLE_HOLD_S,
    minimumVisiblePreBattleSeconds: MIN_VISIBLE_PRE_BATTLE_S,
    openBattle: battleRollout.open,
    scheduleDeferredWarm: scheduleDeferredCombatWarm,
    nextFrame,
    createLoadingYielder: createOpaqueLoadingYielder,
  }),
});

/**
 * Establish the exact camera pose that the loader fade will reveal. Covered
 * warm-up frames and pointer-lock acquisition can leave aim deltas queued;
 * the render loop drains those deltas while battleLoad.covering is true, so
 * this pose remains unchanged until the loader has fully left the viewport.
 */
function prepareBattleRevealCamera() {
  if (!game.player || !game.player.state) return;
  rig.release();
  rig.snapArcade(2, game.player.state.yaw, -10 * DEG);
}
const networkSession = createNetworkBrowserSessionRuntime({
  getPlayer: () => game.player,
  isBattleActive: battlePhase.isBattle,
  shouldPresentDisconnect: battlePhase.shouldPresentDisconnect,
  nextFrame,
});

// Persistent subject-owned FX resolve against the presentation entity the
// player actually sees. Network entities take priority during online battles;
// solo falls back to the fixed-step roster.
function resolveFxSubject(id: string) {
  return networkSession.resolveEntity(id) || game.tankById.get(id) || null;
}

/**
 * Acquire the room/lobby/entry policy only after explicit multiplayer intent.
 * Solo hover and entry stay on the original local path without transferring or
 * evaluating network orchestration. A failed cold import is retryable, which is
 * essential for first-visit clients on unstable mobile connections.
 */
function ensureNetworkComposition(): Promise<NetworkBattleCompositionRuntime> {
  return networkComposition.preload();
}

/**
 * Preserve the launcher's synchronous cover-before-first-await contract when
 * the composition was already acquired by room intent. Avoiding an `async`
 * wrapper here is deliberate: even awaiting an already-resolved promise would
 * defer the loading veil by one microtask and expose a Garage frame.
 */
function beginNetworkBattle(request?: PrivateBattleLaunchRequest): Promise<boolean> {
  const current = networkComposition.current;
  if (current) return current.launcher.beginPrivate(request);
  networkBattleIntentCover.show(request);
  return ensureNetworkComposition()
    .then((runtime) => runtime.launcher.beginPrivate(request))
    .catch(async (error) => {
      await networkBattleIntentCover.releaseAfterFailure();
      throw error;
    });
}

function loadNetworkComposition(): Promise<NetworkBattleCompositionRuntime> {
  return import('./net/networkBattleComposition.ts').then(({
    createNetworkBattleComposition,
  }) => {
    if (!playerBattleActions) {
      throw new Error('Network composition requires player battle actions.');
    }
    return createNetworkBattleComposition({
      round: {
        game,
        session: networkSession,
      },
      presentation: {
        load: {
          battleLoad,
          audio,
          lighting,
          ensureBattleVisuals: ensureBattleVisualStreamer,
          nextFrame,
          recordTrace: (trace: RuntimeValue) => {
            if (typeof window !== 'undefined') window.__NETWORK_LOAD = trace;
          },
          setAdaptiveSuspended: (value: boolean) => post.setAdaptiveSuspended(value),
        },
        roster: {
          getMap: (mapId: string) => {
            return {
              name: getMapName(mapId),
              thumb: mapHeroes[mapId] || mapThumbs[mapId] || '',
              biome: mapId,
            };
          },
          rows: (players, team, viewerId) => (
            rosterPresentation.lobbyRows({ players }, team, viewerId)
          ),
          vehicleName: (specId: string) => getSpec(specId)?.name || specId,
          emitBattleStart: (payload) => bus.emit('ui:battleStart', payload),
          setCamoBiome,
        },
        entry: {
          acquire: (options) => battleEntryAcquisition.acquireNetwork(options),
          loadModules: () => Promise.all([
            preloadNetworkBattleModules(),
            preloadBattleClientRuntime(),
            ensureBattleHud(),
            ensureTouchControls(),
            armorAimOverlay.preload().catch((error) => {
              console.warn('[loading] Optional armor overlay unavailable:', error);
              return null;
            }),
            ensureFxRuntime(),
            ensureKillcamRuntime(),
            battleWarm.preload(),
            audio.warmBattleEvents(),
          ]).then(([modules]) => modules),
          loadWorld: (mapId: string, onProgress: (fraction: number, label: string) => void) => (
            ensureWorld(mapId, onProgress)
          ),
          publishMatch: (match) => networkSession.publishMatch(match),
          getMatch: () => networkSession.match,
        },
        bridge: {
          installInputRuntime: (factory) => { networkSession.ensureInputRuntime(factory); },
          createStatus: (factory) => factory(),
          publishStatus: (status) => networkSession.publishStatus(status),
          attachRecovery: () => networkSession.attachRecovery(),
          create: (factory, request, spectator) => factory({
            engineCtx,
            game,
            bus,
            viewerId: request.viewerId,
            spectator,
            worldCollision: currentWorld(),
            clearVehicleDecals: (visual) => requireFxRuntime().clearVehicleDecals(visual),
          }),
          publish: (bridge) => networkSession.publishBridge(bridge),
          groundSampler,
          waitForInitialSnapshot: (request) => networkSession.waitForInitialSnapshot(request),
          waitForPeerReadiness: () => networkSession.waitForPeerReadiness(),
        },
        warm: {
          getFx: requireFxRuntime,
          terrain: () => {
            const world = currentWorld();
            if (!world) throw new Error('network terrain warm requires an active world');
            return battleWarm.warmBattleTerrainTiles({
              game, world, yieldForBudget: createFrameBudgetYielder(16),
            });
          },
          wrecks: (bridge) => battleWarm.warmNetworkWrecks({
            entities: bridge.entities.values(),
            prebakeBurntSteps,
            anisotropy: engineCtx.anisotropy ?? 4,
            renderer,
            scene,
            camera,
            compilePrograms: (root: THREE.Object3D) => forwardProgramWarm.compile(root),
            warmRender,
          }),
          openingEffects: (fx, bridge) => {
            let decalVisual: { root: THREE.Object3D } | null = null;
            for (const entity of bridge.entities.values()) {
              const root = entity.visual?.root;
              if (root instanceof THREE.Object3D) {
                decalVisual = { root };
                break;
              }
            }
            return battleWarm.warmNetworkOpeningEffects({
              fx,
              post,
              camera,
              shells: game.shells,
              decalVisual,
              compilePrograms: (root: THREE.Object3D) => forwardProgramWarm.compile(root),
              warmRender,
            });
          },
          shotCards: (specIds: readonly string[]) => currentHud()?.warmShotCards(specIds),
          compile: async () => {
            forwardProgramWarm.compile(scene);
            for (const _ of forwardProgramWarm.linkerBreathingSlices(24)) await nextFrame();
          },
        },
        presentation: {
          setGarageLighting: (active: boolean) => {
            setGarageSpots(active);
            setGarageSunTrim(active);
          },
          runBlackWatchdog: () => runSceneBlackWatchdog(renderer, scene, camera),
        },
      },
      launcher: {
        lifecycle: battleEntryLifecycle,
        battleLoad,
        audio,
        getMatch: () => networkSession.match,
        getWorldCollision: currentWorld,
        getMapPresentation: (mapId: string | null, fallback: string) => {
          if (!mapId) return { name: fallback, thumb: '', biome: 'none' };
          return {
            name: getMapName(mapId) || fallback,
            thumb: mapHeroes[mapId] || mapThumbs[mapId] || '',
            biome: mapId,
          };
        },
        rosterRows: rosterPresentation.lobbyRows,
        emitBattleStart: (payload) => bus.emit('ui:battleStart', payload),
        loadPrivateMatch: preloadPrivateMatchHandoffModule,
        loadDedicatedMatch: preloadDedicatedClientModule,
        enterGarage: () => garageReturn.enter(),
        setNetworkStatus: (status) => networkSession.status?.set(status),
        recordEntryFailure: (failure) => {
          if (typeof window !== 'undefined') window.__NETWORK_ENTRY_FAILURE = failure;
        },
      },
      // Joined-room intent is stronger than browsing the picker but weaker than
      // a round start. Only new roster builders and a fixed selected map warm.
      lobby: {
        getGamePhase: () => game.phase,
        preloadVisuals: () => battleVisualStreamerAccess.preload(),
        preloadBattleModules: preloadNetworkBattleModules,
        preloadChat: preloadNetworkRoomChatModule,
        ensureTankBuilders,
        loadWorldModule,
        cancelBackgroundWorldBuildsExcept,
        prefetchWorld,
      },
      room: {
        getMatch: () => networkSession.match,
        getPlayMenu: playSurface.getMenuPromise,
        loadRoomChat: preloadNetworkRoomChatModule,
        getPhase: () => game.phase,
        isSettingsOpen: () => settings.isOpen(),
        hasResult: () => !!game.result,
        isKillcamActive: () => killcam.isActive(),
        isSpectator: () => networkSession.spectator,
        input,
        setGarageStatus: (status) => garage.setRoomStatus(status),
        emitRoomState: (payload) => bus.emit('network:roomState', payload),
        equipmentFor: (specId: string) => loadSelectedEquipment(specId, getSpec(specId)),
        camoFor: getMultiplayerCamoSelection,
      },
      activation: {
        game,
        settings,
        killcam,
        // Engineering-only controller is created after ordinary boot
        // composition; keep this port lazy so startup never crosses its TDZ.
        driveTest: { resetAim: () => driveTestController.resetAim() },
        getHud: currentHud,
        playerActions: playerBattleActions,
        getDamagePanel: currentDamagePanel,
        rig,
        presentation: {
          setShotMode: (value: boolean) => { shotMode = value; },
          setCaptureHidden: (value: boolean) => perfHud.setCaptureHidden(value),
          setNetworkSpectator: (value: boolean) => networkSession.setSpectator(value),
          setSelectedSpecId: selectedVehicle.set,
          rememberSpecId: selectedVehicle.remember,
          setWorldDormant,
          getWorld: currentWorld,
          setCamoBiome,
          hideGarage: () => garage.hide(),
          hideEndOverlay: endOverlay.hide,
          resetBattleResult: () => battleResultPresentation.reset(),
          setGarageSpots,
          setGarageSunTrim,
          emitPhaseChange: (phase) => bus.emit('phase:change', { phase }),
          emitConsumableReset: () => bus.emit('ui:consumableReset', {}),
          stopShowroom: () => showroom.stop(),
        },
      },
    });
  });
}

bus.on('phase:change', () => currentNetworkRoom()?.syncChatVisibility());

function beginBattleEntry(
  specId: string,
  mapId: string | null = null,
  options: SoloBattleLoadingStartOptions | undefined = undefined,
) {
  return soloBattleEntry.begin(specId, mapId, options);
}

/**
 * Keep bot play on the original in-page simulation path. Multiplayer's
 * authority, snapshot bridge, prediction, WebRTC, and signaling modules are
 * intentionally absent here: loading them for a local battle duplicated work
 * without adding any useful authority boundary.
 */
async function beginSoloBattle({
  specId,
  mapId,
  randomRoster = true,
  gameMode = 'standard',
}: SoloBattleEntryRequest = {}) {
  return soloBattleEntry.beginSelected({ specId, mapId, randomRoster, gameMode });
}

/** QA-only cold entry. Production paths already own a loading veil and call
 * the activation owner only after the selected world and roster builders are ready. */
async function debugStartBattle(
  specId: string,
  mapId: string | null = null,
  opts: Record<string, RuntimeValue> = {},
) {
  const { startDebugBattle } = await import('./dev/debugBattleEntryRuntime.ts');
  return startDebugBattle({
    getPendingMapId: () => worldRuntime.pendingMapId,
    resolveMapId,
    ensureFullFleet,
    ensureWorld: (nextMapId) => ensureWorld(nextMapId, null, { precompile: false }),
    preloadSoloAuthority: preloadSoloBattleRuntime,
    preloadBattleClient: preloadBattleClientRuntime,
    ensureBattleHud,
    ensureTouchControls,
    preloadArmorAim: () => armorAimOverlay.preload(),
    ensureFx: ensureFxRuntime,
    ensureKillcam: ensureKillcamRuntime,
    preloadBattleWarm: () => battleWarm.preload(),
    preloadBattleStart: () => soloBattleStart.preload(),
    prepareWorldServices: () => prepareBattleWorldServices(currentWorld()),
    startBattle: (nextSpecId, nextMapId, options) => (
      soloBattleStart.start(nextSpecId, nextMapId, options)
    ),
  }, specId, mapId, opts);
}

// Returning from battle or Studio is one typed transaction. It owns the
// teardown order, retained-room policy, transition coalescing, and rematch
// sequencing while main supplies concrete browser/rendering adapters.
const garageReturn = createGarageReturnAccess<BattleVisual>({
  options: () => ({
  game,
  getSelectedSpecId: () => selectedVehicle.id,
  presentation: {
    setAdaptiveSuspended: (suspended: boolean) => post.setAdaptiveSuspended(suspended),
    clearBattle: () => {
      armorAimOverlay.clear();
      battleResultPresentation.clearPending();
      killcam.cancel();
      if (killcam.spectate?.active) killcam.spectate.stop(true);
      veilHud(false);
      // cancel() can flush a buffered report, so hide battle UI afterward.
      currentHud()?.setMode?.('hidden');
      endOverlay.hide();
    },
    resetBattleTank: () => resetBattleTankForGarage({
      fx: { resetAll: () => fxRuntimeAccess.current?.resetAll() },
      visual: game.player?.visual,
    }),
    suspendEffects: () => { fxRuntimeAccess.suspendRuntime(); },
    setShotMode: (enabled: boolean) => { shotMode = enabled; },
    setCaptureHidden: (hidden: boolean) => perfHud.setCaptureHidden(hidden),
    unfreezeEffects: () => fxRuntimeAccess.current?.setFrozen(false),
    resetHudFrame: () => battleHudFrame.reset(),
  },
  network: {
    shouldPreserveRoom: () => currentNetworkRoom()?.shouldPreserveOnBattleExit() ?? false,
    disposePresentation: () => networkComposition.current?.round.disposePresentation(),
    closeMatch: (reason: string) => {
      const current = networkComposition.current;
      if (current) current.round.close(reason);
      else networkSession.close(reason);
    },
  },
  warm: {
    invalidate: () => { battleWarmGeneration += 1; },
    cancel: cancelDeferredCombatWarm,
    setPending: (pending: boolean) => { battleWarmPending = pending; },
  },
  work: {
    noteActivity: () => garageDressingScheduler.noteActivity(),
    resetFramePacer: (nowMs: number) => garageFramePacer.reset(nowMs),
    scheduleDressing: scheduleGarageDressingBuild,
  },
  world: {
    currentMapId: () => currentWorld()?.mapId || null,
    ensureGaragePlacement: () => garageEnvironmentPresentation.activate(selectedGarageVariantId),
    setDormant: (dormant: boolean) => setWorldDormant(dormant),
    setFarCascadeDormant: (dormant: boolean) => lighting.setFarCascadeDormant(dormant),
    clearCamoOverrides,
  },
  roster: {
    adoptBattlePlayer: (specId: string) => pedestal.adoptBattlePlayer(specId)
      ? pedestal.current as BattleVisual
      : null,
    clearBattle: (preservedVisual: BattleVisual | null) => clearBattleAfterExit<BattleVisual>({
      game,
      preservedVisual,
      visualPool: battleVisualPool,
    }),
    repaintHero: (specId: string) => applyCamoPatternsChunked({
      priorityIds: [specId], onlySpecIds: [specId],
    }),
  },
  settings,
  ui: {
    setGarageSpots,
    setGarageSunTrim,
    emitGaragePhase: () => bus.emit('phase:change', { phase: 'garage' }),
    hideEndOverlay: endOverlay.hide,
    exitPointerLock: () => { if (document.exitPointerLock) document.exitPointerLock(); },
    hideHud: () => currentHud()?.setMode?.('hidden'),
    showGarage: (specId: string) => garage.show(specId),
    poseGarageCamera: garageEnvironmentPresentation.poseCamera,
    startShowroom: () => showroom.start(),
    triggerBattle: () => document.querySelector<HTMLElement>('.cot-battle')?.click(),
  },
  audio,
  transition,
  restoreGaragePresentation: async () => {
    const receipt = await garagePhasePresentation.restoreGpu();
    garagePresentationDirty = false;
    return receipt;
  },
  isBattleEntryPending: () => battleEntryLifecycle.pending,
  isBattleEntryCovering: () => battleLoad.covering,
    publishTrace: (trace: RuntimeValue) => { window.__GARAGE_ENTRY = trace; },
  }),
});
const enterGarage = garageReturn.enter;
const leaveBattleToGarage = garageReturn.leave;
const soloBattleEntry = createSoloBattleEntryRuntime({
  lifecycle: battleEntryLifecycle,
  loading: soloBattleLoading,
  battleLoad,
  audio,
  enterGarage,
  nextFrame,
  isVisibleSpecId: (specId: string) => VISIBLE_TANK_IDS.includes(specId),
  getSelectedSpecId: () => garage.getSelected(),
  getSelectedMapId: () => garage.getSelectedMap(),
});

bus.on('ui:battleAgain', garageReturn.battleAgain);

bus.on('ui:roomOpen', async () => {
  await playSurface.showCurrentRoom();
});

bus.on('ui:roomReady', (payload) => {
  const ready = typeof payload === 'object' && payload !== null
    && Reflect.get(payload, 'ready') === true;
  currentNetworkRoom()?.setReady(ready);
});

bus.on('ui:roomStart', () => currentNetworkRoom()?.startRound());

// ---------------------------------------------------------------------------
// HUD frame assembly (§4 step 7)
// ---------------------------------------------------------------------------
// Spectator perspective, spotting disclosure, aiming, armor inspection, and
// damage presentation share one allocation-free typed transaction. Capture
// tooling receives the same retained frame instead of building a second HUD.
const battleHudFrame = createBattleHudFrameRuntime({
  game,
  camera,
  rig,
  input,
  aimController,
  armorAimOverlay,
  networkSession,
  killcam,
  muzzleScratch: _rayO,
  getHud: currentHud,
  getDamagePanel: currentDamagePanel,
});
const frameInfo = battleHudFrame.frameInfo;
const refreshSpotFrame = battleHudFrame.refreshSpotting;

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------
// A typed, allocation-free owner samples every device and publishes the one
// mutable camera-input record consumed by the existing rig.
const camInput = playerFrameInput.camera;
const audioListener = createListenerPoseRuntime({ camera, game, rig, killcam, audio });
const worldFramePresentation = createWorldFramePresentationRuntime({
  camera,
  rig,
  getWorld: currentWorld,
  isWorldDormant: () => worldRuntime.dormant,
  getCameraFocus: () => game.player ||
    (networkSession.spectator ? rig.spectateTargetEnt : null),
});
// Pause transitions, input sampling, network cadence, pre-battle hold,
// fixed-step debt, result progression, and presentation interpolation are one
// typed state machine. The render loop consumes only its stable receipt.
const battleFrame = createBattleFrameRuntime({
  game,
  settings,
  killcam,
  input: playerFrameInput,
  network: {
    isActive: () => !!networkSession.match,
    pump: (dtSeconds: number, nowMs: number) => networkSession.pump(dtSeconds, nowMs),
  },
  countdown: {
    isWarmPending: () => battleWarmPending,
    advance: advancePreBattleCountdown,
    show: (seconds: number) => currentHud()?.preBattleCountdown(seconds),
    rollout: () => bus.emit('battle:rollout', {}),
  },
  presentation: {
    captureSoloPose: battlePresentation.captureSoloPoses,
    update: battlePresentation.update,
    updateResult: battleResultPresentation.update,
  },
  getRigMode: () => rig.mode,
  stepSimulation: () => simStep(
    game, bus, currentWorld(), rig, worldRuntime.collider,
  ),
  emitPause: (paused: boolean) => bus.emit('ui:pause', { on: paused }),
  simulationDt: SIM_DT,
});
const pauseInfo = battleFrame.pauseInfo;
// controls_gunnery r5: true while the current __SHOTS view staged a live HUD
// frame (player_view / sniper_view) — those views re-run hud.update each
// shot-mode frame so the reticle canvas stays live (forceHitMark etc.).
let shotHudFrame = false;

const mainFrame = createMainFrameRuntime({
  scene,
  camera,
  game,
  scheduleFrame: () => frameLoop.schedule(),
  isGraphicsContextLost: () => graphicsContextLost,
  battleEntryLifecycle,
  getFx: () => fxRuntimeAccess.current,
  getWorld: currentWorld,
  getBaseFogDensity: () => baseFogDensity,
  getStudio: () => studio,
  getShotMode: () => shotMode,
  getShotHudFrame: () => shotHudFrame,
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
  isBattleLoadCovering: () => battleLoad.covering === true,
  isPresentationRestoreCovering: () => garagePhasePresentation.restoringGpu,
  cameraInput: camInput,
  getMobileAutoAim: mobileBattleInput.getAutoAim,
  rig,
  killcam,
  veilHud,
  worldFramePresentation,
  matchModeWorld,
  audioListener,
  isGaragePresentationDirty: () => garagePresentationDirty,
  clearGaragePresentationDirty: () => { garagePresentationDirty = false; },
  perfHud,
  trace: devTrace,
});

// rAF-STARVATION FALLBACK (embedded panes): some embedded Chromium panes
// report visibilityState 'hidden' PERMANENTLY (while still focused, receiving
// real input events and compositing on demand) and never deliver
// requestAnimationFrame — a purely rAF-driven loop means the sim never steps,
// the 250 ms fire-press buffer expires before it is ever sampled, and the
// game reads as "controls dead". Two rescue paths drive the very same tick:
//  1. a 100 ms interval while the hidden document still claims focus (hidden
//     pages clamp intervals to >= 1 s, hence also path 2) — a genuinely
//     backgrounded tab (no focus) keeps the classic full freeze;
//  2. real input events (they arrive unthrottled): each pumps a tick so a
//     click is simulated long before its 250 ms fire edge can expire. These
//     listeners register AFTER the input layer's own (same target + phase,
//     registration order), so the pumped tick samples the fresh press.
// rAF re-arming is latched (rafQueued) so fallback ticks can never stack
// extra rAF callbacks for a speed burst when frames come back.
const frameLoop = createFrameLoopScheduler({
  tick: mainFrame.tick,
  isBootComplete: () => bootComplete,
  // The authoritative simulation is fixed at 60 Hz. Presenting the complete
  // post/shadow pipeline above that rate only doubles GPU work on 120 Hz /
  // ProMotion displays without creating additional simulation states.
  maximumFrameRate: 60,
  // A settled, room-free Garage is event-driven. CSS/UI transitions remain
  // browser-owned; the complete Three.js clock wakes for camera motion,
  // vehicle swaps, transition coverage, loading, input, or retained network
  // authority, and otherwise runs only its five-second safety paint.
  shouldUseIdleCadence: () => bootComplete && battlePhase.isGarage() &&
    !battleEntryLifecycle.renderingCovered && !transition.active &&
    !studio.active && !shotMode && !showroom.moving &&
    !pedestal.switchPending && !networkSession.match,
  idleIntervalMs: 5000,
});
rearmRafAfterContext = frameLoop.restart;
invalidateGaragePresentation = () => {
  garagePresentationDirty = true;
  garageFramePacer.noteActivity(performance.now());
  lighting.setStaticPresentationDormant(false);
  frameLoop.restart();
};
bus.on('phase:change', () => frameLoop.restart());

// Deterministic engineering captures keep a synchronous discovery facade for
// screenshot tooling, while the orchestration and recipes stay out of every
// ordinary garage/battle download until set() is explicitly called.
window.__SHOTS = {
  views: [...SHOT_VIEWS],
  async set(name: string) {
    if (!isShotViewName(name)) {
      throw new Error(`Unknown screenshot view: ${name}`);
    }
    const { setShotView } = await import('./dev/shotRuntime.ts');
    type ShotRuntimeContext = Parameters<typeof setShotView>[1];
    return setShotView(name, checkedIntegrationPort<ShotRuntimeContext>({
      preloadSoloBattleRuntime,
      preloadBattleClientRuntime,
      ensureBattleHud,
      ensureTouchControls,
      ensureFullFleet,
      ensureFxRuntime,
      ensureKillcamRuntime,
      preloadBattleWarm: () => battleWarm.preload(),
      preloadArmorAimOverlay: () => armorAimOverlay.preload(),
      switchMap,
      setWorldDormant,
      setCamoBiome,
      applyCamoPatterns,
      setupBattle,
      resetCombatWarm: () => combatWarm.reset(),
      drainCombatWarm: () => combatWarm.drain(),
      buildShellCards: playerBattleActions.setTank,
      setDamagePanelTank: (spec: DamagePanelSpec, visual: DamagePanelVisual) => (
        currentDamagePanel()?.setTank(spec, visual)
      ),
      setDamagePanelEquipment: (equipment: DamagePanelEquipment) => (
        currentDamagePanel()?.setEquipment(equipment)
      ),
      groundSampler,
      input,
      settings,
      showroom,
      setShotMode: (value: boolean) => { shotMode = value; },
      setCaptureHidden: (value: boolean) => perfHud.setCaptureHidden(value),
      resetPostPerfTrims: () => post.resetPerfTrims(),
      setShotHudFrame: (value: boolean) => { shotHudFrame = value; },
      setGarageSpots,
      setGarageSunTrim,
      hideGarage: () => garage.hide(),
      hideEndOverlay: endOverlay.hide,
      setLastFov: mainFrame.noteFovPrimed,
      refreshSpotFrame,
      getWorld: currentWorld,
      getHud: currentHud,
      getFx: () => fxRuntimeAccess.current,
      getKillcam: () => killcam,
      getShellCards: () => playerBattleActions.shellCards,
      getSelectedSpecId: () => selectedVehicle.id,
      game,
      frameInfo,
      rig,
      camera,
      lighting,
      scene,
      scratch1: _v1,
      scratch2: _v2,
      scratch3: _v3,
      computeDispersionRadM,
      bus,
      setPedestalTank: pedestal.set,
      garage,
      garageDressing,
      tankPoseFromState,
      traceTank,
      createShell,
      resolveShellHit,
      createCombatState,
    }, 'shot runtime', [
      'ensureFullFleet', 'ensureFxRuntime', 'ensureKillcamRuntime',
      'switchMap', 'setupBattle', 'getWorld', 'getHud', 'getFx', 'getKillcam',
    ]));
  },
};

// ---------------------------------------------------------------------------
// Boot: garage first, warm the pipeline, then declare readiness.
// ---------------------------------------------------------------------------
// No battle roster or player entity exists on the Garage boot path. Prime the
// shell-card presentation from the selected spec; the solo/network start
// owners replace it with the real player after covered roster construction.
playerBattleActions.setTank(getSpec(selectedVehicle.id));
garage.show(selectedVehicle.id);
garageEnvironmentPresentation.poseCamera(); // fallback pose until the orbit measures the hero
showroom.start();
garageFramePacer.reset(performance.now());
setGarageSunTrim(true); // camo_spotting r2: boot lands on the garage screen
currentHud()?.setMode('hidden');

// BOOT DEFERRAL seam: the battlefield build is deferred until BATTLE is
// pressed, so `world` is legitimately null on the garage boot path — the
// garage bay renders without it. When a world IS already active (harness
// staging a battlefield view before readiness), warm it as before.
const bootWorld = currentWorld();
if (bootWorld) {
  bootWorld.update(0, camera.position);
  battlePresentation.update();
}
await bootStage('post', async () => {
  // Direct Studio boot has no garage hero or dressing to present. Its own
  // covered entry renders the real world/camera before the boot veil lifts.
  if (STUDIO_BOOT_INTENT) return;
  await warmGarageGpuPipeline({
    renderer,
    scene,
    camera,
    lighting,
    forwardPrograms: forwardProgramWarm,
    post,
    timings: BOOT_TIMINGS,
    reportProgress: (fraction: number) => boot.sub(fraction),
    simDt: SIM_DT,
  });
});
// PERF (performance_budget r1): the combat-pipeline warms below are needed
// before FIRST COMBAT, not before readiness — they used to run synchronously
// ahead of __GAME_READY and billed ~120 ms straight onto load-to-ready.
// Deferred to post-ready idle; combatWarm.drain() is idempotent and
// battle entry runs it synchronously as a first-combat fallback if no idle
// slice arrived first (immediate battle entry, backgrounded tab).
//
// - wreck warm: the first kill of a battle otherwise pays the burnt-material
//   program compile + burnt/ember texture uploads inside a combat frame
//   (probe measured 125 ms at first blood). renderer.compile is
//   view-independent, so compiling against the garage-staged pool is valid.
// - fx warm: flipbook/atlas textures otherwise upload inside the
//   first-contact combat frame (muzzle flash, tracer, impact, smoke).
// Light-set, shared FX, private HDR target, and deployment shadow warming are
// owned by combatWarmComposition. Heavy combat caches remain absent from the
// interactive Garage and Studio only prepares effects it can actually use.

// Heavy combat caches intentionally do not warm in the interactive garage or
// the Studio. Battles own the complete roster/wreck/shadow warm; Studio uses
// the focused shared-FX warm above and compiles only actors it actually adds.

// SCENE STUDIO (staging rig + scripted marketing-shot API, src/game/studio.ts):
// entered via ?studio=1 (map via ?map=…) or F8 from the garage; scriptable via
// window.__STUDIO (schema in docs/STUDIO.md). main.ts only hands it these
// integration seams plus the one tick() branch above — entry keys, panel,
// actors, effects, capture all live in the studio module.
const studioAccess = createStudioAccess({
  loadModule: () => import('./game/studio.ts'),
  preloadFxModule,
  ensureFxRuntime,
  prepareRuntime: () => lighting.setFarCascadeDormant(false),
  createContext: (studioFx: RuntimeValue) => ({
    renderer, scene, camera, post, lighting, game, hud: currentHud(), garage, showroom,
    hfProxy, getWorld: currentWorld,
    ensureWorld: (id: string, onProgress: (fraction: number, label: string) => void) => ensureWorld(id, onProgress, {
      precompile: false,
      compilePrograms: true,
      services: false,
    }),
    setWorldDormant,
    setGarageSpots, setGarageSunTrim, enterGarage,
    warmStudioPipeline: combatWarmComposition.warmStudioPipeline,
    transition,
    // main.ts owns both direct boot and the first lazy F8 handoff.
    autoEnter: false,
    fx: studioFx,
  }),
  getPhase: () => game.phase,
  keyTarget: window,
});
studio = studioAccess.presentation;
function preloadStudioIntent() { studioAccess.preloadIntent(); }
function loadStudioRuntime() { return studioAccess.loadRuntime(); }

if (!STUDIO_BOOT_INTENT) {
  // Capture owns the first F8/navigation click until the Studio chunk exists;
  // createStudio installs the permanent toggle listener after import.
  studioAccess.installKeyboard();
}

if (STUDIO_BOOT_INTENT) {
  await bootStage('studio', async () => {
    const runtime = await loadStudioRuntime();
    return runtime.enter({
      map: STUDIO_BOOT_MAP,
      coveredByBoot: true,
      onProgress: (fraction: number, label: string) => {
        boot.sub(fraction);
        if (label) boot.note(label);
      },
    });
  });
}

bootComplete = true;
frameLoop.schedule();
if (!STUDIO_BOOT_INTENT && selectedGarageVariantId !== 'verdant_motor_pool') {
  // Keep the normal Verdant boot fast. A persisted outdoor choice hydrates
  // after readiness and never presents the removed synthetic map diorama.
  void garageEnvironmentPresentation.activate(selectedGarageVariantId);
}

// ---------------------------------------------------------------------------
// Debug / drive-test hooks (not part of the screenshot contract).
// ---------------------------------------------------------------------------

const driveTestRequested = import.meta.env.DEV
  || debugModeRequested()
  || navigator.webdriver;
const driveTestController = createDriveTestAccess({
  enabled: driveTestRequested,
  options: () => ({
    getGame: () => game,
    getWorld: currentWorld,
    getRig: () => rig,
    getCollider: () => worldRuntime.collider,
    bus,
    input,
    aimController,
    debugFlags,
    playerShellLog,
    heightField: hfProxy,
    simStep,
    resetPresentationPoses: battlePresentation.resetSoloPoses,
    resetSimAccumulator: battleFrame.resetSimulationAccumulator,
  } satisfies DriveTestControllerOptions),
});
if (driveTestRequested) await driveTestController.preload();

if (diagnosticsRequested) {
  const { installMainDiagnosticsRuntime } = await import('./dev/mainDiagnosticsRuntime.ts');
  await installMainDiagnosticsRuntime({
    telemetry: {
      enabled: true,
      bus,
      getGame: () => game,
      getPinnedTargetId: () => driveTestController.aimTargetId,
      getAimBlockedDistance: () => frameInfo.aim.blockedDistM,
      playerShellLog,
      botPressure,
    } satisfies CombatTelemetryOptions,
    perfHud,
    showDebugHud: debugModeRequested() || input.getSettings().showDebugHud,
    debugSurface: {
      scene, camera, renderer, post, lighting, game, rig, bus, input, settings,
      pauseInfo, garage, flags: debugFlags, frameInfo, playerShellLog, botPressure,
      killcam, showroom, garageDressing, devTrace,
      quality: {
        resolvePresetName, resolveAutoTier, reportSustainedOverload,
        setPresetName, setMobilePresetName, noteGpuRenderer,
      },
      getFx: () => fxRuntimeAccess.current,
      getPedestalVisual: () => pedestal.current,
      isPedestalOnStage: () => pedestal.isOnStage(),
      getSelectedSpecId: () => selectedVehicle.id,
      getPedestalCacheIds: () => [...pedestal.cacheIds],
      getWorldCacheIds: () => [...worldCache.keys()],
      getResidentLimits: () => ({ ...residentLimits }),
      getBattleVisualPoolStats: () => battleVisualPool.stats(),
      getGarageFramePacerStats: () => ({ ...garageFramePacer.stats }),
      getFrameLoopSchedulerStats: () => ({ ...frameLoop.stats }),
      getPhaseSceneResidency: () => garagePhasePresentation.diagnostics().scene,
      getGarageGpuResidency: () => garagePhasePresentation.diagnostics().gpu,
      getLastWorldRelease: () => (worldRuntime.lastRelease
        ? { ...worldRuntime.lastRelease } : null),
      isGraphicsContextLost: () => graphicsContextLost,
      selectGarageTank: (id: string) => garage.setSelected(id),
      stagePedestalTank: (id: string) => {
        selectedVehicle.set(id);
        return pedestal.set(id, true);
      },
      getWorld: currentWorld,
      switchMap,
      aimAtNearest: driveTestController.aimAtNearest,
      gunAimError: driveTestController.gunAimError,
      aimState: driveTestController.aimState,
      fastForward: driveTestController.fastForward,
      slayEnemies: driveTestController.slayEnemies,
      startBattle: debugStartBattle,
      bakeMinimapForMap: async (mapId: string) => {
        await ensureBattleHud();
        const next = await ensureWorld(mapId, null, { precompile: false, services: false });
        buildWorldMinimap(next, true);
        return currentHud()?.exportMinimapBackground('image/webp', 0.92) || '';
      },
      beginBattleEntry,
      beginSoloBattle,
      beginNetworkBattle,
      enterGarage,
      leaveBattleToGarage,
      spawnKillShell: driveTestController.spawnKillShell,
      getShotMode: () => shotMode,
      setShotMode: (value: boolean) => { shotMode = !!value; },
      forceHitMark: async (bounced: boolean) => {
        await ensureBattleHud();
        currentHud()?.forceHitMark(!!bounced);
      },
      getDamagePanel: currentDamagePanel,
      getNetworkDiagnostics: () => networkSession.diagnostics(),
      getNetworkPresentationStats: () => (
        networkSession.bridge?.getPresentationEventStats?.() || null
      ),
      collectTelemetry: () => perfHud.collectTelemetry(),
      sampleShadowContribution: () => perfHud.sampleShadowContribution(),
      injectNetworkEvents: (events: RuntimeValue) => {
        const latestNetworkSnapshot = networkSession.latestSnapshot;
        if (!import.meta.env.DEV || !networkSession.bridge || !latestNetworkSnapshot) return false;
        const batch = Array.isArray(events) ? events : [];
        const matchEnded = batch.find((event) => event?.type === 'match_ended');
        const snapshot = matchEnded
          ? { ...latestNetworkSnapshot,
            meta: { ...latestNetworkSnapshot.meta, result: matchEnded.result } }
          : latestNetworkSnapshot;
        networkSession.bridge.apply(snapshot, 1 / 60, batch);
        return true;
      },
    } satisfies DebugSurfaceDependencies,
  });
}
await bootStage('ready', null);
// perf-r2: the boot pipeline is compiled and error-checked; battle-time
// program links (lazy fx/wreck/killcam materials) drop the synchronous
// info-log wait from here on (see deviceDiag.relaxShaderChecks — ?diag keeps
// full checks for diagnosis runs).
relaxShaderChecks(renderer);
// ready() arms the "press any key" entry gate (auto-dismissed under
// ?nosplash / webdriver). Deliberately not awaited: __GAME_READY means
// "fully initialised" and must not depend on a keypress.
const entryReady = boot.ready();
if (pendingRoomInvitePromise) {
  Promise.all([entryReady, pendingRoomInvitePromise]).then(([, invite]) => {
    if (!invite) return;
    return playSurface.open({
      mode: invite.mode,
      invite: { ...invite, autoJoin: true },
    });
  }).catch((error) => {
    console.error('[room-invite] failed to open', error);
  });
}
window.__GAME_READY = true;
pedestal.queueNeighbors();
if (!STUDIO_BOOT_INTENT) scheduleGarageDressingBuild();
window.__BOOT_TIMINGS = BOOT_TIMINGS;
window.__BOOT_MS = Math.round(performance.now() - BOOT_T0);
// Direct Studio navigation skips garage-only construction on the critical
// path. Build the workshop shell while idle; enterGarage() resumes the normal
// quiet set-piece stream if the user later leaves Studio for the garage.
if (STUDIO_BOOT_INTENT) {
  requestQuietIdle(async () => {
    await garageDressing.pump();
    if (!pedestal.current) await pedestal.set(selectedVehicle.id, true);
  });
}
// MOBILE r3: black-scene watchdog — the owner's iPhone passes every synthetic
// probe yet renders the REAL scene's lit meshes black. Sample the actual
// garage frame shortly after ready; if the lit band reads black, shadows-off
// rescue + recompile (deviceDiag.ts). Skipped under webdriver so harness
// captures stay deterministic; a second check runs at battle start.
if (!navigator.webdriver || new URLSearchParams(location.search).has('diagforce')) {
  setTimeout(() => runSceneBlackWatchdog(renderer, scene, camera), 1200);
  // MOBILE r5: if the boot probe turned shadows off (one-boot false-negatives
  // happen — the owner's phone), try them back on once the live scene proves
  // healthy; keep only if the measured frame stays healthy (deviceDiag.ts).
  setTimeout(() => reclaimShadows(renderer, scene, camera), 3400);
}
