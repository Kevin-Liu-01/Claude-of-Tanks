# Whole-map beautification

## Goal and current position

The target is a believable, beautiful, inhabited battlefield at tank height,
not only a nicer panoramic horizon. World of Tanks is the visual reference;
its assets are not inputs. The ten new maps and shipped night lighting survive.
The current landscape drafts do **not** meet that visual bar.

This is the implementation guide for the complete pass, following the
[primary-source/reference study](WOT-ENVIRONMENT-REFERENCE.md).

| Work | State |
|---|---|
| Whole-scene reference analysis and 30-map identity plan | Recorded here |
| Torn tree crowns / moving terrain texture coordinates | Fixed and committed locally; native images reviewed; held after Verdant timing gate failed |
| Verdant horizon | Original July 27 geometry and palette restored and pushed in `1e0b2608b`; replacement prototype rejected by the user |
| Mode placement | Shared solo/server safety checkpoint passes all 30 maps × 5 modes on current roads ([evidence](MATCH-PLACEMENT-CHECKPOINT.md)); road integration must revalidate it |
| Road continuity | Separate endpoint/shoulder fixes in progress; regenerated collision/minimap data and final verification remain outstanding |
| Nighttime entry | Final-light-first correction pushed; focused first-night/headlight/lantern/Garage check passed, lighting art issues remain ([evidence](NIGHT-ENTRY-CHECKPOINT.md)) |
| Unified ground/forest composition, road and settlement materials | Planned; not implemented by the study |
| Biome rollout and fresh marketing images | Not accepted or released |
| No performance/memory regressions | Required, **not yet demonstrated** for the latest drafts |

The review uses actual saved native game images (`all-map-review-r1`, later
R12/R14 forest images), current source and four personally viewed official
WoT references. The older 28-map capture is historical evidence, not a fresh
certification of current main. A config review covers all 30 maps; do not
describe that as personally viewing every current map at every quality level.

Fresh main/candidate captures now also cover Verdant, Coastal and Winter with
26 exactly matched camera receipts. See [foundation verification](MAP-RENDER-FOUNDATIONS.md)
for the failed performance check and explicit release hold. The
[Verdant scene checkpoint](VERDANT-SCENE-CHECKPOINT.md) is now a superseded
proposal, not instructions for the next art work. The user rejected its native
result and explicitly requested the original horizon. Do not resume or publish
the `7997efb42` prototype, including its other unaccepted pastoral refinements.
The restoration's original positions, colors, normals and indices are tested
against historical fixtures over three seeds; the public build and native
establishing view were checked. This is restoration, not a new visual-quality
or comparative performance claim. Other 29 horizons were left unchanged.

## What makes the reference work

The Prokhorovka image organizes a lowland scene into harvested fields, working
routes, windbreaks and low wooded uplands. Mountain Pass connects crags, scree,
streambed and sheltered conifers. The desert image concentrates vegetation
around water rather than scattering it evenly. Himmelsdorf's castle organizes
the site: retaining walls, access routes, courtyards and surrounding woodland
all support that focal point. These are observations, not inferred engine code.

Our common problem is weak relationships: small texture marks everywhere,
objects spaced over similar ground, roads that look painted on, several
independent systems disagreeing about where the forest or shoreline belongs.
More random variation alone makes that noisier rather than more convincing.

## Feature audit and implementation priorities

