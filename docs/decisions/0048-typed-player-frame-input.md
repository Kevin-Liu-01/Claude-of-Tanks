# ADR 0048: Rendered player input has one allocation-free frame owner

- Status: accepted
- Date: 2026-08-27

## Context

The render loop directly sampled keyboard, mouse, gamepad, touch, pointer-lock
fallback, zoom, free-look, and sniper actions. It also encoded steering sign,
ammunition gating, pause/killcam suppression, and RMB-mode policy in the middle
of simulation and presentation work.

## Decision

`src/game/playerFrameInput.ts` owns one rendered frame of player control
sampling. It receives the input layer, ammunition check, and explicit debug
fire port, mutates the existing player input record, and publishes one stable
camera-input record for `cameraRig.ts`.

The owner reuses mouse, virtual-stick, cursor, and camera records. It imports no
DOM, Three.js, simulation, or network implementation and allocates nothing in
`poll()`.

The owner preserves these invariants:

- keyboard and virtual-stick steering keep the established yaw sign;
- firing requires a legal device lane and available ammunition;
- garage, pause, killcam, and destroyed-player frames clear driving edges;
- pointer-lock failure uses the live cursor coordinates;
- hold, toggle, and free-look RMB settings retain their exact meanings;
- wheel notches accumulate to three and are consumed once per frame;
- camera deltas are drained but suppressed while loading or paused.

## Consequences

- `src/main.js` no longer knows device sampling details.
- The render loop has one polling call before authority/simulation work.
- All input modes share a direct Node test and the rendered controls probe.
- Future input devices can adapt to the frame owner without editing simulation.

## Verification

    node src/game/playerFrameInput.selftest.mjs
    node src/fx/lazyRuntime.selftest.mjs
    npm run typecheck
    node tools/controls-probe.mjs
    npm test
    npm run build
