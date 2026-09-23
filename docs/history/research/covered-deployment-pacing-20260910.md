# Covered deployment pacing — 2026-09-10

Follow-up to [frame/matrix measurement](frame-matrix-reuse-20260910.md).
Evidence root: `/private/tmp/cot-interactive-baseline.gsRCvU`.

## Follow-up: bounded deployment buffer uploads

The subsequent production profile, `deployment-shadow-production-profile-r1/`,
used HTML SHA256 `06f9e98949055b33406dd4f3ff1502ac1dc17d936bf28bb5e50522d3843`.
Its first caster batches were 13/6 ms, **not** the preceding 233/213 ms stalls;
those earlier native causes remain unproven. Functional/audio/cleanup gates
passed, but this is attribution evidence, not smoothness acceptance.

Intersecting profile-start and profile-stop brackets places the Battle profile
start in page time 4364.260–4395.160 ms. Whole sample intervals guaranteed
inside the corresponding long task across that entire uncertainty range show:

- 11253–11374 ms: 72.642 ms of native `bufferData` sample weight under
  deployment `warm → prime → renderer → WebGLAttributes`. The upload receipt
  independently reports 120 ms for its single whole-scene submission.
- 5589.6–5727.6 ms: 72.289 ms native `getImageData`, under sourced
  `applySet → composeSet → composeAlbedo/readScaledPixels`.
- 5779.7–5924.7 ms: 113.068 ms native `AudioContext`. The passive constructor
  observer independently records 5779.8–5920.6 ms (140.8 ms) inside this task.

The latter two long tasks account for 283 ms of the worst 335.9 ms
callback-start gap. The other 52.9 ms is not assigned to GPU/driver wait.
Sample weights are not exact native-operation durations, and cannot explain
uncaptured historical pauses.

The upload correction reuses `warmSceneOffscreenBatched` with the existing
offscreen render and shared unlit upload material, at 12 objects/45000 weight
per cohort. Original geometry, instances, LOD selection, render target,
camera, texture sizes and final cascade rendering remain unchanged. Layer
masks and material overrides restore synchronously before each covered yield,
including errors; a mesh parent never prunes its child's later batch.
`geometryUploadMs` now sums actual batch submissions (not the intervening
waits); individual batch durations and their maximum are reported separately.
One native buffer allocation remains atomic: cohort bounds are not a promise
that every browser/driver operation fits a frame.

A bounded warm-only observer records actual direct-draw identity, selected
material and CPU submission time for upload, caster and cascade passes.
Camera identity distinguishes shadow, forward and other submissions, including
unculled forward draws through the shadow-only camera. No GL queries or
renderer-property allocations are introduced. Own/inherited method descriptors,
receiver/arguments/return values and original errors survive observation; a
hook-installed replacement is never overwritten. Caps of 64 render rows and
256 detailed draw rows explicitly count dropped observations without dropping
real draws. Final quotas reserve 32/24/8 render rows and 128/96/32 detailed
draw rows for upload/caster/cascade respectively, so upload cohorts cannot
consume later shadow observations. This diagnostic does not run in the gameplay
loop and does not claim shader compilation or GPU-duration attribution.

### Upload candidate verification

Focused deployment-shadow, offscreen-warm, solo-deployment and loading-screen
tests pass. They include nested renderable parents, 27-object upload coverage,
exception/cancellation restoration, exact cascades and diagnostic ownership/caps.
Typecheck/core-unused, public build and strict metrics (47 functions, zero
complexity violations or explicit any/unknown) pass. Changed-scope Doctor is
91/100 with five ordered-test-loop warnings, zero errors and no runtime warning.
Logs: `deployment-upload-batches-checks-r3.log` and
`deployment-upload-batches-final-checks-r1.log`. Earlier r1 stopped at an obsolete
source matcher; r2 passed behavior tests then caught Material.id typing. The
matcher retains its order/renderer requirements and the diagnostic now uses the
public material UUID; neither failure was waived.

