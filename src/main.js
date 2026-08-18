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
import { createOffscreenSceneWarmer } from './engine/offscreenWarm.js';
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
import { createMap, createMapAsync } from './world/map.js';
// DESTRUCTIBLES r1: prop-destruction bus seam (audio subscribes to the event)
import { setDestroyedEventSink } from './world/destructibles.js';
import { MAP_IDS, getMapConfig, resolveMapId } from './world/maps/index.js';
import { MAP_THUMBS } from './ui/mapThumbs.js';
import { ALL_TANK_IDS, getSpec } from './vehicles/specs.js';
import { createTank } from './vehicles/tankFactory.js';
// CAMO WIRING: pattern persistence + live repaint (garage picker, AUTO biome)
import {
  CAMO_PATTERN_IDS, CAMO_PATTERN_LABEL, getCamoSelection, setCamoSelection,
  getCustomCamoSelection, setCustomCamoSelection, getMultiplayerCamoSelection,
  setCamoBiome, applyCamoPatterns, applyCamoPatternsChunked, clearCamoOverrides, warmWreckTextures,
  prebakeSharedTextures, prebakeBurntSteps,
  upgradeSharedTexturesChunked,
} from './vehicles/materials.js';
import { computeDispersionRadM, shotRecoilScale, SIM_DT } from './sim/movement.js';
import { tankPoseFromState, queryAimArmor, traceTank } from './sim/armor.js';
import {
  estimatePenRatio, selectShell, resolveShellHit, createCombatState, repairAllModules,
} from './sim/damage.js';
import { createShell } from './sim/ballistics.js';
import { createKillCam } from './game/killcam.js';
import { createFx } from './fx/effects.js';
import { initHud } from './ui/hud.js';
import { createDamagePanel } from './ui/damagePanel.js';
// damage panel r9: the panel's top-down plan layers are offscreen renders of
// the ACTUAL built vehicle — the rig needs the shared engine context once.
import { initTopMaskRig } from './ui/tankThumbs.js';
import { createGarage } from './ui/garage.js';
import { getLastBattleRecord, installBattleRecords } from './game/profile.js';
import { createGarageStage } from './ui/garageStage.js';
// garage-scene r1: workshop set dressing (side repair bays, benches, racks) —
// built lazily from post-ready idle slices, never on the boot-critical path.
import { createGarageDressing } from './game/garageDressing.js';
// FEEL r12: corner fps / frame-time / stall overlay (owner order)
import { createPerfHud } from './ui/perfHud.js';
import { createAudio } from './audio/audio.js';
import { createInput } from './game/input.js';
import { isGarageVisibleTankId } from './game/matchmaking.js';
import { loadEquipment as loadSelectedEquipment } from './game/equipment.js';
import {
  CONSUMABLE_RULES, cooldownRemaining, resetConsumableCooldowns,
  startConsumableCooldown,
} from './game/consumables.js';
import { PLAYER_ACTION_BITS } from './net/protocol.js';
import { encodeAimIntent } from './net/aimIntent.js';
import { mobileAutoAimCenter, pickMobileAutoAimTarget } from './game/mobileAutoAim.js';
import { createSettings } from './ui/settings.js';
import { createTouchControls } from './ui/touchControls.js';
import {
  createBus, createGameState, spawnTanks, setupBattle, simStep, createCollider,
  mulberry32, ensureStagedVisuals, nextStagedBake,
} from './game/state.js';
// BOOT SCREENS: the entry/loading gate (markup inline in index.html so first
// paint never waits on this module graph) and the pre-battle roster screen.
import { createBootScreen } from './ui/bootScreen.js';
import { createBattleLoadScreen, tierNumeral } from './ui/battleLoad.js';
import { createTransition } from './ui/transition.js';
// SCENE STUDIO (src/game/studio.js): staging rig + scripted-shot API.
import { createStudio } from './game/studio.js';

const DEG = Math.PI / 180;
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

function loadLastSpecId() {
  try {
    const id = localStorage.getItem(LAST_SPEC_KEY);
    if (id && ALL_TANK_IDS.includes(id) && isGarageVisibleTankId(id)) return id;
  } catch (_) { /* storage unavailable/private mode */ }
  return DEFAULT_SPEC_ID;
}

function rememberSpecId(id) {
  if (!ALL_TANK_IDS.includes(id) || !isGarageVisibleTankId(id)) return;
  try { localStorage.setItem(LAST_SPEC_KEY, id); } catch (_) { /* storage unavailable */ }
}

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
// PERF r3: reusable pose for the per-frame aim armor query (computeAimInfo
// runs tankPoseFromState once per bounding-gated enemy per HUD frame)
const _aimPose = { pos: new THREE.Vector3() };

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
const boot = createBootScreen();
const BOOT_TIMINGS = {};
let bootComplete = false;
// LOADING PERF: attribute the WHOLE boot, not just the staged work. `_lastMark`
// tracks the end of the previous stage so the un-staged code BETWEEN stages
// (spawn, fx, rig, input wiring, ...) shows up as `gap>stage` rows in
// __BOOT_TIMINGS instead of vanishing from the report. `imports` is the module
// graph fetch+eval time before this module body ran (BOOT_T0 is measured from
// timeOrigin, so it includes vite/network + three.js eval).
let _lastMark = 0;
function markGap(key, t0) {
  const gap = Math.round(t0 - _lastMark);
  if (gap > 1) BOOT_TIMINGS[`gap>${key}`] = gap;
}
/**
 * Yield to the browser so the loading screen can paint. Falls back to a timer:
 * some embedded/headless panes report `hidden` and never deliver rAF, and a
 * starved rAF must not be able to stall the boot sequence forever.
 * @returns {Promise<void>}
 */
function nextFrame() {
  return new Promise((resolve) => {
    let done = false;
    const fin = () => { if (!done) { done = true; resolve(); } };
    requestAnimationFrame(fin);
    setTimeout(fin, 34);
  });
}

function createFrameBudgetYielder(budgetMs = 12) {
  let sliceStart = performance.now();
  return async (force = false) => {
    if (!force && performance.now() - sliceStart < budgetMs) return;
    if (globalThis.scheduler && typeof globalThis.scheduler.yield === 'function') {
      await globalThis.scheduler.yield();
    } else {
      await nextFrame();
    }
    sliceStart = performance.now();
  };
}
/**
 * Run one named boot stage with progress reporting around it.
 * @param {string} key stage key (bootScreen.js STAGES)
 * @param {?function():*} [fn] the work (may be async)
 * @returns {Promise<*>} fn's result
 */
async function bootStage(key, fn) {
  markGap(key, performance.now());
  boot.begin(key);
  await nextFrame();
  const t0 = performance.now();
  const out = fn ? await fn() : undefined;
  const t1 = performance.now();
  BOOT_TIMINGS[key] = Math.round(t1 - t0);
  boot.end(key);
  // LOADING PERF: the second frame-yield existed so the bar's end-of-stage
  // advance paints — but for sub-20 ms stages the begin() yield of the NEXT
  // stage repaints within a frame anyway, and 9 stages x 2 yields at the
  // 34 ms starved-rAF fallback billed ~300 ms of pure waiting onto boot.
  // Only heavy stages pay the extra paint yield now.
  if (t1 - t0 > 20) await nextFrame();
  _lastMark = performance.now();
  return out;
}
const BOOT_T0 = performance.now();
BOOT_TIMINGS.imports = Math.round(BOOT_T0);
_lastMark = BOOT_T0;
// ---------------------------------------------------------------------------
// Engine bootstrap (§4 startup order)
// ---------------------------------------------------------------------------
const container = document.getElementById('app');
boot.begin('renderer');
const renderer = createRenderer(container);
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
boot.end('renderer');
BOOT_TIMINGS.renderer = Math.round(performance.now() - BOOT_T0);
_lastMark = performance.now();

const sky = await bootStage('sky', () => {
  const s = createSky(scene, renderer);
  s.bakeEnvironment();
  return s;
});
const lighting = await bootStage('lighting', () => createLighting(scene, camera, sky.sunDir));
mountDiagOverlay({ tier: resolveDeviceTier(renderer), diag: _diag, rescue: _diagRescue, renderer });

const engineCtx = {
  renderer,
  scene,
  camera,
  setupShadowMaterial: (mat, extraHook = null) => lighting.setupShadowMaterial(mat, extraHook),
  anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()),
  quality: 'high',
};
// damage panel r9: real top-down plan masks render through the game renderer
initTopMaskRig(engineCtx);

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
const worldCache = new Map();
const worldBuilds = new Map();
let world = null;
let pendingMapId = 'verdant';    // battlefield the garage is pointing at
let worldDormant = false;        // garage: world hidden + per-frame update off
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
  get size() { return world ? world.heightField.size : 1000; },
  get minY() { return world ? world.heightField.minY : 0; },
  get maxY() { return world ? world.heightField.maxY : 0; },
};

function beginWorldBuild(mapId, onProgress = null, background = false) {
  const id = mapId || pendingMapId;
  const cached = worldCache.get(id);
  if (cached) return { promise: Promise.resolve(cached), listeners: null, f: 1, label: 'Ready' };
  let rec = worldBuilds.get(id);
  if (!rec) {
    rec = {
      id, f: 0, label: 'Surveying terrain', foreground: !background,
      listeners: new Set(), startedAt: performance.now(), promise: null,
      stageTimings: {}, stageLabel: null, stageMark: performance.now(),
    };
    const finishBuildStage = (now = performance.now()) => {
      if (!rec.stageLabel) return;
      const key = ({
        'Surveying terrain': 'heightField',
        'Building terrain meshes': 'terrain',
        'Planting vegetation': 'vegetation',
        'Placing structures': 'props',
        'Sealing the battlefield': 'assemble',
      })[rec.stageLabel] || rec.stageLabel;
      rec.stageTimings[key] = (rec.stageTimings[key] || 0) + Math.round(now - rec.stageMark);
      rec.stageMark = now;
    };
    const yieldForeground = createFrameBudgetYielder(12);
    const yieldBackground = createFrameBudgetYielder(6);
    rec.promise = createMapAsync(engineCtx, { mapId: id, seed: 1337 },
      async (label, f) => {
        if (label !== rec.stageLabel) {
          const now = performance.now();
          finishBuildStage(now);
          rec.stageLabel = label;
          rec.stageMark = now;
        }
        rec.label = label;
        rec.f = f;
        for (const fn of rec.listeners) {
          try { fn(f, label); } catch (_) { /* advisory */ }
        }
        await (rec.foreground ? yieldForeground() : yieldBackground());
      // Drain the same deterministic generators at their finest checkpoints.
      // The frame-budget yielder above still coalesces cheap work on fast
      // machines, while slow CPUs no longer turn a coarse row/family batch
      // into a multi-hundred-millisecond loading-screen stall.
      }, { fineSlices: true })
      .then((next) => {
        finishBuildStage();
        next.group.visible = false;
        worldCache.set(id, next);
        if (typeof window !== 'undefined' && window.__WORLD_PREFETCH?.id === id) {
          Object.assign(window.__WORLD_PREFETCH, {
            done: true, totalMs: Math.round(performance.now() - rec.startedAt), f: 1,
          });
        }
        return next;
      })
      .catch((error) => {
        if (typeof window !== 'undefined' && window.__WORLD_PREFETCH?.id === id) {
          Object.assign(window.__WORLD_PREFETCH, { done: false, failed: String(error) });
        }
        throw error;
      })
      .finally(() => {
        if (worldBuilds.get(id) === rec) worldBuilds.delete(id);
      });
    worldBuilds.set(id, rec);
  } else if (!background) {
    rec.foreground = true;
  }
  if (onProgress && rec.listeners) {
    rec.listeners.add(onProgress);
    try { onProgress(rec.f, rec.label); } catch (_) { /* advisory */ }
  }
  return rec;
}
/** World raycast that is safe before any battlefield exists. */
function worldRaycast(o, d, m) { return world ? world.raycast(o, d, m) : null; }

// --- game state + tanks -----------------------------------------------------
const devTrace = import.meta.env.DEV
  ? (await import('./dev/perfTrace.js')).createDevTrace({ renderer })
  : null;
const bus = createBus(devTrace ? (ev, payload) => devTrace.event(ev, payload) : null);
installBattleRecords(bus);
const game = createGameState();
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
// startBattleLoading awaits it before the wreck dances (burnt bakes copy the
// camo canvases, so paint must be final first).
let camoSweepP = Promise.resolve();

