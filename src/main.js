/**
 * main.js — integration entry point (ARCHITECTURE.md §4, §5).
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
import { createRenderer } from './engine/renderer.ts';
import { createOffscreenSceneWarmer } from './engine/offscreenWarm.ts';
import {
  installShaderErrorCollector, relaxShaderChecks, runDeviceDiag, applyDiagRescue,
  mountDiagOverlay, runSceneBlackWatchdog, reclaimShadows,
} from './engine/deviceDiag.js';
import {
  resolveDeviceTier, resolvePresetName, resolveAutoTier,
  reportSustainedOverload, setPresetName, setMobilePresetName,
  noteGpuRenderer, getDeviceTier,
} from './engine/quality.js';
import { createSky } from './engine/sky.js';
import { createLighting } from './engine/lighting.js';
import { createPost } from './engine/post.js';
import { createCameraRig } from './engine/cameraRig.js';
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
import { warmGarageGpuPipeline } from './engine/garageGpuWarmRuntime.ts';
import { createIsolatedForwardWarmBatches } from './engine/deploymentWarm.ts';
import { createDeploymentShadowWarmOwner } from './engine/deploymentShadowWarm.ts';
// DESTRUCTIBLES r1: prop-destruction bus seam (audio subscribes to the event)
import { setDestroyedEventSink } from './world/destructibles.js';
import { MAP_IDS, getMapConfig, resolveMapId } from './world/maps/index.js';
import { createWorldActivationRuntime } from './world/worldActivationRuntime.ts';
import { createLiveHeightFieldProxy } from './world/liveHeightFieldProxy.ts';
import { MAP_HEROES, MAP_THUMBS } from './ui/mapThumbs.ts';
import { VISIBLE_TANK_IDS, getSpec } from './vehicles/specs.js';
import {
  createTank, ensureFullFleet, ensureTankBuilder, ensureTankBuilders,
} from './vehicles/fleetFactory.js';
// CAMO WIRING: pattern persistence + live repaint (garage picker, AUTO biome)
import {
  CAMO_PATTERN_IDS, CAMO_PATTERN_LABEL, getCamoSelection, setCamoSelection,
  getCustomCamoSelection, setCustomCamoSelection, getMultiplayerCamoSelection,
  setCamoBiome, setCamoOverride, applyCamoPatterns, applyCamoPatternsChunked,
  clearCamoOverrides, warmWreckTextures,
  prebakeSharedTextures, prebakeBurntSteps, discardPrebakedSharedTextures,
} from './vehicles/materials.js';
import { createBattleHudAccess } from './ui/battleHudAccess.ts';
import { createGarage } from './ui/garage.js';
import { installBattleRecords } from './game/profile.ts';
import {
  createGarageStage, GARAGE_PODIUM_TOP_Y_M, GARAGE_TRACK_AXIS_YAW_RAD,
} from './ui/garageStage.js';
import { createGarageDressingAccess } from './game/garageDressingAccess.ts';
import { createGarageDressingScheduler } from './game/garageDressingScheduler.ts';
import { createGaragePedestalRuntime } from './game/garagePedestalRuntime.ts';
import { createGarageShowroomRuntime } from './game/garageShowroomRuntime.ts';
import { createGarageIdleWorkCoordinator } from './game/garageIdleWorkCoordinator.ts';
import { createGarageReturnRuntime } from './game/garageReturnRuntime.ts';
import { createGaragePhasePresentationRuntime } from './game/garagePhasePresentationRuntime.ts';
import { createBattleIntentRuntime } from './game/battleIntentRuntime.ts';
import { createKillcamAccess } from './game/killcamAccess.ts';
import { createPlayerBattleActions } from './game/playerBattleActions.ts';
import { createPlayerFrameInput } from './game/playerFrameInput.ts';
import { createBattleFrameRuntime } from './game/battleFrameRuntime.ts';
import { createBattlePresentationRuntime } from './game/battlePresentationRuntime.ts';
import { createBattleHudFrameRuntime } from './game/battleHudFrameRuntime.ts';
import { createMatchModeWorldPresentation } from './game/matchModeWorldPresentation.ts';
import { createBattleResultPresentationRuntime } from './game/battleResultPresentationRuntime.ts';
import { createSoloBattleDeploymentRuntime } from './game/soloBattleDeploymentRuntime.ts';
import { createSoloBattleLoadingRuntime } from './game/soloBattleLoadingRuntime.ts';
import { createSoloBattleStartAccess } from './game/soloBattleStartAccess.ts';
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
import { createPerfDiagnosticsAccess } from './dev/perfDiagnosticsAccess.ts';
import { createLazyAudio } from './audio/lazyAudio.js';
import { createInput } from './game/input.js';
import { createArmorAimOverlayAccess } from './game/armorAimOverlayAccess.ts';
import { createBattleClientAccess } from './game/battleClientAccess.ts';
import { createBattleWarmAccess } from './game/battleWarmAccess.ts';
import { createBattleModuleAccess } from './game/battleModuleAccess.ts';
import { createPlaySurfaceRuntime } from './game/playSurfaceRuntime.ts';
import { createNetworkBrowserSessionRuntime } from './net/networkBrowserSessionRuntime.ts';
import { createNetworkRoomCoordinator } from './net/networkRoomCoordinator.ts';
import { createNetworkBattleLaunchRuntime } from './net/networkBattleLaunchRuntime.ts';
import { createNetworkBattleActivationRuntime } from './net/networkBattleActivationRuntime.ts';
import { createNetworkBattlePresentationAccess } from './net/networkBattlePresentationAccess.ts';
import { loadEquipment as loadSelectedEquipment } from './game/equipment.js';
import { createSettingsAccess } from './ui/settingsAccess.ts';
import { createTouchControlsAccess } from './ui/touchControlsAccess.ts';
import { installResponsiveLayout } from './ui/responsiveLayout.ts';
import { installResponsiveSurfaceStyles } from './ui/responsiveSurfaces.ts';
import {
  spawnTanks, ensureStagedVisuals, nextStagedBake, planBattleParticipantIds,
  planBattleCamoOverrides,
} from './game/rosterState.ts';
import { createBus, createGameState } from './game/stateCore.ts';
import { SHOT_VIEWS } from './dev/shotContract.ts';
import { createSoloBattleRuntimeAccess } from './game/soloBattleAccess.ts';
import { createBattleEntryAcquisition } from './game/battleEntryAcquisition.ts';
import { createBattleEntryLifecycle } from './game/battleEntryLifecycle.ts';
import { createCombatWarmCoordinator } from './game/combatWarmCoordinator.ts';
import { createDeferredCombatWarmRuntime } from './game/deferredCombatWarmRuntime.ts';
import { createStudioAccess } from './game/studioAccess.ts';
import { stripActivatedEra } from './game/eraActivation.ts';
import { createFxRuntimeAccess } from './fx/fxRuntimeAccess.ts';
// BOOT SCREENS: the entry/loading gate (markup inline in index.html so first
// paint never waits on this module graph) and the pre-battle roster screen.
import { createBootScreen } from './ui/bootScreen.ts';
import { createBattleLoadScreen } from './ui/battleLoad.ts';
import { createEndOverlayRuntime } from './ui/endOverlayRuntime.ts';
import { createStartupIntent } from './game/startupIntent.ts';
import { createSelectedVehicleSelection } from './game/selectedVehicleSelection.ts';
import { tierNumeral } from './vehicles/tier.ts';
import { createTransition } from './ui/transition.ts';
// Direct /studio navigation is a distinct boot target, not "boot the garage,
// reveal it, then start a second load".  The intent is captured before any
// staged work so the inline boot screen can report Studio-specific progress
// and main.js can hand the already-visible veil to createStudio().
const startupIntent = createStartupIntent(globalThis.location);
const STUDIO_BOOT_INTENT = startupIntent.studioRequested;
const STUDIO_BOOT_MAP = startupIntent.studioMapId;

const DEG = Math.PI / 180;
const SIM_DT = 1 / 60;
const GARAGE_POS = new THREE.Vector3(-1500, 0, -1500);
const pendingRoomInvitePromise = startupIntent.pendingRoomInvite;

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
  defaultId: 'm1a1',
});
const bootSelectedBuilderP = STUDIO_BOOT_INTENT
  ? Promise.resolve()
  : ensureTankBuilder(selectedVehicle.id);

// scratch
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _rayO = new THREE.Vector3();
const _rayD = new THREE.Vector3();
const _fwd = new THREE.Vector3();
// SOUND r3: hybrid listener anchor. Direction follows the camera, but world
// distance follows the tank the player inhabits/spectates so pulling the
// third-person camera back cannot mute the tank and its immediate neighbors.
const _audioPos = new THREE.Vector3();
// chase-camera occlusion focus (player hull center, lifted to turret height)
const _occlFocus = new THREE.Vector3();

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
installResponsiveSurfaceStyles();
let bootComplete = false;
const bootLifecycle = createBootLifecycle({ screen: boot, yieldFrame: nextFrame });
const BOOT_TIMINGS = bootLifecycle.timings;
const BOOT_T0 = bootLifecycle.startedAt;
const bootStage = bootLifecycle.run;
// ---------------------------------------------------------------------------
// Engine bootstrap (§4 startup order)
// ---------------------------------------------------------------------------
const container = document.getElementById('app');
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
// Loading-budget r1: the garage cannot see the outdoor cloud decks, but a
// battle or direct Studio entry can need them immediately. Start their two
// deterministic canvas bakes now and let the remaining boot stages overlap
// the work. ensureWorld still awaits the shared promise before activation.
const bootCloudWarmP = sky.ensureCloudTexturesChunked
  ? sky.ensureCloudTexturesChunked(() => nextFrame()).catch(() => {})
  : Promise.resolve();
const lighting = await bootStage('lighting', () => createLighting(scene, camera, sky.sunDir));
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
  setupShadowMaterial: (mat, extraHook = null) => lighting.setupShadowMaterial(mat, extraHook),
  releaseShadowMaterial: (mat) => lighting.releaseShadowMaterial(mat),
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
let worldRuntime = null;
const currentWorld = () => worldRuntime?.current ?? null;
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
worldRuntime = createWorldActivationRuntime({
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
    releaseShadowMaterial: (resource) => lighting.releaseShadowMaterial(resource),
    acquireBackgroundWork: (kind, stillValid) =>
      garageIdleWorkCoordinator.acquire(kind, stillValid),
  },
  swapSceneWorld: (previous, next) => garagePhasePresentation.swapWorld(previous, next),
  setSceneWorldActive: (root, active) => garagePhasePresentation.setWorldActive(root, active),
  ensureCloudTextures: () => sky.ensureCloudTextures(),
  ensureCloudTexturesChunked: sky.ensureCloudTexturesChunked
    ? (yieldFrame) => sky.ensureCloudTexturesChunked(yieldFrame)
    : undefined,
  awaitInitialCloudWarm: () => bootCloudWarmP,
  applySkyPreset: (skyConfig) => sky.applyPreset(skyConfig, scene),
  setSun: (skyConfig) => lighting.setSun(sky.sunDir, skyConfig),
  getFogDensity: () => scene.fog?.density ?? 0,
  onFogDensityChanged: (density) => { baseFogDensity = density; },
  canCreateCollider: () => isSoloBattleRuntimeReady(),
  createCollider: (next) => createCollider(game, next),
  placeGarage: () => garagePhasePresentation.place(),
  isMinimapReady: () => !!hud,
  buildMinimap: (next, textured) => {
    if (!hud) return;
    hud.buildMinimap(next.heightField, next.getMinimapFeatures(), next.config.minimap,
      textured ? minimapSnapCtx() : null);
  },
  loadMinimapAsset: (next, url) => hud.buildMinimapFromAsset(next.heightField, url),
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
function worldRaycast(o, d, m) { return worldRuntime.raycast(o, d, m); }

// --- game state + tanks -----------------------------------------------------
// Device QA: `?debug=1` opts a production build into the same bounded flight
// recorder used in development. The recorder remains a lazy chunk and has
// zero listeners/frame work for ordinary players; the explicit QA URL gives
// remote/mobile testers an optimized-build trace they can export themselves.
const diagnosticsRequested = import.meta.env.DEV || debugModeRequested() || navigator.webdriver;
const traceRequested = import.meta.env.DEV || debugModeRequested();
const devTrace = traceRequested
  ? (await import('./dev/perfTrace.js')).createDevTrace({
    renderer,
    enabled: true,
    traceMode: import.meta.env.DEV ? 'development' : 'production-qa',
  })
  : null;
const bus = createBus(devTrace ? (ev, payload) => devTrace.event(ev, payload) : null);
installBattleRecords(bus);
const game = createGameState();
const playerShellLog = [];
const botPressure = { enemyShells: 0, aimedAtPlayer: 0, hitsOnPlayer: 0, dmgOnPlayer: 0 };
// Randomized rosters made the two-entry detached bot cache a poor hit-rate
// trade: it retained complete procedural tank graphs, paint canvases and GPU
// programs throughout the mostly-static Garage, yet usually missed the next
// battle's exact roster. The selected player visual still transfers directly
// into the pedestal; all other battle actors now release at the phase edge.
const battleVisualPool = createBattleVisualPool({
  capacity: 0,
});
game._battleVisualPool = battleVisualPool;
devTrace?.configure({ game });
spawnTanks(game, engineCtx);
// The staged default battle (screenshot contract + first BATTLE press) needs a
// world for its spawn points, so it is staged by ensureWorld() rather than
// here. PERF r3: deferVisuals still keeps the 7 enemy texture bakes off the
// critical path — warmCombatPipeline / the post-ready idle pump stream them in
// before any battle or screenshot frame can render the battlefield.
let battleStaged = false;
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
const fxRuntimeAccess = createFxRuntimeAccess({
  loadModule: () => import('./fx/effects.js'),
  initialize: ({ createFx }) => {
    const live = createFx(engineCtx, hfProxy, { seed: 5000 });
    scene.add(live.group);
    live.bindBus(bus);
    // createPost runs during garage boot, before this demand-loaded graph
    // exists. Hand its late-composite activity/depth state to the existing
    // pass now; otherwise every layer-30 effect is simulated but invisible.
    post.attachLateFxState(live.group.userData.softParticles);
    return live;
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
const groundSampler = (x, z) => {
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
bus.on('module:state', (ev) => {
  if (ev.module !== 'trackL' && ev.module !== 'trackR') return;
  const t = game.tankById.get(ev.id);
  if (t && t.visual.setTrackState) t.visual.setTrackState(ev.module, ev.state === 'red');
});

// --- garage stage (12 m disc pad + 2 integration-owned spotlights) -----------
// The pad sits on the active map's edge terrain when one exists; with the world
// deferred it opens at y = 0 and placeGarage() re-seats it the moment a
// battlefield is activated. Everything on the stage (pedestal, spots, camera
// pose) is positioned RELATIVE to GARAGE_POS, so the bay looks identical either
// way — and the bay is sealed, so no battlefield is visible from it regardless.
GARAGE_POS.y = hfProxy.getHeightAt(GARAGE_POS.x, GARAGE_POS.z);
const { stage: garageStage, dressing: garageDressing } = await bootStage('garage', async () => {
  const gs = createGarageStage(engineCtx, GARAGE_POS);
  scene.add(gs.group);
  const gd = createGarageDressingAccess(engineCtx, GARAGE_POS);
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
    import('./ui/perfHud.js'),
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
const garagePhasePresentation = createGaragePhasePresentationRuntime({
  scene,
  stageRoot: garageStage.group,
  dressingRoot: garageDressing.group,
  garagePosition: GARAGE_POS,
  lighting,
  sunDirection: sky.sunDir,
  getSkyConfig: () => {
    const world = currentWorld();
    return (world ? world.config.sky : getMapConfig(worldRuntime.pendingMapId).sky) || {};
  },
  getGroundHeight: (x, z) => hfProxy.getHeightAt(x, z),
  getPhase: () => game.phase,
  posePedestal: () => pedestal.poseCurrent(),
  poseCamera: () => garageCameraPose(),
  // Both bindings are initialized before either covered return can run.
  warmRender: () => warmRender(),
  nextFrame,
});
const setGarageSpots = garagePhasePresentation.setActive;
const setGarageSunTrim = garagePhasePresentation.setSunTrim;
const placeGarage = garagePhasePresentation.place;

// The repair bays and component displays remain normal garage content, but
// their complete visual stream is owned by a typed quiet-window scheduler.
const requestQuietIdle = (callback) => {
  if (window.requestIdleCallback) return window.requestIdleCallback(callback);
  return setTimeout(callback, 800);
};
const garageDressingScheduler = createGarageDressingScheduler({
  dressing: garageDressing,
  getPhase: () => game.phase,
  isTransitionActive: () => transition.active,
  ensureTankBuilders,
  requestIdle: (callback) => requestQuietIdle(callback),
  scheduleDelay: (callback, delayMs) => setTimeout(callback, delayMs),
  acquireBackgroundWork: (kind, stillValid) =>
    garageIdleWorkCoordinator.acquire(kind, stillValid),
  onVisualChange: () => invalidateGaragePresentation(),
});
const scheduleGarageDressingBuild = garageDressingScheduler.schedule;

function frameBudgetTick(budgetMs = 6) {
  let sliceAt = performance.now();
  return () => {
    if (performance.now() - sliceAt < budgetMs) return undefined;
    return nextFrame().then(() => { sliceAt = performance.now(); });
  };
}

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
  createBudgetYield: frameBudgetTick,
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
    .then(() => hud.preloadMinimapAsset(minimapAssetUrl(mapId))),
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
  createBudgetYield: frameBudgetTick,
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

// GARAGE FRAMING ANCHOR (garage r9): the fixed point every showroom pose
// looks at — the stage center at hull mid-height. The pedestal hull sits at
// the authored running-gear envelope on the 0.36 m podium, so +1.6 remains
// the middle of a typical ~2.5 m tank.
const GARAGE_LOOK_Y = 1.6;
// Canonical hero box (half-extents, metres) the showroom frames INSTEAD of
// each hull's own measured box — sized to the M1A2 reference (≈3.9 × 2.5 ×
// 9.9 m). Keeping it constant is the whole point: every vehicle is viewed
// from the same eye.
const GARAGE_FRAME_BOX = { hw: 1.95, hh: 1.25, hd: 4.95 };

function garageCameraPose() {
  // hud_ui r4: camera pulled in ~10% + slightly lower — kills the dead
  // charcoal zone below the dais and enlarges the hero tank.
  // garage r9 (owner: "keep the camera in one place"): the per-hull length
  // scale that used to stretch this offset is GONE — the fallback pose is a
  // constant, matching the fixed showroom framing that takes over below.
  _v1.set(GARAGE_POS.x + 7.4, GARAGE_POS.y + 2.75, GARAGE_POS.z + 8.0);
  _v2.set(GARAGE_POS.x, GARAGE_POS.y + GARAGE_LOOK_Y, GARAGE_POS.z);
  rig.setExternalPose(_v1, _v2, 42);
}

// --- MAP-CONFIG WIRING: map switching --------------------------------------
function buildWorldMinimap(next, textured = true) {
  worldRuntime.buildMinimap(next, textured);
}

function prepareWorldServices(next = currentWorld()) {
  worldRuntime.prepareServices(next);
}

function prepareBattleWorldServices(next = currentWorld()) {
  worldRuntime.prepareBattleServices(next);
}

function switchMap(mapId) {
  return worldRuntime.switchMap(mapId);
}

function ensureWorld(mapId, onProgress = null, opts = null) {
  return worldRuntime.ensure(mapId, onProgress, opts);
}

/**
 * Stage the deterministic default battle (screenshot contract + the very first
 * BATTLE press). Needs a world for its spawn points, so it runs on first world
 * activation rather than at boot.
 * @returns {void}
 */
