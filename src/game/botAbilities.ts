/** Local reflexes shared by Classic and Jev. All commands pass through the same
 * inventory, cooldown, physics and spotting rules as a player's controls. */
import { PLAYER_ACTION_BITS } from '../sim/playerActions.ts'; // the shared action table (src/net left with v1)
import { auxiliaryCapabilities } from '../vehicles/auxiliaryInventory.ts';
import { SMOKE_COOLDOWN_S, type AuxiliaryState } from '../sim/auxiliarySystems.ts';
import { BOOST_BURN_S, BOOST_NOZZLES, boostNozzleFor, canTankBoost, tankAirborne, type HullFlightState } from '../sim/hullFlight.ts';
import { turboReadyIn, type TurboHull } from '../sim/modeMoves.ts';

import * as detMath from '../sim/detMath.ts';
interface AbilityEntity extends TurboHull {
  modeActive?: boolean;
  modeJumpMps?: number | null;
  /** The drive the bot holds this tick, which picks the boost's nozzle (sim/hullFlight.ts boostNozzleFor). */
  input?: { throttle?: number; steer?: number };
  state: HullFlightState & { yaw: number; turretYaw: number; speed: number; verticalSpeed?: number; grounded: boolean; overturned?: boolean };
  combat?: { hp: number; maxHp: number; destroyed: boolean; auxiliary?: AuxiliaryState };
}
export interface BotAbilityContext {
  /** Bearing recorded at impact; never follows the position of an unseen attacker. */
  hitBearing: number;
  hitAtS: number;
  retreating: boolean;
  reloadS: number;
  /** A personally clear, team-spotted contact, or Infinity. */
  contactM: number;
  /** Air Support (air-support-270): the nearest enemy aircraft in the air, or Infinity; the roof gun manned for it. */
  airThreatM?: number;
  /** The caller probes the landing corridor only when jumpEligible returns true. */
  safeJump: boolean;
  /**
   * An offensive jump is due (gameplay-modes-228, the Turbo Ball striker's `offensiveJump` doctrine): the ball close
   * ahead on the ram line. The caller decides it; the cooldown, the ground and the landing checks stay these.
   */
  offensive?: boolean;
  /**
   * Turbo and the air spin (bot-turbo-276), in the modes that carry them (MatchRuleset.turbo / airSpin): the distance to
   * what the hull chases dead ahead on its bow (the Turbo Ball striker's ball, else a target in sight), Infinity when none.
   */
  chaseM?: number;
  /** The caller probes Turbo's landing only when turboEligible returns true. */
  safeTurbo?: boolean;
  /** Seconds until the hull in flight meets the ground (0 on the ground), from its height and climb. */
  flightS?: number;
  /** The hull's own clock, its smoke kit's readyAt's (275: a migrated authority's restarts at 0 while the brain's goes
   *  on from the old host's battle clock); absent: the brain's. */
  hullS?: number;
}

/** An enemy aircraft this close mans the roof gun (the stations' counter-air reach, a 30 mm's 300 m x 1.5). */
const AIR_THREAT_M = 450;

/**
 * Bot Turbo and boost (bot-turbo-276; owner 2026-11-22, turbo-spin-275 left bots out): Turbo is taken at a chase dead
 * ahead on the ground, `groundMinM`-`groundMaxM` from it at `minSpeedMps` or faster and drive held, the landing probed
 * first, and a leap at a tank comes down `targetStandoffM` short of it (no ram). Never in flight (thrust-boosts-279,
 * Main's ruling 5: in flight Turbo fires the butt's nozzles, whose nose-down turn would plant a bot's nose). The boost is
 * the belly's alone (no turn: the hull lands on its tracks), one a flight, pressed early in a real climb (ride airtime
 * `spinAfterS`-`spinWindowS`, still rising at `spinClimbMps`: a hop off a bump is no flight) with the burn and
 * `spinMarginS` of flight still ahead, and only while the drive the bot holds picks the belly (W or none, not A/D or S).
 */
export const BOT_TURBO = Object.freeze({
  groundMinM: 12, groundMaxM: 80, minSpeedMps: 3, targetStandoffM: 20,
  spinAfterS: 0.15, spinWindowS: 0.6, spinClimbMps: 2, spinMarginS: 0.35,
});

