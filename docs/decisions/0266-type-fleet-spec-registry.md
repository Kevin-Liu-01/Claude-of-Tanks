# 0266 — The fleet specification registry has a strict TypeScript owner

Status: accepted

## Decision

`src/vehicles/specs.ts` is the canonical typed owner of fleet combat rows,
roster projections, runtime provenance, track-hitbox derivation, dimension
fitting, and vehicle lookup.

Base and expansion records satisfy `TankSpecRegistry`. Armor, gun, mobility,
dimensions, terrain resistance, visual identity, and source records use their
shared contracts. Track fitting receives explicit mutable-coordinate and
track-prism shapes while retaining its established in-place behavior.

All current runtime, server, test, browser-probe, and release-tool consumers
resolve the TypeScript source directly. Historical decision records may still
name the former JavaScript path when describing the state at that decision.

## Consequences

- Missing required combat fields fail typecheck at the registry boundary.
- Bot roster arrays remain `string[]` instead of collapsing to `never[]` in
  TypeScript consumers.
- Roster filtering returns booleans rather than an invalid same-type guard.
- Spec registration, ordering, mutation, cloning, and runtime output stay
  unchanged.

## Verification

    npm run typecheck
    node src/vehicles/specHelpers.selftest.mjs
    node src/vehicles/rosterPolicy.selftest.mjs
    node src/game/matchmaking.selftest.mjs
    node src/productStats.selftest.mjs
    node tools/track-geometry.selftest.mjs
    node src/vehicles/fleetLazy.selftest.mjs
    node tools/local-import-integrity.selftest.mjs
    node tools/public-repo-hygiene.selftest.mjs
    npm test
    npm run build
