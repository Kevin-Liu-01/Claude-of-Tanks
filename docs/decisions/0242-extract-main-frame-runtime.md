# 0242 — The rendered-frame transaction has a typed application owner

Status: accepted

## Decision

`src/app/mainFrameRuntime.ts` owns the complete rendered-frame transaction:
Garage pacing, Studio and deterministic-capture branches, battle advancement,
camera/replay presentation, world and FX updates, HUD/audio publication,
shadow refresh, postprocessing, and the battle-reveal receipt.

`src/main.ts` remains the composition root. It supplies live ports and owns
application lifecycle, but it no longer retains frame time, cinematic, or FOV
latches. The frame owner also retains the Garage pacing request instead of
allocating an object on each Garage frame.

## Consequences

- Render order is explicit and behaviorally tested outside the composition
  root.
- Covered loading, Studio, capture, Garage, and battle exits remain mutually
  exclusive branches of one frame transaction.
- The hot path creates no frame-local objects.
- Shadow FOV priming remains available through one narrow method.

## Verification

    node src/app/mainFrameRuntime.selftest.mjs
    node src/game/battleFrameRuntime.selftest.mjs
    node src/game/battleHudFrameRuntime.selftest.mjs
    node src/fx/effectAttachments.selftest.mjs
    node src/ui/loadingScreens.selftest.mjs
    npm run typecheck
    npm run build
