/**
 * Air Support's rounds (air-support-270): the strafing run's 30 mm walked down its lane, the precision bomb's release and the
 * AC-130 orbit's 30 mm and 152 mm on the enemies its side has spotted. Stepped by both authorities (game/state.ts, the solo
 * battle; sim/authoritativeMatch.ts, the network) on the fixed step, after the mode controller has taken the calls: every
 * round is a normal shell in the normal projectile, armour and blast pipeline, credited to the strike's caller, and leaves
 * at a time derived from the strike's record (a round k leaves in the step whose interval holds its time), so the solo
 * battle, the authority and a migrated host fire the same rounds with no per-round state.
 */
import { Vector3 } from 'three';
import { createShell, type ShellEntity } from './ballistics.ts';
import { AIR_STRIKE_WEAPONS, GUNSHIP_WEAPONS } from './matchRuleset.ts';
import type { ShellSpec } from './shellSpec.ts';
import { aircraftPose, strafeLaneStart, strikeRandom, type AirStrike, type AirSupport } from './airSupport.ts';
import * as detMath from './detMath.ts';

interface FireTarget {
  id: string; team: string;
  state: { pos: { x: number; y: number; z: number } };
  combat: { destroyed: boolean };
  modeActive?: boolean;
}

export interface AirSupportFireContext<Target extends FireTarget> {
  entities: readonly Target[];
  /** Whether `team` has the enemy `id` spotted (the authority's own spotting system). */
  isSpotted(id: string, team: 'alpha' | 'bravo'): boolean;
  teamOf(entity: Target): 'alpha' | 'bravo';
  terrainHeight(x: number, z: number): number;
  nextId(): number;
  /** The authority takes the round into its shells and announces it to every viewer. */
  launch(shell: ShellEntity<ShellSpec>, strike: AirStrike): void;
}

/**
 * The event every viewer gets for an airstrike's round (mode_strike_round: a mode event, so the spotting filter never
 * withholds it; the caller is never named, only the strike): where it left, which way, and what it is, so the presentation
 * draws the tracer, the bomb and the sound from the aircraft rather than from the caller's hull.
 */
export function strikeRoundPayload(shell: ShellEntity<ShellSpec>, strike: AirStrike): Record<string, string | number | null> {
  const speed = shell.vel.length() || 1;
  return {
    strikeId: strike.id, kind: strike.kind, team: strike.team, shellId: shell.id,
    shellName: shell.spec.name, shellType: shell.spec.type, caliberMm: shell.spec.caliberMm, velocityMps: speed,
    weaponSound: typeof shell.spec.soundProfile === 'string' ? shell.spec.soundProfile : null,
    blastRadiusM: typeof shell.spec.blastRadiusM === 'number' ? shell.spec.blastRadiusM : null,
    x: shell.pos.x, y: shell.pos.y, z: shell.pos.z, dx: shell.vel.x / speed, dy: shell.vel.y / speed, dz: shell.vel.z / speed,
  };
}

const _pose = { x: 0, y: 0, z: 0, yaw: 0, bank: 0 };
const _from = new Vector3(), _dir = new Vector3(), _lane = { x: 0, z: 0 };

/** Does a periodic event at times `start + k * every` (k = 0..count-1) fall in (prevS, timeS]? Returns the k, or -1. */
function tickIn(start: number, every: number, count: number, prevS: number, timeS: number): number {
  if (timeS < start) return -1;
  const k = Math.floor((timeS - start) / every + 1e-9);
  if (k >= count || start + k * every <= prevS) return -1;
  return k;
}

/** A round leaves (x, y, z) toward the aim at its own speed, or on `flightS`'s solved arc onto the aim (the bomb). */
function fire<Target extends FireTarget>(ctx: AirSupportFireContext<Target>, strike: AirStrike, spec: ShellSpec,
  x: number, y: number, z: number, aimX: number, aimY: number, aimZ: number, flightS = 0): void {
  _from.set(x, y, z);
  _dir.set(aimX - x, aimY - y, aimZ - z).normalize();
  const shell = createShell(spec, strike.callerId, false, _from, _dir, ctx.nextId()) as ShellEntity<ShellSpec> & { strikeId?: number };
  // the round leaves the aircraft (or the battery), never the caller's hull: the authority shows it, its impact and its
  // hits to every viewer (sim/authoritativeMatch.ts), and names the strike rather than placing the caller
  shell.strikeId = strike.id;
  if (flightS > 0) {
    // a ballistic arc under the round's own gravity that meets the aim after flightS (stepShell integrates it exactly)
    const g = shell.gravityMps2;
    shell.vel.set((aimX - x) / flightS, (aimY - y) / flightS + 0.5 * g * flightS, (aimZ - z) / flightS);
  }
  ctx.launch(shell, strike);
}

