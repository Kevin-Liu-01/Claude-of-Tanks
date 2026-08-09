# QA, performance, and visual-evidence archive

This is the durable index for the optimization and QA campaign through
2026-08-09 (source audit at `596a685`). It separates evidence that is committed to Git from evidence that
only exists in a Codex task, browser session, terminal buffer, or local
scratch directory.

The short answer to “is everything logged?” is: **the decisions and numbered
rounds are logged; every raw artifact was not automatically archived**. The
retention contract below closes that ambiguity for future work.

## Canonical records

| Record | What it contains | Durability |
|---|---|---|
| [MOBILE-QA.md](MOBILE-QA.md) | Round protocol, budgets, Rig A/Rig B distinction, attribution, rejected experiments, before/after measurements, and rounds 0–31 | Committed and pushed |
| [DEV-PERF-TRACE.md](DEV-PERF-TRACE.md) | Complete DEV event/frame/anomaly recorder schema and normal/constrained/software probe procedure | Committed and pushed |
| [THREE-PERF-OPTIONS.md](THREE-PERF-OPTIONS.md) | Official Three.js and library research, measured fit, rejected substitutions, and next benchmarks | Committed and pushed |
| `docs/perf-*.json` and `docs/perf-trend.jsonl` | Historical performance scorecards | Committed and pushed |
| Git history | Each landed/reverted round, implementation, tests, and commit identity | Committed and pushed |
| Codex task | Conversation, commentary, tool outputs, and images rendered in the task | Retained in the app, but not a repository or CI artifact |
| `window.__DEV_TRACE` | Up to about 20 minutes of frames plus 20,000 event rows | Memory-only until `download()` or a probe export |
| Browser/terminal logs | Console output and interactive diagnostics | Session-only unless exported |
| `.qa-bots`, `.qa-loading`, `.qa-smoke`, and ordinary `shots/` output | Raw scorecards, probes, and screenshots | Local workspace only unless explicitly archived |

At this audit, the five local artifact roots contain **99 files**. The bot,
loading, and smoke roots alone occupy about **132 MB**; `.qa-dev` adds one
normal-profile export. Fourteen Challenger 3 critic
screenshots under `shots/` were deliberately force-added in an earlier visual
review; the remaining generated shot output is ignored by the repository.
The complete filename, byte-size, SHA-256, media type, and tracked/untracked
state are recorded in [qa-evidence-manifest.json](qa-evidence-manifest.json).
A hash manifest proves identity but does not replace backing up the bytes.

## Campaign timeline

The detailed per-round evidence is in the Mobile QA ledger. This table is the
high-level navigation layer.

| phase | rounds / commits | durable outcome |
|---|---|---|
| Baseline and shader-leak hunt | rounds 0–6 | Deterministic Lap; shadow-depth warm; garage-dressing battle gate; decal, hidden-LOD, and thrown-track program attribution |
| Loading and garage switching | rounds 7–11 | Cold-load attribution; rejected harmful compile experiment; GLB compile slice floor; sliced combat warm and FX volley |
| Feel budgets | round 12, `2b5fba5` | `gapP95 <= 20 ms` became a gameplay gate; F8 perf HUD; FOV-only CSM update; smaller GLB compile slices |
| Battle-open cleanup | rounds 13–14 | Post-target shader warm and correct repaint/re-bolt ordering; first switch task reduced from 162 ms to 87 ms |
| Contaminated-host discipline | rounds 15–17, 23–24 | Invalid controls quarantined; no product changes made from saturated-host data |
| Full DEV observability and lower-end runs | rounds 18–22 | Bounded lossless flight recorder; 0.2/0.5 ms CPU profiles; 2× CPU, 4-core/4-GB, and SwiftShader stress lanes; synthetic freeze falsification |
| Garage warm campaign | rounds 25–30 | Incremental hero/program initialization and per-root real warm frames; garage passed at 95.9/95.3% clean frames with 91/92 ms worst tasks |
| Loading campaign | round 31, `7d202e0` | Click-to-control 13.822 s → 7.904/7.803 s; loading veil 8.686 s → 5.329/5.255 s; initial boot held at 1.205 s |
| Shared bot combat | `2b0d8d4` | Both teams use one combat brain; predictive friendly-fire corridors, coordinated target scoring, and role-aware survival; local evidence in `.qa-bots/` |
| Smoke depth and reconstruction | `b8012a4` | Transparent combat FX composite after opaque depth with depth copy/soft intersection; FSR1 EASU+RCAS reconstruction; local before/after views in `.qa-smoke/` |
| First-battle quarter frame | `596a685` | Quarter-size shader warm moved from the visible framebuffer to a private HDR render target; 2048×1024 countdown and rollout verified; regression self-test added |

The “roughly 120 FPS” observation has repository evidence rather than only a
HUD anecdote: `docs/perf-r2.json` records 116.3/112.4 median FPS across its two
device-scale runs, `docs/perf-community.json` records 129.9, and
`docs/perf-deep-hunt.json` records 149.3. These runs are not interchangeable
hardware certifications; the release contract remains the station budgets,
double-Lap confirmation, and frame-gap tail—not a single peak counter.

## Owner-reported source screenshots

These two reports are preserved in the Codex task and on the owner's Desktop,
but are not currently Git-backed image objects:

