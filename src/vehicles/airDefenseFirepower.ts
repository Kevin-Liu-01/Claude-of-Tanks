// The owner, 2026-11-06 (the twin-aa-269 lane): "the minigunn tanks, air support tanks, they nnnneed a super super high
// fire rate and a tonn of ammo. a ton of rockets too multiple rockts per launcher". One rule for the air-defence family
// (the M163 VADS, the Tunguska-M, the Pantsir-S1, the Gepard 1A2, the PGZ-95 and PGZ-09, the Type 87, both Marksmen, the
// Lvkv 9040, the K30 Biho and the PZA Loara), applied last in each family's spec:
//   - every cannon round cycles at the simulation's floor, 0.05 s (src/sim/damage.ts startPostShotReload: 1,200 rounds a
//     minute), a rotary gun at its own floor, one round a tick (`autoloader.rotary`, sim/fireCycleFloor.ts: the M163's
//     Vulcan, 3,600 rounds a minute); a burst gun keeps its burst limiter, its magazine five times over and its reset at
//     most 2 s;
//   - each round's damage scaled so the gun's sustained output is twice its authored one: the rate is the hose the owner
//     asked for, while six times the output at full damage would strip a tier-X MBT's flank in two seconds;
//   - six times every cannon round's stowage; three loads of missiles, the rack firing `salvo` rounds a launch
//     and reloading in 6 s (the rack's group reload: src/sim/magazineIndicator.selftest.mjs);
//   - the family its own balance cohort ('air-defence').
import type { FleetTankSpec } from './specContracts.ts';
import { fireCycleFloorS } from '../sim/fireCycleFloor.ts';

const OUTPUT_GAIN = 2;
const BURST_GAIN = 5;
const BURST_RESET_MAX_S = 2;
const ROUND_STOWAGE_GAIN = 6;
const MISSILE_LOADS = 3;
const SALVO_RELOAD_S = 6;

/** One round's share of the gun's sustained cycle (a burst gun: its magazine and its reset, shared out). */
function roundCycleS(gun: FleetTankSpec['gun'], reloadS: number): number {
  const autoloader = gun.autoloader;
  if (!autoloader) return reloadS;
  const rounds = Math.max(1, autoloader.magazineSize);
  return ((autoloader.fullReloadS || gun.reloadS) + (rounds - 1) * autoloader.intraClipS) / rounds;
}

export function applyAirDefenseFirepower(spec: FleetTankSpec, salvo: { rounds: number; intervalS: number } | null = null): void {
  const gun = spec.gun;
  const before = gun.shells.map((round) => roundCycleS(gun, Number(round.reloadS || gun.reloadS)));
  const cycleS = fireCycleFloorS(gun.autoloader);
  const autoloader = gun.autoloader && {
    ...gun.autoloader,
    magazineSize: gun.autoloader.magazineSize * BURST_GAIN,
    intraClipS: cycleS,
    fullReloadS: Math.min(gun.autoloader.fullReloadS ?? gun.reloadS, BURST_RESET_MAX_S),
  };
  const next: FleetTankSpec['gun'] = autoloader ? { ...gun, autoloader, reloadS: autoloader.fullReloadS } : { ...gun, reloadS: cycleS };
  const after = roundCycleS(next, cycleS);
  next.shells = gun.shells.map((round, index) => (round.guided
    ? { ...round, count: Number(round.count) * MISSILE_LOADS, ...(salvo ? { reloadS: Math.max(Number(round.reloadS), SALVO_RELOAD_S) } : {}) }
    : {
      ...round,
      reloadS: cycleS,
      dmg: Math.max(1, Math.round(round.dmg * after / before[index] * OUTPUT_GAIN)),
      count: Number(round.count) * ROUND_STOWAGE_GAIN,
    }));
  if (salvo) next.launcherSalvo = { ...salvo };
  spec.gun = next;
  // weighed against each other, not against the IFVs whose hulls they share (balanceAudit.ts groups by cohort)
  spec.balanceCohort = 'air-defence';
}
