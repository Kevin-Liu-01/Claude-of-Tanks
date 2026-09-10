# Battle frame ownership and loading-only shadow work

## Scope and evidence boundary

This follows `draw-submission-attribution-20260910.md`. It changes neither the
60 Hz presentation cap nor its 1.5 ms early-admission tolerance, graphics
quality, simulation frequency, shadow resolution or moving-cascade cadence.
It is not a claim that every historic stall has been explained.

## Garage input was restarting the active battle clock

The globally captured `pointerdown`, `wheel`, `keydown`, `touchstart` and
`resize` events called `noteGarageActivity` regardless of phase. That called
`invalidateGaragePresentation`, which unconditionally invoked
`frameLoop.restart()`. Restart cancels the pending animation callback and
rebases the scheduler's absolute presentation deadline. Repeated movement
keys therefore disturbed Battle scheduling even though Garage was not shown.
Retained asynchronous Garage producers could invoke the same invalidation.

Both callbacks now enforce Garage ownership. Foreign-phase input does nothing;
late Garage visual completion still records `garagePresentationDirty`, but
does not wake Garage services or restart Battle/Studio scheduling. Boot's
early dirty-only callback is unchanged. Phase changes and context recovery
keep their explicit restart owners; normal viewport synchronization still
runs in Battle and Studio.

The scheduler regression executes the actual callbacks and listener
registration extracted from `main.ts`, against the real scheduler. It covers
all five input events in Battle and Studio, asynchronous dirty-only completion,
Garage idle wake and repeated two-second battle keydowns. A negative control
removes only the two new guards: it must reproduce three animation-callback
cancellations and a changed presentation grid. This establishes the source
bug independently of any interpretation of the browser timing sample.

## Frozen pre-fix native cadence capture

Evidence root: `/private/tmp/cot-interactive-baseline.gsRCvU/`.

- `shadow-followup-cadence-r1.json`: SHA256
  `8628ff6f61966d58d8aebb01b498092dc015145d50c029ce40c54e6f30c7adee`.
- `shadow-followup-cadence-r1.frames.json`: SHA256
  `83acc08d0fa72bb728fc533f8ff4a189252ea9f081b2f812fff8b627ef5cea0c`.
- Source revision `5bfcc3b502d78e4adce65b16ad669dcb46c200cd`; source hash
  `a44833cc82cbc213ff14446f661186b4a42b7d1fb721add3cd075cb076c998f6`.
- Existing public-build HTML hash
  `e57b5dbb39c430ebe93f3325a494aef67a3600f14e3cde37445daa3378222088`.
  The build predates two documentation-only commits; its identity is not
  inferred from the checkout revision.
- Acquisition hash
  `4737ae3012ae32e3cd798a5edc45de0e58f1c99990d69d5ddce7772c99169ab8`.

One maintained sixty-second early-control-release Verdant run, pinned fourteen
tanks, movement/firing plus 29/29 trusted camera pulses. Native Chrome151 /
ANGLE Metal Apple M5 Max, high, 1280×720/DPR1/scale1/trim0. No profiler, draw
attribution, console errors, foreign headless renderer or detected contention.
Every submitted endpoint matches the retained raw native callback timestamp
and draw count; preceding zero-draw callbacks remain in each cohort.

| Metric | Pre-fix result |
| --- | ---: |
| Submitted intervals | 3,601 |
| Frame median / p95 / p99 | 16.7 / 18.6 / 25.2 ms |
| Median FPS | 59.9 |
| Draw median / maximum | 778 / 870 |
| Texture estimate | 161.5 MB |
| Raw / floor heap growth | 1.42 / 1.35 MB/s |

The unchanged timing and heap-growth gates **FAIL**, exit1. Post-window forced
GC leaves 265.8 MB, but there is no matched pre-window forced-GC measurement:
neither leak-freedom nor an actual retained leak follows from this sample.

Of 106 intervals whose raw duration is at least 24.9 ms, 101 contain three
regular native callbacks (individual gaps 6.3–10.4 ms) with submissions
`[0, 0, positive]`; 96 of these are followed by a one-callback catch-up. The
other five include a longer native callback gap. Ten additional raw values
just below 24.9 round to 24.9 at one decimal; they are not silently included.

