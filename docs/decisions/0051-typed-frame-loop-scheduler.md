# ADR 0051: Browser frame delivery has one typed scheduler

- Status: accepted
- Date: 2026-08-27

## Context

`src/main.js` directly owned animation-frame handles, duplicate-request
coalescing, WebGL context-restoration rearming, a hidden-pane timer, and six
input listeners. Embedded Chromium panes can report themselves permanently
hidden and starve `requestAnimationFrame` while still receiving real input.
Without a bounded recovery path, short control edges expire before the
simulation observes them. An unlatched recovery path, however, can create two
render loops when animation frames resume.

These are browser clock and lifecycle rules, not simulation or rendering
policy. Leaving them beside the frame body made their single-loop invariant
implicit and difficult to exercise without a browser.

## Decision

`src/engine/frameLoopScheduler.ts` owns browser frame delivery. It exposes
schedule, restart, and dispose operations and funnels animation-frame, timer,
and input recovery through the same timestamped callback.

The scheduler:

- coalesces all requests behind one queued-frame latch;
- cancels and replaces the pending callback after WebGL restoration;
- permits 100 ms input recovery only for hidden, interactive panes;
- permits 200 ms timer recovery only when the hidden document retains focus;
- gates every fallback until top-level boot has completed;
- keeps genuinely backgrounded tabs frozen;
- removes every listener and timer on disposal.

The fixed-step accumulator, frame-delta clamps, pause behavior, simulation,
presentation, world, audio, lighting, and post-processing remain in the
composition root and receive the same timestamps as before.

## Consequences

- Browser loop ownership is testable without DOM or WebGL.
- Input rescue cannot stack a second animation loop.
- Context restoration has an explicit restart contract.
- `src/main.js` no longer owns browser listener and frame-handle bookkeeping.

## Verification

    node src/engine/frameLoopScheduler.selftest.mjs
    npm run typecheck
    node tools/controls-probe.mjs
    npm run perf:cold -- --url http://127.0.0.1:5180/ --sessions 2 --summary 1
    npm test
    npm run build
