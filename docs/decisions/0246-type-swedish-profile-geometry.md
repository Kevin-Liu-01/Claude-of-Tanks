# 0246 — Swedish profile geometry has a strict TypeScript owner

Status: accepted

## Decision

`src/vehicles/profiles/sweden.ts` owns the UDES 03, Strv 103A, Strv 103B,
Strv 81, and Strv 122 first-party visual builds behind explicit builder, loft,
fixed-gun, transform, material, equipment, and receipt contracts. The family
stays demand-loaded through `fleetFactory.ts`; eager audits consume the same
profile table through `profiledProcedurals.ts`.

The migration preserves every primitive, transform, material bucket, donor
assembly, hydropneumatic running-gear course, fitted ghillie suit, gun station,
decal, and geometry receipt. It changes neither combat specifications nor
family order.

## Consequences

- The complete Swedish profile pack participates in strict checking.
- Fixed-mount gun and loft records cannot silently widen their schemas.
- Player boot still loads the pack only for a required Swedish vehicle.

## Verification

    npm run typecheck
    node src/vehicles/profiles/strv103TowRope.selftest.mjs
    node src/vehicles/profiles/strv103ATowRope.selftest.mjs
    node src/vehicles/profiles/udes03Fidelity.selftest.mjs
    node src/vehicles/profiles/swedishSiegeLine.selftest.mjs
    node src/vehicles/profiles/strv81TurretClosure.selftest.mjs
    node tools/tank-assets-check.mjs --ids=udes03,strv103a,strv103,strv81,strv122
    npm run build
