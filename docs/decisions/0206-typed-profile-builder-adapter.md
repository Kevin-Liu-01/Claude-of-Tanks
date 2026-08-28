# 0206 — Eager and demand-loaded profiles share one typed adapter

Status: accepted

## Decision

Own profile-to-builder conversion in `src/vehicles/profileBuilderAdapter.ts`.
Both `fleetFactory.ts` and the typed eager `profiledProcedurals.ts` assembly use
that adapter, with one explicit precedence rule: authored custom builder,
donor-variant builder, then generic profile builder.

Profile `build` functions remain a heterogeneous legacy seam because several
families interpret their second argument differently. The adapter validates
callability at runtime and narrows that one seam without weakening the rest of
the profile record or introducing `any`.

## Why

The eager and browser-demand paths had separate copies of the same dispatch
logic. They could diverge in precedence or error behavior, producing different
geometry between release tools and the game. One pure adapter makes topology
identical and independently testable.

## Consequences

- Eager and lazy fleet construction select builders through the same code.
- Invalid authored builder fields fail with an ID-specific error at family
  registration rather than later during vehicle construction.
- Profile order and every custom/donor/generic runtime call remain unchanged.
