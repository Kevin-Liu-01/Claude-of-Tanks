# Construction-local loading work — 10 September 2026

Follow-up to [the frame-clock/audio release](frame-clock-and-shadow-warm-20260910.md).
This slice targets measured construction work. It does not identify the exact
cause of the historical 214–319 ms stalls or certify a zero-lag application.

## Evidence and attribution limits

The unprofiled live `v1.0.0+g8850e95c7` first-Battle action contained a 190.9 ms
callback-start gap during covered “Placing structures.” Only 76 ms overlaps
a recorded Long Task. The remaining 114.9 ms has no proven owner. Audio
construction had already completed before the Battle click.

A separate live, opt-in CPU-profile capture used the existing actual-control
probe with `--boot-audio-gate --audio-clock-gate --warm-readiness-gate
--source-readiness-gate --profile-actions`. It passed those functional gates.
Preserved output root: `/private/tmp/cot-interactive-baseline.gsRCvU/`.

| Profile receipt | SHA256 |
| --- | --- |
| `entry-audio-production-profile-r1/report.json` | `f52c8c7a1dd374d19953eec7d5cef6a3f3057b84a984e9e6dcb7a96a265bcc84` |
| `entry-audio-production-profile-r1/battle.cpuprofile` | `ff32b719247637fba1fede52f3961d7fc53a4ad02af9039bc9efad6b8e8c4f5b` |
| `entry-audio-production-profile-r1/battle-again.cpuprofile` | `e7a9089a1ea4c630d7dc51e42a024895eee432c03fbfd95286defe057e0670f1` |
| `entry-audio-production-profile-r1/return-to-garage.cpuprofile` | `c498267108460e0c6f54a106d43cb540d14a479dfca2ce4a59b29fb5bee4dcbb` |

Mapping was checked against the actual served `assets/map-DXy8Mxg3.js`, not a
different local source map. Across all call-tree occurrences, shared-vertex
welding (`oa`, column 56415) accounts for 166.095 ms of sampled self time;
component collection (`sa`, 56588) accounts for 162.621 ms. Their geometry-solid
owner (`la`, 57266) accounts for 484.014 ms inclusive, reached through runtime
structure collision derivation during street-row placement. These are cumulative
statistical samples, not one uninterrupted 484 ms call; inclusive and child
self times must not be added together.

The profile did not reproduce the 190.9 ms props gap. Its largest callback gap
was 96.8 ms during terrain work. The start bracket alone spans 248.2 ms. Under
the existing constant-offset clock model, intersecting it with the stop bracket
minus the 7,061.717 ms profile duration narrows the page-clock start to
`[3252.783, 3280.083]` ms, a 27.3 ms bracket. The callback gap
`[3898.900, 3995.700]` ms then guarantees overlap with profile-relative sample
timestamps `[646.117, 715.617]` ms. Both negative sample deltas are preserved
when reconstructing and sorting the paired sample timestamps.

That interior contains nine terrain samples (noise, height constraints,
fine-grid generation and macro/core terrain) and 38 `(program)` samples with
no attributable stack. Fully interior prior-sample intervals contribute
10.531 ms of terrain and 56.818 ms of `(program)` statistical weights, not
exact function durations. The overlapping 79 ms Long Task contains the same
nine terrain samples. Nearby `getImageData` samples are only possibly
overlapping, not guaranteed. This establishes terrain work inside the gap but
does not identify most blocking time, a native/GPU/Canvas/audio cause, or the
historical 214–319 ms cause. The profile is attribution-only, not a speed
comparison. Independent props
receipts record an atomic ground-decal slice of 37.8 ms (38.3 ms in the earlier
unprofiled live action), without absolute slice timestamps.

## Implementation

- Cache referenced indexed-geometry vertices only for one `geometrySolids`
  call. Reuse decoded XYZ, the existing welded XYZ key and projected XZ key.
  Preserve every union operation, component insertion/overwrite, projected
  triangle and output order. Non-indexed geometry retains the original path.
  No cache survives geometry mutation or another extraction.
