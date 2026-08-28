# 0117 — Vehicle era and role taxonomy is strict TypeScript

## Context

Every saved vehicle is assigned one public era and one private mechanical role.
The taxonomy feeds Garage, Gallery, Studio, camouflage, equipment, wrecks,
world props, damage, roster reports, and playable registration. Its JavaScript
maps and mutating registration guard left those finite vocabularies unchecked.

## Decision

`taxonomy.ts` owns the literal era and role unions, ordered metadata, complete
vehicle assignment map, predicates, labels, comparison, and registration-time
taxonomy seal. Callers retain the same string values and fallback behavior.

## Consequences

- Era and role consumers can share compiler-checked finite vocabularies.
- Duplicate assignments, missing assignments, retired `class` fields, and
  invalid roles still fail at registration.
- All 156 saved vehicles retain their existing era and UI labels.
- No fleet ordering, eligibility, combat, or presentation behavior changes.

## Verification

- `npm run typecheck`
- `node src/vehicles/taxonomy.selftest.mjs`
- `node src/game/equipment.selftest.mjs`
- `node src/vehicles/tankAssets.selftest.mjs`
- `npm run build`
