# Multiplayer countdown clock and cooperative wreck loading

Follow-up to `multiplayer-loading-cpu-slices-2026-09.md`, based on
`96304baf18d733b80565769a2906d4df7c9aa66a`. Scope is multiplayer countdown
timing and world-loading scheduling/cleanup, not playable vehicle geometry,
map layouts, combat balance, transport deployment, or quality reduction.

## Proven countdown cause

The retained foreground baseline in
`/private/tmp/cot-roster-painter-baseline-native-20260908-r2/report.json`
took 10,346.4 ms on the host and 10,255.9 ms on the guest from the first
observed 5 to rollout. Both peers used day/clear conditions; background-host
ticks did not explain it. At approximately 75 ms per callback, the host's
bounded catch-up path advanced only two 60 Hz ticks. Countdown seconds were
decremented by those simulated ticks, so roughly 30 callbacks were needed
per displayed second. This establishes the cause of this countdown defect;
it does not establish the cause of every historical frame stall.

The fix carries host-owned monotonic elapsed time separately from bounded
gameplay time through the frame pump and private-match adapter. Authority
spends that budget only during countdown, once per advance. Time before the
all-peer READY barrier cannot shorten countdown. Sub-tick budgets are retained;
phase transitions publish snapshots immediately. Countdown-to-playing discards
pregame backlog, so a delayed callback cannot become a burst of movement or
shots. Direct simulation callers still default to fixed `dt`; combat remains
60 Hz. No client deadline, `Date.now()`, new timer, or hit authority was added.

`authoritativeCountdown.selftest.mjs` reproduces the measured slow cadence and
tests the public host/client interface, private adapter, all-peer barrier,
snapshot cadence residues, sub-tick budget, hidden/foreground handoff, invalid
input, and direct fixed-step behavior. The native entry gate now requires
4,500–6,500 ms as well as the complete 5,4,3,2,1 sequence; the former lower-bound
only gate incorrectly accepted the 10-second countdown.

## Exact-output loading changes

Fresh source-pinned CPU baseline:
`/private/tmp/cot-props-tail-baseline-96304-20260908-r1/report.json`.
The control produced 170 slices, 1,021.46 ms synchronous work and a 108.36 ms
largest slice. Instrumentation independently reproduced identical output.
The compound finishing slice was 53.52 ms: wreck merge, ground decals, map
extras, and the first material merge ran together. These are CPU-fixture
measurements, not browser frame times or native texture evidence.

World wreck construction now yields after the unchanged vehicle constructor,
then between collection/instance batches, normalization batches, vertex-paint
batches, and exact-index compaction batches. The synchronous API drains the
same generator. Traversal/RNG/triangle order, attribute bits, bounds, shadow
geometry, and first-party builder options are preserved. Separate completed
checkpoints split wreck finalization, street details, decals, and map extras.

Temporary visual and geometry ownership stays invocation-local. Cancellation
closes delegated iterators and drains partial clones, expanded geometry, cached
bakes, and unmerged placement geometry. Disposer errors cannot hide the original
loading error or prevent independent owners from draining. Internal batches
reach the existing pacing scheduler without artificially advancing progress.
Foreground and explicit room/Battle intent remain time-budgeted. Passive
Garage speculation intentionally forces a frame at each checkpoint, so its
wall time can increase; that is not an independently measured speedup.

Tests cover cancellation at every stage, throwing disposers, partial actual
instance/vertex/index work, atomic compaction installation, interleaved bakes,
and independent original-stream fingerprints. This is not a claim that every
other partially assembled world resource already has complete rollback.

## Validation and limits

Focused world validation passed: `wrecksSteps`, `exactWreckGeometry`, `wrecks`,
and `propsScheduling`, plus both loading/profiling tool selftests (including
19 native-acquisition policy cases). The six changed network/simulation/wreck
modules passed strict complexity/type-inventory gates: 365 functions, zero
threshold violations, zero explicit `any` and zero `unknown`.

Final TypeScript/core-unused checks and public production build passed (18
localized routes; translation validation was dry-run only). Focused countdown,
frame-pump, private-handoff/rematch, background-wake, and protocol suites passed.

The read-only changed-file scanner inspected 17 files and reports 49/100,
five errors and three warnings. Receipt:
`/var/folders/yl/sxf0v4tn14n2pkwqmf_21l540000gn/T/react-doctor-0fbca6a7-db78-41cf-b823-745fb050846a`.
All findings are test-only and were reviewed at their call sites. Four
`no-eval` findings execute fixed repository source or embedded legacy controls,
not user/network input. The instance-upload finding targets a CPU-only fixture
whose matrices are read directly and never submitted to WebGL. Those security/
upload implications are high-confidence false positives for these fixtures.
The serial await is deliberate cancellation testing, and repeated property
reads inspect changing authoritative state, not a production hot loop. No
rules were suppressed; the scanner still exits nonzero. Its denominator differs
from prior scans, so the score is not a comparative quality claim.

