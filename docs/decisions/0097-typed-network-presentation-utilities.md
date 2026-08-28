# ADR 0097: Aim projection and event pacing are strict TypeScript

- Status: accepted
- Date: 2026-08-28

## Context

The compact aim projection shared by solo authority, multiplayer input, and
local prediction was an untyped boundary. The rendered multiplayer event queue
also accepted arbitrary values before pacing expensive muzzle, impact, and
destruction effects. Both modules run on latency-sensitive paths where implicit
shapes make regressions difficult to detect.

## Decision

Move `src/net/aimIntent.js` and `src/net/presentationEventQueue.js` to strict
TypeScript. Define the finite vector, wire aim, mutable target, presentation
event, queue option, and queue statistic contracts explicitly. Keep aim
arithmetic, clamping, authoritative event ordering, the one-heavy-event frame
budget, and queue compaction thresholds unchanged.

## Consequences

- Solo authority, network input, and prediction share one checked aim contract.
- Non-object presentation values cannot enter the bounded render queue.
- The hot paths retain their existing arithmetic and allocation behavior.
- Presentation effects and their ordering are unchanged.

## Verification

    npm run typecheck
    node src/net/net.selftest.mjs
    node src/net/presentationEventQueue.selftest.mjs
    node src/sim/authoritativeMatch.selftest.mjs
    npm run test:net:entry
    npm run build
