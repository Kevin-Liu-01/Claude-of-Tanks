# T-90A X fixed fender closure — 2026-09-10

This checkpoint recovers the upper-side and curved front fender returns only.
The source-sized published road wheels, track dimensions/course, hull/turret,
and canonical red Shtora remain unchanged. It is not the thicker-track rollout
or completion of the 59-vehicle style/performance contract.

## Scope and early checks

Four closed, mirrored bent-sheet primitives add 144 triangles at either LOD.
The 15 mm shelf and 18 mm outer lip have positive-volume laps into the existing
roof/skirt stock. The curved front return follows all seven original roof
stations. Its underside tapers around the moving end course. Fixed camouflaged
bodywork stays visible independently of greeble LOD and survives ERA depletion;
it does not create additional ballistic armor. Lower road-wheel faces remain
exposed, as requested.

The focused regression passes HIGH/LOW with 68 finite attachment witnesses,
100 side/front closure rays and 204 conservative continuous-course bounds per
LOD, including near/far shoes and every carrier cell. The historical ERA test
subtracts only the exact 432 added vertices, with multiplicity, and applies the
existing exact Shtora inverse. The immutable non-gun geometry hashes still
match: no hidden running-gear changes or rewritten historical goldens.

On base `154c505d6`, the early strict standard passes: geometry minimum 92.5/92,
zero band/shoe intersections, zero enclosed continuity holes, and the existing
roof machine gun. Native source fidelity is 97.6. The colored comparison,
24-view turntable and articulation board were inspected; camouflaged returns,
lower-wheel visibility and red Shtora are retained. Types and ERA history pass.
Local evidence: `.qa-dev/fender-preflight-5OIFeZ/receipt.json` and
`.qa-dev/fender-release-pgylkf/`; temporary comparison images are not shipped.

## Held running gear is a separate checkpoint

The broader original-country-gauge integration remains local at `69c70d619`
in `/private/tmp/cot-selftest-throughput.1EwVa0`. Its strict geometry minimum
is 74.6/92, despite passing the earlier contact checks. It must not be pushed
as qualified or merged wholesale. The maintained pilot additionally preserves
`baa967dfc`: actual 24-case HIGH/LOW 15/30/60 Hz terrain regression passes with
17.13% fewer measured terrain queries than `670843c39`. Neither that contact
pass nor this fender release certifies the held source silhouette.

The release sequence rejects geometry/contact failures before full-fleet
generation, then uses the unchanged four-worker test policy for eligible
checkpoints. Full anatomy, selected assets and complete release results follow
below when measured; the early checks alone are not a complete release.

First complete-release attempt `fender-release-pgylkf` remains **FAIL**.
Full anatomy update/check and selected assets passed, but the later rendered
centering check measured 0.53 px against the unchanged 0.25 px limit. The new
opaque fender stock changes the top-mask centroid; the presentation anchor
must be regenerated. The full npm lifecycle had not started. All 207 unselected
asset records remained unchanged in this attempt, and no combat calibration
or marking-seat source changed.

The second attempt `fender-final-vrClGk` also remains **FAIL**. The regenerated
anchor passed the strict live and saved-image centering checks, but the full
npm pretest stopped at a newly added malformed-CLI control: trailing `--ids`
returned `undefined` from the option parser and exited 1 instead of the intended
explicit rejection (2). The parser now falls back for a missing argument, and
both negative cases pass directly and under the real selftest child environment.
No geometry, thresholds, or test assertions were removed to address this failure.

Third composed attempt `fender-qualified-TtdjNw` remains **FAIL**. All 302
pretests and 613 core tests passed; posttest `tankFactoryStaging.selftest.mjs`
rejected its pre-batching M1A1 snapshot with `batchStatic + battleDetailLod`.
The first three unbatched fixtures passed. Published commit `2963f43c2`
introduced the new articulated shadow batch; none of this checkpoint's T-90A
changes touches M1A1. That ownership contract must be reconciled without
blindly replacing the original fingerprints.

The remaining nine posttests subsequently passed in diagnostic-only run
`fender-tail-kAXwMQ`, including four real native GPU tests. Private and public
builds passed there too. These are not substituted for an uninterrupted passing
release. Exact-current presentation tooling metrics pass (48 functions, zero
violations, no explicit `any`/`unknown`), and attribution passes. The four-worker
pretest took 528,951 ms versus 1,691,762 ms summed child time; core took 678,754 ms
versus 1,600,427 ms summed child time, including 142,768 ms FIFO wait.

The factory contract correction retains all six golden hashes. Their original
source SHA-256 `a8f314131f821dbbe878c49ffefbf1794de99ae8cdfdfe0ec75dd09fedc2625c`
matches `56fdbe284:src/vehicles/tankFactoryCore.ts`; independent owner review
confirmed the precise topology change in `2963f43c2`. Only the historical
receipt build suppresses that exact-one-call shadow batching finalizer. All
other proxy creation, materials and finalizers stay active. Current sync/staged
receipts are compared in full without normalization, and the batched fixtures
must actually contain the published `BatchedMesh`. Cancellation, resource and
timing assertions remain. No runtime source or immutable hash is changed.