export function createBotAbilityPlanner(spec: { id: string }) {
  const kit = auxiliaryCapabilities(spec);
  let nextThinkS = -Infinity;
  let nextSmokeS = -Infinity;
  let nextJumpS = -Infinity;
  let lastContactS = -Infinity;
  let nextGunToggleS = -Infinity;

  function jumpEligible(entity: AbilityEntity, timeS: number, context: BotAbilityContext): boolean {
    return !!entity.combat && !entity.combat.destroyed && entity.modeActive !== false
      && (entity.modeJumpMps ?? 0) > 0 && timeS >= nextJumpS && timeS >= nextThinkS
      && entity.state.grounded && !entity.state.overturned && entity.state.speed > 3
      && (context.offensive === true || (timeS - context.hitAtS < 2.5 && context.reloadS > 1.5 && context.retreating));
  }

  /** Turbo would be pressed now but for its landing probe (the caller's, into context.safeTurbo). */
  function turboEligible(entity: AbilityEntity, timeS: number, context: BotAbilityContext): boolean {
    if (!entity.modeTurbo || !entity.combat || entity.combat.destroyed || entity.modeActive === false) return false;
    // Turbo's cooldown runs on the hull's clock, as its smoke's does (275: a migrated authority's restarts at 0)
    if (timeS < nextThinkS || turboReadyIn(entity, context.hullS ?? timeS) > 0 || entity.state._body?.autoRighting === true) return false;
    const chaseM = context.chaseM ?? Infinity;
    if (context.retreating || !(chaseM >= BOT_TURBO.groundMinM) || tankAirborne(entity.state)) return false;
    return !entity.state.overturned && chaseM <= BOT_TURBO.groundMaxM && entity.state.speed >= BOT_TURBO.minSpeedMps;
  }

  /** One belly boost a flight, early in it, with the burn still ahead of the landing. */
  function airSpinDue(entity: AbilityEntity, context: BotAbilityContext): boolean {
    const rules = entity.modeAirSpin;
    const airTime = entity.state._ride?.airTime ?? 0;
    return !!rules && tankAirborne(entity.state) && canTankBoost(entity.state, rules.charges)
      && (entity.state._boostsUsed ?? 0) === 0
      && boostNozzleFor(entity.input?.throttle ?? 0, entity.input?.steer ?? 0) === BOOST_NOZZLES.UP
      && airTime >= BOT_TURBO.spinAfterS && airTime <= BOT_TURBO.spinWindowS
      && (entity.state.verticalSpeed ?? 0) >= BOT_TURBO.spinClimbMps
      && (context.flightS ?? 0) >= BOOST_BURN_S + BOT_TURBO.spinMarginS;
  }

  function update(entity: AbilityEntity, timeS: number, context: BotAbilityContext): number {
    const combat = entity.combat;
    if (!combat || combat.destroyed || entity.modeActive === false || entity.state.overturned) return 0;
    if (timeS < nextThinkS) return 0;
    const jump = jumpEligible(entity, timeS, context) && context.safeJump;
    // never the jump and Turbo on one tick: Turbo after a jump is the air dash, pressed once the climb is spent
    const turbo = !jump && turboEligible(entity, timeS, context) && context.safeTurbo === true;
    nextThinkS = timeS + 0.25;
    let bits = 0;
    const aux = combat.auxiliary;
    // Automatic night lighting reveals a moving hull. Bots explicitly black out
    // their own lights, using the same player control, rather than changing vision.
    if (kit?.lights && aux?.lights !== 0) bits |= PLAYER_ACTION_BITS.LIGHTS_OFF;
    if (context.contactM <= 240 || (context.airThreatM ?? Infinity) <= AIR_THREAT_M) lastContactS = timeS;
    const wantsGun = timeS - lastContactS < 3;
    if (kit?.guns.length && wantsGun !== !!aux?.gunOn && timeS >= nextGunToggleS) {
      bits |= PLAYER_ACTION_BITS.ROOF_GUN;
      nextGunToggleS = timeS + 1;
    }
    const endangered = combat.hp / Math.max(1, combat.maxHp) < 0.45
      || (context.retreating && context.reloadS > 1.5);
    const recentHit = timeS >= context.hitAtS && timeS - context.hitAtS < 2.5;
    // Check the authored launcher directions in their hull/turret frames. A
    // screen behind the incoming threat is wasted, even if the gun faces it.
    let screensThreat = false;
    if (kit && endangered && recentHit) {
      for (const mount of kit.smoke) {
        const yaw = entity.state.yaw + (mount.owner === 'turret' ? entity.state.turretYaw : 0)
          + detMath.atan2(mount.direction[0], mount.direction[2]);
        if (detMath.cos(context.hitBearing - yaw) > 0.5) { screensThreat = true; break; }
      }
    }
    if (screensThreat && entity.state.grounded && (aux?.smokeCharges ?? 3) > 0
        && (context.hullS ?? timeS) >= (aux?.smokeReadyAt ?? 0) && timeS >= nextSmokeS) {
      bits |= PLAYER_ACTION_BITS.SMOKE;
      nextSmokeS = timeS + SMOKE_COOLDOWN_S;
    }
    if (jump) { bits |= PLAYER_ACTION_BITS.SELF_RIGHT; nextJumpS = timeS + 10; }
    if (turbo) bits |= PLAYER_ACTION_BITS.TURBO;
    if (airSpinDue(entity, context)) bits |= PLAYER_ACTION_BITS.AIR_SPIN;
    return bits;
  }
  /** The planner's clocks, on the brain's clock (275: a migration keyframe carries them with the brain, game/ai.ts
   *  BotBrain): the next think, smoke, jump and roof-gun switch, and the last contact. */
  function clocks(): number[] {
    return [nextThinkS, nextSmokeS, nextJumpS, lastContactS, nextGunToggleS];
  }
  /** The old host's clocks taken up (275); a list that is not five numbers changes nothing. */
  function setClocks(values: readonly number[]): void {
    if (!Array.isArray(values) || values.length !== 5 || !values.every((value) => typeof value === 'number' && !Number.isNaN(value))) return;
    [nextThinkS, nextSmokeS, nextJumpS, lastContactS, nextGunToggleS] = values;
  }
  return { update, jumpEligible, turboEligible, clocks, setClocks };
}
