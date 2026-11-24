/** Local reflexes shared by Classic and Jev. All commands pass through the same
 * inventory, cooldown, physics and spotting rules as a player's controls. */
import { PLAYER_ACTION_BITS } from '../sim/playerActions.ts'; // the shared action table (src/net left with v1)
import { auxiliaryCapabilities } from '../vehicles/auxiliaryInventory.ts';
import { SMOKE_COOLDOWN_S, type AuxiliaryState } from '../sim/auxiliarySystems.ts';
import { AIR_SPIN_RATE, canTankAirSpin, tankAirborne, type HullFlightState } from '../sim/hullFlight.ts';
import { turboReadyIn, type TurboHull } from '../sim/modeMoves.ts';

import * as detMath from '../sim/detMath.ts';
interface AbilityEntity extends TurboHull {
  modeActive?: boolean;
  modeJumpMps?: number | null;
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
}

/** An enemy aircraft this close mans the roof gun (the stations' counter-air reach, a 30 mm's 300 m x 1.5). */
const AIR_THREAT_M = 450;

/**
 * Bot Turbo and air spin (bot-turbo-276; owner 2026-11-22, turbo-spin-275 left bots out): Turbo is taken at a chase dead
 * ahead, on the ground at `groundMinM`-`groundMaxM` from it at `minSpeedMps` or faster and drive held, and in flight
 * (after a jump or a recoil launch) once the climb is spent (`apexMps` or less) at up to `airMaxM`, to reach farther;
 * the landing is probed first either way, and a leap at a tank comes down `targetStandoffM` short of it (no ram). The air
 * spin is one flip or roll a flight, pressed early in a real climb (ride airtime `spinAfterS`-`spinWindowS`, still rising
 * at `spinClimbMps`: a hop off a bump is no flight) and only with the whole turn and `spinMarginS` of flight still
 * ahead, so the hull lands on its tracks; its axis is the drive the bot holds (W a front flip, A/D a roll).
 */
export const BOT_TURBO = Object.freeze({
  groundMinM: 12, groundMaxM: 80, airMaxM: 140, minSpeedMps: 3, apexMps: 1.5, targetStandoffM: 20,
  spinAfterS: 0.15, spinWindowS: 0.6, spinClimbMps: 2, spinMarginS: 0.35,
});
const AIR_SPIN_TURN_S = 2 * Math.PI / AIR_SPIN_RATE;

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
    if (timeS < nextThinkS || turboReadyIn(entity, timeS) > 0 || entity.state._body?.autoRighting === true) return false;
    const chaseM = context.chaseM ?? Infinity;
    if (context.retreating || !(chaseM >= BOT_TURBO.groundMinM)) return false;
    if (tankAirborne(entity.state)) {
      return chaseM <= BOT_TURBO.airMaxM && (entity.state.verticalSpeed ?? 0) <= BOT_TURBO.apexMps;
    }
    return !entity.state.overturned && chaseM <= BOT_TURBO.groundMaxM && entity.state.speed >= BOT_TURBO.minSpeedMps;
  }

  /** One flip or roll a flight, early in it, with the whole turn still ahead of the landing. */
  function airSpinDue(entity: AbilityEntity, context: BotAbilityContext): boolean {
    const airTime = entity.state._ride?.airTime ?? 0;
    return !!entity.modeAirSpin && canTankAirSpin(entity.state)
      && airTime >= BOT_TURBO.spinAfterS && airTime <= BOT_TURBO.spinWindowS
      && (entity.state.verticalSpeed ?? 0) >= BOT_TURBO.spinClimbMps
      && (context.flightS ?? 0) >= AIR_SPIN_TURN_S + BOT_TURBO.spinMarginS;
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
        && timeS >= (aux?.smokeReadyAt ?? 0) && timeS >= nextSmokeS) {
      bits |= PLAYER_ACTION_BITS.SMOKE;
      nextSmokeS = timeS + SMOKE_COOLDOWN_S;
    }
    if (jump) { bits |= PLAYER_ACTION_BITS.SELF_RIGHT; nextJumpS = timeS + 10; }
    if (turbo) bits |= PLAYER_ACTION_BITS.TURBO;
    if (airSpinDue(entity, context)) bits |= PLAYER_ACTION_BITS.AIR_SPIN;
    return bits;
  }
  return { update, jumpEligible, turboEligible };
}
