/**
 * main.js — integration entry point (ARCHITECTURE.md §4, §5).
 *
 * Startup order (locked): createRenderer → createSky → bakeEnvironment →
 * createLighting (CSM before any material compiles) → EngineCtx → createMap →
 * spawn tanks → createFx → HUD/garage → createAudio → createCameraRig →
 * applyFog → warm frames → window.__GAME_READY.
 *
 * Game flow: garage (pedestal showcase at -1500,-1500) → battle (player vs 7
 * AI tanks) → victory/defeat overlay → back to garage.
 */
import * as THREE from 'three';
import { createRenderer, onResize } from './engine/renderer.js';
import { createSky } from './engine/sky.js';
import { createLighting } from './engine/lighting.js';
import { createPost } from './engine/post.js';
import { createCameraRig } from './engine/cameraRig.js';
import { createMap } from './world/map.js';
import { MAP_IDS, getMapConfig, resolveMapId } from './world/maps/index.js';
import { MAP_THUMBS } from './ui/mapThumbs.js';
import { ALL_TANK_IDS, getSpec, MODEL_SOURCE } from './vehicles/specs.js';
import { createTank } from './vehicles/tankFactory.js';
// CAMO WIRING: pattern persistence + live repaint (garage picker, AUTO biome)
import {
  CAMO_PATTERN_IDS, CAMO_PATTERN_LABEL, getCamoSelection, setCamoSelection,
  setCamoBiome, applyCamoPatterns, warmWreckTextures,
} from './vehicles/materials.js';
import { computeDispersionRadM, SIM_DT } from './sim/movement.js';
import { tankPoseFromState, queryAimArmor, traceTank } from './sim/armor.js';
import { estimatePenRatio, selectShell, resolveShellHit, createCombatState } from './sim/damage.js';
import { createShell } from './sim/ballistics.js';
import { createKillCam } from './game/killcam.js';
import { createFx } from './fx/effects.js';
import { initHud } from './ui/hud.js';
import { createDamagePanel } from './ui/damagePanel.js';
import { createGarage } from './ui/garage.js';
import { getLastBattleEarnings } from './ui/techtree.js';
import { createGarageStage } from './ui/garageStage.js';
import { createAudio } from './audio/audio.js';
import { createInput } from './game/input.js';
import { createSettings } from './ui/settings.js';
import {
  createBus, createGameState, spawnTanks, setupBattle, simStep, createCollider,
  mulberry32,
} from './game/state.js';

const DEG = Math.PI / 180;
const GARAGE_POS = new THREE.Vector3(-1500, 0, -1500);
const MAX_SIM_STEPS = 4;

// scratch
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _rayO = new THREE.Vector3();
const _rayD = new THREE.Vector3();
const _fwd = new THREE.Vector3();
// chase-camera occlusion focus (player hull center, lifted to turret height)
const _occlFocus = new THREE.Vector3();

// ---------------------------------------------------------------------------
// Engine bootstrap (§4 startup order)
// ---------------------------------------------------------------------------
const container = document.getElementById('app');
const renderer = createRenderer(container);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  60, (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
  0.5, 4000,
);

const sky = createSky(scene, renderer);
sky.bakeEnvironment();
const lighting = createLighting(scene, camera, sky.sunDir);

const engineCtx = {
  renderer,
  scene,
  camera,
  setupShadowMaterial: (mat, extraHook = null) => lighting.setupShadowMaterial(mat, extraHook),
  anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()),
  quality: 'high',
};

// --- MAP-CONFIG WIRING: worlds are lazy-built per map config and cached;
// `world` always points at the active one. Long-lived systems (camera rig,
// fx) reach terrain through the stable proxy below so a map switch never
// leaves them holding a stale heightfield.
const worldCache = new Map();
let world = createMap(engineCtx, { mapId: 'verdant', seed: 1337 });
worldCache.set('verdant', world);
const hfProxy = {
  getHeightAt: (x, z) => world.heightField.getHeightAt(x, z),
  getNormalAt: (x, z) => world.heightField.getNormalAt(x, z),
  getGroundType: (x, z) => world.heightField.getGroundType(x, z),
  get size() { return world.heightField.size; },
  get minY() { return world.heightField.minY; },
  get maxY() { return world.heightField.maxY; },
};

// --- game state + tanks -----------------------------------------------------
const bus = createBus();
const game = createGameState();
spawnTanks(game, engineCtx);
setupBattle(game, 'm1a2', world); // battle scene staged behind the garage screen
let collider = createCollider(game, world);

// --- fx ----------------------------------------------------------------------
const fx = createFx(engineCtx, hfProxy, { seed: 5000 });
scene.add(fx.group);
fx.bindBus(bus);

// Per-wheel suspension: give every battle tank the live heightfield so road
// wheels conform to terrain (garage pedestal tank stays rigid on its disc).
const groundSampler = (x, z) => hfProxy.getHeightAt(x, z);
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
GARAGE_POS.y = world.heightField.getHeightAt(GARAGE_POS.x, GARAGE_POS.z);
const garageStage = createGarageStage(engineCtx, GARAGE_POS);
scene.add(garageStage.group);
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
  const skyCfg = world.config.sky || {};
  lighting.setSun(sky.sunDir, on
    ? { ...skyCfg, sunColorHex: GARAGE_SUN_COLOR,
        sunIntensity: (skyCfg.sunIntensity ?? 4.5) * 0.55 }
    : skyCfg);
}

