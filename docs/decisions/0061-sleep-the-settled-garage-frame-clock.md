# 0061 — Sleep the settled Garage frame clock

Status: superseded by [0070](0070-event-invalidated-static-garage-depth.md)

## Context

The Garage render pacer had already reduced complete Three.js paints from
display cadence to one watchdog frame per second. The application-level
`requestAnimationFrame` loop nevertheless continued waking at display cadence
to discover that no render was due. On the production resource probe this
left a static screen doing roughly sixty composition-root callbacks per second
even though only one of them could paint.

CSS transitions are browser-owned and do not require the Three.js clock. Tank
switches, showroom input, phase transitions, covered loading, Studio, and
retained multiplayer rooms do require immediate or continuous ticks.

## Decision

`frameLoopScheduler.ts` owns a second scheduling lane. When the composition
root reports a settled, room-free Garage, the scheduler uses the same
one-second watchdog cadence as the render pacer. Pointer, touch, mouse,
keyboard, and wheel input cancel that sleep and request an animation frame
immediately. Phase changes and WebGL-context recovery do the same.

The composition root may enter this lane only when:

- boot is complete and the phase is Garage;
- no loading cover or transition is active;
- Studio and deterministic shot staging are inactive;
- showroom motion and pedestal switching are settled; and
- no retained network match needs its authority pump.

The production resource gate records animation/idle clock ticks and rejects a
settled initial or returned Garage that resumes animation-frame cadence.
Its CPU, heap, program, geometry, texture, submission, and triangle ceilings
are tightened around the new production baseline at the same time, so this
work cannot be erased later by passing an FPS-only benchmark.

## Consequences

- Static Garage task residency fell from about `0.042` to `0.018` core on the
  same 1280×577 DPR-1 production probe; returned Garage fell from `0.042` to
  `0.017` core.
- Rendering quality and the one-second async-completion watchdog are unchanged.
- All player input wakes the next browser frame immediately.
- Network rooms deliberately retain display cadence while parked in Garage so
  connection recovery and host snapshots do not inherit the static-screen
  throttle.

## Verification

```sh
node src/engine/frameLoopScheduler.selftest.mjs
npm run typecheck
npm run build
npm run perf:resources:gate
```