function ensureBattleStaged() {
  const world = currentWorld();
  if (battleStaged || !world) return;
  battleStaged = true;
  setupBattle(game, selectedVehicle.id, world, { deferVisuals: true });
  playerBattleActions.setTank(game.player.spec);
  damagePanel.setTank(game.player.spec, game.player.visual);
  damagePanel.setEquipment(game.player.equip); // EQUIPMENT SYSTEM: loadout readout
  for (const ent of game.allTanks) {
    if (ent.visual && ent.visual.setGroundSampler) ent.visual.setGroundSampler(groundSampler);
  }
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
function setWorldDormant(on) {
  worldRuntime.setDormant(on);
}

// hud_ui r6: live-scene handles for the minimap's one-time orthographic
// top-down capture (tanks hidden during the capture; ui falls back to the
// procedural cartography when absent).
function minimapSnapCtx() {
  return {
    renderer, scene,
    exclude: (game.tanks || []).map((t) => t.visual && t.visual.root).filter(Boolean),
  };
}

// --- HUD / garage / panels ----------------------------------------------------
// boot r8: the minimap build (a real orthographic top-down capture of the
// battlefield) moved to activateWorld — the HUD is hidden in the garage, so
// nothing on the boot path can see it.
let hud = null;
let damagePanel = null;
const battleHudAccess = createBattleHudAccess(bus, engineCtx);
async function ensureBattleHud() {
  const runtime = await battleHudAccess.preload();
  hud = runtime.hud;
  damagePanel = runtime.damagePanel;
  worldRuntime.queueMinimap();
  return runtime;
}
// Preserve the staged progress contract without transferring battle-only UI
// into a garage first visit. Battle intent/entry joins ensureBattleHud().
await bootStage('hud');

const garageMaps = [
  { id: 'random', name: 'Random', thumb: '', hero: '' },
  ...MAP_IDS.map((id) => {
    const c = getMapConfig(id);
    return { id, name: c.name, thumb: MAP_THUMBS[id] || '', hero: MAP_HEROES[id] || '' };
  }),
];
let networkRoomCoordinator = null;
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
      getSelection: () => ({
        specId: garage.getSelected(),
        mapId: garage.getSelectedMap(),
        equipment: loadSelectedEquipment(garage.getSelected(), getSpec(garage.getSelected())),
        camo: getMultiplayerCamoSelection(garage.getSelected()),
      }),
      isVehicleAllowed: (specId) => VISIBLE_TANK_IDS.includes(specId),
      isCamoAllowed: (camo) => CAMO_PATTERN_IDS.includes(camo),
      getCamoName: (camo) => CAMO_PATTERN_LABEL[camo] || 'Factory',
      getVehicleName: (specId) => getSpec(specId).name,
      onNetworkStart: (request) => networkBattleLauncher.beginPrivate(request),
      onNetworkClose: (reason) => closeNetworkMatch(reason || 'room_closed'),
      onRankedStart: (request) => networkBattleLauncher.beginRanked(request),
      onLobbyChange: (context) => networkRoomCoordinator?.handleLobbyChange(context),
  }),
  getSelectedSpecId: () => garage.getSelected(),
  getSelectedMapId: () => garage.getSelectedMap(),
  startSolo: (request) => beginSoloBattle(request),
  showActiveRoom: () => networkRoomCoordinator?.showActiveRoom() || false,
  preloadCommon: [
    ensureBattleHud,
    preloadFxModule,
    // killcam access is composed later in the battle-only section. Keep the
    // lazy port itself behind a closure so a pristine browser can finish the
    // composition root without touching its temporal-dead-zone binding.
    () => preloadKillcamModule(),
    preloadNetworkBattleModules,
    preloadNetworkRoomChatModule,
  ],
  preloadNetworkPresentation: () => networkBattlePresentation.preload(),
  preloadPrivateMatch: preloadPrivateMatchHandoffModule,
  preloadDedicatedMatch: preloadDedicatedClientModule,
});

