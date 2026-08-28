# 0221 — AFV family registration is strict TypeScript

Status: accepted

## Decision

Keep the nine AFV and IFV combat rows, donor overrides, shell helpers, and
registration in `src/vehicles/afvFamily.ts` under the shared fleet-spec
contracts and validated registry adapter.

The separate procedural geometry builders remain demand-loaded from
`src/vehicles/profiles/afvFamily.js`; this decision does not change their
loading or rendering behavior.

## Why

This pack combines complete authored vehicles with variants cloned from
certified donors. Unchecked option bags previously allowed malformed gun,
dimension, stat, shell, or visual overrides to enter the global fleet
registries without a compile-time failure.

## Consequences

- Variant override fields and shell constructors are compile-time checked.
- Global spec, model-source, and fleet-ID mutations use one validated owner.
- Every authored combat value, donor choice, registration order, and visual
  field remains unchanged.
- Typecheck, AFV balance, family registration, combat anatomy, import
  integrity, and the production build certify the migration.
