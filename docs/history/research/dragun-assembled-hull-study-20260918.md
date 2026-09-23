# BMP-3M Dragun assembled hull correction — 2026-09-18

The approved source assembly retains the original frame and all source stock;
only the detached rear door is seated. The native hull still had an oversized
rear block, an overly high aft deck, and six thin rectangular front pieces.
The complete source has an open access recess between two rear wings and four
substantial wedge modules across the bow.

Source identity is recorded in the reviewed
[source assembly recipe](../../references/source-assemblies/20260918/bmp3m_dragun125_x.json).
Original canonical SHA-256:
`4fd69d170bf494b8a795bf5d6618e94db10c7cdb562b9f37210bc613f402af16`.
No source vertices, topology, materials or texture payload enters the runtime.

## Independent physical observations

Object_15's rear wings reach Z −3.916 m. Both wing roofs are Y 1.832 m,
with an exterior center recess at Z −3.7 m. Its central deck rises from
Y 1.85257 at Z −3.1 to 1.9814 near the turret; its tub floor is Y .5239.
The source rear door's measured assembled envelope is .783 m wide and
.970 m tall, seated near Z −3.27 rather than on the rear-wing ends.

Object_23 has four bow modules about .515 m wide, centered at
X −.7883, −.2682, .2519 and .7719 m. They extend to Z 4.23434 m.
Opposing source rays establish finite upper and lower faces, including:

| Z (m) | Upper Y (m) | Lower Y (m) |
|---:|---:|---:|
| 4.04 | 1.52914 | .98759 |
| 4.16 | 1.47361 | 1.21234 |
| 4.20 | 1.45510 | 1.33080 |

Sparse, independently authored closed lofts reconstruct these volumes. A
separate central hull and paired rear wings preserve the real access recess.
The rear covers and hatches are reseated on the corrected receiving roof.
The main gun, turret, running gear and source registration remain unchanged.

## Verification and remaining release work

The focused HIGH/LOW native test checks the three front-module sections with
6 mm upper-face and 2 mm lower-face tolerances, both wing roofs and central
deck/tub datums within 1 mm, and three open-recess rays. An added broad filler
is an explicit failing physical fixture. Actual generated interiors are loaded.
The test passes. All 18 gear meshes retain identical attributes, indices,
instance matrices/colors and world transforms in each quality.

The initial corrected build passes the unchanged nine-view fidelity gate
(95.2 aggregate) and geometry minimum 93.2/92; dimensions and floaters score100.
The following small lower-return and roof-cover seating refinement passes the
physical tests and requires fresh final composed qualification. The initial
receipt is diagnostic, not the final publication receipt.

Private local evidence is under `.qa-dev/tank-run/eastern-assembled-study/`:
`sections.json`, `bmp-calipers.json`, `bmp-native-r1.json`,
`bmp-fidelity-r1.json`, `bmp-geometry-r1.json`, `gear-preservation.json`,
and `focused-test.log`. Source-caliper records precede the authored change.