`deployment-upload-batches-candidate-actions-r1/` is an unprofiled native
candidate, not production. HTML SHA256:
`7b7960a984750501330c29fd106bf123b6d4d93909799eede9177528b43c0a59`.
Actual Battle/night-rematch/Garage controls, audio-clock/intent and all cleanup
gates passed with no application errors. The three resulting screenshots were
inspected. M5 Max, 1280×720/DPR1, high, scale1/trim0 and SMAA-high/FSR1 remained
unchanged; both battles retain all 14 roster entities and the rematch 110 night
emitters. This capture precedes the diagnostic-only phase reservation above.

| Action | Cover ms | Ready ms | Largest callback-start gap ms | Upload batches / max submission ms |
| --- | ---: | ---: | ---: | ---: |
| Battle | 2.1 | 6602.9 | 156.4 | 104 / 15 |
| Night rematch | 140.6 | 5656.5 | 100.4 | 105 / 39 |
| Garage return | 97.0 | 347.7 | 44.4 | not run |

The preceding unprofiled production capture had a 106 ms whole-scene cold upload;
the profiled production capture had 120 ms. Cohort subdivision removes that
single whole-scene submission, but these sequential local/production samples
are not a repeated matched cold-cache speed certificate. In the candidate,
the cold 1,014,720-vertex object's cohort took 11 ms (10.6 ms before its first draw).
The rematch's 39 ms cohort spent 38.8 ms inside one 24-vertex direct draw while its
JS program count grew 353→354. This identifies a submission, not the native
compile/link/driver operation. First caster batches were 13/8 ms; cascades ≤3 ms.

Other stalls remain: the candidate's native AudioContext constructor took 144 ms
inside its largest entry gap; rematch's worst gap was during allied preparation.
Do not infer the latter's native cause from that label or claim this patch
completes loading, sustained battle, or cross-device performance work.

### Live upload follow-up: functional pass, cold stalls remain

Commit `bcf8ae4f006f4e29659dd45b78cccd77c4f75012` reached production as
`v1.0.0+gbcf8ae4f0` (Vercel `7iEzAVhwygoY97CgS7WFm9edgCkQ`).
`deployment-upload-batches-production-actions-r1/` tested the actual public
controls, with HTML SHA256
`83d40c88512a81e567bde99f101946052e4f16c1701b4aa89804fd97857f8cc7` and
acquisition SHA256
`4be85c77e2b4a9596a9046b8b8bd6956bc44b3e3543677409654626ca119f137`.
Functional, audio-clock, Garage gesture-intent and cleanup gates passed; no
application errors were reported. Day/night battle and returned-Garage images
were inspected. Native M5 Max ANGLE, high, 1280×720/DPR1, scale1/trim0 and both
full 14-entity rosters were retained. This remains a functional capture, not a
frame-budget certificate.

| Action | Cover ms | Ready ms | Largest sampled callback-start gap ms | Upload batches / maximum ms |
| --- | ---: | ---: | ---: | ---: |
| Battle | 2.7 | 8560.6 | 229.1 | 104 / 61 |
| Night rematch | 139.5 | 5689.4 | 67.4 | 105 / 6 |
| Garage return | 90.1 | 340.9 | 44.7 | not run |

Cold upload submissions totalled 107 ms; their first cohort took 61 ms, with
60.5 ms inside the first 24-vertex unlit direct draw and JS programs 192→193.
The remaining upload cohorts were at most 11 ms. Rematch uploads totalled
11 ms; first caster batches were 15/6 ms and final cascades at most 3 ms.
Batching has not eliminated the first-draw stall. Its native compile/link or
driver cause is not proven by a program-count change alone.

The cold 229.1 ms callback-start gap was 4486.8–4715.9 ms in page time.
The passive native AudioContext constructor observation was
4550.0–4709.9 ms (159.9 ms), entirely within its 164 ms long task and this gap.
An adjacent 63 ms task also falls in the gap, but this unprofiled capture cannot
attribute it to image processing merely because earlier profiles did so.
Rematch's independent worst-gap witness rounds to 67.5 ms; its 53 ms task
occurred during deployment priming. Return had no 50 ms long task. These results
keep audio startup, first-use programs, sourced readbacks and sustained-frame
budgets open rather than claiming that a passing functional gate closed them.

