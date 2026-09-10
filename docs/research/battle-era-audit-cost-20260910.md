# Battle construction: remove repeated authoring-only ERA fitting

The detailed `eraVisualBindingReceipt` is an anatomy-authoring report, not
live armor state. Its only non-test reader is `tools/gen-combat-anatomy.mjs`.
Both battle construction ports now explicitly omit it: `rosterState.ts`
(synchronous/cooperative solo roster construction) and `browserBattleBridge.ts`
(prepared network participants and snapshot-created entities). The ordinary
factory default remains enabled for Gallery, Studio, workshop and anatomy
verification. Existing cached/adopted visuals remain valid with either value.

This does **not** remove ERA, change detail, reuse another tank's geometry,
alter camouflage, or defer a required gameplay computation. Authored binding,
vertex-span registration, instanced ERA, cluster ownership and finish metadata
still execute. `stripEra` and `resetEra` use those retained live maps and saved
vertex spans. Armor/ballistics and the scoped overlay use checked spec anatomy.
Replay and pool reset call the same live APIs, not the discarded report.

The fitting helpers read geometry and construct private report arrays; their
temporary cache closes within the original construction transaction. Omitting
the report also omits its exact-face validation exceptions during battles.
Default anatomy/release audits intentionally retain those checks. Malformed
authoring input must still fail offline verification, not be normalized away.

## Evidence protocol

`node tools/battle-era-receipt-bench.mjs /absolute/new-report.json rendered`
compares the existing true/false option on six real authored fixtures. Four
same-process rounds alternate option order, retaining the cold first round.
Native Canvas2D supplies normal textured construction. Imports and disposal
are outside the measured intervals; core assembly excludes the later
decoration/static-batching finalizers. This is elapsed construction time, not
GPU time, browser frame time, or a promise of network/player throughput. The
low/batched options match desktop bot policy, not every participant policy.

The initial geometry-only probe lacked Canvas for cosmetic stowage and emitted
decoration warnings. Its core timing suggested the next experiment, but it
does not qualify full output, total build time, or production. The maintained
probe now supplies Canvas in both modes, preserves warnings in its report,
and fails if any construction warning occurs. Geometry-only mode additionally
skips rest-contact and UV/dirt work; it is not a rendered-material baseline.

The old `/private/tmp` worktree and raw native receipts disappeared between
continuations. The committed source survived and was recovered from verified
`origin/main` at `f32fbd387`. New measurements and logs are kept in the isolated
worktree's `.local-evidence/` directory, excluded from publication. Earlier
reported 38–61 ms T-64/T-80 assembly spans were a diagnostic lead, not a
replacement for this fresh comparison.

## Native textured construction comparison

The rendered run completed on source `f32fbd387` with this option-only candidate
on 2026-09-10, all 48 samples retained and no construction warnings. The table
uses the standard median of four samples (the mean of the two middle values),
including each cold first use; it is not the more favorable upper-middle value.

| Tank | Assembly, report on → off | Complete construction, on → off |
| --- | ---: | ---: |
| T-64BV | 34.06 → 6.05 ms | 109.46 → 81.11 ms |
| T-80U | 36.35 → 6.29 ms | 106.86 → 68.15 ms |
| T-80BV | 26.95 → 6.90 ms | 92.64 → 76.63 ms |
| T-90M | 68.88 → 7.28 ms | 159.89 → 106.05 ms |
| M1A1 HA source variant | 7.44 → 6.97 ms | 77.37 → 75.81 ms |
| Merkava Mk 1B | 9.81 → 9.81 ms | 115.11 → 122.52 ms |

The first four fixtures show a substantial avoided audit. The no-cluster Abrams
and small Merkava receipt do not demonstrate a material improvement. Merkava's
total time is worse in this acquisition; its authored construction varies and
the audit saving is negligible. No fleet-wide percentage or worst-frame claim
is inferred from this six-fixture, four-round comparison.

The run's `startedAt` and starting load were captured before the FIFO wait;
the roughly eleven-minute outer interval includes waiting and is not benchmark
execution time. Individual sample timers exclude waiting, imports and disposal.
The host was not otherwise pristine. This is a controlled option comparison
within one process, not clean-machine timing certification.

Raw evidence: `.local-evidence/era-cost-rendered.json` and its complete log in
the isolated `cot-battle-era-audit-20260910` worktree. The file is not published
with source; SHA-256
`85bc063b3e5ee39a0356dded95f46ff5d8dee1dd2e45439fce58ae7947a2a04a`.
The parity test separately covers real rendered bot and hero
graphs and every ERA removal/reset; staging and network port tests establish
that their existing construction options now explicitly omit this report.

## Verification and fresh live baseline

All 24 native rendered parity builds passed, including the shared-cache
contamination guard, exact texture pixels/material hooks, articulation/recoil,
every live ERA cluster, and vertex/cluster negative controls. The six further
focused suites passed: roster staging, browser battle bridge, visual streamer,
default ERA binding receipt, wreck receipt opt-out and factory staging (3,795
checks). Full typecheck and public build passed. Changed-file quality metrics
found zero complexity violations and no `any`/`unknown` in four scanned files.
The changed-scope Doctor scan reported no diagnostics in six files, but its
overall score was 49/100; this is not a claim of a perfect repository score.

The fresh production **baseline failed**, before publication of this candidate.
`native-before/report.json` retains the full run and all three inspected PNGs.
Battle, night Battle Again and returned Garage rendered correctly, with no
page/graphics/rescue/cleanup errors; audio, warm-readiness and source-readiness
gates passed. The unchanged 500 ms painted-cover gate failed for Battle Again
at 826.6 ms (Battle 4.3 ms, Garage 93.0 ms). Complete action times were
12,949.2 / 14,868.5 / 452.0 ms. Largest callback gaps were
982.1 / 2,308.3 / 79.5 ms. These are not a before/after speedup claim.

The two large covered gaps overlap 976 / 2,306 ms long tasks at the scene
watchdog timer entry in `main-CZR6qytf.js`, character 57,720. Inspecting the
served source maps that entry to `scheduleSceneWatchdog` calling its `run`
callback. This identifies a fresh diagnostic path to investigate; it does not
separate shader/render/readback costs or establish the cause of older gameplay
stalls. No failed cover or frame limit is waived, and the successful CPU parity
run does not overwrite this failed browser baseline.

## Remaining scope

Removing this audit does not solve the independent authored-geometry pauses
(including Abrams), all scene/transition frame budgets, or prove the exact
cause of the historical 214–319 ms stalls. Native real-control checks and
steady-state performance qualification remain distinct; a functional pass is
not a smoothness certificate. No resource or frame gate is weakened here.
