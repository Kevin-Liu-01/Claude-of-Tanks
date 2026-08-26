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
import { createRenderer, onResize } from './engine/renderer.js';
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
import { createCameraRig, createShowroomOrbit } from './engine/cameraRig.js';
import {
  createFrameBudgetYielder,
  createOpaqueLoadingYielder,
  nextFrame,
} from './engine/frameScheduler.ts';
import { createBootLifecycle } from './engine/bootLifecycle.ts';
import {
  compileForRenderTarget,
  snapshotRendererPrograms,
  warmNewRendererProgramUniforms,
} from './engine/programWarm.ts';
import {
  createDeploymentForwardWarmBatches,
  createIsolatedForwardWarmBatches,
} from './engine/deploymentWarm.ts';
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
import { createGarage } from './ui/garage.js';
import { getLastBattleRecord, installBattleRecords } from './game/profile.js';
import {
  createGarageStage, GARAGE_PODIUM_TOP_Y_M, GARAGE_TRACK_AXIS_YAW_RAD,
} from './ui/garageStage.js';
import { createGarageDressingAccess } from './game/garageDressingAccess.ts';
import { createGarageDressingScheduler } from './game/garageDressingScheduler.ts';
import { createGaragePedestalPreloader } from './game/garagePedestalPreloader.ts';
import { createGarageIdleWorkCoordinator } from './game/garageIdleWorkCoordinator.ts';
import { createBattleVisualPool } from './game/battleVisualPool.js';
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
import { createNetworkRoomCoordinator } from './net/networkRoomCoordinator.ts';
import { loadEquipment as loadSelectedEquipment } from './game/equipment.js';
import { createSettingsAccess } from './ui/settingsAccess.ts';
import { createTouchControlsAccess } from './ui/touchControlsAccess.ts';
import { installResponsiveLayout } from './ui/responsiveLayout.js';
import { installResponsiveSurfaceStyles } from './ui/responsiveSurfaces.js';
import {
  spawnTanks, ensureStagedVisuals, nextStagedBake, planBattleParticipantIds,
  planBattleCamoOverrides,
} from './game/rosterState.ts';
import { createBus, createGameState, mulberry32 } from './game/stateCore.ts';
import { createSoloBattleRuntimeAccess } from './game/soloBattleAccess.ts';
// BOOT SCREENS: the entry/loading gate (markup inline in index.html so first
// paint never waits on this module graph) and the pre-battle roster screen.
import { createBootScreen } from './ui/bootScreen.js';
import { createBattleLoadScreen, tierNumeral } from './ui/battleLoad.js';
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
let minimapAssetMapId = null;
let minimapAssetGeneration = 0;
let minimapAssetPending = null;
let world = null;
let pendingMapId = 'verdant';    // battlefield the garage is pointing at
let pendingMapChoice = 'verdant'; // includes the non-prefetchable Random card
let worldDormant = false;        // garage: world hidden + per-frame update off
let worldServicesMapId = null;   // collider/minimap/garage placement prepared
let worldPrefetchTimer = 0;
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

// Prime the selected battlefield only after boot and a genuine garage lull.
// beginWorldBuild's background path runs in 4 ms slices and pauses itself as
// soon as pointer/key/touch activity advances the shared garage epoch at the next
// checkpoint. The result is the exact normal world object in the normal cache:
// Battle intent/click promotes or joins it without duplicate geometry, and a
// player who spends a few seconds choosing a tank pays almost none of the
// battlefield build under the loading veil.
function queueWorldPrefetch(mapId, delay = 4000) {
  if (worldPrefetchTimer) clearTimeout(worldPrefetchTimer);
  worldPrefetchTimer = 0;
  if (!bootComplete || !mapId) return;
  worldPrefetchTimer = setTimeout(() => {
    worldPrefetchTimer = 0;
    if (game.phase === 'garage' && pendingMapChoice === mapId) {
      // Random is the normal first-run selection. Ignoring it meant the most
      // common Battle press could never benefit from the otherwise-bounded
      // idle world streamer. Resolve the next battle once, retain that plan
      // for the click, and build its exact world only during genuine garage
      // idle slices. A map/tank change invalidates the plan as before.
      const resolvedMapId = mapId === 'random'
        ? resolveBattleIntentMap(selectedSpecId, mapId) : mapId;
      loadWorldModule()
        .then(() => prefetchWorld(resolvedMapId))
        .catch(() => null);
      ensureTankBuilder(selectedSpecId).catch(() => null);
    }
  }, delay);
}

let battleIntentTextureKey = '';
let battleIntentTextureGeneration = 0;
let battleIntentTexturePromise = null;
let battleIntentMapPlan = null;

function resolveBattleIntentMap(specId, mapId) {
  if (mapId !== 'random') {
    battleIntentMapPlan = null;
    return mapId;
  }
  if (battleIntentMapPlan
      && battleIntentMapPlan.specId === specId
      && battleIntentMapPlan.battleCount === game.battleCount) {
    return battleIntentMapPlan.resolved;
  }
  const resolved = resolveMapId('random');
  battleIntentMapPlan = {
    specId,
    battleCount: game.battleCount,
    resolved,
  };
  return resolved;
}

function preloadBattleRosterTextures(specId, plannedIds, foregroundYield = null) {
  const ids = [...new Set((plannedIds || []).filter(Boolean))];
  const key = `${game.battleCount}:${specId}:${ids.join(',')}`;
  if (battleIntentTexturePromise && battleIntentTextureKey === key) {
    return battleIntentTexturePromise;
  }
  const generation = ++battleIntentTextureGeneration;
  battleIntentTextureKey = key;
  const pending = (async () => {
    await ensureTankBuilders(ids);
    for (const id of ids) {
      if (generation !== battleIntentTextureGeneration) return;
      // Hover/focus intent uses a conservative garage budget. Once the opaque
      // battle loader owns the page, the click promotes a cold preparation to
      // its faster covered-frame yielder. materials.js coalesces either path
      // into the same per-spec texture promise, so an in-flight intent warm is
      // never duplicated and every eventual raster remains byte-identical.
      const tick = foregroundYield || frameBudgetTick(3);
      await prebakeSharedTextures(
        getSpec(id), engineCtx.anisotropy ?? 4,
        id === specId ? 'preview' : 'ai', tick,
      );
    }
  })().catch((error) => {
    console.warn('[loading] Battle-intent texture warm failed:', error);
  }).finally(() => {
    if (battleIntentTexturePromise === pending) battleIntentTexturePromise = null;
  });
  battleIntentTexturePromise = pending;
  return pending;
}

function cancelBattleIntentTextureWarm() {
  const pending = battleIntentTexturePromise;
  ++battleIntentTextureGeneration;
  battleIntentTexturePromise = null;
  battleIntentTextureKey = '';
  return pending || Promise.resolve();
}

