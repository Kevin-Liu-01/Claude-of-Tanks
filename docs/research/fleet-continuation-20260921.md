# Fleet continuation — 2026-09-21

Status: Garage construction checkpoint verified; fleet fit reconciliation in progress.
This is the continuation of the owner's unfinished fleet/style/performance
handoff, after the Ariete family release. It is not a new tank redesign or a
claim that all historical fleet gates pass.

## Execution and ownership

The owner requested fast, linear work without subagents. One agent owns this
continuation, including implementation, inspection and verification. Any new
visual review in this continuation is self-review, not an independent critic.
Existing independently reviewed receipts retain their original scope.

Baseline main: `c74d1a2b2cf3579edc071527f303478abd9e8b57`.
Worktree: `/Users/kevinliu/.codex/worktrees/cot-fleet-continuation-20260921`.
Branch: `codex/fleet-continuation-20260921`.
The shared dirty checkout and old mixed drafts are untouched. Verified
checkpoints may be committed and pushed to main under the owner's standing
authorization; unfinished drafts and source models remain excluded.

## Reconciled completed requests

These changes are ancestors of the baseline. Old handoff language saying they
are unimplemented or awaiting publication must not cause a duplicate rebuild.

| Request | Published implementation |
| --- | --- |
| Definitive larger C1, retained Italian prototypes, proper upgraded C2 | `311cbd838`, `8efeb1f12`, `c74d1a2b2`; complete current release in the Ariete packet |
| T-90MS-based rapid rocket battery | `b50b20878`, TOS-1A Tagil |
| Merkava fittings/closed Barak door, Sabra paint, separate logo and abstract camos | `a6fa51e18` |
| Chinese Type 100 IFV redesign | `3811a5838` |
| Distinct missile-oriented ZTZ prototype and Object 695 | `fa47ba0d3`; supersedes the earlier Epokha-turret comparison target |
| Roster order, Israeli paints, Merkava shoulder, restored prototype and Dragun balance | `cf0215c1d`, with later concept revisions retained |
| Supplied AFV, Ares and Israeli additions | `547457932`, `98c53a671`, `570c0f55e` and their integrated repair/qualification commits |
| Challenger paired wheels and track seating, T-72B3M shoulder closure | September 14 owner-ruling and running-gear batches; the older T-72B3M open-channel request is superseded |
| Water interaction and layered horizons | `e3ad8b6a1`, `bc588917a`, `e3fc71582`, preserving the intervening map, lighting and terrain work |

Publication establishes implementation history. It does not convert historical
failed source comparisons or incomplete fleet-wide performance evidence into
passes. Per-tank packets and newer owner decisions govern their targets.

## Remaining acceptance work

The open [fleet priority](../tank-generation/fleet-style-performance-priority.md)
still requires current per-vehicle evidence for switching cost, repeated
geometry, return support, track stock/fit, bodywork closure and material roles.
Its September 10 measurements are historical baselines, not current defects.

Work proceeds in this order:

1. Measure current construction and real selection paths, then repair a
   demonstrated bottleneck while preserving model output and resource ownership.
2. Reconcile current HIGH/LOW stock and fit against the original required
   manifest plus subsequent additions; repair actual remaining defects.
3. Inspect current closure and material issues, preserving intentional openings
   and the owner's later overrides.
4. Complete matched visual/performance evidence and publish verified batches.

The new census covers all 201 currently buildable IDs at HIGH and LOW, not only
IDs containing `_x`. The exact ID array is frozen in
`.qa-dev/fleet-continuation/ids.json`; the stock tool serializes it with the
input revision and hash. Geometry-receipt construction times exclude browser
camouflage, GPU uploads and actual selection. They are used to choose a
profile, not to claim smooth switching or frame-rate improvement.

The first browser baseline uses real country/card clicks through the current
Garage with 4× CPU slowdown, two selection cycles and existing prefetch.
CPU profiling is a separate diagnostic so profiling overhead cannot be
mistaken for an uninstrumented before/after result. The capture queue serializes
the runs, and no implementation input changes during baseline acquisition.

## Garage construction checkpoint

