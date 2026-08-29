# 0237 — Turret-barrel circularity measurement is strict TypeScript

Status: accepted

## Decision

`src/vehicles/turretBarrelCircularity.ts` owns the fleet gate that intersects
rendered triangle meshes with rig-local sample planes. Its mesh lanes, slice
points, connected contours, ellipse receipts, options, and public result are
strictly typed.

The conversion preserves the exact sample stations, tolerances, component
filter, and fallback from dedicated barrel meshes to legacy `gunMount`
geometry. It changes no vehicle builder or presentation asset.

## Consequences

- Release tooling consumes one explicit measurement contract.
- Malformed geometry cannot silently flow through implicit arrays and maps.
- The existing circular and deliberately oval fixtures continue to prove the
  acceptance boundary, followed by representative fleet tanks.

## Verification

    node src/vehicles/turretBarrelCircularity.selftest.mjs
    node src/vehicles/profiles/t90ATurretSeat.selftest.mjs
    node tools/local-import-integrity.selftest.mjs
    npm run typecheck
