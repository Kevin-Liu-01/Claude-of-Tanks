---
name: src-world-skill
description: Work on terrain, maps, collision, vegetation, props, destructibles, and world streaming.
---

# claude-of-tanks / src/world

## Purpose
<!-- agent-docs:fill:purpose -->
Own deterministic battlefield geometry, collision queries, destruction, LOD,
and map presentation.

## Mental model & key files
<!-- agent-docs:fill:model -->
`worldBuildCoordinator.ts` owns map transfer, construction joins, background
pacing, cancellation, residency, and eviction. `worldActivationRuntime.ts`
owns the single active battlefield, atmosphere re-keying, collider/minimap
readiness, covered GPU warm, dormancy, and activation telemetry. `map.ts` composes maps,
`worldFramePresentationRuntime.ts` owns scoped foliage suppression and the
allocation-free chase-camera occlusion focus passed to an active world,
`terrain.js` provides the height field and world-local shared LOD index pools,
`terrainLodPolicy.ts` owns typed allocation-free visible/prefetch scheduling,
`liveHeightFieldProxy.ts` selects cached live versus exact authoring queries,
`collision.ts` owns strict allocation-free broad phase and narrow-phase shape
contracts, `maps/` owns layouts, `shallowWater.ts` owns the lake/sea sheet and `waterRipples.ts` the world-anchored GPU
shallow-water field it reads for wakes, churn and splashes (null on the mobile tier and in receipts), and vegetation,
props and toppling own their visual/runtime layers; `groundRedux.ts` (THREE-free) holds every map's ground profile
(the terrain material's transition / fold / snow / strand knobs and the tall-grass biome — never a map-config edit),
`tallGrass.ts` the instanced blade rings the hulls press flat through `groundPressure.ts` (a world-anchored GPU field,
null on mobile and in receipts); every terrain chunk vertex carries a `fold` byte (the relief's curvature) and, on the
sea and lake maps, a `shore` byte (metres landward of the waterline from the shoreline contours, inverted so a geometry
without it reads as far) that the material's strand runs up (round 73b); `wrecks.ts` owns typed,
deterministic static tank-wreck and zero-extra-draw-call debris baking.
`destructibles.ts` is the typed, allocation-free active-world seam between
shell traffic, break FX, prop destruction events, and cached map handlers.
`utilityNetwork.ts` owns renderer-free pole adjacency, hinge poses, stable
conductor instance slots, and caller-buffer catenary sampling.
`topple.ts` and `treeGrounding.ts` own typed terrain-contact fall math and
bounded root decals without bringing Three.js into either policy.
`treeClimate.ts` (THREE-free, round 77) resolves the wind every tree of a battlefield sways in (direction from the
map's cloud wind or the ground profile's prevailing wind, strength from the cloud regime's speed) and the moss its
shaded trunk bases grow (from the ground profile's climate tint); `vegetation.ts` reads it once per world into the
tree materials' uniforms. The vertex wind law, the per-cluster cascade sample (`aCard`), the leaf-shadow floor, the
translucency (`canopyLighting.ts`), the conifer whorls, the understorey shrubs and the stand shade all live in
`vegetation.ts`; `understorey.selftest.mjs` and `treeClimate.selftest.mjs` pin them beside the vegetation receipts.
Round 77b: `treeImpostors.ts` bakes the far tier — one atlas per world of every species' three near variants from
eight azimuths (linear albedo + coverage, capture-space normal; the tile from the 6 MB budget) from the real trunks,
cards and leaf atlases, lazily in `vegetation.ts`'s `update()` (never inside a render pass, again after a GPU
suspension), and the far pools draw one camera-facing quad per tree through the far canopy's hook; it exists only
where the engine context carries a `renderer` (production desktop) — the receipts and the mobile tier keep the
opaque lobe tier, and `vegetationFarSeams` keeps proving the lobe builders. `leafDetail.ts` (CPU, no canvas)
generates the per-class tiling leaf-cluster tile (normal + a break mask normalised to a mean of one half) the near
material carries as its normal map, with the tangent frame rebuilt after `useAttributeNormal`; the rim-forest
blocks are discs (`_rimBlocks`) the understorey feathers through the stands' law. `treeImpostors.selftest.mjs` and
`leafDetail.selftest.mjs` pin them.
Round 77c: the horizon ring's forest beyond the red line is bound to the same atlas — `horizonForestImpostors.ts`
redraws `buildHorizonForest`'s placements (packed byte-identically on the group's `userData.horizonForest`) as one
quad per tree through the far tier's program text (`library.applyProgram`), its wrap / translucency / sky fill and
the ring's haze law, the species by class from the map's rim mix at the rim trees' mean stature
(`vegetation._rimTreeHeightM`); the near class's lobes stay as shadow-only casters; `map.ts` binds after the
vegetation builds, the mobile tier and the receipts keep the lobes. The atlas carries an elevated 45° row per
species where that keeps the row cap and the ground tile (every 3-species map); the view elevation dissolves the
tile toward it and tilts the card. The bake runs under cover through `world.warmImpostors()` (the solo loading
runtime, the activation runtime's precompile). `horizonForestImpostors.selftest.mjs` and the `vegetationFarSeams`
law section pin the seam.
The mountains lane (2026-10-02, "clouds are the bar; mountains, horizons and terrain must match"): `horizonMassif.ts`
(THREE-free) carves the ranged rings' composition — each row's relief smoothed along the row — by an eroded landform (a
Clay-John-style dendritic drainage cut into a smooth base, mean one, the summits through a soft knee), and each
authored range samples its profile at its own small angular offset (`PROFILE_TWIST_RAD` in `maps/horizon.ts`) so a
massif is no longer a radial spur seen end-on as a cone; the far range takes the landform at 2.2 x its scale and wanders
its crest row in depth, and a tableland's far rows pass a grey-scale opening (`openRowTables`) so their summits stand as
tables, not stepped pyramids. `horizonEscarpment.ts` (THREE-free) lays the tableland rings' world-level bed stair (a cliff
over a concave talus slope per bed, caprock rims as fixed points, a slope-weighted plan meander, talus aprons, a 3.6:1
cliff bound enforced by lowering only) after the side canyons (the landform, cut-only) and the row refinement; Redrock's
runs after its ground hand-over. Both run once per ring at construction as sliceable generators inside
`buildHorizonRingSteps` and move heights only (the same rows, columns and triangles); `horizon.massif: false` /
`horizon.escarpment: false` opt a ring out (Nordhavn Fjord's aiguilles and Earthrise Basin's walls keep their round-72b
rings) and an `escarpment` block on another style opts it in (Sunscar Oasis). The
ring atlas's occlusion and cast shadows take their own share (`RING_RELIEF_SHADE`, horizonAutumnGround.ts) beside the
gradient's 0.18. `horizonMassif.selftest.mjs` pins the laws and the skyline cone measure.
p2 trees lane (2026-10-01): the desktop tiers GROW their near trees — `treeGrowth.ts` (a THREE-free skeleton per
species profile: stem or leader, scaffolds or whorls, side shoots and twigs bent by gravity and clipped by the crown
envelope; spray seats on the outer branches; `supportSprays` draws every spray-bearing branch the tube budget left
out as one straight three-sided twig, except the limbs reaching into the stem's collision band) and its emitters
(tapered tubes with styled bark UVs — u = 2 + 2 × style + the fraction round the stem, mapped by
`prepareTreeBarkSurface` onto the four-style bark sheet, built only when the grown trees are — their tint keeping out
half the sky the crown takes, `canopySkyOcclusion`; spray cards with volume normals, aFlex and aCard; a position-only
crown shadow hull the pool's proxy casts instead of the far lobe hull; `weldGrownGeometry` indexes all three) — and
`treeSprayAtlas.ts` paints one 2 × 2 branch-spray atlas per species (leaf shapes and a soft spray body per species; on
a snowy palette snow on the top tile row, which the sky-facing sprays take, and no hoar-frost tone; bare twigs where no
palette opts birches into leaves; the desktop palms take its pinnate frond atlas). `vegetation.ts buildGrownTree`
adds the legacy root flare, root tongues and a few flush snow pads, and certifies its crown supports itself
(`growthCrownAttachments` — treeAttachments.ts's contract; the card attach pass is for the legacy trees); the
registry routes every species but the palm and the tidal-mangrove willow through it when `vegetationGrowsTrees()`
(desktop, not `?legacyTrees=1`) and the config has no `legacyTrees`. Battle snags: on those builds a share of a
cratered map's trees (`battleSnagShare`, ≤ 7 %) converts after placement to the `snag` species — its own pools, a
charred twig atlas, a legacy-style far stand-in outside the impostor atlas — as a look only (the obstacle and
concealment records stay the living tree's on every tier). The mobile tier keeps the legacy card trees, atlases, bark
sheet and lobe tier byte for byte; placements and RNG streams are unchanged; the impostor bake takes the grown trees.
`treeGrowth.selftest.mjs` pins the budgets, structure, supports, silhouettes, atlases, the weld, the snow split, the
canopy shade, tier-independent records and routing.
`propGeometry.ts` owns shared UV-safe primitives and the low-triangle telephone
pole distance representation; callers dispose or transfer every returned mesh.
`propPlacement.ts` owns typed terrain-support, rigid-footprint, utility-pole,
segment, and compound-obstacle placement during world construction.
`structureConnectivity.ts` rejects unsupported authored parts before batching;
`structureInstanceAppearance.ts` supplies stable intact/wreck instance tint
without creating per-building materials.
`propsModelStore.ts` owns the bounds-checked packed runtime representation of
the attributed `props-models.json` authoring source; regenerate it with
`npm run world:props:pack` after intentional source changes.
`propsSteelAtlas.ts` (round 75) paints the props `steel` bucket's generated
corrugated painted-steel atlas (marked container side strips, a plain strip,
a door strip; u-repeat only, every face mapped into its strip with
`mapBoxFaceUv` / `mapSheetUv`) and the ORM blue channel carries the rust mask
the shared weathering hook in `props.ts` mixes toward rust. `yardDressing.ts`
is the renderer-free planner of the yard dressing around industrial structures
(apron band, clearance from roads, water, berth, solids and envelopes, a
per-map budget, its own seeded stream, no collision record) and
`maps/yardClutterKit.ts` its geometry per family; the producer folds every
piece into the map's wood / steel / baked bucket before the bucket merge (no
draw of its own), and paints the steel atlas only when the plan needs it.
The industrial cladding law: on a map that authors `industrialCladding:
'steel'` the warehouse (`maps/railKit.ts`), the foundry office and the fire
station (`maps/structureKit.ts cladIndustrialWalls`) are the light kit's sheet
tile (`structureMetal`) under the liveries of `exteriorDetailKit.ts
INDUSTRIAL_CLADDING` — frosted pale grey with oxide trims on a snow map
(`StructureBuildContext.snowCap`), grey-green with dark trims elsewhere; a
vertex livery under a bright tile, so a dark hex is a dark hall. Moved walls
consume their seeded UV draws, new parts take none, and a sheet hall takes no
catalog façade pass (the masonry buckets carry the centred wall envelope).
`rockDressing.ts` (round 75 item 6) owns the boulders' fracture law (the
legacy displacement's projected hull stays the collision proxy: every cut
moves a vertex inward), the per-map moss / dust / soil dressing, the triplanar
rock tile and the hook layered on the grime hook.
The scenery lane (2026-10-03): a map's named landscape features live in its top-level `scenery` block
(`sceneryPlan.ts` holds the contract, the config-only footprints the vegetation keeps off and the ground-cover holes);
`sceneryRocks.ts` builds the rock forms (granite tors, bedded sandstone / limestone outcrops, slate crags, limestone
pavement, scree, menhirs, cairns, calvaries) as welded vertex-coloured geometry with a convex mass per standing form,
and a hill's bedrock (`buildBedrock`: level jointed beds on the flanks no hull climbs, a skin with no mass);
`maps/sceneryKit.ts` holds the timber and steel landmarks (`SCENERY_DESTRUCTIBLE_TYPES`, merged into the props type
registry after the inhabiting kit's) and the lattice pylons; `scenery.ts` composes them in props after every other
placement and before the bucket merge (one rock-material mesh for the map, the pylons folded into `baked`, each
feature on its own seeded stream, every refusal named in `props.group.userData.scenery`). `scenery.selftest.mjs` pins the forms, the kit, the admission and every authoring map's placement;
docs/MAP-LAYOUT-BRIEF.md "Scenery" is the authoring guide. The field wall module (`maps/inhabitKit.ts` `wallstone`)
is a dry-stone wall fitted to the old coursed module's envelope after spending its draws; brick-print maps
(`sourcedTextures.ts` `sourcedStoneIsBrick`) keep the coursed module through props' local types.
A plan builder reads its battlefield through `structureBuildContext(buckets)`
(`maps/exteriorDetailKit.ts`), never a positional argument; a part new to a
builder's seeded stream is tagged `userData.uvJitter = 'none'`, a part that
stood in the stream before an atlas took its UVs `'consume'`, so every later
placement keeps its seat.
`structureCollision.ts` keeps projection/key caches construction-local. Any
optimization must retain exact polygon order and runtime/authoring output;
numeric inputs outside the certified raster-bounds domain use the original
predicate path. Static wreck baking alone may omit the default-on factory ERA
audit receipt; it must retain ERA geometry, seating and cluster ownership.
`headlessCollisionWorld.ts` owns the typed inflation and query facade for exact
authored collision records on a dedicated server without importing renderer or
DOM state.
`loosePropPhysics.ts` owns deterministic fixed-step impulses, terrain support,
sleep, static contact, and pair response for lightweight battlefield dressing.

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->
Keep height/collision queries deterministic and headless-capable. Bound per-frame
LOD/vegetation work, reuse world caches, and reset destruction on rematch.
Garage vegetation may reuse battlefield-near tree geometry only as static,
instanced scenery with no world update loop. Its headless audit path must remain
DOM-free. Share its immutable species groves across cached environment packs,
split cold grove preparation across rendered frames, and dispose each generated
foliage atlas with the owning library. Each Garage horizon must follow the source
biome rather than reuse a universal mountain wall.
Certify structure connectivity before material-bucket or instanced-geometry
merges; merged geometry is too late to identify a floating authored fixture.
Keep facade depth inside existing material buckets and repeated-building
variation inside instance attributes. Never clone a material per placement or
add a steady-frame structure update solely for cosmetic variety.
Keep large baked numeric streams out of executable chunks. Start their bounded
transfer with explicit Battle intent, overlap it with independent construction,
and verify the packed representation against its authoring source.
World meshes authored only as low-polygon shadow casters must use
`markShadowOnly()` from `src/engine/renderLayers.ts`; keep visible geometry on
the presentation layer and verify that native shadow submissions are unchanged.
Terrain position/normal buffers remain chunk-local, but identical LOD topology
must share one Uint16 index attribute per resolution within each world.
Register off-tree streamed LOD geometries with the world root's retained
resource lifetime so cache eviction can dispose them.
The same ownership declaration must cover shader-only textures, custom depth
materials, empty CSM-registered buckets and inactive grass LOD variants. GPU
suspension preserves reusable CPU data; final eviction also releases external
destruction callbacks via the world's disposer. Register those callbacks only
after complete assembly, and make disposal identity-safe across same-ID rebuilds.
Use the warmed one-metre height cache for live non-authoring presentation. Keep
the analytic sampler for deterministic captures and construction receipts.
Deferred grass may prepare only a half-chunk beyond its unchanged fade band;
larger invisible lookahead jobs steal CPU from the opening drive.
Keep active-world state inside `worldActivationRuntime.ts`; browser callers
must use its `ensure`, `switchMap`, `prepareBattleServices`, and `setDormant`
interface rather than recreating activation order or retaining parallel map IDs.

## Common tasks → first action
<!-- agent-docs:fill:tasks -->
Identify the canonical height/collision source, add a focused world selftest,
then inspect every registered map and constrained-device frame metrics. Regenerate
the server collision manifest after changing authored obstacles or cover.

## Gotchas
<!-- agent-docs:fill:gotchas -->
The garage keeps the battle world dormant. Do not wake or build heavy map work
on the garage boot path. AI navigation must use traversability, not visuals.