The HIGH/LOW census completed all **402 builds** with identical before/after
input hash `25f6db21c759caf085a5c474b0262ff097c2c8381ddb3f9b9ba65fbbb6870be2`.
Its slowest construction outliers were dominated by the marking-seat surface
search enabled by `geometryReceipt`. Runtime construction instead consumes the
generated marking seats. Those multi-second diagnostic times are therefore
**not Garage switching times**.

Actual browser profiling found the Garage still drained construction
synchronously. A cold Leopard 2A4 diagnostic recorded 249 ms construction,
including 76 ms decoration, and 72 ms shader warming at 4× CPU slowdown.
The profile separately observed synchronous WebGL program queries. Shader
submission policy is unchanged in this checkpoint.

Interactive Garage selection now consumes the existing private factory
iterator with a 16 ms scheduling budget. This is a cooperative budget, not a
guarantee that each step finishes in 16 ms: the core builder remains synchronous.
The old hero stays visible until construction and warming finish. Superseding
a selection, entering battle or disposing the owner closes the unfinished
iterator and releases its resources. Only the completed current selection may
enter the scene and warm cache. Covered initial construction stays synchronous.
Returning A → B → A while B is still building now cancels B; previously the
same-current shortcut let B appear late over the requested A. Forced selection
of the current cached hero also no longer parks that same hero.
The Garage also opts out of the authoring-only ERA fitted-face report, as live
battle construction already does; actual armor clusters and damage/reset
behavior are retained.

Work time, wait time, checkpoint count and the longest construction step are
recorded separately. The first 6 ms candidate reduced frame gaps but added too
much reveal latency; it was replaced by the measured 16 ms candidate.

### Matched browser evidence

Full compact receipts: [switching observations](fleet-continuation-20260921-switching.json).
Eight IDs: `m1a2_sepv3`, `challenger_3x`, `challenger2`, `t90a_x`, `leo2a7v_x`,
`ariete_c2_x`, `merkava4_barak`, `kurganets25_x`. Each tier has two cycles and a
rapid-switch convergence check, 1440×900 at DPR 1 and 4× CPU slowdown. The mobile
row selects the mobile graphics tier on this same desktop browser/viewport; it
is **not physical mobile-device testing**.

| Observation, milliseconds | Desktop before | Desktop after | Mobile tier before | Mobile tier after |
| --- | ---: | ---: | ---: | ---: |
| Maximum observed selection RAF gap | 425.7 | 212.5 | 668.3 | 197.6 |
| Maximum observed UI readiness | 619.3 | 568.3 | 1178.9 | 523.0 |
| Median observed UI readiness | 224.5 | 324.0 | 219.1 | 297.6 |

Both tiers converge without page/resource errors or input drift. Visible-card
thumbnail settling checks pass. Production prefetch remains enabled, so cache
hits and country-default selection work vary with cancellation timing. Medians
regress in these runs; this checkpoint reduces worst observed stalls, **not
every selection latency**. These are one paired fresh-browser run per tier,
served through Vite, not statistical FPS or production-bundle certification.
These final runs include the A → B → A correction. Remaining 198–213 ms gaps
mean FSP-01 is still open.

### Verification

- Garage lifecycle, preloader and loading-intent tests pass, including private
  construction, same-ID reselection, stale selection, battle handoff, disposal,
  failed scheduling and work/wait accounting.
- Factory staging passes 4,297 assertions, preserving existing golden checks
  and exact synchronous/sliced Garage output for Abrams, Challenger 3 X and C2
  Ariete, including geometry, materials, shadow batches and rig ownership.
- ERA-report parity passes 36 actual painted builds across six vehicles and
  three caller roles, including static Garage preparation into battle, actual
  texture pixels, cluster depletion/reset, articulation and recoil.
- Full project typecheck/unused-code check and public production build pass.
- Native screenshots were inspected for the Abrams comparison, Challenger 3 X
  and mobile-tier Abrams. This is a bounded self-review; full fleet visual
  certification remains separate.

No vehicle builder, model profile, physical dimensions, paint definition or
combat-anatomy input changed in this checkpoint. Existing generated model
receipts remain untouched; no new geometry/source-gate pass is claimed.
