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
import { TANK_IDS, getSpec } from './vehicles/specs.js';
import { createTank } from './vehicles/tankFactory.js';
import { computeDispersionRadM, SIM_DT } from './sim/movement.js';
import { tankPoseFromState, queryAimArmor } from './sim/armor.js';
import { estimatePenRatio, selectShell } from './sim/damage.js';
import { createFx } from './fx/effects.js';
import { initHud } from './ui/hud.js';
import { createDamagePanel } from './ui/damagePanel.js';
import { createGarage } from './ui/garage.js';
import { createAudio } from './audio/audio.js';
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

const world = createMap(engineCtx, { seed: 1337 });

// --- game state + tanks -----------------------------------------------------
const bus = createBus();
const game = createGameState();
spawnTanks(game, engineCtx);
setupBattle(game, 'm1a2', world); // battle scene staged behind the garage screen
const collider = createCollider(game, world);

// --- fx ----------------------------------------------------------------------
const fx = createFx(engineCtx, world.heightField, { seed: 5000 });
scene.add(fx.group);
fx.bindBus(bus);

// --- garage stage (12 m disc pad + 2 integration-owned spotlights) -----------
GARAGE_POS.y = world.heightField.getHeightAt(GARAGE_POS.x, GARAGE_POS.z);
const padMat = new THREE.MeshStandardMaterial({ color: 0x3c4046, roughness: 0.85, metalness: 0.15 });
engineCtx.setupShadowMaterial(padMat);
const pad = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.6, 0.35, 48), padMat);
pad.position.set(GARAGE_POS.x, GARAGE_POS.y + 0.175, GARAGE_POS.z);
pad.receiveShadow = true;
scene.add(pad);
// The battle terrain meshes stop at the map border, so at the garage stage the
// backdrop would be the sky dome below the horizon (blinding white). A wide
// matte ground disc catches the fog gradient instead.
const apronMat = new THREE.MeshStandardMaterial({ color: 0x2e3330, roughness: 1.0, metalness: 0 });
engineCtx.setupShadowMaterial(apronMat);
const apron = new THREE.Mesh(new THREE.CircleGeometry(880, 40), apronMat); // stays outside the 1024 m map
apron.rotation.x = -Math.PI / 2;
apron.position.set(GARAGE_POS.x, GARAGE_POS.y - 0.02, GARAGE_POS.z);
apron.receiveShadow = true;
scene.add(apron);
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

// --- HUD / garage / panels ----------------------------------------------------
const hud = initHud(bus);
const damagePanel = createDamagePanel();
hud.setDamagePanel(damagePanel);
hud.buildMinimap(world.heightField, world.getMinimapFeatures());

const garage = createGarage({
  specs: TANK_IDS.map(getSpec),
  bus,
  onSelect: (specId) => { selectedSpecId = specId; setPedestalTank(specId); },
  onBattle: (specId) => startBattle(specId),
});

// --- audio --------------------------------------------------------------------
const audio = createAudio();
audio.bindBus(bus);

// --- camera rig -----------------------------------------------------------------
const rig = createCameraRig(camera, {
  heightField: world.heightField,
  raycast: world.raycast,
  getPlayer: () => game.player,
});

sky.applyFog(scene);
const post = createPost(renderer, scene, camera);

// ---------------------------------------------------------------------------
// End-of-battle overlay (integration-owned DOM)
// ---------------------------------------------------------------------------
const endOverlay = document.createElement('div');
endOverlay.style.cssText =
  'position:fixed;inset:0;display:none;z-index:70;align-items:center;justify-content:center;' +
  'flex-direction:column;gap:22px;background:rgba(4,7,10,0.55);' +
  "font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#eef4f9;";
const endTitle = document.createElement('div');
endTitle.style.cssText = 'font-size:52px;font-weight:800;letter-spacing:0.3em;text-shadow:0 2px 18px rgba(0,0,0,0.8);';
const endBtn = document.createElement('button');
endBtn.textContent = 'RETURN TO GARAGE';
endBtn.style.cssText =
  'font-size:16px;font-weight:700;letter-spacing:0.2em;padding:14px 44px;cursor:pointer;' +
  'color:#fff7ea;border:1px solid #ffc169;background:linear-gradient(180deg,#ffa02e,#d95f00);' +
  "font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";
endOverlay.append(endTitle, endBtn);
document.body.appendChild(endOverlay);
endBtn.addEventListener('click', () => { bus.emit('ui:click', {}); enterGarage(); });

