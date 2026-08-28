# 0163 — Typed sourced-texture pipeline

Status: accepted

## Decision

The CC0 terrain and building texture-composition pipeline is strict
TypeScript. Source-set manifests, biome plans, texture layers, composition
options, packed-surface canvases, readback state, and bounded LRU entries have
explicit contracts.

## Why

This path sits on first-battle loading and mutates already-bound fallback
textures after asynchronous image fetches. A missing texture channel, invalid
plan entry, null Canvas2D context, or mismatched cache record could otherwise
leave a fresh session visually incomplete without failing the build.

## Consequences

- Existing CC0 sets, biome tints, roughness packing, normal-map sizing, and
  in-place texture swaps are unchanged.
- Readback-heavy work continues to reuse one `willReadFrequently` canvas.
- Composite and normal caches remain bounded at eight and four entries.
- Missing Canvas2D or empty cache invariants fail with targeted diagnostics.
