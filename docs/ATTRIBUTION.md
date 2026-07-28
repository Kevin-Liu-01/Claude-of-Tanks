# Asset Attribution

Every downloaded asset committed to this repo is recorded here (name, author,
source, license, file path). Runtime stays fully self-contained: all files are
served locally from `public/`, no CDN or network fetches in game code.

| Asset | Author | Source | License | Files |
|---|---|---|---|---|
| Switzer font family (Regular 400, Medium 500, Semibold 600, Bold 700, Extrabold 800 — woff2 web kit) | Jérémie Hornus / Indian Type Foundry | https://www.fontshare.com/fonts/switzer (downloaded via https://api.fontshare.com/v2/fonts/download/switzer) | Fontshare Free Font License (ITF FF EULA) — free for personal & commercial use; license text committed alongside the fonts | `public/fonts/switzer/Switzer-{Regular,Medium,Semibold,Bold,Extrabold}.woff2`, license: `public/fonts/switzer/LICENSE-FFL.txt` |

## Vehicles (public/models/tanks/) — 1 shipped asset (M1A2)

7 of 8 tank models (Tiger I, T-34-85, IS-2, Panther G, M4A3E8 Sherman, T-90M,
Leopard 2A7) are 100% procedural (`src/vehicles/tankFactory.js`). The M1A2
Abrams SEPv3 ships as a sourced GLB (deep-hunt winner, integrated 2026-07-27):

| Asset | Author | Source | License | Files |
|---|---|---|---|---|
| Abrams M1A2 SEPv3 | dannzjs | https://sketchfab.com/3d-models/abrams-m1a2-sepv3-eb6f5560198740269507e9948376414c (obtained without login via public GitHub mirror DhruvBhargava007/Morv_AI @ Dhruv) | CC-BY-4.0 — "This work is based on \"Abrams M1A2 SEPv3\" (https://sketchfab.com/3d-models/abrams-m1a2-sepv3-eb6f5560198740269507e9948376414c) by dannzjs (https://sketchfab.com/dannzjs) licensed under CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)" | `public/models/tanks/m1a2_sepv3_dannzjs.glb` (offline preprocess: textures downscaled 1K/512 + WebP, TurretPivot/GunPivot articulation grouping baked in; original license.txt + Sketchfab API license record + geometry notes preserved in `docs/licenses/m1a2_sepv3_dannzjs/`) |

Integration verdict (harness renders `tank_closeup_modern`, `garage`,
`player_view`, `combat_firing`, icons): the sourced model decisively beats the
procedural M1A2 — recognizable SEPv3 (CROWS, CITV, bustle rack, 7 road wheels,
side skirts), turret yaw / gun pitch / recoil / camo tint / killcam all work
through `modelLoader.js`'s re-parenting path.

The per-tank source-of-truth switch is `MODEL_SOURCE` in
`src/vehicles/specs.js`; the GLB ingestion path (hull-length scale
normalization, material upgrade, turret/gun re-parenting, synchronous
cached-GLB path for icons/garage) is `src/vehicles/modelLoader.js`.

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
asset page at download time. Build-time only: GLBs are baked to vertex-colored
geometry in `src/world/props-models.json` by `tools/bake-props-models.mjs`;
the game fetches nothing at runtime.

CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/ ·
CC-BY 3.0: https://creativecommons.org/licenses/by/3.0/ (attribution below)

| Asset | Author | Source | License | File |
|---|---|---|---|---|
| Sandbags | J-Toastie | https://poly.pizza/m/xClPIEQJdX | CC-BY 3.0 | public/models/props/sandbags_jtoastie.glb |
| Sack Trench | Quaternius | https://poly.pizza/m/LW3jwpPfiN | CC0 1.0 | public/models/props/sack_trench_quaternius.glb |
| Sack Trench Small | Quaternius | https://poly.pizza/m/iHyRewQQcN | CC0 1.0 | public/models/props/sack_trench_small_quaternius.glb |
| Tank | Poly by Google | https://poly.pizza/m/4t0RMXCl_Ud | CC-BY 3.0 | (provenance record — file removed at judging cleanup 2026-07-27) |
| Light Tank | Zsky | https://poly.pizza/m/S1jUTRmAjD | CC-BY 3.0 | (provenance record — file removed at judging cleanup 2026-07-27) |
| Tank | Quaternius | https://poly.pizza/m/Dc4k4CooN3 | CC0 1.0 | (provenance record — file removed at judging cleanup 2026-07-27) |
| Barrel | Quaternius | https://poly.pizza/m/MraIiFnpAY | CC0 1.0 | (provenance record — file removed at judging cleanup 2026-07-27) |
| Oil Drum | Zsky | https://poly.pizza/m/TLsXd9efLC | CC-BY 3.0 | (provenance record — file removed at judging cleanup 2026-07-27) |
| Hay | Quaternius | https://poly.pizza/m/Yu8TOERkpw | CC0 1.0 | (provenance record — file removed at judging cleanup 2026-07-27) |
| Haystack | Poly by Google | https://poly.pizza/m/6LeCqyw00RK | CC-BY 3.0 | (provenance record — file removed at judging cleanup 2026-07-27) |
| Fence | Quaternius | https://poly.pizza/m/U7g0Wxpt63 | CC0 1.0 | (provenance record — file removed at judging cleanup 2026-07-27) |
| Fence | Quaternius | https://poly.pizza/m/UXmKfG81fG | CC0 1.0 | (provenance record — file removed at judging cleanup 2026-07-27) |
| Telephone pole | Poly by Google | https://poly.pizza/m/7YIloiV4cAt | CC-BY 3.0 | public/models/props/telephone_pole_polygoogle.glb |
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

Method: side-by-side rendered screenshots (sourced vs procedural) via the
screenshot harness plus custom close-up camera poses; per-category verdicts.

**KEPT (winners, files above remain in repo):**
- **Telephone pole** (Poly by Google, CC-BY 3.0) — crossarms, insulators and
  wire spans beat the plain procedural cylinder poles. Placed via
  InstancedMesh along road A (`SOURCED.poles` in src/world/props.js).
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
loaded synchronously — the __GAME_READY screenshot contract stays intact,
zero runtime fetches).

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
`src/world/sourcedTextures.js` + `src/world/terrain.js`) and
`public/textures/buildings/` (village materials via `src/world/props.js`).
The procedural painters remain the synchronous fallback behind the
`USE_SOURCED_*` flags in `src/world/sourcedTextures.js`. Only the 1K
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
  `src/world/sourcedTextures.js`: verdant grass/dirt/rock, desert
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
  `src/engine/sky.js`): its baked-in sun cannot track the per-map sun
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

## Generated files (no third-party ownership, listed for completeness)

- `public/icons/*.png` — 40 PNGs (8 tanks × top/angle/side + 2 silhouettes)
  rendered from the shipped models by `node tools/genIcons.mjs`
  (tools/icons-page.html studio scene). The five `m1a2_*` icons are
  DERIVATIVE RENDERS of the CC-BY-4.0 "Abrams M1A2 SEPv3" by dannzjs — the
  vehicle-table attribution above covers these derived images (CC-BY 4.0
  attribution carried by this file). All other icons render 100% procedural
  geometry (no third-party content).
- `public/maps/{verdant,desert,winter,urban}.png` — map-picker thumbnails
  captured from the game's own render; derivative only of this repo's
  procedural world + the CC0 texture sets listed above (no attribution duty
  for CC0).
