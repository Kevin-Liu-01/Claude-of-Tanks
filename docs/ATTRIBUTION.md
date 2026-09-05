# Project and Asset Attribution

## Project authorship

**Claude of Tanks was created, designed, and directed by Kevin B. Liu.**
Claude and Codex were development tools, not co-authors or copyright holders.
Unless a row below, an embedded notice, or a license record identifies another
author, every original repository file and asset is Copyright © 2026 Kevin B.
Liu. First-party material is covered by the root MIT License unless
[`LICENSE-POLICY.md`](../LICENSE-POLICY.md) identifies it as proprietary
Reserved Content. Reserved Content includes procedural vehicle and battlefield
source, fleet and map data, generated game assets, capture recipes, authored
media, and first-party branding.

Every selectable runtime vehicle model is original procedural geometry created
by Kevin B. Liu. Downloaded vehicle models are quarantined comparison/research
inputs, never playable geometry, and retain the attribution recorded below.

Third-party exceptions take precedence over the repository-wide Kevin B. Liu
notice. Neither project license relicenses third-party fonts, marks, shader
code, reference models, props, or other sourced work. See [`NOTICE.md`](../NOTICE.md)
for the concise repository coverage rule.

Every downloaded asset committed to this repo is recorded here (name, author,
source, license, file path). Runtime stays fully self-contained: all files are
served locally from `public/`, no CDN or network fetches in game code.

