# Abrams source X — track and height diagnosis

## Disposition, 2026-09-07

**R5 guide correction: bounded CPU checkpoint, not source/release acceptance.**
The source-only investigation below preceded the subsequently authorized guide
implementation recorded at the end of this document. The source, oracle, masks,
cameras and thresholds remain unchanged. No post-guide fidelity render has run:
the latest measured R4 failures below are historical evidence, not fresh R5 scores.
The height failure compares different notions of height; lowering source-correct
equipment to pass it is not justified.

The directly compared vehicle is `m1a2_sepv2_x`. The other six new Abrams
configurations still lack their own supplied-source oracles. This investigation
does not raise the frozen R4 visual judgments of 8.5–8.9/10, with 0/14 at 9.
See the [main record](abrams-source-x.md) and [R4 drive record](abrams-source-x-drive-r4.md).

## Frozen inputs and instrument

The selected OBJ SHA-256 remains
`85c33cee1ec041cbc3b5453841a6a006c8f1f866365a7a16c078bad3d630bd29`.
The canonical GLB SHA-256 remains
`7fc3216da131d26e6389c4d40818f70ba03603c99812c5ae42c2f8b798910d16`.
The fixed source frame is `[-rawX, rawY + .203945, .357965 - rawZ]`, scale 1.
All source owners, including its repeated track meshes, remain in the oracle.

The immutable checkpoint is `.qa-dev/reports/abrams-final-source-review-P4Wdzv/outputs/`:

| Evidence, relative to that archive | SHA-256 |
| --- | --- |
| `.qa-dev/reports/procedural-fidelity.json`, generated 15:42:54.979Z | `ac41b718d17598debb3f2c907b97c79002a2fc74794d633098b6f9ffbd16e56c` |
| `docs/geometry-gate/m1a2_sepv2_x.json` | `93454236dc74ad770673a82431e503e8437ce2a404e5e23d8b75db04ff53fe65` |

Its composite is **96.5325260108**, but tracks are **88.8430936939 FAIL** and
dimensions **62.2104778873 FAIL** against the unchanged required minimum 92.
The frozen right comparison image and current neutral board were inspected;
their visible lower-guide difference supports investigation, not a new score.

### What the track metric actually measures

[procedural-fidelity.html](../../tools/procedural-fidelity.html) renders the
right hull silhouette at 384², with direction `[1,.05,0]`. `lowerBand()` retains
the bottom 39% of the union of the two hull-mask vertical extents. It does **not**
compare all track owners or the entire upper return run. `compare()` applies its
existing rounded centroid alignment and weighted silhouette comparison.

The retained masks are 269×28 and 271×28 pixels. Their source/native areas are
6216/5927 pixels, intersection 5584, union 6559: 632 source-only and 343 native-only
pixels. IoU is 85.1349%, area similarity 95.3507%, bounding-box similarity 99.6310%.
The near-equal bounds do not mean the interior shape matches.

The twelve stored contour bins have top-run discrepancies of approximately
1.5–4.22 pixels through most central stations, not merely at the rear axle.
The explicitly raised upper wrap at Y≈1.3125 is above this lower crop; its
existence alone does not explain the 88.84 score. The changed rear lower
departure can still affect the cropped silhouette. No exact pixel attribution
or promised score gain is inferred without a fresh matched counterfactual.

## Source-first lower-course evidence

The source-only OBJ ray study completed through ordinary FIFO at
**17:50:07.608Z**, exit 0. It imported no native builder and wrote no files.
It checked the exact OBJ hash, converted all 143 draw segments once to the
canonical frame and used DoubleSide rays to enumerate material intervals.
This is interval evidence, not a FrontSide render/closure qualification.
The executed child command SHA-256 was
`c2742c7751b71e9ddafcdf80a0f1280e66ce4bbd6702bee8a5e8f43470487f00`.