let pedestalVisual = null;
let selectedSpecId = 'm1a2';
let pedestalPollToken = 0; // content_breadth r1: cancels stale GLB polls
function setPedestalTank(specId) {
  if (pedestalVisual && pedestalVisual.specId === specId) return;
  pedestalPollToken++;
  // content_breadth r2: the OUTGOING hero stays on stage until the incoming
  // model is ready — disposing it immediately left 1-6 s of bare pedestal
  // while the incoming GLB settled. Each call retires only ITS OWN prev; a
  // superseded poll retires its prev on the token-mismatch path, so rapid
  // carousel scrubbing cannot leak visuals.
  const prev = pedestalVisual;
  let prevRetired = false;
  const retirePrev = () => {
    if (prevRetired || !prev) return;
    prevRetired = true;
    prev.dispose();
  };
  pedestalVisual = createTank(specId, engineCtx, { camoSeed: 4200, quality: 'high' });
  pedestalVisual.root.position.set(GARAGE_POS.x, GARAGE_POS.y + 0.35, GARAGE_POS.z);
  pedestalVisual.root.rotation.y = 162 * DEG;
  scene.add(pedestalVisual.root);
  // content_breadth r1: never show the three-box procedural placeholder on
  // the garage pedestal while the hero's GLB parses (the hard pop landed
  // directly above the model's CC-BY credit line). createTank already kicked
  // the async GLB swap for THIS visual — the swap lands IN PLACE on the same
  // hull/turret groups, so we only hide the stand-in and poll the loader
  // bookkeeping (~150 ms) until every started job settled, then reveal the
  // real model. No dispose/re-create: tearing the visual down mid-swap races
  // three's compileAsync material poll (unhandled TypeError). Dynamic import
  // keeps GLTFLoader off the boot-critical bundle path (perf-budget rule).
  const src = MODEL_SOURCE[specId];
  if (src && src.source === 'glb' && src.glb) {
    const token = pedestalPollToken;
    const vis = pedestalVisual;
    import('./vehicles/modelLoader.js').then((m) => {
      if (token !== pedestalPollToken) { retirePrev(); return; }
      if (m.hasCachedGlb(src.glb.path)) { retirePrev(); return; }
      if (vis.setVisible) vis.setVisible(false); // prev covers the stage
      const stats = (typeof window !== 'undefined' && window.__GLB_STATS) || null;
      const poll = () => {
        if (token !== pedestalPollToken) { retirePrev(); return; } // superseded
        const settled = m.hasCachedGlb(src.glb.path) &&
          (!stats || stats.settled >= stats.started);
        if (!settled) { setTimeout(poll, 150); return; }
        if (vis.setVisible) vis.setVisible(true); // swap landed in place
        retirePrev(); // hand-over, no gap
      };
      setTimeout(poll, 150);
    }).catch(retirePrev); // loader unavailable — keep the procedural stand-in
  } else {
    retirePrev(); // procedural: instant
  }
}
setPedestalTank(selectedSpecId);

function garageCameraPose() {
  _v1.set(GARAGE_POS.x + 8.2, GARAGE_POS.y + 2.9, GARAGE_POS.z + 8.8);
  _v2.set(GARAGE_POS.x, GARAGE_POS.y + 1.55, GARAGE_POS.z);
  rig.setExternalPose(_v1, _v2, 42);
}

// --- MAP-CONFIG WIRING: map switching --------------------------------------
// Re-seat the garage stage on the active map's edge terrain height.
function placeGarage() {
  GARAGE_POS.y = world.heightField.getHeightAt(GARAGE_POS.x, GARAGE_POS.z);
  garageStage.group.position.copy(GARAGE_POS);
  spotA.position.set(GARAGE_POS.x + 9, GARAGE_POS.y + 11, GARAGE_POS.z + 7);
  spotB.position.set(GARAGE_POS.x - 10, GARAGE_POS.y + 8, GARAGE_POS.z - 6);
  spotTarget.position.set(GARAGE_POS.x, GARAGE_POS.y + 1.2, GARAGE_POS.z);
  if (pedestalVisual) {
    pedestalVisual.root.position.set(GARAGE_POS.x, GARAGE_POS.y + 0.35, GARAGE_POS.z);
  }
  if (game.phase === 'garage') garageCameraPose();
}

/**
 * Activate a battlefield: lazily build + cache its world, hide the old one,
 * re-target atmosphere/lighting to the map's sky preset, rebuild the minimap
 * and re-seat the garage stage. Synchronous (screenshot-contract safe).
 * @param {string} mapId concrete map id (never 'random' — resolve first)
 * @returns {object} the active World
 */
