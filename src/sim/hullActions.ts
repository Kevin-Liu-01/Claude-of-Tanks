/**
 * One hull's actions each tick (268, Main: "one consumables path"; docs/ARCHITECTURE.md "One core, two drivers"): the
 * presses a staged hull's controls carry (sim/playerActions.ts bits: a mode's supply, smoke, a drone, lights, the roof gun,
 * a magazine reload, its special action, a self-right, its consumables), applied as the authority applies them, right after
 * its controls are staged (sim/playerInputStage.ts), then its timed consumables ticked. Both drivers call these for every
 * active hull in roster order, bots and seats alike, so a press lands the same tick in the same order on either driver
 * (src/sim/driverStepParity.selftest.mjs); what only a driver does (its events, its smoke screens' list, the mode's supply)
 * is its host's. The solo battle's own player presses through its UI (game/playerBattleActions.ts); its bits stay 0.
 */
import { replenishAmmunition } from './ammunition.ts';
import { auxiliaryCapabilities, requestAuxiliary } from './auxiliarySystems.ts';
import type { SmokeScreen } from './auxiliarySystems.ts';
import {
  CONSUMABLE_SLOTS, GOVERNOR_STRAIN_HP_FRACTION, suppressNewFire, tickConsumables,
  useConsumableSlot as useConsumableSlotRule,
} from './consumableRules.ts';
import type { ConsumableHost, ConsumableState } from './consumableRules.ts';
import { magazineReloadDenialReason, repairAllModules, repairModules, startMagazineReload, strainModule } from './damage.ts';
import { AIR_STRIKE_KINDS, consumableTiming } from './matchRuleset.ts';
import type { AirStrikeKind } from './matchRuleset.ts';
import { requestTankJump } from './movement.ts';
import { AIR_STRIKE_BITS, PLAYER_ACTION_BITS } from './playerActions.ts';
import { requestTankSelfRight } from './rollover.ts';
import { activateSpecialAction } from './specialActions.ts';

type ActionHull = Parameters<typeof requestAuxiliary>[0] & NonNullable<Parameters<typeof activateSpecialAction>[0]> & {
  id: string;
  input: { actionBits: number; auxiliaryBits?: number };
  combat: Parameters<typeof startMagazineReload>[0] & Parameters<typeof repairAllModules>[0] & Parameters<typeof strainModule>[0];
  spec: Parameters<typeof startMagazineReload>[1] & Parameters<typeof auxiliaryCapabilities>[0];
  state: Parameters<typeof requestTankSelfRight>[0] & Parameters<typeof requestTankJump>[0];
  consumables?: ConsumableState;
  modeGravityScale?: number;
  modeJumpMps?: number | null;
};

type ConsumableUse = ReturnType<typeof useConsumableSlotRule>;

/** What only a driver does with a hull's actions: the match's clock, gates and streams, and its events. */
export interface HullActionsHost<Hull extends ActionHull> {
  readonly timeS: number;
  /** A verdict silences the field's requests (supply, smoke, a drone, lights, the roof gun). */
  readonly verdict: boolean;
  /** The mode's consumables gate (MatchRuleset.consumables). */
  readonly consumables: boolean;
  /** The match's combat stream (a strained engine's roll). */
  readonly rng: () => number;
  readonly ground: (x: number, z: number) => number;
  readonly world: Parameters<typeof requestAuxiliary>[4];
  readonly wind: Parameters<typeof requestAuxiliary>[5];
  supply(entity: Hull, kind: 'ammo' | 'heal'): void;
  /** Air Support (air-support-270): a call-in pressed, called at the hull's aim point; absent where the driver has no mode. */
  strike?(entity: Hull, kind: AirStrikeKind): void;
  /** A smoke salvo fired: the driver keeps the match's screens. */
  smokeLaunched(entity: Hull, screen: SmokeScreen): void;
  /** A magazine reload started (reason null) or was refused. */
  magazineReload?(entity: Hull, reason: string | null): void;
  specialAction?(entity: Hull, action: ReturnType<typeof activateSpecialAction>): void;
  selfRighted?(entity: Hull): void;
  /** A consumable slot pressed: its use, or null where the mode's gate refuses every consumable. */
  consumable?(entity: Hull, slot: number, use: ConsumableUse | null): void;
  moduleRepaired?(entity: Hull, module: string): void;
  fireOut?(entity: Hull): void;
  engineStrained?(entity: Hull): void;
}

/** A Governor Override that ended strains the engine. */
const strainEngine = (combat: Parameters<typeof strainModule>[0]): boolean =>
  strainModule(combat, 'engine', GOVERNOR_STRAIN_HP_FRACTION);