There were 20 complete-source transverse queries and 18 selected-owner vertical
queries. Transverse rays started at `[2,Y,Z]`, direction `[-1,0,0]`, far 1 m:
four stations `Z=-1.95,-.46,.98,1.82`, at each of `Y=.075,.10,.15,.20,.30`.
Every Y=.075/.10/.15 row hit **only owner 120**, the narrow inner guide.
Every Y=.20/.30 row was empty over the complete finite interval.

| Canonical Z | First source X at Y=.15 | Last source X at Y=.15 |
| ---: | ---: | ---: |
| -1.95 | 1.431697413 | 1.419809642 |
| -.46 | 1.431613031 | 1.420104369 |
| .98 | 1.431513986 | 1.420399462 |
| 1.82 | 1.431587808 | 1.420466339 |

The guide tapers: its transverse width near the lower part is about 34 mm,
but only about 12 mm at Y=.15. It is not a full-width armor/belt slab.
At X=1.425, downward rays independently separate the two owners:

| Z | Owner 119 outer-band bottom / top Y | Owner 120 guide top Y |
| ---: | ---: | ---: |
| -1.95 | .004361401 / .074057287 | .190506221 |
| .357965 | .001653711 / .071330001 | .186900231 |
| 1.82 | .001069801 / .070739516 | .185194336 |

The same guide rays at X=1.25 and 1.60 miss owner 120. Thus the continuous
source guide rises roughly 115–117 mm above its outer band and fills part of
the low between-wheel silhouette. Its presence must not be confused with
source gear teeth, or reproduced as a static extra track course.

### Native guide: a height-only setting is unsafe

[Abrams running gear](../../src/vehicles/profiles/abramsSourceXHull.ts) uses
track center Y=.046, band thickness .018, pad height .026, web height .012,
and horn height .050. The existing
[shoe recipe and placement](../../src/vehicles/tankFactoryCore.ts) give, on
the nominal flat ground segment:

```text
shoe center Y = .046 - (.018/2 + .012) = .025
guide tip Y   = .025 + .026/2 + .012 + .050 - .006 = .094
base Y range  = .044 … .073; base width .082; tip width .046
```

The source guide top is consequently 91.2–96.5 mm higher. Merely setting
`hornHeight` to roughly .1412–.1465 would match that tip-height range but
would lift the **82 mm wide** generic base into the paired wheel webs.
At `hornHeight=.144`, that base extends to Y=.12752.

[The unchanged wheel profile](../../src/vehicles/profiles/abramsSourceXWheels.ts)
has inner web planes X=±.03035: a 60.7 mm channel. At a wheel station and
Y=.11, the radial coordinate is .263782, inside that web's real radial span.
An 82 mm base overlaps it by 10.65 mm per side even when centered. The actual
wheel-to-shoe outward offset is 3.88 mm, making the nearer-side conflict worse.
This is a real solid-profile incompatibility, not an AABB-only argument.
Changing whole-shoe `shoeWidthScale` would also shrink pads and connectors,
and is not an acceptable substitute for an independently shaped guide.

The narrow source guide fits the lower paired channel in principle: at its
widest roughly 34 mm section, a 60.7 mm gap leaves about 13.3 mm each side
before lateral offsets. This is a **local feasibility calculation only**.
No full-course end-wheel, return-roller, suspension or animated-phase clearance
has been established for a taller replacement.

### Separate real source/mechanical conflicts

Owner 119's approximately 69.7 mm lower-band thickness is not safely reproduced
as a uniformly thicker native belt. The source top is Y≈.071–.074, whereas
the unchanged native road-tire bottom is `.373782-.3166805=.057101`.
A full-width source-thick band would geometrically enter those tires by about
14–17 mm. The native carrier is only .018 thick, Y=.037… .055 before shoes.
The narrow guide occupies the wheel channel; the broad band does not.

