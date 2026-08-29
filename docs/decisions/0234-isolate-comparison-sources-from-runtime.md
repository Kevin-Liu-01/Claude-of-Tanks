# 0234 — Comparison geometry metadata is tools-only

Status: accepted

## Decision

Remove every `candidateGlb` record from the browser fleet registry. Preserve
the seven active local comparison articulation records in
`tools/vehicleComparisonSources.mjs`, consumed only by the offline model-quality
audit.

Strengthen `tank:native:check` and product-stat coverage to reject any future
runtime `glb` or `candidateGlb` path. The audit scans JavaScript and TypeScript
sources and rejects local recovered-model feature switches as well.

## Why

All playable vehicles use first-party procedural builders. Keeping untracked
reference paths in `src/vehicles/specs.js` added boot bytes, preserved a latent
source-model concept in production, and made public documentation imply that
external geometry remained part of the game.

## Consequences

- Runtime fleet code cannot discover or request a comparison GLB.
- Offline model-quality scoring retains the same seven local inputs.
- The public product surface no longer advertises a runtime comparison count.
- No playable geometry, visual, balance value, or roster order changes.
