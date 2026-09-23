# Distant smoke plumes — 2026-09-15

Owner (2026-09-15, battle screenshot of the horizon): "we need far better smoke in the
distance. it looks so bad lmao." The frontline layer drew each smoke column as one tall
quad carrying a vertically stretched, scrolling fBm sheet. Against the sky the stretched
noise read as paint strokes: a smeared streak with a hard silhouette, identical on every
column, sliding upward like a picture on a card.

## What changed (`src/world/frontlineAtmosphere.ts`)

A plume is now a rising stack of `FRONTLINE_LIMITS.columnPuffs` (14) billboard puffs that
share the column's instance matrix. One `InstancedMesh` still draws every plume and every
AA-wreck plume; the per-instance `aPuff` attribute carries the puff's rise phase, the
plume's seed (shared by its puffs), a radius scale and an atlas cell.

- **Atlas** (`makeSmokePuffTexture`): a 256 px 2×2 atlas of four cauliflower puffs. Each
  is a dense radial body (`pow(body, 0.75)`) whose silhouette is eaten by low-frequency fBm
  (radius wobble ±0.40, lobes ±0.30) with mottled RGB self-shading (0.62–1.0). The soft
  `pow 1.35` falloff of the first draft averaged a stack of puffs into a blurred halo; the
  crisp edge is what makes the column lumpy.
- **Rise** (`COLUMN_VERT`): `rise = fract(phase + t·(0.012 + 0.005·seed))` — every puff
  climbs the column in ~70 s and is reborn at the foot, so the stream is continuous and
  never a texture scroll. One speed per plume keeps the puffs evenly strung. A puff swells
  as it climbs (`radius = w·(0.22 + 0.62·rise^0.7)·scale`), and the billboard is spherical
  (built from the camera vector, not the view axes) so the plumes hold up from the
  establishing shot's elevated pose.
- **Wind and lean**: one wind per front (`uWind`, angle across the bearing ±0.7 rad,
  strength 0.35–0.7). Lean grows with height, `h·|wind|·0.5·rise^1.6·(1.4 − buoyancy)`,
  where buoyancy is the plume seed (0.4–1.0): hot fires stand straighter, and the cap keeps a
  strong wind from turning the front into parallel diagonals (the second draft's railyard
  failure). One S-curve meander per plume plus a small per-puff drift off the spine.
- **Shading** (`COLUMN_FRAG`): the puff is lit as a sphere toward `uSunDir` projected into
  the billboard plane (`0.76 + 0.36·n·sun`); tints run soot (`0x2e2924`) → grey
  (`0x6d6761`) → pale (`0xb4afa8`) with height; density thins from mid-height and the top
  28 % fades out, so the column tears apart into haze instead of ending on a line. An
  ember flickers at the root of a fresh plume. Scene fog applies.
- **Wreck plumes** on destroyed AA guns write one whole plume (`writePlume`) into the
  same buffer; `columns.count` always moves in whole plumes.

## Verification

`node src/world/frontlineAtmosphere.selftest.mjs` — whole plumes only
(`count % columnPuffs == 0`), plume count inside `FRONTLINE_LIMITS.columns`, every puff's
phase in [0, 1.05), scale in [0.8, 1.25], atlas cell 0–3; the existing range/height/fan,
replay, AA-destructible and dispose assertions are unchanged.

Visual passes (desktop tier, 3200×1800 probe): verdant, frontier, railyard (overcast, the
strongest wind) and monsoon (hazy). Draft 1 (16 soft puffs, 0.92 opacity) was blurry;
draft 2 (20 puffs, darker) leaned into 45° streaks on railyard; draft 3 fixed the lean but
stayed a smooth stalk; the shipped draft (14 crisp puffs, stronger sphere shading) shows
lumpy, dense columns with varied lean and torn tops on all four maps.

## Map preview art

Owner: "then take new map preview pictures and use those." The establishing shots
(`battlefield`, `battlefield_<id>`) staged a battle but never prepared the frontline layer,
so no preview had ever shown the front. `setShotView` (`src/dev/shotRuntime.ts`) now calls
`prepareFrontline(1049, mapId)` for every map establishing view — one fixed seed, so the
layout is a pure function of the map — and `resetFrontline()` for every other view, so
close-ups and HUD frames keep a clear horizon (`shotRuntime.selftest`: front prepared once
after acquisition and before the final ownership hand-off; cleared elsewhere). The garage
map-picker art (`public/maps/*.webp`, `public/maps/thumbs/*.webp`, `src/ui/mapThumbs.ts`)
was re-rendered from those frames (`node tools/screenshot.mjs --width 3840 --height 2160
--dyn-scale 1 --views <30 battlefield views>` → `node tools/map-thumbs.mjs --shots-dir …`).

## Reversed the same evening

Owner (2026-09-15, evening): "remove the smoke in distance. it looks so bad lmao. also remove
it from chimneys in houses. then take new map preview pictures and use those." The plume
system (atlas, shaders, `aPuff` attribute, `writePlume`, the AA wreck plume) is gone; the front
keeps its artillery anchors (`layoutFront`, the same seeded draws so event logs replay), flashes,
flak, aircraft and AA guns. `src/world/hearthSmoke.ts` and its receipt are deleted and the
world no longer mounts a hearth layer. The establishing-shot front staging (`prepareFrontline`
/ `resetFrontline` on the shot runtime port) was removed again since nothing visible remained
to stage, and the thirty map heroes and picker thumbs were re-rendered without smoke.
