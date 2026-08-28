# 0197 — Fleet projections and family order are strict TypeScript

Status: accepted

## Decision

`src/vehicles/rosterPolicy.ts` owns production exclusions, the explicit local
development gate, historical retention, and stable development-only reasons.
`src/vehicles/fleetOrder.ts` independently owns the final player-facing order
of related native vehicle families after distributed registration completes.

Registration order remains an implementation detail. Every Garage,
matchmaking, asset, and tooling surface consumes a named projection produced
from policy and then normalized through the family-order interface.

## Why

The registry contains production vehicles, locally inspectable development
vehicles, and two reference-only records. Letting callers filter those groups
or infer lineage from module evaluation order creates quiet disagreement
between the Garage, matches, generated assets, and documentation.

Policy and order stay separate because deleting either redistributes distinct
complexity: eligibility rules would spread across consumers, while lineage
splicing would return to registration modules. Both are deterministic,
in-process modules tested through their public functions.

## Consequences

- Production exclusions and environment keys use closed typed inputs.
- Family tables are immutable and ordering mutates only the explicitly passed
  roster array, preserving all existing registration and save IDs.
- Current projections are documented as 117 production vehicles, 154
  first-party development playables, and 156 saved records including two
  reference-only placeholders.
- Roster policy, matchmaking ranking, nine family progressions, native-wheel
  receipts, and the Swedish siege line pass their existing behavior gates.
