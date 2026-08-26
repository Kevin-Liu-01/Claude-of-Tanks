import { FLEET_GROUP_BY_ID } from './fleetManifest.js';
import { VEHICLE_MARKING_SEAT_GROUP_LOADERS } from './vehicleMarkingSeatLoaders.generated.js';
import {
  hasVehicleMarkingSeats,
  registerVehicleMarkingSeatRecords,
} from './vehicleMarkingSeatRegistry.js';

const CORE_GROUP = 'core';
const pendingGroups = new Map();
const readyGroups = new Set();

function groupForId(id) {
  return FLEET_GROUP_BY_ID[id] || CORE_GROUP;
}

export function ensureVehicleMarkingSeatGroup(group) {
  if (readyGroups.has(group)) return Promise.resolve();
  let pending = pendingGroups.get(group);
  if (!pending) {
    const load = VEHICLE_MARKING_SEAT_GROUP_LOADERS[group];
    if (!load) return Promise.reject(new Error(`Unknown vehicle marking seat group: ${group}`));
    pending = load().then((module) => {
      registerVehicleMarkingSeatRecords(module.VEHICLE_MARKING_SEATS);
      readyGroups.add(group);
    }).catch((error) => {
      pendingGroups.delete(group);
      throw error;
    });
    pendingGroups.set(group, pending);
  }
  return pending;
}

export function ensureVehicleMarkingSeats(specId) {
  return hasVehicleMarkingSeats(specId)
    ? Promise.resolve()
    : ensureVehicleMarkingSeatGroup(groupForId(specId));
}

export function ensureVehicleMarkingSeatsForIds(specIds) {
  const groups = new Set();
  for (const id of specIds || []) {
    if (!hasVehicleMarkingSeats(id)) groups.add(groupForId(id));
  }
  return Promise.all([...groups].map(ensureVehicleMarkingSeatGroup)).then(() => undefined);
}

export function ensureAllVehicleMarkingSeatGroups() {
  return Promise.all(
    Object.keys(VEHICLE_MARKING_SEAT_GROUP_LOADERS).map(ensureVehicleMarkingSeatGroup),
  ).then(() => undefined);
}

export function isVehicleMarkingSeatsReady(specId) {
  return hasVehicleMarkingSeats(specId) || readyGroups.has(groupForId(specId));
}
