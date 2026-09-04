// Runtime registry for release-verified vehicle marking seats.
//
// The browser registers only the family it is about to construct. Fleet-wide
// tools register the complete generated receipt set from tankFactory.ts. This
// keeps exact, pre-solved paint placement while avoiding an all-fleet payload
// on the first garage visit.

import type { RuntimeValue } from '../runtimeTypes.ts';

export const VEHICLE_MARKING_SEAT_SCHEMA_VERSION = 1;

export type VehicleMarkingSeat = Readonly<Record<string, RuntimeValue>>;

export interface VehicleMarkingSeatRecord {
  schemaVersion: typeof VEHICLE_MARKING_SEAT_SCHEMA_VERSION;
  seats: readonly VehicleMarkingSeat[];
}

interface VehicleMarkingSeatSpec {
  id?: RuntimeValue;
}

const records = new Map<string, VehicleMarkingSeatRecord>();

function isRecord(value: RuntimeValue): value is Record<string, RuntimeValue> {
  return value !== null && typeof value === 'object';
}

function isSeatRecord(value: RuntimeValue): value is VehicleMarkingSeatRecord {
  return isRecord(value)
    && value.schemaVersion === VEHICLE_MARKING_SEAT_SCHEMA_VERSION
    && Array.isArray(value.seats)
    && value.seats.every(isRecord);
}

export function registerVehicleMarkingSeatRecords(
  nextRecords: Readonly<Record<string, RuntimeValue>> | null | undefined,
): void {
  for (const [id, record] of Object.entries(nextRecords || {})) {
    if (!isSeatRecord(record)) {
      throw new Error(`Invalid vehicle marking seat receipt: ${id}`);
    }
    records.set(id, record);
  }
}

export function vehicleMarkingSeats(
  specOrId: string | VehicleMarkingSeatSpec | null | undefined,
): readonly VehicleMarkingSeat[] | null {
  const id = typeof specOrId === 'string' ? specOrId : specOrId?.id;
  return typeof id === 'string' ? records.get(id)?.seats || null : null;
}

export function hasVehicleMarkingSeats(
  specOrId: string | VehicleMarkingSeatSpec | null | undefined,
): boolean {
  const id = typeof specOrId === 'string' ? specOrId : specOrId?.id;
  return typeof id === 'string' && records.has(id);
}
