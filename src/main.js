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
import { TANK_IDS, getSpec } from './vehicles/specs.js';
import { createTank } from './vehicles/tankFactory.js';
import { computeDispersionRadM, SIM_DT } from './sim/movement.js';
import { tankPoseFromState, queryAimArmor, traceTank } from './sim/armor.js';
import { estimatePenRatio, selectShell } from './sim/damage.js';
import { createFx } from './fx/effects.js';
import { initHud } from './ui/hud.js';
import { createDamagePanel } from './ui/damagePanel.js';
import { createGarage } from './ui/garage.js';
import { createGarageStage } from './ui/garageStage.js';
import { createAudio } from './audio/audio.js';
import { createInput } from './game/input.js';
import { createSettings } from './ui/settings.js';
import {
  createBus, createGameState, spawnTanks, setupBattle, simStep, createCollider,
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

// --- garage stage (12 m disc pad + 2 integration-owned spotlights) -----------
GARAGE_POS.y = world.heightField.getHeightAt(GARAGE_POS.x, GARAGE_POS.z);
const garageStage = createGarageStage(engineCtx, GARAGE_POS);
scene.add(garageStage.group);
const spotA = new THREE.SpotLight(0xfff1d8, 160, 60, 0.5, 0.45, 1.6);
spotA.position.set(GARAGE_POS.x + 9, GARAGE_POS.y + 11, GARAGE_POS.z + 7);
const spotB = new THREE.SpotLight(0xcfe0ff, 80, 60, 0.6, 0.5, 1.6);
spotB.position.set(GARAGE_POS.x - 10, GARAGE_POS.y + 8, GARAGE_POS.z - 6);
const spotTarget = new THREE.Object3D();
spotTarget.position.set(GARAGE_POS.x, GARAGE_POS.y + 1.2, GARAGE_POS.z);
scene.add(spotTarget, spotA, spotB);
spotA.target = spotTarget;
spotB.target = spotTarget;

let pedestalVisual = null;
let selectedSpecId = 'm1a2';
function setPedestalTank(specId) {
  if (pedestalVisual) {
    if (pedestalVisual.specId === specId) return;
    pedestalVisual.dispose();
    pedestalVisual = null;
  }
  pedestalVisual = createTank(specId, engineCtx, { camoSeed: 4200, quality: 'high' });
  pedestalVisual.root.position.set(GARAGE_POS.x, GARAGE_POS.y + 0.35, GARAGE_POS.z);
  pedestalVisual.root.rotation.y = 145 * DEG;
  scene.add(pedestalVisual.root);
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
  hud.buildMinimap(world.heightField, world.getMinimapFeatures(), world.config.minimap);
  placeGarage();
  return world;
}

// --- HUD / garage / panels ----------------------------------------------------
const hud = initHud(bus);
const damagePanel = createDamagePanel();
hud.setDamagePanel(damagePanel);
hud.buildMinimap(world.heightField, world.getMinimapFeatures(), world.config.minimap);

const garage = createGarage({
  specs: TANK_IDS.map(getSpec),
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
function aimRaycastWithTanks(origin, dir, maxDist) {
  const wHit = world.raycast(origin, dir, maxDist);
  let bestD = wHit ? wHit.dist : maxDist;
  let best = wHit;
  for (const ent of game.tanks) {
    if (ent.isPlayer || !ent.state || !ent.combat || ent.combat.destroyed) continue;
    const r = ent.spec.armor.boundingRadiusM;
    _armTo.copy(ent.state.pos);
    _armTo.y += ent.spec.dims.heightM * 0.5;
    _armTo.sub(origin);
    const proj = _armTo.dot(dir);
    if (proj < 0 || proj - r > bestD) continue;
    if (_armTo.lengthSq() - proj * proj > r * r) continue;
    _armEnd.copy(origin).addScaledVector(dir, Math.min(bestD, proj + r));
    const hits = traceTank(origin, _armEnd, tankPoseFromState(ent.state), ent.spec.armor, ent.combat.eraSpent);
    if (!hits.length) continue;
    const d = origin.distanceTo(hits[0].point);
    if (d < bestD) {
      bestD = d;
      best = { point: hits[0].point, normal: hits[0].normal, dist: d, kind: 'tank' };
    }
  }
  return best;
}

const rig = createCameraRig(camera, {
  heightField: hfProxy,
  raycast: (o, d, m) => world.raycast(o, d, m),
  aimRaycast: aimRaycastWithTanks,
  getPlayer: () => game.player,
});

// Player combat feedback: non-spatial hit-confirm blip for own shells that
// connect (bright = damage, dull = bounce), camera flinch when taking a hit.
bus.on('shell:hit', (ev) => {
  if (!game.player) return;
  if (ev.attackerId === game.player.id && ev.targetId && ev.targetId !== game.player.id) {
    const pen = ev.kind === 'pen' || ev.kind === 'he_pen' || (ev.damage || 0) > 0;
    audio.hitConfirm(pen);
  }
  if (ev.targetId === game.player.id && (ev.damage || 0) > 0) rig.addTrauma(0.35);
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
const endBtn = document.createElement('button');
endBtn.textContent = 'RETURN TO GARAGE';
endBtn.style.cssText =
  'font-size:16px;font-weight:700;letter-spacing:0.2em;padding:14px 44px;cursor:pointer;' +
  'color:#fff7ea;border:1px solid #ffc169;background:linear-gradient(180deg,#ffa02e,#d95f00);' +
  "font-family:'Switzer','Segoe UI',Roboto,Helvetica,Arial,sans-serif;";
endOverlay.append(endTitle, endBtn);
document.body.appendChild(endOverlay);
endBtn.addEventListener('click', () => { bus.emit('ui:click', {}); enterGarage(); });

function showEndOverlay(result) {
  endTitle.textContent = result === 'victory' ? 'VICTORY' : 'DEFEAT';
  endTitle.style.color = result === 'victory' ? '#7ee87e' : '#f05a5a';
  endOverlay.style.display = 'flex';
}

// ---------------------------------------------------------------------------
// Input — routed through the rebindable action layer (src/game/input.js) and
// the settings panel (src/ui/settings.js). Wheel zoom stays a raw axis here.
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

window.addEventListener('wheel', (e) => {
  if (game.phase === 'battle' && !settings.isOpen()) wheelStep = e.deltaY < 0 ? 1 : -1;
}, { passive: true });
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

// Rebindable shell slots. The HUD keeps its own hardcoded Digit1-3 hotkeys, so
// skip those codes here to avoid double-firing on the default bindings.
for (let slot = 0; slot < 3; slot++) {
  input.onAction(`shell${slot + 1}`, (code) => {
    if (game.phase !== 'battle' || settings.isOpen()) return;
    if (code === `Digit${slot + 1}`) return; // HUD hotkey path already handled it
    bus.emit('ui:shellSelect', { slot });
    bus.emit('ui:click', {});
  });
}
input.onAction('minimapZoom', () => {
  if (game.phase === 'battle') bus.emit('ui:minimapZoom', {});
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
let shellCards = [];
function buildShellCards(spec) {
  shellCards = spec.gun.shells.map((sh) => ({
    name: sh.name, type: sh.type, dmg: sh.dmg, penLabel: `${Math.round(sh.pen100Mm)} mm`,
  }));
}

function startBattle(specId, mapId = null) {
  selectedSpecId = specId;
  // MAP-CONFIG WIRING: battle on the picked map ('random' rolls here)
  if (mapId) switchMap(resolveMapId(mapId));
  game.mapId = world.mapId;
  setupBattle(game, specId, world);
  buildShellCards(game.player.spec);
  damagePanel.setTank(game.player.spec);
  garage.hide();
  endOverlay.style.display = 'none';
  hud.setMode('battle');
  game.phase = 'battle';
  rig.release();
  rig.snapArcade(2, game.player.state.yaw, -10 * DEG);
  audio.resume();
  audio.ambientOn(true);
}

function enterGarage() {
  game.phase = 'garage';
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
    gunMarker: new THREE.Vector3(),
    atGunLimit: false,
    reload: { t: 0, totalS: 1 },
    shellSlot: 0,
    shells: [],
    zoom: 1,
  },
  killfeedHandledByBus: true,
};

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

  // penetration indicator: first enemy plate under the aim ray
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
    const r = ent.spec.armor.boundingRadiusM;
    if (_v1.lengthSq() - proj * proj > r * r) continue;
    const q = queryAimArmor(_rayO, _rayD, 800, tankPoseFromState(ent.state), ent.spec.armor);
    if (q && q.distM < bestDist) { bestDist = q.distM; bestInfo = q; }
  }
  if (bestInfo) aim.penRatio = estimatePenRatio(shellSpec, bestDist, bestInfo);
}

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------
const camInput = { mouseDX: 0, mouseDY: 0, wheel: 0, rmb: false, shiftPressed: false };
const _listenerPose = { pos: null, forward: _fwd }; // reused — no per-frame literal
let simAcc = 0;
let lastMs = -1;
let lastFov = camera.fov;
let endShown = false;
let shotMode = false;

function updateDustAndSync() {
  for (const ent of game.tanks) {
    if (!ent.state) continue;
    ent.visual.syncFromState(ent.state);
    if (game.phase === 'battle' && !ent.combat.destroyed) {
      const sp = Math.abs(ent.state.speed);
      if (sp > 0.8) {
        const intensity = Math.min(1, sp / (ent.spec.topSpeedKmh / 3.6));
        _fwd.set(Math.sin(ent.state.yaw), 0, Math.cos(ent.state.yaw));
        _v3.set(_fwd.z, 0, -_fwd.x); // right axis
        // Emit from BOTH rear track contact points; multiple puffs per frame
        // at speed so a top-speed run reads as a rolling plume (r1 critique).
        const puffs = intensity > 0.6 ? 3 : 1;
        for (let side = -1; side <= 1; side += 2) {
          _v1.copy(ent.state.pos)
            .addScaledVector(_fwd, -ent.spec.dims.hullLengthM * 0.45)
            .addScaledVector(_v3, side * ent.spec.dims.widthM * 0.45);
          for (let i = 0; i < puffs; i++) fx.dust(_v1, _fwd, intensity);
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
    const fogScale = camera.fov < 15 ? Math.max(0.35, camera.fov / 15) : 1;
    scene.fog.density = baseFogDensity * fogScale;
  }

  if (shotMode) {
    // Deterministic screenshot hold: no sim, no rig, frozen fx clock.
    world.update(0, camera.position);
    fx.update(dtR, game.shells, camera);
    lighting.update(true); // force ALL shadow cascades — deterministic capture
    post.render(dtR);
    return;
  }

  const inBattle = game.phase === 'battle';
  const paused = settings.isOpen(); // settings panel freezes the battle

  // 1. poll input (action layer: rebindable, Set-based state — no ghosting)
  if (inBattle && !paused && game.player && !game.player.combat.destroyed) {
    const st = input.getState();
    const inp = game.player.input;
    inp.throttle = (st.forward ? 1 : 0) - (st.back ? 1 : 0);
    inp.steer = (st.right ? 1 : 0) - (st.left ? 1 : 0);
    inp.brake = st.handbrake;
    inp.fire = (st.fire && input.isLocked()) || debugFlags.forceFire;
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
  if (inBattle && !paused) {
    simAcc = Math.min(simAcc + dtR, SIM_DT * MAX_SIM_STEPS);
    while (simAcc >= SIM_DT) {
      simStep(game, bus, world, rig, collider);
      simAcc -= SIM_DT;
    }
    if (game.result && !endShown) {
      endShown = true;
      showEndOverlay(game.result);
      if (document.exitPointerLock) document.exitPointerLock();
    } else if (!game.result) {
      endShown = false;
    }
  }

  // 3. camera rig
  if (inBattle && !paused) rig.update(dtR, camInput);

  // 4. world LOD/wind (+ WoT-style near-grass suppression while scoped)
  world.setSniperFade(rig.mode === 'SNIPER' ? 1 : 0);
  world.update(dtR, camera.position);

  // 5. visuals + dust
  updateDustAndSync();

  // 6. fx
  fx.update(dtR, game.shells, camera);

  // 7. HUD
  if (inBattle && game.player) {
    frameInfo.timeS = game.timeS;
    frameInfo.mode = rig.mode === 'SNIPER' ? 'sniper' : 'battle';
    frameInfo.player = game.player;
    frameInfo.shells = game.shells;
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
  combat_firing: 0.5,
  explosion: 1.5,
  garage: 0.7,
  techtree: 0.7,
  battlefield_desert: 2.0,
  battlefield_winter: 2.0,
  battlefield_urban: 2.0,
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
  if (world.mapId === mapId) return;
  switchMap(mapId);
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
  // aim display per contract (persists because shot mode skips hud.update).
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
  aim.atGunLimit = false;
  aim.reload.t = forcedAim.reload.t;
  aim.reload.totalS = forcedAim.reload.totalS;
  aim.shellSlot = forcedAim.shellSlot;
  aim.shells = shellCards;
  aim.zoom = forcedAim.zoom || 1;
  game.player.visual.gunMuzzleWorld(_v1);
  aim.gunMarker.copy(rig.aimPoint);
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
    // aim at the nearest enemy bearing
    const p = game.player;
    let best = null;
    let bestD = Infinity;
    for (const ent of game.tanks) {
      if (ent.isPlayer || ent.combat.destroyed) continue;
      const d = ent.state.pos.distanceTo(p.state.pos);
      if (d < bestD) { bestD = d; best = ent; }
    }
    const dx = best.state.pos.x - p.state.pos.x;
    const dz = best.state.pos.z - p.state.pos.z;
    const yaw = Math.atan2(dx, dz);
    const dy = (best.state.pos.y + 1.5) - (p.state.pos.y + 2.2);
    const pitch = Math.atan2(dy, Math.hypot(dx, dz));
    rig.snapSniper(8, yaw, pitch);
    forcedHudFrame('sniper', {
      distM: Math.round(bestD),
      penRatio: 0.95,
      reload: { t: 0, totalS: 6 },
      shellSlot: 0,
      zoom: 8,
      dispersionRadM: computeDispersionRadM(p.spec, p.state, bestD),
      shells: shellCards,
    });
  },
  tank_closeup_modern() {
    hud.setMode('hidden');
    orbitPose(game.tankById.get('m1a2'), 9, 35, 12, 50);
  },
  tank_closeup_ww2() {
    hud.setMode('hidden');
    orbitPose(game.tankById.get('tiger1'), 9, 35, 12, 50);
  },
  combat_firing() {
    hud.setMode('hidden');
    const p = game.player;
    orbitPose(p, 14, 55, 8, 45);
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
    // enemy[2] = third enemy spawn (t34_85 in default roster order)
    const victims = game.tanks.filter((t) => !t.isPlayer);
    const ent = victims[2];
    _v2.copy(ent.state.pos);
    _v2.y += 1.4;
    // Camera high (sun behind it), looking DOWN ~20 deg so the fogged
    // near-white horizon stays out of frame and the fireball/smoke column
    // reads against terrain (r1 critique: frame was mostly white haze).
    const az = ent.state.yaw + 150 * DEG;
    _v1.set(
      _v2.x + Math.sin(az) * 22 * Math.cos(24 * DEG),
      _v2.y + Math.sin(24 * DEG) * 22 + 1.5,
      _v2.z + Math.cos(az) * 22 * Math.cos(24 * DEG),
    );
    rig.setExternalPose(_v1, _v2, 45);
    fx.composeExplosionMoment({ pos: _v2.clone(), ageS: 0.6 });
    ent.visual.setDestroyed();
  },
  garage() {
    hud.setMode('hidden');
    setPedestalTank('m1a2');
    garage.show('m1a2');
    garageCameraPose();
  },
  techtree() {
    // research screen over the garage: Germany tab shows both eras
    // (WWII insignia + modern flag) and three unlocked roster tanks.
    hud.setMode('hidden');
    setPedestalTank('m1a2');
    garage.show('m1a2');
    garageCameraPose();
    garage.showTechTree('germany');
  },
  battlefield_desert() { mapEstablishingShot(); },
  battlefield_winter() { mapEstablishingShot(); },
  battlefield_urban() { mapEstablishingShot(); },
};

window.__SHOTS = {
  views: [
    'battlefield', 'player_view', 'sniper_view', 'tank_closeup_modern',
    'tank_closeup_ww2', 'combat_firing', 'explosion', 'garage', 'techtree',
    'battlefield_desert', 'battlefield_winter', 'battlefield_urban',
  ],
  set(name) {
    const recipe = SHOT_VIEWS[name];
    if (!recipe) throw new Error(`Unknown screenshot view: ${name}`);
    shotMode = true;
    game.phase = 'shot';
    zeroInputs();
    ensureShotWorld(VIEW_MAP[name] || 'verdant'); // MAP-CONFIG WIRING
    garage.hide(); // also closes the tech tree; recipes re-show what they need
    endOverlay.style.display = 'none';
    fx.resetAll();
    fx.resetSeed(5000);
    fx.setFrozen(true, VIEW_TIME[name]);
    world.setWindTime(VIEW_TIME[name]);
    recipe();
    // Shot mode runs world.update with dt=0 (frozen), so the eased sniper
    // grass fade would never move — snap it to match the rig mode instead.
    world.setSniperFade(rig.mode === 'SNIPER' ? 1 : 0, true);
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
hud.setMode('hidden');

world.update(0, camera.position);
updateDustAndSync();
lighting.update(true); // boot: render every cascade before first present
post.render(SIM_DT);
post.render(SIM_DT);

requestAnimationFrame(tick);

// ---------------------------------------------------------------------------
// Debug / drive-test hooks (not part of the screenshot contract).
// ---------------------------------------------------------------------------

/**
 * Deterministically point the player's aim at the nearest live enemy: snaps
 * the rig into sniper mode with the view ray through the enemy's hull center
 * so the server-aim raycast lands on the tank. The turret then slews to the
 * aim point over the next sim steps.
 * @returns {?{id:string, distM:number}} target picked, or null
 */
function debugAimAtNearest() {
  const p = game.player;
  if (!p || !p.state || p.combat.destroyed) return null;
  p.visual.gunPivotWorld(_v1);
  let best = null;
  let bestD = Infinity;
  for (const ent of game.tanks) {
    if (ent.isPlayer || !ent.state || !ent.combat || ent.combat.destroyed) continue;
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
    }
    simStep(game, bus, world, rig, collider);
    for (const ent of game.tanks) {
      if (ent.state) ent.visual.syncFromState(ent.state);
    }
  }
  return game.timeS;
}

/** Destroy every remaining enemy through the normal announce path (test aid). */
function debugSlayEnemies() {
  for (const ent of game.tanks) {
    if (ent.isPlayer || !ent.combat || ent.combat.destroyed) continue;
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
  fastForward: debugFastForward,
  slayEnemies: debugSlayEnemies,
  startBattle,
};
window.__GAME_READY = true;