## Attribution before the change

The maintained production action profiler completed Battle, Battle Again and
Return to Garage with no application, contract or cleanup errors. Its directory
is `terrain-preparation-production-profile-r1/`; HTML SHA256 is
`cd8c9269fb102778d882082c56beb5636a970c7026b20c744c9bced79d900cbc`.
This is statistical CPU attribution, not a speed certificate.

The largest Battle callback gap was 180.7 ms, from page time 6419.5 to 6600.2.
The passive constructor observer recorded native `AudioContext` construction
at 6449.8–6595.5 (145.7 ms), entirely inside that gap and its 150 ms long task.
The CPU profile independently contains 146.275 ms of native constructor self
sample weight. Intersecting start/stop clock brackets gives a profile-start
page-time range of 5050.400–5083.718 ms; 118.133 ms of whole-sample weight is
guaranteed inside the gap despite that uncertainty. This identifies the browser
constructor, not its internal device/driver implementation. No context options,
audio fidelity, gesture rules or loading-clock behavior were changed.

Do **not** transfer this attribution to the earlier unprofiled 185.0 ms gap in
`matrix-cadence-production-actions-r1/`. That gap was at 4979.2–5164.2, while
its constructor was at 4405.4–4558.4 on the same `performance.now()` clock.
Its terrain label and 149.9 ms long-task overlap do not identify a function.
The initial terrain investigation found atomic texture/noise/mask producers,
but no terrain rewrite was made on the strength of a label alone.

The profiled rematch had a distinct 121 ms gap at 17831.5–17952.5 during allied
vehicle preparation. Its profile-start range is 15679.400–15700.559 ms.
Within the guaranteed interior, 84.587 ms of samples descend through the
actual visual streamer/roster construction, including 83.072 ms through the
tank factory. Several private builds ran between animation opportunities.

## Scoped correction and invariants

`soloBattleDeploymentRuntime` previously selected an 18 ms cooperative task
budget and an 80 ms animation-request interval. It now uses **12/32 ms**,
matching foreground world preparation. Existing private factory checkpoints,
generation guards, full roster, camouflage, texture uploads, program warming,
day/night setup and reveal barrier are unchanged. A task yield is not a paint;
the shorter interval explicitly requests an animation callback more often.
It cannot preempt one synchronous checkpoint or certify a physical paint.

The focused regression composes the real visual streamer and scheduler with
injected time: six allied builds, ten private 4 ms checkpoints each, an already
staged player and seven deferred enemies. It requires task release at 12 ms,
frame requests at 32 ms intervals, unchanged spec/quality inputs, exact actor
publication and all 14 roster identities. Cancellation before a checkpoint or
inside task/frame waits closes the private iterator without publishing stale
visuals or entering downstream warm/reveal. The former 18/80 policy cannot
satisfy these cadence expectations.

Focused deployment, streamer and scheduler tests passed, as did typecheck,
core-unused, public build and whitespace checks. Broad read-only Doctor remained
42/100 (97 errors/697 warnings already present). Changed-scope Doctor was
92/100 with one existing sequential-test-await warning, not a runtime warning.
Logs: `rematch-pacing-{doctor-before,checks}-r1.log`.

Before landing, the owner branch incorporated upstream `4aa008627` without
conflicts. The same three focused tests, typecheck/core-unused and public build
passed again on that integrated tree (`rematch-pacing-rebased-checks-r1.log`).
The native candidate receipts below predate those unrelated upstream terrain
and three-tank changes; they are not mislabeled as an integrated-tree capture.

## Unprofiled native candidate check

`rematch-pacing-candidate-actions-r1/` used native Apple M5 Max ANGLE,
1280×720, DPR/scale 1, high graphics, trim 0 and SMAA-high/FSR1. Build HTML
SHA256: `6849653d5dc969748ec1f0fa3d2448b0023cea286c8722e72f38f88c4f0cbadb`.
All actual controls, passive audio-clock/intent gates and cleanup passed.
Battle/rematch and returned-Garage screenshots were inspected.

