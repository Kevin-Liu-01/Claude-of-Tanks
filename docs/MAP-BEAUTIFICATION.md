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
| Torn tree crowns | Far-shell-only seam repair has all30-map geometry/RNG coverage and 12 personally reviewed native Verdant/Coastal pictures. Existing two-map cost comparisons pass with equal render medians and resource counts; p95 and delivered-interval increases remain recorded ([evidence](CANOPY-FAR-SEAMS-CANDIDATE.md)). Near geometry/indexing stays baseline. The old combined index candidate and its failed/mixed performance evidence remain held; broad forest composition and all-map/mobile performance are not certified |
| Dark grass speckles | Grass atlases retain transparent-edge color in `a38ab190d`; native Coastal/Verdant pairs show reduced black speckling with exact scene/material/texture inventories ([evidence](GRASS-ATLAS-PADDING-CHECKPOINT.md)). Distribution/tone and complete frame/heap parity remain separate |
| Dark foliage atlas edges | The same straight-alpha correction covers the four tree atlas families in `090bdcb1d`;64 real Canvas cases and22 matched native poses pass with unchanged resource inventories ([evidence](FOLIAGE-ATLAS-PADDING-CHECKPOINT.md)). This is a subtle edge correction, not a crown-shape redesign |
| Moving terrain texture coordinates / inland sand relief | World-fixed detail chart and Coastal/Saltwind beach-only relief pushed in `cb955e194`; native three-map checks pass ([evidence](TERRAIN-SURFACE-CHART-CHECKPOINT.md)). Coastal/Saltwind ambient sand marbling is reduced in `c97e20fd2`, with matched native pairs and unchanged scene/texture counts ([evidence](COASTAL-WORN-GROUND-CANDIDATE.md)); broad town wear remains separate |
| Verdant horizon | User reversed the restoration request: newer low pastoral watershed/layered woodland horizon reinstated and pushed in `139585281`; no broader village/ground/palette prototype was reinstated |
| Coastal/Saltwind blanket village sand | Four existing-channel activity footprints per map replace broad off-road settlement wear in `85f93d809`, with scoped tests in `853c6bc6b`. Both native before/after pairs were personally reviewed; roads/water/terrain heights and other28 masks remain exact ([evidence](COASTAL-VILLAGE-WEAR-CANDIDATE.md)). Sparse village grass remains separate |
| Standing-grain backface lighting | Published in `85d68decd`: preserve the authored upward crop normals on both card faces instead of reversing them into black bands. Matched native front/back/establishing views were reviewed, three-sweep resource comparisons pass, and the fixed full-frame cost pair passes. Geometry, palettes, alpha and crop placement remain unchanged. [Scoped evidence and limits](COASTAL-MEADOW-NATIVE-REVIEW.md) |
| Coastal/Saltwind meadow and crop composition | The grass-height candidate remains unpublished. The unequal crop-rhythm candidate at `83e74e4de` and the root-color interpolation experiment at `4ac879eed` both completed matched native captures but were **rejected visually**: their establishing views still read as parallel pegs; darker roots merely add gray stalk columns. Focused tests/typecheck/private builds pass, but these art candidates are not shipped or advanced to performance acceptance. The rejected root-depth receipt is preserved in its branch at `69e37bd58` |
| Mode placement | Shared solo/server safety checkpoint passes all 30 maps × 5 modes on current roads ([evidence](MATCH-PLACEMENT-CHECKPOINT.md)); road integration must revalidate it |
| Road continuity | The22-map continuity candidate remains unpublished. Local checkpoints `d55bc626f` and `06e84b2e3` now pass the all30-map physical inventory and all30×5-mode placement checks; all22 changed collision shards are freshly captured with lossless packing, leaving eight unchanged. The four-map horizon pilot passes packed terrain-contact/winding checks, but all eight latest matched native views were **rejected visually**: angular, differently shaded road strips still meet implausible outer slopes. Two north Frontier exits are also unresolved. Candidate minimap refresh is underway; the previous five-map native frame-time failure remains held. Only the independent exact-output lookup optimization `d9960ad92` is published |
| Nighttime entry and lights | Final-light-first correction, downward headlight aim and restrained window/streetlamp intensity pushed; matched native closeups and lifecycle checks pass ([entry](NIGHT-ENTRY-CHECKPOINT.md), [aim](NIGHT-LIGHT-AIM-CHECKPOINT.md), [intensity](NIGHT-WORLD-INTENSITY-CHECKPOINT.md)). Covered entry now skips the discarded authored-day PMREM bake: actual native A/B observes two bake returns on baseline versus one selected-night return on the candidate, ready before the first covered frame. [Evidence and limits](NIGHT-SINGLE-BAKE-REVIEW.md). This is not a measured general loading-speed or memory claim. Service windows glow but are not all spatial lights; flat interiors and unshadowed point-light occlusion remain |
| Ironworks masonry | Foundry-only brick pigment and roof reflection refinements are image-reviewed and published, preserving Copper Mesa and other material buckets. Roof gain uses the existing material uniform, without extra textures. Matched native views and scoped cost comparisons pass with actual timing deltas retained ([evidence](FOUNDRY-MASONRY-CHECKPOINT.md)). Flat trim and settlement composition remain separate |
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
still held. The [Verdant scene checkpoint](VERDANT-SCENE-CHECKPOINT.md) remains
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
See `RIVER-REED-CONTACT-CANDIDATE.md` for evidence and limits.

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
`MANGROVE-STEM-CONTACT-CHECKPOINT.md` for exact evidence and cost limitations.
This was pre-existing, not a reed change; the historical failed full-suite
boundary remains recorded separately from the repaired focused checks.

