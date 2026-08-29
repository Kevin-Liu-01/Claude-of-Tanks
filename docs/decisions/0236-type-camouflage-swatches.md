# 0236 — Camouflage swatch painting is strict TypeScript

Status: accepted

## Decision

`src/ui/camoSwatchPainter.ts` retains the existing deterministic Canvas2D
rendering language for every built-in and custom camouflage family. Its public
boundary now requires a real browser canvas and canonical `FleetTankSpec`; its
private color, random-number, resolved-visual, and custom-stroke inputs are
explicitly typed.

The painter stays behind `camoSwatchAccess.ts`. Garage still presents its
immediate deterministic placeholder and only transfers this decorative module
after the playable boundary or direct camouflage intent.

## Consequences

- The conversion changes no pixels, seeds, draw order, dimensions, or timing.
- Nullability and custom recipe shapes are checked without widening the
  boot-critical Garage graph.
- Future camouflage families must extend the resolved visual contract instead
  of relying on implicit Canvas2D values.

## Verification

    node src/ui/camoSwatchAccess.selftest.mjs
    node src/ui/mobileLayout.selftest.mjs
    node tools/local-import-integrity.selftest.mjs
    npm run typecheck
    npm run build
