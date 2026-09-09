# Verdant scene checkpoint: harvested village approach

> Superseded on 2026-09-08: the user rejected the watershed/pastoral horizon
> prototype after seeing the native capture and explicitly requested the old
> Verdant horizon. Do not resume this redesign. The local prototype checkpoint
> `7997efb42` is not approved for publication. The restoration instead uses the
> original `822daf5fa` (2026-07-27) `buildHorizonRing` geometry and baked palette,
> implemented in `src/world/originalVerdantHorizon.ts`. Historical uploaded
> positions, colours, normals and indices match exactly over three seeds.
> All29 other horizons remain unchanged. Road continuity, objective/spawn
> safety and nighttime-loading fixes continue independently.

## Status and scope

Proposed next checkpoint, recorded 2026-09-08 (America/Los_Angeles). This is
a documentation-only handoff, not an implemented or visually accepted scene.
World of Tanks is the requested whole-environment quality ambition, not an
achieved comparison. Config grading alone does not meet that bar.

Implementation owner:
`/Users/kevinliu/.codex/worktrees/cot-horizon-outland-study-20260908`.
Do not modify the shared checkout, publication worktree, or capture roots to
implement this proposal. The source reviewed for this handoff was study HEAD
`97f8a0382a83d9a864069e6edf8c1fe4ff577312`.

The immediate goal is one readable composition: worked farmland beside retained
green pasture, a restrained village road, and an inhabited village supported by
woodland. Use existing surfaces, material families, instances and collider
locations. Do not broaden this checkpoint to the thirty-map catalog.

The latest Verdant watershed prototype is unreviewed and unaccepted. This
handoff neither approves it nor assumes that it solves terrain or woodland.
See [environment recovery ledger](/Users/kevinliu/.codex/worktrees/cot-horizon-outland-study-20260908/docs/ENVIRONMENT-RECOVERY.md)
for the wider unfinished scope.

## Evidence and comparison boundary

The current-main foundation comparison is now available:

| Capture | Before | After |
| --- | --- | --- |
| Whole scene | [Establishing before](/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/map-render-foundations-before-r1/shots/verdant/establishing.png) | [Establishing after](/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/map-render-foundations-after-r1/shots/verdant/establishing.png) |
| Village material/detail | [Building before](/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/map-render-foundations-before-r1/shots/verdant/building.png) | [Building after](/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/map-render-foundations-after-r1/shots/verdant/building.png) |
| Woodland | [Foliage before](/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/map-render-foundations-before-r1/shots/verdant/foliage.png) | [Foliage after](/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/map-render-foundations-after-r1/shots/verdant/foliage.png) |
| Road approach | [Utility poles before](/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/map-render-foundations-before-r1/shots/verdant/utility-poles.png) | [Utility poles after](/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/map-render-foundations-after-r1/shots/verdant/utility-poles.png) |

The [before report](/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/map-render-foundations-before-r1/report.json)
records clean revision `9b65f4bfa49c62812782362c24d0a1565091f2de`;
the [after report](/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/map-render-foundations-after-r1/report.json)
records clean revision `28d5fd378f1ca89acf80ba274599d9d58e6b2639`.
Both use desktop 1440×900, DPR 1, production mode and
`settled-pinned-map-timing-v6` with 75 samples and three repeats. The after
report names the before shots as `matchedPoseRoot`. These are foundation
captures, not captures of this proposed art checkpoint. This document does
not certify their timing or resource acceptance; the foundation owner must
finish that comparison separately.

Prior inspected study views:

- [R12 establishing](/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/forest-ground-canopy-visual-r12/shots/verdant/establishing.png).
- [R14 establishing](/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/natural-landforms-visual-r14/shots/verdant/establishing.png).
- [Saved WoT Prokhorovka reference](/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/wot-prokhorovka-reference.png).

Observed in R12/R14 and the foundation establishing views: substantial grass
and object detail, but weak large-scale differentiation between worked land,
pasture and village approaches. The village roofs compete with bright foliage;
the road crosses a mostly continuous meadow. The foundation-after building
view still has a conspicuously orange roof and strong masonry grid. This is
an image judgment, not evidence that the current material code lacks detail.
Existing ruts, facade fixtures, ground decals, instance tint and cloud systems
must be reused rather than reintroduced.

The reference's transferable lesson is coherent land use and scale hierarchy,
not simply higher object density or an assumption about WoT's renderer.

