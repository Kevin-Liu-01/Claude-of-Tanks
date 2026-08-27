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
 * progress to src/ui/bootScreen.js, so the bar tracks work instead of a timer,
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
import { createRenderer } from './engine/renderer.js';
import {
  createOffscreenSceneWarmer,
  warmSceneOffscreenBatched,
} from './engine/offscreenWarm.js';
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
import { createIsolatedForwardWarmBatches } from './engine/deploymentWarm.ts';
import { createDeploymentShadowWarmOwner } from './engine/deploymentShadowWarm.ts';
// DESTRUCTIBLES r1: prop-destruction bus seam (audio subscribes to the event)
import { setDestroyedEventSink } from './world/destructibles.js';
import { MAP_IDS, getMapConfig, resolveMapId } from './world/maps/index.js';
import { createWorldBuildCoordinator } from './world/worldBuildCoordinator.ts';
import { MAP_THUMBS } from './ui/mapThumbs.js';
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
import { createMinimapAssetRuntime } from './ui/minimapAssetRuntime.ts';
import { createGarage } from './ui/garage.js';
import { getLastBattleRecord, installBattleRecords } from './game/profile.js';
import {
  createGarageStage, GARAGE_PODIUM_TOP_Y_M, GARAGE_TRACK_AXIS_YAW_RAD,
} from './ui/garageStage.js';
import { createGarageDressingAccess } from './game/garageDressingAccess.ts';
import { createGarageDressingScheduler } from './game/garageDressingScheduler.ts';
import { createGaragePedestalRuntime } from './game/garagePedestalRuntime.ts';
import { createGarageShowroomRuntime } from './game/garageShowroomRuntime.ts';
import { createGarageIdleWorkCoordinator } from './game/garageIdleWorkCoordinator.ts';
import { createBattleIntentRuntime } from './game/battleIntentRuntime.ts';
import { createKillcamAccess } from './game/killcamAccess.ts';
import { createPlayerBattleActions } from './game/playerBattleActions.ts';
import { createPlayerFrameInput } from './game/playerFrameInput.ts';
import { createBattlePresentationRuntime } from './game/battlePresentationRuntime.ts';
import { createSoloBattleDeploymentRuntime } from './game/soloBattleDeploymentRuntime.ts';
import { createBattleVisualPool } from './game/battleVisualPool.js';
import { createBattleVisualStreamerAccess } from './game/battleVisualStreamerAccess.ts';
import {
  clearBattleAfterExit,
  resetBattleTankForGarage,
} from './game/garageTankLifecycle.js';
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
import { createNetworkRecoveryOwner } from './net/connectionRecovery.ts';
import { createNetworkFramePump } from './net/networkFramePump.ts';
import { createNetworkBattleBarrier } from './net/networkBattleBarrier.ts';
import { createNetworkRoomCoordinator } from './net/networkRoomCoordinator.ts';
import { createNetworkBattleLaunchRuntime } from './net/networkBattleLaunchRuntime.ts';
import { loadEquipment as loadSelectedEquipment } from './game/equipment.js';
import { createSettingsAccess } from './ui/settingsAccess.ts';
import { createTouchControlsAccess } from './ui/touchControlsAccess.ts';
import { installResponsiveLayout } from './ui/responsiveLayout.js';
import { installResponsiveSurfaceStyles } from './ui/responsiveSurfaces.js';
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
import { createBootScreen } from './ui/bootScreen.js';
import { createBattleLoadScreen } from './ui/battleLoad.js';
import { tierNumeral } from './vehicles/tier.js';
import { createTransition } from './ui/transition.js';
// Direct /studio navigation is a distinct boot target, not "boot the garage,
// reveal it, then start a second load".  The intent is captured before any
// staged work so the inline boot screen can report Studio-specific progress
// and main.js can hand the already-visible veil to createStudio().
const INITIAL_PARAMS = new URLSearchParams(globalThis.location?.search || '');
const STUDIO_BOOT_INTENT = /^\/studio\/?$/.test(globalThis.location?.pathname || '')
  || INITIAL_PARAMS.has('studio');
const STUDIO_BOOT_MAP = INITIAL_PARAMS.get('map') || 'verdant';

const DEG = Math.PI / 180;
const SIM_DT = 1 / 60;
const GARAGE_POS = new THREE.Vector3(-1500, 0, -1500);
const MAX_SIM_STEPS = 4;
const DEFAULT_SPEC_ID = 'm1a1';
const LAST_SPEC_KEY = 'cot.lastTank.v1';
// Keep invite parsing off the normal garage boot graph. Only an actual room
// link loads the tiny URL adapter; the play menu already owns it lazily.
const pendingRoomInvitePromise = new URLSearchParams(globalThis.location?.search || '').has('room')
  ? import('./net/roomInvite.js').then(({ parseRoomInvite }) =>
    parseRoomInvite(globalThis.location?.href))
  : null;

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

function loadLastSpecId() {
  try {
    const id = localStorage.getItem(LAST_SPEC_KEY);
    if (id && VISIBLE_TANK_IDS.includes(id)) return id;
  } catch (_) { /* storage unavailable/private mode */ }
  return DEFAULT_SPEC_ID;
}

function rememberSpecId(id) {
  if (!VISIBLE_TANK_IDS.includes(id)) return;
  try { localStorage.setItem(LAST_SPEC_KEY, id); } catch (_) { /* storage unavailable */ }
}

// Resolve the remembered hero and begin its exact family transfers before
// renderer/garage construction. This overlaps network work with the staged
// boot without constructing a tank or touching WebGL ahead of startup order.
let selectedSpecId = loadLastSpecId();
const bootSelectedBuilderP = STUDIO_BOOT_INTENT
  ? Promise.resolve()
  : ensureTankBuilder(selectedSpecId);

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
// BOOT STAGES (src/ui/bootScreen.js)
//
// The module body below is a staged boot sequence: each heavy step runs inside
// bootStage(), which names the stage on the loading screen, yields a frame so
// the bar paints, runs the work, then advances the bar. Stage keys and their
// weights (measured shares of boot wall-clock) live in bootScreen.js STAGES.
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
// Worlds are lazy-built per map config and cached; `world` always points at
// the active one (null until one exists). Long-lived systems (camera rig, fx,
// kill-cam) reach terrain through the stable proxy below, so a map switch —
// or a boot with no world at all — never leaves them holding a stale or
// missing heightfield.
//
// PERF (boot r8): the battlefield used to be built synchronously right here,
// on the boot-critical path, even though the garage bay is fully enclosed and
// cannot see a single triangle of it. The 1 km terrain bake + vegetation +
// props + minimap capture are now deferred to ensureWorld(), which the battle
// entry (behind the pre-battle loading screen) and the __SHOTS staging path
// call. Boot never touches them.
let world = null;
let pendingMapId = 'verdant';    // battlefield the garage is pointing at
let pendingMapChoice = 'verdant'; // includes the non-prefetchable Random card
let worldDormant = false;        // garage: world hidden + per-frame update off
let worldServicesMapId = null;   // collider/minimap/garage placement prepared
// The sky/fog preset the atmosphere is currently keyed to. Seeded with the
// boot map so the FIRST activation of 'verdant' behaves exactly like the old
// boot did (createSky's DEFAULT_PRESET + one applyFog, no applyPreset) —
// switching away and back still re-keys, as switchMap always did.
let skyMapId = 'verdant';
const _upNormal = new THREE.Vector3(0, 1, 0);
const hfProxy = {
  getHeightAt: (x, z) => (world ? world.heightField.getHeightAt(x, z) : 0),
  getNormalAt: (x, z) => (world ? world.heightField.getNormalAt(x, z) : _upNormal),
  getGroundType: (x, z) => (world ? world.heightField.getGroundType(x, z) : 'hard'),
  getWaterMaskAt: (x, z) => (world ? world.heightField.getWaterMaskAt(x, z) : 0),
  get size() { return world ? world.heightField.size : 1000; },
  get minY() { return world ? world.heightField.minY : 0; },
  get maxY() { return world ? world.heightField.maxY : 0; },
};

const garageIdleWorkCoordinator = createGarageIdleWorkCoordinator();
const garageFramePacer = createGarageFramePacer();
if (typeof window !== 'undefined') {
  window.__GARAGE_IDLE_WORK = garageIdleWorkCoordinator.stats;
}
const worldBuildCoordinator = createWorldBuildCoordinator({
  engineContext: engineCtx,
  scene,
  renderer,
  deviceTier: getDeviceTier(),
  getCurrentWorld: () => world,
  getGarageActivity: () => ({
    phase: game.phase,
    transitionActive: transition.active,
    lastActivityAt: garageDressingScheduler.getLastActivityAt(),
  }),
  releaseShadowMaterial: (resource) => lighting.releaseShadowMaterial(resource),
  acquireBackgroundWork: (kind, stillValid) =>
    garageIdleWorkCoordinator.acquire(kind, stillValid),
});
const worldCache = worldBuildCoordinator.cache;
const residentLimits = worldBuildCoordinator.resourceLimits;
const worldPrefetchStats = worldBuildCoordinator.stats;
if (typeof window !== 'undefined') window.__WORLD_PREFETCH = worldPrefetchStats;
const loadWorldModule = worldBuildCoordinator.loadModule;
const enforceWorldCacheBudget = worldBuildCoordinator.enforceCacheBudget;
const beginWorldBuild = worldBuildCoordinator.beginBuild;
const prefetchWorld = worldBuildCoordinator.prefetch;
const cancelBackgroundWorldBuildsExcept = worldBuildCoordinator.cancelBackgroundExcept;

/** World raycast that is safe before any battlefield exists. */
function worldRaycast(o, d, m) { return world ? world.raycast(o, d, m) : null; }

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
let collider = null;
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
const groundSampler = (x, z) => (
  world && !shotMode && world.heightField.getHeightAtFast
    ? world.heightField.getHeightAtFast(x, z)
    : hfProxy.getHeightAt(x, z)
);
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
    getWorld: () => world,
    getNetworkTelemetry: () => networkFramePump.diagnostics(),
    resolvePresetName,
    getDeviceTier,
  });
  const hudRuntime = createPerfHud({ renderer, game, trace: devTrace });
  hudRuntime.setTelemetryProvider(telemetry.collect);
  devTrace?.configure({ getTelemetry: telemetry.collect });
  return { hud: hudRuntime, telemetry };
});
if (typeof window !== 'undefined') window.__PERF_HUD = perfHud;
// hud_ui r2: key 160 → 112, penumbra 0.45 → 0.6 — the warm key stacked with
// the stage floods and clipped the turntable floor right of the tank to 255.
// hud_ui r5 (+ tank_models r5 garage-key rolloff): 112 → 78 / 80 → 58 with
// wider penumbras — the light pool under the turntable was a blown-out
// uniform white disc with a hard rim; lower peak stops the clip to paper
// white, wider penumbra turns the pool edge into a radial falloff.
// camo_spotting r2: neutralize the warm key + cool fill — desert/winter camo
// schemes rendered honey-gold/cream on the pedestal vs their in-battle tone.
const spotA = new THREE.SpotLight(0xf2f0e8, 64, 60, 0.5, 0.85, 1.6);
spotA.position.set(GARAGE_POS.x + 9, GARAGE_POS.y + 11, GARAGE_POS.z + 7);
const spotB = new THREE.SpotLight(0xdce3ec, 48, 60, 0.6, 0.8, 1.6);
spotB.position.set(GARAGE_POS.x - 10, GARAGE_POS.y + 8, GARAGE_POS.z - 6);
const spotTarget = new THREE.Object3D();
spotTarget.position.set(GARAGE_POS.x, GARAGE_POS.y + 1.2, GARAGE_POS.z);
scene.add(spotTarget, spotA, spotB);
spotA.target = spotTarget;
spotB.target = spotTarget;
// PERF (performance_budget r4): the garage spots light NOTHING in battle (60 m
// range, garage is 1500+ m from the battlefield) yet every battle draw paid
// their per-material spot-light uniform uploads and per-fragment loop
// (uniform3f measured 3.8 s of a 35 s battle profile). Hide them outside the
// garage; both light-count shader variants are pre-compiled at boot so the
// toggle never causes a mid-battle compile storm.
function setGarageSpots(on) {
  if (spotA.visible === on) return;
  if (!on) lighting.setFarCascadeDormant(false);
  spotA.visible = on;
  spotB.visible = on;
  // garage-scene r1: the workshop dressing (and its one whisper fill light)
  // rides the same toggle — hidden subtrees drop out of the render list, so
  // battle frames never draw, cull or light any of it. The light-count change
  // shares the spots' pre-compiled shader-variant story (warmCombatPipeline
  // compiles the battle set with this toggle OFF).
  garageDressing.group.visible = on;
}

