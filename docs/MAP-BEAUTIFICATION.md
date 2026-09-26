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
| Torn tree crowns | Far-shell-only seam repair has all30-map geometry/RNG coverage and 12 personally reviewed native Verdant/Coastal pictures. Existing two-map cost comparisons pass with equal render medians and resource counts; p95 and delivered-interval increases remain recorded ([evidence](history/environment-2026-09/CANOPY-FAR-SEAMS-CANDIDATE.md)). Near geometry/indexing stays baseline. The old combined index candidate and its failed/mixed performance evidence remain held; broad forest composition and all-map/mobile performance are not certified |
| Dark grass speckles | Grass atlases retain transparent-edge color in `a38ab190d`; native Coastal/Verdant pairs show reduced black speckling with exact scene/material/texture inventories ([evidence](history/environment-2026-09/GRASS-ATLAS-PADDING-CHECKPOINT.md)). Distribution/tone and complete frame/heap parity remain separate |
| Dark foliage atlas edges | The same straight-alpha correction covers the four tree atlas families in `090bdcb1d`;64 real Canvas cases and22 matched native poses pass with unchanged resource inventories ([evidence](history/environment-2026-09/FOLIAGE-ATLAS-PADDING-CHECKPOINT.md)). This is a subtle edge correction, not a crown-shape redesign |
| Moving terrain texture coordinates / inland sand relief | World-fixed detail chart and Coastal/Saltwind beach-only relief pushed in `cb955e194`; native three-map checks pass ([evidence](history/environment-2026-09/TERRAIN-SURFACE-CHART-CHECKPOINT.md)). Coastal/Saltwind ambient sand marbling is reduced in `c97e20fd2`, with matched native pairs and unchanged scene/texture counts ([evidence](history/environment-2026-09/COASTAL-WORN-GROUND-CANDIDATE.md)); broad town wear remains separate |
| Verdant horizon | User reversed the restoration request: newer low pastoral watershed/layered woodland horizon reinstated and pushed in `139585281`; no broader village/ground/palette prototype was reinstated |
| Coastal/Saltwind blanket village sand | Four existing-channel activity footprints per map replace broad off-road settlement wear in `85f93d809`, with scoped tests in `853c6bc6b`. Both native before/after pairs were personally reviewed; roads/water/terrain heights and other28 masks remain exact ([evidence](history/environment-2026-09/COASTAL-VILLAGE-WEAR-CANDIDATE.md)). Sparse village grass remains separate |
| Standing-grain backface lighting | Published in `85d68decd`: preserve the authored upward crop normals on both card faces instead of reversing them into black bands. Matched native front/back/establishing views were reviewed, three-sweep resource comparisons pass, and the fixed full-frame cost pair passes. Geometry, palettes, alpha and crop placement remain unchanged. [Scoped evidence and limits](history/environment-2026-09/COASTAL-MEADOW-NATIVE-REVIEW.md) |
| Coastal/Saltwind meadow and crop composition | The grass-height candidate remains unpublished. The unequal crop-rhythm candidate at `83e74e4de` and the root-color interpolation experiment at `4ac879eed` both completed matched native captures but were **rejected visually**: their establishing views still read as parallel pegs; darker roots merely add gray stalk columns. Focused tests/typecheck/private builds pass, but these art candidates are not shipped or advanced to performance acceptance. The rejected root-depth receipt is preserved in its branch at `69e37bd58` |
| Mode placement | Shared solo/server safety checkpoint passes all 30 maps × 5 modes on current roads ([evidence](history/environment-2026-09/MATCH-PLACEMENT-CHECKPOINT.md)); road integration must revalidate it |
| Road continuity | The22-map continuity candidate remains unpublished. Local checkpoints `d55bc626f` and `06e84b2e3` now pass the all30-map physical inventory and all30×5-mode placement checks; all22 changed collision shards are freshly captured with lossless packing, leaving eight unchanged. The four-map horizon pilot passes packed terrain-contact/winding checks, but all eight latest matched native views were **rejected visually**: angular, differently shaded road strips still meet implausible outer slopes. Two north Frontier exits are also unresolved. Candidate minimap refresh is underway; the previous five-map native frame-time failure remains held. Only the independent exact-output lookup optimization `d9960ad92` is published |
| Nighttime entry and lights | Final-light-first correction, downward headlight aim and restrained window/streetlamp intensity pushed; matched native closeups and lifecycle checks pass ([entry](history/environment-2026-09/NIGHT-ENTRY-CHECKPOINT.md), [aim](history/environment-2026-09/NIGHT-LIGHT-AIM-CHECKPOINT.md), [intensity](history/environment-2026-09/NIGHT-WORLD-INTENSITY-CHECKPOINT.md)). Covered entry now skips the discarded authored-day PMREM bake: actual native A/B observes two bake returns on baseline versus one selected-night return on the candidate, ready before the first covered frame. [Evidence and limits](history/environment-2026-09/NIGHT-SINGLE-BAKE-REVIEW.md). This is not a measured general loading-speed or memory claim. Service windows glow but are not all spatial lights; flat interiors and unshadowed point-light occlusion remain |
| Ironworks masonry | Foundry-only brick pigment and roof reflection refinements are image-reviewed and published, preserving Copper Mesa and other material buckets. Roof gain uses the existing material uniform, without extra textures. Matched native views and scoped cost comparisons pass with actual timing deltas retained ([evidence](history/environment-2026-09/FOUNDRY-MASONRY-CHECKPOINT.md)). Flat trim and settlement composition remain separate |
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
for the historical failed performance check; the isolated canopy candidate is
still held. The [Verdant scene checkpoint](history/environment-2026-09/VERDANT-SCENE-CHECKPOINT.md) remains
a superseded whole-scene proposal. The user first requested the original
horizon, then explicitly reversed that request after viewing it: "go with your
version." Commit `139585281` therefore restores only the newer low pastoral
horizon from `7997efb42`, not that prototype's other village, ground or palette
changes. Its resource/test alignment and native evidence are in `363b19261`
and `7b91b838b`. The integrated view was checked again at `d6cc60fe3` for the
terrain surface checkpoint. Other 29 horizons were left unchanged; none of
these static views certifies the complete performance or visual-quality goal.

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
| Verdant Fields | Retain the newer low pastoral horizon per the user's latest reversal; keep road, spawn and loading repairs independent of another outland redesign |
| Amberford | Norman / English river-ford market town (round 48): the river SW→NE through a sculpted valley, the stone bridge and the ford, the walled town on the north-bank rise, weir and mill, orchards and hedged fields, the wooded escarpment, the manor park and lake; warm leaf litter against cool water |
| Tarkhan Steppe | Open golden folds, sparse windbreaks and distant farms; avoid enclosing mountains |
| Frontier Basin | Agricultural basin and checkpoint routes; branched gullies and patchy conifer uplands |
| Tidegate Polders | Drainage channels, straight human-made levees, field headlands and pump yards; very low horizon |
| Orchard Valley | Orchard rows follow working terraces; packing courts and village lanes, distinct from wild forest |
| Longleaf Crossing | Logging spur, cut blocks, timber yard and regrowth; visible forest-age variation |
| Highland Reservoir | Pine catchments, exposed reservoir margin, waterworks and service roads |
| Olympus Basin | Rust regolith and mesas under a galaxy sky, a research station of domes, modules, masts and pads (Mars mode, 2026-09-18) |
| Frosthollow | Carpathian winter valley (round 48): a beaded frozen river down a kotlina floor, a linear timber street village on the west terrace with a sawmill yard, a two-armed ridge and saddle pass on the west flank, rolling moraine on the east; fieldstone walls, spruce blocks with cut clearings |
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
2. **Respect the latest Verdant choice:** keep the reinstated newer low pastoral
   horizon. The whole-scene prototype's other changes remain unaccepted; do not
   treat the horizon-only approval as approval for them. Finish road,
   objective/spawn and nighttime-entry corrections independently. Continue the
   broader art work on other map families with fixed native views before
   generalizing it.
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

### Active visual work — 2026-09-09

The current road contact correction closes the exposed edge gaps, but does not
yet make those roads look natural. Its retained eight-image rejection is in
`horizon-outlet-lip-r2.2hdc1S/VISUAL-REVIEW.md` under the local environment
evidence directory. The next road change must address the outer route and
landform together, not merely repaint the strip.

In parallel, two isolated art candidates address larger scene weaknesses:
Coastal grain silhouettes are being rebuilt at physical stalk scale without
the full-height alpha cutouts; Ironworks is getting one rail-served loading
compound composed from existing building donors and existing ground channels.
Neither candidate is image-accepted or published. The broader field/forest,
snow/rock, settlement and all-map rollout work remains open; these candidates
do not narrow the whole-scene visual target.

The shared ground-cover regression's obsolete non-generator signature was
repaired separately in `9fcc26fc9`, without runtime or golden changes. It now
requires actual delegated fit completion before sealing and publication;
seventeen negative controls and the existing executable wall-span lifecycle
test pass. This unblocks validation but is not an artwork acceptance. Native,
build and art CPU batches share the normal FIFO acquisition queue with vehicle
verification; a queued experiment is not a completed test or a release hold.

### Water, contact and intrusive-prop checkpoint — 2026-09-09

- Published `ccfc44730`: oversized pass-through black coal domes become small,
  matte, supported stockpiles with synchronized client/server collision on the
  four affected rail/industrial maps. Native before/after reviewed; fewer coal
  triangles, existing material family, no extra texture/draw family.
- Published `f363fbd5e`: inverted woody-root cones are turned outward and seated
  at the ground, removing blunt lateral tabs. Same geometry/storage/instances;
  a small lower-trunk correction, not the complete tree-variety request.
- Water/contact is published through `1db45b0ad` after seven focused
  tests, TS7/build, five native material views and normal Coastal dry-to-water
  driving followed by clean Garage return. Coast/lake/river/marsh sheets use
  existing textures and pooled wakes; sand/snow get their own low contact puffs.
  Exact added cost is one water draw and bounded geometry/sampler buffers, not
  zero added work. No physical-iPad or no-regression certificate is implied.
  See `SHALLOW-WATER-CONTACT.md` for raw timing limitations and ownership proof.
- Broader shoreline debris/plant/farm composition, rejected Coastal crop and
  Foundry art drafts, road-outlet composition and full-family rollout remain
  open. These are separate from the accepted contact and intrusive-prop fixes.

### River-bank plant checkpoint — 2026-09-09

The Autumn/Delta/Mangrove reed correction replaces square posts with thin,
tapered stems, seats each root in its own bed and attaches existing heads.
Actual Autumn before/after images were independently reviewed; counts, RNG,
collision and final GPU geometry budgets stay unchanged. This is a small
contact/shape correction, not a new population or whole-bank beautification.
See `history/environment-2026-09/RIVER-REED-CONTACT-CANDIDATE.md` for evidence and limits.

The Coastal/Fjord driftwood experiment remains local and rejected: its native
close-up reads as a thin notched strip with stretched grain, not natural wood.
It is excluded from the reed release. A separate closed-log prototype is saved
locally at `0a2452f1b`, also unshipped: its first contact method added 7,317–7,892
terrain queries per tested kit; its cheaper 16/24-query method failed the
unchanged contact check at −0.07892 m. Neither draft is part of the crop release.
Existing farm, boat, wreck and tree families still need composition/variety
improvements; larger populations are not a substitute for better existing forms.

Remaining verification is explicit: sun-facing river/marsh appearance and
constrained-device costs are not certified by the Coastal driving evidence.
A separate regression audit found the Mangrove distant-stem cap no longer
contained by its seam-corrected crown (variant 0, seed 2001). The isolated repair
at `5c6a6f852` fits the existing cap into its actual crown without extra geometry
or per-frame work. All46 seeded variants, integrated reed/contact tests, TS7 and
production build pass; four native images were reviewed. The visual difference
is subtle and joins partly overlap other foliage. See
`history/environment-2026-09/MANGROVE-STEM-CONTACT-CHECKPOINT.md` for exact evidence and cost limitations.
This was pre-existing, not a reed change; the historical failed full-suite
boundary remains recorded separately from the repaired focused checks.

### Crop identity checkpoint — 2026-09-09

`3bfd72f90` adds two opt-in crop forms without changing field placement or
geometry: broken golden harvest stubble for Autumn and narrower green upright
crops for Delta. All eight matched native images were reviewed; the old pale
card ranks are reduced, but grass still obscures Autumn's low stubble and
Delta retains regular dotted rows at distance. The other 28 painters are
unchanged. Focused integration tests, TS7 and public build pass. See
`history/environment-2026-09/CROP-BIOME-IDENTITY-CHECKPOINT.md` for source pins, earlier failures, exact
resource contracts and the remaining full-frame/mobile performance limits.

### Grass and palm shape checkpoint — 2026-09-09

`902d9882f` narrows the existing grass blades and aligns near/far palm segments
with their full authored lean. Root and an independent reviewer viewed all
eight matched native Autumn/Delta images: grass is finer, and the obvious
stepped palm joints become continuous stems. Grass geometry, instances,
allocated buffers, materials and measured draw submissions stay exact.
Eleven focused tests, TS7, scoped quality/Doctor and public build pass.
The failed first native acquisition and its source-bound readiness correction
are preserved in `history/environment-2026-09/GRASS-PALM-SHAPE-CHECKPOINT.md`, together with raw CPU timing
and remaining motion/mobile/full-frame limits. More ground and regular crop
rows now show through; broad forest, water and settlement composition remain
unfinished. This is not a whole-map or zero-regression certificate.

### Autumn palette checkpoint — 2026-09-09

Autumn's existing tree species now use distinct muted copper, gold, straw and
olive families. Four matched native close/wide images were reviewed; the
scarlet/orange uniformity is reduced with exact geometry, alpha, instance,
resource-storage and observed foliage-submission counts. Focused tests, TS7,
quality/Doctor and public builds pass, including current-main integration.
See `history/environment-2026-09/AUTUMN-SEASONAL-PALETTE-CANDIDATE.md` for source/evidence and cost limits.
This is not a bush-shape or full-scene acceptance. The separate tiered bush
experiment is rejected: it creates repeated cactus/topiary silhouettes and
remains local. Farm-prop relationships and shoreline planting remain open.

### Vista pass — 2026-09-19

Owner (round 24, with a screenshot of a flat green backdrop under grey low-poly peaks meeting a brown
battlefield): "no see how these are randomly just low texture and no transition. the stuff around map like
mountains needs to be so much better, and our fake trees need to look a lot better too and properly connect.
consider this a triple AAA pass … we want to be a lot better than the august 30th version … like the actual
world of tanks". Three things changed, all in `world/maps/horizon.ts`, `world/horizonVista.ts`,
`world/terrain.ts` and `world/vegetation.ts` (see ARCHITECTURE.md §3.1.3):

- **Transition.** The ring's skirt is seated on the battlefield's edge height and gradient, the rows up to the
  first ridge (700–720 m out) render with the terrain's own splat material and grass tint, the splat mask
  fades outside the playable square, and the foothill band is subdivided with ridged relief — the rim reads as
  the same hillside continuing, not a step onto a green wall.
- **Beyond.** The vista material paints meadow → forest stands → scree → rock strata → snow per fragment from
  world-anchored tiles and noise, with a bump normal, sun and sky lighting and per-fragment haze; mesa strata
  are stronger, alpine keeps its snow and peak rock. Every map keeps its authored palette through tint ratios.
- **Trees.** The ring forest is instanced from the same far-LOD palettes and silhouettes as the in-map trees
  (sRGB HSL, sphere normals, jittered tiers and lobes, tufts), follows each map's rim species mix, stands
  where the shader paints stands, casts shadows in its rich near class and hazes per fragment (the earlier
  per-instance fog tint went magenta on green crowns). The in-map far-LOD crowns got darker, more saturated
  palettes, 4–5 ragged nine-segment pine tiers and a metre-scale mottle / rim-darkening hook.

Verified with `.qa-dev/horizon-shots.mjs` captures (verdant, frontier, reservoir, alpine, winter: rim, along-rim,
corner and mid views) against the 1049e4e and 0f45545b9 (Aug 30) references; the horizon receipts
(`horizonResources`, `horizonMesaSurface`, `horizonAutumnGround`, `autumnHorizonSeam`, `copperQuarrySurface`,
`titanGorgeHorizon`, `redrockCanyonHorizon`) were re-established at this commit.

### Outland follow-up — 2026-09-21 (round 32)

Owner: "redrock still has the noticeable texture/shadow/quality loss beyond the map borders" and "on nighttime
mode, the horizons seem to glow in the back". Audited with `.qa-dev/map-edge-audit.mjs --maps=badlands`
(Redrock Divide is the `badlands` catalog id) and `.qa-dev/horizon-shots.mjs --night=1`:

- **Objects.** Nothing stood past the playable edge on the rock and sand maps — the ground litter is a ±40 m
  camera ring, props stop at ±430 m, and the ring forest only serves wooded rims — so Redrock's outland read as a
  bare, shadowless sheet. `world/horizonRockfield.ts` strews instanced boulders over the near ring faces (dense on
  the terrain-material rim band, sparse on the first ranges, clustered into outcrops, at least 3 m past the seam,
  slopes under 0.95, a square-metric reach of 900 m because the near rows follow the playable square); the near
  class casts and receives shadows like the battlefield's own rocks. Density per map through
  `horizon.outlandRocks` (defaults: mesa style and sand grounds 1, bare treelines 0.55, wooded rings 0).
- **Moiré.** The flat rim bands seen at grazing angles resolved the near detail tiles into a regular carpet the
  relief-rich battlefield never shows; `terrain.ts` treats the outland as far ground from 40 m past the edge.
- **Night.** The vista haze mixed up to 94 % of the far ring toward a fog tint captured from the DAY fog at build
  time, so the night runtime's ×0.20 material dim never reached the skyline. The fragment reads the live dim as the
  ratio of the material colour to its authored day value (`uVDayDiffuse`) and applies it to the surface and the
  haze tint alike.

Receipts: `horizonRockfield.selftest.mjs` (primitive, synthetic ring, Redrock census, wooded maps bare, eviction
ownership), `horizonResources` (bare-backdrop loop passes `outlandRocks: 0`; haze pin carries the dim).


### Walls pass — 2026-09-22 (round 35)

What landed for the walls (details in the round-35 commit): on the six landform-gated maps the terrain material's
landform weight past the playable square follows the ring's own slope instead of the clamped edge texel (steep ring
faces are mesa rock with their strata; Titan's orange and Skybridge's beige slip faces become the same rock as their
in-map cliffs); round 32's far-ground rule reaches only near-flat outland floors; the near variant holds to twice the
distance on steep faces (180–660 m); the far-cliff path gains ~90 m rock masses, a ~14 m bed-ledge ladder with lit
shelves and shaded seams (full on bedded maps, half elsewhere) and the coarse normal at wall strength; the vista
fragment's ranges get faulted beds with laminae, shelves and seams, gullies, varnish, bleached shelf tops, talus
aprons, moss on rolling ledges and cavity shading, with the broad relief shading to the far cascades; the ring's rock
and scree tints come from the battlefield's rock layer. Verified with `.qa-dev/wall-probe.mjs` before/after captures
(badlands, copper_mesa, verdant, alpine, desert, titan_gorge, caldera, skybridge, mars). Redrock's own outland walls
remain smooth analytic ramps (`redrockCanyon.ts` is shared by the playable ground and the ring, and the Redrock horizon
receipt pins every outland row to it exactly), so their remaining flatness is geometry, not material — a round-36 item
alongside the border geography.

### Border geography — 2026-09-22 (round 36)

The battlefield's height function clamps to ±512 m, so the ring used to seat its skirt on the edge height plus its
gradient and begin the authored ring relief one row later — the geology changed at the seam. `terrain.ts` now
exposes `getOutlandHeightAt(x, z)`, the same composition as the playable height for a point outside the square
(hill noise at full weight, dunes, mesas, landforms, the rim lift; no roads, corridors, villages, lakes, pads or
micro-terrain), and `horizon.ts` seats every foothill row on it: the terrain's edge height continued by its gradient
hands over to the map's geology within 90 m and the authored ring relief takes over between 60 and 380 m past the
edge. Redrock keeps its shared analytic canyon and Autumn its own seam. Verified with wall-probe before/after
captures on verdant, steppe, frontier, copper_mesa, alpine and desert (dunes run on as dunes, plains stay plains, the
ring forest re-stands on the continued ground). Still open from the audit's check 13: only Coastal declares a sea
aperture, so the fjord's water meets a ring shore and the other wet maps' water is inland by design.

### Skyline and aerial perspective — 2026-09-22 (round 37)

Check 5 of the program ("terrain slightly darker than the sky behind it") failed on the arid maps in the 31-map audit:
median ground/sky luminance across the detected skyline (a `.qa-dev` skyline metric over the wall-probe captures) read
oasis 2.43, desert 2.28, Redrock 1.59, Copper Mesa 1.31, Alpine 1.40 against 0.7–0.9 on the temperate maps. Three
things were measured before anything landed:

- **The vista's own haze was not the cause.** Cutting `vistaHaze` to a 40 % share changed the metric by under 0.02.
- **A sky-relative luminance ceiling in the ring materials is the wrong layer.** Capping the vista and the terrain
  rim bands to 0.9 × the horizon-sky luminance (a `fogColor` read under `USE_FOG`; a live probe confirmed the code
  compiled and the fog was on) moved Copper Mesa's far band by 7 display luma and the desert's by 3, because the far
  pixel's brightness is decided afterwards by the post aerial pass. The experiment is kept on a branch, not landed.
- **The aerial pass converged every far pixel toward the HORIZON haze.** Its scatter-in target was one colour per
  direction — the sky-sampled 0° horizon, warm toward the sun and cool away — and sky pixels are skipped, so a ridge
  standing 8–20° up settled at the horizon band's brightness against a sky the model already darkens steeply
  (desert: 40 display luma at +4° against a horizon band near 140; the sampled +16° / 0° luminance ratio is 0.22).

What landed: `engine/sky.ts` reads the sky probe's upper half in one readback (row 8 stays the horizon average the
fog colour comes from, row 14 is the sky about 16° up) and retains the two rows' luminance ratio beside the horizon
colour in the same bounded cache (`sampleHorizonElevationFalloff`, no second render); `applyFog` publishes it and
`engine/post.ts` scales the scatter-in target along the view ray's elevation (full falloff by 0.28 ≈ 16°; the warm
lobe toward the sun takes half of it). The desert sky preset's Rayleigh rises 0.55 → 0.85 (Oasis inherits): at 0.55
the anti-solar sky was inky right down to the ridges, which no far-land treatment can honestly satisfy — a sunlit
pale range is brighter than a deep-blue sky in reality too — while the real reference carries a pale dusty horizon.

Measured (same cameras, seed and tier; skyline metric, lower is better; sky luma at +4° above the skyline):

| Map | Before | After | Note |
|---|---|---|---|
| desert (anti-solar) | 2.28, sky 37 | 1.39, sky 72 | Rayleigh + elevation target |
| oasis (anti-solar) | 2.43, sky 26 | 1.43, sky 41 | inherits the desert sky |
| copper_mesa (far mesas) | 1.31 | 1.36 | far band 168 → 154 luma; the walls' strata read again instead of a pink sheet |
| badlands | 1.59 | 1.58 | ridge tops sit in thin air (height falloff) and keep their own colour |
| alpine (centre) | 1.40 | 1.61 | far forested flanks darken under the snow crests; the crests stay bright, as snow does |
| verdant / steppe / winter | 0.77 / 0.88 / 0.99 | 0.76 / 0.87 / 0.95 | unchanged within noise |

Still open for check 5: the ridge TOPS on the arid maps remain paler than the deep sky because the height falloff of
the aerial pass (thinner air above the camera) leaves them their own sunlit colour; whether to lower that falloff on
the arid presets is a judgement for the next skyline pass, together with a per-map sky elevation profile sampled at
more than one row.

### Enclosed Redrock and the far-haze ceilings — 2026-09-22 (round 39)

Owner: "it still seems too disappear-y. also in the redrock divide you can literally still see the cutoff - make the
divide an enclosed area instead of being in a 'gap'".

- **Redrock Divide is a basin.** The canyon used to run out of the square as an open corridor to the horizon, so from
  the rim the eye followed the floor to the seam and the outland read as a gap with a visible cutoff. The shared
  drainage shape (`world/redrockCanyon.ts`, used by the playable ground and the ring alike) now raises a headwall
  across both mouths with the flanks' own two-tier profile — a low bench, then the steep upper face, the west and east
  plateau heights blended across the canyon's width, the wall line meandering ±27 m — starting 612 m from the map
  centre (beyond the ring's first row past the seam, so the floor stays flat across the seam) and reaching the plateau
  by ~800 m. Inside ±512 m the shape is exactly unchanged. Receipts: `redrockCanyonHorizon` protects the enclosed
  design with the open-mouth ring as its negative control; `badlandsRelief` pins the flat floor to the edge, the
  climbing mouths and the exact playable datum. Verified with wall-probe bird, rim, corner and skyline captures.
- **The far ranges keep a third of their own colour.** Three layers hazed them: the vista material mixed up to 94 %
  toward the fog tint, the scene fog added its share, and the post aerial pass's extinction reached 0.88 at 1 km and
  1.0 by 1.5 km with scatter-in up to 0.7. The vista's haze is now the smallest layer (0.52 at the far cascade, capped
  at 0.62) and the aerial pass caps extinction at 0.60 and scatter-in at 0.55; both ceilings bite only past ~650 m, so
  the midfield law is unchanged. A/B on copper_mesa, verdant, alpine, steppe and badlands: the far ranges keep more of
  their local colour and shading; whether this is enough against the owner's "disappear-y" read is the next eye test.

### Water past the square — 2026-09-22 (round 40)

Check 13 ("water at the edge: same level and shader beyond") failed on every wet map. Coastal's bay stopped at the red
line in a straight cut and the ring beyond it was a neutral grey plane; Saltwind's bay was clipped by the boundary
with a beach and hills where the open sea should be, and its three overlapping circle basins rasterised into
straight-edged rectangles with sand strips between them.

What changed. `world/edgeWater.ts` derives a sea opening wherever a run of flattened water 40 m or longer reaches
within 20 m of the square edge (the bay's shore ramps dry the last metres, so the scan sits inside the fringe) —
azimuth, width with tapering shoulders, and the floor height — and keeps a map's authored aperture where the two
overlap. Coastal keeps its authored east bay; Saltwind derives a 63° west opening; dry maps derive nothing and their
rings are byte-identical. The horizon ring lowers each opening to the water floor, marks its faces marine, and hands
every marine face — near band or far range — to the TERRAIN material, which renders them through the square's own
open-water path: the mask channel past the edge starts at the wetness the square carries at its edge (a turquoise
shoal stays a shoal) and deepens to open sea over 320 m; marine vertices face up (the analytic hill normals had kept
the flat apron 40 % darker); the round-32 far-floor rule no longer flattens water. The shallow-water sheet gains an
apron fan over each opening from 12 m inside the edge to 1400 m out, sharing the sheet material so fresnel, glitter
and the deep colour continue, with its wetness continuing the edge texel the same way. Saltwind's bay is one
authored 16-station contour with a 12 m wet shelf (a metric shelf width for large bays: the default 0.80-of-radius
waterline put a 30–50 m shelf of water-level sand in front of every jetty), open to the west edge, its two harbour
landings on stations whose beached boats rest on a shallow bank at every battle seed.

Measured straight down onto the seam (camera 260 m above the edge, `sea-e-down` / `sea-w-down`): Coastal's apron
was 0.63× the square's water luma with a 35-luma column step at the seam; it is now 1.25× with an 11-luma step and
the shoal pattern crosses the boundary. Saltwind: 0.35× → 0.63× (the open sea deepens beyond the shallow bay by
design), step 21 → 5. Oblique (`sea-e-mid`, camera 12 m up looking out): Coastal apron band 153 → 171 luma against
a square band of 163; Saltwind's apron band went from a 161-luma sand ring to 123 of sea against a 105 bay.

Debugging notes worth keeping: a baked ring colour can never match the square's sea (two renderers, and the in-square
colour is map-dependent); the vista program divides the vertex colour out for absolute tints, so marine faces must
bypass it; the terrain material's far-floor rule and its analytic normals both act on a lowered apron; and the last
hard step was the apron fan's winding — a double-sided water material lit it from below. The straight-down view with
layers toggled (`.qa-dev/apron-layers-probe.mjs`) found each of these where oblique views only showed "still a step".

### Sky light on shaded steep faces — 2026-09-23 (round 42)

**Symptom (checks 4, 11).** Caldera's inner east wall — 300 m away, turned from a sun 22° up in the east-south-east —
rendered at 6.6 display luma (rgb 3, 7, 12) under a 216-luma hazy sky: 3 % of the sky, a hole in the picture. The
Skybridge slope behind the south-west rim read 21. Real shaded rock under a bright sky reads 8–25 % of the sky's
brightness, with the sky's hue.

**Cause.** The terrain material is lit by Three's lights: the CSM sun (nothing on a face turned from it) plus the
HemisphereLight, whose sky and ground colours are engine constants scaled by the map's `hemiIntensity` (Caldera 0.42,
Skybridge 0.31). A vertical face takes half sky, half ground of that fixed colour — it never follows the rendered sky,
which on Caldera is a bright turbid white. With basalt albedo (≈ 0.07 linear) the product lands below the display's
black. The far ranges never had the problem: the vista fragment carries its own `uVAmbient · (0.55 + 0.45 · n.y)`
floor, so the near band (terrain material, out to the first ridge) and the ranges disagreed at the 700 m hand-over too.

**Fix (`world/terrain.ts`).** `gWallSky = smoothstep(0.12, 0.50, 1 − n.y) · (1 − smoothstep(−0.08, 0.30, n · sun))`
in splatCompute (slope from ~28° to 60°, times how far the face turns from the sun; the sun vector is the one the
vista ring shades with, `skySunDirection(cfg.sky)`), and after `lights_fragment_end`:
`indirectDiffuse += fogColor · uWallSkyLift · gWallSky · BRDF_Lambert(albedo)`. The fog colour is the horizon sky
average the sky probe publishes every frame (round 37), so the light follows the rendered sky — bright hazy sky,
brighter shaded walls; a dim night sky, next to nothing — and the material's albedo keeps basalt dark and limestone
pale. Gain 7.0 (`splat.wallSkyLift` per map); program cache key v32.

**Measured (wall-probe, same cameras, display luma).** Caldera e-wall-300 shaded wall 6.6 → 16.7 (sky 216; 3.1 % →
7.7 %), lit slope w-wall-mid 51.4 → 51.5; Skybridge e-wall-300 shaded slope 21.2 → 34.8 (sky 214), lit n-wall-200
61.8 → 61.8; Verdant shaded snow hill 53.0 → 64.4 (bluer: b 58 → 77); Mars ridges ± 1; Badlands lit walls 211 → 211;
Steppe far ground 168 → 168. Gains tried: 2.0 with a 45°-onset slope weight moved Caldera by one luma (the audit's
"shaded slopes" are 30–45° hillsides, not cliffs); 6.0 → 15.6; 7.0 → 16.7.

**Receipts.** `wallSkyLight` (new: weight formula, indirect hook under USE_FOG, gain band and per-map override, cache
key, the shared sun vector), `terrainMaterialOwnership` (two uniforms declared, cache key v32), `sourcedTerrainPreparation`
(the material call hands over the map sun), every terrain-source receipt green.

**Still open under 4/11.** Flat ground in cast shadow still takes the hemisphere preset colour rather than the rendered
sky (check 11's second half); Mars' black is the far vista ring's night side, a vista item.

### Local wind field for the dune ripples — 2026-09-23 (round 43)

**Symptom (check 8).** On the desert and Oasis the dune flats printed dark parallel bands of one heading and one
spacing at every distance — corduroy on the mid-field, tyre-track diagonals on the Oasis slopes. Every ripple and
bedform wave in the terrain shader's sand branch (the ~2 m ripples, the ~11 m dune-face wave, the ~26 m albedo
bedform) was phase-locked to ONE authored wind vector (`splat.rippleDir`), with only a phase wobble from noise.

**Fix (`world/terrain.ts`, sand-ripple branch).** A local wind field: the authored direction rotates ±25° per ~400 m
cell and ±10° per ~90 m cell (two noise taps), the wavelength stretches ±25 % per ~250 m cell (one tap), and all three
waves take the rotated wind and the scaled phase; the albedo bedform band eases to half past 320 m so the far basin
reads as dune trains fading with distance. The authored direction stays the mean wind; the near-field grain, the shore
gate (`rippleShoreOnly`) and the steep-face detail are unchanged. Three texture fetches added, all inside the sand
branch (fetch census 85 → 88); program cache key v33.

**Measured (`stripe-metric.py`: windowed FFT of the detrended luminance in a fixed region; share of power in the
strongest 1 % of bins and the anisotropy of the strongest orientation — a printed stripe field concentrates power).**
Desert w-wall-mid mid-field (900,480,1500,700): top-1 % share 0.54 → 0.22, anisotropy 2.81 → 1.06, luminance std
18.0 → 18.0; desert bird-w mid (200,560,1300,700): anisotropy 2.50 → 1.16; Oasis w-wall-mid dune face
(200,520,1300,800): 0.76 → 0.61; Oasis centre-far 0.65 → 0.60; desert near field (200,560,700,720) 0.67 → 0.62 (the
2 m grain and the road stay). By eye: the long dark streaks are gone from both maps, the sand keeps its grain.

**Receipts.** `terrainMaterialOwnership` / `terrainSurfaceDetail` / `terrainWornDirt` (fetch census +3 with its dated
note; cache key v33 and its negative control), `wallSkyLight` (key), every terrain-source receipt green.

**Still open under 8.** Mars' ring beds (the vista fragment's bed stripes, a different shader); the desert's far
mesas' remaining strata repeat is a vista item too.

### Winter and Whiteout skylines — 2026-09-23 (round 44, investigation, no code change)

**Symptom (checks 3, 5).** The audit rated Winter and Whiteout "ring is a white sheet; skyline nearly invisible". The
skyline metric (ground/sky luma 6–20 px below/above the skyline edge) reads Winter 0.92–1.06 and Whiteout 0.94–1.01;
Railyard 0.71–0.90, Foundry 0.49–0.69 and Verdant 0.67–0.96 already sit below the sky.

**What did not move the metric (each measured on the same cameras).** The vista ring's snow colour 0xdfe7f1 →
0xcdd7e4 (−8 % L) with a ±14 % wind-scour field, snow-dusted stands above the snowline and a stronger sky-blue on shaded
snow: ±0.01. The vista haze target at 93 % of the horizon colour instead of 100 %: ±0.01. The post aerial pass's
extinction ceiling 0.60 → 0.35: ±0.01. Winter's sun 1.35 → 0.95 with hemisphere 0.74 → 0.64 and Whiteout's sun 2.75 →
1.9: the near snow moved 202.7 → 201.2 display luma against a 204 sky (Whiteout 168 → 162 against 158).

**Cause.** The skyline in these views is the near rim band (terrain material, 200–400 m; little haze). Snow albedo
(`grassTone` L 0.62 + 0.38·l) lit by sun plus hemisphere renders brighter in linear light than the sky's horizon band,
which the sky model caps (HORIZON_LUM_CAP 0.45, HAZE_MAX_LUM 0.50 pre-ACES) — and both then sit on the tonemapper's
shoulder, where a 30 % change in light moves the display value by under 1 %. No ring, haze or aerial change can create a
skyline there; the linear ratio snow/sky must drop below ~0.85 and the pair must leave the shoulder.

**Proposal (owner call — a re-grade of two maps' look).** Snowpack tone L 0.62 → ~0.52 (+0.32·l), Winter postExposure
0.94 → ~0.86 and Whiteout likewise, or raise the sky's horizon cap for overcast presets so the sky is the brightest
surface as it is in nature. Acceptance: skyline metric 0.80–0.90 on sky-w / sky-s / centre-far, the battlefield snow
still white by eye, tanks and HUD unchanged. (Closed by round 70: the law authored on the sourced snow that renders,
exposure 0.83; the band under round 68's overcast sky.)

### Steep-slope layer authoring on Monsoon and Fjord — 2026-09-23 (round 45)

**Symptom (checks 3, 15).** Monsoon's south-west corner (the owner's 112 m shot) was a smooth bare brown mound in a lush
map; Fjord's corner cliffs read as plaster beside turf (display luma 100 at saturation 0.21, next to a sky of 98).

**Method.** `.qa-dev/layer-flag-probe.mjs` (a wall-probe variant) recompiles the terrain splat material with one flat
colour per layer — grass yellow, dirt cyan, rock magenta, mud blue — and re-captures the view. The whole mound came out
magenta: the ROCK layer chosen by slope (`fR`, from ~25°), which Monsoon's sourced plan authors as the desaturated
'dirt' set (chosen once to avoid Rock058's streaks). A first attempt that only shifted the slope thresholds moved the
mound's hue by 4°: its face is steeper than 45°, so the layer's own look had to change too. The Fjord cliff is the
same layer with the 'rock' set under a 1.12–1.22 brightening tint; the per-map `rockTone` only tints the procedural
fallback, so editing it changed nothing measurable (a lesson worth its own line).

**Fix.** `world/terrain.ts`: `splat.slopeGrassHold` (uniform `uSlopeGrassHold`, default 0) is subtracted from the slope
before every grass→rock threshold; Monsoon authors 0.10 (rock from ~38°, full at ~50°). `world/sourcedTextures.ts`:
Monsoon's R layer is the 'grass' set at [0.40, 0.50, 0.30] (dark wet grass on the cut banks), Fjord's R tint is
[0.60, 0.66, 0.74] (blue-grey gneiss). Program cache key v34.

**Measured (same cameras).** Monsoon mound (sw-corner-close 200,300,900,700): luma 95.4 → 66.9, rgb 120/92/58 →
68/71/22, hue 33° → 64° against a forest floor at 66°; the dirt-set tint alone reached 75 / hue 41° (still mud).
Fjord cliff (w-wall-mid 500,480,1300,700): 100.0 → 56.8, saturation 0.21 → 0.26, hue 87° → 108° (mossy grey); sky
unchanged at 98.

**Receipts.** `terrainMaterialOwnership` (uniform list, cache key v34 and its negative control), `terrainWornDirt` and
`wallSkyLight` (key), `badlandsRelief` (the Monsoon splat block projected out of the byte digest, like the round-40
blocks), `mangroveWaterPalette` and `villageWear` re-captured (map-config digests), every terrain-source receipt green.

**Still open.** Fjord's smooth green cone (check 3, vista) and Titan's marbled near walls (the round-35 wall texture
reads as flowing water at 300 m).

### Reactive water — 2026-09-23 (round 46, water pass 8)

**Symptom (owner: "when the tank is in and rolling it looks so jank and not reactive — literally a static PNG following
you").** Water pass 7 built the wake in the hull frame: bow wave, arms, transverse waves and a wash lane were all
functions of (along, across) from the hull, so the whole pattern translated rigidly with the vehicle, and the FX layer
stamped ring decals along the tracks on top. Nothing stayed where the water had been disturbed.

**Fix.** `world/waterRipples.ts`: a world-anchored shallow-water field on the GPU — one RGBA16F texture (height, flow,
foam) over a 192 m window (512 texels, 0.375 m) around the chase focus, integrated at a fixed 1/60 s (≤ 3 substeps a
frame) with the linear shallow-water equations: momentum −g ∇(h + hull pressure), continuity −H ∇·u (H = 2 m, c =
4.4 m/s, so a tank at 6–10 m/s runs supercritical and throws a V wake), damping 0.70/s, a 4 % odd-even diffusion. A
hull is a moving pressure patch (its draft, 0.36 m at full strength, over the rounded footprint): standing it presses a
dimple the surface holds; moving it radiates the bow mound, diverging arms and stern train on its own. The tracks inject
a decaying, spreading foam field (0.36/s, hash clots) that stays where it was churned; shell splashes are impulses. The
texture is a torus over world space (texel = fract(world / 192)), so the mapping never depends on the anchor and the
seam sits at the window's far edge where every step fades the state to rest. Depth follows the sheet's own wetness
(crests slow and bend toward the bank, the bank absorbs). `world/shallowWater.ts` (program key v11) reads the height
gradient for its normals (slope ×1.6, capped at a breaking face), the foam for its whitecaps, and switches the
hull-frame pattern off for every slot inside the window (contact line kept); slots beyond it and the mobile tier keep
the procedural wake. `fx/effects.ts` drops its water ring prints where the field is active and lands each splash in
the field. Frame order: the field steps inside `world.update` (before lighting and post) on the previous frame's
published disturbances.

**Verified (`.qa-dev/water-probe.mjs`, Reservoir and Coastal, T-90M capped at 7 m/s).** Before: a white slab lane and
two dark arms fixed to the hull (a1 captures). After: a V wake with diverging crests, a streaky churn trail that the
tank leaves behind, rings spreading from the hull when it stops (stop-4.5 s), the trail still lying along the path
from a fixed shore camera. Tuning rounds b3→b8: foam gain 2.2 → 0.8, damping 0.55 → 0.70, draft 0.42 → 0.36,
normal gain 2.4 → 1.6 with a 0.45 slope cap (the first pass read as black-and-white zebra bands from above).

**Receipts.** `waterRipples.selftest` (gates, targets, step shader form, packing, fixed-step accumulator, renderer
restore, sheet handshake, world wiring), `shallowWater.selftest` (new uniforms, window logic, key v11), the
101-receipt sweep of everything that reads terrain/map/effects/shallowWater sources green.

**Still open.** Impulses from tank destruction in water; a heavier wake for the amphibious IFVs (their draft is the
same 0.36 m today); the window is one square per battle (a second field for spectator/killcam cameras far from the
player would need its own anchor).
### Ground palettes on the arid and ruined maps — 2026-09-23 (round 47)

**Symptom (checks 3, 8, 15; owner: "the ground patterns are too black" on Sirocco Wadi, Titan Gorge, Skybridge Chasm,
Sunscar Oasis and Olympus Basin).** Titan's canyon floor rendered as green photo turf under a red-rock sky, its mesa
walls as grey-lavender marble (display rgb 116/104/109, hue 337°, saturation 0.10) and the knoll below the compound as a
blue-black blotch (shaded box 47 display luma); Skybridge the same at 35, walls at hue 280° / saturation 0.07. Mars'
near strata sat at 97 with the shaded wall foot at 44. The desert's SUNLIT dune faces carried near-black contour
swirls (in-box p2 84 against a median of 186); Oasis' shaded corner face the same at p2 54 / median 123.

**Cause.** `world/sourcedTextures.ts resolveSourcedTerrainPalette` falls through to 'verdant' for any map without a
TERRAIN_PLAN row or `splat.sourcedPalette`. titan_gorge, skybridge, ruinspires and blackglass were the only four with
neither, so the asynchronous photo-set swap replaced their authored ground with Verdant's sets — tinted
Grass004/Ground071 and RAW Rock058 (0.30 sRGB × AO, the darkest set in the library) as the R layer, which on the two
canyon maps overwrote the procedural sandstone strata (`splat.sandstone`) and made their `rockTone` dead code. The
receipt pinned MAP_IDS 16–19 → 'verdant', encoding the bug. Mars' black is its own procedural strata (midpoint 0.40)
under the dimmest key in the game. The desert's and Oasis' bands are neither: the round-45 layer-flag probe shows them
as the D "worn sand" mask's contour-following blend zones on the steep ring faces, and with flat flag colours the D
areas still render 9–15 % darker than the colours alone explain (D/G 0.73 on the desert, 0.68 on Oasis, against 0.80)
— a darkening rides the D path in the sand branch, and it does not answer to fill.

**Fix.** Four TERRAIN_PLAN rows registered against the measured photo-set means (sand 0.79/0.71/0.57, grass
0.31/0.35/0.15, dirt 0.43/0.34/0.25, Rock058 0.28/0.31/0.33): titan_gorge (beige-ochre sand G/D, `R: null` so the strata
return), skybridge (red-orange sand, `R: null`), ruinspires (ash-muted turf, grey-brown dust, mid-grey lifted rock),
blackglass (the Caldera lift recipe in the map's cool register, lift 0.05 on every layer) — and an explicit
`splat.sourcedPalette` on all four map files. Skybridge's tone floors (0.21/0.24) and tintB (0.88/0.78/0.75), Titan's
tintB (0.90/0.82/0.78) and Mars' tintB were raised as the survey asked; Mars' strata midpoint 0.40 → 0.48. Desert
`hemiIntensity` 0.20 → 0.28 (effective 0.283 → 0.397); `envIntensity` stays 0.16 — `engine/sky.ts` clamps
`environmentIntensity` to 0.21, so the proposed 0.19 renders identically (Oasis, which inherits it, moved 0.000).

**Measured (wall-probe, same cameras, display luma; boxes in the round-47a report).** Titan canyon-in shaded knoll
47 → 93, wall 108 → 131 at hue 337° → 7° (saturation 0.10 → 0.22), ground p5 25.5 → 61.4; sw-corner-close shaded
84 → 151. Skybridge canyon-in shaded 35 → 56, wall hue 280° → 0°; sw-corner-close shaded 52 → 99; w-wall-mid 61 → 88.
Ruinspires shaded corner face 40 → 67, other views +4..21 %. Blackglass ±5 % (its authored register is dark and cool;
matched, not lifted). Mars near strata 97 → 116 at the same 13° hue, shaded 44 → 47 (canyon-in), 48 → 60 (sw-corner),
98 → 108 (w-wall-mid), floor unchanged 100.4 → 100.4. Titan's and Skybridge's LIT boxes rose 27–114 %: the layer family
changed from green turf to sand, which is the fix, not a lighting drift — the ±8 % lit band applies to the two later
steps. Those steps measured: the tintB/tone changes moved Titan and Skybridge by +0.02..0.11 mean luma, i.e. nothing —
the meadow macro tints are gated off the dirt, steep and sand paths these maps render through (a dead lever, as
`rockTone` was under a sourced R). Desert hemi: true shade rose (canyon-in darkest 1 % / 5 % of the ground
+10.7 % / +8.1 %), lit sand +0.1..0.6 % — inside the +5 % band — while the contour bands moved only +2..4 % (dark-band
share 4.8 → 4.5 %).

**Receipts.** `sourcedTextures` (routing table: a deliberate route for every map after the legacy sixteen, an own row
for all twenty legacy ids, only an unknown id → verdant, Titan/Skybridge in the sandstone-not-overwritten loop, both
cities route every layer, Blackglass keeps the lift floor on every albedo byte with Ruinspires as the negative
control); `sourcedTerrainPreparation`, `terrainSandCoverage`, `mapQuality`, `mapIntegration`, `randomBattleMaps`,
`terrainProjection`, `terrainMaterialOwnership`, `wallSkyLight`, `terrainWornDirt`, `worldNightLighting`,
`titanGorgeHorizon`, `horizonMesaSurface`, `horizonMesaTexture`, `horizonResources`, `horizonRockfield`,
`copperQuarrySurface` green. `badlandsRelief` (map-source byte projection: ruinspires, blackglass, titanGorge, skybridge,
desert), `villageWear` (FROZEN configs) and `mangroveWaterPalette` (other29) move — integrator re-pin.

**Still open.** The desert/Oasis contour bands — the D "worn" mask on steep sand faces and the darkening that rides its
path in the sand branch (`world/terrain.ts`) — are a shader item, not a palette; Oasis at a 22° sun is the worst case.
Mars' far wall foot (the vista side) stays the darkest thing in frame. Titan's floor now reads a bright ochre
(canyon-in ground mean 143, w-wall-mid lit 175), inside the arid references (Redrock's lit walls 211) but worth an
owner look.
**Sirocco and Sunscar's black squiggles (integrator follow-up, 2026-09-23).** The owner's "squigglies on the ground are so
black" were not a palette: a uniform-isolation probe (`.qa-dev/uniform-iso-probe.mjs`, one terrain uniform zeroed at a
time on the live material) left them untouched with the worn dirt, strata, micro relief, sand macro, town wear, shoulder
dirt and mid relief off, and with FLAT normal maps — and removed them entirely with `uRipple` off (Sunscar dune-face box
850,380,1500,650: 5th percentile 80 → 119, share of pixels darker than 0.6× the median 4.8 % → 0.7 %; Sirocco 122 →
180, 3.8 % → 0.3 %). The round-43 dune ripple field tilted the normal past the 22° sun on every crest, and on a dune
face its planar phase wraps into contour lines. `terrain.ts` now caps the ripple tilt at ±0.34 and fades the field on
dune faces from ~5° to ~15°; the flats keep their wind-swung ripples. Landed measurement (b51 vs A): Sunscar p5 73 →
110, dark share 5.6 % → 0.9 %; Sirocco p5 113 → 176, 4.8 % → 0.3 %; lit boxes unchanged. Two smaller items rode along:
the worn-sand D layer no longer reaches steep faces at all on the arid maps (it fades from ~9° to ~28°; the
layer-flag probe showed its blend zones as the finer contour lines), and Sirocco's worn-sand tint sits a step closer to
the floor ([0.74, 0.675, 0.58] → [0.80, 0.745, 0.66]).

### Mesa ring stack and textured arid skies — 2026-09-23 (round 47)

Owner: on Sirocco Wadi, Titan Gorge, Skybridge Chasm, Sunscar Oasis, Olympus Basin, Obsidian Caldera, Blackglass
District, Ruinspires, Copper Mesa Mine, Tidegate Polders and Whiteout Station "the skybox and mountains are too
bland, not good like the good maps" (good: Verdant, Steinburg, Cinder Junction, Frontier, Delta, Monsoon, Glacier
Pass, Ironworks, Airfield, Orchard, Longleaf, Reservoir).

**Cause (rings).** `HORIZON_ROWS_BY_STYLE.mesa` was byte-identical to `default`: four authored rows climbing
monotonically (50 / 62 / 84 / 88 m bases at 700 / 860 / 1000 / 1240 m), so the 1000 m row held 55-70 % of every
mesa map's skyline (desert 302 of 431 columns, Titan 239, Copper 263) and stood higher than the "tables" in front of
it — one stepped wall. Only `alpine` had the nine-row foothill / saddle / summit stack that makes Glacier Pass and
Nordhavn read as layered ranges. The mesa maps also ran on the style's 0.16 strata default and the escarpment maps
on none; Blackglass / Ruinspires / Polders fell in the rockfield's dead zone (treeline 0.14-0.30: neither forest
impostors nor boulders).

**Fix (rings, `world/maps/horizon.ts` + the map horizon blocks).** A nine-row mesa stack: a bench with buttes
(700 m), the near tablelands (860, finite cap range 0), a REAL valley floor (960; 36 + 28 m, lower than both
neighbours), the far escarpment (1200, cap range 1), a saddle (1260), distant summits (1320) and the outer shoulder
(1380). Rows sharing a table field (same `f0`) are one landform at two depths — the bench is the tables' pediment,
the saddle and shoulder the plateau tops behind the escarpment and the summits — while valley, escarpment and
summits are independent fields, so three ranges share the skyline (Titan seed 1337: tables 94, escarpment 99,
summits 185, shoulder 42 columns). Construction rules learned on the way: the far rows keep half their authored span
and no authored row steps more than 2.5:1 from the row before it (the ±3 % radial meander collapsed 60 m spans onto
the 12 m floor and the independent fields met as 10-25:1 sheets; the ledger contract is "terraces up to ~4:1"), the
escarpment's cap gets its own 1.8:1 approach (at the near tables' 1.25:1 a 270 m rise over a real valley needed a
220 m approach the span could not also fit a 90 m cap into — no cap formed at all), and its back rows are re-based
onto the moved cap. Redrock keeps the classic six-row ladder (`mesaCanyon`): its outland is the analytic canyon and
`redrockCanyonHorizon` pins every row. Authored strata: Titan 0.24, Skybridge 0.20, Copper 0.26, Caldera 0.18
(lava-flow beds), Blackglass 0.10, Ruinspires 0.12; outland rocks Blackglass 0.45, Ruinspires 0.50, Polders 0.40; a
second skyline rank on Caldera and Polders; tone grain 0.60 on the flattest rings (Oasis 0.62). Face belts stay off.

**Cause (skies).** Every good map runs `cloudOpacity` >= 0.85 and `cloudOpacity2` >= 0.45; the arid maps ran thin
veils (desert 0.35 / 0.18, Oasis 0.5 / 0.22, Titan 0.68 / 0.30, Copper 0.68 / 0.35) and Mars none. The near-overcast
maps (Skybridge 1.04 / 0.78, Ruinspires 1.08 / 0.82, Polders 1.1 / 0.72) missed `sky.ts`'s low-stratus auto branch
(0.95 / 0.90 and turbidity >= 7), so their 620 m fair-weather deck stood 6-7 km of slant range out and fully hazed in
the 2-12° band the battle cameras see; `cloudShadowAmp` was never authored; and the arid sun and haze sat in one
ochre family (Titan 0xffc89b / 0xb88970).

**Fix (skies, sky blocks only).** Broken altocumulus under a cirrus sheet on the arid maps (desert 0.78 / 0.48,
Oasis 0.78 / 0.48, Titan 0.82 / 0.52, Copper 0.80 / 0.50) on explicit 820-900 m virtual decks with a slower slant
haze (0.00012-0.00013) and 2600-2900 m cells, patchy light 0.24-0.30; Mars thin dust decks 0.3 / 0.15 with a dark
rust tint (the decks are not dimmed with the dome — a white deck would glow over the galaxy) and a shade more rust in
the haze band; explicit low decks on Skybridge 380 m, Ruinspires 360 m, Polders 420 m, Whiteout 300 m, Caldera 360 m,
Blackglass 330 m with diffuse patchiness 0.08-0.18; arid haze a step cooler than the sun (Oasis 0xb3ada3, Titan
0xb3a698, Copper 0xa8a49c, Skybridge 0x9d9188). The desert Garage copy follows (`garageSkyPresets`).

**Measured (wall-probe, same cameras / seed / tier; skyline ground/sky luma, lower is better).** Rings alone (B1)
barely move the ratio — desert sky-w 1.39 → 1.53 because the taller pale summits now hold the skyline; with the
skies (B): desert w-wall-mid 1.49 → 1.22, sky-w 1.39 → 1.47; Oasis sky-w 1.42 → 1.15; Mars sky-w 0.97 → 0.83; Titan
sky-w 0.99 → 0.96 (sky luma above the skyline 118 → 132); Copper sky-w 1.35 → 1.32; Skybridge centre-far 0.76 → 0.87;
Caldera sky-w 0.73 → 0.88; Polders sky-s 0.83 → 0.98; Verdant / Alpine controls unchanged within noise. Check 5 is
still failed by the pale sand rings (desert, Oasis, Copper, Ruinspires 1.1-1.5): the ridge tops keep their sunlit
sand colour against a deep sky, which is a ring-albedo question, not a cloud or haze one.

### The coast continues past the border — 2026-09-23 (round 47, shorelines)

**Symptom (owner: "Saltmere Bay, Nordhavn Fjord, Saltwind Narrows: good, but evident right angle with shore and water at
the border that looks awkward and not natural").** Five things lined up at 90°: the border rim lift is a Chebyshev square
(`max(|x|,|z|)`), so inside a bay's bank band it forced the waterline parallel to the red line and raised a wall where
the shore should run on; the height field is clamped past the square, so any shoreline was extruded straight out; the
bays are circles the square truncates; the sea opening past the edge was an azimuth SECTOR (round 40), so beyond the
line the water filled a radial wedge and a beach running obliquely toward the border simply stopped on a straight edge
with open water past it; and the sheet apron started on a straight chord.

**Fix.** The map's own bay contours now rule the outland. `terrain.ts` publishes `getOutlandWaterAt(x, z)` (the lake
discs' wetness and level, analytic, no clamp), gates the rim lift by the water weight (`rimH × (1 − waterWeight)`, also
in `outlandHeightAt`), and evaluates the bay discs analytically in the splat fragment (`uOutlandDiscs`, the shoreline.ts
capes/coves law or the authored 16-station contour — the material already uses every one of the GPU's sixteen texture
units, a baked mask did not link): past the edge on a sea map the ring's wetness IS the contour or the derived sector,
never the clamped edge texel, and a face that stands above the bay's water surface is its bank. `horizon.ts` lowers,
masks, colours and clears the canopy per VERTEX from `ringSeaWeight` — the bay contour near the square, the derived
sector beyond each opening's `coastReachM` (edgeWater.ts marches the contour outward along the opening's azimuth; the
sector fades in from 0.5× reach and is fully open at 0.85× reach + 20 m — the follow-up below moved it from 0.7 / 1.1 + 40,
which had left the contour's own far arc standing as a bank) — and every column's last wet vertex before a dry row
moves radially onto the true waterline (bisection on the contour), so the sea floor runs flat to the coast and the bank
rises from there; the ring's rows sit 60–120 m apart against a 27 m bank band, and without the snap the face before
the band climbed out of the water 20 m early as a dark "sea" ramp along every coast. `edgeWater.ts
buildOutlandWaterGeometry` replaces the fan with a grid of carrier cells from the red line, and `shallowWater.ts`
(program key v12) fades the apron along the baked contour through the map's own mask ramp (`uOutlandWater`,
`uOutlandSeaBlend`) instead of a chord or a cell edge — the first cut drew the coast as a 16 m staircase, the second a
translucent band up the bank.

**Verified (`.qa-dev/wall-probe.mjs` views bird-e-edge, bird-w-edge, bird-e-edge-n, shore-e-oblique, shore-w-oblique,
edge-e-low, edge-w-low; A = main-check, B3 = this lane; `$SP/r47/shore/`).** Saltwind: the bay lobe continues past the
west edge as one rounded contour with beach on both sides (A: a wedge of water between two straight-cut beaches);
Fjord: the eastern shore continues past the edge and the open water beyond follows it (A: a straight land edge on the
border); Coastal: the three-lobe coast runs on past the edge from the north bay to the south (A: chords). No seam band.

**Receipts.** `edgeWater.selftest` (coast reach, sector blend, the grid's admission/level/winding/red-line start, the fan
fallback), `shallowWater.selftest` (key v12, the contour fade, the terrain call), `terrainMaterialOwnership` (uniform
list, key v35 and its control, eleven texture owners), `terrainWornDirt`/`wallSkyLight` (key), the fetch census (+1),
`sourcedTerrainPreparation` (call site), the streaming fixture's current slices (rim gate, height-field exports),
`badlandsRelief`, every horizon receipt, `worldBuildCoordinator`, `terrainProjection`, `mapQuality`, `mapIntegration`.

**Still open (closed by the follow-up below except the last).** Coastal's and Fjord's bays were still plain circles; the
strip between two bay discs continued past the edge as a headland with the map's full relief (a 28 m block on Coastal at
z ≈ 50); the ring's forested tone makes the near coast read darker than the square's own shore in bird views.

### Shore contours: Saltmere's crescent and Nordhavn's fjord arms — 2026-09-23 (round 47 follow-up)

**Symptom (the round-47 "still open" list, same owner complaint).** Both coasts were three overlapping circles stacked
along the east edge: six circle arcs with cusps between them, each crossing the border twice, and every headland between
two discs rose to the full border rim (26 m on Saltmere, 42 m on Nordhavn) within 82 m of water at −4 / −8 m — a block
standing on the strand. The plan view (`.qa-dev/contour-plot.mjs`, the shoreline.ts law over the map's discs with the
square, spawns, roads, village and landforms drawn) showed the sausage plainly.

**Fix (authoring first, three small laws where authoring could not reach).**
- Saltmere Bay is ONE crescent: a 300 m disc centred 88 m past the red line (600, −40) whose west arc is the strand
  (x ≈ 300 at the village, meeting the border at z ≈ −320 and 230 as two headlands), with 16 authored stations (a
  promontory where the coast-road ridge dies into the bay, a low cape south of it) and its east half cut short (stations
  13–3 at 0.19–0.42 R) so the disc's own far arc ends ~145 m past the line. The matching 344 m shore ring keeps the
  same west stations (the beach ramp's wetness at the strand matches what the 190/218 m pairs gave the beach material)
  but stays round on the east — a ring's fitted bank band divides by its NARROWEST station, and the cut-short stations
  on the ring made that band 2.03 R: the meadow 700 m inland sank toward the strand level and a strongpoint at (−250, −60)
  tilted past the cliff-grade limit. Seven beached boats and the jetty lie on the one strand (`boats`, LakeConfig).
- Nordhavn Fjord is three ARMS: each disc a westward lobe (head at 1.0 R, flanks 0.44–0.50 R), sharing one mouth past
  the red line, with two 12–13 m rock ridges on the peninsulas between them and two outside the outer arms. The arms'
  banks grade over 0.14 of the local radius (15 m on a flank, 35 m at a head).
- `LakeConfig.bankBand` (liquidMarshSurface.ts): an authored outer bank band replaces the fitted one (≥ 1.32 R, a third
  of the radius outside the shoreline — 96 m of graded strand on a 300 m bay; on the fjord the two flanks' aprons met
  across every peninsula and pulled it, ridges and all, down to the water level).
- `terrain.coastRimFadeM` (terrain.ts `coastRimKeep`, in heightAt's rim line and `outlandHeightAt`): within that many
  metres of a bay's shoreline the border rim lift fades in, so a headland climbs away from the water instead of standing
  on it (Saltmere 120 m, Nordhavn 90 m; 0 = unchanged everywhere else). Roads keep their own rim weight.
- `edgeWater.seaSectorBlend` = [0.5 × reach, 0.85 × reach + 20 m] (was [0.7, 1.1 + 40]; the terrain shader's twin
  `far` and program key v37): the open-sea sector is fully open BEFORE the contour's far arc. The first crescent capture
  had a full disc whose far arc lay 390 m out under the ring's mountains — a round lake with a cliff wall — and with the
  old blend even a 145 m arc kept ~60 % of the ring's height as a dark bank across the sea horizon.
- `outlandHeightAt` now runs the composition heightAt runs inside the square — the shore rings' LIQUID surfaces (their
  dip, bank pull and flat core), the rim gated by that water weight, then the lake banks with the same per-lake band —
  instead of bare geology + rim. The probe that found it: at (511.5, 280) north of Saltmere's bay the square read
  −3.8 m and the outland +21.3 m (the shore ring had flattened the square to the sea level; past the line nothing
  applied it) — the "28 m block" of round 47 on every sea map. After: Δ ≤ 0.05 m on Saltmere, ≤ 0.4 m (micro relief)
  on Saltwind, ≤ 0.08 m on Nordhavn along the red line. The fjord arms author `boats: 0` (a clinker hull on a 0.14 R
  rock bank buries its tips) and keep their jetties; Saltwind authors `coastRimFadeM: 110` for the same headland law
  (it did not change what the bird view shows at its mouth — see Still open).

**Verified (`.qa-dev/wall-probe.mjs`; A = r47-combined, B4 = this lane; `$SP/r47d/cap/`, plan views `$SP/r47d/*.png`).**
Saltmere from above (bird-e-high, bird-e-edge-n): one concave strand between two headlands, the promontory and cape
breaking the arc, the sea open to the horizon (B: a lake with a cliff wall; B2: a dark bank across the sea); at
gameplay height (shore-e-oblique, bay-strand-n) the strand curves away to the north headland with the seven boats and
the jetty on it. Nordhavn (bird-e-high, fjord-arm-in): three narrow arms sharing one mouth, the peninsulas carrying
their ridges and spruce (B: flat at the water level, ridges buried), the far mountains as before. Saltwind (bird-w-edge
A/B4): the bay contour unchanged inside the square, the sea open sooner past the edge, no regression. B5/B6 (after the
outland composition): the dark block that stood on the red line north of Saltmere's bay is gone — the cape and meadow
run past the line (seam probe Δ ≤ 0.05 m).

**Still open — Saltwind's mouth slabs, diagnosed.** The layer-isolation capture (`.qa-dev/layers-probe.mjs`: hide the
apron, the ring forest, the ring mesh, the sheet) leaves the two dark slabs standing until the RING MESH is hidden, and
the seam probe shows the square and the outland agree along the red line there, so they are ring geometry. The ring
dump (`sampleHorizonGeometry`, rows 0–8 across 138–222°) locates them: the sector's angular taper was 28 % of the
measured run (derived openings, `EDGE_SHOULDER` 0.78), so beside the mouth the far rows fell from +50 m to the −8 m
sea floor across two or three columns while `seaReach` stretched the sea columns outward — a sheared 30° face; the
taper is now 2/3 of the run (0.6; Saltwind's opening 63° → 81°, the receipt bound follows), which spreads that
descent over ~12° of arc (45 → 3 → −8 m at rows 5–8). What remains after that (B8, unchanged to the eye) is the
ring's FIRST RIDGE ROW: at the flank columns the authored range profile rises from the outland floor at row 5
(~210 m past the edge: 14 → 41 m at 147°, 17 → 32 m at 144° after the taper), one 50 m strip beside water that runs
to the horizon — a cliff coast drawn as a single flat quad. That is a ring-profile item (soften the range's rise
across a sea opening's taper, or carry the headland out over rows 5–7) handed to the round-49 ring lane; the ring's
forested tone near the coast (round 47) also stays open.

**Receipt handling.** `badlandsRelief` authenticates the exact current bay/arms/ridge/rim-fade blocks and projects them
to the historical text next to Saltwind's round-40 contour (relief authoring by owner ruling); the streaming fixture's
current heightAt slice carries the new rim line; `roadBorderCorridor` sandboxes the height-constraint source region, so
`coastRimKeep` reads the settings inside the function (a top-level const touching `T` threw at load); `roadContinuity`
caught the first fjord banks as slot walls beside the roads (bankBand), `trackSurface` the strand losing its beach
classification (the 344 m ring), `mapQuality` the sunken meadow (the round ring). Re-pinned as map-digest movers:
`beachedBoat` (7 boats), `shoreDirtMask`, `villageWear`, `winterLakeGeometry`, `mangroveWaterPalette`,
`terrainStreaming`; `edgeWater` (blend numbers), `terrainMaterialOwnership` / `terrainWornDirt` / `wallSkyLight` (key v37).
`playableRelief` byte-compared titanGorge.ts against the baseline and was red on r47-combined (round 47 re-authored
Titan's palette route, tints, ring rows and sky decks): the round-47 projection module now carries the three Titan
blocks and the receipt projects them before comparing, the same law badlandsRelief applies.

### Frosthollow redesign — 2026-09-23 (round 48)

**Ruling.** Owner (2026-09-23): "Frosthollow, Amberford and Tarkhan Steppe look good and have unique colour schemes but
are straight rips of Verdant Field, exact same maps — not good, need redesign." The survey confirmed it for Frosthollow:
`winter.ts` fell through to `DEFAULT_TERRAIN`'s village rect and marsh centres (its lakes sat on the default marsh
centres), ran the procedural `roads: 'country'` like Verdant, copied Verdant's three tactical anchors byte for byte,
copy-pasted seven of its wall runs and nudged its five landforms by 2–8 m. Palette, frozen-sheet identity, sky,
vegetation species and dressing tones stay; the battlefield underneath is new.

**Reference and layout — a Carpathian / Tatra winter valley.** A frozen river runs north–south through a valley
trough as a beaded chain of ten frozen ponds (r 30–42 m, 84–140 m apart), each sheet just under its lowest bank; the
two wide necks carry the crossings. A linear timber village (log cabins, alpine houses, the onion-dome church,
woodsheds) sits on the west river terrace along the valley road, its crossroads where the pass road meets the valley
road, a sawmill yard with a loop road, two loaded flatbeds and timber bundles at its north end (`loggingYard`, the
Longleaf composition reused). The west flank is a steep two-armed ridge (13 / 12 m) with a saddle pass between the arms
that the pass road switchbacks up to; the east flank rolls as moraine knolls (6.8 / 7.6 m) with a cross-bar the Bystra
crossing cuts through; the base hills drop to `hillScale 0.62` so the kotlina floor reads flat under the ridges.
Fifteen fieldstone wall runs edge the terrace fields, the village yards, the yard fence, the moraine fields and hay
ground; spruce belts line the ridge toes, a birch line the terrace scarp, birch hedgerows the moraine fields; four
`avoid` clearings are the sawmill's cut blocks. Seven authored roads (`roads.paths`, endpoints owned in
`roadEndpoints.ts`): the valley road edge to edge (the utility line, 38 nodes), the pass road (west border → switchback
→ crossroads), the Bystra crossing (crossroads → southern neck → moraine crossroads → east border), the moraine track,
the sawmill lateral over the northern neck, a village back lane and the yard loop. New strongpoints: `terrace-village-
refuge` (brawl, alpine refuge in the village), `moraine-knoll-blind` (scout, on the north-east knoll), `saddle-aid-
station` (support, on the saddle shoulder above the pass road). Player pad on the valley floor (−145, −342; the south-terrace pad (−160, −400) moved 60 m down the approach on 2026-09-24 — see the round-48 landing note), the seven
enemy pads an arc across the north end (four on the moraine side, three on the north-west shoulder), scanned for
relief ≤ 4.2 m over the pad radius, min normal.y ≥ 0.90, ≥ 51 m apart, ≥ 690 m from the player pad, ≥ 77 m from any
sheet.

**Layout scan (node, `createHeightField(1337)`).** 7 roads, one network component; the village rect holds 27 road-node
building candidates for a 20-entry plan; 27 utility-pole stations on the valley road; strongpoints on normal.y
1.000 / 0.990 / 0.975; every pond ≥ 14.7 m from a road edge; pond bank lips ≤ 8.1 m (one 9.0 m step where the river
drops off the north-east shoulder). Two rules came out of the pond work and are recorded in the map file: overlapping
frozen ponds are not seed-robust (two ponds' auto levels can differ by metres between seeds and the frozen blend turns
that step into a ramp INSIDE the neighbour's sheet — the winterLakeGeometry berm audit caught a 0.37 normal on such a
ramp), so centres are spaced ≥ 1.32·rA + 0.66·rB + 12 m and the level steps fall in the necks; and a pond whose
shoreline ring reaches a border portal's road corridor changes level with road completion (roadContinuity's interior
envelope), so the southern pond sits 41 m off the valley road.

**Skyline re-grade (round 44, owner-approved).** Snowpack `grassTone` L 0.62 + 0.38·l → 0.52 + 0.32·l and
`postExposure` 0.94 → 0.86 (`winter.ts`; Whiteout inherits both through its `...winter.splat` / `...winter.sky`
spreads). Skyline metric (`skyline-metric.py`, A = origin/main f5a7bf3ae, B = this branch, same probe poses):
Frosthollow sky-w 0.94 → 0.88, sky-s 0.92 → 0.84 — inside the 0.80–0.90 acceptance band — centre-far 1.06 → 1.05
(that view's skyline is the far vista ring, which round 44 showed no albedo or exposure change moves). The battlefield
still reads white: bird-view snow box (x 500–1100, y 500–800 of `bird-n`) display luma median 208 → 198, mean 199 →
183, RGB 186/183/177 (neutral). Whiteout takes the re-grade on its ground (snow median 196 → 182) but its skyline
metric does not move (sky-w 1.01 → 1.01, sky-s 0.92 → 0.91, centre-far 0.95 → 0.94): its skyline in these views is
the vista ring, not the near rim band, and its horizon line is round-47-pinned — a Whiteout-specific horizon item
(ring snowHex / haze), not a winter.ts knob. (Closed by round 70: the round-48 law graded the procedural fallback only;
Whiteout's re-grade is authored on the sourced snow.)

**Captures.** `.qa-dev/wall-probe.mjs` views bird-n, bird-w, centre-far, sky-w, sky-s, canyon-in plus three
gameplay-height views added for this round (village-street, river-crossing, pass-switchback); A on `$SP/main-check`
(tag a), B on the branch (tag b3) in `$SP/r48w/cap`. The before is Verdant's sine-curve country road through scattered
stands; the after is the pond chain, the crossing, the belts and the terrace village.

**Receipts.** mapQuality (seven pads, three roles, utility line, connected network), mapIntegration, randomBattleMaps,
roadStations, roadContinuity, roadCutRecovery, roadInheritedGrades, roadDistanceField, roadMaskProfile,
fieldTrenchTerrain, terrainFastGrid, shallowWater, trackSurface, riverReedContact, iceSurfaceDetail, horizonResources,
mapCatalog, sourcedTerrainPreparation, garageArchitecture, loggingYard*, propsResources, worldBuildCoordinator,
worldActivationRuntime, dedicatedWorldCollision, collisionManifestCodec, `garage:terrain:check`, `npm run typecheck`.
Per-map rows re-pinned with dated comments: winterLakeGeometry (winter rows: 20 berms, no rowboat wood, budgets as a
ceiling for the redesigned map), terrainStreaming and shoreDirtMask winter goldens, dedicatedWorldCollision's winter
census (the recaptured shard `server/world-collision-manifests/winter.json`, 5944 / 930 / 4911), the codec's winter
shard budget (+10 %), the garage terrain excerpt (`garage:terrain:update`) and `badlandsRelief`'s exclusion list
(winter.ts is a new landform by owner decision). Shared digests that moved and are left for the integrator: villageWear
(FROZEN configs) and mangroveWaterPalette (other29). playableRelief's Titan byte pin fails on `r47-combined` before this
branch (round 47 rewrote `titanGorge.ts`).

### Amberford redesign — 2026-09-23 (round 48)

**Owner:** "Frosthollow, Amberford and Tarkhan Steppe look good and have unique colour schemes but are straight rips of
Verdant Field, exact same maps — need redesign." The survey confirmed it for Amberford: `maps/autumn.ts` re-stated
`DEFAULT_TERRAIN`'s village rect byte for byte, ran the procedural `roads: 'country'` cross, copied Verdant's three
`tacticalBeats` anchors and eleven of its fourteen `wallRuns`, and nudged Verdant's five landforms by 2–8 m; only the
river chain (`createMarshChannel`) and the dressing were its own.

**What changed (the identity stays).** The autumn palette, sky, species, prop tones, minimap colours, river material,
id, name, blurb and pad count are byte-identical; the battlefield underneath is new, with a Norman / English river-ford
market town as the real-world reference:

- **The river** runs south-west → north-east through a sculpted valley. The single graded water plane
  `liquidMarshSurface` fits (median level, ≤ 1 % fall) cannot follow a hilly field, so the valley floor is authored to
  it: `hillScale` 1.05 → 0.8 and eleven cut / fill landforms with `wetScale: 1` (hills the river cuts become shallow
  gorges, hollows are filled to a terrace) — measured on the marsh-less field (`$SP/r48a/design.mjs valley`). Result:
  the plane falls +1.6 m (SW) → −3.1 m (NE), the highest bank within 1.3 r is 1.44 m (was 2.25 m on the first cut,
  with 6 m levees where the plane stood above the fields), the centreline is ≥ 0.95 wet at all 265 samples outside the
  crossings, and `liquidMarshSurface`'s worst Amberford bank grade is 0.42 (limit 0.75).
- **Two authored crossings**, dry by construction (terrain.ts zeroes the water mask within 14 m of a lane and grades the
  causeway): the **bridge narrows** (r 18) under the coach road — deck 0.9 m above the water — and the **ford**
  (r 17, dip 1.5) under the manor lane — the lane dips to 0.7 m above the water over a gravel reach lowered by a lane-
  aligned basin. `navigationWaterPolicy: 'avoid-liquid'` makes bots cross at the bridge and the ford (Reservoir's
  policy); `matchPlacement` proves a dry bot route between every deployment and objective in all five modes.
- **Five authored lanes** (`roads.paths` + a `ROAD_ENDPOINT_INTENTS` row): the coach road edge to edge over the bridge
  and through the market square, the manor lane over the ford to the north-east edge, the mill lane west (portal at
  −512,−188), the sunken lane along the south bank between the orchards from the south-west corner (portal at
  −512,−477), the north lane between the hedged fields to the manor gates. One connected network; the coach road
  carries 45 stations for the utility line. The two western portals were moved once for `roadContinuity`: the road
  completion stamps a corridor 68 m either side of each added tail past radius 434, and a river station whose
  bank-band samples (1.8 R) read that corridor gets a different bank band in the completed and uncompleted builds —
  141 interior cells 26–77 m from the lanes moved (the level did not, `changedLiquidCells` 0). Every river station now
  sits > 32 m inward of, or > 68 m beside, every portal tail (`$SP/r48a/portalcheck.mjs` replicates the stamp).
- **The walled market town** on the north-bank rise (own 180 × 170 m rect, `settlementScale: 1` so the settlement keeps
  its knoll, `relief 0.18`): church, inn, Norman tower keep, market hall and rows, shops, granaries and cottages
  (`blockFill`), the market cross on the crossroads square, a town wall whose gates open where the three streets pass.
  The town stands 1.3–7.6 m (mean 5.0) above the 1.1 m bridge bank.
- **The fields**: 28 tree belts (four ranks of oak / birch / aspen on the east escarpment ridge, hedgerows 14 m either
  side of the sunken lane and the north lane, a poplar avenue up the manor drive), six orchard rows of rehoused lone oaks
  on the south-bank terrace, dry-stone cross walls from the lanes to 42 m off the bank, the manor park wall and the mill
  yard; `clusterCount` 68 → 50, `loneCount` 150 → 130 against the authored trees.
- **The manor park and lake** (`lakes` + `softLakes`, surface −6.1 m, banks 0.04–2.65 m at 1.25 r) north of the north
  lane; the headquarters camp on the rise above it.
- **The river kit** (`mapKits.ts dressAmberfordRiver`, Delta keeps the round-1 kit byte for byte): an intact stone bridge
  at the coach road's crossing — spandrel walls with three arch recesses, cutwaters and wing walls at the water's edge
  (11.5 m off the centreline, where the causeway's shoulder has dropped below the deck) under the map's destructible
  parapet `wallRuns` — ford posts on the wading lanes, and on the reach six links above the bridge a weir sill with end
  piers and a water mill (stone body, tiled gable, wheel and axle in a stone leat) that publishes a convex footprint like
  the coal heaps. Everything is derived from the layout; no map coordinate lives in the kit.
- **Pads**: player on the south-east upland's lower shelf (303, −327; the (330, −380) pad moved 60 m down the approach on 2026-09-24 — see the round-48 landing note) in Reservoir's column formation (the upland is uneven beyond the pad), an
  enemy arc north of the town; every pad flat-scanned on the full field — minNy 0.85–0.97, relief 3.2–6.3 m over 22 m,
  inside the shipped range (Verdant 0.82–0.94 / 3.3–6.2, Frontier's player pad 0.62 / 13.6).
- **The tactical-map plate** is re-baked (`tools/bake-minimap-assets.mjs --maps autumn`); the shared
  `MINIMAP_RASTER_REVISION` is left for one bump per round.

**Verified (`.qa-dev/wall-probe.mjs`, A = main-check, B = this lane, same cameras / seed / tier; `$SP/r48a/cap/`).**
bird-n / bird-w / centre-far / sky-w / canyon-in plus five gameplay-height views authored for the redesign — the bridge
from the south bank (`amber-bridge`), the ford from the manor lane (`amber-ford`), the coach road from the south gate to
the square (`amber-square`), the mill reach from the sunken lane (`amber-mill`), the valley from the escarpment
(`amber-valley`) — and two close bridge views (`amber-bridge-side`, `amber-bridge-deck`, tags b / b2). Skyline metric
(ground / sky luma, unchanged horizon treatment): sky-w 0.84 → 0.90, centre-far 0.88 → 0.81, bird-n 0.98 → 0.98.
Constraint check (`$SP/r48a/analyze.mjs check`): 5 roads / 1 component; 59 river stations, spacing within
`createMarshChannel`'s 1.15 r, 0 wet gaps, 16 dry crossing samples, wet edge ≥ 43 m from the border (no derived sea
opening); both crossings dry within 14 m of the lane, soft water beyond 18 m.

**Receipts.** `environmentExpansion` pins the two crossings with a tangent-based widening check (the round-1 check
assumed a W→E river), `botNavigationWater` lists Amberford beside Reservoir, `badlandsRelief` excludes `autumn.ts` from
the historical byte projection (a redesign by owner decision, like Mars), `railCoalStockpiles` names the mill house as
the one other kit footprint. Green: `roadContinuity` (autumn row: changedInteriorAwayFromRoads 0, outsideEnvelope 0, changedLiquidCells 0, no
physical failures), `mapQuality`, `mapIntegration`, `randomBattleMaps`, `roadDistanceField`,
`roadMaskProfile`, `fieldTrenchTerrain`, `authoredChannels`, `autumnHorizonSeam` (Amberford's own ring seam seats on
the new edge heights: max 2.05 m at three seeds), `horizonAutumnGround`, `liquidMarshSurface`, `matchPlacement`,
`minimapObjectives`, `formationPlacement`, `riverReedContact`, `riverLandings`, `beachedBoat`, `railWashout`,
`autumnHeadlands`, `cropBiomeIdentity`, the autumn palette / leaf / crown / branchlet / shrub receipts,
`sourcedTextures`, `shallowWater`, `loadingScreens`, typecheck. Moved on shared autumn digests — integrator re-pin:
`villageWear` (FROZEN configs), `mangroveWaterPalette` (other29), `terrainStreaming` (autumn geometry golden),
`shoreDirtMask` (autumn RGBA control), `winterLakeGeometry` (28-map non-Winter kit digest).

**Still open (the span closed by round 61).** A true arched span with water under the deck needed the road plane to
exempt the crossing from the 14–18 m dry band (`terrain.ts`, a round-47 file — not this lane's scope) and the arch
openings were box recesses, not arcs — round 61 (2026-09-24) authors `crossing: 'bridge'` on the narrows and the kit
builds real arcs over the river on the deck plane terrain.ts resolves (see "Round 61 — 2026-09-24: Amberford's bridge
over the river"). The garage card (`public/maps/autumn.webp`, thumbs) was re-rendered from the redesigned valley in round 50 (2026-09-24);
the `presentation-r1` autumn shots and the home-page showcase frames still show the round-1 valley and need the
marketing-shot pipeline. The manor has no house builder (the park is wall, avenue, lake and the
camp); a stone town wall is field-wall height. `tools/bake-minimap-assets.mjs` serves on 7600 + pid % 200 — it was run
under the probe mutex with its own capture lock.

### Tarkhan Steppe redesign — 2026-09-23 (round 48)

Owner (2026-09-23): "Frosthollow, Amberford and Tarkhan Steppe look good and have unique colour schemes but are
straight rips of Verdant Field, exact same maps — need redesign." The survey confirmed it for Tarkhan: `steppe.ts` ran
the procedural country roads, Verdant's five landforms stretched by a quarter, the default village rect and
byte-identical tactical-beat anchors. The identity stays — palette, sky, species, prop tones, name, id, spawn count,
the campaign operation — and the battlefield underneath is new, on one real-world reference: the Kazakh Sary-Arka
grain steppe of the Virgin Lands campaign.

- **Landform.** A dry braided riverbed crosses the middle east–west: seven `basin` landforms (130 × 58–68 m,
  4.6–5.8 m deep) that run past both edges so the bed continues into the outland (check 1), floored by a chain of
  twenty shallow takyr crusts (marshes r 28, dip 0.8, the M layer under a pale salt tone, `wetScale: 1` so the crust
  never lifts the basin back up) between worked-ground gravel shoulders — soft, slow and exposed to cross, firm on
  the banks. North of it a three-segment escarpment (12 m, width 170, crest z ≈ 220) with two natural saddles — the
  highway ramp and the east-track ramp — over a broad back-slope ridge that tapers out before the deployment ground;
  five kurgans (r 28–36, 6.2–8.4 m) on the crest, two inside hexagonal fieldstone kerbs; a salt pan of two pale
  marshes in the north-western lowland; the caravanserai rise (6.5 m) at the scarp's foot with three breached walls,
  tumbled stone and a herders' camp. `hillScale` 0.85 → 0.36, `microScale` 1.35 → 1.2 — the authored forms carry the
  relief, the folds stay for hull-down work.
- **Built-up.** The grain station is the settlement rect (150..410 × −330..−120) on the station-road / east-track
  junction: elevator head tower, long grain stores, the platform hall, a loading gantry, freight ranks, granaries and
  the railway workers' houses. The kolkhoz in the west is a long cattle-barn strongpoint inside seven stone corral
  walls with a machine-yard apron; the fort ruin is the scout strongpoint; the station's machine yard the support
  one. Three graded aprons (`hardstands` — machine yard, forecourt, post-road halt) give the objective placement its
  30 m discs where folds, road banks and seeded props leave none.
- **Roads and trees.** Five authored paths — the straight highway (south edge → wadi ford → western ramp → plateau →
  north edge; it carries the utility-pole line), the station road (west edge → kolkhoz → highway crossing → station →
  east edge), the east track (south edge → station → wadi → eastern ramp → north edge), the plateau road behind the
  kurgans, and the sor track (kolkhoz → wadi → salt-pan shore, a documented dead end). Nine poplar/oak shelterbelts
  replace the groves (clusterCount 7 → 5, loneCount 30 → 24).
- **Spawns.** Player (−160, −310) on the low southern steppe (the corner pad (−210, −424) moved 120 m up the approach on 2026-09-24 — see the round-48 landing note); seven enemy pads at z 402–426 on base terrain north of
  the crest — the spawn-clear fade would dimple any pad standing on a landform — 41–65 m off every road cut.
- **Measured** (headless probe, seed 1337): bed −4.3 m at x −300 and −4.1..−4.3 m at x 150 against banks near 0;
  crest 16–18 m at x −300 with the kurgans 5–8 m proud; ramp saddles 5–8 m; the highway ford dips 2.3 m; pads relief
  3.3–5.8 m over ±44 × ±22 m at min normal.y 0.89–0.98; strongpoints normal.y 0.99–1.00 on medium ground; both teams
  reach every 20 m row of the square. Captures (`.qa-dev/wall-probe.mjs`, A = origin/main, B = this lane, nine
  views): centre-far skyline metric 0.99 → 0.92 (the scarp now stands against the sky), sky-w 0.87 → 0.89 (sky
  unchanged); kurgan-line band luma 181 → 164 with dark share 1.3 % → 7.4 % (tree line and crest replace open plain);
  plateau-south ground 161 → 134 (the back slope and crest fill the frame); wadi-east pale share 1.0 → 2.3 % (the
  crust strip).
- **Receipts.** mapQuality, fieldTrenchTerrain, assaultTrenchTerrain (steppe: all three sector lines carved, dry
  floor measured — the crusts scale the carve), roadContinuity (documented steppe shore terminal), terrainStreaming
  and shoreDirtMask (steppe goldens re-pinned), dedicatedWorldCollision (census 2358/2120/1290 on the recaptured
  shard), matchPlacement (zone_control reads 111 k → 37 k against the 65 k bound), the road family, catalog, campaign
  and UI receipts pass. badlandsRelief leaves steppe.ts out of the historical byte projection by owner ruling.
  villageWear (FROZEN configs / other28) and mangroveWaterPalette (other29 digest) move and wait for the integrator's
  single re-pin. Pre-existing on the round-47 base: roadLookupGrid, roadPlacementAdmission (coastal), playableRelief
  (Titan byte baseline).
- **Open.** The rail spur's track was laid in round 57 (2026-09-24): the rail spur kit — `terrain.railSpurs`, one
  siding along the elevator row's loading face from a buffer stop west of the long store, a level crossing over the
  east track (the round-57 section); in round 63 (2026-09-24) the line runs on through a railway cutting in the eastern
  rim band to the map edge and out into a valley the horizon ring seats on (the round-63 section). The picker thumbnail
  and 4K hero (`public/maps/steppe.webp`, `thumbs/`) and the tactical-map plate (`public/minimaps/steppe.webp`) were
  re-rendered in round 50 (2026-09-24) — the lane had left the Verdant-clone frames in place; they predate the siding
  and the cutting.
### Titan walls, Fjord's cone and Whiteout's skyline — 2026-09-23 (round 49)

Four ring items (lane r49a, from origin/main 117a14b90 + the round-47 follow-up taper d223fa491). Every capture:
`.qa-dev/wall-probe.mjs` (plus its layer-flag, uniform-isolation and layers variants), same cameras / seed / tier,
one at a time under the probe mutex; boxes and numbers in `$SP/r49a/report.md`.

**Titan Gorge — "marbled near walls read as flowing water at 300 m", "smooth beige ridge faces without strata".**
The layer-flag probe puts the marble on the R layer — Titan's R is the PROCEDURAL sandstone tile (`R: null` in its
TERRAIN_PLAN row); the beige tops and moderate faces are the sand G set. The 2× crops of the 200 m and 450 m ring
walls show thin dark parting lines of near-equal vertical spacing contour-tracing a smoothly undulating face — a
topographic map — and the lines' spacing scales with distance (1.5–2.5 m of world height at both ranges): they are
the tile's NEAR-variant beds (0.9–2.8 m). Cause: the FOV-aware detail distance `effDist = min(camDist,
length(fwidth(wp.xz)) · 935)` uses the pixel's XZ footprint, which is tiny on a face-on wall (a pixel step down a
wall moves in Y), so a wall never blended to its far variant and carried centimetre-scale bed partings to the
horizon. A wrong turn worth recording: the uniform-isolation probe's "no-uStrata" shot looked calm and pointed at the
strata sine ladder — but that probe's flat-normals restore is broken for a material shared by 64 chunk meshes (the
second visit saves the flat texture as `__saved`), so that shot really showed flat normals; the strata block was
rewritten on that evidence before the crops corrected it. Landed (`world/terrain.ts`, program key v37 → v38, fetch
census 88 → 92 inside the uStrata branch): the strata block paints a few thick marker beds of unequal thickness and tone (thresholded long-period
terms, rust and bleached beds per cliff), thin partings inside 700 m, joint blocks ~9 × 5 m with a decorrelated
per-block weathering tone, varnish streaks under the caprock, laminae only inside 120 m of the camera (true distance); the far-cliff
ledge ladder's along-wall wander 2.6 → 1.0 rad; `splat.ringRockSlope` (uniform `uRingRock`, default [0.22, 0.48])
authors the ring rock band per landform-gated map — Titan [0.15, 0.36] (34–47°); a wider [0.10, 0.30] band showed no
visible change and was not kept. Measured (stripe metric, same boxes): sw-corner ring wall top-1 % share 0.537 → 0.567,
anisotropy 4.86 → 4.80, luma std 28.6 → 27.8; e-wall-300 0.742 / 6.87 → 0.734 / 6.84; w-wall-mid 0.744 / 5.92 →
0.737 / 5.90 — the marker beds, joints and iron tones render (half the wall's pixels move, mean 13/255), but the fine
wavy partings on the 200–450 m walls did NOT: laminae gated by camera distance (b3 ≡ b2), a +2.2 mip bias on the wall
R samples (b4), the wall samples' near/far blend by true distance (b5 ≡ b4) and the planar rock sample's blend by true
distance on slopes (b6 ≡ b5) were byte-identical, so the lines are not the R tile at any variant or scale and not the
strata block; the three distance experiments were reverted. What is known: they are shading (flat magenta keeps
them), they vanish with all four detail normal maps flattened, their world-height spacing is ~1.5–2.5 m at every
range, and they contour-trace the smooth relief. Still open under check 3 — next probe: flatten ONE normal map at a
time with a fixed restore (the shared-material `__saved` bug), then the coarse planar `dnRa` / `rnGround` taps.

**Nordhavn Fjord — "smooth green cone hill on the rim with a darker cap".** The alpine massifs are softened domes
under 15°, so nothing slope-keyed in the vista fragment fires on them (rock from 0.30 slope, scree from 0.16): a hill
is the meadow tint with stands below the treeline, and its only rock is the altitude-banded summit cap
`smoothstep(0.60, 0.92, hT) × rockHex` — the darker cap. Landed: a per-map horizon knob `bareRock` (0..1, default 0,
every other ring byte-identical) → `uVBareRock`: above the treeline the turf greys toward the map's own scree tint
(heath), outcrop ribs from the 140 / 45 / 12 m fields stand on the steeper local faces with scree fans below, the
summit cap breaks into ribs, snow leaves the ribs bare, and the ring forest's JS twin keeps crowns off them; Fjord
authors 1 (palette untouched). Verified plumbed (the live ring material carries `uVBareRock = 1`), but NOT visible in
the audited views: the cone hill sits at hT 0.3–0.5, below the treeline that gates the ribs, and the qualifying
summits are 50–87 % atmosphere. Still open under check 3: outcrops below the treeline on the alpine hills (a fjord
hillside's gneiss knobs through the turf) — the knob and fragment are in place for it.

**Whiteout Station — skyline metric 0.80–0.90.** The layers probe answers the round-44/48 question: with the ring
mesh hidden the skyline metric moves 1.005 → 1.009 and the edge row stays at 617/618 — in the sky-w / sky-s views the
skyline is the TERRAIN-MATERIAL rim band, not the vista ring, and the far ring keeps only ~13 % of its own colour under
haze + fog + the aerial pass. No ring knob can move this metric; round 44's proposal (snowpack tone / exposure
re-grade, owner call) stands (closed by round 70). Landed on the ring side only what the scoured-crest look needs (`bareRock` 1, rockHex
0x9da9b4 → 0x5b6772); the snow-tone and haze moves tried were reverted as unverifiable. Winter untouched.

**Sea-opening headland slab (Saltwind's and Nordhavn's mouths).** `seatHorizonSkirtOnGround` hands the ring over from
the battlefield's geology to the authored profile between 60 and 380 m past the edge — but only for the rows BEFORE
the first authored ridge; that row (~210 m out) carried the full profile while the row before it was three quarters
geology: beside a low shore, a 25–30 m step on one 50 m strip drawn as a single flat quad beside the water. Landed
(`world/maps/horizon.ts`, `world/edgeWater.ts`): `seaHeadlandWeight` — 1 inside an opening (taper included) and for
the first third of 0.25 rad beyond its edge, 0 at 0.25 rad — and on those columns the hand-over runs on through the
ridge rows to 470 m (`smoothstep(200, 470)`); every other column and every row past 470 m is bit-identical. Rows
(radius / height, seed 1337): Saltwind 141° r4..r8 21 / 47 / 55 / 59 / 62 m → 19 / 20 / 22 / 22 / 27 (…42 / 61 / 76 by
r12); Nordhavn's peninsula 365° 44 / 121 / 123 … 132 → 26 / 45 / 45 / 44 / 45 … 60 (the 20 m first step is the
peninsula ridge's own geology). By eye (bird-w-edge, bird-e-high): the dark slabs at Saltwind's mouth are a low
sloping shore, the pale wedge behind Nordhavn's arms is a low ridge with the massif starting farther out.

**Receipts.** terrainMaterialOwnership / terrainWornDirt / wallSkyLight / terrainSurfaceDetail (v38, uRingRock, census
92), mapQuality, horizonResources, titanGorgeHorizon, badlandsRelief (round-49 projections for titanGorge / fjord /
whiteout in `round47MapPresentation.test-support.mjs`, which carries two `"titanGorge.ts"` keys — JavaScript keeps
the last), worldBuildCoordinator, horizonRockfield, edgeWater, sourcedTextures, garageSkyPresets green; villageWear
and mangroveWaterPalette digests moved (map configs) — integrator re-pin.

### Round 48 landing — 2026-09-24: stale shards, the pacing receipt and the last bot

Chain 70's core suite stopped on `server/battlePacing.selftest` (124 seeded idle-host 2v2 battles, at most 15 may
reach the 900 s cap): 18 timeouts. Every unchanged map's row was byte-identical to the deploy-69 run (13 timeouts);
the three redesigned maps added five (Amberford 2, Frosthollow 2, Tarkhan 1) where the Verdant clones had none —
their old pads stood 457 m from the enemy arc, the redesigns put them at 816–870 m, the far end of the fleet.
Diagnosis ran on per-battle telemetry (`tools/pacing-trace.mjs` — committed in round 50 — replays one receipt battle
with per-interval rows, the AI controller's `debugInfo()` at chosen times and shell-result tallies; the finer QA-only
scripts stay in `.qa-dev/`: `pacing-fine.mjs` 2 s hull/gun/gate rows, `pacing-path.mjs`,
`pacing-full-debug.mjs`, `bog-metric.mjs`, `nav-dump.mjs` grid ASCII, `line-probe.mjs`, `manifest-near.mjs`,
`pad-scan.mjs` / `pad-grid.mjs`), the receipt's own seeds replayed one battle at a time. Three causes, three fixes:

1. **Stale dedicated shards.** Amberford's redesign lane never recaptured `server/world-collision-manifests/autumn.json`
   (the census receipt pins counts, and the round-1 counts still matched), so the dedicated bots fought the old
   village and bridge on the new terrain — two Amberford seeds parked a bravo pair on the river bank for eleven
   minutes. Tarkhan's shard had been captured on the lane's own tree (same census, different bytes on the combined
   kits). Both recaptured headless on r48-combined (`.qa-dev/collision-capture.mjs`, the capture tool's pack script);
   Frosthollow's recapture was byte-identical. Amberford 2 → 1, Tarkhan's seed 2 resolved at 584 s. The rule is now in
   DEVELOPMENT.md: a combined tree that changes a map's structures recaptures that map's shard on that tree.
2. **The last bot.** Frosthollow's survivor (a T-90M at half health) chained 14 s shoot-and-scoot legs on the west
   ridge's flank for 160 s — every candidate 45–85 m out stood on a 25–30° face, relocations frozen, no shot fired
   (`pickScoot` and `scanVantageRing` checked line of sight only). Tarkhan's Strv 103 parked on the border rim at
   +12° of elevation with 63 mrad still to go. Frosthollow's seed 3 Strv 103 stood 263 m from the idle host for six
   minutes with the penetration gate closed on every probed front plate and its two HE rounds spent — no shell, so
   no non-penetration event, so no flank. `src/game/ai.ts`: relocation cells must be ground the hull can hold and
   reach (`reachableSpot`: normal.y ≥ 0.90 at the cell, ≥ 0.86 at the leg's interior samples, casemates ≥ 0.975),
   flank rings score both sides for in-arena reachable points and shrink before giving a side up, and a closed gate
   held 8 s against a target whose hull holds still starts the flank two non-pens would.
3. **Pads.** The redesigned player pads sat in corner terrain with the arc 816–870 m away; the receipt's whole window
   went to the approach and the endgame. Each moved down its approach onto a flat-scanned cell (relief ≤ 4 m over
   22 m, min normal.y ≥ 0.90, ≥ 30 m off a lane, no solid record within 18 m): Frosthollow (−160, −400) → (−145, −342)
   on the valley floor (60 m; the rise with the ridge as its only vantage is gone), Amberford (330, −380) →
   (303, −327) (60 m), Tarkhan (−210, −424) → (−160, −310) (120 m, the grid's flattest cell, 44 m off the highway).
   `npm run garage:terrain:update` re-anchored Frosthollow's Garage patch; terrainStreaming's spawn-relative windows
   re-pinned for the three maps (`tools/receipt-repin.mjs`).

Full-receipt ledger (same 124 seeds): fresh shards 17 → relocation filter 16 → closed-gate flank + flank ring 17 →
flank limited to stationary targets 16 → pads 14 (median 448.9 s, p10 290.7 s, no sub-two-minute battle). The
unchanged 28 maps went 13 → 12 with the relocation filter and held there; the three redesigned maps 5 → 2. What
remains is the fleet's own stalemate stock — Tidegate Polders 3/4, Whiteout 2/4 — the Strv 103 sniper's one shot per
scoot leg at 290 m and every gun plinking the idle M1A2's front. Open: commit a pacing trace as a tool with a receipt;
a sniper's cadence against a passive target; the front-plate plink.

### Round 50 — 2026-09-24: the redesigned maps' plates and cards

Found while chain 70 ran: the tactical-map plates of Frosthollow and Tarkhan Steppe (`public/minimaps/{winter,steppe}.webp`,
last baked 2026-09-15 — Amberford's lane had re-baked its own) and the Garage cards of all three redesigned maps
(`public/maps/{winter,autumn,steppe}.webp` 4K heroes and `thumbs/` 512×288 pickers, last rendered 2026-09-15) still
showed the Verdant-clone battlefields — a tactical map of a valley that no longer exists. Re-baked and re-rendered on
the round-50 tree under the probe mutex, niced, one job at a time: `tools/bake-minimap-assets.mjs --maps winter,steppe`
(88818 / 59996 B; the north-up plates put west on the right — Frosthollow's terrace village strip, pond chain and
switchback, Tarkhan's braided wadi, salt pan, highway and kolkhoz grid), then `tools/screenshot.mjs --width 3840
--height 2160 --dyn-scale 1 --views battlefield_winter,battlefield_autumn,battlefield_steppe` and
`tools/map-thumbs.mjs --only winter,autumn,steppe` (the generated `src/ui/mapThumbs.ts` paths are unchanged). Verified
by eye on 1280 px reductions: Frosthollow's frozen ponds, valley road and village from the south; Amberford's wooded
upland with the coach road and the town on the floodplain; Tarkhan's kolkhoz, grain station and shelterbelts. The
pacing trace of the round-48 landing is committed as `tools/pacing-trace.mjs`.

Receipts: map-art-guards, minimapAssetRuntime, minimapCapturePolicy, minimapOrientation, loadingScreens, landing-media,
public-repo-hygiene, attribution. **Still open:** the home-page showcase frames of the three maps
(`public/media/home/p2_35/37/38_winter_*`, `p2_53/54_autumn_*`, `p2_55/57_steppe_*`, `g10_winter_*`) and the
`presentation-r1` archive frames come from the marketing-shot recipes (`tools/marketing-shots/gen-scenes2.mjs` →
grade → `publish-landing-media.mjs`) and still show the round-1 maps — a lane of its own.
### Round 51 — 2026-09-24: home showcase frames of the redesigned maps

The showcase frames of the three round-48 redesigns still showed the Verdant-clone battlefields: the eight orphaned
home-r2 gallery frames under `public/media/home/` (`p2_35/37/38_winter_*`, `g10_winter_ram_leo2a6`,
`p2_53/54_autumn_*`, `p2_55/57_steppe_*` — rendered 2026-08-02, unreferenced since the 2026-08-19 landing rebuild but
still shipped), the eighteen `presentation-r1` frames of those maps (the five owner picks `05/08_winter`,
`23/24_autumn`, `25_steppe` that the home shot rail, the maps section, the Garage featured gallery, the docs topic
page and `socialProof` consume; the eight shipped-but-unlisted archive frames `06/07_winter`, `22_autumn`,
`26/27_steppe`, `37/40/41_*_contact`; the five `studio_action_0N` keyframes of the Frosthollow studio loop), all
rendered 2026-08-19. Re-rendered on this tree through the marketing-shot pipeline, one job at a time under the probe
mutex, niced: the recipes were re-staged in their generators (`gen-scenes2.mjs`; `gen-scenes.mjs` for scene 10; the
`mapHeroes` rows of `gen-presentation-r1.mjs`, which now take an optional facing / wing entry; the
`scenes-studio-r1` storyboard), the JSONs regenerated (only the 21 intended scene files moved), `shoot.mjs` captured the
home frames at 1920 and the presentation frames at 1600 (their existing sizes), the studio keyframes came from the
storyboard scene seeked to 850 / 1550 / 2600 / 3900 / 5050 ms (`__STUDIO.load` → `seek` → `capture`, the recorder's
keyframe loop without the video, a `.qa-dev` driver), and the encodes used the pipeline's cwebp parameters
(`publish-presentation-r1.mjs --match …`, a new subset mode that re-encodes named frames and leaves the schema-2
manifest to `showcase:publish`; `-m 6 -q 80 -sharp_yuv` for the home frames; the `studioShots()` q 82 call for the
keyframes). `build-capture-recipes.mjs` refreshed the ten copyable recipes that moved.

Every recipe on the three maps needed re-staging — the anchors they were scouted on (the winter lake at (195,−120),
the autumn village at (10,40), the steppe hamlet at (0,45)) no longer exist, so the old positions landed on birch
slopes, behind field walls, inside a spruce, on the (−14,−60) pond and inside the highway's poplar belts:

- **Frosthollow** — ice breaker (35 / 05) and the studio loop moved onto the (38,70) and (−16,−150) ponds; the road
  charge (37 / 07) comes down the terrace village street toward the lens (onion-dome church, cabins, the utility line,
  the sawmill yard; the lens on the street's west half — at x −80.5 a farm truck parked on the east verge had its
  bumper 3 m from the glass); village hell (38 / 08) is a drone over the (−80,−40) crossroads with the wreck blocking
  the street; the ram (10) sits on the valley floor south of the Bystra crossing; the hero (37_contact) fires beside
  the church, the lens on the street (at x −104 a cabin roof filled the left third of the frame).
- **Amberford** — gold inferno (53 / 23) on the coach road north of the bridge: the lens on the road 29 m past the
  narrows (inside them the parapets flank the frame), the kill on the road past the bend with the walled town and its
  church straight ahead, the Leclerc 20 m out on the bend (an orchard-row staging was rejected in the integrator's
  review — the lens stood between the oaks with foliage over the glass and a hull 2 m off; seven cameras tried on the
  road and the town's south-east field before this one); orchard stand (54 / 24) between the east orchard rows, the
  composition rotated +101° to look up the rows; the ford ambush (52 / 22) on the manor-lane ford from the lane's south
  approach; the hero (40_contact) on the stone bridge with the walled town and its church on the rise behind.
- **Tarkhan Steppe** — horizon charge (55 / 25) on the open plain south of the wadi with the escarpment and its
  kurgans as the horizon (moved 12 m north once: a wire obstacle ran across the lens's feet); windbreak snipe (57 / 27)
  as a long lens down the highway between the poplar belts and the pole line (a side-on 36 m baseline at 21 m clipped
  both hulls); the hero (41_contact) on the escarpment crest beside the un-kerbed (60,224) kurgan.

The storyboard's "open" / "push" shots were re-aimed at the pond centre and widened 30 → 36° / 31 → 37° so both hulls
clear the frame; the storyboard's authored camera heights were kept (the keyframes read as a low lens at the pond's
edge).

Verified by eye on 1280 px reductions of every rendition after seven preview rounds (the frozen ponds, the terrace
village and ridge, the bridge, ford, orchards and town, the wadi, escarpment, kurgans and highway belts), every frame
checked against the review's lens rule — no foliage card, trunk or hull within ~8 m of the lens unless the recipe is a
deliberate hull close-up (10, 54 / 24, the over-the-wreck 06), and the burning or firing subject the centre of interest
— plus the `grade-battle-campaign.mjs` image metrics over the 26 raws (26 / 26 pass). Receipts: landing-media, feature-evidence,
hero-rails, loadingScreens, socialProof, showcase-library (manifest + copyable recipes), public-repo-hygiene,
attribution — no digest moved (the manifests pin ids, effect types and seeds, all unchanged). **Still open:** the
fourteen `showcase-r1` frames of Frosthollow and Tarkhan (`67–70 / 81 / 83 / 84_action_*`,
`97–100 / 111 / 113 / 114_foreground_*`) — the landing hero `113_foreground_winter_ice_breaker`, six mosaic tiles and
the README's `84_action_steppe_horizon_charge` — still show the round-1 maps; they are the 4K battle campaign
(`gen-battle-campaign.mjs` derives them from the scenes2 recipes, so a regeneration inherits these stagings) and need
the campaign's own 60-frame grade, contact-sheet review and `showcase:publish` gate. The landing-r1 studio video
(`studio-leclerc-knockout.mp4`, the r2 recorder's inline scene on the old lake) is byte-pinned and also open.
### Round 52 — 2026-09-24: Saltwind Narrows' strand

Owner decision 20 (2026-09-23): "Saltwind strand wider: 20 m, re-plan the boat landings". The hooked bay's graded
strand between the waterline and the dry bank (`LakeConfig.shelfM`, the shader's sea-lake waterline `1 − shelfM / r`)
goes from 12 to 20 m — Saltmere's is 22 m. Before/after on the same views (`tools/map-view-probe.mjs`, views
bird-w-edge / shore-w-oblique / edge-w-low / w-wall-mid, a = deploy 70's tree, b = this round): on shore-w-oblique the
near shore that met the water grass-to-water now carries a pale sand beach along its whole length, the north headland's
strand widens the same way; from the bird view the wet lower strand reads as shallows, the dry upper strand as sand.
The boat landings needed no re-plan: `beachedBoat` (every hull's contact at every seed) and `riverLandings` pass
unchanged, so the two east-shore stations keep their boats and jetties on the wider beach. Receipts: badlandsRelief's
exact Saltwind bay slice follows the source; shoreDirtMask (Saltwind RGBA control), the shared kit digest
(mangroveWaterPalette) and the all-map config digest (villageWear) re-pinned with dated notes; shoreline, trackSurface,
liquidMarshSurface, terrainStreaming, roadContinuity, mapQuality, shallowWater, edgeWater, terrainSandCoverage,
terrainWornDirt, sourcedTextures, autumnHorizonSeam, terrainSplatFields, environmentExpansion, spawnClearance and
garage-terrain-patches unchanged. Decision 21 (coastal apron debris specks) stays open.

### Round 53 — 2026-09-24: the 4K showcase frames and the studio video of the redesigned maps

Round 51 left the fourteen `showcase-r1` frames of Frosthollow and Tarkhan Steppe on the round-1 battlefields — the
landing hero `113_foreground_winter_ice_breaker`, the six mosaic tiles (`67 / 69 / 84_action_*`, `97 / 99 /
111_foreground_*`), the README's `69 / 84 / 97` and the seven archive frames (`68 / 70 / 81 / 83_action_*`, `98 / 100 /
113 / 114_foreground_*`) — plus the byte-pinned landing film `landing-r1/studio-leclerc-knockout.mp4`, whose recorder
carried its own inline stage on the retired lake. Both went back through the repo's own pipeline on this tree, one
capture at a time under the probe mutex, niced:

- **Templates.** The campaign derives the winter frames from `gen-scenes.mjs` 09 / 10 / 11 / 12 and `gen-scenes2.mjs`
  35, the steppe frames from 55 / 57. Round 51 had re-staged 10 / 35 / 55 / 57; 09, 11 and 12 were still on the lake at
  (195,−120), the west road and the farm crossing. Re-staged: the lake duel (09 → 67 / 97) on the c(−24,−246) r40 pond
  of the frozen river, the lens on the ice at its south-east looking north-west over the burning victim at the shooter,
  the terrace scarp's birch line and the southern ridge arm behind; the column under fire (11 → 70 / 100) coming down
  the pass road from the saddle toward the village ((−272,20) → (−214,−10), heading ≈115°), the lens up-slope on the
  road behind it looking over the column into the valley — the village street, its onion-dome church and the moraine —
  on the road's north-east half (on the centreline a snow-bound wreck hull and a boulder on the south-west verge filled
  the frame's left edge); the village brawl (12 → 69 / 99) at the terrace village's crossroads (−80,−40) shot from the
  Bystra crossing road outside the village rect: the foe drives in along the crossing road 20 m ahead of the lens with
  its gun on the SEPv2 holding the street beside the church, the KF51 comes down the pass road beyond the crossroads,
  the burst is at the crossroads, the saddle and ridge arms the skyline. The street itself has no lens position with
  nothing inside 8 m — the utility poles stand within ~1 m of the centreline (x −75..−77 at z −7..8), the east verge has
  a log cabin at (−68..−60, 6..22) and a rail fence, the west verge the barn row; four street lenses and a first
  re-stage in the sawmill yard (the yard's cabin at (−92,67) filled the left half of a north-looking lens) were
  rejected on 1280 px previews.
- **Generator.** `gen-battle-campaign.mjs` did not reproduce the checked-in campaign: 62's victim and 89's reinforcement
  had been hand-edited after the 2026-08-19 generation (the 2026-08-20 showcase overhaul) and rendered as edited, their
  foreground twins not. Those edits now live in an explicit `HAND_TUNED_ACTION` table, so a regeneration is byte for byte
  the published campaign. Round 51's long-lens re-staging of 57 (the sniper 60 m from the lens) broke the action
  contract (a hull within 29 m); rather than re-stage the approved home frame, a template whose nearest hull is past 29 m
  is pulled in along its own sightline until one is within 28 m (81: 60.1 → 27.7 m; its sightline foreground follows).
  Three foreground lenses whose formula position landed on a prop of the redesigned ground are overridden in
  `HAND_TUNED_FOREGROUND` with dated notes: 98 (the orbit lens stood behind a snow rise that hid both hulls' lower halves
  — mirrored to the pair's north side on the valley floor), 111 (3 m from a highway utility pole — onto the carriageway,
  13 m from the sniper), 99 (3 m from a hedgehog beside the crossing road's woodshed and yard clutter — 1.5 m east and
  1.2 m south, 8.5 m from the foe, the church centred behind the hull). Every override keeps the 7–14 m anchor contract;
  `battle-campaign.selftest` passes; exactly the fourteen intended scene files moved.
- **Renders and gate.** Eight 1280 px preview rounds (`shoot.mjs` on scratch scene sets with `cameraVariants`), then the
  fourteen 4K masters (`shoot.mjs --match … --width 3840`, two jobs) into a campaign root beside the 46 approved Aug-19
  masters linked from the shared archive; `grade-battle-campaign.mjs` 60 / 60 with the 46 unchanged rows byte-identical
  (metrics and bytes) to the 2026-08-20 report; `showcase:publish` with `--campaign-root` / `--studio-root` (the
  round-51 keyframe PNGs plus a `studio_winter_breakthrough.resolved.json` from the recorder run) re-encoded all 60
  renditions — the 46 unchanged came back byte-identical, so only the fourteen renditions, the four contact sheets that
  carry them (`action / foreground-review-01 / -03`), the two manifests and `capture-recipes-r1.json` moved. The
  showcase manifest's studio shots now list the storyboard's cast (`strv122`, `leclerc`; the Aug-19 resolved state had
  carried the 83 ice-breaker cast).
- **Studio film.** `record-studio-action-loop.mjs` loads the checked-in `scenes-studio-r1/studio_winter_breakthrough.json`
  (scene, actor tracks, camera shots) instead of an inline stage — one source for the film, the presentation-r1
  keyframes and the copyable recipe — and refuses a storyboard that did not load as authored. `publish-landing-media.mjs`
  encoded the mp4 (6867 ms, 7,187,726 B), the 4.15 s poster (579,052 B) and, new, the `web-video-r1` mobile proxy
  (h264 960×540 24 fps, 416,505 B) whose byte receipt it updates in place; the landing-r1 pins (`durationMs`,
  `videoBytes`, `posterBytes`) re-pinned by the publisher on 2026-09-24, the proxy library 8,791,590 B under the 9 MB
  budget.

Verified by eye on 1280 px reductions of every 4K master (67 lake duel: burning victim and airborne turret left, the
shooter's tracer centre, the pond's cracked ice, birch line, walls and ridge — pass; 68 ram: the deliberate hull close-up
with the fireball — pass; 69 crossroads: foe, burst, log racks, church, ridge skyline — pass; 70 pass road: the column
with the village and church below, the frozen supply truck on the verge — pass; 81 highway: sniper left, kill centre,
poplar belts and pole line — pass; 83 pond: kill and shooter over the ice — pass; 84 plain: the charge with the
escarpment and kurgans on the horizon — pass; 97 / 113 / 114 / 100 / 98 / 111 / 99: the anchor hull 8.5–12.3 m out with
the burst, church, pond, highway or plain behind — pass; nothing but a deliberate hull inside ~8 m in any frame), the
four regenerated contact sheets, and four frames of the published mp4 (0.9 / 2.6 / 4.15 / 5.8 s: the pair on the pond,
return fire, the ammo-rack knockout, the burning wreck, the Studio dock in every frame), the poster and the proxy's
4.15 s frame. Receipts (exit 0): showcase-r2, battle-campaign, landing-media, feature-evidence, hero-rails,
loadingScreens, socialProof, showcase-library, feature-loops, og-images (its sources unchanged), public-repo-hygiene,
attribution. **Still open:** `feature-loops-r1/03_winter_lake_duel.webm` (its copyable recipe now derives from the new
67 while the film is the old lake), `hero-rails-r2/02_winter-ice-orbit` and `03_steppe-charge-thread` with their mobile
proxies, the `battle-reels-v3` winter / steppe reels and `featured/f1_09_winter_lake_duel` — all still the round-1
battlefields; `gen-scenes.mjs` 13–16 (the retired first production) stay on the old anchors.

### Round 54 — 2026-09-24: the last showcase media of the redesigned maps

Round 53 left five public media of Frosthollow and Tarkhan Steppe on the round-1 battlefields: the feature loop
`feature-loops-r1/03_winter_lake_duel` (its copyable recipe already derived from the re-staged 67 while the film was
the old lake), the hero rails `hero-rails-r2/02_winter-ice-orbit` and `03_steppe-charge-thread` with their
`web-video-r1` mobile proxies, the `battle-reels-v3` reels 03 (Challenger 3 vs Leopard 2A7V), 07 (M1A2 TUSK vs T-90SM)
and 18 (Merkava Mk 3D vs AMX-40) — a library encoded outside this repository on 2026-08-19 — and the featured splash
frame `featured/f1_09_winter_lake_duel`. All went back through the repo's own pipeline on this tree, one capture at a
time under the probe mutex, niced:

- **Recorder.** `tools/studio-example-videos.mjs` gained the `battle-reels` collection — the Docs library's pinned
  twenty-reel table (`BATTLE_REEL_SCENARIOS` in `tools/studio-example-scenarios.mjs`: the sixteen maps registered on
  2026-08-19 plus the four repeats, the tank pairs, `directDuel({variant: index})`, seeds 24001 + 137 (index − 1); the
  library's ids are pinned to it by `battleReels.selftest`) — and a `--stills <ms,…>` framing-review mode that stages a
  job and captures PNGs at storyboard times instead of recording a video (eight preview rounds here without an encode).
  The reels of the redesigned maps carry authored stages (`BATTLE_REEL_STAGES`): the stage rule (two enemy pads about
  62 m apart) puts them on bare snowfield at Frosthollow's north wall and on the plateau behind Tarkhan's escarpment
  since round 48 moved the pads to the edges. 03 runs south across the neck between the c(54,150) r36 and c(38,70) r40
  ponds with the lenses on the open east bank (the ponds 3–4 neck was tried first: birch trunks and a pole line stood
  inside the wide style's 52 m lateral excursion); 18 runs north across the neck between the c(−16,−150) r38 and
  c(−14,−60) r30 ponds east of the village crossroads — the street, the onion-dome church and the pass road in every
  wide shot; 07 runs east→west on the open grass south of the wadi at z −110 with the lenses on the south side, the
  grain station and the shelterbelts behind the return fire. Both hulls of a pond reel start inside r − 15 so every
  duel-track drive stays on the ice.
- **Publishers.** New `tools/marketing-shots/publish-battle-reels.mjs` (`npm run reels:render` / `reels:publish`)
  encodes a reel master to the shipped delivery contract — h264 High 4.0 1280×720 at 30 fps, 3.2 Mbps average with a
  4.4 Mbps peak (the x264 receipt of the 2026-08-21 files), faststart, no audio — and cuts the 640×360 poster at 2.6 s
  with `cwebp -m 6 -q 85 -sharp_yuv`, which reproduces the shipped posters' bytes within 0.2 %; it refuses an id the
  library does not list. `publish-hero-rails.mjs --match` and `publish-feature-loops.mjs --match` re-publish named
  rails / loops into the existing manifests (the other rows, the 4K gameplay film and their receipts untouched), and
  every published rail now derives its `web-video-r1` mobile proxy from the published WebM (h264 960×540 at 24 fps,
  crf 29 — the proxies' own x264 receipt) and re-pins its byte receipt in place. `encode-featured.mjs --only` re-encodes
  a featured source into the `f<N>_` slot it occupies without wiping the set or touching the OG composite.
- **Rails.** The steppe rail's opening key sat 5 m behind the re-staged 84's lens, inside the berm of the wire line
  that crosses the plain (the first frame was a wall of sand); it opens 1 m ahead of the lens on the clear grass now
  (`HERO_RAIL_FILES`, dated note). The winter rail (83, the c(38,70) pond) and the feature loop (67) needed no change.

Verified by eye on 1280 px reductions: four frames of each reel (2.6 / 7.2 / 10.8 / 14.0 s) and its poster, four
frames of each rail (0.5 / 2.4 / 4.2 / 5.7 s) and its poster, three frames of each mobile proxy, four frames of the
feature loop (0.5 / 3.0 / 4.3 / 5.7 s) and its poster, and the featured frame — all pass the lens rule: nothing but
the Direct Duel storyboard's own style-2 pursuit and whip shots (reel 18) and the rails' impact dives within ~8 m of
the glass, the burning or firing subject the centre of interest, the frozen ponds, spruce banks, village barns, church
and ridge / the wire line, earthworks, grain station and shelterbelts recognisable. Receipts (exit 0): feature-loops,
hero-rails, showcase-r2, battle-campaign, landing-media, feature-evidence, loadingScreens, socialProof,
showcase-library, battleReels, og-images (its sources unchanged), public-repo-hygiene, attribution. The manifests moved
only the intended rows — three byte receipts and the actors' current registered names in `feature-loops-r1` and
`hero-rails-r2`, two proxy byte receipts in `web-video-r1`; `battle-reels-v3/manifest.json` came back byte-identical.
One receipt floor re-pinned with a dated note: `feature-loops.selftest` wanted every 1280-wide q3 poster above 100 KB,
and the loop's new poster — the frozen pond's bright ice and snow at 3 s — encodes to 97.5 KB, so the presence floor
is 80 KB.
**Still open:** the seventeen other reels stay on their 2026-08-19 renders (their maps are unchanged); `gen-scenes.mjs`
13–16 (the retired first production) remain on the old anchors.
### Round 55 — 2026-09-24: Titan's partings, Fjord's outcrops, the coast ring tone

Three open items of the round-49 and round-47 notes (lane r55-ring-details, from origin/main 3ca1db520). Every capture:
`tools/map-view-probe.mjs` at the same seed / tier / cameras, A = a pristine `origin/main` worktree, B = this lane, one
run at a time under the probe mutex; boxes and numbers in `$SP/r55/`; every pair judged on 1280 px reductions and 2×
crops.

**Titan Gorge — the fine wavy partings (round 49's open item), closed.** `tools/terrain-uniform-iso-probe.mjs` now
flattens ONE layer normal map at a time (`--flat-normal-maps=uNrmG,uNrmD,uNrmR,uNrmM`, `<view>-flat-<uniform>.png`) and
collects the splat material into a Set before touching it — its per-mesh visit used to overwrite `__saved` with the
already-swapped value on the second of 64 chunk meshes, so every frame after the first variant kept flat normals
(round 49's "no-uStrata" wrong turn). Flattening `uNrmR` alone reproduces the all-flat frame: sw-corner-close wall box
59.0 % of pixels moved vs 60.4 % all-flat, stripe top-1 % share 0.535 → 0.746 in both; e-wall-300 29.6 % vs 29.8 %,
0.734 → 0.803 in both; G, D and M move ≤ 2 % (w-wall-mid's ~6 % is frame noise shared by every variant). A second
run with three temporary gate uniforms named the tap: the coarse wall-plane R sample `texture2D(uNrmR, gWallUV × 0.041)`
(the "craggy rock at range" relief) carries the crisp contour lines (49.7 % of the wall box, mean 3.9/255); the 0.155
wall sample 21.6 % / 1.7 (fine grain) and the 0.019 tap 10.4 % / 0.9. Mechanism: the procedural sandstone tile is
BEDDED — a 3 px seam notch at every bed boundary, normal strength 2.6, beds of 34–110 px on a 256 px tile — so in the
wall plane at a 24 m period it prints a parting every 0.9–2.8 m of world height that contour-traces the relief, and no
mip bias can remove it (a step's derivative stays a line at every level: round 49's b4/b5 null results). Landed
(`world/terrain.ts`, program key v38 → v39, lexical fetch census 92 → 94 inside the new branch): on the maps whose R
layer is the procedural sandstone tile (`uBeddedR` = 1 — `splat.sandstone` and no sourced R in the map's plan,
`sourcedTextures.sourcedTerrainLayerPlanned`: Titan, the desert, Redrock, Skybridge; Copper Mesa and Mars take the
sourced photo rock and keep the tile) the coarse wall relief is analytic — buttress masses (~17 m) leaning with height,
ribs (~6 m) and ledges of mass (~33 m) from incommensurate sines, phased per cliff by one slow noise fetch per wall
plane (`wallCragField` / `wallCragTilt`) — so the walls keep buttresses and recesses with no line locked to world
height. A screen-derivative bump of the mip-sampled noise field was tried first and speckled the whole wall (b1: luma
std 28.5 → 41.5); the planar ground tap (`dnRa`) and the photo-rock maps keep the tile. Measured (stripe metric on the
round-49 boxes, A → B): sw-corner-close top-1 % 0.535 → 0.734, anisotropy 4.92 → 4.61, luma std 28.5 → 28.3;
e-wall-300 0.734 → 0.770, 6.84 → 6.75, 30.4 → 29.5; w-wall-mid 0.739 → 0.733; canyon-in's wall box moved 4 of 80,600
px and its ground boxes not at all (shaded 98.2 → 98.0, lit 159.2 → 159.2). By eye: the partings are gone, the marker
beds, joints and a faint buttress shading carry the walls.

**Nordhavn Fjord — outcrops below the treeline (round 49's open item), landed.** The ring dump (`sampleHorizonGeometry`,
seed 1337) puts the cone hills at hT 0.3–0.5 with row p50 slopes of 10–25° and p90 of 34–45° on the ridge fronts (rows
6–12), under the vista's own rock law (from 45°) and under the treeline (0.74) that gates round 49's ribs. A per-map
knob `outcrops` (0..1, `uVOutcrop`, default 0 — every other ring byte-identical: the term is `max(rockW, 0)`,
`forestW × 1`, `moss × 1`) carries gneiss knobs and slabs through the turf below the treeline: slope-gated from ~9° to
~28° (noise-broken; the interpolated-normal slope of a softened dome is well under its face slope — the first cut gated
from 22° and fired on 8 % of the cone), slab fields of 60–140 m from the 140 / 45 / 12 m fields inside a halo of
scree; the knobs open the forest stands (trees do not grow on slabs), stay bare of moss and carry lichen-pale crowns
(the first cuts drowned: grey rock at the turf's luma, 40 % re-greened, blended 30–60 % INTO the dark stands). Same
fields as the ribs — no new fetch (`horizonResources`' 13 VTRI / 3 texture2D census holds); `buildHorizonForest`'s JS
twin keeps crowns off the knobs (its face slope is rise / run, converted to the fragment's 1 − cos); vista program key
r3 → r4; `fjord.ts` authors `outcrops: 1` (palette unchanged), the round-47 projection module's `fjord.ts` CURRENT block
carries the line. Measured (boxes on the ring hills, A → B5): w-wall-mid cone 47 % of pixels moved by a mean 4.5/255,
luma std 19.9 → 19.0; sky-w cone 37 % / 2.8; shore-w-oblique ring hills 31 % / 4.9; bird-w-edge 0.3 % (its slope is
the terrain-material rim band, not the vista). By eye: the cone's lit flank and the foothills carry pale slab fields
and open stands where they were one green sheet; the shaded flank stays dark; the long slope in shore-w-oblique reads
as a fjord hillside with rock through the turf. Modest under the haze — the knobs are legible, not loud.

**The ring's forested tone near the coast (round 47's check 13), re-diagnosed and closed.** The layer probe on the bird
views of Saltmere, Nordhavn and Saltwind shows the land past the red line in a bird view is the TERRAIN-MATERIAL rim
band (paler than the square's tree-dotted ground, luma 109 vs 70 on Saltwind), and the near-coast "forest" is the
ring's INSTANCED trees; hiding them leaves the far-shore strips unchanged, so the painted stands are not the step.
Per-side crown boxes (green pixels, hue 85–160°) on Saltmere's west edge, ring trees just past the line against the
square's just inside at the same distance: L 0.305 / sat 0.24 / hue 114° vs 0.199 / 0.31 / 120° (pale mint beside
rich green), with both sides sharing one canopy palette. Two causes in `horizonVista.buildHorizonForest`: the crown
material kept the standard response (roughness 0.92, the GGX lobe) while the battlefield's far canopy is a matte
volume (`vegetation.ts canopyFarMat`: roughness 1.0, `applyCanopyDiffuseWrap` 0.38 with the GGX lobe dropped —
"GGX at N·V = 0 produces a broad white grazing lobe"); and the crown mottle multiplied by the raw canopy tile, whose
mean is 0.35 / 0.39 / 0.30 (the other vista tiles are authored at 0.5) — a systematic ×0.83 / 0.88 / 0.78 that
darkened every crown and pushed it toward yellow. Landed: the ring forest runs the battlefield's matte response
(roughness 1.0, the 0.38 wrap in its hook, key `horizon-forest-canopy-v3`) and the mottle is centred on the tile's
mean (`VistaTiles.canopyMean` → `uVfCanopyMean`). Measured (A → B): ring band right 114° / 0.24 / L 0.305 → 123° /
0.26 / 0.278 (square 120° / 0.31 / 0.199), left 110° / 0.319 → 118° / 0.291 (square 124° / 0.228) — the hue gap 6–14°
→ 3–6°, the lightness gap a quarter narrower; every map with a ring forest gets the same crown response. NOT landed: a
shore fade of the ring's stands and band trees over the 10 m above the sea level (`uVShoreFade`) — the far-shore
strips of Saltwind's shore-w-oblique and Saltmere's shore-e-oblique came back pixel-identical (the ring rows behind a
bay sit above sea level + 12 m; the strand rows are the terrain-material bands the vista never paints), so it was
reverted rather than kept as dead weight; and the first cut's placement rule ran BEFORE a candidate's random draws,
which re-rolled every ring tree on the sea maps (the doubled silhouettes in the difference image) — a rule that thins
trees must decide after the draws.

**Receipts.** terrainMaterialOwnership (v39, `uBeddedR`, census 94), terrainWornDirt, wallSkyLight, terrainSurfaceDetail,
terrainProjection, terrainSandCoverage, terrainRoadMaterial, sourcedTextures, sourcedTerrainPreparation,
terrainResources, map-probe-runtime (the new flag); horizonResources, horizonMesaSurface (r4), horizonNoiseSampling,
horizonRockfield, titanGorgeHorizon, badlandsRelief (fjord projection), worldBuildCoordinator, edgeWater,
horizonAutumnGround, redrockCanyonHorizon, autumnHorizonSeam, vegetationLighting, mapQuality, garage:terrain:check,
typecheck; villageWear and mangroveWaterPalette map-config digests re-pinned (fjord.ts authors one more line).

### Round 56 — 2026-09-24: the strands' wrack line and debris

Owner decision 21 (2026-09-23, "coastal apron debris specks — later"; now). Lane r56-coast-debris from r55-ring-details
(81eafdead); A = a pristine detached worktree at that commit, B = this lane, `tools/map-view-probe.mjs` at seed 1337 on
the round-47 shore views plus three new round-56 views, one run at a time under the probe mutex; judged on 1280 px
reductions and 2× crops in `$SP/r56/cap/`, numbers in `$SP/r56/`.

**What was wrong.** The strands of the three sea maps — Saltmere Bay's 22 m crescent strand, Nordhavn's 10 m shelves,
Saltwind's strand just widened to 20 m in round 52 — read as clean graded sand between the water and the grass (the
round-52 capture: a pale strip with turf straight up to it). A real strand carries a wrack line at the high-water mark.
Measured first (`strand-profile.mjs`, the beachedBoat receipt's headless build): Saltmere's strand is dead flat at the
sea level from the water's edge (0.95 of the local authored radius) out past its 1.10 R bank band — there is no graded
slope at all, the meadow behind it is at the same level; Saltwind's dry sand is only ~3 m wide (the shader's sand is
`smoothstep(0.02, seaRamp.x, wetness)` of the baked union mask, and its bay has no shore ring to widen it) before a
flat backshore, with the bank rising from ~1.05 R; the fjord's shelves rise 5–10 % at the arm heads and 44–50 % on the
flanks straight off the waterline. And the coastal kit's own driftwood (`addCoastalDriftwood`) lay on the plain
1.03–1.12 R circle of the DISC, blind to the authored contour: on Saltmere 42 logs at 1.05–1.24 R on the meadow behind
the strand (up to 3.3 m above the water, none on the beach class); on the fjord 72 logs from 0.52 to 1.88 R, median
7.7 m above the water, nine of them in the water.

**What changed (`src/world/maps/strandWrack.ts`, called last in `dressMapExtras`).** A sea lake that authors a shelf
(`LakeConfig.shelfM` — exactly the three sea maps) gets a wrack line derived from its contour: the band law marches
each azimuth of the authored contour for the water's edge (the first dry water-mask metre, refined to 0.25 m) and the
sand's end (union wetness < 0.02, `_waterWetnessAt`), every ~4 m of arc and interpolated between; the band runs from a
metre above the water's edge to the sand's end, at most 8.5 m up the beach and never narrower than 2.2 m (Saltwind).
Along the arc one draw station per half metre lays weed / kelp mats (three or four flat fronds thrown over each other —
brown bladder wrack, fresher green, dark olive), bleached bent sticks, patches of half-buried pebbles and pale shells,
with the line's density and its position in the band wandering on lake-phased sines (`shorelinePhases`) so there are
stretches of thick wrack and stretches of nearly clean sand; beside each landing (the coastal jetties, Saltwind's two
piers — a shore ledger the kits fill in) a timber baulk, a broken crate and a rope coil. Gates: never in the water (the
whole footprint against the mask — a frond's corner had crossed the harbour pond's edge on Saltwind), within 0.6 m of
the water level and under ~9° of slope (never the bank above the beach — the fjord's flanks carry nothing, its heads a
light line), ≥ 6 m from roads, 26 m from spawn pads, off the beached boats (4.2 m), the jetty decks (2.6 m) and every
building footprint, a metre inside the 470 m dressing square. Everything is soft dressing in the existing buckets:
vertex-coloured `baked` (one merged mesh per map, the coal heaps' attribute set) and textured `wood` for the timber and
planks — no new material, instance pool or collision record, so no dedicated shard moved. The coastal driftwood now lies
in the same band (its draws and original clearance gate untouched, so the buoys and jetties keep their positions; a log
the strand refuses is not built). Seed 1337: Saltmere 1,328 stations → 194 mats, 38 sticks, 270 pebbles, 125 shells,
4 landing pieces (1,164 pieces, 14,076 triangles, 23 ms); Saltwind 148 / 20 / 141 / 95 / 7 (808 pieces, 9,912 tris);
Nordhavn 75 / 5 / 143 / 61 / 7 (487 pieces, 6,060 tris); every driftwood log on the strand within 0.37 m of the water.

**Verified (A → B).** Three new views in the pinned table, 4 m over the wrack band looking along the beach at gameplay
height (`strand-e-low` Saltmere 192° → 168°, `strand-fjord-low` the middle arm's head, `strand-w-low` Saltwind's east
shore 22° → −22°, the band law's own points). By eye: Saltmere's strand carries a broken dark band a few metres above
the water — clumps of mixed olive, green and brown, a log, a stick, grey pebbles and white shell specks, gaps between
the thick stretches — the first cut's two-frond 0.45–1.0 m mats read as dark rectangles in the 2× crop and were
re-authored as ragged three-to-four-frond clumps; Saltwind's line sits on its 3 m sand at the grass edge; Nordhavn's
head shows logs, pebbles and shells on the grass edge above the wet strip and nothing on the rock flanks; nothing
floats, nothing stands in the water, nothing on a bank. At 40 m (shore-e/w-oblique) the line is a faint broken band
along the beach's upper edge, not a row; from 260 m (bird-e/w-edge) it is sub-pixel. Pixels moved (|Δluma| > 8,
`ab-diff.mjs` on the repository's decoder): the strand boxes of the low views 2.1 % (Saltmere, mean 2.15/255), 1.9 %
(Saltwind), 3.1 % (Nordhavn); the obliques 0.4–1.4 %; the birds ≤ 0.2 %; views over grassland move 12–22 % between
any two runs (grass, trees and cloud animation — frame noise, the r55 caveat). Headless, three seeds
(`wrack-audit.mjs`, and the receipt): no vertex over water, lowest vertex within 3 cm of the ground, ≤ 0.6 m above the
level, off roads / pads / the square's edge.

**Receipts.** `strandWrack.selftest` (new, in `npm test`: the three consumers and only those, every piece of nine
builds against the rules, the band law on Saltmere, the density's range and phase keying, the no-shelf opt-out,
determinism); `beachedBoat` (its twelve historical control rows re-pinned — the mangrove rows unchanged),
`winterLakeGeometry` (the three non-winter aggregates), `riverLandings` (Saltwind's budgets now measure the 84 landing
pieces alone; the draw count and state re-pinned — the wrack's draws follow the landings', seed-independent),
`map-probe-runtime` (34 views, digest); `riverReedContact`, `shallowWater`, `railCoalStockpiles`, `railWashout`,
`shoreline`, `trackSurface`, `liquidMarshSurface`, `terrainStreaming`, `roadContinuity`, `mapQuality`, `spawnClearance`,
`propsScheduling`, `environmentExpansion`, `worldBuildCoordinator`, `badlandsRelief`, `garage:terrain:check` and the
typecheck unchanged and green. No map source changed (the derivation keys on the authored shelf), so no projection
block moved.

**Still open.** The coastal kit's jetty is placed at 1.05 R of the disc: on Saltmere it stands 15–30 m inland of the
water on the flat strand and on Nordhavn's heads ~10 m up the bank, its fixed-height sagging deck unable to run over
the 0.72 m shallows — the larger pieces gather beside it as authored, but a pier that reaches the water is a follow-up
(a planted deck like the river landings') — landed in round 58 below: the jetty and Saltwind's piers now stand where
the strand law puts them, with planted piles, a gangway and a moored hull. The boats stay where round 47 put them
(1.09–1.19 R, 30–40 m up the flat strand on Saltmere). The fjord's flanks carry no wrack by the slope gate; only its
arm heads do.
### Round 57 — 2026-09-24: the rail spur kit

Round 48's open item on Tarkhan Steppe (lane r57-rail-spur, from origin/main 63bf9b4a6): the grain station was
designed as a rail-spur station and had no track, because `maps/mapKits.ts` laid rails at fixed centre coordinates for
Cinder Junction's siding fan only.

**The kit.** A map authors a spur as a path in its terrain config — `terrain.railSpurs: [{ path: [[x, z], …], gauge?,
ballast?, bufferStop?: 'end' | 'both' }]` (`src/world/railSpurs.ts`: the config type, the span resampler, the
centreline distance and the berth exclusion, renderer-free). `createLayout` carries the list on the layout
(`L.railSpurs`, beside the lake discs) and `dressMapExtras` lays it after every other kit through ONE span layer shared
with the yards: a span is a ballast slab, twin rails at ±gauge/2 and a sleeper every 1.4 m pushed into the existing
baked / dark / wood buckets (no extra draw call; the map tones and the grime overlay come for free), with a buffer stop
0.8 m past each closed end turned to the track. Two lays: 'along' is the yards' historical arithmetic (pitch between
the span ends, level sleepers, world-vertical offsets); 'full', for authored spurs, lays 4 m spans, each slab the
least-squares plane through seven ground samples of its footprint (corners, end centres, midpoint — a symmetric
design, so the fit is a mean and two slopes), rolled with the cross-slope, every part placed in the span's own frame
(sleepers on the slab, rails on the sleepers), and a 0.36 m deep slab seated 0.05 m low whose top stays at the yards'
+0.15 m — its sides run 0.26 m below the fitted plane, deeper than the ground falls under any corner. The berth: the
height field's `_noVeg` exclusion (the hardstand aprons' plumbing, which grass, trees, bushes, the scatter and segment
props and the litter all read) is true within 3.6 m of a centreline, so nothing grows or is seeded on the line. The
dry-span check is the yards' predicate generalised to a heading (`railSpanIsDry`; the axis-aligned wrapper
`railSegmentIsDry` reproduces the historical sample points number for number). Soft dressing by contract: no collision
record, a hull rolls over the 0.2 m bed like a curb, the bot planner never sees it (no navigation trap: the standing
rule and cliff-grade laws see the untouched ground).

**Cinder Junction, Foundry, Caldera, Skybridge — migrated, byte-identical.** `railLine` is now a two-point path through
the same resampler (10 m spans, the remainder in the last one: the 415 m line keeps its 5 m stub) under the 'along'
lay; the yards' stops keep their historical yaw. The rail-part digests, the whole dressing digests, the seeded draw
counts and the next draw of all four maps at seeds 1337 / 2049 / 7719 match the pristine base (harness
`$SP/r57/rail-digests.mjs`, A = origin/main worktree, B = this lane), and `railSpurs.selftest` pins the four yards'
rail-part digests at seed 1337 as the migration certificate (railWashout and railCoalStockpiles do not detect a rail
change on their own). The yard's A/B captures differ by frame noise only (yard-fan-low: mean |Δ| 0.12/255, 0.1 % of
the world band moved; spur-bird 0.01/255).

**Tarkhan Steppe.** `railSpurs: [{ path: [[144, -181], [440, -181]], bufferStop: 'both' }]` — one siding along the
elevator row's loading face, routed from the shard's structures and the height field, never a frame: 7 m north of the
long store's back wall (its north face at z −188.4), past the head tower (−192) and the granaries, between the
(287..298, −176..−163) store and the row, a level crossing over the east track at x ≈ 279, ending at the foot of the
eastern rim band. The station road climbs that rim at 24 % (x 444 → 508: 4 → 19 m, and the height field is a constant
18.5 m past the square), so no rail grade reaches the edge: the line stops at x 440, where the ground begins to twist
up (x ≈ 446), the outer network implied — a cutting through the rim band is terrain work, not dressing. 74 spans,
148 rails, 222 sleepers, two stops, 2006 seeded draws after everything else the map dresses. Measured (headless, seed
1337): every slab's bottom corners ≥ 0.195 m under the ground (no gap anywhere), every top corner ≥ 0.058 m above
it; rail centres 0.12–0.27 m and sleeper centres 0.06–0.18 m over the ground; span grades ≤ 7 %; no span over
liquid; the berth re-rolls the seeded wattle fence beside the line and the hedgehog cluster that stood on the crossing
(284.5, −184.5 → 283.3, −195.9). How the lay was chosen (worst slab corner against the ground): 0.23 m with 10 m spans
and the two-sample lay, 0.16 m with 5 m under the least-squares lay, 0.13 m with 4 m and no better with 3 m — what
remains is cross-track curvature no plane follows, and the deep slab hides it. Captures (`tools/map-view-probe.mjs`;
four views added to the table, 31 → 35, digest a784a8b8…, `map-probe-runtime` re-pinned): spur-station-west — the
siding from the west stub past the store to the gantry and the head tower, rails on the ballast, sleepers under them,
the stop closing the stub, bare ground on A; spur-crossing — the line either side of the store at the east-track
crossing; spur-bird — a straight siding behind the elevator row from the stub to the rim foot; A/B world band moved
1.7 / 2.1 / 2.6 %. Judged on 1280 px reductions.

**Collision and pacing.** The steppe shard was recaptured headless on this tree (the `.qa-dev/collision-capture.mjs`
pattern, the capture tool's pack script). The committed shard had gone stale against main's own world — a recapture
on the untouched base gives 2427 / 920 / 1302 records against the committed 2346 / 916 / 1278 — and the berth adds +2
obstacles (fences and hedgehogs re-rolled, structures unchanged). `dedicatedWorldCollision` census re-pinned (steppe
2441 / 2152 / 1314, the 12 kept removals), `collisionManifestCodec` storage budget re-based (1239200 B + 10 %);
`server/battlePacing.selftest` in full: 14 / 124 timeouts (bound 15), median 449 s, sub-120 0 — steppe's one timeout
is the shard refresh, not the berth (the base with its own fresh shard shows the same first-sample timeout on the
steppe-only invocation; the seeds of a single-map run start at index 0, so those lines are not the full run's).

**Receipts (exit 0).** railSpurs (new, in the core inventory), railWashout, railCoalStockpiles, riverLandings,
hardstandSurface, roadLookupGrid (two declared deltas for the berth lines of `heightFieldBuildSteps` — the historical
hash is unchanged), roadPlacementAdmission, roadBankComposition, roadDistanceField, roadContinuity, roadInheritedGrades,
roadStations, roadPortalIndex, roadAuthoredExits, roadCutRecovery, roadBorderCorridor, roadMaskProfile, badlandsRelief,
playableRelief, terrainStreaming, shoreDirtMask, terrainWetLayer, terrainFastGrid, terrainProjection,
terrainMaterialOwnership, sourcedTerrainPreparation, workedGroundMask, trackSurface, shallowWater, waterRipples,
spawnClearance, spawnPads, formationPlacement, matchPlacement, structureCollision, vegetationClearance,
groundCoverClearance, authoredTreePlacement, treePoolCapacity, propsTextureRows, fieldTrenchTerrain,
assaultTrenchTerrain, mapQuality, mapIntegration, propsScheduling, environmentExpansion, worldBuildCoordinator,
collisionManifestCodec, collisionManifestLoader, dedicatedWorldCollision, dedicatedWorldCollisionMemory, battlePacing,
map-probe-runtime, public-repo-hygiene, attribution:check, garage:terrain:check, typecheck; villageWear and
mangroveWaterPalette map-config digests re-pinned (steppe.ts authors railSpurs).

**Open.** A second loading track or a run-round loop at the station; a planked deck where a spur crosses a road; the
ballast's grey against the golden ground is the yards' vertex paint — a per-map ballast tone if it reads too dark on a
pale map. The cutting through the rim band was authored in round 63 (2026-09-24): the siding now runs to the map edge
through it (see the round-63 section).

### Round 58 — 2026-09-24: jetties at the water's edge

Round 56's open item (lane r58-jetties from origin/main 256feb115; A = a pristine detached worktree at that commit, B =
this lane; `tools/map-view-probe.mjs` at seed 1337 on the round-47 shore views, the round-56 strand views and four new
round-58 jetty views, one run at a time under the probe mutex; judged on 1280 px reductions and 2× centre crops in
`$SP/r58/cap/`, numbers in `$SP/r58/`).

**What was wrong.** The coastal kit's jetty stood at 1.05 R of the lake DISC with fixed-height piles (0.9 m, a little
shorter per station) and a deck that sagged 5 cm a span toward water it never reached: on Saltmere Bay 25–30 m inland
on the meadow behind the strand (the A frame from the shallows: a dark strip on the grass), on Nordhavn's arm heads ten
metres up the bank, hidden from the water behind the slope. Saltwind's authored piers stood at 1.02 R of the contour
(13 m from the water) with their deck 0.65 m over the BED: the sheet's surface lies 0.72 m over the bed inside a lake's
planar core (shallowWater.ts, bed + depth), so the outer five metres of each pier rode awash.

**What changed (`src/world/maps/shoreJetty.ts`, `planShoreJetty`; the kits in mapKits.ts and riverLandings.ts call it).**
A landing is derived from the lake's authored contour and its water level, with the march the wrack line uses
(strandWrack.ts `strandBandAt`: the water's edge is the first dry water-mask metre along the azimuth, the sand's end the
union wetness under 0.02):
- the shore end stands a metre landward of the wrack band's end on a flat strand (Saltmere: 9.5 m from the water's edge
  on the level sand; Saltwind: 4.2 m) — or, where the ground rises through the deck height within that reach
  (Nordhavn's arm heads: a 10 m shelf and a 0.14 R bank), the deck lands ON the bank where the highest ground across
  its width comes within 5 cm of its underside;
- the planar core (mask 1, the bed at the level, across the deck's full width) is found inside the water's edge
  (Saltmere 2.5 m in, the fjord 2–3 m, Saltwind 4.3 m); the deck runs seaward in the kit's 1.9 m spans until it stands
  4.6 m over the core past its boundary (a hull's half-length, a span and a fender gap), within 4–10 spans — sized to
  the shelf: Saltmere 9 spans (17.1 m), Nordhavn's heads 5–7, Saltwind's authored 10 (19 m) kept;
- the deck top is a constant 0.45 m over the water SURFACE at the tip (the level + the sheet's depth, 0.72 m on the
  three sea maps: deckY = level + 1.13); every pile runs from 10 cm into the bed under it to the deck — the river
  landings' planted kit (`jetty()` with the support field): 1.3 m piles over the shallows and on Saltmere's level sand,
  stubs where the deck lands on the bank;
- every pile station and the tip keep 7 m from roads and 26 m from spawn pads inside the 470 m square, and the ground
  under every station past the shore end stays 0.30 m under the deck;
- a gangway (one plank with three battens, run = rise / 0.36 within 1.9–4.2 m, its foot a centimetre into dry sand)
  wherever the shore end stands more than 0.40 m over the ground — Saltmere and Saltwind (1.17 m of rise, 3.25 m of
  run), the fjord's flatter heads (0.6–0.8 m) — and none where the deck lands on the bank;
- a clinker hull (the beached hulls' shape, `clinkerHull`, now shared) moored alongside the outer spans where all
  five hull points float over the core, its bottom 0.28 m under the surface (the bed 0.44 m under the keel), a slight
  list, a mast on some, two bollards on the deck edge with a line to each gunwale — all in the existing wood bucket: no
  new material, instance pool or collision record.
The coastal kit draws the jetty's azimuth as before (π ± 0.25 rad) and, if that azimuth admits none, walks a twentieth
of a radian at a time within the window; at seed 1337 / props 2002 every jetty planned at its drawn azimuth (Saltmere
166.4°, Nordhavn 176.5° / 189.7° / 173.9°, Saltwind's authored −25° / 45°), so the old and new jetties share an axis.
The pieces that key on a jetty draw from the landing's own stream (`landingStream`, keyed by the shore end and the
spans) and the kit burns the retired jetty's 94 draws, so every boat, log and buoy of the map keeps its exact place;
Saltwind's beached boat, which keys on the pier, is hauled up 3.5 m behind the gangway's foot instead of 25 m up the
backshore; the round-56 timber, crate and rope gather beside the new shore ends through the ledger. The mangrove
landings (no authored shelf) are untouched. Nothing is hand-placed: an azimuth's contour either admits a jetty of the
kit's length or it does not (the receipt shows the law refusing a strand without water, a shore without a core, a
road across the stations, a pad at the shore); at the shipped seed nothing was refused.

**Verified (A → B, `$SP/r58/cap/`).** Four new views in the pinned table (38 → 42), 3 m over the bed from the shallows
on the moored hull's side, 9 m past the tip and 13 m off the deck axis, looking at the deck's middle (`jetty-e-low`,
`jetty-fjord-low`, `jetty-fjord-north-low`, `jetty-w-low`). By eye on the 1280 px frames and the 2× crops: Saltmere —
A: the jetty a dark strip on the meadow behind the beach; B: the deck runs from the sand out over the turquoise water,
the gangway down to the sand, the piles into the water, the hull alongside the outer spans with its mast and lines,
the strand's timber beside the shore end. Nordhavn's middle arm — A: a short dark row on the grass bank; B: the deck
leaves the bank on a short gangway and runs out over the fjord, the hull alongside. Nordhavn's north arm — A: nothing
visible from the water (the old jetty up the bank behind the slope); B: the deck lands on the bank at grade and runs
out, the hull alongside. Saltwind — A: the pier's outer spans ride at the surface; B: the deck stands clear of the
water, the hull moored, the beached boat hauled up behind the gangway. Nothing floats, nothing buries, no deck touches
the water. The round-47 / round-56 shore views (obliques, birds, strands) are unchanged to the eye apart from the
jetties; from 260 m (bird-e-edge / bird-w-edge) a jetty is a few dark pixels at the water's edge. Headless:
`shoreJetty.selftest` audits 321 plans over nine fields (158 with a gangway, 163 landing on a bank, 320 with a hull),
every pile planted at bed − 0.10, every hull over the core at its draft, every gangway foot dry; the A/B receipt probe at
seed 1337 finds Saltmere's 7 boats and 41 logs, Nordhavn's 15 logs and Saltwind's 808 wrack pieces at the same
positions / bytes, while Saltmere's and Nordhavn's wrack lines re-roll past the jetty (the per-piece draws follow
admission and the deck's keep-out moved) under the same law.

**Collision.** The jetty was and is soft dressing (`buckets.wood`; the dedicated shards carry no jetty record), so no
shard moved, no recapture or headless capture mode was needed, and no bot lane gains a trap.

**Receipts.** `shoreJetty.selftest` (new, in `npm test`); `riverLandings` (the per-landing strides — 62 wood pieces and
25 support receipts per Saltwind landing — the freeboard over the surface, the gangway and the hull; the main-stream
draw count 12005 unchanged); `beachedBoat` (the nine strand rows re-pinned, dated); `winterLakeGeometry` (the three
non-winter aggregates); `map-probe-runtime` (42 views, digest); `strandWrack`, `mangroveFisheryWharf`,
`riverReedContact`, `railCoalStockpiles`, `railWashout`, `railSpurs`, `shallowWater`, `shoreDirtMask`, `shoreline`,
`trackSurface`, `liquidMarshSurface`, `terrainStreaming`, `roadContinuity`, `mapQuality`, `spawnClearance`,
`propsScheduling`, `environmentExpansion`, `worldBuildCoordinator`, `badlandsRelief`, `garage:terrain:check`,
`public-repo-hygiene`, `attribution:check` and the typecheck green. No map source changed, so no projection block
moved.

**Open.** The moored hull is static (no bob or sway on the sheet); Saltwind's piers keep their authored 19 m rather than
the shelf-sized length; a wrack line's stations past a landing re-roll whenever a keep-out moves — a per-station draw
budget in strandWrack would freeze them. (All three closed by round 67: the hull bobs and sways
render-side, the piers are sized to the shelf, and every station draws from its own stream.)
### Round 60 — 2026-09-24: the last bot against a passive target

Shared main sat at 14/124 after round 48 — Tidegate Polders 3/4, Whiteout 2/4, one seed each on Desert, Frosthollow,
Urban, Tarkhan, Railyard, Badlands, Caldera, Ruinspires and Reservoir. Every capped seed was replayed with
`tools/pacing-trace.mjs` and three finer lane probes: 2 s hull / gate / ammunition rows, a shell ledger that reads the
authority's `shell_fired` / `shell_hit` / `shell_impact` events and places every miss at the target plane (lateral,
over / short, height), and a terrain profile along the gun line. What they showed, in order of weight:

1. **Empty racks.** Nine of the fourteen capped battles ended with the survivor's ammunition at [0, 0, 0] — Tidegate
   seeds 0 and 3 and Whiteout seed 3 with *two* empty bots circling a hull they could never finish. A bot fires 55–95
   rounds a battle from a 52-round rack (24 APFSDS / 16 HEAT / 12 HE by default), and against the idle host it fought
   from its hold band at 165–300 m: with the normal tier's fire-control error (aimErrMult 4.25 on a 0.30 m gun, σ ≈ 6
   mrad, the after-shot bloom on top) the shells flew over the turret or dug in short — Frosthollow seed 2: 25 rounds,
   8 on the hull; Ruinspires seed 2: 33 rounds, 3 on the hull and 22 into a rise 25–55 m in front of the pad that the
   eye-to-eye LOS and the turret-top gun lane both cleared. Lateral error stayed under a metre: the misses are
   vertical, which is to say a range problem, and the front-plate plink is the part that landed.
2. **A doctrine written for return fire, applied to a gun that never fires.** Shoot-and-scoot legs (one shot per 14 s
   leg for snipers and flankers) deferred the round-48 closed-gate flank indefinitely (`penDeniedT` 53–113 s with
   `scooting` true), the low-health fallback cycled 8 s retreats from a target that had not fired in ten minutes
   (Badlands 3, Whiteout 1, Railyard 2), and the stalemate settle holds froze the hull for 3.5 s at a time inside the
   flank windows, so a casemate's ring never changed the aspect (Desert 0: aspect wobbling between 4° and 35° through
   eleven 8 s windows).
3. **Caldera seed 3 was no stalemate.** The bravo M1A2 rolled onto its roof at 20 s coming down the crater slope and
   lay there for 880 s: the rollover lifecycle rights a settled hull after five seconds, but the bot's unstick throttle
   and steer reset the settle every tick, and no bot ever asked for the self-right a player has.

Fixes (`src/game/ai.ts`; one mirrored line in `src/game/state.ts`), each proved on the seed that showed it and judged
only by the full receipt:

- **The passive-target press.** A target whose hull has held still and whose gun has stayed silent for
  `PASSIVE_TARGET_STILL_S` / `PASSIVE_TARGET_SILENT_S` (the target's own reload channel is read, so a player's shot or a
  bot's counts the same), against which this bot's shells have stopped penetrating for `PASSIVE_PRESS_NO_PEN_S`, is
  pressed after the deployment window to a point-blank side aspect (70 m, ~75° off the nose, the side nearer to where
  the bot stands). Scoot legs, the low-health fallback, the settle holds and the flank ring yield to the press; the
  moment the target moves or fires it ends and every ordinary rule resumes, so an active player is never charged and
  the opening is untouched (Tidegate 2: 900 s → 544 s).
- **The weak-spot probe scores only zones the gun can reach.** After the first press three Copper Mesa seeds capped:
  the bots stood at the foot of the host's plateau, probed the lower hull (ratio 14–21, gate open) and put 66 rounds
  into the rim in front of it. The probe now casts the world ray from the gun to each candidate once per pass (cached
  across the shell slots), rejects zones behind terrain and zones outside the gun's elevation / depression arc (Copper
  Mesa 2 and Coastal 3 afterwards: gate open, gun pinned at its stop, 29 rounds from 50 m with 60 mrad of pitch error
  and no damage), and falls back to the visible turret when the tier's whole set is masked — the round-48 probe-miss
  relocation then moves the hull when that is masked too.
- **Press-point rules.** A press point must reach the hull with the gun (lane ray from the gun height to 0.4 h, inside
  the arc); a point whose probe finds no zone, whose gate stays closed for 6 s or whose gun stays pinned for 3 s is
  vetoed for two minutes and another is picked (two rings, 70 m and 45 m, three bearings each); the press honours the
  gun-limit back-up nudge.
- **A flank that leaves the gate closed carries on toward the rear** (Coastal 3's Strv 103 stood at 69° on the M1A2's
  side, every flank "completing" at once), and the ring prefers the side whose first point lies further round.
- **An overturned bot holds its drive still and requests the self-right**; both authorities consume the bit (Caldera
  3: 900 s → 390 s).

Receipts: `src/game/ai.selftest.mjs` [14] a passive target is pressed to a side aspect and an active one is not, [15] a
sniper with a solution keeps firing from its spot (13 shots a minute, no scoot leg once the target has proven passive;
shoot-and-scoot kept against a target that shoots back), [16] the overturned bot's SELF_RIGHT bit and stilled drive,
[17] the probe skips masked zones, falls back to the turret and reports no solution when every gun-height ray is
blocked. `botGunLane.selftest`'s fixture berm 2.0 → 2.4 m (aiming at the visible turret pitches the muzzle over a 2 m
berm; 2.4 m keeps the eye clear and the muzzle lanes blocked); `authoritativeBots.selftest`'s moving-battle hit-rate
ceiling 0.58 → 0.70 (54.7 % → 62.5 % on the same eight seeds: the fired sample loses its doomed rounds, the aim model is
untouched).

Full-receipt ledger (same 124 seeds; timeouts / median / p10):

| iteration | change | timeouts | median | p10 | note |
|---|---|---|---|---|---|
| 0 | base 256feb115 | 14 | 448.9 | 289.9 | Tidegate 3, Whiteout 2 |
| 1 | passive-target press | 11 | 393.3 | 261.8 | nine caps resolved; Copper Mesa 0 → 3, Delta, Saltwind, Tidegate 1 new (press at the plateau foot) |
| 2 | + probe visibility, press lane to the hull | 5 | 458.1 | 291.2 | Tidegate 0, Whiteout 0, Copper Mesa 0; Saltwind 0 → 2 |
| 3 | + self-right, masked press point vetoed | 5 | 437.9 | 283.0 | Caldera and Saltwind 3 resolved; Coastal 3 and Copper Mesa 2 new (gun pinned at its stop) |
| 4 | + gun arc on probe and press, closed-gate / pinned veto, rear flank | 5 | 465.5 | 290.1 | Urban 0 and 2, Tarkhan 1, Ruinspires 3, Saltwind 0 |

What remains is not the passive-target stalemate. Urban 0 / 2 and Ruinspires 3: the survivor has no target for
200–400 s and the 8 s no-contact sector search re-routes it every window to the same midpoint it cannot reach among
the blocks and ruins — a navigation problem for a round of its own. Tarkhan 1 and Saltwind 0: the survivors' racks are
empty after the bot-versus-bot chase at 200–300 m, the fleet's ammunition economy. Open with them: an empty bot's
options (ram or retire), and the median's headroom (the probe filters make every bot more patient; a shorter passive
dwell — 15 s instead of 20 — was prepared as iteration 5 but not measured, the shared probe mutex being held by the
round-59 performance campaign for the rest of the session).
### Round 59 — 2026-09-24: performance audit after the map rounds

Lane r59-perf-audit from origin/main 256feb115 (the deploy-79 row), measured against deploy 66 (ad233e1a1, water pass 8 —
the tree before rounds 47–57); `package.json` differs by two script lines, no dependency moved. Rounds 47–57 gave the
battlefields three redesigns (Frosthollow, Amberford, Tarkhan Steppe), the mesa ring stack and the arid skies, the sea
contours and the outland water field, the ring forest's matte canopy and Titan's analytic wall crag (55), the strands'
wrack (56) and the rail spur kit (57). This round measures all thirty-one maps on both trees, fixes what regressed and
records what the designs cost.

**The probe.** `tools/tmp-r59-map-perf-probe.mjs` (a throwaway over `tools/map-probe-runtime.mjs`, the round-48
convention): one private vite server and one headless browser per tree, one page per map, the desktop tier at seed
1337 in a `t90m_x`, a solo battle through `__DEBUG.beginSoloBattle`; the activation trace (`window.__WORLD_LOAD`: build,
its height-field / terrain / vegetation / props stages, the vegetation slice timings), long tasks from document start
(`PerformanceObserver`), the sourced textures awaited, every bot frozen (`aiCtl = null`); then four poses — chase and
bird relative to the hull (`HULL_RELATIVE_POSES`), `edge-e-low` and `centre-far` from the view table — with 90 rendered
frames each: main-thread ms per frame (the game's animation-frame callback, `performance.now()` against the frame's
timestamp; the callback order is detected at run time), GPU ms (`EXT_disjoint_timer_query_webgl2` from the frame's first
renderer submission to the post-frame task — ANGLE Metal answers timer queries at command-buffer granularity, so GPU ms
is supporting evidence, never the verdict), `renderer.info` calls and triangles over all passes; then the scene
inventory — instances per subsystem (trees are the `InstancedMesh`es carrying `aLodF`, grass the `world-grass` program
key, the ring forest `horizon-forest`), the texture-byte estimate of `tools/perfprobe.mjs`, geometry bytes, programs —
and, with `--breakdown`, one subsystem hidden at a time at the chase pose (draw attribution). The receipts, the
tables and the captures live in the lane's scratch (`r59/C`, `C2`, `F`, `F2`, `W`); the summary is
`docs/references/perf/round59-map-perf-audit.json`.

**Machine and protocol.** The box was never idle: two sibling lanes ran their fleet receipts throughout and the
1-minute load sat at 5–20 (up to 30 during the fixed-branch pass), so the campaign ran under one hold of the probe mutex
at `nice -n 19` with every map measured main → base → main → base inside one process — drift and bursts cancel inside
each pair — and the load average is printed beside every wall-clock number. Wall-clock is secondary evidence here:
draw calls, triangles, instance counts, texture / geometry bytes, programs, long-task counts and the ratios between
build stages are load-insensitive and decide the round. Chunk 1 (verdant, desert) coincided with a foreign `tsc` burst
at load 12–14 and was re-measured; the skybridge and blackglass pairs disagreed by more than 1.25× with every unrelated
stage — the page's own boot before the map, the height field, the same slowest prop slices — moved by the same 30–45 %,
the signature of host drift, and were re-run (0.97× and 1.02×). Budgets read against: `tools/perfprobe.mjs` (fps median
≥ 60, frame p99 ≤ 25 ms, worst-frame draw calls ≤ 900, triangles ≤ 7 M with the 6 M ratchet, scene textures ≤ 512 MB,
load-to-ready ≤ 5 s) and `tools/loading-budget-probe.mjs` (Garage → battle < 5 s, click-to-control < 7.5 s, transition
frame gap < 500 ms; both are production-build measurements, so a dev-server build here is compared with its own
baseline and the fleet, not with the 5 s line).

**Every battlefield on current main (256feb115).** Means over the two runs per map; the load1 beside the build is the
1-minute average when that map started (verdant 4.7–4.9 s at load 3 in the smoke runs, 5.1 s at load 7.7 here).

| Map | build ms (load1) | activation ms | chase CPU / GPU ms | bird CPU / GPU | edge CPU / GPU | far CPU / GPU | calls (chase / worst) | tris M (chase / worst) | trees | ring | props | grass | tex MB | geo MB | programs | entry long tasks (max ms) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Verdant Field (`verdant`) | 5,064 (7.7) | 5,064 | 5.4 / 26.3 | 7.0 / 20.4 | 8.6 / 20.4 | 7.0 / 13.0 | 693 / 848 | 7.32 / 7.68 | 15,187 | 8,000 | 2,329 | 10,818 | 115.3 | 31.8 | 208 | 26 (645) |
| Dust Line (`desert`) | 3,249 (6.7) | 3,257 | 4.5 / 22.9 | 6.8 / 15.8 | 3.7 / 23.9 | 3.3 / 24.7 | 616 / 828 | 4.30 / 4.30 | 5,733 | 0 | 2,094 | 27,703 | 111.9 | 28.9 | 204 | 9 (608) |
| Frosthollow (`winter`) | 5,539 (10.7) | 5,549 | 13.7 / 25.0 | 15.6 / 16.1 | 10.2 / 14.7 | 5.3 / 17.4 | 764 / 824 | 7.18 / 7.18 | 11,126 | 0 | 2,900 | 432 | 111.5 | 39.3 | 207 | 25 (1,022) |
| Ashfall City (`urban`) | 5,011 (11.0) | 5,021 | 4.5 / 20.4 | 7.3 / 18.4 | 4.3 / 25.1 | 3.5 / 16.3 | 644 / 789 | 8.64 / 8.64 | 6,876 | 8,000 | 2,201 | 13,265 | 109.8 | 102.0 | 209 | 9 (687) |
| Saltmere Coast (`coastal`) | 3,248 (10.5) | 3,255 | 6.3 / 27.6 | 8.3 / 18.0 | 6.0 / 24.8 | 3.5 / 18.5 | 732 / 843 | 5.78 / 5.78 | 8,180 | 8,000 | 2,353 | 834 | 111.9 | 31.6 | 208 | 10 (677) |
| Amberford (`autumn`) | 3,914 (7.7) | 3,920 | 4.8 / 24.8 | 9.1 / 25.2 | 6.2 / 22.2 | 5.3 / 19.4 | 691 / 837 | 9.55 / 9.55 | 12,353 | 8,000 | 2,994 | 35,661 | 114.3 | 35.3 | 213 | 9 (616) |
| Tarkhan Steppe (`steppe`) | 9,726 (8.5) | 9,733 | 4.7 / 20.8 | 8.8 / 19.7 | 9.0 / 21.3 | 6.8 / 18.2 | 656 / 795 | 4.81 / 4.81 | 2,949 | 8,000 | 2,846 | 14,301 | 112.9 | 28.8 | 209 | 27 (678) |
| Cinder Junction (`railyard`) | 3,206 (10.3) | 3,213 | 6.0 / 22.9 | 8.1 / 19.2 | 5.3 / 26.0 | 6.0 / 10.5 | 663 / 786 | 4.81 / 4.99 | 4,482 | 8,000 | 2,399 | 2,566 | 125.1 | 38.1 | 206 | 9 (608) |
| Frontier (`frontier`) | 4,453 (9.4) | 4,461 | 6.6 / 19.9 | 9.2 / 20.6 | 6.2 / 21.6 | 4.7 / 15.8 | 824 / 899 | 9.56 / 9.60 | 16,878 | 8,000 | 2,327 | 10,786 | 113.2 | 34.2 | 209 | 24 (631) |
| Nordhavn Fjord (`fjord`) | 4,697 (12.8) | 4,707 | 8.4 / 17.6 | 8.7 / 18.3 | 5.3 / 21.5 | 5.6 / 18.0 | 779 / 780 | 9.48 / 9.48 | 14,580 | 8,000 | 2,441 | 3,972 | 111.4 | 33.7 | 210 | 14 (877) |
| Delta (`delta`) | 4,754 (15.9) | 4,762 | 7.3 / 22.2 | 10.4 / 21.6 | 6.8 / 19.6 | 4.5 / 16.5 | 690 / 823 | 9.60 / 9.60 | 18,584 | 8,000 | 1,057 | 12,441 | 114.9 | 36.0 | 211 | 17 (815) |
| Badlands (`badlands`) | 4,594 (18.5) | 4,605 | 8.9 / 22.8 | 11.1 / 20.0 | 6.3 / 19.3 | 4.3 / 17.7 | 715 / 826 | 4.32 / 4.32 | 4,137 | 0 | 3,187 | 1,836 | 113.2 | 39.0 | 205 | 14 (829) |
| Monsoon (`monsoon`) | 4,640 (14.8) | 4,648 | 9.6 / 32.9 | 9.7 / 17.4 | 7.7 / 21.3 | 5.5 / 14.6 | 728 / 755 | 12.32 / 12.32 | 23,365 | 8,000 | 2,131 | 12,463 | 113.7 | 36.4 | 208 | 14 (715) |
| Alpine (`alpine`) | 4,238 (10.3) | 4,245 | 10.3 / 19.2 | 10.8 / 18.7 | 8.7 / 17.6 | 4.5 / 16.7 | 867 / 868 | 9.72 / 9.72 | 18,249 | 8,000 | 2,438 | 1,898 | 110.4 | 38.8 | 208 | 13 (789) |
| Caldera (`caldera`) | 3,661 (15.0) | 3,668 | 7.3 / 22.2 | 10.1 / 18.8 | 5.8 / 19.9 | 3.5 / 18.9 | 741 / 874 | 7.37 / 7.37 | 8,497 | 8,000 | 3,770 | 2,531 | 124.1 | 36.1 | 203 | 7 (663) |
| Foundry (`foundry`) | 3,090 (8.9) | 3,097 | 4.8 / 25.8 | 7.0 / 18.2 | 3.3 / 19.7 | 2.9 / 18.1 | 654 / 795 | 6.50 / 6.50 | 7,271 | 8,000 | 2,658 | 2,161 | 125.4 | 39.2 | 206 | 10 (618) |
| Ruinspires (`ruinspires`) | 4,737 (6.0) | 4,746 | 5.2 / 26.1 | 7.5 / 19.0 | 4.7 / 24.7 | 3.5 / 18.6 | 696 / 837 | 7.69 / 7.69 | 2,677 | 0 | 2,279 | 1,023 | 110.8 | 108.9 | 208 | 15 (599) |
| Blackglass (`blackglass`) | 4,500 (10.7) | 4,508 | 7.2 / 21.2 | 9.3 / 18.0 | 5.5 / 18.1 | 5.3 / 17.5 | 698 / 866 | 6.84 / 6.84 | 5,455 | 1,724 | 3,165 | 1,561 | 123.8 | 62.7 | 210 | 15 (693) |
| Titan Gorge (`titan_gorge`) | 3,508 (10.7) | 3,515 | 7.0 / 24.7 | 8.2 / 22.2 | 4.8 / 18.6 | 2.9 / 19.8 | 734 / 784 | 3.72 / 3.72 | 2,852 | 0 | 2,986 | 1,274 | 113.2 | 32.0 | 205 | 11 (668) |
| Skybridge (`skybridge`) | 3,834 (11.2) | 3,843 | 5.2 / 23.2 | 7.0 / 20.4 | 4.8 / 21.6 | 3.4 / 10.0 | 656 / 772 | 4.53 / 4.53 | 4,633 | 0 | 2,812 | 1,719 | 123.9 | 37.4 | 207 | 14 (767) |
| Polders (`polders`) | 3,649 (12.0) | 3,657 | 5.0 / 25.1 | 7.6 / 16.1 | 5.5 / 22.4 | 3.5 / 12.9 | 679 / 790 | 6.27 / 6.27 | 8,340 | 809 | 1,003 | 12,691 | 114.9 | 30.7 | 211 | 10 (763) |
| Copper Mesa (`copper_mesa`) | 2,942 (6.4) | 2,949 | 4.5 / 25.5 | 6.7 / 18.2 | 4.4 / 22.2 | 2.7 / 11.2 | 649 / 813 | 4.02 / 4.02 | 4,441 | 0 | 1,221 | 2,055 | 111.6 | 24.8 | 201 | 9 (623) |
| Airfield (`airfield`) | 3,339 (4.8) | 3,346 | 4.4 / 26.3 | 6.2 / 22.0 | 4.7 / 18.2 | 3.5 / 17.1 | 683 / 771 | 5.39 / 5.39 | 7,412 | 8,000 | 795 | 10,309 | 112.1 | 27.7 | 202 | 9 (608) |
| Oasis (`oasis`) | 2,845 (5.2) | 2,851 | 5.2 / 24.8 | 6.5 / 19.2 | 3.6 / 25.7 | 2.8 / 10.8 | 733 / 791 | 4.27 / 4.27 | 4,346 | 0 | 1,067 | 15,322 | 113.2 | 29.8 | 208 | 8 (603) |
| Whiteout (`whiteout`) | 2,736 (5.6) | 2,742 | 4.3 / 19.8 | 6.1 / 14.7 | 3.3 / 19.3 | 2.5 / 8.3 | 661 / 833 | 3.69 / 3.69 | 2,016 | 0 | 1,024 | 1,282 | 110.9 | 29.4 | 204 | 10 (605) |
| Orchard (`orchard`) | 3,856 (5.0) | 3,863 | 4.7 / 21.7 | 6.2 / 20.9 | 5.3 / 22.9 | 3.9 / 15.0 | 686 / 742 | 6.25 / 6.25 | 10,385 | 8,000 | 1,156 | 9,647 | 112.4 | 27.5 | 204 | 15 (629) |
| Longleaf (`longleaf`) | 5,140 (15.9) | 5,146 | 7.1 / 20.6 | 7.3 / 18.7 | 6.3 / 21.3 | 4.7 / 17.0 | 726 / 767 | 7.70 / 7.70 | 13,939 | 8,000 | 1,133 | 11,855 | 112.6 | 29.3 | 207 | 23 (686) |
| Mangrove (`mangrove`) | 3,478 (10.4) | 3,485 | 6.9 / 25.0 | 7.7 / 18.5 | 5.7 / 21.6 | 4.1 / 18.1 | 675 / 789 | 7.33 / 7.33 | 12,548 | 8,000 | 878 | 11,020 | 113.6 | 27.5 | 211 | 11 (630) |
| Saltwind Narrows (`saltwind`) | 3,566 (8.2) | 3,573 | 5.7 / 22.5 | 6.8 / 21.6 | 5.3 / 20.1 | 4.5 / 18.1 | 698 / 704 | 6.22 / 6.22 | 7,904 | 8,000 | 1,174 | 9,684 | 112.6 | 29.6 | 210 | 10 (650) |
| Reservoir (`reservoir`) | 3,114 (8.0) | 3,121 | 4.3 / 20.1 | 5.3 / 16.7 | 3.4 / 23.4 | 3.4 / 10.8 | 656 / 814 | 6.73 / 6.73 | 14,403 | 8,000 | 1,138 | 9,506 | 110.6 | 29.3 | 208 | 11 (622) |
| Olympus Basin (`mars`) | 6,252 (10.3) | 6,265 | 9.3 / 48.9 | 19.0 / 16.7 | 7.7 / 30.9 | 6.3 / 15.2 | 480 / 660 | 2.87 / 2.87 | 0 | 0 | 1,296 | 0 | 78.5 | 23.4 | 194 | 19 (1,079) |
| **fleet median** | 3,856 (10.3) | 3,863 | 5.7 / 22.9 | 7.7 / 18.7 | 5.5 / 21.5 | 4.1 / 17.0 | 691 / 795 | 6.50 / 6.50 | 7,904 | 8,000 | 2,279 | 9,506 | 112.9 | 32.0 | 208 | 11 (663) |

**Deploy 66 → current main, the nineteen maps whose sources changed.** Counts, programs and bytes are exact; the
timings carry both loads. The twelve unchanged maps (verdant, urban, frontier, delta, badlands, monsoon, alpine, airfield,
orchard, longleaf, mangrove, reservoir) read identical calls, triangles, instances, textures and programs on both trees.

| Map | build ms, deploy 66 → main (×) [load1] | terrain / vegetation / props stage ms, main (deploy 66) | chase CPU ms (×) | chase GPU ms (×) | calls | tris M (×) | trees | props | tex MB | geo MB | programs |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Frosthollow (`winter`) | 4,706 → 5,539 (1.18) [9.6 / 10.7] | 2,726 / 298 / 1,834 (2,463 / 170 / 1,624) | 15.1 → 13.7 (0.90) | 24.3 → 25.0 (1.03) | 685 → 764 | 5.52 → 7.18 (1.30) | 10,577 → 11,126 | 2,508 → 2,900 | 111.2 → 111.5 | 35.8 → 39.3 | 206 → 207 |
| Amberford (`autumn`) | 4,294 → 3,914 (0.91) [7.8 / 7.7] | 1,784 / 717 / 1,135 (2,128 / 646 / 1,177) | 6.1 → 4.8 (0.79) | 20.5 → 24.8 (1.21) | 710 → 691 | 9.18 → 9.55 (1.04) | 13,486 → 12,353 | 2,279 → 2,994 | 113.9 → 114.3 | 33.6 → 35.3 | 211 → 213 |
| Tarkhan Steppe (`steppe`) | 3,948 → 9,726 (2.46) [8.3 / 8.5] | 3,132 / 4,232 / 1,440 (1,399 / 572 / 1,296) | 5.3 → 4.7 (0.89) | 21.9 → 20.8 (0.95) | 684 → 656 | 4.80 → 4.81 (1.00) | 3,133 → 2,949 | 2,438 → 2,846 | 113.9 → 112.9 | 27.2 → 28.8 | 210 → 209 |
| Saltmere Coast (`coastal`) | 4,006 → 3,248 (0.81) [10.5 / 10.5] | 1,566 / 412 / 1,022 (2,034 / 499 / 1,130) | 6.9 → 6.3 (0.91) | 21.9 → 27.6 (1.26) | 776 → 732 | 5.74 → 5.78 (1.01) | 7,843 → 8,180 | 2,340 → 2,353 | 111.9 → 111.9 | 29.9 → 31.6 | 207 → 208 |
| Nordhavn Fjord (`fjord`) | 5,005 → 4,697 (0.94) [13.7 / 12.8] | 1,858 / 527 / 1,478 (1,890 / 499 / 1,621) | 8.7 → 8.4 (0.97) | 22.8 → 17.6 (0.77) | 745 → 779 | 9.11 → 9.48 (1.04) | 13,241 → 14,580 | 2,418 → 2,441 | 111.4 → 111.4 | 32.7 → 33.7 | 211 → 210 |
| Saltwind Narrows (`saltwind`) | 3,593 → 3,566 (0.99) [9.8 / 8.2] | 1,355 / 422 / 1,084 (1,450 / 395 / 1,070) | 5.4 → 5.7 (1.06) | 22.8 → 22.5 (0.98) | 703 → 698 | 6.24 → 6.22 (1.00) | 7,904 → 7,904 | 1,174 → 1,174 | 112.6 → 112.6 | 28.0 → 29.6 | 209 → 210 |
| Titan Gorge (`titan_gorge`) | 3,532 → 3,508 (0.99) [10.6 / 10.7] | 1,812 / 141 / 1,208 (1,812 / 127 / 1,323) | 7.2 → 7.0 (0.97) | 27.0 → 24.7 (0.92) | 742 → 734 | 3.72 → 3.72 (1.00) | 2,852 → 2,852 | 2,986 → 2,986 | 113.2 → 113.2 | 31.6 → 32.0 | 205 → 205 |
| Skybridge (`skybridge`) | 3,379 → 3,834 (1.13) [11.2 / 11.2] | 1,765 / 155 / 1,409 (1,627 / 124 / 1,189) | 5.5 → 5.2 (0.95) | 22.6 → 23.2 (1.03) | 662 → 656 | 4.53 → 4.53 (1.00) | 4,633 → 4,633 | 2,812 → 2,812 | 123.9 → 123.9 | 37.1 → 37.4 | 206 → 207 |
| Dust Line (`desert`) | 3,105 → 3,249 (1.05) [6.5 / 6.7] | 1,664 / 418 / 928 (1,524 / 425 / 926) | 4.3 → 4.5 (1.07) | 26.0 → 22.9 (0.88) | 622 → 616 | 4.29 → 4.30 (1.00) | 5,733 → 5,733 | 2,094 → 2,094 | 111.9 → 111.9 | 28.7 → 28.9 | 204 → 204 |
| Oasis (`oasis`) | 2,966 → 2,845 (0.96) [4.9 / 5.2] | 1,425 / 305 / 890 (1,531 / 304 / 906) | 4.8 → 5.2 (1.07) | 21.3 → 24.8 (1.16) | 741 → 733 | 4.26 → 4.27 (1.00) | 4,346 → 4,346 | 1,067 → 1,067 | 113.2 → 113.2 | 29.7 → 29.8 | 208 → 208 |
| Copper Mesa (`copper_mesa`) | 3,032 → 2,942 (0.97) [5.4 / 6.4] | 1,263 / 157 / 857 (1,406 / 158 / 865) | 4.3 → 4.5 (1.06) | 27.7 → 25.5 (0.92) | 649 → 649 | 4.00 → 4.02 (1.01) | 4,441 → 4,441 | 1,221 → 1,221 | 111.6 → 111.6 | 24.5 → 24.8 | 201 → 201 |
| Blackglass (`blackglass`) | 5,255 → 4,500 (0.86) [11.6 / 10.7] | 1,697 / 151 / 2,150 (1,949 / 179 / 2,494) | 8.4 → 7.2 (0.86) | 22.3 → 21.2 (0.95) | 684 → 698 | 6.44 → 6.84 (1.06) | 5,455 → 5,455 | 3,165 → 3,165 | 123.8 → 123.8 | 62.6 → 62.7 | 209 → 210 |
| Caldera (`caldera`) | 3,856 → 3,661 (0.95) [13.9 / 15.0] | 1,855 / 222 / 1,322 (1,952 / 244 / 1,382) | 7.7 → 7.3 (0.95) | 21.7 → 22.2 (1.02) | 746 → 741 | 7.24 → 7.37 (1.02) | 8,497 → 8,497 | 3,770 → 3,770 | 124.1 → 124.1 | 35.8 → 36.1 | 203 → 203 |
| Ruinspires (`ruinspires`) | 4,806 → 4,737 (0.99) [5.5 / 6.0] | 1,561 / 72 / 2,827 (1,615 / 79 / 2,876) | 5.2 → 5.2 (1.00) | 27.0 → 26.1 (0.97) | 686 → 696 | 7.33 → 7.69 (1.05) | 2,677 → 2,677 | 2,279 → 2,279 | 110.8 → 110.8 | 108.7 → 108.9 | 206 → 208 |
| Polders (`polders`) | 3,992 → 3,649 (0.91) [11.4 / 12.0] | 1,640 / 552 / 1,161 (1,900 / 571 / 1,223) | 6.9 → 5.0 (0.73) | 21.3 → 25.1 (1.18) | 668 → 679 | 6.03 → 6.27 (1.04) | 8,340 → 8,340 | 1,003 → 1,003 | 114.9 → 114.9 | 30.5 → 30.7 | 210 → 211 |
| Whiteout (`whiteout`) | 2,790 → 2,736 (0.98) [6.2 / 5.6] | 1,431 / 100 / 971 (1,496 / 110 / 958) | 4.4 → 4.3 (0.97) | 25.9 → 19.8 (0.76) | 672 → 661 | 3.69 → 3.69 (1.00) | 2,016 → 2,016 | 1,024 → 1,024 | 110.9 → 110.9 | 29.4 → 29.4 | 204 → 204 |
| Olympus Basin (`mars`) | 8,117 → 6,252 (0.77) [15.5 / 10.3] | 2,987 / 90 / 2,282 (3,635 / 171 / 2,896) | 10.6 → 9.3 (0.87) | 54.1 → 48.9 (0.90) | 481 → 480 | 2.85 → 2.87 (1.01) | 0 → 0 | 1,296 → 1,296 | 78.5 → 78.5 | 23.1 → 23.4 | 194 → 194 |
| Cinder Junction (`railyard`) | 3,081 → 3,206 (1.04) [11.4 / 10.3] | 1,721 / 145 / 1,029 (1,665 / 131 / 1,008) | 4.4 → 6.0 (1.35) | 22.4 → 22.9 (1.02) | 676 → 663 | 4.81 → 4.81 (1.00) | 4,482 → 4,482 | 2,399 → 2,399 | 125.1 → 125.1 | 38.1 → 38.1 | 206 → 206 |
| Foundry (`foundry`) | 3,086 → 3,090 (1.00) [7.2 / 8.9] | 1,635 / 147 / 1,065 (1,653 / 155 / 1,054) | 4.0 → 4.8 (1.20) | 25.2 → 25.8 (1.03) | 662 → 654 | 6.50 → 6.50 (1.00) | 7,271 → 7,271 | 2,658 → 2,658 | 125.4 → 125.4 | 39.1 → 39.2 | 206 → 206 |

**Tarkhan Steppe: the world build 2.5–2.7× its baseline — a regression, fixed.** 3.9 → 9.7 s in the pairs (load 8.5),
3.5 → 9.5 s in a main / base / fixed triple at load 4.9, with the counts unmoved (656 calls, 4.81 M triangles, 2,949 trees,
112.9 MB). The stage timings named the vegetation step (4.1 s against 0.4 s, `grassScatter` 3.9 s in 98 slices with a
293 ms slice against 0.3 s / 25 ms) and the terrain step (2.6 s against 1.2 s) — the per-sample cost of the height field
itself: a `node --cpu-prof` of `getHeightAt` on steppe put 34 % of its self time in `fieldTrenchPlan`'s `dryFactor`, 19 %
in `shorelineDistance` and 13 % in `waterWetnessAt`, and a headless survey of all thirty-one maps on both trees read
11.8 µs per sample on steppe against 1.0 µs at deploy 66 and 0.8–4.2 µs everywhere else. The field-trench planner
(2026-09-17) draws its plan provisionally — uncached — while a liquid-water map's marsh surfaces are pending and caches
it once they exist; a map whose marshes are dry never builds those surfaces, so its plan stayed provisional for the
world's whole life and every height query with roads and pads on re-planned the trenches (the lines × five stations ×
every marsh's shoreline distance). Base steppe had no marshes; the redesign's twenty-two takyr crusts are dry marshes.
The fix (`terrain.ts`, commit 3fba2df4c): provisional only while a liquid-water map's surfaces are pending — a dry map's
bank-band-1 plan is its final plan, so nothing changes but the caching. Heights, water mask, exclusion and the plan
hash byte-identical on steppe, frontier, autumn, coastal, delta and longleaf (60k samples each); steppe's 60k-sample time
525 → 186 ms (the 22-marsh dip loop is what remains). In the browser (triple at load 4.9): build 9,471 → 3,843 ms beside
the base's 3,522 (1.09× — the remaining 0.3 s is the redesign: 22 crusts, 17 landforms, the station kit and the spur),
height field 556 → 152 ms, terrain 2,588 → 1,322, vegetation 4,115 → 649 (`grassScatter` 3,939 → 511, max slice 293 →
37 ms), props 1,476 → 987, entry long tasks 26 → 10; at equal load 25 the main → fixed pair read 16.7 → 7.1 s. The
captures are the same battlefield by eye (chase and far poses, 1280 px reductions; the far pose moved 0.02 % of its
pixels against a 3.5 % run-to-run floor, the chase pose's 38 % is the wind-swayed grass and the bots' poses against a
25 % floor on an unchanged tree). `roadLookupGrid`'s declared historical delta carries the new line; every terrain,
trench, relief and vegetation receipt passes unchanged.

**Frosthollow: +30 % triangles at the chase pose — the redesign's stands at the deployment, not a regression.** 5.52 →
7.18 M rendered triangles and 685 → 764 calls at the chase pose (bird 5.74 → 7.06 M; edge and far +4 %), with the
frame time unchanged (CPU 0.90×, GPU 1.03× its baseline) and the count columns modest: trees 10,577 → 11,126, props
2,508 → 2,900 (the terrace village, the sawmill yard, the frozen river's ponds), geometry 35.8 → 39.3 MB, +1 program.
The hide-one attribution puts +1.49 M of the +1.57 M in vegetation and +1.17 M in the shadow passes while the static
vegetation inventory grew 3 % (10,984 → 11,558 instances): the conifer stands the redesign put on both flanks of the
player deployment are near-LOD casters, where the Verdant clone kept its forest far away behind the barns (captures).
7.2 M at the spawn is Verdant's own 7.3 M, 764 calls sit under the 900 line, so this is the map's cost, recorded; if
the near-tree cascades ever need trimming it is a fleet lever (the caster LOD), not Frosthollow's stands.

**Amberford and the rest.** Amberford: 9.18 → 9.55 M (+4 %), calls 710 → 691, trees 13,486 → 12,353 (the twenty-eight
belts and the orchards replace the clone's scatter — round 48's tree concern closes with fewer trees than the clone
had), props 2,279 → 2,994 (the town), grass at the pad 19,778 → 35,661 instances (the meadows), +2 programs (the river
kit), build 4.3 → 3.9 s. Nordhavn Fjord +4 % triangles and +10 % trees (13,241 → 14,580), Saltmere +4 % trees with the
wrack and +1 program, Saltwind identical counts with +1.6 MB of geometry (the 20 m strand and its wrack) and +1 program;
the mesa-ring maps +2–6 % triangles for their ring rows and outland rocks (ruinspires 7.33 → 7.69 M and +2 programs,
blackglass 6.44 → 6.84 M with 1,724 ring instances, caldera 7.24 → 7.37 M, polders 6.03 → 6.27 M) and copper_mesa,
oasis, desert, whiteout, mars, Titan (3.72 M, 205 programs) and skybridge (4.53 M) unchanged — the analytic wall crag
is a uniform branch of the one terrain program and the matte canopy costs no program; the four rail-kit yards
(railyard, foundry, caldera, skybridge) byte-identical in every count, as round 57 certified. Scene textures 78.5–125.4 MB
(Foundry the highest) within 0.4 MB of their baselines against the 512 MB line; programs 194–213; the worst-frame draw
calls of the fleet 899 (Frontier, both trees) under the 900 line; entry long tasks 7–27 per map with a 600–1,100 ms
maximum on both trees (the shader warm and the roster staging, not the maps).

**Fleet-median flags and what they are.** Monsoon 12.3 M (1.89× the 6.5 M median), alpine 9.7 M, delta 9.6 M,
frontier 9.6 M, Amberford 9.55 M, Fjord 9.5 M and Ashfall City 8.6 M at the chase pose are the forest and city maps'
pre-existing density — identical to deploy 66 except Amberford's and Fjord's +4 % — and Alpine's 867 calls its
baseline too; none is a change of these rounds. They stand above the `perfprobe` 7 M triangle line at the spawn pose
(that gate is Verdant's 60 s drive at 1920 × 1080 with vsync off, a different measurement), which is the open fleet
ratchet, not a map-round regression.

**Receipts (exit 0).** perfprobe, perfprobe-draw-attribution, mapQuality, treePoolCapacity, propsScheduling,
terrainStreaming, environmentExpansion, worldBuildCoordinator, badlandsRelief, roadLookupGrid (the declared delta),
fieldTrenchTerrain, assaultTrenchTerrain, playableRelief, terrainProjection, terrainFastGrid, railSpurs,
authoredTreePlacement, vegetationProgramKey, grassAtlasPadding, vegetationClearance, garage:terrain:check, typecheck,
public-repo-hygiene, attribution:check. No digest moved (the fix is byte-identical), so no re-pin.

**Open.** The fleet triangle ratchet (6 M) against forest maps at 9–12 M at their spawns; GPU time is command-buffer
granular on this backend (a finer timer needs a native capture); Frosthollow's near-tree shadow passes as the fleet
lever if the cascades are ever trimmed; the probe stays a `tools/tmp-*` throwaway — promoting it beside the round-48
probes is a separate decision.

### Round 61 — 2026-09-24: Amberford's bridge over the river

Round 48's open item ("a true arched span with water under the deck needs the road plane to exempt the crossing from
the 14–18 m dry band"; lane r61-amberford-bridge from cb46992ac, the round-58 tip; A = a pristine detached worktree at
that commit, B = this lane; `tools/map-view-probe.mjs` at seed 1337 on the bird views and two new round-61 bridge views,
one run at a time under the probe mutex; judged on 1280 px reductions and 2× crops in `$SP/r61/cap/`, numbers in
`$SP/r61/`).

**What was wrong.** Every road crossing is dry by construction: `terrain.ts` zeroes the water mask within 14 m of a
road centreline (`smoothstep(14, 18, rd)` in `waterWetnessAt`) and grades the causeway to the road plane
(`applyHeightConstraints`, `rd < 14`). The round-48 bridge therefore carried the coach road over dry gravel 0.5 m above
the water surface (the road plane 0.93 m, the liquid plane −0.25 m, the sheet 0.64 m over it): its "arches" were dark
box recesses proud of a solid spandrel wall standing on the causeway's shoulder, and its parapets were two field-wall
runs of the map's `wallRuns` seated on that gravel.

**The rule (authored, not a special case).** A marsh station authors `crossing: 'bridge'` (`MarshSourceConfig`, with
optional `deckClearM` 2.4, `deckWidthM` 12.4, `approachM`); Amberford's bridge narrows `{ x: -20, z: -68, r: 18 }` does.
Once the road plane and the liquid surfaces are frozen, `terrain.ts resolveBridgeDecks` turns each into a
`BridgeDeckPlane` published as `heightField.bridgeDecks`:
- the deck centre is the road's nearest point to the station (route 0, the coach road, at the node itself) and its
  axis the road bearing there ((−0.686, 0.728));
- the span is the river's own wet reach along that axis — the liquid union BEFORE the dry band, marched at 0.25 m
  (15 m each way at the r 18 narrows) — plus a 3 m abutment at each end: half-length 18 m; the deck is 12.4 m wide
  between the parapet lines;
- the plane is level: the road plane lifted clear of the water surface by the clearance — max(0.93, 0.395 + 2.4) =
  2.795 m; the bed under it is the liquid plane (−0.245 m);
- the approach beyond each abutment is the length a 7 % grade needs from the road plane there (north 33 m, south 11 m;
  one length for both sides, 8–60 m).
Under the span the road-plane blend and the dry band are exempted (`bridgeTermsAt`: `span` 1 under the deck, falling to
0 through the abutment; the height field keeps the river bed, `waterWetnessAt` keeps the river — mask 1 across the
deck's full width and beside it), through the abutment the terrain climbs from the bed to the deck, over the approach
the road plane grades to the deck (`approach` 1 at the abutment face, 0 at its end: the north approach 2.795 → 0.66 m
over 33 m), and `getGroundType` reads the deck as stone. Everything else is byte-identical: 179 four-metre samples
moved, none beyond 80 m of the deck, every road node keeps its height, the ford at (186, 24) keeps its wade (mask 0,
the lane dipping to −0.71 m), every map without a bridge station resolves no deck and is untouched.

**The kit (`mapKits.ts addArchedStoneBridge`, derived from the plane; no map coordinate lives in it).** The body is
ONE extruded elevation profile through the full deck width: spandrel walls with three segmental arches (chord 8.67 m,
rise 1.1 m, radius 9.1 m; the spring 0.3 m over the water surface, the crown 0.55 m under the body top) whose vault
soffits are the extrusion's inner walls — the openings are arcs the sheet runs through, not recesses — with 2 m piers
between them carrying cutwaters turned into the stream, abutments a metre into each approach embankment with splayed
wing walls seated on the banks, a 0.5 m deck slab level at the deck plane and flush with the graded approaches, and
1.1 m parapets with end posts on its edges (the two `wallRuns` left `autumn.ts`). Its collision record is a compound
the ride stands on: the body (footed 0.6 m under the bed, topped at the deck plane) and the two parapets
(deck → +1.1 m), kind `'bridge'`, in both sinks (the stockpile census counts it beside the mill house). A hull that
arrives on the approach mounts the body's top as its floor across the span (the structure support field: 2.795 m at
every station of the deck, the river −0.2 m past the parapet line), a hull in the river is pushed by the body's walls,
and a hull that leaves the deck sideways is stopped by the parapet parts before it can fall; ford posts skip the route
the deck carries.

**Bots.** The dedicated navigation grid (`sim/botRoutePlanner.ts`, `sim/bridgeDeckNavigation.ts`) routes a cell that
lies within half a cell (12.5 m) of the crossing's road axis over the span or an approach through that axis — over the
span at the deck's height, on stone, dry and unblocked (the deck's record is its floor), over an approach sampled on
the road like any cell — so the route runs down the road, over the abutment and along the middle of the deck; a cell
centre on the embankment shoulder no longer draws the edge through the water beside the deck (the first cut, snapping
span cells only, left the south approach cell (0, −75) 9.7 m off-axis and its edge blocked). `navigationSampleIsLiquid`
and the hull-rectangle liquid safety (`navigationLiquidSafety.ts`, the AI's local brake) read a point under a deck as
dry; the water beside it stays liquid. Proof (`$SP/r61/route.mjs`): from the player pad, routes to the two western
enemy pads cross on the deck axis ((−7, −82) → (−19, −69) → (−31, −56)) and the eastern pad still fords at (186, 24);
the liquid safety is clear at the deck centre and blocked 8 m across it and in the open river. Track dust reads the
contact point's height against the water surface (`effects.ts`), so a track on the deck does not splash the river it
spans. `matchPlacement` (its reduced view passes `bridgeDecks`): 496 both-team dry routes, all modes.

**Collision shard and pacing.** Amberford's dedicated shard was recaptured ON THIS TREE with the capture tool's new
`--headless` mode (`tools/capture-world-collision-manifests.mjs --headless --maps autumn`: a private vite server on a
5300–5399 port with its own optimizer cache under `$SP/r61/`, headless Chrome with `--use-gl=angle`, `__GAME_READY`,
`__DEBUG.switchMap`, the tool's own pack script, `assertUnchangedCollisionShards` for the other thirty): 5873
obstacles / 5727 colliders / 5822 concealers (1827167 B). The untouched base recaptured with the same tool reads
5883 / 5737 / 5822 — the committed round-48 shard (6091 / 5927 / 6035) had gone stale against main's own Amberford
world like Tarkhan's in round 57 — and the bridge then retires the two parapet runs' nine wall records and two posts
for the one bridge record; concealers unchanged. Census and storage ceiling re-pinned with dated notes
(`dedicatedWorldCollision`, `collisionManifestCodec`). `battlePacing` in full under the mutex: 14/124 timeouts (the cap is 15), Amberford's own
rows 367 / 585 / 473 / 296 s with 0/4 — the bots cross on the deck or wade the ford.

**The tactical-map plate.** Re-baked (`tools/bake-minimap-assets.mjs --maps autumn` under the probe mutex; the
release harness's FIFO was empty): the river runs up to both sides of the coach road where the round-48 plate pinched
it off with a 28 m strip of dry causeway — the road line over continuous water is the bridge on the map
(`$SP/r61/minimap-{before,after}-crop.png`). The shared `MINIMAP_RASTER_REVISION` is left for the round's one bump.

**Verified (`tools/map-view-probe.mjs` at seed 1337; A = the base worktree, B = this lane — tag b2 after the deck slab
took `slabBox` UVs; `$SP/r61/cap/`, 1280 px reductions and 2× centre crops).** `bridge-bank-low` (from the north bank
downstream of the crossing, 2 m over the water's edge, looking across the water): A — a dark wall standing on dry
gravel with three black rectangles in it and the water ending short of it on both sides; B — three segmental arches
over continuous water, the far bank and its reeds visible THROUGH every opening, the two piers standing in the river
with their cutwaters, the level deck and parapet line above them, the wing walls meeting both banks, and no z-fighting
between the sheet and the deck (the water surface is 2.4 m under it). `bridge-deck-low` (the coach road on the south
approach): A — the road running level over the causeway between two low field walls; B — the road rising onto a level
stone-flagged deck between 1.1 m parapets with end posts, flush at both ends (no step; the first B frame's slab showed
the thin-slab stripe of `box()`'s UVs, the reason for `slabBox`), the town beyond. `bird-n` / `bird-w`: no change
beyond the crossing. The ford at (186, 24) is unchanged in the field (mask 0, the lane dipping to −0.71 m) and on the
plate.

**Receipts (all exit 0 on the final tree).** roadContinuity (autumn row unchanged: the deck is derived from an
interior segment, identical in the completed and uncompleted builds), roadLookupGrid (the deck state, resolution,
ground type and published planes declared as historical projections; the road-plane blend is the fixture's current
slice), roadPlacementAdmission (the oracle's relief-law constructor restores the current blend, like the round-47 rim
laws), roadBankComposition and roadBorderCorridor (their constraint sandboxes author no decks), roadInheritedGrades,
roadStations, roadDistanceField, badlandsRelief, terrainStreaming, playableRelief, shoreDirtMask (autumn's RGBA
control re-pinned, dated), terrainWetLayer, trackSurface, shallowWater, waterRipples, liquidMarshSurface,
riverLandings, riverReedContact, beachedBoat, shoreJetty, strandWrack, railWashout, railSpurs, railCoalStockpiles
(the bridge is Amberford's second footprint: three OBB parts checked against the deck plane), winterLakeGeometry (the
28-map kit digests re-pinned, dated), autumnHeadlands, structureCollision, structureSupport, collision,
botRoutePlanner, navigationLiquidSafety, botNavigationWater, matchPlacement, environmentExpansion (a bridge station's
span is wet and stone, its abutments skipped, every other crossing dry), mapQuality, spawnClearance, propsScheduling,
worldBuildCoordinator, dedicatedWorldCollision (census re-pinned, dated), collisionManifestCodec (ceiling re-based,
dated; the headless option shape), collisionManifestLoader, battlePacing (full), map-probe-runtime (44 views),
minimapAssetRuntime, minimapCapturePolicy, minimapOrientation, map-art-guards, garage:terrain:check (no pad moved),
typecheck, public-repo-hygiene, attribution:check. There is no `roadEndpoints.selftest`; `maps/roadEndpoints.ts` is
exercised by roadContinuity, roadStations, roadCutRecovery, shoreDirtMask and mapQuality.

**Still open.** The record's solid body was split in round 63 (2026-09-24): the deck part from the crown line (1.0 m,
over the 0.9 m floor test), abutments, piers and four vault bands per arch, so shells pass the openings and a hull low
enough passes beneath (see the round-63 section; the bands were halved to 0.1375 m in round 67). The deck clearance is the 2.4 m default (author
`deckClearM` for a taller span — the arches' rise is 1.1 m over an 8.7 m chord); the 7 % approach peaks near 10 %
through the smoothstep's middle. The road's splat tint stays on the bed under the deck (the road distance is not
exempted) and is hidden by the slab from every gameplay height. The Delta river keeps its round-1 ruined bridge (no
station authors the kind), and the `presentation-r1` autumn shots and the home showcase frames predate the span.

### Round 62 — 2026-09-24: the search for a lost enemy and the empty rack

Shared main sat at 5/124 after round 60 (median 465.5 s, 15 s under the receipt's 480 s ceiling; p10 290.1 s). The
five capped seeds were replayed with `tools/pacing-trace.mjs`, a 2 s lane trace with the controller's search / gate /
ammunition fields, a navigation-grid probe (the 25 m grid as ASCII with the planner's route from the survivor to the
host) and a shell ledger with the damage of every result. Three mechanisms, in order of weight:

1. **The midpoint inside the block.** Urban seeds 0 and 2 and Ruinspires 3: the survivor killed the last enemy bot at
   400–510 s and then had no target for 200–400 s. The 8 s no-contact search (`updateStalematePolicy`) re-routed it
   every window to the midpoint between its hull and the enemy's 50 m sector — on Urban seed 0 the cell (64, −100),
   inside a building — and the corner-hop router, which sees one box 85 m ahead, cannot solve a maze: the T-90M
   wandered the cluster at (90…150, −110…−10) from 540 s to 880 s, strikes cycling, and reached the host at 890 s
   with ten seconds to go. The navigation grid had a route the whole time (east round the blocks at x = 250, then
   south — 13 waypoints); Ruinspires' pocket at (−36, −31) likewise (19 waypoints, east to x = 250). The urban
   survivor of seed 2 stood in a courtyard the grid reads as solid: no route at all from there.
2. **Shells the rack could not afford.** Steppe seed 1: the T-90M Proryv fired 21 recorded results and its whole rack
   (16 / 16 / 4 → 0 / 0 / 0) by 875 s — eleven HEAT rounds at a bot 270–340 m away between 700 s and 875 s and not
   one hit; at 75 m from the host it put 6 of 12 APFSDS into the turret cheek and roof (non-pens, ricochets) around
   the lower-front zone the probe had chosen (ratio 12–15): with the normal tier's persistent error (σ ≈ 6 mrad, held
   for seconds) the shell lands on the plate beside the probed one. Saltwind seed 0: 13 of 24 APFSDS missed at
   170–270 m against a moving bot; against the host the HEAT rounds went at a lower-front ratio flickering 0.86–0.90
   around the gate, every one a non-pen, and the survivor stood empty at 77 m with 300 s left. Urban seed 2 (both
   survivors) and Ruinspires 3: ten HE rounds into turret cheeks and mantlets — the pen-gate's HE fallback
   (`chosenSlot === heSlot` bypassed the gate) bursting for nothing on 600 mm of armour, and on a magazine without
   HE `findHeShellSlot` answers the last slot, so HEAT went through the bypass too.
3. **An empty rack has no rules.** The standard ruleset resupplies nothing (`matchRuleset.ts`: ammo `'spec'`, no
   respawn; consumables are repair / first aid / extinguisher). An empty bot kept pressing (Saltwind 0: at its press
   point, `slot=1`, `input.fire` false, strikes cycling on the arc-limit scoot) — nothing in the doctrine knew.

Fixes (`src/game/ai.ts`; `deps.planRoute` wired in `src/sim/authoritativeMatch.ts` and `src/game/state.ts`):

- **Search legs planned over the navigation grid.** An optional `deps.planRoute(start, goal)` — `planBotRoute` over
  the match's shared grid, no role detour, its own seeded stream — plans every search leg, so the waypoints are cells
  the hull can reach; a goal in another connected component (an empty plan) is skipped, not driven at. Goals rotate
  by how many legs have ended without contact: the enemy's sector, a sighting younger than 45 s, the mission
  objective, a 110 m sweep ring round the sector whose bearing turns with every leg (0°, +45°, −45°, +90°…), then
  a 220 m ring. A leg is given up only on its own evidence — route consumed without contact, three stuck strikes,
  or its time budget (15 s plus the route at 2.5 m/s, at most 150 s; a leg that halved its distance re-plans
  instead of counting) — contact resets the escalation, and without a planner (headless fixtures) the first leg
  is the old two-point leg for the local router, rotated the same way. A dead target's last sighting is forgotten
  when it dies (Amberford seed 1's survivor drove 180 s back to where its kill had stood).
- **The HE fallback fires only a real HE round whose surface burst is worth a shell, laid on the zone that priced
  it.** The probe estimates the burst of the HE slot on each zone it scores (`0.5 · dmg − 1.1 mm⁻¹ · armour stack`,
  the `applyHeSurfaceBurst` law), the bypass needs `HE_SPLASH_WORTH_HP` (80) of it, and the round is aimed at that
  zone rather than at centre mass (Alpine seed 0 under iteration 3: eleven HE rounds into the turret cheek the
  lower plate had priced); otherwise the gate stays shut and the closed-gate flank and the press change the geometry.
- **The penetration gate's ratio answers the lay error as well as the penetration roll**: 1.0 at ≤ 80 m (the
  historical 0.9 covered the roll; Polders seed 2 under iteration 5 pressed straight in at 76 m, the gate open on a
  lower-front strip rated ~1.0, and eleven of thirteen HEAT rounds landed on the glacis beside it) rising to 1.15
  at ≥ 320 m.
- **A lay the rack cannot afford is closed on, not taken.** `expectedHitChance`: the tier's σ and the gun's
  dispersion in metres at the range against the target's width and 80 % of its height (erf); a shot needs 0.35
  with a full rack, rising to 0.6 with the last rounds. Below it, at a bot or a passive target, the round is held
  (`conserveHolds`) and the hull closes (`driveEngage`) unless it is the lone spearhead; the settle holds and the
  stalemate push's settle stand down while it closes. A live player is fired on from range exactly as before —
  the player-facing doctrine ("threatened rather than hit") is untouched.
- **The empty rack rams or retires.** With every slot at zero the bot rams the current target only when the ram law
  (`ramDamage`, the closing speed a straight run reaches, at most 14 m/s) says the rams a kill needs cost under 80 %
  of its own hull — a run straight through the hull, a 3.5 s back-off to 45 m when a run has stalled — and
  otherwise keeps 240 m from every enemy (toward support when there is any), starts no search legs, and leaves
  the finish to its team.
- The gun-lane relocation is judged on the lay, not on the gate (a muzzle behind a berm still schedules it while the
  probe, casting from the same gun, finds no zone).

Receipts: `src/game/ai.selftest.mjs` [18] a bot without contact searches on reachable legs and rotates its goal when a
leg fails (with a planner the unreachable sector is never driven at; without one the old sector leg comes first and
still rotates), [19] no round at a zone the probe rates unpenetrable, HE included (a Strv 103 on a Leopard 2A7V's
glacis at 80 m, best ratio 0.56, burst 0; the same gun fires at the rear), [20] the long-range hold and close at a bot
target (M1A2 on a T-90M at 380 m: chance 0.17, no shot, the hull closes) while a live player at 380 m is fired on as
before, [21] the empty rack rams a 300 hp hull at 60 m and retires from a full-health M1A2 (and a hull that would
not survive its own ram does not run). [14] samples the press drive over its first three seconds (the conservation
chase closes on the 220 m contact before the press, and the pinned fixture hull trips the stuck watchdog).

Full-receipt ledger (same 124 seeds; timeouts / median / p10):

| iteration | change | timeouts | median | p10 | note |
|---|---|---|---|---|---|
| 0 | base d2e588d4d (deploy 81) | 5 | 465.5 | 290.1 | Urban 0 and 2, Tarkhan 1, Ruinspires 3, Saltwind 0 |
| 1 | planned search legs, HE worth, ranged gate, hit-chance hold, empty rack | 0 | 365.4 | 268.0 | 29 maps shorter in aggregate, Amberford longer (seed 1: 567 → 781, the dead target's sighting), Orchard +33 |
| 2 | + dead target's sighting forgotten, cross-map leg budget, 45 s sighting age | 0 | 357.7 | 265.7 | 30 maps shorter; Amberford +47 (seed 2: 527 → 611, a long fight in the woods and a 100 s search — no stuck behaviour); no battle over 700 s |
| 3 | + the 15 s passive dwell (round 60's prepared measurement) | 1 | 350.6 | 258.3 | Alpine 0 capped: a 10 hp survivor put eleven HE rounds into the host's turret cheek — the burst was priced on the lower plate, the round laid on centre mass (fixed in 5); Coastal, Amberford, Alpine longer |
| 4 | + conservation threshold 0.35 → 0.25 with a full rack | 0 | 362.6 | 271.6 | the hold is not what shortened the battles: +12 s of median for more rounds spent — 0.35 kept |
| 5 | HE laid on the priced zone, an empty rack does not hunt; dwell 20 s, threshold 0.35 | 1 | 360.4 | 265.0 | Polders 2 capped: a straight-in press at 76 m, the gate open on a lower-front strip rated ~1.0, eleven of thirteen HEAT rounds on the glacis beside it (fixed in 7); Polders, Longleaf, Mars longer |
| 6 | the same with the 15 s dwell | 0 | 350.6 | 258.8 | no map worse than its round-60 aggregate (31 of 31 shorter) — the receipt prefers the 15 s dwell, kept |
| 7 | + the gate ratio 1.0 at point-blank range (final, b94c22c78) | 0 | 351.4 | 258.8 | Orchard +4 s in aggregate (1307 → 1311), the other 30 maps shorter; no battle over 720 s |

The economy, on the same 124 battles (a replay tallying every reload channel): the 372 bots fired 11,330 rounds on
the round-60 tree and 5,493 on this one (30.5 → 14.8 a bot) for slightly MORE recorded damage (779 k → 803 k hp), three
racks stood empty at the end before and none after, 692 search legs were planned, and no ram run was ever worth it
(the idle host keeps its 2,600 hp; the ram law is right to refuse).

What remains is the median. Round 60 left it 15 s under the 480 s ceiling; this tree leaves it 51 s over the 300 s
floor (351 s, p10 259 s, no battle under two minutes) — under the 380–440 s band the round set out for, because a fight
in which no round is wasted is simply shorter, on every map. The two levers measured do not lift it: a full rack
taking one-in-four shots (iteration 4) added 12 s of median for more rounds spent, and the 20 s dwell (iterations 2 and
5) added 7–9 s and a cap. Lifting it into the band would take an opening the bots spend longer in — the deployment
window (`DEPLOYMENT_TUNING`, 120–165 s, engagement inside 85–100 m) is the owner's lever, not this round's (owner
2026-09-25: the ~6 min median stands; no change). Open with
it: the press point's ring has no third bearing once both side points stand on water (Polders 2 pressed straight in;
closed by round 67 with land-only fallback bearings), and the empty rack's retirement is a draw by design — a resupply
rule would be the alternative, and there is none.
### Round 63 — 2026-09-24: Tarkhan's railway cutting and the bridge's open arches

Round 57's open item on Tarkhan Steppe (the siding stopped at the rim foot — the station road climbs the rim at 24 %,
no rail grade reaches the edge, "a cutting through the rim band is terrain work") and round 61's on Amberford (a shell
fired through an arch opening hit the body). Lane r63-cutting-arches from daef49eb7 (the round-61 tip); A = a pristine
detached worktree at that commit, B = this lane; `tools/map-view-probe.mjs` at seed 1337 under the probe mutex, one run
at a time, judged on 1280 px reductions and 2× crops in `$SP/r63/cap/`; numbers in `$SP/r63/`.

**The cutting (authored, not a special case — `railSpurs.ts`).** A spur may author `cutting: { from: [x, z], grade?,
halfFloor?, batter?, fan? }`, the portal on its last edge. From the portal the bed is graded at 2.4 % (a branch line's
ruling grade, under the 2.5 % the round asked for) along that edge to the path's end; the ground above it is cut to an
8 m floor (the 3 m ballast and a 2.5 m cess each side) between faces battered 0.7 horizontal per metre of rise (≈ 55°,
a soft-rock cutting — the terrain material's slope rock takes the faces); ground under the bed is filled, feathered 2 m
past the floor's edge; the rule fades in over the 12 m BEFORE the portal (the plain there lies within decimetres of the
bed; a fade past the portal let the rim's first rise hump the bed 0.4 m at the mouth) and is full from the portal on; in
cut the face governs from the floor's edge (a feather there climbed to the ground faster than the batter). `terrain.ts`
reads the portal's ground on the finished surface — every road, pad, lake and trench constraint frozen, the relief phase
set — and digs the cutting LAST, on final queries only, so the road plane, the pads, the water and the ground types are
the values they were; the vegetation/prop exclusion covers the floor, the cess and the faces up to the daylight line,
read on the uncut ground with the rule suspended. Every other map authors none and is untouched (the receipts'
projections, the constraint sandboxes, roadLookupGrid's historical hash). Tarkhan: `railSpurs: [{ path: [[144, −181],
[512, −181]], bufferStop: 'start', cutting: { from: [440, −181] } }]` — the siding runs on from the round-57 stop to the
map edge (92 four-metre spans, one stub stop; `bufferStop: 'start'` is new), the bed from −1.26 m at the portal to
0.47 m at the edge, 18.0 m deep there against the plateau's 20.9 m, the daylight line 17 m off the axis at the edge (a
34 m top width) and the station road's shoulder band 4 m clear of it. Measured (headless, seed 1337): the bed exact to
1e-9 at every metre from the portal to the edge, on the axis and ±3.9 m; the faces at the batter; 103 four-metre samples
moved, all inside x 432–512 × z −196…−168, against the same map without the cutting; 0 of 40 road nodes, 0 water-mask or
ground-type samples, minY/maxY unchanged; the laid track's 53 sleepers in the cutting at ≤ 2.40 %.

**Past the red line.** The notch continues into the outland: `getOutlandHeightAt` (the ring's near rows) applies the
same rule, and past the path's end the notch opens into a valley along the RADIAL through the mouth — the direction the
horizon ring's columns run — widening 0.35 m per metre, so the straight-ahead sightline from the mouth stays on the
valley floor to the ring's first ridge (174 m out: 58 m off the valley's axis against a 65 m half-floor). Two things the
trial captures found on the way (`cutting-mouth-out`, `$SP/r63/cap/steppe-trial4..6-*`): a fan straight east along the
line drifted north across the radial columns, and the ring drew its north face as a 15 m ramp over the mouth; and the
ring's own seating rule — the square's edge height continued by the rim's interior gradient, sampled 36 m inward along
the radial, which is 12 m off the axis at that column — carried the cutting's south face across the mouth as a 10 m
golden hill. So the height field publishes `getOutlandSeatWeightAt` (1 inside the notch's outland corridor, fading over
30 m past the daylight line; absent on every other map), `seatHorizonSkirtOnGround` seats its near rows on the outland
itself where the weight says so (every other map's ring is byte-identical to the bit — the ring receipts), and the ring
forest keeps off the line's right-of-way (`clearAt`). Measured: the ring's rows 1–3 in the three axis columns sit on the
bed (row 1 at 0.8 m, row 2 at 1.7–2.1 m, row 3 at 3.7–6.5 m), 59 ring vertices moved, all in rows 0–4 within 0.15 rad
of the axis; no authored ridge row moved.

**The bridge record (`mapKits.ts addArchedStoneBridge`, from the same deck plane).** One compound record still, its parts
now following the geometry: the deck from the crown line up (deckY − crownY = BRIDGE_BODY_TOP_UNDER_DECK_M +
BRIDGE_SPANDREL_FILL_M = 1.0 m, over the 0.9 m `HULL_STANDABLE_HEIGHT_M`, so a hull on the deck mounts it as its floor
and its sides never push the ride — the cost the round-61 note feared for a 0.5 m slab does not arise), the two
abutments and the two piers from the footing 0.6 m under the bed to the crown line, each vault as four 0.275 m bands
(the building hitboxes' shell bands, finer for the arcs) whose solid haunches reach in from the pier faces to the arc at
the band's middle height, and the two parapets: 31 parts. Below the spring line (0.3 m over the water) an opening is
clear from pier to pier. Proved headless (`$SP/r63/bridge-trace.mjs`, A = the base shard, B = this tree's kit record
and then its recaptured shard): A — every level shot along the river through every arch centre, at 0.15–2.6 m over
the water, hits the body at 23.8 m, an oblique bank shot through the middle arch hits it, and a hull of any height
under the arch is pushed; B — the shots at 0.15 / 0.4 / 0.7 / 1.0 / 1.3 m pass through all three arches (the crown is
1.4 m over the water), 1.6 / 2.0 / 2.6 m meet the deck, a pier centre, the deck and a parapet stop a shell, over the
parapets it flies on, a plunging shell meets the deck at the deck plane, an oblique bank shot passes at 0.5 m and meets
the vault haunch at 1.0 m (the arc is 2.7 m wide there); a 1.5 m body under the middle arch passes beneath the vault
(the underpass rule: the body top 0.15 m under a part's bottom) and a 2.2 m body is stopped by the deck part, a low
hull against a pier is pushed; the structure support field reads the deck as the floor at 2.795 m at the centre and
over the abutment and no floor over a hull under the arch; a hull on the deck centre is not pushed and one over the
parapet line is. The fleet's body tops include the turret (`tankBodyTopM`), so no playable hull fits under the 1.1 m
rise — the record now says what the geometry says. Bots route as before (bridgeDeckNavigation, botRoutePlanner,
matchPlacement's 496 dry routes).

**Captures (`tools/map-view-probe.mjs`, seed 1337; three round-63 views in the table, 44 → 47, `map-probe-runtime`
re-pinned).** `cutting-station-low` (on the siding at x 392, 2.4 m up, looking east down the track): A — the plain, the
track ending at its stop under an unbroken rim; B — the track running into a notch in the rim, rock-faced batters
either side, the ring's wooded ridge visible THROUGH the mouth and no wall at the exit; world band moved 71.7 %, mean
|Δ| 50.8/255. `cutting-edge-low` (on the floor at the edge looking back): A — the camera stands on the 18 m rim looking
over the plain at the station; B — an 18 m deep cutting, the ballast and rails running down its floor to the elevator
row; 86.8 %, 44.0/255. `cutting-exit-bird` (70 m over the portal looking east): A — the unbroken plateau and the ring's
tree-dotted plain; B — the notch, and past the edge a broad tree-free valley running out to the ring's first ridge;
84.5 %, 46.0/255. `spur-bird`: the line now runs on past the station to the right of the frame (2.5 %, 0.86/255).
`bridge-bank-low` / `bridge-deck-low`: frame noise only (1.0 % / 4.2 %, 0.60 / 1.36 per 255) — the bridge change is
collision, not geometry (2× arch crops A/B in `$SP/r63/cap/`).

**Collision shards and pacing.** Both shards recaptured headless on this tree under the mutex
(`tools/capture-world-collision-manifests.mjs --headless --maps <id>`): Tarkhan's comes back byte-identical (2429 / 920 /
1302 raw, census 2441 / 2152 / 1314 unchanged — no collision record stands in the cutting corridor and the extended
siding is soft dressing), Amberford's keeps its census (5873 / 5727 / 5822) with the one bridge record at 31 parts
(1827167 → 1829051 B; the storage ceiling re-based +10 %, dated). `archedBridgeCollision.selftest` reads the committed
shard and asserts its parts equal the kit's (a stale shard fails it — the hazard of DEVELOPMENT.md's shared-main note).
`server/battlePacing.selftest` in full under the mutex: 14/124 timeouts (the cap is 15), median 454.2s, p10 289.9s, sub-120 0; Tarkhan's own rows 290/900/264/738s with 1/4 (the same single timeout as the round-57 and round-61 full runs — not worse), Amberford's 367/585/473/296s with 0/4 (the bots cross on the deck or wade the ford as in round 61).

**Receipts (exit 0 on the final tree).** railCutting (new, in the core inventory), archedBridgeCollision (new, in the
core inventory), railSpurs (re-pinned: the siding to the edge, one stop; dated), railWashout, railCoalStockpiles (the
split record's footprint contract), roadContinuity, roadLookupGrid (the cutting's declarations, the portal resolution,
the final-query dig, the suspended uncut sampler, the exclusion line and the outland publication as declared deltas —
the historical hash is unchanged), roadBankComposition and roadBorderCorridor (their constraint sandboxes author no
cutting), roadPlacementAdmission, roadInheritedGrades, roadStations, roadDistanceField, badlandsRelief, terrainStreaming,
playableRelief, edgeWater, horizonResources, horizonMesaSurface, horizonRockfield, autumnHorizonSeam, horizonAutumnGround,
redrockCanyonHorizon, structureCollision, structureSupport, collision, bridgeDeckNavigation, botRoutePlanner,
matchPlacement, mapQuality, spawnClearance, propsScheduling, environmentExpansion, worldBuildCoordinator,
dedicatedWorldCollision (census notes, dated), dedicatedWorldCollisionMemory, collisionManifestCodec (ceiling re-based,
dated), collisionManifestLoader, battlePacing (full), map-probe-runtime (47 views, dated), villageWear and
mangroveWaterPalette (steppe.ts config digests re-pinned, dated), garage:terrain:check (no pad moved), typecheck,
public-repo-hygiene, attribution:check.

**Open.** The ring's own seating rule still continues every other column by the rim's interior gradient sampled along
the radial; a rule that read the outland's own gradient would serve any future notch without a published weight, but it
moves every map's ring rows (owner: never flatten the background mountains) and is not this round's. The valley past
the edge ends at the ring's first ridge 174 m out (37 m, the authored profile): a tunnel portal in that face would
finish the railway's story. The cut faces are bare (the exclusion keeps grass and scrub off them; a grassed batter would
want a slope-aware seeding, not the berth). The arch record's openings are the arc quantised to 0.275 m bands; a shell
within a band's height of the arc may meet stone the eye sees through, or pass a sliver of it. Tarkhan's picker
thumbnail, 4K hero and tactical-map plate predate the cutting.
### Round 65 — 2026-09-24: a physically based atmosphere

Owner (2026-09-24, on dgreenheck/tidewater): "some of these assets and shaders and skies and graphics are incredible
and will help us improve stuff a lot" — the target being its sky: a deep zenith, a bright warm horizon band, real
aerial perspective on the far island. This round gives every battlefield that sky model. Nothing from the reference
enters the tree: the GLSL is written from the paper with the reference for structure and constants, no shader text
or asset is copied, and its cloud file (Sky Pro-derived) was neither read nor ported.

**The model (`src/engine/atmosphere.ts`).** Sébastien Hillaire, *A Scalable and Production Ready Sky and Atmosphere
Rendering Technique*, Computer Graphics Forum 39(4), EGSR 2020. Three look-up tables, each a small fragment pass into
a half-float target through a full-screen quad: the transmittance LUT (256 × 64, Bruneton's (r, μ) parameterization,
40 steps), the multiple-scattering LUT (32 × 32, 8 × 8 directions × 20 steps, the paper's isotropic second-order
estimate with the ground bounce and the 1 / (1 − f_ms) series) and the sky-view LUT (200 × 100, horizon-centred
non-linear latitude, sun-relative azimuth, 32 quadratic steps, Rayleigh + Cornette-Shanks phase, the multiple
scattering added per step). The medium is the paper's Earth: Rayleigh (5.802, 13.558, 33.1) · 10⁻³ km⁻¹ at 8 km scale
height, Mie scattering 3.996 · 10⁻³ and extinction 4.44 · 10⁻³ at 1.2 km, an ozone tent (0.650, 1.881, 0.085) · 10⁻³ at
25 ± 15 km, radii 6360 / 6460 km. The tables rebuild only when the sun or a map's parameters change (the transmittance
table only when the medium does), keyed exactly; a fourth 8 × 1 float pass — the *summary* — integrates the sky-view
LUT once per change and is read back to the CPU: the cosine-weighted hemisphere irradiance, the transmittance toward
the sun, the anti-solar horizon band at 1.25° and at 16.25° (the legacy probe's rows 8 and 14, so round 37's
elevation falloff comes from the same numbers), the zenith and the sun-side band. Nothing runs per frame but the
sampling. A CPU twin (`atmosphere.test-support.mjs`) carries the same constants, tables and march; the GPU summary
agreed with it to 0.2 % on verdant and desert (headless ANGLE), and `atmosphere.selftest` pins the constants in the
built GLSL, the parameterization round trip, the physical invariants, the mapping and its residuals.

**Where it shows.** On the desktop tier `sky.ts` adds a second dome mesh whose material samples the sky-view LUT
(`atmoSky`, one 2D fetch), adds the sun disc through the atmosphere's transmittance toward the sun, keeps the legacy
knee (the disc exempt), the compact sun glow, the dither and the round-22 night sky exactly as before: a night preset
dims the atmosphere with `skyIntensity` (.08 — a moonlit sky, the moon being the key light the runtime already aims)
and the starfield, band and moon ride on top, so the night maps and Olympus Basin's galaxy are unchanged. The
Preetham mesh stays in the scene, invisible, as the mobile tier's dome and as the fallback for a failed readback; the
receipts that pin the legacy probe and bake are untouched (`?atmosphere=off` boots the legacy path for A/B). The
environment bakes from the new dome (PMREM of a box sharing its material; the key carries the atmosphere
parameters; `ENV_INTENSITY_FLOOR` applies as before). The fog colour is the summary's anti-solar band under the same
luminance ceiling as the legacy probe (0.45), so the FogExp2, the vista's haze, the cloud decks' haze pole and the
round-42 wall term all follow the rendered sky. The hemisphere light's sky pole takes the hue of the summary's
irradiance at the engine constant's own luminance (`lighting.ts`), so the authored `hemiIntensity` and every key : fill
ratio stay as tuned while shaded ground takes the colour of the sky it sits under. The post aerial pass (`post.ts`)
keeps every distance rule of rounds 5–39 — the extinction and scatter-in curves, the height falloff, the black-point
guard, the ceilings (0.60 / 0.55), the hue clamp, the detail octaves — and replaces only the scatter-in *target*: with
the atmosphere active it samples the sky-view LUT along each pixel's view ray (just above the horizon for rays below
it), so a far range converges to the sky it actually stands against — round 37's rule per pixel instead of one sampled
ratio — under the legacy horizon ceiling, the authored `fogTintHex` / `fogMix` (the tint following the sky's own
elevation ratio, as the round-37 falloff scaled the whole target), the directional warm / cool tints, the blue-grey
hue guard and the far-field cap 0.385. `uAtmo 0` keeps the legacy target byte for byte (the mobile tier). The terrain
splat material never sees a LUT — it sits at its sixteen texture units; the LUTs are sampled in the dome and the
post pass only.

**The disc is the ground's fill.** The first captures darkened Verdant's near field 37 % (grass 131 → 81 display
luma) with the fog, the hemisphere and the environment intensity all unchanged; nulling the environment in-page
dropped the legacy tree by the same amount. Cause: three's Preetham shader emits the sun disc at sunIntensity ×
19000 × Fex (~10⁵ after the engine's scale) and the knee exempts it, so PMREMGenerator folds a 2.7 · 10⁻⁴ sr disc into
the environment's diffuse mip — a shadowless fill of about 0.5 irradiance units (× envIntensity, × the foliage
materials' envMapIntensity 0.85) that every map's ground was tuned with. The new dome keeps that energy exactly
(`legacySunDiscRadiance`: Preetham's law with the atmosphere's transmittance in place of Fex, the legacy 0.533°
half-angle): Verdant's near ground reads 127 against the base's 128.

**Calibration — the mapping.** A map's authored sky keeps its intent; `skyPresetToAtmosphere` reads the fields the
Preetham dome read. Preetham's Rayleigh coefficient is linear in `rayleigh` and its Mie coefficient linear in
`turbidity × mieCoefficient` (× the engine's 1.25), so: rayleighScale = 0.7 × rayleigh, mieScale = 40 × turbidity ×
mieCoefficient × 1.25, mieG = mieDirectionalG (clamped 0.45–0.92), ozone 1, ground albedo 0.25, sun illuminance 8.0,
viewer height 50 m, the sun from `sunElevationDeg` / `sunAzimuthDeg`. A grid fit (mean |Δ log radiance| per channel
over 30 directions per map, the 2–20° band weighted twice, the sun's 8° skipped) against the legacy dome on the
twelve good maps has a flat minimum at 0.6–0.7 / 250–320 (loss 0.325), but that aerosol whitened the anti-solar sky
the sky views look at; six capture candidates on verdant / desert (`.qa-dev/r65-atmo-probe.mjs --calib`) chose 40 /
8.0: verdant's sky-w bands 105 / 136 / 174 display luma against the legacy 107 / 135 / 174, at saturation 0.63 against
0.78 — the ceiling of a Rayleigh sky (a real zenith is blue / red ≈ 3–4 in linear light; Preetham's `pow 1.5`
reached 9–11). The residual is structural: three's Preetham evaluates its Rayleigh phase at (cos θ · 0.5 + 0.5),
halving the anti-solar sky, and its in-scatter to the power 1.5 saturates the upper sky and washes the sun's quadrant
— the white-out the r8 / r9 critics fought; the physical model corrects both. Residuals at the pinned constants: verdant
0.44, urban 0.51, railyard 0.60, frontier 0.39, delta 0.45, monsoon 0.38, alpine 0.39, foundry 0.45, airfield 0.45,
orchard 0.40, longleaf 0.38, reservoir 0.39 (mean 0.435). Olympus Basin authors its own thin CO2 sky
(`atmosphere: { rayleighScale 0.03, mieScale 60, mieG 0.76, ozoneScale 0, mieTintHex 0xe8895a, groundAlbedoHex
0x9b6a48 }` — Rayleigh at 3 % of Earth's, dust at optical depth 0.32 absorbing blue, a rust bounce); no other map's sky
block changed, so the Garage copies, `villageWear`, `mangroveWaterPalette` and `badlandsRelief` are unmoved.

| Map | sun el/az | T / rayleigh / mie / g | → rayleigh | → mie (AOD) |
|---|---|---|---|---|
| verdant, orchard | 32/115, 28/132 | 4 / 1.2 / 0.006 / 0.82 | 0.84 | 1.20–1.35 (0.006–0.007) |
| urban | 36/115 | 4 / 1.4 / 0.005 / 0.80 | 0.98 | 1.00 (0.005) |
| frontier, longleaf, reservoir | 27/121, 24/108, 26/142 | 4.4 / 1.25 / 0.0058 / 0.82 | 0.88 | 1.22–1.28 (0.006–0.007) |
| airfield | 30/142 | 3.8 / 1.5 / 0.005 / 0.81 | 1.05 | 0.95 (0.005) |
| delta, mangrove | 38/104, 32/94 | 6.2 / 1.75 / 0.0085 / 0.84 | 1.22 | 2.42–2.64 (0.013–0.014) |
| monsoon, foundry | 24/124, 25/128 | 7.8 / 2.05–1.35 / 0.012 / 0.88 | 1.43, 0.94 | 4.68 (0.025) |
| alpine | 16/132 | 4.2 / 2.0 / 0.0052 / 0.78 | 1.40 | 1.09 (0.006) |
| railyard | 42/115 | 9 / 2.4 / 0.0025 / 0.72 | 1.68 | 1.13 (0.006) |
| winter, whiteout | 33/115, 13/164 | 7.2 / 2.2 / 0.002 / 0.70 | 1.54 | 0.72 (0.004) |
| desert, oasis | 44/115, 22/104 | 7–5.2 / 0.85 / 0.009 / 0.80 | 0.59 | 3.15, 2.34 (0.017, 0.012) |
| titan_gorge, copper_mesa | 34/126, 31/98 | 6.2–5.6 / 1.15–1.1 / 0.008–0.007 / 0.84 | 0.80, 0.77 | 2.48, 1.96 (0.013, 0.010) |
| skybridge, ruinspires | 25/120, 24/118 | 7.4–7 / 1.22–1.15 / 0.010 / 0.86 | 0.85, 0.80 | 3.70, 3.50 (0.020, 0.019) |
| caldera, blackglass | 22/116, 18/242 | 8.5–8.4 / 1.15–1.3 / 0.014–0.013 / 0.88 | 0.80, 0.91 | 5.95, 5.46 (0.032, 0.029) |
| badlands, steppe, polders, fjord, coastal, saltwind, autumn | — | — | 0.73–1.26 | 0.56–3.42 |
| mars (authored) | 24/122 | night, galaxy | 0.03 | 60 (0.32), dust tint, no ozone |

**Measured (map-view-probe on both trees, 31 maps × sky-w / sky-s / centre-far / bird-w, desktop tier, seed 1337;
sky boxes: mean display luma / HSV saturation of the upper (rows 60–200 of 720), middle and lower sky bands of the
1280-px frame; skyline = map-metrics check 5, lower is better).** The good-map tolerance, stated: the anti-solar sky
band (sky-w, the sun at 115° azimuth) stays within 10 % luminance on verdant (107 → 105), urban (170 → 169), frontier
(88 → 96), delta (133 → 124), alpine (106 → 109), orchard (92 → 95), reservoir (94 → 93); it brightens on the
dark-sky presets foundry (45 → 93), monsoon (83 → 121), longleaf (75 → 96) and darkens on the white-sky presets
railyard (201 → 156) and airfield (139 → 110); saturation moves −0.15 there. The sun-side band (sky-s) darkens 20–35 %
on every good map (verdant 169 → 116, urban 179 → 131, railyard 214 → 165, alpine 181 → 120) and gains saturation
(+0.1–0.3): that is the legacy halo wash leaving. The skyline ratios of the good maps are unchanged within ±0.05
(verdant 0.74 → 0.73, urban 1.00 → 0.98, railyard 0.70 → 0.67, delta 0.80 → 0.79, alpine 1.07 → 1.04, foundry 0.68 →
0.61, orchard 0.79 → 0.80, reservoir 0.81 → 0.80, monsoon 0.57 → 0.56); the far ranges on centre-far are unchanged
(copper_mesa 0.66 → 0.67 with the same haze on the mesas). The near ground is unchanged (verdant 128 → 127).

The bland maps gain the gradient: desert 61 → 74 (saturation 0.90 → 0.71, a real sky instead of ink), oasis 34 → 62,
titan 66 → 79, skybridge 42 → 77, caldera 32 → 85, ruinspires 39 → 78, copper 67 → 89, badlands 41 → 72, each with a
deep zenith over a paler warm horizon and the ring standing in aerial perspective; and check 5 moves for the first
time on the arid rings without touching the ring albedo: desert sky-w 1.49 → 1.18, oasis 1.19 → 0.92, titan 1.37 →
0.95, skybridge 1.66 → 0.94, ruinspires 1.14 → 0.97, copper 1.32 → 1.00, badlands 1.58 → 1.09 — the physical sky above
the ridges is brighter than the capped Preetham band, so the pale ranges no longer read paler than the sky behind
them. Mars: unchanged (41 → 42; the galaxy). Winter and Whiteout (round 44, not re-graded): winter sky-w 0.89 → 0.85,
sky-s 0.87 → 0.90 (both inside the 0.80–0.90 acceptance), centre-far 1.03 → 1.05; whiteout 1.00 → 1.01, 0.88 → 0.93,
0.94 → 0.95 — the real sky radiance did not create the whiteout skyline; the snow stays on the shoulder above it, which
is the owner's re-grade call (closed by round 70).

**Performance.** Per frame the model costs one 2D fetch in the dome and one in the aerial pass per ground pixel; the
tables and the summary run once per preset (≈ 1 ms GPU, a synchronous 128-byte readback) under the loading cover.
The round-59 probe (its copy in `.qa-dev`) at the chase pose, main → base pairs in one process: draw calls and
triangles identical (verdant 687 / 7.32 M, desert 610 / 4.30 M), programs +7 (the three builders, the summary, the dome
and its environment variants). The wall-clock rows, new → base, chase CPU / GPU ms with the 1-minute load beside
them: verdant 14.6 / 38.6 → 15.4 / 43.7 (load 38–56) and 13.8 / 30.4 → 13.0 / 32.3 (64); whiteout 8.6 / 28.0 → 7.6 /
25.4 (58–64) and 7.9 / 25.5 → 7.1 / 25.2 (54); mars 6.5 / 25.9 → 6.0 / 26.4 (46) and 10.6 / 47.3 → 9.6 / 25.2 (42–45).
The box ran two foreign suites at load 20–64 throughout this round, where ANGLE's command-buffer timer and the
main-thread frame are noise-bound (the same mars pair read 47 and 25 ms GPU a minute apart; a base verdant pair read
51 ms against 15 ms for the new tree in the same minute), so the +0.5 ms GPU / +0.3 ms CPU check against the round-59
table is not settled by these rows: the per-frame work the model adds is one LUT fetch in the dome and one in the
aerial pass, and the rows should be re-read at the round-59 load (5–20) before the next deploy.

**Receipts (exit 0).** atmosphere (new), skyEnvironmentCache, skyHorizonCache, skyCloudBake, deviceEnvRadiance,
aerialDetail, frameLoopScheduler, lateFxColorHandoff, lateFxSceneView, postFrameAccounting, postViewportScale,
sceneSourcePass, temporalAA, late-fx-matrix.browser, fx/lazyRuntime, garageDressingDrawRange, battleAtmosphereAccess,
battleAtmosphereRuntime, adaptiveQualityPolicy, quality, garageSkyPresets, garageEnvironmentPresentationRuntime,
worldActivationRuntime, map-metrics, csmShaderRelease, nearVehicleShadowDetail, shadowGeometryClaims, shadowPrime,
shadowRefresh, shadowStability, cropBiomeIdentity, cropLighting, grassBladeShape, plasterSurfaceSharing,
propsResources, vegetationProgramKey, vegetationResources, terrainMaterialOwnership (program key and fetch census
untouched), horizonResources, horizonMesaSurface, mapQuality, worldBuildCoordinator, wallSkyLight,
environmentExpansion, villageWear, mangroveWaterPalette, badlandsRelief (no digest moved: Mars sits outside the
frozen config digests), public-repo-hygiene, attribution, typecheck.

**Open (closed by round 68).** The overcast presets (railyard, winter, whiteout, foundry, monsoon) read as a hazy blue day: their white came
from Preetham's optical-depth saturation, which the physical model replaces with real multiple scattering, and a
heavy aerosol (mieScale 80–150) would make a flat grey sky at 0.4 luminance while cutting the sun transmittance to
0.3–0.5 — and with it the disc's environment fill — so it is not the answer; a physically overcast sky is a cloud
layer, the next lane (volumetric clouds lit by this atmosphere). A per-map `atmosphere.mieScale` override exists if
the owner wants a milkier sky meanwhile. The sun-side wash of the legacy dome is gone by construction. The calibration
hook `window.__ATMO_CALIBRATION` (pre-boot) and `?atmosphere=off` stay as QA switches.
thumbnail, 4K hero and tactical-map plate predate the cutting. (Closed by round 67: the tunnel portal and
gallery, the batters' seeding, the vault bands halved, and the thumbnail / hero / plate closed as render noise; the
ring's seating rule stays open.)

### Round 67 — 2026-09-24: the open notes closed

The small notes rounds 58–63 left open, one commit each (lane r67-open-notes from 47103edf4, the round-63 tip; A = a
pristine detached worktree at that commit, B = this lane; `tools/map-view-probe.mjs` at seed 1337 under the probe
mutex, one run at a time, judged on 1280 px reductions and 2× crops in `$SP/r67/cap/`; numbers in `$SP/r67/`; the
A/B pixel figures below are the world band between the roster panels, above the HUD bar, |Δluma| > 8 = "moved").

**1. Tarkhan's tunnel portal (railSpurs.ts `railCuttingTunnel`, mapKits.ts `dressRailTunnelPortal`, horizon.ts).**
A spur that leaves the square through a cutting now runs on down the valley to a portal derived from the cutting,
never authored. The horizon ring's first authored ridge stands rim + 200 m on every style (`horizonRowMargins`,
now `HORIZON_FIRST_RIDGE_MARGIN_M`, held equal to `RAIL_TUNNEL_RIDGE_RUN_M` by the receipt) and meanders ±3 %, so
the headwall stands 125 m past the path's end on the valley's radial — before the ridge's foot can wander — and a
75 m masonry gallery runs from it to the ridge line, its roof meeting the face wherever the face has climbed to it.
The approach bends from the line's heading onto the radial on a 90 m curve (5.1 m off the axis, on the floor), 33
spans of the same lay on the outland bed. The portal: an 18 × 10.5 m headwall with a segmental arch the width of the
8 m floor (spring 4.5 m, rise 2.5 m — the bridge's arc vocabulary), stepped wing walls splayed 35° down the valley,
gallery walls, roof and rear plate in the map's stone; behind the arch a dark bore 7 m deep with no interior — dark
walls, a dark ceiling and a dark floor rising at 45° into the dark, which is what hides the ring face that runs
through any bore (the face rises 32 m over the 47 m between the last seated row and the ridge row: no bore could be
dug into it). The ring's seated rows inside the corridor now lie EXACTLY on the outland bed to the first authored
ridge row (the hand-over share stands down with the seat weight — it had left rows 3–4 0.5–3.4 m over the bed at
100–145 m out, where the approach would have run under the ring); every other map's ring is unchanged (share × 1)
and the ridge row keeps its height to the bit. One compound record, kind `tunnel-portal`, closes the valley at the
headwall's plane: the gallery block (hw 5.5, hl 38.25) and a flank wall each side to the floor's edge (hw 22.1), so
no hull drives into the drawn ridge anywhere across the 88 m floor (the cliff rule already holds it off the batters;
nothing else stops a hull past the red line — the sim's height field continues the bed and the ring has no
collision). Measured (headless): the 99 approach sleepers on the bed at grade (worst 0.050 m, the seat sink), the
ring's foot row at run 142 on the bed and the ridge at run 190 at 37.0 m inside the gallery's reach, 71 ring
vertices seated in the notch and no ridge row moved. Tarkhan's shard recaptured headless: 2430 / 921 / 1302 raw
(+1 obstacle, +1 collider: the portal), census 2442 / 2153 / 1314 re-pinned, 1239550 B under the ceiling; bots
untouched (the grid stops at the square). Captures: `cutting-exit-bird` — A: the empty valley to the ring's first
ridge; B: the track running down the valley into a masonry portal whose bore reads black, the gallery roof a light
slab running back into the ridge, wing walls splayed on the floor (29.4 % moved, mean |Δ| 13.3/255);
`cutting-portal-low` (new, from the bed at the map edge looking down the valley — 48 views, `map-probe-runtime`
re-pinned) — A: the bare floor to the ridge with the hump the hand-over left; B: the rails curving right onto the
radial and running into a shaded headwall with a black arch, the ridge behind (8.8 %, 3.6/255);
`cutting-station-low` — the ridge through the mouth as before, the portal off the sightline to the right at 240 m
(5.5 %, 2.0/255); `centre-far` / `bird-w` frame noise (0.8–1.0/255). The lane's first A run was killed by another
lane while it waited on the mutex; the A frames were re-taken (`a2`) and are byte-identical on `cutting-exit-bird`.

**2. The batter faces seed grass and scrub (railSpurs.ts `railCuttingFaceSeedAt` / `railCuttingSeedAdmits`,
terrain.ts `_batterSeedAt`, vegetation.ts).** The `_noVeg` exclusion keeps the floor, the cess and the whole face
bare for trees, rocks and scattered props as before; the height field now also publishes `_batterSeedAt` (read on
the uncut ground like the exclusion, absent on every map without a cutting): a weight on each batter face that is 0
up to a third of the face's rise and climbs to 0.45 at the daylight line. The tuft and bush seeders take the
weight's share of their candidates on the face (a deterministic per-position trial — the bits of the coordinates
hashed, no stream draw, no cell pattern) and relax their 0.78 slope gate to 0.5 there (the batter is 55°, normal.y
0.57), so the batter reads as sparse growth in the rock thickening toward the daylight line, not a sward. The deep
faces at the map edge lie beyond the tuft seeder's 474 m rim-band cull, which culled every candidate before it
drew: a candidate the weight admits now passes that cull (the first B frame showed the deep faces bare); scrub
keeps its 470 m limit — relaxing it would shift the shared bush stream across the whole map. Headless: the
production filters admit 1,565 tufts of 60k candidates over the corridor, none on the floor or the cess; the admitted
share equals the mean weight (0.22 of 0.23); the `_batterSeedAt` publication is a declared round-67 delta in
`tools/road-constructor-history-fixture.mjs`. Captures: `cutting-edge-low` 2× crops — A: bare rock faces; B: sparse
golden tufts on the upper two thirds of both faces, thickest under the daylight line, the lower third and the cess
bare (2.8 % moved, 1.2/255 — small tufts on a wide face).

**3. The bridge's vault bands halved (mapKits.ts `BRIDGE_VAULT_BAND_M` 0.3 → 0.15).** Eight 0.1375 m bands per arch
instead of four 0.275 m ones; every haunch edge lies on the arc at its band's middle height, so a shell's height
error against the arc is at most half a band, 6.9 cm (13 cm before — the note's "a shell within a band's height of
the arc may meet stone the eye sees through or pass a sliver of it"). The deck part (the navigation's floor), the
abutments, the piers and the parapets are byte-identical; `bridgeDeckNavigation.ts` is untouched; the record is
31 → 55 parts. Amberford's shard recaptured headless on this tree (5873 / 5727 / 5822, census unchanged, 1829051 →
1830655 B under the round-63 ceiling; dated notes in the census and storage receipts). The round-63 shell traces
(`$SP/r67/bridge-trace-{base,new}.txt`) read the same: every level shot 0.15–1.3 m over the water passes all three
arches, 1.6 m and over meets the deck, a pier, the deck and a parapet stop a shell, the oblique bank shot meets the
haunch, a 1.5 m body passes under the middle arch and a 2.2 m body is stopped by the deck.

**4. The moored hull bobs and sways (maps/mooredHullMotion.ts, mapKits.ts `AnimatedDressing`, props.ts).** The kit lays
the hull into the wood bucket exactly as before and, when the caller supplies an `animated` sink, hands the same
geometry objects to it with the mooring point, the hull's yaw and a phase from the mooring point; props.ts takes
those pieces out of the merged wood mesh, builds one mesh per hull on the shared wood material (one draw call each)
and poses it every rendered frame in `updateProps` from an accumulated world clock: 3.5 cm of heave with 1.2 cm of
chop, 1.3° of roll, 0.5° of pitch on incommensurate periods (4.3 / 2.7 / 3.6 / 5.1 s), zero-mean, no stream draw,
no wall clock, no simulation state — the sim, the authority and the dedicated shards never see the hull move; the
mooring lines stay with the bollards. The world freezes every descendant's matrix after the build and makes the
root's `updateMatrixWorld` a no-op (map.ts), so the frame update composes the hull's local and world matrices
itself, as the instanced crush animations write theirs. Independent of the sheet shader by design (round 66 may
drive it from the ocean displacement later). A caller without a sink — every receipt — gets the static kit, so the
receipts that freeze the kit's bytes are untouched. Proof: `mooredHullMotion.selftest` (bounds, zero mean,
determinism, no repeat inside a minute, phase spread, no `Math.random` / `Date` in the module), `shoreJetty` (one
animated record per moored hull, the wood bucket byte-identical with and without the sink), and a headless runtime
probe on Saltwind that finds the two hull meshes and samples them a second apart: world y −7.331 → −7.352 m and
−7.338 → −7.361 m, roll 0.021 → −0.014 rad, the two hulls out of step, no page errors. A static capture cannot show
a 3 cm bob; none is claimed.

**5. Saltwind's piers take the shelf-sized length (riverLandings.ts, saltwind.ts).** A sea-strand landing that
authors no `jettyLength` now plans with the strand law's own length (from the shore end over the planar core with
room for the moored hull, within 4–10 spans); Saltwind's two anchors drop `jettyLength: 19` and plan 7 spans
(13.3 m) at −25° and 8 (15.2 m) at 45° at every seed, both with a gangway and a moored hull; an authored length is
still the pier's length, and the river and lake landings keep the 7.6 m kit default. Capture `jetty-w-low` — A: the
19 m pier running far out over the bay with the hull at its outer spans; B: the 13.3 m pier ending over the
shallows with the hull alongside, mast up, the shore end and gangway where they were (8.2 % moved, 4.1/255);
`strand-w-low` 2.1 %, 1.1/255.

**6. The wrack line's per-station draw budget (strandWrack.ts `stationStream`).** Every station and every landing
piece draws from its own stream, keyed by one salt the map's stream hands each lake and by the station's index, so
what a station lays never depends on what any other station admitted. Proof in the receipt: Saltmere's line laid
with the shipped keep-outs and again with one more 4.2 m keep-out on the band — 1,186 pieces more than 8 m from it
byte-identical piece for piece, 44 → 27 pieces beside it, the station count unchanged. The three strand maps' wrack
bytes move once for the new streams (the same law, different draws): beachedBoat's nine strand rows,
winterLakeGeometry's three digests and riverLandings' draw count (the main stream now spends one draw per lake:
11964 → 327) re-pinned with dated notes.

**7. The press ring's land-only bearings (ai.ts `pickPressPoint`).** On each ring the bearings are now the near side,
the far side, eight land-only fallbacks around the side aspects (90°, 60°, 105°, 45° off the nose, alternating
sides) and the straight approach last; a point on water is no press point where the map avoids liquid (the local
brake's own hull-corridor test, the hull facing the target). `ai.selftest` [22]: water beyond 55 m either side of
the target's axis — the ring takes the 45° near-side bearing (candidate 8), on land, 45° off the nose; without water
a side point as before. The receipt's failure count is now checked at the end as well: checks [14]–[21] could print
FAIL and still exit 0. `server/battlePacing` in full on this tree under the mutex: 0/124 timeouts, median 351.4 s,
p10 265.9 s, no battle under 120 s; the untouched base 47103edf4 measured the same way reads 0/124, 353.9 s,
258.8 s. Per-map rows reshuffle as every AI change does (Polders 379/312/376/414 → 379/332/428/369 s, Saltwind
389/268/298/419 → 389/307/298/451 s); Urban and Ruinspires to the bit.

**Round 64 — 2026-09-24: Tarkhan's picker thumbnail, 4K hero and tactical-map plate (docs closure, no code).**
Re-baked on the round-63 tree, the three images differ from the deployed ones only by render noise — hero: mean
|Δ| 1.63/255 per channel, 0.69 % of pixels over 16; plate: 0.36/255, 0.17 % — because the cutting lies at the
eastern rim outside the plate's square and off the hero's framing. The deployed images stand and the note closes
without a deploy.

**Receipts (exit 0 on the final tree; the changed files' receipts by name).** railCutting (the tunnel section:
resolution, the curve, the approach sleepers on the bed at grade, the stone and dark pieces, the 3-part record, the
ridge within the gallery's reach, `HORIZON_FIRST_RIDGE_MARGIN_M` = `RAIL_TUNNEL_RIDGE_RUN_M`; the faces' seeding
weight, the admitted share, the hook absent elsewhere), railSpurs (siding vs approach, the portal record, digest
re-pinned), railCoalStockpiles (the portal's footprint contract), map-probe-runtime (48 views, dated), the horizon
family, roadLookupGrid + badlandsRelief + terrainStreaming + foundryServiceCourt + environmentExpansion + villageWear
(the `_batterSeedAt` publication a declared delta), loggingYardGrass + grassChunkWork + grassCarpetWork and the
vegetation family, mapQuality, propsScheduling, spawnClearance, the road receipts, archedBridgeCollision (8 bands,
the haunch on the arc, the shard's parts), dedicatedWorldCollision (steppe census +1/+1; autumn note),
collisionManifestCodec/Loader/Memory, structureCollision, structureSupport, collision, bridgeDeckNavigation,
botRoutePlanner, matchPlacement, navigationLiquidSafety, mooredHullMotion (new, in the core inventory), shoreJetty,
riverLandings (per-landing strides; 1284 / 89880 / 2568, the merged 3852 / 123264, the draw count and state
re-pinned twice, dated), beachedBoat (the nine strand rows, dated), winterLakeGeometry (three digests, dated),
strandWrack (the freeze proof), villageWear + mangroveWaterPalette (saltwind.ts config digests, dated),
shoreDirtMask, mangroveFisheryWharf, riverReedContact, railWashout, shallowWater, selftest-suites, ai (+ [22]),
ai.aim, botGunLane, authoritativeBots, spotting, combatMaintenance, battlePacing (full), garage:terrain:check,
public-repo-hygiene, attribution:check, typecheck.

**Still open.** The ring's own seating rule still continues every other column by the rim's interior gradient (the
round-63 note; owner: never flatten the background mountains). The gallery's roof is a plain stone slab where it
stands proud of the face; an earth-covered gallery (a fill prism on the roof) would read softer from the bird view.
The A/B captures of items 4 and 6 are the receipts, not frames (a 3 cm bob and a re-rolled wrack line under the same
law are not pictures).

### Round 66 — 2026-09-24: an FFT ocean

Lane r66-fft-ocean from origin/main 5a0c2e679 (the deploy-84 row). Owner 2026-09-24 (with the Tidewater demo and its
frames): "some of these assets and shaders and skies and graphics are incredible and will help us improve stuff a lot"
— the water target is a moving multi-scale surface with sky reflection, clear shallows over a visible bed with caustic
ripples, whitewater only at the shore break, no uniform foam. The reference is WebGPU + WGSL compute on its own engine,
so nothing drops in; the ocean below is written first-party in GLSL from the papers, with the reference read for
structure and constants only. No third-party code or assets entered the tree.

**Model.** Tessendorf, *Simulating Ocean Water* (SIGGRAPH course notes, 2001): the surface is the inverse 2-D Fourier
transform of a field of complex amplitudes h̃(k, t) = h̃0(k) e^{iωt} + h̃0*(−k) e^{−iωt}, ω² = g k tanh(k d); the
horizontal ("choppy") offsets Dx, Dz = iλ (k/|k|) h̃ and the derivatives dDy/dx, dDy/dz, dDx/dx, dDz/dz, dDx/dz come from
the same transform, and where the Jacobian of the choppy map drops below one the crest is folding — that is where foam
is made. h̃0 comes from an empirical directional spectrum (Horvath, *Empirical directional wave spectra for computer
graphics*, DigiPro 2015): the JONSWAP frequency spectrum of Hasselmann et al. (1973) with its fetch laws for α and ωp,
the TMA finite-depth factor (Bouws et al. 1985, Kitaigorodskii form), Hasselmann's (1980) cos^{2s} directional
spreading blended with a plain cos², and the change of variables Ψ(k) dk² = S(ω) D(θ, ω) (dω/dk) / k. A second, long-
fetch, narrowly spread system is the swell; it carries an authored share of the wind sea's energy.

**Cascades.** Three patches — 400 / 96 / 12 m on the coasts, 200 / 48 / 8 on the lakes, 120–140 / 30–32 / 6 on the
rivers and marshes — partition the wave-number plane by band: a wave belongs to the smallest patch that still holds
six of its wavelengths, so the swell, the wind chop and the capillary ripple each get a whole 128² grid. The tiles stack
in ONE texture (128 × 3·129 texels): every pass touches every cascade at once, and each tile carries one padded row that
repeats its first, so bilinear sampling wraps inside the tile (x wraps through the sampler, z through the pad). The
maps carry no mip chain; a cascade finer than a pixel's footprint fades out of the normal instead of aliasing.

**The transform on WebGL2 (no compute).** `src/world/oceanSpectrum.ts` (THREE-free) builds the time-zero spectrum on
the CPU — h̃0(k) beside h̃0*(−k) in one RGBA32F texel, the Nyquist line and k = 0 empty, seeded Box-Muller phases,
sliced per cascade between the world builder's yields — and generates the GLSL of every pass. `src/world/oceanFft.ts`
runs them: a Stockham inverse FFT as fragment-shader passes over RGBA32F ping-pong targets with two colour outputs
(A = Dx + iDz, Dy + i dDx/dz; B = dDy/dx + i dDy/dz, dDx/dx + i dDz/dz — every field is real in space because each
spectrum is Hermitian, so two real fields ride in one complex transform), radix 16 then 8 per axis, four passes a
frame: the first evolves the spectrum to the current time and packs the fields, the middle ones are butterflies, the
last applies the (−1)^{x+z} sign of the centred k origin, accumulates the Jacobian foam against the previous frame's
map and writes the two RGBA16F maps the sheet samples — displacement (λDx, Dy, λDz, foam) and derivative (dDy/dx,
dDy/dz, λ dDx/dx, λ dDz/dz). A per-output Stockham stage needs no shared memory: the output index names its butterfly
group, its slot in the radix-R DFT and the group's base input; the receipt runs the same index arithmetic in JavaScript
against a direct DFT (error 1e-14) and a headless read-back of the GPU maps matched the CPU reference to 2.4·10⁻⁴ on
0.3 m amplitudes (half-float storage precision) on all three cascades. Tiers: the mobile tier and receipts (no
renderer) keep the sheet untouched; the desktop `low` preset halves the grid and every preset below `high` transforms
on alternate frames.

**The sheet (`shallowWater.ts`, program key v13).** The long cascade displaces the sheet's own 8 m vertices (it holds
the ≥ 16 m waves; the shorter cascades live in the normal); the displacement flattens over the bank band and stops at
the water's edge, where the crest instead lifts a thin film a few centimetres up the strand. In the fragment stage the
cascades' slopes join the normal beside the normal-map wave and the round-46 reactive field (which composes on top
unchanged: wakes and splashes still read); the Jacobian foam whitens through the same foam path as the churn, torn by
the fine wave texture (round 46's lesson: foam that saturates is milk). Depth-aware breakers read `getWaterDepthAt`'s
bed law in the shader (bed = depthM · w²(3 − 2w) of the mask wetness — the same function, so no bed texture and no
terrain sampler): where the bed rises into the wave band the slopes steepen (shoaling), the long cascade's crest breaks
white over the bank band, and past the break the whitewater runs up the strand with the crest and drains back (the
swash), the water's edge breathing with the swell instead of standing on one mask contour. Caustics on the shelf bed:
the sun ray refracts at the flat surface and lands `bed` metres down; the finest cascade's curvature at that entry point
focuses or spreads the light (a thin lens of index 1.333: the one-bounce form of Wallace's photon splatting, its
concentration 1 / (1 + 0.25·d·∇²h) taken as a bounded odd shaping tanh(−4.5·d·∇²h) — the raw concentration has a
positive mean over a zero-mean curvature field and bleached the whole band white; the converging half at full weight,
the diverging half at a third, so the network is bright lines over a bed barely darker between them — and the lens
constant raised twelvefold because the 12 m / 128 tile resolves ripples of 20 cm and longer, a fraction of the
curvature real capillary ripples carry) and the sheet adds that gain to the share of the bed the sheet shows (1 − α) — no terrain-material change,
the terrain material stays at its sixteen texture units and its program key v39, and the round-40 marine ring faces
are untouched.

**Per-map sea states.** Every map with a water sheet authors an `ocean` block (wind speed and the direction it blows
toward, fetch, swell share, amplitude, choppiness, foam, breakers, caustics) over the defaults of its water kind; the
owner's approved maps keep a low amplitude so they read the same from the chase camera.

| Map | kind | wind | fetch | swell | amplitude | λ | patches | Hs (per cascade) | foam | breakers | caustics |
|---|---|---|---|---|---|---|---|---|---|---|---|
| coastal | coast | 5.2 m/s → 190° | 30 km | 0.35 | 0.7 | 0.9 | 400 / 96 / 12 m | 0.50 m (0.39 / 0.32 / 0.04) | 0.5 | 0.85 | 0.6 |
| saltwind | coast | 5 m/s → 8° | 24 km | 0.4 | 0.75 | 0.9 | 400 / 96 / 12 m | 0.47 m (0.30 / 0.35 / 0.05) | 0.5 | 0.9 | 0.7 |
| fjord | coast | 3.2 m/s → 250° | 6 km | 0.1 | 0.45 | 0.7 | 400 / 96 / 12 m | 0.08 m (0.02 / 0.07 / 0.03) | 0.15 | 0.3 | 0.5 |
| reservoir | lake | 3 m/s → 150° | 3 km | 0 | 0.6 | 0.6 | 200 / 48 / 8 m | 0.06 m (0.00 / 0.06 / 0.03) | 0 | 0.15 | 0.5 |
| delta | river | 2.4 m/s → 110° | 2 km | 0 | 0.55 | 0.4 | 120 / 30 / 6 m | 0.04 m (0.00 / 0.03 / 0.02) | 0 | 0.05 | 0.35 |
| monsoon | river | 2.8 m/s → 200° | 2.5 km | 0 | 0.6 | 0.4 | 120 / 30 / 6 m | 0.05 m (0.00 / 0.05 / 0.02) | 0 | 0.05 | 0.25 |
| autumn | river | 2.6 m/s → 100° | 2 km | 0 | 0.6 | 0.4 | 120 / 30 / 6 m | 0.04 m (0.00 / 0.04 / 0.02) | 0 | 0.05 | 0.35 |
| polders | marsh | 3.6 m/s → 300° | 5 km | 0 | 0.9 | 0.4 | 140 / 32 / 6 m | 0.15 m (0.04 / 0.14 / 0.03) | 0.05 | 0.2 | 0.3 |
| skybridge | lake | 3.8 m/s → 40° | 4 km | 0 | 1 | 0.6 | 200 / 48 / 8 m | 0.15 m (0.01 / 0.14 / 0.05) | 0.1 | 0.25 | 0.55 |
| mangrove | marsh | 2.6 m/s → 80° | 3 km | 0 | 0.8 | 0.4 | 140 / 32 / 6 m | 0.07 m (0.00 / 0.07 / 0.03) | 0 | 0.15 | 0.25 |
| oasis | lake | 2.8 m/s → 120° | 2 km | 0 | 0.7 | 0.6 | 200 / 48 / 8 m | 0.05 m (0.00 / 0.05 / 0.03) | 0 | 0.1 | 0.9 |

**Verified.** The pixels, measured against the base tree (origin/main 5a0c2e679) with `tools/map-view-probe.mjs` on eighteen
water views of the eleven maps (far, bird, edge, shore, strand, jetty and bridge views; 198 pairs), the in-water chase
probe (`.qa-dev/water-chase-probe.mjs`: the hull teleported onto the broadest wet cell, chase / bird / side) and the
close-up probe (`.qa-dev/ocean-closeup-probe.mjs`: the strand, the bank band straight down and oblique, the shallows,
with the sheet's debug channels 2–5 — the long cascade's lift, the whitewater, the fine tile's footprint weight, the
caustic focus — and the caustic / breaker terms zeroed one at a time). Far and bird views (centre-far, bird-w, bird-n)
moved ≤ 2.6 % of their pixels with a mean |Δ| ≤ 0.7 / 255 on every map against the round-59 3.5 % far-pose floor —
the footprint fade keeps the cascades out of the distant sheet, so nothing sparkles or aliases from a bird's eye — the
one exception Saltmere's centre-far (8.6 % / 2.3), whose right half is the open sea, now moving. On the shore views the
composites show the change where the water is (Saltwind's surf line along the strand, the finer chop and the whiter
wash around Saltmere's pier, the clear caustic mottle on Highland Reservoir's shelf) and grass or tree sway where it
is not (the polders' and Delta's edge views, Reservoir's jetty-fjord-low: a tree, a rock and grass, 30–60 % "moved").
From the chase camera in the water (a 1000 × 530 px water box) the four approved maps read as the same water: mean
|Δ| 3.8 (Nordhavn), 10.0 (Delta), 8.0 (Monsoon), 5.2 (Reservoir) against a same-tree run-to-run floor of 4.0 / 9.2 /
5.8 / 4.0 (the base captured twice: the sheet's own drifting wave texture is never at the same phase), and the box's
mean luma +1.5 / +1.9 / +0.3 / +1.3 of 255 against the floor's ±0.8 — the tolerance rule: mean |Δ| within 2.5 of the
floor and mean luma within ±2 / 255. The flat seas move on purpose: Saltwind −2.7 luma with mean |Δ| 13.1 (floor 13.6:
the bay already carried the strongest normal-map wave), the polders +3.0 / 7.7 (floor 2.6), Skybridge +2.2 / 4.3
(floor 0.6), Mangrove Reach +0.8 / 8.4 (6.0), the oasis +3.2 / 4.3 (1.4), Saltmere +1.7 / 18.7 (20.2). Eye check of the 1280 px reductions: no zebra
bands, no milk foam (the whitecaps are sparse and torn: the coast maps' Jacobian bias 0.81, the lakes' 0.62–0.66 make
foam only where a crest folds), no phase-locked corduroy (three cascades at non-integer ratios, Box-Muller phases per
texel), breakers only over the bank band and the run-up only on the strand. Four tuning rounds on the way: the thin-
lens gain at the paper's constant read as ±2 % (invisible); the raw concentration then bleached Saltwind's bank band
white (isolation captures: the band vanished with the caustic term off, stayed with the break off); the symmetric tanh
read as dark blotches from the chase camera; the shore break as one smooth band until gated to the crest tops.

**Performance.** The transform's own cost by the slope method (`.qa-dev/ocean-cost-probe.mjs`: a timer query around k = 1 and
k = 8 transforms, the per-transform cost (T₈ − T₁) / 7 cancelling the timer's constant): 0.61–0.77 ms GPU and 0.014 ms
CPU per frame on Saltwind / Saltmere / Reservoir / Delta / the polders — the GPU figure on ANGLE Metal's command-buffer-
granular timer, so it carries the fixed cost of four render encoders and is an upper bound; the fragment work of a
128 × 387 pass is a few hundredths of a millisecond. The sheet's shading (three cascade fetches for the normal, one
for the displacement, five for the caustic Laplacian, all RGBA16F, on the sheet's pixels only) adds no CPU and could
not be separated from the noise of a machine at load 20–60 with the gate's suites and their headless browsers on the
GPU: the in-page on / off deltas swung between −0.8 and +7 ms GPU across runs while the CPU deltas stayed at 0.0–0.5 ms.
The round-59-style pairs (`.qa-dev/r66-map-perf-probe.mjs`, base → r66 per map, 90 frames a pose): chase-pose CPU
median Δ 0.0 ms across the eleven maps (−7.9 … +5.8 between pairs at load 8–35), programs +5 on every map (the four
passes and the reset), triangles identical, draw calls +1 … +6 (the sheet is one draw; the rest is the bots' poses),
scene textures unchanged. Two knobs stand ready if the integrator's clean measurement lands over the +0.6 ms line:
`oceanFrameStride` (alternate frames, what the medium preset already does) and `oceanGridSize` (64², the low preset's
grid), both per preset in `oceanFft.ts`.

**Receipts (exit 0).** `src/world/oceanFft.selftest.mjs` (new, registered in the world group): the Stockham stages against a direct DFT
at n = 8 … 256, the 8 × 8 field against the double sum, spectrum symmetry / bands / energy, the GLSL of every pass, the
gates, the pass sequence on a recording renderer, the presets, the sheet handshake, the terrain wiring and the eleven
authored sea states; `shallowWater` (the terrain call shape and key v13 re-pinned), `waterRipples` (unchanged),
`terrainMaterialOwnership` (the program key v39 and the fetch census untouched: no terrain change), `horizonResources`,
`horizonMesaSurface`, `mapQuality`, `environmentExpansion`, `worldBuildCoordinator`, `edgeWater`, `shoreline`,
`badlandsRelief` (`round66Ocean.test-support.mjs` projects the eleven `ocean` blocks), `playableRelief`,
`villageWear` and `mangroveWaterPalette` (config digests re-pinned with dated notes), `terrainStreaming` /
`terrainSplatFields` / `terrainWetLayer` / `sourcedTerrainPreparation` / `wallSkyLight` (the sea block's new
identifiers sit inside the sandboxed `if (cfg?.splat?.seaLake …)` block), `garageSkyPresets`; the 100-receipt sweep
of every receipt naming a changed file (`grep -rl <basename>`), `selftest-suites`, `public-repo-hygiene`,
`attribution:check`, `npm run typecheck` — all exit 0. A headless GPU proof (`.qa-dev/ocean-gpu-probe.mjs`): every
program of a Saltwind battle links (215 programs, the terrain at 16 samplers, the sheet at 12), and the displacement
map read back at t = 3 s matches the CPU reference to 2.4·10⁻⁴ m (half-float storage) on all three cascades.

**Open.** The transform's four encoders cost more than their fragments (the stride / grid knobs above); a fourth cascade at
~3 m would resolve the capillary networks real caustics come from (one more tile, the same passes); the displaced
surface is presentation only — `getWaterSurfaceHeightAt`, the buoys, the moored hulls, the splashes and the ride keep
the mean level (the sea maps' swell stays under 0.35 m, below the jetty decks' 0.45 m clearance); the run-up whitens
the sheet but does not wet the sand (a wet-sand band is the terrain material's, untouched by this round); the foam
feedback primes once like the ripple field (a GPU-residency suspension would restart it from whatever the restored
targets hold); the oasis' network at its 0.9 knob is the strongest of the fleet and wants the owner's eye; the mobile
tier keeps the round-47 sheet. The reference's breakers (a plunging lip as a ribbon mesh, spray particles, an Eulerian
shore simulation) are not ported: the round's break is the crest's own whitewater and run-up on the sheet.
### Round 69 — 2026-09-24: contact shadows, ground bounce, sun shafts, lens flare

The second post/lighting round off the tidewater reference (round 65 gave every battlefield its physical sky): the
four light effects a modern renderer layers on a cascaded-shadow, forward-lit frame, each written first-party from
its paper with the reference read for structure only — no shader text, no asset entered the tree. Each runs behind
its own lever on the desktop presets (quality.ts `contactShadows` / `groundBounce` / `sunShafts` / `lensFlare` on
Ultra, High and Medium; Low and the phones carry none), resolved with the device tier and the page query by
`engine/postLightFxPolicy.ts`: `?fx=off` boots the frame exactly as before (the pinned captures), `?fx=contact,shafts`
keeps only the named effects, `post.setLightFx({...})` overrides at runtime for A/B probes, and the canvas publishes
the resolved set as `dataset.lightFx`.

**Contact shadows (`engine/contactShadows.ts`, inside the aerial pass).** The cascades ground a hull to within their
texel and receiver bias and the five-tap PCF opens a penumbra across that band, so a lit seam survives at every
contact line — track links, road wheels, wall bases, crates — and the object floats a little. Bavoil / Sainz's
screen-space march closes it: from each visible point a twelve-rung march toward the sun (quadratic spacing, dense
at the contact; 0.55 m at 4 m growing to 1.4 m at 40 m; per-pixel interleaved-gradient jitter; fading 65 → 90 m) tests
the resolved scene depth, and a sample behind the depth surface by more than a bias and less than a growing thickness
is an occluder. It runs inside the aerial pass — the one full-resolution pass that already reconstructs every pixel's
world position from depth — so no pass was added. Two things make it a shadow-term change rather than a darkening on
top: the lit materials now write their CSM sun visibility (`cotSunVis`, captured since the ambient shadow dim) into the
opaque scene target's alpha (`lighting.ts` patches `opaque_fragment` under Three's own `OPAQUE` define; the canvas is
`alpha: false`, so the channel was free; the aerial pass consumes it and restores one), and the pass reconstructs the
normal from depth (best pair of the four neighbours), so an occluded pixel loses exactly its sun share
`T / (T + A)` — T the sun term for that normal and visibility, A the ambient the rig gives it (hemisphere poles,
environment with the disc fill, the anti-sun fill) — and a pixel the cascades already shadow is untouched. First
capture finding: the meadows came out combed with dark streaks — every grass blade is a depth-buffer occluder and the
blades never cast in the cascades. An occluder now counts only when the depth five pixels either side of the hit lies
on the same surface (0.12 m + 0.012 m per metre): blades, wires and far poles drop out, hulls, tracks, wheels, walls
and rocks pass.

**Ground bounce (`engine/groundBounce.ts`, inside the lit materials).** Sunlit ground is far brighter than the
hemisphere light's constant ground pole, and it is the dominant indirect light on every face turned toward it — hull
undersides, wheel arches, flanks, eaves, wall bases. The term is analytic (the terrain material holds its sixteen
texture units, and every material would need the sampler tidewater bakes): for a receiver normal n, the lower-hemisphere
view factor (1 − n.y) / 2 × the share of that ground the face sees sunlit (a face turned from a low sun looks at its own
object's shadow; an underside sees half shaded ground under the object and half lit ground beside it) × a receiver
factor from its own CSM visibility (a face inside a cast shadow stands on shaded ground) × the irradiance sunlit flat
ground reflects — sun colour × intensity × sin(elevation) × the rig's ground tone (the hemisphere's own ground colour,
the light rig's model of the terrain) × gain 0.6 — added to Three's indirect diffuse before RE_IndirectDiffuse so the
albedo, AO and BRDF apply. Energy conservation: only the EXCESS over the hemisphere's ground pole is added (the upper
and lower view factors sum to one; the round-42 sky light on steep terrain faces belongs to the upper half), so nothing
is counted twice, shaded ground adds nothing and never subtracts, and no face receives more from below than sunlit
ground reflects. The uniforms ride into every CSM material through `setupShadowMaterial` and the term lives in the
`lights_fragment_end` patch beside the ambient shadow dim; a zero radiance skips the block.

**Sun shafts (`engine/sunShafts.ts`, quarter resolution).** Mittring / Sousa's screen-space rays: a sky-versus-geometry
mask around the sun's screen position (one depth fetch per quarter-res texel; a squared radial falloff to 0.40 of the
frame height; the round-68 cloud lane may multiply its transmittance in here), blurred toward the sun in two passes of
twelve taps (the whole segment, then a twelfth of it — 144 effective samples), written into one quarter-resolution
light target the grade adds in linear HDR before its tonemap (no full-resolution pass). Colour: the atmosphere's sun
transmittance (round 65's summary — warm and dim at a low sun) under a slight warm tint. The first capture was a milky
wash over the sun's quadrant: the blurred sky mask brightens the open sky it came from, so the write holds the field
back to a quarter where the texel itself is open sky and the rays stay what the silhouettes carve out (gain 0.16).
Per-map gating by the preset's haze (`sunShaftMapStrength`, the receipt's table over all thirty-one skies): the
aerosol it asks for (turbidity × mieCoefficient, round 65's mie mapping) or its fog density, whichever is stronger,
× a low-sun factor (full to 26°, none from 46°) × the day factor (no moon shafts) × the sun-in-frame fade (the sun may
sit half a frame outside). Monsoon, Caldera, Foundry, Blackglass, Ruinspires, Skybridge 1.0; Badlands 0.90; Oasis
0.80; Alpine 0.72; Fjord and Whiteout 0.64; Titan Gorge 0.56; Verdant 0.53; Longleaf 0.44; Winter 0.26; Urban 0.22;
Railyard and Steppe 0.08; Coastal 0.04; Desert 0.03; Mars 0. `sky.ts` publishes the inputs with every fog
application (`scene.userData.skyHazeInputs`).

**Lens flare (`engine/lensFlare.ts`, quarter resolution).** Hullin et al.'s ghosts simplified to the procedural form:
four aperture ghosts on the axis from the sun through the image centre (soft bodies, a faint rim, per-channel
dispersion, vanishing as the sun nears the centre), a dispersive halo about the centre that strengthens toward the
edge, a thin streak through the sun and a small glow, all × the sun colour × gain 0.05 — restrained. Occlusion: a
1 × 1 pass samples the resolved depth on a 24-tap golden-angle spiral over a 1.6° disc at the sun and eases the visible
fraction toward its target at 14 / s (a two-target ping-pong), so a treeline or a turret crossing the sun dims the
flare without popping; the flare fades over the last tenth before the frame edge, never shows for a sun behind the
camera, and under the night dome the moon flares at 12 % of the sun. The flare adds into the shafts' light target
(and clears it when the shafts lever is off).

**Chain.** Scene → aerial (+ contact shadows) → GTAO → late FX → TAA → bloom → shafts → flare → grade (+ light target)
→ SMAA → FSR: the order the receipts pin is unchanged, the light target is the only new texture the grade reads, and
the two quarter-res passes are the only new draws (three for the shafts — mask, blur, blur-and-write — two for the
flare — the 1 × 1 visibility and the additive quad — and only the visibility draw while the sun is behind the camera).

**Measured (headless, desktop tier, `?fx=off` against the same tree).** The smoke (`.qa-dev/r69-smoke.mjs`, four maps,
chase and e-wall-300, the captures deterministic frame to frame): every program links (212–217), no shader or page
error, the levers resolve (`contact+bounce+shafts+flare` / `off`), the meadows are byte-stable outside the tank's
band (verdant chase ground region 85.8 → 85.4 luma, monsoon 31.5 → 31.5) where the first cut had combed them (85.8 →
69.1) and speckled the desert's tufts; the sun-ahead view lifts the ground under the rays and the sky around the sun
(verdant 64.9 → 68.0 and 153.8 → 158.5; titan 89.2 → 93.9 and 130.1 → 134.5; monsoon's top band 148.1 → 148.0 with
its sun at the frame's left edge behind the fronds, the glow left of the band; desert 0.3 % at strength 0.03). An
earlier cut's second blur pass overwrote the mask target, so the hold-back read the blurred field and let more glow
onto the open sky; the last blur pass now writes the light directly (three draws) and the mask stays the mask. The tank's contact band reads under the hull edge and rear plate at chase range; the urban centre
view (sky-w, the camera against a brick block) shows a window sill floating on a lit seam in the base frame and
casting a soft-edged dark band on the bricks in the new one. Map-view-probe A/B on eight maps × four views (verdant,
desert, titan_gorge, fjord, monsoon, winter, mars, urban; base b9e18f308 vs the branch tip, the b frames re-shot after
the write fold): the far-field views — sky-w, centre-far, bird-w — read 0.02–2.2 mean |Δ| on every map (Mars ≤ 0.03
everywhere: no haze, a dim sun), the sun-ahead e-wall-300 view carries the rays (titan +4.0 % luma, verdant +2.0 %,
monsoon +0.7 %, urban +0.5 %, desert +0.4 %, fjord 0 with its sun 56° outside the frame), and the two larger numbers
are not the effects (winter e-wall 14.5 = the wind-swayed bare tree at the frame edge; urban sky-w 3.9 = the sill's
band). Eye check on the 1280 px reductions
of the eight maps: the sky is not washed, the rays stay what the silhouettes carve, the flare is a faint halo arc and
a ghost on the sun-to-centre line, the far ranges unchanged.

**Performance.** The round-59 probe (its copy in `.qa-dev`), new → base in one process at the chase pose, load 11–32
with two foreign suites running: triangles identical, draw calls +1 (verdant 691 / 690, desert 616 / 615, titan 735 /
738, winter 768 / 766, fjord 782 / 778), programs +4 / +5 (the shafts' two, the flare's two, the grade variant); its
wall-clock rows are noise-bound (same-tree repeats 5–7 ms apart on ANGLE's timer) and its per-tree browser session
wedged after winter's second base repeat (mars and urban timed out on both trees). An in-page paired A/B
(`.qa-dev/r69-inpage-ab.mjs`: one page, bots frozen, six variants — off, all, and each effect alone — alternated
every 60 frames for eight rounds at the chase and the sun-ahead pose, titan_gorge and verdant, load 20–85): the
delivered frame interval is 16.7 ms in every variant at both poses (vsync-locked, no frame lost with everything on),
the main-thread delta is −0.6 … +0.2 ms for the full set at the four pose × map cells (contact alone +1.5 / −0.1 /
0.0 / +0.1, bounce +1.2 / +0.4 / −0.1 / +0.2 — inside the rounds' own ±3 ms spread), and the ANGLE Metal timer
attributes +1–7 ms to the two quarter-resolution passes at the sun-ahead pose while the frame interval and the main
thread do not move — the command-buffer-granularity reading the round-59 audit documented, not work (a 1 × 1 draw
cannot cost 7 ms). The ≤ +0.8 ms GPU line therefore stands on the frame interval and the counts, not on that timer;
a vsync-off run on an idle box or a native capture is the instrument that settles it.

**Receipts (exit 0).** postLightFxPolicy, contactShadows, groundBounce, sunShafts, lensFlare (new, core group);
postViewportScale, postFrameAccounting, lateFxColorHandoff, lateFxSceneView, temporalAA, sceneSourcePass,
resolvedDepthCopy, csmShaderRelease, nearVehicleShadowDetail, shadowStability, shadowFitCache, shadowRefresh,
shadowPrime, shadowGeometryClaims, articulatedShadowBatch, lodShadowFade, deploymentShadowWarm,
networkShadowPrimeAdapter, deviceEnvRadiance, adaptiveQualityPolicy, quality, temporalAoPolicy, atmosphere,
skyEnvironmentCache, skyHorizonCache, skyCloudBake, aerialDetail, battleAtmosphereRuntime, battleAtmosphereAccess,
nightLightingRuntime, nightLightingAccess, nightEmissionMaterial, frameLoopScheduler, renderLayers,
sceneProgramWarm, deploymentUploadPrograms, programWarm, coveredComposerWarm, garageSkyPresets,
garageDressingDrawRange, wallSkyLight, terrainMaterialOwnership (untouched: program key and fetch census),
mapQuality, fx/lazyRuntime, daynight-atmosphere-probe, public-repo-hygiene, attribution, typecheck.

**Open.** The other twenty-three maps' A/B captures (the eight above took nine minutes per tree at load 20–30; the
full set is a quiet-box job); the GPU line on a finer timer; the two browser receipts (resolved-depth-copy,
late-fx-matrix) and the render-stability audit were not run in this window; a killcam frame (no probe offers one);
the contact march uses the unjittered view-projection when temporal AA is on (half a pixel, tolerated); the
alpha-to-coverage cards receive no contact shadow at all (a leaf card under a hull keeps its own lighting); the bounce
tone is the rig's constant ground pole — a per-map terrain tone (the palette's grass / sand) would colour it; the
round-68 cloud transmittance has its hook in the shafts' mask; the contact edge's per-pixel jitter reads as a faint
static grain without temporal AA.

### Round 68 — 2026-09-24: volumetric clouds

**Owner ruling 2026-09-25 (deploy 93): reverted to the baked decks.** "I really don't like the volumetric clouds; the clouds and skies we had before were fine." The layer stays in the tree as an opt-in (`?clouds=volumetric`), every battlefield shows the baked cloud decks by default again, and the round-65 sky underneath is unchanged.

Round 65 left one note open: the overcast presets (railyard, winter, whiteout, foundry, monsoon) read as a hazy blue day
under the physical sky, because their white came from Preetham's optical-depth saturation, and a physically overcast sky
is a cloud layer. This round gives every battlefield a raymarched cloud layer lit by that atmosphere. Nothing from the
reference enters the tree: the density model, the lighting and the temporal scheme are written from Schneider & Vos
(*The Real-time Volumetric Cloudscapes of Horizon Zero Dawn*, SIGGRAPH 2015 / Nubis 2017), Hillaire 2016 (the Frostbite
multiple-scattering approximation) and Wrenninge 2013 (the scattering octaves), with the reference for structure only;
every noise texture is generated at boot by first-party code, and no shader text, noise file or asset was copied.

**The layer (`src/engine/volumetricClouds.ts`).** A slab between a map's cloud base and top. Its coverage is cut from a
256² weather field (`src/engine/cloudNoise.ts`): a cumuliform coverage carried by cumulus cells (600 m and 1 km on a
12 km tile, gated sharply by a mesoscale gradient-noise field so the puffs cluster into groups with clear regions
between), a separate stratiform coverage carried by the mesoscale field itself, both histogram-equalised so a map's
coverage *c* admits exactly the fraction *c* of its field, G the cell profile that raises columns, A a fine breakup.
Its shape comes from a tileable 64³ Perlin–Worley volume (R the Perlin fbm dilated by inverted Worley, GBA Worley fbm
at 4 / 8 / 16 cells per period, five Worley fields shared between the channels) with the Nubis remap, a flat base at the
cloud base altitude and a domed top that narrows with height; its edges are eroded by a 32³ Worley-fbm detail volume in
two fetches (a 300 m period everywhere, a 3.7× finer one within ~5 km, the octaves leaning to the high frequencies so
the silhouette crinkles), wisps under the base and cauliflower lumps on the tops, the erosion growing with height in the
cloud. A thin slab samples the volumes with the vertical axis compressed (clamp(450 / thickness, 0.9, 1.4)) so the
billows read as tall as they are wide; a tall storm slab does not (compressed cells stack into layers). The bakes are
pure and deterministic — they run in `cloudNoiseWorker.ts` behind the loading cover, the synchronous bake is the
fallback, and the receipt digests their bytes in Node. Lighting per sample: the sun's irradiance at the viewer's
transmittance (the round-65 summary) in the sky's own units, a five-tap light march toward the sun on the base shape
(three taps through a stratus, and it stops once the sun is gone), Beer–Lambert with three multiple-scattering octaves
(contribution, attenuation and eccentricity each halved: dual-lobe Henyey–Greenstein 0.8 / −0.2, then 0.4 / −0.1, 0.2 /
−0.05 — the forward lobe lights the thin edges toward the sun, the silver lining), a diffusion term that keeps the
shaded side grey rather than black and builds with height in the cloud, the powder term darkening the bodies and
undersides seen away from the sun, darker bases, and an ambient from the summary — the cosine-weighted sky irradiance
on the tops, the anti-solar horizon band on cumulus bases. The far haze is the aerial pass's own law (post.ts's
densities, ceilings, desaturation and cool shift, its height-aware attenuation) with the sky-view LUT along the ray as
the target, uncapped (the pass's luminance caps hold a lit mountain against the haze; a cloud bank fades into the sky it
stands against — capped, every far deck sat a band darker than its sky), the scatter ceiling ramping 0.55 → 0.92 over
3–12 km so the far field of small cumulus reads as a hazed horizon band, not a carpet of puffs; the receipt pins the
mirror of the pass's constants.

**Cost.** The march runs into a trace target of one sixteenth of a half-resolution history: a 4 × 4 Bayer slot cycle
refreshes one cell of every block a frame (four slots a frame for four frames after a camera cut — a jump over 6 m, a
turn over 0.35 rad, a zoom, the killcam's cut, a preset or size change), at most 96 steps on a slab-scaled floor
(thickness / 40, coarser through a stratus sheet) up to 120 m strides and 9 km out (a bank beyond has melted into the
sky), longer strides through empty air that back onto the fine lattice where cloud is met (a boundary found on the
coarse stride terraced the walls), and a resolve pass reprojects the previous history through the previous camera
(the anchor is the slab's mid-altitude along the ray, Catmull-Rom in five bilinear taps), clamps it to the 3 × 3
neighbourhood of this frame's samples with a margin and blends the fresh slot in (a running average after a cut, then
an exponential one). The composite is a horizon-flattened dome mesh in the scene's transparent queue — depth-tested by
the terrain and the ring, never writing depth, premultiplied over the physically based dome, the knee and the dome
intensity applied once — so the night maps keep their starfield and moon with the clouds as dark occluders, and the AO
prepass ignores it like the decks. `post.ts` owns one hook, `scene.userData.volumetricClouds?.beforeSceneRender(...)` at
the top of its frame transaction before the TAA jitter; the cirrus veil stays the baked deck, the baked cumulus deck
hides while the layer shows and returns on the mobile tier, on a failed atmosphere readback, and under `?clouds=off`
(the pinned bake receipts).

**Every map keeps its identity (`src/engine/cloudPresets.ts`).** No map's sky block changed — the Garage copies deep-equal
them — the layer derives from the fields the decks read: coverage = 0.22 · cloudOpacity^1.3 of the cell-carried field
(the 1049 fair-weather deck at cloudOpacity 1 → 0.22: the strongest cell cores as separate puffs, the sky mostly open;
Olympus Basin's 0.3 → 0.05 wisps; delta's 1.16 → 0.27, alpine's 1.12 → 0.25), bases at 1400 m (an authored deck lifts to
at least 1200 m: the arid maps' 820–900 m decks fly at 1200; an authored deck at or below 600 m keeps its altitude —
polders' 420 m stratocumulus), 320 m thick plus a little for the tropical maps' turrets, density 0.11 / m; the legacy
overcast rule of sky.ts (both decks near-opaque under turbidity ≥ 7) or an authored deck at or below 400 m → the stratus
regime (the broad field at coverage 0.94, base at the authored deck, 320 m thick, flat tops, density 0.035, diffuser-lit
and neutral: winter, whiteout, railyard, foundry, caldera, ruinspires, blackglass, skybridge); an overcast preset with
the thickest fog (Monsoon) → the storm regime, which keeps the map's approved blue sky: towers of the broad field (a 1600
m slab, coverage 0.28) beyond a 2.5 km clear radius around the camera, casting; the tint is the authored `cloudTintHex`
perceptually halved (a quarter on an overcast), the wind runs across the sun. The broken regime (from coverage 0.30) is
reachable only by authoring; `sky.cloudLayer` lets a map author any field. The receipt pins the table of all 31.

**Cloud shadows.** The terrain material never gains a sampler (its sixteen units): a per-cascade plane on the shadow-only
layer, parented to the CSM lights each frame (at the light, facing it, sized to the shadow box, its UVs projected along
the sun onto the cloud base with the trace's own weather shift — the wind drift plus the map's decorrelation offset,
which the first build omitted, so its shadows never matched the clouds), alpha-tests the weather's coverage field at
the cloud's dense core (coverage + 0.06) so the cascades carry the shadows at no shading cost. Cumulus regimes under a
day sun cast (the legacy fair-weather patchiness `cloudShadowAmp` ≥ 0.15, the storm's towers included); overcast decks,
thin decks and the night preset keep the aerial pass's soft term; where the gobos cast, `scene.userData.cloudShadeAmp`
is 0 so nothing is shadowed twice. Verified in-page at the bird pose on verdant (`.qa-dev/r68-gobo-probe.mjs`): the
ground's mean display luma 80.1 → 75.3 with the gobos (−6 %), the share of pixels in the darkest bin +2.4 points.

**The integrator's eye check (four fixes on the same branch).** The first build's cumulus were large smooth cotton masses
at 620 m that changed the flagship maps' character; the arctic overcasts carried a tan cast (the stratus floor and the
diffused-sun term took the low sun's warm horizon band: whiteout's sky-w band 51 / 90 / 133 → 164 / 149 / 126 rgb); the
storm ceiling covered Monsoon's sky while the ground stayed sunlit; and the gobos sampled the weather without the map's
offset. The fixes: the cell-carried coverage field with small clustered puffs at 1200–1800 m, flat bases, the two-fetch
erosion, the restored powder and a lower sun gain; the stratus lit from the sky irradiance's cool hue with a floor in a
hue half way from the zenith's to neutral and a neutral diffused sun (whiteout's band now 173 / 176 / 181, winter's
196 / 195 / 194); Monsoon on option (b) — its blue sky with towering cumulus off toward the horizon and the thin baked
cirrus overhead — because it measures closer to the base than option (a): the storm ceiling had put its sky-w band at
+31 % luma and saturation 0.54 → 0.09 with the skyline 0.56 / 0.54 → 0.62 / 0.57, the towers leave the bands within +6 %
and the skyline at 0.55 / 0.54; and the gobo shift.

**Measured (`tools/map-view-probe.mjs` on both trees at 9d2197e8c, 31 maps × sky-w / sky-s / centre-far / bird-w, desktop
tier, seed 1337; skyline = `map-metrics` check 5, base → round 68; bands = `.qa-dev/r68-sky-bands.mjs`: mean display
luma of the upper (rows 60–200, 30–43° of elevation), middle (200–380) and lower (380–560, just over the skyline) sky
bands of the 1600 × 900 sky views).** The good-map rule of round 65, stated: on verdant, delta, alpine, reservoir,
urban, frontier, orchard, longleaf and airfield the middle band stays within ±15 % of the base and the lower band within
±10 % on both sky views. Measured, sky-w / sky-s middle band: verdant +9 / +6 %, delta 0 / +3, alpine +11 / +3,
reservoir +2 / 0, urban 0 / +2, frontier +2 / +2, orchard +4 / +2, longleaf +5 / +3, airfield +5 / 0; every lower band
within ±3 %; the upper band, where the nearest puffs stand, moves up to +24 % (airfield sky-w; verdant +14, orchard and
longleaf +17); the middle band's saturation moves at most −0.09 except alpine's sky-w (0.44 → 0.24, a puff group across
the band). Skylines of the nine within ±0.03 except alpine sky-w 1.04 → 0.91 (a puff above the ridge): verdant 0.73 /
0.71 → 0.76 / 0.70, delta 0.78 / 0.71 → 0.78 / 0.73, reservoir 0.80 / 0.75 → 0.81 / 0.75, urban 0.98 / 0.20 → 0.98 / 0.20,
frontier 0.75 / 0.67 → 0.75 / 0.66, orchard 0.80 / 0.59 → 0.81 / 0.60, longleaf 0.53 / 0.62 → 0.55 / 0.60, airfield 0.71 /
0.64 → 0.71 / 0.60. The overcast five read as neutral ceilings: winter 0.86 / 0.91 → 0.84 / 0.87 (inside the 0.80–0.90
acceptance; its middle band 134 → 192 luma, saturation 0.43 → 0.01), whiteout 1.01 / 0.93 → 0.92 / 0.85 (it was never
inside the band; the sky-s view now is, sky-w sits at its edge; 101 → 173, saturation 0.50 → 0.06), railyard 0.67 / 0.73
→ 0.67 / 0.71 (176 → 213), foundry 0.61 / 0.58 → 0.59 / 0.56 (118 → 197), monsoon 0.56 / 0.54 → 0.55 / 0.54 (blue kept,
towers on the horizon). The bland maps gain sparse white cumulus over their deep blue: desert 1.17 / 0.99 → 1.19 / 0.98
(middle band +1 / −4 %), titan_gorge 0.95 / 0.80 → 1.00 / 0.79 (−3 / +5 %), caldera 0.72 / 0.51 → 0.61 / 0.49 (an
ash-grey broken ceiling with blue gaps: +41 / +39 %), mars 0.96 / 0.73 → 0.96 / 0.76 (dark wisps on its galaxy).
Elsewhere copper_mesa's sky-w skyline 1.00 → 0.56 (a bank over the mesa skyline) and polders' sky-s 0.91 → 1.01 (its
authored 420 m deck crossing the skyline band). Eye check of the 1280-px A/B grids (`$SP/r68/grids`): the overcast five
read white-to-grey ceilings with gaps; verdant, reservoir, desert and titan show small clustered puffs with white tops
and grey-blue bases over an open sky that keeps the baked cirrus veil; delta and alpine carry more of them; the far
field melts into the horizon haze; Olympus Basin's wisps are dark occluders on its galaxy.

**Performance.** The per-slot cost of the trace and the resolve, measured by repetition in the page
(`.qa-dev/r68-trace-bench.mjs`: the frame's GPU ms with the slot traced once against eleven times, Δ / 10, 90 frames ×
3 rounds at the chase pose, load 12–18, so the frame's noise is amortised over the repeats): verdant 0.38–0.44 ms,
winter 0.37, whiteout 0.52 (0.91 before the stratus sheet took three light taps and a coarser step), monsoon 0.28 ms
GPU; CPU ≤ 0.25 ms per slot (two quad renders; ±0.2 noise). The steady state traces one slot a frame — with the
premultiplied composite (five taps over the sky pixels) and the four gobo quads in the shadow passes the layer sits
under the +1.0 ms GPU / +0.3 ms CPU budget; the four slots a frame of a rebuild cost 1.5–2 ms GPU for four frames after
a cut. The within-page on / off pairs against the baked decks (`.qa-dev/r68-inpage-perf.mjs`, 4–6 pairs × 90 frames)
read verdant CPU +0.15 / GPU −0.7, desert +0.4 / −1.6, whiteout +1.6 / +1.5, monsoon +0.7 / +0.9 ms at load 4–8 (tip
28b01b0fe, before the stratus trim) and were noise-bound at load 10–20 on the final tip (single pairs from −4.6 to +14
ms GPU, medians +1.5–4.2), so the frame-delta check wants a quiet window before the deploy, as round 65's did. The
two-tree round-59 probe rows (`$SP/r68/perf`) were noise-bound at load 22–34. Programs +7 (215 → 222); the noise bakes
run in the worker under the loading cover; no per-frame allocation.

**Receipts (exit 0, tip 9d2197e8c).** volumetricClouds (new: the noise digests, tiling and equalisation of both coverage
fields, the cell cores admitted at coverage 0.24, the 31-map layer table, the good-map ranges, the shadow policy and
footprint, the slot cycle, the haze mirror of post.ts, the hooks), atmosphere, skyCloudBake, skyHorizonCache,
skyEnvironmentCache (configureSkyUniforms hash unchanged), deviceEnvRadiance, aerialDetail, postFrameAccounting,
lateFxColorHandoff, lateFxSceneView, postViewportScale, sceneSourcePass, temporalAA, frameLoopScheduler, fx/lazyRuntime,
garageDressingDrawRange, late-fx-matrix.browser, shadowPrime, shadowGeometryClaims, csmShaderRelease, shadowRefresh,
nearVehicleShadowDetail, shadowStability, renderLayers, adaptiveQualityPolicy, quality, garageSkyPresets
(byte-identical), battleAtmosphereAccess, battleAtmosphereRuntime, worldActivationRuntime, terrainMaterialOwnership
(untouched), horizonResources, mapQuality, environmentExpansion, worldBuildCoordinator, villageWear, mangroveWaterPalette,
badlandsRelief (no map config moved), public-repo-hygiene, attribution, typecheck (+ the unused-symbol check), the
public build (the noise worker chunk emitted).

**Open.** The frame-delta perf pairs at this load; whiteout's sky-w skyline 0.92 at the band's edge (it was 1.01; the
round-44 snow re-grade remains the owner's call — closed by round 70) and polders' sky-s 1.01 under its authored low deck; the upper sky band
on airfield (+24 %) where the nearest puffs stand; the cumulus crinkle is still soft at range and alpine's low-sun puffs
read warm and smooth; a camera inside or above the slab (the bird pose over a 300 m ceiling) sees the terrain unclouded,
as with the decks; the gobos draw into every cascade (the same footprint, so no shadow doubles — a cascade policy could
trim the draws); night clouds are pure black occluders (a faint moonlit edge would read better); the QA hooks
`gpuTiming` / `benchRepeat` / `frozen` on the layer and `?clouds=off` stay for A/B. *(Round 71 closed the soft crinkle at
range and alpine's warm smooth puffs with the per-map cloudscapes, and added the `debugMode` / `readHistory` hooks; the
perf pairs, the whiteout and polders skylines, the airfield upper band, the inside-the-slab camera, the cascade policy
and the moonlit edge stay open there.)*

### Round 71 — 2026-09-25: the cloudscape pass (volumetric clouds; default on from 71c)

**Owner (2026-09-25, rating round 68 five out of ten):** "they just look really bad and just like puffs... if we made them
look better, I would be ok with them... make the clouds better and a lot more customized." The layer stays OPT-IN
(`?clouds=volumetric`) until the owner approved the new look on the review sheet — which happened on the 71b Winter shot ("wow our clouds look amazing", 2026-09-25 evening): from 71c the layer is the default on every tier that renders it and `?clouds=off` / `?clouds=baked` keep the baked decks; before that the baked decks remained the default and
their pinned bytes are untouched (`?clouds=off` / no query renders exactly as before).

**Why round 68 read as puffs.** One coverage scale (600 m / 1 km cells gated by one mesoscale field) made same-sized
blobs; no vertical character (one dome profile for everything); uniform erosion (blobby edges); the lighting flat
(the sun term died a few taps into the mass, the ambient carried the body, the base and the top shared one tone); the
far field melted into the sky past three kilometres; one cloud kind.

**The weather (`src/engine/cloudNoise.ts`).** The isotropic 256² field is multi-scale: a synoptic band field (two to
three stretched bands per 12 km tile — fronts and clearings) shifts a mesoscale group field (1–3 km) that gates the
cumulus cells (500 m and 1 km), so the cells cluster along bands with clear lanes between and a spread of sizes; its G
channel is a convective-vigour field (equalised) the layer maps between a map's type range (the Nubis weather map's
coverage / type / precipitation idea, written first-party); B the broad stratiform coverage; A the fine breakup. A
companion field lives in the WIND FRAME (the layer rotates its lookup so x runs along the wind): R cumulus streets —
cells along five wandering rows per tile (2.4 km apart; the rows wander by a low-frequency noise so they never read as
a ruled grid) with the row itself a base where the gate is deep; G the anvil / precipitation field (broad, stretched);
B cirrus streaks (gradient fbm stretched 6 : 1, equalised so a cirrus coverage c admits c); A cirrus fibres. Two more
bakes: a 32³ curl volume — the curl of a three-component gradient-noise potential, the divergence-free field of Bridson,
Hourihan & Nordenstam 2007 — that advects the erosion lattice, and a 32² void-and-cluster blue-noise tile (Ulichney 1993)
for the march offsets. All six bakes stay pure, deterministic and Node-runnable; the worker posts them smallest first;
the shape and detail volumes are byte-identical to round 68.

**Per-map cloudscapes (`src/engine/cloudscapes.ts`, `cloudPresets.ts`).** Every map config carries a `clouds` block
beside `ocean`: a regime — a named sky the meteorology has a word for — and any knob (coverage, base, thickness, towers,
anvil, wispiness, wind direction / speed, shear, streets, cirrus coverage / angle / altitude, tint, sun gain, ambient
scale, clear radius, far band, scud, density, type range, stratiform, shadow). Eighteen regime rows fill what a map
leaves unset; the sky block fills what a row leaves open (the base of an authored deck, the tint from `cloudTintHex`
perceptually halved, the wind across the sun), so a block can be `{ regime: 'cloud-streets' }`. main.ts carries the
block on the preset (`sky.cloudscape`) so the sky blocks stay byte-identical to the Garage's copies (`garageSkyPresets`
green); Mars carries its block on the shared `MARS_SKY_PRESET` because the Mars ruleset applies that preset directly;
`sky.cloudLayer` still overrides the resolved numbers raw. The receipt pins the 31-map table:

| Map | Regime | Coverage | Base m | Thick m | Notes |
|---|---|---|---|---|---|
| verdant, orchard, longleaf, autumn, reservoir | fair-weather-cumulus | 0.26–0.32 | 1400 | 720 | streets 0.3–0.5, cirrus 0.12, far band 0.25; autumn's wind from its ocean (100°) |
| airfield, ruinspires, skybridge | fair-weather-cumulus | 0.38–0.42 | 1400 / 1100 / 700 | 720 | broken cumulus; skybridge under its deck with far band 0.5 |
| frontier, steppe | cloud-streets | 0.34 / 0.28 | 1400 | 660 | streets 0.85 / 0.9, wind 9 m/s, shear 0.2 |
| coastal, saltwind | sea-streets | 0.32 / 0.30 | 1100 | 600 | streets 0.75 off the sea (winds 190° / 200°), far band 0.65 / 0.55 |
| delta, mangrove | towering-cumulus | 0.36 / 0.34 | 1200 | 1800 | towers 0.7 / 0.6, anvil 0.15, shear 0.25 (450 m lean), winds 110° / 80° |
| monsoon | cumulonimbus-front | 0.34 | 1000 | 3200 | anvils, shear 0.35, scud 0.6, cirrus 0.25, clear radius 2500 m (round 68's blue sky over the base stays), wind 200° |
| desert, oasis, badlands, copper_mesa, caldera | cumulus-humilis | 0.14–0.22 | 1700 / 1900 / 1500 | 380 | flat dry cumulus, cirrus veils 0.35–0.5 |
| alpine | lenticular | 0.16 | 2400 | 450 | stationary smooth lens caps cut from the broad field, far band 0.5 (cumulus below the peaks) |
| fjord | broken-stratocumulus | 0.62 | 900 | 500 | scud 0.35 (sea fog rags), far band 0.6, wind 250° from its ocean |
| polders | broken-stratocumulus | 0.66 | 420 | 500 | the Dutch sky under its authored 420 m deck, streets 0.4 |
| winter | stratocumulus-deck | 0.86 | 700 | 420 | a lumpy closed deck, diffuse light, ambient 1.3 |
| whiteout | low-stratus | 0.95 | 300 | 300 | a white-out ceiling with rare breaks, scud 0.2 |
| foundry, railyard, urban | hazy-altostratus | 0.72 / 0.78 / 0.60 | 2600 / 2200 / 2800 | 500 | thin milky sheets with breaks under the warm haze, cirrus 0.3–0.35 |
| titan_gorge | dense-overcast | 0.96 | 450 | 500 | the dense hazy ceiling, sun gain 0.9 |
| blackglass | ash-veil | 0.55 | 800 | 450 | an ash veil high (cirrus 0.5, wispy) with cumulus under it, sun gain 0.85 |
| mars | thin-ice-clouds | 0.06 | 2500 | 400 | thin water-ice wisps and a cirrus haze (0.45) under the dust veil, rust tint |

The brief's "pole ice fog + stratus" names no shipped map; the `ice-fog-stratus` row exists for it.

**The trace (`src/engine/volumetricClouds.ts`).** Each column takes its type's height profile (Nubis): a stratus rises
fast and fades from half height, a cumulus keeps a flat base under a top that narrows from two thirds up, a
cumulonimbus keeps its width to a flat top; the column top rises with coverage and vigour; towers lift the deepest
convective columns. Anvils: where the broad anvil field peaks under the convective end of the type range the top
quarter widens (the coverage threshold falls) under a flat, vertically flattened cap. Wind shear leans a column
downwind with height as a rigid lean — the weather and the noise are both read in the column's own frame
(`cloudColumnXZ`); displacing only the noise slid the billows through an upright outline and read as stacked layers.
Erosion: the detail lattice is advected by the curl volume (more with height), the wispy (inverted-Worley) share grows
with height and with the map's wispiness, the amount grows with height (a crisp dense base, wispy tops), a smooth regime
(wispiness 0: the lens caps) erodes a third. Scud: a regime's ragged fragments in a 380 m band under the base. Lighting:
a dual-lobe Henyey–Greenstein (forward 0.8, back −0.3, both shrinking per octave) under the multiple-scattering octaves
of Wrenninge 2013 / Hillaire 2016 (contribution, attenuation, eccentricity halved; three octaves), the light march's
tap ladder scaled per texel by the rotating blue-noise offset (a static per-texel scale never averaged out of the
history and read as 8 px blocks), the Beer–powder term of Schneider & Vos 2015 toward the sun only, the ambient split
between the sky irradiance on the tops and the horizon / ground term under the bases (the summary pass) attenuated by
the optical depth above the point (two vertical taps: the underside of a thick lump is darker than a thin edge), a
sheet's diffused sun through the layer, the energy-conserving step integration, the far scatter ramp moved out (3–12 km
→ 5–24 km, ceiling 0.92 → 0.82) so a deck keeps reading at the horizon, the march to 20 km with strides that grow with
the pixel footprint. Behind the slab: a far stratocumulus band (a 2D sheet from the broad field at twice the period,
beyond 8 km, opaque at grazing angles) and a wind-sheared cirrus sheet at 8–12 km (two parallel octaves of the streak
field, fibres, a strong forward lobe with the 22° halo of hexagonal ice, hazed by the slant through the boundary-layer
haze so an overhead cirrus stays clear and one at the horizon melts) — the baked cirrus veil hides while the layer shows
(its filaments crossed the streaks as a lattice). Empty-space skipping: a slab segment shorter than 3 km is tested at
six weather taps before any march. The low quality preset marches at 1.8 × the stride (medium 1.3); the mobile tier
never creates the layer. The shadow gobos now carry a custom depth material that discards by the same two weather
fields the trace reads (the street rotation cannot be baked into a world-aligned alpha map), so the ground shadows
follow the streets.

**QA hooks.** `layer.readHistory()` copies the history to an 8-bit target and reads it back (the cloud transmittance
mask at history resolution) for the metrics; `.qa-dev/r71-capture.mjs` shoots each map with the mask, `r71-metrics.mjs`
measures, `r71-sheet.mjs` builds the review sheet, `r71-trace-bench.mjs` is round 68's per-slot bench with the opt-in
query.

**71b — the integrator's eye check (~6 / 10: "real progress on variety but three regimes read as artifacts").**
Streets read as strings of beads, the front as a picket fence of leaning columns, cumulus as blobby cotton with flat
lighting. Five fixes, each verified on a six-map smoke before the full pass: (1) the street field is continuous rolls —
seven Gaussian ridges across the wind per tile (σ 0.2 rows, 1.7 km apart), each wandering along the wind, with an
amplitude fading and returning over 6–12 km and a lump modulation of moderate depth riding on the roll (cumulus lumps
on a roll, never a lattice of cells; the first build gated cells onto rows). (2) The picket fence was two things: the
tall slab sampled the shape volume stretched 2.2 × vertically (`uVertScale` floor 0.45 → 1.0: isotropic on tall slabs),
and cells mixed into the front's field — the front now cuts the broad field (fieldMix 0.9) into masses 2–5 km across
with a low continuous base deck (0.2–0.36 of the slab) and towers clustered where the vigour channel peaks, a tower the
width of a vigour lump (1.5–3 km) and its height comparable, the lean a shear of the top third only
(`cloudColumnXZ`), the anvil fanning downwind above it. From the ground the front reads as a dark flat-based wall with
bright cauliflower tops. (3) The cauliflower: a second shape octave at 2.7 × the frequency crinkles the mass at 90–23 m,
and the inverted Worley cells of both octaves LIFT the column top over each cell centre (× 0.7–1.2) and drop it at the
borders, so the outline is bulge-on-bulge while the interior stays dense — a multiplicative Worley mask on the upper
half (the first attempt) thinned the interior and read as pancakes; the density saturates a short way in from the
outline (`smoothstep(0.03, 0.6)`: crisp edges, no halo). (4) Lighting: the Beer–powder term's sign was inverted in 71a
(it darkened the thin edges seen toward the sun — the silver lining — instead of the crevices of the face lit from
behind the viewer); the isotropic multiple-scatter term was at a fifth of a white diffuser's level (0.2 → 0.7 of
E · albedo / π at the lit skin, decaying into the mass with the diffusion law), which is what turned every cloud grey;
the bases take the diffusion at 0.35, a base shadow of 0.35, and an ambient of 0.08 × the horizon band + 0.1 × the sky
irradiance (the horizon band alone painted low-sun bases tan). (5) Perf: the fifth light tap is skipped under slabs
over 2 km, the ladder stops at an optical depth of 4, and the empty-space pre-pass tests any segment up to 6 km at
400 m jittered taps before marching (a front's clear radius and the open sky between masses cost a few fetches).
Alpine is mountain cumulus in big masses (towering-cumulus, fieldMix 0.75 through a new `fieldMix` knob) rather than
the smooth lens caps, urban's altostratus thinner (0.45), the fair-weather rows bigger (coverage 0.34, 820 m slabs).

**71c — the integrator's second eye check (monsoon 8 / 10, winter 7.5; alpine and coastal's overhead masses a
brown-grey smoke blob, the streets smeared tubes converging on the horizon, verdant's far field tiny identical
puffs).** (1) The brown base was the lighting, not a tint: the bottom ambient was attenuated by the depth-above term
like the top term (near black under a thick mass), leaving the low sun's warm diffused light as the only base light.
Now the depth above attenuates only the sky's term on the tops; the base term arrives from the lower sky (0.22 × the
sky irradiance's cool hue + 0.08 × the horizon band, undimmed); the diffused sun is taken at least 60 % toward its
luminance on a cumulus too (it has crossed the whole lit mass and mixed with the sky's light); and every cloud takes
a cool floor from the sky mean — a third of it on a cumulus (0.34 × the zenith-hued floor, the thick cores half of
that), the full 1.25 on a sheet, 0.35 × under a cumulonimbus whose base deck the towers shade (its wall stays dark; the
cumulonimbus bottom term also decays with the depth above). The first cut at 0.85 lifted every base to the lit level
and flattened the masses to white (alpine's contrast 1.03); a third gives blue-grey bases under lit tops. A base
chroma metric (the mean sRGB of the base quarter of every dense column run, its warmth (R − B) / luma, its luma over
the lit quarter) now reads every map: alpine's bases 110 / 103 / 98 (warmth +0.12) → 133 / 137 / 146 (−0.10), coastal's
95 / 106 / 91 → 138 / 143 / 138. (2) The streets: the roll (its width now varying along its length) carries a chain of
rounded lumps — fourteen per tile, 860 m apart, jittered in spacing and radius (0.25–0.7 of the pitch), a fifth of them
missing, each row's chain phased — at a depth of 0.85 (the roll between lumps keeps 15 %), and the street share fades
past four kilometres in the trace so the far field reads as scattered cumulus rather than rolls converging on the
horizon. A street now reads as aligned cumulus with soft gaps (the 40 % rule reads it as several structures, as the
integrator allowed). (3) The cumuliform cells are plateaus: a minimum radius (0.45–0.8 of the 600 m lattice: 540–960 m
across), full to 55 % of the radius with a smooth shoulder, neighbouring cells soft-unioned (1 − Π(1 − v)) into
mid-size masses — a coverage threshold admits most of a cell or none, never the tiny cap of a cone. (4) Perf: a
two-tap light ladder inside a front's base deck (a tall slab, the lower third), the far strides on a tall slab up to
2 × past 3–9 km, and one street fetch per weather lookup (the anvil channel rode a second fetch of the same texel).

**71c measured (tip ac0f882b6; the seven maps the fixes changed most re-captured — alpine, coastal, steppe,
frontier, verdant, monsoon, delta — the other twenty-four keep their 71b captures in the sheets; the owner asked every
lane to wrap up, and the probe mutex was held by another lane for the wider re-capture).** Bases: alpine 133 / 137 /
146 sRGB (warmth −0.10, base over lit quarter 1.06 / 0.69) from 110 / 103 / 98 (+0.12), coastal 138 / 143 / 138 (0.00)
from 95 / 106 / 91, verdant 165 / 170 / 180 (−0.09), frontier 157 / 173 / 193 (−0.21), steppe 167 / 171 / 178 (−0.07),
delta 122 / 139 / 157 (−0.26): every cumulus base neutral-to-cool; monsoon's wall 184 / 180 / 171 (+0.07) — lighter
than 71b's 161 / 156 / 144 (its contrast 1.15 / 1.20 against 1.42 / 1.31): the front is still one flat-based mass with
cauliflower tops, but a second darkening of its deck (floor 0.35 → 0.2, the bottom term halved) is committed nowhere —
it could not be verified before the wrap-up and stays open. Streets: steppe 23 / 25 % and frontier 21 / 26 % in the
largest structure (chains of separate aligned lumps by design; 71b's tubes read 29 / 52 and 38 / 89), p50 components
1738 / 623 and 236 / 320 mask pixels. Verdant's tiny puffs: 2 / 7 components under 60 mask pixels (71b: 2 / 14; the
71a carpet 9–18 % of the area in small components → 8 / 6 %), the p50 466 / 206. Contrast on the masses: verdant 2.8 /
2.6, coastal 3.2 / 1.1, delta 2.7 / 2.6, alpine 1.2 / 1.3 (its masses fill the view: little lit top to compare),
steppe / frontier 1.1–1.3 (lit lumps over lightly shaded bases). Sky bands (middle / lower vs the baked base): verdant
−3 / 0 and +2 / +2, delta −2 / 0 and +2 / +2, alpine +4 / 0 and −2 / +1, reservoir −3 / −1 and 0 / +1, urban +1 / +1
and +14 / +6, frontier +3 / +3 and +12 / +4, orchard −4 / −1 and −4 / 0, longleaf −2 / −1 and −2 / −1, airfield +1 / 0
and −1 / 0 — all nine inside ±15 / ±10; monsoon +8 / +2 and +7 / +8. Skylines: winter 0.88 / 0.91, whiteout 0.92 / 0.87,
monsoon 0.54 / 0.55 (base 0.56 / 0.54), alpine 1.03 / 0.91 (base 1.03 / 0.90), verdant 0.74 / 0.72, steppe 0.88 / 0.85,
frontier 0.76 / 0.69. Perf by repetition at load 200–300 (the chain at full tilt; medians of three rounds, GPU):
verdant 0.35 ms, winter 0.88, monsoon 1.21 (rounds 1.05 / 1.54 / 1.21 — at the 1.2 budget line, ± 0.3 of noise),
frontier 0.14, desert 0.14.

**71b measured (the same captures, metrics and sheets re-run on tip dab60d45d; the numbers below supersede the 71a
paragraph that follows, kept for the record).** Structure: the streets now hold one roll per view — frontier 38 / 89 %
of the cloud area in the largest structure, coastal 59 / 65, steppe 29 / 52, saltwind 34 / 45 (a roll fading between
lumps still splits on the wide view; the p90 component is 7–13 k mask pixels against 250–2500 for the 71a beads);
the front is one mass, 79 / 95 %; alpine's mountain cumulus 76 / 67 %; the decks unchanged (winter 94 / 100, whiteout
100 / 100, polders 96 / 92, fjord 88 / 56). Sizes on the fair-weather maps spread two orders (verdant 44 / 551 / 5914
and 18 / 58 / 7442, longleaf 23 / 295 / 3135, airfield 13 / 200 / 5406). Lighting: the p80 / p20 contrast of the dense
pixels 2.7–3.2 on verdant, 2.7 / 3.0 coastal, 2.2 delta, 2.8 autumn sky-s, 2.5 / 3.5 urban; the per-column top / base
ratio 1.0–1.6 on the cumulus views (frontier 1.57, desert 1.58, oasis 1.77, alpine sky-s 1.84, monsoon 1.05 / 0.94 —
its base deck IS the dark wall, so its top-vs-base reads inside one mass rather than across it) — the ≥ 1.6 target is
met on the views that see masses side-on and missed where the camera looks up at bases. Edges: wispy tail 38–77 % on
the cumulus maps (down from 55–70: the sharper threshold), 86–100 % on the sheets. Sky bands (after vs the baked
base, middle / lower): verdant −6 / −1 and +2 / 0, delta −3 / −1 and +2 / 0, alpine −8 / −1 and −2 / −1, reservoir −3 /
−1 and 0 / +1, urban +1 / +1 and +14 / +6 (inside ±15 % now), frontier +1 / −1 and +7 / +3, orchard −4 / −1 and −4 / 0,
longleaf −2 / −1 and −2 / −1, airfield +1 / 0 and −1 / 0; winter +24 / +6 and +27 / +8, whiteout +39 / +40 and +35 /
+11 (white ceilings over snow), monsoon +8 / −5 and +11 / 0. Skylines: winter 0.88 / 0.91, whiteout 0.92 / 0.87, monsoon
0.58 / 0.54 (base 0.56 / 0.54), verdant 0.76 / 0.71, frontier 0.79 / 0.67, delta 0.80 / 0.76, alpine 1.06 / 0.92 (base
1.03 / 0.90), polders 0.88 / 1.03 (its deck over the flat skyline, as in round 68). Eye check of the sheet: steppe and
frontier read as long rolls with lumps riding on them, coastal and saltwind as streets rolling in off the sea, monsoon
as a broad flat-based dark wall with cauliflower tops and an anvil trailing right, alpine as big bulge-on-bulge masses
over the pass, verdant as a few cumulus of different sizes with shaded bases, winter as a lumpy deck with blue breaks.

**Measured.** Captures on the lane tree (`.qa-dev/r71-capture.mjs`, 31 maps × sky-w / sky-s, desktop tier, seed 1337,
`?clouds=volumetric` on both trees; before = tip d4afb619e's round-68 layer, after = this round; base = the baked decks
on the twelve rule maps): the review sheets `$SP/r71/review/contact-sheet.png` (sky-w) and `contact-sheet-sky-s.png`
(31 rows, before | after), the per-map frames `$SP/r71/review/<map>-before.png` / `<map>-after.png`, the numbers in
`$SP/r71/metrics-after.txt` (`.qa-dev/r71-metrics.mjs` on the history masks), `skyline-{before,after,base}.txt`
(`map-metrics` check 5) and `bands-after-vs-base.txt`. **Structure** (connected components of the cloud mask at
α ≥ 0.35, the largest component's share of the cloud area, the size spread p10 / p50 / p90 in mask pixels): the decks
and sheets hold one structure — winter 95 / 100 %, whiteout 100 / 100, railyard 100 / 100, foundry 99 / 100, titan 100
/ 100, fjord 87 / 58, polders 96 / 100, urban 85 / 59, blackglass 61 / 91, alpine 51 / 38 (its lens caps are separate by
nature) — against round 68's carpet of same-sized puffs (verdant before: 20 components, p50 310, largest 61 % from one
bank); the streets connect on one view and read as rows on the other (coastal 48 / 42 %, saltwind 44 / 27, steppe 28 /
47, frontier 29 / 27 — a street is a row of separate cells, so the 40 % rule reads them as rows, which is the intent);
the fair-weather skies spread their sizes an order of magnitude (verdant p10 / p50 / p90 18 / 235 / 1547 and 14 / 612 /
9190, longleaf 13 / 191 / 7679, airfield 13 / 167 / 4123, delta 43 / 805 / 13322), the humilis skies stay peppers of
small cells by design (desert p50 19–29 px, 115–139 components) under their cirrus. **Lighting** (the sunlit top quarter
over the base quarter of each dense column run, and the p80 / p20 contrast of the dense pixels): the metric resolves
only masses over ten mask rows, so on the humilis maps it reads the contrast alone (1.3–1.9); where masses stand the
contrast reaches 2.6–3.5 (verdant 3.0 / 3.2, coastal 2.9, monsoon 2.7, delta 2.7, steppe 2.7, saltwind 2.7, urban 2.6 /
3.5) and the top / base ratio 1.1–1.7 (airfield 1.65, desert 1.63, urban 1.5 / 3.0, fjord 1.5) — short of the 1.6 target
on most cumulus views because a base seen from below at 1400 m is lit by the ground bounce and the horizon band, not
black; the towers lean and shade (monsoon 0.8: their bases read darker than their tops, the ratio inverted by the
scud). **Edges** (the α-gradient histogram on the edge texels): the wispy tail 50–70 % on the cumulus maps, 85–100 % on
the sheets and the humilis wisps, the crisp share ≤ 13 %. **Sky bands** (the round-65 / 68 rule: the nine good maps'
middle band within ±15 % of the baked base, lower within ±10 %): verdant −2 / −5 (lower 0 / 0), delta 0 / +3 (−1 / −5),
alpine +8 / +1 (+2 / +4), reservoir −5 / −1 (−1 / 0), urban 0 / +18 (0 / +8 — the milky altostratus over the city's
sky-s view, the one band outside the rule), frontier 0 / −5 (+2 / −3), orchard +1 / −2 (0 / −2), longleaf +6 / −4 (−1 /
−3), airfield +5 / −2 (0 / −4); the decks lift winter +29 / +28 (lower +9 / +9) and whiteout +59 / +37 (+46 / +12) toward
white, monsoon +7 / −7 (−8 / −20 under its front). **Skylines** (check 5, before → after; base): winter 0.88 / 0.88 →
0.89 / 0.89 (base 0.88 / 0.88, inside the 0.80–0.90 band), whiteout 0.92 / 0.86 → 0.91 / 0.86 (base 1.01 / 0.94; sky-w
still a hundredth over the band, as in round 68), monsoon 0.56 / 0.54 → 0.62 / 0.59 (its towers over the ridge),
verdant 0.75 / 0.70 → 0.75 / 0.72, frontier 0.75 / 0.66 → 0.76 / 0.69, delta 0.79 / 0.73 → 0.81 / 0.78, alpine 0.93 / 0.91
→ 1.04 / 0.91 (a lens cap over the ridge; the base reads 1.03 / 0.90), airfield and railyard unchanged, copper_mesa's
sky-w 0.56 → 1.00 and ruinspires' 0.88 → 1.00 (the round-68 bank over their skylines is gone; the base reads 1.00),
skybridge 0.84 → 0.66 and titan 1.00 → 0.91 (a deck over the mesas). **Eye check of the sheet:** the puffs are gone —
verdant, orchard, longleaf and reservoir carry a few cumulus of different sizes with darker bases over an open sky;
frontier and steppe read as rows along the wind; coastal and saltwind as streets off the sea; delta, mangrove and
monsoon as leaning congestus with anvils on the front; the desert five as dry skies under cirrus veils; winter,
polders, fjord and railyard as decks with breaks; whiteout, titan and foundry as ceilings; alpine as smooth caps;
blackglass as an ash veil; Mars as dark ice wisps on its galaxy. Weak: the towers still read as columns more than
cauliflower (the shape volume's kilometre period stacks along a 1.5–3 km slab), the lens caps are smooth blobs rather
than lenses from below, urban's sky-w view faces a wall (the table view, not the sky), and a fair-weather sky can open
wide on one view (reservoir 7 % cloud on sky-w).

**Performance.** Per-slot trace + resolve by repetition (`.qa-dev/r71-trace-bench.mjs`: the frame's GPU ms with the slot
traced once against eleven times, Δ / 10, 90 frames × 3 rounds at the chase pose). 71b's first bench read 3–6 ms on
the cloudy maps: the weather-gated striding (the stacked-discs fix) had removed the empty-space stride inside every
mass, the second shape octave and the pre-pass added fetches. The levers that brought it back: the stride never falls
under the trace texel's footprint (28 m at 3 km, 83 m at 9 km), a sheet marches at 3.5 × the floor, the light march
runs on every other lit step and not once the ray is nearly opaque (T < 0.15) nor for the scud under a base (a fixed
depth), one depth-above tap, a fixed 1.5 × stride through eroded pockets (re-entering on the fine lattice), the
empty-space pre-pass to 12 km at 450 m jittered taps (none under a closed deck). Final bench at load 53–80 (the chain
quieter; medians of three rounds, GPU): verdant 0.59 ms, winter 0.99, frontier 0.50, desert ≈ 0 (−0.2, noise), monsoon
1.54 (rounds 1.65 / 1.23 / 1.54 — the one slot still over the 1.2 ms budget by a third: a 3 km slab of dense masses;
the next lever is a coarser light ladder inside the anvil level). CPU per slot within ±0.5 ms of zero (noise). The
same bench at load 110–160 read verdant 0.26, winter 1.11, frontier 0.85, desert 0.33, monsoon 2.24, so the numbers
move by ±40 % with the machine and are upper bounds at load. The composite, the far band and the cirrus sheet add no
pass; the six bakes run in the worker under the loading cover.

**Receipts (exit 0, tip ac0f882b6).** volumetricClouds (rewritten: six bake digests — the street bake re-pinned in 71b — tiling on both axes, the equalised
fields, the street and cirrus anisotropy, the synoptic clustering of the cumuliform field, the blue-noise ranks, the 31-map cloudscape table, the
eighteen regime rows, the monsoon / whiteout / winter / coastal / delta / alpine identities, the shadow and override
policies, the slot cycle, the far ramp, the stride scale, the haze mirror, the hooks and the gobo material), atmosphere,
skyCloudBake (the baked decks' bytes unchanged), skyHorizonCache, skyEnvironmentCache (configureSkyUniforms hash
unchanged), garageSkyPresets (the sky blocks byte-identical to the Garage's copies), mapCatalog, battleAtmosphereRuntime,
battleAtmosphereAccess, badlandsRelief / playableRelief / redrockMaterial (the clouds block projected out of the byte
and config comparisons by `round71Clouds.test-support.mjs`), environmentSurfaceColor, mapQuality, environmentExpansion,
worldActivationRuntime, postFrameAccounting, temporalAA, sunShafts, contactShadows, aerialDetail, deviceEnvRadiance,
lateFxColorHandoff, lateFxSceneView, postViewportScale, sceneSourcePass, frameLoopScheduler, shadowPrime,
shadowGeometryClaims, csmShaderRelease, shadowRefresh, nearVehicleShadowDetail, shadowStability, renderLayers,
adaptiveQualityPolicy, quality, wallSkyLight, sourcedTerrainPreparation, terrainMaterialOwnership, horizonResources,
worldBuildCoordinator, daynight-atmosphere-probe, postLightFxPolicy; `npm run typecheck` (the native tsc and the
core unused-symbol check).

**Open (after 71c).** Monsoon's wall a step lighter than the 8 / 10 version (the second darkening of its base deck is
unverified and not committed); the twenty-four maps not re-captured in 71c carry 71b captures in the sheets (the same
code path lights them — a full re-capture is the first thing for the next pass); monsoon's slot at the 1.2 ms line
(1.05–1.54 by round at load 200–300); the top / base ratio still under 1.6 where the camera looks up at bases; the
cauliflower reads at the outline only; whiteout's sky-w skyline 0.92 at the band's edge (round 44's re-grade call
stands) and polders' sky-s 1.03 under its authored deck; the `?clouds=volumetric` default stays with the owner — the
sheets are the review; the round-68 open items not closed here (the inside-the-slab camera, the cascade policy for the
gobos, a moonlit edge at night).

### Round 70 — 2026-09-25: Whiteout's snow re-grade (owner: yes)

**Owner ruling (2026-09-25).** Yes to round 44's proposal for Whiteout: the snowpack tone law and the exposure, tuned so
the sky-w / sky-s skyline ratios sit inside 0.80–0.90, the battlefield snow still white by eye, the arctic identity (a
cold, neutral-white overcast, no warm cast) kept, the Garage untouched.

**Finding first: the round-48 law never reached the snow that renders.** `applySourcedTerrain` reads the splat config for
its palette id and `mudRough` alone, so the `grassTone` law (winter's 0.62 + 0.38·l → 0.52 + 0.32·l of round 48) grades
the procedural fallback layer, which the sourced Snow010A composite replaces as soon as it loads — the photo snow rendered
untinted on both winter maps (the desert palette's own comment says the same of its sand). Frosthollow's round-48 skyline
moved on its exposure step and its redesigned rim, not on the tone law. The re-grade is therefore authored where it
renders: a new splat field `sourcedTint` (`terrain.ts` SplatConfig, `sourcedTextures.ts` SourcedTerrainSettings) multiplies
the plan entry's albedo tint per layer on both sourced paths (the synchronous swap and the prepared / worker path), so a
map inheriting a palette (Whiteout ← winter) grades a composite of its own while the source images and the surface pack
stay shared and winter's composite is untouched. `whiteout.ts` authors `sourcedTint: { G: [0.88, 0.885, 0.895] }`
(neutral-cold, −12 % on the sRGB bytes ≈ −25 % linear), steps the fallback law by the same factor (L 0.52 + 0.32·l →
0.46 + 0.28·l, so the pre-swap frame matches) and takes `postExposure` 0.86 → 0.83 in its own sky block; winter.ts is
untouched and the Garage carries no Whiteout preset (`garageSkyPresets` and its receipt unchanged).

**Measured (`tools/map-view-probe.mjs`, views sky-w, sky-s, centre-far, bird-w, e-wall-300; `map-metrics skyline`; A =
origin/main 80450ad53 with round 68's overcast, B = this branch).** sky-w 0.92 → 0.84, sky-s 0.88 → 0.85, centre-far
0.94 → 0.92, bird-w 0.98 → 0.97, e-wall-300 0.83 → 0.78 — both skyline views inside the 0.80–0.90 band with ±0.04 to
spare; the metric's own edge bands (sky / ground display luma) sky-w 184.3 / 169.2 → 178.6 / 148.8, sky-s 193.0 / 173.4
→ 188.3 / 165.5. Trials on the same base: tint 0.86 / exposure 0.80 → 0.82 / 0.85, tint 0.86 / exposure 0.86 → 0.84 /
0.86, the landed tint 0.88 / exposure 0.83 → 0.84 / 0.85 — the exposure half is worth ~0.02 on the ratio (it lowers sky
and ground alike), the tint carries the move. On the physical sky alone (1179f1013, before the overcast landed) the
same re-grade read sky-w 1.01 → 0.96, sky-s 0.95 → 0.91 (edge bands 165.9 / 162.1 → 163.6 / 153.7 and 191.5 / 180.8 →
185.9 / 170.1; the 0.86 / 0.80 trial 0.93 / 0.93): at the sky-w / sky-s edge the ground band is haze-dominated — a −28 %
linear albedo step moved it ~5 % net of exposure, an albedo share of ≈ 0.19 of the band's display radiance — and reaching
0.86 there by tint alone needs ≈ 0.68, grey snow. The other half of round 44's proposal, a sky that is the brightest
surface, is round 68's overcast; the two together make the skyline. Snow still white: `map-metrics boxes` bird-w ground
mean 175.3 → 161.6 (p5 134.7 → 122.7), the near wall box rgb 183/177/170 → 175/170/163 at the same 35° hue and 0.07
saturation (nothing warmed), sky-w ground band 162.1 → 145.4 under a sky band 182.7 → 176.8. Captures and metrics under
the shared probe mutex, one run at a time.

**Eye check (1280 px reductions, five views, A/B on main with round 68's overcast and on the pre-cloud tree).** sky-w:
the west snow plain and the berm read a shade cooler and greyer and sit a clear step below the bright neutral ceiling
(on the physical sky alone the skyline stays faint). sky-s: the station's snow around the halls now sits
below the sun glow instead of level with it. centre-far: the snow field darkens a little, the far ring still meets the sky
(a ring item, as rounds 48 and 49 said). bird-w: the field reads pale grey-white instead of paper white and the wind-scour
grain is more legible; the warm horizon haze at that 380 m pose is the round-65 atmosphere, unchanged. e-wall-300: the
hillside snow reads cooler with its rock showing through slightly more; firs, rocks, tanks and HUD unchanged; no warm cast
anywhere.

**Receipts (exit 0).** sourcedTextures (Whiteout composes its own graded snow: the winter composite × the map tint, byte
by byte, shared dimensions, winter's bytes in place), sourcedTerrainPreparation (apply / prepare parity under a map tint),
terrainStreaming, frontlineAtmosphere, mapIntegration, shoreDirtMask, trackSurface, iceSurfaceDetail, winterLakeGeometry,
environmentExpansion, studioEntry, ambientPolicy, ambientPcm, lazyAudio, mapCaptureReadiness, battleAtmosphereRuntime,
sunShafts, studio-example-scenarios, garageSkyPresets (untouched), terrainMaterialOwnership (untouched: no shader change,
program key and fetch census as before), map-metrics, map-art-guards, terrainProjection, shotDiagramProjection,
villageWear and mangroveWaterPalette (every-map config digests re-pinned, dated), badlandsRelief (the byte receipt:
the round-47 presentation pin of whiteout.ts extended to the new sky-line tail and a round-70 projection,
`round70SnowRegrade.test-support.mjs`, for the splat block and the file-local clamp01 — the historical text unchanged, no
digest moved), public-repo-hygiene, attribution, typecheck.

**Open.** The far ring still meets the sky in centre-far (0.92; a vista item, rounds 48 / 49) and bird-w's warm horizon
haze at the 380 m pose is round 65's atmosphere, untouched. The snow's albedo share at the rim (≈ 0.19) is the fog /
aerial pass's, not a tone item. Round 68's open note on Whiteout's 0.92 is closed above.

### Round 74 — 2026-09-25: impact physics — speed-based damage, falls and rebounds

**Owner (2026-09-25).** "Add more speed based damage — running into something hard super fast like a rock or
building or other tank, fall damage, etc. — and also make bouncing properly work in the lower gravity modes, and
make the physics more proper on regular modes."

**The model (`sim/impact.ts`, one function for the solo step and the authority).** Every law is energy based: the
hull's kinetic energy above a threshold speed, ½ · m · (v − v_min)² in kilojoules, becomes hit points through the
mode's hp-per-kJ rate, so a heavier hull takes more from the same speed and the onset is smooth. A crash prices the
closing speed the tracks lost against a hard surface (the map edge, a solid primitive, a terrain wall — a push by
another hull is the ram resolution's, a crushable prop is crushed); the face that struck weighs it (glacis 0.7,
stern 0.85, broadside 1); modules follow the shape of the crash — the near track 80 % of the hull damage and the far
30 % (both 60 % head-on), the engine 35 % on a frontal crash — and above 16 m/s one draw (40 %) may knock the driver
out. A landing prices the vertical closing speed the swept ride contact recorded, ×1.6 nose-first, ×1.3 tilted, ×1.5
on the roof; both tracks take half the hull damage and the engine 15 %; crew shock above 14 m/s. A crash the
movement spreads over two ticks (the partial first slice, then the rest) is priced once, on its accumulated closing
speed; a tick that loses under 0.5 m/s is the drive pressing, not a blow. Rams keep `damage.ts ramDamage`'s pool,
now split by mass, by how much of the closing speed each hull brought (a 35 % discount at full aggression — a
deliberate ram on a parked hull reproduces the classic numbers, a head-on meeting discounts both a little) and by
the face each took it on; every horizontal contact exchanges momentum (`exchangeRamMomentum`: both leave at the
centre-of-mass velocity ± the mode's ram restitution × closing, split by mass — the pushed hull moves, the rammer
keeps its share, the T-boned hull slides on the recoil translation; momentum conserved, energy never grows). Every
number a mode bends is the ruleset's `physics` block (`matchRuleset.ts`): Standard restitution 15 % / rebound floor
1.2 m/s / falls from 6 m/s at 0.25 hp/kJ / crashes from 4 m/s at 0.16 hp/kJ; Turbo Ball 45 % / 1.5 / 15 (a single
13 m/s jump lands free) / 0.12 / 9 / 0.05; Mars 50 % / 1.2 / 10.5 (a single 9.5 m/s rocket jump lands free) / 0.16
/ 5 / 0.12. The 60 t table under Standard: a wall at 22 km/h 19 hp, 36 km/h 173 hp (121 on the glacis, the near
track yellow), 60 km/h 774 hp; a 5 m drop 120 hp, 11.5 m 607 hp, 20 m 1470 hp. The cards say `landings rebound
45 %` / `fall damage above 15 m/s`; the kill feed says CRASHED / FELL, the report's final-blow line "{target} crashed
into something hard" / "fell too hard", the wire `tank_impact` and `tank_destroyed` cause `impact` / `fall`, both
catalogs.

**The movement (`sim/movement.ts`).** The airborne ride's contact with the droop line is swept inside the step (the
crossing fraction gives the true closing speed and the remainder of the step integrates after the contact), so a
40 m/s fall never ends a step under the terrain or a structure top and the rebound is the same at 60 or 120 steps/s;
the closing speed comes back at the mode's restitution, a rebound under the floor settles onto the suspension; the
landing torque turns the hull toward the ground plane it struck, so a nose-first landing pitches even while it
rebounds. A face steeper than the tracks hold (≈ 42° on medium ground, under the 52° cliff grade) is a slide: no
drive, no brake, `g·sin θ` against `μ·g·cos θ`, the reverse-gear cap lifted to the top-speed cap, `slopeBlocked`
for the bots. The yaw rate at speed is bounded by lateral grip (`v·ω ≤ 7 m/s² × g-scale × hard/resistance`, never
under 30 % of the standing rate — unchanged below ~30 km/h on hard ground, a 46 m circle at 60 km/h, wider on soft
ground and under low gravity). A stopped hull with no throttle holds its grade when the holding decel matches the
pull. The terrain fit's two-point settle is measured against the pure least-squares pitch and applied at half its
clamp: on the base tree a "parked" hull on a 15° grade crept down it at 4.2 cm/s and chattered ±0.4° of pitch and
5 mm of height at ~1 Hz for good (the settle read its own previous correction as a residual and corrected the other
way); now it stands to 1e-16. `_terr.fitPitch` is sim state, so both movement checkpoints go to version 2 (45
values).

**Receipts (exit 0).** `impact.selftest` (the blocks, the table, zones, modules, crew shock with a stable RNG order,
the fall curve, the ram split, the exchange), `impactPhysics.selftest` (Mars 9.5 → landings 9.4 / 4.6 / 2.3 m/s then
settle, Turbo rebounds, 1 g barely hops, no tunnelling at 40 m/s onto terrain / a roof / into a wall / a cliff, the
48° slide at gravity minus friction while 30° climbs, the 15° hold exact, the brake holds 30°, the 60 km/h yaw rate
is the cap, wreck momentum, the nose-first torque, step-size independence), `impactParity.selftest` (both sims
share the functions and attribution, the mode stamp, an authoritative 100 m run into a wall — 648 hp at 17.2 m/s
on the glacis, both tracks and the engine, nothing more for holding the drive against it — a 12 m drop's fall event,
a wreck landing free, a bit-for-bit 600-step replay); movement (218), rollover, tankBodyContacts, structureSupport,
combat (541), authoritativeMatch, matchRuleset (the Turbo card gains `bounce` / `fallDamage`), matchModes, i18n,
finalBlow, endScreen, specialActions, killcamPresentation, ai, authoritativeBotControls, authoritativeBots (mobile
6/6 on reservoir and mars, worst stuck 2 s), the mp match / wire / presentation receipts, movementCheckpoint and
movementPredictionState (version 2), remoteMotion (the cadence band follows the model's own steady rate),
movementDisplayCadence (the unreconciled wave drift fell 0.087 → 0.026 m at 120 Hz and 0.129 → 0.009 m on the
variable cadence — the old settle chatter was itself step-size dependent — while the reconciled residuals moved
±20 % in the millimetre range; three ratio / bound pins re-anchored with the reasons recorded), server/match
(matchActor reads the shared version), typecheck, core-unused-check, unused-exports.

**Prove in play (`.qa-dev/physics/battle-probe.mjs`, the authority on the dedicated shard, 14 hulls, idle host).**
Verdant / Standard, 5 min: 37 crash events (23 damaging, 631 hp in all, worst 101 hp at 11.6 m/s, mean damaging
27 hp), 16 landings (3 damaging, worst 69 hp at 8.4 m/s), no ram, 6 killed by shot, no hull stuck for 5 s, none
under the terrain, no slope block, no crew or module break. Mars / mars ruleset, 3.8 min to a score verdict: 163
landings (34 damaging, 2413 hp, worst 289 hp at 17 m/s, one hull killed by a fall), 28 crashes (19 damaging,
1035 hp, worst 367 hp at 17.9 m/s), one ram (563 hp at 10.4 m/s), 9 crew shocked, 4 modules broken, a hull chaining
up to 18 hops over the ridges, 432 slope-blocked ticks, no stuck, none under the terrain; the 30 m drop lands at
14.9 m/s and rebounds at exactly half to a 7.6 m apex. Verdant / Turbo Ball, 3 min: 170 landings (5 damaging, 217 hp, worst 177 hp at a 22 m/s landing — the 15 m/s threshold keeps the arcade jumps free), 38 crashes (11 damaging, 125 hp, worst 50 hp at 20.5 m/s), 6 rams (1166 hp), no crew or module break (the mode's critical-damage switch holds for impacts), 14-hop chains, none stuck or tunnelled. `server/battlePacing` full 124 under the new physics: median 335.2 s, p10 260.8 s, no sub-two-minute battle, 0 timeouts / 124 (every band held; the bots' pushes, slides and landings never strand a hull).

**Open.** No HUD damage number for a crash or a landing (the HP bar and the impact sound carry it; the kill feed
and the report name a fatal one) — the ram has none either. Roof landings on another hull keep
`tankBodyContacts`' fixed 7 % restitution rather than the mode's. Bots do not use the rocket jump, so Mars
landings in play come from ridges, not boosts. `src/net/networkBattleLaunchRuntime.selftest` and
`src/game/battleEndingHold.selftest` fail on the round-95 base tree before this lane (the Jev `stop()` line inside
the ending-hold pattern) — not touched here.

### Round 72 — 2026-09-25: mountains and horizons to the clouds' level

**Owner (2026-09-25, looking at Whiteout under the round-71 clouds):** "wow our clouds look amazing. we need skyboxes,
mountains and horizons and maps that look just as good as those... look at this whiteout map — the mountains look so
flat and untextured and boring, while the clouds look so good. lets lock in! and also make sure performance is still
really good."

**Why Whiteout read as flat.** Its ring was the rolling style at amplitude 0.72 — soft billows 138 m tall at 1.3 km,
subtending six degrees under a 300 m stratus — with no relief the mesh could carry (the interpolated rows' ridged term
was bounded at 7–11 m on 60–250 m spans), a screen-derivative bump from twelve-metre noise as its only shading
structure, an ambient term that was a constant, no occlusion, no cast shadows, and nothing behind the outer shoulder
but sky. Every map shared the shape of that problem: the ranges were painted, never modelled.

**The relief field (`src/world/horizonRelief.ts`).** A ridged multifractal over a warped world plane (after Musgrave:
each octave's ridge is weighted by the one below it, so crests sharpen where the coarse ridge already stands and the
valleys between stay smooth; two low-frequency noises bend the plane so ridgelines wander instead of running straight),
normalised to its amplitude (the raw multifractal sum has a mean near 0.4 and a spread of a few hundredths — the first
cut's "34 m" put ±6 m on the crests; the field is centred and its RMS set to half the amplitude over three warp tiles,
so the peaks reach about the amplitude), with an erosion vocabulary: gullies as ridged noise elongated downslope
(radial on the ring; the across-slope coordinate runs around a circle in noise space so the pattern closes on itself),
a talus apron where the macro relief is concave (the fine relief settles into a smooth fan), rounded shoulders low on a
face and sharper crests high on it. The field is split by wavelength: three octaves from 300 m down displace the
AUTHORED rows — every range gains peaks, spurs and saddles that vary with the radius too, the first ridge at 60 % so
the seated foothill keeps its hillside grade, the skirt rows untouched — and take the 260 m term's place in the
interpolated rows (the 90 m and 30 m knobs stay); a fine band of three octaves from 75 m down (the row ladder cannot
carry the 75 m octave, the bake can), run in the ring's own (arc, radius) frame and stretched downslope by the
character's elongation (a face's spurs and chutes run down it, a mesa's ledges along it), goes into the bake. On the
alpine ladder the step clamp that made the domes (about 18° along the row at 15 m of arc) opens by the character's
crest sharpness (polar 2.2 x, alpine 2.7 x: faces to 37–45°) and the blur drops to three passes; the silhouette sampler
the needle receipt reads keeps the classic values. The ranges behind the first ridge stand taller by the character's
boost (half on the second range, full beyond, scaled by the map's amplitude): the first ridge is the terrain-material
foothill the seam laws seat (rows to 700 m), and at the old proportions it walled off the vista's ranges — Whiteout's
grey dome was that foothill, rendered by the battlefield's own material. Eight CHARACTERS carry the vocabulary of each
mountain country — polar (Whiteout, Frosthollow: long warped ridgelines, wind-scoured crests over talus skirts, deep
radial gullies), alpine (Glacier Pass, Nordhavn, Orchard, Reservoir: sharp multifractal crests, chutes), rolling (the
wooded hills: billows with spurs, shallow drainage), mesa (the tablelands: flat caps, ledged cliffs, dry washes),
volcanic (Caldera, Blackglass: smooth cones cut by radial barrancos), coastal (Saltmere, Saltwind, Polders: rounded
uplands, cliffed fronts), martian (Olympus Basin: very long wavelengths, lobate flows), karst (Monsoon, Mangrove: steep
towers) — resolved from the map identity, then the style, overridable by `horizon.relief`; each also tunes the style's
rock law (a polar range keeps its summits under snow with the scoured ribs alone baring rock, volcanic cones and karst
walls are barer). Redrock's outland stays the analytic canyon (its rows are overwritten) and keeps its bytes; Polders
stays under its 40 m ceiling (the relief scales with the map amplitude, 0.18 there); the ledger's own laws hold with the
relief on (the crag is capped on spans already past 1.5:1, and the crag a cap re-spacing keeps is bounded by a tenth of
the new chord).

**The surface bake.** An (angle x radius) RGBA8 atlas of 2048 x 256 texels over the annulus (410–1560 m: about 3 m of
arc at 1 km and 4.5 m radially), built once per map at world activation in slices like the terrain build: R/G the fine
relief's world-xz gradient (the detail normal), B a horizon-based ambient occlusion of the whole height field (eight
grid-aligned directions, six steps to 160 m, on a half grid), A the sun's visibility across the ranges at the map's
fixed sun (fourteen steps to 560 m toward the sun — the ridges' own cast shadows, which under Whiteout's 13° sun cover
half the ring). The macro height at any texel is the ring's own rows interpolated (per column the rows are monotone in
radius); the warp and the coarse octaves run on a half grid and are interpolated to each texel, so the field costs four
noise samples a texel. The vista program reads the atlas by the ring's own u (the angle, ten repeats across the seam
column) and the fragment's radius — no new vertex attribute — and combines the gradient with the geometric slope in
the height-field frame (both are world-xz gradients, so the sum is exact): the material's slope is the RELIEVED slope,
so rock breaks through on the fine faces, the metre-scale bump rides on the relieved normal, the ambient carries the
occlusion, the sun carries the visibility. The ambient, sun and cast-shadow gains follow the map's own lighting (the
sky preset's hemisphere plus the engine's bounce floor, its sun, compressed; the baked shadows fade under a closed deck):
the vista's constants were the sunny default's, and Whiteout's ring — lit by a 0.73 hemisphere under a 13° sun — read
grey beside its white fields. A face turned from the sun takes the sky's own chroma (the fog tint normalised to unit
luminance and pushed a little, hue only — a saturated blue fog washed the ranges pale at the first cut): blue-grey under
a clear sky, warm grey under an overcast; sun glitter on the snowfields is a sparse world-anchored hash (a 3 m facet,
one in sixty) lit in the sun's mirror direction, gone by 1.5 km. Mobile keeps today's ring (no bake, no atlas, no far
range). A QA channel (`uVDebug`, set from the capture tool) paints the atlas's gradient, occlusion, sun visibility,
the relieved normal, the cloud shade or the material weights.

**Cloud shadows on the ranges (`src/world/horizonCloudShade.ts`).** The volumetric layer casts its shadows through the
cascades' gobo planes, which discard by the weather field; the ring stands beyond the cascades and took none. Each
frame the ring's onBeforeRender points its cloud-shade uniforms at the layer's live gobo fields (by reference — the
wind reaches the ring with no copies beyond four numbers), the fragment projects itself up the sun's ray to the cloud
base, reads the same weather and street fields on the layer's 12 km tile and darkens the sun term where the field
stands over the shadow threshold, softened over ±0.05 (a hard discard at three kilometres reads as a stencil). Off
whenever the layer is off, has no shadow regime, has no cascades attached or does not expose its gobo uniforms (the
cloud lane owns that module; the binding is defensive).

**The far range (`src/world/horizonFarRange.ts`).** Beyond the outer shoulder (1.24–1.38 km) there was sky. A second
annulus of ranges now stands 1.86–3.32 km out — inside the cloud domes (3.4 km) and the camera's far plane (4 km), so
the clouds still pass behind the peaks and the peaks behind the ring's crests — 288 columns on six rows, the crest row
at 2.82 km, broad massifs with ridged crests from the character's own far table, coming and going around the horizon
(a slow envelope between a floor and the full height) so some sectors open onto a distant plain, warped in plan and
smoothed along the row (no one-column needles at three kilometres). One unlit vertex-shaded draw: albedo by altitude
and slope (forest low where the map has a treeline, rock on the steep faces and crests, snow above the far snowline),
the vista program's own sky and Lambert sun, then its own aerial perspective toward the fog tint by row (0.56–0.84);
the scene fog is OFF on it (at three kilometres the exponential fog would erase it) and the post aerial pass adds its
ceiling on top; the night runtime dims it with the ring. A map with a low cloud deck keeps its far peaks under the deck
(82 % of the base, never under 120 m): Whiteout's 300 m stratus allows 246 m, so its far peaks show only through the
passes; a sea sector lowers the far ring to the water.

**Whiteout.** The polar character on the alpine ladder (36 rows, seven authored ranges) at amplitude 1.30 — peaks to
241 m, wind-scoured crests (`bareRock`), snow above 30 % with rock on the steep faces, spruce and birch stands on the
lower slopes (treeline 0.22, the rim mix's own species) — under the low stratus.

**Per-map characters** (the character, the ring style and amplitude, the coarse / fine relief the character carries, the
lower of the map's two cloud decks and the far peaks that fit under it):

| Map | Character | Style / amp | Coarse / fine relief (m) | Deck (m) | Far peaks (m) |
|---|---|---|---|---|---|
| Verdant Fields (`verdant`) | rolling | rolling / 1 | 22 / 7 | 1400 | 360 |
| Sirocco Wadi (`desert`) | mesa | mesa / 1.15 | 9 / 9 | 900 | 470 |
| Frosthollow (`winter`) | polar | alpine / 1.04 | 34 / 11 | 320 | 262 |
| Steinburg (`urban`) | rolling | escarpment / 0.85 | 22 / 7 | 2800 | 360 |
| Saltmere Bay (`coastal`) | coastal | rolling / 0.75 | 20 / 7 | 1400 | 300 |
| Amberford (`autumn`) | rolling | rolling / 1 | 22 / 7 | 1400 | 360 |
| Tarkhan Steppe (`steppe`) | rolling | rolling / 0.65 | 22 / 7 | 1400 | 360 |
| Cinder Junction (`railyard`) | rolling | escarpment / 0.8 | 22 / 7 | 300 | 246 |
| Frontier Basin (`frontier`) | rolling | rolling / 1.18 | 22 / 7 | 1400 | 360 |
| Nordhavn Fjord (`fjord`) | alpine | alpine / 1.34 | 38 / 13 | 1400 | 820 |
| Jade River Delta (`delta`) | rolling | rolling / 0.9 | 22 / 7 | 1400 | 360 |
| Redrock Divide (`badlands`) | mesa | mesa / 1.36 | 9 / 9 | 1400 | 470 |
| Monsoon Ridge (`monsoon`) | karst | alpine / 1.08 | 30 / 9 | 1400 | 520 |
| Glacier Pass (`alpine`) | alpine | alpine / 1.42 | 38 / 13 | 1900 | 820 |
| Obsidian Caldera (`caldera`) | volcanic | mesa / 1.52 | 18 / 8 | 360 | 295 |
| Ironworks (`foundry`) | rolling | rolling / 0.72 | 22 / 7 | 1400 | 360 |
| Ruinspires (`ruinspires`) | rolling | escarpment / 0.92 | 22 / 7 | 360 | 295 |
| Blackglass District (`blackglass`) | volcanic | escarpment / 1.05 | 18 / 8 | 330 | 271 |
| Titan Gorge (`titan_gorge`) | mesa | mesa / 2.15 | 9 / 9 | 860 | 470 |
| Skybridge Chasm (`skybridge`) | mesa | mesa / 2 | 9 / 9 | 380 | 312 |
| Tidegate Polders (`polders`) | coastal | rolling / 0.18 | 20 / 7 | 420 | 300 |
| Copper Mesa Mine (`copper_mesa`) | mesa | mesa / 1.5 | 9 / 9 | 880 | 470 |
| Kestrel Airfield (`airfield`) | rolling | rolling / 0.65 | 22 / 7 | 1400 | 360 |
| Sunscar Oasis (`oasis`) | rolling | rolling / 0.9 | 22 / 7 | 820 | 360 |
| Whiteout Station (`whiteout`) | polar | alpine / 1.3 | 34 / 11 | 300 | 246 |
| Orchard Valley (`orchard`) | alpine | alpine / 1.05 | 38 / 13 | 1400 | 820 |
| Longleaf Crossing (`longleaf`) | rolling | rolling / 1 | 22 / 7 | 1400 | 360 |
| Mangrove Reach (`mangrove`) | karst | rolling / 0.46 | 30 / 9 | 1400 | 520 |
| Saltwind Narrows (`saltwind`) | coastal | rolling / 0.9 | 20 / 7 | 1400 | 300 |
| Highland Reservoir (`reservoir`) | alpine | alpine / 1.25 | 38 / 13 | 1400 | 820 |
| Olympus Basin (`mars`) | martian | mesa / 1.2 | 16 / 6 | 700 | 574 |

**Measured.** Fixed captures on the sky-w, sky-s and centre-far views of every map at seed 1337 (`.qa-dev/r72-capture.mjs`,
the volumetric cloudscape on), before (the round-71 tip, tag `base`) and after (this lane's tip), with the ring's own
screen mask from a magenta-material pass (a differential on the magenta axis, so a hazed far row still counts and a
moving cloud edge does not) — the full ring for the OUTER skyline (the far range included) and the ring without its far
range for the NEAR skyline. Metrics (`.qa-dev/r72-metrics.mjs`, `r72-compare.mjs`): the ridgeline contrast (the mean
luma step across the mask's top edge) and its crisp share (steps over 24), the surface detail energy (the standard
deviation of the luma high-pass inside the mask — the flat Whiteout ring was the baseline to beat), the lit / shadowed
ratio (p85 / p15 of the mask's luma), the snow share, the mask's cover and mean height, and the round-44 skyline ratio.
Summary over the 93 views: outer ridge contrast: median before 35.8 → after 9.2, median ratio 0.27x, up on 3 of 93 views outer crisp share: median before 83.9 → after 7.3, median ratio 0.13x, up on 4 of 93 views near ridge contrast: median before 35.8 → after 7.2, median ratio 0.23x, up on 1 of 93 views near crisp share: median before 83.9 → after 5.9, median ratio 0.11x, up on 5 of 93 views detail energy: median before 11.6 → after 13.0, median ratio 1.12x, up on 63 of 93 views lit / shadow: median before 1.4 → after 1.4, median ratio 1.09x, up on 68 of 92 views ring height px: median before 55.2 → after 71.7, median ratio 1.28x, up on 82 of 93 views

The per-map table (before → after; the outer skyline softens by design where a hazed far range now stands behind the
ring's crests, the near skyline is the ring's own edge): 

| Map | View | Cover % | Height px | Outer ridge | Outer crisp % | Near ridge | Near crisp % | Detail | Lit / shadow | Snow % | Skyline |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Verdant Fields | sky-w | 5.8 → 7.2 | 44 → 55 | 40.7 → 10.2 | 95 → 13 | 40.7 → 10.5 | 95 → 13 | 12.5 → 16.4 | 1.24 → 1.41 | 13 → 61 | 0.74 → 0.72 |
| Verdant Fields | sky-s | 5.2 → 6.0 | 60 → 63 | 42.3 → 21.7 | 89 → 35 | 42.3 → 21.2 | 89 → 32 | 12.8 → 20.7 | 1.39 → 1.67 | 7 → 36 | 0.71 → 0.77 |
| Verdant Fields | centre-far | 9.7 → 11.0 | 68 → 77 | 33.1 → 8.9 | 84 → 13 | 33.1 → 7.1 | 84 → 6 | 9.7 → 12.1 | 1.26 → 1.37 | 14 → 34 | 0.96 → 0.97 |
| Sirocco Wadi | sky-w | 10.2 → 10.2 | 115 → 115 | 34.9 → 5.8 | 95 → 0 | 34.9 → 5.8 | 95 → 0 | 4.6 → 5.8 | 1.06 → 1.24 | 3 → 13 | 1.27 → 1.13 |
| Sirocco Wadi | sky-s | 7.0 → 6.9 | 94 → 103 | 18.8 → 8.0 | 14 → 3 | 18.8 → 8.0 | 14 → 3 | 14.6 → 13.5 | 1.10 → 1.16 | 64 → 40 | 0.99 → 0.99 |
| Sirocco Wadi | centre-far | 14.3 → 14.3 | 100 → 100 | 27.2 → 6.0 | 65 → 3 | 27.2 → 6.0 | 65 → 3 | 8.3 → 8.6 | 1.09 → 1.21 | 61 → 31 | 1.01 → 1.01 |
| Frosthollow | sky-w | 9.3 → 16.1 | 65 → 113 | 10.6 → 10.2 | 3 → 5 | 10.6 → 10.2 | 3 → 5 | 10.9 → 7.8 | 1.18 → 1.06 | 93 → 98 | 0.88 → 0.90 |
| Frosthollow | sky-s | 7.9 → 14.1 | 57 → 100 | 16.2 → 5.8 | 21 → 5 | 16.2 → 5.7 | 21 → 4 | 18.4 → 13.5 | 1.29 → 1.10 | 86 → 92 | 0.88 → 0.92 |
| Frosthollow | centre-far | 12.7 → 19.4 | 89 → 136 | 8.5 → 2.2 | 1 → 0 | 8.5 → 2.2 | 1 → 0 | 10.0 → 7.6 | 1.43 → 1.35 | 74 → 81 | 1.10 → 1.06 |
| Steinburg | sky-w | 0.0 → 0.0 | 0 → 0 | 0.0 → 0.0 | 0 → 0 | 0.0 → 0.0 | 0 → 0 | 0.0 → 0.0 | - | - | 0.91 → 0.91 |
| Steinburg | sky-s | 0.5 → 0.8 | 15 → 23 | 58.2 → 24.3 | 88 → 49 | 58.2 → 29.3 | 88 → 43 | 22.2 → 22.9 | 1.69 → 2.15 | 30 → 55 | 0.21 → 0.20 |
| Steinburg | centre-far | 6.5 → 10.3 | 46 → 72 | 35.4 → 23.0 | 98 → 67 | 35.4 → 5.3 | 98 → 4 | 11.2 → 11.1 | 1.26 → 1.25 | 49 → 76 | 1.12 → 1.12 |
| Saltmere Bay | sky-w | 1.8 → 4.3 | 19 → 34 | 40.3 → 42.9 | 61 → 67 | 40.3 → 41.6 | 61 → 63 | 17.5 → 21.6 | 2.28 → 2.60 | 6 → 4 | 0.91 → 0.81 |
| Saltmere Bay | sky-s | 1.0 → 1.0 | 17 → 15 | 35.4 → 46.9 | 52 → 63 | 35.4 → 34.3 | 52 → 55 | 23.3 → 26.5 | 3.64 → 2.55 | 35 → 47 | 0.54 → 0.62 |
| Saltmere Bay | centre-far | 4.5 → 6.5 | 31 → 45 | 39.6 → 17.8 | 84 → 9 | 39.6 → 20.2 | 84 → 23 | 13.4 → 15.1 | 1.27 → 1.37 | 73 → 81 | 0.82 → 0.85 |
| Amberford | sky-w | 6.9 → 8.9 | 51 → 62 | 28.1 → 5.5 | 56 → 6 | 28.1 → 5.7 | 56 → 6 | 13.8 → 14.7 | 1.18 → 1.28 | 75 → 77 | 0.88 → 0.79 |
| Amberford | sky-s | 9.4 → 11.8 | 65 → 78 | 32.6 → 13.5 | 59 → 16 | 32.6 → 12.6 | 59 → 12 | 16.9 → 18.9 | 1.51 → 1.83 | 45 → 52 | 0.72 → 0.63 |
| Amberford | centre-far | 9.8 → 11.1 | 69 → 78 | 25.0 → 5.2 | 39 → 4 | 25.0 → 5.2 | 39 → 4 | 12.4 → 14.2 | 1.25 → 1.38 | 71 → 72 | 0.86 → 0.85 |
| Tarkhan Steppe | sky-w | 4.7 → 5.2 | 33 → 37 | 23.2 → 5.5 | 32 → 3 | 23.2 → 4.3 | 32 → 4 | 18.0 → 17.9 | 1.31 → 1.38 | 57 → 71 | 0.88 → 0.85 |
| Tarkhan Steppe | sky-s | 0.9 → 3.2 | 15 → 25 | 24.8 → 11.1 | 31 → 4 | 24.8 → 9.4 | 31 → 11 | 16.7 → 11.7 | 1.22 → 1.04 | 77 → 87 | 0.87 → 0.87 |
| Tarkhan Steppe | centre-far | 6.0 → 7.8 | 42 → 55 | 19.8 → 7.8 | 26 → 5 | 19.8 → 6.1 | 26 → 7 | 13.8 → 15.1 | 1.26 → 1.28 | 75 → 77 | 0.95 → 0.96 |
| Cinder Junction | sky-w | 5.5 → 6.2 | 39 → 43 | 36.8 → 8.6 | 85 → 21 | 36.8 → 6.4 | 85 → 11 | 12.8 → 16.2 | 1.56 → 1.77 | 43 → 64 | 0.67 → 0.60 |
| Cinder Junction | sky-s | 7.6 → 8.1 | 54 → 57 | 52.2 → 11.3 | 100 → 18 | 52.2 → 11.4 | 100 → 18 | 10.9 → 22.3 | 1.40 → 1.90 | 38 → 66 | 0.71 → 0.66 |
| Cinder Junction | centre-far | 8.0 → 9.0 | 56 → 63 | 35.6 → 2.5 | 99 → 3 | 35.6 → 2.5 | 99 → 3 | 9.3 → 13.0 | 1.45 → 1.73 | 55 → 63 | 0.82 → 0.76 |
| Frontier Basin | sky-w | 9.3 → 10.2 | 65 → 72 | 48.6 → 10.0 | 99 → 14 | 48.6 → 10.0 | 99 → 14 | 10.1 → 18.3 | 1.35 → 1.57 | 18 → 74 | 0.75 → 0.71 |
| Frontier Basin | sky-s | 10.7 → 12.4 | 75 → 87 | 55.6 → 4.1 | 99 → 1 | 55.6 → 4.1 | 99 → 1 | 14.3 → 19.4 | 1.38 → 1.84 | 4 → 57 | 0.69 → 0.63 |
| Frontier Basin | centre-far | 12.2 → 13.4 | 85 → 94 | 38.4 → 6.1 | 89 → 3 | 38.4 → 6.1 | 89 → 3 | 11.3 → 13.9 | 1.30 → 1.52 | 14 → 57 | 0.93 → 0.93 |
| Nordhavn Fjord | sky-w | 14.4 → 22.4 | 101 → 157 | 57.3 → 6.6 | 94 → 9 | 57.3 → 6.6 | 94 → 9 | 9.1 → 8.3 | 1.28 → 1.67 | 2 → 42 | 0.70 → 0.66 |
| Nordhavn Fjord | sky-s | 16.4 → 24.7 | 115 → 173 | 53.9 → 3.5 | 99 → 2 | 53.9 → 3.5 | 99 → 2 | 11.2 → 9.3 | 1.80 → 2.33 | 7 → 54 | 0.62 → 0.51 |
| Nordhavn Fjord | centre-far | 14.8 → 21.1 | 104 → 147 | 66.9 → 6.8 | 100 → 7 | 66.9 → 6.8 | 100 → 7 | 8.6 → 8.8 | 1.33 → 1.70 | 8 → 38 | 0.69 → 0.72 |
| Jade River Delta | sky-w | 6.9 → 7.5 | 48 → 53 | 40.3 → 8.4 | 88 → 10 | 40.3 → 8.4 | 88 → 10 | 11.7 → 15.2 | 1.23 → 1.36 | 33 → 81 | 0.81 → 0.79 |
| Jade River Delta | sky-s | 7.9 → 8.6 | 55 → 60 | 40.7 → 11.3 | 86 → 12 | 40.7 → 11.2 | 86 → 12 | 13.1 → 17.3 | 1.30 → 1.40 | 19 → 79 | 0.74 → 0.79 |
| Jade River Delta | centre-far | 9.2 → 10.3 | 64 → 72 | 32.5 → 11.8 | 85 → 17 | 32.5 → 9.1 | 85 → 12 | 11.8 → 13.2 | 1.28 → 1.42 | 56 → 78 | 0.87 → 0.85 |
| Redrock Divide | sky-w | 0.3 → 0.8 | 20 → 28 | 46.9 → 22.2 | 58 → 24 | 46.9 → 34.8 | 58 → 53 | 14.8 → 10.9 | 2.10 → 1.18 | 2 → 24 | 1.03 → 1.03 |
| Redrock Divide | sky-s | 9.8 → 14.7 | 70 → 105 | 35.8 → 24.6 | 77 → 40 | 35.8 → 9.0 | 77 → 10 | 10.2 → 8.2 | 1.26 → 1.14 | 1 → 47 | 0.81 → 0.87 |
| Redrock Divide | centre-far | 9.5 → 14.5 | 66 → 101 | 19.6 → 14.1 | 20 → 19 | 19.6 → 4.2 | 20 → 2 | 7.8 → 7.1 | 1.23 → 1.18 | 1 → 48 | 0.93 → 0.93 |
| Monsoon Ridge | sky-w | 4.9 → 8.7 | 36 → 61 | 76.4 → 19.2 | 97 → 24 | 76.4 → 19.1 | 97 → 24 | 12.2 → 19.6 | 1.29 → 1.98 | 1 → 48 | 0.57 → 0.60 |
| Monsoon Ridge | sky-s | 9.2 → 13.5 | 65 → 95 | 68.9 → 4.4 | 97 → 3 | 68.9 → 4.4 | 97 → 3 | 11.8 → 16.0 | 1.69 → 2.31 | 3 → 64 | 0.55 → 0.47 |
| Monsoon Ridge | centre-far | 9.2 → 14.0 | 65 → 98 | 58.7 → 6.4 | 100 → 6 | 58.7 → 6.3 | 100 → 6 | 8.8 → 12.5 | 1.26 → 1.79 | 2 → 59 | 0.67 → 0.63 |
| Glacier Pass | sky-w | 7.4 → 14.0 | 52 → 98 | 24.1 → 6.4 | 39 → 4 | 24.1 → 6.3 | 39 → 4 | 26.7 → 16.2 | 1.91 → 1.17 | 56 → 84 | 1.08 → 0.96 |
| Glacier Pass | sky-s | 11.3 → 20.0 | 79 → 140 | 30.9 → 8.3 | 49 → 7 | 30.9 → 7.2 | 49 → 4 | 20.0 → 12.7 | 1.67 → 1.33 | 29 → 84 | 0.91 → 0.70 |
| Glacier Pass | centre-far | 14.1 → 23.2 | 99 → 163 | 19.6 → 8.2 | 41 → 10 | 19.6 → 6.2 | 41 → 4 | 19.5 → 14.7 | 1.66 → 1.20 | 68 → 80 | 1.49 → 1.41 |
| Obsidian Caldera | sky-w | 17.6 → 21.3 | 123 → 149 | 46.8 → 4.0 | 88 → 2 | 46.8 → 4.0 | 88 → 2 | 6.2 → 9.9 | 1.67 → 2.24 | 0 → 4 | 0.61 → 0.46 |
| Obsidian Caldera | sky-s | 16.9 → 20.4 | 119 → 143 | 52.4 → 3.9 | 78 → 1 | 52.4 → 3.9 | 78 → 1 | 7.0 → 14.5 | 2.06 → 3.32 | 0 → 30 | 0.47 → 0.31 |
| Obsidian Caldera | centre-far | 21.0 → 24.9 | 149 → 174 | 39.4 → 3.4 | 67 → 0 | 39.4 → 3.4 | 67 → 0 | 7.0 → 10.9 | 1.79 → 2.49 | 0 → 9 | 0.64 → 0.44 |
| Ironworks | sky-w | 4.0 → 5.3 | 29 → 37 | 73.0 → 35.2 | 100 → 68 | 73.0 → 25.5 | 100 → 42 | 13.4 → 15.7 | 1.55 → 1.73 | 4 → 43 | 0.60 → 0.63 |
| Ironworks | sky-s | 4.9 → 6.5 | 35 → 46 | 70.0 → 30.8 | 100 → 62 | 70.0 → 15.7 | 100 → 24 | 13.2 → 18.5 | 1.51 → 2.07 | 6 → 49 | 0.59 → 0.61 |
| Ironworks | centre-far | 5.6 → 7.8 | 39 → 55 | 54.1 → 31.8 | 100 → 65 | 54.1 → 11.1 | 100 → 18 | 10.4 → 11.4 | 1.50 → 1.62 | 6 → 43 | 0.67 → 0.66 |
| Ruinspires | sky-w | 1.0 → 1.5 | 27 → 29 | 36.1 → 11.3 | 68 → 9 | 36.1 → 11.3 | 68 → 9 | 9.2 → 12.2 | 1.20 → 1.16 | 70 → 82 | 0.96 → 0.97 |
| Ruinspires | sky-s | 3.8 → 5.1 | 39 → 43 | 43.5 → 10.5 | 99 → 8 | 43.5 → 11.4 | 99 → 10 | 10.6 → 12.4 | 1.22 → 1.25 | 16 → 67 | 0.60 → 0.42 |
| Ruinspires | centre-far | 5.4 → 6.8 | 38 → 48 | 25.8 → 11.9 | 41 → 24 | 25.8 → 7.2 | 41 → 5 | 7.2 → 7.9 | 1.31 → 1.43 | 49 → 75 | 0.98 → 0.94 |
| Blackglass District | sky-w | 1.8 → 1.8 | 17 → 55 | 33.3 → 16.4 | 54 → 5 | 33.3 → 16.4 | 54 → 5 | 12.6 → 15.4 | 2.59 → 1.85 | 1 → 81 | 0.53 → 0.12 |
| Blackglass District | sky-s | 7.4 → 9.5 | 52 → 66 | 66.2 → 9.7 | 100 → 9 | 66.2 → 9.7 | 100 → 9 | 9.6 → 12.6 | 1.41 → 2.41 | 1 → 69 | 0.62 → 0.40 |
| Blackglass District | centre-far | 3.6 → 4.7 | 54 → 64 | 48.3 → 11.0 | 98 → 8 | 48.3 → 11.0 | 98 → 8 | 6.7 → 11.1 | 1.30 → 1.57 | 3 → 69 | 0.68 → 0.60 |
| Titan Gorge | sky-w | 14.9 → 14.8 | 116 → 116 | 27.4 → 0.9 | 41 → 0 | 27.4 → 0.9 | 41 → 0 | 7.1 → 7.4 | 1.33 → 1.38 | 14 → 69 | 0.92 → 0.90 |
| Titan Gorge | sky-s | 4.6 → 4.4 | 66 → 63 | 55.9 → 0.6 | 100 → 0 | 55.9 → 0.6 | 100 → 0 | 10.2 → 12.0 | 1.61 → 1.67 | 16 → 67 | 0.79 → 0.63 |
| Titan Gorge | centre-far | 30.9 → 30.7 | 217 → 215 | 34.4 → 4.1 | 73 → 5 | 34.4 → 4.1 | 73 → 5 | 7.4 → 7.1 | 1.42 → 1.54 | 12 → 44 | 1.03 → 0.98 |
| Skybridge Chasm | sky-w | 22.6 → 22.1 | 158 → 155 | 27.0 → 3.7 | 55 → 1 | 27.0 → 3.7 | 55 → 1 | 8.0 → 7.4 | 2.13 → 2.15 | 10 → 9 | 0.63 → 0.60 |
| Skybridge Chasm | sky-s | 3.1 → 3.0 | 52 → 56 | 32.8 → 14.4 | 58 → 12 | 32.8 → 14.4 | 58 → 12 | 10.5 → 10.6 | 2.41 → 3.15 | 1 → 26 | 0.28 → 0.27 |
| Skybridge Chasm | centre-far | 27.4 → 27.1 | 192 → 190 | 20.6 → 6.1 | 25 → 3 | 20.6 → 6.1 | 25 → 3 | 6.5 → 7.3 | 1.56 → 1.67 | 12 → 20 | 0.81 → 0.76 |
| Tidegate Polders | sky-w | 0.8 → 4.4 | 9 → 32 | 65.2 → 22.2 | 96 → 22 | 65.2 → 62.1 | 96 → 96 | 16.9 → 10.1 | 1.25 → 1.09 | 7 → 86 | 0.82 → 0.83 |
| Tidegate Polders | sky-s | 0.6 → 4.5 | 9 → 34 | 57.7 → 17.1 | 80 → 10 | 57.7 → 56.9 | 80 → 83 | 20.6 → 15.2 | 1.53 → 1.35 | 3 → 80 | 1.03 → 0.91 |
| Tidegate Polders | centre-far | 1.1 → 6.8 | 9 → 48 | 62.3 → 20.4 | 97 → 14 | 62.3 → 49.5 | 97 → 94 | 12.8 → 6.8 | 1.29 → 1.15 | 32 → 89 | 0.73 → 0.73 |
| Copper Mesa Mine | sky-w | 20.0 → 20.1 | 140 → 140 | 26.0 → 13.2 | 33 → 9 | 26.0 → 13.2 | 33 → 9 | 4.6 → 4.7 | 1.06 → 1.09 | 14 → 15 | 0.99 → 0.99 |
| Copper Mesa Mine | sky-s | 19.4 → 19.3 | 136 → 135 | 22.5 → 6.8 | 36 → 5 | 22.5 → 6.8 | 36 → 5 | 7.3 → 8.1 | 1.43 → 1.41 | 25 → 13 | 0.64 → 0.78 |
| Copper Mesa Mine | centre-far | 22.6 → 22.6 | 158 → 158 | 19.3 → 5.7 | 41 → 3 | 19.3 → 5.7 | 41 → 3 | 7.2 → 7.2 | 1.30 → 1.29 | 32 → 24 | 0.54 → 0.56 |
| Kestrel Airfield | sky-w | 4.4 → 7.4 | 31 → 52 | 42.0 → 15.4 | 93 → 15 | 42.0 → 12.3 | 93 → 17 | 13.7 → 16.9 | 1.53 → 1.60 | 35 → 74 | 0.71 → 0.70 |
| Kestrel Airfield | sky-s | 5.8 → 9.2 | 41 → 64 | 33.4 → 13.9 | 94 → 0 | 33.4 → 4.3 | 94 → 3 | 18.7 → 18.9 | 1.86 → 1.74 | 52 → 70 | 0.64 → 0.55 |
| Kestrel Airfield | centre-far | 5.9 → 8.9 | 41 → 63 | 30.5 → 11.2 | 69 → 0 | 30.5 → 5.7 | 69 → 5 | 11.1 → 11.4 | 1.37 → 1.41 | 62 → 76 | 0.84 → 0.82 |
| Sunscar Oasis | sky-w | 4.0 → 5.5 | 31 → 40 | 16.6 → 15.1 | 15 → 13 | 16.6 → 13.0 | 15 → 13 | 12.9 → 12.9 | 1.08 → 1.08 | 52 → 67 | 0.92 → 0.94 |
| Sunscar Oasis | sky-s | 6.3 → 7.4 | 44 → 52 | 15.9 → 4.8 | 11 → 0 | 15.9 → 5.2 | 11 → 0 | 15.9 → 14.3 | 1.15 → 1.20 | 60 → 51 | 0.65 → 0.61 |
| Sunscar Oasis | centre-far | 8.1 → 10.2 | 57 → 71 | 8.6 → 10.4 | 0 → 7 | 8.6 → 4.8 | 0 → 1 | 7.7 → 7.3 | 1.13 → 1.13 | 59 → 63 | 1.00 → 1.00 |
| Whiteout Station | sky-w | 4.1 → 15.3 | 29 → 107 | 5.9 → 0.6 | 2 → 0 | 5.9 → 0.6 | 2 → 0 | 8.8 → 14.6 | 1.09 → 1.22 | 98 → 87 | 0.92 → 0.90 |
| Whiteout Station | sky-s | 4.7 → 18.5 | 34 → 130 | 16.2 → 0.6 | 12 → 0 | 16.2 → 0.6 | 12 → 0 | 17.8 → 13.6 | 1.20 → 1.50 | 84 → 64 | 0.90 → 0.72 |
| Whiteout Station | centre-far | 6.0 → 17.9 | 42 → 125 | 3.4 → 0.6 | 0 → 0 | 3.4 → 0.6 | 0 → 0 | 8.6 → 11.7 | 1.07 → 1.24 | 97 → 87 | 0.94 → 0.94 |
| Orchard Valley | sky-w | 6.7 → 13.2 | 54 → 95 | 40.5 → 16.5 | 88 → 23 | 40.5 → 10.6 | 88 → 10 | 11.6 → 14.2 | 1.33 → 1.34 | 39 → 68 | 0.77 → 0.76 |
| Orchard Valley | sky-s | 9.0 → 15.8 | 64 → 110 | 61.2 → 16.3 | 98 → 18 | 61.2 → 16.9 | 98 → 22 | 14.8 → 17.4 | 1.53 → 1.86 | 10 → 44 | 0.59 → 0.65 |
| Orchard Valley | centre-far | 12.9 → 19.1 | 90 → 134 | 33.6 → 6.6 | 89 → 4 | 33.6 → 5.7 | 89 → 1 | 11.4 → 11.8 | 1.28 → 1.40 | 36 → 62 | 0.91 → 0.97 |
| Longleaf Crossing | sky-w | 3.4 → 4.7 | 31 → 38 | 47.4 → 17.0 | 92 → 13 | 47.4 → 15.1 | 92 → 15 | 14.3 → 21.1 | 1.47 → 1.76 | 31 → 69 | 0.56 → 0.49 |
| Longleaf Crossing | sky-s | 6.2 → 6.9 | 46 → 50 | 50.1 → 23.2 | 97 → 22 | 50.1 → 24.8 | 97 → 26 | 16.9 → 24.4 | 1.76 → 2.36 | 16 → 50 | 0.58 → 0.41 |
| Longleaf Crossing | centre-far | 9.7 → 10.8 | 68 → 76 | 31.6 → 5.9 | 68 → 3 | 31.6 → 5.6 | 68 → 3 | 10.6 → 15.8 | 1.54 → 1.79 | 35 → 60 | 0.78 → 0.67 |
| Mangrove Reach | sky-w | 2.7 → 4.6 | 21 → 32 | 45.2 → 19.5 | 98 → 16 | 45.2 → 16.3 | 98 → 26 | 11.8 → 12.2 | 1.31 → 1.39 | 50 → 74 | 0.70 → 0.74 |
| Mangrove Reach | sky-s | 2.8 → 7.9 | 23 → 57 | 40.8 → 18.8 | 92 → 14 | 40.8 → 15.6 | 92 → 25 | 18.9 → 14.3 | 1.46 → 1.30 | 44 → 82 | 0.65 → 0.73 |
| Mangrove Reach | centre-far | 3.7 → 10.0 | 26 → 70 | 31.7 → 14.2 | 60 → 2 | 31.7 → 10.5 | 60 → 16 | 14.8 → 10.2 | 1.42 → 1.20 | 64 → 86 | 0.75 → 0.76 |
| Saltwind Narrows | sky-w | 1.6 → 1.8 | 16 → 18 | 27.8 → 22.2 | 76 → 52 | 27.8 → 20.5 | 76 → 52 | 12.5 → 12.8 | 1.19 → 1.20 | 89 → 91 | 1.03 → 1.03 |
| Saltwind Narrows | sky-s | 8.3 → 9.7 | 58 → 68 | 28.5 → 1.9 | 69 → 0 | 28.5 → 1.8 | 69 → 0 | 17.5 → 21.2 | 1.57 → 1.89 | 59 → 59 | 0.79 → 0.64 |
| Saltwind Narrows | centre-far | 7.5 → 8.9 | 52 → 62 | 22.5 → 3.4 | 36 → 1 | 22.5 → 2.5 | 36 → 1 | 11.4 → 14.9 | 1.28 → 1.43 | 76 → 77 | 0.85 → 0.84 |
| Highland Reservoir | sky-w | 10.5 → 17.4 | 74 → 122 | 49.6 → 9.2 | 100 → 11 | 49.6 → 8.9 | 100 → 10 | 14.8 → 13.6 | 1.35 → 1.41 | 22 → 50 | 0.80 → 0.83 |
| Highland Reservoir | sky-s | 14.4 → 22.7 | 101 → 159 | 56.7 → 2.7 | 100 → 2 | 56.7 → 2.7 | 100 → 2 | 11.2 → 13.5 | 1.39 → 1.81 | 17 → 63 | 0.75 → 0.57 |
| Highland Reservoir | centre-far | 9.4 → 15.5 | 66 → 108 | 39.2 → 6.0 | 98 → 3 | 39.2 → 6.3 | 98 → 4 | 11.6 → 11.2 | 1.26 → 1.38 | 35 → 63 | 0.72 → 0.74 |
| Olympus Basin | sky-w | 12.8 → 15.4 | 98 → 108 | 131.2 → 7.2 | 99 → 5 | 131.2 → 7.7 | 99 → 6 | 10.6 → 12.3 | 1.45 → 10.80 | 0 → 0 | 0.94 → 0.86 |
| Olympus Basin | sky-s | 9.2 → 12.3 | 79 → 101 | 56.4 → 8.7 | 92 → 8 | 56.4 → 8.7 | 92 → 8 | 12.7 → 12.7 | 2.15 → 2.86 | 0 → 0 | 0.61 → 0.56 |
| Olympus Basin | centre-far | 15.5 → 19.0 | 109 → 133 | 73.8 → 13.0 | 85 → 16 | 73.8 → 11.8 | 85 → 13 | 10.5 → 13.5 | 1.96 → 3.68 | 0 → 1 | 0.84 → 0.77 |

Review sheets: `$SP/r72/review/contact-sheet.png` (sky-w), `contact-sheet-sky-s.png`, `contact-sheet-centre-far.png`
(31 maps, before left, after right), and the per-map pairs `$SP/r72/review/<map>-{before,after}.png`; Whiteout first.
**Eye check (the lane's own, on the crops of the final captures).** Whiteout: the grey dome is gone; the ring is a
polar range with a snow-and-rock face, the boosted second and third ranges standing behind the first ridge, the far
range's 246 m peaks showing through the passes under the stratus, spruce and birch on the lower slopes and the
scoured ribs on the crests — under the overcast the snow is still the sky's white (round 44), and the dark faces are
what makes it read. Frosthollow centre-far: a sharp peak with a flank in shadow, layered ranges and the far range
behind. Glacier Pass and Nordhavn: near dark ridge, pale mid ranges, far peaks, the ribbons and range trees gone from
the washed crests. The desert and mesa rings are the same tables with ledged cliffs in the bake and stay pale under
their haze. The outer-skyline numbers below FALL on most views: the outermost silhouette used to be the low first
ridge (dark against the sky, 36 luma of step); it is now a hazed distant range (the boosted outer rows and the far
range, 7–9 luma) with the same first ridge still crisp in front of it — the layering the brief asks for, which a
top-edge metric reads as softness; the lever for ranges that read at 1.1–1.4 km is the aerial pass's far ceilings
(open, below).

**Performance.** The ring's cost by repetition (`.qa-dev/r72-ring-bench.mjs`: the frame's GPU and CPU medians with the
ring drawn once against forty-one times — forty clones of the ring and its children at the same transform, drawn after
it — alternated three times at the sky-w and centre-far views; Δ / 40 is the ring's own cost, the far range and the
atlas fetch included; the base tree and this one measured back to back on a machine at load 100–120, so the pairs are
comparable and the absolute figures are upper bounds; measured at tip 93bb9a628 — the later commits of the round only
remove ribbons and range trees and change vertex colours and uniform values):

| Map | View | Ring GPU ms before → after | Δ GPU | Ring CPU ms before → after | Ring draws |
|---|---|---|---|---|---|
| whiteout | centre-far | 1.14 → 1.52 | +0.38 | 0.15 → 0.17 | 20 → 24 |
| whiteout | sky-w | 0.62 → 1.38 | +0.76 | 0.07 → 0.16 | 20 → 24 |
| alpine | centre-far | 2.35 → 1.73 | −0.62 | 0.17 → 0.16 | 13 → 14 |
| alpine | sky-w | 1.66 → 1.41 | −0.25 | 0.15 → 0.15 | 13 → 14 |
| verdant | centre-far | 1.96 → 1.59 | −0.38 | 0.18 → 0.20 | 23 → 24 |
| verdant | sky-w | 1.67 → 1.62 | −0.04 | 0.18 → 0.18 | 23 → 24 |
| desert | centre-far | 1.52 → 0.89 | −0.63 | 0.18 → 0.15 | 20 → 21 |
| desert | sky-w | 1.84 → 0.70 | −1.14 | 0.16 → 0.10 | 20 → 21 |
| mars | centre-far | 1.97 → 0.88 | −1.09 | 0.20 → 0.15 | 20 → 21 |
| mars | sky-w | 1.79 → 1.08 | −0.71 | 0.17 → 0.14 | 20 → 21 |

Whiteout is the one map that pays: its ring went from a rolling ladder (18 rows) to the alpine one (36 rows, the ring's
forest on its lower slopes, four more draws — the forest's instanced meshes it had none of before), +0.4 / +0.8 ms at
load 100; the other four are within the noise or lower (the atlas fetch is one texture read against the twenty-seven
tile fetches already there; the medians move with the machine's load between the two runs, which is why the pairs are
read against each other and not against the budget line alone). Whiteout's sky-w pair is over the +0.6 ms line at
this load; the same views at load 30 are the check the integrator should run before landing (the bench takes the
`--maps=whiteout --views=sky-w` form). Draw calls: the far range is one unlit draw (the
ring's material pair, the forest's up to eight instanced meshes, the rockfield and the treeline stay), +1 on every map
that carries a far range; no per-frame allocation (the cloud-shade binder writes four numbers into existing uniform
objects and rebinds textures by reference; the far range and the atlas are built at activation). Construction: the
atlas bake is a sliced generator at world activation (the terrain build's own pattern) — in Node at load 40–120 the
three passes measured 40–520 ms (the macro height), 340–2,900 ms (the field: four noise samples a texel over 524k
texels) and 170–2,000 ms (the occlusion and the sun on the half grid, the gradient at full), 0.6–1.0 s on a quiet
machine for a 2048 x 256 atlas (`.qa-dev/r72-bake-probe.mjs`, the numbers in `$SP/r72/bake-stats.txt`); the ring
geometry itself builds in 10–60 ms (the relief field's 5 samples a vertex; noise budgets 139,527 + 20,480 on the
alpine ladder). Mobile pays none of it.

**Receipts.** `horizonRelief.selftest` (new: the eight characters' bounds, the per-map keys, the field's determinism,
centring and amplitude, the talus damping, the gully field's continuity across the angle seam, the bake's sizes,
ranges, determinism, flat-ring and sea controls, the far range's rows, deck cap, determinism, envelope, needle bound
and sea sector, every map's ranges bent along their crests at three seeds), `horizonCloudShade.selftest` (new: the
tile equal to the layer's, the ten uniforms declared and reaching the vista program, the fetches inside the layer's
branch, the binder by reference and its four off-conditions), `horizonResources` (re-pinned with dated notes: the
three aggregate digests and Polders' three, the two noise budgets — 66,374 → 139,527 on the alpine ladder and 59,047 →
121,856 on the mesa stack, the six fetch sites, the round-72 uniforms and terms, nine retained textures, the far range
as the bare backdrop's one child and its material, forest maps' three children), `titanGorgeHorizon`,
`redrockCanyonHorizon` (the historical opt-out digest: with the canyon off the relief applies) and
`copperQuarrySurface` (digests re-pinned), `mapQuality`, `horizonMesaSurface`, `horizonNoiseSampling`,
`horizonAutumnGround`, `horizonDetailAtlas`, `horizonMesaTexture`, `horizonRockfield`, `railCutting`,
`autumnHorizonSeam`, `battleAtmosphereRuntime` (the far range in the night dim's name list) green; `npm run typecheck`
(the native tsc and the core unused-symbol check).

**Open.** `tools/horizon-construction-bench.mjs` validates a `horizon-detail` child that no ring has carried since the
vista pass, so its cold-construction comparison fails on the base tree and on this one alike (the bake's cost is
measured in Node instead, above); the skyline comb (the alpha-tested canopy ribbon on the resolved crest) reads as a
pale green ribbon along the relieved alpine crests — it did on the domes too, and a crown-mass ribbon that follows the
new relief is a lane of its own; the far range stands under a low deck's ceiling on Whiteout, Frosthollow, Blackglass
and Polders (246–300 m) and shows only through the passes there; mobile keeps today's ring (the geometry relief
reaches it, the atlas and the far range do not); the bake's cost was measured on a machine at load 40–175 (a release
chain and three lanes), so its figures are upper bounds; the cloud-shade binding reads the layer's gobo uniforms
through a loose interface (the cloud lane owns that module — a rename there turns the shade off, never breaks the
ring); the desert and mesa rings stay pale under their haze (the character's ledges are in the bake, the haze owns
the look); the first ridge is the terrain material's (the seam laws seat the rows to 700 m on the battlefield's own splat
material) and from the map's floor it is the biggest mountain in the frame — the vista's relief, occlusion, cast
shadows and sky light stop at its crest, so the foothill face reads with the terrain's rules (its steep-face rock, its
cascades' shadows) and none of this round's; teaching the terrain material to read the atlas on the ring bands is the
next step for the near mountains; under an overcast the ring's snow is the sky's own white (Whiteout, Frosthollow: the
near skyline step against the sky measures under 2 luma — round 44's finding, unchanged) and only the polar rock law's
dark faces make the ranges read; the near skyline's step now measures the ring's crest against the far range behind it
(15 luma against 36 for the ring against the sky before), a layering the metric cannot tell from softness — the
far range's haze was lowered 0.12 at both rows for the separation and the full sheets were re-shot; the boosted outer
rows of the near ring stand above the nearer hills now and the post pass's far ceilings (round 39: extinction 0.60,
scatter 0.55 at 1.3 km, on top of the material's 0.34) wash them to faint sky-toned silhouettes — the lever for ranges
that read as ranges at that distance is the aerial pass's far ceiling, not the ring (the ring's own haze was already
lowered here); the skyline ribbons and the ring forest's range-class trees no longer stand on those faces (no ribbon past an
aerial rank of 0.3 or on a crest above half the ring's height; no range tree past 880 m, above half the ring, or on a
snow map at all — a canopy ribbon or a dark crown on a washed summit stood over nothing as a floating band or dot,
and on a snow map every face past the first ridge is that pale; the outland rockfield's range boulders take the same
rule — Frosthollow's boosted faces carried them as specks in the sky; the low near crests keep their forest edge, lit
like the vista surface, the crowns that remain take the fog by height like the face under them, and the rim band keeps
its rich near class and its near boulders on every map) — a crown-mass ribbon that takes the crest's own rendered tone is a lane of its own.

### AAA map program — 2026-09-21 (round 35 onward)

Owner (2026-09-21, with two Redrock Divide screenshots): "the sides of mountains in stuff like redrock divide esp in
horizon look so so bare. stuff in background should never be flat and the layers and texturing was good. i meant that
the textures didnt continue on once you get to the boundary of the map - it looked like a completely new geography …
make them seamless and seem like just a map square boundary area carved into a broader map that actually exists and
works. put a lot of max effort into making the most beautiful maps ever IN GENERAL and plan out what this implies and
means and where our current maps fall short of that, and /goal that until you reach Triple AAA, world of tanks level
maps doing deep research".

Two corrections to earlier rounds follow from that: the round-29 "texture just stops" finding was about GEOGRAPHIC
continuity across the border, not about wall texturing, and no seam fix may trade away texture richness on the
ranges. The research behind this section is the 46-source brief (World of Tanks Core / Big World Outland, Dagor,
Frostbite and Unreal terrain talks, Hillaire / Bruneton aerial perspective, hex tiling, impostor forests); its
conclusions are folded in below rather than repeated.

### Round 72b — 2026-09-26: the integrator's eye-check answered (silhouettes, surface, wash, near ridge, perf)

**Integrator (2026-09-25, on the round-72 sheets, ~6 / 10):** rows of symmetric cones (Alpine, Fjord, Whiteout's right
range); faces that read as one flat tone; the far ranges washed to nothing; the first ridge — the terrain material's —
carrying none of the round's relief; Whiteout's ring over the +0.6 ms line at load 100. Target: Whiteout and Alpine at
8 / 10 next to the clouds.

**What was actually wrong first (found before any of the five items could be judged).** The round-72 vista and terrain
programs had not compiled since the round's first commit: the relieved normal read `.z` on two `vec2` gradients
(`vec3 nR = normalize(vec3(-(g0.x + gd.x), 1.0, -(g0.z + gd.z)))` and the same slip in the terrain hook), a compile
error three reports only with `renderer.debug.checkShaderErrors` on — the game ships with it off, so the ring drew with
a stale program and every QA debug channel was inert. Fixed (`.y`), and pinned by `horizonRelief.selftest` (the text of
the composed normal, no `.z` on a vec2 gradient). The capture tool now turns the check on and records warnings (it had
been filtering for `'warning'` where Puppeteer says `'warn'`). Then the terrain program failed to LINK: it sits at
`MAX_TEXTURE_IMAGE_UNITS` = 16 exactly (ten layer samplers, four cascades, the environment map and three's DFG LUT) and
round 72b's `uRingRelief` was a seventeenth — the whole battlefield drew with no program (a beige ground). The atlas now
rides in the M (marsh / ice) normal's unit for the ring bands' draw only: `bindRingReliefAtlas` (horizonAutumnGround.ts)
points `uNrmM` at the atlas and raises `uRingDraw` in the ring's `onBeforeRender` and puts the marsh normal back in
`onAfterRender`; three re-uploads a material's uniforms only when the program or material changes between draws, and the
bands draw right after the square's chunks with the same material, so both hooks drop the bound program
(`renderer.state.useProgram(null)`) to force the upload — two forced refreshes per pass, no allocation, no clone
material (a clone's own onBeforeCompile would have re-pointed every per-frame hook at the wrong uniform objects).
The marsh normal is off during that draw (past the square its 19 cm tile is sub-pixel at every ring distance). Program
key v41; `terrainMaterialOwnership` pins the ten-sampler budget and refuses a seventeenth; `terrainResources` is back to
ten owned textures. A third slip: the far range's `TAU` was declared after its first use inside an `Array.from`
callback (a temporal-dead-zone throw tsc does not see) — the ring build died on every map at the b3 tip; hoisted.

**1. Silhouettes.** (a) The first ridge (the rank-0 authored row, r ≈ 773 m, and the band that climbs to it) carries
the ranged field at full weight with the crests lifted more than the saddles are lowered (`relievedHeight` crestLift
0.55 up / 0.3 down; the band's weight rises as t^1.6 so the seam row keeps round 29's radial-gradient ceilings —
Verdant's seam sat at 0.405 against 0.4 on a linear ramp): Whiteout's ridge row varied 13.9 m RMS over its 4.9 km and
drew as one level rim in front of the ranges; 19.9 m now, max 106 → 123 m. (b) Every slope break of the authored
profile — the foot of the first steep face, the shoulder above it — sat at one radius all the way round and drew as a
straight horizontal edge: a bench in front of every range (the crops' plainest tell). `wanderProfileBreaks`
(maps/horizon.ts) resamples each column's own height profile beyond the first ridge at a wandering radius (a periodic
field of the arc and the radius, ±38 m, two octaves, fading in over 70 m from the ridge and out over the last 80 m),
bounded afterwards by the ledger's anchor law (each span's interpolated rows within the chord ± 12 % of the span, alpine
within the anchors' band) — heights only, the columns' radii stay, the mesa stack and the near-flat rings (Polders,
32 m) left alone, the ledger's cliff law run after it. (c) The crests lean: the ranged field warps its along-axis
coordinate by a field a wavelength and a half long (`horizonRelief.ts` rangeField: `alongL = along + lean`), so one
flank of every crest is the steeper and the summits sit off-centre — a ridged cusp is symmetric by construction, and
Fjord's centre-far was a row of symmetric spires whatever the flank compression did across the axis. The alpine crest
sharpness 1.9 → 1.5, the cone clamp 0.8 → 0.7 of the column arc (a clamped peak's base is 2.9 × its rise; at 0.8 every
clamped spire was exactly the 2.5 × cone the rule allows). (d) The far range (`horizonFarRange.ts`) was built three
times over: as ranges with oblique axes (round 72's isotropic rows were cones by construction) — which drew as two smooth
white domes on Alpine, because the ranged sum ran past 1 over most of a range and the clamp left only the smooth
envelope; then, normalised (RMS 0.5 over the annulus, a soft knee above 0.8 instead of a clamp) with short crests at
full weight — a row of cones the step clamp had cut to straight flanks (a 200 m octave sampled at two to four of the
288 columns aliases into one-column needles); now rounded massifs 1.6–2.2 km along the axis and 720–960 m across
(`pow(1 - |n|, 0.75)`), one serration octave at a third of the massif (eight to ten columns) at half the character's
sharpness, no smoothing pass (three passes rounded every crest into a dome), the step clamp kept, and a rib / couloir
cavity term in the vertex shading (±14 % from a vertex's height against its neighbours three columns either side — the
far faces were one flat white).

**2. Surface detail.** The bake's fine relief ran at a radial elongation of 3.0–3.5 on the alpine and polar characters:
the debug channel (`--debug=1`, the atlas gradient) showed every face as a radial comb — pink / cyan bands 25–40 m wide
and hundreds of metres long, "corrugated cardboard" in the crops. Elongation 1.3–2.0 now (alpine 1.7, polar 1.9), the
gully chutes shorter (elongation 4 / 4 / 6 / 4.5 on polar / alpine / volcanic / martian) and meandering — the groove
lookup is warped by a slow field of the arc and the radius (two octaves, ±0.22 rad) and its depth varies along the arc
(0.65 ± 0.55), so the chutes bend and fork and no two faces carry the same comb. Round 72b's earlier surface terms stay:
the striations and gully shading at 3.2 × on steep faces (`land = (1 - marine) · seamW · (1 + 2.2 · steep)`), the crisp
snow / rock boundary (`snowSlopeEdge = smoothstep(0.17, 0.23, slope)`: a 3.5° soft edge), the wind-scoured crests
(`scour`), the occlusion `1 - (1 - relief.z^1.4) · uVAoStrength`, the sky-coloured shaded faces (`shadeSide`) and the
sun glitter. The bake's seam fade is 60 m from the playable edge (a 90 m fade read as a smooth belt under the first
ridge).

**3. Wash.** The post pass's off-square distance law (post.ts, `AERIAL_RING_*`: extinction 0.50 → 0.64 and scatter
0.44 → 0.58 between 0.9 and 2.6 km, playable terrain at round 39's ceilings) stands; on top of it the far range carried
its own vertex haze of 0.44–0.72, and the two together left the ranges at about a fifth of the near contrast at 2 km
against the 40 % law — the far range's own haze is a fifth to a third now (hazeIn 0.17–0.23, hazeOut 0.31–0.36 by
character): bluer and lighter, never gone.

**4. Near ridge.** The terrain material's ring bands read the same relief / occlusion / sun-visibility atlas as the vista
(the M-normal unit swap above): the relieved normal in `splatCompute` (rock breaks and the snow line follow the
striations) and in `SPLAT_NORMAL_FRAG` (the lighting normal), `gRingAo` on the indirect light and `gRingSun` on the
direct — the first ridge carries the striations, rock breaks and snow line the ranges behind it carry; the seam row
stays the terrain's own (the bake is neutral within 60 m of the edge, the amplitude ramps over 40 m past it).

**Measured (round 72b).** The same fixed captures as round 72 (`.qa-dev/r72-capture.mjs`, 31 maps × sky-w / sky-s /
centre-far, seed 1337, the volumetric cloudscape on, shader-error checking on: zero warnings on every map) at the
round-72b tip 539408e98 against the round-71 base (tag `base`); the metrics and masks as in round 72. Summary over the
93 views (`$SP/r72/compare-after.{txt,md}`): outer ridge contrast median 35.8 → 43.5 (1.16 ×, up on 64 of 93 — round
72's sheet had it at 9.2, the far range's haze and the cone rows; the far range's own haze is a third of that now and
the ring's crests stand in front of it), outer crisp share 83.9 → 85.2 (up on 54), near ridge contrast 35.8 → 43.5 (up
on 62), near crisp share 83.9 → 78.0 (up on 51), the ring's screen height 55 → 82 px (1.39 ×, up on 79), detail energy
11.6 → 11.3 (up on 38 — the taller ring spreads the same relief over 1.4–2.3 × the pixels and the high-pass reads
less; on the flat-before maps it is up: Whiteout 8.8 → 12.5, Frosthollow 10.9 → 14.2), lit / shadow 1.35 → 1.39 (up on
44 of 92). The four maps the integrator named (before → after; near = the ring without its far range):

| Map | View | Ring cover % | Height px | Ridge contrast (near) | Crisp % | Detail | Lit / shadow | Snow % |
|---|---|---|---|---|---|---|---|---|
| Whiteout | sky-w | 4.1 → 17.9 | 29 → 125 | 5.9 → 24.3 | 2 → 44 | 8.8 → 12.5 | 1.09 → 1.56 | 98 → 43 |
| Whiteout | sky-s | 4.7 → 20.8 | 34 → 146 | 16.2 → 27.3 | 12 → 58 | 17.8 → 12.1 | 1.20 → 1.42 | 84 → 32 |
| Whiteout | centre-far | 6.0 → 21.1 | 42 → 148 | 3.4 → 17.5 | 0 → 28 | 8.6 → 10.4 | 1.07 → 1.46 | 97 → 43 |
| Frosthollow | sky-w | 9.3 → 18.9 | 65 → 132 | 10.6 → 28.3 | 3 → 43 | 10.9 → 14.2 | 1.18 → 1.44 | 93 → 65 |
| Frosthollow | sky-s | 7.9 → 12.1 | 57 → 92 | 16.2 → 18.7 | 21 → 24 | 18.4 → 17.1 | 1.29 → 1.59 | 86 → 68 |
| Frosthollow | centre-far | 12.7 → 25.0 | 89 → 175 | 8.5 → 38.1 | 1 → 59 | 10.0 → 13.4 | 1.43 → 1.65 | 74 → 40 |
| Glacier Pass | sky-w | 7.4 → 16.9 | 52 → 118 | 24.1 → 30.4 (41.4) | 39 → 60 (77) | 26.7 → 13.5 | 1.91 → 1.72 | 56 → 43 |
| Glacier Pass | sky-s | 11.3 → 27.2 | 79 → 190 | 30.9 → 53.0 (59.5) | 49 → 94 | 20.0 → 9.7 | 1.67 → 1.33 | 29 → 9 |
| Glacier Pass | centre-far | 14.1 → 32.5 | 99 → 227 | 19.6 → 19.0 | 41 → 32 | 19.5 → 12.6 | 1.66 → 1.44 | 68 → 25 |
| Nordhavn | sky-w | 14.4 → 24.5 | 101 → 172 | 57.3 → 62.9 (67.3) | 94 → 90 | 9.1 → 6.7 | 1.28 → 1.28 | 2 → 1 |
| Nordhavn | sky-s | 16.4 → 31.8 | 115 → 223 | 53.9 → 78.6 | 99 → 99 | 11.2 → 8.0 | 1.80 → 1.52 | 7 → 1 |
| Nordhavn | centre-far | 14.8 → 27.8 | 104 → 194 | 66.9 → 77.8 (78.8) | 100 → 99 | 8.6 → 7.7 | 1.33 → 1.47 | 8 → 1 |

Glacier Pass and Nordhavn's detail energy and lit / shadow fall against the base: the base ring was 52–115 px tall with
a twelve-metre bump as its only structure (a high-pass reads bump noise as detail), the round-72b ring is 118–227 px
with metre-scale relief under an aerial pass — a taller, hazed, structured ring measures lower on both, which is why
the crops and not the metric carry the judgement (the integrator's rule).

**Sun side against shadow side (round 72b, the integrator's ≥ 1.8 on the near ranges).** `.qa-dev/r72-sunshadow.mjs`:
the capture's ring mask split by the vista program's sun-visibility channel (a `--debug=3` shot of the same view at
the same tip: the ridges' cast shadows from the bake), the mean luma of the sun-visible ring pixels over the mean of
the shadowed ones — the near ring (without the far range) in brackets: Whiteout sky-w 1.71 (1.71), centre-far 1.82
(1.82); Glacier Pass sky-w 1.90 (1.78), centre-far 1.58 (1.58); Nordhavn sky-w 1.27 (1.24), centre-far 1.19 (1.16);
Frosthollow sky-w 1.57 (1.55), centre-far 1.33 (1.32). The line is met on Whiteout's centre-far and Glacier Pass's
sky-w; the rest sit at 1.2–1.7 for one reason — the sun those maps light with: Whiteout under its stratus, Frosthollow
under a stratocumulus deck and Nordhavn under a grey overcast get their direct term through the cloud layer's sun
weight, and the shadow side is lit by the same sky the sun side is (round 44's finding: under an overcast the snow is
the sky's white). The ratio there is the sky's, not the sun's; raising it means a lighting re-grade of the overcast
presets, which the owner has not ruled on. The p85 / p15 lit / shadow ratio of the whole mask (the table) is 1.28–1.72.

**Eye check (the lane's own, on `$SP/r72/review/crops/<map>-<view>-{before,after}.png`).** Whiteout sky-w: the first
ridge is a crest line with summits and cols, the second range's faces carry lit ribs and shadowed chutes that bend,
the snow / rock boundary is a line and the far range shows through two passes under the stratus — the rim bench is
gone; centre-far: the same, with the ridge's own shadow side against the sun-lit faces of the range behind. Alpine
sky-w: three ranges front to back at three haze levels, the near one dark rock and snow, the middle one with leaning
crests, the far massifs pale and rounded with serrated crests; centre-far: the great face carries striations, rock
breaks and cast shadows down to the treeline, and the profile's shoulder wanders instead of running level. Fjord
centre-far: the spires lean and differ in height and base width, the faces are green rock with shadowed couloirs; the
left-hand near ridge (the terrain material's) shows the atlas's striations. Frosthollow centre-far: the massif's shadow
side, the snow-scoured crest and a layered range behind. My own scores next to the clouds: Whiteout 7.5, Alpine 8,
Fjord 7.5, Frosthollow 7.5 — the far range is what keeps Whiteout and Fjord under 8 (the weak list below).

**Performance (round 72b).** Round 72's bench (`.qa-dev/r72-ring-bench.mjs`: the frame's GPU and CPU medians with the
ring drawn once against forty-one times, Δ / 40 = the ring's own cost, three rounds per view), the round-71 base tree
(b9d69fbac) and the round-72b tip (539408e98) back to back at 00:55–01:00 on a machine at load 94–112 (another lane's
Playwright runs; the release chain stopped red at 23:50, so the "chain 94 done" quiet window the item asked for never
came) — upper bounds, the pairs comparable, the round-to-round spread ±0.3 ms:

| Map | View | Ring GPU ms before → after | Δ GPU | Ring CPU ms before → after | Ring draws |
|---|---|---|---|---|---|
| Whiteout | sky-w | 0.573 → 1.516 | +0.94 | 0.060 → 0.158 | 20 → 22 |
| Whiteout | centre-far | 1.136 → 1.919 | +0.78 | 0.135 → 0.158 | 20 → 22 |
| Glacier Pass | sky-w | 1.700 → 1.562 | −0.14 | 0.165 → 0.163 | 13 → 13 |
| Glacier Pass | centre-far | 2.241 → 2.577 | +0.34 | 0.177 → 0.177 | 13 → 13 |

Round 72's own bench (tip 93bb9a628, the same load) had Whiteout at +0.76 / +0.38. Whiteout is over the +0.6 ms line on
both views in this measurement, and the reason is the cover, not the round's terms: the map went from a 29–42 px
rolling ring to a 125–148 px polar range — 4.4 × the pixels through a vista fragment of twelve triplanar tiles (36 taps)
plus the relief, cloud and canopy reads — and the clone bench does not even reach the bands' atlas read (clones carry
no `onBeforeRender`, so their bands draw with `uRingDraw` = 0). CPU: +0.02–0.10 ms per ring on Whiteout (the two forced
uniform uploads of the M-normal swap), 0 on Glacier Pass — under the 0.2 ms line; draw calls +2 on Whiteout (the far
range among them), 0 on Glacier Pass. "Trim if really over": at ±0.3 ms noise on a load-100 machine, with a Δ that
tracks the ring's screen cover and a bench that cannot see the round's one per-pixel addition, nothing in the fragment
was trimmed blind. The candidates, to be measured on a quiet machine: a far-row LOD of the vista fragment (the finest
four of its twelve triplanar tiles are sub-texel beyond 1.2 km), the triplanar → dominant-plane collapse on faces within
25° of level, and taking the M-normal swap's two uploads out with a spare sampler unit on a fifteen-sampler program.

**Receipts (round 72b).** `horizonRelief.selftest` (the composed normal's vec2 law, the far range's rows / deck cap /
determinism / envelope / needle bound / sea sector on the ranged model, every map's authored rows bent along their
crests at three seeds — Polders at its margin, 22 against 21.6, untouched by the wander and the crest lift by design),
`horizonResources` (re-pinned with dated notes: the ranged noise budget 216,431 → 235,239 for the lean sample, the
aggregate and Polders digests; the seam law — the seam row's radial gradient under each map's ceiling — is what set the
band's t^1.6 weight), `titanGorgeHorizon`, `redrockCanyonHorizon`, `copperQuarrySurface` (digests re-pinned by
`tools/receipt-repin.mjs`), `terrainMaterialOwnership` (v41, the ten-sampler budget, a seventeenth refused, the atlas
read through `uNrmM`, the shared uniform object), `terrainResources` (ten owned textures), `wallSkyLight` and
`terrainWornDirt` (v41), the sandbox receipts `terrainStreaming` / `terrainWetLayer` / `terrainSplatFields`,
`badlandsRelief` (the round-72 projection chain), `horizonCloudShade`, `volumetricClouds` (the post constants),
`horizonAutumnGround`, `autumnHorizonSeam`, `mapQuality`, `horizonMesaSurface`, `horizonNoiseSampling`,
`horizonDetailAtlas`, `horizonMesaTexture`, `horizonRockfield`, `railCutting`, `battleAtmosphereRuntime`,
`playableRelief`, `redrockMaterial`, `mapCatalog`, `edgeWater`, `skyHorizonCache` green; `npm run typecheck` (the
native tsc and the core unused-symbol check). Probes under `$SP/r72/` (`ridge-probe.mjs`: per-row height statistics
of a ring — the crest-line finding; `bent-probe.mjs`: the receipt's crest-relief count per map and seed), the sampler /
shader-error probe and the sun-side / shadow-side tool under `.qa-dev/`.

**Honest weak list (round 72b).** The far range is the weakest element still: rounded white massifs with one serration
octave — plausible distant snow ranges on Alpine and Fjord, but smooth-faced and without rock, and on the low-deck maps
(Whiteout, Frosthollow, Blackglass, Polders) hidden under the stratus but for the passes; a proper far range wants its
own atlas (rock breaks, snow line, shadowed couloirs) and more rows than six. Under an overcast (Whiteout, Frosthollow)
the near band's snow is still the sky's white (round 44) — the occlusion and the gullies are what read, and the
sun-side / shadow-side ratio there is the sky's, not the sun's. The terrain band between the playable edge and the
first ridge is a smooth snow apron on the polar maps (its relief fades in over the first 60 m by the seam law, its
slope is 9°), and the treeline sits on the band's outer edge as a straight belt where the forest is dense. The alpine
massif faces keep a faint radial grain (the fine relief is still elongated 1.7 downslope; at 1.0 the chutes would be
gone with the comb). The polar and alpine characters got the round's eye-check; the other six characters took the same
changes (the lean, the wander, the elongation, the far-range model) and were read only on the sheets. The mobile tier
keeps today's ring (the geometry relief reaches it, the atlas and the far range do not). The M-normal unit swap forces
two extra uniform uploads per pass on the terrain material (measured in the bench, below); a program with a spare unit
would not need them. The perf bench ran on a machine at load 60–90 (another lane's Playwright runs and a release
chain that stopped red at 23:50 — the "chain 94 done" quiet window never came), so its figures are upper bounds and the
base / after pairs are what to read.

### Round 72c — 2026-09-26: the far range as mountains, the forest as the cost, the grain and the apron

**Integrator (2026-09-26, on the round-72b sheets):** "this is the pass that reads" — Whiteout 7.5, Alpine 8, Fjord 7.5,
Winter 7; one more pass on the same branch: the far range's meringue domes, Whiteout's ring over the +0.6 ms line, the
faint radial grain on the alpine faces, the flat apron with its straight treeline belt, and `checkShaderErrors` armed
in every capture tool from now on (it is: the capture tool, the sampler probe and the ring bench).

**1. The far range as mountains (`horizonFarRange.ts`).** The far annulus's shading moved from the vertex to the
fragment: the vertex keeps the geometric normal and four scalars (the altitude fraction, the row's haze, the rib
term, the sea weight) in two attributes, and the fragment carries the near ring's slope-and-altitude law on a
per-fragment normal — three taps of the detail tile with their contrast stretched (its values sit near the middle):
the masses (110 m), the grain (30 m) and a striation field read in the ring's own frame (the arc as an integer tile
count around, so the seam column closes; the world height stretched five times: 12 m across, 60 m down a face). The
six-row mesh carries a face at a slope of 0.10–0.16 (1 − n.y) where the near ring's faces stand at 0.2–0.4, so the
striations, not the geometry, make the faces: they tilt the normal about the face's horizontal tangent (every rib has
a lit flank and a shadowed one), rock stands on the tilted slope past the snow-hold angle and on the ribs (|striation|
on the faces, weighted up the mountain), snow above the snowline on the gentler tilted slope, the upper fifth of the
crests wind-scoured toward rock, the sun and the hemispherical sky light the tilted normal, and the row's haze pulls
toward a bluer, lighter fog (× (0.94, 0.98, 1.06)) by distance — never gone. Three taps, no relief atlas, still one
draw. The first version (the fields at the tile's own contrast, the rock law at the near ring's thresholds) drew the
same white domes: the tile's values barely leave 0.5 and a far face never reaches the near ring's slope — the crop
said so before the numbers did.

**2. Perf — the forest was the cost.** The trims the eye-check listed were done — the vista tiles' far LOD
(`horizonVista.ts` `vTile`: inside 880 m of the camera every tile is the three-plane world projection; past 1 km it
is two fetches, the horizontal plane at its weight and, for the vertical share, one cylindrical plane in the ring's
frame — the arc as an integer tile count around so the seam closes — with a 120 m blend; the two finest noise fields,
45 m knobs and 12 m grain, are dropped past it: twenty-seven fetches become fifteen on the far rows) and the cheaper
far-range shading (three taps, above) — and the working-tree bench moved by nothing (1.534 / 1.885 ms against 1.516 /
1.919). The clone bench with `--hide=horizon-forest` (new) found the cost: Whiteout's ring is 0.27 ms at sky-w without
its trees and 1.5 ms with them — 6000 band spruces, 534 k triangles, the polar forest round 72 gave a map whose rolling
ring had NO ring forest (the base's twenty draws are the rockfield's proxies; its forest instance count is 0). The
vista fragment was never the problem; the round-72 ring without its forest is at parity with the base ring (0.27 against
0.33–0.54 at the same load — the noise floor of this bench at load 50–90 is ±0.2 ms). The trim, then, is the forest:
the polar character keeps 3000 instances (was 8000), clumped by the relief and, on the bank at the rim where the
ranges' field is still fading in, by the 140 m and 600 m fields (a belt along the seam row was the tell).

**3. Grain (`horizonRelief.ts`).** A second warp octave at a third of the warp wavelength whose features run 35° off
the radial — the angle is sheared by the radius (θ + r · tan 35° / 1 km) on the circle embedding, so the field closes
around the ring and its bands lie oblique to the downslope stretch; the fine crests are bent across it and the comb
breaks into chevrons. Alpine's fine elongation 1.7 → 1.4. Checked in the 4 × crop of Alpine centre-far and its atlas
gradient channel: the gradient bands run oblique now, at changing angles, where round 72b's ran down the face in
parallel.

**4. Apron and treeline.** The polar character's bake carries wind drifts on the gentle faces (`driftM` 0.9 m: sastrugi
ridges along one world wind so they align at every azimuth, 26 m apart across it and 120 m long, a sharp lee crest over
a long stoss slope, undamped by the talus fan — a drift is what a snow apron carries — gone on the steep faces), read
through the atlas normal by the terrain bands. The ring forest's stands follow the coarse relief (`reliefAt`: clumps
in the gullies and hollows, gaps on the scoured crests and shoulders) and on a snow map the band's treeline wanders by
it (the hollows carry it out to the ridge row, the crests pull it back 100 m) thinning over its last 90 m; the bank at
the rim clumps by the detail fields (above).

**5. Rebase.** `sky/cloudscape-r71` is still `81092cc5f` (its reflog shows only the amends that made it); the branch's
base is unchanged, so there was nothing to rebase onto.

**Perf, attributed (round 72c; the clone bench, working tree, load 48–90 — the pairs within a run are comparable,
the run-to-run noise is ±0.2 ms).** Whiteout, ring GPU ms per ring (Δ / 40 of the ×41 clone frame):

| Configuration | sky-w | centre-far | Forest instances / triangles |
|---|---|---|---|
| Round-71 base (rolling ring, no ring forest) | 0.543 (0.333 two minutes later) | 1.136 | 0 / 0 |
| Round-72b tip 539408e98 (polar ladder + 6000-spruce forest) | 1.516 | 1.919 | 6000 / 534 k |
| + vista far LOD + far-range fragment (no forest change) | 1.534 | 1.885 | 6000 / 534 k |
| the same with `--hide=horizon-forest` | **0.268** | **1.382** | hidden |
| polar forest 3000, relief-clumped | 1.170 | 1.797 | 2250 / 219 k |
| polar forest 1600, relief- and field-clumped (this tip) | **0.931** | **1.480** | 1200 / 117 k |

Against the base: **+0.39 (or +0.60 against the base's lower reading) at sky-w, +0.34 at centre-far** — under the line
at both views on this machine at load 58. The post-chain pair (`$SP/r72/run-bench-quiet.sh`: `== chain 94 done` at
04:16, load 16.7 then; the probe mutex — shared with the chain's post suite — freed at 04:25 and the load had climbed
back to 40 by the first round and 76 by the last, so this is NOT a load-under-18 measurement; base and this tip
back to back, two passes of four rounds each, tip d0fe2ca0d):

| Pass | Base sky-w | After sky-w | Δ | Base centre-far | After centre-far | Δ |
|---|---|---|---|---|---|---|
| 1 (load ~40) | 0.509 | 1.080 | +0.57 | 1.120 | 1.507 | +0.39 |
| 2 (load ~60–76) | 0.515 | 0.978 | +0.46 | 1.088 | 1.620 | +0.53 |
| mean | 0.512 | 1.029 | **+0.52** | 1.104 | 1.564 | **+0.46** |

Under +0.6 at both views on the pair means, with pass 1's sky-w at +0.57 — at the line, not comfortably under it: a
second trim (the near class's shadow-casting rich models on the polar band, or 1200 → 900 instances) is the next lever
if the quiet machine reads it over. CPU per ring 0.13–0.16 against the base's 0.07–0.16; draws 16 against 20. What the attribution says: the ring's own vista and terrain
bands are at parity with the base (0.27 against 0.33–0.54 at sky-w); everything over the line was the forest, and the
forest is the polar map's own richness — 1200 clumped spruces at the rim instead of 6000 in a belt is the trade this
pass makes for the +0.6 ms. CPU per ring 0.12–0.16 ms (the two forced uniform uploads of the M-normal swap are in
that; the base is 0.04–0.08); draws 16 (base 20 — the trimmed forest has fewer species meshes).

**Measured (round 72c; the four named maps, sky-w / centre-far, round-72b tip → this tip, the same fixed views and
masks).** The ring metrics barely move — the pass changed the far range's colour, the forest's count and the bake's
fine relief, none of which the ridge or cover metrics read — and that is the point: the silhouettes and the ranges are
round 72b's, what changed is inside them. Whiteout sky-w: cover 17.9 → 17.9 %, ridge contrast 24.3 → 23.0, crisp 44 →
45 %, detail 12.5 → 12.0; centre-far 17.5 → 17.8 / 28 → 32 % / 10.4 → 9.7. Glacier Pass sky-w: 30.4 → 26.3 (near 41.4 →
37.0), crisp 60 → 48 %, detail 13.5 → 13.6; centre-far 19.0 → 19.5 / 32 → 34 % / 12.6 → 12.5. Nordhavn sky-w 62.9 → 62.7,
centre-far 77.8 → 78.3. Frosthollow sky-w 28.3 → 30.1 / 43 → 45 % / 14.2 → 14.5; centre-far 38.1 → 38.5 / 59 → 56 % /
13.4 → 13.3. Glacier Pass's outer ridge contrast falls 4 points because the far range behind its crests is no longer
one white tone (the outer skyline is the far range's edge against the sky where it stands above the ring).

**Eye check (round 72c, `$SP/r72/review/crops/`).** Alpine sky-w, the far range: the massifs carry striations with lit
and shadowed flanks, rock ribs through the snow on their faces and scoured crests — mountains behind mountains, bluer
and lighter than the ring's ranges; the domes are gone. Whiteout sky-w: the spruce belt along the bank is clumps with
gaps, the ridge faces as in 72b. Frosthollow: the massif's face and the far range read the same way. Nordhavn: the far
range is a hazed grey-green ridge line behind the spires (a forest map: rock on the faces, no snow). The 4 × grain crop
of Alpine centre-far: the striations run oblique and cross, the atlas gradient's bands lie at changing angles where
round 72b's ran parallel down the face.

**Receipts (round 72c).** `horizonRelief` (the far range's ranged model, the composed normal's vec2 law, every map's
authored rows bent at three seeds — the second warp octave and the drifts are bake-side, the geometry budget is
unchanged), `horizonResources` (re-pinned with the dated note: the vista's fetch sites 6 → 8 for the far-LOD function,
its distance key and its two-fetch far form pinned; the VTRI call count stays 13), `titanGorgeHorizon`,
`redrockCanyonHorizon`, `copperQuarrySurface` (unchanged — no geometry moved), `terrainMaterialOwnership`,
`terrainResources`, `wallSkyLight`, `terrainWornDirt`, the sandbox receipts, `badlandsRelief`, `horizonCloudShade`,
`volumetricClouds`, `horizonAutumnGround`, `autumnHorizonSeam`, `mapQuality`, `horizonMesaSurface`,
`horizonNoiseSampling`, `horizonDetailAtlas`, `horizonMesaTexture`, `horizonRockfield`, `railCutting`,
`battleAtmosphereRuntime`, `playableRelief`, `redrockMaterial`, `mapCatalog`, `edgeWater`, `skyHorizonCache` green;
`npm run typecheck`. Tools: the ring bench gained `--hide=<name>` and the forest instance / triangle count, and the
shader-error check is armed in the capture tool, the sampler probe and the bench.

**Honest weak list (round 72c).** The far range's ribs and striations come from one detail tile stretched down the
faces — plausible at 2–3 km, a pattern up close (it is never seen up close); its geometry is still six rows, so its
silhouettes are the massifs' and their serrations, not peaks. The polar forest is 1200 spruces where round 72 had
6000: the rim on Whiteout and Frosthollow is sparser than it was for a day (the bench said the trees were the whole
perf item; the belt they made was the eye-check's). The drifts on the polar apron are in the atlas at 0.9 m and read
at the band's foot from the sky-w views only where the bank does not hide the apron (from the map's floor the apron
is mostly behind its own bank). The alpine faces keep a faint oblique grain at elongation 1.4 (crossed now, not
radial). The quiet-window perf numbers are the ones to trust; the working-tree bench at load 48–90 has a ±0.2 ms
floor. Mobile keeps today's ring.

#### What "AAA / World of Tanks level" means here

World of Tanks surrounds every 1 km playable square with a 32 × 32 km "Outland": the same heightfield, the same eight
shared terrain tiles and the same decal/road/river generators run past the red line, so the border is a rule, not a
place where the world changes. Its ranges are lit per pixel with slope- and altitude-layered materials, cliffs
triplanar-projected, ambient occlusion baked from the heightfield, aerial perspective shared between ground and sky
(shaded faces go blue, lit faces keep their colour, a mountain is never paler than the sky behind it), forests as
impostors in the same species palette with a tree line, and 2–3 cascades to the horizon. Our acceptance criteria are
the fifteen ground-level checks below, judged from the player's height at the same camera/seed/tier before and after
every change (the view set of `tools/map-view-probe-views.mjs`, shot by `tools/map-view-probe.mjs` — round 48
committed the `.qa-dev/wall-probe.mjs` the rounds used: corner, along-rim, outside-looking-in, first-ridge wall,
centre skylines, low edge and bird / oblique shore views):

| # | Check | Pass | Fail |
|---|---|---|---|
| 1 | Cross the red line by eye at five places | Same tiles, relief style and decals at least one chunk past the line | Texture family changes, relief flattens |
| 2 | Roads, rivers, fences, tree lines at the border | Continue and vanish by perspective or haze | Cut at a straight line |
| 3 | Near-ring slope shading | Lit and shaded faces differ; cliff, talus and grass bands follow slope and altitude | One colour per hill |
| 4 | Mid-range contrast | Shaded faces bluer, lit faces keep local colour | Uniform wash (round 42: sky light on shaded steep faces — Caldera 3 % → 8 % of sky, Skybridge, Verdant bluer) |
| 5 | Horizon band | Terrain slightly darker than the sky behind it; no line | Bright line, hue mismatch |
| 6 | Sun-relative haze | Brighter toward the sun, cooler away | Same haze everywhere |
| 7 | Flat far ground in motion | No moiré or shimmer | Moiré carpet |
| 8 | Tiling at 30–200 m | No visible repeat | Grid of repeats (round 43: the dune ripples' local wind field — desert mid-field strongest-band share 0.54 → 0.22, anisotropy 2.8 → 1.1) |
| 9 | Tree / impostor swap | No pop; species and lighting match | Popping, mis-lit cards |
| 10 | Tree line vs border | Density gradient continues | Wall or abrupt end |
| 11 | Shadows | Shadow colour = sky ambient; soft edges | Black or grey mismatch (round 42: steep faces turned from the sun carry the sky's colour; flat shadowed ground still the hemisphere preset) |
| 12 | Props | Seated, decal underneath | Floating |
| 13 | Water at the edge | Same level and shader beyond | Plane ends (round 40: derived openings, terrain-material marine faces, sheet apron — coastal/saltwind continuous) |
| 14 | Haze gradient | Smooth in 8-bit | Banding |
| 15 | Ring vs playable palette | Same tiles and season | Ring reads as another biome (round 45: Monsoon's bare mound and Fjord's plaster cliffs were the terrain's own steep-slope layer authored wrong — a layer-flag probe found both) |

#### Where the maps fell short at the start of round 35 (captures on d0cbb9fcd)

- **Bare ring walls on the landform maps (checks 1, 3, 15).** Past the playable square the terrain material's
  landform channel is its clamped edge texel, so on Redrock, Titan, Skybridge, Caldera, the desert and Mars a steep
  ring face carried the SAND slip-face path — a dark, ripple-striated, bare wall — instead of the bedded rock the same
  slope carries inside the square. Round 32's moiré rule then treated every face past 40 m as far ground, which
  blurred the detail albedo and normals of the walls that were rock.
- **Far ranges as one tone (checks 3, 4).** The vista fragment's beds were one noise tile with parallel lines, no
  ledges, seams, gullies, talus or cavity shading, so a shaded range read as a flat brown sheet at 700 m.
- **Rock colour switches at the seam (check 15).** The ring's rock and scree tints came from the authored hill rock,
  not from the battlefield's own rock layer.
- **Geography changes at the seam (check 1).** The heightfield clamps at ±512 m and the ring's own ridged relief
  starts one row past the seated skirt; the splat mask fades to open ground 36 m out; props stop at ±430 m; the litter
  is a ±40 m camera ring; the rockfield serves only rock and sand maps and the ring forest only wooded rims.
- **Aerial perspective is a fog mix (checks 4–6).** One haze strength per map, the same in every direction; far
  mesas read paler than the sky behind them; shaded and lit faces fade at the same rate.
- **No ring self-shadow or sky-driven ambient (checks 3, 11).** Ranges are lit analytically by sun and a constant
  sky term; nothing occludes.
- **Detail tiling (check 8).** Ground layers use a rotation-blend mask, not hex tiling; anisotropic filtering and mip
  bias are per-layer knobs without a measured policy.

#### Rounds

| Round | Scope | Verified by |
|---|---|---|
| 35 (this) | Landform gate follows ring slope outside the square; far-ground rule gated to flat floors; vista walls v1 (faulted beds and laminae, shelves and seams, gullies, talus aprons, varnish and bleached shelves, moss on rolling ledges, cavity shading, slower macro fade); ring rock/scree tints from the terrain rock layer | wall-probe A/B on badlands, copper_mesa, verdant, alpine, desert, titan_gorge, caldera, skybridge, mars; 31-map skyline/border audit sheets |
| 36 (landed: geology) | Border geography: the map's own base height past ±512 m seats the foothill rows and blends into the authored relief by distance (done); splat continuity by the same slope/height rules (the landform gate, round 35; the rest open); decor continuity (trees, boulders, tufts thinning past the edge; prop bound toward the red line) and the water plane into the ring remain open | wall-probe sheets on six maps; 31-map edge audit |
| 37 (landed: elevation-aware target) | The post aerial pass's scatter-in target now follows the sky's sampled elevation falloff so far land converges toward the sky it is seen against (the horizon-haze target was the check-5 cause); the desert sky gains Rayleigh. Open: the arid ridge tops in thin air, a multi-row sky elevation profile, and folding the vista's own haze into the aerial pass | skyline metric before/after on eight maps (table above) |
| 38 | Anti-tiling: hex-tiled detail albedo/normal layers, detail normals fade to flat with distance, anisotropic filtering with a measured mip-bias policy | 30–200 m tiling sheets, moiré-in-motion clips |
| 39 (landed: Redrock basin, haze ceilings) | Redrock's mouths closed by a headwall with the flanks' profile; the far-haze stack capped so ranges keep a third of their own colour. Deferred to a later round: a second far cascade with a macro colour map, per-vertex horizon occlusion baked at build, sky-projected ambient driving haze colour and water reflection | wall-probe sheets on badlands; far-range A/B on five maps |
| 40 (landed: water past the square) | Derived sea openings from the edge water scan, the ring's marine faces rendered by the terrain material's own sea path, the sheet's apron fan, Saltwind's bay as one contour open to the sea. Decal clipmap rings move to a later round. | straight-down seam metric (`sea-*-down`), oblique before/after |
| 42 | Sky light on shaded steep faces: the terrain material adds the horizon sky colour (the sky probe's fog colour) to faces steeper than ~28° that turn away from the sun, through the indirect-diffuse path, weighted by slope and by how far the face turns; lit faces and flat ground untouched | Caldera's inner east wall 6.6 → 16.7 display luma against a 216 sky (3.1 % → 7.7 %), Skybridge's shaded slope 21 → 35, Verdant's shaded snow hill 53 → 64 and bluer, Mars ±1, Badlands' lit walls and Steppe's far ground unchanged (checks 4, 11) |
| 43 | Local wind field for the dune ripples: the authored wind swings ±25° per ~400 m cell and ±10° per ~90 m cell, the wavelength stretches ±25 % per ~250 m cell, and the far bedform albedo band eases to half past 320 m — every ripple and bedform wave in the sand branch follows it | Desert w-wall-mid mid-field: strongest periodic band 0.54 → 0.22 of the spectrum's top 1 %, anisotropy 2.81 → 1.06, texture energy 18.0 → 18.0; bird view anisotropy 2.5 → 1.2; Oasis w-wall-mid 0.76 → 0.61; near-field grain unchanged (0.67 → 0.62) (check 8) |
| 45 | Steep-slope layer authoring: a per-map slope grass hold in the terrain shader (Monsoon 0.10) and Monsoon's steep layer re-authored as dark wet grass; Fjord's sourced rock tint 1.12–1.22 → 0.60–0.74 | Monsoon SW mound display luma 95 → 67, hue 33° → 64° (forest floor 66°); Fjord corner cliff 100 → 57 at sat 0.26; identified with a layer-flag probe that recompiles the splat material with one flat colour per layer (checks 3, 15) |
| 46 | Reactive water (water pass 8): a world-anchored GPU shallow-water field (192 m / 512 texels, fixed 1/60 s) carries every hull's wake, track churn and shell splashes; the sheet reads its slope and foam and drops the hull-frame pattern inside the window | Reservoir/Coastal drive captures before/after (a1 vs b8): hull-frame slab → V wake with crests, a churn trail that stays on the path, rings from a stopped hull; receipts waterRipples + shallowWater + 101-receipt source sweep |
| 47 | Ground palettes on the arid and ruined maps: deliberate sourced rows for the four Verdant fall-through maps (Titan/Skybridge keep their sandstone strata, Ruinspires grey, Blackglass the Caldera lift recipe), Skybridge/Titan/Mars macro-tint and strata lifts, desert hemi 0.20 → 0.28 | Titan canyon-in shaded knoll 47 → 93 and wall hue 337° → 7°; Skybridge 35 → 56; Ruinspires corner 40 → 67; Mars strata 97 → 116; desert true shade +8..11 % with lit sand +0.1..0.6 %; the tintB lever measured dead (+0.02..0.11) and the desert/Oasis contour bands identified by the layer-flag probe as the D mask on steep sand faces, unmoved by fill (+2..4 %) — a shader item (checks 3, 8, 15) |
| 47 | Mesa ring stack and arid skies: a nine-row mesa ladder (bench with buttes, near tables, a real valley floor, far escarpment, saddle, summits, shoulder; correlated pediment / plateau rows, 2.5:1 radial limiter, per-range cap approach 1.25 / 1.80, Redrock on the classic ladder), authored strata and outland rocks on the bland rings, textured altocumulus / cirrus decks on the arid maps, dust decks over the Mars galaxy, explicit low decks on the near-overcast maps, cooler arid haze | geometry probe (skyline shared by three ranges instead of one 55-70 % row; valley 41-74 m under 67-174 m tables on the desert), wall-probe A/B1/B on the eleven maps plus Verdant / Alpine controls (skyline metric: desert w-wall-mid 1.49 → 1.22, Oasis sky-w 1.42 → 1.15, Mars 0.97 → 0.83; controls unchanged) |
| 47b | Shore contours (follow-up): Saltmere Bay one authored crescent with a cut-short far arc, Nordhavn Fjord three arms with peninsula ridges, authored lake bank bands, a coast rim fade on headlands, and the sea sector fully open before a contour's far arc (`seaSectorBlend` 0.5 / 0.85 + 20, key v37) | Plan-view contour plots; A (r47-combined) / B bird-e-high, bird-e-edge-n, shore-e-oblique, edge-e-low, bay-strand-n, bay-from-village, fjord-arm-in, fjord-peninsula; Saltwind A/B for the blend law | see the section |
| 47 | Shorelines past the border: the bay contours rule the outland (rim lift yields to water, baked contour for the terrain material and the sheet apron, per-vertex ring weight, sector opens where each bay's reach ends) | Reservoir-style A/B bird and oblique captures on Coastal, Fjord, Saltwind: the beaches and bay lobes continue past the red line as their own curves; edgeWater/shallowWater/terrain receipts |
| 48 | Probes and metrics as tools: the QA probes that verified rounds 41–47 committed from `.qa-dev/` as `tools/map-view-probe.mjs` (the wall probe; its view table in `tools/map-view-probe-views.mjs`), `tools/terrain-layer-flag-probe.mjs`, `tools/terrain-uniform-iso-probe.mjs`, `tools/world-layer-isolation-probe.mjs`, `tools/salvo-indicator-probe.mjs` and `tools/water-drive-probe.mjs` over one runtime (`tools/map-probe-runtime.mjs`), and the three Python/PIL metrics ported to `tools/map-metrics.mjs` (skyline, stripe, boxes) — see "Probes and metrics as tools" below | `tools/map-probe-runtime.selftest.mjs` (arguments, the pinned 31-view table, pose math, the mirrored-frame note, `--help` without a network) and `tools/map-metrics.selftest.mjs` (synthetic frames of known luma / wavelength / heading); the Node metrics reproduce the PIL scripts on the round-43 and round-47a frames (skyline and boxes to every printed digit, stripe wavelength within 0.07 %); one map/view per tool re-captured on this tree |
| 48 | Frosthollow redesign (owner: the Verdant clone maps): a Carpathian valley — ten-pond frozen river, terrace street village with a sawmill yard, two-armed ridge and saddle pass with a switchback, moraine flank, seven authored roads, new strongpoints, walls, belts, clearings, pads; the round-44 snow albedo / exposure re-grade | wall-probe A/B (six brief views + village-street, river-crossing, pass-switchback): skyline sky-w 0.94 → 0.88, sky-s 0.92 → 0.84, snow median 208 → 198; layout scan (pads, beats, candidates, pole stations, pond lips); mapQuality + road + winterLakeGeometry receipts, recaptured collision shard |
| 48 | Amberford redesign: a Norman / English river-ford market town replaces the Verdant clone — SW→NE river in a sculpted valley (hillScale 0.8, eleven cut/fill landforms under one graded water plane), a stone bridge and a ford as the only crossings (avoid-liquid bots), five authored lanes, the walled town on the north-bank rise, orchards and hedgerows, the escarpment woods, the manor park and lake, weir and water mill in the river kit, re-baked tactical plate | wall-probe A/B on bird/centre/sky views plus five authored gameplay-height views (bridge, ford, square, mill, valley) and two close bridge views; constraint check (0 wet gaps, banks ≤ 1.44 m, both crossings dry, pads minNy 0.85–0.97); skyline metric unchanged (sky-w 0.84 → 0.90, bird-n 0.98 → 0.98); liquidMarshSurface worst bank 0.42; matchPlacement dry routes in all modes |
| 48 | Tarkhan Steppe redesign: a new battlefield under the kept palette — takyr-floored braided wadi across the middle, 12 m escarpment with two ramps and a kurgan line on its crest, grain station (SE), kolkhoz and corrals (W), salt pan (NW), caravanserai rise, five authored roads, shelterbelts instead of groves, three graded aprons for the objective placement, recaptured collision shard | headless layout probe (bed −4.3 m, crest 16–18 m, mounds +5..8 m, pads relief ≤ 5.8 m, both-team reach on every row); wall-probe A/B (centre-far skyline 0.99 → 0.92, kurgan-line band 181 → 164 luma, plateau-south 161 → 134; sky-w unchanged 0.87 → 0.89); 38 receipts green, two shared digests moved for the integrator |
| 48 | Landing (2026-09-24): Amberford's and Tarkhan's dedicated collision shards recaptured on the combined tree (the lane left the round-1 Amberford shard; census receipts pin counts only), bot relocation cells on holdable ground + flank rings scored for reach + a closed penetration gate held against a stationary target starts the flank, the three redesigned player pads moved 60 / 60 / 120 m down their approaches onto flat-scanned cells | battlePacing 14/124 (from 18; ledger 17 → 16 → 17 → 16 → 14 across the five fixes), dedicatedWorldCollision census, collisionManifestCodec, terrainStreaming spawn windows, garage:terrain:check, spawnClearance / mapQuality / matchPlacement / minimapObjectives, 11 AI receipts, typecheck; chain 70 |
| 50 | The redesigned maps' tactical-map plates (Frosthollow, Tarkhan) and Garage cards (all three: 4K hero + picker thumb) re-rendered from the new battlefields — they still showed the Verdant clones; the round-48 pacing trace committed as `tools/pacing-trace.mjs` | map-art-guards, minimapAssetRuntime / CapturePolicy / Orientation, loadingScreens, landing-media, public-repo-hygiene, attribution; eye check of the 1280 px reductions; chain 71 |
| 51 | Home showcase frames of the redesigned maps: the eight orphaned `public/media/home` frames, thirteen `presentation-r1` frames (five owner picks on the home rail / maps section / featured gallery / docs page, eight archive frames) and the five Frosthollow studio-loop keyframes re-rendered from the round-48 battlefields; every recipe on the three maps re-staged in its generator (ponds, terrace village street and crossroads, orchard rows, the coach road under the town, stone bridge, ford, open steppe, highway belts, kurgan crest); `publish-presentation-r1.mjs --match` subset mode | eye check of 1280 px reductions after seven preview rounds against the review's lens rule (nothing within ~8 m of the glass but a deliberate hull); campaign image metrics 26 / 26; landing-media, feature-evidence, hero-rails, loadingScreens, socialProof, showcase-library, public-repo-hygiene, attribution — no digest moved |
| 52 | Saltwind Narrows' strand 12 → 20 m (owner decision 20): a pale beach now separates the bay from the grass along the whole shore; boat landings kept (beachedBoat / riverLandings unchanged) | map-view-probe A/B (bird-w-edge, shore-w-oblique, edge-w-low, w-wall-mid), badlandsRelief slice, shoreDirtMask / mangroveWaterPalette / villageWear re-pins, 17 shore receipts green; chain 73 |
| 53 | The 4K showcase frames and the studio film of the redesigned maps: the fourteen `showcase-r1` frames of Frosthollow and Tarkhan (the landing hero 113, six mosaic tiles, the README's 69 / 84 / 97) regenerated through the campaign pipeline — templates 09 / 11 / 12 re-staged (pond, pass-road descent, crossroads from the crossing road), the generator made to reproduce the published campaign (`HAND_TUNED_ACTION`), a sightline pull-in for long-lens templates and three overridden foreground lenses (`HAND_TUNED_FOREGROUND`); the landing film re-recorded from the checked-in storyboard, its poster and mobile proxy from the publisher | eye check of 1280 px reductions of all fourteen 4K masters, the four contact sheets and four mp4 frames against the lens rule; grade 60 / 60 with 46 rows byte-identical to the Aug-19 report; showcase:publish moved only the fourteen renditions, four sheets and manifests; receipts showcase-r2, battle-campaign, landing-media, feature-evidence, hero-rails, loadingScreens, socialProof, showcase-library, feature-loops, og-images, public-repo-hygiene, attribution |
| 54 | The last showcase media of the redesigned maps: `feature-loops-r1/03_winter_lake_duel`, the `hero-rails-r2` winter / steppe rails with their `web-video-r1` proxies, the `battle-reels-v3` reels 03 / 07 / 18 and `featured/f1_09_winter_lake_duel` regenerated through the repo's pipeline — the recorder's `battle-reels` collection (the library's pinned twenty-reel table, authored stages on the pond necks and the plain south of the wadi) and `--stills` framing mode, `publish-battle-reels.mjs`, subset modes for the rail / loop / featured publishers, rail proxies derived from the published WebM, the steppe rail's opening key moved off the wire-line berm | eye check of 1280 px reductions (four frames + poster per reel and rail, three per proxy, four + poster for the loop, the featured frame) after eight preview rounds against the lens rule; receipts feature-loops, hero-rails, showcase-r2, battle-campaign, landing-media, feature-evidence, loadingScreens, socialProof, showcase-library, battleReels, og-images, public-repo-hygiene, attribution; only the intended manifest rows moved |
| 55 | Titan's fine wavy partings closed: the uniform-isolation probe flattens one layer normal map at a time (and no longer keeps flat normals after its first variant), uNrmR and then the coarse wall-plane R tap named — the bedded sandstone tile's seam notches printed a parting every 0.9–2.8 m of world height in the wall plane; an analytic buttress-and-rib crag replaces that tap on the bedded maps (`uBeddedR`, key v39). Fjord's cone hills: a per-map `outcrops` knob (gneiss knobs and scree through the turf below the treeline, stands opened, `uVOutcrop`, vista key r4). Coast ring tone: the ring forest runs the battlefield's matte canopy response and a mean-centred crown mottle (key `horizon-forest-canopy-v3`); the shore fade tried was pixel-identical and not landed | one-normal-at-a-time and gate-uniform isolation runs on Titan (sw-corner 59.0 % vs 60.4 % all-flat; the coarse tap 49.7 % of the wall box), stripe metric A/B (sw-corner top-1 % 0.535 → 0.734, std 28.5 → 28.3; e-wall 0.734 → 0.770), ground boxes unchanged; fjord boxes (w-wall-mid cone 47 % / mean 4.5, sky-w 37 % / 2.8) and 2× crops; per-side crown boxes on Saltmere's west edge (ring 114° / L 0.305 → 123° / 0.278 against the square's 120° / 0.199); receipts in the section |
| 56 | The strands' wrack line and debris (owner decision 21): a high-water band of weed / kelp mats, bent sticks, pebble patches and shells along every authored shelf (Saltmere, Nordhavn's arm heads, Saltwind), with timber, a broken crate and a rope coil beside each landing — derived from the lake contour by a marched band law (water's edge → sand's end, ≤ 8.5 m, ≥ 2.2 m), lake-phased density, gated off water / banks / roads / pads / boats / jetties / footprints; soft dressing in the vertex-coloured `baked` and `wood` buckets, no new material, instance pool or collision record; the coastal driftwood re-derived onto the same band (it lay on the disc's plain 1.03–1.12 R circle — Nordhavn's 72 logs median 7.7 m up the ridges, nine in the water) | map-view-probe A/B on the round-47 shore views plus three new gameplay-height strand views (`strand-e-low`, `strand-fjord-low`, `strand-w-low`; table 31 → 34), 2× crops, `ab-diff` strand boxes 1.9–3.1 % moved, obliques 0.4–1.4 %, birds ≤ 0.2 %; headless three-seed audit; `strandWrack.selftest` (new), beachedBoat / winterLakeGeometry / riverLandings / map-probe-runtime re-pinned, the shore and world receipts green |
| 57 | The rail spur kit: a map authors a siding as a path (`terrain.railSpurs`, `src/world/railSpurs.ts`), the layout carries it, one span layer lays ballast / rails / sleepers / buffer stops that follow the ground (4 m spans, least-squares plane per slab, cross-slope roll, a deep slab bedded into the folds) and the height field's `_noVeg` berth keeps vegetation and scattered props 3.6 m off the line; the four rail yards migrated onto the same layer byte-identically; Tarkhan's grain station gets its loading-face siding (x 144 → 440 at z −181, buffers at both ends, a level crossing over the east track, ending at the rim foot — the road climbs the rim at 24 %); the stale steppe shard recaptured | rail-part / dressing / draw digests of the four yards A = B at three seeds (railSpurs.selftest pins them); headless slab-corner probe (no gap under any corner, tops ≥ 0.06 m clear); map-view-probe A/B on four new views (yard frame noise ≤ 0.3 %; steppe 1.7–2.6 % moved) judged on 1280 px reductions; census and storage re-pins; battlePacing 14 / 124; the receipts in the section |
| 58 | Jetties at the water's edge (round 56's open item): the coastal kit's jetties and Saltwind's piers planned from the strand march (`src/world/maps/shoreJetty.ts`) — the shore end a metre landward of the wrack band on a flat strand or on the bank where the ground meets the deck, the tip a full span over the planar core, the deck a constant 0.45 m over the water surface (bed + the sheet's 0.72 m), every pile from the bed, sized to the shelf in 4–10 spans (Saltmere 9, Nordhavn's heads 5–7, Saltwind's authored 10); a gangway where the deck stands over the sand, a clinker hull moored alongside with bollards and lines; the kit burns the retired jetty's draws so every other boat, log and buoy keeps its place | map-view-probe A/B on the shore views plus four new jetty views from the shallows (table 38 → 42), 2× crops; `shoreJetty.selftest` (321 plans over nine fields); A/B receipt probe (7/7 boats, 41/41 + 15/15 logs, Saltwind's wrack byte-identical); riverLandings / beachedBoat / winterLakeGeometry / map-probe-runtime re-pinned; 28 world receipts and the typecheck green; no shard moved |
| 60 | The last bot against a passive target (server/battlePacing 14/124): nine capped battles ended with empty racks after the survivor fought the idle host from 165–300 m and the tier's vertical error flew the shells over the turret or short into the ground; a target that has held still and stayed silent for the passive dwell, and that this bot's shells have stopped penetrating, is pressed after the deployment window to a 70 m side aspect (scoot legs, the low-health fallback, the settle holds and the flank ring yield; the press ends the moment the target moves or fires); the weak-spot probe scores only zones the gun can reach (world ray from the gun, elevation / depression arc, turret fallback); press points need a gun-to-hull lane and are vetoed when masked, gate-closed or gun-pinned; a closed-gate flank carries on to the rear; an overturned bot self-rights | full receipt after every change: 14 → 11 → 5 → 5 → 5 / 124 (median 465.5 s, p10 290.1 s, no sub-two-minute battle); ai.selftest [14]–[17] (press vs. an active-target control, sniper cadence, self-right, masked-zone probe), botGunLane (fixture berm 2.4 m), authoritativeBots (moving-battle ceiling 0.70), the AI / sim / net receipts in the section, typecheck, attribution |
| 59 | Performance audit after the map rounds: every battlefield measured on main and at deploy 66 (main → base → main → base per map, the load beside every wall-clock number, counts / programs / bytes decisive) — Tarkhan Steppe's world build 2.5–2.7× its baseline: the field-trench plan re-planned on every height query of a dry-marsh map (a latent 2026-09-17 trap the takyr crusts walked into), now cached with byte-identical heights, 9.5 → 3.8 s beside the base's 3.5; Frosthollow +30 % triangles at the chase pose (the redesign's stands at the deployment, frame time unchanged) and Amberford +4 % recorded as design costs; every other map within 6 % of deploy 66, textures within 0.4 MB, programs 194–213, worst-frame calls ≤ 899 | `tools/tmp-r59-map-perf-probe.mjs` (124 main / base runs, the re-run pairs, the main / base / fixed triple), `node --cpu-prof` attribution, height / plan hashes, `roadLookupGrid` declared delta, the terrain / trench / relief / vegetation / perfprobe receipts, typecheck, hygiene, attribution; summary `docs/references/perf/round59-map-perf-audit.json` |
| 61 | Amberford's bridge over the river (round 48's open item): a marsh station authored `crossing: 'bridge'` resolves a level deck plane over the water (terrain.ts, published as `heightField.bridgeDecks` — the span from the river's own wet reach, the deck 2.4 m over the water surface, 7 % approaches; the road plane and the 14–18 m dry band exempted under the span, the bed the river bed, the deck stone); the river kit builds an extruded three-arch body, cutwaters, abutments, wing walls, a level flagged slab and parapets from it and publishes the compound record the ride stands on; the navigation grid routes the crossing's cells through the road axis (deck cells dry at deck height) and the liquid safety reads a deck as dry; the capture tool's `--headless` mode; the shard recaptured on the lane tree (the round-48 shard was stale; census 5873 / 5727 / 5822); the plate re-baked | map-view-probe A/B on bird-n / bird-w and two new round-61 views (bridge-bank-low: three arcs over continuous water with the far bank through each opening, cutwaters, abutments on the banks; bridge-deck-low: a level flagged deck between parapets, flush with both approaches; A: the causeway wall with box recesses on dry gravel); route proof over the deck axis and the ford; structure-support probe (the deck the floor at 2.795 m across the span, the river past the parapet line); battlePacing full 14/124, Amberford 0/4; minimap crops before/after; receipts in the section |
| 62 | The search for a lost enemy and the empty rack (server/battlePacing 5/124 after round 60): the survivor's 8 s no-contact search re-routed every window to a midpoint inside the blocks (Urban 0 / 2, Ruinspires 3) — search legs are now planned over the match's navigation grid through `deps.planRoute` (both authorities), goals rotate (sector, a sighting under 45 s, objective, a sweep ring whose bearing turns each leg, a wider ring), an unreachable goal is skipped, a leg is given up only on its own evidence, a dead target's sighting is forgotten; the rack is finite (Steppe 1, Saltwind 0): the HE fallback fires only a real HE round whose surface burst is worth a shell, laid on the zone that priced it, the penetration gate's ratio answers the lay error (1.0 at 80 m → 1.15 at 320 m), a lay under the expected-hit-chance bar (tier σ + dispersion vs the silhouette, rising as the rack empties) is closed on rather than taken at a bot or passive target (a live player is fired on as before), an empty rack rams only when the ram law makes it survivable and otherwise retires | full receipt after every change (ledger in the section): 5 → 0 → 0 → 1 → 0 → 1 → 0 → 0 / 124, median 465.5 → 351.4 s, p10 290.1 → 258.8 s, no battle over 720 s, no map longer than its round-60 aggregate but Orchard (+4 s); the 15 s passive dwell measured and kept, the 0.25 conservation threshold measured and dropped; ai.selftest [18]–[21] (planned search legs with and without a planner, no round at an unpenetrable front HE included, the long-range hold and close vs. a live-player control, the empty rack's ram and retirement), the AI / sim / net receipts in the section, typecheck, attribution |
| 63 | Tarkhan's railway cutting and the bridge's open arches: a spur authors `cutting: { from }` (`railSpurs.ts`) — a 2.4 % bed from the portal, an 8 m floor between 0.7:1 batter faces, dug last on final queries, the exclusion on floor/cess/faces; the siding runs to the map edge (`bufferStop: 'start'`); past the edge the notch opens into a valley along the radial and the height field publishes an outland seat weight the horizon ring seats its near rows on (every other ring byte-identical) with the ring forest off the right-of-way; Amberford's bridge record split into 31 parts that follow the geometry (deck from the crown line, abutments, piers, four vault bands per arch, parapets) so shells pass the openings and the deck stays the floor; both shards recaptured (steppe byte-identical) | headless A/B of the height field (103 corridor samples, 0 road nodes), the outland and the ring rows; map-view-probe A/B on three new cutting views (station 71.7 %, edge 86.8 %, exit bird 84.5 % of the world band moved; the bridge views frame noise); shell traces through every arch at eight heights A/B and the hull-underpass / support probe; battlePacing full 14/124 (Tarkhan 1/4, Amberford 0/4); receipts in the section |
| 65 | A physically based atmosphere for every battlefield: Hillaire 2020 transmittance / multiple-scattering / sky-view LUTs as fragment passes with a summary readback (`engine/atmosphere.ts`), the desktop dome sampling the sky-view LUT with the sun disc through its transmittance (the legacy disc energy kept: PMREM folds it into the ground's fill), the round-22 night sky and Mars' galaxy on top, the aerial pass targeting the LUT along each view ray (round 37 per pixel), the hemisphere hue from the sky irradiance, the preset → parameter mapping calibrated against the legacy dome on the twelve good maps; Mars authors its thin CO2 sky; the Preetham path kept for the mobile tier | CPU twin vs GPU summary 0.2 %; map-view-probe A/B on 31 maps × 4 views with sky boxes and the skyline metric (good-map anti-solar bands within 10 % on seven, skylines ±0.05; arid check 5 desert 1.49 → 1.18, skybridge 1.66 → 0.94; winter 0.85 / 0.90, whiteout unchanged); eye check of the 1280 px reductions of the eleven bland and four good maps; perf counts identical (+7 programs); the receipts in the section |
| 67 | The open notes of rounds 58–63 closed, one commit each: Tarkhan's spur runs on down the valley to a derived tunnel portal (headwall 125 m out on the radial, a 75 m gallery to the ring's first ridge line — rim + 200 m, the same constant in horizon.ts and railSpurs.ts — a dark 45° bore floor hiding the ring face, one `tunnel-portal` record across the floor; the ring's seated rows now exactly on the outland bed inside the corridor); the batter faces seed sparse grass and scrub on their upper two thirds through a `_batterSeedAt` height-field hook (the exclusion keeps trees and props off; a face candidate passes the 474 m rim cull); the bridge's vault bands halved to 0.1375 m (a shell's height error against the arc ≤ 6.9 cm; 31 → 55 parts, Amberford's shard recaptured); the moored hull bobs and sways render-side from the world clock (one mesh per hull, matrices composed under the frozen world); Saltwind's piers sized to the shelf (7 / 8 spans); the wrack line's per-station draw streams (1,186 pieces byte-identical past a moved keep-out); the press ring's land-only fallback bearings (Polders 2's straight-in press); round 64's plate/hero/thumbnail closed as render noise. Pacing 0/124, median 351.4 s. | Tarkhan `cutting-exit-bird` 29.4 % of the world band moved (the portal, the track, the gallery), `cutting-portal-low` 8.8 %, the batter crops seeded, Saltwind `jetty-w-low` 8.2 %; steppe and autumn shards recaptured headless. |
| 66 | An FFT ocean on every sea, bay and lake sheet (Tessendorf 2001, Horvath 2015): a JONSWAP + TMA directional spectrum per map (`ocean` block on the config: wind, fetch, swell, amplitude, choppiness, foam, breakers, caustics), three cascades in one stacked-tile texture, the inverse FFT as four fragment-shader Stockham passes (radix 16 / 8 per axis) over RGBA32F ping-pong MRT targets — no compute on WebGL2 — writing displacement / derivative / Jacobian-foam maps; the sheet (`shallowWater.ts` v13) displaces its vertices with the long cascade (flattened over the bank, a run-up film at the edge), joins the cascades' slopes to its normal with a footprint fade, whitens by the Jacobian, breaks the crest tops over the bank band and runs the whitewater up the strand (depth-aware from `getWaterDepthAt`'s bed law in the shader), and lights the shelf bed with thin-lens caustics from the finest cascade; the round-46 field composes on top, the terrain material and the marine ring faces untouched; the four approved maps at low amplitude, the flat seas (Saltwind, the polders, Skybridge, Mangrove Reach, the oasis) gain the moving surface; mobile keeps the old sheet, low halves the grid, medium alternates frames | oceanFft.selftest (butterfly vs DFT 1e-14, 8×8 field vs the double sum, spectrum symmetry, pass GLSL, gates, pass sequence, presets, handshake, wiring, eleven sea states); headless GPU read-back vs the CPU reference 2.4·10⁻⁴ m, 215 programs linked, terrain at 16 samplers; map-view-probe 198-pair A/B (far / bird ≤ 2.6 % moved, ≤ 0.7 mean |Δ|), in-water chase A/B (approved maps' water box within ±2 / 255), close-ups with debug channels and term isolation, eye check of 1280 px reductions; transform 0.61–0.77 ms GPU (granular timer, upper bound) / 0.014 ms CPU by the slope method; the receipts in the section |
| 69 | Contact shadows, ground bounce, sun shafts and lens flare on the desktop tier, each behind its own quality lever (`?fx=off` keeps every pinned capture): a twelve-rung screen-space march toward the sun inside the aerial pass, blended into the shadow term through the CSM visibility the lit materials carry in the opaque scene target's alpha (wide occluders only — the grass blades combed the meadows); an analytic energy-conserved ground bounce in the lit materials (the excess of sunlit ground over the hemisphere's ground pole × the lower-hemisphere view factor); Mittring / Sousa rays from a sky mask blurred toward the sun at quarter resolution, coloured by the atmosphere's sun transmittance and gated per map by the preset's haze and sun height; a four-ghost, halo and streak flare with a 24-tap depth occlusion disc, eased; one quarter-res light target the grade adds before its tonemap | headless smoke on four maps (every program links, `?fx=off` exact), on/off crops and region numbers; map-view-probe A/B on 31 maps × 4 views with 1280 px eye checks on eight maps per effect; the round-59 perf probe new → base at the chase pose; receipts in the section |
| 68 | Volumetric clouds over every battlefield: a raymarched slab lit by the round-65 atmosphere (`src/engine/volumetricClouds.ts`, `cloudNoise.ts` bakes in a worker, `cloudPresets.ts` derives each map's layer from its authored sky block — small clustered fair-weather cumulus at 1200–1800 m on the good and bland maps, the overcast five a neutral stratus ceiling that restores their white sky and closes the round-65 open note, Monsoon its blue sky with towering cumulus on the horizon), traced at 1/16 of a half-res history in a 4 × 4 Bayer slot cycle with reprojection, composited premultiplied through a depth-tested dome, hazed by the aerial pass's law toward the uncapped sky-view LUT; cloud shadows from per-cascade alpha-tested gobos on the shadow-only layer (no terrain sampler); one post.ts hook; `?clouds=off` keeps the baked decks | map-view-probe A/B on 31 maps × 4 views with map-metrics skylines (winter 0.84 / 0.87 in the band, whiteout 1.01 → 0.92 / 0.85, monsoon 0.55 / 0.54 as the base) and the sky-band rule (the nine good maps' middle bands within ±11 % of the base, lower within ±3 %); eye check of the 1280-px grids of the overcast five, four good and four bland maps; per-slot trace + resolve 0.28–0.52 ms GPU by repetition; the gobos verified in-page (ground luma −6 % under the cores); volumetricClouds receipt (new) and the receipts in the section  — **reverted to opt-in on 2026-09-25 (owner); the baked decks are the default again** |
| 68 | Volumetric clouds over every battlefield: a raymarched slab lit by the round-65 atmosphere (`src/engine/volumetricClouds.ts`, `cloudNoise.ts` bakes in a worker, `cloudPresets.ts` derives each map's layer from its authored sky block — small clustered fair-weather cumulus at 1200–1800 m on the good and bland maps, the overcast five a neutral stratus ceiling that restores their white sky and closes the round-65 open note, Monsoon its blue sky with towering cumulus on the horizon), traced at 1/16 of a half-res history in a 4 × 4 Bayer slot cycle with reprojection, composited premultiplied through a depth-tested dome, hazed by the aerial pass's law toward the uncapped sky-view LUT; cloud shadows from per-cascade alpha-tested gobos on the shadow-only layer (no terrain sampler); one post.ts hook; `?clouds=off` keeps the baked decks | map-view-probe A/B on 31 maps × 4 views with map-metrics skylines (winter 0.84 / 0.87 in the band, whiteout 1.01 → 0.92 / 0.85, monsoon 0.55 / 0.54 as the base) and the sky-band rule (the nine good maps' middle bands within ±11 % of the base, lower within ±3 %); eye check of the 1280-px grids of the overcast five, four good and four bland maps; per-slot trace + resolve 0.28–0.52 ms GPU by repetition; the gobos verified in-page (ground luma −6 % under the cores); volumetricClouds receipt (new) and the receipts in the section |
| 70 | Whiteout's snow re-grade (owner: yes, 2026-09-25): round 48's tone law never reached the sourced snow — a per-layer `sourcedTint` on the splat settings now grades the photo albedo that renders on both sourced paths; Whiteout's snow × 0.88 neutral-cold, the fallback law stepped alike (0.46 + 0.28·l), postExposure 0.83; winter and the Garage untouched | map-view-probe five views A/B on main with round 68's overcast (sky-w 0.92 → 0.84, sky-s 0.88 → 0.85, inside 0.80–0.90) and on the pre-cloud tree (1.01 → 0.96, 0.95 → 0.91: the physical sky alone leaves the rim band haze-dominated); snow boxes (bird-w 175 → 162, wall hue / saturation unchanged); 1280 px eye check of the five views; sourcedTextures graded-composite contract, sourcedTerrainPreparation parity under a tint; villageWear / mangroveWaterPalette digests re-pinned, the byte receipt's round-47 pin extended and a round-70 projection added; the receipts in the section |
| 71 | The cloudscape pass on the opt-in volumetric layer (owner: round 68 was "just puffs", 5 / 10): a `clouds` block on every map config resolved through eighteen regime rows (`engine/cloudscapes.ts`: fair-weather cumulus, cloud streets, sea streets, towering cumulus, cumulonimbus front, cumulus humilis, lenticular, broken / closed stratocumulus, overcast and low stratus, ice fog, hazy altostratus, dense overcast, ash veil, cirrus, thin ice clouds), a multi-scale weather field with a type channel and a street / anvil / cirrus field in the wind frame, a curl volume and a blue-noise tile (`cloudNoise.ts`), type height profiles, a rigid wind lean, anvils, scud, curl-warped erosion with a per-map wispiness, the Hillaire octaves under a dual-lobe phase with Beer–powder toward the sun, the ambient split with the depth above and a deck floor, a far stratocumulus band and a wind-sheared cirrus sheet with the 22° halo, weather-gated empty-space striding, gobos that discard by the same fields; 71b after the integrator's eye check: streets as continuous rolls with lumps riding on them, wide flat-based cumulonimbus with clustered towers and a sheared top third, the cauliflower (a second shape octave lifting the column top bulge on bulge, a sharper density threshold), the lighting (the powder sign, a white lit face, dark bases, the silver lining), the perf levers (footprint strides, an alternating light march, a 12 km pre-pass); 71c: luminous blue-grey bases (the bottom ambient undimmed by the depth above, a cool sky-mean floor, the diffused sun toward neutral; a cumulonimbus deck exempt), streets as chains of aligned lumps on rolls of varying width fading past 4 km, plateau cells of 540–960 m soft-unioned (the far field's tiny puffs), a two-tap ladder in a front's base deck and far strides; the baked decks stay the default and byte-identical | 31-map before / after review sheets (`$SP/r71/review/contact-sheet*.png`) with the structure / lighting / edge metrics on the history masks (streets one roll per view 38–89 %, the front 79 / 95 %, decks one structure, fair-weather sizes spread two orders, contrast 2.2–3.5 on the masses), the sky-band rule (all nine good maps within ±8 % middle / ±3 % lower except urban sky-s +14 / +6), skylines (winter 0.88 / 0.91, whiteout 0.92 / 0.87, monsoon 0.54 / 0.55); base chroma neutral-to-cool on every cumulus map (alpine 133 / 137 / 146 from 110 / 103 / 98); per-slot by repetition: verdant 0.35–0.59, winter 0.88–0.99, frontier 0.14–0.50, desert ≈ 0, monsoon 1.21–1.54 ms GPU (load 50–300); volumetricClouds receipt (rewritten) and the receipts in the section |
| 72 | Mountains and horizons to the clouds' level (owner, Whiteout under the round-71 clouds: "the mountains look so flat and untextured and boring, while the clouds look so good"): a ridged multifractal relief field over a warped plane with an erosion vocabulary (downslope gullies, talus aprons, rounded shoulders and sharp crests) in eight map characters (polar, alpine, rolling, mesa, volcanic, coastal, martian, karst) displacing the authored and interpolated ring rows; an (angle x radius) surface atlas baked per map at world activation in slices (the fine relief's gradient, a horizon occlusion, the sun's visibility) read by the vista program as a relieved normal and slope, occlusion, cast shadows, sky-coloured shaded faces and sun glitter on snow; the volumetric layer's cloud shadows on the ranges from the gobo fields bound by reference; the far range 1.9–3.3 km out (one unlit draw, its own aerial perspective, capped under a low deck); Whiteout on the polar alpine ladder; mobile on today's ring | 31-map before / after sheets (`$SP/r72/review/contact-sheet{,-sky-s,-centre-far}.png`, per-map pairs) with the ring-mask metrics (`$SP/r72/compare-after.{txt,md}`: detail energy up on 63 of 93 views (median 11.6 → 13.0), lit / shadow up on 68 of 92, the ring's screen height up on 82 of 93 (median 55 → 72 px); the outer-skyline step down on most views — the outermost silhouette is now a hazed distant range in front of which the old first ridge stays crisp); the ring's cost by repetition (whiteout +0.4 / +0.8 ms GPU at load 100 — the rolling → alpine ladder and its forest, the one map that pays; alpine, verdant, desert, mars −0.04 to −1.1 ms; +1 draw for the far range); the bake in Node 0.6–1.0 s quiet / 1–7 s at load 100; receipts horizonRelief (new), horizonCloudShade (new), horizonResources (re-pinned), titanGorgeHorizon / redrockCanyonHorizon / copperQuarrySurface (re-pinned), badlandsRelief (round72Relief projection), the horizon and terrain receipts in the section green; `npm run typecheck` |
| 72b | The integrator's eye-check answered (~6 / 10: symmetric cones, flat faces, washed far ranges, a first ridge without the relief, Whiteout over the perf line): two compile failures found first — the relieved normal read `.z` on vec2 gradients (a silent GLSL error: the ring drew with a stale program all round) and the terrain program's seventeenth sampler failed to link at MAX_TEXTURE_IMAGE_UNITS = 16 (the battlefield drew with no program) — fixed by the vec2 law (pinned) and by the ring atlas riding in the M normal's unit for the bands' draw (uRingDraw, onBefore/AfterRender, forced uniform refresh, program key v41); then the silhouettes (the first ridge at full relief weight with lifted crests, every profile slope break wandering ±38 m per column, leaning crests, cone clamp 0.7, the far range as rounded massifs with one serration octave and a rib/couloir cavity term), the surface (fine relief elongation 3 → 1.7–1.9, meandering depth-varied gullies, seam fade 60 m), the wash (the far range's own haze cut to a fifth–a third under the post pass's ring law) and the near ridge (the terrain bands read the atlas: relieved normal, occlusion, sun visibility) | 31-map sheets (`$SP/r72/review/contact-sheet{,-sky-s,-centre-far}.png`, per-map pairs, crops of the four named maps under `review/crops/`); metrics over 93 views: outer ridge contrast median 35.8 → 43.5 (up on 64), ring height 55 → 82 px (up on 79), Whiteout sky-w ridge contrast 5.9 → 24.3 / crisp 2 → 44 %, Frosthollow centre-far 8.5 → 38.1 / 1 → 59 %; the bench at load 94–112: Whiteout +0.94 / +0.78 ms GPU (4.4 × the pixels), Glacier Pass −0.14 / +0.34, CPU ≤ +0.10, draws +2 / 0; receipts: horizonRelief (vec2 law, far-range model), horizonResources (budget 235,239, digests), titanGorgeHorizon / redrockCanyonHorizon / copperQuarrySurface (re-pinned), terrainMaterialOwnership (v41, ten-sampler budget), terrainResources (ten textures), wallSkyLight / terrainWornDirt (v41), the sandbox receipts, badlandsRelief, horizonCloudShade, volumetricClouds and the rest of the section green; `npm run typecheck` |
| 72c | The integrator's second eye-check (7.5 / 8 / 7.5 / 7 — "this is the pass that reads"): the far range shaded per fragment with the near ring's slope-and-altitude law on a striation-tilted normal (rock ribs through the snow, scoured crests, bluer and lighter by distance) — the meringue domes gone; perf attributed by a `--hide=horizon-forest` bench: the vista fragment was never the cost (0.27 ms without the trees against the base's 0.33–0.54), the round-72 polar forest of 6000 spruces was the whole +0.9 ms — the polar forest is 1600 instances clumped by the relief and the detail fields (a belt along the bank was the eye-check's other tell); the vista tiles' far LOD (two fetches past 1 km, the finest fields dropped) and the cheaper far-range shading done as asked; a second warp octave at 35° off the radial (sheared angle on the circle embedding) and alpine elongation 1.4 break the radial grain into crossed chevrons; the polar bake carries wind drifts (sastrugi along one world wind) on the gentle faces; the ring forest's stands follow the relief and the snow maps' treeline wanders | the four named maps recaptured (sky-w / centre-far) with far-range, apron, grain (4 ×) crops under `$SP/r72/review/crops/`; Whiteout working-tree bench at load 58: 0.931 / 1.480 ms against the base's 0.33–0.54 / 1.136 (+0.39–0.60 / +0.34); the post-chain pair (load 40–76, two passes of four rounds): +0.52 sky-w / +0.46 centre-far on the pair means; receipts as round 72b plus horizonResources re-pinned (fetch sites 6 → 8, the far-LOD form pinned); `npm run typecheck` |
| 74 | Impact physics (owner 2026-09-25): energy-based crash and fall damage through one function in both sims (`sim/impact.ts`: ½·m·(v − v_min)² kJ × the ruleset's hp/kJ, glacis 0.7 / stern 0.85 / broadside 1, tracks first, the engine on a frontal crash or a hard landing, crew shock above 16 / 14 m/s, a two-tick crash priced once), a `physics` block per ruleset (restitution, rebound floor, fall and crash thresholds and rates, ram scale and restitution — Turbo Ball and Mars bounce, a single jump lands free), the ram split by mass / aggression / face with a momentum-conserving exchange, the swept landing contact with restitution (several decaying hops at low gravity, no tunnelling at 40 m/s), the landing torque toward the ground plane, a slide law on faces the tracks cannot hold, a lateral-grip cap on the yaw rate at speed, a static hold at rest, the settle chatter fixed (a parked hull on a grade crept 4 cm/s and chattered ±0.4° on the base tree), movement checkpoints v2, CRASHED / FELL on the kill feed and the final-blow line, `tank_impact` on the wire | impact / impactPhysics / impactParity receipts (new), movement 218, combat 541, authoritativeMatch, matchRuleset, ai, authoritativeBots (mobile 6/6), the mp / net / server-match receipts with their re-anchored pins, typecheck; headless Verdant 5 min (37 crashes, 631 hp, none stuck or tunnelled) and Mars 3.8 min (163 landings, 2413 hp, one fall death, 18-hop chains, none stuck or tunnelled), the 30 m Mars drop (14.9 m/s → 7.4 m/s rebound); `server/battlePacing` full 124: median 335.2 s, p10 260.8 s, 0 sub-120, 0 timeouts |
| 49 | Ring textures: marker-bed / joint / varnish strata replace the sine ladder (the walls' fine wavy partings remain — mechanism narrowed to a detail normal, still open), per-map ring rock band (Titan from 34°); `bareRock` vista knob (heath, outcrop ribs, scree, broken summit cap) on Fjord and Whiteout's crests; headland hand-over beside sea openings (rows slope into the sea over 250 m instead of a 25–30 m slab) | Titan 2× wall crops A/B5 + stripe metric; layer-flag / uniform-isolation / layers probes (the layers probe shows Whiteout's sky-w skyline is the rim band: ring hidden 1.005 → 1.009); saltwind / fjord ring-row dumps before/after and bird A/B; receipts in the section |

Every round keeps the standing rules: no performance or memory regression on paired native measurements, receipts
re-established with dated notes, and captures on the same camera/seed/tier before and after.

#### Probes and metrics as tools — 2026-09-23 (round 48)

Owner (2026-09-23): commit the QA probes that verified rounds 41–47 as first-class tools with receipts, so the
program's acceptance can be re-run by anyone. Until now they lived untracked in `.qa-dev/`; they now live in `tools/`
over one runtime, `tools/map-probe-runtime.mjs`: the argument parser and `--help` (every flag is `--name=value`,
anything unknown fails before a server exists), one private vite server per run on 127.0.0.1:5300–5399 (never
5197–5199), the repository's headless capture flags, the desktop-tier boot (`?nosplash=1&tier=desktop&gfxreset=1`,
wait for `__GAME_READY`), the solo-battle entry through `__DEBUG.beginSoloBattle` (wait for the pre-battle clock),
the two pose helpers (a table view resolved against the ground, a hull-relative pose) and one JSON receipt per run
written next to the captures (`<tool>-<tag>.receipt.json`: revision, options, settle times, per-map shots with the
resolved poses, page errors, `ok`). Exit 1 when a map failed; the receipt still names what did run.

**The probe mutex is the caller's.** A run owns a dev server and a GPU browser for a minute or more; agents hold the
scratch mutex around the whole process and run it at low priority —
`until mkdir "$SP/probe.lock" 2>/dev/null; do sleep 5; done; nice -n 19 node tools/map-view-probe.mjs …; rmdir
"$SP/probe.lock"`. The tools take neither that mutex nor the release harnesses' `/tmp/cot-shots` FIFO
(`tools/capture-lock.mjs`), so never run one beside `npm test` or `tank:release:check`, and never edit tracked source
while a run is capturing (vite serves the tree live). The A/B of every round is two runs of the same tool with a
different `--root` (the baseline checkout, e.g. a clean clone of `origin/main`) and `--tag`, into one `--out`.

| Tool | Proves | Rounds | Re-run |
|---|---|---|---|
| `tools/map-view-probe.mjs` | fixed-camera captures `<map>-<tag>-<view>.png` from the 31-pose table `tools/map-view-probe-views.mjs` (corner, along-rim, outside-in, first-ridge wall, centre skylines, low edge views, bird and oblique shore views) — the A/B every round from 35 to 47 was judged on | 35–47 | `--root=<A> --out=<dir> --maps=badlands,desert --views=sw-corner-close,sky-w --tag=a`, then `--root=<B> … --tag=b`; judge by eye and with `map-metrics` |
| `tools/terrain-layer-flag-probe.mjs` | which splat layer paints a surface: the terrain material recompiled with G yellow, D cyan, R magenta, M blue (round 45 found Monsoon's mound and Fjord's cliffs were the steep-slope layer; round 47 the desert / Oasis contour bands as the D mask) | 45, 47 | `--maps=monsoon,fjord --views=sw-corner-close,canyon-in`; the receipt counts the flagged materials (0 fails) |
| `tools/terrain-uniform-iso-probe.mjs` | which terrain uniform carries an artefact: one zeroed at a time (`-no-<uniform>.png`), `--flat-normals` swaps the layer normal maps for a flat texel (round 47: the desert's black squiggles survived every uniform and vanished with flat normals) | 47 | `--maps=desert --views=sw-corner-close --iso-uniforms=uRipple --flat-normals`; a uniform matching no material fails |
| `tools/world-layer-isolation-probe.mjs` | which world layer draws a step at the water edge: the sea apron, the ring forest, the ring mesh and the shallow-water sheets hidden one at a time (`-no-apron.png` …), with a census of apron / horizon / shallow-water / ring meshes | 40 | `--maps=coastal,saltwind --views=bird-e-edge,over-e-560 [--hide="no-apron=shallowWaterSeaApron;…"]`; a pattern hiding nothing is recorded, never silent |
| `tools/salvo-indicator-probe.mjs` | the guided salvo rack drives the HUD magazine indicator through the real desktop input path: reticle crops of rest / after the first launch / during the held group reload / refilled, with the combat state per phase; a cannon autoloader and a single-shot gun as controls | 41 | default `--ids=ztz100_prototype:salvo,leclerc_x:autoloader,t72b3m:single`; pairs with `src/sim/magazineIndicator.selftest.mjs` |
| `tools/water-drive-probe.mjs` | the wake and churn trail of a hull fording a lake at a governed 7 m/s: chase / bird / side poses 1.5–6 s after entering and 1.5–4.5 s after stopping, then a fixed shore camera (the trail must lie where the water was churned) | 46 | `--maps=reservoir,coastal [--spec=t90m_x] [--speed=7]`; entry points for reservoir, coastal, fjord, oasis, skybridge, alpine |
| `tools/map-metrics.mjs skyline` | check 5: median ground/sky display-luma ratio at the detected skyline (> 1 = range paler than the sky) | 37, 39, 47 | `skyline <dir> <tag> <maps> [sky-w,sky-s,centre-far]` |
| `tools/map-metrics.mjs stripe` | check 8: windowed 2-D FFT of a region's detrended luminance — peak share, wavelength, heading, top-1 % share, anisotropy, std | 43 | `stripe <image> x0,y0,x1,y1 …` (round 43 regions: desert w-wall-mid 900,480,1500,700; bird-w 200,560,1300,700; Oasis w-wall-mid 200,520,1300,800) |
| `tools/map-metrics.mjs boxes` | checks 3, 4, 11: shaded / lit box means, ground 5th percentile and mean, wall rgb / hue / sat / luma, A → B with % deltas | 42, 45, 47 | `boxes <capdir> boxes.json <maps> a b [views]` with the round-47a boxes below |

How each acceptance of the fifteen checks is re-run: checks 1, 2, 10, 12 and 13 (continuity across the red line,
roads and tree lines, props, water at the edge) with `map-view-probe` views `out-*`, `edge-*-low`, `bird-*-edge`,
`shore-*-oblique`, `over-e-560` and, for a step at the water, `world-layer-isolation-probe`; checks 3 and 15 (slope
shading, ring vs playable palette) with `terrain-layer-flag-probe` and the `boxes` wall stats; checks 4 and 11
(shaded faces bluer, shadow colour = sky ambient) with `boxes` shaded vs lit on the same cameras; checks 5, 6 and 14
(horizon band, sun-relative haze, banding) with `skyline` on `sky-w`, `sky-s`, `centre-far`, `w-wall-mid`,
`e-wall-300`; checks 7 and 8 (moiré, tiling) with `stripe` on the fixed regions; when a picture blames a shader
term, `terrain-uniform-iso-probe` names it. Round 41's HUD proof is `salvo-indicator-probe`, round 46's water proof
`water-drive-probe`.

**Parity with the Python scripts (this tree, 2026-09-23).** `skyline` on the round-47c frames (desert / Titan `sky-w`,
`sky-s`, `centre-far`, tag a) and the round-47a frames (Titan / Skybridge `centre-far`): every ratio equal to the
printed two decimals (desert 1.39 / 0.99 / 1.01, Titan 0.99 / 0.32 / 0.95, 0.94, Skybridge 0.76). `stripe` on the
round-43 frames: desert w-wall-mid base 0.0109 / 0.54 / 65.9 px / 116.1° / 2.81 / 18.01 and wind 0.0053 / 0.221 /
150.0 / 0.0 / 1.06 / 18.03, Oasis w-wall-mid 0.0222 / 0.76 / 123.4 / 26.2 / 0.90 / 32.53, desert bird-w 0.0158 /
0.547 / 366.7 / 0.0 / 2.50 / 13.12 — all equal; an odd 601 × 221 crop (the Bluestein path) 150.2 → 150.3 px
(0.07 %), the rest equal. `boxes` on the round-47a Titan / Skybridge / Blackglass a → b1 table: every cell equal.
The receipts `tools/map-metrics.selftest.mjs` (synthetic frames of known luma, a (12, 5)/256 stripe field recovered to
0.05 px and 0.05°, seeded noise isotropic, the A → B table exact, the FFT against the direct DFT for n = 8…97) and
`tools/map-probe-runtime.selftest.mjs` (arguments, the view table pinned by count and digest, ground and
hull-relative pose math, the mirrored-frame note against a real three.js camera, `--help` and bad flags of every tool
without a server) run in `npm test`.

Round-47a boxes (`boxes.json`, 1600 × 900 frames; `"<view>"` rows with `"<map>/<view>"` overrides):

```json
{
  "sw-corner-close": { "shaded": [850, 400, 1450, 620], "lit": [150, 300, 600, 600], "ground": [200, 300, 1350, 780] },
  "canyon-in": { "shaded": [120, 560, 320, 680], "lit": [700, 700, 1000, 800], "ground": [330, 540, 1350, 800], "wall": [560, 330, 1180, 460] },
  "centre-far": { "shaded": [400, 500, 1000, 620], "lit": [850, 620, 1250, 680], "ground": [380, 480, 1350, 690] },
  "w-wall-mid": { "shaded": [700, 650, 900, 800], "lit": [1050, 500, 1350, 640], "ground": [300, 460, 1350, 800] },
  "bird-w": { "shaded": [200, 640, 1300, 700], "lit": [400, 720, 1300, 800], "ground": [200, 380, 1350, 800], "wall": [560, 380, 1100, 540] },
  "skybridge/canyon-in": { "shaded": [220, 560, 520, 650], "lit": [600, 720, 900, 800], "wall": [560, 300, 1150, 430] },
  "mars/canyon-in": { "shaded": [300, 455, 900, 515], "lit": [600, 700, 1000, 800], "ground": [200, 440, 1350, 800], "wall": [1150, 470, 1550, 560] },
  "desert/sw-corner-close": { "shaded": [850, 400, 1450, 620], "lit": [150, 300, 600, 600] },
  "oasis/sw-corner-close": { "shaded": [850, 380, 1500, 650], "lit": [150, 250, 600, 600], "ground": [150, 250, 1350, 800] }
}
```

The mirrored-frame note, for reading compass claims in captures: world +X is east and +Z north, the hull's forward is
local +Z with starboard at +X, but a camera looking along a heading (fx, fz) with +Y up has screen-right = (−fz, fx)
— looking north puts west on the right of the frame, the mirror of the north-up minimap. `screenRightOf` in the
runtime states it and its receipt checks it against a real three.js `lookAt`.

#### 31-map skyline and border audit — 2026-09-22 (captures on d0cbb9fcd, `.qa-dev/wall-probe.mjs`, six views per map: SW corner, along the north rim, centre skyline NE, outside-in at the SW wall, centre skylines W and S)

Faults are listed against the checklist numbers. "Ring" = the terrain-material rim bands and the vista ranges; "corner cliff" = the in-map cut rock that the seated skirt meets at the corners.

| Map | State | Faults seen |
|---|---|---|
| verdant | good | far ranges hazed blue, ring forest continuous; centre S view blocked by a building (probe) |
| desert | fair | dune faces carry dark parallel ripple bands at every range — a corduroy repeat (8 — round 43: the bands swing and stretch per cell and ease past 320 m; mid-field band share 0.54 → 0.22); far mesas paler than the sky (5, round 37) |
| winter | good | round 48: redesigned as a Carpathian valley (no longer Verdant's bones); the owner-approved snow albedo / exposure re-grade puts the near rim a step below the sky (5: sky-w 0.94 → 0.88, sky-s 0.92 → 0.84); the far vista ring still reads at the sky (centre-far 1.05 — a ring item) |
| urban | fair | pale cracked corner cliff beside green turf reads as another material (15); centre sky views blocked by buildings (probe) |
| coastal | good | round 40: the bay runs on as the same water past the edge (terrain sea path + sheet apron); shoal pattern crosses the seam |
| autumn | good | pale grey corner rock next to golden ground (15, mild); far ranges blue — good |
| steppe | good | rim outcrops stop at the seam, plain grass beyond (1, mild) |
| railyard | fair | mossy dark corner slope; skyline flat under an overcast sky (3, 5) |
| frontier | good | chalky corner cliff (15, mild); hills, pines and the road continue |
| fjord | fair | smooth green cone hill on the rim with a darker cap — one colour per hill (3); plaster-white corner rock (15 — round 45: the sourced rock carried a 1.12–1.22 brightening tint; now 0.60–0.74 blue-grey — cliff luma 100 → 57, sat 0.21 → 0.26) |
| delta | good | flat green ring with tree clusters and water — consistent |
| badlands | poor | first-ridge walls at 300–700 m read as one dark brown sheet (3); the outland floor is bare sand (1, fixed density but no relief); walls past the edge lost their detail (round 32, fixed in 35) |
| monsoon | fair | smooth bare brown mound at the SW corner with no texture (3, 15 — round 45: the mound was the slope-rock layer authored as desaturated dirt; it now holds turf to ~38° and its steep faces are dark wet grass — display luma 95 → 67, hue 33° → 64°, matching the forest floor); dark hill along the rim |
| alpine | good | blue-grey rock cliffs and snow ranges; strong blue shade on shaded rock (4, acceptable) |
| caldera | fair | shaded slopes go black (4, 11 — round 42: inner east wall 6.6 → 16.7 luma, blue-grey basalt with texture); far pinnacles read as pyramids (3); the crater rim rises steeply right at the edge (probe camera ends inside the ring) |
| foundry | fair | skyline flat under overcast (5) |
| ruinspires | good | rolling ring with grass and far ranges; centre views blocked by towers (probe) |
| blackglass | good | rolling ring; centre views blocked by towers (probe) |
| titan_gorge | fair | orange sand slip faces on steep ring faces (15, fixed in 35: landform gate); smooth beige ridge faces without strata (3) |
| skybridge | fair | beige sand ridge faces where rock belongs (15, fixed in 35); shaded SE slope goes black (4 — round 42: 21 → 35 luma, blue-grey) |
| polders | good | flat ring, consistent |
| copper_mesa | good | strata on every cliff; far mesas paler than the sky (5) |
| airfield | good | flat ring with trees — consistent |
| oasis | fair | dune bands repeat (8, as desert — round 43: the diagonal streaks are gone, mid-field band share 0.76 → 0.61) |
| whiteout | fair | round 48: inherits the winter re-grade on its ground (snow 196 → 182) but its skyline is the vista ring, not the near rim — metric unchanged (1.01 / 0.91); a ring snowHex / haze item on its round-47-pinned horizon line (3, 5); round 70: the snow re-grade authored on the sourced snow — sky-w 0.96 / sky-s 0.91 on the physical sky, 0.84 / 0.85 under the round-68 overcast |
| orchard | good | grey corner rock beside green (15, mild); far ranges blue |
| longleaf | good | dark corner rock; ranges good |
| mangrove | good | flat green ring; water and trees continue |
| saltwind | good | round 40: one hooked bay open to a derived 63° west sea; the sand-strip rectangles are gone (5 still open) |
| reservoir | good | corner rock dark grey; ranges, forest and water good |
| mars | fair | ring beds print as high-contrast zebra stripes on every ridge (8); dark side of ridges black (4 — round 42 measured ±1 luma: the near ridges' dark sides read 46 luma under a 2-luma night sky; the black is the far vista ring's night side, a vista item) |

Cross-cutting: (a) every temperate map's in-map corner cliff is a pale grey or white rock beside saturated turf — the rock albedo tint is a per-map knob and reads chalky on eight maps (15); (b) shaded slopes go black on the dark-soil maps (caldera, skybridge, mars) because the ambient term is a constant hemisphere with no sky colour — round 37/39; (c) desert-family dune ripples are a single-frequency band (8) — round 38; (d) far ranges paler than the sky on the mesa maps (5) — round 37.

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
