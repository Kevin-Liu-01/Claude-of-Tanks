# Fleet base-shell repair review — 2026-10-06

The audit covers every playable vehicle, including X variants, in HIGH and LOW. **A complete census is not a claim that the entire fleet is visually accepted or free of defects.** The source repair batch addresses specific malformed welded stock; remaining findings and intentional forms are kept separate in the [per-vehicle ledger](FLEET-DISPOSITIONS.md) and [machine-readable witnesses](fleet-dispositions.json).

Native before/after Garage captures, regenerated interior fills and combat anatomy, strict track checks, and final release qualification are a separate integration chain. Their status is pending in this independent source-review receipt. No numerical source-fidelity acceptance is awarded here.

## What the repair changes

The welded-stock changes preserve authored boundary datums while replacing inward diagonal dents with outward, finite triangle facets. Four noncoplanar corners cannot form one plane: the opt-in helper selects the physical outward ridge, producing two deliberate planar facets. It does not make those four corners coplanar, alter casting normals to disguise a malformed surface, or convex-hull an entire vehicle. Deliberate wheel wells, gun openings, asymmetric roof heights, and casting profiles remain part of the model.

The Abrams family correction instead explicitly constructs matching flat cheek fronts and planar roof courses around the retained gun opening. Other bounded repairs correct crossed roof/floor ordering, triangulate concave roof caps without a center fan, and seat removable armor and equipment on actual emitted planes.

The source-derived Abrams ERA partition now leaves at least 1 mm of vertical permanent backing where the rising native bevel makes a full-depth cover impossible. It preserves the unspent exterior and leaves the thin perimeter as original permanent armor. Source/combat qualification of that armor remains separate from mesh integrity.

## Method and limits

Run from the vehicle worktree:

```sh
node tools/base-shell-surface-audit.mjs --out=.qa-dev/surface-repair/final-authored-audit.json
```

The tool obtains its scope from `ALL_TANK_IDS`. Defaults are every playable ID and both quality paths; explicit subsets disclose every omitted ID. It fingerprints all runtime/checker source files before dynamic imports, after initialization, and after the last build. It captures actual procedural builder parts in hull, turret, and permanent external-armor buckets with source-call provenance.

The screen examines large structural candidates (extent at least 0.75 m and area at least 0.35 m²), omits explicitly tagged ERA, and preserves counts of excluded parts. Legacy ERA and stowage that use structural buckets require further explicit source-role classification. The screen does not inspect every decoration or small support.

Every triangle in each selected part is included in the crossing broad phase; there is no large-mesh cutoff. Strict noncoplanar intersections require finite triangle contact, opposite-plane straddling, and positive intersection-line interval overlap beyond 20 micrometres. A zero-length vertex-on-edge contact is excluded; the actual Dragun cap seam exposed this distinction during independent review. Shared-vertex and coplanar contacts need separate adjudication. A geometry can merge several separately closed, deliberately embedded solids: their intersections are attachment joints, not automatically self-crossing stock. Merkava 4 hulls are an explicit example.

Topology uses 10-micrometre coordinate keys and omits triangles whose area is at most 1e-9 m². Those diagnostic conventions do not certify native watertightness. Mirror sampling compares triangle interiors only when reflected boundary signatures match; intentionally asymmetric or unmatched parts remain reviewable. Concave adjacency flags also include valid wheel wells, gun apertures, roof steps, and casting transitions. Cast geometry must not be flattened based on those flags.

Coordinates are emitted owner-local geometry, including builder-applied scalar transforms, rather than posed world points. Exposure rays test captured primary stock of the same owner. They nominate camera directions; they cannot replace actual rendered evidence with all fittings and materials present.

## Focused evidence

