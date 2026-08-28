# 0140: Radio voice scheduling has a strict timing contract

## Status

Accepted — 2026-08-28

## Decision

`src/audio/voices.ts` owns the typed radio line table, request queue, priority
and interruption rules, cooldowns, staleness, variant rotation, Web Audio
source lifetime, and bounded debug trail.

It remains event-driven and initializes only after the existing user-gesture
audio handoff. The update path retains one bounded two-entry queue and creates
no work when speech is unloaded or idle.

## Consequences

- AudioContext, buffer, source, group, and request lifetimes are explicit.
- Stale or invalid line identifiers remain safely rejected.
- Voice assets and audible timing remain unchanged.
