/**
 * A jump mode's moves beyond the jump (turbo-spin-275; owner 2026-11-22, Turbo Ball and Gravity): Turbo's leap with its
 * cooldown, and F's meaning by the hull's state (a boost in flight, thrust-boosts-279; the self-right overturned, else the
 * jump).
 * One rule for both drivers' action step (sim/hullActions.ts) and the solo player's press (game/playerBattleActions.ts),
 * in a leaf the client's lazy battle chunk can take without the action step's imports. Node-runnable.
 */
import type { AirSpinRules, TurboRules } from './matchRuleset.ts';
import { applyTankTurbo, requestTankBoost, requestTankJump, tankAirborne } from './movement.ts';
import { requestTankSelfRight } from './rollover.ts';

/** A hull's turbo and air spin: the mode's rules, stamped as the jump is (matchModes.ts stampPhysics). */
export interface TurboHull {
  modeTurbo?: TurboRules | null;
  modeAirSpin?: AirSpinRules | null;
  /** The match time (s) the next turbo is ready at; absent: ready. A migrated host restores it (MigrationEntityExtras). */
  turboReadyS?: number;
  /** The match time (s) the next boost press is ready at (flip-boost-276; the gap between boosts since thrust-boosts-279);
   *  absent: ready. Migrated as the turbo's is. */
  airSpinReadyS?: number;
}

/** Seconds until the hull's turbo is ready (0: ready, or no turbo). The HUD reads it; the press checks it. */
export function turboReadyIn(entity: TurboHull, timeS: number): number {
  return entity.modeTurbo ? Math.max(0, (entity.turboReadyS ?? -Infinity) - timeS) : 0;
}

/**
 * A turbo press (turbo-spin-275): the mode's leap (movement.ts applyTankTurbo; in flight the butt's burn,
 * thrust-boosts-279) when its cooldown has run, then the cooldown again. Both drivers and the solo player's press take
 * this one rule.
 */
export function requestHullTurbo(entity: TurboHull & { state: NonNullable<Parameters<typeof applyTankTurbo>[0]> }, timeS: number): boolean {
  const turbo = entity.modeTurbo;
  if (!turbo || turboReadyIn(entity, timeS) > 0) return false;
  if (!applyTankTurbo(entity.state, turbo.forwardMps, turbo.liftMps)) return false;
  entity.turboReadyS = timeS + turbo.cooldownS;
  return true;
}

/** Seconds until the hull's next boost press is ready (flip-boost-276; 0: ready, or no boosts). */
export function airSpinReadyIn(entity: TurboHull, timeS: number): number {
  return entity.modeAirSpin ? Math.max(0, (entity.airSpinReadyS ?? -Infinity) - timeS) : 0;
}

/** A hull that can boost. */
type AirSpinHull = TurboHull & { state: NonNullable<Parameters<typeof requestTankBoost>[0]>; input: { throttle?: number; steer?: number } };

/**
 * A boost press (the air-spin action; thrust-boosts-279): the nozzle the drive picks (movement.ts requestTankBoost: the
 * belly, the nose or a side) when the gap since the last press has run, then the gap again. The nozzle fired, or 0. Both
 * drivers and the solo player's press take this one rule.
 */
export function requestHullAirSpin(entity: AirSpinHull, timeS: number): number {
  const rules = entity.modeAirSpin;
  if (!rules || airSpinReadyIn(entity, timeS) > 0) return 0;
  const nozzle = requestTankBoost(entity.state, entity.input.throttle ?? 0, entity.input.steer ?? 0, rules);
  if (nozzle) entity.airSpinReadyS = timeS + rules.cooldownS;
  return nozzle;
}

/**
 * F's press (SELF_RIGHT) in a mode with boosts: a boost while the hull flies (thrust-boosts-279: the belly's climb with W or
 * no drive, a side or the nose with A/D or S; requestHullAirSpin); otherwise the self-right, else the jump. 'spin' |
 * 'right' | 'jump' | null for what it did ('spin' the boost, as the event names it).
 */
export function pressSelfRight(
  entity: AirSpinHull & { state: Parameters<typeof requestTankSelfRight>[0] & Parameters<typeof requestTankJump>[0];
    modeGravityScale?: number; modeJumpMps?: number | null },
  timeS: number,
): 'spin' | 'right' | 'jump' | null {
  if (entity.modeAirSpin && tankAirborne(entity.state)) return requestHullAirSpin(entity, timeS) ? 'spin' : null;
  if (requestTankSelfRight(entity.state, entity.modeGravityScale ?? 1)) return 'right';
  return requestTankJump(entity.state, entity.modeJumpMps, entity.modeGravityScale ?? 1) ? 'jump' : null;
}
