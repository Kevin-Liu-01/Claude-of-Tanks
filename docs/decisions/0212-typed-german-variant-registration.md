# 0212 — German variant and fitted ERA registration is strict TypeScript

Status: accepted

## Decision

Register the Leopard 2A4 OTCO, 2A4M, 2A6M, and Ukrainian 2A6 rows in
`src/vehicles/germany.ts` through the shared validated fleet registry. Bound
variant deltas to published dimensions, measured rig anchors, selected combat
statistics, fire-control labels, presentation, and non-external armor scaling.

Preserve construction order: register the certified German rows, clone the
Ukrainian 2A6M, then append the separate A6M/A7V fitted frontal ERA and the
Ukrainian vehicle's own field ERA sectors. Type ERA reductions and plate
options at the armor-constructor boundary.

## Why

The former JavaScript pack mixed unchecked donor cloning with global registry
mutation and destructible ERA-sector construction. A strict delta contract and
one registry seam make ordering explicit without changing any armor plate,
presentation value, or first-party procedural geometry.

## Consequences

- Ukrainian 2A6 does not accidentally inherit A6M's separate frontal package.
- ERA sector names remain aligned with the visual clusters consumed by
  `stripEra`.
- Leopard seats, hull closure, fitted ERA, lazy-fleet parity, and full combat
  anatomy are required proof for this boundary.
