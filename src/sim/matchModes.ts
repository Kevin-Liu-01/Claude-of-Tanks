/**
 * Deterministic objective-mode rules shared by browser-hosted, dedicated, and
 * local battles. This module owns no DOM, rendering, transport, or wall clock.
 * All positions are meters and every timer advances from the caller's fixed
 * simulation step.
 */
import {
  replenishAmmunition,
  totalAmmunition,
  totalAmmunitionCapacity,
} from './ammunition.ts';
import { createGunshipEscort, ESCORT_RULES, type EscortState } from './gunshipEscort.ts';
import { applyJuggernautScale } from './juggernautScale.ts';
import type { MatchPlacement } from './matchPlacement.ts';
import { ASSAULT_LINE_FRACTIONS } from './assaultLines.ts';
import { MATCH_MODE_ARENA_HALF_EXTENT_M as WORLD_MARGIN_M } from './matchObjectiveLayouts.ts';
import {
  FLAG_CARRIER_SPEED_SCALE, HUNT_RULES, RULESET_SCORE_TARGETS, matchRulesetFor, type MatchRuleset,
  assaultWaveHealthScale, cacheHealChance, hordeMaxAlive, hordeWaveHealthScale, hordeWaveSpecial, hordeWaveSpeedScale,
  hordeTrickleS, hordeWaveTotal, MARS_DEFAULT_RULES, GUN_GAME_WEAPONS, type ArrivalRules, type RulesetPhysics,
} from './matchRuleset.ts';

/** The aerial unit's presentation view: what the mode state, the HUD, the cameras and the renderer read of a drone or
 * gunship in flight. Declared here, not in aerialCombat.ts, so the mode rules name it without importing the flight
 * model, whose launch seats read the vehicle auxiliary inventory and weapons (missionAttachment.ts): the rooms Worker
 * reaches these rules through matchRuleset's types and keeps src/vehicles out of its program (roomWorkerProgram.selftest).
 * aerialCombat.ts re-exports it for every other reader. */
export interface AerialView {
  kind: 'drone' | 'gunship'; active: boolean; launching: boolean;
  x: number; y: number; z: number; yaw: number; pitch: number;
  batteryS: number; cooldownS: number;
  /** A drone in flight: seconds until a recall is accepted (0 once the pilot is in its feed; sim/droneRecall.ts). */
  recallS?: number;
  /** A recalled drone: seconds until it is parked on its dock after flying home and landing (0 otherwise). */
  returnS?: number;
}

export const GAME_MODE_IDS = Object.freeze([
  'standard',
  'capture_the_flag',
  'zone_control',
  'turbo_ball',
  'endless_horde',
  'frontline_assault',
  'mars',
  'juggernaut',
  'infected',
  'realistic',
  'gun_game',
  'drone',
  'ac130',
] as const);

export type GameModeId = typeof GAME_MODE_IDS[number];
export type ObjectiveTeam = 'alpha' | 'bravo';

interface GameModeDefinition {
  id: GameModeId;
  label: string;
  shortLabel: string;
  description: string;
  icon: string;
  respawns: boolean;
}

export const GAME_MODE_DEFINITIONS: Readonly<Record<GameModeId, GameModeDefinition>> =
  Object.freeze({
    standard: Object.freeze({
      id: 'standard', label: 'Standard Battle', shortLabel: 'STANDARD', icon: 'modeStandard',
      description: 'Destroy the opposing team before time expires.', respawns: false,
    }),
    capture_the_flag: Object.freeze({
      id: 'capture_the_flag', label: 'Capture the Flag', shortLabel: 'CTF', icon: 'modeFlag',
      description: `Steal the enemy flag and return it home. First to ${RULESET_SCORE_TARGETS.capture_the_flag} captures wins.`,
      respawns: true,
    }),
    zone_control: Object.freeze({
      id: 'zone_control', label: 'Zone Control', shortLabel: String(RULESET_SCORE_TARGETS.zone_control), icon: 'modeZones',
      description: `Capture and hold three sectors. First team to ${RULESET_SCORE_TARGETS.zone_control} points wins.`,
      respawns: true,
    }),
    turbo_ball: Object.freeze({
      id: 'turbo_ball', label: 'Turbo Ball', shortLabel: 'TURBO', icon: 'modeTurbo',
      description: 'Super-fast armed tanks drive or shoot the ball into the enemy goal.',
      respawns: true,
    }),
    endless_horde: Object.freeze({
      id: 'endless_horde', label: 'Endless Horde', shortLabel: 'HORDE', icon: 'modeHorde',
      description: 'Survive escalating waves and hunt floating repair or ammunition caches.',
      respawns: false,
    }),
    // campaign slice 1 (2026-09-12): the front comes to the battlefield. Three
    // trench sectors along the axis to the enemy; each one taken brings the
    // next counter-attack wave and pushes the frontline atmosphere closer.
    frontline_assault: Object.freeze({
      id: 'frontline_assault', label: 'Frontline Assault', shortLabel: 'FRONT', icon: 'modeZones',
      description: 'Break the enemy line: take three trench sectors in turn against escalating counter-attacks, then hold the last one.',
      respawns: false,
    }),
    // Mars mode (owner 2026-09-18: "add mars map mode (called mars mode) ... give it a bunch of boosts and
    // settings"): Olympus Basin's zone objective under its own physics, with boost caches for the humans.
    mars: Object.freeze({
      id: 'mars', label: 'Gravity Mode', shortLabel: 'GRAV', icon: 'modeMars',
      description: `Olympus Basin under a galaxy sky: low gravity, long jumps, respawns and boost caches. Hold the station sectors — first team to ${RULESET_SCORE_TARGETS.mars} points wins.`,
      respawns: true,
    }),
    juggernaut: Object.freeze({ id: 'juggernaut', label: 'Juggernaut', shortLabel: 'BOSS', icon: 'modeJuggernaut',
      description: 'Become the armored boss or join the hunters. Destroy the juggernaut before time runs out.', respawns: true }),
    infected: Object.freeze({ id: 'infected', label: 'Infected', shortLabel: 'INFECT', icon: 'modeInfected',
      description: 'Survive the outbreak. Destroyed survivors return on the infected side.', respawns: true }),
    realistic: Object.freeze({ id: 'realistic', label: 'Realistic', shortLabel: 'REAL', icon: 'modeRealistic',
      // the ruleset plays normal spotting (alwaysVisible: false); 2026-10-13 the copy had said every tank stays visible
      description: 'Normal spotting. Disable modules, eliminate the crew or detonate ammunition; there is no hull-health victory.', respawns: false }),
    gun_game: Object.freeze({ id: 'gun_game', label: 'Gun Game', shortLabel: 'GUNS', icon: 'modeGunGame',
      description: 'Earn confirmed kills to advance through five weapons. Complete the final weapon to win.', respawns: true }),
    drone: Object.freeze({ id: 'drone', label: 'Drone', shortLabel: 'FPV', icon: 'modeDrone',
      description: 'Fight in your tank, launch an FPV attack drone, then pilot it into an enemy. Your parked tank stays vulnerable.', respawns: true }),
    ac130: Object.freeze({ id: 'ac130', label: 'AC-130', shortLabel: 'AC-130', icon: 'modeAc130',
      description: 'Protect vulnerable ground troops as they reach extraction. Save at least half using your autocannon, 152 mm howitzer and missiles.', respawns: false }),
  });

const MODE_SET = new Set<string>(GAME_MODE_IDS);
// Score targets, respawn delays, mode speed / gravity, the flag-carrier penalty, the Horde wave
// repair and the Frontline Assault escalation are rules — they live in matchRuleset.ts so the sim,
// the authority, the HUD and the rule cards read one source. The constants below are geometry.
const FLAG_RADIUS_M = 8;
const FLAG_CAPTURE_RADIUS_M = 12;
const FLAG_RETURN_S = 18;
const ZONE_RADIUS_M = 30;
const ZONE_CAPTURE_S = 8;
/** An owned point's incursion alert repeats at most this often (a tank idling on the rim is one alert, not a stream). */
const ZONE_CONTEST_REPEAT_S = 20;
const ZONE_POINTS_PER_SECOND = 2;
export const ZONE_DESTRUCTION_POINTS = 25;
const BALL_RADIUS_M = 2.2;
// Frontline regroup (bots lane, 2026-10-03; Redrock Divide and Desert, 24 seeds each): the last sector decides the
// frontline. When the attack takes the second-to-last sector, its bots hold that sector until every living bot stands
// within the ruleset's regroupRadiusM of it, for at most regroupMaxS (25 s since gameplay-modes-228; 60 s before), then
// attack the last one together. A human of the attacking side within regroupHumanM of the last sector ends the wait.
const BALL_GOAL_RADIUS_M = 18;
const BALL_LINEAR_DRAG = 0.992;
/** The ball's horizontal coasting time constant: BALL_LINEAR_DRAG per 60 Hz step (2.08 s). */
const BALL_DRAG_TAU_S = -1 / (60 * Math.log(BALL_LINEAR_DRAG));
const BALL_GRAVITY_MPS2 = 9.81;
const PICKUP_RADIUS_M = 7;
/** The Turbo Ball kick-off line-up (ball.kickoffM) and the CTF revive slot (flagPitch.respawnBackM): a team's hulls this far apart across the axis. */
const KICKOFF_SPACING_M = 14;
/** The team's sightings are refreshed this often (the honest hunt and search read them; a once-a-second rule). */
// Mars mode boost caches: the first drop and the interval between drops (seconds).

interface Vec3Like { x: number; y: number; z: number }
interface ObjectivePoint { x: number; z: number }
type MatchModeEventValue = string | number | boolean | null |
  MatchModeEventValue[] | { [key: string]: MatchModeEventValue };
type MatchModeEventPayload = Record<string, MatchModeEventValue>;

export interface MatchModeEntity {
  id: string;
  team: string;
  bot?: boolean;
  spec?: {dims:{widthM:number;heightM:number;hullLengthM:number};armor:{boundingRadiusM?:number};role?:string;topSpeedKmh?:number};
  state: { pos: Vec3Like; yaw: number; speed: number; modeScale?:number };
  combat: {
    hp: number;
    maxHp: number;
    destroyed: boolean;
    ammo: number[];
    ammoCapacity: number[];
    equipMults?: Partial<Record<string, number>>;
  };
  input?: {aimPoint?:Vec3Like};
  aerial?: AerialView;
  modeActive?: boolean;
  modeSpeedMultiplier?: number;
  /** The destination both builders' mode route push last sent this bot; a revive clears it (the next push lands). */
  _modeTargetX?: number;
  _modeTargetZ?: number;
  /** Ruleset gravity scale (matchRuleset.ts) the movement and ballistics read. */
  modeGravityScale?: number;
  /** Ruleset jump launch, recoil launch and impact-knock scales (matchRuleset.ts) the sims read. */
  modeJumpMps?: number | null;
  modeRecoilLaunchScale?: number;
  modeShellKnockScale?: number;
  /** Ruleset impact physics block (matchRuleset.ts) the movement reads for the landing rebound. */
  modePhysics?: RulesetPhysics | null;
}

export interface MatchModeSpawn {
  x: number;
  z: number;
  yaw: number;
}

interface MatchModeHooks<Entity extends MatchModeEntity> {
  revive(entity: Entity, spawn: MatchModeSpawn, healthScale: number): void;
  setActive?(entity: Entity, active: boolean): void;
  setWeaponStage?(entity: Entity, stage: number): void;
  terrainHeight?(x: number, z: number): number;
  ballFloorHeight?(x: number, z: number, previousBottomY: number): number;
  emit?(type: string, payload: MatchModeEventPayload): void;
}

interface MatchModeControllerOptions<Entity extends MatchModeEntity>
  extends MatchModeHooks<Entity> {
  mode?: string;
  entities: Entity[];
  seed?: number;
  placement?: MatchPlacement;
  /** The rules this match plays by; derived from the mode when absent (campaign operations pass theirs). */
  ruleset?: MatchRuleset;
  /**
   * What a side has spotted (gameplay-modes-228): both builders hand their spotting system in, mapped to the mode's
   * sides. The hunt routes, and the bots' honest search reads, only on this — never on a hidden enemy's live position.
   * Absent (headless fixtures), every living enemy counts as spotted.
   */
  spotting?: { isSpotted(id: string, side: ObjectiveTeam): boolean };
}

export type BotMission = 'carrier' | 'recover' | 'escort' | 'raid' | 'defend' | 'striker' | 'screen' | 'capture' | 'assault'
  | 'hunt' | 'counter' | 'keeper';
interface BotDestination {
  x: number; z: number; mission?: BotMission;
  /** Turbo Ball: the ball (public), whether a shot at it may go toward the opponent goal now, and whether that shot comes
   *  before a tank target farther than the ball (BallBotRules.shootBall.overTanks). */
  ball?: { x: number; y: number; z: number } | null; shootBall?: boolean; ballFirst?: boolean;
}
/** A side's last sighting of an enemy, refreshed from the spotting hook (`id`: the enemy's, so a scan needs no entry). */
interface Sighting { id: string; x: number; z: number; atS: number }

interface TeamScore { alpha: number; bravo: number }

interface FlagState {
  team: ObjectiveTeam;
  baseX: number;
  baseY: number;
  baseZ: number;
  x: number;
  y: number;
  z: number;
  status: 'home' | 'carried' | 'dropped';
  carrierId: string | null;
  returnAtS: number | null;
}

interface ZoneState {
  id: string;
  x: number;
  y: number;
  z: number;
  control: number;
  owner: ObjectiveTeam | null;
  contested: boolean;
}

interface BallState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  lastTouchId: string | null;
}

interface GoalState {
  team: ObjectiveTeam;
  x: number;
  y: number;
  z: number;
}

/** tactical map 2026-09-15: a team's spawn centre, so the map and the world can mark it. */
interface SpawnMarkerState {
  team: ObjectiveTeam;
  x: number;
  y: number;
  z: number;
}

interface PickupState {
  id: string;
  kind: 'heal' | 'ammo';
  x: number;
  y: number;
  z: number;
  active: boolean;
  spawnedWave: number;
  airDrop?: boolean; groundY?:number;startY?:number; landAtS?:number; expiresAtS?:number;
}

export interface MatchModePresentationState {
  id: GameModeId;
  label: string;
  perspectiveTeam: ObjectiveTeam;
  respawns: boolean;
  target: number | null;
  score: TeamScore;
  flags: FlagState[];
  zones: ZoneState[];
  ball: BallState | null;
  goals: GoalState[];
  spawns: SpawnMarkerState[];
  horde: {
    wave: number;
    alive: number;
    /** The wave's total (every hostile it brings, the queued ones included). */
    total: number;
    nextWaveInS: number;
    healChance: number;
    /** Hostiles still to arrive this wave, and the ones the humans must still destroy (alive + queued). */
    queued?: number;
    remaining?: number;
    /** A special wave: 'runner' (faster, light hulls first) or 'swarm' (more, weaker). */
    special?: 'runner' | 'swarm' | null;
  } | null;
  /** frontline_assault: sectors taken so far, the sector count and the final hold countdown. */
  line: { index: number; total: number; holdS: number } | null;
  pickups: PickupState[];
  playerAmmo: number | null;
  playerAmmoCapacity: number | null;
  aerial?: AerialView;
  escort?: EscortState;
  support?: {ammoReadyInS:number;healReadyInS:number};
  factions?: { id: string; team: ObjectiveTeam }[];
  boss?: { id: string; team: ObjectiveTeam; hp: number; maxHp: number };
  infection?: { survivors: number; infected: number };
  weaponStages?: { id: string; index: number }[];
  weaponStage?: { index: number; total: number; kills: number; required: number; name: string };
}

/** Sealed host checkpoint; never publish this private respawn state to spectators. */
export interface ModeCheckpoint {
  elapsedS: number; score: TeamScore; weaponKills: [string, number][];
  teams: [string, ObjectiveTeam][]; respawns: [string, { atS: number; healthScale: number }][];
  destroyed: [string, boolean][]; scored: string[]; escortRescued?: string[]; support?:{ammoAt:number;healAt:number;sequence:number;pickups:PickupState[]};
  /** The wave modes' own state (round 2, the critic's E12: a migrated host restarted Endless Horde at wave 1 and Frontline
   *  at its first sector, every hostile revived). Mode time throughout (the elapsedS base). */
  waves?: WaveCheckpoint;
}
/** Endless Horde's wave and queue, Frontline's line, counter-attack and trickle, and which pool identities rest. */
interface WaveCheckpoint {
  wave: number; inactive: string[]; restedAt: [string, number][]; lastWaveIds: string[];
  horde?: { queued: number; special: 'runner' | 'swarm' | null; healthScale: number; nextWaveAtS: number | null;
    nextTrickleAtS: number; spawnSector: number; stalledAtS: number | null; stranded?: number; benched?: [string, number][]; strikes?: number[]; pickups: PickupState[]; sequence: number };
  line?: { index: number; holdUntilS: number | null; regroup: { x: number; z: number; untilS: number; checkedS: number } | null;
    counter: { x: number; z: number; atS: number; untilS: number; ids: string[]; line: number } | null; fresh: string[];
    nextReinforceAtS: number | null; allyDownAt: [string, number][];
    zones: { id: string; control: number; owner: ObjectiveTeam | null; contested: boolean }[] };
}

export interface MatchModeResult {
  result: ObjectiveTeam | 'draw';
  reason: string;
}

export interface MatchModeController<
  Entity extends MatchModeEntity = MatchModeEntity,
> {
  readonly id: GameModeId;
  readonly definition: GameModeDefinition;
  /** The rules this match plays by (sim/matchRuleset.ts). */
  readonly ruleset: MatchRuleset;
  readonly state: MatchModePresentationState;
  readonly usesElimination: boolean;
  /** Confirmed enemy destruction; ignored for goals/captures and duplicate receipts. */
  recordDestruction(victimId: string, killerId: string | null): void;
  step(dt: number, timeS: number): MatchModeResult | null;
  requestSupply(entityId:string,kind:'ammo'|'heal',timeS:number):boolean;
  tryHitBall(shell: { dead?: boolean; prevPos: Vec3Like; pos: Vec3Like; vel: Vec3Like;
    shooterId?: string }): boolean;
  botTarget(entity: Entity): { x: number; z: number } | null;
  /** The objective the bot's targets are ranked against: the same point with its capture reach. */
  botObjective(entity: Entity): { x: number; z: number; radiusM: number; mission?: BotMission;
    ball?: { x: number; y: number; z: number } | null; shootBall?: boolean; ballFirst?: boolean } | null;
  /** The bot's side's freshest sighting of an enemy within HUNT_RULES.lastSeenMaxS (the honest search), or null. */
  freshestSighting(entity: Entity): { x: number; z: number } | null;
  /** The enemy side's public deployment centre (the honest search's last resort). */
  enemyDeployment(entity: Entity): { x: number; z: number } | null;
  serialize(viewerId?: string | null): MatchModePresentationState;
  captureCheckpoint(elapsedS: number): ModeCheckpoint;
  restoreCheckpoint(checkpoint: ModeCheckpoint): void;
}

