# 0169 — Typed damage and ERA authority

Status: accepted

## Decision

The deterministic damage runtime is strict TypeScript. Shell behavior,
penetration state, armor intersections, ERA tiles, modules, crew, fires,
magazines, reloads, repair transitions, hit events, and HUD penetration
estimates now share explicit contracts across solo play, dedicated authority,
client presentation, equipment, and special actions.

## Why

Damage resolution is authoritative and replay-sensitive: penetration and
damage rolls are consumed in a fixed order, ERA tiles may activate only once,
and every resulting event crosses simulation, networking, effects, killcam,
and HUD boundaries. Implicit object shapes made it possible for incomplete
shell, armor, reload, or event data to fail far away from its owner. Encoding
those contracts at this boundary makes authority drift visible at build time.

## Consequences

- Penetration, ricochet, ERA, spaced armor, HE/HESH, module, crew, fire,
  magazine, repair, and carry-through algorithms are unchanged.
- The runtime retains module-scope math scratch objects and introduces no
  per-frame allocation or additional network payload.
- Aim overlays and the battle HUD use the same shell and armor-layer types as
  authoritative hit resolution.
- Magazine special actions use the complete combat/reload contract rather
  than a partial parallel shape.
- Combat, equipment, ERA activation, aim, special-action, authoritative-match,
  import-integrity, build, and resource gates certify the migration.
