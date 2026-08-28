# 0223 — Procedural profile adapters share strict assembly contracts

Status: accepted

## Decision

Define the type-only assembly, transform, owner, and common builder ports in
`src/vehicles/proceduralBuilderContracts.ts`. Use them for the German OTCO and
Korean K2B adapters, with K2B migrated to `src/vehicles/profiles/korea.ts`.

The contract intentionally describes only operations used by small authored
profile adapters. It does not couple those adapters to the legacy concrete
builder or force large geometry modules into the initial bundle.

## Why

Hull/turret ownership and transform semantics repeat across procedural vehicle
families. Re-declaring local structural types would allow those contracts to
drift as more profiles move to TypeScript.

## Consequences

- Assembly owners and transform tuples have one reusable compile-time contract.
- Profile adapters remain demand-loaded and the shared contract emits no
  runtime JavaScript.
- K2B build order, geometry, transforms, seeds, decals, and inherited K2 donor
  are unchanged.
- Typecheck, K2B release receipts, import integrity, and the production build
  certify the migration.
