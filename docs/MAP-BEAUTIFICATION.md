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
still white by eye, tanks and HUD unchanged.

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
(ring snowHex / haze), not a winter.ts knob.

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

**Still open.** A true arched span with water under the deck needs the road plane to exempt the crossing from the
14–18 m dry band (`terrain.ts`, a round-47 file — not this lane's scope); the arch openings are box recesses, not arcs.
The garage card (`public/maps/autumn.webp`, thumbs) was re-rendered from the redesigned valley in round 50 (2026-09-24);
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
- **Open.** The rail spur has no track geometry — `mapKits.ts` lays its lines at fixed centre coordinates for Cinder
  Junction only; a parameterised spur kit is a follow-up. The picker thumbnail and 4K hero (`public/maps/steppe.webp`,
  `thumbs/`) and the tactical-map plate (`public/minimaps/steppe.webp`) were re-rendered in round 50 (2026-09-24) —
  the lane had left the Verdant-clone frames in place.
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
re-grade, owner call) stands. Landed on the ring side only what the scoured-crest look needs (`bareRock` 1, rockHex
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
| whiteout | fair | round 48: inherits the winter re-grade on its ground (snow 196 → 182) but its skyline is the vista ring, not the near rim — metric unchanged (1.01 / 0.91); a ring snowHex / haze item on its round-47-pinned horizon line (3, 5) |
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
