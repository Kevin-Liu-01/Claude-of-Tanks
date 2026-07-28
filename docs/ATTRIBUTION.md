# Asset Attribution

Every downloaded asset committed to this repo is recorded here (name, author,
source, license, file path). Runtime stays fully self-contained: all files are
served locally from `public/`, no CDN or network fetches in game code.

| Asset | Author | Source | License | Files |
|---|---|---|---|---|
| Switzer font family (Regular 400, Medium 500, Semibold 600, Bold 700, Extrabold 800 — woff2 web kit) | Jérémie Hornus / Indian Type Foundry | https://www.fontshare.com/fonts/switzer (downloaded via https://api.fontshare.com/v2/fonts/download/switzer) | Fontshare Free Font License (ITF FF EULA) — free for personal & commercial use; license text committed alongside the fonts | `public/fonts/switzer/Switzer-{Regular,Medium,Semibold,Bold,Extrabold}.woff2`, license: `public/fonts/switzer/LICENSE-FFL.txt` |

## Vehicles (public/models/tanks/) — no shipped assets

All 8 tank models (Tiger I, T-34-85, IS-2, Panther G, M4A3E8 Sherman, M1A2
Abrams SEPv3, T-90M, Leopard 2A7) are 100% procedural
(`src/vehicles/tankFactory.js`). The per-tank source-of-truth switch is
`MODEL_SOURCE` in `src/vehicles/specs.js`; the GLB ingestion path (scale/orient
normalization, material upgrade, turret/gun re-parenting) is
`src/vehicles/modelLoader.js`, currently dormant.

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
| Tank | Poly by Google | https://poly.pizza/m/4t0RMXCl_Ud | CC-BY 3.0 | public/models/props/tank_polygoogle.glb |
| Light Tank | Zsky | https://poly.pizza/m/S1jUTRmAjD | CC-BY 3.0 | public/models/props/light_tank_zsky.glb |
| Tank | Quaternius | https://poly.pizza/m/Dc4k4CooN3 | CC0 1.0 | public/models/props/tank_quaternius.glb |
| Barrel | Quaternius | https://poly.pizza/m/MraIiFnpAY | CC0 1.0 | public/models/props/barrel_quaternius.glb |
| Oil Drum | Zsky | https://poly.pizza/m/TLsXd9efLC | CC-BY 3.0 | public/models/props/oil_drum_zsky.glb |
| Hay | Quaternius | https://poly.pizza/m/Yu8TOERkpw | CC0 1.0 | public/models/props/hay_quaternius.glb |
| Haystack | Poly by Google | https://poly.pizza/m/6LeCqyw00RK | CC-BY 3.0 | public/models/props/haystack_polygoogle.glb |
| Fence | Quaternius | https://poly.pizza/m/U7g0Wxpt63 | CC0 1.0 | public/models/props/fence_quaternius.glb |
| Fence | Quaternius | https://poly.pizza/m/UXmKfG81fG | CC0 1.0 | public/models/props/fence2_quaternius.glb |
| Telephone pole | Poly by Google | https://poly.pizza/m/7YIloiV4cAt | CC-BY 3.0 | public/models/props/telephone_pole_polygoogle.glb |
| Barn | CreativeTrio | https://poly.pizza/m/A6UkPq33aZ | CC0 1.0 | public/models/props/barn_creativetrio.glb |
| Big Barn | Quaternius | https://poly.pizza/m/q1N3xn2SpC | CC0 1.0 | public/models/props/big_barn_quaternius.glb |
| Church | CreativeTrio | https://poly.pizza/m/GHzPfvoyzX | CC0 1.0 | public/models/props/church_creativetrio.glb |
| Church | Poly by Google | https://poly.pizza/m/6vzTphxL9w4 | CC-BY 3.0 | public/models/props/church_polygoogle.glb |
| Bridge | Poly by Google | https://poly.pizza/m/9oToSb_rBKY | CC-BY 3.0 | public/models/props/bridge_polygoogle.glb |
| Rock Large | Quaternius | https://poly.pizza/m/54jZKTAt5p | CC0 1.0 | public/models/props/rock_large_quaternius.glb |
| Boulder | Poly by Google | https://poly.pizza/m/3jql0qtape- | CC-BY 3.0 | public/models/props/boulder_polygoogle.glb |
| Pine | Quaternius | https://poly.pizza/m/igSu0cPoBz | CC0 1.0 | public/models/props/pine_quaternius.glb |
| Pine Tree | Danni Bittman | https://poly.pizza/m/2Qo-fmVKuSG | CC-BY 3.0 | public/models/props/pine_dannibittman.glb |
| Dead Tree | Quaternius | https://poly.pizza/m/Mcd2zYqyww | CC0 1.0 | public/models/props/dead_tree_quaternius.glb |
| WW2 Ammo box | Carwyn Pelley | https://poly.pizza/m/4QQwW16WZZT | CC-BY 3.0 | public/models/props/ammo_box_carwynpelley.glb |
| Debris Pile | Quaternius | https://poly.pizza/m/WrIiMMxyEP | CC0 1.0 | public/models/props/debris_pile_quaternius.glb |
| Ruin | nha pham | https://poly.pizza/m/6eGK7_Kbswf | CC-BY 3.0 | public/models/props/ruin_nhapham.glb |
| M939 Truck | J-Toastie | https://poly.pizza/m/y8lBpvMlim | CC-BY 3.0 | public/models/props/m939_truck_jtoastie.glb |

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
