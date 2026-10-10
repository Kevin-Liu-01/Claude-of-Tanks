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
| Orchard Valley | The Chouf on Mount Lebanon below the Barouk's cedars (the map-revival lane, 2026-10-05 to 2026-10-07): olive rows on the valley's contour terraces held by grey dry-stone risers; the mountain village stacked on its own terraced hill west of the junction — the summit church and its campanile over a paved square, the two dar fronts with their triple arches flanking the stepped lane up from the cross road, the houses shoulder to shoulder on the benches under red tile and rolled earth, a mule stair climbing the south face on its graded track; the hammam on the bathhouse street, the Ottoman sabil on the junction's square; cedar and umbrella pine on the upper slopes |
| Tidegate Polders | The polders of the Scheldt estuary in the autumn of 1944 (the map-revival lane, 2026-10-06 to 2026-10-07): clay fields boxed by dykes standing as embankments, the main dyke's crossings ramped, the lanes on crowned banks; the vaart and its weteringen, the old creek's cut-off oxbow arm silting into reed; the brick tower mills on their molenbergen, Bosman windmotors on the basin banks and the white double-leaf lift bridge on the causeway (the landmarks lane, 2026-10-05); willow rows along the drains, poplars on the long dykes; a very low horizon |
| Orchard Valley | Orchard rows follow working terraces; packing courts and village lanes, distinct from wild forest |
| Longleaf Crossing | Logging spur, cut blocks, timber yard and regrowth; visible forest-age variation |
| Highland Reservoir | Pine catchments, exposed reservoir margin, waterworks and service roads; the valve tower standing in the lake and its arched footbridge from the bank (the landmarks lane, 2026-10-05) |
| Olympus Basin | Rust regolith and mesas under a galaxy sky, a research station of domes, modules, masts and pads (Mars mode, 2026-09-18) |
| Frosthollow | Carpathian winter valley (round 48): a beaded frozen river down a kotlina floor, a linear timber street village on the west terrace with a sawmill yard, a two-armed ridge and saddle pass on the west flank, rolling moraine on the east; fieldstone walls, spruce blocks with cut clearings |
| Glacier Pass | Frozen lake, rocky alpine catchment, sheltered village; exposed crags and drifting snow. Map revival lane 2 (2026-10-05): the Col du Mont-Cenis in April 1945 — the Savoyard kit (rubble and lauze, larch galleries, mazots, the hospice, the frontier barracks, the Vallo Alpino's works) and the Grande Croix. Round 2 (wave 109b): grey gneiss rubble and blue-grey lauzes 0.34 m thick, the roughcast greyer and the ochre duller, snow banked against every wall, the hospice in rubble with whitewashed reveals and a swept apron, the bulb in larch shingle, the shelled house's stepped breaks, heaps, fallen lauzes and burnt frame, larch-board yard fences, the lake drifted over, the col nearly treeless (34 stands, 40 lone trees); pacing 184/210/226/185 s (median 210 s). Round 3 (wave 109b, "spread far apart along straight roads"): the village two tight Maurienne hamlets — Le Planay round its parish church (13 buildings) and Les Tavernettes round the crossroads (11), eaves under a metre apart, the solid fronts 5.5 m from the carriageway (terrace sites) — with the open col between them (the Vallo Alpino blockhouse and one field barn), the plateau above the larches treeless (12 stands, 10 lone trees, 30 rim trees); pacing 208/232/167/155 s (median 208 s, p10 155 s). Round 3, wave 127's items: no shrub layer on the col, the roadsides of April 1945 (cable reels and direction signs, no cones, Jersey barriers, pad transformers or market stalls), the Savoyard stone a cool grey rubble print, the shelled houses broken from their corners to a breach (not battlements) with snow along every broken head and the walls' own stones out on the heaps |
| Nordhavn Fjord | Steep harbor settlement, fishing quays, dark water and coastal rock; layered mountain valleys |
| Whiteout Station | Sparse polar service compound, fuel storage and wind-shaped snow corridors; expansive low backdrop |
| Saltmere Bay | Dune-backed fishing coast, sheltered harbor and inland pasture; no inland sand marbling |
| Saltwind Narrows | Dry limestone terraces, scrub and narrow sheltered water; pale stone with restrained green; the free-standing Venetian campanile on the bay's axis (the landmarks lane, 2026-10-05) |
| Jade River Delta | Braided channels, floodplain agriculture and raised compounds; vegetation follows water; the terracotta aat-chala temple by the market (the landmarks lane, 2026-10-05) |
| Mangrove Reach | Tidal islands, exposed mud, root thickets and raised access; avoid generic grassy countryside |
| Monsoon Ridge | Humid jungle ridges and weathered valley settlement; darker understory and muddy drainage |
| Sirocco Wadi | Dry watercourse organizes settlement and palms; windward sand against eroded rock |
| Sunscar Oasis | Siwa: a spring-centred grove and palm gardens, wet banks and bare surrounding dunes; old Shali's kershef houses, the mud minaret and the springs in the `siwa` variant of the ksar kit |
| Redrock Divide | Stratified escarpments, talus and logistics outpost; controlled arid palette |
| Titan Gorge | Monument Valley: a sand floor between stepped sandstone shelves, free-standing buttes, dry washes; a Navajo community in the `navajo` kit (hogans, trading posts, camps, windmills); sagebrush and juniper, the grass cured to straw; do not grass over every rock shelf; cost: rule v3 over on the sunny regime's cascade work only; kit share within bounds; owner-accepted regime exception, 2026-10-06 |
| Copper Mesa Mine | Extraction benches, haul roads and ore-loading courts; human cuts distinct from natural cliffs |
| Cinder Junction | Rail ballast, freight platforms, graded service routes and storage blocks |
| Ironworks | The Völklingen ironworks on the Saar, March 1945: blast furnaces with their bunkers, skip hoists and stoves, sawtooth mills, gas holders, conveyors, the colliery headframe and the miners' houses (the `saar` kit, 2026-10-05); slag, gravel yards, ballast and ruderal birch are the ground lane's next |
| Kestrel Airfield | Runway/apron geometry, dispersal bays, perimeter service roads; wide open sightlines |
| Obsidian Caldera | The Aso caldera, Kyushu: black volcanic shelves and cinder cones on a farmed floor; a village of minka, kura and greenhouses round the sulphur works in the `kyushu` kit; sugi and Japanese red pine; distinct basalt fracture language |
| Steinburg | Masonry street blocks, courtyards, central civic space and localized war damage |
| Ruinspires | Sarajevo under siege (1992–96): the boulevard's tram line between Austro-Hungarian blocks and Yugoslav towers, the mahalas on the flanks, the siege on every building (the `sarajevo` kit, 2026-10-05); the ground's land use and the roads' surfaces are the ground lane's next |
| Suzhou Creek (`blackglass`) | Shanghai, autumn 1937: the creek and its four bridges between the Settlement's lanes, blocks and Art Deco towers and Zhabei's burnt shophouses; brick, granite and grey canal tiles |
| Skybridge Chasm | Glen Canyon above Lake Powell: bedded sandstone shoulders over the drowned gorge; the Bureau of Reclamation's 1960s works and Page in the `glencanyon` kit (powerhouse and penstocks, control building, walled switchyards and transformer yards, relay tower, ranch houses), its poured walls board-formed concrete (formwork boards, lift lines, tie holes); the plateau's juniper and pinyon with poplars by the water, the bunchgrass cured straw; crossing/abutments/control works organize the canyon; believable approaches |
| Aegis Crossing | Ronda and the Tajo (map revival lane 2, 2026-10-05): the limestone gorge under the stone viaduct between two white bridgehead towns in the Andalusian kit (the arcaded casa consistorial, the stone church and belfry, the Nasrid tower, the posada, rejas and iron balconies), the Ronda street walls (21 terrace houses a side on the roads below each square), cortijos round their patios, ruined mills on the gorge floor; secano grain, olive groves on the west terraces, holm oak and cypress. Pacing median 277 s (PR head 293 s), p10 225 s; every layout band holds. Round 2 (wave 108b): rock gorge walls under the bridge, sett-paved streets and squares inside the towns (townPaving), the squares 72 m across and walled by ten more town houses a side, a finer limewash (surfaces.relief), tile eaves and ridge caps, esparto blinds, tollhouses at the bridgeheads, pale calcareous soil and a thinner dry sward; kit triangles 153 792 → 326 652; pacing 223/367/424/174 s (median 367 s, p10 174 s, no timeouts). Round 3 (wave 108c): the Tajo's walls a 28 m cliff over a 10 m lower wall stepping in in buttresses and bays (terrain.ts gorge wall and meander), pale bedded calcarenite (the rock layer graded from Rock058's 0.08 linear to ~0.29, strata 0.16), the summer campiña's withered-grass, marl and pale caminos (the steppe's photo sets under Aegis's own tints), small pale setts, cane yard fences and post-and-rail road fences, no washing lines, the ermita's bell gable clear of its roof, the casa consistorial's clock 1.6 m across, the limewash relief at a fifth; pacing 245/309/292/389 s (median 309 s, p10 245 s, no timeouts) |

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

**2026-10-04: off on the grounded rig (the skies lane, agreed with the ground lane).** Redrock's battlefield inselbergs,
their faces turned from the sun on the into-sun frame, read 0.84–1.00 of the sunlit sand (the gauntlet's wave 50 frame;
the mountains lane had cleared their normals). Each non-sun term switched off alone in the page, the boxes taken back to
scene light through the output pass's twin: this lift carried 0.54–0.71 of the sunlit sand's light, the environment's sky
diffuse 0.13–0.17, the ground bounce and the facing rule nothing (the face's own shadow covers the ground before it); with
all three off, 0.13–0.18 remained — the haze's in-scatter toward the sun. The grounded rig (2026-10-01) lights a steep
face's open sky through its environment, so the lift counted that light twice. The gain is now the rig's
(`groundBounce.ts` `terrainWallSkyLift`, one uniform object every terrain program binds; `lighting.ts` applyGroundBounce
sets it): round 42's 7 on the legacy rig (phones, the Preetham tier, the galaxy skies), none on the grounded rig
(`WALL_SKY_LIFT_GROUNDED`, a QA knob); a map's own `splat.wallSkyLift` stays its own. The shader is unchanged.
- *Redrock, facing the sun:* the faces 0.28–0.33 of the sunlit sand (a backlit wall under a clear sky: half the dome and
  the bounce, about 0.20–0.35), a shaded red-brown; the touched pixels' median 145 → 88 display luma.
- *The slopes round 42 rescued* (the pixels the lift touched, display luma p5): Caldera's e-wall-300 61.7 → 53.6 (32 % of
  the sky; round 42 measured its black at 6.6, 3 %, and its fix at 16.7); Skybridge's e-wall-300 85.8 → 67.3 (43 % of the
  sky; round 42: 21.2 → 34.8). Mars barely moves (0.5 % of its establishing frame, a slope by the settlement; the other
  touched pixels are the starfield's twinkle). No slope returns to black.
- *Overcast:* Titan Gorge's walls untouched (at most 3 levels). Frosthollow's snow slopes on e-wall-300 (5 % of the frame)
  p5 127 → 112.
- *GPU* (the old gain switched in-page, on / off / off / on twice): +0.13 / +0.06 ms (Redrock), −0.71 / −0.13 ms
  (Caldera), p25 / p50 — nil, a uniform's value.

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
### Round 73 — 2026-09-25: the ground redux (transitions, folds, the wet strand, tall grass under the tracks)

**Owner (2026-09-25 evening, after rating the round-71 clouds "amazing"):** "improve ground, ground transitions,
shorelines... add tall grass that interacts with tanks... so many opportunities for a triple AAA redux!" and "make
sure performance is still really good". The clouds set the bar; this round brings the playable ground up to it, on
the same build, measured against `?ground=legacy` (every new term at zero, the sward off) so the before / after pairs
share the camera, the seed, the tier and the bundle. Branch `world/ground-redux-r73` on the cloud branch; the far
ring (`horizonVista.ts`, `horizon*.ts`, `farTreeBase.ts`) belongs to the round-72 lane and is untouched here.

**One table, no map-config edits (`src/world/groundRedux.ts`).** Every battlefield has a row — the height-blend
strength, the mid-distance octave, the scree band, the snow drift / scour / glint, the fold moisture / occlusion /
crest, the swash period / width / strength, and the tall-grass biome — resolved by map id inside the material steps
and the tier, so the map configs stay byte-identical (their history receipts project every byte of `maps/*.ts`) and
the material call keeps the shape the sandboxed receipts regex. A knob at zero is inert; an unknown id runs the
temperate defaults with no sward. The material packs the knobs into four vectors and a clock — no sampler: the
terrain material declares ten samplers and sits at the GPU's sixteen with the engine's cascades, environment and fog
(`GROUND_REDUX_BUDGET.terrainDeclaredSamplers`, pinned).

**Transitions (`terrain.ts`, `reduxHeightMix`).** The dirt and rock borders used to be one smoothstep of a
noise-broken coverage — a soft feather with the same profile everywhere. Each layer's local relief is now read as its
albedo's luminance against the tile's own mean (a deep-mip tap: the painters bake cavity shade into the colour and the
sourced sets carry their ambient occlusion, so no packed height channel and no sampler), and the incoming layer wins
where its relief stands high over the base's: grass pokes through a dirt patch at the border, a rock's top clears the
snow while its seams stay buried. `x = f + (h_layer − h_base) · k · 4 f (1 − f)` then `smoothstep(0, 1, x)` — the
modulation vanishes at full and zero coverage (a road stays a road, the water ramp is untouched) and the strength
fades with the far variant and off the wall projections, so nothing shimmers at range; the relief taps and the
mixes run only where the strength is above zero, so the far field and the `?ground=legacy` A/B keep the plain mask
(with k = 0 the curve would still S-shape it). A scree band joins the D
layer on the 12°–30° slopes under the rock take-over where a map authors it (Glacier Pass 0.6, Frosthollow 0.35,
Nordhavn 0.4, Whiteout 0.3): a snowfield or a meadow meets its cliffs through a talus apron, not on one line.

**The folds (a vertex attribute, `buildChunkGeometrySteps`).** The relief's own curvature is baked once per world
in `terrainBuildSteps` — an 8 m grid of the map's heights over ±536 m (17.7 k samples, sliced), the 8 m and 24 m
Laplacians (hollows positive) — and every chunk vertex carries it as one normalised byte (`fold`, +0.6 MB per world at
every LOD; the skirt continues its top vertex). The material reads it as `vFold`: a hollow holds moisture (16 %
darker, a shade greener on turf, a step less rough) and takes less sky (`gFoldAO`, joined at Three's own
`aomap_fragment` stage so it darkens the indirect light only, as an aoMap would); a crest dries and lightens 6 %. Low
frequency, so no distance fade and no tiling. The height field publishes the same sampler as `_foldAt` for the sward.

**Snow (`uReduxSnow`).** A snowfield was one white sheet. On the three snow maps the wind scours it to a harder,
cooler crust on the exposed patches (the warped worn field, −7 % luma, toward blue) and leaves powder in the lees
(+3.5 %); it combs the surface into ~1.8 m sastrugi inside 120 m and ~15 m drift waves out to 420 m on the map's own
wind, swung per ~400 m cell (the round-43 rule, so no two trains share a heading) — a separate block from the sand
ripples, which keep their gates and receipts. Sparkle: inside 42 m a sparse near-level noise (read at −6 mip bias —
the mip chain averages the peaks away at the pixel footprint) drops the roughness of a few texels per square metre to
0.14, so the sun's lobe glints on them and the glints twinkle with the camera; gone by 42 m, where a glint would be a
shimmer.

**The mid-distance octave.** The near passes end by 48 m and the coarse turf relief begins with the far variant at
90 m; between them the ground shaded on the base tile alone. One re-projection of the ground normal at ~1.1 m carries
the 26–150 m band on open ground (off the carriageway), fading before the far band's own relief.

**The wet strand (`uReduxSwash`, round 66's open note).** The run-up whitened the sheet but never wet the sand. The
terrain cannot read the sheet's run-up field (sixteen samplers), so the band is analytic on the same clock the
sheet's swash runs on (`mat.userData.groundClock`, advanced with `water.update`, frozen with `setWaterTime`): below
the sheet's waterline the sand apron is dark (−60 % at the coast strength of 1.5) and glossy (roughness 0.92 → 0.30)
where the swash just ran — a film whose reach breathes with the map's swell period (Saltmere 8.5 s, Saltwind 7.5,
Nordhavn 9.5, Mangrove Reach 6.5) at a different phase along the beach (the warped noise fields), damp to the
high-water mark (55 % of the film), dry above it — with a ragged wrack line at the mark (−35 %, torn by the same
fields) under the round-56 wrack pieces; the ripples the water ran over smooth. The band's width is a multiple of the
map's own apron ramp (`splat.seaRamp[0]`: 0.16 on Saltwind, 0.30 on Saltmere), 1.9 ramps — the Saltwind probe
(`.qa-dev/r73-swash-probe.mjs`, the strand view under uniform overrides) sized it: the first cut, 0.12 mask units at
strength 1.0, was invisible on the strand; 0.30 units at 1.5 read as wet sand near the water with a dry backshore;
0.60 wetted the whole beach. A lake or a river (no period: Jade River Delta, the polders, Highland Reservoir, Monsoon
Ridge, Sunscar Oasis, Skybridge's flat sea) keeps a steady damp mud bank at 0.4–0.6. Only the sand apron between the
waterline and the backshore takes it, inside the square and along the round-47 contour past the edge — the seam
metric of round 40 measures water against water and does not move.

**Tall grass under the tracks (`src/world/tallGrass.ts`, `groundPressure.ts`).** The meadows carried a knee-high
tuft carpet of alpha cards that nothing in the battle ever touched. The tier grows blades — opaque, textureless,
vertex-shaded strips in clumps of three (five vertices, three triangles each; a third segment cost 40 % more
triangles for a bend no 1–4 px strip can show) on a camera-centred ring of 12 m cells to 46 m (2.6 clumps / m² at
density 1, cap 56 000; 3.0 on the first sheets), and single wider blades (1.7 ×, 0.20 / m², cap 28 000) on a ring of
24 m cells to 120 m (fading in over 34–46 m where the clumps fade out) — two `InstancedMesh`es, translation-only
matrices with a packed blade attribute (yaw, height, width, random), the strip built in the vertex shader in world
units: a gust front travelling down the map's wind over the meadow plus a per-blade flutter, a per-blade lean, dark
roots and lit tips (`mix(base, tip, t^γ)`, γ 0.75 on the clumps; the far blade, seen from above and averaged with the
ground between blades, takes γ 0.35 and a third more light — at γ 0.75 Monsoon's hillside massed dark on the first
sheets), the cascade shadow read at the root (the round-13 rule), the same scope corridor the tufts clear, a lens
clear inside 2.2 m. Every hull's
footprint is published each battle frame (`main.ts` → `world.setGroundDisturbances`, eight slots, in water or not)
into a world-anchored RGBA16F field over 96 m / 256 texels around the chase focus, torus-mapped like the round-46
water: R the press, GB the push direction — along the travel of a moving hull, outward from the belly of a standing
one, the flanks rolled outward so a trail reads as two lanes — and A a slower bruise. A stamp only ever raises the
press, so the lane behind the tracks stays flat and stands up again with an e-fold of 20 s (5 % after a minute); the
blade bends 77° toward the push at full press and its tip lays a further third of its height along it; crushed
blades stay 28 % darker for about a minute. Concealment is what the blades occlude on screen — nothing in `src/sim`
changed, spotting is authoritative and unchanged. Candidates keep off the carriageway and thin over its shoulder,
off water (reeds stand in the shallows, 0.04–0.6 of the mask), off soft and trodden village ground, off faces over
37°, off worked ground and out of every sealed footprint (buildings, fortifications, props — the litter's clearance);
the terrain's own dirt fields thin the sward as they thin the tufts, straw patches tint it, hollows thicken and lift
it (+30 % / +25 %), crests thin it. Biomes: meadow (Verdant, Orchard, Highland Reservoir, Monsoon's lusher 1 m),
steppe (Tarkhan at 1.2 × and 1.05 m, golden), savanna (Frontier Basin, Longleaf wiregrass), reeds (Jade River Delta,
the polders, Mangrove Reach, Sunscar Oasis's lake), dead sedge through the snow (Frosthollow, Whiteout, Glacier Pass:
sparse, 0.36 m, thin and dark straw — the first sheet's pale tips lit white under the snow maps' fill and read as
frost spikes), marram on the backshore of the three sea maps (dense on the strand's own wetness ramp, sparse
inland), trodden verges in the towns and yards (a quarter to a third), none on the arid maps and Mars. The
quality preset carries the knob (`tallGrass`: Low ¼, Medium ½, High / Ultra full, the mobile presets none — the
mobile tier keeps today's ground) and the tier reads it live (a change re-seeds the rings); `?tallgrass=off` and
`?ground=legacy` keep it off. Cells stream cooperatively (220 candidates per update, 2 400 while a ring is cold, the
ring publishing progressively nearest-first), the buffers are rewritten from the cached cells on a crossing, the
field steps once per frame.

**Measured (`.qa-dev/r73-capture.mjs`, `r73-metrics.mjs`, `r73-sheet.mjs`, `r73-bench2.mjs` / `r73-bench5.mjs`;
the sheets in `$SP/r73/review`).** Three tags on one build and one seed: `legacy` (`?ground=legacy`), `noGrass` (the redux terms on,
`?tallgrass=off` — the pure-terrain change) and `final`; views `chase` / `bird` (hull-relative), `ground-low` (1.7 m
beside the parked hull, 45 m ahead), `ground-mid` (14 m up, 160 m ahead), `ground-far` (400 m ahead) and the
round-56 strand views. The first sheets drove three fixes (the tundra sedge, the far ring's lift, the wet band's
width), the second the near ring's cap, the toggle bench the cut to 2.6 clumps / m² and two-segment blades, and the
legacy A/B the height-mix gate; the numbers below are the final build (the `legacy` and terrain-only frames re-shot
on it).

- *Tiling* — the strongest autocorrelation peak of the detrended far-ground crop at lags ≥ 24 px (the earlier lag-6
  "peaks" were the ground's own smoothness), `ground-mid` legacy → terrain-only → final: Whiteout 0.075 → 0.074 →
  0.185, Verdant 0.085 → 0.088 → 0.129, Saltwind 0.080 → 0.083 → 0.073, Steppe 0.119 → 0.123 → 0.112, Monsoon 0.027 →
  0.074 → 0.207, Desert 0.170 → 0.158 → 0.156; `ground-far`: Whiteout 0.228 → 0.204 → 0.171, Verdant 0.127 → 0.126 →
  0.120, Saltwind 0.085 → 0.085 → 0.086, Steppe 0.086 → 0.081 → 0.084, Monsoon 0.069 → 0.065 → 0.047, Desert 0.110 →
  0.117 → 0.123. The terrain's own repeat stays flat or falls; where the final value rises it is the sward's blades in
  the crop, not a tile.
- *Mid-ground detail energy* (mean |Laplacian|, rows 42–62 %): Whiteout 26.0 → 27.6 → 28.3, Verdant 43.4 → 43.5 →
  44.3, Saltwind 44.4 → 43.5 → 43.5, Steppe 44.5 → 45.6 → 46.1, Monsoon 31.4 → 31.6 → 31.7, Desert 25.6 → 25.6 → 25.7
  — within the bound; the mid octave adds relief without energy the crop can count.
- *Transition softness* (`chase`, terrain-only against legacy; hard-edge share / p90 gradient): Whiteout 0.046 / 13.9
  → 0.052 / 15.5, Verdant 0.201 / 34.8 → 0.211 / 36.4, Saltwind 0.238 / 35.8 → 0.240 / 36.9, Monsoon 0.069 / 20.4 →
  0.076 / 21.2, Desert 0.220 / 36.0 → 0.220 / 35.4 (the arid blend runs at 0.3, the conservative strength on sand —
  the owner's black-contour history there; the desert's share does not move); Steppe 0.312 / 39.3 → 0.138 / 27.5
  carries a dust plume in its legacy frame and does not compare. The height transitions move the p90 a few percent —
  ragged borders with a little more contrast, not stepped ones.
- *The wet strand* (Saltwind strand view, the darkest contiguous run per column against the dry-sand median): contrast
  0.314 → 0.314 → 0.316, width p90 112 → 100 → 96 px; Nordhavn 0.149 → 0.173, Fjord 0.305 → 0.345; the probe frames
  (`$SP/r73/swash`) are the eye's reference: `w030s15` reads as wet sand near the water with a dry backshore, `off` as
  one pale strip.
- *Sward coverage* (final against terrain-only, the share of the near band changed by more than 10 luma; `chase` /
  `ground-low`): Whiteout 6 % / 53 %, Verdant 49 % / 29 %, Saltwind 54 % / 68 %, Steppe 44 % / 49 %, Monsoon 49 % / 61
  %; the Desert control (no sward) 29 % / 8 % is the bots' and dust plumes' motion between two battle boots, so a
  map's own coverage is its number less the control's. Instances at the chase pose: Whiteout 9.4 k clumps + 3.3 k far
  blades, Verdant 27.9 k + 11.8 k, Saltwind 7.8 k + 2.8 k, Steppe 37.8 k + 16.4 k (the cap of the first sheets had
  truncated it at 40 k), Monsoon 26.3 k + 8.2 k.
- *The trail* (the hull driven five seconds — Tarkhan 45 m, Monsoon 53 m — then the bird view against the same frame
  with the press field cleared; the share of each band changed by more than 10 luma, near / mid / far): Steppe 9 % /
  11 % / 10 %, Monsoon 16 % / 22 % / 21 %; the Steppe crop of the chase view behind the hull shows the blades lying
  along the travel with the ground between them, two lanes wide.
- *Performance* (`.qa-dev/r73-bench2.mjs` toggle, `r73-bench5.mjs` repetition; the chase pose, 1600 × 900, the bots
  frozen, GPU time from one `EXT_disjoint_timer_query_webgl2` bracket round the whole frame). Two findings shape the
  method: a bracket per draw (`r73-bench3`) is not a draw's cost on ANGLE's Metal backend — every query boundary
  splits the render pass and stores / loads the attachments, ~4 ms a bracket (64 terrain brackets read 266 ms a frame)
  — so the only clean bracket is the frame; and the machine ran other lanes' headless renders throughout (load 20–170,
  foreign renderers at 260–1250 % CPU), which only ever add to a frame's elapsed time, so the repetition bench takes
  the lower quartile of each side and the numbers below are medians of ten rounds over two runs
  (`$SP/r73/bench5a.log`, load ~20; `bench5b.log`, load ~150), each round the sides alternated. Toggle on the first
  build (3.0 clumps / m², three-segment blades; medians of four rounds): Whiteout 0.83, Verdant 1.08, Saltwind 0.75,
  Steppe 1.87, Monsoon unresolved ms — Steppe over the tier's 1 ms budget, which drove the cut to 2.6 clumps / m² and
  two segments (−40 % triangles a clump, −13 % clumps). On the final build the toggle (the sward hidden / shown, ×1,
  rounds spanning ±3–5 ms) reads Verdant +0.85 and Monsoon +1.07 ms — the meadow maps at the budget's edge — and
  Whiteout −0.10, Saltwind −0.74, Steppe −1.21, inside the noise. Repetition (each sward draw issued eleven times
  inside the frame's own passes through `renderBufferDirect`, per copy = Δ / 10; the terrain chunks the same with the
  redux vectors on / zeroed, per copy = Δ / 11; the press step run eleven times): the sward Whiteout −0.14, Verdant
  +0.02, Saltwind −0.12, Steppe −0.06, Monsoon +0.25 ms per copy at 9.4–37.8 k clumps (rounds within ±0.6) — the
  sward's geometry pass (a repeated opaque copy adds vertex and raster work only; its fragments are one layer under
  the tile GPU's hidden-surface removal) costs under 0.3 ms on every map; the press step −0.21 / +0.04 / +0.24 / +0.12
  / +0.60 (a 256² RGBA16F quad; Monsoon's 0.6 held in both runs and is the one number here above its noise). The redux
  terms on the terrain material (the same program, the four vectors zeroed — the snow, strand and glint blocks and the
  height-mix taps are branch-gated on their uniforms, the fold and mid octave are arithmetic and one gated tap):
  Whiteout +0.57, Verdant +0.25, Saltwind +0.62, Steppe +0.29, Monsoon +0.36, Desert +0.50 ms per copy (rounds within
  ±1.4) — under the 0.8 ms budget on every map by the median, not by every round; the strand alone (`uReduxSwash`
  zeroed) within ±0.16 of zero on every map — a number the noise owns, not one the 0.2 ms budget can be held to, and
  the block runs only on the sea ramp's pixels. World update CPU (the sward's cooperative cells, the press stamps, the
  clock): +0.0 ms on every map (the `update` wrap, medians), the frame's CPU within ±0.3 ms of the sward-off frame.
  Draw calls: two instanced draws (neither ring casts a shadow) and the press field's one quad, +3 of the budget's 6;
  the terrain's draw count is unchanged (the fold is an attribute, the transitions are uniforms). Sampler budget: the
  terrain material still declares ten (`uAlb*`/`uNrm*` × 4, `uMask`, `uNoise`); the sward's material one (`uPress`).
- *Monsoon's hillside* looked to mass dark under the far ring on the first sheets; its mean over the hill box reads
  45.4 (legacy) / 46.0 (terrain-only) / 48.1 (final) — the authored dark laterite slope, unchanged.
**Receipts.** `groundRedux.selftest` (every map's row and bands, the biomes where they belong, the packing, the quality
knob, the material's contract — ten samplers, v40, the transitions, the folds, the strand, the clock), `groundPressure`
(gates, targets, the step shader, the packing, the stepping, the CPU twin, the wiring), `tallGrass` (the geometry,
gates, a settled ring's exclusions and hollows, determinism, the knob, streaming, reeds, the shader, the engine hooks,
the wiring); the fetch census +7 with the note, the uniform list, `world-terrain-splat-v40` and its negative control,
the fold attribute in `terrainStreaming`, the sandboxed material steps in `terrainSplatFields` / `terrainWetLayer`.

### Round 73b — 2026-09-26: the second pass on the ground — the borders read, the strand runs up the beach, the sedge keeps to the hollows

**Integrator (2026-09-26, on the round-73 sheets):** the tall grass is the visible win (Steppe's wheat at the ground-low
view, the Saltwind / Verdant / Monsoon swards, the press trails), but the terrain-material terms — the height-blended
transitions, the scree, the folds, the mid octave — are invisible at the ground-mid and ground-far views, the wet strand
is invisible even at the strand view (Saltwind 0.31 → 0.32), and Whiteout's tundra sedge reads as scattered dark sticks
in the snow. Same branch base (round 73 rebased over the mountains and the clouds), the same `?ground=legacy` A/B, the
horizon / vista modules untouched, nothing in `src/sim`. Every mechanism below is a knob in the profile table, inert at
zero.

**Why round 73's terms could not read (two findings that shape the pass).** (1) The transitions were a LINE. The
height-and-noise mix broke the border's shape, but both sides kept their own tone, and at 40–120 m — where the
normals have mipped flat — a dirt patch met its turf with nothing to see. What a border needs at range is a third
tone along it (a torn, damp lip; a lichen rim; a gravelled verge), in albedo, so it survives the mip fade. (2) The
strand was sized in the wrong unit. Round 73 read its band off the mask's wetness ramp (`fM`), and on a real beach that
ramp is two metres wide: Saltwind's sea disc carries a 20 m shelf on a 165 m local radius at the strand view, so the
contour's 0.80 → 0.96 wetness ramp is 13 m long and the 0.02–0.16 apron the material calls "sand" is 0.16 of it — two
metres. Whatever width the profile asked for (0.12 or 1.9 ramps), the film lived inside those two metres under the surf
line, and the `strand` gate ramped it to nothing across them. A swash runs up a beach by METRES; the band needed a
metric distance from the waterline, which no channel of the mask carries.

**The borders (`terrain.ts` v43, `uReduxB`; no sampler — two more packed vectors, `uReduxB` and `uReduxC`).** After the
layer mixes: a *lip* at the worn patches' edges (`4 fD (1 − fD)`, broken by the near noise: −15 % luma and a damp
brown shift — the sod torn, the soil open), a *rim* on the outcrops at their turf border (`4 fR (1 − fR)`, the rock
tinted by climate through `uReduxC.rgb`: lichen grey-green-yellow on the temperate maps, moss on the wet and tropical
ones, a dust bloom on the arid, hoar on the snow), and a *verge* on the road shoulders where the shoulder's own dirt
shows (the carriageway's clamped zero-mean rock grain as grit, a dusty paler tone, matte; inside 160 m). All three
vanish at full and zero coverage (a road stays a road, a field a field) and off the wall projections; the arid row keeps
the lip at 0.25 (the owner's black-contour history on sand). The 26–150 m octave gained an albedo term beside its normal
(the same 1.1 m re-projection as a zero-mean high-pass against the tile's deep mip, ±0.30, band 20–190 m): the
tussocks and clods of the mid band read by tone where the normal's shading has mipped flat. The folds reach further
down the curvature (thresholds 0.10–0.60 → 0.06–0.50: a gentle map's folds sit under 0.4) and read stronger
(moisture −16 % → −22 %, crest +6 % → +9 %). A scree skirt (the round-73 band, 26°–47° under the rock take-over)
is now authored on the meadow and hill maps too (Verdant 0.25, Autumn 0.3, Frontier 0.3, Monsoon 0.3, the towns
0.15–0.2); the arid maps keep none.

**Snow.** The drift wave is a sawtooth, not a sine — a long stoss slope climbing to a sharp lee crest that drops in a
fifth of the 15 m wavelength — so the drifts carry an EDGE: the normal tilts as before and a shaded lee face under the
lit crest line (`uReduxC.w`, −13 %, inside the 15–50 m ramp) survives in albedo where the normal has mipped away. The
wind-scoured crust (round 73's cooler, darker macro) publishes itself to the roughness stage and takes a satin sheen
(0.92 → 0.62 at full scour), so the exposed patches catch the low sun where the powder stays matte.

**The strand in metres (`shore`, a second vertex byte).** Every terrain chunk vertex now carries its distance landward
of the sheet's waterline, baked at build from the map's own shoreline contours (the lake and marsh discs the mask bake
and the sheet share; the waterline is where the contour's wetness ramp crosses the map's sea ramp — a bisection once
per map) as one normalised byte over 0–32 m, INVERTED (255 at the waterline, 0 at 32 m and beyond) so a geometry
without the attribute — the horizon ring's bands share this material — reads as far from any shore; the skirt
continues its top vertex, a frozen or dry map bakes nothing. The material's strand block runs on it: below the run-up's
breathing reach (`swashReachM` × (0.55 + 0.45 sin) on the water sheet's clock, per map: Saltwind 4.5 m, Saltmere 6,
Nordhavn 4, Mangrove Reach 3) the ground is a film — darkened 50 % × strength (75 % at Saltwind's 1.6), a shade more
saturated, cast cool by the water (× (0.90, 0.95, 1.0)), roughness 0.30 with the ripples smoothed under it (0.22
mirrored the whole sky at the strand view's grazing angle and lifted the band pale — the probe frames say so); a
sharp, ragged swash line at the reach (a 0.5 m smoothstep with the near noise); a damp band above it to the
high-water mark (1.3 × reach + 0.8 m) at 55 % of the film; a *foam line* the last run-up left at the reach (a 0.3 m
Gaussian, broken by the noise fields, 40 % toward a pale grey, matte — sea maps only); a *wrack line* at the mark
(−38 %) with pebbles and shell — the rock tile's clamped zero-mean grain on the wet sand and along the wrack, inside
90 m. A lake or a river (no period) keeps a steady muddy margin (the film tinted toward mud, no foam). The band wets
whatever the beach is — the authored sand near the water, the marram's edge above it; a first cut that extended the
sand layer to the high-water mark laid an orange band over Saltwind's turf and was removed. `uReduxSwash.y` is the
reach in metres, `.w` the lines' strength; the round-73 `swashWidth` (ramp multiples) is gone.

**Reeds as a margin (`tallGrass.ts`).** A reed biome is a waterline fringe: dense at mask 0.04–0.10 (`waterBand`
0.85), thinning to nothing by 0.40, taller at the water (+30 %, to the 1.9 m cap), the banks' own meadow at `bank`
(0.2–0.7) of the reed density — round 73 grew reeds at 1.0 over the whole 0.04–0.6 band and overrode the density with
the bank's, so the margin was no denser than the bank. A meadow with `reedMargin` (Monsoon 0.55, Highland Reservoir
0.5) grows the same fringe along its lake — tall (1.9 m), a quarter wider, olive (the tint's blue at 0.55).

**Tundra sedge.** The sedge keeps to the hollows and the lee sides in clumps: the admission multiplies by
`(0.06 + 1.6 hollow) × (0.35 + 0.65 lee) × (0.15 + 0.85 cluster)` — the baked fold's hollow, the slope's downhill
direction against the map's wind (a lee slope's downhill runs with the wind), the terrain's ~10–20 m `n1` patches —
so open windward snow carries 6 % of the density and a lee hollow the whole of it, taller (+45 %) in the hollow; the
straw is darker (tip 0.17 / 0.14 / 0.075, was 0.27 / 0.22 / 0.12) and the far ring's tundra blades keep half their
tint (the far ring lifts its tips a third, which lit them white on the snow). The pale crossed cards in the Whiteout
frames are the vegetation tier's winter tuft carpet (`vegetation.ts`, authored per map), not the sedge — noted below.


**Measured (`.qa-dev/r73b-capture.mjs`, `r73b-metrics.mjs`, `r73b-sheet.mjs`; the sheets in `$SP/r73b/review`, the
crops in `review/crops`, the tables in `$SP/r73b/metrics-tables.md`).** Three columns on the same seed and views as
round 73: `legacy` (`?ground=legacy` on this build), `round 73` (the base commit 4c90efe48 in its own detached
worktree beside this one — its exact code, the same node_modules) and `73b` (this build), plus `73b terrain-only`
(`?tallgrass=off` on this build) where the sward would confound the read; the strand sheet carries Mangrove Reach and
Monsoon Ridge on a `strand-auto` view (the camera 4 m over the ground a few metres landward of the waterline nearest a
seed point, found by a scan of the wetness field, looking along the shore) — round 73 had no strand view for either.
Sheets: `sheet-six-{chase,ground-low,ground-mid,ground-far}.png` (legacy | round 73 | 73b), `sheet-strand.png`
(Saltwind, Saltmere, Nordhavn, Mangrove, Monsoon).

#### Six maps — ground-mid: the 40–120 m band (rows 55–75 %: 43–105 m at 14 m up) detail |Laplacian| and tiling peak; the round-73 crop (rows 42–62 %: 73 m to the horizon) beside it; legacy → round 73 → 73b (→ 73b terrain-only)
| map | detail 40–120 m | tiling 40–120 m | detail (round-73 crop) | tiling (round-73 crop) |
|---|---|---|---|---|
| whiteout | 24.4 → 26.2 → 27.0 → 27.6 | 0.117 → 0.198 → 0.240 → 0.199 | 27.6 → 28.5 → 28.9 → 28.9 | 0.081 → 0.159 → 0.160 → 0.094 |
| verdant | 43.6 → 42.9 → 42.3 → 43.1 | 0.057 → 0.061 → 0.066 → 0.068 | 44.0 → 43.0 → 42.6 → 43.4 | 0.088 → 0.118 → 0.111 → 0.084 |
| saltwind | 47.4 → 45.1 → 45.3 → 44.4 | 0.100 → 0.147 → 0.155 → 0.119 | 44.5 → 43.4 → 43.2 → 43.0 | 0.044 → 0.088 → 0.108 → 0.079 |
| steppe | 42.4 → 42.3 → 42.0 → 43.7 | 0.079 → 0.086 → 0.080 → 0.072 | 45.5 → 46.8 → 46.6 → 46.0 | 0.097 → 0.092 → 0.090 → 0.088 |
| monsoon | 33.5 → 34.4 → 35.8 → 31.3 | 0.051 → 0.108 → 0.125 → 0.052 | 31.0 → 31.0 → 31.5 → 30.3 | 0.033 → 0.092 → 0.121 → 0.029 |
| desert | 25.7 → 26.0 → 27.0 → 26.8 | 0.131 → 0.131 → 0.117 → 0.112 | 25.7 → 25.8 → 26.0 → 26.1 | 0.168 → 0.195 → 0.178 → 0.161 |

#### Six maps — ground-far detail / tiling (round-73 crop), legacy → round 73 → 73b
| map | detail | tiling |
|---|---|---|
| whiteout | 22.5 → 22.4 → 22.7 | 0.184 → 0.193 → 0.195 |
| verdant | 35.3 → 34.5 → 34.4 | 0.127 → 0.113 → 0.117 |
| saltwind | 27.3 → 26.8 → 26.7 | 0.099 → 0.082 → 0.084 |
| steppe | 34.5 → 30.0 → 31.4 | 0.092 → 0.126 → 0.129 |
| monsoon | 28.0 → 27.8 → 29.3 | 0.070 → 0.057 → 0.094 |
| desert | 27.4 → 27.8 → 27.6 | 0.166 → 0.174 → 0.159 |

#### Six maps — transition softness (chase / ground-low; hard-edge share and p90 gradient), legacy → round 73 → 73b (→ 73b terrain-only)
| map | chase hard share | chase p90 | ground-low hard share | ground-low p90 |
|---|---|---|---|---|
| whiteout | 0.037 → 0.056 → 0.047 → 0.043 | 14.6 → 16.7 → 15.9 → 15.5 | 0.045 → 0.062 → 0.038 → 0.052 | 18.1 → 17.7 → 14.5 → 18.9 |
| verdant | 0.203 → 0.249 → 0.255 → 0.221 | 35.0 → 41.0 → 42.0 → 37.6 | 0.166 → 0.179 → 0.180 → 0.168 | 32.0 → 33.7 → 33.9 → 32.3 |
| saltwind | 0.211 → 0.253 → 0.255 → 0.203 | 33.6 → 38.5 → 39.0 → 34.6 | 0.241 → 0.241 → 0.236 → 0.238 | 34.5 → 35.3 → 34.8 → 34.2 |
| steppe | 0.106 → 0.367 → 0.376 → 0.153 | 24.6 → 43.6 → 44.3 → 28.8 | 0.088 → 0.240 → 0.240 → 0.093 | 22.7 → 37.5 → 37.0 → 23.3 |
| monsoon | 0.045 → 0.129 → 0.132 → 0.048 | 16.2 → 27.4 → 27.6 → 16.9 | 0.100 → 0.133 → 0.139 → 0.101 | 24.0 → 27.7 → 28.3 → 24.1 |
| desert | 0.082 → 0.084 → 0.220 → 0.085 | 21.9 → 22.2 → 35.3 → 22.4 | 0.051 → 0.051 → 0.103 → 0.050 | 16.4 → 16.3 → 24.5 → 16.4 |

#### The strand (strand view): the sand-band metric (sand-hued pixels only — contrast 1 − p05 / median, higher = a stronger band; the wet share under 0.72 × median) and the round-73 column metric (the darkest run per column against the median: the sea fills its columns), legacy → round 73 → 73b
| map | sand contrast | wet share | sand median luma | r73 column contrast | r73 width p90 px |
|---|---|---|---|---|---|
| saltwind | 0.319 → 0.254 → 0.414 | 0.067 → 0.041 → 0.174 | 176 → 156 → 129 | 0.320 → 0.330 → 0.346 | 110 → 76 → 43 |
| coastal | 0.241 → 0.271 → 0.505 | 0.037 → 0.047 → 0.248 | 197 → 168 → 170 | 0.152 → 0.173 → 0.218 | 123 → 44 → 35 |
| fjord | 0.419 → 0.447 → 0.498 | 0.192 → 0.123 → 0.166 | 72 → 77 → 82 | 0.312 → 0.355 → 0.356 | 83 → 94 → 108 |
| mangrove | 0.324 → – → 0.495 | 0.096 → – → 0.270 | 57 → – → 66 | 0.147 → – → 0.179 | 62 → – → 75 |
| monsoon | 0.324 → – → 0.355 | 0.096 → – → 0.162 | 57 → – → 51 | 0.295 → – → 0.248 | 34 → – → 43 |


What the tables say. *The strand:* the sand-band contrast on Saltwind 0.319 (legacy) → 0.254 (round 73) → 0.414 (73b)
and its wet share 0.07 → 0.04 → 0.17; Saltmere 0.241 → 0.271 → 0.505 (wet share 0.04 → 0.05 → 0.25); Nordhavn 0.419 →
0.447 → 0.498; Mangrove 0.393 → 0.495, Monsoon's lake margin 0.324 → 0.355 (the muddy banks were dark already). The
breathing reach moves a single frame's number by ±0.05 (the Saltwind probe read 0.41–0.51 across its cases at one
strength), so the target of 0.45 is met on Saltmere, Nordhavn and Mangrove by the frame and on Saltwind by the band
(0.41–0.44 across four frames) — the eye's reference is the sheet's third column: a dark, cool film with a ragged
swash line and a foam line, the damp band, the dry sand, the wrack. The round-73 column metric (the darkest run per
column, sea included) moves 0.320 → 0.346 on Saltwind and 0.152 → 0.218 on Saltmere for what it is worth. *The
ground-mid band:* the 40–120 m |Laplacian| does not move on the meadow maps (Verdant 43.6 → 42.9 → 42.3, terrain-only
43.1; Steppe 42.4 → 42.3 → 42.0, terrain-only 43.7) and rises on the snow (Whiteout 24.4 → 26.2 → 26.6, terrain-only
27.6: +13 % over legacy) and on Monsoon (33.5 → 34.4 → 35.8: +7 %); the round-73 crop is flat everywhere within ±2 %.
The uniform-isolation probe (the method findings above) is the reason: the 73b terms change a third of the band's
pixels by more than 10 luma with no change in the edge count. *Tiling:* the 40–120 m peak on Whiteout rose with the
sawtooth drifts on the first final frame (0.198 → 0.278) — the wavelength swing was added for it and the row below is
the re-capture; Saltwind 0.147 → 0.155, Monsoon 0.108 → 0.125 (the sward's blades in the crop, as round 73 found:
terrain-only 0.119 / 0.052), Verdant, Steppe and the desert flat. *Softness:* the chase hard-edge share and p90 stay
round 73's on every map (Verdant 0.249 → 0.255, Saltwind 0.253 → 0.255, Steppe 0.367 → 0.376, Monsoon 0.129 → 0.132)
and the terrain-only column reads within 0.02 of legacy — the borders are tonal, not stepped; the desert's 0.084 →
0.220 in the `73b` column is the bots' dust in that frame (terrain-only 0.085, legacy 0.082), not a term.


**Performance (`.qa-dev/r73b-bench.mjs` = round 73's repetition bench plus a `r73b` layer — the terrain drawn eleven
times with `uReduxB` / `uReduxC` and the strand's lines zeroed against the full profile; `redux` still zeroes every
vector, so redux − r73b is round 73's share on this build; `r73b-bench-paired.mjs`, new — the two sides of a layer
alternate every frame inside one window, with the paired-delta median and the low-quantile side deltas). The machine
ran other lanes' headless renders throughout (load 70–100, foreign renderers on the GPU), and that sets the floor:
the eleven-times terrain frame ran 130–240 ms here against round 73's ~60–100, and the per-copy deltas of five rounds
spanned ±1.5–4 ms — the round-73 method cannot hold a 0.8 ms budget at this load, and the paired medians carry the same
per-frame jitter (whiteout redux MAD ±2.9 ms per copy at 120 pairs), because the noise is per frame and scales with
the frame. What can be read: the medians of the repetition rounds (`$SP/r73b/logs/bench-a.log`, five rounds, the
chase pose, 1600 × 900, the bots frozen) and the low quantiles of the interleaved sides (`bench-paired-b.log`, 300
pairs at ×5 on the terrain layers; a foreign GPU pass only ever adds to a frame, so the cleanest frames of two sides
sampled within the same seconds carry the least of it):

Repetition bench (per copy, ms; the median of five rounds with the rounds in brackets):

| map | redux terms (round 73 + 73b, per copy) | 73b terms alone (per copy) | strand alone (per copy) | sward geometry (per copy) | press step (per copy) | sward toggle ×1 (in-frame) | 11× frame p25 | rounds |
|---|---|---|---|---|---|---|---|---|
| whiteout | 1.40 (-3.88 1.75 0.07 4.61 1.40) | 0.47 (0.47 0.75 -0.73 -1.13 0.88) | -1.97 (0.26 -2.49 -3.10 -1.97 0.33) | -0.26 (-0.21 -0.62 -0.44 -0.13 -0.26) | -0.23 (0.03 -0.30 -0.23 -0.34 0.01) | -2.06 (2.16 2.69 -2.06 -2.06 -2.53) | 142 | 5 |
| verdant | 0.33 (-1.18 1.43 0.33 1.43 0.19) | 0.25 (2.54 0.20 0.58 0.25 0.17) | -0.51 (-1.00 0.39 0.29 -0.51 -1.07) | 0.08 (0.11 0.35 -0.24 0.08 -0.25) | -0.23 (-0.23 -0.12 -0.52 -0.17 -0.74) | -2.70 (-4.53 -2.70 -4.49 -0.66 2.42) | 143 | 5 |
| saltwind | -0.03 (-0.03 0.95 -0.06 0.49 -0.38) | 0.11 (-0.75 0.60 1.07 -0.31 0.11) | -0.08 (-0.09 -0.05 -0.28 0.94 -0.08) | -0.00 (-0.06 0.56 0.04 -0.36 -0.00) | 0.64 (0.37 0.39 0.74 0.88 0.64) | -1.25 (-1.64 -3.59 -0.76 -1.25 0.72) | 142 | 5 |
| steppe | 0.37 (0.26 1.27 -0.57 0.93 0.37) | 0.12 (-0.36 0.12 -0.36 0.26 0.95) | 0.18 (-1.15 0.18 0.25 -0.37 0.20) | -0.32 (-0.32 0.17 -0.39 -0.51 0.28) | -0.15 (-0.23 -0.15 -0.20 -0.05 0.37) | -1.73 (0.79 -0.91 -1.73 -1.94 -5.66) | 93 | 5 |
| monsoon | 1.22 (1.38 1.22 0.15 1.69 -0.50) | -0.26 (-0.26 0.73 0.44 -0.57 -0.76) | -0.56 (-0.58 -0.11 -0.63 0.33 -0.56) | -0.04 (0.14 -0.04 0.04 -0.21 -0.10) | 0.34 (0.81 0.47 0.24 0.34 0.03) | 1.20 (3.66 3.40 1.20 -2.56 -1.05) | 149 | 5 |
| desert | 1.04 (3.19 1.04 -0.73 1.32 -0.02) | 0.56 (0.10 1.16 1.07 0.56 -0.78) | 0.01 (0.01 -0.96 0.01 1.72 -0.01) | n/a | n/a | n/a | 126 | 5 |

Paired bench (`bench-paired-b.log`: 300 pairs at ×5, the terrain layers; per copy, ms — the paired-delta median with its
p25 / p75 and MAD, the layer's p05-frame delta is the "low-quantile" figure the log carries):

| map | redux terms (round 73 + 73b, per copy) — median (p25 / p75, MAD) | 73b terms alone (per copy) — median (p25 / p75, MAD) | strand alone (per copy) — median (p25 / p75, MAD) | sward geometry (per copy) — median (p25 / p75, MAD) | press step (per copy) — median (p25 / p75, MAD) | 11× frame median hi / lo (redux) | pairs |
|---|---|---|---|---|---|---|---|
| whiteout | 1.808 (-1.53 / 4.72, ±3.10) | 0.883 (-1.62 / 3.34, ±2.50) | -0.206 (-2.23 / 2.35, ±2.20) | n/a | n/a | 101 / 93 | 302 |
| verdant | -1.826 (-3.86 / 0.99, ±2.52) | 1.144 (-1.62 / 2.77, ±2.45) | 0.269 (-2.22 / 2.25, ±2.29) | n/a | n/a | 69 / 77 | 302 |
| saltwind | 0.262 (-2.13 / 2.47, ±2.28) | -0.320 (-2.19 / 2.32, ±2.39) | -0.185 (-2.46 / 2.20, ±2.33) | n/a | n/a | 71 / 70 | 302 |
| steppe | -0.397 (-1.84 / 1.49, ±1.61) | 0.237 (-1.46 / 1.78, ±1.65) | -0.123 (-1.88 / 1.63, ±1.76) | n/a | n/a | 45 / 48 | 302 |
| monsoon | -0.069 (-2.60 / 2.39, ±2.51) | -0.189 (-2.23 / 2.14, ±2.22) | 0.223 (-2.01 / 2.33, ±2.11) | n/a | n/a | 73 / 74 | 302 |
| desert | 0.576 (-2.07 / 2.42, ±2.25) | 0.610 (-1.74 / 2.55, ±2.21) | -0.347 (-2.41 / 2.01, ±2.20) | n/a | n/a | 71 / 69 | 302 |

**Verdict on the budget.** Neither bench resolves the terrain terms to the 0.8 ms line at this load: the paired MADs
are ±2.2–3.1 ms per copy at 300 pairs (the frame-to-frame jitter of a contended GPU, which scales with the frame
and so cancels no reps), the five-round medians spread ±1.5–4 ms, and Verdant's all-terms delta reads NEGATIVE by
−1.8 ms in the paired run — the sign of the noise, not of the shader. The sward (×1, short frames) and the press step
read clean at ±0.3–0.5 ms MAD and sit at zero. By construction the pass added six gated taps (two on the shoulder's
dirt inside 160 m, two in the 20–190 m band on open ground, two on the wet band inside 90 m) and ~40 ALU ops per
fragment on the same program; round 73's own reading of the whole redux family was 0.25–0.62 ms per copy at load
20–150 with rounds within ±1.4. The budget question stays OPEN until a quiet window (load under ~20, no foreign
renderer) re-runs `r73b-bench.mjs` — the tool and the layer are in place, and the number to hold is redux ≤ 0.8 by
the median of ten rounds, r73b ≤ 0.3.

The sward's geometry and the press step read as round 73 found them (within ±0.3 and ±0.25 ms of zero on every map —
the press step's own cost is the isolated probe's 0.01–0.05 ms, above). Draw calls are unchanged from round 73 (the
borders are arithmetic on the same program, the shore is a vertex attribute, no new pass); the terrain material
still declares ten samplers (pinned) and the fetch census moved +6, every tap inside a gated band (the verge inside
160 m on the shoulder's dirt, the mid albedo in its 20–190 m band, the pebbles on the wet band inside 90 m). Mobile
keeps today's ground.
**Monsoon's press cost (round 73: 0.6 ms per copy where the other maps read ~0.1).** Not a cost. The round-73 number
came from the frame bracket (one `TIME_ELAPSED` query round the whole frame, the press step run eleven times inside
it), and on Monsoon the two sides of that bracket differed by ±2.3 M triangles and ±86–110 draw calls between samples
(`$SP/r73/bench5a.log`: `tris Δ −2329385 calls Δ −86` in one round, `+2332785 / +110` in the next — the jungle's
vegetation streaming) on a frame whose lower quartile sat at 14.6 ms with a 9–11 ms minimum and a 17 ms median; the
step's rounds were 0.35 / 0.82 / 0.02 / 0.62 / 0.52 — a bimodal frame, not a pass. The isolated probe of this round
(`.qa-dev/r73b-press-probe.mjs`: one query round `pressure.step` alone, ×1 and ×10) found the step's own cost by its
minimum — the only statistic a tiny pass keeps on ANGLE's Metal backend, where a query spans the command buffer it
lands in, so the median of an isolated bracket carries whatever else that buffer holds (Verdant's ×1 median read
5.0 ms for a 256² quad, Monsoon's 0.11, Steppe's 4.2; the minima 0.046 / 0.017 / 0.046 ms; per copy at ×10 the minima
0.014 / 0.011 / 0.021 ms). The press step costs 0.01–0.05 ms on every map, Monsoon's included; the step shader was
not changed. What the pass did fix on Monsoon is the reason the frame is heavy: nothing — it is the jungle, and it
was heavy before the sward.

**Method findings.** (1) The round-73 "mid-ground detail" crop (rows 42–62 % of the ground-mid view) runs from 73 m
to the horizon at that camera (14 m up, 55°, aimed 160 m out: row 62 % looks 73 m out, row 42 % at the skyline), so
its upper half is the far field and no 26–150 m term can move it; the 40–120 m band is rows 55–75 % (43–105 m), which
`r73b-metrics.mjs` adds as `detailMid` / `tilingMid`, and the strand's `band` metric took the darkest run of every
column of the middle half against the column median — on the strand views the sea fills those columns, so it measured
the sea (Saltwind 0.314 → 0.316 across round 73); the `sand` metric restricts itself to the sand-hued pixels (r > g >
b, warm) and reports 1 − p05 / median. (2) A mean |Laplacian| does not see a 1–5 m tonal term at 50–100 m (2–10 px
blobs after the mip chain): the uniform-isolation probe of the ground-mid view (`r73b-mid-probe.mjs`, the sward off)
found the 73b terms changing 32 % of the band's pixels by more than 10 luma (mean |Δ| 17) between `uReduxB` on and
off, and the mid albedo octave alone 34 %, while `detailMid` moved 42.9 ↔ 43.1 and even every redux term zeroed read
43.5 — the metric is geometry edges (trees, bushes, the road) and pixel-scale grain; the terms the eye reads at that
range are tonal, and the pair metric (the share of the band changed) is the number that sees them. The far ring's
blades, averaged with the ground, LOWER it (Verdant legacy 43.5 → 73b 42.9 with the sward, 43.1 without). (3) On
ANGLE's Metal backend an isolated timer bracket is clean only in its minimum (above). (4) The strand view is a
grazing-angle view of the beach: a film at roughness 0.22 mirrored the sky and read PALER than the dry sand.


**Receipts (round 73b).** `groundRedux` (the new knobs and their bands, the reed `bank` / `reedMargin`, the scree on the
meadow maps and none on the arid, the six-vector packing with the reach in metres and its clamps, the tint clamp, the
v43 contract — the borders, the mid albedo, the sawtooth drifts, the crust and foam globals, the strand in metres, the
shore byte's vertex hook / attribute / bake / inversion, no new sampler), `tallGrass` (the reed margin: dense at the
waterline, gone by the open-water cut, the bank thinner, the fringe taller; a meadow's reed margin tall and olive; the
tundra clumps in the hollow and on the lee slope, the ring sparse beside a meadow's), `groundPressure` (unchanged),
`terrainMaterialOwnership` (the uniform list +2, the key v43 with its negative control, ten samplers),
`terrainWornDirt` / `wallSkyLight` (v43), the fetch census +6 with its note (`terrainMaskShaderTestOracle`),
`terrainStreaming` (the `shore` attribute beside the fold), and the round-73 list of 80 terrain-reading receipts green
twice (before and after the drift swing); `npm run typecheck`. No map config moved, so `villageWear` and
`mangroveWaterPalette` kept their digests. Tools (untracked, `.qa-dev/`): `r73b-capture.mjs` (strand-auto),
`r73b-metrics.mjs` (the 40–120 m band, the sand-band strand metric), `r73b-sheet.mjs` (three columns),
`r73b-strand-probe.mjs`, `r73b-mid-probe.mjs`, `r73b-press-probe.mjs`, `r73b-bench.mjs`, `r73b-bench-paired.mjs`,
`r73b-crop.mjs`.

**Honest weak list (round 73b).** The ground-mid |Laplacian| does not move (above): what the eye reads at 40–120 m
on the meadow maps is the sward and the tonal borders, and a metric that counts pixel edges cannot be moved +10 % by
a tonal term without adding the pixel-scale grain the r5 shimmer rules forbid; the terrain-only pair metric is the
number that sees the pass. The lip and rim are subtle by design on the arid maps (0.25 / 0.5) — the desert reads much
as it did. The wet strand at the strand view sits at 0.41–0.44 on Saltwind by the sand-band metric (the breathing
reach moves it ±0.05 between frames) and reads as a dark cool band with a swash line, but at the grazing strand
camera the film's sheen still lifts it toward the sky where the sun is behind the camera; from the chase camera it
reads darker. Whiteout's pale crossed cards in the snow are the vegetation tier's winter tuft carpet (authored per
map in `vegetation.ts`), not the sedge — they are what the eye takes for "sticks" once the sedge is in the hollows,
and a map-config change was out of this lane's scope (the history receipts pin every byte of `maps/*.ts`). The
drift trains on Whiteout are periodic by nature (a 15 m sawtooth); the per-cell wavelength swing and the two-field
phase are what round 43 gave the dunes, and the ground-mid tiling peak is the number to watch on the next capture.
The shore byte is 8 bits over 32 m (12.5 cm) on chunk vertices 2.7 m apart at LOD 0 — the band's edge is piecewise
linear between vertices, hidden by the noise break-up up close and by distance further out; a coarser LOD carries
it further apart, so a strand seen from 200 m+ is the coarse mesh's. Mobile keeps today's ground.

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

### Round 75 — 2026-09-26: structures and props to the skies' and mountains' level (containers, halls, yards)

**Brief (integrator, on the deploy-98 census frames):** Railyard's containers were flat vertex-painted cubes on a
bare brick box's flat grey yard; Whiteout's yard the same cubes; Urban's facades and Coastal's farms were the bar.
Lane `world/props-r75` from f21114ddf (deploy 98). Every mechanism is first-party generated geometry and generated
texture; no image, model or third-party asset is loaded.

**1. Containers on a painted-steel atlas (`src/world/propsSteelAtlas.ts`, `maps/railKit.ts`).** A new props bucket
and material, `steel` (MeshStandardMaterial, vertex colours, a 512 px generated atlas in four 128 px strips — two
marked side strips with corner posts, top and bottom rails, fork pockets, an ISO-style stencilled code block, a
faded operator band with a wordmark and chevrons, patched panels; a plain strip for roofs, tanks and drums; a door
strip with the two leaves, the centre gap, gasket lines, the bar shadows, the code and a CSC plate, and the blank
end). The atlas repeats in u only — a container side is exactly one atlas width (6.1 m at 84 px/m), each face is
mapped into its strip (`mapBoxFaceUv`), so no face ever reads a neighbouring strip. The albedo is a near-white
luminance so the vertex colour is the paint (an operator livery per box from the battlefield's set — brownfield,
polar, martian), the markings are dark stencils (a canvas alpha channel is premultiplied on upload, so there is no
light-on-dark mask; every livery is light enough to carry black lettering), the normal map stands the trapezoid
ribs at ~25°, and the ORM blue channel is a rust mask. Each box: the body with its door face dropped from the
index (the solid's hull is still the whole 2.44 × 6.1 m rectangle), a recessed door leaf, four reveal strips, four
locking bars, two handles and two hinges — 176 triangles, every door part strictly inside the body's footprint.
Draw discipline: the builder makes exactly the draws the cubes made on the shared seeded stream (count, livery,
yaw, offset, the 24 paint values, the stack roll, the stacked box's draws, the gap) and takes the cubes' four
`jitterUV` draws as consume-only; every new decision comes from a local stream forked off an existing draw
(`userData.uvJitter = 'consume' | 'none'`, props.ts `jitterBuildingUvs`). Result: every later placement and every
dedicated collision shard byte-identical on the container maps (headless probe `.qa-dev/r75-world-probe.mjs`:
railyard buildings / obstacles / colliders / destructibles digests equal to the base; Mars identical).

**2. Freight warehouses and the quonset hut (`maps/railKit.ts` makeWarehouse, `maps/structureKit.ts`).** The
warehouse gains roller shutters between guide posts under a shutter box (the timber leaves' draws kept, the leaves
re-bucketed to the sheet material), a skillion dock canopy on two posts, rubber dock bumpers, 6 cm ridge skylights
on both roof planes (a 0.14 m glazing box on a 0.95 m width biased the pitch audit's regressed slope past its 0.004
rad gate), eave gutters and a painted sign board on the street gable; a map that authors `props.industrialCladding:
'steel'` (Whiteout) clads the walls and gables in corrugated sheet with corner trims and a girt line — the plinth
and dock stay stone so the Foundry court's support census holds. The light kit's sheet steel (`structureMetal`) is
now a 256 px trapezoid corrugation with panel seams (a three-texel ramp: the surface receipt keeps every normal
within 32° of the wall plane), rivet lines, scratches and a rust mask; the quonset hut runs its ribs across the
length like bent sheets and gains a framed wicket door, rear apertures, a base skirt, a threshold plate and a
stovepipe, its new parts painting from a stream forked off the shell's first vertex value (the first cut drew from
the kit's stream and moved 38 wall modules by a millimetre through their terrain-fitted jitter).

**3. Yard dressing (`src/world/yardDressing.ts`, `maps/yardClutterKit.ts`).** A renderer-free planner lays pallet
stacks, crate clusters, drums, drum ranks, cable drums, tyre stacks, saddle-mounted fuel tanks and lipped skips in
the apron band 0.6–2.6 m outside each industrial structure's envelope (container rows, warehouses, sheds, gantries,
factories, depots, offices, fire stations, water towers), each kind with its own family mix and count under a
per-map budget (`props.yardDressing`, default 4.5 a structure, at most 140; Whiteout 60; polar 0.7 ×; no timber on
Mars), refusing roads (4.5 m + radius), water, ground under normal.y 0.9, the rail berth, every solid the map
already placed, every other structure's envelope and its own pieces' spacing; ranks, tanks and skips align with
the structure they serve. Its stream is its own (seed + 7501): no placement moves, no collision or destructible
record is published — dressing, not obstacles. The yard has no draw of its own (follow-up 2, below): every piece
is a transformed copy of its family geometry with the livery baked into its vertex colours, pushed into the map's
wood / steel / baked bucket before the bucket merge and drawn with the structures — railyard 119 pieces and
23.5 k triangles, foundry 138 / 25.3 k, Whiteout 30 / 6.4 k, zero extra draws. Planned buildings carry their plan
kind on the placed-building feature.

**4. The weathering law (world-props-*-v7, every props surface).** In the shared grime hook: upward faces
sun-fade a little (bleach and desaturate by the world normal), and the ORM blue-channel rust mask is mixed toward
rust with a world-space break-up and runs pulled down the face (the steel atlas and the sheet tile paint the mask;
every other atlas carries zero). Base dirt is painted into the container strips and the sheet laps; a per-vertex
height-above-base attribute for the whole props library (a byte a vertex) stays open (below). Edge wear is in the
tiles: chipped crests, lighter ribs, darker troughs.

**5. Cost.** Base vs lane, headless props builds (every map): geometry +2.05 MB on railyard, +1.45 foundry, +0.6
steppe, +0.3 Whiteout, ≤ +0.1 elsewhere (the containers 24 KB a box merged, the warehouses' parts, the yard
instances); textures +4.75 MB on every map that renders the steel material (the three 512 px atlas maps with mips);
+1 material (17) and +3 textures (37) in the props library; meshes +9–12 a map (the steel and sheet bucket meshes,
the yard families); programs +3 to +5. The box was never idle (load 68–103 throughout), so the round measured its
own cost by hiding and restoring its meshes at a pose (`.qa-dev/r75-hide-probe.mjs`, 120-frame medians, bots
frozen): railyard chase shown 750 → hidden 686 → restored 725 calls, 4.84 → 4.64 → 4.80 M triangles, CPU 8.7 / 7.7
/ 7.5 ms; centre-far 490 → 416 → 476 calls, 3.83 → 3.62 → 3.81 M — this round's twelve meshes are ~60 draws (+9–15 %
at these poses: the yard families and the two new buckets, each drawn again by every shadow cascade) and ~200 k
triangles (+4–6 %), the frame-time delta inside the noise. That was over the +5 % draw-call brief and is answered
by follow-up 2 below. Tree-to-tree wall-clock (`.qa-dev/r75-perf.mjs`, lane → base → lane, 8 s settle, 120
frames) is supporting evidence only at this load: chase-pose call medians wandered by 100 between two lane runs
and Urban moved +23 % triangles on byte-identical geometry in a capture snapshot (the streaming state at the
instant of the shot), so counts decide and hide/restore attributes.

**Follow-ups (2026-09-26, the integrator's eye check before deploy 102).** *1. The steel atlas on demand:* the
container / tank atlas was painted on every battlefield's props build (115–260 ms) whether the map drew a steel
part or not; the build now decides at plan time (`propsSteelAtlas.ts steelAtlasNeeded`: a container row, any yard
structure kind, or corrugated cladding) and paints only then in the same sixteen-row checkpoints — six
battlefields (verdant, desert, coastal, autumn, oasis, orchard) paint nothing and the `steel` material is created
without maps; a steel part the predicate did not foresee paints it once, synchronously, and the record
`group.userData.steelAtlas { needed, painted, fallback, ms, size }` says so. The mobile tier paints it at half
size (256 px: a quarter of the paint time and texture bytes; the ribs stay readable at 42 px/m, the stencils
blur to marks). *2. The draw budget:* the yard's nine instanced families and the sign boards' `plaster2` bucket
were the round's draws. The yard now folds into the map's wood / steel / baked buckets before the bucket merge
(`placeYardDressing` runs after every solid is placed; each piece is shaped to its bucket's attribute set, the
livery baked into its vertex colours) and the sign board rides the `plaster` bucket (that alone removed the
`plaster2` mesh from seven warehouse maps that had no plaster2 wall of their own — steppe, badlands, caldera,
copper_mesa, airfield, longleaf, reservoir). The round's meshes of its own are now the `steel` and
`structureMetal` buckets. Measured exactly this time (`.qa-dev/r75-draw-diff.mjs`: `renderer.renderBufferDirect`
wrapped for 60 frames, counting only the invocations that reach the GPU, attributed by mesh name and pass — the
first hide/restore medians read `renderer.info.calls`, which the engine's own frame accounting resets inside the
frame, so they under-counted totals and wandered with the bots): the round's meshes cost 36.5 draws a frame at
railyard chase / centre-far and foundry centre-far, 30.5 at foundry chase before (the nine yard families 21–23,
the three buckets 9.5–13.5); after the fold 9 / 9 / 9 / 6 — railyard +1.2 % of 745 draws at chase and +2.3 % of
386 at centre-far, foundry +0.9 % of 667 and +2.5 % of 353, within the +5 % brief. The hide/restore probe with
the same meshes (`.qa-dev/r75-hide-probe.mjs`, now with means): railyard centre-far 403 → 393 → 403 calls (median,
shown → hidden → restored), foundry centre-far means 382 → 373 → 385; the chase poses drift with the bots and are
read through the attribution. Fleet law kept: 31-map headless digests after the fold — 15 battlefields
byte-identical to deploy 101 (buildings, obstacles, colliders, destructibles), the 16 warehouse maps' obstacles /
colliders digests moved exactly as before the follow-ups (counts equal, Whiteout −2 colliders), nothing else
moved; `foundryServiceCourt` compares the three yard-carrying buckets net of the yard's vertices. *3. Whiteout's
hall a near-black slab at yard height:* two halls were dark. The sheet warehouses: the tile is bright (albedo
0.9–0.98 sRGB under a vertex livery), so the darkness was the livery — the "pale weathered sheet" hex 0x9aa39c is
a third of the containers' polar livery in linear light, and under Whiteout's low sun the shaded long wall fell
to black. And the hall in the yard-low frame itself is the foundry office (sawtooth bays, chimney), which the
cladding law never reached: its walls were the map's fieldstone. The law now lives in one place
(`exteriorDetailKit.ts INDUSTRIAL_CLADDING`, `structureKit.ts cladIndustrialWalls`): on a map that authors
`industrialCladding: 'steel'` the warehouse, the foundry office (walls and bays) and the fire station are
corrugated sheet under the livery — frosted pale grey on a snow map (0xcfd4d2, the containers' brightness class,
a stop below the snow the weathering hook loads on every upward face) with the plant's oxide-red corner trims and
girt in the baked bucket, weathered grey-green with dark trims elsewhere — and the sheet warehouse's eaves carry a
snow ledge over the gutter line (the eave edge and gutter are vertical faces the hook cannot load). The moved walls
keep their four seeded UV draws (consume), every new part takes none, the livery paints from a stream forked off
the map seed, so the 30 other battlefields' digests are byte-identical (buildings, obstacles, colliders,
destructibles; the brick foundry office's parts are pushed in their old bucket order); a sheet hall takes no
catalog façade pass (`inferCenteredWallEnvelope` reads the masonry buckets — quoins and lintels belong to brick;
the sheet's trims frame it, as on the warehouse). Whiteout's trims and girts stand 2 cm proud of the body, so its
obstacles / colliders digests moved with the counts unchanged (783 / 598) and its shard was recaptured headless
the documented way. Sheet: `$SP/r75/review/sheet-whiteout-fu3.png` (yard-low, station-oblique, centre-far; left
the round-75 cladding, right follow-up 3).

**6. Shards.** The warehouse parts stand outside the old polygons, so sixteen maps' collision records moved with
their counts unchanged (Whiteout 600 → 598 colliders: two shell bands merged under the sheet cladding): winter,
steppe, railyard, fjord, badlands, caldera, foundry, ruinspires, blackglass, titan_gorge, skybridge, copper_mesa,
airfield, whiteout, longleaf, reservoir — recaptured headless on the lane tree
(`tools/capture-world-collision-manifests.mjs --headless`); the other fifteen are byte-identical. The recapture
also surfaced three shards that were already stale against main before this round: winter (5944 / 5794 / 4911 →
5929 / 5786 / 4919), fjord (6669 / 6630 / 6876 → 7152 / 7101 / 7388) and badlands (+2 / +2 / 0) — the deploy-98 base
export recaptures to exactly those counts with no lane change (`$SP/r75/recapture-base.log`), a vegetation planting
drift, while Whiteout's base recapture is byte-identical to its committed shard, so its −2 is the round's. The census
receipt (`server/dedicatedWorldCollision.selftest.mjs`) carries the four dated re-pins. The integrator recaptures on
the combined tree as the DEVELOPMENT rule says.

**7. Rocks and boulders (item 6, integrator's addition on a deploy-100 Verdant hull-side frame; `src/world/rockDressing.ts`).**
The boulders were the r7 welded icospheres with three displacement octaves and a crease law, on a plain
vertex-coloured material — smooth low-poly lumps beside the new tall grass. The visual rock is now the legacy
displacement cut by four to seven fracture planes (inward only, never the seated bottom) with a ridged detail
octave carved in, its normals split at a 38° cleavage angle so cut faces shade as crisp facets while the rounded
shoulders stay smooth; the legacy geometry's projected hull stays the collision proxy (every vertex moves inward,
the receipt proves each vertex projects inside it), so no rock record moves — verdant, desert and alpine
obstacle / collider / destructible digests equal the base. The rock material takes a generated 256 px tile
(fracture lines over grain; albedo, normal, ORM) sampled triplanar in world space by a hook layered on the grime
hook (a displaced sphere has no UVs; three's tangent frame would divide by the zero UV derivatives, so its
normal-map chunk is replaced by a world-space triplanar perturbation), and a per-map dressing: moss / lichen on
the shaded side and tops of wet maps (Verdant 0.75, Fjord 0.8, Monsoon 0.85 … Alpine 0.45, none on snow), a dust
cap and skirt on arid maps (Desert / Badlands 0.8, Mars 0.9, Steppe 0.4), and on every map a soil blend over the
lower third of a metre toward the map's dirt tone (a splat law, derived at build onto `P.rockSoilTone`) so the
stone sits in the ground — the instance's ground height rides an instanced attribute (`aRockGround`), the same
three variants and instance counts as before, +0.07–0.11 MB of geometry a map (non-indexed corners), +3 textures in
the library (40). Receipt `rockDressing.selftest` (new, registered). The outland rockfield (`horizonRockfield.ts`,
the mountains lane's) is untouched.

**Sheets:** `$SP/r75/review/sheet-yards.png` (railyard yard-low / yard-doors / yard-oblique / warehouse-low,
Whiteout yard-low / station-oblique, foundry yard-low / court-oblique — before = the deploy-98 base, after = the
lane), `sheet-centre-far.png` (the six named maps) and `sheet-rocks.png` (verdant and desert rocks-low / rocks-mid —
the largest boulder within 320 m of the spawn, the same instance on both trees); captures under `$SP/r75/caps/`,
the census-98 frames the brief pointed at under `$SP/r75/census-live-98/`.

**What still looks weak.** The Garage's container ranks (`src/ui/garageEnvironmentKit.ts` has no `steel` bucket:
they fall to the vertex-coloured `baked` material — livery boxes with door geometry, no corrugation); base dirt as
a shared per-vertex law; the yard pieces are dressing a hull drives through (they keep to the apron band, but a
tank hugging a container wall will clip a pallet); the plain brick warehouse still reads as one box from 300 m
(the signage band and shutters are street-face only); no LOD or impostor for the far ring of props (the merged
buckets have none — the added geometry is small enough that none was built); the steel atlas is painted on every
map's props build (140–260 ms) whether or not the map places steel; Foundry's grey wash is the skies lane's.

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
| map revival (2026-10-05) | Tarkhan Steppe as a Virgin Lands grain sovkhoz (the owner: "make sure all maps look completely new and revitalized like verdant"): the tselina kit (`maps/regional/tselina.ts`) rebuilds the grain station's 19 buildings in place — the slip-formed elevator and its working tower by the siding, the conveyor gallery, the MTS garages and implement sheds, grain stores, settlers' and two-family houses with glazed verandas, the club's portico and star, the Rozhnovsky tower, the boiler stack, the fuel store or brigade wagons, the sheep barns — each body filling its base's measured bounds (every side within 0.06 m), the yards' fenced kitchen gardens and sheds; Barayev's strip fields (`landUse.ts` region `tselina`: wheat, stubble and black fallow in 620 × 104 m blocks along the shelterbelts; the ten other rows' digests unchanged); stone idols on the kurgans, a wind pump, straw ricks and the 110 kV line to the station (scenery); the pine slot grows as birch | regionalArchitecture (19 buildings in place, stream exact, settlement triangles 17632 → 19978), typecheck, 90 selected receipts green (server/match/service red on the PR head too: a load-timing assert), collision drift current, census [1830, 1543, 703] → [1876, 1554, 703]; pacing 187/243/314/175 s, identical to the PR head; gauntlet pair 10 views; cost B − C (load 140–195, provisional) establishing 0.89 ± 0.58 ms, chase 0.42 ± 0.77 ms, the land use's own shading by an on/off toggle 0.07 ± 0.46 ms |
| 48 | Landing (2026-09-24): Amberford's and Tarkhan's dedicated collision shards recaptured on the combined tree (the lane left the round-1 Amberford shard; census receipts pin counts only), bot relocation cells on holdable ground + flank rings scored for reach + a closed penetration gate held against a stationary target starts the flank, the three redesigned player pads moved 60 / 60 / 120 m down their approaches onto flat-scanned cells | battlePacing 14/124 (from 18; ledger 17 → 16 → 17 → 16 → 14 across the five fixes), dedicatedWorldCollision census, collisionManifestCodec, terrainStreaming spawn windows, garage:terrain:check, spawnClearance / mapQuality / matchPlacement / minimapObjectives, 11 AI receipts, typecheck; chain 70 |
| 50 | The redesigned maps' tactical-map plates (Frosthollow, Tarkhan) and Garage cards (all three: 4K hero + picker thumb) re-rendered from the new battlefields — they still showed the Verdant clones; the round-48 pacing trace committed as `tools/pacing-trace.mjs` | map-art-guards, minimapAssetRuntime / CapturePolicy / Orientation, loadingScreens, landing-media, public-repo-hygiene, attribution; eye check of the 1280 px reductions; chain 71 |
| 51 | Home showcase frames of the redesigned maps: the eight orphaned `public/media/home` frames, thirteen `presentation-r1` frames (five owner picks on the home rail / maps section / featured gallery / docs page, eight archive frames) and the five Frosthollow studio-loop keyframes re-rendered from the round-48 battlefields; every recipe on the three maps re-staged in its generator (ponds, terrace village street and crossroads, orchard rows, the coach road under the town, stone bridge, ford, open steppe, highway belts, kurgan crest); `publish-presentation-r1.mjs --match` subset mode | eye check of 1280 px reductions after seven preview rounds against the review's lens rule (nothing within ~8 m of the glass but a deliberate hull); campaign image metrics 26 / 26; landing-media, feature-evidence, hero-rails, loadingScreens, socialProof, showcase-library, public-repo-hygiene, attribution — no digest moved |
| 52 | Saltwind Narrows' strand 12 → 20 m (owner decision 20): a pale beach now separates the bay from the grass along the whole shore; boat landings kept (beachedBoat / riverLandings unchanged) | map-view-probe A/B (bird-w-edge, shore-w-oblique, edge-w-low, w-wall-mid), badlandsRelief slice, shoreDirtMask / mangroveWaterPalette / villageWear re-pins, 17 shore receipts green; chain 73 |
| map revival (2026-10-05) | Kestrel Airfield (Hostomel, 2022) given Verdant's three layers round the airport, every airport building, the runway, aprons, roads, pads and objectives where they stood: the Polissia's pine and birch woods down the valley sides and past the runway's ends (clusters 26 → 60, lone trees 42 → 120, rim 80 → 108; no stands inside the graded airfield, which vegetation.ts keeps every tree 24 m off), hay meadow and small fields outside the perimeter (`landUse.ts` `airfield`, the upland rotation; the ten other rows' digests unchanged), two dacha cooperatives on the valley shoulders beside the access roads (a rotation pair of eight plots appended after the airport's sites; the hostomel kit's new cottage — planks or render under a steep sheet gable with its attic window, the glazed veranda in the house's paint — and garden shed, the yards' fenced plots), an Orthodox cross at each cooperative | regionalArchitecture (42 buildings in place, stream exact; every cottage within 0.37 m past its bounds, none short), typecheck, collision drift current, census [2481, 2487, 1967] → [4713, 4785, 3975], the 33 airport poses identical; pacing 179/171/189/204 → 172/260/219/257 s (median 188.9 → 257.3, p10 172.1); draw census at establishing 635 → 644 calls, 2.98 → 3.92 M triangles (the woods); cost B − C establishing 0.03 ± 0.59 ms, chase −0.16 ± 0.56 ms (load 130, 8 quartets) |
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
| 73 | The ground redux on the playable ground (owner: "improve ground, ground transitions, shorelines... add tall grass that interacts with tanks" and "make sure performance is still really good"): a per-map profile table (`world/groundRedux.ts`) driving four uniform vectors on the terrain material (`world-terrain-splat-v40`, still ten declared samplers) — height-and-noise layer transitions from the albedo's relief against its deep-mip tile mean (grass through a dirt border, rock tops clearing the snow, seams buried; a scree band on the 12°–30° slopes where authored; gated on the strength so the far field keeps the plain mask), a baked fold term per vertex (8 m / 24 m Laplacians of the height field → an Int8 attribute: hollow moisture and greening, crest dryness, indirect-only fold AO), snow scour / powder macro, sastrugi and drift waves on the per-cell wind, a sparse near-level glint, a mid-distance normal octave in the 26–150 m band, and the wet strand (an analytic swash on a ground clock: film, damp band and wrack line inside a width set in multiples of the map's apron ramp, albedo −40 % · wet, roughness to 0.30); tall grass that the hulls press (`world/tallGrass.ts`, `world/groundPressure.ts`): two instanced rings of vertex-built blades — clumps of three two-segment strips to 46 m at 2.6 / m², single wide blades 34–120 m — root-anchored cascade shadows (the round-13 rule), a gust field and flutter, a per-map biome (meadow / steppe / savanna / reed / tundra / verge / dune, densities, heights, tints), admission off roads and shoulders, water (reeds in the wet band), soft ground, village ground, sealed footprints, dirt patches and crests, thicker and taller in the hollows; a world-anchored RGBA16F press field (96 m / 256², e-fold 20 s, a 45 s crush memory, the push direction along the travel with the flanks rolled outward) stamped by every hull and read at the root (bend 1.35 rad, the crushed tint); a sniper-corridor clear and a lens clear; the quality knob (`tallGrass` ultra / high 1.0, medium 0.5, low 0.25, mobile none); `?ground=legacy` as the same-build A/B; nothing in `src/sim` | 31-map before / after review sheets (`$SP/r73/review/sheet-all-{chase,ground-mid}.png`, the six first maps in four views, the strand sheet) on one build and seed, `?ground=legacy` as the before; tiling peak at lags ≥ 24 px on `ground-mid` legacy → terrain-only → final Whiteout 0.075 → 0.074 → 0.185, Verdant 0.085 → 0.088 → 0.129, Saltwind 0.080 → 0.083 → 0.073, Steppe 0.119 → 0.123 → 0.112, Monsoon 0.027 → 0.074 → 0.207, Desert 0.170 → 0.158 → 0.156 (the terrain's own repeat flat or falling on every map; the rises are blades in the crop); mid-ground detail Whiteout 26.0 → 27.6 → 28.3, Verdant 43.4 → 43.5 → 44.3, Saltwind 44.4 → 43.5 → 43.5, Steppe 44.5 → 45.6 → 46.1, Monsoon 31.4 → 31.6 → 31.7, Desert 25.6 → 25.6 → 25.7; chase hard-edge share terrain-only vs legacy Whiteout 0.046 → 0.052, Verdant 0.201 → 0.211, Saltwind 0.238 → 0.240, Monsoon 0.069 → 0.076, Desert 0.220 → 0.220; the Saltwind strand contrast 0.314 → 0.316; sward coverage of the near band (final vs terrain-only, chase) Whiteout 6 %, Verdant 49 %, Saltwind 54 %, Steppe 44 %, Monsoon 49 % against a 29 % no-sward control; the trail after a five-second drive (bird view vs the field cleared) Steppe 9 % / 11 % / 10 %, Monsoon 16 % / 22 % / 21 %; GPU by repetition on the final build (each target drawn eleven times inside the frame's own passes, one timer bracket round the frame, the lower quartile of 60 frames; medians of ten rounds over two runs at load 20 and 150, under other lanes' headless renders): the sward's geometry pass under 0.3 ms per copy on every map (Whiteout −0.14, Verdant +0.02, Saltwind −0.12, Steppe −0.06, Monsoon +0.25), the redux terms on the terrain material Whiteout 0.57 / Verdant 0.25 / Saltwind 0.62 / Steppe 0.29 / Monsoon 0.36 / Desert 0.50 ms per copy (budget 0.8), the press step 0.0–0.6; the sward toggled at ×1 Verdant +0.85 and Monsoon +1.07 ms (rounds spanning ±3–5 ms), the dry maps inside the noise; the toggle on the first build (3.0 clumps / m², three segments) Whiteout 0.83 / Verdant 1.08 / Saltwind 0.75 / Steppe 1.87 ms, which drove the cut; world update +0.0 ms; draw calls +3 (two instanced rings, one press quad); the terrain material still declares ten samplers; receipts: groundRedux / groundPressure / tallGrass selftests, the fetch census +7, the uniform list and v40 with its negative control, the fold attribute, the sandboxed material steps — 76 / 78 terrain-reading receipts green (the two reds are the round-71 map-config digests, re-pinned upstream); typecheck green |
| 73b | The second pass on the ground (the integrator's eye-check of round 73: the terrain terms invisible at the ground-mid view, the strand invisible at the strand view, Whiteout's sedge as sticks): the borders themselves in albedo (a torn, damp lip at the worn patches' edges, a lichen / moss / dust / hoar rim on the outcrops by climate, a gravelled dusty verge on the road shoulders), the 20–190 m octave in albedo beside its normal, the folds reaching further and reading stronger, a scree skirt on the meadow and hill maps; the snow drifts a sawtooth with a shaded lee edge and a per-cell wavelength swing, the scoured crust with a satin sheen; the strand in METRES on a second vertex byte (`shore`: metres landward of the waterline from the map's own shoreline contours, inverted so the ring bands read far) — round 73 sized its band in the mask's wetness ramp, two metres wide on a real beach — with a dark, cool, glossy film to the run-up's breathing reach, a sharp ragged swash line, a damp band to the high-water mark, a foam line, a wrack line with pebbles and shell, muddy margins on the lakes; reeds as a waterline fringe (dense at mask 0.04–0.10, gone by 0.40, taller at the water, the banks' meadow thinner) and reed margins on the Monsoon and Reservoir meadows; the tundra sedge in the hollows and the lee sides in clumps, darker; the Monsoon press cost found to be the frame bracket's noise (the step's minimum 0.01–0.05 ms on every map); two more packed vectors, still ten samplers, `world-terrain-splat-v43` | three-column sheets (legacy / round 73 on its own base tree / 73b) in four views plus the strand sheet with Mangrove and Monsoon (`$SP/r73b/review`); the strand's sand-band contrast Saltwind 0.319 → 0.254 → 0.414, Saltmere 0.241 → 0.271 → 0.505, Nordhavn 0.419 → 0.447 → 0.498, Mangrove 0.393 → 0.495; the 40–120 m band's |Laplacian| flat on the meadows (the uniform-isolation probe: the 73b terms change 32 % of the band's pixels by > 10 luma with no change in edge count), Whiteout +13 % terrain-only, Monsoon +7 %; softness within 0.02 of round 73; the isolated press-step probe (minima 0.011–0.021 ms per copy on Verdant / Monsoon / Steppe); perf: the repetition bench at load 70–100 (five rounds spanning ±1.5–4 ms per copy) reads the redux terms whiteout 1.40 / verdant 0.33 / saltwind −0.03 / steppe 0.37 / monsoon 1.22 / desert 1.04 ms per copy by the median and the 73b terms alone 0.47 / 0.25 / 0.11 / 0.12 / −0.26 / 0.56, a new per-frame paired bench (300 pairs) ±2.2–3.1 ms MAD — the terrain budget question stays open for a quiet window (six gated taps and ~40 ALU ops were added, no pass, no sampler); the sward and the press step at zero ±0.3–0.5; receipts: groundRedux / tallGrass extended (the new knobs, the six-vector packing, the v43 contract, the shore byte, the reed margin, the tundra clumps), the program key and uniform list re-pinned in terrainMaterialOwnership / terrainWornDirt / wallSkyLight, the fetch census +6, terrainStreaming's chunk attributes; the 80 terrain-reading receipts of round 73 green; typecheck |
| 74 | Impact physics (owner 2026-09-25): energy-based crash and fall damage through one function in both sims (`sim/impact.ts`: ½·m·(v − v_min)² kJ × the ruleset's hp/kJ, glacis 0.7 / stern 0.85 / broadside 1, tracks first, the engine on a frontal crash or a hard landing, crew shock above 16 / 14 m/s, a two-tick crash priced once), a `physics` block per ruleset (restitution, rebound floor, fall and crash thresholds and rates, ram scale and restitution — Turbo Ball and Mars bounce, a single jump lands free), the ram split by mass / aggression / face with a momentum-conserving exchange, the swept landing contact with restitution (several decaying hops at low gravity, no tunnelling at 40 m/s), the landing torque toward the ground plane, a slide law on faces the tracks cannot hold, a lateral-grip cap on the yaw rate at speed, a static hold at rest, the settle chatter fixed (a parked hull on a grade crept 4 cm/s and chattered ±0.4° on the base tree), movement checkpoints v2, CRASHED / FELL on the kill feed and the final-blow line, `tank_impact` on the wire | impact / impactPhysics / impactParity receipts (new), movement 218, combat 541, authoritativeMatch, matchRuleset, ai, authoritativeBots (mobile 6/6), the mp / net / server-match receipts with their re-anchored pins, typecheck; headless Verdant 5 min (37 crashes, 631 hp, none stuck or tunnelled) and Mars 3.8 min (163 landings, 2413 hp, one fall death, 18-hop chains, none stuck or tunnelled), the 30 m Mars drop (14.9 m/s → 7.4 m/s rebound); `server/battlePacing` full 124: median 335.2 s, p10 260.8 s, 0 sub-120, 0 timeouts |
| 75 | Structures and props to the skies' and mountains' level: shipping containers as corrugated painted steel on a generated four-strip atlas (`propsSteelAtlas.ts`, the `steel` bucket; operator liveries by battlefield, stencilled codes, an operator band, recessed doors with bars and hinges strictly inside the body's footprint; the builder's shared-stream draws and the bodies' dimensions unchanged, so every later placement and the container maps' shards are byte-identical); freight warehouses with roller shutters, a dock canopy, bumpers, ridge skylights, gutters and a sign board, corrugated cladding on Whiteout (`industrialCladding`); the light kit's 256 px sheet tile and the quonset hut's ribs, wicket door, skirt, threshold and stovepipe; a yard-dressing planner and kit (pallets, crates, drums, cable drums, tyres, fuel tanks, skips) under a per-map budget with no record published, folded into the wood / steel / baked buckets (no draw of its own; follow-up 2), the steel atlas painted on demand at plan time and half size on mobile (follow-up 1), the industrial cladding law reaching the foundry office and fire station, Whiteout's sheet halls frosted pale grey with oxide trims and eave snow ledges (follow-up 3); the weathering law v7 (sun fade, rust mask mixed with runs); the boulders fractured (inward plane cuts, a ridged octave, cleavage-split normals, the legacy hull kept as the collision proxy) on a triplanar detail tile with per-map moss, dust and soil laws (integrator's item 6) | headless props probe on every map (placements / destructibles byte-identical fleet-wide; sixteen warehouse maps' records moved with counts unchanged but Whiteout 600 → 598, shards recaptured headless); before / after sheets (`$SP/r75/review/`); 90-frame medians on railyard / Whiteout / foundry (frame time within noise at load ~95, draws +40–124 a pose, triangles ≤ +5 % except the chase pose under streaming); receipts: yardDressing (new), propsResources (17 / 37), plasterSurfaceSharing, orchardBathhouse, foundryServiceCourt, mangroveFisheryWharf (key set), structureSurface (256 px), worldNightFixtureInstances, deltaPlasterPalette / reservoirWaterworks (v7), the collision census re-pinned for Whiteout; `npm run typecheck` |
| 76 | The deck pass (owner: skies "that look just as good" as Whiteout's; the integrator's census: the overcast and stratocumulus presets read as flat white sheets, a marshmallow, cotton): five gated deck knobs on the cloudscape — cells / cellM (inverted-Worley cells at the deck's period set each column's thickness, hang the cores, open the borders, compress the coverage ramp), deckLight (the underside lit by the column's transmitted light through the diffusion law, the sun's share at a third of physical because the skies are exposed for the ground, the sky's whole, a ground bounce by the map's ambient scale, the light-march term kept for the lit walls), undulatus (the wind-frame rolls band the thickness), interior (the coarse detail octave survives the remap, a detailed first light tap); the round-71 flat white diagnosed (the sky-mean floor is the HORIZON band's luminance at 1.25 × on a sheet; the ramp compressed only for sheets); denser deck rows; two regimes (industrial-stratocumulus for Foundry and Railyard, altocumulus for Urban); Foundry's aerosol halved with the smog on the deck's base and the horizon band's warm absorption, Railyard's fog thinner; Saltmere Bay's shore palm dropped; every term gated so the rated regimes and whiteout keep round 71 byte for byte | 31-map before / after sheets on this machine (`$SP/r76/review/sheet-sky-w.png`, `sheet-sky-s.png`, `sheet-bird-n.png`; before = the deploy-100 tree eeecca19e) with the deck metrics on the history masks (`.qa-dev/r76-deck-metrics.mjs`: p80 / p20 of the dense pixels foundry 1.02 / 1.05 → 1.30 / 1.14, railyard 1.01 / 1.02 → 1.18 / 1.14, winter 1.08 / 1.05 → 1.17 / 1.17, polders 1.08 / 1.06 → 1.18 / 1.19; the deck medians at or under the clear sky instead of 1.2–1.7 × above it), the round-71 metrics on every map, the rated maps' metrics within the wind-drift noise (every number of alpine, coastal, steppe, frontier, verdant, delta, monsoon, whiteout, desert, saltwind, mangrove and mars identical to ±1, whiteout byte-identical); the per-slot bench by repetition (load 68–103, noise floor ±0.5–0.7 ms: foundry 0.20, railyard −0.49, winter 0.85, urban 0.10, fjord 0.67 / 1.45, monsoon 1.30, verdant 0.79 inside the 1.2 ms slot within it; polders 1.76 (1.62–2.23) the one slot over the line by this bench); receipts volumetricClouds (20 regimes, the table, the gated zero rows, the deck identities), villageWear / mangroveWaterPalette re-pinned, badlandsRelief (the round-76 projection), playableRelief, redrockMaterial, garageSkyPresets, skyCloudBake, atmosphere, battleAtmosphereRuntime, the vegetation receipts; `npm run typecheck` |
| 77 | The vegetation (owner: maps "just as good as those… a triple AAA redux", "make sure performance is still rlly good"; the integrator's verdict on deploys 98–101: blob canopies, unlit foliage, cylinder trunks, stacked cones, hard identical edges, a green band for the far forests, nothing moving): the map wind (`treeClimate.ts` — the cloud wind or the sward's prevailing wind, the regime's speed as strength) as a gust front every tree leans into by the square of its height with the canopy fluttering by its authored flex; per-vertex sphere normals on the cards with a hashed tilt; the near cards receiving the cascades once per leaf cluster (`aCard`, the sample pushed toward the sun by the crown radius — a self-shadowed crown, one state per card), a 22 % leaf-shadow floor on the CSM's directional sites, the sky under a shaded cluster at 50 %, leaf translucency against the sun (45 % near / 18 % far); the bushes and the new understorey shrubs receiving the same one-sample shadow; conifer branch whorls (18 three-sided limbs, no RNG draw); moss in the bark's fissures on the shaded base by the map's climate; the far lobes' sphere-normal bias halved and their sky fill 1.08 → 0.80; the understorey (young shrubs in every stand's edge annulus, own geometry and RNG, no cover disc, no trunk record, desktop only); the stand shade (up to −24 % on the interior trees of dense stands, every LOD). Every placement, trunk record and cover disc byte-identical; keys foliage v16 / canopyfar v16 / bark v10 | six-map before / after sheets in seven views (`$SP/r77/review/sheet-*.png`) and the still-frame wind pair with |Δ| (`sheet-wind-pair.png`); the deterministic vegetation-triangle census per view (the whorls: fjord +8–9 % at chase, the other maps +1–7 %; the understorey ≤ +1 %); the repetition bench (near / far / bush ×9, the receive-shadow toggle ×9, the wind toggle ×9, the whole vegetation ×1) on six maps at chase and centre-far at load 75–110 — the shade and wind layers isolated in-page, the near / far deltas inside the ±1–2 ms per-copy floor; the wind pair moves 7–24 % of the tree band's pixels by > 12 luma on the wooded maps; receipts treeClimate (new), understorey (new), vegetationProgramKey (v16 + the GLSL mechanisms), vegetationLighting (1680), birchCrownForm / bushOverlappingSprays / shrubGrowthPlacement extended, the rest of the vegetation, placement, grass and horizon receipts green; typecheck |
| 77b | The second vegetation pass (round 77's weak list; the owner's bar unchanged): the far tier as IMPOSTORS of the near trees (`treeImpostors.ts` — one atlas per world of every species' three near variants from eight azimuths at 10°, baked from the real trunks, cards and leaf atlases into linear albedo + coverage and capture-space normal render targets, lazily from `update()` outside any render pass and again after a GPU suspension; the tile from the 6 MB budget — 96 px on every authored map, 4.2–5.6 MB with mips; one camera-facing quad per far tree through the far canopy's wind / dissolve / matte-wrap hook, the two nearest azimuths dissolved by the view angle, the second far variant mirrored, the baked normal lit in the capture frame, the cards' mip give-back; two draws per species instead of four, two triangles per far tree instead of a lobe cloud; desktop with a renderer only — the receipts and the mobile tier keep the lobes); the leaf-scale crown detail (`leafDetail.ts` — a CPU-generated 256 px tiling leaf-cluster tile per class, broadleaf / conifer / autumn / palm, RG normal + a break mask offset to a mean of one half, the near material's normal map at repeat 3 with the tangent frame rebuilt after `useAttributeNormal`, a mean-neutral alpha break and leaf-gap shade before the alpha test; foliage key v17); the rim-forest understorey (the blocks as discs through the stands' law at the rim trees' scale and bound; Verdant 780 → 1781 shrubs). Placements, trunk records, cover discs and the stands' understorey byte-identical; the round-8 atlases untouched | six-map before / after sheets in four views incl. the new 8 m `crown` close-up (`$SP/r77b/review/sheet-*.png`, the zoomed `crop*-*.png` pairs); the census (the far tier −99.2 % triangles on every row, the whole vegetation −38 to −80 %; −2 draws per species; the near foliage counts identical); the crown high-pass metric (+6–19 % leaf-scale energy at the same mean luma); the tree-pixel luma across the rim unchanged (±4); the repetition bench at load 68–94 (the far tier 2–5 ms per copy → ≈ 0; the near tier 6.3 → 6.3 / 6.1 → 5.9 at chase — the detail layer ≈ 0 ± 0.3 by comparison, the in-page toggle inside ±1; no quiet window — the whorls' 108 tris per trunk bound ≤ 0.2 ms per copy, no trim); receipts treeImpostors (new, the bake inputs pinned per map), leafDetail (new, the tiles pinned), vegetationProgramKey (v17 + both programs' GLSL + eviction counts), vegetationResources, vegetationLighting (seven fetches), understorey (rim annuli), treePoolCapacity / autumnLeafSprays fixtures; the rest of the vegetation, placement and grass receipts green; typecheck |
| 77c | The seam with the ring forest, the covered bake, the elevated ring, the drives (77b's weak list): the horizon ring's forest beyond 512 m bound to the far tier's impostor atlas (`horizonForestImpostors.ts` — round 72's placements byte-identical and packed on the group, redrawn as one quad per tree through the far tier's program text, its wrap / translucency / sky fill and the ring's haze law, the species by class from the rim mix, the variant from the tone, the mirror from the ring's variant, the stature that of the rim trees; the near class's lobes as shadow-only casters, the band and range lobes disposed; the ring's colour triangles −97 to −98 %); the bake in the covered warm (`world.warmImpostors()` from the solo loading runtime and the activation precompile); the elevated 45° capture ring where it keeps the row cap and the ground tile (every 3-species map, 12 rows at 96 px inside the 6 MB), the view elevation dissolving the tile and tilting the card over 20°–45°; Winter and Whiteout captured (the far bare birches carry the hoar-frost palette — no lift; Whiteout's polar ring band frosted spruces instead of summer lobes); three captured drives of the 260 / 290 m switch (move-then-hold, wind pinned, dissolve against the hard snap) instead of a distance cross-fade. Every placement byte-identical; no map-config edit; mobile and the receipts keep the lobes | six-map before / after sheets in three views (`$SP/r77c/review/sheet-*-a3.png`), the ×4 seam crops and ×3 bird crops; the render-mask seam metric (the seam step Nordhavn +14 → +9, Verdant +23 → +17, Saltmere +18 → +19; the rim's own step 9–18); the first-frame probe (the bake 5–6 ms in a presented battle frame → 30 ms behind the veil, two runs each); the ring census (colour triangles −97 to −98 %, draws −2 to +4 per map, shadow pass unchanged); the vegetation census identical on every row; the drives (crossing steps inside the quiet spread on Nordhavn and Verdant in both modes; the hard snap's pop 4.0 against 0.9 held luma on one row); receipts horizonForestImpostors (new), vegetationFarSeams (the one law), treeImpostors / vegetationProgramKey re-pinned (v2, the elevated ring, the frusta), soloBattleLoadingRuntime, worldActivationRuntime; typecheck |
| 78 | Performance — the round-71–77 audit's cost recovered knob by knob (owner: "make sure performance is still rlly good"): the cloud shadow gobos render into their own cascade only through a per-cascade caster mask in the shadow router (`renderLayers.setShadowCasterCascades`; 16 → 4 field-shader draws on the cumulus maps); a zero-count InstancedMesh returns before three's program / uniform setup (`routeZeroCountDraws`: the r8 proxies and proxied owners sat out cascades through count 0 and still paid the setup); the bushes cast into the three near cascades, the understorey into two, the horizon ring's near forest into the last only (`SHADOW_CASTER_LAST_CASCADE`, resolved per light set); the low stratus decks under 400 m take the cellular decks' 10 km march cap and far strides (`cloudDeckMarch`; reaches exactly whiteout); the near tree tier ends at 200 m (was 260; `?treeNear=` as the same-build A/B); the mobile tier paints no steel atlas | ABBA pairs of 1d0236f33 against rsync snapshots under the shared probe mutex (`$SP/r78/`): draws −11…−13 on every cumulus map at both views (exact), after the trim −15…−20 on the gobo maps and −4 / −5 on Winter (six maps, base vs after, chase / centre-far), shadow-pass triangles −0.06…−0.45 M, the CPU frame median −0.3…−0.7 ms on the four maps whose pairs were GPU-quiet (desert, steppe, verdant, winter) and noise on monsoon / whiteout under foreign GPU 900–1300 %, the before / after sheets without a visible shadow change; triangles verdant 6.95 → 6.06 M at chase (under the 7 M gate), fjord 9.39 → 8.03 M, each 100 m of near radius 0.8–1.2 M, the 3 × strips at 260 / 200 indistinguishable; the round-76 deck metrics identical on whiteout / winter / foundry / railyard / polders; the trace bench at whiteout's centre-far 0.15 → −0.07 ms per slot (the march was never the cost there — the composite is, left open); mobile whiteout against deploy 95 draws +11 / +8 (the round-75 bucket meshes; the atlas's 1.0 MB gone), GPU p25 per pair +0.05 / +0.41 with ±3 ms spans (six pairs) — within noise, as before the gate; receipts renderLayers (the masks, the last-cascade flag, the zero-count early-out), volumetricClouds (gobo i on cascade i, the deck-march law over 31 maps), steelAtlasDemand (the mobile gate), the nineteen vegetation receipts, the horizon / shadow / props / sky receipts (67 green); `npm run typecheck` |
| 79 | Performance — the shadow passes and the tank draws (owner: "make sure performance is still rlly good", no visible change): the articulated proxy batch installs on battle hulls at last (`articulatedShadowBatch` compared the proxies' hooks with three's Object3D prototype captured at import while lighting patches `Mesh.prototype` at boot — dormant on every hull since round 28; three proxy draws per hull per cascade → one, and an empty batch never reaches three's draw setup through the round-78 zero-count early-out); one shadow draw per near tree pool (the crown proxy carries the trunk's positions, the trunk mesh stops casting on the proxy tiers); shadow caster profiles (`renderLayers.setShadowCasterProfile`, `engine/shadowCasterProfiles.ts`): the content law (an InstancedMesh's instances / a merged bucket's 96 m cells against each cascade's frustum), the footprint law (a ground shadow under two texels of a map is not drawn into it), the reach law (near-tier content cannot reach a cascade sampled beyond its shadows — three's CSM fade pinned to the shader), evaluated per frame from the lighting update, desktop tiers only; the tank draws attributed (≈ 3.4 hulls in the chase frustum × ~52 forward draws, the four near hulls' ~20 detail casters, the proxies) with the shells and the same-material merges measured and proposed, not applied | Census on seven maps (`.qa-dev/r79-shadow-census.mjs`, base 8fb54bac3 vs dde3a0928, exact per-frame counts): shadow GL draws at chase −24…−31 % (monsoon 407 → 280, whiteout 401 → 304, winter 414 → 300, verdant 432 → 322, railyard 395 → 281, desert 387 → 283, foundry 389 → 281), at centre-far −9…−34 %, zero-count submissions −60…−170, shadow triangles −0.1…−0.7 M; ABBA probe (`$SP/r79/g1`, six maps, four pairs each, all quiet but one desert pair): renderer calls −89…−136 at chase and −34…−127 at centre-far, triangles −0.01…−1.05 M, GPU p25 railyard chase −6.3 ms [−8.9..−4.4] and verdant centre-far −5.9 [−6.5..−1.5] in four quiet pairs each, the rest inside the timer's ±2–4 ms, CPU frame medians without a signal on a GPU-bound headless frame; the blurred pixel diffs of every base / after pair read 0.0–3.7 % of the frame at chase (wind, TAA, a settled bot, the turret glint) and 0.00–0.23 % at centre-far, the sheets `$SP/r79/review/sheet-chase.png` / `sheet-centre-far.png` without a shadow change; mobile (`?tier=mobile`, whiteout / monsoon): the proxy batch alone, 45 fewer submissions, every other row identical; receipts articulatedShadowBatch (+ integration, deploymentShadowWarm, tankFactoryStaging), renderLayers, shadowCasterProfiles (new), nearVehicleShadowDetail, shadowGeometryClaims, treePoolCapacity, tidalMangrove, propsMaterialGeometry, the seventeen vegetation and fourteen props receipts, garageArchitecture; `npm run typecheck` |
| 49 | Ring textures: marker-bed / joint / varnish strata replace the sine ladder (the walls' fine wavy partings remain — mechanism narrowed to a detail normal, still open), per-map ring rock band (Titan from 34°); `bareRock` vista knob (heath, outcrop ribs, scree, broken summit cap) on Fjord and Whiteout's crests; headland hand-over beside sea openings (rows slope into the sea over 250 m instead of a 25–30 m slab) | Titan 2× wall crops A/B5 + stripe metric; layer-flag / uniform-isolation / layers probes (the layers probe shows Whiteout's sky-w skyline is the rim band: ring hidden 1.005 → 1.009); saltwind / fjord ring-row dumps before/after and bird A/B; receipts in the section |
| map revival: Orchard round 5 (2026-10-07) | The village on its terraced hill reached on the ground (the coordinator's condition for its orphan band, `layoutBrief.bands.orphanBuildingShare` [—, 0.45]): a terrace zone's ramped tracks (`terrain.ts` `TerraceZoneConfig.ramps`: the stepped ground cut and filled level across to a track's height, the legs blended at their bends) carry the mule track from the cross road to the church square, no leg over 0.15; the landmarks library's `stairway` (`landmarks/parks.ts`: landings paved over the ground, a flight set into every stretch steeper than its threshold — solid stone steps, or a mule stair's stone curbs and long earth treads — between low kerbs) lays the stepped lane straight up the east face between the two dar fronts and the mule stair on its track, with landings at its hairpins and the paved church square; the village repacked round them (20 sites: the settlement bound of 26 with the square's closers and the hammam, back on the plan's first seat); the lanes' treads kept clear of sward, scrub and trees (`vegetation.avoid` discs) | 52 receipts (terraceBenches: the mule track at its height across its band at 109 stations, off its bands the hill unchanged; landmarks: the stairway's flights, budget and admission on the authoring map) green but collisionManifestDrift, whose 18 other maps drift identically on the push-3 stage base (841d485ab), Orchard's own shard current; typecheck; collision census [4706, 4672, 4911] → [4731, 4708, 5100]; layout metrics in band with the map's orphan band (0.406); pacing 179/228/161/159 s (median 179.2, p10 159.1, no timeouts); fairness 39–41 over 80 all-bot games (seeds 7000–7079); cost: y5 (queued) |
| map revival: Tidegate Polders steps 6 and 7 (2026-10-07) | Step 6: the oxbow is the old creek's cut-off arm, not a closed basin — one arm of the old channel off the vaart, its far end silted into a reedy pool past its horn, no ditch through the long dyke (`maps/polders.ts`; the canals receipt leaves the arm's silted ends to their reed beds). Step 7: the polder's lanes narrowed to their gauge and raised a metre on crowned banks (`RoadPathStyle.crownLiftM`, `terrain.ts`: the bank over the graded plane, its crest to the carriageway's verge, its shoulders down over six metres, run out from 400 m to the square's 430 m line, absent from the road placement sampler and the authenticated pre-road constructor), the canals running under the lift bridge's span; the north field zone seated 8 m south-west on the same field; the trees lane's hedge fix merged (the rows read the map without its hedge) | 108 receipts (authoredTreePlacement with the trees lane's f74fb5015, deltaPlasterPalette serially under its long child timeouts), typecheck; collision census [4216, 4116, 3586] → [4131, 4031, 3497]; layout metrics in band (separation 813 m, route stretch 1.028, 3 lanes, sight median 136 m); pacing 180/205/202/171 s (median 202, p10 171.5, no timeouts); fairness 40–40 over 80 all-bot games (seeds 7000–7079); cost: y3 (queued) |

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
| `tools/visual-census.mjs` | the visual-redesign baseline (2026-10-01): every registered map at its authored time of day, desktop High, 1600 × 900, staged by `__SHOTS.set` and shot after the capture readiness gates (sourced textures, terrain lookahead, grass work, impostor bake, the cloud history settled with its drift zeroed) — the game's establishing shot, chase, bird, `sky-w` / `sky-s` (the round-35 poses above), a terrain and a tree close-up (`tools/visual-census-views.mjs`); per-frame luma percentiles, saturation, colourfulness, the sky / ground split and contrast, check 5, ring height, skyline relief and detail energy (`tools/visual-census-metrics.mjs`) in one census.json; contact sheets per view and per map, an index and an A/B compare (`tools/visual-census-report.mjs`) | redesign | `npm run build`; `capture --out=<dir> [--batch=8 --budget-min=14]` (resumes; takes the cot-shots lock, the probe mutex stays the caller's); `report --out=<dir>`; `compare --a=<dir> --b=<dir> --out=<dir>` |

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

### Round 76 — 2026-09-26: the deck pass (cellular stratocumulus lit by what its columns transmit)

**Owner (2026-09-25, on the round-71 Winter sheet): "wow our clouds look amazing" — and skyboxes and maps "that look
just as good". The integrator's census of deploy 100: the tuned regimes hold (alpine, coastal, steppe, frontier,
verdant, delta, monsoon, whiteout) while the overcast and stratocumulus presets do not** — Foundry one flat white sheet
with blobby edges over a grey wash, Railyard a pale low-contrast wash, Polders a marshmallow with no cauliflower and
no shading, Winter's deck a smooth white mass, Urban dense cotton puffs; round 71's own record: twenty-four maps'
sheets were 71b captures.

**Why the sheets were flat white.** Two things, both measured on the lane tree with the layer's uniforms dumped from
the page (`.qa-dev/r76-probe.mjs`). (1) The stratiform floor: `amb = max(amb, uSkyMean × floorK)` with floorK 1.25 on
a sheet — and `uSkyMean` is the BRIGHTER of the horizon band and the mean upper sky, in the zenith's hue: on Railyard
the horizon band's luminance is 0.80 against a mean sky of 0.33 and a zenith of 0.15, so every sheet base sat at
1.0 above the brightest sky and the max() erased whatever shading the diffusion and depth-above terms had produced
(the base metric read 203 / 199 / 195 sRGB against a clear sky of 154). (2) The coverage ramp compressed only for a
sheet (stratiform ≥ 0.5), so a broken stratocumulus at 0.66 (Polders, stratiform 0.45) ramped across the whole admitted
range and covered a tenth of the sky as one soft mass. And the display: the flat-density calibration (`uDebug 4`,
S = 0.6 everywhere) displays as 211 — the same white as the sheet at 1.2 — because the battlefield skies are exposed
for the ground with the horizon band near white, so anything above ~0.5 linear is the clipped shoulder; the first
frame where Railyard's deck read as a grey cellular overcast was the variant with no sun in the transmitted term
(median 136 against a sky of 176).

**The deck model (`volumetricClouds.ts`, five knobs on the cloudscape in `cloudscapes.ts` / `cloudPresets.ts`).**
Every term is gated so the rated regimes and whiteout keep round 71's numbers byte for byte: `mix( S, Sd, uDeckLight )`
with the old block skipped at 1 and the new at 0, `cloudCellK` returning exactly 1 without cells, `mix( 0.4, 1.0, 1.0 )`
= 1.0 and `mix( 1.0, x, 0.0 )` = 1.0 on the thickness and border factors, `max( uStratiform, 0 )` on the ramp and the
stride floor (the receipt pins the zero rows of every cumuliform regime, low-stratus, high-cirrus and thin-ice-clouds).
- `cells` / `cellM`: the inverted-Worley cells of the shape volume (its G and B octaves) read in a slice at the slab's
  mid altitude at the deck's own period (cellM × 4) give each column a cell factor, 1 at a core and near 0 on the
  borders. The column's thickness follows it (the borders at two fifths of the core's height and four fifths of its
  density), the cores hang under the base (`CLOUD_DECK_HANG_K` 0.12 × the slab × cells; the march starts at the
  hang), the borders open where the coverage is marginal and — open (cellK < 0.08) — stride like clear air, the
  coverage ramp compresses like a sheet's (the structure is the cells', not the ramp's), the shape period tends to the
  cell period, the deck keeps more of its mottle (the sheet flattening × (1 − 0.3 cells)) with a quarter more erosion
  under the base, takes a sheet's stride floor and a tall slab's far strides, and its slab march ends at 10 km
  (`CLOUD_DECK_MARCH_MAX_M`) where the far band (8–11 km) and the haze ramp own the horizon.
- `deckLight`: the underside is lit by what the column above it transmits — two base-shape taps of the optical depth
  above the point over the remaining column (0.22 / 0.66 of it, the ladder scaled per texel by the blue noise like the
  light march's) through the diffusion law of a thick non-absorbing cloud, T = 1 / (1 + 0.75 (1 − g) τ) with g 0.85:
  the thick cores dark, the thin borders bright. The top's irradiance is the sun's on the horizontal (its colour half
  way to neutral) at a THIRD of its physical share (`CLOUD_DECK_SUN_SHARE`, the display finding above) plus the sky's
  whole (the summary's E / π), the ground bounce a quarter of the top's irradiance at a mean transmission of 0.3 times
  the map's ambient scale (winter's 2.0 is the snow), the lower sky at 0.4, and the sky itself near a column's top. The
  light-march directional term stays (a lump's flank lit from the side, the walls at the breaks; its two near taps
  share the point's column and cell factor) and is extended to the plane-parallel slant depth only where the near
  taps are already inside cloud (`smoothstep( 0.3, 1.5, lastLight )`): a sheet's glow toward the sun follows the whole
  slant, a flank keeps its light. A blended deckLight paid both lighting paths (polders 1.7 ms), so the deck rows take
  it whole.
- `undulatus`: the wind-frame street rolls band the thickness (0.6 + 0.8 × the roll, capped at 1).
- `interior`: the coarse detail octave (25–100 m) modulates the density inside a mass (0.5..1) instead of vanishing in
  the remap, and the first light tap is detailed (the fine octave skipped), so a lit face shades bulge by bulge
  (broken stratocumulus, altocumulus, the ash veil; the fair-weather rows can take it at the owner's call with a sheet).
Denser deck rows (τ 15–40 in the cores: stratocumulus-deck 0.06 → 0.11, broken 0.07 → 0.12, overcast 0.035 → 0.06,
dense 0.05 → 0.09, hazy 0.03 → 0.05, ice fog 0.03 → 0.05, ash 0.05 → 0.07). Two regimes: `industrial-stratocumulus`
(a low closed cellular deck under a smoggy horizon — Foundry at 850 m with a warm-grey base 0xd8cec0, coverage 0.88;
Railyard closed at 0.92 / 800 m, density 0.16, cells 0.9 at 1300 m, undulatus 0.35, a weaker sun 0.7 and a dirtier
neutral base 0xbab5ac) and `altocumulus` (Urban: a broad field cut into 340 m elements at 2800 m, stratiform 0.4,
coverage 0.55, interior 0.4, shaded bases and lit borders with blue between). Polders' deck a step higher (420 →
600 m) with 750 m cells at 0.8 and coverage 0.68 (the pre-pass admitted); the broken-stratocumulus row at stratiform
0.5; winter's ambient scale 2.0 (the snow bounce keeps the deck bright under its cells).

**Foundry and Railyard re-graded.** Round 65's open note (an overcast is a cloud layer, not a heavy aerosol) closed:
Foundry's aerosol halved (mie 0.012 → 0.006: the sun's transmittance and the ground's fill rise, never fall), its fog
a third thinner (0.00074 → 0.00052) and neutral (0x858384, mix 0.45), the smog as the aerosol's warm absorption
(`atmosphere.mieTintHex` 0xd2b28c: soot and dust scatter blue least — the horizon band is the one place a warm haze
survives the aerial pass's blue-grey guard) and on the deck's base; Railyard's fog (the fleet's heaviest) a quarter
thinner (0.0008 → 0.0006, mix 0.9 → 0.72). Measured on the bird-n view (bands of the 1600 × 900 capture): Foundry's
sky-top band 174 / 183 / 180 → 154 / 156 / 156 (the grey cellular deck where the white haze was), the ridge 164 /
172 / 170 → 177 / 180 / 174, the far ground 150 / 160 / 159 → 161 / 166 / 161 at the same local contrast (3.0 →
2.9). Honest limit: the far ground under a kilometre is hazed by the aerial pass's map-independent law
(AERIAL_HAZE_DENSITY at its 0.55 scatter ceiling toward `mix( skyT, fogTint, fogMix )` under the blue-grey guard), so
the bird view's far field keeps most of its wash whatever the sky block authors — what moved is the wash's target (a
warm horizon, a neutral fog) and the sky above it; the centre-far view reads as a cellular overcast over the
ironworks. The mobile tier's baked decks keep their overcast rule (turbidity 7.8 / 9 with the opaque decks) and the
Garage mirrors follow (`garageSkyPresets` green); the byte receipt projects the sky lines back through
`round76DeckRegrade.test-support.mjs` (innermost, before the round-72 projection).

**Coastal's palm.** Saltmere Bay's lone mix planted a palm (0.20) among maritime pines, cedars and salt-pruned oaks on
a temperate shore: the species list and the lone mix drop it (pine 0.38, cedar 0.31, oak 0.31 — one rng draw per lone
tree whatever the mix, so the placements stay), its palette with it; the byte receipt projects the two blocks back.

**Measured (code tip 709ff1d5c; `.qa-dev/r76-deck-metrics.mjs` on the history masks: the p80 / p20 display luma of the
dense pixels (α ≥ 0.6), the mottle (mean |Δluma| at 24 px over the mean dense luma), the deck / clear-sky ratio; sky-w /
sky-s; before = the deploy-100 tree eeecca19e captured on this machine, `$SP/r76/before`, after `$SP/r76/after`; the
sheets `$SP/r76/review/sheet-sky-w.png`, `sheet-sky-s.png`, `sheet-bird-n.png`, the numbers in
`$SP/r76/metrics-{before,after}-deck.txt`, `metrics-{before,after}.txt`, `controls.txt`).**

| Map | p80 / p20 before → after | mottle before → after | deck / sky before → after | deck median (display) |
|---|---|---|---|---|
| foundry | 1.02 / 1.05 → 1.30 / 1.14 | 0.029 / 0.036 → 0.050 / 0.037 | 1.73 / 1.22 → 1.33 / 1.65 (the sky between the cells darker: the aerosol halved) | 207 / 210 → 140 / 151 |
| railyard | 1.01 / 1.02 → 1.18 / 1.14 | 0.026 / 0.030 → 0.041 / 0.036 | 1.28 / 1.01 → 0.93 / 1.09 | 215 / 216 → 157 / 166 |
| winter | 1.08 / 1.05 → 1.17 / 1.17 | 0.045 / 0.036 → 0.054 / 0.049 | 1.26 / 1.11 → 0.98 / 0.87 | 187 / 191 → 151 / 153 |
| polders | 1.08 / 1.06 → 1.18 / 1.19 | 0.019 / 0.007 → 0.035 / 0.031 | 1.80 / 1.47 → 1.54 / 1.34 | 208 / 209 → 173 / 186 |
| urban | 2.38 / 3.70 → 2.56 / 3.69 | 0.170 / 0.204 → 0.175 / 0.281 | 1.03 / 1.17 → 0.96 / 1.00 | 181 / 211 → 175 / 185 |
| fjord | 1.62 / 2.20 → 1.36 / 1.86 | 0.046 / 0.082 → 0.069 / 0.098 | 1.72 / 1.00 → 1.21 / 0.85 | 190 / 136 → 137 / 133 |
| titan_gorge | 1.41 / 2.19 → 1.18 / 1.77 | 0.053 / 0.060 → 0.066 / 0.075 | 1.20 / – → 0.78 / – | 207 / 207 → 155 / 151 |
| blackglass | 18.9 / 1.38 → 12.6 / 1.41 | 0.273 / 0.065 → 0.296 / 0.092 | 1.85 / 1.33 → 1.46 / 0.91 | 57 / 171 → 47 / 105 |
| whiteout (control) | 1.06 / 1.04 → 1.06 / 1.04 | 0.042 / 0.030 → 0.042 / 0.030 | 1.71 / 3.02 → 1.71 / 3.05 | 186 / 190 → 186 / 190 |

The closed decks' p80 / p20 sits at 1.14–1.30 — the tonemap's shoulder compresses what the cells' transmission
spreads (the same cells read at 1.2–2.4 in the cellContrast column) — but the flat sheet is gone on every one: the
mottle doubled on foundry and polders and rose 20–35 % on railyard and winter, and every deck median dropped 40–60
display levels to sit at or under the clear sky where it stood 1.2–1.8 × above it. Eye check of the sheets: foundry
and railyard read as grey cellular overcasts with lit borders and blue breaks, winter as a lumpy grey deck over the
range (greyer than 71b's white mass: the snow bounce at 2.0 keeps it from going dull), polders as a lumpy deck with
grey undersides and lit tops, fjord as lumpier, greyer masses, urban as a layer of small elements with shaded bases,
titan as a heavy dark overcast, blackglass's ash lumps darker. **Controls** (`controls.txt`, the round-71 metrics
before → after): alpine, coastal, steppe, frontier, verdant, delta, monsoon, whiteout, desert, saltwind, mangrove and
mars hold every number — coverage, largest component, light ratio, contrast, base sRGB and the sky bands — to ±1
(the deterministic boot makes the two runs frame-comparable; whiteout is identical); the exceptions are autumn's
sky-s light ratio 1.09 → 1.34 on an 8 % cloud view with few dense runs (its sky-w identical), mangrove's sky-s largest
component 93 → 70 % (a split at the α threshold, every other number identical) and coastal's lower band +4 (the
trees, not the sky).

**Performance (`.qa-dev/r71-trace-bench.mjs`, the ×1 against ×11 repetition, Δ / 10, 90 frames × 3 rounds at the
chase pose; medians of the rounds with the rounds' span; the machine at load 68–103 from other sessions).** Final
tree: foundry 0.20 ms (−0.57..0.27), railyard −0.49 (−0.96..−0.13), winter 0.85 (0.78..0.92), urban 0.10
(−0.23..1.29), fjord 0.67 (0.48..0.81) and 1.45 (1.21..1.53) on two runs of the same build, monsoon 1.30
(1.19..3.02; untouched: 71c read 1.05–1.54), verdant 0.79 (0.00..1.09; 71c 0.35–0.59), polders 1.76 (1.62..2.23; before
the cost levers 2.31–2.35, the first bench 1.5–1.8). The noise floor at this load is ±0.5–0.7 ms a run — the same
winter build read 0.03 / 0.38 / 1.10 / 0.85 across four runs — so foundry, railyard, urban, winter, fjord and verdant
sit inside the 1.2 ms slot within it; polders is the one slot over the line by this bench (the low deck at 600 m over
a flat map: the chase pose's grazing rays cross it for the whole march; the 10 km cap, the border striding and the
single lighting path each moved it inside the noise). CPU per slot within ±0.2 ms of zero. No new texture: the cell
field is the shape volume read in a slice; the mobile tier never creates the layer.

**Receipts (exit 0, the sweep on the final tree).** volumetricClouds (20 regimes, the 31-map table, the gated zero
rows, the deck identities, the key following the knobs), atmosphere, skyCloudBake (the baked decks' bytes unchanged),
skyHorizonCache, skyEnvironmentCache, garageSkyPresets, battleAtmosphereRuntime, battleAtmosphereAccess,
badlandsRelief (the round-76 projection innermost), playableRelief, redrockMaterial, villageWear and
mangroveWaterPalette (re-pinned four times: the clouds blocks, the haze re-grade, the palm, polders' retune),
environmentSurfaceColor, mapQuality, worldActivationRuntime, horizonCloudShade, horizonResources, wallSkyLight,
sourcedTerrainPreparation, terrainMaterialOwnership, worldBuildCoordinator, vegetationResources,
vegetationProgramKey, vegetationClearance, vegetationLighting, vegetationFarSeams, sunShafts, contactShadows,
temporalAA, deviceEnvRadiance, postLightFxPolicy, shadowGeometryClaims, adaptiveQualityPolicy, quality,
horizonRelief, roadContinuity, shoreline, groundRedux, postFrameAccounting, lateFxColorHandoff, sceneSourcePass,
frameLoopScheduler, renderLayers (44 green); `npm run typecheck`.

**Open.** Polders' slot at 1.6–1.8 ms by this bench (the next lever is its base or a deck-only coarser stride at
grazing angles); the closed decks' p80 / p20 under 1.6 (the display's shoulder — a tone-mapping change is the owner's
call); mammatus (pouches under an anvil or a thick deck: a cell-driven base sag with a directional term on the lobe
sides) not built; the far-ground wash of the bird views is the aerial pass's global law; the fair-weather rows do not
take the interior octave (the rated maps stay byte-identical — the owner can opt them in with a sheet); the top /
base ratio ≥ 1.6 is a cumulus-mass number and does not measure a deck seen from below — the p80 / p20 and mottle are
the deck's numbers here; Titan and Blackglass took the deck rows' lighting through the shared rows and were
eye-checked on the sheet only; the round-68 / 71 items not closed here (the inside-the-slab camera, the cascade policy
for the gobos, a moonlit edge at night).
### Round 77 — 2026-09-26: the vegetation — wind, lit crowns, whorls and moss, far shade sides, the understorey, the stand shade

**Why.** After the ground (rounds 73 / 73b), the skies (71 / 76) and the mountains (72), the trees were the loudest
gap in the deploy-98–101 frames (`$SP/r77/evidence/`): canopies as stylised low-poly blobs with flat, unlit foliage
(no translucency, no self-shadowing, one tone per cluster), trunks as plain cylinders, conifers as stacked cones,
forest edges as hard lines of identical trees, far forests as a green band, and nothing moving while the grass at
their feet bent and cast shadows. Trees are the most visible element after the ground and the sky.

**The rule of the round.** Every tree and shrub placement, every trunk collision record and every cover disc stays
byte-identical (the placement receipts pin them; nothing here consumes a placement RNG draw). What changes is how the
same instances are lit, shaped, moved and accompanied. Nothing in `src/sim`, `terrain.ts`, the ground rounds' modules
or the horizon ring.

**Mechanisms (all in `src/world/vegetation.ts` unless named).**

1. *The wind* (`src/world/treeClimate.ts`, THREE-free, per map: the direction from the map's cloud wind
   (`clouds.windDirDeg`) or the ground profile's prevailing wind (the tall-grass biome's `windDir`, so the blades and
   the crowns answer one wind), the strength from the cloud regime's speed against 7 m/s in a 0.55–1.6 band — a
   cumulonimbus front leans the stands, an overcast stratus barely stirs them). The vertex law in `makeTreeWindHook`,
   shared by bark, near cards and far lobes so the LOD cross-fade stays aligned: a gust front travelling down the wind
   (350 m wavelength, ~8 m/s) with a per-tree gustiness; every tree leans by the SQUARE of its height (a cantilever —
   the base holds, the crown moves; 0.30 m at a nominal 8 m crown top at strength 1, a gust ~1.4 ×) with a small
   cross-wind roll; the canopy flutters about the lean by its authored flex (`aFlex`, the palettes' `cardL0` law,
   0.11 m at flex 1) with a per-card phase hashed from that flex and the card's station. Instance space, before the
   instance matrix, so a tall rim tree leans further; the trunk record never moves; the crown shadow proxies stay
   static (a swaying cascade shadow flashes). The mobile tier keeps a third of the lean and half the flutter. In a
   still frame the neighbours lean by different amounts (the phases); in play the stand breathes. The old sway
   (0.14 m × flex, no lean, no gust) is gone.
2. *Lit crowns.* (a) `foliageCard` gives every VERTEX the sphere normal at its own station about the crown centre
   (the card curves with the crown and shades across its face instead of as one flat facet), the caller's up-bias at
   40 % and a per-card tilt of up to ±11° hashed from the card's station; the palm fronds' bias likewise halved. (b)
   The near cards RECEIVE the sun's cascades on the desktop tiers (`foliage.receiveShadow`), sampled ONCE per leaf
   cluster: `aCard` (vec4: the card's centre in instance space, the crown radius) and the CSM's first light read in
   the vertex stage (the `DirectionalLight` struct redeclared there, the view-space direction turned to world by the
   view rotation's transpose — no new uniform, no CPU work) push the sample point out toward the sun by the crown
   radius × the instance scale before `shadowmap_vertex` takes the shadow coordinates, so a card on the sun side of
   its own crown proxy samples clear sky and a card behind it samples the proxy's shadow — a self-shadowed crown at
   cluster granularity, one shadow state per card, none of the per-fragment sparkle that kept the cards unshadowed
   since the r5 budget (the round-13 rule of the grass roots, one level up); neighbouring crowns, buildings and the
   terrain shade the cards the same way. Bushes and the understorey sample 0.9 m over their base and 1.6 × their
   scale toward the sun (their five attributes are frozen by the shrub receipts), one state per shrub. (c) A shaded
   cluster keeps 22 % of the direct term (`cotLeafShadow` wrapping every directional `getShadow` site of the CSM
   chunk — the light scattered and transmitted through the leaves around it) and the sky under it falls to 50 %
   (`cotLeafSky` on the engine's `cotAmbDim` anchor, the raw visibility recovered from the softened `cotSunVis`);
   the foliage sky fill 0.85 → 0.75. (d) Leaf translucency (`canopyLighting.ts`, a `thin` parameter the horizon ring
   leaves at 0): the third power of the view-against-sun cosine × the (shadowed) direct light, 45 % on the near cards
   and 18 % on the far lobes — the glowing rim of a crown between the camera and the sun and nowhere else.
3. *Trunks.* Branch whorls under the conifers' needle tiers: three tapered open three-sided limbs every 0.62 m from
   2.0 m (above the trunk-quality receipt's lower-stem band at every species' vertical scale) to 5.5 m, reaching the
   tier radius and drooping 15–30° below level (18 limbs, 108 triangles, hashed from the trunk phase — no RNG draw, so
   the winter snow lobes keep their exact stream). Moss on the shaded side of the trunk bases by the map's climate
   (`resolveTrunkMoss`: the ground profile's outcrop-rim tint's green-over-red ratio — a full collar on the wet maps,
   a lichen dusting on the temperate ones, none on the arid and frozen), grown in the bark sheet's darker fissures,
   thickest at the ground and gone by 3 m, on the side turned from the sun (`barkHook`, `world-tree-bark-v10`).
4. *Far LOD.* The lobes' sphere-normal up-bias halved on every far builder (oak 1 → 0.5, pine 0.75 → 0.4, the tufts
   0.85 → 0.45, the palm core 1.2 → 0.6 and skirt 0.7 → 0.4, birch 1 → 0.5) so a far crown carries a lit side and a
   shade side; the far canopy's sky fill 1.08 → 0.80 (it flattened the lobes); the far translucency above.
5. *The understorey.* Young shrubs (`buildUnderstoreyCards`: ten folded sprays on the bush species' atlas, a touch
   yellower, their own geometry so the shrub receipts' two bush shapes stay exactly theirs) in every stand's edge
   annulus with a density falling from 0.82 R to nothing at 1.6 R (`placeUnderstorey`: its own RNG stream, the bush
   admission — roads, soft ground, water, slopes, spawns, the village, the structure clearances — no cover disc and
   no trunk record: pure dressing that conceals nothing and stops nothing); desktop tiers only. Verdant 780, Autumn
   494, Fjord 694 shrubs (`understorey.selftest`).
6. *The stand shade.* A tree inside a dense stand stands under its neighbours' crowns: neighbours within 10 m on a
   12 m grid (8 saturating), a smoothstep of the density, up to −24 % in the instance tint every LOD shares — the
   crown-scale contrast a far forest needs to read as trees and not as a band, and the tone the near stand's interior
   carries; counted after the last RNG-driven placement and before the structure, road and tidal passes (a
   relocated mangrove keeps its stand's tone, a build with or without the tidal band tints alike).

**Program keys:** `world-tree-foliage-v16`, `world-tree-canopyfar-v16`, `world-tree-bark-v10`. No new texture, no
new material, no new draw call class beyond the one understorey mesh per map; no texture fetch added
(`vegetationLighting` still counts six).

**Measurements.** Six maps (Verdant, Amberford, Saltmere Bay, Monsoon Ridge, Nordhavn Fjord, Tarkhan Steppe) on one
seed and tier, the base tree 25aace4f0 against the round's tree, from `$SP/r77-base` and rsync snapshots of the worktree
served live by vite, under the probe mutex at nice 19 (`.qa-dev/r77-capture.mjs`, `.qa-dev/r77-bench.mjs`,
`.qa-dev/r77-sheet.mjs`, `.qa-dev/r77-diff.mjs`; outputs under `$SP/r77/`). Views: the table's `centre-far`, `bird-n`,
the hull-relative `chase` and `side`, and the round's own `forest-edge` (2.2 m over the ground 24 m outside the map's
largest stand whose approach is level and in the line of sight), `forest-edge-far` (90 m out at 6 m), `stand-mid` (40 m
out at 9 m) and the still-frame wind pair. Sheets: `$SP/r77/review/sheet-{centre-far,stand-mid,forest-edge,forest-edge-far,side,chase,bird-n}.png`
(before | after) and `sheet-wind-pair.png` (t = 0 | t = 2.5 s | |Δ| × 4).

*What the eye sees on the sheets.* Crowns carry a lit top and a shaded underside and side, and the stand interiors sit
darker than the edge trees (stand-mid, forest-edge); the conifers show their limbs under the tiers (Nordhavn's
forest-edge-far); bushes and the new understorey shrubs at the stand edges have a lit crown and a dark base; the wind
pair shows neighbouring crowns leaning by different amounts. At centre-far the mid-ground stands gain crown-to-crown
contrast; the far band at 400–900 m is little changed (the weak list below). The frame-level triangle and draw counts
are not comparable run to run (the grass streams and the hulls stand where the countdown left them), so the triangle
budget reads off the deterministic vegetation census (instances × geometry per class) instead.

**Vegetation triangles per view (the census: instances × geometry, deterministic; before → after; the stand-mid and forest-edge poses under the line-of-sight picker, before3 → a4).**

| Map | chase | centre-far | bird-n | stand-mid | forest-edge |
|---|---|---|---|---|---|
| verdant | 1977 k → 2022 k (+2.2 %) | 1938 k → 1986 k (+2.5 %) | 1977 k → 2022 k (+2.2 %) | 2160 k → 2214 k (+2.5 %) | 1936 k → 1990 k (+2.8 %) |
| autumn | 2154 k → 2173 k (+0.9 %) | 1796 k → 1816 k (+1.1 %) | 1824 k → 1843 k (+1.1 %) | 2090 k → 2109 k (+0.9 %) | 2060 k → 2080 k (+1.0 %) |
| coastal | 1094 k → 1165 k (+6.5 %) | 1064 k → 1120 k (+5.2 %) | 1110 k → 1174 k (+5.8 %) | 1048 k → 1104 k (+5.3 %) | 993 k → 1042 k (+5.0 %) |
| monsoon | 3516 k → 3558 k (+1.2 %) | 2664 k → 2706 k (+1.6 %) | 2748 k → 2789 k (+1.5 %) | 2758 k → 2800 k (+1.5 %) | 2920 k → 2962 k (+1.4 %) |
| fjord | 2185 k → 2380 k (+8.9 %) | 1344 k → 1390 k (+3.5 %) | 1431 k → 1495 k (+4.4 %) | 1906 k → 2045 k (+7.3 %) | 2008 k → 2163 k (+7.7 %) |
| steppe | 442 k → 452 k (+2.3 %) | 401 k → 406 k (+1.3 %) | 376 k → 378 k (+0.6 %) | 405 k → 418 k (+3.2 %) | 398 k → 412 k (+3.3 %) |

**The bench (per-copy GPU ms, p25-based / med-based / min-based over the rounds; the lower quartile of 50 frames per side, 9 copies, 4 rounds; before → a3; the rounds' spread in brackets is the noise floor).**

| Map | view | load | near ×9 per copy | far ×9 per copy | bush ×9 per copy | shade (PCF, per copy) | wind (per copy) | ×1 toggle (whole vegetation) |
|---|---|---|---|---|---|---|---|---|
| verdant | chase | 104 → 107 | 1.62 → 4.16 / 4.39 / 1.51 [1.3..4.6] | 2.35 → 2.24 / 2.17 / 1.91 [1.3..2.6] | 0.06 → 0.10 / 0.09 / 0.05 [-0.0..0.2] | 0.00 / 0.02 / 0.07 [-0.3..0.2] | 0.17 / 0.14 / -0.18 [-0.0..0.3] | -4.68 ms GPU, cpu +3.30, update +0.00, calls 193, tris 4.10 M |
| verdant | centre-far | 99 → 102 | 2.92 → 1.15 / 1.18 / 1.01 [-0.2..2.8] | 3.65 → 3.76 / 3.88 / 3.38 [0.9..4.0] | 0.09 → -0.08 / -0.02 / -0.11 [-0.2..-0.1] | — | — | +0.42 ms GPU, cpu +1.50, update +0.00, calls 246, tris 4.37 M |
| autumn | chase | 94 → 100 | 6.00 → 6.58 / 6.83 / 5.12 [5.8..6.7] | 3.10 → 2.09 / 2.79 / 1.35 [0.9..2.8] | -0.11 → 0.09 / 0.05 / 0.10 [-0.5..0.1] | 0.09 / 0.01 / 1.37 [-0.3..2.3] | 0.11 / 0.19 / -0.43 [-0.6..0.3] | +0.23 ms GPU, cpu +2.60, update +0.00, calls 189, tris 6.57 M |
| autumn | centre-far | 94 → 91 | 4.06 → 3.44 / 3.65 / 2.92 [0.9..3.8] | 0.98 → 2.14 / 2.06 / 1.75 [-0.1..3.7] | 0.13 → -0.00 / 0.06 / -0.03 [-0.2..0.0] | — | — | +0.83 ms GPU, cpu +2.20, update +0.00, calls 149, tris 3.31 M |
| coastal | chase | 91 → 92 | 2.21 → 2.73 / 3.17 / 1.75 [0.7..3.3] | 2.11 → 2.27 / 2.36 / 1.59 [0.3..2.3] | 0.09 → -0.34 / -0.14 / -0.30 [-0.5..0.5] | 0.33 / 0.17 / -0.10 [-0.3..2.0] | -0.26 / -0.04 / -0.11 [-0.5..-0.0] | +0.14 ms GPU, cpu +2.10, update +0.00, calls 142, tris 2.29 M |
| coastal | centre-far | 82 → 87 | 0.62 → 1.98 / 2.60 / 1.22 [0.1..2.0] | 1.81 → 1.57 / 1.88 / 0.82 [-0.1..1.8] | 0.10 → -0.10 / -0.09 / -0.10 [-1.1..0.2] | — | — | +0.98 ms GPU, cpu +1.50, update +0.00, calls 218, tris 2.69 M |
| monsoon | chase | 91 → 88 | 6.49 → 6.16 / 6.78 / 5.29 [5.3..7.2] | 4.54 → 4.42 / 4.99 / 3.67 [4.0..4.5] | 0.84 → 0.57 / 0.80 / 0.62 [0.4..0.7] | 0.20 / 0.31 / 0.39 [-0.7..0.8] | -0.03 / -0.15 / 0.91 [-0.2..0.1] | +14.22 ms GPU, cpu +4.90, update +0.00, calls 233, tris 8.97 M |
| monsoon | centre-far | 92 → 80 | 3.88 → 3.35 / 3.84 / 2.93 [1.0..3.7] | 4.90 → 4.71 / 4.96 / 3.43 [4.3..4.9] | 0.31 → 0.27 / 0.31 / 0.35 [-0.1..0.4] | — | — | -2.05 ms GPU, cpu +2.20, update +0.30, calls 194, tris 5.07 M |
| fjord | chase | 93 → 78 | 5.04 → 6.49 / 7.61 / 5.25 [4.7..7.0] | 3.25 → 3.35 / 3.53 / 2.96 [0.9..3.7] | -0.00 → 0.10 / -0.07 / 0.16 [-0.3..0.3] | -0.01 / -0.11 / -0.11 [-0.4..0.3] | -0.03 / -0.04 / -0.28 [-0.1..0.1] | +1.59 ms GPU, cpu +2.40, update +0.00, calls 162, tris 7.00 M |
| fjord | centre-far | 97 → 75 | -0.06 → 0.07 / -0.04 / 0.13 [-0.4..0.2] | 5.99 → 6.11 / 6.37 / 3.50 [0.6..6.2] | -0.07 → -0.17 / -0.22 / -0.06 [-0.4..0.1] | — | — | +0.56 ms GPU, cpu +0.90, update +0.10, calls 65, tris 1.73 M |
| steppe | chase | 109 → 77 | 0.32 → 0.19 / -0.09 / 0.48 [-0.4..0.7] | 0.15 → 0.14 / 0.17 / 0.23 [-0.2..0.5] | -0.01 → 0.20 / 0.10 / 0.29 [-0.1..0.6] | -0.01 / 0.07 / -0.04 [-0.3..0.3] | 0.07 / -0.04 / -0.00 [-0.1..0.4] | -0.40 ms GPU, cpu +2.50, update +0.00, calls 164, tris 1.22 M |
| steppe | centre-far | 112 → 75 | 0.13 → -0.01 / -0.09 / -0.16 [-0.2..0.1] | -0.01 → 0.02 / 0.17 / 0.20 [-0.3..1.1] | 0.21 → -0.04 / -0.17 / 0.04 [-0.4..0.2] | — | — | +0.25 ms GPU, cpu +0.30, update -0.60, calls 116, tris 0.95 M |

**The still-frame wind pair (the forest-edge pose, the grass tiers hidden, the world clock at 0 and 2.5 s; mean |Δ luma| and the share of pixels moved by > 12 luma in the tree band, a4).**

| Map | mean abs Δ | moved share | band mean | band moved |
|---|---|---|---|---|
| verdant | 3.83 | 9.2 % | 4.92 | 11.9 % |
| autumn | 5.58 | 12.1 % | 6.51 | 14.4 % |
| coastal | 2.68 | 5.2 % | 3.69 | 7.3 % |
| monsoon | 3.70 | 8.9 % | 5.04 | 12.5 % |
| fjord | 2.21 | 4.6 % | 2.69 | 6.2 % |
| steppe | 3.77 | 8.2 % | 5.18 | 11.5 % |

*Reading the bench.* Machine load 72–127 from other lanes' renders throughout: the ×1 whole-vegetation toggle is unreadable
(±5 ms, negative on several rows) and the ×9 per-copy rows spread ±1–2 ms between rounds. Within that floor the near-LOD
draw (trunks + cards) reads +0.5–1.4 ms per copy at chase on the conifer-dense maps (Nordhavn, Amberford) and inside the
noise elsewhere; the far LOD, the bushes and the far-lobe changes read at zero. The two in-page A/B layers isolate the
round's own costs cleanly (five rounds, both sides in one page): the per-cluster cascade sample on the cards, bushes and
understorey (`shade`) costs 0.0–0.33 ms per copy at chase (Saltmere 0.33, Monsoon 0.20, the rest ≤ 0.1) and the wind
law (`wind`) 0.0 ± 0.2 ms with a CPU delta of 0 (one float add per frame). Draw calls: +1 per map (the understorey mesh);
the census above is the triangle budget — the whorls are its whole cost (Nordhavn +8–9 % at chase, the other maps +1–7 %),
the understorey ≤ +1 %, the shadows and the wind none.

**Receipts.** `treeClimate.selftest` (new: the 31 maps' wind sources, the strength band, the moss by climate),
`understorey.selftest` (new: the shrub's shape and storage, the edge-annulus placement off roads / soft ground /
slopes / spawns / the village, no cover or trunk records, mobile none, deterministic), `vegetationProgramKey` (the v16
keys; the round's GLSL mechanisms asserted on the expanded near-card program: the uniforms, the height-squared lean,
`aCard`, the vertex-stage light, the sample pushed toward the sun before the shadow coordinates, the three directional
sites wrapped, the 22 % floor, the 50 % sky, the translucency), `vegetationLighting` (the garage pine 1356 → 1680
vertices), `birchCrownForm` (`aCard` position-like), `bushOverlappingSprays` (the legacy negative drops `aCard`),
`shrubGrowthPlacement` (the understorey shrub's streams follow the two bush shapes out of the exact comparison, its own
receipt pins them); green with no change: vegetationResources, vegetationFarSeams, treeTrunkQuality (minimum 98.3 /
100), treePoolCapacity, foliageAtlasPadding, treeSpecies, treeGrounding, vegetationClearance, authoredTreePlacement,
tidalMangrove, palmStemDirection, autumnLeafSprays, broadleafBranchlets, autumnSeasonalPalette, foundryServiceCourt,
grassCarpetWork, grassChunkWork, grassLighting, grassAtlasPadding, grassBladeShape, loggingYardGrass, groundCoverClearance,
horizonResources, mangroveFisheryWharf, spawnClearance, terrainFastGrid, terrainWornDirt, woodyRootOrientation;
`npm run typecheck`.

**What still looks weak.**
- The far forests at 300–900 m are still lobe clouds: better lit and stand-shaded, but not impostors of the near
  trees — a baked octahedral impostor atlas (rendered from the near LOD at activation, the horizon atlas's pattern)
  is the next step; the seam with the ring forest is unchanged.
- The crowns are still card clouds at 5–15 m: the leaf masks are the round-8 atlases (hash-pinned by
  `broadleafBranchlets`); a leaf-scale normal (a baked normal map for the cluster atlas) would let the sun catch
  individual leaves.
- The forest floor is not darker under dense canopy beyond the cascades' reach: the terrain has no canopy channel and
  `terrain.ts` is off limits to this round.
- The rim-forest blocks get no understorey (they are not clusters); the edge feathering there is the saplings' alone.
- The bench on this machine at load 90–110 cannot resolve the round's GPU cost below ±1 ms per copy; the
  measurements below are honest about the floor.

### Round 77b — 2026-09-26: the far forests as impostors of the near trees, the leaf-scale crown detail, the rim understorey

**Why.** Round 77's own weak list: the far forests at 300–900 m were still lobe clouds (better lit, not the near
trees — a forest edge changed character at the 260 / 290 m switch, and every far tree cost its lobes' triangles and
two draws per species and far variant); the crowns at 5–15 m were flat-lit card clouds (the round-8 atlases are
hash-pinned, and no leaf-scale normal); the rim-forest blocks had no understorey; the Nordhavn near-LOD cost was
unmeasured on a quiet machine. The owner's bar stands: World of Tanks / War Thunder-class, "make sure performance
is still rlly good".

**The rule of the round.** Every tree and shrub placement, trunk record and cover disc stays byte-identical (the
placement receipts; the stands' understorey draws the same stream in the same order — the rim blocks take the
stream's continuation). The round-8 leaf atlases are untouched (`broadleafBranchlets` pins them): the detail tile
is ADDED beside them as the material's normal map. Nothing in `terrain.ts`, the ground modules, the horizon ring, the
props kits, the sky or `src/sim`; the ring forest beyond 512 m is untouched and `vegetationFarSeams` keeps proving
the lobe builders (the lobes still build: the near crowns' shadow proxies are their hulls, and the mobile tier and
the receipts draw them).

**Mechanisms.**

1. *The far tier as impostors* (`src/world/treeImpostors.ts`). One atlas per world of every species' three near
   variants from eight azimuths at a 10° elevation, one row per species and variant (rows = 3 × species, 9–12 on
   the authored maps; the tile from the 6 MB budget — 128 / 96 / 64 px per direction, the largest whose albedo plus
   half-resolution normal atlas with mips fits: 96 px on every authored map, 768 × 864 (Nordhavn, 3 species,
   4.22 MB) to 768 × 1152 (Verdant / Delta / the 4-species maps, 5.63 MB)), baked from the ACTUAL near-LOD trunks and
   cards with the species' leaf atlas, the bark sheet and the vertex shade into two render targets: linear albedo
   with a coverage alpha (the cards cut at the near material's 0.38, the gutters flooded with the leaf atlases'
   mean opaque tone so the mips never darken toward black) and the capture-space normal (the cards' sphere normals
   and the bark's, unflipped). The bake is lazy — `ensureBaked()` from the vegetation's per-frame `update()`,
   outside any render pass, on the first frame that needs the tier, with the previous render target, clear colour,
   autoClear, shadow-map and XR state restored — and runs again after a GPU suspension disposes the atlas (the
   textures' dispose listener frees the framebuffers and clears the flag). It exists only where the engine context
   carries a `renderer` (production desktop); the receipts (no renderer) and the mobile tier keep the lobe tier.
   The far pools: one InstancedMesh per species and far variant on the impostor material (the second variant
   MIRRORED — its azimuths run the other way, its baked x flips — for variety at no cost), a quad each, `aImpRow`
   (the tree's near variant, written with its slot through `writeTreeSlot` / `seedTreePartition`) and a per-vertex
   `aImpCell` (the species' first row, the mirror flag, the variants baked) picking the row. The vertex stage builds
   a camera-facing billboard in INSTANCE space (the instance matrix — position, yaw, lean, scale — and the round-77
   wind law that follows it apply exactly as to the cards: the lean by the unscaled height), the crown's visible
   width from the instance's xz scale seen from the azimuth, the two nearest azimuths and their blend weight;
   the fragment stage dissolves the two tiles by the view angle (alpha too, through the alpha-to-coverage
   smoothstep), gives the coverage back with the mip level (the cards' mip guard, on the tile's own texel
   derivatives) and lights the blended baked normal in the capture frame (right / up / toward-camera at the 10°
   elevation) through the far canopy's own hook — the matte wrap, the 18 % translucency, the LOD / occlusion /
   scope dissolves, fog. Two draws per species instead of four, two triangles per far tree instead of a lobe cloud.
   The variants baked follow the 16-row cap (`resolveTreeImpostorVariants`: three for every authored map, one on the
   receipts' 13-species world). Key `world-tree-impostor-v1`.
2. *The leaf-scale crown detail* (`src/world/leafDetail.ts`, CPU, no canvas). A 256 px tiling height field of
   stamped leaf shapes per class — broadleaf (110 oval leaves with a midrib), autumn (70, smaller: the dusty and
   autumn palettes' sparser crowns; resolved from the palette's tone against a reference green, never a map id — the
   desert acacias take it too), conifer (84 needle bundles), palm (40 ridged leaflets) — wrapped for tiling, a Sobel
   normal (RG, B), and a break mask (A) OFFSET so its mean over the tile is exactly one half (a short bisection; a
   needle tile takes a floor in its gaps, a broadleaf tile a ceiling on its bodies). The near material carries the
   class's tile as its `normalMap` (repeat 3 across a card — 0.37–0.8 m tiles, leaves of 5–12 cm; normalScale 0.75),
   so every species keeps one program (`vegetationProgramKey`); the hook samples it ONCE (`cotLeafDet`), applies the
   mean-neutral law before the alpha test — alpha × (0.72 + 0.56 · mask): the card's antialiased edge texels are cut
   in leaf-cluster bites and its bodies solidified; albedo × (0.90 + 0.20 · mask): the gaps between leaves shade —
   and perturbs the authored sphere normal in a tangent frame REBUILT after `useAttributeNormal` (three's own frame
   is built in `normal_fragment_begin` from the double-sided flip and would light every back face from below
   again; its `normal_fragment_maps` is compiled out where a tile is bound). At the far mips the mask averages to
   its mean and both laws read ×1: the coverage the mip guard protects and the crown's tone are the round-77 ones.
   Desktop tiers only (the mobile library returns no tile and the phones keep the flat card program). Key
   `world-tree-foliage-v17`.
3. *The rim understorey.* `placeRimForest` records every block that stands (≥ 3 trees) as a disc (its centre, half
   its width); `placeUnderstorey` plants the interior stands first (the same draws in the same order — byte-identical)
   and then the rim blocks from the stream's continuation through the same law (the edge annulus 0.82–1.6 R, the
   bush admission, no cover disc, no trunk record), at the rim trees' scale (× 1.4: the ratio of the rim's 1.35–2.2
   to the interior stands' 0.95–1.7) and the rim's bound (506 m, past the field bushes' 470). Same mesh, no new
   draw. Verdant 780 → 1781 shrubs (102 blocks), Amberford 494 → 1386, Nordhavn 694 → 1562.

**Program keys:** `world-tree-foliage-v17`, `world-tree-impostor-v1`; `world-tree-canopyfar-v16` and
`world-tree-bark-v10` unchanged (the lobe material now draws on the mobile tier and in the receipts only). Textures
per map: + the class tiles the species use (1–3 × 256 KB + mips) + the two impostor atlases (≤ 5.63 MB with mips on
every authored map — `treeImpostors.selftest` walks all 31); `vegetationLighting` counts seven fetches.

**Measurements.** Six maps (Verdant, Amberford, Saltmere Bay, Monsoon Ridge, Nordhavn Fjord, Tarkhan Steppe), one
seed and tier, before = round 77 (aef0d2b85, a `git archive` export) against the round's tree (an rsync snapshot),
served by vite, one browser at a time under the probe mutex at nice 19 (`.qa-dev/r77b-capture.mjs` — round 77's
tool plus the `crown` view: 8 m from a real edge tree of the largest interior stand at 2.2 m, looking at its crown
centre from the concealment discs — `.qa-dev/r77b-crop.mjs`, `.qa-dev/r77b-texture.mjs`, `.qa-dev/r77b-rowluma.mjs`,
`.qa-dev/r77b-bench.mjs` — round 77's bench plus the `detail` layer; outputs under `$SP/r77b/`). Sheets:
`$SP/r77b/review/sheet-{centre-far,forest-edge-far,bird-n,crown}.png` (before | after) and the zoomed crop pairs
`crop*-*.png`. No page error and no console line on any of the twelve boots (the impostor and v17 programs compiled).

*What the eye sees.* The 300–900 m forests are the near trees continued: on Nordhavn the far conifers keep the near
spruces' dark spiky character straight across the 260 / 290 m switch (`crop2-fjord-forest-edge-far.png`; the before
shows the pale blue cone-lobe band beyond it), Verdant's far stands read as individual crowns with the stand shade
between them (`crop2-verdant-centre-far.png`), Monsoon's ridge forest as trees instead of a band. The impostor trees
are THINNER than the fat lobes they replace (the near silhouettes), so more ground shows between them; the tree-pixel
luma per row band across the rim is unchanged (Nordhavn rows 500–530: 129.6 / 126.8 / 122.4 → 131.5 / 129.1 /
126.5; Verdant identical to ±0.4). The crowns at 8 m carry leaf-scale shading and cluster-bitten edges (the crown
sheet; subtle at sheet scale — the high-pass metric below). The rim blocks stand on an understorey like the stands'.

**The crown close-ups (`r77b-texture.mjs` on the 1000 × 600 crown region: the mean |Δ luma| between horizontally adjacent pixels — leaf-scale energy — before → after, the region's mean luma, and the mean |Δ| between the frames).**

| Map (species at the crown) | high-pass before → after | ratio | mean luma before → after | frame Δ |
|---|---|---|---|---|
| verdant (conifer) | 7.64 → 9.05 | 1.185 | 91.6 → 95.2 | 11.6 |
| autumn (autumn broadleaf) | 8.28 → 9.81 | 1.184 | 93.1 → 95.7 | 8.2 |
| coastal (pine) | 6.14 → 7.16 | 1.166 | 130.4 → 127.8 | 8.1 |
| fjord (spruce) | 7.03 → 8.05 | 1.146 | 63.2 → 65.1 | 8.5 |
| steppe (dry broadleaf) | 11.56 → 12.70 | 1.099 | 82.9 → 83.5 | 11.4 |
| monsoon (eucalyptus, in shade) | 8.29 → 8.82 | 1.064 | 32.3 → 32.7 | 6.1 |

**The deterministic vegetation census (instances × geometry per class; before → after). The far tier and the whole (the grass and the shadow proxies excluded); the draw calls are the frame's (comparable only where the grass streams and the hulls stood alike: the −8 / −6 rows are the four / three species' two draws each).**

| Map | view | far trees | far-tier triangles (lobes → impostors) | understorey tris | all vegetation tris | frame draws |
|---|---|---|---|---|---|---|
| verdant | centre-far | 5412 | 956 k → 7 k (−99.2 %) | 31 k → 71 k | 1854 k → 946 k (−49.0 %) | 602 → 594 (−8) |
| verdant | forest-edge-far | 5465 | 963 k → 7 k | 31 k → 71 k | 1814 k → 898 k (−50.5 %) | 397 → 389 (−8) |
| verdant | bird-n | 5425 | 958 k → 7 k | 31 k → 71 k | 1847 k → 936 k (−49.3 %) | 385 → 377 (−8) |
| autumn | centre-far | 4292 | 674 k → 6 k (−99.2 %) | 20 k → 55 k | 1696 k → 890 k (−47.5 %) | (grass differed) |
| coastal | centre-far | 3001 | 550 k → 4 k (−99.3 %) | 17 k → 39 k | 1029 k → 505 k (−50.9 %) | (grass differed) |
| monsoon | centre-far | 7995 | 1325 k → 11 k (−99.2 %) | 42 k → 90 k | 2573 k → 1307 k (−49.2 %) | (grass differed) |
| monsoon | forest-edge-far | 7437 | 1234 k → 10 k | 42 k → 90 k | 3000 k → 1824 k (−39.2 %) | 328 → 320 (−8) |
| fjord | centre-far | 6286 | 1084 k → 8 k (−99.2 %) | 28 k → 62 k | 1362 k → 276 k (−79.7 %) | (grass differed) |
| fjord | forest-edge-far | 5814 | 1005 k → 8 k | 28 k → 62 k | 1605 k → 605 k (−62.3 %) | 405 → 399 (−6) |
| steppe | centre-far | 1115 | 195 k → 1 k (−99.2 %) | 2 k → 13 k | 377 k → 194 k (−48.5 %) | 368 → 361 (−7) |
| steppe | forest-edge-far | 1127 | 197 k → 2 k | 2 k → 13 k | 356 k → 172 k (−51.6 %) | 346 → 340 (−6) |

(The near foliage instance counts are identical before and after on every row — the near tier is unchanged; the
census's trunk split by vertex count put the far birch trunks, with their branch cylinders, on the NEAR side of the
before tree, so on Amberford and Nordhavn the far reduction is larger than the far column shows.)

**The bench (`r77b-bench.mjs`, per-copy GPU ms by repetition: the lower quartile of 50 frames per side, 9 copies, 4 rounds, sides alternated; before = round 77, after = this round; the rounds' spread in brackets is the noise floor; load 68–94 throughout — no quiet window opened in the session, see below).**

| Map | view | near ×9 per copy (before → after: the whorls + this round's detail layer) | far ×9 per copy (lobes → impostors) | detail (in-page toggle, per copy) | ×1 toggle (whole vegetation, after) |
|---|---|---|---|---|---|
| fjord | chase | 6.28 [5.8..6.7] → 6.30 [5.9..6.4] | 2.98 [1.0..3.3] → −0.12 [−0.85..0.0] | +0.60 [−1.18..+0.63] | +1.42 ms GPU [−1.2..6.9], cpu +2.0 |
| fjord | centre-far | −0.02 [−0.6..0.3] → 0.16 [0.0..0.3] | 4.87 [0.75..6.0] → −0.01 [−0.23..0.04] | −0.23 [−0.29..+0.24] | +0.78 [−5.1..1.9], cpu +1.2 |
| autumn | chase | 6.09 [3.8..7.1] → 5.87 [2.8..6.3] | 2.86 [1.05..2.9] → 0.05 [−0.24..0.25] | +0.44 [−0.82..+0.82] | +4.14 [−2.2..4.2], cpu +2.4 |
| autumn | centre-far | 5.03 [0.85..5.2] → 0.87 [−0.25..1.8] | 2.08 [−0.06..3.3] → −0.05 [−0.37..0.24] | +0.53 [−0.43..+1.49] | +1.18 [−0.1..6.0], cpu +1.8 |

*Reading the bench.* The far tier is the round's measurable win: where the lobes cost 2–5 ms per copy at nine
copies, the impostors cost nothing the floor can see (−0.12 to +0.05, i.e. ≈ 0.02–0.03 ms per copy of quads); at
×1 the far tier went from ~0.2–0.6 ms to nothing. The near tier reads the same before and after at chase (6.28 →
6.30 on Nordhavn, 6.09 → 5.87 on Amberford, inside the ±0.5 floor): the detail layer's one fetch and tangent frame
per near fragment costs ≈ 0 ± 0.3 ms per copy by this comparison; the in-page normal-map toggle (medians +0.4–0.6
at chase, rounds −1.2..+0.8 alternating with the run order, i.e. the machine's drift) cannot resolve it either way
below ±1 ms. The ×1 whole-vegetation toggle is unreadable at this load (±5 ms), as in round 77.

*The whorls (round 77's open question).* No quiet window: the load stayed at 61–94 for the round's three hours
(`uptime` polled between every step). Loaded, the whole near tier at chase is 6.3 ms per copy on Nordhavn and
5.9 on Amberford (both trees). The whorls are 108 triangles per conifer trunk: 650–1744 near trunks at chase on
Nordhavn = 70–190 k triangles per copy, ≤ 0.2 ms per copy at these frames' triangle rate — below the +1 ms trim
threshold on triangle grounds; round 77's +0.5–1.4 ms per copy read was inside its own ±1–2 ms spread. No trim.
A quiet-window re-bench (`bench-chain.sh` with the tag `quiet`) is the one measurement this round leaves undone.

**Receipts.** `treeImpostors.selftest` (new: the layout law and the budget on 31 maps, the variants under the row
cap, the row measure, the impostor pools on Verdant / Nordhavn / Delta — two draws per species, quads, aImpRow at the
species capacity, no lobe pool, the shadow proxies kept — the bake from the first update with the render state
restored and again after a suspension, every far slot carrying its tree's variant through the partition's moves,
the bake inputs digested and pinned per map (verdant b492485b, fjord 61cc2fc6, delta b4411f2b — the geometry bytes
and the real leaf atlases' pixels), the lobes without a renderer and on mobile); `leafDetail.selftest` (new: the
four tiles pinned by digest, unit unbiased normals, wrapped tiles, the mask's mean at one half, the mean-neutral
law, the class resolution over 31 maps against the palettes species actually read, the lazy library);
`vegetationProgramKey` (v17; the round's GLSL: the shared detail sample, the laws, the frame rebuilt after
`useAttributeNormal`, three's chunk compiled out; the impostor program's billboard before the wind block, the
mirror, the two-azimuth dissolve, the mip give-back before the alpha test, the baked normal frame, the far
translucency and matte wrap; the eviction counts + 1 material, + 3 tiles, + 2 atlases, + 1 CSM registration);
`vegetationResources` (the tiles as the species' normal maps, the live retained collections);
`vegetationLighting` (seven fetches, the tile sampled once); `understorey` (the rim annuli: Verdant 902 stand-law /
879 rim-law shrubs, Amberford 534 / 852, Nordhavn 877 / 685; mobile none; deterministic); `treePoolCapacity` and
`autumnLeafSprays` (fixture identifiers for the lobe path); green with no change: vegetationFarSeams,
tidalMangrove, authoredTreePlacement, birchCrownForm, bushOverlappingSprays, shrubGrowthPlacement,
treeTrunkQuality, foliageAtlasPadding, broadleafBranchlets, treeClimate, vegetationClearance, grassChunkWork,
grassCarpetWork, groundCoverClearance, loggingYardGrass, treeSpecies, treeGrounding, farTreeBase; `npm run
typecheck`.

**What still looks weak.**
- The horizon ring's forest beyond 512 m is now the odd tier: on the conifer maps its pale cone lobes stand over
  the dark, spiky impostor rim (`crop3-fjord-seam.png`; Verdant's join stays soft, `crop3-verdant-seam.png`). Round
  72c matched the ring to the lobes; the ring is off limits to this round. The fix is the ring's: bake its forest
  from the same impostor atlas (one more consumer of `treeImpostors.ts`), or tone its sprites to the near trees.
- The impostor is a cylindrical billboard from one 10° capture ring: a steep bird view sees the side view laid
  flat. A second, elevated ring (45°) blended by the view's elevation doubles the atlas (the budget allows 96 px
  rows for ≤ 3 species only).
- The LOD switch is still round 77's time dissolve (0.35 s in the 260 / 290 m band), not the 40–60 m distance
  cross-fade the brief named: with the impostor matched to the near tree the switch is invisible in every frame of
  the round, so the partition machinery (and `treePoolCapacity`'s parity contract) was left alone.
- The leaf-scale relief is deliberately mild (normalScale 0.75, the needle and leaflet tiles' Sobel at 1.3–1.4 so
  steep edge normals stay under 5 % of a tile): +6–19 % high-pass energy at 8 m. More relief speckles at 5 m.
- The far birch (bare twig) impostors carry the twig cards' darkness at range where round 9 had lifted the far birch
  lobes on purpose; on Nordhavn they read as pale thin trees between the spruces in the round's frames, but the
  winter and whiteout stands were not captured.
- The bake runs on the first frame that needs the tier (two render passes of 8 × rows tree copies, a few ms once)
  and after every GPU suspension; it is not part of the covered activation warm.
- The quiet-window bench.

### Round 77c — 2026-09-26: the seam with the ring forest, the covered bake, the elevated ring, the drives

**Why.** Round 77b's own weak list: the horizon ring's forest beyond 512 m was the odd tier — round 72's pale, soft
cone-lobe trees standing over the dark, spiky impostor rim on every conifer map (`$SP/r77c/crop3-fjord-seam.png`);
the impostor was a single 10° capture ring, so a steep bird view saw the side view laid flat; the LOD switch was still
the 0.35 s time dissolve, not the distance cross-fade the 77b brief named; the winter and whiteout stands were never
captured; the bake ran on the first frame that needed the tier, outside the covered warm.

**The rule of the round.** The ring's GEOMETRY and its relief stay round 72's; its forest PLACEMENTS stay byte-identical
(`buildHorizonForest` scatters them exactly as before and packs them on its group — the new receipt compares the bytes
before and after the binding); every vegetation placement, trunk record and cover disc stays byte-identical (the
placement receipts); the round-8 leaf atlases are untouched; nothing in the terrain, the ground modules, the props kits,
the sky or `src/sim`; no map-config edit. The mobile tier and the receipts (no renderer) keep the ring's lobes and the
far lobes exactly as round 77b left them.

**Mechanisms.**

1. *The seam — the ring forest drawn from the impostor atlas* (`src/world/horizonForestImpostors.ts`, bound by
   `map.ts` after the vegetation builds). Where a world bakes an impostor atlas (desktop, a renderer), every ring
   placement is redrawn as one camera-facing quad on that atlas: the species by CLASS from the map's rim mix — a
   conifer placement draws the rim's conifers in their mix proportions, a broadleaf placement its broadleaves (the
   pick from a hash of the placement's position: the ring thins its candidates by their smallest keys, so the packed
   key is not uniform over the kept trees and the last species of a mix would never be drawn from it) — the near
   variant from the placement's tone, the mirror from the ring's own variant flag, the row per instance (`aImpRow`)
   and the cell per pool (`aImpCell`) exactly as the far tier's quads carry them. The stature is the rim's:
   `vegetation._rimTreeHeightM` (the mean of instance height scale × the near geometry's height over the rim blocks
   and saddle trees) over the ring's mean lobe height gives one ratio (Nordhavn 13.6 m / 8.5 m = 1.59, Verdant 12.1 /
   7.8 = 1.55) that scales every ring tree while the ring's own size spread is kept, so the forest does not shrink at
   the red line. The material samples the far tier's albedo and normal atlases through the SAME program text
   (`treeImpostors.ts` `applyProgram` — the billboard, the azimuth dissolve, the mip coverage, the baked normal in
   the capture frame), lights through the far tier's law (the 0.38 matte wrap, the 18 % translucency, the 0.80 sky
   fill — `vegetationFarSeams` now pins those three constants on both sides of the seam) and keeps the ring's own
   aerial haze by radius and height (round 72's law, after the mip give-back and before the alpha test). The near
   class's lobe hulls stay as shadow-only casters at the impostors' stature (round 72's shadows on the rim slopes,
   the shadow pass unchanged in draws and triangles); the band and range lobe pools and the lobe material are
   disposed. Key `horizon-forest-impostor-v1`; two colour draws per rim species (Nordhavn 6 → 6, Saltmere 8 → 6,
   Verdant 8 → 8, Amberford 4 → 8), the ring's colour triangles −97 to −98 % (Nordhavn 469 k → 11 k, Saltmere
   580 k → 16 k, Verdant 734 k → 16 k, Amberford 897 k → 16 k, Whiteout 117 k → 2 k; Winter has no ring forest).
   The other approach the brief named — tone the impostor rim toward the ring by distance — was not built: it can
   match the luma term by construction and nothing else (the seam metric below reads coverage and chroma beside the
   luma; the lobes' silhouettes, density and species stay a different forest), and it would have moved the seam
   inward to the 260 / 290 m switch, where the near cards are dark.
2. *The bake in the covered warm.* `world.warmImpostors()` (map.ts → vegetation.ts → `ensureBaked`) runs behind the
   veil from the solo loading runtime right after the battlefield's texture uploads (`__BATTLE_LOAD.impostorBake`:
   baked, ms) and from the activation runtime's precompile path after the world's programs compile; the lazy bake in
   `update()` stays as the fallback and the re-bake after a GPU suspension. The library reports `bakeMs`.
3. *The elevated capture ring* (`treeImpostors.ts`). One 45° row per species (its first near variant) from the same
   eight azimuths, appended after the ground rows where that keeps the row cap and the tile the ground ring alone
   takes — every 3-species map (12 rows at 96 px, 5.63 MB); the 4-species maps (Verdant, Amberford, Winter, Delta,
   Monsoon, Badlands, Frontier) keep their single ring (16 rows would drop the ground ring to 64 px: the ground
   views' resolution is never traded for the bird views'). The program takes the view elevation from the tree base,
   dissolves the tile toward the elevated row over 20°–45° and tilts the card back to face the view by the same
   weight (its base stays on the ground; the elevated row's own cell and base height blend in), lights the elevated
   normal in its own 45° frame, and fetches the elevated tiles only where the weight is positive. The bake renders two
   scenes per pass, each seen by its own tilted camera over its rows. `aImpCell` is a vec4 (the elevated row or −1).
   Key `world-tree-impostor-v2`; the ring's quads take the same rows.
4. *Winter and Whiteout captured* (`$SP/r77c/review/crop-farband-winter-zoom-a2.png`, `crop-farband-whiteout-zoom-a3.png`,
   ×6 of the 300–500 m band). The far bare-birch impostors do NOT read too dark against the snow: the winter palette
   already lifts the twig cards themselves (round r3/r4's hoar-frost `texTone`, `cardL0` 0.46, the branch-riding snow
   lobes merged into the trunk part the bake renders), so the far birches stand as pale frosted stems between the
   snow-laden spruces on both maps — no lift was added and round 9's far-lobe lift stays where it was (the lobe tier
   the receipts and the mobile tier draw). Whiteout's polar ring band was the odd tier there too: round 72's
   lobes stood as summer-green cones over the snow beyond the frosted rim; bound to the atlas they are the same
   frosted spruces. Winter authors no ring forest (its horizon has no treeline), so nothing changes beyond its rim.
5. *The drives (the LOD switch).* Three captured drives (`.qa-dev/r77c-drive.mjs`) measure the 260 / 290 m switch
   instead of replacing it: the camera parks 8 m up with a stand's near edge ~235 m away, backs off 60 m in 2 m steps
   (the stand's trees cross 290 m: near → far) and returns (they re-cross 260 m), and after EVERY step holds still for
   three more frames ~150 ms apart with the wind clock pinned, so the only change between held frames is the
   transition itself. Two modes on the same path: `dissolve` (the live 0.35 s time dissolve) and `snap`
   (`world.update(0)` after every pose — the shot-mode snap that completes the switch in one frame: the hard pop the
   dissolve exists to hide). The metric: the mean |Δ luma| over the tree-coloured pixels of a 1400 × 520 clip between
   the held frames (the switch settling), and between the last held frame and the first frame after a move (motion
   plus the switch), at the crossing steps (the far / near pool counts change) against the quiet steps. The table is
   under Measurements; the verdict: on Nordhavn the held-frame change at the crossing steps is 1.5 (out) / 3.4 (in)
   luma with the dissolve and 4.0 / 1.0 with the hard snap, against a quiet-step baseline of 0.6–1.6; the move
   frames show no switch signal above the 2 m motion baseline in either mode (23.1 vs 23.6). With the impostor baked
   from the tree's own cards, even the hard switch moves a few percent of the tree pixels by more than 12 luma (the
   temporal AA reconverging), and the dissolve halves that. A 40–60 m distance cross-fade would hold every band tree
   in both pools (the partition counts the receipts pin) to hide a switch that is already under the frame-to-frame
   noise of a 2 m step; it is not built. Saltmere's numbers carry the bay: its animated water is inside the tree
   mask (sea-green), so its quiet baseline is 6–8 and its moved share 20–30 % in both modes.

**Program keys:** `world-tree-impostor-v2`, `horizon-forest-impostor-v1`; foliage v17, canopyfar v16, bark v10
unchanged. Textures per map: the two impostor atlases unchanged in size (5.63 MB on every 3-species map now, the
elevated rows inside the same budget; the 4-species maps as in 77b); the ring forest adds no texture.

**Measurements.** Six maps (Nordhavn Fjord, Saltmere Bay, Verdant, Amberford, Winter, Whiteout), one seed and tier,
before = a9ec70634 (an rsync snapshot, `$SP/r77c-base`) against the round's tree (`$SP/r77c-snap-c`), served by vite,
one browser at a time under the probe mutex at nice 19 (the perf-audit lane held it for most of the round — the
round's jobs ran as one chain at 17:01–17:30 at load 25–45). Tools: `.qa-dev/r77b-capture.mjs` (77b's, the census),
`.qa-dev/r77c-seamcap.mjs` + `r77c-seam2.mjs` (the seam pairs: a frame and the same frame with the far tier's pools and
the ring forest's colour meshes hidden — the pixels that differ are the far and ring trees, so the per-band luma is
the trees' and not the meadow's; the first tool, `r77c-seam.mjs`, read every green pixel and counted the ring's
sunlit turf and missed the hazed teal spruces — its numbers were the same before and after and are not used),
`.qa-dev/r77c-firstframe.mjs` (the bake's frame), `.qa-dev/r77c-drive.mjs` (the drives), `.qa-dev/r77c-ring-census.mjs`
(the ring's deterministic census), the 77b crop / sheet tools. Sheets: `$SP/r77c/review/sheet-{centre-far,forest-edge-far,bird-n}-a3.png`
(before | after; Winter's after is its a2 frame — no ring forest, no elevated ring, nothing changed there), the ×4
seam crops `crop-seam-<map>-a3.png`, the ×3 bird crops `crop-bird2-{fjord,coastal}-a3.png`, the far-band crops
above. No page error and no console line on any boot.

*What the eye sees.* Nordhavn (`crop-seam-fjord-a3.png`): the pale, soft cone-lobe band over the dark spiky rim is
gone — the slope beyond the red line is the same dark spiky spruce forest as the rim, denser and taller than the
lobes were (the rim's stature), hazing into the range. Saltmere: the ring's pines and cedars are the rim's trees on
the far ridge, bluer with distance. Verdant: the ring's crowns are the rim's oaks, poplars and willows — big soft
crowns going blue-white into the haze; they read as the same forest continued, and as the round's palest tier (the
haze law and the scene fog at 600–1000 m, not the tone: the ring's quads carry the rim's mean tint). Whiteout: the
polar ring band's summer-green lobes are frosted spruces now. The bird view (`crop-bird2-fjord-a3.png`, ~40° over
the far tier): the before's thin side-view cut-outs carry a visible crown top and flank now (the 45° row); the
change is real and modest at this scale.

*The first frame (Verdant, `.qa-dev/r77c-firstframe.mjs`: the renderer's `setRenderTarget` wrapped on the live page, an rAF timeline with the game phase, two runs per side).*

| Side | run | the bake | phase | before the first presented battle frame | bake ms | the frame it fell in (rAF dt) | first 12 presented battle frames (max / mean dt) |
|---|---|---|---|---|---|---|---|
| before (a9ec70634) | 0 | 336 ms after the first battle frame | battle | no | 5.8 | 33.7 ms | 55.8 / 30.4 |
| before | 1 | 363 ms after | battle | no | 5.3 | 34.3 ms | 46.5 / 25.4 |
| after | 0 | 755 ms before (the loading phase, `__BATTLE_LOAD.impostorBake` 30 ms) | garage (loading) | yes | 29.6 | covered | 252.8 / 46.9 (a 252 ms longtask 1 s after the reveal, unrelated: the deferred warm) |
| after | 1 | 746 ms before | garage (loading) | yes | 29.3 | covered | 46.7 / 28.1 |

The bake costs 5–6 ms when it lands in a warm presented frame and ~30 ms behind the veil (the bake materials' first
compile and the atlas allocation are in that number now; nothing of it reaches a presented frame).

*The ring forest's deterministic census (`.qa-dev/r77c-ring-census.mjs`; instances × triangles; before = the lobe pools, after = the bound quads; the shadow pass keeps the near class's hulls).*

| Map | ring trees | colour draws lobes → quads | colour triangles lobes → quads | shadow-pass draws → | shadow-pass triangles → | atlas |
|---|---|---|---|---|---|---|
| fjord | 5340 | 6 → 6 | 469 k → 11 k (−97.7 %) | 4 → 4 | 275 k → 275 k | 768 × 1152, 96 px, 12 rows (+ the elevated ring), 5.63 MB |
| coastal | 8000 | 8 → 6 | 580 k → 16 k (−97.2 %) | 4 → 4 | 280 k → 280 k | 768 × 1152, 96 px, 12 rows (+ elevated), 5.63 MB |
| verdant | 8000 | 8 → 8 | 734 k → 16 k (−97.8 %) | 4 → 4 | 266 k → 266 k | 768 × 1152, 96 px, 12 rows, 5.63 MB |
| autumn | 8000 | 4 → 8 | 897 k → 16 k (−98.2 %) | 2 → 2 | 245 k → 245 k | 768 × 1152, 96 px, 12 rows, 5.63 MB |
| whiteout | 1200 | 6 → 6 | 117 k → 2 k (−97.9 %) | 4 → 4 | 68 k → 68 k | 768 × 1152, 96 px, 12 rows (+ elevated), 5.63 MB |
| winter | — | no ring forest (no treeline) | | | | 768 × 1152, 96 px, 12 rows, 5.63 MB |

The vegetation's own census is unchanged on every row of every map (the far impostor counts and the vegetation
triangles are identical before and after; the frame-level draw calls move by −103 to +104 with the grass streams
and the hulls, as in rounds 77 and 77b). Textures: no atlas grew (the elevated rows fit inside the 3-species maps'
existing 12-row, 96 px budget); the ring forest adds no texture.

*The drives (`.qa-dev/r77c-drive.mjs`, tag a3; mean |Δ luma| over the tree-coloured pixels of the clip; "hold" = between the three held frames after a step with the camera still, "move" = across the 2 m step; "quiet" = steps where no tree changed tier, "crossing" = steps where some did).*

| Map (stand) | mode | leg | steps (crossing) | trees crossed | move Δ quiet / crossing | hold Δ quiet / crossing (median) | hold Δ max quiet / crossing | pixels moved > 12 luma, max quiet / crossing |
|---|---|---|---|---|---|---|---|---|
| fjord (r 37 m, the near edge 272 → 332 m) | dissolve | out | 31 (5) | 46 | 23.6 / 23.1 | 1.6 / 1.5 | 4.8 / 1.6 | 7.2 % / 1.8 % |
| fjord | dissolve | in | 31 (5) | 46 | 23.2 / 23.7 | 1.3 / 3.4 | 4.3 / 3.9 | 3.6 % / 3.0 % |
| fjord | snap | out | 31 (5) | 46 | 11.2 / 11.6 | 0.9 / 4.0 | 9.3 / 7.5 | 9.6 % / 6.6 % |
| fjord | snap | in | 31 (5) | 46 | 10.6 / 12.4 | 0.6 / 1.0 | 2.1 / 2.9 | 1.9 % / 2.6 % |
| verdant (r 42 m, 277 → 337 m) | dissolve | out | 31 (6) | 32 | 31.0 / 31.1 | 3.3 / 2.7 | 6.7 / 5.6 | 10.8 % / 5.1 % |
| verdant | dissolve | in | 31 (5) | 35 | 31.1 / 30.4 | 2.6 / 2.7 | 3.7 / 3.4 | 5.0 % / 3.2 % |
| verdant | snap | out | 31 (5) | 31 | 31.0 / 31.0 | 1.7 / 1.7 | 6.7 / 2.4 | 5.7 % / 2.4 % |
| verdant | snap | in | 31 (5) | 35 | 31.0 / 30.3 | 1.3 / 1.5 | 2.9 / 2.5 | 2.3 % / 1.8 % |
| coastal (r 39 m, 274 → 334 m; the bay's water in the mask) | dissolve | out | 31 (10) | 75 | 51.0 / 53.0 | 8.0 / 11.5 | 20.8 / 16.8 | 21 % / 19 % |
| coastal | dissolve | in | 31 (5) | 57 | 51.7 / 38.2 | 7.1 / 2.6 | 23.6 / 8.1 | 31 % / 7 % |
| coastal | snap | out | 31 (5) | 57 | 49.8 / 53.2 | 5.9 / 11.5 | 25.6 / 25.0 | 27 % / 23 % |
| coastal | snap | in | 31 (5) | 57 | 51.0 / 34.7 | 6.9 / 4.6 | 20.4 / 11.5 | 19 % / 5 % |

Reading: on Nordhavn and Verdant the crossing steps are inside the quiet steps' spread in both modes — the held
frames change by 1–4 luma over the tree pixels whether trees switch tier or not, and the move frames carry no switch
signal over the 2 m motion baseline (Verdant: 31.0 against 31.1). The one row where the crossing steps stand out is
Nordhavn's hard snap on the way out (a hold of 4.0 against 0.9 quiet, 6.6 % of the tree pixels moving over 12 luma:
the pop's temporal-AA reconvergence), and the dissolve on the same path reads 1.5 against 1.6 — the dissolve does
what it was built for, and even the pop it hides is a few percent of the tree pixels. Saltmere's water is inside
the green mask (a quiet baseline of 6–8 and 20–30 % moved pixels in every row) and says nothing either way.

*The seam (render-mask metric, centre-far, x 300–1300, rows 440–600 in 10 px bands, the tree pixels from the masked pair; near → far the luma must not step or reverse by more than 4).*

| Map | rows (near → far) | before: tree luma per band | after: tree luma per band | the ring / rim step (the band where the ring begins → the rim band under it) | the rim's own largest step (unchanged rows) |
|---|---|---|---|---|---|
| fjord | 590 → 460 | 62, 62, 57, 59, 67, 81, 95, 100, 110, 115, 121, 131, 130, 142 | 62, 62, 57, 59, 66, 75, 85, 88, 95, 98, 101, 106, 106, 106 | 540–550 → 530–540: 80.9 → 95.0 (+14.1) before, 75.4 → 84.7 (+9.3) after; the ring rows 106 against the lobes' 130–142 | 550–560 → 540–550: +14.2 before, +9.8 after |
| verdant | 590 → 480 | 60, 66, 64, 72, 76, 82, 92, 115, 132, 142, 144, 138 | 54, 65, 64, 72, 76, 82, 91, 108, 123, 133, 146, 155 | 530–540 → 520–530: 91.9 → 114.5 (+22.6) before, 90.7 → 107.7 (+17.0) after | 540–550 → 530–540: +10.4 before, +9.2 after |
| coastal | 590 → 490 | 84, 80, 73, 70, 80, 86, 96, 111, 130, 143, 172 | 64, 64, 65, 69, 80, 86, 93, 111, 130, 128, 133 | 520–530 → 510–520: 111 → 130 (+18.2) before, 111 → 130 (+18.7) after; the rows beyond it 143–172 → 128–133 | 530–540 → 520–530: +15.1 before, +17.9 after |

Reading: a 10 px band at these rows spans 50–100 m of ground, and the aerial perspective alone brightens the
UNCHANGED rim tier by 5–15 per band there (the rim's own largest step, right-hand column), so a ±4 monotonic
criterion is not met by any tier at this resolution — before or after, ring or rim. What moved is the seam
itself: on Nordhavn the step where the ring's trees begin fell from +14.1 to +9.3 and is now smaller than the rim's
own step one band nearer (+9.8 — the ring is no brighter relative to the rim than the rim is to itself), and the
ring rows sit at 106 against the lobes' 130–142; on Verdant the seam step fell from +22.6 to +17.0 (the ring's
crowns are the rim's tint, but its band climbs, and round 72's height haze — a crown on a range face past 560 m
takes the face's fog — brightens them on purpose; the terrain under them takes the same fog); on Saltmere the step
stayed at +18 (its ring is the far shore of the bay, 800 m out and hazed; the rows beyond the seam fell from 143–172
to 128–133). No band reverses by more than 4.8 on any map after (before: Saltmere 7.5).

**Receipts.** `horizonForestImpostors.selftest` (new, registered: on Nordhavn, Verdant and Saltmere — the packed
placements byte-identical after binding, one quad per placement with the species by class from the rim mix in its
proportions (±5 %), the variant from the tone, the mirror from the ring's variant, the stature scale and the ring's
mean tree height equal to the rim's (±2 %), the near pools as shadow-only casters on their placements, the band and
range pools gone, the lobe material released and disposed, the material on the far tier's albedo with the far
tier's normal atlas and row uniforms, the same billboard / sample / normal text as the far tier's program, the
matte wrap and translucency, the ring's haze law between the mip give-back and the alpha test, no wind uniforms,
idempotent, a ring without packed placements left alone); `vegetationFarSeams` (extended: the far canopy hook's wrap
and translucency and the far material's sky fill equal the ring constants — one law across the seam);
`treeImpostors` (re-pinned: the elevated ring's law on 31 maps — every 3-species map, never a 4-species map, the
ground tile kept; the rows' elevations; the vec4 cell; two scenes per pass with their frusta; the digests verdant
33ca4146, fjord a9c982e2, delta a43cefd0 — the layout text carries the elevation); `vegetationProgramKey` (the v2
key, the elevation blend, the tilt, the elevated fetches and normal frame, the 13-species world without the ring);
`soloBattleLoadingRuntime` and `worldActivationRuntime` (green with the warm call); `horizonResources`,
`vegetationResources`, `treePoolCapacity`, `understorey` green; `npm run typecheck`.

**What still looks weak.**
- The ring's forest is now dense and tall where round 72's placements were scaled for 6–8 m lobe trees: at the rim's
  stature (× 1.55–1.6) the band on Nordhavn reads as a thick dark wall of spruces from centre-far (right beside the
  rim it is exactly what the rim is; further up the slopes the stands are denser than the rim's clumped blocks). The
  placements are round 72's and byte-identical by the round's rule; thinning the band by a share tied to the stature
  ratio (fewer, taller trees over the same area) is the next lever, in the ring's builder.
- The seam metric's ±4 per band is not a criterion any tier meets near the horizon (the haze gradient alone is
  5–15 per 10 px band there); the honest measure is the seam step against the rim's own — met on Nordhavn, not on
  Verdant (+17 against +9, round 72's height haze on the climbing band) or Saltmere (+18 against +18 on the far shore).
- The 4-species maps (Verdant, Amberford, Winter, Delta, Monsoon, Badlands, Frontier) keep the single 10° ring: a
  steep bird view there still sees the side view laid flat. The brief's fallback — a dissolve to the lobe tier above
  35° — was not built: it would keep every far tree in the lobe pools beside the quads (the triangles and the four
  draws per species round 77b removed, back on every frame) or add a third partition for the bird views alone.
- The elevated ring is one 45° row per species from its first near variant only: the other two variants' trees
  dissolve toward that silhouette from above (they keep their own below 20°).
- The bake's 30 ms behind the veil is the whole cost of the atlas now; the receipts still cannot render it (no GPU),
  so the tiles' content is proven by the captures and the digest only.
- The drives measure at 1600 × 900 with 2 m steps; a 4K monitor and a slower drive would resolve the pop's few
  percent of pixels better than this machine's headless runs at load 25–120.
### Round 78 — 2026-09-26: performance — the audit's cost recovered knob by knob

**Why.** The cumulative audit of rounds 71–77 (deploy 95 → 105, `$SP/perf/`, the memory note
`claude-of-tanks-perf-audit-r71-77-20260926`) found the desktop tier inside its documented budget but carrying about
+1.0 ms of main-thread time per frame on every map (draw calls +15…+36 at the chase view: the volumetric layer's
shadow gobos +16–17 on the cumulus maps, the shadow passes +9…+23 from new casters, programs +11…+16), a real +2.6 ms
GPU at Whiteout's centre-far view (verified in a GPU-quiet window: the 300 m stratus deck marched over the polar
range), the forest maps over the triangle ratchet (verdant 7.8 M, fjord 10.15 M against the 7 M gate), and the mobile
tier's Whiteout +11 draws / +2.9 MB / +1–2 ms. Owner's rule: "make sure performance is still rlly good". This round
recovers the cost with knob-sized, receipted changes that do not change how the maps read.

**Method.** The audit's probe (`.qa-dev/perf-audit-probe.mjs`: one headless browser, one private vite server per
tree, the desktop preset pinned to High through localStorage, bots frozen, the render governor pinned, 300 frames per
pose, GPU by `EXT_disjoint_timer_query_webgl2` p25, draw calls and triangles from `renderer.info`) run as ABBA pairs
of the branch base 1d0236f33 (deploy 106) against an rsync snapshot of this tree (`$SP/r78/snap-*`), two repeats
(four pairs) per map, under the shared probe mutex (`$SP/r78/run.sh`: no claim while `/tmp/cot-shots.queue` holds a
live ticket, 90 s gaps). Draw calls and triangles are exact; GPU and CPU medians carry the machine's noise floor (the
p25 spread of the label's records), and every record stamps the 1-minute load and the foreign headless-GPU CPU share
before and after it — a pair is "GPU-quiet" only under load < 40 with foreign GPU processes under 100 %.

**1. The cloud shadow gobos render into their own cascade only (`src/engine/renderLayers.ts`
`setShadowCasterCascades`, `src/engine/volumetricClouds.ts`).** Three rasterises every shadow caster into every
cascade's map, so the layer's four gobo planes — one sized to each cascade's shadow box, `frustumCulled` off — cost
sixteen field-shader draws a frame on the cumulus maps (the audit's "+16–17 draws from the cloud layer"; the
round-68 / 71 / 76 open item "the cascade policy for the gobos"). The shadow router gains a per-cascade caster mask:
it already renders the CSM lights one at a time under the near-vehicle cascade policy, and now does so whenever a mask
is registered too, hiding the masked casters around every other cascade's pass and restoring them before the forward
render (allocation-free — the list is rebuilt on registration only — weakly held, exceptions restore, a single light
is never split). The layer registers gobo i on cascade i and forgets the mask on detach. Cloud shadows still read on
the ground at the chase and centre-far views (the before / after shots in `$SP/r78/g1/`).

| Map (chase / centre-far) | draws base → after | GPU p25 base → after (noise) | CPU frame med base → after | pairs |
|---|---|---|---|---|
| desert | 639 → 627 (−12) / 509 → 497 (−12) | 24.3 → 25.3 (±0.4 / ±1.8) / 20.2 → 20.7 (±0.6 / ±1.3) | 4.9 → 4.8 / 4.2 → 4.0 | 4, load 6–10, foreign GPU 24–60 % |
| monsoon | 808 → 797 (−11) / 485 → 476 (−9) | 18.5 → 18.8 (±1.3 / ±1.3) / 18.6 → 18.3 (±0.4 / ±0.5) | 6.4 → 6.9 / 5.5 → 5.7 | 4, load 6–23, one pair under foreign GPU 400–1060 % |
| steppe | 701 → 690 (−11) / 434 → 421 (−13) | 19.4 → 19.0 (±0.4 / ±0.3) / 21.8 → 22.0 (±1.6 / ±1.3) | 5.1 → 5.4 / 5.6 → 5.2 | 4, load 6–10 |
| verdant | 762 → 750 (−12) / 588 → 576 (−12) | 23.4 → 23.3 (±4.1 / ±2.6) / 22.0 → 21.5 (±0.4 / ±1.3) | 6.0 → 6.4 / 5.0 → 5.0 | 4, load 7–15, one pair under foreign GPU 660–1035 % |
| whiteout (a deck: no gobos) | 679 → 679 / 419 → 419 | 25.4 → 24.9 / 23.1 → 24.1 (±0.7–1.6) | 6.7 → 6.5 / 5.5 → 5.5 | 4, foreign GPU 400–1300 % throughout |

The draw-call recovery is exact (16 → 4 gobo draws; monsoon's centre-far −9 and steppe's −13 are the far cascade's
half-rate refresh landing on different frames); the GPU timer cannot resolve the gobo fragment work at these floors,
and the CPU frame medians move within ±0.5 ms both ways (the machine's, not the change's — the update / render
split is identical).

**3. The shadow-caster trim (`renderLayers.ts` `routeZeroCountDraws` and `SHADOW_CASTER_LAST_CASCADE`,
`vegetation.ts`, `horizonVista.ts`).** A shadow census (`.qa-dev/r78-shadow-census.mjs`: every `renderBufferDirect`
call billed to its cascade by the shadow camera, at the chase pose) found the shadow passes at 65 % of a frame's
submissions on Monsoon Ridge (814 a frame against 445 forward) and two habits worth breaking. (a) An r8 cascade
caster proxy — and every proxied owner outside its own cascade — sits out a pass by setting its instance count to
zero in `onBeforeShadow`; three still runs the whole program / uniform / binding-state setup in `renderBufferDirect`
before `renderInstances` returns on `primcount 0`, and the draw-call counter never sees it. The router now returns
before that setup (installed with the shadow-only router at renderer creation; the deployment shadow warm's
own-property observer restores over it). (b) Casters drawn into cascades whose texels cannot carry them: the bushes
(1.5–2.5 m) cast into the three near cascades only (to 320 m on the High preset, where a bush is six pixels
tall), the understorey (young growth under 1.6 m, pure dressing) into the two nearest (to 184 m), and the horizon
ring's near forest — 440 m and more from the battlefield, where only the far map reaches, yet drawn (`frustumCulled`
off) into every cascade and compacted into every near proxy — into the last cascade only, through a mask flag the
router resolves against the light set at render time (three cascades on the phones, four on the desktop). The field
trees, the tanks, the structures and the props are unchanged.

**2. The low stratus decks march under the deck laws (`volumetricClouds.ts` `CLOUD_LOW_DECK_BASE_M`,
`cloudDeckMarch`).** Round 76 ended a cellular deck's slab march at 10 km, where the far band and the haze ramp own
the horizon; a stratus deck with no cells — Whiteout's 300 m low-stratus ceiling — still marched its grazing rays for
the full twenty kilometres and took the thin slab's shorter far strides. `cloudDeckMarch(preset)` is 1 for a cellular
deck (every round-76 deck keeps its bytes) and for a stratiform sheet (≥ 0.5) whose base sits under 400 m; the trace
reads it as `uDeckMarch` at the two sites that read `uCells > 0.0` before (the t1 cap, the far stride growth). Among
the shipped maps the law reaches exactly Whiteout (the receipt walks the 31 cloudscapes); every cumuliform regime and
high sheet stays on the full march.

The round-76 deck metrics (`.qa-dev/r76-deck-metrics.mjs` on the history masks of `.qa-dev/r71-capture.mjs`,
sky-w / sky-s, before = 1d0236f33, after = this tree; the sheets `$SP/r78/review/deck-sheet-sky-w.png` and
`deck-sheet-sky-s.png`):

| Map | p80 / p20 before → after | mottle before → after | deck median (display) before → after |
|---|---|---|---|
| whiteout | 1.06 / 1.04 → 1.06 / 1.04 | 0.042 / 0.030 → 0.042 / 0.030 | 186.4 / 189.9 → 186.4 / 189.9 |
| winter | 1.17 / 1.17 → 1.17 / 1.17 | 0.054 / 0.049 → 0.054 / 0.050 | 150.7 / 153.3 → 150.7 / 153.3 |
| foundry | 1.30 / 1.14 → 1.30 / 1.14 | 0.050 / 0.037 → 0.050 / 0.037 | 140.1 / 151.1 → 140.1 / 151.1 |
| railyard | 1.18 / 1.14 → 1.18 / 1.14 | 0.042 / 0.037 → 0.042 / 0.036 | 157.2 / 165.8 → 157.2 / 165.9 |
| polders | 1.18 / 1.19 → 1.18 / 1.19 | 0.035 / 0.031 → 0.034 / 0.031 | 173.2 / 185.4 → 173.3 / 185.5 |

Identical to the rounding on every deck (the cellular decks by construction — their bytes did not change; whiteout
because the capped march lies beyond the far band's 8–11 km, where the sky views see the haze ramp and the band).

**5. The mobile tier paints no steel atlas (`src/world/props.ts`).** The audit read Whiteout on the mobile tier at
+11 draws, +2.9 MB of textures and +5 programs against deploy 95; this round's mobile ABBA (deploy 95 vs deploy 106,
four pairs) put its GPU inside the ±1 ms floor at both views with the exact parts: +12 / +8 draws (the round-75
`steel` and `structureMetal` bucket meshes in the forward pass and every cascade), +2.9 MB, +5 programs, +50 k
triangles (the polar ring's 36-row ladder +16 k, the props +3 k, the conifer whorls +5 k). Round 75's follow-up let
the phones paint the container / tank atlas at half size; they now paint none — the `steel` material carries the
livery in the vertex colours alone, the path the six maps without steel already take — and the on-demand painter
returns on the phones too (the record says `fallback: 'mobile'`). The bucket meshes stay: a fold into the baked
bucket is not knob-sized (the buckets carry different attribute sets), and the ring ladder's sixteen thousand
triangles on one draw are under every pair's floor — the knob for them (a `mobileLadder` field on the horizon
block read by the subdivision on the mobile tier) is described here and not built, because nothing measured asks
for it.

**4. The near tier's radius (`vegetation.ts` `TREE_NEAR_IN` / `TREE_NEAR_OUT` 260 / 290 → 200 / 230 m;
`?treeNear=<m>` as the same-build A/B).** The near tier — trunks, cards, whorls, crown shadow proxies — is the
whole triangle budget of a forest map (the audit's attribution: veg-near +5.96 M of Verdant's 7.8 M at chase), and
since round 77b the far tier is the near tree's own bake, so the switch is the same crown at a smaller size. The
same-build A/B (`$SP/r78/t1`, one snapshot served with the query, pattern ABCCBA, load 8–18):

| Map | view | 260 m | 200 m | 160 m | near trees at chase |
|---|---|---|---|---|---|
| verdant | chase | 6.95 M | 6.06 M (−12.8 %) | 5.36 M (−22.9 %) | 1748 → 1068 → 548 |
| verdant | centre-far | 6.58 M | 5.64 M | 4.93 M | |
| fjord | chase | 9.39 M | 8.03 M (−14.5 %) | 7.10 M (−24.4 %) | 356 → 0 → 0 (the stand is inside 200 m) |
| fjord | centre-far | 3.53 M | 3.29 M | 3.29 M | |

Each 100 m of radius is 0.8–1.2 M triangles at the chase pose; draw calls do not move (the pools draw whatever
their count). The eye (`$SP/r78/review/strip-verdant-chase-village3x.png`, `strip-fjord-chase-stand.png`,
`strip-*-chase-mid.png`): at 3 × magnification the trees behind Verdant's village 150–250 m out read identically at
260 and 200 m; at 160 m the crowns just behind the barn are a touch flatter under magnification; Nordhavn's stand
behind the near trunks reads the same at all three. 200 / 230 m is the point (the mobile tier already stood at
200 / 225): Verdant under the 7 M gate at chase, Nordhavn 9.4 → 8.0 M (toward the gate, not under it — its near
stand is the cost, and the next lever there is the whorl tier or a lower card count per crown, both visible). What
moves between 260 and 200 m besides the crowns' triangles: the crown shadow proxies belong to the near pool, so a
lone tree 200–260 m out casts no crown shadow now (a 14-pixel patch at 230 m where the sun lays it toward the camera;
none of the round's frames shows the difference — the stands are in their own shade).

**Tooling.** `.qa-dev/r78-shadow-census.mjs` (the per-object, per-cascade shadow census with the zero-count setups
counted, desktop or mobile tier), `.qa-dev/r78-tri-strip.mjs` (the stacked crop strips of the same view across
labels), `.qa-dev/r71-trace-bench.mjs --view=<name>` (the repetition bench at a table view), the audit's probe and
table as copied. `$SP/r78/`: `g1` (items 1 + 2, base vs snap-a), `t1` (item 4's same-build A/B), `m1` (mobile,
deploy 95 vs deploy 106), `deck` + `deck-metrics-*.txt` (item 2's decks), `census/` (the shadow censuses),
`g2` / `c2` (item 2's proof against deploy 95 and the same-build clouds A/B), `trace/` (the trace bench), `g3`
(items 3 + 6, base vs snap-c on six maps), `m2` (item 5, deploy 95 vs snap-d), `g4` (item 4, base vs snap-e),
`review/` (the sheets and strips), the chain scripts, and `run.sh` / `mutex.sh` (the mutex rules).

**Traps met.** A chain waiter written as `zsh -c "while pgrep -f 'chain-1.sh' …"` matches its own command line and
never fires — sequence chains from a file script instead. The shadow census hung four runs for ten minutes each:
a page function that throws inside a `requestAnimationFrame` callback never resolves its promise, `page.evaluate`
waits until puppeteer's protocol timeout, and the error surfaces only as a page error (three's CSM `breaks` are
plain numbers; the tool read them as vectors) — guard a page function's resolve with try / catch and keep the
protocol timeout short. A cold vite optimizer cache does answer a first page's late-discovered dependency with 504
"Outdated Optimize Dep" (the console lines), but the page recovers; the tool keeps one cache per served tree and
primes it anyway. A killed mutex wrapper leaves `probe.lock` behind — remove only your own (the timestamp is the
wrapper's "held" line). An item's hunks sharing a file with another item's are split by
content for their own commits (`git apply --cached` of a filtered patch, the receipt's mixed hunk re-cut from
HEAD, the staged tree exported with `git checkout-index` and its receipts run there).

*Item 2 measured — and what it found.* The trace bench (`.qa-dev/r71-trace-bench.mjs --view=centre-far`, the slot
traced + resolved once against eleven times, Δ / 10, 90 frames × 4 rounds, whiteout, load 18–33) reads the march at
**0.15 ms per slot on the base and −0.07 on this tree — both at the bench's floor** (rounds −0.12..+0.51 and
−0.42..+0.20): Whiteout's stratus was never marched expensively at these views (the closed deck's rays go opaque
within a few steps of entering it), so the cap and the strides have a ceiling of ~0.15 ms and change nothing the
timer can see. The audit's +1.05 ms (quiet, `?clouds=off` against the volumetric layer at centre-far) is therefore
the layer's OTHER passes on a sky that fills half the frame at that view — the resolve and the dome composite (the
Catmull-Rom history filter, the far band and the haze per sky pixel) — not the march; the same-build A/B on this
tree reads the whole layer at +1.76 ms p25 at centre-far [+1.09..+1.88, four pairs] and +0.2 at chase, under foreign
GPU 30–1460 % (the audit's quiet +1.05 / −0.7 are the numbers to trust). Against deploy 95 (`$SP/r78/g2`, six
pairs, foreign GPU 1000–1330 % throughout — no quiet pair opened in the round's five hours): chase +3.1 ms p25
[+0.7..+3.5], centre-far +3.9 [+1.2..+5.8], draws +21 / +16 (the ring forest, the steel buckets, the understorey,
the layer's three passes), which the audit already read as contention at chase (its quiet chase pair was 0). The
brief's "< +1 ms at centre-far in a quiet pair" is not met and, by the bench, not reachable from the march: the
composite is the lever (a closed low deck could take a bilinear history filter and skip the far band where the
history is opaque), and it needs a sheet — left open. The law stays: it is correct, receipted, byte-neutral on every
other deck, and costs nothing.

*Items 3 and 6 measured (`$SP/r78/g3`: base 1d0236f33 vs the tree with items 1 + 3, six maps, four pairs each, chase /
centre-far; the sheets `$SP/r78/review/trim-sheet-chase.png` and `trim-sheet-centre-far.png`).*

| Map | draws base → after (chase / centre-far) | shadow-pass triangles Δ | CPU frame Δ per pair, chase (median [span]) | CPU Δ centre-far | GPU p25 Δ chase / centre-far | pairs' foreign GPU |
|---|---|---|---|---|---|---|
| desert | 639 → 623 (−16) / 509 → 493 (−16) | −0.12 M | −0.30 [−0.5..−0.2] | +0.00 [−0.3..+0.5] | −0.9 [−3.8..−0.3] / +2.6 [−0.1..+2.8] | 20–24 % (quiet) |
| monsoon | 809 → 789 (−20) / 486 → 468 (−18) | −0.41 M | +0.60 [−0.2..+3.0] (the +3.0 pair under 939 %) | +0.50 [−0.7..+1.4] | −0.1 [−2.4..+0.6] / −0.3 [−1.1..+0.5] | 24–1337 % |
| steppe | 701 → 681 (−20) / 433 → 414 (−19) | −0.06 M | −0.40 [−0.6..−0.1] | −0.40 [−0.5..−0.2] | +0.2 [−1.0..+1.5] / +1.4 [−0.7..+2.6] | 20–27 % (quiet) |
| verdant | 762 → 742 (−20) / 588 → 568 (−20) | −0.23 M | −0.70 [−1.5..−0.6] | −0.10 [−0.8..0.0] | +1.4 [−2.2..+4.0] / +0.6 [−2.0..+1.5] | 25–1250 % |
| whiteout | 678 → 663 (−15) / 420 → 405 (−15) | −0.08 M | +0.60 [+0.1..+0.7] | +0.10 [−1.1..+0.7] | +2.5 [0.0..+2.8] / −0.8 [−1.5..+2.4] | 206–1286 % (loaded) |
| winter | 781 → 776 (−5) / 485 → 481 (−4) | −0.09 M | −0.70 [−1.4..−0.3] | −0.30 [−0.9..0.0] | +0.1 [−1.1..+0.2] / −0.6 [−2.2..+2.9] | 22–1265 % |

The draws are exact: the twelve gobo draws plus the shrub and rim-forest passes on the cumulus maps (−15…−20),
the shrub passes alone on Winter (a deck: no gobos; no ring forest). What the census cannot show and the frame does:
the zero-count early-out removes hundreds of `setProgram` setups a frame (the census on this tree, with the
zero-count column: Monsoon Ridge 359 GL shadow draws and 333 zero-count submissions a frame at chase, Whiteout
Station 390 and 203 — every one of those submissions ran three's program / uniform / binding setup before; the
desktop cascades read 0–89 / 89–184 / 184–320 / 320–700 m on High), which is where the CPU moves: on the four maps whose pairs were GPU-quiet the CPU frame median
fell 0.3–0.7 ms (desert −0.3, steppe −0.4, verdant −0.7, winter −0.7); Monsoon's median is one loaded pair
(+3.0 under 939 % foreign GPU; its other three pairs −0.2 / +0.2 / +0.6) and Whiteout's +0.6 came under 200–1300 %
throughout. Against the audit's +1.0 ms on every map, the round recovers roughly half of it where it could be read
and cannot read the rest at this floor. The GPU p25 pair deltas span ±2–4 ms in either direction even in quiet
pairs (300 frames at ~25 ms: the timer's granularity on ANGLE Metal) and carry no signal here. The shadows at
chase: the sheets show no change (the shrubs' shadows under the near cascades are the same; a bush 300 m out and a
rim spruce 450 m out never had a readable one).

**What still costs (honest list).**
- The shadow passes are still 60 % of a frame's submissions: the props' bucket meshes (45–70 draws per cascade, plain
  merged meshes drawn into all four maps whatever their size), the near-vehicle detail parts (90 draws in cascade 0
  at chase, the round-28 policy), the near trunks and crown proxies (the r8 proxies per near cascade). A per-cascade
  mask for the small structure buckets (the yard clutter's wood / baked pieces cannot read past cascade 1) is the
  next knob; the structures themselves must cast everywhere.
- Whiteout's centre-far: the volumetric layer's composite (+1.05 ms quiet by the audit's A/B) — the march is 0.15 ms
  per slot on both trees; a closed-deck composite path (bilinear history, the far band skipped where the history is
  opaque) needs a sheet. Whiteout against deploy 95 still carries the ring forest, the ladder, the steel buckets and
  the understorey (+15 draws after this round's −15).
- The GPU timer on this machine: pair deltas of ±2–4 ms in either direction at 300 frames even when the load is under
  10 and the foreign GPU under 30 %; the round's GPU claims are draw-call and triangle claims, and the CPU frame
  medians on quiet pairs. No GPU-quiet window longer than a few minutes opened in five hours.
- Nordhavn Fjord at chase is 8.0 M triangles after the band change (the near stand within 200 m); under the 7 M gate
  needs the whorl tier or a lower card count per crown — both visible, both the owner's call.
- The mobile ring ladder (whiteout, +16 k triangles on one draw) and the mobile steel bucket meshes (+8 draws) stay:
  the first is under every pair's floor and its knob is a map-config field, the second is not knob-sized.

*Item 5 measured (`$SP/r78/m1`: deploy 95 vs deploy 106 on the mobile tier, four pairs; `$SP/r78/m2`: deploy 95 vs
this tree with the atlas gated, six pairs; whiteout, `?tier=mobile`, chase / centre-far).* Before the gate: draws
440 → 452 / 295 → 303, textures 47.7 → 50.6 MB, programs 198 → 203, GPU p25 17.2 → 16.7 / 16.4 → 16.7, CPU
4.5 → 4.6 / 3.8 → 4.7 (one loaded base record). After the gate: draws 441 → 452 (+11) / 295 → 303 (+8) — the two
bucket meshes in the forward pass and three cascades — textures 47.7 → 49.6 MB (the atlas's 1.0 MB gone; the
round-75 sheet tile and the rest of rounds 71–77 keep +1.9), programs 198 → 201, GPU p25 per pair +0.05
[−2.5..+2.95] at chase and +0.41 [−0.79..+3.09] at centre-far (medians +0.6 / +0.3), CPU +0.1 / +0.5, triangles
+0.05 M (the ring ladder's 16 k, the props' 3 k, the whorls' 5 k): within the pairs' floor at both views, under
foreign GPU 1150–1340 % throughout (the mobile tier's frame is 60 % terrain material on this map, and the numbers
above are the counters' — the GPU timer carries no signal here either way).

*Item 4 measured on the whole tree (`$SP/r78/g4`: base 1d0236f33 vs this tree with every item, verdant and fjord,
four pairs each, load 3–11, foreign GPU 20–40 % on most pairs).*

| Map | view | triangles base → after | draws base → after | CPU frame Δ per pair (median [span]) | GPU p25 Δ (median [span]) |
|---|---|---|---|---|---|
| verdant | chase | 6.95 → 5.83 M (−1.13 M) | 762 → 742 (−20) | −0.10 [−0.4..−0.1] | +1.1 [−1.4..+2.0] |
| verdant | centre-far | 6.58 → 5.33 M (−1.26 M) | 588 → 568 (−20) | −0.30 [−0.4..+0.7] | −0.3 [−5.1..+0.8] |
| fjord | chase | 9.39 → 7.71 M (−1.68 M) | 737 → 709 (−28) | −0.40 [−0.7..0.0] | +0.6 [−1.7..+1.0] |
| fjord | centre-far | 3.53 → 3.01 M (−0.53 M) | 393 → 333 (−60) | −0.50 [−0.7..−0.4] | −0.1 [−1.7..+0.2] |

Verdant sits under the 7 M gate at both views (5.8 / 5.3 M); Nordhavn's chase is 7.7 M (the band's −1.36 M plus the
shadow trims' −0.3 M), its centre-far −60 draws (the rim forest's near class, `frustumCulled` off, was drawn into
every cascade there). The CPU frame medians move −0.1…−0.5 ms across the eight quiet pairs; the GPU p25 pair deltas
span ±2 ms again and carry no signal.

*Whiteout against deploy 95 on the finished tree (`$SP/r78/g5`, four pairs, the last two GPU-quiet at foreign GPU
20–24 % and load 5–8).* Draws 658 → 662 at chase (+4, from +21 before this round) and 403 → 398 at centre-far (−5,
from +16), triangles 3.67 → 3.00 M and 2.71 → 2.30 M; CPU +0.3 / +0.3; GPU p25 per pair at chase −0.1 / +1.5
(loaded) and **+2.9 / +4.6 (quiet)**, at centre-far +1.4 / +2.3 (loaded) and **+1.5 / +3.8 (quiet)**, the frame
medians 26.0 → 28.1 and 24.7 → 25.4 with the presentation interval at 16.8 ms on both. So Whiteout's GPU cost
against deploy 95 is real at BOTH views — the audit's one quiet window read 0 at chase and +2.6 at centre-far, and
its floor was this one's — and nothing in this round touches it: the layer's composite on a sky that fills the
frame (~1 ms by the audit's A/B), the polar ring's relief atlas, far range and 1200 spruces (~0.5 ms by round 72c's
bench), the steel and cladding buckets, and a remainder no bracketed breakdown can attribute at a ±3 ms floor. A
per-system GPU breakdown in a quiet window (the probe's interleaved mode with more rounds, one system at a time)
is the next measurement; the composite path for a closed low deck is the first lever it would test.

### Round 79 — 2026-09-28: performance — the shadow passes and the tank draws

**Why.** Round 78 left the shadow passes at about 60 % of a frame's submissions (its census at the chase pose:
Monsoon Ridge 410 shadow GL draws plus 381 zero-count submissions a frame against 448 forward draws, Whiteout
Station 402 + 210 against 315) with three named owners — the props' bucket meshes drawn into all four maps whatever
their size, the near-vehicle detail parts in the first cascade, the near trunks and crown proxies — and the tanks as
the largest draw bucket of the frame (Monsoon Ridge at chase: tanks ~330 draws of 793 across the passes). Owner's
rule: "make sure performance is still rlly good", with no visible change. This round takes the four owners one
receipted knob at a time.

**Method.** The round-78 shadow census extended (`.qa-dev/r79-shadow-census.mjs`: every `renderBufferDirect` call
billed to its cascade, the zero-count submissions counted, each r8 proxy billed to its owner, and three inventories
the levers needed — per cascade the live map size / light-space span / texel size, per tank the articulated proxy
batch and which admissibility predicate refuses it, per props and vegetation caster its instance count, height,
bounding radius and, against the live cascade frusta, how many of its instances stand inside each cascade's box)
on seven maps at the chase and centre-far poses, an untouched rsync snapshot of the base (8fb54bac3, deploy 108/109)
against a snapshot of each step; the audit's ABBA probe (`.qa-dev/perf-audit-probe.mjs`, desktop High pinned, bots
frozen, governor pinned, 300 frames a pose, GPU p25) for the frame; every browser run under the shared probe mutex
(`$SP/r79/mutex.sh`, `run.sh`: no claim while `/tmp/cot-shots.queue` holds a live ticket, 90 s gaps). The live High
preset in the probe's headless Chrome renders 2048 / 2048 / 2048 / 1024 maps over 190 / 394 / 686 / 1517 m spans
(texels 0.09 / 0.19 / 0.33 / 1.48 m) with the breaks at 89 / 184 / 320 / 700 m — every rule below reads those live
values, never the preset table.

**1. The articulated proxy batch installs on battle hulls (`src/engine/articulatedShadowBatch.ts`).** Every tank
casts through three convex proxies (hull / turret / gun) beyond the near-detail range, and since round 28 a
`BatchedMesh` per hull was meant to draw the three as one multi-draw in battle builds — the census found it dormant
on every hull of every map: its admissibility compared each proxy's `onBeforeShadow` / `onAfterShadow` with three's
`Object3D` prototype hooks captured at import, and the game's lighting replaces `Mesh.prototype`'s hooks at boot (the
RGBA depth-packing flip, the r8 cascade-proxy hooks) before any battle hull is built. A proxy that INHERITS the
patched prototype hooks is now admissible (an own-property hook still keeps the original draw); the batch's own hook
runs three's BatchedMesh path and neither patched behaviour applies to it (its depth material is RGBA-packed by
construction, the r8 hooks act on InstancedMesh only). Three proxy draws per hull per cascade become one.

**2. One shadow draw per near tree pool (`src/world/vegetation.ts` `canopyShadowProxyGeometry`).** Every near pool
(species × variant) submitted two shadow-only instanced draws per cascade with identical instance sets, the same
LOD-fade depth program and the same FrontSide-as-BackSide depth pass — the trunk mesh (`castShadow`) and the crown
shadow proxy (the far-LOD lobe hull) — each with its own three r8 cascade proxies. The proxy's geometry now holds the
lobe hull and the near trunk's positions in one position-only buffer and the trunk mesh stops casting on the tiers
that build proxies (the mobile tier builds none and keeps its trunk-only shadow from the trunk mesh). Same triangles
into the same maps: a depth map is order-independent.

**3. Shadow caster profiles (`src/engine/renderLayers.ts` `setShadowCasterProfile`, `src/engine/shadowCasterProfiles.ts`,
`lighting.ts`, `props.ts`, `vegetation.ts`).** Three rasterises every caster into every cascade whose light-space box
its bounding sphere meets, and a merged bucket or an instanced kind spread over the map meets all four whatever the
box actually holds — at the chase pose on Monsoon Ridge the first cascade's 190 m box held none of the 166 fence
panels, 128 wall modules, 43 wire coils or 24 poles, each drawn into it every frame. A profile tells the router what
it cannot see from a mesh — content height, the world spheres of its pieces or instances, and for the near-tier
casters the farthest camera distance its pieces stand at this frame — and the evaluator (once per frame from the
lighting update, after the r8 compaction and the near-hull selection) tests three conservative laws against the live
cascades and writes a dynamic mask the router applies beside the round-78 static masks: CONTENT (no registered sphere
inside the cascade's frustum; instance spheres from the matrices, refreshed on their version), FOOTPRINT (a ground
shadow, height / tan(sun elevation), shorter than two texels of the map — the PCF kernel is wider), REACH (near-tier
content whose reach plus footprint plus 8 m ends before the view depth the cascade's map is sampled from — three's
CSM fade samples cascade i from its break x less the fade half-margin x²/8 of the range, pinned to `CSMShader.js`).
Under a sun below ~2° the footprint and reach laws hide nothing. Owners: the destructible pools, the boulders, the
poles, the baked models, the wreck shadow mesh (one sphere per wreck) and every merged bucket (one sphere per 96 m
cell of piece centres, computed before the merge consumes the pieces); each near tree pool's caster on one shared
profile whose reach and height `update()` refreshes every frame from the near slots (scope-promoted trees included).
Desktop tiers only: the phones keep their three cascades exactly as they draw today. The near-vehicle detail already
casts into the cascade covering the hull only (≤ 70 m: the first cascade, or the first two astride the 89 m break) —
nothing to trim there.

**Tank draws (item 3): the attribution and what was applied.** The census reads the "300 tank draws" of the audit
as two very different halves. FORWARD: at the chase pose only ~3.4 hulls stand in the camera frustum, and each costs
~52 draws — every material role its own mesh (hull / hullDark / hullDetail / hullExternalArmor / hullRubber / hullGlass
/ hullInteriorFill …, the same for the turret, gun and mount), up to twelve instanced road-wheel sub-meshes (discs,
tyres, insets, rims, pressed faces, hubs, bolts, three dish rings, hub caps, dish breaks), ten `decor_*` materials,
two markings, the impact decals — 176.6 forward draws on Monsoon Ridge. SHADOW: the four nearest hulls' detail
casters in the first cascade (~20 parts each, 82 draws — the round-28 policy, which already casts detail only into
the cascade covering the hull and never past the second) plus three convex proxies per hull in every cascade whose
box holds it (3.4 / 7.9 / 7.9 / 4.4 hulls × 3 = 71 draws a frame) — 152.6 shadow draws. So lever (a) of the brief —
a convex proxy per hull beyond the near range — has been the design since round 28; what was missing was that the
three proxies were meant to be ONE multi-draw per hull and never were (item 1 above). Applied: item 1 (three
proxy draws per hull per cascade → one; fleet bytes untouched). Measured and NOT applied, with the numbers
(`.qa-dev/r79-tank-attribution.mjs`, the fourteen Monsoon Ridge specs built headlessly with the battle options):

| lever | what the attribution says | why it is proposed, not applied |
|---|---|---|
| (a′) near-detail shells: the ~18 static detail parts of a near hull merged per articulation node into one position-only shadow geometry (the five instanced wheel draws stay) | −12…−15 shadow draws per near hull in the first cascade (−48…−60 a frame at chase); the shells cost 1.19–3.49 MB of positions per spec (25.8 MB for the fourteen specs, 753 k triangles) — a per-tank BatchedMesh keeps per-part visibility, a plain merge does not | new retained GPU bytes on every hull (the acceptance list asks for equal-or-lower buffer bytes); `stripEra` removes ERA plates at runtime and `setTrackState` changes the running gear — a merged shell would keep casting them; the shells would have to be built in battle only (never in node) to keep the icon / anatomy digests byte-identical |
| (b) same-material sub-meshes merged per node at build time | 27.4 draws per hull on average (365 static + 19 instanced of 840 across the fourteen specs; 60 forward draws per hull headless): `hull+hullDetail+hullExternalArmor+hullOpenLattice+hullHatch` share one paint material, `turret+turretDetail+turretExternalArmor+turretCupola` another, `gearRoadWheelTires+gearRoadWheelInsets` one rubber, `gearTrackPads+gearTrackPadsSimplified`; the outliers are the source-X hulls whose small parts are meshes of their own — `ua_m1a1_x` 172 forward draws of which 144 merge, `leo2a5` 97 / 41, `k2b` 75 / 41 | every merge changes the mesh list the icon studio, the anatomy diagrams, the module-visual-align probes and the near-detail vocabulary (`NEAR_SHADOW_DETAIL_NAMES`) walk by name, so the icon / anatomy digests cannot stay byte-identical; ERA plates (`stripEra`), hatches and cupolas toggle at runtime by mesh; the frame cost of a forward draw with the shared paint program is the smallest kind (same program, same textures), so the win is ~90 setups a frame at chase, not a GPU change — worth a round of its own with the digests re-pinned, not a knob |


**Measured — the census (base 8fb54bac3 vs the finished tree dde3a0928, seven maps, both poses; draws per frame, far cascade at half rate).**

| Map (view) | shadow GL draws base → after (Δ) | zero-count submissions | shadow triangles | tanks / props / vegetation shadow draws |
|---|---|---|---|---|
| desert (centre-far) | 290.3 → 190.3 (-100.0 (-34 %)) | 336.4 → 238.1 | 1533k → 1337k | 73.9 → 24.6 / 139.5 → 121.4 / 59.6 → 27.0 |
| desert (chase) | 387.0 → 282.5 (-104.5 (-27 %)) | 325.1 → 231.4 | 1647k → 1452k | 158.3 → 111.3 / 140.6 → 119.1 / 70.9 → 34.9 |
| foundry (centre-far) | 192.8 → 176.1 (-16.6 (-9 %)) | 48.8 → 70.4 | 1692k → 1589k | 0.0 → 0.0 / 175.6 → 159.0 / 7.9 → 7.9 |
| foundry (chase) | 388.8 → 280.6 (-108.1 (-28 %)) | 262.5 → 133.5 | 2916k → 2616k | 161.6 → 111.3 / 136.9 → 120.8 / 81.0 → 39.4 |
| monsoon (centre-far) | 268.1 → 198.9 (-69.3 (-26 %)) | 385.5 → 244.8 | 2219k → 1981k | 0.0 → 0.0 / 156.6 → 140.6 / 98.3 → 45.0 |
| monsoon (chase) | 407.3 → 279.8 (-127.5 (-31 %)) | 381.0 → 210.0 | 4920k → 4233k | 150.4 → 105.6 / 138.6 → 111.4 / 105.0 → 49.5 |
| railyard (centre-far) | 166.0 → 133.6 (-32.4 (-20 %)) | 54.4 → 61.6 | 1401k → 1185k | 0.0 → 0.0 / 147.6 → 117.0 / 9.1 → 7.9 |
| railyard (chase) | 394.5 → 281.4 (-113.1 (-29 %)) | 244.1 → 115.1 | 1818k → 1565k | 161.6 → 114.6 / 147.1 → 120.4 / 76.5 → 37.1 |
| verdant (centre-far) | 358.6 → 236.4 (-122.3 (-34 %)) | 394.5 → 227.3 | 2466k → 2076k | 70.5 → 22.6 / 168.6 → 150.6 / 105.0 → 49.5 |
| verdant (chase) | 432.3 → 321.6 (-110.6 (-26 %)) | 382.9 → 227.3 | 2541k → 2372k | 159.0 → 114.6 / 157.6 → 143.0 / 102.0 → 49.5 |
| whiteout (centre-far) | 211.9 → 181.1 (-30.8 (-15 %)) | 165.8 → 114.1 | 1183k → 1143k | 0.0 → 0.0 / 146.6 → 142.1 / 55.5 → 29.3 |
| whiteout (chase) | 400.8 → 304.4 (-96.4 (-24 %)) | 210.0 → 136.5 | 1717k → 1640k | 160.5 → 112.6 / 151.0 → 139.3 / 78.8 → 42.8 |
| winter (centre-far) | 275.0 → 207.1 (-67.9 (-25 %)) | 397.1 → 263.8 | 2397k → 2111k | 0.0 → 0.0 / 160.4 → 145.0 / 102.0 → 49.5 |
| winter (chase) | 413.8 → 299.5 (-114.3 (-28 %)) | 396.0 → 231.0 | 3370k → 2938k | 160.1 → 114.9 / 135.6 → 119.1 / 102.0 → 49.5 |

*ABBA probe — chase (label medians over four records each; the pairs are in the text above).*

| Map | runs (base / cur) | load1 range | quiet | GPU med base → cur (Δ) | GPU p25 base → cur (Δ) | noise (p25 spread base / cur) | CPU frame med base → cur (Δ) | update med | render med | interval med | calls med | tris M med | worst calls |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| desert | 4 / 4 | 5–47 | loaded | 31.8 → 24.8 (-7.0) | 28.4 → 21.7 (-6.7) | ±7.4 / ±13.7 | 7.2 → 5.9 (-1.3) | 0.00 → 0.00 | 5.50 → 4.20 | 16.7 → 16.7 | 623 → 507 (-116) | 3.64 → 3.34 | 623 → 507 |
| monsoon | 4 / 4 | 11–19 | quiet | 23.9 → 29.1 (+5.1) | 22.4 → 25.2 (+2.7) | ±2.9 / ±6.0 | 9.6 → 8.5 (-1.1) | 0.20 → 0.30 | 6.90 → 6.20 | 16.7 → 16.7 | 793 → 657 (-136) | 8.48 → 7.44 | 793 → 660 |
| railyard | 4 / 4 | 5–7 | quiet | 31.2 → 24.0 (-7.2) | 27.5 → 21.1 (-6.4) | ±1.3 / ±1.5 | 3.9 → 4.3 (+0.4) | 0.10 → 0.10 | 2.90 → 3.20 | 16.7 → 16.7 | 652 → 526 (-126) | 3.52 → 3.13 | 652 → 527 |
| verdant | 4 / 4 | 6–9 | quiet | 28.9 → 27.3 (-1.5) | 24.2 → 20.3 (-4.0) | ±3.0 / ±2.4 | 4.6 → 6.9 (+2.3) | 0.10 → 0.20 | 3.30 → 5.00 | 16.7 → 16.7 | 741 → 609 (-132) | 5.21 → 4.73 | 741 → 609 |
| whiteout | 4 / 4 | 8–19 | quiet | 31.8 → 46.8 (+15.1) | 27.9 → 27.3 (-0.5) | ±2.6 / ±5.9 | 6.2 → 7.0 (+0.8) | 0.10 → 0.10 | 4.40 → 4.00 | 16.7 → 16.7 | 661 → 572 (-89) | 2.99 → 2.98 | 663 → 572 |
| winter | 4 / 4 | 6–16 | quiet | 26.7 → 29.4 (+2.7) | 21.7 → 24.3 (+2.6) | ±1.0 / ±2.0 | 6.1 → 9.5 (+3.4) | 0.10 → 0.20 | 4.50 → 6.80 | 16.7 → 16.7 | 769 → 640 (-129) | 5.99 → 5.16 | 777 → 645 |

*ABBA probe — centre-far.*

| Map | runs (base / cur) | load1 range | quiet | GPU med base → cur (Δ) | GPU p25 base → cur (Δ) | noise (p25 spread base / cur) | CPU frame med base → cur (Δ) | update med | render med | interval med | calls med | tris M med | worst calls |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| desert | 4 / 4 | 5–47 | loaded | 26.5 → 28.2 (+1.7) | 23.1 → 22.0 (-1.1) | ±0.8 / ±0.4 | 5.3 → 5.7 (+0.4) | 0.00 → 0.10 | 3.60 → 3.30 | 16.7 → 16.7 | 480 → 368 (-112) | 3.32 → 3.01 | 480 → 368 |
| monsoon | 4 / 4 | 11–19 | quiet | 24.5 → 24.3 (-0.2) | 21.8 → 21.6 (-0.3) | ±0.7 / ±1.4 | 7.3 → 6.8 (-0.5) | 1.60 → 1.70 | 3.30 → 3.20 | 16.7 → 16.7 | 467 → 393 (-74) | 4.25 → 3.89 | 469 → 396 |
| railyard | 4 / 4 | 5–7 | quiet | 31.3 → 31.6 (+0.3) | 26.3 → 25.9 (-0.3) | ±2.9 / ±3.2 | 2.8 → 2.9 (+0.1) | 0.10 → 0.10 | 1.70 → 1.80 | 16.7 → 16.7 | 341 → 304 (-37) | 2.65 → 2.43 | 341 → 304 |
| verdant | 4 / 4 | 6–9 | quiet | 27.4 → 21.1 (-6.3) | 24.4 → 18.3 (-6.1) | ±2.8 / ±0.6 | 4.8 → 5.3 (+0.5) | 0.20 → 0.20 | 2.90 → 3.40 | 16.7 → 16.7 | 567 → 440 (-127) | 4.71 → 4.21 | 567 → 440 |
| whiteout | 4 / 4 | 8–19 | quiet | 31.5 → 29.4 (-2.1) | 27.6 → 25.2 (-2.3) | ±19.1 / ±25.2 | 6.1 → 7.4 (+1.3) | 0.20 → 0.20 | 3.60 → 2.80 | 16.7 → 16.7 | 398 → 363 (-35) | 2.29 → 2.21 | 398 → 363 |
| winter | 4 / 4 | 6–16 | quiet | 29.7 → 28.8 (-0.9) | 25.6 → 23.9 (-1.7) | ±2.7 / ±1.7 | 6.9 → 5.9 (-1.0) | 0.10 → 0.20 | 4.40 → 3.60 | 16.7 → 16.7 | 481 → 399 (-82) | 4.49 → 3.92 | 481 → 399 |

*The frame probe (`$SP/r79/g1`: base 8fb54bac3 vs dde3a0928, six maps, chase / centre-far, two ABBA repeats = four
pairs per map, 300 frames a pose, desktop High pinned; every pair GPU-quiet by the audit's rule except desert's
second repeat under 244–1272 % foreign GPU; `$SP/r79/pair-deltas.txt` for the pairs).* The calls and triangles are
exact and the same on every pair (renderer.info over the whole frame, shadow passes included): chase −116 / −136 /
−126 / −132 / −89 / −129 calls on desert / monsoon / railyard / verdant / whiteout / winter (−14…−18 % of the frame's
draws), centre-far −112 / −74 / −37 / −127 / −35 / −82; triangles −0.30 / −1.05 / −0.39 / −0.48 / −0.01 / −0.83 M at
chase. GPU p25 per pair: railyard chase −6.3 ms median [−8.9..−4.4] in four quiet pairs and verdant centre-far −5.9
[−6.5..−1.5] in four quiet pairs are the two readings the timer resolves; verdant chase −3.6 [−10.5..+0.2] (three of
four negative), winter chase +1.8 [+0.3..+4.6] (the one map leaning the other way — four positive pairs under 55–149 %
foreign GPU, with −129 calls and −0.83 M triangles; a quiet re-pair is the next measurement), monsoon / whiteout /
railyard centre-far / winter centre-far inside the timer's ±2–4 ms, desert loaded. The CPU frame medians move
−1.3…+3.4 ms per map with pair spans of ±2–3 ms on a GPU-bound headless frame (24–32 ms of GPU under a 16.7 ms
presentation interval: the main thread stalls on the command buffer, so the CPU medians track the GPU's jitter) and
carry no signal either way; the round's frame claims are the exact draw, submission and triangle counts and the two
resolved GPU pairs. The inventory's programs fall 245 → 229 on every map (the trunks' depth variants), scene geometry
36.4 → 34.5 MB (the trunks' r8 proxy instance buffers), GL textures +12–14 (the visible batches' 4 × 4 matrix and
indirect textures — kilobytes); its "scene texture MB" reads +24.0 on every map with `uniqueTextures` identical, and
the per-texture inventory (`$SP/r79/tex`, `.qa-dev/r79-texture-inventory.mjs`) names it: no texture was added — the
player's hull paint had reached its `high` rung (2048² albedo, 1024² wheel data maps: 16 + 8 MB over the `ai` rung)
by the time the inventory ran on the finished tree and not yet on the base tree — the same end state the asynchronous
painter always reaches, sooner on frames with fewer draws.

*The sheets (`$SP/r79/review/sheet-chase.png`, `sheet-centre-far.png`: left base, right the finished tree, six maps)
and the pixel diffs (`.qa-dev/r79-diff.mjs`, `$SP/r79/review/diff*-<map>-<view>.png`).* Two boots at two moments never
match pixel for pixel — the meadows' wind, the leaves, the TAA phase, a bot settling a hair differently, the turret
glint — so the diff is read blurred (6 px box, threshold 8: blade speckle averages out, a shadow patch would not):

| Map | chase raw (> 16) / blurred | centre-far raw / blurred | what the blurred residue is |
|---|---|---|---|
| monsoon | 10.4 % / 1.12 % | 0.51 % / 0.11 % | the meadow's wind mottling, the turret glint, one bot's nameplate outline |
| whiteout | 1.6 % / 0.85 % | 0.12 % / 0.015 % | the player's gun edge (a slightly different aim), falling snow |
| winter | 2.1 % / 1.25 % | 1.9 % / 0.23 % | one bot's outline at the left edge (settled differently), snow |
| verdant | 7.5 % / 1.21 % | 0.77 % / 0.019 % | the meadow's wind mottling, the turret glint |
| railyard | 0.8 % / 0.12 % | 0.03 % / 0.000 % | the gun edge |
| desert | 12.2 % / 3.75 % | 0.13 % / 0.000 % | the scrub and litter swaying, the turret glint |

No diff carries a coherent ground patch of the kind a lost or added shadow leaves; at the centre-far poses, where
the far cascades and the reach / footprint laws matter most, railyard and desert are pixel-identical after the blur.

**What still costs (honest list).**
- The near-vehicle detail: four hulls × ~20 casters in the first cascade (82 draws a frame at chase) is the round-28
  self-shadow policy at work, and the only knob-sized cut (fewer detail parts) is visible; the shells (a′ above) are a
  memory trade the owner has to want.
- The forward tank draws: ~52 per visible hull, and 172 for a source-X hull whose small parts are meshes of their
  own (`ua_m1a1_x`); the same-material merge (b) is a digest re-pin round, not a knob.
- The props' shadow triangles: the merged buckets are drawn into every cascade whose box holds any of their cells,
  and on a village or yard map every cascade does — 1.0–1.5 M shadow triangles a frame on every map; only a
  spatially split bucket (more forward draws) or a shadow-only chunked copy could cut them further.
- Whiteout's last cascade keeps the near tier: at 13° the trees' footprints (87 m for a 20 m spruce) reach the far
  map's sampled range; the reach law is exact, not a saving, on the low-sun maps (whiteout, alpine, blackglass).
- The GPU timer on this machine (round 78's finding stands): pair deltas of ±2–4 ms at 300 frames; the round's
  frame claims are draw-call, submission and triangle claims, and the CPU frame medians of quiet pairs.
*The mobile tier (`$SP/r79/census/mob-*`, whiteout and monsoon at chase, `?tier=mobile`, base vs the finished tree).*
The profiles and the tree-pool merge do not reach the phones (the evaluator is gated to the desktop tiers; the
mobile tier builds no crown proxies and keeps its trunk-only shadow from the trunk mesh); the proxy batch does,
because every battle build asks for it (`batchStatic`), so a phone hull's three proxy draws per cascade are one
there too: shadow GL draws 209.3 → 164.3 on Monsoon Ridge and 223.9 → 178.9 on Whiteout Station (the tanks'
67.5 → 22.5, every other row, every triangle count and every forward draw identical — 419.6 / 294.8 forward on
both trees). Same proxies into the same three maps, so the phones' shadows are byte-for-byte the same picture with
45 fewer submissions a frame.


**Tooling.** `.qa-dev/r79-shadow-census.mjs` (the census with the inventories), `.qa-dev/r79-tank-attribution.mjs`
(the headless per-hull draw attribution), the audit's probe and table as copied; `$SP/r79/`: `census/` (base vs
cur on seven maps, both poses), `census-summary.mjs`, `tank-attribution.txt`, `snap-base` / `snap-c` (the rsync
snapshots), `mutex.sh` / `run.sh` / `census-*.sh` / `receipts-*.sh` (the launchers and receipt runners), the probe
pairs and the review sheets.

**Winter chase, unresolved (2026-09-28).** *Winter chase, the follow-up (integrator, before deploy 111).* The g1 run's four winter chase pairs read GPU p25 +4.56 /
+1.31 / +1.79 / +0.25 with −129 calls and −0.83 M triangles — four positive pairs, which is a sign, not the timer.
Read strictly by the audit's window rule (1-minute load < 40 AND foreign headless GPU under 100 %), two of the four
were quiet (+4.56 under 61–92 % foreign GPU, +0.25 under 57–55 %) and two were not (+1.31 under 106–149 %, +1.79
under 101–90 %). The re-pair asked for — six ABBA pairs, only under load < 30 and foreign GPU < 100 % — was armed as
`$SP/r79/winter-quiet.sh` (polls both every 30 s, gives up after 45 min) with the attribution chained behind it
(`winter-chain.sh`: if ≥ 4 of 6 pairs stay positive, ONE interleaved seven-root run — base | +batch aa3bcb341 |
+tree merge f03ebf8d3 | +profiles 060daa42d | +empty-batch skip dde3a0928 | dde3a0928 with the near tree pools'
profile registration removed | dde3a0928 with the proxy batch refused — pattern ABCDEFGGFEDCBA × 2, every root four
times, every comparison adjacent in time, `multi-deltas.mjs` for the per-label deltas against the nearest base
record; the snapshots are `git archive` trees plus the two throwaway variants, never committed).
NO WINDOW: from 12:21 to 13:06 the gate polled 90 times and never met the rule — the 1-minute load ran 32–111 and
the foreign headless GPU helpers 414–1339 % (another session's Playwright `chrome-headless-shell` processes working in
a different project's scratchpad; not this lane's, not touched). Nothing was measured; the sign on winter chase is
neither confirmed nor refuted, and the g1 reading stands as written: +1.8 ms median over four pairs, two of them
quiet, against −129 draws and −0.83 M triangles. Ready to run in the next quiet window without changes:
`zsh $SP/r79/winter-quiet.sh w1 $SP/r79/snap-base $SP/r79/snap-d` (the six pairs), then `zsh $SP/r79/winter-chain.sh`
(the attribution, only if ≥ 4 of 6 stay positive).

### 2026-10-01 — the layered sky (the clouds-and-skyboxes lane of the visual redesign)

**Owner (2026-10-01): "redesign map and trees and horizon and skyboxes and clouds and light and literally everything …
build this and finish it" — grounded realism and natural light; the clouds already "look amazing" and set the bar, so
take them further and make every map's whole sky (its cloud field, its weather, its haze layers and the sky they sit
in) believable and specific to its place and its time.** Branch `visual/clouds-skyboxes` on the PR branch (c959ac4b6);
the lighting lane redesigns the dome, the light model and the tone mapping in parallel — the clouds compute their light
in the sky's own units from the published atmosphere, so they follow its exposure, and are re-tuned under its light
when the integrator merges it.

**What the captures of c959ac4b6 showed** (`$SP/p2/clouds/before/`, sky-w / sky-s / chase / bird at day, sky views at
sunset and night). The fair-weather cumulus hold (Verdant's puffs, the round-71 bar) but read as smooth cotton inside
their outline and their towers' heads fray into cotton candy — the round-71 erosion put the wispy (inverted-Worley)
octave on the TOPS and the billows under the bases, the opposite of a growing cumulus (cauliflower head, flat base
with a few fractus rags): the open "cauliflower only at the outline". The decks (Winter, Fjord, Railyard) read
airbrushed — a smooth transmitted-light underside with no rolls in it. Sirocco's cirrus is one comb of parallel
streaks from horizon to horizon. Monsoon's "cumulonimbus front" is fair-weather towers with no storm in it: no dark
base, no rain, no anvil. Every sky is a single slab and a cirrus sheet — no mid-level cloud, no weather at the horizon.
At night the clouds were black occluders: the atmosphere's summary is read with the preset's sky intensity applied
and the composite multiplies the clouds by it again, so the sky light reached them dimmed twice (0.08² at night) while
the moon reached them once, and the night preset's dark blue `cloudTintHex` (a colour for the painted decks) became
their albedo.

**The layered sky (placed by `src/engine/cloudWeatherLayers.ts`, written in the slab's trace program so the build's GLSL minifier strips its comments with the program's, lit by the same atmosphere).**
- *Contrails* — fresh lines of two merging plumes at the head that spread into contrail cirrus toward the tail (the
  width 22 m → 1.5 km with age, the optical depth falling with √width), breaking into fibres when old, drifting with
  the upper wind, deterministic per map (two trails often share an airway).
- *Rain shafts and virga* under the slab's own precipitating cores (the cumuliform coverage, the vigour and the
  anvil / precipitation field), between the camera and the base along the horizon rays: the columns lean a third of a
  metre per metre of fall, streak with the detail volume, and evaporate partway down under a dry base (virga).
- *A sea fog bank* lying on the horizon (banks with gaps, a lumpy top, white in the sun), in front of the slab.
- *Lightning* in a night front, drawn in the composite at the frame rate (the history refreshes a sixteenth of its
  texels a frame and would smear a flash): a strike every 4–16 s in a tower off in the wind's sector, one to three
  return strokes.

**The slab.** The cumulus shape is main's (83b0c0b62, "break up cylindrical cloud silhouettes": the warped unequal
weather lobes, shear from the base, the silhouette-scale curl, billows kept through the body), verified there on
Verdant and Steinburg; the lane's own cumulus laws (the wispy share falling with height, a 0.42 outline saturation,
the interior octave on the cumuliform rows, a 0.42–0.78 fair-weather type range) showed no clear gain in the labs and
were withdrawn at the merge so that work stands as tested. The lane keeps a slow
convective boil (the noise rises 0.7 m/s through a cumulus, a deck's cells turn over at a fifth of that), mottled deck
undersides (the shape volume's mid octaves at half the cell period thicken and thin the column over each point), the
cirrus in patches and curved by the jet's eddies (the same mean coverage, the streak frame warped by ±1.3 km), the
22° halo's argument squared (GLSL leaves `pow` undefined for a negative base — inside the ring), and the gobos hold a
front's clear radius (shadows fell under the sky the front keeps open).

**Time of day (`cloudPresets.ts`).** The diurnal cycle of convective cloud: a cumuliform sky (not a deck, a sheet or a
front's anvils) flattens a little toward sunset (coverage × 0.88, towers × 0.65, thickness × 0.88 — the first cut at
0.8 / 0.45 / 0.78 emptied the evening sky) and has mostly gone by night (× 0.58, × 0.25, × 0.62); a front's towers
live through the night. A map's `sunset` / `night` knobs win over the law (most temperate maps raise an altocumulus
layer for their sunset). At night the layer keeps a grey-white albedo and lets the moonlight bring the hue (the night
preset's dark blue deck tint made black cut-outs); the sunset keeps the preset's warm deck tint (without it the
captures showed the front-lit evening cumulus grey-white — the low sun's back-scattered share is small beside the
sky's light). `diurnal: false` holds an authored constant sky (Mars).

**Captures and drifts (2026-10-02).** The capture tools zero the cloud drifts for a frame-comparable field. The drifts
wrapped by a positive modulo, so a zeroed drift jumped a whole wrap on the next frame — a seam for every lookup whose
period does not divide the wrap, above all the boil (the shape volume's vertical period follows the slab's
thickness): the settled history blended two fields and every captured cloud of the lane ghosted. The drifts now stay
inside (−w, w), continuous through zero; the boil wraps at 600 km (238 hours at 0.7 m/s).

**The labs (2026-10-02; `$SP/p2/clouds/lab1`, `lab2`: preset variants laid over the live layer, one boot per map).**
Removed (2026-10-02; the first cut is in 31c46bfa8 for a rebuild): the mid layer — its 2.5D sheet read as white pancakes
(altostratus; thinner, wider and softer variants smeared), dozens of small discs (lenticular) and dark specks at
sunset (altocumulus) — and the distant cumulonimbus, whose narrow tower under a round flat anvil read as a mushroom
cloud on every open horizon (Redrock, the Delta, Mangrove, the Steppe) and, lit by a night strike, as an explosion.
Kept: the contrails (crisp paired lines that spread, Verdant, Sirocco, the polders, the airfield), the patchy curved
cirrus (Sirocco's comb is gone), the moonlit night decks and fronts (grey masses instead of black cut-outs), the
lightning in Monsoon's night front (the slab's own towers lit from inside), the warm sunset; Whiteout's coverage 1
closes its ink-blot hole (a dark smudge remains).

**Night.** The ambient is dimmed once (the summary's sky intensity undone before the composite applies it), the
moonlight's hue (the night key light at luminance one) lights the clouds, and a lit town's glow rides on the bases
(`nightGlow` / `nightGlowHex`: sodium on the yards and the industrial maps, greenhouse orange on the polders, a warm
white over the station and the airfield).

**Per map** (`clouds` blocks; the regime row fills the rest — towering cumulus and the fronts bring rain, dry-air
cumulus its virga). The night column is the diurnal law's cover and the town glow:

| map | slab (day) | weather | night |
|---|---|---|---|
| Verdant Fields (verdant) | fair-weather-cumulus 0.36 @ 1400 m | 2 contrails, cirrus 0.12 | cover 0.21 |
| Sirocco Wadi (desert) | cumulus-humilis 0.14 @ 1700 m | 2 contrails, rain 0.3 / virga 0.85, cirrus 0.5 | cover 0.08 |
| Frosthollow (winter) | stratocumulus-deck 0.86 @ 700 m | — | cover 0.86, town glow |
| Steinburg (urban) | altocumulus 0.55 @ 2800 m | 4 contrails, cirrus 0.3 | cover 0.55, town glow |
| Saltmere Bay (coastal) | sea-streets 0.32 @ 1100 m | fog bank 0.45, cirrus 0.08 | cover 0.19, town glow |
| Amberford (autumn) | fair-weather-cumulus 0.26 @ 1400 m | 2 contrails, cirrus 0.12 | cover 0.15 |
| Tarkhan Steppe (steppe) | cloud-streets 0.34 @ 1400 m | rain 0.2, cirrus 0.2 | cover 0.20 |
| Cinder Junction (railyard) | industrial-stratocumulus 0.92 @ 800 m | — | cover 0.92, town glow |
| Frontier Basin (frontier) | cloud-streets 0.40 @ 1400 m | 2 contrails, cirrus 0.15 | cover 0.23 |
| Nordhavn Fjord (fjord) | broken-stratocumulus 0.62 @ 900 m | rain 0.3 / virga 0.15, fog bank 0.4, cirrus 0.1 | cover 0.62, town glow |
| Jade River Delta (delta) | towering-cumulus 0.38 @ 1200 m | rain 0.45 / virga 0.1, cirrus 0.1 | cover 0.22 |
| Redrock Divide (badlands) | cumulus-humilis 0.18 @ 1700 m | rain 0.3 / virga 0.9, cirrus 0.35 | cover 0.10 |
| Monsoon Ridge (monsoon) | cumulonimbus-front 0.40 @ 1000 m | rain 0.85, cirrus 0.25 | cover 0.40 |
| Glacier Pass (alpine) | towering-cumulus 0.26 @ 1900 m | rain 0.15 / virga 0.1, cirrus 0.3 | cover 0.15 |
| Obsidian Caldera (caldera) | cumulus-humilis 0.22 @ 1500 m | rain 0.3 / virga 0.85, cirrus 0.45 | cover 0.13 |
| Ironworks (foundry) | industrial-stratocumulus 0.88 @ 850 m | — | cover 0.88, town glow |
| Ruinspires (ruinspires) | fair-weather-cumulus 0.42 @ 1100 m | rain 0.25 / virga 0.6, cirrus 0.12 | cover 0.24 |
| Blackglass District (blackglass) | ash-veil 0.55 @ 800 m | cirrus 0.5 | cover 0.55, town glow |
| Titan Gorge (titan_gorge) | dense-overcast 0.96 @ 450 m | rain 0.25 / virga 0.55 | cover 0.96 |
| Skybridge Chasm (skybridge) | fair-weather-cumulus 0.42 @ 700 m | rain 0.2 / virga 0.5, cirrus 0.12 | cover 0.24 |
| Tidegate Polders (polders) | broken-stratocumulus 0.68 @ 600 m | 3 contrails, rain 0.2 / virga 0.2, fog bank 0.35, cirrus 0.1 | cover 0.68, town glow |
| Copper Mesa Mine (copper_mesa) | cumulus-humilis 0.20 @ 1900 m | rain 0.3 / virga 0.85, cirrus 0.4 | cover 0.12 |
| Kestrel Airfield (airfield) | fair-weather-cumulus 0.38 @ 1400 m | 6 contrails, cirrus 0.12 | cover 0.22, town glow |
| Sunscar Oasis (oasis) | cumulus-humilis 0.17 @ 1700 m | rain 0.3 / virga 0.85, cirrus 0.4 | cover 0.10 |
| Whiteout Station (whiteout) | low-stratus 1.00 @ 300 m | — | cover 1.00, town glow |
| Orchard Valley (orchard) | fair-weather-cumulus 0.28 @ 1400 m | 2 contrails, cirrus 0.12 | cover 0.16 |
| Longleaf Crossing (longleaf) | fair-weather-cumulus 0.32 @ 1400 m | rain 0.3, cirrus 0.12 | cover 0.19 |
| Mangrove Reach (mangrove) | towering-cumulus 0.34 @ 1200 m | rain 0.45 / virga 0.1, cirrus 0.1 | cover 0.20 |
| Saltwind Narrows (saltwind) | sea-streets 0.30 @ 1100 m | fog bank 0.35, cirrus 0.08 | cover 0.17 |
| Highland Reservoir (reservoir) | fair-weather-cumulus 0.26 @ 1400 m | 2 contrails, cirrus 0.12 | cover 0.15 |
| Olympus Basin (mars) | thin-ice-clouds 0.06 @ 2500 m | cirrus 0.45 | cover 0.06 |
| Aegis Crossing (cliffbridge) | fair-weather-cumulus 0.28 @ 1200 m | 2 contrails, cirrus 0.25 | cover 0.16 |

**Cost** (`$SP/p2/clouds/bench-a12.json`: the PR with the light lane, ccd3c3703, against the lane on it, 2e21e663a;
desktop High at 1600 × 900 on an M5 Max 40-core GPU; sky-w; A B B A per map; the cloud pass measured by repetition —
K = 1 and K = 11 trace slots between one-pixel reads, which Chrome's GPU process answers only after every queued
command ran (`gl.finish()` does not wait there: the first bench read a slot as 0.01 ms)). The layer traces one slot a
frame. Per slot, base → lane (ms, mean of two runs each, run spread under 0.01 ms except Sirocco's ±0.1): Verdant
1.083 → 1.140 (+0.06), Sirocco 0.151 → 0.293 (+0.14, the patchy cirrus and two trails over a nearly clear sky),
Frosthollow 0.646 → 0.756 (+0.11), Monsoon 0.853 → 0.918 (+0.07), Whiteout 0.666 → 0.647 (−0.02), Nordhavn 1.156 →
1.282 (+0.13), the polders 1.033 → 1.171 (+0.14), Caldera 0.244 → 0.305 (+0.06), Ironworks 0.519 → 0.554 (+0.04),
Mangrove 1.327 → 1.471 (+0.14): +0.09 ms a frame on average, +0.14 at most. On the mid-range laptop proxy (a 10-core
Apple GPU or an RTX 4050/4060 laptop part, about a quarter to a fifth of this GPU) that is +0.35–0.7 ms of a 16.7 ms
frame. Whole-frame GPU medians (a timer query around post.render) moved −0.03 to +2.4 ms with run spreads of 1–6 ms
under a machine load of 24–120 from other sessions; the first run of every A B B A set read low (a warm-up the
pattern does not cancel), so they bound nothing finer than ±2 ms and the per-slot figures stand as the cost. The
removed mid layer and storm cells took 2,794 of the trace's 10,753 GLSL tokens and 11 KB of the game entry; the lane
now adds 11,096 B raw / 2,992 B brotli to the entry (765,690 / 228,689 against the 766,616 / 229,050 budget). The
mobile tier never creates the layer, so phones are unchanged by construction.

**Receipts.** `cloudWeatherLayers.selftest.mjs` (new, core group): the trails' placement, the packing, the gating, the
composite, the time of day, lightning, the drifts through zero, the removed layers staying out, the cloudscape on
every sky path. `volumetricClouds.selftest.mjs`: the identity table re-pinned with the weather fields (contrails, rain,
virga, fog bank) and Whiteout's coverage 1; the aerial mirror with the haze layer, the datum hand-off and the
square's ceilings.

**The haze layer and the square's ceilings (2026-10-02, handed over by the lighting lane).** The clouds' aerial law
(CLOUD_AERIAL) now takes the pass's 300 m haze layer — the path-averaged density from the camera's height, from the
datum the pass computes for the frame — so a cloud bank and the ground under it haze alike from a raised camera, and
the square's ceilings came down a third with the pass's (0.60 / 0.55 → 0.42 / 0.38). Measured on seven maps (Verdant,
Sirocco, Frosthollow, Monsoon, the polders, Nordhavn, Glacier Pass; `$SP/p2/clouds/final3`, the lane before and after
in one FIFO turn): the census bird and centre-far frames moved by a mean of 0.1–0.9 levels, under 2 % of their pixels
by more than 8 (grass and tree motion) — the ceilings do not bite in those views, so the far half's ground haze is set
elsewhere (the materials' FogExp2 at the preset's fogDensity × FOG_EXTINCTION_SHARE, and the pass's scatter-in target).
That stays open with the lighting lane; the clouds composite in the dome and take no material fog.

**The overcast light (the lighting lane's model).** A cloudscape that casts no cloud shadows drives the light as an
overcast deck by its coverage (lightModel.ts resolveOvercast: smoothstep 0.6–0.97). That holds five maps: Titan Gorge
(dense overcast 0.96 → 1.0), Cinder Junction (industrial Sc 0.92 → 0.95), Ironworks (0.88 → 0.85), Frosthollow (Sc
deck 0.86 → 0.79) and Whiteout Station (1 → 1) — each a closed or nearly closed deck, so a shadowless (or nearly
shadowless) light is what those skies give; the broken decks of Nordhavn (0.62) and the polders (0.68) keep their
cloud shadows and the sun.

**Every sky path carries the cloudscape.** `worldActivationRuntime.restoreAtmosphere` (the shots, the Studio staging,
the census frames) applied the sky block alone, so those frames rendered the legacy layer derived from it — Titan
Gorge's dense overcast as scattered cumulus, Winter's deck as a flat stratus; it now carries `config.clouds` like the
battle's `getAuthoredPreset`.

### Terrain v2/v3 — 2026-10-01/02: the ground at a fraction of the cost, grounded terms, sand in trains, the ring as the battlefield's own material

The Opus 5.5 redesign's terrain-and-horizon lane (branch `visual/terrain-horizon`; owner direction: grounded realism,
natural light, photographic materials, the desktop high tier inside 60 fps on a mid-range laptop GPU, phones never
slower). The architecture audit measured the terrain material at about 60 % of Whiteout's GPU frame.

**Why it cost that much.** The splat fragment sampled all four layers (base, soil, wet, rock), albedo and normal,
through `groundSamp` (two samplings of a rotation blend) over `splatSamp` (a near tap plus a far variant plus a deep-mip
"tile mean" tap) at every fragment, and multiplied most of them by a zero coverage; the packed-road palette and the
mid-band rock relief ran under every fragment too, and the 256 px shared noise texture — read some forty times per
fragment — went through the x16 anisotropic sampler, up to sixteen trilinear probes per read on the grazing far ground
that fills every skyline view. A static model of the executed fetches: open grass at 15 m about 59 fetches before,
about 33 after (23 of them isotropic explicit-LOD reads); open grass at 400 m about 94 before (all anisotropic), about
27–33 after.

**The cost pass (program key v53; v54 with terrain v3).** Every coverage weight is known before any layer is fetched (the height
transitions keep 0 at 0 and 1 at 1), so each layer is fetched inside its own coverage branch and the base tile only
where the layers above it leave any of it (`covG`, executed on scalar ports by `terrainMaterialV2.selftest`); the
rotation blend and the wall projections fetch their second sampling only inside the crossover band; past the far
band (`farM > 0.98`) no layer detail normal is fetched (sub-pixel there — the geometric normal and the coarse relief
terms carry the shading); the far variant is one fetch and its tile mean, like every deep-mip mean of the transitions
and the zero-mean octaves, is the layer's measured mean (`uMeanG/D/R/M`, measured from the layer image at build and
again after the sourced swap); the noise reads take an explicit isotropic level of detail from one footprint per
fragment (`nz`, `textureLod`) — the near, high-frequency reads keep the anisotropic path. Same ten samplers.

**Grounded terms (one per-map table, `groundRedux.ts`: `exposure`, `climate`, `bedIrregularity`, `patchwork`; packed in
`uReduxD`, no sampler).** Slope exposure: a slope turned to the map's sun dries and pales (straw, bleached rock, crusted
snow), one turned away holds moisture (darker, greener, mossier; desert varnish; powder) — the largest colour pattern of
a real landscape follows its relief, on the battlefield and on the ranges (`uVExposure`). The cover's 2–8 m patchwork
(one non-repeating field below the macro tints, inside the gameplay band). Non-periodic cliff beds (`bedSignal`: two
noise lines along the world height replace the world-height sines of the marker beds, laminae and far ledges; the vista
does the same with its detail noise) and buttresses and alcoves on the ring walls (a tall arc-frame lookup feeding the
vista's bump height).

**Sand in trains.** The census's contour "marble" on every dune map (Sirocco Wadi, Titan Gorge, Skybridge, Sunscar
Oasis, Olympus Basin, the moon) was round 43's own fix: one global phase `dot(world, wind)` under a per-position wind
rotation, so the phase jumped wherever the rotation changed and its isolines closed into loops. Ripples come in trains:
the waves now run in 36 m cells (the bedforms in 260 m cells), each cell with its own heading within ±20° (±26°) of the
map's wind and its own phase, blended bilinearly between the four nearest cells (`sandWaves`) — straight or sinuous,
never looping — at round 43's two wave numbers, amplitudes, gates and tilt cap. Airless ground has no wind ripples
(`windRipple: 0` on the moon).

**The ring is the battlefield's own material.** Since d20f64198 (continuous map horizons) every face of the horizon
ring and of its far range draws with the live terrain program past the square (`bindAutumnHorizonGround` with
`continuousGround`); the vista material is no longer drawn and only carries the relief atlas the terrain program reads
on the ring draw (`uRingDraw`). The ring lab proved it: runtime edits of every vista uniform left the frame unchanged,
while the post pass's aerial curves and the terrain program's uniforms move it. So the mountains' look and cost are
the terrain material's — the cost pass, the exposure law and the non-periodic beds above reach them directly (the
census's de-banded walls on Highland Reservoir and Glacier Pass) — and a first lit-vista attempt in this lane was
withdrawn as dead code.

**Terrain v3 (2026-10-02): what the ring shows.** The census sheets of the desert ranges (Sirocco Wadi, Olympus Basin,
Titan Gorge, Skybridge) showed a corrugated chevron sheet over every mountain at 1–2 km: the dune bedforms (26 m
trains) ran on the ring's 15–28° faces below the wall band, and the slip faces' unmipped 0.9 m contour wave and 3.7 m
flow sine — faded by the footprint distance, which a face-on wall reads as near — aliased at a kilometre. Bedforms now
stay on gentle sand (gone by 24°), and both sines fade by the true camera distance. The ring lab (runtime edits of the
program's uniforms through `userData.splatUniforms`, no rebuild) then isolated the rest: zeroing the ring's surface
atlas removed both the chevrons left on Sirocco Wadi's far ranges and the dimples on Copper Mesa's walls, while the
far-wall rescue's knobs (rock masses, coarse normals, their vertical stretch, ledges) and an occlusion-driven couloir
fill changed nothing visible at ring distance and were dropped. The atlas's fine relief is a slope's detail: on the
tablelands' and the martian scarps' flanks and walls (relief characters `mesa` and `martian`) its gradient now fades
over the face's own slope from 20° to 41° (`uRingReliefWall`, set at the ring's bind); the caps keep it, the occlusion
and the cast shadows keep their weight everywhere, and the snow, alpine, rolling and coastal ranges keep it in full —
their ridges are its relief. Earthrise Basin's regolith palette is a dark, faintly warm grey (the census: "the
regolith reads as snow"), its slopes the same regolith rather than pale rock.

**Measured (2026-10-02, Apple M5 Max through ANGLE Metal, headless Chrome, 1600×900, desktop High with the dynamic
scale pinned at 1, every bot frozen; `.qa-dev/terrain-perf-probe.mjs` in the lane, untracked).** Frame GPU time from
EXT_disjoint_timer_query_webgl2 (one query per frame, p25 of 180 frames per pose), the PR base (c959ac4b6) against
terrain v2 (3c1c33490) from frozen production builds, alternated A B B A per map in two runs on different hours (four
pairs per map and pose), each pair the delta of adjacent slots; median [min..max]: Whiteout chase −2.9 ms [−7.3..−2.3],
sky-w −2.5 [−3.7..−1.2]; Sirocco Wadi chase −3.5 [−5.3..−2.1], sky-w −1.3 [−3.7..+0.4]; Monsoon Ridge chase −2.0
[−2.8..−1.5], sky-w −1.2 [−4.0..+1.3]; Verdant chase −0.7 [−3.9..+1.6], sky-w −1.0 [−1.5..0.0] (whole frames of
16–22 ms; main-thread CPU unchanged within ±1 ms). The mobile tier (A B B A, two pairs): Whiteout chase −2.5 ms
[−2.9..−2.0], Verdant +0.2 [−0.5..+0.8], i.e. not slower. The machine carried other sessions' GPU work through most
pairs (load 7–109, foreign GPU-process CPU up to 12 cores), which is why single pairs spread; the interleaved
hide/show attribution was too noisy under that load to split terrain from ring and is not quoted.

### The border landform — 2026-10-03 (the map-borders lane of the Opus 5.5 redesign)

Owner (2026-10-02): "maps need to look so much better esp the horizons and transitions around map borders"; (2026-10-03)
"i literally just see a treeline and then nothing transitioning and going into mountains or stuff beyond border". The
border census (`tools/visual-census.mjs capture --set=border`: the four edges and four corners from a spot 60–100 m
inside the square at tank eye height and 60 m up, and a high oblique across the north-east corner — the owner's eye
test as seventeen pinned views with their own protocol, `visual-census-border-v1`) showed one cause behind most of it:

- **The square sat in a bowl.** The rim lift was one Chebyshev-square S-curve — `rimH · s(r)²`, `s = smoothstep(430,
  512, max(|x|, |z|))` — so every side was the same 18–58 m escarpment, every corner a V-shaped crease where two
  walls met, and past the edge the land was a plateau standing `rimH` over the battlefield with the authored ranges
  behind it. The rim's 25–45° faces took the steep-slope rock layer: the pale streaks along all four sides (on the
  paved maps, whose R layer is cobble, white ones).
- **A hedge round the square.** The rim forest's blocks inside the square and the ring forest's band past it (a stand
  law that wooded almost the whole band) stood all round as one tree wall, hiding whatever lay behind.
- **Roads ended.** The mask's clamped edge texel dragged a road 24–96 m out, bent to the perpendicular, and the ring
  closed over it.

What changed (`world/borderLandform.ts`, wired through `terrain.ts`, `maps/horizon.ts`, `horizonVista.ts`,
`vegetation.ts`):

- **The lift is a landform.** Inside the playable square (|x|, |z| ≤ 470) the classic S-curve stays and may only be
  LOWERED (a rim factor ≤ 1: no slope, cover or obstacle is added where tanks drive); past it the lift hands over within
  40 m to the outland's own hills — domain-warped fBm in 2D with the map's character (rounded downs, ridged crests or
  tableland terraces), rising from the square's level over a reach that wanders along the border and growing into the
  foothills of the ranges behind. A low-frequency enclosure field decides where hills stand close and where the land
  opens out; the in-square rim factor follows it, and corners lower the rim further. Each map has its character
  (`MAP_BORDERS`: open steppe and airfield country, flat deltas, polders and tidal flats, wooded valleys, tablelands,
  mountain valleys; `terrain.border` overrides). The near ring hands its continued ground to the authored ranges over a
  band that wanders 330–820 m past the edge (`getBorderHandOverAt`), not a ring parallel to the square.
- **Authoring keeps the classic rim.** Road node grades, pad seats and lake levels (queries with roads off) read the
  classic rim, so no road grade, pad or lake level inside the square moves; a final query shifts the road plane by the
  difference between the landform's rim and the classic one, so a road that climbed the old rim does not stand on an
  embankment where the land was lowered.
- **Roads run on.** Every road that reaches the edge leaves along its own heading for ~720 m (40 m steps that wander a
  few degrees, never back toward the square); the landform opens a valley along that line; the outland lies on a
  graded corridor (cut and fill, at most 7 %, starting at the square's road at the edge); the ring carries the
  carriageway as a vertex attribute (`roadExit`: the signed offset from the line and its presence) that the splat
  program reads with the square's own road law — no sampler, no loop.
- **Woods, hedgerows and fields across the red line.** The landform owns one woods field (patches of a few hundred
  metres leaning onto its hills, calibrated to the map's woodland share), a hedgerow field (field boundaries as levels
  of two ~330 m fields, 2–3 m lines with gates and gaps) and the parcels between them (stubble, plough, pasture,
  fallow — temperate, steppe or polder crops — carried on the ring as an albedo-offset attribute, `borderTint`, faded
  in from 30 m past the edge). The ring forest stands by the woods and the hedgerows; the square's rim trees past the
  playable edge stand by the woods, and inside it a third of the trees in the open stay as scattered cover (the
  placement stream is consumed exactly as before; a dropped tree's trunk record and concealment disc go with it).
- **Railways keep their hill.** Within 340 m of a railway that leaves the square (Tarkhan's and Cinder Junction's
  cuttings, rounds 63/67) the lift is the classic rim and plateau and the ring hands over by the classic law, so the
  cutting, the portal and its gallery stand where they were measured.
- **Paved maps' hillsides are ground.** Where the map's R layer is its paving (`uPavedRock`: Cinder Junction, Steinburg,
  Ironworks, Kestrel) a natural steep face takes the D layer instead of drawing cobbles.

Receipts: `terrain.border.classic` rebuilds the rim as it stood before the landform, so the receipts that replay a
pre-landform failure (`roadBorderCorridor`, `roadCutRecovery`, Delta's seam lip in `horizonAutumnGround`) build their
predecessor and current fields on it and check their physical limits on the landform as well; the history oracle's
relief-law constructor carries the landform's rim and the road plane's shift; the material receipts follow the exit
attribute, the parcels and the paved rock.

#### The second pass — 2026-10-03: what the eye sees from the square (gauntlet wave 0)

The gauntlet's wave 0 (3.16/10, every shot AMATEUR) named the band: "the border reads as an enclosing clay wall
rather than land continuing into foothills and mountains"; the bar is World of Tanks' red-line shots, where terrain,
fields and villages carry on past the boundary. An offline eye-view probe (a ray march over the square's heights and
the ring's seated surface, woods as a 15 m canopy: per border view, 13 rays across the frame and the range of each
ray's skyline) showed what blocked the view: banks of 13–25° a few metres past the red line — the geology's own hills,
the landform's crests, a corner's rise, the road hold climbing toward the old plateau — and woods standing on it.

- **The foreground clearance.** Past the playable edge the ground rises at most ~2.5° over the square's own edge (its
  outland composition along the 470 m square, smoothed over ±40 m) for its first ~260 m, released by ~540 m: a smooth
  minimum that never raises anything, ramped in over the first 40 m past the line (no step at the square's edge); a
  road's own band keeps its ground (the road hold grades it), a railway's classic island keeps its ground, nothing
  inside the playable square moves. Over the 33 maps' eight eye views (terrain only, 13 rays a view) the views whose
  skyline stood within 300 m of the edge above 1.5° fell from 198 of 264 to 30 (the rest are the maps' own mountains
  inside the square and the two railway tunnel hills); the skylines now stand at the foothills 550–830 m out.
- **A field system.** The parcels were the level sets of two noise fields (curving blobs, little oval islands). The
  fields are now two families of near-straight lines on a 46 m pitch, one orientation per map 7–21° off the square's
  axes (no boundary runs along the red line), warped ±22 m over a kilometre; a share of each family's lines are field
  boundaries (temperate ~190 × 255 m, steppe ~500 × 650 m, polder 84 m strips), never a closed loop. Hedgerows stand on
  the boundaries by stretches from ~40 m past the edge; 42 % of the boundaries carry a 3 m packed-dirt farm track 4 m
  beside the hedge in runs of ~320 m (the ring's `borderTrack` attribute: per family the metres from the nearest track
  and its boundary, linear across the track so a triangle interpolates it exactly; the splat program draws it
  anti-aliased by the pixel's footprint and fades it beyond ~1.2 km).
- **Whole-field woods and an open near band.** In farmland most woods are whole fields with straight edges along the
  boundaries (the free-form woods keep their cores on the hills); a field touching the first 70 m past the edge is never
  a wood and the near band stays mostly open to ~190 m (strongly) and ~380 m, so the eye runs over fields to the woods
  rising behind. The wild woods (maps without fields) keep lighter clearings along the edge.
- **Farmsteads and hamlets** (`world/borderFarmsteads.ts`). Yards are searched on the ring's seated surface (flat, off
  the woods, the sea, a railway's right of way and the exit roads' carriageways), gather along the exit roads as hamlets
  and stand alone among the fields elsewhere; a house, a barn, most a shed and on the steppe and polders sometimes a silo,
  squared to the fields, in the region's build (temperate, steppe, polder, winter, arid, nordic, tropical, alpine; 0–14
  a map), and a map's first hamlet in a parish style has its church (nave, tower, spire). The ring forest stands each
  farm's shelter trees (an arc 26–58 m round the yard). One merged vertex-coloured mesh: one draw and one far-cascade
  shadow draw, ~0.4–1.2k triangles.
- **Coasts.** Past ~150 m each bank of a sea opening takes its own headlands and bays (three octaves, 3 km to 420 m, up
  to 30 % of the half-width), CPU sector and GLSL twin alike.
- **The road hold.** Along a road inside the playable band the landform keeps the classic rim (its grades are authored
  on it: every grade in the square is unchanged), and past the red line it holds the rim's level at the red line rather
  than its climb, handing over to the landform by the edge (never inside a railway's classic island); a road that cut
  through the old rim comes down past the line on a gentle ramp (level at the line, 12 % from 20 m on).
- **Cost at ring build.** The land-use queries keep tables of the field lines, a field's woods by its corners and the
  last point of each field: the ring builds in 290–590 ms on Verdant, Railyard, Desert and Steppe (base 270–540 ms) and
  its attributes in 26–81 ms; no per-frame CPU work; the track adds a vec4 attribute and a few ALU on ring pixels.

Largest open item in the band: a railway that leaves the square (Cinder Junction, Steppe) still runs into a tunnel in the
classic rim's hill at the edge (rounds 63/67) — wooded now, but a hill standing in the view; the open line past the
edge is the next step. (Closed in wave 2 below: the open line.)

#### Wave 1 — 2026-10-03: the middle distance and the critics' artifacts

Gauntlet wave 1 passed the first pass (3.02 → 3.55, the horizon and border criterion +2 to +4 on most views) and named
the band's largest remaining defect: past the edge the country read as an empty, uniform plain. It also found four
artifacts in the after frames.

- **Hedgerows as bush lines** (`world/borderHedgerows.ts`). The field boundaries' hedges were ring-forest trees 20–40 m
  apart: a dotted line of crowns, nothing past 300 m. Every hedged stretch of a boundary past the edge is now a bush
  line — a prism 2.6 m across at its foot, 2.4–4.6 m high with a lumpy crest, tapered at its gaps — seated on the ring's
  surface in the ring forest's broadleaf green a shade darker (the landform's lines: `traceHedgeLines`, each field line
  traced in 8 m steps by Newton on its level). One merged mesh, one draw and one far-cascade shadow draw (Amberford
  8 km of hedge in 3.2k triangles; 5–12 ms at ring build). The ring forest stands only the hedges' standards.
- **Crops in calibrated colours.** The parcels' mild tints (±10–20 %) gave way to the ground lane's calibration
  (`landUse.ts`): each crop a multiple of the local sward's luminance — ripe wheat 2.8×, barley 3.0×, a young crop
  1.25× greener, stubble 2.8× straw, plough of dark soil, sunflower 0.7×, the polders' rapeseed — on each region's
  rotation. The ring's `borderTint` carries the crop premultiplied by its weight, the weight stored as `1 − w` so a
  geometry without the attribute (WebGL's generic default `(0, 0, 0, 1)`) reads no crop. Faded in over the first 40 m
  past the edge; none on slopes past ~25°.
- **One field grid on both sides (pending the ground lane's merge).** On a map with a land-use profile the land past
  the edge becomes the map's own grid: `borderLandUse.ts` traces its hedged boundaries (on a walled karst region every
  boundary, as dry stone walls) from `landUseAt`, the grid's heading squares the farmsteads, and the material draws the
  grid's crops and tracks across the edge; the landform's own fields serve the maps without a profile.
- **Artifacts.** A road exit is painted only on the ring's continued ground (Cinder Junction: an exit drawn on up a
  range's face read as a road climbing the backdrop and a bright seam up the mountainside). Round the playable edge
  (415–800 m) the turf holds to ~35° (the rim's remnants of 20–35° took the slope rock as a violet splotch on Sirocco
  Wadi and a blue-grey patch on Amberford). The farmsteads' colours sit at 0.8 of their value (a white wall in full sun
  read as a glowing sprite). The border census has a second protocol, `--set=border2` (`visual-census-border-v2`), whose
  spots also keep every crown 14 m off inside the view's wedge (Amberford's north view stood beside a tree's leaf cards).

#### Wave 2 — 2026-10-03: the railways run on in the open; the roads come down with the land

- **The open line** (`world/railSpurs.ts` `RAIL_OPEN_*`, supersedes rounds 63/67's tunnel). Cinder Junction's main line
  and Tarkhan's siding left the square through a cutting into a tunnel portal in a hill the classic rim stood for (a
  classic-rim island the landform kept round each exit: the last wall round the square). The islands and the tunnels are
  retired. Past the path's end the line keeps its own heading for 900 m: its bed continues the cutting's and then the
  outland's own ground, smoothed over ±40 m and graded to at most 1.5 % (`resolveRailOpenLine`, stations 20 m apart),
  in a shallow cutting or on an embankment with real banks (1.6 run per metre, eased in over the first 20 m); the
  formation widens over the first 30 m to a 24 m right of way, because the horizon ring's faces are 8–16 m across there
  and a narrower floor was drawn as a blend of bed and bank; the corridor hands back to the ground over its last third.
  The ranges stand back 320 m along the line (`BorderValley.holdM`: the landform's hand-over moves out within 90–300 m
  of the line), so the ring keeps the bed to ~650 m instead of climbing 50 m in 300 m under it; the valley follows the
  spur that leaves the square, not its cutting, so the map with and without the cutting differ only in the corridor.
  The kit lays the first 240 m of track on the bed (no collision record: the bounds push keeps hulls inside 470 m); the
  ring draws the ballast and, near the camera, the rails beyond (`railExitAt`: the signed offset kept 40 m either side
  so a triangle interpolates it exactly, the presence faded at 0.55–0.9 of the run, at the hand-over and wherever the
  ring's own height leaves the bed by 0.6–2 m). The ring forest, the hedgerows and the farmsteads keep off the corridor.
- **The roads come down with the land** (`terrain.ts` heightAt). The first pass lowered the rim but kept road authoring
  on the classic rim (with a road hold along each road and the road plane shifted down by at most 12 % past the red
  line): a road authored up the old 20–40 m rim stood on a causeway that high where the land beside it came down —
  67 of the 223 road exits stood more than 5 m over the land 30–40 m beside them, 50 more than 10 m (Ruin Spires and
  Olympus Basin 25–33 m at the edge, Foundry 21 m, against 18 over 5 m in the base). The road grades now take a second
  authoring pass on the landform's rim — the same law (portals, smoothing, junctions, the inherited maps' remap and
  the northern alignments) run on a second set of node heights — blended in from 430 m, where the rim begins, to
  460 m; inside 430 m every grade is the classic pass's to the bit (a single landform pass had rippled 1.2 m into the
  square through the grade smoothing and moved the raw inputs of the inherited-grade maps). The road hold and the
  plane's shift are gone (the plane comes down only with the foreground clearance, from which a road's own band is
  exempt); water authoring keeps the classic rim, so no lake, marsh or bank level moves. 8 exits remain over 5 m (the
  worst 10 m, Cinder Junction's north-west road on a rise at the edge), the median 0.4 m; the in-square ground moves
  only past 400 m, the bounds push already keeping play inside 470 m.

#### Wave 3 — 2026-10-03: the middle distance at tank eye height; each map its own country; roads end at the ranges' foot

Gauntlet wave 9 (the coordinator): the next bar is "field structure that reads at tank eye height, meaning hedgerow and
woodland belts with height, farm clusters and roofs, and roads that visibly continue", plus the remaining raised exits.

- **Belts and avenues** (`maps/horizon.ts` `borderTreeRows`, placed by `horizonVista.ts` as deterministic rows ahead of
  the forest's budget thinning). About a third of the hedged boundaries past the edge carry a belt of standards — one
  row, or two 5 m apart, every ~9 m, at 1.0–1.5× scale, a fifth of them conifers — faded in 120–220 m past the edge so
  the first fields stay open; each exit road carries an avenue where its carriageway shows (rows 8.5 m either side every
  ~12 m, in runs of four points of which 70 % are planted, faded in 30–60 m past the edge). The rows are seated on the
  ring's surface and keep out of the farmyards; 420–746 instances per map in the forest's existing draws.
- **Villages** (`borderFarmsteads.ts` `selectVillageSites`): up to three per map, one per side — four to six yards along an
  exit road 260–560 m out, ~28 m off it on alternating sides ~62 m apart, each house fronting the road with its shelter
  trees behind it. The scattered farms fill the remaining count and keep 140 m off a village.
- **The patchwork reads.** More of the field boundaries are hedged (temperate 0.32/0.25 of the two families, was
  0.24/0.18; steppe 0.13/0.10), pasture takes half the crop weight (was 0.35) and varies 0.78–1.22 from field to field
  (lush, grazed, cut for hay), the temperate rotation has less grass (pasture 0.22, was 0.30), and Cinder Junction and
  Ironworks carry farmland at the other farmed maps' level (hedgerows 0.55, fields 0.6/0.55; Ironworks eight farms).
- **The raised exits** (`terrain.ts` `buildRoadElevationGrid`): the landform pass's portal tails carried the authored
  grade over the landform's own ground to the edge. A tail past 430 m now comes down to at most 1.5 m over the land
  under it, and comes back up wherever that would drop it faster than 15 %; a cut is kept. Exits standing more than 5 m
  over the land 30–40 m beside them: 8 → 2 (Olympus Basin's north road on a ridge just past the edge, 6.1 m; Nordhavn's
  north road 80 m out, 6.3 m).
- **The track's bed.** The kit's open-line track lies on a ballast bed with shoulders (`mapKits.ts` `layRailSpan`), and
  the ring's ballast is a darker stone grey.
- **Each map its own country** (`borderLandform.ts` `borderLandformSeed`). Every battle builds at the one terrain seed
  1337, so the landform — its hills, fields, woods and the farms on them — was the same past every map's edge: Verdant
  Fields, Amberford, Ironworks and Saltmere Bay showed one hillside from their north edges. The outland's seed now mixes
  in the map id (FNV-1a), as the horizon ring's always has: the woods, fields and foothills are the map's own, and its
  hills take over from the shared ones 8–188 m past the edge. The playable band's rim (the enclosure) keeps the shared
  seed, so the ground of the square's mesh is what it was: the dressing stream reads it, and a first cut that let the
  map's own hills into the square's last 40 m moved the props across Amberford (its zone-control circles 300 m, the
  placement search past its 65,536-read bound). Only the rim trees change, standing by the map's own woods. The exits
  over 5 m stay 2.
- **Roads end at the foot of the ranges** (`terrain.ts` `roadExitOnRing`; the mountains lane, Frosthollow: with its pass
  turned off at the north exit the carriageway was painted ~300 m up the massif's face). The exit's carriageway faded
  with the hand-over to the ranges (0.45–0.9) and the run (0.55–0.95 of 720 m), and 209 of the 220 exits were still
  drawn over ring standing 4 m or more off its continued ground (Glacier Pass up to 114 m). Once the ring is built
  (after the ranges are carved and any passes opened), each exit now ends at its foot — the nearest point along it where
  a ring vertex within 12 m of the line stands off its continued ground (`horizonSurface.ts` `continuedGroundAt`, the
  ring's own law) by more than 1.5 m — fading over the 100 m before it while the carriageway narrows to 45 % of its
  width, so it runs out as a lane at the foot of the slope (the vertices are compared, not the surface between them,
  which cannot follow the corridor's cut and fill across the line). Now no exit is drawn over ring 4 m off its ground;
  the carriageways end at a median 340 m (was 530), Redrock Divide's at 60–90 m where the canyon's beds rise. Where the ranges
  open a pass for a road (the mountains lane's `openRoadPasses`, as at Cinder Junction) the ring lies on the road's
  ground and the road runs on through it. The villages and avenues stand along the cut lines, and the ring forest and
  the hedges keep a 6.5 m ride either side of a carriageway (trees had stood on it at 9–142 spots per map).

#### Wave 4 — 2026-10-03: gauntlet wave 30's six drops, each at its cause

Gauntlet wave 30 (wave 3 against PR head 6309d167d: mean 3.37 → 3.48, Cinder Junction's north view +2.7, Ironworks'
east +2.6, Ruin Spires' east +2.1) dropped six views by more than 0.5. Fixed on maps lane B's rebuilt maps (PR head
4b20975bb), one commit a cause:

- **The land past the edge is the terrain seed's again** (Frosthollow edge-n and edge-n-up −1.0 each, Glacier Pass
  edge-s −1.2, Sirocco Wadi corner-ne −2.3, Amberford edge-n −0.6). Wave 3's `borderLandformSeed` seeded the landform
  by the map id. Every ring and far country was authored over the landform's relief at the one seed, and the reseeded
  hand-over, hills and foothills moved the ranges' foot by up to 136 m: Frosthollow's north rose as a towering wall
  with smeared faces, Glacier Pass's southern range folded into a spike, a pale flat-topped slab stood in Sirocco's far
  range. The reseeded cover moved the woods and fields the views were composed of: a wood over Frosthollow's north
  hamlet, a stubble field across the middle of Amberford's north view (read as a bare sand patch). The landform is the
  terrain seed's alone (relief and cover); the ring matches the PR head's to the bit on every map but along the road
  exits, where wave 3's portal tails bring the road down to the land, and every ring's maximum height is the PR head's.
  Receipt `borderLandform.selftest.mjs`: six maps' landforms, rebuilt from the seed, rim, settings and exit valleys
  alone, answer the same relief, hand-over, woods and crops at 1872 points past each edge; Amberford's north view has
  no straw in the middle of its middle distance.
- **Villages from 110 m, each with its church** (Frosthollow's north views: the hamlet and church spire left them).
  Wave 3 strung its villages from 260 m out, but the same wave ended each road at the foot of the ranges, ~300–450 m
  out on a mountain map, so no village found room there and the map's one church was a chance hamlet's. A village
  starts at the first flat stretch from 110 m, as far out as its road reaches; it has its church across the road from
  one of its yards, the nave along the road and the tower facing the square. Frosthollow's north road runs into a
  village with its church 220 m out. Receipt `borderFarmsteads.selftest.mjs` (a village on a 330 m road, its church
  and spire; Frosthollow's north spire in the census's edge-n view).
- **The region's own buildings** (Ironworks edge-e-up −0.9: "the new hamlets read as American red barns"). A map with
  a regional building kit builds its hamlets from it — its square's kit, or for Ironworks (on the Saar) the coalfield
  kit's workers' cottage pairs — at the kit's mobile detail in the farmsteads' one vertex-coloured mesh: farmhouse,
  barn and shed, the kit's church or chapel (else the generic church in the kit's stone and roof: Ironworks' is brick
  under slate), decor kept within 170 m of the edge. 8k–51k triangles a kit map, one draw and its far-cascade shadow.
  The villages take one place a side (four a map) and the farms keep their own count, two fewer a village — with three
  a map they had taken the farms' whole budget and left Ironworks' east, where the red barns stood, with no hamlet; a
  village's shelter trees are thinner and narrower so it is not hidden in a wood.
- **No farm past a ruined city** (gauntlet wave 40, Ruin Spires: "a red-roofed farm on that horizon reads wrong past a
  destroyed megacity"). The border settings' `farmBuildings: false` raises no farm building past the edges of the
  ruined cities (Ruin Spires, Blackglass, Skybridge) and of the countries without farmland (Titan Gorge, Obsidian
  Caldera, Copper Mesa); their sites keep their shelter copses, so the ring forest — whose stream is drawn as its
  stands are accepted — stays the same tree for tree. Checked by a pixel diff of Ruin Spires' and Blackglass's twelve
  border views against a mask of the farm meshes: 1773 pixels changed, every one a farm pixel. A kit that builds no
  dwelling (Kestrel Airfield's Hostomel hangars) leaves the hamlets wholly to the generic set.
- **The frame cost** (gauntlet wave 40's merge bar: at most +1 ms a view against the PR head on Ironworks, Cinder
  Junction and Frontier; chase, centre-far and bird-n at 1600×900). Ironworks and Frontier passed in whole-build A B B
  A pairs (PR head 4b20975bb against this branch, GPU ms: Ironworks −0.71 / −0.51 / −0.03, Frontier −0.12 / −0.22 /
  −0.65). Cinder Junction's pairs moved by more than the bar in the post passes, which the lane cannot touch. They did
  so twice: an eight-run re-run under 115–280 % foreign GPU load had per-page chase frames from 14 to 30 ms. So the
  frame-budget probe's `--toggle=border-additions` measured the additions inside one page on the merged build
  (03147bef3). It hides the farmsteads and hedgerows, and draws every ring forest pool without its 932 row trees
  (including the 210 shadow casters among them). At each pose it runs off / on / on / off blocks, over four pages, and
  both sides run without the static shadow cache, so every cascade redraws every caster every frame, as when the camera
  moves. Hiding also removes the PR head's own farms and hedges, so the result is an upper bound. Whole frame with the
  additions, median of eight block pairs: chase −0.03 ms, centre-far −0.51, bird-n +0.67. The scene pass moved
  +0.16 / −0.21 / +0.38 and the shadow passes −0.02 / +0.02 / 0.00. The near class casts 55k more triangles than the
  PR head's (231k against 176k: the rows' 210 trees and 144 more stands) at no measurable cost, so it keeps them.

### 2026-10-03 — skies, light and colour: one haze law, the shade's own colour, a calibrated camera (the skies-and-atmosphere lane)

**Owner (2026-10-02): "dude genuinely maps need to look so much better esp the horizons and transitions around map
borders"; (2026-10-03): "in the horizon i literally just see a treeline and then nothing transitioning and going into
mountains or stuff beyond border".** Branch `visual/skies-atmosphere` of the PR #9 program. The lane owns the sky, the
clouds, the fog, the aerial perspective and the per-map light and atmosphere parameters; the mountains lane owns the far
ranges' geometry and surface, the borders lane the band from the square's edge to about 1 km. From the gauntlet's wave 0
(3.16/10, every shot AMATEUR, the game identified in every blind pair) the lane owns light, colour and atmosphere as one
system.

**The audit (census on b74e1c251, all 33 maps; sky and atmosphere scored together, 1–10).** Most clear maps shared one
deep cobalt sky and one field of cotton cumulus; the decks read airbrushed; the overcast decks opened holes (Titan
Gorge's blue hole, Ironworks' lens, Whiteout Station's blue smudge); the overviews wore a milky band in the middle distance
(Amberford, Frontier Basin). Scores: Titan Gorge 2.5; Cinder Junction, Whiteout Station and Ironworks 3; Verdant
Fields, Sirocco Wadi, Frosthollow, Amberford, Frontier Basin, Redrock Divide, Obsidian Caldera and the Tidegate Polders
3.5; Nordhavn Fjord, Ruinspires, Copper Mesa Mine, Kestrel Airfield, Sunscar Oasis, Orchard Valley, Longleaf Crossing,
Mangrove Reach, Saltwind Narrows, Highland Reservoir, Skybridge Chasm, the Blackglass District, Aegis Crossing and
Olympus Basin (a cartoon nebula) 4; Saltmere Bay, Tarkhan Steppe and Glacier Pass 4.5; the Jade River Delta and
Earthrise Basin 5; Steinburg and Monsoon Ridge 5.5.

**Why the far half read milky.** Three hazes stacked on the far land, none of them proportional to distance:
- the aerial pass's two Gaussian curves (1 − exp(−(k·d)²)) saturated at about 650 m under fixed ceilings — 0.42 / 0.38
  over the square, *lower* (0.34 / 0.30) across the ring's first kilometre — so every surface from 0.7 to 3 km wore the
  same veil and the square's far edge wore more of it than the mountains behind it;
- on top of the haze the pass desaturated (0.62) and cooled the far land, and pulled far greens toward a blue-grey (the
  sniper-scope hue clamp, which ran in arcade too) — the land lost its colour before any haze reached it;
- the materials' FogExp2 (fogDensity × 0.55) laid a second Gaussian veil over the ranges: 15 % at 1 km, 47 % at 2 km,
  62–77 % at 3 km.
The scatter target was capped at a fixed luminance and mixed with the authored fog tint, so every far range converged
on one grey near the sky's brightness: Verdant's 2 km ridge read 1.0× the sky above it.

**The haze law (`hazeLaw.ts`, c48ddb221 / f36a89b48).** One Beer–Lambert law over the physically based sky: the light of
a thing d metres out reaches the camera as L·T + S·(1 − T), T = exp(−σ·d·ρ̄·c) per channel, with σ the map's own air
(fogDensity × 0.42), ρ̄ the path-averaged density of an exponential layer (scale height 400 m over the ground under the
camera — a crest stands in thinner air than its foot, an overview from 300 m looks down through two thirds of the
ground's haze), c the aerosol chroma (0.90 / 1.0 / 1.14: far sandstone keeps its warmth) and S the sky behind the point
(× 0.92, the authored fog tint at 0.4 of the map's fog mix, a closed deck's target × 0.45). Every kilometre adds the
same share, so near, mid and far stay separate layers: on every authored map a ridge 2 km out keeps ≥ 0.49 of its
contrast (Monsoon, the thickest air) and 300 m keeps ≥ 0.85. The materials' fog keeps 0.3 of its share on that path; the
clouds keep their own law (a low deck's structure washed toward the horizon white under this one); the mobile tier's
Preetham dome keeps the old law byte for byte. The sun's cloud knee eases within ~5° of the disc (a dark "eye" read
around the sun on Fjord and the Polders where the kneed cloud sat under the unkneed glow).

**The shade's colour (2b20e01a1; the gauntlet: "grass in the tank's shadow renders saturated indigo ... reads as a hole
in the ground").** The grounded rig lights the shade with the clean dome's own irradiance — a Rayleigh-only sky whose
cosine-weighted light runs B/R 3.3–4 (Verdant 0.069 / 0.130 / 0.273, far past 20 000 K) — amplified by
SKY_DIFFUSE_GAIN, and the legacy cool shadow dim (0.80 / 0.88 / 1.0) painted the blue in a second time: in the wave-0
frames the light in Sirocco's hull shadow ran 3.8× bluer than its sunlight, Saltmere Bay's 4.6× (open shade under a clear
sky: about 2×). The environment's diffuse share now keeps SKY_DIFFUSE_CHROMA 0.4 of the dome's hue about its luminance
(the aerosol, the whitened horizon and the fair-weather cloud the clean dome leaves out — the same light the gain stands
for): Verdant's shade light lands at B/R 1.8, Sirocco's 1.6 (9 000–15 000 K); the luminance (the shade's level, the
metered illuminance) and the specular share (a mirror reflects the sky the eye sees) are unchanged. The grounded rig
dims its shadowed ambient neutrally at the legacy dim's luminance; the legacy rig (the mobile tier, the Garage, the
galaxy skies) keeps its cool dim and its dome's hue.

**A calibrated camera and AgX's own saturation (2b20e01a1).** Measured on the 24 wave-0 census frames against the
gauntlet's 82 references (CIELAB) and re-graded offline through the very output chain the night-lens oracle models
(`$SP/p2/skies/tools/regrade.py`: display → scene-referred → a new grade, round-trip residual 0.00/255):
- the exposure key was half a stop hot: a sunlit 18 % card at Verdant displayed at L* 60, the frames' median at L* 63
  and their darkest twentieth at 36, against 54 / 23 for the photographs (World of Tanks 43 / 19, War Thunder 47 / 17).
  EXPOSURE_KEY is now a calibrated meter, π / E_ref = 1.05: an 18 % card under the reference illuminance reaches AgX at
  scene-linear 0.18, its middle grey (L* ≈ 53); the re-grades land 53 / 24;
- the scene-referred saturation boost (1.4) put the mean chroma at 22 and the foliage at 31, against 17 and 21 for the
  photographs (World of Tanks 12 / 15), the sky's b* at −22 against −15: the grounded rig now runs AgX's own (1.0), the
  re-grades land 17 / 20 / −20; the legacy rig keeps 1.4;
- the night keeps the camera the owner approved ("a little more visible, not darker", 2026-09-14): NIGHT_EV −0.25 →
  +0.265 carries the key's half stop (1.05 × 2.6 × 2^0.265 = 1.5 × 2.6 × 2^−0.25 = 3.28); the red night lens's ceiling
  .5 → .6 (under the neutral grade the capped lens read a dull brick, #c35444) and the lens floors keep the key they were
  authored under (the legacy rig's 1.5).
A calibrated camera shows the albedos as they are: Verdant's meadow renders at L* 70+ (albedo ≥ 0.33), pale and washed
where fresh grass is 0.1–0.2 and a dry meadow 0.2–0.3 — the ground and vegetation lanes calibrate the albedos; nothing
should be brightened to undo the key.
**Held back after the gauntlet's wave 7** (PR head against the lane: sky +0.13, horizon +0.25, lighting −0.20,
Frosthollow's chase −1.6): a key matched to the photographs' median pulled every snowfield to grey (L* 70–73 against the
PR head's 79–80; a photographer keeps snow near white, +1 to +1.5 EV over a mid-grey meter). The key (1.5), the
saturation (1.4), the night EV (−0.25) and the night lens (.5) are back; the shading fix stays. The calibration returns
only with an albedo-aware key that keeps snow and bright sand high-key.

**Cloud shadows past the cascades, the far band on the horizon, the ground's sky under the hulls (de224d484).**
- The gobos dither the clouds' shade into the cascades only, so an overview's land past 700 m lay in one even sun. The
  clouds render the same shade (the same two weather fields, core and uniform objects as the gobos) into a 256-square
  map over 12 km around the camera, snapped to its 47 m texel and refreshed every eight frames or when the square moves;
  the aerial pass takes each far pixel's sun share away by it where the sun's ray from the pixel crosses the cloud base
  (the contact shadows' law, colour · (1 − shade · T / (T + A)): a slope already turned from the sun keeps its shade),
  fading in across three's last-cascade fade (0.875–1.125 of the shadow range in view depth), complementary. **Off by
  default since fp9** (`FAR_CLOUD_SHADE_ON` / `CLOUD_FAR_SHADE_ON` 0, fdb7df96d): the frames showed no effect. Its QA
  view (`__LIGHT_TUNE.FAR_CLOUD_SHADE = 2`: the map's shade in red over a 1.5 km grid of its uv) showed the map populated
  on the far ranges while the depth-reconstructed normal took the whole sun term away (past the cascades neighbouring
  pixels quantise to one depth and the normal degenerates). The pass now weighs a far pixel at level ground's sun share;
  the default moves only when a capture shows it. Off, the clouds render no map and the pass skips the block.
- A cumuliform sky's far band started at the decks' 8 km, 10° up inside its own traced field (marched to 20 km): one
  pale sheet with an edge across the sky (Saltwind's "hard-edged pale streak ... a compositing seam"). It starts at
  16 km and fades in over 9 km — under 4–5° at a 1.4 km band, the distant field's crowding on the horizon; the decks keep
  8 km.
- Scene-wide GTAO stays off (the owner, 2026-09-28). The ground around the four hulls the shadow router already selects
  loses the sky each hull hides (`vehicleGroundOcclusion.ts`), on the pixel's ambient share only; analytic, no noise.
  Since the vehicle-ground lane (2026-10-03, wave 13's "strip of fully-lit snow under the belly") each hull is one convex
  solid measured from the built visual — the shadow proxy's width, length and deck over its lower profile, the measured
  pan along the belly rising under the sloped end plates (a least-squares hinge on the proxy's underside) — and it hides
  its exact projected solid angle (Lambert's edge integral over its silhouette edges, clipped at the receiver's horizon).
  The track runs are not summed in as separate boxes: from beside or beyond a hull every ray through a run goes on into
  the belly, and the sum over-counted (0.65 of the sky 0.3 m beside a T-90M's track where the union hides 0.44). They
  close only the side gaps a receiver between them sees under the hull's edges, along their ground run. The receipt holds
  the law within 0.015 of a brute-force union of the hull and both runs (4096 stratified rays) at eleven ground points
  beside, ahead of, behind, off the corner of and under the T-90M, and the GLSL to its CPU twin on the GPU
  (`tools/vehicle-ground-occlusion.browser.selftest.mjs`). The track shoes' cloned material writes no vehicle tag and no
  sun state, so a shoe is a pixel without one in the shoes' measured lane over the track's lower edge (a 4 cm floor
  along the ground run, the wraps' measured ramp past it); a lit pixel, the terrain, is never one (lab4–lab6's lit snow
  under the track ends and along a sunk track's foot), grass under a ramp stays a receiver, and the ground the ground
  run covers (seen through the shoes' gaps and at their foot) keeps no sky. The contact plane is the shoes' own foot and the belly the measured pan
  only where it stands over it: a battle visual's published contact geometry sat 12 cm under its tracks with a pan 30 cm
  under them (the rest scan's float, 2026-10-03), which lab5's solids had inherited. A blocked direction keeps its occluder's own light (first-order
  interreflection with a 0.25 hull albedo): the belly lit by the open ground it glimpses, a wall by half sky and half
  ground. The ground-albedo multi-bounce it replaced (Jimenez's fit, which assumes the cavity has the receiver's albedo)
  kept 0.37 of the sky under a snow belly and 0.81 at its rear edge; snow's belly now keeps 0.13, sunny sand's 0.21.

**The first A/B on the PR head (fp6: 3ed03998a against the lane, the 24 wave-0 shots, the census views).** CIELAB over
the 24 frames, PR head → lane (the 35 photographs): p5 / p50 lightness 32.5 / 60.6 → 26.7 / 52.7 (22.5 / 54.4), mean
chroma 23.1 → 17.0 (16.7), foliage chroma 33.1 → 19.9 (20.8), the sky's b* −21.9 → −19.2 (−15.1). The hull shadow on
Sirocco's straw (46, 67, 79) → (36, 32, 25): its light from 3.75× bluer than the sun's to 1.02×; Saltmere Bay's teal
shadow dark olive; Saltwind's streak and the coastal ribbon gone; Verdant's and Frontier Basin's far ranges step
lighter and bluer instead of one pale wash. Two defects of the lane's own showed and were fixed before the hand-over: a
hard dark rectangle under every hull on overcast ground (the footprint's fixed 0.85 against the side law's 0.5 at the
hull's foot — now the sky through the side gaps, continuous at the edge), and no cloud shadow past the cascades (the far
pass took only CSM-lit pixels; the far forests' impostors and the ring's land are receivers too).

**Caldera's halo was the sky's own aureole (fp8; 77b6b5737).** The gauntlet read a soft white halo erasing a quarter of
Obsidian Caldera's sky as an exposure or tone-mapping bug. Isolation variants on its tree and sunward views (bloom,
shafts and flare off, singly and together) left it in place: display luma ≥ 0.89 out to 15° from the sun with every
effect on or off; the three effects added 0.01–0.02 near the sun, and the grade's highlight shoulder runs only in the
Garage. Caldera carried the heaviest aerosol of every map (turbidity 8.5 × Mie 0.014, about six times the Earth's, at
g 0.89). Half the aerosol at the tightest lobe the calibration allows (Mie 0.007, g 0.92) keeps the ash haze over the
land (its fogDensity is unchanged) and the bright core; fp9 shows the glow pulled in to the disc.

**Cumulus fields and flat bases (fp9; ec15fdffd).** The gauntlet's wave 4 read every cumuliform sky as "dozens of
near-identical, evenly spaced popcorn cumulus with no flat or shaded bases". Two terms in the one field and density
every consumer reads (the trace, the gobos, the far shade):
- `cluster`: a broad weather channel at 2.5× the cells' tile (30 km) gates the cells — 0.4× in a gap, 1.6× at a field's
  heart, mean 1. Inside a field the cells merge into large masses, at its edge they fray small, between fields the sky
  is clear;
- `baseFlat`: a cumulus base cut at its condensation level — the base's rise sharpened and the detail erosion kept to the
  flanks and the tops (the erosion lumps under the base had rounded every cumulus into a cotton ball).
The cumuliform regimes take both (fair-weather 0.6, the streets 0.4, humilis and towering 0.5) and the fair-weather rows
density 0.12 and ambient 0.9, so a shaded base reads grey instead of lifted back to white; the decks, sheets and fronts
keep the even field. fp9: merged masses with grey undersides and clear gaps on Verdant and Saltmere Bay. The gate's mean
holds a map's coverage only where the coverage cut sits mid-distribution: at a humilis map's 0.14–0.20 the cut is in the
field's upper tail and a heart's 1.3× lifts many cells just over it — Sirocco's horizon took a band of small puffs (the
next lab's item).

**Sirocco's clear air (fp9; eb5914da5) and one law to the far country.** Dry desert air is clear: turbidity 7 → 5 and
Mie 0.009 → 0.006 (a bluer low sky behind the ranges, which is the haze's target) and fogDensity 0.00047 → 0.0003 (a range
10 km out keeps about half its contrast instead of a third); Oasis inherits the sky, the Garage's mirror follows. fp9:
the far mesas keep their warm rock and their shading where the PR head shows pale lavender planes. The mountains lane
measured the arid ranges at 0.95–1.07 of the sky's brightness on its baked panorama: two terms stacked there — this
pass hazes the panorama's shell by its depth (camera → 2.6 km) and the bake added its own fixed 9 km e-fold for the air
past the shell (a ridge 300 m up at 7.5 km: 56 % fog on Sirocco, 64–66 % on Badlands, Copper Mesa and Oasis). Agreed
with the mountains lane (2026-10-03): the bake's air past the shell follows this law — `hazeSigma(fogDensity)` over the
remaining path, `hazeLayerMean` between the ray's height at the shell and the country's, `HAZE_EXT_CHROMA`, the target
from `ATMOSPHERE_SKY_GLSL`'s `atmoSkyVisible` as the aerial pass builds it — so the map's fogDensity is the one lever,
and the four arid maps go to 0.00025 (a 300 m ridge at 7.5 km keeps about 60 % of its contrast) once a capture shows it.

**fp9 on the PR head (6938b8413 against the lane, the 24 wave-0 shots and Caldera's three).** CIELAB over the 27 frames,
PR head → lane (the photographs): p5 / p50 lightness 30.3 / 58.7 → 23.8 / 49.9 (22.5 / 54.4), mean chroma 22.4 → 15.7
(16.7), foliage chroma 32.7 → 18.9 (20.8), the sky's b* −22.0 → −18.1 (−15.1). The lane's median sits 1.3 L* under fp8's
(the denser cumulus, the clearer desert air).

**Open after fp9.**
- Sirocco's hull shadow is near black: shade / sun 0.050 in display-linear light (sRGB 30, 28, 23 on 185, 164, 137 sand),
  where photographs of hulls on sand run about 0.07–0.16. The light balance itself is right (open shade / sun 0.155
  scene-linear: the sky's cosine-weighted irradiance × 1.45 against the sun on the ground); the hull's sky occlusion,
  the shadowed ambient's dim and the tone curve's toe stack on it. Next: the hull occlusion's multi-bounce term
  (Jimenez's polynomial on the map's ground albedo: bright sand returns some of the light the hull hides). (Superseded
  the same day by the first-order interreflection above: the polynomial lifted snow's belly to a lit strip.)
- The far cloud shade waits for its capture (above).
- The humilis maps' horizon puffs (above) and the arid fogDensity (above).
- Saltwind's sky-w pale band is the sea's horizon (the view looks along open water); the Frontier contrail reads as a
  hard streak.

**The clouds' shadows by one path (fp10; 2292e9149, 0ff4e2949, 495846781).** The ground lane traced a family of the
gauntlet's defects to the cloud gobos — the "uniform stippled dot pattern" (Saltmere Bay, Sirocco), the "concentric
arcs" and "weave tile" (Saltmere, Obsidian Caldera), the "checkerboard / diamond tiling" and the "contour-like streaks"
(Frontier Basin, the ring faces): each cascade's depth map carried the clouds' shade as an interleaved-gradient dither
(up to 62 % of the texels) and three's PCF read it with five fixed Vogel taps; the high tier runs no TAA, so neither
noise averaged out. The lines ended at the cascades' 700 m and vanished with the gobos off (Bayer, white-hash and R2
dithers alias alike: dithered depth coverage itself was the fault). Now:
- the layer renders the shade undithered into one map at the cloud base — 512² over 12 km around the camera (23 m
  texels), snapped to its texel, refreshed every eight frames or when the square moves — and publishes it to the
  scene's shared uniforms the moment it is refreshed (`scene.userData.cloudShadeUniforms`, `cloudShadeMap.ts`);
- lighting.ts patches three's shared chunks: `shadowmap_vertex` fetches the share per vertex (a cloud shadow is tens
  to hundreds of metres across), each sun cascade's light takes it before its shadow on both CSM paths, and
  `cotSunVis` takes it too (the scene alpha, the contact shadows' sun share, the shadowed ambient dim);
  `setupShadowMaterial` sets `COT_CLOUD_SHADE` and binds the shared uniforms on every desktop CSM material built on
  three's shaders (opt-out `userData.cotCloudShade = false`, a custom ShaderMaterial opts in with true); a program
  that would pass sixteen texture units with the map (three numbers a program's units over both stages and warns past
  sixteen on every bind; the inline standard maps of the physical fragment are not units until set) first trades
  three's DFG LUT for Karis's analytic fit of the split-sum DFG and keeps no cloud shade only when that is not enough
  (`programTextureUnits`, 2026-10-05: three r185's physical fragment declares `dfgLUT` inside its include, a unit the
  count never saw — the terrain bound seventeen and warned every frame; now ten layer samplers, four cascades, the
  environment and the map's vertex fetch make sixteen; `textureUnits.selftest` counts the expanded program as the GPU
  does);
- the ring's vista samples the same map (`horizonCloudShade.ts`: one fetch where it re-cut two weather fields);
- phones take nothing (no volumetric layer); the gobo planes, their depth material and the aerial pass's far shade
  block are gone.

**fp10 and the candidate (2026-10-03; the gauntlet's waves 7, 13 and 14).**
- *The camera stays the PR head's.* Wave 7 held the calibrated key (EXPOSURE_KEY 1.05 with AgX's own saturation): it
  greyed every snowfield. The split hand-over put the key (1.5), the saturation (1.4), the night EV (−0.25) and the night
  lens (.5) back and kept the shading fix — at the PR head's key and saturation Sirocco's hull-shadow light still runs
  1.13× the sun's B/R (the PR head's 3.75×; 1.06× at saturation 1.0, so the boost re-adds little colour).
- *A bright ground opens the camera* (`exposureAlbedoEV`, lightModel.ts): a map whose ground albedo passes 0.35 gains
  0.42 stops per doubling, at most 0.75 EV, by day — Frosthollow and Whiteout (0.80) +0.5 EV, every other map none; the
  photographer's compensation over snow, keyed to the authored albedo, never the global camera (wave 13: Frosthollow's
  establishing −1.3 for a greyer frame).
- *Arid air:* fogDensity 0.00025 on Sirocco, Badlands, Copper Mesa and Oasis (Badlands' far ridge contrast 0.165 against
  the PR head's 0.114); the mountains lane's panorama bake takes the same law past its shell once hazeLaw.ts is merged.
- *The hull's multi-bounce* (vehicleGroundOcclusion.ts): the occlusion keeps Jimenez et al.'s multi-bounce visibility on
  the map's ground albedo (Sirocco's hull shade / sun 0.071 → 0.081; snow lifts most). Replaced by the vehicle-ground
  lane's exact hull solid and first-order interreflection (above): on snow it was the lit strip under the belly.
- *No contrails* (cloudscapeLayer.ts `CLOUD_CONTRAILS_ON`): fp10's segmented, thinner trails still read as straight lines
  and the critics called every one a render glitch; the reference tank games carry none.
- *No cumuliform far band:* edge-on, its broad coverage turned into one opaque pale ribbon a few degrees over the hills
  ("a ruler-flat pale band at one constant height"); a cumuliform sky now ends where its traced field does and sinks into
  the haze, a deck keeps its far rows.
- *Humilis keeps the even field* (the fields' hearts swelled Sirocco's sparse cells into cotton masses); the street
  regimes' far cells take the fields' gate (ungated, a street sky's far half came back as even popcorn).
- Knobs left off until a capture shows them: `deckDetail` (fp10: it thinned the decks instead of defining them) and
  `CLOUD_FAR_THIN` (the far cumuliform cut).

**fp11, the gate capture (2026-10-03; the PR head 0bbb0cddc against the candidate ffc6e86ab in one hold, the census
recipe and its cloudscape gate, nine maps).**
- *Snow* (ground L*, the frame's lower quarter, median): Frosthollow establishing 80.2 → 85.4 and chase 79.2 → 84.0,
  Whiteout 64.5 → 72.2 and 63.8 → 70.3 — above the PR head on all four. The candidate without the lift matches the PR
  head (80.0, 78.5, 64.7, 62.7): the albedo lift is the whole difference (exposure × √2 on the two snow maps, every other
  map's exposure unchanged).
- *The horizon band* (wave 13: "the warm horizon band dims a step"): on Frosthollow's establishing view the far ranges
  and their haze (frame rows 180–315) run L* 72.3–73.6 on the PR head, 67.4–70.7 without the lift (the dimming fp10
  showed) and 74.4–77.3 with it, 1.4–2.5 b* less blue. A warm lobe in the haze law's target (half the legacy forward lobe
  toward the sun, the hue guard keyed on green casts only) changed no pixel of the eighteen establishing and sky-w frames
  — no census view faces the sun — and stays off the candidate.
- *Decks:* lumps 0.8 raised a deck's structure by half (sky-w structure: Railyard 1.90 → 2.82, Frosthollow 1.31 → 1.95)
  as one even mottle over the whole sheet; the interior octave does nothing on a deck (Railyard 1.884 against 1.897) and
  `CLOUD_FAR_THIN` 1 removed only a few marginal puffs on the horizon (Frontier, Coastal). Both stay off.
- *Chase frames vary on the tank from run to run:* the dev root (the candidate's code but for the haze hue) differs from
  the candidate only on the hull in every chase frame (Whiteout's tank renders darker in the candidate's frame than in
  either other root's), so a chase pair is no evidence about the hull's light.

**The wave-17 batch (fp12, 2026-10-03; the PR head 21b4e853f against the batch in one hold; the gauntlet's wave 19).**
- *A deck's far rows meet the ranges' haze* (Frosthollow: "a flat whitish band just above the true horizon where the haze
  layer meets the cloud deck — a discrete seam"). Under a deck the aerial pass hazed the ranges toward its overcast target
  while the cloud trace hazed the deck's far rows toward the clear sky's LUT, the bright horizon glow, and the deck's far
  band (the regime's 0.6 under a 0.86 deck) opened gaps of that glow under the deck's edge. Both now read one pair of
  target terms (`hazeLaw.ts` `hazeTargetTerms`: the authored tint's share and the level under the light model's
  overcast); a deck's far band admits the deck's own coverage and reaches down to 0.03° over the horizon. fp12: the pale
  strip under the deck's edge is gone; the critics no longer name the seam (+0.29).
- *Overcast snow* (Whiteout's chase: "dull blue-grey plaster, darker and much bluer than the neutral overcast sky"). A
  deck sends back part of what the ground sends up (`OVERCAST_GROUND_RETURN` 0.5, in the deck's own light: E · g / (1 − g),
  g = overcast × 0.5 × the ground's albedo — a snowfield under a closed deck ×1.67, grass ×1.1, an open sky nothing),
  the clear sky's share under a deck keeps `SKY_DIFFUSE_CHROMA` × (1 − overcast) of the dome's blue, and the bright-ground
  lift drops to K 0.25 (+0.3 EV on the snow maps) now that the return brightens an overcast snowfield by itself. fp12:
  Whiteout's snow/sky display-linear luminance 0.51 → 0.64, the snow's B/R 1.36 → 1.27; the critics: Whiteout's chase
  1.86 → 3.86, its establishing 2.71 → 3.43. The blue left is Whiteout's authored splat tint (tintB B/R 1.17).
- *Every cloud layer ends at a surface past the dome* (the mountains lane: `seaFogBank()` integrated from 3.6 to 30 km
  whatever the scene held — a far shore past 3.6 km took the whole bank with a sheer cut). post.ts hands the trace the
  scene depth the last frame resolved; the trace reads it through the camera that drew it (`cloudSceneT`) and the slab's
  march, the bank and the rain end at the surface, the far band and the cirrus behind it hidden. A surface inside the
  dome changes nothing (its depth test hides the layer there, and the history stays whole for a camera turn).
- *Not adopted:* the cumulus knobs as shot (`CLOUD_BASE_SHARP` filled every cell's footprint at its base — "grey
  soft-edged flat lozenges", "a regular row of grey pills"; fixed to fill only a column that carries the body, off until
  the re-shoot), the gated deck lumps ("a uniform, high-frequency grain like stucco"), and the haze's warm lobe toward the
  sun (no pixel changed on four maps' sunward views). Desert's sky-w streak was the before frame's contrail.

**The cost and the clamp's proof (2026-10-03, one held turn with fp13).**
- *Perf, ABBA:* the gobo build (a12c5681a) against the one-path build with the wave-17 batch (4b558d224), three maps
  × two views × 300 frames, desktop high at 1600 × 900. GPU p25 lane → dev: Desert chase 12.28 → 12.34, centre-far
  12.44 → 12.35; Frontier 13.86 → 12.14 and 12.43 → 11.93; Verdant 12.21 → 11.95 and 12.02 → 11.14 (ms) — no worse
  anywhere, though the dev build also carries the PR head's scenery (Frontier's chase 455 draw calls against 417). Every
  slot held 60 fps (a 16.7 ms frame interval); the CPU deltas sat inside the machine's load swing (load1 11 → 32).
- *The bank clamp on the mountains lane's recipe* (their 01b90af3b with the panorama shell pushed to 4.5 km, scratch):
  without the clamp Saltwind's far shells past 3.6 km stood as pale washed slabs with sheer sides and Coastal's far shore
  as a white band; with it they keep their own colour and the bank stays in front of them and over the open sea.

**The decks' relief (fp14; the gauntlet's wave 27).** The decks read "a featureless off-white wash"; the fine lumps
read as stucco (wave 19), so the relief went to the kilometre scale instead: broad cells and strong rolls — cells 1,
cellM 2400, undulatus 0.7 — on Frosthollow's `stratocumulus-deck` row and Railyard's own block, exactly as fp14's dk3
shot them (sky +0.25 against the plain after; Foundry's deck, not shot, keeps its row). The critics still find the decks
"blurry and pillowy" with 20–40 % blue on maps meant to be overcast: a fuller coverage for the deck maps is the next
step, untried.

**The cumulus: the residual gap (waves 19, 22 and 27; the thread closed after three waves without gain).** What the
critics want, in their words across the waves: flat shaded bases at one condensation height, crisp lit edges,
cauliflower tops, and cells that grow overhead and shrink toward the horizon. What each attempt did:
- *Wave 19 (fp12):* a shaded underside (`CLOUD_BASE_DARK`: the base's light and sky floor down to about a fifth) and a
  crisp flat base (`CLOUD_BASE_SHARP`: the footprint's density near the base). The sharp base filled every cell's
  footprint, including the cells the shape noise had left empty — "grey soft-edged flat lozenges", "a regular row of
  grey pills" (sky −0.67 to −1.67).
- *Wave 22 (fp13):* the sharp base fixed to fill only a column that carries the body; the shaded base alone and with it
  read as "grey saucers" on Coastal, "shaded flat bases" on Verdant and Frontier (sky −0.17 each); the far flattening
  −0.67.
- *Wave 27 (fp14):* a crisp outline (`CLOUD_EDGE_CRISP`: the base outline crinkled in plan, the density saturating a
  shorter way in), billowed tops (`CLOUD_TOP_BILLOW`: the cells, not the wisps, carving the tops) and the battlefield's
  field floor (`CLOUD_NEAR_FIELD`: the cumulus fields' gate never under the mean within 2.8 km of the centre, after a CPU
  twin showed Verdant's battlefield in a field's gap — 0.64 over the first 2 km, 1.35 at 5 km — which is why the critics
  saw "tiny grey dabs high in the frame" under big masses kilometres out). The crisp outline scored even (+0.00), the
  billowed tops −0.50, the floor −0.50: "evenly bright cotton balls with rounded bottoms at different heights… egg and
  pill shapes".
All six knobs stay in the code at 0 (read per frame through `__LIGHT_TUNE`). The read on why: the slab model carves one
density field — the weather's coverage, the shape volume's cells and two erosion octaves, under a height profile — and
every lever that sharpens one feature softens another. The base's flatness, the outline's crispness and the tops'
cauliflower all come from the same remap of the same noise, so a flat base costs the outline its lobes (erosion off),
lobes cost the base its flatness (erosion on), and a darker base reads as a grey saucer without a crisp lit body over
it. Getting all three needs a different density formulation: a base-height clamp in density space (the condensation
level as a hard plane the density is cut at, independent of the noise that shapes the body), and a separate noise basis
for the tops (larger-scale billows that grow with height, with their own lit-edge sharpening), with the cells sized by
a size distribution rather than a coverage cut, so the overhead cells are the large ones.

### 2026-10-04 — shade kept off black: the grade's toe and the shadow dim's facing rule (the shade-fill lane)

**The gauntlet's waves 29, 34 and 36: "deep shade crushes toward black on dark materials".** A tank's shadow on Verdant's
grass read about RGB (12, 40, 8); a shaded Verdant village wall 40 against 130 sunlit ("a flat, textureless matte-black
mass"); Saltmere's granite tor's shaded sides near-black against the bright sky. Branch `visual/shade-fill` of the PR #9
program, from the PR head 24d0a3131. Three causes were open: (a) no sunlit-ground bounce, (b) AgX's toe or an exposure
floor crushing the low end, (c) the cascades darkening more than the sky's direct share should.

**What the light held (the probe).** Five shaded / sunlit pairs at fixed poses (the skies lab's `--poses`, desktop high,
1600 × 900; each box on one material), their display medians inverted through the output chain to the light the scene
held (`agxgrade.py`, the full-colour twin of the output pass): the scene put 11–22 % of the sunlit light in the shade —
the grass beside the hull 16.3 %, the wall's shaded run 13.7 %, the tor's faces against the sunlit dry grass 10.8 %,
open shade on Saltmere's dry grass 22.3 %, Sirocco's sand 10.1 % — and the screen showed 3.5–14.5 %: in deep shade under
two fifths of the scene's share. (a) was not it: the environment's lower hemisphere carries the sunlit ground and the
ground-bounce excess (`groundBounce.ts`) lights sun-facing receivers; a receiver in shadow has shaded ground about it.

**(b) The grade crushed the shade.** The output pass's scene-referred contrast is a constant log-space slope about the 18 %
card (1.28), set for the sunlit range where AgX's own slope is 0.79 (a composite of 1.0). AgX's slope rises below the
card — 0.98 one stop under it, 1.31 at 2.5, 1.67 at 4 — so the composite climbed to 2.0 where a dark material's shade
sits and to 4.8 four stops under, the black point under it; a camera's holds about 1.0–1.2. `GRADE_TOE_SLOPE` /
`GRADE_TOE_STOPS` (`post.ts`): under the card the slope eases from 1.28 to 0.70 over 2.5 stops (the smoothstep of the
slope, integrated: C1, monotonic, the pivot fixed), so the composite stays 0.97–1.19 from the card down to 4 stops under
it; nothing at or above the card moves. The grounded rig by day only: the slope returns to the constant one with the
night, and the legacy rig (phones, the Garage, the galaxy skies) keeps it.

**Which level the toe reads.** The first build read each channel. A sunlit saturated colour's weak channel — the blue of
a sunlit grass sits three stops under the card while its luminance sits at it — was lifted, and the colour lost chroma
though its luminance held (GPU, the first capture: Verdant's sunlit grass −4 %, Saltmere's dry grass −10 % at ΔE 3.5 and
its pasture −15 % at ΔE 4.5, Railyard's overcast grass −23 % at ΔE 8). The toe is now the constant slope plus a log-space
lift, and the lift reads the pixel's luminance near the card (every channel lifted alike: the colour the constant slope
gives it) and hands over to each channel's own level from 1.0 to 2.5 stops under it (`GRADE_TOE_CHANNEL_FROM` / `_TO`):
deep shade takes a camera's per-channel chroma rather than the constant slope's saturated hole. A grey reads the same
either way, so the shade ratios do not move.

**(c) The shadow's ambient dim on faces turned from the sun.** The cascades dimmed the ambient 13 % (the specular 45 %) on
every shadowed fragment: the occluder that shades a face hides that face's sun-side sky, the circumsolar light. A
sun-facing face in a cast shadow keeps the dim; a solid face turned from the sun stands in its own shade — no occluder
hides any of its sky — and keeps it (`SHADOW_DIM_FACING`, lighting.ts: ×1.147 on that shade; opaque materials only, the
foliage cards keep the dim; the ground-bounce receiver still reads the shadow).

**Measured (GPU, the same poses and boxes, before → after; `$SP/p2/shade/cap2`).**
- *Shade (the probe pairs as the screen shows them):* the grass beside the hull 6.1 → 14.0 % of the sunlit grass (the
  shade ×2.29); the wall's shaded run against its sunlit run 3.5 → 14.7 % (×4.21); the tor's shaded faces ×2.92
  (display-linear 0.0106 → 0.0310), 3.8 → 11.2 % of the sunlit dry grass beside them (no sunlit granite in the pose: the
  sun stands behind the tor); open shade on Saltmere's dry grass 14.5 → 18.9 %; Sirocco's sand, the control (bright,
  barely crushed), 9.1 → 11.3 %. The screen now shows 0.85–1.12 of the scene's share; it showed under 0.4 of it in deep
  shade.
- *Why 14–15 % and not a clear day's 18–25 % for the first two:* beside a hull the hull hides about a fifth of the sky
  (`vehicleGroundOcclusion.ts`) on top of the circumsolar sky the cast shadow takes; a vertical face turned from the sun
  sees half the sky, its circumsolar part behind it, against a run that faces the sun — about three stops (12.5 %) in a
  photograph, 15.7 % in the scene with the facing rule. Open shade on the ground clear of the hull reads 18.9 %. (The
  first estimate's 22 % for the wall came from a box that took in the sunlit grass blades in front of it.)
- *The shade's colour (CIELAB C*/L*, the shade box against the sunlit box):* the grass in the hull's shadow 1.93 → 1.01
  against the sunlit grass's 1.05 (the old chain's saturated hole); the wall's shaded stone 0.71 → 0.21 against its sunlit
  run's 0.29; the tor's faces 0.56 → 0.22; open shade on the dry grass 1.28 → 1.07 (lit by the bluer sky: the sunlit
  grass 0.69).
- *At and above the card (one sunlit box per view on one material: median per-pixel ΔE76, luminance):* Verdant's grass
  0.00 (+0.03 %), meadow 0.00 (+0.01 %), the wall's sunlit stone 0.00 (+0.15 %); Saltmere's dry grass 0.00 (−0.04 %),
  pasture 0.43 (+0.60 %: it sits 0.85 stops under the card, where the lift begins), the dry grass by the tor 0.00
  (+0.00 %); Frosthollow's snow 0.00 and 0.00; Sirocco's sand 0.00 and 0.00. The sky band (the frames' top 108 rows):
  +0.00 %, ΔE 0.00 on all twelve views. Pixels at or above the card's display level +0.0 % on every view; the band just
  under it (display 0.10–0.21) +0.0–1.7 %; the shade (0.01–0.04) +40–81 %.
- *Railyard's overcast grass (Cinder Junction under its deck):* +13.1 % (chase) and +4.6 % (establishing), ΔE 2.29 and
  0.93, chroma 39.3 → 40.3 and 33.9 → 34.0 — the step is lightness. Under the deck the grass takes its light from the
  whole sky and the exposure keys the card, so this dark material sits 0.9–1.35 stops under the card: in the toe, where
  the old chain's composite slope (about 1.3) pressed it toward black and steepened its texture; the toe's slope there
  (about 1.0) is the same correction the shade takes. Its colour holds because the lift reads its luminance there (the
  per-channel first build took 23 % of its chroma).
- *Perf (desktop high, 1600 × 900; EXT_disjoint_timer_query GPU frame time over 90 frames; the toe and the facing rule
  toggled in-page, on / off / off / on per view):* the mean on − off over the twelve views +0.19 ms (p25) and +0.14 ms
  (p50) on the final build (+0.07 / +0.12 on the first); the worst view, Sirocco's establishing, +2.39 / +1.28 (−0.85 at
  p50 on the first build at the same view), inside a run-to-run spread where identical-setting passes differ by a median
  0.39 ms and up to 1.62 ms. The change is arithmetic — about a hundred ALU operations on each of the output pass's five
  samples a pixel, a few dozen a lit fragment for the facing rule — and the means agree with that count. Phones keep
  their path: the legacy rig never takes the toe or the facing rule.
- Frames: `$SP/p2/shade/cap2/<map>/{a,g}-<view>.png` (a: 24d0a3131, g: the fix), the gauntlet's list
  `cap2/shots.json`, the sheet `cap2/sheet-before-after.jpg`; the tools (`probe.py`, `report.py`, `refmoves.py`,
  `gpu-ab.py`, `agxgrade.py`, `toetwin.py`) in `$SP/p2/shade/tools`.

**Receipts.** `shadeFill.selftest` (the CPU twin of the grey chain and of the toe on a colour: the old chain's crush, which
fails the receipt; the composite slope 0.9–1.25 to four stops under the card; nothing at or above the card; a sunlit
colour's channels lifted alike and deep shade per channel; the facing rule; the five probe pairs' shares) — and
`groundBounce`, `cloudShadeMap`, `lightModel` and `nightEmissionMaterial` follow the new code.

### 2026-10-04 — the deck's grey at the horizon, closed decks closed, and the sky's blue in clear shade (the skies lane's follow-ups)

**Whiteout's beige band (the mountains lane's trace; Titan Gorge and Frosthollow show the same).** From an elevated eye a
band of warm cream (L* 85, b* +16.6 against the deck's −5.8 in Whiteout's bird view) lay between the deck and the far
ridges. The first fix followed the trace to the aerial pass: under a closed deck the haze law's in-scatter target kept
1 − fogMix of the clear sky's LUT (44 % on Whiteout, whose anti-sun horizon at the 13° sun is warm), and `hazeTargetTerms`
now returns the hue's whole weight — fogMix × HAZE_TINT_SHARE under an open sky, the whole authored tint under a closed
deck, linear in the light model's overcast — read as it is by the aerial pass, the cloud trace's deck rows and the far
bake's port (`hazeLaw.ts`). The pair left the band pixel for pixel, though, through neutral-extinction and target-level
variants too: the band is sky, which the aerial pass never touches. The dome drew the clear sky's LUT, and from 300 m —
the deck's own base — the strip under the deck shows it. `sky.ts` now takes the deck's grey there: the tint's hue at the
sky's own luminance, by the overcast, over the horizon's first seven degrees (`uDeckHorizon`; the environment bake keeps
the raw sky; the grounded rig only). Whiteout's band b* +16.6 → −2.2, Frosthollow's +4.0 → −2.7; the in-page switch
(`SKY_DECK_HORIZON` 0) restores both exactly; the far ice takes the tint (b* −2.9 → −4.1).

**Closed decks (Titan Gorge, overcast 1.00 under its dense-overcast regime, showed a large blue hole).** The hole is the
cloud field's, not the dome's: the sheet's coverage ramp (a third of the range for a stratiform deck) maps the equalised
weather field's lowest values to no cover even at full coverage. Titan's deck is now closed at the map (coverage 1, as
Whiteout's stratus; the regime rows keep the round-71 bound), a closed deck keeps a thin sheet at its field's floor
(`CLOUD_CLOSED_COVER_FLOOR` 0.5, slab and far band, from coverage 0.97), and under a closed deck the dome takes the
deck's grey at every elevation (smoothstep 0.9–1.0 of the overcast: the 0.8 decks keep the blue in their breaks) at the
horizon's luminance, so a residual gap reads as bright as the deck's horizon. Titan's hole shrank to a soft pale patch in
the tint (with the switch off, a small blue gap: the floor at 0.5 does not close the field's deepest minimum; a floor of
0.7–0.8 is the next step if the patch reads). GPU, the dome switch in-page, ABBA over six views: on − off −0.04 ms (p25)
— a few operations and one sky-view sample a sky pixel, inside the pass noise.

**The sky's blue in clear shade (the gauntlet's wave 46: on Sirocco's sand the cast shadows read warmer than the sunlit
sand; wave 47: "no blue in the shade" on clear Saltwind).** The shade's light was already bluer than the sun's (1.8× in
B/R on the sand), but warm sand keeps a warm shade, and the shade-fill toe's per-channel lift in deep shade took the
margin. `SKY_DIFFUSE_CHROMA` (lightModel.ts) 0.4 → 0.5 — the smallest of a GPU sweep (0.40, 0.45, 0.50, 0.55, 0.65) at
which the tank's shadow on the sand reads cooler than the sand in the sun; the measure is CIELAB b* per L*, shade minus
sun: +0.03, −0.01, −0.04, −0.08, −0.15 (0.45 reaches parity only). The pair (e675ad400 against the branch): the tank's
shadow on sand +0.03 → −0.04, the palms' shadow −0.05 → −0.11; the grass under Verdant's hull stays green (hue 132° →
134°; the early waves' teal was 180–200°), its woodland shade 109° → 112°; sunlit sand and grass ΔE 0.42–0.55 (b* −0.2
to −0.4: the same sky lights them); Whiteout ΔE 0.00 (a closed deck takes none of the sky's hue). No shader change.
Frames and tables: `$SP/p2/haze/cap3`, `$SP/p2/shadehue/cap` (the sweep) and `cap2` (the pair).

### 2026-10-04 — the sun's glow a gradient toward a visible disc; Titan Gorge's deck closed (the sun-bloom lane)

**The gauntlet's waves 46 and 50: on sun-facing views a quarter of the frame read flat white with no sun disc** (Redrock's
edge-e, "an exposure/tone-mapping miss rather than a deliberate flare"). At the census pose (cam (432, 91.5, 0) toward +x,
fov 55; desktop high, 1600 × 900; the lab's frame matches the wave's to 2.1 levels in 255) no pixel was display white: the
near-sun sky sat at L* 88 with chroma 5.5, 6.6 % of the top-left near white (every channel ≥ 235) — a pale plateau, not a
clip. Facing the sun, a white blob covered 37 % of the sun's region and no disc showed. A sweep of in-page knobs on one
build (bloom, the dome's knee, its compact glow, a highlight shoulder in the output pass, an exposure-aware knee) found two
causes: the bloom swallowed the disc in a halo fed by the compact glow and by 0.5–0.9° of aureole kept HDR around the
disc (bloom off: a distinct disc in a natural glow), and the dome's knee — a plateau at 1.45 raw, which a camera at
exposure 1.6 shows near white — flattened the aureole. A highlight shoulder in the grade cleared the white but greyed the
disc and reached snow; the cap the coordinator chose is the sky's own.

**The fix (sky.ts; sunGlare.selftest).** Only the disc stays HDR (the knee's exemption at the disc's own edge), and the
compact glow is part of the sky under the knee: the disc alone reaches the bloom's threshold, so its halo is the disc's.
On the grounded rig the knee is set as the camera shows the dome (`SKY_KNEE_EV`): it eases from 1.8 stops over the card
toward 1.2 stops more, the aureole from once to ten times the start spread across that range — a gradient toward the disc,
not a plateau. The sky only; the bloom (muzzle flash, fire, tracers) and the grade are unchanged.
- *The pair* (dec034617 against the branch): Redrock edge-e near white 6.6 % → 3.0 %, the glow L* 88.1 → 85.9 with
  chroma 5.5 → 6.0; facing Redrock's sun 36.6 % → 17.0 %, the disc visible in a falloff; facing Verdant's sun 1.2 % →
  0.3 %. No harm: away from the sun (Redrock hz-w), Frosthollow's snow and Saltwind's clouds ΔE 0.00.
- *GPU* (the old dome switched in-page, on / off / off / on): −1.5 and +1.6 ms on the two views, inside a run-to-run spread
  of ±1.5 ms — the change is a few operations a sky pixel.

**Titan Gorge's deck** (`CLOUD_CLOSED_COVER_FLOOR` 0.5 → 0.7, volumetricClouds.ts): the closed deck's floor at 0.7 closes
the residual gap at establishing and bird — the old hole reads as a thin, slightly brighter patch of the deck (ΔE 4.1 from
the deck beside it; 0.5 left a cream patch at ΔE 11.5).

**The sea's far band (next).** The split on Saltwind's edge-w: the sky over the horizon L* 85; the far band 13–17 under
it and teal. Without the haze law the band is darker still (L* 70 against 73): the aerial target is not the cause; the
water's own reflection at grazing incidence is (the sky's reflection × 3.5 / 1.75 at grazing: 4–5 under the sky, bluer).
The water's knobs ride in this branch at today's values (`WATER_ENV_NORMAL` / `_GRAZING`, `WATER_SPEC_CAP`,
`WATER_BODY_GRAZE`).

**Not this lane's:** Saltwind's cumulus (wave 46's "blown out") is not clipped (L* 72, no near-white pixel) and no
exposure or bloom setting moves it: the flat internal shading is the cloud model's, the item after the sea.
Frames: `$SP/p2/bloom/pair/<map>/{a,g}-<view>.png`; the sweeps `$SP/p2/bloom/cap{,2,3}`.

### 2026-10-04 — the sea mirrors the sky toward the horizon (the sea's far band)

**The gauntlet (both critics): the sea at grazing angles — "the far band turns teal and darker than the sky instead of
brightening toward the horizon (Fresnel), with no sun glitter".** The split, in-page on one build (Saltwind's edge-w, the
sea to the west; desktop high): the sky over the horizon sits at L* 85 and the far band 13–17 under it, teal. The haze law
is not the cause — without it (σ 0) the band is darker still (L* 70 against 73), and its target at the sky's own level
moves it 0.8 — the water's own reflection at grazing incidence is: `shallowWater.ts` weighted the sky's reflection
`mix(0.45, 1.75, grazing)`. `WATER_ENV_GRAZING` 1.75 → 3.5 (the FFT path untouched):
- *Saltwind edge-w:* the far band L* 67.4 → 78.6 (6.4 under the sky; it was 17.6), a* −6.8 → −5.6, b* −8.5 → −7.0 — the
  mirror a calm sea is toward the horizon; the mid field +6.5 to +9 L*; the water under the camera +1.2 (no wash-out).
- *Saltmere's bay (establishing):* the water +4 to +5 L* along its far half, the rest of the frame unchanged (median ΔE
  0.00); land-only views unchanged.
- *Sun glitter:* a sun-over-water pose on Saltwind (the camera over the sea, facing the 30° sun) shows the glitter path
  already, its sparkles held under white by the specular cap (1.15, pre-exposure; max channel 236). The cap at 2.5 lets
  the sparkles reach white and blooms the path's far end (16 750 white pixels), kept at 1.15 here; a choice for the
  critics (`WATER_SPEC_CAP`). The edge-w view faces away from the sun, where no glitter belongs.
- *GPU:* the old weight switched in-page, on / off / off / on: −1.3 and −0.3 ms (p25) — a constant.
Frames: `$SP/p2/sea/pair/{saltwind,coastal}/{a,g}-<view>.png`, the glint `saltwind/{a,g,g~spec25,g~spec4}-glint.png`.

### 2026-10-04 — the cumulus item, shelved: what it learned (the skies lane)

**The gauntlet's waves 46–50 on the cumulus:** "the darkest part of each cloud is only about a fifth darker than the
brightest", "a grid-like rhythm", "hard cel outlines". Branch `visual/cumulus` (on origin, not merged).

**Measured.** One knob at a time on each cloud's opaque interior (L*, desktop high; a cloudless frame of the same pose
gives the cloud mask, the interior keeps 8+ pixels inside the outline; `$SP/p2/cumulus/tools/cloudrange.py`):
- the sky floor in a cumulus' shade is the lever for its shade side — 0.34 → 0.12 of the sky mean took the shade 9–10 L*
  down and the crown 1.5–4; below about 0.06 the sky light itself sits above the floor;
- the multiple-scattering octaves' attenuation with depth (1.0 / 0.8 for b, b²) moved the clouds by one L*; a faster
  decay of the diffused light took the crown down more than the shade; a first pick judged by eye on a sheet greyed
  whole clouds (crowns 10 L* down with the shade) — measure the interior, not the sheet;
- with the base dark (0.8) and a cumulus sun gain (1.15) the branch reached dark / lit 0.35–0.44 (it was 0.61–0.80) with
  the crowns held at L* 88–90 and, toward the sun, rims brighter than cores; a coverage field over 36 km held one value
  over the whole battlefield and only thinned its clouds — a size spread needs a period of a few kilometres (6 km).

**Held by the gauntlet (wave 64):** the mean 4.25 → 4.19, the sky criterion down a point on four views, nothing up. Both
critics still saw "airbrushed cotton balls … no flat bases or backlit edges" and "soft, flatly shaded, blurred-edge"
clouds. Contrast alone does not read as volume: the gap is the density field's shape — one flat base at the condensation
level with cauliflower towers above it — not its light. If the clouds come back: the shape first, measured against
photographs; the light knobs are on the branch.

### 2026-10-04 — no hard sun disc through a closed deck; the deck brightens toward the sun (the skies lane)

**The gauntlet's wave 62 on Titan Gorge (dense overcast, a closed deck):** "the sun is a flat, hard-edged white disc
pasted on a featureless grey-white sky with no bloom, corona, or gradient" (Sonnet); "no readable sun direction" (Opus).

**Cause.** The cloud march ends a ray once its transmittance falls under 0.03, and the composite let that 3 % of the dome
through. The dome's sun disc is tens of thousands of times the sky's radiance, so it burned through the deck as a white
disc: 264 near-white pixels facing Titan's sun, 216 on Whiteout's, where a closed overcast leaves no direct sun.

**The fix** (`volumetricClouds.ts`, `sky.ts`):
- a ray the march ends under the cut is opaque — its in-scatter renormalised for the remainder, nothing behind it showing
  through (`CLOUD_OPAQUE_CUT`); a clear sky does not move (Saltwind facing the sun: ±1 level, run-to-run);
- under a closed deck (`uDeckClosed`, the overcast's last tenth) the dome draws no disc and no clear-air glow
  (`SKY_DISC_DECK_FADE`); either alone removed the disc;
- the sun's share of the light a deck transmits keeps a broad forward lobe — a dual Henyey–Greenstein of g 0.6 over its
  isotropic share, the mean over the sky unchanged (`CLOUD_DECK_SUN_LOBE` 0.2): facing Titan's sun the deck brightens
  200 → 219 display levels near the sun and 190 → 201 300–600 px out, a readable sun direction without a disc. The
  deck path only: Whiteout's low stratus (lit as a sheet) and every cumulus are unchanged.

**Measured** (desktop high, in-page toggles on one build; `$SP/p2/decksun`): the disc gone on Titan Gorge and Whiteout
(near-white pixels 264 → 0 and 216 → 0), Redrock and Saltwind's clear-sky suns as they were; GPU on / off / off / on
twice: +0.73 / +0.06 ms (p25 / p50) for the cut and the fade, +0.12 / +0.01 ms for the lobe — nil.

### 2026-10-05 — Tidegate Polders: two brick tower mills and the oxbow's lift bridge (the landmarks lane)

The old land in the west keeps its brick tower mills, the new polders in the east were drained by the windmotors: a
stellingmolen on the field drain's east bank and one at the oxbow's east tip, each with its stage and thatched cap, the
sails turned into the sea wind as the windmotors' are (6 050 and 6 162 desktop triangles). Over the oxbow's waist a
white double-leaf lift bridge in the Magere Brug's composition (4 076): the leaves on two brick piers in the water, a
fixed timber span on pile bents to each bank, the roadway 1.5 m over the banks (the basin lies level with its fields) on
paved brick abutments, short ramps down; a drivable roadway (its movement record), which the bots steer round. Census
[3419, 3353, 2701]; every structure and non-tree record where it stood, nine fewer trees. Pacing (4 seeds)
175/163/222/267 s against the head's 175/163/145/178 s. Cost: the establishing shot −1.15 ± 0.34 ms and the oxbow's view
−0.12 ± 0.47 (accept); chase −0.12 ± 0.64, and on its quiet-window re-run −1.51 ± 0.29 (accept); every CPU median within
0.17 ms, no long task and no program compiled during a slot.

### 2026-10-04 — the light under a closed deck, and the decks' own structure (the skies lane)

**The gauntlet's waves 80 and 82: under Titan Gorge's closed deck "the terrain beneath stays implausibly saturated and
contrasty", "crisp, hard-edged shadows" under a discless glow; waves 66–70: the closed decks "a single flat grey-white
gradient with zero cloud structure".** Branch `visual/deck-structure` from the PR head 3e7dfc94b.

**Was the direct light cut by the deck?** Yes — the light model's overcast cut (`lightModel.ts` OVERCAST_DIRECT_CUT) scales
the CSM sun and every term that reads it (the ground's sunlit share, the ground bounce, the contact shadows); the cloud
shade map is not involved (a stratiform deck, `shadow: false`, never writes it). At overcast 1 the 0.9 cut left a tenth of
the clear beam: on Titan's sand 12.8 % of the horizontal light came from a point sun (DNI 0.42 against the deck's 1.45),
a sun-facing wall took 0.42 over the ~0.95 the deck gives every wall (lit and shaded faces ~1.45 apart), and the
cascades cast it hard-edged. And the cascades' shade dims — the ambient −13 %, the specular −45 % on a shadowed face
turned to the sun, the circumsolar sky an occluder hides — applied whole under a deck that has no circumsolar sky: they
doubled the cast shadow's depth (lit over shaded ~1.15 → ~1.32 on the sand).

**The fix.** (1) OVERCAST_DIRECT_CUT 0.9 → 0.96: a closed deck passes a few per cent of the beam, and what it cuts past
the 0.9 its glow was calibrated against (OVERCAST_DIFFUSED_FROM) comes down diffused, added to the glow — the horizontal
light, the exposure and the open ground's level are unchanged on every map (the receipt holds them to 1e-9 at overcast
1, 0.85 and 0.5); only the share the point sun models falls. (2) The cascades' dims fade with the overcast
(`groundBounce.ts` uCotShadowDepth = 1 − overcast; SHADOW_DIM_OVERCAST): a closed deck's light comes from every
direction alike, so a cast shadow hides no more than the occluder's own small solid angle — the contact shadows'
business. The legacy rig (phones, the Garage) keeps both as they were. The CPU numbers, the point sun's share of the
horizontal light and a sun-facing wall over a shaded one: Titan (overcast 1) 12.8 → 5.1 %, 1.45 → 1.16; Whiteout (1)
5.2 → 2.1 %, 1.30 → 1.12; Railyard (0.95) 19.6 → 11.9 %; Foundry (0.85) 26 → 21 %; Frosthollow (0.79, a deck with
breaks) 24 → 20 %; every open sky unchanged.

**Measured** (desktop high, in-page on one build, every frame re-prepared: the old light — the 0.9 cut and the dims whole —
against the new, and a full cut as the no-point-sun reference; `$SP/p2/overcast/cap1`, `cap1A`, `cap1B`). The point sun's
and the dims' modulation of the ground (each pixel over the no-point-sun frame, p95 / p5 below the skyline): Titan Gorge
1.19–1.22 → 1.08–1.10 on five views (the gauntlet's e-wall-300 1.22 → 1.08), the chase view's cast shadow 1.27 → 0.97
lit over shaded; Whiteout 1.09–1.21 → 1.04–1.10; the ground's mean L* within 0.5 everywhere and its chroma +0.3 to +1.0
(the shade lifted, not the sunlit sand). Split: the beam cut carries most of the modulation, the dims' fade most of the
cast shadow. The old light against the new (p95 / p5 of their ratio): Frosthollow 1.01–1.10 (its deck keeps a fifth of
the sun), Railyard 1.07–1.09, Foundry 1.09–1.29 (the chase view's tree shadows), Verdant unchanged (the re-prepared
frames' own noise, 0.3 levels mean). The pair, the PR head 3e7dfc94b against the branch at the gauntlet's cameras
(`$SP/p2/overcast/pairP1`, `pairP2`; the head over the branch per pixel, p95 / p5 below the skyline, and its median):
Titan Gorge 1.10–1.13, median 0.97–1.02; Whiteout 1.05–1.07, median 1.00; Frosthollow 1.01–1.09; Railyard 1.07–1.21
(its sunward view, the shaded facades facing the camera lifted); Verdant 1.000–1.007 — no harm under an open sky. Receipts: `lightModel.selftest` (the beam cut and its diffused share holding the
light and the exposure to 1e-9 at three overcasts; an open sky untouched; a full cut keeping the glow), `groundBounce.
selftest` (the depth's chunk, rig and twin); the receipts that read the light sources by text pass unchanged.

**The decks' structure** (the gauntlet's waves 66–70: Titan's establishing and hz-w views and Whiteout's "a single flat
grey-white gradient with zero cloud structure"; and Whiteout's "ice plain clearly darker than the white sky"). Measured as
the sky region's luminance structure in three bands of a 1600 px frame (fine 8–32 px, mid 32–128, broad 128–512, as a
share of the deck's mean; `$SP/p2/deck/deckstruct.py`), with the overcast reference photos for scale — `real_ca_mau_1`
fine 0.39 % / mid 1.15 %, `real_jamuna_1` 0.29 / 0.37 — Whiteout's stratus measured 0.02–0.06 / 0.07–0.17: flatter than
any real deck. Every deck regime carries `lumps 0` and `deckDetail 0`, and Whiteout's low stratus also `cells 0` and
`deckLight 0` (the round-71 ceiling the integrator rated). The sweeps (`$SP/p2/deck/cap3`, `$SP/p2/overcast/cap1`):
- *Whiteout* (`whiteout.ts` clouds): the stratus lit as a deck — what its columns transmit (`deckLight: 1`; a share
  under 1 pays both lighting paths) — with soft cells (0.5), base lumps (0.6) and the detail's erosion (0.5), and the snow
  under it lifting its base (`ambientScale: 3`, the deck path's ground bounce, a quarter-albedo ground at 1): fine
  0.19–0.38 %, mid 0.42–0.61 % on the establishing, sky-w and sunward views — the photos' band. Its level comes down from
  L* 88–90 to 77–81 over the snow's 73–75: a snowfield under a uniform deck sits at about its albedo times the deck's
  radiance (0.8–0.85 here), where it sat at 0.6 — the whiteout's lost horizon. `ambientScale` 2 put the sky under the
  snow on the establishing view (74 against 75); the deck light at 0.7 cost both paths. (Whiteout's bird camera, at
  303 m, stands inside its 300 m deck base: any lit deck shows there as a veil.)
- *Titan Gorge* (`titanGorge.ts` clouds): base lumps (0.7) and the cells at 0.7: fine 0.10–0.34 → 0.44–0.62 %, mid
  0.40–1.03 → 0.76–1.23 %; lumps at 1.0 laid a mackerel mottle along the horizon, wrong for a rain deck.
- The pair against the PR head: Titan's establishing, sunward, hz-w and sky-w views fine 0.18–0.34 → 0.39–0.61 %, mid
  0.61–1.02 → 0.77–1.23 %; Whiteout's 0.02–0.06 → 0.19–0.38 % and 0.07–0.18 → 0.42–0.61 %, its sky's mean 221–227 →
  189–203 (display).
- The guarantees hold on every variant: no near-white pixel and no blue pixel in the sky region facing the sun, the
  forward lobe kept (the brightest 2 % over the median 1.07–1.09).
- *GPU* (the coordinator's rule, the load gate shut past two hours: in-page on the branch, the deck knobs against the regime's own, 8 interleaved quartets per arm against a null control, 1920 × 1080 high, the establishing view; `$SP/p2/costrule/deck-*`): Whiteout −0.24 ± 0.25 ms p50 (+0.02 ± 0.23 p25), the bound +0.26 / +0.49 ms; Titan Gorge +0.36 ± 0.22 ms p50 (+0.14 ± 0.18 p25), the bound +0.81 / +0.50 ms — both under +1 ms (frames 11.3 and 12.7 ms). The light's change is one multiply on a lit fragment and the light model's resolve, no pass.

### 2026-10-04 — Whiteout's ice sheet re-candidated and dropped; the shell's apron read sky (the mountains lane)

**The candidate (d9f5f6b06: `panorama: { regional: 'iceSheet' }`, the ring at amp 0.45 and snow-covered to its foot)
against the PR head's dark far range, in one paired ticket (establishing, bird, sky-w, sky-s, corner-ne and corner-sw).
It was dropped before a wave, and the PR head's far range stays.**
- *The band.* The bird view (303 m up) showed a cream-white band (L 0.69–0.74) lying on the ring with a ruler-straight
  top edge, and above it the far sheet as a flat grey strip (0.63–0.64) under the sky (0.77). These are waves 53–54's
  overcast bird views, "the world simply ends … a ruler-straight hard top edge". It is not the fill: in the SwiftShader
  lab, with the fill's sun term at zero, nothing changes there. The shell reads the atlas by each fragment's elevation
  from the bake eye (30 m at the centre), and the inner rows of its apron stand above that eye's horizon:
  - the edge row, at the ring's outer edge (1.3–1.5 km out, 48–90 m up), sits at +0.76° to +2.54°;
  - the first apron row (1.9 km) sits at 0.01°–0.88°.

  At those elevations a low far country's atlas is sky; over an ice sheet it is opaque only to about +0.3°. Those
  fragments are discarded, and from a camera well above the eye the sky dome's below-horizon colour shows through them.
  From the bake eye the apron is hidden behind the ring, so the ground views never show it. Redrock's shell has the same
  rows (+0.92° to +2.43°).
- *From the ground* (corner-ne, corner-sw, sky-w) the PR head's dark ranges gave way to a near-featureless white line.
- *Open: the nunataks' tint.* They came out as small beige-pink pyramids in the game's frames and grey-blue in the lab's
  bake, so the tint enters after the bake (the aerial pass or the grade). It has not been traced.
- *Next, the far-earth fix:* the apron is ground and never reads sky. Either its lookup is clamped to its column's
  lowest opaque row, or it is painted with the fill's ground; the lab decides which reads better.

Frames: `$SP/p2/mountains/pair-wo/{before,after}/frames/whiteout/` and the sheet `handover-wo/sheets/whiteout.jpg`. The
lab: `lab4/out/wo-bird-check.png` (game / bake / bake without the fill's sun term) and `wo-bird-ring-vs-noring.png` (the
shell alone, no apron).

### 2026-10-05 — Jade River Delta: the terracotta aat-chala temple by the market (the landmarks lane)

The market village's temple in the yard west of the square, north of the village's yard wall: the square brick cella on
its plinth under the curved four-sided roof, the smaller cella and its roof above (eight slopes), the kalasa finial, the
triple-arched front faced with terracotta plaques turned toward the square (a 9 m cella, 2 182 desktop triangles).
Census [6575, 6226, 8252]; every structure, non-tree record and tree where it stood. Pacing (4 seeds) 244/173/150/271 s
against the head's 179/223/160/246 s. Cost: the establishing shot −0.45 ± 0.58 ms and chase −0.88 ± 0.38 (accept); the
temple's view 0.32 ± 0.48, and on its quiet-window re-run 0.02 ± 0.43 (accept); every CPU median within 0.08 ms, no long
task and no program compiled during a slot.

### 2026-10-05 — no lens flare under a closed deck; the ghosts and the halo turned down (the skies lane)

**The gauntlet:** wave 71 on Titan Gorge, "an outright rendering bug (a vertical rainbow chromatic-aberration streak)" —
two vertical bands across the gorge walls, symmetric about the image centre: the arcs of the lens flare's dispersive halo
under a closed deck; wave 65 on Caldera's e-wall-300, "a translucent circular lens-flare artifact sits directly on top of
the mountain silhouette".

**Causes.** The flare's occlusion pass sampled only the scene depth over the sun's disc, and a closed deck reads as sky
there: the visibility stayed 1 under coverage 1 (the deck-sun fix took the disc away, not the flare). On Caldera the sun
stood above the ridge, so the flare was right to draw; the parts laid over the dark ridge read as the artifact — the halo's
ring and the small far ghost.

**The fix** (`lensFlare.ts`, `sunShafts.ts`, `volumetricClouds.ts` `historyTexture`):
- the cloud layer hands its resolved history (alpha: the clouds' transmittance along each view ray, screen uv) to the
  flare's 1 × 1 eased visibility — the centre and four rim taps of the sun's disc, each through smoothstep(0, 0.25, T)
  (`LENS_FLARE_CLOUD_FULL`): a sun behind cirrus that still burns white keeps most of its flare (Redrock's T ≈ 0.09 → 0.30,
  Caldera's ≈ 0.18 → 0.79), a closed deck (T 0 after the opaque cut) takes all of it; the 70 ms easing stays, so a sun
  crossing broken cloud dims and returns smoothly; the shafts' mask takes the same gate per texel (none through a deck,
  rays through a gap); QA knobs `LENS_FLARE_CLOUD_GATE`, `SUN_SHAFT_CLOUD_GATE`;
- each part takes a share (`LENS_FLARE_PARTS`): the ghosts 0.4, the halo 0.25, the streak and the glow at the sun whole.

**Measured** (desktop high, in-page on one build, every frame re-prepared; the flare's contribution = the frame against
the same frame with no flare; `$SP/p2/flare/pair4`): Titan Gorge, the gauntlet's e-wall-300 camera and facing the sun —
pixels the flare lifts by more than 3 levels 32.5 % / 34.1 % → 0.00 %; Caldera's e-wall-300 8.6 % → 0.03 % (the noise
floor), the ring and the ghost gone off the ridge; facing the sun on Caldera 3.3 % → 0.03 %; Saltwind and Redrock facing
the sun keep the glow and the streak (the flare's mean lift halved, 0.16 → 0.08 and 0.15 → 0.07 levels). Receipt:
`lensFlare.selftest` (the twin's closed deck → 0, a veil at the gate's midpoint → half, an edge across the disc → a fifth).

### 2026-10-05 — Highland Reservoir: the valve tower and its footbridge (the landmarks lane)

The basin is closed by its ridges and holds no dam, so the Roer dams' set piece is the one that stands off their walls:
the valve tower in the middle lobe off the west bank, south of the waterworks — a round greywacke tower battered at its
foot, its valve chamber a storey over the bridge's floor with round-headed windows in dressed surrounds, a corbelled
cornice and a slated bell roof — reached by an arched masonry footbridge from the bank (2 495 desktop triangles). Census
[5128, 5058, 5942]; every structure, non-tree record and tree where it stood. The layout brief's solidPropsInWater
exception names it beside the waterworks' manifold and intake. Pacing (4 seeds) 155/280/190/173 s, the head's to the
second. Cost: establishing 0.19 ± 0.42 ms, chase 0.36 ± 0.40 and the tower's view 0.15 ± 0.48, each ambiguous by a hair
(its bound 1.02–1.17 against the change's 7 k triangles and no draws); on their quiet-window re-run establishing −0.01 ±
0.32 (accept), chase −0.49 ± 1.20 and the tower's view 0.04 ± 0.70, both accepted by the integrator's ruling (a mean
under 0.6 ms after the quiet re-run, nothing failed); every CPU median within 0.15 ms, no long task and no program
compiled during a slot.

### 2026-10-05 — the facade craft: every kit's houses finished like real ones (the facades & skyline lane)

The owner, after Verdant: "you already know we need better buildings ... you are capable of making a lot more beautiful
buildings then we have". One shared layer (`maps/regional/facade.ts`, hooks in `house.ts`, `openings.ts`, `weather.ts`,
`geometry.ts`) finishes every regional kit's houses on a desktop build; the kit guide (docs/MAP-LAYOUT-BRIEF.md, "The
facade craft") lists the vocabulary.

- **Every kit:** the rain shadow under the eaves (the top row of the top storey's wall vertices darkened by the
  overhang: no new vertex), two dirt streaks off each sill's ends, gutter hangers, hopper heads, clips and shoes, the
  stacks' oversailing course; on every straw roof the thatcher's stepped eave course and two course lines (Kohima's and
  the Mekong's palm thatch: rows only).
- **Verdant (kolkhoz):** carved nalichniki on most khatas (a crest cut to a gable, an arch or a step, its carved field
  and rosettes, an apron cut to a drop), painted shutters (a border and a diamond or a heart), the painted line over
  the plinth, painted bands round the board surrounds of the others, lime worn to the clay, two or three riders over
  a thatch ridge, hollyhocks; the cowshed's brick piers, dentil cornice, segmental arches and gable vents; the church's
  pilasters, cornice, arched brows and its drum's bands and windows; the club's cornice, water table and hoods; the
  granary's carved gable (prichelina and towel board). The calibration pair read "the same village, finer".
- **Steinburg (franconian):** rendered fronts with Faschen, sandstone string courses and cornices, first-floor hoods,
  door canopies; dormers along the slopes a row shows. **Frontier, Highland Reservoir (Fachwerk):** door canopies,
  sandstone lintels on the stone storeys, dormers on the inns and schools; the dam company's cornice and hoods.
  **Cinder Junction (ruhr):** yellow-brick segmental arches with keystones, dentil cornices, brick piers, gable vents.
  **Saltwind (dalmatian):** limestone quoins on the rendered houses, a string course on the three-storey ones, a
  balconette on half the houses. **Tidegate (polder):** brick arches, the white board gutter cornice, wall anchors.
- **Wave 116** (the critics saw the dressing as no difference at the pairs' framings, and named the reads it could
  reach): Verdant's render is lime-wash brushed over mud plaster (`regionalSurfaces.ts paintLimewash`, named by the
  kit's render tones: "a grey stone-chip texture instead of lime-wash"), the khata's plinth painted a dark clay band;
  Steinburg's stone is dressed (`stone.dressed`: courses of 15-26 cm, soiled; "oversized clean ashlar"), its shops
  have divided lights, transom lights, a panelled stall riser and a fascia ("plate-glass shopfronts"), its rendered
  gables attic windows ("blank gables"); Frontier's church tower is rendered with its corners bare as quoin strips
  ("a church tower brick scaled several times too large"); and every kit's ground storey darkens at its foot, under a
  deeper rain shadow and broader sill streaks ("almost nothing shows weathering or grime where walls meet the ground").
- **Laws** (`facade.selftest.mjs`, 600 builds; 750 more against the PR head's trees): dressing only (the structural
  geometry is the craftless build's byte for byte, so collision and every shard stay), desktop only (a phone's build is
  byte for byte the PR head's), its own stream (the build and look streams draw as often with it). Every map lane's kit
  branch (Sarajevo, Andalusian, Kyushu, Bisbee, Glen Canyon, Navajo, Tselina) merges onto it with the laws holding.
- **Cost** (headless props build against the PR head 5d2461283, wave 116 included; always drawn / shadow casting /
  meshes): Verdant +1.9k (+4.90 %) / +1.6k (+4.35 %) / +2; Steinburg +7.6k (+2.22 %) / +19.5k (+7.34 %) / +1; Frontier
  -1.1k / +0.5k / +1; Cinder Junction +6.5k (+1.99 %) / +9.2k (+2.92 %) / 0; Saltwind +1.9k (+3.00 %) / +1.8k (+3.17 %) /
  +1. The fine dressing (Steinburg +107k, Cinder Junction +47k) is drawn within the fine-detail distance only: on a
  desktop build the metalwork and the main render batch by the 120 m cells like the timber and stone (the metal's batch
  replaces its always-drawn mesh).

### 2026-10-04 — the coast's shelf and swell: turquoise over the sand, deep blue beyond, long waves under the chop (the skies lane)

**The gauntlet's wave 59 on the sea:** "a uniform saturated navy sheet that stays the same deep colour right up to a hard
sand edge, with no shallow-water shelf, wet-sand band or surf" (Saltmere's bay); "one fine, uniform ripple pattern with
no swell or wave-group structure … reads as a wind-ruffled lake" (Saltwind's sea).

**Cause.** The water's colour turned from the shallow tint to the deep body over the mask's own ramp — a few metres at
the waterline — so a bay was deep navy almost to the sand (the gameplay bed is the wading depth everywhere; the depth was
only ever a colour). On the sea, the tiled ripple's relief (strength 1.2–1.6) outweighed the FFT ocean's swell, whose 120 m
waves carry a third of the wind sea's energy at a slope too small to read.

**The fix** (`shallowWater.ts`; a coast with an FFT ocean only — lakes, rivers and marshes keep their own):
- *the shelf:* a shore-distance field (the mask's visible edge chamfered on a grid of at most 512², R8 metres; past the
  square, plus the metres out) stands in for the depth: the body's share of the colour rises as 1 − e^(−d / 25 m) and its
  opacity as 1 − e^(−d / 15 m) from 0.35 at the waterline — turquoise over the sand bed, the bed showing through, the
  deep blue past the shelf (`SEA_SHELF_*`, `SEA_TINT`: the shelf's turquoise 0.6, the deep blue 0.8);
- *the swell:* three long-crested trains (55 m, 48 m and 64 m, 8° apart) beat into wave groups at a slope of 0.08 under
  the FFT chop, fading where a pixel can no longer hold them; the tiled ripple steps back to 0.6 on an FFT sea
  (`SEA_SWELL_*`, `SEA_CLASSIC_NORMAL`).
Set from a sweep of one knob at a time (`$SP/p2/sea/cap4`): a 45 m colour shelf turned Saltmere's whole bay turquoise,
25 m keeps a rim; the deep blue at 0.5 still read teal at Saltwind's grazing view; a swell slope of 0.05 barely read.

**Measured** (the pair: the PR head 6bf0a4c48 against the branch, desktop high; `$SP/p2/sea/pair2`):
- *Saltmere:* the bay's waterline band turns turquoise and clear (a* −8 → −12, L* +8) and grades into the blue body;
  from the bird view a turquoise rim follows the whole shore. The open sea toward the horizon keeps its sky mirror.
- *Saltwind:* the sea seen at grazing turns from teal to blue (hue 215° → 234°, b* −9.6 → −15.8) and the sea beside the
  sun's glitter deeper blue (b* −11.9 → −22.9); long bands of swell read under the chop.
- *GPU* (the old water in-page, on / off / off / on twice): +0.57 / +1.01 and +0.67 / +0.85 ms (p25 / p50) on the two
  sea views with the unprepared first frame in the "on" set; +0.4 to +0.6 ms without it — a texture fetch and three
  cosines a water fragment, within the run-to-run spread on a loaded machine.

### 2026-10-05 — Saltwind Narrows: the campanile (the landmarks lane)

The village's free-standing Venetian campanile, as Rab's, Hvar's and Korcula's stand apart from their churches: on the
bay's axis between the village square and the market crossroads (the map's mirror line, so it stands for both halves),
its door toward the square, 34 m of limestone in string-coursed stages with lesenes up the corners, its openings
multiplying as it rises as on Rab's great tower (slits, a monofora, a bifora a face), the open bell stage with a bifora
on each face, the pyramid inside its balustrade and its cross (3 544 desktop triangles). The planned stone bridge has no
site here (no gully or stream reaches the bay). Census [3038, 2933, 3408]; every structure, non-tree record and tree
where it stood. Pacing (4 seeds) 174/199/211/320 s against the head's 174/309/211/320 s. Cost: the establishing shot
−0.73 ± 0.69 ms and the square's view −0.40 ± 0.45 (accept); chase 0.16 ± 0.85, and on its quiet-window re-run 0.10 ±
0.48, accepted by the integrator's ruling (a mean under 0.6 ms after the quiet re-run, nothing failed); every CPU median
within 0.29 ms, no long task and no program compiled during a slot.

### 2026-10-05 — the sea's second round: a shelf by the coast, deep water that reads deep, glitter over white (the skies lane)

**The gauntlet's wave 78** (held: the water +0.14 for about +0.5 ms): Saltmere's bay "one saturated sky-cyan sheet … no
shallow-to-deep gradation" (the 25 m shelf too narrow to read from 100–300 m up, 45 m flooding the bay); Saltwind's open
channel "one bright aqua-turquoise from the foreground to the horizon"; the glitter "tops out at a dull grey-white that
never clips … a single smooth, soft-edged bloom column instead of a dense field of small, sharp, dancing highlights".

**The fix** (`shallowWater.ts`, the open sea only — lakes, rivers and marshes keep their own):
- *a shelf by the coast:* the shelf's width follows the land's rise within 30 m of the waterline (a beach rises a metre or
  two, a karst coast tens): width = 1.25 / rise slope, 8–60 m, carried from the nearest shore cell (the shore-distance
  field's G channel). The sweep scaled the width in-page: K 2.5 with a 120 m cap turned Saltmere's whole bay turquoise
  again and widened Saltwind's channel shelf, half of it grades the bay from a turquoise belt into deep blue, a third
  leaves a rim (`SEA_SHELF_WIDTH_*`, `SEA_SHELF_BY_COAST`, `SEA_SHELF_WIDTH_SCALE`);
- *deep water:* the deep body darker (0.7 → 0.5) and the sky's mirror taking over later toward the horizon (its grazing
  exponent 1 → 2), so water seen from above shows its body; a bluer deep colour moved nothing visible (`SEA_TINT`,
  `WATER_GRAZE_POW`);
- *glitter:* the sun's lobe sharp on the fine normals — the direct lights take 0.4 of the profile's roughness — while the
  sky's mirror keeps the profile's own, restored between the direct lights and the environment's lookup: one sharp
  roughness for both turned the far chop into white facets over dark troughs under the horizon (its local texture 9 → 23
  levels on Saltmere's edge view; a fade back to the profile's roughness with distance changed nothing, the isolation
  sweep pinned it on the mirror's roughness); the sun's glints capped at 3 apart from the mirror, which keeps 1.15 (a
  joint cap at 3 whitened the far band; `WATER_ROUGH`, `WATER_GLINT_CAP`, `WATER_SPEC_CAP`).

**Measured** (the PR head against the branch, desktop high; `$SP/p2/sea/pair3`, the sweeps `cap5`–`cap9`):
- *Saltwind's glint:* pure-white pixels 0 → 2.2 % of the sun's path, its brightest 0.5 % from 234 to 251 — sparkles that
  clip, in a narrower path of small facets.
- *Saltmere's bay:* the water's a* p10/p90 −9.5/−5.5 → −19.8/−6.3 — a turquoise belt along the sand grading into blue;
  from the bird view a turquoise rim follows the shore and the bay's body stays blue.
- *the water under the camera:* deeper and bluer — Saltwind L* 49.4 → 45.4, b* −9.5 → −16.5 (hue 187° → 195°); Saltmere
  L* 56.3 → 45.9, b* −17.0 → −24.1.
- *the far band:* its texture as the PR head's — Saltwind 4.5–5.9 → 4.7–7.5 levels (local deviation, the 200 rows under
  the horizon), Saltmere 3.4–14.8 → 13.3–16.1 (it was 22.7 with one roughness) — and the sun's path keeps its sparkles.
- *GPU* (the coordinator's rule: in-page, 8 interleaved quartets against a null control, 1920 × 1080 high): the sea's whole change (rounds 1 and 2: the shelf, the swell, the mirror's exponent, the split roughness, the glints' cap) against the PR head's water in-page — the load gate shut past two hours (`$SP/p2/costrule/sea-*`): Saltmere's establishing view +0.11 ± 0.25 ms p50 (+0.13 ± 0.23 p25), the bound +0.60 / +0.58 ms; Saltwind's glint +0.33 ± 0.31 ms p50 (+0.25 ± 0.17 p25), the bound +0.94 / +0.60 ms — both under +1 ms (frames 12.6 and 14.2 ms).

### 2026-10-05 — one wind per battlefield (the skies lane)

**The combat FX lane:** on Verdant the volumetric clouds drifted toward ~205° while the trees and the grass swayed toward
~37° — the cloud layer fell back to a drift derived from the sun's azimuth (+90°) where a map authored none, the
vegetation to its ground profile's prevailing wind, and on most maps the two nearly opposed (smoke follows the clouds, so
a kill's column leaned against the trees' sway).

**One surface wind per map** (`world/sceneWind.ts`, a table every reader can import without a map config): the ocean
block's authored wind (the waves are the most visible wind on a coast), else the ground profile's grass wind, else the
clouds' authored drift un-veered, else the legacy drift un-veered; its speed the ocean's, else 0.6 of the cloud regime's
wind aloft, else 4 m/s. **The clouds' drift is that wind veered 25° with height** (`SCENE_WIND_VEER_DEG`: real winds veer
through the friction layer, a few tens of degrees; they never oppose): the battle's sky preset carries the map's scene
wind beside its cloudscape (main.ts, worldActivationRuntime.ts) and the cloud layer's derivation takes it in place of both
the sun-derived drift and a cloudscape's own (`cloudPresets.ts`). A stub with no map id carries none. Mars drifts as it
did (its authored drift is its scene wind's). Street rows are axial, so a reversed drift turns them only by the
difference modulo 180°.

**Readers:** the clouds read it now; the vegetation sway (`treeClimate.ts`), the grass (`tallGrass.ts`'s profile wind),
the smoke and the ocean read `sceneWindFor(mapId)` as their lanes adopt it. `sceneWind.selftest` re-derives every row from
its sources and pins every map's cloud drift to its surface wind plus the veer (within 45°; the old drift was more than
90° from it on 15 maps).

### 2026-10-05 — the clouds and the land: shadows the size of their clouds, a broken deck's cells and gaps, the far country under the clouds (the skies lane)

**The gauntlet's wave 93.** Clear-sky cumulus cast faint shadows smaller than their clouds; Frosthollow and Railyard
facing the sun in a clear gap, "yet the snow, trees and yard have no shadows, rims or glare"; on Titan Gorge's far rock
under its closed deck "banded, graphic mountain-face shading ... inconsistent with the implied shadowless overcast
light"; blotches on Whiteout's snow. Branch `visual/cloud-land` (the PR head with `visual/mountains-jebels3` and
`visual/deck-structure`).

**A cumulus shadow** (`volumetricClouds.ts`, `cloudPresets.ts`; QA `CLOUD_SHADOW_CORE / _SHIFT / _SOFT`):
- the core takes 0.9 of the beam (was 0.62): a fair-weather cumulus core passes about a tenth of the direct sun; the
  sky's light stays, so on Verdant's 3.76:1 key the ground under a core keeps 34 % of the open ground's light (0.62 kept
  54 %);
- the cut is the visible coverage's (`shadowCoreBand` 0.06 → 0: only the dense core cast one, so every shadow was smaller
  than its cloud), the edge band ±0.04 (was 0.08) straddling the outline;
- measured against the in-page no-shade frame (share of the ground over 10 % darker; median luminance ratio inside):
  Frontier establishing 26 % / 0.83 → 49 % / 0.52, bird 31 % / 0.72 → 41 % / 0.59; Saltwind establishing 2 % / 0.83 →
  25 % / 0.79, bird 19 % / 0.79 → 27 % / 0.59; the chase cameras stand in a shadow (0.51–0.55 → 0.30–0.31). The
  gauntlet's wave 101 (base against c9, one build): no harm, lighting +0.11 — and "nearly every frame has cumulus
  overhead but evenly sunlit land below".
- Every lit material takes the shade (the in-page census: `COT_CLOUD_SHADE` defined and `tCotCloudShade` active on the
  terrain, the grass, tufts and crop cards, the trees and their impostors, the props and every vehicle role, no
  `#undef`); grass pixels shade as the bare ground does (Frontier chase: medians 0.33 and 0.31).
- Why the critics walk past them: the census cameras face 130–146° away from the sun, so the clouds in a frame shade
  land beyond it and the near ground's shadows come from clouds behind the camera (the in-page framing meter: Frontier's
  establishing frame 0 % of its visible clouds' shadows in frame, Saltwind's 6 %, Verdant's — across the sun — 82 %).
  Lifting the cumulus field where its shadow crosses the battlefield (a QA knob, `CLOUD_SHADOW_FRAME`, measured and removed) turned the near
  field into one shadow (Frontier 72 → 95 %, Saltwind 17 → 89 %) that reads as overcast; the lever left is the cells'
  scale (more, smaller patches at the same coverage), Part 2's first experiment.
- A tank in a cloud shadow keeps its light: the vehicle readability floors (`vehicles/materials.ts`) gate on the direct
  light a plate receives, as under a tree (the chase tank's p90 −8 % where the near ground falls 70 %) — the vehicle-look
  lane's calibration.

**A deck with gaps casts its cells** (`lightModelCore.ts resolveDeckClosure`, `lightModel.ts`, `volumetricClouds.ts`):
- the light model's uniform cut of the beam applies by how closed a deck is (smoothstep over coverage 0.95–0.97: Titan
  Gorge and Whiteout whole, Frosthollow 0.86, Foundry 0.88 and Railyard 0.92 none); below it the shade map draws the
  deck's pattern with a thick core (`CLOUD_LAYER_RULES.deckShadowCore` 0.9; QA `DECK_PATTERN 0` restores the uniform
  cut); the exposure keeps the average light;
- a deck's sky gaps are mostly its cells' open borders, which the weather field alone never cut (hold B: Frosthollow
  facing the sun through a gap kept 0 % of its ground lit): the trace's cell factor is one chunk (`CLOUD_CELL_GLSL`) the
  shade map reads too, and the borders the trace draws as clear air (`cellK` < 0.08) cast no shadow;
- measured against the uniform cut (ground below the skyline): Railyard facing the sun 40 % of the ground in sunlit gaps
  (×2.0), the frame ×1.15; Foundry's and Frosthollow's cells 65–84 % of their chase and sunward ground (×0.73–0.88).

**The aerial noise fades under a deck** (`post.ts`, `horizonPanorama.ts`): the aerial pass's world-anchored patchiness
(`cloudShadowAmp`, 0.08–0.22) × (1 − overcast) — none under a closed deck, the panorama's copy alike (Whiteout's
blotches).

**The far rock under a closed deck keeps only the beam** (`maps/horizon.ts resolveHorizonLightingGains`): the vista's
sun term takes the deck's beam share (1 − 0.98 × overcast, below) and the rest returns as sky light (a level face keeps
its light); the ring takes the uniform share, the far range and the panorama the average cut.

**The far country under the clouds** (`horizonPanorama.ts`, `horizonFarRange.ts`): the distant hills never showed the
dappled shadows that best read as cloud shadows. The far country the battle frames show is the panorama shell (the
round-72 range is its fallback until the bake runs), and its atlas held colour only. An aux pass of the bake
(`STRIP_AUX_FRAGMENT`, the strip's own march run with the sun's term on and off, a quarter of the strip: 2048 × 128 half
floats, 2 MB) stores each texel's distance from the eye and the sun's share of its colour (1 − L(no sun) / L(full): the
haze and the sky's light cancel; 0 where the sun's term is 0); the shell rebuilds the far point and dims only that share
through the shared lookup (`cotCloudSun`: inside the shade map's 12 km square, faded at its edge, so 1.5–6 km of the
panorama's 9). Baked on the tier with a shade map only (phones none); freed with the atlas on a GPU suspension and baked
again with it; QA `PANO_CLOUD_SHADE 0`. The fallback range's sun term takes the same lookup. Subtle at 3–6 km behind the
haze, as it should be.

**Overcast reads as overcast** (`lightModel.ts`; the gauntlet's wave 118, both critics: "sand and lawn are bright and
saturated under grey overcast"). Under a deck the photographs put the ground near its own albedo against the sky
(ground/sky 0.13–0.16); the game sat at twice that (Railyard 0.31, Titan Gorge's sand 0.48–0.57), with the hemisphere
carrying 42 % of the clear light. Three scaled laws, all at 1 on the 28 maps without a deck (overcast 0):
- a thick deck passes less glow: the transmission × (1 − `OVERCAST_THICK_CUT` 0.55 × smoothstep(0.5, 1, overcast)) —
  Titan Gorge and Whiteout 0.45, Railyard 0.47, Foundry 0.57, Frosthollow 0.66. With the camera adapting 60 % to the
  horizontal light, ground/sky on screen follows the rendered light: the ground darker, the deck brighter (the lab's
  half-transmission variant: Railyard 0.31 → 0.24, Titan Gorge 0.57 → 0.42, Frosthollow 1.26 → 1.05);
- the grade's linear saturation × (1 − `OVERCAST_SATURATION_CUT` 0.18 × overcast): 1.4 → 1.15 under a closed deck
  (Titan Gorge's sand C* 34 → 26 in the lab; the overcast photographs 8.5–24);
- `OVERCAST_DIRECT_CUT` (and its shared copy) 0.96 → 0.98: with the glow at 0.45 the 4 % of the beam a closed deck
  passed rose from 6 % of Titan Gorge's sun-and-deck light to 11 % (Whiteout 3 → 5 %), the hard shadows of waves 80 and
  82 returning; 2 % keeps the share where it was. A deck with gaps keeps its clear sun in the gaps.
QA knobs of the same names.

### 2026-10-05 — Ironworks as the Völklingen ironworks (the map-revival lane, mr1)

**The `saar` regional kit (`maps/regional/saar.ts`) rebuilds the works in place.**
- *Blast furnaces:* banded shafts over a brick casting house, ore and coke bunkers across the lot's front, skip hoists
  from their pit, Cowper stoves on the back edge.
- *Mills and workshops:* sawtooth halls under north lights.
- *Gas holders:* column-guided, inside the station's wall.
- *Conveyors:* galleries from a receiving hopper to a transfer house.
- *The colliery:* the headframe over its shaft hall, with the winding-engine house behind.
- *The rest:* the works office, and miners' houses (Bergmannshäuser) for the terraces. The Ruhr kit's water towers,
  shells and stacks stay.
- *Footprints:* every builder fills the base's measured reach (`ctx.bounds`): −0.15 to 0.00 m on every side. The one
  exception is the miners' houses' street side, −1.25 to −0.86 m: those are the base's porch canopies and steps.
  The 46 structure records match the PR head's one for one, every footprint centre within 1.4 m (the town-plan
  receipt seats all 46), so no building moved. The census is re-pinned at [3168, 3537, 2061]: the kit's shells add
  122 records and the birch-first stands one tree.
- *Pacing* (20 seeds, 36000–36019): median 180 s, p10 155 s, minimum 143 s, none under 120 s, no timeouts. The PR
  head gives 163 / 149 / 129. The filled works conceal a little more.
- *Layout brief:* holds as on the PR head (sight median 122 m, cover mid share 0.31, no solid in a road or water).
- *Cost* (the A B C C B A gate on the kit and the ground lane's land use against the PR head, 1920 × 1080 High; the
  coordinator's ruling on the pooled cycles): over 16 cycles of two runs (loads 113 and 156) the GPU frame's p25
  increment is +0.09 ± 0.31 ms in the establishing view (bound 0.70 ms) and +0.33 ± 0.26 ms in the chase (bound
  0.85 ms); the second run alone gave the chase +0.03 ± 0.30 ms, CPU p25 within 0.2 ms in both views.

### 2026-10-05 — Blackglass becomes Suzhou Creek: Shanghai in the autumn of 1937 (the map-revival lane, mr1)

**The district stands where PR #9's head (5d2461283) seated it, and Suzhou Creek now runs through it.** The International
Settlement is on the creek's south bank and Zhabei, the Chinese district the Japanese shelled and burnt, on the north.
The map keeps its id (`blackglass`); its name is Suzhou Creek in every catalogue, the roster docs and the manual reference.
- *The creek* (`terrain.marshes`, createMarshChannel): it is 28–29 m of open water, narrowing to about 17 m at its four
  bridges, which carry roads 4 and 5 and the two diagonals. Each deck rests on terrain.ts's bridge stations
  (`crossing: 'bridge'`); the arched spans, parapets and deck collision come from mapKits.ts. The water is soft and wadeable
  (about 0.55 m), so the bridges are preferred routes, not hard chokepoints.
- *The re-siting*: the district replays the head's record (TOWN_PLANS, TOWN_LIGHT_PLANS and the new TOWN_ROW_PLANS for the
  street rows; tools/record-town-plan.mjs). Only what the water reaches changes (props.ts `settlementOverWater`):
  - five landmarks move to the nearest dry seat: the civic hall (16.9, 80.3) → (3.3, 67.8), the needle tower
    (37.9, 100.3) → (39.2, 131.7), a ruin (84.7, 93.0) → (84.5, 81.0), the terrace tower (62.1, 116.3) → (44.4, 178.8)
    and the foundry office (109.1, 109.3) → (99.9, 73.0);
  - three street rows are left out.

  townPlans.selftest holds this record diff. Against the head: 137 structures keep their seats (within 1.9 m), the
  head's 5 carriageway movers stand where the head moved them, the 5 landmarks are off the water and the 3 rows are gone.
  Nothing else moves.
- *The `shanghai` regional kit* (`maps/regional/shanghai*.ts`):
  - the street rows by bank: shikumen lanes behind courtyard walls with granite-framed lacquer gates and carved
    pediments, stepped fire walls and tiger-window dormers; Chinese shophouses with plank shutters, counters, name boards,
    lattice casements, vertical signboards and lanterns (Zhabei's often burnt out); the Settlement's brick blocks with
    sash windows, string courses, crest panels, balconies, folding iron gates, awnings and sandbags;
  - the ruins: shells with their piers and spandrels standing, collapsed houses with a chimney, burnt shophouse frames;
  - a tram depot, brick godowns, a cotton mill with its water tower, a fire station with its watch tower, and a guild
    hall under a swept hip-and-gable roof;
  - the landmarks: the Bund's towers in the skyline kit's deco grammar (Sassoon House's copper pyramid; the stepped
    crowns of Broadway Mansions and the Park Hotel); the Bank of China's green-tiled pyramid; the Customs House's clock
    tower; the Bund's banks (dome, portico or turrets); Zhabei's civic hall as North Station (the skyline kit's
    terminus, damaged, its depth held to the plot); the Joint Trust ("Sihang") warehouse, sandbagged and holed on the
    wall that faced the attack.
- *The street kit* (`maps/shanghaiStreets.ts`): the tram line down the Settlement's avenue (road 2), with its catenary
  and two burnt trams, each clear of every road's core and of the objective ground; sandbagged posts at both ends of
  every bridge; sampans moored in rafts along both banks.
- *The look*: oaks (for the plane trees and camphors), willows and poplars replace the cedars and cypresses. The
  horizon becomes the flat Yangtze delta (`relief: 'coastal'`, panorama `plain`), replacing the volcanic field. The creek
  is a water sheet (`splat.seaLake`) with its own contact profile (waterContact.ts `SUZHOU_CREEK`: silted olive-brown,
  a slow eastward flow) and a calm authored sea state (`ocean`: Hs 0.021 m, the calmest sheet in the fleet).
- *Footprints*: on the map every kit body stands within the base's measured reach on every side, by −0.40 to −0.04 m.
  The one exception is the street rows' front, −1.25 to −0.84 m: the base's porches and canopies reach past the plot's
  street edge, and the rows' fronts stand on it. The shard is regenerated at [2713, 3124, 1492] (colliders 5,064 → 3,124:
  a landmark is a few prisms where a megacity shell was many).
- *Fairness* (tools/map-layout-metrics.mjs, driven metres from each team's anchor):
  - bridges: alpha reaches road 4's bridge first (407 against 503) and bravo the other three (336/571, 332/625, 381/696);
  - zone discs: (−285, 33) on Zhabei's bank, 517 against 487; (34, −50), 490/503; (140, −34), 546/525; the kickoff
    (−97, −7), 457/458;
  - objective symmetry 1.04 (the head's 1.055). Alpha must cross the creek for one disc and bravo for two discs and the
    kickoff, and every disc's routes are within 6 % of each other.

  Every brief band holds except relief (std 3.06 → 2.70 m, under its 3 m band). Blackglass is not on the brief's roster.
- *Fording* (bots on seeds 38000–38002): 6 crossings by the ford and 1 by a bridge; the longest spell in the water was 18 s
  and no tank stayed in it longer than 25 s.
- *Pacing* (20 seeds, 38000–38019, with the kit): median 246 s, p10 185 s, minimum 95 s, one match under 120 s, no
  timeouts. The PR head gives 220 / 145 / 89, with one match under 90 s; the creek alone gave 208 / 168 / 145. The full
  core run (132 matches) passes: median 191 s, p10 148 s, 4 under 120 s, no timeouts; Suzhou Creek's four matches ran
  132 / 387 / 408 / 182 s.
- *Cost* (the A B C C B A gate, the PR head's dist twice against the candidate's, 1920 × 1080 High, the coordinator's
  rules for a loaded machine: the p25 GPU frame's increment, mean + 2 SE under 1 ms, and a CPU bound):
  - the chase passes: GPU p25 −0.10 ± 0.34 ms, CPU p25 +0.01 ± 0.23 ms;
  - the establishing view passes in a quiet window (mean load 36, the median GPU frame's verdict): GPU median −0.07 ±
    0.51 ms (bound 0.95 ms), p25 −0.73 ± 0.38 ms, CPU p25 +0.04 ± 0.02 ms. Under load it had read ambiguous twice: at a
    mean load of 432 (GPU p25 +0.51 ± 0.39 ms) and at 130 (GPU p25 +0.36 ± 0.60 ms).
- *Receipts* that encoded the old district:
  - townPlans holds the record diff;
  - the census is [2713, 3124, 1492];
  - railCoalStockpiles counts Suzhou Creek's bridges and trams;
  - shoreline reads the creek's authored cells as Amberford's;
  - oceanFft counts the twelfth water sheet;
  - horizonRelief reads the coastal relief;
  - matchPlacement's counting field and its independent route grid carry the world's bridge decks, as every
    production caller's height field does. Without them the creek split the map, and four modes found no placement.

### 2026-10-05 — Steinburg's old town becomes a hill town, and the kerb sits on the carriageway (the map-revival lane, mr1)

**The gauntlet's wave 116 read Steinburg's old town as "a too-perfect symmetric hexagon".** Inside the town the plan is
now a hill town's, laid out with the spur's crest. The battlefield outside the town keeps its mirror across the crest.
- *The streets* (urban.ts):
  - the Hauptstrasse (road 0) bends with the crest, within 5 m of the bot planner's z = 0 lattice line;
  - the trade road (road 1) stays within 3 m of x = −50;
  - both run straight through the market square, so its 30 m zone disc stays clear of the street rows;
  - two back lanes behind the street rows (roads 6–9), crooked with the ground and unlike each other (331 and 339 m),
    each meeting the trade road on its way round;
  - four alleys (roads 10–13) at uneven spacing join the lanes to the Hauptstrasse;
  - no alley meets the Hauptstrasse within 100 m west of the market. The network grade solve levels a road 32 m
    either side of each crossing, so a crossing nearer the square left the street's 1.8 m fall to the apron's 14 m
    bank (19 % against the brief's 18 %). The worst grades are now 15.5 / 16.5 / 17.6 % at the three terrain seeds;
  - roadEndpoints.ts joins every lane to the Hauptstrasse.
- *The walls*:
  - the town wall survives in stretches outside the lanes, broken at the four gates and shot out in two places;
  - the castle's ring wall crowns the Burgberg, open to its forecourt on the town side, with the keep, a second tower on
    the ring's south-east corner, and a chapel (a church's 23 m nave spreads past the plot law on the rock's crown);
  - the valley field walls keep their mirror.
- *The objectives*:
  - the market apron turns 6°;
  - the west farm-crossing zone and its apron move onto the crest line (z = 4);
  - objective symmetry goes from 1.07 to 1.03, and the layout brief's solidPropsInRoad exception is gone.
- *Layout metrics* (tools/map-layout-metrics.mjs on the regenerated shard): every band holds, with 4 lanes, chokeMin
  740 and no solid prop in a road.
- *Pacing*:
  - 20 seeds (24000–24019): median 213 s, p10 149 s, minimum 147 s, none under 120 s, no timeouts;
  - the PR head on the same seeds: 247 / 154 / 125;
  - the full core run (132 matches) passes: median 190.8 s, p10 148 s, no timeouts; Steinburg's four ran 147 / 295 /
    149 / 254 s. authoritativeBots passes.
- *The church* (wave 150's close views found it on bare ground): the block fill's fifth plot had set the town church
  outside the town wall, south-east of the town. It is now a planned site on the market square's north side
  (`{ structure: 'church', x: -76, z: 52, yawDeg: 186 }`): the tower and west door face the square, square to the
  apron's turned north edge and 4 m off its paving, since an apron is a road and the brief keeps every solid 3.5 m out
  of a road's core (at 0.9 m it read as solidPropsInRoad 1). The fifth block-fill plot takes a rowhouse. The facades
  lane's churchyard (its yard system, `churchyard: true`, on facades 573445fe5) takes the church's free west or north
  side once it is on the PR head.
- *The census*: the shard is regenerated at [2547, 5429, 2259] (was [2690, 6647, 2254]; [2535, 5616, 2259] before
  the church moved).
- *Pacing with the church on the square* (bbdc84a0e): 20 seeds, median 208 s, p10 173 s, minimum 133 s, none under
  120 s, no timeouts. Every layout band holds (solidPropsInRoad 0, objective symmetry 1.03, 4 lanes).
- *Cost* (capture ticket 8; A the Ruinspires + Suzhou base 0b2ddee00, B d11deb201 with the church at its first seat,
  ABCCBA × 8 at mean load 261, GPU p25 verdict): the chase view accepts, −1.10 ± 0.54 ms; the establishing view is
  ambiguous, +0.45 ± 1.15 ms (bound 2.75 ms), on a lighter scene (716 against 727 draws, 4.83 against 5.12 M
  triangles, stable across a re-stage), CPU +0.02 ± 0.08 ms; it takes one re-run in a quiet window.
- *botRouteClearance*: the Steinburg courtyard case starts in the yard behind the north lane's rows, since the old
  courtyard is gone. Its comment names the receipt's conservatism: the edge-offset containment overstates a rotated
  corner (1.41 times the margin), so a leg passing under one reads short of the clearance it keeps.

**The kerb (props.ts `placeStreetCurbs`, every `curbs: true` map: Steinburg, Ruinspires, Suzhou Creek).**
- *The problem*: the kerb stacked on the terrain (a level slab 0.19 m over the ground at its centre), and the pavement
  was pitched to the terrain 6.35 m out. Where the ground rose behind a street, the pavement stood up to 0.5 m over the
  road (0.9 m on Blackglass's banks): the critics' "town behind a knee-high kerb".
- *The fix*: each piece now reads the carriageway at the kerb's face at both of its ends:
  - the kerb shows a 12 cm face over the road and follows the road's grade;
  - the pavement's inner edge is flush with the kerb's top, and its outer edge climbs toward rising ground by 0.25 m
    at most;
  - both slabs reach down into lower ground instead of floating over it;
  - a piece on a bridge deck's span is left to the bridge's parapets.
- *Render geometry only*: a per-record digest of the three maps against the PR head (terrain 1337, vegetation 2001,
  props 2002):
  - collision records, features, wreck spots, pole placements and grounding receipts are identical;
  - the only mesh that changes is the stone bucket;
  - its removed and added triangles (11,328 / 33,792 / 37,056, 24 per piece) all lie inside the 472 / 1,408 / 1,544
    kerb pieces;
  - the skipped pieces still draw their UV jitter, so every later draw of the dressing stream keeps its seat;
  - the committed collision shards still match the tree.

### 2026-10-05 — Ruinspires as Sarajevo under siege (the map-revival lane, mr1)

**The `sarajevo` regional kit replaces all 14 structure ids the map draws in place, and the street kit
(`extraKits: ['sarajevo']`) lays the boulevard's tram line and the cemeteries.** The kit
(`maps/regional/sarajevo*.ts`) builds Austro-Hungarian blocks (gable or zinc-mansard roofs over firewalls, one in nine
with a collapsed end), Yugoslav infill blocks, mahala houses with doksats and walled gardens, the twin office towers,
the Holiday Inn, the parliament, the newspaper's gutted core, estate and slab towers, the museum and the Vijećnica,
mosques, the Orthodox and Catholic churches, the market hall and the čaršija. It adds shell pocks, UNHCR sheeting and
sandbagged windows. The street kit lays the double track in its bed with the catenary, two burnt trams shoved against
the kerbs and 8 container screens at the crossings, every one clear of the roads' cores (3.9 m from a road's line) and
of the squares' objective ground (yards.ts yardKeepOut: the zone discs, the kickoff and the aprons stay open).
- *Footprints:* every builder fills the base's measured reach (`ctx.bounds`): −0.30 to 0.00 m on every side. The one
  exception is the row houses' street side, −1.25 to −0.85 m: those are the base's shop canopies and balconies, 2.7 to
  3.1 m up, while the fronts stand on the plot's street edge. The 392 structure records match the PR head's one for one,
  every footprint centre within 0.58 m, so no building moved. The census's colliders went from 8,349 to 6,232 (the
  structure shells from 7,158 to 5,040), and the shard is re-pinned at [1933, 6232, 462].
- *Pacing* (20 seeds, 37000–37019): median 325 s, p10 229 s, minimum 190 s, none under 120 s, no timeouts. The PR head
  gives 263 / 183 / 162. The kit's solid bodies conceal more than the base's ragged low ruins did; with 17 screens
  (some on the squares' edges) the median was 447 s.
- *Frame pacing* (one hold at load ~90, single runs, no long tasks in any). PR head, chase / establishing p50/p95/p99:
  Ruinspires 16.9/22.7/32.1 and 16.6/22.1/31.4 ms; Verdant 18.4/31.0/37.8 and 17.1/33.5/49.5 ms. The owner's
  "choppiness" is not Ruinspires' frame pacing on the PR head. The candidate gave 17.5/30.1/40.9 and 16.8/36.3/58.8 ms
  at 682 calls and 2.93 M triangles in the chase (head: 679 and 2.83 M). The A B C C B A ×8 cost gate waits for a quiet
  machine.
- *Cost* (the GPU frame's increment over the PR head; each variant against the head, two pages, 3 × A B B A after a
  chase visit, a quiet window at load 24–31):

  | Variant | Establishing | Chase |
  |---|---|---|
  | the kit, the ground lane's land use and the streets' surfaces | +2.63 ± 0.40 ms | +0.99 ± 0.16 ms |
  | without the streets' surfaces (`pathStyles`) | −0.60 ± 0.32 ms | +0.52 ± 0.53 ms |
  | without the `sarajevo` kits | +1.08 ± 0.72 ms | +0.18 ± 1.52 ms |
  | head and candidate both at `?ground=legacy` (no land use) | −0.62 ± 0.67 ms | +1.17 ± 0.66 ms |

  The increment needs the streets' surfaces and the urban land use together; either alone is within the budget. The
  map ships without its streets' own surfaces (the boulevard's asphalt, the trunks patched, setts on the terrace and
  cross streets: ruinspires.ts keeps them in a comment) until the ground lane's fix. On the A B C C B A gate the chase
  passed (GPU p25 +0.16 ± 0.37 ms); that gate's establishing reading, +11.5 ms with three full worlds in one browser,
  read about +2 ms with two.
- *The streets' surfaces return* (2026-10-06, their own commit, the coordinator's ruling under cost v3): the ground
  lane's three-page staging of the styled paths on this map (A plain, B styled, C plain twin, A B C C B A, holds 61
  and 63, 16 valid cycles at load 129–243, identical scenes: 765 draws / 6.89 M triangles at the establishing shot)
  reads establishing GPU p25 +0.54 ± 0.70 ms and chase −0.44 ± 0.51 ms, CPU flat: both accept. Its in-page toggles
  (hold 58) put the styled roads' whole shader path at −0.16 ± 0.70 ms; the first gate's +2.6 ms was the urban land
  use itself (about +1.5 ms at that shot), which the ground lane's urban fast path takes on. Render only: the shard
  and the census are unchanged.

### 2026-10-06 — the haze's middle distances: less veil at 100–1200 m, the hue shift and the distance cue kept (the skies lane)

**The ground lane's local-contrast attribution** (local contrast: the std of log luminance against its 25 px mean, the
ground below the production frame's skyline, eight bands far to near): the aerial pass was the largest single loss — the
establishing views' middle bands at 0.14–0.28 against the photographs' 0.47–0.54 (Railyard against rail_yard_1), the pass
off +48 to +62 %. Measured on the same frames and metric (`$SP/p2/aerial/lc1`, Railyard, Verdant, Frontier and Foundry
establishing; variants set at runtime on one lab root):
- **The loss is the haze law's in-scatter veil.** The law off (σ → 0, the rest of the pass on) equals the pass off to the
  third decimal (+57.0 against +56.9 %); the world-anchored cloud-shade patches +0.5 %; extinction alone (the target
  black) recovers the same +56 % but takes the distance cue with it (the far third 9–16 L* darker against the near).
- **The middle distances** (`post.ts hazeMiddle`, `AERIAL_MID_*`): the optical depth × w(d), from `AERIAL_MID_W0` at the
  camera to the whole law by `AERIAL_MID_FAR_M` (1200 m — the far ranges, the panorama's bake and the cloud banks keep
  theirs), on the luminance only (`AERIAL_MID_HUE` 1: the hazed colour keeps the law's chromaticity at the lighter veil's
  level). Mean over the four frames: w0 0.4 +16 %; **w0 0.2 +23 %** (Railyard +19, Verdant +26, Frontier +28, Foundry
  +19 %); the distance cue +1.4 L* (kept), the far third's hue shift within 0.3 b* (kept; the optical-depth form without
  the luminance rule shifted it 2.9 b*), the darkest 1 % 7–14 levels deeper (Railyard 61 → 52, Verdant 46 → 32), the
  jitter meter +1.4 points (the pass off +2.55), the far bands unchanged. A global σ × 0.6 gave +15 % and cost the cue
  (−1.3 L*); a dimmer deck target (0.21) +14 % on the deck maps and −4.4 L* of cue.
- Railyard's middle bands 0.23/0.28/0.23 → 0.29/0.35/0.27: part of the way; with the ground lane's own fixes (its
  `allground` factors) the four frames gain +37 % together (Verdant +52 %).
QA knobs of the same names (1 / 1200 / 0: the plain law). Receipt: `hazeLaw.selftest` (the defaults; the function run
through the GLSL subset with the law's own chunk — the plain law at w0 1, less veil near the camera, the whole law from
1200 m, the law's chromaticity on the luminance rule, every branch).

### 2026-10-07 — snow faces: couloirs and ledges on the steep band, the snow maps' wall basis unsheared (the skies lane)

**The gauntlet** (waves 127–128 and the before side of wave 182): Glacier's and Frosthollow's ring faces "a featureless,
vertically smeared grey sheet"; "a smooth grey-white ramp with soft vertical streaks dripping from the crest to the
treeline — no buttresses, strata, ledges or couloirs" (Glacier's establishing view); "grey vertical smears running down its
face from the crest" (Frosthollow's).

**The causes** (`terrain.ts`, the snow-on-rock branch the snow maps' splat selects, `uReduxD.y > 1.5`: Glacier, Frosthollow,
Whiteout):
- *the wall basis sheared by the height:* the strata's stretch and swell multiply the absolute height, so their gradients
  along the wall shear its v by the height itself — about 2 m of v per metre along the wall at 50 m up, 7 at 150 m, 11 at
  250 m. The snow maps' steep ring faces stand 50–390 m up: every wall projection there was squeezed into vertical slivers;
- *the gullies:* one field stretched 8:1 down the height at a 22 m repeat, and a steep face lies wholly inside the hold's
  45–64° band, so the face printed it as fine vertical hatching with a fringe of snow tongues under every crest.

**The fix** (the snow branch only; the hold line stays the ground lane's law, `snowRockHoldLine`):
- the snow maps' walls keep the per-cliff offset and the beds' wander, and no stretch (they carry no strata);
- *couloirs:* the crests of a coarse 3:1 field down the fall line (~25 m across, ~80 m long), only in the systems the slow
  wall field picks; the hold's own breakup at a quarter of its swing; from ~48° a lean to bare rock outside the couloirs;
- *ledges:* snow on the shelves of round 35's warped height ladder (beds ~14–30 m apart, the per-cliff phase, ±2 m of
  along-wall wander), in runs where the slow wall field is high, on the steep band only and gone from the sheerest faces;
- the exposed rock keeps its beds at full strength, so the seams between the ledges stay dark rock.

**Measured:**
- *the pair* (the PR head against the branch; Glacier's establishing, street and hospice views, Frosthollow's
  establishing and bird; `$SP/p2/snow/pair1`): wave 182 +0.34. "Grey vertical smears" leave the after frames' largest
  defects; the after side's are the buildings and the far peaks over a white band (the shell's, the far-air lane).
- *no harm off the snow maps* (Verdant, Titan Gorge, Caldera and Saltwind; Whiteout seen): the frames equal but for the ±1
  dither and the clouds' motion; `snowFaces.selftest` proves the branch selects exactly alpine, whiteout and winter.
- *cost* (v3: Glacier's establishing view, desktop high), re-measured after the merge at nice 0 on a priority ticket
  (2026-10-07; the merged tree with the change reverted against the merged tree, against a twin of the revert; the other
  hulls hidden, with the near-shadow-detail fix; load 102–142): 8 cycles, GPU p25 +0.10 ± 0.29 ms (null −0.10), CPU p50
  +0.00 ± 0.25 ms — ACCEPT; the census identical (4,061,091 triangles, 476 draws). The first holds (13 cycles, GPU p25
  −0.30 ± 0.74 ms, CPU p50 +0.00 ± 0.15 ms; 5,466,742 triangles, 724 draws with the hulls shown) ran niced and are void.

### 2026-10-07 — the ground bounce no longer counts a face's self-shade twice (the skies lane)

**The trace** (the scenery lane's, wave 174; Saltwind's walls "slate blue" in wave 177): Verdant's chalk yard wall cream in
the sun (B/R 0.84) and grey-blue in its shade (87, 95, 99; B/R 1.13) in front of sunlit grass.

**The cause** (`groundBounce.ts`): the bounce's receiver factor read the raw CSM visibility, `mix(0.4, 1, cotSunVis)`. A face
turned from the sun lies in its own shadow (`cotSunVis` ≈ 0), so its bounce took the shadowed receiver's 0.4 on top of the
self-shade the term already applies (`cotSide`, 1 − 0.6 · away · low). It was counted twice, and once the hemisphere's
ground pole is taken off it often reached zero, leaving those faces only the sky's blue light.

**The fix:** the receiver reads `cotAmbVis`, the visibility the ambient dims already correct for facing (`lighting.ts`,
`uCotShadowFacing`). A face toward the sun inside a cast shadow keeps the cascade's 0.4 (its ground is shaded too); a face
turned from the sun keeps its whole bounce. The cost of the rule: a back face that also stands in another object's cast
shadow takes a little too much bounce (the CSM cannot tell the two shadows apart there). The legacy rig reads
`cotAmbVis = cotSunVis`, so it is unchanged.

**Measured:**
- *the look* (the facades lane's r3c fill check, the PR head against the branch on Steinburg and Verdant's wall views):
  shaded walls +1.8–3.9 % and warmer; nothing else moved.
- *cost* (v3: Steinburg's shops-eye, desktop high), re-measured after the merge at nice 0 on a priority ticket (2026-10-07;
  the merged tree with the change reverted against the merged tree, against a twin of the revert; the other hulls hidden,
  with the near-shadow-detail fix; load 100–110): 8 cycles, GPU p25 +0.34 ± 1.14 ms (null −0.17), CPU p50 −0.21 ± 0.12 ms —
  ACCEPT; the census identical (4,326,639 triangles, 414 draws). The first hold (GPU p25 +0.42 ± 1.04 ms, CPU p50
  −0.09 ± 0.17 ms; 4,664,349 triangles, 495 draws with the hulls shown) ran niced and is void.

### 2026-10-09 — the clouds' grain: per-pixel jitter, a longer memory that follows the wind, stills settled to the rest (the clouds lane)

**Why.** The owner: "clouds will look terrible and look super grainy instead of proper". The gauntlet never saw it: every
still settled the clouds 64 frames (four samples a history pixel against the live layer's sixteen), and nobody judged the
sky at 1:1 in play.

**What it was.** A grain meter (`.qa-dev/cloud-grain3.mjs`, in-page: a ~200-sample running average at the same pose as the
reference, dt 0 so nothing drifts, the error read inside the cloud mask from the history's transmittance) and 2× crops of
full-resolution frames at rest and after a camera turn (`.qa-dev/cloud-grain2.mjs`: dt pinned at 1/60 a frame, a frame
every 100 ms) found:
- a speckle at rest along cloud edges, thin parts and fragments, worst on Monsoon's broken front, stronger at rest after a
  turn than during it (the turn's Catmull-Rom reprojection blurs the history; the rest refills it with noisy samples);
- a regular diagonal hatching along thin edges: the trace's jitter was the blue noise of the trace texel, so the sixteen
  history pixels of a 4 × 4 block took one start offset a cycle;
- part of it is the detail octave aliasing at history resolution — the 200-sample reference keeps a little speckle on the
  fragments — so no amount of accumulation alone makes it vanish.

**What changed** (`volumetricClouds.ts`, no new pass): the jitter keys on the history pixel; the floor on a fresh sample's
weight is 0.06 (`CLOUD_HISTORY_MIN_ALPHA`, was 0.12: about thirty-three samples a pixel against sixteen) and the reprojection
is carried by the frame's wind step (`uWindStep`), so the longer memory follows a drifting cloud instead of trailing it; a
capture settles 512 frames (`CLOUD_CAPTURE_SETTLE_FRAMES`, was 64). Measured against the reference: stills −12 to −24 %,
steady rest −6 to −14 % on Monsoon, Verdant, Redrock and Frosthollow, no blur.

**Lessons.**
- A temporally accumulated effect must be judged where a player sees it: at 1:1, at rest and after a turn. A capture settle
  shorter than the live steady state shows a different (grainier) picture than play; a settle longer than it hides the
  motion. The gauntlet's stills now settle to the live rest; motion goes to pinned strips.
- A whole-frame high-pass metric cannot rank grain fixes (all within 2 %): structure swamps the noise. Measure against a
  long-accumulation reference at the same pose, inside the effect's own mask.
- RMSE does not see structure: the per-pixel jitter left the error unchanged and removed the hatching the eye locks onto.
- A smoother composite filter (a B-spline in place of Catmull-Rom) cuts Monsoon's speckle 11 % and blurs crisp cumulus
  (Verdant +15 %, Redrock +14 % against the sharp reference): reconstruction is not where to buy smoothness on this sky.

### 2026-10-06 — Suzhou Creek round 2: the lilong lanes, the walled creek, the delta's flat horizon (the map-revival lane, mr1)

**Wave 149 passed (+0.42). Its critics agree on "a thin scatter of towers and red-brick, red-tile European houses on
bare dirt lots", "clean blue water between bare slopes" and "conifer-covered mountain ridges" for a flat delta.**
- *The lilong lanes* (`props.townRowPlanAdditions`, blackglass.ts `LILONG_BLOCKS`): twelve blocks of three shikumen
  terraces stand on the district's empty lots. Each row is a run of gate houses, 4.9 m apiece behind its court wall
  and 12 m deep; the rows are 4 m apart along their lanes, each row's gates facing the next row's back. A search
  found the lots: every plot dry, 6 m off any road's core, no record inside it, gentle, 72 m off the zones and 90 m
  off the spawns. The rows replay after the recorded rows, from streams of their own, so no recorded building moves.
  A plot is judged against the records' own footprints (a turned box would refuse a block's middle row). 34 of the
  36 rows stand. On Zhabei's bank one row in five is burnt out. A plot of four or more gate houses always builds as
  shikumen (the kit's `rowhouse`).
- *The creek:* the silt water is brown, opaque and duller (waterContact `SUZHOU_CREEK`: the body 0x4a3e2a, roughness
  0.52). Its banks through the city are a granite revetment laid on the bank's own slope, with a coping, mooring posts
  and landing steps (dressing; the slope stays the ground a hull drives). The sampans crowd it: four in five stretches
  hold a raft of up to four.
- *The horizon:* the rim falls from 36 m to a levee's 14 m, and the far country is the plain's least relief (`ampM`
  24, no far rise). The flat, hazy, built-up delta skyline past it is the skies lane's.
- *The granite:* the realistic city tones' third render is a weathered green-grey (hue 0.2), and a map's tones
  override its kit's, so the Customs House read "dark olive". The kit's warm grey now stands on the map. The Bund
  buildings' lit windows (22 % and 18 %, which read by day as "a crude checkerboard of flat white window rectangles")
  are 5 % and 6 %.
- *The tram avenue:* the catenary is held up (a wire runs only between two standing supports one bay apart, and a
  lone pole carries a bracket arm). Three burnt trams stand derailed toward the kerbs, inside the avenue but clear of
  the middle a hull drives (on their tracks one stopped the road crossing sweep's driver short of road 2's causeway);
  the avenue is no rotation of itself, so each takes its own seat. The layout brief counts a wreck a roadblock.
- *The warehouse view* was taken inside the Joint Trust warehouse (the head's parking deck, which the kit already
  builds as the Sihang warehouse). It is re-posed across the creek. The "leopard posts" were its interior columns
  seen from inside.
- *Census* [2747, 3362, 1492]. *Pacing* (20 seeds, 38000–38019): median 338 s, p10 254 s, minimum 162 s, none under
  120 s, no timeouts (round 1: 246 / 185 / 95 s); the lanes' cover lengthens the fights, inside the 3–8 minute band.

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
