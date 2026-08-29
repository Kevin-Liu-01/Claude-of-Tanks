# 0248 — Internal anatomy visuals have one strict TypeScript owner

Status: accepted

## Decision

`src/vehicles/internalAnatomyVisuals.ts` owns the recognizable internal module,
crew, and drivetrain geometry shared by the public Tank Gallery and combat
killcam. Explicit contracts describe armor plates, collision floors, combat
volumes and precise shapes, owner rigs, materials, disposable resources, and
crew-seat receipts.

The Gallery consumes these contracts directly. Its former double-unknown
function assertions are removed, so changes to a combat volume or resource
lifecycle must satisfy the actual shared builder rather than a duplicated
local signature.

The migration preserves every geometry branch, canonical crew proportion,
armor-envelope clamp, presentation tag, material, render order, and disposal
operation. It does not alter simulation damage volumes or expose presentation
geometry to authoritative logic.

## Consequences

- Gallery and killcam cannot silently diverge in internal-anatomy call shape.
- Shape unions make ellipsoid, capsule, and elliptic-cylinder handling
  exhaustive at the shared boundary.
- Fleet-wide presentation remains outside boot-critical work until Gallery or
  killcam requests it.

## Verification

    npm run typecheck
    node src/gallery/overlays.selftest.mjs
    node tools/local-import-integrity.selftest.mjs
    node tools/public-repo-hygiene.selftest.mjs
    npm run build

The parity test covers 130 tanks, 2,071 module models, and 472 crew models.
