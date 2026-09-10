# Garage return environment work — 2026-09-10

## Published baseline and reproduced limit

Loading release `2e2fa5999db7617e407162aa557eb0e42c55a803` landed non-force
on main. Vercel deployment `dpl_HCrFura25r2D12FhY9GgsT5nJcyD` became READY;
the production root displayed `v1.0.0+g2e2fa5999` before and after verification.
No unrelated vehicle files or shared dirty checkout were changed.

The unprofiled production acquisition
`/private/tmp/cot-interactive-baseline.gsRCvU/loading-final-production-r1/report.json`
passes actual Battle, day/night rematch and Return-to-Garage controls, shared
audio ownership, warm/source readiness, and owned cleanup. Application and
cleanup errors are empty. All three native screenshots were inspected, with
complete day/night terrain, tanks and Garage presentation. This proves those
flows, not smoothness.

| Action | Cover | Ready | Worst callback gap |
| --- | ---: | ---: | ---: |
| Battle | 3.2 ms | 11,345.6 ms | 160.0 ms |
| Battle Again | 202.5 ms | 9,025.4 ms | 217.1 ms |
| Return to Garage | 155.3 ms | 522.7 ms | 129.2 ms |

Production report SHA-256:
`7f7caaf698e5a5c30d22bd7ca0f518c4eb85d8bdcbac42effc84ce94cc154d24`.
Served HTML (unchanged across the run):
`4c15536b96e6a7abe62da652faadac175ab8a49ee643b606b34f31ff3d447d73`.
Acquisition:
`0c1ae77bb2d11603fc11e0416a4628ab9979229d32e7be6f9d7ee9396679052c`.

The 217.1 ms rematch gap includes a 195.9 ms scheduler continuation. The
`worldServices` stage records 196 ms. Garage return similarly records 93 ms
world services and a 93.2 ms continuation within its 129.2 ms gap. These match
the bounded stage that activates the selected Garage environment. They do not
identify every leaf inside the continuation or explain the old 214–319 ms
gameplay observations.

The cold Battle gap instead overlaps construction of the `merkava1b` actor:
its construction record begins at 9,673 ms and reports 221 ms non-await elapsed
work across checkpoints; the overlapping scheduler continuation is 158.3 ms.
That is a separate vehicle-construction cost, not evidence for the Garage fix.

## Source-confirmed repeated operation

`garageReturnRuntime` awaits `world.ensureGaragePlacement`, which calls
`garageEnvironmentPresentation.activate`. Its sky adapter first resets the
battle-atmosphere owner. Reset reapplies the saved authored battlefield preset
through `sky.applyPreset`, including a complete PMREM environment bake. Only
afterward does the adapter apply the selected Garage's presentation-only sky.
The existing bake destroys the previous target on every call, even when an
identical day environment was prepared before the night match. The later
Garage-light reset is idempotent; it is not another such bake.

A separate same-release CPU-profile acquisition, `loading-production-profile-r1`,
passes functional/readiness checks and retains all three original profiles.
In its Garage-return profile, the activation stack has 30.0 ms inclusive sample
weight and `applyPreset → bakeEnvironment` accounts for 28.7 ms. Profiled
world-services stages are 34/30 ms on rematch/return, not the unprofiled
196/93 ms. Profiling and machine state differ: these values are attribution
evidence, never a controlled speedup comparison or proof that all of the
unprofiled pause belongs to PMREM.

## Implemented boundary

The follow-up retains at most two validated procedural environment render
targets per Sky owner. An exact repeated sky/sun/renderer/color key reuses its
target; a third key evicts the least recently used target. Uncacheable inputs,
XR presentation and the dormant HDRI experiment use an uncached active target
without accumulating two cached targets beside it. Environment strength is
installed on each use rather than hidden inside the baked-key identity.

Every installation still runs the existing mobile validity check with the
current authored radiance. Invalid textures retain the compensated-ambient
rescue and are evicted, not saved as reusable results. Context loss, a changed
context or `renderer.info` identity, and external target/texture disposal
invalidate retained resources. The cold bake uses the unchanged Sky shader
configuration (frozen source hash in the test), scale and PMREM conversion.
There is no quality, resolution, shadow, simulation or vehicle-geometry change.