function preloadBattleIntent({ specId, mapId } = {}) {
  audio.preload();
  settings.preload().catch(() => null);
  armorAimOverlay.preload().catch(() => null);
  ensureBattleHud().catch(() => null);
  ensureTouchControls().catch(() => null);
  loadWorldModule().catch(() => null);
  preloadSoloBattleRuntime().catch(() => null);
  preloadBattleClientRuntime().catch(() => null);
  preloadKillcamModule().catch(() => null);
  // A pointer/focus/touch on BATTLE is stronger intent than ordinary garage
  // browsing. Transfer the deterministic next roster's exact family chunks
  // now, not only the selected hero, so the click can overlap parsing with
  // the player's natural hover. No visual or battlefield is constructed.
  if (specId) {
    const planned = planBattleParticipantIds(game, specId, true);
    ensureTankBuilders(planned).catch(() => null);
    preloadBattleRosterTextures(specId, planned);
  }
  // Decode the shipped deterministic sprite atlases after explicit intent.
  // The fallback procedural generator and every rendered texture are
  // unchanged; this only moves module transfer/PNG decode ahead of the veil.
  ensureFxRuntime()
    .then((live) => live.preloadTextures?.())
    .catch(() => null);
  // Random is the default garage card. Resolve its concrete battlefield at
  // explicit Battle intent and retain that exact choice for the click, so the
  // world can genuinely build during hover/focus instead of discovering the
  // map only after the loading veil appears.
  const plannedMapId = specId && mapId
    ? resolveBattleIntentMap(specId, mapId) : mapId;
  if (plannedMapId) {
    prefetchWorld(plannedMapId, { intent: true });
    ensureBattleHud()
      .then(() => hud.preloadMinimapAsset(minimapAssetUrl(plannedMapId)))
      .catch(() => null);
  }
}

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
const battleVisualPool = createBattleVisualPool({
  capacity: getDeviceTier() === 'mobile' ? 0 : 4,
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

async function streamBattleVisuals(predicate, yieldForBudget, onProgress = null,
  initiallyHidden = false) {
  const pending = game.tanks.filter((ent) =>
    !ent.visual && (!predicate || predicate(ent)));
  const total = pending.length;
  // Resolve every profile chunk needed by this cohort concurrently before
  // procedural construction begins. The old per-vehicle await serialized a
  // network/parse boundary ahead of each country's first tank even though
  // the roster is already known and all chunks are independent.
  await ensureTankBuilders(pending.map((ent) => ent.specId));
  let built = 0;
  for (;;) {
    const next = nextStagedBake(game, predicate);
    if (!next) return built;
    const visualTiming = {
      specId: next.ent.specId,
      quality: next.quality,
      startedAt: Math.round(performance.now()),
    };
    const visualTimings = typeof window !== 'undefined'
      ? (window.__VISUAL_LOAD_TIMINGS ||= []) : null;
    visualTimings?.push(visualTiming);
    let visualMark = performance.now();
    try {
      await prebakeSharedTextures(getSpec(next.ent.specId),
        engineCtx.anisotropy ?? 4, next.quality, () => yieldForBudget());
    } catch (_) { /* visual construction remains the fallback */ }
    visualTiming.prebakeMs = Math.round(performance.now() - visualMark);
    visualMark = performance.now();
    ensureStagedVisuals(game, 1, predicate);
    visualTiming.buildMs = Math.round(performance.now() - visualMark);
    visualMark = performance.now();
    await stageBattleVisualReveal(next.ent, yieldForBudget, initiallyHidden);
    visualTiming.uploadMs = Math.round(performance.now() - visualMark);
    visualTiming.compileMs = next.ent.visual?.root?.userData.loadCompileMs || 0;
    visualTiming.totalMs = Math.round(performance.now() - visualTiming.startedAt);
    built++;
    if (onProgress) onProgress(built / Math.max(1, total));
    await yieldForBudget();
  }
}

/** Upload every texture currently referenced by one scene subtree without
 * drawing or compiling it. Texture initialization is independent of the
 * garage/battle light set, so world maps can be staged as soon as their graph
 * exists while the correct battle shaders remain deferred until startBattle
 * has disabled the garage lights. */
async function stageRootTextureUploads(root, yieldForBudget) {
  if (!root) return { textures: 0, totalMs: 0 };
  const startedAt = performance.now();
  const textures = new Set();
  root.traverse((object) => {
    const materials = Array.isArray(object.material)
      ? object.material : (object.material ? [object.material] : []);
    for (const material of materials) {
      for (const key of Object.keys(material)) {
        const value = material[key];
        if (value?.isTexture) textures.add(value);
      }
    }
  });
  for (const texture of textures) {
    try { renderer.initTexture(texture); } catch (_) { /* first render fallback */ }
    if (yieldForBudget) await yieldForBudget();
  }
  return {
    textures: textures.size,
    totalMs: Math.round(performance.now() - startedAt),
  };
}

/** Compile against the same linear HDR target used by the gameplay scene
 * pass. Compiling with no target asks Three for default-framebuffer sRGB
 * variants; EffectComposer never uses those for world/tank draws, so the old
 * path built a redundant shader fleet and still linked the real variants on
 * first render. */
function compileForGameplayTarget(root) {
  compileForRenderTarget({
    renderer,
    root,
    camera,
    targetScene: scene,
    target: post?.composer?.renderTarget1 || null,
  });
}

/** Separate visual construction, texture upload, shader submission, and
 * reveal into bounded tasks. compileAsync was tested here and made the
 * transition materially worse on ANGLE because its completion polling became
 * another large atomic task; synchronous compile only submits work, then the
 * remaining roster gives the driver time to link it. */
async function stageBattleVisualReveal(ent, yieldForBudget, initiallyHidden = false) {
  const visual = ent?.visual;
  const root = visual?.root;
  if (!root || root.userData.loadStaged) return;
  const parent = root.parent;
  if (parent) parent.remove(root);
  await yieldForBudget(true);
  // A visual can reference dozens of tiny maps. The shared helper forces a
  // paint only when their accumulated upload work crosses the countdown's
  // frame budget; one unconditional frame per texture stretched an
  // eight-vehicle cold deployment beyond the five-second rollout hold.
  await stageRootTextureUploads(root, yieldForBudget);
  root.userData.loadStaged = true;
  (parent || scene).add(root);
  if (ent.state && visual.syncFromState) visual.syncFromState(ent.state);
  visual.setVisible?.(true);
  const compileAt = performance.now();
  // The burn mask is mathematically inactive until destruction, but it is a
  // shader-key change. Install it before this visual's first compile so live
  // and wreck-capable rendering use one program family; installing it later
  // invalidated every roster material and created 100+ countdown programs.
  visual.prewarmBurn?.();
  // Build the scoped armor flashlight from the same exact collision shell
  // while this actor is already inside its bounded load slice. Enemy actors
  // reach this path during the frozen visible countdown, so the optimization
  // that removed them from the opaque transition remains intact.
  armorAimOverlay.prime(ent);
  const restoreArmorWarmVisibility = armorAimOverlay.warm();
  try { compileForGameplayTarget(root); } catch (_) { /* first render fallback */ }
  finally { restoreArmorWarmVisibility(); }
  root.userData.loadCompileMs = Math.round(performance.now() - compileAt);
  // Opposing actors prepared during the visible deployment countdown are
  // not legally spotted yet. Submit their exact programs while visible to
  // compile(), then hide them before the next paint so neither geometry nor
  // shadows leak their spawn. updateDustAndSync restores the complete root
  // on the first legitimate spotting frame.
  if (initiallyHidden) {
    visual.setVisible?.(false);
    // Object3D.updateMatrixWorld walks invisible descendants. Keeping an
    // unspotted opponent merely `visible=false` therefore paid the complete
    // procedural hierarchy cost every frame even though the renderer and
    // gameplay were forbidden from exposing a pixel. Detach after the exact
    // compile; updateDustAndSync reattaches and synchronizes the root before
    // its first legally spotted render.
    root.removeFromParent();
    root.userData.battleVisibilityDetached = true;
  }
  await yieldForBudget(true);
}

// --- fx ----------------------------------------------------------------------
// The complete particles/effects graph is battle-only. Parsing and building it
// during garage boot delayed first interaction and created GPU objects the
// garage could not display. Intent preloads the module; the opaque battle,
// Studio, and deterministic-shot entry gates below construct exactly one live
// instance before any consumer can emit an effect.
let fx = null;
let fxModulePromise = null;
let fxRuntimePromise = null;
function preloadFxModule() {
  if (!fxModulePromise) {
    fxModulePromise = import('./fx/effects.js').catch((error) => {
      fxModulePromise = null;
      throw error;
    });
  }
  return fxModulePromise;
}
function ensureFxRuntime() {
  if (fx) return Promise.resolve(fx);
  if (fxRuntimePromise) return fxRuntimePromise;
  fxRuntimePromise = preloadFxModule().then(({ createFx }) => {
    const live = createFx(engineCtx, hfProxy, { seed: 5000 });
    scene.add(live.group);
    live.bindBus(bus);
    // createPost runs during garage boot, before this demand-loaded graph
    // exists. Hand its late-composite activity/depth state to the existing
    // pass now; otherwise every layer-30 effect is simulated but invisible.
    post.attachLateFxState(live.group.userData.softParticles);
    fx = live;
    return live;
  }).catch((error) => {
    fxRuntimePromise = null;
    throw error;
  });
  return fxRuntimePromise;
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

let pedestalVisual = null;
let pedestalPollToken = 0; // cancels superseded asynchronous hero builds
// switch-desync r1: convergence bookkeeping. A switch is "pending" from the
// moment its call bumps pedestalPollToken until any reveal path records it
// (pedestalShownToken catches up). The watchdog below only intervenes when
// no build or compile is pending.
let pedestalShownToken = 0;
let pedestalPendingSince = 0;
const PEDESTAL_PENDING_GRACE_MS = 8000; // > the poll's 6 s reveal deadline
function pedestalSwitchPending() {
  return pedestalPollToken !== pedestalShownToken &&
    performance.now() - pedestalPendingSince < PEDESTAL_PENDING_GRACE_MS;
}

// ---------------------------------------------------------------------------
// TANK-SWITCH PERF (switching r1): warm LRU of built pedestal visuals.
//
// Every carousel click used to run a full createTank (texture bake + geometry
// merge) and dispose the outgoing hero —
// re-selecting a tank you looked at two clicks ago paid the whole build again
// (measured 200-1200 ms to visible swap). Built heroes now PARK instead of
// disposing: hidden, dropped 200 m below the stage, and keyed by
// specId in insertion order (Map = LRU). Re-selecting restores position +
// visibility in the same frame: near-zero switch.
//
// VRAM: parked visuals hold their per-spec texture-cache refs, so the cache
// is capped at PEDESTAL_CACHE_MAX = 6 entries (perfprobe budget: a hero set
// is ~35 MB; 6 parked sets stay well inside the 512 MB scene gate, and battle
// rosters share the same refcounted entries). Eviction detaches and disposes
// the visual, releasing its refcounted shared textures.
//
// Switch latency is instrumented end-to-end: window.__SWITCH_TIMINGS rows are
// { id, ms, path } where ms is click → hero visibly on stage.
const pedestalCache = new Map(); // specId -> visual, oldest-first (LRU)
const PEDESTAL_CACHE_MAX = residentLimits.pedestalVisuals;
const PEDESTAL_PARK_Y = -200;
if (typeof window !== 'undefined') window.__SWITCH_TIMINGS = [];
// switch-desync r1: bounded event trace of the pedestal switch pipeline —
// every call, path, reveal, retire, supersede and eviction lands here so a
// live desync (stats card vs pedestal) can be root-caused from the page.
const PED_TRACE_MAX = 500;
if (typeof window !== 'undefined') window.__PED_TRACE = [];
function pedTrace(ev, data) {
  const log = (typeof window !== 'undefined' && window.__PED_TRACE) || null;
  if (!log) return;
  log.push(Object.assign({ t: Math.round(performance.now()), ev }, data));
  if (log.length > PED_TRACE_MAX) log.splice(0, log.length - PED_TRACE_MAX);
}
function pedVisState(vis) {
  if (!vis) return null;
  const r = vis.root;
  return `${vis.specId}${r.parent ? '' : '/detached'}${r.visible === false ? '/hidden' : ''}` +
    `${r.position.y < GARAGE_POS.y - 50 ? '/parked' : ''}`;
}
function recordSwitch(specId, t0, path, phases = null) {
  // every reveal path lands here — the moment a hero is ACTUALLY SHOWN.
  // __everShown feeds the LRU eviction policy (shown heroes outlive idle
  // prefetches, see touchCache).
  if (pedestalVisual) pedestalVisual.__everShown = true;
  // switch-desync r1: every recordSwitch call site is token-current (sync
  // paths run inside their own call; async polls re-check the token first),
  // so this is exactly "the latest requested switch has converged".
  pedestalShownToken = pedestalPollToken;
  // Stale-cover sweep: the hero is visibly on stage NOW — any other visual
  // still standing there is a cover whose park was deferred (see parkVisual)
  // or whose retire chain was superseded. Park them in the same beat so the
  // hand-over never shows two hulls or leaves a stale one behind.
  for (const v of pedestalCache.values()) {
    if (v !== pedestalVisual && onStage(v)) parkVisual(v);
  }
  const ms = Math.round(performance.now() - t0);
  const log = (typeof window !== 'undefined' && window.__SWITCH_TIMINGS) || null;
  if (log) log.push({ id: specId, ms, path, ...(phases || {}) });
  pedTrace('reveal', { id: specId, ms, path, pv: pedVisState(pedestalVisual) });
  if (bootComplete && game.phase === 'garage') queuePedestalTexturePrefetch();
}
function pedestalPose(vis) {
  // Center the rendered body mass, never the historical rig origin, contact
  // midpoint or complete gun/antenna silhouette. This factory-owned anchor
  // covers every fleet member, including casemates and recovered-frame
  // builders, without translating battle/armor geometry.
  if (vis.centerOnPresentationPoint) {
    vis.centerOnPresentationPoint(GARAGE_POS.x, GARAGE_POS.z);
  } else {
    vis.root.position.x = GARAGE_POS.x;
    vis.root.position.z = GARAGE_POS.z;
  }
  if (vis.seatOnFloor) {
    vis.seatOnFloor(GARAGE_POS.y + GARAGE_PODIUM_TOP_Y_M);
  } else {
    vis.root.position.y = GARAGE_POS.y + 0.35;
  }
}
function parkVisual(vis) {
  if (!vis || vis === pedestalVisual) return; // re-selected while retiring
  // switch-desync r1: NEVER strip the last visible cover off the stage while
  // the incoming hero is still hidden (chained rapid switches: B's superseded
  // build used to park A — the only visible hero — while C was still compiling,
  // leaving a bare pedestal for the whole build). The deferred park
  // is completed by the stale-cover sweep in recordSwitch the moment the
  // current hero actually shows.
  if (onStage(vis) && !onStage(pedestalVisual)) {
    pedTrace('park-deferred', { id: vis.specId, pv: pedVisState(pedestalVisual) });
    return;
  }
  pedTrace('park', { id: vis.specId });
  if (vis.setVisible) vis.setVisible(false);
  vis.root.position.y = GARAGE_POS.y + PEDESTAL_PARK_Y;
}
/** True when a visual is standing visibly on the garage stage (not hidden,
 * not parked 200 m down, not detached) — i.e. the player can see it. */
function onStage(vis) {
  if (!vis || !vis.root) return false;
  const r = vis.root;
  return !!r.parent && r.visible !== false &&
    Math.abs(r.position.x - GARAGE_POS.x) < 4 &&
    Math.abs(r.position.z - GARAGE_POS.z) < 4 &&
    r.position.y > GARAGE_POS.y - 50;
}
function evictPedestalVisual(id, vis) {
  pedestalCache.delete(id);
  pedTrace('evict', { id: vis.specId, state: pedVisState(vis) });
  scene.remove(vis.root);
  vis.dispose();
}
function trimPedestalCache(maxEntries = PEDESTAL_CACHE_MAX) {
  for (const [id, vis] of pedestalCache) {
    if (pedestalCache.size <= maxEntries) break;
    if (vis === pedestalVisual || vis.__pedestalCompiling || onStage(vis)) continue;
    evictPedestalVisual(id, vis);
  }
}
function touchCache(specId, vis) {
  pedestalCache.delete(specId);
  pedestalCache.set(specId, vis);
  // Eviction policy: idle prefetches must never push a hero the player
  // actually LOOKED AT out of the cache (real-browser session: two clicks +
  // four neighbor prefetches evicted the boot hero). Pass 1 evicts oldest
  // never-shown prefetches; pass 2 falls back to plain LRU order.
  //
  // switch-desync r1 (ROOT CAUSE of the garage tank-switch desync): touchCache
  // runs INSIDE buildPedestalVisual, BEFORE the caller assigns pedestalVisual —
  // so the just-built INCOMING hero is not covered by the pedestalVisual guard,
  // and (never shown yet) pass 1 treated it as a stale prefetch. Once six
  // already-viewed heroes filled the LRU, every new build evicted ITSELF at
  // birth: scene.remove + dispose, then the disposed visual became the
  // pedestal hero — empty/stale stage, and the prefetch loop rebuilt/evicted
  // the same neighbor forever. Two additional shields:
  //   - `vis` (the entry this call inserts) is never evictable;
  //   - a visual standing VISIBLY on the stage (the outgoing hero covering
  //     while the incoming one loads) is never evictable — evicting it left
  //     a bare pedestal for the whole incoming compile. The cache may sit
  //     one entry over budget for that window; the next touch settles it.
  for (const pass of [1, 2]) {
    for (const [id, v] of pedestalCache) {
      if (pedestalCache.size <= PEDESTAL_CACHE_MAX) return;
      if (v === pedestalVisual) continue; // never evict the live hero
      if (v.__pedestalCompiling) continue; // async program warm owns this root
      if (v === vis) continue;            // never evict the entry just inserted
      if (onStage(v)) continue;           // never strip a hero off the stage
      if (pass === 1 && v.__everShown) continue;
      evictPedestalVisual(id, v);
    }
  }
}
/**
 * Build a pedestal-grade visual for the LRU (shared camoSeed/pose contract).
 * Cold interactive switches use the AI texture tier: the complete showroom
 * geometry, markings, materials and shaders are unchanged, but the initial
 * procedural canvases are bounded to 512/256 instead of 1024/512. At normal
 * showroom projection this remains above the tank's screen-space texel count
 * and removes the only remaining hundreds-of-milliseconds switch atom.
 * The first boot hero is prebaked at preview quality below, and a selected
 * cold hero is promoted under the opaque battle loader before combat.
 */
function buildPedestalVisual(specId, parked = false) {
  // The showroom hero never enters the simulation. Avoid deriving movement
  // contact metadata from its full rendered subtree; battle/player/AI builds
  // still run that solve normally.
  const vis = createTank(specId, engineCtx, {
    camoSeed: 4200, quality: 'ai', staticPreview: true,
  });
  const pedSpec = getSpec(specId);
  vis.spec = pedSpec;
  // Every showroom vehicle follows the garage floor's world-Z tread axis.
  // Keeping this canonical also makes the podium guides continuous with the
  // approach scuffs instead of letting vehicle-specific presentation yaw
  // break the physical alignment.
  vis.root.rotation.y = GARAGE_TRACK_AXIS_YAW_RAD;
  pedestalPose(vis);
  // A cold hero can compile its exact garage material variants below the bay
  // before reveal. It remains attached/visible so compileAsync traverses it,
  // but the normal render frustum cannot see it while the outgoing tank keeps
  // covering the stage.
  if (parked) vis.root.position.y = GARAGE_POS.y + PEDESTAL_PARK_Y;
  scene.add(vis.root);
  touchCache(specId, vis);
  return vis;
}
async function warmPedestalPrograms(vis) {
  if (!vis || !vis.root) return;
  if (getDeviceTier() === 'mobile') return;
  try {
    // ANGLE's KHR_parallel_shader_compile completion query is not reliably
    // non-blocking: profiling cold switches attributed 440-510 ms to
    // getProgramParameter, whether reached by compileAsync or by an explicit
    // program.getUniforms() read. Submit the exact programs, keep the outgoing
    // hero visible for two painted frames while the driver links, and never
    // force a completion query. The first visible render remains the fallback;
    // no material, shader, or rendered detail changes.
    renderer.compile(vis.root, camera, scene);
    await nextFrame();
    await nextFrame();
  } catch (_) { /* first visible render remains the compatibility fallback */ }
}
const noteGarageActivity = () => {
  garageDressingScheduler.noteActivity();
  pedestalPreloader.invalidate();
  if (bootComplete && game.phase === 'garage') queueWorldPrefetch(pendingMapChoice);
};
for (const type of ['pointerdown', 'wheel', 'keydown', 'touchstart']) {
  window.addEventListener(type, noteGarageActivity, { capture: true, passive: true });
}
const requestQuietIdle = (fn) => {
  if (window.requestIdleCallback) return window.requestIdleCallback(fn);
  return setTimeout(fn, 800);
};

// The repair bays and component displays remain normal garage content, but
// their complete visual stream is owned by a typed quiet-window scheduler.
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
const pedestalPreloader = createGaragePedestalPreloader({
  getPhase: () => game.phase,
  isBootComplete: () => bootComplete,
  getSelectedId: () => selectedSpecId,
  getNeighborIds: () => garage?.getNeighborIds?.(2) || [],
  hasCachedVisual: (specId) => pedestalCache.has(specId),
  ensureTankBuilder,
  ensureTankBuilders,
  getSpec,
  prebakeSharedTextures,
  discardSharedTextures: discardPrebakedSharedTextures,
  createBudgetYield: frameBudgetTick,
  nextFrame,
  scheduleDelay: (callback, delayMs) => setTimeout(callback, delayMs),
  acquireBackgroundWork: (kind, stillValid) =>
    garageIdleWorkCoordinator.acquire(kind, stillValid),
  anisotropy: engineCtx.anisotropy ?? 4,
});
const queuePedestalTexturePrefetch = pedestalPreloader.queueNeighbors;
const preloadPedestalIntent = pedestalPreloader.preloadIntent;
function setPedestalTank(specId, force = false) {
  if (!force && pedestalVisual && pedestalVisual.specId === specId) {
    // switch-desync r1: a same-spec call is a no-op ONLY while the hero is
    // actually converging (its reveal poll owns the stage) or already stands
    // visible on the pedestal. A hidden/parked/detached same-spec visual
    // (superseded mid-load, evicted, poll died) must RE-RUN the pipeline —
    // the old unconditional return silently swallowed the player's last
    // click and left the stage stale or empty forever.
    if (pedestalSwitchPending() || onStage(pedestalVisual)) {
      pedTrace('same-spec-return', { id: specId, pv: pedVisState(pedestalVisual) });
      return Promise.resolve();
    }
    pedTrace('same-spec-rerun', { id: specId, pv: pedVisState(pedestalVisual) });
  }
  pedestalPollToken++;
  pedestalPreloader.invalidate();
  pedestalPendingSince = performance.now();
  pedTrace('call', { id: specId, tok: pedestalPollToken, pv: pedVisState(pedestalVisual) });
  const t0 = performance.now();
  // The outgoing hero stays on stage while the incoming procedural texture
  // bake advances between frames, avoiding a bare-pedestal flash.
  const prev = pedestalVisual;
  let prevRetired = false;
  const retirePrev = () => {
    if (prevRetired || !prev) return;
    prevRetired = true;
    parkVisual(prev);
  };
  // WARM PATH: parked hero — restore pose + visibility, done this frame.
  let cached = pedestalCache.get(specId);
  if (cached && !cached.root.parent) {
    // evicted/disposed while it was (or was becoming) the hero — a detached
    // root can never be re-shown; drop the corpse and rebuild from scratch.
    pedTrace('purge-detached', { id: specId });
    pedestalCache.delete(specId);
    cached = undefined;
  }
  if (cached) {
    const cachedToken = pedestalPollToken;
    const revealCached = () => {
      if (cachedToken !== pedestalPollToken) return;
      pedestalVisual = cached;
      touchCache(specId, cached);
      pedestalPose(cached);
      if (cached.setVisible) cached.setVisible(true);
      retirePrev();
      recordSwitch(specId, t0, 'cached');
    };
    if (cached.__pedestalCompileP) {
      return cached.__pedestalCompileP.then(revealCached);
    }
    revealCached();
    return Promise.resolve();
  }
  // perf-r5 (owner: "switching between tanks laggy"): a COLD cache build
  // sync-baked the family canvases inside createTank — a 150-900 ms freeze on
  // the click. Prebake CHUNKED first (painted frame between painter stages;
  // instant no-op when the cache is warm), then build against the warm
  // cache. The outgoing hero keeps covering the stage through the async gap
  // (pedestalSwitchPending holds the watchdog off for 8 s) and the token
  // discipline below discards superseded asynchronous work.
  const buildToken = pedestalPollToken;
  let phaseAt = performance.now();
  const phases = { prebakeMs: 0, buildMs: 0, compileMs: 0 };
  return Promise.all([
    ensureTankBuilder(specId),
    prebakeSharedTextures(
      getSpec(specId), engineCtx.anisotropy ?? 4, 'ai', frameBudgetTick(6),
    ).catch(() => { /* buildPedestalVisual can still acquire synchronously */ }),
  ])
    .then(async () => {
      phases.prebakeMs = Math.round(performance.now() - phaseAt);
      if (buildToken !== pedestalPollToken) {
        pedTrace('prebake-stale', { id: specId, tok: buildToken });
        retirePrev();
        return;
      }
      phaseAt = performance.now();
      const incoming = buildPedestalVisual(specId, true);
      phases.buildMs = Math.round(performance.now() - phaseAt);
      phases.decorMs = Math.round(incoming.root.userData.decorBuildMs || 0);
      incoming.__pedestalCompiling = true;
      // Boot's following `post` stage compiles the complete scene before the
      // first present, so only interactive cold switches need this dedicated
      // off-stage warm.
      phaseAt = performance.now();
      const compileWork = bootComplete ? warmPedestalPrograms(incoming) : Promise.resolve();
      incoming.__pedestalCompileP = compileWork.finally(() => {
        incoming.__pedestalCompiling = false;
        incoming.__pedestalCompileP = null;
        // Settle any temporary over-budget allowance made while this root was
        // protected from eviction.
        if (pedestalCache.get(specId) === incoming) touchCache(specId, incoming);
      });
      await incoming.__pedestalCompileP;
      phases.compileMs = Math.round(performance.now() - phaseAt);
      if (buildToken !== pedestalPollToken) {
        pedTrace('compile-stale', { id: specId, tok: buildToken });
        return;
      }
      pedestalVisual = incoming;
      pedestalPose(incoming);
      if (incoming.setVisible) incoming.setVisible(true);
      retirePrev();
      recordSwitch(specId, t0, 'procedural', phases);
    });
}

/**
 * Reuse the just-fielded player visual as the garage hero. Battle actors and
 * pedestal previews share the same first-party geometry/material contract;
 * rebuilding the selected tank on every return added a 350-700 ms task even
 * though the complete visual was already resident one frame earlier.
 * setupBattle will pose this same entity back onto the battlefield on the
 * next deployment. A separately cached garage hero still wins when present.
 */
function adoptBattlePlayerAsPedestal(specId) {
  const incoming = game.player?.visual;
  if (!incoming || incoming.specId !== specId) return false;
  const cached = pedestalCache.get(specId);
  // A rematch reuses the same adopted visual, which is naturally still in
  // the cache and attached to the scene. Only prefer an attached cache entry
  // when it is a different, dedicated garage visual.
  if (cached?.root?.parent && cached !== incoming) return false;
  const outgoing = pedestalVisual;
  incoming.spec = getSpec(specId);
  incoming.root.rotation.y =
    (162 + (incoming.spec?.visual?.garageYawDeg || 0)) * DEG;
  if (!incoming.root.parent) scene.add(incoming.root);
  pedestalVisual = incoming;
  pedestalPose(incoming);
  incoming.setVisible?.(true);
  incoming.__everShown = true;
  touchCache(specId, incoming);
  if (outgoing && outgoing !== incoming) parkVisual(outgoing);
  pedestalPollToken++;
  pedestalShownToken = pedestalPollToken;
  pedTrace('adopt-battle', { id: specId, pv: pedVisState(incoming) });
  return true;
}

/**
 * Use the already-resident showroom hero as the selected player's battle
 * visual. The model, paint, and articulation contract are identical; only
 * the simulation-only terrain-contact receipt was deferred by staticPreview.
 * This removes a second full procedural build from first battle entry.
 */
function lendPedestalToBattle(specId) {
  const visual = pedestalVisual;
  const ent = game.tankById.get(specId);
  if (!visual || visual.specId !== specId || !ent) return false;
  if (visual.__pedestalCompiling || (ent.visual && ent.visual !== visual)) return false;
  try {
    visual.prepareForSimulation?.();
  } catch (_) {
    return false;
  }
  ent.visual = visual;
  visual.setGroundSampler?.(groundSampler);
  pedTrace('lend-battle', { id: specId });
  return true;
}
// switch-desync r1: CONVERGENCE WATCHDOG — the last line of defense. Whatever
// interleaving the async seams produce (superseded builds, late compiles,
// evictions, dead timers), the invariant is: in the garage, the SELECTED id
// ends up visible on the pedestal. The watchdog re-runs the pipeline whenever
// the stage disagrees with the selection AND no switch is legitimately in
// flight (pedestalSwitchPending covers the full build window). Cheap: two
// field reads per tick when healthy.
setInterval(() => {
  if (!bootComplete || game.phase !== 'garage') return;
  const want = selectedSpecId;
  if (!want || pedestalSwitchPending()) return;
  if (pedestalVisual && pedestalVisual.specId === want && onStage(pedestalVisual)) return;
  pedTrace('watchdog-resync', { want, pv: pedVisState(pedestalVisual) });
  setPedestalTank(want, true);
}, 500);
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
  await Promise.all([
    bootSelectedBuilderP,
    prebakeSharedTextures(getSpec(selectedSpecId), engineCtx.anisotropy ?? 4,
      'preview', bootVehicleYield),
  ]);
  await setPedestalTank(selectedSpecId);
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
  if (pedestalVisual) {
    pedestalPose(pedestalVisual);
  }
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

function minimapAssetUrl(mapId) {
  return `${import.meta.env.BASE_URL || '/'}minimaps/${encodeURIComponent(mapId)}.webp`;
}

/**
 * Upgrade the immediately available procedural tactical map with the exact
 * supersampled background baked by tools/bake-minimap-assets.mjs. Loading one
 * ~30-85 KB WebP is asynchronous and cacheable; production never traverses the
 * battlefield, compiles shaders, or reads GPU pixels merely to draw the HUD.
 */
function queueBakedWorldMinimap(next = world) {
  if (!hud || !next || world !== next || minimapAssetMapId === next.mapId) return null;
  if (minimapAssetPending?.world === next) return minimapAssetPending.promise;
  const generation = ++minimapAssetGeneration;
  const trace = { mapId: next.mapId, state: 'queued', startedAt: performance.now() };
  if (typeof window !== 'undefined') window.__MINIMAP_LOAD = trace;
  const promise = (async () => {
    if (generation !== minimapAssetGeneration || world !== next
        || worldServicesMapId !== next.mapId) return false;
    trace.state = 'loading';
    const installed = await hud.buildMinimapFromAsset(
      next.heightField, minimapAssetUrl(next.mapId),
    );
    if (!installed || generation !== minimapAssetGeneration || world !== next
        || worldServicesMapId !== next.mapId) {
      trace.state = 'stale';
      return false;
    }
    minimapAssetMapId = next.mapId;
    trace.state = 'ready';
    trace.totalMs = Math.round(performance.now() - trace.startedAt);
    return true;
  })().catch((error) => {
    trace.state = 'fallback';
    trace.error = String(error);
    if (generation === minimapAssetGeneration && world === next
        && worldServicesMapId === next.mapId) {
      buildWorldMinimap(next, false);
    }
    return false;
  }).finally(() => {
    if (minimapAssetPending?.generation === generation) minimapAssetPending = null;
  });
  minimapAssetPending = { world: next, generation, promise };
  return promise;
}

function prepareWorldServices(next = world) {
  if (!next || world !== next) return;
  // Background map intent is garage-safe. The solo collider is created when
  // the battle runtime arrives; private/ranked presentation does not use it.
  collider = isSoloBattleRuntimeReady() ? createCollider(game, next) : null;
  if (worldServicesMapId === next.mapId) {
    placeGarage();
    queueBakedWorldMinimap(next);
    return;
  }
  placeGarage();
  worldServicesMapId = next.mapId;
  queueBakedWorldMinimap(next);
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
    // same full-resolution procedural cartography in queueBakedWorldMinimap.
    worldServicesMapId = next.mapId;
  }
  queueBakedWorldMinimap(next);
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
      for (const _ of linkerBreathingSlices(24)) await nextFrame();
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
  buildShellCards(game.player.spec);
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
  if (world && worldServicesMapId === world.mapId) queueBakedWorldMinimap(world);
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
      onNetworkStart: beginNetworkBattle,
      onRankedStart: beginRankedBattle,
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
    battleIntentMapPlan = null;
    selectedSpecId = specId;
    rememberSpecId(specId);
    setPedestalTank(specId);
    applyCamoPatternsChunked({ priorityIds: [specId], onlySpecIds: [specId] });
    networkRoomCoordinator?.syncVehicle(specId);
    networkRoomCoordinator?.syncPendingLobbySelection();
  },
  onBattle: (specId, mapId) => beginBattleEntry(specId, mapId), // loading screen owns entry
  onPlayRequest: (request) => openPlayMenu(request).catch((error) => {
    console.error('[play-menu] failed to open', error);
  }),
  onPlayModeIntent: preloadPlayMode,
  onBattleIntent: preloadBattleIntent,
  onTankIntent: preloadPedestalIntent,
  onStudioIntent: preloadStudioIntent,
  // MAP-CONFIG WIRING: battlefield picker cards (4 maps + Random)
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
    battleIntentMapPlan = null;
    pendingMapChoice = mapId;
    if (mapId !== 'random') pendingMapId = mapId;
    cancelBackgroundWorldBuildsExcept(mapId === 'random' ? null : mapId);
    queueWorldPrefetch(mapId);
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
const battleClientAccess = createBattleClientAccess(() => ({
  getGame: () => game,
  getRig: () => rig,
  worldRaycast,
  targetVisible: mobileAutoAimVisible,
  getShellCards: () => shellCards,
  computeDispersion: battleClientAccess.computeDispersionRadM,
}));
const {
  aimController,
  computeDispersionRadM,
  shotRecoilScale,
  tankPoseFromState,
  traceTank,
  selectShell,
  resolveShellHit,
  createCombatState,
  repairAllModules,
  startMagazineReload,
  createShell,
  activateSpecialAction,
  specialActionLocksShell,
  isPostwarVehicleEra,
  hasConsumableRule,
  cooldownRemaining,
  resetConsumableCooldowns,
  startConsumableCooldown,
  advancePreBattleCountdown,
  resolveVisiblePreBattleSeconds,
  advanceTankPresentationPose,
  createTankPresentationPose,
  resetTankPresentationPose,
  sampleTankPresentationPose,
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
const showroom = (() => {
  const ctl = createShowroomOrbit(camera, rig, {
    getSubject: () => (pedestalVisual ? pedestalVisual.root : null),
    getStageRect: () => (garage.getStageRect ? garage.getStageRect() : null),
    // HERO POSE (garage_ui: front+side three-quarter). The pedestal hull is
    // aligned to the floor's world-Z tread axis. Park the eye 45° off the
    // nose on the vehicle's RIGHT: classic WoT front-right 3/4 —
    // gun sweeps toward camera-left, front plate and one flank both read.
    heroYawRad: GARAGE_TRACK_AXIS_YAW_RAD + 45 * DEG,
    // elevation keeps the original garageCameraPose() composition (~6.3°)
    heroPitchRad: Math.atan2(1.2, Math.hypot(7.4, 8.0)),
    // FIXED FRAMING (garage r9): pose against the stage center + a canonical
    // hero box instead of the selected hull's own measured box, so switching
    // tanks never slides the camera. Drag-orbit / zoom / spring-back all keep
    // working — they just pivot around this fixed anchor.
    fixedFrame: () => ({
      x: GARAGE_POS.x, y: GARAGE_POS.y + GARAGE_LOOK_Y, z: GARAGE_POS.z,
      hw: GARAGE_FRAME_BOX.hw, hh: GARAGE_FRAME_BOX.hh, hd: GARAGE_FRAME_BOX.hd,
    }),
    floorY: () => GARAGE_POS.y,
  });
  let on = false;
  let dragPtr = -1;
  const el = renderer.domElement;
  el.addEventListener('pointerdown', (e) => {
    if (!on || e.button !== 0) return;
    dragPtr = e.pointerId;
    try { el.setPointerCapture(e.pointerId); } catch (_) { /* embedded panes */ }
    ctl.beginDrag();
  });
  el.addEventListener('pointermove', (e) => {
    if (on && e.pointerId === dragPtr) ctl.drag(e.movementX || 0, e.movementY || 0);
  });
  const endDrag = (e) => { if (e.pointerId === dragPtr) { dragPtr = -1; ctl.endDrag(); } };
  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag);
  el.addEventListener('wheel', (e) => {
    if (!on) return;
    ctl.wheel(e.deltaY < 0 ? 1 : -1);
    e.preventDefault();
  }, { passive: false });
  return {
    // reset() fails harmlessly while the pedestal is still empty — update()
    // re-measures a few times a second and takes over once a hero exists.
    start() { on = true; ctl.start(); },
    stop() { on = false; dragPtr = -1; ctl.stop(); },
    reset() { return ctl.reset(); },
    update(dt) { if (on) ctl.update(dt); },
    get active() { return on && ctl.active; },
    debugState: () => ctl.debugState(),
  };
})();

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
const dormantSpectate = {
  active: false, targetId: null,
  startObserver: () => false, stop() {},
};
let killcam = {
  fxTimeScale: 1, lastBeginWallMs: 0, spectate: dormantSpectate,
  isActive: () => false, cancel() {}, update() {},
  playForResult: () => false, stageXrayShot() {},
};
let killcamModulePromise = null;
let killcamRuntimePromise = null;
function preloadKillcamModule() {
  if (!killcamModulePromise) {
    killcamModulePromise = import('./game/killcam.js').catch((error) => {
      killcamModulePromise = null;
      throw error;
    });
  }
  return killcamModulePromise;
}
function ensureKillcamRuntime() {
  if (killcamRuntimePromise) return killcamRuntimePromise;
  killcamRuntimePromise = preloadKillcamModule().then(({ createKillCam }) => {
    const live = createKillCam({
      scene, camera, rig, heightField: hfProxy, getPlayer: () => game.player,
      getEntity: (id) => game.tankById.get(id),
      getWorld: () => world, // r6: flight-cam LOS solve (foliage/terrain/props)
      // Replay impact uses the real pooled destruction effects.
      getFx: () => fx,
    });
    live.bindBus(bus);
    killcam = live;
    game.killcam = live;
    return live;
  }).catch((error) => {
    killcamRuntimePromise = null;
    throw error;
  });
  return killcamRuntimePromise;
}
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
  if (target && target.visual && ev.normal) {
    const pen = ev.kind === 'pen' || ev.kind === 'he_pen';
    if (target.visual.hitFlinch) {
      target.visual.hitFlinch(
        ev.normal[0], ev.normal[2],
        ((ev.caliberMm || 90) / 100) * (pen ? 1 : 0.55),
        target.state ? target.state.yaw : undefined,
      );
    }
    if (pen && ev.pos && fx?.armorScar) {
      _v1.set(ev.pos[0], ev.pos[1], ev.pos[2]);
      _v2.set(ev.normal[0], ev.normal[1], ev.normal[2]);
      fx.armorScar(target.visual, _v1, _v2, ev.caliberMm || 90);
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

// ---------------------------------------------------------------------------
// controls_gunnery r6: PLAYER SHELL TERMINAL TELEMETRY. Every player shell's
// terminal event is recorded with the intended target and the miss distance
// to that target's hull center at the terminal instant, so whiffs are
// attributable (lead error / drop / blocked path / collider gap) instead of
// vanishing. Ring buffer on __DEBUG.playerShellLog; consumed by the
// tools/gunnery_gate.mjs hull-hit-rate gate and free to read in live debug.
// ---------------------------------------------------------------------------
const playerShellLog = [];
const _tele = new THREE.Vector3();
function teleTargetFor(muzzle, dir) {
  // intended target: the live enemy whose hull center passes nearest the
  // fire ray (drive tests also pin their target — prefer it when live)
  const debugAimTargetId = driveTestController.aimTargetId;
  const pinned = debugAimTargetId ? game.tankById.get(debugAimTargetId) : null;
  if (pinned && pinned.state && pinned.combat && !pinned.combat.destroyed) return pinned;
  let best = null;
  let bestLat = 40; // ignore shells not aimed near any tank
  for (const ent of game.tanks) {
    if (ent.isPlayer || ent.team !== 'enemy' || !ent.state || !ent.combat || ent.combat.destroyed) continue;
    _tele.copy(ent.state.pos);
    _tele.y += ent.spec.dims.heightM * 0.5;
    _tele.x -= muzzle[0]; _tele.y -= muzzle[1]; _tele.z -= muzzle[2];
    const proj = _tele.x * dir[0] + _tele.y * dir[1] + _tele.z * dir[2];
    if (proj < 0) continue;
    const lat = Math.sqrt(Math.max(0, _tele.lengthSq() - proj * proj));
    if (lat < bestLat) { bestLat = lat; best = ent; }
  }
  return best;
}
function teleMissM(rec, pos) {
  const tgt = rec.targetId ? game.tankById.get(rec.targetId) : null;
  if (!tgt || !tgt.state || !pos) return null;
  const cy = tgt.state.pos.y + tgt.spec.dims.heightM * 0.5;
  return Math.round(Math.hypot(pos[0] - tgt.state.pos.x, pos[1] - cy, pos[2] - tgt.state.pos.z) * 100) / 100;
}
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
  const tgt = teleTargetFor(ev.muzzlePos, ev.dir);
  playerShellLog.push({
    shellId: ev.shellId, t: Math.round(game.timeS * 100) / 100,
    targetId: tgt ? tgt.id : null,
    targetDistM: tgt ? Math.round(tgt.state.pos.distanceTo(game.player.state.pos)) : null,
    targetSpeed: tgt ? Math.round((tgt.state.speed || 0) * 10) / 10 : null,
    blockedDistM: frameInfo.aim.blockedDistM ? Math.round(frameInfo.aim.blockedDistM) : null,
    terminal: null, hitKind: null, damage: 0, missM: null,
  });
  if (playerShellLog.length > 64) playerShellLog.shift();
});
// controls_gunnery r3 CRITICAL: shell ids RESET per battle — a forward find()
// resolved to the OLDEST record, so battle 5's hits overwrote battle 1's rows
// (the "hits on tanks 423 m from the intended target" phenomenon was entirely
// this telemetry corruption). Resolve the NEWEST record for an id.
function shellRecFor(shellId) {
  for (let i = playerShellLog.length - 1; i >= 0; i--) {
    if (playerShellLog[i].shellId === shellId) return playerShellLog[i];
  }
  return null;
}
bus.on('shell:hit', (ev) => {
  if (!game.player || ev.attackerId !== game.player.id) return;
  const rec = shellRecFor(ev.shellId);
  if (!rec) return;
  rec.terminal = 'tank';
  rec.hitTankId = ev.targetId;
  rec.hitKind = ev.kind;
  rec.damage = Math.round(ev.damage || 0);
  rec.missM = teleMissM(rec, ev.pos);
});
bus.on('shell:expired', (ev) => {
  const rec = shellRecFor(ev.shellId);
  if (!rec || rec.terminal) return;
  rec.terminal = ev.hitTerrain ? 'terrain' : 'air';
  rec.missM = teleMissM(rec, ev.pos);
});
// gameplay_feel r6 (crushable vegetation): state.js emits prop:crushed when a
// moving hull overruns a tagged trunk — splinter burst at the break point
// (the same fx the pole hinge-topple uses; the fall anim itself runs in
// vegetation.js via world.crushObstacle).
bus.on('prop:crushed', (ev) => {
  if (!fx) return;
  _v1.set(ev.pos[0], ev.pos[1], ev.pos[2]);
  _fwd.set(ev.dir[0], 0, ev.dir[2]);
  fx.propCrush(_v1, _fwd, ev.h);
});
// DESTRUCTIBLES r1: every destructible break (ram, shell hit, HE splash or
// chained drum blast) reports through the destructibles.js sink — forwarded
// onto the bus as the AUDIO seam ('prop:destroyed' {kind, pos, cause}).
setDestroyedEventSink((ev) => bus.emit('prop:destroyed', ev));
// Bot-vs-player pressure telemetry (same round, minor #4): per-battle
// counters for enemy shells whose fire ray passes near the player (aimed at
// us) vs those that connect, so return-fire consistency is measurable per
// roster instead of anecdotal. Reset on battle start; __DEBUG.botPressure.
const botPressure = { enemyShells: 0, aimedAtPlayer: 0, hitsOnPlayer: 0, dmgOnPlayer: 0 };
bus.on('phase:change', (ev) => {
  if (ev.phase === 'battle') {
    botPressure.enemyShells = 0; botPressure.aimedAtPlayer = 0;
    botPressure.hitsOnPlayer = 0; botPressure.dmgOnPlayer = 0;
    // A phone cannot afford showroom convenience copies alongside a complete
    // battle. Keep only the selected hero; it shares paint with the player
    // and gives the garage an immediate return without retaining old picks.
    if (getDeviceTier() === 'mobile') trimPedestalCache(1);
  }
});
bus.on('shell:fired', (ev) => {
  if (ev.isPlayer || !game.player || !game.player.state) return;
  botPressure.enemyShells += 1;
  const p = game.player.state.pos;
  const cy = p.y + game.player.spec.dims.heightM * 0.5;
  const rx = p.x - ev.muzzlePos[0];
  const ry = cy - ev.muzzlePos[1];
  const rz = p.z - ev.muzzlePos[2];
  const proj = rx * ev.dir[0] + ry * ev.dir[1] + rz * ev.dir[2];
  if (proj <= 0) return;
  const lat2 = rx * rx + ry * ry + rz * rz - proj * proj;
  if (lat2 < 36) botPressure.aimedAtPlayer += 1; // within 6 m of hull center
});
bus.on('shell:hit', (ev) => {
  if (game.player && ev.targetId === game.player.id) {
    botPressure.hitsOnPlayer += 1;
    botPressure.dmgOnPlayer += ev.damage || 0;
  }
});

sky.applyFog(scene);
// High-zoom de-fog (WoT sniper behavior): remember the base density so the
// render loop can scale it by FOV without mutating the sky's baseline.
let baseFogDensity = scene.fog.density; // updated on map switch (sky preset)
const post = createPost(renderer, scene, camera);
// Renderer-lifetime warm state is declared before context recovery is armed:
// a mobile device can lose and restore WebGL while the async boot pipeline is
// still running, before the later warm-owner functions are reached.
let combatOpeningWarmed = false;
let combatPipelineWarmed = false;
let _openingWarmGen = null;
let _rareWarmGen = null;
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
    resetCombatRoundWarmState();
    if (getDeviceTier() === 'mobile') {
      setMobilePresetName('mobile-low');
      trimPedestalCache(1);
      enforceWorldCacheBudget();
    }
    await nextFrame();
    applyViewportSize();
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
let wheelStep = 0;
const _mouse = { x: 0, y: 0 };
const _touchMove = { x: 0, y: 0 };

const input = createInput({ lockElement: renderer.domElement });
const armorAimOverlay = createArmorAimOverlayAccess();
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

// Accumulate wheel notches (clamped ±3) instead of a single ±1 latch: two
// physical notches inside one render frame used to collapse to ONE zoom step
// (WoT steps once per notch; at 30 fps fast flicks felt like dropped zooms).
// The rig consumes the whole accumulated value each update (cameraRig.js).
input.onAction('zoomIn', () => { if (game.phase === 'battle' && !settings.isOpen()) wheelStep = Math.min(wheelStep + 1, 3); });
input.onAction('zoomOut', () => { if (game.phase === 'battle' && !settings.isOpen()) wheelStep = Math.max(wheelStep - 1, -3); });
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

// Rebindable shell slots — the ONLY hotkey path (HUD renders from ui:shellSelect).
for (let slot = 0; slot < 3; slot++) {
  input.onAction(`shell${slot + 1}`, () => {
    if (game.phase !== 'battle' || settings.isOpen()) return;
    bus.emit('ui:shellSelect', { slot });
    bus.emit('ui:click', {});
  });
}

input.onAction('reloadMagazine', () => {
  if (game.phase !== 'battle' || settings.isOpen()) return;
  bus.emit('ui:magazineReload', {});
});

input.onAction('specialAction', () => {
  if (game.phase !== 'battle' || settings.isOpen()) return;
  bus.emit('ui:specialAction', {});
});

// Consumables — rebindable actions (Digit4/5/6 + pad X/Y/B default; HUD tray
// clickable, which emits the same 'ui:consumable'). 0 = Repair Kit (all
// damaged modules to full), 1 = First Aid (revive crew), 2 = Fire
// Extinguisher. Kits have infinite uses for the whole battle and individual
// cooldowns (repair 35 s, first aid 45 s, extinguisher 25 s). A no-op press
// never starts a cooldown.
const consumableReadyAt = [0, 0, 0];
for (let slot = 0; slot < 3; slot++) {
  input.onAction(`consumable${slot + 1}`, () => {
    if (game.phase !== 'battle' || settings.isOpen()) return;
    bus.emit('ui:consumable', { slot });
  });
}
bus.on('ui:consumable', ({ slot }) => {
  const p = game.player;
  if (game.phase !== 'battle' || settings.isOpen() || !p || !p.combat || p.combat.destroyed) return;
  if (!hasConsumableRule(slot)) return;
  if (networkMatch) {
    networkFramePump.queueConsumable(slot);
    bus.emit('ui:click', {});
    return;
  }
  const remainingS = cooldownRemaining(game.timeS, consumableReadyAt[slot]);
  if (remainingS > 0) {
    bus.emit('ui:consumableDenied', { slot, reason: 'COOLDOWN', remainingS });
    return;
  }
  const c = p.combat;
  let ok = false;
  if (slot === 0) {
    // Module state transitions live in sim/damage.js (module_hitbox r1).
    for (const name of repairAllModules(c)) {
      bus.emit('module:state', { id: p.id, module: name, state: 'ok' });
      ok = true;
    }
  } else if (slot === 1) {
    for (const name of Object.keys(c.crew)) {
      if (c.crew[name] === false) { c.crew[name] = true; ok = true; }
    }
  } else if (slot === 2 && c.fire.burning) {
    c.fire.burning = false;
    c.fire.ticksLeft = 0;
    c.fire.tickTimer = 0;
    bus.emit('tank:fire', { id: p.id, burning: false });
    ok = true;
  }
  if (!ok) { bus.emit('ui:consumableDenied', { slot, reason: 'NOTHING' }); return; }
  const cooldown = startConsumableCooldown(consumableReadyAt, slot, game.timeS);
  bus.emit('ui:consumableUsed', { slot, ...cooldown });
  bus.emit('ui:click', {});
});
input.onAction('minimapZoom', () => {
  if (game.phase === 'battle') bus.emit('ui:minimapZoom', {});
});
// SHOT-INFO: rebindable toggle for the shot-info log (src/ui/shotInfo.js).
input.onAction('shotLog', () => {
  if (game.phase === 'battle') bus.emit('ui:shotLog', {});
});
// FEEL r12: perf overlay toggle works in every phase (garage included)
input.onAction('perfHud', () => { if (diagnosticsRequested) perfHud.toggle(); });

bus.on('ui:shellSelect', ({ slot }) => {
  if (game.player && game.player.combat && !game.player.combat.destroyed) {
    if (specialActionLocksShell(game.player)) return;
    if (slot === game.player.combat.shellSlot && game.player.combat.magazine) {
      bus.emit('ui:magazineReload', {});
      return;
    }
    // spec: with per-shell reloads the restart prices the INCOMING shell
    // (autocannon belt 0.4 s vs. ATGM rail 14+ s on the same vehicle).
    selectShell(game.player.combat, slot, game.player.spec);
    game.player.input.shellSlot = slot;
  }
});

bus.on('ui:magazineReload', () => {
  const p = game.player;
  if (game.phase !== 'battle' || settings.isOpen() || !p?.combat || p.combat.destroyed) return;
  if (networkMatch) {
    networkFramePump.queueAction('reloadMagazine');
  } else {
    startMagazineReload(p.combat, p.spec);
  }
  bus.emit('ui:click', {});
});

bus.on('ui:specialAction', () => {
  const p = game.player;
  if (game.phase !== 'battle' || settings.isOpen() || !p?.combat || p.combat.destroyed) return;
  if (networkMatch) {
    networkFramePump.queueAction('specialAction');
  } else {
    const result = activateSpecialAction(p);
    bus.emit(result.ok ? 'ui:specialActionResult' : 'ui:specialActionDenied', result);
  }
  bus.emit('ui:click', {});
});

// ---------------------------------------------------------------------------
// Game flow
// ---------------------------------------------------------------------------
// Per-battle loadout (rounds carried per shell type) — the HUD tray renders
// card.count live, and firing is gated on the slot having rounds left.
// A shell carrying its own `count` overrides the type table: IFV autocannon
// belts hold hundreds of rounds against a handful of ATGMs (per-shell
// reloads, sim/damage.js startReload), so type-level counts can't fit both.
const SHELL_LOADOUT = { AP: 24, APCR: 20, APFSDS: 24, HEAT: 16, HE: 12 };
let shellCards = [];
function buildShellCards(spec) {
  shellCards = spec.gun.shells.map((sh) => ({
    name: sh.name, type: sh.type, dmg: sh.dmg, penLabel: `${Math.round(sh.pen100Mm)} mm`,
    count: sh.count != null ? sh.count
      : (SHELL_LOADOUT[sh.type] != null ? SHELL_LOADOUT[sh.type] : 20),
  }));
}
// Real ammo depletion: the player's fired shells consume the active slot.
bus.on('shell:fired', (p) => {
  if (!p.isPlayer || !game.player || !game.player.combat) return;
  const card = shellCards[game.player.combat.shellSlot];
  if (card && card.count > 0) card.count -= 1;
});

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
  const plannedMap = requestedMapId === 'random'
    && battleIntentMapPlan
    && battleIntentMapPlan.specId === specId
    && battleIntentMapPlan.battleCount === game.battleCount
    ? battleIntentMapPlan.resolved : null;
  const resolved = plannedMap || resolveMapId(requestedMapId);
  battleIntentMapPlan = null;
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

  // The combat HUD, damage schematic, and exact top-mask rig are battle-only.
  // Start their retryable chunk at the first covered frame; world transfer
  // has already begun on Battle intent, and no hidden garage boot pays for it.
  battleLoad.progress(0.01, 'Loading combat interface');
  await Promise.all([
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
  const staleIntentTextureP = cancelBattleIntentTextureWarm();
  const rosterTextureP = (async () => {
    await staleIntentTextureP;
    setCamoBiome(resolved);
    clearCamoOverrides();
    for (const id of plannedAutoCamoIds) setCamoOverride(id, 'auto');
    await applyCamoPatternsChunked({
      priorityIds: [specId], onlySpecIds: plannedRoster,
    });
    await preloadBattleRosterTextures(specId, plannedRoster, loadYield);
  })();
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
    const receipt = await stageRootTextureUploads(live.group, loadYield);
    live.group.userData.battleTexturesStaged = true;
    blt.fxTextureUpload = receipt;
    return receipt;
  });
  await Promise.all([
    ensureWorld(resolved,
      (f, label) => battleLoad.progress(0.02 + f * 0.53, label),
      { precompile: false, services: false }),
    ensureTankBuilders([...plannedRoster, ...plannedWorldVehicles]),
    preloadSoloBattleRuntime(),
    preloadBattleClientRuntime(),
    battleWarm.preload(),
    audio.warmBattleEvents(),
    fxTextureP,
    ensureKillcamRuntime(),
    rosterTextureP,
  ]);
  blt.world = (typeof window !== 'undefined' && window.__WORLD_LOAD) || null;
  battleLoad.progress(0.55, 'Uploading battlefield textures');
  blt.worldTextureUpload = await stageRootTextureUploads(world.group, loadYield);
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
  if (game.player?.visual && game.player.visual === pedestalVisual) {
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
  await stageBattleVisualReveal(game.player, loadYield);
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
  await streamBattleVisuals(openingVisual, loadYield, (fraction) => {
    battleLoad.progress(0.58 + fraction * 0.30, 'Painting vehicles');
  });
  bltStage('bake');

  // Complete the exact roster visuals and opening-critical caches while the
  // opaque transition owns the screen. Rare variants continue in bounded
  // slices during the frozen deployment countdown; rollout cannot release
  // until that queue has produced its receipt.
  battleLoad.progress(0.90, 'Preparing deployment');
  const entryCamoSweep = camoSweepP;
  let entryRevealPrimed = false;
  const finishEntryWarm = async () => {
    const warmGeneration = ++battleWarmGeneration;
    battleWarmPending = true;
    await (async () => {
      const countdownWarmStartedAt = performance.now();
      const trace = { done: false, phase: 'transition', stages: {} };
      if (typeof window !== 'undefined') window.__BATTLE_COUNTDOWN_WARM = trace;
      devTrace?.mark('battle:entry-warm-start', {});
      let markedAt = performance.now();
      const mark = (name) => {
        const now = performance.now();
        trace.stages[name] = Math.round(now - markedAt);
        markedAt = now;
      };
      await entryCamoSweep;
      if (warmGeneration !== battleWarmGeneration) return;
      mark('camo');
      battleLoad.progress(0.91, 'Finishing camouflage');
      // The branded transition is opaque but still animated. A 24 ms slice
      // preserves regular progress paints while avoiding the old interactive
      // 8 ms duty cycle, which added several seconds of pure rAF waiting once
      // this work moved out of the visible countdown.
      const coveredYield = createOpaqueLoadingYielder(18, 80);
      await streamBattleVisuals((ent) => ent.team === 'player', coveredYield, (fraction) => {
        battleLoad.progress(0.91 + fraction * 0.02, 'Preparing allied vehicles');
      });
      if (warmGeneration !== battleWarmGeneration) return;
      mark('allyVisuals');
      // Build opponents under the still-opaque transition, but keep every
      // root detached after its scoped compile. Deferring this cohort until
      // the visible countdown let ANGLE carry its link queue into a later rAF
      // (240-525 ms visible freezes). The covered deployment frame below now
      // absorbs that completion before the loader can reveal a pixel.
      battleLoad.progress(0.94, 'Preparing opposing vehicles');
      const enemyProgramBaseline = snapshotRendererPrograms(renderer);
      await streamBattleVisuals(
        (ent) => ent.team === 'enemy', coveredYield, (fraction) => {
          battleLoad.progress(0.94 + fraction * 0.02, 'Preparing opposing vehicles');
        }, true,
      );
      trace.enemyProgramUniformWarm = await warmNewRendererProgramUniforms(
        renderer,
        enemyProgramBaseline,
        coveredYield,
      );
      if (warmGeneration !== battleWarmGeneration) return;
      mark('enemyVisuals');
      battleLoad.progress(0.965, 'Warming suspension terrain');
      await battleWarm.warmBattleTerrainTiles({
        game, world, yieldForBudget: coveredYield,
      });
      if (warmGeneration !== battleWarmGeneration) return;
      mark('terrainGrid');
      // Render exactly the deployment camera once while the roster screen is
      // still opaque. This single real frame compiles the visible world,
      // roster, CSM and post paths that the countdown will actually use. The
      // old opening warm exhaustively traversed every off-camera node and all
      // shadow variants before revealing anything, then rendered this same
      // frame anyway. Re-cover rendering after the receipt so later budget
      // yields do not redraw the whole battlefield behind the loader.
      battleLoad.progress(0.968, 'Priming deployment view');
      // Resume the normal-quality renderer before this first real battle
      // frame. The previous path primed once while adaptive accounting was
      // suspended, resumed it later, then rendered the identical view again.
      // One final-quality frame is sufficient and remains fully covered.
      post.setAdaptiveSuspended(false);
      mark('restoreRenderer');
      prepareBattleRevealCamera();
      // Submit the exact visible deployment programs before the first scene
      // render, then give ANGLE two painted loader frames to link them in the
      // background. Do not query completion: KHR_parallel_shader_compile is
      // unreliable on affected Metal drivers and can itself block for many
      // seconds. The first covered battle frame still renders the identical
      // final-quality CSM/post scene; this only moves driver submission ahead
      // of its onFirstUse queue.
      const deploymentCompileStartedAt = performance.now();
      const deploymentProgramBaseline = snapshotRendererPrograms(renderer);
      const restoreArmorWarmVisibility = armorAimOverlay.warm();
      const combatFxSubmission = stageCombatFxProgramSubmission();
      const fxForwardWarmBatches = [];
      try {
        compileForGameplayTarget(scene);
        // compile() submits programs but does not guarantee their first
        // material/state bind. Keep the staged pools hidden between private
        // one-renderable binds so a driver linker flush cannot escape into
        // the visible deployment countdown.
        fx.group.visible = false;
        for (const batch of createIsolatedForwardWarmBatches({
          scene, root: fx.group, warmRender, cohortSize: 1,
        })) {
          fxForwardWarmBatches.push(batch);
          await coveredYield(true);
        }
      } catch (_) { /* first render fallback */ }
      finally {
        combatFxSubmission.restore();
        restoreArmorWarmVisibility();
      }
      // This exact covered submission includes the opening volley, tracer,
      // destruction, prop-break and crush pools after their shipped textures
      // were uploaded above. Do not replay the legacy opening/destruction
      // generators during the visible countdown; they remain fallbacks for
      // deterministic captures and direct debug entry that bypass this path.
      if (combatFxSubmission.staged) {
        combatOpeningWarmed = true;
        combatDestructionEffectsWarmed = true;
        if (typeof window !== 'undefined') {
          window.__COMBAT_OPENING_WARM = {
            covered: true,
            batches: fxForwardWarmBatches.length,
            totalMs: Math.round(performance.now() - deploymentCompileStartedAt),
          };
        }
      }
      trace.deploymentCompileMs = Math.round(performance.now() - deploymentCompileStartedAt);
      trace.deploymentFxForwardWarm = {
        batches: fxForwardWarmBatches.length,
        maxMs: Math.max(0, ...fxForwardWarmBatches.map((batch) => batch.ms)),
        totalMs: fxForwardWarmBatches.reduce((sum, batch) => sum + batch.ms, 0),
      };
      await nextFrame();
      await nextFrame();
      trace.deploymentProgramUniformWarm = await warmNewRendererProgramUniforms(
        renderer,
        deploymentProgramBaseline,
        coveredYield,
      );
      battleLoad.progress(0.969, 'Priming deployment shadows');
      trace.deploymentShadowWarm = await primeDeploymentShadowMaps(coveredYield);
      mark('shadowMaps');
      const forwardBatches = [];
      for (const batch of createDeploymentForwardWarmBatches({
        scene,
        csmLights: lighting?.csm?.lights,
        worldGroup: world?.group,
        playerRoot: game.player?.visual?.root,
        warmRender,
      })) {
        forwardBatches.push(batch);
        await coveredYield(true);
      }
      const forwardBatchMs = forwardBatches.map((batch) => batch.ms);
      trace.deploymentForwardWarm = {
        batches: forwardBatches,
        maxMs: forwardBatchMs.length ? Math.max(...forwardBatchMs) : 0,
        totalMs: forwardBatchMs.reduce((sum, ms) => sum + ms, 0),
      };
      mark('forwardPrograms');
      // Garage boot primes the post stack against the showroom, but the first
      // battlefield introduces terrain/vegetation depth, normal and color
      // inputs plus a different light program family. Asking the complete
      // composer to discover all of that in one reveal frame produced the
      // remaining 0.5-1.1 s cold freeze. Exercise the identical enabled pass
      // set one pass at a time while the loader is opaque; the final composed
      // frame below is unchanged, only its first-use work is distributed.
      trace.deploymentPostWarm = await post.warmFirstFrame(coveredYield);
      mark('postPasses');
      battleLoad.progress(0.97, 'Priming deployment view');
      await primeSoloBattleRevealFrame();
      entryRevealPrimed = true;
      battleLoadRenderingCovered = true;
      if (warmGeneration !== battleWarmGeneration) return;
      mark('openingFrame');
      // The exact shipped atlases were decoded, installed and uploaded in
      // parallel with world construction above. Program submission and
      // isolated effect binding move to the frozen visible countdown below:
      // no weapon can fire there, and rollout cannot release early.
      battleLoad.progress(0.975, 'Combat effects ready');
      mark('combatTextures');
      if (warmGeneration !== battleWarmGeneration) return;
      trace.totalMs = Math.round(performance.now() - countdownWarmStartedAt);
      trace.preBattleRemainingS = Number.isFinite(game.preBattleS) ? game.preBattleS : null;
      trace.doneBeforeRollout = game.phase === 'battle' && game.preBattleS > 0;
      trace.done = true;
      if (typeof window !== 'undefined') window.__BATTLE_COUNTDOWN_WARM = trace;
      devTrace?.mark('battle:entry-warm-end', { totalMs: trace.totalMs });
    })().catch((error) => {
      if (warmGeneration === battleWarmGeneration && typeof window !== 'undefined') {
        window.__BATTLE_COUNTDOWN_WARM = {
          done: true,
          doneBeforeRollout: false,
          error: String(error),
        };
      }
    });
    // The opening-critical subset is ready. Keep battleWarmPending armed
    // until the rare/full-quality deployment queue below finishes; the
    // visible countdown may advance but cannot release controls early.
    return warmGeneration;
  };
  const entryWarmGeneration = await finishEntryWarm();
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
    await primeSoloBattleRevealFrame();
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
// Headless probes drive the battle entry through __DEBUG.startBattle (which is
// synchronous) and skip the in-battle countdown (startBattle arms it only on
// the player path — see opts.preBattleHold).
let battleEntryPending = false;
// The solo battle loader is an opaque DOM surface. Rendering the newly
// activated 3D world behind it made ordinary `nextFrame()` budget yields pay
// the complete first world/shadow draw before the explicit offscreen warm,
// producing 0.5–1.4 s "Assembling rosters" stalls. Keep rAF alive for the
// loader/progress UI, but suppress redundant scene frames until the covered
// warm is complete and the loader is being dismissed.
let battleLoadRenderingCovered = false;
let presentedBattleFrameSerial = 0;

/**
 * Release the covered render gate and wait until the active battlefield has
 * actually reached the default framebuffer. The loader remains fully opaque
 * throughout this wait, so its exit can never reveal the retained Garage
 * frame left behind when covered rendering began.
 */
async function primeSoloBattleRevealFrame() {
  const firstRequiredSerial = presentedBattleFrameSerial + 1;
  const startedAt = performance.now();
  battleLoadRenderingCovered = false;
  while (presentedBattleFrameSerial < firstRequiredSerial) {
    if (performance.now() - startedAt > 1500) {
      throw new Error('Battlefield did not present before the loading screen exit.');
    }
    await nextFrame();
  }
  if (typeof window !== 'undefined') {
    window.__BATTLE_REVEAL = {
      primed: true,
      phase: game.phase,
      garageHidden: !garage.isOpen,
      loaderVisible: battleLoad.visible,
      frameSerial: presentedBattleFrameSerial,
      waitMs: Math.round(performance.now() - startedAt),
    };
  }
}

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
  onRematch: beginNetworkRematch,
  onClose: (reason) => closeNetworkMatch(reason),
});

bus.on('phase:change', () => networkRoomCoordinator.syncChatVisibility());

function disposeNetworkPresentation() {
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
  if (battleEntryPending) return;
  battleEntryPending = true;
  battleLoadRenderingCovered = true;
  try {
    await startBattleLoading(specId, mapId, options);
  } catch (error) {
    console.error('[battle] entry failed', error);
    audio.loadingOn(false);
    // Failure exits obey the same covered-frame rule in the opposite
    // direction: restore and paint the Garage while the loader is opaque,
    // then let the loader fade. Never expose whichever old WebGL frame was
    // retained when the failure occurred.
    enterGarage();
    battleLoadRenderingCovered = false;
    await nextFrame();
    await battleLoad.hide();
  } finally {
    battleLoadRenderingCovered = false;
    battleEntryPending = false;
  }
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
  transitionShown = false,
} = {}) {
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
  const [networkModules] = await Promise.all([
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
  ]);
  const [
    { createBrowserBattleBridge },
    { createNetworkStatus },
    { createBrowserInputRuntime },
  ] = networkModules;
  networkFramePump.ensureInputRuntime(createBrowserInputRuntime);
  markLoadStage('modules');
  networkStatus = createNetworkStatus();
  battleLoad.progress(0.08, 'Loading battlefield');
  await ensureWorld(mapId, (fraction, label) => {
    battleLoad.progress(0.08 + fraction * 0.48, label);
  });
  markLoadStage('world');
  networkMatch = await connectMatch();
  networkRecovery.attach(networkMatch?.client || null, networkStatus);
  markLoadStage('connect');
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
    initial = await networkFramePump.waitForSnapshot(
      (snapshot) => spectator
        ? snapshot.entities.length > 0
        : snapshot.entities.some((entity) => entity.id === viewerId),
      60000,
      'Timed out waiting for the first authoritative snapshot.',
    );
  } catch (error) {
    preparedBridge.dispose();
    throw error;
  }
  markLoadStage('initialSnapshot');
  networkBridge = preparedBridge;
  networkBridge.apply(initial, 1 / 60);
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
  const readyMatch = networkMatch;
  readyMatch.ready();
  // READY is deliberately idempotent. Keep announcing it until an
  // authoritative countdown/playing snapshot acknowledges that every peer
  // crossed the loading barrier; this also covers the RTC listener handoff.
  const readyRetryTimer = setInterval(() => {
    if (networkMatch === readyMatch && !readyMatch.client?.closed) readyMatch.ready();
  }, 1000);
  battleLoad.progress(0.96, 'Waiting for every commander');
  try {
    await networkFramePump.waitForSnapshot(
      (snapshot) => snapshot.meta?.phase === 'countdown' || snapshot.meta?.phase === 'playing',
      60000,
      'Another player did not finish loading in time.',
    );
  } finally {
    clearInterval(readyRetryTimer);
  }
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
    buildShellCards(game.player.spec);
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
  resetConsumableCooldowns(consumableReadyAt);
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

