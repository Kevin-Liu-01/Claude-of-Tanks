# Scene watchdog and result-transition loading investigation

## Observed problem

The real Battle → Battle Again → Garage control probe exposed covered long
tasks inside `scheduleSceneWatchdog`'s timer callback on production. Source
`f32fbd387` produced 976 / 2,306 ms timer tasks; published `26d556281` produced
11,882 / 14,361 ms. These are preserved failures, not a claimed regression
caused by the independent ERA-report opt-out. The construction option cannot
identify the graphics leaf, and the host/roster acquisitions are not a clean
matched performance comparison.

The existing 1,800 ms timer is armed before solo roster construction. It can
interrupt incomplete deployment work, or run after the loading cover leaves.
The asynchronous readback does not make its initial scene render or readback
enqueue asynchronous. A 64×36 color target also does not bound shadow-map
rendering or first-use program/texture work.

## Bounded instrumentation

The existing optional measurement rows now identify async versus fresh sync
fallback measurements and retain errors. The delayed owner publishes at most
16 transactions, each with at most eight rows, phase/world entry identity,
absolute performance timestamps and scalar result. Render, enqueue, fence
wait, copy and program counts remain separate. Returned data is copied only
after owned cleanup; optional diagnostic errors cannot reject or hang the
non-rejecting scheduler completion. No scene objects, textures, GL handles or
pixels are retained in the history.

The committed real-control probe copies these bounded receipts without
changing rescue thresholds, shader settings, quality, input or rendering.
Rows can belong to earlier actions; attribution must use their absolute
timestamps, not sum the whole retained history.

## First instrumented native acquisition

The public local build based on `26d556281` plus instrumentation and the
opt-in result-cover hold passed functional, audio, countdown-readiness and
source-readiness gates. All
three rendered PNGs were inspected, with no page/graphics/rescue errors.
Raw receipt: `.local-evidence/native-watchdog-diag/report.json` in the isolated
`cot-battle-era-audit-20260910` tree. Build-index SHA-256:
`685d6b0d23fa774c1bd21f43774c9d4ea020a7828969ab66ff534bd7dc452aad`.
Runtime diff hash at acquisition:
`90939ab2d8fde2f800d1407a74e0546e36349a6381d5c8c64ac4f080bc33fc96`.

| Check | Synchronous render | Enqueue | Async wait | Programs before → after |
| --- | ---: | ---: | ---: | ---: |
| Garage | 224.0 ms | 0.4 ms | 108.3 ms | 63 → 63 |
| First battle | 2.3 ms | 0.1 ms | 325.8 ms | 222 → 222 |
| Night rematch | 6.7 ms | 0.1 ms | 3,734.1 ms | 367 → 367 |

No check used the compatibility fallback. This run did **not** reproduce the
earlier huge synchronous timer tasks. The rematch wait includes unrelated
work/task scheduling; it is neither a GPU-duration measurement nor proof that
the asynchronous wait blocked the main thread. Its 3,696 ms callback gap has
no corresponding multi-second LongTask attributed to the watchdog. The first
battle still had a separate 650 ms covered task during deployment warming.
Program count equality alone does not establish that retained programs or
other driver state were already warm.

Cover times were 6.0 / 126.5 / 86.1 ms. Complete action times were
11,024.1 / 7,171.6 / 478.4 ms. Those functional results do not certify a frame
budget or prove a speedup from either candidate change.

