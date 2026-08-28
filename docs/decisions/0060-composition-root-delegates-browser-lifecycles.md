# ADR 0060: The composition root delegates browser lifecycles

- Status: accepted
- Date: 2026-08-27

## Context

`src/main.js` must declare startup order and connect renderer, simulation, UI,
and network ports. It had also accumulated phase-owned state machines. Garage
camera pointer capture and multiplayer mode launches each repeated their own
enablement, cleanup, and failure rules inline, making unrelated composition
changes risky and leaving those rules outside TypeScript verification.

## Decision

Keep `src/main.js` as the composition root, but move a lifecycle when it has a
coherent owner and a realistic public-interface test.

- `garageShowroomRuntime.ts` owns the Garage-only phase latch, pointer capture,
  drag/wheel routing, and listener disposal. `cameraRig.ts` remains the only
  camera-pose solver and receives the same framing constants.
- `networkBattleLaunchRuntime.ts` owns private/LAN, retained-room rematch, and
  ranked launch policy. Cold-load UI, identity validation, terminal cleanup,
  failure diagnostics, and room retention now converge through one typed path.

Both modules receive capabilities as ports and remain importable in Node. The
composition root keeps concrete scene and DOM objects but no longer implements
either state machine.

## Consequences

- `src/main.js` loses more than 200 lines without changing visual or gameplay
  behavior.
- RTC entry and rematch changes have one policy owner and can be tested without
  WebGL, signaling, or a browser room.
- Showroom listeners have explicit disposal and cannot leak into later phases.
- A mechanical `.js` to `.ts` rename is still forbidden; migration requires a
  smaller interface and behavioral proof.

## Verification

    node src/game/garageShowroomRuntime.selftest.mjs
    node src/net/networkBattleLaunchRuntime.selftest.mjs
    npm run typecheck
    npm test
    npm run build
