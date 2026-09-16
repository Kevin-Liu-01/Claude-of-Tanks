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
import type { MatchPlacement } from './matchPlacement.ts';
import { ASSAULT_LINE_FRACTIONS } from './assaultLines.ts';
import { MATCH_MODE_ARENA_HALF_EXTENT_M as WORLD_MARGIN_M } from './matchObjectiveLayouts.ts';
import {
  FLAG_CARRIER_SPEED_SCALE, HORDE_WAVE_REPAIR, RULESET_SCORE_TARGETS, matchRulesetFor, type MatchRuleset, hordeWaveSize } from './matchRuleset.ts';

export const GAME_MODE_IDS = Object.freeze([
  'standard',
  'capture_the_flag',
  'zone_control',
  'turbo_ball',
  'endless_horde',
  'frontline_assault',
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
      description: 'Steal the enemy flag and return it home. First to three captures wins.',
      respawns: true,
    }),
    zone_control: Object.freeze({
      id: 'zone_control', label: 'Zone Control', shortLabel: '750', icon: 'modeZones',
      description: 'Capture and hold three sectors. First team to 750 points wins.',
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
const ZONE_POINTS_PER_SECOND = 2;
const BALL_RADIUS_M = 2.2;
const BALL_GOAL_RADIUS_M = 18;
const BALL_LINEAR_DRAG = 0.992;
const BALL_GRAVITY_MPS2 = 9.81;
const HORDE_INTERMISSION_S = 6;
const PICKUP_RADIUS_M = 7;

interface Vec3Like { x: number; y: number; z: number }
interface ObjectivePoint { x: number; z: number }
type MatchModeEventValue = string | number | boolean | null |
  MatchModeEventValue[] | { [key: string]: MatchModeEventValue };
type MatchModeEventPayload = Record<string, MatchModeEventValue>;

export interface MatchModeEntity {
  id: string;
  team: string;
  bot?: boolean;
  state: { pos: Vec3Like; yaw: number; speed: number };
  combat: {
    hp: number;
    maxHp: number;
    destroyed: boolean;
    ammo: number[];
    ammoCapacity: number[];
  };
  modeActive?: boolean;
  modeSpeedMultiplier?: number;
  /** Ruleset gravity scale (matchRuleset.ts) the movement and ballistics read. */
  modeGravityScale?: number;
}

export interface MatchModeSpawn {
  x: number;
  z: number;
  yaw: number;
}

interface MatchModeHooks<Entity extends MatchModeEntity> {
  revive(entity: Entity, spawn: MatchModeSpawn, healthScale: number): void;
  setActive?(entity: Entity, active: boolean): void;
  terrainHeight?(x: number, z: number): number;
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
}

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
    total: number;
    nextWaveInS: number;
    healChance: number;
  } | null;
  /** frontline_assault: sectors taken so far, the sector count and the final hold countdown. */
  line: { index: number; total: number; holdS: number } | null;
  pickups: PickupState[];
  playerAmmo: number | null;
  playerAmmoCapacity: number | null;
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
  step(dt: number, timeS: number): MatchModeResult | null;
  tryHitBall(shell: { dead?: boolean; prevPos: Vec3Like; pos: Vec3Like; vel: Vec3Like;
    shooterId?: string }): boolean;
  botTarget(entity: Entity): { x: number; z: number } | null;
  serialize(viewerId?: string | null): MatchModePresentationState;
}

export function normalizeGameMode<Value>(value: Value): GameModeId {
  const id = String(value || 'standard');
  return MODE_SET.has(id) ? id as GameModeId : 'standard';
}