/** Load the rendered battlefield, then join browser-hosted private/LAN authority. */
async function beginNetworkBattle({ role, session, lobbyState, battleLimitS } = {}) {
  if (battleEntryPending || networkMatch) return false;
  battleEntryPending = true;
  let entered = false;
  if (typeof window !== 'undefined') window.__NETWORK_ENTRY_FAILURE = null;
  const viewerId = String(session?.roomInfo?.peerId || '');
  const own = lobbyState?.players?.find((player) => player.id === viewerId);
  try {
    if (!viewerId || !own) throw new Error('The lobby identity is unavailable.');
    resetNetworkBattleState();
    // Cover the page before the first cold import can yield. The play menu
    // hands off from the garage synchronously; previously its hide exposed a
    // garage frame (or several on a slow machine) while this module loaded.
    const modeLabel = lobbyState.mode === 'lan'
      ? 'LAN Battle · Direct Wi-Fi' : 'Private Battle · Room Code';
    const displayTeam = own.team === 'spectator' ? 'alpha' : own.team;
    const pendingMapId = lobbyState.mapId === 'random' ? null : lobbyState.mapId;
    const pendingCfg = pendingMapId ? getMapConfig(pendingMapId) : null;
    bus.emit('ui:battleStart', {
      playerId: viewerId,
      specId: own.specId,
      mapId: lobbyState.mapId,
    });
    battleLoad.show({
      mapName: pendingCfg?.name || 'Battle',
      thumb: pendingMapId ? MAP_THUMBS[pendingMapId] || '' : '',
      biome: lobbyState.mapId === 'random' ? 'none' : lobbyState.mapId,
      mode: modeLabel,
      allies: lobbyRosterRows(lobbyState, displayTeam, viewerId),
      enemies: lobbyRosterRows(lobbyState,
        displayTeam === 'alpha' ? 'bravo' : 'alpha', viewerId),
    });
    audio.resume();
    audio.loadingOn(true);
    battleLoad.progress(0.01, 'Opening battle channel');
    const {
      beginPrivateHostMatch,
      beginPrivateClientMatch,
      buildPrivateMatchPlayers,
      resolvePrivateMatchMap,
    } = await preloadPrivateMatchHandoffModule();
    const mapId = resolvePrivateMatchMap(lobbyState);
    const matchPlayers = buildPrivateMatchPlayers(lobbyState);
    await presentNetworkBattle({
      viewerId,
      own,
      mapId,
      matchPlayers,
      modeLabel,
      transitionShown: true,
      connectMatch: () => role === 'host'
        ? beginPrivateHostMatch({ session, lobbyState, worldCollision: world, battleLimitS })
        : beginPrivateClientMatch({ session, playerId: viewerId, lobbyState }),
    });
    networkRoomCoordinator.attach(lobbyState);
    entered = true;
  } catch (error) {
    if (typeof window !== 'undefined') {
      window.__NETWORK_ENTRY_FAILURE = {
        message: error.message,
        role,
        clientConnected: !!networkMatch?.client?.connected,
        clientReadySent: !!networkMatch?.client?.readySent,
        matchStarted: !!networkMatch?.host?.matchStarted,
        peers: networkMatch?.host
          ? [...networkMatch.host.peers.values()].map((peer) => ({
            id: peer.id,
            welcomed: peer.welcomed,
            ready: peer.ready,
            pendingRoundReady: peer.pendingRoundReady,
            lastRecvSeq: peer.lastRecvSeq,
            transportKind: peer.transport?.kind || null,
          }))
          : [],
      };
    }
    console.error('[network] entry failed', error);
    audio.loadingOn(false);
    closeNetworkMatch('entry_failed');
    await battleLoad.hide();
    enterGarage();
  } finally {
    battleEntryPending = false;
  }
  return entered;
}

