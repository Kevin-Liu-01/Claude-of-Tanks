# 0182 — Shared bot control is strict TypeScript

Status: accepted

## Decision

The renderer-free bot controller is `src/game/ai.ts`. It owns target selection,
role doctrine, terrain-aware local routing, friendly traffic separation,
recovery, articulated gun laying, shell selection, and trigger discipline behind
explicit TypeScript contracts shared by solo and authoritative server matches.

AI entities are active simulation records. Their input, movement state, combat
state, vehicle dimensions, gun and shell data, terrain probes, obstacle queries,
spotting gate, and notification callbacks are typed at the controller boundary.
Presentation remains outside this module.

## Why

The former JavaScript controller was more than three thousand lines of central
gameplay policy. Unchecked structural assumptions made it difficult to distinguish
valid headless fixtures from incomplete live entities and obscured which terrain,
combat, and networking capabilities the controller actually requires.

## Consequences

- The controller remains pure logic and Node-runnable; importing it does not pull
  WebGL or DOM work into boot or server authority.
- Solo bots, browser-hosted rooms, and dedicated matches keep the same 60 Hz input
  vocabulary and deterministic random stream.
- Fast terrain height sampling remains optional. Normal and ground-type probes
  have explicit safe fallbacks for reduced headless fixtures.
- Pooled roster records cannot be passed as active AI entities without proving
  their state, combat, and input shape.
- No gameplay tuning, aiming constants, route policy, visuals, or runtime loading
  order changed in this migration.
- Focused AI, aiming, spotting, authoritative-bot, battle-pacing, and solo-runtime
  checks certify behavior before the full project gate runs.
