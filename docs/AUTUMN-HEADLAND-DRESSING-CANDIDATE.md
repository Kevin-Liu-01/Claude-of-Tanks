# Autumn headland dressing

Source candidate: `550b5e49a`, based on `29217600a`. Accepted as a small
field-edge placement improvement after matched native views and objective /
collision checks. Integrated onto `aa03ceb90`, preserving the newer yielding
material merge. This is not acceptance of the complete environment art pass.

Move existing harvest clutter beside the fields that produced it visually:
at most the first 12 accepted field-scatter bales and first 12 accepted stooks.
Autumn requests 12/14 leaders, with optional partners; those requests are not
an assertion of actual emitted counts. All records, including unused donors,
retain their identity, kind, scale, yaw, slot and original order. There is no
replacement spawn, quota refill or additional RNG draw.

The original scatter and crop construction run in their original order.
Only Autumn records the bale/stook range (not village clutter, sleds or the
separate haystack pool). Actual indexed crop spans supply the row ends;
unreferenced/clipped end vertices cannot qualify a headland. Every third row
can supply one site at each end, offset outward by `2.2m + donor envelope`.
Keep a central 8m entry lane and clearance from every emitted row, treating
internal clipping gaps conservatively as planted. This is a headland staging
pass, not newly authored farm buildings, fences, roads or ground wear.

After all seeded dressing, accept only destinations passing the existing
field-center dry/normal/road/village/spawn checks, expanded road/spawn/village
and building clearance, eight dry footprint samples, all current prop
obstacle/collider bounds, separate vegetation tree-obstacle bounds, and the existing disc-support sampler with <=0.25m
support spread. Footprint clearance uses the actual intact bale/stook shape
envelope, not merely their smaller collision metadata radius. Failed sites
do not mutate a donor; exhausted sites leave remaining donors at their old
positions. The canonical full Autumn world relocates 12 bales and 3 stooks.

The existing unfinalized pool matrix is translated in place with its record,
ground-support receipt and obstacle. Pool refitting, intact upload, broken
activation, reset, and spatial indexing consequently consume the same new
pose. No geometry/material/texture/instance owner or per-frame update is
added. Construction-only rows are cleared after composition. Other 29 maps
do not capture rows or run the relocation/ground queries. No performance or
whole-scene performance claim follows from these resource counts alone.

## Verification

The first actual stage/lifecycle run passed. Review subsequently found that
tree obstacles are joined outside the props builder, so the composer now
checks that separate owner too. Its focused test includes a tree-only refusal
case without mutating tree records. The prior crop-identity fixture needed the
new source-owned row observer binding; its original pixel/RNG/geometry assertions
remain intact. R1/R2 failed receipts are retained, not replaced with a passing
label. R1 also contains an incorrectly named test command, corrected in R2.

The stage test uses all 30 real map configurations on an explicit planar
fixture and Autumn terrain seeds 1337/2025. This is not a full-world donor
census: the scatter RNG starts at the documented stage checkpoint and the
surrounding settlement/vegetation builders do not run in that fixture.

- Focused tests cover RNG / records / pool slots, real intact geometry bounds,
  collider refitting, broken/reset matrices, negative water/road/building/tree/
  spawn/entry/clipped-row cases, and unchanged non-donors / other maps. TS7,
  strict changed-function metrics and production build passed. Doctor had four
  pre-existing warnings; no new warning in the runtime/helper/new test.
- Native Apple/Metal High, 1440×900, DPR1: four exact-camera before/after images
  passed without browser/WebGL errors. Crop and harvest owners, geometry,
  materials, textures, shader count and aggregate renderer residency matched.
  The shown bale is grounded and outside the road. The wide-view improvement
  is subtle; these views do not certify every stook or improve the surrounding
  dark bushes, broad field texture or horizon.
- All 15 actual moved donors clear the eight resolved CTF / zone-control /
  Turbo Ball objective discs, including their full intact envelope plus 0.25m.
  Minimum clearance is 68.96m. Removing those crushables from the placement
  query leaves every resolved objective unchanged.
- Maintained native collision capture regenerated only Autumn and its index
  entry. Decoded parity proves exactly the 15 native donor obstacle poses
  changed; all metadata/order, non-donors, 5811 colliders, 6261 concealers and
  all 29 sibling shards remain exact. Total obstacles remain 6085. Codec,
  loader and dedicated-world tests passed. The first minimap export was only
  220×220 and was held back; a fresh native DPR2 capture preserves the original
  440×440 resolution, independently verified by decoding its WebP. Only Autumn's
  asset cache revision changes. No upscaling is used.
- Twenty construction-stage samples: median 0.600ms, p95 1.392ms, max 2.714ms.
  Rows are released and no render owner is added. This fixture does not include
  the full tree/settlement build. It is not a full-world FPS, heap, tablet or
  no-regression certificate. Live driving across the new groups remains untested.

Local evidence under `environment-recovery-20260907`:
`autumn-headland-checks-r3.HohMvX`,
`autumn-headland-compose-cost-r1.NdYHoa`,
`autumn-headland-native-r1.hML7K8`,
`autumn-headland-objective-overlap-r1.sosyeZ`,
`autumn-headland-collision-r1.vSo2LK`,
`autumn-headland-minimap-r2.T5y61q`.

Integration R1 (`autumn-headland-release-checks-r1.xYWDG9`) passes 15 focused
tests, TS7 and the public build. Its extra full-file minimap Doctor scan flags
the existing trusted-source test harness's `new Function`; that unchanged
code is present in `aa03ceb90`. Changed-scope Doctor across all seven edited
code/test files passes with no new diagnostics. No suppression was added.
Final 440×440 asset/build verification is recorded in
`autumn-headland-release-final-r2.zC6b98`; consult its terminal receipt rather
than interpreting this document as a blanket performance approval.
