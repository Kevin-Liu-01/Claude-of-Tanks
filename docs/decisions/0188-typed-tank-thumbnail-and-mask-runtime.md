# 0188 — Tank thumbnails and damage masks are strict TypeScript

Status: accepted

## Decision

Packaged tank-thumbnail fallback, DOM normalization, battle-only top-down mask
rendering, mask caching, and hull/turret plan-view metadata are owned by
`src/ui/tankThumbs.ts`. The shared late-effects layer constant is data-only and
is owned by `src/fx/layers.ts`.

The damage-mask renderer accepts an unknown engine context only at its lazy HUD
attachment boundary, validates the WebGL renderer once, and retains explicitly
typed render-target and pixel-buffer ownership thereafter.

## Why

This module bridges packaged image assets, live DOM images, lazy fleet builders,
offscreen WebGL rendering, Canvas2D downsampling, and the damage-panel contract.
The old JavaScript boundary allowed missing canvas contexts, malformed engine
contexts, generic DOM elements, and cache sentinels to flow into GPU work as
unchecked values.

## Consequences

- Thumbnail URLs, fallback order, image behavior, mask resolution, projection,
  margins, cache size, and deferred build timing remain unchanged.
- DOM queries narrow to image elements before touching image-only state.
- Canvas2D unavailability fails at acquisition instead of a later null access.
- Pending and failed cache sentinels cannot be mistaken for usable mask data.
- The late-FX render-layer import remains data-only and cannot pull particles
  into the Garage boot graph.
- Strict typecheck, icon, lazy-HUD, lazy-FX, production build, and repository
  import-integrity gates certify the migration.