// Battle entry owns the play modal's visibility. Every player-facing entry
// path emits this event, so first matches, retained-room rematches, ranked,
// and solo all dismiss the operation picker before the next painted frame.
bus.on('ui:battleStart', () => {
  playSurface.hideForBattle();
});

const garage = await bootStage('ui', () => createGarage({
  specs: VISIBLE_TANK_IDS.map(getSpec),
  bus,
  onSelect: (specId) => {
    battleIntent.invalidateMapPlan();
    selectedVehicle.select(specId);
    pedestal.set(specId);
    applyCamoPatternsChunked({ priorityIds: [specId], onlySpecIds: [specId] });
    networkRoomCoordinator?.syncVehicle(specId);
    networkRoomCoordinator?.syncPendingLobbySelection();
  },
  onBattle: (specId, mapId, options) => beginBattleEntry(specId, mapId, options), // loading screen owns entry
  onPlayRequest: (request) => playSurface.open(request).catch((error) => {
    console.error('[play-menu] failed to open', error);
  }),
  onPlayModeIntent: playSurface.preload,
  onBattleIntent: battleIntent.preload,
  onTankIntent: pedestal.preloadIntent,
  onStudioIntent: preloadStudioIntent,
  // MAP-CONFIG WIRING: every registered battlefield plus Random.
  maps: garageMaps,
  // CAMO WIRING: per-tank paint picker — persists the choice and repaints the
  // shared albedo in place, so the pedestal tank updates immediately.
  camo: {
    patterns: CAMO_PATTERN_IDS,
    label: CAMO_PATTERN_LABEL,
    get: (specId) => getCamoSelection(specId),
    getCustom: (specId) => getCustomCamoSelection(specId),
    set: (specId, patternId) => {
      setCamoSelection(specId, patternId);
      // Keep the exact high-resolution paint, but yield the triggering UI
      // frame before a cold pattern bake instead of blocking the click.
      camoSweepP = applyCamoPatternsChunked({
        priorityIds: [specId], onlySpecIds: [specId],
      });
      networkRoomCoordinator?.syncCamo(specId);
      networkRoomCoordinator?.syncPendingLobbySelection();
    },
    setCustom: (specId, value) => {
      setCustomCamoSelection(specId, value);
      camoSweepP = applyCamoPatternsChunked({
        priorityIds: [specId], onlySpecIds: [specId],
      });
      // Deliberately sends Factory: custom paint is local single-player only.
      networkRoomCoordinator?.syncCamo(specId);
      networkRoomCoordinator?.syncPendingLobbySelection();
    },
  },
  // CAMO WIRING (r8): AUTO(map) tanks preview the pattern they will actually
  // wear on the highlighted battlefield. 'random' falls back to verdant
  // inside setCamoBiome; startBattle re-calls setCamoBiome(world.mapId) after
  // the roll, so battle state is always correct regardless.
  onMapSelect: (mapId) => {
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
    networkRoomCoordinator?.syncPendingLobbySelection();
  },
}));

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
let playerBattleActions = null;
const battleClientAccess = createBattleClientAccess(() => ({
  getGame: () => game,
  getRig: () => rig,
  worldRaycast,
  targetVisible: mobileAutoAimVisible,
  getShellCards: () => playerBattleActions?.shellCards || [],
  computeDispersion: battleClientAccess.computeDispersionRadM,
}));
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

const rig = createCameraRig(camera, {
  heightField: hfProxy,
  raycast: worldRaycast,
  aimRaycast: aimController.raycast,
  getPlayer: () => game.player,
});

// GARAGE SHOWROOM CAMERA: auto-framed hero pose + damped drag orbit
// (engine/cameraRig.js createShowroomOrbit). This adapter owns the on/off
// latch, the canvas pointer wiring, and the per-frame pump — tick() runs it
// in the garage phase only, so shot staging ('shot') and battle keep their
// own camera owners. startBattle()/enterGarage() call stop()/start().
const showroom = createGarageShowroomRuntime({
  camera,
  rig,
  element: renderer.domElement,
  getSubject: () => pedestal.current?.root || null,
  getStageRect: () => (garage.getStageRect ? garage.getStageRect() : null),
  // Classic front-right three-quarter hero framing. All dimensions and camera
  // math remain owned by the existing engine solver; this root supplies only
  // scene anchors and the canonical vehicle-independent frame.
  heroYawRad: GARAGE_TRACK_AXIS_YAW_RAD + 45 * DEG,
  heroPitchRad: Math.atan2(1.2, Math.hypot(7.4, 8.0)),
  fixedFrame: () => ({
    x: GARAGE_POS.x, y: GARAGE_POS.y + GARAGE_LOOK_Y, z: GARAGE_POS.z,
    hw: GARAGE_FRAME_BOX.hw, hh: GARAGE_FRAME_BOX.hh, hd: GARAGE_FRAME_BOX.hd,
  }),
  floorY: () => GARAGE_POS.y,
});

// Sniper close-quarters fill (gameplay_feel r1): with the camera at the gun
// trunnion, aiming into nearby shadowed/backfacing geometry (a bush wall, a
// building 5-10 m out) rendered a 100% black scope — zero feedback about the
// blockage. A small camera-riding point light, active only in SNIPER and only
// when the server-aim hit is CLOSE, keeps the obstacle readable exactly like
// WoT's scope does. Range-limited (18 m, quadratic decay) so it can never
// relight the midfield; intensity eases in below ~20 m aim distance.
const sniperFill = new THREE.PointLight(0xfff0dc, 0, 18, 2);
sniperFill.castShadow = false;
scene.add(sniperFill);
function updateSniperFill() {
  if (rig.mode === 'SNIPER' && camera.userData.scoped) {
    const near = THREE.MathUtils.clamp((20 - rig.aimDist) / 16, 0, 1);
    sniperFill.intensity = 40 * near * near;
    if (sniperFill.intensity > 0.01) sniperFill.position.copy(camera.position);
  } else {
    sniperFill.intensity = 0;
  }
}