At the rear drive, existing complete-source rays establish outer/inboard ring
stock intersecting the source's flat upper band. The lane-center stock alone
is 63.27 mm below its underside and cannot establish clearance across the
whole width. The authenticated source axle crown is .410698846348 m.
The native minimum band radius .4309994191 m leaves 20.300419 mm beyond it,
requiring the retained +133.658668 mm upper-wrap departure at that axle.

That crown is a conservative full-spinning envelope, **not** an independently
measured intermeshing tooth/band solution. The source carrier's eleven-fold
scallops do not authenticate engagement cadence. The retained native 18 teeth
per side still cause the explicit outboard-air failures recorded in the R4
drive note. No tooth deletion, crown shrinking or apparent pass is proposed.

## Height: source fidelity and the current dimension target disagree

The dimension gate compares native silhouette-derived P95 height against
`spec.dims.height=3.44`, not against the supplied source height. Its body filter
keeps columns thicker than 12% of the overall height, then chooses the 95th
percentile of their tops. Broad body below an antenna can keep that antenna's
column in the sample: this is not a semantic antenna exclusion.

| Quantity | Metres / result |
| --- | ---: |
| Frozen native P95 height | 3.6368949451 |
| Frozen source P95 height, rounded in gate | 3.647 |
| Source-only CPU reconstruction | 3.647256525 |
| Current dimension target | 3.44 |
| Native deviation from target | 5.7236902641% |
| P95 height yielding dimension score 92, other rows unchanged | 3.5088 |

The source-only height packet, `.qa-dev/reports/abrams-source-bodyheight-study.json`,
was generated 09:31:51.623Z. Its CPU pixel-center projection uses the same
96-column analysis and explicitly allows GPU edge-tie differences. Of 73 body
columns, P95 selects index 69: owner **58**, face 74, near canonical Z=-2.035016.
Four upper antenna/mast columns exceed the broad roof equipment. Four of 73 is
5.48%, enough to defeat the nominal top-5% trimming. The next broad roof-kit
level is about 3.3681 m; bare structural roof is about 2.3608 m and the complete
whip envelope is about 4.1770 m. These are different definitions, not interchangeable
values for a score target.

The native P95 is already only about 10.4 mm below the source reconstruction.
To reach score 92 against 3.44 requires lowering its measured P95 by 128.1 mm;
even the separate 3% dimension tolerance would require 93.7 mm. The source
itself is 6.0249% over this target and would score about 59.80 under the same
height penalty, not pass. Slightly improving the source owner-58 stock height
would move this metric away from 3.44, not resolve the disagreement.

Do not shrink, shift, hide or change the taper of authenticated antennas to
cross a percentile boundary; do not lower all roof stock. Do not substitute
a candidate-derived height or change source masks, bins, cameras or thresholds.
An owner decision about the intended published configuration/height definition
is required before any dimension-policy proposal; the present failure remains.

## Minimum justified next action

1. Investigate a **model-specific, narrow tapered guide on each existing moving
   shoe**, using source120 sections, without changing pad width, belt, axles,
   road/end wheels or the corrected rear wrap. No static duplicate rail. The
   source's continuous approximation does not independently establish a real
   per-link pitch or prove that discrete authored guide gaps can reach 92.
2. Before a geometry trial, prove the complete replacement's width/height over
   road-wheel and idler channels, return rollers and the drive. Test both sides,
   high/low, full scroll phases, suspension poses, actual stock first surfaces,
   and the held-out Y=.20/.30 complete-source air. Preserve all non-target
   geometry hashes. A height-only generic horn change is specifically rejected.
3. If that physically valid guide exists, run one frozen matched raw comparison
   with the unchanged source and gate. This can quantify a lower-course
   improvement; neither 92 nor complete source/physical compatibility is promised.
4. Keep the broad-band/drive contradictions and height-definition conflict
   separate in the handoff. Do not blame every failed track pixel on the rear
   wrap or present any remaining conflict as a release waiver.