| Feature | Evidence / problem | Concrete treatment | Cost discipline |
|---|---|---|---|
| Tree geometry | Actual duplicate canopy vertices separate under independent jitter; R12 crowns look torn | Coherent spatial-vertex deformation, intact seams, correct normals | Same geometry/index/LOD counts and RNG tail; no subdivision |
| Ground anchoring | Grazing shader derives UV basis from camera direction; normal sample is mixed in another frame | World-fixed alternate chart, transform sampled normals back correctly | Same/fewer texture reads; unchanged material masks |
| Landforms | Annular rows dictate repeated ridges; independently noisy hills lack drainage | Compose connected watersheds, tributary spurs, passes and open sectors in XZ | Existing outland buffers; leave gameplay terrain unchanged initially |
| Terrain materials | Coastal wear mask can paint beach sand far inland; large bedforms reach meadow; fields become marbled | Give soil, grass, rock, sand and cultivation geographic meaning; bind beach to shoreline and bedforms to actual sand | Reuse splat channels/texture resolution; no fragment noise loops |
| Grass and undergrowth | Dark card flecks transition to bright smooth ground; grass tint/fade disagree with ground | Match grass base to terrain albedo; clustered margins, worn clearings, one coherent distance transition | Existing instance ceiling; replace distribution, not blanket density increase |
| Forest composition | Full crest bands consume budget first; tiny ground dots use an unrelated mask | Shared irregular stand coverage on terrain and silhouettes, slope groves, meadow openings, species/age groups | Reuse atlas channels and child geometry ceiling; exact grounding |
| Rocks and cliffs | Smooth radial rock variants read as blobs; some surfaces spend contrast on swirls | Geological families: fractured slabs, weathered limestone, columnar basalt, stratified sandstone; talus belongs below exposed rock | Reallocate existing vertices/variants; merge static detail; preserve colliders unless separately reviewed |
| Shorelines and water | Several radial sheets and radius-relative wet masks still suggest scalloped basins/uniform blue interiors | Main channel, secondary inlets, eroded banks, gravel bars, shallow/deep/silty zones; docks need sheltered access | Existing water passes and masks; authoritative depth/traversability agreement |
| Snow and ice | Dark roads slice across broad white areas; snow does not consistently describe exposure | Compressed tracks, drifted crossings, exposed windward stone, snow held in hollows; restrained ice fracture scale | Existing textures/masks; no snow particles or new weather system |
| Roads | Long smooth ribbons, uniform cores and generic intersections | Route classes: farm twin-track, gravel service lane, ballast apron, damaged paved street; widening/wear at use points | Existing road geometry/mask budgets; preserve hard-ground behavior |
| Settlements | Buildings sit as separate roof islands with little yard/site structure | Connected church green/farm court/mill yard; industrial loading court/service yard/workers' street; coastal harbor/uphill housing | Reuse counts and instances first; relocation needs collision/nav verification |
| Building materials | Bright orange roofs and bold mortar/tile repetition compete with blank facades | Larger weathered roof runs, quieter mortar, moisture at plinths, soot near use, coastal salt wear; stronger entrance/loading-bay hierarchy | Repaint current textures and instance tints; no per-building material clones |
| Destruction and clutter | Random rubble/crates/vehicles often have no common cause or activity | Breached wall plus its rubble; disabled vehicle at impact site; harvest storage by barn gate; pallets by loading door | Reuse existing props/destructible limits, preserve route clearance |
| Sky and atmosphere | Similar shallow cloud shapes and cyan/cream grade recur across different settings | Distinct fair agrarian, clear coastal, cold overcast, humid and dusty sky compositions; readable cloud masses and intentional clear areas | Same cloud layers/resolutions; no volumetric pass or rain/snow |
| Lighting and color | Haze, over-bright surfaces and unrelated palette accents weaken depth | Coherent sun/shade, restrained saturation, local material contrast, lower distant contrast; readable nighttime tanks | Preserve bounded light pool, shadow settings and day/night lifecycle |
| Ambient life | More independent motion can add cost without place identity | Sparse flags, existing chimney/industrial activity and location-appropriate sound; emphasize functional sites | Existing pools/LOD and deterministic static dressing; no unbounded emitters |

Code owners: `vegetation.ts` / `jitterRadial`; `terrain.ts` / `splatCompute`,
`paintRoadMask`, `paintVillageMask`; `horizonDetail.ts` / `rangeColumns`,
`selectHorizonDetailRows`; `horizonCanopySurface.ts`; `props.ts` /
`buildRockVariants`, `collectBuildingCandidates`, `collectFoundationDecals`,
`placeYardClutter`; `maps/exteriorDetailKit.ts`; `skyCloudBake.ts`, `engine/sky.ts`.
Only the first two rows are narrow rendering defects. The other rows are art
direction and need image verification, not just source changes.

## Per-map identity — not thirty reskins

These are authored directions from the current catalog. Preserve each map's
gameplay layout while developing a distinctive visual hierarchy.

