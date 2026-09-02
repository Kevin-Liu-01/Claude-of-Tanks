/**
 * state.ts — legacy solo battle setup and fixed-step combat integration
 * (ARCHITECTURE.md §1.5, §2.4, §4 step 2). The typed session shell/event bus
 * live in stateCore.ts; roster and visual planning live in rosterState.ts.
 * The render loop remains in main.ts.
 */
import * as THREE from 'three';
import type { ArmorIntersection, ArmorModel } from '../sim/armor.ts';
import type { BotNavigationGrid, BotRoutePoint } from '../sim/botRoutePlanner.ts';
import type {
  DamageGunSpec,
  DamageShell,
  DamageShellSpec,
  DamageTankSpec,
  CombatState,
  HitEvent,
} from '../sim/damage.ts';
import type {
  MovementArmorSpec,
  MovementContactGeometry,
  MovementGunSpec,
  MovementHeightField,
  MovementInput,
  MovementSpec,
  TankState,
} from '../sim/movement.ts';
import type {
  GameModeId,
  MatchModeController,
  MatchModePresentationState,
  MatchModeResult,
  MatchModeSpawn,
} from '../sim/matchModes.ts';
import type { SpecialActionSpec, SpecialActionState } from '../sim/specialActionPolicy.ts';
import type { ConcealerDisc, SpottingSystem, SpottingTank } from '../sim/spotting.ts';
import type { CollisionRecord } from '../world/collision.ts';
import type { EventBus, RandomSource } from './stateCore.ts';
import type { RosterEntity, RosterGameState } from './rosterState.ts';
import type { ModuleId } from '../sim/moduleCatalog.ts';
import type { FleetTankSpec } from '../vehicles/specContracts.ts';
import { getSpec } from '../vehicles/specs.ts';
import { tankTier } from '../vehicles/tier.ts';
import {
  createTankState, updateTank, fireRecoil, shotRecoilScale, computeDispersionRadM, SIM_DT,
} from '../sim/movement.ts';
import {
  prefersVerticalTankContact,
  resolveTankBodyContacts,
} from '../sim/tankBodyContacts.ts';
import { tankContactRect } from '../sim/tankContactShape.ts';
import { stepRolloverLifecycle } from '../sim/rollover.ts';
import {
  createShell, stepShell, applyDispersion, guideShellToward, shellGravityMps2,
} from '../sim/ballistics.ts';
import { tankPoseFromState, traceTank } from '../sim/armor.ts';
import {
  createCombatState, resolveShellHit, resolveHeBurst, tickFire, tickModuleRepairs,
  selectFirstAvailableShell, selectShell, startPostShotReload, tickReload, isHeClass, ramDamage,
  repairAllModules, startMagazineReload,
} from '../sim/damage.ts';
import {
  activateSpecialAction,
  createSpecialActionState,
  specialActionGuidesShell,
} from '../sim/specialActions.ts';
import {
  consumeAmmunition,
  hasAmmunition,
  totalAmmunition,
  totalAmmunitionCapacity,
} from '../sim/ammunition.ts';
import { createAI, roleOf } from './ai.ts';
import { createBotNavigationGrid, planBotRoute } from '../sim/botRoutePlanner.ts';
import { pushHullFromHull, pushHullFromObstacle } from '../world/collision.ts';
import { pushHullInsidePlayableBounds } from '../world/battlefieldBounds.ts';
import { getStoredDifficulty } from './input.ts';
// SPOTTING WIRING: concealment/spotting sim + camo-paint bonus source
import { createSpottingSystem, CAMO_PAINT_BONUS } from '../sim/spotting.ts';
import { hasCamoPaint, setCamoOverride, clearCamoOverrides, applyCamoPatterns } from '../vehicles/materials.ts';
// EQUIPMENT SYSTEM (game/equipment.ts): per-tank loadouts — the player's
// persisted picks, per-role AI defaults, and the equipMults record the
// damage/movement/repair hooks read off CombatState.
import {
  loadEquipment as loadEquipmentCatalog, applyEquipmentToCombat, defaultLoadoutFor,
} from './equipment.ts';
import { mulberry32 } from './stateCore.ts';
import { createMatchModeController, normalizeGameMode } from '../sim/matchModes.ts';
import { CONSUMABLE_RULES, cooldownRemaining } from './consumables.ts';
import { PLAYER_ACTION_BITS } from '../net/protocol.ts';
import {
  autoCamoIdsForBattle,
  ensureTankVisual,
  pickBattleParticipants,
} from './rosterState.ts';
export { createBus, createGameState, mulberry32 } from './stateCore.ts';

type TeamId = 'player' | 'enemy';
type Vec3Tuple = [number, number, number];
type Waypoint = BotRoutePoint;

interface SoloGunSpec extends MovementGunSpec, DamageGunSpec {
  shells: DamageShellSpec[];
  muzzles?: readonly { x?: number; y?: number; z?: number }[];
  soundProfile?: string;
  primaryGuided?: boolean;
}

type SoloArmorSpec = ArmorModel & MovementArmorSpec & {
  boundingRadiusM: number;
};

type SoloSpec = FleetTankSpec & Omit<MovementSpec, 'gun' | 'armor'> &
  Omit<DamageTankSpec, 'gun' | 'armor' | 'dims'> &
  Omit<SpecialActionSpec, 'gun'> & {
    id: string;
    name: string;
    dims: MovementSpec['dims'];
    gun: SoloGunSpec;
    armor: SoloArmorSpec;
  };

interface SoloCombatState extends CombatState {
  muzzleCursor?: number;
}

interface SoloInput extends MovementInput {
  throttle: number;
  steer: number;
  brake: boolean;
  fire: boolean;
  aimLocked: boolean;
  shellSlot: number;
  aimPoint: THREE.Vector3;
  actionBits: number;
}

interface SoloVisualContactGeometry extends MovementContactGeometry {
  bottomYM?: number | null;
}

interface SoloVisual {
  specId: string;
  root: THREE.Object3D;
  contactGeom?: SoloVisualContactGeometry | null;
  setVisible(visible: boolean): void;
  syncFromState(state: TankState): void;
  resetDestroyed?(): void;
  dispose(): void;
  gunMuzzleWorld(out: THREE.Vector3, muzzleIndex?: number): void;
  gunDirWorld(out: THREE.Vector3): void;
  gunPivotWorld(out: THREE.Vector3): void;
  turretTopWorld(out: THREE.Vector3): void;
  recoilKick(amount?: number, scale?: number, muzzleIndex?: number): void;
  setDestroyed(options: { pop: boolean }): void;
}

interface SoloAiController {
  update(dt: number, timeS: number): void;
  setWaypoints(points: Waypoint[], options?: { loop?: boolean }): void;
  notifyShellResult(event: SoloHitEvent): void;
  notifyUnderFire?(shooter: SoloEntity): void;
  notifyPlayerFired?(shooter: SoloEntity, rank?: number): void;
}

interface ReloadPresentationEvent {
  t: number;
  total: number;
  progress: number;
  kind: string;
  caliberMm: number;
  magazineRounds: number;
  magazineCapacity: number;
  done: boolean;
}

type SoloPooledEntity = Omit<RosterEntity,
  'spec' | 'team' | 'state' | 'combat' | 'specialAction' | 'input' | 'visual' |
  'contactGeom' | 'aiCtl'> & {
    spec: SoloSpec;
    team: TeamId;
    state: TankState | null;
    combat: SoloCombatState | null;
    specialAction: SpecialActionState | null;
    input: SoloInput;
    visual: SoloVisual | null;
    contactGeom: MovementContactGeometry | null;
    aiCtl: SoloAiController | null;
    consumableReadyAt?: number[];
    bot?: boolean;
    modeActive?: boolean;
    equip?: string[];
    _glbContactStampedVisual?: SoloVisual | null;
    _openingRoute?: Waypoint[] | null;
    _lastImpactT?: number;
    _modeTargetX?: number;
    _modeTargetZ?: number;
    _reloadEvent?: ReloadPresentationEvent;
  };

type SoloEntity = Omit<SoloPooledEntity, 'state' | 'combat' | 'specialAction'> & {
  state: TankState;
  combat: SoloCombatState;
  specialAction: SpecialActionState;
};

interface SoloHitEvent extends HitEvent {
  timeS?: number;
  attackerName?: string;
  attackerSpecId?: string;
  targetName?: string;
  targetSpecId?: string;
  targetMaxHp?: number;
}

interface KillcamRecorder {
  onShellHit(event: SoloHitEvent, target: SoloPooledEntity | null): void;
  onRam(event: SoloRamEvent, a: SoloEntity, b: SoloEntity): void;
  recordSimStep(game: SoloGameState): void;
}

interface EngineContext {
  scene: THREE.Scene;
}

interface ModeEvent {
  type: string;
  payload: object;
}

interface SoloGameState extends Omit<RosterGameState, 'allTanks' | 'tankById' | 'tanks' | '_engineCtx'> {
  allTanks: SoloPooledEntity[];
  tankById: Map<string, SoloPooledEntity>;
  tanks: SoloEntity[];
  _engineCtx: EngineContext;
  shells: DamageShell[];
  nextShellId: number;
  timeS: number;
  fireTickAcc: number;
  combatRng: RandomSource;
  result: 'victory' | 'defeat' | 'draw' | null;
  resultReason: string | null;
  gameMode: GameModeId;
  matchModeState: MatchModePresentationState | null;
  matchModeController: MatchModeController<SoloEntity> | null;
  modeEvents: ModeEvent[];
  player: SoloEntity | null;
  spotting: SpottingSystem | null;
  openingRouteJobs: Array<() => void>;
  mapId: string;
  killcam?: KillcamRecorder | null;
  _nextModeRouteS?: number;
  _ramPairT?: Map<string, number>;
}

interface SpawnPoint {
  pos: Vec3Tuple;
  yaw: number;
}

