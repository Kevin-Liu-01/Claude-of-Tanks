/**
 * One bot construction for both drivers (268, Main 2026-11-01; docs/ARCHITECTURE.md "One core, two drivers"): the solo
 * battle (game/state.ts createBattleBot) and the authority (sim/authoritativeMatch.ts initializeBot) build every bot here,
 * from the match seed and the bot's roster index: its controller's seeded streams, its difficulty and doctrine, the
 * enemies and allies it reads (a wreck is neither), what its side has spotted, its objective and intel, its route
 * planner, and its opening route (the solo battle's doctrine lanes, led by the map's authored spawns). The same battle
 * builds the same bots on either driver (src/sim/driverStepParity.selftest.mjs runs the real AI on both).
 */
import * as detMath from '../sim/detMath.ts';
import { isGunship } from '../sim/aerialCombat.ts';
import type { AerialView } from '../sim/aerialCombat.ts';
import { planBotRoute } from '../sim/botRoutePlanner.ts';
import type { BotRoutePoint } from '../sim/botRoutePlanner.ts';
import { rulesetBotDifficulty, rulesetBotDoctrine } from '../sim/matchRuleset.ts';
import type { MatchRuleset } from '../sim/matchRuleset.ts';
import { createAI, mulberry32, roleOf } from './ai.ts';

type AiOptions = Parameters<typeof createAI>[1];
type AiDeps = AiOptions['deps'];
type BotController = ReturnType<typeof createAI>;
type BotDifficulty = NonNullable<AiOptions['difficulty']>;
type BotNavigation = NonNullable<Parameters<typeof planBotRoute>[0]>['navigation'];
type OpeningRole = ReturnType<typeof roleOf>;
type Side = 'alpha' | 'bravo';

/** A hull a bot drives or reads: the solo battle's entity and the authority's both carry these. */
type BotEntity = Parameters<typeof createAI>[0] & { combat: { destroyed?: boolean }; aerial?: AerialView };

/** What a driver hands the construction, read live where the battle changes under the bot. */
export interface BotMatch {
  seed: number;
  ruleset(): Pick<MatchRuleset, 'bots' | 'horde' | 'assault'>;
  /** The battle's hulls: the solo battle's tanks, the authority's entities. */
  tanks(): readonly BotEntity[];
  /** The side's spotting (sim/spotting.ts), or null where the battle runs none (every hull is seen). */
  spotting(): { isSpotted(id: string, team: string, receiver: unknown): boolean } | null;
  /** The mode's controller: a bot's objective and its side's intel. */
  mode(): {
    botObjective(entity: BotEntity): ReturnType<NonNullable<AiDeps['getObjective']>>;
    freshestSighting(entity: BotEntity): ReturnType<NonNullable<NonNullable<AiDeps['intel']>['freshestContact']>>;
    enemyDeployment(entity: BotEntity): ReturnType<NonNullable<NonNullable<AiDeps['intel']>['enemyDeployment']>>;
    /** Air Support: the nearest enemy aircraft in the air (Infinity outside the mode), and a led shot at it. */
    airThreatM(entity: BotEntity): number;
    airShot(entity: BotEntity, roundMps: number, maxPitchRad: number): { x: number; y: number; z: number } | null;
  } | null;
  heightField: AiDeps['heightField'];
  raycast: AiDeps['raycast'];
  getObstacles: AiDeps['getObstacles'];
  queryObstacles: AiDeps['queryObstacles'];
  navigation: BotNavigation;
}

/** A bot's seeded streams: its controller's, its route search's and its opening route's, from the match seed and its roster index. */
function botSeeds(matchSeed: number, index: number): { controller: number; search: number; route: number } {
  return { controller: matchSeed + 41000 + index * 997, search: matchSeed + 43000 + index * 991, route: matchSeed + 45000 + index * 983 };
}

