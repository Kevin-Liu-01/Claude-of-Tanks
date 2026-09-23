# Multiplayer loading CPU slices — September 2026

## Measured problem

The panel-program admission fix did not remove all covered-loading stalls.
The retained two-client capture
`/private/tmp/cot-mask-reflection-candidate-native-20260908-r1/report.json`
contains a guest long task at page-relative 4308.7–4407.7 ms. It spans the
world's final 12.9 ms, activation's 44 ms, and initial roster work's 41.8 ms.
Cached imports and texture preparation resolve as microtasks; creating a fresh
roster scheduler does not itself leave that task. The associated 165 ms RAF gap
also includes scheduling time and is not 165 ms of attributable construction.

Repeated structure-building slices also remain expensive. The independent
prechange props profiler maps slice 4 to the 512² stone painter and slice 11
to the 256² grime painter. Their source is unchanged from that attribution
through `c5ca781e2`; the fresh baseline reproduced the same 121 slices.
Roster assets already finish while the world builds, so more asset-transfer
overlap is not the critical-path fix for this measured case.

## Changes

- Before constructing the first missing roster entity, cross one owned task
  boundary. Empty rosters and already staged identities add no forced wait.
  Texture checkpoints and subsequent construction retain the shared 8 ms
  budget and 50 ms animation-checkpoint interval.
- Drain shared in-place texture promotion before rejecting disposal or a
  scheduling failure. Recheck bridge lifetime after acquisition and painting;
  a cancelled bridge cannot construct a new visual. Preserve the existing
  synchronous compatibility path for an actual texture-preparation failure.
- Delegate stone and grime painting through the existing props generator in
  16-row batches. The synchronous API drains the same generator. Preserve
  dimensions, pixel order, seeds, normal/packed maps, texture settings,
  material ownership, geometry and rendering quality. No timers or global
  texture cache are added by the painters.

Grime now finishes before material allocation and sourced replacements start.
This avoids suspending new, unregistered material owners across a row yield.
It also starts sourced texture acquisition later than before; transfers still
overlap subsequent geometry, but their start time is not unchanged.

These changes do not modify authority, spotting, readiness, the five-second
countdown, loader opacity/fade, shader/CSM admission, or the black-frame gate.
They do not move gameplay work before explicit battle intent.

## Immutable baseline

Fresh baseline report:
`/private/tmp/cot-roster-painter-baseline-native-20260908-r1/report.json`.
Its complete preserved public build is
`/private/tmp/cot-roster-painter-baseline-20260908.ghWPDg/dist`.
It contains the `c5ca781e2` runtime, built before that commit with the source
version label `v1.0.0+g55563cd01.dirty`.

- Index SHA256: `9bea0c4d670f1c4ea48e888d90c68291fc070f51012b2a410720f8cb5c8e0f6c`.
- Complete-build SHA256: `23084aca955843109e4a5c7cfd790e3666d27503cff2478dd8c7d0ffcd835144`.
- Acquisition SHA256: `de883652b8f729f2ca0bcffb0bdc6f1d0e9308d8bc3ff4c8b8ee29af23b0d091` (21 files, Node 24.13.0).

| Milliseconds, host / guest | Baseline |
| --- | --- |
| Launch to loader hidden | 2976.0 / 3213.2 |
| Maximum observed RAF gap | 186.7 / 186.1 |
| World acquisition | 1385 / 1531 |
| Roster preparation | 89 / 86 |
| Stone atomic slice | 52.6 / 53.1 |
| Grime/material atomic slice | 41.5 / 41.7 |
| Maximum props slice | 64.8 / 58.4 |
| Sum of synchronous props slices | 714.9 / 698.3 |

Both baseline clients passed 5,4,3,2,1, native room entry/exit, source-owned
nonblack and reveal checks, and advancing battle counters. No records were
dropped. All owned rooms, browser contexts, preview/signaling servers and the
capture lease were released. This is a local-loopback two-context test on one
machine, not production, distant-network or separate-device certification.

## Validation status

The focused roster test passes the initial task boundary, duplicate/cached/
empty rosters, exact camouflage/quality tuples, hidden-tab fallback, task
failure, disposal during the boundary, and disposal/scheduling failure during
shared painting. Ten focused scheduler, roster, entry, world activation and
native-probe self-tests passed. The props resource-ownership test, props-profile
harness and suite-registration test also passed. Typecheck (including core
unused checks), the public production build and diff checks passed. Full
`npm test` was not rerun for this slice; 812 registered checks is a discovery
count, not a claim that all 812 ran.

