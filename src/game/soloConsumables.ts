// src/game/soloConsumables.ts — the page battle's consumables (2026-10-26, the catalog): the same items as the
// authority (sim/consumableRules.ts), told through the page's bus events. A tank's loadout and per-life state
// (createSoloConsumables), a use from a key or a bot (useSoloConsumable), the timed items each step
// (tickSoloConsumables), and the APS and jammer reads the page's shells make. Copyright © 2026 Kevin B. Liu.

import { auxiliaryCapabilities } from '../sim/auxiliarySystems.ts';
import { replenishAmmunition } from '../sim/ammunition.ts';
import {
  GOVERNOR_STRAIN_HP_FRACTION, apsIntercepts, botConsumableLoadout, createConsumableState, jammerCovers,
  suppressNewFire, tickConsumables, useConsumableSlot,
  type ConsumableCombat, type ConsumableHost, type ConsumableId, type ConsumableState,
} from '../sim/consumableRules.ts';
import { repairAllModules, repairModules, strainModule } from '../sim/damage.ts';
import { consumableTiming, rulesetConsumableGate, type MatchRuleset } from '../sim/matchRuleset.ts';
import { consumableSpecFor, loadConsumables } from './consumableLoadout.ts';

interface SoloConsumableEntity {
  id: string;
  spec: { id?: string; era?: string; role?: string };
  combat: ConsumableCombat & {
    auxiliary?: { smokeCharges: number } | null;
    modules: Partial<Record<string, { state?: string }>>;
  };
  consumables?: ConsumableState;
}
/** A tank in the battle: its loadout, its team and where it stands (the jammer's read). */
interface SoloConsumableTank extends SoloConsumableEntity {
  spec: { id: string; era?: string; role?: string };
  specId: string;
  team: string;
  state: { pos: { x: number; z: number }; yaw: number };
  consumableItems?: ConsumableId[];
  consumableReadyAt?: number[];
}

interface SoloConsumableBus {
  emit(name: string, payload: object): void;
}

/** A Governor Override that ended strains the engine (one function for every tank: the tick allocates nothing). */
const strainEngine = (combat: SoloConsumableEntity['combat']): boolean =>
  strainModule(combat as Parameters<typeof strainModule>[0], 'engine', GOVERNOR_STRAIN_HP_FRACTION);

/** A tank's consumables for a new life: the player's saved loadout or a bot's role picks, within the mode's gate. */
export function createSoloConsumables(entity: SoloConsumableTank, ruleset: MatchRuleset, isPlayer: boolean): void {
  const vehicle = consumableSpecFor(entity.spec, !!auxiliaryCapabilities({ id: entity.specId })?.smoke?.length);
  const gate = rulesetConsumableGate(ruleset);
  entity.consumableItems ??= isPlayer ? loadConsumables(entity.specId, vehicle, gate) : botConsumableLoadout(vehicle, gate);
  entity.consumables = createConsumableState(entity.consumableItems, consumableTiming, entity.combat);
  entity.consumableReadyAt = entity.consumables.readyAt;
}

function soloHost(entity: SoloConsumableEntity, bus: SoloConsumableBus, timeS: number): ConsumableHost {
  const combat = entity.combat as Parameters<typeof repairAllModules>[0];
  return {
    timeS,
    repairAll: () => repairAllModules(combat),
    repair: (names) => repairModules(combat, names),
    restock: (fraction) => replenishAmmunition(entity.combat, fraction).totalAdded,
    smoke: entity.spec.id && auxiliaryCapabilities({ id: entity.spec.id })?.smoke?.length ? entity.combat.auxiliary ?? null : null,
    moduleRepaired: (module) => bus.emit('module:state', { id: entity.id, module, state: 'ok', source: 'repair-kit' }),
    fireOut: () => bus.emit('tank:fire', { id: entity.id, burning: false }),
  };
}

/** Use a slot's item (a key, a pad button or a bot's support bit); the result says what happened. */
export function useSoloConsumable(entity: SoloConsumableEntity, bus: SoloConsumableBus, slot: number, timeS: number) {
  if (!entity.consumables) return { ok: false as const, item: null, reason: 'NOTHING' as const };
  return useConsumableSlot(entity.consumables, slot, entity.combat, soloHost(entity, bus, timeS), consumableTiming);
}

/** Each step: every tank's timed items (ended effects, a strained engine, a suppressed fire). Allocation-free. */
export function tickSoloConsumables(
  tanks: readonly SoloConsumableTank[],
  bus: SoloConsumableBus,
  timeS: number,
  rng: () => number,
): void {
  for (const entity of tanks) {
    const state = entity.consumables;
    const combat = entity.combat;
    if (!state || combat.destroyed) continue;
    if (tickConsumables(state, combat, timeS, rng, strainEngine)) {
      bus.emit('module:state', { id: entity.id, module: 'engine', state: combat.modules.engine?.state ?? 'yellow' });
    }
    if (suppressNewFire(state, combat, timeS)) bus.emit('tank:fire', { id: entity.id, burning: false });
  }
}

/** Whether a round meets the struck tank's armed APS charge (spending it). */
export function soloApsIntercepts(
  entity: SoloConsumableTank,
  round: { readonly guided?: boolean; readonly type?: string },
  vel: { readonly x: number; readonly z: number },
  timeS: number,
): boolean {
  return apsIntercepts(entity.consumables, timeS, round, entity.state.yaw, vel.x, vel.z);
}

/** Whether a missile steered at `aim` is jammed: an enemy of the shooter with its IR Jammer on stands there. */
export function soloGuidanceJammed(
  tanks: readonly SoloConsumableTank[],
  shooterTeam: string,
  aim: { readonly x: number; readonly z: number } | null | undefined,
  timeS: number,
): boolean {
  if (!aim) return false;
  for (const tank of tanks) {
    if (tank.team === shooterTeam || tank.combat.destroyed) continue;
    if (jammerCovers(tank.consumables, timeS, tank.state.pos.x, tank.state.pos.z, aim.x, aim.z)) return true;
  }
  return false;
}