// camo_spotting r2: the pedestal is keyed by the ACTIVE MAP's warm sun
// (verdant 0xfff1dc @ 4.5) — desert paint read honey-gold and winter wash
// cream on the turntable vs the same paint's in-battle tone. While the garage
// screen is up the sun is re-keyed to near-neutral white and trimmed (at the
// map's full 4.5 the hull sat at 0.85+ display luma, inside the post grade's
// WARM highlight split-tone pole); battle entry / staged shots restore the
// map's authored sun via the same setSun call.
const GARAGE_SUN_COLOR = 0xf2f0ea;
function setGarageSunTrim(on) {
  // boot r8: the world is deferred, so fall back to the config of the map the
  // garage is currently pointing at (identical to the old boot, which read
  // verdant's config off the eagerly built world).
  const skyCfg = (world ? world.config.sky : getMapConfig(pendingMapId).sky) || {};
  lighting.setSun(sky.sunDir, on
    ? { ...skyCfg, sunColorHex: GARAGE_SUN_COLOR,
        sunIntensity: (skyCfg.sunIntensity ?? 4.5) * 0.55 }
    : skyCfg);
}

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
  renderer,
  camera,
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
  nextFrame,
  getDeviceTier,
  getPhase: () => game.phase,
  isBootComplete: () => bootComplete,
  getSelectedId: () => selectedSpecId,
  getNeighborIds: () => garage?.getNeighborIds?.(2) || [],
  getBattlePlayer: () => game.player,
  getBattleEntity: (specId) => game.tankById.get(specId),
  groundSampler,
  scheduleDelay: (callback, delayMs) => setTimeout(callback, delayMs),
  acquireBackgroundWork: (kind, stillValid) =>
    garageIdleWorkCoordinator.acquire(kind, stillValid),
  debugTarget: typeof window !== 'undefined' ? window : null,
});

