# 0152: Gallery diagnostics have typed disposable geometry

## Status

Accepted — 2026-08-28

## Decision

`src/gallery/overlays.ts` owns typed armor, collision-cell, module, crew,
selection, and disposable-resource contracts for Tank Gallery diagnostics.
It continues to use the same canonical internal-anatomy builders as the
killcam. `src/gallery/viewGlyphs.ts` owns an exhaustive typed camera-view
vocabulary and marker map.

Overlay containers attach to the authored hull or turret owner, and every
generated geometry and material is released by the overlay lifecycle.

## Consequences

- Gallery and killcam anatomy drift remains covered across the complete fleet.
- Unknown view IDs and malformed inspection structures fail at typed seams.
- Diagnostic overlays remain isolated from normal game and Garage bundles.
