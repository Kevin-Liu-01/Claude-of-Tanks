# T-90A X — owner-excepted local comparison source

Status: **release-qualified — 2026-09-06T10:49:59.926Z**.
The final **2026-09-06T10:06:54.116Z** capture records raw fidelity
**97.37276953943785**, minimum whole view **96.12523917559459**, and raw
geometry minimum **92.32764166415646**: [exact fidelity](t90a_x.fidelity.json),
[exact geometry](../../geometry-gate/t90a_x.json).
All registered valid 92-point floors pass; strict band/shoe/full-sweep
intersections and continuity holes are zero. Mandatory anatomy/assets, 510 selftest files, typecheck and private/public builds passed in the composed
batch. The checkpoints below are historical; source-use restrictions and
acknowledged physical simplifications remain unchanged.

The final release's corrected visible-muzzle mask exposed a real gun failure
(91.6386, below the unchanged 92 floor). The [source gun receipt](t90a_x.gun-source.json)
records the A-only repair: measured two-stage taper, proper evacuator, four
separate five-millimetre jacket seams, and removal of a false near-muzzle MRS
box. The core, donor, comparison frames and masks remain unchanged; fresh
release evidence supersedes the earlier scoped scores below.

The independently checked [RWS bracket scalar receipt](t90a_x.rws-bracket.json)
pins the inclined fork arms, beveled pivot blocks, real open fork and adjusting
boss. At X 0.42/0.43 the actual boss reaches Y 2.72169 m. The old paired
vertical boxes omitted that elevated inboard shoulder; neither the mast nor
the comparison camera was changed to compensate.

The new first-party `buildT90AX` is authored independently in `t90X.ts`.
An earlier scoped proof on 2026-09-06 recorded fidelity 96.48 with every valid
component/view ≥92 and primary geometry 92.3. Official band/shoe/full-sweep
intersections and body-contiguity holes are all zero; the actual visible MG
census is one. The [exact final receipt](t90a_x.fidelity.json) is preserved.
The source-sized paired rear neck/hinge/guard repair closes the former eight
body gaps without closing the real underside air. Final fleet-wide generated
receipts and release integration subsequently passed, including the later gun repair.

The eighth proof cleared every fidelity view, but primary geometry remained
90.1/92. Subsequent source-only refinement restores the raised asymmetric
left aft fender case (roof 1.53254 m; latch 1.53935 m), the narrow drum
strap tensioners (top 1.82427 m), and stepped meteorological mast sections.
The mast neck at X −0.390/Z −1.00694 ends at Y 2.64861; neither its position
nor a score camera was shifted. The forward upper skirt backing now slopes
down with the actual fender instead of filling its bounding-box roof. New
fixed-source ray assertions and the final numerical recapture now pass.

The owner-supplied `t-90a.zip` has SHA-256
`99da2b1357a199e4fdbb2596de984549e23157a34f04a2fe6149a06b3aaf83ab`.
Its nested `t90a.fbx` has SHA-256
`7b48c514290a03f12711e080e930e60df2890e0e50862dc816f374f09c34bfe3`.

