# ADR 0034: Closed RTC data lanes replace the peer generation

- Status: accepted
- Date: 2026-08-26

## Context

Claude of Tanks uses separate reliable control and replaceable state data
channels. Chromium can close one lane while the aggregate peer connection still
reports `connected`. The match client correctly marked its split transport
closed, but the room session only watched aggregate ICE state, so it could leave
a returning or long-running player attached to a permanently dead generation.

## Decision

After the match protocol has completed its first handshake, treat either split
transport lane closing as terminal for that RTC generation. Feed that edge into
the existing bounded peer-replacement owner, rotate the signaling page-session
identity, and reconnect the existing match runtime. Suppress the intentional
close edge while a replacement is already in progress.

## Consequences

- A closed data lane recovers even when aggregate RTC state is stale.
- Player identity, room seat, lobby selections, match runtime, and presentation
  ownership remain stable.
- Recovery cannot create overlapping peer replacements.
- Ordinary connected traffic and rendering perform no additional polling.

## Verification

    node src/net/privateMatchHandoff.selftest.mjs
    node src/net/net.selftest.mjs
    node server/signaling.selftest.mjs
    npm run test:net:browser
    npm run typecheck
    npm run build
