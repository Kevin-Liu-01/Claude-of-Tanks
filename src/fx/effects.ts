import { createAuxiliaryPresentation, type AuxiliaryVisualEntity } from './auxiliaryPresentation.ts';
// atmospherics lane: rounds in flight (tracers); (ac130-fx-228) the gunship's rounds and the composer's frozen round
// draw here too: the pre-October ribbon block is gone
import { createProjectileTracers, type LensRound } from './projectileTracers.ts';
import { gunshipCaliberMm, gunshipRoundOf, gunshipShotOf, type GunshipRound } from './gunshipRounds.ts';
import { firedIsMissile, missileFlicker, missileLookFor, missileSpin, missileTrailOf, missileWobble, MISSILE_LOOKS, type MissileLook,
  type MissileTrail } from './missileLooks.ts';
import { createMissileTrails, TRAIL_STEP_M } from './missileTrails.ts';
import { missileIgnition, missileLaunch } from './missileRecipes.ts';
import { createMissileWires, WIRE_SLOTS } from './missileWires.ts';
import { createSceneLightUniforms, readSceneLight, type SceneLightData } from './sceneLight.ts';
import { MISSILE_AIRFRAMES, createMissileBodies, missileBodyDims } from './missileBodies.ts';
import { usesLauncherMuzzles } from '../sim/launcherPolicy.ts';
import { puffRandom } from './atmosRecipes.ts';
import type { SmokeScreen } from '../sim/auxiliarySystems.ts';
import { smokeWindForMap } from '../sim/smokeScreen.ts';
/**
 * effects.ts — combat VFX orchestration (public Fx API, ARCHITECTURE §3.8.2).
 *
 * Muzzle flash (light + additive cards + smoke ring), per-type shell tracers,
 * impact effects by HitEvent.kind (spark fans, ricochet streaks, HE dirt
 * plumes, penetration flash, ERA pops), vehicle destruction (fireball, turret
 * pop, debris, persistent smoke column), track dust and engine exhaust.
 *
 * Dynamic light budget: exactly 2 pooled PointLights (muzzle 90 ms,
 * explosion 1.1 s). All randomness via seeded mulberry32; time only advances
 * through update(dt), so setFrozen() fully pins the frame for screenshots.
 */
import * as THREE from 'three';
import type { TrackSurface } from '../world/trackSurface.ts';
import { streetGritShare } from '../world/roadPave.ts';
import { createDronePresentation, droneHiddenFromCamera } from './dronePresentation.ts';
import { configureDroneMaterials } from './droneModel.ts';
import {missionAttachmentVisualFrame} from '../game/missionAttachmentVisual.ts';
import { configureGunshipMaterials, GUNSHIP_BANK_RAD } from '../game/gunshipVisual.ts';
import { waterContactMaskAt } from '../world/waterContactMask.ts';
import { createParticleSystem, mulberry32, makeFbm } from './particles.ts';
import { LATE_FX_LAYER } from './layers.ts';
import { registerFxClock, noteFxClockShift, registerPopTrail, onTurretLanding } from './clock.ts';
import { createImpactDecalsSteps } from './impactDecals.ts';
import { syncSubjectEmitterAnchor } from './effectAttachments.ts';
import { isEraActivation } from '../game/eraActivation.ts';
import { resetEquipmentDamage, type EquipmentDamageEvent } from '../vehicles/equipmentDamage.ts';
import type { EventBus } from '../game/stateCore.ts';
import type { GunshipLensGuns } from '../game/gunshipAirframe.ts';
// world-dressing r1: destructible small-prop seam — fx registers the
// kind-flavored break bursts and forwards shell flight/impact data so light
// props (fences, carts, barrels, bales...) break under fire without the sim
// layer knowing about them (see src/world/destructibles.ts).
import { setBreakFxProvider, notifyShellSweep, notifyShellImpact, notifyBlast, ambientRoundSource, type AmbientRoundDraw }
  from '../world/destructibles.ts';
// destruction-fx lane (2026-10-07): simulated volumetric media, thrown material and the munition x surface recipes
import { createVolumeMedia, makeVolumePuff, type VolumeMedia } from './volumeMedia.ts';
import { battleLightTintFromRig } from './sceneLightTint.ts';
import { addLocalPoint, addLocalSpot, beginLocalLights, endLocalLights, localLightsCompiled, localLightsForPreset,
  setLocalLightsCompiled } from './localLights.ts';
import { refreshWorldWind, worldWind } from './worldWind.ts';
import { mapTintHex, setMapGroundAlbedo } from './mapPalette.ts';
import { createDebrisChunks, makeChunkPiece, type DebrisChunks } from './debrisChunks.ts';
import {
  armorHit, blastScale, columnPuff as mediaColumnPuff, exhaustPuff, exhaustSpacing, craterEjecta, dustSurge, fragmentStrike,
  groundBurst, HULL_EARTH_MIN_KG, isExplosive, kineticStrike, killDust, killFireball, muzzleBlast as mediaMuzzleBlast, plateBurst,
  smolderPuff as mediaSmolderPuff, trackSkirt, trackSkirtSpacing, waterBurst,
  type BlastContext,
} from './blastRecipes.ts';
import { createTrailCadence } from './trailCadence.ts';
import { craterWobblePhases, type TerrainDeformation } from '../sim/terrainDeformation.ts';
import { mapCratersOn } from '../world/mapCraters.ts';
import { registerGroundKeyLight } from '../engine/groundKeyLights.ts';
import { resolveGroundReduxProfile } from '../world/groundRedux.ts';
import { classifyTerrain } from './surfaceLooks.ts';
import { createCraterMarks, markKindFor, type CraterClimate, type CraterMarks } from './craterMarks.ts';
import { breakShardsFx, landingSpillFx, lookForStruckKind, lookFromAnatomy, pieceLandingFx, propBreakFx, sectionFallFx, structureStageFx, wallStrike, type StructureLook } from './structureFx.ts';
import { createStructureMask, type StructureMask } from './structureMask.ts';
import { createLatticeGround } from './latticeGround.ts';
import { bucketAliases, createStructureStages, structureTopple, type StructureStages } from './structureStages.ts';
import { createStructureScars, type StructureScars } from './structureScars.ts';
import { createStructureDebris, type StructureDebris } from './structureDebris.ts';
import { createRubbleBodies, RUBBLE_BODY_CAPACITY, type RubbleBodies } from './rubbleBodies.ts';
import { createFractureStages, type FractureStages } from './fractureStages.ts';
import type { RigidEnvironment } from '../sim/rigidBody.ts';
import type { CollisionRecord } from '../world/collision.ts';
import type { StructureDamageSeam, StructureMaterialInfo } from '../world/structureDamageSeam.ts';
import { DESTRUCTION_BUS_EVENTS, type MunitionBlastEvent, type StructureBreachEvent, type StructureStageEvent, type TerrainCraterEvent } from '../sim/destructionEvents.ts';
import { munitionChargeKg, munitionClassForShell, cookOffChargeKg, craterFor } from '../sim/munitionBlast.ts';
import type { MunitionClass } from '../sim/destructionEvents.ts';
import { getDeviceTier, onPresetChange, resolvePresetName } from '../engine/quality.ts';

type Rng = () => number;
type MutableVec3 = [number, number, number];
type WireVec3 = readonly [number, number, number];
type ShellId = string | number;
type TracerType = 'DRONE' | 'ATGM' | 'AP' | 'APCR' | 'HEAT' | 'HE' | 'HESH' | 'APFSDS';
type DestructionCause = 'ammorack' | 'shot' | 'fire';

interface FxEngineContext {
  camera?: THREE.Camera;
  anisotropy?: number;
  scene?: THREE.Scene;
  /** Lit-material registration for the cascaded shadows (drone airframes and docks are lit meshes; the crater marks
   *  pass their shader hook, which the registration chains after the cascades' own). */
  setupShadowMaterial?(material: THREE.Material, extraHook?: THREE.Material['onBeforeCompile'] | null): unknown;
  releaseShadowMaterial?(material: THREE.Material): unknown;
}

interface FxHeightField {
  getHeightAt?(x: number, z: number): number;
  /** The contact surface on the 1.333 m lattice the drawn LOD0 shares (terrainContactSurface.ts). */
  getContactHeightAt?(x: number, z: number): number;
  /** That surface's steep-cell split (terrainContactSurface.ts terrainCellFlipped), which the overlay rides. */
  getContactCellFlippedAt?(x: number, z: number): boolean;
  getWaterMaskAt?(x: number, z: number): number;
  getWaterDepthAt?(x: number, z: number): number;
  getWaterSurfaceHeightAt?(x: number, z: number): number;
  /** Water pass 8: the reactive water field takes splashes and carries the wakes (no ring prints then). */
  addWaterImpulse?(x: number, z: number, radiusM: number, amplitudeM: number, foam?: number): void;
  waterRipplesActive?(): boolean;
  getGroundType?(x: number, z: number): string;
  getTrackSurfaceAt?(x: number, z: number): TrackSurface;
  /** The paved share of a carriageway (world/roadPave.ts): a sett or concrete street throws grit, not an earth wake. */
  getRoadPaveAt?(x: number, z: number): number;
}

/** The world seam the structure looks read (world/map.ts; DESTRUCTION.md §16.4). */
export interface FxWorldSeam {
  patchStructureMaterials?(patch: (material: THREE.Material, info: StructureMaterialInfo) => void): number;
  structureDamage?(structureIdx: number): StructureDamageSeam | null;
  /** the battle world's raycast (terrain and every live collider), the one the shells sweep; a drone flying home avoids it */
  raycast?(origin: { x: number; y: number; z: number }, direction: { x: number; y: number; z: number }, maxDist: number):
    { dist: number; normal?: { x: number; y: number; z: number } | null } | null;
  /** the battle's ground overlay (craters, rubble heaps) the drawn ground follows; null between battles */
  groundOverlay?(): { offsetAt(x: number, z: number): number; contactOffsetAt?(x: number, z: number, flipped?: boolean): number; readonly revision?: number } | null;
  /** the static records the presentation's rigid bodies meet (world/map.ts bodyRecordQuery: shell bands and solid records) */
  bodyRecordQuery?(): (minX: number, minZ: number, maxX: number, maxZ: number, out: CollisionRecord[]) => CollisionRecord[];
  /** ground lane: a crater's cover cleared (its tall grass, flowers and scatter inside the radius) for the rest of the
   *  match; presentation only (the sim's overlay never carries marks), called once per mark at event time */
  clearCoverAt?(x: number, z: number, radiusM: number): void;
  readonly mapId?: string;
}

interface FxOptions {
  /** destruction-fx lane: a structure's look (its rubble materials and colours) when the world publishes its anatomy */
  structureLook?(structureId: number): StructureLook | null;
  /** destruction-fx lane: the current world, whose structure bucket materials take the collapse patch */
  world?(): FxWorldSeam | null;
  auxiliaryEntities?(): Iterable<AuxiliaryVisualEntity>;
  auxiliaryTime?(): number;
  auxiliaryVisible?(entity:AuxiliaryVisualEntity):boolean;
  auxiliaryReport?(id:string,position:THREE.Vector3,caliber:number):void;
  seed?: number;
  /** Resolve the live presentation entity for any struck tank, including the player. */
  resolveEntity?(targetId: ShellId): object | null;
}

interface PuffScratch {
  pos: MutableVec3;
  vel: MutableVec3;
  life: number;
  size0: number;
  size1: number;
  rot: number;
  rotVel: number;
  col0: MutableVec3;
  col1: MutableVec3;
  alpha: number;
  grav: number;
  birthOffset: number;
}

interface StreakScratch {
  pos: MutableVec3;
  vel: MutableVec3;
  life: number;
  width: number;
  stretch: number;
  grav: number;
  col: MutableVec3;
  alpha: number;
  seed: number;
  birthOffset: number;
}

interface DebrisScratch {
  pos: MutableVec3;
  vel: MutableVec3;
  life: number;
  axis: MutableVec3;
  spin: number;
  scale: number;
  groundY: number;
  hot: boolean | number;
  seed: number;
  birthOffset: number;
}

interface JetScratch {
  pos: MutableVec3;
  axis: MutableVec3;
  life: number;
  width: number;
  len0: number;
  len1: number;
  seed: number;
  col: MutableVec3;
  alpha: number;
  birthOffset: number;
}

interface FxVisual {
  root: THREE.Object3D;
  /** the gun's or a launcher tube's mouth in the world now (a wire-guided missile's wire is fixed there) */
  gunMuzzleWorld?(out: THREE.Vector3, muzzleIndex?: number, guided?: boolean): unknown;
  setDestroyed(options?: { pop?: boolean; ageS?: number }): void;
  /** (240) the vehicle's overall size (TankVisual.dims): a kill roots its night flames on the deck by its height */
  dims?: { heightM?: number };
  /** Wreck visuals report true; a revived/reset visual reports false (wreck r1 reads this). */
  isDestroyed?(): boolean;
  applyEquipmentDamage?(event: EquipmentDamageEvent): boolean;
}

interface FxDecalVisual {
  root: THREE.Object3D;
}

interface FxEntity {
  spec?: {id:string;nation?:string};
  aerial?: {active:boolean;yaw:number;kind?:'drone'|'gunship'};
  visual: FxVisual;
  state: {
    pos?: THREE.Vector3;
    yaw?: number;
  };
  /** Solo/authority entities carry the combat record; a revived one reads destroyed:false. */
  combat?: { destroyed?: boolean } | null;
}

interface FxDebugSurface {
  game?: {
    tankById?: Map<ShellId, FxEntity>;
  };
}

type FxEventBus = Pick<EventBus, 'on'>;

function onFxEvent<EventName extends keyof FxEventMap>(
  bus: FxEventBus,
  event: EventName,
  listener: (payload: FxEventMap[EventName]) => void,
): () => void {
  return bus.on(event, (payload) => listener(payload as FxEventMap[EventName]));
}

interface LightState {
  light: THREE.PointLight;
  bornAt: number;
  dur: number;
  peak: number;
  pow: number;
  /** the light's own decay (a pulse may set a shorter one for itself: a ground burst's 0.2 s) */
  baseDur: number;
  basePow: number;
  /** (fx 9: 8t) the pooled explosion light's reach for the pulse in flight (13 m unless the pulse sets its own) */
  range?: number;
  /** (the combat review 10-13) the pulse's hot hue, cooling toward LIGHT_COOL_HEX as it fades */
  hotHex?: number;
}

interface ShockRingState {
  mesh: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  mat: THREE.MeshBasicMaterial;
  bornAt: number;
  scaleK?: number;
  alphaK?: number;
}

interface MuzzleRingState {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  mat: THREE.MeshBasicMaterial;
  bornAt: number;
  att: number;
  dir: THREE.Vector3;
  origin: THREE.Vector3;
}

function isRingVisible(ring: ShockRingState | MuzzleRingState): boolean {
  return ring.mesh.visible;
}

/** (fx 9a) a missile in flight: its look and where its smoke trail, its wire and its body stand (the record outlives the
 *  round by MISSILE_RECORD_LINGER_S, so a networked round that left the snapshot still parts its wire and ends its
 *  trail) */
interface GuidedTrail {
  age: number;
  seen: boolean;
  /** (fx 9a) the round's look, seed, launch point and the distance flown last frame; (FX lane 10-14) its smoke trail's
   *  slot and the distance of the trail's next point */
  look?: MissileLook;
  seed?: number;
  launch?: [number, number, number] | null;
  lastD?: number;
  smokeSlot?: number;
  nextSmokeD?: number;
  fallbackD?: number;
  /** (FX lane 10-15) the round's calibre (mm; 0: its family's), its airframe's size, and its tail's distance behind the
   *  nose (m): where its wire leaves, its beacon burns and its trail is born */
  calMm?: number;
  tailM?: number;
  /** (ac130-fx-228 r2) a gunship missile's rail: where the drawn round left the wing pylon relative to its guided line
   *  (world m), converging onto that line by GUNSHIP_PYLON_MERGE_M; null for every other round */
  pylon?: [number, number, number] | null;
  /** (ac130-barrels-230) the distance (m) its drawn round joins its line in: GUNSHIP_PYLON_MERGE_M, or from the lens's rail
   *  LENS_MERGE_K of its slant range */
  pylonM?: number;
  /** (ac130-barrels-230) from the lens's rail: the lens's scale across the view at the launch (its rail's round is drawn at
   *  that size), the drawn body growing from it to its own size as it joins its line; undefined for every other round */
  lensK?: number;
}

interface FxTimer {
  t: number;
  fn: () => void;
}

interface SmokeColumn {
  key: string | null;
  /**
   * wreck r1 (owner 2026-09-17: fire/smoke belong to the vehicle object, so a
   * removed corpse takes its column along): the id of the wreck this column
   * rides. The emitter anchors to the wreck's visual root (a shoved wreck
   * carries its smoke) and retires the frame the corpse is released, hidden
   * for a respawn or revived — never on the fixed timer alone.
   */
  wreckOf?: string | null;
  sawWreck?: boolean;
  pos: MutableVec3;
  localPos?: number[];
  anchorSpace?: object;
  anchorMode?: 'visual-root' | 'state-yaw';
  attachmentResolved?: boolean;
  acc: number;
  ttl: number;
  smolder?: number;
  scale: number;
  /** false: a shell burst on open ground — smoke only, no flame licks on a deck line nothing stands on, no ember
   * smolder after (2026-10-03, the Studio's floating fire: shell hits left 40 s of flame over bare ice and water). */
  flame?: boolean;
  /** A burning map car (the car-wreck lane, 2026-10-21): its length (its nose's half length, world XZ) and its height (m);
   *  its fire's light sits lower over it and burns brighter as the night falls (r1c: "the fire lights almost nothing at
   *  night"; r2: "a red spotlight in full sun" when it burned bright by day too); its flames are tongues along its cabin
   *  and over its roof (233). */
  car?: [number, number, number];
  /** (240) a tank wreck's deck over the column's foot (m, DECK_OF_HEIGHT x its hull's height): its night flames' root */
  deck?: number;
}

interface LiveShell {
  ageS?: number;
  shooterId?: ShellId;
  rocket?: boolean;
  id: ShellId;
  pos: THREE.Vector3;
  prevPos?: THREE.Vector3;
  vel: THREE.Vector3;
  dead?: boolean;
  distM?: number;
  isPlayer?: boolean;
  spec?: {
    guided?: boolean;
    tracer?: TracerType;
    reloadGroup?: string;
    /** the round's name and launch sound (local rounds carry their full spec; a networked one only type/guidance) */
    name?: string;
    soundProfile?: string;
    type?: string;
    caliberMm?: number;
  };
}

interface FiringMoment {
  rocket?: boolean;
  velocityMps?: number;
  muzzlePos: THREE.Vector3;
  dir: THREE.Vector3;
  caliberMm: number;
  tracerType: Exclude<TracerType, 'ATGM'>;
  ageS: number;
}

interface ExplosionMoment {
  pos: THREE.Vector3;
  ageS: number;
}

interface PredictedWeaponEvent {
  rocket?: boolean;
  muzzlePos: WireVec3;
  dir: WireVec3;
  caliberMm: number;
  isPlayer?: boolean;
  /** the round's launch sound profile ('*-launch' for every guided round) and name, when the shot carries them */
  weaponSound?: string | null;
  shellName?: string;
}

interface ShellFiredEvent extends PredictedWeaponEvent {
  shellType: string;
  shellId: ShellId;
  /** the firing vehicle and the tube or muzzle the round left (the launcher a wire-guided round's wire stays fixed to) */
  shooterId?: ShellId | null;
  muzzleIndex?: number | null;
  feedbackPredicted?: boolean;
  shellName?: string;
  /** the destruction catalog's class and charge (sim/munitionBlast.ts), when the shooter's step publishes them */
  munition?: MunitionClass;
  chargeKg?: number;
  guided?: boolean;
  tracer?: string;
  blastRadiusM?: number;
}

interface ShellHitEvent {
  pos: WireVec3;
  normal: WireVec3;
  caliberMm: number;
  kind: string;
  targetId?: string;
  shellId?: ShellId;
  eraPlate?: string | null;
  eraActivations?: readonly {
    plate: string;
    pos?: WireVec3;
    normal?: WireVec3;
  }[];
  zone?: string;
  modulesHit?: readonly { module: string; newState: string; dmg: number }[];
  crewHit?: readonly string[];
  ammoRacked?: boolean;
  fireStarted?: boolean;
  impactFrame?: 'hull' | 'turret' | 'gun' | 'barrel';
  impactLocalPos?: WireVec3;
  impactLocalNormal?: WireVec3;
  impactLocalDir?: WireVec3;
  localPos?: WireVec3;
  localDir?: WireVec3;
}

interface ShellExpiredEvent {
  shellId: ShellId;
  pos: WireVec3;
  normal?: WireVec3;
  hitKind?: string;
  hitTerrain?: boolean;
  /** water pass 2026-09-12: the sim classified the ground point as open water */
  hitWater?: boolean;
  caliberMm?: number;
  /** the destruction catalog's class and charge (DESTRUCTION.md §8.1), when published */
  munition?: MunitionClass;
  chargeKg?: number;
  /** the round's type (the solo step publishes it with its calibre) */
  shellType?: string;
  /** what it struck: 'water', a collision record kind ('structure', 'wallstone' ...) or 'terrain' */
  surfaceKind?: string;
  /** the building it struck (2026-10-10: a round with no charge raises no blast to name it), when it struck one */
  structureId?: number;
}

interface TankDestroyedEvent {
  id: string;
  pos: WireVec3;
  cause?: DestructionCause;
}

interface ModuleStateEvent {
  id: string;
  module: string;
  state: string;
}

interface TankFireEvent {
  id: string;
  burning: boolean;
}

interface FxEventMap {
  'shell:fired': ShellFiredEvent;
  'weapon:predicted': PredictedWeaponEvent;
  'shell:hit': ShellHitEvent;
  'shell:expired': ShellExpiredEvent;
  'tank:destroyed': TankDestroyedEvent;
  'module:state': ModuleStateEvent;
  'tank:fire': TankFireEvent;
}

/**
 * Scene Studio cinematic seam (src/fx/cinematicFx.ts). Created on first use
 * by the Studio chunk only; battle never calls cinematicPort(), so none of
 * these closures, objects or state changes exist in a battle session.
 */
export interface FxCinematicPort {
  readonly group: THREE.Group;
  readonly sharing: ReturnType<typeof createParticleSystem>['sharing'];
  /** The battle's particle-system factory (particles.ts), so the Studio chunk imports none of the FX runtime's modules. */
  readonly createParticleSystem: typeof createParticleSystem;
  readonly heightField: FxHeightField;
  readonly explosionLight: THREE.PointLight;
  readonly explosionPeak: number;
  groundY(x: number, z: number): number;
  /** Seconds since the pooled explosion light last flashed. */
  explosionFlashAgeS(): number;
  flashExplosion(pos: THREE.Vector3, peak: number, ageS?: number): void;
  /** Keep the late soft-particle pass running while companion FX are alive. */
  setLateFxActive(fn: (() => boolean) | null): void;
  /** Concurrent smoke-column cap; null restores the battle budget. */
  setColumnCap(cap: number | null): void;
  /** (fx 9) the battle pools' normal-blended media are tinted by the scene's light in every quality (sceneLightTint.ts);
   *  true hands the tint to the Studio's cinematic layer (it writes its own measure), false takes it back. */
  setLightTintShading(on: boolean): void;
  /**
   * Night exposure discipline for Studio cinematic shots: scales the pooled
   * muzzle light and the additive muzzle/flash card intensity (1 = battle).
   */
  setMuzzleExposure(light: number, cards: number): void;
  stampTrackPrint(pos: THREE.Vector3, dir: THREE.Vector3, water: boolean, surface: TrackSurface): void;
}

export interface FxRuntime {
  readonly group: THREE.Group;
  setReplaySuppressed(suppressed: boolean): void;
  getReplaySuppressionDebug(): object;
  getGuidedMissileDebug(): object;
  getAttachmentDebug(): object;
  warmTextures(): void;
  preloadTextures(): Promise<boolean>;
  warmTexturesChunked(
    yieldFrame: () => Promise<void>, options?: { assets?: 'preload' | 'ready-only' },
  ): Promise<void>;
  warmOpeningEffects(
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    normal: THREE.Vector3,
    caliberMm?: number,
  ): void;
  warmProjectilePresentation(pos: THREE.Vector3, dir: THREE.Vector3): void;
  update(
    dt: number,
    shells: LiveShell[],
    camera: THREE.Camera,
    resolveSubject?: ((id: string) => FxEntity | null) | null,
  ): void;
  bindBus(bus: FxEventBus): void;
  muzzleFlash(pos: THREE.Vector3, dir: THREE.Vector3, caliberMm: number, rocket?: boolean): void;
  vehicleCollision(
    pos: THREE.Vector3,
    normal: THREE.Vector3,
    closingMps?: number,
  ): void;
  impact(kind: string, pos: THREE.Vector3, normal: THREE.Vector3, caliberMm: number): void;
  armorScar(
    visual: FxVisual,
    pos: THREE.Vector3,
    normal: THREE.Vector3,
    caliberMm: number,
  ): void;
  impactDecalStats(): object;
  /** (EF.10) compile the local light loop in or out (the preset decides; a cost A/B flips it). True when it changed. */
  setLocalLights(on: boolean): boolean;
  clearVehicleDecals(visual: FxDecalVisual): void;
  destruction(
    pos: THREE.Vector3,
    visual: FxVisual | null,
    cause?: DestructionCause,
    /** wreck r1: the destroyed entity's id — its smoke column rides and leaves with the corpse. */
    wreckOf?: string | null,
    /** shellBurst: a shell hitting open ground (the Studio's stand-in blast), not a tank — its column is smoke only. */
    opts?: { shellBurst?: boolean },
  ): void;
  dust(pos: THREE.Vector3, dir: THREE.Vector3, intensity: number): void;
  exhaust(pos: THREE.Vector3, intensity: number, sooty?: boolean, vel?: THREE.Vector3 | null, fwd?: THREE.Vector3 | null,
    birthOffset?: number): void;
  loosePropHit(pos: THREE.Vector3, dir: THREE.Vector3, heightM?: number): void;
  propCrush(pos: THREE.Vector3, dir: THREE.Vector3, heightM?: number): void;
  propBreak(kind: string, pos: THREE.Vector3, dir: THREE.Vector3, heightM?: number): void;
  /** The combat warm: a building's first damage's programs (structureStages.warm) at `pos`; resetAll clears it. */
  warmStructures(pos: THREE.Vector3): number;
  setFrozen(frozen: boolean, atTimeS?: number | null): void;
  resetSeed(seed: number): void;
  /** Pin the shared fx clock to exactly `atTimeS` (every live stamp keeps its age). */
  resetClock(atTimeS?: number): void;
  /** `running`: the hulls are already running (a Studio scene), so no engine coughs a cold start */
  resetAll(options?: { running?: boolean }): void;
  composeFiringMoment(moment: FiringMoment): void;
  composeExplosionMoment(moment: ExplosionMoment): void;
  cinematicPort(): FxCinematicPort;
  /**
   * (fx 8n) The Studio plays its battle-quality smoke salvos (screens published on its bus as the battle's own
   * 'auxiliary:smokeScreens') on its timeline's clock (seconds) instead of the match clock; null returns the
   * presentation to the match clock, and resetAll does too. False where there is no smoke presentation to drive.
   */
  setAuxiliaryClock(clock: (() => number) | null): boolean;
}

declare global {
  interface Window {
    __DEBUG?: FxDebugSurface;
    __FX_SKIP_DESTRUCTION?: boolean;
  }
}

function context2d(
  canvas: HTMLCanvasElement,
  options?: CanvasRenderingContext2DSettings,
): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', options);
  if (!context) throw new Error('fx/effects: Canvas2D context unavailable');
  return context;
}

function bufferAttribute(
  geometry: THREE.BufferGeometry,
  name: string,
): THREE.BufferAttribute {
  const value = geometry.getAttribute(name);
  if (!(value instanceof THREE.BufferAttribute)) {
    throw new Error(`fx/effects: ${name} is not a BufferAttribute`);
  }
  return value;
}

/** a missile's record lingers this long after its round is gone (its wire parts and its trail ends where it was) */
const MISSILE_RECORD_LINGER_S = 0.48;
/** (FX lane 10-14) missile bodies drawn at once: a TOS-1A's 24 rockets and a 12-tube volley in the air together */
const MAX_ATGM_BODIES = 48;
/** (ac130-fx-228) a gunship shot whose muzzle sits this close to the camera is the pilot's own lens (the sim fires from
 *  the orbit centre, where the gimbal's camera rides): nothing is drawn there */
const GUNSHIP_LENS_M = 25;
/** (ac130-fx-228 r2) the gunship's missile leaves its rail under the port wing (gunshipAirframe.ts: between the engines,
 *  under the wing, the airframe banked into its turn), not the orbit centre the simulation fires it from, where the
 *  gimbal's lens rides: drawn from the pylon, it joins its guided line within GUNSHIP_PYLON_MERGE_M. In the lens it enters
 *  from the frame's edge and its smoke reads as a line to the target, never a body or a tube seen end-on from inside it;
 *  from outside it leaves the wing. */
const GUNSHIP_PYLON_LOCAL = new THREE.Vector3(7.5, 1.9, 1.6);
const GUNSHIP_PYLON_MERGE_M = 120;
/** (ac130-fx-228 r2) the gunship missile's smoke thins out within this distance of the camera (none within a fifth of
 *  it): seen from its own gimbal lens it is a line to the target, never a white wedge across the frame's edge. (r3) Only
 *  from aloft: a camera more than GUNSHIP_LENS_TRAIL_M above the ground (the gimbal lens, the killcam's orbit round the
 *  airframe) gets the fade and the width cap (missileTrails.ts); a camera near the ground sees the whole trail */
const GUNSHIP_TRAIL_NEAR_M = 70;
const GUNSHIP_LENS_TRAIL_M = 120;
/** (ac130-barrels-230, the owner: the guns "behind" the camera, "barrels are visible so we can see them fire and recoil",
 *  the tracers, missile trace and smoke "cominng from behindd the camerA") a camera this near an AC-130's gimbal point (m)
 *  is that aircraft's own lens: its guns are drawn beside it (game/gunshipAirframe.ts buildGunshipLensGuns), and its
 *  rounds, missiles, flash and smoke leave their muzzles there and join their flight lines by LENS_MERGE_K of their slant
 *  range. The lens's missile smoke fades only LENS_TRAIL_NEAR_M from the glass (the width cap still thins its nearest
 *  stretch, seen down its length, so it is never a wedge) */
const LENS_NEAR_M = 1.5;
const LENS_MERGE_K = 0.9;
const LENS_TRAIL_NEAR_M = 8;
/** (round 2) the lens missile's smoke at the nozzle, after the jet's first expansion and grown (m), no wider in the boost:
 *  from beside the rail its nearest stretch is seen down its length, where the family's 0.64 m jet (x1.3 boosting) a few
 *  metres from the glass was a translucent wedge over a quarter of the frame */
const LENS_TRAIL_R0_M = 0.05, LENS_TRAIL_JET_M = 0.16, LENS_TRAIL_R1_M = 1.6;
/** a lens gun's gas: swept out of the frame past its gun (lens m/s, scaled with the lens across the view:
 *  gunshipLensGuns.scale), never across the sight */
const LENS_SLIP_MPS = 4.5;
/** (round 2) the lens's missile eases off its rail over its first LENS_LAUNCH_M (it is at full speed from the
 *  simulation's first step, and from beside the lens one frame would carry it a third of the way to the centre) */
const LENS_LAUNCH_M = 60;
/** (ac130-fx-228 r3, the blind critic's "the 152 mm burst has essentially no hot signature" in the gunship's infrared
 *  lens) the heat lens images the HDR luminance over ~1.55-3.1 (engine/post.ts thermalHeat), and the media's fire is
 *  white-hot only on its first frame: its cooling orange heart (luminance ~0.5-1) read cold a frame later, where a real
 *  long-wave sensor still sees the hot gas white. Under a heat-imaging camera the media's fire emission (its blackbody
 *  heart and the burst's light inside it, volumeMedia.ts uGrade.y) is this much brighter; every other camera unchanged */
const THERMAL_FIRE_GAIN = 4;
/** (ac130-fx-228 r3, the r5 critic 3: "no 152 mm burst keeps hot gas after the flash" in the heat lens) the fireball's
 *  gas cools to the eye in ~0.15 s (its dome's heat e-folds at 7/s) but stays hot to a long-wave sensor for most of a
 *  second: under a heat-imaging camera the media's fire cools at this share of its rate (volumeMedia.ts uHeatCool) */
const THERMAL_FIRE_COOL = 0.3;
/** the grade's own vision code (engine/post.ts uThermal): 1 infrared, 2 thermal (heat); 0 daylight, 3 intensified */
function imagesHeat(camera: THREE.Camera | null | undefined): boolean {
  const ud = camera?.userData as { sensorVision?: number; thermalFlight?: boolean; flightVision?: number } | undefined;
  if (!ud) return false;
  const vision = ud.sensorVision ?? (ud.thermalFlight === true ? (ud.flightVision ?? 1) : 0);
  return vision > 0.5 && vision < 2.5;
}
/** (ac130-fx-228 r2) its widest spread (m, the family's r1 capped) */
const GUNSHIP_TRAIL_R1_M = 2.4;
/** (ac130-fx-228 r2) the missile motor flare's sphere (m) and the widest it is ever drawn from the camera (rad, its
 *  radius): ~10 px at the gunship's 3.6x gimbal zoom, ~3 px at a tank's 60 deg view */
const ATGM_FLARE_RADIUS_M = 0.25;
const FLARE_MAX_RAD = 0.004;

// Nominal muzzle velocities used ONLY by composeFiringMoment (m/s)
const COMPOSED_ROUND_MPS = { AP: 800, APCR: 1050, HEAT: 780, HE: 750, HESH: 780, APFSDS: 1700 };
const MUZZLE_LIGHT_S = 0.14;   // lighting_post r6: composed frame catches 41% of peak
// 210 (was 1150): the 1150 peak stamped a ~20 m saturated yellow disc onto
// the terrain and whited out the bottom half of the scope (r6 "flashbang").
// 210 at range 11 (was 18) still reads a clear warm kick on barrel/glacis/
// ground inside ~5 m against the 4.5-intensity sun, then dies quadratically —
// a muzzle kiss, not a floodlight. Scoped view additionally attenuates the
// LIGHT (see spawnMuzzleFlash return), matching the geometry suppression.
// lighting_post r5: 210 flooded hull+dust to flat pale yellow — at the
// composed 50 ms frame the light contributed 2-8x the sun's irradiance on
// the glacis/turret front (hull maxima 206-214 display).
// r5 (critic: "muzzle light floods ~20m+ of road as a fog-like diagonal
// wash ... size hierarchy inverts: ground glow >> flash"): 210/16 lit a
// ~20 m pool that out-massed the flash itself from every side framing.
// 130/10 keeps a clear warm kick on barrel/mantlet/ground inside ~5 m
// (at 5 m: ~5.2 vs the 4.5-intensity sun) and dies inside ~10 m — a
// muzzle-scaled pool, never a road-wash.
// lighting_post r5 (critic MAJOR: "muzzle flash casts no light on the firing
// vehicle"): 130 over-corrected the r5 flood — at the composed 50 ms frame
// the light decays to ~53 and the mantlet/glacis sit 4-5 m from the bore tip
// (~0.5x sun, invisible after ACES). 300 puts the hull front at ~1.2x sun and
// the barrel underside at 3-8x in the composed frame — a clear warm kick —
// while the ground pool still dies inside ~6 m (range 12 with the quartic
// cutoff), so the old "ground glow >> flash" inversion cannot return.
// r7 (critic: "no light splash on terrain readable from the chase cam"):
// 300 -> 460. At the composed 50 ms frame the hull front now reads ~1.8x sun
// and the ground pool inside ~6 m carries a clear warm kick; range stays 12
// with quadratic decay, so the r5 "20 m road wash" cannot return.
const MUZZLE_LIGHT_PEAK = 460;
const MUZZLE_LIGHT_RANGE = 12;
/** (233, the media lane's Q2: one 460 cd / 12 m muzzle light for every gun, so a rifle-calibre burst pooled the ground as
 *  a 125 mm shot did, and the pool stood white on snow) the light follows the bore: the tuned peak and reach above are a
 *  120-125 mm gun's, the peak scaling as the bore^1.2 (7.62 mm ~16 cd, 12.7 mm ~30, 30 mm ~85, 152 mm ~600) and the reach
 *  as its square root (3 m for a rifle calibre, 5.9 m for 30 mm, 13.4 m for 152 mm); and it follows the ground under the
 *  muzzle, as a burst's own pulse does (blastRecipes' albedoK): snow returns about four times turf's light, so a third
 *  of the peak, sand two thirds. */
const MUZZLE_LIGHT_REF_MM = 122.5, MUZZLE_LIGHT_BORE_POW = 1.2;
const MUZZLE_LIGHT_SNOW_K = 0.33, MUZZLE_LIGHT_SAND_K = 0.66;
/** (240) at night the ground under a muzzle takes at most this many times the night's key light (muzzleLightPulse) */
const MUZZLE_NIGHT_GROUND_CAP = 8;
/** (EF.10) the local lights' gains on the smoke and dust they reach (a radiance gain on the medium's own colour, at the
 *  light; falling off as (1 - d / range)^2): a headlight's beam, a flash at its peak, a wreck's fire at its mean */
const LOCAL_HEADLIGHT_GAIN = 1.4, LOCAL_FLASH_GAIN = 2.4, LOCAL_FIRE_GAIN = 1.5;
/** a wreck fire's reach on its own smoke (m, x the column's scale): the lit underside only a few metres round the flames */
const LOCAL_FIRE_REACH_M = 5;
// lighting_post r3: 1.1 s / pow-3 decay left the light at 9% of peak while
// the fireball sprites were at their VISUAL peak (composed ageS 0.6) — the
// scene read as "fire barely influences lighting". 1.6 s + pow 1.6 keeps a
// readable warm pool (~42% at 0.6 s) for the fireball's visible lifetime
// while the front-loaded punch survives (t=0 still peak).
// lighting_post r3 (round 3): 1.6 s meant a staged capture at t=1.5 s caught
// ~1% of peak — the fireball sprite was huge/bright but its light was gone,
// so debris/turret right above it rendered pure black. 2.6 s tracks the
// fireball's ~2.4 s visible life (pow lowered 1.6 → 1.15 in lightStates).
// effects r6 (critic major: "explosion ground light reads as a painted
// stain ... static flat orange wash over the road, unchanged frame-to-frame
// for ~2.5 s"): 2.6 s at pow 1.15 held 230+ intensity through the composed
// 0.6 s frame and ~110 at 1.5 s — a parked uniform floor tint. The blast
// light now COLLAPSES with the fireball (1.15 s, pow 2.6 ≈ 13% at 0.6 s,
// dead by ~1 s) and hands off to the FLICKERING wreck-fire light in
// update() — living firelight, never a decal. Range 17 -> 13 m so the pool
// can't tint a road 10 m out (clamped to ~1.5 hull lengths).
// lighting_post r5 (critic MAJOR: "explosion light must light its debris"):
// 1.15 s collapsed before the composed 0.6 s frame caught any of it. 1.9 s
// (pow stays 2.6 — the light still collapses by ~1.5 s, so the r1
// "terracotta deck" long-tail cannot return) catches ~150 intensity at the
// composed frame: wreck deck ~1.7x sun, airborne turret underside blazing,
// grass ring warm to ~10 m.
const EXPLOSION_LIGHT_S = 1.9;
// 250 with CUBIC decay (was 85 quadratic): 85 was too weak to sell the blast
// on the surrounding terrain in the first 400 ms (r6). The cubic curve front-
// loads the energy — at 0.15 s it is ~3x the old warm-up, while by 0.6 s
// (the composed frame) it is back to ~25, so the wreck albedo never cooks
// to flat emissive orange (the regression that drove the 190 -> 85 cut).
// r5 (critic: "flat sickly yellow-green stain ... reads as a painted decal
// circle"): 430 over a 24 m range held the surrounding grass at ~half-sun
// intensity out to the hard range cutoff — a filled disc. 300 over 17 m
// falls below ~1/4 sun by 12 m, so the pool dies as inverse-square falloff
// well inside the cutoff; the hue moves off amber toward orange so the
// green channel stops lifting grass into the sickly band.
const EXPLOSION_LIGHT_PEAK = 520;
/** The explosion light's kill orange (effects r5: 0xff9a52 -> 0xff7f38); a burst's pulse may carry its own hue. */
const EXPLOSION_LIGHT_HEX = 0xff7f38;
/** (fx 8) a media kill's light pool: the fireball's warm yellow-orange, not the long orange of the kill light */
const KILL_POOL_LIGHT_HEX = 0xffa458;
/** (fx 9: 8t, wave 405's critics on both arms: "the flat orange ground ellipse at 0.0 s") a plain kill's fire lights the
 *  hull and the ground round it in a small, brief, paler pool, the light low over the deck: the pooled explosion light's
 *  13 m reach from 3.2 m over the hull tinted a ~12 m disc of ground orange */
const PLAIN_KILL_LIGHT = Object.freeze({ hex: 0xffc890, peakK: 0.1, durS: 0.25, rangeM: 11, overDeckM: 1.8 });
/** an ammunition cook-off keeps its pool, shortened and a little nearer */
const COOKOFF_LIGHT = Object.freeze({ peakK: 0.3, durS: 0.5, rangeM: 20 });
/** (the combat review 10-13: "the blast light paints a flat, saturated red-orange disc on the ground ... it reads like a
 *  decal, not light; it needs inverse-square-like falloff, a colour temperature that cools as it fades, and no visible
 *  edge") a pulse's ground light is capped: the ground straight under the light never takes more than LIGHT_GROUND_CAP x
 *  the sun's irradiance (the flat, clipped centre of the disc), its reach is at least LIGHT_REACH_K x its height (the
 *  window's edge falls where the inverse square has already faded it to a few per cent), and its hue cools from the
 *  pulse's own toward a deep ember red as it fades. */
const LIGHT_GROUND_CAP = 2.0, LIGHT_REACH_K = 4.5, LIGHT_COOL_HEX = 0xb83a14;
// 40 (was 30) + a 35 s smolder tail (r7: "battlefield shows no lasting
// evidence a tank just died" — WoT wrecks pump a column for 20 s+ and
// smolder for the rest of the match).
const SMOKE_COLUMN_S = 40;
/** A burning map vehicle's fire and smoke (s): it chars over the first seconds, then smoulders out; a car burns longer
 *  (r1c: night wrecks killed a minute before had no fire left; a car fire burns for many minutes). */
const VEHICLE_BURN_S = 18;
const CAR_BURN_S = 30;
/** A fire's life (the car-wreck lane, 233: "the fire glow can outlast the visible flame"): it dies down over its last
 *  FLAME_FADE_S (a car's CAR_FLAME_FADE_S) as its licks thin and shrink, and its light goes with them; a car's fire takes
 *  hold over CAR_FLAME_RISE_S. */
const FLAME_FADE_S = 4;
const CAR_FLAME_FADE_S = 6;
const CAR_FLAME_RISE_S = 1.2;
/** A burning column's flame now (0: none — a smoke-only column, or burnt out and smouldering — to 1). */
function flameOf(col: SmokeColumn): number {
  if (col.flame === false || !(col.ttl > 0)) return 0;
  const fade = Math.min(1, col.ttl / (col.car ? CAR_FLAME_FADE_S : FLAME_FADE_S));
  const rise = col.car ? Math.min(1, Math.max(0, (CAR_BURN_S - col.ttl) / CAR_FLAME_RISE_S)) : 1;
  return fade * fade * (3 - 2 * fade) * (0.35 + 0.65 * rise);
}
const SMOKE_SMOLDER_S = 35;    // post-column ember/wisp stage on the wreck
/** (233, the integrator's confirmation critic: at night the tongues read as "two pill-shaped sprite blobs") a tank
 *  wreck's licks are the day's tongues by day only: from this dark level up (the tracers' light level, 0 day .. 1 night)
 *  its column licks flame-cut tongues on its deck (240: emitNightTongue). A burning car's tongues (emitCarFlames) burn so
 *  at every hour. */
const NIGHT_FIRE_DARK = 0.5;
/** (240) a night tongue's deck over the column's foot (m) when the kill named no hull height (`SmokeColumn.deck`) */
const NIGHT_TONGUE_DECK_M = 1.5;
/** (240) a wreck's deck under its night flames: this share of the hull's height (a turret's roof stands at ~1) */
const DECK_OF_HEIGHT = 0.78;
/** (240) a night fire's light on its own smoke (nightSmokeGlowAt): from this far over its deck (its flames' tops), this
 *  many times the day slot's gain, over this reach (m, x the column's scale) */
const NIGHT_SMOKE_GLOW_UP_M = 0.9, NIGHT_SMOKE_GLOW_K = 3, NIGHT_SMOKE_GLOW_REACH_M = 2.8;
/** (240) a burning tank wreck's pooled light at night (updateWreckLight): over its deck (m), its gain on the day's, its
 *  reach (m; the day's 12) */
const NIGHT_FIRE_LIGHT_UP_M = 1.2, NIGHT_FIRE_LIGHT_K = 1.8, NIGHT_FIRE_LIGHT_RANGE_M = 18;
const SHELL_BURST_COLUMN_S = 14; // a shell hit's smoke-only column (the Studio's stand-in blast; no wreck burns)
// r5 column-continuity rebuild: 0.05 (was 0.11) — the 9 Hz cadence of very
// large puffs is what let the column macro-structure fall apart in motion
// (a detached dark blob with clear air between it and the burning wreck at
// +2.4-4.2 s). 20 Hz of HALF-SIZE puffs keeps the column a continuous
// turbulent volume. PERF: per-puff fill area drops with size^2, so 2.2x the
// rate at ~0.55x the card size is a net fill-rate REDUCTION per column.
const COLUMN_TICK_S = 0.05;
// Wind shear on the column (unit XZ dir * strength): higher puffs get more
// lateral velocity so the column visibly bends downwind instead of rising as
// a laser-straight stack. Matches the world wind's general drift direction.
// (EF.12, MASTER 94: one world wind) the pooled smoke's lean and drift: the presentation's surface wind (worldWind.ts) at
// the columns' own share of its speed (0.515: the fixed 1.6/0.55 lean gives the 0.82/0.28 the columns always had), set
// every frame in update()
const COLUMN_WIND_SHARE = 0.515;
let COLUMN_WIND_X = 0.82, COLUMN_WIND_Z = 0.28;
// PERF: cap concurrent smoke-column emitters. Late battle every wreck runs a
// 30 s column at dozens of puffs/s; 5+ simultaneous columns is pure
// fill-rate pile-up at retina resolutions (measured 25-28 ms frames in
// the 60 s probe tail). 4 columns reads identically in battle — when a 5th
// kill lands, the column closest to burning out is retired early.
const MAX_COLUMNS = 4;


// ---------------------------------------------------------------------------
// Module-scope scratch (reused — no per-frame allocation)
// ---------------------------------------------------------------------------

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _v6 = new THREE.Vector3();
const _camV = new THREE.Vector3(); // camera-relative scratch (never aliased by callers)
const _mfPos = new THREE.Vector3(); // spawnMuzzleFlash-private origin copy
const _mfDir = new THREE.Vector3(); // spawnMuzzleFlash-private direction copy
const _gpPos = new THREE.Vector3(); // gunshipMuzzleFx's gun port
const _gpSide = new THREE.Vector3(); // gunshipMuzzleFx's level heading toward the guns' target
const _sv = new THREE.Vector3();     // recipe-internal scratch (never an argument carrier)
const _subjectAnchor = new THREE.Vector3(); // moving-emitter attachment scratch
const _UP = new THREE.Vector3(0, 1, 0);  // read-only
const _c0 = new THREE.Color();

/** Build an orthonormal basis (outU, outV) perpendicular to unit dir. */
function basisFrom(dir: THREE.Vector3, outU: THREE.Vector3, outV: THREE.Vector3): void {
  if (Math.abs(dir.y) < 0.94) outU.set(0, 1, 0);
  else outU.set(1, 0, 0);
  outU.crossVectors(outU, dir).normalize();
  outV.crossVectors(dir, outU).normalize();
}

function col3(hex: number, out: MutableVec3): MutableVec3 {
  _c0.setHex(hex);
  out[0] = _c0.r; out[1] = _c0.g; out[2] = _c0.b;
  return out;
}

/**
 * Scorch decal texture: charred black core, sooty radial streaks, irregular
 * bitten rim. RGB near-black, alpha carries the shape.
 * @param {() => number} rng
 * @returns {THREE.CanvasTexture}
 */
function makeScorchTexture(rng: Rng): THREE.CanvasTexture {
  const s = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = context2d(cv);
  ctx.clearRect(0, 0, s, s);
  const c = s / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0.0, 'rgba(4,3,3,0.94)');
  g.addColorStop(0.30, 'rgba(9,7,6,0.84)');
  g.addColorStop(0.62, 'rgba(14,11,9,0.52)'); // r5: mid-ring lifted — the part visible past the hull
  g.addColorStop(1.0, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  // radial soot rays
  for (let i = 0; i < 24; i++) {
    const a = rng() * Math.PI * 2;
    const len = (0.34 + rng() * 0.5) * c;
    const w = (0.03 + rng() * 0.05) * c;
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(a);
    const sg = ctx.createRadialGradient(len * 0.9, 0, 0, len * 0.9, 0, len);
    sg.addColorStop(0, 'rgba(6,5,4,0.5)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.ellipse(len * 0.9, 0, len, w, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // irregular rim bite-outs
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 16; i++) {
    const a = rng() * Math.PI * 2;
    const d = (0.55 + rng() * 0.45) * c;
    const bx = c + Math.cos(a) * d;
    const by = c + Math.sin(a) * d;
    const r = (0.07 + rng() * 0.15) * c;
    const bg = ctx.createRadialGradient(bx, by, 0, bx, by, r);
    bg.addColorStop(0, 'rgba(0,0,0,0.85)');
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, s, s);
  }
  ctx.globalCompositeOperation = 'source-over';
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * Dust-pressure annulus for the expanding shockwave ring: a translucent band
 * with a feathered (never hard) inner edge, radial streak stretching, and
 * fbm-eroded alpha so it reads as a torn dust wave, not solid geometry.
 * Alpha-only payload (RGB white — material color supplies the dirt tint).
 * @param {() => number} rng
 * @returns {THREE.CanvasTexture}
 */
function makeShockRingTexture(rng: Rng): THREE.CanvasTexture {
  const s = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = context2d(cv, { willReadFrequently: true });
  ctx.clearRect(0, 0, s, s);
  const c = s / 2;
  // soft band: wide feathered shoulders on BOTH edges (the r5 hard inner
  // edge is what made the ring read as a whipped-cream torus)
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0.40, 'rgba(255,255,255,0)');
  g.addColorStop(0.62, 'rgba(255,255,255,0.30)');
  g.addColorStop(0.80, 'rgba(255,255,255,0.72)');
  g.addColorStop(0.92, 'rgba(255,255,255,0.34)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  // radial streak stretching: dust dragged outward by the pressure front
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 42; i++) {
    const a = rng() * Math.PI * 2;
    const r0 = (0.42 + rng() * 0.26) * c;
    const len = (0.26 + rng() * 0.34) * c;
    const w = (0.014 + rng() * 0.035) * c;
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(a);
    const sg = ctx.createLinearGradient(r0, 0, r0 + len, 0);
    sg.addColorStop(0, 'rgba(255,255,255,0)');
    sg.addColorStop(0.55, `rgba(255,255,255,${0.22 + rng() * 0.25})`);
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(r0, -w, len, w * 2);
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
  // fbm erosion: bite the band apart so no arc is a continuous solid
  const fbm = makeFbm(rng);
  const img = ctx.getImageData(0, 0, s, s);
  const d = img.data;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const n = fbm(x / s * 2.3, y / s * 2.3);
      const m = Math.max(0, Math.min(1, n * 2.0 - 0.35));
      d[(y * s + x) * 4 + 3] = Math.min(255, d[(y * s + x) * 4 + 3] * m);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// Preallocated emit-option scratch objects (mutated per emit call)
const _puffO: PuffScratch = { pos: [0, 0, 0], vel: [0, 0, 0], life: 1, size0: 1, size1: 2, rot: 0, rotVel: 0, col0: [0, 0, 0], col1: [0, 0, 0], alpha: 1, grav: 0, birthOffset: 0 };
const _strkO: StreakScratch = { pos: [0, 0, 0], vel: [0, 0, 0], life: 1, width: 0.03, stretch: 0.02, grav: -21.6, col: [0, 0, 0], alpha: 1, seed: 0, birthOffset: 0 };
const _debO: DebrisScratch = { pos: [0, 0, 0], vel: [0, 0, 0], life: 4, axis: [0, 1, 0], spin: 5, scale: 0.2, groundY: 0, hot: false, seed: 0, birthOffset: 0 };
const _jetO: JetScratch = { pos: [0, 0, 0], axis: [0, 0, 1], life: 0.1, width: 0.4, len0: 0.4, len1: 2.5, seed: 0, col: [0, 0, 0], alpha: 1, birthOffset: 0 };

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create the combat VFX controller.
 * @param {object} engineCtx render-side dependency bundle (ARCHITECTURE §2.8)
 * @param {object} heightField terrain height query (ARCHITECTURE §2.7)
 * @param {{ seed?: number, resolveEntity?: (targetId: ShellId) => unknown }} [opts]
 * fx seed and live presentation-entity resolver
 * @returns {object} Fx per ARCHITECTURE §3.8.2
 */
/** The live fx runtime's turret-landing listener (one at a time: a new runtime replaces the last one's). */
let detachTurretLandingDust: (() => void) | null = null;

export function createFx(
  engineCtx: FxEngineContext,
  heightField: FxHeightField,
  options: FxOptions = {},
): FxRuntime {
  const steps = createFxSteps(engineCtx, heightField, options);
  let next = steps.next();
  while (!next.done) next = steps.next();
  return next.value;
}

/** Covered entry shares the synchronous recipe, yielding only private atlas pixels. */
export async function createFxChunked(
  engineCtx: FxEngineContext,
  heightField: FxHeightField,
  options: FxOptions,
  yieldForBudget: () => Promise<void>,
): Promise<FxRuntime> {
  const steps = createFxSteps(engineCtx, heightField, options);
  try {
    let next = steps.next();
    while (!next.done) {
      await yieldForBudget();
      next = steps.next();
    }
    return next.value;
  } catch (error) {
    // Throw through the suspended delegate to close its private pixel painter.
    steps.throw(error);
    throw error;
  }
}

function* createFxSteps(
  engineCtx: FxEngineContext,
  heightField: FxHeightField,
  { seed = 5000, resolveEntity, auxiliaryEntities, auxiliaryTime, auxiliaryReport, auxiliaryVisible, structureLook,
    world }: FxOptions = {},
): Generator<void, FxRuntime, void> {
  // Atlas RNG is independent. Prepare it before particles/clock providers so
  // no consumer can observe a half-created runtime across a painted frame.
  const impactDecals = yield* createImpactDecalsSteps({
    anisotropy: engineCtx && engineCtx.anisotropy,
    seed: (seed ^ 0x51f7a3) >>> 0,
  });
  const particles = createParticleSystem(engineCtx, { seed });
  // (fx 9, the owner 2026-10-11: the driving dust, exhaust and smoke "correct for the times of days") the pooled dust,
  // smoke and debris take the scene's light (sceneLightTint.ts: white by day, warm at dusk, a dim blue at night), every
  // frame in update() below; the emissive pools (fire's core, sparks, flashes) never do
  particles.setLightTintShading(true);
  // (EF.10) the local light loop compiles in only above Low and Ultra Low (a variant per preset, never a runtime branch)
  setLocalLightsCompiled(localLightsForPreset(resolvePresetName()));
  onPresetChange(() => { setLocalLightsCompiled(localLightsForPreset(resolvePresetName())); });
  // r5: tank-visual animation timelines (recoil, turret pop, char, embers)
  // age against THIS clock — see src/fx/clock.ts. Live play is unchanged
  // (the clock advances by render dt); frozen/stepped captures now hold and
  // step the destruction/fire beats exactly like every particle.
  registerFxClock(() => particles.getTime());
  // r6 tumbling-turret wake (critic: the popped turret "reads as a distant
  // bird" with no motion cue): tankFactory's applyPop samples the arc through
  // this bridge — dark smoke puffs + cooling ember flecks glued to the
  // turret's real flight path (backdated births for composed captures).
  registerPopTrail((x, y, z, heat, birthOffset = 0) => {
    _puffO.pos[0] = x; _puffO.pos[1] = y; _puffO.pos[2] = z;
    _puffO.vel[0] = (rng() - 0.5) * 0.7 + COLUMN_WIND_X * 0.4;
    _puffO.vel[1] = 0.4 + rng() * 0.7;
    _puffO.vel[2] = (rng() - 0.5) * 0.7 + COLUMN_WIND_Z * 0.4;
    _puffO.life = 1.0 + rng() * 0.8;
    _puffO.size0 = 0.5 + rng() * 0.3; _puffO.size1 = 1.6 + rng() * 0.8;
    _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2.5;
    col3(0x3a352f, _puffO.col0); col3(0x6a655c, _puffO.col1);
    _puffO.alpha = 0.42 + 0.2 * heat; _puffO.grav = 0.5;
    _puffO.birthOffset = birthOffset;
    particles.emit('smoke', _puffO);
    // hot early flight sheds ember flecks — the fireball's grip on the toss
    if (heat > 0.15 && rng() < 0.55) {
      _strkO.pos[0] = x; _strkO.pos[1] = y; _strkO.pos[2] = z;
      _strkO.vel[0] = (rng() - 0.5) * 2.2; _strkO.vel[1] = -0.5 - rng() * 1.5; _strkO.vel[2] = (rng() - 0.5) * 2.2;
      _strkO.life = 0.4 + rng() * 0.35;
      _strkO.width = 0.025 + rng() * 0.02; _strkO.stretch = 0.028; _strkO.grav = -12;
      col3(0xffb662, _strkO.col); _strkO.alpha = 0.5 + 0.4 * heat; _strkO.seed = rng();
      _strkO.birthOffset = birthOffset;
      particles.emit('sparks', _strkO);
    }
  });
  // physics lane (2026-10-10): a popped turret is a rigid body now; where it hits the ground (or a hull, a wall) its own
  // dust kicks out round the impact, sized by how fast it fell — not on a timer beside the hull
  detachTurretLandingDust?.();
  detachTurretLandingDust = onTurretLanding((x, y, z, speed) => {
    const gy = groundY(x, z);
    const ground = heightField?.getGroundType?.(x, z) ?? 'medium';
    updateDryDustColors(ground);
    const k = Math.min(1, Math.max(0.25, (speed - 2) / 8));
    const count = 4 + Math.round(8 * k);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rng() * 0.6;
      const out = (1.2 + rng() * 1.6) * (0.5 + k);
      _puffO.pos[0] = x + Math.cos(a) * 0.6; _puffO.pos[1] = Math.max(y, gy) + 0.15 + rng() * 0.3; _puffO.pos[2] = z + Math.sin(a) * 0.6;
      _puffO.vel[0] = Math.cos(a) * out + COLUMN_WIND_X * 0.3;
      _puffO.vel[1] = 0.35 + rng() * 0.9 * k;
      _puffO.vel[2] = Math.sin(a) * out + COLUMN_WIND_Z * 0.3;
      _puffO.life = 1.6 + rng() * 1.4;
      _puffO.size0 = (0.6 + rng() * 0.4) * (0.7 + 0.6 * k); _puffO.size1 = (2.0 + rng() * 1.2) * (0.7 + 0.6 * k);
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.6;
      col3(dustColor0, _puffO.col0); col3(dustColor1, _puffO.col1);
      _puffO.alpha = 0.34 + 0.24 * k; _puffO.grav = 0.25;
      _puffO.birthOffset = 0;
      particles.emit('smoke', _puffO);
    }
  });
  const group = new THREE.Group();
  group.name = 'fx';
  // Drone airframes and docks are lit meshes: they join the cascade setup like every vehicle material.
  if (engineCtx?.setupShadowMaterial) {
    configureDroneMaterials({ setup: (m) => engineCtx.setupShadowMaterial?.(m), release: (m) => engineCtx.releaseShadowMaterial?.(m) });
    // (ac130-fx-228) and the gunship's airframe
    configureGunshipMaterials({ setup: (m) => engineCtx.setupShadowMaterial?.(m), release: (m) => engineCtx.releaseShadowMaterial?.(m) });
  }
  // A drone whose flight ends in the air flies home over the battle world and lands on its carrier's dock.
  let droneWorldSeam: FxWorldSeam | null = null;
  const droneWorld = { raycast: (origin: { x: number; y: number; z: number }, direction: { x: number; y: number; z: number }, maxDist: number) =>
    droneWorldSeam?.raycast?.(origin, direction, maxDist) ?? null };
  const drones = createDronePresentation(group, {
    world: () => { droneWorldSeam = world?.() ?? null; return droneWorldSeam?.raycast ? droneWorld : null; },
    resolveCarrier: (ownerId) => {
      const owner = decalEntityFor(ownerId as ShellId);
      if (!owner) return null;
      return { frame: owner.visual?.root ? missionAttachmentVisualFrame(owner.visual.root) : undefined,
        destroyed: !!owner.combat?.destroyed, flying: owner.aerial?.active === true };
    },
    onReturnEvent: (id, event, reason) => {
      const log = (group.userData.droneFlightsHomeLog ??= []) as { id: string | number; event: string; reason: string }[];
      log.push({ id, event, reason }); if (log.length > 32) log.shift();
    },
  });
  // Diagnostics (films and probes): the flights home in progress, read off the FX group.
  group.userData.droneFlightsHome = () => drones.returning();
  group.matrixAutoUpdate = false;
  group.add(particles.group);
  // destruction-fx lane (2026-10-07): the simulated media and the thrown material. Desktop tiers only: the phone tier
  // keeps the pooled puffs below (no atlas download, no sort, no extra draws).
  const mediaTier = getDeviceTier() !== 'mobile';
  // (destruction stream 2026-10-13) the landing solves read the ground as drawn from its lattice's vertices, each once
  // until the ground changes (fx/latticeGround.ts): a collapse's hundreds of pieces cost the frame 20 ms reading every
  // crater and heap of their bucket at three vertices, a dozen times a piece
  let groundEpoch = 0;
  let groundOverlayRef: unknown = null;
  let groundFieldRef: unknown = null;
  const groundRevision = (): number => {
    const overlay = world?.()?.groundOverlay?.() ?? null;
    if (overlay !== groundOverlayRef || heightField !== groundFieldRef) { groundOverlayRef = overlay; groundFieldRef = heightField; groundEpoch++; }
    return groundEpoch * 1e6 + (overlay?.revision ?? 0);
  };
  const landingGround = createLatticeGround((x, z) => deformedGroundY(x, z), groundRevision, (x, z) => baseCellFlipped(x, z));
  const vol: VolumeMedia | null = mediaTier
    ? createVolumeMedia({ soft: particles.softParticles, now: () => particles.getTime(), scene: engineCtx.scene ?? null,
      heatGain: (camera) => (imagesHeat(camera) ? THERMAL_FIRE_GAIN : 1), heatCool: (camera) => (imagesHeat(camera) ? THERMAL_FIRE_COOL : 1) })
    : null;
  const chunks: DebrisChunks | null = mediaTier
    ? createDebrisChunks({ seed, now: () => particles.getTime(), scene: engineCtx.scene ?? null, groundAt: landingGround })
    : null;
  // World state, every tier: the marks a crater leaves, a building coming down in the world's own geometry (the world
  // hands its structure bucket materials to the mask's patch once per world, before the warm, so the programs compile
  // once) and what its stage builders write (rims, rooms, remnants, the pile) in its own materials. A phone that kept
  // a collapsed building standing would show a wall its hull drives through. Only the falling pieces scale by tier.
  // (orange-rings-230) both lit as the ground they lie on: the engine's cascades with the marks' shader hook
  const craterMarksOptions = { setupMaterial: (material: THREE.Material, hook: NonNullable<THREE.Material['onBeforeCompile']>) =>
    engineCtx?.setupShadowMaterial?.(material, hook) };
  const craters: CraterMarks | null = createCraterMarks(craterMarksOptions);
  // DST-04 (2026-10-15): the map's pre-placed craters' surfaces (world/mapCraters.ts) in slots of their own, so a
  // battle's craters never recycle them: laid once the world's bound ground holds them, again after every reset
  const mapCraterMarks: CraterMarks | null = createCraterMarks(craterMarksOptions);
  let mapCratersLaidEpoch = -1;
  // a mark that dug nothing clears the cover it blew away, through the world's presentation-only seam (a dug crater's
  // cover is the overlay's own law, on every peer: the core, 2026-10-08)
  const clearCover = (x: number, z: number, radiusM: number): void => {
    const w = world ? world() : null;
    w?.clearCoverAt?.(x, z, radiusM);
  };
  const structMask: StructureMask | null = createStructureMask(4096, { holes: mediaTier });
  // (2026-10-12, the owner: one physics engine for everything that falls) a building's larger falling pieces are bodies
  // of the engine the turret pops run on (sim/rigidBody.ts): the ground as drawn, the world's walls and records, each
  // other. The phone keeps every piece in the program (its pools are small and its frame tight)
  let bodyWorld: FxWorldSeam | null = null;
  let bodyEnv: RigidEnvironment | null = null;
  const bodyEnvironment = (): RigidEnvironment | null => {
    const w = world ? world() : null;
    if (!w) return null;
    if (w !== bodyWorld || !bodyEnv) {
      bodyWorld = w;
      const query = w.bodyRecordQuery?.() ?? null;
      // (the same lattice-read ground as the landing solves: a heap's bodies read it at every sphere every step)
      bodyEnv = { groundAt: landingGround, ...(query ? { queryStatic: query } : {}),
        isSolid: (record) => !record.crushed && !record.dead };
    }
    return bodyEnv;
  };
  const rubble: RubbleBodies | null = mediaTier
    ? createRubbleBodies({ now: () => particles.getTime(), environment: bodyEnvironment, capacity: RUBBLE_BODY_CAPACITY,
      materialFor: (bucket) => bucketMaterials.get(bucket)?.material
        ?? bucketAliases(bucket).map((alias) => bucketMaterials.get(alias)?.material).find(Boolean) ?? null,
      setupMaterial: (material) => engineCtx?.setupShadowMaterial?.(material) })
    : null;
  if (rubble) group.add(rubble.group);
  const structDebris: StructureDebris | null = createStructureDebris({
    bodies: rubble,
    now: () => particles.getTime(), scene: engineCtx.scene ?? null,
    // (round 7) pieces lie on the ground as drawn (a rubble mound, a crater's rim); a pile is seated on the ground under
    // it, per vertex (its heights stand over the sim's mound already)
    groundY: landingGround,
    baseGroundY: (x, z) => (heightField?.getContactHeightAt ? heightField.getContactHeightAt(x, z) : groundY(x, z)),
    poolCapacity: mediaTier ? 256 : 24, pieceCap: mediaTier ? 1024 : 160,
  });
  group.add(structDebris.group);
  // ---- the world's structure seam (DESTRUCTION.md §16.4): each stage's builder through the writers, its cuts into the
  // mask, its hides flattened, the static shadow cache touched while the GPU reshapes a building
  let seamWorld: FxWorldSeam | null = null;
  const looks = new Map<number, StructureLook | null>();
  function seamOf(id: number): StructureDamageSeam | null {
    const w = world ? world() : null;
    if (w !== seamWorld) { seamWorld = w; looks.clear(); }
    return w?.structureDamage?.(id) ?? null;
  }
  /** A structure's look: the caller's, else its anatomy's rubble and interior, else null (the masonry fallback). */
  function lookOf(id: number): StructureLook | null {
    const given = structureLook ? structureLook(id) : null;
    if (given) return given;
    const seam = seamOf(id);
    if (looks.has(id)) return looks.get(id) ?? null;
    const look = lookFromAnatomy(seam?.anatomy);
    looks.set(id, look);
    return look;
  }
  // a structure's stages laid into the world's own geometry (structureStages.ts): builders, cuts, hides, shadow touches
  // every bucket material the world draws, by bucket (a plain mesh's over a batch's clone): what the builders write in
  const bucketMaterials = new Map<string, { material: THREE.Material; batched: boolean }>();
  // the phone tier cuts no holes: it draws each cut on the wall's face (a breach still reads as damage)
  const scars: StructureScars | null = mediaTier ? null : createStructureScars();
  if (scars) group.add(scars.mesh);
  // (2026-10-15, the fracture package: the owner's "make their collapses much more natural, not slow down the game so
  // much") a building's walls break where they are struck and what falls — its cells, its panels, its roof — comes down
  // as bodies of the one engine in a pool of its own (fx/fractureStages.ts); desktop tiers, the phone keeps the kit's holes
  const pieceLanding = (x: number, y: number, z: number, speed: number, mass: number, id: number): void => {
    if (!blast) return;
    const look = lookOf(id);
    pieceLandingFx(blast, x, y, z, speed, mass, look);
    landingSpillFx(blast, x, y, z, speed, mass, look);
  };
  // (destruction-slabs 227 round 4; the round-3 critics: "phones get none of the round-3 hanging fix") the phone keeps the
  // kit's holes, falls and heaps but has what they leave hanging come down too: the stages' sweep alone (a third of the
  // desktop's work a frame, in steps a third the size) and a small pool for what it drops
  const fractureStages: FractureStages | null = createFractureStages({
    group, now: () => particles.getTime(), environment: bodyEnvironment, groundAt: landingGround,
    materialFor: (bucket) => bucketMaterials.get(bucket)?.material ?? null,
    onLanding: pieceLanding,
    onShards: (x, y, z, vx, vy, vz, mass, id) => { if (blast) breakShardsFx(blast, x, y, z, vx, vy, vz, mass, lookOf(id)); },
    hulls: auxiliaryEntities ? () => auxiliaryEntities() as Iterable<unknown> : undefined,
    ...(mediaTier ? {} : { sweepOnly: true, capacity: 16, poolShare: 0, hangingSteps: 4, hangingSlice: 4000 }),
  });
  const stages: StructureStages | null = structMask && structDebris
    ? createStructureStages({ mask: structMask, debris: structDebris, now: () => particles.getTime(),
      materialFor: (bucket) => bucketMaterials.get(bucket)?.material ?? null, scars, crumble: mediaTier ? 1 : 0.15,
      fracture: fractureStages ? fractureStages.attach : null,
      onLanding: pieceLanding,
      onShards: (x, y, z, vx, vy, vz, mass, id) => { if (blast) breakShardsFx(blast, x, y, z, vx, vy, vz, mass, lookOf(id)); } })
    : null;
  /** Each struck building's last burst (fx seconds), the dust load in the air round it then (the bursts' scales, each
   *  fading over 1.5 s) and the largest burst in that load (also fading): a burst's own dust thins by the load against its
   *  own size, unless it is far bigger than what raised the load (dcore 2026-10-11, waves 397/401). */
  const strikeDust = new Map<number, [number, number, number]>();
  /** The last detonation on a structure (munition:blast), for the shell event that follows it. */
  const lastBlast = { x: 0, y: 0, z: 0, structureId: -1 };
  let patchedWorld: FxWorldSeam | null = null;
  function attachWorld(): void {
    if (!structMask || !world) return;
    const w = world();
    if (!w || w === patchedWorld || typeof w.patchStructureMaterials !== 'function') return;
    patchedWorld = w;
    bucketMaterials.clear();
    // every bucket material once, its shadow depth materials among them (role 'depth')
    w.patchStructureMaterials((material, info) => {
      structMask.patch(material);
      if (!info || info.role !== 'surface' || !info.bucket) return;
      const known = bucketMaterials.get(info.bucket);
      if (!known || (known.batched && !info.batched)) bucketMaterials.set(info.bucket, { material, batched: info.batched });
    });
  }
  if (vol) group.add(vol.group);
  // (FX lane 10-14) a missile's smoke trail, a soft tube born at its nozzle (missileTrails.ts), and a wire-guided missile's
  // command wire, fixed to its launcher's tube: every tier (one draw each), in the time of day's light
  const missileLight = createSceneLightUniforms();
  const smokeTrails = createMissileTrails(missileLight, particles.softParticles);
  group.add(smokeTrails.mesh);
  const wires = createMissileWires(missileLight);
  group.add(wires.mesh);
  if (chunks) group.add(chunks.group);
  if (craters) group.add(craters.mesh);
  if (mapCraterMarks) group.add(mapCraterMarks.mesh);

  let rng = mulberry32(seed);
  let frozen = false;
  // Killcam reconstruction temporarily presents a pre-impact tank in the
  // same world as its already-recorded destruction. Keep the pooled scene
  // objects alive (stable Three.js light/program counts), but do not let the
  // old wreck emitters or their orange light leak over that intact replay.
  // The impact/finale beat releases this gate before spawning its own FX.
  let replaySuppressed = false;

  // --- dynamic lights (budget: exactly 2 PointLights) -----------------------
  // Muzzle: warm white-amber (was deep orange — the "saturated ground decal"
  // read); tighter range so it kisses the hull rather than floods the field.
  const muzzleLight = new THREE.PointLight(0xffe4c4, 0, MUZZLE_LIGHT_RANGE, 2); // r5: less saturated kiss
  // lighting_post r5: range 34 -> 24 — the wide range warmed the ENTIRE
  // visible field to mustard from the 22 m camera; wreck/debris keep their
  // warm pool, the wider grass field drops out of the mustard band.
  // effects r5: 24 -> 17 + hue 0xff9a52 -> 0xff7f38 (see EXPLOSION_LIGHT_PEAK)
  // effects r6: 17 -> 13 (the static-stain fix — see EXPLOSION_LIGHT_S)
  const explosionLight = new THREE.PointLight(EXPLOSION_LIGHT_HEX, 0, 13, 2);
  const _lightCool = new THREE.Color(LIGHT_COOL_HEX);
  muzzleLight.castShadow = false;
  explosionLight.castShadow = false;
  group.add(muzzleLight, explosionLight);
  // (2026-10-14, contact r2) unshadowed, so the near hulls shadow them on the ground in the aerial pass (groundKeyLights.ts)
  registerGroundKeyLight(muzzleLight);
  registerGroundKeyLight(explosionLight);
  // pow: temporal decay exponent — explosion uses 3 (front-loaded punch that
  // collapses fast, see EXPLOSION_LIGHT_PEAK note), muzzle keeps 2.
  // r1 CLOCK-BASED AGING: lights (and rings below) age against the SHARED
  // particle clock (bornAt), not a self-advanced timer gated on !frozen —
  // the old self-timer never decayed across frozen stepped captures, so
  // every destroy_* frame past 0 s still carried the FULL 430-peak orange
  // blast light parked over the wreck (THE "uniform terracotta deck").
  const lightStates: LightState[] = [
    { light: muzzleLight, bornAt: -1e9, dur: MUZZLE_LIGHT_S, peak: MUZZLE_LIGHT_PEAK, pow: 2, baseDur: MUZZLE_LIGHT_S, basePow: 2 },
    // pow 2.6 (was 1.15): front-loaded blast punch that visibly collapses —
    // the r5 near-linear decay was the "static painted stain" (r6 major)
    { light: explosionLight, bornAt: -1e9, dur: EXPLOSION_LIGHT_S, peak: EXPLOSION_LIGHT_PEAK, pow: 2.6, baseDur: EXPLOSION_LIGHT_S,
      basePow: 2.6 },
  ];

  /** (233) a gun's muzzle light by its bore and the ground under its muzzle: peak (x MUZZLE_LIGHT_PEAK) and reach (m) */
  const muzzlePulse = { peakK: 1, range: MUZZLE_LIGHT_RANGE };
  function muzzleLightPulse(caliberMm: number, x: number, y: number, z: number): typeof muzzlePulse {
    const bore = Number.isFinite(caliberMm) && caliberMm > 0 ? caliberMm / MUZZLE_LIGHT_REF_MM : 1;
    const surface = classifyTerrain(heightField, x, z);
    const groundK = surface === 'snow' ? MUZZLE_LIGHT_SNOW_K : surface === 'sand' ? MUZZLE_LIGHT_SAND_K : 1;
    let peakK = THREE.MathUtils.clamp(Math.pow(bore, MUZZLE_LIGHT_BORE_POW), 0.03, 1.4) * groundK;
    // (240, the coordinator: a big gun's flash "pooling white on snow" at night) under the night's open camera (about two
    // stops over the day's) the ground straight under the muzzle takes at most MUZZLE_NIGHT_GROUND_CAP x the night's key
    // light (the moon), as the explosion light's pool is capped against the sun: a 125 mm round lights the snow round it
    // for its instant, warm, without burning it to a white band; a small gun's kiss is under the cap and unchanged; by day
    // (the dark level 0) nothing changes
    const dark = tracers.darkLevel();
    if (dark > 0) {
      const ground = groundY(x, z);
      const h = Number.isFinite(ground) ? Math.max(1, y - ground) : 1;
      const rig = (engineCtx.scene?.userData as { lightRig?: { sunIntensity?: number } } | undefined)?.lightRig;
      const cap = MUZZLE_NIGHT_GROUND_CAP * Math.max(0.3, rig?.sunIntensity ?? 4.5) * h * h / MUZZLE_LIGHT_PEAK;
      peakK += (Math.min(peakK, cap) - peakK) * dark;
    }
    muzzlePulse.peakK = peakK;
    muzzlePulse.range = THREE.MathUtils.clamp(MUZZLE_LIGHT_RANGE * Math.sqrt(bore), 3, 14);
    return muzzlePulse;
  }

  function lightAge(state: LightState): number {
    return particles.getTime() - state.bornAt;
  }

  function applyLight(state: LightState): void {
    if (replaySuppressed) {
      state.light.intensity = 0;
      return;
    }
    const age = lightAge(state);
    const k = Math.max(0, 1 - age / state.dur);
    let v = state.peak * Math.pow(k, state.pow || 2);
    // r7 fire-moment exposure wash (critic: "at ignition the flash glow +
    // dust veil bleach the firing tank and ~half the frame to cream"): the
    // muzzle light ATTACKS over ~40 ms instead of stamping full peak on the
    // ignition frame — t=0/17 ms keep the hull camo legible, while the
    // composed 50 ms frame (and the 60 ms petal beat) still catch ~full peak.
    if (state.light === muzzleLight) v *= THREE.MathUtils.smoothstep(age, 0.0, 0.042);
    // r6: fire is never a steady lamp — the blast light carries a two-band
    // flicker past its initial pop so the floor pool visibly LIVES while it
    // collapses (the static-stain fix's motion half).
    if (state.light === explosionLight && k > 0 && k < 0.92) {
      const t = particles.getTime();
      v *= 0.80 + 0.13 * Math.sin(t * 15.3) + 0.07 * Math.sin(t * 7.7 + 1.3);
    }
    // (the combat review 10-13) a pulse's colour temperature cools as it fades: its own hue at the peak, a deep ember red
    // at its end (the wreck's fire flicker sets its own orange after)
    if (state.light === explosionLight && state.hotHex !== undefined && k > 0) {
      state.light.color.setHex(state.hotHex).lerp(_lightCool, Math.min(1, (1 - k) * 1.15));
    }
    // (black-screen-228 RC6) a scene light with a NaN intensity poisons every lit fragment, even at zero
    state.light.intensity = Number.isFinite(v) ? v : 0;
  }

  function flashLight(
    state: LightState,
    pos: THREE.Vector3,
    peak: number,
    ageS = 0,
    durS?: number,
    pow?: number,
    hex?: number,
    range?: number,
  ): void {
    // (black-screen-228 RC6) a pulse with a non-finite place never moves a light there
    if (!(Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z))) return;
    state.light.position.copy(pos);
    // (233) the muzzle light's reach: its gun's (muzzleLightPulse), the 12 m default for every other muzzle-light pulse
    if (state.light === muzzleLight) state.light.distance = range && range > 0 ? range : MUZZLE_LIGHT_RANGE;
    // (fx 9: 8t) the pulse's own reach (the pooled explosion light: 13 m unless the pulse asks less)
    if (state.light === explosionLight) {
      state.range = range && range > 0 ? range : 13;
      state.light.distance = state.range;
    }
    // (fx round 7c) a burst's pulse carries its own hue; every other use of the explosion light keeps the kill orange
    if (state.light === explosionLight) {
      state.hotHex = hex ?? EXPLOSION_LIGHT_HEX;
      state.light.color.setHex(state.hotHex);
      // (the combat review 10-13) no flat clipped disc and no visible edge: the ground under the light takes at most
      // LIGHT_GROUND_CAP x the sun (at least a dusk sun's worth, so a night flash still lights its ground), and the reach
      // runs out where the inverse square has already faded the pool
      const ground = groundY(pos.x, pos.z);
      const h = Number.isFinite(ground) ? Math.max(1, pos.y - ground) : 1;
      const rig = (engineCtx.scene?.userData as { lightRig?: { sunIntensity?: number } } | undefined)?.lightRig;
      const sunI = Math.max(2, rig?.sunIntensity ?? 4.5);
      peak = Math.min(peak, LIGHT_GROUND_CAP * sunI * h * h);
      state.range = Math.max(state.range ?? 13, LIGHT_REACH_K * h);
      state.light.distance = state.range;
    }
    state.bornAt = particles.getTime() - ageS;
    state.peak = Number.isFinite(peak) ? peak : 0;
    state.dur = durS && durS > 0 ? durS : state.baseDur;
    state.pow = pow && pow > 0 ? pow : state.basePow;
    applyLight(state);
  }

  // ---- atmospherics lane (begin): the projectile tracers (projectileTracers.ts) draw every ballistic round in flight
  // (belt mix, ammunition colour, light-keyed halo, tumble, burnout); the shooter resolves through this frame's subject
  // resolver (the Studio's actors) and else the battle's entities
  let tracerSubject: ((id: string) => FxEntity | null) | null = null;
  /** (ac130-fx-228 r2) this frame's camera images heat (writeLiveShellTracers sets it from the camera's vision) */
  let heatCamera = false;
  const tracers = createProjectileTracers({
    shooter: (id) => {
      if (id == null) return null;
      const subject = (tracerSubject ? tracerSubject(String(id)) : null) ?? decalEntityFor(id);
      return subject?.spec ?? null;
    },
    scene: engineCtx.scene ?? null,
    now: () => particles.getTime(),
    // (ac130-fx-228) a networked gunship round names no weapon: its aircraft does
    gunship: (id) => id != null && subjectFor(id)?.aerial?.kind === 'gunship',
    // (ac130-fx-228 r2) the camera images heat this frame (writeLiveShellTracers reads it off the camera, as the grade does)
    thermal: () => heatCamera,
    // (ac130-barrels-230) a gunship round seen from its own lens leaves its gun drawn beside the lens
    lens: (heavy, ox, oy, oz, dx, dy, dz, out) => lensOffset(heavy ? 'howitzer' : 'cannon', ox, oy, oz, dx, dy, dz, out),
  });
  group.add(tracers.mesh);
  // ---- atmospherics lane (end)

  // Guided missiles need a readable projectile, not only a tracer's
  // streak. Instanced pools draw the missile's airframe and its hot
  // exhaust point without allocating meshes during flight. Geometry faces local +Z, matching projectile velocity.
  // (FX lane 10-15) each family's own airframe at the round's calibre (missileBodies.ts: the TOW's probe, wings and tail
  // fins, the Kornet's canards and folding wings, the Spike's seeker dome...), lit by the time of day's rig; the flare
  // is its tracking beacon or motor's hot core at the tail, in the look's colour
  const bodies = createMissileBodies(missileLight, MAX_ATGM_BODIES);
  const atgmFlareGeo = new THREE.SphereGeometry(ATGM_FLARE_RADIUS_M, 8, 6);
  const atgmFlareMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const atgmFlares = new THREE.InstancedMesh(atgmFlareGeo, atgmFlareMat, MAX_ATGM_BODIES);
  atgmFlares.count = 0;
  atgmFlares.frustumCulled = false;
  atgmFlares.renderOrder = 26;
  atgmFlares.layers.set(LATE_FX_LAYER);
  atgmFlares.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // (ac130-fx-228 r2, the motion critic: every Hellfire launch in the gunner's lens "pops a flat, hard-edged white
  // 12-sided polygon (unlit disc, no soft falloff)") the motor's hot core is a glow, not a solid: bright where the sphere
  // faces the eye and gone at its rim, so even close up it reads as a hot point with a soft edge, never a cut-out disc
  // (writeGuidedBody also caps its angular size near the camera; the screen-space halo is tracers.glow's)
  atgmFlareMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vFlareFace;')
      .replace('#include <project_vertex>', `#include <project_vertex>
  // the instances carry no rotation and one scale: the view-space normal is the normal matrix's
  vFlareFace = max( dot( normalize( normalMatrix * normal ), normalize( -mvPosition.xyz ) ), 0.0 );`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFlareFace;')
      .replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\n  diffuseColor.a *= vFlareFace * vFlareFace * vFlareFace;');
  };
  atgmFlareMat.customProgramCacheKey = () => 'fx-motor-flare-soft';
  // (fx 9a) instance colours from the start: one program variant for every missile, warmed with the pools
  {
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < MAX_ATGM_BODIES; i++) atgmFlares.setColorAt(i, white);
  }
  group.add(bodies.group, atgmFlares);

  // every missile and rocket in flight by shell id: its look, its smoke trail's slot and its wire (fx 9a, FX lane 10-14)
  const guidedTrails = new Map<ShellId, GuidedTrail>();
  const _atgmFlareObject = new THREE.Object3D();
  let renderedAtgmBodies = 0;
  let renderedAtgmTrailSegments = 0;

  // --- scorch decals (pooled, persistent, slope-aligned) ---------------------
  const MAX_SCORCH = 8;
  const scorchTex = makeScorchTexture(mulberry32((seed ^ 0x9e3779) >>> 0));
  const scorchMat = new THREE.MeshBasicMaterial({
    map: scorchTex,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  // r5 TERRAIN-DRAPED scorch: the old single-plane disc was slope-ALIGNED but
  // flat, so on any convex ground (road crowns, hill shoulders — i.e. exactly
  // where kills happen) its outer half cut UNDER the surface and the wreck
  // showed no ground scorch at all (r4 wreck-closeup major). Each pooled
  // decal now owns a 4-ring disc whose vertices are conformed to the sampled
  // terrain height at stamp time.
  const SCORCH_SEG = 24, SCORCH_RINGS = 4;
  function makeScorchDiscGeo() {
    const verts = [0, 0, 0];
    const uvs = [0.5, 0.5];
    const idx = [];
    for (let r = 1; r <= SCORCH_RINGS; r++) {
      const rad = r / SCORCH_RINGS;
      for (let s = 0; s < SCORCH_SEG; s++) {
        const a = (s / SCORCH_SEG) * Math.PI * 2;
        verts.push(Math.cos(a) * rad, 0, Math.sin(a) * rad);
        uvs.push(Math.cos(a) * rad * 0.5 + 0.5, Math.sin(a) * rad * 0.5 + 0.5);
      }
    }
    const ringStart = (r: number) => 1 + (r - 1) * SCORCH_SEG;
    for (let s = 0; s < SCORCH_SEG; s++) idx.push(0, ringStart(1) + s, ringStart(1) + (s + 1) % SCORCH_SEG);
    for (let r = 1; r < SCORCH_RINGS; r++) {
      const a0 = ringStart(r), b0 = ringStart(r + 1);
      for (let s = 0; s < SCORCH_SEG; s++) {
        const s1 = (s + 1) % SCORCH_SEG;
        idx.push(a0 + s, b0 + s, b0 + s1, a0 + s, b0 + s1, a0 + s1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    return g;
  }
  const scorchTemplate = makeScorchDiscGeo();
  const scorchTemplatePos = bufferAttribute(scorchTemplate, 'position').array;
  const scorchMeshes: Array<THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>> = [];
  let scorchCursor = 0;
  for (let i = 0; i < MAX_SCORCH; i++) {
    const g = scorchTemplate.clone();
    bufferAttribute(g, 'position').setUsage(THREE.DynamicDrawUsage);
    const m = new THREE.Mesh(g, scorchMat);
    m.visible = false;
    m.frustumCulled = false; // vertices are written in world space
    m.matrixAutoUpdate = false;
    m.renderOrder = 2; // after terrain, before all particles
    group.add(m);
    scorchMeshes.push(m);
  }

  /** Stamp a charred-ground decal at (x, z), draped over the terrain. */
  function spawnScorch(x: number, z: number, radius: number): void {
    const m = scorchMeshes[scorchCursor];
    scorchCursor = (scorchCursor + 1) % MAX_SCORCH;
    const attr = bufferAttribute(m.geometry, 'position');
    const arr = attr.array;
    const yaw = rng() * Math.PI * 2;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    for (let i = 0; i < arr.length; i += 3) {
      const lx = scorchTemplatePos[i], lz = scorchTemplatePos[i + 2];
      const wx = x + (lx * cy - lz * sy) * radius;
      const wz = z + (lx * sy + lz * cy) * radius;
      arr[i] = wx;
      arr[i + 1] = groundY(wx, wz) + 0.08;
      arr[i + 2] = wz;
    }
    attr.needsUpdate = true;
    m.visible = true;
  }

  // --- shockwave rings (pooled, ground-aligned, first ~400 ms of a blast) ----
  // Normal-blended dusty tint at low opacity: a translucent pressure/dust
  // wave skimming the grass — the r5 additive cream torus read as geometry.
  const SHOCK_DUR = 0.4;
  const shockTex = makeShockRingTexture(mulberry32((seed ^ 0x3c6ef3) >>> 0));
  const shockGeo = new THREE.CircleGeometry(1, 48);
  shockGeo.rotateX(-Math.PI / 2); // face up
  const shockRings: ShockRingState[] = [];
  // (ac130-fx-228 r3, the blind critic's night "full-lens tan wash" through the gunship's lens, the base build's too) the
  // ring is dust, not light: unlit, it drew its daylight tan at every hour, and at night the camera's exposure lifted it
  // into a glowing band; through the 3.6x lens its 20-26 m sweep crossed the whole frame. It takes the pools' light tint
  // (white by day, so the daylight ring is unchanged; a dim blue at night) as the prints and the scars do, and while it is
  // young and small by the fireball the burst's own warm light (the r5 blind critic: "the night ring is effectively
  // invisible"): lit as it leaves the burst, the moonlit dust by the time it spreads across the lens (applyShockRing)
  const SHOCK_COLOR = new THREE.Color(0x90887a);
  const SHOCK_BURST_LIT = new THREE.Color(1.0, 0.78, 0.52);
  const SHOCK_BURST_K = 0.7;
  // (ac130-fx-228 r3, the r5 blind critic: "a hard-edged grey arc band sweeping in" through the thermal lens) dust at the
  // ground's own temperature barely shows to a heat-imaging lens (the grade images luminance): a quarter of its opacity,
  // never the burst's light
  const SHOCK_HEAT_K = 0.25;
  for (let i = 0; i < 2; i++) {
    const mat = new THREE.MeshBasicMaterial({
      map: shockTex,
      color: SHOCK_COLOR,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const m = new THREE.Mesh(shockGeo, mat);
    m.visible = false;
    // (ac130-fx-228 r3, first-use-who probe: the first on-screen pressure ring linked its late-pass program mid-battle,
    // 8-107 ms) never culled, as the tracers and the motor flares are not: the covered warm spawns one wherever the
    // player's field is (under an AC-130's orbit, outside its gimbal's view) and its draw must still reach the late pass
    m.frustumCulled = false;
    m.renderOrder = 20;
    m.layers.set(LATE_FX_LAYER);
    group.add(m);
    shockRings.push({ mesh: m, mat, bornAt: -1e9 });
  }
  let shockCursor = 0;

  function applyShockRing(r: ShockRingState): void {
    if (replaySuppressed) {
      r.mesh.visible = false;
      r.mat.opacity = 0;
      return;
    }
    const t = (particles.getTime() - r.bornAt) / SHOCK_DUR;
    if (t >= 1 || t < 0) { r.mesh.visible = false; r.mat.opacity = 0; return; }
    const k = 1 - Math.pow(1 - t, 2.4);         // fast launch, decelerating
    // r7 (critic: "no readable expanding ground shockwave ring in the first
    // 400 ms"): faster radial launch + ~50% more opacity so the ring reads
    // against road/dirt at the 20 m kill framing before it dies at 400 ms.
    r.mesh.scale.setScalar((1.6 + 14.5 * k) * (r.scaleK || 1));
    r.mat.opacity = 0.45 * (r.alphaK || 1) * Math.pow(1 - t, 1.5) * (heatCamera ? SHOCK_HEAT_K : 1);
    const tint = particles.sharing.uLightTint.value, lit = heatCamera ? 0 : SHOCK_BURST_K * Math.pow(1 - t, 2.5);
    r.mat.color.setRGB(SHOCK_COLOR.r * Math.max(tint.r, lit * SHOCK_BURST_LIT.r), SHOCK_COLOR.g * Math.max(tint.g, lit * SHOCK_BURST_LIT.g),
      SHOCK_COLOR.b * Math.max(tint.b, lit * SHOCK_BURST_LIT.b));
    r.mesh.visible = true;
  }

  /**
   * Launch a pressure ring expanding across the ground from (x, z).
   * scaleK/alphaK let the muzzle-blast reuse the pool at reduced footprint
   * (r4: the 120 mm live fire event needs a visible ground pressure wave —
   * the bore-axis "refraction ring" is hard-gated off side-on framings).
   */
  function spawnShockRing(
    x: number,
    z: number,
    ageS = 0,
    scaleK = 1,
    alphaK = 1,
  ): void {
    const r = shockRings[shockCursor];
    shockCursor = (shockCursor + 1) % shockRings.length;
    r.mesh.position.set(x, groundY(x, z) + 0.35, z);
    r.scaleK = scaleK;
    r.alphaK = alphaK;
    r.bornAt = particles.getTime() - ageS;
    applyShockRing(r);
  }

  // --- muzzle shock rings (pooled, bore-axis aligned, first ~200 ms) ---------
  // Cheap "refraction ring" read: a soft additive annulus perpendicular to
  // the bore that expands away from the brake and fades fast.
  const MUZZLE_RING_DUR = 0.2;
  const muzzleRingGeo = new THREE.PlaneGeometry(2, 2);
  const muzzleRings: MuzzleRingState[] = [];
  for (let i = 0; i < 2; i++) {
    const mat = new THREE.MeshBasicMaterial({
      map: shockTex,
      color: 0xfff3dd,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(muzzleRingGeo, mat);
    m.visible = false;
    m.frustumCulled = false; // (ac130-fx-228 r3) as the pressure rings: its covered warm draw reaches the late pass
    m.renderOrder = 23;
    m.layers.set(LATE_FX_LAYER);
    group.add(m);
    muzzleRings.push({ mesh: m, mat, bornAt: -1e9, att: 1, dir: new THREE.Vector3(0, 0, 1), origin: new THREE.Vector3() });
  }
  let muzzleRingCursor = 0;
  // SceneAAPass discovers this state on the top-level fx group. The copied
  // scene-depth uniforms come from the particle system; the activity gate
  // also includes non-particle late FX so a lone tracer/ring is never skipped.
  // Studio cinematic companion activity (FxCinematicPort.setLateFxActive);
  // always null in battle.
  let extraLateFxActive: (() => boolean) | null = null;
  // Studio night exposure scale for the pooled muzzle light (always 1 in battle).
  let muzzleLightScale = 1;
  // (fx 9) the Studio's cinematic quality writes the pools' scene tint itself (FxCinematicPort.setLightTintShading)
  let cinematicTintOwner = false;
  group.userData.softParticles = {
    ...particles.softParticles,
    isActive: () => particles.softParticles.isActive()
      || (vol ? vol.isActive() : false)
      || tracers.active() // atmospherics lane
      || bodies.count > 0
      // (FX lane 10-14) a parted wire settling after its missile has gone, and a trail hanging after its missile has
      // struck, still draw in the late pass
      || wires.mesh.visible
      || smokeTrails.mesh.visible
      || shockRings.some(isRingVisible)
      || muzzleRings.some(isRingVisible)
      || (extraLateFxActive !== null && extraLateFxActive()),
  };
  const _Z = new THREE.Vector3(0, 0, 1); // read-only

  function applyMuzzleRing(r: MuzzleRingState): void {
    if (replaySuppressed) {
      r.mesh.visible = false;
      r.mat.opacity = 0;
      return;
    }
    const t = (particles.getTime() - r.bornAt) / MUZZLE_RING_DUR;
    if (t >= 1 || t < 0) { r.mesh.visible = false; r.mat.opacity = 0; return; }
    const k = 1 - Math.pow(1 - t, 2.2);
    r.mesh.position.copy(r.origin).addScaledVector(r.dir, 0.25 + 1.7 * k);
    r.mesh.scale.setScalar(0.35 + 1.5 * k);
    // view-angle fade: full strength looking down the bore, HARD-GATED off
    // below ~55° alignment — the pow(align, 1.6) residual left a bright
    // vertical spike from side-on cameras that crossed the horizontal tracer
    // into a 4-point lens-flare diamond (r6 fire2/kill frames).
    // CRITICAL (r5): this must use _camV, NOT _v4 — bindBus passes the shared
    // _v4 scratch as `dir` into muzzleFlash, and spawnMuzzleFlash calls
    // spawnMuzzleRing -> applyMuzzleRing MID-FLASH. Writing _v4 here turned
    // the caller's fire direction into an ~11 m camera-ward vector, so every
    // element emitted after the ring (tongues, bore spark fan, jets, smoke,
    // dust, sabot petals, the muzzle light anchor) launched at 100-250 m/s
    // along the VIEW RAY — the r4 "screen-crossing amber beam through the
    // firing tank" + full-frame amber wash + vanishing muzzle smoke.
    let align = 1;
    const cam = engineCtx && engineCtx.camera;
    if (cam) {
      _camV.copy(cam.position).sub(r.mesh.position);
      const len = _camV.length();
      if (len > 1e-4) align = Math.abs(_camV.dot(r.dir)) / len;
    }
    const aGate = THREE.MathUtils.smoothstep(align, 0.62, 0.9);
    if (aGate <= 0.001) { r.mesh.visible = false; r.mat.opacity = 0; return; }
    r.mat.opacity = 0.30 * r.att * Math.pow(1 - t, 1.7) * aGate;
    r.mesh.visible = true;
  }

  /** Expanding pressure ring blown out along the bore axis. */
  function spawnMuzzleRing(
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    s: number,
    ageS = 0,
    att = 1,
  ): void {
    const r = muzzleRings[muzzleRingCursor];
    muzzleRingCursor = (muzzleRingCursor + 1) % muzzleRings.length;
    r.origin.copy(pos);
    r.dir.copy(dir);
    r.att = att;
    r.mesh.quaternion.setFromUnitVectors(_Z, dir);
    r.mesh.scale.setScalar(s);
    r.bornAt = particles.getTime() - ageS;
    applyMuzzleRing(r);
  }

  // --- armor impact decals (src/fx/impactDecals.ts) --------------------------
  // Ballistic scarring stamped into the struck NODE's local space (hull root
  // or rig_turret): pen holes with molten rims + spall, ricochet gouges
  // aligned to the impact tangent, HE scorch blots, non-pen scuffs. Replaces
  // the old 14-quad near-black scar pool (the "plain black rhombus" marks —
  // which additionally turned into OPAQUE burnt quads on every wreck when
  // tankFactory's burn sweep hit their un-hookable Basic material). Decals
  // are per-vehicle (cap 24, oldest evicted), persist for the battle and are
  // cleared when the vehicle wrecks — see the tank:destroyed handler and
  // spawnDestruction, which clear BEFORE setDestroyed's material traverse
  // can ever see a decal mesh.
  function isDecalEntity(value: object | null | undefined): value is FxEntity {
    if (!value) return false;
    const entity = value as Partial<FxEntity>;
    return !!entity.visual?.root && !!entity.state;
  }

  /** targetId -> live presentation entity. Production injects this resolver
   *  from the composition root; the diagnostics fallback only preserves
   *  standalone engineering harnesses that construct FX directly. */
  function decalEntityFor(targetId: ShellId | null | undefined): FxEntity | null {
    if (targetId == null) return null;
    const resolved = resolveEntity?.(targetId);
    if (isDecalEntity(resolved)) return resolved;
    if (typeof window === 'undefined') return null;
    const dbg = window.__DEBUG;
    const g = dbg && dbg.game;
    const ent = g && g.tankById ? g.tankById.get(targetId) : null;
    return isDecalEntity(ent) ? ent : null;
  }
  /** decal sweep accumulator (see update()) */
  let decalSweepAcc = 0;

  // --- track-print decals (r1: "no track-print decals behind the sprockets") -
  // A ring of terrain-conformed dark quads stamped under each moving track,
  // fading over ~12 s — a driving tank leaves a readable print corridor.
  // One draw call: CPU writes 4 conformed corners per stamp into a shared
  // dynamic buffer; the shader fades each print against the fx clock.
  const MAX_PRINTS = 96;
  const PRINT_DUR = 12;
  const WATER_WAKE_DUR = 6.2;
  const printTex = (() => {
    const prng = mulberry32((seed ^ 0x77d1e5) >>> 0);
    const s = 64, h = 128;
    const cv = document.createElement('canvas');
    cv.width = s; cv.height = h;
    const ctx = context2d(cv, { willReadFrequently: true });
    ctx.clearRect(0, 0, s, h);
    // ladder of track-pad rungs with ragged edges
    for (let y = 4; y < h - 4; y += 11) {
      const a = 0.45 + prng() * 0.35;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(6 + prng() * 4, y + prng() * 2, s - 14, 6);
    }
    // fbm erosion so prints never read as clean stamped rectangles
    const fbm = makeFbm(prng);
    const img = ctx.getImageData(0, 0, s, h);
    const dd = img.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < s; x++) {
        const n = fbm(x / s * 1.8, y / h * 3.4);
        dd[(y * s + x) * 4 + 3] *= Math.max(0, Math.min(1, n * 1.9 - 0.25));
      }
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  })();
  const printGeo = new THREE.BufferGeometry();
  const printPos = new THREE.Float32BufferAttribute(new Float32Array(MAX_PRINTS * 4 * 3), 3);
  const printUv = new THREE.Float32BufferAttribute(new Float32Array(MAX_PRINTS * 4 * 2), 2);
  const printBirth = new THREE.Float32BufferAttribute(new Float32Array(MAX_PRINTS * 4).fill(-1e9), 1);
  // 0 = earth, 1 = water, 2 = sand, 3 = snow. Sharing the same dynamic
  // quad ring keeps wet interaction inside the existing single draw call.
  const printSurface = new THREE.Float32BufferAttribute(new Float32Array(MAX_PRINTS * 4), 1);
  printPos.setUsage(THREE.DynamicDrawUsage);
  printBirth.setUsage(THREE.DynamicDrawUsage);
  printSurface.setUsage(THREE.DynamicDrawUsage);
  {
    const idx = [];
    const uvArr = printUv.array;
    for (let i = 0; i < MAX_PRINTS; i++) {
      const v = i * 4;
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
      uvArr[v * 2] = 0; uvArr[v * 2 + 1] = 0;
      uvArr[v * 2 + 2] = 1; uvArr[v * 2 + 3] = 0;
      uvArr[v * 2 + 4] = 1; uvArr[v * 2 + 5] = 1;
      uvArr[v * 2 + 6] = 0; uvArr[v * 2 + 7] = 1;
    }
    printGeo.setAttribute('position', printPos);
    printGeo.setAttribute('uv', printUv);
    printGeo.setAttribute('aBirth', printBirth);
    printGeo.setAttribute('aSurface', printSurface);
    printGeo.setIndex(idx);
  }
  // (EF.09, MASTER 18: "snow prints and the water wake glow at night") the prints and the wake's foam take the battle
  // pools' light tint (sceneLightTint.ts: white by day, warm at dusk, a dim blue at night), set every frame in update()
  const printUniforms = { uTime: { value: 0 }, uMap: { value: printTex }, uTint: { value: new THREE.Color(1, 1, 1) } };
  const printMat = new THREE.ShaderMaterial({
    uniforms: printUniforms,
    vertexShader: `
      attribute float aBirth;
      attribute float aSurface;
      varying vec2 vUv;
      varying float vFade;
      varying float vWater;
      varying float vSurface;
      uniform float uTime;
      void main() {
        vUv = uv;
        vWater = aSurface == 1.0 ? 1.0 : 0.0;
        vSurface = aSurface;
        float age = uTime - aBirth;
        float duration = mix(${PRINT_DUR.toFixed(1)}, ${WATER_WAKE_DUR.toFixed(1)}, vWater);
        vFade = ( age >= 0.0 && age < duration )
          ? 1.0 - age / duration : 0.0;
        gl_Position = vFade <= 0.0 ? vec4( 0.0, 0.0, 2.0, 1.0 )
          : projectionMatrix * viewMatrix * vec4( position, 1.0 );
      }`,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform vec3 uTint;
      varying vec2 vUv;
      varying float vFade;
      varying float vWater;
      varying float vSurface;
      void main() {
        float strength = mix(0.34, 0.60, vWater);
        float coverage;
        if (vWater > 0.5) {
          vec2 p = vUv * 2.0 - 1.0;
          float radius = length(p);
          float ring = 0.28 + (1.0 - vFade) * 0.66;
          coverage = (1.0 - smoothstep(0.07, 0.21, abs(radius - ring)))
            * (1.0 - smoothstep(0.80, 1.0, radius));
        } else {
          coverage = texture2D(uMap, vUv).a;
        }
        float a = coverage * vFade * strength;
        if ( a < 0.01 ) discard;
        vec3 color = mix(vec3(0.055, 0.05, 0.042), vec3(0.74, 0.84, 0.84), vWater);
        if (vSurface > 1.5) color = vSurface > 2.5
          ? vec3(0.37, 0.43, 0.49) : vec3(0.16, 0.12, 0.075);
        gl_FragColor = vec4(color * uTint, a);
      }`,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  const printMesh = new THREE.Mesh(printGeo, printMat);
  printMesh.frustumCulled = false;
  printMesh.matrixAutoUpdate = false;
  printMesh.renderOrder = 3;
  group.add(printMesh);
  const printCenters = new Float32Array(MAX_PRINTS * 2).fill(1e9);
  let printCursor = 0;

  /** Stamp one dry print or water wake at (pos) aligned to dir. */
  function stampTrackPrint(
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    water = false,
    drySurface: TrackSurface = 0,
  ): void {
    for (let i = 0; i < MAX_PRINTS; i++) {
      const age = particles.getTime() - printBirth.array[i * 4];
      if (age >= (printSurface.array[i * 4] === 1 ? WATER_WAKE_DUR : PRINT_DUR)) continue;
      const dx = pos.x - printCenters[i * 2], dz = pos.z - printCenters[i * 2 + 1];
      if (dx * dx + dz * dz < 0.85) return; // a print already covers this spot
    }
    const i = printCursor;
    printCursor = (printCursor + 1) % MAX_PRINTS;
    printCenters[i * 2] = pos.x; printCenters[i * 2 + 1] = pos.z;
    let fx2 = dir.x, fz2 = dir.z;
    const fl = Math.hypot(fx2, fz2) || 1;
    fx2 /= fl; fz2 /= fl;
    const rx = fz2, rz = -fx2;
    const hw = water ? 0.52 : 0.30;
    const hl = water ? 1.10 : 0.62;
    const arr = printPos.array;
    const v = i * 4 * 3;
    for (let k = 0; k < 4; k++) {
      const side = k === 1 || k === 2 ? 1 : -1, forward = k < 2 ? -1 : 1;
      const x = pos.x + side * rx * hw + forward * fx2 * hl;
      const z = pos.z + side * rz * hw + forward * fz2 * hl;
      const surfaceY = water
        ? heightField?.getWaterSurfaceHeightAt?.(x, z)
          ?? groundY(x, z) + (heightField?.getWaterDepthAt?.(x, z) ?? 0)
        : groundY(x, z);
      arr[v + k * 3] = x;
      arr[v + k * 3 + 1] = surfaceY + (water ? 0.065 : 0.035);
      arr[v + k * 3 + 2] = z;
    }
    const b = printBirth.array;
    b[i * 4] = b[i * 4 + 1] = b[i * 4 + 2] = b[i * 4 + 3] = particles.getTime();
    const s = printSurface.array;
    s[i * 4] = s[i * 4 + 1] = s[i * 4 + 2] = s[i * 4 + 3] = water ? 1 : drySurface;
    printPos.addUpdateRange(v, 12);
    printBirth.addUpdateRange(i * 4, 4);
    printSurface.addUpdateRange(i * 4, 4);
    printPos.needsUpdate = true;
    printBirth.needsUpdate = true;
    printSurface.needsUpdate = true;
  }


  // --- timers, continuous emitters, event bookkeeping ------------------------
  /** @type {{t:number, fn:Function}[]} pending one-shot callbacks (sim-frozen aware) */
  const timers: FxTimer[] = [];
  /** @type {{key:string|null, pos:number[], localPos?:number[], anchorSpace?:object,
   * anchorMode?:string, attachmentResolved?:boolean, acc:number, ttl:number,
   * scale:number}[]} smoke-column emitters */
  const columns: SmokeColumn[] = [];
  // Battle budget; only the Studio cinematic port may raise it (setColumnCap).
  let columnCap = MAX_COLUMNS;
  /** last known world position per tank id (fed by bus events that carry pos) */
  const lastKnownPos = new Map<string, MutableVec3>();
  // world-dressing r1: shellId -> shell type, so a world impact knows whether
  // it was HE (radius-breaks destructible props) — fed by shell:fired,
  // cleared on shell:expired (+ a hard size guard against leaks).
  const shellKinds = new Map<ShellId, string>();
  // world-dressing r1: shellId -> last swept point. The sim can step a shell
  // several fixed ticks per render frame (an APFSDS covers ~28 m/tick), so
  // sweeping only prevPos->pos would leave gaps a whole haystack fits into —
  // chaining from the last swept point makes flight coverage continuous.
  const sweepTails = new Map<ShellId, MutableVec3>();
  const _sweepSeen = new Set<ShellId>();
  /** r4: clock cursor for delta-driven emitters (see update()) */
  let lastTickS = 0;
  /** r4: seconds since battle start (resetAll) — drives the exhaust
   *  cold-start belch during the opening flyby */
  let battleFreshS = 999;

  function groundY(x: number, z: number): number {
    return heightField && heightField.getHeightAt ? heightField.getHeightAt(x, z) : 0;
  }
  /**
   * The ground as the battle has dug it, as it is drawn: the base contact surface plus the bound overlay (craters,
   * rubble heaps) on the same 1.333 m lattice and triangle split the drawn LOD0 follows (world/terrainCraterMesh.ts), so
   * a crater's surface lies on the mesh rather than on the analytic bowl between its vertices.
   */
  function deformedGroundY(x: number, z: number): number {
    const overlay = world?.()?.groundOverlay?.() ?? null;
    const base = heightField?.getContactHeightAt ? heightField.getContactHeightAt(x, z) : groundY(x, z);
    if (!overlay) return base;
    return base + (overlay.contactOffsetAt ? overlay.contactOffsetAt(x, z, baseCellFlipped(x, z)) : overlay.offsetAt(x, z));
  }
  /** (ground lane, 2026-10-15) the base surface's steep-cell split, the one the drawn mesh and the sim's overlay take. */
  function baseCellFlipped(x: number, z: number): boolean {
    return heightField?.getContactCellFlippedAt ? heightField.getContactCellFlippedAt(x, z) : false;
  }
  /** An old crater's age at its laying (s): weathered (craterMarks fades the fresh look by 300 s). */
  const MAP_CRATER_AGE_S = 3600;
  /** DST-04: lay the map's pre-placed craters' surfaces once the world's bound ground holds them (world/mapCraters.ts):
   *  a bowl's surface draped on the dug ground, a mark on the undug; again whenever they are laid anew. */
  function layMapCraters(): void {
    if (!mapCraterMarks) return;
    const laid = mapCratersOn((world?.()?.groundOverlay?.() ?? null) as TerrainDeformation | null);
    if (!laid) {
      if (mapCratersLaidEpoch !== -1) { mapCraterMarks.reset(); mapCratersLaidEpoch = -1; }
      return;
    }
    if (laid.epoch === mapCratersLaidEpoch) return;
    mapCraterMarks.reset();
    mapCratersLaidEpoch = laid.epoch;
    const birth = particles.getTime() - MAP_CRATER_AGE_S, climate = groundClimate();
    for (let i = 0; i < laid.stamps.length; i++) {
      const s = laid.stamps[i]!;
      const surface = classifyTerrain(heightField, s.x, s.z);
      const seed = (s.seed % 65536) / 65536;
      if (laid.dug[i]) {
        const [p1, p2, p3] = craterWobblePhases(s.seed);
        // (the Earthrise 228 rebuild) the Moon's pre-placed craters are impacts, not shell holes: no soot in the regolith
        mapCraterMarks.crater({ x: s.x, z: s.z, radiusM: s.radiusM, p1, p2, p3, surface, climate, explosive: climate !== 'regolith', kind: 'he',
          seed, birth }, deformedGroundY);
      } else {
        mapCraterMarks.stamp(s.x, s.z, s.radiusM, surface, 'he', seed, birth, deformedGroundY, climate);
      }
    }
  }
  /** The map's ground climate for a mark's soil (world/groundRedux.ts; the caldera's ash). */
  function groundClimate(): CraterClimate {
    const mapId = world?.()?.mapId ?? null;
    if (mapId === 'caldera') return 'ash';
    if (mapId === 'moon') return 'regolith'; // (the Earthrise 228 rebuild: the regolith's grey, never the sand's tan)
    return resolveGroundReduxProfile(mapId).climate;
  }

  function calScale(caliberMm: number): number {
    return THREE.MathUtils.clamp(caliberMm / 100, 0.5, 1.7);
  }

  // destruction-fx lane: shellId -> the round's munition class and charge (fed by shell:fired, read by its impact)
  interface ShellMunition { munition: MunitionClass; chargeKg: number; caliberMm: number }
  const shellMunitions = new Map<ShellId, ShellMunition>();
  const _munShell = { type: '', caliberMm: 0, name: '', guided: false as boolean | undefined, tracer: undefined as string | undefined,
    blastRadiusM: undefined as number | undefined, launcherTubes: 0 };
  function rememberMunition(e: ShellFiredEvent): void {
    if (shellMunitions.size > 96) shellMunitions.clear();
    let munition = e.munition;
    let chargeKg = e.chargeKg;
    if (!munition || !Number.isFinite(chargeKg)) {
      _munShell.type = e.shellType; _munShell.caliberMm = e.caliberMm; _munShell.name = e.shellName || '';
      _munShell.guided = e.guided; _munShell.tracer = e.tracer; _munShell.blastRadiusM = e.blastRadiusM;
      _munShell.launcherTubes = e.rocket ? 1 : 0;
      munition = munition ?? munitionClassForShell(_munShell);
      chargeKg = munitionChargeKg(_munShell, munition);
    }
    shellMunitions.set(e.shellId, { munition, chargeKg: chargeKg as number, caliberMm: e.caliberMm });
  }
  /**
   * The class of a shell ending with no fired record: its own type and calibre when the event carries them (the solo
   * step does), a bullet when it is that small, else the Studio's stand-in blast (HE by calibre, shell id -1).
   */
  function munitionOfExpiry(e: ShellExpiredEvent): ShellMunition {
    const caliberMm = e.caliberMm || 0;
    if (e.shellType) {
      _munShell.type = e.shellType; _munShell.caliberMm = caliberMm || 76; _munShell.name = ''; _munShell.guided = undefined;
      _munShell.tracer = undefined; _munShell.blastRadiusM = undefined; _munShell.launcherTubes = 0;
      const munition = munitionClassForShell(_munShell);
      return { munition, chargeKg: munitionChargeKg(_munShell, munition), caliberMm: caliberMm || 76 };
    }
    if (caliberMm > 0 && caliberMm < 15) return { munition: 'small_arms', chargeKg: 0, caliberMm };
    if (e.shellId === -1 || e.shellId == null) return heByCaliber(caliberMm || 76);
    return { munition: caliberMm >= 57 || caliberMm === 0 ? 'kinetic' : 'autocannon_ap', chargeKg: 0, caliberMm: caliberMm || 105 };
  }
  /** A terrain or Studio burst with no fired record: HE by calibre (the Studio's stand-in blasts). */
  function heByCaliber(caliberMm: number): ShellMunition {
    _munShell.type = 'HE'; _munShell.caliberMm = caliberMm; _munShell.name = ''; _munShell.guided = undefined;
    _munShell.tracer = undefined; _munShell.blastRadiusM = undefined; _munShell.launcherTubes = 0;
    const munition = munitionClassForShell(_munShell);
    return { munition, chargeKg: munitionChargeKg(_munShell, munition), caliberMm };
  }

  const _pulseV = new THREE.Vector3();
  // (EF.03 cost, 10-13: a 24-rocket salvo's bursts cost +1.4 ms presented at its peak, its media bodies +21-43 %) the
  // salvo governor, deterministic (the coordinator: "decide by burst count per cell per second, never by frame time"):
  // the ground is cut into 25 m cells; the bursts of the last second are kept in a ring (time on the fx clock, cell), and
  // a burst landing in a cell that already took two or more in that second pools its cloud (blastRecipes.groundBurst
  // reads the crowding through C.crowd: from the third burst on, fully pooled by the eighth)
  const CROWD_SLOTS = 48, CROWD_S = 1.0, CROWD_CELL_M = 25;
  const crowdT = new Float64Array(CROWD_SLOTS).fill(-1e9), crowdCell = new Int32Array(CROWD_SLOTS);
  let crowdNext = 0;
  function burstCrowd(x: number, z: number): number {
    const now = particles.getTime();
    const cell = (Math.floor(x / CROWD_CELL_M) & 0xffff) * 65536 + (Math.floor(z / CROWD_CELL_M) & 0xffff);
    let n = 0;
    for (let i = 0; i < CROWD_SLOTS; i++) {
      const age = now - crowdT[i];
      if (age >= 0 && age <= CROWD_S && crowdCell[i] === cell) n++;
    }
    crowdT[crowdNext] = now; crowdCell[crowdNext] = cell;
    crowdNext = (crowdNext + 1) % CROWD_SLOTS;
    return Math.min(1, Math.max(0, (n - 1) / 6));
  }
  const blast: BlastContext | null = vol && chunks ? {
    crowd: (x: number, z: number) => burstCrowd(x, z),
    rand: () => rng(),
    groundY: (x: number, z: number) => groundY(x, z),
    // a billow body born low over the ground softens its silhouette further (volumeMedia's `low`)
    media: (p) => { p.low = p.medium === 'billow' && p.y - groundY(p.x, p.z) < 1.5; vol.emit(p); },
    chunk: (p) => chunks.emit(p),
    flash: (o) => particles.emit('flash', o),
    fire: (o) => particles.emit('fire', o),
    sparks: (o) => particles.emit('sparks', o),
    jet: (o) => particles.emit('jet', o),
    shockRing: (x: number, z: number, scaleK: number, alphaK: number, ageS: number) => spawnShockRing(x, z, ageS, scaleK, alphaK),
    lightPulse: (x: number, y: number, z: number, peakK: number, delayS: number, durS?: number, hex?: number) => {
      if (replaySuppressed) return;
      // (round 7, wave 276: the ground burst's light lay on the ground as a flat orange wash for 800 ms) a pulse may
      // carry its own short decay; the kill light keeps the long one; (round 7c) and its own hue
      const pw = durS ? 2 : undefined;
      // (2026-10-08, the owner's black screens) never brighter than the kill light itself (a hull burst asked 1.4x)
      const k = Math.min(1, Math.max(0, peakK));
      if (delayS <= 0) { flashLight(lightStates[1], _pulseV.set(x, y, z), EXPLOSION_LIGHT_PEAK * k, -delayS, durS, pw, hex); return; }
      timers.push({ t: delayS, fn: () => flashLight(lightStates[1], _pulseV.set(x, y, z), EXPLOSION_LIGHT_PEAK * k, 0, durS, pw, hex) });
    },
    glow: (x: number, y: number, z: number, radiusM: number, peak: number, durS: number, birthOffset: number) => {
      if (replaySuppressed) return;
      vol?.glow(x, y, z, radiusM, peak, durS, birthOffset);
    },
    ember: (x: number, y: number, z: number, radiusM: number, peak: number, durS: number, birthOffset: number) => {
      if (replaySuppressed) return;
      vol?.ember(x, y, z, radiusM, peak, durS, birthOffset);
    },
    distBoost: (x: number, y: number, z: number) => distBoost(x, y, z),
    tier: 1,
    m: makeVolumePuff(),
    k: makeChunkPiece(),
    lp: { pos: [0, 0, 0], vel: [0, 0, 0], life: 1, size0: 1, size1: 1, rot: 0, rotVel: 0, col0: [1, 1, 1],
      col1: [1, 1, 1], alpha: 1, grav: 0, birthOffset: 0 },
    ls: { pos: [0, 0, 0], vel: [0, 0, 0], life: 1, width: 0.03, stretch: 0.03, grav: -18, col: [1, 1, 1], alpha: 1,
      seed: 0, birthOffset: 0 },
    lj: { pos: [0, 0, 0], axis: [0, 1, 0], life: 0.1, width: 0.5, len0: 0.5, len1: 3, seed: 0, col: [1, 1, 1], alpha: 1,
      birthOffset: 0 },
  } : null;
  const _strikeDir = new THREE.Vector3();
  const _crater = { radiusM: 0, depthM: 0, rimM: 0 };
  /** The last detonation on the ground (munition:blast): whether it dug a crater the core announces with its own
   *  terrain:crater event (that event stamps the mark); a burst that did not dig marks the ground itself. */
  const lastGroundBlast = { x: 0, z: 0, craterId: -1 };

  // ---- one burst per HE round ------------------------------------------------------------------------------------
  // An HE round's burst reaches FX as several events: on the ground, a he_splash for every hull inside its blast
  // radius and then the shell:expired at the burst point; on a hull, the struck hull's he_pen (or he_splash) first and
  // then a he_splash for every hull around it. main drew a fireball and a dirt plume at EVERY one of them (a gunship
  // shell beside four tanks drew five explosions). The hull events wait here until the next update: when the round's
  // shell:expired drew the burst, they are fragments striking the hulls; otherwise the first of them (the struck hull)
  // is the burst and the rest are fragments.
  interface PendingHeHit {
    shellId: ShellId | null; x: number; y: number; z: number; nx: number; ny: number; nz: number;
    caliberMm: number; at: number;
  }
  const PENDING_HE_MAX = 48;
  const pendingHe: PendingHeHit[] = [];
  for (let i = 0; i < PENDING_HE_MAX; i++) pendingHe.push({ shellId: null, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, caliberMm: 0, at: 0 });
  let pendingHeCount = 0;
  /** rounds whose burst this frame's shell:expired drew (cleared every resolve) */
  const burstDrawn = new Set<ShellId>();
  /** rounds whose burst a hull event drew during the resolve (cleared every resolve) */
  const burstOnHull = new Set<ShellId>();

  function queueHeHit(e: ShellHitEvent): boolean {
    if (!blast) return false;
    if (pendingHeCount >= PENDING_HE_MAX) return false;
    const r = pendingHe[pendingHeCount++];
    r.shellId = e.shellId ?? null;
    r.x = e.pos[0]; r.y = e.pos[1]; r.z = e.pos[2];
    r.nx = e.normal[0]; r.ny = e.normal[1]; r.nz = e.normal[2];
    r.caliberMm = e.caliberMm || 120;
    r.at = particles.getTime();
    return true;
  }

  function resolvePendingHe(): void {
    if (!blast || pendingHeCount === 0) { burstDrawn.clear(); return; }
    const now = particles.getTime();
    for (let i = 0; i < pendingHeCount; i++) {
      const r = pendingHe[i];
      const bo = Math.min(0, r.at - now);
      const id = r.shellId;
      if (id != null && (burstDrawn.has(id) || burstOnHull.has(id))) {
        fragmentStrike(blast, r.x, r.y, r.z, r.nx, r.ny, r.nz, bo);
        continue;
      }
      if (id != null) burstOnHull.add(id);
      const info = (id != null ? shellMunitions.get(id) : null) ?? heByCaliber(r.caliberMm);
      if (id != null) shellMunitions.delete(id);
      const gy = groundY(r.x, r.z);
      // (ac130-fx-228 r3) a heavy charge (the gunship's howitzer shell, a missile's warhead) on a roof still throws the
      // ground's earth: it reaches the ground from a turret's top, a light charge from a hull's side only
      const reach = (info.munition === 'howitzer' || info.munition === 'missile') && info.chargeKg >= HULL_EARTH_MIN_KG ? 4 : 2.5;
      plateBurst(blast, { x: r.x, y: r.y, z: r.z, nx: r.nx, ny: r.ny, nz: r.nz, munition: info.munition,
        chargeKg: Math.max(0.3, info.chargeKg), ground: r.y - gy < reach ? classifyTerrain(heightField, r.x, r.z) : null,
        birthOffset: bo });
    }
    pendingHeCount = 0;
    burstDrawn.clear();
    burstOnHull.clear();
  }

  /**
   * A shell ending on the ground or the water, by its munition class: explosives burst (flash, fireball, ejecta, the
   * dust cloud, surge, residue), kinetic rounds and bullets strike (a spurt of the ground along the shot, chunks).
   * Returns false when the media layer is off (the phone tier keeps the pooled plume).
   */
  function mediaGroundHit(pos: THREE.Vector3, info: ShellMunition, water: boolean, dir: THREE.Vector3 | null,
    birthOffset = 0): boolean {
    if (!blast) return false;
    const surface = water ? 'water' : classifyTerrain(heightField, pos.x, pos.z);
    if (isExplosive(info.munition) && info.chargeKg > 0) {
      const y = water
        ? (heightField?.getWaterSurfaceHeightAt?.(pos.x, pos.z) ?? groundY(pos.x, pos.z))
        : pos.y;
      if (water) waterBurst(blast, { x: pos.x, y, z: pos.z, munition: info.munition, chargeKg: info.chargeKg, surface, birthOffset });
      else groundBurst(blast, { x: pos.x, y, z: pos.z, munition: info.munition, chargeKg: info.chargeKg, surface, birthOffset,
        ...(dir ? { dx: dir.x, dy: dir.y, dz: dir.z } : {}) });
      // a burst that dug a crater (munition:blast named it, raised just before this event) gets its mark from the
      // crater's own event at the end of the tick; one that did not dig (small, past the tick's or the match's cap,
      // craters off) leaves its mark here
      const dug = lastGroundBlast.craterId >= 0 && Math.abs(lastGroundBlast.x - pos.x) + Math.abs(lastGroundBlast.z - pos.z) < 1;
      lastGroundBlast.craterId = -1;
      if (!water && craters && !dug) {
        craterFor(info.chargeKg, info.munition, 1, _crater);
        if (_crater.radiusM > 0.25) {
          // (round 7, wave 276: a shaped charge left a bowl) the mark is the munition's: a shaped charge's scar, HESH's
          // shallow scorch, an HE round's crater look at its size
          const kind = markKindFor(info.munition, true);
          craters.stamp(pos.x, pos.z, _crater.radiusM, surface, kind, rng(), particles.getTime() + birthOffset, deformedGroundY,
            groundClimate());
          clearCover(pos.x, pos.z, _crater.radiusM * (kind === 'scar' || kind === 'drone' ? 0.55 : 0.9));
        }
      }
    } else {
      kineticStrike(blast, { x: pos.x, y: pos.y, z: pos.z, dx: dir ? dir.x : 0, dy: dir ? dir.y : -1, dz: dir ? dir.z : 0,
        caliberMm: info.caliberMm, munition: info.munition, surface, birthOffset });
      // a rod or an AP shot leaves a gouge, a bullet nothing worth a mark
      if (!water && craters && info.munition !== 'small_arms' && info.caliberMm >= 20) {
        craters.stamp(pos.x, pos.z, 0.16 + 0.22 * Math.min(1.4, info.caliberMm / 120), surface, false, rng(),
          particles.getTime() + birthOffset, deformedGroundY, groundClimate());
      }
    }
    if (water) {
      const s = calScale(info.caliberMm);
      heightField?.addWaterImpulse?.(pos.x, pos.z, 0.9 + 1.1 * s, 0.22 * s, 0.85);
    }
    return true;
  }

  // --------------------------------------------------------------------------
  // Effect recipes (birthOffset lets the screenshot composers backdate spawns)
  // --------------------------------------------------------------------------

  /**
   * True when the camera is scoped (sniper view) and `pos` is the player's
   * own muzzle right in front of the lens — WoT hides own-gun flash geometry
   * in the scope and sells the shot with light + shake instead.
   */
  function scopedOwnGun(pos: THREE.Vector3): boolean {
    const cam = engineCtx && engineCtx.camera;
    return !!(cam && cam.userData && cam.userData.scoped &&
      cam.position.distanceToSquared(pos) < 100);
  }

  interface MuzzleFlashState {
    pos: THREE.Vector3;
    dir: THREE.Vector3;
    caliberMm: number;
    birthOffset: number;
    reach: number;
    s: number;
    scoped: boolean;
    nearAtt: number;
    dkF: number;
    axSize: number;
    axSizeC: number;
    axAtt: number;
    lightK: number;
  }

  const muzzleFlashState: MuzzleFlashState = {
    pos: _mfPos,
    dir: _mfDir,
    caliberMm: 0,
    birthOffset: 0,
    reach: 1,
    s: 1,
    scoped: false,
    nearAtt: 1,
    dkF: 1,
    axSize: 1,
    axSizeC: 1,
    axAtt: 1,
    lightK: 1,
  };

  function emitMuzzleCoreAndPetals(state: MuzzleFlashState): void {
    const { pos, dir, s, caliberMm, birthOffset, axSize, axSizeC, axAtt } = state;
    _puffO.pos[0] = pos.x + dir.x * 0.12; _puffO.pos[1] = pos.y + dir.y * 0.12; _puffO.pos[2] = pos.z + dir.z * 0.12;
    _puffO.vel[0] = dir.x * 1.5; _puffO.vel[1] = dir.y * 1.5; _puffO.vel[2] = dir.z * 1.5;
    _puffO.life = Math.max(0.105, -birthOffset * 2.6);
    const coreK = 0.8 + (caliberMm / 120) * 0.5;
    _puffO.size0 = 0.66 * s * axSizeC * coreK; _puffO.size1 = 1.62 * s * axSizeC * coreK;
    _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = 0;
    col3(0xffffff, _puffO.col0); col3(0xffffff, _puffO.col1);
    _puffO.alpha = 0.32 + 0.42 * axAtt; _puffO.grav = 0; _puffO.birthOffset = birthOffset;
    particles.emit('flash', _puffO);
    _puffO.life = Math.max(0.17, -birthOffset * 3.0);
    _puffO.size0 = 0.55 * s * axSizeC * coreK; _puffO.size1 = 1.38 * s * axSizeC * coreK;
    _puffO.rotVel = (rng() - 0.5) * 2;
    col3(0xffffff, _puffO.col0); col3(0xffc558, _puffO.col1);
    particles.emit('flash', _puffO);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4 + rng() * 0.6;
      const tilt = 1.02 + rng() * 0.3;
      const st2 = Math.sin(tilt), ct2 = Math.cos(tilt);
      _sv.set(
        dir.x * ct2 + (_v1.x * Math.cos(a) + _v2.x * Math.sin(a)) * st2,
        dir.y * ct2 + (_v1.y * Math.cos(a) + _v2.y * Math.sin(a)) * st2,
        dir.z * ct2 + (_v1.z * Math.cos(a) + _v2.z * Math.sin(a)) * st2,
      ).normalize();
      _jetO.pos[0] = pos.x + dir.x * 0.14; _jetO.pos[1] = pos.y + dir.y * 0.14; _jetO.pos[2] = pos.z + dir.z * 0.14;
      _jetO.axis[0] = _sv.x; _jetO.axis[1] = _sv.y; _jetO.axis[2] = _sv.z;
      _jetO.life = Math.max(0.07 + rng() * 0.03, -birthOffset * 1.5);
      _jetO.width = 0.20 * s * axSize;
      _jetO.len0 = 0.42 * s; _jetO.len1 = (1.0 + rng() * 0.4) * s;
      _jetO.seed = rng();
      col3(0xfff0c4, _jetO.col);
      _jetO.alpha = 0.92 * axAtt; _jetO.birthOffset = birthOffset;
      particles.emit('jet', _jetO);
    }
    if (birthOffset >= 0) {
      spawnMuzzleRing(_sv.set(pos.x + dir.x * 0.3, pos.y + dir.y * 0.3, pos.z + dir.z * 0.3),
        dir, s * axSize, 0, axAtt);
    }
  }

  function emitMuzzleAxialAndBrakeJets(state: MuzzleFlashState): void {
    const { pos, dir, s, birthOffset, reach, dkF, axSize, axAtt } = state;
    for (let i = 0; i < 3; i++) {
      const off = i === 0 ? 0 : 0.10 + rng() * 0.08;
      const a = rng() * Math.PI * 2;
      _sv.set(
        dir.x + (_v1.x * Math.cos(a) + _v2.x * Math.sin(a)) * off,
        dir.y + (_v1.y * Math.cos(a) + _v2.y * Math.sin(a)) * off,
        dir.z + (_v1.z * Math.cos(a) + _v2.z * Math.sin(a)) * off,
      ).normalize();
      _jetO.pos[0] = pos.x + dir.x * 0.1; _jetO.pos[1] = pos.y + dir.y * 0.1; _jetO.pos[2] = pos.z + dir.z * 0.1;
      _jetO.axis[0] = _sv.x; _jetO.axis[1] = _sv.y; _jetO.axis[2] = _sv.z;
      _jetO.life = Math.max(i === 0 ? 0.135 : 0.105, -birthOffset * 2.2);
      _jetO.width = (i === 0 ? 0.38 : 0.28) * s * axSize;
      _jetO.len0 = 0.40 * s;
      _jetO.len1 = (i === 0 ? 1.6 + rng() * 0.4 : 1.1 + rng() * 0.35) * s * reach *
        (0.7 + 0.3 * dkF);
      _jetO.seed = rng();
      col3(i === 0 ? 0xffe6b0 : 0xffcf7e, _jetO.col);
      _jetO.alpha = (i === 0 ? 0.7 : 0.45) * axAtt; _jetO.birthOffset = birthOffset;
      particles.emit('jet', _jetO);
    }
    for (let i = 0; i < 2; i++) {
      const a = rng() * Math.PI * 2;
      _sv.set(
        -dir.x * 0.6 + (_v1.x * Math.cos(a) + _v2.x * Math.sin(a)),
        -dir.y * 0.6 + (_v1.y * Math.cos(a) + _v2.y * Math.sin(a)),
        -dir.z * 0.6 + (_v1.z * Math.cos(a) + _v2.z * Math.sin(a)),
      ).normalize();
      _jetO.pos[0] = pos.x + dir.x * 0.06; _jetO.pos[1] = pos.y + dir.y * 0.06; _jetO.pos[2] = pos.z + dir.z * 0.06;
      _jetO.axis[0] = _sv.x; _jetO.axis[1] = _sv.y; _jetO.axis[2] = _sv.z;
      _jetO.life = 0.07 + rng() * 0.02;
      _jetO.width = 0.20 * s * axSize;
      _jetO.len0 = 0.2 * s; _jetO.len1 = (0.55 + rng() * 0.2) * s;
      _jetO.seed = rng();
      col3(0xffd88a, _jetO.col);
      _jetO.alpha = 0.5 * axAtt; _jetO.birthOffset = birthOffset;
      particles.emit('jet', _jetO);
    }
    _puffO.pos[0] = pos.x - dir.x * 0.22; _puffO.pos[1] = pos.y - dir.y * 0.22; _puffO.pos[2] = pos.z - dir.z * 0.22;
    _puffO.vel[0] = -dir.x * 1.2; _puffO.vel[1] = -dir.y * 1.2 + 0.3; _puffO.vel[2] = -dir.z * 1.2;
    _puffO.life = 0.07;
    _puffO.size0 = 0.5 * s * axSize; _puffO.size1 = 0.72 * s * axSize;
    _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = 0;
    col3(0xfff1cc, _puffO.col0); col3(0xffb050, _puffO.col1);
    _puffO.alpha = 0.55 * axAtt; _puffO.grav = 0; _puffO.birthOffset = birthOffset;
    particles.emit('flash', _puffO);
    for (let i = 0; i < 2; i++) {
      const a = i * Math.PI + 0.5 + rng() * 0.9;
      _sv.set(
        (_v1.x * Math.cos(a) + _v2.x * Math.sin(a)) * 0.55 + dir.x * 0.65,
        (_v1.y * Math.cos(a) + _v2.y * Math.sin(a)) * 0.55 + dir.y * 0.65,
        (_v1.z * Math.cos(a) + _v2.z * Math.sin(a)) * 0.55 + dir.z * 0.65,
      ).normalize();
      _jetO.pos[0] = pos.x + dir.x * 0.22; _jetO.pos[1] = pos.y + dir.y * 0.22; _jetO.pos[2] = pos.z + dir.z * 0.22;
      _jetO.axis[0] = _sv.x; _jetO.axis[1] = _sv.y; _jetO.axis[2] = _sv.z;
      _jetO.life = 0.06 + rng() * 0.02;
      _jetO.width = 0.17 * s * axSize;
      _jetO.len0 = 0.22 * s; _jetO.len1 = (0.45 + rng() * 0.20) * s * Math.max(reach, 0.7);
      _jetO.seed = rng();
      col3(0xffc86e, _jetO.col);
      _jetO.alpha = 0.40 * axAtt; _jetO.birthOffset = birthOffset;
      particles.emit('jet', _jetO);
    }
  }

  function emitMuzzleCombustionAndAfterflash(state: MuzzleFlashState): void {
    const { pos, dir, s, birthOffset, axSize, axAtt } = state;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + rng() * 1.1;
      const tilt = 0.22 + rng() * 0.15;
      const st = Math.sin(tilt), ct = Math.cos(tilt);
      _sv.set(
        dir.x * ct + (_v1.x * Math.cos(a) + _v2.x * Math.sin(a)) * st,
        dir.y * ct + (_v1.y * Math.cos(a) + _v2.y * Math.sin(a)) * st,
        dir.z * ct + (_v1.z * Math.cos(a) + _v2.z * Math.sin(a)) * st,
      ).normalize();
      _jetO.pos[0] = pos.x + dir.x * 0.16; _jetO.pos[1] = pos.y + dir.y * 0.16; _jetO.pos[2] = pos.z + dir.z * 0.16;
      _jetO.axis[0] = _sv.x; _jetO.axis[1] = _sv.y; _jetO.axis[2] = _sv.z;
      _jetO.life = 0.07 + rng() * 0.04;
      _jetO.width = (0.19 + rng() * 0.05) * s * axSize;
      _jetO.len0 = 0.16 * s; _jetO.len1 = (0.55 + rng() * 0.35) * s;
      _jetO.seed = rng();
      col3(0xffdf9a, _jetO.col);
      _jetO.alpha = 0.32 * axAtt; _jetO.birthOffset = birthOffset;
      particles.emit('jet', _jetO);
    }
    for (let i = 0; i < 2; i++) {
      const j = i < 1 ? 0 : 0.22;
      const jx = (_v1.x * (rng() - 0.5) + _v2.x * (rng() - 0.5)) * j;
      const jy = (_v1.y * (rng() - 0.5) + _v2.y * (rng() - 0.5)) * j;
      const jz = (_v1.z * (rng() - 0.5) + _v2.z * (rng() - 0.5)) * j;
      const v = ((i < 1 ? 14 : 11) + rng() * 4) * state.reach;
      _strkO.pos[0] = pos.x + dir.x * 0.2; _strkO.pos[1] = pos.y + dir.y * 0.2; _strkO.pos[2] = pos.z + dir.z * 0.2;
      _strkO.vel[0] = dir.x * v + jx; _strkO.vel[1] = dir.y * v + jy; _strkO.vel[2] = dir.z * v + jz;
      _strkO.life = 0.06 + rng() * 0.04;
      _strkO.width = (0.06 + rng() * 0.05) * s; _strkO.stretch = 0.05; _strkO.grav = 0;
      col3(0xffc25e, _strkO.col); _strkO.alpha = 0.7 * axAtt; _strkO.seed = rng(); _strkO.birthOffset = birthOffset;
      particles.emit('sparks', _strkO);
    }
    for (let i = 0; i < 3; i++) {
      const along = 0.3 + rng() * 0.55 * s;
      _puffO.pos[0] = pos.x + dir.x * along + (_v1.x * (rng() - 0.5) + _v2.x * (rng() - 0.5)) * 0.16 * s;
      _puffO.pos[1] = pos.y + dir.y * along + (_v1.y * (rng() - 0.5) + _v2.y * (rng() - 0.5)) * 0.16 * s;
      _puffO.pos[2] = pos.z + dir.z * along + (_v1.z * (rng() - 0.5) + _v2.z * (rng() - 0.5)) * 0.16 * s;
      const v = 4 + rng() * 4;
      _puffO.vel[0] = dir.x * v; _puffO.vel[1] = dir.y * v; _puffO.vel[2] = dir.z * v;
      _puffO.life = 0.05 + rng() * 0.05;
      _puffO.size0 = 0.26 * s; _puffO.size1 = 0.62 * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 8;
      col3(0xffe9a0, _puffO.col0); col3(0xff6a14, _puffO.col1);
      _puffO.alpha = 0.38 * axAtt; _puffO.grav = 0; _puffO.birthOffset = birthOffset;
      particles.emit('fire', _puffO);
    }
    for (let i = 0; i < 6; i++) {
      const along = (0.22 + rng() * 0.7) * s;
      _puffO.pos[0] = pos.x + dir.x * along + (_v1.x * (rng() - 0.5) + _v2.x * (rng() - 0.5)) * 0.14 * s;
      _puffO.pos[1] = pos.y + dir.y * along + (_v1.y * (rng() - 0.5) + _v2.y * (rng() - 0.5)) * 0.14 * s;
      _puffO.pos[2] = pos.z + dir.z * along + (_v1.z * (rng() - 0.5) + _v2.z * (rng() - 0.5)) * 0.14 * s;
      const v = 2.2 + rng() * 2.8;
      _puffO.vel[0] = dir.x * v + (rng() - 0.5) * 0.6;
      _puffO.vel[1] = dir.y * v + 0.35 + rng() * 0.4;
      _puffO.vel[2] = dir.z * v + (rng() - 0.5) * 0.6;
      _puffO.life = 0.08 + rng() * 0.08;
      _puffO.size0 = 0.34 * s; _puffO.size1 = (0.85 + rng() * 0.55) * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 6;
      col3(0xffb45e, _puffO.col0); col3(0xb3491a, _puffO.col1);
      _puffO.alpha = 0.4 * (0.4 + 0.6 * axAtt); _puffO.grav = 0.6; _puffO.birthOffset = birthOffset;
      particles.emit('fire', _puffO);
    }
  }

  function emitMuzzlePropellantMass(state: MuzzleFlashState): void {
    const { pos, dir, s, birthOffset } = state;
    for (let i = 0; i < 7; i++) {
      const along = 0.3 + (i / 6) * 1.9 + rng() * 0.35;
      const la = rng() * Math.PI * 2;
      const lr = rng() * 0.30 * s;
      _puffO.pos[0] = pos.x + dir.x * along + (_v1.x * Math.cos(la) + _v2.x * Math.sin(la)) * lr;
      _puffO.pos[1] = pos.y + dir.y * along + (_v1.y * Math.cos(la) + _v2.y * Math.sin(la)) * lr;
      _puffO.pos[2] = pos.z + dir.z * along + (_v1.z * Math.cos(la) + _v2.z * Math.sin(la)) * lr;
      _puffO.vel[0] = dir.x * (1.8 + rng() * 1.6) + (rng() - 0.5) * 0.8 + 0.3;
      _puffO.vel[1] = dir.y * (1.8 + rng() * 1.6) + 0.5 + rng() * 0.5;
      _puffO.vel[2] = dir.z * (1.8 + rng() * 1.6) + (rng() - 0.5) * 0.8;
      _puffO.life = 1.5 + rng() * 1.3;
      _puffO.size0 = (1.6 + rng() * 0.7) * s; _puffO.size1 = (3.0 + rng() * 1.4) * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2.2;
      col3(0xaba79f, _puffO.col0); col3(0x8f8c86, _puffO.col1);
      _puffO.alpha = 0.16 + rng() * 0.07; _puffO.grav = 0.4;
      _puffO.birthOffset = birthOffset - 0.09 - rng() * 0.06;
      particles.emit('psmoke', _puffO);
    }
    for (let i = 0; i < 3; i++) {
      const la = rng() * Math.PI * 2;
      _puffO.pos[0] = pos.x - dir.x * 0.25 + (_v1.x * Math.cos(la) + _v2.x * Math.sin(la)) * 0.2;
      _puffO.pos[1] = pos.y - dir.y * 0.25 + (_v1.y * Math.cos(la) + _v2.y * Math.sin(la)) * 0.2;
      _puffO.pos[2] = pos.z - dir.z * 0.25 + (_v1.z * Math.cos(la) + _v2.z * Math.sin(la)) * 0.2;
      _puffO.vel[0] = -dir.x * (0.9 + rng() * 0.7) + (rng() - 0.5) * 0.7 + 0.3;
      _puffO.vel[1] = 0.7 + rng() * 0.6;
      _puffO.vel[2] = -dir.z * (0.9 + rng() * 0.7) + (rng() - 0.5) * 0.7;
      _puffO.life = 1.4 + rng() * 0.9;
      _puffO.size0 = 0.9 * s; _puffO.size1 = (2.1 + rng() * 1.0) * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
      col3(0xaea99f, _puffO.col0); col3(0x928f88, _puffO.col1);
      _puffO.alpha = 0.18 + rng() * 0.07; _puffO.grav = 0.4;
      _puffO.birthOffset = birthOffset - 0.08;
      particles.emit('psmoke', _puffO);
    }
  }

  function emitMuzzleSmoke(state: MuzzleFlashState): void {
    const { pos, dir, s, birthOffset, scoped } = state;
    const smokeBirth = birthOffset - 0.2;
    const smokeA = scoped ? 0.30 : 0.62;
    const lifeK = scoped ? 0.45 : 1;
    const donutCount = scoped ? 4 : 9;
    for (let i = 0; i < donutCount; i++) {
      const a = rng() * Math.PI * 2;
      const r = (0.15 + rng() * 0.24) * s;
      const rx = _v1.x * Math.cos(a) + _v2.x * Math.sin(a);
      const ry = _v1.y * Math.cos(a) + _v2.y * Math.sin(a);
      const rz = _v1.z * Math.cos(a) + _v2.z * Math.sin(a);
      const along = 0.4 + rng() * 0.5;
      _puffO.pos[0] = pos.x + dir.x * along + rx * r;
      _puffO.pos[1] = pos.y + dir.y * along + ry * r;
      _puffO.pos[2] = pos.z + dir.z * along + rz * r;
      const v = 2.4 + rng() * 2.6;
      const fwd = 2.2 + rng() * 2.4;
      _puffO.vel[0] = rx * v + dir.x * fwd; _puffO.vel[1] = ry * v + dir.y * fwd; _puffO.vel[2] = rz * v + dir.z * fwd;
      _puffO.life = (1.6 + rng() * 1.2) * lifeK;
      _puffO.size0 = (0.9 + rng() * 0.45) * s; _puffO.size1 = (2.3 + rng() * 1.7) * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 3;
      col3(0xb1ada4, _puffO.col0); col3(0x94918b, _puffO.col1);
      _puffO.alpha = (0.19 + rng() * 0.13) * smokeA; _puffO.grav = 0.6;
      _puffO.birthOffset = smokeBirth - rng() * 0.30;
      particles.emit('psmoke', _puffO);
    }
    const plumeCount = scoped ? 4 : 10;
    for (let i = 0; i < plumeCount; i++) {
      const along = 0.8 + rng() * 3.2 * s;
      const lat = along * 0.24 * (rng() - 0.5) * 2;
      const la = rng() * Math.PI * 2;
      const lx = _v1.x * Math.cos(la) + _v2.x * Math.sin(la);
      const ly = _v1.y * Math.cos(la) + _v2.y * Math.sin(la);
      const lz = _v1.z * Math.cos(la) + _v2.z * Math.sin(la);
      _puffO.pos[0] = pos.x + dir.x * along + lx * lat;
      _puffO.pos[1] = pos.y + dir.y * along + ly * lat;
      _puffO.pos[2] = pos.z + dir.z * along + lz * lat;
      const v = 4 + rng() * 5;
      _puffO.vel[0] = dir.x * v + lx * 1.1 + 0.4 + (rng() - 0.5) * 0.6;
      _puffO.vel[1] = dir.y * v + ly * 1.1 + 0.7 + rng() * 0.7;
      _puffO.vel[2] = dir.z * v + lz * 1.1 + (rng() - 0.5) * 0.6;
      _puffO.life = (1.7 + rng() * 1.5) * lifeK;
      _puffO.size0 = (0.6 + rng() * 0.35) * s; _puffO.size1 = (1.7 + rng() * 1.5) * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
      col3(0xbdb9b1, _puffO.col0); col3(0x94928c, _puffO.col1);
      _puffO.alpha = (0.10 + rng() * 0.11) * smokeA; _puffO.grav = 0.5;
      _puffO.birthOffset = smokeBirth - rng() * 0.35 - (along / (3.2 * s + 0.8)) * 0.25;
      particles.emit('psmoke', _puffO);
    }
  }

  function emitLingeringMuzzleFx(state: MuzzleFlashState, wisps = true): void {
    const { pos, dir, s, birthOffset, reach, axAtt } = state;
    const smokeBirth = birthOffset - 0.2;
    for (let i = 0; i < (wisps ? 8 : 0); i++) {
      const along = 0.15 + rng() * 0.45;
      _puffO.pos[0] = pos.x + dir.x * along; _puffO.pos[1] = pos.y + dir.y * along; _puffO.pos[2] = pos.z + dir.z * along;
      _puffO.vel[0] = dir.x * 0.3 + (rng() - 0.5) * 0.4 + 0.35;
      _puffO.vel[1] = 0.55 + rng() * 0.55;
      _puffO.vel[2] = dir.z * 0.3 + (rng() - 0.5) * 0.4 + 0.12;
      _puffO.life = 2.3 + rng() * 1.4;
      _puffO.size0 = 0.5 * s; _puffO.size1 = (2.0 + rng() * 0.9) * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.5;
      col3(0xc6c2ba, _puffO.col0); col3(0x9a9791, _puffO.col1);
      _puffO.alpha = 0.20 + rng() * 0.10; _puffO.grav = 0.4;
      _puffO.birthOffset = smokeBirth - rng() * 0.4;
      particles.emit('psmoke', _puffO);
    }
    _sv.set(pos.x + dir.x * 0.6, pos.y + dir.y * 0.6, pos.z + dir.z * 0.6);
    sparkFan(_sv, dir, Math.round(9 * (0.4 + 0.6 * axAtt)), 14 * s * reach, 0.22, 0xffd58a, 0.11, 0.018, 0.03, birthOffset);
  }

  function emitMuzzleGroundBlast(state: MuzzleFlashState, dust = true): void {
    const { pos, dir, caliberMm, birthOffset, nearAtt, dkF } = state;
    const gy = groundY(pos.x, pos.z);
    const hK = THREE.MathUtils.clamp(1 - (pos.y - gy - 1.2) / 3.4, 0, 1);
    if (hK <= 0.05) return;
    spawnShockRing(pos.x + dir.x * 1.2, pos.z + dir.z * 1.2,
      Math.max(0, -birthOffset), 0.42 + 0.22 * hK, 0.7 * (0.5 + 0.5 * hK));
    if (!dust) return; // destruction-fx lane: the media layer lifts the ground's own dust (blastRecipes muzzleBlast)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + rng() * 0.6;
      _puffO.pos[0] = pos.x + dir.x * 0.9 + Math.cos(a) * 0.8;
      _puffO.pos[1] = gy + 0.75;
      _puffO.pos[2] = pos.z + dir.z * 0.9 + Math.sin(a) * 0.8;
      _puffO.vel[0] = Math.cos(a) * (9 + rng() * 4) + dir.x * 2;
      _puffO.vel[1] = 0.8 + rng() * 0.8;
      _puffO.vel[2] = Math.sin(a) * (9 + rng() * 4) + dir.z * 2;
      _puffO.life = 0.38 + rng() * 0.22;
      _puffO.size0 = 0.55; _puffO.size1 = (2.3 + rng() * 0.9) * (0.75 + 0.25 * hK);
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2.5;
      col3(0x99948a, _puffO.col0); col3(0x847f76, _puffO.col1);
      _puffO.alpha = (0.26 + 0.10 * hK) * (0.7 + 0.3 * nearAtt);
      _puffO.grav = -0.6; _puffO.birthOffset = birthOffset;
      particles.emit('dust', _puffO);
    }
    const donutN = Math.round(12 + 6 * hK) * (caliberMm >= 100 ? 1 : 0.7) | 0;
    for (let i = 0; i < donutN; i++) {
      const a = (i / donutN) * Math.PI * 2 + rng() * 0.5;
      const r0 = 0.6 + rng() * 0.7;
      const firstWave = i % 2 === 0;
      _puffO.pos[0] = pos.x + dir.x * 0.8 + Math.cos(a) * r0;
      _puffO.pos[1] = gy + 0.85;
      _puffO.pos[2] = pos.z + dir.z * 0.8 + Math.sin(a) * r0;
      _puffO.vel[0] = Math.cos(a) * (5.0 + rng() * 3.6) + dir.x * 1.5;
      _puffO.vel[1] = 1.1 + rng() * 1.3;
      _puffO.vel[2] = Math.sin(a) * (5.0 + rng() * 3.6) + dir.z * 1.5;
      _puffO.life = (firstWave ? 0.85 + rng() * 0.45 : 1.4 + rng() * 0.8) * (0.85 + 0.15 * dkF);
      _puffO.size0 = 0.45;
      _puffO.size1 = (2.2 + rng() * 1.2) * (0.7 + 0.3 * hK) * (0.75 + 0.3 * dkF);
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.8;
      col3(0x969084, _puffO.col0); col3(0x827c72, _puffO.col1);
      _puffO.alpha = (firstWave ? (0.26 + 0.09 * hK) : (0.20 + 0.07 * hK)) *
        (0.85 + 0.13 * Math.min(dkF, 1.8));
      _puffO.grav = -0.4; _puffO.birthOffset = birthOffset - 0.03;
      particles.emit('dust', _puffO);
    }
    const chipN = Math.round(3 + 3 * hK);
    for (let i = 0; i < chipN; i++) {
      const a = rng() * Math.PI * 2;
      _debO.pos[0] = pos.x + dir.x * 0.9 + Math.cos(a) * 0.5;
      _debO.pos[1] = gy + 0.4;
      _debO.pos[2] = pos.z + dir.z * 0.9 + Math.sin(a) * 0.5;
      _debO.vel[0] = Math.cos(a) * (3.5 + rng() * 3.0) + dir.x * 2.5;
      _debO.vel[1] = 3.0 + rng() * 3.0 * (0.5 + 0.5 * hK);
      _debO.vel[2] = Math.sin(a) * (3.5 + rng() * 3.0) + dir.z * 2.5;
      _debO.life = 0.9; _debO.scale = 0.04 + rng() * 0.05; _debO.spin = 14 + rng() * 16;
      _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
      _debO.groundY = gy; _debO.hot = false; _debO.seed = rng(); _debO.birthOffset = birthOffset;
      particles.emit('debris', _debO);
    }
    for (let i = 0; i < 9; i++) {
      const a = rng() * Math.PI * 2;
      const ahead = 2.2 + rng() * 2.2;
      _puffO.pos[0] = pos.x + dir.x * ahead + Math.cos(a) * 1.2;
      _puffO.pos[1] = gy + 0.95;
      _puffO.pos[2] = pos.z + dir.z * ahead + Math.sin(a) * 1.2;
      _puffO.vel[0] = Math.cos(a) * (2.5 + rng() * 2.5) + dir.x * 4.5;
      _puffO.vel[1] = 0.9 + rng() * 1.1;
      _puffO.vel[2] = Math.sin(a) * (2.5 + rng() * 2.5) + dir.z * 4.5;
      _puffO.life = (1.2 + rng() * 1.0) * (0.85 + 0.15 * dkF);
      _puffO.size0 = 0.5;
      _puffO.size1 = (2.1 + rng() * 1.0) * (0.7 + 0.3 * hK) * (0.75 + 0.3 * dkF);
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.5;
      col3(0x969084, _puffO.col0); col3(0x827c72, _puffO.col1);
      _puffO.alpha = 0.19 + 0.06 * hK; _puffO.grav = -0.4; _puffO.birthOffset = birthOffset - 0.03;
      particles.emit('dust', _puffO);
    }
  }

  /** Short pooled ignition/exhaust: no cannon brake jets, sabot, or ground shock ring. */
  function spawnRocketIgnition(pos: THREE.Vector3, dir: THREE.Vector3, caliberMm: number, birthOffset = 0): void {
    const scale = calScale(caliberMm) * (scopedOwnGun(pos) ? 0.4 : 1);
    const puff = _puffO;
    puff.pos[0] = pos.x; puff.pos[1] = pos.y; puff.pos[2] = pos.z;
    puff.vel[0] = dir.x * 2; puff.vel[1] = dir.y * 2; puff.vel[2] = dir.z * 2;
    puff.life = 0.12; puff.size0 = 0.22 * scale; puff.size1 = 0.6 * scale;
    puff.rot = rng() * Math.PI * 2; puff.rotVel = 0;
    col3(0xffefa0, puff.col0); col3(0xff8b30, puff.col1);
    puff.alpha = 0.65; puff.grav = 0; puff.birthOffset = birthOffset;
    particles.emit('flash', puff);
    puff.life = 0.65; puff.size0 = 0.25 * scale; puff.size1 = 1.05 * scale;
    col3(0xb0aca0, puff.col0); col3(0x7b7b73, puff.col1);
    puff.alpha = 0.3;
    particles.emit('smoke', puff);
    // (240) the motor's flash lights its launcher by the rocket's calibre and the ground under it (muzzleLightPulse) at the
    // 0.3 of a gun's peak it always took: one flat 138 cd for a 57 mm rocket and a 220 mm one alike before
    const pulse = muzzleLightPulse(caliberMm, pos.x, pos.y, pos.z);
    flashLight(lightStates[0], pos, MUZZLE_LIGHT_PEAK * 0.3 * pulse.peakK, -birthOffset, undefined, undefined, undefined,
      pulse.range);
  }

  /**
   * @param {number} reach forward-extent multiplier for the BRIGHT elements
   *   (tongues/spears). 1 for live fire; the screenshot composer passes <1 so
   *   the frozen cone stays inside the combat_firing frame instead of
   *   clipping the screen edge as a blown-out sheet.
   * @returns {number} muzzle-light peak factor (bore-axis view attenuation)
   */
  function spawnMuzzleFlash(
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    caliberMm: number,
    birthOffset = 0,
    reach = 1,
  ): number {
    // Defensive copy (r5): callers may hand in shared scratch vectors; every
    // internal helper below must be free to reuse module scratch without any
    // risk of aliasing the flash's own origin/direction mid-spawn.
    pos = _mfPos.copy(pos);
    dir = _mfDir.copy(dir);
    const s = calScale(caliberMm);
    // Sniper-scope suppression: no flash geometry an inch from the lens —
    // only a thinned propellant haze; the muzzle light + camera kick carry it.
    const scoped = scopedOwnGun(pos);
    // Bore-axis view attenuation: from the dead-astern chase camera every
    // additive card + jet stacks along the view ray into one full-screen
    // white fountain. Shrink (~45%) and dim (~60%) the bright elements as
    // |view · bore| -> 1; side-on framings are untouched.
    let axial = 0;
    let camD = 30;
    const cam = engineCtx && engineCtx.camera;
    if (cam) {
      _camV.copy(pos).sub(cam.position);
      const l = _camV.length();
      camD = l;
      if (l > 1e-4) axial = Math.abs(_camV.dot(dir)) / l;
    }
    // Close-camera energy discipline (r7 "one shot covers 60% of the frame"):
    // inside ~14 m the flash already subtends a big screen area, so the
    // additive stack + bloom snowballed it into a diagonal white wash. Scale
    // brightness AND card size down as the camera closes in; far framings
    // (staged combat_firing at 13 m orbit ≈ 0.75/0.9) are barely touched.
    const nearAtt = THREE.MathUtils.clamp((camD - 3) / 11, 0, 1);
    const nearA = 0.4 + 0.6 * nearAtt;
    const nearS = 0.68 + 0.32 * nearAtt;
    // r5 chase-cam readability floor: from the 13-18 m gameplay camera the
    // shot was "nearly a non-event" — the flash subtends too little screen.
    // Scale the BRIGHT element sizes up with camera distance (1x inside 12 m,
    // up to 2.4x at 29 m+) so a main-gun shot keeps a readable screen-space
    // footprint from chase/battle framings. Alpha untouched — the flash gets
    // BIGGER at range, never hotter (no return of the r7 close-range wash).
    const dkF = THREE.MathUtils.clamp(camD / 12, 1, 2.4);
    // r7 fire-moment wash: the halo/core cards take a SOFTENED distance boost
    // (pow 0.6) — the full 2.4x on the white cores at a 25 m framing was the
    // ~4 m cream ball that bleached the hull at ignition. Jets/petals keep
    // the full dkF for silhouette reach.
    const dkC = Math.pow(dkF, 0.6);
    // r6 (critic: "firing your own gun is a non-event from the chase camera
    // ... reads like a cork pop"): the dead-astern suppression over-corrected
    // — from the default chase pose (axial ~0.95) it cut the flash to ~40%
    // alpha and ~60% size. Relaxed (0.45->0.32 size, 0.62->0.48 alpha): the
    // stacking-wash guard still bites straight down the bore, but the
    // player's own 120 mm shot keeps a readable bloom from the chase cam.
    const axSize = (1 - 0.32 * axial * axial) * nearS * dkF;
    // core-card variant of axSize (softened distance boost — see dkC)
    const axSizeC = (1 - 0.32 * axial * axial) * nearS * dkC;
    const axAtt = (1 - 0.48 * axial * axial) * nearA;
    const lightK = (1 - 0.5 * axial * axial) * (0.55 + 0.45 * nearAtt);
    const state = muzzleFlashState;
    state.pos.copy(pos);
    state.dir.copy(dir);
    state.caliberMm = caliberMm;
    state.birthOffset = birthOffset;
    state.reach = reach;
    state.s = s;
    state.scoped = scoped;
    state.nearAtt = nearAtt;
    state.dkF = dkF;
    state.axSize = axSize;
    state.axSizeC = axSizeC;
    state.axAtt = axAtt;
    state.lightK = lightK;
    basisFrom(dir, _v1, _v2);
    if (!scoped) {
      emitMuzzleCoreAndPetals(state);
      emitMuzzleAxialAndBrakeJets(state);
      emitMuzzleCombustionAndAfterflash(state);
      if (!blast) emitMuzzlePropellantMass(state);
    } // end !scoped
    // destruction-fx lane: the propellant gas and the ground dust are simulated media (the flash stays additive)
    if (blast) {
      mediaMuzzleBlast(blast, { x: pos.x, y: pos.y, z: pos.z, dx: dir.x, dy: dir.y, dz: dir.z, caliberMm,
        surface: scoped ? null : classifyTerrain(heightField, pos.x, pos.z), birthOffset,
        nearAtt: scoped ? 0.35 : 0.55 + 0.45 * nearAtt });
      basisFrom(dir, _v1, _v2);
    } else {
      emitMuzzleSmoke(state);
    }
    // Scoped LIGHT attenuation (r6): the muzzle light an inch from the lens
    // whited out the bottom half of the scope — suppress it like the
    // geometry, leaving a readable kick without the flashbang.
    if (scoped) return lightK * 0.2; // no wisps/bore sparks/ground wash an inch from the lens
    emitLingeringMuzzleFx(state, !blast);
    emitMuzzleGroundBlast(state, !blast);
    return lightK;
  }

  /** APFSDS sabot petals discarding just past the muzzle (shells doc §10). */
  function spawnSabotPetals(
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    birthOffset = 0,
  ): void {
    basisFrom(dir, _v1, _v2);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + rng();
      const rx = _v1.x * Math.cos(a) + _v2.x * Math.sin(a);
      const ry = _v1.y * Math.cos(a) + _v2.y * Math.sin(a);
      const rz = _v1.z * Math.cos(a) + _v2.z * Math.sin(a);
      _debO.pos[0] = pos.x + dir.x * 1.5; _debO.pos[1] = pos.y + dir.y * 1.5; _debO.pos[2] = pos.z + dir.z * 1.5;
      _debO.vel[0] = dir.x * 60 + rx * 14; _debO.vel[1] = dir.y * 60 + ry * 14 + 2; _debO.vel[2] = dir.z * 60 + rz * 14;
      // r1: life 1.4 -> 0.55 s — petals launched from a ~2 m muzzle at 60 m/s
      // are down within ~0.5 s; the old life left them frozen on the grass as
      // paper-litter scraps for a full second after every APFSDS shot
      _debO.life = 0.55; _debO.scale = 0.09; _debO.spin = 20 + rng() * 20;
      _debO.axis[0] = rx; _debO.axis[1] = ry; _debO.axis[2] = rz;
      _debO.groundY = groundY(pos.x, pos.z);
      _debO.hot = false; _debO.seed = rng(); _debO.birthOffset = birthOffset;
      particles.emit('debris', _debO);
    }
  }

  /**
   * Cone of spark streaks around `normal`. `jitterS` staggers births so a
   * frozen frame shows a mix of ages — long fresh leaders, short dying
   * drooping arcs — never a symmetric fan of identical lines.
   */
  function sparkFan(
    pos: THREE.Vector3,
    normal: THREE.Vector3,
    count: number,
    speed: number,
    spread: number,
    colHex: number,
    life: number,
    width: number,
    stretch: number,
    birthOffset = 0,
    jitterS = 0,
  ): void {
    basisFrom(normal, _v1, _v2);
    col3(colHex, _strkO.col);
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2;
      const tilt = rng() * spread;
      const st = Math.sin(tilt);
      const cx = Math.cos(a) * st, sx = Math.sin(a) * st, n = Math.cos(tilt);
      const v = speed * (0.4 + rng() * 0.9);
      _strkO.pos[0] = pos.x + normal.x * 0.05; _strkO.pos[1] = pos.y + normal.y * 0.05; _strkO.pos[2] = pos.z + normal.z * 0.05;
      _strkO.vel[0] = (normal.x * n + _v1.x * cx + _v2.x * sx) * v;
      _strkO.vel[1] = (normal.y * n + _v1.y * cx + _v2.y * sx) * v;
      _strkO.vel[2] = (normal.z * n + _v1.z * cx + _v2.z * sx) * v;
      _strkO.life = life * (0.5 + rng() * 0.8);
      // per-spark width/brightness variation so the shower never reads as
      // uniform confetti — a few fat bright leaders among dim thin trails
      _strkO.width = width * (0.6 + rng() * 0.9); _strkO.stretch = stretch * (0.7 + rng() * 0.7);
      _strkO.grav = -21.6;
      _strkO.alpha = 0.5 + rng() * 0.5; _strkO.seed = rng();
      _strkO.birthOffset = birthOffset - rng() * jitterS;
      particles.emit('sparks', _strkO);
    }
  }

  /** Drifting smoke puffs leaving an impact point along `normal`. */
  function impactSmoke(
    pos: THREE.Vector3,
    normal: THREE.Vector3,
    count: number,
    size: number,
    colHex0: number,
    colHex1: number,
    alpha: number,
    birthOffset = 0,
  ): void {
    for (let i = 0; i < count; i++) {
      _puffO.pos[0] = pos.x + normal.x * 0.2 + (rng() - 0.5) * 0.3;
      _puffO.pos[1] = pos.y + normal.y * 0.2 + (rng() - 0.5) * 0.3;
      _puffO.pos[2] = pos.z + normal.z * 0.2 + (rng() - 0.5) * 0.3;
      _puffO.vel[0] = normal.x * (1.5 + rng() * 2) + (rng() - 0.5);
      _puffO.vel[1] = normal.y * (1.5 + rng() * 2) + 0.8 + rng() * 0.5;
      _puffO.vel[2] = normal.z * (1.5 + rng() * 2) + (rng() - 0.5);
      _puffO.life = 0.9 + rng() * 1.0;
      _puffO.size0 = size * 0.4; _puffO.size1 = size * (1.4 + rng() * 0.6);
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 3;
      col3(colHex0, _puffO.col0); col3(colHex1, _puffO.col1);
      _puffO.alpha = alpha; _puffO.grav = 0.9; _puffO.birthOffset = birthOffset;
      particles.emit('smoke', _puffO);
    }
  }

  /** Very short additive flash burst at a hit point. */
  function hitFlash(
    pos: THREE.Vector3,
    normal: THREE.Vector3,
    s: number,
    colHex0: number,
    colHex1: number,
    birthOffset = 0,
  ): void {
    for (let i = 0; i < 3; i++) {
      _puffO.pos[0] = pos.x + normal.x * 0.15; _puffO.pos[1] = pos.y + normal.y * 0.15; _puffO.pos[2] = pos.z + normal.z * 0.15;
      _puffO.vel[0] = normal.x * 2; _puffO.vel[1] = normal.y * 2; _puffO.vel[2] = normal.z * 2;
      _puffO.life = 0.06 + rng() * 0.05;
      _puffO.size0 = 0.5 * s; _puffO.size1 = 1.6 * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = 0;
      col3(colHex0, _puffO.col0); col3(colHex1, _puffO.col1);
      _puffO.alpha = 1.0; _puffO.grav = 0; _puffO.birthOffset = birthOffset;
      particles.emit('fire', _puffO);
    }
  }

  function emitDirtClods(
    pos: THREE.Vector3,
    scale: number,
    big: boolean,
    birthOffset: number,
    gy: number,
    baseY: number,
  ): void {
    const clodCount = big ? 9 : 6;
    const trailCount = big ? 7 : 5;
    for (let index = 0; index < clodCount; index++) {
      const angle = rng() * Math.PI * 2;
      const tilt = rng() * 0.7;
      const vx = Math.cos(angle) * Math.sin(tilt) * 14 * scale;
      const vy = (9 + rng() * 9) * scale;
      const vz = Math.sin(angle) * Math.sin(tilt) * 14 * scale;
      _debO.pos[0] = pos.x;
      _debO.pos[1] = baseY;
      _debO.pos[2] = pos.z;
      _debO.vel[0] = vx;
      _debO.vel[1] = vy;
      _debO.vel[2] = vz;
      _debO.life = 2.2;
      _debO.scale = 0.1 + rng() * 0.12 * scale;
      _debO.spin = 6 + rng() * 14;
      _debO.axis[0] = rng() - 0.5;
      _debO.axis[1] = rng() - 0.5;
      _debO.axis[2] = rng() - 0.5;
      _debO.groundY = gy;
      _debO.hot = false;
      _debO.seed = rng();
      _debO.birthOffset = birthOffset;
      particles.emit('debris', _debO);
      if (index >= trailCount) continue;
      for (let trailTime = 0.06; trailTime < 1.0; trailTime += 0.1) {
        const sampledDrag = (1 - Math.exp(-0.12 * trailTime)) / 0.12;
        const py = baseY + vy * sampledDrag - 10.8 * trailTime * trailTime;
        if (py < gy + 0.25) break;
        _puffO.pos[0] = pos.x + vx * sampledDrag + (rng() - 0.5) * 0.12;
        _puffO.pos[1] = py;
        _puffO.pos[2] = pos.z + vz * sampledDrag + (rng() - 0.5) * 0.12;
        _puffO.vel[0] = (rng() - 0.5) * 0.3;
        _puffO.vel[1] = -0.4 - rng() * 0.5;
        _puffO.vel[2] = (rng() - 0.5) * 0.3;
        _puffO.life = 0.5 + rng() * 0.4;
        _puffO.size0 = 0.15 * scale;
        _puffO.size1 = 0.5 * scale;
        _puffO.rot = rng() * Math.PI * 2;
        _puffO.rotVel = (rng() - 0.5) * 2;
        col3(0x4a3b29, _puffO.col0);
        col3(0x5d5040, _puffO.col1);
        _puffO.alpha = 0.7;
        _puffO.grav = -1.5;
        _puffO.birthOffset = birthOffset + trailTime * 0.9;
        particles.emit('smoke', _puffO);
      }
    }
  }

  /** HE / terrain dirt plume: dark column + radial skirt + clods + dust ring. */
  function dirtPlume(
    pos: THREE.Vector3,
    caliberMm: number,
    big: boolean,
    birthOffset = 0,
  ): void {
    const s = calScale(caliberMm) * (big ? 1.7 : 1.15);
    const gy = groundY(pos.x, pos.z);
    const baseY = Math.max(pos.y, gy) + 0.5;
    // dark ejecta core: a dense near-black heart the caliber punches out of
    // the soil — the r5 plume was one small brown puff with no core
    for (let i = 0; i < (big ? 6 : 4); i++) {
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.4 * s;
      _puffO.pos[1] = baseY + rng() * 0.3;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.4 * s;
      _puffO.vel[0] = (rng() - 0.5) * 1.6; _puffO.vel[1] = (9 + rng() * 6) * s; _puffO.vel[2] = (rng() - 0.5) * 1.6;
      _puffO.life = 0.9 + rng() * 0.7;
      _puffO.size0 = 0.5 * s; _puffO.size1 = (1.9 + rng() * 0.9) * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 3;
      col3(0x362b1e, _puffO.col0); col3(0x4b3e2c, _puffO.col1);
      _puffO.alpha = 0.9; _puffO.grav = -7; _puffO.birthOffset = birthOffset;
      particles.emit('smoke', _puffO);
    }
    // central dirt column
    const colN = big ? 14 : 8;
    for (let i = 0; i < colN; i++) {
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.8 * s;
      _puffO.pos[1] = baseY + rng() * 0.6;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.8 * s;
      _puffO.vel[0] = (rng() - 0.5) * 2.5; _puffO.vel[1] = (7 + rng() * 7) * s; _puffO.vel[2] = (rng() - 0.5) * 2.5;
      _puffO.life = 1.3 + rng() * 1.2;
      _puffO.size0 = 0.7 * s; _puffO.size1 = (2.8 + rng() * 1.4) * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
      col3(0x5c4a33, _puffO.col0); col3(0x77664d, _puffO.col1);
      _puffO.alpha = 0.85; _puffO.grav = -6; _puffO.birthOffset = birthOffset;
      particles.emit('smoke', _puffO);
    }
    // radial skirt
    const skN = big ? 12 : 7;
    for (let i = 0; i < skN; i++) {
      const a = (i / skN) * Math.PI * 2 + rng() * 0.5;
      _puffO.pos[0] = pos.x + Math.cos(a) * 0.5 * s; _puffO.pos[1] = baseY; _puffO.pos[2] = pos.z + Math.sin(a) * 0.5 * s;
      _puffO.vel[0] = Math.cos(a) * (5 + rng() * 3) * s;
      _puffO.vel[1] = 2.5 + rng() * 2;
      _puffO.vel[2] = Math.sin(a) * (5 + rng() * 3) * s;
      _puffO.life = 1.0 + rng() * 0.8;
      _puffO.size0 = 0.6 * s; _puffO.size1 = 2.2 * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
      col3(0x6b5940, _puffO.col0); col3(0x857556, _puffO.col1);
      _puffO.alpha = 0.6; _puffO.grav = -3; _puffO.birthOffset = birthOffset;
      particles.emit('smoke', _puffO);
    }
    // lingering dust pall: a drifting haze that hangs ~3 s at the impact
    // point after the plume collapses (r5: pall was far too short)
    for (let i = 0; i < (big ? 10 : 7); i++) {
      const a = rng() * Math.PI * 2;
      const d = rng() * 2.4 * s;
      _puffO.pos[0] = pos.x + Math.cos(a) * d; _puffO.pos[1] = baseY + 0.2; _puffO.pos[2] = pos.z + Math.sin(a) * d;
      _puffO.vel[0] = Math.cos(a) * (1.0 + rng()) + 0.3; _puffO.vel[1] = 0.6 + rng() * 0.6; _puffO.vel[2] = Math.sin(a) * (1.0 + rng());
      _puffO.life = 3.2 + rng() * 1.8;
      _puffO.size0 = 1.0 * s; _puffO.size1 = (4.4 + rng() * 1.4) * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5);
      col3(0x8f8672, _puffO.col0); col3(0x7d766a, _puffO.col1);
      _puffO.alpha = 0.30 + rng() * 0.1; _puffO.grav = -0.25; _puffO.birthOffset = birthOffset + rng() * 0.5;
      particles.emit('dust', _puffO);
    }
    // dirt clods + arcing clod tracer streaks: each clod drags a dotted trail
    // of dark ejecta sampled along the same drag trajectory the debris shader
    // integrates (k = 0.12, g = -21.6) — the WoT "soil fountain" signature
    emitDirtClods(pos, s, big, birthOffset, gy, baseY);
  }

  /** Open water under a world point: past the shore feather of the map's shallow-water mask. */
  function shellPointOnWater(p: THREE.Vector3): boolean {
    return (heightField?.getWaterMaskAt?.(p.x, p.z) ?? 0) > 0.5;
  }

  /**
   * water pass 2026-09-12 (owner: "make water more interactive"): a shell
   * ending in open water. White column with a dark wet heart, a flat foam
   * ring that runs out across the surface, glinting spray droplets, a short
   * drifting mist, and one wake print on the disturbed patch. Same pools as
   * the dirt plume, so no new material, texture or draw enters the frame.
   */
  function waterSplash(
    pos: THREE.Vector3,
    caliberMm: number,
    big: boolean,
    birthOffset = 0,
  ): void {
    const s = calScale(caliberMm) * (big ? 1.6 : 1.1);
    const surfaceY = heightField?.getWaterSurfaceHeightAt?.(pos.x, pos.z)
      ?? groundY(pos.x, pos.z) + (heightField?.getWaterDepthAt?.(pos.x, pos.z) ?? 0);
    // water pass 8: the splash also lands in the reactive field — a crater that rings out across the surface
    heightField?.addWaterImpulse?.(pos.x, pos.z, 0.9 + 1.1 * s, 0.22 * s, 0.85);
    const baseY = surfaceY + 0.25;
    // wet heart: the dark water thrown up with the column
    for (let i = 0; i < (big ? 5 : 3); i++) {
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.4 * s;
      _puffO.pos[1] = baseY + rng() * 0.3;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.4 * s;
      _puffO.vel[0] = (rng() - 0.5) * 1.4; _puffO.vel[1] = (11 + rng() * 6) * s; _puffO.vel[2] = (rng() - 0.5) * 1.4;
      _puffO.life = 0.7 + rng() * 0.4;
      _puffO.size0 = 0.45 * s; _puffO.size1 = (1.5 + rng() * 0.6) * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 3;
      col3(0x3d5a62, _puffO.col0); col3(0x6d8a90, _puffO.col1);
      _puffO.alpha = 0.85; _puffO.grav = -11; _puffO.birthOffset = birthOffset;
      particles.emit('smoke', _puffO);
    }
    // white column: fast, tall, short-lived, collapses under gravity
    const colN = big ? 14 : 9;
    for (let i = 0; i < colN; i++) {
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.6 * s;
      _puffO.pos[1] = baseY + rng() * 0.5;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.6 * s;
      _puffO.vel[0] = (rng() - 0.5) * 2.2; _puffO.vel[1] = (9 + rng() * 9) * s; _puffO.vel[2] = (rng() - 0.5) * 2.2;
      _puffO.life = 0.9 + rng() * 0.6;
      _puffO.size0 = 0.6 * s; _puffO.size1 = (2.2 + rng() * 1.0) * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
      col3(0xdfe9ea, _puffO.col0); col3(0xb9cbd0, _puffO.col1);
      _puffO.alpha = 0.9; _puffO.grav = -10; _puffO.birthOffset = birthOffset;
      particles.emit('smoke', _puffO);
    }
    // foam ring: low, flat, running out across the surface
    const ringN = big ? 14 : 9;
    for (let i = 0; i < ringN; i++) {
      const a = (i / ringN) * Math.PI * 2 + rng() * 0.4;
      _puffO.pos[0] = pos.x + Math.cos(a) * 0.6 * s; _puffO.pos[1] = surfaceY + 0.12; _puffO.pos[2] = pos.z + Math.sin(a) * 0.6 * s;
      _puffO.vel[0] = Math.cos(a) * (6 + rng() * 3) * s;
      _puffO.vel[1] = 0.6 + rng() * 0.8;
      _puffO.vel[2] = Math.sin(a) * (6 + rng() * 3) * s;
      _puffO.life = 1.2 + rng() * 0.8;
      _puffO.size0 = 0.5 * s; _puffO.size1 = 2.6 * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.5;
      col3(0xe8f0f0, _puffO.col0); col3(0xc3d2d5, _puffO.col1);
      _puffO.alpha = 0.55; _puffO.grav = -1.2; _puffO.birthOffset = birthOffset;
      particles.emit('dust', _puffO);
    }
    // drifting mist after the column falls back
    for (let i = 0; i < (big ? 8 : 5); i++) {
      const a = rng() * Math.PI * 2;
      const d = rng() * 1.6 * s;
      _puffO.pos[0] = pos.x + Math.cos(a) * d; _puffO.pos[1] = surfaceY + 0.6; _puffO.pos[2] = pos.z + Math.sin(a) * d;
      _puffO.vel[0] = Math.cos(a) * (0.6 + rng() * 0.6) + 0.3; _puffO.vel[1] = 0.5 + rng() * 0.5; _puffO.vel[2] = Math.sin(a) * (0.6 + rng() * 0.6);
      _puffO.life = 1.8 + rng() * 1.2;
      _puffO.size0 = 0.9 * s; _puffO.size1 = (3.2 + rng() * 1.2) * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5);
      col3(0xd6e2e6, _puffO.col0); col3(0xc0cfd4, _puffO.col1);
      _puffO.alpha = 0.22 + rng() * 0.08; _puffO.grav = -0.15; _puffO.birthOffset = birthOffset + rng() * 0.4;
      particles.emit('dust', _puffO);
    }
    // spray: glinting droplets thrown up and out
    sparkFan(pos, _UP, big ? 26 : 16, 13 * s, 0.9, 0xeaf4f8, 0.55, 0.03, 0.05, birthOffset);
    // the disturbed patch keeps a wake print on the surface
    _v4.set(rng() - 0.5, 0, rng() - 0.5).normalize();
    stampTrackPrint(pos, _v4, true);
  }

  /** HE detonation fireball (scaled by caliber) — flash + fire + black smoke. */
  function heFireball(
    pos: THREE.Vector3,
    caliberMm: number,
    birthOffset = 0,
  ): void {
    const s = calScale(caliberMm) * 1.3;
    for (let i = 0; i < 10; i++) {
      const a = rng() * Math.PI * 2, b = rng() * Math.PI;
      const v = (3 + rng() * 5) * s;
      _puffO.pos[0] = pos.x; _puffO.pos[1] = pos.y + 0.2; _puffO.pos[2] = pos.z;
      _puffO.vel[0] = Math.cos(a) * Math.sin(b) * v;
      _puffO.vel[1] = Math.abs(Math.cos(b)) * v + 1.5;
      _puffO.vel[2] = Math.sin(a) * Math.sin(b) * v;
      _puffO.life = 0.25 + rng() * 0.25;
      _puffO.size0 = 0.8 * s; _puffO.size1 = 2.6 * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 5;
      col3(0xfff0b0, _puffO.col0); col3(0xe65c14, _puffO.col1);
      _puffO.alpha = 1.0; _puffO.grav = 2; _puffO.birthOffset = birthOffset;
      particles.emit('fire', _puffO);
    }
    impactSmoke(_sv.set(pos.x, pos.y + 0.4, pos.z), _UP, 8, 1.6 * s, 0x2c2a28, 0x565450, 0.7, birthOffset);
  }

  function emitDestructionFlash(
    pos: THREE.Vector3,
    cy: number,
    burn: boolean,
    dk: number,
    birthOffset: number,
    plain = false,
  ): void {
    // (fx 8o, wave 356) a plain kill (no ammunition explosion): two small flashes, not the cook-off's bulb
    const count = burn ? 1 : plain ? 2 : 3;
    if (plain) dk *= 0.55;
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2, b = rng() * Math.PI;
      const v = 2 + rng() * 4;
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.6; _puffO.pos[1] = cy + (rng() - 0.5) * 0.6; _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.6;
      _puffO.vel[0] = Math.cos(a) * Math.sin(b) * v;
      _puffO.vel[1] = Math.abs(Math.cos(b)) * v + 2;
      _puffO.vel[2] = Math.sin(a) * Math.sin(b) * v;
      // (the combat review 10-13: "white-outs at the kill: the hit flash blooms the hero to pure white for several
      // frames") two to four frames, smaller and warmer, its bloom share capped
      _puffO.life = 0.04 + rng() * 0.03;
      _puffO.size0 = (1.1 + rng() * 0.8) * dk; _puffO.size1 = (2.4 + rng() * 0.9) * dk;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 3;
      // (b6: a white bulb on a kill's first frame) a hot yellow flash, not white
      col3(0xffcf8a, _puffO.col0); col3(0xff9038, _puffO.col1);
      _puffO.alpha = 0.7; _puffO.grav = 0; _puffO.birthOffset = birthOffset;
      particles.emit('flash', _puffO);
    }
  }

  function emitDestructionOuterBillows(
    pos: THREE.Vector3,
    cy: number,
    rack: boolean,
    burn: boolean,
    fireS: number,
    dk: number,
    birthOffset: number,
  ): void {
    const count = rack ? 12 : (burn ? 6 : 9);
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2, b = rng() * Math.PI;
      const crown = i < 3 && !burn;
      const v = (2.6 + rng() * 3.6) * fireS;
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 1.1 * fireS;
      _puffO.pos[1] = cy + (crown ? 0.8 + rng() * 1.2 : (rng() - 0.4) * 1.1);
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 1.1 * fireS;
      _puffO.vel[0] = Math.cos(a) * Math.sin(b) * v;
      _puffO.vel[1] = Math.abs(Math.cos(b)) * v * 0.5 + (crown ? 2.4 : 1.1);
      _puffO.vel[2] = Math.sin(a) * Math.sin(b) * v;
      _puffO.life = crown ? 1.25 + rng() * 0.6 : 0.85 + rng() * 0.75;
      _puffO.size0 = (crown ? 2.8 + rng() * 1.0 : 2.0 + rng() * 1.0) * fireS * dk;
      _puffO.size1 = (crown ? 7.0 + rng() * 2.2 : 4.8 + rng() * 1.8) * fireS * dk;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 3;
      col3(0x4a423a, _puffO.col0); col3(0x2b2723, _puffO.col1);
      _puffO.alpha = 0.88 + rng() * 0.1; _puffO.grav = 1.1;
      _puffO.birthOffset = i < count / 3
        ? birthOffset - rng() * 0.25
        : birthOffset + rng() * 0.35;
      particles.emit('billow', _puffO);
    }
  }

  function emitDestructionFirePockets(
    pos: THREE.Vector3,
    cy: number,
    rack: boolean,
    burn: boolean,
    fireS: number,
    dk: number,
    birthOffset: number,
    plain = false,
  ): void {
    // (fx 8o, wave 356: "a flat orange hit-flash disc at 0.20-0.50 s" on a plain kill) a plain kill licks three short
    // tongues out of its media fireball, whose own heat and inner glow carry the flash with volume and falloff
    // (the combat review 10-13: "clusters of round orange cotton balls") fewer, shorter, smaller tongues: the fire stays
    // at the hull and is gone into smoke within half a second
    const count = rack ? 7 : (burn ? 5 : plain ? 3 : 5);
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2, b = rng() * Math.PI;
      const v = (2.2 + rng() * 3.0) * fireS;
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 1.0 * fireS;
      _puffO.pos[1] = cy + (rng() - 0.55) * 1.0;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 1.0 * fireS;
      _puffO.vel[0] = Math.cos(a) * Math.sin(b) * v;
      _puffO.vel[1] = Math.abs(Math.cos(b)) * v * 0.45 + 0.9;
      _puffO.vel[2] = Math.sin(a) * Math.sin(b) * v;
      // (fx 8i, wave 334a killcam: "a cream-salmon exposure wash at 0.4 s") smaller, shorter tongues: the media
      // fireball carries the body, these only lick out of it
      _puffO.life = plain ? 0.18 + rng() * 0.2 : 0.22 + rng() * 0.25;
      _puffO.size0 = (1.1 + rng() * 0.6) * fireS * dk; _puffO.size1 = (2.0 + rng() * 1.0) * fireS * dk;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 4;
      col3(0xffd865, _puffO.col0); col3(0xd8420a, _puffO.col1);
      _puffO.alpha = 0.3 + rng() * 0.14; _puffO.grav = 1.0;
      _puffO.birthOffset = i < count / 3
        ? birthOffset - rng() * 0.25
        : birthOffset + rng() * 0.35;
      particles.emit('fire', _puffO);
    }
  }

  function emitDestructionFireball(
    pos: THREE.Vector3,
    cy: number,
    rack: boolean,
    burn: boolean,
    dk: number,
    birthOffset: number,
  ): number {
    const fireS = burn ? 0.7 : 1;
    const anchorCount = burn ? 2 : 4;
    for (let i = 0; i < anchorCount; i++) {
      const a = (i / 4) * Math.PI * 2 + rng() * 0.9;
      _puffO.pos[0] = pos.x + Math.cos(a) * (0.5 + rng() * 0.5);
      _puffO.pos[1] = cy - 0.85 + rng() * 0.35;
      _puffO.pos[2] = pos.z + Math.sin(a) * (0.5 + rng() * 0.5);
      _puffO.vel[0] = Math.cos(a) * (1.0 + rng() * 0.8);
      _puffO.vel[1] = 0.8 + rng() * 0.6;
      _puffO.vel[2] = Math.sin(a) * (1.0 + rng() * 0.8);
      _puffO.life = 0.9 + rng() * 0.5;
      _puffO.size0 = (2.1 + rng() * 0.7) * fireS * dk;
      _puffO.size1 = (4.2 + rng() * 1.2) * fireS * dk;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2.5;
      col3(0x4a423a, _puffO.col0); col3(0x2b2723, _puffO.col1);
      _puffO.alpha = 0.9; _puffO.grav = 1.0;
      _puffO.birthOffset = birthOffset - 0.1 - rng() * 0.15;
      particles.emit('billow', _puffO);
    }
    const coreCount = burn ? 1 : 3;
    for (let i = 0; i < coreCount; i++) {
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.5;
      _puffO.pos[1] = cy + (rng() - 0.6) * 0.9;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.5;
      _puffO.vel[0] = (rng() - 0.5) * 0.8;
      _puffO.vel[1] = 1.3 + rng() * 0.7;
      _puffO.vel[2] = (rng() - 0.5) * 0.8;
      _puffO.life = 1.15 + rng() * 0.55;
      _puffO.size0 = (2.9 + rng() * 0.9) * fireS * dk;
      _puffO.size1 = (6.0 + rng() * 1.5) * fireS * dk;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
      col3(0x4a423a, _puffO.col0); col3(0x2b2723, _puffO.col1);
      _puffO.alpha = 0.96; _puffO.grav = 0.9;
      _puffO.birthOffset = birthOffset - 0.06 - rng() * 0.12;
      particles.emit('billow', _puffO);
    }
    emitDestructionOuterBillows(pos, cy, rack, burn, fireS, dk, birthOffset);
    emitDestructionFirePockets(pos, cy, rack, burn, fireS, dk, birthOffset);
    return fireS;
  }

  function deferFxBatch(birthOffset: number, delayS: number, fn: () => void): void {
    if (birthOffset < 0 || frozen) fn();
    else timers.push({ t: delayS, fn });
  }

  function scheduleDestructionSmokeTakeover(
    posX: number,
    posZ: number,
    cy: number,
    fireS: number,
    dk: number,
    birthOffset: number,
  ): void {
    deferFxBatch(birthOffset, 0.03, () => {
      for (let i = 0; i < 14; i++) {
        const a = rng() * Math.PI * 2;
        const r = (0.6 + rng() * 1.5) * fireS;
        _puffO.pos[0] = posX + Math.cos(a) * r;
        _puffO.pos[1] = cy + rng() * 2.2;
        _puffO.pos[2] = posZ + Math.sin(a) * r;
        _puffO.vel[0] = Math.cos(a) * (1.2 + rng() * 1.8);
        _puffO.vel[1] = 2.2 + rng() * 2.6;
        _puffO.vel[2] = Math.sin(a) * (1.2 + rng() * 1.8);
        _puffO.life = 2.4 + rng() * 2.2;
        _puffO.size0 = (1.4 + rng() * 0.8) * dk; _puffO.size1 = (4.6 + rng() * 2.2) * dk;
        _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
        col3(0x2f2b26, _puffO.col0); col3(0x605d53, _puffO.col1);
        _puffO.alpha = 0.62 + rng() * 0.14; _puffO.grav = 1.1;
        _puffO.birthOffset = birthOffset + 0.4 + rng() * 1.0;
        particles.emit('smoke', _puffO);
      }
    });
  }

  function emitDestructionInteriorSmoke(
    pos: THREE.Vector3,
    cy: number,
    birthOffset: number,
  ): void {
    for (let i = 0; i < 12; i++) {
      const a = rng() * Math.PI * 2;
      const r = 0.5 + rng() * 1.1;
      _puffO.pos[0] = pos.x + Math.cos(a) * r;
      _puffO.pos[1] = cy + (rng() - 0.3) * 1.4;
      _puffO.pos[2] = pos.z + Math.sin(a) * r;
      _puffO.vel[0] = Math.cos(a) * (1.5 + rng() * 2); _puffO.vel[1] = 1.8 + rng() * 2.2; _puffO.vel[2] = Math.sin(a) * (1.5 + rng() * 2);
      _puffO.life = 1.1 + rng() * 0.9;
      _puffO.size0 = 1.0 + rng() * 0.6; _puffO.size1 = 3.0 + rng() * 1.4;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 3;
      col3(0x211d1a, _puffO.col0); col3(0x3d3833, _puffO.col1);
      _puffO.alpha = 0.5 + rng() * 0.2; _puffO.grav = 1.2; _puffO.birthOffset = birthOffset - rng() * 0.15;
      particles.emit('smoke', _puffO);
    }
  }

  function emitDestructionHullFire(
    pos: THREE.Vector3,
    gy: number,
    cy: number,
    rack: boolean,
    burn: boolean,
    birthOffset: number,
    plain = false,
  ): void {
    // (fx 8o, wave 356: "a flat orange hit-flash disc at 0.20-0.50 s" on a plain kill) a plain kill's fire licks out of
    // the hull in three short tongues, not a cook-off's ring of flame jetting along the ground
    const skirtCount = burn ? 4 : plain ? 3 : 10;
    const skirtK = plain ? 0.6 : 1;
    for (let i = 0; i < skirtCount; i++) {
      const a = rng() * Math.PI * 2;
      const r = 1.2 + rng() * 1.0;
      _puffO.pos[0] = pos.x + Math.cos(a) * r; _puffO.pos[1] = gy + 0.9 + rng() * 0.4; _puffO.pos[2] = pos.z + Math.sin(a) * r;
      _puffO.vel[0] = Math.cos(a) * (3.5 + rng() * 3) * skirtK;
      _puffO.vel[1] = 1.2 + rng() * 1.2;
      _puffO.vel[2] = Math.sin(a) * (3.5 + rng() * 3) * skirtK;
      _puffO.life = (0.55 + rng() * 0.5) * skirtK;
      _puffO.size0 = (0.8 + rng() * 0.4) * skirtK; _puffO.size1 = (2.2 + rng() * 0.8) * skirtK;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 4;
      col3(0xffc040, _puffO.col0); col3(0xff4a08, _puffO.col1);
      _puffO.alpha = plain ? 0.4 : 0.55; _puffO.grav = 1.5; _puffO.birthOffset = birthOffset - rng() * 0.15;
      particles.emit('fire', _puffO);
    }
    const ringFireCount = rack ? 4 : 0;
    for (let i = 0; i < ringFireCount; i++) {
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.7;
      _puffO.pos[1] = cy + 0.15 + rng() * 0.3;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.7;
      _puffO.vel[0] = (rng() - 0.5) * 0.4;
      _puffO.vel[1] = 0.8 + rng() * 0.6;
      _puffO.vel[2] = (rng() - 0.5) * 0.4;
      // (fx 8i, wave 334a killcam: "salmon sprite puffs inside the smoke at 1.8-3.0 s") the ring fire's flames are
      // brief licks that end deep orange, not slow cards fading through salmon inside the smoke for seconds
      _puffO.life = 0.6 + rng() * 0.5;
      _puffO.size0 = 0.8 + rng() * 0.4; _puffO.size1 = 1.3 + rng() * 0.5;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 4;
      col3(0xffd070, _puffO.col0); col3(0xd23c08, _puffO.col1);
      _puffO.alpha = 0.6; _puffO.grav = 1.2;
      _puffO.birthOffset = birthOffset - rng() * 0.4 + i * 0.45;
      particles.emit('fire', _puffO);
    }
    const geyserCount = rack ? 9 : 0;
    for (let i = 0; i < geyserCount; i++) {
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.5;
      _puffO.pos[1] = cy + 0.4 + rng() * 0.6;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.5;
      _puffO.vel[0] = (rng() - 0.5) * 2.2;
      _puffO.vel[1] = 9 + rng() * 7;
      _puffO.vel[2] = (rng() - 0.5) * 2.2;
      _puffO.life = 0.55 + rng() * 0.55;
      _puffO.size0 = 0.8 + rng() * 0.5; _puffO.size1 = 2.0 + rng() * 1.0;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 5;
      col3(0xffe9a0, _puffO.col0); col3(0xff4a06, _puffO.col1);
      _puffO.alpha = 0.7; _puffO.grav = -2; _puffO.birthOffset = birthOffset - rng() * 0.12;
      particles.emit('fire', _puffO);
    }
    const hatchJetCount = rack ? 3 : (burn ? 0 : 2);
    for (let i = 0; i < hatchJetCount; i++) {
      const a = rng() * Math.PI * 2;
      const tilt = 0.25 + rng() * 0.45;
      _sv.set(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt)).normalize();
      _jetO.pos[0] = pos.x + (rng() - 0.5) * 1.0;
      _jetO.pos[1] = cy + 0.3;
      _jetO.pos[2] = pos.z + (rng() - 0.5) * 1.0;
      _jetO.axis[0] = _sv.x; _jetO.axis[1] = _sv.y; _jetO.axis[2] = _sv.z;
      _jetO.life = 0.14 + rng() * 0.08;
      _jetO.width = 0.30 + rng() * 0.12;
      _jetO.len0 = 0.5; _jetO.len1 = 2.6 + rng() * 1.4;
      _jetO.seed = rng();
      col3(0xffd98c, _jetO.col);
      _jetO.alpha = 0.85; _jetO.birthOffset = birthOffset - rng() * 0.05;
      particles.emit('jet', _jetO);
    }
    for (let i = 0; i < 8; i++) {
      const a = rng() * Math.PI * 2;
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 1.2; _puffO.pos[1] = cy + rng() * 0.6; _puffO.pos[2] = pos.z + (rng() - 0.5) * 1.2;
      _puffO.vel[0] = Math.cos(a) * (0.5 + rng()); _puffO.vel[1] = 4 + rng() * 4; _puffO.vel[2] = Math.sin(a) * (0.5 + rng());
      _puffO.life = 0.6 + rng() * 0.6;
      _puffO.size0 = 0.9 + rng() * 0.5; _puffO.size1 = 2.4 + rng();
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 4;
      col3(0xffc040, _puffO.col0); col3(0xff4a08, _puffO.col1);
      _puffO.alpha = 0.6; _puffO.grav = 3; _puffO.birthOffset = birthOffset - rng() * 0.2;
      particles.emit('fire', _puffO);
    }
  }

  function emitDestructionSmokeCap(
    pos: THREE.Vector3,
    cy: number,
    dk: number,
    birthOffset: number,
  ): void {
    for (let i = 0; i < 30; i++) {
      const a = rng() * Math.PI * 2;
      const v = 1 + rng() * 2.5;
      const high = i < 12;
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 1.2;
      _puffO.pos[1] = cy + (high ? 1.2 + rng() * 2.0 : rng() * 1.2);
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 1.2;
      _puffO.vel[0] = Math.cos(a) * v + COLUMN_WIND_X * 0.7;
      _puffO.vel[1] = 3.2 + rng() * 4.0;
      _puffO.vel[2] = Math.sin(a) * v + COLUMN_WIND_Z * 0.7;
      _puffO.life = 3.2 + rng() * 2.0;
      _puffO.size0 = (2.5 + rng() * 0.8) * dk; _puffO.size1 = (5.8 + rng() * 2.4) * dk;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.5;
      if (i % 3 === 2) { col3(0x4a463f, _puffO.col0); col3(0x817d75, _puffO.col1); }
      else { col3(0x363029, _puffO.col0); col3(0x655f56, _puffO.col1); }
      _puffO.alpha = 0.60 + rng() * 0.14; _puffO.grav = 1.3; _puffO.birthOffset = birthOffset - 0.55;
      particles.emit('smoke', _puffO);
    }
  }

  function emitDestructionShockAndSparks(
    pos: THREE.Vector3,
    gy: number,
    cy: number,
    rack: boolean,
    burn: boolean,
    birthOffset: number,
  ): void {
    const ringN = burn ? 10 : 30;
    for (let i = 0; i < ringN; i++) {
      if (rng() < 0.3) continue;
      const a = (i / ringN) * Math.PI * 2 + (rng() - 0.5) * 0.85;
      const rs = 1.4 + rng() * 1.7;
      const sizeK = 0.7 + rng() * 0.9;
      _puffO.pos[0] = pos.x + Math.cos(a) * rs; _puffO.pos[1] = gy + 1.1; _puffO.pos[2] = pos.z + Math.sin(a) * rs;
      _puffO.vel[0] = Math.cos(a) * (7 + rng() * 8); _puffO.vel[1] = 1.1 + rng(); _puffO.vel[2] = Math.sin(a) * (7 + rng() * 8);
      _puffO.life = 1.0 + rng() * 0.9;
      _puffO.size0 = 1.0 * sizeK; _puffO.size1 = (4.0 + rng() * 2.4) * sizeK;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
      col3(0x8a8069, _puffO.col0); col3(0x776f5f, _puffO.col1);
      _puffO.alpha = 0.20 + rng() * 0.13; _puffO.grav = -0.5; _puffO.birthOffset = birthOffset - rng() * 0.1;
      particles.emit('dust', _puffO);
    }
    spawnScorch(pos.x, pos.z, (burn ? 3.6 : 5.4) + rng() * 1.4);
    if (!burn) spawnShockRing(pos.x, pos.z, Math.max(0, -birthOffset));
    sparkFan(_sv.set(pos.x, cy, pos.z), _UP, rack ? 16 : (burn ? 5 : 10), 18, 0.85, 0xffc470, 0.55, 0.05, 0.034, birthOffset, 0.35);
    sparkFan(_sv.set(pos.x, cy + 0.4, pos.z), _UP, rack ? 12 : (burn ? 3 : 8), 9, 1.45, 0xffb860, 0.8, 0.04, 0.04, birthOffset, 0.5);
  }

  function emitHotChunkTrail(
    pos: THREE.Vector3,
    cy: number,
    gy: number,
    dvx: number,
    dvy: number,
    dvz: number,
    birthOffset: number,
  ): void {
    _strkO.pos[0] = pos.x; _strkO.pos[1] = cy; _strkO.pos[2] = pos.z;
    _strkO.vel[0] = dvx; _strkO.vel[1] = dvy; _strkO.vel[2] = dvz;
    _strkO.life = 0.5 + rng() * 0.35;
    _strkO.width = 0.035 + rng() * 0.03; _strkO.stretch = 0.034; _strkO.grav = -21.6;
    col3(0xffc274, _strkO.col); _strkO.alpha = 0.8; _strkO.seed = rng();
    _strkO.birthOffset = birthOffset;
    particles.emit('sparks', _strkO);
    for (let ts = 0.10; ts < 0.6; ts += 0.16) {
      const sd = (1 - Math.exp(-0.12 * ts)) / 0.12;
      const py = cy + dvy * sd - 10.8 * ts * ts;
      if (py < gy + 0.3) break;
      _puffO.pos[0] = pos.x + dvx * sd; _puffO.pos[1] = py; _puffO.pos[2] = pos.z + dvz * sd;
      _puffO.vel[0] = (rng() - 0.5) * 0.4; _puffO.vel[1] = 0.5 + rng() * 0.4; _puffO.vel[2] = (rng() - 0.5) * 0.4;
      _puffO.life = 0.7 + rng() * 0.4;
      _puffO.size0 = 0.22; _puffO.size1 = 0.9 + rng() * 0.4;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
      col3(0x36322e, _puffO.col0); col3(0x605c55, _puffO.col1);
      _puffO.alpha = 0.5; _puffO.grav = 0.5; _puffO.birthOffset = birthOffset + ts;
      particles.emit('smoke', _puffO);
    }
  }

  function emitHotChunkLanding(
    lx: number,
    lz: number,
    birthOffset: number,
  ): void {
    _puffO.pos[1] = groundY(lx, lz) + 0.35;
    _puffO.vel[0] = 0; _puffO.vel[1] = 0.25; _puffO.vel[2] = 0;
    _puffO.life = 0.55 + rng() * 0.3;
    _puffO.size0 = 0.55; _puffO.size1 = 0.22;
    _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = 0;
    col3(0xffa14e, _puffO.col0); col3(0x99290a, _puffO.col1);
    _puffO.alpha = 0.55; _puffO.grav = 0; _puffO.birthOffset = birthOffset;
    particles.emit('fire', _puffO);
    _puffO.pos[1] = groundY(lx, lz) + 0.7;
    _puffO.vel[1] = 0.8 + rng() * 0.5;
    _puffO.life = 1.1 + rng() * 0.6;
    _puffO.size0 = 0.25; _puffO.size1 = 1.0 + rng() * 0.5;
    _puffO.rotVel = (rng() - 0.5) * 2;
    col3(0x45403a, _puffO.col0); col3(0x6e6a61, _puffO.col1);
    _puffO.alpha = 0.4; _puffO.grav = 0.5; _puffO.birthOffset = birthOffset + 0.1;
    particles.emit('smoke', _puffO);
  }

  function emitChunkLanding(
    pos: THREE.Vector3,
    cy: number,
    gy: number,
    dvx: number,
    dvy: number,
    dvz: number,
    birthOffset: number,
    life: number,
    scale: number,
    fullHot: boolean,
  ): void {
    for (let ts = 0.14; ts < life; ts += 0.07) {
      const sd = (1 - Math.exp(-0.12 * ts)) / 0.12;
      const py = cy + dvy * sd - 10.8 * ts * ts;
      if (py > gy + scale * 0.5) continue;
      const lx = pos.x + dvx * sd, lz = pos.z + dvz * sd;
      _puffO.pos[0] = lx; _puffO.pos[1] = groundY(lx, lz) + 0.8; _puffO.pos[2] = lz;
      _puffO.vel[0] = dvx * 0.06 + (rng() - 0.5) * 0.6; _puffO.vel[1] = 0.9 + rng() * 0.7;
      _puffO.vel[2] = dvz * 0.06 + (rng() - 0.5) * 0.6;
      _puffO.life = 0.9 + rng() * 0.5;
      _puffO.size0 = 0.45; _puffO.size1 = 1.5 + rng() * 0.7;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.5;
      col3(0x8a8069, _puffO.col0); col3(0x776f5f, _puffO.col1);
      _puffO.alpha = 0.34; _puffO.grav = -0.5; _puffO.birthOffset = birthOffset + ts;
      particles.emit('dust', _puffO);
      if (fullHot) emitHotChunkLanding(lx, lz, birthOffset + ts);
      break;
    }
  }

  function emitDestructionDebrisShower(
    pos: THREE.Vector3,
    gy: number,
    cy: number,
    rack: boolean,
    burn: boolean,
    birthOffset: number,
    plain = false,
  ): void {
    // (fx 8o) a plain kill throws a few small pieces, not a cook-off's shower
    const count = rack ? 30 : (burn ? 5 : plain ? 6 : 14);
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2;
      const tilt = 0.25 + rng() * 0.85;
      const bo = birthOffset - rng() * 0.15;
      _debO.pos[0] = pos.x; _debO.pos[1] = cy; _debO.pos[2] = pos.z;
      _debO.vel[0] = Math.cos(a) * Math.sin(tilt) * (13 + rng() * 11);
      _debO.vel[1] = 4 + rng() * 6;
      _debO.vel[2] = Math.sin(a) * Math.sin(tilt) * (13 + rng() * 11);
      _debO.life = 1.4 + rng() * 0.7;
      _debO.scale = 0.10 + rng() * 0.15;
      _debO.spin = 8 + rng() * 18;
      _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
      const fullHot = rng() < 0.55;
      _debO.groundY = gy; _debO.hot = fullHot ? 1 : 0.45; _debO.seed = rng(); _debO.birthOffset = bo;
      const dvx = _debO.vel[0], dvy = _debO.vel[1], dvz = _debO.vel[2];
      const life = _debO.life, scale = _debO.scale;
      particles.emit('debris', _debO);
      if (fullHot) emitHotChunkTrail(pos, cy, gy, dvx, dvy, dvz, bo);
      emitChunkLanding(pos, cy, gy, dvx, dvy, dvz, bo, life, scale, fullHot);
    }
  }

  function emitDestructionLargeChunks(
    pos: THREE.Vector3,
    gy: number,
    cy: number,
    rack: boolean,
    burn: boolean,
    birthOffset: number,
    plain = false,
  ): void {
    const count = rack ? 5 : (burn || plain ? 0 : 2);
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2;
      const tilt = 0.25 + rng() * 0.5;
      const vx = Math.cos(a) * Math.sin(tilt) * 14;
      const vy = 12 + rng() * 8;
      const vz = Math.sin(a) * Math.sin(tilt) * 14;
      _debO.pos[0] = pos.x; _debO.pos[1] = cy; _debO.pos[2] = pos.z;
      _debO.vel[0] = vx; _debO.vel[1] = vy; _debO.vel[2] = vz;
      _debO.life = 3; _debO.scale = 0.23 + rng() * 0.10; _debO.spin = 5 + rng() * 8;
      _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
      _debO.groundY = gy; _debO.hot = true; _debO.seed = rng(); _debO.birthOffset = birthOffset;
      particles.emit('debris', _debO);
      for (let ts = 0.08; ts < 1.5; ts += 0.11) {
        const sd = (1 - Math.exp(-0.12 * ts)) / 0.12;
        const px = pos.x + vx * sd;
        const py = cy + vy * sd - 10.8 * ts * ts;
        const pz = pos.z + vz * sd;
        if (py < gy + 0.3) break;
        _puffO.pos[0] = px + (rng() - 0.5) * 0.15; _puffO.pos[1] = py; _puffO.pos[2] = pz + (rng() - 0.5) * 0.15;
        _puffO.vel[0] = (rng() - 0.5) * 0.4; _puffO.vel[1] = 0.5 + rng() * 0.4; _puffO.vel[2] = (rng() - 0.5) * 0.4;
        _puffO.life = 0.9 + rng() * 0.6;
        _puffO.size0 = 0.35; _puffO.size1 = 1.3 + rng() * 0.4;
        _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
        col3(0x2a2826, _puffO.col0); col3(0x555350, _puffO.col1);
        _puffO.alpha = 0.55; _puffO.grav = 0.6; _puffO.birthOffset = birthOffset + ts;
        particles.emit('smoke', _puffO);
      }
    }
  }

  function emitDestructionHatchSlab(
    pos: THREE.Vector3,
    gy: number,
    cy: number,
    birthOffset: number,
  ): void {
    _debO.pos[0] = pos.x; _debO.pos[1] = cy + 0.6; _debO.pos[2] = pos.z;
    _debO.vel[0] = (rng() - 0.5) * 6; _debO.vel[1] = 9 + rng() * 4; _debO.vel[2] = (rng() - 0.5) * 6;
    _debO.life = 2.6; _debO.scale = 0.45 + rng() * 0.2; _debO.spin = 5 + rng() * 6;
    _debO.axis[0] = rng() - 0.5; _debO.axis[1] = 0.2; _debO.axis[2] = rng() - 0.5;
    _debO.groundY = gy; _debO.hot = true; _debO.seed = rng(); _debO.birthOffset = birthOffset;
    particles.emit('debris', _debO);
  }

  function scheduleDestructionSettlingDust(
    posX: number,
    posZ: number,
    gy: number,
    birthOffset: number,
  ): void {
    deferFxBatch(birthOffset, 0.06, () => {
      for (let i = 0; i < 12; i++) {
        const a = rng() * Math.PI * 2;
        const d = 1.5 + rng() * 3.5;
        _puffO.pos[0] = posX + Math.cos(a) * d;
        _puffO.pos[1] = gy + 1.0;
        _puffO.pos[2] = posZ + Math.sin(a) * d;
        _puffO.vel[0] = Math.cos(a) * (0.5 + rng() * 0.6);
        _puffO.vel[1] = 0.25 + rng() * 0.3;
        _puffO.vel[2] = Math.sin(a) * (0.5 + rng() * 0.6);
        _puffO.life = 3.5 + rng() * 2.5;
        _puffO.size0 = 1.5; _puffO.size1 = 5.2 + rng() * 1.8;
        _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 0.6;
        col3(0x867e6e, _puffO.col0); col3(0x746e60, _puffO.col1);
        _puffO.alpha = 0.15 + rng() * 0.06; _puffO.grav = -0.2;
        _puffO.birthOffset = birthOffset + 1.2 + rng() * 1.2;
        particles.emit('dust', _puffO);
      }
    });
  }

  function emitDestructionSmokeStalk(
    pos: THREE.Vector3,
    cy: number,
    burn: boolean,
    dk: number,
    birthOffset: number,
  ): void {
    const count = burn ? 6 : 14;
    for (let i = 0; i < count; i++) {
      const h = (i / 12) * 12 + rng() * 2;
      _puffO.pos[0] = pos.x + COLUMN_WIND_X * h * 0.30 + (rng() - 0.5) * (1.3 + h * 0.18);
      _puffO.pos[1] = cy + 1.5 + h;
      _puffO.pos[2] = pos.z + COLUMN_WIND_Z * h * 0.30 + (rng() - 0.5) * (1.3 + h * 0.18);
      _puffO.vel[0] = COLUMN_WIND_X * (0.3 + h * 0.09) + (rng() - 0.5) * 0.9;
      _puffO.vel[1] = 3.0 + rng() * 2.0;
      _puffO.vel[2] = COLUMN_WIND_Z * (0.3 + h * 0.09) + (rng() - 0.5) * 0.9;
      _puffO.life = 3.0 + rng() * 1.8;
      _puffO.size0 = (2.0 + rng() * 1.0 + h * 0.10) * dk;
      _puffO.size1 = (6.0 + rng() * 2.5 + h * 0.22) * dk;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.0;
      if (i % 3 === 2) { col3(0x423e38, _puffO.col0); col3(0x736f68, _puffO.col1); }
      else { col3(0x332e29, _puffO.col0); col3(0x5f5a52, _puffO.col1); }
      _puffO.alpha = 0.55 + rng() * 0.15; _puffO.grav = 1.0;
      _puffO.birthOffset = birthOffset - 1.1 + (h / 14) * 0.8;
      particles.emit('smoke', _puffO);
    }
  }

  function emitDestructionSmokeBridge(
    pos: THREE.Vector3,
    cy: number,
    burn: boolean,
    dk: number,
    birthOffset: number,
  ): void {
    const count = burn ? 5 : 10;
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2;
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 1.4;
      _puffO.pos[1] = cy + 0.6 + rng() * 1.6;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 1.4;
      _puffO.vel[0] = Math.cos(a) * (0.5 + rng() * 0.7) + COLUMN_WIND_X * 0.5;
      _puffO.vel[1] = 2.6 + rng() * 2.0;
      _puffO.vel[2] = Math.sin(a) * (0.5 + rng() * 0.7) + COLUMN_WIND_Z * 0.5;
      _puffO.life = 4.0 + rng() * 2.5;
      _puffO.size0 = (1.8 + rng() * 0.8) * dk; _puffO.size1 = (5.4 + rng() * 2.2) * dk;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.4;
      if (i % 3 === 2) { col3(0x3d3934, _puffO.col0); col3(0x6e6a63, _puffO.col1); }
      else { col3(0x363029, _puffO.col0); col3(0x615b52, _puffO.col1); }
      _puffO.alpha = 0.6 + rng() * 0.14; _puffO.grav = 1.0;
      _puffO.birthOffset = birthOffset - 0.35 + (i / 9) * 2.85 + rng() * 0.25;
      particles.emit('smoke', _puffO);
    }
  }

  function emitDestructionEruptionSkirt(
    pos: THREE.Vector3,
    cy: number,
    burn: boolean,
    dk: number,
    birthOffset: number,
  ): void {
    const count = burn ? 4 : 8;
    for (let i = 0; i < count; i++) {
      const a = (i / 8) * Math.PI * 2 + rng() * 0.7;
      const r = 1.3 + rng() * 1.3;
      _puffO.pos[0] = pos.x + Math.cos(a) * r;
      _puffO.pos[1] = cy + 0.4 + rng() * 1.2;
      _puffO.pos[2] = pos.z + Math.sin(a) * r;
      _puffO.vel[0] = Math.cos(a) * (0.9 + rng() * 0.8) + COLUMN_WIND_X * 0.4;
      _puffO.vel[1] = 2.0 + rng() * 1.6;
      _puffO.vel[2] = Math.sin(a) * (0.9 + rng() * 0.8) + COLUMN_WIND_Z * 0.4;
      _puffO.life = 3.5 + rng() * 1.5;
      _puffO.size0 = (2.0 + rng() * 0.8) * dk; _puffO.size1 = (5.0 + rng() * 1.8) * dk;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.8;
      if (i % 3 === 2) { col3(0x403c36, _puffO.col0); col3(0x716d66, _puffO.col1); }
      else { col3(0x332e27, _puffO.col0); col3(0x5c584f, _puffO.col1); }
      _puffO.alpha = 0.68 + rng() * 0.12; _puffO.grav = 1.1;
      _puffO.birthOffset = birthOffset + 0.05 + rng() * 0.3;
      particles.emit('smoke', _puffO);
    }
  }

  function finalizeDestroyedVisual(
    visual: FxVisual | null,
    rack: boolean,
    birthOffset: number,
  ): void {
    if (!visual) return;
    impactDecals.clearVehicle(visual);
    const delay = 0.15 + birthOffset;
    if (delay <= 0) visual.setDestroyed({ pop: rack, ageS: -delay });
    else timers.push({ t: delay, fn: () => visual.setDestroyed({ pop: rack }) });
  }

  /**
   * Full vehicle destruction sequence, optionally backdated (composer).
   * `cause` varies the spectacle so kills stop reading as one canned clip:
   *  - 'ammorack': the full turret-toss detonation (geyser, hatch jets, max
   *    debris) — the rare spectacular;
   *  - 'shot': plain HP kill — solid fireball but no rack geyser, fewer
   *    debris, turret stays seated (gun droop + hatch smoke);
   *  - 'fire': burn-out — flashover whoosh + heavy smoke, almost no debris.
   */
  function spawnDestruction(
    pos: THREE.Vector3,
    visual: FxVisual | null,
    birthOffset = 0,
    cause: DestructionCause = 'ammorack',
    wreckOf: string | null = null,
    shellBurst = false,
  ): void {
    const rack = cause === 'ammorack';
    const burn = cause === 'fire';
    // (fx 8o, wave 356's critics: a plain kill's blast "far too big for a kill without an ammunition explosion") a plain
    // kill on the media tier: a short flash venting from the hull, no blast wave, a few small pieces; the Studio's shell
    // burst on open ground (cause 'shot', shellBurst) keeps its blast
    const plain = cause === 'shot' && !shellBurst && !!blast;
    const gy = groundY(pos.x, pos.z);
    const cy = Math.max(pos.y, gy) + 1.2;
    // distance-compensated spectacle (r7: a 244 m kill read as a ~40 px
    // orange puff) — scale the big volumetric cards up with camera distance
    const dk = distBoost(pos.x, cy, pos.z);
    emitDestructionFlash(pos, cy, burn, dk, birthOffset, plain);
    if (blast) {
      // destruction-fx lane: the fireball body, the eruption and the column's first seconds are simulated media; the
      // additive fire, the hull fire, the debris and the light stay the battle's
      emitDestructionFirePockets(pos, cy, rack, burn, burn ? 0.7 : plain ? 0.55 : 1, dk, birthOffset, plain);
      killFireball(blast, pos.x, cy, pos.z, rack ? 'ammorack' : burn ? 'fire' : plain ? 'shot' : 'burst', birthOffset);
      emitDestructionHullFire(pos, gy, cy, rack, burn, birthOffset, plain);
      // a hull's blast goes up more than out: a modest skirt (round 2's ring hid the hull for seconds); (fx 8o, wave 356:
      // "a flat, lingering dust sheet at 3-4 s") a kill's dust rolls up into billows and thins (killDust); the shell
      // burst's stays the ground burst's skirt
      const surface = classifyTerrain(heightField, pos.x, pos.z);
      if (shellBurst) dustSurge(blast, pos.x, gy, pos.z, 0.65 * Math.cbrt(cookOffChargeKg(55)), surface, birthOffset);
      else killDust(blast, pos.x, gy, pos.z, rack ? 0.65 * Math.cbrt(cookOffChargeKg(55)) : burn ? 0.6 : 0.8, surface, birthOffset);
      spawnScorch(pos.x, pos.z, (burn ? 3.6 : plain ? 3.4 : 5.4) + rng() * 1.4);
      if (rack || shellBurst) spawnShockRing(pos.x, pos.z, Math.max(0, -birthOffset));
      sparkFan(_sv.set(pos.x, cy, pos.z), _UP, rack ? 16 : (burn ? 5 : plain ? 6 : 10), 18, 0.85, 0xffc470, 0.55, 0.05, 0.034, birthOffset, 0.35);
      emitDestructionDebrisShower(pos, gy, cy, rack, burn, birthOffset, plain);
      emitDestructionLargeChunks(pos, gy, cy, rack, burn, birthOffset, plain);
      if (rack) emitDestructionHatchSlab(pos, gy, cy, birthOffset);
      // (wave 266: a flat orange disc flooded the ground round the hull, five times the sun under the light) the fireball
      // is what glows; the light it throws on the ground is a warm pool that dies with it
      // (fx 8, the killcam critics after 7d/7e: "a flat salmon wash over the tank at 0.6-1.8 s") the pool dies with the
      // fireball's own heat — under a second, a warm yellow-orange — instead of the kill light's 1.9 s orange decay; the
      // hull fire's own flicker carries the light after it
      // (fx 9: 8t, wave 405: "the flat orange ground ellipse at 0.0 s") a plain kill's pool small, brief, paler and low
      // over the deck (the falloff reads round the hull, never a flat disc on the ground); a cook-off keeps its own,
      // shortened and nearer
      if (plain) {
        flashLight(lightStates[1], _sv.set(pos.x, cy + PLAIN_KILL_LIGHT.overDeckM, pos.z),
          EXPLOSION_LIGHT_PEAK * PLAIN_KILL_LIGHT.peakK, Math.max(0, -birthOffset), PLAIN_KILL_LIGHT.durS, 2.2,
          PLAIN_KILL_LIGHT.hex, PLAIN_KILL_LIGHT.rangeM);
      } else {
        flashLight(lightStates[1], _sv.set(pos.x, cy + 4.0, pos.z),
          EXPLOSION_LIGHT_PEAK * (burn ? 0.15 : rack ? COOKOFF_LIGHT.peakK : 0.22), Math.max(0, -birthOffset),
          burn ? 0.9 : rack ? COOKOFF_LIGHT.durS : 0.7, 2.2, KILL_POOL_LIGHT_HEX, rack ? COOKOFF_LIGHT.rangeM : 20);
      }
      // the column takes hold out of the fireball's soot over the first seconds (round 2 backdated it, so a column stood
      // over the hull in the kill's first frame; wave 266: six bodies on a fixed beat rose as a chain of beads)
      const colScale = (burn ? 1.45 : 1.3) * dk;
      for (let i = 0; i < 3; i++) {
        mediaColumnPuff(blast, pos.x, Math.max(pos.y, gy), pos.z, 1, colScale, birthOffset + 0.7 + i * 0.45 + rng() * 0.3);
      }
      // (integration, 2026-10-09) media's shell burst (the Studio's stand-in blast on open ground) keeps its shorter,
      // smoke-only column on this tier too: no flame licks over bare ground and no smolder (shellBurstColumn.selftest)
      columns.push({ key: wreckOf ? `wreck:${wreckOf}` : null, wreckOf, pos: [pos.x, Math.max(pos.y, gy), pos.z], acc: 0,
        ttl: shellBurst ? SHELL_BURST_COLUMN_S : SMOKE_COLUMN_S, scale: burn ? 1.45 : 1.3, flame: !shellBurst,
        deck: deckOf(visual) });
      capColumns();
      finalizeDestroyedVisual(visual, rack, birthOffset);
      return;
    }
    const fireS = emitDestructionFireball(pos, cy, rack, burn, dk, birthOffset);
    // r2 SPAWN-FRAME BUDGET: batches whose particles are born in the FUTURE
    // (positive birthOffset) don't need to be written on the blast frame —
    // live kills stagger them over the next few frames via the timer queue
    // (the single-frame emit burst was part of the 55->26 fps kill hitch).
    // Composed/backdated captures still spawn synchronously.
    scheduleDestructionSmokeTakeover(pos.x, pos.z, cy, fireS, dk, birthOffset);
    emitDestructionInteriorSmoke(pos, cy, birthOffset);
    emitDestructionHullFire(pos, gy, cy, rack, burn, birthOffset);
    // rolling black smoke cap + buoyant column starters. Backdated 0.25 s so
    // the fade-in is already complete when the composer freezes at 0.6 s (and
    // live, thick smoke erupts with the fireball instead of trailing it).
    // r7 (critic: "the fire column caps in discrete soot-chip stipple instead
    // of rolling smoke"): the cap cards spawn BIGGER (size0 up ~60%) in a
    // tighter footprint so neighbours overlap from birth into one rolling
    // mass, and they inherit the column's upward velocity.
    emitDestructionSmokeCap(pos, cy, dk, birthOffset);
    // shockwave dust ring on the ground — fast, clearly expanding, but
    // ORGANIC: jittered radius/angle/size and ~30% of slots dropped so the
    // ring never resolves into evenly spaced puffs on a perfect circle (r5)
    // r2 ANTI-STATIC: the ring rode at gy+0.45 — waist-deep INSIDE the grass
    // blade band, so every card interleaved with alpha-tested blades into
    // per-pixel TV static across ~40% of the frame for the 2 s dust window
    // (THE r2 critical). The wave now skims the grass TOPS (gy+1.1), runs
    // bigger and dimmer cards (same total mass, no per-blade contrast), and
    // its silhouette reads against terrain instead of through the meadow.
    emitDestructionShockAndSparks(pos, gy, cy, rack, burn, birthOffset);
    emitDestructionDebrisShower(pos, gy, cy, rack, burn, birthOffset);
    emitDestructionLargeChunks(pos, gy, cy, rack, burn, birthOffset);
    if (rack) emitDestructionHatchSlab(pos, gy, cy, birthOffset);
    // settling dust: a delayed low blanket that drifts in AFTER the fireball
    // dies (positive birthOffset relative to the blast = future birth).
    // r2 anti-static: lifted from gy+0.35 (grass-root level — per-blade
    // interleave static) to just over the blade tops, dimmer + larger.
    // Deferred off the blast frame live (kill-hitch budget).
    scheduleDestructionSettlingDust(pos.x, pos.z, gy, birthOffset);
    // explosion light + persistent smoke column + burnt hull swap. Light sits
    // 2.4 m above the hull: warm falloff over wreck/terrain without nuking
    // the hull albedo to flat orange.
    flashLight(lightStates[1], _sv.set(pos.x, cy + 3.6, pos.z),
      EXPLOSION_LIGHT_PEAK * (burn ? 0.5 : 1), Math.max(0, -birthOffset));
    // INSTANT dark smoke stalk (r7 distant-kill readability): a column of
    // dense near-black puffs already standing 4-14 m over the wreck at the
    // moment of the blast, so a 200-400 m kill shows a rising black marker
    // instead of waiting ~8 s for the slow column puffs to climb.
    emitDestructionSmokeStalk(pos, cy, burn, dk, birthOffset);
    // fire-to-smoke bridge: dense deck-level puffs whose births SPAN the
    // window from the blast itself through the fireball's death (-0.35 s to
    // +2.5 s), so (a) the composed hero frame catches fresh dark smoke low
    // around the fire and (b) the column never detaches from the burning
    // hull during the live handoff (r1: "2.5-4 s lull").
    emitDestructionSmokeBridge(pos, cy, burn, dk, birthOffset);
    // instant eruption skirt: heavy black smoke bursting out WITH the
    // fireball, hugging its flanks low over the hull — this is the dark mass
    // the hero frame (and the first live second) reads as "smoke column
    // being born", before the stalk/column take over.
    emitDestructionEruptionSkirt(pos, cy, burn, dk, birthOffset);
    // wreck r1: a live kill names its wreck so the column rides the corpse (see syncColumnAnchors);
    // composed replays and warm-ups pass no id and keep the world-fixed column.
    // a shell burst leaves a shorter smoke-only column: no wreck burns there
    columns.push({ key: wreckOf ? `wreck:${wreckOf}` : null, wreckOf, pos: [pos.x, Math.max(pos.y, gy), pos.z], acc: 0,
      ttl: shellBurst ? SHELL_BURST_COLUMN_S : SMOKE_COLUMN_S, scale: burn ? 1.45 : 1.3, flame: !shellBurst,
        deck: deckOf(visual) });
    capColumns();
    finalizeDestroyedVisual(visual, rack, birthOffset);
  }

  /** (240) a wreck's deck over its foot (m) from its hull's height, or undefined when the kill names no visual */
  function deckOf(visual: FxVisual | null): number | undefined {
    const h = visual?.dims?.heightM;
    return typeof h === 'number' && h > 0 ? DECK_OF_HEIGHT * h : undefined;
  }

  /** Camera-distance size compensation so kills stay legible at 200-400 m. */
  function distBoost(x: number, y: number, z: number): number {
    const cam = engineCtx && engineCtx.camera;
    if (!cam) return 1;
    _camV.set(x, y, z);
    const d = cam.position.distanceTo(_camV);
    // 1 inside 90 m, up to ~1.9 at 300 m (applied to SIZE; alpha untouched)
    return Math.pow(THREE.MathUtils.clamp(d / 90, 1, 2.4), 0.75);
  }

  /**
   * A burning car's flames for one column tick (the car-wreck lane, 233; r3's critics: "round flame sprites", "soft round
   * blobs over the cab"): tongues (the fire pool's upright tapered cards, a negative end size) rising out of its windows
   * and over its roof along its cabin, a few low and broad in the body, the rest tall and narrow, swaying; as many and as
   * big as its fire is alive (`fk`, flameOf).
   */
  function emitCarFlames(col: SmokeColumn, fk: number, dk: number, birthOffset: number): void {
    const car = col.car;
    if (!car || !(fk > 0)) return;
    const lx = car[0], lz = car[1], heightM = Math.max(1, car[2]);
    const half = Math.hypot(lx, lz) || 1, ux = lx / half, uz = lz / half;
    // its base (the column sits 0.25 m under it) and the size of its fire (a truck's cab burns bigger than a small car)
    const baseY = col.pos[1] + 0.25, big = Math.min(1.5, Math.max(0.8, heightM / 1.5));
    const n = rng() < 0.55 * fk ? 2 : rng() < 0.9 * fk ? 1 : 0;
    for (let k = 0; k < n; k++) {
      // along the cabin (its middle and a little toward the nose), across its width
      const along = (rng() - 0.45) * half * 0.5, across = (rng() - 0.5) * 0.8 * big;
      const low = rng() < 0.3;
      // its foot in the body (the cabin's windows and the roof line; r2's blind critic: "stiff spikes ... floating detached
      // above the car", the tongues rose a metre and more over their lives): it stays at its foot, flickering up a little
      _puffO.pos[0] = col.pos[0] + ux * along - uz * across;
      _puffO.pos[1] = baseY + heightM * (low ? 0.3 + rng() * 0.15 : 0.45 + rng() * 0.3);
      _puffO.pos[2] = col.pos[2] + uz * along + ux * across;
      _puffO.vel[0] = COLUMN_WIND_X * 0.2 + (rng() - 0.5) * 0.15;
      _puffO.vel[1] = 0.25 + rng() * 0.45;
      _puffO.vel[2] = COLUMN_WIND_Z * 0.2 + (rng() - 0.5) * 0.15;
      _puffO.life = 0.45 + rng() * 0.35;
      const w = (low ? 0.6 + rng() * 0.25 : 0.42 + rng() * 0.24) * big * dk * (0.5 + 0.5 * fk);
      _puffO.size0 = w;
      // (negative: a tongue, narrowing to 60 % of its width as it dies)
      _puffO.size1 = -w * 0.6;
      // its height over its width, and its tip's sway (rad/s)
      _puffO.rot = low ? 1.2 + rng() * 0.3 : 1.6 + rng() * 0.8;
      _puffO.rotVel = 7 + rng() * 6;
      // (r1 in the game: white-hot spikes) orange-yellow at its root, deep orange as it dies; a thinner card, so its
      // stacked core burns yellow, not white
      col3(0xffa848, _puffO.col0); col3(0xe8480c, _puffO.col1);
      _puffO.alpha = 0.62; _puffO.grav = 0.5; _puffO.birthOffset = birthOffset - rng() * COLUMN_TICK_S;
      particles.emit('fire', _puffO);
    }
  }

  /** One tick of a persistent smoke column emitter (stage-decayed). */
  function emitColumnPuff(col: SmokeColumn, birthOffset = 0): void {
    // Stage decay: a fresh kill pumps thick black smoke; over the column's
    // life it thins toward pale grey wisps instead of cutting off.
    const stage = Math.min(1, Math.max(0, col.ttl / SMOKE_COLUMN_S));
    const dk = distBoost(col.pos[0], col.pos[1], col.pos[2]);
    if (blast) {
      // destruction-fx lane: one big rolling smoke body about every 0.3 s (each tick draws its share), and the
      // additive flame licks on the deck
      // a far column (the distance boost past ~90 m) feeds fewer, bigger bodies: the same silhouette for a fraction of
      // the overdraw and the sort (six burning hulls would otherwise hold ~560 live puffs)
      const lod = dk > 1.4 ? 0.5 : dk > 1.15 ? 0.72 : 1;
      if (rng() < (COLUMN_TICK_S / 0.16) * lod) {
        mediaColumnPuff(blast, col.pos[0], col.pos[1], col.pos[2], stage, col.scale * dk / Math.sqrt(lod), birthOffset);
      }
      // (233) its flames die down with its fire (flameOf); a car's are tongues along its cabin
      const fk = flameOf(col);
      if (col.car) emitCarFlames(col, fk, dk, birthOffset);
      // (233) by day a tank wreck's lick is a tongue (emitColumnTongue); at night main's round lick
      else if (rng() < (0.70 + 0.30 * stage) * fk && !nightFire()) emitColumnTongue(col, fk, dk, birthOffset);
      else if (nightFire() && rng() < (0.70 + 0.30 * stage) * fk) {
        _puffO.pos[0] = col.pos[0] + (rng() - 0.5) * 1.2;
        _puffO.pos[1] = col.pos[1] + 0.95 + rng() * 0.55;
        _puffO.pos[2] = col.pos[2] + (rng() - 0.5) * 1.2;
        _puffO.vel[0] = (rng() - 0.5) * 0.6; _puffO.vel[1] = 1.0 + rng() * 0.9; _puffO.vel[2] = (rng() - 0.5) * 0.6;
        _puffO.life = 0.30 + rng() * 0.28;
        _puffO.size0 = (1.15 + rng() * 0.4) * col.scale * dk * (0.55 + 0.45 * fk);
        _puffO.size1 = (0.75 + rng() * 0.3) * col.scale * dk * (0.55 + 0.45 * fk);
        _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 3;
        col3(0xffcf70, _puffO.col0); col3(0xff5a10, _puffO.col1);
        _puffO.alpha = 0.95; _puffO.grav = 1.4; _puffO.birthOffset = birthOffset - rng() * 0.15;
        particles.emit('fire', _puffO);
      }
      return;
    }
    const s = col.scale * (0.62 + 0.38 * stage) * dk;
    // r2 COLUMN CONTINUITY: the emitter only fed the bottom ~4 m while the
    // one-shot stalk/cap cards parked a huge long-lived blob at the top —
    // frame-to-frame the plume read as flame, a GAP, then a static ink mass
    // pinned at the frame top (r2 major). The feed now spans the column's
    // WHOLE current height (grown ~2 m/s from the wreck, capped at 15 m):
    // every band of the plume is continuously replaced by fresh advecting
    // puffs, so the column visibly rises, bends and dissolves over time.
    const ageS = SMOKE_COLUMN_S - Math.max(0, col.ttl);
    const H = Math.min(3.5 + ageS * 2.0, 15);
    // r5 CONTINUITY REBUILD (motion critique: "stack of giant soft blobs that
    // detaches from the wreck leaving a visible gap; walked up close it is
    // one featureless screen-filling mass"):
    //  - 20 Hz cadence of HALF-SIZE puffs (see COLUMN_TICK_S) — a continuous
    //    turbulent volume, never 3-4 discrete spheres;
    //  - LOW puffs live SHORT: the shader's alpha-in spans 12% of life, so
    //    the old 7.5-11 s base puffs took ~1 s to fade in and had already
    //    risen 2-4 m — that invisible zone WAS the base gap. A 3.5-5 s base
    //    puff is at full density ~0.5 s after birth, still on the deck;
    //  - wind shear: lateral velocity grows with emission height so the
    //    column bends downwind and stays connected instead of shearing;
    //  - per-puff alpha/size/rotation variance + a lower alpha ceiling so a
    //    near-camera column keeps silhouette detail instead of stacking to
    //    an opacity-clipped mass.
    // r4: a fresh column pumps 4 puffs/tick (the composed explosion promised
    // a thicker column than the 3-puff feed delivered); thins to 3 past ~15%
    const perTick = stage > 0.85 ? 4 : 3;
    for (let k = 0; k < perTick; k++) {
      // height sampled over the FULL living column, biased toward the base
      // (dense stalk) with the crown still refreshed every few ticks
      const hN = Math.pow(rng(), 1.35);              // 0..1, base-biased
      const h = hN * H;
      // the column leans downwind as it climbs — emission follows the lean
      // so fresh puffs are born INSIDE the bent plume, not beside it
      const leanX = COLUMN_WIND_X * h * 0.28, leanZ = COLUMN_WIND_Z * h * 0.28;
      _puffO.pos[0] = col.pos[0] + leanX + (rng() - 0.5) * (0.7 + h * 0.16) * s;
      _puffO.pos[1] = col.pos[1] + 0.9 + h + rng() * 0.8;
      _puffO.pos[2] = col.pos[2] + leanZ + (rng() - 0.5) * (0.7 + h * 0.16) * s;
      const shear = 0.35 + h * 0.20 + rng() * 0.4;  // more drift higher up
      _puffO.vel[0] = COLUMN_WIND_X * shear + (rng() - 0.5) * 0.9;
      // real buoyancy: every band keeps rising so the crown continuously
      // clears upward and dissolves instead of hanging as one parked mass
      _puffO.vel[1] = (2.4 + 1.2 * stage) + rng() * 1.6;
      _puffO.vel[2] = COLUMN_WIND_Z * shear + (rng() - 0.5) * 0.9;
      // short-ish lives everywhere: the plume is a FLOW, each band lives on
      // fresh puffs (the old 5.7-11 s crown cards were the static ink blob)
      _puffO.life = 2.8 + rng() * 1.4 + hN * 1.2;
      _puffO.size0 = (1.0 + rng() * 0.6 + h * 0.09) * s;
      _puffO.size1 = (3.6 + rng() * 2.0 + h * 0.30) * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.9;
      // r2 albedo floor: capped well above black (0x3a→) and the crown runs
      // a shade lighter than the base — sunlit smoke, never an ink cutout
      const grey = rng() * 0.5 + hN * 0.5;
      if (grey < 0.45) { col3(0x3a3531, _puffO.col0); col3(0x6e6a63, _puffO.col1); }
      else if (grey < 0.8) { col3(0x4a4641, _puffO.col0); col3(0x807c74, _puffO.col1); }
      else { col3(0x5a564f, _puffO.col0); col3(0x94908a, _puffO.col1); }
      _puffO.alpha = (0.20 + rng() * 0.12) + 0.20 * stage;
      _puffO.grav = 0.45;
      _puffO.birthOffset = birthOffset - rng() * COLUMN_TICK_S; // intra-tick stagger
      particles.emit('smoke', _puffO);
    }
    // r7 persistent BLACK core (critic: "the long-tail wreck has no
    // persistent black smoke column"): one extra near-black puff per tick
    // hugging the column base — the sooty heart the grey shell wraps around,
    // present for the whole 5-30 s burning-wreck window.
    {
      const h = rng() * 3.5;
      _puffO.pos[0] = col.pos[0] + COLUMN_WIND_X * h * 0.28 + (rng() - 0.5) * 0.6 * s;
      _puffO.pos[1] = col.pos[1] + 1.1 + h;
      _puffO.pos[2] = col.pos[2] + COLUMN_WIND_Z * h * 0.28 + (rng() - 0.5) * 0.6 * s;
      _puffO.vel[0] = COLUMN_WIND_X * (0.4 + h * 0.18) + (rng() - 0.5) * 0.5;
      _puffO.vel[1] = 2.2 + rng() * 1.4;
      _puffO.vel[2] = COLUMN_WIND_Z * (0.4 + h * 0.18) + (rng() - 0.5) * 0.5;
      _puffO.life = 2.6 + rng() * 1.4;
      _puffO.size0 = (1.4 + rng() * 0.7 + h * 0.12) * s;
      _puffO.size1 = (3.4 + rng() * 1.6 + h * 0.25) * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.6;
      col3(0x2c2824, _puffO.col0); col3(0x4e4a44, _puffO.col1);
      _puffO.alpha = 0.30 + 0.22 * stage;
      _puffO.grav = 0.5;
      _puffO.birthOffset = birthOffset - rng() * COLUMN_TICK_S;
      particles.emit('smoke', _puffO);
    }
    // flame licks ANCHORED to the deck (r7 critic: "by 20 s the sustained
    // fire has detached into two cotton-ball flame blobs hovering above the
    // hull"): licks are born ON the deck line, rise slowly, live SHORT and
    // SHRINK with age — fire that licks up off the wreck and dies before it
    // can drift free. Higher rate so the base always carries flame.
    // (233) the licks die down with the fire (flameOf); a car's are tongues along its cabin
    const fk = flameOf(col);
    if (col.car) emitCarFlames(col, fk, dk, birthOffset);
    else if (rng() < (0.70 + 0.30 * stage) * fk) {
      const licks = rng() < 0.35 ? 2 : 1;
      for (let li = 0; li < licks; li++) {
        // (233) by day a tongue (emitColumnTongue); (240) at night a flame-cut tongue on the deck (emitNightTongue)
        if (!nightFire()) emitColumnTongue(col, fk, dk, birthOffset);
        else emitNightTongue(col, fk, dk, birthOffset);
      }
      // (240) at night a third, smaller tongue as often as not: a night fire is many short licks, not one or two
      if (nightFire() && rng() < 0.5) emitNightTongue(col, fk * 0.7, dk, birthOffset);
    }
  }

  /** (233) by day a tank wreck's licks are tongues; (240) at night (NIGHT_FIRE_DARK) flame-cut tongues (emitNightTongue) */
  function nightFire(): boolean {
    return tracers.darkLevel() >= NIGHT_FIRE_DARK;
  }

  /**
   * By day, one flame lick on a burning tank wreck's deck as a tongue (233, the FX follow-up: "fire is round sprite
   * blobs"), in the one tongue card a burning car's flames use (emitCarFlames: a negative end size, the card's height over
   * its width in `rot`, its tip's sway in `rotVel`): spread over the deck, rising from it, as many and as big as its fire is
   * alive (`fk`, flameOf). At night emitNightTongue's (the integrator's critic on these tongues at night: "two
   * pill-shaped sprite blobs").
   */
  function emitColumnTongue(col: SmokeColumn, fk: number, dk: number, birthOffset: number): void {
    _puffO.pos[0] = col.pos[0] + (rng() - 0.5) * 1.7 * col.scale;
    _puffO.pos[1] = col.pos[1] + 0.95 + rng() * 0.4;
    _puffO.pos[2] = col.pos[2] + (rng() - 0.5) * 1.7 * col.scale;
    _puffO.vel[0] = COLUMN_WIND_X * 0.2 + (rng() - 0.5) * 0.3;
    _puffO.vel[1] = 0.4 + rng() * 0.6;
    _puffO.vel[2] = COLUMN_WIND_Z * 0.2 + (rng() - 0.5) * 0.3;
    _puffO.life = 0.4 + rng() * 0.3;
    const w = (0.7 + rng() * 0.35) * col.scale * dk * (0.55 + 0.45 * fk);
    _puffO.size0 = w;
    _puffO.size1 = -w * 0.6;
    _puffO.rot = 1.5 + rng() * 0.7;
    _puffO.rotVel = 6 + rng() * 5;
    col3(0xffb35a, _puffO.col0); col3(0xee500e, _puffO.col1);
    _puffO.alpha = 0.8; _puffO.grav = 0.8; _puffO.birthOffset = birthOffset - rng() * 0.15;
    particles.emit('fire', _puffO);
  }

  /**
   * (240, the night fire's "two pill-shaped sprite blobs" and "flames read as blobs") at night a tank wreck's flame lick
   * is a tongue cut to a flame's outline (a negative tip sway: particles.ts vFlame) rooted ON its deck (`deck`, the
   * hull's height at the kill): main's round licks were born 1-1.5 m over the hull's foot, inside most hulls, and showed
   * as a faint glow through the turret or a pale disc over it. Narrower and more of them than the day's tongues, and a
   * thinner card, so their stack burns orange-yellow against the night sky instead of clipping to a white pill.
   */
  function emitNightTongue(col: SmokeColumn, fk: number, dk: number, birthOffset: number): void {
    const deck = col.deck ?? NIGHT_TONGUE_DECK_M;
    _puffO.pos[0] = col.pos[0] + (rng() - 0.5) * 1.5 * col.scale;
    _puffO.pos[1] = col.pos[1] + deck * (0.84 + rng() * 0.18);
    _puffO.pos[2] = col.pos[2] + (rng() - 0.5) * 1.5 * col.scale;
    _puffO.vel[0] = COLUMN_WIND_X * 0.25 + (rng() - 0.5) * 0.3;
    _puffO.vel[1] = 0.35 + rng() * 0.5;
    _puffO.vel[2] = COLUMN_WIND_Z * 0.25 + (rng() - 0.5) * 0.3;
    _puffO.life = 0.35 + rng() * 0.3;
    const w = (0.42 + rng() * 0.3) * col.scale * dk * (0.55 + 0.45 * fk);
    _puffO.size0 = w;
    _puffO.size1 = -w * 0.7;
    // its height over its width, and its tip's sway (negative: the flame's outline)
    _puffO.rot = 1.9 + rng() * 0.9;
    _puffO.rotVel = -(6 + rng() * 6);
    col3(0xffb04a, _puffO.col0); col3(0xd8400a, _puffO.col1);
    _puffO.alpha = 0.62; _puffO.grav = 0.6; _puffO.birthOffset = birthOffset - rng() * 0.15;
    particles.emit('fire', _puffO);
  }

  /**
   * Smolder-stage tick (after the main column burns out): thin grey wisps +
   * the odd ember fleck, so the wreck keeps marking the battlefield instead
   * of going cold the moment the column emitter dies (r7 aftermath critique).
   */
  function emitSmolderPuff(col: SmokeColumn, birthOffset = 0): void {
    const k = Math.max(0, (col.smolder ?? 0) / SMOKE_SMOLDER_S); // 1 -> 0 over the tail
    const dk = distBoost(col.pos[0], col.pos[1], col.pos[2]);
    if (blast) { if (rng() < 0.6) mediaSmolderPuff(blast, col.pos[0], col.pos[1], col.pos[2], k, birthOffset); return; }
    _puffO.pos[0] = col.pos[0] + (rng() - 0.5) * 1.4;
    _puffO.pos[1] = col.pos[1] + 1.2 + rng() * 1.0; // r5: above the deck line
    _puffO.pos[2] = col.pos[2] + (rng() - 0.5) * 1.4;
    _puffO.vel[0] = (rng() - 0.5) * 0.8 + COLUMN_WIND_X * 0.55;
    _puffO.vel[1] = 1.2 + rng() * 1.2;
    _puffO.vel[2] = (rng() - 0.5) * 0.8 + COLUMN_WIND_Z * 0.55;
    _puffO.life = 5 + rng() * 3;
    _puffO.size0 = (0.9 + rng() * 0.5) * dk; _puffO.size1 = (4.0 + rng() * 2.0) * dk;
    _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 0.6;
    col3(0x4a4642, _puffO.col0); col3(0x7e7a73, _puffO.col1);
    _puffO.alpha = 0.14 + 0.20 * k; _puffO.grav = 0.3; _puffO.birthOffset = birthOffset;
    particles.emit('smoke', _puffO);
    // occasional ember fleck popping off the hot hull
    if (rng() < 0.25 + 0.3 * k) {
      _strkO.pos[0] = col.pos[0] + (rng() - 0.5) * 1.2;
      _strkO.pos[1] = col.pos[1] + 1.4; // r5: pop off the deck, not inside it
      _strkO.pos[2] = col.pos[2] + (rng() - 0.5) * 1.2;
      _strkO.vel[0] = (rng() - 0.5) * 1.5; _strkO.vel[1] = 2 + rng() * 2.5; _strkO.vel[2] = (rng() - 0.5) * 1.5;
      _strkO.life = 0.5 + rng() * 0.5;
      _strkO.width = 0.02 + rng() * 0.015; _strkO.stretch = 0.03; _strkO.grav = -9;
      col3(0xffb060, _strkO.col); _strkO.alpha = 0.7; _strkO.seed = rng(); _strkO.birthOffset = birthOffset;
      particles.emit('sparks', _strkO);
    }
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /** Enforce the column cap by retiring the lowest-remaining-ttl emitter. */
  function capColumns(): void {
    while (columns.length > columnCap) {
      let low = 0;
      for (let i = 1; i < columns.length; i++) {
        if (columns[i].ttl < columns[low].ttl) low = i;
      }
      columns.splice(low, 1);
    }
  }

  /** Remove a live subject-following column; wreck columns are world-fixed. */
  function retireSubjectColumn(key: string): void {
    let live = 0;
    for (const col of columns) if (col.key !== key) columns[live++] = col;
    columns.length = live;
  }

  const _due: FxTimer[] = []; // reused timer-fire scratch (cleared after each use)

  function advanceFxClock(): number {
    const nowClockS = particles.getTime();
    let tickDt = nowClockS - lastTickS;
    lastTickS = nowClockS;
    if (!(tickDt > 0)) return 0;
    return Math.min(tickDt, 8);
  }

  /**
   * wreck r1: does this wreck column still have a corpse to ride? The corpse is
   * gone when its entity no longer resolves, has no visual root (released to the
   * pool), or reads alive again (revived for a respawn, combat.destroyed false or
   * the visual reset) after it was once seen as a wreck. Killcam replays restage
   * the victim intact for a moment — the suppression gate skips the check there.
   */
  function wreckColumnHasCorpse(col: SmokeColumn, subject: FxEntity | null): boolean {
    if (!subject || !subject.visual || !subject.visual.root) return false;
    if (replaySuppressed) return true;
    const visual = subject.visual;
    const visualWrecked = typeof visual.isDestroyed === 'function' ? visual.isDestroyed() : null;
    const combatWrecked = subject.combat ? subject.combat.destroyed !== false : null;
    const wrecked = visualWrecked === null ? combatWrecked : combatWrecked === null ? visualWrecked : (visualWrecked || combatWrecked);
    if (wrecked === null) return true;
    if (wrecked) { col.sawWreck = true; return true; }
    return !col.sawWreck;
  }

  function syncColumnAnchors(resolveSubject: ((id: string) => FxEntity | null) | null): void {
    if (!columns.length || !resolveSubject) return;
    let live = 0;
    for (const col of columns) {
      if (col.key == null) { columns[live++] = col; continue; }
      if (col.wreckOf) {
        const corpse = resolveSubject(col.wreckOf);
        if (!wreckColumnHasCorpse(col, corpse)) continue; // the corpse left: the smoke leaves with it
        col.attachmentResolved = syncSubjectEmitterAnchor(col, corpse, _subjectAnchor);
        columns[live++] = col;
        continue;
      }
      const subject = resolveSubject(col.key);
      col.attachmentResolved = syncSubjectEmitterAnchor(col, subject, _subjectAnchor);
      columns[live++] = col;
    }
    columns.length = live;
  }

  // (EF.10, MASTER 19: "headlights and fires light the smoke") the local lights the smoke and dust take, every frame
  // (localLights.ts): the night pool's headlight spots, the muzzle flash, the explosion light (a burst's pulse, which the
  // volume media light themselves, or the latest wreck's fire) and the other burning wrecks' fires. By day the fires
  // and flashes light their smoke at a third (the sun outshines them); a headlight burns only at night.
  /**
   * (240, the night fire's smoke "over-lit far above the fire" and its base "not lit by its own flames") at night a burning
   * tank wreck lights its smoke from its flames' tops (its deck + NIGHT_SMOKE_GLOW_UP_M), NIGHT_SMOKE_GLOW_K x as strongly
   * over only NIGHT_SMOKE_GLOW_REACH_M x its scale: soot scatters a few per cent of what reaches it, so the old slot (1.2 m
   * over the hull's foot, inside the hull, at the day's gain) left the base as black as the column's top. The smoke
   * glows orange just over the flames and is the night's dark grey a few metres up.
   */
  function nightSmokeGlowAt(col: SmokeColumn, color: THREE.Color, gain: number): boolean {
    return addLocalPoint(col.pos[0], col.pos[1] + (col.deck ?? NIGHT_TONGUE_DECK_M) + NIGHT_SMOKE_GLOW_UP_M, col.pos[2],
      NIGHT_SMOKE_GLOW_REACH_M * col.scale, color, gain * NIGHT_SMOKE_GLOW_K);
  }
  let nightPool: THREE.Object3D | null | undefined;
  let nightPoolLookedAt = -1e9;
  const _wreckFire = new THREE.Color(EXPLOSION_LIGHT_HEX);
  function writeLocalLights(): void {
    beginLocalLights();
    // Low and Ultra Low compile the loop out: nothing reads the slots
    if (!localLightsCompiled()) { endLocalLights(); return; }
    const now = particles.getTime();
    const scene = engineCtx.scene ?? null;
    if (scene && !nightPool && now - nightPoolLookedAt > 2) {
      nightPool = scene.getObjectByName('night-light-pool') ?? null;
      nightPoolLookedAt = now;
    }
    if (nightPool) {
      const kids = nightPool.children;
      for (let i = 0; i < kids.length; i++) {
        const L = kids[i] as THREE.SpotLight;
        if (!L.isSpotLight || !(L.intensity > 0)) continue;
        const p = L.position, t = L.target.position;
        addLocalSpot(p.x, p.y, p.z, L.distance || 42, L.color, LOCAL_HEADLIGHT_GAIN, t.x - p.x, t.y - p.y, t.z - p.z,
          Math.cos(L.angle), Math.cos(L.angle * (1 - L.penumbra)));
      }
    }
    const nightK = 0.35 + 0.65 * tracers.darkLevel();
    const nightFlames = tracers.darkLevel() >= NIGHT_FIRE_DARK;
    if (muzzleLight.intensity > 0) {
      const p = muzzleLight.position;
      addLocalPoint(p.x, p.y, p.z, muzzleLight.distance * 1.5, muzzleLight.color,
        LOCAL_FLASH_GAIN * nightK * muzzleLight.intensity / MUZZLE_LIGHT_PEAK);
    }
    const blastState = lightStates[1];
    // (the coordinator on round 2's night cook-off: "the whole column is lit, as if by day ... a warm firelit underside
    // only within a few metres of the flames") a wreck's fire lights its smoke from the flames themselves (1.2 m over the
    // hull, not the pooled light's 3.4 m) and only a few metres round them (LOCAL_FIRE_REACH_M x the column's scale);
    // a burst's pulse keeps its own reach (the pooled puffs take it; the media light their pulse themselves)
    if (explosionLight.intensity > 0) {
      const p = explosionLight.position, pulse = lightAge(blastState) < blastState.dur;
      if (pulse) {
        addLocalPoint(p.x, p.y, p.z, explosionLight.distance * 1.3, explosionLight.color,
          nightK * LOCAL_FLASH_GAIN * explosionLight.intensity / EXPLOSION_LIGHT_PEAK, true);
      } else if (nightFlames && wreckLit && !wreckLit.car) {
        // (240) at night from its flames' tops, over a short reach (nightSmokeGlowAt)
        nightSmokeGlowAt(wreckLit, explosionLight.color, nightK * LOCAL_FIRE_GAIN * explosionLight.intensity / (12 * NIGHT_FIRE_LIGHT_K));
      } else {
        addLocalPoint(p.x, p.y - 2.2, p.z, LOCAL_FIRE_REACH_M * 1.3, explosionLight.color,
          nightK * LOCAL_FIRE_GAIN * explosionLight.intensity / 12);
      }
    }
    // the other burning wrecks (the explosion light rides the latest one still burning, or a burst's pulse the latest
    // column), each as bright as its fire is alive (flameOf)
    for (let i = columns.length - 1; i >= 0; i--) {
      const col = columns[i], fk = flameOf(col);
      if (col === wreckLit || !(fk > 0)) continue;
      const flicker = 0.8 + 0.12 * Math.sin(now * 11.3 + i * 1.7) + 0.08 * Math.sin(now * 6.1 + i * 2.9);
      const gain = LOCAL_FIRE_GAIN * nightK * flicker * col.scale * fk;
      if (nightFlames && !col.car) { if (!nightSmokeGlowAt(col, _wreckFire, gain)) break; continue; }
      if (!addLocalPoint(col.pos[0], col.pos[1] + 1.2, col.pos[2], LOCAL_FIRE_REACH_M * col.scale, _wreckFire, gain)) break;
    }
    endLocalLights();
  }

  function updateClockDrivenLights(): void {
    for (const st of lightStates) applyLight(st);
    for (const ring of shockRings) applyShockRing(ring);
    for (const ring of muzzleRings) applyMuzzleRing(ring);
  }

  function sweepImpactDecals(dt: number): void {
    decalSweepAcc += dt;
    if (decalSweepAcc <= 1.4) return;
    decalSweepAcc = 0;
    impactDecals.sweep();
  }

  /** The column the explosion light rides now (writeLocalLights lights the others). */
  let wreckLit: SmokeColumn | null = null;
  function updateWreckLight(): void {
    wreckLit = columns.length ? columns[columns.length - 1] : null;
    if (replaySuppressed) return;
    const explosionState = lightStates[1];
    if (lightAge(explosionState) >= explosionState.dur && columns.length) {
      // (233: "the fire glow can outlast the visible flame": it rode the latest column into its smoulder, and a smoke-only
      // one) the latest column still burning, its light dying down with its flames
      let col: SmokeColumn | null = null;
      for (let i = columns.length - 1; i >= 0 && !col; i--) if (flameOf(columns[i]) > 0) col = columns[i];
      wreckLit = col;
      if (!col) return;
      // (wave 266: the wreck fire's light left a red patch on the ground and the hull's deck) a living flicker over the
      // wreck, set higher and softer: the flames on the deck carry the fire, the light only warms round them
      // (a car's fire is lower and lights the car and the ground round it: r1c, "the fire lights almost nothing at night")
      // (240) at night a tank wreck's light hangs among its flames' tops (its deck + NIGHT_FIRE_LIGHT_UP_M), NIGHT_FIRE_LIGHT_K x
      // as bright over NIGHT_FIRE_LIGHT_RANGE_M: its deck under the flames glows and the ground round it takes a warm,
      // flickering pool to ~10 m (the night critic: a burning wreck that "lights almost nothing" round it)
      const night = !col.car && nightFire();
      explosionLight.position.set(col.pos[0], col.pos[1] + (col.car ? 2.2 : night
        ? (col.deck ?? NIGHT_TONGUE_DECK_M) + NIGHT_FIRE_LIGHT_UP_M : 3.4), col.pos[2]);
      explosionLight.distance = night ? NIGHT_FIRE_LIGHT_RANGE_M : 12;
      // (fx round 7c) a burst's pulse may have left its own hue on the pooled light: the wreck's fire is the kill orange
      explosionLight.color.setHex(EXPLOSION_LIGHT_HEX);
      const time = particles.getTime();
      explosionLight.intensity = (
        9.5 + 3.2 * Math.sin(time * 13.7) + 2.2 * Math.sin(time * 7.1 + 1.9)
      ) * col.scale * (blast ? 0.45 : 1) * (col.car ? 0.45 + 1.15 * tracers.darkLevel() : night ? NIGHT_FIRE_LIGHT_K : 1)
        * flameOf(col);
      return;
    }
    const pulseRange = explosionState.range ?? 13;
    if (lightAge(explosionState) < explosionState.dur && explosionLight.distance !== pulseRange) {
      explosionLight.distance = pulseRange;
    }
  }

  function advanceTimers(tickDt: number): void {
    if (!timers.length) return;
    _due.length = 0;
    for (const timer of timers) {
      timer.t -= tickDt;
      if (timer.t <= 0) _due.push(timer);
    }
    if (!_due.length) return;
    let live = 0;
    for (const timer of timers) if (timer.t > 0) timers[live++] = timer;
    timers.length = live;
    if (!replaySuppressed) for (const timer of _due) timer.fn();
    _due.length = 0;
  }

  function advanceActiveColumn(col: SmokeColumn, tickDt: number): void {
    col.ttl -= tickDt;
    if (col.ttl <= 0) {
      col.ttl = 0;
      // nothing smolders in a shell crater: a smoke-only column simply ends
      col.smolder = col.flame === false ? 0 : SMOKE_SMOLDER_S;
      col.acc = 0;
      return;
    }
    if (replaySuppressed) {
      col.acc = 0;
      return;
    }
    col.acc += tickDt;
    while (col.acc >= COLUMN_TICK_S) {
      col.acc -= COLUMN_TICK_S;
      emitColumnPuff(col, -col.acc);
    }
  }

  function advanceSmolderColumn(col: SmokeColumn, tickDt: number): boolean {
    col.smolder = (col.smolder === undefined ? SMOKE_SMOLDER_S : col.smolder) - tickDt;
    if (col.smolder <= 0) return false;
    if (replaySuppressed) {
      col.acc = 0;
      return true;
    }
    col.acc += tickDt;
    while (col.acc >= 0.45) {
      col.acc -= 0.45;
      emitSmolderPuff(col, -col.acc);
    }
    return true;
  }

  function compactSmokeColumns(): void {
    let live = 0;
    for (const col of columns) {
      if (col.ttl > 0 || (col.smolder ?? 0) > 0) columns[live++] = col;
    }
    columns.length = live;
  }

  function advanceSmokeColumns(tickDt: number): void {
    if (!columns.length) return;
    let compact = false;
    for (const col of columns) {
      if (col.ttl > 0) advanceActiveColumn(col, tickDt);
      else if (!advanceSmolderColumn(col, tickDt)) compact = true;
    }
    if (compact) compactSmokeColumns();
  }

  function advanceTimedFx(tickDt: number): void {
    if (!(tickDt > 0)) return;
    advanceTimers(tickDt);
    advanceSmokeColumns(tickDt);
  }

  function initialSweepTail(shell: LiveShell): [number, number, number] {
    const source = shell.prevPos ?? shell.pos;
    return [source.x, source.y, source.z];
  }

  function sweepShellsThroughProps(shells: LiveShell[]): void {
    if (frozen) return;
    _sweepSeen.clear();
    for (let index = 0; index < shells.length; index++) {
      const shell = shells[index];
      if (!shell.pos || shell.id == null) continue;
      _sweepSeen.add(shell.id);
      if (shell.dead) continue;
      let tail = sweepTails.get(shell.id);
      if (!tail) {
        tail = initialSweepTail(shell);
        sweepTails.set(shell.id, tail);
      }
      const dx = shell.pos.x - tail[0];
      const dy = shell.pos.y - tail[1];
      const dz = shell.pos.z - tail[2];
      if (dx * dx + dy * dy + dz * dz > 1e-6) {
        notifyShellSweep(tail[0], tail[1], tail[2], shell.pos.x, shell.pos.y, shell.pos.z);
      }
      tail[0] = shell.pos.x;
      tail[1] = shell.pos.y;
      tail[2] = shell.pos.z;
    }
    for (const id of sweepTails.keys()) if (!_sweepSeen.has(id)) sweepTails.delete(id);
  }

  let liveAtgmCount = 0;
  const _bodyDims = [0, 0];
  const _flareColor = new THREE.Color();
  /** (ac130-fx-228 r2) this frame's camera, for the motor flare's angular cap (writeLiveShellTracers sets it) */
  const _flareCam = new THREE.Vector3();
  let flareCamSet = false;

  /** One missile's airframe and its motor's hot core: the nose at the round, the body its calibre and its family's
   *  length behind (missileBodies.ts), rolled; the core at the tail; an unlit motor (a soft launch's coast) shows none. */
  function writeGuidedBody(shellPos: THREE.Vector3, direction: THREE.Vector3, look: MissileLook = MISSILE_LOOKS.konkurs,
    lit = true, flareK = 1, calMm = 0, roll = Math.PI / 4): void {
    if (liveAtgmCount < MAX_ATGM_BODIES) {
      missileBodyDims(look.id, calMm, _bodyDims);
      bodies.write(look.id, shellPos, direction, roll, _bodyDims[0], _bodyDims[1], look.bodyHex);
      _atgmFlareObject.position.copy(shellPos).addScaledVector(direction, -(_bodyDims[1] + 0.04));
      _atgmFlareObject.quaternion.identity();
      // (ac130-fx-228 r2) never wider than FLARE_MAX_RAD from this frame's camera: a motor a few metres from the lens (a
      // round leaving its launcher beside the eye) stays a hot point, not a disc over the frame
      let flareScale = lit ? 0.32 + 0.12 * look.flarePx : 1e-4;
      if (lit && flareCamSet) flareScale = Math.min(flareScale,
        _atgmFlareObject.position.distanceTo(_flareCam) * FLARE_MAX_RAD / ATGM_FLARE_RADIUS_M);
      _atgmFlareObject.scale.setScalar(Math.max(1e-4, flareScale));
      _atgmFlareObject.updateMatrix();
      atgmFlares.setMatrixAt(liveAtgmCount, _atgmFlareObject.matrix);
      _flareColor.setRGB(look.flareCore[0], look.flareCore[1], look.flareCore[2]).multiplyScalar(1.4 * flareK);
      atgmFlares.setColorAt(liveAtgmCount, _flareColor);
      liveAtgmCount++;
    }
  }


  // ---- (fx 9a) missiles: each round its own look (missileLooks.ts) ----------------------------------------------------
  /** launch points by shell id (shell:fired), for the command wires */
  const missileLaunchAt = new Map<ShellId, [number, number, number, number]>();
  /** the shooter's gun resolves a networked round that carries only its type and guidance */
  const missileByShooter = new Map<string, MissileLook>();
  /** (FX lane 10-15) the calibre of the round the shooter's look came from (a networked round's spec names none) */
  const calibreByShooter = new Map<string, number>();
  const _wob = [0, 0];
  const _mSide = new THREE.Vector3();
  const _mUp = new THREE.Vector3();
  const _mPos = new THREE.Vector3();
  const _mHead = new THREE.Vector3();
  const _mDir = new THREE.Vector3(); // the drawn round's axis (a gunship missile curving off its pylon onto its line)
  const _pyl = new THREE.Vector3();
  const _pylE = new THREE.Euler(), _pylQ = new THREE.Quaternion();

  /** (ac130-fx-228 r2) a gunship missile's pylon off the airframe's centre (world m): the airframe's heading `yaw` when
   *  known, else the one that turns its port side (+x) along the line of fire's level heading (dx, dz) */
  function gunshipPylonOffset(yaw: number | undefined, dx: number, dz: number, out: THREE.Vector3): THREE.Vector3 {
    const heading = Number.isFinite(yaw) ? yaw as number : Math.atan2(-dz, dx);
    _pylQ.setFromEuler(_pylE.set(0, heading, GUNSHIP_BANK_RAD));
    return out.copy(GUNSHIP_PYLON_LOCAL).applyQuaternion(_pylQ);
  }
  /** how much of the pylon offset remains `d` metres down the line (1 at the rail, 0 joined), and its slope */
  function pylonK(d: number, m = GUNSHIP_PYLON_MERGE_M): number {
    const x = Math.max(0, Math.min(1, d / m));
    return 1 - x * x * (3 - 2 * x);
  }
  function pylonSlope(d: number, m = GUNSHIP_PYLON_MERGE_M): number {
    const x = d / m;
    return x <= 0 || x >= 1 ? 0 : -6 * x * (1 - x) / m;
  }
  /** the covered warm's motor glow colour */
  const WARM_GLOW_RGB: readonly number[] = [0.82, 0.82, 0.78];
  let liveMissiles = 0;
  // (FX lane 10-14) each wire's launcher: the firing vehicle, the tube the round left (-1 the gun's own muzzle, -2 none
  // resolved: the wire keeps the point it was fired from), whether that is a launcher tube, and the fired muzzle's offset
  // from the visual's own at the shot (so the wire's end sits exactly where the round left)
  const wireShooter: (ShellId | null)[] = new Array(WIRE_SLOTS).fill(null);
  const wireTube = new Int16Array(WIRE_SLOTS).fill(-2);
  const wireLauncher = new Uint8Array(WIRE_SLOTS);
  const wireOff = new Float64Array(WIRE_SLOTS * 3);
  const _wireA = new THREE.Vector3();
  /** the covered warm's wire */
  const WARM_WIRE_KEY = -9;

  function idSeed(id: ShellId): number {
    let h = 2166136261;
    const str = String(id);
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h | 0;
  }

  function lookForShell(shell: LiveShell): MissileLook {
    const spec = shell.spec;
    if (spec?.name || spec?.soundProfile || shell.rocket) {
      return missileLookFor(spec?.name, spec?.soundProfile, shell.rocket === true && spec?.guided !== true);
    }
    const key = `${String(shell.shooterId)}|${spec?.type ?? ''}`;
    const known = missileByShooter.get(key);
    if (known) return known;
    const owner = decalEntityFor(shell.shooterId) as (FxEntity & {
      spec?: { gun?: { shells?: readonly ({ name?: string; type?: string; guided?: boolean; soundProfile?: string } | null)[] } };
    }) | null;
    if (missileByShooter.size > 64) { missileByShooter.clear(); calibreByShooter.clear(); }
    // (ac130-fx-228) a networked gunship's spec is its pilot's garage tank: its aircraft names the missile (the hellfire)
    if ((owner as FxEntity | null)?.aerial?.kind === 'gunship') {
      const look = missileLookFor(null, 'gunship-missile', false);
      missileByShooter.set(key, look);
      calibreByShooter.set(key, gunshipCaliberMm('missile'));
      return look;
    }
    const shells = owner?.spec?.gun?.shells ?? [];
    const round = shells.find((r) => r?.guided === true && (!spec?.type || r.type === spec.type)) ?? shells.find((r) => r?.guided === true);
    const look = missileLookFor(round?.name, round?.soundProfile, false);
    missileByShooter.set(key, look);
    calibreByShooter.set(key, (round as { caliberMm?: number } | undefined)?.caliberMm ?? 0);
    return look;
  }

  function missileRecord(shell: LiveShell): GuidedTrail {
    let trail = guidedTrails.get(shell.id);
    if (!trail) {
      trail = { age: 0, seen: true };
      guidedTrails.set(shell.id, trail);
    }
    if (!trail.look) {
      trail.look = lookForShell(shell);
      trail.seed = idSeed(shell.id);
      const at = missileLaunchAt.get(shell.id);
      trail.launch = at ? [at[0], at[1], at[2]]
        : shell.prevPos ? [shell.prevPos.x, shell.prevPos.y, shell.prevPos.z] : [shell.pos.x, shell.pos.y, shell.pos.z];
      trail.calMm = shell.spec?.caliberMm || (at ? at[3] ?? 0 : 0) || calibreByShooter.get(`${String(shell.shooterId)}|${shell.spec?.type ?? ''}`) || 0;
      trail.tailM = missileBodyDims(trail.look.id, trail.calMm, _bodyDims)[1];
      // (ac130-fx-228 r2) the gunship's missile is drawn off its wing pylon (gunshipPylonOffset)
      const shooter = shell.shooterId != null ? subjectFor(shell.shooterId) : null;
      if (gunshipRoundOf(shell.spec, shooter?.aerial?.kind === 'gunship') === 'missile') {
        // (ac130-barrels-230) seen from its own lens it leaves the rail drawn beside the lens
        const l = trail.launch;
        if (l && lensOffset('missile', l[0], l[1], l[2], _v1.x, _v1.y, _v1.z, _lensRound)) {
          trail.pylon = [_lensRound.x, _lensRound.y, _lensRound.z];
          trail.pylonM = _lensRound.rangeM;
          trail.lensK = lensGuns ? lensGuns.scale : 1;
        } else {
          gunshipPylonOffset(shooter?.state?.yaw, shell.vel.x, shell.vel.z, _pyl);
          trail.pylon = [_pyl.x, _pyl.y, _pyl.z];
          trail.pylonM = GUNSHIP_PYLON_MERGE_M;
        }
      } else trail.pylon = null;
      trail.lastD = -1;
      trail.smokeSlot = -1;
      trail.nextSmokeD = trail.look.igniteM;
      // a round first seen mid-flight with no distance record counts as lit
      trail.fallbackD = trail.look.igniteM;
    }
    return trail;
  }

  /**
   * A missile or rocket in flight (the gunship's too: its hellfire): its body (wobbling with its steering), its motor's
   * flare and hot plume once lit, the pop where a coasting motor lights, its smoke trail on the media layer (puffs born
   * where it passed, when it passed) and the command wires paying out behind a wire-guided round.
   */
  function writeMissile(shell: LiveShell): void {
    const trail = missileRecord(shell);
    trail.age = 0;
    trail.seen = true;
    const look = trail.look as MissileLook;
    const seed = trail.seed as number;
    const seedU = ((seed >>> 0) % 10007) / 10007;
    const speed = Math.max(1, shell.vel.length());
    const dir = _v1; // the caller normalized the velocity into _v1
    let d: number;
    if (Number.isFinite(shell.distM)) d = shell.distM as number;
    else {
      if (shell.prevPos && (trail.lastD as number) >= 0) trail.fallbackD = (trail.fallbackD as number) + shell.pos.distanceTo(shell.prevPos);
      d = trail.fallbackD as number;
    }
    const t = Number.isFinite(shell.ageS) ? (shell.ageS as number) : d / speed;
    // (ac130-barrels-230 r2) off the lens's rail the drawn round eases off the rail (LENS_LAUNCH_M): it is drawn `dd` down
    // its line, its motor, plume and smoke with it, where the simulation's round is `d` down it
    const dd = trail.lensK !== undefined && d < LENS_LAUNCH_M ? d * d / LENS_LAUNCH_M : d;
    // the steering corrections: a small lateral offset off the authoritative line, the same at every frame rate (a round
    // that carries neither its flight time nor its distance flies its line: its time is not known)
    const timed = Number.isFinite(shell.ageS) || Number.isFinite(shell.distM);
    _mSide.crossVectors(dir, _UP);
    if (_mSide.lengthSq() < 1e-6) _mSide.set(1, 0, 0); else _mSide.normalize();
    _mUp.crossVectors(_mSide, dir).normalize();
    missileWobble(look, timed ? t : 0, seedU, _wob);
    _mPos.copy(shell.pos).addScaledVector(dir, dd - d).addScaledVector(_mSide, _wob[0]).addScaledVector(_mUp, _wob[1]);
    _mDir.copy(dir);
    const pylon = trail.pylon;
    let bodyK = 1;
    if (pylon) {
      // (ac130-fx-228 r2) off the wing pylon onto the guided line: the offset still left here, the axis along that curve
      const k = pylonK(dd, trail.pylonM), sl = pylonSlope(dd, trail.pylonM);
      _mPos.x += pylon[0] * k; _mPos.y += pylon[1] * k; _mPos.z += pylon[2] * k;
      _mDir.x += pylon[0] * sl; _mDir.y += pylon[1] * sl; _mDir.z += pylon[2] * sl;
      _mDir.normalize();
      // (ac130-barrels-230) off the lens's rail: its rail round's size at the launch, its own once on its line
      if (trail.lensK !== undefined) bodyK = trail.lensK + (1 - trail.lensK) * (1 - k);
    }
    const lit = dd >= look.igniteM;
    const flick = missileFlicker(look, t, seedU);
    // (FX lane 10-15) a roll-stabilised round rolls at its roll rate (its fins with its tracer's helix); the others fly
    // with their fins in an X
    const roll = look.spinHz ? Math.PI * 2 * look.spinHz * (timed ? t : 0) + seedU * 6.2831853 : Math.PI / 4;
    // (missileBodyDims reads a calibre under 20 mm as none: the family's own)
    const calMm = bodyK < 1 ? Math.max(21, missileBodyDims(look.id, trail.calMm ?? 0, _bodyDims)[0] * 1000 / 0.94 * bodyK) : trail.calMm ?? 0;
    writeGuidedBody(_mPos, _mDir, look, lit, flick, calMm, roll);
    // the motor at the body's tail; (EF.04) a roll-stabilised round's tracer rides its helix about the axis
    const tailM = (trail.tailM ?? 1.3) * bodyK;
    _mHead.copy(_mPos).addScaledVector(_mDir, -tailM);
    if (look.spinM) {
      missileSpin(look, timed ? t : 0, seedU, _wob);
      _mHead.addScaledVector(_mSide, _wob[0]).addScaledVector(_mUp, _wob[1]);
    }
    // the motor lighting clear of the launcher (crossed since the last frame)
    const lastD = trail.lastD as number;
    if (blast && look.igniteM > 0.5 && lit && lastD >= 0 && lastD < look.igniteM) {
      const back = dd - look.igniteM;
      missileIgnition(blast, puffRandom(seed ^ 0x2c1b3c6d), look,
        _mPos.x - dir.x * back, _mPos.y - dir.y * back, _mPos.z - dir.z * back, dir.x, dir.y, dir.z, -back / speed);
    }
    if (lit) {
      // its plume streaming back from the motor (no longer than it has burned)
      const plume = Math.max(0.15, Math.min(look.plumeM, dd - look.igniteM + 0.3));
      const dark = tracers.darkLevel();
      const fk = look.flareK * flick;
      tracers.glow(_mHead.x, _mHead.y, _mHead.z,
        _mHead.x - dir.x * plume, _mHead.y - dir.y * plume, _mHead.z - dir.z * plume,
        look.flarePx * (1 + 0.25 * (1 - dark)), look.haloPx * (0.55 + 0.45 * dark), look.flareCore, fk,
        look.flareHalo, fk * (0.05 + 0.12 * dark), 1.4);
      renderedAtgmTrailSegments++;
      layTrail(trail, look, shell, d, t, speed, seedU, dir, dd);
    }
    if (look.wires > 0) payOutWire(trail, shell, look, dir);
    trail.lastD = dd;
  }

  /** (ac130-fx-228 r2) the gunship missile's trail: its family's, fading within GUNSHIP_TRAIL_NEAR_M of the camera and
   *  spreading to at most GUNSHIP_TRAIL_R1_M (one derived look per family, made once) */
  const gunshipTrails = new Map<MissileTrail, MissileTrail>();
  function gunshipTrailOf(base: MissileTrail): MissileTrail {
    let t = gunshipTrails.get(base);
    // and spreads less as it hangs: seen from the orbit it lies along the gimbal's own line of sight, where a family's
    // full spread (built for a trail seen side-on from the ground) widens into a cone toward the lens
    if (!t) {
      t = Object.freeze({ ...base, nearM: GUNSHIP_TRAIL_NEAR_M, r1: Math.min(base.r1, GUNSHIP_TRAIL_R1_M) });
      gunshipTrails.set(base, t);
    }
    return t;
  }
  /** (ac130-barrels-230 r2) the lens missile's trail: the gunship's, narrow at the rail (LENS_TRAIL_*) */
  const lensTrails = new Map<MissileTrail, MissileTrail>();
  /** this frame's near fade for the derived looks (no iterator per frame) */
  let trailNear = 0;
  const applyTrailNear = (look: MissileTrail): void => smokeTrails.setNear(look, trailNear);
  function lensTrailOf(base: MissileTrail): MissileTrail {
    let t = lensTrails.get(base);
    if (!t) {
      t = Object.freeze({ ...base, nearM: LENS_TRAIL_NEAR_M, r0: LENS_TRAIL_R0_M, rJet: LENS_TRAIL_JET_M,
        r1: Math.min(base.r1, LENS_TRAIL_R1_M), boostK: 1 });
      lensTrails.set(base, t);
    }
    return t;
  }
  /** (ac130-fx-228 r3) this frame's camera: is it aloft (a gunship's lens, the killcam's orbit round the airframe)? The
   *  derived looks' near fade is on for it and off for a camera near the ground, which sees the whole trail */
  function setGunshipTrailNear(cam: THREE.Vector3): void {
    if (!gunshipTrails.size && !lensTrails.size) return;
    const aloft = cam.y - groundY(cam.x, cam.z) > GUNSHIP_LENS_TRAIL_M;
    const near = lensUp ? LENS_TRAIL_NEAR_M : aloft ? GUNSHIP_TRAIL_NEAR_M : 0;
    trailNear = near;
    gunshipTrails.forEach(applyTrailNear);
    lensTrails.forEach(applyTrailNear);
  }

  /** the live presentation entity a shooter id names (the Studio's actors first, else the battle's) */
  function subjectFor(id: ShellId): FxEntity | null {
    return (tracerSubject ? tracerSubject(String(id)) : null) ?? decalEntityFor(id);
  }

  /**
   * (FX lane 10-14) A wire-guided round's wire from its launcher: the tube it left on the firing vehicle, resolved once
   * at the shot (the event's tube, else the vehicle's tube nearest where the round left; none within 1.5 m: the wire
   * keeps the point it was fired from).
   */
  function beginWire(e: ShellFiredEvent, look: MissileLook): void {
    const slot = wires.begin(idSeed(e.shellId), look.wires, e.muzzlePos[0], e.muzzlePos[1], e.muzzlePos[2], particles.getTime());
    wireShooter[slot] = e.shooterId ?? null;
    wireTube[slot] = -2;
    if (e.shooterId == null) return;
    const vis = subjectFor(e.shooterId)?.visual;
    if (!vis?.gunMuzzleWorld) return;
    const ent = subjectFor(e.shooterId) as (FxEntity & {
      spec?: { gun?: Parameters<typeof usesLauncherMuzzles>[0] & { shells?: readonly ({ name?: string; guided?: boolean } | null)[] } };
    }) | null;
    const gun = ent?.spec?.gun ?? null;
    const round = gun?.shells?.find((r) => r?.name === e.shellName) ?? gun?.shells?.find((r) => r?.guided === true) ?? null;
    const launcher = usesLauncherMuzzles(gun, round);
    const tubes = launcher ? gun?.launcherMuzzles?.length ?? 0 : 0;
    const [mx, my, mz] = e.muzzlePos;
    let best = -2, bestD = 1.5 * 1.5;
    const tryTube = (i: number): void => {
      vis.gunMuzzleWorld!(_wireA, i >= 0 ? i : undefined, launcher);
      const dd = (_wireA.x - mx) ** 2 + (_wireA.y - my) ** 2 + (_wireA.z - mz) ** 2;
      if (dd < bestD) {
        bestD = dd; best = i;
        wireOff[slot * 3] = mx - _wireA.x; wireOff[slot * 3 + 1] = my - _wireA.y; wireOff[slot * 3 + 2] = mz - _wireA.z;
      }
    };
    if (typeof e.muzzleIndex === 'number' && e.muzzleIndex >= 0) tryTube(e.muzzleIndex);
    if (best === -2) { if (tubes > 0) for (let i = 0; i < tubes; i++) tryTube(i); else tryTube(-1); }
    wireTube[slot] = best;
    wireLauncher[slot] = launcher ? 1 : 0;
  }

  /** Each frame a wire-guided round flies: its wire's fixed end on the launcher's tube now, its free end at the round's
   *  tail (on its axis: the spools sit in the tail), laid where the tail passed. */
  function payOutWire(trail: GuidedTrail, shell: LiveShell, look: MissileLook, dir: THREE.Vector3): void {
    const key = trail.seed as number;
    let slot = wires.slotOf(key);
    if (slot < 0) {
      // first seen in flight (no shot event here): its wire from where it was first seen
      const L0 = trail.launch ?? [shell.pos.x, shell.pos.y, shell.pos.z];
      slot = wires.begin(key, look.wires, L0[0], L0[1], L0[2], particles.getTime());
      wireShooter[slot] = shell.shooterId ?? null;
      wireTube[slot] = -2;
    }
    const sid = wireShooter[slot];
    if (wireTube[slot] > -2 && sid != null) {
      const vis = subjectFor(sid)?.visual;
      if (vis?.gunMuzzleWorld) {
        vis.gunMuzzleWorld(_wireA, wireTube[slot] >= 0 ? wireTube[slot] : undefined, wireLauncher[slot] === 1);
        wires.anchor(slot, _wireA.x + wireOff[slot * 3], _wireA.y + wireOff[slot * 3 + 1], _wireA.z + wireOff[slot * 3 + 2]);
      }
    }
    const back = trail.tailM ?? 1.3;
    wires.tail(slot, _mPos.x - dir.x * back, _mPos.y - dir.y * back, _mPos.z - dir.z * back, particles.getTime());
  }

  /** the round is gone (struck, burst, self-destructed): its wire parts at the missile */
  function partWire(id: ShellId | null | undefined): void {
    if (id == null) return;
    const slot = wires.slotOf(idSeed(id));
    if (slot >= 0) wires.cut(slot, particles.getTime());
  }

  /** A missile's or rocket's launch: a gun-launched round keeps the gun's own muzzle blast, a rack's rockets their
   *  ignition flash; every one adds its look's launch on the media layer and a short light. */
  function missileLaunchFx(e: PredictedWeaponEvent & { shellName?: string }, seed: number): void {
    const look = missileLookFor(e.shellName, e.weaponSound, e.rocket === true);
    _v3.set(e.muzzlePos[0], e.muzzlePos[1], e.muzzlePos[2]);
    _v4.set(e.dir[0], e.dir[1], e.dir[2]);
    if (look.launch === 'gun') fx.muzzleFlash(_v3, _v4, e.caliberMm, false);
    else if (e.rocket) fx.muzzleFlash(_v3, _v4, e.caliberMm, true);
    else flashLight(lightStates[0], _v3, MUZZLE_LIGHT_PEAK * 0.35 * look.launchK, 0);
    if (blast) {
      missileLaunch(blast, puffRandom(seed), look, _v3.x, _v3.y, _v3.z, _v4.x, _v4.y, _v4.z, groundY(_v3.x, _v3.z), 0);
    }
  }

  // ---- (ac130-barrels-230) the pilot's own guns beside its gimbal lens -------------------------------------------------
  /** the lens guns (built from the airframe's chunk the first time a gunship lens is seen), and whether they are posed on
   *  this frame's camera */
  let lensGuns: GunshipLensGuns | null = null;
  let lensLoading = false;
  let lensUp = false;
  /** the aircraft whose gimbal point the camera rides (re-found at most every LENS_SCAN_FRAMES while none is) */
  let lensCarrier: unknown = null;
  let lensScanIn = 0;
  const LENS_SCAN_FRAMES = 30;
  const _lensM = new THREE.Vector3(), _lensD = new THREE.Vector3(), _lensOut = new THREE.Vector3(), _lensFwd = new THREE.Vector3();
  const _lensSide = new THREE.Vector3();
  const _lensRound: LensRound = { x: 0, y: 0, z: 0, rangeM: 1 };
  type LensView = { kind?: string; active?: boolean; x: number; y: number; z: number };
  function ridesLens(entity: unknown, eye: THREE.Vector3): boolean {
    const a = (entity as { aerial?: LensView } | null)?.aerial;
    if (!a || a.kind !== 'gunship' || !a.active) return false;
    // the aerial camera rides 0.12 m over the gimbal point (engine/aerialCamera.ts)
    const dx = eye.x - a.x, dy = eye.y - a.y - 0.12, dz = eye.z - a.z;
    return dx * dx + dy * dy + dz * dz < LENS_NEAR_M * LENS_NEAR_M;
  }
  /** the camera is an AC-130's own gimbal lens this frame: the aerial camera drives it (its heat-lens flag, no drone's
   *  feed) and it rides that aircraft's gimbal point (an external pose, the killcam or the ending's orbit leaves it) */
  function onGunshipLens(cam: THREE.Camera): boolean {
    const ud = cam.userData as { thermalFlight?: boolean; aerialPilotId?: unknown };
    if (ud.thermalFlight !== true || ud.aerialPilotId != null || !(cam as THREE.PerspectiveCamera).isPerspectiveCamera) return false;
    if (ridesLens(lensCarrier, cam.position)) return true;
    lensCarrier = null;
    if (!auxiliaryEntities || --lensScanIn > 0) return false;
    lensScanIn = LENS_SCAN_FRAMES;
    for (const entity of auxiliaryEntities()) if (ridesLens(entity, cam.position)) { lensCarrier = entity; return true; }
    return false;
  }
  function poseLensGuns(cam: THREE.Camera, dt: number): void {
    if (!onGunshipLens(cam)) {
      if (lensUp) { lensGuns?.hide(); lensUp = false; }
      return;
    }
    if (!lensGuns) {
      if (!lensLoading) {
        lensLoading = true;
        void import('../game/gunshipAirframe.ts').then((module) => {
          lensGuns = module.buildGunshipLensGuns({ setup: (m) => engineCtx.setupShadowMaterial?.(m), release: (m) => engineCtx.releaseShadowMaterial?.(m) });
          group.add(lensGuns.root);
        }, (error: unknown) => { lensLoading = false; console.warn('[fx] the gunship lens guns did not load:', error); });
      }
      return;
    }
    lensGuns.pose(cam as THREE.PerspectiveCamera, dt, imagesHeat(cam));
    lensUp = true;
  }
  /** the slant range (m) from (ox, oy, oz) down the unit line (dx, dy, dz) to the ground */
  function slantRange(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): number {
    if (!(dy < -0.05)) return 600;
    let t = (oy - groundY(ox, oz)) / -dy;
    for (let i = 0; i < 3; i++) t = Math.max(1, (oy - groundY(ox + dx * t, oz + dz * t)) / -dy);
    return t;
  }
  /** a gunship round leaving the orbit centre at (ox, oy, oz) along the unit line (dx, dy, dz), seen from its own lens: its
   *  gun's muzzle off that origin and the distance its drawn round joins its line in; false when no gun is drawn there */
  function lensOffset(gun: GunshipRound, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
    out: LensRound): boolean {
    if (!lensUp || !lensGuns) return false;
    const cam = engineCtx && engineCtx.camera;
    if (!cam || cam.position.distanceToSquared(_lensM.set(ox, oy, oz)) > GUNSHIP_LENS_M * GUNSHIP_LENS_M) return false;
    if (!lensGuns.muzzle(gun, _lensM)) return false;
    out.x = _lensM.x - ox; out.y = _lensM.y - oy; out.z = _lensM.z - oz;
    out.rangeM = LENS_MERGE_K * slantRange(ox, oy, oz, dx, dy, dz);
    return true;
  }
  /**
   * (ac130-barrels-230) A gunship shot seen from its own lens: the gun beside the lens recoils, its muzzle flashes and its
   * gas streams back in the slipstream; the missile's rail flashes and its launch blows back off the rail. Sizes and the
   * drift off the lens are scaled with the lens across the view (gunshipLensGuns.scale), so they hold their size and
   * their pace on the screen at every zoom. With no gun drawn there nothing is (the glass stays clear, as before).
   */
  /** the lens's scale across the view and the aircraft's velocity for this shot's flash, gas and tongues */
  let lensFxK = 1;
  const _lensVel = new THREE.Vector3();
  /** one puff of a lens gun's gas: from `at` lens m down the bore, on down it at `boreMps`, out of the frame at `outMps`
   *  and sideways at `sideMps` (lens m/s) */
  function lensGas(at: number, boreMps: number, outMps: number, sideMps: number, life: number, size0: number, size1: number,
    alpha: number, hex0: number, hex1: number): void {
    const M = _lensM, D = _lensD, k = lensFxK, cv = _lensVel;
    _puffO.pos[0] = M.x + D.x * at * k; _puffO.pos[1] = M.y + D.y * at * k; _puffO.pos[2] = M.z + D.z * at * k;
    _puffO.vel[0] = cv.x + k * (D.x * boreMps + _lensOut.x * outMps + _lensSide.x * sideMps + (rng() - 0.5) * 0.6);
    _puffO.vel[1] = cv.y + k * (D.y * boreMps + _lensOut.y * outMps + _lensSide.y * sideMps + (rng() - 0.5) * 0.6);
    _puffO.vel[2] = cv.z + k * (D.z * boreMps + _lensOut.z * outMps + _lensSide.z * sideMps + (rng() - 0.5) * 0.6);
    _puffO.life = life; _puffO.size0 = size0 * k; _puffO.size1 = size1 * k;
    _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.2;
    col3(hex0, _puffO.col0); col3(hex1, _puffO.col1);
    _puffO.alpha = alpha; _puffO.grav = 0; _puffO.birthOffset = 0;
    particles.emit('smoke', _puffO);
  }
  /** one flash card at `at` lens m down the bore */
  function lensFlash(at: number, life: number, size0: number, size1: number, alpha: number, hex0: number, hex1: number): void {
    const M = _lensM, D = _lensD, k = lensFxK, cv = _lensVel;
    _puffO.pos[0] = M.x + D.x * at * k; _puffO.pos[1] = M.y + D.y * at * k; _puffO.pos[2] = M.z + D.z * at * k;
    _puffO.vel[0] = cv.x + D.x * 2 * k; _puffO.vel[1] = cv.y + D.y * 2 * k; _puffO.vel[2] = cv.z + D.z * 2 * k;
    _puffO.life = life; _puffO.size0 = size0 * k; _puffO.size1 = size1 * k;
    _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = 0;
    col3(hex0, _puffO.col0); col3(hex1, _puffO.col1);
    _puffO.alpha = alpha; _puffO.grav = 0; _puffO.birthOffset = 0;
    particles.emit('flash', _puffO);
  }
  /** one tongue of flame from the muzzle along `ax` (lens m) */
  function lensJet(ax: THREE.Vector3, life: number, width: number, len0: number, len1: number): void {
    const M = _lensM, k = lensFxK;
    _jetO.pos[0] = M.x; _jetO.pos[1] = M.y; _jetO.pos[2] = M.z;
    _jetO.axis[0] = ax.x; _jetO.axis[1] = ax.y; _jetO.axis[2] = ax.z;
    _jetO.life = life; _jetO.width = width * k; _jetO.len0 = len0 * k; _jetO.len1 = len1 * k;
    _jetO.seed = rng(); col3(0xffe2a8, _jetO.col); _jetO.alpha = 1; _jetO.birthOffset = 0;
    particles.emit('jet', _jetO);
  }
  function lensMuzzleFx(gun: GunshipRound): void {
    if (!lensUp || !lensGuns || !lensGuns.muzzle(gun, _lensM, _lensD)) return;
    lensGuns.fire(gun);
    lensFxK = lensGuns.scale;
    _lensVel.copy(lensGuns.velocity);
    const heavy = gun === 'howitzer', missile = gun === 'missile';
    const D = _lensD, M = _lensM;
    // out of the frame: from the lens's axis out through the gun
    const cam = engineCtx.camera;
    if (cam) {
      cam.getWorldDirection(_lensFwd);
      _lensOut.copy(M).sub(cam.position);
      _lensOut.addScaledVector(_lensFwd, -_lensOut.dot(_lensFwd));
      if (_lensOut.lengthSq() > 1e-8) _lensOut.normalize(); else _lensOut.set(0, 1, 0);
    } else _lensOut.set(0, 1, 0);
    _lensSide.crossVectors(D, _UP);
    if (_lensSide.lengthSq() < 1e-6) _lensSide.set(1, 0, 0); else _lensSide.normalize();
    if (missile) {
      // the rail: a white flash at the round's motor (its tail, 0.83 lens m behind its middle) and its blast thrown back
      // off the rail and out of the frame
      M.addScaledVector(D, -0.83 * lensFxK);
      flashLight(lightStates[0], M, MUZZLE_LIGHT_PEAK * 0.3 * muzzleLightScale, 0);
      lensFlash(0, 0.12, 0.3, 1.1, 0.85, 0xfff6e0, 0xffb060);
      for (let i = 0; i < 4; i++) lensGas(-0.2 - 0.3 * i, -1.5 - rng() * 1.5, LENS_SLIP_MPS * 1.4, 0, 1 + rng() * 0.5, 0.2, 0.95 + rng() * 0.35, 0.28, 0xd8d6d0, 0xb9b7b0);
      return;
    }
    // the flash: a white-hot core at the brake, its orange bloom and tongue down the bore (the howitzer's brake also
    // vents its two baffles sideways)
    const s = heavy ? 2.3 : 1;
    lensFlash(0.12 * s, heavy ? 0.07 : 0.045, 0.3 * s, 0.75 * s, 1, 0xffffff, 0xffe2a8);
    lensFlash(0.45 * s, heavy ? 0.12 : 0.07, 0.5 * s, 1.45 * s, 0.85, 0xfff0c0, 0xff8a30);
    lensJet(D, heavy ? 0.09 : 0.05, 0.22 * s, 0.5 * s, 1.9 * s);
    if (heavy) {
      _lensFwd.copy(D).multiplyScalar(0.35).add(_lensSide).normalize(); lensJet(_lensFwd, 0.08, 0.32, 0.6, 2.2);
      _lensFwd.copy(D).multiplyScalar(0.35).sub(_lensSide).normalize(); lensJet(_lensFwd, 0.08, 0.32, 0.6, 2.2);
    }
    // the gas off the brake: a little way down the bore, then swept out of the frame past the gun
    if (heavy) {
      for (let i = 0; i < 6; i++) {
        const side = i < 2 ? 0 : (i % 2 ? 1 : -1) * (2.5 + rng() * 2);
        lensGas(0.4, 1.5 + rng() * 2, LENS_SLIP_MPS * (0.7 + rng() * 0.6), side, 0.9 + rng() * 0.5, 0.3, 1.15 + rng() * 0.4, 0.32,
          0x8f8a80, 0x9a978f);
      }
    } else {
      for (let i = 0; i < 2; i++) lensGas(0.3, 2 + rng() * 2, LENS_SLIP_MPS * (0.8 + rng() * 0.5), 0, 0.45 + rng() * 0.25, 0.1, 0.5, 0.15,
        0xc2beb4, 0xa8a59d);
    }
    flashLight(lightStates[0], M, MUZZLE_LIGHT_PEAK * (heavy ? 0.5 : 0.2) * muzzleLightScale, 0);
  }

  /**
   * (ac130-fx-228) A gunship shot's muzzle. The simulation fires every gunship round from the orbit centre, where the
   * pilot's gimbal camera rides: in that lens nothing is drawn at the muzzle (no tank flash cards, no propellant media a
   * metre in front of the glass; the rig's recoil kick sells the shot). Every other view (a teammate's, the killcam, a
   * replay, an external camera) sees the airframe's guns: a small flash at the gun port on the side that faces the
   * target (the guns train out of the port side, at the fuselage's waist) and a puff the slipstream carries off, the
   * howitzer's a heavier flash and a dirtier cloud; the missile leaves its rail with the hellfire's launch.
   */
  function gunshipMuzzleFx(e: PredictedWeaponEvent, gun: GunshipRound, seed: number): void {
    _v3.set(e.muzzlePos[0], e.muzzlePos[1], e.muzzlePos[2]);
    _v4.set(e.dir[0], e.dir[1], e.dir[2]);
    const cam = engineCtx && engineCtx.camera;
    if (cam && cam.position.distanceToSquared(_v3) < GUNSHIP_LENS_M * GUNSHIP_LENS_M) { lensMuzzleFx(gun); return; }
    _gpSide.set(_v4.x, 0, _v4.z);
    if (_gpSide.lengthSq() < 1e-6) _gpSide.set(1, 0, 0); else _gpSide.normalize();
    _gpPos.copy(_v3).addScaledVector(_gpSide, 2.4);
    _gpPos.y -= 0.8;
    if (gun === 'missile') {
      // (ac130-fx-228 r2) off its wing pylon, where the drawn round starts (writeMissile)
      const look = missileLookFor(null, 'gunship-missile', false);
      const shooter = (e as { shooterId?: ShellId | null }).shooterId;
      _gpPos.copy(_v3).add(gunshipPylonOffset(shooter != null ? subjectFor(shooter)?.state?.yaw : undefined, _v4.x, _v4.z, _pyl));
      flashLight(lightStates[0], _gpPos, MUZZLE_LIGHT_PEAK * 0.3 * look.launchK, 0);
      if (blast) missileLaunch(blast, puffRandom(seed), look, _gpPos.x, _gpPos.y, _gpPos.z, _v4.x, _v4.y, _v4.z,
        groundY(_gpPos.x, _gpPos.z), 0);
      return;
    }
    const heavy = gun === 'howitzer';
    const k = heavy ? 2.6 : 1;
    // the gun's flash: a hot core and its orange tongue down the line of fire
    _puffO.pos[0] = _gpPos.x + _v4.x * 0.5; _puffO.pos[1] = _gpPos.y + _v4.y * 0.5; _puffO.pos[2] = _gpPos.z + _v4.z * 0.5;
    _puffO.vel[0] = _v4.x * 2; _puffO.vel[1] = _v4.y * 2; _puffO.vel[2] = _v4.z * 2;
    _puffO.life = heavy ? 0.11 : 0.06; _puffO.size0 = 0.45 * k; _puffO.size1 = 1.5 * k;
    _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = 0;
    col3(0xfff2c8, _puffO.col0); col3(0xff9a3a, _puffO.col1);
    _puffO.alpha = heavy ? 0.85 : 0.7; _puffO.grav = 0; _puffO.birthOffset = 0;
    particles.emit('flash', _puffO);
    _jetO.pos[0] = _gpPos.x; _jetO.pos[1] = _gpPos.y; _jetO.pos[2] = _gpPos.z;
    _jetO.axis[0] = _v4.x; _jetO.axis[1] = _v4.y; _jetO.axis[2] = _v4.z;
    _jetO.life = heavy ? 0.09 : 0.05; _jetO.width = 0.22 * k; _jetO.len0 = 0.5 * k; _jetO.len1 = 1.6 * k;
    _jetO.seed = rng(); col3(0xffe2a8, _jetO.col); _jetO.alpha = 0.85; _jetO.birthOffset = 0;
    particles.emit('jet', _jetO);
    // the gas: carried off behind the airframe by the slipstream (the orbit's tangent: up the aim's level heading x up)
    const sx = -_gpSide.z, sz = _gpSide.x;
    const puffs = heavy ? 3 : 1;
    for (let i = 0; i < puffs; i++) {
      _puffO.pos[0] = _gpPos.x + _v4.x * 0.8; _puffO.pos[1] = _gpPos.y + _v4.y * 0.8; _puffO.pos[2] = _gpPos.z + _v4.z * 0.8;
      const v = (heavy ? 10 : 7) + rng() * 6;
      _puffO.vel[0] = _v4.x * 3 + sx * v; _puffO.vel[1] = _v4.y * 3 + (rng() - 0.5); _puffO.vel[2] = _v4.z * 3 + sz * v;
      _puffO.life = (heavy ? 1.6 : 0.9) + rng() * 0.6; _puffO.size0 = 0.4 * k; _puffO.size1 = (heavy ? 2.4 : 1.4) * k;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.2;
      col3(heavy ? 0x8f8a80 : 0xb5b0a6, _puffO.col0); col3(0x9a978f, _puffO.col1);
      _puffO.alpha = heavy ? 0.42 : 0.26; _puffO.grav = 0; _puffO.birthOffset = 0;
      particles.emit('smoke', _puffO);
    }
    flashLight(lightStates[0], _gpPos, MUZZLE_LIGHT_PEAK * (heavy ? 0.5 : 0.18) * muzzleLightScale, 0);
  }

  /** the covered warm's trail (warmProjectilePresentation) */
  const WARM_TRAIL_KEY = -7;

  /**
   * (FX lane 10-14) A missile's smoke trail this frame: the points its nozzle passed since the last frame (on this frame's
   * path, each where the steering had it and when it passed), then the nozzle itself, so the smoke is born at the
   * nozzle with no gap. A round first seen in flight starts its trail up to 60 m back. The trail outlives the round:
   * it ends where the round struck (or was last seen) and dissolves there.
   */
  function layTrail(trail: GuidedTrail, look: MissileLook, shell: LiveShell, d: number, t: number, speed: number,
    seedU: number, dir: THREE.Vector3, drawnD = d): void {
    const base: MissileTrail | null = missileTrailOf(look);
    if (!base) return;
    // (ac130-fx-228 r2) the gunship's own missile: its smoke, born 8 m from the gimbal lens, thins out near the camera
    const tl = trail.pylon ? (trail.lensK !== undefined ? lensTrailOf(base) : gunshipTrailOf(base)) : base;
    const key = trail.seed as number;
    let slot = trail.smokeSlot ?? -1;
    if (slot < 0 || smokeTrails.slotOf(key) !== slot) {
      slot = smokeTrails.begin(key, smokeTrails.lookIndex(tl), seedU);
      trail.smokeSlot = slot;
      trail.nextSmokeD = Math.max(look.igniteM, drawnD - 60);
    }
    const seg = shell.prevPos ? shell.pos.distanceTo(shell.prevPos) : 0;
    const motorBack = trail.tailM ?? 1.3;
    const timed = Number.isFinite(shell.ageS) || Number.isFinite(shell.distM);
    const now = particles.getTime();
    // seconds since the flight motor lit (its boost phase) at a point the nozzle passed `back` metres ago
    const igniteS = look.igniteM / speed;
    const stepM = Math.max(smokeTrails.stepOf(slot), TRAIL_STEP_M, speed / 90);
    // (ac130-barrels-230 r2) laid only as far as the drawn round (easing off the lens's rail, it is behind the
    // simulation's), each point where the line passed it
    let next = Math.max(trail.nextSmokeD as number, look.igniteM, drawnD - 60);
    let n = 0;
    while (next <= drawnD && n < 64) {
      const back = d - next;
      // along this frame's path (its curve) where it reaches, straight back along the line beyond
      if (shell.prevPos && seg > 1e-3 && back <= seg) _v6.copy(shell.pos).lerp(shell.prevPos, back / seg);
      else _v6.copy(shell.pos).addScaledVector(dir, -back);
      missileWobble(look, timed ? Math.max(0, t - back / speed) : 0, seedU, _wob);
      _v6.addScaledVector(_mSide, _wob[0]).addScaledVector(_mUp, _wob[1]).addScaledVector(dir, -motorBack);
      // (ac130-fx-228 r2) a gunship missile's smoke where its drawn body passed (off the pylon)
      if (trail.pylon) { const k = pylonK(next, trail.pylonM); _v6.x += trail.pylon[0] * k; _v6.y += trail.pylon[1] * k; _v6.z += trail.pylon[2] * k; }
      smokeTrails.point(slot, _v6.x, _v6.y, _v6.z, now - back / speed, timed ? Math.max(0, t - back / speed - igniteS) : 99);
      next += stepM;
      n++;
    }
    trail.nextSmokeD = next;
    // the nozzle now, on the drawn body's axis
    smokeTrails.head(slot, _mPos.x - _mDir.x * motorBack, _mPos.y - _mDir.y * motorBack, _mPos.z - _mDir.z * motorBack, now,
      timed ? Math.max(0, t - igniteS) : 99);
  }

  /** the round is gone: its trail ends where it struck (or where its nozzle was last) and dissolves there */
  function endTrail(id: ShellId | null | undefined, pos?: WireVec3 | null): void {
    if (id == null) return;
    const slot = smokeTrails.slotOf(idSeed(id));
    if (slot >= 0) smokeTrails.end(slot, particles.getTime(), pos?.[0], pos?.[1], pos?.[2]);
  }


  const drawAmbientRound: AmbientRoundDraw = (hx, hy, hz, dx, dy, dz, speedMps, travelledM, k, east) =>
    tracers.ambient(hx, hy, hz, dx, dy, dz, speedMps, travelledM, k, east);

  function writeLiveShellTracers(shells: LiveShell[], camera: THREE.Camera): void {
    camera.getWorldPosition(_flareCam);
    flareCamSet = true;
    setGunshipTrailNear(_flareCam);
    heatCamera = imagesHeat(camera);
    drones.begin(particles.getTime(), camera.position);
    tracers.begin(_flareCam); // atmospherics lane; (ac130-fx-228 r3) the eye, for the gunship's lens clearance
    liveAtgmCount = 0;
    bodies.begin();
    renderedAtgmTrailSegments = 0;
    for (const trail of guidedTrails.values()) trail.seen = false;
    // Every live drone, outside the tracer cap: a drone missing from a frame reads as a flight that ended (it flies home).
    for (let index = 0; index < shells.length; index++) {
      const shell = shells[index];
      if (shell.dead || shell.spec?.tracer !== 'DRONE') continue;
      // The pilot's FPV lens sits inside its own airframe; every other view keeps the silhouette, however close.
      const owner=decalEntityFor(shell.shooterId),flyer=owner?.aerial;
      const hidden=droneHiddenFromCamera(shell.pos, shell.shooterId, flyer?.active === true, camera);
      drones.write(shell.pos,shell.vel,shell.id,flyer?.active?flyer.yaw:undefined,shell.ageS,owner?.spec?.nation,
        owner?.visual?.root?missionAttachmentVisualFrame(owner.visual.root):undefined,shell.shooterId??undefined,hidden);
    }
    liveMissiles = 0;
    for (let i = 0; i < shells.length; i++) {
      const sh = shells[i];
      if (!sh.dead && (sh.spec?.guided || sh.rocket === true)) liveMissiles++;
    }
    for (let index = 0; index < shells.length; index++) {
      const shell = shells[index];
      if (shell.dead) continue;
      if (shell.spec?.tracer === 'DRONE') continue;
      // atmospherics lane: a ballistic round's tracer (the gunship's autocannon and howitzer rounds too: their own
      // classes, projectileTracers.ts tracerRoundClass)
      if (!shell.spec?.guided && shell.rocket !== true) { tracers.write(shell); continue; }
      // (fx 9a) a missile or rocket draws its own look (the gunship's: the hellfire, missileLooks.ts)
      _v1.copy(shell.vel).normalize();
      writeMissile(shell);
    }
    // (ac130-fx-228 r2) the backdrop's rounds that are not shells (the frontline's AA fire) in the same tracer look
    ambientRoundSource()?.drawRounds(drawAmbientRound);
    tracers.end(); // atmospherics lane
    drones.end();
  }

  function commitAtgmInstances(): void {
    bodies.end();
    atgmFlares.count = liveAtgmCount;
    renderedAtgmBodies = liveAtgmCount;
    if (liveAtgmCount > 0 || atgmFlares.userData.lastCount > 0) {
      atgmFlares.instanceMatrix.needsUpdate = true;
      if (atgmFlares.instanceColor) atgmFlares.instanceColor.needsUpdate = true;
    }
    atgmFlares.userData.lastCount = liveAtgmCount;
  }

  /** A missile's record after its round is gone: its wire parts and its trail ends where it was last seen (a networked
   *  round that left the snapshot raised no event here), then the record is dropped. */
  function ageMissileRecords(tickDt: number): void {
    for (const [id, trail] of guidedTrails) {
      if (trail.seen) continue;
      // (FX lane 10-14) a wire-guided round gone with no event here (a networked round that left the snapshot): its
      // wire parts where it was last seen
      if (trail.age === 0 && trail.look) { if (trail.look.wires > 0) partWire(id); endTrail(id); }
      trail.age += tickDt;
      if (trail.age >= MISSILE_RECORD_LINGER_S) guidedTrails.delete(id);
    }
  }


  function emitWetTrackDust(
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    intensity: number,
    waterMask: number,
  ): void {
    // water pass 8 (2026-09-23): the reactive field carries the churn where it has one; the ring prints were
    // the "static PNG" the owner saw following the hull
    if (intensity > 0.06 && !frozen && !heightField?.waterRipplesActive?.()) stampTrackPrint(pos, dir, true);
    if (frozen || rng() > intensity * (0.72 + waterMask * 0.36)) return;
    const gy = heightField?.getWaterSurfaceHeightAt?.(pos.x, pos.z)
      ?? groundY(pos.x, pos.z) + (heightField?.getWaterDepthAt?.(pos.x, pos.z) ?? 0);
    _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.45;
    _puffO.pos[1] = Math.max(pos.y, gy) + 0.20 + waterMask * 0.16;
    _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.45;
    _puffO.vel[0] = -dir.x * (1.8 + intensity * 2.6) + (rng() - 0.5) * 1.2;
    _puffO.vel[1] = 1.15 + intensity * 1.55 + rng() * 0.65;
    _puffO.vel[2] = -dir.z * (1.8 + intensity * 2.6) + (rng() - 0.5) * 1.2;
    _puffO.life = 0.34 + rng() * 0.30;
    _puffO.size0 = 0.10 + intensity * 0.10;
    _puffO.size1 = 0.42 + intensity * 0.54;
    _puffO.rot = rng() * Math.PI * 2;
    _puffO.rotVel = (rng() - 0.5) * 2.2;
    col3(0xd8e2dc, _puffO.col0);
    col3(0x8ca9aa, _puffO.col1);
    _puffO.alpha = (0.12 + intensity * 0.17) * (0.55 + waterMask * 0.45);
    _puffO.grav = -0.85;
    _puffO.birthOffset = 0;
    particles.emit('dust', _puffO);
    // water pass 2 (2026-09-12): fording at speed throws a bow sheet ahead of
    // each track — a pale, fast, short-lived curtain that reads as the hull
    // pushing water, only once the tank is properly in it and moving.
    if (waterMask > 0.35 && intensity > 0.45 && rng() < 0.7) {
      const push = 2.6 + intensity * 3.4;
      _puffO.pos[0] = pos.x + dir.x * 1.3 + (rng() - 0.5) * 0.5;
      _puffO.pos[1] = gy + 0.12;
      _puffO.pos[2] = pos.z + dir.z * 1.3 + (rng() - 0.5) * 0.5;
      _puffO.vel[0] = dir.x * push + (rng() - 0.5) * 1.4;
      _puffO.vel[1] = 2.3 + intensity * 1.6 + rng() * 0.8;
      _puffO.vel[2] = dir.z * push + (rng() - 0.5) * 1.4;
      _puffO.life = 0.42 + rng() * 0.26;
      _puffO.size0 = 0.35 + intensity * 0.25;
      _puffO.size1 = 1.3 + intensity * 0.9;
      _puffO.rot = rng() * Math.PI * 2;
      _puffO.rotVel = (rng() - 0.5) * 1.6;
      col3(0xe6eeec, _puffO.col0);
      col3(0xa9c1c2, _puffO.col1);
      _puffO.alpha = 0.26 + intensity * 0.18;
      _puffO.grav = -6.5;
      _puffO.birthOffset = 0;
      particles.emit('dust', _puffO);
    }
    if (rng() >= 0.82) return;
    _strkO.pos[0] = pos.x + (rng() - 0.5) * 0.35;
    _strkO.pos[1] = Math.max(pos.y, gy) + 0.22;
    _strkO.pos[2] = pos.z + (rng() - 0.5) * 0.35;
    _strkO.vel[0] = (rng() - 0.5) * 2.4 - dir.x * intensity;
    _strkO.vel[1] = 2.1 + rng() * 2.2;
    _strkO.vel[2] = (rng() - 0.5) * 2.4 - dir.z * intensity;
    _strkO.life = 0.25 + rng() * 0.24;
    _strkO.width = 0.018 + rng() * 0.012;
    _strkO.stretch = 0.022;
    _strkO.grav = -13.5;
    col3(0xb7d0cf, _strkO.col);
    _strkO.alpha = 0.34 + rng() * 0.20;
    _strkO.seed = rng();
    _strkO.birthOffset = 0;
    particles.emit('sparks', _strkO);
  }

  // destruction-fx: the media tier's track skirt, none past ~260 m, and at most SKIRT_BUDGET bodies alive at once (each
  // lives ~3-5 s) so a column of moving hulls never crowds the media pool the bursts draw from.
  // EF.01 (the owner, 2026-10-12: "separated into little clouds ... instead of being continuous"): deploy 208 raised a
  // body on a coin toss per dust() call (one per ~2-6 m of a track, Poisson-spaced); each track now lays one every
  // trackSkirtSpacing() metres of its own travel (trailCadence: even at any frame rate), sized so neighbours overlap.
  // Past 60 % of the budget the bodies grow and space out together (fewer, wider, still touching) before the cap.
  const SKIRT_BUDGET = 240;
  const skirtBirths = new Float64Array(SKIRT_BUDGET);
  let skirtHead = 0, skirtCount = 0;
  // the trail sources: each track's contact (skirt) and each engine's stack (exhaust), matched by place
  const TRAIL_SKIRT = 0, TRAIL_EXHAUST = 1;
  // an engine's billow bursts (exhaust): the rate while one lasts, a rise of the load that starts one, how long it lasts
  // and the rest before the next can start
  const EXHAUST_BURST_RATE = 9, EXHAUST_THROTTLE_UP = 0.3, EXHAUST_BURST_S = 0.7, EXHAUST_BURST_REST_S = 1.5;
  const fxTrails = createTrailCadence(96);
  function mediaTrackSkirt(pos: THREE.Vector3, dir: THREE.Vector3, intensity: number, groundType: string,
    surface: number, gy: number): void {
    if (!blast) return;
    const k = surface === 2 ? 1.6 : groundType === 'hard' ? 0.7 : 0.55;
    const cam = engineCtx && engineCtx.camera;
    if (cam && cam.position.distanceToSquared(_camV.set(pos.x, gy, pos.z)) > 260 * 260) return;
    const now = particles.getTime();
    while (skirtCount > 0 && now - skirtBirths[skirtHead] > 6) { skirtHead = (skirtHead + 1) % SKIRT_BUDGET; skirtCount--; }
    const spread = 1 + 1.5 * Math.max(0, skirtCount / SKIRT_BUDGET - 0.6) / 0.4;
    const spacing = trackSkirtSpacing(intensity, k, distBoost(pos.x, gy, pos.z) * spread);
    const n = fxTrails.step(TRAIL_SKIRT, pos.x, pos.z, now, spacing, 0, 3);
    const births = fxTrails.births;
    const kind = surface === 2 ? 'sand' : groundType === 'hard' ? 'concrete' : 'soil';
    for (let i = 0; i < n && skirtCount < SKIRT_BUDGET; i++) {
      const ageS = births[i * 3 + 2];
      skirtBirths[(skirtHead + skirtCount) % SKIRT_BUDGET] = now - ageS;
      skirtCount++;
      trackSkirt(blast, births[i * 3], gy, births[i * 3 + 1], dir.x, dir.z, intensity, kind, k, -ageS, spread);
    }
  }

  function drySurfaceMultiplier(groundType: string): number {
    if (groundType === 'hard') return 1.5;
    if (groundType === 'soft') return 1.2;
    return 1.9;
  }

  let dustSizeCap = 1;
  let dustAlphaCap = 1;
  let dustColor0 = 0xa8a189;
  let dustColor1 = 0x8e8a6c;

  function updateDustCameraCaps(pos: THREE.Vector3): void {
    let cameraFactor = 1;
    const camera = engineCtx.camera;
    if (camera) {
      _camV.set(pos.x, pos.y, pos.z).sub(camera.position);
      cameraFactor = THREE.MathUtils.clamp((_camV.length() - 6) / 12, 0, 1);
    }
    dustSizeCap = 0.62 + 0.38 * cameraFactor;
    dustAlphaCap = 0.55 + 0.45 * cameraFactor;
  }

  function updateDryDustColors(groundType: string): void {
    // (EF.12) the dry table in the map's own ground colour (mapPalette.ts; the table's own with no light model)
    if (groundType === 'hard') {
      dustColor0 = mapTintHex(0xa79d8c);
      dustColor1 = mapTintHex(0x8f887b);
      return;
    }
    if (groundType === 'soft') {
      dustColor0 = mapTintHex(0x6d675a);
      dustColor1 = mapTintHex(0x5c574c);
      return;
    }
    dustColor0 = mapTintHex(0xa8a189);
    dustColor1 = mapTintHex(0x8e8a6c);
  }

  function emitTrackKick(
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    intensity: number,
    groundType: string,
    gy: number,
  ): void {
    const kickRate = groundType === 'hard' ? 0.5 : 0.45;
    if (rng() >= kickRate) return;
    _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.5;
    _puffO.pos[1] = Math.max(pos.y, gy) + (groundType === 'hard' ? 0.35 : 0.7);
    _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.5;
    _puffO.vel[0] = -dir.x * (3.5 + rng() * 3) + (rng() - 0.5) * 1.2;
    _puffO.vel[1] = 1.6 + rng() * 1.6 * intensity;
    _puffO.vel[2] = -dir.z * (3.5 + rng() * 3) + (rng() - 0.5) * 1.2;
    _puffO.life = 0.8 + rng() * 0.5;
    _puffO.size0 = 0.35;
    _puffO.size1 = 1.3 + intensity * 1.1;
    _puffO.rot = rng() * Math.PI * 2;
    _puffO.rotVel = (rng() - 0.5) * 3;
    if (groundType === 'hard') {
      col3(dustColor0, _puffO.col0);
      col3(dustColor1, _puffO.col1);
    } else {
      col3(0x57513f, _puffO.col0);
      col3(0x655e4c, _puffO.col1);
    }
    _puffO.alpha = (0.28 + 0.28 * intensity) * dustAlphaCap;
    _puffO.grav = -1.2;
    _puffO.birthOffset = 0;
    particles.emit('dust', _puffO);
    if (groundType === 'hard' || rng() >= 0.55) return;
    _debO.pos[0] = pos.x;
    _debO.pos[1] = Math.max(pos.y, gy) + 0.5;
    _debO.pos[2] = pos.z;
    _debO.vel[0] = -dir.x * (4 + rng() * 4) + (rng() - 0.5) * 2;
    _debO.vel[1] = 2.5 + rng() * 3 * intensity;
    _debO.vel[2] = -dir.z * (4 + rng() * 4) + (rng() - 0.5) * 2;
    _debO.life = 0.9;
    _debO.scale = 0.05 + rng() * 0.05;
    _debO.spin = 12 + rng() * 14;
    _debO.axis[0] = rng() - 0.5;
    _debO.axis[1] = rng() - 0.5;
    _debO.axis[2] = rng() - 0.5;
    _debO.groundY = gy;
    _debO.hot = false;
    _debO.seed = rng();
    _debO.birthOffset = 0;
    particles.emit('debris', _debO);
  }

  function emitDryTrackWake(
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    intensity: number,
    groundType: string,
    gy: number,
    surfaceMultiplier: number,
    sizeVariation: number,
    alphaVariation: number,
  ): void {
    _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.6;
    _puffO.pos[1] = Math.max(pos.y, gy) + (groundType === 'hard' ? 0.55 : 0.95) + rng() * 0.35;
    _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.6;
    const inheritedSpeed = intensity * 2.4;
    _puffO.vel[0] = dir.x * inheritedSpeed - dir.x * (1.5 + rng() * 1.8)
      + (rng() - 0.5) * 1.3 + COLUMN_WIND_X * 0.55;
    _puffO.vel[1] = 0.9 + (1.4 + rng() * 1.3) * intensity;
    _puffO.vel[2] = dir.z * inheritedSpeed - dir.z * (1.5 + rng() * 1.8)
      + (rng() - 0.5) * 1.3 + COLUMN_WIND_Z * 0.55;
    _puffO.life = 3.0 + rng() * 2.6;
    _puffO.size0 = (0.4 + intensity * 0.7) * sizeVariation;
    _puffO.size1 = Math.min(
      5.2,
      (2.4 + intensity * 3.4 + rng() * 1.2)
        * sizeVariation * Math.min(surfaceMultiplier, 1.25),
    ) * dustSizeCap;
    _puffO.rot = rng() * Math.PI * 2;
    _puffO.rotVel = (rng() - 0.5) * 2.4;
    col3(dustColor0, _puffO.col0);
    col3(dustColor1, _puffO.col1);
    const maxAlpha = groundType === 'hard' ? 0.42 : 0.58;
    const baseAlpha = groundType === 'hard'
      ? 0.14 + 0.32 * intensity
      : 0.26 + 0.36 * intensity;
    _puffO.alpha = Math.min(maxAlpha, baseAlpha * alphaVariation * 1.18) * dustAlphaCap;
    _puffO.grav = -0.10;
    _puffO.birthOffset = 0;
    particles.emit('dust', _puffO);
  }

  /**
   * A paved street's track grit (the s92 note): grit and old dust ground out of the joints at the track's contact — low,
   * small and short, grey in the street's own dust colour, settling at once — so a column on the setts trails a faint
   * continuous haze at its tracks instead of the earth wake. Same dust pool, no allocation.
   */
  function emitStreetGrit(pos: THREE.Vector3, dir: THREE.Vector3, intensity: number, gy: number): void {
    updateDryDustColors('hard');
    _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.5;
    _puffO.pos[1] = gy + 0.15 + rng() * 0.1;
    _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.5;
    _puffO.vel[0] = -dir.x * (1.0 + intensity * 1.6) + (rng() - 0.5) * 0.7 + COLUMN_WIND_X * 0.4;
    _puffO.vel[1] = 0.18 + intensity * 0.45 + rng() * 0.15;
    _puffO.vel[2] = -dir.z * (1.0 + intensity * 1.6) + (rng() - 0.5) * 0.7 + COLUMN_WIND_Z * 0.4;
    _puffO.life = 0.5 + rng() * 0.4;
    _puffO.size0 = (0.18 + intensity * 0.12) * dustSizeCap;
    _puffO.size1 = (0.7 + intensity * 0.6 + rng() * 0.25) * dustSizeCap;
    _puffO.rot = rng() * Math.PI * 2;
    _puffO.rotVel = (rng() - 0.5) * 1.2;
    col3(dustColor0, _puffO.col0);
    col3(dustColor1, _puffO.col1);
    _puffO.alpha = (0.07 + intensity * 0.09) * dustAlphaCap;
    _puffO.grav = -1.4;
    _puffO.birthOffset = 0;
    particles.emit('dust', _puffO);
  }

  /** One low contact puff replaces the large earth wake; same dust pool. */
  function emitTrackPowder(
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    intensity: number,
    gy: number,
    surface: TrackSurface,
  ): void {
    const snow = surface === 3;
    _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.4;
    _puffO.pos[1] = gy + 0.12;
    _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.4;
    _puffO.vel[0] = -dir.x * (0.8 + intensity * 1.4) + (rng() - 0.5) * 0.8;
    _puffO.vel[1] = 0.25 + intensity * 0.7 + rng() * 0.2;
    _puffO.vel[2] = -dir.z * (0.8 + intensity * 1.4) + (rng() - 0.5) * 0.8;
    _puffO.life = snow ? 0.46 + rng() * 0.28 : 0.28 + rng() * 0.25;
    _puffO.size0 = (0.12 + intensity * 0.1) * dustSizeCap;
    _puffO.size1 = (snow ? 0.68 + intensity * 0.58 : 0.42 + intensity * 0.44) * dustSizeCap;
    _puffO.rot = rng() * Math.PI * 2;
    _puffO.rotVel = (rng() - 0.5) * 1.2;
    col3(snow ? 0xdde4e8 : 0xc7b38d, _puffO.col0);
    col3(snow ? 0xb2c1cd : 0xa28f6d, _puffO.col1);
    _puffO.alpha = (0.1 + intensity * 0.12) * dustAlphaCap;
    _puffO.grav = snow ? -0.65 : -1.8;
    _puffO.birthOffset = 0;
    particles.emit('dust', _puffO);
  }

  function emitUpperTrackWake(
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    intensity: number,
    gy: number,
  ): void {
    _puffO.pos[0] = pos.x - dir.x * 1.2 + (rng() - 0.5) * 0.5;
    _puffO.pos[1] = Math.max(pos.y, gy) + 1.15 + rng() * 0.4;
    _puffO.pos[2] = pos.z - dir.z * 1.2 + (rng() - 0.5) * 0.5;
    _puffO.vel[0] = dir.x * intensity * 1.6 + (rng() - 0.5) + COLUMN_WIND_X * 0.6;
    _puffO.vel[1] = 1.5 + rng() * 1.2 * intensity;
    _puffO.vel[2] = dir.z * intensity * 1.6 + (rng() - 0.5) + COLUMN_WIND_Z * 0.6;
    _puffO.life = 2.6 + rng() * 1.6;
    _puffO.size0 = 0.8 + intensity * 0.5;
    _puffO.size1 = Math.min(5.6, 3.0 + intensity * 2.6 + rng() * 1.2) * dustSizeCap;
    _puffO.rot = rng() * Math.PI * 2;
    _puffO.rotVel = (rng() - 0.5) * 2.0;
    col3(0xa8a189, _puffO.col0);
    col3(0x8a876f, _puffO.col1);
    _puffO.alpha = Math.min(0.56, 0.34 + 0.34 * intensity) * dustAlphaCap;
    _puffO.grav = -0.06;
    _puffO.birthOffset = 0;
    particles.emit('dust', _puffO);
  }

  function rebaseFxClock(atTimeS: number, exact = false): void {
    const delta = atTimeS - particles.getTime();
    if (exact ? delta === 0 : Math.abs(delta) <= 20) return;
    particles.shiftTime(delta);
    vol?.shiftTime(delta);
    smokeTrails.shiftTime(delta);
    wires.shiftTime(delta);
    chunks?.shiftTime(delta);
    craters?.shiftTime(delta);
    mapCraterMarks?.shiftTime(delta);
    structMask?.shiftTime(delta);
    structDebris?.shiftTime(delta);
    rubble?.shiftTime(delta);
    stages?.shiftTime(delta);
    fractureStages?.shiftTime(delta);
    tracers.shiftTime(delta);
    for (const state of lightStates) state.bornAt += delta;
    for (const ring of shockRings) ring.bornAt += delta;
    for (const ring of muzzleRings) ring.bornAt += delta;
    const births = printBirth.array;
    for (let index = 0; index < births.length; index++) {
      if (births[index] > -1e8) births[index] += delta;
    }
    printBirth.clearUpdateRanges();
    printBirth.addUpdateRange(0, births.length);
    printBirth.needsUpdate = true;
    lastTickS += delta;
    noteFxClockShift(delta);
  }

  type PropBreakFamily =
    | 'drumblast'
    | 'woodbuilding'
    | 'vehicleburn'
    | 'vehiclecrush'
    | 'vehiclewreck'
    | 'canvasbuilding'
    | 'metalbuilding'
    | 'masonry'
    | 'sandbag'
    | 'vehicle'
    | 'canvas'
    | 'ammo'
    | 'wood'
    | 'hay'
    | 'barrel'
    | 'pot'
    | 'metal';

  function propBreakFamily(kind: string): PropBreakFamily {
    if (kind === 'drumblast') return 'drumblast';
    if (kind === 'vehicleburn') return 'vehicleburn';
    if (kind === 'vehiclecrush' || kind === 'vehiclewreck') return kind;
    // (the destructible-kits lane, 2026-10-11: a pillbox threw planks; props.ts names the map's make on the bunker's
    // break, 'bunker-concrete' or 'bunker-logearth': cast concrete breaks as masonry, a log-and-earth work as timber)
    if (/^bunker/.test(kind)) return kind === 'bunker-logearth' ? 'wood' : 'masonry';
    if (/fieldhut|leanto|huntingblind|fishershack|saunahut|alpinerefuge|stilthouse|longhouse/.test(kind)) return 'woodbuilding';
    if (/deserttent|commandtent|fieldhospital/.test(kind)) return 'canvasbuilding';
    if (/guardpost|motorpool|quonsethut|transformershed|checkpointhut/.test(kind)) return 'metalbuilding';
    // (2026-10-09: the pillbox is concrete — it fell through to 'wood' and broke into splinters and wood dust)
    if (/^wall|rubble|small-rock|^bunker$|pillbox/.test(kind)) return 'masonry';
    // (the looks lane: the stone and mud walls' gates break as their piers do)
    if (/^gatestone$|^gateadobe$/.test(kind)) return 'masonry';
    if (/^sandbag/.test(kind)) return 'sandbag';
    if (/truck|jeep/.test(kind)) return 'vehicle';
    if (kind === 'tent') return 'canvas';
    if (kind === 'ammobox') return 'ammo';
    if (/^fence|^gate|crate|pallet|cart|stall|bench|trough|firewood|sled|rugframe/.test(kind)) return 'wood';
    if (/bale|stook|hay/.test(kind)) return 'hay';
    if (kind === 'barrel') return 'barrel';
    if (kind === 'pot') return 'pot';
    if (/lamp|drum|churn|hedgehog/.test(kind)) return 'metal';
    return 'wood';
  }

  function emitBuildingBreak(
    family: 'woodbuilding' | 'canvasbuilding' | 'metalbuilding',
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    heightM: number,
    gy: number,
  ): void {
    const canvas = family === 'canvasbuilding';
    const metal = family === 'metalbuilding';
    if (metal) {
      _v3.set(pos.x, gy + Math.min(1.8, heightM * 0.42), pos.z);
      sparkFan(_v3, _UP, 12, 9, 1.3, 0xffc980, 0.5, 0.035, 0.045, 0, 0.14);
    }
    const fragmentCount = canvas ? 8 : metal ? 13 : 17;
    for (let i = 0; i < fragmentCount; i++) {
      const a = rng() * Math.PI * 2;
      _debO.pos[0] = pos.x + (rng() - 0.5) * 2.8;
      _debO.pos[1] = gy + 0.35 + rng() * Math.min(2.4, heightM * 0.55);
      _debO.pos[2] = pos.z + (rng() - 0.5) * 2.8;
      _debO.vel[0] = dir.x * (2.2 + rng() * 3.4) + Math.cos(a) * (1.2 + rng() * 3.5);
      _debO.vel[1] = 2.0 + rng() * 4.2;
      _debO.vel[2] = dir.z * (2.2 + rng() * 3.4) + Math.sin(a) * (1.2 + rng() * 3.5);
      _debO.life = 1.5 + rng() * 0.6;
      _debO.scale = (canvas ? 0.06 : 0.09) + rng() * (canvas ? 0.07 : 0.13);
      _debO.spin = 8 + rng() * 18;
      _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
      _debO.groundY = gy; _debO.hot = metal && rng() < 0.12 ? 0.35 : 0;
      _debO.seed = rng(); _debO.birthOffset = 0;
      particles.emit('debris', _debO);
    }
    const dustA = canvas ? 0xa89b7d : metal ? 0x777979 : 0x8a745e;
    const dustB = canvas ? 0x82775f : metal ? 0x55595a : 0x675444;
    for (let i = 0; i < 12; i++) {
      const a = rng() * Math.PI * 2;
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 3.6;
      _puffO.pos[1] = gy + 0.18 + rng() * 0.9;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 3.6;
      _puffO.vel[0] = Math.cos(a) * (1.8 + rng() * 3.0) + dir.x * 2.0;
      _puffO.vel[1] = 0.8 + rng() * 1.5;
      _puffO.vel[2] = Math.sin(a) * (1.8 + rng() * 3.0) + dir.z * 2.0;
      _puffO.life = 1.6 + rng() * 1.2;
      _puffO.size0 = 0.75 + rng() * 0.5; _puffO.size1 = 3.2 + rng() * 2.2;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.7;
      col3(dustA, _puffO.col0); col3(dustB, _puffO.col1);
      _puffO.alpha = 0.42 + rng() * 0.15; _puffO.grav = -0.38; _puffO.birthOffset = 0;
      particles.emit('dust', _puffO);
    }
  }

  function emitMasonryBreak(
    kind: string,
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    heightM: number,
    gy: number,
  ): void {
    const adobe = /adobe/.test(kind);
    const dustA = adobe ? 0xa58a64 : 0x8d877b;
    const dustB = adobe ? 0x86704f : 0x6f695e;
    for (let i = 0; i < 15; i++) {
      _debO.pos[0] = pos.x + (rng() - 0.5) * 1.6;
      _debO.pos[1] = gy + 0.25 + rng() * Math.min(1.0, heightM * 0.8);
      _debO.pos[2] = pos.z + (rng() - 0.5) * 1.6;
      _debO.vel[0] = dir.x * (2.2 + rng() * 2.6) + (rng() - 0.5) * 3.6;
      _debO.vel[1] = 1.8 + rng() * 3.4;
      _debO.vel[2] = dir.z * (2.2 + rng() * 2.6) + (rng() - 0.5) * 3.6;
      _debO.life = 1.5 + rng() * 0.5;
      _debO.scale = 0.10 + rng() * 0.12;
      _debO.spin = 8 + rng() * 14;
      _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
      _debO.groundY = gy; _debO.hot = 0; _debO.seed = rng(); _debO.birthOffset = 0;
      particles.emit('debris', _debO);
    }
    for (let i = 0; i < 11; i++) {
      const a = rng() * Math.PI * 2;
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 1.8;
      _puffO.pos[1] = gy + 0.3 + rng() * 0.7;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 1.8;
      _puffO.vel[0] = Math.cos(a) * (1.8 + rng() * 2.4) + dir.x * 2.2;
      _puffO.vel[1] = 1.0 + rng() * 1.5;
      _puffO.vel[2] = Math.sin(a) * (1.8 + rng() * 2.4) + dir.z * 2.2;
      _puffO.life = 1.6 + rng() * 1.1;
      _puffO.size0 = 0.7 + rng() * 0.4; _puffO.size1 = 2.8 + rng() * 1.5;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.8;
      col3(dustA, _puffO.col0); col3(dustB, _puffO.col1);
      _puffO.alpha = 0.46 + rng() * 0.16; _puffO.grav = -0.42; _puffO.birthOffset = 0;
      particles.emit('dust', _puffO);
    }
  }

  /**
   * The phone tier's beat for a structure stage (no volume media there): main's pooled dust and chips, at the
   * building's own footprint, height and rubble colour. A breach throws a masonry burst out of the struck face; a
   * collapse bursts dust out of its base on every side, raises a column over the footprint, throws chips along the
   * blow and lets the settling dust hang.
   */
  function phoneStageBeat(e: StructureStageEvent): void {
    const lk = lookOf(e.structureId);
    // the dominant rubble colour (linear), lifted toward a dust grey; masonry grey when nothing is known
    let dr = 0.27, dg = 0.25, db = 0.21;
    if (lk && lk.rubble.length) {
      let best = lk.rubble[0];
      for (const sh of lk.rubble) if (sh.share > best.share) best = sh;
      dr = best.color[0] * 0.55 + 0.12; dg = best.color[1] * 0.55 + 0.115; db = best.color[2] * 0.55 + 0.1;
    }
    if (e.stage === 'breached') {
      _v3.set(e.x, e.y, e.z);
      _v4.set(e.dirX, 0, e.dirZ);
      emitMasonryBreak('wall', _v3, _v4, 2.2, groundY(e.x, e.z));
      return;
    }
    if (e.stage !== 'collapsed') return;
    const gy = e.baseY;
    const h = Math.max(2, e.topY - e.baseY);
    const cy = Math.cos(e.yaw), sy = Math.sin(e.yaw);
    // dust out of the base on every side, rolling outward low
    const ring = Math.min(22, Math.max(10, Math.round((e.hw + e.hd) * 1.1)));
    for (let i = 0; i < ring; i++) {
      const t = (i + rng() * 0.6) / ring;
      // a point on the footprint's perimeter (body frame), then the outward push
      const per = t * 4;
      const side = Math.floor(per);
      const f = per - side;
      let bx: number, bz: number, ox: number, oz: number;
      if (side === 0) { bx = -e.hw + f * 2 * e.hw; bz = -e.hd; ox = 0; oz = -1; }
      else if (side === 1) { bx = e.hw; bz = -e.hd + f * 2 * e.hd; ox = 1; oz = 0; }
      else if (side === 2) { bx = e.hw - f * 2 * e.hw; bz = e.hd; ox = 0; oz = 1; }
      else { bx = -e.hw; bz = e.hd - f * 2 * e.hd; ox = -1; oz = 0; }
      const wx = e.cx + bx * cy + bz * sy, wz = e.cz - bx * sy + bz * cy;
      const vx = ox * cy + oz * sy, vz = -ox * sy + oz * cy;
      const sp = 2.4 + rng() * 2.2;
      _puffO.pos[0] = wx; _puffO.pos[1] = gy + 0.6 + rng() * 0.8; _puffO.pos[2] = wz;
      _puffO.vel[0] = vx * sp + e.dirX * 1.2; _puffO.vel[1] = 0.3 + rng() * 0.5; _puffO.vel[2] = vz * sp + e.dirZ * 1.2;
      _puffO.life = 3.2 + rng() * 1.8;
      _puffO.size0 = 1.6 + rng() * 0.8; _puffO.size1 = 5.5 + rng() * 2.5;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 0.8;
      _puffO.col0[0] = dr * 1.08; _puffO.col0[1] = dg * 1.08; _puffO.col0[2] = db * 1.08;
      _puffO.col1[0] = dr * 0.9; _puffO.col1[1] = dg * 0.9; _puffO.col1[2] = db * 0.9;
      _puffO.alpha = 0.38 + rng() * 0.12; _puffO.grav = -0.12; _puffO.birthOffset = 0.15 + rng() * 0.35;
      particles.emit('dust', _puffO);
    }
    // the column over the footprint as the walls go down
    for (let i = 0; i < 8; i++) {
      const k = i / 7;
      _puffO.pos[0] = e.cx + (rng() - 0.5) * e.hw; _puffO.pos[1] = gy + 1 + k * h * 0.6; _puffO.pos[2] = e.cz + (rng() - 0.5) * e.hd;
      _puffO.vel[0] = e.dirX * 0.6 + (rng() - 0.5) * 0.6; _puffO.vel[1] = 1.6 + rng() * 1.6; _puffO.vel[2] = e.dirZ * 0.6 + (rng() - 0.5) * 0.6;
      _puffO.life = 4.5 + rng() * 2;
      _puffO.size0 = 2.5 + k * 1.5; _puffO.size1 = 7 + rng() * 3 + k * 2;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 0.5;
      _puffO.col0[0] = dr; _puffO.col0[1] = dg; _puffO.col0[2] = db;
      _puffO.col1[0] = dr * 0.92; _puffO.col1[1] = dg * 0.92; _puffO.col1[2] = db * 0.92;
      _puffO.alpha = 0.32 + rng() * 0.1; _puffO.grav = -0.18; _puffO.birthOffset = 0.3 + k * 0.5;
      particles.emit('dust', _puffO);
    }
    // chips along the blow, from across the footprint
    for (let i = 0; i < 14; i++) {
      _debO.pos[0] = e.cx + (rng() - 0.5) * e.hw * 1.6; _debO.pos[1] = gy + 0.5 + rng() * h * 0.5; _debO.pos[2] = e.cz + (rng() - 0.5) * e.hd * 1.6;
      _debO.vel[0] = e.dirX * (1.5 + rng() * 3) + (rng() - 0.5) * 4;
      _debO.vel[1] = 1 + rng() * 3;
      _debO.vel[2] = e.dirZ * (1.5 + rng() * 3) + (rng() - 0.5) * 4;
      _debO.life = 1.6 + rng() * 0.6; _debO.scale = 0.12 + rng() * 0.16; _debO.spin = 6 + rng() * 12;
      _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
      _debO.groundY = gy; _debO.hot = 0; _debO.seed = rng(); _debO.birthOffset = 0.1 + rng() * 0.5;
      particles.emit('debris', _debO);
    }
    scheduleDestructionSettlingDust(e.cx, e.cz, gy, 0.6);
  }

  function emitSandbagBreak(pos: THREE.Vector3, dir: THREE.Vector3, gy: number): void {
    for (let i = 0; i < 13; i++) {
      const a = rng() * Math.PI * 2;
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 1.8;
      _puffO.pos[1] = gy + 0.2 + rng() * 0.5;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 1.8;
      _puffO.vel[0] = Math.cos(a) * (1.5 + rng() * 2.2) + dir.x * 2.6;
      _puffO.vel[1] = 0.7 + rng() * 1.0;
      _puffO.vel[2] = Math.sin(a) * (1.5 + rng() * 2.2) + dir.z * 2.6;
      _puffO.life = 1.5 + rng() * 1.0;
      _puffO.size0 = 0.6 + rng() * 0.4; _puffO.size1 = 2.6 + rng() * 1.4;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
      col3(0xa89772, _puffO.col0); col3(0x8a7b5c, _puffO.col1);
      _puffO.alpha = 0.48 + rng() * 0.14; _puffO.grav = -0.55; _puffO.birthOffset = 0;
      particles.emit('dust', _puffO);
    }
    for (let i = 0; i < 4; i++) {
      _debO.pos[0] = pos.x; _debO.pos[1] = gy + 0.4; _debO.pos[2] = pos.z;
      _debO.vel[0] = dir.x * (2 + rng() * 2.5) + (rng() - 0.5) * 3;
      _debO.vel[1] = 1.6 + rng() * 2.0;
      _debO.vel[2] = dir.z * (2 + rng() * 2.5) + (rng() - 0.5) * 3;
      _debO.life = 1.1; _debO.scale = 0.06 + rng() * 0.05; _debO.spin = 10 + rng() * 12;
      _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
      _debO.groundY = gy; _debO.hot = 0; _debO.seed = rng(); _debO.birthOffset = 0;
      particles.emit('debris', _debO);
    }
  }

  function emitVehicleBreak(
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    heightM: number,
    gy: number,
  ): void {
    _v3.set(pos.x, gy + Math.min(1.2, heightM * 0.5), pos.z);
    sparkFan(_v3, _UP, 14, 11, 1.2, 0xffce8a, 0.5, 0.04, 0.04, 0, 0.12);
    for (let i = 0; i < 10; i++) {
      _debO.pos[0] = pos.x + (rng() - 0.5) * 1.4;
      _debO.pos[1] = gy + 0.4 + rng() * Math.min(1.4, heightM * 0.6);
      _debO.pos[2] = pos.z + (rng() - 0.5) * 1.4;
      _debO.vel[0] = dir.x * (2.6 + rng() * 3.2) + (rng() - 0.5) * 4.5;
      _debO.vel[1] = 2.4 + rng() * 3.6;
      _debO.vel[2] = dir.z * (2.6 + rng() * 3.2) + (rng() - 0.5) * 4.5;
      _debO.life = 1.5; _debO.scale = 0.08 + rng() * 0.09; _debO.spin = 10 + rng() * 16;
      _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
      _debO.groundY = gy; _debO.hot = rng() < 0.2 ? 0.45 : 0; _debO.seed = rng(); _debO.birthOffset = 0;
      particles.emit('debris', _debO);
    }
    for (let i = 0; i < 5; i++) {
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 1.2;
      _puffO.pos[1] = gy + 0.7 + rng() * 0.8;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 1.2;
      _puffO.vel[0] = (rng() - 0.5) * 1.2; _puffO.vel[1] = 1.8 + rng() * 1.6; _puffO.vel[2] = (rng() - 0.5) * 1.2;
      _puffO.life = 0.5 + rng() * 0.3;
      _puffO.size0 = 0.5 + rng() * 0.3; _puffO.size1 = 1.1 + rng() * 0.5;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 3;
      col3(0xffb054, _puffO.col0); col3(0xd96a22, _puffO.col1);
      _puffO.alpha = 0.85; _puffO.grav = 0.6; _puffO.birthOffset = 0;
      particles.emit('fire', _puffO);
    }
    for (let i = 0; i < 8; i++) {
      const a = rng() * Math.PI * 2;
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 1.2;
      _puffO.pos[1] = gy + 0.8 + rng() * 0.8;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 1.2;
      _puffO.vel[0] = Math.cos(a) * (0.8 + rng() * 1.2) + dir.x * 1.4;
      _puffO.vel[1] = 1.6 + rng() * 1.6;
      _puffO.vel[2] = Math.sin(a) * (0.8 + rng() * 1.2) + dir.z * 1.4;
      _puffO.life = 1.8 + rng() * 1.2;
      _puffO.size0 = 0.7 + rng() * 0.4; _puffO.size1 = 3.0 + rng() * 1.6;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.6;
      col3(0x2e2b28, _puffO.col0); col3(0x4a4642, _puffO.col1);
      _puffO.alpha = 0.5 + rng() * 0.15; _puffO.grav = 0.25; _puffO.birthOffset = 0;
      particles.emit('smoke', _puffO);
    }
  }

  /**
   * A map car broken (the car-wreck lane, 2026-10-20; Steinburg r5: a run-over car threw the wood family's tan dust cloud
   * and planks, read as an orange ghost): a hull's crunch bursts its glass (a glitter of small pale shards thrown low),
   * scrapes a few sparks off its sheet and kicks a thin skirt of road dust round its sills — no fire and no smoke, a
   * crushed car does not burn. A round's kill (`wreck`) throws its pieces harder, some of them hot, under a short dark
   * puff; its fire and smoke are its burn's column ('vehicleburn').
   */
  function emitVehicleCrunch(pos: THREE.Vector3, dir: THREE.Vector3, heightM: number, gy: number, wreck: boolean): void {
    _v3.set(pos.x, gy + Math.min(0.9, heightM * 0.45), pos.z);
    sparkFan(_v3, _UP, wreck ? 12 : 6, wreck ? 10 : 6, 1.25, 0xffd6a0, 0.35, 0.03, 0.03, 0, 0.1);
    // the glass: small shards, thrown low and along the blow
    for (let i = 0; i < 16; i++) {
      _debO.pos[0] = pos.x + (rng() - 0.5) * 1.6;
      _debO.pos[1] = gy + 0.75 + rng() * Math.min(0.6, heightM * 0.3);
      _debO.pos[2] = pos.z + (rng() - 0.5) * 1.6;
      _debO.vel[0] = dir.x * (1.2 + rng() * 2.2) + (rng() - 0.5) * 3.2;
      _debO.vel[1] = 1.2 + rng() * 2.0;
      _debO.vel[2] = dir.z * (1.2 + rng() * 2.2) + (rng() - 0.5) * 3.2;
      _debO.life = 1.1; _debO.scale = 0.025 + rng() * 0.03; _debO.spin = 14 + rng() * 18;
      _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
      _debO.groundY = gy; _debO.hot = 0; _debO.seed = rng(); _debO.birthOffset = 0;
      particles.emit('debris', _debO);
    }
    // its metal: trim, a mirror, a lamp's bezel (a round's kill throws more, harder, a few of them hot)
    const bits = wreck ? 9 : 4;
    for (let i = 0; i < bits; i++) {
      _debO.pos[0] = pos.x + (rng() - 0.5) * 1.4;
      _debO.pos[1] = gy + 0.4 + rng() * Math.min(1.0, heightM * 0.5);
      _debO.pos[2] = pos.z + (rng() - 0.5) * 1.4;
      const k = wreck ? 1 : 0.55;
      _debO.vel[0] = (dir.x * (2.4 + rng() * 3) + (rng() - 0.5) * 4) * k;
      _debO.vel[1] = (2.2 + rng() * 3.2) * k;
      _debO.vel[2] = (dir.z * (2.4 + rng() * 3) + (rng() - 0.5) * 4) * k;
      _debO.life = 1.5; _debO.scale = 0.06 + rng() * 0.08; _debO.spin = 10 + rng() * 16;
      _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
      _debO.groundY = gy; _debO.hot = wreck && rng() < 0.3 ? 0.45 : 0; _debO.seed = rng(); _debO.birthOffset = 0;
      particles.emit('debris', _debO);
    }
    // the road dust its sills kick: low, settling over a couple of seconds (r1c: "no dust or debris a second after the crush")
    for (let i = 0; i < 7; i++) {
      const a = rng() * Math.PI * 2;
      _puffO.pos[0] = pos.x + Math.cos(a) * (0.8 + rng() * 0.8);
      _puffO.pos[1] = gy + 0.15 + rng() * 0.2;
      _puffO.pos[2] = pos.z + Math.sin(a) * (0.8 + rng() * 0.8);
      _puffO.vel[0] = Math.cos(a) * (0.9 + rng() * 0.8) + dir.x * 0.8;
      _puffO.vel[1] = 0.25 + rng() * 0.35;
      _puffO.vel[2] = Math.sin(a) * (0.9 + rng() * 0.8) + dir.z * 0.8;
      _puffO.life = 1.4 + rng() * 0.8;
      _puffO.size0 = 0.5 + rng() * 0.3; _puffO.size1 = 1.8 + rng() * 0.8;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.5;
      col3(0x7a766e, _puffO.col0); col3(0x6a665f, _puffO.col1);
      _puffO.alpha = 0.26 + rng() * 0.1; _puffO.grav = -0.2; _puffO.birthOffset = 0;
      particles.emit('dust', _puffO);
    }
    if (!wreck) return;
    // a round's kill: a short dark puff out of the burst cabin (the burn's column takes over)
    for (let i = 0; i < 4; i++) {
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 1.0;
      _puffO.pos[1] = gy + 0.9 + rng() * 0.5;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 1.0;
      _puffO.vel[0] = (rng() - 0.5) * 1.0 + dir.x * 0.8; _puffO.vel[1] = 1.4 + rng() * 1.2; _puffO.vel[2] = (rng() - 0.5) * 1.0 + dir.z * 0.8;
      _puffO.life = 1.6 + rng() * 0.8;
      _puffO.size0 = 0.6 + rng() * 0.3; _puffO.size1 = 2.4 + rng() * 1.0;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.6;
      col3(0x2e2b28, _puffO.col0); col3(0x4a4642, _puffO.col1);
      _puffO.alpha = 0.32 + rng() * 0.1; _puffO.grav = 0.25; _puffO.birthOffset = 0;
      particles.emit('smoke', _puffO);
    }
  }

  function emitCanvasBreak(pos: THREE.Vector3, dir: THREE.Vector3, gy: number): void {
    for (let i = 0; i < 9; i++) {
      const a = rng() * Math.PI * 2;
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 1.4;
      _puffO.pos[1] = gy + 0.3 + rng() * 0.9;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 1.4;
      _puffO.vel[0] = Math.cos(a) * (1.4 + rng() * 1.8) + dir.x * 2.0;
      _puffO.vel[1] = 0.9 + rng() * 1.2;
      _puffO.vel[2] = Math.sin(a) * (1.4 + rng() * 1.8) + dir.z * 2.0;
      _puffO.life = 1.3 + rng() * 0.8;
      _puffO.size0 = 0.5 + rng() * 0.3; _puffO.size1 = 2.0 + rng() * 1.0;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
      col3(0xa39676, _puffO.col0); col3(0x857a5e, _puffO.col1);
      _puffO.alpha = 0.4 + rng() * 0.14; _puffO.grav = -0.35; _puffO.birthOffset = 0;
      particles.emit('dust', _puffO);
    }
    for (let i = 0; i < 4; i++) {
      _debO.pos[0] = pos.x; _debO.pos[1] = gy + 0.5; _debO.pos[2] = pos.z;
      _debO.vel[0] = dir.x * (2 + rng() * 2.5) + (rng() - 0.5) * 3.2;
      _debO.vel[1] = 2.0 + rng() * 2.4;
      _debO.vel[2] = dir.z * (2 + rng() * 2.5) + (rng() - 0.5) * 3.2;
      _debO.life = 1.2; _debO.scale = 0.05 + rng() * 0.05; _debO.spin = 12 + rng() * 14;
      _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
      _debO.groundY = gy; _debO.hot = 0; _debO.seed = rng(); _debO.birthOffset = 0;
      particles.emit('debris', _debO);
    }
  }

  function emitAmmoBreak(pos: THREE.Vector3, dir: THREE.Vector3, gy: number): void {
    _v3.set(pos.x, gy + 0.4, pos.z);
    sparkFan(_v3, _UP, 8, 8, 1.0, 0xffd58a, 0.4, 0.03, 0.035, 0, 0.14);
    for (let i = 0; i < 9; i++) {
      _debO.pos[0] = pos.x + (rng() - 0.5) * 0.6;
      _debO.pos[1] = gy + 0.3 + rng() * 0.4;
      _debO.pos[2] = pos.z + (rng() - 0.5) * 0.6;
      _debO.vel[0] = dir.x * (2.4 + rng() * 3.0) + (rng() - 0.5) * 4.0;
      _debO.vel[1] = 2.2 + rng() * 3.0;
      _debO.vel[2] = dir.z * (2.4 + rng() * 3.0) + (rng() - 0.5) * 4.0;
      _debO.life = 1.3; _debO.scale = 0.05 + rng() * 0.06; _debO.spin = 12 + rng() * 16;
      _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
      _debO.groundY = gy; _debO.hot = 0; _debO.seed = rng(); _debO.birthOffset = 0;
      particles.emit('debris', _debO);
    }
  }

  function emitDrumBlast(pos: THREE.Vector3, gy: number): void {
    const cy = gy + 0.7;
    spawnScorch(pos.x, pos.z, 2.4 + rng() * 0.7);
    _puffO.pos[0] = pos.x; _puffO.pos[1] = cy + 0.4; _puffO.pos[2] = pos.z;
    _puffO.vel[0] = 0; _puffO.vel[1] = 0.6; _puffO.vel[2] = 0;
    _puffO.life = 0.22;
    _puffO.size0 = 1.6; _puffO.size1 = 3.6;
    _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = 0;
    col3(0xffe9b8, _puffO.col0); col3(0xffb45e, _puffO.col1);
    _puffO.alpha = 0.95; _puffO.grav = 0; _puffO.birthOffset = 0;
    particles.emit('flash', _puffO);
    for (let i = 0; i < 12; i++) {
      const a = rng() * Math.PI * 2;
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.7;
      _puffO.pos[1] = cy + rng() * 0.7;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.7;
      _puffO.vel[0] = Math.cos(a) * (1.6 + rng() * 2.4);
      _puffO.vel[1] = 2.6 + rng() * 3.0;
      _puffO.vel[2] = Math.sin(a) * (1.6 + rng() * 2.4);
      _puffO.life = 0.5 + rng() * 0.35;
      _puffO.size0 = 0.8 + rng() * 0.5; _puffO.size1 = 2.0 + rng() * 0.9;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 4;
      col3(0xffc262, _puffO.col0); col3(0xe06a1e, _puffO.col1);
      _puffO.alpha = 0.9; _puffO.grav = 1.1; _puffO.birthOffset = 0;
      particles.emit('fire', _puffO);
    }
    for (let i = 0; i < 7; i++) {
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.9;
      _puffO.pos[1] = cy + 0.4 + rng() * 0.9;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.9;
      _puffO.vel[0] = (rng() - 0.5) * 1.6;
      _puffO.vel[1] = 2.2 + rng() * 2.2;
      _puffO.vel[2] = (rng() - 0.5) * 1.6;
      _puffO.life = 1.9 + rng() * 1.3;
      _puffO.size0 = 1.0 + rng() * 0.6; _puffO.size1 = 3.6 + rng() * 1.8;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.4;
      col3(0x241f1b, _puffO.col0); col3(0x45403a, _puffO.col1);
      _puffO.alpha = 0.62; _puffO.grav = 0.35; _puffO.birthOffset = 0;
      particles.emit('billow', _puffO);
    }
    _v3.set(pos.x, cy, pos.z);
    sparkFan(_v3, _UP, 16, 15, 1.15, 0xffc274, 0.55, 0.045, 0.05, 0, 0.1);
    for (let i = 0; i < 10; i++) {
      const a = rng() * Math.PI * 2;
      _debO.pos[0] = pos.x; _debO.pos[1] = cy; _debO.pos[2] = pos.z;
      _debO.vel[0] = Math.cos(a) * (6 + rng() * 7);
      _debO.vel[1] = 3.5 + rng() * 5;
      _debO.vel[2] = Math.sin(a) * (6 + rng() * 7);
      _debO.life = 1.3 + rng() * 0.5;
      _debO.scale = 0.07 + rng() * 0.09;
      _debO.spin = 12 + rng() * 18;
      _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
      _debO.groundY = gy; _debO.hot = rng() < 0.5 ? 1 : 0.45; _debO.seed = rng(); _debO.birthOffset = 0;
      particles.emit('debris', _debO);
    }
  }

  function emitHayBreak(
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    heightM: number,
    gy: number,
  ): void {
    for (let i = 0; i < 12; i++) {
      const a = rng() * Math.PI * 2;
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.8;
      _puffO.pos[1] = gy + 0.3 + rng() * Math.min(1.6, heightM * 0.7);
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.8;
      _puffO.vel[0] = Math.cos(a) * (1.2 + rng() * 1.8) + dir.x * 2.0;
      _puffO.vel[1] = 0.8 + rng() * 1.4;
      _puffO.vel[2] = Math.sin(a) * (1.2 + rng() * 1.8) + dir.z * 2.0;
      _puffO.life = 1.6 + rng() * 1.2;
      _puffO.size0 = 0.5 + rng() * 0.4; _puffO.size1 = 2.0 + rng() * 1.4;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.6;
      col3(0xb59f5e, _puffO.col0); col3(0x93804a, _puffO.col1);
      _puffO.alpha = 0.42 + rng() * 0.14; _puffO.grav = -0.25; _puffO.birthOffset = 0;
      particles.emit('dust', _puffO);
    }
    for (let i = 0; i < 5; i++) {
      _debO.pos[0] = pos.x; _debO.pos[1] = gy + 0.5 + rng() * 0.6; _debO.pos[2] = pos.z;
      _debO.vel[0] = dir.x * (1.5 + rng() * 2) + (rng() - 0.5) * 3;
      _debO.vel[1] = 1.8 + rng() * 2.2;
      _debO.vel[2] = dir.z * (1.5 + rng() * 2) + (rng() - 0.5) * 3;
      _debO.life = 1.2; _debO.scale = 0.035 + rng() * 0.04; _debO.spin = 8 + rng() * 10;
      _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
      _debO.groundY = gy; _debO.hot = 0; _debO.seed = rng(); _debO.birthOffset = 0;
      particles.emit('debris', _debO);
    }
  }

  function emitMetalBreak(
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    heightM: number,
    gy: number,
  ): void {
    _v3.set(pos.x, gy + Math.min(1.0, heightM * 0.4), pos.z);
    sparkFan(_v3, _UP, 10, 9, 1.1, 0xffce8a, 0.45, 0.035, 0.035, 0, 0.1);
    for (let i = 0; i < 6; i++) {
      const a = rng() * Math.PI * 2;
      _puffO.pos[0] = pos.x; _puffO.pos[1] = gy + 0.3; _puffO.pos[2] = pos.z;
      _puffO.vel[0] = Math.cos(a) * (1.4 + rng() * 1.6) + dir.x * 2.2;
      _puffO.vel[1] = 0.8 + rng() * 1.0;
      _puffO.vel[2] = Math.sin(a) * (1.4 + rng() * 1.6) + dir.z * 2.2;
      _puffO.life = 1.1 + rng() * 0.7;
      _puffO.size0 = 0.4 + rng() * 0.3; _puffO.size1 = 1.6 + rng() * 0.9;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
      col3(0x6f6a60, _puffO.col0); col3(0x57534b, _puffO.col1);
      _puffO.alpha = 0.36 + rng() * 0.14; _puffO.grav = -0.35; _puffO.birthOffset = 0;
      particles.emit('dust', _puffO);
    }
  }

  function emitWoodBreak(
    family: 'wood' | 'barrel' | 'pot',
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    heightM: number,
    gy: number,
  ): void {
    const nChip = family === 'barrel' ? 10 : family === 'pot' ? 9 : 12;
    const chipScaleBase = family === 'barrel' ? 0.08 : family === 'pot' ? 0.04 : 0.05;
    const chipScaleRange = family === 'barrel' ? 0.09 : family === 'pot' ? 0.05 : 0.07;
    for (let i = 0; i < nChip; i++) {
      _debO.pos[0] = pos.x + (rng() - 0.5) * 0.5;
      _debO.pos[1] = gy + 0.3 + rng() * Math.min(1.1, heightM * 0.5);
      _debO.pos[2] = pos.z + (rng() - 0.5) * 0.5;
      _debO.vel[0] = dir.x * (2.5 + rng() * 3.5) + (rng() - 0.5) * 4.5;
      _debO.vel[1] = 2.2 + rng() * 3.6;
      _debO.vel[2] = dir.z * (2.5 + rng() * 3.5) + (rng() - 0.5) * 4.5;
      _debO.life = 1.4; _debO.scale = chipScaleBase + rng() * chipScaleRange; _debO.spin = 12 + rng() * 18;
      _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
      _debO.groundY = gy; _debO.hot = 0; _debO.seed = rng(); _debO.birthOffset = 0;
      particles.emit('debris', _debO);
    }
    for (let i = 0; i < 7; i++) {
      const a = rng() * Math.PI * 2;
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.5;
      _puffO.pos[1] = gy + 0.25 + rng() * 0.4;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.5;
      _puffO.vel[0] = Math.cos(a) * (1.5 + rng() * 2.0) + dir.x * 2.4;
      _puffO.vel[1] = 0.9 + rng() * 1.2;
      _puffO.vel[2] = Math.sin(a) * (1.5 + rng() * 2.0) + dir.z * 2.4;
      _puffO.life = 1.3 + rng() * 0.9;
      _puffO.size0 = 0.45 + rng() * 0.3; _puffO.size1 = 1.9 + rng() * 1.1;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
      if (family === 'pot') { col3(0x9a6a4a, _puffO.col0); col3(0x7c5238, _puffO.col1); }
      else { col3(0x8a8271, _puffO.col0); col3(0x776f60, _puffO.col1); }
      _puffO.alpha = 0.4 + rng() * 0.15; _puffO.grav = -0.4; _puffO.birthOffset = 0;
      particles.emit('dust', _puffO);
    }
  }

  // (fx 8n) the Studio's timeline clock while it plays smoke salvos (setAuxiliaryClock), else the match clock
  let auxiliaryClock: (() => number) | null = null;
  const auxiliary = auxiliaryEntities && auxiliaryTime ? createAuxiliaryPresentation(group, {
    entities: auxiliaryEntities, time: () => (auxiliaryClock ? auxiliaryClock() : auxiliaryTime()), ground: groundY,
    visible: auxiliaryVisible,
    // atmospherics lane: the smoke screen on the media layer (desktop tiers; null on the phone tier)
    blast,
    report: (id,p,caliber) => auxiliaryReport?.(id,p,caliber),
    // (240) a roof gun's flash lights its mount as any gun of its bore does (muzzleLightPulse: a 12.7 mm round a ~30 cd
    // kiss over 4 m of the turret roof; it lit nothing before), and never cuts short a bigger gun's pulse still burning
    flash: (p,d,caliber) => {
      const lightK = spawnMuzzleFlash(p,d,caliber,0);
      const pulse = muzzleLightPulse(caliber, p.x, p.y, p.z);
      const peak = MUZZLE_LIGHT_PEAK * pulse.peakK * lightK * muzzleLightScale;
      if (!(muzzleLight.intensity > peak)) flashLight(lightStates[0], p, peak, 0, undefined, undefined, undefined, pulse.range);
    },
    smoke: (p,scale,density=1,life=2.4,wind=null) => {
      for(let i=0;i<3;i++){
        _puffO.pos[0]=p.x+(rng()-.5)*1.4*scale;_puffO.pos[1]=p.y+(i-1)*1.7*scale;_puffO.pos[2]=p.z+(rng()-.5)*1.4*scale;
        // (FX lane 2026-10-17) a screen's puff drifts on its screen's own wind (its map's), as its sight block does
        _puffO.vel[0]=(wind?wind.x:0)+(rng()-.5)*.28;
        _puffO.vel[1]=.12+rng()*.12;_puffO.vel[2]=(wind?wind.z:0)+(rng()-.5)*.28;
        _puffO.life=life;_puffO.size0=(5.2+rng()*1.1)*scale;_puffO.size1=(10.5+rng()*1.4)*scale;
        _puffO.rot=rng()*Math.PI*2;_puffO.rotVel=(rng()-.5)*.14;_puffO.grav=0;_puffO.alpha=.82*density;
        col3(0xaeb6b8,_puffO.col0);col3(0xb8c1c2,_puffO.col1);_puffO.birthOffset=0;
        particles.emit(wind?'screen':'psmoke',_puffO);
      }
    },
  }) : null;

  let cinematicPortState: FxCinematicPort | null = null;
  const muzzleCardBase = new Map<THREE.ShaderMaterial, number>();
  const fx: FxRuntime = {
    group,

    /**
     * Hide already-recorded battle destruction while killcam shows the
     * reconstructed pre-impact state. Emitters continue aging, so releasing
     * the gate never dumps a backlog; pooled lights stay in the scene with
     * zero intensity to preserve shader-program stability.
     */
    setReplaySuppressed(suppressed: boolean): void {
      replaySuppressed = !!suppressed;
      if (replaySuppressed) {
        for (const st of lightStates) st.light.intensity = 0;
        for (const r of shockRings) { r.mesh.visible = false; r.mat.opacity = 0; }
        for (const r of muzzleRings) { r.mesh.visible = false; r.mat.opacity = 0; }
      }
    },

    /** Read-only killcam/visual-regression telemetry. */
    getReplaySuppressionDebug() {
      return {
        suppressed: replaySuppressed,
        lightIntensities: [muzzleLight.intensity, explosionLight.intensity],
        worldFixedColumns: columns.reduce((count, col) => count + (col.key == null ? 1 : 0), 0),
      };
    },

    /** Render-side ATGM visibility telemetry used by the browser lifecycle gate. */
    getGuidedMissileDebug() {
      return {
        bodies: renderedAtgmBodies,
        trailSegments: renderedAtgmTrailSegments,
      };
    },

    /** Moving-emitter telemetry for deterministic browser/lifecycle probes. */
    getAttachmentDebug() {
      let keyed = 0;
      let resolved = 0;
      const subjects = [];
      for (const col of columns) {
        if (col.key == null) continue;
        keyed++;
        if (col.attachmentResolved) resolved++;
        subjects.push({
          id: col.key,
          resolved: !!col.attachmentResolved,
          pos: [col.pos[0], col.pos[1], col.pos[2]],
          localPos: col.localPos
            ? [col.localPos[0], col.localPos[1], col.localPos[2]] : null,
        });
      }
      return {
        keyedColumns: keyed,
        resolvedKeyedColumns: resolved,
        unresolvedKeyedColumns: keyed - resolved,
        worldFixedColumns: columns.length - keyed,
        // smoke-only (shell burst) columns, so a probe can tell them from burning wrecks
        flamelessColumns: columns.filter((col) => col.flame === false).length,
        subjects,
      };
    },

    /**
     * LOADING PERF (boot r9): finish the deferred particle sprite bakes
     * (idempotent, ~200 ms once). Must run before the first fx-visible frame;
     * main.ts warmCombatPipeline() is the enforcing call site.
     */
    warmTextures() { particles.warmTextures(); void vol?.warm(); },

    /** Decode deterministic prebuilt atlases during quiet garage time. */
    preloadTextures() {
      return Promise.all([particles.preloadTextures(), vol ? vol.warm() : Promise.resolve(true)]).then(([a]) => a);
    },

    /** Bake deterministic sprite sheets cooperatively with the caller's yielder. */
    warmTexturesChunked(yieldFrame: () => Promise<void>, options?: { assets?: 'preload' | 'ready-only' }) {
      return Promise.all([particles.warmTexturesChunked(yieldFrame, options), vol ? vol.warm() : Promise.resolve(true)])
        .then(() => undefined);
    },

    /**
     * Instantiate the exact pooled families reachable in the first seconds
     * of a battle. The caller renders once and resetAll() removes every warm
     * instance, so no synthetic event enters gameplay or survives loading.
     */
    warmOpeningEffects(
      pos: THREE.Vector3,
      dir: THREE.Vector3,
      normal: THREE.Vector3,
      caliberMm = 120,
    ): void {
      attachWorld();
      fx.muzzleFlash(pos, dir, caliberMm);
      spawnSabotPetals(pos, dir);
      fx.impact('pen', pos, normal, caliberMm);
      fx.impact('terrain', pos, normal, caliberMm);
      dirtPlume(pos, 76, false);
      for (const kind of ['fence', 'wall', 'sandbag', 'truck', 'drumblast']) {
        fx.propBreak(kind, pos, dir, 1.5);
      }
      fx.propCrush(pos, dir, 7);
      // (ac130-fx-228 r2) the ground's pressure ring: a muzzle flash raises it only near the ground, so an AC-130 battle
      // (its pilot's muzzle 240 m up) first compiled it at the first howitzer burst (107 ms in a critic's cold run)
      spawnShockRing(pos.x, pos.z, 0);
      // and the charred-ground decal an explosive burst leaves (the first howitzer round still compiled one fx
      // MeshBasicMaterial in a critic's cold run of round 2); resetAll hides it again with the warm's other bursts
      spawnScorch(pos.x, pos.z, 2.4);
    },

    /**
     * Covered loading only: submit one instance of each missile-only material
     * through the same body writer as real flight. There is no shell identity,
     * event, world sweep or persistent trail; resetAll removes both instances.
     * Call after update(), which normally rebuilds these counts from live shells.
     */
    warmProjectilePresentation(pos: THREE.Vector3, dir: THREE.Vector3): void {
      liveAtgmCount = 0;
      bodies.begin();
      for (const id of Object.keys(MISSILE_AIRFRAMES)) writeGuidedBody(pos, dir, MISSILE_LOOKS[id] ?? MISSILE_LOOKS.konkurs);
      commitAtgmInstances();
      // (EF.04, the Kornet probe 10-13: the first launch still compiled one program in its frame — the projectile
      // tracers' own: the solo warm's update ran with no shells, so the tracer mesh drew nothing in the covered render)
      // one motor glow, as a launch draws it, so the tracers' program compiles with the others; the next update clears it
      tracers.begin();
      tracers.glow(pos.x + dir.x * 2, pos.y + dir.y * 2, pos.z + dir.z * 2, pos.x, pos.y, pos.z, 0.6, 2, WARM_GLOW_RGB, 0.5, WARM_GLOW_RGB, 0.2, 1);
      tracers.end();
      // (FX lane 10-14) and a short wire, so the wire's program compiles with them; resetAll clears it
      {
        const now = particles.getTime();
        const slot = wires.begin(WARM_WIRE_KEY, 1, pos.x, pos.y, pos.z, now);
        wireTube[slot] = -2;
        wires.tail(slot, pos.x + dir.x * 6, pos.y + dir.y * 6, pos.z + dir.z * 6, now);
        wires.update(now, groundY);
      }
      // (EF.04, filmed: a 100-200 ms hitch at a battle's first missile launch, the trail program's first compile) one
      // short trail in the covered warm, so its program compiles with the others; resetAll clears it
      {
        const now = particles.getTime();
        const look = missileTrailOf(MISSILE_LOOKS.konkurs) as MissileTrail;
        const slot = smokeTrails.begin(WARM_TRAIL_KEY, smokeTrails.lookIndex(look), 0.5);
        smokeTrails.point(slot, pos.x, pos.y, pos.z, now - 0.1, 0.1);
        smokeTrails.head(slot, pos.x + dir.x * 2, pos.y + dir.y * 2, pos.z + dir.z * 2, now, 0.15);
        smokeTrails.update(now, worldWind.x, worldWind.z);
        readSceneLight((engineCtx.scene?.userData ?? null) as SceneLightData | null, missileLight);
      }
    },

    /**
     * Per-render-frame advance: particle clock, timers, lights, smoke columns,
     * and the rounds in flight (projectile tracers, missile bodies and trails,
     * drones) drawn from live shell entities.
     * @param {number} dt render delta seconds
     * @param {object[]} shells live ShellEntity[] (§2.5)
     * @param {THREE.Camera} camera active camera (billboarding is GPU-side; unused)
     * @param {(id:string)=>object|null} [resolveSubject] live entity/actor lookup
     */
    update(
      dt: number,
      shells: LiveShell[],
      camera: THREE.Camera,
      resolveSubject: ((id: string) => FxEntity | null) | null = null,
    ): void {
      attachWorld();
      resolvePendingHe();
      tracerSubject = resolveSubject; // atmospherics lane: the tracers' shooter lookup
      if (!cinematicTintOwner) battleLightTintFromRig(engineCtx.scene ?? null, particles.sharing.uLightTint.value);
      // (EF.12) one world wind: the columns lean and drift with the media and the clouds over them
      refreshWorldWind((engineCtx.scene?.userData ?? null) as Parameters<typeof refreshWorldWind>[0]);
      COLUMN_WIND_X = worldWind.x * COLUMN_WIND_SHARE; COLUMN_WIND_Z = worldWind.z * COLUMN_WIND_SHARE;
      // (EF.12) the map's ground colour for the earth dust (the grounded light model's ground albedo)
      setMapGroundAlbedo((engineCtx.scene?.userData?.lightModel as { groundAlbedo?: ArrayLike<number> } | undefined)?.groundAlbedo);
      // (EF.09, MASTER 18) the unlit marks and bodies take the same light: the hull scars, the track prints and the wake's
      // foam, a missile's painted body (its motor's flare stays emissive) and the blasts' pressure rings
      {
        const tint = particles.sharing.uLightTint.value;
        printUniforms.uTint.value.copy(tint);
        impactDecals.material.color.copy(tint);
      }
      particles.update(dt);
      structMask?.setClock(particles.getTime());
      stages?.update();
      fractureStages?.update();
      if (scars && scars.count > 0) scars.light(engineCtx.scene ?? null);
      structDebris?.update();
      rubble?.update();
      vol?.update(camera ?? engineCtx.camera ?? null);
      chunks?.update();
      craters?.setHeatView(imagesHeat(camera ?? engineCtx.camera ?? null));
      craters?.update(particles.getTime());
      layMapCraters();
      mapCraterMarks?.update(particles.getTime());
      if (!frozen) auxiliary?.update();
      printUniforms.uTime.value = particles.getTime();
      const tickDt = advanceFxClock();
      battleFreshS += tickDt;
      syncColumnAnchors(resolveSubject);
      updateClockDrivenLights();
      sweepImpactDecals(dt);
      updateWreckLight();
      writeLocalLights();
      advanceTimedFx(tickDt);
      sweepShellsThroughProps(shells);
      // (ac130-barrels-230) the pilot's guns on this frame's lens, before its rounds are drawn from their muzzles
      poseLensGuns(camera, dt);
      writeLiveShellTracers(shells, camera);
      commitAtgmInstances();
      // (FX lane 10-14) the trails and wires after their rounds (the clock, the wind; a wire's sag, its launcher's pull, its
      // fall once parted), lit by the scene now
      smokeTrails.update(particles.getTime(), worldWind.x, worldWind.z);
      wires.update(particles.getTime(), groundY);
      if (wires.mesh.visible || smokeTrails.mesh.visible || bodies.count > 0) {
        readSceneLight((engineCtx.scene?.userData ?? null) as SceneLightData | null, missileLight);
      }
      ageMissileRecords(tickDt);
    },

    /**
     * Subscribe to combat bus events (ARCHITECTURE §1.5 payloads).
     * @param {object} bus injected event bus
     */
    bindBus(bus: FxEventBus): void {
      // (FX lane 2026-10-17) a network screen drifts on this map's wind, the one its authority stamped (no wire field)
      bus.on('auxiliary:smokeScreens', (payload) => { auxiliary?.setNetworkScreens((payload as {screens:SmokeScreen[]}).screens, smokeWindForMap(world?.()?.mapId)); });
      // destruction-fx lane: the core lane's structure stages and crater stamps (DESTRUCTION.md §11)
      bus.on(DESTRUCTION_BUS_EVENTS.stage, (payload) => {
        const e = payload as StructureStageEvent;
        const stageSeam = seamOf(e.structureId);
        stages?.stage(e, stageSeam);
        if (e.settled) return;
        const anat = stageSeam?.anatomy;
        const eaveM = anat?.roof ? anat.placement.y + anat.roof.eaveY - e.baseY : null;
        if (blast) {
          // a shaft goes over in the blow's direction (structureStages structureTopple): its dust falls along that line
          // (one that came down as bodies falls where its drums fall: its dust is a collapse's of bodies, from the landings)
          const asBodies = e.stage === 'collapsed' && !!fractureStages?.took(e.structureId);
          const topple = e.stage === 'collapsed' && !asBodies ? structureTopple(anat, e) : null;
          structureStageFx(blast, e, lookOf(e.structureId), !!stages && !!stageSeam, eaveM, topple, asBodies);
        }
        else phoneStageBeat(e);
      });
      bus.on(DESTRUCTION_BUS_EVENTS.breach, (payload) => {
        const e = payload as StructureBreachEvent;
        stages?.breach(e, seamOf(e.structureId));
        fractureStages?.breach(e);
        // a section's fall (P2): its dust in the building's own colour
        if (e.sectionDown && !e.settled && blast) sectionFallFx(blast, e, lookOf(e.structureId));
      });
      // the detonation's own record, raised before the shell event it belongs to: a burst on a structure names it, so
      // the wall strike that follows throws that building's own materials
      bus.on(DESTRUCTION_BUS_EVENTS.blast, (payload) => {
        const b = payload as MunitionBlastEvent;
        if (b.surface === 'structure' && typeof b.structureId === 'number') {
          lastBlast.x = b.x; lastBlast.y = b.y; lastBlast.z = b.z; lastBlast.structureId = b.structureId;
        } else lastBlast.structureId = -1;
        lastGroundBlast.x = b.x; lastGroundBlast.z = b.z;
        lastGroundBlast.craterId = typeof b.craterId === 'number' ? b.craterId : -1;
        // (dcore 2026-10-10, wave 351) the vehicles round it take the near miss: dents, glass, a shove (props.ts)
        if (Number.isFinite(b.chargeKg)) notifyBlast(b.x, b.y, b.z, b.chargeKg);
      });
      // a deforming crater (crater-render-spec §D): its own surface draped on the deformed ground (the terrain follows
      // the overlay in its LOD pass, before this update reads it), its edge ragged by the simulation's wobble; a live one
      // throws its clods onto the rim and a thin ring of dust (the burst itself is the same tick's blast); a settled one
      // lays its surface alone, at its final state
      bus.on(DESTRUCTION_BUS_EVENTS.crater, (payload) => {
        const e = payload as TerrainCraterEvent;
        if (!craters || !(e.radiusM > 0.2)) return;
        const [p1, p2, p3] = craterWobblePhases(e.seed);
        const surface = classifyTerrain(heightField, e.x, e.z);
        const settled = e.settled === true;
        const now = particles.getTime();
        // settled: weathered by its own age when the event carries it (the Studio's settled fields), else old
        const ageS = (e as TerrainCraterEvent & { ageS?: number }).ageS;
        craters.crater({ x: e.x, z: e.z, radiusM: e.radiusM, p1, p2, p3, surface, climate: groundClimate(), explosive: true,
          kind: markKindFor(e.munition, true), seed: (e.seed % 65536) / 65536,
          birth: settled ? now - (Number.isFinite(ageS) ? (ageS as number) : 600) : now }, deformedGroundY);
        if (!settled && blast) craterEjecta(blast, e.x, e.z, e.radiusM, surface, deformedGroundY, 0);
      });
      onFxEvent(bus, 'shell:fired', (e) => {
        _v3.set(e.muzzlePos[0], e.muzzlePos[1], e.muzzlePos[2]);
        _v4.set(e.dir[0], e.dir[1], e.dir[2]);
        // (ac130-fx-228) the gunship's guns: their own muzzle (gunshipMuzzleFx), never a tank cannon's at the lens
        const gun = gunshipShotOf(e.weaponSound, e.shooterId != null && subjectFor(e.shooterId)?.aerial?.kind === 'gunship',
          e.shellType, e.guided);
        if (gun) {
          if (gun === 'missile') {
            if (missileLaunchAt.size > 96) missileLaunchAt.clear();
            missileLaunchAt.set(e.shellId, [e.muzzlePos[0], e.muzzlePos[1], e.muzzlePos[2], e.caliberMm || gunshipCaliberMm('missile')]);
          }
          if (!e.feedbackPredicted) gunshipMuzzleFx(e, gun, idSeed(e.shellId));
        // (fx 9a) a missile's or rocket's launch is its own (missileRecipes.ts); its launch point anchors the wires
        } else if (firedIsMissile(e.weaponSound, e.rocket)) {
          if (missileLaunchAt.size > 96) missileLaunchAt.clear();
          missileLaunchAt.set(e.shellId, [e.muzzlePos[0], e.muzzlePos[1], e.muzzlePos[2], e.caliberMm || 0]);
          if (!e.feedbackPredicted) missileLaunchFx(e, idSeed(e.shellId));
          // (FX lane 10-14) a wire-guided round pays out its wire from the launcher's tube
          const wired = missileLookFor(e.shellName, e.weaponSound, e.rocket === true);
          if (wired.wires > 0) beginWire(e, wired);
        } else if (!e.feedbackPredicted) fx.muzzleFlash(_v3, _v4, e.caliberMm, e.rocket);
        if (e.shellType === 'APFSDS') spawnSabotPetals(_v3, _v4);
        // world-dressing r1: remember the shell's type so its world impact
        // can size the destructible-prop blast (HE clears a radius), and
        // seed its sweep tail at the muzzle — a fast shell can be born and
        // dead between two render frames, so the expiry-time sweep below is
        // what guarantees flight coverage against destructible props.
        if (shellKinds.size > 96) { shellKinds.clear(); sweepTails.clear(); } // leak guard
        shellKinds.set(e.shellId, e.shellType);
        sweepTails.set(e.shellId, [e.muzzlePos[0], e.muzzlePos[1], e.muzzlePos[2]]);
        rememberMunition(e);
      });
      onFxEvent(bus, 'weapon:predicted', (e) => {
        if (!e.isPlayer) return;
        _v3.set(e.muzzlePos[0], e.muzzlePos[1], e.muzzlePos[2]);
        _v4.set(e.dir[0], e.dir[1], e.dir[2]);
        // Presentation only; sabot petals and sweep/prop ownership await authority.
        const gun = gunshipShotOf(e.weaponSound, false);
        if (gun) gunshipMuzzleFx(e, gun, idSeed(`${e.muzzlePos.join(',')}`));
        else if (firedIsMissile(e.weaponSound, e.rocket)) missileLaunchFx(e, idSeed(`${e.muzzlePos.join(',')}`));
        else fx.muzzleFlash(_v3, _v4, e.caliberMm, e.rocket);
      });
      onFxEvent(bus, 'shell:hit', (e) => {
        if (e.shellId != null) drones.markImpact(e.shellId); // a drone that struck a tank never flies home
        // atmospherics lane: a round that ends on the hull strikes there (a ricochet flies on, its tracer tumbling)
        if (e.kind !== 'ricochet') { tracers.strike(e.shellId, e.pos); partWire(e.shellId); endTrail(e.shellId, e.pos); }
        _v3.set(e.pos[0], e.pos[1], e.pos[2]);
        _v4.set(e.normal[0], e.normal[1], e.normal[2]);
        if (e.targetId) lastKnownPos.set(e.targetId, [e.pos[0], e.pos[1], e.pos[2]]);
        // world-dressing r1: a tank hit still ends the shell — sweep the
        // unswept flight remainder against destructible props and drop the
        // bookkeeping (fences between shooter and target break too)
        if (e.shellId != null) {
          const tail = sweepTails.get(e.shellId);
          if (tail) {
            sweepTails.delete(e.shellId);
            notifyShellSweep(tail[0], tail[1], tail[2], e.pos[0], e.pos[1], e.pos[2]);
          }
          shellKinds.delete(e.shellId);
        }
        // Ballistic scarring has exactly one event owner. The FX runtime is
        // demand-loaded after main's presentation listeners, so attempting
        // to dedupe a second main-thread stamp by subscription order is not
        // reliable. All shell:hit marks are authored here from the exact
        // authoritative articulation-local contact data.
        const ent = decalEntityFor(e.targetId);
        if (ent) {
          impactDecals.stampFromEvent(e, ent);
          ent.visual.applyEquipmentDamage?.(e);
        }
        // ERA is an outer-layer activation, not necessarily the final hit
        // result. A rod/jet may pop the cassette and continue into a pen or
        // non-pen on the base armor; preserve both visual events.
        const eraActivations = (e.eraActivations || []).filter(
          (activation) => activation?.pos?.length === 3,
        );
        if (eraActivations.length) {
          for (const activation of eraActivations) {
            _v5.fromArray(activation.pos!);
            _v6.fromArray(activation.normal?.length === 3 ? activation.normal : e.normal);
            fx.impact('era', _v5, _v6, e.caliberMm);
          }
        } else if (isEraActivation(e) && e.kind !== 'era') {
          fx.impact('era', _v3, _v4, e.caliberMm);
        }
        // A terminal ERA absorb already received its exact activation above.
        // Legacy payloads still fall through to their ordinary `era` impact.
        // destruction-fx lane: an HE round's hull events resolve to one burst at the next update (queueHeHit)
        if ((e.kind === 'he_pen' || e.kind === 'he_splash') && queueHeHit(e)) return;
        if (e.kind !== 'era' || !eraActivations.length) {
          fx.impact(e.kind, _v3, _v4, e.caliberMm);
        }
        // a shaped charge (HEAT, an ATGM, a drone's warhead) detonates on the plate whatever its jet then does
        const info = e.shellId != null ? shellMunitions.get(e.shellId) : null;
        if (blast && info && (info.munition === 'heat' || info.munition === 'atgm' || info.munition === 'drone_fpv')) {
          shellMunitions.delete(e.shellId as ShellId);
          plateBurst(blast, { x: e.pos[0], y: e.pos[1], z: e.pos[2], nx: e.normal[0], ny: e.normal[1], nz: e.normal[2],
            munition: info.munition, chargeKg: Math.max(0.3, info.chargeKg * 0.5), ground: null });
        }
      });
      onFxEvent(bus, 'shell:expired', (e) => {
        if (e.hitTerrain || e.hitKind) drones.markImpact(e.shellId); // struck the world: no flight home (an air expiry has neither)
        tracers.strike(e.shellId, e.pos, !!e.hitWater); // atmospherics lane: the tracer's last dash and its strike
        partWire(e.shellId); // (FX lane 10-14) a wire-guided round's wire parts where it burst; its trail ends there
        endTrail(e.shellId, e.pos);
        // world-dressing r1: close out the shell's destructible-prop story —
        // (1) sweep the UNSWEPT remainder of its flight (tail -> expiry
        // point; a fast shell can live for fewer sim ticks than one render
        // frame, so this event is the coverage guarantee), then (2) break
        // props around the burst point (HE gets a real radius, AP a token
        // one). Runs BEFORE the terrain gate below — prop-collider hits
        // report hitTerrain=false but still carry pos.
        // destruction-fx lane: the round's class and charge (the event's own, else its fired record, else HE by
        // calibre for the Studio's stand-in blasts), and the direction it arrived from (its last swept point)
        let info = shellMunitions.get(e.shellId) ?? null;
        shellMunitions.delete(e.shellId);
        if (e.munition && Number.isFinite(e.chargeKg)) {
          info = { munition: e.munition, chargeKg: e.chargeKg as number, caliberMm: e.caliberMm || info?.caliberMm || 76 };
        }
        let arrival: THREE.Vector3 | null = null;
        {
          const st = shellKinds.get(e.shellId);
          shellKinds.delete(e.shellId);
          const tail = sweepTails.get(e.shellId);
          if (tail) {
            sweepTails.delete(e.shellId);
            notifyShellSweep(tail[0], tail[1], tail[2], e.pos[0], e.pos[1], e.pos[2]);
            _strikeDir.set(e.pos[0] - tail[0], e.pos[1] - tail[1], e.pos[2] - tail[2]);
            if (_strikeDir.lengthSq() > 1e-6) arrival = _strikeDir.normalize();
          }
          // a bullet or a drone is not an HE shell: the class decides the prop blast (FX round 6's map read the type only)
          const he = info ? isExplosive(info.munition) && info.chargeKg >= 0.5 : (st === 'HE' || st === 'HESH');
          notifyShellImpact(e.pos[0], e.pos[1], e.pos[2], { he, r: he ? 4.6 : 1.0 });
        }
        _v3.set(e.pos[0], e.pos[1], e.pos[2]);
        if (e.hitKind === 'prop') {
          if (Array.isArray(e.normal)) _v4.set(e.normal[0], e.normal[1], e.normal[2]).normalize();
          else _v4.copy(_UP);
          if (blast) {
            // destruction-fx lane: the round bursts on (or chips) the wall in the wall's own material
            const m = info ?? munitionOfExpiry(e);
            const explosive = isExplosive(m.munition) && m.chargeKg > 0;
            // the building the event names (any round), else the one the blast named (munition:blast, raised just before
            // this event), else the struck kind
            const struckId = typeof e.structureId === 'number' && e.structureId >= 0 ? e.structureId
              : lastBlast.structureId >= 0 && Math.abs(lastBlast.x - _v3.x) + Math.abs(lastBlast.z - _v3.z) < 2
                ? lastBlast.structureId : -1;
            const named = struckId >= 0 ? lookOf(struckId) : null;
            lastBlast.structureId = -1;
            // (dcore 2026-10-11, wave 397: "the actual fall happens inside an opaque dust ball") a building struck again and
            // again within a couple of seconds throws less new dust each time: the air round it is full already; by the
            // load against the burst's own size (wave 401: a 152 mm after five 76 mm still raises its full burst)
            const scale = explosive ? blastScale(m.chargeKg) : (m.caliberMm || 90) / 120;
            let dustK = 1;
            if (struckId >= 0) {
              const nowS = particles.getTime();
              const last = strikeDust.get(struckId);
              const fade = last ? Math.exp(-Math.max(0, nowS - last[0]) / 1.5) : 0;
              const load = last ? last[1] * fade : 0, biggest = last ? last[2] * fade : 0;
              dustK = 1 / (1 + 0.45 * load / Math.max(0.3, scale));
              if (scale > 1.5 * biggest) dustK = Math.max(dustK, 0.9);
              if (last) { last[0] = nowS; last[1] = load + scale; last[2] = Math.max(biggest, scale); }
              else strikeDust.set(struckId, [nowS, scale, scale]);
            }
            wallStrike(blast, _v3.x, _v3.y, _v3.z, _v4.x, _v4.y, _v4.z, explosive, scale, named ?? lookForStruckKind(e.surfaceKind), 0, dustK);
            // (dcore 2026-10-09, waves 294a/b: a hit read as a light on an intact wall) the burst punches its hole there,
            // in the building's own courses (structureStages.strike: P1's presentation, as its breach stage's hole); and
            // (2026-10-10, the owner: "shooting buildings should cause destruction too") so does an armour-piercing round,
            // its own smaller hole, spalled (machine-gun and autocannon rounds chip the wall: wallStrike above)
            if ((explosive || m.munition === 'kinetic') && struckId >= 0 && stages) {
              const dx = arrival ? arrival.x : -_v4.x, dz = arrival ? arrival.z : -_v4.z;
              stages.strike(struckId, seamOf(struckId), _v3.x, _v3.y, _v3.z, dx, dz, m.munition, m.chargeKg, m.caliberMm);
            }
            if (e.shellId != null) burstDrawn.add(e.shellId);
            return;
          }
          fx.impact('structure', _v3, _v4, e.caliberMm || 90);
          return;
        }
        if (e.hitTerrain) {
          const water = !!e.hitWater || shellPointOnWater(_v3);
          if (mediaGroundHit(_v3, info ?? munitionOfExpiry(e), water, arrival)) {
            if (e.shellId != null) burstDrawn.add(e.shellId);
            return;
          }
          if (water) waterSplash(_v3, e.caliberMm || 76, false);
          else dirtPlume(_v3, e.caliberMm || 76, false);
        }
      });
      onFxEvent(bus, 'tank:destroyed', (e) => {
        // Transition from a moving live-tank emitter to one world-fixed wreck
        // emitter. Fire deaths otherwise left both columns alive for 40 s.
        retireSubjectColumn(e.id);
        lastKnownPos.set(e.id, [e.pos[0], e.pos[1], e.pos[2]]);
        // wreck burnt-swap clears the battle scarring (same beat that hides
        // the profile decalMeshes in setDestroyed) — and guarantees the burn
        // material traverse never converts a decal mesh into an opaque quad
        impactDecals.clearVehicle(e.id);
        const ent = decalEntityFor(e.id);
        if (ent) impactDecals.clearVehicle(ent.visual);
        _v3.set(e.pos[0], e.pos[1], e.pos[2]);
        fx.destruction(_v3, null, e.cause || 'shot', e.id);
      });
      onFxEvent(bus, 'module:state', (e) => {
        // de-track moment: thrown link fragments, a grinding spark burst and a
        // heavy dust kick at the running gear (the thrown-track ribbon, band
        // slump and road-wheel scatter live on the visual — tankFactory
        // setTrackState — this is the particle side of the same beat)
        if ((e.module === 'trackL' || e.module === 'trackR') && e.state === 'red') {
          const p = lastKnownPos.get(e.id);
          if (!p) return;
          // r5: the whole beat scaled ~3x and lifted above the grass line —
          // the r4 live test at 10 m in field grass showed no readable event
          // (0.03-width sparks + knee-high dust swallowed by the meadow).
          _v3.set(p[0], p[1] + 0.55, p[2]);
          // r2: dark disturbed-earth stamp under the shed point — the thrown
          // band must leave a gouge where it tore off (detrack minor)
          spawnScorch(p[0], p[2], 2.4 + rng() * 0.8);
          sparkFan(_v3, _UP, 26, 16, 1.25, 0xffce8a, 0.7, 0.05, 0.045, 0, 0.16);
          // link fragments: flat dark chips whipped off the sprocket
          for (let i = 0; i < 12; i++) {
            const a = rng() * Math.PI * 2;
            _debO.pos[0] = p[0]; _debO.pos[1] = p[1] + 0.55; _debO.pos[2] = p[2];
            _debO.vel[0] = Math.cos(a) * (4.5 + rng() * 6);
            _debO.vel[1] = 4.5 + rng() * 6;
            _debO.vel[2] = Math.sin(a) * (4.5 + rng() * 6);
            _debO.life = 1.6; _debO.scale = 0.09 + rng() * 0.10; _debO.spin = 14 + rng() * 16;
            _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
            _debO.groundY = groundY(p[0], p[2]); _debO.hot = false; _debO.seed = rng(); _debO.birthOffset = 0;
            particles.emit('debris', _debO);
          }
          // grinding dust burst boiling out of the running gear, tall enough
          // to silhouette over meadow grass
          for (let i = 0; i < 18; i++) {
            const a = rng() * Math.PI * 2;
            _puffO.pos[0] = p[0] + (rng() - 0.5) * 1.8;
            _puffO.pos[1] = p[1] + 0.5 + rng() * 0.5;
            _puffO.pos[2] = p[2] + (rng() - 0.5) * 1.8;
            _puffO.vel[0] = Math.cos(a) * (2.2 + rng() * 3.2);
            _puffO.vel[1] = 1.6 + rng() * 1.6;
            _puffO.vel[2] = Math.sin(a) * (2.2 + rng() * 3.2);
            _puffO.life = 1.6 + rng() * 1.2;
            _puffO.size0 = 0.7; _puffO.size1 = 3.4 + rng() * 1.6;
            _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
            col3(0x8d8571, _puffO.col0); col3(0x7a7263, _puffO.col1);
            _puffO.alpha = 0.5; _puffO.grav = -0.4; _puffO.birthOffset = -rng() * 0.15;
            particles.emit('dust', _puffO);
          }
        }
      });
      onFxEvent(bus, 'tank:fire', (e) => {
        if (e.burning) {
          const p = lastKnownPos.get(e.id);
          if (!p) return;
          // one column per tank id; refresh if already burning
          const existing = columns.find((c) => c.key === e.id);
          if (existing) existing.ttl = SMOKE_COLUMN_S;
          else {
            const col: SmokeColumn = {
              key: e.id,
              pos: [p[0], p[1], p[2]],
              acc: 0,
              ttl: SMOKE_COLUMN_S,
              scale: 0.8,
            };
            columns.push(col);
            emitColumnPuff(col); // ignition is visible even on a frozen frame
            capColumns();
          }
        } else {
          retireSubjectColumn(e.id);
        }
      });
    },

    /**
     * Muzzle flash: light + additive flash cards + smoke ring + ground dust.
     * @param {THREE.Vector3} pos muzzle tip (world)
     * @param {THREE.Vector3} dir unit fire direction
     * @param {number} caliberMm gun caliber (scales the effect)
     */
    muzzleFlash(pos: THREE.Vector3, dir: THREE.Vector3, caliberMm: number, rocket = false): void {
      if (rocket) { spawnRocketIgnition(pos, dir, caliberMm); return; }
      const lightK = spawnMuzzleFlash(pos, dir, caliberMm, 0);
      // r2 ON THE BORE AXIS: the r1 light floated 0.45 m ABOVE the tube and
      // its local pool rendered as a glowing lozenge sitting ON TOP of the
      // barrel at mid-length (critic: "as if the barrel exploded midway").
      // The light now sits a hair behind the tip ON the axis — the tube's
      // last meter, mantlet and hull front all catch the same falloff and
      // the brightest lit surface is the muzzle itself.
      _sv.copy(pos).addScaledVector(dir, -0.15);
      _sv.y += 0.10;
      // (233) by the bore and the ground under the muzzle (muzzleLightPulse)
      const pulse = muzzleLightPulse(caliberMm, _sv.x, _sv.y, _sv.z);
      flashLight(lightStates[0], _sv, MUZZLE_LIGHT_PEAK * pulse.peakK * lightK * muzzleLightScale, 0,
        undefined, undefined, undefined, pulse.range);
    },

    /** Tank-on-tank metal contact: lateral sparks, track debris and a low
     * pressure-dust shove. Deliberately omits every shell/penetration cue. */
    vehicleCollision(
      pos: THREE.Vector3,
      normal: THREE.Vector3,
      closingMps = 0,
    ): void {
      const k = THREE.MathUtils.clamp((Number(closingMps) || 0) / 12, 0.35, 1.4);
      _v1.copy(normal);
      if (_v1.lengthSq() < 1e-6) _v1.set(0, 0, 1); else _v1.normalize();
      _v1.y = Math.max(0.12, _v1.y);
      _v1.normalize();
      sparkFan(pos, _v1, Math.round(20 + 18 * k), 12 + 8 * k,
        1.2, 0xffd09a, 0.55 + 0.2 * k, 0.045, 0.04, 0, 0.22);
      sparkFan(pos, _v2.copy(_v1).multiplyScalar(-1), Math.round(12 + 12 * k),
        8 + 6 * k, 1.5, 0xff9f55, 0.45, 0.035, 0.032, 0, 0.16);
      for (let i = 0; i < 10 + Math.round(8 * k); i++) {
        const a = rng() * Math.PI * 2;
        _debO.pos[0] = pos.x; _debO.pos[1] = pos.y + 0.28; _debO.pos[2] = pos.z;
        _debO.vel[0] = Math.cos(a) * (2.5 + rng() * 5.5) * k;
        _debO.vel[1] = 2.2 + rng() * 4.8;
        _debO.vel[2] = Math.sin(a) * (2.5 + rng() * 5.5) * k;
        _debO.life = 1.2 + rng() * 0.8;
        _debO.scale = 0.08 + rng() * 0.11;
        _debO.spin = 10 + rng() * 18;
        _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
        _debO.groundY = groundY(pos.x, pos.z);
        _debO.hot = false; _debO.seed = rng(); _debO.birthOffset = 0;
        particles.emit('debris', _debO);
      }
      for (let i = 0; i < 12; i++) {
        const a = rng() * Math.PI * 2;
        _puffO.pos[0] = pos.x + (rng() - 0.5) * 1.6;
        _puffO.pos[1] = pos.y + 0.12 + rng() * 0.35;
        _puffO.pos[2] = pos.z + (rng() - 0.5) * 1.6;
        _puffO.vel[0] = Math.cos(a) * (1.2 + rng() * 2.8) * k;
        _puffO.vel[1] = 0.8 + rng() * 1.5;
        _puffO.vel[2] = Math.sin(a) * (1.2 + rng() * 2.8) * k;
        _puffO.life = 0.8 + rng() * 0.8;
        _puffO.size0 = 0.45; _puffO.size1 = 2.0 + rng() * 1.4;
        _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.5;
        col3(0x71695c, _puffO.col0); col3(0x4d4942, _puffO.col1);
        _puffO.alpha = 0.42; _puffO.grav = -0.25; _puffO.birthOffset = 0;
        particles.emit('dust', _puffO);
      }
      _sv.copy(pos); _sv.y += 0.45;
      flashLight(lightStates[1], _sv, EXPLOSION_LIGHT_PEAK * 0.08 * k, 0);
    },

    /**
     * Armor / terrain impact effect selected by HitEvent.kind.
     * @param {string} kind HitEvent.kind (§2.6)
     * @param {THREE.Vector3} pos impact point (world)
     * @param {THREE.Vector3} normal outward surface normal
     * @param {number} caliberMm shell caliber
     */
    impact(
      kind: string,
      pos: THREE.Vector3,
      normal: THREE.Vector3,
      caliberMm: number,
    ): void {
      // r5 combat-range readability: an aimed 340 m pen produced ZERO visible
      // impact through the scope — flash/spall/smoke sizes get the same
      // camera-distance compensation as destructions (sizes only, ~1x inside
      // 90 m up to ~1.9x at 300 m), so hits read down the sight line.
      const dk = distBoost(pos.x, pos.y, pos.z);
      const s = calScale(caliberMm) * dk;
      switch (kind) {
        case 'pen': {
          // layered penetration (r6: "a single small star sprite"):
          // flash core + directional spall cone off the plate normal +
          // wide secondary fan + dust/smoke ring + lingering crater glow
          hitFlash(pos, normal, s, 0xffffff, 0xffa030);
          // r7 WHITE-HOT PENETRATION CORE (critic: "no white-hot penetration
          // flash core" — the strike read as pale popcorn): a 2-3 frame
          // blinding pop pinned at the hole, 0.6-1 m, additive flash pool.
          _puffO.pos[0] = pos.x + normal.x * 0.14; _puffO.pos[1] = pos.y + normal.y * 0.14; _puffO.pos[2] = pos.z + normal.z * 0.14;
          _puffO.vel[0] = normal.x * 2.5; _puffO.vel[1] = normal.y * 2.5 + 0.5; _puffO.vel[2] = normal.z * 2.5;
          _puffO.life = 0.09;
          _puffO.size0 = 0.55 * s; _puffO.size1 = 1.05 * s;
          _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = 0;
          col3(0xffffff, _puffO.col0); col3(0xfff2d0, _puffO.col1);
          _puffO.alpha = 1.0; _puffO.grav = 0; _puffO.birthOffset = 0;
          particles.emit('flash', _puffO);
          // destruction-fx lane (owner 2026-10-08: every effect on the media layer): on the media tiers the spall jet,
          // the armour-dust ring and the chips are the recipe's (lit, turbulent, drifting; steel that falls and lies)
          if (blast) {
            armorHit(blast, { x: pos.x, y: pos.y, z: pos.z, nx: normal.x, ny: normal.y, nz: normal.z, caliberMm, kind: 'pen' });
          }
          // dust ring puffing out radially in the armor plane (before the
          // sparkFans — they clobber the shared _v1/_v2 basis)
          basisFrom(normal, _v1, _v2);
          // r7 DARK SPALL JET (critic: "no dark spall/armor-dust jet along
          // the incidence normal"): pulverized paint/armor dust blasting out
          // of the hole in a tight fast cone — the dark directional mass
          // that sells a penetration against the pale dust ring.
          for (let i = 0; !blast && i < 8; i++) {
            const a = rng() * Math.PI * 2;
            const tilt = rng() * 0.24;
            const st2 = Math.sin(tilt), ct2 = Math.cos(tilt);
            const jx = normal.x * ct2 + (_v1.x * Math.cos(a) + _v2.x * Math.sin(a)) * st2;
            const jy = normal.y * ct2 + (_v1.y * Math.cos(a) + _v2.y * Math.sin(a)) * st2;
            const jz = normal.z * ct2 + (_v1.z * Math.cos(a) + _v2.z * Math.sin(a)) * st2;
            const v = 10 + rng() * 9;
            _puffO.pos[0] = pos.x + normal.x * 0.15; _puffO.pos[1] = pos.y + normal.y * 0.15; _puffO.pos[2] = pos.z + normal.z * 0.15;
            _puffO.vel[0] = jx * v; _puffO.vel[1] = jy * v; _puffO.vel[2] = jz * v;
            _puffO.life = 0.45 + rng() * 0.4;
            _puffO.size0 = 0.20 * s; _puffO.size1 = (0.95 + rng() * 0.55) * s;
            _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 4;
            col3(0x38332d, _puffO.col0); col3(0x5c564d, _puffO.col1);
            _puffO.alpha = 0.8; _puffO.grav = -2.0; _puffO.birthOffset = -rng() * 0.03;
            particles.emit('smoke', _puffO);
          }
          // r7 directional debris cone: solid armor chips ejected along the
          // normal, gravity-arced (the critic's missing particulate mass)
          for (let i = 0; !blast && i < 5; i++) {
            const a = rng() * Math.PI * 2;
            const tilt = rng() * 0.45;
            const st2 = Math.sin(tilt), ct2 = Math.cos(tilt);
            _debO.pos[0] = pos.x; _debO.pos[1] = pos.y; _debO.pos[2] = pos.z;
            _debO.vel[0] = (normal.x * ct2 + (_v1.x * Math.cos(a) + _v2.x * Math.sin(a)) * st2) * (9 + rng() * 9);
            _debO.vel[1] = (normal.y * ct2 + (_v1.y * Math.cos(a) + _v2.y * Math.sin(a)) * st2) * (9 + rng() * 9) + 2.5;
            _debO.vel[2] = (normal.z * ct2 + (_v1.z * Math.cos(a) + _v2.z * Math.sin(a)) * st2) * (9 + rng() * 9);
            _debO.life = 1.3; _debO.scale = 0.05 + rng() * 0.06; _debO.spin = 14 + rng() * 18;
            _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
            _debO.groundY = groundY(pos.x, pos.z);
            _debO.hot = i < 2 ? 1 : 0.45; _debO.seed = rng(); _debO.birthOffset = 0;
            particles.emit('debris', _debO);
          }
          for (let i = 0; !blast && i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + rng() * 0.6;
            const rx = _v1.x * Math.cos(a) + _v2.x * Math.sin(a);
            const ry = _v1.y * Math.cos(a) + _v2.y * Math.sin(a);
            const rz = _v1.z * Math.cos(a) + _v2.z * Math.sin(a);
            _puffO.pos[0] = pos.x + rx * 0.3 + normal.x * 0.1;
            _puffO.pos[1] = pos.y + ry * 0.3 + normal.y * 0.1;
            _puffO.pos[2] = pos.z + rz * 0.3 + normal.z * 0.1;
            _puffO.vel[0] = rx * (3 + rng() * 2.5) + normal.x * 0.8;
            _puffO.vel[1] = ry * (3 + rng() * 2.5) + normal.y * 0.8 + 0.5;
            _puffO.vel[2] = rz * (3 + rng() * 2.5) + normal.z * 0.8;
            _puffO.life = 0.7 + rng() * 0.5;
            _puffO.size0 = 0.30 * s; _puffO.size1 = (1.2 + rng() * 0.6) * s;
            _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
            col3(0x8f8272, _puffO.col0); col3(0x6f675c, _puffO.col1);
            _puffO.alpha = 0.4; _puffO.grav = 0.3; _puffO.birthOffset = 0;
            particles.emit('dust', _puffO);
          }
          // brief incandescent crater glow pinned at the hole
          _puffO.pos[0] = pos.x + normal.x * 0.08; _puffO.pos[1] = pos.y + normal.y * 0.08; _puffO.pos[2] = pos.z + normal.z * 0.08;
          _puffO.vel[0] = 0; _puffO.vel[1] = 0; _puffO.vel[2] = 0;
          _puffO.life = 0.5;
          _puffO.size0 = 0.42 * s; _puffO.size1 = 0.30 * s;
          _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = 0;
          col3(0xffb050, _puffO.col0); col3(0xa2300a, _puffO.col1);
          _puffO.alpha = 0.85; _puffO.grav = 0; _puffO.birthOffset = 0;
          particles.emit('fire', _puffO);
          // tight bright spall cone + wide dimmer secondary fan (widths get
          // the distance boost too — a 0.03 m streak is sub-pixel at 340 m)
          sparkFan(pos, normal, 22, 26 * s, 0.45, 0xffd27e, 0.55, 0.032 * dk, 0.03, 0, 0.1);
          sparkFan(pos, normal, 14, 14 * s, 1.05, 0xffb860, 0.75, 0.024 * dk, 0.022, 0, 0.15);
          if (!blast) impactSmoke(pos, normal, 5, 1.1 * s, 0x2e2c2a, 0x5a5854, 0.65);
          break;
        }
        case 'he_pen':
          hitFlash(pos, normal, s * 1.3, 0xffffff, 0xff7018);
          heFireball(pos, caliberMm);
          sparkFan(pos, normal, 22, 18 * s, 1.1, 0xffc060, 0.8, 0.035, 0.028);
          break;
        case 'nonpen':
          sparkFan(pos, normal, 22, 20 * s, 0.9, 0xffd884, 0.55, 0.025 * dk, 0.022);
          if (blast) armorHit(blast, { x: pos.x, y: pos.y, z: pos.z, nx: normal.x, ny: normal.y, nz: normal.z, caliberMm, kind: 'nonpen' });
          else impactSmoke(pos, normal, 4, 0.8 * s, 0x8a867e, 0xa7a49c, 0.45);
          break;
        case 'ricochet': {
          // elongated deflection streaks skimming along the plate
          basisFrom(normal, _v1, _v2);
          for (let i = 0; i < 8; i++) {
            const a = rng() * Math.PI * 2;
            const v = 30 + rng() * 25;
            _strkO.pos[0] = pos.x; _strkO.pos[1] = pos.y; _strkO.pos[2] = pos.z;
            _strkO.vel[0] = (normal.x * 0.35 + _v1.x * Math.cos(a) + _v2.x * Math.sin(a)) * v;
            _strkO.vel[1] = (normal.y * 0.35 + _v1.y * Math.cos(a) + _v2.y * Math.sin(a)) * v;
            _strkO.vel[2] = (normal.z * 0.35 + _v1.z * Math.cos(a) + _v2.z * Math.sin(a)) * v;
            _strkO.life = 0.28 + rng() * 0.25;
            _strkO.width = 0.03 * dk; _strkO.stretch = 0.05; _strkO.grav = -21.6;
            col3(0xffe0a0, _strkO.col); _strkO.alpha = 1.0; _strkO.seed = rng(); _strkO.birthOffset = 0;
            particles.emit('sparks', _strkO);
          }
          sparkFan(pos, normal, 8, 12 * s, 1.1, 0xffcf80, 0.4, 0.02, 0.02);
          if (blast) armorHit(blast, { x: pos.x, y: pos.y, z: pos.z, nx: normal.x, ny: normal.y, nz: normal.z, caliberMm, kind: 'ricochet' });
          break;
        }
        case 'spaced_absorb':
          hitFlash(pos, normal, s * 0.7, 0xffe9b0, 0xff9040);
          sparkFan(pos, normal, 10, 12 * s, 1.0, 0xffce7a, 0.45, 0.022, 0.02);
          if (blast) armorHit(blast, { x: pos.x, y: pos.y, z: pos.z, nx: normal.x, ny: normal.y, nz: normal.z, caliberMm, kind: 'spaced' });
          else impactSmoke(pos, normal, 3, 0.7 * s, 0x77746e, 0x93908a, 0.4);
          break;
        case 'era': {
          // reactive tile pop: sharp directed blast + brick fragments
          hitFlash(pos, normal, s * 1.4, 0xffffff, 0xff6a10);
          sparkFan(pos, normal, 26, 24 * s, 0.8, 0xffc860, 0.6, 0.03, 0.026);
          if (blast) armorHit(blast, { x: pos.x, y: pos.y, z: pos.z, nx: normal.x, ny: normal.y, nz: normal.z, caliberMm, kind: 'era' });
          else impactSmoke(pos, normal, 6, 1.3 * s, 0x35322f, 0x605d58, 0.7);
          for (let i = 0; !blast && i < 4; i++) {
            _debO.pos[0] = pos.x; _debO.pos[1] = pos.y; _debO.pos[2] = pos.z;
            _debO.vel[0] = normal.x * (10 + rng() * 8) + (rng() - 0.5) * 6;
            _debO.vel[1] = normal.y * (10 + rng() * 8) + 4 + rng() * 4;
            _debO.vel[2] = normal.z * (10 + rng() * 8) + (rng() - 0.5) * 6;
            _debO.life = 1.8; _debO.scale = 0.12 + rng() * 0.08; _debO.spin = 10 + rng() * 15;
            _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
            _debO.groundY = groundY(pos.x, pos.z); _debO.hot = true; _debO.seed = rng(); _debO.birthOffset = 0;
            particles.emit('debris', _debO);
          }
          break;
        }
        case 'he_splash':
          if (pos.y - groundY(pos.x, pos.z) < 2.5 && mediaGroundHit(pos, heByCaliber(caliberMm), shellPointOnWater(pos), null)) break;
          heFireball(pos, caliberMm);
          if (pos.y - groundY(pos.x, pos.z) < 2.5) {
            if (shellPointOnWater(pos)) waterSplash(pos, caliberMm, true);
            else dirtPlume(pos, caliberMm, true);
          }
          break;
        case 'structure': {
          // World colliders are real shell targets. Give walls, buildings and
          // hard props a compact flash, chipped material and an outward dust
          // pulse so a stopped tracer can never read as having passed through.
          hitFlash(pos, normal, s * 0.65, 0xffedc7, 0xd59a55);
          sparkFan(pos, normal, 12, 13 * s, 0.85, 0xffcf83, 0.38, 0.022 * dk, 0.018);
          impactSmoke(pos, normal, 5, 0.72 * s, 0x777069, 0xa29a8e, 0.5);
          basisFrom(normal, _v1, _v2);
          for (let i = 0; i < 6; i++) {
            const a = rng() * Math.PI * 2;
            const side = 1.5 + rng() * 3;
            _debO.pos[0] = pos.x + normal.x * 0.04;
            _debO.pos[1] = pos.y + normal.y * 0.04;
            _debO.pos[2] = pos.z + normal.z * 0.04;
            _debO.vel[0] = normal.x * (3 + rng() * 5) + (_v1.x * Math.cos(a) + _v2.x * Math.sin(a)) * side;
            _debO.vel[1] = normal.y * (3 + rng() * 5) + (_v1.y * Math.cos(a) + _v2.y * Math.sin(a)) * side + 1.5;
            _debO.vel[2] = normal.z * (3 + rng() * 5) + (_v1.z * Math.cos(a) + _v2.z * Math.sin(a)) * side;
            _debO.life = 0.75 + rng() * 0.45;
            _debO.scale = 0.045 + rng() * 0.055;
            _debO.spin = 10 + rng() * 18;
            _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
            _debO.groundY = groundY(pos.x, pos.z); _debO.hot = false;
            _debO.seed = rng(); _debO.birthOffset = 0;
            particles.emit('debris', _debO);
          }
          break;
        }
        case 'terrain':
          if (mediaGroundHit(pos, heByCaliber(caliberMm), shellPointOnWater(pos), null)) break;
          if (shellPointOnWater(pos)) waterSplash(pos, caliberMm, caliberMm >= 105);
          else dirtPlume(pos, caliberMm, caliberMm >= 105);
          break;
        default:
          sparkFan(pos, normal, 10, 12 * s, 1.0, 0xffd884, 0.5, 0.025, 0.022);
          break;
      }
    },

    /**
     * Stamp a persistent armor-scar decal directly onto a struck vehicle.
     *
     * This legacy entry point is reserved for non-event callers such as
     * Studio dressing and covered battle warmup. Live combat shell:hit marks
     * are owned exclusively by bindBus above, which preserves their exact
     * articulation-local frame and guarantees one mark per hit event.
     * @param {object} visual TankVisual (needs .root)
     * @param {THREE.Vector3} pos world impact point
     * @param {THREE.Vector3} normal outward surface normal (world)
     * @param {number} caliberMm scales the scar
     */
    armorScar(
      visual: FxVisual,
      pos: THREE.Vector3,
      normal: THREE.Vector3,
      caliberMm: number,
    ): void {
      if (!visual || !visual.root) return;
      impactDecals.stampDirect(visual, pos, normal, caliberMm, 'pen');
    },

    /** @returns {object} live impact-decal counters (probes/perf gates) */
    impactDecalStats() { return impactDecals.stats(); },
    setLocalLights(on: boolean) { return setLocalLightsCompiled(on); },

    /**
     * Clear one vehicle's impact decals; the per-battle warm
     * stamps a scar on every fielded visual so the decal program compiles
     * behind the loading screen (it re-links per battle otherwise), then
     * clears the warm marks with this before the battle opens.
     * @param {object} visual TankVisual
     */
    clearVehicleDecals(visual: FxDecalVisual): void { impactDecals.clearVehicle(visual); },

    /**
     * Vehicle destruction: fireball, debris, persistent smoke column; calls
     * visual.setDestroyed() at t ≈ 0.15 s when visual given (turret pop only
     * on ammo-rack kills).
     * @param {THREE.Vector3} pos hull center (world)
     * @param {object|null} visual TankVisual or null
     * @param {'ammorack'|'shot'|'fire'} [cause] kill cause (varies the show)
     */
    destruction(
      pos: THREE.Vector3,
      visual: FxVisual | null,
      cause: DestructionCause = 'ammorack',
      wreckOf: string | null = null,
      opts: { shellBurst?: boolean } = {},
    ): void {
      spawnDestruction(pos, visual, 0, cause, wreckOf, !!opts.shellBurst);
    },

    /**
     * Track dust kicked up while driving. Call per frame per track; internally
     * probability-gated by intensity so callers need no rate limiting.
     * @param {THREE.Vector3} pos track contact point (world)
     * @param {THREE.Vector3} dir hull motion direction (unit-ish)
     * @param {number} intensity 0..1 from |speed| / topSpeed
     */
    dust(pos: THREE.Vector3, dir: THREE.Vector3, intensity: number): void {
      if (intensity <= 0.02) return;
      const waterMask = waterContactMaskAt(heightField, pos.x, pos.y, pos.z);
      if (waterMask > 0.02) {
        emitWetTrackDust(pos, dir, intensity, waterMask);
        return;
      }
      const surface = heightField?.getTrackSurfaceAt?.(pos.x, pos.z) ?? 0;
      if (intensity > 0.08 && !frozen) stampTrackPrint(pos, dir, false, surface);
      const groundType = heightField?.getGroundType?.(pos.x, pos.z) ?? 'medium';
      const surfaceMultiplier = drySurfaceMultiplier(groundType);
      if (rng() > intensity * 0.85 * surfaceMultiplier) return;
      const gy = groundY(pos.x, pos.z);
      updateDustCameraCaps(pos);
      // (the engine lane's s92 note, 2026-10-15: "orange glow puffs either side of the lead tank") a sett, concrete or
      // stone street has no loose earth: its tracks throw a low grit haze, never the earth wake's climbing tan billows,
      // which stood as glowing columns at every hull's rear corners on Steinburg's Hauptstrasse. An unpaved road keeps
      // its continuous trail (world/roadPave.ts: the carriageway's paved share, the one the terrain paints)
      const pave = groundType === 'hard' ? heightField?.getRoadPaveAt?.(pos.x, pos.z) ?? 0 : 0;
      if (pave > 0 && rng() < streetGritShare(pave)) {
        if (!frozen) emitStreetGrit(pos, dir, intensity, gy);
        return;
      }
      // destruction-fx (wave 265's weathering critics: no dust behind moving tanks at battle distance): on the media tier
      // a hull on sand trails a skirt of its own dust over the contact powder.
      // EF.01 (the owner, 2026-10-12: the dust "used to look more uniform ... continuous. like how it was before"): on
      // earth and grass the dry wake's continuous rolling ribbons are back on every tier (deploy 207's sprites, to the
      // last draw); deploy 208's media skirt there (07512bb07) had replaced them with separate clouds
      const skirt = !!blast && surface === 2;
      if (skirt && !frozen) mediaTrackSkirt(pos, dir, intensity, groundType, surface, gy);
      if (surface !== 0) {
        if (!frozen) emitTrackPowder(pos, dir, intensity, gy, surface);
        return;
      }
      updateDryDustColors(groundType);
      const sizeVariation = 0.6 + rng() * 0.8;
      const alphaVariation = 0.55 + rng() * 0.65;
      emitTrackKick(pos, dir, intensity, groundType, gy);
      emitDryTrackWake(
        pos, dir, intensity, groundType, gy, surfaceMultiplier, sizeVariation, alphaVariation,
      );
      if (groundType !== 'hard' && intensity > 0.28) {
        emitUpperTrackWake(pos, dir, intensity, gy);
      }
    },

    /**
     * Engine exhaust puff. Probability-gated like dust().
     * Default is the LIGHT profile (near-transparent warm grey, fast
     * dissipation) — correct for gas-turbine/modern powerpacks. Pass
     * sooty=true for WWII diesels to keep the darker puffing character
     * (r6: the Abrams dragged black soot blobs that hung against the sky).
     * @param {THREE.Vector3} pos exhaust stack tip (world)
     * @param {number} intensity 0..1 engine load
     * @param {boolean} [sooty=false] dark diesel puffs instead of thin haze
     */
    exhaust(pos: THREE.Vector3, intensity: number, sooty = false, vel: THREE.Vector3 | null = null,
      fwd: THREE.Vector3 | null = null, birthOffset = 0): void {
      // (round 7b, wave m2: "engine smoke rising as straight chimney columns") the media tier: round 7b's billow, with
      // the hull's motion, which the wind bends and the media's shear and eddies break up.
      // EF.01 (the owner, 2026-10-12: the smoke from tanks "used to look more uniform ... continuous. like how it was
      // before"; the coordinator's ruling, 2026-10-13): a running hull's exhaust is deploy 207's thin continuous sprite
      // streak below, on every tier; the billow is only an engine's bursts — its start (the cold-start cough) and a
      // throttle-up (the load jumping above what the engine ran at a moment ago), laid by the stack's travel
      // (trailCadence) so a burst under way is one connected gulp, not beads
      let coldBelch = true;
      if (blast && vel) {
        const coldStartM = battleFreshS < 2.2;
        const now = particles.getTime() + birthOffset;
        const n = fxTrails.step(TRAIL_EXHAUST, pos.x, pos.z, now,
          exhaustSpacing(Math.hypot(vel.x, vel.z), distBoost(pos.x, pos.y, pos.z)), 1 / EXHAUST_BURST_RATE, 4);
        const o = fxTrails.last * 2, aux = fxTrails.aux;
        if (fxTrails.fresh) { aux[o] = intensity; aux[o + 1] = -1e9; }
        // the load the engine has been running at: it follows a drop within a second or so and a rise slowly, so a
        // throttle-up after a real lift (a bot's or a player's brief stab of the pedal is not one) stands above it
        const base = aux[o], dt = fxTrails.lastDt;
        if (intensity - base > EXHAUST_THROTTLE_UP && now > aux[o + 1] + EXHAUST_BURST_REST_S) aux[o + 1] = now + EXHAUST_BURST_S;
        aux[o] = base + (intensity - base) * Math.min(1, dt * (intensity > base ? 1.5 : 2));
        if (coldStartM || now < aux[o + 1]) {
          const births = fxTrails.births;
          const load = coldStartM ? Math.max(0.9, intensity) : intensity;
          for (let i = 0; i < n; i++) {
            exhaustPuff(blast, births[i * 3], pos.y, births[i * 3 + 1], vel.x, vel.z, fwd ? fwd.x : 0, fwd ? fwd.z : 0,
              load, sooty, birthOffset - births[i * 3 + 2]);
          }
        }
        // the cold start is the billow's here, not the sprites' belch
        coldBelch = false;
      } else if (blast) {
        // a Studio one-shot (an engine-smoke or exhaust beat, no hull motion): round 7b's billow at the engine's rate
        const coldStartM = battleFreshS < 2.2;
        const rate = coldStartM ? 9 : sooty ? 3 + 4 * intensity : 2 + 2 * intensity;
        if (rng() > rate / 60) return;
        exhaustPuff(blast, pos.x, pos.y, pos.z, 0, 0, fwd ? fwd.x : 0, fwd ? fwd.z : 0,
          coldStartM ? Math.max(0.9, intensity) : intensity, sooty, birthOffset);
        return;
      }
      // r1 "not a single exhaust puff anywhere": the old profile (alpha
      // 0.06-0.29, sub-meter cards, <1.2 s lives) was invisible from any
      // gameplay camera. Diesel puffs are now a clearly readable grey-brown
      // chug that shears downwind; turbines emit a visible warm haze plume
      // that thickens with throttle. Rates stay probability-gated.
      // r4 COLD-START BELCH: for ~2 s after battle start (the flyby window)
      // engines visibly light off — diesels cough a fat dark slug, turbines
      // whoosh a tall pale heat plume. Rate floor raised so the beat cannot
      // miss the sweep.
      const coldStart = battleFreshS < 2.2;
      if (coldStart && coldBelch && rng() < 0.35) {
        // r5 (critic: "cold-start belch is a single detached white cotton-
        // ball floating above the deck"): each belch event now emits a
        // 3-puff STREAM anchored at the louvres — small at the stack,
        // expanding as it climbs, births staggered so no frame ever catches
        // one orphaned blob with clear air under it.
        // r6 (flyby minor: "stray white exhaust wisp puff sitting ON the rear
        // deck"): belch puffs spawn CLEAR of the deck plate (+0.4 m and up)
        // with a faster initial rise, so no flyby frame catches a newborn
        // full-alpha card lying flat on the engine covers.
        for (let bi = 0; bi < 3; bi++) {
          _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.15;
          _puffO.pos[1] = pos.y + 0.4 + bi * 0.24;
          _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.15;
          _puffO.vel[0] = (rng() - 0.5) * 0.5 + COLUMN_WIND_X * 0.3;
          _puffO.vel[1] = 2.0 + rng() * 1.1;
          _puffO.vel[2] = (rng() - 0.5) * 0.5 + COLUMN_WIND_Z * 0.3;
          _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2.5;
          if (sooty) {
            _puffO.life = 1.5 + rng() * 0.7;
            _puffO.size0 = 0.22; _puffO.size1 = 2.2 + rng() * 0.8;
            col3(0x2e2b28, _puffO.col0); col3(0x5f5c58, _puffO.col1);
            _puffO.alpha = 0.46;
          } else {
            _puffO.life = 1.0 + rng() * 0.5;
            _puffO.size0 = 0.2; _puffO.size1 = 1.7 + rng() * 0.6;
            col3(0x8d8b86, _puffO.col0); col3(0x9a9894, _puffO.col1);
            _puffO.alpha = 0.24;
          }
          _puffO.grav = 0.6; _puffO.birthOffset = birthOffset - bi * 0.09 - rng() * 0.05;
          particles.emit('smoke', _puffO);
        }
      }
      if (rng() > (coldStart ? 0.7 : 0.30 + intensity * 0.5)) return;
      _puffO.pos[0] = pos.x; _puffO.pos[1] = pos.y + 0.25; _puffO.pos[2] = pos.z; // r6: clear the deck
      _puffO.vel[0] = (rng() - 0.5) * 0.5 + COLUMN_WIND_X * 0.4;
      _puffO.vel[1] = 1.4 + rng() * 1.3 + intensity * 1.2;
      _puffO.vel[2] = (rng() - 0.5) * 0.5 + COLUMN_WIND_Z * 0.4;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
      if (sooty) {
        // diesel: distinct dark puffs popping off the stacks, thinning as
        // they rise — readable at idle, a rolling chug under full throttle
        _puffO.life = 1.1 + rng() * 0.9;
        _puffO.size0 = 0.26 + intensity * 0.2;
        _puffO.size1 = 1.4 + intensity * 1.2;
        col3(0x3b3835, _puffO.col0); col3(0x6e6c68, _puffO.col1);
        _puffO.alpha = 0.30 + 0.22 * intensity;
      } else {
        // turbine: fast pale grey heat-haze jet off the deck vents
        _puffO.life = 0.7 + rng() * 0.6;
        _puffO.size0 = 0.22 + intensity * 0.18;
        _puffO.size1 = 1.1 + intensity * 0.9;
        col3(0x8d8b86, _puffO.col0); col3(0x9a9894, _puffO.col1);
        _puffO.alpha = 0.14 + 0.14 * intensity;
      }
      _puffO.grav = 0.5; _puffO.birthOffset = birthOffset;
      particles.emit('smoke', _puffO);
    },

    /**
     * Small contact beat for persistent loose metal dressing. Unlike
     * propCrush this emits no wood splinters and does not imply destruction:
     * a few contact sparks plus curb dust sell the shove while the real mesh
     * continues rolling and can be hit again.
     */
    loosePropHit(pos: THREE.Vector3, dir: THREE.Vector3, heightM = 0.8): void {
      const gy = groundY(pos.x, pos.z);
      _v3.set(pos.x, gy + Math.min(0.48, heightM * 0.45), pos.z);
      sparkFan(_v3, _UP, 4, 4.5, 0.45, 0xffd2a0, 0.34, 0.018, 0.026, 0, 0.08);
      for (let i = 0; i < 4; i++) {
        const a = rng() * Math.PI * 2;
        _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.28;
        _puffO.pos[1] = gy + 0.10 + rng() * 0.18;
        _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.28;
        _puffO.vel[0] = Math.cos(a) * (0.5 + rng()) + dir.x * 0.8;
        _puffO.vel[1] = 0.35 + rng() * 0.6;
        _puffO.vel[2] = Math.sin(a) * (0.5 + rng()) + dir.z * 0.8;
        _puffO.life = 0.55 + rng() * 0.35;
        _puffO.size0 = 0.16 + rng() * 0.10; _puffO.size1 = 0.7 + rng() * 0.35;
        _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
        col3(0x8d877c, _puffO.col0); col3(0x716c63, _puffO.col1);
        _puffO.alpha = 0.28 + rng() * 0.10; _puffO.grav = -0.4; _puffO.birthOffset = 0;
        particles.emit('dust', _puffO);
      }
    },

    /**
     * Crushable-prop impact (telephone pole / fence hit by a tank): dust
     * burst at the base, wood splinters whipped along the travel direction,
     * and a few bark chips. Called by the collision integration (see
     * docs/SYSTEMS.md — main.ts detects the overlap and
     * drives the prop's hinge-topple; this is the particle beat).
     * @param {THREE.Vector3} pos prop base (world)
     * @param {THREE.Vector3} dir tank travel direction (unit-ish, XZ)
     * @param {number} [heightM=6] prop height (scales the splinter throw)
     */
    warmStructures(pos: THREE.Vector3): number {
      attachWorld();
      const laid = stages ? stages.warm(pos, bucketMaterials.keys()) : 0;
      // (2026-10-12) the rigid rubble's one program compiles with the warm too, not at the first collapse
      // every body mesh the world's buckets can take, made here rather than at a first throw mid-battle
      rubble?.prewarm(bucketMaterials.keys());
      const first = bucketMaterials.keys().next();
      const bodies = rubble && !first.done
        ? rubble.throw(first.value, 'block', pos.x, pos.y + 0.6, pos.z, 0, 0, 0, 1, 0.5, 0.5, 0.5, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0) ? 1 : 0
        : 0;
      // (2026-10-15) the fracture's own draw (a bucket's material casting through the default depth program: its faces,
      // its bodies, its heaps) compiles with the warm too, not at the first broken wall
      const fractured = fractureStages && !first.done ? fractureStages.warm(pos, bucketMaterials.get(first.value)?.material ?? null) : 0;
      return laid + bodies + fractured;
    },
    propCrush(pos: THREE.Vector3, dir: THREE.Vector3, heightM = 6): void {
      const gy = groundY(pos.x, pos.z);
      // base dust burst
      for (let i = 0; i < 10; i++) {
        const a = rng() * Math.PI * 2;
        _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.5;
        _puffO.pos[1] = gy + 0.3 + rng() * 0.4;
        _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.5;
        _puffO.vel[0] = Math.cos(a) * (1.6 + rng() * 2.2) + dir.x * 2.5;
        _puffO.vel[1] = 1.0 + rng() * 1.4;
        _puffO.vel[2] = Math.sin(a) * (1.6 + rng() * 2.2) + dir.z * 2.5;
        _puffO.life = 1.4 + rng() * 1.0;
        _puffO.size0 = 0.5 + rng() * 0.3; _puffO.size1 = 2.2 + rng() * 1.2;
        _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
        col3(0x8a8271, _puffO.col0); col3(0x776f60, _puffO.col1);
        _puffO.alpha = 0.42 + rng() * 0.15; _puffO.grav = -0.4; _puffO.birthOffset = 0;
        particles.emit('dust', _puffO);
      }
      // splinter chips thrown up the break line
      for (let i = 0; i < 8; i++) {
        _debO.pos[0] = pos.x; _debO.pos[1] = gy + 0.4 + rng() * Math.min(1.2, heightM * 0.2); _debO.pos[2] = pos.z;
        _debO.vel[0] = dir.x * (3 + rng() * 4) + (rng() - 0.5) * 4;
        _debO.vel[1] = 2.5 + rng() * 4;
        _debO.vel[2] = dir.z * (3 + rng() * 4) + (rng() - 0.5) * 4;
        _debO.life = 1.3; _debO.scale = 0.05 + rng() * 0.06; _debO.spin = 12 + rng() * 16;
        _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
        _debO.groundY = gy; _debO.hot = 0; _debO.seed = rng(); _debO.birthOffset = 0;
        particles.emit('debris', _debO);
      }
    },

    /**
     * Destructible-prop break burst (world-dressing r1) — the KIND-flavored
     * beat layered on the break/topple moment: wood splinters for fences,
     * carts, crates and stalls; sprung staves for barrels; a slow straw puff
     * for hay; terracotta shards for pottery; a spark clang for metal. Rides
     * the same debris/dust particle language as propCrush/module hits.
     * Called through the src/world/destructibles.ts seam (props.ts caps the
     * rate — max ~6 flavored bursts per frame).
     * @param {string} kind destructible kind ('barrel', 'fenceplank', ...)
     * @param {THREE.Vector3} pos break point (world)
     * @param {THREE.Vector3} dir break direction (unit-ish, XZ)
     * @param {number} [heightM=1.2] prop height (scales throws)
     */
    propBreak(
      kind: string,
      pos: THREE.Vector3,
      dir: THREE.Vector3,
      heightM = 1.2,
    ): void {
      const gy = groundY(pos.x, pos.z);
      // DESTRUCTIBLES r1: dir now carries MAGNITUDE — 1 = shell-grade break,
      // a ramming hull scales it with its overrun speed (props.ts breakRecord)
      // so every throw velocity below inherits the tank's momentum.
      const family = propBreakFamily(kind);
      // (dcore 2026-10-10, waves 350/351: a killed map vehicle flipped to the burnt wreck in a frame) a vehicle a round
      // destroys burns: its fire and smoke column take hold over it while its paint chars (props.ts, the crush copy)
      if (family === 'vehicleburn') {
        // (the car-wreck lane) a map car passes its length (its nose's half length) as `dir`: it burns longer, its fire in
        // its cabin (its base under the car's), its light lower and night-scaled
        const car = Math.hypot(dir.x, dir.z) > 0.3;
        const col: SmokeColumn = { key: null, pos: [pos.x, car ? pos.y : Math.max(pos.y, gy), pos.z], acc: 0, ttl: car ? CAR_BURN_S : VEHICLE_BURN_S,
          scale: Math.max(0.45, Math.min(0.75, heightM * 0.3)), flame: true,
          ...(car ? { car: [dir.x, dir.z, heightM] as [number, number, number] } : {}) };
        columns.push(col);
        emitColumnPuff(col);
        capColumns();
        return;
      }
      // destruction-fx lane: on the media tiers a prop breaks into its own material's pieces and dust (main threw the
      // charred-metal wreck chunks for a wooden hut and a fieldstone wall alike)
      if (blast && (family === 'woodbuilding' || family === 'canvasbuilding' || family === 'metalbuilding'
        || family === 'masonry' || family === 'sandbag' || family === 'wood' || family === 'hay')) {
        propBreakFx(blast, family, kind, pos.x, pos.z, gy, dir.x, dir.z, heightM);
        if (family === 'metalbuilding') {
          _v3.set(pos.x, gy + Math.min(1.8, heightM * 0.42), pos.z);
          sparkFan(_v3, _UP, 12, 9, 1.3, 0xffc980, 0.5, 0.035, 0.045, 0, 0.14);
        }
        return;
      }
      if (family === 'woodbuilding' || family === 'canvasbuilding' || family === 'metalbuilding') {
        emitBuildingBreak(family, pos, dir, heightM, gy);
        return;
      }
      if (family === 'masonry') {
        emitMasonryBreak(kind, pos, dir, heightM, gy);
        return;
      }
      if (family === 'sandbag') {
        emitSandbagBreak(pos, dir, gy);
        return;
      }
      if (family === 'vehicle') {
        emitVehicleBreak(pos, dir, heightM, gy);
        return;
      }
      if (family === 'vehiclecrush' || family === 'vehiclewreck') {
        emitVehicleCrunch(pos, dir, heightM, gy, family === 'vehiclewreck');
        return;
      }
      if (family === 'canvas') {
        emitCanvasBreak(pos, dir, gy);
        return;
      }
      if (family === 'ammo') {
        emitAmmoBreak(pos, dir, gy);
        return;
      }
      if (family === 'drumblast') {
        emitDrumBlast(pos, gy);
        return;
      }
      if (family === 'hay') {
        emitHayBreak(pos, dir, heightM, gy);
        return;
      }
      if (family === 'metal') {
        emitMetalBreak(pos, dir, heightM, gy);
        return;
      }
      emitWoodBreak(family, pos, dir, heightM, gy);
    },

    /**
     * Freeze/unfreeze all fx (particle clock, timers, emitters, lights).
     *
     * r4 AGE-PRESERVING REBASE: when the pin moves the shared clock by more
     * than ~20 s (harness/probe pinning to a VIEW_TIME anchor like 500/900
     * from a live clock near 0), every live birth stamp, ring, light, decal
     * and trail is SHIFTED by the same delta so in-flight effects keep their
     * age instead of instantly expiring. Without this, any combat event that
     * landed before the pin (a kill staged a second before setFrozen) showed
     * up in stepped captures as a bare wreck with zero fx — the exact
     * "standard kill has no VFX" critical. Staged screenshot views are
     * unaffected: __SHOTS.set() calls resetAll() before pinning, so the
     * rebase operates on an empty system there.
     * @param {boolean} f
     * @param {number|null} [atTimeS] pin the shared clock to this time
     */
    setFrozen(f: boolean, atTimeS: number | null = null): void {
      if (atTimeS != null) rebaseFxClock(atTimeS);
      frozen = f;
      particles.setFrozen(f, atTimeS);
    },

    /**
     * Re-seed the deterministic effect RNG.
     * @param {number} newSeed
     */
    resetSeed(newSeed: number): void {
      rng = mulberry32(newSeed);
    },

    /**
     * Pin the shared clock to exactly `atTimeS` with the age-preserving rebase
     * (no 20 s threshold). Scene Studio pins 0 at every load and seek, so
     * clock-phased shading (fire flicker) and every stamp derived from the
     * clock depend on the timeline alone, never on how long the page has run.
     * @param {number} [atTimeS]
     */
    resetClock(atTimeS = 0): void {
      rebaseFxClock(atTimeS, true);
      particles.setFrozen(frozen, atTimeS);
      printUniforms.uTime.value = atTimeS;
    },

    /** Kill all particles, tracers, decals, timers, emitters and lights. */
    resetAll(options?: { running?: boolean }) {
      replaySuppressed = false;
      auxiliaryClock = null;
      auxiliary?.reset(); drones.reset();
      lensGuns?.hide(); lensUp = false; lensCarrier = null;
      particles.resetAll();
      vol?.reset();
      smokeTrails.reset();
      wires.reset();
      chunks?.reset();
      craters?.reset();
      mapCraterMarks?.reset(); mapCratersLaidEpoch = -1;
      structMask?.reset();
      structDebris?.reset();
      rubble?.reset();
      stages?.reset();
      fractureStages?.reset();
      strikeDust.clear();
      landingGround.clear();
      skirtHead = 0; skirtCount = 0;
      fxTrails.reset();
      lastBlast.structureId = -1;
      lastGroundBlast.craterId = -1;
      pendingHeCount = 0;
      burstDrawn.clear();
      burstOnHull.clear();
      shellMunitions.clear();
      lastTickS = particles.getTime();
      // fresh battle — arm the flyby exhaust start-up burst (atmospherics r2, wave 311: not for a Studio scene, whose hulls
      // are already running: its cough read as the smoke launch "bursting into dark brown-black smoke")
      battleFreshS = options?.running ? 999 : 0;
      guidedTrails.clear();
      missileLaunchAt.clear();
      missileByShooter.clear();
      calibreByShooter.clear();
      tracers.reset(); // atmospherics lane
      liveAtgmCount = 0;
      bodies.reset();
      atgmFlares.count = 0;
      renderedAtgmBodies = 0;
      renderedAtgmTrailSegments = 0;
      timers.length = 0;
      columns.length = 0;
      lastKnownPos.clear();
      shellKinds.clear();
      sweepTails.clear();
      for (const m of scorchMeshes) m.visible = false;
      scorchCursor = 0;
      printBirth.array.fill(-1e9);
      printSurface.array.fill(0);
      printBirth.needsUpdate = true;
      printSurface.needsUpdate = true;
      printCenters.fill(1e9);
      printCursor = 0;
      for (const r of shockRings) { r.bornAt = -1e9; r.mesh.visible = false; r.mat.opacity = 0; }
      shockCursor = 0;
      for (const r of muzzleRings) { r.bornAt = -1e9; r.mesh.visible = false; r.mat.opacity = 0; }
      muzzleRingCursor = 0;
      impactDecals.clearAll();
      resetEquipmentDamage();
      for (const st of lightStates) { st.bornAt = -1e9; st.light.intensity = 0; }
    },

    setAuxiliaryClock(clock: (() => number) | null): boolean {
      auxiliaryClock = clock;
      return auxiliary !== null;
    },

    cinematicPort(): FxCinematicPort {
      if (cinematicPortState) return cinematicPortState;
      cinematicPortState = {
        group,
        sharing: particles.sharing,
        createParticleSystem,
        heightField,
        explosionLight,
        explosionPeak: EXPLOSION_LIGHT_PEAK,
        groundY,
        explosionFlashAgeS: () => lightAge(lightStates[1]),
        flashExplosion: (pos, peak, ageS = 0) => flashLight(lightStates[1], pos, peak, ageS),
        setLateFxActive: (fn) => { extraLateFxActive = fn; },
        setColumnCap: (cap) => {
          columnCap = cap == null ? MAX_COLUMNS : Math.max(1, Math.floor(cap));
          capColumns();
        },
        setLightTintShading: (on) => { cinematicTintOwner = on; },
        setMuzzleExposure: (light, cards) => {
          muzzleLightScale = light;
          for (const pool of ['flash', 'jet'] as const) {
            const material = particles.pools[pool].mesh.material as THREE.ShaderMaterial;
            if (!muzzleCardBase.has(material)) muzzleCardBase.set(material, material.uniforms.uIntensity.value);
            material.uniforms.uIntensity.value = (muzzleCardBase.get(material) ?? 1) * cards;
          }
        },
        stampTrackPrint,
      };
      return cinematicPortState;
    },

    /**
     * Deterministic screenshot composer: a firing moment frozen at ageS —
     * muzzle flash + smoke ring + tracer streak already down-range.
     * @param {{ muzzlePos: THREE.Vector3, dir: THREE.Vector3, caliberMm: number,
     *           tracerType: string, ageS: number }} o
     */
    composeFiringMoment({ muzzlePos, dir, caliberMm, tracerType, ageS, rocket = false, velocityMps }: FiringMoment): void {
      const vel = rocket ? velocityMps || 300 : COMPOSED_ROUND_MPS[tracerType === 'DRONE' ? 'AP' : tracerType] || 800;
      // NOTE (r5): the recipe samples gunMuzzleWorld AFTER advancing the
      // recoil, and the rendered barrel is equally recoiled — the anchor
      // always matches the visible tip, so the flash spawns exactly on it.
      // reach 0.55: the combat_firing camera has ~3.5 m of clear down-range
      // before the frame edge; the jet cone is compressed to sit inside it
      if (rocket) spawnRocketIgnition(muzzlePos, dir, caliberMm, -ageS);
      else spawnMuzzleFlash(muzzlePos, dir, caliberMm, -ageS, 0.55);
      if (tracerType === 'APFSDS') spawnSabotPetals(muzzlePos, dir, -ageS);
      // shell position at ageS, tracer streak trailing back toward the muzzle.
      // Head capped at 2.2 m: clearly departed the barrel (a visible shot,
      // not an inert flash) yet still inside the combat_firing frame.
      // Width/brightness CUT HARD from r5 (2.2x/1.0 + a 3.0x/0.75 bridge):
      // those two fat additive ribbons out-shone the flash itself, so the
      // frame's brightest mass floated 1.5-3 m downrange of a bare barrel tip
      // (r6 critical). The tracer is now a slim bolt; the boosted core/jets
      // at the bore own the center-of-brightness.
      // lighting_post r5 (critic minor: contract tracer invisible in
      // combat_firing): at the 1.7 m cap the bolt was buried inside the
      // flash core; at 3.4 m it clearly separates downrange and stays
      // inside the frame.
      const headDist = Math.min(vel * ageS, 3.4);
      const len = Math.min(THREE.MathUtils.clamp(vel * 0.02, 2, 12), headDist - 0.55);
      _v1.copy(muzzlePos).addScaledVector(dir, headDist);
      _v2.copy(muzzlePos).addScaledVector(dir, Math.max(headDist - len, 0.3));
      // ONE round's tracer (r7: the 1.3x/0.8 + 1.2x/0.32 pair read as multiple simultaneous tracers from a single shot).
      // (ac130-fx-228) drawn by the projectile tracers as a live round of this calibre draws (the media lane: the old
      // ribbon's "white bolt reads as a beam"), aged on the effects clock so stepped captures fade it honestly
      tracers.compose(_v1.x, _v1.y, _v1.z, _v2.x, _v2.y, _v2.z, caliberMm, particles.getTime(), rocket);
      // muzzle light state at ageS — still glowing at 50 ms (dur 120 ms).
      // r2 ON THE BORE at the tip (was muzzle - 0.9 m, +0.4 up): the pulled-
      // back overhead light pooled on the tube's TOP at mid-length and froze
      // in the 3x judged frame as a glowing lozenge between bore evacuator
      // and muzzle — "as if the barrel exploded midway" (r2 major). At the
      // tip the falloff still walks down the last meter of tube and kicks
      // onto the mantlet/hull front, but the hottest lit metal is the muzzle.
      _sv.copy(muzzlePos).addScaledVector(dir, -0.18);
      _sv.y += 0.10;
      // (233) a gun's by its bore and the ground under the muzzle (muzzleLightPulse); (240) a rocket's too, at its motor's 0.3
      const pulse = muzzleLightPulse(caliberMm, _sv.x, _sv.y, _sv.z);
      flashLight(lightStates[0], _sv, MUZZLE_LIGHT_PEAK * (rocket ? 0.3 : 1) * pulse.peakK * muzzleLightScale, ageS,
        undefined, undefined, undefined, pulse.range);
    },

    /**
     * Deterministic screenshot composer: a destruction frozen at ageS —
     * fireball + debris mid-flight + smoke column establishing.
     * @param {{ pos: THREE.Vector3, ageS: number }} o
     */
    composeExplosionMoment({ pos, ageS }: ExplosionMoment): void {
      if (!window.__FX_SKIP_DESTRUCTION) spawnDestruction(pos, null, -ageS);
      // pre-seed the smoke column puffs that would have been emitted by now
      const col = columns[columns.length - 1];
      if (col) {
        const ticks = Math.floor(ageS / COLUMN_TICK_S);
        for (let i = 0; i < ticks; i++) {
          // backdated births so the column reads as ageS old when frozen
          emitColumnPuff(col, -(ageS - (i + 1) * COLUMN_TICK_S));
        }
        col.ttl = SMOKE_COLUMN_S - ageS;
      }
      // light above the hull: terrain and wreck catch warm falloff without
      // the hull saturating to flat emissive orange
      flashLight(lightStates[1], _sv.set(pos.x, pos.y + 3.8, pos.z), EXPLOSION_LIGHT_PEAK, ageS);
    },
  };

  // world-dressing r1: hand the destructible-prop seam its particle provider —
  // props.ts emits (kind, pos, dir, h) whenever a small prop breaks/topples
  // and the kind-flavored burst renders through fx.propBreak above.
  {
    const _bkPos = new THREE.Vector3();
    const _bkDir = new THREE.Vector3();
    setBreakFxProvider((kind, x, y, z, dx, dz, h, scarM = 0) => {
      if (frozen) return; // screenshot pins stay deterministic
      _bkPos.set(x, y, z);
      _bkDir.set(dx, 0, dz);
      fx.propBreak(kind, _bkPos, _bkDir, h);
      // (a fracture-ready kind's churned ground: its anatomy's groundScarM, the charred decal under its wreck)
      if (scarM > 0) spawnScorch(x, z, scarM);
    });
  }

  return fx;
}
