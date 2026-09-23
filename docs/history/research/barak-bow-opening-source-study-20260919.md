# Barak supplied-source repair and opening qualification

Initial diagnosis snapshot: `5d36e7cf9`. This is a source-only continuity diagnosis followed by one
actual loaded HIGH native geometry probe in an isolated checkout. It does not
qualify the current opening policy or replace the independent visual review.

The canonical source is
`public/models/community-candidates/merkava4_barak_x_source.glb`, SHA-256
`0549b50430cd8df0ebf9d095b617e64e8c6274747bea1dd99e4dec0e987b8f4d`.
Its raw supplied source SHA-256 is
`81cc2cf027af4475c5890089067dd9b1f77d9fbd306939e24f973ad68e099aa5`, as recorded
in [the source packet](../../references/tanks/merkava4_barak.md). This diagnosis
measured the canonical file; it did not rerun the original-to-canonical bake.

The filled standard report records two ten-cell continuity clusters at
X≈±0.43, Z≈3.89. All 20 exact centers are air in the complete source using both
FrontSide and DoubleSide downward rays. All 180 corresponding 3×3 raster
subpixel centers also have no DoubleSide hit. Primary source hull Object_29
component246 ends at Z3.743822336; tested centers span |X|0.295728353–0.532311035,
Z3.857180451–3.976988397, ahead of that body shell.

Complete triangle projection clipping gives a stricter limit than sampled rays.
Eighteen cell footprints contain no source triangle. The outer aft corners of
two cells touch narrow Object_11 mounting stock, components60/69, within
Z3.827228464–3.836275816 and X−0.561883870–−0.553538740 /
+0.552538693–+0.561883870. These corners miss all nine raster subpixels. A blanket
rectangle classification would incorrectly erase actual mounting stock.

The native model agrees on the reported air centers, but it does **not** retain
matching surrounding source hardware. Complete-scene FrontSide probes produced:

| Ray X, Z (m) | Source first hit | Loaded HIGH native first hit | Result |
|---|---|---|---|
| ±0.60, 3.888 | Object_11, Y0.932990348 | hullDark, Y0.527801109 | Native stock 405.189 mm lower |
| ±0.60, 4.064 | Object_11, Y0.850888145 | None | Source guard stock absent |
| ±0.36, 4.02 | None | hullDark, Y0.43921024 | Native cable occupies source air |
| ±0.56, 3.52 | Object_29, Y1.159647–1.159673 | hull, Y1.160285704 | Main-body registration control within 0.64 mm |

`addBarakHullSignature` currently authors five tubular segments per side around
these openings. Those approximations are not enough to support finite source
mounting/guard witnesses. The native and source results therefore do not justify
enabling a measured-opening qualification yet, even though no missing hull plate
was found at the 20 failed samples.

The implementation was stopped before any policy, witness, configuration, source,
profile or threshold change. Correct the external bow hardware from independently
measured source stock first; then require exact failed samples to remain native
and source air, retain the finite body and mounting-stock witnesses, and reject
changed counts, registration, source identity, missing guards and filled air.
Do not fill the bow gaps or exclude the entire `hullDetail`/`hullDark` bucket.

Private reproducible evidence (not shipped source assets):

- Root `.qa-dev/tank-run/final-corrections/integration/barak-bow-opening-source/`:
  `source-probe.json`, `sections.json`, `result.json`, and their CPU source scripts.
- Isolated `cot-barak-openings-20260919/.qa-dev/barak-opening/`:
  `probe.mjs`, `native-source-stock.json`, `guard-source.mjs`, `guard-source.json`
  and `identity.json`. The actual native probe acquired and released the shared
  capture/CPU lease; no browser or GPU was used.

The raw 20-cell failure remains historical evidence. No passing qualification or
negative-control coverage is claimed for an implementation that was not enabled.

## Implemented correction and final author checks

The diagnosis above is the preserved **pre-repair** snapshot. The owner-approved
continuation rebuilt the misplaced bow equipment before enabling its opening
qualification. `merkavaBarakBow.ts` authors independent scalar-profile towing
straps, mounting cheeks/pins, lower hull receivers and an articulated chain.
It does not load source geometry, fill the openings, or exclude a rendering
bucket from inspection. Fourteen finite complete-scene source/native witnesses
protect the surrounding body, mount stock and actual air. The lower receiving
sheets overlap the actual hull by 16 mm at six measured stations.