/** Load another authority round over the room's existing WebRTC channels. */
async function beginNetworkRematch(lobbyState) {
  const round = Number(lobbyState?.round) || 0;
  if (!networkRoomCoordinator.claimRematch(lobbyState, battleEntryPending)) return false;
  battleEntryPending = true;
  const viewerId = networkMatch.playerId;
  const own = lobbyState.players.find((player) => player.id === viewerId);
  try {
    if (!own) throw new Error('Your player is no longer in this room.');
    const displayTeam = own.team === 'spectator' ? 'alpha' : own.team;
    const modeLabel = lobbyState.mode === 'lan'
      ? `LAN Battle · Round ${round}` : `Private Battle · Round ${round}`;
    const pendingMapId = lobbyState.mapId === 'random' ? null : lobbyState.mapId;
    const pendingCfg = pendingMapId ? getMapConfig(pendingMapId) : null;
    bus.emit('ui:battleStart', { playerId: viewerId, specId: own.specId, mapId: lobbyState.mapId });
    battleLoad.show({
      mapName: pendingCfg?.name || 'Next battle',
      thumb: pendingMapId ? MAP_THUMBS[pendingMapId] || '' : '',
      biome: lobbyState.mapId === 'random' ? 'none' : lobbyState.mapId,
      mode: modeLabel,
      allies: lobbyRosterRows(lobbyState, displayTeam, viewerId),
      enemies: lobbyRosterRows(lobbyState,
        displayTeam === 'alpha' ? 'bravo' : 'alpha', viewerId),
    });
    audio.resume();
    audio.loadingOn(true);
    battleLoad.progress(0.01, 'Preparing the next round');
    disposeNetworkPresentation();
    networkFramePump.clearRound();
    const { buildPrivateMatchPlayers, resolvePrivateMatchMap } =
      await preloadPrivateMatchHandoffModule();
    const mapId = resolvePrivateMatchMap(lobbyState);
    const matchPlayers = buildPrivateMatchPlayers(lobbyState);
    await presentNetworkBattle({
      viewerId,
      own,
      mapId,
      matchPlayers,
      modeLabel,
      transitionShown: true,
      connectMatch: () => {
        if (networkMatch.role === 'host') {
          networkMatch.prepareRound({ lobbyState, worldCollision: world });
        }
        return networkMatch;
      },
    });
    return true;
  } catch (error) {
    console.error('[network] rematch entry failed', error);
    audio.loadingOn(false);
    closeNetworkMatch('rematch_entry_failed');
    await battleLoad.hide();
    enterGarage();
    return false;
  } finally {
    battleEntryPending = false;
    networkRoomCoordinator.finishRematch();
  }
}

