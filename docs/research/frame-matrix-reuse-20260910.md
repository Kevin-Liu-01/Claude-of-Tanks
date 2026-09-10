# Frame matrix reuse and measurement correction

## Scope and evidence

The current implementation follow-up targets repeated CPU scene traversal, not
an assumed explanation for the untraced historical 214–319 ms gaps. Earlier
Garage input/audio and cold-entry-cover fixes are already shipped; see
`interactive-performance-20260909.md`. Wreck and multiplayer implementation
ancestry was rechecked against `54629c70c`; the closeout remains in
`wreck-multiplayer-delivery-2026-09.md`. That does not claim physical distant-
network testing, exact single-player/network equivalence, or zero latency.

The retained `early-camera-profile-baseline-r1.json.cpuprofile` attributed
1,260 samples / approximately 1.973 seconds of inclusive sampled weight to
`LateFxPass.render → WebGLRenderer.render → updateMatrixWorld`, recurring in
all sixty sampled seconds. These are statistical weights, not exact durations
or predicted savings. The pinned renderer updates the whole scene graph before
layer filtering, so the late-effects draw repeats the source draw's traversal.

## Runtime change

Only a complete synchronous `post.render` transaction with the canonical
SceneAA → Aerial → GTAO → LateFX prefix may reuse scene matrices. The source
publishes permission after a successful draw. Renderer, scene, camera, epoch,
and update ownership must match; the consumer can use permission once.

LateFX disables only the scene-root `matrixWorldAutoUpdate` flag around its own
draw and restores the exact original value in `finally`. Camera and descendant
flags are unchanged. Every outer frame exit invalidates permission. Isolated
warm passes, direct composer calls, reordered chains, failures, and mismatched
identities retain the original behavior. AO does not disable the optimization.

Current intervening passes and render callbacks do not change application
Object3D transforms. Future transform-mutating callbacks or inserted passes
must invalidate this contract rather than silently reuse old matrices.

CPU regressions execute real pass/composer classes and assert fresh moving
parent/FX transforms inside both draws, one source traversal instead of two,
AO on/off, inactive effects, standalone warming, resize, identity/epoch/flag
guards, single consumption, and failure restoration.

## Correcting the measurement, not inflating FPS

The old `perfprobe-raf-v2` sampler measured all browser animation callbacks.
At 120 Hz, approximately half had zero draw submissions because the application's
presentation owner is capped at 60 Hz. The reported 120.5 FPS was therefore not
rendered game FPS. The original receipt is retained, not rewritten.

`perfprobe-submission-v3` records intervals between observations of positive
renderer submissions, including intervening skipped callbacks. Raw browser
callback arrays remain separately available. It explicitly records the final
unfinished interval. Neither metric proves GPU completion or display scanout.
Version-2 and version-3 FPS histories must not be compared as one series.

## First corrected native comparison

Both immutable local public-build runs used the same acquisition hash
`013f202b43a4a520c49acb9d6ff6afaca384bd5dd2db1a23b256112af583cb04`,
Chrome 151 / native Apple M5 Max ANGLE, high, 1280×577 / DPR 1, scale 1,
trim 0, unchanged AA and shadows, the full pinned 7:7 Verdant roster, driving,
firing, and all 29 trusted camera pulses. Both were uncontended and had no
application exceptions. They are local acquisitions, not remote-site tests.

| Build | Median / p95 / p99 interval | Maximum interval | Peak draws |
| --- | --- | --- | --- |
| Preserved `1104b9916` artifact | 16.7 / 18.2 / 25.2 ms | 34.7 ms | 905 |
| Matrix-reuse candidate on `54629c70c` | 16.7 / 25.0 / 25.9 ms | 42.6 ms | 863 |

Baseline HTML SHA256:
`4bdbd1345f2ed22984b6088eb87b9ec8ee910e7c0db26632b59c55d7d1809c88`.
Candidate HTML SHA256:
`48330f397ebc35622a05b7260f7acb7a8610eb146bfc47e426dc474fcdffba0f`.
The observed checkout/source was separately frozen; the baseline was an
explicitly preserved older artifact, not inferred from the current checkout.

