# 0239 — Vehicle-marking seat receipts are generated as strict TypeScript

Status: accepted

## Decision

`tools/gen-vehicle-marking-seats.mjs` emits the eager fleet receipt, the 27
demand-loaded family receipts, and their loader table as `.ts` modules. The
generated payloads expose `Readonly<Record<string, unknown>>`; the authored
`vehicleMarkingSeatRegistry.ts` remains responsible for schema validation and
runtime narrowing.

The surface solver, schema version, serialized seat transforms, visibility
samples, family grouping, and lazy-loading behavior are unchanged. Generated
files remain write-only outputs of the solver.

## Consequences

- Exact decal seats participate in the strict TypeScript dependency graph.
- Family-local chunks stay independent from initial Garage boot.
- The loader consumes its generated promise contract without unsafe casts.
- The regeneration check proves all fleet records byte-for-byte.

## Verification

    npm run typecheck
    node tools/local-import-integrity.selftest.mjs
    npm run tank:marking-seats:check
    npm run build