interface VillageBounds {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

interface SoloHeightField extends MovementHeightField {
  getNormalAt?(x: number, z: number): { y: number };
  _layout?: { village?: VillageBounds | null };
}

interface SoloWorldHit {
  dist: number;
  point: THREE.Vector3;
  normal?: THREE.Vector3 | null;
  kind?: string;
  record?: SoloObstacle | null;
}

interface SoloObstacle extends CollisionRecord {
  _pressT?: number;
  _pressS?: number;
}

interface SoloWorld {
  spawnPoints: { player: SpawnPoint; enemies: SpawnPoint[] };
  heightField: SoloHeightField;
  raycast(origin: { x: number; y: number; z: number }, direction: { x: number; y: number; z: number }, maxDist: number): SoloWorldHit | null;
  getObstacles(): SoloObstacle[];
  queryObstacles?: (
    minX: number,
    minZ: number,
    maxX: number,
    maxZ: number,
    out: SoloObstacle[],
  ) => SoloObstacle[];
  getConcealment?(): ConcealerDisc[];
  crushObstacle?(obstacle: SoloObstacle, dirX: number, dirZ: number, speedMps: number): void;
}

interface SetupBattleOptions {
  random?: boolean;
  gameMode?: GameModeId | string | null;
  deferCamoRepaint?: boolean;
  deferVisuals?: boolean;
  deferOpeningRoutes?: boolean;
}

interface CameraRig {
  addTrauma(amount: number): void;
  recoilKick?(pitch: number, scale: number): void;
}

interface RamContact {
  a: SoloEntity;
  b: SoloEntity;
  closing: number;
  nx: number;
  nz: number;
}

interface RamModuleHit {
  module: ModuleId;
  newState: 'red';
  dmg: number;
}

interface SoloRamEvent {
  aId: string;
  bId: string;
  aSpecId: string;
  bSpecId: string;
  dmgA: number;
  dmgB: number;
  closingMps: number;
  aIsPlayer: boolean;
  bIsPlayer: boolean;
  pos: Vec3Tuple;
  normal: Vec3Tuple;
  timeS: number;
  aModulesHit: RamModuleHit[];
  bModulesHit: RamModuleHit[];
}

interface RamResolution {
  a: SoloEntity;
  b: SoloEntity;
  bWasWreck: boolean;
  event: SoloRamEvent;
}

/** A lethal hull collision physically disables the struck running gear and
 * nearest drivetrain module. This is authoritative damage state, not a
 * kill-cam-only decoration; the replay consumes the same receipts the HUD and
 * tank visual receive. */
function applyLethalRamModuleDamage(
  ent: SoloEntity,
  normalX: number,
  normalZ: number,
): RamModuleHit[] {
  if (!ent.combat?.destroyed || !ent.combat.modules || !ent.state) return [];
  const rightDot = normalX * Math.cos(ent.state.yaw) - normalZ * Math.sin(ent.state.yaw);
  const nearTrack: ModuleId = rightDot >= 0 ? 'trackR' : 'trackL';
  const drivetrain: ModuleId = ent.combat.modules.transmission ? 'transmission' : 'engine';
  const names: ModuleId[] = [nearTrack, drivetrain];
  const hits: RamModuleHit[] = [];
  for (const name of names) {
    const module = ent.combat.modules[name];
    if (!module || module.state === 'red') continue;
    const hpBefore = Math.max(0, module.hp || 0);
    module.hp = 0;
    module.state = 'red';
    module.repairT = 0;
    hits.push({ module: name, newState: 'red', dmg: Math.round(hpBefore) });
  }
  return hits;
}

interface CrushContact {
  ob: SoloObstacle;
  ent: SoloEntity;
}

interface CollisionBundle {
  collide(pos: THREE.Vector3, radiusM: number, outPush: THREE.Vector3): boolean;
  setSelf(entity: SoloEntity): void;
  queueRam(a: SoloEntity, b: SoloEntity, closing: number, nx?: number, nz?: number): void;
  pendingCrush: CrushContact[];
  pendingRams: RamContact[];
  ramBestByPair: Map<string, RamContact>;
}

interface ShellFiredEvent {
  shellId: number;
  shooterId: string;
  isPlayer: boolean;
  shellType: string;
  shellName: string;
  caliberMm: number;
  velocityMps: number;
  timeS: number;
  muzzlePos: Vec3Tuple;
  dir: Vec3Tuple;
  weaponSound: string | null;
  muzzleIndex: number;
  recoilScale: number;
}

interface NearestTankTrace {
  distance: number;
  entity: SoloEntity | null;
  intersections: ArmorIntersection[] | null;
}

function isActiveSoloEntity(
  entity: SoloPooledEntity | null | undefined,
): entity is SoloEntity {
  return !!(entity?.state && entity.combat && entity.specialAction);
}

interface SoloDebugFlags {
  rosterExact?: boolean;
}

function soloDebugFlags(): SoloDebugFlags | null {
  const root = globalThis as typeof globalThis & {
    __DEBUG?: { flags?: SoloDebugFlags };
  };
  return root.__DEBUG?.flags || null;
}

const COMBAT_SEED = 6000;
// module repair duration lives with the state machine: sim/damage.ts REPAIR_S
const FIRE_TICK_S = 0.5;
const BATTLE_TIME_LIMIT_S = 900; // 15:00 clock (HUD counts it down) — timeout = draw
const ALLY_SPAWN_SLOTS = Object.freeze([
  Object.freeze({ lat: 26, back: 0 }),
  Object.freeze({ lat: -26, back: 0 }),
  Object.freeze({ lat: 52, back: 8 }),
  Object.freeze({ lat: -52, back: 8 }),
  Object.freeze({ lat: 20, back: 30 }),
  Object.freeze({ lat: -20, back: 30 }),
]);

// module-scope scratch — no per-frame allocation
const _muzzle = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _seg = new THREE.Vector3();
const _toC = new THREE.Vector3();
const _spawnPos = new THREE.Vector3();
const _contactCenter = new THREE.Vector3();
const _playerShotOrigin = new THREE.Vector3();
const _playerShotRecipients: SoloEntity[] = [];
const _nearestTankTrace: NearestTankTrace = {
  distance: Infinity,
  entity: null,
  intersections: null,
};

function comparePlayerShotRecipients(a: SoloEntity, b: SoloEntity): number {
  return a.state.pos.distanceToSquared(_playerShotOrigin) -
    b.state.pos.distanceToSquared(_playerShotOrigin);
}

// PERF (steady-churn): shell objects + the shell:fired payload were the last
// per-shot allocations in the combat hot path (8 tanks firing every 4-8 s for
// minutes feeds the major-GC cycle whose ~30 ms pauses show up in the 60 s
// frame-time tail). Dead shells return to a free list in stepShells; the
// fired-event payload is a reused scratch object (every consumer — fx muzzle
// flash, audio gunshot/whizz, HUD ammo counter, killcam traj-start, shot-info
// counters — reads it synchronously inside emit; verified 2026-07-28).
const _shellPool: DamageShell[] = [];
function acquireShell(
  shellSpec: DamageShellSpec,
  shooterId: string,
  isPlayer: boolean,
  muzzlePos: THREE.Vector3,
  dir: THREE.Vector3,
  id: number,
): DamageShell {
  const sh = _shellPool.pop();
  if (!sh) return createShell(shellSpec, shooterId, isPlayer, muzzlePos, dir, id);
  sh.id = id;
  sh.shooterId = shooterId;
  sh.isPlayer = isPlayer;
  sh.spec = shellSpec;
  sh.pos.copy(muzzlePos);
  sh.prevPos.copy(muzzlePos);
  sh.vel.copy(dir).multiplyScalar(shellSpec.velocityMps);
  sh.ageS = 0;
  sh.distM = 0;
  sh.dead = false;
  sh.penRollDone = false;
  sh.remainingPenMm = 0;
  sh.dmgRoll = 0;
  sh.bounces = 0;
  sh.carriedThrough = false;
  sh.gravityMps2 = shellGravityMps2(shellSpec);
  return sh;
}
const _firedEv: ShellFiredEvent = {
  shellId: 0, shooterId: '', isPlayer: false, shellType: '', shellName: '',
  caliberMm: 0, velocityMps: 0, timeS: 0,
  muzzlePos: [0, 0, 0], dir: [0, 0, 0],
  weaponSound: null, muzzleIndex: -1,
  recoilScale: 1,
};



/**
 * (Re)start a battle: place the chosen tank at the player spawn, the other
 * seven at the enemy spawns, reset movement/combat state and attach AI.
 * @param {object} game game state
 * @param {string} playerSpecId chosen TankId
 * @param {object} world World (§2.7)
 * @param {{random?:boolean}} [opts] COMMUNITY TANKS: random=true shuffles the
 *   enemy roster from the full pool (garage-started battles); default keeps
 *   the deterministic core-8 staging (boot, screenshot contract).
 * @returns {void}
 */
/**
 * EQUIPMENT (camo_spotting r1 → EQUIPMENT SYSTEM): per-tank loadout persisted
 * in localStorage (`cot.equip.<specId>`). Now delegates to game/equipment.ts,
 * which validates ids against the full catalog, era-gates modern-only gear
 * and clamps to the 3 slots. Kept as an export for compatibility.
 * @param {string} specId
 * @returns {?Array<string>} equipped item ids, or null when none saved
 */
export function loadEquipment(specId: string): string[] | null {
  const arr = loadEquipmentCatalog(specId, getSpec(specId));
  return arr.length ? arr : null;
}

function resetBattleSession(game: SoloGameState, options: SetupBattleOptions): void {
  for (const shell of game.shells) {
    if (_shellPool.length < 64) _shellPool.push(shell);
  }
  game.shells.length = 0;
  game.nextShellId = 1;
  game.timeS = 0;
  game.fireTickAcc = 0;
  game.combatRng = mulberry32(COMBAT_SEED);
  game.result = null;
  game.resultReason = null;
  game.gameMode = normalizeGameMode(options.gameMode);
  game.matchModeState = null;
  game.matchModeController = null;
  game.modeEvents.length = 0;
  game.battleCount++;
  game.openingRouteJobs.length = 0;
}

function configureBattleCamo(
  game: SoloGameState,
  playerSpecId: string,
  options: SetupBattleOptions,
): void {
  clearCamoOverrides();
  if (options.random) {
    for (const specId of autoCamoIdsForBattle(
      game.tanks, playerSpecId, game.mapId, true, game.battleCount,
    )) {
      setCamoOverride(specId, 'auto');
    }
  }
  if (!options.deferCamoRepaint) applyCamoPatterns();
}

function releaseParkedTank(game: SoloGameState, entity: SoloPooledEntity): void {
  entity.state = null;
  entity.combat = null;
  entity.ai = null;
  entity.aiCtl = null;
  entity.team = 'enemy';
  entity.isPlayer = false;
  entity.rigidGear = false;
  entity.contactGeom = null;
  entity._glbContactStampedVisual = null;
  if (!entity.visual) return;
  entity.visual.resetDestroyed?.();
  entity.visual.setVisible(false);
  game._engineCtx.scene.remove(entity.visual.root);
  entity.visual.dispose();
  entity.visual = null;
}

function prepareBattleVisuals(game: SoloGameState, deferVisuals: boolean): void {
  if (deferVisuals) ensureTankVisual(game, game.tanks[0]);
  else for (const entity of game.tanks) ensureTankVisual(game, entity);
  const activeEntities = new Set<SoloPooledEntity>(game.tanks);
  for (const entity of game.allTanks) {
    if (!activeEntities.has(entity)) releaseParkedTank(game, entity);
  }
}

function createBattleSpotting(game: SoloGameState, world: SoloWorld): SpottingSystem {
  return createSpottingSystem({
    getTanks: () => game.tanks as SpottingTank[],
    raycast: world.raycast,
    concealers: world.getConcealment?.() || [],
    getCamoBonus: (tank) => {
      const entity = tank as SpottingTank & { specId: string };
      return hasCamoPaint(entity.specId) ? CAMO_PAINT_BONUS : 0;
    },
    getEquipment: (tank) =>
      (tank as SpottingTank & { equip?: string[] }).equip || null,
    rng: mulberry32(9100),
  });
}

function chooseBattleAllies(
  game: SoloGameState,
  playerSpecId: string,
  randomBattle: boolean,
): SoloEntity[] {
  const candidates = game.tanks.filter((entity) => entity.specId !== playerSpecId);
  if (!randomBattle) {
    const preferred = ['m4a3e8', 't34_85', 'panther_g'];
    const allies = candidates.filter((entity) => preferred.includes(entity.specId));
    for (const entity of candidates) {
      if (allies.length >= 3) break;
      if (entity.specId !== 'tiger1' && !allies.includes(entity)) allies.push(entity);
    }
    return allies.slice(0, 3);
  }
  const exactCap = soloDebugFlags()?.rosterExact && candidates.length < 13 ? 3 : 6;
  const allyCap = Math.min(exactCap, Math.max(1, candidates.length - 1));
  const enemyCap = candidates.length - allyCap;
  const byTier = candidates.slice()
    .sort((a, b) => tankTier(b.specId) - tankTier(a.specId));
  const allies: SoloEntity[] = [];
  let allyTierSum = tankTier(playerSpecId);
  let enemyTierSum = 0;
  let enemyCount = 0;
  for (const entity of byTier) {
    const tier = tankTier(entity.specId);
    const allyRoom = allies.length < allyCap;
    const enemyRoom = enemyCount < enemyCap;
    if (allyRoom && (!enemyRoom || allyTierSum < enemyTierSum)) {
      allies.push(entity);
      allyTierSum += tier;
    } else {
      enemyCount++;
      enemyTierSum += tier;
    }
  }
  return allies;
}

type SoloAiDependencies = Parameters<typeof createAI>[1]['deps'];
type SharedAiDependencies = Omit<SoloAiDependencies, 'getEnemies' | 'getAllies' | 'spotting'>;
type OpeningRole = ReturnType<typeof roleOf>;

interface BattleSpawnContext {
  game: SoloGameState;
  world: SoloWorld;
  options: SetupBattleOptions;
  playerSpecId: string;
  allies: Set<SoloEntity>;
  allyTaken: Waypoint[];
  enemyCenterX: number;
  enemyCenterZ: number;
  playerPerpendicularX: number;
  playerPerpendicularZ: number;
  playerForwardX: number;
  playerForwardZ: number;
  obstacles: SoloObstacle[];
  concealment: ConcealerDisc[];
  village: VillageBounds | null;
  roleCounts: Record<TeamId, Record<string, number | boolean>>;
  teamHasBrawler: Record<TeamId, boolean>;
  teamHasScout: Record<TeamId, boolean>;
  aiDependencies: SharedAiDependencies;
  botNavigation: Readonly<BotNavigationGrid>;
  enemyIndex: number;
  allyIndex: number;
}

interface OpeningLane {
  role: OpeningRole;
  index: number;
  side: number;
}

function spawnCellBlocked(
  context: BattleSpawnContext,
  x: number,
  z: number,
  margin = 2.6,
): boolean {
  for (const obstacle of context.obstacles) {
    if (obstacle.crushed) continue;
    if (x > obstacle.min[0] - margin && x < obstacle.max[0] + margin &&
        z > obstacle.min[2] - margin && z < obstacle.max[2] + margin) return true;
  }
  return false;
}

function allyCellTaken(context: BattleSpawnContext, x: number, z: number): boolean {
  for (const point of context.allyTaken) {
    if (Math.hypot(point[0] - x, point[1] - z) < 14) return true;
  }
  return false;
}

function selectAllySpawn(context: BattleSpawnContext): SpawnPoint {
  const { world } = context;
  const playerSpawn = world.spawnPoints.player;
  const slot = ALLY_SPAWN_SLOTS[context.allyIndex++ % ALLY_SPAWN_SLOTS.length];
  let x = playerSpawn.pos[0] + context.playerPerpendicularX * slot.lat -
    context.playerForwardX * slot.back;
  let z = playerSpawn.pos[2] + context.playerPerpendicularZ * slot.lat -
    context.playerForwardZ * slot.back;
  if (world.heightField.getNormalAt) {
    for (let offsetIndex = 0; offsetIndex < 8; offsetIndex++) {
      const lateral = slot.lat + Math.sign(slot.lat || 1) * offsetIndex * 9;
      const candidateX = playerSpawn.pos[0] + context.playerPerpendicularX * lateral -
        context.playerForwardX * slot.back;
      const candidateZ = playerSpawn.pos[2] + context.playerPerpendicularZ * lateral -
        context.playerForwardZ * slot.back;
      if (world.heightField.getNormalAt(candidateX, candidateZ).y < 0.85) continue;
      if (world.heightField.getGroundType?.(candidateX, candidateZ) === 'soft') continue;
      if (spawnCellBlocked(context, candidateX, candidateZ) ||
          allyCellTaken(context, candidateX, candidateZ)) continue;
      x = candidateX;
      z = candidateZ;
      break;
    }
  }
  context.allyTaken.push([x, z]);
  return {
    pos: [x, world.heightField.getHeightAt(x, z), z],
    yaw: playerSpawn.yaw,
  };
}

function selectEnemySpawn(context: BattleSpawnContext): SpawnPoint {
  const { world } = context;
  let spawn = world.spawnPoints.enemies[context.enemyIndex++];
  if (!spawnCellBlocked(context, spawn.pos[0], spawn.pos[2])) return spawn;
  for (const radius of [4, 7]) {
    for (let index = 0; index < 8; index++) {
      const angle = (index / 8) * Math.PI * 2;
      const x = spawn.pos[0] + Math.sin(angle) * radius;
      const z = spawn.pos[2] + Math.cos(angle) * radius;
      if (spawnCellBlocked(context, x, z)) continue;
      return {
        pos: [x, world.heightField.getHeightAt(x, z), z],
        yaw: spawn.yaw,
      };
    }
  }
  return spawn;
}

function selectEntitySpawn(
  context: BattleSpawnContext,
  isPlayer: boolean,
  isAlly: boolean,
): SpawnPoint {
  if (isPlayer) return context.world.spawnPoints.player;
  return isAlly ? selectAllySpawn(context) : selectEnemySpawn(context);
}

function initializeBattleEntity(
  context: BattleSpawnContext,
  entity: SoloEntity,
  spawn: SpawnPoint,
  isPlayer: boolean,
  isAlly: boolean,
): void {
  _spawnPos.set(spawn.pos[0], spawn.pos[1], spawn.pos[2]);
  entity.team = isPlayer || isAlly ? 'player' : 'enemy';
  entity.isPlayer = isPlayer;
  entity.bot = !isPlayer;
  entity.modeActive = true;
  entity.state = createTankState(entity.spec, _spawnPos, spawn.yaw);
  entity.combat = createCombatState(entity.spec);
  entity.specialAction = createSpecialActionState(entity.spec);
  entity.equip = isPlayer
    ? (loadEquipment(entity.specId) || [])
    : defaultLoadoutFor(entity.spec);
  applyEquipmentToCombat(entity.combat, entity.equip, entity.spec);
  entity.input.throttle = 0;
  entity.input.steer = 0;
  entity.input.brake = false;
  entity.input.fire = false;
  entity.input.shellSlot = 0;
  entity.input.actionBits = 0;
  entity.input.aimPoint.copy(entity.state.aimPoint);
  entity.consumableReadyAt = [0, 0, 0];
  entity._destroyedAnnounced = false;
  entity._openingRoute = null;
  entity._lastImpactT = -1;
  entity.ai = null;
  entity.visual?.resetDestroyed?.();
  if (isPlayer) {
    context.game.player = entity;
    entity.aiCtl = null;
  }
}

function selectOpeningLane(
  context: BattleSpawnContext,
  entity: SoloEntity,
): OpeningLane {
  const counts = context.roleCounts[entity.team];
  let role = roleOf(entity.spec);
  if (role === 'flanker' && !context.teamHasBrawler[entity.team] && !counts._vanguard) {
    counts._vanguard = true;
    role = 'brawler';
  } else if (role === 'flanker' && !context.teamHasScout[entity.team] && !counts._scoutLane) {
    counts._scoutLane = true;
    role = 'scout';
  }
  const previousCount = counts[role];
  const index = typeof previousCount === 'number' ? previousCount : 0;
  counts[role] = index + 1;
  const side = (index % 2 === 0 ? 1 : -1) * (entity.team === 'enemy' ? 1 : -1);
  return { role, index, side };
}

function nearestBushWaypoint(
  context: BattleSpawnContext,
  x: number,
  z: number,
): Waypoint {
  let bestX = x;
  let bestZ = z;
  let bestDistance = 45;
  for (const disc of context.concealment) {
    if (!disc || disc.add < 0.3) continue;
    const distance = Math.hypot(disc.x - x, disc.z - z);
    if (distance >= bestDistance) continue;
    bestDistance = distance;
    bestX = disc.x;
    bestZ = disc.z;
  }
  return [bestX, bestZ];
}

function skirtTownWaypoint(
  village: VillageBounds | null,
  x: number,
  z: number,
): Waypoint {
  if (!village || village.x1 - village.x0 < 200) return [x, z];
  const padding = 24;
  const outside = 45;
  if (x < village.x0 - padding || x > village.x1 + padding ||
      z < village.z0 - padding || z > village.z1 + padding) return [x, z];
  const left = x - village.x0;
  const right = village.x1 - x;
  const bottom = z - village.z0;
  const top = village.z1 - z;
  const nearest = Math.min(left, right, bottom, top);
  if (nearest === left) return [village.x0 - outside, z];
  if (nearest === right) return [village.x1 + outside, z];
  if (nearest === bottom) return [x, village.z0 - outside];
  return [x, village.z1 + outside];
}

function clampBattleWaypoint(point: Waypoint): Waypoint {
  return [
    Math.max(-460, Math.min(460, point[0])),
    Math.max(-460, Math.min(460, point[1])),
  ];
}

function buildOpeningWaypoints(
  context: BattleSpawnContext,
  entity: SoloEntity,
  spawn: SpawnPoint,
  lane: OpeningLane,
): Waypoint[] {
  const target: Vec3Tuple = entity.team === 'enemy'
    ? context.world.spawnPoints.player.pos
    : [context.enemyCenterX, 0, context.enemyCenterZ];
  const deltaX = target[0] - spawn.pos[0];
  const deltaZ = target[2] - spawn.pos[2];
  const distance = Math.hypot(deltaX, deltaZ) || 1;
  const forwardX = deltaX / distance;
  const forwardZ = deltaZ / distance;
  const lateralX = forwardZ;
  const lateralZ = -forwardX;
  const { role, index, side } = lane;
  const waypoints: Waypoint[] = [];
  if (role === 'sniper') {
    const advance = 0.30 + (index % 3) * 0.06;
    const lateral = (34 + index * 27) * side;
    waypoints.push([
      spawn.pos[0] + deltaX * advance + lateralX * lateral,
      spawn.pos[2] + deltaZ * advance + lateralZ * lateral,
    ]);
  } else if (role === 'scout') {
    const lateral = (190 + index * 42) * side;
    waypoints.push(
      nearestBushWaypoint(context,
        spawn.pos[0] + deltaX * 0.42 + lateralX * lateral,
        spawn.pos[2] + deltaZ * 0.42 + lateralZ * lateral),
      nearestBushWaypoint(context,
        spawn.pos[0] + deltaX * 0.68 + lateralX * lateral * 0.7,
        spawn.pos[2] + deltaZ * 0.68 + lateralZ * lateral * 0.7),
      [target[0], target[2]],
    );
  } else if (role === 'flanker') {
    const lateral = (95 + (index % 3) * 38) * side;
    const standoff = Math.min(distance, 165 + (index % 3) * 22);
    waypoints.push(
      [spawn.pos[0] + deltaX * 0.45 + lateralX * lateral,
        spawn.pos[2] + deltaZ * 0.45 + lateralZ * lateral],
      [target[0] - forwardX * standoff + lateralX * lateral * 0.55,
        target[2] - forwardZ * standoff + lateralZ * lateral * 0.55],
      [target[0], target[2]],
    );
  } else {
    const lateral = ((index % 3) - 1) * 44 * (entity.team === 'enemy' ? 1 : -1);
    const standoff = Math.min(distance, index === 0 ? 105 : 135 + (index % 3) * 22);
    waypoints.push(
      [spawn.pos[0] + deltaX * 0.5 + lateralX * lateral,
        spawn.pos[2] + deltaZ * 0.5 + lateralZ * lateral],
      [target[0] - forwardX * standoff + lateralX * lateral,
        target[2] - forwardZ * standoff + lateralZ * lateral],
      [target[0], target[2]],
    );
  }
  return waypoints.map((point, index) => clampBattleWaypoint(
    index < waypoints.length - 1
      ? skirtTownWaypoint(context.village, point[0], point[1])
      : point,
  ));
}

function planOpeningRoute(
  context: BattleSpawnContext,
  entity: SoloEntity,
  spawn: SpawnPoint,
  controller: SoloAiController,
  role: OpeningRole,
  doctrineWaypoints: Waypoint[],
  routeRng: RandomSource,
): void {
  const terrainWaypoints: Waypoint[] = [];
  let routeStart = { x: spawn.pos[0], z: spawn.pos[2] };
  for (const [x, z] of doctrineWaypoints) {
    const leg = planBotRoute({
      start: routeStart,
      goal: { x, z },
      navigation: context.botNavigation,
      rng: routeRng,
      role,
      spec: entity.spec,
      useRoleDetour: false,
    });
    if (!leg.length) break;
    terrainWaypoints.push(...leg);
    routeStart = { x, z };
  }
  controller.setWaypoints(terrainWaypoints, { loop: false });
  entity._openingRoute = terrainWaypoints;
}

function createBattleBot(
  context: BattleSpawnContext,
  entity: SoloEntity,
  entityIndex: number,
  spawn: SpawnPoint,
): void {
  const enemyScratch: SoloEntity[] = [];
  const allyScratch: SoloEntity[] = [];
  const controller = createAI(entity, {
    difficulty: getStoredDifficulty(),
    rng: mulberry32(7000 + entityIndex),
    deps: {
      ...context.aiDependencies,
      getEnemies: () => {
        enemyScratch.length = 0;
        for (const candidate of context.game.tanks) {
          if (candidate.team !== entity.team && !candidate.combat.destroyed) {
            enemyScratch.push(candidate);
          }
        }
        return enemyScratch;
      },
      getAllies: () => {
        allyScratch.length = 0;
        for (const candidate of context.game.tanks) {
          if (candidate !== entity && candidate.team === entity.team &&
              !candidate.combat.destroyed) allyScratch.push(candidate);
        }
        return allyScratch;
      },
      spotting: {
        isSpotted: (id: string, receiver: SpottingTank | null) =>
          context.game.spotting
            ? context.game.spotting.isSpotted(id, entity.team, receiver)
            : true,
      },
    },
  }) as SoloAiController;
  entity.aiCtl = controller;
  const lane = selectOpeningLane(context, entity);
  const doctrineWaypoints = buildOpeningWaypoints(context, entity, spawn, lane);
  const routeRng = mulberry32(17000 + entityIndex);
  const prepare = (): void => planOpeningRoute(
    context, entity, spawn, controller, lane.role, doctrineWaypoints, routeRng,
  );
  if (context.options.deferOpeningRoutes) context.game.openingRouteJobs.push(prepare);
  else prepare();
}

function warmStartBattleEntity(
  entity: SoloEntity,
  world: SoloWorld,
): void {
  refreshContactGeometry(entity);
  for (let tick = 0; tick < 30; tick++) {
    updateTank(entity, world.heightField, SIM_DT);
  }
  if (!entity.visual) return;
  entity.visual.syncFromState(entity.state);
  entity.visual.setVisible(true);
}

function spawnBattleEntities(context: BattleSpawnContext): void {
  const { game } = context;
  for (let index = 0; index < game.tanks.length; index++) {
    const entity = game.tanks[index];
    const isPlayer = entity.specId === context.playerSpecId;
    const isAlly = !isPlayer && context.allies.has(entity);
    const spawn = selectEntitySpawn(context, isPlayer, isAlly);
    initializeBattleEntity(context, entity, spawn, isPlayer, isAlly);
    if (!isPlayer) createBattleBot(context, entity, index, spawn);
    warmStartBattleEntity(entity, context.world);
  }
}

export function setupBattle(
  game: SoloGameState,
  playerSpecId: string,
  world: SoloWorld,
  opts: SetupBattleOptions = {},
): void {
  const sp = world.spawnPoints;
  resetBattleSession(game, opts);

  // COMMUNITY TANKS: field the participants; park everyone else (hidden,
  // null state/combat — every sim/HUD/audio consumer guards on those).
  game.tanks = pickBattleParticipants(game, playerSpecId, !!opts.random) as SoloEntity[];
  // BOT BIOME CAMO (camo_spotting r5): non-player participants of a random
  // battle roll a 60% chance of fielding the biome-matched AUTO pattern so
  // snowfields/dunes stop being full of factory-green bots (the player's
  // AUTO paint already matched). Runtime overrides only — localStorage and
  // the garage picker are untouched; the player's spec is never rolled
  // (participants are keyed by spec id, so no bot shares it). Seeded per
  // battle for reproducibility. main.ts startBattle calls setCamoBiome
  // BEFORE setupBattle, so the repaint below resolves the right biome; the
  // trailing applyCamoPatterns() also restores factory paint on entries a
  // PREVIOUS battle's overrides repainted (cheap no-op otherwise).
  configureBattleCamo(game, playerSpecId, opts);
  // perf-r2f: real battle entries defer this sweep to the caller's CHUNKED
  // pass (main.ts startBattle — one yielding sweep covers biome + the rolls
  // above without pinning the loading bar). The synchronous sweep stays for
  // every other caller: ensureShotWorld's capture contract requires the
  // frame to be fully determined when setupBattle returns.
  // PERF (performance_budget r4): participants get visuals on demand; parked
  // vehicles' visuals are EVICTED (scene detach + dispose) so only fielded
  // tanks keep generated texture sets resident — see spawnTanks.
  // PERF r3: the BOOT staging call defers the 7 enemy bakes off the
  // load-to-ready path (opts.deferVisuals; main.ts streams them post-ready
  // via ensureStagedVisuals — see spawnTanks). Real battle entries build
  // eagerly, exactly as before.
  prepareBattleVisuals(game, !!opts.deferVisuals);

  // SPOTTING WIRING: fresh concealment/spotting sim bound to this battle's
  // world (raycast for hard cover, vegetation discs for bush concealment).
  game.spotting = createBattleSpotting(game, world);

  const aiDeps = {
    heightField: world.heightField,
    raycast: world.raycast,
    getObstacles: () => world.getObstacles(),
    queryObstacles: world.queryObstacles || null,
    // BATTLE-AI r7: vegetation concealment discs — scouts pick spotting legs
    // through real bushes (state.ts nudges their waypoints; ai.ts may sample
    // them for repositioning). Absent in headless fixtures.
    getConcealment: () => (world.getConcealment ? world.getConcealment() : []),
  };
  // One immutable terrain/ground/cover scan is shared by every local bot.
  // Opening doctrine still authors the tactical points below; A* only expands
  // each leg into a path this specific drivetrain can actually traverse.
  const botObstacleQuery = world.queryObstacles
    ? (
        minX: number,
        minZ: number,
        maxX: number,
        maxZ: number,
        out: SoloObstacle[],
      ) => world.queryObstacles!(
        minX,
        minZ,
        maxX,
        maxZ,
        out,
      )
    : null;
  const botNavigation = createBotNavigationGrid({
    heightField: world.heightField,
    queryObstacles: botObstacleQuery,
    getObstacles: () => world.getObstacles(),
  });

  // SYMMETRIC TEAMS (hud_ui r1) → BATTLE-AI r7 (7v7): random battles field 13
  // non-players and split them 6 ALLIES + 7 ENEMIES with a tier-balanced
  // greedy pass — highest tier places first onto the side with the lower
  // running tier sum (the ally side starts pre-loaded with the PLAYER's own
  // tier), capacity-capped at 6/7. The seeded shuffle order stays the
  // tie-break, so rosters remain reproducible per battleCount. The
  // deterministic staged battle keeps the legacy 3-ally pick and its locked
  // team assignments so the establishing-shot framing remains unchanged.
  const allyPick = chooseBattleAllies(game, playerSpecId, !!opts.random);
  const allySet = new Set(allyPick);
  const playerYaw = sp.player.yaw;
  let enemyCenterX = 0;
  let enemyCenterZ = 0;
  for (const spawn of sp.enemies) {
    enemyCenterX += spawn.pos[0];
    enemyCenterZ += spawn.pos[2];
  }
  const enemyCount = sp.enemies.length || 1;
  enemyCenterX /= enemyCount;
  enemyCenterZ /= enemyCount;

  const roleCounts: Record<TeamId, Record<string, number | boolean>> = {
    player: {},
    enemy: {},
  };
  const teamHasBrawler: Record<TeamId, boolean> = { player: false, enemy: false };
  const teamHasScout: Record<TeamId, boolean> = { player: false, enemy: false };
  for (const entity of game.tanks) {
    if (entity.specId === playerSpecId) continue;
    const team: TeamId = allySet.has(entity) ? 'player' : 'enemy';
    const role = roleOf(entity.spec);
    if (role === 'brawler') teamHasBrawler[team] = true;
    if (role === 'scout') teamHasScout[team] = true;
  }

  const spawnContext: BattleSpawnContext = {
    game,
    world,
    options: opts,
    playerSpecId,
    allies: allySet,
    allyTaken: [],
    enemyCenterX,
    enemyCenterZ,
    playerPerpendicularX: Math.cos(playerYaw),
    playerPerpendicularZ: -Math.sin(playerYaw),
    playerForwardX: Math.sin(playerYaw),
    playerForwardZ: Math.cos(playerYaw),
    obstacles: world.getObstacles(),
    concealment: world.getConcealment?.() || [],
    village: world.heightField._layout?.village || null,
    roleCounts,
    teamHasBrawler,
    teamHasScout,
    aiDependencies: aiDeps,
    botNavigation,
    enemyIndex: 0,
    allyIndex: 0,
  };
  spawnBattleEntities(spawnContext);
  game.matchModeController = createMatchModeController({
    mode: game.gameMode,
    entities: game.tanks,
    seed: COMBAT_SEED + game.battleCount,
    terrainHeight: (x, z) => world.heightField.getHeightAt(x, z),
    emit: (type, payload) => game.modeEvents.push({ type, payload }),
    setActive(modeEntity, active) {
      modeEntity.modeActive = active;
      modeEntity.visual?.setVisible(active);
    },
    revive(ent: SoloEntity, spawn: MatchModeSpawn, healthScale: number) {
      _spawnPos.set(spawn.x, world.heightField.getHeightAt(spawn.x, spawn.z), spawn.z);
      ent.state = createTankState(ent.spec, _spawnPos, spawn.yaw);
      ent.combat = createCombatState(ent.spec);
      if (healthScale !== 1) {
        ent.combat.maxHp = Math.max(1, Math.round(ent.combat.maxHp * healthScale));
        ent.combat.hp = ent.combat.maxHp;
      }
      applyEquipmentToCombat(
        ent.combat,
        ent.equip || defaultLoadoutFor(ent.spec),
        ent.spec,
      );
      ent.specialAction = createSpecialActionState(ent.spec);
      ent.input.throttle = 0;
      ent.input.steer = 0;
      ent.input.brake = false;
      ent.input.fire = false;
      ent.input.shellSlot = 0;
      ent.input.aimPoint.copy(ent.state.aimPoint);
      ent._destroyedAnnounced = false;
      ent.visual?.resetDestroyed?.();
      ent.visual?.setVisible(true);
      refreshContactGeometry(ent);
      for (let tick = 0; tick < 30; tick++) {
        updateTank(ent, world.heightField, SIM_DT);
      }
      ent.visual?.syncFromState?.(ent.state);
    },
  });
  game.matchModeState = game.matchModeController.state;
  game._nextModeRouteS = 0;
}

/**
 * Prepare one deterministic solo-bot opening route. Player battle entry calls
 * this behind the frozen deployment countdown; synchronous tests/captures keep
 * setupBattle's original eager behavior by omitting deferOpeningRoutes.
 * @returns {boolean} true when a job was consumed
 */
export function prepareNextOpeningRoute(game: SoloGameState): boolean {
  const job = game.openingRouteJobs.shift();
  if (!job) return false;
  job();
  return true;
}

// ---------------------------------------------------------------------------
// Fixed-step simulation
// ---------------------------------------------------------------------------

/**
 * Publish the authored visual's measured contact footprint once per visual.
 * All playable tanks use terrain-conforming first-party running gear.
 * @param {object} ent pool entity
 * @returns {void}
 */
function clampContactValue(value: number, minimum: number, maximum: number): number {
  return value < minimum ? minimum : value > maximum ? maximum : value;
}

function validatedContactGeometry(
  source: SoloVisualContactGeometry,
  dimensions: MovementSpec['dims'],
): MovementContactGeometry {
  const length = dimensions.hullLengthM;
  const width = dimensions.widthM;
  return {
    halfLenM: source.halfLenM == null
      ? 0.45 * length
      : clampContactValue(source.halfLenM,
        CONTACT_LEN_FRAC_MIN * length, CONTACT_LEN_FRAC_MAX * length),
    halfWidM: source.halfWidM == null
      ? 0.5 * width
      : clampContactValue(source.halfWidM,
        CONTACT_WID_FRAC_MIN * width, CONTACT_WID_FRAC_MAX * width),
    zCenterM: source.zCenterM == null
      ? 0
      : clampContactValue(source.zCenterM,
        -CONTACT_ZC_FRAC_MAX * length, CONTACT_ZC_FRAC_MAX * length),
    bottomYM: clampContactValue(source.bottomYM || 0, CONTACT_BOTY_MIN, CONTACT_BOTY_MAX),
    panYM: source.panYM == null
      ? null
      : clampContactValue(source.panYM, CONTACT_PAN_MIN, CONTACT_PAN_MAX),
    endRise: source.endRise
      ? {
        dzM: clampContactValue(source.endRise.dzM || 0.4, 0.2, 0.6),
        frontM: clampContactValue(source.endRise.frontM, 0.02, 0.5),
        rearM: clampContactValue(source.endRise.rearM, 0.02, 0.5),
      }
      : null,
  };
}

function refreshContactGeometry(entity: SoloEntity): void {
  if (!entity.visual) return;
  entity.rigidGear = false;
  if (!entity.contactGeom && entity.visual.contactGeom) {
    entity.contactGeom = validatedContactGeometry(
      entity.visual.contactGeom,
      entity.spec.dims,
    );
  }
}

// First-party builders publish their measured track contact geometry once.
// The simulation validates that receipt against spec dimensions before using
// it; runtime vertex rescans were removed with the retired external-GLB path.
const CONTACT_LEN_FRAC_MIN = 0.22; // sanity clamps vs spec dims — a scan that
const CONTACT_LEN_FRAC_MAX = 0.50; // lands outside these is wrong, not novel
const CONTACT_WID_FRAC_MIN = 0.30;
const CONTACT_WID_FRAC_MAX = 0.58;
const CONTACT_ZC_FRAC_MAX = 0.12; // contact-run center offset cap (× hull L)
// MOVEMENT r1: hull-local Y of the lowest rendered surface — the support
// solve seats THIS plane on the terrain (pos.y = ground − bottomY + margin).
// The rebuilt profiles park it anywhere from −0.016 (pad grousers a hair
// under the old plane) to +0.10 (community placeholder pontoons / raised
// print floor lines); outside this band the scan hit paint, not a track.
const CONTACT_BOTY_MIN = -0.20;
const CONTACT_BOTY_MAX = 0.30;
// Measured hull-pan floor band (belly-guard line): pans outside this are a
// mis-scan (gun barrel over the bow, open-topped interiors) — fall back to
// the fixed guard rather than trust them.
const CONTACT_PAN_MIN = 0.12;
const CONTACT_PAN_MAX = 0.70;

/**
 * Tank collision layer (gameplay_feel r6 — round critique MAJOR "invisible
 * walls"): the old narrow phase was ONE fat circle per tank
 * (spec.armor.boundingRadiusM 4.1–4.55 m, gun barrel included) against prop
 * AABBs — the live probe dead-stopped twice in 13 s of open-meadow driving,
 * both times ~2 m short of any visible geometry, and grazing paths deflected
 * ~2.5 m before the hull could reach the prop. Replaced with:
 *  - tank vs OBSTACLE: cached bounds from the finalized armor collision shell
 *    as an oriented box (NO barrel) vs each prop's exact projected shape;
 *  - tank vs TANK: the same exact-shell rectangles through four-axis SAT —
 *    no rounded invisible shoulders or overlapping track corners;
 *  - broad phase stays a cheap circle reject (footprint circumradius).
 * CRUSHABLE props (round critique MAJOR "nothing in the world crushes"):
 * obstacle records tagged `crushable` by the world layer (vegetation.ts tags
 * tree trunks — see docs/SYSTEMS.md) do NOT wall a hull that
 * is already moving faster than CRUSH_MIN_MPS: the overlap is queued on
 * `pendingCrush` and simStep fells the prop (world.crushObstacle topple
 * anim), bleeds a little momentum and emits `prop:crushed` for fx/audio.
 * A `crushed` record stops colliding for everyone (ai.ts avoidance skips it
 * too). Below the threshold the trunk still resists a parked nudge; boulders,
 * buildings and every untagged prop stay permanently solid.
 */
const RAM_PAIR_COOLDOWN_S = 0.5; // one damage event per pair per shove
const CRUSH_MIN_MPS = 6 / 3.6;   // ~6 km/h — WoT fells small trees on any real overrun
const CRUSH_SPEED_KEEP = 0.94;   // per-prop momentum bite (v *= keep on crush)
// Below the speed threshold a trunk is solid — but a hull HOLDING drive
// against it saws it down after this much continuous press (replay probe: a
// hull clank-stopped by a boulder sat WEDGED between the rock and the solid
// slow-speed tree behind it for 4+ s, because a wedged tank can never reach
// 6 km/h again; WoT tanks push saplings over from a standstill). A parked
// nudge (no throttle) still never fells anything.
const CRUSH_PRESS_S = 0.45;      // s of held-throttle contact that fells a trunk
const CRUSH_PRESS_GAP_S = 0.2;   // press bookkeeping resets after this gap

function queueRamFromPush(
  self: SoloEntity,
  other: SoloEntity,
  forwardX: number,
  forwardZ: number,
  otherForwardX: number,
  otherForwardZ: number,
  pushX: number,
  pushZ: number,
  pendingRams: RamContact[],
): void {
  const pushLength = Math.hypot(pushX, pushZ);
  if (pushLength <= 1e-6) return;
  const normalX = pushX / pushLength;
  const normalZ = pushZ / pushLength;
  const relativeX = forwardX * self.state.speed - otherForwardX * other.state.speed;
  const relativeZ = forwardZ * self.state.speed - otherForwardZ * other.state.speed;
  const closing = -(relativeX * normalX + relativeZ * normalZ);
  if (closing > 0) {
    pendingRams.push({ a: self, b: other, closing, nx: normalX, nz: normalZ });
  }
}

function resolveTankCollisions(
  game: SoloGameState,
  self: SoloEntity | null,
  centerX: number,
  centerZ: number,
  forwardX: number,
  forwardZ: number,
  rightX: number,
  rightZ: number,
  halfLength: number,
  halfWidth: number,
  outPush: THREE.Vector3,
  pendingRams: RamContact[],
): boolean {
  if (!self) return false;
  let pushed = false;
  for (const other of game.tanks) {
    if (other === self || other.modeActive === false) continue;
    const footprint = tankContactRect(other.spec);
    const otherForwardX = Math.sin(other.state.yaw);
    const otherForwardZ = Math.cos(other.state.yaw);
    const otherRightX = otherForwardZ;
    const otherRightZ = -otherForwardX;
    const otherCenterX = other.state.pos.x + otherRightX * footprint.centerX +
      otherForwardX * footprint.centerZ;
    const otherCenterZ = other.state.pos.z + otherRightZ * footprint.centerX +
      otherForwardZ * footprint.centerZ;
    const deltaX = centerX - otherCenterX;
    const deltaZ = centerZ - otherCenterZ;
    const outerRadius = Math.hypot(halfLength, halfWidth) +
      Math.hypot(footprint.halfLength, footprint.halfWidth);
    if (deltaX * deltaX + deltaZ * deltaZ > outerRadius * outerRadius ||
        prefersVerticalTankContact(self, other)) continue;
    const beforeX = outPush.x;
    const beforeZ = outPush.z;
    if (!pushHullFromHull(
      centerX, centerZ, forwardX, forwardZ, rightX, rightZ, halfLength, halfWidth,
      otherCenterX, otherCenterZ,
      otherForwardX, otherForwardZ, otherRightX, otherRightZ,
      footprint.halfLength, footprint.halfWidth,
      outPush,
    )) continue;
    pushed = true;
    queueRamFromPush(
      self,
      other,
      forwardX,
      forwardZ,
      otherForwardX,
      otherForwardZ,
      outPush.x - beforeX,
      outPush.z - beforeZ,
      pendingRams,
    );
  }
  return pushed;
}

function shouldCrushObstacle(
  game: SoloGameState,
  self: SoloEntity,
  obstacle: SoloObstacle,
  speed: number,
): boolean {
  if (speed > (obstacle.crushMin ?? CRUSH_MIN_MPS)) return true;
  if (Math.abs(self.input.throttle || 0) <= 0.35) return false;
  if (game.timeS - (obstacle._pressT || -1e9) > CRUSH_PRESS_GAP_S) {
    obstacle._pressS = 0;
  }
  obstacle._pressT = game.timeS;
  obstacle._pressS = (obstacle._pressS || 0) + SIM_DT;
  return obstacle._pressS >= CRUSH_PRESS_S;
}

function queueCrush(
  obstacle: SoloObstacle,
  self: SoloEntity,
  pendingCrush: CrushContact[],
): void {
  for (const contact of pendingCrush) {
    if (contact.ob === obstacle) return;
  }
  pendingCrush.push({ ob: obstacle, ent: self });
}

function resolveObstacleCollisions(
  game: SoloGameState,
  world: SoloWorld,
  self: SoloEntity | null,
  positionY: number,
  centerX: number,
  centerZ: number,
  forwardX: number,
  forwardZ: number,
  rightX: number,
  rightZ: number,
  halfLength: number,
  halfWidth: number,
  obstacles: SoloObstacle[],
  nearby: SoloObstacle[],
  pendingCrush: CrushContact[],
  outPush: THREE.Vector3,
): boolean {
  const broadRadius = Math.sqrt(halfLength * halfLength + halfWidth * halfWidth) + 0.01;
  const candidates = world.queryObstacles
    ? world.queryObstacles(
      centerX - broadRadius,
      centerZ - broadRadius,
      centerX + broadRadius,
      centerZ + broadRadius,
      nearby,
    )
    : obstacles;
  const selfSpeed = self ? Math.abs(self.state.speed) : 0;
  let pushed = false;
  for (const obstacle of candidates) {
    if (obstacle.crushed || positionY > obstacle.max[1] + 0.5) continue;
    const closestX = Math.max(obstacle.min[0], Math.min(centerX, obstacle.max[0]));
    const closestZ = Math.max(obstacle.min[2], Math.min(centerZ, obstacle.max[2]));
    const deltaX = centerX - closestX;
    const deltaZ = centerZ - closestZ;
    if (deltaX * deltaX + deltaZ * deltaZ >= broadRadius * broadRadius) continue;
    const beforeX = outPush.x;
    const beforeZ = outPush.z;
    if (!pushHullFromObstacle(
      _contactCenter,
      forwardX,
      forwardZ,
      rightX,
      rightZ,
      halfLength,
      halfWidth,
      obstacle,
      outPush,
    )) continue;
    if (obstacle.crushable && self &&
        shouldCrushObstacle(game, self, obstacle, selfSpeed)) {
      queueCrush(obstacle, self, pendingCrush);
      outPush.x = beforeX;
      outPush.z = beforeZ;
      continue;
    }
    pushed = true;
  }
  return pushed;
}

function makeCollide(game: SoloGameState, world: SoloWorld): CollisionBundle {
  let self: SoloEntity | null = null;
  const obstacles = world.getObstacles();
  const nearby: SoloObstacle[] = [];
  const pendingCrush: CrushContact[] = [];
  // RAMMING: tank-tank contacts this tick, resolved by simStep after the
  // movement loop (mirror of pendingCrush). Each entry records the CONTACT
  // normal and both hulls' velocity vectors AT detection time — resolving
  // later from live state would read speeds the blocked-drive bleed has
  // already zeroed and see every head-on ram as a 0 m/s kiss.
  const pendingRams: RamContact[] = [];
  const ramBestByPair = new Map<string, RamContact>();
  function collide(pos: THREE.Vector3, radiusM: number, outPush: THREE.Vector3): boolean {
    outPush.set(0, 0, 0);
    const spec = self ? self.spec : null;
    const contactRect = spec ? tankContactRect(spec) : null;
    const halfL = contactRect ? contactRect.halfLength : radiusM * 0.6;
    const halfW = contactRect ? contactRect.halfWidth : radiusM * 0.45;
    const yaw = self && self.state ? self.state.yaw : 0;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);   // hull forward (world XZ)
    const rx = fz, rz = -fx;                        // hull right
    const centerX = pos.x + rx * (contactRect?.centerX || 0) + fx * (contactRect?.centerZ || 0);
    const centerZ = pos.z + rz * (contactRect?.centerX || 0) + fz * (contactRect?.centerZ || 0);
    _contactCenter.set(centerX, pos.y, centerZ);
    const boundsPushed = pushHullInsidePlayableBounds(
      centerX, centerZ, fx, fz, rx, rz, halfL, halfW, outPush,
    );
    const tanksPushed = resolveTankCollisions(
      game, self, centerX, centerZ, fx, fz, rx, rz, halfL, halfW, outPush, pendingRams,
    );
    const obstaclesPushed = resolveObstacleCollisions(
      game, world, self, pos.y, centerX, centerZ, fx, fz, rx, rz,
      halfL, halfW, obstacles, nearby, pendingCrush, outPush,
    );
    return boundsPushed || tanksPushed || obstaclesPushed;
  }
  return {
    collide,
    setSelf(e: SoloEntity) { self = e; },
    queueRam(a: SoloEntity, b: SoloEntity, closing: number, nx = 0, nz = 0) {
      if (closing > 0) pendingRams.push({ a, b, closing, nx, nz });
    },
    pendingCrush,
    pendingRams,
    ramBestByPair,
  };
}