export function gameModeDefinition<Value>(value: Value): GameModeDefinition {
  return GAME_MODE_DEFINITIONS[normalizeGameMode(value)];
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
  terrainHeight = () => 0, emit = () => {},
  placement,
  ruleset: rulesetOption,
}: MatchModeControllerOptions<Entity>): MatchModeController<Entity> {
  if (!Array.isArray(entities) || entities.length < 1 || typeof revive !== 'function') {
    throw new TypeError('match mode controller requires entities and a revive hook');
  }
  const id = normalizeGameMode(mode);
  const definition = GAME_MODE_DEFINITIONS[id];
  const ruleset: MatchRuleset = rulesetOption && rulesetOption.mode === id ? rulesetOption : matchRulesetFor(id);
  const baseSpeed = ruleset.speedMultiplier;
  const scoreTarget = scoreTargetForMode(id) ?? Infinity;
  // Physics the ruleset bends: the movement reads modeSpeedMultiplier / modeGravityScale every step,
  // ballistics reads the gravity scale at the muzzle; stamped at start, at every revive, and when a
  // flag changes hands.
  const stampPhysics = (entity: Entity, speed = baseSpeed): void => {
    entity.modeSpeedMultiplier = speed;
    entity.modeGravityScale = ruleset.gravityScale;
  };
  const rng = seededRandom(seed ^ 0x4d4f4445);
  const spawns = new Map<string, MatchModeSpawn>();
  const entityById = new Map<string, Entity>();
  const destroyed = new Map<string, boolean>();
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
    stampPhysics(entity);
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
  const flags: FlagState[] = id === 'capture_the_flag'
    ? (['alpha', 'bravo'] as const).map((team) => ({
      team,
      baseX: centers[team].x,
      baseY: terrainHeight(centers[team].x, centers[team].z) + 0.08,
      baseZ: centers[team].z,
      x: centers[team].x,
      y: terrainHeight(centers[team].x, centers[team].z) + 2.5,
      z: centers[team].z,
      status: 'home',
      carrierId: null,
      returnAtS: null,
    })) : [];
  const zones: ZoneState[] = id === 'zone_control'
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
  const ball: BallState | null = id === 'turbo_ball' ? {
    x: midX, y: terrainHeight(midX, midZ) + BALL_RADIUS_M, z: midZ,
    vx: 0, vy: 0, vz: 0, lastTouchId: null,
  } : null;
  const goals: GoalState[] = id === 'turbo_ball'
    ? (['alpha', 'bravo'] as const).map((team) => ({
      team,
      x: centers[team].x,
      y: terrainHeight(centers[team].x, centers[team].z) + 0.2,
      z: centers[team].z,
    })) : [];
  const pickups: PickupState[] = [];
  const hordeEnemies = teams.bravo.filter((entity) => !!entity.bot);
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
    target: scoreTargetForMode(id),
    score,
    flags,
    zones,
    ball,
    goals,
    // tactical map 2026-09-15: the team spawn centres (the flag bases / goals stand on them in
    // CTF and Turbo Ball; Zone Control marks both, the co-op modes only the human side)
    spawns: (['alpha', 'bravo'] as const).filter((team) => teams[team].length > 0).map((team) => ({
      team, x: centers[team].x, y: terrainHeight(centers[team].x, centers[team].z) + 0.1, z: centers[team].z,
    })),
    horde: id === 'endless_horde' || id === 'frontline_assault' ? {
      wave, alive: 0, total: 0, nextWaveInS: 0, healChance: 0,
    } : null,
    line: id === 'frontline_assault' ? { index: 0, total: ASSAULT_LINE_FRACTIONS.length, holdS: 0 } : null,
    pickups,
    playerAmmo: null,
    playerAmmoCapacity: null,
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
  const reviveAtSpawn = (entity: Entity, healthScale = 1): void => {
    const spawn = spawns.get(entity.id);
    if (!spawn) return;
    const safeSpawn = placement ? placement.respawn(spawn, entity.id,
      entities.filter(other => other !== entity && !other.combat.destroyed && other.modeActive !== false)
        .map(other => ({ x: other.state.pos.x, z: other.state.pos.z, radius: 4.5 }))) : spawn;
    if (!safeSpawn) {
      if (id === 'endless_horde' || id === 'frontline_assault') deactivate(entity);
      respawnAt.set(entity.id, { atS: placementTimeS + 1, healthScale });
      return; // keep pending, but never retry a bounded search at 60 Hz
    }
    revive(entity, safeSpawn, healthScale);
    entity.modeActive = true;
    // wave pressure: Horde / Frontline defenders drive faster every wave (capped at +55 %)
    stampPhysics(entity, (id === 'endless_horde' || id === 'frontline_assault') && teamOf(entity) === 'bravo'
      ? baseSpeed * (1 + Math.min(0.55, (wave - 1) * 0.045)) : baseSpeed);
    destroyed.set(entity.id, false);
    respawnAt.delete(entity.id);
    setActive(entity, true);
    emit('mode_respawn', { id: entity.id, team: teamOf(entity) });
  };

  const deactivate = (entity: Entity): void => {
    entity.modeActive = false;
    entity.combat.destroyed = true;
    entity.state.speed = 0;
    destroyed.set(entity.id, true);
    setActive(entity, false);
  };

  // owner 2026-09-15 ("only 3 tanks every time and the same tanks each round"): every wave draws
  // its hostiles afresh from the pool — a seeded shuffle that puts identities rested last wave
  // first — so consecutive waves share as few vehicles as the pool allows, and the wave grows by
  // the ruleset's law until the whole pool is on the field.
  const hordeRules = ruleset.horde ?? matchRulesetFor('endless_horde').horde!;
  let lastWaveIds = new Set<string>();
  const drawWave = (count: number): Set<Entity> => {
    const order = hordeEnemies.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    // stable: rested identities lead, the shuffled order decides within each band
    order.sort((a, b) => Number(lastWaveIds.has(a.id)) - Number(lastWaveIds.has(b.id)));
    const active = new Set(order.slice(0, Math.min(count, order.length)));
    lastWaveIds = new Set([...active].map((entity) => entity.id));
    return active;
  };
  const fieldWave = (active: Set<Entity>, healthScale: number): void => {
    for (const entity of hordeEnemies) {
      if (active.has(entity)) reviveAtSpawn(entity, healthScale);
      else deactivate(entity);
    }
  };

  const startHordeWave = (): void => {
    const activeCount = Math.min(hordeEnemies.length, hordeWaveSize(hordeRules, wave));
    const healthScale = 1 + (wave - 1) * 0.16;
    fieldWave(drawWave(activeCount), healthScale);
    for (const ally of teams.alpha) {
      if (ally.combat.destroyed) reviveAtSpawn(ally, 1);
    }
    nextWaveAtS = null;
    if (state.horde) {
      state.horde.wave = wave;
      state.horde.total = activeCount;
      state.horde.nextWaveInS = 0;
      state.horde.healChance = Math.max(0.08, 0.62 - (wave - 1) * 0.055);
    }
    emit('mode_wave_started', { wave, enemies: activeCount, healthScale });
  };

  const spawnPickup = (): void => {
    if (!state.horde) return;
    const healChance = state.horde.healChance;
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

  // ----------------------------------------------------- frontline assault ---
  let lineIndex = 0;
  let holdUntilS: number | null = null;
  const liveLine = (): ZoneState | null => zones[Math.min(lineIndex, zones.length - 1)] ?? null;

  const assaultRules = ruleset.assault ?? matchRulesetFor('frontline_assault').assault!;
  const startAssaultWave = (): void => {
    const activeCount = Math.min(hordeEnemies.length,
      assaultRules.initialActive + assaultRules.extraDefenders + lineIndex);
    const healthScale = 1 + lineIndex * assaultRules.hpPerLine + assaultRules.difficultyHp;
    // each sector's counter-attack is a fresh draw from the formation (owner 2026-09-15)
    fieldWave(drawWave(activeCount), healthScale);
    for (const ally of teams.alpha) {
      if (ally.combat.destroyed && ally.bot) reviveAtSpawn(ally, 1);
    }
    if (state.horde) {
      state.horde.wave = wave;
      state.horde.total = activeCount;
      state.horde.nextWaveInS = 0;
      state.horde.healChance = 0;
    }
    emit('mode_wave_started', { wave, enemies: activeCount, healthScale });
  };
  if (id === 'frontline_assault') startAssaultWave();

  const stepAssault = (dt: number, timeS: number): MatchModeResult | null => {
    const humansAlive = teams.alpha.some((entity) => entity.modeActive !== false &&
      !entity.combat.destroyed && !entity.bot);
    if (!humansAlive) return finish('bravo', 'assault_overrun');
    const zone = liveLine();
    if (!zone) return null;
    const occupancy = zoneOccupancy(zone);
    advanceZoneControl(zone, Math.floor(occupancy / 16), occupancy % 16, dt);
    if (state.horde) state.horde.alive = livingHordeEnemyCount();
    if (lineIndex < zones.length - 1) {
      if (zone.owner === 'alpha') {
        lineIndex++;
        wave++;
        if (state.line) state.line.index = lineIndex;
        emit('mode_line_advanced', { line: lineIndex, total: zones.length });
        startAssaultWave();
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

  const assaultBotTarget = (entity: Entity, team: ObjectiveTeam): ObjectivePoint | null => {
    const zone = liveLine();
    if (!zone) return null;
    if (team === 'bravo') {
      // Defenders hold the live sector unless an attacker is closer than it.
      const nearest = hordeBotTarget(entity, team);
      if (nearest && squaredDistance(entity, nearest.x, nearest.z) < squaredDistance(entity, zone.x, zone.z)) return nearest;
    }
    return { x: zone.x, z: zone.z };
  };

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
    dropCarriedFlags(entity, timeS);
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
    stampPhysics(entity, baseSpeed * FLAG_CARRIER_SPEED_SCALE); // the carrier is slower until it scores or falls
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
    const base = centers[team];
    if (squaredDistance(entity, base.x, base.z) > FLAG_CAPTURE_RADIUS_M ** 2) return null;
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

  const advanceZoneControl = (zone: ZoneState, alpha: number, bravo: number, dt: number): void => {
    zone.contested = alpha > 0 && bravo > 0;
    if (zone.contested || (alpha === 0 && bravo === 0)) return;
    const direction = alpha > 0 ? 1 : -1;
    const count = Math.max(alpha, bravo);
    zone.control = Math.max(-1, Math.min(1,
      zone.control + direction * dt * (1 + (count - 1) * 0.35) / ZONE_CAPTURE_S));
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
    ball.y = terrainHeight(midX, midZ) + BALL_RADIUS_M;
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

  const integrateBall = (dt: number): void => {
    if (!ball) return;
    ball.vy -= BALL_GRAVITY_MPS2 * ruleset.gravityScale * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.z += ball.vz * dt;
    ball.vx *= BALL_LINEAR_DRAG;
    ball.vz *= BALL_LINEAR_DRAG;
  };

  const bounceBallFromTerrain = (): void => {
    if (!ball) return;
    const floor = terrainHeight(ball.x, ball.z) + BALL_RADIUS_M;
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
    const atAlphaGoal = (ball.x - centers.alpha.x) ** 2 + (ball.z - centers.alpha.z) ** 2
      <= BALL_GOAL_RADIUS_M ** 2;
    if (atAlphaGoal) return 'bravo';
    const atBravoGoal = (ball.x - centers.bravo.x) ** 2 + (ball.z - centers.bravo.z) ** 2
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
    for (const entity of entities) reviveAtSpawn(entity, 1);
    return score[scoringTeam] >= scoreTarget
      ? finish(scoringTeam, 'goal_limit') : null;
  };

  const stepBall = (dt: number, timeS: number): MatchModeResult | null => {
    if (!ball) return null;
    for (const entity of entities) touchBallWithEntity(entity, timeS);
    integrateBall(dt);
    bounceBallFromTerrain();
    containBallInWorld();
    const scoringTeam = ballScoringTeam();
    return scoringTeam ? completeBallGoal(scoringTeam) : null;
  };

  const livingHordeEnemyCount = (): number => {
    let alive = 0;
    for (const enemy of hordeEnemies) {
      if (respawnAt.has(enemy.id) || (enemy.modeActive !== false && !enemy.combat.destroyed)) alive++;
    }
    return alive;
  };

  const updateHordeIntermission = (alive: number, timeS: number): void => {
    if (state.horde) {
      state.horde.alive = alive;
      state.horde.nextWaveInS = nextWaveAtS == null ? 0 : Math.max(0, nextWaveAtS - timeS);
    }
    if (alive === 0 && nextWaveAtS == null) {
      nextWaveAtS = timeS + HORDE_INTERMISSION_S;
      spawnPickup();
      // the survivors patch up between waves (HORDE_WAVE_REPAIR of maximum hull)
      let repaired = 0;
      for (const ally of teams.alpha) {
        if (ally.combat.destroyed || ally.modeActive === false) continue;
        const next = Math.min(ally.combat.maxHp, ally.combat.hp + Math.round(ally.combat.maxHp * HORDE_WAVE_REPAIR));
        repaired += next - ally.combat.hp;
        ally.combat.hp = next;
      }
      emit('mode_wave_cleared', { wave, nextWaveInS: HORDE_INTERMISSION_S, repaired });
    }
    if (nextWaveAtS != null && timeS >= nextWaveAtS) {
      wave++;
      startHordeWave();
    }
  };

  const collectPickup = (pickup: PickupState, entity: Entity): boolean => {
    if (entity.bot || entity.modeActive === false || entity.combat.destroyed ||
        squaredDistance(entity, pickup.x, pickup.z) > PICKUP_RADIUS_M ** 2) return false;
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

  const stepHorde = (timeS: number): MatchModeResult | null => {
    const humansAlive = teams.alpha.some((entity) => entity.modeActive !== false &&
      !entity.combat.destroyed && !entity.bot);
    if (!humansAlive) return finish('bravo', 'horde_overrun');
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
    };
  };

  const flagBotTarget = (entity: Entity, team: ObjectiveTeam): ObjectivePoint | null => {
    const carried = flagCarriedBy(entity.id);
    if (carried) return { x: centers[team].x, z: centers[team].z };
    const enemyFlag = flagForTeam(otherTeam(team));
    return enemyFlag ? { x: enemyFlag.x, z: enemyFlag.z } : null;
  };

  const zoneBotTarget = (entity: Entity, team: ObjectiveTeam): ObjectivePoint | null => {
    let best: ZoneState | null = null;
    let bestDistance = Infinity;
    for (const zone of zones) {
      if (zone.owner === team) continue;
      const distance = squaredDistance(entity, zone.x, zone.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = zone;
      }
    }
    return best ? { x: best.x, z: best.z } : null;
  };

  const hordeBotTarget = (entity: Entity, team: ObjectiveTeam): ObjectivePoint | null => {
    const targets = team === 'bravo' ? teams.alpha : teams.bravo;
    let nearest: Entity | null = null;
    let nearestDistance = Infinity;
    for (const target of targets) {
      if (target.modeActive === false || target.combat.destroyed) continue;
      const distance = squaredDistance(entity, target.state.pos.x, target.state.pos.z);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = target;
      }
    }
    return nearest ? { x: nearest.state.pos.x, z: nearest.state.pos.z } : null;
  };

  const botTarget = (entity: Entity): ObjectivePoint | null => {
    if (entity.modeActive === false || entity.combat.destroyed) return null;
    const team = teamOf(entity);
    if (id === 'capture_the_flag') return flagBotTarget(entity, team);
    if (id === 'zone_control') return zoneBotTarget(entity, team);
    if (id === 'turbo_ball' && ball) return { x: ball.x, z: ball.z };
    if (id === 'endless_horde') return hordeBotTarget(entity, team);
    if (id === 'frontline_assault') return assaultBotTarget(entity, team);
    return null;
  };

  return {
    id,
    definition,
    ruleset,
    state,
    usesElimination: id === 'standard',
    step(dt, timeS) {
      if (result) return result;
      placementTimeS = timeS;
      handleDeathsAndRespawns(timeS);
      if (id === 'capture_the_flag') return stepFlags(timeS);
      if (id === 'zone_control') return stepZones(dt);
      if (id === 'turbo_ball') return stepBall(dt, timeS);
      if (id === 'endless_horde') return stepHorde(timeS);
      if (id === 'frontline_assault') return stepAssault(dt, timeS);
      return null;
    },
    tryHitBall(shell) {
      if (!ball || shell.dead || pointSegmentDistanceSq(ball, shell.prevPos, shell.pos)
          > (BALL_RADIUS_M + 0.35) ** 2) return false;
      const magnitude = Math.hypot(shell.vel.x, shell.vel.y, shell.vel.z) || 1;
      ball.vx = shell.vel.x / magnitude * 34;
      ball.vy = Math.max(5, shell.vel.y / magnitude * 20 + 7);
      ball.vz = shell.vel.z / magnitude * 34;
      ball.lastTouchId = shell.shooterId || null;
      shell.dead = true;
      emit('mode_ball_hit', { by: shell.shooterId || null, kind: 'shot' });
      return true;
    },
    botTarget,
    serialize,
  };
}
