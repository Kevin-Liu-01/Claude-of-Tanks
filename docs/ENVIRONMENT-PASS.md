# Environment pass — September 2026

## Objective and visual reference

Upgrade all existing battlefields, ground and mountain materials, horizons,
skies, vegetation and ambient detail; add ten distinct complete battlefields.
Natural shorelines must agree with rendered terrain and driving interaction.
The requested quality reference is the layered, inhabited landscape in
[Cosy Japan](https://x.com/0xpaulius/status/2095627800027820498), with World of
Tanks as an aspirational visual comparison. A numeric test does not prove
visual parity with that game.

## Baseline

Isolated implementation branch: `codex/environment-pass-r1`.
Starting production revision: `da5e0cf0a`.

- Original visual survey: `/private/tmp/cot-environment-baseline/`.
  Its schema-1 timing sampled browser callbacks, including skipped draws, and
  is not valid renderer-throughput evidence.
- All twenty original maps, actual rendered-frame sampling and recorded
  camera poses: `/private/tmp/cot-environment-baseline-v2/` (90 frames,
  three repeats). This exploratory run overlaps host activity and predates
  the shared capture lock; final performance certification must use the lock.
- Production Garage → battle → Garage residency:
  `/private/tmp/cot-environment-resources-baseline.json`.
- Visual defects confirmed: overdriven turf relief, dry-soil normals reaching
  water, bleached leaf-card edges, straight horizon curtains and UV seams,
  disconnected round ponds in river layouts.
- Candidate all-thirty-map capture: `/private/tmp/cot-environment-candidate-v2/`.
  No page errors; timing gates failed on nine maps and the initial blanket
  loose-body-count gate failed on four. These are exploratory results, not
  release approval. Matched follow-ups are in `candidate-v3` and `candidate-v4`
  under the same `/private/tmp/cot-environment-` prefix.
- Serialized pristine timing baseline completed at
  `/private/tmp/cot-environment-baseline-v3/`, with actual rendered frames,
  fixed viewport, three repeats and the shared capture lock. All twenty maps
  rendered without page errors from clean revision `da5e0cf0a`. The new
  placement-receipt quality check does not apply to that unmodified baseline.
- All-thirty-map V5 validation completed at
  `/private/tmp/cot-environment-candidate-v5/`: timing compares with baseline-v3,
  while visual viewpoints are pinned independently to candidate-v2 poses.
  All placement/grounding gates pass and there are no page errors. Performance
  fails on Verdant, Delta and Badlands; no map adds textures or materials.
  This is not release approval: the visual/terrain review below found further
  defects, and the three timing failures still require controlled comparison.
- V6 targeted rendered checks completed at
  `/private/tmp/cot-environment-candidate-v6/` for Fjord, winter, Autumn,
  Polders, Mangrove and Monsoon. All six maps report six successful sourced
  texture receipts, no page errors, and passing placement gates. This run
  has no timing-baseline comparison and is not a performance approval.
  Matched shots remain unchanged; `water-current` is separate evidence at a
  current-height camera, and each pose now records terrain clearance.
  Four-quadrant views expose all sides of the alpine ranges.
- Water roughness A/B completed at `/private/tmp/cot-water-gloss-v7/` for
  Autumn and coastal. The 0.22 liquid roughness floor replaces the broad
  0.54 satin response: matched Autumn close-ups show a tighter sun highlight
  and darker off-highlight water. Frozen ice retains its previous floor.
  These short, source-development captures are visual evidence only.
- V8 seven-map and V9 nine-map native visual checks are retained at
  `/private/tmp/cot-environment-candidate-v8/` and
  `/private/tmp/cot-environment-candidate-v9/`. V9 has no page errors, but
  uses only 30 frames and one repeat: it is not a performance certificate.
  Review confirms irregular smaller snowdrifts, golden separated crop rows,
  blue-green Oasis water and less wall-like alpine/mesa profiles. Skybridge
  remains deliberately stylized; its broad angular mesas are an improvement
  over the previous thin spires, not evidence of photorealism. Final native-4K
  review initially rejected their narrow triangular summit profiles.
  V12/V14 now confirm finite-area caps on Skybridge only, with unchanged
  horizon vertex/index, texture and random-sampling budgets. Unsupported wet
  rail segments are omitted at construction, preserving dry geometry and
  subsequent RNG exactly; three-seed washout coverage and V14 agree.
- A strict pristine production eviction sweep of all twenty original maps
  three times is recorded at
  `/private/tmp/cot-environment-client-residency-pristine20.json`.
  All 58 expected evictions occur and no browser/resource errors occur, but
  the memory gate FAILS: each measured repeat retains another 260 GPU
  textures, about 375 MiB of managed heap and 1,811 MiB of backing storage.
  This is a valid failed baseline, not acceptable warm-up. Candidate cleanup
  must independently demonstrate a bounded plateau before release.

## Implementation and required evidence

| Requirement | Implementation | Completion evidence still required |
| --- | --- | --- |
| Ground/material quality | Bounded normal relief and separation of soil/water | Matched near, mid and grazing captures across biomes |
| Natural bodies of water | Shared seeded concave shoreline; connected river stations | Overhead and bank views; drive/query alignment; regenerated collision/minimaps |
| Mountains and horizon | Closed UV seam, redistributed radial topology, smooth normals, coastal opening | All-map skyline review, no gaps or planar wall bands |
| Sky and atmosphere | Coherent periodic cloud bake and lower cloud bank | Stable pan and horizon captures on desktop/mobile |
| Vegetation | Matte diffuse-only leaf wrap; compensated bark albedo; coherent snow caps and a smooth strip within the existing atlas | Matched Verdant/winter review passes; all-biome/LOD/motion and resource checks remain |
| Ambient detail | Existing inhabited prop vocabulary plus eight biome sound profiles | Native Chrome audio passes eight profiles: pre-limiter peak 0.198–0.348, RMS 0.031–0.046, exact silence after teardown. Subjective listening remains unverified; WAVs and report are in `/private/tmp/cot-ambient-native/` |
| Ten complete new maps | Polders, Copper Mesa, Airfield, Oasis, Whiteout, Orchard, Longleaf, Mangrove, Saltwind, Reservoir | Render each; traverse routes; verify spawns/cover, selection/random, server and assets |
| No performance regression | Same-size texture families, smaller horizon geometry, no extra terrain samplers | Matched all-map timing, worst-frame and constrained-device results |
| No memory regression | Explicit shader-only terrain/horizon/prop texture ownership; all CSM-registered prop materials tracked; per-map server JSON and bounded terrain ownership | Final thirty-map server sweep has zero repeated ArrayBuffer growth and 3,176 bytes heap growth; native client phase/eviction plateau remains required |
| Public readiness | Generated previews, minimaps, collision manifest, metadata | Typecheck/build/tests; no missing resources; push verified |

This is a work ledger. The objective remains active until the requirements
above have direct current-state evidence; source changes alone are incomplete.

## Findings from the all-map rendered review

- Interpolated horizon rows could cross radially. The corrected bounded
  interpolation retains the exact geometry budget; a second macro-profile
  pass replaces one continuous rising wall with separated crests and saddles.
  V4 confirms improved depth, but also exposes treeline ribbons bridging
  different skyline ranges. Cross-range connections are now omitted without
  adding geometry; V5 confirms that the airborne bridging strips are gone.
- Grass cards used identical straight-up normals. A shallow directional fan
  now varies shading within the existing normal buffers; palette, dimensions,
  placement stream, materials and shader cost are unchanged.
- New biome IDs fell back to the sourced Verdant texture plan, overriding
  snow/sand authoring with grass. Explicit existing terrain/building palette
  selection and inherited grass-tone hooks now cover all ten new maps.
- Lightweight timber/metal structures had overdriven Sobel normal strength.
  V4 confirms corrugated sheds no longer alternate black and white. Neutral
  albedo textures and their 128-square dimensions are unchanged. The separate
  charred-looking timber palette has been lifted to weathered wood; its new
  rendered review is still pending.
- Tactical structures outside the village could intersect trees because
  vegetation was built first. Construction-only crown/lean/structure-envelope
  compaction now removes matching visuals, spotting and collision together,
  without spending more placement attempts or changing the random stream.
- Liquid marsh materials were draped over hills. A bounded construction-time
  plane policy now supports shared river levels and horizontal ponds. Focused
  wet-mask, dry-ford and grade tests pass (3,039 water samples). A small spatial
  index bounds the expanded river-station queries; exact construction timings
  remain mixed under host variance, so this is not a blanket performance pass.
  Polders and Mangrove use explicitly leveled channel reaches. The Airfield now
  stamps a 36-by-760-metre graded paved strip into the existing road grids,
  with full-width/corner checks and no extra texture or live-query branch.
- Fifty loose physics bodies was not a meaningful universal decoration target:
  maps author roadside sites, each with one or two loose objects. The audit now
  requires actual construction receipts, at least 85% authored-site placement
  and five distinct loose kinds, retaining independent building, destructible,
  wreck and grounding floors. This does not prove equivalence for Fjord's
  observed 66-to-49 total-body change; final placement/render review is required.
- V5 reveals remaining Fjord/winter near-horizon curtains: the buried seam's
  outer skirt, deliberately unchanged in the earlier pass, rises too abruptly.
  V6 confirms a lower, recessed skirt and separated passes. It still shows
  stretched cliff detail: altitude-only V coordinates collapse at crests and
  saddles. Alpine atlas color is now altitude-only biome tint, while texture
  uses the existing world-triplanar samples with fewer fetches. V9 exposed a
  second independent cause in postprocessing: the single oblique projection
  becomes nearly singular on east/north-facing cliffs (measured condition
  number above 10,000). An arcade-only bypass was tested as a diagnostic;
  it is not the final behavior. V11 uses a
  continuous four-corner world-volume noise field, preserving the original
  detail weights, chroma and amplitude. Four arcade quadrants and four actual
  x8 authored scope probes show useful detail without directional fibers or
  obvious noise seams. The scene budget is unchanged; arcade skips its
  zero-weight finest octave (12 hashes rather than 16), scope retains 16.
  Extra ranking arithmetic still requires matched performance measurement.
  Magnified pale ridge bands and broad faceted silhouettes remain limitations,
  not a claim of photorealistic mountains.
- Independent lake-bank probes found 224.5% maximum grade on Polders and
  195.8% on Mangrove. The original liquid test sampled only marshes, silently
  skipping both lake-based maps. Adaptive liquid-lake banks now pass 15,066
  wet samples across two seeds (maximum sampled grade 0.396), including
  explicit nonzero lake coverage and harbor-frontage checks. V6 confirms the
  softer banks; frozen sheets do not use this policy.
- Amberford's river previously contained disconnected pond links. Its
  52-station channel now overlaps between the three preserved dry fords;
  V6 overhead evidence confirms continuous reaches.
- Water's painted foam strokes were also reused as height, producing embossed
  scratches at near and macro scales. Pigment-independent shallow waves now
  reuse the same two 256-square textures, omit the intermediate painting
  canvas, and keep ice's crack/pressure response unchanged. Pixel tests pass;
  V6 confirms that the bright engraved scratches are gone. The pixel test
  checks generated CPU pixels, not native upload or complete fragment shading.
- Authoring capture did not await the already-exposed sourced-texture promise.
  Capture-only readiness, strict scene-minimap receipts, and native-4K source
  guards now pass focused tests and V6 native sourced-texture checks. Public
  assets are still pending final terrain/configuration freeze.
- The new Oasis, Polders, Mangrove and Reservoir water cells now form distinct
  hooked/branching reaches or irregular engineered compartments. V8 overheads
  are accepted for layout. Polders has five leveled retention compartments,
  not one continuously connected canal; Reservoir is a lobed upland basin,
  not a narrow tributary network. Product copy reflects those distinctions.
- V6 Polders exposed crop rows crossing wet banks. Segment-level support and
  wet-ground rejection now preserve the placement random stream while
  reducing geometry where clipped. V9 also confirms that the revised atlas
  no longer creates dense pale crop walls; atlas size and paint RNG are fixed.
- Skybridge's mesa mask previously occupied the same blue channel required
  for water, preventing liquid gameplay coverage from rendering. Water/ice
  now take priority over optional landform rock gating; geometric slope still
  controls rock. Overlapping automatic lake levels share a flat outlet and
  V9 confirms visible continuous liquid. A later road-edge detail pass was
  also deforming fully wet ground; canonical wet coverage now suppresses that
  detail without a second contour traversal. Strict 18-metre road-exclusion
  tests retain 482 exact flat-join checks rather than widening the exclusion.
- Old snowdrifts were flattened spheres, producing pale oval stickers. A
  deterministic irregular 97-vertex drift meets the ground and buries its
  perimeter, reducing each drift from 432 to 168 triangles. V9 winter
  screenshots confirm the outline improvement without another material.
- Native repeated-world testing found shader callback closures hid ten
  terrain textures and prop grime from ordinary material traversal. Empty
  prop buckets also left CSM-registered materials unowned. Explicit ownership
  now covers those existing resources, with actual builder/CSM tests for
  sourced swaps, preservation, suspension, resumption and final eviction.
  These tests verify disposal events, not a native memory plateau by themselves.
- The same audit identified shader-only canopy detail, off-tree grass LOD
  geometries and custom shadow materials. Vegetation now declares those
  existing resources to its owner; all thirty species configurations have
  suspension/LOD/final-eviction coverage. Engine-owned shared shadow resources
  are deliberately excluded.
- The destruction callback registry retained one props closure per visited
  map even after GPU disposal. Completed world assembly now registers its
  callbacks and returns an identity-safe disposer, invoked only at final cache
  eviction. Thirty-map coordinator tests confirm the global dispatcher inspects
  only the two resident maps; disposing an old same-ID build cannot remove its
  replacement. Temporary dormancy keeps the reusable world's bindings.
- The six-map candidate preflight retains stable textures but fails three
  strict repeat checks: managed heap on Verdant/Coastal, and one additional
  GPU geometry on Monsoon. Native diagnostic evidence at
  `/private/tmp/cot-environment-client-residency-candidate6-diagnostic-r1.json`
  exhausts eligible terrain LOD jobs before capture. All GPU geometry,
  texture, program, backing-storage and embedder checks then pass. Two managed
  heap checks still fail (+1,701,048 and +1,844,868 bytes); they are not waived.
  Two native heap snapshots retain exactly two world roots and unchanged
  closure counts. Their code nodes grow 2,349,788 bytes, primarily compiled
  instruction streams; ordinary object self-size grows 31,488 bytes.
  The snapshot and CDP heap measures differ, so code is not subtracted to
  manufacture a pass. The default-protocol twenty-map retry now completes
  all sixty checkpoints in
  `/private/tmp/cot-environment-client-residency-candidate20-r2.json`:
  all repeated managed/backing/embedder heap, texture and program gates pass;
  full-cycle renderer counts stay at 847 geometries, 297 textures and 216
  programs. Five per-map geometry repeat gates still fail by 1–4 geometries
  while eligible terrain LOD jobs are progressing. Delta/Badlands also retain
  one additional program versus pristine; its exact owner remains under
  investigation. The first attempt ended on a detached browser frame after
  33/60 checkpoints and remains explicitly incomplete, not a pass.
  A new acquisition protocol drains only the existing production countdown
  lookahead queue, verifies unchanged topology after real rendered frames,
  and rejects comparisons to the old wall-time protocol. Fresh matched
  pristine/candidate runs are required; no thresholds were increased.
- Alpine's final 4K image exposes repeating road-edge scallops. The old
  1.1-metre mask transition and sub-metre grass seam are narrower than the
  existing 2–4-metre mask texels. A construction-only low-pass now preserves
  the same texture dimensions and shader fetch count, and all mask channels
  sample actual pixel centres. Seventy-two quantized/bilinear bearing checks
  bound edge variation and reject alternating holes down the road centre.
  Native V12 Alpine review confirms both defects are visibly removed, with
  readable road widths/routes. An independent critic agrees; no texture-size
  increase is used.
- Whiteout's sparse vegetation declared only two archetypes, failing the
  existing three-species quality gate. Low-weight fir placements now join
  spruce and birch without increasing placement counts. Its fresh collision
  shard retains 1,449 obstacles, 1,267 colliders and 805 concealers. The narrow
  generator refresh preserves all 29 sibling shard bytes/entries exactly;
  the full index checksum is `563a5562ed5b79d1ef92500af1960ae2b7b5847330519aabd6e8a4a8d1e46c9c`.
  Public artwork still needs the final all-map refresh.
- The first complete core-suite run reaches the authoritative pacing gate
  but fails with 23/120 time-limit results (the unchanged ceiling is 12.5%).
  Nine are on the new ten maps, including three on Polders and two each on
  Airfield/Whiteout. The canonical eighty-case pristine run passes exactly
  at its ceiling (10/80), versus 14/80 on the candidate's original maps.
  Initial exact-seed Polders/Airfield failure replays show kilometres of bot
  movement and ammunition exhaustion, not persistent collider wedges.
  Actual Airfield traces expose clear eye-to-eye visibility but a muzzle
  below the intervening crest. Bots now check a nominal ballistic lane at
  their existing LOS cadence and reuse relocation when blocked; sampled aim
  error and dispersion are not filtered. Three exact failed seeds now finish
  naturally, while three other inspected seeds still cap. The full canonical
  120-seed rerun now passes: median 434.8 s, p10 282.0 s, no sub-120 s
  results and 14/120 timeouts against the unchanged maximum of 15. Original
  maps have 9/80 caps; new maps have 5/40. Urban still caps in all four seeds:
  that unresolved route behavior is not hidden by relaxing exact collision.
  No pacing threshold or global vehicle/AI stat changed to hide failure.
- The remaining core suite found missing exact loading-screen coverage for
  the ten new maps. Maps without a curated action still now use their own
  native 4K overview and canonical name. Existing owner-selected featured
  galleries/rotation stay unchanged. Loading-screen tests and the remaining
  core tail pass after the fix; the complete core run still awaits pacing.
- Caldera's exposure review identified an actual phase-lighting regression:
  disabling the Garage sun trim restored the selected workshop's preset over
  the active battlefield. Distinct Garage/battle preset ports now preserve
  each live map's sun and fill in battle, Studio and captures. Tests exercise
  different workshop/battle maps, map switches, missing world rejection and
  exact Garage return. A Garage sky override also invalidates only visible
  atmosphere state, so re-entering the same cached map restores its sky/fog
  without rebuilding the already-resident PMREM. Focused lifecycle tests and
  typecheck pass. Native V14 Caldera and Skybridge receipts confirm their
  actual CSM sun color/intensity, exposure and intended bounce fill. Caldera's
  separate authored terrain lift was also being dropped at the sourced-texture
  hookup; exact RGBA tests now cover the live swap and cache reuse. Native V15
  confirms the intended low-key volcanic grade without a larger texture or
  extra shader sample. Deep basin shadows remain deliberately dark, not a
  claim of uniform ground-level visibility.

- The changed-file React Doctor recheck retains its earlier 49/100 score
  (62 files inspected). Exit 1 is preserved: two test-only source-extraction
  `new Function` findings and two sequential-test `await` warnings. The
  extracted text is repository-owned HUD/placement code, not user input;
  ordered world builds deliberately test eviction, and sourced-layer awaits
  keep test receipts isolated. No production eval or scanner suppression was
  introduced. Focused changed-module complexity and typecheck pass.

## Integration notes

- All thirty IDs are present in canonical catalogs, random battle, private
  room selection, ranked rotation, shot views, and lightweight preview metadata.
- New industrial/dry settings reuse existing clutter palettes and budgets.
- Alpha deployment faces the opposing deployment centroid, not whichever
  enemy pad happens to be array element zero. The authority regression checks
  this independently and verifies that pad ordering does not change yaw.
- Server manifests are generated into `server/world-collision-manifests/`.
  Loaders verify byte length, checksum, shape and census before inflation.
  Active matches share immutable terrain but keep mutable collision records
  separate; removal, expiry, close and constructor failure release leases.
- Final thirty-map export verifies all ordered IDs, checksums, bytes and
  census: 132,035 obstacles, 131,999 colliders and
  119,022 concealers. Original-map serialized shapes are larger than the
  retained legacy file because that file predates the inherited runtime
  structure-profile change (`cea661b54` / `34ca7d133`). For example, Urban's
  unchanged 2,300 structure records contain 32,538 convex parts rather than
  7,755. This stale file is not a matched environment-cost baseline; the
  regenerated data intentionally matches current runtime collision geometry.
- An exact primitive dictionary reduces the thirty-map shards from 47,861,896
  to 36,937,165 bytes without changing points, precision or collider behavior
  (36,937,163 after the two-byte Whiteout species refresh).
  All thirty decode round trips match, malformed references are rejected and
  mutable match shapes remain independent. Six balanced pairs of fresh Node
  processes measure cold-loader median 296.45 → 278.45 ms (OS file caches not
  flushed), and retained fixture heap 7,420,884 → 6,154,800 bytes. The receipt
  is `/private/tmp/cot-collision-codec-benchmark-final.json`.
- The legacy 27,572,252-byte monolithic manifest was removed after the final
  thirty-map loader/collision/lifecycle checks passed. It remains recoverable
  from Git. The retired `--migrate` option now fails before browser access or
  publishing; future captures write the current per-map encoding.
- All thirty minimaps were regenerated successfully from current native
  scene captures. The bake now participates in the shared capture lock and
  validates the exposed active world and exact fresh capture receipt.
  All thirty native-4K hero sources, 4K WebP heroes and 512×288 thumbnails
  were generated and visually reviewed. The cache tag is `north-up-v6`.
  Final road-mask/configuration/phase-lighting corrections require refreshed
  public images. Skybridge, Caldera and Alpine native rechecks now pass the
  bounded issues identified above; all-map production refresh remains open.
