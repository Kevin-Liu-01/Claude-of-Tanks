/**
 * studio.ts — SCENE STUDIO: an in-game staging rig for composing shots.
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
 * src/fx/effects.ts), a free-fly/orbit camera, a studio-owned fx time scale
 * with freeze, and a hi-res capture path.
 *
 * Integration contract (kept deliberately tiny — see main.ts):
 *   - main.ts creates it once post-boot: createStudio(ctx)
 *   - main.ts tick() delegates the WHOLE frame while active:
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
import { VISIBLE_TANK_IDS, getSpec } from '../vehicles/specs.ts';
import { createTank, ensureFullFleet } from '../vehicles/fleetFactory.ts';
import {
  createTankState, resetTankVerticalState, updateTank, SIM_DT,
} from '../sim/movement.ts';
import { createShell, stepShell } from '../sim/ballistics.ts';
import { createBus } from './stateCore.ts';
import {
  CAMO_PATTERN_IDS, setCamoOverride, clearCamoOverrides, applyCamoPatterns,
  setCamoBiome,
} from '../vehicles/materials.ts';
import { MAP_IDS, getMapConfig, resolveMapId } from '../world/maps/index.ts';
import { createStudioPanel } from '../ui/studioPanel.ts';
import type {
  StudioActor as StudioPanelActor,
  StudioPanelApi,
  StudioPanelRuntime,
} from '../ui/studioPanel.ts';
import {
  STUDIO_MAX_DURATION_MS,
  normalizeStoryboard,
  clampStudioTime,
  upsertCameraShot,
  removeCameraShot as removeStoryboardShot,
  upsertActorKey,
  clearActorTrack as clearStoryboardActorTrack,
  sampleCameraRail,
  sampleActorTrack,
} from './studioTimeline.ts';
import type {
  ActorKeyInput,
  ActorTrack,
  ActorTrackSample,
  CameraRailSample,
  CameraShotInput,
  Storyboard,
  StoryboardInput,
} from './studioTimeline.ts';
import { createFrameBudgetYielder } from '../engine/frameScheduler.ts';
import type {
  MovementContactGeometry,
  MovementEntity,
  MovementHeightField,
  MovementInput,
  TankState,
} from '../sim/movement.ts';
import type { PostRuntime } from '../engine/post.ts';
import type { WorldRuntime } from '../world/map.ts';

type TankSpec = ReturnType<typeof getSpec>;
type TankVisual = ReturnType<typeof createTank>;
type StudioShell = ReturnType<typeof createShell> & { _studioMaxDistM?: number };
type ProgressListener = (fraction: number, label: string) => void;

interface StudioPoolTank {
  visual?: TankVisual | null;
  state?: TankState | null;
}

interface StudioGameState {
  phase: string;
  _engineCtx: unknown;
  allTanks: StudioPoolTank[];
  tanks: StudioPoolTank[];
}

interface StudioFxRuntime {
  bindBus(bus: ReturnType<typeof createBus>): void;
  resetAll(): void;
  resetSeed(seed: number): void;
  setFrozen(frozen: boolean): void;
  update(
    deltaSeconds: number,
    shells: StudioShell[],
    camera: THREE.PerspectiveCamera,
    resolveSubject: (id: unknown) => StudioActor | null,
  ): void;
  muzzleFlash(position: THREE.Vector3, direction: THREE.Vector3, caliberMm: number): void;
  destruction(position: THREE.Vector3, visual: TankVisual | null, cause: string): void;
  dust(position: THREE.Vector3, direction: THREE.Vector3, intensity: number): void;
  exhaust(position: THREE.Vector3, intensity: number, sooty: boolean): void;
  armorScar(visual: TankVisual, position: THREE.Vector3, normal: THREE.Vector3, caliberMm: number): void;
  composeFiringMoment(options: Readonly<Record<string, unknown>>): void;
  composeExplosionMoment(options: Readonly<Record<string, unknown>>): void;
}

interface StudioLightingRuntime {
  update(force?: boolean): void;
  updateFrustums(): void;
}

interface StudioTransitionRuntime {
  run<T>(
    work: (progress: ProgressListener) => T | Promise<T>,
    options?: Readonly<Record<string, unknown>>,
  ): Promise<T>;
  progress?(fraction: number, label: string): void;
}

interface StudioContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  post: PostRuntime;
  lighting: StudioLightingRuntime;
  fx: StudioFxRuntime;
  game: StudioGameState;
  hud?: { setMode?(mode: string): void } | null;
  garage: { hide(): void };
  showroom: { stop(): void };
  hfProxy: MovementHeightField;
  getWorld(): WorldRuntime | null;
  ensureWorld(mapId: string, onProgress?: ProgressListener): Promise<WorldRuntime>;
  setWorldDormant(dormant: boolean): void;
  setGarageSpots(enabled: boolean): void;
  setGarageSunTrim(enabled: boolean): void;
  enterGarage(): void;
  warmStudioPipeline?(onProgress?: ProgressListener): Promise<unknown>;
  transition?: StudioTransitionRuntime;
  autoEnter?: boolean;
}

interface StudioActorInput {
  id?: string;
  specId?: string;
  name?: string | null;
  pos?: readonly number[];
  facingDeg?: number;
  turretDeg?: number;
  gunDeg?: number;
  camo?: string | null;
  camoSeed?: number;
  state?: string;
  stateAgeS?: number | null;
  recoilAgeS?: number | null;
  smoking?: boolean;
  burning?: boolean;
  authoredState?: string;
  authoredStateAgeS?: number | null;
  authoredRecoilAgeS?: number | null;
  authoredSmoking?: boolean;
  authoredBurning?: boolean;
}

interface StudioActorPatch extends StudioActorInput {
  x?: number;
  z?: number;
  _drag?: boolean;
}

interface StudioActor extends MovementEntity, StudioPanelActor {
  uid: string;
  name: string | null;
  specId: string;
  spec: TankSpec;
  visual: TankVisual;
  state: TankState;
  input: MovementInput & {
    throttle: number;
    steer: number;
    brake: boolean;
    fire: boolean;
    aimPoint: THREE.Vector3;
    shellSlot: number;
  };
  combat: null;
  rigidGear: boolean;
  contactGeom: MovementContactGeometry | null;
  pose: {
    x: number;
    z: number;
    facingDeg: number;
    turretDeg: number;
    gunDeg: number;
  };
  camo: string | null;
  camoSeed: number;
  stateName: string;
  stateAgeS: number | null;
  recoilAgeS: number | null;
  authoredStateName: string;
  authoredStateAgeS: number | null;
  authoredSmoking: boolean;
  authoredBurning: boolean;
  authoredRecoilAgeS: number | null;
  smoking: boolean;
  burning: boolean;
  timelineX: number;
  timelineZ: number;
  timelineYaw: number;
  timelineTrack: ActorTrack | null;
}

type ActorRef = StudioActor | StudioPanelActor | string | number | null | undefined;

interface StudioEffectParams {
  ageS?: number;
  caliberMm?: number;
  cause?: string;
  count?: number;
  dirDeg?: number;
  from?: readonly number[];
  gapM?: number;
  intensity?: number;
  isPlayer?: boolean;
  kind?: string;
  normal?: readonly number[];
  off?: boolean;
  pop?: boolean;
  radiusM?: number;
  recoil?: boolean;
  seedDeg?: number;
  shellType?: string;
  side?: string;
  size?: string;
  slot?: number;
  sooty?: boolean;
  speedMps?: number;
  spreadDeg?: number;
  to?: readonly number[];
  tracer?: boolean;
}

interface StudioEffectInput {
  id?: string;
  type: string;
  actor?: ActorRef;
  hFrac?: number;
  at?: readonly number[];
  from?: readonly number[];
  to?: readonly number[];
  params?: StudioEffectParams;
  tMs?: number;
}

interface StudioEffectRecord {
  id: string;
  type: string;
  actor?: string | number | null;
  hFrac?: number;
  at?: number[];
  from?: number[];
  to?: number[];
  params: StudioEffectParams;
  tMs: number;
}

type EffectRef = StudioEffectRecord | string | number | null | undefined;

interface EffectFireOptions {
  record?: boolean;
  refresh?: boolean;
  tMs?: number;
}

interface CameraConfig {
  mode?: 'fly' | 'orbit';
  pos?: readonly number[];
  groundRel?: boolean;
  fov?: number;
  rollDeg?: number;
  lookAt?: readonly number[];
  yawDeg?: number;
  pitchDeg?: number;
}

interface CaptureOptions {
  width?: number;
  height?: number;
  scale?: number;
  download?: boolean;
  name?: string;
  type?: string;
  quality?: number;
}

interface VideoOptions {
  fps?: number;
  mimeType?: string;
  videoBitsPerSecond?: number;
  download?: boolean;
  name?: string;
}

interface VideoResult {
  blob: Blob;
  size: number;
  mimeType: string;
  durationMs: number;
}

interface RecordingSession {
  mediaRecorder: MediaRecorder;
  stream: MediaStream;
  chunks: Blob[];
  promise: Promise<VideoResult>;
  resolve(result: VideoResult): void;
  reject(reason?: unknown): void;
  download: boolean;
  name: string | null;
  mimeType: string;
  startedAt: number;
  durationMs: number;
  elapsedMs: number;
  stopping: boolean;
}

interface StudioSceneInput {
  map?: string;
  seed?: number;
  actors?: readonly StudioActorInput[];
  effects?: readonly StudioEffectInput[];
  storyboard?: StoryboardInput;
  camera?: CameraConfig;
  fxTime?: number;
  timeScale?: number;
}

interface EnterOptions {
  map?: string | null;
  coveredByBoot?: boolean;
  onProgress?: ProgressListener;
}

interface SeekOptions {
  pause?: boolean;
  recording?: boolean;
}

interface RemoveActorOptions {
  rebuild?: boolean;
}

interface StudioRuntime {
  readonly active: boolean;
  tick(deltaSeconds: number): void;
  enter(options?: EnterOptions): Promise<void>;
  exit(): void;
  api: StudioPanelApi & Readonly<Record<string, unknown>>;
}

const DEG = Math.PI / 180;
const FX_STEP_S = 1 / 60;      // fixed timeline step (load() and live advance)
const SETTLE_STEPS = 48;       // updateTank steps to conform a placed actor
const SETTLE_STEPS_DRAG = 6;   // cheap conform while dragging
const CAPTURE_MIN_W = 2560;    // capture floor (marketing contract)
const CAPTURE_MAX_W = 6144;    // sanity cap (also clamped by GPU max texture)
const MAX_STUDIO_EFFECTS = 256; // bounded authoring/replay stack

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
const _cameraSample: CameraRailSample & Required<Pick<
  CameraRailSample,
  'x' | 'y' | 'z' | 'lookX' | 'lookY' | 'lookZ' | 'fov' | 'rollDeg'
>> = {
  x: 0, y: 0, z: 0,
  lookX: 0, lookY: 0, lookZ: 0,
  fov: 50, rollDeg: 0, shotId: undefined,
};
const _actorSample: ActorTrackSample & Required<Pick<
  ActorTrackSample,
  'x' | 'z' | 'facingDeg' | 'turretDeg' | 'gunDeg'
>> = {
  x: 0, z: 0, facingDeg: 0, turretDeg: 0, gunDeg: 0, keyId: undefined,
};

/**
 * Create the studio. Pure setup — nothing heavy happens until enter().
 *
 * @param {object} ctx integration handles from main.ts:
 *   renderer, scene, camera, post, lighting, fx, game, hud, garage, showroom,
 *   hfProxy, getWorld(), ensureWorld(mapId,onProgress), setWorldDormant(on),
 *   setGarageSpots(on), setGarageSunTrim(on), enterGarage(),
 *   warmStudioPipeline(), transition (branded loading screen, optional)
 * @returns {{active: boolean, tick(dt: number): void, enter(opts?: object):
 *   Promise<void>, exit(): void, api: object}}
 */
