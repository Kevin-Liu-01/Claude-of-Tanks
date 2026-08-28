# 0202 — Fleet spec constructors are strict TypeScript

Status: accepted

## Decision

`src/vehicles/specHelpers.ts` owns the pure constructors shared by fleet spec
packs: armor quads, module and crew boxes, shell records, APFSDS range values,
and the canonical community/modern armor envelopes.

It exports structural contracts in meters and millimeters and remains free of
registry, DOM, Three.js, and builder imports. Extension packs may consume the
constructors without importing the fleet or creating a registration cycle.

## Why

These helpers translate compact authored numbers into combat-authoritative
armor, ammunition, module, and crew data. Unchecked tuple order or option
shapes can affect every vehicle using a shared template. The module is a deep,
pure boundary whose type information is useful to both future TypeScript spec
packs and current tools without entering any frame loop.

## Consequences

- Coordinate inputs are explicit three-value tuples and armor resistance
  triples preserve physical, kinetic, and chemical values.
- Optional ERA metadata remains extensible while plate, module, crew, and shell
  base fields have stable contracts.
- Constructor output and numeric formulas are behavior-identical.
- Fleet balance, 300 combat assertions, and the helper fixtures certify the
  migrated boundary.