| Action | Click → opaque cover | Click → ready | Largest callback-start gap |
| --- | ---: | ---: | ---: |
| Battle | 2.6 ms | 6520.8 ms | 156.7 ms |
| Battle Again | 140.0 ms | 5639.9 ms | 69.5 ms |
| Return to Garage | 87.7 ms | 438.1 ms | 77.1 ms |

Rematch gaps whose endpoints both said `Preparing allied vehicles` peaked at
65.2 ms, versus 109.8 ms in the earlier unprofiled production receipt. The new
largest rematch gap moved to `Priming deployment view`; no rematch long tasks
were observed. This local-versus-production observation is not a repeated,
matched-acquisition speedup certificate. Cold entry still paused; Garage return
was worse than the earlier sample. Do not present the patch as fixing those.

## Fresh gameplay diagnostic and remaining limits

The once-retried maintained 60-second early-control-release/native-cadence
profile completed successfully, unlike the previously inconclusive acquisition
timeout. Report: `rematch-pacing-gameplay-profile-r1.json`; raw profile SHA256:
`25a653af072e37d34c678ada280521f3b783fc5cc745a074b55bd26405924ebd`.
It used the same candidate build, Verdant, full eligible 7:7 roster, high
graphics, scale 1/trim 0, and 29/29 observed trusted camera inputs. Admission
passed; no foreign headless/GPU contention or application errors were recorded.
All profile cleanup completed. No 50 ms long tasks occurred during gameplay;
the largest callback-start interval was 35.3 ms. Submission p95/p99 were
18.2/25.0 ms. These are diagnostic observations under profiling overhead.

The unchanged budget correctly **failed**: median 59.9 FPS is below 60 and
maximum 944 draw calls exceeds 900. The harness exited 1 and explicitly refused
speed certification. This neither certifies repeatable smoothness nor explains
the historical untraced 214–319 ms stalls. Their exact cause, cold native audio
startup, remaining terrain/loading/return pauses, heavy-scene tails and physical
multi-device/network validation remain open. Browser/OS suspension limits are
unchanged. Language and transport evaluations are already documented separately;
this patch does not claim a C/Go/Zig/Rust rewrite or new transport deployment.

## Post-push production result: overall smoothness still fails

Pacing commit `4b321885c676877b83f9dd6725bcef164cab8f29` was pushed without
force and deployed by Vercel deployment `81MAPcpCMbgMCC6rWrrdGidKjmtK`.
The live site reported `v1.0.0+g4b321885c`, entry `main-CjD6qsvN.js`, HTML
SHA256 `1a3d40965731aaac45132d4eb6c2f6352f12a48eccf34002f13395e66bafeec8`.

`rematch-pacing-production-actions-r1/` completed the actual three controls,
audio intent/clock checks and cleanup without application errors. Native M5
Max, 1280×720, scale 1, trim 0, high graphics and full 14-actor roster were
retained. However its callback-start gaps **failed the smoothness objective**:

| Action | Click → opaque cover | Click → ready | Largest callback-start gap |
| --- | ---: | ---: | ---: |
| Battle | 2.6 ms | 9219.3 ms | 235.0 ms |
| Battle Again | 139.0 ms | 7263.7 ms | 209.3 ms |
| Return to Garage | 90.8 ms | 341.4 ms | 46.4 ms |

Allied-only gaps peaked at 73.5/67.6 ms. Separate deployment/reveal pauses
remain. Battle's 235 ms gap occurred at page time 11273.2–11508.2, with a
234 ms long task starting at 11274.1. Its preceding 213.7 ms gap was
11024.1–11237.8. Rematch's 209.3 ms gap was 17998.5–18207.8, preceded by
188.4 ms at 17777.1–17965.5. The `Ready` and shadow-stage labels do not
attribute those pauses by themselves.

