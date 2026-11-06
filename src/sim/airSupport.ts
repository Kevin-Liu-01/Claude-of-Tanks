/**
 * Air Support (air-support-270): the support ledger and the airstrikes. Owner 2026-11-05: "a new game mode where you can
 * call in airstrikes and jet strikes and so on and we already have that model of the ac 130"; in the lane: "a giant aiming
 * reticle on the ground … 3 differennt kinnds of airstrikes with their own special effects annd sounnt", then "keep and add
 * artillery annd recon with the 3 airstrikes": the recon pass, the artillery barrage, the strafing run, the precision bomb
 * and the AC-130 orbit.
 *
 * Every crew, human or bot, earns support points from combat (damage, kills, captures, spotting, aircraft brought down,
 * and a slow trickle) and spends them on a strike at a mark. The targeted side is warned at the call (the strike's record
 * is public: its footprint and its countdown), and nothing of a strike lands before its warning has run. The aircraft are
 * not entities: each one flies a path derived from its strike's record alone (aircraftPose), so the presentation draws it
 * from the public record and the wire carries no flight. A round from the other side passing through an aircraft's hit
 * sphere strikes it (tryHitAircraft); brought down, its strike ends.
 *
 * Pure and deterministic: no DOM, no three.js, no wall clock; randomness from the match seed and the strike id only. The
 * mode controller (matchModes.ts) owns one of these; both authorities fire the rounds through sim/airSupportFire.ts. Every
 * number is the ruleset's (matchRuleset.ts AIR_SUPPORT_RULES).
 */
import * as detMath from './detMath.ts';
import { AIR_STRIKE_KINDS, airStrikeFlies, type AirStrikeKind, type AirSupportRules } from './matchRuleset.ts';
import type { ObjectiveTeam } from './gameModeCatalog.ts';
import { botDriven } from './botDriven.ts';

interface Point3 { x: number; y: number; z: number }
/** The fixed step the authorities advance the mode clock by (sim/constants SIM_DT): a recon pass reveals in one step. */
const SIM_STEP_S = 1 / 60;

/** One strike: everything its flight, its rounds and its warning are derived from. Times are the mode's clock. */
export interface AirStrike {
  id: number;
  kind: AirStrikeKind;
  team: ObjectiveTeam;
  callerId: string;
  /** The mark on the ground. */
  x: number; y: number; z: number;
  /** The run's heading (radians, atan2(dx, dz)): from the caller's hull toward the mark at the call. */
  heading: number;
  calledS: number;
  /** The warning's end: the first round of the strike may land from here on, never before. */
  landsS: number;
  /** The aircraft has left (or fell) by here. */
  endS: number;
  hp: number;
  maxHp: number;
  /** Brought down: when and by whom (null while it flies). */
  downedS: number | null;
  downedBy: string | null;
}

/** A strike as anyone may see it: its record without its caller (the flight, the footprint and the rounds need no more). */
export type PublicStrike = Omit<AirStrike, 'callerId'>;

/** What the HUD, the minimap, the world and the sounds read of the strikes, per viewer. */
export interface AirSupportView {
  /** The mode's clock the records are on (the presentation interpolates the aircraft from it). */
  nowS: number;
  /** The viewer's own ledger (absent for a spectator). */
  points?: number;
  /** Seconds until the viewer may call each kind again (0: ready), and whether the side's air is full. */
  cooldowns?: Record<AirStrikeKind, number>;
  teamAirFull?: boolean;
  strikes: (PublicStrike & { mine: boolean })[];
}

export interface AirSupportCheckpoint {
  points: [string, number][];
  cooldowns: [string, number][];
  spotted: [string, number][];
  /** The recon passes' reveals: `${side}:${id}` -> until (mode time). */
  revealed: [string, number][];
  strikes: AirStrike[];
  nextId: number;
  trickles: number;
  decideAt: number;
  /** When each side's bots last sent a recon pass (absent in a checkpoint from before the gap: none). */
  botReconAt?: Partial<Record<ObjectiveTeam, number>>;
}

export interface AirSupportEntity {
  id: string; team: string; bot?: boolean; isPlayer?: boolean;
  state: { pos: Point3 };
  combat: { destroyed: boolean };
  modeActive?: boolean;
}

