# Continuous shoe floor foundation — verified non-activating checkpoint

This opt-in foundation does not activate a profile, change a mesh, or claim a
fleet-wide track repair. Per-vehicle primitive/profile changes and complete
anatomy, asset and composed release gates remain separate and pending.

## Contract

- `continuousShoeFloorYM` is an independently certified complete native
  near/far shoe-course minimum, including all vertices, both sides and the
  declared tangent or finite-span placement. It is not a clearance epsilon.
- The shared contact metadata and both gallery/garage seating paths retain
  the lower of their existing measured stock and this certificate.
- The supported authored hull frame is identity with a unit root visual
  scale. Contact setup, presentation seating and simulation sync explicitly
  reject other hull translations/rotations/scales or root visual scales.
  Ordinary root world translation, yaw, pitch and roll remain supported.
- The first opted-in ground sample initializes actual suspension conformance;
  later damping and all non-opted-in behavior retain the original formula.
- A neutral-course certificate does **not** bound arbitrary deformed terrain.
  Nonflat terrain, contact fit and visible hovering require independent tests.
  A safety envelope 31 mm below the loaded line is not an acceptable fitted-track
  result merely because it prevents penetration.

## Proof support

`tools/track-course-intervals.mjs` uses the actual native Float32 carrier and
authored course metric. It partitions every segment/tangent or finite-pin
transition, bounds trigonometric extrema and supplies an analytic Float32
instance-upload error bound. The helper regression contains 38,912 independent
native-matrix heldouts, including between-endpoint extrema and invalid topology.
Its tolerance is arithmetic containment, not permission to overlap geometry.

`continuousShoeFloor.selftest.mjs` covers explicit certificates, lower existing
stock retention, absent-option exact defaults, first/later conformance and
negative frame/scale controls. Both helper regressions pass.

An inactive-core differential was frozen before and after the shared seam in
`cot-t80u-x-outsole-pilot-20260908/.qa-dev/t80u-outsole-baseline-ZQblP3` and
`.../t80u-outsole-baseline-fxLLGf`: HIGH 38/LOW 37 native mesh records, all geometry
attributes/indices, transforms/instance matrices, source receipts, local axles
and contact metadata compare exactly. No original fixture was regenerated.

The separate T80 candidate's native certificate
`.../.qa-dev/t80u-outsole-certificate-24kIqY/receipt.json` bounds the actual
finite-span course at −0.006500219911 m. Its independent 128-phase matrix check
reaches −0.006500007176 m; the outward-rounded −0.006501 m profile certificate is
approximately 1 µm below the loaded tread line. That pilot's actual HIGH/LOW
neutral presentation and 180-frame live-flat simulation checks passed, with
0.993–0.997 µm all-shoe ground gaps. Those profile opt-ins are **not** part of
this foundation commit. Native visual and final release checks remain pending.

The independent nonflat diagnostic is explicitly **not passing**:
`.../.qa-dev/t80u-nonflat-ground-Lc0PuO/receipt.json` records a −35.776 mm
cross-slope transient, −3.429 mm on a 20 mm smooth bump and −2.650 mm in a
shallow hollow. These actual deformed-shoe/terrain counterexamples require
legacy attribution and further mechanical/conformance work. The neutral
certificate must not be advertised as clearing them or the whole fleet.

An early offline refinement attempt stopped at its depth guard because its
requested interval width was smaller than the separately included Float32
error bound. The stopping criterion now subtracts that same bound before
testing interval convergence; the emitted conservative lower bound still
includes the full upload error. No geometry acceptance threshold was loosened.

## Independent integration verification — 2026-09-08

Runtime commit `87353fd1f246fe17598e2e6625b8403743857f6c` is based on
published `96304baf18d733b80565769a2906d4df7c9aa66a`. This is the same
non-activating foundation as isolated candidate `079bd2e8079ef07db045dd1d04e52886b8cb6776`;
do not apply both when integrating a pilot.

The independent baseline is `41f7eaff8e649dbaf75c665d642ed7e05509d2d1`.
Its vehicle and movement sources are byte-identical to the integration base.
Sixteen actual factory cases (HIGH/LOW for `t80u_x`, `t90a_x`, `t90m`,
`t90sm`, `m1a2`, `leo2a5`, `m60a1`, `merkava4_x`) compare exactly before/after:
native attributes/indices, instance matrices, hierarchy, transforms,
seating/contact outputs and four recorded states across twenty-four actual
sync steps with unequal track travel and nonflat sampling. This tests
absent-option behavior, not a terrain
certificate for either opted-in pilot. No expected fixture was regenerated.

| Check | Result |
| --- | --- |
| Sixteen independent native default cases | PASS — exact deep comparison |
| Ten focused regression files | PASS |
| Original suspension/floor checks | PASS — all 174 playable tanks; five suspension families |
| Continuous interval helper | PASS — 38,912 native-matrix heldouts |
| New support modules' complexity/type inventory | PASS — 17 functions; zero complexity violations, explicit `any` or `unknown` |
| Typecheck and core-unused check | PASS |
| Public build | PASS — 925 transformed modules; 174 procedural playables, zero GLB-sourced |
| Tracked runtime/tool/config input guard | PASS — no changes during validation |

The ten files are `continuousShoeFloor`, `track-course-intervals`,
`roadWheelRestHeights`, `suspensionPatterns`, `fleetFloorClearance`,
`runningGearCadence`, `trackShoeDimensions`, `roundedTrackContact`,
`tankAssets`, and `track-geometry` selftests. The two new modules were checked
with `node tools/code-quality-metrics.ts src/vehicles/continuousShoeFloor.ts
tools/track-course-intervals.mjs --gate`. This is not a claim that the legacy
factory's entire complexity inventory has been retired.

Local frozen evidence:
`cot-continuous-shoe-foundation-20260908/.qa-dev/foundation-verified-lxOJKb/receipt.json`,
SHA-256 `4ba41fda1118fdb5870468e38b538588cc4e624a8d54e7929412799753b3117f`.
The baseline/candidate recorder SHA-256 is
`269c24a8d6462423738f7eaf09f968c3bf82103e2efc1444fc192d35d606d612`;
the orchestration driver is
`4f55091044ecbcbb2f059d70c20326b26387f82a8d96bb61487e62767840c1ce`.
Those ignored diagnostic files and private sources are not shipping artifacts.
The standard build's chunk-size warning remains; it is not a measured switch
latency result.

Full `npm test`, per-vehicle geometry/anatomy release, actual browser switching,
and admission of new running gear are **not** certified by this checkpoint.
No runtime profile opts in here and no model, icon or technical diagram changes.
The [59-vehicle priority](../tank-generation/fleet-style-performance-priority.md)
and both terrain/cadence pilots remain open.
