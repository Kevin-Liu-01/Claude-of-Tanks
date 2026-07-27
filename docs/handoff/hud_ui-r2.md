# hud_ui r2 handoff — fixes required outside src/ui/

## 1. Grass billboards render as dark rectangles (MAJOR, sniper_view)

File: `/Users/kevinliu/claude-of-tanks/src/world/vegetation.js`

Symptom: hard dark rectangular quads behind grass tufts, loudest in `sniper_view`
at 8x. Cause: each grass tuft is two crossed planes (`gp1` + `gp2.rotateY(90°)`,
lines ~265-269). The plane seen edge-on/at a grazing angle has large UV
derivatives, so the GPU samples high mip levels of the 256px card texture. In
those mips the alpha (blades≈1 over gaps≈0, ~35% coverage) averages above the
current `alphaTest: 0.34` (line ~273), so the ENTIRE quad passes the alpha test
and renders as a solid rectangle of the flood color rgb(66,82,38) injected at
lines ~76-81 — which reads darker than the lit terrain behind it.

Fix (no settings lowered, keep alpha-tested cutout — do NOT switch to sorted
alpha blending):

1. In the `MeshStandardMaterial` at line ~272, raise `alphaTest` from `0.34`
   to `0.5` and add `alphaToCoverage: true` (renderer already uses MSAA via
   default antialias; harmless if not).
2. Raise `t.anisotropy` in `makeGrassCardTexture` (line ~84) from `4` to `16`
   (clamp with `renderer.capabilities.getMaxAnisotropy()` if accessible, else
   16 is safe — three clamps internally).
3. In the flood pass (lines ~78-80) also multiply blade alpha slightly upward
   is NOT needed; instead prevent high-mip alpha from exceeding the threshold:
   after creating the texture, no change needed once alphaTest=0.5 because the
   card's average coverage (~0.35) stays below 0.5, so full-quad passes stop.
4. Bump `mat.customProgramCacheKey` to `'world-grass-wind-v3'` since material
   defines change (ALPHATEST value is a shader define — stale program cache
   would otherwise keep 0.34).

Verify: `node tools/screenshot.mjs --views sniper_view` — no rectangular
plates behind tufts inside the magnified view.

## 2. Harness currently fails on `explosion` view (NOT a ui bug)

`node tools/screenshot.mjs` (full run) fails with `spawnScorch is not defined`
thrown from `/Users/kevinliu/claude-of-tanks/src/fx/effects.js:680` — an
in-flight edit by the fx owner. All HUD views
(`--views player_view,sniper_view,garage`) pass with exit 0 and zero console
errors. Whoever integrates this round: re-run the full harness after the fx
fix lands.

## 3. Optional polish (not blocking)

`src/main.js` `SHOT_VIEWS.player_view` forces `penRatio: 1.3` while aiming at
open ground; with the new HUD, distance + pen-colored reticle read as "on
target". Consider `penRatio: null` for player_view so the arcade shot shows
the neutral white reticle like WoT over terrain (purely a screenshot-recipe
choice; HUD handles both).
