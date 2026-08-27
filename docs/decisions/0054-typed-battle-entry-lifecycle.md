# ADR 0054: Every browser battle entry shares one typed lifecycle

- Status: accepted
- Date: 2026-08-27

## Context

Solo, private, retained-room rematch, and ranked entry each manipulated a loose
`battleEntryPending` flag in `src/main.js`. Solo entry additionally owned two
render-gate globals and a loop that waited for an actual battlefield frame
before allowing the opaque loading veil to leave. Repeated `try/finally` blocks
made overlap and cleanup policy depend on every caller remembering the same
rules.

The retained Garage frame is a correctness issue, not merely a transition
detail: revealing it during a cold battle handoff presents the wrong vehicle
state and can expose UI layers from the previous phase.

## Decision

`src/game/battleEntryLifecycle.ts` owns the shared entry critical section,
covered-render state, presented-battle-frame serial, reveal timeout, and reveal
receipt. Its public interface is independent from the DOM, Three.js, transport,
and simulation. The composition root provides frame, clock, and diagnostic
receipt adapters.

Every asynchronous entry mode runs through `run()`. Completion or failure
always clears both pending and covered state. Solo reveal calls `primeReveal()`,
which releases covered rendering and waits for a newer battle frame before the
loader may hide. Private, rematch, and ranked entry share the same exclusivity
without importing their implementations into the lifecycle owner.

## Consequences

- Two entry modes cannot overlap or overwrite each other's room/world state.
- A thrown entry task cannot strand the render loop behind an opaque gate.
- Loader exit cannot expose the retained Garage framebuffer.
- The render loop and end-screen replay path query a typed owner rather than
  composition-root globals.

## Verification

    node src/game/battleEntryLifecycle.selftest.mjs
    npm run typecheck
    npm run perf:loading
    npm run test:net:entry
    npm run test:net:browser
    npm test
    npm run build
