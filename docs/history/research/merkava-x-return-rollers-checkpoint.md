# Merkava X return-roller checkpoints — 2026-09-09

Current follow-up: **MEASURED FULL-STROKE FIT PASS / ROLLER COST PASS;
RELEASE PENDING** for the wheel-gap support repair below. The separate
`65f262bb3` verification checkpoint rejects the unchanged `e9017cfb9`
fittings and remains reproducible. Earlier sampled-height evidence is not
retroactively called proof of configured suspension travel.
The efficient follow-up below supersedes the runtime experiment, not its
recorded failures. The original `c4f56baf0` checkpoint remains reproducible
with **CONTACT FAIL / COST FAIL**. Variant-specific roller count remains
unresolved. Native visual/source, anatomy/assets and composed release are
owned by the fleet integration run; this is not a release certificate.

## Preserved experimental baseline (`c4f56baf0`)

Status: **CONTACT FAIL / COST FAIL**. Preserve as a local experiment, not a
release candidate. The standalone contact proof deliberately exits nonzero
and is not registered in the passing release suite.

Scope: `merkava3d_x`, `merkava4_x`, based on `b0ed8d90f` after the separately
verified shoulder/fender closures. Implementation is a local experiment;
native visual/source qualification, anatomy/assets and composed release remain
with the fleet integration run. This document is not a release pass.

Tamor's [supplier brochure, printed page 16](https://www.epicos.com/sites/default/files/urban_defense_-_tamor_smr_ltd.pdf)
establishes Merkava return-roller eligibility. It does not establish a count
for either Mk3D or Mk4. The five-roller passage elsewhere describes Sholef,
not Merkava. **Four stations per side below are a mechanical inference** for
the concealed native assembly, not claimed historical measurements. A clear
variant-specific bare-suspension reference is still needed to resolve count.

| Authored fit, metres | Mk3D X | Mk4 X |
|---|---|---|
| Hull-local stations Z | −2.10, −.82, .92, 2.38 | −2.02, −.73, .78, 2.30 |
| Roller axle absolute X | 1.282 | 1.154 |
| Roller radius / full axial envelope | .095 / .140 | .095 / .140 |
| Spindle inboard seat X | 1.075 | .945 |
| Carrier-relative axle seat offset | .003 | .007 |

The old native course used road-wheel crowns with .085 m sag despite having
an authored higher `topY`. The new upper course is taut between actual
rollers at the intended upper datum and unchanged end crowns. Road wheels,
lower contact course, end-wheel axes, hull, turret, gun and bodywork remain
fixed. Native tires/discs provide the rolling surfaces; eight finite closed
spindles per vehicle seat into actual hull skin and hub interiors. The Mk4
lane is 40 mm farther inboard than the first trial because the compression
test rejected that trial's wheel-disc overlap. Its axle also sits 4 mm lower
than the Mk3 carrier-relative seat because the actual inboard shoe pins reach
lower. Actual tire-to-pin contact is tested, not inferred from a full-width
cylinder extending through the narrow hub overhang. The simplified far shoe
omits these pins: its clearance is checked separately, not called identical
physical contact.

Verification is owned by `merkavaXReturnRollers.selftest.mjs`. It compares
native emitted geometry and matrices with the exact former configuration;
checks actual bilateral tire crowns and hull seats; clips every finite
band/near-shoe/far-shoe triangle to roller axial slabs; bounds continuous
upper-course translation; sweeps track phase and suspension travel; and
checks battle LOD and exact instance/geometry disposal. T-62MV-1 original/X
remain zero-roller controls. These are bounded CPU geometry checks, not a
browser timing or arbitrary-terrain collision certificate.

The old end-return source SHA and source-ray tolerances remain fixed. Its
test-only inverse authenticates precisely the two new wrapper calls and the
complete roller-helper hash before applying the existing bodywork inverse.
It does not invert the new physical tests or rewrite a historical golden.

Measured worst actual far-carrier crown gaps across eight rollers, three
suspension heights and sixteen track phases (6 mm gate unchanged):

| Vehicle | HIGH | LOW |
|---|---:|---:|
| Mk3D X | 4.170390 mm | **10.212123 mm FAIL** |
| Mk4 X | **8.201162 mm FAIL** | **14.251898 mm FAIL** |

The standalone run completed 16 builds, 32 roller inspections, 192 moving
poses, four raised-roller negative controls, lifecycle/LOD checks and both
rollerless controls. Minimum finite near/far separation was 1.090953 mm for
Mk3 and 1.090971 mm for Mk4 in both qualities. It then rejected 1,056 contact
samples under the unchanged 6 mm gate; nonpenetration is not full fit.

