/**
 * studio.js — SCENE STUDIO: an in-game staging rig for composing shots.
 *
 * A first-class game feature (garage F8 / ?studio=1) AND the production rig
 * for scripted marketing screenshots (window.__STUDIO, docs/STUDIO.md).
 *
 * What it is: the chosen battle map, fully live (terrain, vegetation, props,
 * sky, lighting) with NO battle sim — no AI, no spotting, no HUD combat
 * chrome. On top of it: freely placeable tank actors (any TANK_SPECS id) with
 * full pose control (hull facing, turret yaw, gun pitch within spec limits,
 * camo scheme, damage state), the game's REAL effects language (muzzle
 * flashes, tracers, impacts, destructions, dust, engine smoke — all through
 * src/fx/effects.js), a free-fly/orbit camera, a studio-owned fx time scale
 * with freeze, and a hi-res capture path.
 *
 * Integration contract (kept deliberately tiny — see main.js):
 *   - main.js creates it once post-boot: createStudio(ctx)
 *   - main.js tick() delegates the WHOLE frame while active:
 *       if (studio.active) { studio.tick(dtR); return; }
 *   - everything else (entry key, URL param, panel, capture, __STUDIO API)
 *     lives here. Exit hands control back through ctx.enterGarage().
 *
 * Determinism (the scripted-shoot contract): __STUDIO.load(sceneJson) resets
 * the fx system (resetAll + resetSeed), builds actors with the movement
 * module's REAL support solve, fires the listed effects at their tMs on a
 * fixed 1/60 s stepped timeline, advances exactly to fxTime and freezes
 * (timeScale 0). Every emission runs off the fx module's own seeded rng and
 * the shared particle clock, so identical scene JSON produces identical
 * frames.
 */
import * as THREE from 'three';
import { ALL_TANK_IDS, getSpec } from '../vehicles/specs.js';
import { createTank } from '../vehicles/tankFactory.js';
import { createTankState, updateTank, SIM_DT } from '../sim/movement.js';
import { createShell, stepShell } from '../sim/ballistics.js';
import { createBus } from './state.js';
import {
  CAMO_PATTERN_IDS, setCamoOverride, clearCamoOverrides, applyCamoPatterns,
  setCamoBiome,
} from '../vehicles/materials.js';
import { MAP_IDS, getMapConfig, resolveMapId } from '../world/maps/index.js';
import { createStudioPanel } from '../ui/studioPanel.js';

const DEG = Math.PI / 180;
const FX_STEP_S = 1 / 60;      // fixed timeline step (load() and live advance)
const SETTLE_STEPS = 48;       // updateTank steps to conform a placed actor
const SETTLE_STEPS_DRAG = 6;   // cheap conform while dragging
const CAPTURE_MIN_W = 2560;    // capture floor (marketing contract)
const CAPTURE_MAX_W = 6144;    // sanity cap (also clamped by GPU max texture)

/** Actor damage-state ids (panel + scene JSON `state`). */
export const ACTOR_STATES = [
  'intact', 'engine-smoking', 'burning', 'wrecked', 'wrecked-burnt', 'turret-popped',
];

/** One-shot effect type ids (scene JSON `effects[].type`). */
export const EFFECT_TYPES = [
  'fire', 'muzzle_flash', 'tracer', 'impact', 'sparks', 'explosion',
  'tank_kill', 'dust', 'engine_smoke', 'burning', 'detrack',
  'firing_moment', 'explosion_moment',
  // studio r2 additions (panel refresh) — all composed from the same fx
  // language the battle uses, so they stay deterministic under load():
  'mg_burst',   // coax-MG tracer stream from the actor's muzzle
  'barrage',    // artillery stonk — ring of ground bursts around the anchor
  'armor_scar', // permanent battle scarring stamped on the actor's plates
  'exhaust',    // diesel belch off the engine deck
];

// scratch
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _size = new THREE.Vector2();
const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();

/**
 * Create the studio. Pure setup — nothing heavy happens until enter().
 *
 * @param {object} ctx integration handles from main.js:
 *   renderer, scene, camera, post, lighting, fx, game, hud, garage, showroom,
 *   hfProxy, getWorld(), ensureWorld(mapId,onProgress), setWorldDormant(on),
 *   setGarageSpots(on), setGarageSunTrim(on), enterGarage(),
 *   warmCombatPipeline(), transition (branded loading screen, optional)
 * @returns {{active: boolean, tick(dt: number): void, enter(opts?: object):
 *   Promise<void>, exit(): void, api: object}}
 */
