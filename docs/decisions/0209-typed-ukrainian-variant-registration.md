# 0209 — Ukrainian variant registration is strict TypeScript

Status: accepted

## Decision

Register the five Ukrainian combat variants in `src/vehicles/ukraine.ts`.
Each row clones its certified donor through `fleetSpecRegistry.ts`, applies a
bounded mobility/dimensions/presentation delta, removes donor-only silhouette
measurements, and optionally scales non-external armor.

Keep Oplot-M's tier-X shell and fire-control tuning explicit after clone
construction. Remove the old `heightM` option on M1A1 Abrams UA because the
untyped helper never consumed it; this is dead configuration removal, not a
dimension change.

## Why

The unchecked options bag could accept misspelled or unsupported properties
without affecting the game. That made authored intent diverge silently from
runtime state. A nation-specific type exposes supported deltas while retaining
the exact donor-clone behavior and first-party builder separation.

## Consequences

- Every Ukrainian registration delta is compiler-checked.
- Donor silhouette receipts cannot leak into ground-up Ukrainian builds.
- T-64, T-80, Oplot-M, and Abrams UA geometry suites remain the release gates.
