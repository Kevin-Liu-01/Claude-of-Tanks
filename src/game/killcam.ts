/**
 * killcam.ts — War Thunder-class kill camera (integration-owned module).
 *
 * CAPTURE: state.ts calls `game.killcam.recordSimStep(game)` every fixed step
 * (shell trajectory points) and `game.killcam.onShellHit(ev, target)` for every
 * resolved HitEvent (clearly-marked KILL-CAM sections there). Everything shown
 * during a replay comes from those snapshots — shooter/target poses, the full
 * trajectory, and the sim-resolved HitEvent (zone, nominal/effective armor,
 * rolls, modules/crew, ammo-rack flag). Nothing is recomputed and nothing
 * reads live AI state during playback.
 *
 * PLAYBACK (main.ts drives it at battle end):
 *  -1. WRECK (killcam r2, death view only, freshKill flag): the player died
 *      THIS moment and the battle is decided — before any replay chrome
 *      moves the camera away, a live-action hold (~2.2 s) keeps the frame on
 *      the player's own tank while the REAL destruction plays out at sim
 *      rate: fx fireball/debris/smoke stay visible and the killcam itself
 *      advances the victim's turret-pop/burn timelines (the sim/visual sync
 *      loop is frozen during replays). Mid-battle deaths get the same beat
 *      OUTSIDE the killcam (main.ts death beat — full-volume audio), so this
 *      phase self-gates on the freshness flag.
 *   0. APPROACH — eased establishing arc
 *      orbit from the player's live death view to the killer's position,
 *      landing exactly on the restored attacker's firing pose (no cuts). A
 *      shock flash + sliding letterbox + staggered chrome open the replay;
 *      a screen-space grade (desaturate + vignette) ramps over the death
 *      view. Exit is a letterbox close + fade-through-black into whatever
 *      follows (ally spectate / end screen), with scene teardown at black.
 *   1. FLIGHT — tracer chase along the captured trajectory from the
 *      killer's muzzle to the victim, at normal replay speed ramping to
 *      ~0.25x slow-mo through the final meters into the penetration.
 *   1b. IMPACT (killcam r2, owner: "show the actual animations of popping
 *      turrets and exploding, especially during kill cam"): the moment the
 *      tracer reaches the plate, the kill plays out LIVE before any
 *      analysis — detonation flash, fx fireball/debris/smoke re-fired on
 *      the restaged victim, the turret-pop arc tumbling at full rate with a
 *      brief ~0.55x dilation through the launch (fx clock scaled via
 *      main.ts), the camera pushed out and eased back onto the x-ray
 *      vantage. Ammo-rack kills toss the turret (pop 1.0), plain kills jolt
 *      it (pop 0.22) — same setDestroyed grammar as live play, GLB and
 *      procedural alike. Emits 'killcam:impact' {cause,pos,timeScale} on the
 *      bus as the additive audio seam for the replayed cinematic blast.
 *   2. X-RAY  — the victim rendered ghost-translucent (view-dependent fresnel
 *      skin, alpha-over blending that saturates instead of stacking to white,
 *      no depth writes so GTAO never shades a phantom hull), recognizable
 *      internal proxies drawn OVER the skin (ammo cassettes, engine block,
 *      fuel drums, crew capsules) tinted WHITE/yellow/red by post-hit state
 *      (WT convention — identity lives in shapes + chips, never the tint),
 *      the shell path drawn through the hull all the way to the deepest
 *      damaged component with a spall cone at the penetration point plus
 *      causal fragment streaks to every damaged module/crew slot, every
 *      module / crew box outlined, hit ones highlighted + DOM-labeled with
 *      leader lines and overlap deconfliction, and an annotation block
 *      (shell, distance, angle, nominal→effective armor, pen roll, damage).
 *      Holds XRAY_HOLD_S, any key/click skips.
 *   3. FINALE (killcam r3, OWN DEATHS ONLY — owner: "shows the tank as it was
 *      before it blew up with the turret still attached, then the skeleton
 *      with shell going through, and then us blowing up and turret coming off
 *      again"): when the player is the victim the IMPACT beat above is
 *      RE-ORDERED to play AFTER the x-ray. The analysis layer is torn down
 *      first (endXrayDressing — ghost skin, veil, internals, chips, light dim
 *      and vegetation hide all released, so nothing phantom survives over the
 *      fireball), then the exact same impact beat runs and exits to the
 *      results. Phase order per replay direction:
 *        own death, shell kill : [wreck] approach [flight] xray impact exit
 *        own death, burn-out   : [wreck] xray exit           (no rack pop —
 *                                the cook-off already played live)
 *        player kill / staged  : approach flight impact xray exit  (r2 order)
 *
 * The camera is driven exclusively through rig.setExternalPose (the rig's
 * external-pose API) — the rig is used, never modified.
 */
import * as THREE from 'three';
import { FONT_STACK, FONT_COND, ensureFonts } from '../ui/fonts.ts';
import { createElement as el, ensureStyle } from '../ui/dom.ts';
import { uiIconSVG } from '../ui/uiIcons.ts';
import {
  hitOutcomeFor, nominalPenFor, shellDisplayName, zoneLabel,
} from '../ui/hitEventFormat.ts';
import { MODULE_LABEL, CREW_LABEL } from '../ui/moduleRegistry.ts';
import { getSpec } from '../vehicles/specs.ts';
import { iconUrl } from '../ui/icons.ts';
import { tierNumeral } from '../ui/battleLoad.ts';
import { isKillcamGhostSurface } from './killcamGhostPolicy.ts';
import {
  addInternalCrewModel,
  addInternalDrivetrainModel,
  addInternalModuleModel,
} from '../vehicles/internalAnatomyVisuals.ts';
import {
  alignReplayPoseToShot, captureReplayPose, createReplayFlightTimeline,
  replayDistanceAtTime, replayStateFromPose,
} from './replayPose.ts';
import type { CameraRig } from '../engine/cameraRig.ts';
import type { FxRuntime } from '../fx/effects.ts';
import type { EventBus } from './stateCore.ts';
import type { ReplayFlightTimeline, ReplayPose, ReplayPoseState } from './replayPose.ts';
import type { ArmorEnvelope, CrewBox, ModuleBox } from '../vehicles/specHelpers.ts';
import type { FleetTankSpec } from '../vehicles/specContracts.ts';
import type { WorldRayHit } from '../world/map.ts';
import { t } from '../ui/i18n.ts';

type Vec3Tuple = [number, number, number];
type ModuleStateName = 'ok' | 'yellow' | 'red';
type ModuleStates = Partial<Record<string, ModuleStateName>>;
export type ReplayKind = 'projectile' | 'collision';
type PlaybackKind = 'death' | 'victory';
export type PlaybackPhase = 'wreck' | 'approach' | 'firing' | 'flight' | 'contact'
  | 'collision' | 'impact' | 'xray' | 'exit';
type Disposable = { dispose(): void };

interface KillcamModuleBox extends ModuleBox {
  parts?: Array<Pick<ModuleBox, 'min' | 'max'>>;
}

interface KillcamCrewBox extends CrewBox {
  parts?: Array<Pick<CrewBox, 'min' | 'max'>>;
}

type KillcamBox = {
  min: readonly [number, number, number];
  max: readonly [number, number, number];
  turretLocal: boolean;
};

interface NearMissRecord {
  key: string;
  label: string;
  score: number;
}

interface TrackShape {
  module: string;
  x0: number;
  x1: number;
  poly: Array<readonly [number, number]>;
}

interface KillcamArmor extends Omit<ArmorEnvelope, 'modules' | 'crew'> {
  modules: KillcamModuleBox[];
  crew: KillcamCrewBox[];
  trackShapes?: TrackShape[];
}

interface KillcamSpec extends FleetTankSpec {
  armor: KillcamArmor;
  gunArcDeg?: number;
}

interface KillcamModuleState {
  state: ModuleStateName;
}

interface KillcamCombat {
  destroyed: boolean;
  maxHp: number;
  modules: Partial<Record<string, KillcamModuleState>>;
  crew: Record<string, boolean>;
  eraSpent: Set<string>;
}

interface KillcamVisual {
  root: THREE.Object3D;
  syncFromState(state: ReplayPoseState, dt?: number): void;
  setDestroyed(options?: { pop?: boolean; ageS?: number }): void;
  isDestroyed?(): boolean;
  resetDestroyed?(): void;
  setVisible?(visible: boolean): void;
  setTrackState?(module: string, destroyed: boolean): void;
  resetEra?(): void;
  stripEra?(plate: string): void;
  gunDirWorld?(out: THREE.Vector3): THREE.Vector3;
  gunMuzzleWorld?(out: THREE.Vector3): THREE.Vector3;
  recoilKick?(amount?: number, scale?: number, muzzleIndex?: number): void;
  hitFlinch?(normalX: number, normalZ: number, scale: number, yaw: number): void;
  turretTopWorld(out: THREE.Vector3): void;
  gunPivotWorld(out: THREE.Vector3): void;
}

interface KillcamPoseState extends ReplayPoseState {
  pos: THREE.Vector3;
  yaw: number;
  turretYaw: number;
}

export interface KillcamEntity {
  id: string;
  specId: string;
  spec: KillcamSpec;
  state: KillcamPoseState;
  combat: KillcamCombat;
  visual: KillcamVisual;
  displayName?: string;
  team?: string;
  isPlayer?: boolean;
  modeActive?: boolean;
}

export interface KillcamShell {
  id: number;
  dead?: boolean;
  pos: THREE.Vector3;
}

export interface KillcamGame {
  phase: string;
  result: string | null;
  tanks: KillcamEntity[];
  shells: KillcamShell[];
  tankById: Map<string, KillcamEntity>;
}

interface ModuleHit {
  module: string;
  newState: ModuleStateName;
  dmg?: number;
}

export interface KillcamHitEvent {
  kind: string;
  cause?: string;
  shellId: number | null;
  shellType?: string;
  shellName?: string;
  caliberMm?: number;
  attackerId?: string;
  attackerName?: string;
  attackerSpecId?: string;
  targetId?: string;
  targetName?: string;
  targetSpecId?: string;
  targetMaxHp?: number;
  pos: Vec3Tuple;
  normal: Vec3Tuple;
  localPos: Vec3Tuple | null;
  localDir: Vec3Tuple | null;
  modulesHit: ModuleHit[];
  crewHit: string[];
  damage?: number;
  destroyed?: boolean;
  ammoRacked?: boolean;
  flightDistM?: number;
  timeS?: number;
  impactAngleDeg?: number;
  effectiveMm?: number;
  nominalMm?: number;
  physicalMm?: number;
  penRollMm?: number;
  penRollFreshMm?: number;
  eraPlate?: string | null;
  zone?: string;
  closingMps?: number;
  aId?: string;
  dmgA?: number;
  dmgB?: number;
  aModulesHit?: ModuleHit[];
  bModulesHit?: ModuleHit[];
}

interface ShellFiredPayload {
  shellId: number;
  shooterId: string;
  muzzlePos: Vec3Tuple;
  dir: Vec3Tuple;
  velocityMps?: number;
  timeS?: number;
  caliberMm?: number;
  weaponSound?: string | null;
  muzzleIndex?: number;
  recoilScale?: number;
}

interface TrajectoryRecord {
  pts: number[];
  muzzle: Vec3Tuple;
  dir: Vec3Tuple;
  velocityMps: number;
  timeS: number;
  attackerEnt: KillcamEntity | null;
  attackerPose: ReplayPose | null | undefined;
  moduleStates: ModuleStates | null;
  eraSpent: string[];
  caliberMm: number;
  weaponSound: string | null;
  muzzleIndex: number;
  recoilScale: number;
}

interface EntityFrame {
  pose: ReplayPose;
  crewAlive: Record<string, boolean> | null;
  moduleStates: ModuleStates | null;
  eraSpent: string[];
  destroyed: boolean;
}

export interface ReplaySnapshot {
  replayKind: ReplayKind;
  ev: KillcamHitEvent;
  timeS: number;
  trajPts: number[] | null;
  crewAlive: Record<string, boolean> | null;
  moduleStates: ModuleStates | null;
  eraSpent: string[];
  preCrewAlive: Record<string, boolean> | null;
  preModuleStates: ModuleStates | null;
  preEraSpent: string[];
  pose: ReplayPose;
  prePose?: ReplayPose | null;
  impactPose: ReplayPose | null;
  attackerEnt: KillcamEntity | null;
  attackerPose: ReplayPose | null | undefined;
  attackerImpactPose?: ReplayPose | null;
  attackerPreModuleStates: ModuleStates | null;
  attackerPreEraSpent: string[];
  attackerPreDestroyed?: boolean;
  attackerModuleStates?: ModuleStates | null;
  attackerEraSpent?: string[];
  attackerModulesHit?: ModuleHit[];
  muzzle: Vec3Tuple | null;
  shotDir: Vec3Tuple | null;
  muzzleVelocityMps: number;
  firedTimeS: number;
  caliberMm: number;
  weaponSound: string | null;
  muzzleIndex: number;
  recoilScale: number;
  targetEnt: KillcamEntity;
  armor: KillcamArmor;
  heightM: number;
  boundingRadiusM: number;
}

type CombatFrameSnapshot = Pick<ReplaySnapshot,
  'crewAlive' | 'moduleStates' | 'eraSpent'
  | 'preCrewAlive' | 'preModuleStates' | 'preEraSpent'>;

type CollisionAttackerSnapshot = Pick<ReplaySnapshot,
  'attackerPose' | 'attackerImpactPose' | 'attackerPreModuleStates'
  | 'attackerPreEraSpent' | 'attackerPreDestroyed'
  | 'attackerModuleStates' | 'attackerEraSpent' | 'attackerModulesHit'>;

type ProjectileAttackerSnapshot = Pick<ReplaySnapshot,
  'attackerEnt' | 'attackerPose' | 'muzzle' | 'shotDir' | 'muzzleVelocityMps'
  | 'firedTimeS' | 'caliberMm' | 'weaponSound' | 'muzzleIndex' | 'recoilScale'
  | 'attackerPreModuleStates' | 'attackerPreEraSpent'>;

interface SharedMaterials {
  ghost: THREE.MeshBasicMaterial;
  ghostCenter: { value: THREE.Vector3 };
  ghostRad: { value: number };
  ghostRingY: { value: number };
  ghostGearY: { value: number };
  trail: THREE.LineBasicMaterial;
  trailGlow: THREE.MeshBasicMaterial;
  trailCore: THREE.MeshBasicMaterial;
  trailGlowFar: THREE.MeshBasicMaterial;
  trailCoreFar: THREE.MeshBasicMaterial;
  halo: THREE.SpriteMaterial;
  tail: THREE.MeshBasicMaterial;
  edgeDim: THREE.LineBasicMaterial;
  edgeRed: THREE.LineBasicMaterial;
  edgeYellow: THREE.LineBasicMaterial;
  edgeCrew: THREE.LineBasicMaterial;
  fillRed: THREE.MeshBasicMaterial;
  fillYellow: THREE.MeshBasicMaterial;
  fillCrew: THREE.MeshBasicMaterial;
  pathIn: THREE.MeshBasicMaterial;
  pathOut: THREE.MeshBasicMaterial;
  pathCore: THREE.MeshBasicMaterial;
  spall: THREE.MeshBasicMaterial;
  frag: THREE.MeshBasicMaterial;
  fragRed: THREE.MeshBasicMaterial;
  fragYellow: THREE.MeshBasicMaterial;
  fragCrew: THREE.MeshBasicMaterial;
  marker: THREE.MeshBasicMaterial;
  core: THREE.MeshBasicMaterial;
  streak: THREE.MeshBasicMaterial;
  proxIntact: THREE.MeshLambertMaterial;
  proxSteel: THREE.MeshLambertMaterial;
  proxGreen: THREE.MeshLambertMaterial;
  proxYellow: THREE.MeshLambertMaterial;
  proxRed: THREE.MeshLambertMaterial;
  proxGrey: THREE.MeshLambertMaterial;
}

interface KillcamDom {
  root: HTMLDivElement;
  title: HTMLDivElement;
  titleT: HTMLDivElement;
  titleS: HTMLDivElement;
  skip: HTMLDivElement;
  hdMeta: HTMLDivElement;
  hdK: HTMLDivElement;
  hdW: HTMLDivElement;
  rows: HTMLDivElement;
  banner: HTMLDivElement;
  annot: HTMLDivElement;
  labelHost: HTMLDivElement;
  leader: SVGSVGElement;
  flash: HTMLDivElement;
  killer: {
    root: HTMLDivElement;
    sil: HTMLElement;
    name: HTMLElement;
    veh: HTMLElement;
    rows: HTMLElement;
  };
}

interface XrayCamera {
  center: THREE.Vector3;
  off: THREE.Vector3;
  pos: THREE.Vector3;
  look: THREE.Vector3;
}

interface XrayPoseGroups {
  pose: THREE.Group;
  turret: THREE.Group;
}

interface XrayBuildContext extends XrayPoseGroups {
  snap: ReplaySnapshot;
  event: KillcamHitEvent;
  armor: KillcamArmor;
  vehiclePose: ReplayPose;
  moduleHits: Map<string, ModuleStateName>;
  crewHits: Set<string>;
  anchors: Map<string, THREE.Object3D>;
  radiusScale: number;
}

interface TrackPrismBounds {
  min: Vec3Tuple;
  max: Vec3Tuple;
  center: Vec3Tuple;
}

interface ScreenObstacle {
  parent: THREE.Object3D | null;
  corners: THREE.Vector3[];
  key: string | null;
}

interface LayoutRect {
  left: number;
  top: number;
  lw: number;
  lh: number;
  fixed: boolean;
}

interface ScreenRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface ProjectedObstacleLayout {
  obstacles: ScreenRect[];
  anchors: Map<string, ScreenRect>;
}

interface KillcamLabel extends LayoutRect {
  label: HTMLElement;
  dot: HTMLElement | null;
  line: SVGLineElement | null;
  big: boolean;
  micro?: boolean;
  world: THREE.Vector3;
  key: string | null;
  hidden: boolean;
  ax: number;
  ay: number;
  below: boolean;
}

interface CollisionPlayback {
  t: number;
  hit: boolean;
  targetFrom: ReplayPose;
  targetTo: ReplayPose;
  attackerFrom: ReplayPose;
  attackerTo: ReplayPose;
  targetState: ReturnType<typeof replayStateFromPose>;
  attackerState: ReturnType<typeof replayStateFromPose>;
  cameraPos: THREE.Vector3;
  cameraLook: THREE.Vector3;
  side: THREE.Vector3;
}

interface PlaybackBundle {
  snap: ReplaySnapshot;
  kind: PlaybackKind;
  onDone: (() => void) | null;
  replayKind: ReplayKind;
  phase: PlaybackPhase;
  t: number;
  xt: number;
  group: THREE.Group;
  disposables: Disposable[];
  ghostBackup: Array<[THREE.Mesh, THREE.Material | THREE.Material[], number, boolean]> | null;
  ghostSeen: WeakSet<THREE.Mesh> | null;
  ghostVis: KillcamVisual | null;
  ghostSkin: (() => void) | null;
  labels: KillcamLabel[];
  obstacles: ScreenObstacle[];
  pts: THREE.Vector3[];
  cum: Float32Array;
  total: number;
  dur: number;
  segIdx: number;
  flightLift: Float32Array | null;
  flightDist: number;
  flightTimeline: ReplayFlightTimeline;
  contactT: number;
  contactDir: THREE.Vector3;
  app: {
    t: number; dur: number; fromPos: THREE.Vector3; fromLook: THREE.Vector3;
    fromFov: number; toPos: THREE.Vector3; toLook: THREE.Vector3;
    side: THREE.Vector3; sideAmt: number; lift: number; losLift: number;
  } | null;
  shot: { t: number; fired: boolean; pos: THREE.Vector3; look: THREE.Vector3; side: THREE.Vector3 } | null;
  shotFxT: number;
  shotFxLive: boolean;
  collision: CollisionPlayback | null;
  isDeathView: boolean;
  killerShown: boolean;
  core: THREE.Object3D;
  streak: THREE.Object3D;
  trailGeo: THREE.BufferGeometry;
  halo: THREE.Sprite;
  tail: THREE.Object3D;
  shellLight: THREE.PointLight;
  muzzleLight: THREE.PointLight;
  xcam: XrayCamera;
  fxGroup: THREE.Object3D | null;
  fxHidden: THREE.Object3D[] | null;
  vegGroup: THREE.Object3D | null;
  vegWasVisible: boolean;
  dimmedLights: Array<[THREE.DirectionalLight | THREE.HemisphereLight, number]> | null;
  rewreck: { pop: boolean; brokenTracks: string[]; eraSpent: string[] } | null;
  restageModuleStates: ModuleStates | null;
  restageEraSpent: string[];
  snapPoseState: ReturnType<typeof replayStateFromPose>;
  attackerPoseState: ReturnType<typeof replayStateFromPose> | null;
  attackerRestore: { wasDestroyed: boolean; wasVisible: boolean } | null;
  replayMuzzle: THREE.Vector3 | null;
  barrelDot: number | null;
  wreck: {
    t: number; next: 'approach' | 'xray' | 'collision'; vis: KillcamVisual; ent: KillcamEntity;
    fromPos: THREE.Vector3; fromLook: THREE.Vector3; fromFov: number;
    az?: number;
  } | null;
  it: number;
  itWall: number;
  impactVis: KillcamVisual;
  xrayAng0: number;
  xrayHoldS: number;
  cameraBlend: {
    t: number; dur: number; fromPos: THREE.Vector3; fromLook: THREE.Vector3; fromFov: number;
  } | null;
  finalePending: boolean;
  isFinale: boolean;
  impactAng0: number;
  exitWallMs?: number;
}

interface KillcamWorld {
  getConcealment(): Array<{ x: number; z: number; r: number; add: number }>;
  raycast(origin: THREE.Vector3, direction: THREE.Vector3, maxDistanceM: number): WorldRayHit | null;
}

type KillcamConcealment = ReturnType<KillcamWorld['getConcealment']>[number];

interface WorldClearance {
  clearAt(cameraPosition: THREE.Vector3, lookTarget: THREE.Vector3): boolean;
}

interface KillcamDeps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  rig: CameraRig;
  heightField: { getHeightAt(x: number, z: number): number };
  getPlayer(): KillcamEntity | null;
  getGame?(): KillcamGame | null;
  getEntity?(id: string): KillcamEntity | null;
  getWorld?(): KillcamWorld | null;
  getFx?(): FxRuntime | null;
}

interface KillcamDebugSurface {
  game?: KillcamGame | null;
  world?: KillcamWorld | null;
  fx?: FxRuntime | null;
  settings?: { isOpen?(): boolean };
}

interface RamReplaySelection {
  target: KillcamEntity;
  attacker: KillcamEntity;
  modules: ModuleHit[];
  direction: Vec3Tuple;
}

function debugSurface(): KillcamDebugSurface | null {
  if (typeof window === 'undefined' || !window.__DEBUG) return null;
  return window.__DEBUG as KillcamDebugSurface;
}

function cloneVec3Tuple(value: readonly number[]): Vec3Tuple {
  return [value[0] || 0, value[1] || 0, value[2] || 0];
}

function selectRamReplay(
  ev: KillcamHitEvent,
  a: KillcamEntity,
  b: KillcamEntity,
  player: KillcamEntity,
): RamReplaySelection | null {
  const normal = cloneVec3Tuple(ev.normal);
  const reverseNormal: Vec3Tuple = [-normal[0], -normal[1], -normal[2]];
  if (player === a && a.combat.destroyed) {
    return { target: a, attacker: b, modules: ev.aModulesHit || [], direction: reverseNormal };
  }
  if (player === b && b.combat.destroyed) {
    return { target: b, attacker: a, modules: ev.bModulesHit || [], direction: normal };
  }
  if (player === a && b.combat.destroyed) {
    return { target: b, attacker: a, modules: ev.bModulesHit || [], direction: normal };
  }
  if (player === b && a.combat.destroyed) {
    return { target: a, attacker: b, modules: ev.aModulesHit || [], direction: reverseNormal };
  }
  return null;
}

const XRAY_HOLD_S = 7.0;
const FLIGHT_MIN_S = 1.9;
const FLIGHT_MAX_S = 3.4;
// killcam_endscreen r1 — death-sequence cinematography constants:
// APPROACH: eased push-in orbit from the player's live death view toward the
// killer before the shot replays (no cuts — the camera lands EXACTLY on the
// flight chase cam's first pose). SLOWMO: the flight runs at normal replay
// speed and ramps to ~0.25x through the final meters into the penetration
// (WT death-cam retime). EXIT: letterbox close + fade-through-black into
// whatever follows (spectate / end screen).
const APPROACH_S = 1.6;        // push-in orbit duration
const FIRING_CAPTURE_S = 0.78; // deterministic still-frame staging only
const COLLISION_HOLD_S = 1.45; // rewind -> metal contact -> module failure
const CAMERA_HANDOFF_S = 0.62; // phase-to-phase pose/fov continuity
const SHOT_ACQUIRE_S = 0.42;   // readable shooter-to-chase acceleration, never a cut
const SHOT_TRACK_FOV = 50;     // shared approach endpoint + flight-start lens
const MUZZLE_FX_S = 0.2;       // keep the flash alive into the moving shot
const COLLISION_CONTACT_U = 0.66;
const SLOWMO_RATE = 0.25;      // terminal speed factor at the plate
const SLOWMO_START_M = 44;     // ramp begins this far from impact
const SLOWMO_FULL_M = 13;      // fully slow by here
const CONTACT_HOLD_S = 0.12;   // one readable armor-contact beat before impact
const EXIT_HOLD_MS = 430;      // letterbox close + fade-to-black duration
const KILLER_CARD_AT_S = 0.85; // killer card reveal into the x-ray hold
// killcam r2 — live-action destruction beats:
// WRECK: battle-deciding own death — hold on the real exploding wreck before
// the replay (covers fireball 1.1 s + the turret arc ~1.3 s).
// IMPACT: destruction re-fired at the tracer's arrival, measured in
// ANIMATION seconds (the fx clock dilates to IMPACT_SLOWMO through the
// launch window, so the wall window runs ~2.6-2.8 s).
// XRAY BUDGET: shotInfo's buffered battle report force-flushes at 16 s — the
// x-ray hold gives back whatever the live beats spent so the exit fade always
// lands first (floor 4 s keeps the analysis readable).
const WRECK_HOLD_S = 2.15;
const IMPACT_HOLD_S = 2.05;
const IMPACT_SLOWMO = 0.55;     // fx-clock rate through the turret launch
const IMPACT_DRIFT_RAD_S = 0.06; // impact-beat orbital drift (parallax)
const REPLAY_BUDGET_S = 15.0;   // begin() -> exit start, wall clock
// killcam r3 — OWN-DEATH FINALE (owner: "our tank blows up turret pops sure.
// but then it shows kill cam, and shows the tank as it was before it blew up
// with the turret still attached, then the skeleton with shell going through,
// and then us blowing up and turret coming off again"): when the PLAYER is
// the victim the destruction beat moves BEHIND the x-ray, so the replay reads
// restaged-intact approach -> skeleton -> blow up again. FINAL BLOW replays
// (we killed someone) keep the r2 order: impact, then analysis.
const FINALE_HOLD_S = 2.45;      // finale window in ANIM seconds (beat + settle)
const FINALE_RESERVE_S = 3.2;    // wall seconds reserved out of REPLAY_BUDGET_S
const FINALE_XRAY_FLOOR_S = 3.6; // x-ray floor while a finale still has to play
const TRAJ_KEEP = 32;          // shell traces retained (oldest evicted)
const TRAJ_MAX_PTS = 400 * 3;  // ≥ SHELL_MAX_LIFETIME_S at 60 Hz
const ORBIT_RAD_S = 0.05;      // x-ray camera drift
const VICTORY_WINDOW_S = 1.0;  // final blow must be this fresh at battle end

const KC_MODULE_ICON: Readonly<Record<string, string>> = Object.freeze({
  trackL: 'track', trackR: 'track', engine: 'engine', transmission: 'transmission',
  fuelTank: 'fuelTank', ammoRack: 'ammoRack', gun: 'gun', gunMount: 'gunMount',
  radio: 'radio', optics: 'optics', turretRing: 'turretRing', autoloader: 'autoloader',
  feedSystem: 'feedSystem', missileRack: 'missileRack',
});
const KC_CREW_ICON: Readonly<Record<string, string>> = Object.freeze({
  commander: 'crewCommander', gunner: 'crewGunner', driver: 'crewDriver', loader: 'crewLoader',
});
const KC_MODULE_LABELS = MODULE_LABEL as Readonly<Record<string, string>>;
const KC_CREW_LABELS = CREW_LABEL as Readonly<Record<string, string>>;

function killcamLabelIcon(key: string | null | undefined, fallback = 'penetration'): string {
  if (!key) return fallback;
  if (key.startsWith('m:')) return KC_MODULE_ICON[key.slice(2)] || 'repair';
  if (key.startsWith('c:')) return KC_CREW_ICON[key.slice(2)] || 'crew';
  return fallback;
}

const UP = new THREE.Vector3(0, 1, 0);