function switchMap(mapId) {
  if (world.mapId === mapId) return world;
  let next = worldCache.get(mapId);
  if (!next) {
    next = createMap(engineCtx, { mapId, seed: 1337 });
    worldCache.set(mapId, next);
  }
  world.group.visible = false;
  world = next;
  world.group.visible = true;
  collider = createCollider(game, world);
  const skyCfg = world.config.sky || {};
  sky.applyPreset(skyCfg, scene);
  lighting.setSun(sky.sunDir, skyCfg);
  baseFogDensity = scene.fog.density;
  hud.buildMinimap(world.heightField, world.getMinimapFeatures(), world.config.minimap,
    minimapSnapCtx()); // hud_ui r6: real top-down capture as the map underlay
  placeGarage();
  return world;
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
const hud = initHud(bus);
const damagePanel = createDamagePanel();
hud.setDamagePanel(damagePanel);
hud.buildMinimap(world.heightField, world.getMinimapFeatures(), world.config.minimap,
  minimapSnapCtx()); // hud_ui r6: real top-down capture as the map underlay

const garage = createGarage({
  specs: ALL_TANK_IDS.map(getSpec), // COMMUNITY TANKS: grown carousel
  bus,
  onSelect: (specId) => { selectedSpecId = specId; setPedestalTank(specId); },
  onBattle: (specId, mapId) => startBattle(specId, mapId), // MAP-CONFIG WIRING
  // MAP-CONFIG WIRING: battlefield picker cards (4 maps + Random)
  maps: [
    ...MAP_IDS.map((id) => {
      const c = getMapConfig(id);
      return { id, name: c.name, sub: c.sub || '', thumb: MAP_THUMBS[id] || '' };
    }),
    { id: 'random', name: 'Random', sub: 'Any battlefield', thumb: '' },
  ],
  // CAMO WIRING: per-tank paint picker — persists the choice and repaints the
  // shared albedo in place, so the pedestal tank updates immediately.
  camo: {
    patterns: CAMO_PATTERN_IDS,
    label: CAMO_PATTERN_LABEL,
    get: (specId) => getCamoSelection(specId),
    set: (specId, patternId) => {
      setCamoSelection(specId, patternId);
      applyCamoPatterns(specId);
    },
  },
  // CAMO WIRING (r8): AUTO(map) tanks preview the pattern they will actually
  // wear on the highlighted battlefield. 'random' falls back to verdant
  // inside setCamoBiome; startBattle re-calls setCamoBiome(world.mapId) after
  // the roll, so battle state is always correct regardless.
  onMapSelect: (mapId) => {
    setCamoBiome(mapId);
    applyCamoPatterns();
  },
});

// --- audio --------------------------------------------------------------------
const audio = createAudio();
audio.bindBus(bus);

// --- camera rig -----------------------------------------------------------------
// Server-aim raycast: world geometry PLUS live enemy hulls, so the reticle
// distance (and the gun's auto-elevation) matches where the shot actually
// lands when the crosshair rests on a tank (reticle-to-impact alignment).
const _armEnd = new THREE.Vector3();
const _armTo = new THREE.Vector3();
// controls_gunnery r6: STICKY SERVER RETICLE. The aim ray was exact-hit-or-
// nothing against enemy hulls, so with a mover near the crosshair the anchor
// (range readout, pen indicator, lead reference AND the gun's auto-elevation
// distance) flickered to background terrain the instant the ray slipped off
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
  const wHit = world.raycast(origin, dir, maxDist);
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
  raycast: (o, d, m) => world.raycast(o, d, m),
  aimRaycast: aimRaycastWithTanks,
  getPlayer: () => game.player,
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
const killcam = createKillCam({
  scene, camera, rig, heightField: hfProxy, getPlayer: () => game.player,
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
    const pen = ev.kind === 'pen' || ev.kind === 'he_pen' || (ev.damage || 0) > 0;
    audio.hitConfirm(pen);
  }
  if (ev.targetId === game.player.id && (ev.damage || 0) > 0) rig.addTrauma(0.35);
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
bus.on('shell:hit', (ev) => {
  if (!game.player || ev.attackerId !== game.player.id) return;
  const rec = playerShellLog.find((r) => r.shellId === ev.shellId);
  if (!rec) return;
  rec.terminal = 'tank';
  rec.hitTankId = ev.targetId;
  rec.hitKind = ev.kind;
  rec.damage = Math.round(ev.damage || 0);
  rec.missM = teleMissM(rec, ev.pos);
});
bus.on('shell:expired', (ev) => {
  const rec = playerShellLog.find((r) => r.shellId === ev.shellId);
  if (!rec || rec.terminal) return;
  rec.terminal = ev.hitTerrain ? 'terrain' : 'air';
  rec.missM = teleMissM(rec, ev.pos);
});
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
  "font-family:'Switzer','Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#eef4f9;";
endOverlay.className = 'cot-end';
const endTitle = document.createElement('div');
endTitle.style.cssText = 'font-size:52px;font-weight:800;letter-spacing:0.3em;text-shadow:0 2px 18px rgba(0,0,0,0.8);';
// META-GAME: battle payout line (earned XP/credits persist via ui/techtree.js)
const endEarn = document.createElement('div');
endEarn.style.cssText =
  'font-size:15px;font-weight:700;letter-spacing:0.14em;color:#cfd9e2;' +
  'text-shadow:0 1px 8px rgba(0,0,0,0.8);';
const endBtn = document.createElement('button');
endBtn.textContent = 'RETURN TO GARAGE';
endBtn.style.cssText =
  'font-size:16px;font-weight:700;letter-spacing:0.2em;padding:14px 44px;cursor:pointer;' +
  'color:#fff7ea;border:1px solid #ffc169;background:linear-gradient(180deg,#ffa02e,#d95f00);' +
  "font-family:'Switzer','Segoe UI',Roboto,Helvetica,Arial,sans-serif;";
endOverlay.append(endTitle, endEarn, endBtn);
document.body.appendChild(endOverlay);
endBtn.addEventListener('click', () => { bus.emit('ui:click', {}); enterGarage(); });

function showEndOverlay(result) {
  endTitle.textContent = result === 'victory' ? 'VICTORY' : result === 'draw' ? 'DRAW' : 'DEFEAT';
  endTitle.style.color = result === 'victory' ? '#7ee87e' : result === 'draw' ? '#cfd9e2' : '#f05a5a';
  const earn = getLastBattleEarnings();
  endEarn.innerHTML = earn
    ? `<span style="color:#ffd27a">+${earn.xp.toLocaleString('en-US')} XP</span>` +
      `<span style="margin:0 14px;color:#e9eef3">+${earn.credits.toLocaleString('en-US')} CREDITS</span>` +
      `<span style="color:#8a97a3">${earn.kills} kill${earn.kills === 1 ? '' : 's'} &middot; ` +
      `${earn.damage.toLocaleString('en-US')} damage</span>`
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

const input = createInput({ lockElement: renderer.domElement });
const settings = createSettings({
  input,
  bus,
  isBattleActive: () => game.phase === 'battle' && !game.result,
  gearVisible: () => game.phase === 'garage',
});

// Accumulate wheel notches (clamped ±3) instead of a single ±1 latch: two
// physical notches inside one render frame used to collapse to ONE zoom step
// (WoT steps once per notch; at 30 fps fast flicks felt like dropped zooms).
// The rig consumes the whole accumulated value each update (cameraRig.js).
input.onAction('zoomIn', () => { if (game.phase === 'battle' && !settings.isOpen()) wheelStep = Math.min(wheelStep + 1, 3); });
input.onAction('zoomOut', () => { if (game.phase === 'battle' && !settings.isOpen()) wheelStep = Math.max(wheelStep - 1, -3); });
renderer.domElement.addEventListener('mousedown', () => {
  audio.resume();
  if (game.phase !== 'battle' || settings.isOpen()) return;
  if (!input.isLocked()) input.requestLock();
});

// Battle start: grab the pointer inside the BATTLE-click gesture and flash the
// controls hint strip (reflects the CURRENT bindings; fades after 8 s).
bus.on('ui:battleStart', () => {
  input.requestLock();
  settings.showHints();
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
// Extinguisher. Per-battle stock 2/2/1, 5 s per-slot cooldown, and a kit is
// NOT consumed when there is nothing for it to fix.
const CONSUMABLE_STOCK = [2, 2, 1];
const CONSUMABLE_COOLDOWN_S = 5;
const consumableLeft = [...CONSUMABLE_STOCK];
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
  if (slot < 0 || slot > 2) return;
  if (consumableLeft[slot] <= 0) { bus.emit('ui:consumableDenied', { slot, reason: 'EMPTY' }); return; }
  if (game.timeS < consumableReadyAt[slot]) { bus.emit('ui:consumableDenied', { slot, reason: 'COOLDOWN' }); return; }
  const c = p.combat;
  let ok = false;
  if (slot === 0) {
    for (const name of Object.keys(c.modules)) {
      const m = c.modules[name];
      if (m.state !== 'ok') {
        m.hp = m.maxHp; m.state = 'ok'; m.repairT = 0;
        bus.emit('module:state', { id: p.id, module: name, state: 'ok' });
        ok = true;
      }
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
  consumableLeft[slot] -= 1;
  consumableReadyAt[slot] = game.timeS + CONSUMABLE_COOLDOWN_S;
  bus.emit('ui:consumableUsed', { slot, left: consumableLeft[slot] });
  bus.emit('ui:click', {});
});
input.onAction('minimapZoom', () => {
  if (game.phase === 'battle') bus.emit('ui:minimapZoom', {});
});
// SHOT-INFO: rebindable toggle for the shot-info log (src/ui/shotInfo.js).
input.onAction('shotLog', () => {
  if (game.phase === 'battle') bus.emit('ui:shotLog', {});
});

bus.on('ui:shellSelect', ({ slot }) => {
  if (game.player && game.player.combat && !game.player.combat.destroyed) {
    selectShell(game.player.combat, slot);
    game.player.input.shellSlot = slot;
  }
});

// ---------------------------------------------------------------------------
// Game flow
// ---------------------------------------------------------------------------
// Per-battle loadout (rounds carried per shell type) — the HUD tray renders
// card.count live, and firing is gated on the slot having rounds left.
const SHELL_LOADOUT = { AP: 24, APCR: 20, APFSDS: 24, HEAT: 16, HE: 12 };
let shellCards = [];
function buildShellCards(spec) {
  shellCards = spec.gun.shells.map((sh) => ({
    name: sh.name, type: sh.type, dmg: sh.dmg, penLabel: `${Math.round(sh.pen100Mm)} mm`,
    count: SHELL_LOADOUT[sh.type] != null ? SHELL_LOADOUT[sh.type] : 20,
  }));
}
// Real ammo depletion: the player's fired shells consume the active slot.
bus.on('shell:fired', (p) => {
  if (!p.isPlayer || !game.player || !game.player.combat) return;
  const card = shellCards[game.player.combat.shellSlot];
  if (card && card.count > 0) card.count -= 1;
});

function startBattle(specId, mapId = null) {
  // PERF (performance_budget r1): first-combat fallback for the post-ready
  // idle warm — no-op when the idle callback already ran (the common case).
  warmCombatPipeline();
  // SHOT-MODE RESET (effects_combat/content_breadth r2): __SHOTS.set() freezes
  // fx and stops the sim tick; any UI path out of shot mode (garage BATTLE
  // button) must resume it or the battle is permanently frozen.
  shotMode = false;
  fx.setFrozen(false);
  selectedSpecId = specId;
  debugAimTargetId = null; // sticky drive-test aim never carries across battles
  // MAP-CONFIG WIRING: battle on the picked map ('random' rolls here)
  if (mapId) switchMap(resolveMapId(mapId));
  game.mapId = world.mapId;
  // CAMO WIRING: AUTO patterns resolve to the biome of the map being fought;
  // only tanks whose resolved pattern actually changed get repainted.
  setCamoBiome(world.mapId);
  applyCamoPatterns();
  // COMMUNITY TANKS: garage battles roll a random enemy roster from the
  // full pool (core + community), seeded per battle for reproducibility.
  // MODERN EXPANSION: rosters are era-matched to the player's vehicle —
  // mixed-era battles happen only on the RANDOM battlefield card.
  setupBattle(game, specId, world, { random: true, mixedEra: mapId === 'random' });
  // Fresh battlefield fx: clear scars/tracers/smoke columns left on (or by)
  // last battle's wrecks — scar decals are parented onto tank hulls and would
  // otherwise carry into the rematch.
  fx.resetAll();
  buildShellCards(game.player.spec);
  damagePanel.setTank(game.player.spec);
  garage.hide();
  endOverlay.style.display = 'none';
  endShown = false; // KILL-CAM: fresh battle — re-arm the end-of-battle gate
  deathCamShown = false; // killcam_shotinfo r1: re-arm the at-death replay
  killcam.cancel(); // KILL-CAM: never carry a replay across battles
  hud.setMode('battle');
  game.phase = 'battle';
  setGarageSpots(false); // PERF: no spot-light cost on battle draws
  setGarageSunTrim(false); // restore the map's authored warm sun
  bus.emit('phase:change', { phase: 'battle' });
  for (let i = 0; i < 3; i++) { consumableLeft[i] = CONSUMABLE_STOCK[i]; consumableReadyAt[i] = 0; }
  bus.emit('ui:consumableReset', {});
  rig.release();
  rig.snapArcade(2, game.player.state.yaw, -10 * DEG);
  // Battle-open cinematic: 3 s flyby sweeping onto the chase camera
  // (skippable with any camera input). Doubles as the garage transition.
  if (rig.startCinematic) rig.startCinematic(3);
  audio.resume();
  audio.ambientOn(true);
}

function enterGarage() {
  // SHOT-MODE RESET: see startBattle — the garage is a live-mode entry too.
  shotMode = false;
  fx.setFrozen(false);
  game.phase = 'garage';
  setGarageSpots(true);
  setGarageSunTrim(true);
  bus.emit('phase:change', { phase: 'garage' });
  endOverlay.style.display = 'none';
  if (document.exitPointerLock) document.exitPointerLock();
  hud.setMode('hidden');
  garage.show(selectedSpecId);
  garageCameraPose();
  audio.ambientOn(false);
  audio.playGarageSting();
}

// ---------------------------------------------------------------------------
// HUD frame assembly (§4 step 7)
// ---------------------------------------------------------------------------
const frameInfo = {
  timeS: 0,
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
    gunMarker: new THREE.Vector3(),
    atGunLimit: false,
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
  isSpotted: (id) => (game.spotting ? game.spotting.isSpotted(id, 'player', game.player) : true),
  player: null,
};
function refreshSpotFrame() {
  if (game.spotting && game.player && game.player.state) {
    spotFrame.player = game.spotting.getConcealment(game.player, game.timeS);
  } else {
    spotFrame.player = null;
  }
  frameInfo.spotting = spotFrame;
}

function computeAimInfo() {
  const p = game.player;
  const aim = frameInfo.aim;
  aim.point.copy(rig.aimPoint);
  aim.distM = rig.aimDist;
  aim.dispersionRadM = computeDispersionRadM(p.spec, p.state, rig.aimDist);
  aim.atGunLimit = p.state.atGunLimit;
  aim.reload.t = p.combat.reload.t;
  aim.reload.totalS = p.combat.reload.totalS;
  aim.shellSlot = p.combat.shellSlot;
  aim.shells = shellCards;
  aim.zoom = rig.mode === 'SNIPER' ? rig.zoom : 1;

  // gun marker: where the barrel actually points, projected at aim distance
  p.visual.gunMuzzleWorld(_v1);
  p.visual.gunPivotWorld(_v2);
  _v3.copy(_v1).sub(_v2).normalize();
  aim.gunMarker.copy(_v1).addScaledVector(_v3, Math.max(rig.aimDist - 2, 6));

  // BLOCKED-SHOT INDICATOR (controls_gunnery r2): the reticle ray comes from
  // the camera, the shell leaves the muzzle — near crests/walls/poles they
  // disagree and shells silently die meters out while the reticle reads
  // clear. Raycast the actual muzzle→aimPoint path every HUD frame; the
  // reticle turns red + prints the blocking distance when obstructed short
  // of the aim point.
  aim.blockedDistM = null;
  p.visual.gunMuzzleWorld(_v1);
  _v2.copy(aim.point).sub(_v1);
  const pathLen = _v2.length();
  if (pathLen > 12) {
    _v2.multiplyScalar(1 / pathLen);
    const blk = world.raycast(_v1, _v2, pathLen - 6);
    if (blk) aim.blockedDistM = blk.dist;
  }

  // penetration indicator: first enemy plate under the aim ray.
  // controls_gunnery r6: matches the sticky server reticle — the bounding
  // gate is inflated ×1.15 like aimRaycastWithTanks, and the last resolved
  // pen ratio is HELD for a short hysteresis window when the ray briefly
  // slips off a mover, so the pen color never strobes while tracking.
  aim.penRatio = null;
  rig.getAimRay(_rayO, _rayD);
  const shellSpec = p.spec.gun.shells[p.combat.shellSlot];
  let bestDist = Infinity;
  let bestInfo = null;
  for (const ent of game.tanks) {
    if (ent.isPlayer || !ent.state || !ent.combat || ent.combat.destroyed) continue;
    _v1.copy(ent.state.pos);
    _v1.y += ent.spec.dims.heightM * 0.5;
    _v1.sub(_rayO);
    const proj = _v1.dot(_rayD);
    if (proj < 0 || proj > 800) continue;
    const r = ent.spec.armor.boundingRadiusM * AIM_STICKY_INFLATE;
    if (_v1.lengthSq() - proj * proj > r * r) continue;
    const q = queryAimArmor(_rayO, _rayD, 800, tankPoseFromState(ent.state), ent.spec.armor);
    if (q && q.distM < bestDist) { bestDist = q.distM; bestInfo = q; }
  }
  if (bestInfo) {
    aim.penRatio = estimatePenRatio(shellSpec, bestDist, bestInfo);
    lastPenRatio = aim.penRatio;
    lastPenUntilMs = performance.now() + AIM_STICKY_HOLD_MS;
  } else if (performance.now() < lastPenUntilMs) {
    aim.penRatio = lastPenRatio; // sticky-reticle hysteresis (see above)
  }
}
let lastPenRatio = null;
let lastPenUntilMs = -Infinity;

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------
const camInput = { mouseDX: 0, mouseDY: 0, wheel: 0, rmb: false, shiftPressed: false };
const _listenerPose = { pos: null, forward: _fwd }; // reused — no per-frame literal
let simAcc = 0;
let lastMs = -1;
let lastFov = camera.fov;
let endShown = false;
let deathCamShown = false; // killcam_shotinfo r1: death replay played at death
let shotMode = false;
// controls_gunnery r5: true while the current __SHOTS view staged a live HUD
// frame (player_view / sniper_view) — those views re-run hud.update each
// shot-mode frame so the reticle canvas stays live (forceHitMark etc.).
let shotHudFrame = false;
let lastCineActive = false; // battle-open flyby HUD veil edge latch

function updateDustAndSync(dtFrame) {
  for (const ent of game.tanks) {
    if (!ent.state || !ent.combat) continue;
    // effects_combat r1: pass the real frame dt so self-timed visual
    // timelines (recuperator recoil, turret-pop arc, ember cooldown) play at
    // wall-clock speed on 120 Hz displays (undefined at boot -> 1/60 default).
    ent.visual.syncFromState(ent.state, dtFrame);
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
      if (sp > 1.2 && world.crushables && world.crushables.length) {
        const hl = ent.spec.dims.hullLengthM * 0.5 + 0.5;
        for (let ci = 0; ci < world.crushables.length; ci++) {
          const c = world.crushables[ci];
          if (c.toppled) continue;
          const dx = c.x - ent.state.pos.x, dz = c.z - ent.state.pos.z;
          if (dx * dx + dz * dz > hl * hl) continue;
          if (world.crushProp(ci, _fwd.x, _fwd.z)) {
            _v1.set(c.x, c.y, c.z);
            fx.propCrush(_v1, _fwd, c.h);
          }
        }
      }
    }
  }
}

function tick(nowMs) {
  requestAnimationFrame(tick);
  if (lastMs < 0) lastMs = nowMs;
  const dtR = Math.min(0.1, Math.max(0, (nowMs - lastMs) / 1000));
  lastMs = nowMs;

  // Sniper-zoom de-fog: at high zoom the exp2 fog + ACES crush distant
  // contrast to haze; scale density down toward 0.35x as FOV drops below 15
  // (applies in shot mode too so sniper_view captures stay crisp).
  if (scene.fog) {
    const fogScale = camera.fov < 15 ? Math.max(0.22, Math.pow(camera.fov / 15, 1.6)) : 1;
    scene.fog.density = baseFogDensity * fogScale;
  }

  if (shotMode) {
    // Deterministic screenshot hold: no sim, no rig, frozen fx clock.
    // (dt = 0 also snaps the foliage occlusion fade to zero — see vegetation.)
    camera.getWorldDirection(_fwd);
    world.update(0, camera.position, _fwd, null);
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

  // 1. poll input (action layer: rebindable, Set-based state — no ghosting)
  if (inBattle && !paused && !kcActive && game.player && !game.player.combat.destroyed) {
    const st = input.getState();
    const inp = game.player.input;
    inp.throttle = (st.forward ? 1 : 0) - (st.back ? 1 : 0);
    inp.steer = (st.right ? 1 : 0) - (st.left ? 1 : 0);
    inp.brake = st.handbrake;
    const haveAmmo = !shellCards.length || ((shellCards[inp.shellSlot | 0] || {}).count | 0) > 0;
    inp.fire = ((st.fire && (input.isLocked() || input.padActive())) || debugFlags.forceFire) && haveAmmo;
  } else if (game.player) {
    const inp = game.player.input;
    inp.throttle = 0; inp.steer = 0; inp.brake = false; inp.fire = false;
  }
  // smoothed + sensitivity/invert-scaled aim delta (extra scale in sniper)
  input.consumeMouseDelta(_mouse, dtR, rig.mode === 'SNIPER');
  camInput.mouseDX = paused ? 0 : _mouse.x;
  camInput.mouseDY = paused ? 0 : _mouse.y;
  camInput.wheel = paused ? 0 : wheelStep;
  camInput.rmb = input.isDown('freeCamera');
  camInput.shiftPressed = input.isDown('sniperToggle');
  wheelStep = 0;

  // 2. fixed-step simulation (held while the settings panel is open)
  if (inBattle && !paused && !kcActive) {
    simAcc = Math.min(simAcc + dtR, SIM_DT * MAX_SIM_STEPS);
    while (simAcc >= SIM_DT) {
      simStep(game, bus, world, rig, collider);
      simAcc -= SIM_DT;
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
        rig.release();
        // Death-cam: slow orbit of the player's wreck behind the overlay.
        if (game.result === 'defeat' && rig.startDeathCam) rig.startDeathCam();
      };
      // killcam_shotinfo r1: never replay an already-shown death — when the
      // player died earlier (battle continued), a later team 'defeat' would
      // re-run the stale death replay without this guard.
      const played = !deathCamShown && killcam.playForResult(game.result, game.timeS, finishBattle);
      debugFlags.lastEndFlow = { played, result: game.result, timeS: game.timeS,
        resultWallMs: performance.now(), kcBeginWallMs: killcam.lastBeginWallMs }; // KILL-CAM debug
      if (played) {
        veilHud(true); // cinematic letterbox owns the screen
      } else {
        finishBattle();
      }
    } else if (!game.result) {
      endShown = false;
    }
    // killcam_shotinfo r1: the player died but the battle continues (allies
    // still fighting) — play the death replay NOW, then spectate the wreck
    // with the death cam until the team result resolves.
    if (!game.result && game.player && game.player.combat.destroyed && !deathCamShown) {
      deathCamShown = true;
      if (document.exitPointerLock) document.exitPointerLock();
      const afterDeath = () => {
        veilHud(false);
        rig.release();
        if (rig.startDeathCam) rig.startDeathCam();
      };
      if (killcam.playForResult('defeat', game.timeS, afterDeath)) veilHud(true);
      else afterDeath();
    }
  }

  // 3. camera rig (kill-cam drives the camera through rig.setExternalPose)
  if (inBattle && !paused && !kcActive) rig.update(dtR, camInput);
  if (kcActive) killcam.update(dtR);

  // Battle-open flyby: hide the battle HUD while the rig owns the camera
  // (the rig itself shows the letterbox bars — cameraRig.setLetterbox).
  // Edge-triggered so the kill-cam's own veilHud calls are never fought.
  if (!kcActive && rig.cinematicActive !== lastCineActive) {
    lastCineActive = rig.cinematicActive;
    veilHud(lastCineActive);
  }
  updateSniperFill(); // close-quarters scope readability (see definition)

  // 4. world LOD/wind (+ WoT-style near-grass suppression while scoped, and
  // chase-camera foliage occlusion fade along player→camera in arcade).
  // r5: rig.aimDist drives the scope-ray foliage corridor length so the cull
  // opens the sight line all the way to the aimed target, not just 70 m.
  world.setSniperFade(rig.mode === 'SNIPER' ? 1 : 0, false, camera.fov, rig.aimDist);
  camera.getWorldDirection(_fwd);
  let occlFocus = null;
  // lighting_post r2: never run the chase-camera occlusion fade during an
  // external capture pose (setExternalPose keeps mode ARCADE) — the fade
  // dithered bushes into screen-door noise in staged combat_firing frames.
  if (inBattle && !kcActive && rig.mode === 'ARCADE' && !rig.externalActive &&
      game.player && game.player.state &&
      game.player.visual && game.player.visual.root.visible) {
    occlFocus = _occlFocus.copy(game.player.state.pos);
    occlFocus.y += game.player.spec.dims.heightM * 0.75;
  }
  world.update(dtR, camera.position, _fwd, occlFocus);

  // 5. visuals + dust (frozen during the kill-cam replay — tanks hold the
  // pose they died in; the x-ray reads the snapshot, not live state)
  if (!kcActive) updateDustAndSync(dtR);

  // 6. fx
  fx.update(dtR, game.shells, camera);

  // 7. HUD (hidden + frozen while the kill-cam letterbox owns the screen).
  // NOTE: live isActive() check — the replay may have STARTED in step 2 of
  // this very tick, and hud.update would re-show the HUD over the letterbox.
  if (inBattle && game.player && !kcActive && !killcam.isActive()) {
    frameInfo.timeS = game.timeS;
    frameInfo.mode = rig.mode === 'SNIPER' ? 'sniper' : 'battle';
    frameInfo.player = game.player;
    frameInfo.tanks = game.tanks; // COMMUNITY TANKS: roster varies per battle
    frameInfo.shells = game.shells;
    refreshSpotFrame(); // SPOTTING WIRING
    computeAimInfo();
    hud.update(frameInfo);
    damagePanel.update(game.player.combat);
  }

  // 8. audio
  camera.getWorldDirection(_fwd);
  _listenerPose.pos = camera.position;
  audio.update(dtR, _listenerPose, game.tanks);

  // 9-10. shadows + post
  if (camera.fov !== lastFov) { lighting.updateFrustums(); lastFov = camera.fov; }
  lighting.update();
  post.render(dtR);
}

window.addEventListener('resize', () => {
  onResize(renderer, camera);
  post.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
  lighting.updateFrustums();
});

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
  techtree: 0.7,
  battlefield_desert: 2.0,
  battlefield_winter: 2.0,
  battlefield_urban: 2.0,
  killcam_xray: 1.0, // KILL-CAM
};

// which world a screenshot view must be captured on (default: verdant)
const VIEW_MAP = {
  battlefield_desert: 'desert',
  battlefield_winter: 'winter',
  battlefield_urban: 'urban',
};

// MAP-CONFIG WIRING: pin the shot to its map, re-seating the staged battle
// (deterministic spawns) whenever the map actually changes.
function ensureShotWorld(mapId) {
  if (world.mapId !== mapId) switchMap(mapId);
  // camo_spotting r2: staged captures must show biome-correct AUTO paint —
  // startBattle resolves the camo biome but the contract views do not pass
  // through it, so shots could carry the previous biome's paint.
  setCamoBiome(mapId);
  applyCamoPatterns();
  // Always restage deterministically: a prior random-roster battle must not
  // leak into the screenshot contract (recipes reference tiger1/t90m/etc).
  setupBattle(game, 'm1a2', world);
  buildShellCards(game.player.spec);
  damagePanel.setTank(game.player.spec);
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
  aim.blockedDistM = null; // screenshot views never show the blocked warning
  aim.atGunLimit = false;
  aim.reload.t = forcedAim.reload.t;
  aim.reload.totalS = forcedAim.reload.totalS;
  aim.shellSlot = forcedAim.shellSlot;
  aim.shells = shellCards;
  aim.zoom = forcedAim.zoom || 1;
  game.player.visual.gunMuzzleWorld(_v1);
  aim.gunMarker.copy(rig.aimPoint);
  refreshSpotFrame(); // SPOTTING WIRING: camo indicator in forced HUD stills
  hud.update(frameInfo);
  hud.forceAimDisplay(forcedAim);
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
    orbitPose(game.tankById.get('m1a2'), 7, -38, 9, 45);
  },
  tank_closeup_ww2() {
    hud.setMode('hidden');
    // Sun-lit 3/4 front (tank_models r1): the old azimuth 35 put the running
    // gear and lower hull in their own shadow — the interleaved wheels, track
    // sag and camo bands were unreadable in the judged frame.
    orbitPose(game.tankById.get('tiger1'), 9, -35, 12, 50);
  },
  tank_closeup_t90m() {
    hud.setMode('hidden');
    // tank_models r3: every core roster tank gets a judged closeup — the
    // T-90M shipped unauditable as a carousel thumb.
    orbitPose(game.tankById.get('t90m'), 8, -38, 10, 45);
  },
  tank_closeup_leo2a7() {
    hud.setMode('hidden');
    orbitPose(game.tankById.get('leo2a7'), 8, -35, 10, 45);
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
    orbitPose(p, 13, 55, 14, 45);
    // Recoil in the composed moment: each syncFromState advances the
    // self-timed recoil one 1/60 step, so 3 syncs ~= ageS 0.05 of kick.
    p.visual.recoilKick();
    p.visual.syncFromState(p.state);
    p.visual.syncFromState(p.state);
    p.visual.syncFromState(p.state);
    p.visual.gunMuzzleWorld(_v1);
    p.visual.gunPivotWorld(_v2);
    _v3.copy(_v1).sub(_v2).normalize();
    fx.composeFiringMoment({
      muzzlePos: _v1.clone(),
      dir: _v3.clone(),
      caliberMm: 120,
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
    garageCameraPose();
  },
  techtree() {
    // research screen over the garage: Germany tab shows both eras
    // (WWII insignia + modern flag) and three unlocked roster tanks.
    hud.setMode('hidden');
    setPedestalTank('m1a2');
    garage.show('m1a2');
    if (garage.drainThumbs) garage.drainThumbs(); // portraits finished for the capture
    garageCameraPose();
    garage.showTechTree('germany');
  },
  battlefield_desert() { mapEstablishingShot(); },
  battlefield_winter() { mapEstablishingShot(); },
  battlefield_urban() { mapEstablishingShot(); },
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
    'detrack', 'combat_firing', 'explosion', 'garage', 'techtree',
    'battlefield_desert', 'battlefield_winter', 'battlefield_urban',
    'killcam_xray', // KILL-CAM
  ],
  set(name) {
    const recipe = SHOT_VIEWS[name];
    if (!recipe) throw new Error(`Unknown screenshot view: ${name}`);
    // PERF (performance_budget r1): shot recipes must never race the deferred
    // post-ready warm — run it now (idempotent, no-op once idle fired).
    warmCombatPipeline();
    shotMode = true;
    // killcam_shotinfo r2 (harness reliability): keep the GLB idle queue
    // quiet during shot capture — a parse job landing inside the ~1.2 s
    // battlefield settle window adds decode pressure exactly while the
    // biggest worlds build. EXCEPTION: the garage view NEEDS the queue live —
    // the pedestal hero GLB must settle or the stand-in stays hidden and the
    // turntable captures empty. Dynamic import keeps GLTFLoader off the
    // boot-critical bundle path (perf-budget rule).
    import('./vehicles/modelLoader.js')
      .then((m) => m.pauseIdleQueue && m.pauseIdleQueue(name !== 'garage'))
      .catch(() => { /* loader unavailable — nothing to pause */ });
    shotHudFrame = false; // r5: recipes with a HUD frame re-latch this
    game.phase = 'shot';
    setGarageSpots(true); // shot staging keeps the boot-time light set
    zeroInputs();
    killcam.cancel(); // KILL-CAM: clear any staged/active replay (restores materials)
    ensureShotWorld(VIEW_MAP[name] || 'verdant'); // MAP-CONFIG WIRING
    // camo_spotting r2: garage shot keeps the neutral pedestal key; every
    // battlefield shot gets the authored map sun.
    setGarageSunTrim(name === 'garage');
    garage.hide(); // also closes the tech tree; recipes re-show what they need
    endOverlay.style.display = 'none';
    fx.resetAll();
    fx.resetSeed(5000);
    fx.setFrozen(true, VIEW_TIME[name]);
    world.setWindTime(VIEW_TIME[name]);
    recipe();
    // Shot mode runs world.update with dt=0 (frozen), so the eased sniper
    // grass fade would never move — snap it to match the rig mode instead.
    // (r5: aim distance opens the scope-ray corridor to the staged target.)
    world.setSniperFade(rig.mode === 'SNIPER' ? 1 : 0, true, camera.fov, rig.aimDist);
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
buildShellCards(game.player.spec);
damagePanel.setTank(game.player.spec);
garage.show(selectedSpecId);
garageCameraPose();
setGarageSunTrim(true); // camo_spotting r2: boot lands on the garage screen
hud.setMode('hidden');

world.update(0, camera.position);
updateDustAndSync();
lighting.update(true); // boot: render every cascade before first present
post.render(SIM_DT);
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
function warmCombatPipeline() {
  if (combatPipelineWarmed) return;
  combatPipelineWarmed = true;
  const warm = game.tanks.find((e) => !e.isPlayer && e.visual);
  if (warm) {
    warm.visual.setDestroyed({});
    try { renderer.compile(warm.visual.root, camera, scene); } catch (_) { /* fine */ }
    warm.visual.resetDestroyed();
  }
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
  const spotsWereOn = game.phase !== 'battle';
  if (spotsWereOn) setGarageSpots(false);
  try { renderer.compile(scene, camera); } catch (_) { /* fine */ }
  if (spotsWereOn) setGarageSpots(true);
}
(window.requestIdleCallback || ((fn) => setTimeout(fn, 250)))(
  () => warmCombatPipeline(), { timeout: 2000 },
);

requestAnimationFrame(tick);

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
  const margin = Math.min(6, best.spec.armor.boundingRadiusM);
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
  const latched = leadLatchTargetId === best.id && game.timeS < leadLatchUntilS;
  if (latched && clearAt(leadLatchHFrac)) return out; // hold the settled height
  // CONTINUOUS optimum: raising the aim by dy raises the scaled clearance by
  // exactly dy and lowers the roof headroom by dy, so the height equalizing
  // the two margins maximizes the min margin in one closed-form step —
  // aim = center + (headroom - scaledClr)/2, clamped to the [0.5, 0.9]·h
  // band (never below hull center, never a knife-edge under the roof line).
  const hM = best.spec.dims.heightM;
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
    gunPitchDeg: Math.round(p.state.gunPitch * 573) / 10,
    turretYawDeg: Math.round(p.state.turretYaw * 573) / 10,
    blockedDistM: frameInfo.aim.blockedDistM,
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
    _v3.multiplyScalar(1 / d);
    const block = world.raycast(_v1, _v3, d);
    if (block && block.dist < d - ent.spec.armor.boundingRadiusM - 1) continue;
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
  p.visual.gunMuzzleWorld(_v1);
  p.visual.gunPivotWorld(_v2);
  _v3.copy(_v1).sub(_v2).normalize();
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
function debugSpawnKillShell() {
  const p = game.player;
  if (!p || !p.state || p.combat.destroyed) return false;
  const shooter = game.tankById.get('t90m') && game.tankById.get('t90m').team === 'enemy'
    && game.tankById.get('t90m').combat && !game.tankById.get('t90m').combat.destroyed
    ? game.tankById.get('t90m')
    : game.tanks.find((t) => t.team === 'enemy' && t.combat && !t.combat.destroyed);
  if (!shooter) return false;
  p.combat.hp = Math.min(p.combat.hp, 1);
  _v2.copy(p.state.pos);
  _v2.y += p.spec.dims.heightM * 0.45;
  // probe bearings (flat side shots first — guaranteed pen) for clear LOS
  const RELS = [90, -90, 70, -70, 110, -110, 45, 135];
  for (let i = 0; i < RELS.length; i++) {
    const az = p.state.yaw + RELS[i] * DEG;
    _v1.set(_v2.x + Math.sin(az) * 130, _v2.y + 7, _v2.z + Math.cos(az) * 130);
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
      caliberMm: shellSpec.caliberMm,
      muzzlePos: [_v1.x, _v1.y, _v1.z], dir: [_v3.x, _v3.y, _v3.z],
    });
    return true;
  }
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
      ent.visual.setDestroyed();
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

window.__DEBUG = {
  scene, camera, renderer, post, lighting, game, fx, rig, bus,
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
  // SPOTTING WIRING: live SpottingSystem for headless concealment checks
  get spotting() { return game.spotting; },
  killcam,                             // KILL-CAM introspection (phase, cancel)
  spawnKillShell: debugSpawnKillShell, // KILL-CAM: die on purpose
  // effects_combat r2: shot-mode latch exposed for headless drive tests
  get shotMode() { return shotMode; },
  set shotMode(v) { shotMode = !!v; },
  // controls_gunnery r3: stage the reticle hit-confirm marker on demand so
  // captures can verify its weight without landing a live 400 m shot.
  forceHitMark: (bounced) => hud.forceHitMark(!!bounced),
};
window.__GAME_READY = true;
