# Seven-tank bodywork integration — 2026-09-09

Scoped checkpoint, not completion of the fleet performance/running-gear pass.
Inputs: `15303c11d176bcdabafbbb99b7851d6a9b4b2221` plus generator-owned
outputs listed below. Targets: `t90a_burlak_x`, `leo2a5_x`, `leo2a6_x`,
`leclerc_x`, `amx40_x`, `merkava3d_x`, `merkava4_x`.

## Changes and measured limits

- Fixed metal side panels use the existing camouflage finish rather than
  rubber. Mechanisms and genuinely flexible rubber remain separate.
- Both Merkavas have fitted finite shoulder returns; Mk3D front and Mk4 end
  fenders close the upper gaps while preserving visible lower wheels.
- This is not a triangle-reduction result. Mk4's end closures add 368
  triangles at both quality levels and two draw submissions. The running-gear
  primitive replacement, track gauge and switching-latency work remain open.

## Completed checks

The frozen-input driver completed all 12 phases, with no unexpected source
mutation: 16 focused tests; TypeScript; full-fleet anatomy update/check;
marking update/check; combat-anatomy test; full-fleet module-hit probe;
technical-card generation/check; 84 native views; and seven-ID icon refresh.
The module probe covered 174 tanks, 1,496 modules and 348 track sides with no
outside-module failures; its 79 existing dimension-drift warnings are retained.

Native coverage is seven IDs × HIGH/LOW × factory/winter × front-left,
rear-left and left, at 15 m and 1200 × 800. Representative current Mk3D front,
Mk4 rear and Burlak winter side images were visually reviewed. These views
demonstrate bodywork/finish, not all-pose running-gear or performance approval.
The private production build also passed, retaining the existing large-chunk
warning.

Separately, the maintained `muzzle-bore-probe --all` passed for all **201
currently registered IDs**: recessed dark bores, rims, concentricity and
terminal seating. This does not include the seven unpublished conventional
Abrams X variants. Their WIP must not be silently counted as registered.

Local raw evidence (excluded from Git):
`.qa-dev/bodywork-integration-gmMzYo/receipt.json` and phase logs;
`.qa-dev/bodywork-integration-gmMzYo/native/`;
`.qa-dev/all-fleet-bore-OSY1kG/report.json`.

The committed packet contains changed presentation assets and technical cards
across all seven IDs, with exactly those seven asset-manifest rows changed.
Anatomy receipts and presentation anchors/projections change only for the two
Merkavas; the marking-seat receipt changes only for Mk3D. No source-model files,
unrelated fleet-icon churn or temporary QA are included.

## Release status

The scoped integration receipt is PASS; it explicitly retains
`fullReleasePass: false`. It is not a substitute for the composed release
command, and previous failed full-suite results remain recorded. Do not cite
the individual passes above as a clean full `npm test` or a finished fleet pass.

The first composed release stopped at Mk3D presentation centering: 0.34 px
residual exceeded the unchanged 0.25 px limit after its fender correction.
The maintained centering generator was rerun; only the two changed Merkava
anchors/projections and their corresponding icons were retained. Unrelated
sub-millimetre M1A3/MBT-70 regeneration noise was excluded. The subsequent
release run passed centering (maximum 0.00 px rendered, 0.14 px exported top),
all seven module alignments, current assets, track duplication, muzzles,
barrel circularity and registered source fidelity. All seven strict geometry
gates passed (minimum 92.3/92); contact/clipping, continuity and weapon checks
also passed. The composed command then entered the full `npm test` lifecycle,
which subsequently failed in the unrelated world shoreline regression below.
None of these completed phases is a full release PASS.

On runtime input `183548a33` (later documentation/report-only head
`b0ed8d90f`), the full lifecycle passed 270 PRE files and the first 436 CORE
files, including all reached vehicle geometry, floor, asset, anatomy and gun
articulation checks. CORE stopped at `src/world/shoreDirtMask.selftest.mjs:254`:
`polders: bank pass is opt-in only`. The map currently enables `shoreDirt`,
whereas this historical-control test assumes only Mangrove enables it.
The map owner has been notified. Existing RGBA goldens must not be replaced
or the failed test silently skipped to publish vehicle work. Remaining CORE,
POST and the composed command's final private build are not yet release-green.

## Prior composed retry and handoff — 2026-09-09

