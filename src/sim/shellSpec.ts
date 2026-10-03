/**
 * A gun's shell record and the one builder every fleet gun and every mode
 * ladder uses. DOM-free and vehicle-free: the mode rulesets build their weapon
 * ladders with it, and the rooms Worker reaches the rulesets through
 * src/mp/room/protocol.ts, so this must never import from src/vehicles
 * (src/mp/room/roomWorkerProgram.selftest.mjs). `vehicles/specHelpers.ts`
 * re-exports both for the fleet.
 */

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

export const shell = (
  name: string,
  type: string,
  caliberMm: number,
  pen100Mm: number,
  pen1000Mm: number,
  dmg: number,
  velocityMps: number,
  extra: Readonly<Record<string, RuntimeValue>> | null = null,
): ShellSpec => ({
    name, type, caliberMm, pen100Mm, pen1000Mm, dmg, velocityMps,
    moduleDmg: caliberMm, tracer: type, ...(extra || {}),
});