Rest contact is not an all-phase pass: native polygonal tires rotate. The
Mk4 conservative continuous pin/circular-tire envelope requires a seat at
least 5.909306 mm below the nominal crown, while actual rotating far contact
requires at most 4.799472 mm HIGH / −1.249523 mm LOW. Those certificate
intervals are empty. The near bound is conservative, not an invented exact
angular contact measurement. A 51.909 mm full-pad underside extension was
rejected after 66 definite wheel-vertex penetrations in new stock at rest;
the original far shoe remains unchanged.

Performance remains **FAIL** against the frozen complete roller budgets of
160 HIGH / 80 LOW triangles. The native tires/discs plus finite shafts cost
336 HIGH / 192 LOW per roller (2,688 / 1,536 total across eight, including
256 shaft triangles). Physical fit does not qualify that cost. A later
efficient primitive can replace the native stock on its existing moving
owner after preserving this physical proof; the budgets are not relaxed.

Typecheck passed. React Doctor returned 84/100 with nine warnings in
pre-existing test loops, not a changed render-loop finding. The original
Merkava shoulder/front/end/rear-hull/history and west-X geometry checks plus
the 174-vehicle track/suspension pattern checks passed (eight entry points).
Full-fleet anatomy/assets and duplicate native captures are intentionally
not generated by this scoped worker.

## Efficient fitted follow-up

The independently closed efficient rotor uses 24 HIGH / 12 LOW crown
sectors, the original 95 mm radius and 140 mm complete axial width. Native
gear entries own its rotation and its two actual rubber/painted material
groups; eight finite hull-seated spindles remain separate. Complete cost is
**128 rotor + 32 spindle = 160 HIGH**, **64 + 16 = 80 LOW**, or **1,280 /
640 triangles across eight rollers**, under the original unchanged limits.
This is not a reduced roller count or an omitted hidden shaft.

The Mk3 carrier-relative seat is now 2.7 mm; Mk4 is 6.3 mm. All road-wheel
and end-wheel positions, body geometry, lower course and original outer
track course remain fixed. Mk4 alone gains 3.8 mm of real inward band stock
at its four existing upper support frames. The native intermediate frames
remain fixed, forming local tapered patches, not one uniformly thick upper
run. Both bands stay closed and positively wound: 96 existing inner/side
vertices move, adding **0.003824550 m³** of actual stock and **zero triangles
or draw calls**. These are authored mechanical fit dimensions, not measured
historical belt thicknesses.

The first lining trial was rejected: native live shoe samplers averaged
outer and inner faces and lowered the actual shoes by approximately 1.9 mm,
causing **1.527569 mm near-pin penetration**. The local input-hashed receipt
is `.qa-dev/merkava-lined-rejected.json`. The permanent old-midpoint negative
control reproduces this penetration in both qualities. The narrow
`trackCarrierFromOuterFace` opt-in now recovers both ordinary/chord shoe
carriers from the live outer face plus the original nominal half-stock
vector. All default symmetric-band expressions are retained. No animation
wrapper, per-frame allocation, extra liner owner or hidden contact proxy is
introduced. The stock helper is shared as `lineUpperReturnBand`.

| Actual fitted stock, mm | Mk3 HIGH | Mk3 LOW | Mk4 HIGH | Mk4 LOW |
|---|---:|---:|---:|---:|
| Minimum finite track separation | 0.790908 | 0.790909 | 0.390936 | 0.390937 |
| Maximum posed vertical crown/band gap | 3.514408 | 5.938714 | 3.351355 | 5.775668 |
| Maximum draw-eligible support gap | 3.455083 | 5.820066 | 3.349200 | 5.765033 |

The fixed 6 mm contact / 2 µm penetration gates pass. The scoped proof
covers 26 builds, 204 native physical poses including exact half-sector
crown phases, 12 rejecting controls, all actual new-stock road/end-wheel and
suspension triangles, 324 native LOD/rotation states at 15/75/200 m, both
shoe samplers, broken/repair behavior, complete near/far shoe matrices and
exact-once rotor/spindle disposal. Actual lining arrays are compared against
an unlined native control after deformation; outer/wrap/lower stock is
unchanged. The independent stock test adds 192 poses and four old-midpoint
rejecting controls, with absent/false default buffers and poses identical.
Fourteen additional invalid-input/layout controls bring its total to 18:
both bands are preflighted before mutation, requiring positive finite depth,
distinct finite resolved stations, native 24-vertex cells and finite nonzero
stock normals. Missing stations cannot silently produce a no-op.
The three terrain-height requests are sampled native poses, not proof that
the configured suspension clamps were reached. A separate actual-axle
displacement/clamp audit is still required for a full-stroke claim.