| Map | Primary composition and next visual emphasis |
|---|---|
| Verdant Fields | Retain the restored original horizon per the user's explicit override; keep road, spawn and loading repairs independent of another outland redesign |
| Amberford | Autumn ford, riparian growth and hillside farms; warm leaf litter against cool water |
| Tarkhan Steppe | Open golden folds, sparse windbreaks and distant farms; avoid enclosing mountains |
| Frontier Basin | Agricultural basin and checkpoint routes; branched gullies and patchy conifer uplands |
| Tidegate Polders | Drainage channels, straight human-made levees, field headlands and pump yards; very low horizon |
| Orchard Valley | Orchard rows follow working terraces; packing courts and village lanes, distinct from wild forest |
| Longleaf Crossing | Logging spur, cut blocks, timber yard and regrowth; visible forest-age variation |
| Highland Reservoir | Pine catchments, exposed reservoir margin, waterworks and service roads |
| Frosthollow | Snowbound farms, bare birch and open snowfields; windblown/compacted route contrast |
| Glacier Pass | Frozen lake, rocky alpine catchment, sheltered village; exposed crags and drifting snow |
| Nordhavn Fjord | Steep harbor settlement, fishing quays, dark water and coastal rock; layered mountain valleys |
| Whiteout Station | Sparse polar service compound, fuel storage and wind-shaped snow corridors; expansive low backdrop |
| Saltmere Bay | Dune-backed fishing coast, sheltered harbor and inland pasture; no inland sand marbling |
| Saltwind Narrows | Dry limestone terraces, scrub and narrow sheltered water; pale stone with restrained green |
| Jade River Delta | Braided channels, floodplain agriculture and raised compounds; vegetation follows water |
| Mangrove Reach | Tidal islands, exposed mud, root thickets and raised access; avoid generic grassy countryside |
| Monsoon Ridge | Humid jungle ridges and weathered valley settlement; darker understory and muddy drainage |
| Sirocco Wadi | Dry watercourse organizes settlement and palms; windward sand against eroded rock |
| Sunscar Oasis | Spring-centered grove, caravan compounds, wet bank and bare surrounding dunes |
| Redrock Divide | Stratified escarpments, talus and logistics outpost; controlled arid palette |
| Titan Gorge | Immense canyon crossroads, branching dry channels and ledges; do not grass over every rock shelf |
| Copper Mesa Mine | Extraction benches, haul roads and ore-loading courts; human cuts distinct from natural cliffs |
| Cinder Junction | Rail ballast, freight platforms, graded service routes and storage blocks |
| Ironworks | Connected loading courts, factory service yards, soot gradients and workers' streets |
| Kestrel Airfield | Runway/apron geometry, dispersal bays, perimeter service roads; wide open sightlines |
| Obsidian Caldera | Black volcanic shelves, ash and extraction equipment; distinct basalt fracture language |
| Steinburg | Masonry street blocks, courtyards, central civic space and localized war damage |
| Ruinspires | Monumental damaged street canyons; rubble belongs to adjacent structures and forms clear plazas/routes |
| Blackglass District | Broken arcologies, elevated transit and flooded finance quarter; glass/concrete, not orange stone towers |
| Skybridge Chasm | Crossing/abutments/control works organize massive canyon; believable approaches and below-bridge debris |

## Order of work and visible checkpoints

1. **Correct the foundations:** welded foliage and world-anchored terrain shading.
   Separate commits, targeted regressions, native before/after. These should not
   be held behind a whole new landscape algorithm.
2. **Respect the Verdant restoration:** the attempted coordinated pastoral scene
   was rejected. Its watershed and palette changes are not a foundation for the
   rollout. Preserve the restored horizon while finishing the requested road,
   objective/spawn and nighttime-entry corrections. Continue the broader art
   work on other map families with fixed native views before generalizing it.
3. **Prove different families:** Ironworks (built/industrial), Glacier Pass
   (snow/rock), Saltmere Bay (shore/water). Each gets its own composition; do not
   generalize grassland colors/terrain to the others.
4. **Roll out by family:** use the table above, then review all 30 maps with
   fixed views. Ten new maps already exist; don't add ten duplicates again.
5. **Finish presentation:** replace map showcase pictures only after each map
   is accepted. Keep native full-resolution images and performance receipts.

Each checkpoint must state: implemented, image-reviewed, tests, performance
comparison, committed and pushed. These are separate statuses. Small local
experiments are preserved but are not shipped as finished work.

## Acceptance is visual and measured

- Same camera/seed/tier before and after: tank-height foreground, middle-distance
  landmark, full scene, magnified background, slow pan, day and night where changed.
- Readable composition at thumbnail scale; believable material/plant scale up
  close. No torn geometry, disconnected props, texture swimming, halo ribbons,
  floating cards, isolated dirt discs or uniform biome-wide speckling.
- Preserve combat sightlines, traversability, collision/minimap consistency,
  destructibles and multiplayer authority. Gameplay height/cover changes require
  explicit dedicated regression and updated server collision manifests.
- Equal-or-lower retained texture/buffer bytes, materials/programs, draw calls
  and bounded instance counts. Pair actual loading/construction and frame-cost
  measurements on the same native setup; don't use unpaired screenshot timing,
  a software renderer, quality reductions or relaxed thresholds as proof.
- Exercise cache eviction, map transitions and return to garage. Desktop browser
  and emulated mobile are not physical iPad/Safari certification.
- If a change is prettier but exceeds the performance/memory budget, optimize
  or replace the technique before release. Do not silently waive either goal.