The new `propsTextureRows.selftest.mjs` passed with the exact pinned native
`@napi-rs/canvas` 0.1.100, supplied through its explicit `--canvas-module` option
because this worktree's shared dependency directory lacks that package. A
normal `npm ci` resolves the pinned package without the override. The test
compares complete pixels, normal/packed maps, texture settings and RNG against
the independent prechange algorithms for two seeds, including Winter tone and
untinted controls. Interleaved jobs remain byte-identical; a one-byte corruption
fails parity. Row checkpoints perform real work, with 33 stone checkpoints and
16 grime checkpoints. Cancellation checks cover the first painter-local
checkpoint, not every whole-world interruption/rollback path.

### Repeated native captures

Candidate index SHA256:
`9a7d22bab45868167da88f994d899fd42ca3b829f9aeb8e3f3f220b34f0d3c5f`.
Complete-build SHA256:
`cd0c00ac4528efa43179830901720f02c0873a9846fcbf137c4187e476148d2a`.
The candidate and baseline used the same acquisition code. Round 1 was not
fully matched: baseline used clear/night and candidate clear/day. Round 2 used
clear/day, high quality and the same M5 Max backend for both builds.
Reports are retained at
`/private/tmp/cot-roster-painter-{baseline,candidate}-native-20260908-r{1,2}/report.json`.

| Milliseconds, host / guest | Baseline 1 | Candidate 1 | Baseline 2 | Candidate 2 |
| --- | --- | --- | --- | --- |
| Launch to loader hidden | 2976.0 / 3213.2 | 3960.0 / 3953.6 | 7682.4 / 7506.6 | 3153.0 / 3136.8 |
| Maximum observed RAF gap | 186.7 / 186.1 | 227.1 / 178.2 | 407.1 / 339.5 | 185.5 / 186.6 |
| World acquisition | 1385 / 1531 | 1792 / 2014 | 2555 / 2864 | 1399 / 1534 |
| Roster preparation | 89 / 86 | 106 / 153 | 150 / 163 | 100 / 105 |
| Maximum props slice | 64.8 / 58.4 | 96.7 / 88.9 | 111.7 / 100.0 | 64.2 / 59.5 |
| Sum of synchronous props slices | 714.9 / 698.3 | 939.3 / 913.4 | 1227.6 / 1196.2 | 719.3 / 726.9 |
| Maximum final shadow render | 140 / 85 | 221 / 81 | 397 / 95 | 132 / 113 |

All four captures passed native entry/exit, the complete 5,4,3,2,1 countdown,
nonblack/reveal admission, advancing battle counters and cleanup. No records
were dropped. Candidate props builds expose 170 slices instead of 121. Their
row painters are absent from the retained eight slowest slices; that bounded
list cannot establish the precise maximum duration of a row batch.

Sequence presence is not countdown wall-time certification: baseline round 2
took about 10.3 seconds from 5 to rollout despite passing the current probe.
Candidate round 2 recorded 4914 / 4758 ms. The baseline timing deviation and
the probe's coverage limitation remain explicit follow-up evidence.

The first candidate was slower overall; the second candidate was faster than
its baseline, while unchanged construction and shadow work also varied widely.
These samples do not establish a repeatable end-to-end speedup or identify the
cause of that variation. The supported changes are finer CPU scheduling and
safer roster cancellation, with unchanged texture output. They are not a
production performance certificate or proof that historical stalls are fixed.

The read-only whole-repository React Doctor scan reports 43/100, 42 errors and
533 warnings over 1,952 files. It is retained at
`/var/folders/yl/sxf0v4tn14n2pkwqmf_21l540000gn/T/react-doctor-24062ef9-c97f-45ee-8ac8-6265bea48ee0`.
These existing repository-wide findings are not evidence of a loading fix.

The final changed-file scan inspected six files and reported 49/100 with two
`no-eval` errors: the existing `propsResources.selftest.mjs:25` and new
`propsTextureRows.selftest.mjs:208`. Both execute source extracted from fixed
local repository files (plus the embedded test control), not user, network or
runtime game input. The invocation is real; the reported untrusted-input
security implication is a high-confidence false positive for these test-only
paths. No rule was suppressed. Full diagnostics:
`/var/folders/yl/sxf0v4tn14n2pkwqmf_21l540000gn/T/react-doctor-dd9fe6a6-96b9-4725-bfe6-c58233db51a0`.
The whole-repository and changed-file scores have different denominators and
are not an improvement comparison. Changed-runtime complexity review also
retained the pre-existing, untouched `addWallRun` threshold violation; no
new `any` or `unknown` types were introduced.

## Remaining boundaries

Other atomic structure builders, final native shadow rendering and occasional
GPU readback queries still cause stalls. Do not remove PBO allocation checks
or lower scene quality to improve a timing receipt. The broader smooth-loading
goal remains open until repeated end-to-end evidence supports it.
