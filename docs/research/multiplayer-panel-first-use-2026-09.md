# Multiplayer panel first-use preparation

## Why this follow-up exists

The strict scene preparation in `92d55cdbd` is not a complete loading-performance
fix. Its integrated two-client report at
`/private/tmp/cot-shader-admission-integrated-native-20260908-r1/report.json`
still contains substantial frame gaps. The following attribution uses the
report's page-relative timestamps, not a presumed mapping from a maximum RAF
gap to one JavaScript function.

| Integrated observation | Interval (ms) | Evidence |
| --- | --- | --- |
| Host maximum RAF gap | 8079.8–8272.3 (192.5) | World acquisition; one 53 ms long task; no program-count growth |
| Guest maximum RAF gap | 3683.0–3873.4 (190.4) | World acquisition; one 53 ms long task; no program-count growth |
| Host largest long task | 9669.9–9797.9 (128) | Final shadows; maximum recorded cascade 129 ms |
| Guest largest long task | 4396.1–4491.1 (95) | World-build tail, activation, then initial roster construction |

Both maximum gaps occur after roster-asset painting finishes. The evidence does
not assign their full duration to one synchronous builder. Main shader
preparation completed with zero pending programs; its overlapping maximum RAF
gaps were 19.0/49.1 ms. The panel joins added effectively no extra waiting.

Opening effects remain another cost center. In the earlier C1 capture,
`/private/tmp/cot-shader-admission-candidate-native-20260908-r1/report.json`,
the host's 303.3 ms RAF gap spans opening effects plus activation. Its exact
opening compositor draw took 280.2 ms: SceneAA 185.8 and LateFx 92.4 ms. The
integrated opening draws took 56.6/36.3 ms, but still created two depth-program
variants during SceneAA; ACTIVE_UNIFORMS queries cost 28.5/5.6 ms. Acquisition
fingerprints differ, so these are attribution observations, not a controlled
performance improvement claim.

## Panel defect established from source

`tankThumbs.compileMaskPass` previously retained only each selected material's
`currentProgram`. Installed Three.js 0.185.1 can compile multiple variants for
one material, including different mesh classes and both transparent sides.
Later world rendering can also change `currentProgram` during a task boundary.
The selected material's entire finite program cache must be captured at the
submission boundary to cover those variants.

More importantly, `topMaskProgramWarm` only called `isReady()`. Installed
`WebGLProgram.js` separates link readiness from the lazy `getUniforms()` and
`getAttributes()` tables. Leaving those tables untouched can put native
reflection into the first real hull draw. This is a concrete preparation gap;
it does not prove that every millisecond of the older 216.9 ms guest hull draw
was shader reflection. Geometry and batch-control uploads can also occur there.

