# 0200 — Running-gear quality receipts are strict TypeScript

Status: accepted

## Decision

`src/vehicles/wheelQuality.ts` is the release-facing owner of wheel-pattern and
running-gear geometry receipts. It consumes Three.js scene objects through a
bounded structural view and validates authored wheel and suspension pattern IDs
before using them as registry keys.

The audit returns a stable typed report covering wheel-family receipts,
per-running-gear-unit suspension counts, inboard clearance, shaped arm and
joint profiles, end-wheel bodies, return rollers, and semantic paint roles.

## Why

The visual factory attaches heterogeneous metadata to Three.js `userData`.
Without a checked boundary, missing or misspelled receipt fields silently
propagate through release tools and make the fleet-wide mechanical gate harder
to maintain. Moving the audit—not the hot geometry builder—to TypeScript adds
clarity without introducing work into rendering or simulation loops.

## Consequences

- Runtime rendering, geometry, instance counts, and materials are unchanged.
- Unknown pattern strings remain release failures and cannot index the typed
  pattern registries until validated.
- Per-unit receipt and instance totals use explicit unit-ID maps.
- The complete 127-vehicle audit must continue to cover all 12 wheel families.
