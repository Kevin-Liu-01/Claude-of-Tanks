# Staged effects preparation — native comparison

This is a qualified, narrow loading improvement, **not completion of the
zero-lag objective**. It prepares the actual staged effects' private-target
programs before isolated first draws. No geometry, texture resolution, effects,
shadow quality, countdown, or readiness budget was reduced.

Implementation and cancellation/fallback proof:
[candidate design and focused validation](deployment-fx-reflection-candidate-20260910.md).
Source base is `d66f7b03d8e5636d34842f256494d73f728c5bdf`; its changes since
runtime baseline `3e6ff4978` are documentation and tests only. Publication and
production verification must be recorded separately from these local results.

## Acquisition and controls

Six ordinary native runs used the existing real-control
`tools/garage-battle-actions-probe.mjs`, with audio-clock, boot-audio,
warm-readiness and source-readiness gates, under the shared capture queue.
Order: A1, B1, A2, B2, A3, B3. A separate diagnostic baseline trace occurred
between A1 and B1 and is excluded from the performance comparison. Each
ordinary run created a fresh browser/profile, used actual Battle / Battle
Again / Garage controls and closed its owned browser.

- Native ANGLE Metal, Apple M5 Max; 1280×720, DPR 1, High, scale 1, trim 0.
- Urban day battle, then night rematch, same deterministic 14-vehicle rosters
  and M1A1 player. Roster arrays match in all six raw reports.
- Acquisition SHA-256:
  `782d10ba63581e161cad61ed9c3930f7199cef71c356886cc2ed467a9af3d9f2`.
- Frozen A public index SHA-256:
  `78157ea5e00f10083a616b29e1098f16a0a282781a9ea86f50b2edf9d8124940`.
- Frozen B public index SHA-256:
  `8dcf412935ebcc9cb0c2b4026fcd531ba33e662c0fb729782a3f5469be48589a`.
- A1 retained 33 more pre-existing programs than the other runs. A2/A3 and
  B1/B2/B3 match day 127→190 and night 246→311 at scene submission. The new
  preparation adds **zero programs** in every B acquisition; it reflects 14
  selected cached programs for 20 staged objects.

All six functional/readiness/audio/source gates pass, with no page errors.
All 18 day/night/Garage stills were inspected: tank/world, night lighting,
effects and Garage presentation remain present. These are visual inspections,
not exact pixel equality or physical display-latency proof. The machine was
not certified globally quiet; no sustained-FPS certificate is claimed.

## Targeted work, including the newly added preparation

Milliseconds; baseline is existing successful draw-only receipt (rounded).
Candidate includes **preparation plus actual isolated draw steps**, with
unrounded synchronous timing. This intentionally prevents a lower later draw
time from hiding work merely moved earlier.

| Run | Day maximum / synchronous total | Night maximum / synchronous total |
| --- | ---: | ---: |
| A1 | 11 / 39 | 14 / 48 |
| B1 | 5.1 / 17.1 | 5.7 / 20.7 |
| A2 | 7 / 23 | 89 / 127 |
| B2 | 5.3 / 17.3 | 9.4 / 36.6 |
| A3 | 8 / 25 | 65 / 92 |
| B3 | 5.2 / 17.3 | 8.9 / 34.9 |

All B preparations returned complete/pending 0, then all 20 actual draw
cohorts completed and cleanup succeeded. Candidate preparation's maximum step
was 0.8–0.9 ms day and 4.4–5.6 ms night. Preparation plus drawing elapsed
18.6–18.9 ms day and 23.3–41.6 ms night, including scheduling waits. No failed
native warm was converted into a success receipt.

The repeated baseline night first-bind stall is reduced in these local
acquisitions, including the added preparation work. This is the basis for
shipping this narrow change. It does not establish that a native driver call
cannot block on another machine, context, shader cache or scene.

## Whole-action results — remaining failures are retained

Each cell is total action time / largest frame gap, in milliseconds. Loading
includes the intended countdown and deferred readiness, not only computation.

| Run | Battle | Night rematch | Garage return |
| --- | ---: | ---: | ---: |
| A1 | 8174.7 / 186.4 | 5783.0 / 160.1 | 386.3 / 60.8 |
| B1 | 6549.2 / 118.8 | 5524.0 / 67.2 | 325.7 / 41.5 |
| A2 | 6833.1 / 98.0 | 5780.2 / 110.0 | 319.0 / 42.3 |
| B2 | 6498.6 / 112.9 | 6917.8 / 94.5 | 459.7 / 72.5 |
| A3 | 6578.2 / 111.6 | 5548.8 / 80.1 | 318.4 / 42.1 |
| B3 | 6530.1 / 113.7 | 5547.0 / 55.7 | 324.7 / 46.6 |

B2's slower overall night/return result is not discarded. Its deferred enemy
visual stage is 1404 ms versus A2's 503 ms; its largest night gap precedes this
FX interval at “Loading battlefield.” That locates other variable work but
does not prove an external-contention cause. Day B2's 113.1 ms callback gap
occurs at “Surveying terrain.” Faster FX alone does not fix those costs.
Cover response remains below the existing 500 ms functional limit, which is
not equivalent to an instantaneous interaction target.