The opaque, FrontSide band really remains draw-eligible in near/far LOD;
that is the receiving surface. Shoe-only counterfactual maxima remain
53.15–55.85 mm at 75 m and are **not** called passing far-shoe contact.
These are CPU geometry/render-state proofs, not fresh GPU pixel evidence,
an arbitrary-terrain contact guarantee or a resolved historical roller count.

Final guarded scoped verification passed all nine entries: shared stock,
suite discoverability, return-roller physical
proof, shoulder returns, Mk3 front returns, Mk4 end returns, Mk4 rear hull,
immutable end-return history, and the existing four-Western source-geometry
guard. The old full-profile SHA is unchanged; 23 history counterexamples
reject edits outside the exact reviewed seams. Actual stationary spindle
rims enter the rotating finite hub caps with a positive 0.5 mm receiving
margin at every tested phase. Full TypeScript check also passed. The new
passing proof is registered for the normal release suite; the historical
failing experiment remains preserved at `c4f56baf0`.

The required final React Doctor scan completed at **83/100**, exiting 1
with one error and 21 warnings, all in selftests. The reported missing
instance-buffer upload is a high-confidence false positive in
`efficientReturnRoller.selftest.mjs`: those temporary meshes are inspected
only on the CPU and never submitted to a renderer. The remaining findings
are repeated property access or small array-iteration optimizations in
offline tests; they do not identify a runtime hot-loop regression. No
diagnostic was suppressed or unrelated test rewritten to change the score.

## Actual configured-stroke verification

Runtime parent: `e9017cfb9dec0ed31d9e443855b3903dea9771f7`; no runtime,
source, body, road/end axle, track-course, material or budget change in this
verification checkpoint. The shared test helper is copied byte-for-byte from
`53ebf5e44e3133f876ce6076110302a1a9537072` (calibration originally reviewed
at `f97ffbf69e0fecaceaedea4375cc585298730415`), git blob
`31b2e54daad01327690310ccbab22efe3e9447a3`.

The Merkava proof now uses the actual native contact plane, configured
compression/droop and hull scale, settles 180 native conformance ticks, then
asserts every road axle's measured displacement within the unchanged 2 µm
tolerance. Both lined/unlined ordinary and chord controls use those fixtures.
Flat, compression, droop and uneven-ground poses retain the complete finite
track/roller/spindle/road/suspension checks and actual LOD contact gates.
Physical failures are collected across all four builds and still reject the
test at the end; no tolerance or acceptance condition is waived.

The single full diagnostic completed **272 physical poses**, 26 builds,
12 negative controls and the existing 324 native LOD/rotation states.
Every axle reached +0.29999998211860657 m compression; droop reached
−0.2200000137090683 m for Mk3 and −0.2199999988079071 m for Mk4.

| Conservative finite wheel/rotor separation, mm | HIGH | LOW |
|---|---:|---:|
| Mk3D X | **−61.370812 FAIL** | **−61.362711 FAIL** |
| Mk4 X | **−77.682227 FAIL** | **−77.671233 FAIL** |

There were 561 rejected physical samples. The deepest was Mk4 HIGH road
disc instance 0 against rotor stock at compression, phase 9. These values
are conservative stepped-cylinder clearance bounds, not claimed exact
surface penetration depths. A bounded actual-surface diagnostic follows
before any fitting correction. Track nonpenetration, the 6 mm draw-eligible
contact gate (zero failures), original-body preservation, lining/chord/broken
controls, exact-once ownership and complete 160/80 roller cost still pass.

Input-hashed failing receipts are retained under
`.qa-dev/merkava-measured-stroke-tJnuKI/receipt.json` (first fail-fast witness)
and `.qa-dev/merkava-measured-stroke-JiNd3Z/receipt.json` (all four cases),
generated by `.qa-dev/merkava-measured-stroke.mjs` through the shared FIFO.
Their inputs remained unchanged for the entire run. No source/visual,
anatomy, build or full-suite run was performed by this test-only follow-up.

## Wheel-gap support repair

Parent verification: `65f262bb3a6ea1c3d8a4146582dc53aa96612b46`.
The bounded actual-surface diagnostic confirmed real overlap, not merely
over-conservative cylinder bounds. At compression, Mk3 HIGH/LOW had 36/12
native painted-shoulder edge intervals inside rear road-tire stock; Mk4
had 24/10 inside rear road-disc stock. Example Mk3 HIGH intersection point
in hull metres: `(−1.345927, 1.089859, 2.358834)`; Mk4 HIGH:
`(−1.211545, .907641, −2.050694)`. The sampled rubber-crown edges did not
intersect, and spindle broad-phase tests were clear. Interval lengths are
not penetration depths. Evidence:
`.qa-dev/merkava-measured-stroke-JiNd3Z/native-intersection-v2.json`.
The preceding diagnostic import-resolution failure produced no geometry
measurement and is not counted as proof.