/** Join a server-authoritative rated match issued by the ranked queue. */
async function beginRankedBattle({ serviceUrl, state } = {}) {
  if (battleEntryPending || networkMatch) return;
  battleEntryPending = true;
  const ticket = state?.match;
  const viewerId = String(ticket?.playerId || '');
  const own = ticket?.roster?.find((player) => player.id === viewerId);
  try {
    if (!ticket || !viewerId || !own) throw new Error('Ranked match ticket is incomplete.');
    resetNetworkBattleState();
    const modeLabel = `Ranked · ${own.rating || 1000} rating`;
    const displayTeam = own.team === 'spectator' ? 'alpha' : own.team;
    bus.emit('ui:battleStart', {
      playerId: viewerId,
      specId: own.specId,
      mapId: ticket.mapId,
    });
    battleLoad.show({
      mapName: 'Ranked operation',
      thumb: '',
      biome: ticket.mapId,
      mode: modeLabel,
      allies: lobbyRosterRows({ players: ticket.roster }, displayTeam, viewerId),
      enemies: lobbyRosterRows({ players: ticket.roster },
        displayTeam === 'alpha' ? 'bravo' : 'alpha', viewerId),
    });
    audio.resume();
    audio.loadingOn(true);
    battleLoad.progress(0.01, 'Opening dedicated channel');
    const { beginDedicatedClientMatch } = await preloadDedicatedClientModule();
    await presentNetworkBattle({
      viewerId,
      own,
      mapId: ticket.mapId,
      matchPlayers: ticket.roster,
      modeLabel,
      transitionShown: true,
      connectMatch: () => beginDedicatedClientMatch({
        url: serviceUrl,
        ticket,
        onStatus: (status) => networkStatus?.set(status),
      }),
    });
  } catch (error) {
    console.error('[ranked] entry failed', error);
    audio.loadingOn(false);
    closeNetworkMatch('entry_failed');
    await battleLoad.hide();
    enterGarage();
  } finally {
    battleEntryPending = false;
  }
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
  lendPedestalToBattle(specId);
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
  resetCombatRoundWarmState();
  sbtStage('setupRoster');
  primeDeploymentTerrainTiles();
  sbtStage('terrainTiles');
  // Fixed-step authority starts every round with a matching presentation
  // history. Without this reset a debug/rematch entry could interpolate from
  // the previous battlefield pose for one frame.
  simAcc = 0;
  resetSoloPresentationPoses();
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
  buildShellCards(game.player.spec);
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
  resetConsumableCooldowns(consumableReadyAt);
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
  if (!opts.deferVisuals) warmCombatPipeline();
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
  fx.setFrozen(false);
  game.phase = 'garage';
  // Establish a new activity epoch for this garage visit. Optional workshop
  // exhibits must not inherit a stale timestamp from before the battle and
  // contend with the transition reveal or the first interactive frames.
  garageDressingScheduler.noteActivity();
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
  const adoptedBattleVisual = adoptBattlePlayerAsPedestal(selectedSpecId)
    ? pedestalVisual
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
    // drain/countdown tail (battleEntryPending true) — wait it out, bounded,
    // instead of silently dropping the click
    const t0 = performance.now();
    while (battleEntryPending && performance.now() - t0 < 15000) {
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
const camInput = {
  mouseDX: 0, mouseDY: 0, wheel: 0, rmb: false, shiftPressed: false,
  // gunnery r1: RMB hold-to-aim level (settings rmbMode 'hold' — the default)
  aimHold: false,
  // CURSOR-AIM FALLBACK (no-pointer-lock environments — see input.isCursorAim)
  cursorAim: false, cursorX: 0, cursorY: 0,
  // MOBILE AUTO-AIM: null when unlocked, live center-mass point when locked.
  autoAimPoint: null,
};
const _cursorNdc = { x: 0, y: 0 };
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

function resetSoloPresentationPoses() {
  for (const ent of game.tanks) {
    if (!ent.state) continue;
    if (!ent._soloRenderPose) ent._soloRenderPose = createTankPresentationPose();
    resetTankPresentationPose(ent._soloRenderPose, ent.state);
  }
}

function primeDeploymentTerrainTiles() {
  const warmer = world?.heightField?.warmFastTilesAround;
  if (typeof warmer !== 'function') return;
  const points = [];
  for (const ent of game.tanks) {
    const pos = ent?.state?.pos;
    if (pos) points.push({ x: pos.x, z: pos.z, radiusM: 0 });
  }
  // This runs while battle entry is still covered (or inside a debug start),
  // preventing deployment first-touch tile bakes from stacking on the first
  // live simulation frame. The larger player neighborhood remains chunked below.
  for (const _tile of warmer.call(world.heightField, points)) { /* drain */ }
}

function captureSoloPresentationPoses() {
  for (const ent of game.tanks) {
    if (!ent.state) continue;
    if (!ent._soloRenderPose) ent._soloRenderPose = createTankPresentationPose(ent.state);
    else advanceTankPresentationPose(ent._soloRenderPose, ent.state);
  }
}

function presentationStateFor(ent, alpha) {
  // BrowserBattleBridge already supplies Hermite-interpolated remote poses and
  // corrected local prediction every render frame. Interpolating those again
  // would add latency and smear corrections, so this buffer is solo-only.
  if (networkMatch || game.phase !== 'battle') return ent.state;
  if (!ent._soloRenderPose) ent._soloRenderPose = createTankPresentationPose(ent.state);
  return sampleTankPresentationPose(ent._soloRenderPose, ent.state, alpha);
}

const _detailScreenPos = new THREE.Vector3();
function setBattleVisualResident(visual, resident) {
  const root = visual?.root;
  if (!root) return;
  if (resident) {
    if (root.userData.battleVisibilityDetached && !root.parent) scene.add(root);
    root.userData.battleVisibilityDetached = false;
    return;
  }
  // Only roots deliberately detached by this visibility owner may be
  // reattached above. This prevents a late spotting edge from resurrecting a
  // visual that another lifecycle owner disposed or parked.
  if (root.parent === scene) {
    root.removeFromParent();
    root.userData.battleVisibilityDetached = true;
  }
}
function updateDustAndSync(dtFrame, presentationAlpha = 1) {
  const cameraPosition = camera.position;
  // Renderer frustum-culls individual meshes later, but running-gear
  // conformance happens before that traversal. Build one conservative screen
  // guard so an actor just outside the view cannot upload hundreds of hidden
  // wheel/link matrices every render frame.
  camera.updateMatrixWorld();
  for (const ent of game.tanks) {
    // PERF r3: staged-battle visuals are deferred to post-ready idle — skip
    // entities whose visual has not streamed in yet (garage phase only;
    // warmCombatPipeline builds all of them before battle/shot frames).
    if (!ent.state || !ent.combat || !ent.visual) continue;
    const state = ent.state;
    const combat = ent.combat;
    const visual = ent.visual;
    const spec = ent.spec;
    const dims = spec.dims;
    const topSpeedMps = spec.topSpeedKmh / 3.6;
    // Resolve spotting before any presentation work. A fully faded enemy has
    // no legal pixels or presentation FX, so interpolating/projecting its
    // pose and walking its complete visual hierarchy every render frame was
    // pure hidden work. The first fade-in frame resumes from the current
    // authoritative pose before the root becomes visible.
    let actorVisible = true;
    if (game.phase === 'battle' && game.spotting && ent.team === 'enemy') {
      const spotted = combat.destroyed ||
        game.spotting.isSpotted(ent.id, 'player', game.player);
      const target = spotted ? 1 : 0;
      if (ent._spotFade === undefined) ent._spotFade = target;
      // eased fade to avoid popping (0 -> 1 in ~0.35 s); no dt (boot) = snap
      ent._spotFade += (target - ent._spotFade) *
        (dtFrame === undefined ? 1 : Math.min(1, dtFrame / 0.35));
      actorVisible = ent._spotFade > 0.02;
      setBattleVisualResident(visual, actorVisible);
      visual.setVisible(actorVisible);
    } else if (game.phase === 'battle' && !ent.isPlayer) {
      // Allies (and enemies in the no-spotting fallback) are force-shown; the
      // player's hull visibility remains owned by the camera rig below.
      visual.setVisible(true);
    }
    if (!actorVisible) continue;

    const presented = presentationStateFor(ent, presentationAlpha);
    // effects_combat r1: pass the real frame dt so self-timed visual
    // timelines (recuperator recoil, turret-pop arc, ember cooldown) play at
    // wall-clock speed on 120 Hz displays (undefined at boot -> 1/60 default).
    // PERF (perf-r2): the camera distance lets the visual run its track
    // dressing (per-wheel heightAt conform + link/band instance pass) at a
    // reduced cadence beyond fine-detail range — battle loop only; studio,
    // killcam and staged poses omit it and keep full-rate updates.
    const viewDistM = cameraPosition.distanceTo(presented.pos);
    _detailScreenPos.copy(presented.pos);
    _detailScreenPos.y += dims.heightM * 0.5;
    _detailScreenPos.project(camera);
    const detailVisible = ent.isPlayer || game.phase !== 'battle'
      || (_detailScreenPos.z >= -1.2 && _detailScreenPos.z <= 1.2
        && Math.abs(_detailScreenPos.x) <= 1.35
        && Math.abs(_detailScreenPos.y) <= 1.45);
    if (game.phase !== 'garage' || visual !== pedestalVisual) {
      visual.syncFromState(state, dtFrame, viewDistM, presented, detailVisible);
    }
    // The PLAYER's hull visibility is OWNED by the camera rig — it hides the
    // hull while scoped (sniper). Never force-show it here: doing so one step
    // after the rig hid it renders the inside of the hull/mantlet.
    // Presentation FX must obey the same visibility boundary as the actor.
    // Emitting dust for an unspotted enemy both leaks its position and burns
    // transparent overdraw on a vehicle the player is not allowed to see.
    // The far field is already absorbed by aerial perspective; skip vehicle
    // media beyond it instead of filling a 1024-card pool off camera.
    const vehicleFxVisible = visual.root.visible && viewDistM < 360;
    if (game.phase === 'battle' && !combat.destroyed && vehicleFxVisible) {
      // PERF (perf-budget): dust/exhaust emission was per-FRAME — an unlocked
      // 120 fps client emitted 2x the particles the fx were tuned for at 60,
      // rotating the smoke/dust pools twice as fast late-battle. Fixed 60 Hz
      // cadence (up to 2 catch-up ticks) keeps the tuned 60 fps look identical
      // and makes emission frame-rate-independent.
      ent._fxAcc = (ent._fxAcc || 0) + (dtFrame === undefined ? 1 / 60 : dtFrame);
      if (ent._fxAcc < 1 / 60) continue;
      const fxTicks = Math.min(2, Math.floor(ent._fxAcc * 60));
      ent._fxAcc -= fxTicks / 60;
      const sp = Math.abs(presented.speed);
      const throttle = Math.abs(ent.input.throttle || 0);
      _fwd.set(Math.sin(presented.yaw), 0, Math.cos(presented.yaw));
      if (sp > 0.8) {
        const intensity = Math.min(1, sp / topSpeedMps);
        // Distance-driven emission: the old "three puffs per 60 Hz tick per
        // track" saturated the complete dust pool in about one second and
        // layered hundreds of overlapping 5 m cards into a muddy veil. One
        // structured burst every ~0.45-0.70 m leaves continuous twin tracks
        // at speed, scales naturally with vehicle motion, and is identical
        // on 60/120/240 Hz displays.
        const spacingM = THREE.MathUtils.lerp(0.70, 0.45, intensity);
        ent._dustTravelAcc = Math.min(spacingM * 2,
          (ent._dustTravelAcc || 0) + sp * (fxTicks / 60));
        if (ent._dustTravelAcc >= spacingM) {
          ent._dustTravelAcc -= spacingM;
          _v3.set(_fwd.z, 0, -_fwd.x); // right axis
          for (let side = -1; side <= 1; side += 2) {
            _v1.copy(presented.pos)
              .addScaledVector(_fwd, -dims.hullLengthM * 0.45)
              .addScaledVector(_v3, side * dims.widthM * 0.45);
            fx.dust(_v1, _fwd, intensity);
          }
        }
      } else {
        ent._dustTravelAcc = 0;
      }
      // Exhaust puffs off the engine deck whenever the engine is under load.
      // effects_combat r2: the stationary hero tank idles visibly during the
      // opening flyby (motion accent), and era picks the exhaust character —
      // WW2 diesels puff sooty, modern turbines emit a fast thin haze.
      // effects_combat r1: always emit — a parked idling tank still breathes
      // (idle floor 0.10; fx.exhaust is probability-gated so idle stays wispy)
      {
        const load = Math.max(0.10, (rig.cinematicActive && ent.isPlayer) ? 0.3 : 0,
          Math.min(1, throttle * 0.7 + (sp / topSpeedMps) * 0.5));
        _v1.copy(presented.pos).addScaledVector(_fwd, -dims.hullLengthM * 0.42);
        _v1.y += dims.heightM * 0.72;
        fx.exhaust(_v1, load, !isPostwarVehicleEra(spec.era));
      }
      // effects_combat r1: crushable props — pole vs hull overlap triggers
      // the hinge-topple (world.crushProp) + wood-splinter burst.
      if (sp > 1.2 && world && world.crushables && world.crushables.length) {
        const hl = dims.hullLengthM * 0.5 + 0.5;
        // Lightweight loop-contact props bypass the sim collider, so derive
        // the signed travel direction here. Facing direction alone made props
        // rammed in reverse fall toward the moving tank.
        _v2.copy(_fwd).multiplyScalar(Math.sign(state.speed) || 1);
        for (let ci = 0; ci < world.crushables.length; ci++) {
          const c = world.crushables[ci];
          if (c.toppled) continue;
          const dx = c.x - state.pos.x, dz = c.z - state.pos.z;
          if (dx * dx + dz * dz > hl * hl) continue;
          // DESTRUCTIBLES r1: the hull speed rides into the break so tossed
          // drums/debris inherit the rammer's velocity
          if (world.crushProp(ci, _v2.x, _v2.z, sp)) {
            _v1.set(c.x, c.y, c.z);
            if (c.dynamic && fx.loosePropHit) fx.loosePropHit(_v1, _v2, c.h);
            else fx.propCrush(_v1, _v2, c.h);
          }
        }
      }
    } else if (!vehicleFxVisible) {
      // Never bank invisible travel and dump it as one giant plume when the
      // actor re-enters spotting/range.
      ent._dustTravelAcc = 0;
    }
  }
}

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
let lastTickWallMs = -Infinity;
let rafQueued = false;
let rafId = 0;
function scheduleRaf() {
  if (rafQueued) return;
  rafQueued = true;
  rafId = requestAnimationFrame((t) => {
    rafId = 0;
    rafQueued = false;
    tick(t);
  });
}
function restartRaf() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  rafQueued = false;
  scheduleRaf();
}
rearmRafAfterContext = restartRaf;
setInterval(() => {
  if (!bootComplete) return;
  const now = performance.now();
  if (now - lastTickWallMs > 200 && document.hasFocus() && document.hidden) {
    tick(now);
  }
}, 100);
function starvedPump() {
  if (!bootComplete) return;
  if (!document.hidden) return; // visible pages tick on rAF as always
  const now = performance.now();
  if (now - lastTickWallMs > 100) tick(now);
}
for (const ev of ['mousedown', 'mouseup', 'mousemove', 'keydown', 'keyup', 'wheel']) {
  window.addEventListener(ev, starvedPump, { passive: true });
}

function tick(nowMs) {
  scheduleRaf();
  lastTickWallMs = performance.now();
  if (lastMs < 0) lastMs = nowMs;
  const frameWallDtS = Math.max(0, (nowMs - lastMs) / 1000);
  // Frame dt clamp (0.1 s): a stalled/backgrounded loop never integrates its
  // whole gap. The PAUSE block below extends this on the resume edge.
  let dtR = Math.min(0.1, frameWallDtS);
  lastMs = nowMs;
  devTrace?.frame(dtR * 1000);
  if (graphicsContextLost) return;

  if (battleLoadRenderingCovered) return;

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
    fx.update(dtR, game.shells, camera, resolveFxSubject);
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
  const battleEntryCameraLocked = inBattle && battleLoad.covering;
  // KILL-CAM: while the replay runs, the sim/rig/visual-sync are all frozen —
  // resuming just continues the fixed-step loop (no drifted timers).
  const kcActive = killcam.isActive();

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

  // 1. poll input (action layer: rebindable, Set-based state — no ghosting)
  if (inBattle && !paused && !kcActive && game.player && !game.player.combat.destroyed) {
    const st = input.getState();
    const inp = game.player.input;
    const touchDriving = input.getVirtualMove(_touchMove);
    inp.throttle = touchDriving
      ? _touchMove.y
      : (st.forward ? 1 : 0) - (st.back ? 1 : 0);
    // CONTROLS-SIGN FIX (input routing only — 1 line): TankInput.steer is
    // POSITIVE = increasing hull yaw (movement.js "Steering sign" note; the
    // AI's `steer = wrapAngle(bearing - yaw) * k` depends on it). Increasing
    // yaw rotates forwardAxis toward +X, which in this Y-up right-handed world
    // is the player's screen-LEFT — so "steer right" (D) must send steer < 0.
    // The old `right - left` drove D into +yaw and turned the hull LEFT on
    // screen (user report; measured -0.36 NDC-x nose swing for D before this
    // fix — tools/controls-probe.mjs now asserts the screen direction).
    inp.steer = touchDriving
      ? -_touchMove.x
      : (st.left ? 1 : 0) - (st.right ? 1 : 0);
    inp.brake = st.handbrake;
    const haveAmmo = !shellCards.length || ((shellCards[inp.shellSlot | 0] || {}).count | 0) > 0;
    // Fire gate: pointer lock held, a recently-active gamepad, or CURSOR-AIM
    // mode (lock unavailable — LMB must fire whenever the battle is live; the
    // input layer already refuses edges from clicks on UI overlays).
    inp.fire = ((st.fire && (input.isLocked() || input.padActive() ||
      input.isCursorAim() || input.virtualActive())) ||
      debugFlags.forceFire) && haveAmmo;
  } else if (game.player) {
    const inp = game.player.input;
    inp.throttle = 0; inp.steer = 0; inp.brake = false; inp.fire = false;
  }
  // smoothed + sensitivity/invert-scaled aim delta (extra scale in sniper)
  input.consumeMouseDelta(_mouse, dtR, rig.mode === 'SNIPER');
  camInput.mouseDX = (paused || battleEntryCameraLocked) ? 0 : _mouse.x;
  camInput.mouseDY = (paused || battleEntryCameraLocked) ? 0 : _mouse.y;
  camInput.wheel = (paused || battleEntryCameraLocked) ? 0 : wheelStep;
  // CURSOR-AIM FALLBACK: pointer lock unavailable — the rig raycasts through
  // the real cursor instead of screen center and the turret chases that point.
  const cursorAimNow = input.isCursorAim();
  camInput.cursorAim = inBattle && !paused && !battleEntryCameraLocked && cursorAimNow;
  if (camInput.cursorAim) {
    input.getCursorNdc(_cursorNdc);
    camInput.cursorX = _cursorNdc.x;
    camInput.cursorY = _cursorNdc.y;
  }
  // FREE-LOOK / RMB ROUTING: Caps Lock (the rebindable `freeLook` action; Left
  // Alt remains its secondary default) always provides classic hold-to-look with
  // the aim point and turret frozen. What the RMB-bound `freeCamera` action
  // does is the player's settings.rmbMode pick —
  //   'hold' (DEFAULT, owner ask): hold-to-aim — the rig enters sniper while
  //     held and returns to the prior arcade zoom + preserved aim pitch on
  //     release (CamInput.aimHold; edges live in cameraRig).
  //   'toggle': tap toggles sniper through the existing rising-edge lane.
  //   'freelook': the WoT-classic gun-lock free look (pre-r1 behavior).
  //     Meaningless in CURSOR-AIM mode (the camera never mouselooks), where
  //     it degrades to the legacy RMB sniper toggle so no-pointer-lock embeds
  //     keep a mouse-reachable scope on the button players aim with.
  // isDown() consumes the sub-frame tap latch, so 'freeCamera' is read
  // exactly once per frame.
  const rmbMode = input.getSettings().rmbMode || 'hold';
  const rmbHeld = input.isDown('freeCamera');
  const freeLookHeld = input.isDown('freeLook');
  const sniperToggleHeld = input.isDown('sniperToggle');
  camInput.rmb = inBattle && !paused && !battleEntryCameraLocked && !cursorAimNow &&
    (freeLookHeld || (rmbMode === 'freelook' && rmbHeld));
  camInput.aimHold = inBattle && !paused && !battleEntryCameraLocked &&
    rmbMode === 'hold' && rmbHeld;
  camInput.shiftPressed = !battleEntryCameraLocked && (
    sniperToggleHeld ||
    (rmbMode === 'toggle' && rmbHeld) ||
    (rmbMode === 'freelook' && cursorAimNow && rmbHeld));
  wheelStep = 0;

  // Network authority keeps pumping while the loading screen owns the page,
  // then consumes the same polled controls once the shared countdown opens.
  networkFramePump.pump(dtR, nowMs);

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
        captureSoloPresentationPoses();
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
    updateDustAndSync(dtR, presentationAlpha);
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
  if (game.phase === 'garage') showroom.update(dtR);

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
  if (game.phase === 'battle') presentedBattleFrameSerial++;
  perfHud.update(dtR * 1000); // FEEL r12: after render — info.render is fresh
}

function applyViewportSize() {
  onResize(renderer, camera);
  post.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
  lighting.updateFrustums();
}
window.addEventListener('resize', applyViewportSize);
// zero-viewport boot hardening: embedded panes can boot while the layout is
// still 0×0 — the renderer/canvas stay zero-sized and the screen is black
// until something fires a real window `resize` event (which such hosts may
// never send). If boot happened at zero size, watch for the FIRST non-zero
// layout (ResizeObserver on the container, plus a cheap interval fallback
// for hosts that only lie through the window metrics) and run the shared
// resize seam once. Inert on normal boots.
(() => {
  const zeroNow = () =>
    !(container.clientWidth || window.innerWidth) ||
    !(container.clientHeight || window.innerHeight);
  if (!zeroNow() && renderer.domElement.width > 0 && renderer.domElement.height > 0) return;
  let ro = null;
  let iv = 0;
  const tryFix = () => {
    if (zeroNow()) return false;
    applyViewportSize();
    if (ro) { ro.disconnect(); ro = null; }
    if (iv) { clearInterval(iv); iv = 0; }
    return true;
  };
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(() => tryFix());
    ro.observe(container);
    ro.observe(document.documentElement);
  }
  iv = setInterval(tryFix, 250);
  tryFix();
})();

