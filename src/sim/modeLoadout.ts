import { GUN_GAME_WEAPONS, GUNSHIP_WEAPONS } from './matchRuleset.ts';
import { createCombatState, type CombatState } from './damage.ts';
import type { FleetTankSpec } from '../vehicles/specContracts.ts';

interface LoadoutEntity {
  spec: FleetTankSpec;
  combat: Pick<CombatState, 'ammo' | 'ammoCapacity' | 'shellSlot' | 'reload' | 'reloadChannels' | 'magazine'>;
  input: { shellSlot: number };
}
/** Copies only the gun; armor, crew geometry and the shared catalog remain unchanged. */
export function setModeWeapon(entity: LoadoutEntity, stage: number | 'gunship'): void {
  const shells = stage === 'gunship' ? GUNSHIP_WEAPONS : [GUN_GAME_WEAPONS[Math.max(0, Math.min(GUN_GAME_WEAPONS.length - 1, stage))]!];
  entity.spec = { ...entity.spec, gun: {
    caliberMm: shells[0]!.caliberMm, reloadS: shells[0]!.reloadS!, baseAccuracy: .12, aimTimeS: .5,
    bloom: { move: .01, hullRot: .01, turret: .01, afterShot: .05 },
    shells: shells.map(shell => ({ ...shell, count: 200 })),
  } };
  entity.combat.ammo = shells.map(() => 200);
  entity.combat.ammoCapacity = shells.map(() => 200);
  entity.combat.shellSlot = 0; entity.input.shellSlot = 0;
  const fresh = createCombatState(entity.spec);
  entity.combat.reload = fresh.reload; entity.combat.reloadChannels = fresh.reloadChannels; entity.combat.magazine = null;
}