function enrichHitEvent(
  game: SoloGameState,
  event: SoloHitEvent,
  target: SoloPooledEntity | null,
): void {
  event.timeS = game.timeS;
  const attacker = event.attackerId ? game.tankById.get(event.attackerId) : null;
  if (attacker) {
    event.attackerName = attacker.spec.name;
    event.attackerSpecId = attacker.specId;
  }
  if (!target) return;
  event.targetName = target.spec.name;
  event.targetSpecId = target.specId;
  event.targetMaxHp = target.combat?.maxHp || 0;
}

function emitHitStateEvents(bus: EventBus, event: SoloHitEvent): void {
  if (event.targetId) {
    for (const module of event.modulesHit || []) {
      bus.emit('module:state', {
        id: event.targetId,
        module: module.module,
        state: module.newState,
        source: 'hit',
      });
    }
    if (event.fireStarted) {
      bus.emit('tank:fire', { id: event.targetId, burning: true });
    }
  }
}

function notifyTeamUnderFire(
  game: SoloGameState,
  shooter: SoloPooledEntity | undefined,
  target: SoloPooledEntity | null,
): void {
  if (!isActiveSoloEntity(shooter) || !isActiveSoloEntity(target) ||
      shooter.team === target.team) return;
  for (const entity of game.tanks) {
    if (entity.team !== target.team || !entity.aiCtl || entity.combat.destroyed) continue;
    if (entity !== target &&
        entity.state.pos.distanceToSquared(target.state.pos) > 200 * 200) continue;
    entity.aiCtl.notifyUnderFire?.(shooter);
  }
}