The actual deployment owner recorded its **66-object terrain forward batch
at 211 ms on Battle and 166 ms on rematch**. Other forward batches were
at most 3 ms on Battle. Shadow-stage labels span some forward preparation;
they are not evidence that CSM rendering itself consumed the entire gap.
The reveal barrier recorded only 15/8 ms, so it does not explain the later
235/209 ms `Ready` gaps either.

An immediate maintained CPU-profile retry, `reveal-pause-production-profile-r1/`,
used the identical live HTML hash but **did not reproduce** the >200 ms
pauses. Battle peaked at 153.5 ms, rematch at 77.4 ms and return at 46.9 ms;
no terrain forward batch exceeded 20 ms. Both runs are retained. A driver or
shader-cache effect is plausible but unproven; a profiled repeat must not be
substituted for the failed unprofiled first-use observation.

### Follow-up preparation coverage correction

Source review found a distinct, testable coverage gap: `initializeSteps(root)`
admits only wrappers newly created by its own compile. A retained terrain
wrapper submitted by the preceding whole-scene compile can still be unreflected.
Zero new programs is not proof of completed uniform/attribute preparation.

The follow-up adds opt-in `visibleRoot` selection to the existing strict scene
preparation path. Default selection is unchanged. The selected root must remain
attached beneath the real scene through visible ancestors. A flat compile
facade preserves original object/material identity and real lights/fog/environment,
while excluding hidden descendants and unrelated roots. Existing selected-material
program caches, not only newly submitted wrappers, participate in the established
context/epoch/native-handle readiness and both-table reflection witness rules.

Solo deployment uses that path only for the active world's direct terrain
child, after opening terrain and shadow preparation. It selects the actual
source-pass AA target and excludes the separate late-FX layer. Each iterator
checkpoint and final preparation boundary releases covered work; generation and
world/root ownership are rechecked before resuming. Incomplete/failed preparation
remains explicit in `deploymentTerrainPrograms`, with the unchanged covered draw
as compatibility fallback. Hidden effects, other worlds, shaders, texture
resolution, full roster, AA and lighting are not reduced.

This closes an actual preparation-coverage hole. It does **not** prove that
native reflection caused the recorded 211/166 ms draws, nor that a native call
can be preempted by the cooperative 4 ms budget. The native candidate verification
below is separate from the failed production observations above; those remain
the latest unprofiled live evidence until a replacement production run completes.

`terrain-program-preparation-candidate-actions-r1/` then exercised the follow-up
through the same maintained native controls and acquisition hash. HTML SHA256:
`4b26bbc7fa8e2d080fbb880c48ecc9806d85c5500cfa3521fe30be1eb67f45fa`.
All control/audio/cleanup checks passed; day battle, night rematch and returned
Garage screenshots were inspected at high graphics, scale 1/trim 0. Terrain
preparation explicitly completed with zero pending programs: three previously
submitted wrappers were reflected on Battle despite unchanged program count,
and rematch reused three witnesses while reflecting three night variants.
The terrain forward draw measured 6/0 ms (integer-rounded diagnostic values).

Battle/rematch/return maximum callback-start gaps were 159.6/79.1/46.2 ms;
click-to-cover was 2.1/141.5/90.9 ms and click-to-ready 6506.7/5615.7/341.2 ms.
These observations prove the intended preparation path actually ran, not a
repeatable cold-driver speedup. Cold entry and allied preparation still missed
frame budgets. The later source-only label correction reuses an already
localized loading stage rather than introducing an untranslated English string;
it does not change this shader or render behavior.

Focused program/scene/deployment/loading/scheduler tests, strict complexity
metrics (zero violations), typecheck/core-unused and public build passed.
The first metric run rejected cognitive complexity 23 in the expanded compiler;
extracting its selection helper restored the strict gate without changing
selection. Logs: `terrain-program-preparation-checks-r{1,2}.log`. Changed-scope
Doctor reported 90/100 with three performance warnings, no errors: an existing
chained test assertion and two sequential awaits. One await is the new runtime
preparation iterator's required order/lifetime boundary, not parallelizable
independent work; the other is an existing sequential test. Neither was
suppressed or changed to concurrent native renderer operations.
The first full-suite launch was interrupted before any test executed because
the outer capture wrapper duplicated the suite's own resource lease. Its log
is retained; the corrected invocation lets the maintained suite own its lease.