Thus most measured long submission intervals cannot be explained by missing
native sampler callbacks. The first fixed-grid mismatch is near the first
two-second steering boundary, but the raw series has no exact key-event or
restart stamps. Do not attribute every interval to a specific input event,
or apply this explanation retroactively to untraced 214–319 ms stalls.

## Loading-only shadow correction

The caster cohort selector previously tested only the presentation camera's
layers. Native shadow routing also enables layer29, so those omitted proxies
remained casting in every warm cohort. Selection now uses the same effective
mask. Regression coverage includes actual articulated batches and noncasting
retained sources, hidden ancestry, material visibility, LOD restoration,
object/vertex cohort limits, throws, yields and disposal. Each selected caster
warms once in the bounded cohort stage; all four final cascades still include
every eligible caster.

A far-away offscreen camera is not sufficient to skip forward submissions:
unculled objects still draw. `renderShadowOnlyWarm` is a synchronous,
known-router-and-camera-owned scope. It preserves the camera's normal mask
during native light/LOD collection and exposes layer29 during shadow traversal.
Only after successful owned shadow rendering does it clear that warm camera's
mask for forward/transmission object draws. `finally` restores the exact
caller's mask; replaced or unknown routers fail open to ordinary rendering.
Injected callbacks, regular warm uploads and compiler paths remain unchanged.

This removes unnecessary **draw submissions**, not all renderer work:
projection, object upload checks, sorting, light setup, background preparation
and transmission allocation/clear/resolve work may still occur. Native-v3
extends the existing exact-image fixture with ordinary and transmissive
unculled witnesses. Each witness must actually draw in the baseline and not
draw in the warm pass. Shadow RGBA must remain identical on the same owner;
the subsequent composed image must match without regenerating any shadow map.

## Qualification

The worktree was fast-forwarded to `ff0f639d97fb1d2660e9e7d463e2be8f26e31821`
before candidate checks. This preserves the other task's T-14 and test-runner
release; its 951-check catalog and native FIFO barrier remain unchanged.

Seven focused selftests pass: layer routing, deployment shadow warming, frame
scheduler, main frame integration, articulated shadows, offscreen warming and
test registry. Full typecheck/core-unused and the public production build pass.
These are proportionate checks for this render/input slice, not a claim to
have rerun all 951 catalog entries. Changed-scope pinned React Doctor0.9.13
exits0, with one test-only `async-await-in-loop` warning at
`deploymentShadowWarm.selftest.mjs:318`: each deliberate failure case awaits
its rejection and verifies restoration before disposing its owned resources.
It is not a production hot loop. No suppression or scanner configuration change
was made; `frame-warm-doctor-r1.json` retains the finding.

### Native warm preservation passes

`shadow-only-warm-native-r1/report.json`, SHA256
`c35c99b1604bc874167b737033ed36693e1b43d1fb22a61232a30eba8ebe7ed1`,
passes native-v3 on Chrome151 / native ANGLE Metal Apple M5 Max / Three185.
All eight warm cases remove six forward submissions, including both actual
witness objects (`[2,2]` baseline calls become `[0,0]`). Per-cascade shadow
counts are unchanged; all 32 same-owner raw shadow comparisons and all eight
unrepaired composed reveals are exact. The original six parity/reset cases
and two negative controls remain passing. The 190 retained RGBA files are
artifacts, not 190 independent cases. The final canvas was visually inspected;
fixture, browser, server and FIFO cleanup all pass with no errors.

### Candidate gameplay still fails the strict timing budget

One post-fix run used the same maintained protocol and acquisition hash as the
pre-fix run. Sources remained frozen, hash
`56761e254740b1d87206badf7da43fee15dcd9cfbca374eb91cd0d6f4d8da909`;
candidate public HTML hash
`7b0d59655bdbb0feb95518c15f77adc03e81c8f8f29cd66bce3a121ef9c0e076`.

- `frame-owner-candidate-r1.json`: SHA256
  `032115d197a98e62865db4dc93d40a858f146fe1564451ddc99815adbfd068e9`.
- `frame-owner-candidate-r1.frames.json`: SHA256
  `30d4ea6632d67b81fc8514e97401e00104ea6473685ef42b54a1c9f7de7bcb15`.
- 3,599 submitted intervals; all keep four-cascade mask15. No console errors,
  foreign headless renderer or detected contention; exact pinned roster matches.
