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
`maps/regional/` holds the regional architecture kits (2026-10-03): a map's `props.architecture` names one, and after
each planned building's placement settles the kit replaces its geometry with the region's version inside the same
footprint (house grammar `house.ts`, openings cut with reveals, `weather.ts` tints and weathering into the vertex-
coloured `regional*` buckets, war wear, `dressing.ts`); collision follows the new shell, so a kit change regenerates
the map's shard. The kit guide is in docs/MAP-LAYOUT-BRIEF.md ("Regional building kits").
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
law section pin the seam. The ring's class shapes draw from their own streams (seed and class, never the placement
stream), so a change to the ring's heights moves and re-thins trees without re-rolling a shape;
`horizonForestShapes.selftest.mjs` pins it on Railyard's ring raised 3 %.
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
The ring atlas's surface (the mountains lane, 2026-10-03, gauntlet wave 0: "a repeating diagonal corduroy ridge
pattern" on Verdant's and Frontier Basin's flanks, Sirocco Wadi's "blobby" walls, "smooth, evenly lit mountain
blankets with no forest, rock or gully structure"): `horizonRelief.ts` no longer stretches its fine relief along the
radius (a flank seen obliquely does not fall along it, so the crests crossed it as combs); every character's
`drainage` cuts couloirs down the fall line of the ring's own smoothed surface with `horizonMassif.ts erosionOctave`,
and its `cover` lays the landcover as the light it leaves — forest stands past the ring forest's 880 m (lobed, crisp,
denser in the hollows, to the treeline, never under the snow; their crowns grain the relief and their 16 m canopy
stands in the occlusion and sun searches), field parcels on the gentle open ground, and on the arid walls varnish down
the couloirs and bed tones by height — folded into the occlusion and sun texels the terrain program already reads
(`encodeCanopyAo` / `encodeCanopySun` against the program's 1.4 power, 0.8 and 0.85 depths and the 0.7 share; no
shader, sampler or draw). `horizonRelief.selftest.mjs` pins the encoding, the program's constants, the fall-line
alignment on oblique flanks (the round-72 field fails it) and where the stands may stand. Where the map-borders lane's
landform is in, the stands follow its woods field (`getBorderWoodsAt`) across the hand-over where the ring's range trees
stand (`HORIZON_STAND_HANDOVER_M`, 720-880 m) and its parcels replace the baked ones; past it the stands are the
ranges' own (a woodland parcel's straight edges drawn up a face read as a band, gauntlet wave 6). The polar and alpine
couloirs are cut at the depth the round-72 field's radial ribs had (30 / 26 m over 280 / 260 m: the faces' ribs).
`horizon.reliefCover` overrides a map's cover. Road passes (`openRoadPasses`, after the border's hand-over): a road
exit (terrain.ts `roadExitAt`, ~720 m) that runs on into the authored ranges gets a valley along its line — floor the
continued ground at its crossing, 30 m either side, ~24° sides to 220 m — instead of a carriageway painted up a face
(Cinder Junction's edge-n, gauntlet wave 1); an exit inside a railway cutting's fan is the cutting's. `ring.roadPass`
marks the moved vertices; `horizonMassif.selftest.mjs` pins it. `horizon.roadPasses: false` keeps a map's ranges whole
(Frosthollow: its north exit runs into the massif, where the pass was a trench ending in a wall).
The far horizon panorama (the mountains lane, 2026-10-03; `horizonPanorama.ts`): beyond the ring the far country
(1.5-9 km) is BAKED, not drawn live — a polar height grid on the GPU (the character's far field: a warped ridged
multifractal, Quilez's eroded octaves, Clay John's gullies, a distance envelope of foothills, ranges and the hill
countries' low far mountains, valleys between, tablelands' caps, sea sectors, the first kilometre easing out of the
ring's outer heights, everything under a low cloud deck scaled beneath it), its light (the map's sun with soft cast
shadows, the sky's occlusion), then a cylindrical strip (8192 x 512, -3..22 degrees from an eye 30 m over the centre)
shaded by the far surface law (strata, scree, snow and forest at the ring's own altitudes, stands and fields, rock
patches) and graded toward the fog colour past the shell. One mesh shows it (`horizon-far-range` too, so the night dims
it): an apron off the ring's outer edge and a wall at 2.6 km, sampling the atlas by direction from the bake eye, the
scene fog off as on the round-72 range. The world bakes it under the loading cover (`map.ts` warmImpostors) or on the
first update, again after a GPU suspension disposes the atlas; until then the round-72 far range draws (receipts, no
float targets). `horizon.panorama: false` keeps the old range; an object overrides the character's far knobs.
Layers (the panorama lab, the real ring baked in-page on SwiftShader, measured the far country above the ring's own
skyline from the eye on 14-35 % of bearings): the edge texture's alpha carries that skyline (`horizonRingSkylineTan`,
compass-smoothed), and past ~3.5 km the far country rises to stand a wandering margin above it (-0.9..+4.3°, never into
the deck) — the hill countries as three broad ridgelines over a plinth (forest and fields zoned over the plinth, the
height grid's G channel), the mountain countries by scaling their ranges (≤ 1.8 x), the tablelands by scaling their
tables (≤ 1.6 x; a third of the far country in tables, none in the first 1.5 km); the near band stays under the ring's
skyline (a near form mapped onto the shell bent with it from off-centre cameras); the strip below that skyline keeps one
lit ground tone; the sea weight is softened over ~4°; fine patterns fade with the texel's grazing footprint. Structure
(gauntlet wave 6, "flat, featureless silhouettes", "box-like flat-topped blocks"): the hill layers' crests carry
summits and saddles; the tablelands are shaped by their rim distance (the mask's margin over its analytic gradient) —
a 700 m talus apron to over half the height, a 50 m caprock cliff, an inset upper tier, alcoves and apron gullies,
broad buttes (narrow tips stay low cones), tops that clear the ring's skyline or stay behind it; the deck follows the
map's cloud cover (`horizonPanoramaDeckM`: scattered clouds leave the summits standing, a closed deck keeps them under
it). A sea sector opens on a coastline that recedes with the sector's weight and leaves the water to the game's own sea; the
far land falls away within ~12° of any sea sector (no monolith on a headland between two openings, Nordhavn Fjord);
`panorama.shore` raises a far shore well inside its sector (Saltwind's mainland across its channel). The polar and
alpine faces carry rock bands (the atlas beds at `cover.bedScale` × their thickness). Before its
bake the panorama takes the battlefield's own ground and rock means (`setGroundTone`, from refreshHorizonGroundTone).
Regional far country (gauntlet wave 15, every critic: "mountain ranges behind places that have none"): a map's
`horizon.panorama: { regional }` takes its real place's far vocabulary (`HORIZON_PANORAMA_REGIONAL`) in place of its
relief character's — `plain` (floodplain, steppe, polders: swells under 70 m, no layers over the ring, the skyline its
shelterbelts and woods, a canopy the height pass grows and writes in the grid's B channel for the strip to colour as
forest), `erg`, `upland` (rounded hills, a half layer), `forested`, `karstRidge`, `ridges`, `jebel` (a short apron, a
sheer fluted wall: `mesaTalusM`/`mesaCliffM`/`mesaFluteM`), `volcanicField` and `iceSheet` (sparse isolated peaks,
`peakShare`/`peakM`/`peakRadiusM`/`peakSharp`; their footprint in the grid's A channel, bared to rock by the strip —
nunataks dark through the ice, the sharp ones drawn out into outcrop ridges). The flat maps' rings were lowered with
them (the crest past 900 m 21-57 m: a flat far country behind a 100 m ring only moved the wall closer).
`horizon.ringStyle` gives the ring its own style (rows, profile, rock, relief character) while the border's landform
keeps reading `style` (Eifel Reservoir: the alpine border its villages stand on, a rolling ring).
`horizonPanorama.selftest.mjs` pins the shell, the atlas mapping and the bake contract; the bake's look is iterated
offline on SwiftShader (no GPU) before the census.
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
Trees round 2 (2026-10-03, PR #9's gauntlet: "flat-card broadleaf", "broccoli canopy", "drooping card foliage", "solid
black tree shadows", "stamped circular clumps"): a grown crown is ~230 smaller leaf CLUSTERS on two-row cards (the
conifers 166), thinned evenly over the crown (`thinEvenly`: a narrow apex keeps its sprays; a conifer's apex is a spire
of shoots, no bare leader), shaded as a mass — `crownLobes` fits the crown's masses, the cards' normals bend to the
lobes' smooth union and their vertices darken by depth in it and on the underside (`GROWTH_CROWN_SHADING`, the tint gain
giving the lit shell back) — and each card carries a billboard frame (`aAxis`, `aLeaf`) the near material turns about
the card's own axis toward the camera (`COT_LEAF_BILLBOARD`, ahead of the wind; the impostor bake turns them the same
way, `COT_BAKE_BILLBOARD`); a small crown's near-camera dissolve keeps to its size (`vCotNearScale`). The tiles are leaf
clusters (smaller leaves, lit by where they sit in the cluster); a pine's brush and an acacia's leaflets keep their gaps
under the alpha test (their shading is painted `source-atop`, never a filled core). `crownShadowDapple.ts` opens sun-space leaf gaps in the
crown hull's depth pass: each crown mass as far as its sprays leave it open (`GROWTH_CROWN_POROSITY`, Beer-Lambert over
the tree's atlas share of opaque leaf, `SPRAY_ATLAS_COVERAGE`) with its own pattern, so a crown's heart casts darker than
its fringe (world-anchored, the wood never opens, closing where a cascade's texel outgrows them).
`treeBiomes.ts` (THREE-free) routes a map's species SLOTS to the regional FORMS of its real place on the desktop tiers
(new profiles and tiles: beech, chestnut, holmOak, olive, canaryPine, aleppoPine, larch; summer birches in leaf; a map's
shrub form, Las Cañadas' and Wadi Rum's broom; a place's foliage colour where the map palette names none, the hyper-arid
places' dust-dulled acacias; a form's own colour over the slot's palette, Dalmatia's silver olives and grey holm oaks)
— records, seeds and the mobile look stay the slot's; a birch crown in leaf on a palette
naming no card colour takes the broadleaf tint law, never the bare twigs' warm grey (`grownTintLaw`). Snow maps: a conifer's
load is its laden sprays over the upper crown (no bough lumps); the classic tufts follow `applySnowGrassLaw` (straw,
sparse, short). Stands are woodlots (`placeTreeClusters`: the round-1 draws replayed on the shared stream so every later
placement keeps its seat, then irregular outlines with denser margins, clearings and thin patches on their own stream, at
the round-1 stands' mean footprint so the deployments' corridors keep their cover; `standPoint` puts the saplings,
fringe scrub and understorey on the real outline; a stand that cannot stand leaves no strays; `treeBiomeOpen` places'
stands are open groves, Las Cañadas' and the arid places'). Lone trees (`placeLoneTrees`, own stream, round-1 draws
replayed) stand at woodlot edges, on field boundaries (a hedged one, the ground lane's `hedgeSite`, else a road's verge)
and as field clumps between the deployments (strung along a hedge where one is near); a hyper-arid place
(`treeBiomeArid`) seats its groves, lone trees and border trees in the wadi beds and hollows; a map's `palmSites` keep
its palms and its palm groves at the water (any other palm grows as `palmFallback`, no draw moved). `treeCrownShading.selftest.mjs` pins the laws,
`treeSpacing.selftest.mjs` where the trees stand; battlePacing guards the fights' cover.
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
and a hill's bedrock (`buildBedrock`: jointed beds read off the live ground by rays on the flanks no hull climbs,
each hill bedded its own way, broken where the ground's clefts cut the wall; a skin with no mass; its `strata` option
takes the terrain's bed law; parked since wave 16, no map places it: on smooth domes it read as masonry);
`maps/sceneryKit.ts` holds the timber and steel landmarks (`SCENERY_DESTRUCTIBLE_TYPES`, merged into the props type
registry after the inhabiting kit's) and the lattice pylons; `scenery.ts` composes them in props after every other
placement and before the bucket merge (one rock-material mesh for the map, the pylons folded into `baked`, each
feature on its own seeded stream, every refusal named in `props.group.userData.scenery`). `scenery.selftest.mjs` pins the forms, the kit, the admission and every authoring map's placement;
docs/MAP-LAYOUT-BRIEF.md "Scenery" is the authoring guide. The field wall module (`maps/inhabitKit.ts` `wallstone`)
is a dry-stone wall fitted to the old coursed module's envelope after spending its draws; brick-print maps
(`sourcedTextures.ts` `sourcedStoneIsBrick`) keep the coursed module through props' local types. The sandbag stacks
(props local types) are `maps/sceneryKit.ts` `buildSandbagStack`, laid bag by bag in the sourced models' envelopes on
the canvas weave; their remnants spend the old remnant's draws first. `fieldWorks.ts` lays a map's field-boundary
works (a karst's dry stone walls, a bocage's hedge banks) on the ground lane's land use through the height field's
`_landUseAt` hook — the same boundary band and field gate the terrain draws — as decor with no collision, at most
1 m tall; a world without the hook builds none. Props builds them last (`placeFieldBoundaryWorks`, after the pools'
refit, through `scenery.ts` `composeFieldWorks`), so they keep off every mode's objective discs where the match
placement seats them on those final solids, as well as the aprons, yards, bridges, trenches, pads and roads; the
selftest proves it on Saltwind and Saltmere. The dry-stone field walls draw their own rubble print (`fieldStone`,
`fieldStoneSurface.ts`), never the house masonry a regional kit repaints; a map's `scenery.masonryTint` tints that
print (Saltwind's limestone). Mud walls draw their own worn render (`fieldMud`, `fieldMudSurface.ts`); every wall run's
islands are dressed at their feet (and on snow maps with drifts and snow loads) by `maps/fieldWallDressing.ts`, through
one owner (`createWallDressing`) on streams of their own.
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
