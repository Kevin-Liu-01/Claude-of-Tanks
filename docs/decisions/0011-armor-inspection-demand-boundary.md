# 0011 — Plate-level aim inspection is battle-owned

## Context

The scoped armor flashlight constructs dynamic collision-shell geometry and
samples exact armor, normalization, ricochet, ERA, and shell falloff. None of
that code or Three.js state is used by the garage. It was nevertheless part of
every first-visit entry graph because the composition root created it beside
the input layer.

## Decision

`armorAimOverlayAccess.ts` is the retryable owner for the scoped armor
inspection runtime.

- Battle intent starts the module transfer.
- Covered battle entry awaits acquisition before any roster visual is primed.
- Deterministic capture setup uses the same explicit acquisition barrier.
- `hide()` and `clear()` are safe before acquisition; sampling operations fail
  fast if a caller violates the barrier.
- A rejected transfer clears the pending owner and may be retried.

## Consequences

Garage boot no longer transfers or constructs armor-inspection code. The exact
collision cells, rendered materials, sample cadence, global query budget, and
penetration colors remain unchanged once battle or capture ownership begins.

## Verification

- `src/game/armorAimOverlayAccess.selftest.mjs` verifies failure recovery,
  request coalescing, barrier enforcement, and complete method delegation.
- `src/game/armorAimOverlay.selftest.mjs` remains the behavioral contract for
  exact scoped targets, bounded sampling, and cleanup.
- Production output must isolate the overlay from the initial main chunk, and
  battle plus deterministic screenshot probes must remain green.
