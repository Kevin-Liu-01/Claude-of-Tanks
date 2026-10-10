import { t } from '../ui/i18n.ts';
import { tankContactRect } from '../sim/tankContactShape.ts';
import { createStudioCrushes, planStudioCrushes, type StudioCrushEvent, type StudioCrushHull } from './studioCrush.ts';
import { sceneLinkPath } from './studioSceneLink.ts';
import type { WaterDisturbance } from '../world/shallowWater.ts';
import { minimumMechanicalGunPitch } from '../sim/gunPitchLimits.ts';
import { usesLauncherMuzzles, isUnguidedRocket, launcherMuzzleIndex } from '../sim/launcherPolicy.ts';
import {
  STUDIO_TIMES, STUDIO_TIME_BANDS, isStudioTime, normalizeStudioLight, planStudioLight, studioElevationBand,
  studioTimeFor, studioTimesFor, type StudioLight, type StudioTimeOfDay,
} from './studioLight.ts';
import { studioAuthoredSky } from './studioLightRuntime.ts';
import type { RuntimeValue } from '../runtimeTypes.ts';
import {
  DESTRUCTION_BUS_EVENTS, MUNITION_PROFILES, type MunitionClass, type StructureStage, type StructureStageEvent,
  type TerrainCraterEvent,
} from '../sim/destructionEvents.ts';
import { matchRulesetFor } from '../sim/matchRuleset.ts';
import {
  CRATER_DEFORM_MIN_RADIUS_M, craterFor, munitionChargeKg, munitionClassForShell, type MunitionShellLike,
} from '../sim/munitionBlast.ts';
import { quantizeCrater, type QuantizedCrater } from '../sim/destructionMatch.ts';
import { createTerrainDeformation, type TerrainDeformation } from '../sim/terrainDeformation.ts';
import { architectureStyleOf, wallMaterialForStyle } from '../sim/structureMaterial.ts';
import { createStudioDestruction, type StudioDestruction } from './studioDestruction.ts';
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
 *       if (studio.active) { studio.tick(dtR, frameWallDtS); return; }
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
import { conformStudioActor, resetStudioActorSupport, studioSupportBelly } from './studioActorSupport.ts';
import {
  FILM_SUPPORT_ON_GRID, captureFilmSupport, createFilmSupport, filmSupportAlpha, presentFilmSupport, resetFilmSupport,
  type FilmSupport,
} from './studioFilmSupport.ts';
import { createStructureSupportField, type StructureSupportField } from '../sim/structureSupport.ts';
import type { CollisionRecord } from '../world/collision.ts';
import { createBus } from './stateCore.ts';
import {
  CAMO_CATALOG_PATTERN_IDS, setCamoOverride, applyCamoPatterns,
  setCamoBiome,
} from '../vehicles/materials.ts';
import { MAP_IDS, getMapConfig, resolveMapId } from '../world/maps/index.ts';
import { createStudioPanel } from '../ui/studioPanel.ts';
import type {
  StudioActor as StudioPanelActor,
  StudioPanelApi,
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
  sampleCameraCues,
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
import { createStudioCinematics } from '../fx/cinematicFx.ts';
import type { CineActor, CineTrackActor, CineTrackSample, StudioCinematics } from '../fx/cinematicFx.ts';
import type { FxCinematicPort } from '../fx/effects.ts';
import {
  STUDIO_FX_QUALITIES, STUDIO_FX_PARAMS, normalizeStudioFx, studioFxState, fxParam, flareColor,
} from './studioFxSettings.ts';
import type { StudioFxQuality, StudioFxSettings } from './studioFxSettings.ts';
import { createTrackDustAdapters } from './studioTrackDust.ts';
import { requestAuxiliary } from '../sim/auxiliarySystems.ts';
import type { AuxiliaryEntity } from '../sim/auxiliarySystems.ts';
import { createSmokeCanister, SMOKE_GRAVITY_MPS2 } from '../sim/smokeBallistics.ts';
import { SMOKE_WIND_X, SMOKE_WIND_Z } from '../sim/smokeScreen.ts';
import { createProductionScene, productionPreset, productionCamera, productionAspect, reframeProductionPoint, reframeProductionFov } from './studioProduction.ts';
import type { ProductionOptions, ProductionRigId, ProductionFormat } from './studioProduction.ts';
import { createStudioFilm } from './studioFilm.ts';
import type { FilmFrameInfo, FilmNearSurfaces, FilmSessionInfo } from './studioFilm.ts';
import { createFilmTimeMap, normalizeFilm, filmOutputSize, FILM_CUE_ATTACK_MS, FILM_DEFAULTS } from './studioFilmPlan.ts';
import type { FilmFilter, FilmSettings, FilmSettingsInput } from './studioFilmPlan.ts';
import type { FilmExportProgress, FilmExportResult } from './studioFilmExport.ts';
import type { FilmSoundCue, FilmSoundKind } from './studioFilmAudio.ts';
import {
  applySiteMetadataToDocument,
  localizedGameMetadata,
  localizedStudioMetadata,
} from '../presentation/siteMetadata.ts';
import { getLocale } from '../ui/i18n.ts';
import { pathForLocale, resolveLocalePath } from '../ui/localeRouting.ts';
import type {
  MovementContactGeometry,
  MovementEntity,
  MovementHeightField,
  MovementInput,
  TankState,
} from '../sim/movement.ts';
import type { PostRuntime } from '../engine/post.ts';
import { createCinemaPost, type CinemaRuntime } from '../engine/cinemaPost.ts';
import {
  NEUTRAL_PICTURE, PICTURE_PRESETS, applyPicturePatch, isNeutralPicture, pictureCinemaSettings,
  pictureGrainSeed, pictureLensState, pictureLetterboxBars, pictureStateJson, resolvePicture,
  type PicturePatch, type StudioPicture,
} from './studioPicture.ts';
import type { WorldRuntime } from '../world/map.ts';

type TankSpec = ReturnType<typeof getSpec>;
type TankVisual = ReturnType<typeof createTank>;
type StudioShell = ReturnType<typeof createShell> & {
  _studioMaxDistM?: number;
  /** A 'strike' round (destruction core lane, P2): traced through the world each step, the sim's own strike where it stops. */
  _studioWorld?: boolean;
};
type ProgressListener = (fraction: number, label: string) => void;

interface StudioPoolTank {
  visual?: TankVisual | null;
  state?: TankState | null;
}

interface StudioGameState {
  phase: string;
  _engineCtx: RuntimeValue;
  allTanks: StudioPoolTank[];
  tanks: StudioPoolTank[];
}

interface StudioFxRuntime {
  bindBus(bus: ReturnType<typeof createBus>): void;
  resetAll(options?: { running?: boolean }): void;
  resetSeed(seed: number): void;
  resetClock(atTimeS?: number): void;
  setFrozen(frozen: boolean): void;
  update(
    deltaSeconds: number,
    shells: StudioShell[],
    camera: THREE.PerspectiveCamera,
    resolveSubject: (id: RuntimeValue) => StudioActor | null,
  ): void;
  muzzleFlash(position: THREE.Vector3, direction: THREE.Vector3, caliberMm: number): void;
  /** A hull toppling a pole or dressing (the battle's crush burst) and kicking loose dressing (effects.ts). */
  propCrush?(position: THREE.Vector3, direction: THREE.Vector3, heightM?: number): void;
  loosePropHit?(position: THREE.Vector3, direction: THREE.Vector3, heightM?: number): void;
  destruction(position: THREE.Vector3, visual: TankVisual | null, cause: string, wreckOf?: string | null,
    opts?: { shellBurst?: boolean }): void;
  dust(position: THREE.Vector3, direction: THREE.Vector3, intensity: number): void;
  armorScar(visual: TankVisual, position: THREE.Vector3, normal: THREE.Vector3, caliberMm: number): void;
  composeFiringMoment(options: Readonly<Record<string, RuntimeValue>>): void;
  composeExplosionMoment(options: Readonly<Record<string, RuntimeValue>>): void;
  exhaust(position: THREE.Vector3, intensity: number, sooty: boolean, vel?: THREE.Vector3 | null, fwd?: THREE.Vector3 | null,
    birthOffset?: number): void;
  cinematicPort(): FxCinematicPort;
}

interface StudioLightingRuntime {
  update(force?: boolean): void;
  updateFrustums(): void;
}

interface StudioTransitionRuntime {
  run<T>(
    work: (progress: ProgressListener) => T | Promise<T>,
    options?: Readonly<Record<string, RuntimeValue>>,
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
  /** Apply a Studio time of day and sun override over the active world (main.ts → studioLightRuntime). */
  prepareStudioAtmosphere?(time: StudioTimeOfDay, light?: StudioLight | null): Promise<unknown>;
  /** Restore the world's baked horizon light and the readability before the battlefield leaves the Studio. */
  restoreStudioAtmosphere?(): void;
  /** The applied light runtime (blue-hour / night lamps follow the actors and the camera). */
  getStudioLight?(): {
    setActorRoots(roots: readonly THREE.Object3D[]): void;
    update(cameraPosition: THREE.Vector3Like): void;
  } | null;
  setGarageSpots(enabled: boolean): void;
  setGarageSunTrim(enabled: boolean): void;
  enterGarage(): Promise<void> | void;
  warmStudioPipeline?(onProgress?: ProgressListener): Promise<RuntimeValue>;
  transition?: StudioTransitionRuntime;
  autoEnter?: boolean;
  /** An idle pooled PointLight Studio may drive (flares, night firelight). */
  borrowLight?(): THREE.PointLight | null;
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
  launcherCursor?: number;
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
  authoredSuspensionAimPitch: number | null;
  smoking: boolean;
  burning: boolean;
  timelineX: number;
  timelineZ: number;
  timelineYaw: number;
  supportStep: number;
  supportX: number;
  supportZ: number;
  supportYaw: number;
  /** Film renders: track travel since the last fixed support step (presentation only). */
  filmScrollL?: number;
  filmScrollR?: number;
  /** Film renders: the support steps around the sample and its blend between them (studioFilmSupport.ts). */
  filmSupport?: FilmSupport;
  filmSupportAlpha?: number;
  timelineTrack: ActorTrack | null;
  /** The battle hull's ride surface (terrain + standable primitive tops), per actor and world. */
  support: StructureSupportField | null;
  supportWorld: WorldRuntime | null;
}

type ActorRef = StudioActor | StudioPanelActor | string | number | null | undefined;

interface StudioEffectParams {
  /** a wreck's age (char and settle), or a settled crater's (crater round 3: the presentation weathers it by age), s */
  ageS?: number;
  burnS?: number;
  color?: string;
  density?: number;
  driftMps?: number;
  durationS?: number;
  fallMps?: number;
  heightM?: number;
  hot?: number;
  launch?: boolean;
  quality?: string;
  rate?: number;
  rise?: number;
  scale?: number;
  smoke?: boolean;
  strength?: number;
  caliberMm?: number;
  /** explosion: a munition class (sim/destructionEvents.ts) and its charge, kg TNT (default: the class's nominal) */
  munition?: string;
  /** structure: the stage the building nearest the effect point crosses ('damaged', 'breached', 'collapsed') */
  stage?: string;
  /** explosion with a munition: the round ends on the nearest building's wall (along dirDeg), hitH m up it */
  wall?: boolean;
  /** explosion with a munition: only its crater, laid down settled (a late joiner's view: no blast) */
  settled?: boolean;
  hitH?: number;
  chargeKg?: number;
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
  /** ram: the hull's mass in tonnes (default the actor's spec), and how far ahead of its nose a wall is met (m) */
  massTons?: number;
  reachM?: number;
  spreadDeg?: number;
  to?: readonly number[];
  tracer?: boolean;
  /** strike (destruction P2): the round ({ type, caliberMm, name?, blastRadiusM?, pen100Mm?, velocityMps? }), its climb
   * (degrees) and how far it flies before it is gone (m) */
  shell?: Record<string, unknown>;
  pitchDeg?: number;
  rangeM?: number;
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

interface StudioEffectExecution {
  /** Stable effect id (seeds the cinematic layer's private stream). */
  readonly id: string;
  readonly input: StudioEffectInput | StudioEffectRecord;
  readonly actor: StudioActor | null;
  readonly position: THREE.Vector3;
  readonly params: StudioEffectParams;
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
  /** Film still: jittered accumulation samples (1 = the classic single render). */
  samples?: number;
  filter?: FilmFilter;
  /** Film still: render this many times larger, then downsample. */
  supersample?: number;
  /** Motion-blur still: timeline ms integrated around the playhead (≤ 1000; 0 = frozen instant). */
  exposureMs?: number;
  /** Motion-blur still: adaptive sample ceiling (samples..128, default max(samples, 64)). */
  maxSamples?: number;
  /** Motion-blur still: camera-cue scale (default the scene's film.shake, else 1). */
  shake?: number;
}

interface FilmBeginOptions extends FilmSettingsInput {
  width?: number;
  height?: number;
  startMs?: number;
  endMs?: number;
}

interface FilmExportRequest extends FilmBeginOptions {
  /** Short-side resolution for the production format (1080, 1440, 2160); ignored with width/height. */
  resolution?: number;
  /** Mix the game's combat sound into the file (default true). */
  audio?: boolean;
  bitrate?: number;
  container?: 'auto' | 'mp4' | 'webm';
  download?: boolean;
  name?: string;
  onProgress?: (progress: FilmExportProgress) => void;
  onFrame?: (canvas: HTMLCanvasElement) => void;
}

interface FilmRenderOptions {
  /** Also return the frame as a data URL (headless exporters). */
  dataURL?: boolean;
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
  leadInMs: number;
}

interface RecordingSession {
  mediaRecorder: MediaRecorder;
  stream: MediaStream;
  chunks: Blob[];
  promise: Promise<VideoResult>;
  resolve(result: VideoResult): void;
  reject(reason?: RuntimeValue): void;
  download: boolean;
  name: string | null;
  mimeType: string;
  startedAt: number;
  durationMs: number;
  elapsedMs: number;
  stopping: boolean;
  awaitingFirstChunk: boolean;
  fail: (error: RuntimeValue) => void;
  leadInMs: number;
  failed: boolean;
  startupTimer: ReturnType<typeof setTimeout> | null;
}

interface StudioSceneInput {
  map?: string;
  fx?: { quality?: string; trackDust?: boolean };
  productionFormat?: ProductionFormat;
  timeOfDay?: StudioTimeOfDay;
  light?: StudioLight | null;
  seed?: number;
  actors?: readonly StudioActorInput[];
  effects?: readonly StudioEffectInput[];
  storyboard?: StoryboardInput;
  camera?: CameraConfig;
  fxTime?: number;
  timeScale?: number;
  /** Optional film settings (studioFilmPlan.ts); absent = none authored. */
  film?: FilmSettingsInput | null;
  picture?: PicturePatch | null;
  /** The Studio's destruction (game/studioDestruction.ts): `sections: false` films the battle's P1 rules. */
  destruction?: { sections?: boolean };
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
  tick(deltaSeconds: number, frameWallDtSeconds?: number): void;
  enter(options?: EnterOptions): Promise<void>;
  exit(): void;
  api: StudioPanelApi & Readonly<Record<string, RuntimeValue>>;
}

const DEG = Math.PI / 180;
/** What the Studio reads of a building's anatomy (world/structureDamageSeam.ts): its footprint, height and placement. */
interface StudioStructureAnatomy {
  massClass: string; placement: { x: number; y: number; z: number; yaw: number }; w: number; d: number; h: number;
}
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
  // media r5 cinematic pyrotechnics (src/fx/cinematicFx.ts, docs/STUDIO.md):
  'smoke_screen', // the actor's real smoke-grenade salvo blooming into a wall
  'flare',        // illumination flare drifting under a parachute (real light)
  'embers',       // drifting ember storm off a fire
  'debris',       // hot/cold fragments with trails and landing dust
  'shockwave',    // ground dust ring racing outward
  'fire_field',   // burning ground: low flames, lit smoke, glow
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
const _cameraCueSample = { rightM: 0, upM: 0, forwardM: 0, rollDeg: 0, fovKickDeg: 0 };
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
  let timeOfDay: StudioTimeOfDay = 'day';
  let studioLight: StudioLight | null = null; // scene JSON `light`: the sun override (absolute bearing / elevation)
  let timeScale = 1;           // fx time multiplier; 0 = frozen
  let clockMs = 0;             // studio fx timeline (ms since last fx reset)
  // the lens flare eases on the export clock while advanceFrame drives the timeline (one ease per step, whatever the
  // live renders between steps), on the wall clock again in playback and outside the Studio
  let flareOnExportClock = false;
  const flareToWallClock = (): void => {
    if (!flareOnExportClock) return;
    flareOnExportClock = false;
    post.lensFlare?.setClock?.(null);
  };
  let uidSeq = 1;
  let effectUidSeq = 1;
  const actors: StudioActor[] = []; // see addActor()
  const waterSlots: { -readonly [K in keyof WaterDisturbance]: WaterDisturbance[K] }[] = Array.from({ length: 8 }, () => ({ x: 0, z: 0, strength: 0 }));
  const waterSources: WaterDisturbance[] = [];
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
  let sceneMeta: { seed: number; sections: boolean } = { seed: 5000, sections: true };
  let selectedEffect: StudioEffectRecord | null = null;
  let storyboard: Storyboard = normalizeStoryboard();
  let selectedShotId: string | null = null;
  let shotUidSeq = 1;
  let actorKeyUidSeq = 1;
  let railVisible = true;
  let recording: RecordingSession | null = null;
  // Film renderer (studioFilm.ts): the scene's authored `film` block, and the
  // live-session latch. While filming, the live tick and authoring input stand
  // still, the timeline advances unrounded, continuous emitters follow the
  // 60 Hz timeline grid and track phase follows the exact sample instant.
  let sceneFilm: FilmSettings | null = null;
  let filming = false;
  // Soundtrack cues of an exported film (studioFilmAudio.ts): every combat sound
  // the timeline produces while the film renders, at its exact instant.
  let filmCues: FilmSoundCue[] | null = null;
  function filmCue(kind: FilmSoundKind, x: number, y: number, z: number, caliberMm: number,
    cause?: 'ammorack' | 'shot' | 'fire'): void {
    if (filmCues && filmCues.length < 4096) filmCues.push({ timelineMs: clockMs, kind, x, y, z, caliberMm, ...(cause ? { cause } : {}) });
  }
  let filmShake = 1; // the open film's camera-cue scale (film.shake)
  function scaleFilmCue(cue: { rightM: number; upM: number; forwardM: number; rollDeg: number; fovKickDeg: number }): void {
    if (!filming || filmShake === 1) return;
    cue.rightM *= filmShake; cue.upM *= filmShake; cue.forwardM *= filmShake;
    cue.rollDeg *= filmShake; cue.fovKickDeg *= filmShake;
  }
  const perf = { renderedFrames: 0, skippedFrames: 0, poolSweeps: 0 };
  // media r5: scene FX quality + the lazily created cinematic layer
  let fxSettings: StudioFxSettings = normalizeStudioFx(null);
  let cinematics: StudioCinematics | null = null;
  let paletteMapId = '';
  let paletteId = 'verdant';
  let effectFireS = 0; // authored cue time of the effect being fired

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
        group.visible = active && railVisible && timeScale === 0 && !recording && !filming && shots.length > 0;
        invalidate();
      },
      updateVisibility() {
        group.visible = active && railVisible && timeScale === 0 && !recording && !filming
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

  const flyMovementKeys = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyE', 'KeyQ'] as const;

  function flyCameraIsMoving(): boolean {
    return flyMovementKeys.some((code) => keys.has(code));
  }

  function translateFlyCamera(distance: number): void {
    camera.getWorldDirection(_fwd);
    _v1.set(0, 0, 0);
    if (keys.has('KeyW')) _v1.addScaledVector(_fwd, distance);
    if (keys.has('KeyS')) _v1.addScaledVector(_fwd, -distance);
    _v2.set(_fwd.z, 0, -_fwd.x).normalize(); // right axis (horizontal)
    if (keys.has('KeyD')) _v1.addScaledVector(_v2, -distance);
    if (keys.has('KeyA')) _v1.addScaledVector(_v2, distance);
    if (keys.has('KeyE')) _v1.y += distance;
    if (keys.has('KeyQ')) _v1.y -= distance;
    camera.position.add(_v1);
  }

  function updateCamera(dt: number): boolean {
    if (timeScale > 0 && storyboard.shots.length) return false;
    const boost = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 4 : 1;
    const v = cam.speed * boost * dt;
    if (cam.mode === 'fly') {
      if (!flyCameraIsMoving() && !cameraDirty) return false;
      translateFlyCamera(v);
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
  function clampGunDeg(spec: TankSpec, deg: number, turretDeg: number): number {
    const low = spec.gunPitchByYawDeg
      ? minimumMechanicalGunPitch(spec, turretDeg * DEG) / DEG
      : -(spec.gunDepressionDeg ?? 10);
    return Math.max(low,
      Math.min(spec.gunElevationDeg ?? 20, deg || 0));
  }

  /** Convert authored chassis-center coordinates to the procedural rig origin. */
  function actorRootPosition(
    a: StudioActor,
    x: number,
    z: number,
    yaw: number,
    out: THREE.Vector3,
  ): THREE.Vector3 {
    return a.visual.rootPositionForPresentationPoint(x, z, yaw, out);
  }

  /**
   * Conform an actor to the terrain with the REAL movement support solve:
   * zero-input handbrake steps of updateTank settle the 4-corner attitude
   * spring + wheel fan, then the authored pose values are pinned exactly.
   * @param {object} a actor
   * @param {number} [steps]
   */
  // Studio actors ride what battle hulls ride (round 30 structure support: terrain plus the standable tops of the
  // collision primitives below the belly), and a tank staged over a bridge starts on the deck, not on the river bed
  // or gorge floor under it (the height field there is the excavated surface; the deck is collision support).
  const _deckCandidates: CollisionRecord[] = [], _deckScratch: CollisionRecord[] = [];
  function actorSupport(a: StudioActor): StructureSupportField | typeof hfProxy {
    const world = getWorld();
    if (!world) return hfProxy;
    if (!a.support || a.supportWorld !== world) {
      a.support = createStructureSupportField(hfProxy as Parameters<typeof createStructureSupportField>[0], world);
      a.supportWorld = world;
    }
    const x = a.state.pos.x, z = a.state.pos.z;
    _deckCandidates.length = 0;
    world.queryObstacles(x - 4, z - 4, x + 4, z + 4, _deckCandidates);
    a.support.beginHull(x, z, studioSupportBelly(_deckCandidates, x, z, a.state.pos.y + (a.contactGeom?.bottomYM ?? 0), _deckScratch));
    return a.support;
  }

  function settleActor(a: StudioActor, steps = SETTLE_STEPS): void {
    const p = a.pose;
    const st = a.state;
    const yaw = p.facingDeg * DEG;
    actorRootPosition(a, p.x, p.z, yaw, _v3);
    st.pos.x = _v3.x;
    st.pos.z = _v3.z;
    resetTankVerticalState(st, actorSupport(a).getHeightAt(st.pos.x, st.pos.z));
    st.yaw = yaw;
    st.speed = 0;
    st.yawRate = 0;
    a.input.throttle = 0;
    a.input.steer = 0;
    a.input.brake = true;
    a.input.fire = false;
    // aim the chase target where the pose wants the gun so settle never
    // fights the authored turret/gun values it is about to be pinned to
    const az = st.yaw + p.turretDeg * DEG;
    const el = clampGunDeg(a.spec, p.gunDeg, p.turretDeg) * DEG;
    a.input.aimPoint.set(
      st.pos.x + Math.sin(az) * Math.cos(el) * 400,
      st.pos.y + 2 + Math.sin(el) * 400,
      st.pos.z + Math.cos(az) * Math.cos(el) * 400,
    );
    a.rigidGear = false;
    const aimLocked = a.input.aimLocked;
    if (a.authoredSuspensionAimPitch !== null) a.input.aimLocked = true;
    try {
      for (let i = 0; i < steps; i++) updateTank(a, actorSupport(a), SIM_DT);
    } finally { a.input.aimLocked = aimLocked; }
    // pin the authored pose exactly (updateTank slews at spec rates; slope
    // slide may creep pos) — staging is authoritative, sim only shapes
    // pitch/roll/wheel conform
    actorRootPosition(a, p.x, p.z, yaw, _v3);
    st.pos.x = _v3.x;
    st.pos.z = _v3.z;
    st.yaw = yaw;
    st.speed = 0;
    st.yawRate = 0;
    st.turretYaw = p.turretDeg * DEG;
    st.gunPitch = clampGunDeg(a.spec, p.gunDeg, p.turretDeg) * DEG;
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
  function setHydropneumaticAim(ref: ActorRef, pitchDeg = 0): Readonly<Record<string, RuntimeValue>> | null {
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
    actorRootPosition(a, authoredX, authoredZ, authoredYaw, _v3);
    const rootX = _v3.x;
    const rootZ = _v3.z;

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
      updateTank(a, actorSupport(a), SIM_DT);
      // Studio placement remains authoritative while the suspension solver
      // owns vertical seating and attitude.
      st.pos.x = rootX;
      st.pos.z = rootZ;
      st.yaw = authoredYaw;
      st.speed = 0;
      st.yawRate = 0;
    }
    a.authoredSuspensionAimPitch = st.suspensionAimPitch;
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
  function resolveFxSubject(id: RuntimeValue): StudioActor | null {
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
  function actorPosition(cfg: StudioActorInput): Readonly<{ x: number; z: number }> {
    const pos = cfg.pos || [0, 0];
    return {
      x: pos[0] || 0,
      z: (pos.length >= 3 ? pos[2] : pos[1]) || 0,
    };
  }

  function actorAuthoredState(cfg: StudioActorInput): Readonly<{
    stateName: string;
    stateAgeS: number | null;
    smoking: boolean;
    burning: boolean;
    recoilAgeS: number | null;
  }> {
    const stateName = cfg.authoredState && ACTOR_STATES.includes(cfg.authoredState)
      ? cfg.authoredState
      : (cfg.state && ACTOR_STATES.includes(cfg.state) ? cfg.state : 'intact');
    return {
      stateName,
      stateAgeS: cfg.authoredStateAgeS !== undefined
        ? cfg.authoredStateAgeS
        : (cfg.stateAgeS != null ? cfg.stateAgeS : null),
      smoking: cfg.authoredSmoking != null ? !!cfg.authoredSmoking : !!cfg.smoking,
      burning: cfg.authoredBurning != null ? !!cfg.authoredBurning : !!cfg.burning,
      recoilAgeS: cfg.authoredRecoilAgeS !== undefined
        ? cfg.authoredRecoilAgeS
        : (cfg.recoilAgeS != null ? cfg.recoilAgeS : null),
    };
  }

  function createActorRecord(
    cfg: StudioActorInput,
    specId: string,
    spec: TankSpec,
    visual: TankVisual,
    camoSeed: number,
  ): StudioActor {
    const { x, z } = actorPosition(cfg);
    const authored = actorAuthoredState(cfg);
    return {
      uid: `a${uidSeq++}`,
      name: cfg.name || null,
      specId,
      spec,
      visual,
      state: createTankState(
        spec,
        _v1.set(x, hfProxy.getHeightAt(x, z), z),
        (cfg.facingDeg || 0) * DEG,
      ),
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
      authoredStateName: authored.stateName,
      authoredStateAgeS: authored.stateAgeS,
      authoredSmoking: authored.smoking,
      authoredBurning: authored.burning,
      authoredRecoilAgeS: authored.recoilAgeS,
      authoredSuspensionAimPitch: null,
      smoking: false,
      burning: false,
      timelineX: x,
      timelineZ: z,
      timelineYaw: (cfg.facingDeg || 0) * DEG,
      supportStep: 0, supportX: x, supportZ: z, supportYaw: (cfg.facingDeg || 0) * DEG,
      timelineTrack: null,
      support: null,
      supportWorld: null,
    };
  }

  function activateActorPresentation(a: StudioActor): void {
    if (a.camo && a.camo !== 'inherit') setCamoOverride(a.specId, a.camo);
    applyCamoPatterns(a.specId);
    settleActor(a);
    applyActorState(a, a.authoredStateName, a.authoredStateAgeS);
    if (a.authoredSmoking) a.smoking = true;
    if (a.authoredBurning && !a.burning) igniteColumn(a);
    if (a.authoredRecoilAgeS != null && a.visual.recoilKick) {
      a.visual.recoilKick(a.authoredRecoilAgeS);
      a.visual.syncFromState(a.state, 0);
    }
    if (loading) return;
    panel.refreshActors();
    invalidate();
  }

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
    let owner: StudioActor | null = null;
    if (visual.setGroundSampler) {
      // late-bound: the running gear conforms to the same surface the hull rides (a bridge deck, a roof)
      visual.setGroundSampler((x: number, z: number) => (owner?.support ?? hfProxy).getHeightAt(x, z));
    }
    const a = createActorRecord(cfg, specId, spec, visual, camoSeed);
    owner = a;
    actors.push(a);
    // Scene JSON load stages a complete batch. Rebuilding the rail bindings
    // and DOM actor list after every intermediate actor created redundant
    // layout and traversal work; load() performs each once after the batch.
    if (!loading) bindStoryboardTracks();
    actorRoots.push(visual.root);
    actorByRoot.set(visual.root, a);
    // Resolve the one visible spec now; never sweep unrelated cached vehicles.
    activateActorPresentation(a);
    if (!loading) ctx.getStudioLight?.()?.setActorRoots(actorRoots); // headlights at blue hour / night
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
    if (!loading) ctx.getStudioLight?.()?.setActorRoots(actorRoots); // load() re-syncs once after its batch
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

  function applyActorPosePatch(a: StudioActor, patch: StudioActorPatch): void {
    const pose = a.pose;
    if (patch.pos) {
      pose.x = patch.pos[0];
      pose.z = patch.pos.length >= 3 ? patch.pos[2] : patch.pos[1];
    }
    if (patch.x != null) pose.x = patch.x;
    if (patch.z != null) pose.z = patch.z;
    if (patch.facingDeg != null) pose.facingDeg = patch.facingDeg;
    if (patch.turretDeg != null) pose.turretDeg = patch.turretDeg;
    if (patch.gunDeg != null || patch.turretDeg != null) {
      pose.gunDeg = clampGunDeg(a.spec, patch.gunDeg ?? pose.gunDeg, pose.turretDeg);
    }
    if (patch.name !== undefined) {
      a.name = patch.name || null;
      bindStoryboardTracks();
    }
    if (patch.camo === undefined) return;
    a.camo = patch.camo || null;
    if (!a.camo) return;
    setCamoOverride(a.specId, a.camo);
    applyCamoPatterns(a.specId);
  }

  function applyActorStatePatch(a: StudioActor, patch: StudioActorPatch): void {
    if (!patch.state || !ACTOR_STATES.includes(patch.state)) return;
    a.authoredStateName = patch.state;
    a.authoredStateAgeS = patch.stateAgeS ?? a.authoredStateAgeS;
    if (!effectLog.length) applyActorState(a, a.authoredStateName, a.authoredStateAgeS);
  }

  function applyActorRecoilPatch(a: StudioActor, patch: StudioActorPatch): void {
    if (patch.recoilAgeS === undefined) return;
    a.recoilAgeS = patch.recoilAgeS;
    a.authoredRecoilAgeS = patch.recoilAgeS;
    if (a.recoilAgeS == null || !a.visual.recoilKick) return;
    a.visual.recoilKick(a.recoilAgeS);
    a.visual.syncFromState(a.state, 0);
  }

  function updateActor(ref: ActorRef, patch: StudioActorPatch = {}): StudioActor | null {
    const a = findActor(ref);
    if (!a) return null;
    applyActorPosePatch(a, patch);
    settleActor(a, patch._drag ? SETTLE_STEPS_DRAG : SETTLE_STEPS);
    applyActorStatePatch(a, patch);
    applyActorRecoilPatch(a, patch);
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
    if (recording || filming) return;
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
    if (!active || filming) return;
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
    if (filming) { e.preventDefault(); return; }
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
    if (filming) return; // an offline film owns the Studio until it ends
    if (e.code === 'F8' && !e.repeat) {
      if (active) { exit(); e.preventDefault(); return; }
      if (game.phase === 'garage') {
        enter().catch((err: RuntimeValue) => console.error('[studio] enter failed', err));
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
  window.addEventListener('cot:layoutchange', invalidate, { passive: true });

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

  function reserveEffectId(id: RuntimeValue): void {
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

  // --- cinematic FX layer (media r5) -------------------------------------------
  function terrainPalette(): string {
    const mapId = getWorld()?.mapId ?? 'verdant';
    if (mapId !== paletteMapId) {
      paletteMapId = mapId;
      // the map's sourced palette, else its own id: sourcedTextures.ts resolveSourcedTerrainPalette, whose unknown-id
      // fallback (verdant) the dust tones share. Not imported: a Studio import splits the world's terrain chunk.
      const splat = (getMapConfig(mapId) as { splat?: { sourcedPalette?: string } }).splat;
      paletteId = splat?.sourcedPalette ?? mapId;
    }
    return paletteId;
  }

  /** Create the Studio-only cinematic layer on first need (never in battle). */
  function ensureCinematics(): StudioCinematics {
    if (cinematics) return cinematics;
    cinematics = createStudioCinematics({
      port: fx.cinematicPort(),
      scene,
      light: ctx.borrowLight?.() ?? null,
      palette: terrainPalette,
      seed: () => sceneMeta.seed || 5000,
    });
    cinematics.setQuality(fxSettings.quality);
    cinematics.setTrackDust(fxSettings.trackDust);
    cinematics.beginEffect(effectFireS);
    return cinematics;
  }

  /** Exit teardown: the cinematic layer returns borrowed lights and shaders. */
  function releaseStudioFx(): void {
    cinematics?.dispose();
    cinematics = null;
    fxSettings = normalizeStudioFx(null);
    trackAdapters.clear();
  }

  /** Whether an effect renders its cinematic layer (per-effect override wins). */
  function cinematicFor(params: StudioEffectParams): boolean {
    if (params.quality === 'cinematic') return true;
    if (params.quality === 'battle') return false;
    return fxSettings.quality === 'cinematic';
  }

  function applyFxSettings(next: StudioFxSettings): void {
    fxSettings = next;
    if (cinematics || next.quality === 'cinematic' || next.trackDust) {
      const layer = ensureCinematics();
      layer.setQuality(next.quality);
      layer.setTrackDust(next.trackDust);
    }
  }

  function cineActor(a: StudioActor): CineActor {
    const st = a.state;
    const dims = a.spec.dims;
    const pivot = a.spec.armor?.turretPivot ?? [0, dims.heightM * 0.7, 0];
    return {
      uid: a.uid, x: st.pos.x, y: st.pos.y, z: st.pos.z, yaw: st.yaw, turretYaw: st.turretYaw ?? 0,
      lengthM: dims.hullLengthM || 7, widthM: dims.widthM || 3.6, heightM: dims.heightM || 2.4,
      pivot: [pivot[0] ?? 0, pivot[1] ?? dims.heightM * 0.7, pivot[2] ?? 0],
    };
  }

  const trackList: CineTrackActor[] = [];
  const _trackSample: ActorTrackSample = { x: 0, z: 0, facingDeg: 0, turretDeg: 0, gunDeg: 0, keyId: undefined };
  // Keyed by the actor, not its uid: load() restarts uids at a1 (studioTrackDust.ts).
  const trackAdapters = createTrackDustAdapters<StudioActor>((actorRef) => {
    const rect = tankContactRect(actorRef.spec);
    return {
      uid: actorRef.uid,
      halfLengthM: rect.halfLength,
      halfWidthM: rect.halfWidth,
      poseAt(tS: number, out: CineTrackSample): boolean {
        const keys = actorRef.timelineTrack?.keys;
        if (!keys || !sampleActorTrack(keys, tS * 1000, _trackSample)) return false;
        out.x = _trackSample.x ?? 0; out.z = _trackSample.z ?? 0;
        out.yawRad = (_trackSample.facingDeg ?? 0) * DEG;
        return true;
      },
    };
  });
  function trackActors(): readonly CineTrackActor[] {
    trackList.length = 0;
    if (!fxSettings.trackDust) return trackList;
    for (const a of actors) {
      const track = a.timelineTrack;
      if (!track || track.keys.length < 2 || a.visual.isDestroyed?.()) continue;
      trackList.push(trackAdapters.adapterFor(a));
    }
    return trackList;
  }

  /**
   * The actor's own smoke-launcher salvo through the game's auxiliary
   * systems (real sockets + smoke ballistics). Vehicles without a kit fire a
   * generic turret-front fan of `count` canisters.
   */
  function smokeSalvo(a: StudioActor, count: number): number[][] {
    const ground = (x: number, z: number) => hfProxy.getHeightAt(x, z);
    const entity = {
      id: a.uid, team: 'studio', spec: a.spec, state: a.state, combat: { destroyed: false },
    } as unknown as AuxiliaryEntity;
    if (requestAuxiliary(entity, 'smoke', clockMs / 1000, ground)) {
      const screen = entity.combat.auxiliary?.smoke;
      if (screen?.canisters?.length) return screen.canisters.map((shot) => [...shot]);
    }
    const st = a.state;
    const yaw = st.yaw + (st.turretYaw ?? 0);
    const out: number[][] = [];
    for (let i = 0; i < count; i++) {
      const spread = count > 1 ? (i / (count - 1) - 0.5) * 1.9 : 0;
      const az = yaw + spread;
      const side = spread >= 0 ? 1 : -1;
      _v1.set(
        st.pos.x + Math.sin(yaw) * 0.6 + Math.cos(yaw) * side * 1.1,
        st.pos.y + a.spec.dims.heightM * 0.82,
        st.pos.z + Math.cos(yaw) * 0.6 - Math.sin(yaw) * side * 1.1,
      );
      _v2.set(Math.sin(az) * Math.cos(0.42), Math.sin(0.42), Math.cos(az) * Math.cos(0.42));
      out.push([...createSmokeCanister(_v1, _v2, ground)]);
    }
    return out;
  }

  function fireSmokeScreen({ id, actor, params }: StudioEffectExecution): boolean {
    if (!actor) return false;
    const salvo = smokeSalvo(actor, Math.round(fxParam('smoke_screen', 'count', params.count)));
    ensureCinematics().smokeScreen(id, salvo, SMOKE_GRAVITY_MPS2, SMOKE_WIND_X, SMOKE_WIND_Z,
      fxParam('smoke_screen', 'durationS', params.durationS), fxParam('smoke_screen', 'density', params.density));
    return true;
  }

  function fireFlare({ id, actor, position, params }: StudioEffectExecution): boolean {
    _v2.copy(position);
    if (actor) _v2.y = actor.state.pos.y + actor.spec.dims.heightM;
    else _v2.y = hfProxy.getHeightAt(_v2.x, _v2.z) + 0.5;
    ensureCinematics().flare(id, _v2, {
      heightM: fxParam('flare', 'heightM', params.heightM),
      burnS: fxParam('flare', 'burnS', params.burnS),
      intensity: fxParam('flare', 'intensity', params.intensity),
      driftMps: fxParam('flare', 'driftMps', params.driftMps),
      fallMps: fxParam('flare', 'fallMps', params.fallMps),
      color: flareColor(params.color),
      launch: params.launch !== false,
    });
    return true;
  }

  function fireEmbers({ id, actor, position, params }: StudioEffectExecution): boolean {
    _v2.copy(position);
    if (actor) _v2.y = actor.state.pos.y + actor.spec.dims.heightM * 0.7;
    else _v2.y = hfProxy.getHeightAt(_v2.x, _v2.z) + 0.3;
    ensureCinematics().embers(id, _v2, fxParam('embers', 'radiusM', params.radiusM), fxParam('embers', 'rate', params.rate),
      fxParam('embers', 'durationS', params.durationS), fxParam('embers', 'rise', params.rise));
    return true;
  }

  function fireDebris({ id, actor, position, params }: StudioEffectExecution): boolean {
    _v2.copy(position);
    if (!actor) _v2.y = hfProxy.getHeightAt(_v2.x, _v2.z) + 0.6;
    ensureCinematics().debris(id, _v2, Math.round(fxParam('debris', 'count', params.count)), fxParam('debris', 'speedMps', params.speedMps),
      fxParam('debris', 'hot', params.hot), fxParam('debris', 'scale', params.scale));
    return true;
  }

  function fireShockwave({ id, position, params }: StudioEffectExecution): boolean {
    ensureCinematics().shockwave(id, position, fxParam('shockwave', 'radiusM', params.radiusM), fxParam('shockwave', 'strength', params.strength));
    return true;
  }

  function fireFireField({ id, position, params }: StudioEffectExecution): boolean {
    ensureCinematics().fireField(id, position, fxParam('fire_field', 'radiusM', params.radiusM), fxParam('fire_field', 'durationS', params.durationS),
      fxParam('fire_field', 'intensity', params.intensity), params.smoke !== false);
    return true;
  }

  function fireActorGun({ id, actor, params }: StudioEffectExecution): boolean {
    if (!actor) return false;
    const slot = Math.max(0, Math.min(
      actor.spec.gun.shells.length - 1,
      (params.slot ?? 0) | 0,
    ));
    const shellSpec = actor.spec.gun.shells[slot];
    const launcher = usesLauncherMuzzles(actor.spec.gun, shellSpec);
    let muzzleIndex: number | null = launcher
      ? launcherMuzzleIndex(actor.spec.gun, shellSpec, actor.launcherCursor ?? 0) : null;
    if (muzzleIndex != null) actor.launcherCursor = muzzleIndex + 1;
    if (params.recoil !== false && actor.visual.recoilKick) {
      muzzleIndex = actor.visual.recoilKick(0, 1, muzzleIndex ?? undefined, launcher);
      actor.visual.syncFromState(actor.state, 0);
    }
    actor.visual.gunMuzzleWorld(_v2, muzzleIndex != null ? muzzleIndex : undefined, usesLauncherMuzzles(actor.spec.gun, shellSpec));
    actor.visual.gunDirWorld(_v3, muzzleIndex ?? undefined, launcher);
    const shellId = -(uidSeq * 100000 + shells.length + 1);
    fxBus.emit('shell:fired', {
      shellId,
      shooterId: actor.uid,
      isPlayer: false,
      shellType: shellSpec.type,
      shellName: shellSpec.name,
      rocket: isUnguidedRocket(actor.spec.gun, shellSpec),
      weaponSound: shellSpec.soundProfile || actor.spec.gun.soundProfile || null,
      caliberMm: shellSpec.caliberMm,
      muzzlePos: [_v2.x, _v2.y, _v2.z],
      dir: [_v3.x, _v3.y, _v3.z],
    });
    filmCue('cannon', _v2.x, _v2.y, _v2.z, shellSpec.caliberMm);
    if (cinematicFor(params) && !isUnguidedRocket(actor.spec.gun, shellSpec)) {
      ensureCinematics().muzzleBlast(id, _v2, _v3, shellSpec.caliberMm);
    }
    if (params.tracer !== false) {
      const shell = createShell(shellSpec, actor.uid, false, _v2, _v3, shellId);
      shell.rocket = isUnguidedRocket(actor.spec.gun, shellSpec);
      shells.push(shell);
    }
    return true;
  }

  function fireMuzzleFlash({ id, actor, position, params }: StudioEffectExecution): boolean {
    if (actor) {
      actor.visual.gunMuzzleWorld(_v2);
      actor.visual.gunDirWorld(_v3);
    } else {
      _v2.copy(position);
      const direction = (params.dirDeg || 0) * DEG;
      _v3.set(Math.sin(direction), 0, Math.cos(direction));
    }
    const caliberMm = params.caliberMm || (actor ? actor.spec.gun.caliberMm : 120);
    fx.muzzleFlash(_v2, _v3, caliberMm);
    filmCue('cannon', _v2.x, _v2.y, _v2.z, caliberMm);
    if (cinematicFor(params)) ensureCinematics().muzzleBlast(id, _v2, _v3, caliberMm);
    return true;
  }

  function fireTracer({ input, params }: StudioEffectExecution): boolean {
    const from = params.from || input.from;
    const to = params.to || input.to;
    if (!from || !to) return false;
    _v2.set(from[0], from[1], from[2]);
    _v3.set(to[0], to[1], to[2]).sub(_v2).normalize();
    const type = params.shellType || 'AP';
    const spec = {
      name: 'studio',
      type,
      tracer: type,
      velocityMps: params.speedMps || 900,
      caliberMm: params.caliberMm || 105,
    };
    const shellId = -(uidSeq * 100000 + shells.length + 1);
    const shell: StudioShell = createShell(
      spec, 'studio', !!params.isPlayer, _v2, _v3, shellId,
    );
    shell._studioMaxDistM = _v2.distanceTo(_v1.set(to[0], to[1], to[2]));
    shells.push(shell);
    return true;
  }

  function fireImpact(
    execution: StudioEffectExecution,
    defaultKind: string,
    defaultCaliberMm: number,
    normal: readonly [number, number, number],
  ): boolean {
    const { id, actor, position, params } = execution;
    const impactNormal = params.normal || normal;
    _v2.set(impactNormal[0], impactNormal[1], impactNormal[2]).normalize();
    const kind = params.kind || defaultKind;
    const caliberMm = params.caliberMm || defaultCaliberMm;
    fxBus.emit('shell:hit', {
      shellId: null,
      targetId: actor ? actor.uid : null,
      kind,
      caliberMm,
      damage: 0,
      pos: [position.x, position.y, position.z],
      normal: [_v2.x, _v2.y, _v2.z],
    });
    filmCue(kind === 'pen' ? 'pen' : kind === 'ricochet' ? 'ricochet' : kind === 'era' ? 'era'
      : kind === 'terrain' ? 'dirt' : kind === 'he_pen' || kind === 'he_splash' ? 'he' : 'nonpen',
    position.x, position.y, position.z, caliberMm);
    if (cinematicFor(params)) ensureCinematics().impact(id, kind, position, _v2, caliberMm);
    return true;
  }

  function fireExplosion({ id, position, params }: StudioEffectExecution): boolean {
    const size = params.size || 'large';
    filmCue(size === 'small' ? 'he' : 'tank', position.x, position.y, position.z, 122,
      size === 'small' ? undefined : size === 'medium' ? 'shot' : (params.cause === 'fire' || params.cause === 'shot' ? params.cause : 'ammorack'));
    // destruction-fx lane: a burst of a named munition class (the gunship's howitzer, an ATGM, a drone, a 30 mm HE
    // round ...) at its nominal charge or params.chargeKg, as the battle's shells end on the ground
    if (typeof params.munition === 'string' && params.munition in MUNITION_PROFILES) {
      const munition = params.munition as MunitionClass;
      const chargeKg = Number.isFinite(params.chargeKg) ? Number(params.chargeKg) : MUNITION_PROFILES[munition].nominalChargeKg;
      // params.wall: the round ends on the nearest building's wall instead, as a battle shell does (the burst names the
      // building, the expiry carries the struck face's normal): along dirDeg from the point, params.hitH m up the wall
      const wall = params.wall ? studioWallHit(position, (params.dirDeg ?? 0) * DEG, params.hitH) : null;
      if (wall) {
        fxBus.emit(DESTRUCTION_BUS_EVENTS.blast, {
          munition, chargeKg, x: wall.x, y: wall.y, z: wall.z, nx: wall.nx, ny: 0, nz: wall.nz,
          surface: 'structure', structureId: wall.structureId,
        });
        fxBus.emit('shell:expired', {
          shellId: -1,
          hitTerrain: false,
          hitKind: 'prop',
          pos: [wall.x, wall.y, wall.z],
          normal: [wall.nx, 0, wall.nz],
          munition,
          chargeKg,
          caliberMm: params.caliberMm || 120,
          surfaceKind: 'structure',
        });
        return true;
      }
      // params.settled: the crater as a late joiner lays it down (crater-render-spec §D/§F): dug, drawn at its final
      // state, no blast, no burst, no ejecta
      if (params.settled) {
        const dug = studioDig(munition, chargeKg, position.x, position.z);
        const ageS = Number.isFinite(params.ageS) && (params.ageS as number) >= 0 ? (params.ageS as number) : null;
        if (dug) fxBus.emit(DESTRUCTION_BUS_EVENTS.crater, { ...dug, settled: true, ...(ageS !== null ? { ageS } : {}) });
        return true;
      }
      // the crater the battle would dig here, in the battle's order: the blast naming it, the burst, then the crater
      const crater = studioDig(munition, chargeKg, position.x, position.z);
      fxBus.emit(DESTRUCTION_BUS_EVENTS.blast, {
        munition, chargeKg, x: position.x, y: position.y, z: position.z, nx: 0, ny: 1, nz: 0, surface: 'ground',
        ...(crater ? { craterId: crater.craterId } : {}),
      });
      fxBus.emit('shell:expired', {
        shellId: -1,
        hitTerrain: true,
        pos: [position.x, position.y, position.z],
        munition,
        chargeKg,
        caliberMm: params.caliberMm || 120,
      });
      if (crater) fxBus.emit(DESTRUCTION_BUS_EVENTS.crater, crater);
      return true;
    }
    if (size === 'small') {
      fxBus.emit('shell:expired', {
        shellId: -1,
        hitTerrain: true,
        pos: [position.x, position.y, position.z],
      });
    } else {
      // a shell burst (cause 'shot') has no wreck to burn: its column is smoke only (2026-10-03, the floating fire)
      fx.destruction(position, null, size === 'medium' ? 'shot' : (params.cause || 'ammorack'), null,
        { shellBurst: params.cause === 'shot' });
    }
    // `huge` (fuel / ammunition cook-off column) only exists as a cinematic recipe
    if (size === 'huge' || cinematicFor(params)) ensureCinematics().explosion(id, position, size, params.cause);
    return true;
  }

  /**
   * Craters in the Studio (destruction core lane, 2026-10-08; crater-render-spec §F's strips): a burst of a munition
   * class digs what the battle would dig at that point — the simulation's law, quantization and seed
   * (sim/destructionMatch.ts dig and quantizeCrater: radius at least CRATER_DEFORM_MIN_RADIUS_M, never on hard ground,
   * the ruleset's crater switch and scale) — on a ground overlay of the Studio's own, bound to the world while the Studio digs, so the
   * drawn terrain, the ground cover and the crater's surface follow it as they do in battle. A scene reload levels it;
   * leaving the Studio unbinds it (the next battle binds its own). The Studio's hulls keep the undug ground.
   */
  let studioGround: TerrainDeformation | null = null;
  let studioCraters = 0;
  const studioCraterShape = { radiusM: 0, depthM: 0, rimM: 0 };
  const studioCraterDug: QuantizedCrater = { x: 0, z: 0, radiusM: 0, depthM: 0, rimM: 0, seed: 0 };
  function studioDig(munition: MunitionClass, chargeKg: number, x: number, z: number): TerrainCraterEvent | null {
    const rules = matchRulesetFor('standard').destruction;
    const w = getWorld();
    if (!rules.craters || !w || !(chargeKg > 0) || studioCraters >= rules.maxCraters) return null;
    craterFor(chargeKg, munition, rules.craterScale, studioCraterShape);
    if (studioCraterShape.radiusM < CRATER_DEFORM_MIN_RADIUS_M) return null;
    if (w.heightField?.getGroundType?.(x, z) === 'hard') return null;
    if (!studioGround) studioGround = createTerrainDeformation();
    if (w.groundOverlay() !== studioGround) w.bindGroundOverlay(studioGround);
    const { x: qx, z: qz, radiusM, depthM, rimM, seed } = quantizeCrater(x, z, studioCraterShape, studioCraterDug);
    if (!studioGround.addCrater(qx, qz, radiusM, depthM, rimM, seed)) return null;
    return { craterId: studioCraters++, x: qx, z: qz, radiusM, depthM, rimM, seed, munition, deforms: true };
  }
  function resetStudioGround(unbind: boolean): void {
    studioCraters = 0;
    if (!studioGround) return;
    studioGround.reset();
    const w = getWorld();
    if (unbind && w && w.groundOverlay() === studioGround) w.bindGroundOverlay(null);
  }

  /**
   * destruction-fx lane: the building nearest the point crosses a damage stage, as the core's sim announces one in
   * battle (sim/destructionEvents.ts StructureStageEvent, from the world seam's anatomy: footprint, height, blow), so
   * the Studio films a breach and a collapse in the building's own geometry. Presentation only: the Studio's world
   * keeps its collision. params: stage, munition, cause ('blast' | 'kinetic' | 'ram'), dirDeg (the blow's heading), hitH
   * (the blow's height up the wall).
   */
  const studioStages = new Map<number, StructureStage>();
  /** The building whose footprint centre is nearest the point, with its anatomy (the world seam's), or null. */
  function studioStructureNear(position: THREE.Vector3): { id: number; anatomy: StudioStructureAnatomy } | null {
    const w = getWorld() as unknown as {
      getObstacles?(): readonly { min: readonly number[]; max: readonly number[]; structureIdx?: number; structureRole?: string }[];
      structureDamage?(id: number): { anatomy: StudioStructureAnatomy } | null;
    } | null;
    if (!w?.getObstacles || !w.structureDamage) return null;
    let best = -1, bestD = Infinity;
    for (const rec of w.getObstacles()) {
      if (typeof rec.structureIdx !== 'number' || rec.structureRole === 'fixed') continue;
      const cx = (rec.min[0] + rec.max[0]) / 2, cz = (rec.min[2] + rec.max[2]) / 2;
      const d = Math.hypot(cx - position.x, cz - position.z);
      if (d < bestD) { bestD = d; best = rec.structureIdx; }
    }
    const seam = best >= 0 ? w.structureDamage(best) : null;
    return seam ? { id: best, anatomy: seam.anatomy } : null;
  }

  /**
   * Where a round heading `heading` from the point meets the nearest building's wall (its oriented footprint, the
   * anatomy's body frame), `hitH` m above its base (default 1.8, kept under the eaves), with the struck face's outward
   * normal; null when the line misses it.
   */
  function studioWallHit(position: THREE.Vector3, heading: number, hitH: unknown):
    { structureId: number; x: number; y: number; z: number; nx: number; nz: number } | null {
    const near = studioStructureNear(position);
    if (!near) return null;
    const a = near.anatomy;
    const { x: px, y: py, z: pz, yaw } = a.placement;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    // world = R(yaw) body + placement (three's rotateY); the inverse rotation into the body frame
    const rx = position.x - px, rz = position.z - pz;
    const bx = rx * c - rz * s, bz = rx * s + rz * c;
    const dx = Math.sin(heading), dz = Math.cos(heading);
    const bdx = dx * c - dz * s, bdz = dx * s + dz * c;
    const hw = a.w / 2, hd = a.d / 2;
    const slab = (o: number, d: number, h: number): [number, number] => {
      if (Math.abs(d) < 1e-9) return Math.abs(o) <= h ? [-Infinity, Infinity] : [Infinity, -Infinity];
      const t0 = (-h - o) / d, t1 = (h - o) / d;
      return t0 < t1 ? [t0, t1] : [t1, t0];
    };
    const [x0, x1] = slab(bx, bdx, hw), [z0, z1] = slab(bz, bdz, hd);
    const tIn = Math.max(x0, z0), tOut = Math.min(x1, z1);
    if (!(tIn <= tOut) || tOut < 0) return null;
    const t = Math.max(0, tIn);
    // the face entered: the slab whose entry is the later one
    const nbx = x0 >= z0 ? -Math.sign(bdx) : 0, nbz = x0 >= z0 ? 0 : -Math.sign(bdz);
    const hx = bx + bdx * t, hz = bz + bdz * t;
    const h = Number.isFinite(hitH) ? Number(hitH) : 1.8;
    return {
      structureId: near.id,
      x: px + hx * c + hz * s, z: pz - hx * s + hz * c,
      y: py + Math.min(Math.max(0.6, a.h - 0.8), Math.max(0.4, h)),
      nx: nbx * c + nbz * s, nz: -nbx * s + nbz * c,
    };
  }

  function fireStructure({ position, params }: StudioEffectExecution): boolean {
    const near = studioStructureNear(position);
    if (!near) return false;
    const best = near.id;
    const a = near.anatomy;
    const stage = (params.stage === 'damaged' || params.stage === 'breached' ? params.stage : 'collapsed') as StructureStage;
    const munition = (typeof params.munition === 'string' && params.munition in MUNITION_PROFILES ? params.munition : 'he') as MunitionClass;
    const cause = params.cause === 'ram' || params.cause === 'kinetic' ? params.cause : 'blast';
    const heading = (params.dirDeg ?? 0) * DEG;
    const e: StructureStageEvent = {
      structureId: best, massClass: a.massClass as StructureStageEvent['massClass'],
      cx: a.placement.x, cz: a.placement.z, hw: a.w / 2, hd: a.d / 2, yaw: a.placement.yaw,
      baseY: a.placement.y, topY: a.placement.y + a.h,
      stage, previous: studioStages.get(best) ?? 'intact', cause, munition: cause === 'ram' ? null : munition,
      // the blow's point: params.hitH m up the wall when given (where a wall strike burst), else the effect point
      x: position.x, y: Number.isFinite(params.hitH) ? a.placement.y + Number(params.hitH) : position.y, z: position.z,
      dirX: Math.sin(heading), dirZ: Math.cos(heading),
      points: 100, integrity: stage === 'collapsed' ? 0 : stage === 'breached' ? 0.35 : 0.7,
    };
    studioStages.set(best, stage);
    fxBus.emit(DESTRUCTION_BUS_EVENTS.stage, e);
    return true;
  }

  function fireTankKill({ id, actor, params }: StudioEffectExecution): boolean {
    if (!actor) return false;
    _v2.copy(actor.state.pos);
    fx.destruction(_v2, actor.visual, params.cause || 'ammorack');
    filmCue('tank', _v2.x, _v2.y, _v2.z, actor.spec.gun.caliberMm,
      params.cause === 'fire' || params.cause === 'shot' ? params.cause : 'ammorack');
    if (cinematicFor(params)) ensureCinematics().tankKill(id, cineActor(actor), params.cause || 'ammorack');
    actor.visual.setDestroyed({ pop: params.pop !== false, ageS: 0 });
    actor.stateName = params.pop !== false ? 'turret-popped' : 'wrecked';
    actor.stateAgeS = 0;
    panel.refreshActors();
    return true;
  }

  function fireDust({ id, actor, position, params }: StudioEffectExecution): boolean {
    const count = params.count != null ? params.count : 10;
    const direction = (params.dirDeg || 0) * DEG;
    _v3.set(Math.sin(direction), 0, Math.cos(direction));
    _v2.copy(position);
    if (actor) _v2.y = actor.state.pos.y + 0.3;
    for (let index = 0; index < count; index += 1) {
      fx.dust(_v2, _v3, params.intensity != null ? params.intensity : 1);
    }
    if (cinematicFor(params)) {
      ensureCinematics().dustBurst(id, _v2, params.dirDeg || 0, params.intensity != null ? params.intensity : 1, count);
    }
    return true;
  }

  function fireEngineSmoke({ actor, params }: StudioEffectExecution): boolean {
    if (!actor) return false;
    actor.smoking = !params.off;
    if (actor.stateName === 'intact' && actor.smoking) actor.stateName = 'engine-smoking';
    else if (actor.stateName === 'engine-smoking' && !actor.smoking) actor.stateName = 'intact';
    if (actor.smoking) {
      _fwd.set(Math.sin(actor.state.yaw), 0, Math.cos(actor.state.yaw));
      _v2.copy(actor.state.pos).addScaledVector(_fwd, -actor.spec.dims.hullLengthM * 0.42);
      _v2.y += actor.spec.dims.heightM * 0.72;
      for (let index = 0; index < 8; index += 1) fx.exhaust(_v2, 1, true);
    }
    panel.refreshActors();
    return true;
  }

  function fireBurning({ id, actor, params }: StudioEffectExecution): boolean {
    if (!actor) return false;
    if (params.off) {
      actor.burning = false;
      fxBus.emit('tank:fire', { id: actor.uid, burning: false });
      if (actor.stateName === 'burning') actor.stateName = 'intact';
    } else {
      igniteColumn(actor);
      if (actor.stateName === 'intact') actor.stateName = 'burning';
    }
    if (cinematics || cinematicFor(params)) {
      if (params.off) cinematics?.burning(id, cineActor(actor), false);
      else if (cinematicFor(params)) ensureCinematics().burning(id, cineActor(actor), true);
    }
    panel.refreshActors();
    return true;
  }

  function fireDetrack({ actor, params }: StudioEffectExecution): boolean {
    if (!actor) return false;
    const side = (params.side || 'R').toUpperCase() === 'L' ? 'trackL' : 'trackR';
    actor.visual.setTrackState?.(side, true);
    fxBus.emit('shell:hit', {
      targetId: actor.uid,
      kind: 'nonpen',
      caliberMm: 20,
      damage: 0,
      pos: [actor.state.pos.x, actor.state.pos.y + 0.6, actor.state.pos.z],
      normal: [0, 1, 0],
    });
    fxBus.emit('module:state', { id: actor.uid, module: side, state: 'red' });
    return true;
  }

  function fireFiringMoment({ id, actor, params }: StudioEffectExecution): boolean {
    if (!actor) return false;
    const shellSpec = actor.spec.gun.shells[Math.max(0, Math.min(actor.spec.gun.shells.length - 1, (params.slot ?? 0) | 0))];
    const launcher = usesLauncherMuzzles(actor.spec.gun, shellSpec);
    const tube = launcher ? launcherMuzzleIndex(actor.spec.gun, shellSpec, actor.launcherCursor ?? 0) : undefined;
    if (tube != null) actor.launcherCursor = tube + 1;
    const muzzleIndex = actor.visual.recoilKick?.(
      params.ageS != null ? params.ageS : 0.05, 1, tube, launcher,
    ) ?? null;
    actor.visual.syncFromState(actor.state, 0);
    actor.visual.gunMuzzleWorld(_v2, muzzleIndex != null ? muzzleIndex : undefined, usesLauncherMuzzles(actor.spec.gun, shellSpec));
    actor.visual.gunDirWorld(_v3, muzzleIndex ?? undefined, launcher);
    fx.composeFiringMoment({
      muzzlePos: _v2.clone(),
      dir: _v3.clone(),
      caliberMm: params.caliberMm || shellSpec.caliberMm,
      tracerType: params.shellType || shellSpec.type,
      rocket: isUnguidedRocket(actor.spec.gun, shellSpec),
      velocityMps: shellSpec.velocityMps,
      ageS: params.ageS != null ? params.ageS : 0.05,
    });
    if (cinematicFor(params) && !isUnguidedRocket(actor.spec.gun, shellSpec)) {
      ensureCinematics().muzzleBlast(id, _v2, _v3, params.caliberMm || shellSpec.caliberMm, params.ageS != null ? params.ageS : 0.05);
    }
    return true;
  }

  function fireExplosionMoment({ id, position, params }: StudioEffectExecution): boolean {
    fx.composeExplosionMoment({
      pos: position.clone(),
      ageS: params.ageS != null ? params.ageS : 0.6,
    });
    if (cinematicFor(params)) ensureCinematics().explosionMoment(id, position, params.ageS != null ? params.ageS : 0.6);
    return true;
  }

  function fireMgBurst({ id, actor, params }: StudioEffectExecution): boolean {
    if (!actor) return false;
    actor.visual.gunMuzzleWorld(_v2);
    actor.visual.gunDirWorld(_v3);
    fx.muzzleFlash(_v2, _v3, params.caliberMm || 25);
    const count = Math.max(1, Math.min(14, params.count != null ? params.count : 7));
    const gapM = params.gapM != null ? params.gapM : 7;
    if (cinematicFor(params)) ensureCinematics().mgBurst(id, _v2, _v3, count, gapM, params.speedMps || 820);
    const spread = (params.spreadDeg != null ? params.spreadDeg : 0.9) * DEG;
    for (let index = 0; index < count; index += 1) {
      const spec = {
        name: 'studio-mg', type: 'AP', tracer: 'AP',
        velocityMps: params.speedMps || 820,
        caliberMm: params.caliberMm || 12.7,
      };
      const yaw = ((index % 3) - 1) * spread;
      const pitch = (index % 2 ? 0.45 : -0.35) * spread;
      const direction = _v3.clone().applyAxisAngle(_up, yaw);
      direction.y += pitch;
      direction.normalize();
      const from = _v2.clone().addScaledVector(direction, 2 + index * gapM);
      const shell = createShell(
        spec, actor.uid, false, from, direction,
        -(uidSeq * 100000 + shells.length + 1),
      );
      shell.distM = 2 + index * gapM;
      shells.push(shell);
    }
    return true;
  }

  function fireBarrage({ id, position, params }: StudioEffectExecution): boolean {
    const count = Math.max(1, Math.min(12, params.count != null ? params.count : 5));
    const radius = params.radiusM != null ? params.radiusM : 10;
    const size = params.size || 'mixed';
    if (cinematicFor(params)) {
      // a walking salvo: staggered cinematic bursts, no wreck smoke columns
      ensureCinematics().barrage(id, position, count, radius, size, params.seedDeg || 23,
        fxParam('barrage', 'durationS', params.durationS));
      return true;
    }
    const seedAngle = (params.seedDeg || 23) * DEG;
    for (let index = 0; index < count; index += 1) {
      const angle = seedAngle + (index / count) * Math.PI * 2;
      const distance = radius * (0.3 + 0.7 * (((index * 37) % 10) / 10));
      const x = position.x + Math.sin(angle) * distance;
      const z = position.z + Math.cos(angle) * distance;
      const y = hfProxy.getHeightAt(x, z) + 0.05;
      const medium = size === 'medium' || (size === 'mixed' && index % 3 === 0);
      if (medium) fx.destruction(_v2.set(x, y, z), null, 'shot', null, { shellBurst: true });
      else fxBus.emit('shell:expired', { shellId: -1, hitTerrain: true, pos: [x, y, z] });
    }
    return true;
  }

  function fireArmorScar({ actor, params }: StudioEffectExecution): boolean {
    if (!actor) return false;
    const count = Math.max(1, Math.min(10, params.count != null ? params.count : 4));
    const reach = Math.max(
      actor.spec.dims.widthM || 3.6,
      actor.spec.dims.hullLengthM || 7,
    ) * 0.62;
    const seedAngle = (params.seedDeg || 0) * DEG;
    for (let index = 0; index < count; index += 1) {
      const angle = seedAngle + ((index * 137) % 360) * DEG;
      const heightFraction = 0.3 + 0.42 * (((index * 53) % 10) / 10);
      _v3.set(Math.sin(angle), 0.14, Math.cos(angle)).normalize();
      _v2.copy(actor.state.pos);
      _v2.y += actor.spec.dims.heightM * heightFraction;
      _v2.addScaledVector(_v3, reach);
      fx.armorScar(actor.visual, _v2, _v3, params.caliberMm || 100);
    }
    return true;
  }

  // ---- destruction core lane (P2, docs/DESTRUCTION.md §11): the Studio films the sim's own destruction ----
  /** The Studio's destruction match over the world it shows (game/studioDestruction.ts), made for each world. */
  let studioSim: StudioDestruction | null = null;
  let studioSimWorld: WorldRuntime | null = null;
  /** The sections switch the current match was made with (a scene that changes it gets a new match). */
  let studioSimSections = true;
  /** The Studio destruction's raised events, with the Studio clock they were raised at (cleared with the fx runtime). */
  const studioSimLog: Array<{ tMs: number; event: string; structureId: number | null; section: number | null; hole: number | null;
    stage: string | null; sectionDown: boolean; storeyDown: boolean }> = [];
  function studioDestructionNow(): StudioDestruction | null {
    const w = getWorld();
    if (!w) return null;
    if (studioSimWorld !== w || studioSimSections !== sceneMeta.sections) {
      ensureFxBus();
      // every stage and breach it raises is logged with the Studio's clock (a capture tool reads which events each frame
      // presented: __STUDIO.destructionEvents) and goes on to the fx bus
      const loggingBus = { emit: (event: string, payload: unknown) => {
        const p = payload as { structureId?: number; section?: number; hole?: number; stage?: string; sectionDown?: boolean; storeyDown?: boolean };
        studioSimLog.push({ tMs: clockMs, event, structureId: p.structureId ?? null, section: p.section ?? null, hole: p.hole ?? null,
          stage: p.stage ?? null, sectionDown: p.sectionDown === true, storeyDown: p.storeyDown === true });
        if (studioSimLog.length > 512) studioSimLog.shift();
        fxBus.emit(event, payload);
      } };
      // a collapse raises the sim's rubble mound on the Studio's ground overlay, bound to the world as a battle's is, so
      // the drawn terrain and the kit's pile stand on it (the s1t strips' piles lay flat on undeformed ground)
      if (!studioGround) studioGround = createTerrainDeformation();
      if (w.groundOverlay() !== studioGround) w.bindGroundOverlay(studioGround);
      studioSim = createStudioDestruction(w as unknown as Parameters<typeof createStudioDestruction>[0], loggingBus, {
        rules: matchRulesetFor('standard').destruction,
        wallMaterial: wallMaterialForStyle(architectureStyleOf(getMapConfig(w.mapId))),
        ground: studioGround,
        sections: sceneMeta.sections,
      });
      studioSimWorld = w;
      studioSimSections = sceneMeta.sections;
    }
    return studioSim;
  }
  const _strikePrev = new THREE.Vector3();
  const _strikeDir = new THREE.Vector3();
  const _strikeFrom = new THREE.Vector3();
  /** Light cover one strike round may break in a step before the rest of its path is left for the next. */
  const STRIKE_PASS_THROUGH_MAX = 8;
  /**
   * A battle round passes light cover (world/collision.ts shellPassesThroughCollisionRecord, restated here: the Studio
   * reaches the world through what it is handed, never a new static import; studioStrikeCover.selftest.mjs holds the
   * two to one law): a crushable record that is not dense masonry, adobe or sandbag cover, a stone or a pillbox.
   */
  function strikePassesRecord(record: { crushable?: boolean; kind?: string } | null | undefined): boolean {
    if (record?.crushable !== true) return false;
    const kind = record.kind;
    return !(kind === 'wallstone' || kind === 'walladobe' || kind === 'sandbagsmall' || kind === 'sandbagbig' || kind === 'sandbagwall'
      || kind === 'small-rock' || kind === 'bunker');
  }
  /**
   * A strike round's step from `from` to `to` through the world: light cover it meets — a hut, a fence, a tree, crates —
   * breaks and lets it on, as a battle round's does (state.ts crushWorldPropFromShell: the world's own crush, the
   * destructible's broken state); the first solid record (a building's wall, dense cover) stops it there and takes the
   * strike. True when it stopped.
   */
  function traceStrikeRound(sh: StudioShell, world: Pick<WorldRuntime, 'raycast'> & { crushObstacle?: WorldRuntime['crushObstacle'] },
    from: THREE.Vector3, to: THREE.Vector3): boolean {
    _strikeDir.subVectors(to, from);
    let left = _strikeDir.length();
    if (left <= 1e-6) return false;
    _strikeDir.multiplyScalar(1 / left);
    _strikeFrom.copy(from);
    for (let pass = 0; pass < STRIKE_PASS_THROUGH_MAX; pass++) {
      const hit = world.raycast(_strikeFrom, _strikeDir, left);
      if (!hit || hit.kind === 'terrain') return false;
      if (strikePassesRecord(hit.record) && world.crushObstacle) {
        world.crushObstacle(hit.record, _strikeDir.x, _strikeDir.z, Number(sh.spec?.velocityMps) || 0, 'shell');
        const step = hit.dist + 0.01;
        _strikeFrom.addScaledVector(_strikeDir, step);
        left -= step;
        if (left <= 1e-6) return false;
        continue;
      }
      sh.dead = true;
      sh.pos.copy(hit.point);
      strikeWorld(sh, hit, _strikeDir);
      return true;
    }
    return false;
  }
  /**
   * A round flying through the Studio's world as a battle round does: from the effect point along dirDeg (pitchDeg up)
   * at speedMps, traced against the world each step — whose raycast reads the sim's openings, so a round finds a hole
   * and crosses the room — and where it stops a structure takes the sim's own strike (the hole, a section's fall, its
   * stages, raised on the bus as the solo step raises them). params.shell: the round ({ type, caliberMm, name?,
   * blastRadiusM?, pen100Mm? }: 'HE' 125 mm by default; an explicit blastRadiusM makes a howitzer's envelope).
   */
  function fireStrike({ position, params }: StudioEffectExecution): boolean {
    if (!studioDestructionNow()) return false;
    const heading = (Number(params.dirDeg) || 0) * DEG, pitch = (Number(params.pitchDeg) || 0) * DEG;
    _v3.set(Math.sin(heading) * Math.cos(pitch), Math.sin(pitch), Math.cos(heading) * Math.cos(pitch));
    const given = (params.shell && typeof params.shell === 'object' ? params.shell : {}) as Partial<MunitionShellLike> & { velocityMps?: number };
    const spec = {
      name: typeof given.name === 'string' ? given.name : 'studio', type: typeof given.type === 'string' ? given.type : 'HE',
      caliberMm: Number(given.caliberMm) || 125, velocityMps: Number(params.speedMps) || Number(given.velocityMps) || 800,
      tracer: params.tracer === false ? null : (typeof given.type === 'string' ? given.type : 'HE'),
      ...(Number.isFinite(given.blastRadiusM) ? { blastRadiusM: Number(given.blastRadiusM) } : {}),
      ...(Number.isFinite(given.pen100Mm) ? { pen100Mm: Number(given.pen100Mm) } : {}),
    };
    const shellId = -(uidSeq * 100000 + shells.length + 1);
    const shell: StudioShell = createShell(spec, 'studio', false, position, _v3, shellId);
    shell._studioWorld = true;
    shell._studioMaxDistM = Number.isFinite(params.rangeM) ? Number(params.rangeM) : 600;
    shells.push(shell);
    return true;
  }
  /**
   * A strike round met the ground (2026-10-09; it used to expire there as a plain impact): the sim's strike at the burst
   * — the structures in its reach take its blast, the light props in its reach fall (studioDestruction.ts, the solo
   * step's fellBlastProps) — then the crater the battle would dig and the blast naming it. The crater is the Studio's own
   * (studioDig: one crater count with the explosion effects), so the sim digs none.
   */
  function strikeGround(sh: StudioShell): TerrainCraterEvent | null {
    const spec = sh.spec as unknown as MunitionShellLike;
    const munition = munitionClassForShell(spec), chargeKg = munitionChargeKg(spec, munition);
    const dx = sh.pos.x - _strikePrev.x, dz = sh.pos.z - _strikePrev.z, length = Math.hypot(dx, dz) || 1;
    studioDestructionNow()?.strike(spec, null, sh.pos.x, sh.pos.y, sh.pos.z, dx / length, dz / length, false);
    if (!(chargeKg > 0)) return null;
    const crater = studioDig(munition, chargeKg, sh.pos.x, sh.pos.z);
    fxBus.emit(DESTRUCTION_BUS_EVENTS.blast, {
      munition, chargeKg, x: sh.pos.x, y: sh.pos.y, z: sh.pos.z, nx: 0, ny: 1, nz: 0, surface: 'ground',
      ...(crater ? { craterId: crater.craterId } : {}),
    });
    return crater;
  }
  /** A strike round met the world at `hit` (a record, not the ground): the sim's strike, then the burst where it stopped. */
  function strikeWorld(sh: StudioShell, hit: { point: THREE.Vector3; normal: THREE.Vector3; record?: { structureIdx?: number } | null },
    dir: THREE.Vector3): void {
    const spec = sh.spec as unknown as MunitionShellLike;
    const record = (hit.record ?? null) as Parameters<StudioDestruction['strike']>[1];
    studioDestructionNow()?.strike(spec, record, hit.point.x, hit.point.y, hit.point.z, dir.x, dir.z);
    const munition = munitionClassForShell(spec), chargeKg = munitionChargeKg(spec, munition);
    const structureId = typeof hit.record?.structureIdx === 'number' ? hit.record.structureIdx : undefined;
    if (chargeKg > 0) {
      fxBus.emit(DESTRUCTION_BUS_EVENTS.blast, {
        munition, chargeKg, x: hit.point.x, y: hit.point.y, z: hit.point.z, nx: hit.normal.x, ny: hit.normal.y, nz: hit.normal.z,
        surface: structureId !== undefined ? 'structure' : 'prop', ...(structureId !== undefined ? { structureId } : {}),
      });
    }
    fxBus.emit('shell:expired', {
      shellId: sh.id, hitTerrain: false, hitKind: 'prop', pos: [hit.point.x, hit.point.y, hit.point.z],
      normal: [hit.normal.x, hit.normal.y, hit.normal.z], shellType: spec.type, caliberMm: spec.caliberMm, munition, chargeKg,
      surfaceKind: structureId !== undefined ? 'structure' : 'prop',
    });
  }

  /**
   * A hull ramming the building in front of it (P2 staging; wave 277: the ram strip must show the ramming tank): from the
   * actor's nose (half a hull length ahead along its facing, a metre up) a few metres ahead (params.reachM, 3 m); where
   * that meets a structure the sim prices the ram at params.speedMps (the closing speed, 10 m/s) for params.massTons (the
   * actor's hull weight): a ram that brings it down sends it through its cascade, its stages raised as the ram's. The
   * actor's own motion is the storyboard's: its track runs it into the wall and on.
   */
  function fireRam({ actor, params }: StudioEffectExecution): boolean {
    const sim = studioDestructionNow();
    const w = getWorld();
    if (!actor || !sim || !w) return false;
    _fwd.set(Math.sin(actor.state.yaw), 0, Math.cos(actor.state.yaw));
    _v2.copy(actor.state.pos).addScaledVector(_fwd, actor.spec.dims.hullLengthM / 2 - 0.5);
    _v2.y += 1;
    const hit = w.raycast(_v2, _fwd, Number.isFinite(params.reachM) ? Math.max(0.5, Number(params.reachM)) : 3);
    const record = hit && hit.kind !== 'terrain' ? (hit.record ?? null) : null;
    if (!hit || !record || typeof record.structureIdx !== 'number') return false;
    const massTons = Number(params.massTons) > 0 ? Number(params.massTons) : (Number(actor.spec.weightTons) || 50);
    const speed = Number(params.speedMps) > 0 ? Number(params.speedMps) : 10;
    sim.ram(record as Parameters<StudioDestruction['ram']>[0], massTons, speed, hit.point.x, hit.point.y, hit.point.z, _fwd.x, _fwd.z);
    return true;
  }

  function fireExhaust({ actor, params }: StudioEffectExecution): boolean {
    if (!actor) return false;
    _fwd.set(Math.sin(actor.state.yaw), 0, Math.cos(actor.state.yaw));
    _v2.copy(actor.state.pos).addScaledVector(_fwd, -actor.spec.dims.hullLengthM * 0.42);
    _v2.y += actor.spec.dims.heightM * 0.72;
    const count = Math.max(1, Math.min(30, params.count != null ? params.count : 14));
    for (let index = 0; index < count; index += 1) {
      fx.exhaust(
        _v2,
        params.intensity != null ? params.intensity : 0.95,
        params.sooty !== false,
      );
    }
    return true;
  }

  const effectHandlers: Readonly<Record<
    string,
    (execution: StudioEffectExecution) => boolean
  >> = Object.freeze({
    fire: fireActorGun,
    muzzle_flash: fireMuzzleFlash,
    tracer: fireTracer,
    impact: (execution) => fireImpact(execution, 'pen', 120, [0, 1, 0]),
    sparks: (execution) => fireImpact(execution, 'ricochet', 100, [0, 1, 0]),
    explosion: fireExplosion,
    structure: fireStructure,
    tank_kill: fireTankKill,
    dust: fireDust,
    engine_smoke: fireEngineSmoke,
    burning: fireBurning,
    detrack: fireDetrack,
    firing_moment: fireFiringMoment,
    explosion_moment: fireExplosionMoment,
    mg_burst: fireMgBurst,
    barrage: fireBarrage,
    armor_scar: fireArmorScar,
    exhaust: fireExhaust,
    smoke_screen: fireSmokeScreen,
    flare: fireFlare,
    embers: fireEmbers,
    debris: fireDebris,
    shockwave: fireShockwave,
    fire_field: fireFireField,
    strike: fireStrike,
    ram: fireRam,
  });

  function recordFiredEffect(
    input: StudioEffectInput | StudioEffectRecord,
    opts: EffectFireOptions,
  ): void {
    if (opts.record !== false) {
      const record = makeEffectRecord(input, opts.tMs != null ? opts.tMs : clockMs);
      effectLog.push(record);
      activeEffectIds.add(record.id);
      if (effectLog.length > MAX_STUDIO_EFFECTS) {
        effectLog.shift();
        rebuildEffects(clockMs);
      }
      selectedEffect = record;
      if (opts.refresh !== false) panel.setSelectedEffect(record);
    } else if (input.id) {
      activeEffectIds.add(input.id);
    }
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
    const handler = effectHandlers[e.type];
    if (!handler) {
      console.warn(`[studio] unknown effect type: ${e.type}`);
      return false;
    }
    // the id the effect log will assign (makeEffectRecord) seeds its cinematic stream
    const id = e.id || `fx${effectUidSeq}`;
    // replays fire on their authored time; live fires at the playhead
    const fireMs = opts.tMs ?? (opts.record === false && e.tMs != null ? e.tMs : clockMs);
    effectFireS = fireMs / 1000;
    cinematics?.beginEffect(effectFireS);
    const ok = handler({ id, input: e, actor: a, position: pos, params });
    if (ok) {
      recordFiredEffect(e, opts);
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
  function emitDamageSmoke(birthOffset: number): void {
    for (const a of actors) {
      if (!a.smoking) continue;
      _fwd.set(Math.sin(a.state.yaw), 0, Math.cos(a.state.yaw));
      _v2.copy(a.state.pos).addScaledVector(_fwd, -a.spec.dims.hullLengthM * 0.42);
      _v2.y += a.spec.dims.heightM * 0.72;
      fx.exhaust(_v2, 1, true, null, null, birthOffset);
      fx.exhaust(_v2, 0.85, true, null, null, birthOffset); // doubled: damage smoke, not idle haze
    }
  }

  /** Exact terrain crossing inside the last shell step (cinematic quality). */
  function refineShellCrossing(sh: StudioShell, px: number, py: number, pz: number): void {
    let lo = 0, hi = 1;
    for (let i = 0; i < 10; i++) {
      const t = (lo + hi) * 0.5;
      const x = px + (sh.pos.x - px) * t, z = pz + (sh.pos.z - pz) * t;
      const y = py + (sh.pos.y - py) * t;
      if (y <= hfProxy.getHeightAt(x, z)) hi = t; else lo = t;
    }
    sh.pos.x = px + (sh.pos.x - px) * hi;
    sh.pos.z = pz + (sh.pos.z - pz) * hi;
  }

  function stepFx(dt: number): void {
    if (dt > 0) {
      const previousMs = clockMs;
      clockMs += dt * 1000;
      const exactShells = fxSettings.quality === 'cinematic';
      // projectiles
      const traceWorld = getWorld();
      for (const sh of shells) {
        if (sh.dead) continue;
        const px = sh.pos.x, py = sh.pos.y, pz = sh.pos.z;
        if (sh._studioWorld) _strikePrev.copy(sh.pos);
        stepShell(sh, dt);
        // a strike round (P2) meets what the world puts in its path this step — the raycast reads the sim's openings;
        // light cover on the way breaks and lets it on (traceStrikeRound)
        if (sh._studioWorld && traceWorld && traceStrikeRound(sh, traceWorld, _strikePrev, sh.pos)) continue;
        const gy = hfProxy.getHeightAt(sh.pos.x, sh.pos.z);
        if (sh.pos.y <= gy) {
          // cinematic quality lands the shell where its path met the ground,
          // independent of the export step (battle keeps the legacy look)
          if (exactShells) refineShellCrossing(sh, px, py, pz);
          sh.pos.y = hfProxy.getHeightAt(sh.pos.x, sh.pos.z) + 0.05;
          sh.dead = true;
          // a strike round bursts on the ground as a battle round does (strikeGround): the blast, then the impact, then
          // the crater, the solo step's order
          const groundCrater = sh._studioWorld ? strikeGround(sh) : null;
          filmCue('dirt', sh.pos.x, sh.pos.y, sh.pos.z, sh.spec?.caliberMm ?? 120);
          fxBus.emit('shell:expired', {
            shellId: sh.id, hitTerrain: true, pos: [sh.pos.x, sh.pos.y, sh.pos.z],
            // the round's type and calibre, as the solo step publishes them (fx keys its explosion on the class)
            shellType: sh.spec?.type, caliberMm: sh.spec?.caliberMm,
          });
          if (groundCrater) fxBus.emit(DESTRUCTION_BUS_EVENTS.crater, groundCrater);
          if (exactShells) {
            _v1.set(sh.pos.x, sh.pos.y, sh.pos.z);
            ensureCinematics().groundHit(`shell${String(sh.id)}`, _v1, sh.spec?.caliberMm || 105, String(sh.spec?.type || 'AP'));
          }
        } else if (sh.distM > 4000) {
          sh.dead = true;
        } else if (sh._studioMaxDistM != null && sh.distM >= sh._studioMaxDistM) {
          sh.dead = true;
        }
      }
      // the Studio's destruction steps after the rounds, as the solo step's does (stages, breaches on the bus)
      studioSim?.step();
      // continuous per-actor emitters. Live battle quality keeps one pulse
      // per step; a film's sub-sample steps pulse once per 1/60 s timeline
      // grid line they cross, so motion-blur sampling never multiplies the
      // smoke. Cinematic quality always pulses on that grid and schedules each
      // birth at its grid time (the fx clock still reads the step's start
      // here, so the offset is positive): 2-8 ms export steps and the
      // playhead's integer-ms partial steps neither multiply nor shift it.
      if (exactShells || filming) {
        const gridMs = FX_STEP_S * 1000;
        const last = Math.floor(clockMs / gridMs + 1e-6);
        for (let k = Math.floor(previousMs / gridMs + 1e-6) + 1; k <= last; k++) {
          const birthOffset = exactShells ? Math.max(0, (k * gridMs - previousMs) / 1000) : 0;
          emitDamageSmoke(birthOffset);
          emitStudioExhaust(birthOffset);
        }
      } else {
        emitDamageSmoke(0);
        emitStudioExhaust(0);
      }
      // the props' own clock on the Studio's (fix/studio-world-step, 2026-10-08): the render loop's world update runs at
      // dt 0 and an export step runs none, so a felled prop's topple and the loose bodies advance here, step by step
      getWorld()?.updateProps?.(dt, camera.position);
    }
    // the drawn ground follows what was dug or raised this step (an export step and a capture run no world update)
    getWorld()?.syncGround?.();
    fx.update(dt, shells, camera, resolveFxSubject);
    // the held (frozen) frame: blue-hour / night lamps nearest the camera (playback updates in advanceTimeline)
    if (dt === 0) ctx.getStudioLight?.()?.update(camera.position);
    cinematics?.update(dt, clockMs / 1000, shells, trackActors(), camera.position);
  }

  /**
   * Deterministically advance the fx timeline by `ms` in fixed 1/60 steps
   * (same cadence live play emits at), syncing actor visual timelines along
   * the way, then hold. Used by load() and the panel's STEP buttons.
   * @param {number} ms milliseconds of fx time
   */
  function advanceWater(dt: number): void {
    const world = getWorld();
    if (!world) return;
    waterSources.length = 0;
    for (const actor of actors) {
      if (waterSources.length === waterSlots.length) break;
      const st = actor.state;
      const wet = world.heightField.getWaterMaskAt(st.pos.x, st.pos.z);
      if (wet <= .05) continue;
      const slot = waterSlots[waterSources.length];
      const rect = tankContactRect(actor.spec);
      const speed = st.speed ?? 0, travel = speed < -.05 ? -1 : 1;
      slot.x = st.pos.x; slot.z = st.pos.z;
      slot.dirX = Math.sin(st.yaw) * travel; slot.dirZ = Math.cos(st.yaw) * travel;
      slot.speed = Math.abs(speed); slot.strength = Math.min(1, wet * (.6 + Math.abs(speed) / 6));
      slot.halfLength = rect.halfLength; slot.halfWidth = rect.halfWidth;
      waterSources.push(slot);
    }
    world.setWaterDisturbances(waterSources);
    world.advanceWater(dt, actors[0]?.state.pos.x ?? camera.position.x, actors[0]?.state.pos.z ?? camera.position.z);
  }

  /**
   * Present one actor. Track/wheel phase advances on the fixed support grid;
   * a film sample between grid steps adds the exact travel since the last
   * step for this presentation only, so rolling wheels and track links blur
   * continuously instead of double-imaging at 60 Hz.
   */
  function syncActorVisual(a: StudioActor, dt: number): void {
    const l = filming ? a.filmScrollL ?? 0 : 0, r = filming ? a.filmScrollR ?? 0 : 0;
    // a film sample between support steps draws the support pose between them (studioFilmSupport.ts)
    const alpha = filming && a.filmSupport ? a.filmSupportAlpha ?? -1 : -1;
    if (alpha >= 0) {
      a.visual.syncFromState(a.state, dt, undefined, presentFilmSupport(a.filmSupport!, a.state, alpha, l, r));
      return;
    }
    if (l === 0 && r === 0) { a.visual.syncFromState(a.state, dt); return; }
    const scroll = a.state.trackScroll, baseL = scroll.l, baseR = scroll.r;
    scroll.l = baseL + l; scroll.r = baseR + r;
    try { a.visual.syncFromState(a.state, dt); }
    finally { scroll.l = baseL; scroll.r = baseR; }
  }

  // destruction-fx (round 7b, wave m2: "engine smoke rising as straight chimney columns"): every running hull's engine
  // breathes as a battle hull's does (battlePresentationRuntime emitExhaust's law: its load from its speed), with the
  // hull's motion, so the Studio films the plume bending with the drive and the wind and breaking up
  const _exPos = new THREE.Vector3(), _exFwd = new THREE.Vector3(), _exVel = new THREE.Vector3();
  // (integration, 2026-10-09: pulsed by stepFx on the 1/60 s grid with the damage smoke, at its birth offset — its
  // per-call rate gate assumes 60 calls a second, which a film's motion-blur sub-steps would multiply)
  function emitStudioExhaust(birthOffset: number): void {
    for (const a of actors) {
      if (a.stateName !== 'intact' && a.stateName !== 'engine-smoking') continue;
      const st = a.state;
      const speed = st.speed ?? 0;
      const topSpeedMps = Math.max(1, (a.spec.topSpeedKmh || 60) / 3.6);
      const load = Math.max(0.1, Math.min(1, 0.15 + Math.abs(speed) / topSpeedMps * 0.85));
      _exFwd.set(Math.sin(st.yaw), 0, Math.cos(st.yaw));
      _exVel.copy(_exFwd).multiplyScalar(speed);
      _exPos.copy(st.pos).addScaledVector(_exFwd, -a.spec.dims.hullLengthM * 0.42);
      _exPos.y += a.spec.dims.heightM * 0.72;
      fx.exhaust(_exPos, load, true, _exVel, _exFwd, birthOffset);
    }
  }

  // destruction-fx: a driven actor kicks up its tracks' dust as a battle hull does (battlePresentationRuntime emitDust's
  // law: one call per side every 0.45-0.7 m of travel, from the rear of each track), so the Studio films the dust
  // skirt; on the fixed timeline, through the fx's own seeded stream
  const studioDustTravel = new Map<StudioActor, number>();
  const _dustPos = new THREE.Vector3(), _dustFwd = new THREE.Vector3();
  function emitStudioTrackDust(dt: number): void {
    for (const a of actors) {
      const st = a.state;
      const speed = Math.abs(st.speed ?? 0);
      if (speed <= 0.8 || st.grounded === false) { studioDustTravel.set(a, 0); continue; }
      const topSpeedMps = Math.max(1, (a.spec.topSpeedKmh || 60) / 3.6);
      const intensity = Math.min(1, speed / topSpeedMps);
      const spacingM = 0.7 + (0.45 - 0.7) * intensity;
      const travel = Math.min(spacingM * 2, (studioDustTravel.get(a) ?? 0) + speed * dt);
      if (travel < spacingM) { studioDustTravel.set(a, travel); continue; }
      studioDustTravel.set(a, travel - spacingM);
      const sign = (st.speed ?? 0) < 0 ? -1 : 1;
      _dustFwd.set(Math.sin(st.yaw) * sign, 0, Math.cos(st.yaw) * sign);
      const dims = a.spec.dims;
      for (let side = -1; side <= 1; side += 2) {
        _dustPos.copy(st.pos).addScaledVector(_dustFwd, -dims.hullLengthM * 0.45);
        _dustPos.x += _dustFwd.z * side * dims.widthM * 0.45;
        _dustPos.z += -_dustFwd.x * side * dims.widthM * 0.45;
        fx.dust(_dustPos, _dustFwd, intensity);
      }
    }
  }

  function advanceFx(ms: number): void {
    let remainingS = Math.max(0, ms / 1000);
    while (remainingS > 1e-7) {
      const dt = Math.min(FX_STEP_S, remainingS);
      applyStoryboardActors(clockMs + dt * 1000, dt);
      emitStudioTrackDust(dt);
      stepFx(dt);
      advanceWater(dt);
      for (const a of actors) syncActorVisual(a, dt);
      remainingS -= dt;
    }
    applyStoryboardCamera(clockMs);
    invalidate();
  }

  function resetFxRuntime(seed = sceneMeta.seed || 5000) {
    ensureFxBus();
    shells.length = 0;
    // a scene's hulls are already running: no engine cold-start cough at every load (atmospherics r2, wave 311)
    fx.resetAll({ running: true });
    // The fx clock restarts with the timeline: replays (seek, load, film) must
    // not inherit the page's history in clock-phased shading.
    fx.resetClock(0);
    studioStages.clear();
    // every building stands again (the Studio's destruction: openings cleared, the next strike starts fresh)
    studioSim?.reset();
    studioSimLog.length = 0;
    resetStudioGround(false);
    studioDustTravel.clear();
    fx.resetSeed(seed);
    fx.setFrozen(false);
    cinematics?.reset();
    clockMs = 0;
    activeEffectIds.clear();
    const w = getWorld();
    // a scene starts from an intact world, as a battle does: the props its rounds broke and the trees they felled stand
    // again (the Studio's strike rounds break light cover)
    if (w) { w.resetWater(); w.setWindTime(0.35); w.resetDestructibles(); }
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
      a.visual.resetDestroyed();
      resetStudioActorSupport(a, a.authoredSuspensionAimPitch);
      if (!actorTrackFor(a)) settleActor(a);
    }
    applyStoryboardActors(0, 0, true);
    for (const a of actors) restoreAuthoredActor(a);
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
    settleCrushes(target);
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
    if ((recording && !opts.recording) || filming) return Math.round(clockMs);
    const target = clampStudioTime(timeMs, storyboard.durationMs);
    if (opts.pause !== false) timeScale = 0;
    rebuildEffects(target);
    post.lensFlare?.snap?.();
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

  function advanceTimeline(ms: number, exact = false): number {
    // Film samples sit between whole milliseconds (a 0.2x shutter spans a
    // few); every other caller keeps the authored millisecond grid.
    const target = exact
      ? Math.min(storyboard.durationMs, clockMs + Math.max(0, ms))
      : clampStudioTime(clockMs + Math.max(0, ms), storyboard.durationMs);
    const fromMs = clockMs;
    let due = nextPendingEffect(target);
    while (due) {
      advanceFx(Math.max(0, due.tMs - clockMs));
      applyStoryboardActors(due.tMs, 0);
      fireEffect(due, { record: false, refresh: false });
      // its moment has passed whether it fired or not: an effect whose handler bails (its actor gone) was offered again at
      // the same time forever, spinning a film capture at 100 % CPU (the media lane, 2026-10-08)
      activeEffectIds.add(due.id);
      due = nextPendingEffect(target);
    }
    advanceFx(Math.max(0, target - clockMs));
    clockMs = target;
    getWorld()?.setWindTime(0.35 + clockMs / 1000);
    applyStoryboardFrame(target, 0);
    advanceCrushes(fromMs, target);
    if (clockMs >= storyboard.durationMs) timeScale = 0;
    ctx.getStudioLight?.()?.update(camera.position); // blue-hour / night lamps follow the posed actors and camera
    return Math.round(clockMs);
  }

  function playTimeline() {
    if (filming) return false;
    if (clockMs >= storyboard.durationMs - 0.5) seekTimeline(0, { pause: false });
    flareToWallClock();
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

  // --- hulls crush what they overrun (studioCrush.ts) ------------------------------------------------------------
  // The plan follows the storyboard (every edit replaces it), the battlefield and the tracked hulls' specs; a new plan
  // stands the old one's crushes back up and lays its own up to the playhead.
  const crushes = createStudioCrushes();
  let crushStoryboard: Storyboard | null = null;
  let crushWorld: WorldRuntime | null = null;
  const crushSpecs: unknown[] = [];
  const _crushSample: ActorTrackSample = { x: 0, z: 0, facingDeg: 0, turretDeg: 0, gunDeg: 0, keyId: undefined };
  function crushPlanCurrent(world: WorldRuntime | null): boolean {
    if (crushStoryboard !== storyboard || crushWorld !== world) return false;
    let n = 0;
    for (const a of actors) {
      if (!actorTrackFor(a)) continue;
      if (crushSpecs[n++] !== a.spec) return false;
    }
    return n === crushSpecs.length;
  }
  function syncCrushPlan(world: WorldRuntime | null): void {
    if (crushPlanCurrent(world)) return;
    if (crushWorld !== world) crushes.restore(crushWorld);
    crushStoryboard = storyboard;
    crushWorld = world;
    crushSpecs.length = 0;
    const hulls: StudioCrushHull[] = [];
    for (const a of actors) {
      const keys = actorTrackFor(a)?.keys;
      if (!keys) continue;
      crushSpecs.push(a.spec);
      const rect = tankContactRect(a.spec);
      hulls.push({
        halfLength: rect.halfLength,
        halfWidth: rect.halfWidth,
        crushReach: a.spec.dims.hullLengthM * 0.5 + 0.5, // battlePresentationRuntime.ts crushNearbyProps
        poseAt(tMs, out) {
          if (!sampleActorTrack(keys, tMs, _crushSample)) return false;
          out.x = _crushSample.x ?? 0; out.z = _crushSample.z ?? 0;
          out.yawRad = (_crushSample.facingDeg ?? 0) * DEG;
          return true;
        },
      });
    }
    crushes.setPlan(world, world && hulls.length
      ? planStudioCrushes(hulls, storyboard.durationMs, world.queryObstacles, world.crushables) : []);
    if (world) crushes.settleTo(world, clockMs);
  }
  const _crushPos = new THREE.Vector3(), _crushDir = new THREE.Vector3();
  /** A toppled pole's or dressing's burst, as the battle adds it after world.crushProp (crushNearbyProps). */
  function crushBurst(event: StudioCrushEvent): void {
    const prop = getWorld()?.crushables[event.crushable];
    if (!prop) return;
    _crushPos.set(prop.x, prop.y, prop.z);
    _crushDir.set(event.dirX, 0, event.dirZ);
    if (prop.dynamic && fx.loosePropHit) fx.loosePropHit(_crushPos, _crushDir, prop.h);
    else fx.propCrush?.(_crushPos, _crushDir, prop.h);
  }
  /** Playback from `fromMs` to `toMs`: each crush fires at its own time. The props' falls run on the props' own clock (stepFx's
   *  updateProps, PR #9's studio world step), the felled trees' here, exactly to `toMs`; advancing the whole destruction
   *  here as well would run every prop's topple twice per step. */
  function advanceCrushes(fromMs: number, toMs: number): void {
    const world = getWorld();
    if (!world) return;
    syncCrushPlan(world);
    let cursor = fromMs;
    for (let next = crushes.nextTime(); next <= toMs; next = crushes.nextTime()) {
      if (next > cursor) { world.advanceToppledVegetation?.((next - cursor) / 1000); cursor = next; }
      crushes.advanceTo(world, next, crushBurst);
    }
    if (toMs > cursor) world.advanceToppledVegetation?.((toMs - cursor) / 1000);
  }
  /** Studio exit: the battlefield's props stand again before it can host anything else, and the plan is forgotten. */
  function releaseCrushes(): void {
    crushes.restore(crushWorld);
    crushStoryboard = null;
    crushWorld = null;
    crushSpecs.length = 0;
  }
  /** A seek: the crushes up to `timeMs` lie at their final poses, the later ones stand. */
  function settleCrushes(timeMs: number): void {
    const world = getWorld();
    if (!world) return;
    syncCrushPlan(world);
    crushes.settleTo(world, timeMs);
  }

  function applyStoryboardCamera(timeMs: number): boolean {
    if (!sampleCameraRail(storyboard.shots, timeMs, _cameraSample)) return false;
    camera.position.set(_cameraSample.x, _cameraSample.y, _cameraSample.z);
    cam.mode = 'fly';
    _v2.set(_cameraSample.lookX, _cameraSample.lookY, _cameraSample.lookZ);
    if (sampleCameraCues(storyboard.cameraCues, timeMs, _cameraCueSample, filming ? FILM_CUE_ATTACK_MS : 0)) {
      scaleFilmCue(_cameraCueSample);
      _fwd.copy(_v2).sub(camera.position).normalize();
      _v3.crossVectors(_fwd, _up).normalize();
      _v1.crossVectors(_v3, _fwd).normalize();
      camera.position.addScaledVector(_v3, _cameraCueSample.rightM);
      camera.position.addScaledVector(_v1, _cameraCueSample.upM);
      camera.position.addScaledVector(_fwd, _cameraCueSample.forwardM);
    }
    cam.fov = Math.max(10, Math.min(120, _cameraSample.fov + _cameraCueSample.fovKickDeg));
    cam.roll = (_cameraSample.rollDeg + _cameraCueSample.rollDeg) * DEG;
    lookAt(_v2);
    return true;
  }

  function applyStoryboardActorSample(a: StudioActor, timeMs: number, dt: number, support: boolean): void {
    const track = actorTrackFor(a);
    if (!track || !sampleActorTrack(track.keys, timeMs, _actorSample)) return;
      const st = a.state;
      const yaw = _actorSample.facingDeg * DEG;
      const dx = _actorSample.x - a.supportX;
      const dz = _actorSample.z - a.supportZ;
      const dyaw = Math.atan2(Math.sin(yaw - a.supportYaw), Math.cos(yaw - a.supportYaw));
      if (dt > 0) {
        const forwardX = Math.sin(yaw);
        const forwardZ = Math.cos(yaw);
        const signedDist = dx * forwardX + dz * forwardZ;
        st.speed = signedDist / dt;
        st.yawRate = dyaw / dt;
        st.trackScroll.l += signedDist + dyaw * 1.5;
        st.trackScroll.r += signedDist - dyaw * 1.5;
      } else if (support) {
        st.speed = 0;
        st.yawRate = 0;
      } else if (filming) {
        const signedDist = dx * Math.sin(yaw) + dz * Math.cos(yaw);
        a.filmScrollL = signedDist + dyaw * 1.5;
        a.filmScrollR = signedDist - dyaw * 1.5;
      }
      if (support) {
        a.supportX = _actorSample.x; a.supportZ = _actorSample.z; a.supportYaw = yaw;
      }
      a.timelineX = _actorSample.x;
      a.timelineZ = _actorSample.z;
      a.timelineYaw = yaw;
      actorRootPosition(a, _actorSample.x, _actorSample.z, yaw, _v3);
      st.pos.x = _v3.x;
      st.pos.z = _v3.z;
      st.yaw = yaw;
      st.turretYaw = _actorSample.turretDeg * DEG;
      st.gunPitch = clampGunDeg(a.spec, _actorSample.gunDeg, _actorSample.turretDeg) * DEG;

    if (support) conformStudioActor(a, actorSupport(a), dt, a.visual.isDestroyed());
  }

  function applyStoryboardActors(timeMs: number, dt = 0, settle = false): void {
    const stepMs = SIM_DT * 1000;
    for (const a of actors) {
      if (!actorTrackFor(a)) continue;
      if (settle) {
        a.supportStep = 0;
        applyStoryboardActorSample(a, 0, 0, true);
        a.visual.syncFromState(a.state, 0);
        if (a.filmSupport) resetFilmSupport(a.filmSupport);
        if (filming) captureFilmSupport(a.filmSupport ??= createFilmSupport(), a.state, 0);
      } else if (dt > 0) {
        // Support is anchored to the timeline, independent of display cadence
        // and the partial intervals surrounding authored FX cues.
        const finalStep = Math.floor((timeMs + 1e-7) / stepMs);
        while (a.supportStep < finalStep) {
          a.supportStep++;
          applyStoryboardActorSample(a, a.supportStep * stepMs, SIM_DT, true);
          if (filming) captureFilmSupport(a.filmSupport ??= createFilmSupport(), a.state, a.supportStep);
        }
        // A film sample between two grid lines solves the step after it, to draw the support pose between the two
        // (one frame's exposure straddles a grid line; holding the earlier step printed the hull twice).
        if (filming && a.supportStep === finalStep && timeMs / stepMs - finalStep > FILM_SUPPORT_ON_GRID) {
          a.supportStep++;
          applyStoryboardActorSample(a, a.supportStep * stepMs, SIM_DT, true);
          captureFilmSupport(a.filmSupport ??= createFilmSupport(), a.state, a.supportStep);
        }
      }
      applyStoryboardActorSample(a, timeMs, 0, false);
      a.filmSupportAlpha = filming && a.filmSupport ? filmSupportAlpha(a.filmSupport, timeMs, stepMs) : -1;
    }
  }

  function applyStoryboardFrame(timeMs: number, dt = 0, settle = false): void {
    applyStoryboardActors(timeMs, dt, settle);
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
      handleIn: cfg.handleIn !== undefined ? cfg.handleIn : existing?.handleIn,
      handleOut: cfg.handleOut !== undefined ? cfg.handleOut : existing?.handleOut,
      transition: cfg.transition || existing?.transition || 'smooth',
    });
    selectedShotId = id;
    rail.rebuild();
    panel.refreshStoryboard();
    return storyboard.shots.find((shot) => shot.id === id) || null;
  }

  function updateCameraShot(ref: RuntimeValue, patch: CameraShotInput = {}) {
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

  function removeCameraShot(ref: RuntimeValue): boolean {
    if (recording) return false;
    const id = String(ref || '');
    if (!storyboard.shots.some((shot) => shot.id === id)) return false;
    storyboard = removeStoryboardShot(storyboard, id);
    selectedShotId = storyboard.shots[0]?.id || null;
    rail.rebuild();
    panel.refreshStoryboard();
    return true;
  }

  function selectCameraShot(ref: RuntimeValue, seek = true): string | null {
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
      pos: cfg.pos || [a.timelineX, a.timelineZ],
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

  let productionLoading = false;
  let productionFormat: ProductionFormat = 'landscape';

  function setProductionFormat(format: ProductionFormat): void {
    productionAspect(format);
    if (recording || loading || productionLoading || format === productionFormat) return;
    pauseTimeline();
    const ground = (x: number, z: number) => hfProxy.getHeightAt(x, z);
    const live = getCamera();
    const shots = storyboard.shots.map(shot => ({ ...shot,
      fov: reframeProductionFov(shot.fov, productionFormat, format),
      pos: reframeProductionPoint(shot.pos, shot.lookAt, productionFormat, format, ground),
      handleIn: shot.handleIn && reframeProductionPoint(shot.handleIn, shot.lookAt, productionFormat, format, ground),
      handleOut: shot.handleOut && reframeProductionPoint(shot.handleOut, shot.lookAt, productionFormat, format, ground),
    }));
    const pos = reframeProductionPoint([live.pos[0], live.pos[1], live.pos[2]],
      [live.lookAt[0], live.lookAt[1], live.lookAt[2]], productionFormat, format, ground);
    const fov = reframeProductionFov(live.fov, productionFormat, format);
    setStoryboard({ ...storyboard, shots });
    productionFormat = format;
    applyCamera({ pos, lookAt: live.lookAt, fov, rollDeg: live.rollDeg });
    panel.refreshAll();
    invalidate();
  }

  async function directProduction(options: ProductionOptions): Promise<ReturnType<typeof stateJson>> {
    if (recording || loading || productionLoading) throw new Error('Finish the current Studio operation first');
    const preset = productionPreset(options.presetId);
    productionLoading = true;
    try {
      await setMap(preset.map);
      const recipe = createProductionScene(options, (x, z) => hfProxy.getHeightAt(x, z));
      const result = await load(recipe);
      selectActor('lead');
      setRailVisible(false);
      return result;
    } finally { productionLoading = false; }
  }

  function applyProductionCamera(rig: ProductionRigId): void {
    if (recording || loading) return;
    const actor = selected ?? actors[0];
    if (!actor) throw new Error('Stage or select a tank first');
    pauseTimeline();
    const p = actor.state.pos;
    applyCamera(productionCamera(rig, [p.x, p.y + 1.7, p.z], actor.state.yaw / DEG,
      (x, z) => hfProxy.getHeightAt(x, z), productionFormat));
    panel.refreshCamera();
    invalidate();
  }

  /** Build an immediately recordable 15-second battle from the first two actors. */
  function directDuel(opts: { variant?: number } = {}) {
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
    const variant = Math.abs(Math.round(Number(opts.variant) || 0));
    const style = variant % 4;
    const side = variant % 2 === 0 ? 1 : -1;
    const move = Math.min(8, Math.max(3, distance * 0.14));
    const a1x = ax + ux * move; const a1z = az + uz * move;
    const b1x = bx - ux * move; const b1z = bz - uz * move;
    const a2x = a1x + ux * 3 + px * side * 1.2;
    const a2z = a1z + uz * 3 + pz * side * 1.2;
    const b2x = b1x - ux * 1.5 - px * side * 2.2;
    const b2z = b1z - uz * 1.5 - pz * side * 2.2;
    const midX = (a1x + b1x) * 0.5; const midZ = (a1z + b1z) * 0.5;
    const midY = hfProxy.getHeightAt(midX, midZ) + 2.2;
    const alphaFacing = bearingDeg(ax, az, bx, bz);
    const bravoFacing = bearingDeg(bx, bz, ax, az);
    const alphaExitFacing = bearingDeg(a1x, a1z, a2x, a2z);
    const bravoExitFacing = bearingDeg(b1x, b1z, b2x, b2z);
    const bravoStartFx = Math.sin(bravoFacing * DEG);
    const bravoStartFz = Math.cos(bravoFacing * DEG);
    const bravoStartPx = bravoStartFz;
    const bravoStartPz = -bravoStartFx;
    const bravoExitFx = Math.sin(bravoExitFacing * DEG);
    const bravoExitFz = Math.cos(bravoExitFacing * DEG);
    const bravoExitPx = bravoExitFz;
    const bravoExitPz = -bravoExitFx;
    const bravoTurnX = b1x + (b2x - b1x) * 0.36;
    const bravoTurnZ = b1z + (b2z - b1z) * 0.36;
    const wrapFacing = (value: number) => {
      let result = value % 360;
      if (result > 180) result -= 360;
      if (result < -180) result += 360;
      return result;
    };
    const turretTo = (hullFacing: number, fromX: number, fromZ: number, toX: number, toZ: number) => wrapFacing(
      bearingDeg(fromX, fromZ, toX, toZ) - hullFacing,
    );
    const cameraAt = (x: number, z: number, height: number): [number, number, number] => [x, hfProxy.getHeightAt(x, z) + height, z];
    const alphaRef = String(alpha.name || alpha.uid);
    const bravoRef = String(bravo.name || bravo.uid);
    const reverseLead = style === 1;
    const leadX = reverseLead ? bx : ax;
    const leadZ = reverseLead ? bz : az;
    const leadMoveX = reverseLead ? b1x : a1x;
    const leadMoveZ = reverseLead ? b1z : a1z;
    const leadFx = reverseLead ? -ux : ux;
    const leadFz = reverseLead ? -uz : uz;
    const leadPx = leadFz;
    const leadPz = -leadFx;
    const wideForward = [-19, 13, -28, 4][style];
    const wideSide = [38, 31, 46, 52][style];
    const wideHeight = [17, 11, 27, 8][style];
    const revealBack = [12, 8, 16, 6][style];
    const revealSide = [7, 11, 4, 14][style];
    const revealHeight = [2.1, 1.3, 3.4, 0.9][style];
    const trackBack = [6, 10, 4, 8][style];
    const trackSide = [4.2, 7.5, 2.4, 10][style];
    const trackHeight = [1.15, 2.4, 0.8, 4.5][style];
    const trackFov = [31, 25, 38, 55][style];
    const overheadHeight = [39, 52, 31, 65][style];
    const impactForward = [-7, -12, 5, -4][style];
    const impactSide = [8, -12, 15, 5][style];
    const turnBack = [9, 13, 7, 18][style];
    const turnSide = [6, 10, 4, 15][style];
    const turnHeight = [2.2, 4.5, 1.25, 7.5][style];

    storyboard = normalizeStoryboard({
      durationMs: 15000,
      shots: [
        { id: 'duel-atmosphere', label: 'Atmospheric drop', tMs: 0,
          pos: cameraAt(midX + ux * wideForward + px * side * wideSide,
            midZ + uz * wideForward + pz * side * wideSide, wideHeight),
          lookAt: [midX, midY, midZ], fov: [56, 42, 66, 35][style],
          rollDeg: -side * [4, 9, 2, 13][style], transition: 'smooth',
          handleOut: cameraAt(midX + ux * (wideForward * 0.65) + px * side * (wideSide * 0.8),
            midZ + uz * (wideForward * 0.65) + pz * side * (wideSide * 0.8), wideHeight + 4) },
        { id: 'duel-reveal', label: reverseLead ? 'Counter-charge reveal' : 'Ground-skimming reveal', tMs: 1200,
          pos: cameraAt(leadX - leadFx * revealBack + leadPx * side * revealSide,
            leadZ - leadFz * revealBack + leadPz * side * revealSide, revealHeight),
          lookAt: cameraAt(leadX + leadFx * 8, leadZ + leadFz * 8, 1.5),
          fov: [45, 31, 57, 24][style], rollDeg: side * [6, -11, 4, 14][style],
          transition: 'bezier',
          handleIn: cameraAt(leadX - leadFx * (revealBack + 3) + leadPx * side * (revealSide + 6),
            leadZ - leadFz * (revealBack + 3) + leadPz * side * (revealSide + 6), revealHeight + 3.4),
          handleOut: cameraAt(leadX - leadFx * 7 + leadPx * side * 5,
            leadZ - leadFz * 7 + leadPz * side * 5, Math.max(1.2, revealHeight - 0.4)) },
        { id: 'duel-track', label: reverseLead ? 'Head-on compression' : 'Track-level pursuit', tMs: 2850,
          pos: cameraAt(leadMoveX - leadFx * trackBack + leadPx * side * trackSide,
            leadMoveZ - leadFz * trackBack + leadPz * side * trackSide, trackHeight),
          lookAt: cameraAt(leadMoveX, leadMoveZ, 1.8),
          fov: trackFov, rollDeg: -side * [8, 3, 12, 6][style],
          transition: 'bezier',
          handleIn: cameraAt(leadMoveX - leadFx * (trackBack + 3) + leadPx * side * (trackSide * 0.65),
            leadMoveZ - leadFz * (trackBack + 3) + leadPz * side * (trackSide * 0.65),
            Math.max(0.7, trackHeight - 0.1)) },
        { id: 'duel-alpha-gun', label: 'Alpha gunline', tMs: 3750,
          pos: cameraAt(a1x + ux * [0.5, -3, 5, 1][style]
              + px * side * [4.6, 8, 3, 10][style],
            a1z + uz * [0.5, -3, 5, 1][style]
              + pz * side * [4.6, 8, 3, 10][style], [3, 1.4, 5.2, 2.3][style]),
          lookAt: cameraAt(b1x, b1z, 1.9),
          fov: [30, 23, 47, 34][style], rollDeg: side * [5, 12, -4, 17][style],
          transition: 'cut',
          handleOut: cameraAt(a1x + ux * 8 + px * side * 5, a1z + uz * 8 + pz * side * 5, 2.5) },
        { id: 'duel-shell-flyby', label: 'Projectile flyby', tMs: 4100,
          pos: cameraAt(midX - ux * [8, 2, 13, 5][style] - px * side * [2, 7, 0.8, 11][style],
            midZ - uz * [8, 2, 13, 5][style] - pz * side * [2, 7, 0.8, 11][style],
            [3.0, 4.0, 2.5, 5.5][style]),
          lookAt: cameraAt(b1x, b1z, 1.9),
          fov: [24, 58, 18, 42][style], rollDeg: -side * [10, 16, 5, 20][style],
          transition: 'cut' },
        { id: 'duel-blast-pass', label: 'Muzzle-blast pass', tMs: 4650,
          pos: cameraAt(midX - ux * 3 + px * side * 8, midZ - uz * 3 + pz * side * 8, 3.5),
          lookAt: cameraAt(b1x, b1z, 1.9),
          fov: [40, 52, 33, 61][style], rollDeg: side * [12, -8, 18, 6][style],
          transition: 'bezier',
          handleIn: cameraAt(midX - ux * 8 + px * side * 5, midZ - uz * 8 + pz * side * 5, 3.0) },
        { id: 'duel-overhead', label: 'Tactical overhead', tMs: 5300,
          pos: cameraAt(midX - px * side * [4, 12, 1, 18][style],
            midZ - pz * side * [4, 12, 1, 18][style], overheadHeight),
          lookAt: [midX, hfProxy.getHeightAt(midX, midZ), midZ],
          fov: [38, 31, 48, 27][style], rollDeg: side * [0, 8, -3, 14][style],
          transition: 'cut' },
        { id: 'duel-bravo-gun', label: 'Bravo return fire', tMs: 6050,
          pos: cameraAt(b1x + ux * [7, 2, 11, 5][style] - px * side * [4.2, 10, 2, 13][style],
            b1z + uz * [7, 2, 11, 5][style] - pz * side * [4.2, 10, 2, 13][style],
            [2.45, 4.8, 1.1, 3.2][style]),
          lookAt: cameraAt(a1x, a1z, 1.9),
          fov: [29, 51, 22, 37][style], rollDeg: -side * [7, 14, 3, 19][style],
          transition: 'cut',
          handleOut: cameraAt(b1x + ux * 2 - px * side * 9, b1z + uz * 2 - pz * side * 9, 3.1) },
        { id: 'duel-whip', label: 'Turn-in whip', tMs: 6900,
          pos: cameraAt(b1x - bravoStartFx * turnBack + bravoStartPx * side * turnSide,
            b1z - bravoStartFz * turnBack + bravoStartPz * side * turnSide, turnHeight),
          lookAt: cameraAt(b1x, b1z, 1.7), fov: [43, 36, 51, 31][style],
          rollDeg: side * [10, 6, 14, 9][style], transition: 'cut' },
        { id: 'duel-turn-track', label: 'Tracked hull turn', tMs: 7900,
          pos: cameraAt(bravoTurnX - bravoExitFx * turnBack + bravoExitPx * side * turnSide,
            bravoTurnZ - bravoExitFz * turnBack + bravoExitPz * side * turnSide, turnHeight),
          lookAt: cameraAt(bravoTurnX, bravoTurnZ, 1.7), fov: [37, 42, 29, 48][style],
          rollDeg: -side * [5, 11, 3, 14][style], transition: 'bezier',
          handleIn: cameraAt(b1x - bravoStartFx * (turnBack - 2)
              + bravoStartPx * side * (turnSide + 2),
            b1z - bravoStartFz * (turnBack - 2)
              + bravoStartPz * side * (turnSide + 2), Math.max(1.1, turnHeight - 0.4)) },
        { id: 'duel-second-shot', label: 'Alpha snap shot', tMs: 8050,
          pos: cameraAt(a1x - ux * [4, 7, 2, 9][style] - px * side * [8, 11, 5, 14][style],
            a1z - uz * [4, 7, 2, 9][style] - pz * side * [8, 11, 5, 14][style],
            [3.6, 5.5, 2.25, 7][style]),
          lookAt: cameraAt(a1x + ux * 4, a1z + uz * 4, 1.9), fov: [34, 44, 28, 52][style],
          rollDeg: -side * [11, 5, 17, 9][style], transition: 'cut' },
        { id: 'duel-shell-pursuit', label: 'Shell pursuit', tMs: 8450,
          pos: cameraAt(midX + ux * [4, -3, 10, 1][style] + px * side * [2, 8, 0.5, 13][style],
            midZ + uz * [4, -3, 10, 1][style] + pz * side * [2, 8, 0.5, 13][style],
            [1.2, 4, 0.7, 6.5][style]),
          lookAt: cameraAt(b2x, b2z, 1.8), fov: [22, 55, 16, 35][style],
          rollDeg: side * [7, 15, -3, 19][style], transition: 'cut' },
        { id: 'duel-impact', label: 'Armor impact', tMs: 9300,
          pos: cameraAt(b2x + ux * impactForward + px * side * impactSide,
            b2z + uz * impactForward + pz * side * impactSide, [2.35, 5.8, 1.05, 3.6][style]),
          lookAt: cameraAt(b2x, b2z, 1.9), fov: [30, 47, 21, 62][style],
          rollDeg: side * [13, -9, 18, 6][style], transition: 'cut',
          handleOut: cameraAt(b2x - ux * 11 + px * side * 5, b2z - uz * 11 + pz * side * 5, 3.0) },
        { id: 'duel-shockwave', label: 'Shockwave pullback', tMs: 10150,
          pos: cameraAt(b2x - ux * [15, 21, 9, 27][style] - px * side * [10, 5, 18, 14][style],
            b2z - uz * [15, 21, 9, 27][style] - pz * side * [10, 5, 18, 14][style],
            [5, 9, 3.2, 14][style]),
          lookAt: cameraAt(b2x, b2z, 2.2), fov: [49, 35, 61, 28][style],
          rollDeg: -side * [17, 10, 22, 7][style],
          transition: 'bezier',
          handleIn: cameraAt(b2x - ux * 10 - px * side * 2, b2z - uz * 10 - pz * side * 2, 3.25),
          handleOut: cameraAt(midX - ux * 5 - px * side * 17, midZ - uz * 5 - pz * side * 17, 4.2) },
        { id: 'duel-aftermath', label: 'Burning orbit', tMs: 12100,
          pos: cameraAt(midX + ux * [4, -10, 14, 2][style] + px * side * [24, 34, 19, 43][style],
            midZ + uz * [4, -10, 14, 2][style] + pz * side * [24, 34, 19, 43][style],
            [5.8, 11, 4.2, 17][style]),
          lookAt: cameraAt(b2x, b2z, 2.0), fov: [37, 29, 52, 24][style],
          rollDeg: side * [10, 17, 5, 13][style],
          transition: 'bezier',
          handleIn: cameraAt(midX - ux * 2 + px * side * 17, midZ - uz * 2 + pz * side * 17, 4.4),
          handleOut: cameraAt(midX + ux * 8 + px * side * 31, midZ + uz * 8 + pz * side * 31, 8) },
        { id: 'duel-end', label: 'Hero pullout', tMs: 15000,
          // Continue outward on the aftermath side. Crossing the centerline
          // here swept the lens over empty ground between the two vehicles.
          pos: cameraAt(midX + ux * [12, -18, 22, 5][style] + px * side * [35, 48, 29, 57][style],
            midZ + uz * [12, -18, 22, 5][style] + pz * side * [35, 48, 29, 57][style],
            [16, 25, 11, 33][style]),
          lookAt: cameraAt(b2x, b2z, 2.0), fov: [47, 35, 58, 30][style],
          rollDeg: -side * [5, 11, 2, 15][style],
          transition: 'bezier',
          handleIn: cameraAt(midX + ux * 14 + px * side * 27, midZ + uz * 14 + pz * side * 27, 12) },
      ],
      cameraCues: [
        { id: 'duel-cue-rumble', label: 'Distant blast', tMs: 2550, durationMs: 750,
          amplitudeM: 0.12, rollDeg: 1.5, fovKickDeg: 1, frequencyHz: 9, seed: 101 + variant },
        { id: 'duel-cue-alpha-fire', label: 'Alpha recoil', tMs: 3850, durationMs: 620,
          amplitudeM: 0.3, rollDeg: 3.5, fovKickDeg: 3.2, frequencyHz: 14, seed: 211 + variant },
        { id: 'duel-cue-bravo-fire', label: 'Bravo recoil', tMs: 6150, durationMs: 620,
          amplitudeM: 0.32, rollDeg: 3.8, fovKickDeg: 3.5, frequencyHz: 13, seed: 307 + variant },
        { id: 'duel-cue-near-miss', label: 'Near-miss blast', tMs: 6700, durationMs: 1050,
          amplitudeM: 0.5, rollDeg: 5.5, fovKickDeg: 4.5, frequencyHz: 11, seed: 401 + variant },
        { id: 'duel-cue-second-fire', label: 'Second recoil', tMs: 8150, durationMs: 650,
          amplitudeM: 0.35, rollDeg: 4, fovKickDeg: 3.8, frequencyHz: 15, seed: 503 + variant },
        { id: 'duel-cue-impact', label: 'Armor strike', tMs: 9440, durationMs: 550,
          amplitudeM: 0.45, rollDeg: 5, fovKickDeg: 4.5, frequencyHz: 17, seed: 601 + variant },
        { id: 'duel-cue-kill', label: 'Ammorack shockwave', tMs: 9600, durationMs: 1500,
          amplitudeM: 0.95, rollDeg: 9, fovKickDeg: 7, frequencyHz: 10, seed: 701 + variant },
        { id: 'duel-cue-aftermath', label: 'Secondary detonation', tMs: 10600, durationMs: 1100,
          amplitudeM: 0.4, rollDeg: 4.5, fovKickDeg: 3, frequencyHz: 8, seed: 809 + variant },
      ],
      actorTracks: [
        { actor: alphaRef, keys: [
          { id: 'duel-a0', tMs: 0, pos: [ax, az], facingDeg: alphaFacing,
            turretDeg: turretTo(alphaFacing, ax, az, bx, bz), gunDeg: 0 },
          { id: 'duel-a1', tMs: 3000, pos: [a1x, a1z], facingDeg: alphaFacing,
            turretDeg: turretTo(alphaFacing, a1x, a1z, b1x, b1z), gunDeg: 0,
            transition: 'drive' },
          { id: 'duel-a2', tMs: 7800, pos: [a1x, a1z], facingDeg: alphaFacing,
            turretDeg: turretTo(alphaFacing, a1x, a1z, b1x, b1z), gunDeg: 0 },
          { id: 'duel-a3', tMs: 9000, pos: [a2x, a2z], facingDeg: alphaExitFacing,
            turretDeg: turretTo(alphaExitFacing, a2x, a2z, b2x, b2z), gunDeg: 0,
            transition: 'drive' },
          { id: 'duel-a4', tMs: 15000, pos: [a2x, a2z], facingDeg: alphaExitFacing,
            turretDeg: turretTo(alphaExitFacing, a2x, a2z, b2x, b2z), gunDeg: 0 },
        ] },
        { actor: bravoRef, keys: [
          { id: 'duel-b0', tMs: 0, pos: [bx, bz], facingDeg: bravoFacing,
            turretDeg: turretTo(bravoFacing, bx, bz, ax, az), gunDeg: 0 },
          { id: 'duel-b1', tMs: 4000, pos: [b1x, b1z], facingDeg: bravoFacing,
            turretDeg: turretTo(bravoFacing, b1x, b1z, a1x, a1z), gunDeg: 0,
            transition: 'drive' },
          { id: 'duel-b2', tMs: 7100, pos: [b1x, b1z], facingDeg: bravoFacing,
            turretDeg: turretTo(bravoFacing, b1x, b1z, a1x, a1z), gunDeg: 0 },
          { id: 'duel-b3', tMs: 9000, pos: [b2x, b2z], facingDeg: bravoExitFacing,
            turretDeg: turretTo(bravoExitFacing, b2x, b2z, a2x, a2z), gunDeg: 0,
            transition: 'drive' },
          { id: 'duel-b4', tMs: 15000, pos: [b2x, b2z], facingDeg: bravoExitFacing,
            turretDeg: turretTo(bravoExitFacing, b2x, b2z, a2x, a2z), gunDeg: 0 },
        ] },
      ],
    });
    bindStoryboardTracks();
    selectedShotId = storyboard.shots[0].id;
    resetFx();
    const authored = [
      { type: 'dust', actor: alphaRef, tMs: 350, params: { count: 14, intensity: 1.05 } },
      { type: 'dust', actor: bravoRef, tMs: 700, params: { count: 13, intensity: 0.95, dirDeg: 180 } },
      { type: 'dust', actor: alphaRef, tMs: 1750, params: { count: 12, intensity: 0.9 } },
      { type: 'dust', actor: bravoRef, tMs: 2200, params: { count: 11, intensity: 0.85, dirDeg: 180 } },
      { type: 'explosion', at: [midX + ux * 4 + px * side * 14, midZ + uz * 4 + pz * side * 14],
        tMs: 2550, params: { size: 'large' } },
      { type: 'fire', actor: alphaRef, tMs: 3850, params: { slot: 0, tracer: true, recoil: true } },
      { type: 'impact', at: [midX + ux * 12, midZ + uz * 12], tMs: 4250,
        params: { kind: 'terrain', caliberMm: 120 } },
      { type: 'fire', actor: bravoRef, tMs: 6150, params: { slot: 0, tracer: true, recoil: true } },
      { type: 'explosion', at: [midX - ux * 10 - px * side * 7, midZ - uz * 10 - pz * side * 7],
        tMs: 6700, params: { size: 'large' } },
      { type: 'sparks', at: [midX + px * side * 2, midZ + pz * side * 2], tMs: 7150,
        params: { caliberMm: 120 } },
      { type: 'fire', actor: alphaRef, tMs: 8150, params: { slot: 0, tracer: true, recoil: true } },
      { type: 'impact', actor: bravoRef, tMs: 9440, params: { kind: 'pen', caliberMm: 120 } },
      { type: 'tank_kill', actor: bravoRef, tMs: 9600, params: { cause: 'ammorack', pop: true } },
      { type: 'explosion', at: [b2x + ux * 8 + px * side * 7, b2z + uz * 8 + pz * side * 7],
        tMs: 10600, params: { size: 'large' } },
      { type: 'burning', actor: bravoRef, tMs: 11100, params: {} },
      { type: 'dust', actor: alphaRef, tMs: 11800, params: { count: 10, intensity: 0.75 } },
    ];
    for (const effect of authored) effectLog.push(makeEffectRecord(effect, effect.tMs));
    rail.rebuild();
    seekTimeline(0);
    panel.refreshAll();
    return getStoryboard();
  }
  const r2 = (v: number): number => Math.round(v * 100) / 100;

  // --- picture (studioPicture.ts schema, engine/cinemaPost.ts passes) -------------
  // Neutral = no Studio pass in the composer (byte-identical to the house render). The
  // runtime is created on the first non-neutral picture and disposed on exit.
  let picture: StudioPicture = NEUTRAL_PICTURE;
  let cinema: CinemaRuntime | null = null;
  const _focusPoint = new THREE.Vector3();
  const _focusAxis = new THREE.Vector3();

  function pictureFocusActor(): StudioActor | null {
    const ref = picture.dof.focusActor;
    if (ref == null) return null;
    return findActor(ref) || (/^\d+$/.test(ref) ? findActor(Number(ref)) : null);
  }

  /** Focus distance along the optical axis this frame: the actor's turret band, or the set distance. */
  function pictureFocusDistance(): number {
    const dof = picture.dof;
    const actor = pictureFocusActor();
    let distance = dof.focusDistance;
    if (actor) {
      _focusPoint.copy(actor.state.pos);
      _focusPoint.y += actor.spec.dims.heightM * 0.55;
      camera.getWorldDirection(_focusAxis);
      distance = _focusPoint.sub(camera.position).dot(_focusAxis);
    }
    return Math.max(0.3, distance + dof.focusOffset);
  }

  function ensureCinema(): CinemaRuntime {
    cinema ??= createCinemaPost(post, renderer, camera, {
      lens: () => pictureLensState(picture.dof, camera.fov, pictureFocusDistance()),
      grainSeed: () => pictureGrainSeed(sceneMeta.seed || 5000, clockMs),
    });
    return cinema;
  }

  /** Studio exit: every picture pass, hook and render target leaves with the Studio. */
  function disposePicture(): void {
    picture = NEUTRAL_PICTURE;
    cinema?.dispose();
    cinema = null;
  }

  /** Passes exist only while the Studio owns the frame (the Garage/battle composer stays pristine). */
  function applyPictureRuntime(): void {
    if (!active || isNeutralPicture(picture)) cinema?.apply(null);
    else ensureCinema().apply(pictureCinemaSettings(picture));
    invalidate();
  }

  function getPicture(): StudioPicture {
    return JSON.parse(JSON.stringify(picture)) as StudioPicture;
  }

  /** `preset` switches the look; other fields override; null resets to neutral. */
  function setPicture(patch: PicturePatch | null): StudioPicture {
    picture = applyPicturePatch(picture, patch);
    applyPictureRuntime();
    panel.refreshPicture();
    return getPicture();
  }

  /**
   * Derived lens/finish facts for tooling (focal length, focus, matte, active stages). `size`
   * (default: the live viewport) is the output the matte is computed for, e.g. a capture size.
   */
  function pictureInfo(size: { width?: number; height?: number } = {}) {
    renderer.getSize(_size);
    const width = Math.round(size.width || _size.x), height = Math.round(size.height || (size.width ? size.width * _size.y / _size.x : _size.y));
    const lens = pictureLensState(picture.dof, camera.fov, pictureFocusDistance());
    const bars = pictureLetterboxBars(picture.letterbox, width, height);
    return {
      neutral: isNeutralPicture(picture),
      stages: cinema ? [...cinema.activeStages] : [],
      focalLengthMm: r2(lens.focalMm),
      focusM: r2(lens.focusM),
      focusActor: pictureFocusActor()?.uid ?? null,
      cocInfinity: Math.round(lens.cocScale * 1e6) / 1e6,
      letterboxPx: bars,
    };
  }

  // --- capture -----------------------------------------------------------------
  function renderCaptureFrame(): void {
    // A resize or camera cut invalidates the interleaved cloud history. Complete
    // its remaining slots at the same authored instant before reading the canvas.
    post.render(0);
    if (scene.userData.volumetricClouds?.settleForCapture(camera)) post.render(0);
  }

  /**
   * Hi-res still of the current studio frame. Temporarily re-sizes the
   * renderer + full post chain to the target resolution at pixelRatio 1,
   * forces every shadow cascade, settles temporal clouds (dt=0 — no sim),
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
    if ((opts.samples ?? 1) > 1 || (opts.supersample ?? 1) > 1 || (opts.exposureMs ?? 0) > 0) return captureFilmStill(W, H, opts);
    let dataURL = '';
    const savedRail = rail.group.visible, savedMarker = marker.group.visible;
    try {
      rail.group.visible = false; marker.group.visible = false;
      renderer.setPixelRatio(1);
      renderer.setSize(W, H, false);
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      post.setSize(W, H);
      lighting.updateFrustums();
      camera.updateMatrixWorld(true);
      lighting.update(true); // every cascade fresh — deterministic capture
      stepFx(0);             // rebuild tracer ribbons/lights for this camera
      cinema?.setQuality('capture'); // picture: full lens/finish tap counts
      renderCaptureFrame();
      dataURL = renderer.domElement.toDataURL(opts.type || 'image/png', opts.quality);
    } finally {
      cinema?.setQuality('preview');
      renderer.setPixelRatio(prevPR);
      renderer.setSize(prevW, prevH, false);
      camera.aspect = prevW / Math.max(1, prevH);
      camera.updateProjectionMatrix();
      post.setSize(prevW, prevH);
      lighting.updateFrustums();
      lighting.update(true);
      rail.group.visible = savedRail; marker.group.visible = savedMarker;
      renderCaptureFrame(); // restore a complete live view after the size change
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
    if (filming) return Promise.reject(new Error('Finish the film render first'));
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
    let rejectPromise!: (reason?: RuntimeValue) => void;
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
      awaitingFirstChunk: true,
      fail: error => failRecording(error),
      leadInMs: 0,
      failed: false,
      startupTimer: null,
    };
    recording = session;
    flareToWallClock();
    const clearStartupTimer = () => {
      if (session.startupTimer !== null) clearTimeout(session.startupTimer);
      session.startupTimer = null;
    };
    const releaseRecording = () => {
      clearStartupTimer();
      for (const track of stream.getTracks()) track.stop();
      if (recording !== session) return;
      recording = null;
      timeScale = 0;
      rail.updateVisibility();
      panel.refreshStoryboard();
      panel.refreshTime();
      invalidate();
    };
    const failRecording = (error: RuntimeValue) => {
      if (session.failed) return;
      session.failed = true;
      session.stopping = true;
      session.reject(error);
      try { if (mediaRecorder.state !== 'inactive') mediaRecorder.stop(); }
      catch { /* release every stream even when the recorder cannot stop */ }
      releaseRecording();
    };
    mediaRecorder.addEventListener('dataavailable', (event) => {
      if (event.data && event.data.size) {
        chunks.push(event.data);
        // A cold encoder can take several hundred ms to produce its first
        // frame. Hold the opening pose until it confirms captured bytes so
        // actor movement and the first camera cut cannot disappear.
        if (session.awaitingFirstChunk && recording === session && !session.stopping && !session.failed) {
          clearStartupTimer();
          session.awaitingFirstChunk = false;
          session.leadInMs = performance.now()-session.startedAt;
          timeScale = 1;
          invalidate();
        }
      }
    });
    mediaRecorder.addEventListener('error', (event: Event) => {
      const error = 'error' in event ? event.error : null;
      failRecording(error || new Error('Studio video recording failed'));
    });
    mediaRecorder.addEventListener('stop', () => {
      clearStartupTimer();
      if (session.failed) return;
      const blob = new Blob(chunks, { type: session.mimeType });
      const result = {
        blob,
        size: blob.size,
        mimeType: session.mimeType,
        durationMs: session.elapsedMs,
        leadInMs: session.leadInMs,
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
      releaseRecording();
      session.resolve(result);
    }, { once: true });

    try {
      seekTimeline(0, { recording: true });
      rail.updateVisibility();
      lighting.update(true);
      stepFx(0);
      post.render(0);
      session.startedAt=performance.now();
      mediaRecorder.start(50);
      session.startupTimer = setTimeout(() => {
        if (session.awaitingFirstChunk && recording === session) {
          failRecording(new Error('Studio video encoder did not start. Please try recording again.'));
        }
      }, 10000);
      // The preflight render precedes MediaRecorder.start and may never become
      // an encoded frame. Submit the zero-time composition after recording owns
      // the stream as well, before advancing the playhead.
      post.render(0);
      const videoTrack = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;
      videoTrack?.requestFrame?.();
      timeScale = 0;
      panel.refreshStoryboard();
      panel.refreshTime();
      invalidate();
    } catch (error) {
      failRecording(error);
    }
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

  // --- film renderer (studioFilm.ts) ------------------------------------------
  const savedGuides = { marker: false };
  // Motion probe for adaptive sample counts: the storyboard camera and every
  // tracked actor sampled across one shutter, without touching the live rig.
  const _motionCam = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 5000);
  const _motionRail: CameraRailSample & Required<Pick<
    CameraRailSample, 'x' | 'y' | 'z' | 'lookX' | 'lookY' | 'lookZ' | 'fov' | 'rollDeg'
  >> = { x: 0, y: 0, z: 0, lookX: 0, lookY: 0, lookZ: 0, fov: 50, rollDeg: 0, shotId: undefined };
  const _motionCue = { rightM: 0, upM: 0, forwardM: 0, rollDeg: 0, fovKickDeg: 0 };
  const _motionActor: ActorTrackSample & Required<Pick<ActorTrackSample, 'x' | 'z' | 'facingDeg' | 'turretDeg' | 'gunDeg'>> = {
    x: 0, z: 0, facingDeg: 0, turretDeg: 0, gunDeg: 0, keyId: undefined,
  };
  const MOTION_GRID: readonly number[] = [-0.85, -0.3, 0.3, 0.85];
  const MOTION_MARCH_M: readonly number[] = [1.5, 3, 6, 12, 24, 48, 96, 192, 384];
  const MOTION_FAR_M = 600;
  const MOTION_PROBES = 9;
  // one terrain-depth anchor per grid ray, plus the shot's look target
  const _motionAnchors = Array.from({ length: MOTION_GRID.length * MOTION_GRID.length + 1 }, () => new THREE.Vector3());
  let _motionLength = new Float64Array(64), _motionPrev = new Float64Array(128);
  const _motionV = new THREE.Vector3(), _motionF = new THREE.Vector3();
  const _motionR = new THREE.Vector3(), _motionU = new THREE.Vector3();
  const _motionNear: THREE.Vector3[] = [];

  /** Same pose math as applyStoryboardCamera, into the probe camera. */
  function poseMotionCamera(timeMs: number, aspect: number): void {
    const probe = _motionCam;
    let fov = camera.fov;
    if (sampleCameraRail(storyboard.shots, timeMs, _motionRail)) {
      probe.position.set(_motionRail.x, _motionRail.y, _motionRail.z);
      _motionV.set(_motionRail.lookX, _motionRail.lookY, _motionRail.lookZ);
      if (sampleCameraCues(storyboard.cameraCues, timeMs, _motionCue, FILM_CUE_ATTACK_MS)) {
        scaleFilmCue(_motionCue);
        _motionF.copy(_motionV).sub(probe.position).normalize();
        _motionR.crossVectors(_motionF, _up).normalize();
        _motionU.crossVectors(_motionR, _motionF).normalize();
        probe.position.addScaledVector(_motionR, _motionCue.rightM);
        probe.position.addScaledVector(_motionU, _motionCue.upM);
        probe.position.addScaledVector(_motionF, _motionCue.forwardM);
      }
      fov = Math.max(10, Math.min(120, _motionRail.fov + _motionCue.fovKickDeg));
      _motionF.copy(_motionV).sub(probe.position);
      probe.rotation.order = 'YXZ';
      probe.rotation.set(Math.atan2(_motionF.y, Math.hypot(_motionF.x, _motionF.z)),
        Math.atan2(-_motionF.x, -_motionF.z), (_motionRail.rollDeg + _motionCue.rollDeg) * DEG);
    } else {
      probe.position.copy(camera.position);
      probe.quaternion.copy(camera.quaternion);
    }
    probe.fov = fov; probe.aspect = aspect; probe.near = camera.near; probe.far = camera.far;
    probe.updateProjectionMatrix();
    probe.updateMatrixWorld(true);
  }

  /** Project into output pixels; false when the point is behind the lens or far off frame. */
  function motionPixel(point: THREE.Vector3, width: number, height: number, out: Float64Array, at: number): boolean {
    _motionV.copy(point).project(_motionCam);
    if (!(_motionV.z > -1 && _motionV.z < 1) || Math.abs(_motionV.x) > 1.25 || Math.abs(_motionV.y) > 1.25) return false;
    out[at] = _motionV.x * width / 2;
    out[at + 1] = _motionV.y * height / 2;
    return true;
  }

  /** First terrain crossing along a ray (coarse march + bisection), or the far field. */
  function motionRayDepth(origin: THREE.Vector3, dir: THREE.Vector3): number {
    let previous = 0;
    for (const t of MOTION_MARCH_M) {
      const x = origin.x + dir.x * t, z = origin.z + dir.z * t;
      if (origin.y + dir.y * t <= hfProxy.getHeightAt(x, z)) {
        let lo = previous, hi = t;
        for (let i = 0; i < 6; i++) {
          const mid = (lo + hi) / 2;
          if (origin.y + dir.y * mid <= hfProxy.getHeightAt(origin.x + dir.x * mid, origin.z + dir.z * mid)) hi = mid;
          else lo = mid;
        }
        return hi;
      }
      previous = t;
    }
    return MOTION_FAR_M;
  }

  function filmMotionPathPx(times: Float64Array, count: number, width: number, height: number, near?: FilmNearSurfaces | null): number {
    const open = times[0], close = times[count - 1];
    if (!(close > open)) return 0;
    const aspect = width / height;
    poseMotionCamera((open + close) / 2, aspect);
    // Anchors at the scene's real depth: where each grid ray meets the terrain
    // (the nearest geometry in almost every shot), the far field otherwise,
    // and the look target. Fixed-depth probes overstate shake on open ground.
    let n = 0;
    for (const v of MOTION_GRID) {
      for (const u of MOTION_GRID) {
        _motionF.set(u, v, 0.5).unproject(_motionCam).sub(_motionCam.position).normalize();
        _motionAnchors[n++].copy(_motionCam.position).addScaledVector(_motionF, motionRayDepth(_motionCam.position, _motionF));
      }
    }
    if (storyboard.shots.length && sampleCameraRail(storyboard.shots, (open + close) / 2, _motionRail)) {
      _motionAnchors[n++].set(_motionRail.lookX, _motionRail.lookY, _motionRail.lookZ);
    }
    // the surfaces nearest the lens in the last frame (a bush, a pole, a hull), which outrun the terrain behind them
    const nearCount = near?.count ?? 0;
    for (let k = 0; k < nearCount; k++) {
      (_motionNear[k] ??= new THREE.Vector3()).set(near!.points[k * 3], near!.points[k * 3 + 1], near!.points[k * 3 + 2]);
    }
    const points = n + nearCount + actors.length;
    if (_motionLength.length < points) { _motionLength = new Float64Array(points); _motionPrev = new Float64Array(points * 2); }
    _motionLength.fill(0, 0, points);
    const valid: boolean[] = new Array(points).fill(false);
    for (let j = 0; j < MOTION_PROBES; j++) {
      const t = open + (close - open) * j / (MOTION_PROBES - 1);
      poseMotionCamera(t, aspect);
      for (let i = 0; i < points; i++) {
        let point = i < n ? _motionAnchors[i] : _motionNear[i - n];
        if (i >= n + nearCount) {
          const actor = actors[i - n - nearCount];
          const track = actorTrackFor(actor);
          if (track && sampleActorTrack(track.keys, t, _motionActor)) {
            _motionU.set(_motionActor.x, hfProxy.getHeightAt(_motionActor.x, _motionActor.z) + actor.spec.dims.heightM * 0.6, _motionActor.z);
          } else {
            _motionU.copy(actor.state.pos);
            _motionU.y += actor.spec.dims.heightM * 0.6;
          }
          point = _motionU;
        }
        const x = _motionPrev[i * 2], y = _motionPrev[i * 2 + 1];
        const inFrame = motionPixel(point, width, height, _motionPrev, i * 2);
        if (inFrame && valid[i]) _motionLength[i] += Math.hypot(_motionPrev[i * 2] - x, _motionPrev[i * 2 + 1] - y);
        valid[i] = inFrame;
      }
    }
    let longest = 0;
    for (let i = 0; i < points; i++) longest = Math.max(longest, _motionLength[i]);
    return longest;
  }
  const filmRenderer = createStudioFilm({
    renderer, scene, camera, post, lighting,
    clockMs: () => clockMs,
    seek: (ms: number) => rebuildEffects(ms),
    advanceTo: (ms: number) => { advanceTimeline(ms - clockMs, true); },
    refreshFxForCamera: () => stepFx(0),
    prepareWorld(complete: boolean) {
      const world = getWorld();
      if (!world) return;
      camera.getWorldDirection(_fwd);
      world.update(0, camera.position, _fwd, null);
      // Paused cameras do not drive ordinary streaming; finish this view's
      // terrain lookahead so a frame never depends on how fast the host is.
      if (complete) for (let jobs = 0; jobs < 256; jobs++) if (!world.warmTerrainLookahead(camera.position, 1)) break;
    },
    cutTimes: () => storyboard.shots.filter((shot) => shot.transition === 'cut').map((shot) => shot.tMs),
    motionPathPx: filmMotionPathPx,
    setFilmMode(on: boolean) {
      if (on === filming) return;
      filming = on;
      // Picture passes render at capture quality for every film frame and film still.
      cinema?.setQuality(on ? 'capture' : 'preview');
      if (on) {
        timeScale = 0;
        savedGuides.marker = marker.group.visible;
        marker.group.visible = false;
      } else {
        marker.group.visible = savedGuides.marker;
        for (const actor of actors) { actor.filmScrollL = 0; actor.filmScrollR = 0; }
      }
      rail.updateVisibility();
      invalidate();
    },
  });

  function filmSettingsFor(opts: FilmSettingsInput): FilmSettings {
    const base = sceneFilm ?? FILM_DEFAULTS;
    return normalizeFilm({
      fps: opts.fps ?? base.fps,
      shutterDeg: opts.shutterDeg ?? base.shutterDeg,
      shake: opts.shake ?? base.shake,
      samples: opts.samples ?? base.samples,
      maxSamples: opts.maxSamples ?? base.maxSamples,
      filter: opts.filter ?? base.filter,
      speed: opts.speed ?? base.speed,
    });
  }

  function filmBusy(): string | null {
    if (recording) return 'Stop recording before rendering a film';
    if (loading || mapChange || productionLoading) return 'Finish the current Studio operation first';
    if (filmRenderer.active) return 'A film render is already active';
    return null;
  }

  /**
   * Open an offline film over the storyboard (or [startMs, endMs]) at an exact
   * output size. Settings default to the scene's `film` block, then
   * FILM_DEFAULTS. Frames render in order via renderFilmFrame(); endFilm()
   * restores the live Studio.
   */
  function beginFilm(opts: FilmBeginOptions = {}): FilmSessionInfo {
    const busy = filmBusy();
    if (busy) throw new Error(busy);
    const settings = filmSettingsFor(opts);
    const [defaultW, defaultH] = productionFormat === 'portrait' ? [1080, 1920]
      : productionFormat === 'square' ? [1080, 1080] : [1920, 1080];
    timeScale = 0;
    filmShake = settings.shake;
    const session = filmRenderer.begin({
      width: opts.width ?? defaultW,
      height: opts.height ?? defaultH,
      settings,
      startMs: opts.startMs,
      endMs: opts.endMs,
    }, storyboard.durationMs);
    perf.renderedFrames++;
    return session;
  }

  function filmFrameDataUrl(opts: FilmRenderOptions): string {
    return renderer.domElement.toDataURL(opts.type || 'image/png', opts.quality);
  }

  /**
   * One film frame: the next frame of the open film (beginFilm), or without
   * one a supersampled still of the current instant (capture() options plus
   * `samples`, `filter`, `supersample`; `dataURL: true` returns the PNG).
   */
  function renderFilmFrame(opts: FilmRenderOptions & CaptureOptions = {}): (FilmFrameInfo & { dataURL?: string })
    | { dataURL: string; width: number; height: number } {
    if (!filmRenderer.active) {
      return capture({ ...opts, samples: opts.samples ?? (sceneFilm ?? FILM_DEFAULTS).samples });
    }
    const frame = filmRenderer.renderNext();
    perf.renderedFrames++;
    return opts.dataURL ? { ...frame, dataURL: filmFrameDataUrl(opts) } : frame;
  }

  function endFilm(): boolean {
    if (!filmRenderer.active) return false;
    filmRenderer.end();
    filmShake = 1;
    panel.refreshAll();
    renderCaptureFrame(); // a complete live frame at the restored viewport
    return true;
  }

  function captureFilmStill(width: number, height: number, opts: CaptureOptions) {
    const busy = filmBusy();
    if (busy) throw new Error(busy);
    let dataURL = '', samples = 1, exposureMs = 0;
    const exposure = Math.max(0, Number(opts.exposureMs) || 0);
    filmShake = exposure > 0 ? Math.min(2, Math.max(0, opts.shake ?? sceneFilm?.shake ?? 1)) : 1;
    try {
      const still = filmRenderer.renderStill({
        width, height,
        // An exposure needs several instants; 16 is the base before motion adapts it.
        samples: opts.samples ?? (exposure > 0 ? 16 : undefined),
        filter: opts.filter,
        supersample: opts.supersample,
        exposureMs: exposure,
        maxSamples: opts.maxSamples,
        durationMs: storyboard.durationMs,
      });
      dataURL = still.canvas.toDataURL(opts.type || 'image/png', opts.quality);
      samples = still.samples;
      exposureMs = still.exposureMs;
    } finally {
      filmShake = 1;
      renderCaptureFrame(); // restore a complete live view after the size change
    }
    if (opts.download) {
      const link = document.createElement('a');
      link.href = dataURL;
      link.download = opts.name || `studio_${getWorld()?.mapId || 'map'}_${Date.now()}.png`;
      link.click();
    }
    return { dataURL, width, height, samples, exposureMs };
  }

  function getFilm(): FilmSettings | null {
    return sceneFilm ? normalizeFilm(sceneFilm) : null;
  }

  // --- in-browser offline export (studioFilmExport.ts, lazy) ----------------------
  let filmExport: { controller: AbortController; progress: FilmExportProgress | null } | null = null;

  /**
   * Render the storyboard as a film and encode it in the browser (WebCodecs:
   * H.264/MP4, else VP9/WebM). Deterministic frames, nothing dropped; the
   * playhead returns to where it was. Resolves with the file (downloaded
   * unless `download: false`).
   */
  function exportFilmFile(opts: FilmExportRequest = {}): Promise<FilmExportResult> {
    if (filmExport) return Promise.reject(new Error('A film export is already running'));
    const busy = filmBusy();
    if (busy) return Promise.reject(new Error(busy));
    let settings: FilmSettings;
    let size: { width: number; height: number };
    try {
      settings = filmSettingsFor(opts);
      size = opts.width && opts.height
        ? { width: opts.width, height: opts.height }
        : filmOutputSize(productionFormat, opts.resolution ?? 1080);
    } catch (error) {
      return Promise.reject(error);
    }
    const playhead = clockMs;
    const controller = new AbortController();
    const session = { controller, progress: null as FilmExportProgress | null };
    filmExport = session;
    const run = async (): Promise<FilmExportResult> => {
      const { exportFilm } = await import('./studioFilmExport.ts');
      const withAudio = opts.audio !== false;
      return exportFilm({
        begin: () => {
          filmCues = withAudio ? [] : null;
          const session = beginFilm({ ...settings, width: size.width, height: size.height, startMs: opts.startMs, endMs: opts.endMs });
          // The opening seek replays every earlier event: keep only those at the film's first instant.
          if (filmCues) filmCues = filmCues.filter((cue) => cue.timelineMs >= session.startMs - 1e-3);
          return session;
        },
        renderNext: () => {
          const frame = filmRenderer.renderNext();
          perf.renderedFrames++;
          return frame;
        },
        end: () => { filmCues = null; endFilm(); },
        canvas: renderer.domElement,
        soundtrack: withAudio ? async (session) => {
          const cues = filmCues ?? [];
          filmCues = null;
          const { renderFilmSoundtrack } = await import('./studioFilmAudio.ts');
          const map = createFilmTimeMap(settings.speed, session.startMs, session.endMs);
          const aspect = session.width / session.height;
          return renderFilmSoundtrack(cues, {
            listenerAt(timelineMs, out) {
              poseMotionCamera(timelineMs, aspect);
              const e = _motionCam.matrixWorld.elements;
              out.x = e[12]; out.y = e[13]; out.z = e[14];
              out.rightX = e[0]; out.rightY = e[1]; out.rightZ = e[2];
            },
            filmMsAt: (timelineMs) => map.filmAt(timelineMs),
            speedAt: (timelineMs) => map.speedAt(timelineMs),
          }, { durationS: session.frames / session.fps, seed: sceneMeta.seed || 5000, mapId: getWorld()?.mapId ?? null });
        } : undefined,
      }, {
        width: size.width,
        height: size.height,
        fps: settings.fps,
        bitrate: opts.bitrate,
        container: opts.container,
        signal: controller.signal,
        onProgress(progress) { session.progress = progress; opts.onProgress?.(progress); },
        onFrame: opts.onFrame ? (canvas) => opts.onFrame?.(canvas) : undefined,
      });
    };
    return run().then((result) => {
      if (opts.download !== false) {
        const url = URL.createObjectURL(result.blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = opts.name ||
          `studio_${getWorld()?.mapId || 'film'}_${size.height}p${settings.fps}.${result.container}`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      }
      return result;
    }).finally(() => {
      if (filmExport === session) filmExport = null;
      seekTimeline(playhead);
      panel.refreshAll();
    });
  }

  function cancelFilmExport(): boolean {
    if (!filmExport) return false;
    filmExport.controller.abort();
    return true;
  }

  function filmExportStatus() {
    return {
      active: !!filmExport,
      supported: typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined',
      progress: filmExport?.progress ?? null,
    };
  }

  /** Author the scene's `film` block (merged onto the current one); null removes it. */
  function setFilm(patch: FilmSettingsInput | null): FilmSettings | null {
    if (filmRenderer.active) throw new Error('Finish the film render first');
    sceneFilm = patch === null ? null : normalizeFilm({ ...(sceneFilm ?? FILM_DEFAULTS), ...patch });
    return getFilm();
  }

  // --- scene JSON --------------------------------------------------------------
  /** @returns {object} round-trippable scene JSON (docs/STUDIO.md schema). */
  function stateJson() {
    const w = getWorld();
    return {
      map: w ? w.mapId : 'verdant',
      // the time as rendered (a space map keeps its authored day)
      timeOfDay: studioTimeFor(w ? w.mapId : 'verdant', timeOfDay),
      ...(studioLight ? { light: { ...studioLight } } : {}),
      productionFormat,
      ...(studioFxState(fxSettings) ? { fx: studioFxState(fxSettings) } : {}),
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
      ...(sceneFilm ? { film: getFilm() } : {}),
      ...pictureStateEntry(),
      ...(sceneMeta.sections ? {} : { destruction: { sections: false } }),
    };
  }

  /** Scenes without a picture keep exactly the earlier state() shape. */
  function pictureStateEntry(): { picture?: Record<string, RuntimeValue> } {
    const json = pictureStateJson(picture);
    return json ? { picture: json } : {};
  }

  async function ensureLoadMap(json: StudioSceneInput): Promise<void> {
    const mapId = resolveMapId(json.map || 'verdant', () => 0.01);
    if (!active) await enter({ map: mapId });
    const world = getWorld();
    if (!world || world.mapId !== mapId) await setMap(mapId);
  }

  async function replaceLoadActors(
    json: StudioSceneInput,
    yieldForFrameBudget: () => Promise<void>,
  ): Promise<void> {
    sceneMeta.seed = json.seed != null ? json.seed : 5000;
    sceneMeta.sections = json.destruction?.sections !== false;
    timeScale = 0;
    clearActors();
    resetFx(sceneMeta.seed);
    await yieldForFrameBudget();
    for (const cfg of json.actors || []) {
      addActor(cfg);
      await yieldForFrameBudget();
    }
  }

  function loadedStoryboard(json: StudioSceneInput): Storyboard {
    const lastEffectMs = (json.effects || []).reduce<number>(
      (maximum, effect) => Math.max(maximum, Number(effect.tMs) || 0),
      0,
    );
    return normalizeStoryboard(json.storyboard || {
      durationMs: Math.min(
        STUDIO_MAX_DURATION_MS,
        Math.max(12000, Number(json.fxTime) || 0, lastEffectMs),
      ),
    });
  }

  function replaceLoadEffects(json: StudioSceneInput, fxMs: number): void {
    const effects = (json.effects || [])
      // an effect naming an actor the scene does not stage cannot fire: dropped, with a warning (the media lane's
      // s38-church-knockout named an ally1 it never staged)
      .filter((effect: StudioEffectInput) => {
        if (effect.actor == null || findActor(effect.actor)) return true;
        console.warn(`[studio] ${effect.type} at ${effect.tMs || 0} ms names actor ${String(effect.actor)}, which the scene does not stage: dropped`);
        return false;
      })
      .map((effect: StudioEffectInput): StudioEffectInput & { tMs: number } => ({
        ...effect,
        tMs: clampStudioTime(effect.tMs || 0, storyboard.durationMs),
      }))
      .sort((left, right) => left.tMs - right.tMs);
    for (const effect of effects) effectLog.push(makeEffectRecord(effect, effect.tMs));
    rebuildEffects(fxMs);
  }

  function restoreLoadedPresentation(json: StudioSceneInput, fxMs: number): void {
    ctx.getStudioLight?.()?.setActorRoots(actorRoots); // the loaded batch's headlights join the night lamp pool once
    timeScale = fxMs >= storyboard.durationMs
      ? 0
      : Math.max(0, Math.min(4, json.timeScale != null ? json.timeScale : 0));
    getWorld()?.setWindTime(0.35 + fxMs / 1000);
    for (const actor of actors) actor.visual.syncFromState(actor.state, 0);
    lighting.updateFrustums();
    lighting.update(true);
    selectedEffect = null;
    rail.updateVisibility();
    panel.refreshAll();
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
    _opts: Readonly<Record<string, RuntimeValue>> = {},
  ): Promise<ReturnType<typeof stateJson>> {
    const loadedFormat = json.productionFormat ?? 'landscape';
    productionAspect(loadedFormat); // Validate before replacing any scene state.
    const loadedFilm = json.film == null ? null : normalizeFilm(json.film);
    if (filmRenderer.active) throw new Error('Finish the film render before loading a scene');
    if (json.timeOfDay !== undefined && !isStudioTime(json.timeOfDay)) throw new RangeError('Unknown time of day');
    const loadedLight = normalizeStudioLight(json.light); // throws on a malformed block before any state changes
    const loadedPicture = resolvePicture(json.picture); // validate before replacing scene state
    if (recording) throw new Error('Stop recording before loading a scene');
    if (loading) throw new Error('studio.load already in flight');
    loading = true;
    try {
      const yieldForFrameBudget = createFrameBudgetYielder(10);
      await ensureLoadMap(json);
      await setTimeOfDay(json.timeOfDay ?? 'day', loadedLight);
      applyFxSettings(normalizeStudioFx(json.fx));
      await replaceLoadActors(json, yieldForFrameBudget);
      storyboard = loadedStoryboard(json);
      bindStoryboardTracks();
      selectedShotId = storyboard.shots[0]?.id || null;
      rail.rebuild();
      await yieldForFrameBudget();
      if (json.camera) applyCamera(json.camera);
      // Canonical timeline: log every authored event, then deterministically
      // rebuild the visible frame at the requested playhead. Future events
      // remain scheduled and will fire automatically during playback.
      const fxMs = clampStudioTime(json.fxTime || 0, storyboard.durationMs);
      replaceLoadEffects(json, fxMs);
      await yieldForFrameBudget();
      productionFormat = loadedFormat; // Camera keys already carry this framing; never reframe on load.
      sceneFilm = loadedFilm;
      picture = loadedPicture;
      applyPictureRuntime();
      restoreLoadedPresentation(json, fxMs);
      // a clip starts with the flare at its target: no eased history from the last clip or page
      post.lensFlare?.snap?.();
      return stateJson();
    } finally {
      loading = false;
    }
  }

  const sameLight = (a: StudioLight | null, b: StudioLight | null): boolean =>
    (a?.sunAzimuthDeg ?? null) === (b?.sunAzimuthDeg ?? null) && (a?.sunElevationDeg ?? null) === (b?.sunElevationDeg ?? null)
    && (a?.headlights ?? true) === (b?.headlights ?? true);

  /** Re-light the active world (a covered transition for time changes; slider-rate sun moves stay uncovered). */
  async function applyStudioLight(time: StudioTimeOfDay, light: StudioLight | null, covered: boolean): Promise<void> {
    const work = async (): Promise<void> => {
      await ctx.prepareStudioAtmosphere?.(time, light);
      timeOfDay = time;
      studioLight = light;
      lighting.updateFrustums();
      lighting.update(true);
      panel.refreshMap();
      invalidate();
    };
    if (covered) await transition.run(work, { title: t('studio.settingLight') });
    else await work();
  }

  /**
   * Select a Studio time of day. A new time keeps the sun's bearing override and takes its own elevation; pass
   * `light` (an object, or null to clear) to set the override with it. Space maps render their authored day.
   */
  async function setTimeOfDay(time: StudioTimeOfDay, light?: StudioLight | null): Promise<StudioTimeOfDay> {
    if (!isStudioTime(time)) throw new RangeError('Unknown time of day');
    if (recording) throw new Error('Stop recording before changing the light');
    if (filming) throw new Error('Finish the film render first');
    // a new time keeps the bearing and the headlights choice; its elevation band is its own
    const kept = studioLight ? normalizeStudioLight({ sunAzimuthDeg: studioLight.sunAzimuthDeg, headlights: studioLight.headlights }) : null;
    const nextLight = light !== undefined ? normalizeStudioLight(light) : time === timeOfDay ? studioLight : kept;
    if (time !== timeOfDay || !sameLight(nextLight, studioLight)) await applyStudioLight(time, nextLight, true);
    return studioTimeFor(getWorld()?.mapId ?? 'verdant', time);
  }

  /**
   * Merge a sun override: `{sunAzimuthDeg?, sunElevationDeg?}` (a null field removes it), or null to clear. The
   * elevation is clamped into the current time's band (getLight().band).
   */
  async function setLight(patch: StudioLight | null): Promise<ReturnType<typeof getLight>> {
    if (recording) throw new Error('Stop recording before changing the light');
    if (filming) throw new Error('Finish the film render first');
    if (patch !== null && (typeof patch !== 'object' || Array.isArray(patch))) throw new TypeError('Studio light must be an object or null');
    const next = patch === null ? null : normalizeStudioLight({ ...(studioLight ?? {}), ...patch });
    const mapId = getWorld()?.mapId ?? 'verdant';
    // keep the stored elevation inside the band so state() reports what renders
    if (next?.sunElevationDeg !== undefined) {
      const band = studioElevationBand(mapId, timeOfDay);
      next.sunElevationDeg = Math.min(band.max, Math.max(band.min, next.sunElevationDeg));
    }
    if (!sameLight(next, studioLight)) await applyStudioLight(timeOfDay, next, false);
    return getLight();
  }

  /** The light as rendered: the time, the sun (moon at night) and the override band for the active map. */
  function getLight() {
    const world = getWorld();
    const mapId = world?.mapId ?? 'verdant';
    const plan = world ? planStudioLight(mapId, studioAuthoredSky(world), timeOfDay, studioLight) : null;
    const band = studioElevationBand(mapId, timeOfDay);
    return {
      time: studioTimeFor(mapId, timeOfDay),
      requestedTime: timeOfDay,
      sunAzimuthDeg: plan?.sunAzimuthDeg ?? null,
      sunElevationDeg: plan?.sunElevationDeg ?? null,
      override: studioLight ? { ...studioLight } : null,
      headlights: studioLight?.headlights !== false,
      band: { min: band.min, max: band.max },
      times: [...studioTimesFor(mapId)],
      space: plan?.space ?? false,
    };
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
      // a space map renders its authored day; the requested time returns on the next terrestrial map
      await ctx.prepareStudioAtmosphere?.(timeOfDay, studioLight);
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
      await ctx.prepareStudioAtmosphere?.(timeOfDay, studioLight);
      // Cold /studio and first-use F8 have no battlefield preset until the
      // awaited acquisition has activated its world. Never borrow the Garage
      // (or previous map's) sun while the requested map is still loading.
      setGarageSunTrim(false);
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
      applyPictureRuntime(); // a picture set before entry takes effect with the Studio frame
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
    transition.run(() => doExit(), {
      kicker: 'Scene Studio', title: 'Garage',
      mapId: getWorld()?.mapId,
      progress: false, minShowMs: 250,
    }).finally(() => { exiting = false; });
  }

  async function doExit() {
    if (!active) return;
    if (recording) stopRecording();
    flareToWallClock();
    active = false;
    panel.hide();
    marker.group.visible = false;
    placeArmed = null;
    dragActor = null;
    dragging = false;
    keys.clear();
    releaseCrushes();
    clearActors();
    shells.length = 0;
    effectLog.length = 0;
    activeEffectIds.clear();
    fx.resetAll();
    studioStages.clear();
    resetStudioGround(true);
    fx.setFrozen(false);
    releaseStudioFx();
    timeScale = 1;
    camera.rotation.z = 0; // no roll may leak into game cameras
    cam.roll = 0;
    storyboard = normalizeStoryboard();
    selectedShotId = null;
    shotUidSeq = 1;
    actorKeyUidSeq = 1;
    rail.rebuild();
    rail.updateVisibility();
    disposePicture();
    unsweepPool();
    ctx.restoreStudioAtmosphere?.(); // the cached battlefield gets its baked horizon light back before it can host a battle
    await enterGarage(); // restores camo overrides, sun trim, spots, showroom
    syncRoute(false);
    docBrand('garage');
  }

  // --- per-frame (owns the whole frame while active; called from main tick) ---
  function tick(dt: number, frameWallDtSeconds = dt): void {
    if (filming) return; // an offline film renders its own frames
    const cameraMoved = updateCamera(dt);
    poolSweepAcc += dt;
    if (poolSweepAcc >= 0.5) {
      poolSweepAcc = 0;
      sweepPool();
    }
    panel.tick(dt);
    const playbackScale = timeScale;
    const animating = playbackScale > 0;
    // Canvas encoders may need several frame timestamps before yielding their
    // first chunk. Keep submitting the held opening pose until that happens.
    const primingEncoder = !!recording?.awaitingFirstChunk && !recording.stopping && !recording.failed;
    if (!animating && !primingEncoder && !cameraMoved && !frameDirty) {
      perf.skippedFrames++;
      return;
    }
    const w = getWorld();
    const wdt = 0; // Water uses the fixed Studio timeline; camera/LOD maintenance stays render-driven.
    camera.getWorldDirection(_fwd);
    if (w) w.update(wdt, camera.position, _fwd, null);
    if (!animating) syncCrushPlan(w); // a paused edit re-plans the crushes at the playhead
    if (animating) {
      // MediaRecorder timestamps follow elapsed wall time. The interactive
      // frame delta is capped at 100 ms, so using it here stretches recordings
      // whenever a costly frame exceeds that cap. Replay the bounded timeline
      // through the elapsed recording instant, retaining its fixed support steps.
      const advanceMs = recording && !recording.awaitingFirstChunk
        ? Math.max(0, Math.min(storyboard.durationMs - clockMs,
          performance.now() - recording.startedAt - recording.leadInMs - clockMs))
        : dt * playbackScale * 1000;
      advanceTimeline(advanceMs);
    }
    else stepFx(0);
    if (camera.fov !== lastFov) {
      lighting.updateFrustums();
      lastFov = camera.fov;
    }
    lighting.update();
    post.render(dt, frameWallDtSeconds);
    if (primingEncoder && recording) {
      const session = recording;
      try {
        const track = session.stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;
        track?.requestFrame?.();
      } catch (error) {
        session.fail(error);
      }
    }
    perf.renderedFrames++;
    frameDirty = false;
    if (recording && !recording.stopping && clockMs >= storyboard.durationMs) {
      stopRecording();
    }
  }

  function urlParam(name: string): string | null {
    try { return new URLSearchParams(window.location.search).get(name); } catch (_) { return null; }
  }

  /** Is the page on the /studio pretty route (vite.config.ts rewrite)? */
  function onStudioRoute() {
    try { return resolveLocalePath(window.location.pathname).pathname === '/studio'; } catch (_) { return false; }
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
      const want = pathForLocale(inStudio ? '/studio' : '/', getLocale());
      if (window.location.pathname === want) return;
      const sp = new URLSearchParams(window.location.search);
      sp.delete('studio');
      if (!inStudio) sp.delete('scene');
      const qs = sp.toString();
      window.history.replaceState(null, '', want + (qs ? `?${qs}` : ''));
    } catch (_) { /* sandboxed frames — cosmetic only */ }
  }

  /**
   * Tab identity follows the mode (owner: "use relevant logos"): the studio
   * mark + route metadata while active, then the crest favicon + canonical
   * Garage metadata on exit so direct /studio boots restore cleanly too.
   */
  const docBrand = (() => {
    interface SavedBrand {
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
              links: links.map((l) => ({
                l, href: l.getAttribute('href'), type: l.getAttribute('type'),
              })),
            };
          }
          for (const l of links) {
            l.setAttribute('href', '/brand/nav/studio.svg');
            l.setAttribute('type', 'image/svg+xml');
          }
          applySiteMetadataToDocument(document, localizedStudioMetadata(getLocale()));
        } else if (saved) {
          for (const { l, href, type } of saved.links) {
            if (href != null) l.setAttribute('href', href);
            else l.removeAttribute('href');
            if (type) l.setAttribute('type', type);
            else l.removeAttribute('type');
          }
          applySiteMetadataToDocument(document, localizedGameMetadata(getLocale()));
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
      pos: [r2(a.timelineX), r2(a.timelineZ)],
      // where the hull stands (a bridge deck, not the ground under it), for shot tools' sightlines
      y: r2(a.state.pos.y),
      facingDeg: r2(a.state.yaw / DEG), turretDeg: r2(a.state.turretYaw / DEG),
      gunDeg: r2(a.state.gunPitch / DEG), state: a.stateName,
      smoking: !!a.smoking, burning: !!a.burning,
      camo: a.camo || null, camoSeed: a.camoSeed,
    })),
    /** The hulls' crushes over the take (studioCrush.ts): when, what, where and how fast, for scores and shot tools. */
    crushEvents: () => {
      const world = getWorld();
      syncCrushPlan(world);
      return crushes.events.map((e) => {
        if (e.record) {
          return {
            tMs: Math.round(e.tMs), kind: e.record.kind ?? 'obstacle', speedMps: r2(e.speedMps),
            pos: [r2((e.record.min[0] + e.record.max[0]) / 2), r2(e.record.min[1]), r2((e.record.min[2] + e.record.max[2]) / 2)],
            heightM: r2(e.record.max[1] - e.record.min[1]),
          };
        }
        const prop = world?.crushables[e.crushable];
        return {
          tMs: Math.round(e.tMs), kind: prop?.kind ?? (prop?.index != null ? 'pole' : 'prop'), speedMps: r2(e.speedMps),
          pos: prop ? [r2(prop.x), r2(prop.y), r2(prop.z)] : [0, 0, 0], heightM: r2(prop?.h ?? 0),
        };
      });
    },
    state: stateJson,
    // session control
    enter: (opts: EnterOptions = {}) => enter(opts),
    exit,
    /** Offline export: monotonic fixed steps, no wall clock or MediaRecorder frame drops. */
    advanceFrame(ms: number) {
      if (recording || filming || !Number.isFinite(ms) || ms < 0 || ms > 1000) throw new RangeError('Invalid export step');
      timeScale = 0;
      if (!flareOnExportClock) { flareOnExportClock = true; post.lensFlare?.setClock?.(() => clockMs); }
      advanceTimeline(ms);
      getWorld()?.setWindTime(0.35 + clockMs / 1000);
      camera.updateMatrixWorld(true);
      lighting.updateFrustums(); lighting.update(true);
      return clockMs;
    },
    /** The stages and breaches the Studio's destruction raised so far (P2 strips read which each frame presented). */
    destructionEvents: () => studioSimLog.slice(),
    get timeOfDay() { return studioTimeFor(getWorld()?.mapId ?? 'verdant', timeOfDay); },
    setTimeOfDay,
    setLight,
    getLight,
    STUDIO_TIMES,
    STUDIO_TIME_BANDS,
    /** Scene FX quality: `battle` (the game's exact look) or `cinematic`. */
    setFxQuality(quality: StudioFxQuality) {
      if (recording || filming || !STUDIO_FX_QUALITIES.includes(quality)) return fxSettings.quality;
      applyFxSettings(normalizeStudioFx({ quality, trackDust: quality === 'cinematic' ? true : fxSettings.trackDust }));
      rebuildEffects(clockMs);
      return fxSettings.quality;
    },
    get fxQuality() { return fxSettings.quality; },
    /** Automatic dust + prints behind timeline-driven actors. */
    setTrackDust(on: boolean) {
      if (recording || filming) return fxSettings.trackDust;
      applyFxSettings({ ...fxSettings, trackDust: !!on });
      rebuildEffects(clockMs);
      return fxSettings.trackDust;
    },
    get trackDust() { return fxSettings.trackDust; },
    cinematicStats: () => cinematics?.stats() ?? null,
    setMap: (id: string) => recording || filming
      ? Promise.reject(new Error(filming ? 'Finish the film render first' : 'Stop recording before changing battlefield'))
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
      resetFx(); rebuildEffects(0); panel.refreshAll();
      return true;
    },
    advanceFx: (ms: number) => seekTimeline(clockMs + ms),
    setTimeScale: (v: number) => {
      if (recording || filming) return timeScale;
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
    directProduction,
    applyProductionCamera,
    setProductionFormat,
    get productionFormat() { return productionFormat; },
    seek: seekTimeline,
    play: playTimeline,
    pause: pauseTimeline,
    stop: stopTimeline,
    get durationMs() { return storyboard.durationMs; },
    get playing() { return timeScale > 0; },
    get railVisible() { return railVisible; },
    /** The battlefield's plan for the Studio's Plan view: the HUD minimap's features and the map's extent. */
    getPlanFeatures() {
      const world = getWorld();
      if (!world) return null;
      const f = world.getMinimapFeatures();
      return { size: world.heightField.size, roads: f.roads, buildings: f.buildings, treeClusters: f.treeClusters, waterOrSoft: f.waterOrSoft };
    },
    get selectedShotId() { return selectedShotId; },
    // video output
    recordVideo,
    stopRecording,
    recordingStatus,
    // offline film renderer (studioFilm.ts; docs/STUDIO.md "Film renderer")
    beginFilm,
    renderFilmFrame,
    endFilm,
    getFilm,
    setFilm,
    get filming() { return filmRenderer.active; },
    get filmInfo() { return filmRenderer.info; },
    exportFilm: exportFilmFile,
    cancelFilmExport,
    filmExportStatus,
    FILM_DEFAULTS,
    // camera
    setCamera: (cfg: CameraConfig) => recording ? getCamera() : applyCamera(cfg),
    getCamera,
    // picture (docs/STUDIO.md "Picture")
    setPicture: (patch: PicturePatch | null) => recording ? getPicture() : setPicture(patch),
    getPicture,
    pictureInfo,
    PICTURE_PRESETS,
    // constants for tooling/panel
    TANK_IDS: VISIBLE_TANK_IDS,
    MAP_IDS,
    ACTOR_STATES,
    EFFECT_TYPES,
    FX_QUALITIES: STUDIO_FX_QUALITIES,
    FX_PARAMS: STUDIO_FX_PARAMS,
    CAMO_PATTERN_IDS: CAMO_CATALOG_PATTERN_IDS,
    getMapInfo: (id: string) => {
      const config = getMapConfig(id);
      return { id, name: config.name || id };
    },
    getSpecInfo: (id: string) => {
      const s = getSpec(id);
      const roster = s.roster && typeof s.roster === 'object'
        ? s.roster as Record<string, RuntimeValue>
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
      /** Film accumulation (picture↔film contract): the finish runs once per output frame. */
      picture: {
        setFinishBypass: (bypass: boolean) => ensureCinema().setFinishBypass(bypass),
        renderFinish: (...args: Parameters<CinemaRuntime['renderFinish']>) => ensureCinema().renderFinish(...args),
        setQuality: (quality: Parameters<CinemaRuntime['setQuality']>[0]) => cinema?.setQuality(quality),
        get runtime() { return cinema; },
      },
    },
  };

  const panel = createStudioPanel(api);

  window.__STUDIO = api;

  // Auto-entry: the /studio pretty route or the legacy ?studio=1 param
  // (waits for readiness; map via ?map=…). A scene link, ?scene=/path/on/this/site.json (studioSceneLink.ts), enters
  // on the scene's own map and loads it as Load JSON would; a link that fails to load leaves the plain Studio open.
  if (ctx.autoEnter !== false && (urlParam('studio') || onStudioRoute())) {
    const map = urlParam('map') || 'verdant';
    const scenePath = sceneLinkPath(urlParam('scene'));
    const scene = scenePath
      ? fetch(scenePath).then((response) => {
        if (!response.ok) throw new Error(`${scenePath}: HTTP ${response.status}`);
        return response.json() as Promise<StudioSceneInput>;
      })
      : null;
    scene?.catch(() => {}); // awaited below; never an unhandled rejection while the game boots
    const t = setInterval(() => {
      if (!window.__GAME_READY) return;
      clearInterval(t);
      const entry = scene
        ? scene.then(
          (json) => enter({ map: json.map || map }).then(() => load(json)),
          (err: RuntimeValue) => { console.error('[studio] scene link failed', err); return enter({ map }); },
        )
        : enter({ map });
      entry.catch((err: RuntimeValue) => console.error('[studio] auto-enter failed', err));
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