// ---------------------------------------------------------------------------
// Screenshot contract (docs/SCREENSHOT_CONTRACT.md, ARCHITECTURE.md §5)
// ---------------------------------------------------------------------------
const VIEW_TIME = {
  battlefield: 2.0,
  player_view: 1.0,
  sniper_view: 1.2,
  tank_closeup_modern: 0.8,
  tank_closeup_ww2: 0.9,
  tank_closeup_t90m: 0.8,
  tank_closeup_leo2a7: 0.8,
  combat_firing: 0.5,
  explosion: 1.5,
  garage: 0.7,
  battlefield_desert: 2.0,
  battlefield_winter: 2.0,
  battlefield_urban: 2.0,
  // MAPS r1: the second four battlefields
  battlefield_coastal: 2.0,
  battlefield_autumn: 2.0,
  battlefield_steppe: 2.0,
  battlefield_railyard: 2.0,
  // Map-quality expansion
  battlefield_frontier: 2.0,
  battlefield_fjord: 2.0,
  battlefield_delta: 2.0,
  battlefield_badlands: 2.0,
  battlefield_monsoon: 2.0,
  battlefield_alpine: 2.0,
  battlefield_caldera: 2.0,
  battlefield_foundry: 2.0,
  battlefield_ruinspires: 2.0,
  battlefield_blackglass: 2.0,
  battlefield_titan_gorge: 2.0,
  battlefield_skybridge: 2.0,
  killcam_xray: 1.0, // KILL-CAM
};

// which world a screenshot view must be captured on (default: verdant)
const VIEW_MAP = {
  battlefield_desert: 'desert',
  battlefield_winter: 'winter',
  battlefield_urban: 'urban',
  // MAPS r1
  battlefield_coastal: 'coastal',
  battlefield_autumn: 'autumn',
  battlefield_steppe: 'steppe',
  battlefield_railyard: 'railyard',
  battlefield_frontier: 'frontier',
  battlefield_fjord: 'fjord',
  battlefield_delta: 'delta',
  battlefield_badlands: 'badlands',
  battlefield_monsoon: 'monsoon',
  battlefield_alpine: 'alpine',
  battlefield_caldera: 'caldera',
  battlefield_foundry: 'foundry',
  battlefield_ruinspires: 'ruinspires',
  battlefield_blackglass: 'blackglass',
  battlefield_titan_gorge: 'titan_gorge',
  battlefield_skybridge: 'skybridge',
};

// MAP-CONFIG WIRING: pin the shot to its map, re-seating the staged battle
// (deterministic spawns) whenever the map actually changes.
async function ensureShotWorld(mapId, playerSpecId = 'm1a2') {
  // Capture callers await the same chunked builder as gameplay. Keeping a
  // second synchronous map constructor in the entry graph defeated genuine
  // world lazy loading and froze first-time authored captures.
  await Promise.all([
    preloadSoloBattleRuntime(), preloadBattleClientRuntime(),
    ensureBattleHud(), ensureTouchControls(),
  ]);
  if (!world || world.mapId !== mapId) await switchMap(mapId);
  lighting.setFarCascadeDormant(false);
  setWorldDormant(false);
  // camo_spotting r2: staged captures must show biome-correct AUTO paint —
  // startBattle resolves the camo biome but the contract views do not pass
  // through it, so shots could carry the previous biome's paint.
  setCamoBiome(mapId);
  applyCamoPatterns();
  // Always restage deterministically: a prior random-roster battle must not
  // leak into the screenshot contract (recipes reference tiger1/t90m/etc).
  setupBattle(game, playerSpecId, world);
  resetCombatRoundWarmState();
  battleStaged = true;
  buildShellCards(game.player.spec);
  damagePanel.setTank(game.player.spec, game.player.visual);
  damagePanel.setEquipment(game.player.equip); // EQUIPMENT SYSTEM: loadout readout
  for (const ent of game.allTanks) {
    if (ent.visual && ent.visual.setGroundSampler) ent.visual.setGroundSampler(groundSampler);
  }
}

// wide establishing shot from the map config's deterministic camera preset
function mapEstablishingShot() {
  hud.setMode('hidden');
  const s = world.config.shot;
  _v1.set(s.pos[0], world.heightField.getHeightAt(s.pos[0], s.pos[2]) + s.pos[1], s.pos[2]);
  _v2.set(s.look[0], world.heightField.getHeightAt(s.look[0], s.look[2]) + s.look[1], s.look[2]);
  rig.setExternalPose(_v1, _v2, 55);
}

function zeroInputs() {
  for (const ent of game.tanks) {
    ent.input.throttle = 0;
    ent.input.steer = 0;
    ent.input.brake = false;
    ent.input.fire = false;
  }
  input.setEnabled(true); // also clears any held key/button state
  if (settings.isOpen()) settings.close();
}

// tank_models r5 (minor #10 "same game, three different suns"): the map sun
// is FIXED (verdant az 115 / elev 32) but each hero spawns with its own yaw,
// so the four closeups read as four different suns — the Tiger's cast shadow
// hid straight behind its hull (pasted-on look) while the T-90M/Leo threw
// long side shadows. Normalize every closeup hero to ONE world heading before
// the orbit so all four shots share the same sun-relative geometry and a
// comparable grounded contact shadow; per-view camera azimuth keeps framing.
function closeupStage(ent) {
  ent.state.yaw = THREE.MathUtils.degToRad(98);
  ent.visual.syncFromState(ent.state);
}

function orbitPose(ent, distM, azimuthDeg, elevDeg, fovDeg) {
  const az = ent.state.yaw + azimuthDeg * DEG;
  const el = elevDeg * DEG;
  _v2.copy(ent.state.pos);
  _v2.y += ent.spec.dims.heightM * 0.55;
  _v1.set(
    _v2.x + Math.sin(az) * Math.cos(el) * distM,
    _v2.y + Math.sin(el) * distM,
    _v2.z + Math.cos(az) * Math.cos(el) * distM,
  );
  rig.setExternalPose(_v1, _v2, fovDeg);
}

function forcedHudFrame(mode, forcedAim) {
  // One deterministic hud.update (minimap + bars + selector), then the forced
  // aim display per contract. r5: shot-mode frames now RE-RUN hud.update from
  // this frozen frameInfo every tick (see shotHudFrame in tick()) so the
  // reticle canvas stays live for capture hooks like __DEBUG.forceHitMark.
  shotHudFrame = true;
  hud.setMode(mode);
  frameInfo.timeS = VIEW_TIME.player_view;
  frameInfo.mode = mode;
  frameInfo.player = game.player;
  frameInfo.shells = game.shells;
  const aim = frameInfo.aim;
  aim.point.copy(rig.aimPoint);
  aim.distM = forcedAim.distM;
  aim.dispersionRadM = forcedAim.dispersionRadM;
  aim.penRatio = forcedAim.penRatio;
  aim.gunDistM = forcedAim.gunDistM != null ? forcedAim.gunDistM : forcedAim.distM;
  aim.gunTargetId = forcedAim.gunTargetId != null ? forcedAim.gunTargetId : null;
  aim.singleReticle = !!(game.player.spec.hydropneumaticAim &&
    game.player.spec.armor?.turretless);
  aim.blockedDistM = null; // screenshot views never show the blocked warning
  aim.blockedLabel = false;
  aim.atGunLimit = false;
  aim.gunLimitSpec = false;
  aim.reload.t = forcedAim.reload.t;
  aim.reload.totalS = forcedAim.reload.totalS;
  aim.reload.kind = forcedAim.reload.kind || 'shell';
  aim.magazine.rounds = forcedAim.magazine?.rounds || 0;
  aim.magazine.capacity = forcedAim.magazine?.capacity || 0;
  aim.shellSlot = forcedAim.shellSlot;
  aim.shells = shellCards;
  aim.zoom = forcedAim.zoom || 1;
  game.player.visual.gunMuzzleWorld(_v1);
  aim.gunMarker.copy(rig.aimPoint);
  refreshSpotFrame(); // SPOTTING WIRING: camo indicator in forced HUD stills
  hud.update(frameInfo);
  // Preserve the live sight-layout fields in deterministic screenshot views;
  // the recipe only carries scalar aim values.
  hud.forceAimDisplay({
    ...forcedAim,
    point: aim.point,
    gunMarker: aim.gunMarker,
    gunDistM: aim.gunDistM,
    gunTargetId: aim.gunTargetId,
    singleReticle: aim.singleReticle,
  });
}

// Capture recipes live in a demand-loaded engineering-only module.
window.__SHOTS = {
  views: [
    'battlefield', 'player_view', 'spectator_view', 'sniper_view', 'tank_closeup_modern',
    'tank_closeup_ww2', 'tank_closeup_t90m', 'tank_closeup_leo2a7',
    'detrack', 'combat_firing', 'explosion', 'garage',
    'battlefield_desert', 'battlefield_winter', 'battlefield_urban',
    'battlefield_coastal', 'battlefield_autumn', 'battlefield_steppe',
    'battlefield_railyard', // MAPS r1
    'battlefield_frontier', 'battlefield_fjord', 'battlefield_delta',
    'battlefield_badlands', 'battlefield_monsoon', 'battlefield_alpine',
    'battlefield_caldera', 'battlefield_foundry',
    'battlefield_ruinspires', 'battlefield_blackglass',
    'battlefield_titan_gorge', 'battlefield_skybridge',
    'killcam_xray', // KILL-CAM
  ],
  async set(name) {
    if (!this.views.includes(name)) throw new Error(`Unknown screenshot view: ${name}`);
    const shotViewsPromise = import('./dev/shotViews.js');
    // Deterministic authoring views can reference several families in one
    // synchronous recipe. This capture-only gate is deliberately exhaustive;
    // normal game, gallery and network flows remain per-id demand loaded.
    await Promise.all([
      shotViewsPromise,
      ensureFullFleet(),
      ensureFxRuntime(),
      ensureKillcamRuntime(),
      armorAimOverlay.preload(),
    ]);
    showroom.stop(); // reset drag/inertia before any deterministic shot recipe
    shotMode = true;
    perfHud.setCaptureHidden(true);
    // perf-governor r1: captures are a pixel contract — render untrimmed
    // (update(force) already redraws every cascade; this restores AO too).
    post.resetPerfTrims();
    shotHudFrame = false; // r5: recipes with a HUD frame re-latch this
    game.phase = 'shot';
    setGarageSpots(true); // shot staging keeps the boot-time light set
    zeroInputs();
    killcam.cancel(); // KILL-CAM: clear any staged/active replay (restores materials)
    await ensureShotWorld(VIEW_MAP[name] || 'verdant',
      name === 'killcam_xray' ? 'm1a2_sepv3' : 'm1a2'); // MAP-CONFIG WIRING
    const { createShotViews } = await shotViewsPromise;
    const recipe = createShotViews({
      hud, world, _v1, _v2, _v3, rig, DEG, forcedHudFrame,
      computeDispersionRadM, game, shellCards, scene, closeupStage, orbitPose,
      bus, fx, setPedestalTank, garage, garageDressing, showroom,
      mapEstablishingShot, tankPoseFromState, traceTank, createShell,
      resolveShellHit, createCombatState, mulberry32, VIEW_TIME, killcam,
    })[name];
    // Capture recipes bypass the battle transition. Warm only after the exact
    // deterministic roster/map has replaced any prior live round.
    warmCombatPipeline();
    // camo_spotting r2: garage shot keeps the neutral pedestal key; every
    // battlefield shot gets the authored map sun.
    setGarageSunTrim(name === 'garage');
    garage.hide();
    endOverlay.style.display = 'none';
    fx.resetAll();
    fx.resetSeed(5000);
    fx.setFrozen(true, VIEW_TIME[name]);
    if (world) world.setWindTime(VIEW_TIME[name]);
    await recipe();
    // Shot mode runs world.update with dt=0 (frozen), so the eased sniper
    // grass fade would never move — snap it to match the rig mode instead.
    // (r5: aim distance opens the scope-ray corridor to the staged target.)
    if (world) world.setSniperFade(rig.mode === 'SNIPER' ? 1 : 0, true, camera.fov, rig.aimDist);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    lighting.updateFrustums();
    lighting.update(true);
    lastFov = camera.fov;
  },
};

// ---------------------------------------------------------------------------
// Boot: garage first, warm the pipeline, then declare readiness.
// ---------------------------------------------------------------------------
// BOOT DEFERRAL seam: battle staging (and with it game.player) now happens on
// first world activation (ensureBattleStaged), not at boot — so prime the HUD
// cards from the SELECTED SPEC here. ensureBattleStaged re-primes from the
// real player entity when a battle actually stages.
buildShellCards(getSpec(selectedSpecId));
garage.show(selectedSpecId);
garageCameraPose(); // fallback pose until the orbit measures the hero
showroom.start();
setGarageSunTrim(true); // camo_spotting r2: boot lands on the garage screen
hud?.setMode('hidden');

