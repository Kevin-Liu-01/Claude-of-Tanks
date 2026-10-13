// Scoped generation replaces requested records while preserving existing
// siblings, including their absence. It must never publish unrelated fills.
export function interiorFillSelection(groupById, requestedIds) {
  if (!requestedIds.length) throw new Error('Interior fills require at least one tank');
  for (const id of requestedIds) {
    if (!Object.hasOwn(groupById, id)) throw new Error(`Unknown interior-fill tank: ${id}`);
  }
  return [...new Set(requestedIds)].sort();
}

/**
 * `rename` maps an id the tank id alias layer retired to the id that now names the vehicle
 * (src/vehicles/tankIdAliases.ts `resolveIncoming`). A record under a renamed id moves to the new id unchanged, so a
 * rename never re-measures (or changes) a vehicle's fills (SSOT 2.19).
 */
export function mergeInteriorFillGroup(existing, updates, groupById, group, rename = (id) => id) {
  const merged = Object.fromEntries(Object.entries(existing)
    .map(([id, record]) => [Object.hasOwn(groupById, id) ? id : rename(id), record])
    .filter(([id]) => Object.hasOwn(groupById, id) && groupById[id] === group));
  for (const [id, record] of Object.entries(updates)) {
    if (!Object.hasOwn(groupById, id) || groupById[id] !== group) {
      throw new Error(`Interior-fill record ${id} does not belong to ${group}`);
    }
    merged[id] = record;
  }
  return merged;
}
