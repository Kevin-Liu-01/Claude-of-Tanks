# Type 90 X — independent authoring packet

2026-09-06. Source-proportion revision passes the scoped visual and geometry
gates; the mandatory final anatomy/asset/release chain remains outstanding.
Runtime is `src/vehicles/profiles/type90X.ts`. It authors original closed
parametric armor, independently supported native wheels/links, recoil-owned
circular cannon and separate equipment; no previous tank builder, source
vertex/index arrays, rig, texture or source buffer is shipped.

## Primary dimensions and preserved conflicting source

The [JGSDF 7th Division table](https://www.mod.go.jp/gsdf/nae/7d/siryoukan.html)
gives nominal 9.80×3.40×2.30 m. The more precise
[73rd Regiment 2025 calendar](https://www.mod.go.jp/gsdf/nae/7d/hensei/team/73/karenda/carenda2025.pdf)
prints 9.76×3.34×2.34 m. The root-approved first draft retains the nominal
9.80 m overall, 3.40 m width and 2.30 m structural roof; those two primary
publications are not falsely presented as identical exact measurements.

Owner-supplied `type_90_kyu-maru_japan.glb` SHA-256:
`d47c9446d82e511922c92244c375afca7701b9202ff11d601197e3a898adeaac`.
Ignored root-authored canonical oracle
`public/models/community-candidates/type90_x_source.glb` SHA-256:
`b049dc04744e4bc918dbdd41d59f54d2d05a502084c58b913d777e5c2af92170`.
Raw forward is +X; canonical axes are [-Z,Y,X], uniform scale
0.1083596770099818 and translation [0.00000172794,0.00000197300,0.15699306157].
No nonlinear shape correction is applied to this source.

At that official-length anchor the source is 3.61781384 m wide, and its main
turret roof is approximately 2.45947 m high. Both are substantially larger
than either primary physical anchor. The original authored armor uses the
approved physical dimensions rather than claiming this supplied aspect ratio
is perfectly accurate. Source longitudinal landmarks and independent round
wheel/gun dimensions remain explicit; body-height differences cannot be
concealed by changing oracle axes, source masks or candidate normalization.
The unchanged source's highest whip is Y4.657996, separate from roof height.

## Ownership and physical construction

`mesh_308_mat_57_0` fuses body, turret, main gun, wheels and equipment into one
material mesh. `mesh_309_mat_56_0` is track skin only. Neither provides complete
independent hull/turret/gun components; their component metrics must remain
N/A. Complete whole-source silhouettes retain every genuine source surface.

The chosen yaw [0,1.568,0.156993] is an inference inside the physical base;
trunnion [0,1.867,1.650] is an inference within the source-located boot. The
source has no recovered animated rig. Structural hull endpoints are
Z±3.899422, overall aft fitting -4.045375, muzzle +5.754625.
Six source longitudinal wheel stations are [-2.228306,-1.303397,-0.252275,
0.546421,1.492415,2.438410], circular radius0.357347 and centerY0.44142.
Idler [Z3.510616,Y0.81982,R0.357347]; sprocket [-2.94311,0.86132,0.36981].
The covered return supports are explicitly inferred mechanical provisions,
not source-visible measurements.

Separate cheek solids retain the central boot opening; an inclined basket
floor supports narrow open rails/posts, and the forward sight has a thin hood
over a shallow recessed pane. The roof machine gun includes its distinct
receiver/barrel extension, feed-side support and elevation mounting rather
than detached boxes. Smoke tubes use closed stocks and recessed native mouths;
source cap detail and exact support axes still require independent refinement.

## Initial verification and retained failures

`type90X.selftest.mjs` checks the actual registered high/low model: physical
ground and extrema, six source longitudinal axle stations, distinct extended
guard/center air, basket positive posts/negative slots, sight pane/hood air,
actual gun pitch/recoil ownership and positive bearing/neck connection.
Typecheck and authored quality scan pass (26 functions, zero violations).

The unchanged committed strict track audit initially failed at the front
shoulders/guards: 632 band voxels and1090 full-sweep shoe voxels. Rear is0/0.
These are actual first-draft physical defects, not waivers. The ordinary and
geometry source gates, independent shaded review, full physical attachment
review and mandatory anatomy/release chain remain required.

## Measured native wrap and front-sheet correction

Source physical ray sections give an85.73 mm tread body, flat inner/outer
return faces Y1.15619/1.24192, idler outer crown1.26294 and sprocket1.27348.
The first draft's inherited full shoe top1.365 was genuinely excessive. The
native shoe now uses64 mm pad,22 mm grouser and103 mm inward guide dimensions,
with32 mm band and separate pitch radii .3161/.2852. Wheel centers and physical
radii remain unchanged; sprocket teeth engage the inward portion of the link.
The single native center course explicitly accounts for the renderer's12 mm
band-to-shoe spacing. Actual high/low inner shoe rays meet the independently
inferred physical roller crowns atY1.1559, rather than floating above them.
An analytic rolling tangent rounds the ground/approach knee. The4.5 mm nominal
flat-run allowance accommodates rigid discrete shoes at that curved transition;
actual per-instance ground minima, not rotated prototype AABB corners, are
checked for no penetration and less than1 mm residual clearance.

The front guard is now the actual steep source plane, with independently
closed folded side returns and genuine air below it. Held-out roof witnesses
[Z3.906238,Y1.129637], [3.949582,1.036597] and [4.036270,.850515] distinguish
it from the earlier short incorrectly sloped slab. Local upper-sheet heights
retain the real wrap clearance; official nominal turret roof remains2.30 m.

The corrected actual-ID high/low tests and typecheck pass (28 authored
functions, zero quality violations). The unchanged committed strict CPU
audit now reports front/rear/full-sweep band0 and shoe0 with372 native shoe
instances; actual shoe envelope Y0..1.280. The earlier632/1090 failure is
retained above as historical evidence, not a current exception. Fresh image
comparison still exposes the documented physical-width/roof conflict; these
CPU results do not certify source silhouette acceptance.

## Supplied-source visual target revision

The owner request is to rebuild the supplied file. After the optional real-size
versus supplied-proportion question remained unanswered, the coordinated
second-wave decision uses the supplied uniformly registered visual proportions
for X, while preserving the published conflict above and leaving the original
production tank unchanged. The earlier 3.40 m/2.30 m draft is historical, not
the current runtime dimension claim. The source bytes and registration did not
change, and no completed native group was scaled.

Current independent structural dimensions are width3.61781384 m, roof2.459472 m,
hull length7.798844 m and overall9.80 m. Yaw is inferred at
[0,1.681682,.156993] inside the source base; pitch at[0,1.997083,1.650032] uses
the measured circular cannon axis and a longitudinal point inside the actual
boot. MuzzleZ5.754624; highest whip4.657996 remains distinct from structural roof.

The rebuilt closed station solids retain the rear central high deck, separate
outer lowered wings and forward glacis. Held-out source rays at[0,−3.2] and
[1.5,−3.2] are Y1.8405988 and1.8009322 respectively; the outer skirt roof at
[1.78,−2] is1.3769611. The source stern face is Z−3.962528, while the actual
short rear rubber sheet is Z−3.500149, not an invented tall aft curtain. The
rear wing's concealed inner surface retains12 mm clearance from the continuous
native carrier; its measured external roof/side planes are unchanged.

The true source wheel casting extends X1.135183..1.629159, center1.382171,
with a recessed steel surface aroundX1.509855 at radius.20 and a clipped hub
reaching1.634449. An independently authored closed radial forging plus native
annular tire replaces the old solid rubber cap that hid this real depression.
The source tread lane is X1.366395, width.630667, with a15.776 mm outward wheel
offset; all six measured Y/Z/R stations and the single native course remain.
Both LODs check the actual integrated steel first surfaces, not an isolated
helper. No source contours, triangle arrays or buffers are used.

The source sloping optic hood, elliptic cupola base, tapered upper crown,
asymmetric smoke-bank axes, loader hatch and complete roof-weapon support are
separately authored. Smoke axes are[0,.86627,.49957], not the former invented
outward rake. Small native mouth recesses retain closed stocks; the coarse
source caps do not establish a measured empty bore depth. The original source
engine field has no separate raised louvre islands, so the old generic buried
deck boxes were removed rather than reinterpreted as measured source volumes.

Fresh scoped source proof after the wheel refinement reports fidelity98.3 with
all registered whole/lower-track views passing; fused hull/turret/gun remain
honestly unavailable. Geometry whole raw97.76841874096391, dimensions100 and
floaters100 pass. The refreshed neutral board visibly restores separate wheel
dishes and preserves the open rear rack and optic hood air. High/low source
surface/ownership tests pass, and unchanged strict CPU front/rear/full-sweep
bands and shoes are all0. The scoped `--no-render` standard passes but explicitly
skips continuity/decor; it is not a substitute for the final official standard.
The final composed release must archive its own full exact fidelity receipt.
