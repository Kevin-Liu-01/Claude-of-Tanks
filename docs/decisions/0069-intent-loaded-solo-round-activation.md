# ADR 0069: Solo round activation is an intent-loaded transaction

- Status: accepted
- Date: 2026-08-27

## Context

Covered loading, deployment warmup, and solo authority already had typed
owners, but `src/main.js` still implemented the roughly 130-line synchronous
transaction that turns an acquired world and roster into a live round. It
reset replay, effects, aim, camouflage, destructibles, presentation history,
HUD, camera, and phase state in an order that rematches and engineering entry
must share.

That policy was evaluated during every Garage boot even though only solo and
engineering battle entry use it. Its ordering could only be tested indirectly
through a complete browser battle.

## Decision

`src/game/soloBattleStartRuntime.ts` is a strict-TypeScript deep module with one
public synchronous `start()` operation. It owns the complete post-acquisition
activation transaction, including round-scoped reset, world activation,
destructible restoration, roster construction, camouflage scheduling,
presentation priming, HUD/camera handoff, and optional immediate debug reveal.

`src/game/soloBattleStartAccess.ts` is a retryable intent owner. The covered
solo loader acquires it in parallel with the world, authority, interface, FX,
audio, and roster work before calling the synchronous operation. A transient
chunk failure can therefore retry without a page reload, while ordinary
Garage and multiplayer boot do not evaluate the solo activation policy or
assemble its concrete adapter graph.

## Consequences

- At the extraction checkpoint, `src/main.js` fell from 3,489 to 3,429 lines
  and retained concrete adapters,
  not the activation transaction.
- The production main chunk is 570.60 kB minified / 193.94 kB gzip; the solo
  activation owner is a separate 2.96 kB / 1.32 kB gzip intent chunk.
- Player-path loading, debug entry, and rematches share the same round-reset
  order. Partial setup cannot publish the battle phase without a player.
- No simulation, camera pose, camouflage, FX, UI, countdown, visual, or
  matchmaking policy changes.

## Verification

```sh
node src/game/soloBattleStartAccess.selftest.mjs
node src/game/soloBattleStartRuntime.selftest.mjs
node src/game/soloBattleLoadingRuntime.selftest.mjs
node src/fx/lazyRuntime.selftest.mjs
npm run typecheck
npm run build
npm run perf:loading
npm run perf:resources:gate
```
