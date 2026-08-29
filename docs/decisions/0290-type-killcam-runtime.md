# 0290 — Killcam playback has a strict TypeScript owner

## Decision

Keep the killcam and spectator controller demand-loaded through
`src/game/killcamAccess.ts`, while moving its runtime implementation to
`src/game/killcam.ts`. Give captured simulation snapshots, entities, vehicle
visuals, replay phases, projected labels, pooled materials, DOM surfaces, and
spectator timers explicit contracts.

## Why

The killcam crosses authoritative combat results, vehicle presentation,
cinematography, x-ray anatomy, effects, HUD overlays, and multiplayer
spectating. Leaving those boundaries implicit made a large integration owner
hard to change safely and allowed optional visual capabilities or stale timer
state to fail far from their source.

## Consequences

- Simulation outcomes are still captured once and replayed as recorded; the
  presentation runtime never recomputes armor, damage, or match results.
- Killcam geometry, timing, materials, camera paths, labels, effects, and
  spectator behavior remain unchanged.
- The runtime remains outside Garage startup and is imported only when the
  stable access facade acquires it.
- Shared materials, lights, scratch vectors, and playback records retain their
  existing reusable lifetimes; no new per-frame allocation path is introduced.
- Optional visual capabilities and Canvas2D acquisition are guarded at their
  owning boundary instead of being invoked unchecked.
- Future killcam changes must extend the local contracts without `any`, compiler
  suppression, or an eager boot import.

## Verification

- `npm run typecheck`
- `node src/game/killcamAccess.selftest.mjs`
- `node src/game/killcamGhostPolicy.selftest.mjs`
- `node src/game/killcamPresentation.selftest.mjs`
- `node src/game/battleResultPresentationRuntime.selftest.mjs`
- `node src/game/replayPose.selftest.mjs`
- `node src/ui/hitEventFormat.selftest.mjs`
- `node src/ui/topAccentBorders.selftest.mjs`
- `node src/ui/mobileLayout.selftest.mjs`
- `npm run build`
- `npm test`