[MDN's parallel shader compilation guidance](https://developer.mozilla.org/en-US/docs/Web/API/KHR_parallel_shader_compile)
supports polling completion before first use; it does not promise less total
GPU compilation work. [WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)
also identifies synchronous query/readback hazards. The installed renderer
implementation is the source of truth for the actual table lifecycle here.

## Candidate and verification scope

The candidate prepares every captured panel variant's uniform and attribute
tables cooperatively, after readiness, and revalidates the borrowed source,
renderer and exact program handles before drawing. It must retain the existing
five-second deadline, bounded scheduling, exact source clone/materials, separate
hull/turret masks and asynchronous readback ownership. No quality, shadow,
countdown, transition or nonblack-reveal threshold is reduced.

The next comparison baseline is frozen at `55563cd01` in
`/private/tmp/cot-mask-reflection-baseline-20260908.M3Pgri`. Its preserved dist
was built from runtime `92d55cdbd` before the documentation-only `55563cd01`:
index SHA256 `b0570c5c51d56633c83dab2f7272cbb50c9cb00ee641c63833c1648f2acf1f65`.
The native test uses the unchanged committed acquisition and new output paths.
The paired candidate index SHA256 is
`9bea0c4d670f1c4ea48e888d90c68291fc070f51012b2a410720f8cb5c8e0f6c`.
Both native runs passed their functional entry/cleanup gates. The tested
candidate was built before commit (`v1.0.0+g55563cd01.dirty`); its complete build
SHA256 is `23084aca955843109e4a5c7cfd790e3666d27503cff2478dd8c7d0ffcd835144`.
The complete build and acquisition hashes remained unchanged within each run.

## Code verification

The following focused checks passed on the candidate:

- Panel-program preparation and real mask-export tests, including retained
  non-current variants, duplicate references, reuse of the same native wrappers
  across hull/turret compilation, both reflection tables, finite scheduling,
  missing evidence, context replacement, and failed-readback queue drains.
- Engine program preparation and the 59-case scene-preparation suite.
- Network presentation, launch, activation and ready-barrier suites.
- Native private-room helper selftest and the 17-case immutable-build probe
  selftest (these CPU fixtures do not constitute a live browser receipt).
- `npm run typecheck`, including core unused checks, and `npm run build`,
  including locale/GT validation and the public-asset stripping checks.
- Scoped code metrics: two runtime files, 99 functions, zero complexity,
  explicit `any`, or explicit `unknown` violations.

The first typecheck exposed the upstream declaration's different view of Three's
program wrapper. Registry membership now uses `Object.is` for exact object
identity instead of an incompatible structural comparison. Both panel suites,
typecheck and the public build passed again after that correction; runtime
identity checks were not weakened.

Read-only React Doctor baseline: 43/100 across 1,952 files, 42 errors and 526
warnings (exit 1, retained). Changed-file scan: 90/100 across four files, zero
errors and seven warnings, all in tests: six deliberately sequential async
failure cases and one assertion-only chained array traversal. No runtime
finding was added or suppressed. Whole-repository and changed-file scores have
different denominators and are not a measured score improvement. Diagnostics:

- Baseline: `/var/folders/yl/sxf0v4tn14n2pkwqmf_21l540000gn/T/react-doctor-a77c3cc7-12b6-415f-ab87-5de1c16f6f05`.
- Changed files: `/var/folders/yl/sxf0v4tn14n2pkwqmf_21l540000gn/T/react-doctor-d5ad5cf0-6def-4079-9b46-5584f723386c`.

The full fleet-wide `npm test` suite was not rerun for this panel-only slice.

## Matched native entry receipt

Reports (baseline first, then candidate):

- `/private/tmp/cot-mask-reflection-baseline-native-20260908-r1/report.json`
- `/private/tmp/cot-mask-reflection-candidate-native-20260908-r1/report.json`

Both used two fresh contexts on this one machine, local-loopback signaling,
clear/day Winter, high quality, render scale 1, and the unmasked Apple M5 Max
ANGLE Metal backend. The common 21-file acquisition SHA256 is
`de883652b8f729f2ca0bcffb0bdc6f1d0e9308d8bc3ff4c8b8ee29af23b0d091`.
The shared capture queue serialized the runs; queue waiting is excluded from
the scenario/loader measurements. This is not production, distant-network,
separate-device, screenshot, or idle-GPU certification.

| Milliseconds, host / guest | Baseline | Candidate |
| --- | --- | --- |
| Launch to loader hidden | 2784.2 / 3563.0 | 2853.2 / 3132.1 |
| Maximum loading RAF gap | 170.9 / 166.9 | 188.4 / 165.0 |
| Complete panel preparation | 91.9 / 414.5 | 143.2 / 372.7 |
| Hull compile/preparation interval | 39.1 / 94.4 | 67.9 / 154.6 |
| Hull draw | 1.8 / 1.8 | 1.4 / 1.7 |
| Turret compile/preparation interval | 5.6 / 4.9 | 39.9 / 31.7 |
| Turret draw | 1.1 / 1.3 | 1.1 / 1.1 |

The additional required reflection is now inside preparation, but this single
pair does **not** demonstrate an overall speed improvement: the host's loader
and maximum gap were worse, while the guest's loader was faster. Mask draws
were already short in the baseline. Guest hull readback size-query timings
were 108.1/108.9 ms baseline/candidate; that separate cost remains untouched.
Do not attribute the older stalls entirely to the panel defect.

Both clients in both runs showed 5, 4, 3, 2, 1 before rollout, completed their
panels and strict main-scene preparation (zero pending programs), passed the
source nonblack/reveal gates, and exchanged advancing battle inputs/snapshots.
No page errors or dropped observation records were reported. Both rooms,
browsers, preview servers, signaling services and capture leases were closed;
zero owned rooms remained. These are successful functional regression checks,
not a claim that the remaining performance goal is complete.

## Still open

- Exact world-slice attribution for the roughly 190 ms integrated RAF gaps.
- Final-cascade first-use work and depth-program preparation, without removing
  the exact shadow draw or changing caster/material quality.
- Repeatable total loading time and frame budgets across repeated native runs.
- Historical 214–319 ms stalls are not comprehensively explained or fixed.