interface AirSupportOptions<Entity extends AirSupportEntity> {
  rules: AirSupportRules;
  entities: readonly Entity[];
  teamOf(entity: Entity): ObjectiveTeam;
  terrainHeight(x: number, z: number): number;
  emit(type: string, payload: Record<string, string | number | boolean | null>): void;
  /** Whether `side` has the enemy `id` spotted (the mode's spotting hook; absent: every living enemy is). */
  isSpotted?(id: string, side: ObjectiveTeam): boolean;
  /** Where a bot sends a recon pass when its side has nobody spotted in reach (the mode's objective toward the enemy). */
  scoutPoint?(entity: Entity): { x: number; z: number } | null;
  seed: number;
}

/** The ledger and the strikes, as the mode controller, both authorities and the receipts use them. */
export interface AirSupport {
  readonly rules: AirSupportRules;
  readonly strikes: readonly AirStrike[];
  readonly seed: number;
  requestStrike(entityId: string, kind: AirStrikeKind, x: number, z: number, timeS: number): boolean;
  recordDamage(attackerId: string | null | undefined, victimId: string, hp: number, supportHit: boolean): void;
  recordKill(victimId: string, killerId: string | null, supportKill: boolean): void;
  recordCapture(team: ObjectiveTeam, x: number, z: number, radiusM: number): void;
  recordSpot(spotterId: string | null | undefined, targetId: string, timeS: number): void;
  tryHitAircraft(shell: { dead?: boolean; shooterId?: string; roofStation?: boolean; prevPos: Point3; pos: Point3; spec: { dmg: number } }, timeS: number): boolean;
  damageAircraft(strike: AirStrike, by: string, damage: number, timeS: number): void;
  counterAirHit(strike: AirStrike, chance: number, by: string, timeS: number): void;
  aircraftPoseOf(strike: AirStrike, timeS: number, out: Point3 & { yaw: number; bank: number }): Point3 & { yaw: number; bank: number };
  aircraftWithin(team: ObjectiveTeam, x: number, y: number, z: number, rangeM: number, timeS: number): AirStrike | null;
  /** Whether a recon pass has `id` revealed to `side` now (the spotting system's reveal hook). */
  revealed(id: string, side: ObjectiveTeam): boolean;
  evadeTarget(entity: AirSupportEntity, timeS: number): { x: number; z: number; mission: 'evade' } | null;
  step(timeS: number): void;
  view(viewerId: string | null): AirSupportView;
  pointsOf(id: string): number;
  capture(): AirSupportCheckpoint;
  restore(saved: AirSupportCheckpoint): void;
}

/** The strike's flight time after its warning: how long it stays a danger on the ground. */
export function strikeDangerS(rules: AirSupportRules, kind: AirStrikeKind): number {
  if (kind === 'artillery') return rules.artillery.fireS + 0.6;
  return kind === 'strafe' ? rules.strafe.fireS + 0.6 : kind === 'bomb' ? 0.6 : kind === 'recon' ? 0 : rules.gunship.orbitS;
}

/** When the aircraft has left the battle (from its call). */
function strikeEndS(rules: AirSupportRules, kind: AirStrikeKind, landsS: number): number {
  if (kind === 'recon') return landsS + rules.recon.trackM * 0.5 / rules.recon.speedMps + 4;
  if (kind === 'artillery') return landsS + rules.artillery.fireS + 1;
  if (kind === 'strafe') return landsS + rules.strafe.fireS + 5;
  if (kind === 'bomb') return landsS + 4;
  return landsS + rules.gunship.orbitS + 8;
}

/** A call-in's ground footprint, the shape the reticle, the minimap and the world draw it as. */
export type StrikeFootprint =
  | { readonly shape: 'circle'; readonly radiusM: number }
  | { readonly shape: 'lane'; readonly halfLengthM: number; readonly halfWidthM: number };
const footprints = new WeakMap<AirSupportRules, Map<AirStrikeKind, StrikeFootprint>>();
/** (made once per rules and kind: the presentation reads it every frame) */
export function strikeFootprint(rules: AirSupportRules, kind: AirStrikeKind): StrikeFootprint {
  let byKind = footprints.get(rules);
  if (!byKind) { byKind = new Map(); footprints.set(rules, byKind); }
  let footprint = byKind.get(kind);
  if (!footprint) { footprint = Object.freeze(makeFootprint(rules, kind)); byKind.set(kind, footprint); }
  return footprint;
}
function makeFootprint(rules: AirSupportRules, kind: AirStrikeKind): StrikeFootprint {
  if (kind === 'recon') return { shape: 'lane', halfLengthM: rules.recon.trackM * 0.5, halfWidthM: rules.recon.revealM };
  if (kind === 'strafe') return { shape: 'lane', halfLengthM: rules.strafe.lengthM * 0.5, halfWidthM: rules.strafe.halfWidthM };
  return { shape: 'circle', radiusM: kind === 'gunship' ? rules.gunship.engageM : rules[kind].radiusM };
}