| Asset | Author | Source | License | Files |
|---|---|---|---|---|
| ABC Monument Grotesk (Regular/Medium/Bold, woff2 converted from the owner's OTF cut with fontTools, otherwise unmodified). OWNER-DIRECTED CHOICE (fonts r4, 2026-08-04) replacing Inter as the UI face — the owner supplied their own Dinamo cut; ABC Monument Grotesk is a COMMERCIAL typeface and is used here under the owner's own Dinamo license terms, NOT under this repo's asset licenses. It must not be copied out of this repo for reuse. Weight mapping via @font-face ranges: 100-400 Regular, 500-600 Medium, 700-900 Bold (UI usage floor stays 500). | Dinamo Typefaces | https://abcdinamo.com/typefaces/monument-grotesk | Commercial (Dinamo EULA, owner-held) — all rights reserved by Dinamo; not covered by the licenses in this file. | `public/fonts/abc-monument-grotesk/ABCMonumentGrotesk-{Regular,Medium,Bold}.woff2` |
| Inter variable font v4.1 — RETIRED from the live UI (fonts r4 swap to ABC Monument Grotesk, 2026-08-04; previously the UI face per the r3 owner-directed swap from Archivo, which had replaced the unobtainable Klim "Die Grotesk"). InterVariable.woff2 itself is removed from public/; Inter survives ONLY as the two ~1.5 KB wordmark subsets embedded in the brand lockups (see the brand row below), so the OFL license file stays committed. | Rasmus Andersson (The Inter Project Authors) | https://rsms.me/inter/ (release: https://github.com/rsms/inter/releases/tag/v4.1) | SIL Open Font License 1.1 | license: `public/fonts/inter/OFL.txt` (font file removed; subsets embedded in `public/brand/logo-full.svg` + `logo-full-metal.svg`) |

## Embedded open-source shader code

| Software | Author | Source | License | Files |
|---|---|---|---|---|
| FidelityFX Super Resolution 1 spatial upscaler (EASU + RCAS), adapted to Three.js `ShaderMaterial`/`EffectComposer` conventions. | Advanced Micro Devices, Inc. | https://github.com/GPUOpen-Effects/FidelityFX-FSR | MIT | `src/engine/post.ts` (copyright and MIT notice retained inline) |

## Open-source UI assets

| Asset | Author | Source | License | Files |
|---|---|---|---|---|
| National and territory flags (selective 4x3 SVG imports; the build includes only roster nations rather than the complete catalog). | Panayiotis Lipiridis and flag-icons contributors | https://flagicons.lipis.dev/ / https://github.com/lipis/flag-icons | MIT | npm package `flag-icons`; mapping/render adapter in `src/ui/{flagCodes,flags}.js` |
| Three.js logo mark (official icon geometry, presented in the landing-page engine credit through a CSS color mask). | three.js authors | https://github.com/mrdoob/three.js/blob/072dcccba979a47a44a44769c051793ebe800d67/files/icon.svg | MIT | `public/brand/threejs-mark.svg` |

## Brand / logo set (public/brand/) — added 2026-07-31

The game logo is a hand-authored original flat-vector composition (stylized
modern MBT, side profile, original art — not based on any specific real
vehicle or third-party tank art) with the **Claude Code mascot** seated in the
commander's hatch wearing a tanker helmet. v5 (2026-08-31, owner-directed)
retains the approved v3 chamfer-top crest shield while cleaning the vehicle
into a balanced, fully contained modern-MBT silhouette: the hull is shifted
right, the bow and track loop are closed, and the vehicle uses restrained,
small-size-safe component detailing. The exposed hull side has recessed access
plates and fasteners; the turret uses an articulated cheek, roof facet, and
integrated raised bustle; and the gun is a coherent stepped assembly. The
tapered side skirt overlays the lower hull seam while remaining entirely below
the upper glacis and retaining visible road-wheel arcs. The antenna and raised,
finished flag mast terminate in visible deck mounts. It ships in
three treatments —
`logo-mark.svg` is the COLORED PRIMARY used by all game surfaces (dark steel
field #151f29, steel-blue two-tone tank, mascot #D97757, amber #f5b64b
pinstripe/pennant/dashes), `logo-mark-bw.svg` is the black-and-white sticker
treatment, and `logo-mark-metal.svg` is the embossed brushed-steel/gunmetal
badge (the only variant using gradients). `favicon.svg` is synchronized from
the metal crest; `logo-mark-simple.svg` remains the archived fat-shape
16–32 px simplification (amber band, helmet-dome commander).
The v1 steel-blue set is archived under `public/brand/v1/`, the v2 B/W
roundel set under `public/brand/v2-roundel/`.
Only the mascot glyph is a sourced asset; everything else in `public/brand/`
is first-party:

| Asset | Author | Source | License | Files |
|---|---|---|---|---|
| Claude Code mascot icon (pristine 24×24 path; `color.svg` and `default.svg` on the source CDN are byte-identical, fill `#D97757`). Used verbatim inside the brand marks via `translate(...) scale(...)` with the legs clipped below the hatch ring — the glyph geometry itself is unmodified; the helmet/goggles are drawn as separate first-party shapes layered on top. | Anthropic (Claude Code branding; icon page curated by theSVG) | https://thesvg.org/icon/claude-code (file: https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons/claude-code/color.svg) | Anthropic trademark/branding, © Anthropic. Not covered by either project license; no endorsement is implied and no reuse permission is granted. Any use must comply with Anthropic's then-current trademark and brand terms. | pristine source: `public/brand/claude-code-source.svg`; composed into the v5 crest masters `public/brand/logo-mark.svg`, `logo-mark-bw.svg`, and `logo-mark-metal.svg`; synchronized into `favicon.svg`, `logo-full.svg`, `logo-full-metal.svg`, and the `index.html` boot splash by `tools/sync-brand-marks.mjs`; raster exports are `favicon-32.png`, `favicon-192.png`, `apple-touch-icon.png`, `og-logo.png`, and `og-logo-transparent.png`; historical v1/v2/v3 sets remain archived. |
| Inter wordmark subsets inside `logo-full.svg` / `logo-full-metal.svg` (two static instances of the repo's Inter variable font — wght 800 and 700 at opsz 32 — subset to the 13 glyphs of "CLAUDE OF TANKS" with fontTools and embedded as ~1.5 KB woff2 data URIs so the lockup renders correctly standalone). | Rasmus Andersson (The Inter Project Authors) | derived from `public/fonts/inter/InterVariable.woff2` (see Inter row above) | SIL OFL 1.1 — modification/subsetting and embedding permitted; license at `public/fonts/inter/OFL.txt` | embedded in `public/brand/logo-full.svg`, `public/brand/logo-full-metal.svg` |
| Claude spark mark (verbatim 24×24 path) used as an in-game camouflage print motif — the `spark` pattern (camo r4, owner ask) stamps it across hull textures; the Claude Code mark above is likewise stamped by the `claude` pattern (camo r5: the creature IS that pattern's whole print). The Anthropic logogram briefly shipped as an `anthropic` pattern in camo r4 and was removed the same day (camo r5, owner ask). Geometry unmodified; only fill color/scale/rotation vary. | Anthropic (brand marks; paths as published by the simple-icons project) | https://github.com/simple-icons/simple-icons (`icons/claude.svg`) | Anthropic trademark/branding, © Anthropic. Same terms as the mascot row above: not covered by either project license; no reuse permission is granted, and any use must comply with Anthropic's then-current trademark and brand terms. | inline path constants `CLAUDE_SPARK_MARK` / `CLAUDE_CODE_MARK` in `src/vehicles/materials.ts` (hull painters + `src/ui/garage.ts` picker swatches) |

PNG exports are produced by `tools/brand-render.mjs` (export mode) and the og
composition script; regenerate any raster from its SVG master rather than
editing pixels.

## Vehicles (public/models/tanks/) — comparison/reference assets

All playable tank geometry is authored procedurally in this repository. The
files listed below are retained only as isolated comparison inputs and license
records; no `MODEL_SOURCE` runtime row points at them, and public builds strip
candidate/reference paths.

| Asset | Author | Source | License | Files |
|---|---|---|---|---|
| Abrams M1A2 SEPv3 | dannzjs | https://sketchfab.com/3d-models/abrams-m1a2-sepv3-eb6f5560198740269507e9948376414c (obtained without login via public GitHub mirror DhruvBhargava007/Morv_AI @ Dhruv) | CC-BY-4.0 — "This work is based on \"Abrams M1A2 SEPv3\" (https://sketchfab.com/3d-models/abrams-m1a2-sepv3-eb6f5560198740269507e9948376414c) by dannzjs (https://sketchfab.com/dannzjs) licensed under CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)" | `public/models/tanks/m1a2_sepv3_dannzjs.glb` (offline preprocess: textures downscaled 1K/512 + WebP, TurretPivot/GunPivot articulation grouping baked in; original license.txt + Sketchfab API license record + geometry notes preserved in `docs/licenses/m1a2_sepv3_dannzjs/`) |

> **Identity correction (2026-08-03):** the dannzjs asset above is a mislabeled **Leopard 2A5**, not an Abrams (owner-identified from parity renders). Authorship and CC-BY-4.0 license stand as recorded; the file remains on disk but no tank registers it — `m1a2` now measures against the recovered SEPv2 drop (local-only quarantine, not this table's concern).
| Leopard 2 A6 comparison print | buh | https://sketchfab.com/buh-late (user-supplied download, batch user-drops 2026-07-28; refreshed owner GLB 2026-08-11) | CC-BY 4.0 | `public/models/tanks/leo2a6_buh.glb` — critic/reference use only. The retired source-geometry module and bake script were deleted; the playable uses `buildLeo2A6` in `src/vehicles/profiles/leopard.ts`. |

Integration verdict (harness renders `tank_closeup_modern`, `garage`,
`player_view`, `combat_firing`, icons): the sourced model decisively beats the
procedural M1A2 — recognizable SEPv3 (CROWS, CITV, bustle rack, 7 road wheels,
side skirts), turret yaw / gun pitch / recoil / camo tint / killcam all work
through `modelLoader.js`'s re-parenting path.

The per-tank source-of-truth switch is `MODEL_SOURCE` in
`src/vehicles/specs.ts`. Battle playables must resolve to `procedural`; the
GLB ingestion path in `src/vehicles/modelLoader.js` exists for isolated review
and non-battle presentation tooling, not fleet geometry.

### Evaluation record — vehicle model scouting (2026-07-27)

Allowed sources searched: poly.pizza (site search API; terms: tiger, t-34,
sherman, abrams, panther, leopard 2, t-90, is-2, panzer, ww2/military/battle
tank, mbt), kenney.nl, opengameart.org (3D art search), GitHub repo/code
search. Candidates downloaded for judging were **rejected and deleted**:

- "Tank" by Zsky — https://poly.pizza/m/7GG1xDtc8l — CC-BY 3.0 — single fused
  mesh (`Super_Tank`), no articulable turret node; stylized flat-shaded low
  poly, not recognizable as any roster tank. Trial-rendered in
  `tank_closeup_modern`; lost to the procedural M1A2.
- "Tank" by KolosStudios — https://poly.pizza/m/egcLMSGiuA — CC-BY 3.0 —
  single fused mesh (`Cube.002`), generic modern MBT shape.
- "Tank" by SomeoneUnknown — https://poly.pizza/m/1jJ50vLGCk — CC-BY 3.0 —
  single fused mesh (`Cube`), untextured toy shape. Trial-rendered in
  `tank_closeup_ww2`; lost to the procedural Tiger I.

Other findings: kenney.nl has no realistic tank packs ("Tanks" is 2D
top-down). opengameart.org's only specific real-tank assets — "tank (panzer
tiger)" by Federx (CC-BY 3.0, placeholder-textured .blend), "t-34/85" by
Lotnik (CC0, .blend), "Abrams tank" by Sketlux (CC0, Freeciv-derived .blend) —
are .blend files, not loadable by GLTFLoader and with no Blender toolchain
available for a build-time convert. GitHub searches surfaced only
World-of-Tanks model rippers (forbidden: ripped game assets).

Verdict: **procedural wins for all 8 tanks** — no candidate was recognizable
as the specific vehicle, and none had a separable turret (automatic loss).

## Environment props (public/models/props/) — downloaded 2026-07-27

All sourced from [poly.pizza](https://poly.pizza); license verified on each
asset page at download time. The original source files were baked to
vertex-colored geometry in `src/world/props-models.json`, then packed without
loss into `src/world/props-models.bin.gz` for runtime use and retired from
tracked assets on 2026-08-26. The game fetches no external model file at
runtime, and public builds no longer copy those redundant source binaries.

CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/ ·
CC-BY 3.0: https://creativecommons.org/licenses/by/3.0/ (attribution below)

| Asset | Author | Source | License | File |
|---|---|---|---|---|
| Sandbags | J-Toastie | https://poly.pizza/m/xClPIEQJdX | CC-BY 3.0 | baked runtime geometry retained; source binary retired 2026-08-26 |
| Sack Trench | Quaternius | https://poly.pizza/m/LW3jwpPfiN | CC0 1.0 | baked runtime geometry retained; source binary retired 2026-08-26 |
| Sack Trench Small | Quaternius | https://poly.pizza/m/iHyRewQQcN | CC0 1.0 | baked runtime geometry retained; source binary retired 2026-08-26 |
| Tank | Poly by Google | https://poly.pizza/m/4t0RMXCl_Ud | CC-BY 3.0 | (provenance record — file removed at judging cleanup 2026-07-27) |
| Light Tank | Zsky | https://poly.pizza/m/S1jUTRmAjD | CC-BY 3.0 | (provenance record — file removed at judging cleanup 2026-07-27) |
| Tank | Quaternius | https://poly.pizza/m/Dc4k4CooN3 | CC0 1.0 | (provenance record — file removed at judging cleanup 2026-07-27) |
| Barrel | Quaternius | https://poly.pizza/m/MraIiFnpAY | CC0 1.0 | (provenance record — file removed at judging cleanup 2026-07-27) |
| Oil Drum | Zsky | https://poly.pizza/m/TLsXd9efLC | CC-BY 3.0 | (provenance record — file removed at judging cleanup 2026-07-27) |
| Hay | Quaternius | https://poly.pizza/m/Yu8TOERkpw | CC0 1.0 | (provenance record — file removed at judging cleanup 2026-07-27) |
| Haystack | Poly by Google | https://poly.pizza/m/6LeCqyw00RK | CC-BY 3.0 | (provenance record — file removed at judging cleanup 2026-07-27) |
| Fence | Quaternius | https://poly.pizza/m/U7g0Wxpt63 | CC0 1.0 | (provenance record — file removed at judging cleanup 2026-07-27) |
| Fence | Quaternius | https://poly.pizza/m/UXmKfG81fG | CC0 1.0 | (provenance record — file removed at judging cleanup 2026-07-27) |
| Telephone pole | Poly by Google | https://poly.pizza/m/7YIloiV4cAt | CC-BY 3.0 | baked runtime geometry retained; source binary retired 2026-08-26 |
| Barn | CreativeTrio | https://poly.pizza/m/A6UkPq33aZ | CC0 1.0 | (provenance record — file removed at judging cleanup 2026-07-27) |
| Big Barn | Quaternius | https://poly.pizza/m/q1N3xn2SpC | CC0 1.0 | (provenance record — file removed at judging cleanup 2026-07-27) |
| Church | CreativeTrio | https://poly.pizza/m/GHzPfvoyzX | CC0 1.0 | (provenance record — file removed at judging cleanup 2026-07-27) |
| Church | Poly by Google | https://poly.pizza/m/6vzTphxL9w4 | CC-BY 3.0 | (provenance record — file removed at judging cleanup 2026-07-27) |
| Bridge | Poly by Google | https://poly.pizza/m/9oToSb_rBKY | CC-BY 3.0 | (provenance record — file removed at judging cleanup 2026-07-27) |
| Rock Large | Quaternius | https://poly.pizza/m/54jZKTAt5p | CC0 1.0 | (provenance record — file removed at judging cleanup 2026-07-27) |
| Boulder | Poly by Google | https://poly.pizza/m/3jql0qtape- | CC-BY 3.0 | (provenance record — file removed at judging cleanup 2026-07-27) |
| Pine | Quaternius | https://poly.pizza/m/igSu0cPoBz | CC0 1.0 | (provenance record — file removed at judging cleanup 2026-07-27) |
| Pine Tree | Danni Bittman | https://poly.pizza/m/2Qo-fmVKuSG | CC-BY 3.0 | (provenance record — file removed at judging cleanup 2026-07-27) |
| Dead Tree | Quaternius | https://poly.pizza/m/Mcd2zYqyww | CC0 1.0 | (provenance record — file removed at judging cleanup 2026-07-27) |
| WW2 Ammo box | Carwyn Pelley | https://poly.pizza/m/4QQwW16WZZT | CC-BY 3.0 | (provenance record — file removed at judging cleanup 2026-07-27) |
| Debris Pile | Quaternius | https://poly.pizza/m/WrIiMMxyEP | CC0 1.0 | (provenance record — file removed at judging cleanup 2026-07-27) |
| Ruin | nha pham | https://poly.pizza/m/6eGK7_Kbswf | CC-BY 3.0 | (provenance record — file removed at judging cleanup 2026-07-27) |
| M939 Truck | J-Toastie | https://poly.pizza/m/y8lBpvMlim | CC-BY 3.0 | (provenance record — file removed at judging cleanup 2026-07-27) |

(Judging record appended below once the per-category screenshot verdicts are in.)

### Judging record — environment props (2026-07-27)

Method: side-by-side rendered screenshots (reference vs authored procedural) via the
screenshot harness plus custom close-up camera poses; per-category verdicts.

**KEPT (winners, files above remain in repo):**
- **Telephone pole** (Poly by Google, CC-BY 3.0) — crossarms, insulators and
  wire spans beat the plain procedural cylinder poles. Placed via
  InstancedMesh along road A (`SOURCED.poles` in src/world/props.ts).
- **Sandbag emplacements** — "Sack Trench" + "Sack Trench Small" (Quaternius,
  CC0) and "Sandbags" (J-Toastie, CC-BY 3.0). No procedural equivalent
  existed; tan bags sit naturally in the palette. InstancedMesh clusters along
  the main road and at the village plaza (`SOURCED.sandbags`).

**REJECTED after trial (procedural won; GLBs deleted from the repo, rows in
the table above record the original download for provenance):** big barn +
church (bright toy-farm palette clashed with the weathered plaster/stone
village), ruin (white fantasy colonnade, wrong material language), rocks
(red-brown palette fought the mossy-gray terrain), fence (garden-picket look
and brick-red tint), hay bale / haystack (procedural straw cones and cylinders
read better), barrels + WW2 ammo box (navy-blue / bright tints, clutter value
below procedural crates), tank wrecks + M939 truck + debris pile (intact
cartoon silhouettes never read as destroyed vehicles next to the detailed
procedural tanks), pine trees (snow-covered model, wrong biome; procedural
card trees with wind win outright), and the two broken files (Poly tank —
corrupt transforms; oil drum — off-center multi-part). Bridge segments were
sourced but never placed: the map has no water gap to justify one.

Pipeline note: winners are baked at build time to vertex-colored geometry
(`node tools/bake-props-models.mjs` → `src/world/props-models.json`,
then `node tools/pack-prop-models.mjs` → `src/world/props-models.bin.gz`). The
attributed JSON is the authoring source; the exact packed streams load only on
Battle intent and the JSON is a demand-loaded compatibility fallback.

### Evaluation record — Tiger I & Panther Ausf. G model hunt (2026-07-27, Blender pipeline available)

Candidate kept as **strong maybe** (not integrated; procedural remains source of truth):

| Asset | Author | Source | License | Files |
|---|---|---|---|---|
| tank (panzer tiger) | Federx | https://opengameart.org/content/tank-panzer-tiger | CC-BY 3.0 (stated on asset page; quoted in docs/licenses/panzer-tiger-federx-LICENSE-RECORD.txt) | candidate files DELETED at integrate cleanup 2026-07-27 (procedural Tiger stays; license record kept) |

- **Tiger I — verdict: procedural stays.** The Federx model is recognizably a
  Tiger and its running gear (interleaved road wheels, sculpted track links,
  drive sprockets, rear exhaust pair) clearly beats the procedural cylinders.
  But the hull front is a wedge-shaped prow (Tiger I is stepped/vertical), the
  upper hull carries zero greebles, and it has no usable textures — the
  distributed placeholder texture was a third-party magazine color-profile
  scan (Tiger "243", s.Pz.Abt. 503), NOT covered by Federx's CC-BY, so it was
  deleted and the kept GLB re-exported with materials stripped. Fails the
  "equal-or-better surface detail" gate vs `shots/tank_closeup_ww2.png`. Kept
  because the suspension geometry + clean 3-bone rig (bodyTank>turret>cannon
  skin joints) make it a viable donor/upgrade base if re-materialed.
- **Panther Ausf. G — verdict: procedural stays; no downloadable candidate
  exists on any account-free permissive source.** Searched: opengameart
  (panther/panzer/wehrmacht/ww2 — only the Federx Tiger exists; "Tanks and
  Trucks" by chabull is 2D PSD/PNG), poly.pizza (panther → animals only;
  panzer/tiger → same generic cartoon tanks rejected in the earlier sweep —
  MirVR `/m/5rqAPFRwLMh`, PabloLuna57 `/m/CAZeAFrhC7`, Nico `/m/41Tq_Kf0Tui`
  triaged by poster render: stylized toys, single-color, not Panthers),
  itch.io (only pack with German WW2 3D tanks, "Lowpoly Tank Pack 01", states
  no license and is $5/account-gated; no Panther anyway), GitHub repo+code
  search (no permissively-licensed Tiger/Panther meshes). Good Sketchfab
  CC-BY candidates exist but are account-gated — see report wishlist.

## Textures & HDRIs — downloaded 2026-07-27, integrated 2026-07-27

All CC0; license verified on each asset page at download time. Winners ship
from `public/textures/terrain/` (splat layers, wired via
`src/world/sourcedTextures.ts` + `src/world/terrain.ts`) and
`public/textures/buildings/` (village materials via `src/world/props.ts`).
The procedural painters remain the synchronous fallback behind the
`USE_SOURCED_*` flags in `src/world/sourcedTextures.ts`. Only the 1K
Color/NormalGL/Roughness/AmbientOcclusion maps are kept; preview PNGs and the
losing candidates were deleted.

- ambientCG asset pages each state: "Creative Commons CC0 license, making
  them free to use without attribution - even in commercial circumstances."
  (quoted from https://ambientcg.com/view?id=<AssetID> for every asset below)
- Poly Haven license page (https://polyhaven.com/license) states all assets
  are CC0 — "CC0 means absolute freedom."

| Asset | Author | Source | License | Files |
|---|---|---|---|---|
| Grass 004 (1K JPG PBR set) | ambientCG (Lennart Demes) | https://ambientcg.com/view?id=Grass004 | CC0 1.0 | public/textures/terrain/Grass004_1K-JPG_*.jpg |
| Withered Grass (1K JPG maps) | Charlotte Baglioni / Poly Haven | https://polyhaven.com/a/withered_grass | CC0 1.0 | public/textures/terrain/withered_grass_*_1k.jpg |
| Ground 071 (1K JPG PBR set) | ambientCG | https://ambientcg.com/view?id=Ground071 | CC0 1.0 | public/textures/terrain/Ground071_1K-JPG_*.jpg |
| Ground 093C (1K JPG PBR set) | ambientCG | https://ambientcg.com/view?id=Ground093C | CC0 1.0 | public/textures/terrain/Ground093C_1K-JPG_*.jpg |
| Snow 010A (1K JPG PBR set) | ambientCG | https://ambientcg.com/view?id=Snow010A | CC0 1.0 | public/textures/terrain/Snow010A_1K-JPG_*.jpg |
| Paving Stones 046 (1K JPG PBR set) | ambientCG | https://ambientcg.com/view?id=PavingStones046 | CC0 1.0 | public/textures/terrain/PavingStones046_1K-JPG_*.jpg |
| Rock 058 (1K JPG PBR set) | ambientCG | https://ambientcg.com/view?id=Rock058 | CC0 1.0 | public/textures/terrain/Rock058_1K-JPG_*.jpg |
| Rock 063 (1K JPG PBR set) | ambientCG | https://ambientcg.com/view?id=Rock063 | CC0 1.0 | public/textures/terrain/Rock063_1K-JPG_*.jpg |
| Bricks 097 (1K JPG PBR set) | ambientCG | https://ambientcg.com/view?id=Bricks097 | CC0 1.0 | public/textures/buildings/Bricks097_1K-JPG_*.jpg |
| Plaster 007 (1K JPG PBR set) | ambientCG | https://ambientcg.com/view?id=Plaster007 | CC0 1.0 | public/textures/buildings/Plaster007_1K-JPG_*.jpg |
| Roofing Tiles 012A (1K JPG PBR set) | ambientCG | https://ambientcg.com/view?id=RoofingTiles012A | CC0 1.0 | public/textures/buildings/RoofingTiles012A_1K-JPG_*.jpg |
| Planks 023A (1K JPG PBR set) | ambientCG | https://ambientcg.com/view?id=Planks023A | CC0 1.0 | public/textures/buildings/Planks023A_1K-JPG_*.jpg |
| Kloofendal 43D Clear (Pure Sky) 2K HDR | Greg Zaal / Poly Haven | https://polyhaven.com/a/kloofendal_43d_clear_puresky | CC0 1.0 | REJECTED after in-engine A/B — deleted |
| Kloofendal Overcast (Pure Sky) 2K HDR | Greg Zaal / Poly Haven | https://polyhaven.com/a/kloofendal_overcast_puresky | CC0 1.0 | REJECTED (untested runner-up) — deleted |
| Snow Field (Pure Sky) 2K HDR | Jarod Guest, Sergej Majboroda / Poly Haven | https://polyhaven.com/a/snow_field_puresky | CC0 1.0 | REJECTED (untested runner-up) — deleted |

### Judging record — texture/HDRI scouting (2026-07-27)

Judged by reading each albedo/normal at full res next to the current
procedural reference shots (shots/battlefield.png, player_view.png,
battlefield_winter.png, battlefield_urban.png). Downloaded-then-rejected
(deleted from repo): Ground 092C (dirt-mud — blurry beige albedo, lost to
Ground 071's stick-strewn brown dirt), Ground 080 (sand — trampled-beach
lumps, wrong for dunes), Plaster 002 (too clean, barely beats procedural
flat color), Roofing Tiles 013A (anthracite black, clashes with the game's
red-clay roofs), Wood Siding 009 (pale painted siding, wrong for brown
barns). Unavailable without payment (ambientCG supporter early-access, CC0
once public): Ground 102, Ground 095C.

### Integration verdict — textures & HDRIs (2026-07-27, in-engine A/B)

Judged with before/after harness renders (`battlefield`, `player_view`,
`battlefield_winter`, `battlefield_urban`, `battlefield_desert`).

- **Terrain splat layers — SOURCED KEPT** on all 4 maps (per-map layer plan in
  `src/world/sourcedTextures.ts`: verdant grass/dirt/rock, desert
  withered-grass/sand/rock63, winter snow/dirt/rock, urban
  grass/dirt/paving-stones; the mud/marsh layer stays procedural everywhere —
  its puddle/ice gloss response drives `uMarshGloss`). Near-field turf, dirt
  roads and dune grain clearly beat the painted canvases; AO is baked into
  albedo RGB and roughness packed into albedo alpha per the splat contract.
- **Building materials — SOURCED KEPT**: Plaster 007 (plaster walls), Roofing
  Tiles 012A (roofs), Planks 023A (wood barns) on all maps, Bricks 097
  replacing the fieldstone bucket on urban only. Fieldstone stays procedural
  elsewhere (the coursing painter reads better on the low village walls).
- **HDRI environment — REJECTED, procedural PMREM bake stays.** Kloofendal
  43D Clear tested live as `scene.environment` (flag machinery kept in
  `src/engine/sky.ts`): its baked-in sun cannot track the per-map sun
  azimuth/elevation that drives the CSM shadows — wrong-azimuth specular
  sheen on verdant, warm tint fighting the winter overcast preset. All three
  .hdr files deleted; the download records above stand for provenance.

### Evaluation record — WW2 roster re-scout with Blender pipeline (2026-07-27, second pass)

Targets: M4A3E8 Sherman, T-34-85, IS-2. With the Blender 5.2 headless
converter now available (`tools/blend2glb.sh`), the previously unloadable
.blend leads were converted and judged standalone (neutral 3-point-light
GLB viewer + puppeteer, same 3/4 orbit as `shots/tank_closeup_*.png`,
procedural tanks rendered in the identical harness for A/B). Candidates
judged and **rejected/deleted**:

- "T-34/85" (Rudy) by Lotnik — https://opengameart.org/content/t-3485 —
  CC0 (license line on asset page: "CC0") — converted OK (41 separable
  meshes, turret re-parentable). Upper hull/turret silhouette is genuinely
  good (hexagonal turret, cupola, ball MG), BUT the running gear is
  unmodeled — hollow track loops with a single road wheel + idler per
  side — and the export has zero materials/textures. From the dominant
  in-game side/3-4 view it loses decisively to the procedural T-34-85
  (full road wheels, textured tracks, camo, decals).
- "Tank1" by hubahuba — https://opengameart.org/content/tank1 — CC0 —
  fictional cartoon APC-like vehicle with stub mortar; not any roster
  tank. Instant loss.

Exhaustive source sweep (no viable free-direct-download candidates found):
opengameart.org keyword sweep via search scrape (tank p1+p2, sherman, m4,
t-34, t34, is-2, kv, soviet, panzer, ww2, world war) — only other
real-tank hits are CC-BY-SA/GPL ("American Tank"/"Enhanced" — license
excluded); poly.pizza (sherman: none; tank: all stylized toys, already
judged first pass); itch.io (realistic WW2 packs are paid and/or have no
stated license — forbidden; free ones are 2D/voxel); GitHub code+repo
search (only irrelevant hits / WoT rippers); BlendSwap (403 to
anonymous scraping, downloads account-gated); Kenney (no realistic
tanks). Sketchfab was NOT downloaded from (account-gated by policy);
strong CC-BY candidates recorded in the scouting report for the user.

Verdict: **procedural stays the winner for M4A3E8 Sherman, T-34-85 and
IS-2**. No files kept in `public/models/candidates/` from this pass.

### Evaluation record — modern MBT scouting pass (2026-07-27, M1A2/T-90M/Leopard 2A7)

**KEPT (winner candidate, pending integration):**

| Asset | Author | Source | License | Files |
|---|---|---|---|---|
| Abrams M1A2 SEPv3 (256.8k tris, full PBR texture set) | dannzjs | https://sketchfab.com/3d-models/abrams-m1a2-sepv3-eb6f5560198740269507e9948376414c (license re-verified live on the asset page + Sketchfab API on 2026-07-27; files obtained WITHOUT login from the public GitHub mirror DhruvBhargava007/Morv_AI @ Dhruv, which preserves the Sketchfab download bundle incl. its license.txt) | CC-BY-4.0 — attribution line required, recorded in `docs/licenses/m1a2_sepv3_dannzjs/NOTES.md` | INTEGRATED → `public/models/tanks/m1a2_sepv3_dannzjs.glb` (raw 175 MB candidate bundle deleted after the offline preprocess; license records in `docs/licenses/m1a2_sepv3_dannzjs/`) |

Judged in the standalone GLB harness against `shots/tank_closeup_modern.png`:
recognizable M1A2 SEPv3 (CROWS RWS, CITV, 7 road wheels, woodland camo),
surface detail far above procedural; turret+gun proven articulable by
mesh-name re-parenting (40° yaw proof render kept with the candidate).
Caveat for the integrate step: ~160 MB of textures must be downscaled and
the 256k-tri mesh ideally decimated.

Candidates judged and **rejected/deleted** this pass:

- "Abrams tank" by Sketlux — https://opengameart.org/content/abrams-tank —
  CC0 — Blender 2.79 file converted fine via tools/blend2glb.sh (plus
  removal of a rogue 2x2x3.6 m `Cube.003`), but all Blender-Internal
  materials export white, the barrel is comically fat, hierarchy is flat
  with unnamed parts. Loses clearly to the procedural M1A2.
- "Leopard 2A4 OTCO" by Jeyhun1985 (Sketchfab, CC-BY label, mirrored in
  ryanbourdais/Bour-Engine) — REJECTED ON PROVENANCE: model description
  says "Leopard 2A4 OTCO from War Thunder"; identical face count to a
  known WT-extraction upload. Ripped game asset — forbidden. Deleted.
- "Uralvagonzavod T-90AM" by nazidefenseforceofficial (Sketchfab, CC-BY
  label, mirrored in pratiksharan/AstraSense) — REJECTED ON PROVENANCE:
  hash-named `*_dds` game-engine textures, internal node
  "T-90M_Main_Battle_Tank.obj"; the same author's other MBTs carry
  ripper-tool texture names (`Tex_0673_0.dds`) and several pages are now
  deleted. Treated as game rips — forbidden. Deleted. (T-90MS by
  Cloostyyyk: Sketchfab page deleted, license unverifiable — skipped.)
- rtcoder/tanks-game GLTFs (21 named tanks incl. m1-abrams, leopard-2a6)
  — repo has NO license ("project-owned generated geometry" per its
  SOURCE.txt) — forbidden without a visible license; also procedural.

Source sweep for T-90M / Leopard 2A7 (exhaustive, no clean downloadable
hit): opengameart (t-90/t90/leopard/m1a2/m1a1/mbt/abrams/battle tank —
only the Sketlux Abrams and generic packs), poly.pizza API search (t-90,
leopard tank, main battle tank, military/modern tank — only stylized
generics already judged), itch.io free tag-tank (stylized/WWII only),
GitHub code search (all real hits were the rips above or unlicensed),
Kenney (none). Sketchfab downloads are account-gated by policy — best
CC-BY candidates recorded in the scouting report wishlist instead.

Verdict: **sourced wins for M1A2 Abrams (pending integration); procedural
stays the winner for T-90M and Leopard 2A7.**

## Community vehicles (public/models/tanks/community/) — 17 playable sourced tanks

Community-crawl winners (2026-07-27), integrated as PLAYABLE vehicles: garage
carousel and stats card (each carries the author credit line — CC-BY
attribution requirement), AI-drivable, random enemy rosters may include
them. Every license was verified ON the asset page at download time; the
quoted license line for each asset is preserved in
`docs/licenses/community/<slug>.LICENSE-RECORD.txt`.

| In-game vehicle (spec id) | Asset | Author | Source | License | File |
|---|---|---|---|---|---|
| Stridsvagn 103 (`strv103`) | Stridsvagn 103 | Lukasz Wesiora (canisferus) | https://opengameart.org/content/stridsvagn-103 | CC-BY 3.0 (bundled License.txt: "CC-By 3.0 license... Copyrights Lukasz Wesiora.") | `public/models/tanks/community/strv103_wesiora.glb` (materials rebuilt as Principled BSDF from the 2012 pre-nodes .blend; textures 4096→2048 JPEG; integrated as fixed-gun casemate TD) |
| IS-3 (`is3`) | IS-3 (Object 703, moving parts) | Nick Tallon (PanzerFactory) | https://www.thingiverse.com/thing:4137773 (via archive.org mirror thingiverse-4137773) | CC-BY 4.0 | `public/models/tanks/community/is3_panzerfactory.glb` (print STLs reassembled: turret peg seated in hull ring, gun in mantlet socket; hull/turret/gun articulation nodes) |
| T-34-85 (Wei He) (`t34_85_cad`) | T-34-85 detailed CAD | Wei He (Xdhsqj) | https://www.thingiverse.com/thing:4326802 (via archive.org mirror thingiverse-4326802) | CC-BY 4.0 | `public/models/tanks/community/t34_85_weihe.glb` (SolidWorks 1:1 export decimated 3.49M→~220k tris; turret+gun separated at the ring plane, yaw pivot at ring center) |
| Tiger I (Newc42) (`newc_tiger`) | Panzer VI Tiger I, Low Poly German WWII Tanks | Newc42 | https://newc-42.itch.io/german-low-poly-wwii-tanks | CC0-1.0 (itch.io "Asset license: Creative Commons Zero v1.0 Universal") | `public/models/tanks/community/tiger_newc42.glb` |
| Panzer III Ausf. J (`newc_pziii`) | Low Poly German WWII Tanks | Newc42 | https://newc-42.itch.io/german-low-poly-wwii-tanks | CC0-1.0 | `public/models/tanks/community/pziii_newc42.glb` |
| Leichttraktor (`leichttraktor`) | Low Poly German WWII Tanks | Newc42 | https://newc-42.itch.io/german-low-poly-wwii-tanks | CC0-1.0 | `public/models/tanks/community/leichttraktor_newc42.glb` |
| Panzerkampfwagen III (`pziii_konserwa`) | Panzerkampfwagen III | konserwa | https://opengameart.org/content/panzerkampfwagen-iii | CC0 (stated on asset page) | `public/models/tanks/community/pziii_konserwa.glb` (untextured; painted at load onto the shared camo canvas — modelLoader `paintUntextured`) |
| Recon Tank (`recon_tank`) | Recon Tank (Update) | Mophs — derivative of "Recon Tank" by MNDV.ecb / Eric Buisson (both credited) | https://opengameart.org/content/recon-tank-update | CC-BY 4.0 | `public/models/tanks/community/recon_tank_mophs.glb` (full PBR set embedded; bone-rigged Turret/Barrel articulation) |
| Heavy Tank (Quaternius) (`q_heavy`) | Tank (heavy, tan) | Quaternius | https://poly.pizza/m/FA5daiyZQq | CC0 1.0 | `public/models/tanks/community/tank_quaternius_fa5.glb` |

Integration path: `MODEL_SOURCE` community entries in `src/vehicles/specs.ts`
(parametric class-template armor/stats), generalized GLB ingestion in
`src/vehicles/modelLoader.js` (fixed-gun casemates, sibling gun nodes,
bone-rigged turrets, auto-derived yaw/pitch pivots, untextured-asset camo
painting). Icons under `public/icons/<spec id>_*.png` are DERIVATIVE RENDERS
of the models above (the CC-BY rows' attribution covers them).

Losing crawl candidates (all other `public/models/community-candidates/`
downloads) were deleted after judging; the two duplicate Stridsvagn 103
downloads were consolidated into the wesiora re-export above.

### Community wave 2 (print-model crawl, integrated 2026-07-28) — 8 more playables

Second sourcing wave (Sketchfab-mirror + Thingiverse/Printables print models,
panel-judged on re-materialed renders). Same integration rules: garage
carousel + stats credit cards, AI rosters may draw them,
license lines verified on the asset/mirror page at download time and preserved
in `docs/licenses/community/<slug>.LICENSE-RECORD.txt` (Sketchfab assets also
keep the original `license.txt` / API license snapshot alongside). Fused
single-mesh print models ship as fixed-gun TD-class vehicles.

| In-game vehicle (spec id) | Asset | Author | Source | License | File |
|---|---|---|---|---|---|
| KV-2 (`kv2`) | KV-2 heavy tank 1940 | Comrade1280 (https://sketchfab.com/comrade1280) | https://sketchfab.com/3d-models/kv-2-heavy-tank-1940-ba8b84d78c0a42038cf2eaa4210ef296 (via GitHub mirror Tsukimi125/Kaiser-Ray-Tracer, full bundle with original license.txt) | CC-BY 4.0 | `public/models/tanks/community/kv2-full-comrade1280.glb` (583k→150k tris, textures capped 2K/1K; named hull/turret/tracks/wheels nodes — turret yaw articulates) |
| Tiger II (`tiger2`) | Tank Tiger 2 | maximus0075550 (https://sketchfab.com/maximus0075550) | Sketchfab via Objaverse (AllenAI) mirror | CC-BY 4.0 | `public/models/tanks/community/tiger2-maximus.glb` (461k→150k tris; turret+gun mesh isolated for yaw articulation, explicit ring pivot) |
| M4A3E2 Sherman Jumbo (`sherman_jumbo`) | Sherman Jumbo Tank | Original: manifold_destiny (thingiverse thing:1065360, CC-BY 4.0 verified); print split by ZEUS_0815 | https://www.printables.com/model/3992-sherman-jumbo-tank (original: https://www.thingiverse.com/thing:1065360) | CC-BY 4.0 (chain verified) | `public/models/tanks/community/sherman-jumbo.glb` (print plates re-assembled: turret seated on ring, tracks split L/R; hull/turret/tracks_l/tracks_r nodes) |
| Jagdtiger (`jagdtiger`) | Jagdtiger 8.8 cm | Adi Priatna (https://sketchfab.com/adipriatna) | Sketchfab via Objaverse (AllenAI) mirror | CC-BY 4.0 | `public/models/tanks/community/jagdtiger-adipriatna.glb` (533k→150k tris; fixed-gun casemate TD) |
| Jagdpanzer E100 (`jpz_e100`) | Jagdpanzer E100 | Haphazard0587 | https://www.thingiverse.com/thing:2624802 | CC-BY 4.0 | `public/models/tanks/community/jagdpanzer_e100_haphazard.glb` (print STL fused; fixed-gun casemate TD, camo-painted at load) |
| Sturmtiger (`sturmtiger`) | Sturmtiger | Tomrs (https://sketchfab.com/Tomrs) | Sketchfab via Objaverse (AllenAI) mirror | CC-BY 4.0 | `public/models/tanks/community/sturmtiger-tomrs.glb` (9k tris, baked dunkelgelb 3-tone + zimmerit; fixed-gun assault TD) |
| T95 Doomturtle (`t95`) | T95/T28 super-heavy TD | Haphazard0587 | https://www.thingiverse.com/thing:2326342 | CC-BY 4.0 | `public/models/tanks/community/t95_doomturtle_haphazard.glb` (print STL fused, quad-track casemate; camo-painted at load) |
| T30 (`t30`) | T30 US heavy (155mm) | Haphazard0587 | https://www.thingiverse.com/thing:2363711 | CC-BY 4.0 | `public/models/tanks/community/t30_haphazard.glb` (print STL fused — turret welded, ships as fixed-gun assault TD; camo-painted at load) |

Wave-2 losing candidates (all other wave-2
`public/models/community-candidates/` downloads) were deleted after judging.
Notable near-miss: a CC-BY T28 by AtomicArdvark (thingiverse thing:3223947)
ships as an unassembled print plate and was dropped in favor of the T95.

### Community wave 3 (IS-series hunt, integrated 2026-07-28) — 4 more playables

Targeted Soviet heavy-line hunt (Thingiverse via archive.org mirrors +
Printables public API). Same integration rules as wave 2; print STLs were
re-assembled/normalized offline in Blender (turrets auto-seated on rings,
Hull/Turret articulation nodes preserved, re-materialed — the sources are
untextured print models — and camo-painted at load). Full provenance and
license verification per model in
`docs/licenses/community/<slug>.LICENSE-RECORD.txt`.

| In-game vehicle (spec id) | Asset | Author | Source | License | File |
|---|---|---|---|---|---|
| IS-7 (`is7`) | 1-100 IS-7 tank | Jt Steele (SnowLeopard101) (https://www.thingiverse.com/snowleopard101) | https://www.thingiverse.com/thing:4597176 | CC-BY 4.0 | `public/models/tanks/community/is7-snowleopard.glb` (hull + turret STLs assembled; turret yaw articulates, explicit ring pivot) |
| Object 279 (`object279`) | 1-100 Object 279 (early) tank | Jt Steele (SnowLeopard101) | https://www.thingiverse.com/thing:4598065 | CC-BY 4.0 | `public/models/tanks/community/object279-snowleopard.glb` (quad-track pods slotted under hull; turret yaw articulates) |
| IS-6B (`is6b`) | IS-6 B tank | Jt Steele (SnowLeopard101) | https://www.thingiverse.com/thing:4849489 | CC-BY 4.0 | `public/models/tanks/community/is6b-snowleopard.glb` (hull + turret STLs assembled; turret yaw articulates) |
| IS-1 (`is1`) | IS-1 Russian heavy tank | AaronTMG (https://www.printables.com/@AaronTMG) | https://www.printables.com/model/925804-is-1-russian-heavy-tank | CC-BY 4.0 | `public/models/tanks/community/is1-aarontmg.glb` (single fused print mesh — ships as fixed-gun assault TD; camo-painted at load) |

Wave-3 losing candidates (`is2-aarontmg`, `is6-wotturret-lawrenceft`) were
deleted after judging along with the rest of
`public/models/community-candidates/`.

## Variant vehicles (public/models/tanks/community/variants/) — CC-BY 4.0 derivatives

Historical modified versions of on-disk CC-BY 4.0 base models ("variant"
sourcing route, docs/research/modern-roster.md Part 0). Each file is an offline
Blender re-export of the base with the modifications listed below — recorded
here per CC-BY 4.0 §3(a)(1)(B). The files are comparison candidates only;
playable combat data is registered by `src/vehicles/combatVariantSpecs.ts` and
all three live visuals are first-party procedural builds.

| In-game vehicle (spec id) | Base asset | Author | Source | License | File + modifications |
|---|---|---|---|---|---|
| M1A1 Abrams (`m1a1`) | Abrams M1A2 SEPv3 | dannzjs | https://sketchfab.com/3d-models/abrams-m1a2-sepv3-eb6f5560198740269507e9948376414c | CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/) — original license records in `docs/licenses/m1a2_sepv3_dannzjs/` | `public/models/tanks/community/variants/m1a1_dannzjs_variant.glb` — MODIFIED: SEP kit stripped (both RWS bodies incl. CROWS, mast/fin, bustle-rack extension carved; no CITV), manual cupola ring + pintle M2 .50 added; the shipped m1a2's runtime fidelity fixes baked in (stovepipe/headlight-tower carves, DU cheek plates, roofline caps, GPS doghouse, deck grille panels, bore evacuator + MRS collar, fender lights, whip antennas shortened). Attribution line: "This work is based on \"Abrams M1A2 SEPv3\" by dannzjs, licensed under CC-BY-4.0 — modified (SEP kit removed, M1A1 kit added)." |
| M1A2 Abrams TUSK (`m1a2_tusk`) | Abrams M1A2 SEPv3 | dannzjs | (same as above) | CC-BY 4.0 | `public/models/tanks/community/variants/m1a2_tusk_dannzjs_variant.glb` — MODIFIED: TUSK kit added (2 stacked ARAT-1 ERA tile rows on both skirts + ARAT-2 wedges forward, loader's three-sided shield with smoked-glass top, CITV pedestal, Tank Infantry Phone box, rear slat cage, belly appliqué plate) over the same baked fidelity fixes; CROWS retained. Attribution line: "…by dannzjs, licensed under CC-BY-4.0 — modified (TUSK kit added)." |
| T-90A (`t90a`) | T-90 | alexxx_xarchenko | https://sketchfab.com/3d-models/t-90-9bb8af8876a6478aa92089eff058d4db (license verified via Sketchfab API record 2026-07-28: "CC Attribution", creativecommons.org/licenses/by/4.0) | CC-BY 4.0 | `public/models/tanks/community/variants/t90a_xarchenko_variant.glb` — MODIFIED: decimated 304k→148k tris, scale/ground normalized (9.53 m overall, front −Y→glTF +Z), merged by-material meshes split into hull / running-gear / turret / gun with authored TurretPivot→GunPivot articulation nodes, whip antennas compressed, untextured clay re-materialed (mid-green paint + dark gear; camo-canvas painted at runtime via `paintUntextured`). Attribution line: "This work is based on \"T-90\" by alexxx_xarchenko, licensed under CC-BY-4.0 — modified (decimated, re-materialed, turret/gun articulation split)." |

Derivative renders (icons `public/icons/m1a1_*`, `t90a_*`, `m1a2_tusk_*`,
generated 2026-07-28 by tools/genIcons.mjs) are covered by the rows above.
All three ids remain registered playables, but none loads these files or
exposes source-credit metadata as part of its runtime spec. Attribution and
the required modification indication live in this document; authoring tools
may use the files for isolated visual comparison.

### Evaluation record — Type 74 variant (2026-07-28): built, NOT shipped

The roster plans Type 74 (#24) as a variant of `stb1_haphazard` ("STB-1" by
Haphazard0587, https://www.thingiverse.com/thing:2626560, CC-BY label). The
variant WAS built (IR searchlight + .50 cal kit, turret/gun split) but is
withheld from the repo on provenance: the thing's own description presents it
as the tank "from the game World of Tanks" — the same wording that failed the
Maus recovery (thing:2329090, rejected 2026-07-28 as a WoT game rip;
CC-BY label treated as invalid). This conflicts with the earlier wave-2
clearance of the same author's T30/T95/Jagdpanzer E 100 deposits ("original
print-oriented CAD, no game-rip topology" — see
`docs/licenses/community/t30_haphazard.LICENSE-RECORD.txt`). Until the
round verifier reconciles the Haphazard0587 provenance question, no
Haphazard0587 model is used as a variant base. No STB-1-derived file ships in
`public/`; the build script + artifacts remain in the session scratchpad only.
UPDATE 2026-07-28: the Japan roster is now filled by a DIFFERENT model — the
NullOps Type 74 user drop (quarantine, see "User drops" section
and the quarantine table) — the STB-1 rejection above stands unchanged.

## User drops (integrated 2026-07-28) — 3 winners from user-supplied Sketchfab downloads

Source archives were hand-delivered by the user (batch `user-drops`,
normalized GLBs + judging renders retained under
`public/models/community-candidates/user-drops/<slug>/`). Textures
recompressed to WebP at <=2k for the shipped copies.

| Vehicle (spec id) | Author | Source | License | Shipped file | Role |
|---|---|---|---|---|---|
| Leopard 2 A6 (`leo2a6`) | buh | https://sketchfab.com/buh-late (user-supplied download) | CC-BY 4.0 | `public/models/tanks/leo2a6_buh.glb` | Retained local comparison print only. The playable is our native procedural Leopard builder; no source mesh or generated source geometry is used at runtime. |
| Type 74 (`type74`) | NullOps | https://sketchfab.com/nullops (user-supplied download) | Sketchfab Standard — QUARANTINE (below) | `public/models/tanks/community/quarantine/type74-nullops.glb` | NEW Japan tier-VIII playable (the STB-1 print base stays rejected — see the evaluation record above). Skinned rig: Tower_9 yaw / Gun_7 pitch bones. |
| C1 Ariete (`ariete`) | DustyMojito | https://sketchfab.com/DustyMojito (user-supplied download) | Sketchfab Standard — QUARANTINE (below) | `public/models/tanks/community/ariete-dustymojito.glb` (retained local oracle only) | RETIRED model swap. Since 2026-08-11 the playable is an original procedural rebuild; the quarantined GLB is never registered or shipped as the vehicle. |

Other `user-drops` candidates (`m1a2-abrams`, `bergman-pack`) were not part
of this integration round — the m1a2-abrams CC-BY-NC-ND candidate is tabled
in the quarantine section below; the rest stay in `community-candidates/`
pending their own integration decisions.

REMOVED (critique round 3, content_breadth audit): the `abrams-x` candidate
directory (`abrams-x.glb` + `RENDER.png`) was deleted from the repo. It was
the one committed public/ asset with no ATTRIBUTION row and no
LICENSE-RECORD.txt: the re-exported GLB embeds no provenance (Blender I/O
generator only), no source archive remains, and the decimated mesh cannot be
face-count-matched to a Sketchfab source honestly. It was referenced nowhere
in src/, tools/ or index.html (pure shelf-ware). It can return if the user
re-supplies the original download with provenance verified at download time.

### User drops wave 2 (batch `user-drops-recovered`, evaluated 2026-07-28) — comparison references

Source archives are the user's own downloads recovered after a permissions
issue (`public/models/community-candidates/user-drops-recovered/`). Provenance
and license records live in `docs/licenses/user-drops-recovered/`. These files
are authoring comparisons only. None is registered by the playable runtime;
the live fleet uses repository-authored procedural geometry.

| Vehicle (spec id) | Author | Source | License | Shipped file | Role |
|---|---|---|---|---|---|
| T-90M (`t90m`) | minehffd | https://sketchfab.com/3d-models/t-90m-2e31a3cf16b04f0180b9387df5198c9a (user-supplied download) | CC-BY 4.0 (stamped in asset.copyright + scene extras) | `public/models/tanks/t90m_minehffd.glb` | Local silhouette and articulation comparison for the native T-90M family; never loaded as playable geometry. |
| Char Leclerc (`leclerc`) | andertan | https://sketchfab.com/3d-models/char-leclerc-84a0918d2f534c2eb003ab3cb3029c03 (user-supplied download) | CC-BY 4.0 | `public/models/tanks/char_leclerc_andertan.glb` | Local silhouette and articulation comparison for the native Leclerc family; never loaded as playable geometry. |
| Leopard 2A4 (`leo2a4`) | m_bergman | https://www.thingiverse.com/thing:4718232 (user-supplied download) | CC-BY-NC-SA — QUARANTINE (below) | `public/models/tanks/community/quarantine/leo2a4_bergman.glb` | Local-only comparison for the native Leopard 2A4; never registered or shipped in the public artifact. |
| BMP-2 (`bmp2`) | m_bergman | same pack | CC-BY-NC-SA — QUARANTINE (below) | `public/models/tanks/community/quarantine/bmp2_bergman.glb` | Local-only comparison for the native BMP-2; never registered or shipped in the public artifact. |
| BMP-1 (`bmp1`) | m_bergman | same pack | CC-BY-NC-SA — QUARANTINE (below) | `public/models/tanks/community/quarantine/bmp1_bergman.glb` | Rejected runtime candidate; no playable spec is registered. |
| M1128 Stryker MGS (`m1128`) | m_bergman | same pack | CC-BY-NC-SA — QUARANTINE (below) | `public/models/tanks/community/quarantine/m1128_mgs_bergman.glb` | Rejected runtime candidate; no playable spec is registered. |
| M1296 Stryker Dragoon (`m1296`) | m_bergman | same pack | CC-BY-NC-SA — QUARANTINE (below) | `public/models/tanks/community/quarantine/m1296_dragoon_bergman.glb` | Rejected runtime candidate; no playable spec is registered. |

Losing wave-2 candidates (m_bergman leo2a5/leo2a6/m1a1_aim — redundant with
better shipped models — and brdm2/btr70/cougar_6x6/lav25, judged below the
playable bar) were deleted with the source archives after extraction.

### User drops wave 4 (batch `user-drops-recovered` final sweep, integrated 2026-07-28)

Same batch and rules as wave 2 above (user's own recovered downloads;
provenance + license records in `docs/licenses/user-drops-recovered/`).
The retained assets are CC-BY 4.0, license-verified against the Sketchfab API — no
new quarantine entries.

| Vehicle (spec id) | Author | Source | License | Shipped file | Role |
|---|---|---|---|---|---|
| Tank T-80U (`t80u`) | javanilga | https://sketchfab.com/3d-models/tank-t-80u-ebf4b55eeabb421cbf2758a2ec948439 (user-supplied download) | CC-BY 4.0 (also stamped in the GLB's asset.extras) | `public/models/tanks/t80u_javanilga.glb` | REPLACES the procedural T-80U model (modern2.ts gameplay stats unchanged). Authored turret + gun nodes; 10 roof-accessory root siblings reparented into the turret offline, whip antenna removed (height-clamp rule). 28,141 tris, 1024/512 PNG textures. |
| KF51 Panther - Woodland (`kf51`) | GRIP420 (model + textures by David Falke) | https://sketchfab.com/3d-models/kf51-panther-woodland-4764a740867c4ea697df8011e7d5bf63 (user-supplied download) | CC-BY 4.0 | `public/models/tanks/kf51_grip420.glb` | Local comparison oracle for the native KF51 family registered by `kf51Specs.ts`; never loaded as playable geometry. Fully articulated authored turret > gun > MG chain, 63,016 tris. |

The remaining batch contents (t-90m / char-leclerc / bergman-p1 shipped-source
folders from wave 2, this wave's three source archives, and the stray original
`tank_t-80u.glb`) were deleted from the gitignored drop area after integration.

### AFV oracle drop (2026-08-04) — M2 Bradley, CC-BY 4.0

Owner-downloaded for the AFV program (owner directive: "show the bradley
bmp and more of the afv types some love"). Used as the `m2a2_bradley`
geometry-gate ORACLE (local measurement reference via
LOCAL_REFERENCE_OVERRIDES); NOT registered as a shipped visual. CC-BY 4.0
permits shipping later with the credit line if the owner chooses.
License/author/source are embedded in the GLB's own `asset.extras`
(generator Sketchfab-16.68.0) and verified from the binary at integration.

| In-game vehicle (spec id) | Asset | Author | Source | License | File |
|---|---|---|---|---|---|
| M2A2 Bradley (`m2a2_bradley`, oracle only) | M2 Bradley IFV | 42manako | https://sketchfab.com/3d-models/m2-bradley-ifv-ab022158ab5f4fbfa55d4142db7595ab | CC-BY-4.0 (embedded: "CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)") | `public/models/tanks/community/m2_bradley_ifv.glb` (nodes: body_lod0 hull, turret_lod turret+25mm, treads_lod, bagsbagsba stowage; ground y=0, z long) |

### User drops waves 5–7 (recovered fleet, integrated 2026-07-29) — local-only models

These models came from the owner's recovered download folder. They are enabled
only in the private/local runtime. `VITE_PUBLIC_BUILD=1` keeps their gameplay
specs but omits the restricted model-source rows; the vehicles use built-in
procedural family visuals and icons instead. `tools/strip-nc-assets.mjs` removes
their GLBs and derivative icons from public artifacts. This conservative
quarantine is required because most direct archives did not retain a verifiable
license/author record.

| Group | Vehicles / spec ids | Source and license state | Local files |
|---|---|---|---|
| Tejas V. M1A2 | `m1a2_tejas` | https://sketchfab.com/3d-models/m1a2-abrams-c85846177bfc4018b6a8f3b40754655c — CC BY-NC-ND 4.0. Historical comparison source only; the normalized adaptation and derivative icons were deleted and are no longer registered. The CC-BY dannzjs M1A2 remains the flagship. | Retired; no local model or derivative icon files retained. |
| Mortavex AbramsX | `abramsx` | Owner-supplied archive; https://sketchfab.com/Mortavex identifies the author, but the recovered file did not retain a redistribution-clearing license record. | `public/models/tanks/community/abramsx-mortavex.glb`, `public/icons/abramsx_*.png` |
| Direct recovered archives | `challenger1`, `chieftain5`, `fv510`, `leo2_revolution`, `leo2a5`, `leo2a7v`, `m1a1ha`, `m1a2_sepv2`, `m60a1`, `pt91m`, `merkava1b`, `merkava2b`, `merkava2d`, `merkava3b`, `merkava3c`, `merkava3d`, `merkava4b`, `t62mv1`, `t64bv1`, `t72b_1987`, `t72b3m`, `t72bu`, `t90sm`, `type90`, `t90a_vladimir` | Owner-supplied source archives under `public/models/community-candidates/user-drops-recovered/`. Original download URLs/licenses were not preserved sufficiently for redistribution clearance; local-only quarantine. | `public/models/tanks/community/recovered/<id>.glb`, matching `public/icons/<id>_*.png` |
| m_bergman part 1 second pass | `is3_bergman`, `isu152`, `isu122s`, `centurion3`, `centurion5`, `comet`, `challenger_cruiser`, `charioteer`, `leopard2_proto`, `m1a1_aim`, `m46_patton`, `m47_patton`, `m26_pershing`, `m45_patton`, `m60a3` | https://www.thingiverse.com/thing:4718232 — CC BY-NC-SA, original Solidworks/Parasolid print masters. Local-only NC-SA quarantine. | `public/models/tanks/community/recovered/{bergman_is3,isu152,isu122s,centurion3,centurion5,comet,challenger_cruiser,charioteer,leopard2_proto,m1a1_aim,m46_patton,m47_patton,m26_pershing,m45_patton}.glb`; `m60a3` reuses recovered `m60a1.glb`; matching icons |

Technical rejection record: the pack file labelled `M60A3 complex` is an M60
machine-gun receiver, not an M60A3 tank. Its mistakenly generated GLB was
deleted; the original source archive remains untouched. The playable M60A3
therefore uses the recovered M60A1 visual as the nearest honest family model.

### User drops wave 8 (scout-gen2 MBT generations, integrated 2026-08-01)

Twelve cold-war/gen-2 MBT-generation vehicles from the scout-gen2 candidate
round. Reference packets: `docs/references/tanks/scout-gen2-*.md`; per-folder
provenance records: `public/models/tanks/candidates-gen2/*/PROVENANCE.md`
(anonymous downloads, no accounts; per-candidate game-rip checks recorded
there). STLs were baked to comparison GLBs by `tools/build_gen2_tanks.sh` /
`build_gen2_tanks.py`; gameplay specs are redistribution-safe code
(`src/vehicles/supplementalFleetSpecs.ts`, nearest-researched-donor pattern)
and every playable now uses first-party procedural geometry. The historical
inputs fall into two license classes:

**Redistributable comparison class (CC BY / CC BY-SA)** — retained for offline
measurement and authorship evidence; no GLB or source credit is a playable
runtime path:

| Vehicle / spec id | Author | Source | License | Files |
|---|---|---|---|---|
| T-44 (`t44`) | Foxygamer142 | https://www.thingiverse.com/thing:6799441 | CC BY-SA 4.0 | `public/models/tanks/community/t44_foxygamer.glb`, `public/icons/t44_*.png` |
| Type 59 (`type59` — stats are the Type 59's; the mesh is the author's Type 69, same WZ-120 family silhouette) | LastTriarius | https://www.thingiverse.com/thing:6192142 | CC BY 4.0 | `public/models/tanks/community/type69_lasttriarius.glb`, `public/icons/type59_*.png` |
| AMX-30B (`amx30`) and AMX-30B2 (`amx30b2` — same source model, B2 fittings) | Captain_Ahab_62 (Richard Honeycutt) | https://www.thingiverse.com/thing:3602722 | CC BY 4.0 | `public/models/tanks/community/{amx30b_ahab,amx30b2_ahab}.glb`, `public/icons/{amx30,amx30b2}_*.png` |
| M48 Patton (M48A5) (`m48`) | ATModeler | https://www.thingiverse.com/thing:5964554 | CC BY 4.0 | `public/models/tanks/community/m48a5_atmodeler.glb`, `public/icons/m48_*.png` |
| M60A2 Starship (`m60a2`) | Captain_Ahab_62 (Richard Honeycutt) | https://www.thingiverse.com/thing:3063170 | CC BY 4.0 | `public/models/tanks/community/m60a2_ahab.glb`, `public/icons/m60a2_*.png` |
| Vickers MBT Mk.1 (Vijayanta) (`vickers_mk1`) | JackTheTinkerer | https://www.thingiverse.com/thing:5523615 | CC BY 4.0 | `public/models/tanks/community/vickers_mk1_jack.glb`, `public/icons/vickers_mk1_*.png` |

**Quarantine class (NC-SA — LOCAL-ONLY, see the PERSONAL-USE / NC QUARANTINE
section below)** — never registered as runtime sources. Public builds keep the
first-party procedural gameplay rows and `tools/strip-nc-assets.mjs` deletes
the GLBs, derivative icons, and whole `candidates-gen2/` source tree:

| Vehicle / spec id | Author | Source | License | Files |
|---|---|---|---|---|
| T-54 (`t54`), T-80 (`t80`), T-80B (`t80b`), T-80BV (`t80bv` — full-ERA mesh, the roster's closest silhouette proxy for the T-80BVM) | m_bergman (Marco Bergman) | https://www.thingiverse.com/thing:4718232 | CC BY-NC-SA 4.0 (Thingiverse license marker; the author's custom note only narrows "commercial" to selling prints) | `public/models/tanks/community/recovered/{t54,t80,t80b,t80bv}.glb`, `public/icons/{t54,t80,t80b,t80bv}_*.png` |
| T-84 Oplot (`t84`) | LastTriarius (remix of ThudOne thing:4885197 + m_bergman T-80 parts) | https://www.thingiverse.com/thing:6178654 | Labeled CC BY 4.0 — **effective CC BY-NC-SA 4.0** (license chain, note below) | `public/models/tanks/community/recovered/t84.glb`, `public/icons/t84_*.png` |

License-chain note (t84): LastTriarius labels the T-84 remix CC BY 4.0, but
both remix parents — ThudOne thing:4885197 and the m_bergman thing:4718232
T-80 parts — are CC BY-NC-SA, and ShareAlike terms carry through to the
combined work regardless of the remix's own label. The t84 is therefore
treated as CC BY-NC-SA (local-only NC quarantine), exactly like its
bergman-derived siblings above.

- `public/icons/*.{png,webp}` — 9 generated assets per roster tank (three
  shaded views, two silhouettes, armor/module/crew diagrams, and markings) rendered
  from the shipped models and their gameplay armor volumes by
  `npm run tank:assets` (tools/icons-page.html studio scene). The nine
  `m1a2_*` assets are
  DERIVATIVE RENDERS of the CC-BY-4.0 "Abrams M1A2 SEPv3" by dannzjs, and the
  community-vehicle icons (`strv103_*`, `is3_*`, `t34_85_cad_*`,
  `newc_tiger_*`, `newc_pziii_*`, `pziii_konserwa_*`, `leichttraktor_*`,
  `recon_tank_*`, `q_heavy_*`, plus wave 2: `kv2_*`, `tiger2_*`,
  `sherman_jumbo_*`, `jagdtiger_*`, `jpz_e100_*`, `sturmtiger_*`, `t95_*`,
  `t30_*`, plus wave 3: `is7_*`, `object279_*`, `is6b_*`, `is1_*`, plus user
  drops 2026-07-28: `leo2a6_*` (CC-BY buh), `type74_*` and `ariete_*`
  (QUARANTINE — see the section below), plus user drops wave 2 (recovered):
  `t90m_*` (CC-BY minehffd), `leclerc_*` (CC-BY andertan), and `leo2a4_*`,
  `bmp2_*`, `bmp1_*`, `m1128_*`, `m1296_*` (m_bergman — QUARANTINE), plus user
  drops wave 4: `t80u_*` (CC-BY javanilga),
  `kf51_*` (CC-BY GRIP420/David Falke), plus the 42 local-only wave 5–7 icon
  sets listed immediately above, plus user drops wave 8: `t44_*` (CC-BY-SA
  Foxygamer142), `type59_*` (CC-BY LastTriarius), `amx30_*`/`amx30b2_*`/
  `m60a2_*` (CC-BY Captain_Ahab_62), `m48_*` (CC-BY ATModeler),
  `vickers_mk1_*` (CC-BY JackTheTinkerer), and `t54_*`/`t80_*`/`t80b_*`/
  `t80bv_*`/`t84_*` (m_bergman / LastTriarius remix — QUARANTINE)) are
  derivative renders of the community assets tabled above —
  those rows' attribution covers the derived images. All other icons render
  100% procedural geometry (no third-party content).
- `public/maps/*.webp` and `public/maps/thumbs/*.webp` — native-4K battlefield
  hero images plus lightweight picker derivatives for all shipped maps,
  captured from the game's own deterministic render; derivative only of this
  repo's procedural world + the CC0 texture sets listed above (no attribution
  duty for CC0).

## Audio (public/audio/) — 100% local synthesis, no third-party recordings sampled

The runtime sound stack (`src/audio/audio.ts`) is synthesized live in WebAudio
(oscillators, seeded noise buffers) — no downloaded samples anywhere. The TWO
on-disk audio categories (battle announcer voice set; baked combat SFX set)
are both generated by this repo's own tools, not sourced:

| Asset | Author/Method | Source | License | Files |
|---|---|---|---|---|
| Baked combat SFX (29 files, COMBAT-SFX r4, 2026-08-22: layered cannon fire per caliber class — pressure punch + crack/report + outdoor tail × small/medium/large/huge; low-mid armor-flex penetrations ×2; receiving-end interior whump; compact scrape/glance ricochets ×3; non-pen plate thunk ×2; ammo-rack tank explosion core ×2 + heavy debris + turret-pop accent; burn-out cook-off; HE burst ×2; shell-into-dirt; ERA fracture) | Generated by this project via `tools/make-sfx.mjs`: **100% procedural DSP synthesized in node** (seeded/deterministic — swept sines, broad filtered/shaped noise, low-mid plate modes, baked terrain echoes; no microphone, no recordings, no model) → local ffmpeg mastering (character EQ, restrained saturation/compression, peak normalize, `alimiter`) → mono 48 kHz Opus 96k. Self-gated: clean decode, duration, true peak ≤ −1 dBTP, per-mix LUFS windows, payload budget, four-band spectral balance, and relative contrast gates between caliber, impact, and explosion families. Current representative mixes: penetration 22.7% bass / 56.8% body / 0.2% harsh, tank destruction 60.7% bass / 18.0% body / 2.0% harsh; cannon bass progresses 34.2%→57.3%→68.0%→78.3% and terrain decay 0.8→1.4→2.4→3.6 seconds from small to huge. | Local synthesis — this repo (re-runnable: `node tools/make-sfx.mjs`; zero downloads, no accounts/keys/cloud) | Original procedural output of this repo — CC0-by-construction posture, no third-party material of any kind | `public/audio/sfx/*.ogg` (29 files, ~483 KiB total, ≤900 KiB budget; lazy-loaded at the first user gesture like the voice set — boot untouched) |
| Battle announcer voice lines (36 call ids, 82 files incl. 2–4 read variants: battle start, victory/defeat/draw, spotting + sixth sense, firing, penetration/bounce/crit reports, kill confirms, ammo rack/fuel/engine/track/gun/optics/radio damage, role-specific commander/gunner/driver/loader casualties, fire/fire-out, low HP, reload, first aid, movement, repairs and system-restored calls) | Generated by this project via `tools/make-voices.mjs` (VOICE r3, 2026-08-08): **Piper neural TTS run 100% locally** (piper-tts 1.6.0, GPL-3.0 build-time tool only — nothing of it ships), ONE voice model = one classic American announcer (owner redirect; table below, picked by the measured `--bakeoff`) → ffmpeg intercom chain (silence trim, speechnorm, 300–3400 Hz bandpass, 4:1 compression, light bit-crush grit, seeded pink-noise static bed, squelch clicks) → 2-pass loudness normalize to −19 LUFS → mono 24 kHz Opus. All scripts are ORIGINAL in the classic tank-announcer register — stock military vernacular only, no other game's script copied. r1 four-persona crew set retired — preserved at `shots/voices-r2/r1-full/`, A/B pairs at `shots/voices-r2/ab/`; the older macOS-`say` set remains at `shots/voices-r1/old-full/` | Local synthesis — this repo (re-runnable: `node tools/make-voices.mjs`; engine + model auto-bootstrap into `~/.cache/cot-piper` via anonymous downloads from `huggingface.co/rhasspy/piper-voices`) | Recorded speech is synthetic — no third-party recordings sampled. Voice-model dataset license verified per MODEL_CARD (table below): CC0 — **deliberately no NonCommercial models**, so this payload stays out of the NC quarantine | `public/audio/voice/*.ogg` (82 files, ~286 KiB total) |

Voice model (from `huggingface.co/rhasspy/piper-voices`, anonymous download;
license = the training dataset's license as stated in the MODEL_CARD):

| Role | Piper model | Training dataset | Dataset license |
|---|---|---|---|
| Battle announcer — every line (deep US male) | `en_US-joe-medium` | OHF-Voice voice-datasets (Joe) | CC0 |

r2 bake-off (re-runnable: `node tools/make-voices.mjs --bakeoff`): joe picked
over `en_US-john-medium` (LibriVox, public domain) on gravitas (raw spectral
centroid 1952 vs 2909 Hz; 1784 vs 1983 Hz through the radio chain), fullness
(body band 300–800 Hz −25.3 vs −27.0 dB RMS post-chain at ~equal full-band
level) and natural clipped pace (1.25 s vs 2.01 s for the same battle-start
line). The r1 crew models (`en_GB-northern_english_male-medium` CC BY-SA 4.0,
`en_US-john-medium` PD, `en_US-kristin-medium` PD) stay cached in
`~/.cache/cot-piper/voices` for future use but no longer ship any audio.

Voices evaluated and REJECTED on license grounds (kept out of the payload):
`en_US-ryan-high` + `en_US-hfc_male-medium` (datasets CC BY-NC-SA 4.0 —
NonCommercial; fine for this private build but would drag the whole voice set
into the NC quarantine), `en_US-lessac-*` (Blizzard 2013 research licence,
individually issued), `en_GB-alan-medium` + `en_US-amy-medium` (mimic3-voices
dataset LICENSE reads "Mycroft AI / All Rights Reserved" — murky).

Sourcing note (2026-07-31): CC0 sample packs were considered for gunfire and
impacts (kenney.nl audio packs are UI/arcade-flavored — no armored-vehicle
combat set; freesound.org requires an account for downloads — skipped per the
no-account rule). Procedural synthesis + the pre-rendered caliber beds won on
cohesion, payload (zero download) and licensing simplicity. Same rules held
for the VOICE r1 neural crew round and the r2 single-announcer redesign
(both 2026-08-01): local/offline engines only, anonymous downloads only, no
accounts/keys/cloud TTS — the macOS "aarch64" piper binary release turned out
to be mislabeled x86_64 (no Rosetta on this Mac), so the engine runs from the
official `piper-tts` PyPI wheels instead. COMBAT-SFX r2 (2026-08-01) moved the
combat one-shots from live WebAudio synthesis to a baked layered set, r3
(2026-08-22) rebuilt its timbre and spectral gates, and r4 added explicit
family contrast plus longer heavy-weapon decay. All keep the same posture:
everything is offline node DSP + local ffmpeg — still zero downloads and zero
third-party audio.

## PERSONAL-USE / NC QUARANTINE (remove before any public distribution or commercialization)

Assets in this section are licensed NonCommercial (and/or NoDerivs) or
personal-use only. They are acceptable in this private project but MUST be
deleted (files + icons + any derivative renders) before the game is ever
distributed publicly or commercialized.

NOTE: `npm run build` and `npm run build:public` exclude this entire block
automatically — they set `VITE_PUBLIC_BUILD=1` (quarantine-path model sources are never
registered; recovered gameplay rows remain on procedural family fallbacks) and then run
`tools/strip-nc-assets.mjs`, which deletes
`dist/models/tanks/community/{quarantine,recovered}/**`, the local-only
Tejas/AbramsX GLBs and derivative icons, plus the candidates trees, and
fails the build if any registered playable still references a stripped path.

| Asset | Author | Source | License | Files | Notes |
|---|---|---|---|---|---|
| M1A2 Abrams (user drop, batch abrams-suspects 2026-07-28) | Tejas V. (@tejasv_) | https://sketchfab.com/3d-models/m1a2-abrams-c85846177bfc4018b6a8f3b40754655c | CC BY-NC-ND 4.0 | `public/models/community-candidates/user-drops/m1a2-abrams/{m1a2-abrams.glb,RENDER.png,LICENSE-RECORD.txt}` | Original artist work (Blender + Substance, ArtStation-linked; identity confirmed by exact 1,253,928 face-count match vs Sketchfab API). ND: the decimated GLB is an adaptation — never redistribute. Candidate to replace the shipped CC-BY dannzjs `m1a2` GLB in-game; if adopted, the CC-BY model remains the only one shippable publicly. |
| Type 74 (local comparison drop) | NullOps | https://sketchfab.com/nullops (user-supplied download) | Sketchfab Standard (free download; author states 'feel free to use however you like' but the license is not CC) | quarantined comparison copies only | **NOT PLAYABLE GEOMETRY.** The active Type 74 is repository-authored procedural construction; no mesh, converted vertex data or source-backed wrapper enters runtime. |
| C1 Ariete (local comparison drop; model swap retired 2026-08-11) | DustyMojito | https://sketchfab.com/DustyMojito (user-supplied download) | Sketchfab Standard (free download; use-in-project OK, no raw redistribution — not CC) | local comparison only | The playable uses our earlier authored procedural `buildAriete`; `MODEL_SOURCE.ariete` is disabled. The comparison was never copied into the builder. No mesh, vertex, texture, material, rig or derived conversion enters the playable. |
| 1:100 Modern Tanks and Vehicles pack — 5 evaluated vehicles (`leo2a4`, `bmp2`, `bmp1`, `m1128`, `m1296`) | m_bergman (Thingiverse) | https://www.thingiverse.com/thing:4718232 (user-supplied download; original Solidworks-drawn wargame print masters — author's own custom license note ONLY narrows "commercial" to selling the prints, the CC-BY-NC-SA grant itself stands) | CC-BY-NC-SA | `public/models/tanks/community/quarantine/{leo2a4_bergman,bmp2_bergman,bmp1_bergman,m1128_mgs_bergman,m1296_dragoon_bergman}.glb`, `public/icons/{leo2a4,bmp2,bmp1,m1128,m1296}_*.png` (derivative renders) | Local comparison inputs only. No model source or combat row from this pack is registered at runtime; the public build strips the quarantined files and derivative icons. |
| 1:100 Modern Tanks and Vehicles pack, part 1 (user drop, batch bergman 2026-07-28) | m_bergman (Thingiverse) | https://www.thingiverse.com/thing:4718232 (user-supplied download; LICENSE.txt + README.txt in archive) | CC BY-NC-SA (Thingiverse license marker in archive) | 12 converted candidate GLBs + renders in `public/models/community-candidates/user-drops-recovered/bergman-p1/{glb,renders}/` (leo2a4, leo2a5, leo2a6, m1a1_aim, bmp1, bmp2, m1128_mgs, m1296_dragoon, lav25, cougar_6x6, btr70, brdm2 — `*_bergman.glb`) | Original Solidworks-drawn wargame print minis (author ships Parasolid `.x_t` sources alongside every STL — not a game rip). Untextured single-material CAD; hull + yaw-articulated `Turret` pivot authored at ring center, gun fused (virtual pitch). NC-SA: candidates for this private build only — delete all GLBs/renders (and any icons if integrated) before public distribution or commercialization. |
| Recovered fleet waves 5–7 (42 local-only model sets) | Tejas V.; Mortavex; m_bergman; authors not preserved in the remaining direct archives | See “User drops waves 5–7” above | CC BY-NC-ND / CC BY-NC-SA / unverified; all treated as local-only | Retained Mortavex/recovered quarantine trees and their matching five-view icon sets; the retired Tejas adaptation and its icons were deleted. | Model trees and derivative icons are removed by `tools/strip-nc-assets.mjs`; public gameplay rows use distributable procedural family visuals/icons. |
| Scout-gen2 wave 8 NC set (user drops wave 8, integrated 2026-08-01 as specs `t54`, `t80`, `t80b`, `t80bv`, `t84`) | m_bergman (Marco Bergman); LastTriarius (t84 remix of ThudOne thing:4885197 + m_bergman parts) | https://www.thingiverse.com/thing:4718232; https://www.thingiverse.com/thing:6178654 | CC BY-NC-SA 4.0; the t84's CC BY label is governed by its NC-SA remix parents (effective CC BY-NC-SA — see the wave-8 license-chain note) | `public/models/tanks/community/recovered/{t54,t80,t80b,t80bv,t84}.glb`, `public/icons/{t54,t80,t80b,t80bv,t84}_*.png` (derivative renders), raw candidate STLs + source zips in `public/models/tanks/candidates-gen2/` | Offline comparison inputs only. Runtime specs in `src/vehicles/supplementalFleetSpecs.ts` use first-party procedural geometry; `tools/strip-nc-assets.mjs` removes the recovered files, derivative icons, and candidate tree from public artifacts. |

## FV510 Warrior oracle drop (2026-08-06, owner-downloaded)
- public/models/tanks/community/fv510_warrior.glb — "FV510 Warrior" by
  42manako (https://sketchfab.com/42manako), CC-BY-4.0,
  https://sketchfab.com/3d-models/fv510-warrior-b33ccded031f429ba719228a74a0d22b
  (Sketchfab download, license verified from embedded asset.extras).
  Replaces the shape-divergent recovered/fv510.glb print as fv510's
  measurement oracle. Owner's 2026-08-09 re-drop was byte-identical
  (SHA-256 `d4bcad966b92d0735f0affe65a926502eee9e2a158ff0b35cfe6c443453fa389`).
  The tracked GLB is a deterministic no-triangle-cut semantic repartition
  (Hull/Turret/Gun) with SHA-256
  `8bc9e6c1eb9a73794278cdb9ee4f6de2d540364d4772adc87e9c8224b40a2be6`;
  the active FV510 is our earlier repository-authored procedural build. The
  reference contributes no runtime mesh, converted vertex data or payload.

## SPz Puma oracle drop (2026-08-06, owner-downloaded)
- public/models/tanks/community/spz_puma.glb — "SPz Puma" by 42manako
  (https://sketchfab.com/42manako), CC-BY-4.0,
  https://sketchfab.com/3d-models/spz-puma-8e7d946d4b3d4fdeaf458a3fc4226e1b
  (license verified from embedded asset.extras). NEW VEHICLE: the Puma is
  not yet in the roster — owner order "make the spz puma as well".

## Base-21 oracle wave (2026-08-06, owner-downloaded; licenses verified from embedded asset.extras)
- community/leopard_1a4_photogrammetry_scan.glb — "Leopard 1A4 [photogrammetry scan]" by pervonharke, CC-BY-4.0 (leo1a5 family influence + oracle candidate)
- community/t-72b3m_obr._2022.glb — "T-72B3M Obr. 2022" by 42manako, CC-BY-4.0 (t72b3m graduate re-oracle candidate + t72b3 base)
- community/challenger_3.glb — "Challenger 3" by 42manako, **CC-BY-NC-4.0** (non-commercial — local measurement/influence only, never ship; NEW-VEHICLE candidate)
- community/challenger_ii.glb — "Challenger II" by buh, CC-BY-4.0 (challenger2 oracle)
- community/challenger_1_main_battle_tank.glb — CC-BY-4.0, but **NOT
  REGISTERED (measurement-unusable)**: the Sketchfab page is tagged
  createdwithai + world-of-tanks, i.e. AI-generated geometry — not a
  faithful record of the real vehicle. challenger1 keeps its gate-PASS
  recovered print. Kept in-repo (no rule violation, just unusable).
- community/type-10_main_battle_tank.glb — **OWNER-CLEARED 2026-08-06,
  registered (type10 oracle)**. History: quarantined earlier the same
  day because the uploading account (nazidefenseforceofficial) was
  adjudicated a game-rip poster 2026-07-27 (T-90AM with *_dds ripper
  textures); no per-asset rip evidence existed for THIS file (Sketchfab
  OBJ merge, textured atlas, no ripper-tool markers). The owner
  adjudicated the hold ("build the type 10 and challenger 2 as a
  priority using the real glbs") — un-quarantined from
  community-candidates and registered in the four harness maps. The owner's
  2026-08-10 `type-10-main-battle-tank.zip` is the same source export: nested
  OBJ SHA-256
  `c95211bba65d883700671373816c182c749f1973b638c42d21a562f244d686c5`;
  ZIP SHA-256
  `22bf48234c20edad51c9087dc4c02b99156c687af6a326533275eca9953d7468`.
  The pristine GLB remains unchanged at SHA-256
  `2cc5748e4357722fc1c21bf7759ec21c29f84b2cfaf1203b5bee995f4cfeca67`.
  The GLB is now a quarantined visual/measurement comparison only. The active
  Type 10 is our repository-authored `buildType10Native2026`; the former
  converted payload/wrapper was deleted and may not be regenerated.
- community-candidates/t-14_armara_uralvagon_factory.glb — "T-14 Armara Uralvagon Factory" by 3DYAROSLAV2, CC-BY-4.0, **223MB: exceeds GitHub's 100MB file limit — lives in the gitignored staging area, LOCAL-ONLY; onboarding extracts (small) are committed instead** (t14 oracle). Owner-supplied GLB SHA-256 is `02785328797c80090fd0e9c48b5bb6fe8e7a1e3fac4d340138fede6348c8d2b3`. The GLB is a quarantined visual/measurement comparison only. The historical 2026-08-10 converted payload and its generator were deleted; the active T-14 is the repository-authored procedural `buildT14`.
- ~~community/leopard_2a4_otco.glb~~ — **REJECTED + DELETED 2026-08-06**:
  the live Sketchfab page describes it "Leopard 2A4 OTCO **from War
  Thunder**" (tag: warthunder) — the same asset this file already
  rejected 2026-07-27. THE ONE ABSOLUTE RULE refuses game extractions
  regardless of the uploader's CC-BY tag (type_89 precedent). File
  removed from the repo; leo2a4 keeps its photo-class build and has NO
  oracle. Embedded asset.extras claimed CC-BY-4.0/Jeyhun1985 — a
  reminder that embedded metadata alone is NOT sufficient provenance.
PROVENANCE LAW (reinforced by this wave): embedded asset.extras is a
STARTING point, never proof — the live source page (description, tags,
uploader history) is the authority. Three of these eight failed that
check. Owner ruling on scope: the clean ones are measurement/influence references for our own procedural builds ("its just influences were making our own high quality models off of") — never shipped as game assets. The type_89_ifv_war_thunder.glb drop remains REFUSED (commercial-game extraction; THE ONE ABSOLUTE RULE) — the Type 89 builds from photos.

## Challenger 3 oracle (2026-08-06, owner drop; NEW VEHICLE)
- community/challenger_3.glb — "Challenger 3" by 42manako
  (https://sketchfab.com/42manako), CC-BY-NC-4.0: NC = LOCAL-ONLY
  QUARANTINE class per this file's standing rule — measurement/influence
  reference for the challenger_3 procedural build only; never ships, the
  playable is always the procedural model.
- community-candidates/abrams_x_low_poly.glb — "Abrams X Low Poly" by
  Mortavex (same author as the registered abramsx oracle), SKETCHFAB
  Standard license: **LOCAL-ONLY QUARANTINE, never ships** — owner-
  supplied 2026-08-07 as the primary AbramsX look reference (§5.08).
- community-candidates/type_74_new.glb — "Type 74" by NullOps (same
  author as the registered type74 oracle), SKETCHFAB Standard:
  **LOCAL-ONLY QUARANTINE** — owner-supplied 2026-08-07; census shows
  SPLIT mesh nodes (Body/Tracks/...) vs the old fused single-skin —
  candidate to REPLACE the type74 oracle and retire its re-rig
  escalation (onboarding = orchestrator lane). The 2026-08-11 rebuild used
  the owner's local `/Users/kevinliu/Downloads/type_74.glb` receipt,
  SHA-256 `8cd9eb1a915a4bcba402ba86032a6111cdd8c7e1f5cc1698a5fe50bdbd7c726e`,
  strictly as an ignored visual/measurement oracle. No source mesh, texture,
  armature, animation, material or derivative payload byte is committed or
  redistributed; the shipped playable remains original procedural geometry.
- community-candidates/type10-source/ — the TYPE-10 source OBJ behind
  the registered community GLB (owner-supplied 2026-08-07; source
  material, not an instrument).

## KojfDiscord "(Armored Warfare)" series (owner drops, 2026-08-08 — §5.38 priority wave; SEVEN vehicles)
All by KojfDiscord (https://sketchfab.com/KojfDiscord), each carrying a
CC-BY-4.0 tag in asset.extras. PROVENANCE INCONCLUSIVE per the
PROVENANCE LAW: every title names the commercial game Armored Warfare,
and the live pages checked (K2, 2026-08-08) show NO description and NO
tags — the embedded CC-BY tag alone is not proof (type_89/leo2a4
precedent recognizes game-titled uploads as extraction-suspect). Owner
supplied all seven explicitly as modeling references ("fully model a
custom X based on this model"), matching the standing owner ruling:
measurement/influence references for OUR OWN procedural builds — so ALL
SEVEN are **LOCAL-ONLY QUARANTINE, never ship**; every playable is a
procedural build. If the owner wants type_89-strict treatment (delete,
build from photos alone), say so and the files are pulled.
- community-candidates/k2_black_panther_armored_warfare.glb (47MB GLB)
- community-candidates/type_99a2_armored_warfare.glb (21MB GLB) — the
  owner's 2026-08-10 copy is SHA-256
  `35024b8262ae065153da0f704f1c42a66b4a8e239a46a525af76ee12c405043f`.
  It is a commercial-game-titled, provenance-inconclusive visual/measurement
  reference only. No source mesh, material, texture, animation, archive or
  derived payload byte ships; the playable Type 99A2 is original procedural
  geometry.
- community-candidates/amx-40_armored_warfare.glb (31MB GLB)
- community-candidates/t-90a_burlak_armored_warfare.glb (GLB)
- community-candidates/k1a1_kojf.glb — RE-BAKED by us (blender obj2glb)
  from the zip's SEMANTIC OBJ source (real turret/cannon/tread nodes);
  original zip retained in ~/Downloads. The owner's 2026-08-10 copy is
  SHA-256 `d2e8eeb7d828b2cff23ee78d54657ebf97935f430151741f4dab8a23cbb6a96d`;
  the ignored GLB oracle is
  `b36b620f868cccbdbc2a874c6967273e2cc712b7df83c6e1bc054ec95bad24a0`.
  Neither source nor derived commercial-game geometry/textures ship.
- community-candidates/t90ms_kojf.glb — re-baked from OBJ source, same.
- community-candidates/t90_kojf.glb — re-baked from OBJ source, same.
Textures on the re-bakes are partial (geometry is the instrument).

## §5.248 batch B — "Claude of Tanks Models" folder, 15 drops (owner drop 2026-08-15/16; onboarded 2026-08-17)
Fifteen GLBs from ~/Downloads/"Claude of Tanks Models"/, all Sketchfab exports
with embedded asset.extras. PROVENANCE LAW applied: embedded tags are a
starting point, never proof; live source pages NOT yet checked (deferred to
the orchestrator/owner lane — no browser in the onboarding round). No title
names a commercial game (THE ONE ABSOLUTE RULE not triggered on its face),
but several carry extraction/conversion fingerprints noted below. Owner
ruling standing: ALL FIFTEEN are **LOCAL-ONLY QUARANTINE, never ship** —
measurement/influence references for our own ground-up §K builds (§5.248);
every playable stays procedural. ASK-OWNER standing: type_89-strict deletion
available on request for any file. Parked under the gitignored
public/models/community-candidates/ with author-suffixed names; copies are
byte-identical (SHA-256 verified) to the Downloads originals.

By 42manako (https://sketchfab.com/42manako — same uploader as the quarantined
challenger_3): ten files. Four are CC-BY-NC-4.0 = quarantine class by this
file's standing NC rule regardless of any other finding:
- t72m1_jaguar_manako.glb (CC-BY-NC-4.0) — fused mesh_NNN_mat_NN pair, conversion fingerprint.
- ztz85iii_manako.glb (CC-BY-NC-4.0) — fused mat_65/73 pair, conversion fingerprint.
- oplot_m_manako.glb (CC-BY-NC-4.0) — semantic TUR/POKLOP/KOLLO/GUS nodes, modder-authored or mod-sourced.
- t64bv_donbass_manako.glb (CC-BY-NC-4.0) — modder kitbash (reused btr-70m-hull texture, 3ds Max defaults, AKM prop).
CC-BY-4.0 tagged, with per-file findings:
- pt91a_manako.glb — EXTRACTION-SUSPECT: War-Thunder-style part naming (chassis_vlo, wheel_big/small_N, track_1, misc_a/b); BUILD-STANDARD _vlo audit applies before any metric use.
- t80bv_ua_manako.glb — EXTRACTION-SUSPECT: same _vlo/Tr1 scheme + Russian part names (bashnya, bo4ki); T-80BV exists in War Thunder.
- ztz99a_manako.glb — STRONG SUSPECT: Sketchfab viewer-rip RE-UPLOAD fingerprint (root node "ZTZ99A.obj.cleaner.materialmerger.gles", UUID materials, 37 baked textures). The uploader is not the author; original-source hunt owed before any status upgrade.
- t80u_kursk_manako.glb — STRONG SUSPECT: same viewer-rip re-upload fingerprint (".T-80U.obj.cleaner.materialmerger.gles", off-origin diorama placement).
- ztz99a2_manako.glb — SketchUp/Collada authorship fingerprint (Color_* palette + edge_color materials); reads fan-authored.

Other authors:
- pl01_501st.glb — "Polish tank PL-01 Rigged (FREE)" by 501stclone_trooper
  (https://sketchfab.com/501stclone_trooper), CC-BY-4.0 — authored-look
  semantic Blender nodes, untextured. (pl01 oracle candidate.)
- strv103b_lamonekeli.glb — "strv 103b" by lamonekeli
  (https://sketchfab.com/lamonekeli), CC-BY-4.0 — fan-authored look; joins
  (does not replace) the committed strv103_wesiora candidateGlb registration.
- strv81_mmdsonic.glb — "Strv 81" by MMD_SonicNewYear
  (https://sketchfab.com/MMD_SonicNewYear), CC-BY-4.0 — EXTRACTION-SUSPECT:
  hull_0/turret_0/gun_0/chassis_N game-texture-set naming; Strv 81 exists in
  War Thunder.
- strv122_vavtrudner.glb — "Stridsvagn 122" by Vavtrudner
  (https://sketchfab.com/Vavtrudner), CC-BY-4.0, 122MB (over GitHub's 100MB
  limit; lives only in the gitignored staging area) — TRIPO AI-GENERATED
  (tripo_node/tripo_material fingerprint): not an extraction, but a WEAK
  metric instrument — visual influence only; metric anchors from published dims.
- ariete_c1_arrafi.glb — "C1 Ariete Main Battle Tank" by Muhamad Mirza Arrafi
  (https://sketchfab.com/nazidefenseforceofficial), CC-BY-4.0 — OBJ-authored
  with semantic material split (Hull/Turret/Cannon/Gear).
- carro45t_hlebov.glb — "Carro 45t" by Dmitry Hlebov
  (https://sketchfab.com/hleb_hlb), CC-BY-4.0 — Blender/OBJ hand-model; the
  subject is a World-of-Tanks-only paper design, so all "published" dims are
  project/game-derived (LOW confidence).
(Full SHA-256 receipts in the §5.248 batch-B onboarding report, session
scratchpad; files are gitignored local instruments.)

## §5.248 batch A — thirteen Downloads-root drops (owner-supplied 2026-08-17)
All thirteen parked in the gitignored public/models/community-candidates/
— LOCAL-ONLY QUARANTINE by default, never ship; playables stay procedural.
Full 13-row provenance table + SHA-256 receipts in the batch-A onboarding
report (session scratchpad). Highlights: bmp3_rok_42manako (CC-BY-NC, NC
class) — new bmp3 candidate; bmpt2_sanderwolf (CC-BY, plausible original) —
new bmpt candidate; upior_killcapturedestroy (CC-BY, original concept with
ONE game-style-named BMP-2 turret component tell recorded) — new upior
candidate; marder1a3_arrafi + leo2a6m_arrafi + leo2a4m_arrafi (the
nazidefenseforceofficial account = adjudicated rip-poster 2026-07-27;
leo2a6m/leo2a4m additionally carry the WT-lineage chassis_vlo scheme —
extraction-suspect, measurement/influence only, §E vlo shell-isolation
required); m3a3_bradley_sipriv (CC-BY original rigged lowpoly) — new
m3a3_bradley candidate; m2a3_bradley_ua_42manako (CC-BY, fused) —
m2a2-family alternate; stb1_pyaesone (CC-BY-NC, 125MB) — stb1 oracle
candidate; type90_42manako (CC-BY-NC) — type90 alternate reference;
spz_puma_42manako (CC-BY, SAME Sketchfab source as the registered
spz_puma oracle) — restores the missing-on-disk instrument, copied back to
the registered path; type-10 re-drop byte-identical to the owner-cleared
pristine (receipt only); leopard_2a4_otco re-drop byte-identical to the
already-parked WT-extraction quarantine copy (2026-07-27/08-06
adjudication STANDS; the registered leo2a4 instrument remains the
owner-authoritative repaired repartition).

## §5.317 owner drops (2026-08-17)
- `t95_world_of_tanks.glb` (sha256 14c576b58d4eac19…, 10.6MB) — GAME-TITLED upload (World of Tanks) = EXTRACTION-SUSPECT class: LOCAL-ONLY reference in community-candidates/ (gitignored), never ship, owner-sanctioned measurement/visual use for the §5.317 t95 redesign (new row oracle candidate pending §E/censor verdicts).
- `strv_103b.glb` (sha256 e0b0997377b43edf…, 10.6MB) — CENSUS VERDICT (lane J, 2026-08-17): CLEAN CC-BY-4.0 COMMUNITY MODEL. Provenance is embedded in the GLB `asset.extras`: title "Strv 103B", author "BFJFFK (https://sketchfab.com/chilecaliente)", license "CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)", source https://sketchfab.com/3d-models/strv-103b-c05d9f47d8d640588f7f08d04491fa8d, generator Sketchfab-12.74.0 (OBJ-origin conversion: root node "Strv_103B.obj.cleaner.materialmerger.gles"). No game-rip fingerprints (5 anonymous Object_N meshes, UUID material names, no engine/extraction tags). LOCAL-ONLY reference in community-candidates/ (gitignored) for the new strv103a id + the strv103 family; attribution recorded here per CC-BY. Census: 5 meshes / 73,539 verts / 54,002 tris, ~1:1 meters, nose +Z; full receipts in docs/references/tanks/strv103a.md.

## Leopard 1 owner oracle (2026-08-18)

- **Tank_Leopard 1** by
  [Marina.Kardava](https://sketchfab.com/Marina.Kardava), licensed
  [CC-BY-4.0](http://creativecommons.org/licenses/by/4.0/), source
  [Sketchfab model b8a64bf4f6ae4811bea84c8d657f0025](https://sketchfab.com/3d-models/tank-leopard-1-b8a64bf4f6ae4811bea84c8d657f0025).
  Owner-supplied file SHA-256:
  `6cae5ea670df40cd8c5371635fa212f7b7b65f69dcfcd1d25645e3eae1b2eb87`.
  The GLB is a local-only, gitignored comparison instrument. No source mesh,
  material, texture, animation, or derived payload byte ships; `leo1a5`
  remains original first-party procedural geometry.

## Leopard 2 Revolution owner source (2026-09-04)

The owner supplied `leopard-2-mbt-revolution.zip`, SHA-256
`8577cb2ac53daf369dc2175b045207de4760246ec73f6434bbcfce38a0fc3e4f`.
Its nested OBJ SHA-256 is
`d97595be419fee2c474a1cd4cfdc6b502e666070d4c746dda2e7b0d8c2d60481`.
The archive provides no original author, source URL, or license record;
Arma-like texture names are an unresolved provenance warning. It remains
local-only, with no redistribution clearance. The derived neutral comparison
GLB `public/models/community-candidates/leopard_revolution_owner_2026.glb`
is ignored by Git and must never enter a playable or public asset path.
The new Revolution is original first-party procedural geometry attributed
to Kevin B. Liu; external vertices, indices, textures, and materials do not
ship. See [the source study](research/leopard-revolution-source.md) for
normalization, measurements, original-versus-altered-oracle evidence, and
the 92-point per-view exemplar gate.

The separate `leo2_revolution_proto_preservation.glb` is an ignored, neutral
export of this repository's own authored model from commit
`da5e0cf0af4e4ddf7a29ec78d7e1c120ce12755b`. It is explicitly a historical
first-party **preservation** instrument, not an external source or evidence
of real-world fidelity. Its pinned SHA-256 is
`ce63f41864d158627df7a89f0fc22e7f71ae753ded72e350206230bf2f417ff7`.