| report | dimensions | bytes | SHA-256 | resolution |
|---|---:|---:|---|---|
| `Screenshot 2026-08-08 at 9.29.34 PM.png` | 1620×891 | 2,418,002 | `fc00687228f2b0294950d0257b28bb177fbb14dd09d5f906420b48f6ccb89052` | Smoke behind terrain + soft/occluded rendering; fixed by `b8012a4` |
| `Screenshot 2026-08-09 at 11.56.17 AM.png` | 3448×1748 | 1,934,357 | `530c42cc1e716f3115b6810e1764dea93d2367a8f85b2b31a72fe208ce63bdc3` | One-off first-battle black/quarter frame; fixed by `596a685` |

The post-fix 2048×1024 countdown frames were visually inspected in the Codex
browser run but were emitted only into the task. They are therefore classified
as thread evidence, not repository evidence.

## Preserved console findings

The final desktop visual run exposed one unrelated open error that must not be
lost with the browser buffer: `scheduleWhizz` called
`AudioParam.setValueAtTime` with negative times (`-0.083027` and
`-0.0829786`) at `src/audio/audio.js:1085`, reached from `onShellFired`. This
remains a follow-up defect; it was not mixed into the framebuffer fix.

Repeated `THREE.BufferGeometry.toNonIndexed(): BufferGeometry is already
non-indexed` warnings were also present. They were already noted in the round
18 desktop smoke record and remain non-fatal, but should be removed rather
than normalized as expected noise.

## Existing local screenshot sets

| path | files | purpose | repository status |
|---|---:|---|---|
| `.qa-dev/` | 1 | Normal DEV flight-recorder/profile export | Untracked local evidence |
| `.qa-bots/` | 8 | Shared-bot scorecards, normal/constrained traces, and views | Untracked local evidence |
| `.qa-smoke/` | 17 | Before, draft, late-depth, native/low-resolution, and final smoke views | Untracked local evidence |
| `.qa-loading/verify/shots-living/` | 19 | Complete living-view visual gate after the loading campaign | Untracked local evidence |
| `.qa-loading/verify/shots/` | 6 | Focused loading verification views | Untracked local evidence |
| `.qa-bots/views/` | 3 | Battlefield, player, and firing views for the shared bot campaign | Untracked local evidence |
| `shots/critic-challenger3-graduation/` | 14 | Challenger 3 graduation orbit/close views | Tracked |
| top-level `shots/` | 6 | Canonical gameplay/close-up output | Ignored generated output |

## Round procedure

1. Sync to current `origin/main`, read the previous ledger row, and record the
   commit under test.
2. Check host load and power state. Do not measure under known browser/GPU or
   foreign-process saturation.
3. Run two untouched Mobile Laps. A station is a product failure only when it
   fails both admissible controls.
4. Before editing code, attribute the worst confirmed failure with a station-
   sliced CPU profile, long-task/frame-gap data, program/texture deltas, and
   owner binding where shader births are involved. Write this evidence into
   the ledger before the fix.
5. Apply the smallest causal fix. Keep rejected experiments and their measured
   regression in the ledger; do not erase them from the history.
6. Run two verification Laps, `npm test`, the private production build, and
   every living screenshot view. Add contract-specific probes when touched
   code overlaps AFV, firing, revive, controls, bots, or loading behavior.
7. Run normal and constrained DEV traces for battle-open or freeze-sensitive
   work. Confirm zero dropped rows/errors and that the synthetic 320 ms block
   is detected.
8. Land and push the code, append the ledger row, restart the QA server, and
   perform Rig B visual/functional inspection when scheduled.
9. Archive every generated file according to the retention contract below.

Useful commands:

```sh
node tools/mobilelap.mjs --out .qa-round/before-a.json
node tools/mobilelap.mjs --out .qa-round/before-b.json
npm run perf:dev -- --profile=normal --out=.qa-round/dev-normal.json
npm run perf:dev -- --profile=constrained --out=.qa-round/dev-constrained.json
node tools/screenshot.mjs --out .qa-round/views
npm test
npm run build:private
node tools/qa-evidence-manifest.mjs --out docs/qa-evidence-manifest.json
```

## Retention contract

A round is not “fully archived” until all of these exist:

- a ledger row with commit, environment, controls, attribution, fix or
  falsification, verification, and landing status;
- raw before/after scorecards and profiles;
- the DEV trace export when event timing or freezing is relevant;
- every required living-view screenshot plus any owner-reported source image;
- browser console errors and terminal failures copied into the round notes;
- a SHA-256 manifest covering every artifact;
- a durable byte location: tracked Git object, Git LFS/object-storage URL, or
  attached release artifact. A Codex task or local `.qa-*` path alone does not
  satisfy this last requirement.

`window.__DEV_TRACE` is intentionally bounded and production-disabled. Call
`__DEV_TRACE.download()` during a manual reproduction, or use
`tools/dev-perf-probe.mjs`, before reloading/closing the page. Perf HUD values
are live instrumentation, not a log, unless a probe or screenshot records
them. Console mirroring stays opt-in because printing every event can create
the very stalls being measured.

## Open archival gaps from this campaign

- The 99-file local manifest is durable, but 85 of those files are still
  untracked bytes. They need an artifact store or an explicit Git/LFS decision.
- The two owner screenshots are hashed and task-retained but not copied into
  the repository.
- The three post-round campaigns (bots, smoke/reconstruction, and the first-
  battle framebuffer fix) have commits, tests, and local/thread evidence, but
  were not numbered Mobile QA rounds and should not be misrepresented as such.
- Historical browser and terminal buffers were not exhaustively exported.
  Their decisive measurements are captured in the ledger/commits, but the raw
  streams cannot be reconstructed after the sessions close.

These gaps are now explicit. Future summaries must say “ledgered,” “manifested
locally,” or “durably archived” rather than using “logged” for all three.
