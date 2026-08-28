# 0143: Roster presentation has one typed policy

## Status

Accepted — 2026-08-28

## Decision

`src/game/rosterPresentation.ts` owns the small display-row contract used by
both online lobby panels and the solo pre-battle roster. It resolves vehicle
labels and tiers through injected catalog functions, filters incomplete lobby
selections, and keeps the local vehicle first in solo presentation.

The module stays independent from the DOM, renderer, fleet builders, and combat
authority so it remains safe in the garage boot graph and directly testable.

## Consequences

- Lobby and solo roster panels cannot silently drift in naming or row shape.
- `main.js` no longer owns duplicate roster mapping functions.
- Future roster UI changes have one typed, Node-runnable policy boundary.