/** The strafing lane's start: half the lane short of the mark along the heading. */
export function strafeLaneStart(rules: AirSupportRules, strike: Pick<AirStrike, 'x' | 'z' | 'heading'>, out: { x: number; z: number }): { x: number; z: number } {
  const half = rules.strafe.lengthM * 0.5;
  out.x = strike.x - detMath.sin(strike.heading) * half;
  out.z = strike.z - detMath.cos(strike.heading) * half;
  return out;
}

/** The horizontal stand-off at which the jet's gun opens on the lane's start (the run is a 20-degree dive). */
const STRAFE_STANDOFF_M = 220;

/**
 * Where a strike's aircraft is at `timeS`, and which way it heads (yaw, and the bank the presentation rolls it by). The
 * jet comes in from behind the caller along the heading, dives on the lane (strafe) or runs over the mark at height
 * (bomb), and climbs away; the AC-130 spirals in onto its pylon turn over the mark, holds it, and spirals out.
 */
export function aircraftPose(rules: AirSupportRules, strike: PublicStrike, timeS: number, out: Point3 & { yaw: number; bank: number }): Point3 & { yaw: number; bank: number } {
  const sinH = detMath.sin(strike.heading), cosH = detMath.cos(strike.heading);
  if (strike.kind === 'gunship') {
    const g = rules.gunship;
    const rate = g.speedMps / g.radiusM;
    const angle = (strike.id * 1.7) + (timeS - strike.calledS) * rate;
    const leave = strike.landsS + g.orbitS;
    const radius = g.radiusM + g.speedMps * 2.2 * (Math.max(0, strike.landsS - timeS) + Math.max(0, timeS - leave));
    out.x = strike.x + detMath.sin(angle) * radius;
    out.z = strike.z + detMath.cos(angle) * radius;
    out.y = strike.y + g.altitudeM;
    // flying counter-clockwise seen from above: the left wing (the guns' side) toward the mark
    out.yaw = angle + Math.PI / 2;
    out.bank = -0.3;
    return out;
  }
  if (strike.kind === 'recon' || strike.kind === 'artillery') {
    // the recon jet passes over the mark at landsS along the heading (artillery has no aircraft: the point over the mark)
    const r = rules[strike.kind];
    const along = r.speedMps * (timeS - strike.landsS);
    out.x = strike.x + sinH * along;
    out.z = strike.z + cosH * along;
    out.y = strike.y + r.altitudeM;
    out.yaw = strike.heading;
    out.bank = 0;
    return out;
  }
  if (strike.kind === 'bomb') {
    const b = rules.bomb;
    // the release point: fallS of the bomb's own flight short of the mark; the jet passes it at landsS - fallS
    const along = b.speedMps * (timeS - (strike.landsS - b.fallS)) - b.speedMps * b.fallS;
    out.x = strike.x + sinH * along;
    out.z = strike.z + cosH * along;
    out.y = strike.y + b.altitudeM;
    out.yaw = strike.heading;
    out.bank = 0;
    return out;
  }
  const s = rules.strafe;
  const start = strafeLaneStart(rules, strike, _lane);
  const along = s.speedMps * (timeS - strike.landsS) - STRAFE_STANDOFF_M;
  out.x = start.x + sinH * along;
  out.z = start.z + cosH * along;
  const firing = timeS - strike.landsS;
  // level in, a 30 m dive while the gun walks the lane, then the pull-up at 40 m/s
  const dive = firing <= 0 ? 0 : firing <= s.fireS ? 30 * firing / s.fireS : 30 - 40 * (firing - s.fireS);
  out.y = strike.y + s.altitudeM - Math.max(-s.pullUpM, dive);
  out.yaw = strike.heading;
  out.bank = 0;
  return out;
}
const _lane = { x: 0, z: 0 };