/** Fire every round whose time falls in the step (prevS, timeS] of the mode clock. */
export function stepAirSupportFire<Target extends FireTarget>(support: AirSupport, prevS: number, timeS: number,
  ctx: AirSupportFireContext<Target>): void {
  const rules = support.rules;
  for (const strike of support.strikes) {
    if (strike.downedS != null && strike.downedS <= timeS) continue;
    if (strike.kind === 'recon') continue;
    if (strike.kind === 'artillery') {
      // the battery: round k lands at landsS + k * every (never before the warning has run) on a seeded point inside the
      // circle, plunging from altitudeM up and behind the mark along the heading, seen for its last flightS
      const a = rules.artillery, every = a.fireS / Math.max(1, a.rounds - 1);
      const k = tickIn(strike.landsS - a.flightS, every, a.rounds, prevS, timeS);
      if (k < 0) continue;
      const r = Math.sqrt(strikeRandom(support.seed, strike.id, k * 2)) * a.radiusM, bearing = strikeRandom(support.seed, strike.id, k * 2 + 1) * Math.PI * 2;
      const ax = strike.x + detMath.sin(bearing) * r, az = strike.z + detMath.cos(bearing) * r, ay = ctx.terrainHeight(ax, az);
      // a 70-degree fall: the round's last visible point stands altitude / tan(70) back toward the battery
      const back = a.altitudeM * 0.364;
      const sx = ax - detMath.sin(strike.heading) * back, sz = az - detMath.cos(strike.heading) * back;
      const landS = strike.landsS + k * every;
      fire(ctx, strike, AIR_STRIKE_WEAPONS.artillery, sx, ay + a.altitudeM, sz, ax, ay, az, landS + 0.05 - timeS);
      continue;
    }
    if (strike.kind === 'strafe') {
      const s = rules.strafe, every = s.fireS / Math.max(1, s.rounds - 1);
      const k = tickIn(strike.landsS, every, s.rounds, prevS, timeS);
      if (k < 0) continue;
      const pose = aircraftPose(rules, strike, strike.landsS + k * every, _pose);
      const start = strafeLaneStart(rules, strike, _lane);
      const along = s.lengthM * k / Math.max(1, s.rounds - 1);
      const sinH = detMath.sin(strike.heading), cosH = detMath.cos(strike.heading);
      // the burst's spread: across the lane and along it, seeded per round
      const across = (strikeRandom(support.seed, strike.id, k * 2) * 2 - 1) * s.spreadM;
      const jitter = (strikeRandom(support.seed, strike.id, k * 2 + 1) * 2 - 1) * s.spreadM * 0.5;
      const ax = start.x + sinH * (along + jitter) + cosH * across, az = start.z + cosH * (along + jitter) - sinH * across;
      fire(ctx, strike, AIR_STRIKE_WEAPONS.strafe, pose.x, pose.y, pose.z, ax, ctx.terrainHeight(ax, az), az);
    } else if (strike.kind === 'bomb') {
      const b = rules.bomb, releaseS = strike.landsS - b.fallS;
      if (tickIn(releaseS, 1, 1, prevS, timeS) < 0) continue;
      const pose = aircraftPose(rules, strike, releaseS, _pose);
      const miss = strikeRandom(support.seed, strike.id, 0) * b.missM, bearing = strikeRandom(support.seed, strike.id, 1) * Math.PI * 2;
      const ax = strike.x + detMath.sin(bearing) * miss, az = strike.z + detMath.cos(bearing) * miss;
      const ay = ctx.terrainHeight(ax, az);
      // the bomb falls on a ballistic arc that meets the spot a little after the warning has run (never before it)
      fire(ctx, strike, AIR_STRIKE_WEAPONS.bomb, pose.x, pose.y, pose.z, ax, ay, az, b.fallS + 0.05 - (timeS - releaseS));
    } else {
      const g = rules.gunship;
      const cannon = tickIn(strike.landsS, g.cannonEveryS, Math.floor(g.orbitS / g.cannonEveryS), prevS, timeS);
      const howitzer = tickIn(strike.landsS + g.cannonEveryS * 0.5, g.howitzerEveryS, Math.floor(g.orbitS / g.howitzerEveryS), prevS, timeS);
      if (cannon < 0 && howitzer < 0) continue;
      const target = gunshipTarget(ctx, strike, g.engageM);
      if (!target) continue;
      const pose = aircraftPose(rules, strike, timeS, _pose);
      if (cannon >= 0) {
        const spread = g.cannonSpreadM, u = strikeRandom(support.seed, strike.id, cannon * 3), v = strikeRandom(support.seed, strike.id, cannon * 3 + 1);
        const ax = target.state.pos.x + (u * 2 - 1) * spread, az = target.state.pos.z + (v * 2 - 1) * spread;
        fire(ctx, strike, GUNSHIP_WEAPONS[0]!, pose.x, pose.y, pose.z, ax, target.state.pos.y + 0.8, az);
      }
      if (howitzer >= 0) {
        const spread = g.howitzerSpreadM, u = strikeRandom(support.seed, strike.id, 10000 + howitzer * 3), v = strikeRandom(support.seed, strike.id, 10001 + howitzer * 3);
        const ax = target.state.pos.x + (u * 2 - 1) * spread, az = target.state.pos.z + (v * 2 - 1) * spread;
        fire(ctx, strike, GUNSHIP_WEAPONS[1]!, pose.x, pose.y, pose.z, ax, ctx.terrainHeight(ax, az) + 0.5, az);
      }
    }
  }
}

/** The AC-130's target: the spotted enemy nearest the orbit's mark within its reach (entity order breaks a tie). */
function gunshipTarget<Target extends FireTarget>(ctx: AirSupportFireContext<Target>, strike: AirStrike, reachM: number): Target | null {
  let best: Target | null = null, bestD = reachM * reachM;
  for (const entity of ctx.entities) {
    if (entity.combat.destroyed || entity.modeActive === false || ctx.teamOf(entity) === strike.team) continue;
    if (!ctx.isSpotted(entity.id, strike.team)) continue;
    const d = (entity.state.pos.x - strike.x) ** 2 + (entity.state.pos.z - strike.z) ** 2;
    if (d < bestD) { bestD = d; best = entity; }
  }
  return best;
}