const noteGarageActivity = () => {
  garageFramePacer.noteActivity(performance.now());
  garageDressingScheduler.noteActivity();
  pedestal.invalidatePreload();
};
for (const type of ['pointerdown', 'wheel', 'keydown', 'touchstart']) {
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
  await pedestal.prepareInitial(selectedSpecId, {
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
// Re-seat the garage stage on the active map's edge terrain height.
function placeGarage() {
  GARAGE_POS.y = hfProxy.getHeightAt(GARAGE_POS.x, GARAGE_POS.z);
  garageStage.group.position.copy(GARAGE_POS);
  garageDressing.group.position.copy(GARAGE_POS); // dressing re-seats with the stage
  spotA.position.set(GARAGE_POS.x + 9, GARAGE_POS.y + 11, GARAGE_POS.z + 7);
  spotB.position.set(GARAGE_POS.x - 10, GARAGE_POS.y + 8, GARAGE_POS.z - 6);
  spotTarget.position.set(GARAGE_POS.x, GARAGE_POS.y + 1.2, GARAGE_POS.z);
  pedestal.poseCurrent();
  if (game.phase === 'garage') garageCameraPose();
}

/**
 * Make `next` the active battlefield: hide whatever was active, re-target
 * atmosphere/lighting to the map's sky preset, rebuild the collider + minimap
 * and optionally prepare the battle/garage-only services.
 * @param {object} next a World from createMap/createMapAsync
 * @param {{services?:boolean}} [opts]
 * @returns {object|Promise<object>} active World, immediately when cached
 */
function buildWorldMinimap(next, textured = true) {
  if (!hud) return;
  hud.buildMinimap(next.heightField, next.getMinimapFeatures(), next.config.minimap,
    textured ? minimapSnapCtx() : null);
}

const MINIMAP_ASSET_VERSION = 'spawn-oriented-v2';
function minimapAssetUrl(mapId) {
  return `${import.meta.env.BASE_URL || '/'}minimaps/${encodeURIComponent(mapId)}.webp` +
    `?v=${MINIMAP_ASSET_VERSION}`;
}

// Upgrade the immediately available procedural tactical map with the exact
// supersampled background baked by tools/bake-minimap-assets.mjs. The typed
// owner rejects stale map results and invokes the procedural fallback without
// exposing its promise/generation state to this composition root.
const minimapAssets = createMinimapAssetRuntime({
  isReady: () => !!hud,
  getActiveWorld: () => world,
  isPrepared: (mapId) => worldServicesMapId === mapId,
  loadAsset: (next, url) => hud.buildMinimapFromAsset(next.heightField, url),
  buildFallback: (next) => buildWorldMinimap(next, false),
  assetUrl: minimapAssetUrl,
  now: () => performance.now(),
  publishTrace: (trace) => {
    if (typeof window !== 'undefined') window.__MINIMAP_LOAD = trace;
  },
});

function prepareWorldServices(next = world) {
  if (!next || world !== next) return;
  // Background map intent is garage-safe. The solo collider is created when
  // the battle runtime arrives; private/ranked presentation does not use it.
  collider = isSoloBattleRuntimeReady() ? createCollider(game, next) : null;
  if (worldServicesMapId === next.mapId) {
    placeGarage();
    minimapAssets.queue(next);
    return;
  }
  placeGarage();
  worldServicesMapId = next.mapId;
  minimapAssets.queue(next);
}

function prepareBattleWorldServices(next = world) {
  if (!next || world !== next) return;
  collider = createCollider(game, next);
  placeGarage();
  if (worldServicesMapId !== next.mapId) {
    // The exact background is preloaded on Battle intent while the world is
    // still building. Do not synchronously resample the complete heightfield
    // into a duplicate fallback here; that old safety path made the roster
    // frame pay ~0.2-0.5 s of pure CPU work. A failed static asset installs the
    // same full-resolution procedural cartography through minimapAssets.
    worldServicesMapId = next.mapId;
  }
  minimapAssets.queue(next);
}

function activateWorld(next, { services = true } = {}) {
  if (world && world !== next) world.group.visible = false;
  world = next;
  worldDormant = false;
  world.group.visible = true;
  // LOADING PERF (boot r9): the cloud-deck sprites bake lazily (see sky.js) —
  // an active battlefield is the first thing that can see the sky, so finish
  // them here (idempotent; usually already done by the post-ready idle chain,
  // and applyPreset below re-asserts it on map re-keys).
  sky.ensureCloudTextures();
  pendingMapId = world.mapId;
  const skyCfg = world.config.sky || {};
  // Only re-key the atmosphere when the map actually changed — the first
  // activation of the boot map keeps createSky's DEFAULT_PRESET exactly as the
  // old eager boot did (see skyMapId).
  if (skyMapId !== world.mapId) {
    skyMapId = world.mapId;
    sky.applyPreset(skyCfg, scene);
    baseFogDensity = scene.fog.density;
  }
  lighting.setSun(sky.sunDir, skyCfg);
  // Studio never consumes the simulation collider, hidden battle minimap, or
  // garage placement. Building all three during a direct Studio launch costs
  // hundreds of milliseconds without changing its visible frame.
  if (services) prepareWorldServices(next);
  else {
    collider = null;
    if (worldServicesMapId !== next.mapId) worldServicesMapId = null;
  }
  enforceWorldCacheBudget();
  return world;
}

/**
 * MAP-CONFIG WIRING: activate a cached battlefield immediately, or return the
 * asynchronous world-build promise for callers that deliberately switch cold.
 * @param {string} mapId concrete map id (never 'random' — resolve first)
 * @returns {object} the active World
 */
function switchMap(mapId) {
  if (world && world.mapId === mapId) return world;
  const next = worldCache.get(mapId);
  return next ? activateWorld(next) : ensureWorld(mapId);
}

/**
 * BOOT DEFERRAL: guarantee a battlefield exists and is active, building it one
 * subsystem per frame so the caller's loading bar keeps animating.
 * @param {string} mapId concrete map id
 * @param {?function(number, string):void} [onProgress] (fraction, label)
 * @param {{precompile?:boolean,compilePrograms?:boolean,services?:boolean}}
 *   [opts] optionally submit color programs without the exhaustive shadow
 *   warm, and defer battle/garage-only services for Studio
 * @returns {Promise<object>} the active World
 */
async function ensureWorld(mapId, onProgress = null, opts = null) {
  const id = mapId || pendingMapId;
  cancelBackgroundWorldBuildsExcept(id);
  let next = worldCache.get(id);
  const wt = { id, cached: !!next };
  const wtStart = performance.now();
  let wtMark = wtStart;
  const wtStage = (key) => {
    const now = performance.now();
    wt[key] = Math.round(now - wtMark);
    wtMark = now;
  };
  if (!next) {
    const rec = beginWorldBuild(id, onProgress);
    try {
      next = await rec.promise;
      wt.buildDetail = { ...rec.stageTimings };
      if (next._buildDetail?.vegetation) {
        wt.buildDetail.vegetationDetail = { ...next._buildDetail.vegetation };
      }
      if (next._buildDetail?.terrain) {
        wt.buildDetail.terrainDetail = { ...next._buildDetail.terrain };
      }
    } finally {
      if (onProgress && rec.listeners) rec.listeners.delete(onProgress);
    }
  }
  wtStage('build');
  // Keep the fresh world out of the normal render loop while yielding the
  // progress frame. Showing it here made that supposedly cheap paint frame
  // perform a full first world/shadow render before the explicit warm below.
  next.group.visible = false;
  // perf-r3: assembleWorld and activateWorld (minimap top-down capture,
  // collider build, sky re-key) used to fuse into one ~1.6 s task — give the
  // loading bar a painted frame between them.
  // Fine-sliced builders have already painted progress immediately before
  // sealing the world. Fast-path battle/Studio loads skip a redundant extra
  // frame here; exhaustive capture/shot preparation keeps the old seam.
  if (opts?.precompile !== false) await nextFrame();
  wtStage('present');
  next.group.visible = true;
  // perf-r5c (retina probe): activateWorld's minimap capture was the FIRST
  // render touching the fresh world's programs — 55 links resolved in that
  // one slice (630 ms). Submit the compiles now, let the parallel linker
  // breathe, and bake the cloud decks one-per-frame; the capture then binds
  // ready programs and baked clouds.
  if (opts?.precompile !== false || opts?.compilePrograms === true) {
    try {
      if (typeof renderer.compileAsync === 'function') {
        await renderer.compileAsync(next.group, camera, scene);
      } else {
        renderer.compile(next.group, camera, scene);
      }
    } catch (_) { /* warm only */ }
  }
  wtStage('compile');
  if (opts?.precompile !== false) await nextFrame();
  // shadow-depth variants never build through compile() (r2d note) and the
  // render that submits them also BINDS them — one full render resolved ~59
  // links in a single slice (3 s under heavy host load). Render the world in
  // SUBSETS instead (terrain -> +vegetation -> +props): each slice submits
  // and resolves roughly a third, with linker breathing between.
  if (opts?.precompile !== false) {
    const kids = next.group.children.slice();
    const cohorts = Math.min(3, Math.max(1, kids.length));
    for (let sub = 0; sub < cohorts; sub++) {
      const lastVisible = Math.ceil(((sub + 1) / cohorts) * kids.length) - 1;
      const hidden = [];
      for (let j = lastVisible + 1; j < kids.length; j++) {
        if (kids[j].visible) { kids[j].visible = false; hidden.push(kids[j]); }
      }
      try {
        if (lighting && lighting.updateFrustums) lighting.updateFrustums();
        warmRender();
      } catch (_) { /* warm only */ }
      for (const o of hidden) o.visible = true;
      for (const _ of forwardProgramWarm.linkerBreathingSlices(24)) await nextFrame();
      await nextFrame();
    }
  }
  wtStage('shadowWarm');
  await bootCloudWarmP;
  if (sky.ensureCloudTexturesChunked) await sky.ensureCloudTexturesChunked(() => nextFrame());
  wtStage('clouds');
  const needsServices = opts?.services !== false && worldServicesMapId !== next.mapId;
  if (world !== next || worldDormant) {
    activateWorld(next, { services: opts?.services !== false });
  } else if (needsServices) {
    prepareWorldServices(next);
  }
  wtStage('activate');
  wt.totalMs = Math.round(performance.now() - wtStart);
  if (typeof window !== 'undefined') window.__WORLD_LOAD = wt;
  return world;
}

/**
 * Stage the deterministic default battle (screenshot contract + the very first
 * BATTLE press). Needs a world for its spawn points, so it runs on first world
 * activation rather than at boot.
 * @returns {void}
 */
function ensureBattleStaged() {
  if (battleStaged || !world) return;
  battleStaged = true;
  setupBattle(game, selectedSpecId, world, { deferVisuals: true });
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
  if (!world || worldDormant === on) return;
  worldDormant = on;
  world.group.visible = !on;
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
  if (world && worldServicesMapId === world.mapId) minimapAssets.queue(world);
  return runtime;
}
// Preserve the staged progress contract without transferring battle-only UI
// into a garage first visit. Battle intent/entry joins ensureBattleHud().
await bootStage('hud');

const garageMaps = [
  { id: 'random', name: 'Random', thumb: '' },
  ...MAP_IDS.map((id) => {
    const c = getMapConfig(id);
    return { id, name: c.name, thumb: MAP_THUMBS[id] || '' };
  }),
];
let pendingSoloStart = null;
let playMenuPromise = null;
let networkRoomCoordinator = null;
const {
  loadPlayMenuModule,
  preloadNetworkBattleModules,
  preloadPrivateMatchHandoffModule,
  preloadDedicatedClientModule,
  preloadNetworkRoomChatModule,
} = createBattleModuleAccess();

function preloadPlayMode(mode) {
  ensureBattleHud().catch(() => null);
  preloadFxModule().catch(() => null);
  preloadKillcamModule().catch(() => null);
  preloadNetworkBattleModules().catch(() => null);
  preloadNetworkRoomChatModule().catch(() => null);
  if (mode === 'private' || mode === 'lan') {
    preloadPrivateMatchHandoffModule().catch(() => null);
  } else if (mode === 'ranked') {
    preloadDedicatedClientModule().catch(() => null);
  }
  loadPlayMenuModule()
    .then((module) => module.preloadPlayMode(mode))
    .catch(() => { /* battle click remains the retry/fallback path */ });
}
async function openPlayMenu(request) {
  if (networkRoomCoordinator && await networkRoomCoordinator.showActiveRoom()) return;
  if (playMenuPromise) {
    const menu = await playMenuPromise;
    if (menu?.showCurrentRoom()) return;
  }
  if ((request?.mode || 'solo') === 'solo') {
    pendingSoloStart = null;
    if (typeof request?.startSolo === 'function') {
      request.startSolo();
      return;
    }
    await beginSoloBattle({
      specId: request?.specId || garage.getSelected(),
      mapId: request?.mapId || garage.getSelectedMap(),
    });
    return;
  }
  pendingSoloStart = typeof request?.startSolo === 'function' ? request.startSolo : null;
  if (!playMenuPromise) {
    const pending = loadPlayMenuModule().then(({ createPlayMenu }) => createPlayMenu({
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
      onSolo: () => {
        const start = pendingSoloStart;
        pendingSoloStart = null;
        if (start) {
          start();
          return;
        }
        beginSoloBattle({
          specId: garage.getSelected(),
          mapId: garage.getSelectedMap(),
        }).catch((error) => {
          console.error('[solo] entry failed', error);
        });
      },
      onNetworkStart: (request) => networkBattleLauncher.beginPrivate(request),
      onRankedStart: (request) => networkBattleLauncher.beginRanked(request),
      onLobbyChange: (context) => networkRoomCoordinator?.handleLobbyChange(context),
    }));
    playMenuPromise = pending;
    pending.catch(() => {
      if (playMenuPromise === pending) playMenuPromise = null;
    });
  }
  const menu = await playMenuPromise;
  menu.show(request?.mode, request?.invite);
}

// Battle entry owns the play modal's visibility. Every player-facing entry
// path emits this event, so first matches, retained-room rematches, ranked,
// and solo all dismiss the operation picker before the next painted frame.
bus.on('ui:battleStart', () => {
  const menu = playMenuPromise;
  if (menu) menu.then((runtime) => runtime.hide(false)).catch(() => null);
});

const garage = await bootStage('ui', () => createGarage({
  specs: VISIBLE_TANK_IDS.map(getSpec),
  bus,
  onSelect: (specId) => {
    battleIntent.invalidateMapPlan();
    selectedSpecId = specId;
    rememberSpecId(specId);
    pedestal.set(specId);
    applyCamoPatternsChunked({ priorityIds: [specId], onlySpecIds: [specId] });
    networkRoomCoordinator?.syncVehicle(specId);
    networkRoomCoordinator?.syncPendingLobbySelection();
  },
  onBattle: (specId, mapId) => beginBattleEntry(specId, mapId), // loading screen owns entry
  onPlayRequest: (request) => openPlayMenu(request).catch((error) => {
    console.error('[play-menu] failed to open', error);
  }),
  onPlayModeIntent: preloadPlayMode,
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
    pendingMapChoice = mapId;
    if (mapId !== 'random') pendingMapId = mapId;
    cancelBackgroundWorldBuildsExcept(mapId === 'random' ? null : mapId);
    setCamoBiome(mapId);
    // perf-r2f: chunked — the sync sweep froze the garage ~0.3-1.4 s PER
    // cached tank on a map-card click. The visible hero repaints in the
    // first slice; parked/roster entries follow one frame apart.
    applyCamoPatternsChunked({
      priorityIds: [selectedSpecId], onlySpecIds: [selectedSpecId],
    });
    networkRoomCoordinator?.syncPendingLobbySelection();
  },
}));

// PRE-BATTLE LOADING SCREEN (src/ui/battleLoad.js): map art + both rosters +
// real build progress + countdown. Created here so its stylesheet/DOM is warm
// before the first BATTLE press.
const battleLoad = createBattleLoadScreen();

// STATE TRANSITIONS (src/ui/transition.js): the shared branded veil/loading
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
      getWorld: () => world, // r6: flight-cam LOS solve (foliage/terrain/props)
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
  // Receiving-end reactions on ANY struck tank: caliber-scaled hull flinch,
  // plus a persistent armor scar decal at penetration points.
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
    const liveFx = fxRuntimeAccess.current;
    if (pen && ev.pos && liveFx?.armorScar) {
      _v1.set(ev.pos[0], ev.pos[1], ev.pos[2]);
      _v2.set(ev.normal[0], ev.normal[1], ev.normal[2]);
      liveFx.armorScar(target.visual, _v1, _v2, ev.caliberMm || 90);
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
  if (networkMatch && game.player && rig) {
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
      enforceWorldCacheBudget();
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
const endOverlay = document.createElement('div');
endOverlay.style.cssText =
  'position:fixed;inset:0;display:none;z-index:70;align-items:center;justify-content:center;' +
  'flex-direction:column;gap:22px;background:rgba(4,7,10,0.55);' +
  "font-family:'ABC Monument Grotesk','Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#eef4f9;";
endOverlay.className = 'cot-end';
const endTitle = document.createElement('div');
endTitle.style.cssText = 'font-size:52px;font-weight:800;letter-spacing:0.3em;text-shadow:0 2px 18px rgba(0,0,0,0.8);';
// Results show real battle performance. There is intentionally no fake wallet:
// every vehicle is available and the game has no research tree.
const endRecord = document.createElement('div');
endRecord.style.cssText =
  'font-size:15px;font-weight:700;letter-spacing:0.14em;color:#cfd9e2;' +
  'text-shadow:0 1px 8px rgba(0,0,0,0.8);';
const endBtn = document.createElement('button');
endBtn.textContent = 'RETURN TO GARAGE';
endBtn.style.cssText =
  'font-size:16px;font-weight:700;letter-spacing:0.2em;padding:14px 44px;cursor:pointer;' +
  'color:#fff7ea;border:1px solid #ffc169;background:linear-gradient(180deg,#ffa02e,#d95f00);' +
  "font-family:'ABC Monument Grotesk','Segoe UI',Roboto,Helvetica,Arial,sans-serif;";
endOverlay.append(endTitle, endRecord, endBtn);
document.body.appendChild(endOverlay);
endBtn.addEventListener('click', () => { bus.emit('ui:click', {}); leaveBattleToGarage(); });

// battle_hud r1 (owner): the always-visible LEAVE BATTLE button is GONE — a
// persistent exit control is not WoT battle chrome and it shadowed the
// minimap corner. Leaving stays one Esc away: the settings overlay (Esc, or
// the touch HUD's menu button) carries its red 'Leave Battle' row in every
// battle/spectator/end state (settings.js canLeaveBattle/onLeaveBattle,
// wired below), and the end-of-battle overlay keeps RETURN TO GARAGE.

function showEndOverlay(result) {
  endTitle.textContent = result === 'victory' ? 'VICTORY' : result === 'draw' ? 'DRAW' : 'DEFEAT';
  endTitle.style.color = result === 'victory' ? '#7ee87e' : result === 'draw' ? '#cfd9e2' : '#f05a5a';
  const record = getLastBattleRecord();
  endRecord.innerHTML = record
    ? `<span style="color:#ffd27a">${record.kills} kill${record.kills === 1 ? '' : 's'}</span>` +
      `<span style="margin-left:14px;color:#cfd9e2">${record.damage.toLocaleString('en-US')} damage</span>`
    : '';
  // killcam_shotinfo r2: the shot-info battle report renders its own
  // full-screen VICTORY/DEFEAT banner + backdrop (z 71) and reserves the
  // bottom 15vh — hide the duplicate center title/dim and anchor the button
  // in the reserved band.
  endTitle.style.display = 'none';               // report banner owns the verdict
  endOverlay.style.background = 'none';          // report backdrop owns the dim
  endOverlay.style.justifyContent = 'flex-end';  // button in the reserved band
  endOverlay.style.paddingBottom = '5vh';
  endOverlay.style.display = 'flex';
}

// ---------------------------------------------------------------------------
// Input — routed through the rebindable action layer (src/game/input.js) and
// the settings panel (src/ui/settings.js). Zoom is the zoomIn/zoomOut actions (wheel by default).
// ---------------------------------------------------------------------------
const debugFlags = { forceFire: false }; // headless-test hook (window.__DEBUG.flags)

const input = createInput({ lockElement: renderer.domElement });
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
// Reused every HUD frame: scoped armor inspection follows every legally
// visible opponent, not only the vehicle directly under the gun marker.
const armorScopeTargets = [];
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

renderer.domElement.addEventListener('mousedown', () => {
  audio.resume();
  if (game.phase !== 'battle' || settings.isOpen()) return;
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
    isActive: () => !!networkMatch,
    queueConsumable: (slot) => networkFramePump.queueConsumable(slot),
    queueAction: (action) => networkFramePump.queueAction(action),
  },
  rules: {
    selectShell: battleClientAccess.selectShell,
    repairAllModules: battleClientAccess.repairAllModules,
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
  getWorld: () => world,
  isNetworkMatchActive: () => !!networkMatch,
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
  getWorld: () => world,
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
// FEEL r12: perf overlay toggle works in every phase (garage included)
input.onAction('perfHud', () => { if (diagnosticsRequested) perfHud.toggle(); });

// ---------------------------------------------------------------------------
// Game flow
// ---------------------------------------------------------------------------

/**
 * PRE-BATTLE LOADING SCREEN (boot r8): WoT shows map art + both rosters +
 * progress between pressing BATTLE and the battle opening. Ours does the same
 * AND does real work behind it — the battlefield build, the roster's texture
 * bakes and the shader warm all happen while this screen is up, which is why
 * the battlefield no longer has to exist at boot.
 *
 * @param {string} specId player vehicle
 * @param {?string} mapId picked map id ('random' rolls here)
 * @returns {Promise<void>} resolves when the battle is live
 */
async function startBattleLoading(specId, mapId = null, { randomRoster = true } = {}) {
  // Debug/API entry can bypass the garage's ui:battleStart event.
  post.setAdaptiveSuspended(true);
  const shownAt = performance.now();
  if (typeof window !== 'undefined') window.__VISUAL_LOAD_TIMINGS = [];
  const loadYield = createOpaqueLoadingYielder(12, 80);
  const requestedMapId = mapId || pendingMapId;
  const resolved = battleIntent.consumeMap(specId, requestedMapId);
  const cfg = getMapConfig(resolved);
  // perf-smooth r1: per-stage wall-clock telemetry for the player battle-entry
  // path (same pattern as __BOOT_TIMINGS) — probes and future perf rounds
  // read window.__BATTLE_LOAD instead of guessing where entry time went.
  const blt = { map: resolved, worldCached: !!worldCache.get(resolved), stages: {} };
  let bltMark = shownAt;
  const bltStage = (key) => {
    const now = performance.now();
    blt.stages[key] = Math.round(now - bltMark);
    bltMark = now;
  };
  battleLoad.show({
    mapName: cfg.name || resolved,
    thumb: MAP_THUMBS[resolved] || '',
    biome: resolved,
    mode: mapId === 'random' ? 'Random Battle · Any Battlefield' : 'Random Battle · Standard',
    allies: [], enemies: [],
  });
  // This function is entered synchronously from the Battle gesture. Unlock
  // audio before the first await and start a tiny synthesized loader bed so
  // cold world/roster work never reads as a silent frozen page.
  audio.resume();
  audio.loadingOn(true);
  await nextFrame();
  await ensureBattleVisualStreamer();

  // The combat HUD, damage schematic, and exact top-mask rig are battle-only.
  // Start their retryable chunks at the first covered frame, then join them
  // with the independent world/roster barrier below. Awaiting this interface
  // group before terrain construction added its complete cold transfer and
  // parse time directly to every first battle even though neither side
  // consumes the other.
  battleLoad.progress(0.01, 'Loading combat interface');
  const battleInterfaceP = Promise.all([
    ensureBattleHud(), ensureTouchControls(), settings.preload(), armorAimOverlay.preload(),
  ]);

  // 1. battlefield (0 → 55%). Already-cached maps skip straight through.
  // The next roster is deterministic from battleCount, so resolve its exact
  // profile chunks alongside the independent world build. This is a plan,
  // not a state mutation; setupBattle below remains the sole roster owner.
  battleLoad.progress(0.02, 'Loading battlefield');
  const plannedRoster = planBattleParticipantIds(game, specId, randomRoster);
  const plannedAutoCamoIds = planBattleCamoOverrides(
    game, specId, resolved, randomRoster,
  );
  // The roster and its seeded battle camouflage are both known before the
  // independent battlefield build begins. Finish/cancel any hover-time bake
  // first so a repaint can never race an in-flight resize of the same canvas,
  // then paint existing cache entries and create missing exact-tier textures
  // under the loader. This whole chain overlaps terrain/vegetation/props.
  const rosterTextureP = battleIntent.prepareRoster({
    specId,
    mapId: resolved,
    rosterIds: plannedRoster,
    autoCamoIds: plannedAutoCamoIds,
    yieldForBudget: loadYield,
  });
  // Legacy battlefields author an exact wreck cast. Those synchronous wreck
  // bakes are part of world construction, so start their profile transfers in
  // the same barrier instead of discovering and awaiting each family late in
  // the serial props generator. Random-pool maps keep their seeded on-demand
  // path rather than speculatively downloading the entire modern fleet.
  const plannedWorldVehicles = cfg.props?.tankWrecks?.ids || [];
  // Particle atlases are independent of the battlefield graph. Decode,
  // install and upload the exact shipped textures while terrain/vegetation/
  // props are already consuming the opaque transition instead of waiting
  // until the visible countdown. The later opening warm sees stable Texture
  // objects and only submits programs; no rendered effect or quality changes.
  const fxTextureP = ensureFxRuntime().then(async (live) => {
    await live.preloadTextures?.();
    live.warmTextures?.();
    const receipt = await battleVisuals.stageRootTextureUploads(live.group, loadYield);
    live.group.userData.battleTexturesStaged = true;
    blt.fxTextureUpload = receipt;
    return receipt;
  });
  await battleEntryAcquisition.acquireSolo([
    () => battleInterfaceP,
    () => ensureWorld(resolved,
      (f, label) => battleLoad.progress(0.02 + f * 0.53, label),
      { precompile: false, services: false }),
    () => ensureTankBuilders([...plannedRoster, ...plannedWorldVehicles]),
    () => preloadSoloBattleRuntime(),
    () => preloadBattleClientRuntime(),
    () => battleWarm.preload(),
    () => audio.warmBattleEvents(),
    () => fxTextureP,
    () => ensureKillcamRuntime(),
    () => rosterTextureP,
  ]);
  blt.world = (typeof window !== 'undefined' && window.__WORLD_LOAD) || null;
  battleLoad.progress(0.55, 'Uploading battlefield textures');
  blt.worldTextureUpload = await battleVisuals.stageRootTextureUploads(world.group, loadYield);
  bltStage('world');
  // Do not compile the world yet. Battle mode deliberately removes the two
  // garage spotlights below in startBattle(); compiling here would submit a
  // different light-count program family, then make the correct battle
  // family link again during deployment. That redundant wrong-state pass was
  // a measured 0.49-0.55 s main-thread task on ANGLE/Metal.
  battleLoad.progress(0.555, 'Battlefield ready');
  await nextFrame();

  // 2. roster: pick the participants, then bake any visual still missing one
  //    chunk-by-chunk (55 → 88%) so the bar moves through the texture bakes.
  battleLoad.progress(0.56, 'Assembling rosters');
  await nextFrame();
  const playerVisualStartedAt = performance.now();
  startBattle(specId, resolved, {
    deferVisuals: true,
    preBattleHold: true,
    randomRoster,
  });
  // Collision is available now. The exact preloaded tactical map installs
  // fire-and-forget; its tiny image decode overlaps the remaining roster work
  // and can never extend click-to-visible or click-to-control latency.
  battleLoad.progress(0.565, 'Drawing tactical map');
  prepareBattleWorldServices(world);
  battleLoad.progress(0.57, 'Preparing player vehicle');
  const playerVisualTiming = {
    specId: game.player?.specId || specId,
    quality: 'preview',
    startedAt: Math.round(playerVisualStartedAt),
    buildMs: Math.round(performance.now() - playerVisualStartedAt),
    prebakeMs: 0,
  };
  // Garage prioritizes response and initially reveals a never-seen vehicle
  // with a 512/256 paint set. When that exact visual becomes the player actor,
  // promote its shared canvases to the normal 1024/512 player tier while the
  // opaque battle loader owns the screen. The Texture objects stay stable, so
  // every material on the borrowed visual receives the sharper bake in place.
  if (game.player?.visual && game.player.visual === pedestal.current) {
    const playerPrebakeStartedAt = performance.now();
    await prebakeSharedTextures(
      game.player.spec, engineCtx.anisotropy ?? 4, 'preview', loadYield,
    );
    playerVisualTiming.prebakeMs = Math.round(performance.now() - playerPrebakeStartedAt);
  }
  if (typeof window !== 'undefined') {
    (window.__VISUAL_LOAD_TIMINGS ||= []).push(playerVisualTiming);
  }
  const playerUploadStartedAt = performance.now();
  // setupBattle must provide a player visual synchronously (either borrowed
  // from the showroom or constructed as fallback) so simulation and HUD state
  // are valid, but it does not have to upload every map in the same frame.
  // Detach and stage that root just like the streamed allies; otherwise the
  // first hidden battle render pays the whole upload as one 500-700 ms freeze.
  await battleVisuals.stageBattleVisualReveal(game.player, loadYield);
  playerVisualTiming.uploadMs = Math.round(performance.now() - playerUploadStartedAt);
  playerVisualTiming.totalMs = Math.round(performance.now() - playerVisualStartedAt);
  bltStage('roster');
  battleLoad.rosters(rosterRows('player'), rosterRows('enemy'));
  // PERF (perf-r2): bake the shot-card schematics for this exact roster now,
  // behind the loading screen — the first hit on each enemy type used to pay
  // a synchronous ~5-15 ms canvas bake on the very frame the shell landed.
  hud.warmShotCards(game.tanks.map((e) => e.specId));
  battleLoad.progress(0.58, 'Painting vehicles');
  // The player is the only required subject for the first chase frame. Allied
  // formation visuals stream first during the frozen countdown, then enemies.
  const openingVisual = (ent) => ent.isPlayer;
  if (game.tanks.some((ent) => !ent.visual && openingVisual(ent))) await nextFrame();
  await battleVisuals.stream(openingVisual, loadYield, (fraction) => {
    battleLoad.progress(0.58 + fraction * 0.30, 'Painting vehicles');
  });
  bltStage('bake');

  // Finish camouflage, roster visuals, terrain, shader programs, effects,
  // shadows and the exact reveal frame behind the opaque loader. The typed
  // owner contains ordering, cancellation and fail-soft fallback policy.
  battleLoad.progress(0.90, 'Preparing deployment');
  const {
    generation: entryWarmGeneration,
    revealPrimed: entryRevealPrimed,
  } = await soloBattleDeployment.warm(camoSweepP);
  bltStage('warm');
  // Start the cheap ambient graph before reveal as well. openBattle keeps its
  // idempotent calls for debug/direct entry paths, but the normal player path
  // reaches it with no cold audio work left.
  audio.loadingOn(false);
  audio.ambientOn(true);
  battleLoad.progress(1, 'Ready');

  // Cached maps can finish in only a few frames. Give the page enough dwell
  // to communicate the map/rosters instead of flashing like a dropped frame.
  const readyHoldMs = 900 - (performance.now() - shownAt);
  if (readyHoldMs > 0) await new Promise((r) => setTimeout(r, readyHoldMs));

  // 4. The visible WoT-style countdown is presentation-only. All first-use
  // work above has completed, so these five seconds have the same render
  // budget as live play instead of acting as an extension of the loader.
  bltStage('holdCountdown');
  blt.totalMs = Math.round(performance.now() - shownAt);
  if (typeof window !== 'undefined') window.__BATTLE_LOAD = blt;
  // Restore the full playable baseline while the opaque veil still owns the
  // screen; any render-target resize is hidden instead of landing on the
  // first visible battle frame.
  post.setAdaptiveSuspended(false);
  bltStage('restoreRenderer');
  // A failed/interrupted warm still gets the safe reveal fallback. The normal
  // path reuses the already-presented final-quality deployment frame instead
  // of rendering the same scene twice behind the loader.
  if (!entryRevealPrimed) {
    prepareBattleRevealCamera();
    await battleEntryLifecycle.primeReveal();
  }
  bltStage('primeReveal');
  await battleLoad.hide();
  bltStage('hide');
  const loadingElapsedS = (performance.now() - shownAt) / 1000;
  const visiblePreBattleS = resolveVisiblePreBattleSeconds(
    PRE_BATTLE_HOLD_S, loadingElapsedS, MIN_VISIBLE_PRE_BATTLE_S,
  );
  blt.loadingElapsedMs = Math.round(loadingElapsedS * 1000);
  blt.visiblePreBattleS = visiblePreBattleS;
  blt.expectedClickToControlMs = Math.round(
    loadingElapsedS * 1000 + visiblePreBattleS * 1000,
  );
  openBattle(visiblePreBattleS);
  scheduleDeferredCombatWarm(entryWarmGeneration);
  bltStage('open');
  blt.totalMs = Math.round(performance.now() - shownAt);
}
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
let networkMatch = null;
let networkBridge = null;
let networkStatus = null;
let networkSpectator = false;
const networkRecovery = createNetworkRecoveryOwner();
const networkFramePump = createNetworkFramePump({
  getMatch: () => networkMatch,
  getBridge: () => networkBridge,
  getStatus: () => networkStatus,
  getPlayer: () => game.player,
  isBattleActive: () => game.phase === 'battle',
  shouldPresentDisconnect: () => game.phase === 'battle' && !game.result,
  recovery: networkRecovery,
  nextFrame,
});
const networkBattleBarrier = createNetworkBattleBarrier({
  getMatch: () => networkMatch,
  waitForSnapshot: (predicate, timeoutMs, label) =>
    networkFramePump.waitForSnapshot(predicate, timeoutMs, label),
});

// Persistent subject-owned FX resolve against the presentation entity the
// player actually sees. Network entities take priority during online battles;
// solo falls back to the fixed-step roster.
function resolveFxSubject(id) {
  return networkBridge?.entities.get(id) || game.tankById.get(id) || null;
}

/**
 * A joined lobby is stronger intent than browsing the multiplayer picker, but
 * weaker than starting a round. Transfer the exact roster code immediately;
 * build only a fixed host-selected battlefield, and let the existing garage-
 * lull gate keep terrain work out of active room interaction.
 */
function preloadNetworkLobbyIntent(state) {
  if (!state || game.phase !== 'garage' || state.phase !== 'waiting') return;
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

const networkBattleLauncher = createNetworkBattleLaunchRuntime({
  lifecycle: battleEntryLifecycle,
  battleLoad,
  audio,
  getMatch: () => networkMatch,
  getRoomCoordinator: () => networkRoomCoordinator,
  getWorldCollision: () => world,
  getMapPresentation: (mapId, fallback) => {
    if (!mapId) return { name: fallback, thumb: '', biome: 'none' };
    const cfg = getMapConfig(mapId);
    return { name: cfg.name || fallback, thumb: MAP_THUMBS[mapId] || '', biome: mapId };
  },
  rosterRows: lobbyRosterRows,
  emitBattleStart: (payload) => bus.emit('ui:battleStart', payload),
  resetBattleState: resetNetworkBattleState,
  presentBattle: presentNetworkBattle,
  loadPrivateMatch: preloadPrivateMatchHandoffModule,
  loadDedicatedMatch: preloadDedicatedClientModule,
  disposePresentation: disposeNetworkPresentation,
  clearNetworkRound: () => networkFramePump.clearRound(),
  closeMatch: closeNetworkMatch,
  enterGarage,
  setNetworkStatus: (status) => networkStatus?.set(status),
  recordEntryFailure: (failure) => {
    if (typeof window !== 'undefined') window.__NETWORK_ENTRY_FAILURE = failure;
  },
});

networkRoomCoordinator = createNetworkRoomCoordinator({
  getMatch: () => networkMatch,
  getPlayMenu: () => playMenuPromise,
  loadRoomChat: preloadNetworkRoomChatModule,
  getPhase: () => game.phase,
  isSettingsOpen: () => settings.isOpen(),
  hasResult: () => !!game.result,
  isKillcamActive: () => killcam.isActive(),
  isSpectator: () => networkSpectator,
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
  networkBattleBarrier.cancel();
  networkRecovery.dispose();
  networkFramePump.dispose();
  if (networkBridge) networkBridge.dispose();
  if (networkStatus) networkStatus.dispose();
  networkBridge = null;
  networkStatus = null;
  networkSpectator = false;
}

function closeNetworkMatch(reason = 'network_match_closed') {
  if (networkMatch) networkMatch.close(reason);
  disposeNetworkPresentation();
  networkMatch = null;
  networkRoomCoordinator.clear();
}

async function beginBattleEntry(specId, mapId = null, options = undefined) {
  return battleEntryLifecycle.run(async () => {
    try {
      battleEntryLifecycle.coverRendering();
      await startBattleLoading(specId, mapId, options);
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

/** Shared renderer/presentation path for private, LAN, and dedicated matches. */
async function presentNetworkBattle({
  viewerId,
  own,
  mapId,
  matchPlayers,
  modeLabel,
  connectMatch,
  connectAfterWorld = false,
  transitionShown = false,
} = {}) {
  await ensureBattleVisualStreamer();
  // Direct presentation calls and every lobby handoff converge here. Calls
  // from a user gesture unlock immediately; rematches reuse the live context.
  audio.resume();
  audio.loadingOn(true);
  // Network entry builds/compiles the world before its later phase flip.
  // Wake all battlefield shadow bands now so that cost stays under this
  // already-visible roster loader rather than the first multiplayer frame.
  lighting.setFarCascadeDormant(false);
  const loadStartedAt = performance.now();
  const loadTrace = { mode: modeLabel, map: mapId, stages: {} };
  let loadMarkAt = loadStartedAt;
  const markLoadStage = (name) => {
    const now = performance.now();
    loadTrace.stages[name] = Math.round(now - loadMarkAt);
    loadMarkAt = now;
  };
  if (typeof window !== 'undefined') window.__NETWORK_LOAD = loadTrace;
  // A network bridge is mounted over reusable global game state. Retire the
  // previous verdict before any snapshot/reveal work; otherwise a rematch
  // enters its first battle frame with the old result and immediately opens
  // the previous victory/defeat flow again.
  resetNetworkBattleState();
  // AUTO paint must resolve against the authoritative map before any roster
  // texture variant is prewarmed or built.
  setCamoBiome(mapId);
  const spectator = own.team === 'spectator';
  const displayTeam = spectator ? 'alpha' : own.team;
  networkSpectator = spectator;
  if (!transitionShown) {
    const pendingCfg = getMapConfig(mapId);
    bus.emit('ui:battleStart', { playerId: viewerId, specId: own.specId, mapId });
    battleLoad.show({
      mapName: pendingCfg.name || 'Battle',
      thumb: MAP_THUMBS[mapId] || '',
      biome: mapId,
      mode: modeLabel,
      allies: lobbyRosterRows({ players: matchPlayers }, displayTeam, viewerId),
      enemies: lobbyRosterRows({ players: matchPlayers },
        displayTeam === 'alpha' ? 'bravo' : 'alpha', viewerId),
    });
  } else {
    battleLoad.rosters(
      lobbyRosterRows({ players: matchPlayers }, displayTeam, viewerId),
      lobbyRosterRows({ players: matchPlayers },
        displayTeam === 'alpha' ? 'bravo' : 'alpha', viewerId),
    );
  }
  battleLoad.progress(0.02, 'Securing match channel');
  await nextFrame();
  // Battlefield construction is independent from transport/HUD/killcam
  // transfer. The previous serial await made cold invitees pay both costs in
  // full, which was especially visible for friends opening the game for the
  // first time. The typed acquisition owner runs both under this opaque
  // loader, preserves the host's world-collision dependency, and retains
  // individual timings for production diagnosis.
  battleLoad.progress(0.08, 'Loading battlefield');
  const { modules: networkModules } = await battleEntryAcquisition.acquireNetwork({
    loadModules: () => Promise.all([
      preloadNetworkBattleModules(),
      preloadBattleClientRuntime(),
      ensureBattleHud(),
      ensureTouchControls(),
      // Scope armor is presentation-only. Acquire it under the opaque network
      // loader, but do not strand a whole room if this optional chunk is the
      // one request a cold browser loses; its access owner remains fail-soft
      // and the next intent/round retries the transfer.
      armorAimOverlay.preload().catch((error) => {
        console.warn('[loading] Optional armor overlay unavailable:', error);
        return null;
      }),
      ensureFxRuntime(),
      ensureKillcamRuntime(),
      battleWarm.preload(),
      audio.warmBattleEvents(),
    ]).then(([modules]) => modules),
    loadWorld: () => ensureWorld(mapId, (fraction, label) => {
      battleLoad.progress(0.08 + fraction * 0.48, label);
    }),
    connect: connectMatch,
    connectAfterWorld,
    publishMatch: (match) => { networkMatch = match; },
    timings: loadTrace,
  });
  const [
    { createBrowserBattleBridge },
    { createNetworkStatus },
    { createBrowserInputRuntime },
  ] = networkModules;
  const fx = requireFxRuntime();
  networkFramePump.ensureInputRuntime(createBrowserInputRuntime);
  markLoadStage('modulesWorldAndConnect');
  networkStatus = createNetworkStatus();
  networkRecovery.attach(networkMatch?.client || null, networkStatus);
  const cfg = getMapConfig(mapId);
  battleLoad.show({
    mapName: cfg.name || mapId,
    thumb: MAP_THUMBS[mapId] || '',
    biome: mapId,
    mode: modeLabel,
    allies: lobbyRosterRows({ players: matchPlayers }, displayTeam, viewerId),
    enemies: lobbyRosterRows({ players: matchPlayers },
      displayTeam === 'alpha' ? 'bravo' : 'alpha', viewerId),
  });
  // Keep the bridge private until every roster builder is ready. The render
  // loop starts pumping the connected match immediately; publishing a
  // half-prepared bridge let an early authoritative snapshot synchronously
  // create an unwarmed bot and throw on every frame of a cold session.
  const preparedBridge = createBrowserBattleBridge({
    engineCtx,
    game,
    bus,
    viewerId,
    spectator,
    worldCollision: world,
  });
  try {
    await preparedBridge.prepareRoster(matchPlayers, (fraction, specId) => {
      battleLoad.progress(0.56 + fraction * 0.27, `Painting ${getSpec(specId)?.name || specId}`);
    });
  } catch (error) {
    preparedBridge.dispose();
    throw error;
  }
  markLoadStage('roster');
  // Install terrain sampling before the bridge performs its one hidden
  // authority-pose sync. Remote tracks and suspension must be conformed at
  // the spawn pose before any visual is eligible to become visible.
  for (const entity of preparedBridge.entities.values()) {
    if (entity.visual?.setGroundSampler) entity.visual.setGroundSampler(groundSampler);
  }
  battleLoad.progress(0.84, 'Synchronizing authority');
  let initial;
  try {
    initial = await networkBattleBarrier.waitForInitialSnapshot({ viewerId, spectator });
  } catch (error) {
    preparedBridge.dispose();
    throw error;
  }
  markLoadStage('initialSnapshot');
  networkBridge = preparedBridge;
  networkBridge.apply(initial, 1 / 60);
  // Compile against the exact live battlefield light set. The garage spots
  // alter Three's program cache key; leaving them enabled through wreck/FX
  // warm made first blood link a second `cot:burnt` shader for every wreck.
  // The opaque roster veil still owns the screen, so this handoff changes no
  // presented frame and also removes unused garage lights from compile work.
  setGarageSpots(false);
  setGarageSunTrim(false);
  battleLoad.progress(0.845, 'Warming suspension terrain');
  await battleWarm.warmBattleTerrainTiles({
    game, world, yieldForBudget: createFrameBudgetYielder(16),
  });
  markLoadStage('terrainGrid');
  // Network rosters can contain vehicles the garage-idle solo warmer never
  // touched. Bake every fielded wreck family while the opaque load screen
  // owns the frame, otherwise first blood can synchronously build burn
  // canvases/materials and freeze a constrained client for hundreds of ms.
  battleLoad.progress(0.85, 'Priming wreck variants');
  await battleWarm.warmNetworkWrecks({
    entities: networkBridge.entities.values(),
    prebakeBurntSteps,
    anisotropy: engineCtx.anisotropy ?? 4,
    renderer,
    scene,
    camera,
    warmRender,
  });
  battleLoad.progress(0.87, 'Priming combat effects');
  await battleWarm.warmNetworkOpeningEffects({
    fx, post, renderer, scene, camera, shells: game.shells, warmRender,
  });
  markLoadStage('combatWarm');
  hud.warmShotCards([...networkBridge.entities.values()].map((entity) => entity.specId));
  battleLoad.progress(0.88, 'Compiling combat shaders');
  await nextFrame();
  try {
    if (typeof renderer.compileAsync === 'function') await renderer.compileAsync(scene, camera);
    else renderer.compile(scene, camera);
  } catch (_) { /* warm only */ }
  markLoadStage('compile');
  battleLoad.progress(0.96, 'Waiting for every commander');
  await networkBattleBarrier.waitForPeerReadiness();
  markLoadStage('readyBarrier');

  shotMode = false;
  perfHud.setCaptureHidden(false);
  fx.setFrozen(false);
  if (settings.isOpen()) settings.close({ noRelock: true });
  killcam.cancel();
  if (!spectator) {
    selectedSpecId = own.specId;
    rememberSpecId(own.specId);
  }
  driveTestController.resetAim();
  setWorldDormant(false);
  if (world.resetDestructibles) world.resetDestructibles();
  game.mapId = mapId;
  setCamoBiome(mapId);
  hud.shotInfo.setPlayer(viewerId);
  fx.resetAll();
  if (!spectator) {
    playerBattleActions.setTank(game.player.spec);
    damagePanel.setTank(game.player.spec, game.player.visual);
    damagePanel.setEquipment(game.player.equip || {});
  }
  garage.hide();
  endOverlay.style.display = 'none';
  endShown = false;
  deathCamShown = false;
  kcPending = null;
  hud.setMode('battle');
  game.phase = 'battle';
  setGarageSpots(false);
  setGarageSunTrim(false);
  bus.emit('phase:change', { phase: 'battle' });
  playerBattleActions.resetConsumables();
  bus.emit('ui:consumableReset', {});
  rig.release();
  if (spectator) {
    if (!killcam.spectate.startObserver()) {
      throw new Error('No live vehicle is available to spectate.');
    }
    networkBridge.setPerspective(killcam.spectate.targetId);
  } else {
    rig.snapArcade(2, game.player.state.yaw, -10 * DEG);
  }
  showroom.stop();
  // Validate the actual loaded battlefield before removing the opaque load
  // screen. The garage boot watchdog cannot catch a map-specific poisoned
  // environment/shadow program, and discovering it after reveal presents as
  // a black multiplayer spawn. Any rescue/recompile work stays hidden here.
  try {
    const blackCheck = runSceneBlackWatchdog(renderer, scene, camera);
    loadTrace.blackCheck = blackCheck;
  } catch (error) {
    loadTrace.blackCheck = { error: error?.message || String(error) };
  }
  // Keep every battle entry path phase-consistent and crossfade the loader
  // machinery into the battlefield wind while the roster veil still covers.
  audio.loadingOn(false);
  audio.ambientOn(true);
  battleLoad.progress(1, 'Ready');
  // As in solo entry, perform the fresh-baseline resize while still covered.
  post.setAdaptiveSuspended(false);
  await battleLoad.hide();
  markLoadStage('reveal');
  loadTrace.totalMs = Math.round(performance.now() - loadStartedAt);
}

/**
 * Keep bot play on the original in-page simulation path. Multiplayer's
 * authority, snapshot bridge, prediction, WebRTC, and signaling modules are
 * intentionally absent here: loading them for a local battle duplicated work
 * without adding any useful authority boundary.
 */
async function beginSoloBattle({ specId, mapId, randomRoster = true } = {}) {
  const selected = VISIBLE_TANK_IDS.includes(specId) ? specId : garage.getSelected();
  return beginBattleEntry(selected, mapId || garage.getSelectedMap(), { randomRoster });
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

function startBattle(specId, mapId = null, opts = {}) {
  const fx = requireFxRuntime();
  const sbtStartedAt = performance.now();
  let sbtMarkAt = sbtStartedAt;
  const sbt = { specId, stages: {} };
  const sbtStage = (name) => {
    const now = performance.now();
    sbt.stages[name] = Math.round(now - sbtMarkAt);
    sbtMarkAt = now;
  };
  // battle_countdown r1: the PLAYER entry path arms an indefinite sim hold
  // the moment the roster exists — the sim used to run live UNDER the
  // loading screen (pointer lock is grabbed by the BATTLE click), so a
  // click while the rosters were still up fired the gun. openBattle()
  // resolves the hold to the visible 5 s countdown when the screen drops.
  // Debug/probe entries (opts.preBattleHold unset) keep preBattleS = 0 and
  // are driveable immediately, exactly as before.
  game.preBattleS = opts.preBattleHold ? Infinity : 0;
  // SHOT-MODE RESET (effects_combat/content_breadth r2): __SHOTS.set() freezes
  // fx and stops the sim tick; any UI path out of shot mode (garage BATTLE
  // button) must resume it or the battle is permanently frozen.
  shotMode = false;
  perfHud.setCaptureHidden(false);
  fx.setFrozen(false);
  // PAUSE: battle entry always clears a paused overlay (probe-driven
  // startBattle can run with the panel up; the tick edge below then restores
  // the audio buses). noRelock — this close must never fire a gesture-less
  // pointer-lock request that could bump the denial streak.
  if (settings.isOpen()) settings.close({ noRelock: true });
  // KILL-CAM: never carry a replay across battles — and cancel BEFORE
  // setupBattle, not after: finish() restores the victim's materials from the
  // ghost backup captured at x-ray start (a wreck's burnt set), which would
  // clobber the pristine materials resetDestroyed() just put back.
  killcam.cancel();
  armorAimOverlay.clear();
  sbtStage('resetPresentation');
  selectedSpecId = specId;
  rememberSpecId(specId);
  driveTestController.resetAim(); // sticky drive-test aim never carries across battles
  // MAP-CONFIG WIRING: battle on the picked map ('random' rolls here)
  switchMap(resolveMapId(mapId || pendingMapId));
  setWorldDormant(false); // the battle world wakes up (see setWorldDormant)
  // DESTRUCTIBLES r1: worlds are cached and reused across battles — stand
  // every broken wall/fence/sandbag/prop back up for the rematch.
  if (world.resetDestructibles) world.resetDestructibles();
  sbtStage('activateWorld');
  // MOBILE r3: second black-scene watchdog pass — terrain is only present in
  // battle, so a device that renders the garage but blacks out the world gets
  // caught here (see deviceDiag.js; webdriver-skipped for harness parity).
  if (!navigator.webdriver) {
    setTimeout(() => runSceneBlackWatchdog(renderer, scene, camera), 1800);
  }
  game.mapId = world.mapId;
  // CAMO WIRING: AUTO patterns resolve to the biome of the map being fought;
  // only tanks whose resolved pattern actually changed get repainted.
  setCamoBiome(world.mapId);
  // Normal matchmaking draws only from the curated garage roster, ranks the
  // player's era first and prefers the closest tiers. The battlefield choice
  // never changes vehicle-era matchmaking.
  pedestal.lendToBattle(specId);
  sbtStage('lendPlayerVisual');
  setupBattle(game, specId, world, {
    random: opts.randomRoster !== false, deferVisuals: !!opts.deferVisuals,
    deferCamoRepaint: true, deferOpeningRoutes: !!opts.deferVisuals,
  });
  // Programs and source canvases remain cached by WebGL/the browser, but the
  // receipt itself is round-scoped: a rematch can select a different map,
  // roster, camouflage set and freshly constructed visual graph. Treating a
  // prior round as globally warm skipped the new wreck textures and hidden
  // LOD/shadow variants, moving their first touch into live combat.
  combatWarm.reset();
  sbtStage('setupRoster');
  battlePresentation.primeDeploymentTerrainTiles();
  sbtStage('terrainTiles');
  // Fixed-step authority starts every round with a matching presentation
  // history. Without this reset a debug/rematch entry could interpolate from
  // the previous battlefield pose for one frame.
  simAcc = 0;
  battlePresentation.resetSoloPoses();
  battleStaged = true;
  // perf-r2f: ONE chunked sweep covers the biome flip AND the bot camo rolls
  // setupBattle just made (its own trailing sweep is deferred by the flag
  // above). The old back-to-back sync sweeps repainted the warm cache in a
  // single task — a rematch measured a 14 s frame with the loading bar
  // frozen. Chunked, the bar animates between entry repaints; the player's
  // The player can be visible as soon as the veil drops. Repaint that one
  // retained cache entry immediately; the rest stays chunked and completes
  // ahead of burnt-variant warming during the frozen countdown.
  applyCamoPatterns(specId);
  sbtStage('playerCamo');
  camoSweepP = applyCamoPatternsChunked({
    priorityIds: [specId],
    onlySpecIds: game.tanks.map((ent) => ent.specId),
  });
  sbtStage('scheduleRosterCamo');
  // SHOT-INFO identity (killcam_shotinfo r3): set synchronously — hud.update
  // only forwards it after the first rendered frame, which dropped hits
  // resolved in the very first sim ticks (headless replays / spectators).
  hud.shotInfo.setPlayer(game.player.id);
  // Fresh battlefield fx: clear scars/tracers/smoke columns left on (or by)
  // last battle's wrecks — scar decals are parented onto tank hulls and would
  // otherwise carry into the rematch.
  fx.resetAll();
  sbtStage('resetEffects');
  playerBattleActions.setTank(game.player.spec);
  damagePanel.setTank(game.player.spec, game.player.visual);
  damagePanel.setEquipment(game.player.equip); // EQUIPMENT SYSTEM: loadout readout
  garage.hide();
  endOverlay.style.display = 'none';
  endShown = false; // KILL-CAM: fresh battle — re-arm the end-of-battle gate
  deathCamShown = false; // killcam_shotinfo r1: re-arm the at-death replay
  kcPending = null; // killcam r2: a scheduled death replay dies with the battle
  hud.setMode('battle');
  game.phase = 'battle';
  setGarageSpots(false); // PERF: no spot-light cost on battle draws
  setGarageSunTrim(false); // restore the map's authored warm sun
  bus.emit('phase:change', { phase: 'battle' });
  playerBattleActions.resetConsumables();
  bus.emit('ui:consumableReset', {});
  rig.release();
  rig.snapArcade(2, game.player.state.yaw, -10 * DEG);
  showroom.stop(); // garage drag-orbit hands the camera back to the rig
  sbtStage('uiAndCamera');
  sbt.totalMs = Math.round(performance.now() - sbtStartedAt);
  if (typeof window !== 'undefined') window.__START_BATTLE_TIMINGS = sbt;
  // Debug/capture entries do not use the branded loader or its deployment
  // queue. Drain the same round receipt synchronously after the actual roster
  // exists; the player path owns it explicitly in startBattleLoading().
  if (!opts.deferVisuals) combatWarm.drain();
  // The battle-open flyby is armed only once the player can actually SEE it:
  // the loading-screen path calls openBattle() when the screen clears.
  if (!opts.deferVisuals) openBattle();
}

/** QA-only cold entry. Production paths already own a loading veil and call
 * startBattle only after the selected world and roster builders are ready. */
async function debugStartBattle(specId, mapId = null, opts = {}) {
  const resolved = resolveMapId(mapId || pendingMapId);
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
  ]);
  prepareBattleWorldServices(world);
  return startBattle(specId, resolved, opts);
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
// battle_countdown r1: WoT-style pre-battle freeze length (player path only).
const PRE_BATTLE_HOLD_S = 5;
const MIN_VISIBLE_PRE_BATTLE_S = 2;

function clearBattlePresentationForExit() {
  armorAimOverlay.clear();
  kcPending = null;
  killcam.cancel();
  if (killcam.spectate?.active) killcam.spectate.stop(true);
  veilHud(false);
  // cancel() emits killcam:done, which may flush a buffered report. Hide the
  // whole battle presentation after that event so no replay text, report,
  // spectate bar, or damage-panel veil can survive the leave click.
  // Direct Studio sessions have not acquired the battle-only HUD yet.
  hud?.setMode?.('hidden');
  endOverlay.style.display = 'none';
}

function enterGarage({ preserveRoom = networkRoomCoordinator.shouldPreserveAfterResult() } = {}) {
  const fx = fxRuntimeAccess.current;
  const garageTrace = { stages: {} };
  const garageStartedAt = performance.now();
  let garageMarkedAt = garageStartedAt;
  const markGarageStage = (name) => {
    const now = performance.now();
    garageTrace.stages[name] = Math.round(now - garageMarkedAt);
    garageMarkedAt = now;
  };
  if (typeof window !== 'undefined') window.__GARAGE_ENTRY = garageTrace;
  // Entry failures and interrupted network handoffs also land here. Always
  // release a loading-screen suspension before the garage becomes visible.
  post.setAdaptiveSuspended(false);
  // A garage exit may interrupt any replay phase (including the pre-replay
  // death hold). Tear the kill-cam down before network presentation entities
  // are disposed, revoke the pending launch, and release main.js's separate
  // HUD veil. Without this ordering, the next battle inherited letterbox/
  // label DOM plus display:none HUD roots from the interrupted replay.
  clearBattlePresentationForExit();
  // The selected battle actor is reused as the showroom hero. End both sides
  // of its presentation lifetime before network disposal or pedestal adoption:
  // FX owns tank-parented impact decals plus world particles/lights/timers;
  // the visual owns wreck, recoil, track, ERA, suspension and LOD state.
  resetBattleTankForGarage({ fx, visual: game.player?.visual });
  markGarageStage('presentationReset');
  if (preserveRoom) disposeNetworkPresentation();
  else closeNetworkMatch('returned_to_garage');
  markGarageStage('networkRelease');
  // battle_countdown r1: leaving mid-countdown (Esc -> garage) clears the hold.
  game.preBattleS = 0;
  battleWarmGeneration++;
  cancelDeferredCombatWarm();
  battleWarmPending = false;
  // SHOT-MODE RESET: see startBattle — the garage is a live-mode entry too.
  shotMode = false;
  perfHud.setCaptureHidden(false);
  fx?.setFrozen(false);
  game.phase = 'garage';
  // Establish a new activity epoch for this garage visit. Optional workshop
  // exhibits must not inherit a stale timestamp from before the battle and
  // contend with the transition reveal or the first interactive frames.
  garageDressingScheduler.noteActivity();
  garageFramePacer.reset(performance.now());
  scheduleGarageDressingBuild();
  // Direct Studio activation deliberately skips battle-only collision and
  // minimap capture. The garage needs only its placement; building the
  // collider plus an offscreen top-down render here was a repeatable ~330 ms
  // exit freeze. ensureWorld prepares those services behind the next battle
  // loader, where they are actually consumed.
  if (world && worldServicesMapId !== world.mapId) placeGarage();
  markGarageStage('worldServices');
  // PAUSE: leaving battle clears any paused overlay (Leave Battle closes the
  // panel itself before calling here — this covers every other exit path).
  // After the phase flip above, isBattleActive() is already false, but pass
  // noRelock anyway so no exit path can ever fire a gesture-less lock request.
  if (settings.isOpen()) settings.close({ noRelock: true });
  setWorldDormant(true); // GARAGE PERF: the battlefield stops costing anything
  lighting.setFarCascadeDormant(true);
  // camo_spotting r5: bot biome-camo overrides are battle-scoped — drop
  // them so the pedestal/picker show the player's own persisted selection.
  clearCamoOverrides();
  const adoptedBattleVisual = pedestal.adoptBattlePlayer(selectedSpecId)
    ? pedestal.current
    : null;
  clearBattleAfterExit({
    game,
    preservedVisual: adoptedBattleVisual,
    visualPool: battleVisualPool,
  });
  frameInfo.player = null;
  frameInfo.tanks = game.tanks;
  frameInfo.shells = game.shells;
  markGarageStage('worldAndHero');
  // perf-r2f: chunked — the hero repaints in the first slice (inside the
  // transition veil); parked roster entries follow one frame apart instead
  // of freezing the garage reveal for the whole cache.
  applyCamoPatternsChunked({
    priorityIds: [selectedSpecId], onlySpecIds: [selectedSpecId],
  });
  setGarageSpots(true);
  setGarageSunTrim(true);
  markGarageStage('lighting');
  bus.emit('phase:change', { phase: 'garage' });
  endOverlay.style.display = 'none';
  if (document.exitPointerLock) document.exitPointerLock();
  hud?.setMode?.('hidden');
  markGarageStage('eventAndHud');
  garage.show(selectedSpecId);
  markGarageStage('garageUi');
  garageCameraPose();
  showroom.start(); // SHOWROOM CAMERA: hero framing + drag-orbit takes over
  markGarageStage('camera');
  audio.ambientOn(false);
  audio.playGarageSting();
  markGarageStage('audio');
  garageTrace.totalMs = Math.round(performance.now() - garageStartedAt);
}

// STATE TRANSITIONS: every player-facing exit from a battle passes through
// the branded veil instead of hard-popping the garage mid-frame. Error paths
// (battle-entry failure) and probe-driven exits keep calling enterGarage()
// directly. The battle keeps rendering under the fade-in, so the swap itself
// happens fully covered.
let leavingBattle = false;
function leaveBattleToGarage() {
  if (leavingBattle) return;
  leavingBattle = true;
  // The transition intentionally delays the scene swap, but kill-cam DOM is
  // input state and must release synchronously on the actual leave action.
  clearBattlePresentationForExit();
  transition.run(() => { enterGarage(); }, {
    kicker: 'Leaving battle', title: 'Garage',
    mapId: world?.mapId || game.mapId,
    progress: false, minShowMs: 760,
  }).finally(() => { leavingBattle = false; });
}

// End-screen BATTLE AGAIN (battle_again fix): the garage return and the new
// battle entry must be SEQUENCED, not raced — transition.run defers its
// enterGarage() callback past the fade-in, so firing the garage BATTLE button
// on a timer let a warm-cache startBattle() land first and then get clobbered
// back to the garage. Await the full garage re-entry transition, then drive
// the garage's own BATTLE button so the standard loading path runs with the
// player's current tank/map selection.
bus.on('ui:battleAgain', async () => {
  if (leavingBattle) return;
  leavingBattle = true;
  try {
    // a verdict can land while the previous entry pipeline is still in its
    // drain/countdown tail (entry lifecycle pending) — wait it out, bounded,
    // instead of silently dropping the click
    const t0 = performance.now();
    while (battleEntryLifecycle.pending && performance.now() - t0 < 15000) {
      await new Promise((r) => setTimeout(r, 150));
    }
    await transition.run(() => { enterGarage(); }, {
      kicker: 'Regrouping', title: 'Next battle',
      mapId: world?.mapId || game.mapId,
      progress: false, minShowMs: 420,
    });
  } finally {
    leavingBattle = false;
  }
  const b = document.querySelector('.cot-battle');
  if (b) b.click();
});

bus.on('ui:roomOpen', async () => {
  if (!playMenuPromise) return;
  const menu = await playMenuPromise;
  menu.showCurrentRoom();
});

bus.on('ui:roomReady', ({ ready } = {}) => {
  networkRoomCoordinator.setReady(!!ready);
});

bus.on('ui:roomStart', () => networkRoomCoordinator.startRound());

// ---------------------------------------------------------------------------
// HUD frame assembly (§4 step 7)
// ---------------------------------------------------------------------------
const frameInfo = {
  timeS: 0,
  pingMs: 0,
  mode: 'battle',
  camera,
  player: null,
  tanks: game.tanks,
  shells: game.shells,
  aim: {
    point: new THREE.Vector3(),
    distM: 0,
    dispersionRadM: 1,
    penRatio: null,
    blockedDistM: null,
    blockedLabel: false, // r7: dwell-gated PATH BLOCKED text (tint stays instant)
    gunMarker: new THREE.Vector3(),
    gunDistM: 0,
    gunTargetId: null,
    singleReticle: false,
    atGunLimit: false,
    gunLimitSpec: false, // GUN LIMIT label (movement.js r3: spec pins only)
    reload: { t: 0, totalS: 1, kind: 'ready' },
    magazine: { rounds: 0, capacity: 0 },
    shellSlot: 0,
    shells: [],
    zoom: 1,
  },
  killfeedHandledByBus: true,
  spotting: null, // SPOTTING WIRING: filled per frame by refreshSpotFrame()
};

// SPOTTING WIRING: HUD-facing view of the spotting sim — enemy visibility
// gate (minimap/diamonds/nameplates) + the player's own concealment snapshot
// for the camo/eye indicator. Reused object, refreshed per HUD frame.
const spotFrame = {
  // player-team intel with the PLAYER as receiver: an allied spot from a
  // damaged-radio tank shares over the correct range (simulation_correctness r1)
  receiver: null,
  isSpotted: (id) => (game.spotting
    ? game.spotting.isSpotted(id, 'player', spotFrame.receiver || game.player)
    : true),
  player: null,
};
function refreshSpotFrame(focus = game.player) {
  spotFrame.receiver = focus || null;
  if (game.spotting && focus && focus.state) {
    spotFrame.player = game.spotting.getConcealment(focus, game.timeS);
  } else {
    spotFrame.player = null;
  }
  frameInfo.spotting = spotFrame;
}

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------
// A typed, allocation-free owner samples every device and publishes the one
// mutable camera-input record consumed by the existing rig.
const camInput = playerFrameInput.camera;
const _listenerPose = {
  pos: null, forward: _fwd, kind: 'camera', ownerId: null, scoped: false,
}; // reused — no per-frame literal
let simAcc = 0;
let lastMs = -1;
// PAUSE (owner: "pause mid game if u press escape"): live-battle pause
// bookkeeping — see the PAUSE block in tick(). `lastResumeDtR` is the dt the
// first frame after a resume actually integrated; tools/pause-probe.mjs
// asserts it never exceeds SIM_DT (no pause-duration catch-up hop).
const pauseInfo = { paused: false, resumes: 0, lastDtR: 0, lastResumeDtR: -1 };
let lastFov = camera.fov;
let endShown = false;
let deathCamShown = false; // killcam_shotinfo r1: death replay played at death
// killcam r2 DEATH BEAT (owner: "your own death cam should show your tank
// exploding the same way before the killcam"): the replay no longer starts on
// the death frame — the live death cam holds ~2.6 s first, so the REAL
// destruction (state.js setDestroyed turret pop + fx fireball + the new
// tank_explosion/turret-pop-accent samples, all fired on 'tank:destroyed' at
// this exact moment) plays out on screen at full sim rate before the cinematic
// takes over. Wall-clock deadline pumped in tick(); the battle-result branch
// REWIRES fire() when the result lands mid-beat so the replay continues into
// finishBattle instead of the spectate path. Cleared by resetBattle.
let kcPending = null; // { deadline: ms, fire: () => void }
const DEATH_BEAT_MS = 2600;
let shotMode = false;
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
  // authority, and otherwise runs only its one-second paint watchdog.
  shouldUseIdleCadence: () => bootComplete && game.phase === 'garage' &&
    !battleEntryLifecycle.renderingCovered && !transition.active &&
    !studio.active && !shotMode && !showroom.moving &&
    !pedestal.switchPending && !networkMatch,
  idleIntervalMs: 1000,
});
rearmRafAfterContext = frameLoop.restart;
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
    if (shotHudFrame) hud.update(frameInfo);
    lighting.update(true); // force ALL shadow cascades — deterministic capture
    post.render(dtR);
    return;
  }

  const inBattle = game.phase === 'battle';
  const paused = settings.isOpen(); // settings panel freezes the battle
  // The load screen remains physically composited for its 280 ms fade after
  // hide() is requested. Drain input during that complete interval without
  // applying it to the rig; otherwise the battle-button/pointer-lock gesture
  // can reveal a steep orbit and openBattle() used to snap it back afterward.
  const battleEntryCameraLocked = inBattle && battleLoad?.covering === true;
  // KILL-CAM: while the replay runs, the sim/rig/visual-sync are all frozen —
  // resuming just continues the fixed-step loop (no drifted timers).
  const kcActive = killcam.isActive();

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
  if (game.phase === 'garage') networkFramePump.pump(dtR, nowMs);
  if (game.phase === 'garage' && !garageFramePacer.shouldRender(nowMs, {
    animate: garageAnimating,
  })) return;
  if (game.phase === 'garage') showroom.update(dtR);

  // PAUSE (owner: Esc mid-game). `paused` has always gated the fixed-step sim
  // (step 2) plus input/rig, but fx kept aging, dust kept pumping off frozen
  // hulls and the engine mix kept roaring — an open menu over a live battle,
  // not a pause. `livePaused` is the real pause gate: the Esc overlay over a
  // LIVE battle only. Kill-cam replays and the end overlay keep their
  // existing Esc behavior (the replay owns the frame; the post-result sim
  // plays out behind the report), garage/shot/studio never reach here with
  // inBattle set. The camera simply HOLDS while paused (rig already gated on
  // !paused) — no sim advancement of any kind behind the overlay.
  const livePaused = paused && inBattle && !kcActive && !game.result;
  if (livePaused !== pauseInfo.paused) {
    pauseInfo.paused = livePaused;
    if (!livePaused) {
      // RESUME dt clamp — extension of the 0.1 s frame clamp above: the
      // first un-paused frame integrates at most ONE sim step, so a pause of
      // any length can never land a 4-step catch-up hop (starved-rAF panes
      // tick sparsely during the pause, leaving a full 0.1 s gap otherwise).
      dtR = Math.min(dtR, SIM_DT);
      pauseInfo.resumes += 1;
      pauseInfo.lastResumeDtR = dtR;
    }
    // audio.js: engine/battle buses duck to near-silence while paused,
    // restore on resume (UI clicks and crew voices stay up).
    bus.emit('ui:pause', { on: livePaused });
  }
  pauseInfo.lastDtR = dtR;

  // 1. Poll the complete rebindable device state through one typed owner.
  // It reuses its scratch records and clears consumed wheel/mouse edges, so
  // neither the render loop nor the input hot path allocates per frame.
  playerFrameInput.poll({
    dtSeconds: dtR,
    inBattle,
    paused,
    killcamActive: kcActive,
    cameraLocked: battleEntryCameraLocked,
    rigMode: rig.mode,
    player: game.player,
  });

  // Network authority keeps pumping while the loading screen owns the page,
  // then consumes the same polled controls once the shared countdown opens.
  if (game.phase !== 'garage') networkFramePump.pump(dtR, nowMs);

  // 2. fixed-step simulation (held while the settings panel is open)
  if (inBattle && !paused && !kcActive) {
    // battle_countdown r1: pre-battle hold — the sim does not step AT ALL
    // while preBattleS > 0 (no movement, no AI, no fire, no battle clock;
    // spawn poses were support-solved at roster build). The camera rig runs
    // outside the sim, so looking around stays free, exactly like WoT's
    // pre-battle freeze. simAcc stays drained so release cannot replay a
    // catch-up burst of queued sim steps. The rest of the frame (rig,
    // visuals, fx, render) runs normally; entry loading must already be done
    // so this phase has the same frame budget as live play.
    if (networkMatch) {
      // The server/host owns both the countdown and every simulation step.
      // `game.preBattleS` is presentation copied from snapshot metadata.
      hud.preBattleCountdown(game.preBattleS);
      simAcc = 0;
    } else if (game.preBattleS > 0) {
      if (game.preBattleS !== Infinity) { // Infinity = still under the loading screen
        const heldS = game.preBattleS;
        // Covered entry warm normally finishes before the world is revealed.
        // Keep the final-second hold as a fail-safe for an interrupted/future
        // entry path; controls must never release while construction is live.
        game.preBattleS = advancePreBattleCountdown(
          game.preBattleS, frameWallDtS, battleWarmPending,
        );
        hud.preBattleCountdown(game.preBattleS); // 0 on the crossing frame = release flash
        if (heldS > 0 && game.preBattleS === 0) bus.emit('battle:rollout', {});
      }
      simAcc = 0;
    } else {
      simAcc = Math.min(simAcc + dtR, SIM_DT * MAX_SIM_STEPS);
      while (simAcc >= SIM_DT) {
        simStep(game, bus, world, rig, collider);
        battlePresentation.captureSoloPoses();
        simAcc -= SIM_DT;
      }
    }
    if (game.result && !endShown) {
      endShown = true;
      if (document.exitPointerLock) document.exitPointerLock();
      // KILL-CAM: replay the battle-deciding shell first (player death cam /
      // victory final blow); the overlay + death cam resume when it finishes
      // or is skipped. Without a captured shell, fall through immediately.
      const finishBattle = () => {
        veilHud(false);
        showEndOverlay(game.result);
        bus.emit('battle:presented', { result: game.result });
        rig.release();
        // Death-cam: slow orbit of the player's wreck behind the overlay.
        if (game.result === 'defeat' && rig.startDeathCam) rig.startDeathCam();
      };
      // killcam_shotinfo r1: never replay an already-shown death — when the
      // player died earlier (battle continued), a later team 'defeat' would
      // re-run the stale death replay without this guard.
      if (kcPending) {
        // killcam r2: the mid-battle death beat is already holding (player
        // died a beat before the team result resolved) — keep its deadline,
        // but the replay must now hand over to the END flow, not the
        // spectate path. The !deathCamShown guard is deliberately dropped:
        // arming the beat set deathCamShown, yet THIS death was never
        // presented — the beat owns it (defeat: death replay; victory: a
        // fresh final blow or a straight fall-through to the overlay).
        kcPending.fire = () => {
          const played = killcam.playForResult(game.result, game.timeS, finishBattle);
          debugFlags.lastEndFlow = { played, result: game.result, timeS: game.timeS,
            resultWallMs: performance.now(), kcBeginWallMs: killcam.lastBeginWallMs };
          if (played) veilHud(true);
          else finishBattle();
        };
      } else {
        // Battle-deciding death: the replay must begin THIS frame (shotInfo's
        // report gate latches on killcam:begin one frame after battle:ended)
        // — the live destruction beat plays INSIDE the killcam as its 'wreck'
        // opening phase, flagged fresh here (killcam r2).
        const freshKill = !deathCamShown && !!(game.player &&
          game.player.combat && game.player.combat.destroyed);
        const played = !deathCamShown &&
          killcam.playForResult(game.result, game.timeS, finishBattle, { freshKill });
        debugFlags.lastEndFlow = { played, result: game.result, timeS: game.timeS,
          resultWallMs: performance.now(), kcBeginWallMs: killcam.lastBeginWallMs }; // KILL-CAM debug
        if (played) {
          veilHud(true); // cinematic letterbox owns the screen
        } else {
          finishBattle();
        }
      }
    } else if (!game.result) {
      endShown = false;
    }
    // killcam_shotinfo r1: the player died but the battle continues (allies
    // still fighting) — play the death replay, then spectate the wreck with
    // the death cam until the team result resolves. killcam r2: the replay
    // starts after the DEATH BEAT (see kcPending) — the live death cam holds
    // on the wreck while the real turret pop / fireball / explosion sample
    // play at full sim rate, THEN the cinematic re-tells the shot.
    if (!game.result && game.player && game.player.combat.destroyed && !deathCamShown) {
      deathCamShown = true;
      if (rig.startDeathCam) rig.startDeathCam(); // beat framing: wreck orbit
      const afterDeath = () => {
        veilHud(false);
        rig.release();
        if (rig.startDeathCam) rig.startDeathCam();
      };
      kcPending = {
        deadline: performance.now() + DEATH_BEAT_MS,
        fire: () => {
          // Chromium can synchronously spend a full frame releasing pointer
          // lock. Keep the live destruction frame paintable, then pay that
          // browser transition under the covered replay that hands the player
          // an unlocked spectator cursor.
          if (document.exitPointerLock) document.exitPointerLock();
          if (killcam.playForResult('defeat', game.timeS, afterDeath)) veilHud(true);
          else afterDeath();
        },
      };
    }
    // killcam r2: pump the armed death beat (wall clock — presentation only)
    if (kcPending && performance.now() >= kcPending.deadline) {
      const fire = kcPending.fire;
      kcPending = null;
      fire();
    }
  }

  // 3. presentation pose + camera rig. Resolve the hull/turret hierarchy
  // BEFORE the camera asks for its turret/gun anchors; both now consume the
  // same interpolated pose in the same frame instead of the camera chasing
  // yesterday's visual transform while the tank jumps to today's sim tick.
  if (!kcActive && !livePaused) {
    const presentationAlpha = networkMatch ? 1 : simAcc / SIM_DT;
    battlePresentation.update(dtR, presentationAlpha);
  }
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
  if (world && !worldDormant) {
    world.setSniperFade(rig.mode === 'SNIPER' ? 1 : 0, false, camera.fov, rig.aimDist);
  }
  camera.getWorldDirection(_fwd);
  let occlFocus = null;
  const cameraFocus = game.player || (networkSpectator ? rig.spectateTargetEnt : null);
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
  if (world && !worldDormant) world.update(dtR, camera.position, _fwd, occlFocus);

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

  // 7. HUD (hidden + frozen while the kill-cam letterbox owns the screen).
  // NOTE: live isActive() check — the replay may have STARTED in step 2 of
  // this very tick, and hud.update would re-show the HUD over the letterbox.
  const observerFocus = networkSpectator && killcam.spectate.active
    ? networkBridge?.entities.get(killcam.spectate.targetId) || null
    : null;
  const hudFocus = game.player || observerFocus;
  if (observerFocus) networkBridge?.setPerspective(observerFocus.id);
  if (inBattle && hudFocus && !kcActive && !killcam.isActive()) {
    frameInfo.timeS = game.timeS;
    frameInfo.pingMs = networkMatch ? (networkMatch.client?.rttMs ?? 0) : 0;
    frameInfo.mode = rig.mode === 'SNIPER' ? 'sniper' : 'battle';
    frameInfo.player = hudFocus;
    frameInfo.tanks = game.tanks; // COMMUNITY TANKS: roster varies per battle
    frameInfo.rosterTanks = networkBridge ? networkBridge.roster : game.tanks;
    frameInfo.shells = game.shells;
    refreshSpotFrame(hudFocus); // SPOTTING WIRING
    if (game.player) aimController.update(frameInfo.aim);
    hud.update(frameInfo);
    if (game.player) {
      const armorEnabled = input.getSettings().armorAimOverlay;
      const armorScoped = rig.mode === 'SNIPER' && !!camera.userData.scoped;
      armorScopeTargets.length = 0;
      if (armorEnabled && armorScoped) {
        for (const ent of game.tanks) {
          if (ent === game.player || ent.team === game.player.team || ent.combat?.destroyed) continue;
          if (!ent.visual?.root?.visible) continue;
          armorScopeTargets.push(ent);
        }
      }
      armorAimOverlay.update({
        enabled: armorEnabled,
        scoped: armorScoped,
        targets: armorScopeTargets,
        shellSpec: game.player.spec.gun.shells[game.player.combat.shellSlot],
        muzzle: _rayO,
        nowMs: performance.now(),
      });
    } else {
      armorAimOverlay.hide();
    }
    touchControls?.update(hudFocus.state?.speed || 0);
    damagePanel.update(hudFocus.combat);
  } else {
    armorAimOverlay.hide();
  }

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
  lighting.update(false, dtR);
  post.render(dtR);
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
      hideEndOverlay: () => { endOverlay.style.display = 'none'; },
      setLastFov: (value) => { lastFov = value; },
      refreshSpotFrame,
      getWorld: () => world,
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
playerBattleActions.setTank(getSpec(selectedSpecId));
garage.show(selectedSpecId);
garageCameraPose(); // fallback pose until the orbit measures the hero
showroom.start();
garageFramePacer.reset(performance.now());
setGarageSunTrim(true); // camo_spotting r2: boot lands on the garage screen
hud?.setMode('hidden');

// BOOT DEFERRAL seam: the battlefield build is deferred until BATTLE is
// pressed, so `world` is legitimately null on the garage boot path — the
// garage bay renders without it. When a world IS already active (harness
// staging a battlefield view before readiness), warm it as before.
if (world) {
  world.update(0, camera.position);
  battlePresentation.update();
}
await bootStage('post', async () => {
  // Direct Studio boot has no garage hero or dressing to present. Its own
  // covered entry renders the real world/camera before the boot veil lifts.
  if (STUDIO_BOOT_INTENT) return;
  // COLD-BOOT RECOVERY: never await compileAsync here. Three polls
  // COMPLETION_STATUS_KHR until every program reports ready; affected
  // mobile/ANGLE drivers can leave that advisory bit false forever on the
  // first visit, parking this exact stage at 85%, while a reload succeeds
  // from the driver shader cache. Submit the same programs synchronously,
  // give the driver one frame to work, then let the real hidden render below
  // perform Three's finite first-use link/uniform discovery.
  const t0 = performance.now();
  try { renderer.compile(scene, camera, scene); } catch (_) { /* first render is fallback */ }
  BOOT_TIMINGS.postCompile = Math.round(performance.now() - t0);
  lighting.update(true); // boot: render every cascade before first present
  const yieldGpuFrame = createFrameBudgetYielder(16);
  let gpuWarmPulse = 0;
  const yieldGpuWarm = async (force = false) => {
    // This is progress, not a timer: every shadow/upload/post batch renews the
    // inline first-visit watchdog. A genuinely wedged GPU promise stays silent
    // and is recovered, while an old device that keeps advancing is never
    // mistaken for a dead boot.
    boot.sub(Math.min(0.94, 0.04 + gpuWarmPulse++ * 0.035));
    return yieldGpuFrame(force);
  };
  await yieldGpuWarm(true);
  const shadowPasses = await lighting.primeShadowMaps(
    renderer, scene, camera, yieldGpuWarm,
  );
  BOOT_TIMINGS.shadowPassMax = Math.max(0, ...shadowPasses);
  BOOT_TIMINGS.shadowPasses = shadowPasses;
  const sceneUploadStartedAt = performance.now();
  const sceneUploadBatches = await warmSceneOffscreenBatched(renderer, scene, camera, {
    maxObjects: 64,
    maxWeight: 240_000,
    yieldBeforeBatch: yieldGpuWarm,
  });
  BOOT_TIMINGS.sceneUpload = Math.round(performance.now() - sceneUploadStartedAt);
  BOOT_TIMINGS.sceneUploadMax = Math.max(0, ...sceneUploadBatches);
  BOOT_TIMINGS.sceneUploadBatches = sceneUploadBatches;
  const warmStartedAt = performance.now();
  const postPasses = await post.warmFirstFrame(yieldGpuWarm);
  BOOT_TIMINGS.postWarm = Math.round(performance.now() - warmStartedAt);
  BOOT_TIMINGS.postPassMax = Math.max(0, ...postPasses.map((pass) => pass.ms));
  BOOT_TIMINGS.postPasses = postPasses;
  post.render(SIM_DT);
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
  getWorld: () => world,
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
  getWorldGroup: () => world?.group ?? null,
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
    world: () => world,
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
    hfProxy, getWorld: () => world,
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
    getWorld: () => world,
    getRig: () => rig,
    getCollider: () => collider,
    bus,
    input,
    aimController,
    debugFlags,
    playerShellLog,
    heightField: hfProxy,
    simStep,
    resetPresentationPoses: battlePresentation.resetSoloPoses,
    resetSimAccumulator: () => { simAcc = 0; },
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
const collectDebugTelemetry = () => perfHud.collectTelemetry();
const sampleShadowContribution = () => perfHud.sampleShadowContribution();

window.__DEBUG = {
  scene, camera, renderer, post, lighting, game, rig, bus,
  get fx() { return fxRuntimeAccess.current; },
  input, // controls probe: isLocked/isCursorAim/binding introspection
  settings, // PAUSE probe: isOpen/open/close introspection
  pauseInfo, // PAUSE probe: { paused, resumes, lastDtR, lastResumeDtR }
  garage,
  // perf-r2e ADAPTIVE AUTO TIER introspection (probes assert the resolved
  // tier, drive the overload escalation, and reset the stored choice)
  quality: {
    resolvePresetName, resolveAutoTier, reportSustainedOverload,
    setPresetName, setMobilePresetName, noteGpuRenderer,
  },
  get pedestalVisual() { return pedestal.current; },
  get pedestalOnStage() { return pedestal.isOnStage(); },
  // switch-desync r1: the id the garage UI (stats card / card highlight)
  // believes is selected — probes assert pedestalVisual.specId === this.
  get selectedSpecId() { return selectedSpecId; },
  get pedestalCacheIds() { return [...pedestal.cacheIds]; },
  get worldCacheIds() { return [...worldCache.keys()]; },
  get residentLimits() { return { ...residentLimits }; },
  get battleVisualPool() { return battleVisualPool.stats(); },
  get garageFramePacer() { return { ...garageFramePacer.stats }; },
  get frameLoopScheduler() { return { ...frameLoop.stats }; },
  get lastWorldRelease() {
    return worldBuildCoordinator.lastRelease
      ? { ...worldBuildCoordinator.lastRelease } : null;
  },
  get graphicsContextLost() { return graphicsContextLost; },
  selectGarageTank: (id) => garage.setSelected(id),
  // Geometry probes must also inspect registered procedural variants that do
  // not own a visible carousel card. Bypass the UI filter while preserving
  // the exact pedestal construction/pose used by the garage.
  stagePedestalTank: (id) => {
    selectedSpecId = id;
    return pedestal.set(id, true);
  },
  get world() { return world; },
  switchMap,
  flags: debugFlags,
  frameInfo,
  aimAtNearest: driveTestController.aimAtNearest,
  gunAimError: driveTestController.gunAimError,
  // controls_gunnery r6: attributable terminal event per player shell
  // (tank/terrain/air + miss distance to the intended target's hull center)
  playerShellLog,
  // controls_gunnery r6: per-battle bot-vs-player pressure counters
  botPressure,
  aimState: driveTestController.aimState, // {errMrad,bloomF,reticleRadM,aimDistM,reloadT}
  fastForward: driveTestController.fastForward,
  slayEnemies: driveTestController.slayEnemies,
  startBattle: debugStartBattle,
  bakeMinimapForMap: async (mapId) => {
    await ensureBattleHud();
    const next = await ensureWorld(mapId, null, { precompile: false, services: false });
    buildWorldMinimap(next, true);
    return hud.exportMinimapBackground('image/webp', 0.92);
  },
  // perf-smooth r1: the legacy player battle-entry path (loading screen ->
  // chunked world build -> roster bake -> countdown), so probes can
  // measure the real pre-battle timeline instead of only the synchronous
  // startBattle shortcut. Resolves when the battle opens.
  beginBattleEntry,
  // User-facing bot entry: original local simulation, with no network stack.
  beginSoloBattle,
  // Full-render QA seam: browser probes create real room sessions, then hand
  // them to the same private/LAN entry path used by the play menu.
  beginNetworkBattle: (request) => networkBattleLauncher.beginPrivate(request),
  enterGarage,
  leaveBattleToGarage,
  // SPOTTING WIRING: live SpottingSystem for headless concealment checks
  get spotting() { return game.spotting; },
  get killcam() { return killcam; },   // KILL-CAM introspection (phase, cancel)
  showroom,                            // garage orbit introspection (debugState)
  garageDressing,                      // garage-scene r1: workshop dressing rig
  spawnKillShell: driveTestController.spawnKillShell, // KILL-CAM: die on purpose
  // effects_combat r2: shot-mode latch exposed for headless drive tests
  get shotMode() { return shotMode; },
  set shotMode(v) { shotMode = !!v; },
  // controls_gunnery r3: stage the reticle hit-confirm marker on demand so
  // captures can verify its weight without landing a live 400 m shot.
  forceHitMark: async (bounced) => {
    await ensureBattleHud();
    hud.forceHitMark(!!bounced);
  },
  // damage panel r9: pose/state hooks for probes + deterministic captures
  get damagePanel() { return damagePanel; },
  // Development flight recorder, or production QA recorder with `?debug=1`.
  // Ordinary production sessions keep this null and never load its chunk.
  devTrace,
  get network() { return networkFramePump.diagnostics(); },
  get networkPresentation() { return networkBridge?.getPresentationEventStats?.() || null; },
  telemetry: collectDebugTelemetry,
  sampleShadowContribution,
  // Development-only rendered lifecycle probe: feed authoritative-format
  // presentation events through the real bridge/queue without exposing the
  // authority runtime or mutating production networking APIs.
  injectNetworkEvents(events) {
    const latestNetworkSnapshot = networkFramePump.latestSnapshot;
    if (!import.meta.env.DEV || !networkBridge || !latestNetworkSnapshot) return false;
    const batch = Array.isArray(events) ? events : [];
    const matchEnded = batch.find((event) => event?.type === 'match_ended');
    const snapshot = matchEnded
      ? { ...latestNetworkSnapshot,
        meta: { ...latestNetworkSnapshot.meta, result: matchEnded.result } }
      : latestNetworkSnapshot;
    return networkBridge.apply(snapshot, 1 / 60, batch);
  },
};
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
    return openPlayMenu({
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
    if (!pedestal.current) await pedestal.set(selectedSpecId, true);
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