export function normalizeGameMode<Value>(value: Value): GameModeId {
  const id = String(value || 'standard');
  return MODE_SET.has(id) ? id as GameModeId : 'standard';
}

function teamOf(entity: MatchModeEntity): ObjectiveTeam {
  return entity.team === 'bravo' || entity.team === 'enemy' ? 'bravo' : 'alpha';
}

function otherTeam(team: ObjectiveTeam): ObjectiveTeam {
  return team === 'alpha' ? 'bravo' : 'alpha';
}

function scoreTargetForMode(mode: GameModeId): number | null {
  return RULESET_SCORE_TARGETS[mode] ?? null;
}

function squaredDistance(entity: MatchModeEntity, x: number, z: number): number {
  const dx = entity.state.pos.x - x;
  const dz = entity.state.pos.z - z;
  return dx * dx + dz * dz;
}

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value |= 0;
    value = value + 0x6D2B79F5 | 0;
    let out = Math.imul(value ^ value >>> 15, 1 | value);
    out = out + Math.imul(out ^ out >>> 7, 61 | out) ^ out;
    return ((out ^ out >>> 14) >>> 0) / 4294967296;
  };
}

function pointSegmentDistanceSq(point: Vec3Like, a: Vec3Like, b: Vec3Like): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const apx = point.x - a.x;
  const apy = point.y - a.y;
  const apz = point.z - a.z;
  const denom = abx * abx + aby * aby + abz * abz;
  const t = denom > 1e-9
    ? Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / denom)) : 0;
  const dx = point.x - (a.x + abx * t);
  const dy = point.y - (a.y + aby * t);
  const dz = point.z - (a.z + abz * t);
  return dx * dx + dy * dy + dz * dz;
}

