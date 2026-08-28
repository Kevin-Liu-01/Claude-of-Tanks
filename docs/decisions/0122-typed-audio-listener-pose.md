# 0122 — Audio listener pose has one typed frame owner

## Context

The render loop selected player, spectator, kill-cam, and camera listener
positions directly, mutated a shared pose, and knew the scoped mix condition.
That hot-path presentation policy was untyped and embedded in `main.js`.

## Decision

`audio/listenerPoseRuntime.ts` owns the hybrid listener pose. Camera direction
continues to determine azimuth, while the occupied or spectated tank determines
world distance. The runtime retains its pose and vector storage and accepts
only three scalar frame inputs.

## Consequences

- Player, scoped, spectator, kill-cam, and Garage listener semantics are
  explicit strict-TypeScript branches.
- The frame path allocates no records or vectors.
- `main.js` no longer mutates audio listener state.
- The underlying mixer, gains, filters, effects, and audible output do not
  change.

## Verification

- `npm run typecheck`
- `node src/audio/listenerPoseRuntime.selftest.mjs`
- `node src/audio/audioTiming.selftest.mjs`
- `node tools/audio-spatial-killcam-probe.mjs`
- `npm run build`