## Small coordinated implementation

Start in [Verdant's config](/Users/kevinliu/.codex/worktrees/cot-horizon-outland-study-20260908/src/world/maps/verdant.ts).
Keep the first pass to the four changes below and the grass-acceptance safety
seam described afterward. Reinspect the corrected foundation baseline before
choosing final colors; do not blindly compensate twice for a rendering issue.

### 1. Two worked parcels, with an untreated pasture between them

Use existing `terrain.workedGround`, owned by
[stampWorkedGroundMask](/Users/kevinliu/.codex/worktrees/cot-horizon-outland-study-20260908/src/world/workedGroundMask.ts)
and consumed during `makeMaskTexture` in
[terrain.ts](/Users/kevinliu/.codex/worktrees/cot-horizon-outland-study-20260908/src/world/terrain.ts).

Author two irregular parcels using these existing wall runs as spatial anchors:

- Western L-wall: `(-186,-62) → (-118,-62) → (-118,-14)`.
- Eastern field wall: `(148,-196) → (148,-132)`.

Those coordinates are anchors, not accepted final polygon boundaries. Check
the actual tree, crop and prop locations before drawing the edges; do not
paint a harvested plot through an unrelated grove merely to fill a rectangle.
Keep total changed alpha-mask area below **12,000 m²** for this pilot. Trial
feathers of 8–10 m and strengths of 0.65–0.85 are starting hypotheses only.
Do not add a third village-wide brown wash until these two parcels read well.

The existing function allows at most four polygons, each with 3–24 vertices,
4–24 m feather and normalized strength. It writes only the existing mask A,
skips every pixel with road R or water/landform B already set, and takes the
maximum with existing wear. It does not change height, roads, traction,
vegetation exclusion or water. Preserve those safeguards. An unchanged shader
still receives different wear values, so native texture/filtering and shading
checks remain necessary.

### 2. Matching short ground cover and restrained woodland color

Use small `vegetation.stubblePatches` insets inside the worked parcels; keep
their rectangular feather entirely inside the intended treatment. Initial
`heightScale: 0.25`, feather 6 m is an unaccepted trial. The purpose is to let
worked ground remain visible at chase-camera distance, not remove vegetation
records or create unnaturally bare surfaces.

Use existing `vegetation.palettes` to keep near cards and far canopy geometry
in the same color family. `buildBroadleafCards`, `buildOakFarGeometry`,
`pushTree` and `tintTreeStand` in
[vegetation.ts](/Users/kevinliu/.codex/worktrees/cot-horizon-outland-study-20260908/src/world/vegetation.ts)
already provide the required seams. For oak/poplar/willow, trial near
`cardSat` 0.17 versus default 0.19, far `canopy.sat` 0.24 versus default 0.30,
and `jitterHue` 0.65. Keep luminance unchanged initially. These are neither
accepted values nor instructions to make all species identical. Keep
`jitterHue >= 0.5` if retaining the existing position-keyed dry-tree branch.

No tree repositioning, rescaling, species changes, new atlas, new foliage
material or concealment changes belong in this pass. Do not add `avoid`,
`belts` or `authoredTrees`; those can change physical vegetation and gameplay.

### 3. Keep the road a clear, restrained approach

Use Verdant's existing `splat.roadTint` only after judging the corrected
foundation image. `[1.02,1.00,0.95]` compared with the default
`[1.08,1.04,0.96]` is an unaccepted comparison candidate, not a prescribed
final grade. Preserve the core/rut mask, road width/elevations, normal detail
and movement semantics. The aim is pale packed earth between vegetated
margins, not a new paved road or an unbroken dark stripe.

### 4. Let the existing village detail become the focal point

Use `props.tones.roof` and `props.tones.stone`, already consumed by
`makeRoofTiles` and `makeStone` in
[props.ts](/Users/kevinliu/.codex/worktrees/cot-horizon-outland-study-20260908/src/world/props.ts).
A trial of approximately 20% lower roof saturation and no more than 8% lower
roof lightness is only a hypothesis. Initially preserve plaster luminance and
judge masonry/roof contrast from the building capture. Keep every structure,
entry, fixture, prop and ground decal in place. Do not create per-building
materials or allocate new textures for color variation.

## Grass acceptance safety seam

At the reviewed study revision, `makeTuft` includes `stubbleHeightScale` in
`tuftHeight` before calling `groundCoverBlocked`. A shortened tuft can therefore
pass an obstruction test that rejected its original height, increasing accepted
instances even though the RNG stream and candidate positions are unchanged.
The comment that this is appearance-only does not prove count identity.

For this strict-budget checkpoint, retain the original unshortened height for
`groundCoverBlocked` and apply the stubble height reduction only after the
candidate is accepted. Preserve RNG draw count/order and all original rejection
predicates. Add a focused counterexample where a tall tuft is blocked but the
short tuft would pass; prove the treated path still rejects it. If that seam
cannot be proven safely, omit stubble from the checkpoint rather than quietly
accepting a larger pool. Do not modify this seam during documentation-only work.

## Exact invariants and cost gate

Keep these config values unchanged: `clusterCount:72`, `loneCount:185`,
`rimCount:102`, `grassDensity:1`, `bushCount:1`, `cropFields:7`, all species
mixes, the building plan, tactical beats, wall runs, wrecks and prop counts.
Configured counts alone are not evidence of actual runtime equality.

Require before/after receipts for:

- Exact height, normal, traction/ground type, road-distance/elevation, water,
  no-vegetation, collision, tree transforms and concealment records.
- Exact mask RGB bytes; exact alpha on every preexisting road/water pixel;
  no decrease of existing wear alpha; changes only inside declared feathers.
- Same terrain-mask allocation and policy: 512² RGBA is **1,048,576 bytes**
  desktop; 256² is **262,144 bytes** mobile, excluding unchanged mip overhead.
  Same mip generation, format, color space, filters, wrap and anisotropy.
- Exact grass accepted-record count/order, X/Z, variant and original placement
  RNG result. Only the declared grass vertical scale and palette changes may
  differ; non-treated transforms must be exact. Exact tree/prop instance counts.
- **Zero added** textures, materials, shader variants, texture samples, render
  passes, geometry/instance buffers or steady-frame update work. Same buffer
  byte sizes; no extra retained scratch from the mask stamp. Small config
  descriptors and measured construction-time work are not falsely called zero
  CPU cost.
- Same camera/tier/DPR/quality and destruction state: calls and submitted
  triangles no higher, retained GPU bytes unchanged, and frame/render p95 no
  worse beyond measured paired-baseline variance. Measure construction slice
  cost and opening-drive behavior as well as settled images. Do not certify
  performance from a changed quality tier or one favorable timing sample.

Reuse the production-raster, allocation, deterministic-repeat, road/water and
headless equality pattern from
[workedGroundMask.selftest.mjs](/Users/kevinliu/.codex/worktrees/cot-horizon-outland-study-20260908/src/world/workedGroundMask.selftest.mjs).
Extend coverage for Verdant rather than treating Longleaf's receipt as proof.
Review the existing grass test against current source before relying on its
fixture extraction. Check at desktop/mobile mask sizes and multiple seeds.
Later runtime verification should use the established map/resource tools and
their matched protocols; this handoff ran no builds or native checks.

## Checkpoint acceptance is not full Verdant acceptance

Compare the corrected foundation baseline with the candidate at the same
establishing, village-road, building and foliage poses, then in chase-camera
motion through near/far foliage transitions. Retain the R14 study view as a
separate comparison, not a substitute baseline with different hills. Add a
night readability check before release, preserving existing day/night and
emission behavior.

For this checkpoint, require worked field, retained pasture and village to
read as three coherent connected areas at thumbnail scale. Reject obvious
brown rectangles, harvested soil through unrelated groves, colored forest
bands, LOD color pops or extra foreground clutter. If the composition fails,
revise the two parcel shapes first, not density, light intensity or horizon.

Full Verdant signoff still requires **both**:

1. Credible hills: asymmetric ridges, drainage, saddles and varied slopes;
   neither the current mountain wall nor the smooth/rhythmic lowland studies
   may be declared solved by this ground-and-material pass.
2. Credible shared woodland: consistent close/mid/far tree scale, irregular
   stand structure, slope integration, canopy/ground transitions and stable
   moving/scoped views within the resource budget. Palette changes alone do
   not fix these structural requirements.

Those results must be judged together with the village, road, sky and ground
in actual whole-scene views, followed by matched performance/lifecycle-memory
proof. Do not call the map finished, the full environment accepted or the WoT
bar reached merely because this bounded checkpoint passes.