function wrapPi(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// module-scope scratch — no per-frame allocation
const _p = new THREE.Vector3();
const _d = new THREE.Vector3();
const _s = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _camLook = new THREE.Vector3();
const _proj = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _Y = new THREE.Vector3(0, 1, 0);
const FIRING_CAMERA_LIFTS = [0, 2.5, 5, 8, 12] as const;
const FIRING_CAMERA_SIDES = [1, -1] as const;
// scratch camera for the x-ray framing solve (fov/aspect set per solve)
const _fitCam = new THREE.PerspectiveCamera(42, 16 / 9, 0.5, 4000);

// MODULE_LABEL / CREW_LABEL come from ui/moduleRegistry.ts (single source).

// ---------------------------------------------------------------------------
// Shared x-ray material set (lazy singleton; depth-tested)
// ---------------------------------------------------------------------------
let S: SharedMaterials | null = null;
function sharedMats(): SharedMaterials {
  if (S) return S;
  const mesh = (color: THREE.ColorRepresentation, opacity: number, side: THREE.Side = THREE.FrontSide) => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: true, side, toneMapped: false, fog: false,
  });
  // NORMAL-blended variant for the penetration channel/spall/markers:
  // additive geometry over the frosted skin's bright regions sums toward
  // white and vanishes (r5 — the internal path was invisible exactly where
  // the story happens). Alpha-over REPLACES background color, so the hot
  // channel stays saturated over any skin density.
  const nmesh = (color: THREE.ColorRepresentation, opacity: number, side: THREE.Side = THREE.FrontSide) => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, blending: THREE.NormalBlending,
    depthWrite: false, depthTest: true, side, toneMapped: false, fog: false,
  });
  const line = (color: THREE.ColorRepresentation, opacity: number) => new THREE.LineBasicMaterial({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: true, toneMapped: false, fog: false,
  });
  // Lit NORMAL-blended material for the internal-component proxies: Lambert
  // shading gives the shapes 3D form, the emissive floor keeps them readable
  // inside the ghost hull. Additive blending is deliberately NOT used here —
  // stacked crew capsules / structure shells summed into featureless white
  // columns that buried the ammo cassettes and engine block (r3 critique);
  // alpha-over keeps each organ a distinct colored silhouette (WT-style),
  // whatever the view angle. Diffuse is still scaled down (sun ~4.5).
  const prox = (hex: THREE.ColorRepresentation, opacity: number, ds: number, es: number) => {
    const c = new THREE.Color(hex);
    return new THREE.MeshLambertMaterial({
      color: c.clone().multiplyScalar(ds),
      emissive: c.clone().multiplyScalar(es),
      transparent: true, opacity, blending: THREE.NormalBlending,
      depthWrite: false, depthTest: true, toneMapped: false, fog: false,
    });
  };
  // Ghost hull, War Thunder-class: a view-dependent fresnel skin (alpha rises
  // toward grazing angles → crisp luminous silhouette edges, translucent
  // face-on centers) composited with NORMAL blending. Alpha-over stacking
  // SATURATES toward the skin color — dense mesh regions read as denser
  // frost, never the additive white fog of r4 — and the material writes no
  // depth, so the post chain's GTAO (which samples the shared scene depth
  // buffer) never shades a phantom hull: an earlier depth-prepass variant
  // painted a dark AO-stippled tank silhouette through the skin (live Abrams
  // probe). Internals/boxes/path render AFTER the hull (pb.group renderOrder
  // 12 vs skin 11) so the organs stay crisp regardless of skin density —
  // same layering WT uses.
  const ghost = new THREE.MeshBasicMaterial({
    color: 0x9fd2f2, transparent: true, opacity: 1,
    blending: THREE.NormalBlending, depthWrite: false, depthTest: true,
    side: THREE.DoubleSide, toneMapped: false, fog: false,
  });
  // Soft radial glow texture (canvas-generated, fully procedural) for the
  // flight tracer: the r6 flight frame read as a bare white ball on an
  // orange stick — no bloom halo, no motion stretch. A sprite with this
  // gradient fakes a bloomed tracer core at any exposure without pushing
  // the HDR buffer over the bloom threshold (the r2 screen-wide-beam trap).
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = glowCanvas.height = 64;
  const gctx = glowCanvas.getContext('2d');
  if (!gctx) throw new Error('killcam glow canvas requires a 2D context');
  const grad = gctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0.0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.22, 'rgba(255,224,168,0.9)');
  grad.addColorStop(0.55, 'rgba(255,176,96,0.30)');
  grad.addColorStop(1.0, 'rgba(255,150,60,0)');
  gctx.fillStyle = grad;
  gctx.fillRect(0, 0, 64, 64);
  const glowTex = new THREE.CanvasTexture(glowCanvas);
  // Per-victim hull bounds for the depth-graded alpha below — beginXray()
  // writes these every x-ray (uniform VALUE objects shared by reference, so
  // the shader picks the write up whether it compiled before or after).
  const ghostCenter = { value: new THREE.Vector3(0, -1e6, 0) };
  const ghostRad = { value: 6 };
  // r8 per-band opacity shaping (critic: 'decapitated' ghosts + hot tracks).
  // World-space y of the victim's turret-ring plane and running-gear top
  // line, written per x-ray in beginXray(). Defaults are inert (no boost,
  // no dim) so the warmup rig and any pre-x-ray render stay unchanged.
  const ghostRingY = { value: 1e7 };
  const ghostGearY = { value: -1e7 };
  ghost.onBeforeCompile = (sh: THREE.WebGLProgramParametersWithUniforms) => {
    sh.uniforms.kcCenter = ghostCenter;
    sh.uniforms.kcRad = ghostRad;
    sh.uniforms.kcRingY = ghostRingY;
    sh.uniforms.kcGearY = ghostGearY;
    sh.vertexShader = `varying vec3 vKcW;\nvarying vec3 vKcN;\n${sh.vertexShader}`.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      #ifdef USE_INSTANCING
        vKcW = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
        vKcN = mat3(modelMatrix) * (mat3(instanceMatrix) * normal);
      #else
        vKcW = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vKcN = mat3(modelMatrix) * normal;
      #endif`);
    sh.fragmentShader =
      `varying vec3 vKcW;\nvarying vec3 vKcN;\nuniform vec3 kcCenter;\nuniform float kcRad;\nuniform float kcRingY;\nuniform float kcGearY;\n${sh.fragmentShader}`.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
      {
        vec3 kcV = normalize(cameraPosition - vKcW);
        // Degenerate-normal guard FIRST (r3): the performance-budget kit
        // merge ships GLB hull meshes WITHOUT a normal attribute (m1a2/t90m
        // audit: 4 merged meshes each) — the attribute defaults to (0,0,0),
        // normalize() NaNs, and NaN alpha painted the whole live-Abrams
        // ghost as a solid black silhouette. Zero-length normals fall back
        // to a soft face-on read instead of exploding.
        float kcNL = length(vKcN);
        vec3 kcN = kcNL > 1e-5 ? vKcN / kcNL : kcV;
        // clamped: |dot| of two unit vectors can exceed 1.0 by float error
        // (guaranteed when kcN == kcV), kcF goes -1e-7, and pow(negative,
        // 2.2) is NaN in GLSL — that NaN painted the merged kit meshes as
        // per-pixel black stipple
        float kcF = clamp(1.0 - abs(dot(kcN, kcV)), 0.0, 1.0);
        // Depth-graded fresnel (WT x-ray read): faces on the CAMERA side of
        // the hull sit dim, far-side faces brighten — the skin reads as a
        // volume with a lit back wall instead of a flat slab. kcT is the
        // fragment's normalized depth through the victim's bounding sphere.
        float kcNear = distance(cameraPosition, kcCenter) - kcRad;
        float kcT = clamp((distance(cameraPosition, vKcW) - kcNear)
          / max(kcRad * 2.0, 0.001), 0.0, 1.0);
        // r3 fidelity rework (the live GLB Abrams read as a near-turretless
        // slab): GLB victims are ONE smooth-normal mesh, so the old single
        // pow(kcF,2.6) term lit only a hair-thin band while every face-on
        // panel sat at the 0.06 floor — invisible over sunlit grass. The
        // multi-part procedural Tiger only read because 8-12 hull layers
        // alpha-stacked. Three terms make density mesh-count-INDEPENDENT:
        //   - plate shading: a top-lit structural tone (kcTop) so roof /
        //     side / glacis separate as distinct frost densities and the
        //     turret mass reads as a VOLUME, not a veil;
        //   - wide body fresnel (pow 2.2) for the soft WT frost falloff;
        //   - a TIGHT bright rim (pow 7) — the crisp luminous silhouette
        //     line WT draws around hull, turret and gun. Alpha carries the
        //     rim (NormalBlending saturates toward the skin color and can
        //     never bloom); rgb stays <=1.0 for the post chain.
        float kcRimW = pow(kcF, 2.2);
        float kcRimT = pow(kcF, 7.0);
        float kcTop = kcNL > 1e-5 ? clamp(kcN.y * 0.5 + 0.5, 0.0, 1.0) : 0.6;
        // r8 per-band shaping (critic: both the Tiger and the live Abrams
        // read as DECAPITATED hulls while the track runs burned hot cyan).
        // Density here is layer-count-driven: an 8-12 layer procedural hull
        // stack saturates while the 1-2 shell turret sits at the face-on
        // floor (~0.08 alpha) and vanishes over the dimmed backdrop; track
        // runs stack the MOST layers (links + wheels + band + skirt) and
        // blow out. Two world-y bands fix both ends without any per-mesh
        // naming assumptions: fragments above the victim's turret-ring
        // plane (kcRingY) get a flat opacity floor so a single-shell turret
        // matches hull density, and fragments below the running-gear top
        // line (kcGearY) are dimmed so stacked links stop reading as slabs.
        // beginXray() writes both planes from the SNAPSHOT armor spec.
        float kcTur = smoothstep(kcRingY - 0.25, kcRingY + 0.3, vKcW.y);
        float kcGear = 1.0 - smoothstep(kcGearY - 0.05, kcGearY + 0.28, vKcW.y);
        diffuseColor.a *= (0.075 + 0.235 * kcTur + 0.10 * kcTop + 0.16 * kcRimW + 0.52 * kcRimT)
          * mix(0.68, 1.22, kcT) * mix(1.0, 0.4, kcGear);
        diffuseColor.rgb *= 0.52 + 0.10 * kcTur + 0.13 * kcTop + 0.09 * kcRimW + 0.26 * kcRimT;
      }`);
  };
  S = {
    ghost, ghostCenter, ghostRad, ghostRingY, ghostGearY,
    // Trail intensity is deliberately sub-bloom: additive 1px line at full
    // 0xffb060 pushed the HDR buffer over the bloom threshold and smeared
    // into a screen-wide beam (r2 critique). Halved color × lower alpha keeps
    // the path readable without ever blooming.
    trail: line(0x7d5830, 0.5),
    // x-ray approach ribbon (glow sheath + hot core tubes over the final
    // trail arc): the bare 1px GL line read as a laser-pointer thread at
    // 1080p (r5 critique). Colors stay ≤1 so the ribbon never blooms.
    // r2: split into near/far tiers — the uniform 60 m beam read as a
    // pass-through laser with no directionality (r2 critique); the far tail
    // is thin and faint, ramping into the bright near segment at the plate.
    trailGlow: mesh(0xcf9a4e, 0.22),
    trailCore: mesh(0xffd9a0, 0.7),
    trailGlowFar: mesh(0xcf9a4e, 0.09),
    trailCoreFar: mesh(0xffd9a0, 0.3),
    // flight-phase tracer dressing: bloomed-looking halo sprite around the
    // core + a velocity-stretched glow cone trailing it (see begin())
    halo: new THREE.SpriteMaterial({
      map: glowTex, color: 0xffdfae, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      fog: false,
    }),
    tail: mesh(0xffa050, 0.17, THREE.DoubleSide),
    // Un-hit module outlines dropped to a whisper (0.15): the full-bright
    // white wireframe lattice on EVERY box competed with the shell path and
    // read as an engineering debug view (r6 critique). Bright outlines are
    // reserved for hit/destroyed modules and crew casualties.
    edgeDim: line(0x6db4e8, 0.15),
    edgeRed: line(0xff5a4a, 1.0),
    edgeYellow: line(0xffb43c, 1.0),
    edgeCrew: line(0xff7d8a, 1.0),
    // Front-side only, low alpha: DoubleSide box fills stacked front+back
    // faces into an opaque red curtain that hid the running gear (r2).
    fillRed: mesh(0xff2a1a, 0.14, THREE.FrontSide),
    fillYellow: mesh(0xff9a1c, 0.12, THREE.FrontSide),
    fillCrew: mesh(0xff3a55, 0.14, THREE.FrontSide),
    pathIn: nmesh(0xff4a20, 0.85),
    pathOut: mesh(0xffc27a, 0.6),
    pathCore: nmesh(0xffe9b8, 0.95),
    spall: nmesh(0xff8438, 0.16, THREE.DoubleSide),
    frag: nmesh(0xffb060, 0.55),
    // causal fragment tiers (r3): streaks from the pen point to each module /
    // crew slot the sim payload damaged — brightness follows the post-hit
    // state so a detonated rack reads hotter than a nicked engine.
    fragRed: nmesh(0xff5a40, 0.92),
    fragYellow: nmesh(0xffc46a, 0.7),
    fragCrew: nmesh(0xff8a96, 0.8),
    marker: nmesh(0xffffff, 0.95),
    core: mesh(0xfff3d0, 1.0),
    streak: mesh(0xffb464, 0.85),
    // Internal proxies, STATE-coded (r3 — WT convention: white intact,
    // yellow damaged, red destroyed). The r2 identity hues (brass ammo, teal
    // engine, amber fuel) read as damage states to genre-literate players —
    // an amber fuel cell implied a hit the sim never resolved. Identity now
    // lives in the shapes + label chips only.
    proxIntact: prox(0xd8e4ee, 0.78, 0.1, 0.3),
    // r8: steel accent darkened (0x9fb4c4/es .28 sat within ~15% of the
    // intact tint — fins/straps/fan alpha-mushed into the main mass and the
    // organs read as 'tan loaf-boxes and plain crates', critic) so the
    // mechanical detail separates as a distinct darker metal.
    proxSteel: prox(0x7e94a8, 0.74, 0.07, 0.17),
    proxGreen: prox(0x2fd98c, 0.8, 0.1, 0.34),
    proxYellow: prox(0xffb43c, 0.88, 0.12, 0.44),
    proxRed: prox(0xff4a38, 0.92, 0.13, 0.52),
    // neutral crew slump tint: a destroyed tank must not show a thriving
    // bright-green crew (r5 critique) — survivors of the final blow render
    // as soft steel-blue silhouettes (matching the module color language,
    // r6: opaque gray busts read as untextured mannequins), casualties keep
    // the red state tint. r2: 0.42 -> 0.58 opacity + brighter emissive —
    // grey figures vanished entirely over a dense (bright) skin stack on the
    // live Abrams death frame ("no crew figures render").
    proxGrey: prox(0x9fb8cc, 0.58, 0.06, 0.2),
  };
  // vertex-color fades (r5): the flight tail cone dies toward its far end and
  // the x-ray trail polyline fades where it enters frame — additive blending
  // multiplies by vertex color, so a black vertex is simply invisible.
  // Geometries without a color attribute read the WebGL default (0,0,0) and
  // render nothing, which only ever affects the off-screen warmup rig.
  S.tail.vertexColors = true;
  S.trail.vertexColors = true;
  return S;
}

/**
 * Proxy material for a module's POST-HIT state (r3 — WT color language:
 * white intact / yellow damaged / red destroyed). Identity comes from the
 * proxy shapes and the label chips, never from the tint — an amber "fuel
 * hue" on an untouched tank read as damage the sim never resolved.
 */
function proxMatForState(state: ModuleStateName): THREE.MeshLambertMaterial {
  const materials = sharedMats();
  return state === 'red' ? materials.proxRed
    : state === 'yellow' ? materials.proxYellow
      : materials.proxIntact;
}

// ---------------------------------------------------------------------------
// DOM overlay (letterbox + title + annotation block + projected labels)
// ---------------------------------------------------------------------------
const KC_CSS = `
.cot-kc{position:fixed;inset:0;z-index:60;pointer-events:none;display:none;isolation:isolate;
  --kc-panel:rgba(7,12,16,.95);--kc-panel-hi:rgba(17,25,31,.96);
  --kc-line:rgba(139,158,173,.3);--kc-line-soft:rgba(139,158,173,.16);
  --kc-muted:#8b9aa6;--kc-text:#e7eef4;--kc-amber:#f2a536;--kc-red:#f05b50;
  font-family:${FONT_STACK};color:var(--kc-text);}
.cot-kc.on{display:block;}
.cot-kc *{box-sizing:border-box;margin:0;padding:0;}
.cot-kc svg{display:block;flex:0 0 auto;}
/* REPLAY OWNS THE SCREEN (r4 critical): while a replay is live, no battle-HUD
   chrome may render over the cinematic — a one-frame race in the integration
   flyby edge-latch (main.ts snapshots kcActive at frame top, the death path
   begins the replay mid-frame, the stale latch then un-veiled the HUD for the
   whole replay: team panels/kill feed/minimap/reticle over flight AND x-ray,
   photographed 1-of-2 live runs). Declarative defense: begin() stamps
   body.cot-kc-live, finish() removes it — !important beats any inline
   veilHud(false) a later caller writes, so the chrome CANNOT come back while
   the replay is active whatever the caller ordering. .cot-hud contains every
   battle element incl. the damage panel + shot-info layer; .cot-si-stats is
   the battle report (already killcam:done-gated, veiled here for parity). */
/* Keep HUD geometry mounted while the replay owns the frame. Removing it
   with display:none made the replay entry/exit read as a viewport layout
   shift, especially when the spectator bar mounted at the black handoff. */
.cot-hud{transition:opacity var(--cot-motion-base) var(--cot-ease-out),visibility 0s linear 0s;}
body.cot-kc-live .cot-hud{opacity:0 !important;visibility:hidden !important;
  pointer-events:none !important;transition:opacity var(--cot-motion-base) var(--cot-ease-out),
    visibility 0s linear var(--cot-motion-base);}
body.cot-kc-live .cot-si-stats{visibility:hidden !important;}
/* X-RAY BACKDROP SCRIM (r4 major): the old veil was a pure edge vignette —
   0% dim at the victim — so sunlit grass behind the ghost stayed at full
   luminance and the fresnel skin washed out to a milky blob (staged Tiger
   evidence; the same treatment read fine over a dark dirt road). The veil now
   darkens the WHOLE frame (WT armor-viewer read) with the focus falloff kept:
   ~14% at the victim rising to ~52% at the frame edge, over a light-dim of
   the 3D scene itself (beginXray dims sun/hemi so terrain drops BEFORE the
   translucent skin blends over it — the unlit ghost material keeps its own
   brightness, making ghost contrast scene-luminance-INVARIANT). */
.cot-kc-veil{position:absolute;inset:0;opacity:0;
  transition:opacity var(--cot-motion-scene) var(--cot-ease-out);
  background:radial-gradient(ellipse 56% 50% at var(--kcvx,50%) var(--kcvy,55%),
    rgba(5,9,14,.14) 0%,rgba(5,9,14,.17) 26%,rgba(5,9,14,.28) 54%,
    rgba(5,9,14,.42) 78%,rgba(5,9,14,.52) 100%);}
.cot-kc.xr .cot-kc-veil{opacity:1;}
@keyframes cotKcIn{from{opacity:0;transform:translateY(4px);}to{opacity:1;transform:none;}}
.cot-kc-anim{opacity:0;animation:cotKcIn var(--cot-motion-slow) var(--cot-ease-out) forwards;}
line.cot-kc-anim{animation-name:cotKcInLine;}
@keyframes cotKcInLine{from{opacity:0;}to{opacity:.85;}}
.cot-kc-micro{position:absolute;z-index:8;display:flex;align-items:center;gap:5px;white-space:nowrap;
  background:linear-gradient(135deg,rgba(17,25,31,.92),rgba(6,10,14,.94));
  border:1px solid var(--kc-line);border-left:2px solid #86a9bf;color:#b8d3e4;padding:2px 6px 3px;
  font-family:${FONT_COND};font-weight:700;font-size:9px;
  letter-spacing:.14em;text-transform:uppercase;line-height:1.2;
  box-shadow:0 4px 12px rgba(0,0,0,.38);}
.cot-kc-bart,.cot-kc-barb{position:absolute;left:0;right:0;height:9vh;}
.cot-kc-bart{top:0;border-bottom:1px solid rgba(242,165,54,.18);
  background:repeating-linear-gradient(90deg,transparent 0 63px,rgba(139,158,173,.035) 64px),
    linear-gradient(180deg,rgba(1,4,6,.98),rgba(3,7,10,.78) 70%,transparent);}
.cot-kc-barb{bottom:0;border-top:1px solid rgba(242,165,54,.16);
  background:repeating-linear-gradient(90deg,transparent 0 63px,rgba(139,158,173,.03) 64px),
    linear-gradient(0deg,#010304 38%,rgba(3,7,10,.82) 68%,transparent);}
/* ENTRY / EXIT TRANSITIONS (killcam_endscreen r1): the replay never pops in a
   single frame. Entry: the letterbox bars SLIDE shut while title/annot/skip
   fade-slide in staggered behind them (.in); a shock flash (.cot-kc-flash)
   synced to the killing hit warms the frame briefly and decays. Exit:
   the chrome fades under a body-level fade-through-black
   (.cot-kc-fadeblk — appended to <body> so it outlives
   the root teardown happening BEHIND it, and z-80 so nothing pops over it).
   Staged harness frames (.now) hard-disable every timeline so captures stay
   deterministic. cancel() strips all of these classes — tested explicitly. */
.cot-kc .cot-kc-bart,.cot-kc .cot-kc-barb{
  transition:transform var(--cot-motion-scene) var(--cot-ease-drawer),
    opacity var(--cot-motion-base) var(--cot-ease-out);}
.cot-kc .cot-kc-bart{transform:translateY(-102%);}
.cot-kc .cot-kc-barb{transform:translateY(102%);}
.cot-kc.in .cot-kc-bart,.cot-kc.in .cot-kc-barb{transform:none;}
.cot-kc.out .cot-kc-bart,.cot-kc.out .cot-kc-barb{opacity:0;transform:none;}
.cot-kc .cot-kc-title{opacity:0;transform:translate(-50%,-8px);
  transition:opacity var(--cot-motion-slow) var(--cot-ease-out) var(--cot-motion-instant),
    transform var(--cot-motion-slow) var(--cot-ease-out) var(--cot-motion-instant);}
.cot-kc.in .cot-kc-title{opacity:1;transform:translate(-50%,0);}
.cot-kc .cot-kc-skip{opacity:0;
  transition:opacity var(--cot-motion-base) var(--cot-ease-out) var(--cot-motion-slow);}
.cot-kc.in .cot-kc-skip{opacity:1;}
.cot-kc .cot-kc-annot{
  transition:opacity var(--cot-motion-slow) var(--cot-ease-out) var(--cot-motion-fast),
    transform var(--cot-motion-slow) var(--cot-ease-out) var(--cot-motion-fast);
  opacity:0;transform:translateY(10px);}
.cot-kc.in .cot-kc-annot{opacity:1;transform:none;}
.cot-kc.out .cot-kc-title,.cot-kc.out .cot-kc-annot,.cot-kc.out .cot-kc-skip,
.cot-kc.out .cot-kc-killer,.cot-kc.out .cot-kc-label,.cot-kc.out .cot-kc-micro,
.cot-kc.out .cot-kc-dot,.cot-kc.out .cot-kc-dmg,.cot-kc.out .cot-kc-leader{
  opacity:0 !important;transition:opacity var(--cot-motion-fast) var(--cot-ease-out) !important;}
.cot-kc.now *{transition:none !important;animation:none !important;}
.cot-kc.now .cot-kc-title{opacity:1;transform:translate(-50%,0);}
.cot-kc.now .cot-kc-skip{opacity:1;}
.cot-kc.now .cot-kc-annot{opacity:1;transform:none;}
.cot-kc-flash{position:absolute;inset:0;
  background:radial-gradient(circle at 50% 52%,rgba(255,244,218,.78),rgba(242,165,54,.2) 34%,transparent 72%);
  opacity:0;pointer-events:none;}
.cot-kc-flash.go{animation:cotKcFlash var(--cot-motion-scene) var(--cot-ease-out) forwards;}
@keyframes cotKcFlash{0%{opacity:.62;}33%{opacity:.28;}100%{opacity:0;}}
/* DEATH-VIEW GRADE (killcam_endscreen r1): subtle desaturation + vignette
   ramp over the whole death replay — screen-space only (the post chain is
   not this module's), ramped by CSS opacity so cancel() cleanly restores. */
.cot-kc-grade{position:absolute;inset:0;pointer-events:none;opacity:0;
  transition:opacity var(--cot-motion-scene) var(--cot-ease-out);
  -webkit-backdrop-filter:saturate(.62) contrast(1.05);
  backdrop-filter:saturate(.62) contrast(1.05);
  background:radial-gradient(ellipse 80% 70% at 50% 50%,rgba(0,0,0,0) 50%,
    rgba(6,8,11,.34) 84%,rgba(4,6,9,.5) 100%);}
.cot-kc.grade .cot-kc-grade{opacity:1;}
.cot-kc-fadeblk{position:fixed;inset:0;z-index:80;background:#000;opacity:0;
  pointer-events:none;transition:opacity var(--cot-motion-slow) var(--cot-ease-out);}
.cot-kc-fadeblk.in{opacity:1;}
.cot-kc-fadeblk.lift{transition:opacity var(--cot-motion-base) var(--cot-ease-out);}
/* KILLER CARD (killcam_endscreen r1): who killed you — name, vehicle, shell,
   damage, distance — revealed during the x-ray hold in the Inter/amber HUD
   language. Right side; the armor annotation block owns the left. */
.cot-kc-killer{position:absolute;z-index:9;right:28px;bottom:11.5vh;width:282px;
  background:linear-gradient(145deg,var(--kc-panel-hi),var(--kc-panel) 62%,rgba(5,8,11,.97));
  border:1px solid var(--kc-line);border-right:3px solid var(--kc-red);
  box-shadow:0 16px 38px rgba(0,0,0,.58),inset 0 1px rgba(255,255,255,.035);
  padding:0 12px 10px;opacity:0;
  transform:translateY(10px);
  transition:opacity var(--cot-motion-slow) var(--cot-ease-out),
    transform var(--cot-motion-slow) var(--cot-ease-out);
  display:none;}
.cot-kc-killer.on{display:block;}
.cot-kc-killer.rv{opacity:1;transform:none;}
.cot-kc-killer .kk{display:flex;align-items:center;gap:7px;padding:8px 0 6px;
  border-bottom:1px solid var(--kc-line-soft);font-family:${FONT_COND};font-weight:800;font-size:8px;
  letter-spacing:.26em;color:#ff8d83;text-transform:uppercase;}
.cot-kc-killer .kk svg{color:var(--kc-red);filter:drop-shadow(0 0 5px rgba(240,91,80,.48));}
.cot-kc-killer .nm{margin-top:7px;font-weight:800;font-size:14.5px;
  letter-spacing:.01em;color:#f4f8fc;display:flex;align-items:center;gap:8px;}
.cot-kc-killer .nm .sil{width:50px;height:24px;flex:0 0 auto;padding:2px;
  background-repeat:no-repeat;background-position:center;background-size:contain;
  filter:drop-shadow(0 1px 2px rgba(0,0,0,.7));
  border:1px solid var(--kc-line-soft);background-color:rgba(139,158,173,.045);}
.cot-kc-killer .nm .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;
  white-space:nowrap;}
.cot-kc-killer .nm .t i{display:block;font-style:normal;font-family:${FONT_COND};
  font-weight:700;font-size:9px;letter-spacing:.16em;color:#9fb0bf;
  text-transform:uppercase;margin-top:1px;}
.cot-kc-killer .rows{margin-top:7px;display:grid;grid-template-columns:1fr 1fr;
  gap:3px 12px;border-top:1px solid var(--kc-line-soft);padding-top:6px;}
.cot-kc-killer .kv{display:flex;justify-content:space-between;font-size:10.5px;
  color:var(--kc-muted);font-variant-numeric:tabular-nums;letter-spacing:.03em;}
.cot-kc-killer .kv>span,.cot-kc-kv>span{display:flex;align-items:center;gap:5px;}
.cot-kc-killer .kv>span svg,.cot-kc-kv>span svg{color:#71818d;}
.cot-kc-killer .kv b{color:#ffd9a0;font-weight:700;font-family:${FONT_COND};
  letter-spacing:-.01em;}
.cot-kc-killer .kv.dmg b{color:#ffd166;font-size:12px;}
.cot-kc-killer .kv.w{grid-column:1/-1;}
.cot-kc-title{position:absolute;z-index:10;top:1.3vh;left:50%;min-width:330px;
  transform:translateX(-50%);text-align:center;padding:7px 28px 8px;
  background:linear-gradient(90deg,transparent,rgba(6,11,15,.88) 18%,rgba(12,18,23,.94) 50%,rgba(6,11,15,.88) 82%,transparent);
  border-bottom:1px solid rgba(242,165,54,.28);}
.cot-kc-title::before,.cot-kc-title::after{content:"";position:absolute;bottom:-1px;width:48px;height:1px;
  background:var(--kc-amber);opacity:.78;}
.cot-kc-title::before{left:16px;}.cot-kc-title::after{right:16px;}
.cot-kc-title .tl{display:flex;align-items:center;justify-content:center;gap:8px;}
.cot-kc-title .tl svg{color:var(--kc-amber);filter:drop-shadow(0 0 7px rgba(242,165,54,.26));}
.cot-kc-title .t{font-family:${FONT_COND};font-weight:800;
  font-size:15px;letter-spacing:.42em;color:#ffd59b;text-shadow:0 1px 10px rgba(0,0,0,.9);}
.cot-kc-title .s{font-family:${FONT_COND};font-size:9.5px;font-weight:700;
  letter-spacing:.16em;color:#9fadb8;margin-top:3px;text-transform:uppercase;
  font-variant-numeric:tabular-nums;}
.cot-kc-skip{position:absolute;z-index:10;bottom:1.4vh;right:28px;display:flex;align-items:center;
  gap:8px;font-family:${FONT_COND};font-weight:700;font-size:8px;letter-spacing:.18em;
  color:#83919c;text-transform:uppercase;}
.cot-kc-skip .ico{color:#a7b3bd;}
.cot-kc-skip kbd{min-width:58px;padding:3px 6px 4px;border:1px solid var(--kc-line);
  border-bottom-color:rgba(242,165,54,.5);background:rgba(13,20,25,.85);color:#c9d3db;
  font:800 8px/1 ${FONT_COND};letter-spacing:.13em;text-align:center;}
.cot-kc-annot{position:absolute;z-index:9;left:28px;bottom:11.5vh;width:300px;
  background:linear-gradient(145deg,var(--kc-panel-hi),var(--kc-panel) 62%,rgba(5,8,11,.97));
  border:1px solid var(--kc-line);border-left:3px solid var(--kc-amber);
  box-shadow:0 16px 38px rgba(0,0,0,.58),inset 0 1px rgba(255,255,255,.035);padding:0 0 9px;}
.cot-kc-annot .hd{padding:7px 11px 6px;border-bottom:1px solid var(--kc-line-soft);}
.cot-kc-annot .hd .m{display:flex;align-items:center;gap:6px;margin-bottom:3px;
  font-family:${FONT_COND};font-size:7px;font-weight:800;letter-spacing:.2em;color:#8796a1;text-transform:uppercase;}
.cot-kc-annot .hd .m svg{color:var(--kc-amber);}
.cot-kc-annot .shellrow{display:flex;align-items:center;gap:7px;}
.cot-kc-annot .shellrow>svg{color:#ffd49a;}
.cot-kc-annot .hd .k{font-family:${FONT_COND};font-weight:800;
  font-size:12.5px;letter-spacing:.08em;color:#ffd49a;}
.cot-kc-annot .hd .w{font-size:9.5px;color:#bcc8d1;margin-top:2px;letter-spacing:.03em;}
.cot-kc-rows{padding:6px 11px 0;display:grid;grid-template-columns:1fr 1fr;gap:3px 13px;}
.cot-kc-kv{display:flex;justify-content:space-between;gap:8px;font-size:10px;color:var(--kc-muted);
  font-variant-numeric:tabular-nums;letter-spacing:.03em;}
.cot-kc-kv b{color:#e4edf4;font-weight:700;font-family:${FONT_COND};letter-spacing:-.01em;}
/* r8: the pen row spans the card on ONE line (it wrapped into a mangled
   two-line label/value jumble); the ERA/screens qualifier is a suffix chip
   and a dim caption legends the number format once. */
.cot-kc-kv.w{grid-column:1/-1;}
.cot-kc-kv.pen b{white-space:nowrap;}
.cot-kc-kv b .q{display:inline-block;margin-left:6px;padding:0 3px 1px;
  border:1px solid currentColor;font-size:8px;letter-spacing:.12em;
  vertical-align:1.5px;line-height:1.25;font-weight:800;}
.cot-kc-pencap{grid-column:1/-1;font-size:8.5px;color:#5f6d7a;letter-spacing:.05em;
  text-align:right;margin-top:-2px;}
.cot-kc-banner{margin:7px 11px 0;padding:4px 8px;text-align:center;display:none;
  font-family:${FONT_COND};font-weight:800;font-size:11px;
  letter-spacing:.18em;color:#ff8a7d;border:1px solid rgba(240,91,80,.55);
  border-left:3px solid var(--kc-red);background:linear-gradient(90deg,rgba(111,24,18,.42),rgba(62,15,12,.26));}
.cot-kc-banner.on{display:flex;align-items:center;justify-content:center;gap:7px;}
.cot-kc-labelhost{position:absolute;z-index:8;inset:0;overflow:hidden;}
.cot-kc-label{position:absolute;white-space:nowrap;display:flex;align-items:center;gap:7px;
  background:linear-gradient(135deg,rgba(18,26,32,.94),rgba(5,9,12,.96));
  border:1px solid var(--kc-line);border-left:2px solid currentColor;padding:4px 8px 5px;
  font-family:${FONT_COND};font-weight:800;font-size:11.5px;
  letter-spacing:.09em;text-transform:uppercase;line-height:1.25;
  box-shadow:0 7px 18px rgba(0,0,0,.5),inset 0 1px rgba(255,255,255,.025);}
.cot-kc-label .ico,.cot-kc-micro .ico{display:flex;align-items:center;color:currentColor;}
.cot-kc-label .copy{display:block;min-width:0;}
.cot-kc-label .main{display:block;}
.cot-kc-label .s{display:block;font-size:9.5px;font-weight:700;letter-spacing:.06em;
  color:#e8f0f6;font-variant-numeric:tabular-nums;}
.cot-kc-label.ok{color:#8a97a3;border-color:var(--kc-line);border-left-color:currentColor;
  background:linear-gradient(135deg,rgba(16,22,27,.82),rgba(5,8,11,.86));
  box-shadow:0 4px 12px rgba(0,0,0,.34);font-weight:700;}
.cot-kc-label.ok .s{color:#7d8a96;font-weight:600;}
/* r8 near-miss tier (critic: the gray chip language read as a damaged-module
   callout): dashed border, smaller caps, one line, no leader dot — sits ON
   its organ like the micro identity tags, so it can never straddle the hull
   silhouette edge. Informational, never a casualty. */
.cot-kc-label.nm{color:#9fb0bf;border:1px dashed rgba(150,166,180,.48);border-left:2px solid #758896;
  background:rgba(7,12,16,.82);box-shadow:0 4px 12px rgba(0,0,0,.3);font-weight:700;font-size:9.5px;
  letter-spacing:.11em;padding:2px 6px 3px;opacity:.85;}
.cot-kc-label.nm .copy{display:flex;align-items:center;}
.cot-kc-label.nm .s{display:inline;font-size:9.5px;font-weight:600;color:#788695;}
.cot-kc-dot{position:absolute;z-index:8;width:8px;height:8px;border-radius:1px;
  transform:translate(-50%,-50%) rotate(45deg);background:currentColor;box-shadow:0 0 10px currentColor;}
.cot-kc-dot.ok{background:rgba(7,12,16,.8);border:1.5px solid currentColor;box-shadow:none;}
.cot-kc-dmg{position:absolute;z-index:8;display:flex;align-items:center;gap:7px;font-family:${FONT_COND};
  font-weight:800;font-size:25px;color:#ffd166;
  letter-spacing:.045em;text-shadow:0 2px 12px rgba(0,0,0,.9);font-variant-numeric:tabular-nums;
  background:linear-gradient(135deg,rgba(22,27,28,.96),rgba(7,11,14,.96));
  border:1px solid var(--kc-line);border-right:3px solid var(--kc-amber);
  box-shadow:0 9px 22px rgba(0,0,0,.52);padding:10px 10px 5px;line-height:1.1;}
.cot-kc-dmg::before{content:"DAMAGE";position:absolute;top:3px;right:9px;font:800 6.5px/1 ${FONT_COND};
  letter-spacing:.2em;color:#8f9ca6;text-align:right;}
.cot-kc-dmg .ico{color:var(--kc-amber);}
.cot-kc-leader{position:absolute;z-index:7;inset:0;width:100%;height:100%;overflow:visible;}
.cot-kc-flash{z-index:12;}
@media (prefers-reduced-motion:reduce){
  .cot-kc .cot-kc-bart,.cot-kc .cot-kc-barb{transform:none!important;}
  .cot-kc .cot-kc-title{transform:translate(-50%,0)!important;}
  .cot-kc .cot-kc-annot,.cot-kc .cot-kc-killer{transform:none!important;}
  .cot-kc .cot-kc-anim{animation:none!important;opacity:1;}
  .cot-kc-flash.go{animation:none!important;opacity:.12;}
}
`;

/** Cylinder mesh between two points (local space of `parent`). */
function tube(
  a: THREE.Vector3,
  b: THREE.Vector3,
  radius: number,
  mat: THREE.Material,
  parent: THREE.Object3D,
  disposables: Disposable[],
): THREE.Mesh | null {
  _s.copy(b).sub(a);
  const len = _s.length();
  if (len < 1e-4) return null;
  const geo = new THREE.CylinderGeometry(radius, radius, len, 6, 1, true);
  disposables.push(geo);
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(a).addScaledVector(_s, 0.5);
  m.quaternion.setFromUnitVectors(_Y, _s.multiplyScalar(1 / len));
  parent.add(m);
  return m;
}

/**
 * Create the kill-cam controller.
 * @param {{scene:THREE.Scene, camera:THREE.PerspectiveCamera,
 *   rig:{setExternalPose:Function}, heightField:{getHeightAt:Function},
 *   getPlayer:() => ?object, getGame?:() => ?object,
 *   getEntity?:(id:string) => ?object}} deps injected by integration (main.ts)
 * @returns {object} killcam API
 */
export function createKillCam(deps: KillcamDeps) {
  const { scene, camera, rig, heightField, getPlayer } = deps;
  const S = sharedMats();
  const getGame = deps.getGame
    || (() => debugSurface()?.game || null);
  const getEntity = deps.getEntity
    || ((id: string) => debugSurface()?.game?.tankById.get(id) || null);
  // World access for the flight LOS solve (r6 major): terrain/prop raycast +
  // the vegetation concealment discs the spotting sim itself uses. Prefer an
  // injected getter (docs/GUNNERY-CAMERA-SPEC.md wires main.ts to
  // pass `getWorld: () => world`); fall back to the debug handle so the fix
  // is live before the integration dep lands. Resolved lazily per replay —
  // the world object is REPLACED on every map switch.
  const getWorld = deps.getWorld
    || (() => debugSurface()?.world || null);
  // FX system access (killcam r2): the IMPACT beat re-fires the real
  // destruction sequence (fx.destruction — fireball, debris, smoke column)
  // on the restaged victim. Injected by main.ts (getFx); the debug handle is
  // the pre-integration fallback, and a missing fx system only mutes the
  // particle side of the beat (the turret pop still plays off the visual).
  const getFx = deps.getFx
    || (() => debugSurface()?.fx || null);

  // ---- LIGHT-COUNT / PROGRAM STABILITY --------------------------------------
  // three.js recompiles EVERY lit material program when the renderer's light
  // count changes, and compiles brand-new material programs on first render.
  // The r6 replay added point lights at begin()/beginXray() and hid the fx
  // group (whose 2 pooled lights left the count) — a live probe measured a
  // 6.3 s stall between begin() and the first painted kill-cam frame, pure
  // shader recompile. Fix, following the effects.ts "dynamic light budget"
  // pattern: a PERMANENT pool of 3 point lights added once at creation
  // (before the first frame ever renders, so the count never changes), plus
  // a one-shot warmup rig that renders every kill-cam material for a few
  // seconds of the first battle so playback always hits the program cache.
  const kcLights: THREE.PointLight[] = [];
  for (let i = 0; i < 3; i++) {
    const L = new THREE.PointLight(0xffffff, 0, 10, 2);
    L.castShadow = false;
    L.name = `killcamLight${i}`;
    L.position.set(0, -80, 0);
    scene.add(L);
    kcLights.push(L);
  }
  let warmRig: THREE.Group | null = null;
  let warmSteps = 0;
  function buildWarmRig() {
    const materials = sharedMats();
    const g = new THREE.Group();
    g.name = 'killcamWarmup';
    g.position.set(0, -80, 0);
    const box = new THREE.BoxGeometry(0.01, 0.01, 0.01);
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position',
      new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0.01, 0, 0]), 3));
    g.userData.disposables = [box, lineGeo];
    const meshMats = [materials.trailGlow, materials.trailCore, materials.trailGlowFar, materials.trailCoreFar,
      materials.core, materials.streak, materials.tail,
      materials.ghost, materials.pathIn, materials.pathOut, materials.pathCore, materials.spall, materials.frag, materials.fragRed,
      materials.fragYellow, materials.fragCrew, materials.marker,
      materials.fillRed, materials.fillYellow, materials.fillCrew, materials.proxIntact,
      materials.proxSteel, materials.proxGreen, materials.proxYellow,
      materials.proxRed, materials.proxGrey];
    for (const m of meshMats) g.add(new THREE.Mesh(box, m));
    // instanced Lambert variant (ammo cassettes) compiles a separate program
    for (const m of [materials.proxIntact, materials.proxYellow, materials.proxRed]) {
      const im = new THREE.InstancedMesh(box, m, 1);
      im.setMatrixAt(0, new THREE.Matrix4());
      g.add(im);
    }
    for (const m of [materials.trail, materials.edgeDim, materials.edgeRed, materials.edgeYellow, materials.edgeCrew]) {
      g.add(new THREE.Line(lineGeo, m));
    }
    g.add(new THREE.Sprite(materials.halo));
    // must actually RENDER to compile — frustum-culled objects compile nothing
    g.traverse((o) => { o.frustumCulled = false; });
    return g;
  }
  warmRig = buildWarmRig();
  scene.add(warmRig);

  // ---- capture state ----
  let busRef: EventBus | null = null;      // bound in bindBus — replay lifecycle announcements
  const traj = new Map<number, TrajectoryRecord>(); // shellId -> { pts:number[], muzzle:[3] }
  const poseHistory = new Map<string, EntityFrame>(); // entity id -> prior fixed-step presentation state
  let pendingDeath: ReplaySnapshot | null = null;    // lethal shell snapshot, target = player
  let pendingVictory: ReplaySnapshot | null = null;  // lethal shell snapshot, attacker = player
  let lastHitOnPlayer: ReplaySnapshot | null = null; // fallback for fire deaths (x-ray only)

  // ---- playback state ----
  let active = false;
  let staged = false;
  // Runtime guards (`active`, `isActive`, and every public entry point) still
  // treat this as nullable. The definite slot keeps the deeply nested phase
  // helpers typed against one bundle after `begin()` establishes ownership.
  let pb: PlaybackBundle = null!; // playback bundle
  let dom: KillcamDom | null = null;
  let lastBeginWallMs = 0; // onset instrumentation (dead-air audit, r6)

  function copyModules(ent: KillcamEntity | null): ModuleStates | null {
    if (!ent?.combat?.modules) return null;
    const states: ModuleStates = {};
    for (const [key, value] of Object.entries(ent.combat.modules)) {
      if (value) states[key] = value.state;
    }
    return states;
  }

  function captureEntityFrame(ent: KillcamEntity | null): EntityFrame | null {
    if (!ent || !ent.state) return null;
    return {
      pose: captureReplayPose(ent.state),
      crewAlive: ent.combat && ent.combat.crew ? { ...ent.combat.crew } : null,
      moduleStates: copyModules(ent),
      eraSpent: ent.combat && ent.combat.eraSpent ? [...ent.combat.eraSpent] : [],
      destroyed: !!(ent.combat && ent.combat.destroyed),
    };
  }

  function clonePose(pose: ReplayPose | null | undefined): ReplayPose | null {
    return pose ? { ...pose, pos: cloneVec3Tuple(pose.pos) } : null;
  }

  function ensureDom(): KillcamDom {
    if (dom) return dom;
    ensureFonts();
    ensureStyle('cot-kc-style', KC_CSS);
    const root = el('div', 'cot-kc');
    document.body.appendChild(root);
    el('div', 'cot-kc-grade', root); // death-view desat + vignette (class 'grade')
    el('div', 'cot-kc-veil', root); // x-ray backdrop dim (class 'xr' on root)
    el('div', 'cot-kc-bart', root);
    el('div', 'cot-kc-barb', root);
    const title = el('div', 'cot-kc-title', root);
    const titleLine = el('div', 'tl', title);
    const titleIcon = el('span', 'ico', titleLine);
    titleIcon.innerHTML = uiIconSVG('autoAim', 13);
    const titleT = el('div', 't', titleLine);
    const titleS = el('div', 's', title);
    const skip = el('div', 'cot-kc-skip', root);
    const skipIcon = el('span', 'ico', skip);
    skipIcon.innerHTML = uiIconSVG('chevronRight', 10);
    const skipKey = el('kbd', '', skip);
    skipKey.textContent = t('killcam.anyKey');
    const skipText = el('span', '', skip);
    skipText.textContent = t('killcam.skipReplay');
    const annot = el('div', 'cot-kc-annot', root);
    const hd = el('div', 'hd', annot);
    const hdMeta = el('div', 'm', hd);
    hdMeta.innerHTML = `${uiIconSVG('battleRecord', 10)}<span>${t('killcam.ballisticAnalysis')}</span>`;
    const shellRow = el('div', 'shellrow', hd);
    const shellIcon = el('span', 'ico', shellRow);
    shellIcon.innerHTML = uiIconSVG('shell', 12);
    const hdK = el('div', 'k', shellRow);
    const hdW = el('div', 'w', hd);
    const rows = el('div', 'cot-kc-rows', annot);
    const banner = el('div', 'cot-kc-banner', annot);
    banner.innerHTML = `${uiIconSVG('ammoRack', 11)}<span>${t('killcam.ammoRackDetonation')}</span>`;
    // killer card (death view only — populated per replay in beginXray)
    const killer = el('div', 'cot-kc-killer', root);
    killer.innerHTML = `<div class="kk">${uiIconSVG('skull', 10)}<span>${t('killcam.destroyedByHeading')}</span></div>` +
      '<div class="nm"><span class="sil"></span><span class="t"><span class="n"></span><i class="v"></i></span></div>' +
      '<div class="rows"></div>';
    const sil = killer.querySelector<HTMLElement>('.sil');
    const killerName = killer.querySelector<HTMLElement>('.n');
    const killerVehicle = killer.querySelector<HTMLElement>('.v');
    const killerRows = killer.querySelector<HTMLElement>('.rows');
    if (!sil || !killerName || !killerVehicle || !killerRows) {
      throw new Error('killcam killer card markup is incomplete');
    }
    const killerRefs = {
      root: killer,
      sil,
      name: killerName,
      veh: killerVehicle,
      rows: killerRows,
    };
    // shock flash last — it must paint over every overlay child
    const flash = el('div', 'cot-kc-flash', root);
    // leader-line layer sits under the label chips
    const leader = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    leader.setAttribute('class', 'cot-kc-leader');
    root.appendChild(leader);
    const labelHost = el('div', 'cot-kc-labelhost', root);
    dom = {
      root, title, titleT, titleS, skip, hdMeta, hdK, hdW, rows, banner, annot,
      labelHost, leader, flash, killer: killerRefs,
    };
    return dom;
  }

  // body-level fade-through-black for the exit transition — appended lazily,
  // torn down by clearExit()/cancel() so a mid-transition cancel can never
  // strand a black frame over the game.
  let fadeEl: HTMLDivElement | null = null;
  let exitTimers: Array<ReturnType<typeof setTimeout>> = [];
  function ensureFade(): HTMLDivElement {
    if (!fadeEl) {
      fadeEl = el('div', 'cot-kc-fadeblk');
      document.body.appendChild(fadeEl);
    }
    return fadeEl;
  }
  function clearExit() {
    for (const t of exitTimers) clearTimeout(t);
    exitTimers.length = 0;
    if (fadeEl) { fadeEl.remove(); fadeEl = null; }
  }

  function resetDomPresentation() {
    if (dom) {
      dom.root.classList.remove('on', 'xr', 'in', 'out', 'grade', 'now');
      dom.flash.classList.remove('go');
      dom.killer.root.classList.remove('on', 'rv');
      dom.labelHost.textContent = '';
      dom.leader.textContent = '';
    }
    document.body.classList.remove('cot-kc-live');
  }

  // -------------------------------------------------------------------------
  // Capture
  // -------------------------------------------------------------------------

  function combatFrameSnapshot(
    current: EntityFrame | null,
    before: EntityFrame | null,
  ): CombatFrameSnapshot {
    return {
      crewAlive: current?.crewAlive ?? null,
      moduleStates: current?.moduleStates ?? null,
      eraSpent: current?.eraSpent ?? [],
      preCrewAlive: before?.crewAlive ?? null,
      preModuleStates: before?.moduleStates ?? null,
      preEraSpent: before?.eraSpent ?? [],
    };
  }

  function collisionHitEvent(
    ev: KillcamHitEvent,
    target: KillcamEntity,
    attacker: KillcamEntity,
    targetModulesHit: readonly ModuleHit[],
  ): KillcamHitEvent {
    return {
      ...ev,
      zone: ev.zone || undefined,
      kind: 'collision',
      cause: 'ram',
      shellId: null,
      attackerId: attacker.id,
      attackerName: attacker.spec.name,
      attackerSpecId: attacker.specId,
      targetId: target.id,
      targetName: target.spec.name,
      targetSpecId: target.specId,
      targetMaxHp: target.combat?.maxHp ?? 0,
      pos: cloneVec3Tuple(ev.pos),
      normal: cloneVec3Tuple(ev.normal),
      localPos: null,
      localDir: null,
      crewHit: [],
      modulesHit: targetModulesHit.map((module) => ({ ...module })),
      damage: target.id === ev.aId ? ev.dmgA : ev.dmgB,
      destroyed: true,
      ammoRacked: false,
      flightDistM: 0,
    };
  }

  function collisionAttackerSnapshot(
    ev: KillcamHitEvent,
    attacker: KillcamEntity,
    before: EntityFrame | null,
    current: EntityFrame | null,
  ): CollisionAttackerSnapshot {
    const modulesHit = attacker.id === ev.aId ? ev.aModulesHit : ev.bModulesHit;
    return {
      attackerPose: clonePose(before?.pose),
      attackerImpactPose: clonePose(current?.pose),
      attackerPreModuleStates: before?.moduleStates ?? null,
      attackerPreEraSpent: before?.eraSpent ?? [],
      attackerPreDestroyed: !!before?.destroyed,
      attackerModuleStates: current?.moduleStates ?? null,
      attackerEraSpent: current?.eraSpent ?? [],
      attackerModulesHit: (modulesHit || []).map((module) => ({ ...module })),
    };
  }

  function projectileHitEvent(ev: KillcamHitEvent): KillcamHitEvent {
    return {
      ...ev,
      zone: ev.zone || undefined,
      pos: cloneVec3Tuple(ev.pos),
      normal: ev.normal ? cloneVec3Tuple(ev.normal) : [0, 1, 0],
      modulesHit: (ev.modulesHit || []).map((module) => ({ ...module })),
      crewHit: (ev.crewHit || []).slice(),
      localPos: ev.localPos ? cloneVec3Tuple(ev.localPos) : null,
      localDir: ev.localDir ? cloneVec3Tuple(ev.localDir) : null,
    };
  }

  function projectileTrajectoryPoints(
    record: TrajectoryRecord | undefined,
    impactPosition: Vec3Tuple,
  ): number[] | null {
    if (!record || record.pts.length < 3) return null;
    const points = record.pts.slice();
    points.push(impactPosition[0], impactPosition[1], impactPosition[2]);
    return points;
  }

  function projectileAttackerSnapshot(
    record: TrajectoryRecord | undefined,
    ev: KillcamHitEvent,
  ): ProjectileAttackerSnapshot {
    return {
      attackerEnt: record?.attackerEnt ?? null,
      attackerPose: record ? clonePose(record.attackerPose) : null,
      muzzle: record ? cloneVec3Tuple(record.muzzle) : null,
      shotDir: record ? cloneVec3Tuple(record.dir) : null,
      muzzleVelocityMps: record?.velocityMps ?? 0,
      firedTimeS: record?.timeS ?? 0,
      caliberMm: record?.caliberMm ?? ev.caliberMm ?? 100,
      weaponSound: record?.weaponSound ?? null,
      muzzleIndex: record?.muzzleIndex ?? -1,
      recoilScale: record?.recoilScale ?? 1,
      attackerPreModuleStates: record?.moduleStates ?? null,
      attackerPreEraSpent: record?.eraSpent ?? [],
    };
  }

  /** Deep-enough snapshot of a resolved HitEvent + victim pose. */
  function makeSnapshot(ev: KillcamHitEvent, target: KillcamEntity): ReplaySnapshot {
    const rec = ev.shellId === null ? undefined : traj.get(ev.shellId);
    const now = captureEntityFrame(target);
    const before = poseHistory.get(target.id) || now;
    return {
      replayKind: 'projectile',
      ev: projectileHitEvent(ev),
      timeS: ev.timeS || 0,
      trajPts: projectileTrajectoryPoints(rec, ev.pos),
      // post-hit crew roster ({name:alive} from the sim's combat state, taken
      // AFTER damage resolved): the x-ray colors casualties from EARLIER hits
      // red too, not just the ones this shell caused.
      ...combatFrameSnapshot(now, before),
      // Post-hit module states + spent ERA tiles come from the captured frame
      // above so pre-wreck restaging never under-reports resolved damage.
      pose: clonePose(before && before.pose)!,
      impactPose: clonePose(now && now.pose),
      // The killer is a live scene tank, so playback must restage its exact
      // shot-time hull/turret/gun pose too. Without this the frozen visual
      // showed whatever direction the AI turned after firing.
      ...projectileAttackerSnapshot(rec, ev),
      targetEnt: target,
      armor: target.spec.armor,
      heightM: target.spec.dims.heightM,
      boundingRadiusM: target.spec.armor.boundingRadiusM,
    };
  }

  function makeCollisionSnapshot(
    ev: KillcamHitEvent,
    target: KillcamEntity,
    attacker: KillcamEntity,
    targetModulesHit: ModuleHit[],
  ): ReplaySnapshot {
    const targetNow = captureEntityFrame(target);
    const attackerNow = captureEntityFrame(attacker);
    const targetBefore = poseHistory.get(target.id) || targetNow;
    const attackerBefore = poseHistory.get(attacker.id) || attackerNow;
    return {
      replayKind: 'collision',
      ev: collisionHitEvent(ev, target, attacker, targetModulesHit),
      timeS: ev.timeS || 0,
      trajPts: null,
      ...combatFrameSnapshot(targetNow, targetBefore),
      pose: clonePose(targetNow && targetNow.pose)!,
      prePose: clonePose(targetBefore && targetBefore.pose),
      impactPose: clonePose(targetNow && targetNow.pose),
      attackerEnt: attacker,
      ...collisionAttackerSnapshot(ev, attacker, attackerBefore, attackerNow),
      muzzle: null, shotDir: null, muzzleVelocityMps: 0, firedTimeS: 0,
      caliberMm: 0, weaponSound: null, muzzleIndex: -1, recoilScale: 1,
      targetEnt: target,
      armor: target.spec.armor,
      heightM: target.spec.dims.heightM,
      boundingRadiusM: target.spec.armor.boundingRadiusM,
    };
  }

  const api = {
    /**
     * Subscribe to capture-side bus events (shell muzzles, cleanup).
     * @param {{on:Function}} bus the game event bus
     */
    bindBus(bus: EventBus) {
      busRef = bus;
      bus.on('shell:fired', (payload) => {
        const p = payload as ShellFiredPayload;
        if (traj.size >= TRAJ_KEEP) {
          const oldest = traj.keys().next().value;
          if (oldest !== undefined) traj.delete(oldest);
        }
        const attackerEnt = getEntity ? getEntity(p.shooterId) : null;
        const attackerPose = attackerEnt && attackerEnt.state
          ? alignReplayPoseToShot(captureReplayPose(attackerEnt.state), p.dir, attackerEnt.spec)
          : null;
        traj.set(p.shellId, {
          pts: [p.muzzlePos[0], p.muzzlePos[1], p.muzzlePos[2]],
          muzzle: cloneVec3Tuple(p.muzzlePos),
          dir: cloneVec3Tuple(p.dir),
          velocityMps: Number(p.velocityMps) || 0,
          timeS: Number(p.timeS) || 0,
          attackerEnt,
          attackerPose,
          moduleStates: copyModules(attackerEnt),
          eraSpent: attackerEnt && attackerEnt.combat && attackerEnt.combat.eraSpent
            ? [...attackerEnt.combat.eraSpent] : [],
          caliberMm: Number(p.caliberMm) || 100,
          weaponSound: p.weaponSound || null,
          muzzleIndex: Number.isFinite(p.muzzleIndex) ? Number(p.muzzleIndex) : -1,
          recoilScale: Number.isFinite(p.recoilScale) ? Number(p.recoilScale) : 1,
        });
      });
      bus.on('shell:expired', (payload) => {
        const p = payload as { shellId: number };
        traj.delete(p.shellId);
      });
      bus.on('ui:battleStart', () => {
        traj.clear();
        poseHistory.clear();
        pendingDeath = pendingVictory = lastHitOnPlayer = null;
        api.cancel();
        spectate.stop(false); // fresh battle never inherits an ally chase
      });
      // SPECTATE lifecycle: the chase ends the moment the battle is decided
      // (the end flow takes the camera) or the phase leaves battle (garage).
      bus.on('battle:ended', () => spectate.stop(true));
      // Pointer/touch controls in the HUD use the same controller as A/D and
      // arrow keys, so the on-screen keycaps are real controls instead of
      // decorative hints. cycle() is a no-op outside spectator mode.
      bus.on('spectate:cycle', (payload) => {
        const p = payload as { direction?: number } | null;
        spectate.cycle(p?.direction !== undefined && p.direction < 0 ? -1 : 1);
      });
      bus.on('phase:change', (payload) => {
        const p = payload as { phase?: string } | null;
        if (!p || p.phase !== 'battle') {
          spectate.stop(true);
          api.cancel();
          return;
        }
        // killcam r2: entering battle clears stale lethal chains through
        // EVERY entry path. The garage flow also emits ui:battleStart
        // (handled above), but debug/probe battles (__DEBUG.startBattle)
        // skip it — a previous battle's pendingDeath then seeded a replay
        // whose targetEnt belonged to a retired roster (stale visual, wrong
        // map pose).
        traj.clear();
        poseHistory.clear();
        pendingDeath = pendingVictory = lastHitOnPlayer = null;
      });
    },

    /**
     * Called by state.ts once per fixed sim step: append live shell positions
     * to their trajectory traces (KILL-CAM capture hook).
     * @param {object} game game state ({shells})
     */
    recordSimStep(game: KillcamGame) {
      // retire the one-shot program-warmup rig once the first battle has
      // rendered it for ~1.5 s (sim stepping implies frames are flowing)
      if (warmRig && ++warmSteps > 90) {
        scene.remove(warmRig);
        for (const gm of warmRig.userData.disposables) gm.dispose();
        warmRig = null;
      }
      for (const shell of game.shells) {
        if (shell.dead) continue;
        const rec = traj.get(shell.id);
        if (rec && rec.pts.length < TRAJ_MAX_PTS) {
          rec.pts.push(shell.pos.x, shell.pos.y, shell.pos.z);
        }
      }
      for (const ent of game.tanks || []) {
        if (!ent || !ent.state || ent.modeActive === false) continue;
        const frame = captureEntityFrame(ent);
        if (frame) poseHistory.set(ent.id, frame);
      }
    },

    /**
     * Called by state.ts for every resolved HitEvent (KILL-CAM capture hook).
     * Snapshots lethal chains for the player-death and victory replays.
     * @param {object} ev enriched HitEvent @param {?object} target TankEntity
     */
    onShellHit(ev: KillcamHitEvent, target: KillcamEntity | null) {
      if (!target || !target.state || !ev.localPos) return;
      const player = getPlayer();
      if (!player) return;
      if (ev.targetId === player.id) {
        lastHitOnPlayer = makeSnapshot(ev, target);
        if (ev.destroyed) pendingDeath = lastHitOnPlayer;
      } else if (ev.attackerId === player.id && ev.destroyed) {
        pendingVictory = makeSnapshot(ev, target);
      }
    },

    /** Capture a lethal tank-on-tank collision as its own replay type. */
    onRam(ev: KillcamHitEvent, a: KillcamEntity | null, b: KillcamEntity | null) {
      if (!ev || !a || !b) return;
      const player = getPlayer();
      if (!player) return;
      const selection = selectRamReplay(ev, a, b, player);
      if (!selection?.target.visual || !selection.attacker.visual) return;
      const snap = makeCollisionSnapshot(
        { ...ev, normal: selection.direction },
        selection.target,
        selection.attacker,
        selection.modules,
      );
      if (selection.target === player) pendingDeath = snap;
      else pendingVictory = snap;
    },

    /**
     * Start the end-of-battle cinematic if a matching snapshot exists.
     * @param {'victory'|'defeat'} result battle result
     * @param {number} timeS current sim time (freshness gate for victory)
     * @param {Function} onDone called when the replay finishes or is skipped
     * @param {{freshKill?:boolean}} [opts] killcam r2: freshKill marks a
     *   battle-deciding death that happened THIS tick — the replay opens
     *   with the live WRECK hold (the real destruction plays on screen
     *   before the cinematic). Mid-battle deaths get their live beat from
     *   main.ts instead and never set it.
     * @returns {boolean} true if a replay started (caller defers the overlay)
     */
    playForResult(
      result: 'victory' | 'defeat',
      timeS: number,
      onDone: () => void,
      opts?: { freshKill?: boolean },
    ): boolean {
      let snap: ReplaySnapshot | null = null;
      let kind: PlaybackKind = 'death';
      let xrayOnly = false;
      if (result === 'defeat') {
        snap = pendingDeath || lastHitOnPlayer;
        xrayOnly = !pendingDeath; // died to fire: show the shell that lit it
      } else if (result === 'victory') {
        kind = 'victory';
        if (pendingVictory && timeS - pendingVictory.timeS <= VICTORY_WINDOW_S) {
          snap = pendingVictory;
        }
      }
      if (!snap || !snap.targetEnt || !snap.targetEnt.visual) {
        // NO-REPLAY DEATH (killcam_endscreen r1): the player died without a
        // captured lethal chain (no hit ever recorded — pure ram/edge cases).
        // The caller falls back to its death cam immediately; the spectate
        // handover still applies when the battle continues. Deferred a tick
        // so the caller's fallback (rig.startDeathCam) runs first — the
        // controller's rig.startSpectate then supersedes it exactly like the
        // replay exit path. maybeStart() self-gates on result/phase/allies.
        if (result === 'defeat') setTimeout(() => spectate.maybeStart(), 80);
        return false;
      }
      begin(snap, kind, onDone, xrayOnly, !!(opts && opts.freshKill));
      return true;
    },

    /**
     * Deterministic replay staging for visual regression captures. The live
     * playback functions still own every pose, effect and camera decision;
     * this merely advances them to a stable named beat.
     * @param {object} snap snapshot shaped like makeSnapshot's output
     * @param {'xray'|'firing'|'collision'} [phase]
     */
    stageReplayShot(snap: ReplaySnapshot, phase: 'xray' | 'firing' | 'collision' = 'xray') {
      api.cancel();
      begin(snap, 'death', null, phase === 'xray');
      if (phase === 'firing') {
        beginFiring(true);
        updateFiring(FIRING_CAPTURE_S * 0.12);
      } else if (phase === 'collision') {
        beginCollision();
        updateCollision(COLLISION_HOLD_S * (COLLISION_CONTACT_U + 0.08));
      }
      staged = true; // update() never auto-finishes a staged frame
      // Deterministic capture: hard-disable the entry transition timelines
      // (.now kills every transition/animation and pins final states) — the
      // shot harness grabs the frame ~1.2 s after set(), and a bar mid-slide
      // or a half-faded title would smear across captures.
      if (dom) {
        dom.root.classList.add('now');
        dom.flash.classList.remove('go');
        if (pb && pb.isDeathView) dom.killer.root.classList.add('rv');
      }
      // Deterministic capture: strip the label reveal animation — the shot
      // harness grabs the frame ~1.2 s after set(), and heavy first-frame
      // work (shader compiles) can delay CSS timelines past the capture.
      if (pb) {
        for (const it of pb.labels) {
          for (const n of [it.label, it.dot, it.line]) {
            if (!n) continue;
            n.classList.remove('cot-kc-anim');
            n.style.animationDelay = '';
          }
        }
      }
      // The staged capture reveals the killer card after beginXray's first
      // projection. Re-project once with that card visible so screenshots
      // exercise the same reserved-space layout as a live replay frame.
      projectLabels();
      return api.replayInfo;
    },

    /** Backward-compatible x-ray screenshot entry point. */
    stageXrayShot(snap: ReplaySnapshot) {
      return api.stageReplayShot(snap, 'xray');
    },

    /** @returns {boolean} a replay (or staged frame) is on screen */
    isActive() { return active; },

    /**
     * Hard cleanup — used by __SHOTS.set and battle restarts. Immediate: no
     * exit choreography, and any in-flight exit fade/timers are revoked so a
     * mid-transition cancel can never strand the black frame, the veil or
     * the letterbox (clearExit + the class strip in teardown).
     */
    cancel() {
      clearExit();
      if (active) finish(false);
      else resetDomPresentation();
    },

    /** SPECTATE introspection/driving for probes (active, targetId, cycle). */
    get spectate() { return spectate; },

    /**
     * Advance the replay one render frame (drives camera + labels).
     * @param {number} dt render delta seconds
     */
    update(dt: number) {
      if (!active || !pb || staged) return;
      if (pb.phase === 'wreck') updateWreck(dt);
      else if (pb.phase === 'approach') updateApproach(dt);
      else if (pb.phase === 'firing') updateFiring(dt);
      else if (pb.phase === 'flight') updateFlight(dt);
      else if (pb.phase === 'contact') updateContact(dt);
      else if (pb.phase === 'collision') updateCollision(dt);
      else if (pb.phase === 'impact') updateImpact(dt);
      else if (pb.phase === 'xray') updateXray(dt);
      else if (pb.phase === 'exit'
          && performance.now() - (pb.exitWallMs || 0) > EXIT_HOLD_MS + 120) {
        // Wall-clock timers are the primary exit driver, but embedded/background
        // Chromium can discard a timer while rAF continues. The visual update
        // is a second independent clock so a replay can never strand its opaque
        // fade over a still-running battle.
        completeExit();
      }
      // 'exit': the closing letterbox + fade own the screen — camera holds
      // its last x-ray pose; wall-clock timers drive the handover (beginExit)
    },

    /** Debug/testing introspection. */
    get phase() { return pb ? pb.phase : null; },
    get replayInfo() {
      if (!pb) return null;
      const attacker = pb.snap.attackerEnt;
      const root = attacker && attacker.visual ? attacker.visual.root : null;
      return {
        phase: pb.phase,
        replayKind: pb.replayKind,
        attackerId: attacker ? attacker.id : null,
        attackerPose: pb.snap.attackerPose ? pb.snap.attackerPose.pos.slice() : null,
        attackerRenderedPos: root ? root.position.toArray() : null,
        barrelDot: pb.barrelDot,
        muzzle: pb.replayMuzzle ? pb.replayMuzzle.toArray() : null,
        pathStart: pb.pts && pb.pts.length ? pb.pts[0].toArray() : null,
        projectile: pb.core ? pb.core.position.toArray() : null,
        impact: pb.pts && pb.pts.length ? pb.pts[pb.pts.length - 1].toArray() : null,
        flightElapsedS: pb.t,
        flightDurationS: pb.dur,
        flightDistM: pb.flightDist,
        flightTotalM: pb.total,
        contactElapsedS: pb.contactT,
        shotFired: !!(pb.shot && pb.shot.fired),
        collisionContact: !!(pb.collision && pb.collision.hit),
        targetPrePose: pb.snap.prePose ? pb.snap.prePose.pos.slice() : pb.snap.pose.pos.slice(),
        targetImpactPose: (pb.snap.impactPose || pb.snap.pose).pos.slice(),
      };
    },

    /**
     * Fx-clock scale for THIS frame (killcam r2): main.ts multiplies the
     * shared fx dt by it, dilating the whole destruction — particles, blast
     * light, timers AND the visual's pop/burn timelines (they age on the
     * same clock) — to ~0.55x through the impact beat's turret launch.
     * 1 in every other phase and outside replays.
     */
    get fxTimeScale() {
      return active && pb && !staged && pb.phase === 'impact'
        ? impactRate(pb.it) : 1;
    },

    /**
     * Wall-clock timestamp (performance.now()) of the last begin() — lets
     * probes measure dead air between game.result being set and the replay
     * owning the screen (r6: headless fastForward starved RAF and faked a
     * 4.9 s onset; live runs must start the same frame).
     */
    get lastBeginWallMs() { return lastBeginWallMs; },
  };

  // -------------------------------------------------------------------------
  // Playback
  // -------------------------------------------------------------------------

  function onSkipKey() {
    if (!active || !pb || staged) return;
    // click-to-skip stays at every stage: wreck/approach/flight jump to the
    // x-ray payoff (beginXray restages + re-hides fx from any live beat),
    // x-ray starts the exit. A second skip DURING the exit is ignored — the
    // 0.4 s close is already the fastest path out, and re-entering beginExit
    // would double-arm the handover timers.
    // killcam r3: the impact beat now sits on BOTH sides of the x-ray. The
    // r2 beat (player kills) still skips forward into the analysis; the
    // own-death FINALE is the last thing before the results, so it skips
    // straight out. Skipping the x-ray itself cancels a pending finale —
    // "get me out" must never route through another 3 s of cinematic — and
    // teardown() re-applies the settled wreck, so the victim still ends up
    // destroyed however early the skip lands.
    if (pb.phase === 'wreck' || pb.phase === 'approach' || pb.phase === 'firing'
        || pb.phase === 'flight' || pb.phase === 'contact' || pb.phase === 'collision') {
      beginXray();
    } else if (pb.phase === 'impact') {
      if (pb.isFinale) beginExit();
      else beginXray();
    } else if (pb.phase === 'xray') {
      pb.finalePending = false;
      beginExit();
    }
  }

  function replayTrajectoryPoints(raw: readonly number[]): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];
    for (let index = 0; index < raw.length; index += 3) {
      const point = new THREE.Vector3(raw[index], raw[index + 1], raw[index + 2]);
      const previous = points[points.length - 1];
      if (!previous || point.distanceToSquared(previous) > 1e-6) points.push(point);
    }
    return points;
  }

  function alignTrajectoryToReplayMuzzle(points: THREE.Vector3[]): void {
    if (!pb.replayMuzzle) return;
    const correction = pb.replayMuzzle.clone().sub(points[0]);
    const cumulative = new Float32Array(points.length);
    let total = 0;
    for (let index = 1; index < points.length; index++) {
      total += points[index].distanceTo(points[index - 1]);
      cumulative[index] = total;
    }
    if (total <= 1e-5) {
      points[0].copy(pb.replayMuzzle);
      return;
    }
    for (let index = 0; index < points.length - 1; index++) {
      points[index].addScaledVector(correction, 1 - cumulative[index] / total);
    }
  }

  function configureFlightTimeline(points: THREE.Vector3[]): void {
    pb.pts = points;
    pb.cum = new Float32Array(points.length);
    let total = 0;
    for (let index = 1; index < points.length; index++) {
      total += points[index].distanceTo(points[index - 1]);
      pb.cum[index] = total;
    }
    pb.total = total;
    pb.dur = THREE.MathUtils.clamp(1.2 + total * 0.005, FLIGHT_MIN_S, FLIGHT_MAX_S);
    pb.flightTimeline = createReplayFlightTimeline(total, pb.dur, {
      slowRate: SLOWMO_RATE,
      slowStartM: SLOWMO_START_M,
      slowFullM: SLOWMO_FULL_M,
    });
    pb.flightLift = solveFlightOcclusion();
  }

  function createFlightTrail(points: readonly THREE.Vector3[]): void {
    const positions = new Float32Array(points.length * 3);
    for (let index = 0; index < points.length; index++) {
      const point = points[index];
      positions[index * 3] = point.x;
      positions[index * 3 + 1] = point.y;
      positions[index * 3 + 2] = point.z;
    }
    pb.trailGeo = new THREE.BufferGeometry();
    pb.trailGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    pb.trailGeo.setAttribute('color', new THREE.BufferAttribute(
      new Float32Array(points.length * 3).fill(1),
      3,
    ));
    pb.trailGeo.setDrawRange(0, 1);
    pb.disposables.push(pb.trailGeo);
    pb.group.add(new THREE.Line(pb.trailGeo, S.trail));
  }

  function createFlightProjectile(): void {
    const rodGeometry = new THREE.CylinderGeometry(0.032, 0.02, 1.05, 8, 1, true);
    const tipGeometry = new THREE.ConeGeometry(0.032, 0.3, 8);
    const streakGeometry = new THREE.CylinderGeometry(0.02, 0.007, 5.0, 6, 1, true);
    pb.disposables.push(rodGeometry, tipGeometry, streakGeometry);
    pb.core = new THREE.Group();
    const rod = new THREE.Mesh(rodGeometry, S.core);
    const tip = new THREE.Mesh(tipGeometry, S.core);
    tip.position.y = 0.675;
    pb.core.add(rod, tip);
    pb.streak = new THREE.Mesh(streakGeometry, S.streak);
    pb.group.add(pb.core, pb.streak);
  }

  function createFlightTailGeometry(): THREE.ConeGeometry {
    const geometry = new THREE.ConeGeometry(0.19, 10, 10, 1, true);
    const positions = geometry.getAttribute('position');
    const colors = new Float32Array(positions.count * 3);
    for (let index = 0; index < positions.count; index++) {
      const value = Math.pow(
        THREE.MathUtils.clamp(0.5 - positions.getY(index) / 10, 0, 1),
        1.4,
      );
      colors[index * 3] = colors[index * 3 + 1] = colors[index * 3 + 2] = value;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geometry;
  }

  function createFlightDressing(firstPoint: THREE.Vector3): void {
    pb.halo = new THREE.Sprite(S.halo);
    pb.halo.scale.set(1.7, 1.7, 1);
    S.halo.opacity = 0.95;
    S.tail.opacity = 0.17;
    const tailGeometry = createFlightTailGeometry();
    pb.disposables.push(tailGeometry);
    pb.tail = new THREE.Mesh(tailGeometry, S.tail);
    pb.group.add(pb.halo, pb.tail);

    pb.shellLight = kcLights[1];
    pb.shellLight.color.setHex(0xffc48a);
    pb.shellLight.intensity = 48;
    pb.shellLight.distance = 30;
    pb.muzzleLight = kcLights[2];
    pb.muzzleLight.color.setHex(0xe8f0fa);
    pb.muzzleLight.intensity = 70;
    pb.muzzleLight.distance = 55;
    pb.muzzleLight.position.set(firstPoint.x, firstPoint.y + 2.5, firstPoint.z);
    pb.flightDist = 0;
  }

  function prepareProjectileFlight(raw: readonly number[]): boolean {
    const points = replayTrajectoryPoints(raw);
    if (points.length < 2) return false;
    alignTrajectoryToReplayMuzzle(points);
    configureFlightTimeline(points);
    createFlightTrail(points);
    createFlightProjectile();
    createFlightDressing(points[0]);
    return true;
  }

  function createPlaybackBundle(
    snap: ReplaySnapshot,
    kind: PlaybackKind,
    onDone: (() => void) | null,
  ): PlaybackBundle {
    const bundle: PlaybackBundle = {
      snap, kind, onDone,
      replayKind: snap.replayKind || 'projectile',
      phase: 'flight', t: 0, xt: 0,
      group: new THREE.Group(),
      disposables: [],
      ghostBackup: null,
      ghostSeen: null,
      ghostVis: null,
      ghostSkin: null,
      labels: [],
      obstacles: null!,
      pts: null!, cum: null!, total: 0, dur: 0, segIdx: 0,
      flightLift: null,
      flightDist: 0, flightTimeline: null!,
      contactT: 0, contactDir: null!,
      app: null,
      shot: null,
      shotFxT: 0, shotFxLive: false,
      collision: null,
      isDeathView: false,
      killerShown: false,
      core: null!, streak: null!, trailGeo: null!,
      halo: null!, tail: null!, shellLight: null!, muzzleLight: null!,
      xcam: null!,
      fxGroup: null, fxHidden: null,
      vegGroup: null, vegWasVisible: true,
      dimmedLights: null,
      rewreck: null,
      restageModuleStates: snap.preModuleStates || null,
      restageEraSpent: snap.preEraSpent || [],
      snapPoseState: null!,
      attackerPoseState: null,
      attackerRestore: null,
      replayMuzzle: null, barrelDot: null,
      wreck: null,
      it: 0, itWall: 0,
      impactVis: null!,
      xrayAng0: 0,
      xrayHoldS: XRAY_HOLD_S,
      cameraBlend: null,
      finalePending: false,
      isFinale: false,
      impactAng0: 0,
    };
    bundle.group.name = 'killcam';
    scene.add(bundle.group);
    bundle.fxGroup = scene.getObjectByName('fx') || null;
    return bundle;
  }

  function replayPerspective(
    snap: ReplaySnapshot,
    kind: PlaybackKind,
  ): { playerKill: boolean; playerIsVictim: boolean } {
    const event = snap.ev;
    const player = getPlayer();
    const playerIsVictim = !!(player
      && ((event.targetId != null && event.targetId === player.id)
        || snap.targetEnt === player));
    const playerKill = kind === 'victory'
      || (!playerIsVictim && !!(player
        && event.attackerId != null && event.attackerId === player.id));
    return { playerKill, playerIsVictim };
  }

  function targetWreckReceipt(
    snap: ReplaySnapshot,
  ): PlaybackBundle['rewreck'] {
    const visual = snap.targetEnt?.visual;
    if (!visual?.isDestroyed?.()) return null;
    const brokenTracks = ['trackL', 'trackR'].filter((module) =>
      (snap.moduleStates && snap.moduleStates[module] === 'red')
      || (snap.ev.modulesHit || []).some((hit) =>
        hit.module === module && hit.newState === 'red'));
    return {
      pop: !!snap.ev.ammoRacked,
      brokenTracks,
      eraSpent: snap.eraSpent || [],
    };
  }

  function configureReplayActors(
    snap: ReplaySnapshot,
    kind: PlaybackKind,
    xrayOnly: boolean,
  ): boolean {
    const perspective = replayPerspective(snap, kind);
    pb.isDeathView = perspective.playerIsVictim;
    pb.snapPoseState = replayStateFromPose(snap.prePose || snap.pose);
    restageAttacker();
    pb.rewreck = targetWreckReceipt(snap);
    pb.finalePending = !!(pb.replayKind === 'projectile'
      && pb.isDeathView && !xrayOnly && pb.rewreck && snap.ev.destroyed);
    return perspective.playerKill;
  }

  function prepareReplayVictim(freshKill: boolean): boolean {
    const wreckHold = !!(freshKill && pb.isDeathView && pb.rewreck);
    if (!wreckHold) {
      hideFx();
      restageIntact();
    }
    return wreckHold;
  }

  const replayStatIcons: Readonly<Record<string, string>> = {
    [t('killcam.stat.distance')]: 'scope',
    [t('killcam.stat.impactAngle')]: 'turretRing',
    [t('killcam.stat.armor')]: 'shield',
    [t('killcam.stat.damage')]: 'damage',
    [t('killcam.stat.pen')]: 'penetration',
    [t('killcam.stat.zone')]: 'autoAim',
    [t('killcam.stat.closingSpeed')]: 'speed',
    [t('killcam.stat.failedModules')]: 'repair',
  };

  function appendReplayStat(
    d: KillcamDom,
    key: string,
    value: string,
    wide = false,
  ): HTMLDivElement {
    const row = el('div', `cot-kc-kv${wide ? ' w' : ''}`, d.rows);
    const label = el('span', '', row);
    label.innerHTML = `${uiIconSVG(replayStatIcons[key] || 'battleRecord', 10)}<span>${key}</span>`;
    const output = el('b', '', row);
    output.textContent = value;
    return row;
  }

  function replayArmorText(event: KillcamHitEvent): string {
    const hasArmor = (event.nominalMm || 0) > 0 || (event.effectiveMm || 0) > 0;
    if (hasArmor) {
      return `${Math.round(event.nominalMm || 0)} → ${Math.round(event.effectiveMm || 0)} mm eff.`;
    }
    const external = !!event.zone
      && ['optics', 'gun', 'gun_barrel', 'trackL', 'trackR'].includes(event.zone);
    return external ? t('killcam.externalNoArmor') : '—';
  }

  function penetrationQualifier(
    event: KillcamHitEvent,
    fresh: number,
    residual: number,
    nominal: number,
  ): string {
    if (event.eraPlate) return t('killcam.era');
    const belowRollFloor = nominal > 0 && residual < nominal * 0.75 - 2;
    return residual > 0 && (fresh > residual + 1 || belowRollFloor)
      ? t('killcam.screens')
      : '';
  }

  function penetrationLegend(
    cut: boolean,
    qualifier: string,
    residual: number,
    nominal: number,
  ): string {
    if (cut) return t('killcam.legend.fresh', { tag: qualifier });
    return residual > 0 && nominal > 0 ? t('killcam.legend.roll') : '';
  }

  function appendPenetrationQualifier(
    row: HTMLDivElement,
    qualifier: string,
  ): void {
    const output = row.querySelector('b');
    if (!qualifier || !output) return;
    const chip = el('span', 'q', output);
    chip.textContent = qualifier;
    const isEra = t('killcam.era') === qualifier;
    chip.style.color = isEra ? '#ffb43c' : '#9fb0bf';
  }

  function appendPenetrationStat(d: KillcamDom, event: KillcamHitEvent): void {
    const nominal = nominalPenFor(event);
    const residual = Math.round(event.penRollMm || 0);
    const fresh = Math.round(event.penRollFreshMm || 0);
    const cut = fresh > residual + 1;
    const qualifier = penetrationQualifier(event, fresh, residual, nominal);
    const value = residual > 0
      ? `${cut ? `${fresh} → ` : ''}${residual}${nominal > 0 ? ` / ${nominal}` : ''} mm`
      : '—';
    const row = appendReplayStat(d, t('killcam.stat.pen'), value, true);
    row.classList.add('pen');
    appendPenetrationQualifier(row, qualifier);
    const legend = penetrationLegend(cut, qualifier, residual, nominal);
    row.title = legend
      ? t('killcam.penTitle', { legend })
      : t('killcam.penTitleRoll');
    if (legend) el('div', 'cot-kc-pencap', d.rows).textContent = legend;
  }

  function populateBallisticStats(d: KillcamDom, event: KillcamHitEvent): void {
    const meta = d.hdMeta.querySelector('span');
    if (meta) meta.textContent = t('killcam.ballisticAnalysis');
    appendReplayStat(d, t('killcam.stat.distance'), `${Math.round(event.flightDistM || 0)} m`);
    appendReplayStat(d, t('killcam.stat.impactAngle'), `${Math.round(event.impactAngleDeg || 0)}°`);
    appendReplayStat(d, t('killcam.stat.armor'), replayArmorText(event));
    appendReplayStat(d, t('killcam.stat.damage'), `${Math.round(event.damage || 0)}`);
    appendPenetrationStat(d, event);
    appendReplayStat(d, t('killcam.stat.zone'), zoneLabel(event.zone), true);
  }

  function populateCollisionStats(d: KillcamDom, event: KillcamHitEvent): void {
    const meta = d.hdMeta.querySelector('span');
    if (meta) meta.textContent = t('killcam.collisionAnalysis');
    d.hdK.textContent = t('killcam.hullImpact');
    appendReplayStat(d, t('killcam.stat.closingSpeed'), `${Math.round((event.closingMps || 0) * 3.6)} km/h`);
    appendReplayStat(d, t('killcam.stat.damage'), `${Math.round(event.damage || 0)}`);
    appendReplayStat(d, t('killcam.stat.failedModules'), `${(event.modulesHit || []).length}`, true);
  }

  function populateReplayDom(d: KillcamDom, playerKill: boolean): void {
    const event = pb.snap.ev;
    d.titleT.textContent = playerKill ? t('killcam.finalBlow') : t('killcam.killCam');
    d.titleS.textContent = pb.replayKind === 'collision'
      ? (playerKill
        ? t('killcam.rammedTarget', { name: event.targetName || t('killcam.enemy') })
        : t('killcam.rammedBy', { name: event.attackerName || t('killcam.enemy') }))
      : (playerKill
        ? t('killcam.destroyedTarget', { name: event.targetName || t('killcam.enemy') })
        : t('killcam.destroyedByLine', { name: event.attackerName || t('killcam.enemyFire') }));
    const shellName = shellDisplayName(event);
    d.hdK.textContent = shellName
      ? `${event.shellType || ''} · ${shellName}`
      : (event.shellType || '');
    d.hdW.textContent = `${event.attackerName || t('killcam.enemy')} → ${event.targetName || ''}`;
    d.rows.textContent = '';
    if (pb.replayKind === 'collision') populateCollisionStats(d, event);
    else populateBallisticStats(d, event);
    d.banner.classList.toggle('on', !!event.ammoRacked);
    d.labelHost.textContent = '';
    d.leader.textContent = '';
    d.killer.root.classList.remove('on', 'rv');
  }

  function openReplayOverlay(d: KillcamDom): void {
    d.root.classList.remove('in', 'out', 'now', 'grade');
    d.root.classList.add('on');
    clearExit();
    void d.root.offsetWidth;
    d.root.classList.add('in');
    if (pb.isDeathView) {
      d.root.classList.add('grade');
      d.flash.classList.remove('go');
      void d.flash.offsetWidth;
      d.flash.classList.add('go');
    }
    document.body.classList.add('cot-kc-live');
    window.addEventListener('keydown', onSkipKey, true);
    window.addEventListener('mousedown', onSkipKey, true);
  }

  function configureReplayFillLight(): void {
    const snap = pb.snap;
    const radius = Math.max(9, snap.boundingRadiusM * 3.4);
    const fill = kcLights[0];
    fill.color.setHex(0xdfeaf4);
    fill.intensity = 55;
    fill.distance = radius * 4.5;
    fill.position.set(
      snap.pose.pos[0] + (pb.xcam.pos.x - snap.pose.pos[0]) * 0.4,
      snap.pose.pos[1] + snap.heightM * 2.6,
      snap.pose.pos[2] + (pb.xcam.pos.z - snap.pose.pos[2]) * 0.4,
    );
  }

  function startReplayPhase(xrayOnly: boolean, wreckHold: boolean): void {
    if (pb.replayKind === 'collision') {
      if (wreckHold && beginWreck('collision')) return;
      beginCollision();
      return;
    }
    const trajectory = pb.snap.trajPts;
    if (!xrayOnly && trajectory && trajectory.length >= 6
        && prepareProjectileFlight(trajectory)) {
      if (wreckHold && beginWreck('approach')) return;
      if (beginApproach()) return;
      beginFiring();
      return;
    }
    if (wreckHold && beginWreck('xray')) return;
    beginXray();
  }

  function begin(
    snap: ReplaySnapshot,
    kind: PlaybackKind,
    onDone: (() => void) | null,
    xrayOnly: boolean,
    freshKill = false,
  ): void {
    const d = ensureDom();
    sharedMats();
    active = true;
    staged = false;
    lastBeginWallMs = performance.now();
    if (busRef) busRef.emit('killcam:begin', { kind });
    pb = createPlaybackBundle(snap, kind, onDone);
    const playerKill = configureReplayActors(snap, kind, xrayOnly);
    const wreckHold = prepareReplayVictim(freshKill);
    populateReplayDom(d, playerKill);
    openReplayOverlay(d);
    pb.xcam = computeXrayCam(snap);
    configureReplayFillLight();
    startReplayPhase(xrayOnly, wreckHold);
  }

  /**
   * Hide every visible non-light child of the fx group (killcam r2 refactor
   * of the begin()-time suppression): pooled PointLights stay in the
   * renderer's light count (LIGHT-COUNT note), pb.fxHidden accumulates
   * whatever THIS call hid so showFx()/teardown can restore exactly it.
   */
  function hideFx() {
    const fxs = (() => { try { return getFx(); } catch (_) { return null; } })();
    if (fxs && fxs.setReplaySuppressed) fxs.setReplaySuppressed(true);
    if (!pb || !pb.fxGroup) return;
    if (!pb.fxHidden) pb.fxHidden = [];
    for (const child of pb.fxGroup.children) {
      if ((child as THREE.Light).isLight || !child.visible) continue;
      child.visible = false;
      pb.fxHidden.push(child);
    }
  }

  /** Restore the fx children hideFx() suppressed (impact beat / teardown). */
  function showFx() {
    const fxs = (() => { try { return getFx(); } catch (_) { return null; } })();
    if (fxs && fxs.setReplaySuppressed) fxs.setReplaySuppressed(false);
    if (!pb || !pb.fxHidden) return;
    for (const c of pb.fxHidden) c.visible = true;
    pb.fxHidden = null;
  }

  /** Temporarily clear foliage from cinematic evidence frames. Vehicles keep
   * their exact recorded poses; only the shared vegetation presentation layer
   * is suppressed, and teardown restores its prior visibility verbatim. */
  function hideReplayVegetation() {
    if (!pb || pb.vegGroup) return;
    pb.vegGroup = scene.getObjectByName('vegetation') || null;
    if (!pb.vegGroup) return;
    pb.vegWasVisible = pb.vegGroup.visible;
    pb.vegGroup.visible = false;
  }

  function restoreReplayVegetation() {
    if (!pb || !pb.vegGroup) return;
    pb.vegGroup.visible = pb.vegWasVisible;
    pb.vegGroup = null;
  }

  /**
   * Put the shooter back at the firing snapshot and solve the rendered bore
   * against the captured launch direction. The second, visual-space solve is
   * important for imported tanks: their GLB barrel rig may carry a small
   * authored correction that logical turretYaw/gunPitch alone cannot see.
   */
  function rememberAttackerPresentation(
    visual: KillcamVisual,
    wasDestroyed: boolean,
  ): void {
    if (pb.attackerRestore) return;
    pb.attackerRestore = {
      wasDestroyed,
      wasVisible: visual.root?.visible ?? true,
    };
  }

  function attackerShotDirection(snap: ReplaySnapshot): THREE.Vector3 | null {
    return snap.shotDir
      ? new THREE.Vector3().fromArray(snap.shotDir).normalize()
      : null;
  }

  function attackerReplayState(
    snap: ReplaySnapshot,
    entity: KillcamEntity,
    shotDirection: THREE.Vector3 | null,
  ): ReturnType<typeof replayStateFromPose> {
    const pose: ReplayPose = {
      ...snap.attackerPose!,
      pos: cloneVec3Tuple(snap.attackerPose!.pos),
    };
    if (shotDirection) alignReplayPoseToShot(pose, snap.shotDir!, entity.spec);
    return replayStateFromPose(pose);
  }

  function applyAttackerYawCorrection(
    state: ReturnType<typeof replayStateFromPose>,
    entity: KillcamEntity,
    yawError: number,
  ): void {
    let turretYaw = state.turretYaw + yawError;
    const authoredArc = entity.spec.gunArcDeg;
    const arc = typeof authoredArc === 'number' && Number.isFinite(authoredArc)
      ? Math.abs(authoredArc) * Math.PI / 180
      : Infinity;
    if (Math.abs(turretYaw) > arc) {
      const clamped = Math.max(-arc, Math.min(arc, turretYaw));
      state.yaw = wrapPi(state.yaw + turretYaw - clamped);
      turretYaw = clamped;
    }
    state.turretYaw = turretYaw;
  }

  function applyAttackerPitchCorrection(
    state: ReturnType<typeof replayStateFromPose>,
    entity: KillcamEntity,
    desiredPitch: number,
    actualPitch: number,
  ): void {
    const depression = Math.abs(entity.spec.gunDepressionDeg || 90) * Math.PI / 180;
    const elevation = Math.abs(entity.spec.gunElevationDeg || 90) * Math.PI / 180;
    state.gunPitch = Math.max(
      -depression,
      Math.min(elevation, state.gunPitch + desiredPitch - actualPitch),
    );
  }

  function refineAttackerBore(
    state: ReturnType<typeof replayStateFromPose>,
    entity: KillcamEntity,
    visual: KillcamVisual,
    shotDirection: THREE.Vector3 | null,
    actualDirection: THREE.Vector3,
  ): void {
    const iterations = shotDirection ? 3 : 1;
    for (let index = 0; index < iterations; index++) {
      visual.syncFromState(state, 0);
      visual.root?.updateMatrixWorld(true);
      if (!shotDirection || !visual.gunDirWorld) continue;
      visual.gunDirWorld(actualDirection);
      actualDirection.normalize();
      const yawError = wrapPi(
        Math.atan2(shotDirection.x, shotDirection.z)
        - Math.atan2(actualDirection.x, actualDirection.z),
      );
      const desiredPitch = Math.atan2(
        shotDirection.y,
        Math.hypot(shotDirection.x, shotDirection.z),
      );
      const actualPitch = Math.atan2(
        actualDirection.y,
        Math.hypot(actualDirection.x, actualDirection.z),
      );
      applyAttackerYawCorrection(state, entity, yawError);
      applyAttackerPitchCorrection(state, entity, desiredPitch, actualPitch);
    }
  }

  function captureAttackerBoreReceipt(
    visual: KillcamVisual,
    shotDirection: THREE.Vector3 | null,
    actualDirection: THREE.Vector3,
  ): void {
    if (visual.gunMuzzleWorld) {
      pb.replayMuzzle = visual.gunMuzzleWorld(new THREE.Vector3()).clone();
    }
    if (shotDirection && visual.gunDirWorld) {
      visual.gunDirWorld(actualDirection);
      actualDirection.normalize();
      pb.barrelDot = actualDirection.dot(shotDirection);
    }
  }

  function restageAttacker() {
    if (!pb || !pb.snap) return;
    const snap = pb.snap;
    const ent = snap.attackerEnt;
    const vis = ent && ent !== snap.targetEnt ? ent.visual : null;
    if (!ent || !vis || !snap.attackerPose) return;

    const wasDestroyed = !!(vis.isDestroyed && vis.isDestroyed());
    rememberAttackerPresentation(vis, wasDestroyed);
    if (wasDestroyed && !snap.attackerPreDestroyed && vis.resetDestroyed) vis.resetDestroyed();
    if (vis.setVisible) vis.setVisible(true);

    const shot = attackerShotDirection(snap);
    const actual = new THREE.Vector3();
    const state = attackerReplayState(snap, ent, shot);
    // Two iterations converge imported-rig offsets while keeping the hull at
    // the exact recorded world position. Casemates spill out-of-arc yaw into
    // the hull, just as alignReplayPoseToShot does for the initial solve.
    refineAttackerBore(state, ent, vis, shot, actual);
    vis.syncFromState(state, 0);
    applyReplaySurfaceState(vis, snap.attackerPreModuleStates, snap.attackerPreEraSpent);
    vis.root?.updateMatrixWorld(true);
    pb.attackerPoseState = state;
    captureAttackerBoreReceipt(vis, shot, actual);
  }

  /** Keep the restored shooter on its recorded firing transform while the
   * establishing camera travels toward it. The battle visual sync can still
   * paint between replay ticks, so a one-time restage is not sufficient: it
   * allowed the live actor pose to flash back in and then snap into place at
   * beginFiring(). This lock is allocation-free and remains active through
   * the firing hold, where `dt` also advances the authored recoil response. */
  function pinAttackerAtFiringPose(dt = 0): void {
    if (!pb || !pb.attackerPoseState) return;
    const ent = pb.snap.attackerEnt;
    if (!ent || ent === pb.snap.targetEnt || !ent.visual) return;
    const vis = ent.visual;
    if (vis.setVisible) vis.setVisible(true);
    vis.syncFromState(pb.attackerPoseState, Math.max(0, dt));
    if (vis.root) vis.root.updateMatrixWorld(true);
  }

  function applyReplaySurfaceState(
    vis: KillcamVisual,
    moduleStates: ModuleStates | null,
    eraSpent: readonly string[],
  ): void {
    if (!vis) return;
    if (vis.setTrackState) {
      vis.setTrackState('trackL', !!(moduleStates && moduleStates.trackL === 'red'));
      vis.setTrackState('trackR', !!(moduleStates && moduleStates.trackR === 'red'));
    }
    if (vis.resetEra) vis.resetEra();
    if (vis.stripEra) for (const plate of eraSpent || []) vis.stripEra(plate);
  }

  /**
   * RESTAGE INTACT (r2 "pre-wreck restage", extended in killcam r3): put the
   * victim back the way it stood the instant BEFORE the killing hit — turret
   * re-seated on its ring, gun level, paint unburnt, pop/ember timelines
   * cleared — and re-pose it from the SNAPSHOT state, with the damage the
   * tank already carried INTO the hit (broken tracks, spent ERA) re-applied
   * so neither the restage nor the ghost ever under-reports what the sim
   * resolved.
   *
   * killcam r3: IDEMPOTENT and SKIP-SAFE. The r2 version early-returned on a
   * not-currently-wrecked visual, so it silently did nothing exactly where
   * the owner's sequence needs a guarantee ("shows the tank as it was before
   * it blew up with the turret still attached"). Every own-death entry point
   * (begin, the WRECK hold handover, the approach, the x-ray, the finale) can
   * now call it and get the pre-hit victim out, whatever order they run in.
   * It also re-asserts visibility — dying while scoped hides the player's own
   * hull, and the replay must not open on an invisible tank.
   *
   * Re-posing also primes the visual FX clock before any re-wreck; every
   * caller now follows the same exact path, so the former unused `prime`
   * switch has been removed.
   */
  function restageIntact(): void {
    const vis = pb && pb.snap.targetEnt && pb.snap.targetEnt.visual;
    if (!vis) return;
    const wrecked = !!(vis.isDestroyed && vis.isDestroyed());
    if (wrecked && vis.resetDestroyed) vis.resetDestroyed();
    if (vis.setVisible) vis.setVisible(true);
    vis.syncFromState(pb.snapPoseState, 0);
    applyReplaySurfaceState(vis, pb.restageModuleStates || pb.snap.preModuleStates,
      pb.restageEraSpent || pb.snap.preEraSpent);
  }

  // ---------------------------------------------------------------------------
  // WRECK HOLD (killcam r2) — live-action opening on the player's own fresh
  // wreck: the REAL destruction (state.ts setDestroyed + the tank:destroyed
  // fx/audio that fired this same tick) plays at full rate while the camera
  // eases from the death view onto a slow orbit. The sim/visual sync loop is
  // frozen during replays, so the killcam advances the victim's pop/burn
  // timelines itself (syncFromState rides the shared fx clock).
  // ---------------------------------------------------------------------------
  function beginWreck(next: 'approach' | 'xray' | 'collision'): boolean {
    const ent = pb.snap.targetEnt;
    const vis = ent && ent.visual;
    if (!vis || !vis.isDestroyed || !vis.isDestroyed() || !ent.state) return false;
    camera.getWorldDirection(_d);
    pb.wreck = {
      t: 0,
      next,
      vis,
      ent,
      fromPos: camera.position.clone(),
      fromLook: camera.position.clone().addScaledVector(_d, 26),
      fromFov: camera.fov,
    };
    // the flight dressing waits for the replay proper (mirrors beginApproach)
    for (const o of [pb.core, pb.streak, pb.halo, pb.tail]) if (o) o.visible = false;
    if (pb.shellLight) pb.shellLight.intensity = 0;
    if (pb.muzzleLight) pb.muzzleLight.intensity = 0;
    pb.phase = 'wreck';
    updateWreck(0);
    return true;
  }

  function updateWreck(dt: number): void {
    const w = pb.wreck;
    if (!w) return;
    w.t += dt;
    // destruction timelines advance on the fx clock; pose from the entity's
    // LIVE dead state (visual continuity — the snapshot restage happens at
    // the handover, behind the camera move)
    if (w.ent.state) w.vis.syncFromState(w.ent.state, dt);
    // camera: ease from wherever the player died looking onto a slow wreck
    // orbit (death-cam grammar), azimuth-continuous with the entry pose
    const st = w.ent.state;
    const hM = Math.max(1.6, pb.snap.heightM || 2.4);
    _p.set(st.pos.x, st.pos.y + hM * 0.5, st.pos.z);
    const R = Math.max(11, (pb.snap.boundingRadiusM || 4) * 3.0);
    if (w.az === undefined) {
      w.az = Math.atan2(w.fromPos.x - _p.x, w.fromPos.z - _p.z);
    }
    const az = w.az + 0.16 * w.t;
    _a.set(
      _p.x + Math.sin(az) * R * 0.93,
      _p.y + R * 0.34,
      _p.z + Math.cos(az) * R * 0.93,
    );
    if (heightField) {
      const minY = heightField.getHeightAt(_a.x, _a.z) + 1.0;
      if (_a.y < minY) _a.y = minY;
    }
    // look slightly above the hull so the turret toss + fireball crown stay
    // framed through their apogee
    _b.set(_p.x, _p.y + hM * 0.45, _p.z);
    const k = THREE.MathUtils.smoothstep(w.t, 0, 0.9);
    _a.lerpVectors(w.fromPos, _a, k);
    _b.lerpVectors(w.fromLook, _b, k);
    if (heightField) {
      const minY = heightField.getHeightAt(_a.x, _a.z) + 0.9;
      if (_a.y < minY) _a.y = minY;
    }
    rig.setExternalPose(_a, _b, w.fromFov + (50 - w.fromFov) * k);
    if (w.t >= WRECK_HOLD_S) endWreck();
  }

  /** Hand the wreck hold over to the replay proper (approach/flight/x-ray). */
  function endWreck() {
    const next = pb.wreck ? pb.wreck.next : 'xray';
    pb.wreck = null;
    hideFx();       // deferred begin()-time suppression (see wreckHold)
    restageIntact();  // deferred pre-wreck restage — the replay shows the hit
    if (next === 'approach') {
      if (beginApproach()) return;
      beginFiring();
      return;
    }
    if (next === 'collision') {
      beginCollision();
      return;
    }
    beginXray();
  }

  /** Frame the restored attacker and make the replayed shot visibly leave its
   * real rendered bore before the close tracer chase begins. */
  function findFiringCameraPosition(
    center: THREE.Vector3,
    heightM: number,
    radiusM: number,
    lookTarget: THREE.Vector3,
    clearance: WorldClearance | null,
    outPosition: THREE.Vector3,
  ): void {
    const candidate = new THREE.Vector3();
    for (const lift of FIRING_CAMERA_LIFTS) {
      for (const sideSign of FIRING_CAMERA_SIDES) {
        candidate.copy(center)
          .addScaledVector(_d, -radiusM * 1.4)
          .addScaledVector(_s, radiusM * 0.95 * sideSign);
        candidate.y += heightM * 0.9 + lift;
        if (heightField) {
          candidate.y = Math.max(
            candidate.y,
            heightField.getHeightAt(candidate.x, candidate.z) + 1,
          );
        }
        if (!clearance || clearance.clearAt(candidate, lookTarget)) {
          outPosition.copy(candidate);
          return;
        }
      }
    }
    outPosition.copy(candidate);
  }

  function firingCameraPose(outPos: THREE.Vector3, outLook: THREE.Vector3): void {
    const ent = pb.snap.attackerEnt;
    const st = pb.attackerPoseState;
    const h = Math.max(1.7, ent?.spec?.dims?.heightM || 2.5);
    const r = Math.max(4, ent?.spec?.armor?.boundingRadiusM || 4);
    _d.fromArray(pb.snap.shotDir || [Math.sin(st?.yaw || 0), 0, Math.cos(st?.yaw || 0)]);
    _d.y = 0;
    if (_d.lengthSq() < 1e-6) _d.set(0, 0, 1); else _d.normalize();
    _s.crossVectors(_d, UP).normalize();
    const c = st ? st.pos : _p.fromArray(pb.snap.attackerPose?.pos || [0, 0, 0]);
    // Keep the turret, bore and first meters of the shot in one readable
    // composition. The former look-ahead was 1.5 hull radii and cropped most
    // of the attacker off the left edge exactly when the muzzle flash fired.
    outLook.copy(c).addScaledVector(_d, r * 0.48);
    outLook.y += h * 0.62;
    // Try both rear quarters and lift only as much as the actual terrain,
    // props and concealment volumes require. This makes a concealed killer
    // readable without teleporting either recorded vehicle.
    findFiringCameraPosition(c, h, r, outLook, worldClearance(), outPos);
  }

  /**
   * Capture the currently painted camera before a replay phase changes its
   * target pose. The next phase advances this handoff itself, so a moving
   * target (projectile chase, collision orbit, x-ray drift) stays live while
   * position, look direction, and lens converge without a cut.
   */
  function beginCameraHandoff(duration = CAMERA_HANDOFF_S): void {
    if (!pb) return;
    camera.getWorldDirection(_d);
    pb.cameraBlend = {
      t: 0,
      dur: Math.max(0.001, duration),
      fromPos: camera.position.clone(),
      fromLook: camera.position.clone().addScaledVector(_d, 24),
      fromFov: camera.fov,
    };
  }

  /** Apply a replay camera target through the active continuous handoff. */
  function setReplayCamera(
    pos: THREE.Vector3,
    look: THREE.Vector3,
    fov: number,
    dt = 0,
  ): void {
    const blend = pb && pb.cameraBlend;
    if (!blend) {
      rig.setExternalPose(pos, look, fov);
      return;
    }
    blend.t = Math.min(blend.dur, blend.t + Math.max(0, dt));
    const u = blend.t / blend.dur;
    const k = u * u * u * (u * (u * 6 - 15) + 10);
    _camPos.lerpVectors(blend.fromPos, pos, k);
    _camLook.lerpVectors(blend.fromLook, look, k);
    rig.setExternalPose(_camPos, _camLook, blend.fromFov + (fov - blend.fromFov) * k);
    if (u >= 1) pb.cameraBlend = null;
  }

  function replayFx(): FxRuntime | null {
    try {
      return getFx?.() ?? null;
    } catch (_) {
      return null;
    }
  }

  function prepareFiringPresentation(): void {
    hideReplayVegetation();
    for (const object of [pb.core, pb.streak, pb.halo, pb.tail]) {
      if (object) object.visible = false;
    }
    if (pb.shellLight) pb.shellLight.intensity = 0;
    showFx();
  }

  function triggerReplayShot(attacker: KillcamEntity, shotDirection: THREE.Vector3): void {
    const muzzle = pb.replayMuzzle;
    if (!muzzle) return;
    const visual = attacker.visual;
    if (visual.recoilKick) {
      visual.recoilKick(
        0,
        pb.snap.recoilScale || 1,
        pb.snap.muzzleIndex >= 0 ? pb.snap.muzzleIndex : undefined,
      );
    }
    const caliberMm = pb.snap.caliberMm || pb.snap.ev.caliberMm || 100;
    replayFx()?.muzzleFlash?.(muzzle, shotDirection, caliberMm);
    busRef?.emit('killcam:shot', {
      shooterId: attacker.id,
      isPlayer: !!attacker.isPlayer,
      muzzlePos: muzzle.toArray(),
      dir: shotDirection.toArray(),
      caliberMm,
      weaponSound: pb.snap.weaponSound || null,
      muzzleIndex: pb.snap.muzzleIndex ?? -1,
    });
  }

  function beginFiring(stagedHold = false): void {
    if (!pb || pb.replayKind !== 'projectile') return;
    if (!pb.snap.attackerEnt || !pb.snap.attackerPose || !pb.replayMuzzle) {
      beginShotFlight();
      return;
    }
    restageIntact();
    restageAttacker();
    const pos = new THREE.Vector3();
    const look = new THREE.Vector3();
    firingCameraPose(pos, look);
    pb.shot = { t: 0, fired: true, pos, look, side: _s.clone() };
    pb.phase = 'firing';
    pb.shotFxT = 0;
    pb.shotFxLive = true;
    prepareFiringPresentation();
    const attacker = pb.snap.attackerEnt;
    const shotDir = new THREE.Vector3().fromArray(pb.snap.shotDir || [0, 0, 1]).normalize();
    triggerReplayShot(attacker, shotDir);
    if (stagedHold) updateFiring(0);
    else beginShotFlight();
  }

  /**
   * Start projectile motion on the same frame as the gun event. The approach
   * has already landed on the shared shooter/launch pose, so this handoff
   * accelerates toward the moving chase target without a cut or static hold.
   */
  function beginShotFlight() {
    if (!pb) return;
    restoreReplayVegetation();
    for (const o of [pb.core, pb.streak, pb.halo, pb.tail]) if (o) o.visible = true;
    beginCameraHandoff(SHOT_ACQUIRE_S);
    pb.phase = 'flight';
    updateFlight(0);
  }

  function updateFiring(dt: number): void {
    const shot = pb.shot;
    if (!shot) return;
    shot.t += Math.max(0, dt);
    pinAttackerAtFiringPose(dt);
    const u = Math.min(1, shot.t / FIRING_CAPTURE_S);
    _a.copy(shot.pos).addScaledVector(shot.side, Math.sin(u * Math.PI) * 0.25);
    setReplayCamera(_a, shot.look, 46, dt);
    if (pb.muzzleLight) {
      pb.muzzleLight.intensity = 95 * Math.max(0, 1 - shot.t / 0.2);
      if (pb.replayMuzzle) pb.muzzleLight.position.copy(pb.replayMuzzle);
    }
    if (u >= 1) {
      hideFx();
      pb.shotFxLive = false;
      beginShotFlight();
    }
  }

  function writePoseState(
    out: ReturnType<typeof replayStateFromPose>,
    from: ReplayPose,
    to: ReplayPose,
    k: number,
  ): void {
    out.pos.set(
      from.pos[0] + (to.pos[0] - from.pos[0]) * k,
      from.pos[1] + (to.pos[1] - from.pos[1]) * k,
      from.pos[2] + (to.pos[2] - from.pos[2]) * k,
    );
    out.yaw = from.yaw + wrapPi(to.yaw - from.yaw) * k;
    out.visualPitch = from.pitch + wrapPi(to.pitch - from.pitch) * k;
    out.visualRoll = from.roll + wrapPi(to.roll - from.roll) * k;
    out.turretYaw = from.turretYaw + wrapPi(to.turretYaw - from.turretYaw) * k;
    out.gunPitch = from.gunPitch + wrapPi(to.gunPitch - from.gunPitch) * k;
  }

  function prepareCollisionAnalysis() {
    if (!pb || pb.replayKind !== 'collision') return;
    pb.snapPoseState = replayStateFromPose(pb.snap.pose);
    pb.restageModuleStates = pb.snap.moduleStates || null;
    pb.restageEraSpent = pb.snap.eraSpent || [];
    restageIntact();
    if (pb.snap.attackerImpactPose && pb.snap.attackerEnt?.visual) {
      pb.attackerPoseState = replayStateFromPose(pb.snap.attackerImpactPose);
      pb.snap.attackerEnt.visual.syncFromState(pb.attackerPoseState, 0);
      applyReplaySurfaceState(pb.snap.attackerEnt.visual,
        pb.snap.attackerModuleStates || null, pb.snap.attackerEraSpent || []);
    }
  }

  function beginCollision() {
    if (!pb || pb.replayKind !== 'collision') return;
    restageIntact();
    restageAttacker();
    const targetFrom = pb.snap.prePose || pb.snap.pose;
    const targetTo = pb.snap.pose;
    const attackerFrom = pb.snap.attackerPose;
    const attackerTo = pb.snap.attackerImpactPose || attackerFrom;
    if (!attackerFrom || !attackerTo) return;
    const targetState = replayStateFromPose(targetFrom);
    const attackerState = replayStateFromPose(attackerFrom);
    pb.snapPoseState = targetState;
    pb.attackerPoseState = attackerState;
    const center = new THREE.Vector3(
      (targetTo.pos[0] + attackerTo.pos[0]) * 0.5,
      (targetTo.pos[1] + attackerTo.pos[1]) * 0.5,
      (targetTo.pos[2] + attackerTo.pos[2]) * 0.5,
    );
    const axis = new THREE.Vector3(
      targetTo.pos[0] - attackerTo.pos[0], 0,
      targetTo.pos[2] - attackerTo.pos[2],
    );
    const separation = Math.max(3, axis.length());
    if (axis.lengthSq() < 1e-6) axis.set(0, 0, 1); else axis.normalize();
    const side = new THREE.Vector3().crossVectors(axis, UP).normalize();
    const cameraPos = center.clone().addScaledVector(side,
      Math.max(12, separation * 1.7 + (pb.snap.boundingRadiusM || 4)));
    cameraPos.y += Math.max(5, (pb.snap.heightM || 2.5) * 2.1);
    if (heightField) cameraPos.y = Math.max(cameraPos.y,
      heightField.getHeightAt(cameraPos.x, cameraPos.z) + 1);
    const cameraLook = center.clone();
    cameraLook.y += Math.max(1.2, (pb.snap.heightM || 2.5) * 0.48);
    pb.collision = {
      t: 0, hit: false,
      targetFrom, targetTo, attackerFrom, attackerTo,
      targetState, attackerState, cameraPos, cameraLook, side,
    };
    pb.phase = 'collision';
    hideReplayVegetation();
    beginCameraHandoff(0.72);
    updateCollision(0);
  }

  function playCollisionContact(
    collision: CollisionPlayback,
    targetVisual: KillcamVisual,
    attackerVisual: KillcamVisual | null,
  ): void {
    collision.hit = true;
    showFx();
    applyReplaySurfaceState(targetVisual, pb.snap.moduleStates, pb.snap.eraSpent);
    if (attackerVisual) {
      applyReplaySurfaceState(
        attackerVisual,
        pb.snap.attackerModuleStates || null,
        pb.snap.attackerEraSpent || [],
      );
    }
    const normal = pb.snap.ev.normal || [0, 0, 1];
    targetVisual?.hitFlinch?.(normal[0], normal[2], 2.2, collision.targetState.yaw);
    attackerVisual?.hitFlinch?.(-normal[0], -normal[2], 1.6, collision.attackerState.yaw);
    _p.fromArray(pb.snap.ev.pos);
    _d.fromArray(normal).normalize();
    replayFx()?.vehicleCollision?.(_p, _d, pb.snap.ev.closingMps || 0);
    busRef?.emit('killcam:collision', {
      ...pb.snap.ev,
      aIsPlayer: !!pb.snap.targetEnt?.isPlayer,
      bIsPlayer: !!pb.snap.attackerEnt?.isPlayer,
    });
    if (dom) {
      dom.flash.classList.remove('go');
      void dom.flash.offsetWidth;
      dom.flash.classList.add('go');
    }
  }

  function updateCollision(dt: number): void {
    const c = pb.collision;
    if (!c) return;
    c.t += Math.max(0, dt);
    const u = Math.min(1, c.t / COLLISION_HOLD_S);
    const moveU = Math.min(1, u / COLLISION_CONTACT_U);
    const k = moveU * moveU * (3 - 2 * moveU);
    writePoseState(c.targetState, c.targetFrom, c.targetTo, k);
    writePoseState(c.attackerState, c.attackerFrom, c.attackerTo, k);
    const tvis = pb.snap.targetEnt.visual;
    const avis = pb.snap.attackerEnt?.visual ?? null;
    tvis.syncFromState(c.targetState, dt);
    if (avis) avis.syncFromState(c.attackerState, dt);
    if (!c.hit && u >= COLLISION_CONTACT_U) {
      playCollisionContact(c, tvis, avis);
    }
    const bump = c.hit ? Math.sin((u - COLLISION_CONTACT_U)
      / (1 - COLLISION_CONTACT_U) * Math.PI) : 0;
    _a.copy(c.cameraPos).addScaledVector(c.side, bump * 0.5);
    _a.y += bump * 0.35;
    setReplayCamera(_a, c.cameraLook, 48 + bump * 3, dt);
    if (u >= 1) {
      prepareCollisionAnalysis();
      beginXray();
    }
  }

  /**
   * REPLAY APPROACH: eased establishing arc from the live camera pose toward
   * the restored attacker, landing EXACTLY on the shared shooter/launch pose
   * so the gun event and moving shot share one composition. This runs for
   * scored kills as well as deaths. Terrain-aware: the blended path is
   * height-clamped every frame and pre-lifted clear of foliage volumes / props
   * with the same clearance solve the flight LOS pass uses (cameraRig collision
   * grammar, read-only).
   * @returns {boolean} false when no meaningful move exists (skip to flight)
   */
  function beginApproach() {
    // killcam r3 (owner: the replay "shows the tank as it was before it blew
    // up with the turret still attached"): the approach is the first frame of
    // the replay proper, so the victim is guaranteed intact HERE — whatever
    // the entry path (fresh wreck hold handover, mid-battle death beat, a
    // skipped beat). Idempotent, so the earlier begin()/endWreck restages
    // stay exactly as they were.
    restageIntact();
    // The actor must already occupy the recorded firing pose before the very
    // first approach frame is painted. beginFiring() repeats this restage as
    // a safety net, but it must never be the first visible pose correction.
    restageAttacker();
    const toPos = new THREE.Vector3();
    const toLook = new THREE.Vector3();
    flightStartPose(toPos, toLook);
    const fromPos = camera.position.clone();
    const travel = fromPos.distanceTo(toPos);
    camera.getWorldDirection(_d);
    const fromLook = fromPos.clone().addScaledVector(_d, 26);
    // lateral sweep axis: the push curves around rather than dollying straight
    _s.copy(toPos).sub(fromPos);
    _s.y = 0;
    const flat = _s.length();
    const side = new THREE.Vector3();
    if (flat > 1e-3) side.crossVectors(_s.multiplyScalar(1 / flat), UP);
    pb.app = {
      t: 0,
      dur: THREE.MathUtils.clamp(0.58 + travel * 0.025, 0.68, APPROACH_S),
      fromPos,
      fromLook,
      fromFov: camera.fov,
      toPos,
      toLook,
      side,
      sideAmt: THREE.MathUtils.clamp(flat * 0.12, 0, 13),
      lift: THREE.MathUtils.clamp(travel * 0.09, 0, 15),
      losLift: 0,
    };
    // clearance pre-solve: the mid-arc must not dip through a canopy or lose
    // its view line — find the smallest extra lift that clears every sample
    const clr = worldClearance();
    if (clr) {
      const N = 9;
      const LIFTS = [0, 2.5, 5, 9, 14];
      let need = 0;
      const cp = new THREE.Vector3();
      const lk = new THREE.Vector3();
      for (let i = 1; i < N; i++) {
        const u = i / (N - 1);
        const k = u * u * u * (u * (u * 6 - 15) + 10);
        cp.lerpVectors(pb.app.fromPos, pb.app.toPos, k)
          .addScaledVector(pb.app.side, Math.sin(Math.PI * k) * pb.app.sideAmt);
        cp.y += Math.sin(Math.PI * k) * pb.app.lift;
        lk.lerpVectors(pb.app.fromLook, pb.app.toLook,
          THREE.MathUtils.smoothstep(u, 0.12, 0.85));
        const baseY = cp.y;
        let liftHere = LIFTS[LIFTS.length - 1]; // best effort if nothing clears
        for (const cand of LIFTS) {
          cp.y = baseY + cand;
          if (clr.clearAt(cp, lk)) { liftHere = cand; break; }
        }
        need = Math.max(need, liftHere);
      }
      pb.app.losLift = need;
    }
    // the tracer has not been fired yet — dress hidden until handover
    for (const o of [pb.core, pb.streak, pb.halo, pb.tail]) if (o) o.visible = false;
    if (pb.shellLight) pb.shellLight.intensity = 0;
    if (pb.muzzleLight) pb.muzzleLight.intensity = 0;
    pb.phase = 'approach';
    updateApproach(0);
    return true;
  }

  function updateApproach(dt: number): void {
    const a = pb.app;
    if (!a) return;
    a.t += dt;
    pinAttackerAtFiringPose(0);
    const u = Math.min(1, a.t / a.dur);
    const k = u * u * u * (u * (u * 6 - 15) + 10); // smootherstep push-in
    _a.lerpVectors(a.fromPos, a.toPos, k)
      .addScaledVector(a.side, Math.sin(Math.PI * k) * a.sideAmt);
    _a.y += Math.sin(Math.PI * k) * a.lift + Math.sin(Math.PI * k) * a.losLift;
    _b.lerpVectors(a.fromLook, a.toLook, THREE.MathUtils.smoothstep(u, 0.12, 0.85));
    if (heightField) {
      const minY = heightField.getHeightAt(_a.x, _a.z) + 0.9;
      if (_a.y < minY) _a.y = minY;
    }
    // muzzle glow swells as the camera arrives — the shot is about to re-fire
    if (pb.muzzleLight) pb.muzzleLight.intensity = 70 * THREE.MathUtils.smoothstep(u, 0.78, 1);
    rig.setExternalPose(_a, _b, a.fromFov + (SHOT_TRACK_FOV - a.fromFov) * k);
    if (u >= 1) {
      beginFiring();
    }
  }

  /** Shared firing/flight pose at launch — the approach lands on it and the
   * shell departs immediately while the restored shooter remains in frame. */
  function flightStartPose(outPos: THREE.Vector3, outLook: THREE.Vector3): void {
    firingCameraPose(outPos, outLook);
    pb.segIdx = 0;
  }

  /**
   * FLIGHT LOS SOLVE (r6 major): the chase camera rode a fixed 6-9 m offset
   * with only a terrain floor — a trajectory skimming a foliage clump parked
   * the entire 2.6 s slow-mo INSIDE the canopy (screen full of leaf cards +
   * lens flare, victim invisible until the x-ray; live capture
   * shots/critic_r6_ks/b_flight.png). Before the flight starts this samples
   * the exact camera poses updateFlight() will visit and, wherever a pose
   * sits inside a vegetation concealment volume or has its view line to the
   * look target blocked by terrain/props, finds the smallest vertical lift
   * that clears it. Lifts are neighbor-maxed (the camera is already climbing
   * BEFORE it reaches an occluded stretch) and lerped during playback; the
   * x-ray blend fades them out through the same k-lerp that lands the pose,
   * so the handover stays seamless. Occluder data is the world the sim
   * itself uses — world.raycast (heightfield + prop AABBs) and the spotting
   * system's vegetation concealment discs — nothing here is invented.
   * @returns {?Float32Array} lift meters per sample, or null when clear
   */
  /**
   * Shared camera-clearance oracle (killcam_endscreen r1: factored out of
   * solveFlightOcclusion so the death-approach pre-solve reuses it): a pose
   * is CLEAR when it sits outside every vegetation concealment volume and
   * its view line to the look target is not blocked by terrain/props. The
   * occluder data is the world the sim itself uses — nothing invented.
   * @returns {?{clearAt:(cp:THREE.Vector3, lk:THREE.Vector3)=>boolean}}
   */
  function concealmentBlocksCamera(
    concealment: KillcamConcealment,
    cameraPosition: THREE.Vector3,
    lookTarget: THREE.Vector3,
  ): boolean {
    const dx = cameraPosition.x - concealment.x;
    const dz = cameraPosition.z - concealment.z;
    const radius = concealment.r + 0.9;
    const groundY = heightField
      ? heightField.getHeightAt(concealment.x, concealment.z)
      : cameraPosition.y - 100;
    const lowY = concealment.add >= 0.2 ? groundY - 1 : groundY + 1.8;
    const highY = concealment.add >= 0.2 ? groundY + 3.2 : groundY + 11.5;
    const cameraInside = dx * dx + dz * dz <= radius * radius;
    if (cameraInside && cameraPosition.y > lowY && cameraPosition.y < highY) return true;

    // A camera outside the disc can still have a leaf-filled sightline. The
    // final 18% is ignored because the framed vehicle may be in concealment.
    const segmentX = lookTarget.x - cameraPosition.x;
    const segmentZ = lookTarget.z - cameraPosition.z;
    const segmentLengthSq = segmentX * segmentX + segmentZ * segmentZ;
    if (segmentLengthSq <= 1e-5) return false;
    const t = ((concealment.x - cameraPosition.x) * segmentX
      + (concealment.z - cameraPosition.z) * segmentZ) / segmentLengthSq;
    if (t < 0 || t > 0.82) return false;
    const nearestX = cameraPosition.x + segmentX * t - concealment.x;
    const nearestZ = cameraPosition.z + segmentZ * t - concealment.z;
    const lineY = cameraPosition.y + (lookTarget.y - cameraPosition.y) * t;
    return nearestX * nearestX + nearestZ * nearestZ <= radius * radius
      && lineY > lowY
      && lineY < highY;
  }

  function worldRayBlocksCamera(
    world: KillcamWorld | null,
    cameraPosition: THREE.Vector3,
    lookTarget: THREE.Vector3,
    ray: THREE.Vector3,
  ): boolean {
    if (!world) return false;
    ray.copy(lookTarget).sub(cameraPosition);
    const distance = ray.length();
    return distance > 2
      && !!world.raycast(
        cameraPosition,
        ray.multiplyScalar(1 / distance),
        distance * 0.8,
      );
  }

  function worldClearance(): WorldClearance | null {
    let world: KillcamWorld | null = null;
    try { world = getWorld ? getWorld() : null; } catch (_) { world = null; }
    const conceal = (world && world.getConcealment && world.getConcealment()) || [];
    const canRay = !!world?.raycast;
    if (!conceal.length && !canRay) return null;
    const ray = new THREE.Vector3();
    /** Camera pose acceptable: outside foliage volumes, view line open. */
    const clearAt = (cp: THREE.Vector3, lk: THREE.Vector3): boolean => {
      for (const c of conceal) {
        if (concealmentBlocksCamera(c, cp, lk)) return false;
      }
      // 2. view line to the look target blocked by terrain or a building?
      // 80% guard distance: the look point sits near/inside the victim, and
      // the victim's own surroundings must not fail an otherwise clean pose.
      return !canRay || !worldRayBlocksCamera(world, cp, lk, ray);
    };
    return { clearAt };
  }

  function solveFlightOcclusion(): Float32Array | null {
    const clr = worldClearance();
    if (!clr || !pb.pts || pb.total <= 0) return null;
    const clearAt = clr.clearAt;
    const N = 13;
    const LIFTS = [0, 2.5, 5, 8, 12, 16, 20];
    const lifts = new Float32Array(N);
    const pos = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const camP = new THREE.Vector3();
    const look = new THREE.Vector3();
    const sideV = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      // uniform in ARC LENGTH (killcam_endscreen r1): playback is now
      // distance-driven (slow-mo retime), so the lift table is indexed by
      // distance fraction — the old launch-ease mapping would misplace lifts
      const s = u;
      sampleTraj(s * pb.total, pos, dir);
      sideV.crossVectors(dir, UP);
      if (sideV.lengthSq() < 1e-6) sideV.set(1, 0, 0); else sideV.normalize();
      camP.copy(pos).addScaledVector(dir, -(6.4 + 2.6 * (1 - u))).addScaledVector(sideV, 2.7);
      camP.y += 1.35;
      if (heightField) {
        const minY = heightField.getHeightAt(camP.x, camP.z) + 0.8;
        if (camP.y < minY) camP.y = minY;
      }
      look.copy(pos).addScaledVector(dir, 10).lerp(pb.xcam.center, 0.4 + 0.35 * u);
      const baseY = camP.y;
      let lift = LIFTS[LIFTS.length - 1]; // best effort if nothing clears
      for (const cand of LIFTS) {
        camP.y = baseY + cand;
        if (clearAt(camP, look)) { lift = cand; break; }
      }
      lifts[i] = lift;
    }
    pb.segIdx = 0; // sampleTraj cache back to the launch segment for playback
    let any = 0;
    for (let i = 0; i < N; i++) any = Math.max(any, lifts[i]);
    if (any === 0) return null; // clean path — skip the per-frame lerp
    const sm = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      sm[i] = Math.max(lifts[Math.max(0, i - 1)], lifts[i], lifts[Math.min(N - 1, i + 1)]);
    }
    return sm;
  }

  /** Sample the trajectory polyline at arc length `dist`. */
  function sampleTraj(dist: number, outPos: THREE.Vector3, outDir: THREE.Vector3): number {
    const pts = pb.pts;
    const cum = pb.cum;
    let i = pb.segIdx;
    if (cum[i] > dist) i = 0;
    while (i < pts.length - 2 && cum[i + 1] < dist) i++;
    pb.segIdx = i;
    const segLen = Math.max(1e-6, cum[i + 1] - cum[i]);
    const f = THREE.MathUtils.clamp((dist - cum[i]) / segLen, 0, 1);
    outPos.copy(pts[i]).lerp(pts[i + 1], f);
    outDir.copy(pts[i + 1]).sub(pts[i]).multiplyScalar(1 / segLen);
    return i;
  }

  function updateFlight(dt: number): void {
    pb.t = Math.min(pb.dur, pb.t + Math.max(0, dt));
    // The battle presentation can repaint actors between replay ticks. Keep
    // the restored killer at its captured firing transform through the camera
    // acquisition so the muzzle flash, recoil and departing shell visibly
    // belong to the same tank. Passing dt advances recoil without allocating.
    if (pb.t <= SHOT_ACQUIRE_S) pinAttackerAtFiringPose(dt);
    if (pb.shotFxLive) {
      pb.shotFxT += Math.max(0, dt);
      if (pb.shotFxT >= MUZZLE_FX_S) {
        hideFx();
        pb.shotFxLive = false;
      }
    }
    // Refresh-rate invariant timing: the normalized lookup contains the
    // whole terminal slow-motion ramp, so it reaches the plate at exactly
    // pb.dur. The previous per-frame integrator treated pb.dur as a baseline
    // and then added slow-mo on top; short shots hit a stall guard and visibly
    // teleported through their final meters.
    pb.flightDist = replayDistanceAtTime(pb.flightTimeline, pb.t);
    const u = pb.total > 0 ? pb.flightDist / pb.total : 1;
    const dist = pb.flightDist;
    const idx = sampleTraj(dist, _p, _d);
    pb.trailGeo.setDrawRange(0, Math.max(2, idx + 2));
    pb.core.position.copy(_p);
    pb.core.quaternion.setFromUnitVectors(_Y, _d); // dart noses along the velocity
    pb.streak.position.copy(_p).addScaledVector(_d, -2.6);
    pb.streak.quaternion.setFromUnitVectors(_Y, _d);
    // glow dressing rides the core: halo on it, tail cone stretched back
    // along the velocity (ConeGeometry apex = +Y -> point it at -_d), warm
    // light slightly above the shell so the ground track picks it up
    pb.halo.position.copy(_p);
    pb.tail.position.copy(_p).addScaledVector(_d, -6.4);
    pb.tail.quaternion.setFromUnitVectors(_Y, _s.copy(_d).negate());
    pb.shellLight.position.set(_p.x, _p.y + 0.5, _p.z);
    pb.muzzleLight.intensity = pb.shotFxLive
      ? 70 * Math.max(0, 1 - pb.shotFxT / MUZZLE_FX_S)
      : 0;

    // chase camera: behind + beside the tracer, blending into the x-ray pose.
    // r2 cinematography fix: the old 8.5-15.5 m trail distance + look-at 16 m
    // past the shell framed NEITHER shooter nor victim — the tracer was a
    // small off-center streak in an empty landscape. The camera now rides a
    // tight, near-constant 6-9 m offset (constant tracer screen size) and the
    // look target is BIASED TOWARD THE VICTIM (WT read: the destination tank
    // rises into center frame while the shell holds the lower third).
    _s.crossVectors(_d, UP);
    if (_s.lengthSq() < 1e-6) _s.set(1, 0, 0); else _s.normalize();
    const k = THREE.MathUtils.smoothstep(u, 0.78, 1);
    _a.copy(_p).addScaledVector(_d, -(6.4 + 2.6 * (1 - u))).addScaledVector(_s, 2.7);
    _a.y += 1.35;
    // occlusion lift (r6): solved once in begin() — the chase arcs OVER
    // foliage clumps / buildings instead of chasing through them; the k-lerp
    // to the x-ray pose below fades the lift out naturally.
    if (pb.flightLift) {
      const fi = Math.min(0.999999, u) * (pb.flightLift.length - 1);
      const i0 = Math.floor(fi);
      _a.y += pb.flightLift[i0] + (pb.flightLift[i0 + 1] - pb.flightLift[i0]) * (fi - i0);
    }
    // look-at: shell's forward point pulled toward the victim center — the
    // pull strengthens over the flight so the kill frame is always in view
    _b.copy(_p).addScaledVector(_d, 10);
    _b.lerp(pb.xcam.center, 0.4 + 0.35 * u);
    if (k > 0) {
      _a.lerp(pb.xcam.pos, k);
      _b.lerp(pb.xcam.look, k);
    }
    if (heightField) {
      const minY = heightField.getHeightAt(_a.x, _a.z) + 0.8;
      if (_a.y < minY) _a.y = minY;
    }
    // axis-aligned view fade: within ~25° of the trajectory axis the 13 m
    // tail cone stops reading as a tracer and sweeps a wide orange sheet
    // across the ground (r7 critique — the chase cam itself sits ~13° off
    // axis, so the ribbon showed in every flight frame). The tail is a
    // SIDE-view garnish: it dies entirely near the axis while the halo keeps
    // a floor so the shell stays a glowing ball, and the trail polyline
    // keeps the path a LINE. |dot| covers chasing and head-on alike.
    if (pb.halo) {
      const align = Math.abs(_s.copy(_p).sub(_a).normalize().dot(_d));
      const f = 1 - THREE.MathUtils.smoothstep(align, 0.9, 0.972);
      S.halo.opacity = 0.95 * (0.35 + 0.65 * f);
      S.tail.opacity = 0.17 * f;
      pb.shellLight.intensity = 48 * (0.3 + 0.7 * f);
      // near-constant screen thickness (r5: the tracer swelled into a fat
      // baton as the chase closed into the x-ray blend): radial scale tracks
      // camera range — full at the 8 m chase, thinning to ~45% point-blank
      const th = THREE.MathUtils.clamp(_a.distanceTo(_p) / 8, 0.45, 1.15);
      pb.core.scale.set(th, 1, th);
      pb.streak.scale.set(th, 1, th);
      pb.tail.scale.set(th, 1, th);
      pb.halo.scale.set(1.7 * th, 1.7 * th, 1);
    }
    setReplayCamera(_a, _b, SHOT_TRACK_FOV - 8 * k, dt);
    // The shell has arrived. killcam r2: the kill plays out LIVE (impact
    // beat) before the analytical x-ray takes the frame. killcam r3: on an
    // OWN death that order is inverted — the tank the player just watched
    // arrive intact goes straight to the skeleton, and blows up after it.
    if (u >= 1) beginContact();
  }

  /** Hold the shell on/just inside the plate for a readable rendered frame. */
  function beginContact() {
    if (!pb || pb.phase === 'contact' || pb.phase === 'impact' || pb.phase === 'xray') return;
    pb.phase = 'contact';
    pb.contactT = 0;
    pb.segIdx = Math.max(0, pb.pts.length - 2);
    sampleTraj(pb.total, _p, _d);
    pb.contactDir = _d.clone();
    updateContact(0);
  }

  function updateContact(dt: number): void {
    pb.contactT += Math.max(0, dt);
    const f = Math.min(1, pb.contactT / CONTACT_HOLD_S);
    const sink = 0.22 * THREE.MathUtils.smoothstep(f, 0, 1);
    _p.copy(pb.pts[pb.pts.length - 1]).addScaledVector(pb.contactDir, sink);
    if (pb.core) {
      pb.core.position.copy(_p);
      pb.core.quaternion.setFromUnitVectors(_Y, pb.contactDir);
      pb.core.scale.setScalar(1 - 0.18 * f);
    }
    if (pb.streak) {
      pb.streak.position.copy(_p).addScaledVector(pb.contactDir, -2.6);
      pb.streak.quaternion.setFromUnitVectors(_Y, pb.contactDir);
    }
    if (pb.halo) pb.halo.position.copy(_p);
    if (pb.tail) {
      pb.tail.position.copy(_p).addScaledVector(pb.contactDir, -6.4);
      pb.tail.quaternion.setFromUnitVectors(_Y, _s.copy(pb.contactDir).negate());
    }
    if (pb.shellLight) pb.shellLight.position.set(_p.x, _p.y + 0.5, _p.z);
    rig.setExternalPose(pb.xcam.pos, pb.xcam.look, 42);
    if (f >= 1) {
      if (pb.finalePending) beginXray();
      else beginImpact();
    }
  }

  /**
   * Fx-clock rate through the IMPACT beat (killcam r2): full speed through
   * the detonation flash, ~IMPACT_SLOWMO through the turret launch + tumble
   * (0.22-1.0 s of the pop arc — apogee at 0.62 s), back to full rate for
   * the smoke settle and the x-ray handover. Pure function of the beat's
   * ANIM time so main.ts (fx clock), updateImpact (window) and the visual's
   * own pop timeline (fx-clock driven) all dilate coherently.
   * @param {number} t impact-beat anim time (s)
   * @returns {number} fx dt multiplier (0..1]
   */
  function impactRate(t: number): number {
    const inS = THREE.MathUtils.smoothstep(t, 0.22, 0.42);
    const outS = 1 - THREE.MathUtils.smoothstep(t, 1.0, 1.38);
    return 1 - (1 - IMPACT_SLOWMO) * inS * outS;
  }

  // ---------------------------------------------------------------------------
  // IMPACT BEAT (killcam r2, owner directive: "show the actual animations of
  // popping turrets and exploding, especially during kill cam") — the moment
  // the tracer reaches the plate the destruction is RE-FIRED on the restaged
  // victim and plays live in front of the camera: detonation flash, fx
  // fireball/debris/smoke (fx children re-shown for the beat), the turret-pop
  // arc tumbling off the setDestroyed grammar exactly as in live play (GLB
  // and procedural parity — the GLB turret node is re-parented into turretG
  // at swap time), with a brief fx-clock dilation through the launch. The
  // camera pushes out from the x-ray vantage for the fireball and eases back
  // onto it, so the x-ray hold that follows starts without a cut.
  // ---------------------------------------------------------------------------
  /**
   * X-RAY TEARDOWN (killcam r3): strike the whole analysis layer and hand the
   * frame back to the normally-shaded world, so the own-death FINALE detonates
   * over the real tank instead of over a phantom. Everything beginXray() put
   * up comes down here: the fresnel ghost skin (restored FIRST — setDestroyed
   * lazily captures the victim's current materials for the rematch restore and
   * it must capture the LIVE ones, never the ghost), the internals/boxes/shell
   * path/trail ribbon under pb.group, the DOM veil + damage chips + leader
   * lines, the backdrop light dim and the vegetation hide.
   *
   * The annotation block, the AMMO RACK banner and the killer card deliberately
   * STAY: they are the death's chrome, already revealed during the hold, and
   * the exit choreography is what fades them.
   *
   * Idempotent, and every restore it performs is nulled out behind it so the
   * teardown() path can never double-apply a stale one (a surviving
   * ghostBackup would repaint pristine camo over the wreck it just made).
   */
  function endXrayDressing() {
    if (!pb) return;
    if (pb.ghostBackup) {
      for (const [mesh, mat, ro, cs] of pb.ghostBackup) {
        mesh.material = mat;
        mesh.renderOrder = ro || 0;
        mesh.castShadow = !!cs;
      }
      pb.ghostBackup = null;
    }
    pb.ghostSkin = null;
    pb.ghostSeen = null;
    pb.ghostVis = null;
    // scene dressing: hidden rather than disposed — teardown() still owns the
    // geometry lifetime, and one flag retires trail, ribbon, module boxes,
    // proxies, spall cone and shell path in a single stroke
    pb.group.visible = false;
    if (pb.dimmedLights) {
      for (const [L, i] of pb.dimmedLights) L.intensity = i;
      pb.dimmedLights = null;
    }
    if (pb.vegGroup) {
      pb.vegGroup.visible = pb.vegWasVisible;
      pb.vegGroup = null;
    }
    if (dom) {
      dom.root.classList.remove('xr'); // veil fades out on its own transition
      dom.labelHost.textContent = '';
      dom.leader.textContent = '';
    }
    pb.labels.length = 0;
    pb.obstacles = null!;
  }

  function beginImpact() {
    if (!pb || pb.phase === 'impact' || pb.phase === 'exit') return;
    // killcam r3: arriving FROM the x-ray means this is the own-death FINALE —
    // the analysis layer must come down before the destruction re-fires, the
    // orbit azimuth carries over from where the hold left it (no snap back to
    // the solved zero), and the beat exits to the results instead of looping
    // back into an x-ray it already played.
    pb.isFinale = pb.phase === 'xray';
    if (pb.isFinale) {
      pb.impactAng0 = pb.xrayAng0 + ORBIT_RAD_S * pb.xt;
      endXrayDressing();
    } else {
      pb.impactAng0 = 0;
    }
    pb.finalePending = false;
    pb.phase = 'impact';
    pb.it = 0;
    pb.itWall = 0;
    const snap = pb.snap;
    const cause = snap.ev.ammoRacked ? 'ammorack' : 'shot';
    // retire the flight tracer + dressing NOW — the shell no longer exists
    // (same pool-light discipline as beginXray: dim, never remove)
    if (pb.core) {
      pb.group.remove(pb.core, pb.streak, pb.halo, pb.tail);
      pb.shellLight.intensity = 0;
      pb.muzzleLight.intensity = 0;
      pb.core = pb.streak = pb.halo = pb.tail = pb.shellLight = pb.muzzleLight = null!;
    }
    // the destruction must be SEEN: battle fx come back for the beat (the
    // x-ray re-hides them), and the victim — restaged to its live pre-hit
    // look for the flight — is wrecked again from t=0 with the same pop
    // grammar the sim used (full toss on racks, ~20% jolt otherwise).
    showFx();
    const vis = snap.targetEnt && snap.targetEnt.visual;
    if (vis) {
      // restageIntact() is the pre-hit state AND the fx-clock cursor PRIME:
      // the visual's last sync was seconds of approach/flight — or, for the
      // r3 finale, a whole x-ray hold — ago, and the first destroyed-sync
      // would swallow that entire gap as one clamped advance; popT jumped
      // straight past the arc and the replayed turret never left its seat
      // (live probe: impact rise 0.00 m while the wreck-hold rise read 2.9).
      // Priming must happen BEFORE the re-wreck, whichever phase we came from.
      restageIntact();
      vis.setDestroyed({ pop: !!snap.ev.ammoRacked, ageS: 0 });
      pb.impactVis = vis;
    }
    const fxs = (() => { try { return getFx(); } catch (_) { return null; } })();
    if (fxs && fxs.destruction) {
      _p.set(snap.pose.pos[0], snap.pose.pos[1], snap.pose.pos[2]);
      fxs.destruction(_p, null, cause);
    }
    // AUDIO SEAM (killcam r2): the live blast/turret-pop samples fired at the
    // real kill (tank:destroyed) — re-emitting that event would double-count
    // kills, so the replayed detonation announces itself on a NEW additive
    // event the sound system subscribes to (sub-drop on this frame, slowed
    // debris/pop accents through the launch).
    if (busRef) {
      busRef.emit('killcam:impact', {
        cause,
        pos: snap.pose.pos.slice(),
        // Audio mirrors the same minimum rate used by impactRate(): the
        // transient stays crisp, then debris/turret-pop samples stretch and
        // pitch down through the visual launch window.
        timeScale: IMPACT_SLOWMO,
      });
    }
    // detonation flash — synced to the killing hit's replayed arrival
    if (dom) {
      dom.flash.classList.remove('go');
      void dom.flash.offsetWidth;
      dom.flash.classList.add('go');
    }
    updateImpact(0);
  }

  function updateImpact(dt: number): void {
    // anim time advances on the SAME dilated clock main.ts scales the fx dt
    // by (fxTimeScale getter reads impactRate(pb.it)) — window, particles
    // and the visual's pop arc stay in lockstep.
    const rate = impactRate(pb.it);
    pb.it += dt * rate;
    pb.itWall += dt;
    // the sim/visual sync loop is frozen during replays (main.ts step 5) —
    // the killcam drives the victim's destruction timelines itself; the
    // internal advance rides the shared fx clock, dt is just the fallback.
    if (pb.impactVis) pb.impactVis.syncFromState(pb.snapPoseState, dt * rate);
    // camera: hold the solved x-ray vantage, pushed out for the fireball and
    // eased back onto it — u runs 0..1 over the beat, the push-out bump is 0
    // at BOTH ends so the flight exit and the x-ray entry meet it exactly.
    // The camera/fov shape stays keyed to IMPACT_HOLD_S whatever the window,
    // so the r3 finale's extra settle tail plays out with the push-out bump
    // already back at zero, parked on the x-ray vantage.
    const u = Math.min(1, pb.it / IMPACT_HOLD_S);
    const bump = Math.sin(Math.PI * Math.min(1, u * 1.12));
    const ang = pb.impactAng0 + IMPACT_DRIFT_RAD_S * pb.it;
    const c = pb.xcam.center;
    const o = pb.xcam.off;
    const scale = 1 + 0.3 * bump;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    _a.set(
      c.x + (o.x * ca + o.z * sa) * scale,
      c.y + o.y * scale + bump * 1.1,
      c.z + (-o.x * sa + o.z * ca) * scale,
    );
    // Concussion grows from zero and settles at a low frequency. Starting at
    // peak displacement made the exact impact frame jump, while 47-61 Hz
    // oscillation read as camera jitter on low-refresh/mobile displays.
    const shakeIn = THREE.MathUtils.smoothstep(pb.itWall, 0, 0.08);
    const shake = 0.055 * shakeIn * Math.exp(-pb.itWall / 0.3);
    if (shake > 0.004) {
      _a.x += Math.sin(pb.itWall * 19.0) * shake;
      _a.y += Math.sin(pb.itWall * 14.0) * shake * 0.55;
      _a.z += Math.sin(pb.itWall * 17.0) * shake;
    }
    if (heightField) {
      const minY = heightField.getHeightAt(_a.x, _a.z) + 1.0;
      if (_a.y < minY) _a.y = minY;
    }
    // look rises with the toss so the tumbling turret + fireball crown stay
    // framed, then settles back onto the x-ray look point
    _b.copy(pb.xcam.look);
    _b.y += bump * Math.max(1.2, (pb.snap.heightM || 2.4) * 0.55);
    // Lens pulse also starts at the inherited 42° frame, peaks after impact,
    // and returns to 42°; there is no first-frame FOV discontinuity.
    const lensU = Math.min(1, pb.itWall / 0.42);
    const fov = 42 + 2.4 * Math.sin(Math.PI * lensU) * Math.exp(-pb.itWall / 0.38);
    setReplayCamera(_a, _b, fov, dt);
    // hand the beat over: window served (anim time), or the wall-clock stall
    // guard (a starved pane must still finish the battle flow). killcam r3 —
    // the own-death FINALE is the last beat of the replay, so it runs the
    // slightly longer FINALE_HOLD_S (fireball + turret arc + a short settle)
    // and goes straight to the exit; the r2 player-kill beat still hands the
    // frame to the analytical x-ray.
    const win = pb.isFinale ? FINALE_HOLD_S : IMPACT_HOLD_S;
    if (pb.it >= win || pb.itWall > win * 2.5) {
      if (pb.isFinale) {
        beginExit();
      } else {
        pb.xrayAng0 = ang; // orbit continuity — the hold inherits the drift
        beginXray();
      }
    }
  }

  /** Deterministic x-ray vantage from the snapshot (side-on to the path). */
  function computeXrayCam(snap: ReplaySnapshot): XrayCamera {
    const pose = snap.pose;
    const center = new THREE.Vector3(pose.pos[0], pose.pos[1] + snap.heightM * 0.55, pose.pos[2]);
    _e.set(-pose.pitch, pose.yaw, pose.roll, 'YXZ');
    _q.setFromEuler(_e);
    const dirW = snap.ev.localDir
      ? new THREE.Vector3().fromArray(snap.ev.localDir).applyQuaternion(_q).normalize()
      : new THREE.Vector3().fromArray(snap.ev.normal).negate();
    _s.crossVectors(dirW, UP);
    if (_s.lengthSq() < 1e-6) _s.set(1, 0, 0); else _s.normalize();
    // Orbit radius tightened ~30% from r5's 2.7×: the victim occupied only a
    // quarter of a mostly-empty frame — WT frames the wreck at 40-60% of
    // frame height. Labels still deconflict at this framing (projectLabels).
    const R = Math.max(6.2, snap.boundingRadiusM * 1.9);
    // ~24° three-quarter elevation: the old R*0.68 vantage read near
    // top-down — the struck hull side was invisible and the silhouette
    // unreadable (r3 critique). Tall grass no longer constrains the
    // sightline: the vegetation layer is hidden for the whole x-ray hold.
    // The camera backs off along the shell path (-0.52) so the penetrated
    // face always faces the lens.
    const sideM = R * 0.88;
    const off = new THREE.Vector3()
      .addScaledVector(_s, sideM)
      .addScaledVector(dirW, -R * 0.52);
    // Both lateral sides tell the same armor/path story, but one can put the
    // live map sun almost exactly behind the victim. The translucent ghost
    // then disappears into a white disc even though the staged x-ray remains
    // fine. Prefer the side whose view axis is farther from the sun; retain
    // the along-path component so the penetrated plate still faces the lens.
    const sun = scene.userData.sunDirWorld;
    if (sun && sun.lengthSq() > 1e-8) {
      const currentSunDot = -off.dot(sun) / Math.max(1e-6, off.length());
      off.addScaledVector(_s, -sideM * 2);
      const flippedSunDot = -off.dot(sun) / Math.max(1e-6, off.length());
      if (flippedSunDot >= currentSunDot) off.addScaledVector(_s, sideM * 2);
    }
    off.y += R * 0.44;
    const pos = center.clone().add(off);
    if (heightField) {
      const minY = heightField.getHeightAt(pos.x, pos.z) + 1.0;
      if (pos.y < minY) pos.y = minY;
    }
    // look point raised ~6° above hull center: tilts the frame up so the
    // horizon/sky band stays visible at the top instead of an all-ground void
    const xcam = { center, off, pos, look: center.clone().setY(center.y + R * 0.12) };
    fitXrayFrame(snap, xcam);
    return xcam;
  }

  interface XrayHullExtents {
    halfWidth: number;
    halfLength: number;
    halfHeight: number;
  }

  interface XrayFrameMeasure {
    worst: number;
    midY: number;
  }

  function xrayHullExtents(snap: ReplaySnapshot): XrayHullExtents {
    let halfWidth: number;
    let halfLength: number;
    try {
      const dims = snap.targetEnt.spec.dims;
      halfWidth = dims.widthM * 0.5 + 0.2;
      halfLength = (dims.hullLengthM || dims.overallLengthM * 0.8) * 0.55;
    } catch (_) {
      halfWidth = halfLength = Math.max(2, snap.boundingRadiusM || 4);
    }
    return {
      halfWidth,
      halfLength,
      halfHeight: Math.max(1.5, snap.heightM || 2.4) + 0.25,
    };
  }

  function xrayHullCorners(snap: ReplaySnapshot): THREE.Vector3[] {
    const pose = snap.pose;
    const extents = xrayHullExtents(snap);
    const cosYaw = Math.cos(pose.yaw);
    const sinYaw = Math.sin(pose.yaw);
    const corners: THREE.Vector3[] = [];
    for (let index = 0; index < 8; index++) {
      const localX = index & 1 ? extents.halfWidth : -extents.halfWidth;
      const localY = index & 2 ? extents.halfHeight : 0;
      const localZ = index & 4 ? extents.halfLength : -extents.halfLength;
      corners.push(new THREE.Vector3(
        pose.pos[0] + localX * cosYaw + localZ * sinYaw,
        pose.pos[1] + localY,
        pose.pos[2] - localX * sinYaw + localZ * cosYaw,
      ));
    }
    return corners;
  }

  function positionXrayFitCamera(xcam: XrayCamera, scale: number, angle: number): void {
    const cosAngle = Math.cos(angle);
    const sinAngle = Math.sin(angle);
    _a.set(
      xcam.center.x + (xcam.off.x * cosAngle + xcam.off.z * sinAngle) * scale,
      xcam.center.y + xcam.off.y * scale,
      xcam.center.z + (-xcam.off.x * sinAngle + xcam.off.z * cosAngle) * scale,
    );
    if (heightField) {
      _a.y = Math.max(_a.y, heightField.getHeightAt(_a.x, _a.z) + 1.0);
    }
    _fitCam.position.copy(_a);
    _fitCam.lookAt(xcam.look);
    _fitCam.updateMatrixWorld(true);
  }

  function measureXrayFrame(
    corners: readonly THREE.Vector3[],
    xcam: XrayCamera,
    scale: number,
    endAngle: number,
  ): XrayFrameMeasure {
    let worst = 0;
    let midY = 0;
    for (let endpoint = 0; endpoint < 2; endpoint++) {
      positionXrayFitCamera(xcam, scale, endpoint === 0 ? 0 : endAngle);
      let lowY = Infinity;
      let highY = -Infinity;
      for (const corner of corners) {
        _proj.copy(corner).project(_fitCam);
        worst = Math.max(worst, Math.abs(_proj.x), Math.abs(_proj.y));
        lowY = Math.min(lowY, _proj.y);
        highY = Math.max(highY, _proj.y);
      }
      if (endpoint === 0) midY = (lowY + highY) / 2;
    }
    return { worst, midY };
  }

  /**
   * Screen-fit solve for the x-ray vantage (r7 critique: the live Abrams
   * x-ray cut the hull off the bottom/right frame edges). The fixed R×1.9
   * orbit radius has no idea how the hull's LONG diagonal projects when the
   * shell path runs nearly along the hull axis, and the terrain clamp can
   * shove the camera up after the framing was chosen. Projects the victim's
   * world bounding box through a scratch camera at the exact poses
   * updateXray() will use — both ends of the orbit drift — then iterates
   * orbit radius (distance) and look height (pitch) until every hull corner
   * sits inside the ~80% safe area with its midline near frame center.
   * Mutates xcam.off / xcam.pos / xcam.look in place; center is untouched
   * (the veil + ghost-shader uniforms key off it).
   */
  function fitXrayFrame(snap: ReplaySnapshot, xcam: XrayCamera): void {
    // Victim bbox from SNAPSHOT pose + spec dims — deliberately not
    // Box3.setFromObject(visual.root): the live visual carries helper nodes
    // (fx anchors, hidden LOD shells) that inflate the box and shoved the
    // solve into a wide empty frame on the staged probe. The oriented hull
    // box (yaw only — pitch/roll are degrees at rest) is what must read.
    const corners = xrayHullCorners(snap);
    _fitCam.fov = 42; // matches every rig.setExternalPose fov of the hold
    _fitCam.aspect = camera.aspect;
    _fitCam.updateProjectionMatrix();
    const SAFE = 0.8;                          // corners kept inside ±0.8 NDC
    const endAng = ORBIT_RAD_S * XRAY_HOLD_S;  // full drift of the hold
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(21));
    let scale = 1;
    for (let iter = 0; iter < 12; iter++) {
      const { worst, midY } = measureXrayFrame(corners, xcam, scale, endAng);
      const centered = Math.abs(midY) <= 0.3;
      if (worst <= SAFE && worst >= SAFE * 0.72 && centered) break;
      if (worst <= SAFE && centered && scale <= 1) break; // artistic vantage already fits
      // pitch: steer the look height so the hull's projected midline sits
      // near frame center — a terrain-raised camera otherwise dumps the
      // hull off the bottom edge however far the orbit backs off
      if (!centered) {
        xcam.look.y += THREE.MathUtils.clamp(midY, -0.5, 0.5)
          * tanHalf * xcam.off.length() * scale;
      }
      // distance: track worst -> SAFE in BOTH directions (never closer than
      // the artistic default) — a grow-only step ratcheted on early
      // iterations while the pitch was still settling and locked the staged
      // Tiger into a wide empty frame
      scale = Math.max(1, scale * THREE.MathUtils.clamp(worst / SAFE, 0.72, 1.6));
    }
    if (scale !== 1) xcam.off.multiplyScalar(scale);
    xcam.pos.copy(xcam.center).add(xcam.off);
    if (heightField) {
      const minY = heightField.getHeightAt(xcam.pos.x, xcam.pos.z) + 1.0;
      if (xcam.pos.y < minY) xcam.pos.y = minY;
    }
  }

  function prepareXrayPlaybackState(): void {
    beginCameraHandoff();
    if (pb.replayKind === 'collision') prepareCollisionAnalysis();
    pb.phase = 'xray';
    pb.xt = 0;
    pb.impactVis = null!;
    pb.wreck = null;
    restageIntact();
    hideFx();
    pb.xrayHoldS = THREE.MathUtils.clamp(
      REPLAY_BUDGET_S - (pb.finalePending ? FINALE_RESERVE_S : 0)
        - (performance.now() - lastBeginWallMs) / 1000,
      pb.finalePending ? FINALE_XRAY_FLOOR_S : 4.0,
      XRAY_HOLD_S,
    );
  }

  function xrayRadiusScale(): number {
    const radius = pb.xcam?.off ? pb.xcam.off.length() : 8.5;
    return THREE.MathUtils.clamp(radius / 8.5, 0.8, 1.5);
  }

  function retireFlightDressing(): void {
    if (!pb.core) return;
    pb.group.remove(pb.core, pb.streak, pb.halo, pb.tail);
    pb.shellLight.intensity = 0;
    pb.muzzleLight.intensity = 0;
    pb.core = pb.streak = pb.halo = pb.tail = pb.shellLight = pb.muzzleLight = null!;
  }

  function xrayTrailStart(): number {
    let start = 0;
    const keepFrom = pb.total - 60;
    while (start < pb.pts.length - 2 && pb.cum[start + 1] < keepFrom) start++;
    if (!heightField) return start;
    for (let index = start; index < pb.pts.length - 3; index++) {
      const point = pb.pts[index];
      if (point.y < heightField.getHeightAt(point.x, point.z) + 0.6) {
        start = index + 1;
      }
    }
    return start;
  }

  function fadeXrayTrail(start: number): void {
    const colors = pb.trailGeo.getAttribute('color');
    if (!colors) return;
    const startDistance = pb.cum[start];
    const span = Math.max(1e-3, pb.total - startDistance);
    for (let index = 0; index < pb.pts.length; index++) {
      const fraction = THREE.MathUtils.clamp(
        (pb.cum[index] - startDistance) / span,
        0,
        1,
      );
      const value = fraction * fraction;
      colors.setXYZ(index, value, value, value);
    }
    colors.needsUpdate = true;
  }

  function addXrayTrailRibbon(start: number, radiusScale: number): void {
    const ribbonLength = 26;
    let ribbonStart = start;
    const ribbonFrom = pb.total - ribbonLength;
    while (ribbonStart < pb.pts.length - 2
        && pb.cum[ribbonStart + 1] < ribbonFrom) ribbonStart++;
    for (let index = ribbonStart; index < pb.pts.length - 1; index++) {
      const fraction = THREE.MathUtils.clamp(
        (pb.cum[index] - ribbonFrom) / ribbonLength,
        0,
        1,
      );
      tube(
        pb.pts[index],
        pb.pts[index + 1],
        (0.017 + 0.034 * fraction) * radiusScale,
        fraction > 0.5 ? S.trailGlow : S.trailGlowFar,
        pb.group,
        pb.disposables,
      );
      tube(
        pb.pts[index],
        pb.pts[index + 1],
        (0.008 + 0.011 * fraction) * radiusScale,
        fraction > 0.5 ? S.trailCore : S.trailCoreFar,
        pb.group,
        pb.disposables,
      );
    }
  }

  function dressXrayTrail(radiusScale: number): void {
    if (!pb.trailGeo || !pb.cum || !pb.pts) return;
    const start = xrayTrailStart();
    pb.trailGeo.setDrawRange(start, pb.pts.length - start);
    fadeXrayTrail(start);
    addXrayTrailRibbon(start, radiusScale);
  }

  function applyXrayGhost(snap: ReplaySnapshot): KillcamVisual {
    const visual = snap.targetEnt.visual;
    if (visual.setVisible) visual.setVisible(true);
    const backup: Array<[THREE.Mesh, THREE.Material | THREE.Material[], number, boolean]> = [];
    const seen = new WeakSet<THREE.Mesh>();
    pb.ghostBackup = backup;
    pb.ghostSeen = seen;
    pb.ghostVis = visual;
    pb.ghostSkin = () => {
      visual.root.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh || mesh.material === S.ghost || seen.has(mesh)) return;
        seen.add(mesh);
        backup.push([mesh, mesh.material, mesh.renderOrder, mesh.castShadow]);
        if (!isKillcamGhostSurface(mesh)) {
          mesh.castShadow = false;
          return;
        }
        mesh.material = S.ghost;
        mesh.renderOrder = 11;
        mesh.castShadow = false;
      });
    };
    pb.ghostSkin();
    pb.group.renderOrder = 12;
    S.ghostCenter.value.copy(pb.xcam.center);
    S.ghostRad.value = Math.max(2, snap.boundingRadiusM || 4);
    return visual;
  }

  function configureXrayGhostBands(
    snap: ReplaySnapshot,
    armor: KillcamArmor,
    pose: ReplayPose,
  ): void {
    const height = Math.max(1.4, snap.heightM || 2.4);
    S.ghostRingY.value = pose.pos[1]
      + (armor.turretPivot ? armor.turretPivot[1] : height * 0.62);
    let gearTop = 0;
    for (const module of armor.modules || []) {
      if (module.module === 'trackL' || module.module === 'trackR') {
        gearTop = Math.max(gearTop, module.max[1]);
      }
    }
    S.ghostGearY.value = pose.pos[1] + (gearTop > 0 ? gearTop : height * 0.3);
  }

  function dimXrayBackdrop(snap: ReplaySnapshot): void {
    hideReplayVegetation();
    pb.dimmedLights = [];
    scene.traverse((object) => {
      const isBackdropLight = object instanceof THREE.DirectionalLight
        || object instanceof THREE.HemisphereLight;
      if (!isBackdropLight || object.intensity <= 0) return;
      pb.dimmedLights!.push([object, object.intensity]);
      object.intensity *= object instanceof THREE.HemisphereLight ? 0.42 : 0.30;
    });
    kcLights[0].distance = Math.max(10, snap.boundingRadiusM * 2.4);
  }

  function createXrayPoseGroups(
    pose: ReplayPose,
    armor: KillcamArmor,
  ): XrayPoseGroups {
    const poseGroup = new THREE.Group();
    poseGroup.renderOrder = 12;
    poseGroup.rotation.order = 'YXZ';
    poseGroup.position.set(pose.pos[0], pose.pos[1], pose.pos[2]);
    poseGroup.rotation.set(-pose.pitch, pose.yaw, pose.roll);
    const turretGroup = new THREE.Group();
    turretGroup.renderOrder = 12;
    turretGroup.position.set(
      armor.turretPivot[0],
      armor.turretPivot[1],
      armor.turretPivot[2],
    );
    turretGroup.rotation.y = pose.turretYaw;
    poseGroup.add(turretGroup);
    pb.group.add(poseGroup);
    return { pose: poseGroup, turret: turretGroup };
  }

  function createXrayBuildContext(radiusScale: number): XrayBuildContext {
    const snap = pb.snap;
    const groups = createXrayPoseGroups(snap.pose, snap.armor);
    const moduleHits = new Map<string, ModuleStateName>();
    for (const hit of snap.ev.modulesHit) moduleHits.set(hit.module, hit.newState);
    return {
      snap,
      event: snap.ev,
      armor: snap.armor,
      vehiclePose: snap.pose,
      pose: groups.pose,
      turret: groups.turret,
      moduleHits,
      crewHits: new Set(snap.ev.crewHit),
      anchors: new Map<string, THREE.Object3D>(),
      radiusScale,
    };
  }

  function xrayModuleState(context: XrayBuildContext, name: string): ModuleStateName {
    const state = context.snap.moduleStates?.[name] || context.moduleHits.get(name);
    return state === 'red' || state === 'yellow' ? state : 'ok';
  }

  function xrayBoxCorners(box: KillcamBox): THREE.Vector3[] {
    const corners: THREE.Vector3[] = [];
    for (let index = 0; index < 8; index++) {
      corners.push(new THREE.Vector3(
        index & 1 ? box.max[0] : box.min[0],
        index & 2 ? box.max[1] : box.min[1],
        index & 4 ? box.max[2] : box.min[2],
      ));
    }
    return corners;
  }

  function addXrayBoxTrackSlats(
    box: KillcamBox,
    size: THREE.Vector3,
    center: THREE.Vector3,
    material: THREE.MeshBasicMaterial,
    parent: THREE.Object3D,
  ): void {
    const count = Math.max(5, Math.min(12, Math.round(size.z / 0.55)));
    const length = (size.z / count) * 0.62;
    const geometry = new THREE.BoxGeometry(size.x * 0.96, size.y * 0.9, length);
    pb.disposables.push(geometry);
    for (let index = 0; index < count; index++) {
      const slat = new THREE.Mesh(geometry, material);
      slat.position.set(
        center.x,
        center.y,
        box.min[2] + (index + 0.5) * (size.z / count),
      );
      parent.add(slat);
    }
  }

  function addXrayBox(
    context: XrayBuildContext,
    box: KillcamBox,
    key: string | null,
    material: THREE.LineBasicMaterial,
    fillMaterial: THREE.MeshBasicMaterial | null,
  ): void {
    const size = new THREE.Vector3(
      box.max[0] - box.min[0],
      box.max[1] - box.min[1],
      box.max[2] - box.min[2],
    );
    const boxGeometry = new THREE.BoxGeometry(size.x, size.y, size.z);
    const edges = new THREE.EdgesGeometry(boxGeometry);
    pb.disposables.push(boxGeometry, edges);
    const segment = new THREE.LineSegments(edges, material);
    segment.position.set(
      (box.min[0] + box.max[0]) / 2,
      (box.min[1] + box.max[1]) / 2,
      (box.min[2] + box.max[2]) / 2,
    );
    const parent = box.turretLocal ? context.turret : context.pose;
    parent.add(segment);
    if (material === S.edgeDim) segment.visible = false;
    if (fillMaterial && (key === 'm:trackL' || key === 'm:trackR')) {
      addXrayBoxTrackSlats(box, size, segment.position, fillMaterial, parent);
    } else if (fillMaterial) {
      const fill = new THREE.Mesh(boxGeometry, fillMaterial);
      fill.position.copy(segment.position);
      parent.add(fill);
    }
    pb.obstacles.push({ parent, corners: xrayBoxCorners(box), key });
    if (key && !context.anchors.has(key)) context.anchors.set(key, segment);
  }

  function trackPrismBounds(shapes: readonly TrackShape[]): TrackPrismBounds {
    const min: Vec3Tuple = [Infinity, Infinity, Infinity];
    const max: Vec3Tuple = [-Infinity, -Infinity, -Infinity];
    for (const shape of shapes) {
      for (const point of shape.poly) {
        min[0] = Math.min(min[0], shape.x0, shape.x1);
        max[0] = Math.max(max[0], shape.x0, shape.x1);
        min[1] = Math.min(min[1], point[1]);
        max[1] = Math.max(max[1], point[1]);
        min[2] = Math.min(min[2], point[0]);
        max[2] = Math.max(max[2], point[0]);
      }
    }
    return {
      min,
      max,
      center: [
        (min[0] + max[0]) / 2,
        (min[1] + max[1]) / 2,
        (min[2] + max[2]) / 2,
      ],
    };
  }

  function trackPrismLinePositions(
    shape: TrackShape,
    center: Vec3Tuple,
  ): number[] {
    const positions: number[] = [];
    const push = (x: number, point: readonly [number, number]): void => {
      positions.push(x - center[0], point[1] - center[1], point[0] - center[2]);
    };
    for (let index = 0; index < shape.poly.length; index++) {
      const point = shape.poly[index];
      const next = shape.poly[(index + 1) % shape.poly.length];
      push(shape.x0, point);
      push(shape.x0, next);
      push(shape.x1, point);
      push(shape.x1, next);
      push(shape.x0, point);
      push(shape.x1, point);
    }
    return positions;
  }

  function addXrayTrackSegmentSlats(
    shape: TrackShape,
    center: Vec3Tuple,
    material: THREE.MeshBasicMaterial,
    group: THREE.Group,
    index: number,
  ): void {
    const point = shape.poly[index];
    const next = shape.poly[(index + 1) % shape.poly.length];
    const deltaZ = next[0] - point[0];
    const deltaY = next[1] - point[1];
    const length = Math.hypot(deltaZ, deltaY);
    if (length < 0.12) return;
    const count = Math.max(1, Math.min(14, Math.round(length / 0.55)));
    const geometry = new THREE.BoxGeometry(
      Math.abs(shape.x1 - shape.x0) * 0.96,
      0.17,
      (length / count) * 0.62,
    );
    pb.disposables.push(geometry);
    const tangentZ = deltaZ / length;
    const tangentY = deltaY / length;
    for (let slatIndex = 0; slatIndex < count; slatIndex++) {
      const distance = (slatIndex + 0.5) * (length / count);
      const slat = new THREE.Mesh(geometry, material);
      slat.position.set(
        (shape.x0 + shape.x1) / 2 - center[0],
        point[1] + tangentY * distance + tangentZ * 0.085 - center[1],
        point[0] + tangentZ * distance - tangentY * 0.085 - center[2],
      );
      slat.rotation.x = Math.atan2(-tangentY, tangentZ);
      group.add(slat);
    }
  }

  function addXrayTrackTreadSlats(
    shape: TrackShape,
    center: Vec3Tuple,
    material: THREE.MeshBasicMaterial,
    group: THREE.Group,
  ): void {
    for (let index = 0; index < shape.poly.length; index++) {
      addXrayTrackSegmentSlats(shape, center, material, group, index);
    }
  }

  function addXrayTrackPrism(
    context: XrayBuildContext,
    shapes: TrackShape[],
    key: string,
    material: THREE.LineBasicMaterial,
    fillMaterial: THREE.MeshBasicMaterial | null,
  ): void {
    const bounds = trackPrismBounds(shapes);
    const group = new THREE.Group();
    group.renderOrder = 12;
    group.position.set(...bounds.center);
    for (const shape of shapes) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(
        trackPrismLinePositions(shape, bounds.center),
        3,
      ));
      pb.disposables.push(geometry);
      group.add(new THREE.LineSegments(geometry, material));
      if (fillMaterial) addXrayTrackTreadSlats(shape, bounds.center, fillMaterial, group);
    }
    context.pose.add(group);
    if (material === S.edgeDim) group.visible = false;
    pb.obstacles.push({
      parent: context.pose,
      corners: xrayBoxCorners({ ...bounds, turretLocal: false }),
      key,
    });
    if (!context.anchors.has(key)) context.anchors.set(key, group);
  }

  function xrayTrackShapes(context: XrayBuildContext, name: string): TrackShape[] | null {
    const shapes = (context.armor.trackShapes || [])
      .filter((shape) => shape.module === name);
    return shapes.length ? shapes : null;
  }

  function addXrayModuleFrame(
    context: XrayBuildContext,
    module: KillcamModuleBox,
  ): void {
    const state = xrayModuleState(context, module.module);
    const material = state === 'red'
      ? S.edgeRed
      : state === 'yellow' ? S.edgeYellow : S.edgeDim;
    const fill = state === 'red'
      ? S.fillRed
      : state === 'yellow' ? S.fillYellow : null;
    const key = `m:${module.module}`;
    const prism = module.module === 'trackL' || module.module === 'trackR'
      ? xrayTrackShapes(context, module.module)
      : null;
    if (prism) {
      addXrayTrackPrism(context, prism, key, material, fill);
      return;
    }
    const parts = module.parts?.length ? module.parts : [module];
    for (const part of parts) {
      addXrayBox(context, { ...module, min: part.min, max: part.max }, key, material, fill);
    }
  }

  function addXrayArmorFrames(context: XrayBuildContext): void {
    pb.obstacles = [];
    for (const module of context.armor.modules || []) addXrayModuleFrame(context, module);
    for (const crew of context.armor.crew || []) {
      const hit = context.crewHits.has(crew.crew);
      addXrayBox(
        context,
        crew,
        `c:${crew.crew}`,
        hit ? S.edgeCrew : S.edgeDim,
        hit ? S.fillCrew : null,
      );
    }
  }

  function clampXrayBox<T extends KillcamBox>(
    context: XrayBuildContext,
    box: T,
  ): T {
    const dimensions = context.snap.targetEnt?.spec?.dims;
    if (!dimensions || box.turretLocal) return box;
    const halfWidth = dimensions.widthM / 2 + 0.03;
    const halfLength = (dimensions.hullLengthM || dimensions.overallLengthM * 0.8) / 2 + 0.08;
    const min: Vec3Tuple = [
      Math.max(box.min[0], -halfWidth),
      Math.max(box.min[1], -0.05),
      Math.max(box.min[2], -halfLength),
    ];
    const max: Vec3Tuple = [
      Math.min(box.max[0], halfWidth),
      Math.min(box.max[1], dimensions.heightM + 0.05),
      Math.min(box.max[2], halfLength),
    ];
    const empty = min[0] >= max[0] || min[1] >= max[1] || min[2] >= max[2];
    return empty ? box : { ...box, min, max };
  }

  function xrayVictimCaliber(context: XrayBuildContext): number {
    try {
      return context.snap.targetEnt.spec.gun.shells[0]?.caliberMm || 0;
    } catch (_) {
      return 0;
    }
  }

  function addXrayModuleInternals(
    context: XrayBuildContext,
    era: string,
    caliberMm: number,
  ): void {
    for (const module of context.armor.modules || []) {
      const parts = module.parts?.length ? module.parts : [module];
      for (const part of parts) {
        addInternalModuleModel(
          clampXrayBox(context, { ...module, min: part.min, max: part.max }),
          proxMatForState(xrayModuleState(context, module.module)),
          context.pose,
          context.turret,
          pb.disposables,
          era,
          caliberMm,
          S.proxSteel,
          context.armor,
        );
      }
    }
  }

  function addXrayCrewInternals(context: XrayBuildContext): void {
    const corpse = !!context.event.destroyed
      || pb.kind === 'death'
      || pb.kind === 'victory';
    const crewAlive = context.snap.crewAlive;
    for (const crew of context.armor.crew || []) {
      const down = context.crewHits.has(crew.crew)
        || crewAlive?.[crew.crew] === false;
      const material = down
        ? S.proxRed
        : corpse ? S.proxGrey : S.proxGreen;
      addInternalCrewModel(
        crew,
        material,
        context.pose,
        context.turret,
        pb.disposables,
        context.armor,
      );
    }
  }

  function addXrayInternals(context: XrayBuildContext): void {
    const era = context.snap.targetEnt?.spec?.era || '';
    addXrayModuleInternals(context, era, xrayVictimCaliber(context));
    addInternalDrivetrainModel(
      context.armor,
      context.pose,
      pb.disposables,
      S.proxSteel,
    );
    addXrayCrewInternals(context);
  }

  function xrayBoxCenter(
    context: XrayBuildContext,
    box: KillcamBox,
    output: THREE.Vector3,
  ): THREE.Vector3 {
    const x = (box.min[0] + box.max[0]) / 2;
    const y = (box.min[1] + box.max[1]) / 2;
    const z = (box.min[2] + box.max[2]) / 2;
    if (!box.turretLocal) return output.set(x, y, z);
    const yaw = context.vehiclePose.turretYaw || 0;
    const cosine = Math.cos(yaw);
    const sine = Math.sin(yaw);
    return output.set(
      x * cosine + z * sine + context.armor.turretPivot[0],
      y + context.armor.turretPivot[1],
      -x * sine + z * cosine + context.armor.turretPivot[2],
    );
  }

  function xrayDamageDepth(
    context: XrayBuildContext,
    entry: THREE.Vector3,
    direction: THREE.Vector3,
  ): number {
    let deepest = 0;
    const depthOf = (box: KillcamBox): number =>
      xrayBoxCenter(context, box, _a).sub(entry).dot(direction);
    for (const hit of context.event.modulesHit) {
      const box = context.armor.modules.find((module) => module.module === hit.module);
      if (box) deepest = Math.max(deepest, depthOf(box));
    }
    for (const crewId of context.event.crewHit) {
      const box = context.armor.crew.find((crew) => crew.crew === crewId);
      if (box) deepest = Math.max(deepest, depthOf(box));
    }
    return deepest;
  }

  function xrayNearMissRecord(
    context: XrayBuildContext,
    box: KillcamBox,
    key: string,
    label: string,
    entry: THREE.Vector3,
    direction: THREE.Vector3,
    innerLength: number,
  ): NearMissRecord | null {
    xrayBoxCenter(context, box, _a).sub(entry);
    const along = _a.dot(direction);
    if (along < 0.12 || along > innerLength + 0.3) return null;
    _b.copy(direction).multiplyScalar(along);
    const radial = _a.sub(_b).length();
    const halfExtent = (
      box.max[0] - box.min[0]
      + box.max[1] - box.min[1]
      + box.max[2] - box.min[2]
    ) / 6;
    const score = radial - halfExtent;
    return score < along * 0.26 + 0.12 ? { key, label, score } : null;
  }

  function collectXrayModuleNearMisses(
    context: XrayBuildContext,
    entry: THREE.Vector3,
    direction: THREE.Vector3,
    innerLength: number,
    output: NearMissRecord[],
  ): void {
    for (const module of context.armor.modules || []) {
      const external = module.module === 'trackL'
        || module.module === 'trackR'
        || module.module === 'turretRing';
      if (external || context.moduleHits.has(module.module)) continue;
      const record = xrayNearMissRecord(
        context,
        module,
        `m:${module.module}`,
        KC_MODULE_LABELS[module.module] || module.module,
        entry,
        direction,
        innerLength,
      );
      if (record) output.push(record);
    }
  }

  function collectXrayCrewNearMisses(
    context: XrayBuildContext,
    entry: THREE.Vector3,
    direction: THREE.Vector3,
    innerLength: number,
    output: NearMissRecord[],
  ): void {
    for (const crew of context.armor.crew || []) {
      if (context.crewHits.has(crew.crew)
          || context.snap.crewAlive?.[crew.crew] === false) continue;
      const record = xrayNearMissRecord(
        context,
        crew,
        `c:${crew.crew}`,
        KC_CREW_LABELS[crew.crew] || crew.crew,
        entry,
        direction,
        innerLength,
      );
      if (record) output.push(record);
    }
  }

  function collectXrayNearMisses(
    context: XrayBuildContext,
    entry: THREE.Vector3,
    direction: THREE.Vector3,
    innerLength: number,
  ): NearMissRecord[] {
    if (context.event.kind !== 'pen' && context.event.kind !== 'he_pen') return [];
    const records: NearMissRecord[] = [];
    collectXrayModuleNearMisses(context, entry, direction, innerLength, records);
    collectXrayCrewNearMisses(context, entry, direction, innerLength, records);
    records.sort((left, right) => left.score - right.score);
    const casualtyCount = context.event.modulesHit.length + context.event.crewHit.length;
    records.length = Math.min(records.length, casualtyCount >= 3 ? 2 : 3);
    return records;
  }

  function xrayApproachLength(
    context: XrayBuildContext,
    entry: THREE.Vector3,
    direction: THREE.Vector3,
  ): number {
    if (!heightField) return 5.2;
    context.pose.updateMatrixWorld(true);
    const worldEntry = context.pose.localToWorld(entry.clone());
    const worldDirection = direction.clone().transformDirection(context.pose.matrixWorld);
    let length = 5.2;
    for (; length > 1.6; length -= 0.4) {
      const x = worldEntry.x - worldDirection.x * length;
      const y = worldEntry.y - worldDirection.y * length;
      const z = worldEntry.z - worldDirection.z * length;
      if (y > heightField.getHeightAt(x, z) + 0.7) break;
    }
    return length;
  }

  function addXrayExternalApproach(
    context: XrayBuildContext,
    entry: THREE.Vector3,
    direction: THREE.Vector3,
  ): void {
    const length = xrayApproachLength(context, entry, direction);
    const start = new THREE.Vector3();
    const end = new THREE.Vector3();
    const segments = 4;
    for (let index = 0; index < segments; index++) {
      const startFraction = index / segments;
      const endFraction = (index + 1) / segments;
      start.copy(entry).addScaledVector(direction, -length * (1 - startFraction));
      end.copy(entry).addScaledVector(direction, -length * (1 - endFraction));
      const midpoint = (startFraction + endFraction) / 2;
      const far = midpoint < 0.55;
      tube(
        start,
        end,
        (0.009 + 0.026 * midpoint) * context.radiusScale,
        far ? S.trailGlowFar : S.trailGlow,
        context.pose,
        pb.disposables,
      );
      tube(
        start,
        end,
        (0.004 + 0.012 * midpoint) * context.radiusScale,
        far ? S.trailCoreFar : S.pathOut,
        context.pose,
        pb.disposables,
      );
    }
  }

  function addXrayDartLayer(
    context: XrayBuildContext,
    entry: THREE.Vector3,
    direction: THREE.Vector3,
    innerLength: number,
    startRadius: number,
    endRadius: number,
    material: THREE.Material,
  ): void {
    const geometry = new THREE.CylinderGeometry(
      endRadius,
      startRadius,
      innerLength,
      8,
      1,
      true,
    );
    pb.disposables.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(entry).addScaledVector(direction, innerLength * 0.5);
    mesh.quaternion.setFromUnitVectors(_Y, direction);
    context.pose.add(mesh);
  }

  function addXrayInternalDart(
    context: XrayBuildContext,
    entry: THREE.Vector3,
    direction: THREE.Vector3,
    innerLength: number,
  ): void {
    addXrayDartLayer(
      context, entry, direction, innerLength,
      0.048 * context.radiusScale, 0.024 * context.radiusScale, S.pathIn,
    );
    addXrayDartLayer(
      context, entry, direction, innerLength,
      0.021 * context.radiusScale, 0.01 * context.radiusScale, S.pathCore,
    );
    _b.copy(entry).addScaledVector(direction, innerLength);
    const geometry = new THREE.ConeGeometry(0.024 * context.radiusScale, 0.16 * context.radiusScale, 8);
    pb.disposables.push(geometry);
    const tip = new THREE.Mesh(geometry, S.pathCore);
    tip.position.copy(_b).addScaledVector(direction, 0.08 * context.radiusScale);
    tip.quaternion.setFromUnitVectors(_Y, direction);
    context.pose.add(tip);
  }

  function addXraySpallCone(
    context: XrayBuildContext,
    entry: THREE.Vector3,
    direction: THREE.Vector3,
    innerLength: number,
  ): void {
    const length = innerLength * 0.8;
    const geometry = new THREE.ConeGeometry(length * 0.24, length, 14, 1, true);
    pb.disposables.push(geometry);
    const cone = new THREE.Mesh(geometry, S.spall);
    cone.position.copy(entry).addScaledVector(direction, length * 0.5);
    cone.quaternion.setFromUnitVectors(_Y, _s.copy(direction).negate());
    context.pose.add(cone);
  }

  function addXrayAmbientSpall(
    context: XrayBuildContext,
    entry: THREE.Vector3,
    direction: THREE.Vector3,
    innerLength: number,
  ): void {
    const side = new THREE.Vector3().crossVectors(direction, UP);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    else side.normalize();
    const normal = new THREE.Vector3().crossVectors(direction, side);
    for (let index = 0; index < 6; index++) {
      const azimuth = (index / 6) * Math.PI * 2 + 0.45;
      const spread = 0.15 + 0.12 * (((index * 37) % 5) / 4);
      const length = innerLength * (0.28 + 0.34 * (((index * 53) % 7) / 6));
      _a.copy(direction)
        .addScaledVector(side, Math.cos(azimuth) * spread)
        .addScaledVector(normal, Math.sin(azimuth) * spread)
        .normalize();
      _b.copy(entry).addScaledVector(_a, length);
      tube(entry, _b, 0.018, S.frag, context.pose, pb.disposables);
    }
  }

  function addXrayFragmentSpark(
    context: XrayBuildContext,
    position: THREE.Vector3,
    material: THREE.Material,
  ): void {
    const geometry = new THREE.SphereGeometry(0.075, 8, 6);
    pb.disposables.push(geometry);
    const spark = new THREE.Mesh(geometry, material);
    spark.position.copy(position);
    context.pose.add(spark);
  }

  function addXrayFragmentsToBox(
    context: XrayBuildContext,
    entry: THREE.Vector3,
    box: KillcamBox,
    material: THREE.Material,
    count: number,
    radius: number,
    spark: boolean,
  ): void {
    const center = xrayBoxCenter(context, box, new THREE.Vector3());
    const length = Math.max(0.5, center.distanceTo(entry));
    const direction = center.clone().sub(entry).multiplyScalar(1 / length);
    const side = new THREE.Vector3().crossVectors(direction, UP);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    else side.normalize();
    const normal = new THREE.Vector3().crossVectors(direction, side);
    const endpoint = new THREE.Vector3();
    for (let index = 0; index < count; index++) {
      const jitterSide = ((index * 73 + 31) % 17) / 16 - 0.5;
      const jitterNormal = ((index * 41 + 7) % 13) / 12 - 0.5;
      const rayLength = length * (0.86 + 0.3 * (((index * 53) % 5) / 4));
      endpoint.copy(direction)
        .addScaledVector(side, jitterSide * 0.24)
        .addScaledVector(normal, jitterNormal * 0.24)
        .normalize()
        .multiplyScalar(rayLength)
        .add(entry);
      tube(
        entry,
        endpoint,
        index === 0 ? radius * 1.35 : radius,
        material,
        context.pose,
        pb.disposables,
      );
    }
    if (spark) addXrayFragmentSpark(context, center, material);
  }

  function addXrayModuleDamageFragments(
    context: XrayBuildContext,
    entry: THREE.Vector3,
  ): void {
    for (const hit of context.event.modulesHit) {
      const box = context.armor.modules.find((module) => module.module === hit.module);
      if (!box) continue;
      const destroyed = hit.newState === 'red';
      const damaged = hit.newState === 'yellow';
      const material = destroyed ? S.fragRed : damaged ? S.fragYellow : S.frag;
      addXrayFragmentsToBox(
        context,
        entry,
        box,
        material,
        destroyed ? 4 : 3,
        destroyed ? 0.026 : 0.019,
        destroyed || damaged,
      );
    }
  }

  function addXrayCrewDamageFragments(
    context: XrayBuildContext,
    entry: THREE.Vector3,
  ): void {
    for (const crewId of context.event.crewHit) {
      const box = context.armor.crew.find((crew) => crew.crew === crewId);
      if (box) addXrayFragmentsToBox(context, entry, box, S.fragCrew, 3, 0.019, true);
    }
  }

  function addXrayEntryMarker(
    context: XrayBuildContext,
    entry: THREE.Vector3,
  ): void {
    const geometry = new THREE.SphereGeometry(0.05 * context.radiusScale, 10, 8);
    pb.disposables.push(geometry);
    const marker = new THREE.Mesh(geometry, S.marker);
    marker.position.copy(entry);
    context.pose.add(marker);
  }

  function addXrayShellEvidence(context: XrayBuildContext): NearMissRecord[] {
    const localPosition = context.event.localPos;
    const localDirection = context.event.localDir;
    if (!localPosition || !localDirection) return [];
    const entry = new THREE.Vector3().fromArray(localPosition);
    const direction = new THREE.Vector3().fromArray(localDirection).normalize();
    const deepest = xrayDamageDepth(context, entry, direction);
    const innerLength = Math.max(
      1.2,
      (context.event.caliberMm || 100) * 10 / 1000 + 0.6,
      deepest + 0.35,
    );
    const nearMisses = collectXrayNearMisses(context, entry, direction, innerLength);
    addXrayExternalApproach(context, entry, direction);
    addXrayInternalDart(context, entry, direction, innerLength);
    addXraySpallCone(context, entry, direction, innerLength);
    addXrayAmbientSpall(context, entry, direction, innerLength);
    addXrayModuleDamageFragments(context, entry);
    addXrayCrewDamageFragments(context, entry);
    addXrayEntryMarker(context, entry);
    return nearMisses;
  }

  function finalizeXrayObstacles(context: XrayBuildContext): void {
    context.pose.updateMatrixWorld(true);
    for (const obstacle of pb.obstacles) {
      if (obstacle.parent) {
        for (const corner of obstacle.corners) obstacle.parent.localToWorld(corner);
      }
      obstacle.parent = null;
    }
  }

  function appendKillerStat(
    d: KillcamDom,
    key: string,
    value: string,
    className: string,
    iconId: string,
  ): void {
    const row = el('div', `kv${className ? ` ${className}` : ''}`, d.killer.rows);
    const label = el('span', '', row);
    label.innerHTML = `${uiIconSVG(iconId, 10)}<span>${key}</span>`;
    const output = el('b', '', row);
    output.textContent = value;
  }

  function populateCollisionKillerStats(d: KillcamDom, event: KillcamHitEvent): void {
    appendKillerStat(d, t('killcam.stat.cause'), t('killcam.hullCollision'), 'w', 'damage');
    appendKillerStat(
      d,
      t('killcam.stat.damage'),
      (event.damage || 0) > 0 ? `−${Math.round(event.damage || 0)}` : '0',
      'dmg',
      'damage',
    );
    appendKillerStat(
      d,
      t('killcam.stat.closingSpeed'),
      `${Math.round((event.closingMps || 0) * 3.6)} km/h`,
      '',
      'speed',
    );
  }

  function populateProjectileKillerStats(d: KillcamDom, event: KillcamHitEvent): void {
    const shellName = shellDisplayName(event);
    const shell = `${event.shellType || ''}${shellName ? ` ${shellName}` : ''}`.trim() || '—';
    appendKillerStat(d, t('killcam.stat.shell'), shell, 'w', 'shell');
    appendKillerStat(
      d,
      t('killcam.stat.damage'),
      (event.damage || 0) > 0 ? `−${Math.round(event.damage || 0)}` : '0',
      'dmg',
      'damage',
    );
    appendKillerStat(
      d,
      'Distance',
      `${Math.round(event.flightDistM || 0)} m`,
      '',
      'scope',
    );
  }

  function populateKillerCard(d: KillcamDom, event: KillcamHitEvent): void {
    if (!pb.isDeathView) {
      d.killer.root.classList.remove('on', 'rv');
      return;
    }
    let vehicleSpec: FleetTankSpec | null = null;
    try {
      vehicleSpec = event.attackerSpecId ? getSpec(event.attackerSpecId) : null;
    } catch (_) {
      vehicleSpec = null;
    }
    const killerName = event.attackerName || vehicleSpec?.name || t('killcam.enemy');
    d.killer.name.textContent = killerName;
    const vehicleBits: string[] = [];
    const tier = event.attackerSpecId ? tierNumeral(event.attackerSpecId) : '';
    if (tier) vehicleBits.push(t('killcam.tier', { tier }));
    if (vehicleSpec && !killerName.toLowerCase().includes(vehicleSpec.name.toLowerCase())) {
      vehicleBits.push(vehicleSpec.name);
    }
    d.killer.veh.textContent = vehicleBits.join(' · ');
    d.killer.sil.style.backgroundImage = event.attackerSpecId
      ? `url(${iconUrl(event.attackerSpecId, 'side_silhouette')})`
      : 'none';
    d.killer.rows.textContent = '';
    if (pb.replayKind === 'collision') populateCollisionKillerStats(d, event);
    else populateProjectileKillerStats(d, event);
    d.killer.root.classList.add('on');
    if (staged) d.killer.root.classList.add('rv');
  }

  function pushXrayLabel(
    label: HTMLElement,
    world: THREE.Vector3,
    key: string | null,
    options: {
      dot?: HTMLElement | null;
      line?: SVGLineElement | null;
      big?: boolean;
      micro?: boolean;
    } = {},
  ): void {
    pb.labels.push({
      label,
      dot: options.dot || null,
      line: options.line || null,
      big: !!options.big,
      micro: options.micro,
      world: world.clone(),
      key,
      hidden: false,
      ax: 0,
      ay: 0,
      lw: 0,
      lh: 0,
      left: 0,
      top: 0,
      below: false,
      fixed: false,
    });
  }

  function addXrayLabel(
    d: KillcamDom,
    world: THREE.Vector3,
    color: string,
    main: string,
    sub: string,
    big = false,
    ok = false,
    key: string | null = null,
  ): void {
    const label = el(
      'div',
      big ? 'cot-kc-dmg' : `cot-kc-label${ok ? ' ok' : ''}`,
      d.labelHost,
    );
    if (big) {
      const icon = el('span', 'ico', label);
      icon.innerHTML = uiIconSVG('damage', 15);
      el('span', 'val', label).textContent = main;
      pushXrayLabel(label, world, key, { big: true });
      return;
    }
    label.style.color = color;
    const icon = el('span', 'ico', label);
    icon.innerHTML = uiIconSVG(killcamLabelIcon(key), 11);
    const copy = el('span', 'copy', label);
    el('span', 'main', copy).textContent = main;
    el('span', 's', copy).textContent = sub;
    const dot = el('div', `cot-kc-dot${ok ? ' ok' : ''}`, d.labelHost);
    dot.style.color = color;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', '1');
    line.setAttribute('opacity', ok ? '0.45' : '0.85');
    d.leader.appendChild(line);
    pushXrayLabel(label, world, key, { dot, line });
  }

  function addXrayMicroLabel(
    d: KillcamDom,
    world: THREE.Vector3,
    text: string,
    key: string,
  ): void {
    const label = el('div', 'cot-kc-micro', d.labelHost);
    const icon = el('span', 'ico', label);
    icon.innerHTML = uiIconSVG(killcamLabelIcon(key), 9);
    el('span', 'copy', label).textContent = text;
    pushXrayLabel(label, world, key, { micro: true });
  }

  function addXrayNearMissLabel(
    d: KillcamDom,
    world: THREE.Vector3,
    text: string,
    key: string,
  ): void {
    const label = el('div', 'cot-kc-label nm', d.labelHost);
    const icon = el('span', 'ico', label);
    icon.innerHTML = uiIconSVG(killcamLabelIcon(key), 9);
    const copy = el('span', 'copy', label);
    el('span', 'main', copy).textContent = text;
    el('span', 's', copy).textContent = t('killcam.nearMiss');
    pushXrayLabel(label, world, key, { micro: true });
  }

  const xrayModuleStateWords: Readonly<Record<ModuleStateName, string>> = {
    red: t('killcam.xray.destroyed'), yellow: t('killcam.xray.damaged'), ok: t('killcam.xray.hit'),
  };
  const xrayModuleStateColors: Readonly<Record<ModuleStateName, string>> = {
    red: '#ff5a4a', yellow: '#ffb43c', ok: '#8a97a3',
  };
  const xrayModuleStateRank: Readonly<Record<ModuleStateName, number>> = {
    ok: 0, yellow: 1, red: 2,
  };
  const xrayMicroLabels: Readonly<Record<string, string>> = {
    ammoRack: t('killcam.xray.ammo'), engine: t('killcam.xray.engine'), fuelTank: t('killcam.xray.fuel'),
  };

  function mergeXrayModuleHits(event: KillcamHitEvent): Map<string, ModuleHit> {
    const merged = new Map<string, ModuleHit>();
    for (const hit of event.modulesHit) {
      const previous = merged.get(hit.module);
      if (!previous) {
        merged.set(hit.module, { ...hit });
        continue;
      }
      if (xrayModuleStateRank[hit.newState] > xrayModuleStateRank[previous.newState]) {
        previous.newState = hit.newState;
      }
      if (typeof hit.dmg === 'number' && Number.isFinite(hit.dmg)) {
        const previousDamage = typeof previous.dmg === 'number' && Number.isFinite(previous.dmg)
          ? previous.dmg
          : 0;
        previous.dmg = previousDamage + hit.dmg;
      }
    }
    return merged;
  }

  function addXrayModuleLabels(d: KillcamDom, context: XrayBuildContext): void {
    for (const hit of mergeXrayModuleHits(context.event).values()) {
      const anchor = context.anchors.get(`m:${hit.module}`);
      if (!anchor) continue;
      anchor.getWorldPosition(_p);
      const damage = typeof hit.dmg === 'number' && Number.isFinite(hit.dmg)
        ? ` −${Math.round(hit.dmg)}`
        : '';
      const ok = hit.newState === 'ok';
      addXrayLabel(
        d,
        _p,
        xrayModuleStateColors[hit.newState],
        KC_MODULE_LABELS[hit.module] || hit.module,
        `${xrayModuleStateWords[hit.newState]}${damage}`,
        false,
        ok,
        `m:${hit.module}`,
      );
    }
  }

  function addXrayCrewLabels(d: KillcamDom, context: XrayBuildContext): void {
    for (const crewId of new Set(context.event.crewHit)) {
      const anchor = context.anchors.get(`c:${crewId}`);
      if (!anchor) continue;
      anchor.getWorldPosition(_p);
      addXrayLabel(
        d, _p, '#ff7d8a', KC_CREW_LABELS[crewId] || crewId,
        t('killcam.knockedOut'), false, false, `c:${crewId}`,
      );
    }
  }

  function addXrayEntryPlateLabel(d: KillcamDom, event: KillcamHitEvent): void {
    if (!event.zone || !event.localPos) return;
    const outcome = hitOutcomeFor(event);
    const thickness = (event.physicalMm || 0) > 0
      ? ` · ${Math.round(event.physicalMm || 0)} mm`
      : '';
    _p.set(...event.pos);
    addXrayLabel(
      d, _p, outcome.color, zoneLabel(event.zone),
      `${outcome.label}${thickness}`,
    );
  }

  function addXrayNearMissLabels(
    d: KillcamDom,
    context: XrayBuildContext,
    nearMisses: readonly NearMissRecord[],
  ): void {
    for (const nearMiss of nearMisses) {
      const anchor = context.anchors.get(nearMiss.key);
      if (!anchor) continue;
      anchor.getWorldPosition(_p);
      addXrayNearMissLabel(d, _p, nearMiss.label, nearMiss.key);
    }
  }

  function addXrayDamageLabel(d: KillcamDom, event: KillcamHitEvent): void {
    if ((event.damage || 0) <= 0) return;
    _p.set(...event.pos);
    addXrayLabel(d, _p, '', `−${Math.round(event.damage || 0)} HP`, '', true);
  }

  function addXrayMicroLabels(
    d: KillcamDom,
    context: XrayBuildContext,
    nearMisses: readonly NearMissRecord[],
  ): void {
    for (const [key, text] of Object.entries(xrayMicroLabels)) {
      if (context.moduleHits.has(key)
          || nearMisses.some((record) => record.key === `m:${key}`)) continue;
      const anchor = context.anchors.get(`m:${key}`);
      if (!anchor) continue;
      anchor.getWorldPosition(_p);
      addXrayMicroLabel(d, _p, text, `m:${key}`);
    }
  }

  function animateXrayLabels(event: KillcamHitEvent): void {
    _p.set(...event.pos);
    const ordered = pb.labels.slice().sort((left, right) => {
      if (!!left.micro !== !!right.micro) return left.micro ? 1 : -1;
      return left.world.distanceToSquared(_p) - right.world.distanceToSquared(_p);
    });
    ordered.forEach((label, index) => {
      const delay = `${Math.min(0.6, index * 0.1).toFixed(2)}s`;
      for (const node of [label.label, label.dot, label.line]) {
        if (!node) continue;
        node.classList.add('cot-kc-anim');
        node.style.animationDelay = delay;
      }
    });
  }

  function populateXrayLabels(
    context: XrayBuildContext,
    nearMisses: readonly NearMissRecord[],
  ): void {
    const d = ensureDom();
    d.root.classList.add('xr');
    d.labelHost.textContent = '';
    d.leader.textContent = '';
    populateKillerCard(d, context.event);
    pb.labels.length = 0;
    addXrayModuleLabels(d, context);
    addXrayCrewLabels(d, context);
    addXrayEntryPlateLabel(d, context.event);
    addXrayNearMissLabels(d, context, nearMisses);
    addXrayDamageLabel(d, context.event);
    addXrayMicroLabels(d, context, nearMisses);
    animateXrayLabels(context.event);
  }

  function beginXray() {
    if (pb.phase === 'xray') return;
    prepareXrayPlaybackState();
    // x-ray dressing thickness follows the SOLVED orbit radius (r5: fixed
    // radii read as a fat baton at the tight Tiger-class orbit): ~1 at an
    // 8.5 m orbit, floored/capped so huge and tiny victims both stay legible.
    const rQ = xrayRadiusScale();
    retireFlightDressing();
    dressXrayTrail(rQ);

    const context = createXrayBuildContext(rQ);
    const {
      snap,
      armor,
      vehiclePose: pose,
    } = context;

    applyXrayGhost(snap);
    configureXrayGhostBands(snap, armor, pose);

    dimXrayBackdrop(snap);

    // 1b. key light on the wreck: created in begin() for the whole replay
    // (flight included) — cool camera-side fill so the vehicle stays the
    // brightest element in frame; the world-space blackout billboard is GONE
    // (r4: read as a lighting bug). Scene focus comes only from the
    // screen-space DOM veil, centered on the victim in projectLabels().

    // 3. module + crew boxes (hit ones highlighted, rest faint).
    // State honesty (r3): box tint follows the POST-HIT module state from the
    // snapshot's combat roster (moduleStates) — a rack detonated by an
    // EARLIER shell must read red too, exactly like the proxies inside it.
    // This shell's own casualties (modulesHit) are the fallback for staged /
    // legacy snapshots that carry no roster.
    addXrayArmorFrames(context);
    // 3b. recognizable internals inside the boxes — ammo stowage (bustle /
    // carousel / WWII tray per spec layout + era), ribbed engine block, fuel
    // cell or drums, breech, crew capsules. Healthy modules wear distinct
    // per-kind hues (brass ammo, steel-blue engine, amber fuel); hit ones
    // override to yellow (damaged) / red (destroyed) state tints.
    addXrayInternals(context);
    const nearMiss = addXrayShellEvidence(context);
    finalizeXrayObstacles(context);
    populateXrayLabels(context, nearMiss);
    setReplayCamera(pb.xcam.pos, pb.xcam.look, 42, 0);
    projectLabels();
  }

  function projectXrayFocus(height: number): number {
    // screen-space focus veil: keep the radial dim centered on the VICTIM's
    // projected position every frame (a world-space blackout read as a
    // lighting bug — bright road stripe over crushed edges, r4 critique)
    if (!dom || !pb.xcam) return height * 0.5;
    _proj.copy(pb.xcam.center).project(camera);
    const xPercent = (_proj.x * 0.5 + 0.5) * 100;
    const yPercent = (-_proj.y * 0.5 + 0.5) * 100;
    dom.root.style.setProperty('--kcvx', `${xPercent.toFixed(1)}%`);
    dom.root.style.setProperty('--kcvy', `${yPercent.toFixed(1)}%`);
    return yPercent * 0.01 * height;
  }

  function projectObstacleRect(
    obstacle: ScreenObstacle,
    width: number,
    height: number,
  ): ScreenRect | null {
    const rect: ScreenRect = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const corner of obstacle.corners) {
      _proj.copy(corner).project(camera);
      if (_proj.z > 1) return null;
      const screenX = (_proj.x * 0.5 + 0.5) * width;
      const screenY = (-_proj.y * 0.5 + 0.5) * height;
      rect.x0 = Math.min(rect.x0, screenX);
      rect.x1 = Math.max(rect.x1, screenX);
      rect.y0 = Math.min(rect.y0, screenY);
      rect.y1 = Math.max(rect.y1, screenY);
    }
    return rect;
  }

  function screenRectArea(rect: ScreenRect): number {
    return (rect.x1 - rect.x0) * (rect.y1 - rect.y0);
  }

  function projectXrayObstacles(width: number, height: number): ProjectedObstacleLayout {
    // pass 0 (r4): project every module/crew box to a screen rect once —
    // these feed BOTH the repulsion pass (2b) and the per-key ANCHOR rects:
    // each chip's dot/leader snaps to the projected centroid of its OWN
    // module's rect instead of the box's 3D center point, whose projection
    // drifted onto neighbouring assemblies (the AMMO RACK chip's leader
    // ended near the turret ring while the orange bin sat mid-hull).
    const maxArea = 0.18 * width * height;
    const obstacles: ScreenRect[] = [];
    const anchors = new Map<string, ScreenRect>();
    for (const obstacle of pb.obstacles ?? []) {
      const rect = projectObstacleRect(obstacle, width, height);
      if (!rect) continue;
      const area = screenRectArea(rect);
      // Full-length track bands exceed the cap in both roles: undodgeable as
      // obstacles, and their rect centroid says nothing about the hit.
      if (obstacle.key && !anchors.has(obstacle.key) && area <= maxArea * 1.4) {
        anchors.set(obstacle.key, rect);
      }
      if (area <= maxArea) obstacles.push(rect);
    }
    return { obstacles, anchors };
  }

  function labelDesiredTop(label: KillcamLabel): number {
    if (label.big) return label.ay + 14;
    if (label.micro) return label.ay - label.lh / 2;
    return label.below ? label.ay + 26 : label.ay - 30 - label.lh;
  }

  function projectXrayLabel(
    label: KillcamLabel,
    width: number,
    height: number,
    victimCenterY: number,
    anchorRects: ReadonlyMap<string, ScreenRect>,
  ): void {
    _proj.copy(label.world).project(camera);
    label.hidden = _proj.z > 1;
    if (label.hidden) return;
    label.ax = (_proj.x * 0.5 + 0.5) * width;
    label.ay = (-_proj.y * 0.5 + 0.5) * height;
    const anchor = label.key ? anchorRects.get(label.key) : null;
    if (anchor) {
      label.ax = (anchor.x0 + anchor.x1) * 0.5;
      label.ay = (anchor.y0 + anchor.y1) * 0.5;
    }
    label.lw = label.label.offsetWidth || 60;
    label.lh = label.label.offsetHeight || 18;
    label.left = label.ax - label.lw * 0.5;
    label.below = !label.big && !label.micro && label.ay > victimCenterY + 6;
    label.top = labelDesiredTop(label);
  }

  function projectXrayLabelAnchors(
    width: number,
    height: number,
    victimCenterY: number,
    anchorRects: ReadonlyMap<string, ScreenRect>,
  ): void {
    // pass 1: project anchors, compute each chip's desired rect. r4 side
    // preference: chips whose module sits in the LOWER half of the victim
    // hang BELOW their dot — a mid-hull ammo bin's chip no longer floats
    // above the turret where it read as a turret-ammo callout.
    for (const label of pb.labels) {
      projectXrayLabel(label, width, height, victimCenterY, anchorRects);
    }
  }

  function layoutRectsOverlap(a: LayoutRect, b: LayoutRect, xGap: number, yGap: number): boolean {
    return a.left < b.left + b.lw + xGap
      && b.left < a.left + a.lw + xGap
      && a.top < b.top + b.lh + yGap
      && b.top < a.top + a.lh + yGap;
  }

  function xrayLayoutItems(): LayoutRect[] {
    const items: LayoutRect[] = [];
    for (const label of pb.labels) {
      if (label.hidden) continue;
      items.push(label);
      if (label.dot) {
        items.push({ left: label.ax - 6, top: label.ay - 6, lw: 12, lh: 12, fixed: true });
      }
    }
    return items.sort((left, right) => left.top - right.top);
  }

  function cascadeXrayLabel(item: LayoutRect, index: number, items: readonly LayoutRect[]): void {
    if (item.fixed) return;
    for (let sweep = 0; sweep < 2; sweep++) {
      for (let otherIndex = 0; otherIndex < items.length; otherIndex++) {
        if (otherIndex === index) continue;
        const other = items[otherIndex];
        if (!other.fixed && otherIndex > index) continue;
        if (layoutRectsOverlap(item, other, 6, 4)) item.top = other.top + other.lh + 4;
      }
    }
  }

  function separateInitialXrayRows(): void {
    // pass 2: vertical deconfliction — when projected rects overlap, cascade
    // the later chip below the earlier one with a 4px gap. Anchor DOTS join
    // as immovable obstacles so the big damage numeral can never sit on a
    // module's leader-dot cluster (r7: −519 HP muddied TRACK R's dot right
    // at the penetration point); a second sweep settles cascades that land
    // a chip on a dot further down.
    const items = xrayLayoutItems();
    items.forEach((item, index) => cascadeXrayLabel(item, index, items));
  }

  function labelOverlapsScreenRect(label: KillcamLabel, rect: ScreenRect): boolean {
    return label.left < rect.x1 + 4
      && rect.x0 < label.left + label.lw + 4
      && label.top < rect.y1 + 3
      && rect.y0 < label.top + label.lh + 3;
  }

  function repelXrayLabelFromGeometry(label: KillcamLabel, obstacles: readonly ScreenRect[]): void {
    if (label.hidden || label.micro || label.big) return;
    const minTop = label.ay - 30 - label.lh - 130;
    const maxTop = label.ay + 26 + 130;
    for (const rect of obstacles) {
      if (!labelOverlapsScreenRect(label, rect)) continue;
      label.top = label.below
        ? Math.min(maxTop, rect.y1 + 8)
        : Math.max(minTop, rect.y0 - label.lh - 8);
    }
  }

  function repelXrayLabelsFromGeometry(obstacles: readonly ScreenRect[]): void {
    // pass 2b: module-geometry repulsion (r3 — the AMMO RACK chip sat ON the
    // ammo shells it labeled). Chips slide UP along their leader lines until
    // clear of any projected module/crew box they intersect, capped at ~130px
    // of lift so a chip never orphans from its dot (huge rects like the
    // full-length track bands are undodgeable anyway — the near-opaque chip
    // plates keep text legible there). The big damage numeral and the micro
    // identity tags are exempt: the numeral belongs AT the impact point (its
    // r3 backing plate carries legibility over any fill — dodging the
    // track-band rect flung it to the screen bottom), micro tags sit on
    // their organ by design.
    if (!obstacles.length) return;
    for (let sweep = 0; sweep < 2; sweep++) {
      for (const label of pb.labels) repelXrayLabelFromGeometry(label, obstacles);
    }
  }

  function visibleXrayPanelRects(): DOMRect[] {
    if (!dom) return [];
    const panelEls: HTMLElement[] = [dom.title, dom.skip, dom.annot, dom.killer.root];
    return panelEls
      .filter((node) => getComputedStyle(node).display !== 'none')
      .map((node) => node.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0);
  }

  function labelOverlapsPanel(label: KillcamLabel, top: number, panel: DOMRect): boolean {
    return label.left < panel.right + 6
      && panel.left < label.left + label.lw + 6
      && top < panel.bottom + 6
      && panel.top < top + label.lh + 6;
  }

  function repelXrayLabelsFromPanels(panelRects: readonly DOMRect[], height: number): void {
    // pass 2c: keep projected callouts out of the fixed analysis/killer
    // cards. This matters most in portrait, where the lower-hull labels and
    // the compact ballistic card share the bottom third of the frame. Move a
    // colliding callout toward the unobstructed center instead of letting its
    // text ghost through a panel; leaders retain the anchor relationship.
    for (const label of pb.labels) {
      if (label.hidden) continue;
      for (const panel of panelRects) {
        if (!labelOverlapsPanel(label, label.top, panel)) continue;
        label.top = (panel.top + panel.bottom) * 0.5 > height * 0.5
          ? panel.top - label.lh - 8
          : panel.bottom + 8;
      }
    }
  }

  function xrayLabelPriority(label: KillcamLabel): number {
    if (label.big) return 3;
    return label.micro ? 1 : 2;
  }

  function labelOverlapsPlaced(
    label: KillcamLabel,
    top: number,
    placed: readonly KillcamLabel[],
  ): boolean {
    return placed.some((other) => label.left < other.left + other.lw + 5
      && other.left < label.left + label.lw + 5
      && top < other.top + other.lh + 4
      && other.top < top + label.lh + 4);
  }

  function xrayLabelFits(
    label: KillcamLabel,
    top: number,
    minTop: number,
    maxBottom: number,
    panelRects: readonly DOMRect[],
    placed: readonly KillcamLabel[],
  ): boolean {
    if (top < minTop || top + label.lh > maxBottom) return false;
    if (panelRects.some((panel) => labelOverlapsPanel(label, top, panel))) return false;
    return !labelOverlapsPlaced(label, top, placed);
  }

  function xrayLabelCandidateTops(
    label: KillcamLabel,
    minTop: number,
    maxBottom: number,
    placed: readonly KillcamLabel[],
  ): number[] {
    const candidates = [minTop, maxBottom - label.lh];
    for (const other of placed) {
      const horizontallySeparate = label.left >= other.left + other.lw + 5
        || other.left >= label.left + label.lw + 5;
      if (horizontallySeparate) continue;
      candidates.push(other.top - label.lh - 5, other.top + other.lh + 5);
    }
    return candidates;
  }

  function settleXrayLabel(
    label: KillcamLabel,
    minTop: number,
    maxBottom: number,
    panelRects: readonly DOMRect[],
    placed: readonly KillcamLabel[],
  ): void {
    const desired = label.top;
    if (xrayLabelFits(label, desired, minTop, maxBottom, panelRects, placed)) return;
    const valid = xrayLabelCandidateTops(label, minTop, maxBottom, placed)
      .filter((top) => xrayLabelFits(label, top, minTop, maxBottom, panelRects, placed));
    valid.sort((left, right) => Math.abs(left - desired) - Math.abs(right - desired));
    if (valid.length) label.top = valid[0];
  }

  function separateFinalXrayLabels(panelRects: readonly DOMRect[], height: number): void {
    // Geometry and fixed-panel repulsion can move two independently solved
    // labels back onto the same screen row (most visibly the entry-plate and
    // damage cards at the impact point). Run one final bounded label-only
    // separation pass after every other obstacle has settled.
    const visible = pb.labels.filter((label) => !label.hidden)
      .sort((left, right) => xrayLabelPriority(right) - xrayLabelPriority(left)
        || left.top - right.top || left.left - right.left);
    const minTop = height * 0.095;
    const maxBottom = height * 0.885;
    const placed: KillcamLabel[] = [];
    for (const label of visible) {
      settleXrayLabel(label, minTop, maxBottom, panelRects, placed);
      placed.push(label);
    }
  }

  function writeXrayLeader(label: KillcamLabel): void {
    if (!label.line) return;
    const below = label.top > label.ay;
    label.line.setAttribute('x1', label.ax.toFixed(1));
    label.line.setAttribute('y1', label.ay.toFixed(1));
    label.line.setAttribute('x2', (label.left + label.lw * 0.5).toFixed(1));
    label.line.setAttribute('y2', (below ? label.top : label.top + label.lh).toFixed(1));
  }

  function writeXrayLabel(label: KillcamLabel, width: number, height: number): void {
    const display = label.hidden ? 'none' : 'flex';
    label.label.style.display = display;
    if (label.dot) label.dot.style.display = label.hidden ? 'none' : 'block';
    if (label.line) label.line.style.display = label.hidden ? 'none' : 'block';
    if (label.hidden) return;
    // pass 3: write DOM positions + leader lines dot -> chip edge
    // r8 frame-safe clamp: labels stay inside the letterboxed picture area.
    if (!label.big) {
      label.top = Math.min(Math.max(label.top, height * 0.095), height * 0.885 - label.lh);
    }
    label.left = Math.min(Math.max(label.left, 8), Math.max(8, width - label.lw - 8));
    label.label.style.left = `${label.left.toFixed(1)}px`;
    label.label.style.top = `${label.top.toFixed(1)}px`;
    if (label.dot) {
      label.dot.style.left = `${label.ax.toFixed(1)}px`;
      label.dot.style.top = `${label.ay.toFixed(1)}px`;
    }
    writeXrayLeader(label);
  }

  function projectLabels(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const victimCenterY = projectXrayFocus(height);
    const obstacleLayout = projectXrayObstacles(width, height);
    projectXrayLabelAnchors(width, height, victimCenterY, obstacleLayout.anchors);
    separateInitialXrayRows();
    repelXrayLabelsFromGeometry(obstacleLayout.obstacles);
    const panelRects = visibleXrayPanelRects();
    repelXrayLabelsFromPanels(panelRects, height);
    separateFinalXrayLabels(panelRects, height);
    for (const label of pb.labels) writeXrayLabel(label, width, height);
  }

  function updateXray(dt: number): void {
    pb.xt += dt;
    // late-attached meshes (async GLB kit deferral) join the ghost skin the
    // frame they arrive — see the r3 note at pb.ghostSkin
    if (pb.ghostSkin) pb.ghostSkin();
    // xrayAng0: the impact beat's orbital drift carries straight into the
    // hold — the camera never snaps back to the solved zero azimuth (r2)
    const ang = pb.xrayAng0 + ORBIT_RAD_S * pb.xt;
    const c = pb.xcam.center;
    const o = pb.xcam.off;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    _a.set(c.x + o.x * ca + o.z * sa, c.y + o.y, c.z - o.x * sa + o.z * ca);
    if (heightField) {
      const minY = heightField.getHeightAt(_a.x, _a.z) + 1.0;
      if (_a.y < minY) _a.y = minY;
    }
    setReplayCamera(_a, pb.xcam.look, 42, dt);
    projectLabels();
    // killer card reveal: a beat into the hold, after the shot has landed
    // and the label cascade started — death view only (populated in beginXray)
    if (!pb.killerShown && pb.isDeathView && pb.xt >= KILLER_CARD_AT_S && dom) {
      pb.killerShown = true;
      dom.killer.root.classList.add('rv');
    }
    // killcam r3: the own-death replay's last act is the destruction itself —
    // the analysis hands the frame to the FINALE, everything else exits.
    if (pb.xt >= pb.xrayHoldS) {
      if (pb.finalePending) beginImpact();
      else beginExit();
    }
  }

  /**
   * EXIT TRANSITION (killcam_endscreen r1): letterbox close + fade-through-
   * black (~EXIT_HOLD_MS) into whatever follows. The scene teardown, the
   * integration onDone (spectate / end overlay setup) and killcam:done all
   * run AT the black frame, so the next state is fully staged before the
   * fade lifts — nothing ever pops mid-frame. Wall-clock timers (not rAF)
   * drive the handover so starved panes still finish the battle flow;
   * clearExit() (cancel path) can revoke every step.
   */
  function beginExit() {
    if (!pb || pb.phase === 'exit') return;
    pb.phase = 'exit';
    pb.exitWallMs = performance.now();
    const d = ensureDom();
    d.root.classList.add('out');
    const f = ensureFade();
    f.classList.remove('lift');
    void f.offsetWidth;
    f.classList.add('in');
    exitTimers.push(setTimeout(completeExit, EXIT_HOLD_MS));
  }

  function completeExit() {
    if (!active || !pb || pb.phase !== 'exit') return;
    teardown(true); // scene restored + onDone + killcam:done, behind black
    const f2 = fadeEl;
    if (!f2) return;
    exitTimers.push(setTimeout(() => {
      f2.classList.add('lift');
      f2.classList.remove('in');
      exitTimers.push(setTimeout(() => {
        if (fadeEl === f2) fadeEl = null;
        f2.remove();
      }, 420));
    }, 50));
  }

  function finish(runCallback: boolean): void {
    // legacy seam kept for cancel(): immediate teardown, no exit choreography
    teardown(runCallback);
  }

  function restoreReplayFx(): void {
    replayFx()?.setReplaySuppressed?.(false);
  }

  function restoreGhostPresentation(replay: PlaybackBundle): void {
    if (!replay.ghostBackup) return;
    for (const [mesh, material, renderOrder, castShadow] of replay.ghostBackup) {
      mesh.material = material;
      mesh.renderOrder = renderOrder || 0;
      mesh.castShadow = !!castShadow;
    }
  }

  function restoreWreckPresentation(replay: PlaybackBundle): void {
    const rewreck = replay.rewreck;
    const visual = replay.snap.targetEnt?.visual;
    if (!rewreck || !visual) return;
    visual.setDestroyed({ pop: rewreck.pop, ageS: 12 });
    if (visual.setTrackState) {
      for (const module of rewreck.brokenTracks) visual.setTrackState(module, true);
    }
    if (visual.stripEra) {
      for (const plate of rewreck.eraSpent) visual.stripEra(plate);
    }
  }

  function restoreAttackerPresentation(replay: PlaybackBundle): void {
    const attacker = replay.snap.attackerEnt;
    if (!replay.attackerPoseState || !attacker?.visual || !attacker.state) return;
    const visual = attacker.visual;
    visual.syncFromState(attacker.state, 0);
    if (replay.attackerRestore?.wasDestroyed && visual.setDestroyed) {
      visual.setDestroyed({ pop: false, ageS: 12 });
    }
    if (replay.attackerRestore && !replay.attackerRestore.wasVisible && visual.setVisible) {
      visual.setVisible(false);
    }
  }

  function releaseReplayScene(replay: PlaybackBundle): void {
    if (replay.fxHidden) {
      for (const child of replay.fxHidden) child.visible = true;
    }
    if (replay.vegGroup) replay.vegGroup.visible = replay.vegWasVisible;
    if (replay.dimmedLights) {
      for (const [light, intensity] of replay.dimmedLights) light.intensity = intensity;
    }
    for (const light of kcLights) light.intensity = 0;
    for (const disposable of replay.disposables) disposable.dispose();
    scene.remove(replay.group);
    replay.group.clear();
  }

  function publishReplayCompletion(
    runCallback: boolean,
    done: (() => void) | null,
    wasDeathView: boolean,
  ): void {
    if (runCallback && done) done();
    if (runCallback && wasDeathView) spectate.maybeStart();
    if (busRef) busRef.emit('killcam:done', {});
  }

  function teardown(runCallback: boolean): void {
    if (!active) return;
    window.removeEventListener('keydown', onSkipKey, true);
    window.removeEventListener('mousedown', onSkipKey, true);
    const replay = pb;
    if (replay) {
      restoreReplayFx();
      restoreGhostPresentation(replay);
      // PRE-WRECK RESTAGE release: re-apply the wreck look the replay
      // temporarily lifted (must run AFTER the ghost-material restore above —
      // setDestroyed lazily captures current materials for the rematch
      // restore, and it must capture the LIVE ones, never the ghost).
      // Settled pose + cooled embers: by replay end the destruction is old.
      // killcam r3: after an own-death FINALE the visual is ALREADY destroyed
      // (the beat just wrecked it from t=0), so setDestroyed no-ops and the
      // wreck hands back mid-arc with hot embers — which is the honest look
      // for a tank the player watched detonate one second ago; the resumed
      // live sync loop settles and cools it from there. The track/ERA
      // re-application below runs on both paths.
      restoreWreckPresentation(replay);
      // Release the temporary shot-time killer pose back to its authoritative
      // live state. Mid-battle death replays may hand control to spectate, so
      // leaving the shooter restaged would otherwise create a visual desync.
      restoreAttackerPresentation(replay);
      releaseReplayScene(replay);
    }
    // Every transition class and the CSS HUD veil are stripped even if a
    // later cancel sees an already-inactive controller.
    resetDomPresentation();
    const done = replay?.onDone ?? null;
    const wasDeathView = replay?.isDeathView ?? false;
    pb = null!;
    active = false;
    staged = false;
    // ALLY SPECTATE (killcam_endscreen r1): after the DEATH replay hands the
    // screen back — battle still live, allies still standing — land in the
    // spectate chase instead of the static wreck orbit the integration
    // onDone just started (rig.startSpectate overrides rig.startDeathCam).
    // No-op when the battle is decided, the player lives, or no ally does.
    // REPORT GATE: release — emitted on natural finish, skip AND cancel alike
    // so a buffered battle report can never be lost with the replay. Emitted
    // AFTER onDone so the integration end-overlay (.cot-end) already exists
    // when shotInfo's report renders and pins its footer to it.
    publishReplayCompletion(runCallback, done, wasDeathView);
  }

  // ===========================================================================
  // ALLY SPECTATOR MODE (killcam_endscreen r1)
  // ===========================================================================
  // Entered ONLY from the death-replay exit path above: the player is dead,
  // the battle continues, and living allies remain. The camera work lives in
  // the rig (rig.startSpectate / setSpectateTarget / spectateLook /
  // spectateZoom — eased blends, damped free orbit, collision pull-in); this
  // controller owns target selection, cycling input (←/→ or A/D), the FREE
  // CURSOR ORBIT + wheel zoom (killcam r2 — no button hold, see onMove),
  // auto-advance when the spectated ally dies, and the bus announcements
  // hud.ts renders the spectate bar from ('spectate:begin/change/end' —
  // additive events, no main.ts wiring).
  // Battle state comes from the composition root's injected getter. The old
  // diagnostics-only window.__DEBUG.game dependency made this silently fail
  // in production builds, so no spectator target or bar could ever appear.
  const spectate = (() => {
    let on = false;
    let observerAllTeams = false;
    let curId: string | null = null;
    let pollId: ReturnType<typeof setInterval> | null = null;
    let advanceTimer: ReturnType<typeof setTimeout> | null = null;
    let lastX: number | null = null; // clientX/Y fallback deltas (movementX preferred)
    let lastY: number | null = null;
    const gameRef = (): KillcamGame | null => {
      try { return getGame ? getGame() : null; } catch (_) { return null; }
    };
    const livingAllies = (): KillcamEntity[] => {
      const g = gameRef();
      if (!g || !Array.isArray(g.tanks)) return [];
      return g.tanks.filter((t) => t && (observerAllTeams || (!t.isPlayer && t.team !== 'enemy'))
        && t.combat && !t.combat.destroyed && t.state && t.visual);
    };
    const entById = (id: string): KillcamEntity | null => {
      const g = gameRef();
      return g && g.tankById ? g.tankById.get(id) || null : null;
    };
    function announce(kind: 'begin' | 'change', ent: KillcamEntity, list: KillcamEntity[]): void {
      if (!busRef || !ent) return;
      busRef.emit(`spectate:${kind}`, {
        id: ent.id,
        name: ent.displayName || null,
        vehicle: ent.spec ? ent.spec.name : String(ent.id),
        specId: ent.specId || null,
        count: list.length,
        index: Math.max(1, list.findIndex((candidate) => candidate.id === ent.id) + 1),
        allTeams: observerAllTeams,
      });
    }
    function retarget(ent: KillcamEntity, list: KillcamEntity[], first: boolean): void {
      curId = ent.id;
      if (first) rig.startSpectate(ent);
      else rig.setSpectateTarget(ent);
      announce(first ? 'begin' : 'change', ent, list);
    }
    function cycle(dir = 1): void {
      if (!on) return;
      const list = livingAllies();
      if (!list.length) { stop(true); return; }
      let i = list.findIndex((t) => t.id === curId);
      if (i < 0) i = 0; // current target died — dir picks the neighbour
      else i = ((i + dir) % list.length + list.length) % list.length;
      retarget(list[i], list, false);
    }
    function onKey(e: KeyboardEvent): void {
      if (!on || e.repeat) return;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') cycle(1);
      else if (e.code === 'ArrowLeft' || e.code === 'KeyA') cycle(-1);
    }
    // FREE CURSOR ORBIT (killcam r2, owner: "when were spectating be able to
    // look around tanks using cursor"): moving the mouse orbits the camera
    // around the spectated tank — no button hold. Spectating has no gun to
    // aim, so every mouse motion is free look: full 360° yaw, the rig clamps
    // pitch and eases both (chase free-look feel). movementX/Y works locked
    // AND unlocked (a canvas click mid-spectate re-grabs pointer lock —
    // main.ts battle mousedown — and client deltas die with the cursor);
    // client-delta fallback covers browsers without movement fields.
    function onMove(e: MouseEvent): void {
      if (!on) return;
      // never orbit behind an open settings panel (read-only introspection —
      // the same seam this controller already reads battle state through)
      try {
        const dbg = debugSurface();
        if (dbg && dbg.settings && dbg.settings.isOpen && dbg.settings.isOpen()) return;
      } catch (_) { /* no settings surface — orbit freely */ }
      let dx;
      let dy;
      if (typeof e.movementX === 'number' && (e.movementX !== 0 || e.movementY !== 0
        || document.pointerLockElement)) {
        dx = e.movementX;
        dy = e.movementY;
      } else {
        dx = lastX === null ? 0 : e.clientX - lastX;
        dy = lastY === null ? 0 : e.clientY - lastY;
      }
      lastX = e.clientX;
      lastY = e.clientY;
      if (dx || dy) rig.spectateLook(dx, dy);
    }
    // wheel zooms the orbit (chase-cam grammar; the rig clamps + eases)
    function onWheel(e: WheelEvent): void {
      if (!on || !e.deltaY || !rig.spectateZoom) return;
      rig.spectateZoom(e.deltaY > 0 ? 1 : -1);
    }
    function watchTarget(): void {
      if (!on) return;
      const cur = curId != null ? entById(curId) : null;
      const dead = !cur || !cur.combat || cur.combat.destroyed;
      if (dead && advanceTimer === null) {
        // let the ally's death read for a beat, then glide to the next
        advanceTimer = setTimeout(() => {
          advanceTimer = null;
          if (on) cycle(1); // cycle() re-resolves the living list / stops
        }, 900);
      }
    }
    function start(): boolean {
      const list = livingAllies();
      if (!list.length) return false;
      on = true;
      lastX = lastY = null;
      retarget(list[0], list, true);
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('mousemove', onMove, true);
      window.addEventListener('wheel', onWheel, { passive: true, capture: true });
      pollId = setInterval(watchTarget, 400);
      return true;
    }
    function stop(emitEnd = false): void {
      if (!on) return;
      on = false;
      observerAllTeams = false;
      curId = null;
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('wheel', onWheel, { capture: true });
      if (pollId !== null) { clearInterval(pollId); pollId = null; }
      if (advanceTimer !== null) { clearTimeout(advanceTimer); advanceTimer = null; }
      if (rig.stopSpectate) rig.stopSpectate();
      if (emitEnd && busRef) busRef.emit('spectate:end', {});
    }
    return {
      /** Enter spectate iff dead player + live battle + living allies. */
      maybeStart() {
        if (on) return false;
        observerAllTeams = false;
        const g = gameRef();
        const p = getPlayer();
        if (!g || g.result || g.phase !== 'battle') return false;
        if (!p || !p.combat || !p.combat.destroyed) return false;
        return start();
      },
      /** Enter lobby observer mode without requiring an owned/dead tank. */
      startObserver() {
        if (on) return false;
        observerAllTeams = true;
        if (start()) return true;
        observerAllTeams = false;
        return false;
      },
      stop,
      cycle,
      get active() { return on; },
      get targetId() { return on ? curId : null; },
    };
  })();

  return api;
}