Only the inferred return-support stations move longitudinally into existing
wheel gaps. Mk3 uses wheel pairs 0–1, 1–2, 3–4, 4–5; Mk4 uses 0–1, 1–2,
2–3, 4–5. These are authored mechanical choices, not recovered historical
roller measurements or a resolved variant count.

| Hull-local support Z, metres | Stations |
|---|---|
| Mk3D X | −1.8821825, −.8756825, .9765675, 1.8323175 |
| Mk4 X | −1.6645, −.733, .27, 2.017 |

The supported upper vertices and existing Mk4 lining follow those stations.
Mk4's 3.8 mm inner-stock patches still change 96 vertices, now adding
0.003734104 m³ with zero new triangles/draw calls. Hull/turret/gun geometry,
road/end axles, lower/wrap course, roller X/radius/width, finite mount format,
materials and full configured suspension travel stay fixed. Complete roller
cost remains **128+32=160 HIGH / 64+16=80 LOW**, including the spindle.

The final physical test uses the reviewed shared `scanAllYZ` routine on every
actual road-wheel, end-wheel and suspension mesh against finite rotor and
spindle stock. Disjoint axial triangles contribute a conservative separation
bound; no Infinity is represented as a measured clearance.

| Final native stock proof, mm | Mk3 HIGH | Mk3 LOW | Mk4 HIGH | Mk4 LOW |
|---|---:|---:|---:|---:|
| Complete wheel/end/suspension separation lower bound | 1.046992 | 1.046992 | 1.274000 | 1.274000 |
| Minimum finite track separation | .790983 | .790984 | .390977 | .390978 |
| Maximum posed crown/band gap | 3.514527 | 5.938833 | 3.335051 | 5.759363 |
| Maximum draw-eligible support gap | 3.455195 | 5.820171 | 3.333928 | 5.759025 |

**PASS:** 272 physical poses, 26 native builds, 12 rejecting controls,
324 actual LOD/rotation states, additional ordinary/chord lining-pose and
broken/repair preservation, exact-once resource disposal, zero physical or
contact failures, unchanged 2 µm/6 mm/160–80 gates. All axles again reached
the measured compression/droop values above. Frozen input-hashed final receipt:
`.qa-dev/merkava-measured-stroke-ZRoRuW/receipt.json`; initial passing
broad-phase-only trial: `.qa-dev/merkava-measured-stroke-KcA9rx/receipt.json`.
Neither is an arbitrary-terrain or continuous-time collision certificate.

At this physical-fit checkpoint, history/type qualification was still pending
because the end-return inverse pinned the pre-repair station literals. The
separate test-only follow-up below resolves that integration; it does not
retroactively alter the physical receipt or its frozen inputs.

## Exact historical inverse follow-up

Parent runtime: `a6a3c85708bbd7d0e660a2484fb706972c1813e9`.
Only the test inverse's two station-call suffixes, the Mk4 lining call, and
the two exact support comments are authenticated and removed. Each comment
must remain at its own complete native gear-call tail. The original complete
profile SHA remains
`a7cb2366ce25ac6c6e3ff9c9d78ad7bf4c8fa2a6b0f6211ef9d92e6391d127f6`;
all helper hashes, original emission/buffer comparisons, source measurements,
geometry/stock tolerances and existing negative controls are unchanged.
No runtime geometry or measured-stroke proof code changes in this follow-up.

**PASS:** six focused CPU tests (end-return history, Mk3 front return, Mk4 end
returns, both shoulder returns, Mk4 rear hull, and the existing four-Western
source-geometry contract), followed by full `npm run typecheck`, including
native TypeScript and `core-unused-check`. History now rejects 36 mutations
and preserves both original single-sibling failure witnesses. Controls
explicitly change both live roller calls, the independent lining stations
and depth, comment placement/content, and a retained road-wheel datum.
Existing H/L retained-emission and complete native-gear byte comparisons,
19 Mk4 rear-source rays per LOD, and held-out source datums all pass without
refreshing an acceptance value. The older bodywork motion checks retain their
sampled-pose limits; the separate measured-clamp proof above owns full-stroke
roller qualification.

Input-hashed FIFO receipt:
`.qa-dev/merkava-history-followup-bd9Lae/receipt.json` (all inputs unchanged).
**Pending:** native GPU source/visual scoring, scan, anatomy/assets, build and
composed release were not run under this bounded authorization. This remains
a local checkpoint, not a release pass, and has not been pushed.