/** Create one fixed-step objective controller without changing standard combat. */
export function createMatchModeController<Entity extends MatchModeEntity>({
  mode = 'standard', entities, seed = 6000, revive, setActive = () => {},
  terrainHeight = () => 0, ballFloorHeight = terrainHeight, emit = () => {},
  placement, setWeaponStage = () => {},
  ruleset: rulesetOption, spotting,
}: MatchModeControllerOptions<Entity>): MatchModeController<Entity> {
  if (!Array.isArray(entities) || entities.length < 1 || typeof revive !== 'function') {
    throw new TypeError('match mode controller requires entities and a revive hook');
  }
  const id = normalizeGameMode(mode);
  // Mars mode plays the zone-control objective (three station sectors) on its own physics
  const objective = id === 'mars' ? 'zone_control' : id;
  const definition = GAME_MODE_DEFINITIONS[id];
  const ruleset: MatchRuleset = rulesetOption && rulesetOption.mode === id ? rulesetOption : matchRulesetFor(id);
  const baseSpeed = ruleset.speedMultiplier;
  // the wave law: the Horde's own, and Frontline's wave pressure reads the Horde's speed ramp
  const hordeRules = ruleset.horde ?? matchRulesetFor('endless_horde').horde!;
  const infectionStamped=new WeakSet<object>();
  // a wave mode's hostiles reload slower (the Horde's or Frontline's hostileReloadScale), stamped once per combat state
  // like the infection's
  const hostileReloadScale = ruleset.horde?.hostileReloadScale ?? ruleset.assault?.hostileReloadScale ?? 1;
  const stampHostile=(entity:Entity):void=>{
    if(hostileReloadScale===1||teamOf(entity)!=='bravo'||!entity.bot||infectionStamped.has(entity.combat))return;
    infectionStamped.add(entity.combat);
    const mults=entity.combat.equipMults|| (entity.combat.equipMults={});mults.reload=(mults.reload??1)*hostileReloadScale;
  };
  const stampInfection=(entity:Entity):void=>{
    stampHostile(entity);
    const infection=ruleset.infection;if(!infection||infectionStamped.has(entity.combat))return;
    infectionStamped.add(entity.combat);
    const infected=teamOf(entity)==='bravo';
    const scale=infected?infection.infectedHpScale:infection.survivorHpScale;
    entity.combat.maxHp=Math.max(1,Math.round(entity.combat.maxHp*scale));entity.combat.hp=entity.combat.maxHp;
    if(infected){const mults=entity.combat.equipMults|| (entity.combat.equipMults={});mults.reload=(mults.reload??1)*infection.infectedReloadScale;}
  };

  const scoreTarget = ruleset.scoreTarget ?? scoreTargetForMode(id) ?? Infinity;
  // Physics the ruleset bends: the movement reads modeSpeedMultiplier / modeGravityScale every step,
  // ballistics reads the gravity scale at the muzzle; stamped at start, at every revive, and when a
  // flag changes hands.
  const stampPhysics = (entity: Entity, speed = baseSpeed): void => {
    entity.modeSpeedMultiplier = speed * (ruleset.infection && teamOf(entity) === 'bravo' ? ruleset.infection.infectedSpeed : 1)
      * (id === 'ac130' && entity.bot && teamOf(entity) === 'alpha' ? ESCORT_RULES.speedScale : 1)
      * (ruleset.juggernaut && teamOf(entity) === ruleset.juggernaut.team ? ruleset.juggernaut.speedScale : 1);
    entity.modeGravityScale = ruleset.gravityScale;
    entity.modeJumpMps = ruleset.jumpMps;
    entity.modeRecoilLaunchScale = ruleset.recoilLaunchScale;
    entity.modeShellKnockScale = ruleset.shellKnockScale;
    entity.modePhysics = ruleset.physics;
  };
  const rng = seededRandom(seed ^ 0x4d4f4445);
  const spawns = new Map<string, MatchModeSpawn>();
  const entityById = new Map<string, Entity>();
  const destroyed = new Map<string, boolean>();
  const scoredDeaths = new Set<string>();
  const respawnAt = new Map<string, { atS: number; healthScale: number }>();
  const teams: Record<ObjectiveTeam, Entity[]> = { alpha: [], bravo: [] };
  const centers: Record<ObjectiveTeam, MatchModeSpawn> = {
    alpha: { x: 0, z: -180, yaw: 0 }, bravo: { x: 0, z: 180, yaw: Math.PI },
  };
  for (const entity of entities) {
    const team = teamOf(entity);
    teams[team].push(entity);
    entityById.set(entity.id, entity);
    spawns.set(entity.id, {
      x: entity.state.pos.x, z: entity.state.pos.z, yaw: entity.state.yaw,
    });
    destroyed.set(entity.id, !!entity.combat.destroyed);
    entity.modeActive = true;
    stampPhysics(entity);stampInfection(entity);
  }
  for (const team of ['alpha', 'bravo'] as const) {
    if (!teams[team].length) continue;
    let x = 0;
    let z = 0;
    let yawX = 0;
    let yawZ = 0;
    for (const entity of teams[team]) {
      const spawn = spawns.get(entity.id)!;
      x += spawn.x;
      z += spawn.z;
      yawX += Math.sin(spawn.yaw);
      yawZ += Math.cos(spawn.yaw);
    }
    centers[team] = {
      x: x / teams[team].length,
      z: z / teams[team].length,
      yaw: Math.atan2(yawX, yawZ),
    };
  }
  if (placement) {
    centers.alpha = placement.centers.alpha;
    centers.bravo = placement.centers.bravo;
  }
  const midX = placement?.middle.x ?? (centers.alpha.x + centers.bravo.x) * 0.5;
  const midZ = placement?.middle.z ?? (centers.alpha.z + centers.bravo.z) * 0.5;
  let axisX = centers.bravo.x - centers.alpha.x;
  let axisZ = centers.bravo.z - centers.alpha.z;
  const axisLength = Math.hypot(axisX, axisZ) || 1;
  axisX /= axisLength;
  axisZ /= axisLength;
  const lateralX = axisZ;
  const lateralZ = -axisX;
  const score: TeamScore = { alpha: 0, bravo: 0 };
  const weaponKills = new Map<string, number>();
  const boss = ruleset.juggernaut ? teams[ruleset.juggernaut.team][0] : null;
  if (boss && ruleset.juggernaut) {
    applyJuggernautScale(boss);
    boss.combat.maxHp = Math.round(boss.combat.maxHp * ruleset.juggernaut.hpScale);
    boss.combat.hp = boss.combat.maxHp;
    const mults = boss.combat.equipMults || (boss.combat.equipMults = {});
    mults.reload = (mults.reload ?? 1) * ruleset.juggernaut.reloadScale;
  }
  if (ruleset.gunGame) for (const entity of entities) setWeaponStage(entity, 0);
  // a point on the axis through the middle, half of `axisM` toward the team's side (the Turbo Ball goals, the CTF flag
  // bases); null, or a span at least the deployment centres' own, is the team's deployment centre. With a placement the
  // point is its reserved objective (matchPlacement objectives: the same span, moved onto ground the objective search
  // proves dry, level, clear and reachable; round 3, the critic's E-R2-1: bare axis points stood in water or in houses)
  const axisPoint = (team: ObjectiveTeam, axisM: number | null): { x: number; z: number } => (axisM == null || axisM >= axisLength
    ? centers[team] : placement?.objectives ? placement.objectives[team] : {
      x: midX + axisX * (team === 'alpha' ? -0.5 : 0.5) * axisM,
      z: midZ + axisZ * (team === 'alpha' ? -0.5 : 0.5) * axisM,
    });
  // the flag bases (the ruleset's flagPitch.baseAxisM; round 2): in front of each spawn, not on it
  const flagBases = id === 'capture_the_flag'
    ? { alpha: axisPoint('alpha', ruleset.flagPitch?.baseAxisM ?? null), bravo: axisPoint('bravo', ruleset.flagPitch?.baseAxisM ?? null) }
    : null;
  const flags: FlagState[] = flagBases
    ? (['alpha', 'bravo'] as const).map((team) => ({
      team,
      baseX: flagBases[team].x,
      baseY: terrainHeight(flagBases[team].x, flagBases[team].z) + 0.08,
      baseZ: flagBases[team].z,
      x: flagBases[team].x,
      y: terrainHeight(flagBases[team].x, flagBases[team].z) + 2.5,
      z: flagBases[team].z,
      status: 'home',
      carrierId: null,
      returnAtS: null,
    })) : [];
  const flagHome: Readonly<Record<ObjectiveTeam, { x: number; z: number }>> = flagBases ?? centers;
  const zones: ZoneState[] = objective === 'zone_control'
    ? [-105, 0, 105].map((offset, index) => {
      const x = placement?.zones[index]?.x ?? midX + lateralX * offset;
      const z = placement?.zones[index]?.z ?? midZ + lateralZ * offset;
      return {
        id: `zone-${index + 1}`,
        x, y: terrainHeight(x, z) + 0.12, z,
        control: 0, owner: null, contested: false,
      };
    }) : id === 'frontline_assault'
      ? ASSAULT_LINE_FRACTIONS.map((fraction, index) => {
        // Frontline Assault 2026-09-13: when the world was built with real
        // trenches, the sectors sit exactly on the carved lines.
        const carved = placement?.assaultLines?.[index] ?? null;
        const x = carved ? carved.x : centers.alpha.x + axisX * axisLength * fraction;
        const z = carved ? carved.z : centers.alpha.z + axisZ * axisLength * fraction;
        return {
          id: `line-${index + 1}`,
          x, y: terrainHeight(x, z) + 0.12, z,
          control: 0, owner: null, contested: false,
        };
      }) : [];
  const escortPoint=placement?.zones[1] ?? {x:midX,z:midZ};
  const escort=id==='ac130'?createGunshipEscort(entities,{...escortPoint,y:terrainHeight(escortPoint.x,escortPoint.z)+.12},setActive):null;
  if(escort)zones.push({id:'extraction',x:escortPoint.x,y:escort.state.y,z:escortPoint.z,control:1,owner:'alpha',contested:false});
  const ball: BallState | null = id === 'turbo_ball' ? {
    x: midX, y: ballFloorHeight(midX, midZ, Infinity) + BALL_RADIUS_M, z: midZ,
    vx: 0, vy: 0, vz: 0, lastTouchId: null,
  } : null;
  // the goals: the deployment centres, or (the ruleset's ball.goalAxisM; gameplay-modes-228) the middle ± half of it
  // along the axis — the ball's best approach to the deployment centres 794 m apart was 196 m
  const goalAxisM = ball ? ruleset.ball?.goalAxisM ?? null : null;
  const goalAt = (team: ObjectiveTeam): { x: number; z: number } => axisPoint(team, goalAxisM);
  const goals: GoalState[] = id === 'turbo_ball'
    ? (['alpha', 'bravo'] as const).map((team) => {
      const at = goalAt(team);
      return { team, x: at.x, y: terrainHeight(at.x, at.z) + 0.2, z: at.z };
    }) : [];
  // the Turbo Ball's kick-off line-up (ball.kickoffM; round 3, the critic's M6: every goal sent the bots back to their
  // deployments 300-440 m from the kick-off, and the ball lay still with no bot near it while they drove back): each
  // side `backM` off the spot toward its own goal, spread across the axis, facing the middle
  const kickoffSpot = (entity: Entity, backM: number): MatchModeSpawn | null => {
    const team = teamOf(entity), own = goals.find((goal) => goal.team === team);
    if (!own) return null;
    const ox = own.x - midX, oz = own.z - midZ, olen = Math.hypot(ox, oz) || 1, ux = ox / olen, uz = oz / olen;
    const members = teams[team], k = Math.max(0, members.indexOf(entity)), n = members.length;
    const across = (k - (n - 1) / 2) * KICKOFF_SPACING_M;
    return { x: midX + ux * backM + uz * across, z: midZ + uz * backM - ux * across, yaw: Math.atan2(-ux, -uz) };
  };
  // Capture the Flag's revive slot (flagPitch.respawnBackM; round 3, the critic's M5: a revive at the deployment stood
  // 200 m behind its own flag base, so a third of each squad spent its life driving back to the play and the carrier's
  // pursuers and escorts were rarely near it): `backM` behind the team's own flag base, spread across the axis, facing
  // the middle
  const flagRespawnBackM = flagBases ? ruleset.flagPitch?.respawnBackM ?? null : null;
  const flagRespawnSpot = (entity: Entity, backM: number): MatchModeSpawn | null => {
    if (!flagBases) return null;
    const team = teamOf(entity), base = flagBases[team];
    const ox = base.x - midX, oz = base.z - midZ, olen = Math.hypot(ox, oz) || 1, ux = ox / olen, uz = oz / olen;
    const members = teams[team], k = Math.max(0, members.indexOf(entity)), n = members.length;
    const across = (k - (n - 1) / 2) * KICKOFF_SPACING_M;
    return { x: base.x + ux * backM + uz * across, z: base.z + uz * backM - ux * across, yaw: Math.atan2(-ux, -uz) };
  };
  // Turbo Ball's revive slot (ball.respawnBackM; round 3, the critic's M6: a revive at the deployment stood 150 m behind
  // its own goal, out of the play for half a minute): `backM` behind the team's own goal, spread across the axis
  const ballRespawnBackM = ruleset.ball?.respawnBackM ?? null;
  const ballRespawnSpot = (entity: Entity, backM: number): MatchModeSpawn | null => {
    const team = teamOf(entity), own = goals.find((goal) => goal.team === team);
    if (!own) return null;
    const ox = own.x - midX, oz = own.z - midZ, olen = Math.hypot(ox, oz) || 1, ux = ox / olen, uz = oz / olen;
    const members = teams[team], k = Math.max(0, members.indexOf(entity)), n = members.length;
    const across = (k - (n - 1) / 2) * KICKOFF_SPACING_M;
    return { x: own.x + ux * backM + uz * across, z: own.z + uz * backM - ux * across, yaw: Math.atan2(-ux, -uz) };
  };
  const pickups: PickupState[] = [];
  const hordeEnemies = teams.bravo.filter((entity) => !!entity.bot);
  // a horde with no hostile pool would clear empty waves forever (the v2 co-op rooms seated none): refuse it
  if (ruleset.horde && hordeEnemies.length === 0) {
    throw new TypeError('Endless Horde needs a hostile pool: seat the bravo bots (src/mp/room/roomBots.ts planRoomBots)');
  }
  let pickupSequence = 0;
  let result: MatchModeResult | null = null;
  let wave = 1;
  let nextWaveAtS: number | null = null;
  let lastBallTouchS = -Infinity;

  const state: MatchModePresentationState = {
    id,
    label: definition.label,
    perspectiveTeam: 'alpha',
    respawns: ruleset.respawnS != null,
    target: Number.isFinite(scoreTarget) ? scoreTarget : null,
    score,
    flags,
    zones,
    ball,
    goals,
    // tactical map 2026-09-15: the team spawn centres (Zone Control marks both, the co-op modes only the human side;
    // CTF and Turbo Ball mark their bases instead). Symmetric deployments (2026-10-08): the centroid of the side's
    // deployment slots in use, from the same placement call that seats its tanks (sim/deployment.ts).
    spawns: (['alpha', 'bravo'] as const).filter((team) => teams[team].length > 0).map((team) => {
      const at = placement ? placement.deploymentCenter(team, teams[team].length) : centers[team];
      return { team, x: at.x, y: terrainHeight(at.x, at.z) + 0.1, z: at.z };
    }),
    horde: id === 'endless_horde' || id === 'frontline_assault' ? {
      wave, alive: 0, total: 0, nextWaveInS: 0, healChance: 0,
    } : null,
    line: id === 'frontline_assault' ? { index: 0, total: ASSAULT_LINE_FRACTIONS.length, holdS: 0 } : null,
    pickups,
    playerAmmo: null,
    playerAmmoCapacity: null,
    ...(escort ? { escort:escort.state } : {}),
    ...(boss ? { boss: { id: boss.id, team: teamOf(boss), hp: boss.combat.hp, maxHp: boss.combat.maxHp } } : {}),
    ...(ruleset.infection ? { infection: { survivors: teams.alpha.length, infected: teams.bravo.length } } : {}),
  };

  const resetFlag = (flag: FlagState): void => {
    flag.x = flag.baseX;
    flag.z = flag.baseZ;
    flag.y = terrainHeight(flag.x, flag.z) + 2.5;
    flag.status = 'home';
    flag.carrierId = null;
    flag.returnAtS = null;
  };

  let placementTimeS = 0;
  // what each side has seen (the honest hunt's intel, refreshIntel below): declared before the first revive reads it
  const sightings: Record<ObjectiveTeam, Map<string, Sighting>> = { alpha: new Map(), bravo: new Map() };
  // where each hunter rose (its own position, the only lead a hull fresh from the director's ring has): the stale sweep's
  // centre (round 3, the critic's M1: a straggler re-arrived round the humans swept the fight they had left 500 m back)
  // and the arrival's orders (round 3, the critic's M1/M3): a director-placed hunter drives on along the facing the
  // director gave it — at the ring's centre as it stood at the arrival, never updated — to a seeded point HUNT_RULES.lead
  // gives or takes round it (lx, lz; NaN for a hull that rose anywhere else)
  const huntAnchor = new Map<string, { x: number; z: number; atS: number; lx: number; lz: number; swept: boolean }>();
  let arrivals = 0;
  const occupiedBy = (entity: Entity): { x: number; z: number; radius: number }[] =>
    entities.filter(other => other !== entity && !other.combat.destroyed && other.modeActive !== false)
      .map(other => ({ x: other.state.pos.x, z: other.state.pos.z, radius: 4.5 }));
  /** Revive at the entity's own spawn, or at `at` (a Horde arrival point, a Frontline line slot) when given. */
  const reviveAtSpawn = (entity: Entity, healthScale = 1, at: MatchModeSpawn | null = null): void => {
    // the infected rise round the survivors (infectionBots.arrival), a convert's first life included
    // (out of reach and sight first; else out of reach in sight — never the far base while survivors stand)
    // A converted HUMAN's ring is centred on what its side has spotted (its freshest sighting), never on the survivors'
    // live centroid: the client is sent its own pose, so a live-centred ring would hand it the hidden survivors' bearing
    // and range (round 2, E1); with no sighting it rises at its own spawn. A bot's ring is the director's decision.
    if (!at && infectionArrival && teamOf(entity) === 'bravo') {
      const around = entity.bot ? null : freshestFor('bravo', entity.state.pos.x, entity.state.pos.z);
      if (entity.bot || around) {
        at = arrivalPoint(entity, infectionArrival, false, around) ?? arrivalPoint(entity, infectionArrival, true, around);
      }
    }
    if (!at && flagRespawnBackM != null) at = flagRespawnSpot(entity, flagRespawnBackM);
    if (!at && ballRespawnBackM != null) at = ballRespawnSpot(entity, ballRespawnBackM);
    const spawn = at ?? spawns.get(entity.id);
    if (!spawn) return;
    const safeSpawn = placement ? placement.respawn(spawn, entity.id, occupiedBy(entity)) : spawn;
    if (!safeSpawn) {
      if (id === 'endless_horde' || id === 'frontline_assault') deactivate(entity);
      respawnAt.set(entity.id, { atS: placementTimeS + 1, healthScale });
      return; // keep pending, but never retry a bounded search at 60 Hz
    }
    // a revived bot takes the next route push whatever its last destination was (gameplay-modes-228; one place for
    // both builders since round 2)
    entity._modeTargetX = undefined;
    entity._modeTargetZ = undefined;
    revive(entity, safeSpawn, healthScale);
    restedAt.delete(entity.id);
    if (entity.bot && teamOf(entity) === 'bravo') {
      let anchor = huntAnchor.get(entity.id);
      if (!anchor) { anchor = { x: 0, z: 0, atS: 0, lx: NaN, lz: NaN, swept: false }; huntAnchor.set(entity.id, anchor); }
      anchor.x = safeSpawn.x; anchor.z = safeSpawn.z; anchor.atS = placementTimeS; anchor.lx = NaN; anchor.lz = NaN; anchor.swept = false;
      // a director arrival (the Horde's ring, the infected's ring) goes in along its facing, the ring's own distance on
      if (at && (ruleset.horde || infectionArrival)) {
        let cx = 0, cz = 0, n = 0;
        for (const human of teams.alpha) {
          if (human.modeActive === false || human.combat.destroyed) continue;
          cx += human.state.pos.x; cz += human.state.pos.z; n++;
        }
        if (n) {
          const lead = HUNT_RULES.lead, k = arrivals++;
          const u1 = (Math.imul(k + 1, 2654435761) >>> 0) / 4294967296, u2 = (Math.imul(k + 7, 2246822519) >>> 0) / 4294967296;
          const reach = Math.hypot(cx / n - safeSpawn.x, cz / n - safeSpawn.z) * (lead.reachMin + (lead.reachMax - lead.reachMin) * u1);
          const heading = at.yaw + (u2 - 0.5) * 2 * lead.spreadDeg * Math.PI / 180;
          anchor.lx = Math.max(-WORLD_MARGIN_M, Math.min(WORLD_MARGIN_M, safeSpawn.x + Math.sin(heading) * reach));
          anchor.lz = Math.max(-WORLD_MARGIN_M, Math.min(WORLD_MARGIN_M, safeSpawn.z + Math.cos(heading) * reach));
        }
      }
    }
    stampInfection(entity);
    if (ruleset.gunGame) setWeaponStage(entity, Math.min(GUN_GAME_WEAPONS.length - 1, Math.floor((weaponKills.get(entity.id) ?? 0) / ruleset.gunGame.killsPerWeapon)));
    entity.modeActive = true;
    // wave pressure: Horde / Frontline defenders drive faster every wave (the ruleset's capped ramp)
    stampPhysics(entity, (id === 'endless_horde' || id === 'frontline_assault') && teamOf(entity) === 'bravo'
      ? baseSpeed * hordeWaveSpeedScale(hordeRules, wave) : baseSpeed);
    destroyed.set(entity.id, false);
    scoredDeaths.delete(entity.id);
    respawnAt.delete(entity.id);
    setActive(entity, true);
    emit('mode_respawn', { id: entity.id, team: teamOf(entity) });
  };

  const deactivate = (entity: Entity): void => {
    entity.modeActive = false;
    entity.combat.destroyed = true;
    entity.state.speed = 0;
    destroyed.set(entity.id, true);
    if (!restedAt.has(entity.id)) restedAt.set(entity.id, placementTimeS);
    setActive(entity, false);
  };
  // when a pool identity last left the field (benched or destroyed): the Horde's trickle brings the longest-rested back
  const restedAt = new Map<string, number>();

  // owner 2026-09-15 ("only 3 tanks every time and the same tanks each round"): every wave draws
  // its hostiles afresh from the pool — a seeded shuffle that puts identities rested last wave
  // first — so consecutive waves share as few vehicles as the pool allows, and the wave grows by
  // the ruleset's law until the whole pool is on the field.
  let lastWaveIds = new Set<string>();
  const lightHull = (entity: Entity): boolean => entity.spec?.role === 'light' || entity.spec?.role === 'ifv';
  let runnerWave = false; // a Horde runner wave draws light hulls first
  const drawWave = (count: number): Set<Entity> => {
    const order = hordeEnemies.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    // stable: rested identities lead, the shuffled order decides within each band (a runner wave: light hulls first)
    order.sort((a, b) => (runnerWave ? Number(lightHull(b)) - Number(lightHull(a)) : 0)
      || Number(lastWaveIds.has(a.id)) - Number(lastWaveIds.has(b.id)));
    const active = new Set(order.slice(0, Math.min(count, order.length)));
    lastWaveIds = new Set([...active].map((entity) => entity.id));
    return active;
  };
  /** Frontline reinforcement: living defenders stay untouched; the shortfall arrives as a fresh draw (on the line). */
  const reinforceLine = (targetCount: number, healthScale: number): void => {
    const living = hordeEnemies.filter((enemy) => enemy.modeActive !== false && !enemy.combat.destroyed);
    const pool = hordeEnemies.filter((enemy) => !living.includes(enemy));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    // stable: identities that sat out the last wave lead; wrecks of this sector's fight arrive last
    pool.sort((a, b) => Number(lastWaveIds.has(a.id)) - Number(lastWaveIds.has(b.id)));
    const arrivals = pool.slice(0, Math.max(0, Math.min(pool.length, targetCount - living.length)));
    arrivals.forEach((enemy, slot) => reviveAtSpawn(enemy, healthScale, lineSlot(slot, arrivals.length, false)));
    lastWaveIds = new Set([...living, ...arrivals].map((entity) => entity.id));
    freshDefenders = arrivals.map((entity) => entity.id);
  };

  // ------------------------------------------------------------------- endless horde (gameplay-modes-228) ---
  // The wave law: a TOTAL per wave (hordeWaveTotal: the base law, the co-op scale) of which at most
  // hordeMaxAlive stand on the field at once; the rest queue and trickle back in, one rested pool identity every
  // trickleS, through the same revive (no new entities, no wire change). Humans are counted once, at the start: a co-op
  // room's seats (and the harness's measurement shims, which read as bots until the controller steps).
  const hordeHumans = Math.max(1, teams.alpha.filter((entity) => !entity.bot).length);
  const hordeAliveCap = hordeMaxAlive(hordeRules, hordeHumans, hordeEnemies.length);
  let hordeQueued = 0;
  let hordeSpecial: 'runner' | 'swarm' | null = null;
  let hordeHealthScale = 1;
  let nextTrickleAtS = 0;
  let spawnSector = 0;
  // the arrival points' own seeded stream (the wave draws and the caches keep theirs)
  const spawnRng = seededRandom((seed ^ 0x484f5244) >>> 0);
  const infectionArrival = ruleset.infection ? ruleset.infectionBots?.arrival ?? null : null;
  /** Whether a human-side hull at `from` sees the ground point (x, z) over the terrain (a height-field march). */
  const terrainSees = (from: Entity, x: number, z: number, rules: ArrivalRules): boolean => {
    const fx = from.state.pos.x, fz = from.state.pos.z, fy = from.state.pos.y + rules.sightEyeM;
    const ty = terrainHeight(x, z) + rules.sightHullM;
    const d = Math.hypot(x - fx, z - fz);
    for (let step = rules.sightStepM; step < d - rules.sightStepM * 0.5; step += rules.sightStepM) {
      const f = step / d;
      // conservative: a crest only hides the hull when it stands sightMarginM above the sight line
      if (terrainHeight(fx + (x - fx) * f, fz + (z - fz) * f) > fy + (ty - fy) * f + rules.sightMarginM) return false;
    }
    return true;
  };
  /**
   * A hostile's arrival point: on the ring round the living humans' centroid, in the sector due next (centred on the
   * bearing to the hostile base and ±sectorSpreadDeg), out of every human's reach and terrain sight; else null (the
   * hostile base). The arrival is a game-director decision of the authority: no bot reads it and no client is sent it.
   */
  /**
   * No living human within spawnMinHumanM of (x, z), nor (spawnOutOfSight, unless `ignoreSight`) seeing it over the
   * terrain — nor (sightLeadM) the point that far on toward (towardX, towardZ), the arrival's first stretch of approach.
   */
  const arrivalClear = (x: number, z: number, rules: ArrivalRules, ignoreSight = false,
    towardX = x, towardZ = z, leadScale = 1): boolean => {
    const minSq = rules.spawnMinHumanM ** 2, sightSq = rules.sightRangeM ** 2;
    let leadX = x, leadZ = z;
    // the hidden stretch is a stretch of TIME at the wave's pace (round 3: a quicker wave covered sightLeadM in under
    // 8 s and came over the crest in sight — first contact under 8 s on 6 of the critic's waves): `leadScale` is the
    // wave's speed scale
    const lead = (rules.sightLeadM ?? 0) * leadScale, run = Math.hypot(towardX - x, towardZ - z);
    if (lead > 0 && run > 1) { const f = Math.min(1, lead / run); leadX = x + (towardX - x) * f; leadZ = z + (towardZ - z) * f; }
    const checkLead = leadX !== x || leadZ !== z;
    for (const human of teams.alpha) {
      if (human.modeActive === false || human.combat.destroyed) continue;
      const dSq = squaredDistance(human, x, z);
      if (dSq < minSq) return false;
      if (ignoreSight || !rules.spawnOutOfSight) continue;
      if (dSq <= sightSq && terrainSees(human, x, z, rules)) return false;
      if (checkLead && squaredDistance(human, leadX, leadZ) <= sightSq && terrainSees(human, leadX, leadZ, rules)) return false;
    }
    return true;
  };
  const arrivalPoint = (entity: Entity, rules: ArrivalRules, ignoreSight = false,
    around: { x: number; z: number } | null = null, leadScale = 1): MatchModeSpawn | null => {
    let cx = 0, cz = 0, n = 0;
    if (around) { cx = around.x; cz = around.z; n = 1; } else {
      for (const human of teams.alpha) {
        if (human.modeActive === false || human.combat.destroyed) continue;
        cx += human.state.pos.x; cz += human.state.pos.z; n++;
      }
    }
    if (!n) return null;
    cx /= n; cz /= n;
    const base = Math.atan2(centers.bravo.x - cx, centers.bravo.z - cz);
    const sectors = Math.max(1, Math.floor(rules.spawnSectors));
    let [ringMin, ringMax] = rules.spawnRingM;
    // the ring pulled in to the hull's own reach at the wave's pace (spawnReachS; round 3): a slow hull arrives nearer,
    // and where no point of that nearer ring is clear the full ring is tried before the hostile base
    const topKmh = entity.spec?.topSpeedKmh;
    let passes = 1;
    if (rules.spawnReachS && topKmh) {
      const reach = topKmh / 3.6 * leadScale * rules.spawnReachS;
      if (reach < ringMax) {
        const f = reach / ringMax, floor = rules.spawnMinHumanM + 10;
        ringMin = Math.max(floor, ringMin * f);
        ringMax = Math.max(ringMin, ringMax * f);
        passes = 2;
      }
    }
    for (let pass = 0; pass < passes; pass++) {
      if (pass === 1) [ringMin, ringMax] = rules.spawnRingM;
      for (let c = 0; c < rules.spawnCandidates; c++) {
        const sector = (spawnSector + c) % sectors;
        const centre = sectors === 1 ? 0 : -rules.sectorSpreadDeg + sector * (2 * rules.sectorSpreadDeg / (sectors - 1));
        const angle = base + (centre + (spawnRng() - 0.5) * rules.sectorWidthDeg) * Math.PI / 180;
        const radius = ringMin + spawnRng() * (ringMax - ringMin);
        const x = Math.max(-WORLD_MARGIN_M, Math.min(WORLD_MARGIN_M, cx + Math.sin(angle) * radius));
        const z = Math.max(-WORLD_MARGIN_M, Math.min(WORLD_MARGIN_M, cz + Math.cos(angle) * radius));
        const yaw = Math.atan2(cx - x, cz - z);
        const point = placement ? placement.respawnNear({ x, z, yaw }, entity.id, occupiedBy(entity), rules.spawnRingM[0] * 0.15) : { x, z, yaw };
        if (!point || !arrivalClear(point.x, point.z, rules, ignoreSight, cx, cz, leadScale)) continue;
        spawnSector = (sector + 1) % sectors;
        return { x: point.x, z: point.z, yaw };
      }
    }
    return null;
  };
  /**
   * One hostile arrives on the ring; with no clear ring point, at the hostile base if that is clear of the humans too;
   * else it stays queued and the trickle tries again — never on top of the humans. A field left empty that long
   * (stalledS) takes a ring point out of reach but in sight rather than stall the wave.
   */
  let arrivalStalledAtS: number | null = null;
  // a benched straggler's re-arrival takes the nearer ring (strandedRingM); built once, never per arrival
  const strandedArrival: ArrivalRules = Object.freeze({ ...hordeRules, spawnRingM: hordeRules.strandedRingM ?? hordeRules.spawnRingM });
  // benched stragglers whose re-arrival is still queued (the next arrivals of the wave take the nearer ring)
  let strandedPending = 0;
  // the benchings each straggler's slot has taken this wave (strandedRetireAfter): a benched slot re-queues with its count
  // and the identity that re-arrives for it carries it on (the pool rotates, so it is seldom the same hull); cleared at
  // every wave start
  const strandRecycles = new Map<string, number>();
  const strandStrikeQueue: number[] = [];
  const arriveHostile = (entity: Entity): boolean => {
    const stalled = arrivalStalledAtS != null && placementTimeS - arrivalStalledAtS >= hordeRules.trickleS * hordeRules.stallTrickles
      && livingHordeEnemyCount() === 0;
    const straggler = strandedPending > 0;
    let at = arrivalPoint(entity, straggler ? strandedArrival : hordeRules, stalled, null, hordeWaveSpeedScale(hordeRules, wave));
    if (!at && straggler) at = arrivalPoint(entity, hordeRules, stalled, null, hordeWaveSpeedScale(hordeRules, wave));
    if (!at) {
      const base = spawns.get(entity.id);
      if (base && arrivalClear(base.x, base.z, hordeRules, stalled)) at = base;
    }
    if (!at) { arrivalStalledAtS ??= placementTimeS; return false; }
    arrivalStalledAtS = null;
    if (straggler) { strandedPending--; strandRecycles.set(entity.id, strandStrikeQueue.shift() ?? 1); }
    else strandRecycles.delete(entity.id);
    reviveAtSpawn(entity, hordeHealthScale, at);
    return true;
  };
  const publishHorde = (): void => {
    if (!state.horde) return;
    const alive = livingHordeEnemyCount();
    state.horde.alive = alive;
    state.horde.queued = hordeQueued;
    state.horde.remaining = alive + hordeQueued;
    state.horde.special = hordeSpecial;
  };
  const startHordeWave = (): void => {
    strandedPending = 0;
    strandRecycles.clear();
    strandStrikeQueue.length = 0;
    hordeSpecial = hordeWaveSpecial(hordeRules, wave);
    runnerWave = hordeSpecial === 'runner';
    const total = hordeWaveTotal(hordeRules, wave, hordeHumans);
    const opening = Math.min(hordeAliveCap, total);
    // the zombies' fodder hull (the revive's stamp multiplies by the humans' hpScale, so this divides it back out)
    hordeHealthScale = hordeWaveHealthScale(ruleset, hordeRules, wave);
    // the fallen allies stand up first, so every arrival is placed clear of each living alpha hull (round 2: allies
    // revived at their own deployment after the arrivals were placed stood within reach or in sight of the ring)
    for (const ally of teams.alpha) {
      if (ally.combat.destroyed) reviveAtSpawn(ally, 1);
    }
    const active = drawWave(opening);
    for (const entity of hordeEnemies) if (!active.has(entity)) deactivate(entity);
    let deferred = 0;
    for (const entity of hordeEnemies) {
      if (!active.has(entity) || arriveHostile(entity)) continue;
      deactivate(entity); // no clear arrival point yet: it waits in the queue
      deferred++;
    }
    hordeQueued = total - opening + deferred;
    nextTrickleAtS = placementTimeS + hordeTrickleS(hordeRules, wave);
    nextWaveAtS = null;
    if (state.horde) {
      state.horde.wave = wave;
      state.horde.total = total;
      state.horde.nextWaveInS = 0;
      state.horde.healChance = cacheHealChance(ruleset, wave);
    }
    publishHorde();
    emit('mode_wave_started', { wave, enemies: total, total, opening, special: hordeSpecial, healthScale: hordeHealthScale });
  };
  /** The trickle: while some of the wave is queued and the field is short, the longest-rested identity arrives. */
  const trickleHorde = (timeS: number, alive: number): void => {
    if (hordeQueued <= 0 || alive >= hordeAliveCap || timeS < nextTrickleAtS) return;
    let pick: Entity | null = null, pickRested = Infinity;
    for (const entity of hordeEnemies) {
      if (respawnAt.has(entity.id) || (entity.modeActive !== false && !entity.combat.destroyed)) continue;
      const rested = restedAt.get(entity.id) ?? -Infinity;
      // a wreck stays on the field a moment before its identity rests (it never vanishes under the gun that killed it)
      if (entity.modeActive !== false && timeS - rested < hordeRules.recycleAfterS) continue;
      if (rested < pickRested || (rested === pickRested && pick && entity.id < pick.id)) { pick = entity; pickRested = rested; }
    }
    nextTrickleAtS = timeS + hordeTrickleS(hordeRules, wave);
    if (pick && arriveHostile(pick)) hordeQueued--;
  };

  const spawnPickup = (): void => {
    if (!state.horde && id !== 'mars') return;
    // the draw is kept under unlimited rounds (every cache a repair), so the seeded stream does not shift
    const healChance = state.horde?.healChance ?? cacheHealChance(ruleset, wave);
    const kind: PickupState['kind'] = rng() < healChance ? 'heal' : 'ammo';
    const along = (rng() * 2 - 1) * Math.min(145, axisLength * 0.28);
    const lateral = (rng() * 2 - 1) * 135;
    let x = Math.max(-WORLD_MARGIN_M, Math.min(WORLD_MARGIN_M,
      midX + axisX * along + lateralX * lateral));
    let z = Math.max(-WORLD_MARGIN_M, Math.min(WORLD_MARGIN_M,
      midZ + axisZ * along + lateralZ * lateral));
    if (placement) {
      const safe = placement.pickup({ x, z }, pickups.filter(pickup => pickup.active)
        .map(pickup => ({ x: pickup.x, z: pickup.z, radius: PICKUP_RADIUS_M })));
      if (!safe) return;
      x = safe.x; z = safe.z;
    }
    let activeCount = 0;
    let oldestActive: PickupState | null = null;
    let pickup: PickupState | null = null;
    for (const candidate of pickups) {
      if (!candidate.active && !pickup) pickup = candidate;
      if (!candidate.active) continue;
      activeCount++;
      if (!oldestActive || candidate.spawnedWave < oldestActive.spawnedWave) {
        oldestActive = candidate;
      }
    }
    if (activeCount >= 12 && oldestActive) {
      oldestActive.active = false;
      pickup = oldestActive;
    }
    const next: PickupState = pickup || {
      id: '', kind, x, y: 0, z, active: true, spawnedWave: wave,
    };
    next.id = `loot-${wave}-${++pickupSequence}`;
    next.kind = kind;
    next.x = x;
    next.y = terrainHeight(x, z) + 3.2;
    next.z = z;
    next.active = true;
    next.spawnedWave = wave;
    if (!pickup) pickups.push(next);
    emit('mode_pickup_spawned', { ...next });
  };

  if (id === 'endless_horde') startHordeWave();
  // the outbreak opens among the survivors: the starting infected rise on the arrival ring too
  if (infectionArrival) for (const entity of teams.bravo) reviveAtSpawn(entity, 1);
  // Turbo Ball's opening kick-off (ball.kickoffAtStart; round 3, the critic's M6: the bots spent the first 25-35 s of
  // every match driving 300-400 m in from their deployments to a ball no one stood near): the bots line up as after a
  // goal; a human starts at its own deployment as ever
  if (ball && ruleset.ball?.kickoffAtStart && ruleset.ball.kickoffM != null) {
    for (const entity of entities) if (entity.bot) reviveAtSpawn(entity, 1, kickoffSpot(entity, ruleset.ball.kickoffM));
  }

  // ----------------------------------------------------- frontline assault ---
  let lineIndex = 0;
  let holdUntilS: number | null = null;
  // the attack's regroup on the sector it just took, before the last one (see the ruleset's regroupMaxS)
  let regroup: { x: number; z: number; untilS: number; checkedS: number } | null = null;
  const liveLine = (): ZoneState | null => zones[Math.min(lineIndex, zones.length - 1)] ?? null;

  const assaultRules = ruleset.assault ?? matchRulesetFor('frontline_assault').assault!;
  // gameplay-modes-228: the counter-attack on a sector just taken, the trickle from the rear and the fresh arrivals
  let counter: { x: number; z: number; atS: number; untilS: number; ids: string[]; line: number } | null = null;
  const counterIds = new Set<string>();
  let freshDefenders: string[] = [];
  let nextReinforceAtS = Infinity;
  /**
   * A defender's slot on the live line (defendersStartOnLine): lineBandM behind the sector's centre, spread across it,
   * facing the attack; `rear` puts it reinforceRearM back (the trickle). Null keeps the hostile's own spawn.
   */
  function lineSlot(slot: number, count: number, rear: boolean): MatchModeSpawn | null {
    if (!ruleset.assault || !assaultRules.defendersStartOnLine) return null;
    const zone = liveLine();
    if (!zone) return null;
    const [near, far] = assaultRules.lineBandM;
    let back = rear ? assaultRules.reinforceRearM : near + spawnRng() * (far - near);
    const across = (slot - (count - 1) / 2) * assaultRules.lineSpacingM + (spawnRng() - 0.5) * assaultRules.lineJitterM;
    // the line's guard: out of the attack's reach and terrain sight, stepping back along the axis (round 2, E2)
    const guard = assaultRules.lineGuard;
    for (let step = 0; ; step++) {
      const x = Math.max(-WORLD_MARGIN_M, Math.min(WORLD_MARGIN_M, zone.x + axisX * back + lateralX * across));
      const z = Math.max(-WORLD_MARGIN_M, Math.min(WORLD_MARGIN_M, zone.z + axisZ * back + lateralZ * across));
      if (!guard || step >= guard.tries || lineClear(x, z, guard)) return { x, z, yaw: Math.atan2(-axisX, -axisZ) };
      back += guard.stepBackM;
    }
  }
  /** No living attacker within the guard's minAttackM of (x, z), nor (outOfSight) seeing it over the terrain. */
  function lineClear(x: number, z: number, guard: NonNullable<typeof assaultRules.lineGuard>): boolean {
    const minSq = guard.minAttackM ** 2, sightSq = hordeRules.sightRangeM ** 2;
    for (const attacker of teams.alpha) {
      if (attacker.modeActive === false || attacker.combat.destroyed) continue;
      const dSq = squaredDistance(attacker, x, z);
      if (dSq < minSq) return false;
      if (guard.outOfSight && dSq <= sightSq && terrainSees(attacker, x, z, hordeRules)) return false;
    }
    return true;
  }
  /** A defender's revive scale: the sector's own, with the attack's hull (the ruleset's hpScale) divided back out. */
  const assaultHealth = (): number => assaultWaveHealthScale(assaultRules, lineIndex, zones.length) / (ruleset.hpScale > 0 ? ruleset.hpScale : 1);
  const lineCount = (): number => assaultRules.initialActive + assaultRules.extraDefenders + lineIndex;
  const startAssaultWave = (): void => {
    const activeCount = Math.min(hordeEnemies.length, lineCount());
    const healthScale = assaultHealth();
    // The opening wave is a fresh draw from the formation (owner 2026-09-15). Every later sector REINFORCES
    // the line instead of re-fielding it (owner 2026-09-17: "capturing bases in frontline assault shouldnt
    // reset tanks"): defenders still alive keep their identity, position and damage, and only the arrivals
    // that bring the counter-attack up to strength are drawn fresh, rested identities first — on the line itself.
    if (lineIndex === 0) {
      const active = drawWave(activeCount);
      let slot = 0;
      for (const entity of hordeEnemies) {
        if (active.has(entity)) reviveAtSpawn(entity, healthScale, lineSlot(slot++, active.size, false));
        else deactivate(entity);
      }
      freshDefenders = [...active].map((entity) => entity.id);
    } else reinforceLine(activeCount, healthScale);
    for (const ally of teams.alpha) {
      if (ally.combat.destroyed && ally.bot) reviveAtSpawn(ally, 1);
    }
    if (state.horde) {
      state.horde.wave = wave;
      state.horde.total = activeCount;
      state.horde.nextWaveInS = 0;
      state.horde.healChance = 0;
    }
    nextReinforceAtS = Infinity;
    emit('mode_wave_started', { wave, enemies: activeCount, healthScale });
  };
  if (id === 'frontline_assault') startAssaultWave();

  /** The counter-attack falls due: the squad's fresh defenders drive at the sector just taken. */
  const stepCounterAttack = (timeS: number): void => {
    if (!counter) return;
    if (!counter.ids.length && timeS >= counter.atS) {
      const zone = { x: counter.x, z: counter.z };
      const squad = (freshDefenders.length ? freshDefenders : hordeEnemies.map((entity) => entity.id))
        .map((key) => entityById.get(key)!).filter((entity) => entity && activeFriend(entity, 'bravo') && entity.bot)
        .sort((a, b) => squaredDistance(a, zone.x, zone.z) - squaredDistance(b, zone.x, zone.z) || (a.id < b.id ? -1 : 1))
        .slice(0, assaultRules.counterAttack?.squad ?? 0);
      counter.ids = squad.map((entity) => entity.id);
      for (const key of counter.ids) counterIds.add(key);
      if (counter.ids.length) emit('mode_counter_attack', { line: counter.line, squad: counter.ids.length, x: counter.x, z: counter.z });
    }
    if (timeS >= counter.untilS) {
      counterIds.clear();
      counter = null;
    }
  };
  /**
   * The allied revive (allyReviveS, the 40-55 % attacker-win lever): a destroyed allied BOT comes back that long after
   * its death, behind the last sector taken (its own spawn before the first falls). The human keeps the sortie's one life.
   */
  const allyDownAt = new Map<string, number>();
  const stepAllyRevive = (timeS: number): void => {
    const after = assaultRules.allyReviveS;
    if (after == null || after <= 0) return;
    for (const ally of teams.alpha) {
      if (!ally.bot || respawnAt.has(ally.id)) continue;
      if (!ally.combat.destroyed) { allyDownAt.delete(ally.id); continue; }
      const down = allyDownAt.get(ally.id);
      if (down == null) { allyDownAt.set(ally.id, timeS); continue; }
      if (timeS < down + after) continue;
      allyDownAt.delete(ally.id);
      const taken = lineIndex > 0 ? zones[lineIndex - 1] : null;
      reviveAtSpawn(ally, 1, taken ? { x: Math.max(-WORLD_MARGIN_M, Math.min(WORLD_MARGIN_M, taken.x - axisX * assaultRules.allyReviveBackM)),
        z: Math.max(-WORLD_MARGIN_M, Math.min(WORLD_MARGIN_M, taken.z - axisZ * assaultRules.allyReviveBackM)), yaw: Math.atan2(axisX, axisZ) } : null);
    }
  };
  /** The trickle: while the live sector is contested and its line is short, one defender arrives from the rear. */
  const stepReinforceTrickle = (zone: ZoneState, timeS: number): void => {
    if (assaultRules.reinforceTrickleS <= 0) return;
    let contested = false;
    const reachSq = (ZONE_RADIUS_M + assaultRules.contestReachM) ** 2;
    for (const attacker of teams.alpha) {
      if (activeFriend(attacker, 'alpha') && squaredDistance(attacker, zone.x, zone.z) <= reachSq) { contested = true; break; }
    }
    if (!contested) { nextReinforceAtS = Infinity; return; }
    if (!Number.isFinite(nextReinforceAtS)) { nextReinforceAtS = timeS + assaultRules.reinforceTrickleS; return; }
    if (timeS < nextReinforceAtS) return;
    nextReinforceAtS = timeS + assaultRules.reinforceTrickleS;
    let living = 0;
    for (const enemy of hordeEnemies) if (enemy.modeActive !== false && !enemy.combat.destroyed) living++;
    if (living >= lineCount() + assaultRules.reinforceExtra) return;
    let pick: Entity | null = null, pickRested = Infinity;
    for (const enemy of hordeEnemies) {
      if (respawnAt.has(enemy.id) || (enemy.modeActive !== false && !enemy.combat.destroyed)) continue;
      const rested = restedAt.get(enemy.id) ?? -Infinity;
      if (rested < pickRested || (rested === pickRested && pick && enemy.id < pick.id)) { pick = enemy; pickRested = rested; }
    }
    if (!pick) return;
    reviveAtSpawn(pick, assaultHealth(), lineSlot(0, 1, true));
    emit('mode_line_reinforced', { line: lineIndex, id: pick.id });
  };

  const stepAssault = (dt: number, timeS: number): MatchModeResult | null => {
    const humansAlive = teams.alpha.some((entity) => entity.modeActive !== false &&
      !entity.combat.destroyed && !entity.bot);
    if (!humansAlive) return finish('bravo', 'assault_overrun');
    const zone = liveLine();
    if (!zone) return null;
    if (regroup && timeS >= regroup.checkedS + 1) {
      regroup.checkedS = timeS;
      const point = regroup;
      const gathered = teams.alpha.every((entity) => !entity.bot || !activeFriend(entity, 'alpha')
        || squaredDistance(entity, point.x, point.z) <= assaultRules.regroupRadiusM ** 2);
      const humanLeads = teams.alpha.some((entity) => !entity.bot && activeFriend(entity, 'alpha')
        && squaredDistance(entity, zone.x, zone.z) <= assaultRules.regroupHumanM ** 2);
      if (timeS >= point.untilS || gathered || humanLeads) regroup = null;
    }
    stepCounterAttack(timeS);
    stepReinforceTrickle(zone, timeS);
    stepAllyRevive(timeS);
    const occupancy = zoneOccupancy(zone);
    advanceZoneControl(zone, Math.floor(occupancy / 16), occupancy % 16, dt, assaultRules.captureS);
    if (state.horde) state.horde.alive = livingHordeEnemyCount();
    if (lineIndex < zones.length - 1) {
      if (zone.owner === 'alpha') {
        lineIndex++;
        wave++;
        if (state.line) state.line.index = lineIndex;
        emit('mode_line_advanced', { line: lineIndex, total: zones.length });
        startAssaultWave();
        if (assaultRules.counterAttack && assaultRules.counterAttack.squad > 0) {
          counterIds.clear();
          counter = { x: zone.x, z: zone.z, line: lineIndex - 1, atS: timeS + assaultRules.counterAttack.afterCaptureS,
            untilS: timeS + assaultRules.counterAttack.afterCaptureS + assaultRules.counterAttack.forS, ids: [] };
        }
        if (lineIndex === zones.length - 1) {
          regroup = { x: zone.x, z: zone.z, untilS: timeS + assaultRules.regroupMaxS, checkedS: timeS };
        }
        attackPlan.clear();
      }
      return null;
    }
    // Final sector: hold it against the last counter-attack.
    if (zone.owner === 'alpha') {
      if (holdUntilS == null) holdUntilS = timeS + assaultRules.holdS;
      if (state.line) state.line.holdS = Math.max(0, holdUntilS - timeS);
      if (timeS >= holdUntilS) {
        if (state.line) state.line.index = zones.length;
        return finish('alpha', 'line_held');
      }
    } else {
      holdUntilS = null;
      if (state.line) state.line.holdS = 0;
    }
    return null;
  };

  const assaultBotTarget = (): ObjectivePoint | null => {
    const zone = liveLine();
    if (!zone) return null;
    // Visible attackers are handled by local perception. Mission orders must
    // not pull defenders toward the live position of an unspotted attacker.
    return { x: zone.x, z: zone.z };
  };
  /**
   * The attack's plan per bot (assaultBots, gameplay-modes-228), rebuilt once a second in id order: flank lanes for
   * `flankShare` of the attackers (odd ranks) until `flankConvergeM` from the zone; at the zone's edge a push waits for
   * `pushMinGroup` attackers within `pushGroupM` (the anti-suicide rule) or `pushAfterS` there, then drives in.
   */
  const assaultBots = ruleset.assaultBots ?? null;
  const attackPlan = new Map<string, { x: number; z: number; stagedAtS: number; pushing: boolean }>();
  let attackPlanAt = -Infinity;
  function planAttack(): void {
    if (!assaultBots || placementTimeS < attackPlanAt + 1) return;
    attackPlanAt = placementTimeS;
    const zone = liveLine();
    if (!zone) return;
    const squad = teams.alpha.filter((e) => e.bot && activeFriend(e, 'alpha')).sort((a, b) => (a.id < b.id ? -1 : 1));
    const flankers = Math.ceil(squad.length * assaultBots.flankShare);
    let flanked = 0;
    const edge = ZONE_RADIUS_M + assaultBots.flankConvergeM;
    squad.forEach((bot, rank) => {
      let plan = attackPlan.get(bot.id);
      if (!plan) { plan = { x: zone.x, z: zone.z, stagedAtS: Infinity, pushing: false }; attackPlan.set(bot.id, plan); }
      const d = Math.sqrt(squaredDistance(bot, zone.x, zone.z));
      const flank = rank % 2 === 1 && flanked < flankers;
      if (flank) flanked++;
      if (d > edge) {
        const side = (rank >> 1) % 2 === 0 ? 1 : -1;
        const off = flank ? assaultBots.flankOffsetM * side : 0;
        plan.x = zone.x + lateralX * off; plan.z = zone.z + lateralZ * off;
        plan.stagedAtS = Infinity;
        if (!plan.pushing) return;
      }
      if (plan.pushing) { plan.x = zone.x; plan.z = zone.z; return; }
      if (!Number.isFinite(plan.stagedAtS)) plan.stagedAtS = placementTimeS;
      let group = 0;
      for (const friend of teams.alpha) {
        if (friend !== bot && activeFriend(friend, 'alpha') && squaredDistance(friend, bot.state.pos.x, bot.state.pos.z) <= assaultBots.pushGroupM ** 2) group++;
      }
      if (group >= assaultBots.pushMinGroup || placementTimeS - plan.stagedAtS >= assaultBots.pushAfterS) {
        plan.pushing = true; plan.x = zone.x; plan.z = zone.z; return;
      }
      // wait at the edge, on the attack's side of the zone
      plan.x = zone.x - axisX * (ZONE_RADIUS_M + assaultBots.stageM) + lateralX * (rank - (squad.length - 1) / 2) * 12;
      plan.z = zone.z - axisZ * (ZONE_RADIUS_M + assaultBots.stageM) + lateralZ * (rank - (squad.length - 1) / 2) * 12;
    });
  }

  /**
   * The defenders hold the live sector spread on a ring `holdSpreadM` round its centre, one slot each by id order
   * (round 2: all of them made for the one centre point and bunched, 9.5 % of their moving samples within 10 m of a
   * friend). Dealt once a second; the point is moved in place.
   */
  const holdRanks = new Map<string, { rank: number; of: number }>();
  let holdRanksAt = -Infinity;
  function holdSlot(entity: Entity, point: { x: number; z: number }): void {
    const spread = assaultRules.holdSpreadM;
    if (spread <= 0) return;
    if (placementTimeS >= holdRanksAt + 1) {
      holdRanksAt = placementTimeS;
      holdRanks.clear();
      const squad = teams.bravo.filter((e) => e.bot && activeFriend(e, 'bravo') && !counterIds.has(e.id)).sort((a, b) => (a.id < b.id ? -1 : 1));
      squad.forEach((e, rank) => holdRanks.set(e.id, { rank, of: squad.length }));
    }
    const slot = holdRanks.get(entity.id);
    if (!slot || slot.of < 2) return;
    // the first slot faces the attack (toward alpha's side), the rest round the ring
    const angle = Math.atan2(-axisX, -axisZ) + slot.rank * (2 * Math.PI / slot.of);
    point.x += Math.sin(angle) * spread; point.z += Math.cos(angle) * spread;
  }

  const finish = (winner: ObjectiveTeam | 'draw', reason: string): MatchModeResult => {
    if (!result) {
      result = { result: winner, reason };
      emit('mode_completed', { result: winner, reason });
    }
    return result;
  };

  const dropCarriedFlags = (entity: Entity, timeS: number): void => {
    for (const flag of flags) {
      if (flag.carrierId !== entity.id) continue;
      flag.carrierId = null;
      flag.status = 'dropped';
      stampPhysics(entity);
      flag.x = entity.state.pos.x;
      flag.z = entity.state.pos.z;
      flag.y = terrainHeight(flag.x, flag.z) + 2.5;
      flag.returnAtS = timeS + FLAG_RETURN_S;
      emit('mode_flag_dropped', { team: flag.team, by: entity.id, x: flag.x, z: flag.z });
    }
  };

  const observeEntityDeath = (entity: Entity, timeS: number): void => {
    const isDead = !!entity.combat.destroyed;
    const wasDead = destroyed.get(entity.id) || false;
    if (isDead === wasDead) return;
    destroyed.set(entity.id, isDead);
    if (!isDead) return;
    if (!restedAt.has(entity.id)) restedAt.set(entity.id, timeS);
    dropCarriedFlags(entity, timeS);
    if (entity === boss) return;
    if (ruleset.infection && teamOf(entity) === 'alpha') {
      teams.alpha.splice(teams.alpha.indexOf(entity), 1);
      entity.team = entities.some(other => other.team === 'enemy') ? 'enemy' : 'bravo';
      teams.bravo.push(entity);
      spawns.set(entity.id, { ...centers.bravo });
      stampPhysics(entity);
      emit('mode_infected', { id: entity.id, team: 'bravo' });
    }
    if (ruleset.respawnS != null) respawnAt.set(entity.id, { atS: timeS + ruleset.respawnS, healthScale: 1 });
  };

  const handleDeathsAndRespawns = (timeS: number): void => {
    for (const entity of entities) {
      if (entity.modeActive === false && !respawnAt.has(entity.id)) continue;
      observeEntityDeath(entity, timeS);
      const due = respawnAt.get(entity.id);
      if (due != null && timeS >= due.atS) reviveAtSpawn(entity, due.healthScale);
    }
  };

  const syncCarriedFlag = (flag: FlagState): boolean => {
    if (flag.status !== 'carried') return false;
    const carrier = flag.carrierId ? entityById.get(flag.carrierId) : null;
    if (carrier && !carrier.combat.destroyed && carrier.modeActive !== false) {
      flag.x = carrier.state.pos.x;
      flag.y = carrier.state.pos.y + 3.4;
      flag.z = carrier.state.pos.z;
    }
    return true;
  };

  const returnExpiredFlag = (flag: FlagState, timeS: number): void => {
    if (flag.status !== 'dropped' || flag.returnAtS == null || timeS < flag.returnAtS) return;
    resetFlag(flag);
    emit('mode_flag_returned', { team: flag.team, automatic: true });
  };

  const touchFlag = (flag: FlagState, entity: Entity): boolean => {
    if (entity.modeActive === false || entity.combat.destroyed) return false;
    if (squaredDistance(entity, flag.x, flag.z) > FLAG_RADIUS_M * FLAG_RADIUS_M) return false;
    if (teamOf(entity) === flag.team) {
      if (flag.status !== 'dropped') return false;
      resetFlag(flag);
      emit('mode_flag_returned', { team: flag.team, by: entity.id });
      return false;
    }
    flag.status = 'carried';
    flag.carrierId = entity.id;
    flag.returnAtS = null;
    // the carrier is slower until it scores or falls (the ruleset's flagPitch.carrierSpeedScale, else the standing 85 %)
    stampPhysics(entity, baseSpeed * (ruleset.flagPitch?.carrierSpeedScale ?? FLAG_CARRIER_SPEED_SCALE));
    emit('mode_flag_taken', { team: flag.team, by: entity.id });
    return true;
  };

  const updateAvailableFlag = (flag: FlagState, timeS: number): void => {
    if (syncCarriedFlag(flag)) return;
    returnExpiredFlag(flag, timeS);
    for (const entity of entities) {
      if (touchFlag(flag, entity)) return;
    }
  };

  const flagCarriedBy = (entityId: string): FlagState | null => {
    for (const flag of flags) if (flag.carrierId === entityId) return flag;
    return null;
  };

  const flagForTeam = (team: ObjectiveTeam): FlagState | null => {
    for (const flag of flags) if (flag.team === team) return flag;
    return null;
  };

  const captureCarriedFlag = (entity: Entity): MatchModeResult | null => {
    if (entity.modeActive === false || entity.combat.destroyed) return null;
    const team = teamOf(entity);
    const enemyFlag = flagCarriedBy(entity.id);
    const ownFlag = flagForTeam(team);
    if (!enemyFlag || !ownFlag || ownFlag.status !== 'home') return null;
    // the capture is made at the own flag's base (flagPitch: in front of the spawn)
    if (squaredDistance(entity, ownFlag.baseX, ownFlag.baseZ) > FLAG_CAPTURE_RADIUS_M ** 2) return null;
    score[team]++;
    resetFlag(enemyFlag);
    stampPhysics(entity);
    emit('mode_flag_captured', { team, by: entity.id, score: score[team] });
    return score[team] >= scoreTarget ? finish(team, 'flag_limit') : null;
  };

  const stepFlags = (timeS: number): MatchModeResult | null => {
    for (const flag of flags) updateAvailableFlag(flag, timeS);
    for (const entity of entities) {
      const completed = captureCarriedFlag(entity);
      if (completed) return completed;
    }
    return null;
  };

  const zoneOccupancy = (zone: ZoneState): number => {
    let alpha = 0;
    let bravo = 0;
    for (const entity of entities) {
      if (entity.modeActive === false || entity.combat.destroyed ||
          squaredDistance(entity, zone.x, zone.z) > ZONE_RADIUS_M ** 2) continue;
      if (teamOf(entity) === 'alpha') alpha++;
      else bravo++;
    }
    return alpha * 16 + bravo;
  };

  // An owned point the other side has driven onto, its holders inside or not: announced once per incursion
  // (mode_zone_contested, with the holding team), before the intruders start turning it.
  const zoneIncursions = new Map<ZoneState['id'], { inside: boolean; sinceS: number }>();
  const noteZoneIncursion = (zone: ZoneState, intruders: number, dt: number): void => {
    let incursion = zoneIncursions.get(zone.id);
    if (!incursion) { incursion = { inside: false, sinceS: ZONE_CONTEST_REPEAT_S }; zoneIncursions.set(zone.id, incursion); }
    incursion.sinceS += dt;
    if (intruders > 0 && !incursion.inside && incursion.sinceS >= ZONE_CONTEST_REPEAT_S) {
      incursion.sinceS = 0;
      emit('mode_zone_contested', { zoneId: zone.id, team: zone.owner });
    }
    incursion.inside = intruders > 0;
  };

  const advanceZoneControl = (zone: ZoneState, alpha: number, bravo: number, dt: number, captureS = ZONE_CAPTURE_S): void => {
    noteZoneIncursion(zone, zone.owner === 'alpha' ? bravo : zone.owner === 'bravo' ? alpha : 0, dt);
    zone.contested = alpha > 0 && bravo > 0;
    if (zone.contested || (alpha === 0 && bravo === 0)) return;
    const direction = alpha > 0 ? 1 : -1;
    const count = Math.max(alpha, bravo);
    zone.control = Math.max(-1, Math.min(1,
      zone.control + direction * dt * (1 + (count - 1) * 0.35) / captureS));
    const previousOwner = zone.owner;
    zone.owner = zone.control >= 0.999 ? 'alpha' : zone.control <= -0.999 ? 'bravo' : null;
    if (zone.owner && zone.owner !== previousOwner) {
      emit('mode_zone_captured', { zoneId: zone.id, team: zone.owner });
    }
  };

  const zoneScoreWinner = (): ObjectiveTeam | 'draw' | null => {
    if (score.alpha < scoreTarget && score.bravo < scoreTarget) return null;
    if (score.alpha === score.bravo) return 'draw';
    return score.alpha > score.bravo ? 'alpha' : 'bravo';
  };

  const stepZones = (dt: number): MatchModeResult | null => {
    for (const zone of zones) {
      const occupancy = zoneOccupancy(zone);
      advanceZoneControl(zone, Math.floor(occupancy / 16), occupancy % 16, dt);
      if (zone.owner) score[zone.owner] += dt * ZONE_POINTS_PER_SECOND;
    }
    const winner = zoneScoreWinner();
    return winner ? finish(winner, 'score_limit') : null;
  };

  const resetBall = (): void => {
    if (!ball) return;
    ball.x = midX;
    ball.z = midZ;
    ball.y = ballFloorHeight(midX, midZ, Infinity) + BALL_RADIUS_M;
    ball.vx = 0;
    ball.vy = 0;
    ball.vz = 0;
    ball.lastTouchId = null;
  };

  const touchBallWithEntity = (entity: Entity, timeS: number): void => {
    if (!ball || entity.modeActive === false || entity.combat.destroyed) return;
    const dx = ball.x - entity.state.pos.x;
    const dz = ball.z - entity.state.pos.z;
    const distance = Math.hypot(dx, dz);
    if (distance > 6.5 || timeS - lastBallTouchS < 0.12) return;
    const inv = distance > 0.01 ? 1 / distance : 1;
    const nx = distance > 0.01 ? dx * inv : Math.sin(entity.state.yaw);
    const nz = distance > 0.01 ? dz * inv : Math.cos(entity.state.yaw);
    const driveX = Math.sin(entity.state.yaw) * entity.state.speed;
    const driveZ = Math.cos(entity.state.yaw) * entity.state.speed;
    const closing = Math.max(0, driveX * nx + driveZ * nz);
    ball.vx = ball.vx * 0.42 + driveX * 0.82 + nx * (4 + closing * 0.35);
    ball.vz = ball.vz * 0.42 + driveZ * 0.82 + nz * (4 + closing * 0.35);
    ball.vy = Math.max(ball.vy, 2.5 + closing * 0.12);
    ball.lastTouchId = entity.id;
    lastBallTouchS = timeS;
    emit('mode_ball_hit', { by: entity.id, team: teamOf(entity), kind: 'ram' });
  };

  let previousBallBottom = 0;
  const integrateBall = (dt: number): void => {
    if (!ball) return;
    previousBallBottom = ball.y - BALL_RADIUS_M;
    ball.vy -= BALL_GRAVITY_MPS2 * ruleset.gravityScale * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.z += ball.vz * dt;
    ball.vx *= BALL_LINEAR_DRAG;
    ball.vz *= BALL_LINEAR_DRAG;
  };

  const bounceBallFromTerrain = (): void => {
    if (!ball) return;
    const floor = ballFloorHeight(ball.x, ball.z, previousBallBottom) + BALL_RADIUS_M;
    if (ball.y >= floor) return;
    ball.y = floor;
    ball.vy = ball.vy < -1 ? ball.vy * -0.58 : 0;
  };

  const containBallInWorld = (): void => {
    if (!ball) return;
    if (Math.abs(ball.x) > WORLD_MARGIN_M) {
      ball.x = Math.sign(ball.x) * WORLD_MARGIN_M;
      ball.vx *= -0.65;
    }
    if (Math.abs(ball.z) > WORLD_MARGIN_M) {
      ball.z = Math.sign(ball.z) * WORLD_MARGIN_M;
      ball.vz *= -0.65;
    }
  };

  const ballScoringTeam = (): ObjectiveTeam | null => {
    if (!ball) return null;
    const alphaGoal = goals[0]!, bravoGoal = goals[1]!;
    const atAlphaGoal = (ball.x - alphaGoal.x) ** 2 + (ball.z - alphaGoal.z) ** 2
      <= BALL_GOAL_RADIUS_M ** 2;
    if (atAlphaGoal) return 'bravo';
    const atBravoGoal = (ball.x - bravoGoal.x) ** 2 + (ball.z - bravoGoal.z) ** 2
      <= BALL_GOAL_RADIUS_M ** 2;
    return atBravoGoal ? 'alpha' : null;
  };

  const completeBallGoal = (scoringTeam: ObjectiveTeam): MatchModeResult | null => {
    if (!ball) return null;
    score[scoringTeam]++;
    emit('mode_goal_scored', {
      team: scoringTeam, by: ball.lastTouchId, score: score[scoringTeam],
    });
    resetBall();
    ballActiveAtS = placementTimeS;
    // the kick-off line-up (ball.kickoffM; round 3): each side on its own half of the kick-off spot, not 300-440 m back
    const kickoffM = ruleset.ball?.kickoffM ?? null;
    for (const entity of entities) reviveAtSpawn(entity, 1, kickoffM != null ? kickoffSpot(entity, kickoffM) : null);
    return score[scoringTeam] >= scoreTarget
      ? finish(scoringTeam, 'goal_limit') : null;
  };

  // a ball nobody touches for the ruleset's idleResetS goes back to the kick-off spot (Steinburg's single touch)
  let ballActiveAtS = 0;
  const stepBall = (dt: number, timeS: number): MatchModeResult | null => {
    if (!ball) return null;
    const idleResetS = ruleset.ball?.idleResetS ?? null;
    if (lastBallTouchS > ballActiveAtS) ballActiveAtS = lastBallTouchS;
    if (idleResetS != null && timeS - ballActiveAtS >= idleResetS) {
      resetBall();
      ballActiveAtS = timeS;
      emit('mode_ball_reset', { idleS: idleResetS });
    }
    for (const entity of entities) touchBallWithEntity(entity, timeS);
    integrateBall(dt);
    bounceBallFromTerrain();
    containBallInWorld();
    const scoringTeam = ballScoringTeam();
    return scoringTeam ? completeBallGoal(scoringTeam) : null;
  };

  function livingHordeEnemyCount(): number {
    let alive = 0;
    for (const enemy of hordeEnemies) {
      if (respawnAt.has(enemy.id) || (enemy.modeActive !== false && !enemy.combat.destroyed)) alive++;
    }
    return alive;
  }

  const updateHordeIntermission = (alive: number, timeS: number): void => {
    if (state.horde) {
      state.horde.nextWaveInS = nextWaveAtS == null ? 0 : Math.max(0, nextWaveAtS - timeS);
    }
    if (alive === 0 && hordeQueued <= 0 && nextWaveAtS == null) {
      nextWaveAtS = timeS + hordeRules.intermissionS;
      spawnPickup();
      // the survivors patch up between waves (waveRepair of maximum hull)
      let repaired = 0;
      for (const ally of teams.alpha) {
        if (ally.combat.destroyed || ally.modeActive === false) continue;
        const next = Math.min(ally.combat.maxHp, ally.combat.hp + Math.round(ally.combat.maxHp * hordeRules.waveRepair));
        repaired += next - ally.combat.hp;
        ally.combat.hp = next;
      }
      emit('mode_wave_cleared', { wave, nextWaveInS: hordeRules.intermissionS, repaired });
    }
    if (nextWaveAtS != null && timeS >= nextWaveAtS) {
      wave++;
      startHordeWave();
    }
  };

  let ammoAt=0,healAt=0;
  const requestSupply=(entityId:string,kind:'ammo'|'heal',timeS:number):boolean=>{
    const entity=entityById.get(entityId);
    if(id!=='ac130'||result||!entity||entity.combat.destroyed||entity.aerial?.kind!=='gunship'||timeS<(kind==='ammo'?ammoAt:healAt))return false;
    const aim=entity.input?.aimPoint;if(!aim||!Number.isFinite(aim.x)||!Number.isFinite(aim.z))return false;
    const requested={x:Math.max(-WORLD_MARGIN_M,Math.min(WORLD_MARGIN_M,aim.x)),z:Math.max(-WORLD_MARGIN_M,Math.min(WORLD_MARGIN_M,aim.z))};
    const safe=placement?placement.pickup(requested,pickups.filter(p=>p.active).map(p=>({x:p.x,z:p.z,radius:PICKUP_RADIUS_M}))):requested;
    if(!safe)return false;
    const free=pickups.find(p=>!p.active);
    if(!free&&pickups.length>=12)return false;
    const groundY=terrainHeight(safe.x,safe.z)+1.2;
    const pickup:PickupState={id:`airdrop-${++pickupSequence}`,kind,x:safe.x,z:safe.z,y:Math.max(groundY,entity.aerial.y),active:true,spawnedWave:0,airDrop:true,groundY,startY:Math.max(groundY,entity.aerial.y),landAtS:timeS+6,expiresAtS:timeS+70};
    if(free)Object.assign(free,pickup);else pickups.push(pickup);
    if(kind==='ammo')ammoAt=timeS+22;else healAt=timeS+30;
    emit('mode_pickup_spawned',{...pickup,by:entityId});return true;
  };
  const needsSupply=(entity:Entity,pickup:PickupState):boolean=>pickup.kind==='heal'
    ?entity.combat.hp<entity.combat.maxHp*.95
    :totalAmmunition(entity.combat)<totalAmmunitionCapacity(entity.combat)*.9;
  const supplyTarget=(entity:Entity):BotDestination|null=>{
    if(id!=='ac130'||teamOf(entity)!=='alpha'||entity.aerial?.kind==='gunship')return null;
    for(const pickup of pickups){
      if(!pickup.active||!needsSupply(entity,pickup)||squaredDistance(entity,pickup.x,pickup.z)>260*260)continue;
      let closest:Entity|null=null,best=Infinity;
      for(const ally of teams.alpha){
        if(ally.combat.destroyed||ally.modeActive===false||ally.aerial?.kind==='gunship'||!needsSupply(ally,pickup))continue;
        const distance=squaredDistance(ally,pickup.x,pickup.z);if(distance<best){best=distance;closest=ally;}
      }
      if(closest===entity)return{x:pickup.x,z:pickup.z,mission:'recover'};
    }
    return null;
  };
  const stepSupport=(timeS:number):void=>{
    if(id!=='ac130')return;
    state.support={ammoReadyInS:Math.max(0,ammoAt-timeS),healReadyInS:Math.max(0,healAt-timeS)};
    for(const pickup of pickups){
      if(!pickup.active||!pickup.airDrop)continue;
      if(timeS>=(pickup.expiresAtS??Infinity)){pickup.active=false;continue;}
      pickup.y=(pickup.groundY??0)+Math.max(0,Math.min(1,((pickup.landAtS??0)-timeS)/6))*((pickup.startY??240)-(pickup.groundY??0));
      if(timeS<(pickup.landAtS??0))continue;
      for(const ally of teams.alpha)if(collectPickup(pickup,ally))break;
    }
  };

  const collectPickup = (pickup: PickupState, entity: Entity): boolean => {
    if ((entity.bot && !pickup.airDrop) || entity.aerial?.kind==='gunship' || entity.modeActive === false || entity.combat.destroyed ||
        squaredDistance(entity, pickup.x, pickup.z) > PICKUP_RADIUS_M ** 2) return false;
    if(pickup.airDrop&&!needsSupply(entity,pickup))return false;
    if (pickup.kind === 'ammo') {
      const refill = replenishAmmunition(entity.combat);
      if (refill.totalAdded <= 0) return false;
      emit('mode_pickup_collected', {
        id: pickup.id,
        kind: pickup.kind,
        by: entity.id,
        ammoAdded: refill.totalAdded,
        addedBySlot: refill.added,
      });
    } else {
      const restored = Math.max(1, Math.round(entity.combat.maxHp * 0.35));
      entity.combat.hp = Math.min(entity.combat.maxHp, entity.combat.hp + restored);
      emit('mode_pickup_collected', { id: pickup.id, kind: pickup.kind, by: entity.id });
    }
    pickup.active = false;
    return true;
  };

  const collectHordePickups = (): void => {
    for (const pickup of pickups) {
      if (!pickup.active) continue;
      for (const entity of teams.alpha) {
        if (collectPickup(pickup, entity)) break;
      }
    }
  };

  // Mars mode (owner 2026-09-18 "give it a bunch of boosts"): a repair or ammunition cache drops from
  // the ruleset's cacheFirstS every cacheIntervalS (the Mars settings; 0 turns the drops off), and any human on
  // either side may take it
  const marsRules = ruleset.mars ?? MARS_DEFAULT_RULES;
  let nextMarsCacheAtS = marsRules.cacheFirstS;
  const stepMarsCaches = (timeS: number): void => {
    if (marsRules.cacheIntervalS > 0 && timeS >= nextMarsCacheAtS) {
      spawnPickup();
      nextMarsCacheAtS = timeS + marsRules.cacheIntervalS;
    }
    for (const pickup of pickups) {
      if (!pickup.active) continue;
      for (const entity of entities) {
        if (collectPickup(pickup, entity)) break;
      }
    }
  };

  /** The stranded hostile (strandedS): benched and queued again, so it re-arrives on the ring (checked once a second). */
  const strandTrack = new Map<string, { bestM: number; sinceS: number }>();
  let strandCheckAtS = -Infinity;
  const recycleStranded = (timeS: number): void => {
    if (hordeRules.strandedS <= 0 || timeS < strandCheckAtS + 1) return;
    strandCheckAtS = timeS;
    for (const hostile of hordeEnemies) {
      if (hostile.modeActive === false || hostile.combat.destroyed) { strandTrack.delete(hostile.id); continue; }
      let nearSq = Infinity;
      for (const human of teams.alpha) {
        if (human.modeActive !== false && !human.combat.destroyed) nearSq = Math.min(nearSq, squaredDistance(hostile, human.state.pos.x, human.state.pos.z));
      }
      if (!Number.isFinite(nearSq)) return;
      const near = Math.sqrt(nearSq), track = strandTrack.get(hostile.id);
      if (!track) { strandTrack.set(hostile.id, { bestM: near, sinceS: timeS }); continue; }
      if (near <= hordeRules.strandedContactM || near <= track.bestM - hordeRules.strandedGainM) {
        track.bestM = near; track.sinceS = timeS; // reused: the once-a-second check allocates only a new hostile's track
        continue;
      }
      if (timeS - track.sinceS < hordeRules.strandedS) continue;
      strandTrack.delete(hostile.id);
      deactivate(hostile);
      const benched = (strandRecycles.get(hostile.id) ?? 0) + 1;
      strandRecycles.delete(hostile.id);
      if (benched > (hordeRules.strandedRetireAfter ?? Infinity)) {
        // retired: the slot rests and the wave owes it no more (the trickle never brings it back this wave)
        emit('mode_horde_retired', { id: hostile.id, wave });
        continue;
      }
      strandStrikeQueue.push(benched);
      strandedPending++;
      hordeQueued++;
      emit('mode_horde_recycled', { id: hostile.id, wave });
    }
  };

  const stepHorde = (timeS: number): MatchModeResult | null => {
    const humansAlive = teams.alpha.some((entity) => entity.modeActive !== false &&
      !entity.combat.destroyed && !entity.bot);
    if (!humansAlive) return finish('bravo', 'horde_overrun');
    recycleStranded(timeS);
    trickleHorde(timeS, livingHordeEnemyCount());
    publishHorde();
    updateHordeIntermission(livingHordeEnemyCount(), timeS);
    collectHordePickups();
    return null;
  };

  const serialize = (viewerId: string | null = null): MatchModePresentationState => {
    const viewer = viewerId ? entityById.get(viewerId) : null;
    return {
      id: state.id,
      label: state.label,
      perspectiveTeam: viewer ? teamOf(viewer) : 'alpha',
      respawns: state.respawns,
      target: state.target,
      score: { alpha: Math.round(score.alpha), bravo: Math.round(score.bravo) },
      flags: flags.map((flag) => ({ ...flag })),
      zones: zones.map((zone) => ({ ...zone })),
      ball: ball ? { ...ball } : null,
      goals: goals.map((goal) => ({ ...goal })),
      spawns: state.spawns.map((spawn) => ({ ...spawn })),
      horde: state.horde ? { ...state.horde } : null,
      line: state.line ? { ...state.line } : null,
      pickups: pickups.filter((pickup) => pickup.active).map((pickup) => ({ ...pickup })),
      playerAmmo: viewer ? totalAmmunition(viewer.combat) : null,
      playerAmmoCapacity: viewer ? totalAmmunitionCapacity(viewer.combat) : null,
      ...(viewer?.aerial ? { aerial: { ...viewer.aerial } } : {}),
      ...(ruleset.infection ? { factions: entities.map(entity => ({ id: entity.id, team: teamOf(entity) })) } : {}),
      ...(escort ? { escort:{...escort.state} } : {}),
      ...(state.boss ? { boss: { ...state.boss } } : {}),
      ...(state.support ? {support:{...state.support}} : {}),
      ...(state.infection ? { infection: { ...state.infection } } : {}),
      ...(ruleset.gunGame ? { weaponStages: entities.map(entity => ({ id: entity.id, index: Math.min(GUN_GAME_WEAPONS.length - 1, Math.floor((weaponKills.get(entity.id) ?? 0) / ruleset.gunGame!.killsPerWeapon)) })) } : {}),
      ...(ruleset.gunGame && viewer ? { weaponStage: {
        index: Math.min(GUN_GAME_WEAPONS.length - 1, Math.floor((weaponKills.get(viewer.id) ?? 0) / ruleset.gunGame.killsPerWeapon)),
        total: GUN_GAME_WEAPONS.length, kills: (weaponKills.get(viewer.id) ?? 0) % ruleset.gunGame.killsPerWeapon,
        required: ruleset.gunGame.killsPerWeapon,
        name: GUN_GAME_WEAPONS[Math.min(GUN_GAME_WEAPONS.length - 1, Math.floor((weaponKills.get(viewer.id) ?? 0) / ruleset.gunGame.killsPerWeapon))]!.name,
      } } : {}),
    };
  };

  const activeFriend = (friend: Entity, team: ObjectiveTeam): boolean =>
    teamOf(friend) === team && friend.modeActive !== false && !friend.combat.destroyed;

  // Capture the Flag bots (gameplay-modes-228; the ruleset's flagBots): the flags are run, not brawled over. Roles are
  // dealt per team once a second (and at once when a flag changes hands) in id order: with our flag away the nearest
  // recoverMin recover first; with our carrier running the nearest `escorts` of the rest escort it; then, with our flag
  // away, every other bot recovers too (huntWhenHomeFlagTaken: a capture needs it home); with no flag carried
  // defendShare of a large squad guards home and the rest raid on lanes.
  const flagRules = ruleset.flagBots ?? matchRulesetFor('capture_the_flag').flagBots!;
  type FlagRole = 'recover' | 'escort' | 'defend' | 'raid';
  const flagRoles = new Map<string, { role: FlagRole; rank: number }>();
  let flagRolesAt = -Infinity;
  /** The raid's stage per raider (flagBots.raidStageM): when it reached the stage, and whether it has gone in. */
  const raidStaged = new Map<string, { atS: number; go: boolean }>();
  // the flags' state the roles were dealt for (status and carrier per flag), compared in place: no key is built per call
  const flagRolesSeen: { status: FlagState['status'] | null; carrierId: string | null }[] = [];
  const flagsChanged = (): boolean => {
    let changed = flagRolesSeen.length !== flags.length;
    for (let i = 0; i < flags.length; i++) {
      const seen = flagRolesSeen[i] ?? (flagRolesSeen[i] = { status: null, carrierId: null });
      if (seen.status !== flags[i]!.status || seen.carrierId !== flags[i]!.carrierId) changed = true;
      seen.status = flags[i]!.status; seen.carrierId = flags[i]!.carrierId;
    }
    flagRolesSeen.length = flags.length;
    return changed;
  };
  const byDistanceTo = (list: Entity[], x: number, z: number): Entity[] =>
    list.slice().sort((a, b) => squaredDistance(a, x, z) - squaredDistance(b, x, z) || (a.id < b.id ? -1 : 1));
  /**
   * The roles, per team in id order (round 2: the critic's one-sided raiding — a robbed team sent every free bot to
   * recover and the carrying team's spare bots all defended, so the robbed side never raided back): with our flag away
   * `recoverShare` of the squad (at least recoverMin, the nearest first) recovers; our carrier takes `escorts` escorts;
   * with our flag home `carrierGuards` (our carrier running) or defendShare of a large squad (nothing carried) guard it;
   * everyone else escorts our carrier when one runs, else raids — a robbed team raids back (their flag away holds their
   * capture too, the standoff that recovery then breaks).
   */
  function assignFlagRoles(): void {
    if (!flagsChanged() && placementTimeS < flagRolesAt + 1) return;
    flagRolesAt = placementTimeS;
    flagRoles.clear();
    for (const team of ['alpha', 'bravo'] as const) {
      const ownFlag = flagForTeam(team), enemyFlag = flagForTeam(otherTeam(team));
      if (!ownFlag || !enemyFlag) continue;
      // a raid's stage holds only while the enemy flag stands at its base; a fallen raider stages afresh
      for (const e of teams[team]) if (enemyFlag.status !== 'home' || e.combat.destroyed) raidStaged.delete(e.id);
      const squad = teams[team].filter((e) => e.bot && activeFriend(e, team) && !flagCarriedBy(e.id)).sort((a, b) => (a.id < b.id ? -1 : 1));
      const free = new Set(squad);
      // ranks run on across two deals of one role (the escorts' leading three, then the rearguard)
      const dealt = new Map<FlagRole, number>();
      const deal = (list: Entity[], role: FlagRole, count: number): void => {
        let rank = dealt.get(role) ?? 0;
        const end = rank + count;
        for (const e of list) { if (rank >= end) break; if (!free.has(e)) continue; flagRoles.set(e.id, { role, rank: rank++ }); free.delete(e); }
        dealt.set(role, rank);
      };
      const ownAway = ownFlag.status !== 'home';
      const carrying = !!enemyFlag.carrierId;
      if (ownAway) {
        const recoverers = flagRules.huntWhenHomeFlagTaken ? Infinity
          : Math.max(flagRules.recoverMin, Math.ceil(squad.length * flagRules.recoverShare));
        deal(byDistanceTo(squad, ownFlag.x, ownFlag.z), 'recover', recoverers);
      }
      if (carrying) deal(byDistanceTo(squad, enemyFlag.x, enemyFlag.z), 'escort', flagRules.escorts);
      if (!ownAway) {
        const guards = carrying ? flagRules.carrierGuards
          : squad.length >= flagRules.defendMinSquad ? Math.max(1, Math.round(squad.length * flagRules.defendShare)) : 0;
        deal(byDistanceTo(squad, ownFlag.baseX, ownFlag.baseZ), 'defend', guards);
      }
      if (carrying) deal(byDistanceTo(squad, enemyFlag.x, enemyFlag.z), 'escort', Infinity);
      else deal(byDistanceTo(squad, enemyFlag.x, enemyFlag.z), 'raid', Infinity);
    }
  }
  const flagBotTarget = (entity: Entity, team: ObjectiveTeam): BotDestination | null => {
    const ownFlag = flagForTeam(team);
    const enemyFlag = flagForTeam(otherTeam(team));
    if (!enemyFlag || !ownFlag) return null;
    // home is the own flag's base, where a capture is made (flagPitch)
    const home = flagHome[team];
    if (flagCarriedBy(entity.id)) return { x: home.x, z: home.z, mission: 'carrier' };
    assignFlagRoles();
    const job = flagRoles.get(entity.id) ?? { role: 'raid' as FlagRole, rank: 0 };
    const dx = home.x - enemyFlag.x, dz = home.z - enemyFlag.z;
    const length = Math.hypot(dx, dz) || 1, nx = dx / length, nz = dz / length;
    const side = job.rank % 2 === 0 ? 1 : -1;
    if (job.role === 'recover') {
      // a carried flag is cut off at the point its carrier reaches interceptLeadS ahead on the line to its home
      let x = ownFlag.x, z = ownFlag.z;
      const carrier = ownFlag.status === 'carried' && ownFlag.carrierId ? entityById.get(ownFlag.carrierId) : null;
      if (carrier) {
        const theirHome = flagHome[otherTeam(team)];
        const hx = theirHome.x - x, hz = theirHome.z - z, run = Math.hypot(hx, hz) || 1;
        const lead = Math.min(run, Math.abs(carrier.state.speed) * flagRules.interceptLeadS);
        x += hx / run * lead; z += hz / run * lead;
      }
      return { x, z, mission: 'recover' };
    }
    if (job.role === 'escort') {
      // ahead of our carrier on its route home, either side, the third straight ahead: clearing the road, not trailing
      // it; any further escort is its rearguard, between the carrier and the pursuit, either side
      const lane = job.rank === 2 ? 0 : side;
      const ahead = job.rank >= 3 ? -flagRules.escortAheadM : flagRules.escortAheadM;
      return { x: enemyFlag.x + nx * ahead + nz * lane * flagRules.escortSideM,
        z: enemyFlag.z + nz * ahead - nx * lane * flagRules.escortSideM, mission: 'escort' };
    }
    if (job.role === 'defend') {
      // with our carrier running: the return area, clear of its road; otherwise in front of home
      const back = enemyFlag.carrierId ? 35 : 28, spread = enemyFlag.carrierId ? 18 + job.rank * 5 : 24;
      return { x: home.x - nx * back + nz * side * spread, z: home.z - nz * back - nx * side * spread, mission: 'defend' };
    }
    // the raid goes in as a group (raidStageM; round 3, the critic's M5): inside the stage a raider waits on the line
    // until raidMinGroup friends are within raidGroupM of it, or raidWaitS pass; the lift clears the stage (assignFlagRoles)
    const stage = flagRules.raidStageM ?? 0;
    if (stage > 0 && enemyFlag.status === 'home' && squaredDistance(entity, enemyFlag.x, enemyFlag.z) <= stage * stage) {
      let staged = raidStaged.get(entity.id);
      if (!staged) { staged = { atS: placementTimeS, go: false }; raidStaged.set(entity.id, staged); }
      if (!staged.go) {
        const groupSq = (flagRules.raidGroupM ?? 70) ** 2;
        let group = 0;
        for (const friend of teams[team]) {
          if (friend !== entity && activeFriend(friend, team) && squaredDistance(friend, entity.state.pos.x, entity.state.pos.z) <= groupSq) group++;
        }
        if (group >= (flagRules.raidMinGroup ?? 2) || placementTimeS - staged.atS >= (flagRules.raidWaitS ?? 12)) staged.go = true;
      }
      if (!staged.go) {
        const out = stage - (flagRules.raidHoldInM ?? 25), across = side * (10 + 8 * (job.rank >> 1));
        return { x: enemyFlag.x + nx * out + nz * across, z: enemyFlag.z + nz * out - nx * across, mission: 'raid' };
      }
    }
    // One runner touches the flag; the other attackers approach on separated
    // lanes until nearby. This opens crossfire without sacrificing the runner.
    const offset = job.rank > 0 && squaredDistance(entity, enemyFlag.x, enemyFlag.z) > 70 ** 2 ? side * 32 : 0;
    return { x: enemyFlag.x + nz * offset, z: enemyFlag.z - nx * offset, mission: 'raid' };
  };

  // Assignment is a once-per-second team task, not an O(team²) per-bot/per-tick
  // search. Stable ID ordering and distance costs keep both authorities equal.
  const zoneAssignments = new Map<string, ZoneState>();
  let zoneAssignmentAt = -Infinity;
  function assignZones(): void {
    if (placementTimeS < zoneAssignmentAt + 1) return;
    zoneAssignmentAt = placementTimeS;
    zoneAssignments.clear();
    for (const team of ['alpha', 'bravo'] as const) {
      const assigned = new Map<ZoneState, number>();
      for (const zone of zones) {
        const humans = teams[team].filter(e => !e.bot && activeFriend(e, team)
          && squaredDistance(e, zone.x, zone.z) < ZONE_RADIUS_M ** 2).length;
        assigned.set(zone, humans);
      }
      const squad = teams[team].filter(e => e.bot && activeFriend(e, team)).sort((a, b) => a.id < b.id ? -1 : 1);
      for (const bot of squad) {
        let best: ZoneState | null = null, bestCost = Infinity;
        for (const zone of zones) {
          const cost = Math.sqrt(squaredDistance(bot, zone.x, zone.z)) + (assigned.get(zone) ?? 0) * 150
            + (zone.owner === team && !zone.contested ? 300 : 0) - (zone.contested ? 120 : 0);
          if (cost < bestCost) { best = zone; bestCost = cost; }
        }
        if (best) { zoneAssignments.set(bot.id, best); assigned.set(best, (assigned.get(best) ?? 0) + 1); }
      }
    }
  }
  const zoneBotTarget = (entity: Entity, team: ObjectiveTeam): ObjectivePoint | null => {
    assignZones();
    const assigned = zoneAssignments.get(entity.id);
    if (assigned) return { x: assigned.x, z: assigned.z };
    let best: ZoneState | null = null, bestDistance = Infinity;
    for (const zone of zones) {
      if (zone.owner === team && !zone.contested) continue;
      const distance = squaredDistance(entity, zone.x, zone.z);
      if (distance < bestDistance) { bestDistance = distance; best = zone; }
    }
    return best ? { x: best.x, z: best.z } : null;
  };

  // Turbo Ball bots (gameplay-modes-228; the ruleset's ballBots): roles are dealt once a second per team in id order —
  // `strikers` on the ball's intercept point (the incumbents keep it strikerHoldS unless a teammate is swapM closer),
  // a keeper off the own goal, screens between the own goal and the ball, the rest on the wings — and at most
  // crowdCap of a team stand within crowdM of the ball. The ball is public.
  const ballRules = ruleset.ballBots ?? matchRulesetFor('turbo_ball').ballBots!;
  type BallRole = 'striker' | 'support' | 'keeper' | 'screen' | 'wing';
  const ballRoles = new Map<string, { role: BallRole; rank: number }>();
  const strikerUntil = new Map<string, number>();
  let ballRolesAt = -Infinity;
  const intercept = { x: 0, z: 0 };
  /**
   * Where the ball will be when this hull reaches it: P(t) = ball + v·τ(1 − e^(−t/τ)) (the drag law, τ = BALL_DRAG_TAU_S),
   * t the hull's ETA at its pace, iterated leadIterations times and clamped to leadMaxS; the world margin bounds it.
   */
  function ballInterceptFor(entity: Entity): { x: number; z: number } {
    const speed = Math.max(10, Math.abs(entity.state.speed));
    let t = Math.min(ballRules.leadMaxS, Math.sqrt(squaredDistance(entity, ball!.x, ball!.z)) / speed);
    for (let k = 0; k < ballRules.leadIterations; k++) {
      const coast = BALL_DRAG_TAU_S * (1 - Math.exp(-t / BALL_DRAG_TAU_S));
      intercept.x = ball!.x + ball!.vx * coast;
      intercept.z = ball!.z + ball!.vz * coast;
      t = Math.min(ballRules.leadMaxS, Math.sqrt(squaredDistance(entity, intercept.x, intercept.z)) / speed);
    }
    const coast = BALL_DRAG_TAU_S * (1 - Math.exp(-t / BALL_DRAG_TAU_S));
    intercept.x = Math.max(-WORLD_MARGIN_M, Math.min(WORLD_MARGIN_M, ball!.x + ball!.vx * coast));
    intercept.z = Math.max(-WORLD_MARGIN_M, Math.min(WORLD_MARGIN_M, ball!.z + ball!.vz * coast));
    return intercept;
  }
  function assignBallRoles(): void {
    if (!ball || placementTimeS < ballRolesAt + 1) return;
    ballRolesAt = placementTimeS;
    ballRoles.clear();
    for (const team of ['alpha', 'bravo'] as const) {
      const squad = teams[team].filter((e) => e.bot && activeFriend(e, team)).sort((a, b) => (a.id < b.id ? -1 : 1));
      if (!squad.length) continue;
      const own = goals.find((goal) => goal.team === team) ?? centers[team];
      const reach = (e: Entity): number => Math.sqrt(squaredDistance(e, ball!.x, ball!.z));
      const byReach = squad.slice().sort((a, b) => reach(a) - reach(b) || (a.id < b.id ? -1 : 1));
      const strikers: Entity[] = [];
      for (const e of squad) {
        const until = strikerUntil.get(e.id);
        if (until == null || placementTimeS >= until) continue;
        // an incumbent keeps the ball unless a free teammate is swapM closer
        const closer = byReach.find((o) => !strikerUntil.has(o.id) && reach(o) + ballRules.swapM < reach(e));
        if (!closer && strikers.length < ballRules.strikers) strikers.push(e);
      }
      for (const e of byReach) {
        if (strikers.length >= ballRules.strikers) break;
        if (!strikers.includes(e)) { strikers.push(e); strikerUntil.set(e.id, placementTimeS + ballRules.strikerHoldS); }
      }
      for (const e of squad) if (!strikers.includes(e)) strikerUntil.delete(e.id);
      strikers.sort((a, b) => reach(a) - reach(b) || (a.id < b.id ? -1 : 1));
      strikers.forEach((e, k) => ballRoles.set(e.id, { role: k === 0 ? 'striker' : 'support', rank: k }));
      const rest = squad.filter((e) => !strikers.includes(e));
      const byGoal = rest.slice().sort((a, b) => squaredDistance(a, own.x, own.z) - squaredDistance(b, own.x, own.z) || (a.id < b.id ? -1 : 1));
      const keepers = byGoal.slice(0, ballRules.keepers);
      keepers.forEach((e, k) => ballRoles.set(e.id, { role: 'keeper', rank: k }));
      const field = rest.filter((e) => !keepers.includes(e)).sort((a, b) => reach(a) - reach(b) || (a.id < b.id ? -1 : 1));
      field.forEach((e, k) => ballRoles.set(e.id, k < ballRules.screens ? { role: 'screen', rank: k } : { role: 'wing', rank: k - ballRules.screens }));
    }
  }
  const ballBotTarget = (entity: Entity, team: ObjectiveTeam): BotDestination | null => {
    if (!ball) return null;
    const goal = goals.find(goal => goal.team !== team);
    const own = goals.find(goal => goal.team === team) ?? centers[team];
    if (!goal) return null;
    assignBallRoles();
    const job = ballRoles.get(entity.id) ?? { role: 'wing' as BallRole, rank: 0 };
    const distance = Math.sqrt(squaredDistance(entity, ball.x, ball.z));
    const p = ballInterceptFor(entity);
    const gx = goal.x - p.x, gz = goal.z - p.z, glen = Math.hypot(gx, gz) || 1;
    const nx = gx / glen, nz = gz / glen;
    // a shot at the ball (shootBall): in range, past point blank, the ball inside the cone of the line to the opponent
    // goal; every role may take it when the ruleset says so (round 2: the strikers alone moved the ball too rarely)
    const shot = ballRules.shootBall;
    let shootBall = false;
    if (shot && (shot.everyRole || job.role === 'striker') && distance <= shot.maxRangeM && distance > shot.minRangeM) {
      const dx = ball.x - entity.state.pos.x, dz = ball.z - entity.state.pos.z;
      const cos = (dx * (goal.x - ball.x) + dz * (goal.z - ball.z)) / (distance * (Math.hypot(goal.x - ball.x, goal.z - ball.z) || 1));
      shootBall = cos >= Math.cos(shot.coneDeg * Math.PI / 180);
    }
    const ballFirst = shootBall && !!shot?.overTanks;
    const striking = job.role === 'striker' || job.role === 'support';
    // the ball's copy only for a destination that carries it (round 3, the critic's E-R2-7: every role built one a call)
    const live = striking || shootBall ? { x: ball.x, y: ball.y, z: ball.z } : null;
    if (striking) {
      if (job.role === 'support') {
        const side = (job.rank + (team === 'alpha' ? 0 : 1)) % 2 ? 1 : -1;
        return { x: p.x - nx * ballRules.supportBackM + nz * side * ballRules.supportSideM,
          z: p.z - nz * ballRules.supportBackM - nx * side * ballRules.supportSideM, mission: 'striker', ball: live, shootBall, ballFirst };
      }
      const bx = entity.state.pos.x - p.x, bz = entity.state.pos.z - p.z;
      const along = bx * nx + bz * nz, lateral = bx * nz - bz * nx;
      // Go around from the wrong side, then line up centrally behind the ball. Keep pushing through contact: a
      // six-metre arrival stop cannot be used as the destination when the ball itself needs a physical ram.
      if (along > -ballRules.lineUpM || Math.abs(lateral) > ballRules.lineUpM) {
        const side = lateral >= 0 ? 1 : -1;
        const offset = along > -ballRules.lineUpM ? side * ballRules.goRoundM : 0;
        return { x: p.x - nx * ballRules.behindM + nz * offset, z: p.z - nz * ballRules.behindM - nx * offset, mission: 'striker', ball: live, shootBall, ballFirst };
      }
      return { x: p.x + nx * ballRules.throughM, z: p.z + nz * ballRules.throughM, mission: 'striker', ball: live, shootBall, ballFirst };
    }
    const ox = ball.x - own.x, oz = ball.z - own.z, olen = Math.hypot(ox, oz) || 1;
    const ux = ox / olen, uz = oz / olen;
    let x: number, z: number, mission: BotMission = 'screen';
    if (job.role === 'keeper') {
      x = own.x + ux * Math.min(ballRules.keeperM, olen * 0.5); z = own.z + uz * Math.min(ballRules.keeperM, olen * 0.5);
      mission = 'keeper';
    } else {
      const weight = job.role === 'screen' ? (job.rank === 0 ? ballRules.screenNear : ballRules.screenFar) : 0.5;
      const side = job.rank % 2 ? 1 : -1;
      const wide = job.role === 'screen' ? ballRules.screenSideM : ballRules.wingM + ballRules.wingStepM * Math.floor(job.rank / 2);
      x = own.x + ox * weight + uz * side * wide; z = own.z + oz * weight - ux * side * wide;
    }
    // the crowd cap: only the strikers and the first screen close on the ball; the rest stand off it
    const crowded = !(job.role === 'screen' && job.rank === 0 && ballRules.crowdCap > ballRules.strikers);
    const bx = x - ball.x, bz = z - ball.z, bd = Math.hypot(bx, bz);
    const standOff = ballRules.crowdM + ballRules.crowdMarginM;
    if (crowded && bd < standOff) {
      const fx = bd > 0.5 ? bx / bd : -ux, fz = bd > 0.5 ? bz / bd : -uz;
      x = ball.x + fx * standOff; z = ball.z + fz * standOff;
    }
    return shootBall ? { x, z, mission, ball: live, shootBall, ballFirst } : { x, z, mission };
  };

  // ------------------------------------------------------------ the honest hunt (gameplay-modes-228) ---
  // What each side has seen: refreshed from the builders' spotting hook every HUNT_RULES.intelRefreshS. The hunt routes and the
  // bots' honest search read only this; without a hook (headless fixtures) every living enemy counts as seen.
  let intelAt = -Infinity;
  const spottedBy = (target: Entity, side: ObjectiveTeam): boolean => (spotting ? spotting.isSpotted(target.id, side) : true);
  function refreshIntel(timeS: number): void {
    if (timeS < intelAt + HUNT_RULES.intelRefreshS) return;
    intelAt = timeS;
    for (const side of ['alpha', 'bravo'] as const) {
      for (const target of teams[otherTeam(side)]) {
        if (target.modeActive === false || target.combat.destroyed || !spottedBy(target, side)) continue;
        let seen = sightings[side].get(target.id);
        if (!seen) { seen = { id: target.id, x: 0, z: 0, atS: 0 }; sightings[side].set(target.id, seen); }
        seen.x = target.state.pos.x; seen.z = target.state.pos.z; seen.atS = timeS;
      }
    }
  }
  /** The side's freshest sighting within HUNT_RULES.lastSeenMaxS (ties: nearest to the point), or null. */
  function freshestFor(side: ObjectiveTeam, x: number, z: number): Sighting | null {
    let best: Sighting | null = null, bestD = Infinity;
    for (const seen of sightings[side].values()) {
      const target = entityById.get(seen.id);
      // a sighting of a hull since destroyed, or since converted to this side, is no lead
      if (!target || target.combat.destroyed || target.modeActive === false || teamOf(target) === side) continue;
      if (placementTimeS - seen.atS > HUNT_RULES.lastSeenMaxS) continue;
      const d = (seen.x - x) ** 2 + (seen.z - z) ** 2;
      if (!best || seen.atS > best.atS || (seen.atS === best.atS && d < bestD)) { best = seen; bestD = d; }
    }
    return best;
  }
  /**
   * Hunters are dealt their quarry once a second in id order: the nearest opponent the side spots, at the cost of
   * distance + crowdPenaltyM per hunter already on it beyond its fair share; else the side's freshest sighting; else a
   * seeded sweep round the last contact (or the opponents' deployment). Until laneUntilM from it each hunter takes a
   * lane: a lateral offset by rank, flankShare of them on arcs of ±flankDeg, so they arrive from several bearings.
   */
  const huntPlan = new Map<string, { x: number; z: number }>();
  const huntLoad = new Map<string, number>();
  let huntPlanAt = -Infinity;
  const lastContact = { x: 0, z: 0, set: false, atS: -Infinity };
  function planHunt(side: ObjectiveTeam, hunters: Entity[]): void {
    const quarry = teams[otherTeam(side)].filter((t) => t.modeActive !== false && !t.combat.destroyed && spottedBy(t, side));
    huntLoad.clear();
    const fair = quarry.length ? Math.ceil(hunters.length / quarry.length) : 0;
    hunters.forEach((hunter, rank) => {
      let plan = huntPlan.get(hunter.id);
      if (!plan) { plan = { x: 0, z: 0 }; huntPlan.set(hunter.id, plan); }
      let best: Entity | null = null, bestCost = Infinity;
      for (const t of quarry) {
        const load = huntLoad.get(t.id) ?? 0;
        const d = Math.sqrt(squaredDistance(hunter, t.state.pos.x, t.state.pos.z));
        const cost = d + (d > HUNT_RULES.spreadBeyondM ? HUNT_RULES.crowdPenaltyM * Math.max(0, load + 1 - fair) : 0);
        if (cost < bestCost) { bestCost = cost; best = t; }
      }
      let tx: number, tz: number;
      if (best) {
        huntLoad.set(best.id, (huntLoad.get(best.id) ?? 0) + 1);
        tx = best.state.pos.x; tz = best.state.pos.z;
        lastContact.x = tx; lastContact.z = tz; lastContact.set = true; lastContact.atS = placementTimeS;
      } else {
        const seen = freshestFor(side, hunter.state.pos.x, hunter.state.pos.z);
        if (seen) { tx = seen.x; tz = seen.z; } else {
          // the sweep: a seeded bearing per hunter and sweep epoch round the last contact (the opponents' deployment
          // before any); a director arrival first drives on to its lead point (HUNT_RULES.lead) and then spirals out round
          // it; once the side's contact is sweepStaleS old any other hunter spirals out round where it rose instead
          // (localSweep: firstM, then stepM more each epoch, at most maxM) — its own position and orders, no one else's
          const epoch = Math.floor(placementTimeS / HUNT_RULES.sweepEpochS);
          const angle = (Math.imul((rank + 1) * 2654435761, epoch + 7) >>> 0) / 4294967296 * Math.PI * 2;
          const anchor = huntAnchor.get(hunter.id);
          const stale = !lastContact.set || placementTimeS - lastContact.atS > HUNT_RULES.sweepStaleS;
          // the hunter's own lead outranks a side contact older than its arrival (or stale)
          const own = !!anchor && (stale || anchor.atS > lastContact.atS);
          if (own && anchor && Number.isFinite(anchor.lx)
            && squaredDistance(hunter, anchor.lx, anchor.lz) <= HUNT_RULES.lead.arriveM ** 2) {
            // there: the sweep spirals out round the lead point from now on
            anchor.x = anchor.lx; anchor.z = anchor.lz; anchor.atS = placementTimeS; anchor.lx = NaN; anchor.lz = NaN; anchor.swept = true;
          }
          if (own && anchor && Number.isFinite(anchor.lx)) {
            tx = anchor.lx; tz = anchor.lz;
          } else if (anchor && ((own && anchor.swept) || (stale && lastContact.set))) {
            const local = HUNT_RULES.localSweep;
            const ring = Math.min(local.maxM, local.firstM + local.stepM * Math.floor((placementTimeS - anchor.atS) / HUNT_RULES.sweepEpochS));
            tx = anchor.x + Math.sin(angle) * ring; tz = anchor.z + Math.cos(angle) * ring;
          } else {
            const around = lastContact.set ? lastContact : centers[otherTeam(side)];
            tx = around.x + Math.sin(angle) * HUNT_RULES.sweepRingM; tz = around.z + Math.cos(angle) * HUNT_RULES.sweepRingM;
          }
        }
      }
      const dx = hunter.state.pos.x - tx, dz = hunter.state.pos.z - tz, d = Math.hypot(dx, dz) || 1;
      if (d > HUNT_RULES.laneUntilM) {
        const flank = (rank % 5 === 1 || rank % 5 === 3) && HUNT_RULES.flankShare > 0;
        const sign = rank % 2 === 0 ? 1 : -1;
        if (flank) {
          // an arc: aim at the point the line to the quarry makes when swung ±flankDeg, halfway out
          const a = Math.atan2(dx, dz) + sign * HUNT_RULES.flankDeg * Math.PI / 180;
          tx += Math.sin(a) * d * 0.5; tz += Math.cos(a) * d * 0.5;
        } else {
          const lane = HUNT_RULES.laneMinM + (HUNT_RULES.laneMaxM - HUNT_RULES.laneMinM) * ((rank * 0.618034) % 1);
          tx += (dz / d) * lane * sign; tz += (-dx / d) * lane * sign;
        }
      }
      plan.x = Math.max(-WORLD_MARGIN_M, Math.min(WORLD_MARGIN_M, tx));
      plan.z = Math.max(-WORLD_MARGIN_M, Math.min(WORLD_MARGIN_M, tz));
    });
  }
  const hunterScratch: Entity[] = [];
  function refreshHunts(): void {
    if (placementTimeS < huntPlanAt + HUNT_RULES.assignEveryS) return;
    huntPlanAt = placementTimeS;
    const side: ObjectiveTeam = 'bravo';
    hunterScratch.length = 0;
    for (const e of teams[side]) if (e.bot && activeFriend(e, side)) hunterScratch.push(e);
    hunterScratch.sort((a, b) => (a.id < b.id ? -1 : 1));
    planHunt(side, hunterScratch);
  }
  const hordeBotTarget = (entity: Entity, team: ObjectiveTeam): BotDestination | null => {
    if (team === 'bravo') {
      refreshHunts();
      let plan = huntPlan.get(entity.id);
      if (!plan) { huntPlanAt = -Infinity; refreshHunts(); plan = huntPlan.get(entity.id); } // a fresh arrival or convert
      return plan ? { x: plan.x, z: plan.z, mission: 'hunt' } : null;
    }
    return team === 'alpha' && entity.bot ? hordeAllyTarget(entity) : null;
  };
  /**
   * The Horde's allied bots stay within reach of the humans (allyLeashM of their centroid; beyond it they rejoin as
   * an escort) and hunt only the zombies their side spots within that reach — they no longer drift to the zombie base,
   * which put the next wave on top of the humans — and with none in reach they screen the humans (allyScreenM).
   */
  function hordeAllyTarget(entity: Entity): BotDestination | null {
    let cx = 0, cz = 0, n = 0;
    for (const e of teams.alpha) if (!e.bot && activeFriend(e, 'alpha')) { cx += e.state.pos.x; cz += e.state.pos.z; n++; }
    if (!n) for (const e of teams.alpha) if (activeFriend(e, 'alpha')) { cx += e.state.pos.x; cz += e.state.pos.z; n++; }
    if (!n) return null;
    cx /= n; cz /= n;
    const leash = hordeRules.allyLeashM;
    if (squaredDistance(entity, cx, cz) > leash * leash) return { x: cx, z: cz, mission: 'escort' };
    let best: Entity | null = null, bestD = Infinity;
    for (const t of teams.bravo) {
      if (t.modeActive === false || t.combat.destroyed || !spottedBy(t, 'alpha')) continue;
      if ((t.state.pos.x - cx) ** 2 + (t.state.pos.z - cz) ** 2 > leash * leash) continue;
      const d = squaredDistance(entity, t.state.pos.x, t.state.pos.z);
      if (d < bestD) { bestD = d; best = t; }
    }
    if (best) return { x: best.state.pos.x, z: best.state.pos.z };
    // the screen (allyScreenM; round 3): between the humans and the threat — the side's freshest sighting of a
    // zombie, else the zombies' deployment (public) — one slot each across it, in id order
    const screen = hordeRules.allyScreenM;
    if (!screen) return null;
    const threat = freshestFor('alpha', cx, cz) ?? centers.bravo;
    const tx = threat.x - cx, tz = threat.z - cz, tl = Math.hypot(tx, tz) || 1, ux = tx / tl, uz = tz / tl;
    let rank = 0, count = 0;
    for (const e of teams.alpha) {
      if (!e.bot || !activeFriend(e, 'alpha')) continue;
      if (e.id < entity.id) rank++;
      count++;
    }
    const across = (rank - (count - 1) / 2) * (hordeRules.allyScreenSpreadM ?? 20);
    return { x: cx + ux * screen + uz * across, z: cz + uz * screen - ux * across, mission: 'escort' };
  }
  /** Infected survivors close ranks: one off their own living centroid by more than survivorRallyM heads back to it. */
  function survivorRallyTarget(entity: Entity): ObjectivePoint | null {
    const rally = ruleset.infectionBots?.survivorRallyM;
    if (!rally) return null;
    let cx = 0, cz = 0, n = 0;
    for (const e of teams.alpha) if (activeFriend(e, 'alpha')) { cx += e.state.pos.x; cz += e.state.pos.z; n++; }
    if (n < 2) return null;
    cx /= n; cz /= n;
    return squaredDistance(entity, cx, cz) > rally * rally ? { x: cx, z: cz } : null;
  }

  // bot philosophy r1 (owner 2026-09-17): enemies standing on the objective rank first for the bots
  const botObjective = (entity: Entity): { x: number; z: number; radiusM: number; mission?: BotMission } | null => {
    const point = botTarget(entity);
    if (!point) return null;
    const radiusM = point.mission === 'recover' ? 3 : objective === 'zone_control' || id === 'frontline_assault' ? ZONE_RADIUS_M
      : id === 'capture_the_flag' ? 20 : id === 'turbo_ball' ? 15 : point.mission === 'hunt' ? 12 : 25;
    return { ...point, radiusM };
  };
  const botTarget = (entity: Entity): BotDestination | null => {
    if (entity.modeActive === false || entity.combat.destroyed) return null;
    const team = teamOf(entity);
    if (escort) return supplyTarget(entity)??escort.target(entity);
    if (id === 'capture_the_flag') return flagBotTarget(entity, team);
    if (objective === 'zone_control') {
      const point = zoneBotTarget(entity, team);
      return point ? { ...point, mission: 'capture' } : null;
    }
    if (id === 'turbo_ball') return ballBotTarget(entity, team);
    if (id === 'endless_horde') return hordeBotTarget(entity, team);
    // the infected hunt (the honest hunt, a labelled mission) when the ruleset says so; the survivors close ranks
    if (ruleset.infection?.hunt && team === 'bravo') return hordeBotTarget(entity, team);
    if (ruleset.infection && team === 'alpha' && entity.bot) return survivorRallyTarget(entity);
    if (id === 'frontline_assault') {
      if (team === 'alpha' && entity.bot) {
        if (regroup) return { x: regroup.x, z: regroup.z, mission: 'assault' };
        planAttack();
        const plan = attackPlan.get(entity.id);
        if (plan) return { x: plan.x, z: plan.z, mission: 'assault' };
      }
      if (team === 'bravo' && counter && counterIds.has(entity.id)) return { x: counter.x, z: counter.z, mission: 'counter' };
      const point = assaultBotTarget();
      if (point && team === 'bravo' && entity.bot) holdSlot(entity, point);
      return point ? { ...point, mission: 'assault' } : null;
    }
    return null;
  };

  const sightingOut = { x: 0, z: 0 }, deploymentOut = { x: 0, z: 0 };
  /** A migrated host takes the wave modes up where the old one left them (the counters, the line, who rests). */
  function restoreWaves(saved: WaveCheckpoint): void {
    wave = saved.wave;
    const inactive = new Set(saved.inactive);
    for (const entity of entities) {
      const rest = inactive.has(entity.id);
      if (rest === (entity.modeActive === false)) continue;
      entity.modeActive = !rest;
      setActive(entity, !rest);
    }
    restedAt.clear(); for (const [key, at] of saved.restedAt) restedAt.set(key, at);
    lastWaveIds = new Set(saved.lastWaveIds);
    if (saved.horde) {
      hordeQueued = saved.horde.queued; hordeSpecial = saved.horde.special; runnerWave = hordeSpecial === 'runner';
      hordeHealthScale = saved.horde.healthScale; nextWaveAtS = saved.horde.nextWaveAtS; nextTrickleAtS = saved.horde.nextTrickleAtS;
      spawnSector = saved.horde.spawnSector; arrivalStalledAtS = saved.horde.stalledAtS; strandedPending = saved.horde.stranded ?? 0;
      strandRecycles.clear(); for (const [id, n] of saved.horde.benched ?? []) strandRecycles.set(id, n);
      strandStrikeQueue.length = 0; strandStrikeQueue.push(...(saved.horde.strikes ?? []));
      pickups.length = 0; pickups.push(...saved.horde.pickups.map((p) => ({ ...p }))); pickupSequence = saved.horde.sequence;
      if (state.horde) {
        state.horde.wave = wave; state.horde.total = hordeWaveTotal(hordeRules, wave, hordeHumans);
        state.horde.healChance = cacheHealChance(ruleset, wave);
      }
      publishHorde();
    }
    if (saved.line) {
      lineIndex = saved.line.index; holdUntilS = saved.line.holdUntilS;
      regroup = saved.line.regroup ? { ...saved.line.regroup } : null;
      counter = saved.line.counter ? { ...saved.line.counter, ids: [...saved.line.counter.ids] } : null;
      counterIds.clear(); if (counter) for (const key of counter.ids) counterIds.add(key);
      freshDefenders = [...saved.line.fresh];
      nextReinforceAtS = saved.line.nextReinforceAtS ?? Infinity;
      allyDownAt.clear(); for (const [key, at] of saved.line.allyDownAt) allyDownAt.set(key, at);
      for (const zone of saved.line.zones) {
        const live = zones.find((candidate) => candidate.id === zone.id);
        if (live) { live.control = zone.control; live.owner = zone.owner; live.contested = zone.contested; }
      }
      attackPlan.clear();
      if (state.line) state.line.index = lineIndex;
      if (state.horde) { state.horde.wave = wave; state.horde.total = lineCount(); }
    }
  }

  return {
    id,
    definition,
    ruleset,
    state,
    usesElimination: id === 'standard' || id === 'realistic',
    recordDestruction(victimId, killerId) {
      if (result || (objective !== 'zone_control' && !['drone', 'gun_game', 'juggernaut', 'realistic', 'ac130'].includes(id)) || !killerId || killerId === victimId || scoredDeaths.has(victimId)) return;
      const victim=entities.find(entity=>entity.id===victimId);
      const killer=entities.find(entity=>entity.id===killerId);
      if (!victim?.combat.destroyed || !killer || victim.modeActive===false || teamOf(victim)===teamOf(killer)) return;
      scoredDeaths.add(victimId);
      const team=teamOf(killer);
      const points = objective === 'zone_control' ? ZONE_DESTRUCTION_POINTS : 1;
      score[team] += points;
      emit('mode_destruction_scored', { team, points, score: score[team] });
      if (ruleset.gunGame) {
        const kills = (weaponKills.get(killerId) ?? 0) + 1;
        weaponKills.set(killerId, kills);
        const stage = Math.floor(kills / ruleset.gunGame.killsPerWeapon);
        if (stage >= GUN_GAME_WEAPONS.length) finish(team, 'weapon_ladder_complete');
        else if (kills % ruleset.gunGame.killsPerWeapon === 0) {
          setWeaponStage(killer, stage);
          emit('mode_weapon_advanced', { id: killerId, stage, name: GUN_GAME_WEAPONS[stage]!.name });
        }
      }
      if (id === 'drone' && score[team] >= scoreTarget) finish(team, 'drone_score_limit');
    },
    step(dt, timeS) {
      if (result) return result;
      placementTimeS = timeS;
      refreshIntel(timeS);
      handleDeathsAndRespawns(timeS);
      stepSupport(timeS);
      if(escort){const outcome=escort.step(timeS,ruleset.timeLimitS??480);if(outcome)return finish(outcome.result,outcome.reason);}
      if (boss && state.boss) {
        state.boss.hp = boss.combat.hp;
        if (boss.combat.destroyed) return finish(otherTeam(teamOf(boss)), 'juggernaut_destroyed');
        if (ruleset.timeLimitS != null && timeS >= ruleset.timeLimitS) return finish(teamOf(boss), 'juggernaut_survived');
      }
      if (state.infection) {
        state.infection.survivors = teams.alpha.length;
        state.infection.infected = teams.bravo.length;
        score.alpha = teams.alpha.length; score.bravo = teams.bravo.length;
        if (!teams.alpha.length) return finish('bravo', 'outbreak_complete');
        if (ruleset.timeLimitS != null && timeS >= ruleset.timeLimitS) return finish('alpha', 'survivors_extracted');
      }
      if (id === 'capture_the_flag') return stepFlags(timeS);
      if (id === 'mars') stepMarsCaches(timeS);
      if (objective === 'zone_control') return stepZones(dt);
      if (id === 'turbo_ball') return stepBall(dt, timeS);
      if (id === 'endless_horde') return stepHorde(timeS);
      if (id === 'frontline_assault') return stepAssault(dt, timeS);
      return null;
    },
    requestSupply,
    tryHitBall(shell) {
      if (!ball || shell.dead || pointSegmentDistanceSq(ball, shell.prevPos, shell.pos)
          > (BALL_RADIUS_M + 0.35) ** 2) return false;
      const magnitude = Math.hypot(shell.vel.x, shell.vel.y, shell.vel.z) || 1;
      ball.vx = shell.vel.x / magnitude * 34;
      ball.vy = Math.max(5, shell.vel.y / magnitude * 20 + 7);
      ball.vz = shell.vel.z / magnitude * 34;
      ball.lastTouchId = shell.shooterId || null;
      ballActiveAtS = placementTimeS;
      shell.dead = true;
      emit('mode_ball_hit', { by: shell.shooterId || null, kind: 'shot' });
      return true;
    },
    botTarget,
    botObjective,
    // the honest search reads these every tick it searches: one scratch point each, read at once by the caller (E8)
    freshestSighting(entity) {
      const seen = freshestFor(teamOf(entity), entity.state.pos.x, entity.state.pos.z);
      if (!seen) return null;
      sightingOut.x = seen.x; sightingOut.z = seen.z;
      return sightingOut;
    },
    enemyDeployment(entity) {
      const at = centers[otherTeam(teamOf(entity))];
      deploymentOut.x = at.x; deploymentOut.z = at.z;
      return deploymentOut;
    },
    captureCheckpoint(elapsedS) {
      // the wave rules the ruleset names (its horde, its assault), never a mode-id literal (round 3, the critic's E-R2-7)
      const waves: WaveCheckpoint | null = ruleset.horde || ruleset.assault ? {
        wave, inactive: entities.filter((entity) => entity.modeActive === false).map((entity) => entity.id),
        restedAt: [...restedAt], lastWaveIds: [...lastWaveIds],
        ...(ruleset.horde ? { horde: { queued: hordeQueued, special: hordeSpecial, healthScale: hordeHealthScale,
          nextWaveAtS, nextTrickleAtS, spawnSector, stalledAtS: arrivalStalledAtS, stranded: strandedPending,
          ...(strandRecycles.size ? { benched: [...strandRecycles] } : {}), ...(strandStrikeQueue.length ? { strikes: [...strandStrikeQueue] } : {}), pickups: pickups.map((p) => ({ ...p })),
          sequence: pickupSequence } } : {}),
        ...(ruleset.assault ? { line: { index: lineIndex, holdUntilS, regroup: regroup ? { ...regroup } : null,
          counter: counter ? { ...counter, ids: [...counter.ids] } : null, fresh: [...freshDefenders],
          nextReinforceAtS: Number.isFinite(nextReinforceAtS) ? nextReinforceAtS : null, allyDownAt: [...allyDownAt],
          zones: zones.map((zone) => ({ id: zone.id, control: zone.control, owner: zone.owner, contested: zone.contested })) } } : {}),
      } : null;
      return { elapsedS, score: { ...score }, weaponKills: [...weaponKills], teams: entities.map(entity => [entity.id, teamOf(entity)]),
        respawns: [...respawnAt].map(([key, value]) => [key, { ...value }]), destroyed: [...destroyed], scored: [...scoredDeaths], ...(escort?{escortRescued:escort.capture(),support:{ammoAt,healAt,sequence:pickupSequence,pickups:pickups.map(p=>({...p}))}}:{}),
        ...(waves ? { waves } : {}) };
    },
    restoreCheckpoint(checkpoint) {
      score.alpha = checkpoint.score.alpha; score.bravo = checkpoint.score.bravo;
      weaponKills.clear(); for (const [key, value] of checkpoint.weaponKills) weaponKills.set(key, value);
      teams.alpha.length = teams.bravo.length = 0;
      const restoredTeams = new Map(checkpoint.teams);
      for (const entity of entities) {
        const team = restoredTeams.get(entity.id) ?? teamOf(entity);
        if (ruleset.infection && team !== teamOf(entity)) spawns.set(entity.id, { ...centers[team] });
        entity.team = team; teams[team].push(entity); stampPhysics(entity);
        if (ruleset.gunGame) setWeaponStage(entity, Math.min(GUN_GAME_WEAPONS.length - 1, Math.floor((weaponKills.get(entity.id) ?? 0) / ruleset.gunGame.killsPerWeapon)));
      }
      respawnAt.clear(); for (const [key, value] of checkpoint.respawns) respawnAt.set(key, { ...value });
      destroyed.clear(); for (const [key, value] of checkpoint.destroyed) destroyed.set(key, value);
      scoredDeaths.clear(); for (const key of checkpoint.scored) scoredDeaths.add(key);
      escort?.restore(checkpoint.escortRescued??[]);
      if(checkpoint.support){ammoAt=checkpoint.support.ammoAt;healAt=checkpoint.support.healAt;pickupSequence=checkpoint.support.sequence;pickups.length=0;pickups.push(...checkpoint.support.pickups.map(p=>({...p})));}
      if (checkpoint.waves) restoreWaves(checkpoint.waves);
    },
    serialize,
  };
}