- Frame median/p95/p99: **16.7/23.4/25.6 ms**. Median/p5 FPS: **59.9/42.7**.
  These still fail the unchanged limits. No tail improvement is claimed.
- Draw median/max: 786/864. Texture estimate:166.9 MB. Heap raw/floor slope:
  -0.26/-0.45 MB/s. These budget rows pass, but the unmatched post-GC endpoint
  does not certify absence of leaks.

Overall result remains **FAIL**, exit1. The exact input regression establishes
the phase-ownership correction; this single varying native run neither proves
a frame-time improvement nor isolates the remaining timing tail. It is not
repeated to search for a green sample.

The candidate raw callback labels can be reproduced exactly by the unchanged
60 Hz/1.5 ms scheduler without any resets (7,075 comparable callbacks, accounting
for the sampler's one-callback observation lag). The initial deadline is fitted,
not observed; this is evidence consistent with restored single-grid ownership,
not proof of native frame-time improvement. The remaining early/late submission
pattern therefore needs separate evaluation rather than another Garage fix.

### Actual local controls pass

`frame-warm-local-actions-r1/report.json`, SHA256
`3278f638660029be5f126234561efc0c796c7c5884317e7f1ebaafda0635b682`,
passes actual Battle, Battle Again and Return-to-Garage functional,
audio-clock, Garage-gesture, warm-readiness and source-readiness gates.
All failure/error/cleanup arrays are empty. Day battle, night rematch and
returned Garage screenshots were visually inspected; the owned preview server
was stopped after the probe's browser cleanup.

| Action | Click → cover | Click → ready | Maximum callback gap |
| --- | ---: | ---: | ---: |
| Battle | 13.9 ms | 6,445.8 ms | 162.8 ms |
| Battle Again | 140.6 ms | 5,632.1 ms | 67.1 ms |
| Return to Garage | 88.8 ms | 341.2 ms | 46.6 ms |

Ready times include countdown/readiness; these are not steady-state FPS.
Random bot compositions differ from prior live runs, so lower transition
totals are not an isolated loading-speed estimate. The cold audio startup and
strict gameplay timing limits remain separate outstanding issues.

## Published and verified

Commit `01d62ab36c34969af83b8dc1a14430392f8c6c37` was pushed without force
to `origin/main`, verified with `git ls-remote`. Vercel deployment
`FN5zDLvhpa124VKCgDTmFUnTWn4Z` succeeded; the public website served
`v1.0.0+g01d62ab36` before the live probe.

`frame-warm-production-actions-r1/report.json`, SHA256
`5d081445591bf945b8010b9417d0d9aa91a6d386408f91cc1e7196d6dd70537d`,
passes the same actual-control/audio/gesture/warm/source-readiness gates on
`https://cot.kevinliu.studio`. Public HTML hash:
`26a6ddd8219c7fb286e13b21a6755b41b99c89507921e9bca091a8380791539c`.
Chrome151; failure, error and cleanup arrays are empty. The day battle,
night rematch and returned Garage screenshots were visually inspected.

| Live action | Click → cover | Click → ready | Maximum callback gap |
| --- | ---: | ---: | ---: |
| Battle | 2.6 ms | 8,577.5 ms | 175.7 ms |
| Battle Again | 132.2 ms | 5,681.9 ms | 65.9 ms |
| Return to Garage | 91.0 ms | 334.0 ms | 47.1 ms |

In the separate complete local caster-stage observation, both Battle and
Rematch select 70 casters rather than the old 48, including all 22 named
layer29 map-wreck proxies. Each observed proxy submits once; the caster stage
contains 57 distinct shadow submissions and zero forward submissions, versus
1,452 total entries across the older repeated cohorts. Submitted entries are
not serialized cohort membership, and the old identity capture was capped.
All four final cascades remain, while intentional geometry-upload forward
work is unchanged. The final-cascade identity capture is still capped, so
its full phase classification is not inferred from that receipt. These
observations verify the mechanism, not a causal timing estimate.

The strict gameplay FAIL remains open. The candidate's 117 three-callback
slow cohorts reject the second source callback with a 1.500–1.667 ms deadline
deficit, just beyond the unchanged 1.5 ms allowance. A fitted model accounts
for these outcomes, but actual scheduler-entry wall time was not recorded.
Measuring that directly is the next diagnostic; changing a tolerance merely
to pass is not a fix. Historical untraced 214–319 ms stalls remain unproven.