Failure recovery preserves a still-live previous environment, never restores a
known disposed texture, drains accessible owned resources, and restores the
renderer target/cube face/mip, XR enablement, tone mapping and auto-clear. One
pinned-Three limitation remains: `PMREMGenerator.fromScene()` can allocate its
private output and throw before returning it. Its public API does not expose
that output for disposal. Generator scratch and private Sky resources are
released; this change does not claim to repair that inaccessible allocation.

## Qualification

`sky-environment-cache-cpu-r1.log` passed four focused FIFO tests. A subsequent
integration run passed all 12 affected tests (including exact reuse, context,
external disposal, invalid-texture rescue, chained rollback, renderer-state
restoration, Garage/atmosphere ownership and registry discovery), typecheck with
core-unused checks, and the public/localized production build. The registry now
has 957 ordered checks. This is focused coverage over the earlier cumulative
956-check baseline, not a claim of an uninterrupted new full-suite run.

The first integration run stopped on one maintainability failure: cache
`install` cognitive complexity 29 exceeded the strict limit below 22. Its
recovery helper was selected for extraction; the failed log is retained at
`/private/tmp/cot-interactive-baseline.gsRCvU/sky-environment-integration-r1.log`.
The post-extraction integration (`sky-environment-integration-r2.log`) passes
all 12 affected tests and typecheck again. Both changed runtime files pass the
strict metrics gate: 61 functions, zero complexity violations, zero explicit
`any` or `unknown`. The initial changed-file Doctor scan passes 100/100 over
its two discovered tracked files; this is not a whole-repository score.

After adding the new files to Git, the complete four-code-file Doctor scan
reports 49/100 and exits 1 (`sky-environment-staged-doctor-r1.log`). Both
findings are in `skyEnvironmentCache.selftest.mjs`, not runtime code:
`find(...).getText(...)` asserts an expected source declaration structurally
and fails the test if missing; `new Function` executes source extracted from
the fixed local Sky module with a recording PMREM fixture, never user input.
They were manually reviewed as test-harness diagnostics, not a production
unsafe-evaluation path. No scanner rule/configuration was suppressed. The
initial 100/100 must not replace this more complete result.

### Frozen local native check

Commit `ee06607b07f539ed7e82d09d517bcee51b0edad5` was clean for its successful
public/localized rebuild and native actual-control acquisition. Chrome
151.0.7922.47 used Apple M5 Max/Metal, high quality, 1280×720, DPR 1, resolution
scale 1 and trim 0. `sky-environment-local-r1/report.json` passes Battle,
day/night Battle Again, Garage return, shared boot/audio-clock ownership and
warm/source readiness. Errors, failures and cleanup errors are empty. All
three native screenshots were inspected: complete terrain/tanks, distinct
day/night lighting and a lit Garage vehicle remain present.

| Action | Cover | Ready | Worst callback gap |
| --- | ---: | ---: | ---: |
| Battle | 3.4 ms | 7,509.1 ms | 113.3 ms |
| Battle Again | 151.9 ms | 5,792.2 ms | 111.0 ms |
| Return to Garage | 88.6 ms | 348.1 ms | 46.3 ms |

Rematch and Garage `worldServices` stages record 41 and 27 ms. These are
inclusive stages, not isolated GPU durations or native cache-hit counts. Bot
rosters and machine state are not matched to the production baseline, so the
numbers are one functional acquisition, not a controlled speedup claim.
The 111 ms rematch gap has no overlapping long task; missing attribution does
not prove it belongs to the OS or GPU. Cold loading and strict sustained-frame
acceptance therefore remain open.

Report SHA-256:
`a13f103f2e3b49713ebb17a327ac88fcf90fda9534cd45cf9fafd854b03b4a52`.
Served HTML:
`0c0580281aee7a9365cc2fc46a1c2353e1056f0c3e199581285894e2429e24c1`.
The acquisition hash remains
`0c1ae77bb2d11603fc11e0416a4628ab9979229d32e7be6f9d7ee9396679052c`.