/** Emit the derived bus events flagged inside one HitEvent. */
function emitHitOutcome(game: SoloGameState, bus: EventBus, event: SoloHitEvent): void {
  const target = event.targetId ? game.tankById.get(event.targetId) || null : null;
  enrichHitEvent(game, event, target);
  game.killcam?.onShellHit(event, target);
  bus.emit('shell:hit', event);
  emitHitStateEvents(bus, event);
  if (event.destroyed && isActiveSoloEntity(target) && !target._destroyedAnnounced) {
    announceDestroyed(bus, target, event.attackerId,
      event.ammoRacked ? 'ammorack' : 'shot');
  }
  const shooter = game.tankById.get(event.attackerId);
  shooter?.aiCtl?.notifyShellResult(event);
  notifyTeamUnderFire(game, shooter, target);
}

function announceDestroyed(
  bus: EventBus,
  ent: SoloEntity,
  killerId: string | null,
  cause: 'ammorack' | 'shot' | 'ram' | 'fire',
): void {
  ent._destroyedAnnounced = true;
  // turret toss is RESERVED for ammo-rack detonations (WoT spectacle);
  // plain HP kills / burn-outs keep the turret seated (gun droop + smoke)
  ent.visual?.setDestroyed({ pop: cause === 'ammorack' });
  bus.emit('tank:destroyed', {
    id: ent.id,
    specId: ent.specId,
    pos: [ent.state.pos.x, ent.state.pos.y, ent.state.pos.z],
    killerId,
    cause,
  });
}

