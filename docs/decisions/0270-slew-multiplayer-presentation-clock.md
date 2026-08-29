# 0270 — Slew the multiplayer presentation clock

## Status

Accepted.

## Context

WebRTC ping responses estimate the offset between a client's monotonic clock
and match authority. Applying each new estimate directly to snapshot sampling
can advance the presentation timeline in one frame. Under latency variance, a
fast tank then appears to jump even though authority positions, interpolation,
and local prediction are individually continuous.

A fixed displacement threshold also misclassifies healthy movement when a
headless browser deprioritizes a background tab. The same physical travel can
span one 16 ms callback or one delayed 40 ms callback.

## Decision

- RTT samples update a smoothed target offset.
- The active sampling offset converges at no more than 50 ms per second of
  active presentation time.
- A suspended or backgrounded client can contribute at most 250 ms of elapsed
  time to one slew step.
- Live multiplayer certification retains a strict single-frame displacement
  gate and additionally measures displacement in excess of the authority
  velocity integrated over the actual observation interval.

The initial `WELCOME` remains an atomic clock epoch: both offsets start at the
same value before any world state is revealed.

## Consequences

Normal drift converges without a visible discontinuity. Large RTT outliers can
no longer make the renderer jump ahead, and delayed QA callbacks no longer
masquerade as protocol rubber-banding. Snapshot truth, local reconciliation,
and the existing hard-snap safety bound remain unchanged.

## Verification

    node src/net/net.selftest.mjs
    node src/net/adverseNetworkTransport.selftest.mjs
    node tools/multiplayer-live-combat.mjs --complete-match --only=host --latency=90 --jitter=40 --loss=8 --input-loss=4
    node tools/multiplayer-live-combat.mjs --complete-match --only=client --latency=90 --jitter=40 --loss=8 --input-loss=4
    npm test
    npm run build
