# Autumn headland dressing — source-only candidate

Base: `29217600af0e2615549529cb93dc0f3384ef0265`. Not committed, tested,
built, visually accepted, collision-regenerated, or published by this draft.

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
positions. Actual accepted counts and site coverage remain unmeasured.

The existing unfinalized pool matrix is translated in place with its record,
ground-support receipt and obstacle. Pool refitting, intact upload, broken
activation, reset, and spatial indexing consequently consume the same new
pose. No geometry/material/texture/instance owner or per-frame update is
added. Construction-only rows are cleared after composition. Other 29 maps
do not capture rows or run the relocation/ground queries. No performance or
whole-scene placement claim follows from this source inspection.

Required before acceptance: source-executed scatter/crop RNG and donor parity,
actual intact geometry envelope and final collider refit, broken/reset matrix
coherence, negative water/road/building/spawn/entry-gap/clipped-row controls,
unchanged other-map/non-donor output, strict function metrics/types/Doctor,
then actual Autumn headland/context native views. Authoritative collision and
minimap outputs must be regenerated and checked after art acceptance; the old
manifests are not valid proof for moved crushable obstacles. Spotting
vegetation/concealment producers are untouched, but routes through the new
crushable clusters still require gameplay review.

## Verification in progress

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