export function createStudio(ctx: StudioContext): StudioRuntime {
  const {
    renderer, scene, camera, post, lighting, fx, game, hud, garage, showroom,
    hfProxy, getWorld, ensureWorld, setWorldDormant, setGarageSpots,
    setGarageSunTrim, enterGarage,
  } = ctx;
  const warmStudioPipeline = ctx.warmStudioPipeline || (() => Promise.resolve());
  // Optional so a ctx without it (tests, stripped builds) still gets a
  // working studio — the run() fallback just executes the work directly.
  const transition: StudioTransitionRuntime = ctx.transition || {
    async run<T>(work: (progress: ProgressListener) => T | Promise<T>): Promise<T> {
      return work(() => {});
    },
    progress: () => {},
  };

  // --- studio state ----------------------------------------------------------
  let active = false;
  let entering: Promise<void> | null = null; // in-flight enter() promise (shared latch)
  let loading = false;         // load() in flight (blocks re-entrant loads)
  let mapChange: Promise<string> | null = null; // serialized map switch
  let timeScale = 1;           // fx time multiplier; 0 = frozen
  let clockMs = 0;             // studio fx timeline (ms since last fx reset)
  let uidSeq = 1;
  let effectUidSeq = 1;
  const actors: StudioActor[] = []; // see addActor()
  const actorRoots: THREE.Object3D[] = []; // raycast roots, maintained with actors
  const actorByRoot = new WeakMap<THREE.Object3D, StudioActor>();
  const pickHits: THREE.Intersection[] = []; // Raycaster optionalTarget scratch
  const shells: StudioShell[] = []; // live studio projectiles (fx tracer source)
  const effectLog: StudioEffectRecord[] = []; // authored effect instances
  const activeEffectIds = new Set<string>(); // effects emitted at playhead
  let lastFov = 0;
  let frameDirty = true;
  let cameraDirty = true;
  let poolSweepAcc = 0;
  let sceneMeta = { seed: 5000 };
  let selectedEffect: StudioEffectRecord | null = null;
  let storyboard: Storyboard = normalizeStoryboard();
  let selectedShotId: string | null = null;
  let shotUidSeq = 1;
  let actorKeyUidSeq = 1;
  let railVisible = true;
  let recording: RecordingSession | null = null;
  const perf = { renderedFrames: 0, skippedFrames: 0, poolSweeps: 0 };

  function invalidate() { frameDirty = true; }

  // fx event channel: a PRIVATE bus bound to the fx system only, so synthetic
  // events (muzzle flash, impact, smoke column, detrack burst) reuse the real
  // effect language without touching main.ts/hud/audio/killcam listeners.
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
  const keys = new Set<string>();
  let dragging = false;        // look-drag latch
  let dragMoved = 0;
  let dragActor: StudioActor | null = null; // actor being position-dragged
  let placeArmed: string | null = null; // specId to place on next terrain click
  const marker = buildMarker();// last terrain click (effect anchor)
  scene.add(marker.group);
  const rail = buildCameraRail();
  scene.add(rail.group);

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
      set(p: THREE.Vector3) {
        this.pos.copy(p);
        group.position.copy(p);
        group.position.y += 0.06;
        group.visible = true;
        invalidate();
      },
    };
  }

  function buildCameraRail() {
    const group = new THREE.Group();
    group.name = 'studio_camera_rail';
    group.visible = false;
    const pointGeometry = new THREE.SphereGeometry(0.22, 10, 7);
    const pointMaterial = new THREE.MeshBasicMaterial({
      color: 0xffbc59, transparent: true, opacity: 0.95, depthTest: false,
    });
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0xe69a2d, transparent: true, opacity: 0.8, depthTest: false,
    });
    let line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial> | null = null;
    return {
      group,
      rebuild() {
        if (line) {
          group.remove(line);
          line.geometry.dispose();
          line = null;
        }
        group.clear();
        const shots = storyboard.shots;
        if (shots.length >= 2) {
          const samples = Math.max(2, (shots.length - 1) * 24 + 1);
          const positions = new Float32Array(samples * 3);
          for (let i = 0; i < samples; i++) {
            const tMs = storyboard.durationMs * (i / (samples - 1));
            sampleCameraRail(shots, tMs, _cameraSample);
            const o = i * 3;
            positions[o] = _cameraSample.x;
            positions[o + 1] = _cameraSample.y;
            positions[o + 2] = _cameraSample.z;
          }
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
          line = new THREE.Line(geometry, lineMaterial);
          line.frustumCulled = false;
          line.renderOrder = 900;
          group.add(line);
        }
        for (const shot of shots) {
          const point = new THREE.Mesh(pointGeometry, pointMaterial);
          point.position.fromArray(shot.pos);
          point.frustumCulled = false;
          point.renderOrder = 901;
          point.userData.studioShotId = shot.id;
          group.add(point);
        }
        group.visible = active && railVisible && timeScale === 0 && !recording && shots.length > 0;
        invalidate();
      },
      updateVisibility() {
        group.visible = active && railVisible && timeScale === 0 && !recording
          && storyboard.shots.length > 0;
      },
    };
  }

  function applyCameraPose() {
    camera.rotation.order = 'YXZ';
    camera.rotation.set(cam.pitch, cam.yaw, cam.roll);
    if (camera.fov !== cam.fov) {
      camera.fov = cam.fov;
      camera.updateProjectionMatrix();
    }
    cameraDirty = false;
    invalidate();
  }

  function lookAt(target: THREE.Vector3): void {
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

  function updateCamera(dt: number): boolean {
    if (timeScale > 0 && storyboard.shots.length) return false;
    const boost = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 4 : 1;
    const v = cam.speed * boost * dt;
    if (cam.mode === 'fly') {
      const moving = keys.has('KeyW') || keys.has('KeyS') || keys.has('KeyA')
        || keys.has('KeyD') || keys.has('KeyE') || keys.has('KeyQ');
      if (!moving && !cameraDirty) return false;
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
      return true;
    }
    if (cameraDirty) {
      orbitApply();
      return true;
    }
    return false;
  }

  // --- pool / world housekeeping ---------------------------------------------
  /** Hide every battle-pool tank visual (idle pump may stream new ones in). */
  function sweepPool() {
    perf.poolSweeps++;
    let changed = false;
    for (const ent of game.allTanks) {
      if (ent.visual && ent.visual.root.visible) {
        ent.visual.setVisible(false);
        changed = true;
      }
    }
    if (changed) invalidate();
  }
  /** Restore staged-battle visuals on exit (battle re-entry force-shows too). */
  function unsweepPool() {
    for (const ent of game.tanks) {
      if (ent.visual && ent.state) ent.visual.setVisible(true);
    }
  }

  // --- actors -----------------------------------------------------------------
  function clampGunDeg(spec: TankSpec, deg: number): number {
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
  function settleActor(a: StudioActor, steps = SETTLE_STEPS): void {
    const p = a.pose;
    const st = a.state;
    st.pos.x = p.x;
    st.pos.z = p.z;
    resetTankVerticalState(st, hfProxy.getHeightAt(p.x, p.z));
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
    a.timelineX = p.x;
    a.timelineZ = p.z;
    a.timelineYaw = st.yaw;
    a.visual.syncFromState(st, 0);
  }

  /**
   * Drive a siege vehicle through the real hydropneumatic aiming simulation.
   * This is deliberately not a pose override: updateTank owns hull attitude
   * and support height, while syncFromState settles every wheel station and
   * deforms both loaded track runs against the active heightfield.
   * @param {string|number|object} ref actor reference
   * @param {number} pitchDeg requested sight-line elevation in degrees
   * @returns {?object} settled suspension telemetry, or null when unsupported
   */
  function setHydropneumaticAim(ref: ActorRef, pitchDeg = 0): Readonly<Record<string, unknown>> | null {
    const a = findActor(ref);
    const hydraulic = a?.spec?.hydropneumaticAim;
    if (!a || !hydraulic) return null;

    const st = a.state;
    const targetDeg = Math.max(-(hydraulic.noseDownDeg ?? 12),
      Math.min(hydraulic.noseUpDeg ?? 12, Number(pitchDeg) || 0));
    const targetPitch = targetDeg * DEG;
    const rangeM = 180;
    const authoredX = a.pose.x;
    const authoredZ = a.pose.z;
    const authoredYaw = a.pose.facingDeg * DEG;

    st.suspensionAim = true;
    a.input.throttle = 0;
    a.input.steer = 0;
    a.input.brake = true;
    a.input.fire = false;
    a.input.aimPoint.set(
      authoredX + Math.sin(authoredYaw) * Math.cos(targetPitch) * rangeM,
      st.pos.y + 2 + Math.sin(targetPitch) * rangeM,
      authoredZ + Math.cos(authoredYaw) * Math.cos(targetPitch) * rangeM,
    );
    // Six seconds covers the hydraulic rate limit and the slower chassis
    // attitude/support springs at either end of the authored travel range.
    for (let frame = 0; frame < 360; frame++) {
      updateTank(a, hfProxy, SIM_DT);
      // Studio placement remains authoritative while the suspension solver
      // owns vertical seating and attitude.
      st.pos.x = authoredX;
      st.pos.z = authoredZ;
      st.yaw = authoredYaw;
      st.speed = 0;
      st.yawRate = 0;
    }
    // Running-gear conformance is visually damped. Advance it independently
    // after the simulation settles so wheels and track bands reach the same
    // final ground course before a still or recording begins.
    for (let frame = 0; frame < 48; frame++) a.visual.syncFromState(st, SIM_DT);

    const wheels = a.visual.root.getObjectByName('gearRoadWheelTires');
    let minWheelY = Infinity;
    let maxWheelY = -Infinity;
    if (wheels instanceof THREE.InstancedMesh) {
      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      for (let instance = 0; instance < wheels.count; instance++) {
        wheels.getMatrixAt(instance, matrix);
        position.setFromMatrixPosition(matrix);
        minWheelY = Math.min(minWheelY, position.y);
        maxWheelY = Math.max(maxWheelY, position.y);
      }
    }
    a.timelineX = authoredX;
    a.timelineZ = authoredZ;
    a.timelineYaw = authoredYaw;
    invalidate();
    return {
      actor: a.name || a.uid,
      requestedPitchDeg: r2(targetDeg),
      suspensionPitchDeg: r2(st.suspensionAimPitch / DEG),
      renderedPitchDeg: r2(st.visualPitch / DEG),
      terrainPitchDeg: r2(st._terr.pitch / DEG),
      suspensionRockDeg: r2((st._susp?.p || 0) * 2.6 / DEG),
      supportY: r2(st.pos.y),
      wheelStaggerM: Number.isFinite(minWheelY) ? r2(maxWheelY - minWheelY) : 0,
      trackBands: ['gearTrackBandL', 'gearTrackBandR']
        .filter((name) => !!a.visual.root.getObjectByName(name)).length,
    };
  }

  /** Resolve an actor by uid / name / roster index / actor object. */
  function findActor(ref: ActorRef): StudioActor | null {
    if (ref == null) return null;
    if (typeof ref === 'object' && ref.uid) {
      return actors.find((actor) => actor === ref || actor.uid === ref.uid) || null;
    }
    if (typeof ref === 'number') return actors[ref] || null;
    return actors.find((a) => a.uid === ref || a.name === ref) || null;
  }

  // Allocation-free: fx.update invokes this once per active keyed emitter per
  // frame. Studio actor uids are the ids carried by tank:fire events.
  function resolveFxSubject(id: unknown): StudioActor | null {
    for (let i = 0; i < actors.length; i++) {
      if (actors[i].uid === id) return actors[i];
    }
    return null;
  }

  /**
   * Add a tank actor to the stage.
   * @param {object} cfg { id, pos:[x,z]|[x,y,z], facingDeg, turretDeg, gunDeg,
   *   camo, camoSeed, state, stateAgeS, recoilAgeS, name }
   * @returns {object} actor record
   */
  function addActor(cfg: StudioActorInput = {}): StudioActor {
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
      visual.setGroundSampler((x: number, z: number) => hfProxy.getHeightAt(x, z));
    }
    const pos = cfg.pos || [0, 0];
    const x = pos[0] || 0;
    const z = (pos.length >= 3 ? pos[2] : pos[1]) || 0;
    const authoredStateName = cfg.authoredState && ACTOR_STATES.includes(cfg.authoredState)
      ? cfg.authoredState
      : (cfg.state && ACTOR_STATES.includes(cfg.state) ? cfg.state : 'intact');
    const authoredSmoking = cfg.authoredSmoking != null
      ? !!cfg.authoredSmoking
      : !!cfg.smoking;
    const authoredBurning = cfg.authoredBurning != null
      ? !!cfg.authoredBurning
      : !!cfg.burning;
    const a: StudioActor = {
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
      contactGeom: visual.contactGeom ? {
        ...visual.contactGeom,
        endRise: visual.contactGeom.endRise ? { ...visual.contactGeom.endRise } : null,
      } : null,
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
      // Authoring baseline is distinct from the current presentation state.
      // Effects may wreck, smoke, burn, recoil, or detrack the live visual;
      // removing one effect replays the remaining stack from these values.
      authoredStateName,
      authoredStateAgeS: cfg.authoredStateAgeS !== undefined
        ? cfg.authoredStateAgeS
        : (cfg.stateAgeS != null ? cfg.stateAgeS : null),
      authoredSmoking,
      authoredBurning,
      authoredRecoilAgeS: cfg.authoredRecoilAgeS !== undefined
        ? cfg.authoredRecoilAgeS
        : (cfg.recoilAgeS != null ? cfg.recoilAgeS : null),
      // continuous-emitter flags — the enum states set them, but the
      // engine_smoke/burning EFFECTS may also layer them onto wreck states
      smoking: false,
      burning: false,
      timelineX: x,
      timelineZ: z,
      timelineYaw: (cfg.facingDeg || 0) * DEG,
      timelineTrack: null,
    };
    actors.push(a);
    // Scene JSON load stages a complete batch. Rebuilding the rail bindings
    // and DOM actor list after every intermediate actor created redundant
    // layout and traversal work; load() performs each once after the batch.
    if (!loading) bindStoryboardTracks();
    actorRoots.push(visual.root);
    actorByRoot.set(visual.root, a);
    if (a.camo && a.camo !== 'inherit') {
      setCamoOverride(specId, a.camo);
    }
    // A shared texture may have been cached for the garage biome. Resolve the
    // one visible spec now; never sweep unrelated cached vehicles.
    applyCamoPatterns(specId);
    settleActor(a);
    applyActorState(a, authoredStateName, a.authoredStateAgeS);
    if (authoredSmoking) a.smoking = true;   // additive layer over any mesh state
    if (authoredBurning && !a.burning) igniteColumn(a);
    if (a.authoredRecoilAgeS != null && visual.recoilKick) {
      visual.recoilKick(a.authoredRecoilAgeS);
      visual.syncFromState(a.state, 0);
    }
    if (!loading) {
      panel.refreshActors();
      invalidate();
    }
    return a;
  }

  function removeActor(ref: ActorRef, opts: RemoveActorOptions = {}): boolean {
    const a = findActor(ref);
    if (!a) return false;
    const actorKey = actorRefOut(a);
    const hadEffects = effectLog.length > 0;
    for (let i = effectLog.length - 1; i >= 0; i--) {
      const effectActor = findActor(effectLog[i].actor);
      if (effectActor === a) effectLog.splice(i, 1);
    }
    if (selectedEffect && !effectLog.includes(selectedEffect)) selectedEffect = null;
    fxBus.emit('tank:fire', { id: a.uid, burning: false }); // drop its column
    scene.remove(a.visual.root);
    a.visual.dispose();
    const rootIndex = actorRoots.indexOf(a.visual.root);
    if (rootIndex >= 0) actorRoots.splice(rootIndex, 1);
    actors.splice(actors.indexOf(a), 1);
    storyboard = clearStoryboardActorTrack(storyboard, actorKey);
    bindStoryboardTracks();
    if (selected === a) selected = null;
    if (hadEffects && opts.rebuild !== false) rebuildEffects(clockMs);
    panel.refreshActors();
    panel.refreshEffects();
    panel.refreshStoryboard();
    invalidate();
    return true;
  }

  function clearActors() {
    effectLog.length = 0;
    effectUidSeq = 1;
    selectedEffect = null;
    while (actors.length) removeActor(actors[actors.length - 1], { rebuild: false });
    uidSeq = 1;
    storyboard = normalizeStoryboard({ ...storyboard, actorTracks: [] });
    resetFxRuntime(sceneMeta.seed || 5000);
    panel.setSelectedEffect(null);
  }

  /**
   * Apply a damage/state look. States are the killcam/destruction systems'
   * real visual language (tankFactory setDestroyed burn sweep + turret pop,
   * effects.ts smoke columns).
   * @param {object|string} ref actor
   * @param {string} stateName ACTOR_STATES id
   * @param {?number} [ageS] wreck age override (char/settle progress)
   */
  function applyActorState(a: StudioActor, stateName: string, ageS: number | null = null): boolean {
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
    invalidate();
    return true;
  }

  /** Change the actor's authored baseline, then re-apply the effect stack. */
  function setActorState(ref: ActorRef, stateName: string, ageS: number | null = null): boolean {
    const a = findActor(ref);
    if (!a || !ACTOR_STATES.includes(stateName)) return false;
    a.authoredStateName = stateName;
    a.authoredStateAgeS = ageS;
    if (effectLog.length) rebuildEffects();
    else applyActorState(a, stateName, ageS);
    return true;
  }

  /** Light the keyed fire/smoke column the live game uses for burning tanks. */
  function igniteColumn(a: StudioActor): void {
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

  function updateActor(ref: ActorRef, patch: StudioActorPatch = {}): StudioActor | null {
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
    if (patch.name !== undefined) bindStoryboardTracks();
    if (patch.camo !== undefined) {
      a.camo = patch.camo || null;
      if (a.camo) {
        setCamoOverride(a.specId, a.camo);
        applyCamoPatterns(a.specId);
      }
    }
    settleActor(a, patch._drag ? SETTLE_STEPS_DRAG : SETTLE_STEPS);
    if (patch.state && ACTOR_STATES.includes(patch.state)) {
      a.authoredStateName = patch.state;
      a.authoredStateAgeS = patch.stateAgeS ?? a.authoredStateAgeS;
      if (!effectLog.length) applyActorState(a, a.authoredStateName, a.authoredStateAgeS);
    }
    if (patch.recoilAgeS !== undefined) {
      a.recoilAgeS = patch.recoilAgeS;
      a.authoredRecoilAgeS = patch.recoilAgeS;
      if (a.recoilAgeS != null && a.visual.recoilKick) {
        a.visual.recoilKick(a.recoilAgeS);
        a.visual.syncFromState(a.state, 0);
      }
    }
    if (effectLog.length && !patch._drag) rebuildEffects(clockMs);
    invalidate();
    return a;
  }

  // --- selection / mouse ------------------------------------------------------
  let selected: StudioActor | null = null;
  function selectActor(ref: ActorRef): StudioActor | null {
    selected = findActor(ref);
    if (selected && selectedEffect) {
      selectedEffect = null;
      panel.setSelectedEffect(null);
    }
    panel.setSelected(selected);
    return selected;
  }

  function pointerNdc(e: PointerEvent): THREE.Vector2 {
    const r = renderer.domElement.getBoundingClientRect();
    _ndc.set(
      ((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1,
      -((e.clientY - r.top) / Math.max(1, r.height)) * 2 + 1,
    );
    return _ndc;
  }

  function terrainHit(e: PointerEvent, out: THREE.Vector3): THREE.Vector3 | null {
    const w = getWorld();
    if (!w) return null;
    _ray.setFromCamera(pointerNdc(e), camera);
    const hit = w.raycast(_ray.ray.origin, _ray.ray.direction, 3000);
    if (!hit) return null;
    out.copy(hit.point);
    return out;
  }

  function pickActor(e: PointerEvent): StudioActor | null {
    if (!actors.length) return null;
    _ray.setFromCamera(pointerNdc(e), camera);
    _ray.far = 3000;
    pickHits.length = 0;
    _ray.intersectObjects(actorRoots, true, pickHits);
    if (!pickHits.length) return null;
    let o: THREE.Object3D | null = pickHits[0].object;
    while (o) {
      const a = actorByRoot.get(o);
      if (a) return a;
      o = o.parent;
    }
    return null;
  }

  function onPointerDown(e: PointerEvent): void {
    if (!active || e.target !== renderer.domElement) return;
    if (recording) return;
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

  function onPointerMove(e: PointerEvent): void {
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
    cameraDirty = true;
    if (cam.mode === 'orbit') orbitApply();
    else applyCameraPose();
  }

  function onPointerUp(e: PointerEvent): void {
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

  function onWheel(e: WheelEvent): void {
    if (!active || e.target !== renderer.domElement) return;
    e.preventDefault();
    const k = e.deltaY < 0 ? 1 : -1;
    if (cam.mode === 'orbit') {
      cam.orbit.dist = Math.max(3, Math.min(400, cam.orbit.dist * (1 - k * 0.12)));
      cameraDirty = true;
      orbitApply();
    } else {
      camera.getWorldDirection(_fwd);
      camera.position.addScaledVector(_fwd, k * Math.max(2, cam.speed * 0.35));
      invalidate();
    }
  }

  function typingInUI(e: KeyboardEvent): boolean {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return false;
    return t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' ||
      t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.code === 'F8' && !e.repeat) {
      if (active) { exit(); e.preventDefault(); return; }
      if (game.phase === 'garage') {
        enter().catch((err: unknown) => console.error('[studio] enter failed', err));
        e.preventDefault();
      }
      return;
    }
    if (!active || typingInUI(e)) return;
    if (e.code === 'Escape') { exit(); return; }
    keys.add(e.code);
    if (e.code === 'Space' && !e.repeat) api.setTimeScale(timeScale === 0 ? 1 : 0);
    if (e.code === 'Delete' || e.code === 'Backspace') {
      if (selectedEffect) removeEffect(selectedEffect);
      else if (selected) removeActor(selected);
    }
  }
  function onKeyUp(e: KeyboardEvent): void { keys.delete(e.code); }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('pointermove', onPointerMove, true);
  window.addEventListener('pointerup', onPointerUp, true);
  window.addEventListener('wheel', onWheel, { passive: false, capture: true });
  window.addEventListener('blur', () => keys.clear());
  window.addEventListener('resize', invalidate, { passive: true });

  // --- effects ---------------------------------------------------------------
  /** Resolve an effect anchor to a world position (actor anchors are live). */
  function effectPos(
    e: StudioEffectInput | StudioEffectRecord,
    out: THREE.Vector3,
  ): { a: StudioActor | null; pos: THREE.Vector3 } {
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

  function reserveEffectId(id: unknown): void {
    const m = /^fx(\d+)$/.exec(String(id || ''));
    if (m) effectUidSeq = Math.max(effectUidSeq, Number(m[1]) + 1);
  }

  function makeEffectRecord(
    e: StudioEffectInput | StudioEffectRecord,
    tMs = clockMs,
  ): StudioEffectRecord {
    const id = e.id || `fx${effectUidSeq++}`;
    reserveEffectId(id);
    return {
      id,
      type: e.type,
      ...(e.actor != null ? { actor: actorRefOut(e.actor) } : {}),
      ...(e.hFrac != null ? { hFrac: e.hFrac } : {}),
      ...(Array.isArray(e.at) ? { at: [...e.at] } : {}),
      ...(Array.isArray(e.from) ? { from: [...e.from] } : {}),
      ...(Array.isArray(e.to) ? { to: [...e.to] } : {}),
      params: { ...(e.params || {}) },
      tMs: clampStudioTime(tMs, storyboard.durationMs),
    };
  }

  /**
   * Fire one effect NOW (records it on the effect log at the current studio
   * clock so state()/load() round-trip). See docs/STUDIO.md for the schema.
   * @param {object} e {type, actor|at, params}
   * @returns {boolean} fired
   */
  function fireEffect(
    e: StudioEffectInput | StudioEffectRecord,
    opts: EffectFireOptions = {},
  ): boolean {
    if (recording && opts.record !== false) return false;
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
        const slot = Math.max(0, Math.min(a.spec.gun.shells.length - 1, (params.slot ?? 0) | 0));
        const shellSpec = a.spec.gun.shells[slot];
        // §5.362: kick BEFORE sampling the flash origin — twin-plant ids
        // (spec.gun.muzzles) alternate per fire event, and the returned
        // barrel index places the flash on the firing tip. Single-bore
        // actors: index is null and the sample is the legacy center anchor.
        let muzzleIndex = null;
        if (params.recoil !== false && a.visual.recoilKick) {
          muzzleIndex = a.visual.recoilKick(0);
          a.visual.syncFromState(a.state, 0);
        }
        a.visual.gunMuzzleWorld(_v2, muzzleIndex != null ? muzzleIndex : undefined);
        a.visual.gunDirWorld(_v3);
        const shellId = -(uidSeq * 100000 + shells.length + 1);
        fxBus.emit('shell:fired', {
          shellId, shooterId: a.uid, isPlayer: false,
          shellType: shellSpec.type, shellName: shellSpec.name,
          weaponSound: shellSpec.soundProfile || a.spec.gun.soundProfile || null,
          caliberMm: shellSpec.caliberMm,
          muzzlePos: [_v2.x, _v2.y, _v2.z], dir: [_v3.x, _v3.y, _v3.z],
        });
        if (params.tracer !== false) {
          shells.push(createShell(shellSpec, a.uid, false, _v2, _v3, shellId));
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
        const shellId = -(uidSeq * 100000 + shells.length + 1);
        const shell: StudioShell = createShell(
          spec,
          'studio',
          !!params.isPlayer,
          _v2,
          _v3,
          shellId,
        );
        shell._studioMaxDistM = _v2.distanceTo(_v1.set(to[0], to[1], to[2]));
        shells.push(shell);
        break;
      }
      case 'impact': {
        _v2.set(params.normal ? params.normal[0] : 0,
          params.normal ? params.normal[1] : 1,
          params.normal ? params.normal[2] : 0).normalize();
        fxBus.emit('shell:hit', {
          shellId: null,
          targetId: a ? a.uid : null,
          kind: params.kind || 'pen',
          caliberMm: params.caliberMm || 120,
          damage: 0,
          pos: [pos.x, pos.y, pos.z],
          normal: [_v2.x, _v2.y, _v2.z],
        });
        break;
      }
      case 'sparks': {
        _v2.set(0, 1, 0);
        fxBus.emit('shell:hit', {
          shellId: null,
          targetId: a ? a.uid : null,
          kind: params.kind || 'ricochet',
          caliberMm: params.caliberMm || 100,
          damage: 0,
          pos: [pos.x, pos.y, pos.z],
          normal: [_v2.x, _v2.y, _v2.z],
        });
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
        else if (a.stateName === 'engine-smoking' && !a.smoking) a.stateName = 'intact';
        if (a.smoking) {
          _fwd.set(Math.sin(a.state.yaw), 0, Math.cos(a.state.yaw));
          _v2.copy(a.state.pos).addScaledVector(_fwd, -a.spec.dims.hullLengthM * 0.42);
          _v2.y += a.spec.dims.heightM * 0.72;
          // The continuous emitter normally starts on the next FX tick. Seed
          // it with the same real exhaust recipe so a frozen Studio button
          // click has immediate, selectable visual feedback.
          for (let i = 0; i < 8; i++) fx.exhaust(_v2, 1, true);
        }
        panel.refreshActors();
        break;
      }
      case 'burning': {
        // ADDITIVE: fire/smoke column onto any mesh state
        if (!a) { ok = false; break; }
        if (params.off) {
          a.burning = false;
          fxBus.emit('tank:fire', { id: a.uid, burning: false });
          if (a.stateName === 'burning') a.stateName = 'intact';
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
        // §5.362: twin-plant ids compose the flash on the firing barrel's
        // (recoiled) tip — recoilKick returns the alternated index.
        let fmIndex = null;
        if (a.visual.recoilKick) fmIndex = a.visual.recoilKick(params.ageS != null ? params.ageS : 0.05);
        a.visual.syncFromState(a.state, 0);
        a.visual.gunMuzzleWorld(_v2, fmIndex != null ? fmIndex : undefined);
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
          const shell = createShell(spec, a.uid, false, from, dir,
            -(uidSeq * 100000 + shells.length + 1));
          shell.distM = 2 + i * gapM;
          shells.push(shell);
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
      if (opts.record !== false) {
        const record = makeEffectRecord(e, opts.tMs != null ? opts.tMs : clockMs);
        effectLog.push(record);
        activeEffectIds.add(record.id);
        if (effectLog.length > MAX_STUDIO_EFFECTS) {
          effectLog.shift();
          rebuildEffects(clockMs);
        }
        selectedEffect = record;
        if (opts.refresh !== false) panel.setSelectedEffect(record);
      } else if (e.id) {
        activeEffectIds.add(e.id);
      }
      if (w) w.setWindTime(0.35 + clockMs / 1000);
      invalidate();
    }
    return ok;
  }

  function actorRefOut(ref: ActorRef): string | number | null {
    const a = findActor(ref);
    if (a) return a.name || a.uid;
    if (typeof ref === 'string' || typeof ref === 'number') return ref;
    return ref?.uid || null;
  }

  function findEffect(ref: EffectRef): StudioEffectRecord | null {
    if (ref == null) return null;
    if (typeof ref === 'object') return effectLog.includes(ref) ? ref : null;
    if (typeof ref === 'number') return effectLog[ref] || null;
    return effectLog.find((effect) => effect.id === ref) || null;
  }

  function listEffects() {
    return effectLog.map((effect, index) => ({
      ...effect,
      index,
      selected: effect === selectedEffect,
      params: { ...effect.params },
    }));
  }

  function selectEffect(ref: EffectRef): string | null {
    selectedEffect = findEffect(ref);
    panel.setSelectedEffect(selectedEffect);
    invalidate();
    return selectedEffect ? selectedEffect.id : null;
  }

  function removeEffect(ref: EffectRef): boolean {
    if (recording) return false;
    const effect = findEffect(ref);
    if (!effect) return false;
    const index = effectLog.indexOf(effect);
    effectLog.splice(index, 1);
    if (selectedEffect === effect) selectedEffect = null;
    rebuildEffects(clockMs);
    panel.setSelectedEffect(selectedEffect);
    return true;
  }

  function updateEffect(
    ref: EffectRef,
    patch: { tMs?: number; params?: StudioEffectParams } = {},
  ) {
    if (recording) return null;
    const effect = findEffect(ref);
    if (!effect) return null;
    if (patch.tMs != null) effect.tMs = clampStudioTime(patch.tMs, storyboard.durationMs);
    if (patch.params) effect.params = { ...effect.params, ...patch.params };
    rebuildEffects(clockMs);
    panel.refreshEffects();
    panel.refreshStoryboard();
    return listEffects().find((item) => item.id === effect.id) || null;
  }

  // --- timeline ---------------------------------------------------------------
  /**
   * Advance the fx timeline by one dt: studio shells fly (terrain impacts
   * resolve through the real event path), per-actor continuous emitters run
   * (engine smoke, burning refresh), then the fx system ages by dt. dt=0
   * still refreshes tracer ribbons/lights so frozen frames render correctly.
   * @param {number} dt seconds (already time-scaled)
   */
  function stepFx(dt: number): void {
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
        } else if (sh._studioMaxDistM != null && sh.distM >= sh._studioMaxDistM) {
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
    fx.update(dt, shells, camera, resolveFxSubject);
  }

  /**
   * Deterministically advance the fx timeline by `ms` in fixed 1/60 steps
   * (same cadence live play emits at), syncing actor visual timelines along
   * the way, then hold. Used by load() and the panel's STEP buttons.
   * @param {number} ms milliseconds of fx time
   */
  function advanceFx(ms: number): void {
    let remainingS = Math.max(0, ms / 1000);
    while (remainingS > 1e-7) {
      const dt = Math.min(FX_STEP_S, remainingS);
      applyStoryboardActors(clockMs + dt * 1000, dt);
      stepFx(dt);
      for (const a of actors) a.visual.syncFromState(a.state, dt);
      remainingS -= dt;
    }
    applyStoryboardCamera(clockMs);
    invalidate();
  }

  function resetFxRuntime(seed = sceneMeta.seed || 5000) {
    ensureFxBus();
    shells.length = 0;
    fx.resetAll();
    fx.resetSeed(seed);
    fx.setFrozen(false);
    clockMs = 0;
    activeEffectIds.clear();
    const w = getWorld();
    if (w) w.setWindTime(0.35);
  }

  function restoreAuthoredActor(a: StudioActor): void {
    a.visual.resetDestroyed(); // also repairs tracks and clears recoil/flinch
    a.stateAgeS = a.authoredStateAgeS;
    a.recoilAgeS = a.authoredRecoilAgeS;
    applyActorState(a, a.authoredStateName, a.authoredStateAgeS);
    if (a.authoredSmoking) a.smoking = true;
    if (a.authoredBurning && !a.burning) igniteColumn(a);
    if (a.authoredRecoilAgeS != null && a.visual.recoilKick) {
      a.visual.recoilKick(a.authoredRecoilAgeS);
      a.visual.syncFromState(a.state, 0);
    }
  }

  /** Rebuild every pooled effect from the authored stack at the current time. */
  function rebuildEffects(targetMs = clockMs): void {
    const target = clampStudioTime(targetMs, storyboard.durationMs);
    const savedScale = timeScale;
    resetFxRuntime(sceneMeta.seed || 5000);
    for (const a of actors) {
      settleActor(a);
      restoreAuthoredActor(a);
    }
    applyStoryboardActors(0, 0);
    const ordered = effectLog
      .map((effect, index) => ({ effect, index }))
      .sort((a, b) => a.effect.tMs - b.effect.tMs || a.index - b.index);
    let t = 0;
    for (const item of ordered) {
      const e = item.effect;
      if (e.tMs > target) continue;
      advanceFx(e.tMs - t);
      t = e.tMs;
      fireEffect(e, { record: false, refresh: false });
    }
    advanceFx(target - t);
    clockMs = target;
    timeScale = savedScale;
    applyStoryboardFrame(target, 0);
    const w = getWorld();
    if (w) w.setWindTime(0.35 + target / 1000);
    panel.refreshAll();
    invalidate();
  }

  /** Reset the authored FX stack and restore every actor to its baseline. */
  function resetFx(seed = sceneMeta.seed || 5000) {
    effectLog.length = 0;
    effectUidSeq = 1;
    selectedEffect = null;
    resetFxRuntime(seed);
    for (const a of actors) restoreAuthoredActor(a);
    panel.setSelectedEffect(null);
    invalidate();
  }

  function seekTimeline(timeMs: number, opts: SeekOptions = {}): number {
    if (recording && !opts.recording) return Math.round(clockMs);
    const target = clampStudioTime(timeMs, storyboard.durationMs);
    if (opts.pause !== false) timeScale = 0;
    rebuildEffects(target);
    panel.refreshAll();
    return Math.round(clockMs);
  }

  function nextPendingEffect(targetMs: number): StudioEffectRecord | null {
    let next: StudioEffectRecord | null = null;
    for (const effect of effectLog) {
      if (activeEffectIds.has(effect.id)) continue;
      if (effect.tMs < clockMs - 0.01 || effect.tMs > targetMs + 0.01) continue;
      if (!next || effect.tMs < next.tMs) next = effect;
    }
    return next;
  }

  function advanceTimeline(ms: number): number {
    const target = clampStudioTime(clockMs + Math.max(0, ms), storyboard.durationMs);
    let due = nextPendingEffect(target);
    while (due) {
      advanceFx(Math.max(0, due.tMs - clockMs));
      applyStoryboardActors(due.tMs, 0);
      fireEffect(due, { record: false, refresh: false });
      due = nextPendingEffect(target);
    }
    advanceFx(Math.max(0, target - clockMs));
    clockMs = target;
    applyStoryboardFrame(target, 0);
    if (clockMs >= storyboard.durationMs) timeScale = 0;
    return Math.round(clockMs);
  }

  function playTimeline() {
    if (clockMs >= storyboard.durationMs - 0.5) seekTimeline(0, { pause: false });
    timeScale = 1;
    rail.updateVisibility();
    panel.refreshTime();
    invalidate();
    return true;
  }

  function pauseTimeline() {
    if (recording) return Math.round(clockMs);
    timeScale = 0;
    rail.updateVisibility();
    panel.refreshTime();
    invalidate();
    return Math.round(clockMs);
  }

  function stopTimeline() {
    if (recording) stopRecording();
    return seekTimeline(0);
  }

  // --- camera API --------------------------------------------------------------
  function applyCamera(cfg: CameraConfig = {}): void {
    if (cfg.mode === 'orbit' || cfg.mode === 'fly') cam.mode = cfg.mode;
    // groundRel: y values are heights ABOVE the terrain at their x/z — the
    // ergonomic form for scripted shoots (dunes/hills vary per map)
    const gy = (x: number, z: number, y: number): number => (
      cfg.groundRel ? hfProxy.getHeightAt(x, z) + y : y
    );
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

  // --- cinematic storyboard -------------------------------------------------
  function actorTrackFor(a: StudioActor): ActorTrack | null {
    return a.timelineTrack;
  }

  function bindStoryboardTracks() {
    for (const a of actors) a.timelineTrack = null;
    for (const track of storyboard.actorTracks) {
      const a = findActor(track.actor);
      if (a) a.timelineTrack = track;
    }
  }

  function applyStoryboardCamera(timeMs: number): boolean {
    if (!sampleCameraRail(storyboard.shots, timeMs, _cameraSample)) return false;
    camera.position.set(_cameraSample.x, _cameraSample.y, _cameraSample.z);
    cam.mode = 'fly';
    cam.fov = _cameraSample.fov;
    cam.roll = _cameraSample.rollDeg * DEG;
    _v2.set(_cameraSample.lookX, _cameraSample.lookY, _cameraSample.lookZ);
    lookAt(_v2);
    return true;
  }

  function applyStoryboardActors(timeMs: number, dt = 0): void {
    for (const a of actors) {
      const track = actorTrackFor(a);
      if (!track || !sampleActorTrack(track.keys, timeMs, _actorSample)) continue;
      const st = a.state;
      const yaw = _actorSample.facingDeg * DEG;
      const dx = _actorSample.x - a.timelineX;
      const dz = _actorSample.z - a.timelineZ;
      const dyaw = Math.atan2(Math.sin(yaw - a.timelineYaw), Math.cos(yaw - a.timelineYaw));
      if (dt > 0) {
        const forwardX = Math.sin(yaw);
        const forwardZ = Math.cos(yaw);
        const signedDist = dx * forwardX + dz * forwardZ;
        st.speed = signedDist / dt;
        st.yawRate = dyaw / dt;
        st.trackScroll.l += signedDist + dyaw * 1.5;
        st.trackScroll.r += signedDist - dyaw * 1.5;
      } else {
        st.speed = 0;
        st.yawRate = 0;
      }
      a.timelineX = _actorSample.x;
      a.timelineZ = _actorSample.z;
      a.timelineYaw = yaw;
      st.pos.x = _actorSample.x;
      st.pos.z = _actorSample.z;
      resetTankVerticalState(st, hfProxy.getHeightAt(st.pos.x, st.pos.z));
      st.yaw = yaw;
      st.turretYaw = _actorSample.turretDeg * DEG;
      st.gunPitch = clampGunDeg(a.spec, _actorSample.gunDeg) * DEG;

      // Four cheap height samples keep cinematic tracks seated on rolling
      // terrain without invoking the full authoritative movement solver on
      // every rendered frame.
      const halfL = Math.max(1, (a.spec.dims.hullLengthM || 6) * 0.38);
      const halfW = Math.max(0.7, (a.spec.dims.widthM || 3) * 0.4);
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      const rx = Math.cos(yaw);
      const rz = -Math.sin(yaw);
      const frontH = hfProxy.getHeightAt(st.pos.x + fx * halfL, st.pos.z + fz * halfL);
      const rearH = hfProxy.getHeightAt(st.pos.x - fx * halfL, st.pos.z - fz * halfL);
      const rightH = hfProxy.getHeightAt(st.pos.x + rx * halfW, st.pos.z + rz * halfW);
      const leftH = hfProxy.getHeightAt(st.pos.x - rx * halfW, st.pos.z - rz * halfW);
      st.visualPitch = Math.atan2(frontH - rearH, halfL * 2);
      st.visualRoll = Math.atan2(rightH - leftH, halfW * 2);
    }
  }

  function applyStoryboardFrame(timeMs: number, dt = 0): void {
    applyStoryboardActors(timeMs, dt);
    applyStoryboardCamera(timeMs);
    rail.updateVisibility();
    invalidate();
  }

  function getStoryboard() {
    return normalizeStoryboard(storyboard);
  }

  function setStoryboard(next: StoryboardInput = {}): Storyboard {
    if (recording) return getStoryboard();
    storyboard = normalizeStoryboard(next);
    bindStoryboardTracks();
    for (const effect of effectLog) {
      effect.tMs = clampStudioTime(effect.tMs, storyboard.durationMs);
    }
    if (clockMs > storyboard.durationMs) clockMs = storyboard.durationMs;
    selectedShotId = storyboard.shots.some((shot) => shot.id === selectedShotId)
      ? selectedShotId
      : (storyboard.shots[0]?.id || null);
    for (const shot of storyboard.shots) {
      const match = /(?:shot-)(\d+)$/.exec(shot.id);
      if (match) shotUidSeq = Math.max(shotUidSeq, Number(match[1]) + 1);
    }
    rail.rebuild();
    panel.refreshStoryboard();
    invalidate();
    return getStoryboard();
  }

  function setStoryboardDuration(durationMs: number): number {
    if (recording) return storyboard.durationMs;
    const previousTime = clockMs;
    const next = setStoryboard({ ...storyboard, durationMs });
    if (previousTime > next.durationMs) seekTimeline(next.durationMs);
    else rebuildEffects(previousTime);
    return next.durationMs;
  }

  function addCameraShot(cfg: CameraShotInput = {}) {
    if (recording) return null;
    const live = getCamera();
    const tMs = clampStudioTime(cfg.tMs != null ? cfg.tMs : clockMs, storyboard.durationMs);
    const existing = storyboard.shots.find((shot) => shot.tMs === tMs);
    const requestedId = String(cfg.id || '').trim();
    const id = requestedId || existing?.id || `shot-${shotUidSeq++}`;
    storyboard = upsertCameraShot(storyboard, {
      id,
      label: cfg.label || existing?.label || `Shot ${storyboard.shots.length + 1}`,
      tMs,
      pos: cfg.pos || live.pos,
      lookAt: cfg.lookAt || live.lookAt,
      fov: cfg.fov != null ? cfg.fov : live.fov,
      rollDeg: cfg.rollDeg != null ? cfg.rollDeg : live.rollDeg,
      transition: cfg.transition || existing?.transition || 'smooth',
    });
    selectedShotId = id;
    rail.rebuild();
    panel.refreshStoryboard();
    return storyboard.shots.find((shot) => shot.id === id) || null;
  }

  function updateCameraShot(ref: unknown, patch: CameraShotInput = {}) {
    if (recording) return null;
    const id = String(ref || '');
    const shot = storyboard.shots.find((item) => item.id === id);
    if (!shot) return null;
    storyboard = upsertCameraShot(storyboard, { ...shot, ...patch, id });
    selectedShotId = id;
    rail.rebuild();
    panel.refreshStoryboard();
    return storyboard.shots.find((item) => item.id === id) || null;
  }

  function removeCameraShot(ref: unknown): boolean {
    if (recording) return false;
    const id = String(ref || '');
    if (!storyboard.shots.some((shot) => shot.id === id)) return false;
    storyboard = removeStoryboardShot(storyboard, id);
    selectedShotId = storyboard.shots[0]?.id || null;
    rail.rebuild();
    panel.refreshStoryboard();
    return true;
  }

  function selectCameraShot(ref: unknown, seek = true): string | null {
    const shot = storyboard.shots.find((item) => item.id === String(ref || ''));
    if (!shot) return null;
    selectedShotId = shot.id;
    if (seek) seekTimeline(shot.tMs);
    panel.refreshStoryboard();
    return shot.id;
  }

  function keyActor(ref: ActorRef, cfg: ActorKeyInput = {}) {
    if (recording) return null;
    const a = findActor(ref);
    if (!a) return null;
    const actor = String(a.name || a.uid);
    const tMs = clampStudioTime(cfg.tMs != null ? cfg.tMs : clockMs, storyboard.durationMs);
    const track = storyboard.actorTracks.find((item) => item.actor === actor);
    const existing = track?.keys.find((key) => key.tMs === tMs);
    const id = cfg.id || existing?.id || `key-${actorKeyUidSeq++}`;
    storyboard = upsertActorKey(storyboard, actor, {
      id,
      tMs,
      pos: cfg.pos || [a.state.pos.x, a.state.pos.z],
      facingDeg: cfg.facingDeg != null ? cfg.facingDeg : a.state.yaw / DEG,
      turretDeg: cfg.turretDeg != null ? cfg.turretDeg : a.state.turretYaw / DEG,
      gunDeg: cfg.gunDeg != null ? cfg.gunDeg : a.state.gunPitch / DEG,
      transition: cfg.transition || existing?.transition || 'smooth',
    });
    bindStoryboardTracks();
    panel.refreshStoryboard();
    invalidate();
    return storyboard.actorTracks.find((item) => item.actor === actor)
      ?.keys.find((key) => key.id === id) || null;
  }

  function clearActorTrack(ref: ActorRef): boolean {
    if (recording) return false;
    const a = findActor(ref);
    const actor = a ? String(a.name || a.uid) : String(ref || '');
    const before = storyboard.actorTracks.length;
    storyboard = clearStoryboardActorTrack(storyboard, actor);
    bindStoryboardTracks();
    panel.refreshStoryboard();
    invalidate();
    return storyboard.actorTracks.length !== before;
  }

  function setRailVisible(visible: boolean): boolean {
    railVisible = !!visible;
    rail.updateVisibility();
    panel.refreshStoryboard();
    invalidate();
    return railVisible;
  }

  function bearingDeg(fromX: number, fromZ: number, toX: number, toZ: number): number {
    return Math.atan2(toX - fromX, toZ - fromZ) / DEG;
  }

  /** Build an immediately recordable 12-second battle from the first two actors. */
  function directDuel() {
    if (recording) throw new Error('Stop recording before replacing the storyboard');
    if (actors.length < 2) throw new Error('Direct Duel needs at least two staged tanks');
    const alpha = actors[0];
    const bravo = actors[1];
    const ax = alpha.pose.x; const az = alpha.pose.z;
    const bx = bravo.pose.x; const bz = bravo.pose.z;
    const dx = bx - ax; const dz = bz - az;
    const distance = Math.max(1, Math.hypot(dx, dz));
    const ux = dx / distance; const uz = dz / distance;
    const px = uz; const pz = -ux;
    const move = Math.min(8, Math.max(3, distance * 0.14));
    const a1x = ax + ux * move; const a1z = az + uz * move;
    const b1x = bx - ux * move; const b1z = bz - uz * move;
    const midX = (a1x + b1x) * 0.5; const midZ = (a1z + b1z) * 0.5;
    const midY = hfProxy.getHeightAt(midX, midZ) + 2.2;
    const alphaFacing = bearingDeg(ax, az, bx, bz);
    const bravoFacing = bearingDeg(bx, bz, ax, az);
    const cameraAt = (x: number, z: number, height: number): [number, number, number] => (
      [x, hfProxy.getHeightAt(x, z) + height, z]
    );
    const alphaRef = String(alpha.name || alpha.uid);
    const bravoRef = String(bravo.name || bravo.uid);

    storyboard = normalizeStoryboard({
      durationMs: 12000,
      shots: [
        { id: 'duel-wide', label: 'Establishing', tMs: 0,
          pos: cameraAt(midX + px * 34 - ux * 8, midZ + pz * 34 - uz * 8, 8),
          lookAt: [midX, midY, midZ], fov: 48, transition: 'smooth' },
        { id: 'duel-alpha', label: 'Alpha fires', tMs: 3500,
          pos: cameraAt(a1x - ux * 15 + px * 5, a1z - uz * 15 + pz * 5, 4.2),
          lookAt: [midX + ux * 4, midY, midZ + uz * 4], fov: 39, transition: 'cut' },
        { id: 'duel-cross', label: 'Return fire', tMs: 6200,
          pos: cameraAt(midX - px * 25, midZ - pz * 25, 5.8),
          lookAt: [midX, midY, midZ], fov: 42, transition: 'smooth' },
        { id: 'duel-impact', label: 'Knockout', tMs: 8200,
          pos: cameraAt(b1x + px * 15 - ux * 5, b1z + pz * 15 - uz * 5, 3.3),
          lookAt: [b1x, hfProxy.getHeightAt(b1x, b1z) + 1.8, b1z], fov: 34, transition: 'cut' },
        { id: 'duel-end', label: 'Aftermath', tMs: 12000,
          pos: cameraAt(midX + px * 22 + ux * 7, midZ + pz * 22 + uz * 7, 6.5),
          lookAt: [midX, midY, midZ], fov: 44, transition: 'smooth' },
      ],
      actorTracks: [
        { actor: alphaRef, keys: [
          { id: 'duel-a0', tMs: 0, pos: [ax, az], facingDeg: alphaFacing, turretDeg: 0, gunDeg: 0 },
          { id: 'duel-a1', tMs: 5200, pos: [a1x, a1z], facingDeg: alphaFacing, turretDeg: 0, gunDeg: 0 },
          { id: 'duel-a2', tMs: 12000, pos: [a1x, a1z], facingDeg: alphaFacing, turretDeg: 0, gunDeg: 0 },
        ] },
        { actor: bravoRef, keys: [
          { id: 'duel-b0', tMs: 0, pos: [bx, bz], facingDeg: bravoFacing, turretDeg: 0, gunDeg: 0 },
          { id: 'duel-b1', tMs: 5800, pos: [b1x, b1z], facingDeg: bravoFacing, turretDeg: 0, gunDeg: 0 },
          { id: 'duel-b2', tMs: 12000, pos: [b1x, b1z], facingDeg: bravoFacing, turretDeg: 0, gunDeg: 0 },
        ] },
      ],
    });
    bindStoryboardTracks();
    selectedShotId = storyboard.shots[0].id;
    resetFx();
    const authored = [
      { type: 'dust', actor: alphaRef, tMs: 1100, params: { count: 10, intensity: 0.8 } },
      { type: 'dust', actor: bravoRef, tMs: 1700, params: { count: 10, intensity: 0.8, dirDeg: 180 } },
      { type: 'fire', actor: alphaRef, tMs: 4050, params: { slot: 0, tracer: true, recoil: true } },
      { type: 'fire', actor: bravoRef, tMs: 6250, params: { slot: 0, tracer: true, recoil: true } },
      { type: 'fire', actor: alphaRef, tMs: 8120, params: { slot: 0, tracer: true, recoil: true } },
      { type: 'tank_kill', actor: bravoRef, tMs: 8450, params: { cause: 'ammorack', pop: true } },
    ];
    for (const effect of authored) effectLog.push(makeEffectRecord(effect, effect.tMs));
    rail.rebuild();
    seekTimeline(0);
    panel.refreshAll();
    return getStoryboard();
  }
  const r2 = (v: number): number => Math.round(v * 100) / 100;

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
  function capture(opts: CaptureOptions = {}) {
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
    let dataURL = '';
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
      const world = getWorld();
      link.download = opts.name ||
        `studio_${world?.mapId || 'map'}_${Date.now()}.png`;
      link.click();
    }
    return { dataURL, width: W, height: H };
  }

  function videoMimeType(): string {
    if (typeof MediaRecorder === 'undefined') return '';
    const candidates = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4',
    ];
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
  }

  /**
   * Record the live Studio canvas while the cinematic timeline plays once.
   * The storyboard duration is always clamped to 20 seconds by its schema.
   */
  function recordVideo(opts: VideoOptions = {}): Promise<VideoResult> {
    if (recording) return recording.promise;
    if (typeof MediaRecorder === 'undefined' || !renderer.domElement.captureStream) {
      return Promise.reject(new Error('This browser does not support Studio video recording'));
    }
    const fps = Math.max(24, Math.min(60, Math.round(opts.fps || 60)));
    const mimeType = opts.mimeType || videoMimeType();
    const stream = renderer.domElement.captureStream(fps);
    const recorderOptions = {
      videoBitsPerSecond: Math.max(2_000_000, Math.min(30_000_000,
        Math.round(opts.videoBitsPerSecond || 12_000_000))),
      ...(mimeType ? { mimeType } : {}),
    };
    let mediaRecorder: MediaRecorder;
    try {
      mediaRecorder = new MediaRecorder(stream, recorderOptions);
    } catch (error) {
      for (const track of stream.getTracks()) track.stop();
      return Promise.reject(error);
    }
    const chunks: Blob[] = [];
    let resolvePromise!: (result: VideoResult) => void;
    let rejectPromise!: (reason?: unknown) => void;
    const promise = new Promise<VideoResult>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    const session: RecordingSession = {
      mediaRecorder,
      stream,
      chunks,
      promise,
      resolve: resolvePromise,
      reject: rejectPromise,
      download: opts.download !== false,
      name: opts.name || null,
      mimeType: mediaRecorder.mimeType || mimeType || 'video/webm',
      startedAt: performance.now(),
      durationMs: storyboard.durationMs,
      elapsedMs: 0,
      stopping: false,
    };
    recording = session;
    mediaRecorder.addEventListener('dataavailable', (event) => {
      if (event.data && event.data.size) chunks.push(event.data);
    });
    mediaRecorder.addEventListener('error', (event: Event) => {
      const error = 'error' in event ? event.error : null;
      session.reject(error || new Error('Studio video recording failed'));
    });
    mediaRecorder.addEventListener('stop', () => {
      const blob = new Blob(chunks, { type: session.mimeType });
      const result = {
        blob,
        size: blob.size,
        mimeType: session.mimeType,
        durationMs: session.elapsedMs || session.durationMs,
      };
      if (session.download && blob.size) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const ext = session.mimeType.includes('mp4') ? 'mp4' : 'webm';
        link.download = session.name ||
          `studio_${getWorld()?.mapId || 'battle'}_${Math.round(storyboard.durationMs / 1000)}s.${ext}`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }
      for (const track of stream.getTracks()) track.stop();
      if (recording === session) recording = null;
      timeScale = 0;
      rail.updateVisibility();
      panel.refreshStoryboard();
      panel.refreshTime();
      invalidate();
      session.resolve(result);
    }, { once: true });

    seekTimeline(0, { recording: true });
    rail.updateVisibility();
    lighting.update(true);
    stepFx(0);
    post.render(0);
    mediaRecorder.start(250);
    timeScale = 1;
    panel.refreshStoryboard();
    panel.refreshTime();
    invalidate();
    return promise;
  }

  function stopRecording() {
    if (!recording || recording.stopping) return false;
    recording.stopping = true;
    recording.elapsedMs = Math.min(recording.durationMs, Math.round(clockMs));
    timeScale = 0;
    if (recording.mediaRecorder.state !== 'inactive') recording.mediaRecorder.stop();
    return true;
  }

  function recordingStatus() {
    return {
      active: !!recording,
      stopping: !!recording?.stopping,
      durationMs: storyboard.durationMs,
      elapsedMs: recording ? Math.round(clockMs) : 0,
      supported: typeof MediaRecorder !== 'undefined' && !!renderer.domElement.captureStream,
      mimeType: recording?.mimeType || videoMimeType() || null,
    };
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
        ...(a.stateName !== a.authoredStateName
          ? { authoredState: a.authoredStateName }
          : {}),
        ...(a.stateAgeS != null ? { stateAgeS: a.stateAgeS } : {}),
        ...(a.stateAgeS !== a.authoredStateAgeS
          ? { authoredStateAgeS: a.authoredStateAgeS }
          : {}),
        ...(a.recoilAgeS != null ? { recoilAgeS: a.recoilAgeS } : {}),
        ...(a.recoilAgeS !== a.authoredRecoilAgeS
          ? { authoredRecoilAgeS: a.authoredRecoilAgeS }
          : {}),
        ...(a.smoking && a.stateName !== 'engine-smoking' ? { smoking: true } : {}),
        ...(a.burning && a.stateName !== 'burning' ? { burning: true } : {}),
        ...(a.smoking !== a.authoredSmoking ? { authoredSmoking: a.authoredSmoking } : {}),
        ...(a.burning !== a.authoredBurning ? { authoredBurning: a.authoredBurning } : {}),
      })),
      effects: effectLog.map((e) => ({ ...e, params: { ...e.params } })),
      storyboard: getStoryboard(),
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
  async function load(
    json: StudioSceneInput = {},
    _opts: Readonly<Record<string, unknown>> = {},
  ): Promise<ReturnType<typeof stateJson>> {
    if (recording) throw new Error('Stop recording before loading a scene');
    if (loading) throw new Error('studio.load already in flight');
    loading = true;
    try {
      const yieldForFrameBudget = createFrameBudgetYielder(10);
      const mapId = resolveMapId(json.map || 'verdant', () => 0.01);
      if (!active) await enter({ map: mapId });
      const w0 = getWorld();
      if (!w0 || w0.mapId !== mapId) await setMap(mapId);
      sceneMeta.seed = json.seed != null ? json.seed : 5000;
      timeScale = 0; // build frozen — nothing ages while we stage
      clearActors();
      resetFx(sceneMeta.seed);
      await yieldForFrameBudget();
      for (const cfg of json.actors || []) {
        addActor(cfg);
        await yieldForFrameBudget();
      }
      storyboard = normalizeStoryboard(json.storyboard || {
        durationMs: Math.min(STUDIO_MAX_DURATION_MS, Math.max(
          12000,
          Number(json.fxTime) || 0,
          (json.effects || []).reduce<number>(
            (max, effect) => Math.max(max, Number(effect.tMs) || 0),
            0,
          ),
        )),
      });
      bindStoryboardTracks();
      selectedShotId = storyboard.shots[0]?.id || null;
      rail.rebuild();
      await yieldForFrameBudget();
      if (json.camera) applyCamera(json.camera);
      // Canonical timeline: log every authored event, then deterministically
      // rebuild the visible frame at the requested playhead. Future events
      // remain scheduled and will fire automatically during playback.
      const fxMs = clampStudioTime(json.fxTime || 0, storyboard.durationMs);
      const list = (json.effects || [])
        .map((e: StudioEffectInput): StudioEffectInput & { tMs: number } => ({
          ...e,
          tMs: clampStudioTime(e.tMs || 0, storyboard.durationMs),
        }))
        .sort((x, y) => x.tMs - y.tMs);
      for (const e of list) {
        effectLog.push(makeEffectRecord(e, e.tMs));
      }
      rebuildEffects(fxMs);
      await yieldForFrameBudget();
      timeScale = fxMs >= storyboard.durationMs
        ? 0
        : Math.max(0, Math.min(4, json.timeScale != null ? json.timeScale : 0));
      const w = getWorld();
      if (w) w.setWindTime(0.35 + fxMs / 1000);
      for (const a of actors) a.visual.syncFromState(a.state, 0);
      lighting.updateFrustums();
      lighting.update(true);
      selectedEffect = null;
      rail.updateVisibility();
      panel.refreshAll();
      return stateJson();
    } finally {
      loading = false;
    }
  }

  async function setMap(mapId: string): Promise<string> {
    const id = resolveMapId(mapId, () => 0.01);
    const current = getWorld();
    if (current && current.mapId === id) return id;
    if (mapChange) {
      await mapChange;
      const latest = getWorld();
      if (latest && latest.mapId === id) return id;
    }
    const work = async (progress: ProgressListener): Promise<string> => {
      panel.setBusy(`Building ${getMapConfig(id).name || id}…`);
      progress(0.03, 'Surveying battlefield');
      await ensureWorld(id, (f: number, label: string) => {
        panel.setBusy(`${label} ${Math.round(f * 100)}%`);
        progress(0.03 + f * 0.86, label);
      });
      setWorldDormant(false);
      setCamoBiome(id);
      // Only Studio actors can be seen. Repainting every cached garage/battle
      // texture on a biome change turned a map pick into seconds of unrelated
      // canvas work.
      const refreshed = new Set();
      for (const actor of actors) {
        if (refreshed.has(actor.specId)) continue;
        refreshed.add(actor.specId);
        applyCamoPatterns(actor.specId);
      }
      progress(0.92, 'Settling actors');
      for (const actor of actors) settleActor(actor);
      const world = getWorld();
      if (world) world.setWindTime(0.35 + clockMs / 1000);
      panel.refreshAll();
      invalidate();
      progress(1, 'Studio ready');
      return world?.mapId || id;
    };
    mapChange = transition.run(work, {
      kicker: 'Scene Studio',
      title: getMapConfig(id).name || id,
      sub: 'Switching battlefield',
      mapId: id,
      minShowMs: 360,
    });
    try {
      return await mapChange;
    } finally {
      mapChange = null;
      panel.setBusy(null);
    }
  }

  // --- enter / exit -------------------------------------------------------------
  /**
   * Enter the studio phase: hide the garage, build/activate the map WITHOUT
   * staging a battle, take camera ownership. Idempotent.
   * @param {{map?:string}} [opts]
   */
  function enter(opts: EnterOptions = {}): Promise<void> {
    if (active) return Promise.resolve();
    if (entering) return entering; // share the in-flight entry (load() awaits it)
    entering = doEnter(opts).finally(() => { entering = null; });
    return entering;
  }

  async function doEnter(opts: EnterOptions): Promise<void> {
    // never race the boot tail: everything the studio touches exists once
    // the game declares readiness. Direct /studio boot is explicitly invoked
    // by main.ts from its final covered stage, where all Studio dependencies
    // already exist but __GAME_READY deliberately has not flipped yet.
    if (!opts.coveredByBoot && !window.__GAME_READY) {
      await new Promise<void>((resolve) => {
        const t = setInterval(() => {
          if (window.__GAME_READY) { clearInterval(t); resolve(); }
        }, 60);
      });
    }
    const mapId = resolveMapId(opts.map || urlParam('map') || 'verdant', () => 0.01);
    const trace: {
      mapId: string;
      directBoot: boolean;
      stages: Record<string, number>;
      totalMs?: number;
    } = { mapId, directBoot: !!opts.coveredByBoot, stages: {} };
    const startedAt = performance.now();
    let markedAt = startedAt;
    const mark = (name: string): void => {
      const now = performance.now();
      trace.stages[name] = Math.round(now - markedAt);
      markedAt = now;
    };
    const work = async (p: ProgressListener): Promise<void> => {
      p(0.02, 'Preparing studio');
      game.phase = 'studio';
      post.resetAdaptiveResolution?.();
      garage.hide();
      showroom.stop();
      // The battle HUD is intentionally demand-loaded. A pristine direct
      // Studio visit (or F8 before the first battle) has no HUD runtime yet.
      hud?.setMode?.('hidden');
      setGarageSpots(false);
      setGarageSunTrim(false); // authored map sun, not the neutral pedestal key
      ensureFxBus();
      active = true;        // tick branch takes the frame from here on
      panel.show();
      mark('shell');
      // Both paths are frame-budgeted and independent. Interleave their yield
      // points so sprite baking does not become a second serial load after the
      // battlefield has finished assembling.
      let worldProgress = 0;
      let fxProgress = 0;
      const report = (label: string): void => p(
        0.04 + worldProgress * 0.78 + fxProgress * 0.18,
        label,
      );
      await Promise.all([
        ensureFullFleet(),
        ensureWorld(mapId, (f: number, label: string) => {
          worldProgress = Math.max(worldProgress, f);
          report(label);
        }),
        warmStudioPipeline((f: number, label: string) => {
          fxProgress = Math.max(fxProgress, f);
          report(label);
        }),
      ]);
      mark('worldAndFx');
      setWorldDormant(false);
      setCamoBiome(mapId);
      // Direct entry has no actors and should not repaint the hidden garage
      // hero. Existing actors can occur only through an API re-entry.
      const refreshed = new Set();
      for (const actor of actors) {
        if (refreshed.has(actor.specId)) continue;
        refreshed.add(actor.specId);
        applyCamoPatterns(actor.specId);
      }
      sweepPool();
      resetFx();
      timeScale = 0;
      p(0.96, 'Positioning camera');
      // default vantage: over the player spawn, looking across the field
      const w = getWorld();
      if (!w) throw new Error(`Studio world '${mapId}' was not activated`);
      const sp = w.spawnPoints.player;
      _v2.set(sp.pos[0], sp.pos[1], sp.pos[2]);
      camera.position.set(
        _v2.x - Math.sin(sp.yaw || 0) * 22,
        _v2.y + 9,
        _v2.z - Math.cos(sp.yaw || 0) * 22,
      );
      cam.fov = 50;
      cam.roll = 0;
      lookAt(_v1.copy(_v2).setY(_v2.y + 2));
      cam.orbit.target.copy(_v2);
      cam.orbit.dist = 24;
      lighting.updateFrustums();
      // Direct-route boot has not started the shared rAF yet. Produce one
      // complete real Studio frame behind the boot veil so readiness means a
      // stable canvas, not merely a finished scene graph.
      if (opts.coveredByBoot) {
        lighting.update(true);
        post.render(0);
      }
      panel.setBusy(null);
      panel.refreshAll();
      invalidate();
      mark('present');
    };
    try {
      if (opts.coveredByBoot) {
        await work(opts.onProgress || (() => {}));
      } else {
        await transition.run(work, {
          kicker: 'Scene Studio',
          title: getMapConfig(mapId).name || mapId,
          sub: 'Staging rig · Free camera',
          mapId,
          minShowMs: 360,
        });
      }
    } catch (error) {
      active = false;
      panel.hide();
      game.phase = 'garage';
      throw error;
    }
    trace.totalMs = Math.round(performance.now() - startedAt);
    window.__STUDIO_LOAD = trace;
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
      mapId: getWorld()?.mapId,
      progress: false, minShowMs: 720,
    }).finally(() => { exiting = false; });
  }

  function doExit() {
    if (!active) return;
    if (recording) stopRecording();
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
    activeEffectIds.clear();
    fx.resetAll();
    fx.setFrozen(false);
    timeScale = 1;
    camera.rotation.z = 0; // no roll may leak into game cameras
    cam.roll = 0;
    storyboard = normalizeStoryboard();
    selectedShotId = null;
    shotUidSeq = 1;
    actorKeyUidSeq = 1;
    rail.rebuild();
    rail.updateVisibility();
    unsweepPool();
    enterGarage(); // restores camo overrides, sun trim, spots, showroom
    syncRoute(false);
    docBrand('garage');
  }

  // --- per-frame (owns the whole frame while active; called from main tick) ---
  function tick(dt: number): void {
    const cameraMoved = updateCamera(dt);
    poolSweepAcc += dt;
    if (poolSweepAcc >= 0.5) {
      poolSweepAcc = 0;
      sweepPool();
    }
    panel.tick(dt);
    const playbackScale = timeScale;
    const animating = playbackScale > 0;
    if (!animating && !cameraMoved && !frameDirty) {
      perf.skippedFrames++;
      return;
    }
    const w = getWorld();
    const wdt = animating ? dt : 0;
    camera.getWorldDirection(_fwd);
    if (w) w.update(wdt, camera.position, _fwd, null);
    if (animating) advanceTimeline(dt * playbackScale * 1000);
    else stepFx(0);
    if (camera.fov !== lastFov) {
      lighting.updateFrustums();
      lastFov = camera.fov;
    }
    lighting.update();
    post.render(dt);
    perf.renderedFrames++;
    frameDirty = false;
    if (recording && !recording.stopping && clockMs >= storyboard.durationMs) {
      stopRecording();
    }
  }

  function urlParam(name: string): string | null {
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
  function syncRoute(inStudio: boolean): void {
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
    interface SavedBrand {
      title: string;
      links: Array<{
        l: HTMLLinkElement;
        href: string | null;
        type: string | null;
      }>;
    }
    let saved: SavedBrand | null = null;
    return (mode: 'studio' | 'garage'): void => {
      try {
        const links = [...document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')];
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
            l.setAttribute('href', '/brand/nav/studio.svg');
            l.setAttribute('type', 'image/svg+xml');
          }
          document.title = 'Claude of Tanks — Studio';
        } else if (saved) {
          for (const { l, href, type } of saved.links) {
            if (href != null) l.setAttribute('href', href);
            else l.removeAttribute('href');
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
      pos: [r2(a.state.pos.x), r2(a.state.pos.z)],
      facingDeg: r2(a.state.yaw / DEG), turretDeg: r2(a.state.turretYaw / DEG),
      gunDeg: r2(a.state.gunPitch / DEG), state: a.stateName,
      smoking: !!a.smoking, burning: !!a.burning,
      camo: a.camo || null, camoSeed: a.camoSeed,
    })),
    state: stateJson,
    // session control
    enter: (opts: EnterOptions = {}) => enter(opts),
    exit,
    setMap: (id: string) => recording
      ? Promise.reject(new Error('Stop recording before changing battlefield'))
      : setMap(id),
    get active() { return active; },
    get mapId() { const w = getWorld(); return w ? w.mapId : null; },
    performance: () => ({ ...perf }),
    // actors
    addActor: (cfg: StudioActorInput) => {
      if (recording) return null;
      const a = addActor(cfg);
      selectActor(a);
      return api.listActors()[actors.indexOf(a)];
    },
    removeActor: (ref: ActorRef) => recording ? false : removeActor(ref),
    updateActor: (ref: ActorRef, patch: StudioActorPatch) => {
      if (recording) return null;
      const a = updateActor(ref, patch);
      panel.refreshAll();
      return a ? api.listActors()[actors.indexOf(a)] : null;
    },
    setHydropneumaticAim: (ref: ActorRef, pitchDeg: number) => recording
      ? null
      : setHydropneumaticAim(ref, pitchDeg),
    setActorState: (ref: ActorRef, state: string, ageS: number | null = null) => (
      recording ? false : setActorState(ref, state, ageS)
    ),
    selectActor: (ref: ActorRef) => { const a = selectActor(ref); return a ? a.uid : null; },
    clearActors: () => { if (!recording) clearActors(); },
    // effects + time
    effect: fireEffect,
    listEffects,
    selectEffect,
    removeEffect,
    updateEffect,
    clearEffects: () => {
      if (recording) return false;
      resetFx(); applyStoryboardFrame(0, 0); panel.refreshAll();
      return true;
    },
    advanceFx: (ms: number) => seekTimeline(clockMs + ms),
    setTimeScale: (v: number) => {
      if (recording) return timeScale;
      const next = Math.max(0, Math.min(4, v));
      if (next > 0 && clockMs >= storyboard.durationMs - 0.5) {
        seekTimeline(0, { pause: false });
      }
      timeScale = next;
      rail.updateVisibility();
      panel.refreshTime();
      invalidate();
      return timeScale;
    },
    get timeScale() { return timeScale; },
    get fxTimeMs() { return Math.round(clockMs); },
    // cinematic storyboard + transport
    getStoryboard,
    setStoryboard,
    setStoryboardDuration,
    addCameraShot,
    updateCameraShot,
    removeCameraShot,
    selectCameraShot,
    keyActor,
    clearActorTrack,
    setRailVisible,
    directDuel,
    seek: seekTimeline,
    play: playTimeline,
    pause: pauseTimeline,
    stop: stopTimeline,
    get durationMs() { return storyboard.durationMs; },
    get playing() { return timeScale > 0; },
    get railVisible() { return railVisible; },
    get selectedShotId() { return selectedShotId; },
    // video output
    recordVideo,
    stopRecording,
    recordingStatus,
    // camera
    setCamera: (cfg: CameraConfig) => recording ? getCamera() : applyCamera(cfg),
    getCamera,
    // constants for tooling/panel
    TANK_IDS: VISIBLE_TANK_IDS,
    MAP_IDS,
    ACTOR_STATES,
    EFFECT_TYPES,
    CAMO_PATTERN_IDS,
    getMapInfo: (id: string) => {
      const config = getMapConfig(id);
      return { id, name: config.name || id };
    },
    getSpecInfo: (id: string) => {
      const s = getSpec(id);
      const roster = s.roster && typeof s.roster === 'object'
        ? s.roster as Record<string, unknown>
        : null;
      return {
        id: s.id, name: s.name, era: s.era,
        developmentOnly: Boolean(roster?.developmentOnly),
        rosterTag: typeof roster?.tag === 'string' ? roster.tag : '',
        gunElevationDeg: s.gunElevationDeg, gunDepressionDeg: s.gunDepressionDeg,
        shells: s.gun.shells.map((sh) => sh.type),
      };
    },
    // panel-internal hooks (not part of the scripted contract)
    _internal: {
      get selected() { return selected; },
      get selectedEffect() { return selectedEffect; },
      get placeArmed() { return placeArmed; },
      set placeArmed(v: string | null) { placeArmed = v; },
      get markerPos() { return marker.pos; },
      get markerActive() { return marker.group.visible; },
      get storyboard() { return storyboard; },
      get selectedShotId() { return selectedShotId; },
      get railObjectVisible() { return rail.group.visible; },
      cam,
      actors,
      findActor,
    },
  };

  const panel = createStudioPanel(api);

  window.__STUDIO = api;

  // Auto-entry: the /studio pretty route or the legacy ?studio=1 param
  // (waits for readiness; map via ?map=…)
  if (ctx.autoEnter !== false && (urlParam('studio') || onStudioRoute())) {
    const t = setInterval(() => {
      if (!window.__GAME_READY) return;
      clearInterval(t);
      enter({ map: urlParam('map') || 'verdant' })
        .catch((err: unknown) => console.error('[studio] auto-enter failed', err));
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
