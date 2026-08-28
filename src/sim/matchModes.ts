/**
 * Deterministic objective-mode rules shared by browser-hosted, dedicated, and
 * local battles. This module owns no DOM, rendering, transport, or wall clock.
 * All positions are meters and every timer advances from the caller's fixed
 * simulation step.
 */

export const GAME_MODE_IDS = Object.freeze([
  'standard',
  'capture_the_flag',
  'zone_control',
  'turbo_ball',
  'endless_horde',
] as const);

export type GameModeId = typeof GAME_MODE_IDS[number];
export type ObjectiveTeam = 'alpha' | 'bravo';

export interface GameModeDefinition {
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
      id: 'zone_control', label: 'Zone Control', shortLabel: '1000', icon: 'modeZones',
      description: 'Capture and hold three sectors. First team to 1,000 points wins.',
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
  });

const MODE_SET = new Set<string>(GAME_MODE_IDS);
const RESPAWN_S = 6;
const FLAG_RADIUS_M = 8;
const FLAG_CAPTURE_RADIUS_M = 12;
const FLAG_RETURN_S = 18;
const FLAG_SCORE_TARGET = 3;
const ZONE_RADIUS_M = 30;
const ZONE_CAPTURE_S = 8;
const ZONE_POINTS_PER_SECOND = 2;
const ZONE_SCORE_TARGET = 1000;
const BALL_RADIUS_M = 2.2;
const BALL_GOAL_RADIUS_M = 18;
const BALL_SCORE_TARGET = 5;
const BALL_LINEAR_DRAG = 0.992;
const BALL_GRAVITY_MPS2 = 9.81;
const HORDE_INTERMISSION_S = 6;
const HORDE_INITIAL_ACTIVE = 3;
const HORDE_AMMO_CAPACITY = 30;
const HORDE_AMMO_PICKUP = 12;
const PICKUP_RADIUS_M = 7;
const WORLD_MARGIN_M = 420;

interface Vec3Like { x: number; y: number; z: number }

export interface MatchModeEntity {
  id: string;
  team: string;
  bot?: boolean;
  state: { pos: Vec3Like; yaw: number; speed: number };
  combat: {
    hp: number;
    maxHp: number;
    destroyed: boolean;
    modeAmmo?: number | null;
    modeAmmoCapacity?: number | null;
  };
  modeActive?: boolean;
  modeSpeedMultiplier?: number;
}

export interface MatchModeSpawn {
  x: number;
  z: number;
  yaw: number;
}

interface MatchModeHooks {
  revive(entity: MatchModeEntity, spawn: MatchModeSpawn, healthScale: number): void;
  setActive?(entity: MatchModeEntity, active: boolean): void;
  terrainHeight?(x: number, z: number): number;
  emit?(type: string, payload: Record<string, unknown>): void;
}

interface MatchModeControllerOptions extends MatchModeHooks {
  mode?: string;
  entities: MatchModeEntity[];
  seed?: number;
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
  horde: {
    wave: number;
    alive: number;
    total: number;
    nextWaveInS: number;
    healChance: number;
  } | null;
  pickups: PickupState[];
  playerAmmo: number | null;
  playerAmmoCapacity: number | null;
}

export interface MatchModeResult {
  result: ObjectiveTeam | 'draw';
  reason: string;
}

export interface MatchModeController {
  readonly id: GameModeId;
  readonly definition: GameModeDefinition;
  readonly state: MatchModePresentationState;
  readonly usesElimination: boolean;
  step(dt: number, timeS: number): MatchModeResult | null;
  consumeShot(entity: MatchModeEntity): boolean;
  tryHitBall(shell: { dead?: boolean; prevPos: Vec3Like; pos: Vec3Like; vel: Vec3Like;
    shooterId?: string }): boolean;
  botTarget(entity: MatchModeEntity): { x: number; z: number } | null;
  serialize(viewerId?: string | null): MatchModePresentationState;
}

export function normalizeGameMode(value: unknown): GameModeId {
  const id = String(value || 'standard');
  return MODE_SET.has(id) ? id as GameModeId : 'standard';
}