Additional retained evidence hashes: source-body-height packet
`de89648bd45e11b8f190834e600fd4d04369b5a1c6130ec263abfccaacfd79c0`;
end-gear freeze packet
`cfcb99487a98bc11cef6deef79403444c58a04153389c6bc35ec4f353e31c04c`;
source part census
`238f96fcd4440e3e90334e00585cfcdd11ad92526e351256f61cdc524e61ac73`;
source probe packet
`cfeb9b7d1d72cc8c03abd7e9fbeb6bbf7c2600a85d48c13dd697a87af4aa05c4`.

## Authorized R5 guide checkpoint — 2026-09-07

The new optional `trackGuideProfile` in
[tankFactoryCore.ts](../../src/vehicles/tankFactoryCore.ts) replaces only the two
generic horns on each detailed shoe. The Abrams profile opts in; every absent-
option path stays intact. The simplified shoe keeps all its old pad/grouser
triangles and adds the same hollow guide. Both LODs share the original live
instance-matrix train. No static second track course, phase-dependent geometry,
extra running-gear group, altered axle, or widened wheel gap was introduced.

The fixed inward-distance/half-width stations are `.012/.0168`, `.045/.016`,
`.169/.0002` m. At the flat shoe datum Y=.025, the guide therefore reaches
Y=.194. Wall thickness is .8 mm, with a genuine through-cavity ending at inward
.163 m. The narrow root joins the existing web inside source119's occupied
lower-band envelope. Its per-link longitudinal depth decreases from .90 pitch
at the root to .30 pitch at the ridge. These separate link ends are a disclosed
mechanical construction: source120 is a continuous hollow guide, not evidence
for a particular shoe or engagement-tooth cadence.

The first .45-pitch ridge was rejected: real adjacent-guide overlap occurred at
the upper/front-idler transition, including shoes 41/42 at phase 0. Their near-
ridge longitudinal separation was about 65.8 mm; the .45-pitch tips overlapped.
The fixed .30-pitch ridge preserves the measured transverse source planes,
height and cavity while clearing the tested bend. It never changes with phase.
Earlier rear-drive reports based on face-normal sign were diagnostic classifier
failures: legacy tooth winding made external stock appear occupied. The final
test uses per-connected-stock ray parity, including reversed-winding and
overlapping-solid negative/positive controls, rather than changing the geometry
to satisfy that defective classifier.

### Scope and retained verification

[abramsSourceXTrackGuide.selftest.mjs](../../src/vehicles/abramsSourceXTrackGuide.selftest.mjs)
checks closed, outward, nondegenerate guide stock with finite UVs/normals;
independent source120 transverse plane hold-outs within the unchanged 2 mm
tolerance; and its real cavity and above-guide air. It builds all seven IDs in
high and low quality, paired with an old-guide counterfactual: **28 builds**.
Every non-guide mesh buffer/owner and all initial shoe/course matrices must match.
The exact triangle delta is 48 new guide triangles replacing 20 old horn triangles.

The SEP2 high/low complete-gear sweep covers **96 bilateral phase states**:
16 phases through one pitch, on flat ground and two actually articulated terrain
profiles, with opposite lane scroll directions. It samples guide vertices, face
centres and edge midpoints against the actual gear stocks and both neighbouring
guides. This is specified finite coverage, not a claim to exhaust all terrain or
every continuous animation instant. The guide's source plane/air witnesses are
isolated-part tests; they are not mislabeled as new whole-source certification.

Historical gear fingerprints have not been replaced with new candidate hashes.
The preservation helper first authenticates each entire current shoe geometry,
then temporarily reconstructs only its old-guide recipe for the existing fixed
digest. It restores the actual geometry synchronously afterward. The explicit
configuration counterfactual is deletion of **`trackGuideProfile` only**; the
existing `.050` legacy horn height and all pad/web/pin settings remain unchanged.
The older drive counterfactual separately retains its existing scoped stock
replacement procedure. The root's concurrent aft inner-shoulder repair is kept.

