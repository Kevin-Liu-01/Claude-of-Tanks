# 0181 — Solo battle authority is strict TypeScript

Status: accepted

## Decision

The demand-loaded local authority is `src/game/state.ts`. It owns deterministic
battle setup, bot opening doctrine, tank/world collision, shell advancement,
damage-event enrichment, match-mode adaptation, and the fixed 60 Hz solo step
behind explicit TypeScript contracts.

The authority distinguishes inactive pooled roster entries from active battle
entities. A pooled record may have no state, combat state, special action, AI,
or visual; an active entity has the simulation records required by movement,
damage, spotting, body contact, and match-mode logic.

## Why

The former JavaScript boundary was a central integration seam with no compiler
proof across vehicle specs, mutable combat state, world capabilities, reusable
event payloads, AI controllers, or collision queues. Treating pooled and active
entities as the same unchecked shape also made lifecycle mistakes hard to see.

## Consequences

- Garage boot still reaches combat only through `soloBattleRuntime.ts`; strict
  typing does not pull the authority into the initial module graph.
- Shell pooling, fixed-step timing, deterministic random streams, collision
  queues, bot routes, and visual/gameplay behavior are unchanged.
- Match-mode entities cross one explicit adapter because the generic mode
  engine intentionally knows less than the local presentation entity.
- Persisted or legacy JavaScript values do not introduce `any`, compiler
  suppressions, or nullable active-state assumptions into the authority.
- A missing streamed visual safely defers firing/destruction presentation
  instead of crashing the simulation while a battle transition completes.
- Movement, combat, spotting, AI, mode, ERA, lazy-runtime, typecheck, build,
  and repository-integrity gates certify the migration.