The corrected full run (`terrain-program-preparation-full-checks-r2.log`)
passed all 296 pre-tests and 537 core files, then stopped on an unrelated
Orchard fixture dependency: its extracted production placement stage referenced
`foundryDonors` without copying the production initializer. A one-line test-only
repair copies that initializer through the fixture's existing TypeScript
stripper. All frozen geometry hashes, RNG tails and capacity assertions remain
unchanged; its focused check passed (`orchard-fixture-dependency-check-r1.log`).
The resumed maintained runner then exposed a loading-screen ordering oracle
that evaluated the newly typed receipt as plain JavaScript. That oracle now
strips the actual source's types before evaluation, retaining all six negative
controls rather than excluding the new preparation block.

The continuation uses the maintained `runSelftestSuite` scheduler and complete
suite catalog, excluding only files with explicit PASS records in the retained
preceding logs. It reruns every failed file and executes every unexecuted file,
with the same two-worker CPU limit and exclusive browser barriers. Logs
`terrain-program-preparation-full-checks-r3-resume.log` and `r4-resume.log`
are **resumed verification**, not an uninterrupted `npm test` pass or a cached
test result. Runtime source stayed frozen throughout those checks.

That continuation finished successfully: the union of explicit PASS records
exactly matches all **929 catalog files: 296 pre, 595 core and 38 post**.
Both prior failures are retained above; no failed or unexecuted file was omitted.
The final continuation exited zero. The final public build also passed
(`terrain-program-preparation-final-build-r1.log`). These are candidate-tree
receipts; any subsequent integration and production capture are recorded
separately, not retroactively attributed to this test run.

### Rejected image-decoding hypothesis and observer audit

An isolated, committed maintained probe (`832bc50913fd850bcdaae20f35477f433ddaecdb`,
tools only, no runtime changes or push) compared image `onload` with explicit
`await image.decode()` before the actual sourced `composeAlbedo`/`composeSurface`
functions. Receipt: `sourced-image-composition-native-r1/report.json`.
Six real urban source families were tested in both AB and BA orders, using 24
fresh contexts, high-quality 1K composition and an intentional one-second delayed
reuse. Actual source blobs and the pinned tool/runtime dependencies were recorded.
All 48 requested decodes fulfilled and all 72 exact RGBA comparisons passed.
There were no application or cleanup errors; the owned browser/server stopped.

Decode did **not** remove first Canvas readback cost. Its paired first-readback
delta ranged from -1.6 to +0.1 ms, while request-to-first-result time was worse
in all twelve pairs by **19.2–47.4 ms**. Reuse had no consistent improvement.
Shared browser-process/OS caches prevent treating fresh contexts as physically
cold machines. The experiment rejects this proposed runtime change rather than
presenting an isolated microbenchmark as a game speedup. No image resolution,
composition pixels, sampler or material behavior was changed.

A separate source/receipt audit of the exact production acquisition hash ruled
out the observer's deep trace copy and screenshots as causes of the Ready gaps:
copies start at 13687.9/21253.2 ms, well after the respective gaps. Callback-start
gaps of 235.0/209.3 ms differ from end-of-observer gaps of 234.9/209.2 ms by only
approximately 0.1 ms; the preceding observer's synchronous layout/audio reads
therefore did not consume those pauses. Battle's long task starts approximately
0.8 ms after that observer returned. The active modal poll and PerformanceObserver
callbacks lack individual duration stamps, so indirect layout/GC effects are
not ruled out, but neither has positive attribution. No observer or reveal
timing change was justified. The successful reveal path re-covers while Ready
finishes; `post.render` returning is not proof of physical GPU completion.

