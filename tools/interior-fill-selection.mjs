// Scoped generation replaces requested records while preserving existing
// siblings, including their absence. It must never publish unrelated fills.
export function interiorFillSelection(groupById, requestedIds) {
  if (!requestedIds.length) throw new Error('Interior fills require at least one tank');
  for (const id of requestedIds) {
    if (!Object.hasOwn(groupById, id)) throw new Error(`Unknown interior-fill tank: ${id}`);
  }
  return [...new Set(requestedIds)].sort();
}

export function mergeInteriorFillGroup(existing, updates, groupById, group) {
  const merged = { ...existing };
  for (const [id, record] of Object.entries(updates)) {
    if (!Object.hasOwn(groupById, id) || groupById[id] !== group) {
      throw new Error(`Interior-fill record ${id} does not belong to ${group}`);
    }
    merged[id] = record;
  }
  return merged;
}
