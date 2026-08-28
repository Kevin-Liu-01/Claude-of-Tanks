/**
 * state.ts — legacy solo battle setup and fixed-step combat integration
 * (ARCHITECTURE.md §1.5, §2.4, §4 step 2). The typed session shell/event bus
 * live in stateCore.ts; roster and visual planning live in rosterState.ts.
 * The render loop remains in main.ts.
 */
import * as THREE from 'three';
import type { ArmorIntersection, ArmorModel } from '../sim/armor.ts';
import type { BotRoutePoint } from '../sim/botRoutePlanner.ts';
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
  MatchModeEntity,
  MatchModePresentationState,
  MatchModeSpawn,
} from '../sim/matchModes.ts';
import type { SpecialActionSpec, SpecialActionState } from '../sim/specialActionPolicy.ts';
import type { ConcealerDisc, SpottingSystem, SpottingTank } from '../sim/spotting.ts';
import type { CollisionRecord } from '../world/collision.ts';
import type { EventBus, RandomSource } from './stateCore.ts';
import type { RosterEntity, RosterGameState } from './rosterState.ts';
import type { ModuleId } from '../sim/moduleCatalog.ts';
import { getSpec } from '../vehicles/specs.js';
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
  selectShell, startPostShotReload, startReload, tickReload, isHeClass, ramDamage,
} from '../sim/damage.ts';
import {
  completeGuidedMissileFlight,
  createSpecialActionState,
  finishSpecialActionFire,
  specialActionGuidesShell,
} from '../sim/specialActions.ts';
import { createAI, roleOf } from './ai.ts';
import { createBotNavigationGrid, planBotRoute } from '../sim/botRoutePlanner.ts';
import { pushHullFromHull, pushHullFromObstacle } from '../world/collision.ts';
import { getStoredDifficulty } from './input.ts';
// SPOTTING WIRING: concealment/spotting sim + camo-paint bonus source
import { createSpottingSystem, CAMO_PAINT_BONUS } from '../sim/spotting.ts';
import { hasCamoPaint, setCamoOverride, clearCamoOverrides, applyCamoPatterns } from '../vehicles/materials.js';
// EQUIPMENT SYSTEM (game/equipment.ts): per-tank loadouts — the player's
// persisted picks, per-role AI defaults, and the equipMults record the
// damage/movement/repair hooks read off CombatState.
import {
  loadEquipment as loadEquipmentCatalog, applyEquipmentToCombat, defaultLoadoutFor,
} from './equipment.ts';
import { mulberry32 } from './stateCore.ts';
import { createMatchModeController, normalizeGameMode } from '../sim/matchModes.ts';
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
  muzzles?: readonly unknown[];
  soundProfile?: string;
  primaryGuided?: boolean;
}

type SoloArmorSpec = ArmorModel & MovementArmorSpec & {
  boundingRadiusM: number;
};

type SoloSpec = Omit<MovementSpec, 'gun' | 'armor'> &
  Omit<DamageTankSpec, 'gun' | 'armor' | 'dims'> &
  Omit<SpecialActionSpec, 'gun'> & {
    id: string;
    name: string;
    dims: MovementSpec['dims'];
    gun: SoloGunSpec;
    armor: SoloArmorSpec;
  };

interface SoloCombatState extends CombatState {
  modeAmmo?: number | null;
  modeAmmoCapacity?: number | null;
  muzzleCursor?: number;
}