The retained gameplay profile was also checked separately. Its profile/page
alignment range (1475.600–1517.402 ms) is wider than the 35.3 ms callback gap,
so it cannot reliably assign that interval to an application function. The
18.2/25.0 ms p95/p99 values are submission intervals, not CPU task durations.
The 944-draw maximum is not opening warm-up: it occurs over nine consecutive
late-window frames at 58.916–59.048 seconds. Counts of at least 900 occur 133
times, including a 121-frame consecutive run. Ten-second medians rise from
558 to 893, so the late workload still needs investigation. No quality reduction
or budget relaxation was made to hide it.

### Isolated sourced-image worker result — not adopted

The tools-only follow-up `27592e18fa3e8915a097c5c28f7d2f24cd72bf55`
compared the actual main-thread composers with their exact formulas in fresh,
one-shot OffscreenCanvas workers. Receipt:
`sourced-image-worker-native-r1/report.json`. All 36 trials and 104 strict RGBA
comparisons passed with zero changed channels, including the three explicitly
labeled missing-optional-image fixtures. All 92 input bitmaps transferred and
closed; browser exit, owned lease release and unchanged runtime source were
confirmed with no application or cleanup errors.

First-composition main callback gaps improved in all 18 pairs by 14.9–27.8 ms,
but image-ready-to-adopted-result time worsened in every pair by 4.3–12.3 ms.
Delayed-reuse completion worsened by 19.0–45.8 ms, with worse callback gaps in
13 of 18 pairs. Bootstrap, bitmap conversion, required worker RGBA export and
main canvas adoption are included; termination/revoke are separately timestamped.
The result demonstrates a first-use responsiveness tradeoff, not an overall
game speedup. No worker integration, quality reduction, or additional native
variant was shipped on this evidence.

### Publication and fresh live check

The loading fix landed on `origin/main` as
`f3b03c8d83e288b541b1a8af03c76650e06c9c9b`, after the separate Orchard
fixture repair `74bd201de` and upstream canopy-lighting `cd62def6e`.
The rebased ten focused tests, strict metrics (zero violations/any/unknown),
typecheck/core-unused and public build passed:
`terrain-program-preparation-rebased-checks-r1.log`. Vercel deployment
`FAt58uN9QvmUBuZvc4Vhk1zuVZ72` completed successfully; the live HTML displayed
`v1.0.0+gf3b03c8d8` before capture.

Fresh unprofiled actual-control receipt:
`terrain-program-preparation-production-actions-r1/report.json`, completed
2026-09-10T09:53:40.913Z. Live HTML SHA256:
`f3f197770aeb28f2a1d55ea989c7ec7a937ead52fe70f8f6c4ee1ce220bbd458`;
acquisition SHA256 remains
`4be85c77e2b4a9596a9046b8b8bd6956bc44b3e3543677409654626ca119f137`.
Real Battle, Battle Again and Return to Garage passed functional, audio-intent,
audio-clock and cleanup checks with no application errors. All three screenshots
were inspected: day battle, night rematch and restored Garage, full14 roster,
native M5 Max, 1280×720, high graphics, scale1/trim0 and unchanged AA.

| Action | Click to cover | Click to ready | Maximum callback-start gap |
| --- | ---: | ---: | ---: |
| Battle | 3.2 ms | 8969.4 ms | 234.8 ms |
| Rematch | 132.0 ms | 5673.5 ms | 228.5 ms |
| Garage return | 90.4 ms | 341.2 ms | 45.3 ms |

This is **functional acceptance, not smoothness acceptance**. Terrain readiness
completed with zero pending programs and three reflected retained wrappers per
entry; rematch additionally reused three witnesses. Terrain forward draw was
6/0 ms. The largest measured remaining work is now explicitly inside shadow
preparation: first caster batch233/213 ms, twelfth batch91/87 ms, geometry
upload106/15 ms. Final cascade draws themselves were at most4/3 ms.
Battle's234 ms LongTask overlaps the first shadow batch; rematch's212 ms task
occurs in its228.5 ms callback interval. The batch owner is identified, but
the responsible native draw/compile/upload operation still needs finer
attribution. These measurements do not retroactively identify the historical
untraced214–319 ms stalls or prove that the upstream canopy change caused this
run's shadow cost. Quality and acceptance budgets remain unchanged.
