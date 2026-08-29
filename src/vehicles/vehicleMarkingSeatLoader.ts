import { FLEET_GROUP_BY_ID } from './fleetManifest.ts';
import type { FleetGroup } from './fleetManifest.ts';
import { VEHICLE_MARKING_SEAT_GROUP_LOADERS } from './vehicleMarkingSeatLoaders.generated.ts';
import {
  hasVehicleMarkingSeats,
  registerVehicleMarkingSeatRecords,
} from './vehicleMarkingSeatRegistry.ts';

type MarkingSeatGroupLoader = typeof VEHICLE_MARKING_SEAT_GROUP_LOADERS[string];
type MarkingSeatGroup = FleetGroup | 'core';

const CORE_GROUP: MarkingSeatGroup = 'core';
const GROUP_LOADERS: Readonly<Record<string, MarkingSeatGroupLoader>> =
  VEHICLE_MARKING_SEAT_GROUP_LOADERS;
const pendingGroups = new Map<MarkingSeatGroup, Promise<void>>();
const readyGroups = new Set<MarkingSeatGroup>();

function groupForId(id: string): MarkingSeatGroup {
  return FLEET_GROUP_BY_ID[id] || CORE_GROUP;
}

export function ensureVehicleMarkingSeatGroup(group: MarkingSeatGroup): Promise<void> {
  if (readyGroups.has(group)) return Promise.resolve();
  let pending = pendingGroups.get(group);
  if (!pending) {
    const load = GROUP_LOADERS[group];
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

export function ensureVehicleMarkingSeats(specId: string): Promise<void> {
  return hasVehicleMarkingSeats(specId)
    ? Promise.resolve()
    : ensureVehicleMarkingSeatGroup(groupForId(specId));
}

export function ensureVehicleMarkingSeatsForIds(
  specIds: readonly string[] | null | undefined,
): Promise<void> {
  const groups = new Set<MarkingSeatGroup>();
  for (const id of specIds || []) {
    if (!hasVehicleMarkingSeats(id)) groups.add(groupForId(id));
  }
  return Promise.all([...groups].map(ensureVehicleMarkingSeatGroup)).then(() => undefined);
}

export function ensureAllVehicleMarkingSeatGroups(): Promise<void> {
  return Promise.all(
    (Object.keys(GROUP_LOADERS) as MarkingSeatGroup[]).map(ensureVehicleMarkingSeatGroup),
  ).then(() => undefined);
}

export function isVehicleMarkingSeatsReady(specId: string): boolean {
  return hasVehicleMarkingSeats(specId) || readyGroups.has(groupForId(specId));
}