On `976cf40d2`, the seven-ID composed retry again passed every targeted
anatomy, presentation, module, asset, track, muzzle, source-fidelity and
strict geometry/standard phase. All seven source comparisons passed their
unchanged exemplar floors. The full npm PRE phase then stopped at
`sourceXFleet.selftest.mjs`, whose T-90M lamp fixture confused the later
downward optical beam with the physical lens-cap normal. This run exited
nonzero; it is not a complete release pass. Its raw output session was 22470
and no release process remains running.

The narrow test-only repair is `508bb19b0`: measure actual tagged cap
triangles for physical seating, separately test the existing road-beam aim,
and reject injected upward/azimuth errors. Both the HIGH/LOW lamp-history
test and the complete source-X fleet regression passed without changing
runtime geometry, source hashes or historical goldens.

The bodywork candidate was assembled on `codex/bodywork-publish-20260909`,
based on `d0d01a903` plus eighteen scoped commits ending at `95e50fe3e`.
The current closeout below integrates that scoped work onto `508bb19b0`,
retaining subsequent wreck `geometryOnly` paint skipping and the optional
outer-band carrier seam. The separate fourteen-ID style branch and unfinished
roller-fit ancestry remain excluded. Local oracle files are comparison inputs,
not publication assets.

Comparator startup failures were independently traced to HTTP 504
`Outdated Optimize Dep`: worktrees shared a node_modules optimizer cache.
The comparison tool now uses a uniquely created private temporary cache and
disables late dependency discovery. A fresh unchanged K2 baseline comparison
passed on the first load (95.25 aggregate, minimum 92.97). No source transforms,
mask scoring, quality floors or timeout limits changed in this startup fix.

The lifecycle correction in `1415c90fe` acquires the cache, server, browser and
page inside the guarded lifecycle. Every acquired resource's cleanup is
attempted even if another close fails, and secondary cleanup errors remain
visible without replacing the primary failure. Only the run's own temporary
cache is removed. Eighteen browser-free cases passed, covering startup failures,
individual and combined cleanup failures, primary-error preservation, and
unchanged successful/failing scorer output. These tests do not replace native
fidelity or composed release checks.

## Current full release — pending

The isolated `codex/bodywork-closeout-r1` candidate at `1415c90fe` is based on
published main `508bb19b0`. Fresh full-fleet anatomy update/check completed:
174 anatomy receipts and 174 marking-seat receipts are current; the module
probe covered 1,496 modules and 348 track sides with zero failures and zero
outside-module results, retaining all 79 existing dimension-drift warnings;
all 522 technical-card files are current. Generation produced no tracked
drift. TypeScript and the core-unused check also passed. Local evidence is
retained in `.qa-closeout/anatomy.log` and `.qa-closeout/typecheck.log`, excluded
from publication.

The fresh seven-ID composed release (output session `24683`) exited 1. It
completed anatomy freshness, all seven presentation-centering checks (maximum
0.00 px rendered and 0.14 px exported top), module alignments and module-hit
checks with zero failures, 70 current asset files, track duplication, muzzle
bores, barrel circularity and all seven source comparisons. Source aggregates:
Burlak 96.6, Leopard 2A5 96.7, Leopard 2A6 97.8, Leclerc 97.9, AMX-40 96.2,
Merkava Mk3D 95.0 and Mk4 94.3; each unchanged exemplar floor passed.

The following geometry runner received HTTP 504 `Outdated Optimize Dep`
before registry discovery and timed out at its unchanged 150-second limit.
It produced no fresh geometry score; the full npm lifecycle and final private
build did not run. Raw output remains in `.qa-closeout/release.log`. During
this run, test-only `1fefbbda7` integrated the already-published world palette
fixture repair (`36e8359d9`); runtime and measured vehicle inputs were unchanged.
Its six native water-palette cases passed separately.

Tools-only `f1bd3f40d` gives the five remaining shared-cache release callers
unique temporary caches and independently guarded cleanup through one helper.
It preserves all measurement, scoring, timeout and queue policies. Injected
startup/callback/cleanup failures, primary errors, concurrent cache ownership,
five caller-wiring checks, the existing 18 fidelity lifecycle cases, suite
integrity (849 ordered checks), syntax, typecheck and core-unused all passed.
Already-private tools and the CPU-only circularity probe were left unchanged.
This is not a release PASS: a fresh complete composed run is still required.