// BOOT DEFERRAL seam: the battlefield build is deferred until BATTLE is
// pressed, so `world` is legitimately null on the garage boot path — the
// garage bay renders without it. When a world IS already active (harness
// staging a battlefield view before readiness), warm it as before.
if (world) {
  world.update(0, camera.position);
  updateDustAndSync();
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
// Deferred to post-ready idle; warmCombatPipeline() is idempotent and
// startBattle() runs it synchronously as a first-combat fallback if no idle
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
function resetCombatRoundWarmState() {
  if (_openingWarmGen) {
    try { _openingWarmGen.return(); } catch (_) { /* stale round cleanup */ }
  }
  if (_rareWarmGen) {
    try { _rareWarmGen.return(); } catch (_) { /* stale round cleanup */ }
  }
  _openingWarmGen = null;
  _rareWarmGen = null;
  combatOpeningWarmed = false;
  combatPipelineWarmed = false;
}

// Studio does not field the staged battle roster.  Reusing the complete
// combat warm here used to build, burn, compile, and shadow-warm every hidden
// battle tank before an empty authoring canvas could appear (7.0 s in the
// direct-route baseline).  Prime only the shared FX resources the Studio can
// use before its first actor exists; addActor() owns per-vehicle burn setup.
let studioPipelineWarmP = null;
let studioPipelineWarmed = false;
function warmStudioPipelineChunked(onProgress = null) {
  if (combatPipelineWarmed || studioPipelineWarmed) {
    if (onProgress) onProgress(1, 'Studio effects ready');
    return Promise.resolve();
  }
  if (studioPipelineWarmP) {
    return studioPipelineWarmP.then(() => {
      if (onProgress) onProgress(1, 'Studio effects ready');
    });
  }
  studioPipelineWarmP = (async () => {
    const yieldForLoad = createOpaqueLoadingYielder(10, 64);
    const trace = { stages: {} };
    const startedAt = performance.now();
    let markedAt = startedAt;
    const mark = (name) => {
      const now = performance.now();
      trace.stages[name] = Math.round(now - markedAt);
      markedAt = now;
    };
    const progress = (f, label) => {
      if (onProgress) onProgress(f, label);
    };
    progress(0.08, 'Baking Studio effects');
    try {
      // Preserve the exact deterministic atlases while letting the opaque
      // transition paint between bounded decode/bake checkpoints. One frame
      // per flipbook tile was needlessly slow; the shared scheduler only
      // yields after the current CPU slice actually exhausts its budget.
      if (fx.warmTexturesChunked) {
        await fx.warmTexturesChunked(yieldForLoad);
      } else {
        await fx.preloadTextures?.();
        fx.warmTextures?.();
      }
      mark('textures');
      progress(0.58, 'Priming Studio effects');
      await yieldForLoad(true);
      const wp = new THREE.Vector3(-460, 0, -460);
      const wn = new THREE.Vector3(0, 1, 0);
      const wd = new THREE.Vector3(0, 0, 1);
      fx.warmOpeningEffects(wp, wd, wn, 120);
      await yieldForLoad();
      fx.destruction(wp, null, 'shot');
      await yieldForLoad();
      fx.destruction(wp, null, 'ammorack');
      await yieldForLoad();
      fx.update(SIM_DT, [], camera);
      post.prepareSoftParticles();
      await yieldForLoad();
      const mask = camera.layers.mask;
      camera.layers.enable(fx.group.userData.softParticles?.layer ?? 30);
      try {
        const programSteps = initializeForwardProgramsSteps(fx.group);
        for (let result = programSteps.next(); !result.done; result = programSteps.next()) {
          await yieldForLoad();
        }
        fx.group.traverse((object) => {
          const materials = Array.isArray(object.material)
            ? object.material : (object.material ? [object.material] : []);
          for (const material of materials) {
            for (const key of Object.keys(material)) {
              const value = material[key];
              if (value?.isTexture) {
                try { renderer.initTexture(value); } catch (_) { /* first render fallback */ }
              }
            }
          }
        });
        await yieldForLoad(true);
      } finally {
        camera.layers.mask = mask;
      }
      mark('effects');
    } catch (error) {
      console.warn('[warm] Studio pipeline failed (continuing):', error);
      trace.error = String(error);
    } finally {
      fx.resetAll();
    }
    progress(1, 'Studio effects ready');
    trace.totalMs = Math.round(performance.now() - startedAt);
    studioPipelineWarmed = true;
    if (typeof window !== 'undefined') window.__STUDIO_WARM = trace;
  })();
  return studioPipelineWarmP;
}
// perf-r5 (owner: "first garage entry laggy"): the warm used to run as ONE
// idle callback (~1-3 s: volley + every wreck dance + all compiles) the
// moment the staged pump finished — exactly when the player starts touching
// the garage. Generator core with per-step yields; the sync wrapper (battle
// load / __SHOTS — the screen owns those frames) drains it whole, the
// chunked wrapper gives the garage a painted frame between steps. A battle
// entered mid-chunk simply drains the REMAINDER synchronously.
function drainGenerator(g) {
  let r = g.next();
  while (!r.done) r = g.next();
}
function warmCombatPipeline() {
  // Deterministic captures/debug entry need the exhaustive cache state before
  // their next synchronous frame. Player entry uses the two chunked wrappers
  // below so only opening-critical work owns the opaque transition.
  if (!combatOpeningWarmed) {
    const g = _openingWarmGen || warmCombatOpeningPipelineSteps();
    _openingWarmGen = null;
    drainGenerator(g);
  }
  if (!combatPipelineWarmed) {
    const g = _rareWarmGen || warmCombatRarePipelineSteps();
    _rareWarmGen = null;
    drainGenerator(g);
  }
}
async function warmGeneratorChunked(kind, factory, budgetMs, providedYielder) {
  let g = kind === 'opening' ? _openingWarmGen : _rareWarmGen;
  if (!g) {
    g = factory();
    if (kind === 'opening') _openingWarmGen = g;
    else _rareWarmGen = g;
  }
  const yieldForFrameBudget = providedYielder || createFrameBudgetYielder(budgetMs);
  for (;;) {
    const live = kind === 'opening' ? _openingWarmGen : _rareWarmGen;
    if (live !== g) return; // a synchronous capture/debug drain took over
    const r = g.next();
    if (r.done) {
      if (kind === 'opening' && _openingWarmGen === g) _openingWarmGen = null;
      if (kind === 'rare' && _rareWarmGen === g) _rareWarmGen = null;
      return;
    }
    await yieldForFrameBudget();
  }
}
function warmCombatOpeningPipelineChunked(budgetMs = 8, providedYielder = null) {
  if (combatOpeningWarmed && !_openingWarmGen) return Promise.resolve();
  return warmGeneratorChunked(
    'opening', warmCombatOpeningPipelineSteps, budgetMs, providedYielder,
  );
}
function warmCombatRarePipelineChunked(budgetMs = 6, providedYielder = null) {
  if (combatPipelineWarmed && !_rareWarmGen) return Promise.resolve();
  return warmGeneratorChunked(
    'rare', warmCombatRarePipelineSteps, budgetMs, providedYielder,
  );
}

/**
 * Put every combat effect class into its ordinary live pool just for the
 * covered deployment compile. This submits rare destruction shaders while
 * the opaque loader still suppresses scene rendering, so ANGLE can link them
 * in parallel with the existing shadow/forward warm instead of discovering
 * one 500+ ms program during the visible countdown. The returned cleanup is
 * synchronous and restores the exact camera/root/pool state.
 */
function stageCombatFxProgramSubmission() {
  // Use the covered deployment camera's field rather than a far map corner.
  // The private first-bind renderer still performs frustum culling; staging
  // off-camera submitted programs but left their material/state bind cold.
  const playerPos = game.player?.state?.pos;
  const wp = playerPos
    ? new THREE.Vector3(playerPos.x, playerPos.y + 1.4, playerPos.z + 4)
    : new THREE.Vector3(0, 2, 4);
  const wn = new THREE.Vector3(0, 1, 0);
  const wd = new THREE.Vector3(0, 0, 1);
  const priorMask = camera.layers.mask;
  const rootWasVisible = fx.group.visible;
  let staged = false;
  try {
    const gun = game.player?.spec?.gun;
    const shellSlot = game.player?.combat?.shellSlot ?? 0;
    const shellSpec = gun?.shells?.[shellSlot] || gun?.shells?.[0] || null;
    // Include the exact APFSDS sabot pool and a live tracer ribbon. Passing
    // an empty shell list here left their large dynamic attributes unallocated
    // until the player's first shot even though every other muzzle family had
    // been staged successfully.
    fx.warmOpeningEffects(wp, wd, wn, shellSpec?.caliberMm || 120);
    for (const kind of [
      'nonpen', 'ricochet', 'he_pen', 'he_splash', 'era', 'spaced_absorb',
    ]) fx.impact(kind, wp, wn, 120);
    fx.dust(wp, wd, 1);
    fx.exhaust(wp, 1, true);
    fx.destruction(wp, null, 'shot');
    fx.destruction(wp, null, 'ammorack');
    for (const kind of ['fence', 'wall', 'sandbag', 'truck', 'drumblast']) {
      fx.propBreak(kind, wp, wd, 1.5);
    }
    fx.propCrush(wp, wd, 7);
    const warmShells = [];
    if (shellSpec) {
      const warmShell = createShell(shellSpec, '__deployment_warm__', true, wp, wd, -1);
      warmShell.prevPos.copy(wp).addScaledVector(wd, -4);
      warmShell.pos.copy(wp).addScaledVector(wd, 4);
      warmShells.push(warmShell);
    }
    try { fx.update(0.016, warmShells, camera); } catch (_) { /* warm only */ }
    post.prepareSoftParticles();
    camera.layers.enable(fx.group.userData.softParticles?.layer ?? 30);
    fx.group.visible = true;
    staged = true;
  } catch (error) {
    console.warn('[warm] combat FX program staging failed (continuing):', error);
  }
  return {
    staged,
    restore() {
      fx.group.visible = rootWasVisible;
      camera.layers.mask = priorMask;
      fx.resetAll();
    },
  };
}

let deferredCombatWarmPromise = null;
function cancelDeferredCombatWarm() {
  if (_rareWarmGen) {
    try { _rareWarmGen.return(); } catch (_) { /* cancellation cleanup only */ }
    _rareWarmGen = null;
  }
  deferredCombatWarmPromise = null;
}
function scheduleDeferredCombatWarm(generation) {
  if (!Number.isFinite(generation) || generation !== battleWarmGeneration) {
    battleWarmPending = false;
    return Promise.resolve();
  }
  if (deferredCombatWarmPromise) return deferredCombatWarmPromise;
  const trace = { done: false, generation, stages: {} };
  if (typeof window !== 'undefined') window.__BATTLE_DEFERRED_WARM = trace;
  const startedAt = performance.now();
  const pending = (async () => {
    // Guarantee that the first battlefield frame and countdown numeral reach
    // the default framebuffer before any deferred atom starts.
    await nextFrame();
    if (generation !== battleWarmGeneration || game.phase !== 'battle') return;
    const visibleYield = createFrameBudgetYielder(6);
    const guardedYield = async (force = false) => {
      await visibleYield(force);
      if (generation !== battleWarmGeneration || game.phase !== 'battle') {
        const error = new Error('deferred combat warm cancelled');
        error.code = 'combat_warm_cancelled';
        throw error;
      }
    };
    // Enemies are filtered by spotting and cannot contribute a legal pixel at
    // deployment. Build/upload/compile their exact visuals during the frozen
    // countdown instead of extending the opaque roster screen. They remain
    // root-hidden after program submission until updateDustAndSync observes
    // a real spotting edge, so the optimization changes no rendered frame.
    const enemyVisualsStartedAt = performance.now();
    const enemyProgramBaseline = snapshotRendererPrograms(renderer);
    await streamBattleVisuals(
      (ent) => ent.team === 'enemy', guardedYield, null, true,
    );
    trace.enemyProgramUniformWarm = await warmNewRendererProgramUniforms(
      renderer,
      enemyProgramBaseline,
      guardedYield,
    );
    trace.stages.enemyVisuals = Math.round(performance.now() - enemyVisualsStartedAt);
    // The complete shipped FX atlases were installed under the opaque veil.
    // Bind the opening effect programs now, while controls and simulation are
    // still frozen; the one-second hold below guarantees first-shot fidelity.
    const openingFxStartedAt = performance.now();
    await warmCombatOpeningPipelineChunked(6, guardedYield);
    trace.stages.combatOpeningWarm = Math.round(performance.now() - openingFxStartedAt);
    const navigationStartedAt = performance.now();
    trace.navigationJobs = [];
    for (;;) {
      const jobStartedAt = performance.now();
      const consumed = prepareNextOpeningRoute(game);
      const jobMs = Math.round(performance.now() - jobStartedAt);
      if (!consumed) break;
      trace.navigationJobs.push(jobMs);
      await guardedYield();
    }
    // The exact first 70 m of each route must be in the fast terrain cache
    // before bots can move. Position tiles and the vegetation presentation
    // cache were already prepared under the opaque loader.
    await battleWarm.warmBattleTerrainTiles({
      game,
      world,
      yieldForBudget: guardedYield,
      primePresentation: false,
    });
    trace.stages.navigation = Math.round(performance.now() - navigationStartedAt);
    // Far terrain retains only its visible coarse mesh during map creation.
    // Previously its exact one-band lookahead baked every fourth playable
    // frame for the first 0.5-1.2 s after rollout (7-18 jobs depending on the
    // battlefield, each up to ~8.5 ms in the terrain benchmark). Build the
    // identical meshes one at a time during the frozen countdown instead.
    const terrainLookaheadStartedAt = performance.now();
    let terrainLookaheadJobs = 0;
    while (world?.warmTerrainLookahead?.(camera.position, 1) > 0) {
      terrainLookaheadJobs++;
      await guardedYield();
    }
    trace.stages.terrainLookahead = Math.round(
      performance.now() - terrainLookaheadStartedAt,
    );
    trace.terrainLookaheadJobs = terrainLookaheadJobs;
    await warmCombatRarePipelineChunked(6, guardedYield);
    if (typeof window !== 'undefined') {
      Object.assign(trace.stages, window.__COMBAT_RARE_WARM?.stages || {});
    }
    trace.done = true;
    trace.totalMs = Math.round(performance.now() - startedAt);
    trace.finishedAtPreBattleS = Number.isFinite(game.preBattleS) ? game.preBattleS : null;
    trace.doneBeforeRollout = game.phase === 'battle' && game.preBattleS > 0;
    devTrace?.mark('battle:deferred-warm-end', { totalMs: trace.totalMs });
  })().catch((error) => {
    if (error?.code !== 'combat_warm_cancelled') {
      trace.error = String(error);
      console.warn('[warm] deferred deployment warm failed (continuing):', error);
    } else {
      trace.cancelled = true;
    }
    trace.done = true;
    trace.doneBeforeRollout = false;
    if (generation !== battleWarmGeneration) cancelDeferredCombatWarm();
  }).finally(() => {
    if (generation === battleWarmGeneration) battleWarmPending = false;
    // A cancelled old round can settle after a rematch has already installed
    // its own queue. Never let that stale finally clear the new promise.
    const ownsSlot = deferredCombatWarmPromise === pending;
    if (ownsSlot) deferredCombatWarmPromise = null;
    if (typeof window !== 'undefined'
        && generation === battleWarmGeneration
        && (ownsSlot || window.__BATTLE_DEFERRED_WARM === trace)) {
      window.__BATTLE_DEFERRED_WARM = trace;
    }
  });
  deferredCombatWarmPromise = pending;
  return pending;
}
function* warmCombatOpeningPipelineSteps() {
  if (combatOpeningWarmed) return;
  const warmTrace = { stages: {} };
  const warmStartedAt = performance.now();
  let warmMarkedAt = warmStartedAt;
  const markWarmStage = (name) => {
    const now = performance.now();
    warmTrace.stages[name] = Math.round(now - warmMarkedAt);
    warmMarkedAt = now;
  };
  // LOADING PERF (boot r9): the particle sprite sheets bake lazily now (see
  // particles.js warmTextures) — they MUST be real before the fx texture
  // uploads below and before any battle/shot frame samples them. Idempotent.
  if (fx.warmTextures) fx.warmTextures();
  // PERF (performance_budget r3): boot builds only the player's visual —
  // finish the staged roster before anything renders the battlefield (this
  // runs synchronously from __SHOTS.set() and startBattle(), and from the
  // post-ready idle chunker below in the common garage-dwell case).
  while (!ensureStagedVisuals(game, 1)) yield;
  yield;
  markWarmStage('visuals');
  // Install the disarmed burn shader hook on the exact roster now; this is
  // cheap and makes the ordinary live materials compile against their final
  // cache keys. Per-spec char canvases and destroyed clones are deliberately
  // left to the bounded deployment-countdown pass below.
  for (const e of game.tanks) {
    if (e.visual && e.visual.prewarmBurn) e.visual.prewarmBurn();
  }
  markWarmStage('rosterHooks');
  const effectDetail = {};
  let effectDetailAt = performance.now();
  const markEffectDetail = (name) => {
    const now = performance.now();
    effectDetail[name] = Math.round(now - effectDetailAt);
    effectDetailAt = now;
  };
  markEffectDetail('start');
  // EVENT-SPIKE WARM part 2: fire one silent instance of every combat effect
  // family at a far map corner while the loading screen owns the frame — the
  // lazy sprite-atlas bakes (flash/fbm getImageData work inside particles.js)
  // and the per-effect-class program variants used to land on the FIRST real
  // impact/explosion/kill (441 / 609 ms worst frames measured). resetAll()
  // clears pools, decals, scorches, lights and timers, so nothing of the
  // volley survives; the scene compile below then owns the new programs.
  {
    const wp = new THREE.Vector3(-460, 0, -460);
    const wn = new THREE.Vector3(0, 1, 0);
    const wd = new THREE.Vector3(0, 0, 1);
    const fxRootWasVisible = fx.group.visible;
    // The staged effects are real live-pool objects. Keep their root hidden
    // between cooperative yields: otherwise the ordinary full-resolution
    // render loop can discover and bind a half-warmed particle program before
    // the private offscreen batches below, turning a harmless countdown yield
    // into one 200+ ms foreground frame. Private compile/render windows make
    // the root visible synchronously and restore it before yielding again.
    fx.group.visible = false;
    try {
      fx.muzzleFlash(wp, wd, 120);
      // Profiling showed the volley ran as one generator slice
      // (~1.1 s of garage-idle jank — every family's lazy sprite/atlas bake
      // in a single task). Yields between effect families; call order and
      // the trailing resetAll are unchanged (bake caches persist).
      yield;
      for (const kind of ['pen', 'nonpen', 'ricochet', 'he_pen', 'he_splash', 'era', 'spaced_absorb', 'terrain']) {
        fx.impact(kind, wp, wn, 120);
        yield;
      }
      fx.dust(wp, wd, 1);
      fx.exhaust(wp, 1, true);
      yield;
      markEffectDetail('openingEffects');
      // perf-r5c (owner: first shot still blips): the volley used to be
      // cleared WITHOUT ever rendering a frame — the fx materials' pipelines
      // (blending/depth state against the live targets) still bound for the
      // first time on the player's first real muzzle flash. One quarter-
      // viewport frame with the volley alive warms them for real.
      try { fx.update(0.016, game.shells, camera); } catch (_) { /* warm only */ }
      // Smoke/fire now lives on the dedicated late-FX layer so it can sample
      // resolved scene depth. Force that layer visible during the hidden warm
      // window: compile/bind every particle program and allocate both depth
      // targets before the first real shot, then restore the gameplay mask.
      const softParticlesAt = performance.now();
      post.prepareSoftParticles();
      effectDetail.softParticles = Math.round(performance.now() - softParticlesAt);
      const warmLayerMask = camera.layers.mask;
      camera.layers.enable(fx.group.userData.softParticles?.layer ?? 30);
      try {
        const before = (renderer.info.programs || []).length;
        const forwardAt = performance.now();
        // Never bulk-submit this effect family and yield before first bind.
        // ANGLE may accept all programs from compile(), then serialize their
        // completion into the next ordinary scene frame (7.1 s observed on a
        // cold Metal cache). The private render is the real first bind, so a
        // one-object cohort charges at most one material class to each warm
        // step and leaves no deferred linker queue for the presented frame.
        const warmRenderBatches = [];
        for (const batch of createIsolatedForwardWarmBatches({
          scene, root: fx.group, warmRender, cohortSize: 1,
        })) {
          warmRenderBatches.push(batch);
          yield;
        }
        const programs = renderer.info.programs || [];
        effectDetail.forwardPrograms = {
          added: Math.max(0, programs.length - before),
          wallMs: Math.round(performance.now() - forwardAt),
        };
        effectDetail.warmRenderBatches = warmRenderBatches;
        effectDetail.warmRender = warmRenderBatches.reduce(
          (sum, batch) => sum + batch.ms, 0,
        );
      } finally {
        camera.layers.mask = warmLayerMask;
      }
    } catch (err) {
      console.warn('[warm] fx volley failed (continuing):', err);
    } finally {
      fx.group.visible = fxRootWasVisible;
    }
    fx.resetAll();
  }
  warmTrace.effectDetail = effectDetail;
  markWarmStage('effects');
  if (!fx.group.userData.battleTexturesStaged) {
    fx.group.traverse((o) => {
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      for (const m of mats) {
        for (const k of Object.keys(m)) {
          const v = m[k];
          if (v && v.isTexture) { try { renderer.initTexture(v); } catch (_) { /* fine */ } }
        }
      }
    });
  }
  yield;
  markWarmStage('textures');
  combatOpeningWarmed = true;
  warmTrace.totalMs = Math.round(performance.now() - warmStartedAt);
  if (typeof window !== 'undefined') window.__COMBAT_OPENING_WARM = warmTrace;
}

/**
 * Bind the rare destruction and crush pools once through the real lit forward
 * path. This owner is renderer-lifetime state: resetAll removes every staged
 * particle, while the programs and GPU buffers remain valid across rounds.
 */
function* warmCombatDestructionEffectSteps() {
  if (combatDestructionEffectsWarmed) return { cached: true, totalMs: 0, batches: 0 };
  const startedAt = performance.now();
  const playerPos = game.player?.state?.pos;
  const wp = playerPos
    ? new THREE.Vector3(playerPos.x, playerPos.y + 1.4, playerPos.z + 4)
    : new THREE.Vector3(0, 2, 4);
  _v3.set(1, 0, 0);
  const fxRootWasVisible = fx.group.visible;
  let batches = 0;
  let maxBatchMs = 0;
  let error = null;
  fx.group.visible = false;
  try {
    fx.destruction(wp, null, 'shot');
    yield;
    fx.destruction(wp, null, 'ammorack');
    yield;
    for (const kind of ['fence', 'wall', 'sandbag', 'truck', 'drumblast']) {
      fx.propBreak(kind, wp, _v3, 1.5);
      yield;
    }
    fx.propCrush(wp, _v3, 7);
    yield;
    try { fx.update(0.016, game.shells, camera); } catch (_) { /* warm only */ }
    post.prepareSoftParticles();
    const mask = camera.layers.mask;
    camera.layers.enable(fx.group.userData.softParticles?.layer ?? 30);
    try {
      for (const batch of createIsolatedForwardWarmBatches({
        scene, root: fx.group, warmRender, cohortSize: 1,
      })) {
        batches += 1;
        maxBatchMs = Math.max(maxBatchMs, batch.ms);
        yield batch;
      }
    } finally {
      camera.layers.mask = mask;
    }
  } catch (cause) {
    error = cause;
    console.warn('[warm] combat destruction variants failed (continuing):', cause);
  } finally {
    fx.group.visible = fxRootWasVisible;
    fx.resetAll();
  }
  if (!error) combatDestructionEffectsWarmed = true;
  return {
    cached: false,
    batches,
    maxBatchMs,
    totalMs: Math.round(performance.now() - startedAt),
    error: error ? String(error) : null,
  };
}

/**
 * Full-quality but non-opening combat variants. Nothing here changes what a
 * kill, de-track, crush, prop break, or hidden LOD looks like; it changes only
 * when their one-time canvases/programs are prepared. The player path runs
 * this generator in small slices during the frozen five-second deployment
 * countdown and holds at one second if it somehow has not finished. Thus rare
 * work leaves the opaque loader without leaking into live controls.
 */
function* warmCombatRarePipelineSteps() {
  if (combatPipelineWarmed) return;
  if (!combatOpeningWarmed) yield* warmCombatOpeningPipelineSteps();
  const rareTrace = { stages: {} };
  const startedAt = performance.now();
  let markedAt = startedAt;
  const mark = (name) => {
    const now = performance.now();
    rareTrace.stages[name] = Math.round(now - markedAt);
    markedAt = now;
  };

  // A wreck or armor scar cannot appear during the frozen deployment
  // countdown. Prepare their exact full-quality variants here instead of
  // charging every fielded family to the opaque roster screen. The countdown
  // already holds at one second until this generator finishes, so live combat
  // keeps the same first-hit/first-kill guarantees without the extra entry
  // latency.
  yield* warmDestroyedRosterVariantsSteps();
  mark('wreckVariants');
  for (const e of game.tanks) {
    if (!e.visual || !e.visual.root || !e.state) continue;
    _v1.copy(e.state.pos);
    _v1.y += (e.spec && e.spec.dims ? e.spec.dims.heightM : 2.4) * 0.5;
    _v2.set(0, 0, 1);
    try { fx.armorScar(e.visual, _v1, _v2, 100); } catch (_) { /* warm only */ }
    yield;
  }
  mark('armorScars');

  // Destruction and crush families are renderer-lifetime resources. The
  // opaque transition normally owns this exact generator before countdown;
  // the yield* remains a safe fallback for debug/direct-entry paths.
  yield* warmCombatDestructionEffectSteps();
  mark('destructionEffects');

  warmWreckTextures(renderer);
  fx.group.traverse((o) => {
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const material of mats) {
      for (const key of Object.keys(material)) {
        const value = material[key];
        if (value?.isTexture) {
          try { renderer.initTexture(value); } catch (_) { /* first render fallback */ }
        }
      }
    }
  });
  yield;
  mark('textures');

  yield* warmShadowProgramSteps();
  mark('shadows');
  rareTrace.hiddenDetail = {};
  yield* compileHiddenVariantsSteps(rareTrace.hiddenDetail);
  mark('hiddenVariants');
  combatPipelineWarmed = true;
  rareTrace.totalMs = Math.round(performance.now() - startedAt);
  if (typeof window !== 'undefined') {
    window.__COMBAT_RARE_WARM = rareTrace;
    window.__COMBAT_WARM = {
      opening: window.__COMBAT_OPENING_WARM || null,
      rare: rareTrace,
      totalMs: (window.__COMBAT_OPENING_WARM?.totalMs || 0) + rareTrace.totalMs,
    };
  }
}

/**
 * Prepare the per-round destroyed material clones and burnt canvases while the
 * opaque loader owns the frame. Live and node-hidden variants are compiled by
 * the bounded rare pass below after the first deployment frame is visible.
 */
// Sustained-battle profiling contract:
// renderer.compile builds FORWARD programs only — shadow-DEPTH variants link
// lazily on each caster class's first shadow-pass render, which lands
// mid-fight the moment the player drives a baked wreck / prop cluster into
// a CSM cascade (TankWreckShadowProxy + 10 anonymous classes, 100-300 ms
// blocking links, worst 207 ms task on the REAL loading-path entry). One
// warm frame with the far cascade's shadow camera stretched over the whole
// map renders every caster into the depth pass behind the loading screen.
// Reuses the EXISTING sun cascade: adding a throwaway shadow light would
// change the light count and recompile every lit program (kill-cam warm
// rig lesson — see killcam.js LIGHT-COUNT note).
function* warmShadowProgramSteps() {
  const csm = lighting && lighting.csm;
  const light = csm && csm.lights && csm.lights[csm.lights.length - 1];
  if (!light || !light.shadow) return;
  // Each isolated root/cohort below exists only to submit a distinct caster
  // class through ONE stretched depth cascade. The near cascades normally
  // auto-refresh every render, so leaving them armed made every warm slice
  // redraw the same near-field depth maps again (four cascades × every root)
  // even though no new near-cascade program could result. Keep the lights and
  // shadow count intact for the forward program key, but park sibling shadow
  // updates until the warm is complete. Live rendering restores and refreshes
  // every cascade immediately afterward.
  const siblingShadowState = [];
  for (const sibling of csm.lights) {
    if (sibling === light || !sibling.shadow) continue;
    siblingShadowState.push({
      shadow: sibling.shadow,
      autoUpdate: sibling.shadow.autoUpdate,
    });
    sibling.shadow.autoUpdate = false;
    sibling.shadow.needsUpdate = false;
  }
  const cam = light.shadow.camera;
  const save = {
    left: cam.left, right: cam.right, top: cam.top, bottom: cam.bottom,
    near: cam.near, far: cam.far, auto: light.shadow.autoUpdate,
  };
  cam.left = -520; cam.right = 520; cam.top = 520; cam.bottom = -520;
  cam.near = 0.5; cam.far = 1600;
  cam.updateProjectionMatrix();
  light.shadow.autoUpdate = false;
  const lightRoots = new Set();
  for (const candidate of scene.children) {
    let ownsLight = false;
    candidate.traverse((object) => { if (object.isLight) ownsLight = true; });
    if (ownsLight) lightRoots.add(candidate);
  }
  const contentRoots = scene.children.filter((candidate) =>
    candidate.visible !== false && !candidate.isCamera && !lightRoots.has(candidate));
  const renderRoot = (root, visibleChildren = null) => {
    const hiddenRoots = [];
    const hiddenChildren = [];
    for (const candidate of contentRoots) {
      if (candidate === root || candidate.visible === false) continue;
      candidate.visible = false;
      hiddenRoots.push(candidate);
    }
    if (visibleChildren) {
      for (const child of root.children) {
        if (visibleChildren.has(child) || child.visible === false) continue;
        child.visible = false;
        hiddenChildren.push(child);
      }
    }
    try {
      light.shadow.needsUpdate = true;
      warmRender();
    } catch (_) { /* warm only */ }
    finally {
      for (const child of hiddenChildren) child.visible = true;
      for (const candidate of hiddenRoots) candidate.visible = true;
    }
  };
  try {
    for (const root of contentRoots) {
      // World roots contain terrain, vegetation, structures, props and
      // dressing. Submit those in four independent passes so no single GPU
      // call owns every caster/program variant at once. Other top-level roots
      // (tank actors, FX, garage dressing) are already naturally bounded.
      if (root === world?.group && root.children.length > 1) {
        const visible = root.children.filter((child) => child.visible !== false);
        const cohortSize = Math.max(1, Math.ceil(visible.length / 4));
        for (let index = 0; index < visible.length; index += cohortSize) {
          renderRoot(root, new Set(visible.slice(index, index + cohortSize)));
          yield;
        }
      } else {
        renderRoot(root);
        yield;
      }
    }
  } finally {
    cam.left = save.left; cam.right = save.right;
    cam.top = save.top; cam.bottom = save.bottom;
    cam.near = save.near; cam.far = save.far;
    cam.updateProjectionMatrix();
    light.shadow.autoUpdate = save.auto;
    light.shadow.needsUpdate = true; // real cascade re-renders next frame
    for (const state of siblingShadowState) {
      state.shadow.autoUpdate = state.autoUpdate;
      // A warm may have overlapped a forced refresh edge. Always request one
      // real map after restoring so the optimization cannot expose stale CSM.
      state.shadow.needsUpdate = true;
    }
  }
}

