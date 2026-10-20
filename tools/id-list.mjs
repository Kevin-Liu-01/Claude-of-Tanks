// Id lists on the command line (2026-10-16, test-speed PLAN R4c): a duplicate id fails loudly, naming every
// repeated id, instead of being silently removed or silently measured twice. A list that only de-duplicates can
// hide a wrong list (a pasted slice, a doubled shard), so the tool refuses it before it builds, renders or holds a
// lock. Every fleet tool that reads an id list passes it through uniqueIds; tools/id-list.selftest.mjs scans
// tools/*.mjs so a new --ids reader cannot skip it.

/**
 * Return `ids` unchanged when no id repeats; throw naming each repeated id and its count otherwise. Ids compare
 * after trimming, so `a, a` repeats `a`; empty entries are left to the tool's own handling. `null` and `undefined`
 * (no list given) pass through.
 * @template {Iterable<string> | null | undefined} T
 * @param {T} ids
 * @param {string} [label] the flag or tool named in the error
 * @returns {T}
 */
export function uniqueIds(ids, label = '--ids') {
  if (ids == null) return ids;
  const counts = new Map();
  for (const id of ids) {
    const key = String(id).trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const repeated = [...counts].filter(([, count]) => count > 1);
  if (repeated.length) {
    throw new Error(`${label} lists ${repeated.map(([id, count]) => `${id} ${count} times`).join(', ')}: `
      + 'a duplicate id fails instead of being dropped, since a de-duplicated list can hide a wrong list');
  }
  return ids;
}