function readyShellForFire(
  entity: SoloEntity,
  bus: EventBus,
): DamageShellSpec | null {
  const combat = entity.combat;
  if (!entity.input.fire || combat.destroyed || combat.reload.t > 0) return null;
  if (combat.modules.gun?.state === 'red') return null;
  const maximumSlot = entity.spec.gun.shells.length - 1;
  const requestedSlot = Math.max(
    0,
    Math.min(Math.min(2, maximumSlot), entity.input.shellSlot | 0),
  );
  if (requestedSlot !== combat.shellSlot) {
    if (!selectShell(combat, requestedSlot, entity.spec)) return null;
    if (combat.reload.t > 0) return null;
  }
  const shell = entity.spec.gun.shells[combat.shellSlot];
  if (shell.guided !== true && combat.magazine && combat.magazine.rounds <= 0) return null;
  if (hasAmmunition(combat, combat.shellSlot)) return shell;
  if (entity.isPlayer) {
    bus.emit('ammo:empty', { id: entity.id, slot: combat.shellSlot });
  }
  return null;
}

function prepareMuzzleDirection(entity: SoloEntity): number | null {
  const muzzles = entity.spec.gun.muzzles;
  let muzzleIndex = -1;
  if (Array.isArray(muzzles) && muzzles.length > 1) {
    muzzleIndex = (entity.combat.muzzleCursor || 0) % muzzles.length;
    entity.combat.muzzleCursor = muzzleIndex + 1;
  }
  const visual = entity.visual;
  if (!visual) return null;
  const selectedMuzzle = muzzleIndex >= 0 ? muzzleIndex : undefined;
  visual.gunMuzzleWorld(_muzzle, selectedMuzzle);
  visual.gunDirWorld(_dir);
  return muzzleIndex;
}