**Neither run passes the unchanged complete performance budget.** In particular,
the interval percentiles still exceed the 25 ms p99 threshold and rounded
median FPS is 59.9 against 60. The first pair does not demonstrate a gameplay
speedup; short/long presentation intervals and slightly different battle paths
remain visible. No threshold or graphics-quality setting was relaxed.

An earlier CPU-profile acquisition timed out at sample-edge collection; its
failed receipt is retained and supplies no successful attribution window.

Evidence root: `/private/tmp/cot-interactive-baseline.gsRCvU/`, prefixes
`current-early-camera-*`, `matrix-reuse-baseline-v3-r1`, and
`matrix-reuse-candidate-v3-r1`. Final rendered, tooling-admission, and landing
results are appended only after they complete.

## Rendered parity and admission regressions

The strict native `late-fx-matrix.browser.selftest.mjs` gate passed all twelve
cases: 0/4-sample MSAA, intervening AO-stage off/on, and three moving frames.
Reference and reuse RGBA outputs were byte-identical. The actual source and
late-effects passes traversed the graph twice in the reference and only once
with scoped reuse, with fresh transforms observed inside both draw calls.
Negative controls for missing effects, missing depth occlusion, stale geometry,
and stale camera each changed the rendered pixels. The AO-stage is an identity
fullscreen stand-in, not a certification of the AO shader itself. The PNG was
visually inspected; browser, local server, and capture lock all closed cleanly.
Receipt: `matrix-reuse-native-pixels-r1/report.json` in the evidence root above.

The probe now refuses non-battle, empty, malformed, mismatched, or incomplete
submission windows; the right-censored terminal gap must fit the existing p99
budget. No missing frame is synthesized. Failed budgets set the outer failure
status instead of shadowing it with a local variable, so they exit nonzero.
The first pair above predates this exit-code fix and exited zero despite its
explicit budget failures; it is not a passing certificate. Regression coverage
includes negative admission, nonzero failure wiring, empty metrics, and separate
callback/submission arrays. The suite registry discovers 925 ordered checks;
that discovery is not a claim that all 925 ran in this change.

## Bounded cadence tolerance

The presentation scheduler keeps its absolute deadline grid but increases its
early-callback allowance from 0.75 ms to `min(1.5 ms, interval × 0.1)`. A callback
just over 0.75 ms early previously missed its slot, creating a long interval
followed by a short catch-up interval. Resetting deadlines from accepted callback
times was rejected: that under-delivers at 75/90/144 Hz refresh rates.

A deterministic 60-second injected-jitter negative control produces over 1,700
long/short pairs with the previous allowance and none with the new allowance,
while both deliver exactly 3,600 ticks. Two-minute perfect callback streams at
30/59.94/60/75/90/119.88/120/144/165/240 Hz preserve their expected capped rate
within 0.02 Hz. Input, idle, hidden-tab, overload/recovery, and deadline-budget
tests pass. These are CPU counterfactuals, not native gameplay measurements;
the final paired native results are recorded separately below when complete.

## Final local paired acquisition

Both final runs used acquisition hash
`8b9b844fbfaba524f073e4373918b7d2b8b0457ecb6e87f90c3fb7db69d62205`,
the same full-detail 7:7 Verdant workload and unchanged settings above, and
unchanged source hash
`683ebc1b2403ec535bcc13a6cae3316c69fd749d7f11d232aa8a5b98d839307b`.
The baseline consumed the preserved older artifact; the candidate was built
with matrix reuse plus the bounded cadence tolerance on `54629c70c`.
Candidate HTML SHA256:
`20b5a2f3d84ffa6f2a38dff7a52176c5f960adcbec376261013cb8ab0ed4412d`.

| Observation | Preserved baseline | Final candidate |
| --- | --- | --- |
| Median / p95 / p99 interval | 16.7 / 25.0 / 26.6 ms | 16.7 / 18.4 / 25.1 ms |
| Maximum interval | 35.1 ms | 41.4 ms |
| Long→short pairs (22–30 ms, then <12 ms) | 309 | 120 |
| Submission intervals / 60-second window | 3,593 | 3,602 |
| Peak draw calls | 843 | 889 |
| Application exceptions | 0 | 0 |
| Trusted camera coverage | 29/29 | 29/29 |