The six-test CPU receipt `.qa-dev/reports/abrams-guide-cpu-mgzBkz/receipt.json`
retains passing guide, Drive, FrontDeck, HullDeck, trackShoeDimensions and
AbramsSourceXFleet checks, including the original 18-model visual fingerprints.
Subsequent validator factoring and an ES-target-compatible copied-array reverse
do not change emitted geometry. The final guide receipt
`.qa-dev/reports/abrams-guide-guide-IfXswx/receipt.json` completed at 19:39:56.916Z,
with unchanged pinned inputs and PASS: 28 builds, 96 phase states, 237,772,800
gear-stock sample checks and 5,529,600 neighbour sample checks. Final preflight
`.qa-dev/reports/abrams-guide-preflight-w2ZTc3/receipt.json` passes both
`npm run typecheck` (including core-unused-check) and the unchanged complexity
gate: 697 functions, zero issues, zero explicit any/unknown. Earlier failures
remain archived, including the real
front-idler rejection in `abrams-guide-guide-W8rlur`, the initial complexity-25
rejection in `abrams-guide-preflight-4sdLjg`, and the ES library errors in
`abrams-guide-preflight-2Ebw0U`. No threshold was changed to close these checks.

Final core/Hull/guide-test SHA-256 values are respectively
`238a5c503fb1ac7dbd7009dcc1fafe61a247850a18dc1dbf4439f96de93c2a63`,
`cc68f4b77b6e8728069085c14b2f157a3d4cd4c0b69828bd9e0dc0fb734cf02e`,
and `fb0d44f9a1f7bf389cd8bd0f2a6c979e1d3782c63a02885c603e75a5fca3f496`.
The final receipts also pin both preservation helpers and the unchanged oracle.

### Open FSP performance issue: extra guide cost

There are **200 instanced shoes**, not 200 separately authored mesh objects.
The actual measured old/new shoe counts are identical in high and low quality:

| Active shoe LOD | Old triangles/shoe | New triangles/shoe | Old train | New train | Increase |
| --- | ---: | ---: | ---: | ---: | ---: |
| Detailed | 186 | 214 | 37,200 | 42,800 | 5,600 / 15.05% |
| Distant simplified | 22 | 70 | 4,400 | 14,000 | 9,600 / 218.18% |

These are alternative LOD counts, not two trains presumed drawn simultaneously.
The extra shared geometry buffers total **7,296 bytes**: detailed +2,688 bytes,
simplified +4,608 bytes. The shared 12,800-byte instance matrix buffer, instance
count and draw structure do not change. No per-frame construction was added.
Nevertheless the distant-LOD triangle increase is substantial and remains an
**open FSP performance issue**, not an accepted fleet-wide optimization.

The FIFO paired cost receipt is `.qa-dev/reports/abrams-guide-cost-pfU90t/receipt.json`.
It measures current SEP2 versus deletion of only the guide option, in one process,
excluding imports/disposal, with two warm builds per mode and seven alternating-
order measured pairs per quality. High median construction was 147.25→141.29 ms;
low was 136.21→143.51 ms. Paired median deltas were −7.49/−1.26 ms, respectively.
The mixed ordering and variable samples do **not** establish a speedup or stable
regression. This geometry-equivalent measurement predates the validation-only
refactor and copied-array compatibility change. It is not browser switching,
GPU frame-time, cold-start, or whole-fleet performance qualification.

Per the changed user priority, work stops after this bounded validation. No new
raw fidelity, dimension, standard, asset or visual release pass is asserted.
The post-guide source score is unmeasured; the R4 88.843 track/62.210 dimension
failures, source/band contradictions and missing six variant oracles remain
unresolved acceptance work. The recommended dimension decision remains to
clarify configuration-height semantics; do not lower the antenna to game P95.

