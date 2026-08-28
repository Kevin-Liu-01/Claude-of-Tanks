# ADR 0126: Shared FX time has one strict typed contract

## Context

Vehicle recoil, turret-pop trails, particle freezing, and deterministic Studio
captures share one presentation clock. The clock bridge was a small JavaScript
singleton with implicit callback signatures even though its rebasing contract
is load-bearing: a frozen or stepped capture must not age visual effects in
wall-clock time.

## Decision

Migrate the existing clock in place to `src/fx/clock.ts`. Its clock source and
pop-trail emitter now have strict local function types, numeric time and trail
arguments, and explicit nullable/void returns. Call sites retain the same
singleton, synchronous dispatch, default birth offset, and allocation profile.

Focused coverage proves the garage null-clock state, live time progression,
age-preserving rebases, and exact pop-trail forwarding.

## Consequences

- FX consumers can understand the shared time and emitter contracts without
  reading particle or vehicle implementations.
- No renderer, visual timing, or gameplay behavior changes.
- The hot bridge still allocates nothing per sample or emission.

## Verification

- `node src/fx/clock.selftest.mjs`
- `npm run typecheck`
- `npm run build`