| Check | Result and meaningful coverage |
|---|---|
| `weldedShellSurfaces.selftest.mjs` | Pass: 210 actual HIGH/LOW structural parts; physical face orientation, crossings, finite stock, mirrored interiors where intended; 108 T90MS ERA solids and Sabra cover seats. Old warped/crossed, detached-fitting, and phantom-surface controls are retained. |
| `abramsSourceXCover.selftest.mjs` | Pass: 2,400 exterior rays, 620 cover/backing rays, 3,741 native cheek rays; exact closed edges, volume conservation, unchanged exterior planes/normals, finite backing. Old native partition supplies a real crossing control. |
| `abramsCheekSurfaces.selftest.mjs` | Independently rerun and passed: seven family IDs × HIGH/LOW, flat front and roof courses, reflected triangle interiors, positive closed stock, unchanged central opening. Original twisted cheek is a negative control. Fresh census also checks the shoulder/body paths enabled by the option. |
| `baseShellResidualRepairs.selftest.mjs` | Pass: 52 actual HIGH/LOW parts across ten IDs; seven historic malformed controls rejected. Bow/tail datums, finite closures and shoulder courses, reflected returns, the retained gun corridor and Object695’s existing 90% scale are checked. |
| `base-shell-integrity.selftest.mjs` | Pass: independent exhaustive intersection oracle, shuffled input order, a crossing after triangle 250, actual native vertex-on-edge negative plus a penetrating mutation, separated/shared-corner controls, cap-boundary preservation, full/subset roster scope, input freshness. |
| `t90MSTurretArmorSeat.selftest.mjs` | Pass after correcting the historical test frame: the owner-approved 1.05 baked scale is asserted and verified against actual pre-bake vertices. All original envelope/chevron limits and receipt assertions remain; native protrusion/sag controls and 54 actual carrier-seat checks reject detached armor. |
| Primitive default replay | All position, normal, UV and index buffers for 160 baseline/current geometries are byte-identical: SHA-256 `7344384e517e797cdd4c6c23c3612af1d93dae79e656caee67c9b41f802ccb8b`. New triangulation is opt-in. |
| Adjacent regression checks | Section-solid, Europe gun ownership, Europe running gear, Lynx wheel stock, Marder 2, K2 X detail, K21 bow/rear stock, Carro roof, three Challenger 1 fitting/hood checks, Swedish tow ropes and UDES fidelity passed. |
| TypeScript / whitespace | `npx tsc --noEmit` and `git diff --check` passed at the source freeze. |
| Deterministic audit output | Two independent `strv103a,k21_x` HIGH/LOW runs produced byte-identical complete JSON; narrowed scope correctly disclosed 218 excluded IDs. |

Development logs and replay scripts are under `.qa-dev/base-shell-complete-20261006/`; the independent Abrams rerun is `.qa-dev/surface-repair/critic-abrams-cheeks-final.log`. These are supporting logs, not a replacement for the integration release receipts.

## Independent review findings

The new prototype gun-recess application revealed an indexed-input bug: `closedSlice` originally consumed `position` triples without following `geometry.index`, while the newly passed cylinder rings were indexed. The author was sent exact native part witnesses (prototype parts 99/100, plus apron part 96 for cap-boundary review). The corrected native prototype shell, apron and indexed rings now have zero boundary, nonmanifold, inconsistent-edge and proper-crossing counts in fresh HIGH/LOW evidence (`leopard-clip-final.json`). The original all-fleet snapshot retains its source-change rejection; it does not silently certify the later edit.

The bounded second pass repaired the AbramsX aft armor-layer inversion, Chieftain aperture returns, AMX-40 bow knee, Leclerc family closures, M48 lower bow, Object695 rear skirt returns and Hetman II shoulder facets. Their targeted HIGH/LOW censuses have no retained proper crossings in primary stock; AMX-40 stowage bins remain an explicit equipment exclusion. The independent reviewer did not modify the Leopard author’s files.

The stronger contact predicate removed 220 of the original 1,840 saved candidate pairs (including targeted-report duplicates): both plane tests can straddle even when the triangles only meet at one vertex-on-edge point. The Dragun, Sheridan, T14 X and Namer pairs were all contact-only under the corrected test. Earlier provisional descriptions of those pairs as through-face crossings are retracted. This is diagnostic adjudication, not evidence that their complete shapes or topology are visually accepted.

The ledger combines the original **220 IDs / 440 builds** with input-stable targeted supplements. Saved triangle-pair coordinates were re-evaluated with the corrected predicate without rebuilding or silently changing the original census. All source fingerprints, report hashes and later changed paths are explicit. Display coordinates are rounded to one micrometre; runtime checks use full precision. Identical LOW candidate lists refer to their HIGH record to avoid duplicating evidence.

Abrams supplied-X and Merkava 4 hull emissions deliberately merge separate closed stocks. Retained triangle crossings can represent embedded joins between those stocks; the first Abrams examples are lower-fold/side-return overlaps, not a malformed full hull. Component connectivity by shared edges alone is insufficient because touching stocks can become one connected graph. A further component replay matched 12 separate source stocks to the native M1A2X pre-ERA stream exactly. Every stock has zero proper crossings; all 83 final post-ERA intersections map to two different stocks using outward normals and three interior face samples at 2 micrometres. Barak’s two within-edge-component witnesses are roof/sidewall joins: all ten independently emitted section stocks have zero crossings and closed coherent edges. These are source-adjudicated construction joins; final native appearance remains pending. Detailed evidence is [composite-adjudication.json](composite-adjudication.json).

