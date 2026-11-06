/**
 * A lethal ram's module damage (268, item 8; docs/ARCHITECTURE.md "One core, two drivers"): a hull a collision destroys has
 * the running gear on the struck side and its drivetrain disabled, on both drivers. It is authoritative damage state, not a
 * kill-cam decoration: the HUD, the vehicle's visual and the replay read it (the solo battle applied it since 2026-08-28;
 * the authority did not, so an online wreck a ram made kept its tracks and src/sim/driverStepParity.selftest.mjs parted).
 */
import * as detMath from './detMath.ts';
import type { ModuleId } from './moduleCatalog.ts';

export interface RamModuleHit {
  module: ModuleId;
  newState: 'red';
  dmg: number;
}

interface RamModule { hp: number; state?: string; repairT?: number }

/** Disable the destroyed hull's struck-side track and its drivetrain (normal: from the hull towards what struck it). */
export function applyLethalRamModuleDamage(
  entity: { combat?: { destroyed?: boolean; modules?: Partial<Record<ModuleId, RamModule>> | null } | null; state?: { yaw: number } | null },
  normalX: number,
  normalZ: number,
): RamModuleHit[] {
  const combat = entity.combat;
  if (!combat?.destroyed || !combat.modules || !entity.state) return [];
  const rightDot = normalX * detMath.cos(entity.state.yaw) - normalZ * detMath.sin(entity.state.yaw);
  const nearTrack: ModuleId = rightDot >= 0 ? 'trackR' : 'trackL';
  const drivetrain: ModuleId = combat.modules.transmission ? 'transmission' : 'engine';
  const hits: RamModuleHit[] = [];
  for (const name of [nearTrack, drivetrain]) {
    const module = combat.modules[name];
    if (!module || module.state === 'red') continue;
    const hpBefore = Math.max(0, module.hp || 0);
    module.hp = 0;
    module.state = 'red';
    module.repairT = 0;
    hits.push({ module: name, newState: 'red', dmg: Math.round(hpBefore) });
  }
  return hits;
}
