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
