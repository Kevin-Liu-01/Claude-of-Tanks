# 0235 — Mobile battle controls are strict TypeScript

Status: accepted

## Decision

Move the battle-only touch surface to `src/ui/touchControls.ts`. Define the
gesture state machine, timer ownership, pointer identities, virtual-input port,
DOM element kinds, graphics-preset cycle, and returned runtime explicitly.
Keep loading retryable through `touchControlsAccess.ts` and preserve the
existing intent-only dynamic import.

## Why

Mobile fire, aim, pinch-to-scope, movement, sound, settings, and quality
controls share one input adapter. In unchecked JavaScript, a missing element,
foreign pointer, malformed timer, or incomplete input facade could fail only
after a player entered battle. These are high-value boundaries for compiler
validation because the module is loaded on demand and exercised by several
device layouts.

## Consequences

- Desktop garage boot still does not transfer or construct touch controls.
- Gesture timing, CSS, DOM order, input actions, and rendered output are
  unchanged.
- The focused fire-gesture, retryable-access, and 51-viewport responsive tests
  remain the release gates for this owner.
- Production bundle size and the initial `main` chunk remain effectively
  unchanged.