const sideOf = (team: string): Side => (team === 'enemy' || team === 'bravo' ? 'bravo' : 'alpha');

/** A bot's controller (game/ai.ts createAI): `difficulty` is the battle's tier for it, stepped down by the ruleset. */
export function createBotController(entity: BotEntity, index: number, difficulty: BotDifficulty, match: BotMatch): BotController {
  const seeds = botSeeds(match.seed, index);
  const searchRng = mulberry32(seeds.search);
  const enemies: BotEntity[] = [];
  const allies: BotEntity[] = [];
  const navigation = match.navigation;
  return createAI(entity, {
    difficulty: rulesetBotDifficulty(match.ruleset(), entity.team, difficulty),
    // the side's doctrine, read live: an Infected convert plays the infected's table from its first tick
    doctrine: () => rulesetBotDoctrine(match.ruleset(), entity.team),
    rng: mulberry32(seeds.controller),
    deps: {
      heightField: match.heightField,
      raycast: match.raycast,
      // a wreck is no target and no teammate (one rule, 268: the authority's list kept wrecks as enemies)
      getEnemies: () => {
        enemies.length = 0;
        for (const candidate of match.tanks()) {
          if (candidate.team !== entity.team && candidate.modeActive !== false && !candidate.combat.destroyed && !isGunship(candidate)) {
            enemies.push(candidate);
          }
        }
        return enemies;
      },
      getAllies: () => {
        allies.length = 0;
        for (const candidate of match.tanks()) {
          if (candidate !== entity && candidate.team === entity.team && !candidate.combat.destroyed) allies.push(candidate);
        }
        return allies;
      },
      getObstacles: match.getObstacles,
      queryObstacles: match.queryObstacles,
      spotting: {
        isSpotted: (id, receiver) => {
          const spotting = match.spotting();
          return spotting ? spotting.isSpotted(id, entity.team, receiver || entity) : true;
        },
      },
      // bot philosophy r1: the mode's live objective ranks targets (objective → closest → weakest)
      getObjective: () => match.mode()?.botObjective(entity) ?? null,
      // what the side knows (the honest search): its freshest sighting, else the enemy's deployment
      intel: {
        freshestContact: () => match.mode()?.freshestSighting(entity) ?? null,
        enemyDeployment: () => match.mode()?.enemyDeployment(entity) ?? null,
        // Air Support (air-support-270): the aircraft a bot answers with its guns
        airThreatM: () => match.mode()?.airThreatM(entity) ?? Infinity,
        airShot: (roundMps, maxPitchRad) => match.mode()?.airShot(entity, roundMps, maxPitchRad) ?? null,
      },
      // round 62 pacing: the no-contact search plans its legs over the shared navigation grid (its own seeded stream)
      ...(navigation ? {
        planRoute: (start: { x: number; z: number }, goal: { x: number; z: number; y?: number },
          options?: { requireGoalLevel?: boolean }) => planBotRoute({
          start, goal, navigation, rng: searchRng, role: roleOf(entity.spec), spec: entity.spec,
          useRoleDetour: false, requireGoalLevel: options?.requireGoalLevel === true,
        }),
      } : {}),
    },
  });
}

