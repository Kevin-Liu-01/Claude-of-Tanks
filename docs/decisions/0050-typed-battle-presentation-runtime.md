# ADR 0050: Rendered tank presentation has one typed hot-path owner

- Status: accepted
- Date: 2026-08-27

## Context

`src/main.js` owned every rendered-tank update: fixed-step solo interpolation,
network pose selection, spotting residency, off-screen running-gear cadence,
dust and exhaust density, and light crushable contact. This was more than two
hundred lines inside the frame loop's immediate call path. The policies were
coupled by shared scratch vectors and source-location tests rather than a
behavioral interface.

Applying the solo interpolation buffer to WebRTC entities would smooth an
already interpolated/corrected pose a second time, adding latency and making
authority corrections look like rubber-banding. Running full track deformation
for hidden or off-screen actors also wastes the most expensive vehicle detail
work.

## Decision

`src/game/battlePresentationRuntime.ts` owns rendered tank presentation behind
four methods: reset solo poses, prime deployment terrain, capture a completed
solo simulation step, and update one rendered frame.

The runtime:

- samples the stable fixed-step pose buffer only for solo battles;
- presents BrowserBattleBridge state directly for network matches;
- removes fully hidden opponents from scene traversal and restores only roots
  detached by this same owner;
- passes an explicit visibility signal to running gear so off-screen actors can
  retain lower detail cadence without changing their transforms;
- emits vehicle media on a bounded 60 Hz accumulator at any display refresh;
- reuses all per-frame vectors and allocates only during deployment priming;
- preserves signed travel direction for reverse crush contacts.

Battle-only interpolation and era implementations remain behind the existing
lazy `battleClientAccess` port, so the extraction does not pull combat modules
into garage boot.

## Consequences

- `src/main.js` no longer owns rendered vehicle policy or its scratch state.
- Solo and network smoothing have an explicit, testable separation.
- Visibility, track-detail, FX, and crush-contact changes have one owner.
- Tests exercise visible behavior through the runtime rather than matching the
  composition root's source layout.

## Verification

    node src/game/battlePresentationRuntime.selftest.mjs
    node src/fx/lazyRuntime.selftest.mjs
    node src/ui/loadingScreens.selftest.mjs
    npm run typecheck
    npm run perf:dev -- --profile constrained --seconds 8 --cpu-profile=false
    npm test
    npm run build
