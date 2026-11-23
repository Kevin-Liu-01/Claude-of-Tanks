/**
 * A jump mode's moves beyond the jump (turbo-spin-275; owner 2026-11-22, Turbo Ball and Gravity): Turbo's leap with its
 * cooldown, and F's meaning by the hull's state (a flip or roll in flight, the self-right overturned, else the jump).
 * One rule for both drivers' action step (sim/hullActions.ts) and the solo player's press (game/playerBattleActions.ts),
 * in a leaf the client's lazy battle chunk can take without the action step's imports. Node-runnable.
 */
import type { TurboRules } from './matchRuleset.ts';
import { applyTankTurbo, requestTankAirSpin, requestTankJump, tankAirborne } from './movement.ts';
import { requestTankSelfRight } from './rollover.ts';

/** A hull's turbo and air spin: the mode's rules, stamped as the jump is (matchModes.ts stampPhysics). */
export interface TurboHull {
  modeTurbo?: TurboRules | null;
  modeAirSpin?: boolean;
  /** The match time (s) the next turbo is ready at; absent: ready. A migrated host restores it (MigrationEntityExtras). */
  turboReadyS?: number;
}

/** Seconds until the hull's turbo is ready (0: ready, or no turbo). The HUD reads it; the press checks it. */
export function turboReadyIn(entity: TurboHull, timeS: number): number {
  return entity.modeTurbo ? Math.max(0, (entity.turboReadyS ?? -Infinity) - timeS) : 0;
}

/**
 * A turbo press (turbo-spin-275): the mode's leap (movement.ts applyTankTurbo) when its cooldown has run, then the
 * cooldown again. Both drivers and the solo player's press take this one rule.
 */
export function requestHullTurbo(entity: TurboHull & { state: NonNullable<Parameters<typeof applyTankTurbo>[0]> }, timeS: number): boolean {
  const turbo = entity.modeTurbo;
  if (!turbo || turboReadyIn(entity, timeS) > 0) return false;
  if (!applyTankTurbo(entity.state, turbo.forwardMps, turbo.liftMps)) return false;
  entity.turboReadyS = timeS + turbo.cooldownS;
  return true;
}

/**
 * F's press (SELF_RIGHT) in a mode with the air spin: a flip or roll while the hull flies (owner 2026-11-22: "F spins in
 * air"); otherwise the self-right, else the jump. 'spin' | 'right' | 'jump' | null for what it did.
 */
export function pressSelfRight(
  entity: TurboHull & { state: Parameters<typeof requestTankSelfRight>[0] & Parameters<typeof requestTankAirSpin>[0] & Parameters<typeof requestTankJump>[0];
    input: { throttle?: number; steer?: number }; modeGravityScale?: number; modeJumpMps?: number | null },
): 'spin' | 'right' | 'jump' | null {
  if (entity.modeAirSpin && tankAirborne(entity.state)) {
    return requestTankAirSpin(entity.state, entity.input.throttle ?? 0, entity.input.steer ?? 0) ? 'spin' : null;
  }
  if (requestTankSelfRight(entity.state, entity.modeGravityScale ?? 1)) return 'right';
  return requestTankJump(entity.state, entity.modeJumpMps, entity.modeGravityScale ?? 1) ? 'jump' : null;
}