/** Whether a ground point lies inside a strike's danger footprint, widened by `marginM`. */
export function strikeCovers(rules: AirSupportRules, strike: PublicStrike, x: number, z: number, marginM: number): boolean {
  if (strike.kind === 'bomb') return detMath.hypot(x - strike.x, z - strike.z) <= rules.bomb.radiusM + marginM;
  if (strike.kind === 'artillery') return detMath.hypot(x - strike.x, z - strike.z) <= rules.artillery.radiusM + marginM;
  if (strike.kind === 'recon') return laneCovers(strike, x, z, rules.recon.trackM * 0.5 + marginM, rules.recon.revealM + marginM);
  if (strike.kind === 'gunship') return detMath.hypot(x - strike.x, z - strike.z) <= rules.gunship.engageM + marginM;
  return laneCovers(strike, x, z, rules.strafe.lengthM * 0.5 + marginM, rules.strafe.halfWidthM + marginM);
}

function laneCovers(strike: Pick<AirStrike, 'x' | 'z' | 'heading'>, x: number, z: number, halfLength: number, halfWidth: number): boolean {
  const sinH = detMath.sin(strike.heading), cosH = detMath.cos(strike.heading);
  const dx = x - strike.x, dz = z - strike.z;
  const along = dx * sinH + dz * cosH, across = dx * cosH - dz * sinH;
  return Math.abs(along) <= halfLength && Math.abs(across) <= halfWidth;
}

/** A seeded unit draw for round `k` of strike `id` (mulberry32 over the match seed, the strike and the round). */
export function strikeRandom(seed: number, id: number, k: number): number {
  let value = (seed ^ Math.imul(id, 0x9e3779b1) ^ Math.imul(k + 1, 0x85ebca6b)) >>> 0;
  value = value + 0x6D2B79F5 | 0;
  let out = Math.imul(value ^ value >>> 15, 1 | value);
  out = out + Math.imul(out ^ out >>> 7, 61 | out) ^ out;
  return ((out ^ out >>> 14) >>> 0) / 4294967296;
}

