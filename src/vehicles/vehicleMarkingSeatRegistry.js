// Runtime registry for release-verified vehicle marking seats.
//
// The browser registers only the family it is about to construct. Fleet-wide
// tools register the complete generated receipt set from tankFactory.js. This
// keeps exact, pre-solved paint placement while avoiding an all-fleet payload
// on the first garage visit.

export const VEHICLE_MARKING_SEAT_SCHEMA_VERSION = 1;

const records = new Map();

export function registerVehicleMarkingSeatRecords(nextRecords) {
  for (const [id, record] of Object.entries(nextRecords || {})) {
    if (record?.schemaVersion !== VEHICLE_MARKING_SEAT_SCHEMA_VERSION
        || !Array.isArray(record.seats)) {
      throw new Error(`Invalid vehicle marking seat receipt: ${id}`);
    }
    records.set(id, record);
  }
}

export function vehicleMarkingSeats(specOrId) {
  const id = typeof specOrId === 'string' ? specOrId : specOrId?.id;
  return records.get(id)?.seats || null;
}

export function hasVehicleMarkingSeats(specOrId) {
  const id = typeof specOrId === 'string' ? specOrId : specOrId?.id;
  return records.has(id);
}