Supporting second-pass receipts are `.qa-dev/surface-repair/residual-repairs-final.json`, `last-three-final.json`, `residual-stock-selftest-final.log`, and `intersection-reclassification.json`. Later source/native correspondence review identified bounded Abrams return and XK2 chin follow-ups; their separate evidence is recorded below rather than backdating this earlier snapshot.

## Resolved historical test-frame failure

The original `src/vehicles/profiles/t90MSTurretArmorSeat.selftest.mjs` rejected merged exterior-armor maximum Z: expected at most 1.62 m, measured 1.6918962 m. An original git-HEAD profile/test replay reproduced that failure. Further source-history review established a frame mismatch: commit `f90de613b` introduced the 1.62 m authoring-frame limit on 2026-08-27; commit `245aa4e4e` added the owner-approved T90MS whole-vehicle scale of 1.05 on 2026-10-02. `resizeAuthoredVehicle` bakes that scale into all bucket vertices and records it on `rig_hull.userData.vehicleSize`.

The measured maximum is **1.6113297 m in the original authoring frame**, below the unchanged 1.62 m limit. The repaired test asserts the declared 1.05 policy and baked receipt, independently captures carrier/cassette vertices before resizing, and checks every installed coordinate against that source observation. It normalizes all geometric envelope/chevron assertions into the authoring frame; none of their limits were raised. Authored layout metadata remains in its existing frame.

The complete test now passes, including every original layout, density, flank-seat and weapon-tower receipt assertion. Actual merged-geometry mutations extending the nose beyond 1.62 m or sagging below 0.10 m fail. Direct ray checks of all 54 fitted cassette back surfaces against the actual emitted carrier pass and reject 50 mm outward displacement. The 4 mm maximum carrier gap has only a 0.3 micrometre Float32 representation allowance.

The earlier failed log remains as historical evidence: `.qa-dev/base-shell-complete-20261006/t90-existing-seat-baseline.log` and `t90-baseline-loader.mjs`. The final passing check is `.qa-dev/surface-repair/t90-seat-scale-final.log`. This resolves the fixture failure; it does not replace integrated release or native visual qualification.

## Source and native-buffer correspondence

The historical part census can include donor stock removed by a later builder. [SOURCE-ADJUDICATION.md](SOURCE-ADJUDICATION.md) separates those captures from actual native buffers, resolves the K2 cap-edge nominations, and preserves cast/open-bottom qualifications. The [first bounded receipt](native-stock-adjudication.json) covers eight IDs HIGH/LOW; the [family supplement](native-stock-family-adjudication.json) covers twelve more, including a source-declared Type90 transform that must not be mistaken for discarded geometry.

The identified Abrams return and XK2 chin defects now have narrow fixes with independently rerun actual native HIGH/LOW regressions. The source adjudication records exact scope, meaningful historical negatives, preserved datums, and remaining native visual/release requirements. These bounded receipts are not a new all-fleet release claim.


## Pendekar donor rebuild and drone integration follow-up

The owner requested a complete `pt91m` redesign using the actual `t72bu_x`
T-72BU core. The current [Pendekar packet](../../references/tanks/pt91m.md)
records the photo, donor, original historical comparison and new physical
checks. The stock donor remains unchanged at both detail levels; Twardy's
full serialized spec also matches the baseline after isolating its inherited
armor and track-width metadata from this redesign.

Independent contact review and 288 complete gun poses pass. A newly measured
Pendekar drone seat passes support, full weapon motion and 12 m takeoff
clearance across HIGH/LOW and three camouflage seeds. The earlier nine failed
drone placements now pass the same six-case check with actual receivers,
connected braces, tightly bounded permanent support surfaces, and correct
fixed-casemate traverse. The failed first all-fleet generation report remains
under `.qa-dev/surface-repair/attempt-1-failed-drone-seating/`.

These focused checks do not replace the queued final all-fleet generation,
440-build stable geometry census, native visual review and release checks.
The isolated batch now contains 83 changed vehicle IDs. Publication status and
remaining checks are recorded in [PUBLICATION.md](PUBLICATION.md). The immediate interactive
Pendekar review uses the actual native Gallery and refreshed interior stock;
saved before/after screenshots remain queued on the shared capture service.