- Let the existing foreground loader yield between completed foundation,
  battle-scar and track-tear decal families. The two new checkpoints do not
  advance coarse progress. No formula, random draw, texture policy, geometry,
  collision precision, visual quality or frame-budget threshold changes.
- Suspension occurs only after a complete family transfers its meshes to the
  private props group; no partially assembled family buffers are suspended.
  Existing async cancellation closes the delegated iterator and aborts source
  acquisition before publishing a partial runtime.

## Deterministic verification

The vertex-cache regression executes the candidate against frozen pre-change
functions. It compares union history/roots, component Map writes/order,
projected triangles, final solids and public profiles. Fixtures include indexed
and non-indexed Float32/Float64, normalized/interleaved attributes, Uint32,
half-weld boundaries and signed zero, unused indices, repeated calls and input
or returned-output mutation. Actual onion-church, water-tower and megatower
builders retain identical solids and RNG usage.

| Fixture | Original XYZ + XZ key constructions | Cached constructions |
| --- | ---: | ---: |
| Repeated tetrahedra | 3,072 | 8 |
| Onion church (31 geometries) | 3,624 | 1,838 |
| Water tower (11 geometries) | 1,080 | 684 |
| Megatower (267 geometries) | 8,952 | 5,912 |

An optional warmed Node 24.13.0 ABBA extraction batch (eight repetitions,
1,016 solids) observed original/candidate/candidate/original means of
16.832/15.839/13.083/15.411 ms. This small same-process CPU observation is not
a native loading/frame-time gate or a guaranteed percentage speedup.

The cache assumes ordinary stable attributes during synchronous extraction.
There are no stateful attribute getters or concurrently mutated shared buffers
in the inspected world paths. All-unique indexed streams may pay cache overhead
without a serialization saving; no universal per-geometry speedup is claimed.

The decal test executes the actual complete function against a hash-pinned
synchronous reconstruction, comparing Three.js buffers, seeded RNG, material
policy, Canvas commands and churn alpha operations. It includes foundry
foundation reconforming and rejection at either new checkpoint. Canvas spies
are deterministic command evidence, not native raster/pixel qualification.

Eleven focused selftests pass, including all 111 structure families at two
variants (minimum certification 94.1/100), collision reuse/merge/raster gates,
props scheduling/materials/textures/resource ownership, world coordination and
the 954-entry registry. Typecheck/core-unused and the public build pass. This
is not a claim to have rerun the entire 954-check lifecycle.

Changed-scope React Doctor 0.9.13 initially reports a new test-only `no-eval`
error for the actual-function fixture and a serial-await warning. Its exit status is 1,
not a passing scanner gate. The evaluated text is local reviewed source with
the synchronous control hash-pinned, not user/network input; the fixture is
Node-only and never shipped to the client. Serial cancellation cases must
settle before disposing their geometry. These findings are retained rather
than suppressed or hidden by changing the regression's execution mechanism.

## Native local candidate

`structure-load-local-r1/report.json` SHA256:
`ad3071b9c3a57928329f8576db1124c32a3d62961457a16122962d6555a998c0`.
Public-build HTML SHA256:
`c08d8377c22ca68d3fb8f5f793f5cf3aa81e855c62160d4caca9729714e378d7`.
Acquisition SHA256:
`396f2f5601a637ee2c130b1796e816786b96fb3a6acf95fe1f679d46746f1499`.
Frozen `props.ts` / `structureCollision.ts` SHA256:
`61b7f8310803e9d1967aa64e97d53c9d7f29cf2c598dc59b64640e950119bc80` /
`7f8df7d5c18e30af669ec820f482ab3d51f256f02ffaba50adaa398043392a63`.

The unprofiled Urban actual-control run passes functional, trusted boot-audio,
audio-clock, warm and source-readiness checks. Error/failure/cleanup arrays are
empty. Day battle, night rematch and returned Garage screenshots were inspected;
no missing geometry, texture or obvious visual regression was observed.

| Action | Click → cover | Click → ready | Maximum frame-callback gap |
| --- | ---: | ---: | ---: |
| Battle | 2.3 ms | 6,183.9 ms | 116.5 ms |
| Battle Again | 133.4 ms | 5,499.8 ms | 64.6 ms |
| Garage | 90.3 ms | 324.1 ms | 47.0 ms |

