# 0120 — Pointer-lock recovery has one typed lifecycle owner

## Context

The composition root directly owned pointer-lock denial/restoration listeners,
recursive stage-wait timers, the cursor-aim fallback notice, canvas recapture,
audio resume, and battle-start touch refresh. That mixed DOM lifecycle and
input recovery policy into `main.js`, and offered no teardown boundary.

## Decision

`pointerLockFeedbackRuntime.ts` owns those listeners, timers, notice elements,
and recapture gestures behind injected battle-stage and eligibility predicates.
It exposes one idempotent `dispose()` operation. The composition root only
wires game, input, audio, canvas, and lazy touch-control ports.

## Consequences

- `main.js` loses the pointer-lock state machine and 62 lines.
- A restored lock cancels a notice still waiting behind the loading veil.
- Disposal now clears listeners, pending stage waits, notice timers, and DOM.
- Toast copy, styling, delay, recapture eligibility, and touch behavior remain
  unchanged.

## Verification

- `npm run typecheck`
- `node src/game/pointerLockFeedbackRuntime.selftest.mjs`
- `node src/ui/mobileLayout.selftest.mjs`
- `node tools/controls-probe.mjs`
- `npm run build`
