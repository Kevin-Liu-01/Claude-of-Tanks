# 0116 — Equipment state has one strict cross-runtime contract

## Context

Equipment data crosses Garage persistence, player and bot loadouts, solo and
dedicated authority, movement, damage, repair, and spotting. The JavaScript
owner left legal item categories, effect vocabulary, module multipliers,
combat mutation, and modified-stat output structurally implicit.

## Decision

`equipment.ts` is the strict TypeScript owner for catalog entries, eligibility,
loadout sanitation, persistence, multiplier folding, combat attachment, bot
defaults, and Garage stat projections. It exposes minimal structural spec and
combat-state ports so neither the DOM nor full simulation graph enters this
pure policy module.

## Consequences

- The fourteen-item catalog and every effect multiplier retain their exact
  values and ordering.
- Module durability factors are constrained to the supported module keys.
- Garage, solo authority, and dedicated authority consume the same checked
  loadout and mutation contract.
- Existing local-storage keys and malformed-save recovery remain unchanged.

## Verification

- `npm run typecheck`
- `node src/game/equipment.selftest.mjs`
- `node src/net/matchRuntime.deadPeer.selftest.mjs`
- `node src/ui/icons.selftest.mjs`
- `npm run build`
