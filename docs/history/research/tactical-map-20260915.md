# Tactical map batch — 2026-09-15

Owner: "maps need a real visual upgrade, I meant the bottom-right maps in the visual UI … add
better icons for spawns, CTF areas, capture zones, etc."

## What changed

**The plate.** The baked minimap raster (`public/minimaps/<map>.webp`, 440 px, produced by
`node tools/bake-minimap-assets.mjs` from the HUD's own `buildMinimapBg`) now carries:

- a cartographic tone curve instead of the flat brightness lift — `captureLuminance` samples
  the ortho capture and bright grounds (snow, salt, sand; mean luma > 0.58) get a gentler curve
  than the vegetated maps;
- a hillshade (`paintMinimapRelief`): light from the map's upper-left, sampled with a two-cell
  stencil at a sixth of the raster pitch so hills read as relief rather than texture wrinkles,
  alpha-encoded and multiplied over the underlay (it also runs on the procedural fallback);
- union shorelines (`paintMinimapShorelines`): a soft pale rim just inside the shore and a dark
  keyline just outside it, built from masks (A = union fill, B = A blurred, inside band =
  A − B, outside band = B − A) — a river is a chain of overlapping discs and stroking each disc
  drew a string of beads;
- chrome: the grid is a light hairline over a dark one (reads on snow and in forest), the
  coordinate labels are heavier, a cached corner vignette darkens toward the frame, and the
  `.cot-minimap` frame is a bevelled instrument plate (keyline, dark bezel, chalk inner hairline).

Every raster was re-baked, so `MINIMAP_RASTER_REVISION` (`src/ui/minimapAssetUrl.ts`) moved to
`north-up-v8-tactical`; bump it again whenever the bake changes for every map. Per-map revision
strings are gone.

**One marker language.** `src/ui/objectiveGlyphs.ts` draws every objective glyph on a canvas —
hex badge with letter / number and progress arc, pennant, spawn ring with cardinal ticks, goal,
ball, supply cache (heal cross / shells), check. `src/ui/minimapObjectives.ts` derives the
markers from the mode state (`objectiveMarkers(state)`): sides from the viewer's team
(`perspectiveTeam`), zone letters A/B/C, sector numbers with `taken / active / holding /
locked`, flag bases (`home / away`) and travelling flags (`home / carried / dropped`), Turbo
goals and ball, active caches, and the team spawns (`state.spawns`, new in the presentation
state — Zone Control marks both, the co-op modes the human side, CTF and Turbo Ball stand their
objectives on the spawns instead). `markersStandOnSpawns` tells the HUD to skip its generic
base rings.

- Minimap: `drawMinimapObjectives` in `src/ui/hud.ts` paints the markers after the roster
  bases, pulses carried flags / contested zones / the held sector on the frame clock, fades a
  marker under the player arrow, and highlights the own spawn while the player waits to revive.
  The Standard base ring is the same spawn glyph.
- World: `src/game/matchModeWorldPresentation.ts` rasterises the same glyphs into sprite
  textures (`ICON_PX` 128, cached per kind/side/label/status) that float above the objectives
  with `depthTest: false`; flag bases carry an outer halo ring and an additive light column that
  stay home while the flag travels; zones carry a tinted area disc, a capture-progress arc (ring
  segment cached in 5 % steps) and the letter badge; goals and caches carry their icons; spawns
  carry ring, column and mark where the mode revives players. Icons and columns fade out within
  `ICON_NEAR_M`–`ICON_FAR_M` of the viewer (a badge over your own spawn filled the screen) and
  icons grow past `ICON_HOLD_M` to hold their screen size. Colours follow the viewer's team — a
  bravo viewer sees its own zone in ally green (the old code coloured alpha green for everyone).

## Verification

    node src/ui/minimapObjectives.selftest.mjs
    node src/ui/minimapOrientation.selftest.mjs
    node src/game/matchModeWorldPresentation.selftest.mjs
    node src/sim/matchModes.selftest.mjs

QA probes (untracked `.qa-dev/`): `minimap-shot.mjs <url> <mode> <map> <outdir> [tag]` clips the
`.cot-minimap` panel at DPR 2 for a mode on a map; `campaign-shots.mjs --map=verdant` shows the
sector badges and works in the world. Re-bake after any change to the bake path:
`node tools/bake-minimap-assets.mjs` (own vite server, capture lock; ~12 min for 30 maps) and
bump the raster revision.
