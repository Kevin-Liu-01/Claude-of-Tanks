# Loading release and production evidence — 2026-09-10

## Published scope

Runtime commit `3e6ff4978e4a96abde8aecd99c07c2ee9feb3371` includes the
[effects retry correction](deployment-fx-readiness-20260910.md) and
[completed-frame accounting](post-frame-accounting-20260910.md), on top of the
earlier covered watchdog/reveal fixes. Both patches rebased unchanged onto
`ebbf9c400`; thirteen focused loading/accounting checks, full typecheck,
unused-owner check, localization, public build and whitespace checks passed on
the rebased tree. Registry discovery found 975 ordered checks; this batch did
not execute all 975. An independent source review found no release blocker.

The non-force main push was verified by the remote ref. Production workflow
[34546219790](https://github.com/Kevin-Liu-01/Claude-of-Tanks/actions/runs/34546219790)
completed successfully for this exact revision. The public site reported
`v1.0.0+g3e6ff4978`. A subsequent ten-minute Vercel error-log query returned no
error entries; that is not a substitute for the browser checks below.

## Ordinary production interaction check

The committed `garage-battle-actions-probe.mjs` exercised the real splash-entry,
Bots, Battle, Battle Again and Garage-return controls against
`https://cot.kevinliu.studio`, with the audio-clock, boot-audio, warm-readiness
and source-readiness gates. It used a fresh Chromium profile, desktop high,
1280×720 at DPR 1, native Apple M5 Max ANGLE/Metal, internal scale 1, trim 0,
and the normal day/night Urban sequence with M1A1. Simulation was not fast-
forwarded for entry; the existing diagnostic elimination ends each fixture
battle after the real entry succeeds. This is not a sustained-combat test.

All functional/readiness gates passed. Both warm owners completed without
errors before rollout. No browser errors, context loss, graphics rescue or
cleanup errors were reported. All three saved screenshots were inspected:
day and night scenes, player tank, UI and returned Garage rendered; the HUD
now labels complete-frame totals instead of the final fullscreen triangle.
The stills are not motion/shadow-stability certification.

| Actual control | Click → opaque cover | Click → ready | Maximum sampled frame gap |
| --- | ---: | ---: | ---: |
| Battle | 2.5 ms | 9,186.4 ms | 99.0 ms |
| Night rematch | 123.7 ms | 5,557.0 ms | 104.7 ms |
| Return to Garage | 89.9 ms | 323.8 ms | 40.8 ms |

The callback-start diagnostic separately records 99.2 / 105.1 / 41.1 ms;
these are a different interval definition, not rounded replacements for the
table's sampled frame gaps. The first two overlap 71 / 81 ms long tasks.
They fail the desired no-long-task responsiveness objective despite functional
success. Covering a pause is not eliminating it.

The covered watchdogs submitted their probe renders in approximately 1.6 ms
each, with asynchronous waits of 84.9 / 41.2 ms. These are wall-clock waiting
intervals, not synchronous CPU blocks or GPU-duration measurements. No rescue
was needed. Effects preparation completed all twenty cohorts in both entries;
its maximum cohort was 14 ms on day entry and 82 ms on night rematch.

Local immutable acquisition: `.local-evidence/production-covered-fx/`.
Build-index SHA-256:
`d324f74bb18d8f604931c88c91c9d365d7e1b11c258d781436cd260fd069b117`.
Probe acquisition SHA-256:
`782d10ba63581e161cad61ed9c3930f7199cef71c356886cc2ed467a9af3d9f2`.
The tool acquired and released the shared capture lease; its browser closed.
The owned local preview server was also stopped. Unrelated processes were not
terminated, so this is not a quiet-machine sustained-timing certificate.

## Separate profiling acquisition

`.local-evidence/production-first-player-profile/` uses the same build/probe
hashes and scenario with `--profile-actions`. It also passed the functional
and readiness gates with no browser/cleanup errors. Its three CPU profiles are
attribution-only and are not substituted for the ordinary timing table.
Profiler start precedes the trusted click, so analysis must clip to the actual
click-to-completion interval; pre-click warming is not entry cost.

The earlier 224–251 ms first-player draw stalls did not recur in either new
acquisition: all nineteen first-entry player cohorts were 0 ms at the ordinary
receipt's rounded resolution and 0–1 ms under profiling. An isolated candidate
to pre-prepare those programs is therefore not justified for release by these
runs. No shader-cache deletion, artificial quality reduction or altered gate
was used to manufacture a performance improvement.

Within the profiled rematch's 66.6 ms callback gap, the aligned CPU samples
contain 49.625–51.984 ms estimated weight at
`getProgramParameter(ACTIVE_UNIFORMS)` and 9.140–12.236 ms at
`texSubImage2D`, beneath `createIsolatedForwardWarmBatches`. The bounds include
20.533 ms of profile/page-clock alignment uncertainty. They are statistical
sample weights, not the measured duration of one native call; no Long Task was
recorded for that profiled gap. The corresponding native query enumerates the
linked program's uniforms during Three's first-use initialization. The exact
served bundles matched the local artifact by hash:

- `deploymentWarm-CVgk_BvL.js:1:1854`: isolated FX cohort generator, not
  `warmPlayerRoot`.
- `three.module-fm2vrK64.js:4002:8812`: `ACTIVE_UNIFORMS` query;
  `4046:292` first-use initialization and `4053:280` uniform access.

This identifies an effects-preparation experiment worth measuring, not a
proven fix. Strict preparation may move the same indivisible query earlier,
prepare retained historical material variants, or lengthen total loading.
Acceptance must include preparation-step stalls, later draw stalls, total
loading time and program residency—not merely a cheaper final draw.

The profiled first Battle's 88.5 ms gap remains partly unattributed. Its 56 ms
Long Task includes 31.511–56 ms estimated `(program)` weight; it must not be
assigned to graphics, audio or uploads without further evidence. The original
negative sample delta is preserved in the raw profile.

## Remaining acceptance

The separate local public-build phase-resource probe passed all three new
fresh-completed-frame checks, with no page/console/HTTP errors. Its ordinary
unchanged budgets still failed eight checks: Garage triangles before/after
battle (309,447 / 313,093 versus 240,000), battle objects (1,356 versus 1,150),
renderer geometries (741 versus 680), visible geometries (767 versus 680),
visible materials (258 versus 220), visible textures (132 versus 124), and
visible texture pixels (28,914,944 versus 27,000,000). The thresholds were not
relaxed. Average battle main-thread cost was 5.88 ms per rendered frame and
passed its 11.5 ms ceiling; that average cannot rule out individual stalls.
The idle and returned Garage each painted twice in the eight-second sample,
with no animation ticks or shadow submissions, and kept bounded phase caches.

This resource run uses the fixed mixed 14-vehicle Verdant scenario, not the
production Urban interaction roster. Its local public index hash is
`78157ea5e00f10083a616b29e1098f16a0a282781a9ea86f50b2edf9d8124940`, acquisition
hash `bd40b57d430b7134f6ee0a3ba58e57c451f762b93585515a2bcbed7e31e52edb`;
raw result `.local-evidence/post-frame-resources.json`. It is not relabeled
as a production-site run or a passing resource certificate.

Current long tasks, sustained camera/combat budgets and broad phase-resource
limits remain open. The precise cause of the historical 214–319 ms gameplay
stalls is still unproven. This is a verified deployed recovery/diagnostics
checkpoint, not a claim that all lag has been eliminated.

Inventory caveat: the resource report's “visible” counters enumerate attached
scene resources (some include hidden descendants); mesh breakdowns are not
native per-frame frustum/submission witnesses. Excess inventory alone does not
prove duplicate GPU allocations or avoidable draws. The Garage optimizer's
whole-root material merges can coarsen cross-bay culling, but this receipt does
not quantify an avoidable portion. No naive bay split was shipped: it could
trade the triangle failure for a geometry-residency failure.
