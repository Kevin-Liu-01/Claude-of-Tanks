# ADR 0101: Snapshot interpolation has one strict typed model

- Status: accepted
- Date: 2026-08-28

## Context

Authoritative tank state crosses quantization, visibility filtering, delta
assembly, decoding, Hermite interpolation, bounded extrapolation, rest-pose
stabilization, and local-player sampling before presentation. This 688-line
JavaScript core relied on implicit mutable shapes even though it is shared by
solo authority, private rooms, ranked matches, prediction, and the renderer.

## Decision

Move `src/net/snapshot.js` to strict TypeScript. Define source entity and shell
views, quantized entity and shell rows, full and delta snapshots, decoded poses,
immediate authority samples, sampled frames, assembler state, jitter-buffer
configuration, and diagnostics. Preserve centimeter and angle quantization,
viewer-side omission, acknowledged baselines, monotone grounded interpolation,
ballistic airborne interpolation, adaptive delay, rest deadzones, and all
reused sampling objects exactly.

## Consequences

- Authority, transport, prediction, and presentation now share named snapshot
  contracts instead of implicit objects.
- Snapshot sampling remains allocation-free after an entity first appears.
- Hidden enemies remain absent before serialization.
- Motion, visuals, delay adaptation, and wire values are unchanged.

## Verification

    npm run typecheck
    node src/net/net.selftest.mjs
    node src/net/localTankPrediction.selftest.mjs
    node src/net/browserBattleBridge.selftest.mjs
    node src/sim/specialActions.selftest.mjs
    node src/sim/authoritativeMatch.selftest.mjs
    node src/net/privateMatchHandoff.selftest.mjs
    node server/dedicatedMatch.selftest.mjs
    node tools/multiplayer-browser-soak.mjs
    npm run build