// --- KILL-CAM (src/game/killcam.js) -----------------------------------------
// End-of-battle cinematic: slow-mo tracer replay of the killing shell + x-ray
// module breakdown. Capture hooks live in the KILL-CAM sections of state.js
// (game.killcam); the camera is driven only via rig.setExternalPose.
const killcamAccess = createKillcamAccess({
  loadModule: () => import('./game/killcam.js'),
  initialize: ({ createKillCam }) => {
    const live = createKillCam({
      scene, camera, rig, heightField: hfProxy, getPlayer: () => game.player,
      getEntity: (id) => game.tankById.get(id),
      getWorld: currentWorld, // r6: flight-cam LOS solve (foliage/terrain/props)
      // Replay impact uses the real pooled destruction effects.
      getFx: () => fxRuntimeAccess.current,
    });
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
function veilHud(on) {
  // Studio and garage are valid before the battle-only HUD graph exists.
  if (hud?.root) hud.root.style.display = on ? 'none' : '';
  const sr = hud?.shotInfo?.statsRoot;
  if (sr) sr.style.visibility = on ? 'hidden' : '';
  if (damagePanel?.root) damagePanel.root.style.visibility = on ? 'hidden' : '';
}

// Player combat feedback: non-spatial hit-confirm blip for own shells that
// connect (bright = damage, dull = bounce), camera flinch when taking a hit.
bus.on('shell:hit', (ev) => {
  // Receiving-end reaction on ANY struck tank: caliber-scaled hull flinch.
  // Persistent armor scars are owned exclusively by effects.js's shell:hit
  // listener so one authoritative hit can never be stamped twice.
  const target = ev.targetId ? game.tankById.get(ev.targetId) : null;
  if (target?.visual) stripActivatedEra(ev, target.visual);
  if (target && target.visual && ev.normal) {
    const pen = ev.kind === 'pen' || ev.kind === 'he_pen';
    if (target.visual.hitFlinch) {
      target.visual.hitFlinch(
        ev.normal[0], ev.normal[2],
        ((ev.caliberMm || 90) / 100) * (pen ? 1 : 0.55),
        target.state ? target.state.yaw : undefined,
      );
    }
  }
  if (!game.player) return;
  if (ev.attackerId === game.player.id && ev.targetId && ev.targetId !== game.player.id) {
    // Preserve the actual armor result: a ricochet's singing deflection and
    // a blunt non-penetration should never collapse into the same UI knock.
    audio.hitConfirm(ev.kind, ev.damage || 0);
  }
  if (ev.targetId === game.player.id && (ev.damage || 0) > 0) {
    const shock = Math.min(0.62, 0.24 + (ev.damage || 0) / 2400 + (ev.caliberMm || 90) / 1200);
    rig.addTrauma(shock);
  }
});

bus.on('shell:fired', (ev) => {
  if (!ev.isPlayer) return;
  // Network authority owns firing, so the bridge supplies the barrel stroke
  // and this client-side layer restores the same camera/FOV recoil used by
  // local battles. Local simulation already applies it in state.js.
  if (networkSession.match && game.player && rig) {
    const shells = game.player.spec.gun.shells || [];
    const shellSpec = shells.find((shell) => shell.name === ev.shellName)
      || shells.find((shell) => shell.type === ev.shellType) || null;
    const recoilScale = shotRecoilScale(game.player.spec, shellSpec);
    const caliberMm = (shellSpec && shellSpec.caliberMm) || ev.caliberMm || game.player.spec.gun.caliberMm;
    const caliberK = Math.max(0, Math.min(1, (caliberMm - 30) / 122));
    rig.addTrauma((0.10 + caliberK * 0.20) * recoilScale);
    if (rig.recoilKick) {
      rig.recoilKick((0.006 + caliberK * 0.011) * recoilScale, recoilScale);
    }
  }
});
// gameplay_feel r6 (crushable vegetation): state.js emits prop:crushed when a
// moving hull overruns a tagged trunk — splinter burst at the break point
// (the same fx the pole hinge-topple uses; the fall anim itself runs in
// vegetation.js via world.crushObstacle).
bus.on('prop:crushed', (ev) => {
  const liveFx = fxRuntimeAccess.current;
  if (!liveFx) return;
  _v1.set(ev.pos[0], ev.pos[1], ev.pos[2]);
  _fwd.set(ev.dir[0], 0, ev.dir[2]);
  liveFx.propCrush(_v1, _fwd, ev.h);
});
// DESTRUCTIBLES r1: every destructible break (ram, shell hit, HE splash or
// chained drum blast) reports through the destructibles.js sink — forwarded
// onto the bus as the AUDIO seam ('prop:destroyed' {kind, pos, cause}).
setDestroyedEventSink((ev) => bus.emit('prop:destroyed', ev));
bus.on('phase:change', (ev) => {
  if (ev.phase === 'battle') {
    // Showroom convenience copies must not compete with the complete combat
    // roster. Keep only the selected hero on mobile and the three most-recent
    // desktop heroes; the player visual shares paint with the fielded actor
    // and still gives the garage an immediate return.
    pedestal.trim(getDeviceTier() === 'mobile' ? 1 : 3);
  }
});

sky.applyFog(scene);
// High-zoom de-fog (WoT sniper behavior): remember the base density so the
// render loop can scale it by FOV without mutating the sky's baseline.
let baseFogDensity = scene.fog.density; // updated on map switch (sky preset)
const post = createPost(renderer, scene, camera);
const viewport = createViewportRuntime({ container, renderer, camera, post, lighting });
const forwardProgramWarm = createForwardProgramWarmOwner({
  renderer,
  scene,
  camera,
  getTarget: () => post?.composer?.renderTarget1 || null,
});
// Renderer-lifetime warm state is declared before context recovery is armed:
// a mobile device can lose and restore WebGL while the async boot pipeline is
// still running, before the later warm-owner functions are reached.
const combatWarm = createCombatWarmCoordinator({
  createOpening: () => battleWarm.requireRuntime()
    .createCombatOpeningWarmSteps(createCombatWarmRuntimeContext()),
  createRare: () => battleWarm.requireRuntime()
    .createCombatRareWarmSteps(createCombatWarmRuntimeContext()),
});
let combatDestructionEffectsWarmed = false;
// WebGL context restoration is recoverable in place. Three rebuilds its GL
// state first; we then step mobile down to the safe preset, trim optional
// residents, resize the post targets and redraw the shadow set. The sim stays
// frozen while the graphics device is unavailable instead of racing ahead
// behind a blocking warning or throwing away the battle with a page reload.
renderer.userData.contextRecovery = {
  onLost() {
    graphicsContextLost = true;
    post.setAdaptiveSuspended(true);
  },
  async onRestored() {
    // A restored WebGL context has no linked programs or uploaded buffers,
    // even though the JavaScript-side warm receipts survive. Invalidate every
    // renderer-lifetime combat latch so the next covered transition rebuilds
    // the exact production variants instead of trusting stale GPU state.
    combatDestructionEffectsWarmed = false;
    battleWarm.invalidate();
    forwardProgramWarm.invalidate();
    combatWarm.reset();
    if (getDeviceTier() === 'mobile') {
      setMobilePresetName('mobile-low');
      pedestal.trim(1);
      worldRuntime.enforceCacheBudget();
    }
    await nextFrame();
    viewport.apply();
    post.resetAdaptiveResolution();
    lighting.update(true);
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
// battle/spectator/end state (settings.js canLeaveBattle/onLeaveBattle,
// wired below), and the end-of-battle overlay keeps RETURN TO GARAGE.

// ---------------------------------------------------------------------------
// Input — routed through the rebindable action layer (src/game/input.js) and
// the settings panel (src/ui/settings.js). Zoom is the zoomIn/zoomOut actions (wheel by default).
// ---------------------------------------------------------------------------
const debugFlags = { forceFire: false }; // headless-test hook (window.__DEBUG.flags)
const battleResultPresentation = createBattleResultPresentationRuntime({
  game,
  killcam,
  rig,
  veilHud,
  showEndOverlay: endOverlay.show,
  emitPresented: (result) => bus.emit('battle:presented', { result }),
  exitPointerLock: () => { document.exitPointerLock?.(); },
  recordFlow: (receipt) => { debugFlags.lastEndFlow = receipt; },
});

const input = createInput({ lockElement: renderer.domElement });
bus.on('ui:debugHud', (payload) => {
  perfHud.setVisible(!!payload?.on);
});
const armorAimOverlay = createArmorAimOverlayAccess();
const battleVisualStreamerAccess = createBattleVisualStreamerAccess({
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
let battleVisuals = null;
async function ensureBattleVisualStreamer() {
  battleVisuals = await battleVisualStreamerAccess.preload();
  return battleVisuals;
}
const settings = createSettingsAccess({
  input,
  bus,
  // A dead player is spectating even though the team battle continues. This
  // keeps pointer-unlock from opening settings over the death camera.
  isBattleActive: () => game.phase === 'battle' && !game.result &&
    !!(game.player && game.player.combat && !game.player.combat.destroyed),
  canLeaveBattle: () => game.phase === 'battle',
  onLeaveBattle: () => leaveBattleToGarage(),
  gearVisible: () => game.phase === 'garage',
  // PAUSE: the overlay shows its PAUSED treatment exactly when opening it
  // freezes a live battle — same predicate the tick() pause gate derives its
  // livePaused from (kill-cam replays close the panel themselves; the end
  // overlay keeps the old non-paused Esc behavior).
  isGamePaused: () => game.phase === 'battle' && !game.result && !killcam.isActive(),
});
garage.attachSettingsControl(settings.gear);
let mobileSoundMuted = false;
let touchControls = null;
const touchControlsAccess = createTouchControlsAccess({
  input, bus,
  isBattleActive: () => game.phase === 'battle',
  onOpenSettings: () => settings.open(),
  onToggleSound: () => {
    mobileSoundMuted = !mobileSoundMuted;
    audio.mute(mobileSoundMuted);
    return mobileSoundMuted;
  },
  // MOBILE-UX r1: pinch-to-scope needs the live camera mode so a spread
  // ENTERS the scope (sniperToggle lane) and further spread steps zoomIn.
  isSniper: () => rig.mode === 'SNIPER',
});
async function ensureTouchControls() {
  if (!input.isTouchLayout()) return null;
  touchControls = await touchControlsAccess.preload();
  return touchControls;
}
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

// MOBILE AUTO-AIM: a separate Blitz-style lock button acquires the enemy
// closest to screen center, then the camera rig and gun continuously follow
// that tank's center mass until the player toggles it off or the target is
// destroyed/lost. Desktop controls remain unchanged.
let mobileAutoAimTargetId = null;
const mobileAutoAimPoint = new THREE.Vector3();
function mobileAutoAimVisible(ent) {
  return !game.spotting || game.spotting.isSpotted(ent.id, 'player', game.player);
}
function setMobileAutoAimTarget(ent, reason = '') {
  mobileAutoAimTargetId = ent ? ent.id : null;
  bus.emit('ui:autoAimState', {
    on: !!ent,
    targetId: ent ? ent.id : null,
    targetName: ent && ent.spec ? ent.spec.name : '',
    reason,
  });
}
bus.on('ui:autoAimToggle', () => {
  if (game.phase !== 'battle' || !input.isTouchLayout() || !game.player ||
      !game.player.combat || game.player.combat.destroyed) return;
  if (mobileAutoAimTargetId) {
    setMobileAutoAimTarget(null, 'AUTO-AIM OFF');
    return;
  }
  const target = pickMobileAutoAimTarget(
    game.tanks, game.player, camera, mobileAutoAimVisible);
  setMobileAutoAimTarget(target, target ? '' : 'NO TARGET NEAR RETICLE');
});
bus.on('tank:destroyed', ({ id }) => {
  if (id === mobileAutoAimTargetId) setMobileAutoAimTarget(null, 'TARGET DESTROYED');
});
bus.on('phase:change', ({ phase }) => {
  if (phase !== 'battle' && mobileAutoAimTargetId) setMobileAutoAimTarget(null);
});

// CURSOR-AIM FALLBACK: pointer lock durably unavailable (sandboxed iframes,
// embedded panes) — the input layer flips to cursor aim; tell the player ONCE
// so the control change isn't mysterious. Battle input itself never depends
// on the lock: turret = terrain point under the cursor, LMB fires as normal.
// lock_retry r1: onLockDenied now fires only on the DURABLE latch (3
// consecutive denials, or a synchronous SecurityError — input.js), so
// Chrome's ~1.3 s post-Esc re-lock cooldown no longer flips the session into
// cursor aim off a single transient denial; interim primary-button gestures
// keep retrying the lock (canvas mousedown below). A lock that later
// SUCCEEDS unlatches the fallback — drop the toast and re-arm it.
let lockToastShown = false; // re-armed by onLockRestored
let lockToastEl = null;     // live toast node, removed on restore
input.onLockDenied(() => {
  if (lockToastShown) return;
  lockToastShown = true;
  // gunnery r1: the denial usually lands on the BATTLE click itself — before
  // the battle-load screen (z 150) has even mounted and ~10 s before it
  // clears — so an immediate toast (z 66) lived and died entirely underneath
  // it. Defer the append until the battlefield is actually on screen (phase
  // battle, load screen gone) so the player reads the control change.
  const waitForStage = (fn) => {
    if (game.phase !== 'battle' || document.querySelector('.cot-bl.on')) {
      setTimeout(() => waitForStage(fn), 400);
    } else fn();
  };
  // lockToastShown re-check: a lock restored while the toast was still
  // queued behind the load screen must cancel the (now false) message.
  waitForStage(() => { if (lockToastShown) showLockToast(); });
});
input.onLockRestored(() => {
  lockToastShown = false;
  if (lockToastEl) { lockToastEl.remove(); lockToastEl = null; }
});
function showLockToast() {
  const t = document.createElement('div');
  t.textContent = 'Mouse capture unavailable — cursor aim enabled';
  t.className = 'cot-lock-toast';
  t.style.cssText =
    'position:fixed;top:96px;left:50%;transform:translateX(-50%);z-index:66;' +
    'padding:9px 22px;pointer-events:none;background:rgba(9,13,17,.88);' +
    'border:1px solid rgba(240,176,74,.55);color:#ffd27a;' +
    "font-family:'ABC Monument Grotesk','Segoe UI',Roboto,Helvetica,Arial,sans-serif;" +
    'font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;' +
    'box-shadow:0 4px 18px rgba(0,0,0,.5);opacity:1;transition:opacity 1.2s ease;';
  document.body.appendChild(t);
  lockToastEl = t;
  // Fade timers start from the first frame that could PAINT the toast, not
  // from append: battle entry can block the main thread for seconds building
  // the world, and wall-clock timers would expire the toast the moment the
  // screen unfroze (nextFrame's timer fallback covers rAF-starved panes).
  nextFrame().then(() => {
    setTimeout(() => { t.style.opacity = '0'; }, 4500);
    setTimeout(() => { t.remove(); if (lockToastEl === t) lockToastEl = null; }, 5900);
  });
}

function canRecaptureBattlePointer() {
  const combat = game.player?.combat;
  return game.phase === 'battle' && !game.result && !!combat && !combat.destroyed &&
    !settings.isOpen() && !killcam.isActive() && !killcam.spectate?.active;
}

renderer.domElement.addEventListener('mousedown', () => {
  audio.resume();
  // Once the local tank is destroyed, the cursor belongs to the death replay,
  // spectator controls and menus. Canvas clicks must not silently take it back.
  if (!canRecaptureBattlePointer()) return;
  if (input.isTouchLayout()) return;
  if (!input.isLocked()) input.requestLock();
});

// Battle start: desktop grabs the pointer inside the BATTLE-click gesture.
// The old eight-second controls strip is deliberately retired; it covered
// the battlefield on every round even after players knew the bindings.
bus.on('ui:battleStart', () => {
  ensureTouchControls().then((controls) => controls?.refresh()).catch(() => null);
  if (!input.isTouchLayout()) {
    input.requestLock();
  }
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
    specialActionLocksShell: battleClientAccess.specialActionLocksShell,
    hasConsumableRule: battleClientAccess.hasConsumableRule,
    cooldownRemaining: battleClientAccess.cooldownRemaining,
    resetConsumableCooldowns: battleClientAccess.resetConsumableCooldowns,
    startConsumableCooldown: battleClientAccess.startConsumableCooldown,
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
// The opaque deployment transition has one typed owner. main.js coordinates
// acquisition and phase changes; this runtime owns the exact shader, shadow,
// terrain, FX and first-frame warm order plus cancellation/fallback policy.
const soloBattleDeployment = createSoloBattleDeploymentRuntime({
  game,
  renderer,
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
  setPending: (pending) => { battleWarmPending = pending; },
  setDestructionWarmed: (value) => { combatDestructionEffectsWarmed = value; },
  devTrace,
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
const soloBattleStart = createSoloBattleStartAccess({
  options: () => ({
    state: {
      game,
      getPendingMapId: () => worldRuntime.pendingMapId,
      setSelectedSpecId: selectedVehicle.set,
      rememberSpecId: selectedVehicle.remember,
      setShotMode: (value) => { shotMode = value; },
      setCaptureHidden: (value) => perfHud.setCaptureHidden(value),
      setSimulationAccumulator: () => { battleFrame.resetSimulationAccumulator(); },
      setBattleStaged: (value) => { battleStaged = value; },
      setCamoSweep: (work) => { camoSweepP = Promise.resolve(work); },
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
      lendPlayerVisual: (specId) => pedestal.lendToBattle(specId),
      setupBattle,
      combatWarm,
      presentation: battlePresentation,
      applyPlayerCamo: (specId) => applyCamoPatterns(specId),
      applyRosterCamo: (options) => applyCamoPatternsChunked(options),
    },
    ui: {
      hud: {
        shotInfo: { setPlayer: (playerId) => hud.shotInfo.setPlayer(playerId) },
        setMode: (mode) => hud.setMode(mode),
      },
      playerActions: playerBattleActions,
      damagePanel: {
        setTank: (spec, visual) => damagePanel.setTank(spec, visual),
        setEquipment: (equipment) => damagePanel.setEquipment(equipment),
      },
      hideGarage: () => garage.hide(),
      hideEndOverlay: endOverlay.hide,
      resetBattleResult: () => battleResultPresentation.reset(),
      setGarageLighting: (active) => {
        setGarageSpots(active);
        setGarageSunTrim(active);
      },
      emitPhaseChange: (phase) => bus.emit('phase:change', { phase }),
      emitConsumableReset: () => bus.emit('ui:consumableReset', {}),
      rig,
      stopShowroom: () => showroom.stop(),
      openBattle,
    },
    recordTrace: (trace) => {
      if (typeof window !== 'undefined') window.__START_BATTLE_TIMINGS = trace;
    },
  }),
});
const soloBattleLoading = createSoloBattleLoadingRuntime({
  game,
  post,
  battleIntent,
  battleLoad,
  audio,
  acquisition: battleEntryAcquisition,
  deployment: soloBattleDeployment,
  lifecycle: battleEntryLifecycle,
  getPendingMapId: () => worldRuntime.pendingMapId,
  getMapConfig,
  getMapThumb: (mapId) => MAP_HEROES[mapId] || MAP_THUMBS[mapId] || '',
  hasCachedWorld: (mapId) => !!worldCache.get(mapId),
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
  ensureTouchControls,
  preloadSettings: () => settings.preload(),
  preloadArmorAim: () => armorAimOverlay.preload(),
  planRoster: (specId, randomRoster) =>
    planBattleParticipantIds(game, specId, randomRoster),
  planCamoOverrides: (specId, mapId, randomRoster) =>
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
  rosterRows,
  warmShotCards: (specIds) => hud.warmShotCards(specIds),
  getCamoSweep: () => camoSweepP,
  prepareRevealCamera: prepareBattleRevealCamera,
  resolveVisiblePreBattleSeconds,
  preBattleHoldSeconds: PRE_BATTLE_HOLD_S,
  minimumVisiblePreBattleSeconds: MIN_VISIBLE_PRE_BATTLE_S,
  openBattle,
  scheduleDeferredWarm: scheduleDeferredCombatWarm,
  nextFrame,
  createLoadingYielder: createOpaqueLoadingYielder,
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
  isBattleActive: () => game.phase === 'battle',
  shouldPresentDisconnect: () => game.phase === 'battle' && !game.result,
  nextFrame,
});

// Persistent subject-owned FX resolve against the presentation entity the
// player actually sees. Network entities take priority during online battles;
// solo falls back to the fixed-step roster.
function resolveFxSubject(id) {
  return networkSession.resolveEntity(id) || game.tankById.get(id) || null;
}

/**
 * A joined lobby is stronger intent than browsing the multiplayer picker, but
 * weaker than starting a round. Transfer the exact roster code immediately;
 * build only a fixed host-selected battlefield, and let the existing garage-
 * lull gate keep terrain work out of active room interaction.
 */
function preloadNetworkLobbyIntent(state) {
  if (!state || game.phase !== 'garage' || state.phase !== 'waiting') return;
  networkBattlePresentation.preload().catch(() => null);
  battleVisualStreamerAccess.preload().catch(() => null);
  preloadNetworkBattleModules().catch(() => null);
  preloadNetworkRoomChatModule().catch(() => null);
  const rosterIds = [];
  for (const player of state.players || []) {
    if (player.specId) rosterIds.push(player.specId);
  }
  ensureTankBuilders(rosterIds).catch(() => null);
  loadWorldModule().catch(() => null);
  const mapId = state.mapId;
  if (!mapId || mapId === 'random') {
    cancelBackgroundWorldBuildsExcept(null);
    return;
  }
  cancelBackgroundWorldBuildsExcept(mapId);
  prefetchWorld(mapId);
}

const networkBattlePresentation = createNetworkBattlePresentationAccess({
  options: () => ({
    load: {
      battleLoad,
      audio,
      lighting,
      ensureBattleVisuals: ensureBattleVisualStreamer,
      nextFrame,
      recordTrace: (trace) => {
        if (typeof window !== 'undefined') window.__NETWORK_LOAD = trace;
      },
      setAdaptiveSuspended: (value) => post.setAdaptiveSuspended(value),
    },
    roster: {
      getMap: (mapId) => {
        const cfg = getMapConfig(mapId);
        return { name: cfg.name || mapId, thumb: MAP_HEROES[mapId] || MAP_THUMBS[mapId] || '', biome: mapId };
      },
      rows: (players, team, viewerId) => lobbyRosterRows({ players }, team, viewerId),
      vehicleName: (specId) => getSpec(specId)?.name || specId,
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
      loadWorld: (mapId, onProgress) => ensureWorld(mapId, onProgress),
      publishMatch: (match) => networkSession.publishMatch(match),
      getMatch: () => networkSession.match,
    },
    bridge: {
      installInputRuntime: (factory) => networkSession.ensureInputRuntime(factory),
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
        compilePrograms: (root) => forwardProgramWarm.compile(root),
        warmRender,
      }),
      openingEffects: (fx, bridge) => {
        const decalVisual = [...bridge.entities.values()]
          .find((entity) => entity.visual?.root)?.visual || null;
        return battleWarm.warmNetworkOpeningEffects({
          fx,
          post,
          camera,
          shells: game.shells,
          decalVisual,
          compilePrograms: (root) => forwardProgramWarm.compile(root),
          warmRender,
        });
      },
      shotCards: (specIds) => hud.warmShotCards(specIds),
      compile: async () => {
        forwardProgramWarm.compile(scene);
        for (const _ of forwardProgramWarm.linkerBreathingSlices(24)) await nextFrame();
      },
    },
    presentation: {
      resetRoundState: resetNetworkBattleState,
      setGarageLighting: (active) => {
        setGarageSpots(active);
        setGarageSunTrim(active);
      },
      activate: (request) => networkBattleActivation.activate(request),
      runBlackWatchdog: () => runSceneBlackWatchdog(renderer, scene, camera),
    },
  }),
});

const networkBattleLauncher = createNetworkBattleLaunchRuntime({
  lifecycle: battleEntryLifecycle,
  battleLoad,
  audio,
  getMatch: () => networkSession.match,
  getRoomCoordinator: () => networkRoomCoordinator,
  getWorldCollision: currentWorld,
  getMapPresentation: (mapId, fallback) => {
    if (!mapId) return { name: fallback, thumb: '', biome: 'none' };
    const cfg = getMapConfig(mapId);
    return { name: cfg.name || fallback, thumb: MAP_HEROES[mapId] || MAP_THUMBS[mapId] || '', biome: mapId };
  },
  rosterRows: lobbyRosterRows,
  emitBattleStart: (payload) => bus.emit('ui:battleStart', payload),
  resetBattleState: resetNetworkBattleState,
  presentBattle: networkBattlePresentation.present,
  loadPrivateMatch: preloadPrivateMatchHandoffModule,
  loadDedicatedMatch: preloadDedicatedClientModule,
  disposePresentation: disposeNetworkPresentation,
  clearNetworkRound: () => networkSession.clearRound(),
  closeMatch: closeNetworkMatch,
  enterGarage: () => garageReturn.enter(),
  setNetworkStatus: (status) => networkSession.status?.set(status),
  recordEntryFailure: (failure) => {
    if (typeof window !== 'undefined') window.__NETWORK_ENTRY_FAILURE = failure;
  },
});

networkRoomCoordinator = createNetworkRoomCoordinator({
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
  preloadLobbyIntent: preloadNetworkLobbyIntent,
  equipmentFor: (specId) => loadSelectedEquipment(specId, getSpec(specId)),
  camoFor: getMultiplayerCamoSelection,
  onRematch: (state) => networkBattleLauncher.beginRematch(state),
  onClose: (reason) => closeNetworkMatch(reason),
});

bus.on('phase:change', () => networkRoomCoordinator.syncChatVisibility());

function disposeNetworkPresentation() {
  networkSession.disposePresentation();
}

function closeNetworkMatch(reason = 'network_match_closed') {
  networkBattleLauncher.cancel(reason);
  networkSession.close(reason);
  networkRoomCoordinator.clear();
}

async function beginBattleEntry(specId, mapId = null, options = undefined) {
  return battleEntryLifecycle.run(async () => {
    try {
      battleEntryLifecycle.coverRendering();
      await soloBattleLoading.begin(specId, mapId, options);
    } catch (error) {
      console.error('[battle] entry failed', error);
      audio.loadingOn(false);
      // Failure exits obey the same covered-frame rule in the opposite
      // direction: restore and paint the Garage while the loader is opaque,
      // then let the loader fade. Never expose whichever old WebGL frame was
      // retained when covered rendering began.
      enterGarage();
      battleEntryLifecycle.uncoverRendering();
      await nextFrame();
      await battleLoad?.hide?.();
    }
  }, undefined);
}

function lobbyRosterRows(lobbyState, team, viewerId) {
  return lobbyState.players
    .filter((player) => player.team === team)
    .map((player) => ({
      id: player.specId,
      name: getSpec(player.specId)?.name || player.name || player.specId,
      tier: tierNumeral(player.specId),
      isPlayer: player.id === viewerId,
    }));
}

function resetNetworkBattleState() {
  // The bridge overlays a reusable global game object. Clear the old verdict
  // synchronously at handoff so a rematch cannot paint or process one frame
  // of the previous victory/defeat before the first cold import resolves.
  game.result = null;
  game.resultReason = null;
  game.timeS = 0;
  game.preBattleS = Infinity;
}

const networkBattleActivation = createNetworkBattleActivationRuntime({
  game,
  settings,
  killcam,
  // Engineering-only controller is created after ordinary boot composition;
  // keep this port lazy so production startup never crosses its TDZ.
  driveTest: { resetAim: () => driveTestController.resetAim() },
  getHud: () => hud,
  playerActions: playerBattleActions,
  getDamagePanel: () => damagePanel,
  rig,
  presentation: {
    setShotMode: (value) => { shotMode = value; },
    setCaptureHidden: (value) => perfHud.setCaptureHidden(value),
    setNetworkSpectator: (value) => networkSession.setSpectator(value),
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
});

/**
 * Keep bot play on the original in-page simulation path. Multiplayer's
 * authority, snapshot bridge, prediction, WebRTC, and signaling modules are
 * intentionally absent here: loading them for a local battle duplicated work
 * without adding any useful authority boundary.
 */
async function beginSoloBattle({ specId, mapId, randomRoster = true, gameMode = 'standard' } = {}) {
  const selected = VISIBLE_TANK_IDS.includes(specId) ? specId : garage.getSelected();
  return beginBattleEntry(selected, mapId || garage.getSelectedMap(), { randomRoster, gameMode });
}

/** Rows for the pre-battle roster panels. @param {string} team @returns {Array} */
function rosterRows(team) {
  return game.tanks
    .filter((e) => e.team === team)
    .map((e) => ({
      id: e.specId,
      name: (e.spec && e.spec.name) || e.specId,
      tier: tierNumeral(e.specId),
      isPlayer: !!e.isPlayer,
    }))
    .sort((a, b) => (b.isPlayer ? 1 : 0) - (a.isPlayer ? 1 : 0));
}

/** QA-only cold entry. Production paths already own a loading veil and call
 * the activation owner only after the selected world and roster builders are ready. */
async function debugStartBattle(specId, mapId = null, opts = {}) {
  const resolved = resolveMapId(mapId || worldRuntime.pendingMapId);
  await Promise.all([
    ensureFullFleet(),
    ensureWorld(resolved, null, { precompile: false }),
    preloadSoloBattleRuntime(),
    preloadBattleClientRuntime(),
    ensureBattleHud(),
    ensureTouchControls(),
    armorAimOverlay.preload(),
    ensureFxRuntime(),
    ensureKillcamRuntime(),
    battleWarm.preload(),
    soloBattleStart.preload(),
  ]);
  prepareBattleWorldServices(currentWorld());
  return soloBattleStart.start(specId, resolved, opts);
}

/** Hand the screen to the battle in an immediately readable chase pose. */
function openBattle(preBattleSeconds = PRE_BATTLE_HOLD_S) {
  // battle_countdown r1: the loading screen is down and the world is live —
  // resolve the entry hold armed at roster spawn into the visible countdown.
  // Camera look stays free; hulls, turrets and triggers release at zero.
  if (game.preBattleS === Infinity) {
    game.preBattleS = preBattleSeconds;
  }
  hud.preBattleCountdown(game.preBattleS);
  audio.resume(); // the entry-gate keypress already unlocked the context
  audio.ambientOn(true);
  // Probe/debug starts skip the visible countdown; they still get one rollout
  // edge after the AudioContext exists. Player entries emit at countdown zero.
  if (game.preBattleS <= 0) bus.emit('battle:rollout', {});
}
// Returning from battle or Studio is one typed transaction. It owns the
// teardown order, retained-room policy, transition coalescing, and rematch
// sequencing while main supplies concrete browser/rendering adapters.
const garageReturn = createGarageReturnRuntime({
  game,
  getSelectedSpecId: () => selectedVehicle.id,
  presentation: {
    setAdaptiveSuspended: (suspended) => post.setAdaptiveSuspended(suspended),
    clearBattle: () => {
      armorAimOverlay.clear();
      battleResultPresentation.clearPending();
      killcam.cancel();
      if (killcam.spectate?.active) killcam.spectate.stop(true);
      veilHud(false);
      // cancel() can flush a buffered report, so hide battle UI afterward.
      hud?.setMode?.('hidden');
      endOverlay.hide();
    },
    resetBattleTank: () => resetBattleTankForGarage({
      fx: fxRuntimeAccess.current,
      visual: game.player?.visual,
    }),
    setShotMode: (enabled) => { shotMode = enabled; },
    setCaptureHidden: (hidden) => perfHud.setCaptureHidden(hidden),
    unfreezeEffects: () => fxRuntimeAccess.current?.setFrozen(false),
    resetHudFrame: () => battleHudFrame.reset(),
  },
  network: {
    shouldPreserveRoom: () => networkRoomCoordinator.shouldPreserveAfterResult(),
    disposePresentation: disposeNetworkPresentation,
    closeMatch: closeNetworkMatch,
  },
  warm: {
    invalidate: () => { battleWarmGeneration += 1; },
    cancel: cancelDeferredCombatWarm,
    setPending: (pending) => { battleWarmPending = pending; },
  },
  work: {
    noteActivity: () => garageDressingScheduler.noteActivity(),
    resetFramePacer: (nowMs) => garageFramePacer.reset(nowMs),
    scheduleDressing: scheduleGarageDressingBuild,
  },
  world: {
    currentMapId: () => currentWorld()?.mapId || null,
    ensureGaragePlacement: () => {
      const activeWorld = currentWorld();
      if (activeWorld && worldRuntime.servicesMapId !== activeWorld.mapId) placeGarage();
    },
    setDormant: setWorldDormant,
    setFarCascadeDormant: (dormant) => lighting.setFarCascadeDormant(dormant),
    clearCamoOverrides,
  },
  roster: {
    adoptBattlePlayer: (specId) => pedestal.adoptBattlePlayer(specId)
      ? pedestal.current
      : null,
    clearBattle: (preservedVisual) => clearBattleAfterExit({
      game,
      preservedVisual,
      visualPool: battleVisualPool,
    }),
    repaintHero: (specId) => applyCamoPatternsChunked({
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
    hideHud: () => hud?.setMode?.('hidden'),
    showGarage: (specId) => garage.show(specId),
    poseGarageCamera: garageCameraPose,
    startShowroom: () => showroom.start(),
    triggerBattle: () => document.querySelector('.cot-battle')?.click(),
  },
  audio,
  transition,
  resumeGarageGpu: () => garagePhasePresentation.resumeGpu(),
  isBattleEntryPending: () => battleEntryLifecycle.pending,
  publishTrace: (trace) => { window.__GARAGE_ENTRY = trace; },
});
const enterGarage = garageReturn.enter;
const leaveBattleToGarage = garageReturn.leave;

bus.on('ui:battleAgain', garageReturn.battleAgain);

bus.on('ui:roomOpen', async () => {
  await playSurface.showCurrentRoom();
});

bus.on('ui:roomReady', ({ ready } = {}) => {
  networkRoomCoordinator.setReady(!!ready);
});

bus.on('ui:roomStart', () => networkRoomCoordinator.startRound());

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
  getHud: () => hud,
  getDamagePanel: () => damagePanel,
});
const frameInfo = battleHudFrame.frameInfo;
const refreshSpotFrame = battleHudFrame.refreshSpotting;

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------
// A typed, allocation-free owner samples every device and publishes the one
// mutable camera-input record consumed by the existing rig.
const camInput = playerFrameInput.camera;
const _listenerPose = {
  pos: null, forward: _fwd, kind: 'camera', ownerId: null, scoped: false,
}; // reused — no per-frame literal
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
    pump: (dtSeconds, nowMs) => networkSession.pump(dtSeconds, nowMs),
  },
  countdown: {
    isWarmPending: () => battleWarmPending,
    advance: advancePreBattleCountdown,
    show: (seconds) => hud.preBattleCountdown(seconds),
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
  emitPause: (paused) => bus.emit('ui:pause', { on: paused }),
  simulationDt: SIM_DT,
});
const pauseInfo = battleFrame.pauseInfo;
let lastMs = -1;
let lastFov = camera.fov;
// controls_gunnery r5: true while the current __SHOTS view staged a live HUD
// frame (player_view / sniper_view) — those views re-run hud.update each
// shot-mode frame so the reticle canvas stays live (forceHitMark etc.).
let shotHudFrame = false;
let lastCineActive = false; // battle-open flyby HUD veil edge latch

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
  tick,
  isBootComplete: () => bootComplete,
  // A settled, room-free Garage is event-driven. CSS/UI transitions remain
  // browser-owned; the complete Three.js clock wakes for camera motion,
  // vehicle swaps, transition coverage, loading, input, or retained network
  // authority, and otherwise runs only its five-second safety paint.
  shouldUseIdleCadence: () => bootComplete && game.phase === 'garage' &&
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

function tick(nowMs) {
  frameLoop.schedule();
  if (lastMs < 0) lastMs = nowMs;
  const frameWallDtS = Math.max(0, (nowMs - lastMs) / 1000);
  // Frame dt clamp (0.1 s): a stalled/backgrounded loop never integrates its
  // whole gap. The PAUSE block below extends this on the resume edge.
  let dtR = Math.min(0.1, frameWallDtS);
  lastMs = nowMs;
  devTrace?.frame(dtR * 1000);
  if (graphicsContextLost) return;

  if (battleEntryLifecycle.renderingCovered) return;
  const fx = fxRuntimeAccess.current;
  const world = currentWorld();

  // Sniper-zoom de-fog: at high zoom the exp2 fog + ACES crush distant
  // contrast to haze; scale density down toward 0.35x as FOV drops below 15
  // (applies in shot mode too so sniper_view captures stay crisp).
  if (scene.fog) {
    const fogScale = camera.fov < 15 ? Math.max(0.22, Math.pow(camera.fov / 15, 1.6)) : 1;
    scene.fog.density = baseFogDensity * fogScale;
  }

  // SCENE STUDIO: while active the studio owns the whole frame — no battle
  // sim, no rig, no HUD chrome (src/game/studio.js drives world/fx/render).
  if (studio.active) { studio.tick(dtR); return; }

  if (shotMode) {
    // Deterministic screenshot hold: no sim, no rig, frozen fx clock.
    // (dt = 0 also snaps the foliage occlusion fade to zero — see vegetation.)
    camera.getWorldDirection(_fwd);
    if (world) world.update(0, camera.position, _fwd, null);
    updateSniperFill(); // same close-scope fill state as live play
    fx?.update(dtR, game.shells, camera, resolveFxSubject);
    // controls_gunnery r5: staged HUD views redraw the reticle canvas every
    // frame from the FROZEN frameInfo — the old early-return skipped
    // hud.update entirely, so any post-set() canvas state change (e.g. the
    // __DEBUG.forceHitMark hook, r3) never rendered and staged captures
    // could under-report the live sight picture. Only views that staged a
    // HUD frame (forcedHudFrame sets the latch) redraw; establishing shots
    // stay hidden.
    if (shotHudFrame) battleHudFrame.redrawFrozen();
    lighting.update(true); // force ALL shadow cascades — deterministic capture
    post.render(dtR);
    return;
  }

  // A settled Garage is a static presentation, not a 60 Hz game simulation.
  // Read the controller's allocation-free motion latch before doing any
  // camera solve. Pointer input mutates that latch synchronously, so drag,
  // zoom, spring return, and vehicle swaps still run at display cadence. A
  // settled camera is evaluated only on the bounded watchdog paint instead
  // of re-solving its fixed frame sixty times per second.
  const garageAnimating = game.phase === 'garage' &&
    (showroom.moving || pedestal.switchPending);
  // Persistent room ownership is independent of WebGL presentation cadence.
  // Keep lobby recovery and host snapshots at display cadence even while a
  // settled Garage only paints twice per second.
  if (game.phase === 'garage') networkSession.pump(dtR, nowMs);
  if (game.phase === 'garage' && !garageFramePacer.shouldRender(nowMs, {
    animate: garageAnimating,
  })) return;
  if (game.phase === 'garage') showroom.update(dtR);

  // One typed transaction advances pause/input/network/countdown/simulation,
  // then resolves tank presentation before the camera consumes its anchors.
  const frameState = battleFrame.advance(
    dtR,
    frameWallDtS,
    nowMs,
    game.phase === 'battle' && battleLoad?.covering === true,
  );
  dtR = frameState.dtSeconds;
  const { inBattle, paused, livePaused } = frameState;
  const kcActive = frameState.killcamActive;
  camInput.autoAimPoint = null;
  if (mobileAutoAimTargetId && inBattle && !paused && !kcActive) {
    const target = game.tankById.get(mobileAutoAimTargetId);
    if (!input.isTouchLayout() || !target || !target.combat || target.combat.destroyed ||
        !mobileAutoAimVisible(target)) {
      setMobileAutoAimTarget(null, 'TARGET LOST');
    } else {
      mobileAutoAimCenter(target, mobileAutoAimPoint);
      camInput.autoAimPoint = mobileAutoAimPoint;
    }
  }
  if (inBattle && !paused && !kcActive) rig.update(dtR, camInput);
  if (kcActive) killcam.update(dtR);

  // Battle-open flyby: hide the battle HUD while the rig owns the camera
  // (the rig itself shows the letterbox bars — cameraRig.setLetterbox).
  // Edge-triggered so the kill-cam's own veilHud calls are never fought.
  // killcam_shotinfo r4: re-check killcam.isActive() LIVE — the replay may
  // have STARTED in step 2 of this very tick (death path mid-frame), and the
  // stale frame-top kcActive snapshot let the flyby edge-latch un-veil the
  // battle HUD over a live replay. If the edge is swallowed here, the latch
  // fires on the first frame after the replay ends (veilHud(false) — exactly
  // the state finishBattle/afterDeath restore anyway).
  if (!kcActive && !killcam.isActive() && rig.cinematicActive !== lastCineActive) {
    lastCineActive = rig.cinematicActive;
    veilHud(lastCineActive);
  }
  updateSniperFill(); // close-quarters scope readability (see definition)

  // 4. world LOD/wind (+ WoT-style near-grass suppression while scoped, and
  // chase-camera foliage occlusion fade along player→camera in arcade).
  // r5: rig.aimDist drives the scope-ray foliage corridor length so the cull
  // opens the sight line all the way to the aimed target, not just 70 m.
  // GARAGE PERF (boot r8): a dormant battle world costs nothing per frame —
  // no terrain LOD swap, no vegetation wind rebuild, no prop animation.
  if (world && !worldRuntime.dormant) {
    world.setSniperFade(rig.mode === 'SNIPER' ? 1 : 0, false, camera.fov, rig.aimDist);
  }
  camera.getWorldDirection(_fwd);
  let occlFocus = null;
  const cameraFocus = game.player || (networkSession.spectator ? rig.spectateTargetEnt : null);
  // lighting_post r2: never run the chase-camera occlusion fade during an
  // external capture pose (setExternalPose keeps mode ARCADE) — the fade
  // dithered bushes into screen-door noise in staged combat_firing frames.
  if (inBattle && !kcActive && rig.mode === 'ARCADE' && !rig.externalActive &&
      cameraFocus && cameraFocus.state &&
      cameraFocus.visual && cameraFocus.visual.root.visible) {
    // Keep foliage fading attached to the same interpolated hull pose the
    // player sees; authority can be up to one fixed step ahead on solo clients.
    occlFocus = cameraFocus.visual.root.getWorldPosition(_occlFocus);
    occlFocus.y += cameraFocus.spec.dims.heightM * 0.75;
  }
  if (world && !worldRuntime.dormant) world.update(dtR, camera.position, _fwd, occlFocus);

  // 5. fx — dt 0 while live-paused pins the shared particle clock, which is
  // the one timeline every particle/timer/light/decal ages against (the same
  // mechanism deterministic shot captures rely on), so effects hold mid-air.
  // killcam r2: the replay's IMPACT beat briefly dilates the fx clock (~0.55x
  // through the turret launch) — the same clock drives the pop arc, so the
  // whole destruction slows coherently. 1 everywhere else.
  if (fx) {
    fx.update(livePaused ? 0 : dtR * (kcActive ? killcam.fxTimeScale : 1),
      game.shells, camera, resolveFxSubject);
  }

  // Objective markers are retained, shadow-free meshes. Standard battles and
  // the garage hide the root, so the feature adds no traversal work there.
  matchModeWorld.update(inBattle ? game.matchModeState : null, game.timeS);

  // 7. HUD (hidden + frozen while the kill-cam letterbox owns the screen).
  battleHudFrame.update(inBattle, kcActive);

  // 8. audio
  camera.getWorldDirection(_fwd);
  // World audio uses a HYBRID listener, matching vehicle games: azimuth comes
  // from the camera (so looking around still pans correctly), while distance
  // comes from the occupied vehicle. The old camera-position distance made a
  // 24 m arcade chase offset attenuate even the player's own engine/cannon;
  // entering sniper moved the camera to the trunnion and falsely made the
  // whole nearby mix spring back. Kill-cam deliberately returns to the
  // cinematic camera; spectator mode follows its current ally.
  let audioEnt = null;
  if (inBattle && !kcActive && !killcam.isActive()) {
    const spectateId = killcam.spectate.active ? killcam.spectate.targetId : null;
    audioEnt = spectateId ? game.tankById.get(spectateId) : game.player;
  }
  if (audioEnt && audioEnt.state && audioEnt.state.pos) {
    _audioPos.copy(audioEnt.state.pos);
    _audioPos.y += (audioEnt.spec && audioEnt.spec.dims
      ? audioEnt.spec.dims.heightM * 0.68 : 1.6);
    _listenerPose.pos = _audioPos;
    _listenerPose.kind = killcam.spectate.active ? 'spectated-tank' : 'player-tank';
    _listenerPose.ownerId = audioEnt.id;
    _listenerPose.scoped = rig.mode === 'SNIPER' && !!camera.userData.scoped;
  } else {
    _listenerPose.pos = camera.position;
    _listenerPose.kind = kcActive || killcam.isActive() ? 'killcam-camera' : 'camera';
    _listenerPose.ownerId = null;
    _listenerPose.scoped = false;
  }
  audio.update(dtR, _listenerPose, game.tanks);

  // 9-10. shadows + post
  // FEEL r12: fov lerps (scope zoom / aim transitions / per-shot recoil
  // kick) hit this EVERY frame of the animation — the full updateFrustums
  // swept all CSM-registered materials each time (~1 ms/frame, the "look
  // around is laggy" report). Splits are fov-independent; refresh only the
  // cascade geometry.
  if (camera.fov !== lastFov) { lighting.updateFov(); lastFov = camera.fov; }
  const garageShadowsDirty = game.phase === 'garage'
    && (garageAnimating || garagePresentationDirty);
  lighting.setStaticPresentationDormant(
    game.phase === 'garage' && !garageShadowsDirty,
  );
  lighting.update(false, dtR);
  post.render(dtR);
  if (game.phase === 'garage') garagePresentationDirty = false;
  if (game.phase === 'battle') battleEntryLifecycle.noteBattleFrame();
  perfHud.update(dtR * 1000); // FEEL r12: after render — info.render is fresh
}

// Deterministic engineering captures keep a synchronous discovery facade for
// screenshot tooling, while the orchestration and recipes stay out of every
// ordinary garage/battle download until set() is explicitly called.
window.__SHOTS = {
  views: [...SHOT_VIEWS],
  async set(name) {
    if (!SHOT_VIEWS.includes(name)) throw new Error(`Unknown screenshot view: ${name}`);
    const { setShotView } = await import('./dev/shotRuntime.ts');
    return setShotView(name, {
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
      setBattleStaged: (value) => { battleStaged = value; },
      buildShellCards: playerBattleActions.setTank,
      setDamagePanelTank: (spec, visual) => damagePanel.setTank(spec, visual),
      setDamagePanelEquipment: (equipment) => damagePanel.setEquipment(equipment),
      groundSampler,
      input,
      settings,
      showroom,
      setShotMode: (value) => { shotMode = value; },
      setCaptureHidden: (value) => perfHud.setCaptureHidden(value),
      resetPostPerfTrims: () => post.resetPerfTrims(),
      setShotHudFrame: (value) => { shotHudFrame = value; },
      setGarageSpots,
      setGarageSunTrim,
      hideGarage: () => garage.hide(),
      hideEndOverlay: endOverlay.hide,
      setLastFov: (value) => { lastFov = value; },
      refreshSpotFrame,
      getWorld: currentWorld,
      getHud: () => hud,
      getFx: () => fxRuntimeAccess.current,
      getKillcam: () => killcam,
      getShellCards: () => playerBattleActions.shellCards,
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
    });
  },
};

// ---------------------------------------------------------------------------
// Boot: garage first, warm the pipeline, then declare readiness.
// ---------------------------------------------------------------------------
// BOOT DEFERRAL seam: battle staging (and with it game.player) now happens on
// first world activation (ensureBattleStaged), not at boot — so prime the HUD
// cards from the SELECTED SPEC here. ensureBattleStaged re-primes from the
// real player entity when a battle actually stages.
playerBattleActions.setTank(getSpec(selectedVehicle.id));
garage.show(selectedVehicle.id);
garageCameraPose(); // fallback pose until the orbit measures the hero
showroom.start();
garageFramePacer.reset(performance.now());
setGarageSunTrim(true); // camo_spotting r2: boot lands on the garage screen
hud?.setMode('hidden');

// BOOT DEFERRAL seam: the battlefield build is deferred until BATTLE is
// pressed, so `world` is legitimately null on the garage boot path — the
// garage bay renders without it. When a world IS already active (harness
// staging a battlefield view before readiness), warm it as before.
if (currentWorld()) {
  currentWorld().update(0, camera.position);
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
    reportProgress: (fraction) => boot.sub(fraction),
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
// - light-set warm (r4): garage spots hidden changes the program hash (see
//   setGarageSpots), so entering battle swaps programs instead of compiling
//   ~70 of them inside the opening frames.
function warmStudioPipelineChunked(onProgress = null) {
  const fx = requireFxRuntime();
  return battleWarm.warmStudioEffects({
    fx,
    post,
    renderer,
    camera,
    initializeForwardPrograms: forwardProgramWarm.initializeSteps,
    isCombatPipelineWarmed: combatWarm.isRareReady,
    onProgress,
    onTrace: (trace) => { window.__STUDIO_WARM = trace; },
  });
}
// perf-r5 (owner: "first garage entry laggy"): the warm used to run as ONE
// idle callback (~1-3 s: volley + every wreck dance + all compiles) the
// moment the staged pump finished — exactly when the player starts touching
// the garage. Generator core with per-step yields; the sync wrapper (battle
// load / __SHOTS — the screen owns those frames) drains it whole, the
// chunked owner gives the garage a painted frame between steps. A battle
// entered mid-chunk drains the remaining generator synchronously.

const deferredCombatWarm = createDeferredCombatWarmRuntime({
  game,
  renderer,
  camera,
  getBattleVisuals: () => battleVisuals,
  combatWarm,
  battleWarm,
  getWorld: currentWorld,
  getGeneration: () => battleWarmGeneration,
  setPending: (pending) => { battleWarmPending = pending; },
  prepareNextOpeningRoute,
  devTrace,
});
function cancelDeferredCombatWarm() { deferredCombatWarm.cancel(); }
function scheduleDeferredCombatWarm(generation) {
  return deferredCombatWarm.schedule(generation);
}
// Shared private HDR warmer for covered battle entry and the demand-loaded
// fallback combat owner. Its one-eighth scale touches identical programs,
// textures and depth state without presenting partial frames or paying the
// full-resolution fragment bill.
const warmRender = createOffscreenSceneWarmer(renderer, scene, camera, 0.125);
const deploymentShadowWarm = createDeploymentShadowWarmOwner({
  renderer,
  scene,
  camera,
  lighting,
  warmRender,
  getWorldGroup: () => currentWorld()?.group ?? null,
  noteFovPrimed: (fov) => { lastFov = fov; },
  simDt: SIM_DT,
});

function createCombatWarmRuntimeContext() {
  return {
    game,
    fx: requireFxRuntime(),
    post,
    renderer,
    camera,
    scene,
    world: currentWorld,
    warmRender,
    deploymentShadowWarm,
    forwardProgramWarm,
    lighting,
    scratch1: _v1,
    scratch2: _v2,
    scratch3: _v3,
    anisotropy: engineCtx.anisotropy ?? 4,
    ensureStagedVisuals,
    prebakeBurntSteps,
    warmWreckTextures,
    createIsolatedForwardWarmBatches,
    isOpeningReady: () => combatWarm.isOpeningReady(),
    isRareReady: () => combatWarm.isRareReady(),
    markOpeningReady: () => combatWarm.markOpeningReady(),
    markRareReady: () => combatWarm.markRareReady(),
    isDestructionWarmed: () => combatDestructionEffectsWarmed,
    setDestructionWarmed: (value) => { combatDestructionEffectsWarmed = value; },
  };
}

// Heavy combat caches intentionally do not warm in the interactive garage or
// the Studio. Battles own the complete roster/wreck/shadow warm; Studio uses
// the focused shared-FX warm above and compiles only actors it actually adds.

// SCENE STUDIO (staging rig + scripted marketing-shot API, src/game/studio.js):
// entered via ?studio=1 (map via ?map=…) or F8 from the garage; scriptable via
// window.__STUDIO (schema in docs/STUDIO.md). main.js only hands it these
// integration seams plus the one tick() branch above — entry keys, panel,
// actors, effects, capture all live in the studio module.
const studioAccess = createStudioAccess({
  loadModule: () => import('./game/studio.js'),
  preloadFxModule,
  ensureFxRuntime,
  prepareRuntime: () => lighting.setFarCascadeDormant(false),
  createContext: (studioFx) => ({
    renderer, scene, camera, post, lighting, game, hud, garage, showroom,
    hfProxy, getWorld: currentWorld,
    ensureWorld: (id, onProgress) => ensureWorld(id, onProgress, {
      precompile: false,
      compilePrograms: true,
      services: false,
    }),
    setWorldDormant,
    setGarageSpots, setGarageSunTrim, enterGarage,
    warmStudioPipeline: warmStudioPipelineChunked,
    transition,
    // main.js owns both direct boot and the first lazy F8 handoff.
    autoEnter: false,
    fx: studioFx,
  }),
  getPhase: () => game.phase,
  keyTarget: window,
});
const studio = studioAccess.presentation;
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
      onProgress: (fraction, label) => {
        boot.sub(fraction);
        if (label) boot.note(label);
      },
    });
  });
}

bootComplete = true;
frameLoop.schedule();

// ---------------------------------------------------------------------------
// Debug / drive-test hooks (not part of the screenshot contract).
// ---------------------------------------------------------------------------

const driveTestRequested = import.meta.env.DEV
  || debugModeRequested()
  || navigator.webdriver;
const driveTestController = driveTestRequested
  ? (await import('./dev/driveTestController.ts')).createDriveTestController({
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
  })
  : {
    aimTargetId: null,
    aimAtNearest: () => null,
    gunAimError: () => Infinity,
    aimState: () => null,
    fastForward: () => 0,
    spawnKillShell: () => false,
    slayEnemies: () => {},
    resetAim: () => {},
  };

if (diagnosticsRequested) {
  const { createCombatTelemetry } = await import('./dev/combatTelemetry.ts');
  createCombatTelemetry({
    enabled: true,
    bus,
    getGame: () => game,
    getPinnedTargetId: () => driveTestController.aimTargetId,
    getAimBlockedDistance: () => frameInfo.aim.blockedDistM,
    playerShellLog,
    botPressure,
  });
}

if (diagnosticsRequested) {
  await perfHud.preload().catch((error) => {
    console.warn('[diagnostics] optional engineering runtime failed to load', error);
  });
}
if (debugModeRequested() || input.getSettings().showDebugHud) perfHud.setVisible(true);
if (diagnosticsRequested) {
  const { installDebugSurface } = await import('./dev/debugSurface.ts');
  installDebugSurface({
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
    selectGarageTank: (id) => garage.setSelected(id),
    stagePedestalTank: (id) => {
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
    bakeMinimapForMap: async (mapId) => {
      await ensureBattleHud();
      const next = await ensureWorld(mapId, null, { precompile: false, services: false });
      buildWorldMinimap(next, true);
      return hud.exportMinimapBackground('image/webp', 0.92);
    },
    beginBattleEntry,
    beginSoloBattle,
    beginNetworkBattle: (request) => networkBattleLauncher.beginPrivate(request),
    enterGarage,
    leaveBattleToGarage,
    spawnKillShell: driveTestController.spawnKillShell,
    getShotMode: () => shotMode,
    setShotMode: (value) => { shotMode = !!value; },
    forceHitMark: async (bounced) => {
      await ensureBattleHud();
      hud.forceHitMark(!!bounced);
    },
    getDamagePanel: () => damagePanel,
    getNetworkDiagnostics: () => networkSession.diagnostics(),
    getNetworkPresentationStats: () => (
      networkSession.bridge?.getPresentationEventStats?.() || null
    ),
    collectTelemetry: () => perfHud.collectTelemetry(),
    sampleShadowContribution: () => perfHud.sampleShadowContribution(),
    injectNetworkEvents: (events) => {
      const latestNetworkSnapshot = networkSession.latestSnapshot;
      if (!import.meta.env.DEV || !networkSession.bridge || !latestNetworkSnapshot) return false;
      const batch = Array.isArray(events) ? events : [];
      const matchEnded = batch.find((event) => event?.type === 'match_ended');
      const snapshot = matchEnded
        ? { ...latestNetworkSnapshot,
          meta: { ...latestNetworkSnapshot.meta, result: matchEnded.result } }
        : latestNetworkSnapshot;
      return networkSession.bridge.apply(snapshot, 1 / 60, batch);
    },
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
// rescue + recompile (deviceDiag.js). Skipped under webdriver so harness
// captures stay deterministic; a second check runs at battle start.
if (!navigator.webdriver || new URLSearchParams(location.search).has('diagforce')) {
  setTimeout(() => runSceneBlackWatchdog(renderer, scene, camera), 1200);
  // MOBILE r5: if the boot probe turned shadows off (one-boot false-negatives
  // happen — the owner's phone), try them back on once the live scene proves
  // healthy; keep only if the measured frame stays healthy (deviceDiag.js).
  setTimeout(() => reclaimShadows(renderer, scene, camera), 3400);
}
