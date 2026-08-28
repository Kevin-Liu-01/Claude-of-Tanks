# 0211 — Polish variant registration is strict TypeScript

Status: accepted

## Decision

Register the four Polish combat rows in `src/vehicles/poland.ts` through the
shared validated fleet registry. Restrict donor deltas to presentation,
dimensions, selected mobility and aiming values, fire-control settings, the
measured turret/gun seats, barrel dimensions, and non-external armor scaling.

Keep the PL-01 105 mm derivative as an explicit typed clone of the completed
PL-01 row. Its four-round autoloader, ammunition, barrel radius, silhouette
receipt, and marking are the only permitted derivative changes.

## Why

The JavaScript helper accepted an unchecked options bag and repeated donor,
registry, and armor mutation logic. A strict construction seam makes the
published Polish geometry receipts reviewable while preventing unrelated
combat fields from leaking into a variant.

## Consequences

- The PL-01 variants retain distinct 120 mm and 105 mm fire-control packages.
- T-72M1 Jaguar and PT-91 retain their measured ring, trunnion, and barrel
  geometry without loading source GLBs at runtime.
- Polish geometry, ERA seating, fleet-lazy parity, and import integrity are
  required proof for this boundary.
