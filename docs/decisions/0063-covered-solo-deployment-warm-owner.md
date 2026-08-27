# ADR 0063: Covered solo deployment warming has one typed owner

- Status: accepted
- Date: 2026-08-27

## Context

The final solo-battle loading phase must finish camouflage, stream both visual
cohorts, prepare suspension terrain, submit production shader programs, stage
combat effects, prime cascaded shadows and post-processing, and render the
exact reveal frame. Those operations are deliberately ordered and cancellable.
Keeping nearly two hundred lines of that policy inside `src/main.js` obscured
the composition boundary and made failure behavior difficult to test without a
browser and live WebGL context.

## Decision

`src/game/soloBattleDeploymentRuntime.ts` owns the complete covered warm from
the final camouflage receipt through the first production-quality deployment
frame. It receives renderer, scene and feature capabilities as narrow ports.
Its public result contains only the warm generation and whether the reveal was
successfully primed.

The owner preserves these invariants:

- work stops whenever its generation becomes stale;
- allied and enemy visual cohorts finish before terrain and first-frame work;
- exact combat FX, forward programs, shadows and post passes are prepared while
  the branded loader still owns the viewport;
- a warm failure records diagnostics and falls through to the existing safe
  reveal path instead of stranding the player behind the loader; and
- the deferred rare-quality queue retains the pending latch and generation.

`src/main.js` remains responsible for battle acquisition, phase transitions and
port wiring. It no longer implements deployment-warm policy.

## Consequences

- The composition root loses more than 160 lines of order-sensitive code.
- Cancellation, ordering and fail-soft reveal behavior are executable in Node.
- Future shader or deployment changes have one owner and must not grow a second
  inline warm sequence in the composition root.
- The boundary does not change geometry, materials, enabled effects, shadows,
  quality settings, countdown duration or simulation behavior.

## Verification

    node src/game/soloBattleDeploymentRuntime.selftest.mjs
    node src/ui/loadingScreens.selftest.mjs
    node src/game/battleEntryLifecycle.selftest.mjs
    node src/game/deferredCombatWarmRuntime.selftest.mjs
    npm run typecheck
    npm run build
    node tools/loading-budget-probe.mjs --mode battle --maps verdant