interface SoloInput extends MovementInput {
  throttle: number;
  steer: number;
  brake: boolean;
  fire: boolean;
  shellSlot: number;
  aimPoint: THREE.Vector3;
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
  gunDirWorld?(out: THREE.Vector3): void;
  gunPivotWorld(out: THREE.Vector3): void;
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
  payload: Record<string, unknown>;
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
  matchModeController: MatchModeController | null;
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
  gameMode?: unknown;
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

function asModeEntity(entity: SoloEntity): MatchModeEntity {
  return entity;
}

function asSoloEntity(entity: MatchModeEntity): SoloEntity {
  return entity as unknown as SoloEntity;
}

function isActiveSoloEntity(
  entity: SoloPooledEntity | null | undefined,
): entity is SoloEntity {
  return !!(entity?.state && entity.combat && entity.specialAction);
}

function equipmentCombat(combat: SoloCombatState) {
  return combat as unknown as Parameters<typeof applyEquipmentToCombat>[0];
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

// module-scope scratch — no per-frame allocation
const _muzzle = new THREE.Vector3();
const _pivot = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _seg = new THREE.Vector3();
const _toC = new THREE.Vector3();
const _spawnPos = new THREE.Vector3();
const _contactCenter = new THREE.Vector3();

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

export function setupBattle(
  game: SoloGameState,
  playerSpecId: string,
  world: SoloWorld,
  opts: SetupBattleOptions = {},
): void {
  const sp = world.spawnPoints;
  for (const sh of game.shells) { if (_shellPool.length < 64) _shellPool.push(sh); }
  game.shells.length = 0;
  game.nextShellId = 1;
  game.timeS = 0;
  game.fireTickAcc = 0;
  game.combatRng = mulberry32(COMBAT_SEED);
  game.result = null;
  game.resultReason = null;
  game.gameMode = normalizeGameMode(opts.gameMode);
  game.matchModeState = null;
  game.matchModeController = null;
  game.modeEvents.length = 0;
  game.battleCount++;
  game.openingRouteJobs.length = 0;

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
  clearCamoOverrides();
  if (opts.random) {
    // camo_spotting r6 (critic: factory-green ally on open snow in the winter
    // AUTO battle): on high-contrast biomes (winter/desert) a parade-green
    // bot is never plausible — the AUTO roll is ~100% there, with variety
    // carried by the per-spec paint bakes (every whitewash/desert coat is
    // seeded per tank). Verdant/urban keep the 60% mix: green factory paint
    // is plausible against grass and rubble. camoRng is still drawn per bot
    // so the battle seed stream stays position-identical across biomes.
    for (const specId of autoCamoIdsForBattle(
      game.tanks, playerSpecId, game.mapId, true, game.battleCount,
    )) {
      setCamoOverride(specId, 'auto');
    }
  }
  // perf-r2f: real battle entries defer this sweep to the caller's CHUNKED
  // pass (main.ts startBattle — one yielding sweep covers biome + the rolls
  // above without pinning the loading bar). The synchronous sweep stays for
  // every other caller: ensureShotWorld's capture contract requires the
  // frame to be fully determined when setupBattle returns.
  if (!opts.deferCamoRepaint) applyCamoPatterns();
  // PERF (performance_budget r4): participants get visuals on demand; parked
  // vehicles' visuals are EVICTED (scene detach + dispose) so only fielded
  // tanks keep generated texture sets resident — see spawnTanks.
  // PERF r3: the BOOT staging call defers the 7 enemy bakes off the
  // load-to-ready path (opts.deferVisuals; main.ts streams them post-ready
  // via ensureStagedVisuals — see spawnTanks). Real battle entries build
  // eagerly, exactly as before.
  if (!opts.deferVisuals) {
    for (const ent of game.tanks) ensureTankVisual(game, ent);
  } else {
    ensureTankVisual(game, game.tanks[0]); // the player is always staged
  }
  const activeEntities = new Set<SoloPooledEntity>(game.tanks);
  for (const ent of game.allTanks) {
    if (activeEntities.has(ent)) continue;
    ent.state = null;
    ent.combat = null;
    ent.ai = null;
    ent.aiCtl = null;
    ent.team = 'enemy';
    ent.isPlayer = false;
    // gameplay_feel r5: the rigid-gear stamp belongs to the DISPOSED visual —
    // a recycled slot may get a procedural (conform-capable) visual next.
    ent.rigidGear = false;
    ent.contactGeom = null; // r7: measured footprint dies with the visual too
    ent._glbContactStampedVisual = null;
    if (ent.visual) {
      if (ent.visual.resetDestroyed) ent.visual.resetDestroyed();
      ent.visual.setVisible(false);
      game._engineCtx.scene.remove(ent.visual.root);
      ent.visual.dispose();
      ent.visual = null;
    }
  }

  // SPOTTING WIRING: fresh concealment/spotting sim bound to this battle's
  // world (raycast for hard cover, vegetation discs for bush concealment).
  game.spotting = createSpottingSystem({
    getTanks: () => game.tanks as SpottingTank[],
    raycast: world.raycast,
    concealers: world.getConcealment ? world.getConcealment() : [],
    getCamoBonus: (tank) => {
      const ent = tank as SpottingTank & { specId: string };
      return hasCamoPaint(ent.specId) ? CAMO_PAINT_BONUS : 0;
    },
    // EQUIPMENT layer: vision/concealment items resolve from the loadout
    // attached at spawn (player = saved picks, AI = role defaults) — the
    // old per-check localStorage read leaked the PLAYER'S saved loadout onto
    // any bot fielding the same spec.
    getEquipment: (tank) => (tank as SpottingTank & { equip?: string[] }).equip || null,
    rng: mulberry32(9100),
  });

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
        out: Array<{ min: readonly number[]; max: readonly number[] }>,
      ) => world.queryObstacles!(
        minX,
        minZ,
        maxX,
        maxZ,
        out as unknown as SoloObstacle[],
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
  const nonPlayers = game.tanks.filter((e) => e.specId !== playerSpecId);
  let allyPick: SoloEntity[];
  if (opts.random) {
    // flags.rosterExact (perf A/B tooling): a pinned short roster splits at
    // the LEGACY ally count (3) so an 8-tank control battle mirrors the old
    // 4v4 shape instead of 7v1.
    const exactCap = soloDebugFlags()?.rosterExact &&
      nonPlayers.length < 13 ? 3 : 6;
    const allyCap = Math.min(exactCap, Math.max(1, nonPlayers.length - 1));
    const enemyCap = nonPlayers.length - allyCap;
    const byTier = nonPlayers.slice()
      .sort((a, b) => tankTier(b.specId) - tankTier(a.specId)); // stable sort
    let allySum = tankTier(playerSpecId);
    let enemySum = 0;
    let enemyN = 0;
    allyPick = [];
    for (const e of byTier) {
      const t = tankTier(e.specId);
      const allyRoom = allyPick.length < allyCap;
      const enemyRoom = enemyN < enemyCap;
      // ties go to the enemy side: it fields one more hull, so it fills first
      if (allyRoom && (!enemyRoom || allySum < enemySum)) {
        allyPick.push(e);
        allySum += t;
      } else {
        enemyN++;
        enemySum += t;
      }
    }
  } else {
    const preferred = ['m4a3e8', 't34_85', 'panther_g'];
    allyPick = nonPlayers.filter((e) => preferred.includes(e.specId));
    for (const e of nonPlayers) {
      if (allyPick.length >= 3) break;
      if (e.specId === 'tiger1' || allyPick.includes(e)) continue;
      allyPick.push(e);
    }
    allyPick = allyPick.slice(0, 3);
  }
  const allySet = new Set(allyPick);
  // Allies spawn AROUND the player spawn: a 6-slot wedge (two lateral pairs +
  // a rear rank) perpendicular to the player spawn yaw, settled onto the
  // heightfield. BATTLE-AI r7: was a 3-slot lateral line; the wedge keeps the
  // 7-tank team inside a ~110 m x 40 m block — one spawn zone, no scatter.
  const ALLY_SLOTS = [
    { lat: 26, back: 0 }, { lat: -26, back: 0 }, { lat: 52, back: 8 },
    { lat: -52, back: 8 }, { lat: 20, back: 30 }, { lat: -20, back: 30 },
  ];
  const _ppYaw = sp.player.yaw;
  const _perpX = Math.cos(_ppYaw);
  const _perpZ = -Math.sin(_ppYaw);
  const _fwdX = Math.sin(_ppYaw);
  const _fwdZ = Math.cos(_ppYaw);
  const _allyTaken: Waypoint[] = []; // settled ally cells — no two allies share a cell
  // Enemy spawn centroid: the allies' opening push target.
  let _ecx = 0, _ecz = 0;
  for (const es of sp.enemies) { _ecx += es.pos[0]; _ecz += es.pos[2]; }
  _ecx /= sp.enemies.length || 1;
  _ecz /= sp.enemies.length || 1;

  // BATTLE-AI r7 OPENING PLANS: per-team role counters (ai.ts roleOf) so each
  // role opens on its own doctrine lane — see the waypoint block below.
  const _roleCounts: Record<TeamId, Record<string, number | boolean>> = {
    player: {}, enemy: {},
  };
  const _teamHasBrawler: Record<TeamId, boolean> = { player: false, enemy: false };
  const _teamHasScout: Record<TeamId, boolean> = { player: false, enemy: false };
  for (const e of game.tanks) {
    if (e.specId === playerSpecId) continue;
    const team: TeamId = allySet.has(e) ? 'player' : 'enemy';
    const r = roleOf(e.spec);
    if (r === 'brawler') _teamHasBrawler[team] = true;
    if (r === 'scout') _teamHasScout[team] = true;
  }
  // BATTLE-AI r7: spawn cells must not seed inside prop/tree footprints —
  // a hull materializing in a trunk reads as broken even though the crush
  // system would resolve it on the first meter of drive. 2.6 m margin ~=
  // hull half-width + clearance.
  const _obstacles = world.getObstacles ? world.getObstacles() : [];
  const _cellBlocked = (x: number, z: number, margin = 2.6): boolean => {
    for (const o of _obstacles) {
      if (o.crushed) continue;
      if (x > o.min[0] - margin && x < o.max[0] + margin &&
          z > o.min[2] - margin && z < o.max[2] + margin) return true;
    }
    return false;
  };
  const _conceal = world.getConcealment ? world.getConcealment() : [];
  // Snap a scout leg onto the nearest REAL bush (add >= 0.3 — canopy discs
  // soft-conceal at 0.08 and are not hides) within 45 m, else keep the leg.
  const _bushNudge = (x: number, z: number): Waypoint => {
    let bx = x, bz = z, best = 45;
    for (const c of _conceal) {
      if (!c || c.add < 0.3) continue;
      const cd = Math.hypot(c.x - x, c.z - z);
      if (cd < best) { best = cd; bx = c.x; bz = c.z; }
    }
    return [bx, bz];
  };
  const _clampW = (v: number): number => Math.max(-460, Math.min(460, v));
  // BATTLE-AI r7 TOWN SKIRT: on block-grid maps (urban/railyard — town rect
  // >= 200 m wide) opening-lane waypoints that land INSIDE the town are
  // pushed out past the nearest rect edge, so the two fronts meet on the
  // outskirts/streets instead of 14 hulls wedging into the block maze on
  // minute one (r7 flow probe: whole-team 0-shell stalls, 81 s first spot).
  // Engagement-time navigation (vantage + ai.ts corner-hop router) owns the
  // street fighting AFTER contact.
  const _village = world.heightField && world.heightField._layout
    ? world.heightField._layout.village : null;
  const _skirtTown = !!(_village && (_village.x1 - _village.x0) >= 200);
  const _skirtWp = (wx: number, wz: number): Waypoint => {
    if (!_skirtTown) return [wx, wz];
    const v = _village;
    const pad = 24, out = 45;
    if (wx < v.x0 - pad || wx > v.x1 + pad ||
        wz < v.z0 - pad || wz > v.z1 + pad) return [wx, wz];
    // exit past the nearest edge — a lane already leaning left skirts left
    const exL = wx - v.x0, exR = v.x1 - wx;
    const ezL = wz - v.z0, ezR = v.z1 - wz;
    const m = Math.min(exL, exR, ezL, ezR);
    if (m === exL) return [v.x0 - out, wz];
    if (m === exR) return [v.x1 + out, wz];
    if (m === ezL) return [wx, v.z0 - out];
    return [wx, v.z1 + out];
  };

  let enemyIdx = 0;
  let allyIdx = 0;
  game.tanks.forEach((ent, i) => {
    const isPlayer = ent.specId === playerSpecId;
    const isAlly = !isPlayer && allySet.has(ent);
    let spawn: SpawnPoint;
    if (isPlayer) {
      spawn = sp.player;
    } else if (isAlly) {
      // content_breadth r1 → BATTLE-AI r7: slope/water-reject ally cells. A
      // wedge slot can land on a mesa/cliff wall (terrain normal.y < 0.85) or
      // a marsh/strand cell ('soft' ground) and the tank renders fused into
      // rock or bogged at 0 m/s; walk outward along the slot's lateral axis
      // in 9 m steps until a drivable cell is found that no other ally took
      // (worst case: keep the original slot rather than stack on the player).
      const slot = ALLY_SLOTS[allyIdx++ % ALLY_SLOTS.length];
      let ax = sp.player.pos[0] + _perpX * slot.lat - _fwdX * slot.back;
      let az = sp.player.pos[2] + _perpZ * slot.lat - _fwdZ * slot.back;
      if (world.heightField.getNormalAt) {
        for (let k = 0; k < 8; k++) {
          const off = slot.lat + Math.sign(slot.lat || 1) * k * 9;
          const cx = sp.player.pos[0] + _perpX * off - _fwdX * slot.back;
          const cz = sp.player.pos[2] + _perpZ * off - _fwdZ * slot.back;
          if (world.heightField.getNormalAt(cx, cz).y < 0.85) continue;
          if (world.heightField.getGroundType &&
              world.heightField.getGroundType(cx, cz) === 'soft') continue;
          if (_cellBlocked(cx, cz)) continue; // r7: never seed inside a prop
          let taken = false;
          for (const q of _allyTaken) {
            if (Math.hypot(q[0] - cx, q[1] - cz) < 14) { taken = true; break; }
          }
          if (taken) continue;
          ax = cx; az = cz;
          break;
        }
      }
      _allyTaken.push([ax, az]);
      spawn = { pos: [ax, world.heightField.getHeightAt(ax, az), az], yaw: sp.player.yaw };
    } else {
      spawn = sp.enemies[enemyIdx++];
      // BATTLE-AI r7: the arc pads are authored prop-clear, but seeded props
      // can drift onto one as maps evolve — nudge around the pad's 9 m flat
      // core rather than seed a hull inside a trunk.
      if (_cellBlocked(spawn.pos[0], spawn.pos[2])) {
        outer:
        for (const r of [4, 7]) {
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2;
            const nx = spawn.pos[0] + Math.sin(a) * r;
            const nz = spawn.pos[2] + Math.cos(a) * r;
            if (_cellBlocked(nx, nz)) continue;
            spawn = {
              pos: [nx, world.heightField.getHeightAt(nx, nz), nz],
              yaw: spawn.yaw,
            };
            break outer;
          }
        }
      }
    }
    _spawnPos.set(spawn.pos[0], spawn.pos[1], spawn.pos[2]);
    ent.team = isPlayer || isAlly ? 'player' : 'enemy';
    ent.isPlayer = isPlayer;
    ent.bot = !isPlayer;
    ent.modeActive = true;
    ent.state = createTankState(ent.spec, _spawnPos, spawn.yaw);
    ent.combat = createCombatState(ent.spec);
    ent.specialAction = createSpecialActionState(ent.spec);
    // EQUIPMENT SYSTEM: attach the loadout — player fights with the garage
    // picks, every bot gets its role-default kit (AI parity: the player is
    // never uniquely advantaged). applyEquipmentToCombat stores the
    // equipMults record the damage/movement/repair hooks read and scales
    // module durability (wet rack / suspension / safety fuel).
    ent.equip = isPlayer
      ? (loadEquipment(ent.specId) || [])
      : defaultLoadoutFor(ent.spec);
    applyEquipmentToCombat(equipmentCombat(ent.combat), ent.equip, ent.spec);
    ent.input.throttle = 0;
    ent.input.steer = 0;
    ent.input.brake = false;
    ent.input.fire = false;
    ent.input.shellSlot = 0;
    ent.input.aimPoint.copy(ent.state.aimPoint);
    ent._destroyedAnnounced = false;
    ent._openingRoute = null;
    ent._lastImpactT = -1; // impact-event cooldown must not carry across battles
    ent.ai = null;
    // Rematch: undo any wreck look / thrown tracks / stripped ERA from the
    // previous battle (visuals only — combat state above is already fresh).
    // PERF r3: visual may still be streaming in (boot deferVisuals path) —
    // a fresh build needs no reset.
    if (ent.visual && ent.visual.resetDestroyed) ent.visual.resetDestroyed();
    if (isPlayer) {
      game.player = ent;
      ent.aiCtl = null;
    } else {
      const botRng = mulberry32(7000 + i);
      const routeRng = mulberry32(17000 + i);
      const aiController = createAI(ent, {
        difficulty: getStoredDifficulty(),
        rng: botRng,
        deps: {
          ...aiDeps,
          // SYMMETRIC TEAMS: every bot fights the OPPOSING team (allied bots
          // hunt enemies; enemy bots engage the player AND the allies).
          getEnemies: () => game.tanks.filter(
            (t) => t.team !== ent.team && t.combat && !t.combat.destroyed),
          // BATTLE-AI r7: living teammates — low-HP/tracked bots retreat
          // toward support instead of dying in the open (ai.ts doctrine).
          getAllies: () => game.tanks.filter(
            (t) => t !== ent && t.team === ent.team && t.combat && !t.combat.destroyed),
          // AI target acquisition goes THROUGH the spotting sim (§camo
          // charter) from the bot's OWN team's intel, with the bot as the
          // radio-debuff receiver (simulation_correctness r1).
          spotting: {
            isSpotted: (id: string, receiver: SpottingTank | null) =>
              (game.spotting ? game.spotting.isSpotted(id, ent.team, receiver) : true),
          },
        },
      }) as SoloAiController;
      ent.aiCtl = aiController;
      // BATTLE-AI r7 OPENING PLANS: each bot opens on its CLASS doctrine lane
      // (ai.ts roleOf — driven by the bot's own spec) instead of the old
      // one-size standoff push. Both teams advance from their own spawn zones
      // toward the opposing spawn, so the battle opens with two fronts:
      //  - brawlers (heavies + slow MBTs) take the vanguard lanes straight up
      //    the middle to a tight standoff ring — they lead the push;
      //  - flankers (mediums + fast MBTs) swing 95-170 m wide before turning
      //    onto the opposing spawn — support fire from the sides;
      //  - snipers (TDs) drive to a sightline post on their OWN half and hold
      //    it (ai.ts shoot-and-scoot relocates them after 1-2 shots);
      //  - scouts (lights/IFVs) run wide spotting legs along real bushes
      //    (_bushNudge) — they light targets up for the team intel net.
      // Every mobile plan still ends ON the opposing spawn: a push that meets
      // nobody keeps hunting toward where the opposition was guaranteed to
      // be, so proximity spotting (50 m floor) eventually forces contact.
      // (Bots stuck on obstacles skip waypoints — ai.ts progress unstick —
      // so lanes survive walls and rocks; the lane-starvation fixes stand.)
      const pp = ent.team === 'enemy' ? sp.player.pos : [_ecx, 0, _ecz];
      const dx = pp[0] - spawn.pos[0];
      const dz = pp[2] - spawn.pos[2];
      const d = Math.hypot(dx, dz) || 1;
      const ux = dx / d, uz = dz / d;
      const lx = uz, lz = -ux; // lateral basis (perp of the advance axis)
      const rc = _roleCounts[ent.team];
      let role = roleOf(ent.spec);
      // vanguard guarantee: a team with no brawler promotes its FIRST flanker
      // so somebody always leads the push (early-contact requirement).
      if (role === 'flanker' && !_teamHasBrawler[ent.team] && !rc._vanguard) {
        rc._vanguard = true;
        role = 'brawler';
      } else if (role === 'flanker' && !_teamHasScout[ent.team] && !rc._scoutLane) {
        // spotting-lane guarantee: a scout-less team sends one flanker up a
        // wide scout lane (waypoints only — it still FIGHTS as a flanker) so
        // first contact never waits on a slow heavy grind (autumn probe:
        // 46.7 s first spot on a scout-less draw vs the 45 s gate).
        rc._scoutLane = true;
        role = 'scout';
      }
      const previousRoleCount = rc[role];
      const n = typeof previousRoleCount === 'number' ? previousRoleCount : 0;
      rc[role] = n + 1;
      // opposite teams fan to opposite sides first so lanes interleave
      const side = (n % 2 === 0 ? 1 : -1) * (ent.team === 'enemy' ? 1 : -1);
      const W: Waypoint[] = [];
      if (role === 'sniper') {
        // sightline post on the own half, fanned off the advance axis
        const f = 0.30 + (n % 3) * 0.06;
        const lat = (34 + n * 27) * side;
        W.push([spawn.pos[0] + dx * f + lx * lat, spawn.pos[2] + dz * f + lz * lat]);
      } else if (role === 'scout') {
        const lat = (190 + n * 42) * side;
        W.push(
          _bushNudge(spawn.pos[0] + dx * 0.42 + lx * lat, spawn.pos[2] + dz * 0.42 + lz * lat),
          _bushNudge(spawn.pos[0] + dx * 0.68 + lx * lat * 0.7, spawn.pos[2] + dz * 0.68 + lz * lat * 0.7),
          [pp[0], pp[2]],
        );
      } else if (role === 'flanker') {
        const lat = (95 + (n % 3) * 38) * side;
        const standoff = Math.min(d, 165 + (n % 3) * 22);
        W.push(
          [spawn.pos[0] + dx * 0.45 + lx * lat, spawn.pos[2] + dz * 0.45 + lz * lat],
          [pp[0] - ux * standoff + lx * lat * 0.55, pp[2] - uz * standoff + lz * lat * 0.55],
          [pp[0], pp[2]],
        );
      } else {
        // brawler vanguard: near-center lanes, tightest ring; the first
        // brawler is the spearhead at 105 m so contact always happens early
        const lat = ((n % 3) - 1) * 44 * (ent.team === 'enemy' ? 1 : -1);
        const standoff = Math.min(d, n === 0 ? 105 : 135 + (n % 3) * 22);
        W.push(
          [spawn.pos[0] + dx * 0.5 + lx * lat, spawn.pos[2] + dz * 0.5 + lz * lat],
          [pp[0] - ux * standoff + lx * lat, pp[2] - uz * standoff + lz * lat],
          [pp[0], pp[2]],
        );
      }
      // town skirt applies to staging legs only — the FINAL sweep leg keeps
      // hunting through the opposing spawn (proximity-spot guarantee).
      const doctrineWaypoints = W.map((pt, wi) => {
        const [wx, wz] = wi < W.length - 1 ? _skirtWp(pt[0], pt[1]) : pt;
        return [_clampW(wx), _clampW(wz)];
      });
      const prepareOpeningRoute = (): void => {
        const terrainWaypoints: Waypoint[] = [];
        let routeStart = { x: spawn.pos[0], z: spawn.pos[2] };
        for (const [wx, wz] of doctrineWaypoints) {
          const leg = planBotRoute({
            start: routeStart,
            goal: { x: wx, z: wz },
            navigation: botNavigation,
            rng: routeRng,
            role,
            spec: ent.spec,
            useRoleDetour: false,
          });
          if (!leg.length) break;
          terrainWaypoints.push(...leg);
          routeStart = { x: wx, z: wz };
        }
        aiController.setWaypoints(terrainWaypoints, { loop: false });
        // Retain the immutable battle-start copy so main can prime the fast
        // terrain grid before rollout instead of baking under moving bots.
        ent._openingRoute = terrainWaypoints;
      };
      if (opts.deferOpeningRoutes) game.openingRouteJobs.push(prepareOpeningRoute);
      else prepareOpeningRoute();
    }
    // Spawn warm-start (r5 terrain-contact gate): run the movement sim for a
    // few ticks so the attitude spring settles and the terrain support solve
    // owns pos.y BEFORE the first rendered frame — the raw spawn pose (flat
    // attitude, pad-center height) rendered one frame with a track end
    // clipped ~0.3 m into the pad-edge slope. Rigid-gear detection first: a
    refreshContactGeometry(ent);
    for (let k = 0; k < 30; k++) updateTank(ent, world.heightField, SIM_DT);
    // PERF r3: deferred boot visuals sync when ensureTankVisual builds them
    if (ent.visual) {
      ent.visual.syncFromState(ent.state);
      ent.visual.setVisible(true);
    }
  });

  game.matchModeController = createMatchModeController({
    mode: game.gameMode,
    entities: game.tanks.map(asModeEntity),
    seed: COMBAT_SEED + game.battleCount,
    terrainHeight: (x, z) => world.heightField.getHeightAt(x, z),
    emit: (type, payload) => game.modeEvents.push({ type, payload }),
    setActive(modeEntity, active) {
      const ent = asSoloEntity(modeEntity);
      ent.modeActive = active;
      ent.visual?.setVisible(active);
    },
    revive(modeEntity: MatchModeEntity, spawn: MatchModeSpawn, healthScale: number) {
      const ent = asSoloEntity(modeEntity);
      _spawnPos.set(spawn.x, world.heightField.getHeightAt(spawn.x, spawn.z), spawn.z);
      ent.state = createTankState(ent.spec, _spawnPos, spawn.yaw);
      ent.combat = createCombatState(ent.spec);
      if (healthScale !== 1) {
        ent.combat.maxHp = Math.max(1, Math.round(ent.combat.maxHp * healthScale));
        ent.combat.hp = ent.combat.maxHp;
      }
      applyEquipmentToCombat(
        equipmentCombat(ent.combat),
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
function refreshContactGeometry(ent: SoloEntity): void {
  if (!ent.visual) return;
  ent.rigidGear = false;
  // MOVEMENT r1 (fidelity-rebuild fallout): PROCEDURAL visuals carry as-built
  // contact metadata too (tankFactory measures the rest pose at construction —
  // the rebuilt profiles moved wheel/track lines off the old y = 0 /
  // ±0.45 L assumption, floating some parked tanks past the 3 cm gate and
  // resting crest drives on up to ~1 m of phantom contact per end). Stamp it
  // once per visual.
  if (!ent.contactGeom && ent.visual.contactGeom) {
    const cg = ent.visual.contactGeom;
    const d = ent.spec && ent.spec.dims;
    if (d) {
      const L = d.hullLengthM;
      const W = d.widthM;
      const clamp = (x: number, lo: number, hi: number): number =>
        (x < lo ? lo : (x > hi ? hi : x));
      ent.contactGeom = {
        halfLenM: cg.halfLenM != null
          ? clamp(cg.halfLenM, CONTACT_LEN_FRAC_MIN * L, CONTACT_LEN_FRAC_MAX * L)
          : 0.45 * L,
        halfWidM: cg.halfWidM != null
          ? clamp(cg.halfWidM, CONTACT_WID_FRAC_MIN * W, CONTACT_WID_FRAC_MAX * W)
          : 0.5 * W,
        zCenterM: cg.zCenterM != null
          ? clamp(cg.zCenterM, -CONTACT_ZC_FRAC_MAX * L, CONTACT_ZC_FRAC_MAX * L)
          : 0,
        bottomYM: clamp(cg.bottomYM || 0, CONTACT_BOTY_MIN, CONTACT_BOTY_MAX),
        // measured hull-pan floor: the movement belly guard hard-clamps at the
        // real plate instead of the stale fixed 0.34 m line (see tankFactory)
        panYM: cg.panYM != null ? clamp(cg.panYM, CONTACT_PAN_MIN, CONTACT_PAN_MAX) : null,
        // wrap approach-rise for the line-end guard samples (tankFactory)
        endRise: cg.endRise
          ? {
            dzM: clamp(cg.endRise.dzM || 0.4, 0.2, 0.6),
            frontM: clamp(cg.endRise.frontM, 0.02, 0.5),
            rearM: clamp(cg.endRise.rearM, 0.02, 0.5),
          }
          : null,
      };
    }
  }
}

// gameplay_feel r7 (round critique CRITICAL — resting/rolling FLOAT): the
// support solve assumed every visual's track bottom runs ±0.45 × hullLengthM
// (true for tankFactory's procedural gear by construction). GLB swaps do NOT
// honor that layout — the sourced Abrams' rendered contact run measures only
// ±2.3 m of its 7.93 m hull (0.29 L), tracks curling UP well before ±0.45 L,
// so the solve held the hull on ~1.25 m of phantom contact beyond each real
// track end: median 20-21 cm of daylight under the lowest rendered vertex on
// rolling ground, 21 cm hover at rest. Fix: scan the swapped visual's LOW
// BAND exactly like the r7 probe — hull-local vertices within 5 cm of the
// overall min-Y — and derive the contact half-length/half-width/center from
// that band. Runs ONCE per swap detection (a few hundred k verts, strided),
// in the visual root's local frame (== the sim's hull frame: root.position =
// state.pos, root.rotation = sim attitude, so inv(rootWorld)·meshWorld drops
// any pose above/at the root).
const CONTACT_BAND_M = 0.05;      // low band: vertices within 5 cm of min-Y
const CONTACT_MIN_SAMPLES = 24;   // fewer band samples than this = no trust
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
function measureContactGeom(ent: SoloEntity): MovementContactGeometry | null {
  const root = ent.visual && ent.visual.root;
  const spec = ent.spec;
  if (!root || !spec || !spec.dims) return null;
  const L = spec.dims.hullLengthM;
  const W = spec.dims.widthM;
  try {
    root.updateMatrixWorld(true);
    const invRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const rel = new THREE.Matrix4();
    const meshes: Array<{
      o: THREE.Mesh;
      pa: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
    }> = [];
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh || !object.geometry) return;
      const o = object;
      // skip hidden subtrees (the swapped-out procedural gear) and non-color
      // helpers (shadow proxies write no color but DO define the cast shadow
      // silhouette — they clone hidden gear geometry, so keep them out too)
      const material = Array.isArray(o.material) ? o.material[0] : o.material;
      if (material && material.colorWrite === false) return;
      let p: THREE.Object3D | null = o;
      let vis = true;
      while (p && p !== root) { if (!p.visible) { vis = false; break; } p = p.parent; }
      if (!vis) return;
      const pa = o.geometry.getAttribute && o.geometry.getAttribute('position');
      if (!pa) return;
      meshes.push({ o, pa });
    });
    if (!meshes.length) return null;
    // pass 1: hull-local Y of every (strided) vertex. The floor is the FIRST
    // DENSE SHELL (lowest level with 12 samples inside 1.5 cm), not the
    // absolute min — a stray low vertex (loose export debris, a tow-hook tip)
    // would otherwise float the whole seated contact run by its depth, while
    // a global percentile overshoots sparse-bottomed exports (merkava4b's
    // track underside holds few verts against a dense upper hull — the 0.4 %
    // quantile called its floor +0.086 and buried the real one 3.8 cm).
    // Mirrors tankFactory robustFloorY (MOVEMENT r1).
    const pts = [];
    const ys = [];
    const trackYs = [];
    const v = new THREE.Vector3();
    for (const { o, pa } of meshes) {
      rel.multiplyMatrices(invRoot, o.matrixWorld);
      const step = Math.max(1, Math.floor(pa.count / 20000));
      for (let i = 0; i < pa.count; i += step) {
        v.fromBufferAttribute(pa, i).applyMatrix4(rel);
        pts.push(v.x, v.y, v.z);
        ys.push(v.y);
        // Track contact lives outboard. A dense center keel, mine plough tip,
        // or low belly plate must not become the load-bearing floor and hold
        // both visible track runs in the air.
        if (Math.abs(v.x) >= W * 0.20) trackYs.push(v.y);
      }
    }
    if (!ys.length) return null;
    const denseFloor = (list: number[]): number => {
      list.sort((a, b) => a - b);
      let floor = list[0];
      if (list.length >= 12) {
        for (let i = 0; i + 11 < list.length; i++) {
          if (list[i + 11] - list[i] <= 0.015) { floor = list[i]; break; }
        }
      }
      return floor;
    };
    const minY = trackYs.length >= CONTACT_MIN_SAMPLES
      ? denseFloor(trackYs) : denseFloor(ys);
    // hull-pan floor for the belly guard — lowest root-local bbox bottom over
    // meshes whose bbox SPANS the centerline (vertex sampling cannot see a
    // wide belly plate; mirrors tankFactory measureRestContact). Floored
    // above the contact plane; see the CONTACT_PAN_* note.
    let panYM = null;
    {
      const corner = new THREE.Vector3();
      for (const { o } of meshes) {
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        const bb = o.geometry.boundingBox;
        if (!bb) continue;
        rel.multiplyMatrices(invRoot, o.matrixWorld);
        let mnX = Infinity, mxX = -Infinity, mnY = Infinity;
        for (const cx of [bb.min.x, bb.max.x]) {
          for (const cy of [bb.min.y, bb.max.y]) {
            for (const cz of [bb.min.z, bb.max.z]) {
              corner.set(cx, cy, cz).applyMatrix4(rel);
              if (corner.x < mnX) mnX = corner.x;
              if (corner.x > mxX) mxX = corner.x;
              if (corner.y < mnY) mnY = corner.y;
            }
          }
        }
        if (mnX < -0.2 && mxX > 0.2 && (panYM === null || mnY < panYM)) panYM = mnY;
      }
      if (panYM !== null) {
        panYM = Math.max(panYM, minY + 0.05);
        if (!(panYM >= CONTACT_PAN_MIN && panYM <= CONTACT_PAN_MAX)) panYM = null;
      }
    }
    // pass 2: extents of the low band
    const band = minY + CONTACT_BAND_M;
    let zMin = Infinity, zMax = -Infinity, xMin = Infinity, xMax = -Infinity, n = 0;
    for (let i = 0; i < pts.length; i += 3) {
      if (pts[i + 1] > band) continue;
      const x = pts[i], z = pts[i + 2];
      if (trackYs.length >= CONTACT_MIN_SAMPLES && Math.abs(x) < W * 0.20) continue;
      if (z < zMin) zMin = z;
      if (z > zMax) zMax = z;
      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
      n++;
    }
    if (n < CONTACT_MIN_SAMPLES || zMax - zMin < 1 || xMax - xMin < 0.5) return null;
    const clamp = (x: number, lo: number, hi: number): number =>
      (x < lo ? lo : (x > hi ? hi : x));
    return {
      halfLenM: clamp((zMax - zMin) / 2, CONTACT_LEN_FRAC_MIN * L, CONTACT_LEN_FRAC_MAX * L),
      halfWidM: clamp((xMax - xMin) / 2, CONTACT_WID_FRAC_MIN * W, CONTACT_WID_FRAC_MAX * W),
      zCenterM: clamp((zMax + zMin) / 2, -CONTACT_ZC_FRAC_MAX * L, CONTACT_ZC_FRAC_MAX * L),
      // MOVEMENT r1: the support solve seats the measured bottom plane on the
      // terrain. Sourced GLBs are ground-normalized by modelLoader so this is
      // ~0 for most, but a handful ride their export's floor line (is6b
      // parked +1.5 cm of daylight before this).
      bottomYM: clamp(minY, CONTACT_BOTY_MIN, CONTACT_BOTY_MAX),
      panYM,
      // GLB wraps curl up right past the measured run — a conservative fixed
      // rise for the line-end guard samples (procedural rigs export exact)
      endRise: { dzM: 0.4, frontM: 0.12, rearM: 0.12 },
    };
  } catch {
    return null; // scan is best-effort: fall back to spec fractions
  }
}

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
  function collide(pos: THREE.Vector3, radiusM: number, outPush: THREE.Vector3): boolean {
    outPush.set(0, 0, 0);
    let pushed = false;
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
    const selfSpeed = self && self.state ? Math.abs(self.state.speed) : 0;

    // --- other tanks: exact-shell bounds as oriented rectangles ------------
    for (const other of game.tanks) {
      if (other === self || other.modeActive === false || !other.state) continue;
      const otherRect = tankContactRect(other.spec);
      const oHalfW = otherRect.halfWidth;
      const oHalfL = otherRect.halfLength;
      const ofx = Math.sin(other.state.yaw), ofz = Math.cos(other.state.yaw);
      const orx = ofz, orz = -ofx;
      const otherCenterX = other.state.pos.x + orx * otherRect.centerX + ofx * otherRect.centerZ;
      const otherCenterZ = other.state.pos.z + orz * otherRect.centerX + ofz * otherRect.centerZ;
      const dx0 = centerX - otherCenterX;
      const dz0 = centerZ - otherCenterZ;
      const outer = Math.hypot(halfL, halfW) + Math.hypot(oHalfL, oHalfW);
      if (dx0 * dx0 + dz0 * dz0 > outer * outer) continue;
      if (self && prefersVerticalTankContact(self, other)) continue;
      const beforeX = outPush.x, beforeZ = outPush.z;
      if (pushHullFromHull(
        centerX, centerZ, fx, fz, rx, rz, halfL, halfW,
        otherCenterX, otherCenterZ, ofx, ofz, orx, orz, oHalfL, oHalfW,
        outPush,
      )) {
        pushed = true;
        const pushX = outPush.x - beforeX;
        const pushZ = outPush.z - beforeZ;
        const pushLength = Math.hypot(pushX, pushZ);
        if (self && self.state && pushLength > 1e-6) {
          const nx = pushX / pushLength, nz = pushZ / pushLength;
          const relX = fx * self.state.speed - ofx * other.state.speed;
          const relZ = fz * self.state.speed - ofz * other.state.speed;
          const closing = -(relX * nx + relZ * nz);
          if (closing > 0) pendingRams.push({ a: self, b: other, closing, nx, nz });
        }
      }
    }

    // --- static obstacle AABBs: hull OBB vs box via 2D SAT -----------------
    const broadR = Math.sqrt(halfL * halfL + halfW * halfW) + 0.01;
    const candidates = world.queryObstacles
      ? world.queryObstacles(centerX - broadR, centerZ - broadR,
        centerX + broadR, centerZ + broadR, nearby)
      : obstacles;
    for (const ob of candidates) {
      if (ob.crushed) continue;                 // felled — ghosts for everyone
      if (pos.y > ob.max[1] + 0.5) continue;
      const ccx = Math.max(ob.min[0], Math.min(centerX, ob.max[0]));
      const ccz = Math.max(ob.min[2], Math.min(centerZ, ob.max[2]));
      const bdx = centerX - ccx;
      const bdz = centerZ - ccz;
      if (bdx * bdx + bdz * bdz >= broadR * broadR) continue;
      // Narrow phase honors a prop's projected shape: rotated structures are
      // OBBs, trunks/round props are circles, and displaced rocks publish the
      // convex hull of their rendered mesh. The helper adds the exact MTV to
      // a scratch vector so a crushable can still choose to ignore it.
      const beforeX = outPush.x, beforeZ = outPush.z;
      if (!pushHullFromObstacle(_contactCenter, fx, fz, rx, rz, halfL, halfW, ob, outPush)) continue;
      if (ob.crushable && self) {
        // DESTRUCTIBLES r1: per-obstacle overrun threshold — heavy light-cover
        // (stone wall runs) resists a touch harder than a sapling before the
        // hull powers through; the held-press saw below still defeats
        // everything crushable, so nothing tagged can permanently wall a hull.
        let crushNow = selfSpeed > (ob.crushMin ?? CRUSH_MIN_MPS);
        // BATTLE-AI r7: held-press threshold 0.5 -> 0.35. AI throttle shaping
        // (arrival ease-in, obstacle damping) legitimately drives at 0.35-0.5
        // against a sapling and used to dead-stop under the old bar forever
        // (coastal spawn-exit trace: 30 s at spd 0, thr 0.4). 0.35+ is still
        // a deliberate push — a parked nudge (zero throttle) never fells.
        if (!crushNow && self.input &&
            Math.abs(self.input.throttle || 0) > 0.35) {
          // slow-speed press: the trunk resists, but held drive saws it down
          // after CRUSH_PRESS_S of continuous contact (wedge-deadlock fix).
          if (game.timeS - (ob._pressT || -1e9) > CRUSH_PRESS_GAP_S) {
            ob._pressS = 0;
          }
          ob._pressT = game.timeS;
          ob._pressS = (ob._pressS || 0) + SIM_DT;
          crushNow = ob._pressS >= CRUSH_PRESS_S;
        }
        if (crushNow) {
          // momentum (or the held press) carries the hull THROUGH — queue the
          // crush (deduped); simStep resolves it (topple + speed bite + bus).
          let queued = false;
          for (let qi = 0; qi < pendingCrush.length; qi++) {
            if (pendingCrush[qi].ob === ob) { queued = true; break; }
          }
          if (!queued) pendingCrush.push({ ob, ent: self });
          // A crushed/queued prop carries no blocking push this tick.
          outPush.x = beforeX; outPush.z = beforeZ;
          continue;
        }
      }
      pushed = true;
    }
    return pushed;
  }
  return {
    collide,
    setSelf(e: SoloEntity) { self = e; },
    queueRam(a: SoloEntity, b: SoloEntity, closing: number, nx = 0, nz = 0) {
      if (closing > 0) pendingRams.push({ a, b, closing, nx, nz });
    },
    pendingCrush,
    pendingRams,
  };
}

/** Emit the derived bus events flagged inside one HitEvent. */
function emitHitOutcome(game: SoloGameState, bus: EventBus, ev: SoloHitEvent): void {
  const target = ev.targetId ? game.tankById.get(ev.targetId) || null : null;
  // SHOT-INFO ENRICHMENT (ADDITIVE ONLY — consumed by src/ui/shotInfo.js):
  // resolve ids to names/spec ids + stamp sim time. Existing fields untouched.
  ev.timeS = game.timeS;
  const attacker = ev.attackerId ? game.tankById.get(ev.attackerId) || null : null;
  if (attacker && attacker.spec) {
    ev.attackerName = attacker.spec.name;
    ev.attackerSpecId = attacker.specId;
  }
  if (target && target.spec) {
    ev.targetName = target.spec.name;
    ev.targetSpecId = target.specId;
    ev.targetMaxHp = target.combat ? target.combat.maxHp : 0;
  }
  // KILL-CAM CAPTURE (ADDITIVE — src/game/killcam.js): snapshot the fully
  // resolved event chain + victim pose for lethal-shot replays. main.ts
  // assigns game.killcam; nothing here changes when it is absent.
  if (game.killcam) game.killcam.onShellHit(ev, target);
  bus.emit('shell:hit', ev);
  if (ev.modulesHit && ev.modulesHit.length && ev.targetId) {
    for (const m of ev.modulesHit) {
      bus.emit('module:state', {
        id: ev.targetId, module: m.module, state: m.newState, source: 'hit',
      });
    }
  }
  if (ev.fireStarted && ev.targetId) {
    bus.emit('tank:fire', { id: ev.targetId, burning: true });
  }
  if (ev.destroyed && isActiveSoloEntity(target) && !target._destroyedAnnounced) {
    announceDestroyed(game, bus, target, ev.attackerId, ev.ammoRacked ? 'ammorack' : 'shot');
  }
  const shooter = game.tankById.get(ev.attackerId);
  if (shooter && shooter.aiCtl) shooter.aiCtl.notifyShellResult(ev);
  // UNDER-FIRE REACTION (controls_gunnery r2): being shot reveals the shooter
  // (tracer + muzzle flash). The victim and teammates within 200 m turn on
  // the attacker even when the shot came from outside their normal spotting
  // and engage envelopes — return fire pressure is core WoT feel.
  if (isActiveSoloEntity(shooter) && isActiveSoloEntity(target) &&
      shooter.team !== target.team) {
    for (const ent of game.tanks) {
      if (ent.team !== target.team || !ent.aiCtl || !ent.state ||
          !ent.combat || ent.combat.destroyed) continue;
      if (ent !== target &&
          ent.state.pos.distanceToSquared(target.state.pos) > 200 * 200) continue;
      if (ent.aiCtl.notifyUnderFire) ent.aiCtl.notifyUnderFire(shooter);
    }
  }
}

function announceDestroyed(
  game: SoloGameState,
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

/** Fire the loaded shell if the trigger is held and the gun is ready. */
function tryFire(
  game: SoloGameState,
  ent: SoloEntity,
  bus: EventBus,
  rig: CameraRig | null,
): void {
  const c = ent.combat;
  if (!ent.input.fire || c.destroyed || c.reload.t > 0) return;
  if (c.magazine && c.magazine.rounds <= 0) return;
  if (c.modules.gun && c.modules.gun.state === 'red') return;
  // BATTLE-AI r7 hardening: clamp to the spec's REAL magazine — a slot index
  // past shells.length (2-shell loadouts like the sturmtiger) fed an
  // undefined spec into acquireShell and crashed the sim step.
  const maxSlot = ent.spec.gun.shells.length - 1;
  const slot = Math.max(0, Math.min(Math.min(2, maxSlot), ent.input.shellSlot | 0));
  if (slot !== c.shellSlot) {
    if (c.magazine) {
      selectShell(c, slot, ent.spec);
      return;
    }
    // PER-SHELL RELOAD guard: switching INTO a slower slot at fire time must
    // pay the incoming shell's load first (an IFV bot flipping its 0.4 s
    // autocannon timer onto the ATGM rail would otherwise fire the missile
    // instantly). Switching down to an equal/faster shell stays free — the
    // longer load already waited covers it.
    const sh = ent.spec.gun.shells;
    const newBase = (sh[slot] && sh[slot].reloadS) || ent.spec.gun.reloadS;
    const oldBase = (sh[c.shellSlot] && sh[c.shellSlot].reloadS) || ent.spec.gun.reloadS;
    c.shellSlot = slot;
    if (newBase > oldBase) { startReload(c, ent.spec); return; }
  }
  const shellSpec = ent.spec.gun.shells[c.shellSlot];
  if (!game.matchModeController?.consumeShot(asModeEntity(ent))) {
    bus.emit('mode:ammo_empty', { id: ent.id });
    return;
  }
  const guidedSpecial = !!(shellSpec.guided && ent.specialAction?.active &&
    ent.specialAction.pendingFire && c.shellSlot === ent.specialAction.missileSlot);

  // Barrel direction from the visual (already chasing input.aimPoint).
  // controls_gunnery r3 CRITICAL: use the articulated bore AXIS (recoil-group
  // +Z), NOT muzzle-minus-pivot — on GLB-swapped tanks the muzzle anchor is
  // re-derived from real tube-tip vertices and sits off the trunnion axis
  // (m1a2: ~45 mrad skew), so the anchor-difference line pointed every
  // "settled" shot ~15 m wide at 330 m while the sim gun-lay was perfect.
  // §5.362 twin-plant alternation (spec.gun.muzzles — bmpt_terminator2's
  // twin 30 mms): shot N fires from muzzles[N % len]. The cursor lives on
  // the gun's combat state (deterministic with the fire sequence, reset with
  // every fresh combat state); the shell origin, the muzzle-flash origin
  // (shell:fired muzzlePos) and the visual's asymmetric recoil kick all use
  // the same index. Single-bore fleet: muzzleIndex stays undefined and every
  // path below is byte-identical legacy.
  const gunMuzzles = ent.spec.gun.muzzles;
  let muzzleIndex;
  if (Array.isArray(gunMuzzles) && gunMuzzles.length > 1) {
    muzzleIndex = (c.muzzleCursor || 0) % gunMuzzles.length;
    c.muzzleCursor = muzzleIndex + 1;
  }
  const visual = ent.visual;
  if (!visual) return;
  visual.gunMuzzleWorld(_muzzle, muzzleIndex);
  if (visual.gunDirWorld) {
    visual.gunDirWorld(_dir);
  } else {
    visual.gunPivotWorld(_pivot);
    _dir.copy(_muzzle).sub(_pivot).normalize();
  }

  // Dispersion: sigmaRad = r(100 m)/200 (§3.5.1 locked), gun yellow ⇒ σ×2.
  let sigmaRad = computeDispersionRadM(ent.spec, ent.state, 100) / 200;
  if (c.modules.gun && c.modules.gun.state === 'yellow') sigmaRad *= 2;
  applyDispersion(_dir, sigmaRad, game.combatRng);

  const shell = acquireShell(shellSpec, ent.id, ent.isPlayer, _muzzle, _dir, game.nextShellId++);
  game.shells.push(shell);
  // The actual shell matters for IFVs: rapid autocannon belt rounds should
  // barely disturb the stabilized lay, while the same vehicle's ATGM rail
  // still produces full bloom and physical/presentation recoil.
  const recoilScale = shotRecoilScale(ent.spec, shellSpec);
  fireRecoil(ent.state, ent.spec, shellSpec);
  visual.recoilKick(0, recoilScale, muzzleIndex);
  if (ent.isPlayer && rig) {
    // Dedicated feel pass: the old fixed impulse made a 30 mm autocannon and
    // a 152 mm siege gun kick the camera identically. Scale both concussion
    // and pitch by bore size while preserving the former 120 mm baseline.
    const caliberK = Math.max(0, Math.min(1, (shellSpec.caliberMm - 30) / 122));
    rig.addTrauma((0.10 + caliberK * 0.20) * recoilScale);
    if (rig.recoilKick) {
      rig.recoilKick((0.006 + caliberK * 0.011) * recoilScale, recoilScale);
    }
  }
  _firedEv.shellId = shell.id;
  _firedEv.shooterId = ent.id;
  _firedEv.isPlayer = ent.isPlayer;
  _firedEv.shellType = shellSpec.type;
  _firedEv.shellName = shellSpec.name; // SHOT-INFO ENRICHMENT (additive)
  // Weapon-native audio stays presentation-only. Shell overrides distinguish
  // ATGM/100 mm launches from the vehicle's default autocannon report.
  _firedEv.weaponSound = shellSpec.soundProfile || ent.spec.gun.soundProfile || null;
  // §5.362 (additive): which barrel fired on twin-plant ids, -1 single-bore.
  // The payload object is REUSED — always write so no stale index leaks.
  _firedEv.muzzleIndex = muzzleIndex != null ? muzzleIndex : -1;
  _firedEv.recoilScale = recoilScale;
  _firedEv.caliberMm = shellSpec.caliberMm;
  _firedEv.velocityMps = shellSpec.velocityMps;
  _firedEv.timeS = game.timeS;
  _firedEv.muzzlePos[0] = _muzzle.x; _firedEv.muzzlePos[1] = _muzzle.y; _firedEv.muzzlePos[2] = _muzzle.z;
  _firedEv.dir[0] = _dir.x; _firedEv.dir[1] = _dir.y; _firedEv.dir[2] = _dir.z;
  bus.emit('shell:fired', _firedEv);
  startPostShotReload(c, ent.spec);
  if (guidedSpecial) finishSpecialActionFire(ent, shell.id);
  // SPOTTING WIRING: firing blooms the shooter's camo (with decay) and lights
  // up any concealing foliage within 15 m (see src/sim/spotting.ts).
  if (game.spotting) game.spotting.notifyFired(ent.id, game.timeS);
  // PLAYER MUZZLE-FLASH INTEL (controls_gunnery r5): a firing player is
  // visible intel — muzzle flash + tracer — to every enemy within 420 m,
  // even while camo keeps them formally unspotted. WW2 bots (350-380 m view
  // range) could otherwise never acquire a 400 m sniping player: the r5
  // probe measured 29+ enemy shells across two 60 s runs with ZERO aimed at
  // the player. ai.ts notifyPlayerFired re-reveals the player for
  // MUZZLE_INTEL_WINDOW_S and hard-commits idle bots onto the shooter.
  if (ent.isPlayer) {
    // controls_gunnery r4: DISTANCE-RANKED fan-out — ai.ts's RETURN-FIRE
    // LOCK lets the nearest ranked receivers with a clear personal ray pin
    // the player as their target outright (rank 0 = closest). Runs once per
    // player shot, so the sort allocation is negligible.
    // r4: earshot 420 -> 500 m — the intel radius must exceed the worst
    // spawn standoff (~450 m) the same way engageRangeM had to (r7 tier
    // note), or opening snipes from spawn draw zero receivers at all.
    const near: Array<{ e: SoloEntity; d2: number }> = [];
    for (const e of game.tanks) {
      if (e === ent || e.team === ent.team || !e.aiCtl || !e.state ||
          !e.combat || e.combat.destroyed) continue;
      const d2 = e.state.pos.distanceToSquared(ent.state.pos);
      if (d2 > 500 * 500) continue;
      near.push({ e, d2 });
    }
    near.sort((a, b) => a.d2 - b.d2);
    for (let i = 0; i < near.length; i++) {
      const e = near[i].e;
      e.aiCtl?.notifyPlayerFired?.(ent, i);
    }
  }
}

/** Advance all live shells one step and resolve collisions. */
function stepShells(game: SoloGameState, bus: EventBus, world: SoloWorld): void {
  const shells = game.shells;
  for (let si = 0; si < shells.length; si++) {
    const shell = shells[si];
    if (shell.dead) continue;
    const shooter = game.tankById.get(shell.shooterId);
    if (isActiveSoloEntity(shooter) && specialActionGuidesShell(shooter, shell)) {
      guideShellToward(shell, shooter.input?.aimPoint, SIM_DT);
    }
    stepShell(shell, SIM_DT);
    if (game.matchModeController?.tryHitBall(shell)) continue;

    _seg.copy(shell.pos).sub(shell.prevPos);
    const segLen = _seg.length();
    if (segLen < 1e-6) {
      if (shell.dead) bus.emit('shell:expired', { shellId: shell.id, pos: [shell.pos.x, shell.pos.y, shell.pos.z], hitTerrain: false });
      continue;
    }
    _seg.multiplyScalar(1 / segLen);

    const worldHit = world.raycast(shell.prevPos, _seg, segLen);
    const worldT = worldHit ? worldHit.dist : Infinity;

    // Broadphase: nearest tank whose armor trace yields intersections.
    let bestT = Infinity;
    let bestEnt: SoloEntity | null = null;
    let bestHits: ArmorIntersection[] | null = null;
    for (const ent of game.tanks) {
      // Wrecks stay in the broadphase: resolveShellHit branches to
      // resolveWreckHit for destroyed hulls (cover tactics — WoT core).
      if (ent.modeActive === false || !ent.state || !ent.combat) continue;
      if (ent.id === shell.shooterId) continue;
      const r = ent.spec.armor.boundingRadiusM;
      _toC.copy(ent.state.pos);
      _toC.y += ent.spec.dims.heightM * 0.5;
      _toC.sub(shell.prevPos);
      const proj = Math.max(0, Math.min(segLen, _toC.dot(_seg)));
      const d2 = _toC.lengthSq() - proj * proj;
      if (d2 > r * r) continue;
      const pose = tankPoseFromState(ent.state);
      const hits = traceTank(shell.prevPos, shell.pos, pose, ent.spec.armor, ent.combat.eraSpent);
      if (!hits.length) continue;
      const t = hits[0].t * segLen;
      if (t < bestT) { bestT = t; bestEnt = ent; bestHits = hits; }
    }

    if (bestEnt && bestHits && bestT <= worldT) {
      if (isHeClass(shell.spec.type)) {
        const burst = bestHits[0].point;
        const events = resolveHeBurst(shell, burst, game.tanks, bestEnt, bestHits, game.combatRng);
        for (const ev of events) emitHitOutcome(game, bus, ev);
      } else {
        const ev = resolveShellHit(shell, bestEnt, bestHits, game.combatRng);
        emitHitOutcome(game, bus, ev);
      }
    } else if (worldHit) {
      if (isHeClass(shell.spec.type)) {
        const events = resolveHeBurst(shell, worldHit.point, game.tanks, null, null, game.combatRng);
        for (const ev of events) emitHitOutcome(game, bus, ev);
      } else {
        shell.dead = true;
      }
      bus.emit('shell:expired', {
        shellId: shell.id,
        shooterId: shell.shooterId,
        pos: [worldHit.point.x, worldHit.point.y, worldHit.point.z],
        hitTerrain: worldHit.kind === 'terrain',
        hitKind: worldHit.kind,
        surfaceKind: worldHit.record?.kind || worldHit.kind,
        normal: worldHit.normal
          ? [worldHit.normal.x, worldHit.normal.y, worldHit.normal.z] : null,
        shellType: shell.spec.type,
        caliberMm: shell.spec.caliberMm,
      });
    } else if (shell.dead) {
      // lifetime expiry mid-air
      bus.emit('shell:expired', { shellId: shell.id, pos: [shell.pos.x, shell.pos.y, shell.pos.z], hitTerrain: false });
    }
  }
  // compact + recycle (nothing retains a shell past its death: killcam copies
  // positions, fx trails copy into their own arrays, damage events copy fields)
  for (let i = shells.length - 1; i >= 0; i--) {
    if (shells[i].dead) {
      const shell = shells[i];
      const shooter = game.tankById.get(shell.shooterId);
      if (isActiveSoloEntity(shooter) && completeGuidedMissileFlight(shooter, shell.id)) {
        bus.emit('ui:specialActionResult', {
          kind: shooter.specialAction.kind,
          active: false,
          reason: 'IMPACT',
        });
      }
      if (_shellPool.length < 64) _shellPool.push(shell);
      shells.splice(i, 1);
    }
  }
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

/**
 * One fixed simulation step (ARCHITECTURE.md §4 step 2).
 * @param {object} game game state
 * @param {object} bus event bus
 * @param {object} world World
 * @param {object} rig camera rig (trauma on player fire)
 * @param {object} collider makeCollide bundle (created once via createCollider)
 * @returns {void}
 */
export function simStep(
  game: SoloGameState,
  bus: EventBus,
  world: SoloWorld,
  rig: CameraRig | null,
  collider: CollisionBundle,
): void {
  const dt = SIM_DT;
  game.timeS += dt;

  // a0. SPOTTING WIRING: periodic concealment checks (staggered inside the
  // system — 0.5-2 s cadence, never per-frame). Newly-spotted events feed the
  // sixth-sense lamp when the player is the one lit up.
  if (game.spotting) {
    const spotEvents = game.spotting.update(dt, game.timeS);
    for (const ev of spotEvents) {
      bus.emit('tank:spotted', ev);
      if (game.player && ev.id === game.player.id && ev.team === 'enemy') {
        bus.emit('player:spotted', { timeS: game.timeS });
      }
    }
  }

  // a. AI writes inputs
  if (game.gameMode !== 'standard' && game.timeS >= (game._nextModeRouteS || 0)) {
    game._nextModeRouteS = game.timeS + (game.gameMode === 'turbo_ball' ? 1.25 : 4);
    for (const ent of game.tanks) {
      if (!ent.aiCtl || ent.modeActive === false || ent.combat?.destroyed) continue;
      const target = game.matchModeController?.botTarget(asModeEntity(ent));
      if (!target) continue;
      const moved = Math.hypot(
        target.x - (ent._modeTargetX ?? Infinity),
        target.z - (ent._modeTargetZ ?? Infinity),
      );
      if (moved < 18 && game.gameMode !== 'turbo_ball') continue;
      ent._modeTargetX = target.x;
      ent._modeTargetZ = target.z;
      ent.aiCtl.setWaypoints([[target.x, target.z]], { loop: false });
    }
  }
  for (const ent of game.tanks) {
    if (ent.modeActive !== false && ent.aiCtl && !ent.combat.destroyed) {
      ent.aiCtl.update(dt, game.timeS);
    }
  }

  // b. movement
  for (const ent of game.tanks) {
    if (ent.modeActive === false || !ent.state || ent.combat.destroyed) continue;
    refreshContactGeometry(ent);
    collider.setSelf(ent);
    updateTank(ent, world.heightField, dt, collider.collide);
    // r2 blocked-drive impact (gameplay_feel critique MAJOR): movement now
    // bleeds the wall-blocked speed component and reports the closing speed
    // it absorbed (state.impactMps). Surface it as feedback — WoT slams to a
    // halt with a clank + camera jolt instead of running-in-place. The
    // >1.5 m/s (~5.4 km/h) floor means ONE event per genuine hit; leaning on
    // the wall afterwards re-bleeds only ~accel·dt per tick and stays silent.
    const impact = ent.state.impactMps;
    if (impact > 1.5 && game.timeS - (ent._lastImpactT || -1) > 0.3) {
      // 0.3 s per-entity cooldown: a hard hit can bleed across 2 sim ticks
      // (first tick absorbs only the sub-tick overshoot into the wall) — one
      // collision must read as ONE clank/jolt, not a 16 ms double-tap.
      ent._lastImpactT = game.timeS;
      if (ent.isPlayer && rig) {
        rig.addTrauma(Math.min(0.5, 0.10 + impact * 0.030)); // 10 m/s ≈ 0.4
      }
      bus.emit('tank:impact', {
        id: ent.id,
        specId: ent.specId,
        isPlayer: ent.isPlayer,
        speedMps: impact,
        pos: [ent.state.pos.x, ent.state.pos.y, ent.state.pos.z],
      });
    }
  }

  // b1. Three-dimensional dynamic hull contacts. The ordinary collision seam
  // remains the fast horizontal/static-world path; this single pair pass owns
  // airborne roof landings, stacking and off-center rollover impulse.
  resolveTankBodyContacts(game.tanks, dt,
    (upper, lower, closing, nx, nz) =>
      collider.queueRam(
        upper as unknown as SoloEntity,
        lower as unknown as SoloEntity,
        closing,
        nx,
        nz,
      ));

  // b2. crushable props (gameplay_feel r6): resolve the hull-overrun crushes
  // the collider queued this tick — mark the record dead for all collision/AI
  // consumers, fell the world visual (topple anim — vegetation.ts/map.ts via
  // world.crushObstacle, see docs/SYSTEMS.md), bite a little
  // momentum (WoT: small trees barely slow a hull) and announce for fx/audio.
  const pending = collider.pendingCrush;
  if (pending && pending.length) {
    for (const q of pending) {
      const ob = q.ob;
      if (ob.crushed) continue;
      ob.crushed = true;
      const ent = q.ent;
      const dirSign = ent.state ? Math.sign(ent.state.speed || 1) : 1;
      const dirX = ent.state ? Math.sin(ent.state.yaw) * dirSign : 0;
      const dirZ = ent.state ? Math.cos(ent.state.yaw) * dirSign : 1;
      // DESTRUCTIBLES r1: the overrun speed rides into the world break so
      // debris inherits the hull's velocity (a 50 km/h ram throws chunks; a
      // crawl shoulders them aside), and the momentum bite is per-prop mass
      // (ob.crushKeep — sandbags barely register, a stone wall run scrubs
      // noticeably, but nothing crushable ever hard-stops the hull).
      const overrunMps = ent.state ? Math.abs(ent.state.speed) : 0;
      if (world.crushObstacle) world.crushObstacle(ob, dirX, dirZ, overrunMps);
      if (ent.state) ent.state.speed *= (ob.crushKeep ?? CRUSH_SPEED_KEEP);
      bus.emit('prop:crushed', {
        id: ent.id,
        specId: ent.specId,
        isPlayer: ent.isPlayer,
        speedMps: ent.state ? Math.abs(ent.state.speed) : 0,
        kind: ob.kind || 'tree',
        h: ob.max[1] - ob.min[1],
        pos: [
          (ob.min[0] + ob.max[0]) * 0.5,
          ob.min[1],
          (ob.min[2] + ob.max[2]) * 0.5,
        ],
        dir: [dirX, 0, dirZ],
      });
    }
    pending.length = 0;
  }

  // b3. RAMMING — resolve the tank-tank contacts the collider queued this
  // tick. Each collision is detected up to twice (once per side's movement
  // update, with mirrored roles); dedupe by unordered pair keeping the
  // detection with the highest closing speed. Damage split is mass-weighted
  // kinetic (sim/damage.ts ramDamage); wrecks still bruise the hull that
  // plows into them but take nothing. The wall-impact clank/jolt feedback
  // already fires from the movement blocked-drive path — this block adds hp,
  // kill attribution ('ram' cause) and the tank:ram event only.
  const rams = collider.pendingRams;
  if (rams && rams.length) {
    if (!game._ramPairT) game._ramPairT = new Map();
    const best = new Map<string, RamContact>(); // pairKey -> contact with max closing
    for (const q of rams) {
      const key = q.a.id < q.b.id ? `${q.a.id}|${q.b.id}` : `${q.b.id}|${q.a.id}`;
      const cur = best.get(key);
      if (!cur || q.closing > cur.closing) best.set(key, q);
    }
    for (const [key, q] of best) {
      const last = game._ramPairT.get(key);
      // (timeS < last = stale entry from a previous battle — timeS reset)
      if (last !== undefined && game.timeS >= last &&
          game.timeS - last < RAM_PAIR_COOLDOWN_S) continue;
      const a = q.a, b = q.b;
      if (!a.combat || !b.combat || a.combat.destroyed) continue;
      const dmg = ramDamage(
        a.spec.weightTons, b.spec.weightTons,
        // sub-tick overshoot: the recorded closing speed is the approach at
        // contact detection — exactly the speed the pushback then absorbed
        q.closing);
      if (dmg.total <= 0) continue;
      game._ramPairT.set(key, game.timeS);
      const bWreck = b.combat.destroyed;
      const dmgA = dmg.toA;
      const dmgB = bWreck ? 0 : dmg.toB;
      a.combat.hp = Math.max(0, a.combat.hp - dmgA);
      if (!bWreck) b.combat.hp = Math.max(0, b.combat.hp - dmgB);
      if (a.combat.hp <= 0) a.combat.destroyed = true;
      if (!bWreck && b.combat.hp <= 0) b.combat.destroyed = true;
      let nx = q.nx;
      let nz = q.nz;
      if (nx * nx + nz * nz < 1e-6) {
        nx = b.state.pos.x - a.state.pos.x;
        nz = b.state.pos.z - a.state.pos.z;
        const inv = 1 / Math.max(1e-6, Math.hypot(nx, nz));
        nx *= inv; nz *= inv;
      }
      const aModulesHit = a.combat.destroyed
        ? applyLethalRamModuleDamage(a, nx, nz) : [];
      const bModulesHit = b.combat.destroyed && !bWreck
        ? applyLethalRamModuleDamage(b, -nx, -nz) : [];
      const ramEvent: SoloRamEvent = {
        aId: a.id, bId: b.id,
        aSpecId: a.specId, bSpecId: b.specId,
        dmgA, dmgB,
        closingMps: q.closing,
        aIsPlayer: !!a.isPlayer, bIsPlayer: !!b.isPlayer,
        pos: [
          (a.state.pos.x + b.state.pos.x) * 0.5,
          (a.state.pos.y + b.state.pos.y) * 0.5,
          (a.state.pos.z + b.state.pos.z) * 0.5,
        ],
        normal: [nx, 0, nz],
        timeS: game.timeS,
        aModulesHit,
        bModulesHit,
      };
      // Capture before announceDestroyed swaps either visual to its wreck.
      if (game.killcam && (a.combat.destroyed || b.combat.destroyed)) {
        game.killcam.onRam(ramEvent, a, b);
      }
      for (const hit of aModulesHit) {
        bus.emit('module:state', { id: a.id, module: hit.module, state: 'red', source: 'ram' });
      }
      for (const hit of bModulesHit) {
        bus.emit('module:state', { id: b.id, module: hit.module, state: 'red', source: 'ram' });
      }
      if (b.combat.destroyed && !bWreck && !b._destroyedAnnounced) {
        announceDestroyed(game, bus, b, a.id, 'ram');
      }
      if (a.combat.destroyed && !a._destroyedAnnounced) {
        announceDestroyed(game, bus, a, bWreck ? null : b.id, 'ram');
      }
      // extra camera bite when the PLAYER is in a damaging ram (the baseline
      // wall-clank trauma from the movement path is tuned for scenery hits)
      if (rig) {
        const playerDmg = a.isPlayer ? dmgA : (b.isPlayer ? dmgB : 0);
        if (playerDmg > 0) rig.addTrauma(Math.min(0.55, 0.12 + playerDmg * 0.0009));
      }
      bus.emit('tank:ram', ramEvent);
    }
    rams.length = 0;
  }

  // A side/roof-down tank remains physically recoverable before the bounded
  // righting actuator engages. The shared lifecycle resets on a shove or
  // renewed motion, preserving real teammate recovery and preventing immortal
  // overturned bots from holding a match open indefinitely.
  for (const ent of game.tanks) {
    if (ent.modeActive === false || !ent.state || !ent.combat || ent.combat.destroyed) continue;
    if (!stepRolloverLifecycle(ent.state, dt)) continue;
    bus.emit('tank:autoflip', { id: ent.id, specId: ent.specId });
  }

  // c. reload timers + firing
  for (const ent of game.tanks) {
    const c = ent.combat;
    if (ent.modeActive === false || !c || c.destroyed) continue;
    const reload = c.reload;
    if (reload.t > 0) {
      const wasReloading = reload.t;
      const reloadKind = reload.kind;
      const done = tickReload(c, dt);
      if (ent.isPlayer) {
        // This is a 60 Hz presentation event while a load is active. Reuse one
        // payload per entity instead of allocating hundreds of short-lived
        // objects during every long-calibre reload.
        const ev = ent._reloadEvent || (ent._reloadEvent = {
          t: 0, total: 0, progress: 0, kind: 'ready', caliberMm: 0,
          magazineRounds: 0, magazineCapacity: 0, done: false,
        });
        const shell = ent.spec.gun.shells[c.shellSlot] || ent.spec.gun.shells[0];
        ev.t = reload.t;
        ev.total = reload.totalS;
        ev.progress = reload.totalS > 0
          ? Math.max(0, Math.min(1, 1 - reload.t / reload.totalS)) : 1;
        // tickReload changes kind to "ready" on the terminal edge. Preserve
        // the cycle that actually completed so presentation can distinguish
        // a shell load, an autoloader index, and a magazine replenishment.
        ev.kind = reloadKind;
        ev.caliberMm = (shell && shell.caliberMm) || ent.spec.gun.caliberMm || 100;
        ev.magazineRounds = c.magazine ? c.magazine.rounds : 0;
        ev.magazineCapacity = c.magazine ? c.magazine.capacity : 0;
        ev.done = wasReloading > 0 && done;
        bus.emit('player:reload', ev);
      }
    }
    tryFire(game, ent, bus, rig);
  }

  // KILL-CAM CAPTURE (ADDITIVE — src/game/killcam.js): record trajectory
  // points for every live shell (new shells contribute their muzzle position;
  // the impact point is appended at capture time from the HitEvent).
  if (game.killcam) game.killcam.recordSimStep(game);

  // d. shells
  stepShells(game, bus, world);

  // e. fire ticks every 0.5 s + module auto-repair
  game.fireTickAcc += dt;
  if (game.fireTickAcc >= FIRE_TICK_S) {
    game.fireTickAcc -= FIRE_TICK_S;
    for (const ent of game.tanks) {
      const c = ent.combat;
      if (ent.modeActive === false || !c || c.destroyed || !c.fire.burning) continue;
      const r = tickFire(ent, game.combatRng);
      if (r.extinguished) bus.emit('tank:fire', { id: ent.id, burning: false });
      if (r.destroyed && !ent._destroyedAnnounced) {
        announceDestroyed(game, bus, ent, ent.id, 'fire');
      }
    }
  }
  tickRepairs(game, bus, dt);

  const modeOutcome = game.matchModeController?.step(dt, game.timeS) || null;
  if (game.matchModeState && game.player?.combat) {
    game.matchModeState.playerAmmo = game.player.combat.modeAmmo ?? null;
    game.matchModeState.playerAmmoCapacity = game.player.combat.modeAmmoCapacity ?? null;
  }
  for (const event of game.modeEvents) {
    bus.emit(event.type.replace(/^mode_/, 'mode:'), event.payload);
  }
  game.modeEvents.length = 0;

  // win/lose (plus draw when the 15:00 battle clock runs out).
  // killcam_shotinfo r1: the player's death no longer hard-ends the battle —
  // WoT-style, the team fights on (main.ts plays the death replay at the
  // moment of death and drops into the wreck-orbit spectate cam). DEFEAT is
  // a TEAM verdict: player dead AND no allies left standing.
  if (game.result === null && game.player) {
    let enemiesLeft = 0;
    let alliesLeft = 0;
    for (const ent of game.tanks) {
      if (!ent.combat || ent.combat.destroyed) continue;
      // SYMMETRIC TEAMS: only ENEMY-team survivors block victory (allied
      // survivors are the point of having allies).
      if (ent.team === 'enemy') enemiesLeft++;
      else if (!game.player || ent.id !== game.player.id) alliesLeft++;
    }
    if (modeOutcome) {
      game.result = modeOutcome.result === 'draw' ? 'draw'
        : modeOutcome.result === 'alpha' ? 'victory' : 'defeat';
      game.resultReason = modeOutcome.reason;
    } else if (!game.matchModeController || game.matchModeController.usesElimination) {
      if (enemiesLeft === 0) {
        game.result = 'victory';
        game.resultReason = 'elimination';
      } else if (game.player.combat.destroyed && alliesLeft === 0) {
        game.result = 'defeat';
        game.resultReason = 'elimination';
      } else if (game.timeS >= BATTLE_TIME_LIMIT_S) {
        game.result = 'draw';
        game.resultReason = 'time_limit';
      }
    } else if (game.gameMode !== 'endless_horde' && game.timeS >= BATTLE_TIME_LIMIT_S) {
      const score = game.matchModeController.state.score;
      game.result = score.alpha === score.bravo ? 'draw'
        : score.alpha > score.bravo ? 'victory' : 'defeat';
      game.resultReason = 'time_limit';
    }
    // SHOT-INFO ENRICHMENT (additive): announce the decision once so results
    // UIs (src/ui/shotInfo.js session stats) can render without polling.
    if (game.result !== null) {
      bus.emit('battle:ended', {
        result: game.result, reason: game.resultReason, timeS: game.timeS,
        map: game.mapId, // SHOT-INFO ENRICHMENT (r3): report header map name
        // SHOT-INFO ENRICHMENT (additive): full team roster for the report
        roster: game.tanks.map((t) => ({
          id: t.id, specId: t.specId,
          vehicle: t.spec ? t.spec.name : t.specId,
          team: t.team,                                  // 'player' | 'enemy'
          alive: !(t.combat && t.combat.destroyed),
          isPlayer: !!(game.player && t.id === game.player.id),
        })),
      });
    }
  }
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
