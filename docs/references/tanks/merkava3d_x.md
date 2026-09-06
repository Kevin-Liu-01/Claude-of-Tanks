# Merkava Mk.3D X — independent owner-source reconstruction

Status: **release-qualified — 2026-09-06T10:49:59.926Z**.
The final **2026-09-06T10:06:54.116Z** capture records raw fidelity
**95.10945180615614**, minimum whole view **93.35137028450046**, and raw
geometry minimum **93.35137028450046**: [exact fidelity](merkava3d_x.fidelity.json),
[exact geometry](../../geometry-gate/merkava3d_x.json).
All registered valid 92-point floors pass; strict band/shoe/full-sweep
intersections and continuity holes are zero.
Fused-source hull/turret/gun component scores remain N/A, not synthetic passes.
Mandatory anatomy/assets, 510 selftest files, typecheck and private/public builds passed in the composed
batch. The checkpoints below are historical; source-use restrictions and
acknowledged physical simplifications remain unchanged.

`buildMerkava3DX` in `src/vehicles/profiles/merkavaX.ts` is an additive,
first-party model. Its independently authored hull, asymmetric turret,
modular armor, cage, chain curtain and native track course do not import
source topology, textures, buffers, rig or the previous Merkava builder.

## Explicit provenance exception

The owner supplied `merkava-mk3d.zip`, SHA-256
`2e19b525ccd108cb9b3cdc73cc152188992532cb0ac95b43fbd3b06062dcdbd3`.
[Jeyhun1985's upload](https://sketchfab.com/3d-models/merkava-mk3d-1e61cd3b871646d59a8b9505e06e9d0f)
explicitly identifies War Thunder extraction. This is confirmed, not
inconclusive provenance. Work was initially held and the issue disclosed.
On 2026-09-05 the owner explicitly authorized local measurement/comparison
of this supplied batch: “use those files, it's actually okay because we
don't use those files in actual game at all.” This does not establish
redistribution rights and is not a general change to project policy.
No upstream mesh, buffer, texture or rig ships. The sole oracle remains
ignored at `public/models/community-candidates/merkava3d_x_source.glb`.

## Measurements and physical identity

The OBJ contains 237,457 triangles in 161 material-split meshes. Canonical
coordinates add `(0,.02034,.2258175)` with no scaling or axis deformation.
Full width is 3.976352 m, hull length 7.9645 m and overall 8.83824 m.
Structural roof is approximately 2.59 m, source P95 body height 3.016 m
and highest antenna tip 5.15869 m. Yaw pivot is `(0,1.68034,-.72418)`;
gun axis is `(0,2.0898,1.4258)` with muzzle Z 4.855985 m.

The front-left turret shoulder is genuinely lower than the right cheek:
at Z .6 and X ±.9, source upper surfaces are Y 2.121 left and 2.433 right.
This 31 cm asymmetry is tested through the actual first-party armor, not
its metadata. Separate sloped armor tiles preserve panel boundaries.
The rear cage's upper and lower side rails rise toward the turret; its
real thin floor, separate stored track links and open side wings are not
replaced by a solid box. Chain links and ball weights hang below the cage.

Six source wheel stations per side are Z `[-2.3236825,-1.4406825,-.3106825,
.5473175,1.4058175,2.2588175]`, radius .371 m, axle Y .446 m. Front drive
station is Z 3.2658175/Y .874; rear idler Z −3.1391825/Y .844. Native
bottom-course center .0976 m gives physical ground-zero pad contact while
preserving these source wheel/end datums.

## Verification contract

Material and nominal bone names mix internal and external component
ownership. They do not justify invented clean component masks. Whole
vehicle and track comparisons retain every-view floor 92 plus independent
shaded inspection. Exact native band, shoe and swept-track overlap must
remain zero; the source's static intersections are not copied. Actual
surface and articulation tests run in both detail levels.

## Historical scoped evidence — 2026-09-05, round 6

The historical 23:17:02 UTC row recorded:
aggregate 94.93, minimum whole view 92.98 (left), track 96.05.
Geometry minimum is 93.0, dimensions 99.2 and attachment islands 100.
The official standard check measured zero front/rear/full-sweep band and
shoe intersections, zero continuity holes and three real fitting-library
MGs. The right MAG now sits on its measured roof foot, neck and rail;
it no longer forms a detached silhouette island. The exterior front tow
eyes and rear capped containers retain the measured hull-end envelope.

Fresh neutral-clay inspection confirms the low left-forward shoulder and
higher right cheek, separate side armor panels, front launcher blocks,
sloping cage wings, actual basket floor, spare links and hanging weights.
The independently authored native model remains visibly simpler in its
glacis access-panel/bolt relief, small deck fittings and fine roof clutter;
the source's tire/hub and static link sculpting is not reproduced by the
native animated course. The broad shapes and open basket are retained,
but this is not a claim of identical shaded microdetail. Geometry was
reopened for the medium-form correction below; anatomy and release
subsequently passed after the entire authored fleet became stable.

## Medium-form correction — 2026-09-05 local, round 8

Independent shaded review rejected the simplified front deck and mirrored
free-standing launcher heads despite the passing outer masks. The source's
left-center front armor is up to 20 cm above the previous wedge. Fixed
canonical downward rays now protect its three-slope crest: X −.8/Z 2.0
is Y 1.76797, X −.3/Z 2.0 is 1.79161, and X −.3/Z 2.4 is 1.71405.
The separate right access plate is Y 1.69494 at X .7/Z 2 and 1.58405 at
Z 2.4. Authored surfaces agree within 3 mm in both LODs. The front clamp
has a tapered body and open eye: its bounding rectangle is not filled.
The right engine-access pack has separate overlapping covers and two
hinge saddles, supported by the actual deck skin.

The source smoke banks differ in height and fore/aft station. The right
six tube components occupy X 1.149–1.455/Y 2.095–2.324/Z 1.083–1.394;
the left bank occupies X −1.437–−1.134/Y 1.938–2.156/Z .791–1.105.
The rebuilt angled saddles and recessed tube mouths follow these different
cheek seats. They are not identically mirrored box heads. Source vertex
positions are not copied into runtime buffers; these are independently
authored lofts, primitives and lathed hollow tubes.

Round 8's historical 2026-09-06 00:49:29 UTC row recorded aggregate 95.12, minimum whole view 93.35
(left), tracks 96.47. Fresh geometry is 93.4, dimensions 99.2 and
attachment islands 100. The official standard passes with front/rear/full
sweep band and shoe overlaps all zero, continuity zero and MG count 3.
All thirteen X high/low articulation and marking-support checks pass.

The fresh neutral board confirms the raised multi-slope front fields,
separate right access cover/hinges, shaped clamp and differently seated
smoke banks. The native remains visibly simpler in front lamp housings,
fine fastener relief, roof appliances and gun-sleeve surface detail; those
are not asserted to be identical. The source's sculpted wheels/links are
not substituted for the independently animated native course. No source
or gate thresholds were changed. Final independent shaded fleet review
and anatomy/release subsequently passed separately from these scoped checks.

## Live ERA binding without source-shape changes

The inherited `merkava_merkava3d_turret_era_L/R` zones now bind only the
three existing closed bolt-on roof/flank armor tiles on their respective
sides. The independently closed turret shell, handrails, smoke banks and
roof fittings remain permanent. No exterior vertices move, no source shape
is replaced, and donor ERA resistance values are unchanged.

Each trapezoidal tile supplies its actual two outward roof triangles to the
hit receipt. A rectangular PCA fit is not substituted: its former corners
could project beyond the tile into air. The focused `westXEraBinding` test
proves the complete actual triangle multiset is unchanged by registration,
all fitted corners/centers lie on real high/low armor within 2 µm, the hit
normal intersects the physical surface, and depletion preserves both the
permanent shell and the opposite side before exact reset. Final regenerated
receipts and the unchanged simulated-hit ERA audit subsequently passed as
separate integration checks, not substitutes for this geometry proof.