export function gameModeDefinition(value: unknown): GameModeDefinition {
  return GAME_MODE_DEFINITIONS[normalizeGameMode(value)];
}

function teamOf(entity: MatchModeEntity): ObjectiveTeam {
  return entity.team === 'bravo' || entity.team === 'enemy' ? 'bravo' : 'alpha';
}

function otherTeam(team: ObjectiveTeam): ObjectiveTeam {
  return team === 'alpha' ? 'bravo' : 'alpha';
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
export function createMatchModeController({
  mode = 'standard', entities, seed = 6000, revive, setActive = () => {},
  terrainHeight = () => 0, emit = () => {},
}: MatchModeControllerOptions): MatchModeController {
  if (!Array.isArray(entities) || entities.length < 1 || typeof revive !== 'function') {
    throw new TypeError('match mode controller requires entities and a revive hook');
  }
  const id = normalizeGameMode(mode);
  const definition = GAME_MODE_DEFINITIONS[id];
  const rng = seededRandom(seed ^ 0x4d4f4445);
  const spawns = new Map<string, MatchModeSpawn>();
  const entityById = new Map<string, MatchModeEntity>();
  const destroyed = new Map<string, boolean>();
  const respawnAt = new Map<string, number>();
  const teams: Record<ObjectiveTeam, MatchModeEntity[]> = { alpha: [], bravo: [] };
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
    entity.modeSpeedMultiplier = id === 'turbo_ball' ? 1.85 : 1;
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
  const midX = (centers.alpha.x + centers.bravo.x) * 0.5;
  const midZ = (centers.alpha.z + centers.bravo.z) * 0.5;
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
      const x = midX + lateralX * offset;
      const z = midZ + lateralZ * offset;
      return {
        id: `zone-${index + 1}`,
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
    respawns: definition.respawns,
    target: id === 'capture_the_flag' ? FLAG_SCORE_TARGET
      : id === 'zone_control' ? ZONE_SCORE_TARGET
        : id === 'turbo_ball' ? BALL_SCORE_TARGET : null,
    score,
    flags,
    zones,
    ball,
    goals,
    horde: id === 'endless_horde' ? {
      wave, alive: 0, total: 0, nextWaveInS: 0, healChance: 0,
    } : null,
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

  const reviveAtSpawn = (entity: MatchModeEntity, healthScale = 1): void => {
    const spawn = spawns.get(entity.id);
    if (!spawn) return;
    revive(entity, spawn, healthScale);
    entity.modeActive = true;
    entity.modeSpeedMultiplier = id === 'turbo_ball' ? 1.85
      : id === 'endless_horde' && teamOf(entity) === 'bravo'
        ? 1 + Math.min(0.55, (wave - 1) * 0.045) : 1;
    destroyed.set(entity.id, false);
    respawnAt.delete(entity.id);
    setActive(entity, true);
    emit('mode_respawn', { id: entity.id, team: teamOf(entity) });
  };

  const deactivate = (entity: MatchModeEntity): void => {
    entity.modeActive = false;
    entity.combat.destroyed = true;
    entity.state.speed = 0;
    destroyed.set(entity.id, true);
    setActive(entity, false);
  };

  const startHordeWave = (): void => {
    const activeCount = Math.min(hordeEnemies.length,
      HORDE_INITIAL_ACTIVE + Math.floor((wave - 1) / 2));
    const healthScale = 1 + (wave - 1) * 0.16;
    for (let index = 0; index < hordeEnemies.length; index++) {
      const entity = hordeEnemies[index];
      if (index < activeCount) reviveAtSpawn(entity, healthScale);
      else deactivate(entity);
    }
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
    const x = Math.max(-WORLD_MARGIN_M, Math.min(WORLD_MARGIN_M,
      midX + axisX * along + lateralX * lateral));
    const z = Math.max(-WORLD_MARGIN_M, Math.min(WORLD_MARGIN_M,
      midZ + axisZ * along + lateralZ * lateral));
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

  if (id === 'endless_horde') {
    for (const ally of teams.alpha) {
      if (!ally.bot) {
        ally.combat.modeAmmo = HORDE_AMMO_CAPACITY;
        ally.combat.modeAmmoCapacity = HORDE_AMMO_CAPACITY;
      }
    }
    startHordeWave();
  }

  const finish = (winner: ObjectiveTeam | 'draw', reason: string): MatchModeResult => {
    if (!result) {
      result = { result: winner, reason };
      emit('mode_completed', { result: winner, reason });
    }
    return result;
  };

  const handleDeathsAndRespawns = (timeS: number): void => {
    for (const entity of entities) {
      if (entity.modeActive === false) continue;
      const isDead = !!entity.combat.destroyed;
      const wasDead = destroyed.get(entity.id) || false;
      if (isDead && !wasDead) {
        destroyed.set(entity.id, true);
        for (const flag of flags) {
          if (flag.carrierId !== entity.id) continue;
          flag.carrierId = null;
          flag.status = 'dropped';
          flag.x = entity.state.pos.x;
          flag.z = entity.state.pos.z;
          flag.y = terrainHeight(flag.x, flag.z) + 2.5;
          flag.returnAtS = timeS + FLAG_RETURN_S;
          emit('mode_flag_dropped', { team: flag.team, by: entity.id, x: flag.x, z: flag.z });
        }
        if (definition.respawns) respawnAt.set(entity.id, timeS + RESPAWN_S);
      } else if (!isDead && wasDead) {
        destroyed.set(entity.id, false);
      }
      const due = respawnAt.get(entity.id);
      if (due != null && timeS >= due) reviveAtSpawn(entity, 1);
    }
  };

  const stepFlags = (timeS: number): MatchModeResult | null => {
    for (const flag of flags) {
      if (flag.status === 'carried') {
        const carrier = flag.carrierId ? entityById.get(flag.carrierId) : null;
        if (carrier && !carrier.combat.destroyed && carrier.modeActive !== false) {
          flag.x = carrier.state.pos.x;
          flag.y = carrier.state.pos.y + 3.4;
          flag.z = carrier.state.pos.z;
        }
        continue;
      }
      if (flag.status === 'dropped' && flag.returnAtS != null && timeS >= flag.returnAtS) {
        resetFlag(flag);
        emit('mode_flag_returned', { team: flag.team, automatic: true });
      }
      for (const entity of entities) {
        if (entity.modeActive === false || entity.combat.destroyed) continue;
        const team = teamOf(entity);
        if (squaredDistance(entity, flag.x, flag.z) > FLAG_RADIUS_M * FLAG_RADIUS_M) continue;
        if (team === flag.team) {
          if (flag.status === 'dropped') {
            resetFlag(flag);
            emit('mode_flag_returned', { team: flag.team, by: entity.id });
          }
          continue;
        }
        flag.status = 'carried';
        flag.carrierId = entity.id;
        flag.returnAtS = null;
        emit('mode_flag_taken', { team: flag.team, by: entity.id });
        break;
      }
    }
    for (const entity of entities) {
      if (entity.modeActive === false || entity.combat.destroyed) continue;
      const team = teamOf(entity);
      const enemyFlag = flags.find((flag) => flag.carrierId === entity.id);
      const ownFlag = flags.find((flag) => flag.team === team);
      if (!enemyFlag || !ownFlag || ownFlag.status !== 'home') continue;
      const base = centers[team];
      if (squaredDistance(entity, base.x, base.z) > FLAG_CAPTURE_RADIUS_M ** 2) continue;
      score[team]++;
      resetFlag(enemyFlag);
      emit('mode_flag_captured', { team, by: entity.id, score: score[team] });
      if (score[team] >= FLAG_SCORE_TARGET) return finish(team, 'flag_limit');
    }
    return null;
  };

  const stepZones = (dt: number): MatchModeResult | null => {
    for (const zone of zones) {
      let alpha = 0;
      let bravo = 0;
      for (const entity of entities) {
        if (entity.modeActive === false || entity.combat.destroyed ||
            squaredDistance(entity, zone.x, zone.z) > ZONE_RADIUS_M ** 2) continue;
        if (teamOf(entity) === 'alpha') alpha++;
        else bravo++;
      }
      zone.contested = alpha > 0 && bravo > 0;
      if (!zone.contested && (alpha > 0 || bravo > 0)) {
        const direction = alpha > 0 ? 1 : -1;
        const count = Math.max(alpha, bravo);
        zone.control = Math.max(-1, Math.min(1,
          zone.control + direction * dt * (1 + (count - 1) * 0.35) / ZONE_CAPTURE_S));
        const previousOwner = zone.owner;
        zone.owner = zone.control >= 0.999 ? 'alpha' : zone.control <= -0.999 ? 'bravo' : null;
        if (zone.owner && zone.owner !== previousOwner) {
          emit('mode_zone_captured', { zoneId: zone.id, team: zone.owner });
        }
      }
      if (zone.owner) score[zone.owner] += dt * ZONE_POINTS_PER_SECOND;
    }
    if (score.alpha >= ZONE_SCORE_TARGET || score.bravo >= ZONE_SCORE_TARGET) {
      return finish(score.alpha === score.bravo ? 'draw'
        : score.alpha > score.bravo ? 'alpha' : 'bravo', 'score_limit');
    }
    return null;
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

  const stepBall = (dt: number, timeS: number): MatchModeResult | null => {
    if (!ball) return null;
    for (const entity of entities) {
      if (entity.modeActive === false || entity.combat.destroyed) continue;
      const dx = ball.x - entity.state.pos.x;
      const dz = ball.z - entity.state.pos.z;
      const distance = Math.hypot(dx, dz);
      if (distance > 6.5 || timeS - lastBallTouchS < 0.12) continue;
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
    }
    ball.vy -= BALL_GRAVITY_MPS2 * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.z += ball.vz * dt;
    ball.vx *= BALL_LINEAR_DRAG;
    ball.vz *= BALL_LINEAR_DRAG;
    const floor = terrainHeight(ball.x, ball.z) + BALL_RADIUS_M;
    if (ball.y < floor) {
      ball.y = floor;
      if (ball.vy < -1) ball.vy *= -0.58;
      else ball.vy = 0;
    }
    if (Math.abs(ball.x) > WORLD_MARGIN_M) {
      ball.x = Math.sign(ball.x) * WORLD_MARGIN_M;
      ball.vx *= -0.65;
    }
    if (Math.abs(ball.z) > WORLD_MARGIN_M) {
      ball.z = Math.sign(ball.z) * WORLD_MARGIN_M;
      ball.vz *= -0.65;
    }
    let scoringTeam: ObjectiveTeam | null = null;
    if ((ball.x - centers.alpha.x) ** 2 + (ball.z - centers.alpha.z) ** 2
        <= BALL_GOAL_RADIUS_M ** 2) scoringTeam = 'bravo';
    else if ((ball.x - centers.bravo.x) ** 2 + (ball.z - centers.bravo.z) ** 2
        <= BALL_GOAL_RADIUS_M ** 2) scoringTeam = 'alpha';
    if (!scoringTeam) return null;
    score[scoringTeam]++;
    emit('mode_goal_scored', {
      team: scoringTeam, by: ball.lastTouchId, score: score[scoringTeam],
    });
    resetBall();
    for (const entity of entities) reviveAtSpawn(entity, 1);
    return score[scoringTeam] >= BALL_SCORE_TARGET
      ? finish(scoringTeam, 'goal_limit') : null;
  };

  const stepHorde = (timeS: number): MatchModeResult | null => {
    const humansAlive = teams.alpha.some((entity) => entity.modeActive !== false &&
      !entity.combat.destroyed && !entity.bot);
    if (!humansAlive) return finish('bravo', 'horde_overrun');
    let alive = 0;
    for (const enemy of hordeEnemies) {
      if (enemy.modeActive !== false && !enemy.combat.destroyed) alive++;
    }
    if (state.horde) {
      state.horde.alive = alive;
      state.horde.nextWaveInS = nextWaveAtS == null ? 0 : Math.max(0, nextWaveAtS - timeS);
    }
    if (alive === 0 && nextWaveAtS == null) {
      nextWaveAtS = timeS + HORDE_INTERMISSION_S;
      spawnPickup();
      emit('mode_wave_cleared', { wave, nextWaveInS: HORDE_INTERMISSION_S });
    }
    if (nextWaveAtS != null && timeS >= nextWaveAtS) {
      wave++;
      startHordeWave();
    }
    for (const pickup of pickups) {
      if (!pickup.active) continue;
      for (const entity of teams.alpha) {
        if (entity.bot || entity.modeActive === false || entity.combat.destroyed ||
            squaredDistance(entity, pickup.x, pickup.z) > PICKUP_RADIUS_M ** 2) continue;
        if (pickup.kind === 'heal') {
          const restored = Math.max(1, Math.round(entity.combat.maxHp * 0.35));
          entity.combat.hp = Math.min(entity.combat.maxHp, entity.combat.hp + restored);
        } else if (entity.combat.modeAmmoCapacity != null) {
          entity.combat.modeAmmo = Math.min(entity.combat.modeAmmoCapacity,
            (entity.combat.modeAmmo || 0) + HORDE_AMMO_PICKUP);
        }
        pickup.active = false;
        emit('mode_pickup_collected', { id: pickup.id, kind: pickup.kind, by: entity.id });
        break;
      }
    }
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
      horde: state.horde ? { ...state.horde } : null,
      pickups: pickups.filter((pickup) => pickup.active).map((pickup) => ({ ...pickup })),
      playerAmmo: viewer?.combat.modeAmmo ?? null,
      playerAmmoCapacity: viewer?.combat.modeAmmoCapacity ?? null,
    };
  };

  return {
    id,
    definition,
    state,
    usesElimination: id === 'standard',
    step(dt, timeS) {
      if (result) return result;
      handleDeathsAndRespawns(timeS);
      if (id === 'capture_the_flag') return stepFlags(timeS);
      if (id === 'zone_control') return stepZones(dt);
      if (id === 'turbo_ball') return stepBall(dt, timeS);
      if (id === 'endless_horde') return stepHorde(timeS);
      return null;
    },
    consumeShot(entity) {
      if (id !== 'endless_horde' || entity.bot || entity.combat.modeAmmo == null) return true;
      if (entity.combat.modeAmmo <= 0) return false;
      entity.combat.modeAmmo--;
      return true;
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
    botTarget(entity) {
      if (entity.modeActive === false || entity.combat.destroyed) return null;
      const team = teamOf(entity);
      if (id === 'capture_the_flag') {
        const carried = flags.find((flag) => flag.carrierId === entity.id);
        if (carried) return { x: centers[team].x, z: centers[team].z };
        const enemyFlag = flags.find((flag) => flag.team === otherTeam(team));
        return enemyFlag ? { x: enemyFlag.x, z: enemyFlag.z } : null;
      }
      if (id === 'zone_control') {
        let best: ZoneState | null = null;
        let bestDistance = Infinity;
        for (const zone of zones) {
          if (zone.owner === team) continue;
          const distance = squaredDistance(entity, zone.x, zone.z);
          if (distance < bestDistance) { bestDistance = distance; best = zone; }
        }
        return best ? { x: best.x, z: best.z } : null;
      }
      if (id === 'turbo_ball' && ball) return { x: ball.x, z: ball.z };
      if (id === 'endless_horde') {
        const targets = team === 'bravo' ? teams.alpha : teams.bravo;
        let nearest: MatchModeEntity | null = null;
        let nearestDistance = Infinity;
        for (const target of targets) {
          if (target.modeActive === false || target.combat.destroyed) continue;
          const distance = squaredDistance(entity, target.state.pos.x, target.state.pos.z);
          if (distance < nearestDistance) { nearestDistance = distance; nearest = target; }
        }
        return nearest ? { x: nearest.state.pos.x, z: nearest.state.pos.z } : null;
      }
      return null;
    },
    serialize,
  };
}
