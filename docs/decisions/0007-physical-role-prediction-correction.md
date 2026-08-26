# 0007 — Local correction is physical-role presentation state

## Context

The locally controlled tank predicts the same fixed-step movement as authority.
Snapshot reconciliation can still expose small disagreements from terrain
support, dynamic contact, and network timing. Releasing every positional and
angular error through one fast envelope makes a heavy tracked hull appear to
jump vertically or oscillate near another tank. Slowing every channel together
would make the gun feel detached from the player's aim.

## Decision

- Keep authority acceptance, input replay, collision, ballistics, and hard-snap
  policy unchanged.
- Treat reconciliation error as presentation-only state.
- Group horizontal translation and yaw, support height/pitch/roll, and
  turret/gun aim into independently bounded decay channels.
- Use 110 ms horizontal, 160 ms support, and 75 ms aim envelopes normally.
- After terrain or dynamic contact, use 180 ms horizontal and 240 ms support
  envelopes for 300 ms. Aim remains live on its 75 ms envelope.
- Keep the parked hull hold for sub-contact-patch quantization noise; never
  apply that hold to turret or gun articulation.
- Measure the largest correction release and vertical release in browser tests.

## Consequences

The rendered tank reads as a supported heavy body without weakening server
authority or delaying aim. Small contact disagreement remains visible for a few
additional frames instead of becoming one sharp jump. Terminal destruction and
errors above seven metres retain the existing immediate synchronization path.

## Verification

- `predictionCorrection.selftest.mjs` proves grouped decay and resting-aim
  independence.
- `localTankPrediction.selftest.mjs` proves a contact correction releases less
  than 3 cm total and 2 cm vertically in one 60 Hz frame.
- Rendered two-browser and full 7v7 gates reject hard snaps, dropped history,
  correction release above 0.25 m, or vertical release above 0.15 m.
