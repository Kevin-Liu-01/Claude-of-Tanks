# 0241 — Legacy fleet metadata receipts are generated as strict TypeScript

Status: accepted

## Decision

The two remaining builder/metadata hybrid families keep their authored visual
builders demand-loaded, while `tools/gen-legacy-fleet-specs.mjs` emits their
boot-safe metadata as `modern1Specs.generated.ts` and
`modern2Specs.generated.ts`.

Generated rows satisfy `FleetTankSpec`, bind the legacy dictionaries through
`fleetSpecRegistry.ts`, and preserve the existing delisted-ID rule. The JSON
payloads and registration order are unchanged.

## Consequences

- Garage roster metadata no longer imports generated JavaScript.
- Metadata registration uses the same checked registry boundary as newer
  country and family packs.
- Large Three.js builders remain outside initial fleet metadata boot.

## Verification

    npm run typecheck
    node tools/gen-legacy-fleet-specs.mjs --check
    node src/vehicles/fleetLazy.selftest.mjs
    node tools/local-import-integrity.selftest.mjs
    npm run build
