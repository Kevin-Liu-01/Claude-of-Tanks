import { FLEET_GROUP_BY_ID } from './fleetManifest.ts';
import { COMBAT_ANATOMY_GROUP_LOADERS } from './combatAnatomyLoaders.generated.js';
import {
  hasCombatAnatomyCalibration,
  registerCombatAnatomyCalibrations,
} from './combatAnatomyCalibrationRegistry.js';

const CORE_GROUP = 'core';
const pendingGroups = new Map();
const readyGroups = new Set();

function groupForId(id) {
  return FLEET_GROUP_BY_ID[id] || CORE_GROUP;
}

export function ensureCombatAnatomyGroup(group) {
  if (readyGroups.has(group)) return Promise.resolve();
  let pending = pendingGroups.get(group);
  if (!pending) {
    const load = COMBAT_ANATOMY_GROUP_LOADERS[group];
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

export function ensureCombatAnatomyCalibration(specId) {
  return hasCombatAnatomyCalibration(specId)
    ? Promise.resolve()
    : ensureCombatAnatomyGroup(groupForId(specId));
}

export function ensureCombatAnatomyCalibrations(specIds) {
  const groups = new Set();
  for (const id of specIds || []) {
    if (!hasCombatAnatomyCalibration(id)) groups.add(groupForId(id));
  }
  return Promise.all([...groups].map(ensureCombatAnatomyGroup)).then(() => undefined);
}

export function ensureAllCombatAnatomyGroups() {
  return Promise.all(
    Object.keys(COMBAT_ANATOMY_GROUP_LOADERS).map(ensureCombatAnatomyGroup),
  ).then(() => undefined);
}

export function isCombatAnatomyCalibrationReady(specId) {
  return hasCombatAnatomyCalibration(specId) || readyGroups.has(groupForId(specId));
}
