# ADR 0064: Battle result presentation has one typed state machine

- Status: accepted
- Date: 2026-08-27

## Context

The render loop previously owned final-result detection, the live destruction
hold, pointer-lock release, kill-cam replay selection, replay completion,
verdict presentation, death-camera continuation, rematch reset, and pending
replay cancellation. The ordering is observable and easy to break, but it does
not belong to fixed-step simulation or frame rendering.

## Decision

`src/game/battleResultPresentationRuntime.ts` owns this presentation state
machine. It receives game result state, kill-cam and camera capabilities, and
small UI/event callbacks as ports. `tick()` invokes one `update()` method after
simulation; battle entry calls `reset()`, and battle exit calls
`clearPending()` before disposing presentation resources.

The owner preserves the existing 2.6-second live destruction beat. If the team
result arrives during that beat, the original deadline is retained and its
completion is redirected into the final result replay. Failure to start a
replay immediately presents the verdict and cannot strand the HUD behind its
cinematic veil.

## Consequences

- Result and kill-cam policy is testable without DOM, WebGL or a render loop.
- `src/main.js` no longer owns replay-pending or verdict latch state.
- Result timing remains presentation-only wall time; gameplay result truth and
  battle time remain authoritative simulation fields.
- New result modes must extend this owner rather than add branches to `tick()`.

## Verification

    node src/game/battleResultPresentationRuntime.selftest.mjs
    node src/game/killcamPresentation.selftest.mjs
    node src/ui/endScreen.selftest.mjs
    npm run typecheck
    npm run build