function applyShotFeedback(
  entity: SoloEntity,
  shell: DamageShellSpec,
  muzzleIndex: number,
  recoilScale: number,
  rig: CameraRig | null,
): void {
  fireRecoil(entity.state, entity.spec, shell);
  entity.visual?.recoilKick(
    0,
    recoilScale,
    muzzleIndex >= 0 ? muzzleIndex : undefined,
  );
  if (!entity.isPlayer || !rig) return;
  const caliberScale = Math.max(0, Math.min(1, (shell.caliberMm - 30) / 122));
  rig.addTrauma((0.10 + caliberScale * 0.20) * recoilScale);
  rig.recoilKick?.(
    (0.006 + caliberScale * 0.011) * recoilScale,
    recoilScale,
  );
}

function emitShellFired(
  game: SoloGameState,
  entity: SoloEntity,
  shell: DamageShell,
  shellSpec: DamageShellSpec,
  muzzleIndex: number,
  recoilScale: number,
  bus: EventBus,
): void {
  _firedEv.shellId = shell.id;
  _firedEv.shooterId = entity.id;
  _firedEv.isPlayer = entity.isPlayer;
  _firedEv.shellType = shellSpec.type;
  _firedEv.shellName = shellSpec.name;
  _firedEv.weaponSound = shellSpec.soundProfile || entity.spec.gun.soundProfile || null;
  _firedEv.muzzleIndex = muzzleIndex;
  _firedEv.recoilScale = recoilScale;
  _firedEv.caliberMm = shellSpec.caliberMm;
  _firedEv.velocityMps = shellSpec.velocityMps;
  _firedEv.timeS = game.timeS;
  _firedEv.muzzlePos[0] = _muzzle.x;
  _firedEv.muzzlePos[1] = _muzzle.y;
  _firedEv.muzzlePos[2] = _muzzle.z;
  _firedEv.dir[0] = _dir.x;
  _firedEv.dir[1] = _dir.y;
  _firedEv.dir[2] = _dir.z;
  bus.emit('shell:fired', _firedEv);
}

function notifyPlayerShot(game: SoloGameState, shooter: SoloEntity): void {
  if (!shooter.isPlayer) return;
  _playerShotOrigin.copy(shooter.state.pos);
  _playerShotRecipients.length = 0;
  for (const entity of game.tanks) {
    if (entity === shooter || entity.team === shooter.team || !entity.aiCtl ||
        entity.combat.destroyed) continue;
    if (entity.state.pos.distanceToSquared(shooter.state.pos) <= 500 * 500) {
      _playerShotRecipients.push(entity);
    }
  }
  _playerShotRecipients.sort(comparePlayerShotRecipients);
  for (let index = 0; index < _playerShotRecipients.length; index++) {
    _playerShotRecipients[index].aiCtl?.notifyPlayerFired?.(shooter, index);
  }
  _playerShotRecipients.length = 0;
}

/** Fire the loaded shell if the trigger is held and the gun is ready. */
function tryFire(
  game: SoloGameState,
  entity: SoloEntity,
  bus: EventBus,
  rig: CameraRig | null,
): void {
  const shellSpec = readyShellForFire(entity, bus);
  if (!shellSpec) return;
  const muzzleIndex = prepareMuzzleDirection(entity);
  if (muzzleIndex == null) return;
  let dispersion = computeDispersionRadM(entity.spec, entity.state, 100) / 200;
  if (entity.combat.modules.gun?.state === 'yellow') dispersion *= 2;
  applyDispersion(_dir, dispersion, game.combatRng);
  const firedSlot = entity.combat.shellSlot;
  if (!consumeAmmunition(entity.combat, firedSlot)) return;
  const shell = acquireShell(
    shellSpec,
    entity.id,
    entity.isPlayer,
    _muzzle,
    _dir,
    game.nextShellId++,
  );
  game.shells.push(shell);
  const recoilScale = shotRecoilScale(entity.spec, shellSpec);
  applyShotFeedback(entity, shellSpec, muzzleIndex, recoilScale, rig);
  emitShellFired(game, entity, shell, shellSpec, muzzleIndex, recoilScale, bus);
  startPostShotReload(entity.combat, entity.spec);
  if (!hasAmmunition(entity.combat, firedSlot)) {
    const fallbackSlot = selectFirstAvailableShell(entity.combat, entity.spec);
    if (fallbackSlot >= 0) entity.input.shellSlot = fallbackSlot;
    if (entity.isPlayer) {
      bus.emit('ammo:depleted', { id: entity.id, slot: firedSlot, fallbackSlot });
    }
  }
  game.spotting?.notifyFired(entity.id, game.timeS);
  notifyPlayerShot(game, entity);
}
function advanceGuidedShell(game: SoloGameState, shell: DamageShell): boolean {
  const shooter = game.tankById.get(shell.shooterId);
  if (isActiveSoloEntity(shooter) && specialActionGuidesShell(shooter, shell)) {
    guideShellToward(shell, shooter.input.aimPoint, SIM_DT);
  }
  stepShell(shell, SIM_DT);
  return !!game.matchModeController?.tryHitBall(shell);
}

function traceNearestTank(
  game: SoloGameState,
  shell: DamageShell,
  segmentLength: number,
): NearestTankTrace {
  const nearest = _nearestTankTrace;
  nearest.distance = Infinity;
  nearest.entity = null;
  nearest.intersections = null;
  for (const entity of game.tanks) {
    if (entity.modeActive === false || entity.id === shell.shooterId) continue;
    const radius = entity.spec.armor.boundingRadiusM;
    _toC.copy(entity.state.pos);
    _toC.y += entity.spec.dims.heightM * 0.5;
    _toC.sub(shell.prevPos);
    const projection = Math.max(0, Math.min(segmentLength, _toC.dot(_seg)));
    const distanceSquared = _toC.lengthSq() - projection * projection;
    if (distanceSquared > radius * radius) continue;
    const pose = tankPoseFromState(entity.state);
    const intersections = traceTank(
      shell.prevPos,
      shell.pos,
      pose,
      entity.spec.armor,
      entity.combat.eraSpent,
    );
    if (!intersections.length) continue;
    const distance = intersections[0].t * segmentLength;
    if (distance >= nearest.distance) continue;
    nearest.distance = distance;
    nearest.entity = entity;
    nearest.intersections = intersections;
  }
  return nearest;
}