/** The hull's pressed actions this tick (its action bits, consumed); a wreck's are dropped. */
export function applyHullActions<Hull extends ActionHull>(entity: Hull, host: HullActionsHost<Hull>): void {
  const bits = entity.input.actionBits | 0;
  entity.input.actionBits = 0;
  if (!bits || entity.combat.destroyed) return;
  const timeS = host.timeS;
  if (!host.verdict) {
    if (bits & PLAYER_ACTION_BITS.SUPPLY_AMMO) host.supply(entity, 'ammo');
    if (bits & PLAYER_ACTION_BITS.SUPPLY_HEAL) host.supply(entity, 'heal');
    // Air Support: the recon pass and the battery ride the supply bits (no mode reads both meanings; airSupport.selftest)
    if (host.strike) for (const kind of AIR_STRIKE_KINDS) if (bits & AIR_STRIKE_BITS[kind]) host.strike(entity, kind);
    // (2026-10-09) the canisters fly through the match's collision: they bounce off walls, and the clouds stay out of the
    // houses beside them; (FX lane 2026-10-17) on its map's wind
    if (bits & PLAYER_ACTION_BITS.SMOKE && requestAuxiliary(entity, 'smoke', timeS, host.ground, host.world, host.wind)) {
      host.smokeLaunched(entity, entity.combat.auxiliary!.smoke!);
    }
    if (bits & PLAYER_ACTION_BITS.DRONE) entity.input.auxiliaryBits = (entity.input.auxiliaryBits ?? 0) | PLAYER_ACTION_BITS.DRONE;
    if (bits & PLAYER_ACTION_BITS.LIGHTS_OFF) requestAuxiliary(entity, 'lightsOff', timeS);
    if (bits & PLAYER_ACTION_BITS.LIGHTS) requestAuxiliary(entity, 'lights', timeS);
    if (bits & PLAYER_ACTION_BITS.ROOF_GUN) requestAuxiliary(entity, 'roofGun', timeS);
  }
  if (bits & PLAYER_ACTION_BITS.RELOAD_MAGAZINE) {
    const reason = magazineReloadDenialReason(entity.combat);
    const started = !reason && startMagazineReload(entity.combat, entity.spec);
    host.magazineReload?.(entity, started ? null : reason || 'NO_MAGAZINE');
  }
  if (bits & PLAYER_ACTION_BITS.SPECIAL_ACTION) {
    const action = activateSpecialAction(entity);
    host.specialAction?.(entity, action);
  }
  if (bits & PLAYER_ACTION_BITS.SELF_RIGHT) {
    if (requestTankSelfRight(entity.state, entity.modeGravityScale ?? 1)) host.selfRighted?.(entity);
    else requestTankJump(entity.state, entity.modeJumpMps, entity.modeGravityScale ?? 1);
  }
  for (let slot = 0; slot < CONSUMABLE_SLOTS; slot++) {
    if (!(bits & (1 << slot))) continue;
    if (!host.consumables) { host.consumable?.(entity, slot, null); continue; }
    if (!entity.consumables) continue;
    // the use first: an optional hook's arguments are never evaluated when the driver has no hook
    const use = useConsumableSlotRule(entity.consumables, slot, entity.combat, consumableHost(entity, host), consumableTiming);
    host.consumable?.(entity, slot, use);
  }
}

/** The hull's timed consumables this tick: ended effects, a strained engine, a suppressed fire. */
export function tickHullConsumables<Hull extends ActionHull>(entity: Hull, host: HullActionsHost<Hull>): void {
  const combat = entity.combat;
  if (!entity.consumables || combat.destroyed) return;
  if (tickConsumables(entity.consumables, combat, host.timeS, host.rng, strainEngine)) host.engineStrained?.(entity);
  if (suppressNewFire(entity.consumables, combat, host.timeS)) host.fireOut?.(entity);
}

function consumableHost<Hull extends ActionHull>(entity: Hull, host: HullActionsHost<Hull>): ConsumableHost {
  return {
    timeS: host.timeS,
    repairAll: () => repairAllModules(entity.combat),
    repair: (names) => repairModules(entity.combat, names),
    restock: (fraction) => replenishAmmunition(entity.combat, fraction).totalAdded,
    smoke: auxiliaryCapabilities(entity.spec)?.smoke?.length ? entity.combat.auxiliary ?? null : null,
    moduleRepaired: (module) => host.moduleRepaired?.(entity, module),
    fireOut: () => host.fireOut?.(entity),
  };
}
