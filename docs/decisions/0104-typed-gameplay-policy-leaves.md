# 0104 — Pure gameplay policy leaves are strict TypeScript

## Context

Several small but widely reused gameplay policies remained JavaScript islands:
local battle history, consumable cooldowns, mobile target selection, pre-battle
countdown credit, curated matchmaking, and kill-cam ghost filtering. Their
runtime cost was small, but their untyped inputs crossed garage, solo,
multiplayer, server, HUD, and replay boundaries.

## Decision

The six policy owners now use strict TypeScript with explicit data contracts:

- `profile.ts`
- `consumables.ts`
- `mobileAutoAim.ts`
- `preBattleCountdown.ts`
- `matchmaking.ts`
- `killcamGhostPolicy.ts`

They remain dependency-light and preserve their existing runtime algorithms.
Match roster lookup results are narrowed before use, so a missing deterministic
registry entry cannot leak an `undefined` entity into battle setup.

## Consequences

- Browser, server, and test consumers share the same typed policy exports.
- No policy adds work to boot or the frame loop.
- Local records remain non-authoritative; ranked rating stays server-owned.
- Matchmaking order, cooldown values, aim scoring, countdown timing, and
  kill-cam material visibility are unchanged.

## Verification

- `npm run typecheck`
- focused policy self-tests
- `node src/net/privateMatchHandoff.selftest.mjs`
- `node server/rankedMatchmaker.selftest.mjs`
- `node src/sim/authoritativeMatch.selftest.mjs`
- `npm run build`
