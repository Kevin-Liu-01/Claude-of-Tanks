# 0105 — Render-state lifecycles are strict TypeScript

## Context

Replay poses, fixed-step solo presentation interpolation, detached battle
visual reuse, and garage-return cleanup share ownership of rendered tank state.
They run at different lifecycle boundaries but previously exchanged mutable
JavaScript objects without a common checked contract. A mismatch could retain
combat state in the Garage, interpolate an incomplete pose, or reuse a visual
that no longer owned a valid scene root.

## Decision

`replayPose.ts`, `presentationPose.ts`, `battleVisualPool.ts`, and
`garageTankLifecycle.ts` are strict TypeScript owners. Presentation samples use
reused `Vector3` instances and mutable scalar fields; no frame-time allocation
was introduced. The visual pool is capacity bounded and generic over its
minimum lifecycle contract. Garage cleanup explicitly clears every battle-owned
field after decals and effects release their visual children.

## Consequences

- Replay alignment and fixed-step interpolation expose named data contracts.
- Solo rendering remains one fixed simulation step behind authority and does
  not double-interpolate network snapshots.
- Visual reuse and disposal remain bounded and phase exclusive.
- The frame-loop composition root can consume these owners without untyped
  pose or lifecycle objects.

## Verification

- `npm run typecheck`
- `node src/game/replayPose.selftest.mjs`
- `node src/game/presentationPose.selftest.mjs`
- `node src/game/battlePresentationRuntime.selftest.mjs`
- `node src/game/battleVisualPool.selftest.mjs`
- `node src/game/garageTankLifecycle.selftest.mjs`
- `npm run build`