### Crop identity checkpoint — 2026-09-09

`3bfd72f90` adds two opt-in crop forms without changing field placement or
geometry: broken golden harvest stubble for Autumn and narrower green upright
crops for Delta. All eight matched native images were reviewed; the old pale
card ranks are reduced, but grass still obscures Autumn's low stubble and
Delta retains regular dotted rows at distance. The other 28 painters are
unchanged. Focused integration tests, TS7 and public build pass. See
`CROP-BIOME-IDENTITY-CHECKPOINT.md` for source pins, earlier failures, exact
resource contracts and the remaining full-frame/mobile performance limits.

### Grass and palm shape checkpoint — 2026-09-09

`902d9882f` narrows the existing grass blades and aligns near/far palm segments
with their full authored lean. Root and an independent reviewer viewed all
eight matched native Autumn/Delta images: grass is finer, and the obvious
stepped palm joints become continuous stems. Grass geometry, instances,
allocated buffers, materials and measured draw submissions stay exact.
Eleven focused tests, TS7, scoped quality/Doctor and public build pass.
The failed first native acquisition and its source-bound readiness correction
are preserved in `GRASS-PALM-SHAPE-CHECKPOINT.md`, together with raw CPU timing
and remaining motion/mobile/full-frame limits. More ground and regular crop
rows now show through; broad forest, water and settlement composition remain
unfinished. This is not a whole-map or zero-regression certificate.

### Autumn palette checkpoint — 2026-09-09

Autumn's existing tree species now use distinct muted copper, gold, straw and
olive families. Four matched native close/wide images were reviewed; the
scarlet/orange uniformity is reduced with exact geometry, alpha, instance,
resource-storage and observed foliage-submission counts. Focused tests, TS7,
quality/Doctor and public builds pass, including current-main integration.
See `AUTUMN-SEASONAL-PALETTE-CANDIDATE.md` for source/evidence and cost limits.
This is not a bush-shape or full-scene acceptance. The separate tiered bush
experiment is rejected: it creates repeated cactus/topiary silhouettes and
remains local. Farm-prop relationships and shoreline planting remain open.

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