// --- fx ----------------------------------------------------------------------
const fx = createFx(engineCtx, hfProxy, { seed: 5000 });
scene.add(fx.group);
fx.bindBus(bus);

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
  const gd = createGarageDressing(engineCtx, GARAGE_POS);
  scene.add(gd.group);
  // Finish the visible workshop while the boot veil owns the screen. Each
  // chunk still gets a painted frame, but no repair-bay build can now land as
  // a surprise 50–170 ms task after the garage becomes interactive.
  while (gd.pump()) await nextFrame();
  return { stage: gs, dressing: gd };
});
// FEEL r12: corner perf overlay — fps / p95 frame time / worst stall /
// draw calls / programs / heap / sim%. F8 toggles; probes read
// window.__PERF_HUD.stats().
const perfHud = createPerfHud({ renderer, game });
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
// First visit opens on the M1A1 Abrams; later visits resume the last playable
// tank the user selected. Invalid/stale ids safely fall back to the M1A1.
let selectedSpecId = loadLastSpecId();
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
const PEDESTAL_CACHE_MAX = 6;
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
function recordSwitch(specId, t0, path) {
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
  if (log) log.push({ id: specId, ms, path });
  pedTrace('reveal', { id: specId, ms, path, pv: pedVisState(pedestalVisual) });
}
function pedestalPose(vis) {
  // A small number of recovered-coordinate first-party builders retain an
  // intentionally off-origin local hull datum.  Their battle/armor geometry
  // must not be translated just to fix showroom framing, so the spec may
  // provide a presentation-only longitudinal correction.  Rotate that local
  // +Z correction through the current garage yaw: the physical hull center,
  // not the rig's historical origin, lands on the platform datum.
  const localZ = Number(vis.spec?.visual?.garageHullOffsetZ) || 0;
  const yaw = vis.root.rotation.y;
  vis.root.position.set(
    GARAGE_POS.x + Math.sin(yaw) * localZ,
    GARAGE_POS.y + 0.35,
    GARAGE_POS.z + Math.cos(yaw) * localZ,
  );
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
  const evict = (v) => {
    pedTrace('evict', { id: v.specId, state: pedVisState(v) });
    scene.remove(v.root);
    v.dispose();
  };
  for (const pass of [1, 2]) {
    for (const [id, v] of pedestalCache) {
      if (pedestalCache.size <= PEDESTAL_CACHE_MAX) return;
      if (v === pedestalVisual) continue; // never evict the live hero
      if (v.__pedestalCompiling) continue; // async program warm owns this root
      if (v === vis) continue;            // never evict the entry just inserted
      if (onStage(v)) continue;           // never strip a hero off the stage
      if (pass === 1 && v.__everShown) continue;
      pedestalCache.delete(id);
      evict(v);
    }
  }
}
/**
 * Build a pedestal-grade visual for the LRU (shared camoSeed/pose contract).
 * Texture tier is 'ai' — HALF-RES bake, ~4x cheaper on the switch/boot path;
 * scheduleHeroUpgrade() re-bakes the shared canvases to 'high' IN PLACE from
 * an idle slice right after the reveal (needsUpdate flips live materials, so
 * the visible hero crispens without a rebuild — same mechanism the garage
 * always used when selecting a spec the AI roster had baked at 'ai').
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
  // camo_spotting r4: same front-3/4 presentation for every hero — long
  // hulls may carry a yaw trim so the camo picker repaints a fully framed
  // vehicle (visual.garageYawDeg, authored per spec; 0 keeps today's pose).
  vis.root.rotation.y =
    (162 + ((pedSpec && pedSpec.visual && pedSpec.visual.garageYawDeg) || 0)) * DEG;
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
  try {
    if (typeof renderer.compileAsync === 'function') {
      await renderer.compileAsync(vis.root, camera, scene);
    } else {
      renderer.compile(vis.root, camera, scene);
    }
  } catch (_) { /* first visible render remains the compatibility fallback */ }
}
let heroUpgradeTimer = 0;
let heroUpgradeIdle = 0;
let garageActivityAt = performance.now();
const noteGarageActivity = () => { garageActivityAt = performance.now(); };
for (const type of ['pointerdown', 'wheel', 'keydown', 'touchstart']) {
  window.addEventListener(type, noteGarageActivity, { capture: true, passive: true });
}
const requestQuietIdle = (fn) => {
  if (window.requestIdleCallback) return window.requestIdleCallback(fn);
  return setTimeout(fn, 800);
};
const cancelQuietIdle = (id) => {
  if (!id) return;
  if (window.cancelIdleCallback) window.cancelIdleCallback(id);
  else clearTimeout(id);
};
async function waitForGarageQuiet(specId, quietMs = 1800) {
  while (bootComplete && game.phase === 'garage'
      && pedestalVisual && pedestalVisual.specId === specId) {
    const left = quietMs - (performance.now() - garageActivityAt);
    if (left <= 0) return true;
    await new Promise((r) => setTimeout(r, Math.min(500, Math.max(50, left))));
  }
  return false;
}
function scheduleHeroUpgrade(specId) {
  clearTimeout(heroUpgradeTimer);
  cancelQuietIdle(heroUpgradeIdle);
  heroUpgradeIdle = 0;
  heroUpgradeTimer = setTimeout(() => {
    // never bill the 2048² re-bake to the boot-critical window — a timer can
    // fire between staged-boot awaits (procedural boot hero path)
    if (!bootComplete) { scheduleHeroUpgrade(specId); return; }
    if (!pedestalVisual || pedestalVisual.specId !== specId) return;
    heroUpgradeIdle = requestQuietIdle(async () => {
      heroUpgradeIdle = 0;
      if (!(await waitForGarageQuiet(specId))) return;
      // Keep the exact high-resolution result, but pause between painter
      // stages whenever the player resumes interacting with the garage.
      upgradeSharedTexturesChunked(specId, async () => {
        await nextFrame();
        await waitForGarageQuiet(specId);
      }).catch(() => { /* the current sharpness remains valid */ });
    });
  }, 5000);
}
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
      scheduleHeroUpgrade(specId);
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
  return prebakeSharedTextures(getSpec(specId), engineCtx.anisotropy ?? 4, 'ai', () => nextFrame())
    .catch(() => { /* buildPedestalVisual can still acquire synchronously */ })
    .then(async () => {
      if (buildToken !== pedestalPollToken) {
        pedTrace('prebake-stale', { id: specId, tok: buildToken });
        retirePrev();
        return;
      }
      const incoming = buildPedestalVisual(specId, true);
      incoming.__pedestalCompiling = true;
      // Boot's following `post` stage compiles the complete scene before the
      // first present, so only interactive cold switches need this dedicated
      // off-stage warm.
      const compileWork = bootComplete ? warmPedestalPrograms(incoming) : Promise.resolve();
      incoming.__pedestalCompileP = compileWork.finally(() => {
        incoming.__pedestalCompiling = false;
        incoming.__pedestalCompileP = null;
        // Settle any temporary over-budget allowance made while this root was
        // protected from eviction.
        if (pedestalCache.get(specId) === incoming) touchCache(specId, incoming);
      });
      await incoming.__pedestalCompileP;
      if (buildToken !== pedestalPollToken) {
        pedTrace('compile-stale', { id: specId, tok: buildToken });
        return;
      }
      pedestalVisual = incoming;
      pedestalPose(incoming);
      if (incoming.setVisible) incoming.setVisible(true);
      retirePrev();
      scheduleHeroUpgrade(specId);
      recordSwitch(specId, t0, 'procedural');
    });
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
// The hero is the one full-resolution vehicle paid during boot. This avoids a
// high-resolution repaint a few seconds after the garage becomes interactive;
// every unseen roster entry stays lazy until selected or battle loading.
await bootStage('vehicle', async () => {
  await prebakeSharedTextures(getSpec(selectedSpecId), engineCtx.anisotropy ?? 4,
    'high', () => nextFrame());
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
// GARAGE_POS.y + 0.35, so +1.6 is the middle of a ~2.5 m tank.
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
 * and re-seat the garage stage.
 * @param {object} next a World from createMap/createMapAsync
 * @returns {object} the active World
 */
function activateWorld(next) {
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
  collider = createCollider(game, world);
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
  hud.buildMinimap(world.heightField, world.getMinimapFeatures(), world.config.minimap,
    minimapSnapCtx()); // hud_ui r6: real top-down capture as the map underlay
  placeGarage();
  return world;
}

/**
 * MAP-CONFIG WIRING: lazily build + cache a battlefield and activate it.
 * Synchronous (screenshot-contract safe) — the chunked variant used behind the
 * pre-battle loading screen is ensureWorld().
 * @param {string} mapId concrete map id (never 'random' — resolve first)
 * @returns {object} the active World
 */
function switchMap(mapId) {
  if (world && world.mapId === mapId) return world;
  let next = worldCache.get(mapId);
  if (!next) {
    next = createMap(engineCtx, { mapId, seed: 1337 });
    worldCache.set(mapId, next);
  }
  return activateWorld(next);
}

/**
 * BOOT DEFERRAL: guarantee a battlefield exists and is active, building it one
 * subsystem per frame so the caller's loading bar keeps animating.
 * @param {string} mapId concrete map id
 * @param {?function(number, string):void} [onProgress] (fraction, label)
 * @returns {Promise<object>} the active World
 */
async function ensureWorld(mapId, onProgress = null) {
  const id = mapId || pendingMapId;
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
    const rec = beginWorldBuild(id, onProgress, false);
    try {
      next = await rec.promise;
      wt.buildDetail = { ...rec.stageTimings };
      if (next._buildDetail?.vegetation) {
        wt.buildDetail.vegetationDetail = { ...next._buildDetail.vegetation };
      }
    } finally {
      if (onProgress && rec.listeners) rec.listeners.delete(onProgress);
    }
  }
  wtStage('build');
  next.group.visible = true;
  // perf-r3: assembleWorld and activateWorld (minimap top-down capture,
  // collider build, sky re-key) used to fuse into one ~1.6 s task — give the
  // loading bar a painted frame between them.
  await nextFrame();
  wtStage('present');
  // perf-r5c (retina probe): activateWorld's minimap capture was the FIRST
  // render touching the fresh world's programs — 55 links resolved in that
  // one slice (630 ms). Submit the compiles now, let the parallel linker
  // breathe, and bake the cloud decks one-per-frame; the capture then binds
  // ready programs and baked clouds.
  try {
    if (typeof renderer.compileAsync === 'function') {
      await renderer.compileAsync(next.group, camera, scene);
    } else {
      renderer.compile(next.group, camera, scene);
    }
  } catch (_) { /* warm only */ }
  wtStage('compile');
  await nextFrame();
  // shadow-depth variants never build through compile() (r2d note) and the
  // render that submits them also BINDS them — one full render resolved ~59
  // links in a single slice (3 s under heavy host load). Render the world in
  // SUBSETS instead (terrain -> +vegetation -> +props): each slice submits
  // and resolves roughly a third, with linker breathing between.
  {
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
  if (sky.ensureCloudTexturesChunked) await sky.ensureCloudTexturesChunked(() => nextFrame());
  wtStage('clouds');
  if (world !== next || worldDormant) activateWorld(next);
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
let damagePanel = null;
const hud = await bootStage('hud', () => {
  const h = initHud(bus);
  const dp = createDamagePanel();
  perfHud.mountCompact(dp.root);
  h.setDamagePanel(dp);
  damagePanel = dp;
  return h;
});

const garageMaps = [
  ...MAP_IDS.map((id) => {
    const c = getMapConfig(id);
    return { id, name: c.name, sub: c.sub || '', thumb: MAP_THUMBS[id] || '' };
  }),
  { id: 'random', name: 'Random', sub: 'Any battlefield', thumb: '' },
];
let pendingSoloStart = null;
let playMenuPromise = null;
let pendingLobbyRoom = null;
async function openPlayMenu(request) {
  if (activeNetworkRoom && networkMatch && !networkMatch.client?.closed) {
    const menu = await playMenuPromise;
    if (menu?.showActiveRoom()) return;
  }
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
    playMenuPromise = import('./ui/playMenu.js').then(({ createPlayMenu }) => createPlayMenu({
      maps: garageMaps,
      getSelection: () => ({
        specId: garage.getSelected(),
        mapId: garage.getSelectedMap(),
        equipment: loadSelectedEquipment(garage.getSelected(), getSpec(garage.getSelected())),
        camo: getMultiplayerCamoSelection(garage.getSelected()),
      }),
      isVehicleAllowed: (specId) => ALL_TANK_IDS.includes(specId),
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
      onLobbyChange: handleLobbyRoomChange,
    }));
  }
  const menu = await playMenuPromise;
  menu.show(request?.mode, request?.invite);
}

const garage = await bootStage('ui', () => createGarage({
  specs: ALL_TANK_IDS.map(getSpec), // COMMUNITY TANKS: grown carousel
  bus,
  onSelect: (specId) => {
    selectedSpecId = specId;
    rememberSpecId(specId);
    setPedestalTank(specId);
    syncActiveRoomVehicle(specId);
    syncPendingLobbySelection();
  },
  onBattle: (specId, mapId) => beginBattleEntry(specId, mapId), // loading screen owns entry
  onPlayRequest: (request) => openPlayMenu(request).catch((error) => {
    console.error('[play-menu] failed to open', error);
  }),
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
      camoSweepP = applyCamoPatternsChunked({ priorityIds: [specId] });
      syncActiveRoomCamo(specId);
      syncPendingLobbySelection();
    },
    setCustom: (specId, value) => {
      setCustomCamoSelection(specId, value);
      camoSweepP = applyCamoPatternsChunked({ priorityIds: [specId] });
      // Deliberately sends Factory: custom paint is local single-player only.
      syncActiveRoomCamo(specId);
      syncPendingLobbySelection();
    },
  },
  // CAMO WIRING (r8): AUTO(map) tanks preview the pattern they will actually
  // wear on the highlighted battlefield. 'random' falls back to verdant
  // inside setCamoBiome; startBattle re-calls setCamoBiome(world.mapId) after
  // the roll, so battle state is always correct regardless.
  onMapSelect: (mapId) => {
    setCamoBiome(mapId);
    // perf-r2f: chunked — the sync sweep froze the garage ~0.3-1.4 s PER
    // cached tank on a map-card click. The visible hero repaints in the
    // first slice; parked/roster entries follow one frame apart.
    applyCamoPatternsChunked({ priorityIds: [selectedSpecId] });
    syncPendingLobbySelection();
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
  const a = createAudio();
  a.bindBus(bus);
  return a;
});

// --- camera rig -----------------------------------------------------------------
// Camera-aim raycast: world geometry PLUS live enemy hulls. This owns the
// fixed center marker and requested world point; the separate gun marker owns
// the real articulated bore, matching World of Tanks' documented reticles.
const _armEnd = new THREE.Vector3();
const _armTo = new THREE.Vector3();
// controls_gunnery r6: STICKY SERVER RETICLE. The aim ray was exact-hit-or-
// nothing against enemy hulls, so with a mover near the crosshair the anchor
// (range readout, pen indicator and lead reference) flickered to background
// terrain the instant the ray slipped off
// the silhouette (critic: reticle printed 694 m with a T-72B3 at ~341 m under
// it). WoT's server reticle is deliberately sticky on vehicles:
//  - the intersection gate is INFLATED (bounding sphere ×1.15) — a ray that
//    grazes the silhouette without an exact armor-trace hit still anchors at
//    the tank's range (soft anchor at the closest-approach point);
//  - a held tank anchor persists ~0.3 s after the ray slips fully off, so
//    tracking jitter across a mover never drops the range/pen readout.
const AIM_STICKY_INFLATE = 1.15;
const AIM_STICKY_HOLD_MS = 300;
let aimStickyUntilMs = -Infinity;
let aimStickyDistM = 0;
const _aimSoft = { point: new THREE.Vector3(), normal: null, dist: 0, kind: 'tank-soft' };
function aimRaycastWithTanks(origin, dir, maxDist) {
  const wHit = worldRaycast(origin, dir, maxDist);
  let bestD = wHit ? wHit.dist : maxDist;
  let best = wHit;
  let exactTank = false;
  let softDist = Infinity; // nearest inflated-silhouette crossing (soft anchor)
  for (const ent of game.tanks) {
    if (ent.isPlayer || !ent.state || !ent.combat || ent.combat.destroyed) continue;
    const r = ent.spec.armor.boundingRadiusM;
    const rInf = r * AIM_STICKY_INFLATE;
    _armTo.copy(ent.state.pos);
    _armTo.y += ent.spec.dims.heightM * 0.5;
    _armTo.sub(origin);
    const proj = _armTo.dot(dir);
    if (proj < 0 || proj - rInf > bestD) continue;
    const lat2 = _armTo.lengthSq() - proj * proj;
    if (lat2 > rInf * rInf) continue;
    if (proj < bestD && proj < softDist) softDist = proj;
    if (lat2 > r * r) continue; // the inflated shell only feeds the soft anchor
    _armEnd.copy(origin).addScaledVector(dir, Math.min(bestD, proj + r));
    const hits = traceTank(origin, _armEnd, tankPoseFromState(ent.state), ent.spec.armor, ent.combat.eraSpent);
    if (!hits.length) continue;
    const d = origin.distanceTo(hits[0].point);
    if (d < bestD) {
      bestD = d;
      best = { point: hits[0].point, normal: hits[0].normal, dist: d, kind: 'tank' };
      exactTank = true;
    }
  }
  const nowMs = performance.now();
  if (exactTank) {
    aimStickyUntilMs = nowMs + AIM_STICKY_HOLD_MS;
    aimStickyDistM = bestD;
    return best;
  }
  if (softDist < Infinity) {
    // ray crosses a live enemy's inflated silhouette in front of the terrain
    // hit — anchor at the tank instead of the background (and refresh hold)
    aimStickyUntilMs = nowMs + AIM_STICKY_HOLD_MS;
    aimStickyDistM = softDist;
    _aimSoft.point.copy(origin).addScaledVector(dir, softDist);
    _aimSoft.dist = softDist;
    return _aimSoft;
  }
  if (nowMs < aimStickyUntilMs && aimStickyDistM < bestD) {
    // hysteresis: ride out a brief slip off the hull at the held range
    _aimSoft.point.copy(origin).addScaledVector(dir, aimStickyDistM);
    _aimSoft.dist = aimStickyDistM;
    return _aimSoft;
  }
  return best;
}

const rig = createCameraRig(camera, {
  heightField: hfProxy,
  raycast: worldRaycast,
  aimRaycast: aimRaycastWithTanks,
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
    // yawed 162° (setPedestalTank), so its nose points at world azimuth 162°;
    // the old eye azimuth atan2(7.4, 8.0) ≈ 42.8° sat 119° off the nose and
    // read as left-flank + rear. Park the eye 45° off the nose on the
    // vehicle's RIGHT (162° + 45° = 207°): classic WoT front-right 3/4 —
    // gun sweeps toward camera-left, front plate and one flank both read.
    heroYawRad: (162 + 45) * DEG,
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
const killcam = createKillCam({
  scene, camera, rig, heightField: hfProxy, getPlayer: () => game.player,
  getEntity: (id) => game.tankById.get(id),
  getWorld: () => world, // r6: flight-cam LOS solve (foliage/terrain/props)
  // killcam r2 (owner: "show the actual animations of popping turrets and
  // exploding, especially during kill cam"): the replay's live-action IMPACT
  // beat re-fires the real destruction FX (fireball/debris/smoke) on the
  // restaged victim between the flight and the x-ray hold.
  getFx: () => fx,
});
killcam.bindBus(bus);
game.killcam = killcam;

/**
 * KILL-CAM: hide/show the battle HUD around a replay WITHOUT hud.setMode —
 * the hidden→battle mode round-trip resets the shot-info session stats, and
 * the end-of-battle report must survive the cinematic. The stats card lives
 * outside hud.root, so it gets its own visibility veil.
 * @param {boolean} on veiled (replay running)
 */
function veilHud(on) {
  hud.root.style.display = on ? 'none' : '';
  const sr = hud.shotInfo && hud.shotInfo.statsRoot;
  if (sr) sr.style.visibility = on ? 'hidden' : '';
  damagePanel.root.style.visibility = on ? 'hidden' : '';
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
    if (pen && ev.pos && fx.armorScar) {
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
  // fire ray (drive tests also pin debugAimTargetId — prefer it when live)
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
const settings = createSettings({
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
const touchControls = createTouchControls({
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
devTrace?.configure({
  input,
  getContext: () => ({
    paused: settings.isOpen(),
    killcam: killcam.isActive(),
    shotMode,
    studio: !!studio?.active,
    cameraMode: rig.mode,
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
  touchControls.refresh();
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
  if (!CONSUMABLE_RULES[slot]) return;
  if (networkMatch) {
    networkActionBitsPending |= 1 << slot;
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
input.onAction('perfHud', () => perfHud.toggle());

bus.on('ui:shellSelect', ({ slot }) => {
  if (game.player && game.player.combat && !game.player.combat.destroyed) {
    // spec: with per-shell reloads the restart prices the INCOMING shell
    // (autocannon belt 0.4 s vs. ATGM rail 14+ s on the same vehicle).
    selectShell(game.player.combat, slot, game.player.spec);
    game.player.input.shellSlot = slot;
  }
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
async function startBattleLoading(specId, mapId = null) {
  const shownAt = performance.now();
  const loadYield = createFrameBudgetYielder(12);
  const resolved = resolveMapId(mapId || pendingMapId);
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
    mapSub: cfg.sub || '',
    thumb: MAP_THUMBS[resolved] || '',
    biome: resolved,
    mode: mapId === 'random' ? 'Random Battle · Any Battlefield' : 'Random Battle · Standard',
    allies: [], enemies: [],
  });
  await nextFrame();

  // 1. battlefield (0 → 55%). Already-cached maps skip straight through.
  battleLoad.progress(0.02, 'Loading battlefield');
  await ensureWorld(resolved, (f, label) => battleLoad.progress(0.02 + f * 0.53, label));
  blt.world = (typeof window !== 'undefined' && window.__WORLD_LOAD) || null;
  bltStage('world');

  // 2. roster: pick the participants, then bake any visual still missing one
  //    chunk-by-chunk (55 → 88%) so the bar moves through the texture bakes.
  battleLoad.progress(0.56, 'Assembling rosters');
  await nextFrame();
  startBattle(specId, resolved, { deferVisuals: true, preBattleHold: true });
  bltStage('roster');
  battleLoad.rosters(rosterRows('player'), rosterRows('enemy'));
  // PERF (perf-r2): bake the shot-card schematics for this exact roster now,
  // behind the loading screen — the first hit on each enemy type used to pay
  // a synchronous ~5-15 ms canvas bake on the very frame the shell landed.
  hud.warmShotCards(game.tanks.map((e) => e.specId));
  battleLoad.progress(0.58, 'Painting vehicles');
  await nextFrame();
  const missing = game.tanks.filter((e) => !e.visual).length;
  for (let i = 0; i < missing + 1; i++) {
    // perf-r4b: bake the NEXT tank's shared canvases chunked (a painted frame
    // between painter stages) so the build below acquires a warm cache entry
    // — one 2048² family bake was a 0.3-4.7 s atomic task under this bar.
    const next = nextStagedBake(game);
    if (next) {
      try {
        await prebakeSharedTextures(getSpec(next.ent.specId),
          engineCtx.anisotropy ?? 4, next.quality, () => loadYield());
      } catch (_) { /* warm only — ensureStagedVisuals bakes as before */ }
    }
    if (ensureStagedVisuals(game, 1)) break;
    battleLoad.progress(0.58 + ((i + 1) / Math.max(1, missing)) * 0.30, 'Painting vehicles');
    await loadYield();
  }
  bltStage('bake');

  // 3. shader/texture warm: pulling this in front of the countdown
  //    is what keeps the opening flyby from hitching on a compile storm.
  // Camouflage painting starts with roster staging; finish it before burnt
  // texture caches copy those canvases during the single warm pipeline.
  await camoSweepP;
  battleLoad.progress(0.90, 'Compiling shaders');
  await nextFrame();
  await warmCombatPipelineChunked();
  bltStage('warm');
  battleLoad.progress(1, 'Ready');

  // Cached maps can finish in only a few frames. Give the page enough dwell
  // to communicate the map/rosters instead of flashing like a dropped frame.
  const readyHoldMs = 900 - (performance.now() - shownAt);
  if (readyHoldMs > 0) await new Promise((r) => setTimeout(r, readyHoldMs));

  // 4. battle_countdown r1: no more counting down ON the loading screen —
  // the world opens as soon as it is ready, and the visible WoT-style
  // 5 s countdown runs IN the battle (openBattle resolves the sim hold armed
  // at roster spawn). The hold also absorbs first-use compiles behind a frame
  // where nothing can move yet.
  bltStage('holdCountdown');
  blt.totalMs = Math.round(performance.now() - shownAt);
  if (typeof window !== 'undefined') window.__BATTLE_LOAD = blt;
  await battleLoad.hide();
  openBattle();
}
// Headless probes drive the battle entry through __DEBUG.startBattle (which is
// synchronous) and skip the in-battle countdown (startBattle arms it only on
// the player path — see opts.preBattleHold).
let battleEntryPending = false;
let networkMatch = null;
let networkBridge = null;
let networkStatus = null;
let latestNetworkSnapshot = null;
let networkActionBitsPending = 0;
let networkSpectator = false;
let activeNetworkRoom = null;
let unsubscribeNetworkRoom = null;
let unsubscribeNetworkRoomChat = null;
let networkRoomMenuAttached = false;
let networkPresentedRound = 0;
let networkRematchPending = false;
const pendingNetworkEvents = [];
const pendingNetworkRoomChat = [];
let networkRoomChat = null;
let networkRoomChatPromise = null;

function roomChatVisible() {
  return !!(networkMatch && activeNetworkRoom && game.phase === 'battle');
}

function syncRoomChatVisibility() {
  if (!networkRoomChat) return;
  networkRoomChat.setPlayer(networkMatch?.playerId || '');
  networkRoomChat.setActive(roomChatVisible());
}

function handleNetworkRoomChat(message) {
  if (networkRoomChat) networkRoomChat.append(message);
  else {
    pendingNetworkRoomChat.push(message);
    if (pendingNetworkRoomChat.length > 48) pendingNetworkRoomChat.shift();
  }
}

async function ensureNetworkRoomChat() {
  if (!networkRoomChatPromise) {
    networkRoomChatPromise = import('./ui/roomChat.js').then(({ createRoomChat }) => {
      networkRoomChat = createRoomChat({
        input,
        onSend: (text) => networkMatch?.sendRoomChat?.(text) || false,
        isAvailable: () => roomChatVisible() && !settings.isOpen(),
        shouldRelock: () => roomChatVisible() && !settings.isOpen() && !game.result &&
          !killcam.isActive() && !networkSpectator,
      });
      networkRoomChat.setPlayer(networkMatch?.playerId || '');
      for (const message of networkMatch?.getRoomChatHistory?.() || []) {
        networkRoomChat.append(message);
      }
      for (const message of pendingNetworkRoomChat.splice(0)) networkRoomChat.append(message);
      syncRoomChatVisibility();
      return networkRoomChat;
    });
  }
  return networkRoomChatPromise;
}

function activeRoomPlayer(state = activeNetworkRoom) {
  return state?.players?.find((player) => player.id === networkMatch?.playerId) || null;
}

function garageRoomStatus(state, playerId) {
  const me = state?.players?.find((player) => player.id === playerId);
  if (!me) return null;
  const active = state.players.filter((player) => player.team !== 'spectator');
  return {
    roomCode: state.roomCode,
    mode: state.mode,
    ready: me.ready,
    readyCount: active.filter((player) => player.ready).length,
    total: active.length,
  };
}

function handleLobbyRoomChange(context) {
  pendingLobbyRoom = context?.state ? context : null;
  if (activeNetworkRoom) return;
  garage.setRoomStatus(pendingLobbyRoom
    ? garageRoomStatus(pendingLobbyRoom.state, pendingLobbyRoom.playerId)
    : null);
}

function syncPendingLobbySelection() {
  if (!pendingLobbyRoom || !playMenuPromise) return;
  playMenuPromise.then((menu) => menu.syncGarageSelection());
}

function syncActiveRoomVehicle(specId) {
  const me = activeRoomPlayer();
  if (!me || me.ready || activeNetworkRoom?.phase !== 'waiting') return;
  if (me.specId !== specId) networkMatch?.roomCommand?.({ type: 'select_vehicle', specId });
  networkMatch?.roomCommand?.({
    type: 'select_equipment',
    equipment: loadSelectedEquipment(specId, getSpec(specId)),
  });
  syncActiveRoomCamo(specId);
}

function syncActiveRoomCamo(specId) {
  const me = activeRoomPlayer();
  if (!me || me.ready || activeNetworkRoom?.phase !== 'waiting') return;
  const camo = getMultiplayerCamoSelection(specId);
  if (me.camo !== camo) networkMatch?.roomCommand?.({ type: 'select_camo', camo });
}

function updateActiveRoomPresentation(state) {
  garage.setRoomStatus(garageRoomStatus(state, networkMatch?.playerId));
  bus.emit('network:roomState', {
    state,
    playerId: networkMatch?.playerId || '',
    role: networkMatch?.role || 'client',
  });
  syncRoomChatVisibility();
  if (playMenuPromise) {
    playMenuPromise.then((menu) => {
      if (!activeNetworkRoom) return;
      const adapter = {
        state: activeNetworkRoom,
        playerId: networkMatch?.playerId || '',
        role: networkMatch?.role || 'client',
        command: (command) => networkMatch?.roomCommand?.(command),
        leave: (reason) => closeNetworkMatch(reason || 'left_room'),
      };
      if (!networkRoomMenuAttached) {
        menu.attachActiveRoom(adapter);
        networkRoomMenuAttached = true;
      } else menu.updateActiveRoom(activeNetworkRoom);
    });
  }
}

function handleNetworkRoomState(state) {
  if (!state || !Array.isArray(state.players)) return;
  activeNetworkRoom = state;
  updateActiveRoomPresentation(state);
  const round = Number(state.round) || 0;
  if (state.phase === 'starting' && round > networkPresentedRound && !networkRematchPending) {
    networkRematchPending = true;
    queueMicrotask(() => beginNetworkRematch(state));
  }
}

function attachNetworkRoom(initialState) {
  if (!networkMatch?.onRoomState) return;
  if (unsubscribeNetworkRoom) unsubscribeNetworkRoom();
  activeNetworkRoom = initialState;
  networkPresentedRound = Number(initialState?.round) || 1;
  updateActiveRoomPresentation(initialState);
  unsubscribeNetworkRoom = networkMatch.onRoomState(handleNetworkRoomState);
  if (unsubscribeNetworkRoomChat) unsubscribeNetworkRoomChat();
  unsubscribeNetworkRoomChat = networkMatch.onRoomChat?.(handleNetworkRoomChat) || null;
  void ensureNetworkRoomChat();
}

function clearActiveNetworkRoom() {
  if (unsubscribeNetworkRoom) unsubscribeNetworkRoom();
  if (unsubscribeNetworkRoomChat) unsubscribeNetworkRoomChat();
  unsubscribeNetworkRoom = null;
  unsubscribeNetworkRoomChat = null;
  activeNetworkRoom = null;
  networkPresentedRound = 0;
  networkRematchPending = false;
  pendingNetworkRoomChat.length = 0;
  if (networkRoomChat) {
    networkRoomChat.setActive(false);
    networkRoomChat.clear();
  }
  garage.setRoomStatus(null);
  if (playMenuPromise) playMenuPromise.then((menu) => menu.detachActiveRoom());
  networkRoomMenuAttached = false;
  bus.emit('network:roomState', null);
}

bus.on('phase:change', syncRoomChatVisibility);

function networkInputFrame() {
  const player = game.player;
  if (!player || !player.state || !player.input || player.combat?.destroyed) return null;
  const aim = player.input.aimPoint;
  _v3.set(
    player.state.pos.x + Math.sin(player.state.yaw) * 1000,
    player.state.pos.y,
    player.state.pos.z + Math.cos(player.state.yaw) * 1000,
  );
  const aimIntent = encodeAimIntent(player.state.pos, aim || _v3);
  return {
    throttle: player.input.throttle || 0,
    steer: player.input.steer || 0,
    brake: !!player.input.brake,
    fire: !!player.input.fire,
    ...aimIntent,
    shellSlot: player.input.shellSlot | 0,
    actionBits: networkActionBitsPending & (
      PLAYER_ACTION_BITS.REPAIR |
      PLAYER_ACTION_BITS.FIRST_AID |
      PLAYER_ACTION_BITS.EXTINGUISHER
    ),
  };
}

function acceptNetworkSnapshot(snapshot, dt) {
  if (!snapshot) return;
  latestNetworkSnapshot = snapshot;
  if (networkBridge) {
    networkMatch?.client?.drainEventsThrough?.(snapshot.tick, pendingNetworkEvents);
    networkBridge.apply(snapshot, dt, pendingNetworkEvents);
  }
}

function networkDiagnostics() {
  const stats = networkMatch?.client?.getStats?.() || null;
  if (!stats) return null;
  return { ...stats, prediction: networkBridge?.getPredictionStats?.() || null };
}

function pumpNetworkMatch(dt, nowMs) {
  if (!networkMatch) return;
  if (networkMatch.client?.closed) {
    if (game.phase === 'battle' && !game.result) networkBridge?.endDisconnected?.();
    return;
  }
  if (networkMatch.role === 'host') {
    const playerInput = game.phase === 'battle' ? networkInputFrame() : null;
    const submittedActionBits = playerInput?.actionBits || 0;
    if (submittedActionBits) networkActionBitsPending &= ~submittedActionBits;
    try {
      const snapshot = networkMatch.advance(dt * 1000, playerInput);
      if (playerInput && networkMatch.client?.lastSubmittedInputSeq != null) {
        networkBridge?.recordInput(playerInput, dt, networkMatch.client.lastSubmittedInputSeq);
      }
      acceptNetworkSnapshot(snapshot, dt);
    } catch (error) {
      networkActionBitsPending |= submittedActionBits;
      console.error('[network] host pump failed', error);
    }
  } else {
    const playerInput = game.phase === 'battle' ? networkInputFrame() : null;
    if (playerInput && networkMatch.client.connected && networkMatch.submitInput(playerInput)) {
      networkActionBitsPending = 0;
      networkBridge?.recordInput(
        playerInput,
        dt,
        networkMatch.client.lastSubmittedInputSeq,
      );
    }
    acceptNetworkSnapshot(networkMatch.update(nowMs), dt);
  }
  if (networkStatus?.diagnosticsVisible) networkStatus.update(networkDiagnostics());
}

function disposeNetworkPresentation() {
  if (networkBridge) networkBridge.dispose();
  if (networkStatus) networkStatus.dispose();
  networkBridge = null;
  networkStatus = null;
  latestNetworkSnapshot = null;
  networkActionBitsPending = 0;
  pendingNetworkEvents.length = 0;
  networkSpectator = false;
}

function closeNetworkMatch(reason = 'network_match_closed') {
  if (networkMatch) networkMatch.close(reason);
  disposeNetworkPresentation();
  networkMatch = null;
  clearActiveNetworkRoom();
}

async function beginBattleEntry(specId, mapId = null) {
  if (battleEntryPending) return;
  battleEntryPending = true;
  try {
    await startBattleLoading(specId, mapId);
  } catch (error) {
    console.error('[battle] entry failed', error);
    await battleLoad.hide();
    enterGarage();
  } finally {
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

async function waitForNetworkSnapshot(predicate, timeoutMs, label) {
  const deadline = performance.now() + timeoutMs;
  while (!latestNetworkSnapshot || !predicate(latestNetworkSnapshot)) {
    if (!networkMatch || networkMatch.client?.closed) {
      throw new Error('The match connection closed while loading.');
    }
    if (performance.now() >= deadline) throw new Error(label);
    await nextFrame();
  }
  return latestNetworkSnapshot;
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
      mapSub: pendingCfg.sub || 'Preparing battlefield',
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
  const [{ createBrowserBattleBridge }, { createNetworkStatus }] = await Promise.all([
    import('./net/browserBattleBridge.js'),
    import('./ui/networkStatus.js'),
  ]);
  markLoadStage('modules');
  networkStatus = createNetworkStatus();
  battleLoad.progress(0.08, 'Loading battlefield');
  await ensureWorld(mapId, (fraction, label) => {
    battleLoad.progress(0.08 + fraction * 0.48, label);
  });
  markLoadStage('world');
  networkMatch = await connectMatch();
  markLoadStage('connect');
  const cfg = getMapConfig(mapId);
  battleLoad.show({
    mapName: cfg.name || mapId,
    mapSub: cfg.sub || '',
    thumb: MAP_THUMBS[mapId] || '',
    biome: mapId,
    mode: modeLabel,
    allies: lobbyRosterRows({ players: matchPlayers }, displayTeam, viewerId),
    enemies: lobbyRosterRows({ players: matchPlayers },
      displayTeam === 'alpha' ? 'bravo' : 'alpha', viewerId),
  });
  networkBridge = createBrowserBattleBridge({
    engineCtx,
    game,
    bus,
    viewerId,
    spectator,
    worldCollision: world,
  });
  await networkBridge.prepareRoster(matchPlayers, (fraction, specId) => {
    battleLoad.progress(0.56 + fraction * 0.27, `Painting ${getSpec(specId)?.name || specId}`);
  });
  markLoadStage('roster');
  // Install terrain sampling before the bridge performs its one hidden
  // authority-pose sync. Remote tracks and suspension must be conformed at
  // the spawn pose before any visual is eligible to become visible.
  for (const entity of networkBridge.entities.values()) {
    if (entity.visual?.setGroundSampler) entity.visual.setGroundSampler(groundSampler);
  }
  battleLoad.progress(0.84, 'Synchronizing authority');
  const initial = await waitForNetworkSnapshot(
    (snapshot) => spectator
      ? snapshot.entities.length > 0
      : snapshot.entities.some((entity) => entity.id === viewerId),
    12000,
    'Timed out waiting for the first authoritative snapshot.',
  );
  markLoadStage('initialSnapshot');
  networkBridge.apply(initial, 1 / 60);
  // Network rosters can contain vehicles the garage-idle solo warmer never
  // touched. Bake every fielded wreck family while the opaque load screen
  // owns the frame, otherwise first blood can synchronously build burn
  // canvases/materials and freeze a constrained client for hundreds of ms.
  battleLoad.progress(0.85, 'Priming wreck variants');
  await warmNetworkWrecks(networkBridge.entities.values());
  battleLoad.progress(0.87, 'Priming combat effects');
  await warmNetworkOpeningEffects();
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
    await waitForNetworkSnapshot(
      (snapshot) => snapshot.meta?.phase === 'countdown' || snapshot.meta?.phase === 'playing',
      20000,
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
  debugAimTargetId = null;
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
  battleLoad.progress(1, 'Ready');
  await battleLoad.hide();
  markLoadStage('reveal');
  loadTrace.totalMs = Math.round(performance.now() - loadStartedAt);
  audio.resume();
  audio.ambientOn(true);
}

/**
 * Keep bot play on the original in-page simulation path. Multiplayer's
 * authority, snapshot bridge, prediction, WebRTC, and signaling modules are
 * intentionally absent here: loading them for a local battle duplicated work
 * without adding any useful authority boundary.
 */
async function beginSoloBattle({ specId, mapId } = {}) {
  const selected = ALL_TANK_IDS.includes(specId) ? specId : garage.getSelected();
  return beginBattleEntry(selected, mapId || garage.getSelectedMap());
}

/** Load the rendered battlefield, then join browser-hosted private/LAN authority. */
async function beginNetworkBattle({ role, session, lobbyState } = {}) {
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
      mapSub: pendingCfg?.sub || 'Selecting battlefield',
      thumb: pendingMapId ? MAP_THUMBS[pendingMapId] || '' : '',
      biome: lobbyState.mapId === 'random' ? 'none' : lobbyState.mapId,
      mode: modeLabel,
      allies: lobbyRosterRows(lobbyState, displayTeam, viewerId),
      enemies: lobbyRosterRows(lobbyState,
        displayTeam === 'alpha' ? 'bravo' : 'alpha', viewerId),
    });
    battleLoad.progress(0.01, 'Opening battle channel');
    const {
      beginPrivateHostMatch,
      beginPrivateClientMatch,
      buildPrivateMatchPlayers,
      resolvePrivateMatchMap,
    } = await import('./net/privateMatchHandoff.js');
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
        ? beginPrivateHostMatch({ session, lobbyState, worldCollision: world })
        : beginPrivateClientMatch({ session, playerId: viewerId, lobbyState }),
    });
    attachNetworkRoom(lobbyState);
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
          }))
          : [],
      };
    }
    console.error('[network] entry failed', error);
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
  if (!networkMatch || networkMatch.client?.closed || battleEntryPending ||
      lobbyState?.phase !== 'starting' || round <= networkPresentedRound) {
    networkRematchPending = false;
    return false;
  }
  battleEntryPending = true;
  networkPresentedRound = round;
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
      mapSub: pendingCfg?.sub || 'Selecting battlefield',
      thumb: pendingMapId ? MAP_THUMBS[pendingMapId] || '' : '',
      biome: lobbyState.mapId === 'random' ? 'none' : lobbyState.mapId,
      mode: modeLabel,
      allies: lobbyRosterRows(lobbyState, displayTeam, viewerId),
      enemies: lobbyRosterRows(lobbyState,
        displayTeam === 'alpha' ? 'bravo' : 'alpha', viewerId),
    });
    battleLoad.progress(0.01, 'Preparing the next round');
    disposeNetworkPresentation();
    latestNetworkSnapshot = null;
    const { buildPrivateMatchPlayers, resolvePrivateMatchMap } =
      await import('./net/privateMatchHandoff.js');
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
    closeNetworkMatch('rematch_entry_failed');
    await battleLoad.hide();
    enterGarage();
    return false;
  } finally {
    battleEntryPending = false;
    networkRematchPending = false;
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
      mapSub: 'Connecting to dedicated authority',
      thumb: '',
      biome: ticket.mapId,
      mode: modeLabel,
      allies: lobbyRosterRows({ players: ticket.roster }, displayTeam, viewerId),
      enemies: lobbyRosterRows({ players: ticket.roster },
        displayTeam === 'alpha' ? 'bravo' : 'alpha', viewerId),
    });
    battleLoad.progress(0.01, 'Opening dedicated channel');
    const { beginDedicatedClientMatch } = await import('./net/dedicatedClient.js');
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
  // battle_countdown r1: the PLAYER entry path arms an indefinite sim hold
  // the moment the roster exists — the sim used to run live UNDER the
  // loading screen (pointer lock is grabbed by the BATTLE click), so a
  // click while the rosters were still up fired the gun. openBattle()
  // resolves the hold to the visible 5 s countdown when the screen drops.
  // Debug/probe entries (opts.preBattleHold unset) keep preBattleS = 0 and
  // are driveable immediately, exactly as before.
  game.preBattleS = opts.preBattleHold ? Infinity : 0;
  // PERF (performance_budget r1): first-combat fallback for the post-ready
  // idle warm — no-op when the idle callback already ran (the common case).
  // The loading-screen path warms explicitly AFTER the roster is picked, so it
  // skips this (the pick is what decides which visuals are needed).
  if (!opts.deferVisuals) warmCombatPipeline();
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
  selectedSpecId = specId;
  rememberSpecId(specId);
  debugAimTargetId = null; // sticky drive-test aim never carries across battles
  // MAP-CONFIG WIRING: battle on the picked map ('random' rolls here)
  switchMap(resolveMapId(mapId || pendingMapId));
  setWorldDormant(false); // the battle world wakes up (see setWorldDormant)
  // DESTRUCTIBLES r1: worlds are cached and reused across battles — stand
  // every broken wall/fence/sandbag/prop back up for the rematch.
  if (world.resetDestructibles) world.resetDestructibles();
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
  setupBattle(game, specId, world, {
    random: true, deferVisuals: !!opts.deferVisuals,
    deferCamoRepaint: true,
  });
  battleStaged = true;
  // perf-r2f: ONE chunked sweep covers the biome flip AND the bot camo rolls
  // setupBattle just made (its own trailing sweep is deferred by the flag
  // above). The old back-to-back sync sweeps repainted the warm cache in a
  // single task — a rematch measured a 14 s frame with the loading bar
  // frozen. Chunked, the bar animates between entry repaints; the player's
  // spec paints in the first slice. startBattleLoading AWAITS the handle
  // before the wreck dances — burnt bakes copy the camo canvases, so paint
  // must be final first (the sync sweep's ordering, preserved).
  camoSweepP = applyCamoPatternsChunked({ priorityIds: [specId] });
  // SHOT-INFO identity (killcam_shotinfo r3): set synchronously — hud.update
  // only forwards it after the first rendered frame, which dropped hits
  // resolved in the very first sim ticks (headless replays / spectators).
  hud.shotInfo.setPlayer(game.player.id);
  // Fresh battlefield fx: clear scars/tracers/smoke columns left on (or by)
  // last battle's wrecks — scar decals are parented onto tank hulls and would
  // otherwise carry into the rematch.
  fx.resetAll();
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
  // The battle-open flyby is armed only once the player can actually SEE it:
  // the loading-screen path calls openBattle() when the screen clears.
  if (!opts.deferVisuals) openBattle();
}

/** Hand the screen to the battle in an immediately readable chase pose. */
function openBattle() {
  // Re-snap here because the loading screen may have covered several warm-up
  // frames. Starting aligned behind the hull avoids the old front/side flyby
  // that made the selected tank appear to face the wrong direction, and it
  // avoids a large vegetation repartition/upload during the first seconds.
  if (game.player && game.player.state) {
    rig.release();
    rig.snapArcade(2, game.player.state.yaw, -10 * DEG);
  }
  // battle_countdown r1: the loading screen is down and the world is live —
  // resolve the entry hold armed at roster spawn into the visible countdown.
  // Camera look stays free; hulls, turrets and triggers release at zero.
  if (game.preBattleS === Infinity) {
    game.preBattleS = PRE_BATTLE_HOLD_S;
    // perf-r2e: one re-warm sweep mid-countdown — materials that land AFTER
    // the loading screen (late kit additions, graduate passes, straggler
    // swaps) get their programs linked while everything is still frozen and
    // a one-frame hitch is invisible. Repeats are cache hits.
    setTimeout(() => {
      if (game.phase === 'battle' && game.preBattleS > 0) compileHiddenVariantsChunked();
    }, 900);
  }
  audio.resume(); // the entry-gate keypress already unlocked the context
  audio.ambientOn(true);
  // Probe/debug starts skip the visible countdown; they still get one rollout
  // edge after the AudioContext exists. Player entries emit at countdown zero.
  if (game.preBattleS <= 0) bus.emit('battle:rollout', {});
}
// battle_countdown r1: WoT-style pre-battle freeze length (player path only).
const PRE_BATTLE_HOLD_S = 5;

function enterGarage({ preserveRoom = !!(
  activeNetworkRoom && networkMatch && !networkMatch.client?.closed && game.result
) } = {}) {
  if (preserveRoom) disposeNetworkPresentation();
  else closeNetworkMatch('returned_to_garage');
  // battle_countdown r1: leaving mid-countdown (Esc -> garage) clears the hold.
  game.preBattleS = 0;
  // SHOT-MODE RESET: see startBattle — the garage is a live-mode entry too.
  shotMode = false;
  perfHud.setCaptureHidden(false);
  fx.setFrozen(false);
  game.phase = 'garage';
  // PAUSE: leaving battle clears any paused overlay (Leave Battle closes the
  // panel itself before calling here — this covers every other exit path).
  // After the phase flip above, isBattleActive() is already false, but pass
  // noRelock anyway so no exit path can ever fire a gesture-less lock request.
  if (settings.isOpen()) settings.close({ noRelock: true });
  setWorldDormant(true); // GARAGE PERF: the battlefield stops costing anything
  // camo_spotting r5: bot biome-camo overrides are battle-scoped — drop
  // them so the pedestal/picker show the player's own persisted selection.
  clearCamoOverrides();
  // perf-r2f: chunked — the hero repaints in the first slice (inside the
  // transition veil); parked roster entries follow one frame apart instead
  // of freezing the garage reveal for the whole cache.
  applyCamoPatternsChunked({ priorityIds: [selectedSpecId] });
  setGarageSpots(true);
  setGarageSunTrim(true);
  bus.emit('phase:change', { phase: 'garage' });
  endOverlay.style.display = 'none';
  if (document.exitPointerLock) document.exitPointerLock();
  hud.setMode('hidden');
  garage.show(selectedSpecId);
  garageCameraPose();
  showroom.start(); // SHOWROOM CAMERA: hero framing + drag-orbit takes over
  audio.ambientOn(false);
  audio.playGarageSting();
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
  transition.run(() => { enterGarage(); }, {
    kicker: 'Leaving battle', title: 'Garage',
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
  if (activeNetworkRoom?.phase !== 'waiting') return;
  networkMatch?.roomCommand?.({ type: 'set_ready', ready: !!ready });
});

function startActiveRoomRound() {
  if (networkMatch?.role !== 'host' || activeNetworkRoom?.phase !== 'waiting') return false;
  const words = new Uint32Array(1);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(words);
  else words[0] = (Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0;
  return networkMatch.roomCommand({ type: 'start', matchSeed: words[0] });
}

bus.on('ui:roomStart', startActiveRoomRound);

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
    atGunLimit: false,
    gunLimitSpec: false, // GUN LIMIT label (movement.js r3: spec pins only)
    reload: { t: 0, totalS: 1 },
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

// controls_gunnery r4: MUZZLE-PATH CLEARANCE, shared by the live reticle
// (computeAimInfo) and the headless aim gate (debugAimState). The r2 test
// stopped a full 6 m short of the aim point, so a knife-edge crest sitting at
// a hull-down target's bounding sphere read as CLEAR while every shell died
// in it (r4 E2E: 3 settled shots at 290-347 m, green pen marker, converged
// circle, misses 118-394 m into terrain). Two rays now decide:
//  1. CENTER ray to within 1.5 m of the aim point — the aim point itself sits
//     >= 0.5·height above the target's ground contact, so target-adjacent
//     terrain can only intersect when a real crest interposes;
//  2. GRAZE ray along the lower dispersion cone (the cone diverges from the
//     muzzle, so its lower boundary at fraction k of the reticle radius is
//     the straight line muzzle -> aim point dropped by k*r; the reticle
//     circle is the ~2-sigma envelope). k = 0.65 (~1.3 sigma): flags lays
//     where ~10%+ of the shot distribution eats a mid-path crest. Probing
//     the FULL radius (first r4 attempt) vetoed nearly every rolling-terrain
//     lay on the verdant map at 150-250 m (probe: settled errMrad 0.6-1.1,
//     center ray clear, stable phantom "blocked at 149 m") — a 2-sigma tail
//     graze is a ~2% whiff, which WoT would not warn about either. The last
//     15% is exempt so the target's own ground plane / glacis apron never
//     strobes the warning on honest lays.
const _mpbA = new THREE.Vector3();
const _mpbB = new THREE.Vector3();
function muzzlePathBlockDist(muzzle, aimPoint, dispersionRadM) {
  _mpbB.copy(aimPoint).sub(muzzle);
  const pathLen = _mpbB.length();
  if (pathLen <= 12) return null;
  _mpbB.multiplyScalar(1 / pathLen);
  const blk = worldRaycast(muzzle, _mpbB, pathLen - 1.5);
  if (blk) return blk.dist;
  if (dispersionRadM > 0.1) {
    _mpbA.copy(aimPoint);
    // 0.65 of the reticle radius ~= the 1.3-sigma line: flags lays where
    // ~10%+ of the cone dies mid-path (measured residual class: settled
    // 250 m shots dying 40 m short at ~84% of the path), while the full-r
    // probe (2-sigma tail, ~2%) vetoed nearly every rolling-terrain lay.
    _mpbA.y -= dispersionRadM * 0.65;
    _mpbB.copy(_mpbA).sub(muzzle);
    const len2 = _mpbB.length();
    if (len2 > 12) {
      _mpbB.multiplyScalar(1 / len2);
      const graze = worldRaycast(muzzle, _mpbB, len2 * 0.85);
      if (graze) return graze.dist;
    }
  }
  return null;
}

/**
 * Resolve the exact articulated bore used by tryFire and its endpoint at the
 * requested range. This is the sole live source for the gun marker,
 * penetration ray and blocked-path warning; no post-barrel aim snap exists.
 */
function playerGunCenterRay(p, aimPoint, outOrigin, outDir, outTarget) {
  p.visual.gunMuzzleWorld(outOrigin);
  p.visual.gunDirWorld(outDir);
  const rangeM = Math.max(outOrigin.distanceTo(aimPoint), 6);
  outTarget.copy(outOrigin).addScaledVector(outDir, rangeM);
  return rangeM;
}

function computeAimInfo() {
  const p = game.player;
  const aim = frameInfo.aim;
  aim.point.copy(rig.aimPoint);
  aim.distM = rig.aimDist;
  aim.dispersionRadM = computeDispersionRadM(p.spec, p.state, rig.aimDist);
  aim.atGunLimit = p.state.atGunLimit;
  aim.gunLimitSpec = !!p.state.gunLimitSpec;
  aim.reload.t = p.combat.reload.t;
  aim.reload.totalS = p.combat.reload.totalS;
  aim.shellSlot = p.combat.shellSlot;
  aim.shells = shellCards;
  aim.zoom = rig.mode === 'SNIPER' ? rig.zoom : 1;

  // WoT dual-reticle contract (official controls guide): the camera marker
  // communicates where the player LOOKS; the aiming circle + gun marker
  // communicate where the gun can ACTUALLY fire. The shell leaves on this
  // exact physical bore, including while it is slewing or pinned at a limit.
  aim.gunDistM = playerGunCenterRay(p, aim.point, _rayO, _rayD, _v2);
  aim.gunTargetId = null;
  aim.gunMarker.copy(_v2);

  // BLOCKED-SHOT INDICATOR (controls_gunnery r2): the camera and muzzle have
  // different origins — near crests/walls/poles the camera can see a point a
  // shell cannot reach. Raycast the authoritative shot-center path every HUD
  // frame; the reticle turns red + prints the blocking distance when an
  // obstruction sits short of its requested range.
  // r4: raycast margin 6 m -> 1.5 m + dispersion-cone graze test — see
  // muzzlePathBlockDist. The old margin made hull-down crests invisible.
  aim.blockedDistM = muzzlePathBlockDist(_rayO, _v2, aim.dispersionRadM);
  // gameplay_feel r7 (round critique MAJOR): the "PATH BLOCKED N m" TEXT
  // fired constantly during ordinary cross-country driving — every time
  // server-aim rested on a nearby rise (parked verdant 32 m, desert 10-11 m
  // palm grove/freeze captures). WoT never shouts text for a gun resting on
  // close terrain; this is the same every-crest noise class the GUN LIMIT
  // label got dwell-gated for in movement.js (gunLimitSpec). The LABEL now
  // requires (same recipe): ~0.5 s of CONTINUOUS block AND (stationary/
  // creeping OR a far ask ≥ 120 m — pinning there is a deliberate lay, not
  // terrain noise). The red reticle TINT stays tick-instant via
  // aim.blockedDistM; only the text is gated (hud.js prints blockedLabel).
  if (aim.blockedDistM != null) {
    if (blockedSinceMs < 0) blockedSinceMs = performance.now();
    const dwellOk = performance.now() - blockedSinceMs >= 500;
    const speedKmh = Math.abs(p.state.speed) * 3.6;
    aim.blockedLabel = dwellOk && (speedKmh <= 10 || rig.aimDist >= 120);
  } else {
    blockedSinceMs = -1;
    aim.blockedLabel = false;
  }

  // Penetration indicator: first enemy plate under the ACTUAL GUN ray. The
  // old camera-ray query could paint the screen-center marker green while a
  // depression/elevation/traverse clamp held the barrel somewhere else —
  // exactly the false-ready state WoT's separate gun marker prevents.
  // Keep the short anti-strobe hold, but bind the held color to its gun-ray
  // target id so the HUD never assigns it to the camera marker.
  aim.penRatio = null;
  const shellSpec = p.spec.gun.shells[p.combat.shellSlot];
  const gunWorldHit = worldRaycast(_rayO, _rayD, 800);
  let bestDist = gunWorldHit ? gunWorldHit.dist : 800;
  let bestInfo = null;
  let bestTargetId = null;
  for (const ent of game.tanks) {
    if (ent.isPlayer || ent.team === p.team || !ent.state || !ent.combat || ent.combat.destroyed) continue;
    _v1.copy(ent.state.pos);
    _v1.y += ent.spec.dims.heightM * 0.5;
    _v1.sub(_rayO);
    const proj = _v1.dot(_rayD);
    if (proj < 0 || proj > bestDist + ent.spec.armor.boundingRadiusM) continue;
    const r = ent.spec.armor.boundingRadiusM * AIM_STICKY_INFLATE;
    if (_v1.lengthSq() - proj * proj > r * r) continue;
    const q = queryAimArmor(
      _rayO, _rayD, Math.min(800, bestDist + ent.spec.armor.boundingRadiusM),
      tankPoseFromState(ent.state, _aimPose), ent.spec.armor,
    );
    if (q && q.distM < bestDist) {
      bestDist = q.distM;
      bestInfo = q;
      bestTargetId = ent.id;
    }
  }
  if (bestInfo) {
    aim.gunMarker.copy(bestInfo.point);
    aim.gunDistM = bestDist;
    aim.gunTargetId = bestTargetId;
    aim.penRatio = estimatePenRatio(shellSpec, bestDist, bestInfo);
    lastPenRatio = aim.penRatio;
    lastGunTargetId = bestTargetId;
    lastPenUntilMs = performance.now() + AIM_STICKY_HOLD_MS;
  } else {
    if (gunWorldHit) {
      aim.gunMarker.copy(gunWorldHit.point);
      aim.gunDistM = gunWorldHit.dist;
    }
    if (performance.now() < lastPenUntilMs) {
      aim.penRatio = lastPenRatio; // sticky-reticle hysteresis (see above)
      aim.gunTargetId = lastGunTargetId;
    }
  }
}
let lastPenRatio = null;
let lastGunTargetId = null;
let lastPenUntilMs = -Infinity;
// gameplay_feel r7: continuous-block dwell start for the PATH BLOCKED label
let blockedSinceMs = -1;

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
const _listenerPose = { pos: null, forward: _fwd, kind: 'camera' }; // reused — no per-frame literal
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

function updateDustAndSync(dtFrame) {
  for (const ent of game.tanks) {
    // PERF r3: staged-battle visuals are deferred to post-ready idle — skip
    // entities whose visual has not streamed in yet (garage phase only;
    // warmCombatPipeline builds all of them before battle/shot frames).
    if (!ent.state || !ent.combat || !ent.visual) continue;
    // effects_combat r1: pass the real frame dt so self-timed visual
    // timelines (recuperator recoil, turret-pop arc, ember cooldown) play at
    // wall-clock speed on 120 Hz displays (undefined at boot -> 1/60 default).
    // PERF (perf-r2): the camera distance lets the visual run its track
    // dressing (per-wheel heightAt conform + link/band instance pass) at a
    // reduced cadence beyond fine-detail range — battle loop only; studio,
    // killcam and staged poses omit it and keep full-rate updates.
    ent.visual.syncFromState(ent.state, dtFrame,
      camera.position.distanceTo(ent.state.pos));
    // SPOTTING WIRING: unspotted live enemies do not render (WoT rule).
    // Wrecks stay visible; the player is never gated; outside battle
    // (garage/shot/killcam) everything renders. isSpotted already includes
    // the 5 s linger, so the eased fade flips out of contact, not mid-fight.
    if (game.phase === 'battle' && game.spotting && ent.team === 'enemy') {
      const visible = ent.combat.destroyed ||
        game.spotting.isSpotted(ent.id, 'player', game.player);
      const target = visible ? 1 : 0;
      if (ent._spotFade === undefined) ent._spotFade = target;
      // eased fade to avoid popping (0 -> 1 in ~0.35 s); no dt (boot) = snap
      ent._spotFade += (target - ent._spotFade) *
        (dtFrame === undefined ? 1 : Math.min(1, dtFrame / 0.35));
      ent.visual.setVisible(ent._spotFade > 0.02);
    } else if (game.phase === 'battle' && !ent.isPlayer) {
      // Allies (and enemies in the no-spotting fallback) are force-shown; the
      // PLAYER's hull visibility is OWNED by the camera rig — it hides the
      // hull while scoped (sniper). Force-showing it here every frame put the
      // own tank back IN FRONT of the sniper camera one step after the rig
      // hid it: the scope rendered the inside of the hull/mantlet (a
      // near-black frame the grade pass then crushed to pure black at every
      // zoom).
      ent.visual.setVisible(true);
    }
    if (game.phase === 'battle' && !ent.combat.destroyed) {
      // PERF (perf-budget): dust/exhaust emission was per-FRAME — an unlocked
      // 120 fps client emitted 2x the particles the fx were tuned for at 60,
      // rotating the smoke/dust pools twice as fast late-battle. Fixed 60 Hz
      // cadence (up to 2 catch-up ticks) keeps the tuned 60 fps look identical
      // and makes emission frame-rate-independent.
      ent._fxAcc = (ent._fxAcc || 0) + (dtFrame === undefined ? 1 / 60 : dtFrame);
      if (ent._fxAcc < 1 / 60) continue;
      const fxTicks = Math.min(2, Math.floor(ent._fxAcc * 60));
      ent._fxAcc -= fxTicks / 60;
      const sp = Math.abs(ent.state.speed);
      const throttle = Math.abs(ent.input.throttle || 0);
      _fwd.set(Math.sin(ent.state.yaw), 0, Math.cos(ent.state.yaw));
      if (sp > 0.8) {
        const intensity = Math.min(1, sp / (ent.spec.topSpeedKmh / 3.6));
        _v3.set(_fwd.z, 0, -_fwd.x); // right axis
        // Emit from BOTH rear track contact points; multiple puffs per frame
        // at speed so a top-speed run reads as a rolling plume (r1 critique).
        const puffs = (intensity > 0.6 ? 3 : 1) * fxTicks;
        for (let side = -1; side <= 1; side += 2) {
          _v1.copy(ent.state.pos)
            .addScaledVector(_fwd, -ent.spec.dims.hullLengthM * 0.45)
            .addScaledVector(_v3, side * ent.spec.dims.widthM * 0.45);
          for (let i = 0; i < puffs; i++) fx.dust(_v1, _fwd, intensity);
        }
      }
      // Exhaust puffs off the engine deck whenever the engine is under load.
      // effects_combat r2: the stationary hero tank idles visibly during the
      // opening flyby (motion accent), and era picks the exhaust character —
      // WW2 diesels puff sooty, modern turbines emit a fast thin haze.
      // effects_combat r1: always emit — a parked idling tank still breathes
      // (idle floor 0.10; fx.exhaust is probability-gated so idle stays wispy)
      {
        const load = Math.max(0.10, (rig.cinematicActive && ent.isPlayer) ? 0.3 : 0,
          Math.min(1, throttle * 0.7 + (sp / (ent.spec.topSpeedKmh / 3.6)) * 0.5));
        _v1.copy(ent.state.pos).addScaledVector(_fwd, -ent.spec.dims.hullLengthM * 0.42);
        _v1.y += ent.spec.dims.heightM * 0.72;
        fx.exhaust(_v1, load, ent.spec.era === 'ww2');
      }
      // effects_combat r1: crushable props — pole vs hull overlap triggers
      // the hinge-topple (world.crushProp) + wood-splinter burst.
      if (sp > 1.2 && world && world.crushables && world.crushables.length) {
        const hl = ent.spec.dims.hullLengthM * 0.5 + 0.5;
        // Lightweight loop-contact props bypass the sim collider, so derive
        // the signed travel direction here. Facing direction alone made props
        // rammed in reverse fall toward the moving tank.
        _v2.copy(_fwd).multiplyScalar(Math.sign(ent.state.speed) || 1);
        for (let ci = 0; ci < world.crushables.length; ci++) {
          const c = world.crushables[ci];
          if (c.toppled) continue;
          const dx = c.x - ent.state.pos.x, dz = c.z - ent.state.pos.z;
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
function scheduleRaf() {
  if (rafQueued) return;
  rafQueued = true;
  requestAnimationFrame((t) => { rafQueued = false; tick(t); });
}
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
  // Frame dt clamp (0.1 s): a stalled/backgrounded loop never integrates its
  // whole gap. The PAUSE block below extends this on the resume edge.
  let dtR = Math.min(0.1, Math.max(0, (nowMs - lastMs) / 1000));
  lastMs = nowMs;
  devTrace?.frame(dtR * 1000);

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
    fx.update(dtR, game.shells, camera);
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
  camInput.mouseDX = paused ? 0 : _mouse.x;
  camInput.mouseDY = paused ? 0 : _mouse.y;
  camInput.wheel = paused ? 0 : wheelStep;
  // CURSOR-AIM FALLBACK: pointer lock unavailable — the rig raycasts through
  // the real cursor instead of screen center and the turret chases that point.
  const cursorAimNow = input.isCursorAim();
  camInput.cursorAim = inBattle && !paused && cursorAimNow;
  if (camInput.cursorAim) {
    input.getCursorNdc(_cursorNdc);
    camInput.cursorX = _cursorNdc.x;
    camInput.cursorY = _cursorNdc.y;
  }
  // RMB ROUTING (gunnery r1, owner feature): what the RMB-bound 'freeCamera'
  // action does is the player's settings.rmbMode pick —
  //   'hold' (DEFAULT, owner ask): hold-to-aim — the rig enters sniper while
  //     held and returns to the prior arcade zoom + preserved aim pitch on
  //     release (CamInput.aimHold; edges live in cameraRig).
  //   'toggle': tap toggles sniper — routed through the same rising-edge
  //     lane as Shift.
  //   'freelook': the WoT-classic gun-lock free look (pre-r1 behavior).
  //     Meaningless in CURSOR-AIM mode (the camera never mouselooks), where
  //     it degrades to the legacy RMB sniper toggle so no-pointer-lock embeds
  //     keep a mouse-reachable scope on the button players aim with.
  // Shift = sniper stays live in EVERY mode (movement-physics.md §9.2).
  // isDown() consumes the sub-frame tap latch, so 'freeCamera' is read
  // exactly once per frame.
  const rmbMode = input.getSettings().rmbMode || 'hold';
  const rmbHeld = input.isDown('freeCamera');
  camInput.rmb = rmbMode === 'freelook' && !cursorAimNow ? rmbHeld : false;
  camInput.aimHold = inBattle && !paused && rmbMode === 'hold' && rmbHeld;
  camInput.shiftPressed = input.isDown('sniperToggle') ||
    (rmbMode === 'toggle' && rmbHeld) ||
    (rmbMode === 'freelook' && cursorAimNow && rmbHeld);
  wheelStep = 0;

  // Network authority keeps pumping while the loading screen owns the page,
  // then consumes the same polled controls once the shared countdown opens.
  pumpNetworkMatch(dtR, nowMs);

  // 2. fixed-step simulation (held while the settings panel is open)
  if (inBattle && !paused && !kcActive) {
    // battle_countdown r1: pre-battle hold — the sim does not step AT ALL
    // while preBattleS > 0 (no movement, no AI, no fire, no battle clock;
    // spawn poses were support-solved at roster build). The camera rig runs
    // outside the sim, so looking around stays free, exactly like WoT's
    // pre-battle freeze. simAcc stays drained so release cannot replay a
    // catch-up burst of queued sim steps. The rest of the frame (rig,
    // visuals, fx, render) runs normally — that is the whole point: the
    // first-seconds jank lands while nothing can move or shoot.
    if (networkMatch) {
      // The server/host owns both the countdown and every simulation step.
      // `game.preBattleS` is presentation copied from snapshot metadata.
      hud.preBattleCountdown(game.preBattleS);
      simAcc = 0;
    } else if (game.preBattleS > 0) {
      if (game.preBattleS !== Infinity) { // Infinity = still under the loading screen
        const heldS = game.preBattleS;
        game.preBattleS = Math.max(0, game.preBattleS - dtR);
        hud.preBattleCountdown(game.preBattleS); // 0 on the crossing frame = release flash
        if (heldS > 0 && game.preBattleS === 0) bus.emit('battle:rollout', {});
      }
      simAcc = 0;
    } else {
      simAcc = Math.min(simAcc + dtR, SIM_DT * MAX_SIM_STEPS);
      while (simAcc >= SIM_DT) {
        simStep(game, bus, world, rig, collider);
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
      if (document.exitPointerLock) document.exitPointerLock();
      if (rig.startDeathCam) rig.startDeathCam(); // beat framing: wreck orbit
      const afterDeath = () => {
        veilHud(false);
        rig.release();
        if (rig.startDeathCam) rig.startDeathCam();
      };
      kcPending = {
        deadline: performance.now() + DEATH_BEAT_MS,
        fire: () => {
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

  // 3. camera rig (kill-cam drives the camera through rig.setExternalPose)
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
    occlFocus = _occlFocus.copy(cameraFocus.state.pos);
    occlFocus.y += cameraFocus.spec.dims.heightM * 0.75;
  }
  if (world && !worldDormant) world.update(dtR, camera.position, _fwd, occlFocus);

  // 5. visuals + dust (frozen during the kill-cam replay — tanks hold the
  // pose they died in; the x-ray reads the snapshot, not live state).
  // PAUSE: skipped entirely while live-paused — poses hold, self-timed visual
  // timelines (recoil, embers) don't age, no dust/exhaust pumps off hulls
  // whose frozen state still carries speed, spot-fades hold.
  if (!kcActive && !livePaused) updateDustAndSync(dtR);

  // 6. fx — dt 0 while live-paused pins the shared particle clock, which is
  // the one timeline every particle/timer/light/decal ages against (the same
  // mechanism deterministic shot captures rely on), so effects hold mid-air.
  // killcam r2: the replay's IMPACT beat briefly dilates the fx clock (~0.55x
  // through the turret launch) — the same clock drives the pop arc, so the
  // whole destruction slows coherently. 1 everywhere else.
  fx.update(livePaused ? 0 : dtR * (kcActive ? killcam.fxTimeScale : 1),
    game.shells, camera);

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
    if (game.player) computeAimInfo();
    hud.update(frameInfo);
    touchControls.update(hudFocus.state?.speed || 0);
    damagePanel.update(hudFocus.combat);
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
  } else {
    _listenerPose.pos = camera.position;
    _listenerPose.kind = kcActive || killcam.isActive() ? 'killcam-camera' : 'camera';
  }
  audio.update(dtR, _listenerPose, game.tanks);

  // 9-10. shadows + post
  // FEEL r12: fov lerps (scope zoom / aim transitions / per-shot recoil
  // kick) hit this EVERY frame of the animation — the full updateFrustums
  // swept all CSM-registered materials each time (~1 ms/frame, the "look
  // around is laggy" report). Splits are fov-independent; refresh only the
  // cascade geometry.
  if (camera.fov !== lastFov) { lighting.updateFov(); lastFov = camera.fov; }
  lighting.update();
  post.render(dtR);
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
};

// MAP-CONFIG WIRING: pin the shot to its map, re-seating the staged battle
// (deterministic spawns) whenever the map actually changes.
function ensureShotWorld(mapId) {
  // boot r8: the battlefield is deferred, so a staged capture may well be the
  // first thing that needs one at all. Synchronous by contract (__SHOTS.set
  // must fully determine the frame) — this is why createMap keeps its
  // non-chunked form alongside createMapAsync.
  if (!world || world.mapId !== mapId) switchMap(mapId);
  setWorldDormant(false);
  // camo_spotting r2: staged captures must show biome-correct AUTO paint —
  // startBattle resolves the camo biome but the contract views do not pass
  // through it, so shots could carry the previous biome's paint.
  setCamoBiome(mapId);
  applyCamoPatterns();
  // Always restage deterministically: a prior random-roster battle must not
  // leak into the screenshot contract (recipes reference tiger1/t90m/etc).
  setupBattle(game, 'm1a2', world);
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
  aim.blockedDistM = null; // screenshot views never show the blocked warning
  aim.blockedLabel = false;
  aim.atGunLimit = false;
  aim.gunLimitSpec = false;
  aim.reload.t = forcedAim.reload.t;
  aim.reload.totalS = forcedAim.reload.totalS;
  aim.shellSlot = forcedAim.shellSlot;
  aim.shells = shellCards;
  aim.zoom = forcedAim.zoom || 1;
  game.player.visual.gunMuzzleWorld(_v1);
  aim.gunMarker.copy(rig.aimPoint);
  refreshSpotFrame(); // SPOTTING WIRING: camo indicator in forced HUD stills
  hud.update(frameInfo);
  // Preserve the live dual-reticle fields in deterministic screenshot views;
  // the recipe only carries scalar aim values.
  hud.forceAimDisplay({
    ...forcedAim,
    point: aim.point,
    gunMarker: aim.gunMarker,
    gunDistM: aim.gunDistM,
    gunTargetId: aim.gunTargetId,
  });
}

const SHOT_VIEWS = {
  battlefield() {
    hud.setMode('hidden');
    // Elevated SW of the village looking NE across the map: player tank at
    // its spawn in the near field, village mid-frame, enemy arc beyond.
    const h = world.heightField.getHeightAt(-60, -140);
    _v1.set(-60, h + 26, -140);
    _v2.set(80, world.heightField.getHeightAt(80, 160) + 4, 160);
    rig.setExternalPose(_v1, _v2, 55);
  },
  player_view() {
    rig.snapArcade(2, game.player.state.yaw, -12 * DEG);
    forcedHudFrame('battle', {
      distM: 240,
      penRatio: 1.3,
      reload: { t: 3.4, totalS: 6 }, // mid-reload: sweep ring + countdown visible
      shellSlot: 0,
      dispersionRadM: computeDispersionRadM(game.player.spec, game.player.state, 240),
      shells: shellCards,
    });
  },
  sniper_view() {
    // aim at the nearest enemy bearing WITH a clear sightline. r4: the old
    // check raycast ONE point (heightM*0.6) and accepted any blocker within
    // boundingRadius+1 m of the center — a wall 3 m in front of the hull
    // passed, so the flagship shot framed a nameplate floating over stone.
    // Now turret top, hull center AND both flank edges must all be reachable
    // (no static blocker more than 1 m short of the sample); when no living
    // enemy qualifies, the nearest one is RESTAGED onto surveyed open ground
    // so the contract ("aimed at an enemy") can never capture blind.
    const p = game.player;
    _v1.copy(p.state.pos);
    _v1.y += 2.2;
    // Canopy/bush proxies: world.raycast only sees terrain + prop AABBs, so a
    // bearing through a FOREST passed as "clear" (the r3 shot framed exactly
    // that). Sweep the concealer circles along the sight line too — anything
    // past the scope-corridor fade (~60 m) and short of the tank blocks.
    const conceal = world.getConcealment ? world.getConcealment() : [];
    const clearTo = (ent) => {
      const tp = ent.state.pos;
      const h = ent.spec.dims.heightM;
      const w = (ent.spec.dims.widthM || ent.spec.armor.boundingRadiusM) * 0.42;
      const bx = tp.x - p.state.pos.x;
      const bz = tp.z - p.state.pos.z;
      const flat = Math.max(Math.hypot(bx, bz), 1e-3);
      const inv = 1 / flat;
      const ux = bx * inv, uz = bz * inv;  // bearing unit (XZ)
      const lx = -uz, lz = ux;             // lateral unit ⟂ bearing
      for (const c of conceal) {
        const wx = c.x - _v1.x, wz = c.z - _v1.z;
        const t = wx * ux + wz * uz;
        if (t < 60 || t > flat - 8) continue;
        if (Math.abs(wx * uz - wz * ux) < c.r + 1.2) return false;
      }
      const samples = [
        [0, h * 0.92, 0],                 // turret top
        [0, h * 0.50, 0],                 // hull center
        [0, h * 0.25, 0],                 // lower hull (r4 hud_ui: a crest 2 m
        // short of the hull passed the old -1 m tolerance and hid the tank)
        [lx * w, h * 0.55, lz * w],       // left flank edge
        [-lx * w, h * 0.55, -lz * w],     // right flank edge
      ];
      for (const [ox, oy, oz] of samples) {
        _v2.set(tp.x + ox, tp.y + oy, tp.z + oz);
        _v3.copy(_v2).sub(_v1);
        const dd = _v3.length();
        _v3.multiplyScalar(1 / Math.max(dd, 1e-3));
        const block = world.raycast(_v1, _v3, dd);
        if (block && block.dist < dd - 0.25) return false;
      }
      return true;
    };
    // r4 hud_ui: the x8 frame must catch NO free-standing prop inside ~60 m
    // of the trunnion — a roadside pole or crop-row post crossing the frame
    // edge smears across the optics (scope-edge blur + vignette) and reads
    // as a corrupted capture. Many of these props are VISUAL-ONLY (planted
    // without colliders), so raycasts cannot see them: collect every
    // non-foliage instanced-prop origin near the eye once, then reject any
    // bearing that keeps one inside the near view cone. Foliage/grass is
    // excluded (the scope corridor fade already clears it); tank visuals are
    // excluded via their roots. Colliders get a dense ray fan on top.
    const nearProps = [];
    {
      const tankRoots = new Set();
      for (const t of game.tanks) if (t.visual && t.visual.root) tankRoots.add(t.visual.root);
      scene.traverse((o) => {
        if (!o.isInstancedMesh) return;
        for (let anc = o; anc; anc = anc.parent) if (tankRoots.has(anc)) return;
        const mat = Array.isArray(o.material) ? o.material[0] : o.material;
        const key = mat && mat.customProgramCacheKey ? mat.customProgramCacheKey() : '';
        if (/^world-(tree|grass)/.test(key)) return; // corridor fade covers foliage
        o.updateMatrixWorld();
        const arr = o.instanceMatrix.array;
        for (let i = 0; i < o.count; i++) {
          _v2.set(arr[i * 16 + 12], arr[i * 16 + 13], arr[i * 16 + 14])
            .applyMatrix4(o.matrixWorld);
          const d = Math.hypot(_v2.x - _v1.x, _v2.z - _v1.z);
          if (d > 1 && d < 60) nearProps.push([_v2.x, _v2.z, d]);
        }
      });
    }
    const nearClear = (yaw, pitch) => {
      const hv = (55 / 8) * DEG * 0.55; // half vertical FOV at x8 + pad
      const hh = hv * (16 / 9);         // half horizontal
      for (const [pxp, pzp, d] of nearProps) {
        let da = Math.atan2(pxp - _v1.x, pzp - _v1.z) - yaw;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) < hh * 1.6 + 3 / d) return false; // prop in the x8 cone
      }
      for (let s = -4; s <= 4; s++) {
        for (const op of [0, -hv, hv]) {
          const oy = (s / 4) * hh;
          const cp = Math.cos(pitch + op);
          _v3.set(Math.sin(yaw + oy) * cp, Math.sin(pitch + op), Math.cos(yaw + oy) * cp);
          if (world.raycast(_v1, _v3, 15)) return false;
        }
      }
      return true;
    };
    const aimTo = (ent) => {
      const adx = ent.state.pos.x - p.state.pos.x;
      const adz = ent.state.pos.z - p.state.pos.z;
      const ady = (ent.state.pos.y + ent.spec.dims.heightM * 0.55) - (p.state.pos.y + 2.2);
      return [Math.atan2(adx, adz), Math.atan2(ady, Math.hypot(adx, adz))];
    };
    const enemies = game.tanks.filter((ent) =>
      // SYMMETRIC TEAMS: allies spawn 22-44 m away — scope must frame an ENEMY
      ent.team === 'enemy' && ent.state && ent.combat && !ent.combat.destroyed);
    let best = null;
    let bestD = Infinity;
    for (const ent of enemies) {
      const d = ent.state.pos.distanceTo(p.state.pos);
      if (d < bestD && clearTo(ent) && nearClear(...aimTo(ent))) { bestD = d; best = ent; }
    }
    if (!best) {
      // No enemy is genuinely visible from the trunnion: restage the nearest
      // one onto open ground along a surveyed bearing (deterministic sweep —
      // ±75° around the player's hull nose at WoT engagement ranges).
      let near = enemies[0];
      let nearD = Infinity;
      for (const ent of enemies) {
        const d = ent.state.pos.distanceTo(p.state.pos);
        if (d < nearD) { nearD = d; near = ent; }
      }
      const obstacles = world.getObstacles ? world.getObstacles() : [];
      const groundFree = (x, z) => {
        for (const c of conceal) {
          const dx = c.x - x, dz = c.z - z;
          if (dx * dx + dz * dz < (c.r + 4) * (c.r + 4)) return false;
        }
        for (const o of obstacles) {
          if (x > o.min[0] - 3 && x < o.max[0] + 3 &&
              z > o.min[2] - 3 && z < o.max[2] + 3) return false;
        }
        return true;
      };
      // hud_ui r2: the sweep mutates near's REAL state each try — save the
      // original so a fully-failed sweep can restore it instead of leaving
      // the tank at the last FAILED (occluded) position.
      const origX = near.state.pos.x, origY = near.state.pos.y, origZ = near.state.pos.z;
      const origYaw = near.state.yaw;
      outer:
      for (const distM of [300, 240, 360, 190, 150, 420]) {
        for (let k = 0; k < 29; k++) {
          const ang = p.state.yaw +
            (k % 2 ? -1 : 1) * Math.ceil(k / 2) * (Math.PI / 24);
          const x = p.state.pos.x + Math.sin(ang) * distM;
          const z = p.state.pos.z + Math.cos(ang) * distM;
          if (Math.abs(x) > 460 || Math.abs(z) > 460 || !groundFree(x, z)) continue;
          near.state.pos.set(x, world.heightField.getHeightAt(x, z), z);
          near.state.yaw = ang + Math.PI * 0.72; // 3/4 aspect to the player
          if (clearTo(near) && nearClear(...aimTo(near))) { best = near; break outer; }
        }
      }
      if (!best) {
        // hud_ui r2 relaxed sweep: terrain LOS only (turret top + hull
        // center) — map dressing density can over-reject the strict pass
        // wholesale (concealer circles + near-prop cone).
        const terrainClear = (ent) => {
          const tp = ent.state.pos;
          const hh2 = ent.spec.dims.heightM;
          for (const oy of [hh2 * 0.92, hh2 * 0.5]) {
            _v2.set(tp.x, tp.y + oy, tp.z);
            _v3.copy(_v2).sub(_v1);
            const dd = _v3.length();
            _v3.multiplyScalar(1 / Math.max(dd, 1e-3));
            const block = world.raycast(_v1, _v3, dd);
            if (block && block.dist < dd - 0.25) return false;
          }
          return true;
        };
        outer2:
        for (const distM of [300, 240, 360, 190, 150, 420]) {
          for (let k = 0; k < 29; k++) {
            const ang = p.state.yaw +
              (k % 2 ? -1 : 1) * Math.ceil(k / 2) * (Math.PI / 24);
            const x = p.state.pos.x + Math.sin(ang) * distM;
            const z = p.state.pos.z + Math.cos(ang) * distM;
            if (Math.abs(x) > 460 || Math.abs(z) > 460 || !groundFree(x, z)) continue;
            near.state.pos.set(x, world.heightField.getHeightAt(x, z), z);
            near.state.yaw = ang + Math.PI * 0.72;
            if (terrainClear(near)) { best = near; break outer2; }
          }
        }
      }
      if (!best) {
        // TRUE original staging (the old code left the tank at the last
        // FAILED sweep position — captured frames aimed 420 m into an empty
        // hillside)
        near.state.pos.set(origX, origY, origZ);
        near.state.yaw = origYaw;
        best = near;
      }
      best.visual.syncFromState(best.state);
      bestD = best.state.pos.distanceTo(p.state.pos);
    }
    const dx = best.state.pos.x - p.state.pos.x;
    const dz = best.state.pos.z - p.state.pos.z;
    const yaw = Math.atan2(dx, dz);
    const dy = (best.state.pos.y + best.spec.dims.heightM * 0.55) - (p.state.pos.y + 2.2);
    const pitch = Math.atan2(dy, Math.hypot(dx, dz));
    rig.snapSniper(8, yaw, pitch);
    forcedHudFrame('sniper', {
      distM: Math.round(bestD),
      // r4 hud_ui: M829A4 vs a Tiger flank is a guaranteed pen — the flagship
      // shot must demonstrate the GREEN indicator state (0.95 showed
      // permanent ambiguous orange).
      penRatio: 1.5,
      reload: { t: 0, totalS: 6 },
      shellSlot: 0,
      zoom: 8,
      dispersionRadM: computeDispersionRadM(p.spec, p.state, bestD),
      shells: shellCards,
    });
  },
  tank_closeup_modern() {
    hud.setMode('hidden');
    // tank_models r2: sun-side close orbit (negative azimuth) — fills the
    // frame and keeps the running gear/M256 collar/skirt panels readable.
    // lighting_post r4: elev 9 -> 15, dist 7 -> 8 — the extra elevation puts
    // the hull-adjacent contact shadow above the hull's own horizon so the
    // closeup actually shows the vehicle grounded (shadow-read fix).
    const hero = game.tankById.get('m1a2');
    // tank_models r6 (minor): a flat background bot ("312") parked right
    // behind the hero undercut the closeup — push any OTHER vehicle inside
    // 55 m a further 30 m out along its own bearing (deterministic, no rng;
    // this view runs after the battlefield capture so wide shots keep their
    // original staging).
    for (const t of game.tanks) {
      if (t === hero || !t.state || !t.visual) continue;
      const ddx = t.state.pos.x - hero.state.pos.x;
      const ddz = t.state.pos.z - hero.state.pos.z;
      const d = Math.hypot(ddx, ddz);
      if (d > 0.01 && d < 55) {
        const s = (d + 30) / d;
        t.state.pos.x = hero.state.pos.x + ddx * s;
        t.state.pos.z = hero.state.pos.z + ddz * s;
        t.state.pos.y = world.heightField.getHeightAt(t.state.pos.x, t.state.pos.z);
        t.visual.syncFromState(t.state);
      }
    }
    closeupStage(hero);
    orbitPose(hero, 8, -42, 15, 45);
  },
  tank_closeup_ww2() {
    hud.setMode('hidden');
    // Sun-lit 3/4 front (tank_models r1): the old azimuth 35 put the running
    // gear and lower hull in their own shadow — the interleaved wheels, track
    // sag and camo bands were unreadable in the judged frame.
    closeupStage(game.tankById.get('tiger1'));
    orbitPose(game.tankById.get('tiger1'), 9, -35, 15, 45); // tank_models r5: elev/fov match the other closeups (shared sun read)
  },
  tank_closeup_t90m() {
    hud.setMode('hidden');
    // tank_models r3: every core roster tank gets a judged closeup — the
    // T-90M shipped unauditable as a carousel thumb.
    closeupStage(game.tankById.get('t90m'));
    orbitPose(game.tankById.get('t90m'), 8, -38, 15, 45); // lighting_post r4: elev 10 -> 15 (contact shadow read)
  },
  tank_closeup_leo2a7() {
    hud.setMode('hidden');
    closeupStage(game.tankById.get('leo2a7'));
    orbitPose(game.tankById.get('leo2a7'), 8, -35, 15, 45); // lighting_post r4: elev 10 -> 15 (contact shadow read)
  },
  detrack() {
    // effects_combat r2: de-track destruction visuals — slumped band, thrown
    // track ribbon, scattered road wheel + fx burst (rubric item).
    hud.setMode('hidden');
    const ent = game.tankById.get('tiger1');
    orbitPose(ent, 10, 120, 10, 45);           // rear-quarter, running gear side
    // effects_combat r1: break the RIGHT track — the 120-deg orbit frames the
    // right flank, and the de-track rework removes the band from the broken
    // side (bare road wheels + ground ribbon must be the side on camera).
    ent.visual.setTrackState('trackR', true);
    bus.emit('module:state', { id: ent.id, module: 'trackR', state: 'red' });
  },
  combat_firing() {
    hud.setMode('hidden');
    const p = game.player;
    // effects_combat r2: pitch 8 → 14 lifts the barrel line onto the sunlit
    // road so the dark tube no longer vanishes against the shadowed bank.
    orbitPose(p, 13, 55, 18, 45); // lighting_post r4: elev 14 -> 18 (left-side shadow readable)
    // effects_combat r4: recoil timelines now advance on the SHARED FX CLOCK
    // (src/fx/clock.js), which is pinned during __SHOTS.set — repeated
    // syncFromState calls advance 0 s. recoilKick(ageS) takes the composed
    // age directly: backdate the stroke 50 ms so the barrel sits visibly
    // out of battery in the staged still.
    // §5.362: twin-plant players alternate barrels here too — the kick
    // returns the fired barrel's index and the composed flash sits on THAT
    // tip (single-bore: null index, legacy center anchor).
    const fireIdx = p.visual.recoilKick(0.05); // backdate: stroke already 50 ms in
    p.visual.syncFromState(p.state);    // one call to apply the pose
    // controls_gunnery r3: staged flash direction along the real bore axis.
    p.visual.gunMuzzleWorld(_v1, fireIdx != null ? fireIdx : undefined);
    p.visual.gunDirWorld(_v3);
    fx.composeFiringMoment({
      muzzlePos: _v1.clone(),
      dir: _v3.clone(),
      caliberMm: p.spec.gun.caliberMm,
      tracerType: 'APFSDS',
      ageS: 0.05,
    });
  },
  explosion() {
    hud.setMode('hidden');
    // enemy[2] = third ENEMY (team-filtered: allies must never be the victim)
    const victims = game.tanks.filter((t) => t.team === 'enemy');
    const ent = victims[2];
    _v2.copy(ent.state.pos);
    // effects_combat r1: frame center raised (was +1.4) and camera pulled
    // back to 26 m at a shallower 18 deg so fireball + leaning smoke column
    // + debris all fit — the old 22 m / 24 deg framing cropped everything
    // above ~6 m and cut the column.
    _v2.y += 3.2;
    const az = ent.state.yaw + 150 * DEG;
    _v1.set(
      _v2.x + Math.sin(az) * 26 * Math.cos(18 * DEG),
      _v2.y + Math.sin(18 * DEG) * 26 + 1.5,
      _v2.z + Math.cos(az) * 26 * Math.cos(18 * DEG),
    );
    rig.setExternalPose(_v1, _v2, 45);
    fx.composeExplosionMoment({ pos: _v2.clone(), ageS: 0.6 });
    // freeze the ammo-rack turret pop mid-arc — turret visibly airborne
    // above the fireball with spin at the 0.6 s composed moment
    ent.visual.setDestroyed({ pop: true, ageS: 0.6 });
  },
  garage() {
    hud.setMode('hidden');
    setPedestalTank('m1a2');
    garage.show('m1a2');
    if (garage.drainThumbs) garage.drainThumbs(); // portraits finished for the capture
    garageDressing.ensureBuilt(); // deterministic capture: workshop fully dressed
    showroom.reset();
  },
  battlefield_desert() { mapEstablishingShot(); },
  battlefield_winter() { mapEstablishingShot(); },
  battlefield_urban() { mapEstablishingShot(); },
  // MAPS r1
  battlefield_coastal() { mapEstablishingShot(); },
  battlefield_autumn() { mapEstablishingShot(); },
  battlefield_steppe() { mapEstablishingShot(); },
  battlefield_railyard() { mapEstablishingShot(); },
  battlefield_frontier() { mapEstablishingShot(); },
  battlefield_fjord() { mapEstablishingShot(); },
  battlefield_delta() { mapEstablishingShot(); },
  battlefield_badlands() { mapEstablishingShot(); },
  battlefield_monsoon() { mapEstablishingShot(); },
  battlefield_alpine() { mapEstablishingShot(); },
  battlefield_caldera() { mapEstablishingShot(); },
  battlefield_foundry() { mapEstablishingShot(); },
  // KILL-CAM: deterministic staged x-ray replay frame. A synthetic shot from
  // the player's M1A2 into the Tiger I at its spawn is resolved through the
  // REAL sim pipeline (traceTank + resolveShellHit, seeded rng, throwaway
  // combat state) and handed to the kill-cam's staged x-ray renderer.
  killcam_xray() {
    hud.setMode('hidden');
    const target = game.tankById.get('tiger1');
    const shooter = game.player;
    const shellSpec = shooter.spec.gun.shells[0]; // 120 mm APFSDS
    // Synthetic flank muzzle (staged frame): a front-right-quarter shot at
    // 440 m guarantees a penetration whose internal ray crosses track/engine/
    // fuel/ammo boxes — the frame must showcase module damage.
    const flankAz = target.state.yaw + Math.PI / 2 + 0.35;
    _v1.set(
      target.state.pos.x + Math.sin(flankAz) * 440,
      target.state.pos.y + 9,
      target.state.pos.z + Math.cos(flankAz) * 440,
    );
    const pose = tankPoseFromState(target.state);
    // Deterministic candidate scan: fixed aim heights / lateral offsets /
    // seeds, resolved through the REAL pipeline against a throwaway combat
    // state; first candidate that pens with ≥2 module/crew casualties wins.
    const rightX = Math.cos(target.state.yaw);
    const rightZ = -Math.sin(target.state.yaw);
    let ev = null;
    const tryOne = (h, side, seed) => {
      _v2.copy(target.state.pos);
      _v2.y += h;
      _v2.x += rightX * side;
      _v2.z += rightZ * side;
      _v3.copy(_v2).sub(_v1);
      const distM = _v3.length();
      _v3.multiplyScalar(1 / distM);
      const from = _v2.clone().addScaledVector(_v3, -30);
      const to = _v2.clone().addScaledVector(_v3, 30);
      const hits = traceTank(from, to, pose, target.spec.armor, new Set());
      if (!hits.length) return null;
      const shell = createShell(shellSpec, shooter.id, true, from, _v3, 99001);
      shell.distM = distM;
      return resolveShellHit(
        shell,
        { id: target.id, spec: target.spec, state: target.state, combat: createCombatState(target.spec) },
        hits, mulberry32(seed),
      );
    };
    outer:
    for (const seed of [9001, 4242, 555, 77]) {
      for (const h of [0.85, 1.0, 1.2, 1.45]) {
        for (const side of [0, 0.55, -0.55]) {
          const cand = tryOne(h, side, seed);
          if (!cand || cand.kind !== 'pen' || !cand.localPos) continue;
          if (!ev) ev = cand;
          if ((cand.modulesHit.length + cand.crewHit.length) >= 2) { ev = cand; break outer; }
        }
      }
    }
    if (!ev) ev = tryOne(1.05, 0, 4242); // unreachable fallback, keeps recipe total
    ev.attackerName = shooter.spec.name;
    // killcam_shotinfo r3: match live events (state.js enriches every hit
    // with attackerSpecId) so pen-roll annotations can resolve the shell.
    ev.attackerSpecId = shooter.specId;
    ev.targetName = target.spec.name;
    ev.targetSpecId = target.specId;
    ev.timeS = VIEW_TIME.killcam_xray;
    const traj = [];
    for (let i = 0; i <= 24; i++) {
      traj.push(
        _v1.x + (ev.pos[0] - _v1.x) * (i / 24),
        _v1.y + (ev.pos[1] - _v1.y) * (i / 24),
        _v1.z + (ev.pos[2] - _v1.z) * (i / 24),
      );
    }
    killcam.stageXrayShot({
      ev,
      timeS: ev.timeS,
      trajPts: traj,
      pose: {
        pos: [target.state.pos.x, target.state.pos.y, target.state.pos.z],
        yaw: target.state.yaw,
        pitch: target.state.visualPitch,
        roll: target.state.visualRoll,
        turretYaw: target.state.turretYaw,
        gunPitch: target.state.gunPitch,
      },
      targetEnt: target,
      armor: target.spec.armor,
      heightM: target.spec.dims.heightM,
      boundingRadiusM: target.spec.armor.boundingRadiusM,
    });
  },
};

window.__SHOTS = {
  views: [
    'battlefield', 'player_view', 'sniper_view', 'tank_closeup_modern',
    'tank_closeup_ww2', 'tank_closeup_t90m', 'tank_closeup_leo2a7',
    'detrack', 'combat_firing', 'explosion', 'garage',
    'battlefield_desert', 'battlefield_winter', 'battlefield_urban',
    'battlefield_coastal', 'battlefield_autumn', 'battlefield_steppe',
    'battlefield_railyard', // MAPS r1
    'battlefield_frontier', 'battlefield_fjord', 'battlefield_delta',
    'battlefield_badlands', 'battlefield_monsoon', 'battlefield_alpine',
    'battlefield_caldera', 'battlefield_foundry',
    'killcam_xray', // KILL-CAM
  ],
  set(name) {
    const recipe = SHOT_VIEWS[name];
    if (!recipe) throw new Error(`Unknown screenshot view: ${name}`);
    // PERF (performance_budget r1): shot recipes must never race the deferred
    // post-ready warm — run it now (idempotent, no-op once idle fired).
    warmCombatPipeline();
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
    ensureShotWorld(VIEW_MAP[name] || 'verdant'); // MAP-CONFIG WIRING
    // camo_spotting r2: garage shot keeps the neutral pedestal key; every
    // battlefield shot gets the authored map sun.
    setGarageSunTrim(name === 'garage');
    garage.hide();
    endOverlay.style.display = 'none';
    fx.resetAll();
    fx.resetSeed(5000);
    fx.setFrozen(true, VIEW_TIME[name]);
    if (world) world.setWindTime(VIEW_TIME[name]);
    recipe();
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
damagePanel.setTank(getSpec(selectedSpecId), pedestalVisual);
garage.show(selectedSpecId);
garageCameraPose(); // fallback pose until the orbit measures the hero
showroom.start();
setGarageSunTrim(true); // camo_spotting r2: boot lands on the garage screen
hud.setMode('hidden');

// BOOT DEFERRAL seam: the battlefield build is deferred until BATTLE is
// pressed, so `world` is legitimately null on the garage boot path — the
// garage bay renders without it. When a world IS already active (harness
// staging a battlefield view before readiness), warm it as before.
if (world) {
  world.update(0, camera.position);
  updateDustAndSync();
}
await bootStage('post', async () => {
  if (typeof renderer.compileAsync === 'function') {
    const t0 = performance.now();
    try { await renderer.compileAsync(scene, camera, scene); } catch (_) { /* first render is fallback */ }
    BOOT_TIMINGS.postCompileAsync = Math.round(performance.now() - t0);
    await nextFrame();
  }
  lighting.update(true); // boot: render every cascade before first present
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
let combatPipelineWarmed = false;
let _warmGen = null; // in-flight chunked warm — the sync wrapper drains the remainder
let networkOpeningEffectsWarmed = false;

async function warmNetworkWrecks(entities) {
  const yieldForFrameBudget = createFrameBudgetYielder(8);
  const warmedSpecs = new Set();
  for (const entity of entities || []) {
    const visual = entity?.visual;
    if (!visual) continue;
    if (visual.prewarmBurn) {
      try { visual.prewarmBurn(); } catch (_) { /* warm only */ }
    }
    const wreckKey = entity.specId ? `${entity.specId}:${entity.camo || 'factory'}` : '';
    if (wreckKey && !warmedSpecs.has(wreckKey)) {
      warmedSpecs.add(wreckKey);
      try {
        for (const _ of prebakeBurntSteps(
          entity.specId,
          engineCtx.anisotropy ?? 4,
          entity.camo || 'factory',
        )) {
          await yieldForFrameBudget();
        }
      } catch (_) { /* warm only */ }
    }
    if (visual.setDestroyed && visual.resetDestroyed) {
      try {
        visual.setDestroyed({ pop: false });
        visual.resetDestroyed();
        visual.setDestroyed({ pop: true });
        visual.resetDestroyed();
      } catch (_) { /* warm only */ }
    }
    await yieldForFrameBudget(true);
  }
}

/**
 * Warm the effects an immediate deploy can hit in its opening seconds without
 * charging the whole exhaustive garage-idle pipeline to the transition.
 */
async function warmNetworkOpeningEffects() {
  if (networkOpeningEffectsWarmed) return;
  const wp = new THREE.Vector3(-460, 0, -460);
  const wn = new THREE.Vector3(0, 1, 0);
  const wd = new THREE.Vector3(0, 0, 1);
  try {
    if (fx.warmTextures) fx.warmTextures();
    fx.warmOpeningEffects(wp, wd, wn, 120);
    await nextFrame();
    try { fx.update(0.016, game.shells, camera); } catch (_) { /* warm only */ }
    fx.destruction(wp, null, 'shot');
    await nextFrame();
    try { fx.update(0.016, game.shells, camera); } catch (_) { /* warm only */ }
    fx.destruction(wp, null, 'ammorack');
    await nextFrame();
    try { fx.update(0.016, game.shells, camera); } catch (_) { /* warm only */ }
    post.prepareSoftParticles();
    const mask = camera.layers.mask;
    camera.layers.enable(fx.group.userData.softParticles?.layer ?? 30);
    try {
      renderer.compile(fx.group, camera, scene);
      warmRender();
    } finally {
      camera.layers.mask = mask;
    }
    networkOpeningEffectsWarmed = true;
  } catch (error) {
    console.warn('[warm] opening effects failed (continuing):', error);
  } finally {
    fx.resetAll();
  }
}
// perf-r5 (owner: "first garage entry laggy"): the warm used to run as ONE
// idle callback (~1-3 s: volley + every wreck dance + all compiles) the
// moment the staged pump finished — exactly when the player starts touching
// the garage. Generator core with per-step yields; the sync wrapper (battle
// load / __SHOTS — the screen owns those frames) drains it whole, the
// chunked wrapper gives the garage a painted frame between steps. A battle
// entered mid-chunk simply drains the REMAINDER synchronously.
function warmCombatPipeline() {
  if (combatPipelineWarmed && !_warmGen) return;
  const g = _warmGen || warmCombatPipelineSteps();
  _warmGen = null;
  let r = g.next();
  while (!r.done) r = g.next();
}
async function warmCombatPipelineChunked() {
  if (combatPipelineWarmed && !_warmGen) return;
  const g = _warmGen || (_warmGen = warmCombatPipelineSteps());
  // Generator yields mark safe preemption points, not mandatory 16 ms
  // sleeps. Drain cheap/cache-hit steps within one small main-thread budget
  // and yield only when that budget is spent. The old one-rAF-per-marker
  // policy added well over a second of pure frame latency across effect,
  // wreck, and hidden-variant markers on constrained machines.
  const yieldForFrameBudget = createFrameBudgetYielder(8);
  for (;;) {
    if (_warmGen !== g) return; // the sync wrapper took over and finished
    const r = g.next();
    if (r.done) { if (_warmGen === g) _warmGen = null; return; }
    await yieldForFrameBudget();
  }
}
function* warmCombatPipelineSteps() {
  if (combatPipelineWarmed) return;
  combatPipelineWarmed = true;
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
  const warm = game.tanks.find((e) => !e.isPlayer && e.visual);
  if (warm) {
    warm.visual.setDestroyed({});
    try { renderer.compile(warm.visual.root, camera, scene); } catch (_) { /* fine */ }
    warm.visual.resetDestroyed();
  }
  // KILL-HITCH FIX: the single-tank wreck dance above only compiles THAT
  // tank's burn program variants — programs are cached per material
  // param-class, so every other tank family still paid its burn-hook shader
  // compiles synchronously on its first kill (the visible pause right before
  // a destruction played). Install the DISARMED hook on every battle tank
  // now; the scene compile below then builds all the '|burn-r6' variants
  // behind the loading screen. Late-created first-party visuals receive the
  // same hook at construction.
  for (const e of game.tanks) {
    if (e.visual && e.visual.prewarmBurn) e.visual.prewarmBurn();
  }
  markWarmStage('wrecks');
  // EVENT-SPIKE WARM part 1 (perf-r2b, measured by tmp-eventspike-probe):
  // the shared WRECK canvases (heightToNormal / roughness patch bakes via
  // getImageData in materials.js) bake per FAMILY on the first setDestroyed —
  // the probe still measured a 215 ms first-kill frame with everything else
  // warm. Run the destroyed/restore dance for EVERY fielded visual, not just
  // one: per-family bakes are cached, so repeats are free and each family's
  // one-time cost lands here behind the loading screen instead of on its
  // first kill.
  for (const e of game.tanks) {
    if (e.visual && e.visual.setDestroyed && e.visual.resetDestroyed) {
      // perf-r5: the char/ember canvases are the dance's hidden atom — bake
      // them CHUNKED first (a slice per painter stage), then the dance and
      // every later kill hit the cache.
      try { yield* prebakeBurntSteps(e.specId, engineCtx.anisotropy ?? 4); } catch (_) { /* warm only */ }
      try { e.visual.setDestroyed({}); e.visual.resetDestroyed(); } catch (_) { /* warm only */ }
      // Build the lazy thrown-track ribbon before the hidden-variant compile
      // so a first live de-track never allocates or links it mid-fight.
      if (e.visual.setTrackState) {
        try {
          e.visual.setTrackState('trackL', true);
          e.visual.setTrackState('trackL', false);
        } catch (_) { /* warm only */ }
      }
      yield; // one wreck-dance per slice
    }
  }
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
    try {
      fx.muzzleFlash(wp, wd, 120);
      // MOBILE-QA r11 (idle profiler): the volley ran as ONE generator slice
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
      fx.destruction(wp, null, 'shot');
      yield;
      fx.destruction(wp, null, 'ammorack');
      yield;
      // perf-r2f (journey probe): the prop-destruction families bake their
      // splinter/debris sprites on FIRST break — ramming your first fence
      // measured a 1.1 s frame. One silent break per family joins the volley
      // (same corner, cleared by the resetAll below).
      _v3.set(1, 0, 0);
      for (const kind of ['fence', 'wall', 'sandbag', 'truck', 'drumblast']) {
        fx.propBreak(kind, wp, _v3, 1.5);
        yield; // r11: one splinter/debris sprite bake per slice
      }
      fx.propCrush(wp, _v3, 7);
      yield;
      // perf-r2e: one scar stamp per fielded visual — the impact-decal
      // system bakes its shared scar canvases (heightToNormal/roughness
      // getImageData work) per FAMILY on the first stamp, which used to be
      // the player's FIRST CONNECTING SHELL. resetAll() clears the stamped
      // decals; the baked canvases persist in the family cache.
      for (const e of game.tanks) {
        if (!e.visual || !e.visual.root || !e.state) continue;
        _v1.copy(e.state.pos);
        _v1.y += (e.spec && e.spec.dims ? e.spec.dims.heightM : 2.4) * 0.5;
        _v2.set(0, 0, 1);
        try { fx.armorScar(e.visual, _v1, _v2, 100); } catch (_) { /* warm only */ }
        yield; // r11: one family's scar-canvas bake per slice
      }
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
      post.prepareSoftParticles();
      const warmLayerMask = camera.layers.mask;
      camera.layers.enable(fx.group.userData.softParticles?.layer ?? 30);
      try {
        yield* initializeForwardProgramsSteps();
        warmRender();
      } finally {
        camera.layers.mask = warmLayerMask;
      }
    } catch (err) {
      console.warn('[warm] fx volley failed (continuing):', err);
    }
    fx.resetAll();
  }
  markWarmStage('effects');
  warmWreckTextures(renderer);
  fx.group.traverse((o) => {
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of mats) {
      for (const k of Object.keys(m)) {
        const v = m[k];
        if (v && v.isTexture) { try { renderer.initTexture(v); } catch (_) { /* fine */ } }
      }
    }
  });
  yield;
  markWarmStage('textures');
  const spotsWereOn = game.phase !== 'battle';
  if (spotsWereOn) setGarageSpots(false);
  // MOBILE-QA r10 (idle profiler): this scene-wide compile ran as ONE
  // generator slice on the post-ready idle pump — a +157-program burst
  // measured 609-1130 ms of garage-idle jank. Same compile, chunked per
  // top-level scene child with a yield between slices.
  {
    const kids = scene.children.slice();
    for (const kid of kids) {
      try { renderer.compile(kid, camera, scene); } catch (_) { /* fine */ }
      if (spotsWereOn) setGarageSpots(true);
      yield;
      if (spotsWereOn) setGarageSpots(false);
    }
  }
  if (spotsWereOn) setGarageSpots(true);
  yield;
  markWarmStage('sceneCompile');
  // MOBILE-QA r1: depth-variant warm for the boot/debug entry paths too —
  // the loading-screen path re-runs it per battle (worlds swap casters).
  warmShadowPrograms();
  yield;
  markWarmStage('shadows');
  yield* compileHiddenVariantsSteps();
  markWarmStage('hiddenVariants');
  warmTrace.totalMs = Math.round(performance.now() - warmStartedAt);
  if (typeof window !== 'undefined') window.__COMBAT_WARM = warmTrace;
}

/**
 * EVENT-SPIKE WARM part 4 (perf-r2c): shader programs cache by cacheKey, not
 * by material INSTANCE — and setDestroyed() creates fresh cloned materials
 * (char/burn variants, addon keeps) every kill. The old wreck dance created
 * and discarded those clones BEFORE any compile pass saw them, so the first
 * kill of each variant still linked its programs on the event frame (+6/7
 * programs, 200-600 ms worst frames measured: AddOnTuskCamo/Rail, addon_keep
 * burn variants). Compile each tank's subtree twice — once IN the destroyed
 * state (the clones' programs enter the cache and outlive the clones) and
 * once live — using the object-form compile, which traverses regardless of
 * visibility (unspotted enemies included). Called from warmCombatPipeline
 * after the complete first-party roster is staged.
 */
// MOBILE-QA r1 (tools/tmp-fightprof evidence, docs/MOBILE-QA.md ledger):
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
function warmShadowPrograms() {
  const csm = lighting && lighting.csm;
  const light = csm && csm.lights && csm.lights[csm.lights.length - 1];
  if (!light || !light.shadow) return;
  const cam = light.shadow.camera;
  const save = {
    left: cam.left, right: cam.right, top: cam.top, bottom: cam.bottom,
    near: cam.near, far: cam.far, auto: light.shadow.autoUpdate,
  };
  cam.left = -520; cam.right = 520; cam.top = 520; cam.bottom = -520;
  cam.near = 0.5; cam.far = 1600;
  cam.updateProjectionMatrix();
  light.shadow.autoUpdate = false;
  light.shadow.needsUpdate = true;
  try { warmRender(); } catch (_) { /* warm only */ }
  cam.left = save.left; cam.right = save.right;
  cam.top = save.top; cam.bottom = save.bottom;
  cam.near = save.near; cam.far = save.far;
  cam.updateProjectionMatrix();
  light.shadow.autoUpdate = save.auto;
  light.shadow.needsUpdate = true; // real cascade re-renders next frame
}

// perf-r5c: warm renders only need to TOUCH programs/textures — full-frame
// rasterization at retina scale made each one a 400-730 ms slice. Keep the
// same quarter-resolution fragment bill, but render it into a private HDR
// target. The old default-framebuffer quarter viewport could be presented
// during the live countdown when a first-use compile blocked the next rAF,
// producing a one-off black screen with the world in the lower-left corner.
const warmRender = createOffscreenSceneWarmer(renderer, scene, camera);

// MOBILE-QA r20: WebGLRenderer.compile() intentionally stops before uniform
// discovery. The next real render then calls WebGLProgram.getUniforms() for
// every newly linked program in one queue flush; 0.2 ms profiles attributed
// 1301-1466 ms of the garage warm to that exact WebGLUniforms/onFirstUse
// stack. Three's official compileAsync path was falsified on the measured
// ANGLE driver because COMPLETION_STATUS_KHR itself blocked for 10.34 s.
// Fall back to the same Three program objects, but consume each newly-created
// forward variant separately and yield before creating the next. The final
// warmRender still owns real texture/state/depth initialization.
function* initializeForwardProgramsSteps() {
  let sliceAt = performance.now();
  const objects = [];
  scene.traverseVisible((object) => {
    if (object.isMesh || object.isPoints || object.isLine || object.isSprite) objects.push(object);
  });
  for (const object of objects) {
    const before = (renderer.info.programs || []).length;
    try { renderer.compile(object, camera, scene); } catch (_) { /* warm only */ }
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

// perf-r5: the countdown re-warm ran this SYNCHRONOUSLY while late roster and
// wreck bakes piled in — a 10 s frame during the countdown on a slow device.
// Chunked wrapper for live windows; the sync wrapper stays for the
// loading screen and capture paths.
async function compileHiddenVariantsChunked() {
  const g = compileHiddenVariantsSteps();
  const yieldForFrameBudget = createFrameBudgetYielder(8);
  let r = g.next();
  while (!r.done) {
    await yieldForFrameBudget();
    r = g.next();
  }
}
function* compileHiddenVariantsSteps() {
  // MOBILE-QA r5: renderer.compile does NOT traverse visible:false subtrees
  // (three's projectObject early-out — the old comment claiming otherwise
  // was wrong), so non-active LOD levels and node-hidden addons never
  // compiled here and linked mid-battle on their first distance flip (the
  // last per-fight >100 ms task; owner-binding evidence in MOBILE-QA.md
  // r4/r5: hidden LOD meshes + kit decor). Force-visible window
  // around each compile, then restore.
  const _cv = [];
  const compileAll = (root) => {
    _cv.length = 0;
    root.traverse((o) => { if (o.visible === false) { _cv.push(o); o.visible = true; } });
    // MOBILE-QA r13: the live scene pass renders into post's linear HDR
    // target. The default-framebuffer compile warms an `srgb` sibling, not
    // the `srgb-linear` key used when a spotted tank first enters the post
    // chain (owner-bound probe: exactly +5 programs at t+4.5..8.9 s).
    const priorTarget = renderer.getRenderTarget();
    const gameplayTarget = post && post.composer ? post.composer.renderTarget1 : null;
    try {
      if (gameplayTarget) renderer.setRenderTarget(gameplayTarget);
      renderer.compile(root, camera, scene);
    } finally {
      renderer.setRenderTarget(priorTarget);
      for (const o of _cv) o.visible = false;
    }
  };
  for (const e of game.tanks) {
    if (!e.visual || !e.visual.root) continue;
    try {
      if (e.visual.setDestroyed && e.visual.resetDestroyed) {
        // pop:true — the REAL kill path's variant set (flying-turret clone,
        // popped-state addon keeps); a {} dance warmed a different clone
        // family and the pop set still linked on the first rack kill.
        e.visual.setDestroyed({ pop: true, ageS: 0 });
        compileAll(e.visual.root); // destroyed-state clones
        e.visual.resetDestroyed();
      }
    } catch (_) { /* warm only */ }
    // MOBILE-QA r10: yield BETWEEN the destroyed-state and live-state
    // compiles — one whole tank per slice (heavier since r5's force-visible
    // LOD coverage) was half of the garage-idle monster tasks.
    yield;
    try {
      compileAll(e.visual.root);   // live-state materials
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
    try { renderer.compile(world.group, camera, scene); } catch (_) { /* warm only */ }
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
      warmRender();
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
        warmRender();
        camera.fov = fov0;
        camera.updateProjectionMatrix();
        unflip();
      } catch (_) { unflip(); }
      yield;
    }
    // perf-r4a: one hidden frame from the player spawn's chase pose — links
    // exactly what the first battle frame will draw (world grass/props/wreck
    // proxies included), color and shadow-depth variants alike.
    try {
      if (battleStaged && game.player && game.player.state) {
        collectFlips();
        const p = game.player.state.pos;
        const yaw = game.player.state.yaw || 0;
        _v1.set(p.x - Math.sin(yaw) * -14, p.y + 7.5, p.z - Math.cos(yaw) * -14);
        _v2.set(p.x, p.y + 1.5, p.z);
        const camPos0 = camera.position.clone();
        const camQuat0 = camera.quaternion.clone();
        camera.position.copy(_v1);
        camera.lookAt(_v2);
        if (world && world.update) world.update(0.016, camera.position, null, null);
        if (lighting && lighting.updateFrustums) lighting.updateFrustums();
        warmRender();
        camera.position.copy(camPos0);
        camera.quaternion.copy(camQuat0);
        if (world && world.update) world.update(0, camera.position, null, null);
        unflip();
      }
      if (lighting && lighting.updateFrustums) lighting.updateFrustums();
    } catch (_) { unflip(); }
  }
}
// Heavy combat caches intentionally do not warm in the interactive garage.
// The battle/studio loading veils run the same complete warm pipeline with
// frame yields, preserving final quality while eliminating random garage
// stalls from shader links, wreck dances, FX atlases, and unseen rosters.

// SCENE STUDIO (staging rig + scripted marketing-shot API, src/game/studio.js):
// entered via ?studio=1 (map via ?map=…) or F8 from the garage; scriptable via
// window.__STUDIO (schema in docs/STUDIO.md). main.js only hands it these
// integration seams plus the one tick() branch above — entry keys, panel,
// actors, effects, capture all live in the studio module.
const studio = createStudio({
  renderer, scene, camera, post, lighting, fx, game, hud, garage, showroom,
  hfProxy, getWorld: () => world, ensureWorld, setWorldDormant,
  setGarageSpots, setGarageSunTrim, enterGarage,
  warmCombatPipeline: warmCombatPipelineChunked,
  transition, // branded loading screen on studio enter/exit
});

bootComplete = true;
scheduleRaf();

// ---------------------------------------------------------------------------
// Debug / drive-test hooks (not part of the screenshot contract).
// ---------------------------------------------------------------------------

// Sticky drive-test aim: debugAimAtNearest remembers its target and
// debugFastForward re-leads input.aimPoint every step — exactly like a live
// player keeping the reticle on a rolling target. Without this the aim point
// froze in world space during fastForward, so headless volleys "missed"
// targets that had simply drifted a hull-length while the gun settled.
let debugAimTargetId = null;

/** Recompute the travel-time-led aim point onto `best`'s hull center. */
// controls_gunnery r6: the old version always led the hull CENTER
// (heightM·0.5). On undulating ground a micro-crest 20-30 m short of a
// hull-down target sat centimeters above that line — the LOS ray grazed
// over it but a shell 0.5-1 m into the dispersion cone died in the dirt
// just short of the hull ("fully-settled shot, terrain terminal, miss
// ~20 m"). A real player aims at what is VISIBLE: probe hull center first,
// then upper hull, then turret, and lead the first aim height whose
// muzzle→impact path is clear. All heights blocked = keep center (the
// live reticle shows the red blocked warning for that shot).
// controls_gunnery r2: AIM-HEIGHT LATCH + GRAZE MARGIN. The r6 multi-height
// probe re-picked its aim height (0.5/0.72/0.88) EVERY sim step — near a
// micro-crest the raycast verdict flips frame to frame, so the turret chased
// an aim point oscillating ~0.9 m vertically and never settled (measured:
// 47 mrad error after 10 s, shot 178 m into terrain). The chosen height now
// LATCHES for 1 s of game time per target. A height also only qualifies when
// a parallel ray 0.5 m BELOW it is clear too — a path that grazes terrain
// within half a meter gets biased up to the next height instead of trusting
// a knife-edge LOS that half the dispersion cone will still clip.
let leadLatchHFrac = 0;
let leadLatchUntilS = -1;
let leadLatchTargetId = null;

function debugLeadPoint(p, best, out) {
  p.visual.gunPivotWorld(_v1);
  const shell = p.spec.gun.shells[Math.max(0, Math.min(2, p.combat.shellSlot))];
  const tvx = Math.sin(best.state.yaw) * best.state.speed;
  const tvz = Math.cos(best.state.yaw) * best.state.speed;
  const solveAt = (hFrac) => {
    _v2.copy(best.state.pos);
    _v2.y += best.spec.dims.heightM * hFrac;
    let ax = _v2.x;
    let az = _v2.z;
    for (let i = 0; i < 2; i++) {
      const dx = ax - _v1.x;
      const dy = _v2.y - _v1.y;
      const dz = az - _v1.z;
      const t = Math.sqrt(dx * dx + dy * dy + dz * dz) / shell.velocityMps;
      ax = _v2.x + tvx * t;
      az = _v2.z + tvz * t;
    }
    out.set(ax, _v2.y, az);
  };
  p.visual.gunMuzzleWorld(_v3); // blocked-reticle test origin (muzzle path)
  // controls_gunnery r4: 6 m -> 1.5 m. min(6, boundingRadius) left the whole
  // bounding sphere untested, so a knife-edge crest AT a hull-down target
  // passed clearAt and the picker confidently laid center-mass into dirt
  // (misses 118-394 m with a green reticle). 1.5 m still stops short of the
  // aim point itself (>= 0.5·height above the target's ground contact), so
  // honest flat-ground lays never self-block.
  const margin = 1.5;
  // NOTE (round-2 integration): the handoff's binary GRAZE MARGIN (parallel
  // ray 0.5 m below must clear too) was applied, measured against the frozen
  // gunnery gate, and REPLACED — it biased marginal cross-valley lays up to
  // hFrac 0.88 (turret roof, ~0.3 m headroom vs ~1 m dispersion at 350 m)
  // and shots flew clean over the target. The picker now SCORES each aim
  // height by min(terrain clearance along the path, headroom to the roof
  // line) — both eat the same dispersion tails in meters — and lays on the
  // height with the largest margin, which lands on the crest/overshoot
  // compromise instead of either cliff edge. The 1 s LATCH still prevents
  // the r6 oscillation wedge (aim height flapping every sim step).
  const clearAt = (hFrac) => {
    solveAt(hFrac);
    _rayD.copy(out).sub(_v3);
    const d = _rayD.length();
    if (d < 12) return true;
    _rayD.multiplyScalar(1 / d);
    return !world.raycast(_v3, _rayD, d - margin);
  };
  // Terrain clearance of the muzzle→lead-point segment in TERMINAL-dispersion
  // units: the shot cone diverges linearly from the muzzle, so a crest at
  // fraction t of the path only sees t× the terminal deviation — divide each
  // sample's clearance by t to compare it against the roof-line headroom on
  // equal footing. Sampled between ~16% and ~90% (ends sit on hull/target).
  const pathClearance = () => {
    let clr = Infinity;
    for (let i = 2; i <= 11; i++) {
      const t = i / 12.2;
      const px = _v3.x + (out.x - _v3.x) * t;
      const py = _v3.y + (out.y - _v3.y) * t;
      const pz = _v3.z + (out.z - _v3.z) * t;
      const c = (py - world.heightField.getHeightAt(px, pz)) / t;
      if (c < clr) clr = c;
    }
    return clr;
  };
  // r4 BOUNCE FEEDBACK (0-damage streak fix): if this target's LAST player
  // shell was a 0-damage tank impact (ricochet / nonpen), stop re-bouncing
  // the same plate — skip the center-mass optimum and probe the lower-hull /
  // upper bands instead (WoT weak-spot discipline; the r5 sample landed
  // damage on only 2 of 5 aim-assisted shots because the assist kept
  // re-serving the same bounce).
  let bouncedLast = false;
  for (let i = playerShellLog.length - 1; i >= 0; i--) {
    const r = playerShellLog[i];
    if (r.targetId !== best.id || !r.terminal) continue;
    bouncedLast = r.terminal === 'tank' && (r.damage || 0) <= 0;
    break;
  }
  const latched = leadLatchTargetId === best.id && game.timeS < leadLatchUntilS;
  if (latched && clearAt(leadLatchHFrac)) return out; // hold the settled height
  // CONTINUOUS optimum: raising the aim by dy raises the scaled clearance by
  // exactly dy and lowers the roof headroom by dy, so the height equalizing
  // the two margins maximizes the min margin in one closed-form step —
  // aim = center + (headroom - scaledClr)/2, clamped to the [0.5, 0.9]·h
  // band (never below hull center, never a knife-edge under the roof line).
  const hM = best.spec.dims.heightM;
  if (bouncedLast) {
    // alternate plates after a bounce: lower hull first, then high turret
    for (const hFrac of [0.34, 0.62, 0.5]) {
      if (!clearAt(hFrac)) continue;
      leadLatchHFrac = hFrac;
      leadLatchTargetId = best.id;
      leadLatchUntilS = game.timeS + 1;
      return out;
    }
    solveAt(0.5);
    leadLatchTargetId = null;
    return out;
  }
  if (clearAt(0.5)) {
    const sc = pathClearance();
    const headroom = hM * 0.5; // roof line is 0.5·h above the center aim
    const delta = Math.max(0, Math.min(0.25 * hM, (headroom - sc) / 2));
    out.y += delta;
    // final path check at the adjusted height (rocks/props via colliders)
    _rayD.copy(out).sub(_v3);
    const d = _rayD.length();
    _rayD.multiplyScalar(1 / Math.max(d, 1e-6));
    if (d < 12 || !world.raycast(_v3, _rayD, d - margin)) {
      leadLatchHFrac = 0.5 + delta / hM;
      leadLatchTargetId = best.id;
      leadLatchUntilS = game.timeS + 1;
      return out;
    }
    out.y -= delta; // adjusted point blocked — fall through to the ladder
  }
  for (const hFrac of [0.5, 0.72, 0.88]) {
    if (!clearAt(hFrac)) continue;
    leadLatchHFrac = hFrac;
    leadLatchTargetId = best.id;
    leadLatchUntilS = game.timeS + 1;
    return out;
  }
  solveAt(0.5); // everything masked — center lead; reticle reads BLOCKED
  leadLatchTargetId = null;
  return out;
}

/**
 * Aim readiness snapshot for drive tests: fire when errMrad is small AND
 * reticleRadM (the live bloom-scaled dispersion radius at the aim distance)
 * has settled — that is WoT "fully aimed", not just "gun on target".
 * @returns {?object}
 */
function debugAimState() {
  const p = game.player;
  if (!p || !p.state || p.combat.destroyed) return null;
  return {
    errMrad: debugGunAimError() * 1000,
    bloomF: p.state.bloomF,
    reticleRadM: computeDispersionRadM(p.spec, p.state, rig.aimDist),
    aimDistM: rig.aimDist,
    reloadT: p.combat.reload.t,
    // controls_gunnery r2: settle-failure attribution — a large errMrad with
    // atGunLimit true is a pitch/yaw CLAMP (gun physically cannot reach the
    // aim point: gun-terrain muzzle clearance, casemate arc, or depression
    // floor), not a slew still in progress. Exposed so gates/probes can
    // separate "not settled yet" from "will never settle".
    atGunLimit: !!p.state.atGunLimit,
    gunLimitSpec: !!p.state.gunLimitSpec,
    gunPitchDeg: Math.round(p.state.gunPitch * 573) / 10,
    turretYawDeg: Math.round(p.state.turretYaw * 573) / 10,
    // controls_gunnery r3: HUD frames don't run inside debugFastForward, so
    // frameInfo.aim.blockedDistM is STALE for headless gates — recast fresh.
    // r4: same 1.5 m margin + dispersion graze test as the live reticle, so
    // the gate can never settle-fire a lay the reticle would call blocked.
    blockedDistM: (() => {
      playerGunCenterRay(p, p.input.aimPoint, _rayO, _rayD, _v2);
      return muzzlePathBlockDist(
        _rayO, _v2,
        computeDispersionRadM(p.spec, p.state, rig.aimDist));
    })(),
    leadHFrac: leadLatchTargetId ? leadLatchHFrac : null,
  };
}

/**
 * Deterministically point the player's aim at the nearest live enemy: snaps
 * the rig into sniper mode with the view ray through the enemy's hull center
 * so the server-aim raycast lands on the tank. The turret then slews to the
 * aim point over the next sim steps (fastForward keeps the lead fresh).
 * @returns {?{id:string, distM:number}} target picked, or null
 */
function debugAimAtNearest() {
  const p = game.player;
  if (!p || !p.state || p.combat.destroyed) return null;
  p.visual.gunPivotWorld(_v1);
  let best = null;
  let bestD = Infinity;
  for (const ent of game.tanks) {
    // SYMMETRIC TEAMS: only ENEMY-team tanks are valid drive-test targets
    // (allies now spawn 22-44 m from the player and would win "nearest").
    if (ent.team !== 'enemy' || !ent.state || !ent.combat || ent.combat.destroyed) continue;
    _v2.copy(ent.state.pos);
    _v2.y += ent.spec.dims.heightM * 0.5;
    _v3.copy(_v2).sub(_v1);
    const d = _v3.length();
    if (d >= bestD || d < 1e-3) continue;
    // Only offer LOS-clear targets: the drive test needs a shot that can land.
    // controls_gunnery r4: tolerance boundingRadius+1 (up to 7 m of accepted
    // obstruction) -> 2 m — candidates whose hull-center ray dies in a crest
    // at their own bounding sphere are exactly the shots that whiff with a
    // green reticle; reject them here instead of teaching the gate to fire.
    _v3.multiplyScalar(1 / d);
    const block = world.raycast(_v1, _v3, d);
    if (block && block.dist < d - 2) continue;
    // r4: the settle gate rejects on the MUZZLE path (muzzlePathBlockDist);
    // pre-filter candidates with the same test so the drive test never
    // commits its slew to a target the fire gate will veto anyway (probe
    // showed repeated doomed attempts on pivot-clear/muzzle-blocked lanes).
    // _rayO is free here (only computeAimInfo's pen probe uses it).
    p.visual.gunMuzzleWorld(_rayO);
    if (muzzlePathBlockDist(_rayO, _v2, 0) != null) continue;
    bestD = d;
    best = ent;
  }
  if (!best) return null; // nothing visible yet — caller can fast-forward and retry
  _v2.copy(best.state.pos);
  _v2.y += best.spec.dims.heightM * 0.5;
  // Travel-time lead for moving targets (same 2-iteration scheme as the AI).
  const shell = p.spec.gun.shells[Math.max(0, Math.min(2, p.combat.shellSlot))];
  const tvx = Math.sin(best.state.yaw) * best.state.speed;
  const tvz = Math.cos(best.state.yaw) * best.state.speed;
  let ax = _v2.x;
  let az = _v2.z;
  for (let i = 0; i < 2; i++) {
    const dx = ax - _v1.x;
    const dy = _v2.y - _v1.y;
    const dz = az - _v1.z;
    const t = Math.sqrt(dx * dx + dy * dy + dz * dz) / shell.velocityMps;
    ax = _v2.x + tvx * t;
    az = _v2.z + tvz * t;
  }
  _v3.set(ax, _v2.y, az).sub(_v1);
  const yaw = Math.atan2(_v3.x, _v3.z);
  const pitch = Math.atan2(_v3.y, Math.hypot(_v3.x, _v3.z));
  rig.snapSniper(4, yaw, pitch);
  debugAimTargetId = best.id; // fastForward re-leads onto this tank per step
  return { id: best.id, distM: bestD };
}

/**
 * Angle (radians) between the player's barrel and the vector muzzle→aimPoint.
 * The drive test polls this to know when the turret finished slewing.
 * @returns {number} radians, or Infinity when unavailable
 */
function debugGunAimError() {
  const p = game.player;
  if (!p || !p.state || p.combat.destroyed) return Infinity;
  // controls_gunnery r3: bore AXIS, not the (possibly off-axis) anchor line.
  p.visual.gunMuzzleWorld(_v1);
  p.visual.gunDirWorld(_v3);
  _v2.copy(p.input.aimPoint).sub(_v1).normalize();
  return Math.acos(Math.min(1, Math.max(-1, _v3.dot(_v2))));
}

/**
 * Run the fixed-step simulation synchronously for `seconds` of game time
 * (visuals synced each step so gun/turret chase behaves exactly like the
 * live loop). Deterministic drive-test accelerator.
 * @param {number} seconds
 * @returns {number} game.timeS after the run
 */
function debugFastForward(seconds) {
  const steps = Math.max(0, Math.round(seconds / SIM_DT));
  for (let i = 0; i < steps; i++) {
    if (game.phase !== 'battle') break;
    // The render loop normally maps debugFlags.forceFire onto the player's
    // input each frame; do the same here so headless volleys can fire.
    if (game.player && !game.player.combat.destroyed) {
      game.player.input.fire = debugFlags.forceFire ||
        (game.player.input.fire && input.isDown('fire'));
      // Sticky aim (see debugAimTargetId): track the aimed tank like a live
      // player's reticle, so settling the gun never goes stale on a mover.
      const tgt = debugAimTargetId ? game.tankById.get(debugAimTargetId) : null;
      if (tgt && tgt.state && tgt.combat && !tgt.combat.destroyed) {
        debugLeadPoint(game.player, tgt, game.player.input.aimPoint);
      }
    }
    simStep(game, bus, world, rig, collider);
    for (const ent of game.tanks) {
      if (ent.state) ent.visual.syncFromState(ent.state);
    }
  }
  return game.timeS;
}

/**
 * KILL-CAM test aid: spawn a lethal enemy shell aimed at the player from a
 * clear-LOS vantage and drop the player's HP so the next hit kills. Fired
 * through the normal shell pipeline (bus 'shell:fired' + sim stepping), so the
 * kill-cam captures a real resolved chain. Call, then fastForward ~1 s.
 * @returns {boolean} true if a shell was spawned
 */
function debugSpawnKillShell(aimYFrac = 0.45) {
  // killcam r2: optional aim height (fraction of hull height) — probes force
  // deterministic module stories (e.g. ~0.3 crosses hull ammo carousels for
  // rack-detonation replays). Default keeps every legacy caller identical.
  const p = game.player;
  if (!p || !p.state || p.combat.destroyed) return false;
  const shooter = game.tankById.get('t90m') && game.tankById.get('t90m').team === 'enemy'
    && game.tankById.get('t90m').combat && !game.tankById.get('t90m').combat.destroyed
    ? game.tankById.get('t90m')
    : game.tanks.find((t) => t.team === 'enemy' && t.combat && !t.combat.destroyed);
  if (!shooter) return false;
  p.combat.hp = Math.min(p.combat.hp, 1);
  _v2.copy(p.state.pos);
  _v2.y += p.spec.dims.heightM * aimYFrac;
  if (!shooter.visual || !shooter.visual.gunMuzzleWorld) return false;
  const original = {
    pos: shooter.state.pos.clone(), yaw: shooter.state.yaw,
    turretYaw: shooter.state.turretYaw, gunPitch: shooter.state.gunPitch,
  };
  shooter.visual.gunMuzzleWorld(_rayO);
  const groundOffset = shooter.state.pos.y - hfProxy.getHeightAt(
    shooter.state.pos.x, shooter.state.pos.z);
  // probe bearings (flat side shots first — guaranteed pen) for clear LOS
  const RELS = [90, -90, 70, -70, 110, -110, 45, 135];
  for (let i = 0; i < RELS.length; i++) {
    const az = p.state.yaw + RELS[i] * DEG;
    const sx = _v2.x + Math.sin(az) * 130;
    const sz = _v2.z + Math.cos(az) * 130;
    shooter.state.pos.set(sx, hfProxy.getHeightAt(sx, sz) + groundOffset, sz);
    // Lay the actual rendered gun onto the target before sampling its muzzle.
    // This keeps the probe honest: its kill cam starts at a real tank barrel,
    // not at the old free-floating synthetic point 7 m above the battlefield.
    for (let solve = 0; solve < 2; solve++) {
      shooter.visual.syncFromState(shooter.state, 0);
      shooter.visual.gunMuzzleWorld(_v1);
      _v3.copy(_v2).sub(_v1).normalize();
      shooter.state.yaw = Math.atan2(_v3.x, _v3.z);
      shooter.state.turretYaw = 0;
      shooter.state.gunPitch = Math.atan2(_v3.y, Math.hypot(_v3.x, _v3.z))
        - (shooter.state.visualPitch || 0);
    }
    shooter.visual.syncFromState(shooter.state, 0);
    shooter.visual.gunMuzzleWorld(_v1);
    _v3.copy(_v2).sub(_v1);
    const d = _v3.length();
    _v3.multiplyScalar(1 / d);
    const block = world.raycast(_v1, _v3, d - p.spec.armor.boundingRadiusM - 1);
    if (block) continue;
    const shellSpec = shooter.spec.gun.shells[0];
    const shell = createShell(shellSpec, shooter.id, false, _v1, _v3, game.nextShellId++);
    game.shells.push(shell);
    bus.emit('shell:fired', {
      shellId: shell.id, shooterId: shooter.id, isPlayer: false,
      shellType: shellSpec.type, shellName: shellSpec.name,
      caliberMm: shellSpec.caliberMm, velocityMps: shellSpec.velocityMps,
      timeS: game.timeS,
      muzzlePos: [_v1.x, _v1.y, _v1.z], dir: [_v3.x, _v3.y, _v3.z],
    });
    return true;
  }
  shooter.state.pos.copy(original.pos);
  shooter.state.yaw = original.yaw;
  shooter.state.turretYaw = original.turretYaw;
  shooter.state.gunPitch = original.gunPitch;
  shooter.visual.syncFromState(shooter.state, 0);
  return false;
}

/** Destroy every remaining enemy through the normal announce path (test aid). */
function debugSlayEnemies() {
  // killcam_shotinfo r1: skip ALLIES — the old guard killed the whole roster
  // and credited all 7 kills to the player (fabricated ACE report, dead
  // allies in a VICTORY).
  for (const ent of game.tanks) {
    if (ent.isPlayer || ent.team !== 'enemy' || !ent.combat || ent.combat.destroyed) continue;
    ent.combat.hp = 0;
    ent.combat.destroyed = true;
    ent.combat.fire.burning = false;
    if (!ent._destroyedAnnounced) {
      ent._destroyedAnnounced = true;
      // battle-ai r7 can defer bot visuals behind the roster build queue; a
      // bot with visual=null still counts as a combat kill.
      if (ent.visual && ent.visual.setDestroyed) ent.visual.setDestroyed();
      bus.emit('tank:destroyed', {
        id: ent.id,
        specId: ent.specId,
        pos: [ent.state.pos.x, ent.state.pos.y, ent.state.pos.z],
        killerId: game.player ? game.player.id : null,
        cause: 'shot',
      });
    }
  }
}

function collectionSize(value) {
  if (!value) return 0;
  if (Number.isFinite(value.length)) return value.length;
  if (Number.isFinite(value.size)) return value.size;
  return 0;
}

const shadowCountCache = { root: null, at: -Infinity, casters: 0, receivers: 0 };
function shadowSceneCounts(force = false) {
  const root = world?.group || scene;
  const now = performance.now();
  if (!force && shadowCountCache.root === root && now - shadowCountCache.at < 2000) {
    return { casters: shadowCountCache.casters, receivers: shadowCountCache.receivers };
  }
  let casters = 0;
  let receivers = 0;
  root.traverse((object) => {
    if (!object.visible || (!object.isMesh && !object.isInstancedMesh)) return;
    if (object.castShadow) casters++;
    if (object.receiveShadow) receivers++;
  });
  shadowCountCache.root = root;
  shadowCountCache.at = now;
  shadowCountCache.casters = casters;
  shadowCountCache.receivers = receivers;
  return { casters, receivers };
}

let debugGpuName = null;
function getDebugGpuName() {
  if (debugGpuName !== null) return debugGpuName;
  debugGpuName = '';
  try {
    const gl = renderer.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    debugGpuName = String(info
      ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER) || '');
  } catch (_) { /* masked/unsupported is a valid browser privacy choice */ }
  return debugGpuName;
}

/** Low-frequency, read-only provider for the opt-in engineering dashboard. */
function collectDebugTelemetry() {
  const draw = renderer.getDrawingBufferSize(new THREE.Vector2());
  const shadow = lighting.getShadowTelemetry();
  const shadowCounts = shadowSceneCounts();
  const loose = world?.getLoosePropStats?.() || { total: 0, active: 0 };
  const net = networkDiagnostics();
  const alive = (game.tanks || []).reduce((n, tank) => n + (!tank.combat?.destroyed ? 1 : 0), 0);
  return {
    quality: {
      buffer: `${draw.x}×${draw.y}`,
      dpr: Number(renderer.getPixelRatio().toFixed(2)),
      dynScale: Number(post.dynScale.toFixed(3)),
      perfTrim: post.perfTrim,
      preset: resolvePresetName(),
      tier: getDeviceTier(),
      gpu: getDebugGpuName() || 'masked GPU',
    },
    simulation: {
      phase: game.phase,
      map: world?.mapId || game.mapId || null,
      timeS: game.timeS || 0,
      tanks: collectionSize(game.tanks),
      alive,
      shells: collectionSize(game.shells),
    },
    world: {
      obstacles: collectionSize(world?.getObstacles?.()),
      colliders: collectionSize(world?.getColliders?.()),
      concealers: collectionSize(world?.getConcealment?.()),
      destructibles: collectionSize(world?.destructibles),
      wrecks: collectionSize(world?.tankWreckSpots),
      looseTotal: loose.total,
      looseActive: loose.active,
    },
    shadows: {
      ...shadow,
      enabled: !!renderer.shadowMap.enabled,
      rescue: window.__GL_DIAG?.rescue || null,
      shaderErrors: collectionSize(window.__GL_DIAG?.errors),
      ...shadowCounts,
    },
    network: net ? {
      connected: !!net.connected,
      rttMs: net.rttMs || 0,
      jitterMs: net.rttJitterMs || 0,
      lossPct: (net.estimatedSnapshotLoss || 0) * 100,
      bufferedBytes: net.transportBufferedBytes || 0,
    } : { connected: null },
    memory: { drawBuffer: `${draw.x}×${draw.y}` },
  };
}

function markShadowProgramsDirty() {
  scene.traverse((object) => {
    if (!object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material.needsUpdate = true;
  });
}

/**
 * Explicit QA probe: compare a tiny direct scene render with shadows on/off.
 * It never runs in gameplay and restores every renderer flag it touches.
 */
async function sampleShadowContribution() {
  const initialShadow = renderer.shadowMap.enabled;
  const counts = shadowSceneCounts(true);
  if (!initialShadow) {
    return { skipped: true, reason: window.__GL_DIAG?.rescue || 'shadow maps disabled', ...counts };
  }
  const width = 96;
  const height = 54;
  const pixels = width * height;
  const withShadow = new Uint8Array(pixels * 4);
  const withoutShadow = new Uint8Array(pixels * 4);
  const target = new THREE.WebGLRenderTarget(width, height, {
    depthBuffer: true,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  });
  const previousTarget = renderer.getRenderTarget();
  const previousViewport = renderer.getViewport(new THREE.Vector4());
  const previousScissor = renderer.getScissor(new THREE.Vector4());
  const previousScissorTest = renderer.getScissorTest();
  const previousAutoClear = renderer.autoClear;
  const renderVariant = (enabled, output) => {
    renderer.shadowMap.enabled = enabled;
    markShadowProgramsDirty();
    lighting.update(true);
    renderer.setRenderTarget(target);
    renderer.setViewport(0, 0, width, height);
    renderer.setScissorTest(false);
    renderer.autoClear = true;
    renderer.clear(true, true, false);
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, output);
  };
  try {
    renderVariant(true, withShadow);
    renderVariant(false, withoutShadow);
    let absDelta = 0;
    let changedDelta = 0;
    let maxLumaDelta = 0;
    let changed = 0;
    let darkened = 0;
    let lumaOn = 0;
    let lumaOff = 0;
    for (let i = 0; i < withShadow.length; i += 4) {
      const on = withShadow[i] * 0.2126 + withShadow[i + 1] * 0.7152 + withShadow[i + 2] * 0.0722;
      const off = withoutShadow[i] * 0.2126 + withoutShadow[i + 1] * 0.7152 + withoutShadow[i + 2] * 0.0722;
      const delta = Math.abs(on - off);
      absDelta += delta;
      if (delta > maxLumaDelta) maxLumaDelta = delta;
      lumaOn += on;
      lumaOff += off;
      if (delta > 2) { changed++; changedDelta += delta; }
      if (off - on > 2) darkened++;
    }
    return {
      skipped: false,
      width,
      height,
      meanAbsLumaDelta: absDelta / pixels,
      meanChangedLumaDelta: changed ? changedDelta / changed : 0,
      maxLumaDelta,
      changedPixelRatio: changed / pixels,
      darkenedPixelRatio: darkened / pixels,
      meanLumaWithShadows: lumaOn / pixels,
      meanLumaWithoutShadows: lumaOff / pixels,
      ...counts,
    };
  } finally {
    renderer.shadowMap.enabled = initialShadow;
    markShadowProgramsDirty();
    lighting.update(true);
    renderer.setRenderTarget(previousTarget);
    renderer.setViewport(previousViewport);
    renderer.setScissor(previousScissor);
    renderer.setScissorTest(previousScissorTest);
    renderer.autoClear = previousAutoClear;
    target.dispose();
    // Give three one turn to settle the restored shadow-enabled variant.
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

perfHud.setTelemetryProvider(collectDebugTelemetry);

window.__DEBUG = {
  scene, camera, renderer, post, lighting, game, fx, rig, bus,
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
  // switch-desync r1: the id the garage UI (stats card / card highlight)
  // believes is selected — probes assert pedestalVisual.specId === this.
  get selectedSpecId() { return selectedSpecId; },
  get pedestalCacheIds() { return [...pedestalCache.keys()]; },
  selectGarageTank: (id) => garage.setSelected(id),
  get world() { return world; },
  switchMap,
  flags: debugFlags,
  frameInfo,
  aimAtNearest: debugAimAtNearest,
  gunAimError: debugGunAimError,
  // controls_gunnery r6: attributable terminal event per player shell
  // (tank/terrain/air + miss distance to the intended target's hull center)
  playerShellLog,
  // controls_gunnery r6: per-battle bot-vs-player pressure counters
  botPressure,
  aimState: debugAimState, // {errMrad,bloomF,reticleRadM,aimDistM,reloadT}
  fastForward: debugFastForward,
  slayEnemies: debugSlayEnemies,
  startBattle,
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
  // SPOTTING WIRING: live SpottingSystem for headless concealment checks
  get spotting() { return game.spotting; },
  killcam,                             // KILL-CAM introspection (phase, cancel)
  showroom,                            // garage orbit introspection (debugState)
  garageDressing,                      // garage-scene r1: workshop dressing rig
  spawnKillShell: debugSpawnKillShell, // KILL-CAM: die on purpose
  // effects_combat r2: shot-mode latch exposed for headless drive tests
  get shotMode() { return shotMode; },
  set shotMode(v) { shotMode = !!v; },
  // controls_gunnery r3: stage the reticle hit-confirm marker on demand so
  // captures can verify its weight without landing a live 400 m shot.
  forceHitMark: (bounced) => hud.forceHitMark(!!bounced),
  // damage panel r9: pose/state hooks for probes + deterministic captures
  get damagePanel() { return damagePanel; },
  devTrace,                              // DEV flight recorder; null in production
  get network() { return networkDiagnostics(); },
  get networkPresentation() { return networkBridge?.getPresentationEventStats?.() || null; },
  telemetry: collectDebugTelemetry,
  sampleShadowContribution,
  // Development-only rendered lifecycle probe: feed authoritative-format
  // presentation events through the real bridge/queue without exposing the
  // authority runtime or mutating production networking APIs.
  injectNetworkEvents(events) {
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
window.__BOOT_TIMINGS = BOOT_TIMINGS;
window.__BOOT_MS = Math.round(performance.now() - BOOT_T0);
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
