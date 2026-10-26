/**
 * The vehicle era ids and the postwar gate. DOM-free and vehicle-free: the equipment rules (equipmentRules.ts) gate
 * modern items on it, and the rooms Worker reaches those rules through src/mp/room/protocol.ts → matchRuleset.ts, so
 * this must never import from src/vehicles (src/mp/room/roomWorkerProgram.selftest.mjs). `vehicles/taxonomy.ts`
 * re-exports both for the fleet.
 */

import type { RuntimeValue } from '../runtimeTypes.ts';

export const VEHICLE_ERAS = Object.freeze({
  INTERWAR: 'interwar',
  WORLD_WAR_II: 'ww2',
  COLD_WAR: 'cold-war',
  MODERN: 'modern',
  NEXT_GENERATION: 'next-generation',
} as const);

export type VehicleEra = typeof VEHICLE_ERAS[keyof typeof VEHICLE_ERAS];

/** Postwar vehicle technologies shared by Cold War and newer platforms. */
export function isPostwarVehicleEra(era: RuntimeValue): boolean {
  return era === VEHICLE_ERAS.COLD_WAR
    || era === VEHICLE_ERAS.MODERN
    || era === VEHICLE_ERAS.NEXT_GENERATION;
}
