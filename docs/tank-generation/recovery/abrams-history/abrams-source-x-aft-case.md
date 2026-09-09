# Abrams X aft case: bounded source77 reconstruction

2026-09-07. This packet records a local shape repair, not full-model or release
qualification. The independent 14-view rejection in
`abrams-source-x-visual-review.md` remains a separate immutable checkpoint.

The authoritative loose OBJ has SHA-256
`85c33cee1ec041cbc3b5453841a6a006c8f1f866365a7a16c078bad3d630bd29`.
Its fixed canonical frame is `[-rawX, rawY + .203945, .357965 - rawZ]` in metres.
Source77 is the right aft case; source79 is the different mast-support case.
Source group names, not a new fitted mask, establish this distinction.

## Shape and construction

The replaced case was a whole-group bounding box plus a full-width lid. That
filled space over a real sloping shoulder and low deck. The first checkpoint
constructed 13 closed stocks from a small set of measured design planes:
sloping lower body, low deck, front bevel and folded lip, waist flange, separate
shoulder return, narrow cap and two attached folded latch pairs. It contains no
source vertex, index or external-mesh loading data. The final helper retains
those 13 stocks and adds two actual source77 raised end walls and 14 individual
source83 louvers: **29 closed parts**, not a replacement cover-sized slab.

The body floor is Y1.920805, axial stock Z−2.733115…−2.303115, and the exposed
deck is Y2.431285. The high cap is restricted to approximately X.629410… .871180,
with top Y2.536435. The thin return remains above genuine open space; it is not
combined with the body into one filled convex outline. Original fine rounded
latch tooling is approximated with closed planar stock. Sub-micrometre axial
plane drift is flattened, not claimed as a copied surface.

## Independent checks

`src/vehicles/abramsSourceXAftCase.selftest.mjs` checks all 29 solids for finite,
non-degenerate, outward triangles and exactly paired closed edges: **352 faces**.
It retains the original 22 independently measured FrontSide surfaces, 15 finite
empty-shoulder/fold rays, and positive physical lap between each latch and its
foot. The stock surface tolerance is 0.2 mm; this is not a silhouette tolerance.

It additionally checks both source77 raised end crowns, separate source83 first
surfaces, the real under-louver cavity, and **27 positive blade-end contacts**:
each of the 14 blades seats into the rear wall; the 13 full-length blades also
seat into the front wall. Both raised walls physically lap the original
permanent shoulder.

After normal profile integration, all seven actual IDs in high and low quality
passed the focused complete-visible-scene check at three yaw/pitch combinations
(14 instances, **42 poses**). Exposed deck/cap/louver first hits remain permanent
`turretEquipment`, move with turret yaw, and are unaffected by main-gun pitch.
The former upper box/lid air and the under-louver cavity remain clear. These
checks use geometry-only
materials for Node execution, not the geometry-receipt exclusion path.

## Separate source83 louvers and their real receivers

The complete source does **not** hit source77 first everywhere on the slope.
At Z−2.52, X.25 first hits source83 at Y2.342820956, above source77's
Y2.291013855. X.4 first hits source83 at Y2.437892227, above source77's
Y2.402668241. Therefore the isolated source77 crowns at these two stations are
not asserted as complete-scene crowns. The actual first-surface checks use the
separate source83 louvers at X.25/.4 and exposed source77 at X.556/.75/.90.

Complete-source axial rays confirmed the attachment, which cannot be inferred
from a mid-section alone: source77 rear wall occupies Z−2.733114958…−2.727174997
(5.940 mm); the front wall occupies approximately Z−2.309295…−2.303202
(6.09 mm). Their upper edges rise approximately54.8 mm above the inner shoulder.
The independently authored closed walls preserve the cavity between them.
The blades overlap the receiving walls by about0.12 mm at their ends.

There are 13 full-length418.12 mm blades and one238.01 mm rear-seated blade.
The supplied blades have only three long faces, so the native solids explicitly
close their axial ends and narrow trailing edges. A common37.45 mm tangent
span and approximately28-degree fold approximate the small source tooling
variation; source83 remains tagged separately from source77. The first short
blade has its measured approximately26-degree fold.

Remaining fine-detail limits are explicit: the source83 low-end bent tab
(approximately47×62×6 mm) is not reproduced; its omission does not substitute
for a missing blade seat, since the short blade is genuinely rear-seated.
Fine latch rounding, sub-millimetre louver-edge variations and tiny axial plane
drift are simplified. These are limitations, not waived whole-model gate
failures or a claim that every source fitting has been reproduced.

Local scalar evidence is retained under ignored `.qa-dev/reports/` in
`abrams-rear-form-returns.json`, `abrams-case-section.json` and
`abrams-case-receivers-probe.json`. The analysis-only section data is not a
runtime construction input or a redistributable source payload.

