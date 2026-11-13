import { createLazyChunk, type LazyChunk } from '../app/lazyChunk.ts';
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
// (2026-11-02 audit R6) each group one lazyChunk (app/lazyChunk.ts), the policy the fleet's kit, groups and fills follow
// beside it in ensureTankBuilder: a failed chunk is asked again by the next ensure (it was at once and without a bound)
const groupLoads = new Map<MarkingSeatGroup, LazyChunk<void>>();

function groupForId(id: string): MarkingSeatGroup {
  return FLEET_GROUP_BY_ID[id] || CORE_GROUP;
}

function ensureVehicleMarkingSeatGroup(group: MarkingSeatGroup): Promise<void> {
  let chunk = groupLoads.get(group);
  if (!chunk) {
    const load = GROUP_LOADERS[group];
    if (!load) return Promise.reject(new Error(`Unknown vehicle marking seat group: ${group}`));
    chunk = createLazyChunk(() => load().then((module) => {
      registerVehicleMarkingSeatRecords(module.VEHICLE_MARKING_SEATS);
    }));
    groupLoads.set(group, chunk);
  }
  return chunk.load();
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
  return hasVehicleMarkingSeats(specId) || groupLoads.get(groupForId(specId))?.state === 'ready';
}