Ground foundations are now the largest reported decal family at 22.2 ms;
the other two families fall below the eight-slowest-slice cutoff (12.1 ms).
The earlier local boot fixture recorded a combined 36.2 ms ground-decals
task. Props synchronous work is observed at 1,612.5 ms versus 1,717.5 ms in
that prior fixture. These are individual observations, not a repeatable
percentage speedup or a matched-roster total-loading comparison.

The remaining 38.4 ms street-details slice is unchanged. The worst diagnostic
callback-start gap is 116.6 ms during the transition from “Loading battlefield”
to “Building terrain meshes”; 50 ms overlaps a Long Task and 66.6 ms remains
unattributed. No claim that collision/decal changes solve this different phase.
The action includes covered loading/countdown and is not a steady-state FPS
measurement. Historical stalls and universal frame-budget guarantees remain
open, as in the preceding release record.

## Follow-up: completed street families

The measured `street-details` interval includes all work since
`wrecks-finalized`: rubble, curbs/sidewalks, then the monument. Two further
`fine: true, progress: false` checkpoints now follow completed rubble and
curbs. The original final checkpoint follows the monument. This does not
assume which subcall dominated the combined 38.4 ms observation or promise
that each individual family fits a frame.

The scheduling regression freezes the complete pre-change street block at
SHA256 `5f879376acf5557e58bf385034ca03d3e1d7666cc21e25c05fd77a43c34374b7`.
After removing only the two new yields, all original function bodies and calls
must match. The actual call/yield sequence then runs with completed-operation
spies through the real async wrapper: exact operation order, coarse progress
0/0/1, both cancellation boundaries, preserved error/source-abort/IteratorClose
and unchanged coarse callers. This is source-and-scheduling parity, not a
second geometry implementation or a native speed certificate. The native
local capture above predates these two additional checkpoints.

Five focused scheduling/material/resource/coordinator/registry tests,
typecheck/core-unused and the public build pass again. Docs Doctor reports
four passes, no warnings or failures. The final unprofiled local capture,
`structure-load-local-r2/report.json`, SHA256
`d86345073a05040a27df8f02ddacdc94ca4abd33a93d15a5a3436a4c7ba1bd47`,
passes all the same functional/audio/warm/source checks with empty error and
cleanup arrays; all three screenshots were inspected. HTML SHA256:
`2ec32342d6ae284fc61b45d4e444fc1bae5b55877a218957172eb6eb24b0f62a`.
Acquisition and graphics settings match r1.

The split street tasks are observed at 22.0 ms (rubble) and 17.7 ms (curbs).
The largest props task is now foundations at 25.0 ms; total synchronous props
work is 1,658.3 ms. Thus the formerly combined 38.4 ms street task is separated,
not magically made free. Battle/rematch/Garage callback maxima remain
115.3/70.4/49.4 ms; click-to-ready is 6,416.3/5,533.5/324.7 ms. The first gap
is again early terrain preparation, with no overlapping ≥50 ms Long Task,
so its 115.3 ms remains unattributed. This is not a zero-hitch certificate.

The final changed-scope React Doctor run against exact base
`d942e1284a1130061387b4a4ac2e34c765b8f121` scans all five changed JS/TS files.
It exits 1 with two test-only `no-eval` errors, two serial-await warnings and
one four-item fixture `.filter().map()` warning in `propsScheduling.selftest.mjs`.
The same trusted-source/cancellation rationale applies; none are production
runtime findings or suppressed. An intervening invocation using a caret ref
was rejected by CLI validation and was not a completed scan.

## Next attribution boundary