The post-deploy production check uses the same maintained probe and four
readiness/audio flags, against `https://cot.kevinliu.studio/`, with its complete
report and screenshots retained separately under
`/private/tmp/cot-interactive-baseline.gsRCvU/sky-environment-production-r1`.
That live result must be read independently; this local pass does not certify
production smoothness or resolve the historical gameplay-stall attribution.

### Production result and the next bounded fix

The live acquisition navigated `d06a0ef5663a521f1e5d8811d89a824fd1cce384`
(READY deployment `dpl_2DypNX3iTwGvWm5rMijPWLHxxpQ6`) at
18:47:45–18:48:08 UTC. Its report SHA-256 is
`47fb5b583da02983c81624c2dc22c24cf6dffa944a65c29e745d9722cb6e0948`;
served HTML SHA-256 is
`293a50dd6e04e458e7c6bb0236d57d8492f48e26f7f846200938512029d5fa88`.
Functional, boot/audio ownership, warm/source readiness and cleanup pass;
all three native screenshots were inspected. The later alias check had
advanced to `8f879124415f2734e8020de07b69a03afac4d96c`, a Type 10-only
descendant retaining both exact Sky runtime files. The alias did not remain
unchanged for the entire verification interval.

| Action | Cover | Ready | Worst callback gap |
| --- | ---: | ---: | ---: |
| Battle | 3.4 ms | 9,686.3 ms | 355.1 ms |
| Battle Again | 140.3 ms | 6,215.9 ms | 422.3 ms |
| Return to Garage | 90.4 ms | 379.5 ms | 53.4 ms |

Rematch/return `worldServices` are 11/24 ms, but the cold rendering path is
not smooth. Local and production acquisitions match the ordered 14-member
rosters, acquisition hash, Chrome version, high quality, viewport, DPR,
resolution scale and trim. Production's 66-object terrain forward batches
take 335/408 ms; its 61-object vegetation batches take 352/345 ms. Terrain
program preparation exhausts 1,024 query/yield rounds in only 8/9 ms and
returns incomplete (`budget`), pending 3/6, with zero uniform preparations.
The local preparation completed. These receipts identify a cold first-use
handoff failure, not a particular driver instruction or GPU duration.

The source explains the premature exit: `prepareTerrainPrograms` used forced
opaque-loading yields, which are task-only until the 32 ms paint cadence is
due. Native program readiness can therefore consume all rounds before a
single rendering opportunity. The follow-up uses `nextPaintFrame` at this
specific generator checkpoint, preserving the existing five-second deadline
and 1,024-round safety bound per root, cancellation/root checks and honest incomplete
fallback. Visible vegetation receives the same strict source-target
preparation before its first forward submission; hidden roots, FX and inactive
worlds remain excluded. The separate forward-warm change bounds terrain and
vegetation cohorts and preserves nested renderable descendants through layer
masking with scoped LOD handling.

These covered-loading findings do not prove the cause of historical 214–319 ms
gameplay stalls. The production acquisition also has a 292.2 ms
Ready-to-uncovered interval with a 165 ms long task. No functional PASS here
is a strict sustained-frame or zero-latency certificate.

The follow-up's ten distinct focused integration tests pass across
`native-program-integration-r1.log` and `native-program-final-r1.log`, including
the native pending-frame regression, exact source target, hidden vegetation,
cancel/detach, nested renderables/lights, LOD selection, CSM restoration before
each yield, iterator close and renderer failure. Typecheck/core-unused pass.
The two runtime files pass strict metrics: 45 functions, zero complexity
violations and no explicit `any`/`unknown`. Independent source review found no
blocker. These tests prove scheduling/state contracts, not native completion.
The final changed-scope Doctor scan exits zero at 90/100 with five warnings:
three sequential awaits (the intentional scheduling/ordering contract and its
test), and two chained array assertions in the cohort test. The earlier
partial scan was 91/100 before that test file was added to the diff. These are
reviewed warnings, not a claim of a warning-free scan; no rule was suppressed.

### Frozen native-program local qualification

