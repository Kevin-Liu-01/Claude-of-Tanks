# 0213 — Japanese balance and rig registration is strict TypeScript

Status: accepted

## Decision

Register the STB-1, Type 90A, and Type 10B rows in
`src/vehicles/japan.ts` through the shared validated fleet registry. Describe
variant deltas with bounded stat, gun, ammunition, dimension, presentation,
and armor-scale types.

Keep the base Type 90 and Type 10 balance ladder explicit. Preserve ordering:
balance the bases, clone their variants, register the variants, then apply the
shared measured Type 10 gun seat to Type 10 and Type 10B only.

## Why

The JavaScript pack mixed unchecked option bags, canonical-row balance edits,
variant registration, and post-clone rig correction. Strict contracts expose
those phases and prevent a misspelled combat field from silently entering the
fleet without changing gameplay or first-party procedural geometry.

## Consequences

- Type 90 remains a Tier IX three-round autoloader and Type 10 remains a Tier
  X single-shot vehicle.
- Type 10B retains the exact enlarged dimensions, ammunition, and shared bore
  seat while Type 90's donor armor frame stays stable.
- Japanese suspension, gun-seat, roof/ERA, track, lazy-fleet, and anatomy
  suites are required proof for this boundary.