function showEndOverlay(result) {
  endTitle.textContent = result === 'victory' ? 'VICTORY' : 'DEFEAT';
  endTitle.style.color = result === 'victory' ? '#7ee87e' : '#f05a5a';
  endOverlay.style.display = 'flex';
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
const keys = Object.create(null);
const debugFlags = { forceFire: false }; // headless-test hook (window.__DEBUG.flags)
let mouseDX = 0;
let mouseDY = 0;
let wheelStep = 0;
let fireHeld = false;
let rmbHeld = false;

window.addEventListener('keydown', (e) => { keys[e.code] = true; });
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === renderer.domElement) {
    mouseDX += e.movementX;
    mouseDY += e.movementY;
  }
});
window.addEventListener('wheel', (e) => {
  if (game.phase === 'battle') wheelStep = e.deltaY < 0 ? 1 : -1;
}, { passive: true });
renderer.domElement.addEventListener('mousedown', (e) => {
  audio.resume();
  if (game.phase !== 'battle') return;
  if (document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock();
    return;
  }
  if (e.button === 0) fireHeld = true;
  if (e.button === 2) rmbHeld = true;
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) fireHeld = false;
  if (e.button === 2) rmbHeld = false;
});
window.addEventListener('contextmenu', (e) => e.preventDefault());

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

function startBattle(specId) {
  selectedSpecId = specId;
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
        _v1.copy(ent.state.pos).addScaledVector(_fwd, -ent.spec.dims.hullLengthM * 0.4);
        fx.dust(_v1, _fwd, intensity);
      }
    }
  }
}

function tick(nowMs) {
  requestAnimationFrame(tick);
  if (lastMs < 0) lastMs = nowMs;
  const dtR = Math.min(0.1, Math.max(0, (nowMs - lastMs) / 1000));
  lastMs = nowMs;

  if (shotMode) {
    // Deterministic screenshot hold: no sim, no rig, frozen fx clock.
    world.update(0, camera.position);
    fx.update(dtR, game.shells, camera);
    lighting.update();
    post.render(dtR);
    return;
  }

  const inBattle = game.phase === 'battle';

  // 1. poll input
  if (inBattle && game.player && !game.player.combat.destroyed) {
    const inp = game.player.input;
    inp.throttle = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
    inp.steer = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    inp.brake = !!keys.Space;
    inp.fire = fireHeld || debugFlags.forceFire;
  } else if (game.player) {
    const inp = game.player.input;
    inp.throttle = 0; inp.steer = 0; inp.brake = false; inp.fire = false;
  }
  camInput.mouseDX = mouseDX;
  camInput.mouseDY = mouseDY;
  camInput.wheel = wheelStep;
  camInput.rmb = rmbHeld;
  camInput.shiftPressed = !!(keys.ShiftLeft || keys.ShiftRight);
  mouseDX = 0; mouseDY = 0; wheelStep = 0;

  // 2. fixed-step simulation
  if (inBattle) {
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
  if (inBattle) rig.update(dtR, camInput);

  // 4. world LOD/wind
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
  audio.update(dtR, { pos: camera.position, forward: _fwd }, game.tanks);

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
};

function zeroInputs() {
  for (const ent of game.tanks) {
    ent.input.throttle = 0;
    ent.input.steer = 0;
    ent.input.brake = false;
    ent.input.fire = false;
  }
  fireHeld = false;
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
      reload: { t: 0, totalS: 6 },
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
    const az = ent.state.yaw + 120 * DEG;
    _v1.set(
      _v2.x + Math.sin(az) * 25 * Math.cos(10 * DEG),
      _v2.y + Math.sin(10 * DEG) * 25 + 1.5,
      _v2.z + Math.cos(az) * 25 * Math.cos(10 * DEG),
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
};

window.__SHOTS = {
  views: [
    'battlefield', 'player_view', 'sniper_view', 'tank_closeup_modern',
    'tank_closeup_ww2', 'combat_firing', 'explosion', 'garage',
  ],
  set(name) {
    const recipe = SHOT_VIEWS[name];
    if (!recipe) throw new Error(`Unknown screenshot view: ${name}`);
    shotMode = true;
    game.phase = 'shot';
    zeroInputs();
    if (name !== 'garage') garage.hide();
    endOverlay.style.display = 'none';
    fx.resetAll();
    fx.resetSeed(5000);
    fx.setFrozen(true, VIEW_TIME[name]);
    world.setWindTime(VIEW_TIME[name]);
    recipe();
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    lighting.updateFrustums();
    lighting.update();
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
lighting.update();
post.render(SIM_DT);
post.render(SIM_DT);

requestAnimationFrame(tick);
// Debug handles for interactive inspection (not part of any contract).
window.__DEBUG = { scene, camera, renderer, post, lighting, world, game, fx, rig, bus, flags: debugFlags };
window.__GAME_READY = true;