`6cd60f4f95c43e9fbe8b970ce5489c229cf86b52` passes a public/localized build
and the same actual-control probe at 19:04:01–19:04:23 UTC, retained in
`native-program-local-r1`. All functional/audio/warm/source checks pass with
empty failures, application errors and cleanup errors. The three inspected
screenshots preserve complete day/night battlefields and the lit Garage.
Both terrain and vegetation preparation report complete/pending zero in both
battles; terrain/vegetation batches contain at most four objects and the
largest takes 7 ms. Quality remains high, 1280×720, DPR 1, scale 1, trim 0,
SMAA-high+FSR1, on the same Chrome/M5 Max backend and acquisition fixture.

| Action | Cover | Ready | Worst callback gap |
| --- | ---: | ---: | ---: |
| Battle | 3.2 ms | 9,362.7 ms | 132.1 ms |
| Battle Again | 244.3 ms | 5,958.8 ms | 107.5 ms |
| Return to Garage | 115.0 ms | 428.3 ms | 58.3 ms |

Report SHA-256:
`511ef87b6ed8ba1ab92c5c8674495a786a1d032fd03523792da7e0ca6a2fb908`.
Served HTML SHA-256:
`68c27895e4342d4596b9fa26f24ae3b4fef180f278b03897605712694e0d6af6`.
The full-action gaps remain above a strict frame budget; successful bounded
warm work must not be presented as eliminating every pause in loading or play.

### Native-program production qualification

The source commit landed non-force on main. Production deployment
`dpl_BRh7RWPWCKhYDjgRKADNEjyRKRzG` became READY and the live root displayed
`v1.0.0+g6cd60f4f9`. The first production run at 19:07:45–19:08:10 UTC
(`native-program-production-r1`) passes all four requested functional/audio/
readiness gates and cleanup, with no application errors. Day/night and Garage
screenshots were inspected. Both world program receipts are complete/pending
zero; the largest four-object terrain/vegetation batch is 8 ms. The previous
335–408 ms terrain and 345–352 ms vegetation submissions do not recur here.
This is one matched-fixture acquisition, not a controlled driver-cache study.

| Action | Cover | Ready | Worst callback gap |
| --- | ---: | ---: | ---: |
| Battle | 5.4 ms | 11,491.2 ms | 179.5 ms |
| Battle Again | 133.1 ms | 6,100.8 ms | 105.8 ms |
| Return to Garage | 116.5 ms | 391.7 ms | 59.1 ms |

Report SHA-256:
`b77262ccb84adf5efef24c06c23c6dfe0d2a564d9099e2d3a2b6677fbe76821a`.
Served HTML SHA-256, also verified after this run:
`1441efaae795d2cf03bed6c7808c1df675d5bac74568c6ead9bec59c4c9222c5`.
These remaining full-action gaps are not hidden by the successful world-warm
fix. In the local run the 132.1 ms Battle gap includes a 65.9 ms terrain
`Worker.onmessage` script; it precedes roster construction. The rest includes
other scheduler continuations. Rematch's 107.5 ms local gap ends at first
opaque cover and has no overlapping long task; attributing that one to a
specific leaf would be speculation. Broader smoothness and historical
gameplay-stall attribution remain open.

The independent repeat (`native-program-production-r2`, 19:08:49–19:09:13
UTC) retains the exact served HTML and acquisition hashes and passes the same
gates with empty failures/errors/cleanup errors. Both roots again complete
with pending zero; the largest terrain/vegetation batch is 9 ms. All three
screenshots were inspected. Full-action gaps remain variable:

| Action | Cover | Ready | Worst callback gap |
| --- | ---: | ---: | ---: |
| Battle | 4.3 ms | 9,588.2 ms | 190.7 ms |
| Battle Again | 165.8 ms | 6,006.5 ms | 118.9 ms |
| Return to Garage | 145.7 ms | 454.1 ms | 58.4 ms |

Repeat report SHA-256:
`e48126c7d105dff2d3698c99ff3e588b13fa86e2baeb2efd93c94e58cb619144`.
The repeat confirms the targeted warm boundary, not zero loading pauses or
stable 60 fps in sustained gameplay. Native probe browsers and the owned
local preview server were closed; unrelated browser/vehicle work was untouched.
