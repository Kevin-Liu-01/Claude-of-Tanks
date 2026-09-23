# Covered multiplayer shader admission

## Scope and evidence

The published roster-asset overlap remains at `fcbcc961a`. This follow-up
addresses the transition from cooperative scene compilation to the first real
combat render; it does not change transport, assets, quality, shaders, lighting,
the five-second countdown, or the nonblack reveal test.

The preceding native captures are retained in
[the roster overlap report](multiplayer-roster-assets-2026-09.md). In its final
candidate, scene preparation ended with 158/136 pending programs, zero completed
reflections and exactly 120 queries after approximately 1058/1096 ms. Source
inspection explains that result: submission admitted the entire scene before
draining, and the drain could return normally after 120 polling rounds. The
network adapter treated generator exhaustion as success and swallowed compile
errors. Thus it could advance unfinished first-use work into an indivisible
render. This establishes an admission defect, not the precise cause of every
historical frame stall.

Installed Three.js 0.185.1 separates program readiness from `getUniforms()` /
`getAttributes()` first use. Its `WebGLProgram.js` lazily initializes those
tables through native GL queries. Readiness polling must precede that work where
supported. [MDN documents the nonblocking KHR completion query](https://developer.mozilla.org/en-US/docs/Web/API/KHR_parallel_shader_compile)
and [the blocking risks of ordinary GL queries and readback](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices).
Neither polling nor this scheduling change promises shorter total GPU work.

The panel is not redundantly rebuilding the tank. It clones the supplied live
visual with shared geometry/materials; the final prior candidate measured only
1.6/1.7 ms cloning. The first panel compile/wait took 4392.9/3847.7 ms, while its
second compile took 4.9/4.7 ms. A lightless, fogless mask scene legitimately uses
different keys, and Three already shares exact-key programs globally. That
first interval combines submission, driver work and delayed poll delivery; the
existing trace cannot separate them. Do not call it a proven four-second second
compile or eliminate real panel shaders to improve the measurement.

## Change under verification

- Strict scene preparation checks a 32-unreflected-program admission watermark
  after each restored native batch of at most 16 objects. It drains before
  admitting more work. Every captured material variant is retained. One atomic
  material/batch, or a concurrent panel job, can exceed the watermark; this is
  not a claimed global driver queue limit.
- One five-second budget spans submission and all drains. A separate finite
  1024-round guard handles frozen clocks without normally ending a 120 Hz job
  after about one second. This is a safety limit, not the optimization itself.
- A terminal result, independent of optional diagnostic counters, reports
  complete/zero pending or incomplete with a reason. Strict success requires
  actual uniform and attribute tables. Unsupported KHR retains the deliberate
  reflection fallback, not invented evidence of nonblocking readiness.
- Network entry rejects missing/incomplete results and native shader errors
  before opening effects or visual activation. It drains the observed panel
  job before Garage recovery; cancellation is normalized after cleanup.
- The main adapter consumes the generator's terminal result and closes a
  suspended iterator if its paint boundary fails. Targets, camera layers,
  context identity and program-handle ownership remain with the existing owner.

Legacy non-strict warm callers retain their best-effort policy. This change
does not certify the later shadow, compositor or readback stages. Those still
require real renders, readback draining and repeatable native measurements.

## Verification record

Baseline source is frozen at
`/private/tmp/cot-shader-admission-baseline-20260908.aKl9pW`, exact `fcbcc961a`.
Its preserved public-build index hash is
`9de635fc10cae8960feca04049925f09e63fb7101dff52beaa2850d33adfacc4`.
The baseline whole-repository React Doctor scan scored 43 with 42 errors and
524 warnings; its nonzero exit is retained, not represented as a clean scan.
Raw diagnostics are in
`/var/folders/yl/sxf0v4tn14n2pkwqmf_21l540000gn/T/react-doctor-d530460b-e411-4aa4-931f-94372ed461d5`.

The native acquisition callback now records bounded unmasked GPU identity
**after** timed observation stops. Missing/private contexts remain unknown;
software signatures are classified before hardware-like labels. This is
diagnostic evidence, not independent hardware certification. The harness
fingerprint changes, so both comparison builds must use this same harness.
Scene-preparation success must be judged together with the source-enforced
terminal-result guard and final pending counters, not cheap query durations.

### Fresh native baseline

`/private/tmp/cot-shader-admission-baseline-native-20260908-r1/report.json`
passed the entry and cleanup gates on the preserved build. Both clients used
clear/day, high quality and render scale 1. Both reported unmasked
`ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Max, Unspecified Version)`;
that is hardware-like backend evidence, not certification of an otherwise
idle GPU or separate physical devices. The acquisition fingerprint is
`3e7d160ca6e8d980443955d5a8be7bd184aaac306789d5a4c580fed9fbe52675`.

| Measurement (ms unless noted) | Host | Guest |
| --- | ---: | ---: |
| Launch to loader hidden | 3539.4 | 3709.3 |
| Maximum observed RAF gap | 201.5 | 235.7 |
| Scene compile/preparation interval | 754 | 487 |
| Maximum shader-status query | 201.3 | 28.9 |
| Final main-cohort pending programs | 0 | 0 |
| First panel hull render | 2.5 | 216.9 |

Unlike the earlier incomplete-cohort runs, this baseline finished main-cohort
reflection. The host's 201 ms long task aligns with its 201.3 ms native status
query; the guest's 218 ms long task aligns with its 216.9 ms panel render.
These identify cost centers in this capture, not the exact cause of every
historical 214–319 ms stall. Strict admission alone cannot certify panel
variants or promise removal of indivisible driver calls.

Both clients recorded the full 5→4→3→2→1 DOM countdown, nonblack watchdog
results, primed reveal, advancing battle and no application errors/dropped
observation records. Owned browsers, preview/signaling servers and rooms all
closed; the capture lease released. Background DOM countdown is not proof of
foreground presentation on a second device.

### Regression work

The engine suites pass, including 59 scene submission, identity and cancellation
cases. The network integration and native-acquisition selftest pass. The first
integration run exposed overly broad abort normalization that changed a later
fatal-shadow error; narrowing normalization to the shader/panel cleanup scope
restored the original error contract, and the integration rerun passed.

An initial strict metrics gate rejected `prepareSceneSteps` at cognitive
complexity 22. Reusing the extension-acquisition helper removed the duplicate
branch. The first release rerun passed all eight focused suites, metrics
(299 functions in three modules, zero complexity violations or explicit
`any`/`unknown`), typecheck, unused-owner checks and public build. The suites
cover program/scene preparation, network entry/launch/activation/barrier,
production UI acquisition, and the immutable-build probe (17 CPU-only cases).
Later review identified final-drain deadline and missing-program capture edges;
both are corrected. The admission deadline now stops the next native batch,
not a fully submitted/reflected scene finishing its last cooperative yield.
Tests distinguish final 1/31/32/64-program cohorts from unsubmitted later
batches/passes. Strict capture rejects empty caches or missing native handles
for selected materials, while a genuinely empty scene remains valid.
The final rerun passed the same eight suites, typecheck/unused-owner checks,
public build and metrics (301 functions, zero violations or explicit
`any`/`unknown`). Cancellation during shader/panel cleanup covers all four
incomplete/rejected shader × resolved/rejected panel combinations.

The changed-scope Doctor scan scored 49 over eight files, with no errors and
one `async-await-in-loop` warning at the main adapter's paint checkpoint.
That await intentionally yields between renderer-owned batches and must remain
sequential; parallelizing it would violate preparation/cleanup ordering. No
rule was suppressed. Its diagnostics are in
`/var/folders/yl/sxf0v4tn14n2pkwqmf_21l540000gn/T/react-doctor-8a6a0a78-9618-4f38-8531-bb674ba45cfa`.
The eight-file score is not directly comparable to the whole-repository
baseline's 43, and neither is a clean whole-repository certification.
The final post-edge-fix scan again scored 49 with exactly the same warning;
its diagnostics are in
`/var/folders/yl/sxf0v4tn14n2pkwqmf_21l540000gn/T/react-doctor-27e5a249-589a-4691-8592-40a5d26c6f32`.

### Native comparison and limitations

The final candidate index hash is
`9be4b9b0da977157fb553715c33941e719f92c75040bdca09f4a9a4d0eec2c91`;
its full-build hash is
`57d78e6613f3bfbe5344d906dac7061ad8f8bf3377348285240d6c674db12f7f`.
Four captures ran in baseline-r1, candidate-r1, candidate-r2, baseline-r2
order. All used the same acquisition fingerprint, high/scale-1 settings and
reported Apple Metal backend. Full build/acquisition identities were unchanged
within each run. Reports remain under
`/private/tmp/cot-shader-admission-{baseline,candidate}-native-20260908-r{1,2}/report.json`.

| Capture | Light | Loader host/guest (ms) | Max RAF host/guest (ms) | Max main query host/guest (ms) |
| --- | --- | --- | --- | --- |
| Baseline r1 | Day | 3539.4 / 3709.3 | 201.5 / 235.7 | 201.3 / 28.9 |
| Candidate r1 | Day | 5437.5 / 3832.1 | 303.3 / 228.9 | 27.5 / 0.1 |
| Candidate r2 | Night | 3616.7 / 3780.4 | 165.1 / 226.3 | 23.3 / 0.1 |
| Baseline r2 | Day | 5218.7 / 5041.3 | 205.7 / 181.0 | 1.0 / 71.9 |

Every run passed native room creation/join, complete 5→4→3→2→1 DOM countdown,
nonblack/primed reveal, battle progression, no application errors and complete
room/browser/server/lease cleanup. Both candidates completed all main-cohort
reflection with zero pending/failures and complete panel masks. No hidden
quality override, artificial dwell, readback bypass or scene substitution was
added. These are two clients on one machine with local signaling, not a live
production/deployed or distant-network measurement.

This is a correctness/admission release, **not a demonstrated overall loading
or worst-frame performance win**. The second candidate's native night seed
prevents treating it as a matched day comparison. In candidate r1 the host's
later combat warm took 1111 ms and reveal 1365 ms: its opening render took
280.2 ms, including 146.9 ms of status queries for two new depth programs;
the later watchdog render/readback took 129.6/382.2 ms. Those distinct stages
remain outside strict main-cohort preparation. Preserve this slower sample;
do not attribute its 303 ms maximum RAF gap to a solved shader query or claim
historical 214–319 ms stalls are eliminated. The variance in the unchanged
baseline also requires repeated controlled work before an end-to-end claim.

## Main integration verification

The runtime commit rebased cleanly onto `9d1451945` as `92d55cdbd`; the shader,
network and diagnostic sources were unchanged by rebase. The eight focused
suites, metrics and typecheck passed again. The new upstream localization
prebuild initially stopped because the shared dependency tree lacks `gt`.
Reusing the already-installed, lock-matching GT 2.20.1 executable from
`/private/tmp/cot-locale-routing.sVnkgD/worktree/node_modules/.bin` through the
child command's PATH passed the offline dry run, localization checks and full
public build. No shared dependency installation, translation upload, validation
bypass or package edit was made.

`/private/tmp/cot-shader-admission-integrated-native-20260908-r1/report.json`
then passed the complete native entry/cleanup gates. Its index SHA is
`b0570c5c51d56633c83dab2f7272cbb50c9cb00ee641c63833c1648f2acf1f65`,
full-build SHA `dac5d40b32d2b547d306f97618312118b7635958946353c9a504caf9156c2656`
and acquisition SHA `de883652b8f729f2ca0bcffb0bdc6f1d0e9308d8bc3ff4c8b8ee29af23b0d091`.
Upstream package-script changes account for the new acquisition identity;
this is an integration smoke, not the earlier matched-build comparison.
Both clients again reported clear/day, high/scale 1, the Apple Metal backend,
zero pending/failed main reflections, complete masks and the full countdown.
Loader times were 2886.3/3128.0 ms and maximum RAF gaps 192.5/190.4 ms.
All owned resources and rooms closed. These remaining gaps still prevent a
smooth-frame or production-performance completion claim. The following
documentation-only commit records this receipt without altering tested code.
