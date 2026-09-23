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
| Amberford | Autumn ford, riparian growth and hillside farms; warm leaf litter against cool water |
| Tarkhan Steppe | Open golden folds, sparse windbreaks and distant farms; avoid enclosing mountains |
| Frontier Basin | Agricultural basin and checkpoint routes; branched gullies and patchy conifer uplands |
| Tidegate Polders | Drainage channels, straight human-made levees, field headlands and pump yards; very low horizon |
| Orchard Valley | Orchard rows follow working terraces; packing courts and village lanes, distinct from wild forest |
| Longleaf Crossing | Logging spur, cut blocks, timber yard and regrowth; visible forest-age variation |
| Highland Reservoir | Pine catchments, exposed reservoir margin, waterworks and service roads |
| Olympus Basin | Rust regolith and mesas under a galaxy sky, a research station of domes, modules, masts and pads (Mars mode, 2026-09-18) |
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
every change (the `.qa-dev/wall-probe.mjs` view set: corner, along-rim, outside-looking-in, first-ridge wall, centre
skylines):

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

Every round keeps the standing rules: no performance or memory regression on paired native measurements, receipts
re-established with dated notes, and captures on the same camera/seed/tier before and after.

#### 31-map skyline and border audit — 2026-09-22 (captures on d0cbb9fcd, `.qa-dev/wall-probe.mjs`, six views per map: SW corner, along the north rim, centre skyline NE, outside-in at the SW wall, centre skylines W and S)

Faults are listed against the checklist numbers. "Ring" = the terrain-material rim bands and the vista ranges; "corner cliff" = the in-map cut rock that the seated skirt meets at the corners.

| Map | State | Faults seen |
|---|---|---|
| verdant | good | far ranges hazed blue, ring forest continuous; centre S view blocked by a building (probe) |
| desert | fair | dune faces carry dark parallel ripple bands at every range — a corduroy repeat (8 — round 43: the bands swing and stretch per cell and ease past 320 m; mid-field band share 0.54 → 0.22); far mesas paler than the sky (5, round 37) |
| winter | fair | ring is a white sheet with a few dark specks (3); skyline nearly invisible in the haze (5 — round 44: snow sits on the tonemap shoulder above the capped sky; needs a snow albedo/exposure re-grade, owner call) |
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
| whiteout | fair | as winter (3, 5 — round 44: same cause, same re-grade) |
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