interface VillageBounds {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

interface ConcealmentDisc {
  x: number;
  z: number;
  add: number;
}

/** The map's authored spawns (world/terrain.ts layout): the player's anchor and the hostile spawns. */
interface AuthoredSpawns {
  player: { x: number; z: number };
  enemies: readonly { x: number; z: number }[];
}

/**
 * A battle's opening doctrine: each side's roles taken so far, whether it fields a brawler and a scout, where its
 * openings lead (alpha's toward the hostile spawns' centre, bravo's toward the player's anchor), the cover a scout's
 * legs seek and the town its legs skirt.
 */
export interface OpeningPlan {
  counts: Record<Side, Record<string, number | boolean>>;
  hasBrawler: Record<Side, boolean>;
  hasScout: Record<Side, boolean>;
  target: Record<Side, [number, number]>;
  concealment: readonly ConcealmentDisc[];
  village: VillageBounds | null;
}

/** The opening plan for a battle's bots (`bots`: each bot's team and spec, in roster order). */
export function createOpeningPlan(
  bots: readonly { team: string; spec: BotEntity['spec'] }[],
  spawns: AuthoredSpawns,
  village: VillageBounds | null,
  concealment: readonly ConcealmentDisc[],
): OpeningPlan {
  const hasBrawler = { alpha: false, bravo: false };
  const hasScout = { alpha: false, bravo: false };
  for (const bot of bots) {
    const role = roleOf(bot.spec);
    if (role === 'brawler') hasBrawler[sideOf(bot.team)] = true;
    if (role === 'scout') hasScout[sideOf(bot.team)] = true;
  }
  let centerX = 0;
  let centerZ = 0;
  for (const spawn of spawns.enemies) {
    centerX += spawn.x;
    centerZ += spawn.z;
  }
  const count = spawns.enemies.length || 1;
  return {
    counts: { alpha: {}, bravo: {} },
    hasBrawler,
    hasScout,
    target: { alpha: [centerX / count, centerZ / count], bravo: [spawns.player.x, spawns.player.z] },
    concealment,
    village,
  };
}

interface OpeningLane {
  role: OpeningRole;
  index: number;
  side: number;
}

function selectOpeningLane(plan: OpeningPlan, entity: BotEntity): OpeningLane {
  const side = sideOf(entity.team);
  const counts = plan.counts[side];
  let role = roleOf(entity.spec);
  if (role === 'flanker' && !plan.hasBrawler[side] && !counts._vanguard) {
    counts._vanguard = true;
    role = 'brawler';
  } else if (role === 'flanker' && !plan.hasScout[side] && !counts._scoutLane) {
    counts._scoutLane = true;
    role = 'scout';
  }
  const previousCount = counts[role];
  const index = typeof previousCount === 'number' ? previousCount : 0;
  counts[role] = index + 1;
  return { role, index, side: (index % 2 === 0 ? 1 : -1) * (side === 'bravo' ? 1 : -1) };
}

function nearestBushWaypoint(plan: OpeningPlan, x: number, z: number): BotRoutePoint {
  let bestX = x;
  let bestZ = z;
  let bestDistance = 45;
  for (const disc of plan.concealment) {
    if (!disc || disc.add < 0.3) continue;
    const distance = detMath.hypot(disc.x - x, disc.z - z);
    if (distance >= bestDistance) continue;
    bestDistance = distance;
    bestX = disc.x;
    bestZ = disc.z;
  }
  return [bestX, bestZ];
}

function skirtTownWaypoint(village: VillageBounds | null, x: number, z: number): BotRoutePoint {
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

function clampBattleWaypoint(point: BotRoutePoint): BotRoutePoint {
  return [
    Math.max(-460, Math.min(460, point[0])),
    Math.max(-460, Math.min(460, point[1])),
  ];
}

function openingWaypoints(plan: OpeningPlan, entity: BotEntity, spawn: { x: number; z: number }, lane: OpeningLane): BotRoutePoint[] {
  const bravo = sideOf(entity.team) === 'bravo';
  const target = plan.target[bravo ? 'bravo' : 'alpha'];
  const deltaX = target[0] - spawn.x;
  const deltaZ = target[1] - spawn.z;
  const distance = detMath.hypot(deltaX, deltaZ) || 1;
  const forwardX = deltaX / distance;
  const forwardZ = deltaZ / distance;
  const lateralX = forwardZ;
  const lateralZ = -forwardX;
  const { role, index, side } = lane;
  const waypoints: BotRoutePoint[] = [];
  if (role === 'sniper') {
    const advance = 0.30 + (index % 3) * 0.06;
    const lateral = (34 + index * 27) * side;
    waypoints.push([
      spawn.x + deltaX * advance + lateralX * lateral,
      spawn.z + deltaZ * advance + lateralZ * lateral,
    ]);
  } else if (role === 'scout') {
    const lateral = (190 + index * 42) * side;
    waypoints.push(
      nearestBushWaypoint(plan,
        spawn.x + deltaX * 0.42 + lateralX * lateral,
        spawn.z + deltaZ * 0.42 + lateralZ * lateral),
      nearestBushWaypoint(plan,
        spawn.x + deltaX * 0.68 + lateralX * lateral * 0.7,
        spawn.z + deltaZ * 0.68 + lateralZ * lateral * 0.7),
      [target[0], target[1]],
    );
  } else if (role === 'flanker') {
    const lateral = (95 + (index % 3) * 38) * side;
    const standoff = Math.min(distance, 165 + (index % 3) * 22);
    waypoints.push(
      [spawn.x + deltaX * 0.45 + lateralX * lateral,
        spawn.z + deltaZ * 0.45 + lateralZ * lateral],
      [target[0] - forwardX * standoff + lateralX * lateral * 0.55,
        target[1] - forwardZ * standoff + lateralZ * lateral * 0.55],
      [target[0], target[1]],
    );
  } else {
    const lateral = ((index % 3) - 1) * 44 * (bravo ? 1 : -1);
    const standoff = Math.min(distance, index === 0 ? 105 : 135 + (index % 3) * 22);
    waypoints.push(
      [spawn.x + deltaX * 0.5 + lateralX * lateral,
        spawn.z + deltaZ * 0.5 + lateralZ * lateral],
      [target[0] - forwardX * standoff + lateralX * lateral,
        target[1] - forwardZ * standoff + lateralZ * lateral],
      [target[0], target[1]],
    );
  }
  return waypoints.map((point, index) => clampBattleWaypoint(
    index < waypoints.length - 1
      ? skirtTownWaypoint(plan.village, point[0], point[1])
      : point,
  ));
}

/**
 * A bot's opening route (battle-spikes-253): its lane and doctrine points are taken now, so call it for each bot in roster
 * order (a lane takes its side's next role); the legs come one a step, the solo battle's deferred warm advancing them a
 * leg at a time and the authority running them through at once, in the same order on the bot's own route stream either
 * way. The waypoints are set once the route is whole; the generator returns the route.
 */
export function openingRoute(
  entity: BotEntity,
  index: number,
  spawn: { x: number; z: number },
  plan: OpeningPlan,
  match: Pick<BotMatch, 'seed' | 'navigation'>,
  controller: Pick<BotController, 'setWaypoints'>,
): Generator<void, BotRoutePoint[], void> {
  const lane = selectOpeningLane(plan, entity);
  const doctrineWaypoints = openingWaypoints(plan, entity, spawn, lane);
  const routeRng = mulberry32(botSeeds(match.seed, index).route);
  return (function* legs(): Generator<void, BotRoutePoint[], void> {
    const route: BotRoutePoint[] = [];
    let routeStart = { x: spawn.x, z: spawn.z };
    for (const [x, z] of doctrineWaypoints) {
      const leg = planBotRoute({
        start: routeStart,
        goal: { x, z },
        navigation: match.navigation,
        rng: routeRng,
        role: lane.role,
        spec: entity.spec,
        useRoleDetour: false,
      });
      if (!leg.length) break;
      route.push(...leg);
      // A dry-route leg may end on the reachable bank, not the requested wet
      // doctrine point. Subsequent legs must continue at the actual endpoint.
      const end = leg[leg.length - 1]!;
      routeStart = match.navigation?.navigationWaterPolicy === 'avoid-liquid'
        ? { x: end[0], z: end[1] } : { x, z };
      yield;
    }
    controller.setWaypoints(route, { loop: false, planned: true });
    return route;
  })();
}
