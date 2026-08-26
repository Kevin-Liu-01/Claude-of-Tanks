# ADR 0033: First-visit recovery follows forward progress

- Status: accepted
- Date: 2026-08-26

## Context

The first-visit recovery watchdog treated an entire post-processing warm as one
opaque stage. Under heavy GPU contention a dead submission could hold the boot
screen for roughly 35 seconds before recovery. Lowering the timeout alone would
incorrectly reload an old but healthy device that was still completing batches.

## Decision

Pulse the existing boot progress owner between every shadow, scene-upload, and
post-processing warm batch. A progressing stage continually renews its bounded
watchdog. A stage that produces no progress exposes its retry action after eight
seconds and starts one bounded fresh-document recovery after twenty seconds.
The two-reload ceiling, deployment-pin reset, offline/hidden deferral, and
stable-ready receipt remain unchanged.

## Consequences

- Slow but advancing GPU work is not reloaded.
- A genuinely wedged post warm recovers about fifteen seconds sooner.
- The progress bar now reflects work inside the formerly opaque post stage.
- Recovery remains bounded and cannot enter a reload loop.

## Verification

    node src/ui/chunkRecovery.selftest.mjs
    npm run typecheck
    npm run build
    npm run perf:cold -- --url http://127.0.0.1:4173/ --sessions=1 --summary=1
