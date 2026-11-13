import { createLazyChunk, type LazyChunk } from '../app/lazyChunk.ts';
import { FLEET_GROUP_BY_ID } from './fleetManifest.ts';
import type { FleetGroup } from './fleetManifest.ts';
import { COMBAT_ANATOMY_GROUP_LOADERS } from './combatAnatomyLoaders.generated.ts';
import {
  hasCombatAnatomyCalibration,
  registerCombatAnatomyCalibrations,
} from './combatAnatomyCalibrationRegistry.ts';

type CalibrationGroupLoader = typeof COMBAT_ANATOMY_GROUP_LOADERS[string];
type CalibrationGroup = FleetGroup | 'core';

const CORE_GROUP: CalibrationGroup = 'core';
const GROUP_LOADERS: Readonly<Record<string, CalibrationGroupLoader>> =
  COMBAT_ANATOMY_GROUP_LOADERS;
// (2026-11-02 audit R6) each group one lazyChunk (app/lazyChunk.ts), the policy the fleet's kit, groups and fills follow
// beside it in ensureTankBuilder: a failed chunk is asked again by the next ensure (it was at once and without a bound)
const groupLoads = new Map<CalibrationGroup, LazyChunk<void>>();

function groupForId(id: string): CalibrationGroup {
  return FLEET_GROUP_BY_ID[id] || CORE_GROUP;
}

function ensureCombatAnatomyGroup(group: CalibrationGroup): Promise<void> {
  let chunk = groupLoads.get(group);
  if (!chunk) {
    const load = GROUP_LOADERS[group];
    if (!load) return Promise.reject(new Error(`Unknown combat anatomy group: ${group}`));
    chunk = createLazyChunk(() => load().then((module) => {
      registerCombatAnatomyCalibrations(module.COMBAT_ANATOMY_CALIBRATIONS);
    }));
    groupLoads.set(group, chunk);
  }
  return chunk.load();
}

export function ensureCombatAnatomyCalibration(specId: string): Promise<void> {
  return hasCombatAnatomyCalibration(specId)
    ? Promise.resolve()
    : ensureCombatAnatomyGroup(groupForId(specId));
}

export function ensureCombatAnatomyCalibrations(
  specIds: readonly string[] | null | undefined,
): Promise<void> {
  const groups = new Set<CalibrationGroup>();
  for (const id of specIds || []) {
    if (!hasCombatAnatomyCalibration(id)) groups.add(groupForId(id));
  }
  return Promise.all([...groups].map(ensureCombatAnatomyGroup)).then(() => undefined);
}

export function ensureAllCombatAnatomyGroups(): Promise<void> {
  return Promise.all(
    (Object.keys(GROUP_LOADERS) as CalibrationGroup[]).map(ensureCombatAnatomyGroup),
  ).then(() => undefined);
}

export function isCombatAnatomyCalibrationReady(specId: string): boolean {
  return hasCombatAnatomyCalibration(specId) || groupLoads.get(groupForId(specId))?.state === 'ready';
}
