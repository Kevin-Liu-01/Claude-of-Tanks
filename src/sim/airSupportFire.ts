/**
 * Air Support's rounds (air-support-270): the strafing run's 30 mm walked down its lane, the precision bomb's release and the
 * AC-130 orbit's 30 mm and 152 mm on the enemies its side has spotted. Each leaves the aircraft where its run puts it
 * (sim/strikeRuns.ts, air-support-runs-272): the GAU-8 under the strafing jet's nose, the bomb from the jet's pylon at its
 * release point with the jet's own velocity, the gunship's guns from its left side. Stepped by both authorities (game/state.ts, the solo
 * battle; sim/authoritativeMatch.ts, the network) on the fixed step, after the mode controller has taken the calls: every
 * round is a normal shell in the normal projectile, armour and blast pipeline, credited to the strike's caller, and leaves
 * at a time derived from the strike's record (a round k leaves in the step whose interval holds its time), so the solo
 * battle, the authority and a migrated host fire the same rounds with no per-round state.
 */
import { Vector3 } from 'three';
import { createShell, type ShellEntity } from './ballistics.ts';
import { AIR_STRIKE_WEAPONS, GUNSHIP_WEAPONS } from './matchRuleset.ts';
import type { ShellSpec } from './shellSpec.ts';
import { strikeRandom, type AirStrike, type AirSupport } from './airSupport.ts';
import { bombReleaseOffsetS, runMuzzle, runPose, strafeLaneStart, type RunPose } from './strikeRuns.ts';
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

const _pose: RunPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0 };
const _from = new Vector3(), _dir = new Vector3(), _lane = { x: 0, z: 0 }, _muzzle = { x: 0, y: 0, z: 0 };

/**
 * The next round of a stream whose round k is due at `start + k * every` (k = 0..count-1), `fired` of them gone: its k
 * once its time has come (the tolerance the old window had), else -1. One round per stream per step. A count replaces
 * the float window (improve-271 plan 007: a round due a few ulps after a tick fired on that tick and the next, the
 * AC-130's 30 mm 119 times for a rule of 60).
 */
function nextRound(start: number, every: number, count: number, fired: number, timeS: number): number {
  if (fired >= count || timeS < start) return -1;
  return (timeS - start) / every + 1e-9 >= fired ? fired : -1;
}

