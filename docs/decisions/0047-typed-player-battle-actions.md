# ADR 0047: Player battle actions have one typed policy owner

- Status: accepted
- Date: 2026-08-27

## Context

Shell inventory, magazine selection, consumable cooldowns, repair effects,
special actions, and local-versus-network routing were separate mutable blocks
inside `src/main.js`. The render loop, HUD, capture runtime, local simulation,
and WebRTC command pump all depended on that scattered policy.

## Decision

`src/game/playerBattleActions.ts` owns the player's battle-action state and
event routing. Its public interface exposes the live shell cards, tank loadout
installation, an ammunition gate, round cooldown reset, and disposal.

The module receives simulation rules and the multiplayer command lane as ports.
It imports neither Three.js nor the demand-loaded combat runtime, keeping normal
garage boot free of the combat graph while making the policy directly testable
under Node.

The owner preserves these invariants:

- shell counts and per-shell overrides retain their existing values;
- a player shot consumes exactly one round and never produces a negative count;
- settings and non-battle phases suppress battle action edges;
- repair, first-aid, and extinguisher effects mutate only local authority;
- network battles send commands without applying speculative combat state;
- selecting an active magazine slot requests a magazine reload;
- rematches reset consumable cooldowns without replacing the owner.

## Consequences

- `src/main.js` no longer owns ammunition or consumable policy.
- Local, private, LAN, and ranked inputs cross the same action interface.
- Combat implementation remains demand-loaded through `battleClientAccess.ts`.
- Future action additions have one policy file and one realistic test surface.

## Verification

    node src/game/playerBattleActions.selftest.mjs
    node src/fx/lazyRuntime.selftest.mjs
    npm run typecheck
    npm test
    npm run build
