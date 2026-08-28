# 0118 — Context-sensitive vehicle actions share one strict state machine

## Context

Guided missiles, hydropneumatic aiming, and manual magazine reloads share one
edge-triggered action across keyboard, controller, touch, solo authority, and
network authority. The action metadata was typed, but its mutable state,
combat ports, result vocabulary, missile-flight identity, and restore path
remained implicit JavaScript.

## Decision

`specialActionPolicy.ts` owns the literal action kinds, descriptor, spec, and
mutable state contracts. `specialActions.ts` owns the strict deterministic
activation, fire, guidance, completion, and weapon-restore state machine over
minimal entity/combat ports. Browser presentation imports the typed state
directly instead of casting it through `unknown`.

## Consequences

- Solo and multiplayer authorities retain the exact same action transitions.
- Missile shell identity is explicitly string-or-number and nullable.
- Magazine denial, weapon restoration, and suspension state remain unchanged.
- No wall-clock, DOM, renderer, or per-frame allocation enters simulation.

## Verification

- `npm run typecheck`
- `node src/sim/specialActions.selftest.mjs`
- `node src/net/browserBattleBridge.selftest.mjs`
- `node src/game/playerBattleActions.selftest.mjs`
- `node src/sim/authoritativeMatch.selftest.mjs`
- `npm run build`
