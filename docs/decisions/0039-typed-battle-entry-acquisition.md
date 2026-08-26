# ADR 0039: Battle-entry acquisition has one typed owner

- Status: accepted
- Date: 2026-08-26

## Context

Solo and multiplayer entry both acquire independent module, world, roster, and
transport work behind an opaque transition. Their dependency order and timing
bookkeeping lived in `main.js`. This made it easy to reintroduce serial waits,
let a private client inherit the browser host's collision dependency, or leak a
connected transport when another branch of the barrier failed.

## Decision

`battleEntryAcquisition.ts` owns the two domain operations callers need:
`acquireSolo()` starts independent covered tasks together, and
`acquireNetwork()` overlaps module, world, and connection work while allowing
a browser authority to declare that connection requires the exact world.

The network operation publishes a connected match immediately. The existing
entry-failure owner can therefore close it if a later module or world task
rejects. Timings describe each task's own execution; a host's world wait is not
misreported as connection time. Synchronous cached-rematch owners remain valid.

## Consequences

- Dependency policy and timing leave the composition root together.
- Solo, remote-client, browser-host, and cached-rematch ordering is exercised
  through the public typed interface without DOM, WebGL, or RTC mocks.
- Rendering, authority, transition presentation, and failure UI remain with
  their existing owners.

## Verification

    npm run typecheck
    node src/game/battleEntryAcquisition.selftest.mjs
    node src/game/loadingIntent.selftest.mjs
    node src/net/privateMatchHandoff.selftest.mjs
    npm run build
