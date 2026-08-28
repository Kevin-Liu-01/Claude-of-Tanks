# 0111 — Renderer and context recovery have strict contracts

## Context

The renderer establishes final output density, color and tone mapping, shadow
mode, GPU classification, and WebGL context-loss recovery before any scene
resource is created. JavaScript left its integration-owned `userData` hooks and
asynchronous restore result implicit at one of the most consequential startup
boundaries.

## Decision

`renderer.ts` is the strict TypeScript owner for WebGL construction, final
output resolution, context-loss presentation, and resize projection updates.
It defines the game renderer's recovery and output-resolution data while
retaining the exact antialiasing, exposure, shadow, color-space, and pixel
budget configuration.

## Consequences

- Context-loss and restore handlers have an explicit asynchronous contract.
- Renderer output diagnostics share the canonical `OutputResolution` type.
- Viewport ownership stays in `viewportRuntime.ts`; the renderer exposes only
  construction and resize primitives.
- No visual setting, pixel budget, shadow mode, or recovery behavior changes.

## Verification

- `npm run typecheck`
- `node src/ui/mobileLayout.selftest.mjs`
- `node src/engine/viewportRuntime.selftest.mjs`
- `npm run build`
