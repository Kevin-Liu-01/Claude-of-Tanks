# terrain_environment r2 — handoff to other module owners

All r2 terrain critique items were fixed inside `src/world/`:

- Horizon skylines rebuilt per map (`src/world/maps/horizon.js`): styled ridge
  geometry (rolling/alpine/mesa/escarpment), an altitude-mapped rock-detail
  texture (strata banding, drainage gullies with per-face variation, forest
  mottle + clearings, snow flatten), snow caps, baked sun shading and a
  stronger aerial ramp. An underground ANCHOR row welds the ring to the
  terrain rim — the old floating inner lip opened sky slots that read as
  blown-out white "lakes"/"sea sheets" behind the rim (that was the
  water-plane critique item; there is no water plane in the scene).
- IMPORTANT: `src/world/terrain.js` must keep importing `buildHorizonRing`
  from `./maps/horizon.js`. During this round an older inline copy of the
  4-row ring was restored into terrain.js by a concurrent edit and silently
  shadowed the new system (the map configs target `cfg.horizon.style/
  snowline/banding/treeline`). If skylines ever regress to smooth single-tone
  clay ramps, check that import first.
- Splat shader (`terrain.js`, cache key `world-terrain-splat-v7`): triplanar
  side-projection for rock on slopes >~35° (kills the mesa cliff texture
  smear), matte roughness floor 0.78 except lake ice (kills the wet-plastic
  sheen / white sparkle patches), desaturated neutral road core +
  distance-smoothed road edge dither (no stipple at 50-100 m), wet darkened
  shoreline band around marsh/ice sheets.
- `sourcedTextures.js`: per-layer tint/roughMul (Ground071 dirt desaturated
  toward earth brown, roughness floors raised) so the async sourced sets
  cannot reintroduce orange roads or specular sheen.
- Vegetation: wider per-tree size/hue/value variation, 4-5-lobe asymmetric
  far oak canopies, darker near-neutral bush tints (no more pasted-in
  pure-green shrubs), grass carpet extended (ring 5, fade 95 m, midfield to
  235 m — no more 30-40 m pop to flat albedo), and low-frequency clump masks
  for sparse-biome scatter (desert scrub / winter litter cluster in hollows
  instead of reading as confetti).
- Props: real straw texture on bales/haystacks; urban gained lampposts (and
  toppled ones), kerb-line masonry/slate battle litter, street craters inside
  the town rect (`townCraters`), varied rowhouse setbacks and more rubble.
- Map configs: winter fog 0.0018 -> 0.0013 and desert 0.00105 -> 0.00086 so
  the mountain texture survives the (FogExp2 + post aerial scatter-in) stack;
  warmer verdant horizon palette.

## Asks for other modules

1. (tools/screenshot.mjs owner) The sourced CC0 terrain/building textures load
   async and swap in place; the harness's fixed 1.2 s settle occasionally
   captures the procedural-fallback frame. Consider a ~3 s settle for the
   three map-switching battlefield views, or exposing a texture-ready flag.
2. (fx/vehicles — carried over from r1, still open) Tank track decals on soft
   ground; see addDecalMesh in `src/world/props.js` for working
   polygonOffset/aoExclude settings.

## Notes

- `window.__GAME_READY` path unchanged; world API surface unchanged.
- The horizon ring sets `userData.aoExclude` and must stay excluded from GTAO.
- `globalThis.__HORIZON_DEBUG = true` (set before world build) paints each
  ring row a flat debug color — used to localize sky-gap artifacts.
