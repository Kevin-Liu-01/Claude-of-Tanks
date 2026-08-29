# 0253 — Fleet combat anatomy has a strict TypeScript owner

Status: accepted

## Decision

`src/vehicles/combatAnatomy.ts` owns fleet-wide reconciliation between authored
armor, modules and crew and generated first-party geometry receipts. The
pure-data owner now defines strict contracts for mutable plates and boxes,
closed convex collision cells, smooth internal shapes, published layouts, and
rigid-body contact point clouds. The calibration registry exposes the measured
bounds, collision, structure, track, and module-shape receipt schema instead of
an unstructured record.

The migration preserves finalization order, transforms, collision topology,
module derivation, metadata, stable module sorting, and the non-enumerable
idempotence marker. It adds no DOM, WebGL, Three.js, or per-frame work.

## Consequences

- Geometry-generation output and runtime anatomy consumption share one checked
  schema while family payloads remain demand loaded.
- Armor and body-contact consumers receive the same mutable runtime objects and
  arrays as before.
- Comparison specs outside the published layout registry retain the established
  legacy fallback.

## Verification

    npm run typecheck
    node src/vehicles/combatAnatomy.selftest.mjs
    node src/sim/combat.selftest.mjs
    node src/sim/tankBodyContacts.selftest.mjs
    node src/vehicles/profiles/type99Armor.selftest.mjs
    node src/vehicles/fleetLazy.selftest.mjs
    npm run tank:anatomy:check
    node src/vehicles/tankAssets.selftest.mjs
    node tools/local-import-integrity.selftest.mjs
    node tools/public-repo-hygiene.selftest.mjs
    npm run build
