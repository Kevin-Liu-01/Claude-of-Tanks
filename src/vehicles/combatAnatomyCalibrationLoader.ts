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
const pendingGroups = new Map<CalibrationGroup, Promise<void>>();
const readyGroups = new Set<CalibrationGroup>();

function groupForId(id: string): CalibrationGroup {
  return FLEET_GROUP_BY_ID[id] || CORE_GROUP;
}

export function ensureCombatAnatomyGroup(group: CalibrationGroup): Promise<void> {
  if (readyGroups.has(group)) return Promise.resolve();
  let pending = pendingGroups.get(group);
  if (!pending) {
    const load = GROUP_LOADERS[group];
    if (!load) return Promise.reject(new Error(`Unknown combat anatomy group: ${group}`));
    pending = load().then((module) => {
      registerCombatAnatomyCalibrations(module.COMBAT_ANATOMY_CALIBRATIONS);
      readyGroups.add(group);
    }).catch((error) => {
      pendingGroups.delete(group);
      throw error;
    });
    pendingGroups.set(group, pending);
  }
  return pending;
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
  return hasCombatAnatomyCalibration(specId) || readyGroups.has(groupForId(specId));
}
