# 0153 — Typed product and provenance facts

Status: accepted

## Decision

Keep the dependency-free product totals and first-party authorship record in
strict TypeScript modules. Browser UI, Vite configuration, release tools, and
self-tests import these same modules directly.

## Why

These values cross build-time, runtime, documentation, and attribution
boundaries. Explicit readonly contracts prevent a consumer from silently
changing their shape while preserving the deliberately tiny, registry-free
module graph required by first-visit boot.

## Consequences

- `src/productStats.ts` remains dependency-free and is verified against the
  canonical vehicle and battlefield registries.
- `src/authorship.ts` remains the single first-party provenance record.
- This migration changes no product totals, attribution, visuals, or runtime
  behavior.