## Attribution, not a historical-cause claim

The separate production CPU profile previously showed substantial active-
uniform reflection beneath `createIsolatedForwardWarmBatches`, with smaller
texture-upload work. Sample weights and alignment uncertainty are documented
in [the production checkpoint](loading-production-checkpoint-20260910.md).

A separate local baseline timeline reproduced a 77 ms FX step inside a
105.2 ms rematch callback gap. The step window (13587.8–13664.8 ms page time)
overlaps 77 ms of page-main microtask time and 76.565 ms of GPU-process task
time. Those are inclusive wall intervals, **not hardware GPU execution time**
or proof of a specific native API duration. No GC row was observed inside this
window, but the capture's completeness flag is false because an unrelated
thread task was still open at capture end; absence must not be certified from
that trace. No events were dropped. The separate Garage trace is complete.

The exact cause of the historical 214–319 ms gameplay stalls remains unproven.
Current evidence supports this effects first-use hypothesis only.

## Reproducible local evidence

The separate fixed-roster phase-resource probe used its unchanged acquisition
`bd40b57d430b7134f6ee0a3ba58e57c451f762b93585515a2bcbed7e31e52edb`,
1280×577 High, 16-second Garage settling and 8-second samples. Candidate and
baseline have identical resource counts in all three phases. In battle:
1356 objects, 741 renderer geometries, 767 scene geometries, 258 materials,
132 scene textures / 28,914,944 pixels, 209 programs and 304 renderer textures.
The **same eight existing resource gates fail**, unchanged—not a green resource
release. Garage triangles remain 309,447 / 313,093 against 240,000. Battle mean
main-thread cost is 6.545 ms/render versus baseline 5.880, both below the
11.5 ms gate; these means do not certify worst-frame smoothness. Page/console
errors are empty. Raw candidate receipt: `fx-reflection-candidate-resources.json`;
baseline: `post-frame-resources.json`. No resource threshold was relaxed.

Raw reports, screenshots and diagnostic traces are retained outside commits
under the owner's `.local-evidence/` in
`/Users/kevinliu/.codex/worktrees/cot-battle-era-audit-20260910`:
`fx-reflection-baseline-a1`, `fx-reflection-baseline-a2`,
`fx-reflection-baseline-a3`, `fx-reflection-candidate-b1`,
`fx-reflection-candidate-b2`, `fx-reflection-candidate-b3`, and
`fx-reflection-baseline-trace`. Each ordinary directory has `report.json`
and all three stills. No failed acquisition or earlier observation was erased.

Remaining acceptance work includes terrain/loading pauses, actual-control
sustained battle smoothness and the existing resource ceilings. The broader
investigation stays open.

## Published production checkpoint

The qualified change was pushed without force as
`465a68f7c43cd9ed1cc23ce62853ab9d1c6e0b43` and deployed by
[production workflow 34549215758](https://github.com/Kevin-Liu-01/Claude-of-Tanks/actions/runs/34549215758).
The completed workflow is successful; the public page reports
`v1.0.0+g465a68f7c`. A fresh actual-control production acquisition passes the
functional, warm-readiness, source-readiness, boot-audio and audio-clock gates.
Page errors, cleanup errors and failures are empty. All three day/night/Garage
stills were inspected; the authored presentation and night lighting remain.

| Production action | Cover response | Total action | Largest frame gap |
| --- | ---: | ---: | ---: |
| Day battle | 3.6 ms | 10248.2 ms | 85.0 ms |
| Night rematch | 116.7 ms | 6079.7 ms | 74.6 ms |
| Garage return | 87.2 ms | 346.8 ms | 55.5 ms |

Preparation plus first-draw work reaches **6.2 ms day / 9.8 ms night** maximum
synchronous steps, with 21.7 / 28.6 ms total synchronous work and 24.0 / 32.2 ms
elapsed. Both preparations complete with pending 0, 20 objects, 14 cached
programs, zero newly added programs, and all 20 isolated draws completed.
Preparation alone reaches 0.9 / 1.0 ms maximum steps. The returned Garage
retains the previous night receipt; it did not perform a new effects warm.

This production smoke confirms the narrow fix is live, **not** a zero-lag
certificate: the larger frame gaps above remain failures of the objective.
Cold action time includes transfer, readiness and the intended countdown.
Production's retained night program count differs from the local matched
comparison, so this is not a production A/B causal measurement. The historical
214–319 ms gameplay stalls remain unattributed.

Raw evidence: `.local-evidence/production-fx-preparation/report.json` and its
three PNGs in the owner worktree. Acquisition SHA-256 remains
`782d10ba63581e161cad61ed9c3930f7199cef71c356886cc2ed467a9af3d9f2`;
public index SHA-256 is
`b8663b7428602835421171b128730187d50fdc5bb6447b12d73b99708d37f2a4`.
The ten-minute post-deploy Vercel error-log query returned no entries; it is
not an all-time production-error audit.
