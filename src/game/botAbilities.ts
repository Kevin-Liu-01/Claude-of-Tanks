/** Local reflexes shared by Classic and Jev. All commands pass through the same
 * inventory, cooldown, physics and spotting rules as a player's controls. */
import { PLAYER_ACTION_BITS } from '../sim/playerActions.ts'; // the shared action table (src/net left with v1)
import { auxiliaryCapabilities } from '../vehicles/auxiliaryInventory.ts';
import { SMOKE_COOLDOWN_S, type AuxiliaryState } from '../sim/auxiliarySystems.ts';

interface AbilityEntity {
  modeActive?: boolean;
  modeJumpMps?: number | null;
  state: { yaw: number; turretYaw: number; speed: number; grounded: boolean; overturned?: boolean };
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
  /** The caller probes the landing corridor only when jumpEligible returns true. */
  safeJump: boolean;
}

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
      && timeS - context.hitAtS < 2.5 && context.reloadS > 1.5 && context.retreating;
  }

  function update(entity: AbilityEntity, timeS: number, context: BotAbilityContext): number {
    const combat = entity.combat;
    if (!combat || combat.destroyed || entity.modeActive === false || entity.state.overturned) return 0;
    if (timeS < nextThinkS) return 0;
    const jump = jumpEligible(entity, timeS, context) && context.safeJump;
    nextThinkS = timeS + 0.25;
    let bits = 0;
    const aux = combat.auxiliary;
    // Automatic night lighting reveals a moving hull. Bots explicitly black out
    // their own lights, using the same player control, rather than changing vision.
    if (kit?.lights && aux?.lights !== 0) bits |= PLAYER_ACTION_BITS.LIGHTS_OFF;
    if (context.contactM <= 240) lastContactS = timeS;
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
          + Math.atan2(mount.direction[0], mount.direction[2]);
        if (Math.cos(context.hitBearing - yaw) > 0.5) { screensThreat = true; break; }
      }
    }
    if (screensThreat && entity.state.grounded && (aux?.smokeCharges ?? 3) > 0
        && timeS >= (aux?.smokeReadyAt ?? 0) && timeS >= nextSmokeS) {
      bits |= PLAYER_ACTION_BITS.SMOKE;
      nextSmokeS = timeS + SMOKE_COOLDOWN_S;
    }
    if (jump) { bits |= PLAYER_ACTION_BITS.SELF_RIGHT; nextJumpS = timeS + 10; }
    return bits;
  }
  return { update, jumpEligible };
}
