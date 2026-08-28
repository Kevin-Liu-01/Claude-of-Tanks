# 0207 — Korean variant registration is strict TypeScript

Status: accepted

## Decision

Register the K2B combat row in `src/vehicles/korea.ts` using the shared fleet
spec contract. Express its donor deltas through a bounded options interface:
identity, presentation, dimensions, selected mobility stats, reload, shell
name, and armor factor.

Keep the combat row mutable during construction because variant registration
intentionally clones and modifies its donor. The shared contract therefore
describes registry data, not immutable application state; frozen published
receipts remain separately readonly.

## Why

The prior helper accepted an unchecked options bag and mutated an unchecked
donor. Misspelled stats, incomplete dimensions, or invalid presentation data
could silently enter the selectable roster. A typed delta contract preserves
the donor workflow while closing that registration seam.

## Consequences

- K2B remains a structured clone of K2 with exactly the authored deltas.
- Armor scaling still excludes external track/attachment plates.
- K2/K2B running-gear geometry and full fleet balance remain the behavioral
  gates.
