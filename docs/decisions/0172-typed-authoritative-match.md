# 0172 — The headless match authority is strict TypeScript

Status: accepted

## Decision

The browser-hosted and dedicated-server battle composition seam is strict
TypeScript. It exports explicit contracts for lobby records, network input,
authoritative entities, world collision, events, steps, snapshots, and the
match lifecycle. Solo loopback, private rooms, LAN play, and dedicated matches
continue to execute the same 60 Hz authority.

## Why

This module joins movement, armor, damage, spotting, bots, destructibles,
objective modes, snapshot filtering, and reconnect state. In JavaScript those
subsystems communicated through inferred mutable objects, so a field drift
could reach production as rubber-banding, lost input, leaked hidden state, or
an unrecoverable room transition. The authority needs one machine-checked
boundary before its orchestration can be split safely.

## Consequences

- Player identity remains independent from vehicle identity, including
  duplicate tank selections and spectator records.
- Fixed-step input, shell/ERA damage, ramming, rollover, destructible revision
  state, objective modes, and bot behavior are unchanged.
- Viewer snapshots still exclude unspotted enemy transforms before encoding.
- Match-ready, disconnect/rejoin, countdown, result, and rematch hooks now
  expose a stable exported contract to networking callers.
- Existing reused vectors, arrays, maps, terrain cache, and collision scratch
  state remain allocation-bounded; the migration adds no render dependency.
- Authority, movement, spotting, special-action, objective-mode, private-room,
  dedicated-server, import-integrity, build, and resource checks certify the
  migration.