Additional shared-simulation validation passed: authoritative match, movement
(135 checks), combat (532 assertions), spotting (99 checks), snapshot delivery,
and browser input ownership.

The full `npm test` run was attempted on the pinned candidate and intentionally
stopped after approximately 25 minutes during `wheelQuality.selftest.mjs`,
before reaching the multiplayer portion of the ordered fleet-wide suite.
Its runner exited 143 from the requested termination, not a reported assertion
failure. This is an incomplete full-suite receipt, not a pass; the focused
checks above ran separately to completion. No unrelated vehicle golden or
profile was changed to qualify this multiplayer publication.

### Native public-build pair

Both fresh two-client local-signaling runs used the exact same acquisition
closure `e86b225ce456e32a33aab7e6e3c363e4319bfca56c0dc084e557210a7549bfdf`.
Both naturally selected day/clear, high preset, render scale 1, and reported
Apple M5 Max through ANGLE. No condition override or favorable-sample retry
was used. Each passed entry, full countdown, advancing battle, Garage return,
nonblack/reveal checks without rescue, zero dropped observer records, room
cleanup, and browser/preview/signaling/FIFO release.

| Measurement (host / guest) | Preserved `96304` | Candidate |
| --- | --- | --- |
| Countdown 5 to rollout, ms | 4938.3 / 4863.2 | 5019.5 / 4952.7 |
| Entry total, ms | 3732 / 3989 | 4152 / 4355 |
| Largest observed RAF gap, ms | 173.4 / 235.4 | 206.8 / 206.4 |
| Props synchronous work, ms | 786.4 / 835.5 | 1045.9 / 1026.6 |
| Largest props slice, ms | 71.9 / 65.3 | 64.0 / 55.4 |
| Props slice count | 170 / 170 | 1759 / 1759 |

The candidate passed the five-second countdown gate and exposes smaller
construction boundaries, but this single pair was slower in total entry and
still exceeded a smooth frame budget. It does not establish a general speedup.

Reports: `/private/tmp/cot-countdown-wreck-baseline-native-20260908-r1/report.json`
and `/private/tmp/cot-countdown-wreck-candidate-native-20260908-r1/report.json`.
Baseline index SHA-256:
`9a7d22bab45868167da88f994d899fd42ca3b829f9aeb8e3f3f220b34f0d3c5f`;
complete-build SHA-256:
`cd0c00ac4528efa43179830901720f02c0873a9846fcbf137c4187e476148d2a`.
Candidate index:
`737c90d9aeae6837fd16932e7feff850259b21eb60d6e1dbc9e7f2e236e5f3ad`;
complete build:
`8876f7ed88c8af97ca9fb95c3bbed649bf39030536bb91e4407c054f75b2d30f`.

### CPU output parity and profiling limit

The fresh candidate CPU control at
`/private/tmp/cot-countdown-wreck-candidate-cpu-20260908-r1/report.json`
exactly matches the earlier CPU baseline's complete output object: 94 meshes,
435,635 vertices, and geometry SHA-256
`ae5ab614ccd8b854141cf99dce1a5f9b4444ab1deb15793ae3066281e032c056`.
All ten physical/placement receipts also match, including collision,
destructibles, loose records, wreck spots, and utility/grounding data. This is
before/after CPU output parity, not a cross-runtime native geometry assertion.

The candidate control recorded 1,758 slices, 1,036.89 ms synchronous work, and
a 67.09 ms largest slice (K2 construction). The profiling command expected
the native clients' 1,759 slices and correctly exited nonzero on that mismatch
before instrumentation ran. The failed receipt is retained; neither its gate
nor the expected count was changed to manufacture a pass. CPU/native slice
ordinal equivalence and instrumented candidate attribution are therefore not
certified by this run. The independently compared final output still matches
the baseline exactly.

### Final main integration

The runtime commit `cd7939351001b4b0581aa93beaec0869957ca06b` was rebased
cleanly onto `ec7322cd588c337fa5fd2626c55e6cbea5eeb229`, which adds the
non-activating continuous-shoe foundation. All eleven final focused checks
passed on that rebased tree: countdown, frame pump, private handoff, wreck
steps, exact wreck geometry, wreck output, props scheduling, both probe tools,
and the incoming shoe-floor and track-course controls. TypeScript/core-unused
checks and the public build passed again (925 modules and 18 localized routes).
The native comparison above predates this foundation integration; it is not
presented as a browser capture of the rebased build or of production.

The vehicle constructor itself remains synchronous. Large final geometry
merges and other world atoms also remain; this change is not a claim of
stall-free loading or a measured overall speedup. Ordinary multiplayer lobbies
do not expose day/night controls: authoritative weather seed can select night.
Native comparisons must report actual conditions, not silently force a seed,
rerun until favorable, disable quality adaptation, or compare unlike runs as
proof of improvement. A same-machine pair is not distant-device certification.
