// The shell contract every gun spec, mode weapon and ballistic shell shares. It lives in src/sim, apart from the vehicle
// helpers that re-export it (src/vehicles/specHelpers.ts), because the mode rulesets read it and the rooms Worker's
// DOM-free program reaches them (src/mp/room/roomWorkerProgram.selftest.mjs).
import type { RuntimeValue } from '../runtimeTypes.ts';

export interface ShellSpec extends Record<string, RuntimeValue> {
  name: string;
  type: string;
  caliberMm: number;
  pen100Mm: number;
  pen1000Mm: number;
  dmg: number;
  velocityMps: number;
  moduleDmg: number;
  reloadS?: number;
  /** Ammo types in a named secondary weapon share a reload independently of the main gun. */
  reloadGroup?: string;
  count?: number;
  tracer: string;
  guided?: boolean;
  /** Guided rounds: launcher tubes modelled on the vehicle (0 = fired through the gun). Owner 2026-09-18: the minimum
   * missile load is one round per tube ("the BMPT T-90 should have minimum 8 since it has 8 tubes") — pinned by
   * guidedLauncherTubes.selftest against the profiles' published tube censuses. */
  launcherTubes?: number;
}