export function createStudio(ctx) {
  const {
    renderer, scene, camera, post, lighting, fx, game, hud, garage, showroom,
    hfProxy, getWorld, ensureWorld, setWorldDormant, setGarageSpots,
    setGarageSunTrim, enterGarage, warmCombatPipeline,
  } = ctx;
  // Optional so a ctx without it (tests, stripped builds) still gets a
  // working studio — the run() fallback just executes the work directly.
  const transition = ctx.transition ||
    { run: (work) => Promise.resolve(work(() => {})), progress: () => {} };

  // --- studio state ----------------------------------------------------------
  let active = false;
  let entering = null;         // in-flight enter() promise (shared latch)
  let loading = false;         // load() in flight (blocks re-entrant loads)
  let timeScale = 1;           // fx time multiplier; 0 = frozen
  let clockMs = 0;             // studio fx timeline (ms since last fx reset)
  let uidSeq = 1;
  const actors = [];           // see addActor()
  const shells = [];           // live studio projectiles (fx tracer source)
  const effectLog = [];        // fired one-shots (scene JSON round-trip)
  let lastFov = 0;
  let sceneMeta = { seed: 5000 };

  // fx event channel: a PRIVATE bus bound to the fx system only, so synthetic
  // events (muzzle flash, impact, smoke column, detrack burst) reuse the real
  // effect language without touching main.js/hud/audio/killcam listeners.
  const fxBus = createBus();
  let fxBusBound = false;
  function ensureFxBus() {
    if (fxBusBound) return;
    fxBusBound = true;
    fx.bindBus(fxBus);
  }

  // --- camera ---------------------------------------------------------------
  const cam = {
    mode: 'fly',               // 'fly' | 'orbit'
    yaw: 0, pitch: -12 * DEG, roll: 0,
    fov: 50,
    speed: 14,                 // m/s base fly speed
    orbit: { target: new THREE.Vector3(), dist: 24 },
  };
  const keys = new Set();
  let dragging = false;        // look-drag latch
  let dragMoved = 0;
  let dragActor = null;        // actor being position-dragged
  let placeArmed = null;       // specId to place on next terrain click
  const marker = buildMarker();// last terrain click (effect anchor)
  scene.add(marker.group);

  function buildMarker() {
    const group = new THREE.Group();
    group.name = 'studio_marker';
    group.visible = false;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.72, 0.95, 40),
      new THREE.MeshBasicMaterial({
        color: 0xe69a2d, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    const dot = new THREE.Mesh(
      new THREE.CircleGeometry(0.14, 20),
      new THREE.MeshBasicMaterial({
        color: 0xffd27a, transparent: true, opacity: 0.9, depthWrite: false,
      }),
    );
    dot.rotation.x = -Math.PI / 2;
    dot.position.y = 0.01;
    group.add(ring, dot);
    return {
      group,
      pos: new THREE.Vector3(),
      set(p) { this.pos.copy(p); group.position.copy(p); group.position.y += 0.06; group.visible = true; },
    };
  }

  function applyCameraPose() {
    camera.rotation.order = 'YXZ';
    camera.rotation.set(cam.pitch, cam.yaw, cam.roll);
    if (camera.fov !== cam.fov) {
      camera.fov = cam.fov;
      camera.updateProjectionMatrix();
    }
  }

  function lookAt(target) {
    _v1.copy(target).sub(camera.position);
    const flat = Math.hypot(_v1.x, _v1.z);
    cam.yaw = Math.atan2(-_v1.x, -_v1.z);
    cam.pitch = Math.atan2(_v1.y, flat);
    applyCameraPose();
  }

  function orbitApply() {
    const o = cam.orbit;
    const cp = Math.cos(cam.pitch);
    camera.position.set(
      o.target.x + Math.sin(cam.yaw) * cp * o.dist,
      o.target.y - Math.sin(cam.pitch) * o.dist,
      o.target.z + Math.cos(cam.yaw) * cp * o.dist,
    );
    lookAt(o.target);
  }

  function updateCamera(dt) {
    const boost = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 4 : 1;
    const v = cam.speed * boost * dt;
    if (cam.mode === 'fly') {
      camera.getWorldDirection(_fwd);
      _v1.set(0, 0, 0);
      if (keys.has('KeyW')) _v1.addScaledVector(_fwd, v);
      if (keys.has('KeyS')) _v1.addScaledVector(_fwd, -v);
      _v2.set(_fwd.z, 0, -_fwd.x).normalize(); // right axis (horizontal)
      if (keys.has('KeyD')) _v1.addScaledVector(_v2, -v);
      if (keys.has('KeyA')) _v1.addScaledVector(_v2, v);
      if (keys.has('KeyE')) _v1.y += v;
      if (keys.has('KeyQ')) _v1.y -= v;
      camera.position.add(_v1);
      applyCameraPose();
    } else {
      orbitApply();
    }
  }

  // --- pool / world housekeeping ---------------------------------------------
  /** Hide every battle-pool tank visual (idle pump may stream new ones in). */
  function sweepPool() {
    for (const ent of game.allTanks) {
      if (ent.visual && ent.visual.root.visible) ent.visual.setVisible(false);
    }
  }
  /** Restore staged-battle visuals on exit (battle re-entry force-shows too). */
  function unsweepPool() {
    for (const ent of game.tanks) {
      if (ent.visual && ent.state) ent.visual.setVisible(true);
    }
  }

  // --- actors -----------------------------------------------------------------
  function clampGunDeg(spec, deg) {
    return Math.max(-(spec.gunDepressionDeg ?? 10),
      Math.min(spec.gunElevationDeg ?? 20, deg || 0));
  }

  /**
   * Conform an actor to the terrain with the REAL movement support solve:
   * zero-input handbrake steps of updateTank settle the 4-corner attitude
   * spring + wheel fan, then the authored pose values are pinned exactly.
   * @param {object} a actor
   * @param {number} [steps]
   */
  function settleActor(a, steps = SETTLE_STEPS) {
    const p = a.pose;
    const st = a.state;
    st.pos.x = p.x;
    st.pos.z = p.z;
    st.pos.y = hfProxy.getHeightAt(p.x, p.z);
    st.yaw = p.facingDeg * DEG;
    st.speed = 0;
    st.yawRate = 0;
    a.input.throttle = 0;
    a.input.steer = 0;
    a.input.brake = true;
    a.input.fire = false;
    // aim the chase target where the pose wants the gun so settle never
    // fights the authored turret/gun values it is about to be pinned to
    const az = st.yaw + p.turretDeg * DEG;
    const el = clampGunDeg(a.spec, p.gunDeg) * DEG;
    a.input.aimPoint.set(
      st.pos.x + Math.sin(az) * Math.cos(el) * 400,
      st.pos.y + 2 + Math.sin(el) * 400,
      st.pos.z + Math.cos(az) * Math.cos(el) * 400,
    );
    a.rigidGear = false;
    for (let i = 0; i < steps; i++) updateTank(a, hfProxy, SIM_DT);
    // pin the authored pose exactly (updateTank slews at spec rates; slope
    // slide may creep pos) — staging is authoritative, sim only shapes
    // pitch/roll/wheel conform
    st.pos.x = p.x;
    st.pos.z = p.z;
    st.yaw = p.facingDeg * DEG;
    st.speed = 0;
    st.yawRate = 0;
    st.turretYaw = p.turretDeg * DEG;
    st.gunPitch = clampGunDeg(a.spec, p.gunDeg) * DEG;
    a.visual.syncFromState(st, 0);
  }

  /** Resolve an actor by uid / name / roster index / actor object. */
  function findActor(ref) {
    if (ref == null) return null;
    if (typeof ref === 'object' && ref.uid) return actors.includes(ref) ? ref : null;
    if (typeof ref === 'number') return actors[ref] || null;
    return actors.find((a) => a.uid === ref || a.name === ref) || null;
  }

  /**
   * Add a tank actor to the stage.
   * @param {object} cfg { id, pos:[x,z]|[x,y,z], facingDeg, turretDeg, gunDeg,
   *   camo, camoSeed, state, stateAgeS, recoilAgeS, name }
   * @returns {object} actor record
   */
  function addActor(cfg = {}) {
    const specId = cfg.id || cfg.specId || 'm1a2';
    const spec = getSpec(specId); // throws on unknown id (deliberate)
    const engineCtx = game._engineCtx;
    const camoSeed = cfg.camoSeed != null ? cfg.camoSeed | 0 : 4200 + uidSeq * 17;
    const visual = createTank(specId, engineCtx, { camoSeed, quality: 'high' });
    scene.add(visual.root);
    // KILL-HITCH FIX: studio actors are not game.tanks, so they miss
    // warmCombatPipeline's burn prewarm — install the disarmed burn hook now
    // so setActorState('wrecked'/'turret-popped') never pays first-use
    // program compiles mid-beat. (GLB swaps re-hook in the swap pipeline.)
    if (visual.prewarmBurn) visual.prewarmBurn();
    if (visual.setGroundSampler) {
      visual.setGroundSampler((x, z) => hfProxy.getHeightAt(x, z));
    }
    const pos = cfg.pos || [0, 0];
    const x = pos[0] || 0;
    const z = (pos.length >= 3 ? pos[2] : pos[1]) || 0;
    const a = {
      uid: `a${uidSeq++}`,
      name: cfg.name || null,
      specId,
      spec,
      visual,
      state: createTankState(spec, _v1.set(x, hfProxy.getHeightAt(x, z), z), (cfg.facingDeg || 0) * DEG),
      input: {
        throttle: 0, steer: 0, brake: true, fire: false,
        aimPoint: new THREE.Vector3(), shellSlot: 0,
      },
      combat: null,
      rigidGear: false,
      contactGeom: null,
      pose: {
        x, z,
        facingDeg: cfg.facingDeg || 0,
        turretDeg: cfg.turretDeg || 0,
        gunDeg: cfg.gunDeg || 0,
      },
      camo: cfg.camo || null,
      camoSeed,
      stateName: 'intact',
      stateAgeS: cfg.stateAgeS != null ? cfg.stateAgeS : null,
      recoilAgeS: cfg.recoilAgeS != null ? cfg.recoilAgeS : null,
      // continuous-emitter flags — the enum states set them, but the
      // engine_smoke/burning EFFECTS may also layer them onto wreck states
      smoking: false,
      burning: false,
    };
    actors.push(a);
    if (a.camo && a.camo !== 'inherit') {
      setCamoOverride(specId, a.camo);
      applyCamoPatterns(specId);
    }
    settleActor(a);
    if (cfg.state && cfg.state !== 'intact') setActorState(a, cfg.state, a.stateAgeS);
    if (cfg.smoking) a.smoking = true;   // additive layer over any mesh state
    if (cfg.burning && !a.burning) igniteColumn(a);
    if (a.recoilAgeS != null && visual.recoilKick) {
      visual.recoilKick(a.recoilAgeS);
      visual.syncFromState(a.state, 0);
    }
    panel.refreshActors();
    return a;
  }

  function removeActor(ref) {
    const a = findActor(ref);
    if (!a) return false;
    fxBus.emit('tank:fire', { id: a.uid, burning: false }); // drop its column
    scene.remove(a.visual.root);
    a.visual.dispose();
    actors.splice(actors.indexOf(a), 1);
    if (selected === a) selected = null;
    panel.refreshActors();
    return true;
  }

  function clearActors() {
    while (actors.length) removeActor(actors[actors.length - 1]);
  }

  /**
   * Apply a damage/state look. States are the killcam/destruction systems'
   * real visual language (tankFactory setDestroyed burn sweep + turret pop,
   * effects.js smoke columns).
   * @param {object|string} ref actor
   * @param {string} stateName ACTOR_STATES id
   * @param {?number} [ageS] wreck age override (char/settle progress)
   */
  function setActorState(ref, stateName, ageS = null) {
    const a = findActor(ref);
    if (!a || !ACTOR_STATES.includes(stateName)) return false;
    ensureFxBus();
    // reset previous look + emitter flags
    if (a.visual.isDestroyed && a.visual.isDestroyed()) a.visual.resetDestroyed();
    fxBus.emit('tank:fire', { id: a.uid, burning: false });
    a.smoking = false;
    a.burning = false;
    a.stateName = stateName;
    a.stateAgeS = ageS;
    const st = a.state;
    const wreckAge = ageS != null ? ageS : 60; // settled char by default
    if (stateName === 'engine-smoking') {
      a.smoking = true;
    } else if (stateName === 'burning') {
      igniteColumn(a);
    } else if (stateName === 'wrecked' || stateName === 'wrecked-burnt') {
      a.visual.setDestroyed({ ageS: stateName === 'wrecked' ? Math.min(wreckAge, 8) : Math.max(wreckAge, 120) });
    } else if (stateName === 'turret-popped') {
      a.visual.setDestroyed({ pop: true, ageS: wreckAge });
    }
    // 'intact'/'engine-smoking' need no mesh swap; smoking is a live
    // per-step emitter (see stepFx)
    a.visual.syncFromState(st, 0);
    panel.refreshActors();
    return true;
  }

  /** Light the keyed fire/smoke column the live game uses for burning tanks. */
  function igniteColumn(a) {
    ensureFxBus();
    a.burning = true;
    const st = a.state;
    // seed the fx position registry (lastKnownPos) with a tiny non-pen
    // spark, then light the keyed smoke column
    fxBus.emit('shell:hit', {
      targetId: a.uid, kind: 'nonpen', caliberMm: 20, damage: 0,
      pos: [st.pos.x, st.pos.y + a.spec.dims.heightM * 0.6, st.pos.z],
      normal: [0, 1, 0],
    });
    fxBus.emit('tank:fire', { id: a.uid, burning: true });
  }

  function updateActor(ref, patch = {}) {
    const a = findActor(ref);
    if (!a) return null;
    const p = a.pose;
    if (patch.pos) {
      p.x = patch.pos[0];
      p.z = patch.pos.length >= 3 ? patch.pos[2] : patch.pos[1];
    }
    if (patch.x != null) p.x = patch.x;
    if (patch.z != null) p.z = patch.z;
    if (patch.facingDeg != null) p.facingDeg = patch.facingDeg;
    if (patch.turretDeg != null) p.turretDeg = patch.turretDeg;
    if (patch.gunDeg != null) p.gunDeg = clampGunDeg(a.spec, patch.gunDeg);
    if (patch.name !== undefined) a.name = patch.name || null;
    if (patch.camo !== undefined) {
      a.camo = patch.camo || null;
      if (a.camo) {
        setCamoOverride(a.specId, a.camo);
        applyCamoPatterns(a.specId);
      }
    }
    settleActor(a, patch._drag ? SETTLE_STEPS_DRAG : SETTLE_STEPS);
    if (patch.state) setActorState(a, patch.state, patch.stateAgeS ?? a.stateAgeS);
    if (patch.recoilAgeS !== undefined) {
      a.recoilAgeS = patch.recoilAgeS;
      if (a.recoilAgeS != null && a.visual.recoilKick) {
        a.visual.recoilKick(a.recoilAgeS);
        a.visual.syncFromState(a.state, 0);
      }
    }
    return a;
  }

  // --- selection / mouse ------------------------------------------------------
  let selected = null;
  function selectActor(ref) {
    selected = findActor(ref);
    panel.setSelected(selected);
    return selected;
  }

  function pointerNdc(e) {
    const r = renderer.domElement.getBoundingClientRect();
    _ndc.set(
      ((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1,
      -((e.clientY - r.top) / Math.max(1, r.height)) * 2 + 1,
    );
    return _ndc;
  }

  function terrainHit(e, out) {
    const w = getWorld();
    if (!w) return null;
    _ray.setFromCamera(pointerNdc(e), camera);
    const hit = w.raycast(_ray.ray.origin, _ray.ray.direction, 3000);
    if (!hit) return null;
    out.copy(hit.point);
    return out;
  }

  function pickActor(e) {
    if (!actors.length) return null;
    _ray.setFromCamera(pointerNdc(e), camera);
    _ray.far = 3000;
    const roots = actors.map((a) => a.visual.root);
    const hits = _ray.intersectObjects(roots, true);
    if (!hits.length) return null;
    let o = hits[0].object;
    while (o) {
      const a = actors.find((x) => x.visual.root === o);
      if (a) return a;
      o = o.parent;
    }
    return null;
  }

  function onPointerDown(e) {
    if (!active || e.target !== renderer.domElement) return;
    if (e.button === 0) {
      const hitActor = pickActor(e);
      if (hitActor && !placeArmed) {
        dragActor = hitActor;
        selectActor(hitActor);
        e.preventDefault();
        return;
      }
    }
    dragging = true;
    dragMoved = 0;
    try { renderer.domElement.setPointerCapture(e.pointerId); } catch (_) { /* embedded panes */ }
  }

  function onPointerMove(e) {
    if (!active) return;
    if (dragActor) {
      if (terrainHit(e, _v3)) {
        updateActor(dragActor, { x: _v3.x, z: _v3.z, _drag: true });
        panel.refreshSelected();
      }
      return;
    }
    if (!dragging) return;
    const dx = e.movementX || 0;
    const dy = e.movementY || 0;
    dragMoved += Math.abs(dx) + Math.abs(dy);
    cam.yaw -= dx * 0.0032;
    cam.pitch = Math.max(-1.45, Math.min(1.45, cam.pitch - dy * 0.0032));
    if (cam.mode === 'orbit') orbitApply();
    else applyCameraPose();
  }

  function onPointerUp(e) {
    if (!active) return;
    if (dragActor) {
      updateActor(dragActor, {}); // full-precision settle on release
      dragActor = null;
      panel.refreshSelected();
      return;
    }
    if (!dragging) return;
    dragging = false;
    if (dragMoved < 5 && e.button === 0) {
      // a genuine CLICK: place armed actor, or move the effect marker
      if (terrainHit(e, _v3)) {
        marker.set(_v3);
        if (placeArmed) {
          const a = addActor({ id: placeArmed, pos: [_v3.x, _v3.z] });
          selectActor(a);
          placeArmed = null;
          panel.setPlaceArmed(null);
        } else if (!pickActor(e)) {
          selectActor(null);
        }
      }
    }
  }

  function onWheel(e) {
    if (!active || e.target !== renderer.domElement) return;
    e.preventDefault();
    const k = e.deltaY < 0 ? 1 : -1;
    if (cam.mode === 'orbit') {
      cam.orbit.dist = Math.max(3, Math.min(400, cam.orbit.dist * (1 - k * 0.12)));
      orbitApply();
    } else {
      camera.getWorldDirection(_fwd);
      camera.position.addScaledVector(_fwd, k * Math.max(2, cam.speed * 0.35));
    }
  }

  function typingInUI(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' ||
      t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  function onKeyDown(e) {
    if (e.code === 'F8' && !e.repeat) {
      if (active) { exit(); e.preventDefault(); return; }
      if (game.phase === 'garage') {
        enter().catch((err) => console.error('[studio] enter failed', err));
        e.preventDefault();
      }
      return;
    }
    if (!active || typingInUI(e)) return;
    if (e.code === 'Escape') { exit(); return; }
    keys.add(e.code);
    if (e.code === 'Space' && !e.repeat) api.setTimeScale(timeScale === 0 ? 1 : 0);
    if (e.code === 'Delete' || e.code === 'Backspace') {
      if (selected) removeActor(selected);
    }
  }
  function onKeyUp(e) { keys.delete(e.code); }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('pointermove', onPointerMove, true);
  window.addEventListener('pointerup', onPointerUp, true);
  window.addEventListener('wheel', onWheel, { passive: false, capture: true });
  window.addEventListener('blur', () => keys.clear());

  // --- effects ---------------------------------------------------------------
  /** Resolve an effect anchor to a world position (actor anchors are live). */
  function effectPos(e, out) {
    const a = e.actor != null ? findActor(e.actor) : null;
    if (a) {
      out.copy(a.state.pos);
      out.y += a.spec.dims.heightM * (e.hFrac != null ? e.hFrac : 0.55);
      return { a, pos: out };
    }
    if (Array.isArray(e.at)) {
      const y = e.at.length >= 3 ? e.at[1] : null;
      const x = e.at[0];
      const z = e.at.length >= 3 ? e.at[2] : e.at[1];
      out.set(x, y != null ? y : hfProxy.getHeightAt(x, z) + 0.4, z);
      return { a: null, pos: out };
    }
    if (marker.group.visible) {
      out.copy(marker.pos);
      out.y += 0.4;
      return { a: null, pos: out };
    }
    // fallback: ground ~24 m ahead of the camera
    camera.getWorldDirection(_fwd);
    out.copy(camera.position).addScaledVector(_fwd, 24);
    out.y = hfProxy.getHeightAt(out.x, out.z) + 0.4;
    return { a: null, pos: out };
  }

  /**
   * Fire one effect NOW (records it on the effect log at the current studio
   * clock so state()/load() round-trip). See docs/STUDIO.md for the schema.
   * @param {object} e {type, actor|at, params}
   * @returns {boolean} fired
   */
  function fireEffect(e) {
    ensureFxBus();
    const params = e.params || {};
    const got = effectPos(e, _v1);
    const a = got.a;
    const pos = got.pos;
    const w = getWorld();
    let ok = true;
    switch (e.type) {
      case 'fire': {
        // full firing event on an actor: flash + recoil + optional live shell
        if (!a) { ok = false; break; }
        const slot = Math.max(0, Math.min(a.spec.gun.shells.length - 1, params.slot | 0));
        const shellSpec = a.spec.gun.shells[slot];
        a.visual.gunMuzzleWorld(_v2);
        a.visual.gunDirWorld(_v3);
        fxBus.emit('shell:fired', {
          shellId: -1, shooterId: a.uid, isPlayer: false,
          shellType: shellSpec.type, shellName: shellSpec.name,
          caliberMm: shellSpec.caliberMm,
          muzzlePos: [_v2.x, _v2.y, _v2.z], dir: [_v3.x, _v3.y, _v3.z],
        });
        if (params.recoil !== false && a.visual.recoilKick) {
          a.visual.recoilKick(0);
          a.visual.syncFromState(a.state, 0);
        }
        if (params.tracer !== false) {
          shells.push(createShell(shellSpec, a.uid, false, _v2, _v3, uidSeq * 1000 + shells.length));
        }
        break;
      }
      case 'muzzle_flash': {
        if (a) {
          a.visual.gunMuzzleWorld(_v2);
          a.visual.gunDirWorld(_v3);
        } else {
          _v2.copy(pos);
          const d = (params.dirDeg || 0) * DEG;
          _v3.set(Math.sin(d), 0, Math.cos(d));
        }
        fx.muzzleFlash(_v2, _v3, params.caliberMm || (a ? a.spec.gun.caliberMm : 120));
        break;
      }
      case 'tracer': {
        // a real shell entity flying from → to (freeze mid-flight via fxTime)
        const from = params.from || e.from;
        const to = params.to || e.to;
        if (!from || !to) { ok = false; break; }
        _v2.set(from[0], from[1], from[2]);
        _v3.set(to[0], to[1], to[2]).sub(_v2).normalize();
        const type = params.shellType || 'AP';
        const spec = {
          name: 'studio', type, tracer: type,
          velocityMps: params.speedMps || 900, caliberMm: params.caliberMm || 105,
        };
        shells.push(createShell(spec, 'studio', !!params.isPlayer, _v2, _v3, uidSeq * 1000 + shells.length));
        break;
      }
      case 'impact': {
        _v2.set(params.normal ? params.normal[0] : 0,
          params.normal ? params.normal[1] : 1,
          params.normal ? params.normal[2] : 0).normalize();
        fx.impact(params.kind || 'pen', pos, _v2, params.caliberMm || 120);
        break;
      }
      case 'sparks': {
        _v2.set(0, 1, 0);
        fx.impact(params.kind || 'ricochet', pos, _v2, params.caliberMm || 100);
        break;
      }
      case 'explosion': {
        const size = params.size || 'large';
        if (size === 'small') {
          // terrain HE plume through the real shell-expiry path
          fxBus.emit('shell:expired', {
            shellId: -1, hitTerrain: true, pos: [pos.x, pos.y, pos.z],
          });
        } else {
          fx.destruction(pos, null, size === 'medium' ? 'shot' : (params.cause || 'ammorack'));
        }
        break;
      }
      case 'tank_kill': {
        if (!a) { ok = false; break; }
        _v2.copy(a.state.pos);
        fx.destruction(_v2, a.visual, params.cause || 'ammorack');
        a.visual.setDestroyed({ pop: params.pop !== false, ageS: 0 });
        a.stateName = params.pop !== false ? 'turret-popped' : 'wrecked';
        a.stateAgeS = 0;
        panel.refreshActors();
        break;
      }
      case 'dust': {
        const n = params.count != null ? params.count : 10;
        const d = (params.dirDeg || 0) * DEG;
        _v3.set(Math.sin(d), 0, Math.cos(d));
        _v2.copy(pos);
        if (a) _v2.y = a.state.pos.y + 0.3;
        for (let i = 0; i < n; i++) fx.dust(_v2, _v3, params.intensity != null ? params.intensity : 1);
        break;
      }
      case 'engine_smoke': {
        // ADDITIVE: layers onto any mesh state (a smoldering burnt wreck)
        if (!a) { ok = false; break; }
        a.smoking = params.off ? false : true;
        if (a.stateName === 'intact' && a.smoking) a.stateName = 'engine-smoking';
        panel.refreshActors();
        break;
      }
      case 'burning': {
        // ADDITIVE: fire/smoke column onto any mesh state
        if (!a) { ok = false; break; }
        if (params.off) {
          a.burning = false;
          fxBus.emit('tank:fire', { id: a.uid, burning: false });
        } else {
          igniteColumn(a);
          if (a.stateName === 'intact') a.stateName = 'burning';
        }
        panel.refreshActors();
        break;
      }
      case 'detrack': {
        if (!a) { ok = false; break; }
        const side = (params.side || 'R').toUpperCase() === 'L' ? 'trackL' : 'trackR';
        if (a.visual.setTrackState) a.visual.setTrackState(side, true);
        // seed lastKnownPos at the running gear, then the real detrack beat
        fxBus.emit('shell:hit', {
          targetId: a.uid, kind: 'nonpen', caliberMm: 20, damage: 0,
          pos: [a.state.pos.x, a.state.pos.y + 0.6, a.state.pos.z],
          normal: [0, 1, 0],
        });
        fxBus.emit('module:state', { id: a.uid, module: side, state: 'red' });
        break;
      }
      case 'firing_moment': {
        // composed static (the combat_firing contract language) — frozen art
        if (!a) { ok = false; break; }
        if (a.visual.recoilKick) a.visual.recoilKick(params.ageS != null ? params.ageS : 0.05);
        a.visual.syncFromState(a.state, 0);
        a.visual.gunMuzzleWorld(_v2);
        a.visual.gunDirWorld(_v3);
        fx.composeFiringMoment({
          muzzlePos: _v2.clone(), dir: _v3.clone(),
          caliberMm: params.caliberMm || a.spec.gun.caliberMm,
          tracerType: params.shellType || a.spec.gun.shells[0].type,
          ageS: params.ageS != null ? params.ageS : 0.05,
        });
        break;
      }
      case 'explosion_moment': {
        fx.composeExplosionMoment({ pos: pos.clone(), ageS: params.ageS != null ? params.ageS : 0.6 });
        break;
      }
      case 'mg_burst': {
        // coax-MG stream: N small tracers spawned as a chain down the gun
        // line (a frozen frame reads them as rounds in flight), plus a small
        // flash. Jitter is a FIXED per-index pattern — deterministic under
        // load(), no rng draw.
        if (!a) { ok = false; break; }
        a.visual.gunMuzzleWorld(_v2);
        a.visual.gunDirWorld(_v3);
        fx.muzzleFlash(_v2, _v3, params.caliberMm || 25);
        const n = Math.max(1, Math.min(14, params.count != null ? params.count : 7));
        const gapM = params.gapM != null ? params.gapM : 7;
        const spread = (params.spreadDeg != null ? params.spreadDeg : 0.9) * DEG;
        for (let i = 0; i < n; i++) {
          const spec = {
            name: 'studio-mg', type: 'AP', tracer: 'AP',
            velocityMps: params.speedMps || 820, caliberMm: params.caliberMm || 12.7,
          };
          const jy = ((i % 3) - 1) * spread;          // fixed yaw fan
          const jp = ((i % 2) ? 0.45 : -0.35) * spread; // fixed pitch stagger
          const dir = _v3.clone();
          dir.applyAxisAngle(_up, jy);
          dir.y += jp;
          dir.normalize();
          const from = _v2.clone().addScaledVector(dir, 2 + i * gapM);
          shells.push(createShell(spec, a.uid, false, from, dir, uidSeq * 1000 + shells.length));
        }
        break;
      }
      case 'barrage': {
        // artillery stonk: deterministic ring of ground bursts around the
        // anchor (marker / actor / at). size: 'small' | 'medium' | 'mixed'.
        const n = Math.max(1, Math.min(12, params.count != null ? params.count : 5));
        const rad = params.radiusM != null ? params.radiusM : 10;
        const size = params.size || 'mixed';
        const seedA = (params.seedDeg || 23) * DEG;
        for (let i = 0; i < n; i++) {
          const ang = seedA + (i / n) * Math.PI * 2;
          const rr = rad * (0.3 + 0.7 * (((i * 37) % 10) / 10));
          const x = pos.x + Math.sin(ang) * rr;
          const z = pos.z + Math.cos(ang) * rr;
          const y = hfProxy.getHeightAt(x, z) + 0.05;
          const medium = size === 'medium' || (size === 'mixed' && i % 3 === 0);
          if (medium) {
            fx.destruction(_v2.set(x, y, z), null, 'shot');
          } else {
            fxBus.emit('shell:expired', { shellId: -1, hitTerrain: true, pos: [x, y, z] });
          }
        }
        break;
      }
      case 'armor_scar': {
        // battle scarring: stamp N permanent impact decals around the hull
        // shell at fixed bearings/heights (deterministic — no rng draw).
        if (!a) { ok = false; break; }
        const n = Math.max(1, Math.min(10, params.count != null ? params.count : 4));
        const reach = Math.max(a.spec.dims.widthM || 3.6, a.spec.dims.hullLengthM || 7) * 0.62;
        const seedA = (params.seedDeg || 0) * DEG;
        for (let i = 0; i < n; i++) {
          const ang = seedA + ((i * 137) % 360) * DEG;
          const hf = 0.3 + 0.42 * (((i * 53) % 10) / 10);
          _v3.set(Math.sin(ang), 0.14, Math.cos(ang)).normalize();
          _v2.copy(a.state.pos);
          _v2.y += a.spec.dims.heightM * hf;
          _v2.addScaledVector(_v3, reach);
          fx.armorScar(a.visual, _v2, _v3, params.caliberMm || 100);
        }
        break;
      }
      case 'exhaust': {
        // diesel belch off the engine deck (same anchor the continuous
        // engine-smoke emitter uses). fx.exhaust is probability-gated on the
        // seeded fx rng, so bursts stay deterministic under load().
        if (!a) { ok = false; break; }
        _fwd.set(Math.sin(a.state.yaw), 0, Math.cos(a.state.yaw));
        _v2.copy(a.state.pos).addScaledVector(_fwd, -a.spec.dims.hullLengthM * 0.42);
        _v2.y += a.spec.dims.heightM * 0.72;
        const n = Math.max(1, Math.min(30, params.count != null ? params.count : 14));
        for (let i = 0; i < n; i++) {
          fx.exhaust(_v2, params.intensity != null ? params.intensity : 0.95, params.sooty !== false);
        }
        break;
      }
      default:
        console.warn(`[studio] unknown effect type: ${e.type}`);
        ok = false;
    }
    if (ok) {
      effectLog.push({
        type: e.type,
        ...(e.actor != null ? { actor: actorRefOut(e.actor) } : {}),
        ...(Array.isArray(e.at) ? { at: [...e.at] } : {}),
        ...(e.from ? { from: [...e.from] } : {}),
        ...(e.to ? { to: [...e.to] } : {}),
        params: { ...params },
        tMs: Math.round(clockMs),
      });
      if (w) w.setWindTime(0.35 + clockMs / 1000);
    }
    return ok;
  }

  function actorRefOut(ref) {
    const a = findActor(ref);
    return a ? (a.name || actors.indexOf(a)) : ref;
  }

  // --- timeline ---------------------------------------------------------------
  /**
   * Advance the fx timeline by one dt: studio shells fly (terrain impacts
   * resolve through the real event path), per-actor continuous emitters run
   * (engine smoke, burning refresh), then the fx system ages by dt. dt=0
   * still refreshes tracer ribbons/lights so frozen frames render correctly.
   * @param {number} dt seconds (already time-scaled)
   */
  function stepFx(dt) {
    if (dt > 0) {
      clockMs += dt * 1000;
      // projectiles
      for (const sh of shells) {
        if (sh.dead) continue;
        stepShell(sh, dt);
        const gy = hfProxy.getHeightAt(sh.pos.x, sh.pos.z);
        if (sh.pos.y <= gy) {
          sh.pos.y = gy + 0.05;
          sh.dead = true;
          fxBus.emit('shell:expired', {
            shellId: sh.id, hitTerrain: true, pos: [sh.pos.x, sh.pos.y, sh.pos.z],
          });
        } else if (sh.distM > 4000) {
          sh.dead = true;
        }
      }
      // continuous per-actor emitters
      for (const a of actors) {
        if (a.smoking) {
          _fwd.set(Math.sin(a.state.yaw), 0, Math.cos(a.state.yaw));
          _v2.copy(a.state.pos).addScaledVector(_fwd, -a.spec.dims.hullLengthM * 0.42);
          _v2.y += a.spec.dims.heightM * 0.72;
          fx.exhaust(_v2, 1, true);
          fx.exhaust(_v2, 0.85, true); // doubled: damage smoke, not idle haze
        }
      }
    }
    fx.update(dt, shells, camera);
  }

  /**
   * Deterministically advance the fx timeline by `ms` in fixed 1/60 steps
   * (same cadence live play emits at), syncing actor visual timelines along
   * the way, then hold. Used by load() and the panel's STEP buttons.
   * @param {number} ms milliseconds of fx time
   */
  function advanceFx(ms) {
    const steps = Math.max(0, Math.round((ms / 1000) / FX_STEP_S));
    for (let i = 0; i < steps; i++) {
      stepFx(FX_STEP_S);
      for (const a of actors) a.visual.syncFromState(a.state, FX_STEP_S);
    }
  }

  /** Reset the fx timeline to a clean, seeded t=0 (keeps actors). */
  function resetFx(seed = sceneMeta.seed || 5000) {
    ensureFxBus();
    shells.length = 0;
    effectLog.length = 0;
    fx.resetAll();
    fx.resetSeed(seed);
    fx.setFrozen(false);
    clockMs = 0;
    // wrecks keep their look; burning columns were cleared by resetAll — re-arm
    for (const a of actors) {
      if (a.burning) igniteColumn(a);
    }
    const w = getWorld();
    if (w) w.setWindTime(0.35);
  }

  // --- camera API --------------------------------------------------------------
  function applyCamera(cfg = {}) {
    if (cfg.mode === 'orbit' || cfg.mode === 'fly') cam.mode = cfg.mode;
    // groundRel: y values are heights ABOVE the terrain at their x/z — the
    // ergonomic form for scripted shoots (dunes/hills vary per map)
    const gy = (x, z, y) => (cfg.groundRel ? hfProxy.getHeightAt(x, z) + y : y);
    if (Array.isArray(cfg.pos)) {
      camera.position.set(cfg.pos[0], gy(cfg.pos[0], cfg.pos[2], cfg.pos[1]), cfg.pos[2]);
    }
    if (cfg.fov != null) cam.fov = Math.max(10, Math.min(120, cfg.fov));
    if (cfg.rollDeg != null) cam.roll = cfg.rollDeg * DEG;
    if (Array.isArray(cfg.lookAt)) {
      _v2.set(cfg.lookAt[0], gy(cfg.lookAt[0], cfg.lookAt[2], cfg.lookAt[1]), cfg.lookAt[2]);
      if (cam.mode === 'orbit') {
        cam.orbit.target.copy(_v2);
        cam.orbit.dist = camera.position.distanceTo(_v2);
      }
      lookAt(_v2);
    } else {
      if (cfg.yawDeg != null) cam.yaw = cfg.yawDeg * DEG;
      if (cfg.pitchDeg != null) cam.pitch = cfg.pitchDeg * DEG;
      applyCameraPose();
    }
    applyCameraPose();
    lighting.updateFrustums();
    panel.refreshCamera();
  }

  function getCamera() {
    camera.getWorldDirection(_fwd);
    return {
      mode: cam.mode,
      pos: [r2(camera.position.x), r2(camera.position.y), r2(camera.position.z)],
      yawDeg: r2(cam.yaw / DEG),
      pitchDeg: r2(cam.pitch / DEG),
      rollDeg: r2(cam.roll / DEG),
      fov: r2(cam.fov),
      lookAt: [
        r2(camera.position.x + _fwd.x * 20),
        r2(camera.position.y + _fwd.y * 20),
        r2(camera.position.z + _fwd.z * 20),
      ],
    };
  }
  const r2 = (v) => Math.round(v * 100) / 100;

  // --- capture -----------------------------------------------------------------
  /**
   * Hi-res still of the current studio frame. Temporarily re-sizes the
   * renderer + full post chain to the target resolution at pixelRatio 1,
   * forces every shadow cascade, renders once (dt=0 — no sim, no governor),
   * reads the canvas back, then restores the live viewport.
   * @param {{width?:number, height?:number, scale?:number, download?:boolean,
   *   name?:string, type?:string, quality?:number}} [opts]
   * @returns {{dataURL:string, width:number, height:number}}
   */
  function capture(opts = {}) {
    renderer.getSize(_size);
    const prevW = _size.x;
    const prevH = _size.y;
    const prevPR = renderer.getPixelRatio();
    const aspect = prevW / Math.max(1, prevH);
    const maxTex = Math.min(CAPTURE_MAX_W,
      (renderer.capabilities && renderer.capabilities.maxTextureSize) || CAPTURE_MAX_W);
    let W = Math.round(opts.width ||
      (opts.scale ? prevW * opts.scale : Math.max(CAPTURE_MIN_W, prevW * 2)));
    W = Math.max(320, Math.min(maxTex, W));
    let H = Math.round(opts.height || W / aspect);
    H = Math.max(180, Math.min(maxTex, H));
    let dataURL;
    try {
      renderer.setPixelRatio(1);
      renderer.setSize(W, H, false);
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      post.setSize(W, H);
      lighting.updateFrustums();
      lighting.update(true); // every cascade fresh — deterministic capture
      stepFx(0);             // rebuild tracer ribbons/lights for this camera
      post.render(0);
      dataURL = renderer.domElement.toDataURL(opts.type || 'image/png', opts.quality);
    } finally {
      renderer.setPixelRatio(prevPR);
      renderer.setSize(prevW, prevH, false);
      camera.aspect = prevW / Math.max(1, prevH);
      camera.updateProjectionMatrix();
      post.setSize(prevW, prevH);
      lighting.updateFrustums();
      lighting.update(true);
      post.render(0); // repaint the live view immediately (no stale stretch)
    }
    if (opts.download) {
      const link = document.createElement('a');
      link.href = dataURL;
      link.download = opts.name ||
        `studio_${(getWorld() ? getWorld().mapId : 'map')}_${Date.now()}.png`;
      link.click();
    }
    return { dataURL, width: W, height: H };
  }

  // --- scene JSON --------------------------------------------------------------
  /** @returns {object} round-trippable scene JSON (docs/STUDIO.md schema). */
  function stateJson() {
    const w = getWorld();
    return {
      map: w ? w.mapId : 'verdant',
      seed: sceneMeta.seed || 5000,
      actors: actors.map((a) => ({
        id: a.specId,
        ...(a.name ? { name: a.name } : {}),
        pos: [r2(a.pose.x), r2(a.pose.z)],
        facingDeg: r2(a.pose.facingDeg),
        turretDeg: r2(a.pose.turretDeg),
        gunDeg: r2(a.pose.gunDeg),
        ...(a.camo ? { camo: a.camo } : {}),
        camoSeed: a.camoSeed,
        state: a.stateName,
        ...(a.stateAgeS != null ? { stateAgeS: a.stateAgeS } : {}),
        ...(a.recoilAgeS != null ? { recoilAgeS: a.recoilAgeS } : {}),
        ...(a.smoking && a.stateName !== 'engine-smoking' ? { smoking: true } : {}),
        ...(a.burning && a.stateName !== 'burning' ? { burning: true } : {}),
      })),
      effects: effectLog.map((e) => ({ ...e, params: { ...e.params } })),
      camera: getCamera(),
      fxTime: Math.round(clockMs),
      timeScale,
    };
  }

  /**
   * Deterministic scene build (THE scripted-shoot entry point):
   * enter/switch map → reset fx → build+pose actors → apply camera → fire
   * effects at their tMs on a fixed-step timeline → advance to fxTime →
   * freeze. See docs/STUDIO.md.
   * @param {object} json scene JSON
   * @param {object} [opts]
   * @returns {Promise<object>} the round-trip state()
   */
  async function load(json = {}, opts = {}) {
    if (loading) throw new Error('studio.load already in flight');
    loading = true;
    try {
      const mapId = resolveMapId(json.map || 'verdant', () => 0.01);
      if (!active) await enter({ map: mapId });
      const w0 = getWorld();
      if (!w0 || w0.mapId !== mapId) await setMap(mapId);
      sceneMeta.seed = json.seed != null ? json.seed : 5000;
      timeScale = 0; // build frozen — nothing ages while we stage
      clearActors();
      resetFx(sceneMeta.seed);
      for (const cfg of json.actors || []) addActor(cfg);
      if (json.camera) applyCamera(json.camera);
      // timeline: fire effects at tMs, advance to fxTime, freeze
      const fxMs = Math.max(0, json.fxTime || 0);
      const list = (json.effects || [])
        .map((e) => ({ ...e, tMs: Math.max(0, e.tMs || 0) }))
        .sort((x, y) => x.tMs - y.tMs);
      let t = 0;
      for (const e of list) {
        if (e.tMs > fxMs) {
          // beyond the freeze point: keep it on the log (state() round-trips
          // it; it fires only if a longer fxTime replays the scene)
          effectLog.push({ ...e, params: { ...(e.params || {}) }, tMs: Math.round(e.tMs) });
          continue;
        }
        advanceFx(e.tMs - t);
        t = e.tMs;
        if (fireEffect(e)) {
          // fireEffect logged it at the CURRENT clock — keep authored tMs
          effectLog[effectLog.length - 1].tMs = Math.round(e.tMs);
        }
      }
      advanceFx(fxMs - t);
      clockMs = fxMs; // exact (advanceFx rounds to whole steps)
      timeScale = json.timeScale != null ? json.timeScale : 0;
      const w = getWorld();
      if (w) w.setWindTime(0.35 + fxMs / 1000);
      for (const a of actors) a.visual.syncFromState(a.state, 0);
      lighting.updateFrustums();
      lighting.update(true);
      panel.refreshAll();
      return stateJson();
    } finally {
      loading = false;
    }
  }

  async function setMap(mapId) {
    const id = resolveMapId(mapId, () => 0.01);
    panel.setBusy(`Building ${getMapConfig(id).name || id}…`);
    try {
      await ensureWorld(id, (f, label) => panel.setBusy(`${label} ${Math.round(f * 100)}%`));
      setWorldDormant(false);
      setCamoBiome(id);
      applyCamoPatterns();
      for (const a of actors) settleActor(a);
      const w = getWorld();
      if (w) w.setWindTime(0.35 + clockMs / 1000);
      panel.refreshAll();
    } finally {
      panel.setBusy(null);
    }
    return getWorld().mapId;
  }

  // --- enter / exit -------------------------------------------------------------
  /**
   * Enter the studio phase: hide the garage, build/activate the map WITHOUT
   * staging a battle, take camera ownership. Idempotent.
   * @param {{map?:string}} [opts]
   */
  function enter(opts = {}) {
    if (active) return Promise.resolve();
    if (entering) return entering; // share the in-flight entry (load() awaits it)
    entering = doEnter(opts).finally(() => { entering = null; });
    return entering;
  }

  async function doEnter(opts) {
    // never race the boot tail: everything the studio touches exists once
    // the game declares readiness
    if (!window.__GAME_READY) {
      await new Promise((res) => {
        const t = setInterval(() => {
          if (window.__GAME_READY) { clearInterval(t); res(); }
        }, 60);
      });
    }
    const mapId = resolveMapId(opts.map || urlParam('map') || 'verdant', () => 0.01);
    // The whole swap runs behind the branded loading screen: the garage keeps
    // rendering under the fade-in, and the world build drives the real bar.
    // Probes never see it (transition.run is a synchronous no-op under
    // automation — screenshot contract).
    await transition.run(async (p) => {
      p(0.02, 'Preparing studio');
      game.phase = 'studio';
      garage.hide();
      showroom.stop();
      hud.setMode('hidden');
      setGarageSpots(false);
      setGarageSunTrim(false); // authored map sun, not the neutral pedestal key
      ensureFxBus();
      await warmCombatPipeline(); // yield between warm stages behind the veil
      active = true;        // tick branch takes the frame from here on
      panel.show();
      await ensureWorld(mapId, (f, label) => p(0.04 + f * 0.9, label));
      setWorldDormant(false);
      setCamoBiome(mapId);
      applyCamoPatterns();
      sweepPool();
      resetFx();
      timeScale = 1;
      p(0.96, 'Positioning camera');
      // default vantage: over the player spawn, looking across the field
      const w = getWorld();
      const sp = w.spawnPoints.player;
      _v2.set(sp.pos[0], sp.pos[1], sp.pos[2]);
      camera.position.set(
        _v2.x - Math.sin(sp.yaw) * 22, _v2.y + 9, _v2.z - Math.cos(sp.yaw) * 22,
      );
      cam.fov = 50;
      cam.roll = 0;
      lookAt(_v1.copy(_v2).setY(_v2.y + 2));
      cam.orbit.target.copy(_v2);
      cam.orbit.dist = 24;
      lighting.updateFrustums();
      panel.setBusy(null);
      panel.refreshAll();
    }, {
      kicker: 'Scene Studio',
      title: getMapConfig(mapId).name || mapId,
      sub: 'Staging rig · Free camera',
      minShowMs: 900,
    });
    syncRoute(true);
    docBrand('studio');
  }

  /**
   * Leave the studio and hand the game back to the garage, behind the same
   * branded veil (owner: "going to studio should show a loading screen…
   * and back"). The studio keeps ticking while the veil fades in, so no
   * half-torn frame is ever visible; the actual teardown runs covered.
   */
  let exiting = false;
  function exit() {
    if (!active || exiting) return;
    exiting = true;
    transition.run(() => { doExit(); }, {
      kicker: 'Scene Studio', title: 'Garage',
      progress: false, minShowMs: 720,
    }).finally(() => { exiting = false; });
  }

  function doExit() {
    if (!active) return;
    active = false;
    panel.hide();
    marker.group.visible = false;
    placeArmed = null;
    dragActor = null;
    dragging = false;
    keys.clear();
    clearActors();
    shells.length = 0;
    effectLog.length = 0;
    fx.resetAll();
    fx.setFrozen(false);
    timeScale = 1;
    camera.rotation.z = 0; // no roll may leak into game cameras
    cam.roll = 0;
    unsweepPool();
    enterGarage(); // restores camo overrides, sun trim, spots, showroom
    syncRoute(false);
    docBrand('garage');
  }

  // --- per-frame (owns the whole frame while active; called from main tick) ---
  function tick(dt) {
    updateCamera(dt);
    sweepPool();
    const w = getWorld();
    const wdt = timeScale === 0 ? 0 : dt;
    camera.getWorldDirection(_fwd);
    if (w) w.update(wdt, camera.position, _fwd, null);
    stepFx(dt * timeScale);
    for (const a of actors) a.visual.syncFromState(a.state, dt * timeScale);
    if (camera.fov !== lastFov) {
      lighting.updateFrustums();
      lastFov = camera.fov;
    }
    panel.tick(dt);
    lighting.update();
    post.render(dt);
  }

  function urlParam(name) {
    try { return new URLSearchParams(window.location.search).get(name); } catch (_) { return null; }
  }

  /** Is the page on the /studio pretty route (vite.config.js rewrite)? */
  function onStudioRoute() {
    try { return /^\/studio\/?$/.test(window.location.pathname); } catch (_) { return false; }
  }

  /**
   * Keep the address bar honest: /studio while the studio owns the frame,
   * / back in the garage — so a refresh lands where the player left off.
   * replaceState only (no history spam); the ?studio=1 legacy entry param is
   * stripped so an exit never re-triggers auto-entry on reload.
   */
  function syncRoute(inStudio) {
    try {
      if (!window.history || !window.history.replaceState) return;
      const want = inStudio ? '/studio' : '/';
      if (window.location.pathname === want) return;
      const sp = new URLSearchParams(window.location.search);
      sp.delete('studio');
      const qs = sp.toString();
      window.history.replaceState(null, '', want + (qs ? `?${qs}` : ''));
    } catch (_) { /* sandboxed frames — cosmetic only */ }
  }

  /**
   * Tab identity follows the mode (owner: "use relevant logos"): the studio
   * mark + title while active, the crest favicon + original title back in
   * the garage. Saved/restored as a pair so nothing leaks across modes.
   */
  const docBrand = (() => {
    let saved = null;
    return (mode) => {
      try {
        const links = [...document.querySelectorAll('link[rel="icon"]')];
        if (mode === 'studio') {
          if (!saved) {
            saved = {
              title: document.title,
              links: links.map((l) => ({
                l, href: l.getAttribute('href'), type: l.getAttribute('type'),
              })),
            };
          }
          for (const l of links) {
            l.setAttribute('href', '/brand/nav/studio.png');
            l.setAttribute('type', 'image/png');
          }
          document.title = 'Claude of Tanks — Studio';
        } else if (saved) {
          for (const { l, href, type } of saved.links) {
            l.setAttribute('href', href);
            if (type) l.setAttribute('type', type);
            else l.removeAttribute('type');
          }
          document.title = saved.title;
          saved = null;
        }
      } catch (_) { /* headless DOM without icon links */ }
    };
  })();

  // --- public API ----------------------------------------------------------------
  const api = {
    // scripted-shoot contract (docs/STUDIO.md)
    load,
    capture,
    listActors: () => actors.map((a, i) => ({
      index: i, uid: a.uid, name: a.name, id: a.specId,
      pos: [r2(a.pose.x), r2(a.pose.z)],
      facingDeg: r2(a.pose.facingDeg), turretDeg: r2(a.pose.turretDeg),
      gunDeg: r2(a.pose.gunDeg), state: a.stateName,
      smoking: !!a.smoking, burning: !!a.burning,
      camo: a.camo || null, camoSeed: a.camoSeed,
    })),
    state: stateJson,
    // session control
    enter: (opts) => enter(opts),
    exit,
    setMap,
    get active() { return active; },
    get mapId() { const w = getWorld(); return w ? w.mapId : null; },
    // actors
    addActor: (cfg) => { const a = addActor(cfg); selectActor(a); return api.listActors()[actors.indexOf(a)]; },
    removeActor,
    updateActor: (ref, patch) => { const a = updateActor(ref, patch); panel.refreshAll(); return a ? api.listActors()[actors.indexOf(a)] : null; },
    setActorState,
    selectActor: (ref) => { const a = selectActor(ref); return a ? a.uid : null; },
    clearActors: () => { clearActors(); },
    // effects + time
    effect: fireEffect,
    clearEffects: () => resetFx(),
    advanceFx: (ms) => { advanceFx(ms); panel.refreshAll(); },
    setTimeScale: (v) => { timeScale = Math.max(0, Math.min(4, v)); panel.refreshTime(); return timeScale; },
    get timeScale() { return timeScale; },
    get fxTimeMs() { return Math.round(clockMs); },
    // camera
    setCamera: applyCamera,
    getCamera,
    // constants for tooling/panel
    TANK_IDS: ALL_TANK_IDS,
    MAP_IDS,
    ACTOR_STATES,
    EFFECT_TYPES,
    CAMO_PATTERN_IDS,
    getSpecInfo: (id) => {
      const s = getSpec(id);
      return {
        id: s.id, name: s.name, era: s.era, class: s.class,
        gunElevationDeg: s.gunElevationDeg, gunDepressionDeg: s.gunDepressionDeg,
        shells: s.gun.shells.map((sh) => sh.type),
      };
    },
    // panel-internal hooks (not part of the scripted contract)
    _internal: {
      get selected() { return selected; },
      get placeArmed() { return placeArmed; },
      set placeArmed(v) { placeArmed = v; },
      get markerPos() { return marker.pos; },
      cam,
      actors,
      findActor,
    },
  };

  const panel = createStudioPanel(api);

  window.__STUDIO = api;

  // Auto-entry: the /studio pretty route or the legacy ?studio=1 param
  // (waits for readiness; map via ?map=…)
  if (urlParam('studio') || onStudioRoute()) {
    const t = setInterval(() => {
      if (!window.__GAME_READY) return;
      clearInterval(t);
      enter({ map: urlParam('map') || 'verdant' })
        .catch((err) => console.error('[studio] auto-enter failed', err));
    }, 60);
  }

  return {
    get active() { return active; },
    tick,
    enter,
    exit,
    api,
  };
}
