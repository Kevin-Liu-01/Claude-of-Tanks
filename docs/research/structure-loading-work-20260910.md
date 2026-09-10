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