The maintained action probe now collects bounded, feature-detected Long
Animation Frame entries independently of Long Tasks. A frame can contain
several shorter tasks, so the absence of a ≥50 ms Long Task does not establish
that the main thread was idle. Script entry points and render/style timestamps
can narrow that distinction, but do not measure GPU duration or establish
which nested function dominated. See the [Chrome API explanation](https://developer.chrome.com/docs/web-platform/long-animation-frames)
and [renderStart semantics](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongAnimationFrameTiming/renderStart).

This is QA-only observation, not a production render-loop change. Each actual
trusted action retains at most 128 entries and 32 script records per entry,
with bounded strings, no Window references and explicit filtered/dropped counts.
Unsupported or failed observation remains unavailable, never an empty success.
The previous Long Task summary, timing windows and acceptance gates are
unchanged. The local r1/r2 receipts above predate this added observer; a new
capture is required before making claims from it.

The focused timing selftest passes with caps, trusted-window filtering,
strict endpoint overlap, same-origin source metadata, finite zero timestamps,
observer failure/unsupported handling, pending-record drains, rearm and
idempotent cleanup. Failure in this observer does not change Long Task
support, retained entries or overlap calculations.

## Cooperative height-field preparation

Source inspection found an unsliced owner between the `Surveying terrain`
and `Building terrain meshes` callbacks: the entire height-field constructor.
Urban alone stamps 256 road segments over a 257×257 lookup (16,908,544 distance
tests), then prepares support/water data and scans 129×129 exact heights for
the range. This is a real cancellation/pacing gap, not proof that it owned
every millisecond of the observed browser callback gap.

The follow-up retains one shared constructor implementation. The synchronous
API drains it; the fine-sliced async map path awaits completed segment,
corridor-row, support and height-range-row checkpoints. Progress counts
completed construction units, not estimated CPU cost. Coarse callers keep
their existing callbacks. No terrain resolution, arithmetic, RNG, road winner
order, Float32 writes or returned query policy is intentionally changed.
Private grids are published only when the field is complete. Rejection closes
the iterator without replacing the original error, including rejection of
the final fraction-1 checkpoint.

The complete unsliced constructor is frozen at SHA256
`0767b9f0a0ceeb827665c61a57ec6313a939ad875fea7e7ff2d8fb104fc8bc36`.
The first fixture attempt failed that check due solely to an extra trailing
newline in its reconstruction. The fixture was corrected; the original hash
and runtime bytes were retained. That failed invocation ran no downstream
parity or type gates. A second attempt reached the map-composition fixture
after parity/cancellation checks, then exposed a missing spawn-layout field
in the fixture stub. That stub alone was corrected; neither failed invocation
is counted as a passing test.

The third invocation passes all four focused selftests (`roadLookupGrid`,
`terrainFastGrid`, `terrainStreaming`, `worldBuildCoordinator`) and native
TypeScript/core-unused. All 30 maps preserve raw/final grid bytes, exact/fast
height, normals, water/depth, track surface, min/max, layout and warmed-tile
behavior. The existing 30-map × four-LOD-configuration geometry comparisons
also pass. Cancellation tests cover early/last roads, the final corridor,
support, the first/final scan row, held callbacks and cleanup failure;
fine/coarse map callers preserve their respective composition contracts.

The seventh check, the strict whole-file complexity gate, fails on three
inherited declarations: `heightAt` (cyclomatic 22, cognitive 34),
`applyHeightConstraints` (cognitive 24), and `createSplatMaterialSteps`
(cyclomatic/cognitive 23). Each declaration is byte-identical to `3c2abead2`;
their SHA256 values are respectively
`af2771b9d21431b6e1d4eca90ee51798d48151f99a98904acc92d349eb8069f6`,
`d891dadb7ed9ab2595bad0e4a427ff367f46db51d0746303163d67ce90a51599`, and
`213438aedd2c7b89a646a858d3b676baf920c96768ccd4005ef045ae1ba3f711`.
There are no new flagged declarations or explicit `any`/`unknown` additions.
This inherited failed gate is retained, not waived, hidden or fixed by
unrelated terrain refactoring. Native performance qualification is separate.

The combined public build also passes (including its translation/locale and
public-asset checks). Changed-scope React Doctor against `1bf52b745` exits 1:
three trusted-source `no-eval` findings and three intentionally sequential
fixture-await warnings, all in `roadLookupGrid.selftest.mjs`. No production
runtime finding is reported. Source evaluation is Node-only, bounded to
reviewed AST-selected declarations and the immutable constructor reconstruction;
shared test taps require serial fixture completion. Scanner errors are retained
and do not become a passing scanner gate.

## Native terrain follow-up and integration

`heightfield-yield-local-r1/report.json` passes the actual trusted boot,
Battle, Rematch and Garage controls, audio-clock ownership, warm readiness
and sourced-art readiness. Errors, failures and cleanup arrays are empty;
all three screenshots were inspected, and the owned browser/preview closed.
This captures the public runtime built from `875262468`, before the unrelated
T-90A release integration. Report SHA256:
`d1da90e9a8e6c02596d99958f285ec13aaccbceed1d95ea4689b847662067d07`.
HTML SHA256:
`ecb8e92dcef30c12fa943ae5c64a54127a9d9f753906c72c61445a61384e6a26`.
Acquisition SHA256:
`794c3214dc4614bfb2a50f140bcd586139837c7c155f26e8c1f51487e1b36558`.
Chrome151, native M5 Max, Urban, fourteen tanks, 1280×720/DPR1,
high/scale1/trim0 remain unchanged. Bot draws are retained, not a pinned-roster
throughput comparison. The added LoAF observer changes acquisition from r2.

| Control | Cover ms | Ready ms | Callback-gap maximum ms |
| --- | ---: | ---: | ---: |
| Battle | 4.3 | 6412.3 | 121.1 |
| Rematch | 139.1 | 5547.4 | 66.1 |
| Garage | 83.4 | 317.2 | 45.9 |

The first gap, 2714.4–2835.5 ms, overlaps 110 ms of a Long Task and one
115.7 ms LoAF. That frame exposes a 13.8 ms `frameScheduler` rAF entry point,
but does not account for all remaining time. Both sampled UI labels say
`Building terrain meshes`. That label is published only after height-field
completion. The world activation record starts at 2703.9 ms but can join an
earlier intent-prefetched construction; its copied 222 ms height-field stage
cannot be added to that activation timestamp to locate the stage. Other
preparation jobs remain concurrent, so the label alone is not an exact
nested-function attribution. The worst gap is not fixed or assigned to Canvas/GPU/OS by this
receipt. Rematch's worst gap overlaps two LoAFs with scheduler continuation
records, despite no overlapping ≥50 ms Long Task. No observation was dropped
for these overlap summaries. Foundations/rubble/curbs completed-family costs
are 24.5/19.7/16.1 ms; their internal loops remain atomic.

Independent runtime review found no partial publication, cancellation or
progress-regression blocker in the new height-field seam. After the other
task released its verified main boundary, the five owned commits rebased
cleanly onto `c1142f59b970e293b0c6892b60c181084e471625`. World runtime and
the action-timing helper/tests remain byte-identical to `e895d715a`.
Six focused integration selftests, native TypeScript/core-unused and the
public build pass on rebased `8c1b4c2c2`. The registry now contains 955 files;
this is not a fresh full 955-file test-run claim. The upstream 954-file full
run does not already include this follow-up's new cache test or runtime.

## Published actual-control check

The six-commit follow-up pushed without force to `origin/main` at
`85aa9224a3b6acb7ffb81594cce42601a1ff4a47`, independently verified remotely.
Vercel deployment `FUHCXoxcn8EWU3gbAtxFhGhSdGsn` reports success; the public
site serves `v1.0.0+g85aa9224a`. The live
`heightfield-yield-production-r1/report.json` passes the same actual-control,
audio, warm and source-readiness checks. All error/failure/cleanup arrays are
empty; day/night/Garage screenshots were inspected, browser ownership closed.
Report SHA256:
`42e54dcfcd78cfb577e4bc30ca4c93dbbea069202cdf19dde19e57cd07ca1cb9`.
Live HTML SHA256:
`5f86df9854bedcd14ae52cc0379afa89057f79ceb58fd48a6a80c16e177fd47d`.
Acquisition and native graphics settings match the local follow-up.

| Live control | Cover ms | Ready ms | Callback-gap maximum ms |
| --- | ---: | ---: | ---: |
| Battle | 2.5 | 8310.9 | 161.8 |
| Rematch | 134.3 | 5526.2 | 66.3 |
| Garage | 83.8 | 317.5 | 46.2 |

First entry still has a covered 161.8 ms gap at 4046.8–4208.6 ms. It overlaps
a 94 ms Long Task plus two LoAFs. One exposes a 94.3 ms resumed scheduler
callback; the trace does not name its nested hot function or classify the
remaining 67.8 ms. Rematch again shows shorter grouped work without an
overlapping ≥50 ms Long Task. The foundation family is 24.9 ms. These are
retained remaining costs, not a performance certificate or evidence that
historical 214–319 ms stalls were solved. Publication completes this bounded
runtime delivery; native timeline attribution and finer completed-instance
foundation pacing are the next separate investigations.

The maintained action probe now offers opt-in `--trace-actions`, reusing the
existing browser-wide, owned CDP timeline collector. It is incompatible with
CPU profiling and is explicitly diagnostic-only. Each real action gets a
fresh sanitized `.trace.json`, bounded to 30 seconds, 50,000 retained rows and
the collector's 32 MiB trace buffer. Performance marks align page time;
incomplete/censored actions are separate from functional/readiness acceptance.
The collector's event whitelist and privacy filtering are unchanged. Its
timeline can identify retained GC/task/paint categories, not specific Canvas
calls or unretained compilation events, and not GPU hardware durations.

Syntax checks, the existing action-timing and shared trace selftests pass.
Tests cover default no-op, actual-window coverage, deadlines, incomplete
flushes, startup/action/write/cleanup failure, interruption/idempotent ownership,
and preservation of falsy JavaScript exceptions. Strict metrics pass on all
three changed tool files: 167 functions, no violations or any/unknown. The
first draft's new cyclomatic-26 closure failed metrics; pure metadata extraction
removed that violation before the passing run. No gate was weakened.

### Completed production timeline acquisition

`heightfield-yield-production-trace-r1` exercised the same live `85aa9224a`
runtime with `--trace-actions`. All three functional, audio, warm/source-readiness
checks pass; all three traces cover their actions, without dropped rows, data
loss, malformed rows or unclosed in-window intervals. Endpoint clock differences
are +0.038 / -0.107 / -0.007 ms. Day battle, night rematch and Garage screenshots
were inspected without a new visual defect. This is attribution-only acquisition,
not an unprofiled performance comparison.

The prior 121.1/161.8 ms terrain gap did not reproduce. Worst callback gaps were
77.9 / 79.7 / 48.6 ms. Clipped interval **unions** for Battle's 7040.5–7118.4 ms
gap contain 3.003 ms GC, 0.112 ms style/layout and 0.138 ms paint; rematch's
12861.9–12941.6 ms gap contains 2.098 ms GC and 0.102 ms style/layout. Categories
overlap and must not be added. Neither GC nor layout/paint dominates these gaps.

The retained timeline whitelist does **not** expose all `Scheduler.yield.then`
continuations as task/function rows. Battle has only 7.888 ms of retained task
union but 75.300 ms of LoAF script intervals, including 22.1 and 47.0 ms yield
continuations. Rematch likewise has 13.552 ms retained tasks but 61.000 ms of
LoAF script intervals. Sparse task coverage is not evidence of idle time or a
GPU wait. The largest terrain gap is 76.8 ms (3629.8–3706.6), containing a 55 ms
Long Task and a 54 ms rAF-resumed script; GC is only 0.324 ms there. These sources
locate execution boundaries, not the expensive nested JS/native operation.
Historical 214–319 ms attribution remains unresolved.

Report SHA256: `4c30b2d4ed750c519c899ed320c4c82cf375eafe82c80d36cfc53d809510210c`.
Battle trace: `73c986096b2c8e4a126ff03e9ff893b40163c08a41c402bc45d70df75b477417`;
rematch: `94ccee28608e55b4036845acc9b8e086df848bcfa60229922cc93c999794855e`;
Garage: `0850dd644f6b1c9fd4362924d28cb0656ccc3650f452f2647f6aa0fee97a2f78`.
Acquisition: `e556f2fe60a319b86783d4383e398347a1927fd5a6b25d72f0815b9d26845edd`.
