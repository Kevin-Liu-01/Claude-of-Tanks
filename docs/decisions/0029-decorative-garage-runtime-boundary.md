# ADR 0029: Decorative garage rendering follows playable readiness

- Status: accepted
- Date: 2026-08-26

## Context

The garage camouflage picker contained a large exact canvas renderer in the
startup chunk and painted dozens of swatches while the selected tank, shaders,
and post-processing pipeline were still becoming usable. Browser idle callbacks
were not a sufficient gate because they can run inside deliberate boot yields.

## Decision

Exact camouflage swatches live in a separate runtime module. Garage creation
paints deterministic lightweight placeholders synchronously, then a typed,
retryable access owner waits for the explicit `__GAME_READY` contract and a
short quiet window before loading the exact renderer. Pointer, focus, or touch
intent promotes the same shared request immediately. Per-canvas generations
prevent a late render from overwriting a newer vehicle selection.

## Consequences

- Decorative parsing and canvas work no longer competes with pristine boot.
- The settled garage keeps the existing exact swatch visuals.
- A failed optional transfer leaves a usable placeholder and remains retryable.
- Other decorative features should use explicit playable state, not generic
  browser idleness, when scheduling work around boot.

## Verification

    npm run typecheck
    node src/ui/camoSwatchAccess.selftest.mjs
    npm run build

Production browser verification also asserts that the painter request begins
after `__GAME_READY` and that all rendered camouflage canvases converge to
distinct exact outputs without page errors.
