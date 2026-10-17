import { uniqueIds } from './id-list.mjs';

// Scoped generation replaces requested records while preserving existing
// siblings, including their absence. It must never publish unrelated fills.
// A repeated id fails (2026-10-16, test-speed R4c) instead of being silently
// de-duplicated: a de-duplicated list can hide a wrong list.
export function interiorFillSelection(groupById, requestedIds) {
  if (!requestedIds.length) throw new Error('Interior fills require at least one tank');
  for (const id of requestedIds) {
    if (!Object.hasOwn(groupById, id)) throw new Error(`Unknown interior-fill tank: ${id}`);
  }
  return [...uniqueIds(requestedIds, 'gen-interior-fills --ids')].sort();
}

/** The flags every shipped fill record is generated with: the fills-to-zero pass (2026-09-15,
 * docs/history/research/interior-fills-to-zero-20260915.md), eight chase rounds and fine boxes
 * down to one voxel. The watertight receipt's regenerate hint names the same flags. */
export const INTERIOR_FILL_RELEASE = Object.freeze({ rounds: 8, minFine: 1 });
/** The bare generator defaults (exploration only; shipped records use --release). */
export const INTERIOR_FILL_DEFAULTS = Object.freeze({ rounds: 4, minFine: 12 });

/**
 * Resolve --rounds and --min-fine (2026-10-16, test-speed R4c). `--release` selects
 * INTERIOR_FILL_RELEASE (the 226 regen ran the bare defaults by mistake and re-filled 37
 * tanks); an explicit flag that contradicts it fails. `release` is true whenever the resolved
 * values are the release preset, however they were given.
 */
export function interiorFillOptions(args) {
  const value = (name) => {
    const hit = args.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : null;
  };
  const preset = args.includes('--release') ? INTERIOR_FILL_RELEASE : INTERIOR_FILL_DEFAULTS;
  const given = { rounds: value('rounds'), minFine: value('min-fine') };
  const rounds = Math.max(1, Number(given.rounds ?? preset.rounds));
  const minFine = Math.max(0, Number(given.minFine ?? preset.minFine));
  if (preset === INTERIOR_FILL_RELEASE) {
    for (const [key, flag, resolved] of [['rounds', '--rounds', rounds], ['minFine', '--min-fine', minFine]]) {
      if (given[key] !== null && resolved !== INTERIOR_FILL_RELEASE[key]) {
        throw new Error(`--release generates with ${flag}=${INTERIOR_FILL_RELEASE[key]}; drop ${flag}=${given[key]} or --release`);
      }
    }
  }
  return { rounds, minFine,
    release: rounds === INTERIOR_FILL_RELEASE.rounds && minFine === INTERIOR_FILL_RELEASE.minFine };
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