function emitHeOutcomes(
  game: SoloGameState,
  bus: EventBus,
  shell: DamageShell,
  point: THREE.Vector3,
  directTarget: SoloEntity | null,
  intersections: ArmorIntersection[] | null,
): void {
  const events = resolveHeBurst(
    shell,
    point,
    game.tanks,
    directTarget,
    intersections,
    game.combatRng,
  );
  for (const event of events) emitHitOutcome(game, bus, event);
}

function resolveTankShellImpact(
  game: SoloGameState,
  bus: EventBus,
  shell: DamageShell,
  nearest: NearestTankTrace,
): void {
  const entity = nearest.entity;
  const intersections = nearest.intersections;
  if (!entity || !intersections) return;
  if (isHeClass(shell.spec.type)) {
    emitHeOutcomes(game, bus, shell, intersections[0].point, entity, intersections);
  } else {
    emitHitOutcome(
      game,
      bus,
      resolveShellHit(shell, entity, intersections, game.combatRng),
    );
  }
}

function crushWorldPropFromShell(
  world: SoloWorld,
  bus: EventBus,
  shell: DamageShell,
  hit: SoloWorldHit,
): void {
  const record = hit.record;
  if (record?.treeIdx == null || !record.crushable || !world.crushObstacle) return;
  world.crushObstacle(record, _seg.x, _seg.z, shell.spec.velocityMps);
  bus.emit('prop:crushed', {
    shooterId: shell.shooterId,
    cause: 'shell',
    speedMps: shell.spec.velocityMps,
    kind: 'tree',
    h: record.max[1] - record.min[1],
    pos: [hit.point.x, hit.point.y, hit.point.z],
    dir: [_seg.x, 0, _seg.z],
  });
}

function resolveWorldShellImpact(
  game: SoloGameState,
  bus: EventBus,
  world: SoloWorld,
  shell: DamageShell,
  hit: SoloWorldHit,
): void {
  if (isHeClass(shell.spec.type)) {
    emitHeOutcomes(game, bus, shell, hit.point, null, null);
  } else {
    shell.dead = true;
  }
  crushWorldPropFromShell(world, bus, shell, hit);
  bus.emit('shell:expired', {
    shellId: shell.id,
    shooterId: shell.shooterId,
    pos: [hit.point.x, hit.point.y, hit.point.z],
    hitTerrain: hit.kind === 'terrain',
    hitKind: hit.kind,
    surfaceKind: hit.record?.kind || hit.kind,
    normal: hit.normal ? [hit.normal.x, hit.normal.y, hit.normal.z] : null,
    shellType: shell.spec.type,
    caliberMm: shell.spec.caliberMm,
  });
}

function emitAirExpiry(bus: EventBus, shell: DamageShell): void {
  bus.emit('shell:expired', {
    shellId: shell.id,
    pos: [shell.pos.x, shell.pos.y, shell.pos.z],
    hitTerrain: false,
  });
}

function stepLiveShell(
  game: SoloGameState,
  bus: EventBus,
  world: SoloWorld,
  shell: DamageShell,
): void {
  if (advanceGuidedShell(game, shell)) return;
  _seg.copy(shell.pos).sub(shell.prevPos);
  const segmentLength = _seg.length();
  if (segmentLength < 1e-6) {
    if (shell.dead) emitAirExpiry(bus, shell);
    return;
  }
  _seg.multiplyScalar(1 / segmentLength);
  const worldHit = world.raycast(shell.prevPos, _seg, segmentLength);
  const nearest = traceNearestTank(game, shell, segmentLength);
  if (nearest.entity && nearest.intersections &&
      nearest.distance <= (worldHit?.dist ?? Infinity)) {
    resolveTankShellImpact(game, bus, shell, nearest);
  } else if (worldHit) {
    resolveWorldShellImpact(game, bus, world, shell, worldHit);
  } else if (shell.dead) {
    emitAirExpiry(bus, shell);
  }
}

function recycleDeadShells(shells: DamageShell[]): void {
  for (let index = shells.length - 1; index >= 0; index--) {
    if (!shells[index].dead) continue;
    const shell = shells[index];
    if (_shellPool.length < 64) _shellPool.push(shell);
    shells.splice(index, 1);
  }
}

/** Advance all live shells one step and resolve collisions. */
function stepShells(game: SoloGameState, bus: EventBus, world: SoloWorld): void {
  for (const shell of game.shells) {
    if (!shell.dead) stepLiveShell(game, bus, world, shell);
  }
  recycleDeadShells(game.shells);
}


/** Red-module auto-repair to yellow after REPAIR_S (§2.4 locked). The state
 * transition lives in sim/damage.ts tickModuleRepairs — ONE module state
 * machine (module_hitbox r1); the toolbox repair-rate equipment multiplier
 * is honored there. This wrapper only broadcasts the results. */
function tickRepairs(game: SoloGameState, bus: EventBus, dt: number): void {
  for (const ent of game.tanks) {
    if (!ent.combat) continue;
    for (const name of tickModuleRepairs(ent.combat, dt)) {
      // repaired:true = this yellow is a RECOVERY (red → yellow), so the HUD
      // toasts 'REPAIRED', not 'DAMAGED'. Audio infers direction on its own
      // prev-state tracker; the flag is additive for everyone else.
      bus.emit('module:state', { id: ent.id, module: name, state: 'yellow', repaired: true });
    }
  }
}

function stepSpotting(game: SoloGameState, bus: EventBus): void {
  if (!game.spotting) return;
  for (const event of game.spotting.update(SIM_DT, game.timeS)) {
    bus.emit('tank:spotted', event);
    if (game.player && event.id === game.player.id && event.team === 'enemy') {
      bus.emit('player:spotted', { timeS: game.timeS });
    }
  }
}

function retargetObjectiveBots(game: SoloGameState): void {
  if (game.gameMode === 'standard' || game.timeS < (game._nextModeRouteS || 0)) return;
  game._nextModeRouteS = game.timeS + (game.gameMode === 'turbo_ball' ? 1.25 : 4);
  for (const entity of game.tanks) {
    if (!entity.aiCtl || entity.modeActive === false || entity.combat.destroyed) continue;
    const target = game.matchModeController?.botTarget(entity);
    if (!target) continue;
    const moved = Math.hypot(
      target.x - (entity._modeTargetX ?? Infinity),
      target.z - (entity._modeTargetZ ?? Infinity),
    );
    if (moved < 18 && game.gameMode !== 'turbo_ball') continue;
    entity._modeTargetX = target.x;
    entity._modeTargetZ = target.z;
    entity.aiCtl.setWaypoints([[target.x, target.z]], { loop: false });
  }
}

function stepBotControllers(game: SoloGameState): void {
  for (const entity of game.tanks) {
    if (entity.modeActive !== false && entity.aiCtl && !entity.combat.destroyed) {
      entity.aiCtl.update(SIM_DT, game.timeS);
    }
  }
}

function repairBotModules(entity: SoloEntity, bus: EventBus): boolean {
  let used = false;
  for (const module of repairAllModules(entity.combat)) {
    used = true;
    bus.emit('module:state', {
      id: entity.id, module, state: 'ok', source: 'repair-kit',
    });
  }
  return used;
}

function reviveBotCrew(entity: SoloEntity): boolean {
  let used = false;
  for (const crew of Object.keys(entity.combat.crew)) {
    if (entity.combat.crew[crew] !== false) continue;
    entity.combat.crew[crew] = true;
    used = true;
  }
  return used;
}

function extinguishBot(entity: SoloEntity, bus: EventBus): boolean {
  if (!entity.combat.fire.burning) return false;
  entity.combat.fire.burning = false;
  entity.combat.fire.ticksLeft = 0;
  entity.combat.fire.tickTimer = 0;
  bus.emit('tank:fire', { id: entity.id, burning: false });
  return true;
}

function useBotConsumable(entity: SoloEntity, bus: EventBus, actionBit: number): boolean {
  if (actionBit === PLAYER_ACTION_BITS.REPAIR) return repairBotModules(entity, bus);
  if (actionBit === PLAYER_ACTION_BITS.FIRST_AID) return reviveBotCrew(entity);
  if (actionBit === PLAYER_ACTION_BITS.EXTINGUISHER) return extinguishBot(entity, bus);
  return false;
}

function applyBotSupportActions(game: SoloGameState, bus: EventBus): void {
  for (const entity of game.tanks) {
    if (!entity.aiCtl || entity.modeActive === false || entity.combat.destroyed) continue;
    const actionBits = entity.input.actionBits | 0;
    entity.input.actionBits = 0;
    if (!actionBits) continue;
    if (actionBits & PLAYER_ACTION_BITS.RELOAD_MAGAZINE) {
      startMagazineReload(entity.combat, entity.spec);
    }
    if (actionBits & PLAYER_ACTION_BITS.SPECIAL_ACTION) activateSpecialAction(entity);
    const readyAt = entity.consumableReadyAt || (entity.consumableReadyAt = [0, 0, 0]);
    for (let slot = 0; slot < CONSUMABLE_RULES.length; slot++) {
      const bit = 1 << slot;
      if (!(actionBits & bit) || cooldownRemaining(game.timeS, readyAt[slot]) > 0) continue;
      if (useBotConsumable(entity, bus, bit)) {
        readyAt[slot] = game.timeS + CONSUMABLE_RULES[slot].cooldownS;
      }
    }
  }
}

function emitTankImpact(
  game: SoloGameState,
  entity: SoloEntity,
  bus: EventBus,
  rig: CameraRig | null,
): void {
  const impact = entity.state.impactMps;
  if (impact <= 1.5 || game.timeS - (entity._lastImpactT || -1) <= 0.3) return;
  entity._lastImpactT = game.timeS;
  if (entity.isPlayer && rig) rig.addTrauma(Math.min(0.5, 0.10 + impact * 0.030));
  bus.emit('tank:impact', {
    id: entity.id,
    specId: entity.specId,
    isPlayer: entity.isPlayer,
    speedMps: impact,
    pos: [entity.state.pos.x, entity.state.pos.y, entity.state.pos.z],
  });
}

function stepTankMovement(
  game: SoloGameState,
  bus: EventBus,
  world: SoloWorld,
  rig: CameraRig | null,
  collider: CollisionBundle,
): void {
  for (const entity of game.tanks) {
    if (entity.modeActive === false || entity.combat.destroyed) continue;
    refreshContactGeometry(entity);
    collider.setSelf(entity);
    updateTank(entity, world.heightField, SIM_DT, collider.collide);
    emitTankImpact(game, entity, bus, rig);
  }
}

function resolveCrushContacts(
  collider: CollisionBundle,
  world: SoloWorld,
  bus: EventBus,
): void {
  for (const contact of collider.pendingCrush) {
    const obstacle = contact.ob;
    if (obstacle.crushed) continue;
    obstacle.crushed = true;
    const entity = contact.ent;
    const directionSign = Math.sign(entity.state.speed || 1);
    const directionX = Math.sin(entity.state.yaw) * directionSign;
    const directionZ = Math.cos(entity.state.yaw) * directionSign;
    const overrunMps = Math.abs(entity.state.speed);
    world.crushObstacle?.(obstacle, directionX, directionZ, overrunMps);
    entity.state.speed *= obstacle.crushKeep ?? CRUSH_SPEED_KEEP;
    bus.emit('prop:crushed', {
      id: entity.id,
      specId: entity.specId,
      isPlayer: entity.isPlayer,
      speedMps: Math.abs(entity.state.speed),
      kind: obstacle.kind || 'tree',
      h: obstacle.max[1] - obstacle.min[1],
      pos: [
        (obstacle.min[0] + obstacle.max[0]) * 0.5,
        obstacle.min[1],
        (obstacle.min[2] + obstacle.max[2]) * 0.5,
      ],
      dir: [directionX, 0, directionZ],
    });
  }
  collider.pendingCrush.length = 0;
}

function ramPairKey(contact: RamContact): string {
  return contact.a.id < contact.b.id
    ? `${contact.a.id}|${contact.b.id}`
    : `${contact.b.id}|${contact.a.id}`;
}