The rematch's **deferred** combat-warm trace also failed with `Visible paint
frame did not arrive within 1000 ms`, `doneBeforeRollout: false`. The existing
`--warm-readiness-gate` checks the separate covered countdown-warm owner, not
that deferred owner. Therefore its pass does not establish that all combat
warming completed. This separate failure must remain visible and be covered
by acceptance verification; it is not a successful readiness result.

## Result-cover boundary

Battle Again already waits for actual opacity and a subsequent paint
opportunity before teardown; no evidence established premature teardown in
the earlier 826.6 ms cover failure. However, ordinary old-result scene frames
were still permitted during fade-in. The new explicit opt-in lease retains
that already-rendered scene until the cover barrier is complete. Network
servicing and frame scheduling continue. The lease ends before covered work,
dwell and fade-out; cancellation or supersession cannot release another run's
lease. Other transitions retain their existing behavior.

## Readiness acceptance correction

The optional `--warm-readiness-gate` now requires both countdown and deferred
receipts for each Battle and Battle Again action: present, not cancelled,
without an error, finished, and finished before rollout. `done: true` is not
success when the deferred owner's catch also publishes that value. Default
functional acceptance, scheduling, paint deadlines and production work are
unchanged. The saved gate result names both required receipts explicitly.

Independent negative controls cover every readiness field on both owners and
both entries. Applying this stronger checker to the preserved instrumented
acquisition rejects its deferred rematch timeout and late readiness; it does
not rewrite that earlier report or reinterpret its narrower gate.

## Status

The independent ERA construction saving is published. This instrumentation
and result-cover change are not yet published. The real solo loading
transaction now owns and joins its graphics check after deployment preparation,
before reveal. Covered entry arms one generation/world-bound request, not the
old 1,800 ms timer. The no-cover legacy entry and explicit webdriver opt-out
retain their previous policy. Required health sits outside the optional-warm
compatibility catch: black, unrestorable, rejected or stale checks must reach
the existing covered entry recovery rather than a reveal fallback.

Eighteen focused selftests passed in the first combined batch. A read-only
complexity review identified two enlarged functions; after the first extraction,
the combined gate still rejected the deployment function. Small
ownership-preserving helpers restored the strict thresholds without changing
rescue settings or paint deadlines. Corrected focused checks, strict source
metrics (zero violations or explicit `any`/`unknown`), full typecheck and public
build now pass. The failed first gate remains
in `.local-evidence/covered-watchdog-checks-r1.log` and the corrected run in
`covered-watchdog-checks-r2.log`.

### Covered-owner native acceptance

The frozen public candidate passed the real Battle → night Battle Again →
Garage sequence, including both warm owners, audio and source readiness.
All three screenshots were inspected; page, graphics, rescue and cleanup
errors were absent. Native high/desktop quality remained 1280×720, DPR 1,
render scale 1, trim 0, Apple M5 Max ANGLE.

| Action | Cover | Complete action | Maximum callback gap |
| --- | ---: | ---: | ---: |
| Battle | 5.2 ms | 11,484.9 ms | 404.7 ms |
| Night rematch | 143.9 ms | 11,354.5 ms | 1,083.1 ms |
| Garage | 126.2 ms | 440.8 ms | 55.0 ms |

Both battle checks ran with delay **0**, inside the covered owner, before its
opening frame. Synchronous render was 2.2 / 3.1 ms; enqueue 0.1 / 0.1 ms;
asynchronous wait 546.3 / 1,382.4 ms; neither required rescue/fallback. Both
countdown and deferred traces completed without error before rollout. The
rematch's largest callback gap occurred earlier, while its battlefield loader
was visible, not in the later watchdog transaction. These are acceptance
results, **not** an overall smoothness pass or a causal performance comparison.

Receipt: `.local-evidence/native-covered-watchdog/report.json`.
Build-index SHA-256:
`fd41be96c3d13c0474054b282f2af3ce25cce170933336d4f7be8f244f549438`.
Acquisition hash:
`782d10ba63581e161cad61ed9c3930f7199cef71c356886cc2ed467a9af3d9f2`.
This acquisition predates the separate effects-program experiment.

The changed-scope Doctor scan covered 22 files and remained **49/100 Critical**
(exit 1), the same overall score as the preceding slice. All ten findings were
in three selftests, not runtime code: three `new Function` findings execute only
repository-owned adapter source under controlled fixtures, five sequential-await
findings intentionally exercise ordered/global test state, and two direct test
lookups fail the regression if their expected fixtures disappear. These were
reviewed, not suppressed or counted as a clean scan. No untrusted runtime
evaluation or newly reported render-loop issue was identified.

The exact historical 214–319 ms gameplay stalls and
sustained scene/frame/resource budgets remain open; no gate is weakened.