Both runs were uncontended by the existing machine criteria. The candidate
reduced observed short/long pairs by 61% and p95 interval by 26% in this pair;
this is not a repeatability certificate or isolation of each patch's contribution.
The absolute worst interval did not improve. The baseline's 26.3 ms unfinished
terminal interval refused admission; the candidate's terminal interval passed.
**Both correctly exited 1:** candidate p99 25.1 exceeds 25 ms, and rounded
median FPS 59.9 remains below the unchanged 60 gate. No gate was relaxed.
`fps.mean` remains the mean of instantaneous reciprocal intervals, not aggregate
submission throughput; the submission count/window is the appropriate aggregate.
Raw receipts: `final-matrix-cadence-{baseline,candidate}-r1.{json,frames.json}`.

Focused source-pass, late-effects, scheduler, probe-submission, probe-contract,
camera-input, and profile-window regressions passed. Typecheck (including
core-unused), public build, and diff checks passed. Changed-scope React Doctor
reported 92/100 and no issues. The strict native pixel gate also passed as above.
This does not replace a full-fleet, multi-device, or long-session certification.

## Landing and live functional verification

The scoped change rebased cleanly onto `f84f260a9` as
`40e60226bcbec826528eb639db489d45239a05f2`. Exact-revision focused regressions,
typecheck/core-unused, and public build passed before the non-force push.
Vercel deployment `6AYMXxDRLhddQB9rHTGrcDJa41yZ` and the GitHub catalog gate
succeeded. The live application identified itself as `v1.0.0+g40e60226b`.

The maintained real-control probe ran on `https://cot.kevinliu.studio` from
07:58:06–07:58:41 UTC on 2026-09-10. Production HTML SHA256 was
`ed5809892280a0fdd267490958bbb0ca98121d75b980cb9d14a47f8fae36b40a`.
Garage drag, Battle, Battle Again, and Return to Garage passed; there were no
application exceptions, contract failures, or cleanup errors. Battle and
returned-Garage screenshots were inspected. High graphics, DPR/scale 1, trim 0,
and SMAA-high/FSR1 remained enabled on native Apple M5 Max ANGLE.

| Production action | Click→opaque cover | Click→ready | Largest callback gap during action |
| --- | --- | --- | --- |
| Battle | 2.4 ms | 8,535.7 ms | 184.9 ms |
| Battle Again | 140.7 ms | 5,665.3 ms | 109.4 ms |
| Return to Garage | 90.3 ms | 340.0 ms | 44.5 ms |

These are functional transition timings, including covered loading/countdown,
not sustained battle FPS or a zero-stall certificate. Garage drag created no
AudioContext; the single native context was constructed on Battle intent
(153 ms), and audio-clock ownership/cleanup passed across both battles and
return. No audible-output claim is made. Receipt/screenshots are in
`matrix-cadence-production-actions-r1/` under the evidence root above.

The integration review additionally found that the new native test needed the
runner's exclusive own-lease registration; without it, full posttest could
nest its capture lease. The cooperating test-runner lane published that
correction in `f9d94e18ef01ad44a0abfe67c5a244e4cc26eda0`, a direct child of
`40e60226b`, with sequential/two-worker missing-registration negative controls.
Its exact post-rebase focused checks, types, and scoped Doctor passed; the
default runner concurrency remains one. The direct native gate and game
runtime do not depend on this registry. This closes the discovered integration
defect, not the outstanding full performance budget or a full-suite run.

Remaining limits are explicit: the original untraced 214–319 ms stalls still
have no proven historical attribution, the full current performance budget
still fails, covered loading has measurable stalls, and same-machine tests do
not prove geographically separated-device performance or overcome OS suspension
of a browser-hosted match. The language/transport evaluations and shipped wreck/
multiplayer fixes remain linked in the existing closeout documents; this patch
does not reopen or reimplement them.