// perf-r5c/r6: warm renders only need to TOUCH programs/textures — full-frame
// rasterization at retina scale made each one a 400-730 ms slice, and even a
// quarter-size target could exceed 800 ms when an ANGLE GPU process was busy.
// An eighth-size target exercises the identical material, texture, depth and
// render-target paths at one sixteenth of the old fragment bill.
// Render it into a private HDR
// target. The old default-framebuffer quarter viewport could be presented
// during the live countdown when a first-use compile blocked the next rAF,
// producing a one-off black screen with the world in the lower-left corner.
const warmRender = createOffscreenSceneWarmer(renderer, scene, camera, 0.125);
// A camera whose frustum contains no battlefield geometry lets WebGLRenderer
// execute the real CSM depth pass without also paying the forward scene pass.
// This is used only behind the opaque deployment transition; the CSM light
// cameras and their exact maps still come from the live battle camera.
const shadowOnlyWarmCamera = new THREE.PerspectiveCamera(1, 1, 0.5, 2);
shadowOnlyWarmCamera.position.set(100000, 100000, 100000);
shadowOnlyWarmCamera.lookAt(100000, 100000, 100001);
shadowOnlyWarmCamera.updateMatrixWorld(true);
const shadowOnlyWarmRender = createOffscreenSceneWarmer(
  renderer, scene, shadowOnlyWarmCamera, 0.0625,
);
// One unlit override uploads the exact visible vertex/index/instance buffers
// without serializing the fleet's many production material programs. The
// subsequent real render keeps every original material and visual feature.
const deploymentUploadMaterial = new THREE.MeshBasicMaterial({
  color: 0x000000,
  colorWrite: false,
  depthWrite: false,
  depthTest: false,
  fog: false,
  toneMapped: false,
});
deploymentUploadMaterial.name = 'DeploymentBufferUpload';

function deploymentShadowCasterBatches() {
  const casters = [];
  const lods = [];
  scene.traverseVisible((object) => {
    if (object.isLOD) {
      // Pin the same LOD the live deployment camera would select. Rendering
      // with the off-map camera below must not flip the visible child set.
      try { object.update(camera); } catch (_) { /* best-effort warm */ }
      lods.push({ object, autoUpdate: object.autoUpdate });
      object.autoUpdate = false;
    }
    if (!(object.isMesh || object.isLine || object.isPoints) || !object.castShadow) return;
    if (!object.layers.test(camera.layers)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (!materials.some((material) => material?.visible !== false)) return;
    const geometry = object.geometry;
    const vertices = geometry?.index?.count
      || geometry?.attributes?.position?.count || 1;
    const instances = object.isInstancedMesh ? Math.max(1, object.count || 0) : 1;
    // First use is dominated by geometry/instance-buffer upload and depth
    // program binding, not rasterized instance count. This estimate keeps
    // both data volume and draw count bounded without splitting an
    // InstancedMesh (which would change the actual caster representation).
    const weight = vertices + instances * 16 + 2000;
    casters.push({ object, weight });
  });

  const batches = [];
  let batch = [];
  let weight = 0;
  for (const caster of casters) {
    if (batch.length && (batch.length >= 12 || weight + caster.weight > 45000)) {
      batches.push(batch);
      batch = [];
      weight = 0;
    }
    batch.push(caster.object);
    weight += caster.weight;
  }
  if (batch.length) batches.push(batch);
  return { casters, batches, lods };
}

/**
 * Render the exact deployment CSM maps one cascade per covered frame. The
 * first full battlefield frame then reuses those maps, so CSM depth, the main
 * scene and the post chain never collapse into one long transition task.
 * Shadow count, resolution, camera fit, and live refresh cadence are unchanged.
 */
async function primeDeploymentShadowMaps(yieldForBudget) {
  const lights = lighting?.csm?.lights || [];
  if (!lights.length) return { cascades: 0, totalMs: 0, maxMs: 0 };
  const prior = lights.map((light) => ({
    shadow: light.shadow,
    autoUpdate: light.shadow.autoUpdate,
    needsUpdate: light.shadow.needsUpdate,
  }));
  const startedAt = performance.now();
  const cascadeMs = [];
  const casterBatchMs = [];
  let geometryUploadMs = 0;
  let primed = false;
  let casterState = null;
  try {
    camera.updateMatrixWorld(true);
    lighting.updateFov();
    lastFov = camera.fov;
    lighting.update(true, SIM_DT);
    for (const light of lights) {
      light.shadow.autoUpdate = false;
      light.shadow.needsUpdate = false;
    }

    // Upload all opening-view geometry through one cheap shader before any
    // production material is drawn. This keeps buffer initialization out of
    // the first full CSM + forward frame while preserving the exact meshes,
    // materials and post-processing used for the handoff frame.
    const priorOverrideMaterial = scene.overrideMaterial;
    const geometryUploadAt = performance.now();
    try {
      scene.overrideMaterial = deploymentUploadMaterial;
      warmRender();
    } finally {
      scene.overrideMaterial = priorOverrideMaterial;
    }
    geometryUploadMs = Math.round(performance.now() - geometryUploadAt);
    if (yieldForBudget) await yieldForBudget(true);

    // The first complete cascade used to discover every depth program and
    // upload every caster buffer in one 0.7-1.0 s task. Submit the identical
    // casters to the exact first cascade in bounded shadow-only batches, then
    // redraw the full map once after all resources are resident. The partial
    // maps are never presented and no visual/shadow quality setting changes.
    casterState = deploymentShadowCasterBatches();
    const firstLight = lights[0];
    for (const { object } of casterState.casters) object.castShadow = false;
    shadowOnlyWarmCamera.layers.mask = camera.layers.mask;
    for (const batch of casterState.batches) {
      for (const object of batch) object.castShadow = true;
      firstLight.shadow.needsUpdate = true;
      const batchAt = performance.now();
      shadowOnlyWarmRender();
      casterBatchMs.push(Math.round(performance.now() - batchAt));
      firstLight.shadow.needsUpdate = false;
      for (const object of batch) object.castShadow = false;
      if (yieldForBudget) await yieldForBudget(true);
    }
    for (const { object } of casterState.casters) object.castShadow = true;

    for (const light of lights) {
      light.shadow.needsUpdate = true;
      const cascadeAt = performance.now();
      shadowOnlyWarmRender();
      cascadeMs.push(Math.round(performance.now() - cascadeAt));
      light.shadow.needsUpdate = false;
      if (yieldForBudget) await yieldForBudget(true);
    }
    lighting.preservePrimedCascadesForNextFrame();
    for (const { object, autoUpdate } of casterState.lods) object.autoUpdate = autoUpdate;
    primed = true;
  } finally {
    if (casterState) {
      for (const { object } of casterState.casters) object.castShadow = true;
      for (const { object, autoUpdate } of casterState.lods) object.autoUpdate = autoUpdate;
    }
    if (!primed) {
      for (const state of prior) {
        state.shadow.autoUpdate = state.autoUpdate;
        state.shadow.needsUpdate = state.needsUpdate;
      }
    }
  }
  return {
    cascades: cascadeMs.length,
    cascadeMs,
    maxMs: cascadeMs.length ? Math.max(...cascadeMs) : 0,
    casterCount: casterState?.casters.length || 0,
    casterBatches: casterBatchMs.length,
    casterBatchMs,
    casterBatchMaxMs: casterBatchMs.length ? Math.max(...casterBatchMs) : 0,
    geometryUploadMs,
    totalMs: Math.round(performance.now() - startedAt),
  };
}

// WebGLRenderer.compile() intentionally stops before uniform
// discovery. The next real render then calls WebGLProgram.getUniforms() for
// every newly linked program in one queue flush; 0.2 ms profiles attributed
// 1301-1466 ms of the garage warm to that exact WebGLUniforms/onFirstUse
// stack. Three's official compileAsync path was falsified on the measured
// ANGLE driver because COMPLETION_STATUS_KHR itself blocked for 10.34 s.
// Fall back to the same Three program objects, but consume each newly-created
// forward variant separately and yield before creating the next. The final
// warmRender still owns real texture/state/depth initialization.
function* initializeForwardProgramsSteps(root = scene, stats = null) {
  let sliceAt = performance.now();
  const objects = [];
  root.traverseVisible((object) => {
    if (object.isMesh || object.isPoints || object.isLine || object.isSprite) objects.push(object);
  });
  for (const object of objects) {
    const before = (renderer.info.programs || []).length;
    const compileAt = performance.now();
    try { compileForGameplayTarget(object); } catch (_) { /* warm only */ }
    if (stats) {
      const compileMs = performance.now() - compileAt;
      stats.totalCompileMs = (stats.totalCompileMs || 0) + compileMs;
      if (compileMs > (stats.maxCompileMs || 0)) {
        stats.maxCompileMs = compileMs;
        stats.maxCompileObject = object.name || object.type || '(unnamed)';
      }
    }
    const programs = renderer.info.programs || [];
    for (let i = before; i < programs.length; i++) {
      try { programs[i].getUniforms(); } catch (_) { /* warm only */ }
      yield;
      sliceAt = performance.now();
    }
    if (performance.now() - sliceAt >= 8) {
      yield;
      sliceAt = performance.now();
    }
  }
}

let _linkExtMain;
function* linkerBreathingSlices(maxSlices) {
  try {
    const gl = renderer.getContext();
    if (_linkExtMain === undefined) {
      _linkExtMain = gl.getExtension('KHR_parallel_shader_compile') || null;
    }
    if (!_linkExtMain) return;
    let cursor = 0;
    for (let i = 0; i < maxSlices; i++) {
      const progs = renderer.info.programs || [];
      let pending = false;
      for (; cursor < progs.length; cursor++) {
        const pr = progs[cursor];
        if (pr && pr.program
          && gl.getProgramParameter(pr.program, _linkExtMain.COMPLETION_STATUS_KHR) === false) {
          pending = true;
          break;
        }
      }
      if (!pending) return;
      yield;
    }
  } catch (_) { /* best-effort — the render below still resolves links */ }
}

function* warmDestroyedRosterVariantsSteps() {
  const gameplayTarget = post?.composer?.renderTarget1 || null;
  for (const entity of game.tanks.slice()) {
    const visual = entity?.visual;
    if (!visual?.root || !visual.setDestroyed || !visual.resetDestroyed) continue;
    try { yield* prebakeBurntSteps(entity.specId, engineCtx.anisotropy ?? 4); } catch (_) { /* warm only */ }
    const rootWasVisible = visual.root.visible;
    const targetBefore = renderer.getRenderTarget();
    try {
      visual.setDestroyed({ pop: true, ageS: 0 });
      visual.root.visible = true;
      if (gameplayTarget) renderer.setRenderTarget(gameplayTarget);
      const before = (renderer.info.programs || []).length;
      renderer.compile(visual.root, camera, scene);
      const programs = renderer.info.programs || [];
      for (let i = before; i < programs.length; i++) {
        try { programs[i].getUniforms(); } catch (_) { /* warm only */ }
      }
    } catch (_) { /* warm only */ }
    finally {
      renderer.setRenderTarget(targetBefore);
      try { visual.resetDestroyed(); } catch (_) { /* warm only */ }
      visual.root.visible = rootWasVisible;
    }
    if (visual.setTrackState) {
      try {
        visual.setTrackState('trackL', true);
        visual.setTrackState('trackL', false);
      } catch (_) { /* warm only */ }
    }
    yield;
  }
}

function* compileHiddenVariantsSteps(detail = null) {
  // renderer.compile does not traverse visible:false subtrees
  // (three's projectObject early-out — the old comment claiming otherwise
  // was wrong), so non-active LOD levels and node-hidden addons never
  // compiled here and linked mid-battle on their first distance flip (the
  // This stage previously owned the last per-fight task above 100 ms.
  // r4/r5: hidden LOD meshes + kit decor). Force-visible window
  // around each compile, then restore.
  const compileAll = function* (root) {
    const objects = [];
    root.traverse((object) => {
      if (object.isMesh || object.isPoints || object.isLine || object.isSprite) objects.push(object);
    });
    const gameplayTarget = post?.composer?.renderTarget1 || null;
    let sliceAt = performance.now();
    for (const object of objects) {
      const wasVisible = object.visible;
      const priorTarget = renderer.getRenderTarget();
      try {
        object.visible = true;
        if (gameplayTarget) renderer.setRenderTarget(gameplayTarget);
        const before = (renderer.info.programs || []).length;
        renderer.compile(object, camera, scene);
        const programs = renderer.info.programs || [];
        for (let i = before; i < programs.length; i++) {
          try { programs[i].getUniforms(); } catch (_) { /* warm only */ }
        }
      } catch (_) { /* warm only */ }
      finally {
        renderer.setRenderTarget(priorTarget);
        object.visible = wasVisible;
      }
      if (performance.now() - sliceAt >= 6) {
        yield;
        sliceAt = performance.now();
      }
    }
  };
  for (const e of game.tanks) {
    if (!e.visual || !e.visual.root) continue;
    try {
      yield* compileAll(e.visual.root);   // live + node-hidden materials
    } catch (_) { /* warm only */ }
    yield; // one compile pass per slice
  }
  // perf-r4a (play-session rematch rows): this function compiled every TANK
  // subtree but never the WORLD group — and the real render below runs from
  // the garage-side camera, so world materials culled from that view
  // (grass-wind chunks, baked prop pools, wreck shadow proxies) linked their
  // programs on the first battle frame from the spawn view instead.
  // renderer.compile() is frustum-independent for color programs: one walk
  // of the world group links them all here, behind the loading screen.
  if (world && world.group) {
    try { yield* compileAll(world.group); } catch (_) { /* warm only */ }
    yield;
    // perf-r5c (retina probe: one slice resolved 55 links at once, 653 ms):
    // give the driver's parallel linker breathing slices before any warm
    // render binds the new programs. The local KHR poll uses an early-exit
    // cursor and is bounded
    // so a linker that never reports done cannot stall the warm.
    yield* linkerBreathingSlices(40);
  }
  // perf-r2d: renderer.compile() never builds SHADOW-PASS depth programs —
  // they link the first time a mesh's material class actually renders into a
  // cascade (the ±1-flag program pairs the spike probe kept catching on
  // reveals). One REAL render with every tank root + node-hidden addon mesh
  // forced visible and all cascades marked dirty links them here, behind the
  // loading screen, in a single hidden frame.
  {
    // perf-r5b (owner: "first load in battle is super laggy"): the four warm
    // renders used to run as ONE atomic slice inside the force-visible
    // window — 300-800 ms at retina scale, and the countdown re-warm runs
    // with the screen LIVE. Each render is now its own slice; the addon
    // force-visible flips apply and revert INSIDE each slice, so no
    // presented frame ever shows a hidden addon.
    const flips = [];
    const collectFlips = () => {
      flips.length = 0;
      for (const e of game.tanks) {
        if (!e.visual || !e.visual.root) continue;
        e.visual.root.traverse((o) => {
          if (o.visible === false) { flips.push(o); o.visible = true; }
        });
      }
    };
    const unflip = () => { for (const o of flips) o.visible = false; };
    try {
      collectFlips();
      if (lighting && lighting.updateFrustums) lighting.updateFrustums();
      const renderAt = performance.now();
      warmRender();
      if (detail) detail.baseRenderMs = Math.round(performance.now() - renderAt);
      unflip();
    } catch (_) { unflip(); }
    yield;
    // perf-r2e: the FIRST sniper zoom paid a ~230 ms one-off with ZERO new
    // programs — FOV-dependent lazy work (vegetation repartition against
    // the narrow frustum). Render two hidden frames at scope FOVs so that
    // work lands here instead of on the first Shift press.
    for (const f of [20, 8]) {
      try {
        collectFlips();
        const fov0 = camera.fov;
        camera.fov = f;
        camera.updateProjectionMatrix();
        if (lighting && lighting.updateFrustums) lighting.updateFrustums();
        const renderAt = performance.now();
        warmRender();
        if (detail) detail[`scope${f}RenderMs`] = Math.round(performance.now() - renderAt);
        camera.fov = fov0;
        camera.updateProjectionMatrix();
        unflip();
      } catch (_) { unflip(); }
      yield;
    }
    // The opaque entry path now presents and records the exact deployment
    // camera before this deferred pass starts. Re-rendering a synthetic spawn
    // pose here was duplicate work and the last 50-90 ms countdown task.
    if (lighting && lighting.updateFrustums) lighting.updateFrustums();
  }
}
// Heavy combat caches intentionally do not warm in the interactive garage or
// the Studio. Battles own the complete roster/wreck/shadow warm; Studio uses
// the focused shared-FX warm above and compiles only actors it actually adds.

// SCENE STUDIO (staging rig + scripted marketing-shot API, src/game/studio.js):
// entered via ?studio=1 (map via ?map=…) or F8 from the garage; scriptable via
// window.__STUDIO (schema in docs/STUDIO.md). main.js only hands it these
// integration seams plus the one tick() branch above — entry keys, panel,
// actors, effects, capture all live in the studio module.
let studio = { active: false, tick() {} };
let studioModulePromise = null;
let studioRuntimePromise = null;
function preloadStudioModule() {
  if (!studioModulePromise) {
    const request = import('./game/studio.js');
    studioModulePromise = request;
    request.catch(() => {
      if (studioModulePromise === request) studioModulePromise = null;
    });
  }
  return studioModulePromise;
}

function preloadStudioIntent() {
  preloadStudioModule().catch(() => null);
  preloadFxModule().catch(() => null);
}

async function loadStudioRuntime() {
  if (studioRuntimePromise) return studioRuntimePromise;
  lighting.setFarCascadeDormant(false);
  studioRuntimePromise = Promise.all([
    preloadStudioModule(),
    ensureFxRuntime(),
  ]).then(([{ createStudio }]) => {
    window.removeEventListener('keydown', lazyStudioKeyDown, true);
    studio = createStudio({
      renderer, scene, camera, post, lighting, fx, game, hud, garage, showroom,
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
    });
    return studio;
  }).catch((error) => {
    studioRuntimePromise = null;
    throw error;
  });
  return studioRuntimePromise;
}

function lazyStudioKeyDown(event) {
  if (event.code !== 'F8' || event.repeat || game.phase !== 'garage') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  loadStudioRuntime()
    .then((runtime) => runtime.enter())
    .catch((error) => console.error('[studio] lazy entry failed', error));
}

if (!STUDIO_BOOT_INTENT) {
  // Capture owns the first F8/navigation click until the Studio chunk exists;
  // createStudio installs the permanent toggle listener after import.
  window.addEventListener('keydown', lazyStudioKeyDown, true);
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
queueWorldPrefetch(pendingMapChoice);
scheduleRaf();

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
    resetPresentationPoses: resetSoloPresentationPoses,
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
  await perfHud.preload().catch((error) => {
    console.warn('[diagnostics] optional engineering runtime failed to load', error);
  });
}
const collectDebugTelemetry = () => perfHud.collectTelemetry();
const sampleShadowContribution = () => perfHud.sampleShadowContribution();

window.__DEBUG = {
  scene, camera, renderer, post, lighting, game, rig, bus,
  get fx() { return fx; },
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
  get pedestalVisual() { return pedestalVisual; },
  get pedestalOnStage() { return onStage(pedestalVisual); },
  // switch-desync r1: the id the garage UI (stats card / card highlight)
  // believes is selected — probes assert pedestalVisual.specId === this.
  get selectedSpecId() { return selectedSpecId; },
  get pedestalCacheIds() { return [...pedestalCache.keys()]; },
  get worldCacheIds() { return [...worldCache.keys()]; },
  get residentLimits() { return { ...residentLimits }; },
  get battleVisualPool() { return battleVisualPool.stats(); },
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
    return setPedestalTank(id, true);
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
  beginNetworkBattle,
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
queuePedestalTexturePrefetch();
if (!STUDIO_BOOT_INTENT) scheduleGarageDressingBuild();
window.__BOOT_TIMINGS = BOOT_TIMINGS;
window.__BOOT_MS = Math.round(performance.now() - BOOT_T0);
// Direct Studio navigation skips garage-only construction on the critical
// path. Build the workshop shell while idle; enterGarage() resumes the normal
// quiet set-piece stream if the user later leaves Studio for the garage.
if (STUDIO_BOOT_INTENT) {
  requestQuietIdle(async () => {
    await garageDressing.pump();
    if (!pedestalVisual) await setPedestalTank(selectedSpecId, true);
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