The download date, title and 18,101-triangle topology match
[42manako's T-90A](https://sketchfab.com/3d-models/t-90a-d65cc8e8ac6d42598c170ec49ce2846b),
published January 5, 2026. The uploader explicitly identifies the model as
ripped from **Combat Mission: Black Sea**. Its displayed CC-BY-NC label
does not override that confirmed commercial-game origin.

The archive is normally ineligible under `docs/GEOMETRY-GATE.md`'s
commercial-game extraction prohibition. Inventory identified 142 mesh nodes
and 127 non-mesh markers, with game-style fire/exhaust/crew hardpoints. Those
observations establish the confirmed source provenance.

## Dated owner exception

On **2026-09-05**, after being told about the confirmed extraction, the owner
explicitly directed use of the supplied files because they do not enter the
actual game. That newer instruction permits this batch's **local measurement
and comparison only**; it does not clear redistribution or permit source
vertices, indices, mesh topology, textures, rigs, or buffers in playable code.
Any local GLB remains ignored and excluded from public assets. The new model
must be wholly first-party procedural construction and retain the unchanged
92-point exemplar comparison and independent shaded review requirements.
The existing `t90a` remains unchanged.

## Source registration and independent construction

The source axis map is `(-Y, Z, X)` to game `(X,Y,Z)`. XY is uniformly
scaled by 1.0150648514 to the 3.78 m exterior width; longitudinal scale is
1.0813369340. The largest closed `hull.001` body island supplies the hull
midpoint and 6.86 m structural length. All drum/fender/gun vertices receive
the same longitudinal transform: there is no separate muzzle compression.

| Measured neutral datum | Metres |
| --- | ---: |
| Structural hull length | 6.8600 |
| Exterior hull length including fuel drums/fenders | 7.9922 |
| Exterior width | 3.7800 |
| Complete gun-forward length | 10.4586 |
| Roof-equipment height | 2.8266 |
| Main turret shell width / length | 2.9522 / 2.8157 |
| Main turret roof | 2.2049 |
| Physical muzzle Z / bore Y | 6.2642 / 1.8174 |

The exterior length is a **source-fit datum**, not a claim that published
T-90A dimensions are 10.46 m. Structural length and exterior hardware are
deliberately recorded separately. Source turret/mount descendants establish
ownership; their baked zero origins do not establish animation pivots. The
inferred physical yaw seat is `(0.010,1.468,-0.0039)` and trunnion is
`(0.005,1.8174,1.30)`. No source animation is claimed.

The runtime uses an original closed tub and separate low, flared turret,
three forward side ERA panels per side, individual two-stage cheek wedges,
framed Shtora emitters, source-handed cupolas/NSVT station, paired rear
drums, and six independently located native road-wheel stations. It never
calls the preserved T-90A builder. The single animated native belt carries
all shoes; no second source or static shoe course is added.

`tools/t90x-source-oracle.py` checks the raw model hash and recreates only an
ignored `public/models/community-candidates/t90a_x_source.glb` and local
JSON receipt. `t90XGeometry.selftest.mjs` inspects actual end-cap triangles,
roof rays, bore vertices, wheel instances and rigid yaw articulation. The
comparison remains `qualityBar: exemplar` with every valid view/component
requiring 92 and source-fit dimensions requiring at most 3% error.

The unchanged canonical source's filtered body extent is 7.888 m long and
2.727 m high in the shared 1024-pixel/P95 geometry measurement. These are
separate from its 6.86 m structural hull, 7.9922 m complete hardware envelope
and 2.2049 m structural turret roof. No candidate determines these targets.
The source left/right shoe centre lines differ: -1.45825/+1.48365 m.
Source wheel tires already matched the native width, while generic hub
details projected about 0.10 m too far. A profile-only axial face-depth
override and suspension-bound shallow pressed faces seat that equipment;
the original fleet geometry is hash-regression tested without this override.

The intact `support wheels` source node contains three rollers per side:
Z −1.6497, 0.3703 and 2.0961 m, axle Y 1.00456 m, radial radius
0.110695 m and full axial depth about 0.1878 m. The native roller grammar
uses these measured stations and an inward axle offset; no static duplicate
supports are added. Straight-run shoe witnesses are 0.0601 m for the outer
casting and 0.1575 m including its inward guide. The source's narrow raised
thermal-jacket seam is about 0.005 m wide, not a thicker round bore. All
tube fixtures, including that seam and the evacuator, belong to native recoil.

## Seventh local proof and physical corrections

The source front mudguard is a thin bent skin: at Z 3.40 m its top is
Y 1.247 m, bending to Y 0.857 m at Z 3.782 m. Outer side-armor sheets
lean from X 1.835 at their lower edge to X 1.890 at their upper edge;
the 55 mm bounding-box depth is not a 55 mm rectangular plate. Their
three top heights are 1.4379/1.4198/1.2969 m. Source drum bodies are
0.9590 m axially long, radius 0.3160 m and longitudinal radius 0.3369 m;
straps and brackets form the separately reported exterior envelope.

The seventh local proof passes every valid fidelity view (96.18 aggregate)
and official exact strict front/rear/full-sweep band and shoe checks are
all zero. Primary geometry remained unqualified at 86.5/92; this was not an
acceptance record. Actual-mesh rays pin the bent guard, inclined side sheet
and independent drum radius rather than self-declared receipts.

## Independent cross-plane refinement

The canonical source armor intersects X 1.862 m at upper Y 1.11463 m
on the third side plate. Its nominal 11.7 mm lateral skin is inclined;
the steel backing is about 10.1 mm farther inboard. The earlier 2 mm
draft skin and its 1.053 m selftest target were not source measurements
and have been replaced, retaining the same 23 mm ray tolerance. Source
lower curtains have a 0.72953 m hem and approximately 1.1444 m upper
edge, with shallow longitudinal folds. The separate left exhaust reaches
X −1.74952 m and Y 1.44677 m.

## Gameplay binding follow-up

The source geometry is retained while actual upper-glacis, forward-skirt and
cheek cassettes are bound to the six inherited ERA depletion zones. Permanent
backing remains. See [the exact-face binding audit](t90-x-era-binding.md);
fresh anatomy and shaded release evidence subsequently passed with this repair.