/** A strike an older host sealed has no count: the rounds due by the previous step had left. */
function firedBy(count: number | undefined, start: number, every: number, rounds: number, prevS: number): number {
  if (typeof count === 'number') return count;
  return prevS < start ? 0 : Math.min(rounds, Math.floor((prevS - start) / every + 1e-9) + 1);
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
      const a = rules.artillery, every = a.fireS / Math.max(1, a.rounds - 1), start = strike.landsS - a.flightS;
      const k = nextRound(start, every, a.rounds, firedBy(strike.fired, start, every, a.rounds, prevS), timeS);
      if (k < 0) continue;
      strike.fired = k + 1;
      const r = Math.sqrt(strikeRandom(support.seed, strike.id, k * 2)) * a.radiusM, bearing = strikeRandom(support.seed, strike.id, k * 2 + 1) * Math.PI * 2;
      const ax = strike.x + detMath.sin(bearing) * r, az = strike.z + detMath.cos(bearing) * r, ay = ctx.terrainHeight(ax, az);
      // a 70-degree fall: the round's last visible point stands altitude / tan(70) back toward the battery
      const back = a.altitudeM * 0.364;
      const sx = ax - detMath.sin(strike.heading) * back, sz = az - detMath.cos(strike.heading) * back;
      const landS = strike.landsS + k * every;
      fire(ctx, strike, AIR_STRIKE_WEAPONS.artillery, sx, ay + a.altitudeM, sz, ax, ay, az, landS + rules.fallMarginS - timeS);
      continue;
    }
    if (strike.kind === 'strafe') {
      const s = rules.strafe, every = s.fireS / Math.max(1, s.rounds - 1);
      const k = nextRound(strike.landsS, every, s.rounds, firedBy(strike.fired, strike.landsS, every, s.rounds, prevS), timeS);
      if (k < 0) continue;
      strike.fired = k + 1;
      const muzzle = runMuzzle(runPose(rules, strike, strike.landsS + k * every, _pose), 'strafe', _muzzle);
      const start = strafeLaneStart(rules, strike, _lane);
      const along = s.lengthM * k / Math.max(1, s.rounds - 1);
      const sinH = detMath.sin(strike.heading), cosH = detMath.cos(strike.heading);
      // the burst's spread: across the lane and along it, seeded per round
      const across = (strikeRandom(support.seed, strike.id, k * 2) * 2 - 1) * s.spreadM;
      const jitter = (strikeRandom(support.seed, strike.id, k * 2 + 1) * 2 - 1) * s.spreadM * 0.5;
      const ax = start.x + sinH * (along + jitter) + cosH * across, az = start.z + cosH * (along + jitter) - sinH * across;
      fire(ctx, strike, AIR_STRIKE_WEAPONS.strafe, muzzle.x, muzzle.y, muzzle.z, ax, ctx.terrainHeight(ax, az), az);
    } else if (strike.kind === 'bomb') {
      const b = rules.bomb, releaseS = strike.landsS + bombReleaseOffsetS(rules);
      if (nextRound(releaseS, 1, 1, firedBy(strike.fired, releaseS, 1, 1, prevS), timeS) < 0) continue;
      strike.fired = 1;
      // the bomb leaves the jet's pylon at the release point, the jet's velocity its own (strikeRuns.ts bombFall): its
      // miss is long along the run and short across it, inside the footprint's ellipse
      const muzzle = runMuzzle(runPose(rules, strike, releaseS, _pose), 'bomb', _muzzle);
      const r = Math.sqrt(strikeRandom(support.seed, strike.id, 0)), bearing = strikeRandom(support.seed, strike.id, 1) * Math.PI * 2;
      const along = detMath.cos(bearing) * r * b.missAlongM, across = detMath.sin(bearing) * r * b.missAcrossM;
      const sinH = detMath.sin(strike.heading), cosH = detMath.cos(strike.heading);
      const ax = strike.x + sinH * along + cosH * across, az = strike.z + cosH * along - sinH * across;
      const ay = ctx.terrainHeight(ax, az);
      // the bomb falls on a ballistic arc that meets the spot a little after the warning has run (never before it)
      fire(ctx, strike, AIR_STRIKE_WEAPONS.bomb, muzzle.x, muzzle.y, muzzle.z, ax, ay, az, strike.landsS + rules.fallMarginS - timeS);
    } else {
      const g = rules.gunship;
      const cannonRounds = Math.floor(g.orbitS / g.cannonEveryS), howitzerRounds = Math.floor(g.orbitS / g.howitzerEveryS);
      const howitzerStart = strike.landsS + g.cannonEveryS * 0.5;
      const cannon = nextRound(strike.landsS, g.cannonEveryS, cannonRounds,
        firedBy(strike.fired, strike.landsS, g.cannonEveryS, cannonRounds, prevS), timeS);
      const howitzer = nextRound(howitzerStart, g.howitzerEveryS, howitzerRounds,
        firedBy(strike.firedAux, howitzerStart, g.howitzerEveryS, howitzerRounds, prevS), timeS);
      if (cannon < 0 && howitzer < 0) continue;
      // a due round is spent whether or not the gunship has a spotted enemy in reach (as ever: no target, no shot)
      if (cannon >= 0) strike.fired = cannon + 1;
      if (howitzer >= 0) strike.firedAux = howitzer + 1;
      const target = gunshipTarget(ctx, strike, g.radiusM);
      if (!target) continue;
      const pose = runMuzzle(runPose(rules, strike, timeS, _pose), 'gunship', _muzzle);
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