export function createAirSupport<Entity extends AirSupportEntity>(options: AirSupportOptions<Entity>): AirSupport {
  const { rules, entities, teamOf, terrainHeight, emit, isSpotted, scoutPoint, seed } = options;
  const points = new Map<string, number>();
  const cooldowns = new Map<string, number>();
  const spottedAt = new Map<string, number>();
  const revealedUntil = new Map<string, number>();
  const strikes: AirStrike[] = [];
  let nextId = 1;
  let trickles = 0;
  let decideAt = 0;
  let nowS = 0;
  /** When each side's bots last sent a recon pass (rules.bots.reconGapS). */
  const botReconAt: Partial<Record<ObjectiveTeam, number>> = {};
  const byId = new Map<string, Entity>();
  for (const entity of entities) { byId.set(entity.id, entity); points.set(entity.id, rules.points.start); }

  const living = (entity: Entity | undefined): entity is Entity => !!entity && !entity.combat.destroyed && entity.modeActive !== false;
  const award = (id: string | null | undefined, amount: number): void => {
    if (!id || !(amount > 0) || !byId.has(id)) return;
    points.set(id, Math.min(rules.points.cap, (points.get(id) ?? 0) + amount));
  };
  const cooldownKey = (id: string, kind: AirStrikeKind): string => `${id}:${kind}`;
  const flying = (strike: AirStrike, timeS: number): boolean => strike.downedS == null && timeS < strike.endS;
  /** An aircraft in the air that rounds can strike (artillery has none). */
  const airborne = (strike: AirStrike, timeS: number): boolean => airStrikeFlies(strike.kind) && flying(strike, timeS) && timeS >= strike.calledS;
  const teamAir = (team: ObjectiveTeam, timeS: number, kind: AirStrikeKind | null = null): number => {
    let count = 0;
    for (const strike of strikes) if (strike.team === team && flying(strike, timeS) && (!kind || strike.kind === kind)) count++;
    return count;
  };

  /** Why a call by `entity` of `kind` would be refused now (null: it may be made). */
  function refusal(entity: Entity, kind: AirStrikeKind, x: number, z: number, timeS: number): string | null {
    if (!living(entity)) return 'DESTROYED';
    if (!Number.isFinite(x) || !Number.isFinite(z)) return 'MARK';
    const strike = rules[kind];
    if ((points.get(entity.id) ?? 0) < strike.cost) return 'POINTS';
    if ((cooldowns.get(cooldownKey(entity.id, kind)) ?? 0) > timeS) return 'COOLDOWN';
    const team = teamOf(entity);
    if (teamAir(team, timeS) >= rules.teamAirCap) return 'AIR_FULL';
    if (kind === 'gunship' && teamAir(team, timeS, 'gunship') >= rules.teamGunshipCap) return 'GUNSHIP_UP';
    if (detMath.hypot(x - entity.state.pos.x, z - entity.state.pos.z) > rules.callRangeM) return 'RANGE';
    return null;
  }

  /** A crew calls `kind` on the mark (x, z). The authorities pass the caller's own aim point; true when accepted. */
  function requestStrike(entityId: string, kind: AirStrikeKind, x: number, z: number, timeS: number): boolean {
    const entity = byId.get(entityId);
    if (!entity || !AIR_STRIKE_KINDS.includes(kind)) return false;
    const reason = refusal(entity, kind, x, z, timeS);
    if (reason) {
      emit('mode_strike_denied', { id: entityId, kind, reason });
      return false;
    }
    const strike = rules[kind];
    points.set(entityId, (points.get(entityId) ?? 0) - strike.cost);
    cooldowns.set(cooldownKey(entityId, kind), timeS + strike.cooldownS);
    const dx = x - entity.state.pos.x, dz = z - entity.state.pos.z;
    // a mark on the caller's own hull keeps the hull's heading undefined: fly along +z
    const heading = dx * dx + dz * dz > 1 ? detMath.atan2(dx, dz) : 0;
    const landsS = timeS + strike.warningS;
    const record: AirStrike = {
      id: nextId++, kind, team: teamOf(entity), callerId: entityId,
      x, y: terrainHeight(x, z), z, heading, calledS: timeS, landsS, endS: strikeEndS(rules, kind, landsS),
      hp: strike.hp, maxHp: strike.hp, downedS: null, downedBy: null,
    };
    strikes.push(record);
    emit('mode_strike_called', { strikeId: record.id, kind, team: record.team, x: record.x, y: record.y, z: record.z,
      heading: record.heading, landsS, warningS: strike.warningS, callerId: entityId });
    return true;
  }

  /** Points for damage dealt to an enemy hull by a crew's own guns (an airstrike's damage earns none: no snowball). */
  function recordDamage(attackerId: string | null | undefined, victimId: string, hp: number, supportHit: boolean): void {
    const attacker = attackerId ? byId.get(attackerId) : undefined, victim = byId.get(victimId);
    if (supportHit || !attacker || !victim || teamOf(attacker) === teamOf(victim)) return;
    award(attacker.id, hp * rules.points.perDamageHp);
  }

  /** Points for a kill; an airstrike's kill (its caller's) earns the smaller support figure. */
  function recordKill(victimId: string, killerId: string | null, supportKill: boolean): void {
    const killer = killerId ? byId.get(killerId) : undefined, victim = byId.get(victimId);
    if (!killer || !victim || teamOf(killer) === teamOf(victim)) return;
    award(killer.id, supportKill ? rules.points.supportKill : rules.points.kill);
  }

  /** Points to each crew inside a sector its side has just taken. */
  function recordCapture(team: ObjectiveTeam, x: number, z: number, radiusM: number): void {
    for (const entity of entities) {
      if (!living(entity) || teamOf(entity) !== team) continue;
      if (detMath.hypot(entity.state.pos.x - x, entity.state.pos.z - z) <= radiusM) award(entity.id, rules.points.capture);
    }
  }

  /** Points to the crew whose eyes spotted an enemy (at most once per enemy per spotRepeatS for its side). */
  function recordSpot(spotterId: string | null | undefined, targetId: string, timeS: number): void {
    const spotter = spotterId ? byId.get(spotterId) : undefined, target = byId.get(targetId);
    if (!spotter || !target || teamOf(spotter) === teamOf(target)) return;
    const key = `${teamOf(spotter)}:${targetId}`;
    if ((spottedAt.get(key) ?? -Infinity) + rules.points.spotRepeatS > timeS) return;
    spottedAt.set(key, timeS);
    award(spotter.id, rules.points.spot);
  }

  const _pose = { x: 0, y: 0, z: 0, yaw: 0, bank: 0 };
  /**
   * A round of the other side passing through a flying aircraft's hit sphere strikes it for the round's damage (the strike's
   * own side never hits its own aircraft: its own rounds leave from inside it). True when the round was spent on it.
   */
  function tryHitAircraft(shell: { dead?: boolean; shooterId?: string; roofStation?: boolean; prevPos: Point3; pos: Point3; spec: { dmg: number } }, timeS: number): boolean {
    // a roof station's round lands its counter-air share instead (counterAirHit), never twice
    if (shell.dead || shell.roofStation || !strikes.length) return false;
    const shooter = shell.shooterId ? byId.get(shell.shooterId) : undefined;
    if (!shooter) return false;
    const team = teamOf(shooter);
    for (const strike of strikes) {
      if (strike.team === team || !airborne(strike, timeS)) continue;
      const pose = aircraftPose(rules, strike, timeS, _pose);
      const radius = rules[strike.kind].hitRadiusM;
      if (segmentPointDistanceSq(pose, shell.prevPos, shell.pos) > radius * radius) continue;
      shell.dead = true;
      damageAircraft(strike, shooter.id, shell.spec.dmg, timeS);
      return true;
    }
    return false;
  }

  /** Damage to an aircraft (a round through it, a roof station's burst); brought down at zero. */
  function damageAircraft(strike: AirStrike, by: string, damage: number, timeS: number): void {
    if (strike.downedS != null || !(damage > 0)) return;
    strike.hp = Math.max(0, strike.hp - damage);
    emit('mode_aircraft_hit', { strikeId: strike.id, kind: strike.kind, hp: strike.hp, by });
    if (strike.hp > 0) return;
    strike.downedS = timeS; strike.downedBy = by; strike.endS = Math.min(strike.endS, timeS + 6);
    award(by, rules.points.downed);
    const pose = aircraftPose(rules, strike, timeS, _pose);
    emit('mode_aircraft_down', { strikeId: strike.id, kind: strike.kind, team: strike.team, by, x: pose.x, y: pose.y, z: pose.z });
  }

  /** A roof station's round at an aircraft lands `chance` (its counter-drone share at the range) of a strike. */
  function counterAirHit(strike: AirStrike, chance: number, by: string, timeS: number): void {
    damageAircraft(strike, by, chance * rules.counterAir.hitScale * rules.counterAir.damagePerHit, timeS);
  }

  /** The aircraft an enemy roof station could engage now: flying, the other side's, within `rangeM`. */
  function aircraftWithin(team: ObjectiveTeam, x: number, y: number, z: number, rangeM: number, timeS: number): AirStrike | null {
    let best: AirStrike | null = null, bestD = rangeM * rangeM;
    for (const strike of strikes) {
      if (strike.team === team || !airborne(strike, timeS)) continue;
      const pose = aircraftPose(rules, strike, timeS, _pose);
      const d = (pose.x - x) ** 2 + (pose.y - y) ** 2 + (pose.z - z) ** 2;
      if (d < bestD) { bestD = d; best = strike; }
    }
    return best;
  }

  // ---------------------------------------------------------------- bots

  /** How many of `team`'s spotted, living enemies a strike of `kind` from `from` at (x, z) would cover; 0 when a friendly
   *  hull stands within friendlyClearM of its footprint (the bots never call danger close). */
  const _probe: AirStrike = { id: 0, kind: 'bomb', team: 'alpha', callerId: '', x: 0, y: 0, z: 0, heading: 0, calledS: 0, landsS: 0,
    endS: 0, hp: 0, maxHp: 0, downedS: null, downedBy: null };
  function coverage(caller: Entity, kind: AirStrikeKind, x: number, z: number): number {
    const team = teamOf(caller);
    _probe.kind = kind; _probe.x = x; _probe.z = z;
    _probe.heading = detMath.atan2(x - caller.state.pos.x, z - caller.state.pos.z);
    let count = 0;
    for (const entity of entities) {
      if (!living(entity)) continue;
      const friendly = teamOf(entity) === team;
      if (friendly) {
        if (strikeCovers(rules, _probe, entity.state.pos.x, entity.state.pos.z, kind === 'gunship' ? 0 : rules.bots.friendlyClearM)) {
          // the gunship engages only the enemy: a friendly inside its ring is not danger close
          if (kind !== 'gunship') return 0;
        }
        continue;
      }
      if (isSpotted && !isSpotted(entity.id, team)) continue;
      // the gunship's ring counts the enemies near its centre (where its fire stays inside the ring)
      if (strikeCovers(rules, _probe, entity.state.pos.x, entity.state.pos.z, kind === 'gunship' ? -rules.gunship.engageM * 0.5 : 0)) count++;
    }
    return count;
  }

  /**
   * A bot weighs a call: the dearest strike it can afford that has its minimum of targets, on the best-covered spotted
   * enemy; with nobody spotted in reach, a recon pass toward its scout point.
   */
  function botCall(entity: Entity, timeS: number): void {
    const team = teamOf(entity);
    // the side's last air slots stay free for its crews' own calls
    if (teamAir(team, timeS) >= rules.teamAirCap - rules.bots.leaveSlots) return;
    let anySpotted = false;
    for (const kind of ['gunship', 'bomb', 'strafe', 'artillery'] as const) {
      if (refusal(entity, kind, entity.state.pos.x, entity.state.pos.z, timeS)) continue;
      let bestCount = 0, bestX = 0, bestZ = 0;
      for (const target of entities) {
        if (!living(target) || teamOf(target) === team) continue;
        if (isSpotted && !isSpotted(target.id, team)) continue;
        const range = detMath.hypot(target.state.pos.x - entity.state.pos.x, target.state.pos.z - entity.state.pos.z);
        if (range > rules.callRangeM || range < 30) continue;
        anySpotted = true;
        const count = coverage(entity, kind, target.state.pos.x, target.state.pos.z);
        if (count > bestCount) { bestCount = count; bestX = target.state.pos.x; bestZ = target.state.pos.z; }
      }
      if (bestCount >= rules.bots.minTargets[kind]) { requestStrike(entity.id, kind, bestX, bestZ, timeS); return; }
    }
    if (anySpotted || refusal(entity, 'recon', entity.state.pos.x, entity.state.pos.z, timeS)) return;
    // one bot recon pass a side, then a gap (a sky full of photo jets is no one's battle)
    if (timeS - (botReconAt[team] ?? -Infinity) < rules.bots.reconGapS) return;
    // nobody in reach is spotted (or the costlier calls were not affordable): scout toward the objective, inside the reach
    const point = scoutPoint?.(entity);
    if (!point) return;
    const dx = point.x - entity.state.pos.x, dz = point.z - entity.state.pos.z, d = detMath.hypot(dx, dz);
    if (d < 60) return;
    const reach = Math.min(d, rules.callRangeM * 0.9);
    botReconAt[team] = timeS;
    requestStrike(entity.id, 'recon', entity.state.pos.x + dx / d * reach, entity.state.pos.z + dz / d * reach, timeS);
  }

  const _evade = { x: 0, z: 0, mission: 'evade' as const };
  /**
   * A bot inside a strike's footprint before or while it lands (either side's: friendly fire is on) drives out of it by the
   * shortest way, evadeMarginM past its edge. The AC-130's ring is answered with guns, not by leaving it.
   */
  function evadeTarget(entity: AirSupportEntity, timeS: number): { x: number; z: number; mission: 'evade' } | null {
    const pos = entity.state.pos;
    for (const strike of strikes) {
      if (strike.kind === 'gunship' || strike.kind === 'recon' || strike.downedS != null
        || timeS > strike.landsS + strikeDangerS(rules, strike.kind)) continue;
      if (!strikeCovers(rules, strike, pos.x, pos.z, rules.bots.evadeMarginM * 0.5)) continue;
      const margin = rules.bots.evadeMarginM;
      if (strike.kind === 'bomb' || strike.kind === 'artillery') {
        const radius = rules[strike.kind].radiusM + margin;
        const dx = pos.x - strike.x, dz = pos.z - strike.z, d = detMath.hypot(dx, dz);
        const ux = d > 0.5 ? dx / d : detMath.cos(strike.heading), uz = d > 0.5 ? dz / d : -detMath.sin(strike.heading);
        _evade.x = strike.x + ux * radius; _evade.z = strike.z + uz * radius;
      } else {
        const sinH = detMath.sin(strike.heading), cosH = detMath.cos(strike.heading);
        const across = (pos.x - strike.x) * cosH - (pos.z - strike.z) * sinH;
        const side = across >= 0 ? 1 : -1, out = rules.strafe.halfWidthM + margin - Math.abs(across);
        _evade.x = pos.x + cosH * side * out; _evade.z = pos.z - sinH * side * out;
      }
      return _evade;
    }
    return null;
  }

  // ---------------------------------------------------------------- the step

  function step(timeS: number): void {
    nowS = timeS;
    const trickle = Math.floor(timeS / rules.points.trickleS);
    if (trickle > trickles) {
      const gained = trickle - trickles;
      trickles = trickle;
      for (const entity of entities) if (living(entity)) award(entity.id, gained);
    }
    if (timeS >= decideAt) {
      decideAt = timeS + rules.bots.decideEveryS;
      for (const entity of entities) if (botDriven(entity) && living(entity)) botCall(entity, timeS);
    }
    // a recon pass reveals, as its jet passes the mark, every enemy within its reach of the track (unless it fell first)
    for (const strike of strikes) {
      if (strike.kind !== 'recon' || strike.downedS != null || timeS < strike.landsS || timeS - SIM_STEP_S >= strike.landsS) continue;
      for (const entity of entities) {
        if (!living(entity) || teamOf(entity) === strike.team) continue;
        if (!laneCovers(strike, entity.state.pos.x, entity.state.pos.z, rules.recon.trackM * 0.5, rules.recon.revealM)) continue;
        revealedUntil.set(`${strike.team}:${entity.id}`, strike.landsS + rules.recon.revealS);
      }
      emit('mode_recon_pass', { strikeId: strike.id, team: strike.team });
    }
    for (const [key, until] of revealedUntil) if (until < timeS) revealedUntil.delete(key);
    // the records of aircraft long gone are dropped (their rounds have landed: the end is past every danger window)
    for (let i = strikes.length - 1; i >= 0; i--) if (timeS > strikes[i]!.endS + 2) strikes.splice(i, 1);
  }

  function view(viewerId: string | null): AirSupportView {
    const viewer = viewerId ? byId.get(viewerId) : undefined;
    const out: AirSupportView = {
      nowS,
      strikes: strikes.map(({ callerId, ...rest }) => ({ ...rest, mine: !!viewer && callerId === viewer.id })),
    };
    if (viewer) {
      out.points = Math.floor(points.get(viewer.id) ?? 0);
      const cool = {} as Record<AirStrikeKind, number>;
      for (const kind of AIR_STRIKE_KINDS) cool[kind] = Math.max(0, (cooldowns.get(cooldownKey(viewer.id, kind)) ?? 0) - nowS);
      out.cooldowns = cool;
      out.teamAirFull = teamAir(teamOf(viewer), nowS) >= rules.teamAirCap;
    }
    return out;
  }

  return {
    rules,
    strikes: strikes as readonly AirStrike[],
    seed,
    requestStrike, recordDamage, recordKill, recordCapture, recordSpot, tryHitAircraft, damageAircraft, counterAirHit, aircraftWithin,
    aircraftPoseOf: (strike: AirStrike, timeS: number, out: Point3 & { yaw: number; bank: number }) => aircraftPose(rules, strike, timeS, out),
    evadeTarget, step, view,
    revealed: (id: string, side: ObjectiveTeam): boolean => (revealedUntil.get(`${side}:${id}`) ?? -Infinity) >= nowS,
    pointsOf: (id: string): number => points.get(id) ?? 0,
    capture(): AirSupportCheckpoint {
      return { points: [...points], cooldowns: [...cooldowns], spotted: [...spottedAt], revealed: [...revealedUntil], strikes: strikes.map((s) => ({ ...s })),
        nextId, trickles, decideAt, botReconAt: { ...botReconAt } };
    },
    restore(saved: AirSupportCheckpoint): void {
      points.clear(); for (const [key, value] of saved.points) points.set(key, value);
      cooldowns.clear(); for (const [key, value] of saved.cooldowns) cooldowns.set(key, value);
      spottedAt.clear(); for (const [key, value] of saved.spotted) spottedAt.set(key, value);
      revealedUntil.clear(); for (const [key, value] of saved.revealed ?? []) revealedUntil.set(key, value);
      strikes.length = 0; for (const strike of saved.strikes) strikes.push({ ...strike });
      nextId = saved.nextId; trickles = saved.trickles; decideAt = saved.decideAt;
      delete botReconAt.alpha; delete botReconAt.bravo; Object.assign(botReconAt, saved.botReconAt ?? {});
    },
  };
}

function segmentPointDistanceSq(point: Point3, a: Point3, b: Point3): number {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const apx = point.x - a.x, apy = point.y - a.y, apz = point.z - a.z;
  const denom = abx * abx + aby * aby + abz * abz;
  const t = denom > 1e-9 ? Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / denom)) : 0;
  const dx = point.x - (a.x + abx * t), dy = point.y - (a.y + aby * t), dz = point.z - (a.z + abz * t);
  return dx * dx + dy * dy + dz * dz;
}