function normalizeRamContact(contact: RamContact): void {
  if (contact.nx * contact.nx + contact.nz * contact.nz >= 1e-6) return;
  contact.nx = contact.b.state.pos.x - contact.a.state.pos.x;
  contact.nz = contact.b.state.pos.z - contact.a.state.pos.z;
  const inverseLength = 1 / Math.max(1e-6, Math.hypot(contact.nx, contact.nz));
  contact.nx *= inverseLength;
  contact.nz *= inverseLength;
}

function emitRamModuleHits(
  bus: EventBus,
  entity: SoloEntity,
  hits: RamModuleHit[],
): void {
  for (const hit of hits) {
    bus.emit('module:state', {
      id: entity.id, module: hit.module, state: 'red', source: 'ram',
    });
  }
}

function resolveRamDamage(
  game: SoloGameState,
  cooldowns: Map<string, number>,
  key: string,
  contact: RamContact,
): RamResolution | null {
  const previousContactS = cooldowns.get(key);
  if (previousContactS !== undefined && game.timeS >= previousContactS &&
      game.timeS - previousContactS < RAM_PAIR_COOLDOWN_S) return null;
  const { a, b } = contact;
  if (a.combat.destroyed) return null;
  const damage = ramDamage(a.spec.weightTons, b.spec.weightTons, contact.closing);
  if (damage.total <= 0) return null;
  cooldowns.set(key, game.timeS);
  const bWasWreck = b.combat.destroyed;
  const damageA = damage.toA;
  const damageB = bWasWreck ? 0 : damage.toB;
  a.combat.hp = Math.max(0, a.combat.hp - damageA);
  if (!bWasWreck) b.combat.hp = Math.max(0, b.combat.hp - damageB);
  a.combat.destroyed ||= a.combat.hp <= 0;
  if (!bWasWreck) b.combat.destroyed ||= b.combat.hp <= 0;
  normalizeRamContact(contact);
  const aModulesHit = a.combat.destroyed
    ? applyLethalRamModuleDamage(a, contact.nx, contact.nz) : [];
  const bModulesHit = b.combat.destroyed && !bWasWreck
    ? applyLethalRamModuleDamage(b, -contact.nx, -contact.nz) : [];
  return {
    a,
    b,
    bWasWreck,
    event: {
    aId: a.id,
    bId: b.id,
    aSpecId: a.specId,
    bSpecId: b.specId,
    dmgA: damageA,
    dmgB: damageB,
    closingMps: contact.closing,
    aIsPlayer: !!a.isPlayer,
    bIsPlayer: !!b.isPlayer,
    pos: [
      (a.state.pos.x + b.state.pos.x) * 0.5,
      (a.state.pos.y + b.state.pos.y) * 0.5,
      (a.state.pos.z + b.state.pos.z) * 0.5,
    ],
    normal: [contact.nx, 0, contact.nz],
    timeS: game.timeS,
    aModulesHit,
    bModulesHit,
    },
  };
}

function publishRamDamage(
  game: SoloGameState,
  bus: EventBus,
  rig: CameraRig | null,
  resolution: RamResolution,
): void {
  const { a, b, bWasWreck, event } = resolution;
  if (game.killcam && (a.combat.destroyed || b.combat.destroyed)) {
    game.killcam.onRam(event, a, b);
  }
  emitRamModuleHits(bus, a, event.aModulesHit);
  emitRamModuleHits(bus, b, event.bModulesHit);
  if (b.combat.destroyed && !bWasWreck && !b._destroyedAnnounced) {
    announceDestroyed(bus, b, a.id, 'ram');
  }
  if (a.combat.destroyed && !a._destroyedAnnounced) {
    announceDestroyed(bus, a, bWasWreck ? null : b.id, 'ram');
  }
  const playerDamage = a.isPlayer ? event.dmgA : (b.isPlayer ? event.dmgB : 0);
  if (rig && playerDamage > 0) {
    rig.addTrauma(Math.min(0.55, 0.12 + playerDamage * 0.0009));
  }
  bus.emit('tank:ram', event);
}

function resolveRamContacts(
  game: SoloGameState,
  bus: EventBus,
  rig: CameraRig | null,
  collider: CollisionBundle,
): void {
  const rams = collider.pendingRams;
  if (!rams.length) return;
  game._ramPairT ||= new Map();
  const cooldowns = game._ramPairT;
  const best = collider.ramBestByPair;
  best.clear();
  for (const contact of rams) {
    const key = ramPairKey(contact);
    const previous = best.get(key);
    if (!previous || contact.closing > previous.closing) best.set(key, contact);
  }
  for (const [key, contact] of best) {
    const resolution = resolveRamDamage(game, cooldowns, key, contact);
    if (resolution) publishRamDamage(game, bus, rig, resolution);
  }
  best.clear();
  rams.length = 0;
}

function stepRolloverRecovery(game: SoloGameState, bus: EventBus): void {
  for (const entity of game.tanks) {
    if (entity.modeActive === false || entity.combat.destroyed) continue;
    if (stepRolloverLifecycle(entity.state, SIM_DT)) {
      bus.emit('tank:autoflip', { id: entity.id, specId: entity.specId });
    }
  }
}

function emitReloadProgress(
  entity: SoloEntity,
  bus: EventBus,
  reloadStartedAtS: number,
  reloadKind: string,
  done: boolean,
): void {
  if (reloadStartedAtS <= 0 || !entity.isPlayer) return;
  const combat = entity.combat;
  const reload = combat.reload;
  const event = entity._reloadEvent || (entity._reloadEvent = {
    t: 0, total: 0, progress: 0, kind: 'ready', caliberMm: 0,
    magazineRounds: 0, magazineCapacity: 0, done: false,
  });
  const shell = entity.spec.gun.shells[combat.shellSlot] || entity.spec.gun.shells[0];
  event.t = reload.t;
  event.total = reload.totalS;
  event.progress = reload.totalS > 0
    ? Math.max(0, Math.min(1, 1 - reload.t / reload.totalS)) : 1;
  event.kind = reloadKind;
  event.caliberMm = shell?.caliberMm || entity.spec.gun.caliberMm || 100;
  event.magazineRounds = combat.magazine?.rounds || 0;
  event.magazineCapacity = combat.magazine?.capacity || 0;
  event.done = done;
  bus.emit('player:reload', event);
}

function stepReloadAndFire(
  game: SoloGameState,
  bus: EventBus,
  rig: CameraRig | null,
): void {
  for (const entity of game.tanks) {
    const combat = entity.combat;
    if (entity.modeActive === false || combat.destroyed) continue;
    const reloadStartedAtS = combat.reload.t;
    const reloadKind = combat.reload.kind;
    const done = tickReload(combat, SIM_DT);
    emitReloadProgress(entity, bus, reloadStartedAtS, reloadKind, done);
    tryFire(game, entity, bus, rig);
  }
}

function stepFireDamage(game: SoloGameState, bus: EventBus): void {
  game.fireTickAcc += SIM_DT;
  if (game.fireTickAcc < FIRE_TICK_S) return;
  game.fireTickAcc -= FIRE_TICK_S;
  for (const entity of game.tanks) {
    const combat = entity.combat;
    if (entity.modeActive === false || combat.destroyed || !combat.fire.burning) continue;
    const result = tickFire(entity, game.combatRng);
    if (result.extinguished) bus.emit('tank:fire', { id: entity.id, burning: false });
    if (result.destroyed && !entity._destroyedAnnounced) {
      announceDestroyed(bus, entity, entity.id, 'fire');
    }
  }
}

function stepMatchMode(game: SoloGameState, bus: EventBus): MatchModeResult | null {
  const outcome = game.matchModeController?.step(SIM_DT, game.timeS) || null;
  if (game.matchModeState && game.player) {
    game.matchModeState.playerAmmo = totalAmmunition(game.player.combat);
    game.matchModeState.playerAmmoCapacity = totalAmmunitionCapacity(game.player.combat);
  }
  for (const event of game.modeEvents) {
    bus.emit(event.type.replace(/^mode_/, 'mode:'), event.payload);
  }
  game.modeEvents.length = 0;
  return outcome;
}

function applyTimedModeResult(game: SoloGameState): void {
  if (!game.matchModeController || game.gameMode === 'endless_horde' ||
      game.timeS < BATTLE_TIME_LIMIT_S) return;
  const score = game.matchModeController.state.score;
  game.result = score.alpha === score.bravo ? 'draw'
    : score.alpha > score.bravo ? 'victory' : 'defeat';
  game.resultReason = 'time_limit';
}

function applyEliminationResult(
  game: SoloGameState,
  enemiesLeft: number,
  alliesLeft: number,
): void {
  if (enemiesLeft === 0) {
    game.result = 'victory';
    game.resultReason = 'elimination';
  } else if (game.player?.combat.destroyed && alliesLeft === 0) {
    game.result = 'defeat';
    game.resultReason = 'elimination';
  } else if (game.timeS >= BATTLE_TIME_LIMIT_S) {
    game.result = 'draw';
    game.resultReason = 'time_limit';
  }
}

function emitBattleEnded(game: SoloGameState, bus: EventBus): void {
  bus.emit('battle:ended', {
    result: game.result,
    reason: game.resultReason,
    timeS: game.timeS,
    map: game.mapId,
    roster: game.tanks.map((entity) => ({
      id: entity.id,
      specId: entity.specId,
      vehicle: entity.spec.name,
      team: entity.team,
      alive: !entity.combat.destroyed,
      isPlayer: game.player?.id === entity.id,
    })),
  });
}

function settleBattleResult(
  game: SoloGameState,
  bus: EventBus,
  modeOutcome: MatchModeResult | null,
): void {
  if (game.result !== null || !game.player) return;
  let enemiesLeft = 0;
  let alliesLeft = 0;
  for (const entity of game.tanks) {
    if (entity.combat.destroyed) continue;
    if (entity.team === 'enemy') enemiesLeft++;
    else if (entity.id !== game.player.id) alliesLeft++;
  }
  if (modeOutcome) {
    game.result = modeOutcome.result === 'draw' ? 'draw'
      : modeOutcome.result === 'alpha' ? 'victory' : 'defeat';
    game.resultReason = modeOutcome.reason;
  } else if (!game.matchModeController || game.matchModeController.usesElimination) {
    applyEliminationResult(game, enemiesLeft, alliesLeft);
  } else {
    applyTimedModeResult(game);
  }
  if (game.result !== null) emitBattleEnded(game, bus);
}

/**
 * One fixed simulation step. Ordering is authoritative: sensing and AI write
 * input before movement; contacts resolve before weapons; projectiles resolve
 * before damage timers; objective state settles before the match verdict.
 */
export function simStep(
  game: SoloGameState,
  bus: EventBus,
  world: SoloWorld,
  rig: CameraRig | null,
  collider: CollisionBundle,
): void {
  game.timeS += SIM_DT;
  stepSpotting(game, bus);
  retargetObjectiveBots(game);
  stepBotControllers(game);
  applyBotSupportActions(game, bus);
  stepTankMovement(game, bus, world, rig, collider);
  resolveTankBodyContacts(game.tanks, SIM_DT,
    (upper, lower, closing, nx, nz) =>
      collider.queueRam(upper, lower, closing, nx, nz));
  resolveCrushContacts(collider, world, bus);
  resolveRamContacts(game, bus, rig, collider);
  stepRolloverRecovery(game, bus);
  stepReloadAndFire(game, bus, rig);
  game.killcam?.recordSimStep(game);
  stepShells(game, bus, world);
  stepFireDamage(game, bus);
  tickRepairs(game, bus, SIM_DT);
  settleBattleResult(game, bus, stepMatchMode(game, bus));
}

/**
 * Create the shared collision closure bundle for movement pushback.
 * @param {object} game game state
 * @param {object} world World
 * @returns {{collide:Function, setSelf:Function}}
 */
export function createCollider(game: SoloGameState, world: SoloWorld): CollisionBundle {
  return makeCollide(game, world);
}