The corrected bow produces **79 raw continuity cells**. Every exact current
raster center is air in both the complete canonical source and the filled native
build. The policy authenticates the source hashes and original registration,
requires that exact raster/region and every finite witness, and preserves the
raw count. Wrong source/registration, missing or displaced stock, extra cells,
changed bounds and filled source/native samples fail. The earlier raw 20 and
raw 80 receipts remain historical; the implementation does not preserve their
counts by changing the mesh or raster.

The supplied running gear also required coherent stock changes. Explicit pad,
web, guide and pin dimensions replace an over-thick generic shoe; no whole-shoe
radial squash is applied. Actual HIGH pin vertices retain a circular 7.6 mm
radius. LOW retains the measured mechanical envelope and omits its unresolved
pin caps through the existing quality-aware recipe. Source-based central drive
stock and thin crowns replace the generic broad drum; the idler retains annular
rims, hub/web stock and their real intervening air. Actual loaded road-wheel
centers are Y0.37879999998 m, with their existing six longitudinal stations and
0.332 m radius retained. This result supersedes the incomplete radius-only and
radially scaled shoe pilots.

The rear generic box was 80 mm below and 224 mm above the source Object_32
folded stock. Six thin asymmetric sheets/returns now preserve its measured
sections. Independent source-only inspection also found **31–34 mm of actual
source rail/track overlap**. The lower front ends therefore have a disclosed
hidden tapered receiving relief, up to 85 mm at the bottom and zero at the upper
edge, for the complete moving shoe. The source file remains unchanged. Two
held-out lower-tip rays explicitly expect this fitted clearance rather than
claiming source equality; the other 16 rear section rays preserve the measured
source surface. The upper returns retain 18–27 mm finite lap into the native
hull. Restoring the original overlapping tips fails the physical regression.

Fresh fill generation exposed an 85.8 mm exterior occluder when the thin folded
fittings were incorrectly treated as a broad hull envelope. Barak now uses the
existing primary-body fill boundary, retaining all gun stock and every exterior
fitting in the source/continuity/physical audits. Its genuine primary boundary
has 9 residual voxel cells (about 0.14 L); the generator emits **zero boxes** and
does not suppress that residual. Deleted-primary-plate and missing-owner
negative controls remain active. The failed 109-box generated record is retained
privately as `fresh-rear-failed-fill-r4.generated.ts`.

| Final bounded check | Result |
|---|---|
| Fixed-source geometry | whole 92.3731, dimensions 96.3089, floaters 100; unchanged 92 minimum |
| HIGH and LOW strict tracks | zero band, shoe and full-loop collisions |
| Actual rear moving stock | 264 phases over 4 terrain cases; 148,428 instances; 35,731 candidate triangle tests; zero intersections |
| Rough-field wheel contact | Existing 37-build suite passes unchanged 3 mm cut, 30 mm daylight and 30 mm travel limits |
| Filled continuity/equipment | 0 unexpected / 79 raw cells; 14 source/native guards; actual roof MG 1 |
| Selected geometry | HIGH 90,742 triangles/45 objects; LOW 49,390/44, 54.43% of HIGH |
| Legacy controls | Authenticated Mk.4 X 520-phase physical test; exact historical target and 40 inverse-transform negative controls pass |
| Native checks | HIGH/LOW finite contacts, circular pins, open idler stock, intrusion/missing/moved/fill negatives; type check passes |

This is author-side physical/source qualification. Final combined generation,
independent 14-view/Garage review and complete release validation remain the
integration owner's responsibility. The retained generic rear closure has a
measured local source-air mismatch at X±1.45 / Y1.35 / Z−3.98; it was not expanded
into unrelated geometry work or represented as exact source stock. The source
shape gate above includes it.

Final private receipts live under the isolated checkout's
`.qa-dev/barak-physical/`: `final-r6.log`, `standard-r6/merkava4_barak.json`,
`strict-r6-high/`, `strict-r6-low/`, `cost-r6.json`,
`qualified-openings-r6.json`, `mechanics-r3.log`,
`mechanics-r3-continue.log`, `rear-band-proof.json` and the final identity
manifest. Independent source rear sections/self-overlap are under
`.qa-dev/critic-barak-rear/`. No source binaries or private captures belong in
this commit.

The final small options-helper extraction has exact emitted native geometry,
attributes, instances, transforms and material-value parity in ten builds
(five Merkava/Namer IDs × HIGH/LOW). Its proof is `parity-before-r7.json` versus
`parity-after-r7.json`; focused native/type/history checks pass after extraction.
All eleven new or modified helper/policy modules pass strict complexity limits.
The three inherited `merkavaX.ts` complexity violations remain at their original
cyclomatic/cognitive counts; this correction does not add a new family branch.
