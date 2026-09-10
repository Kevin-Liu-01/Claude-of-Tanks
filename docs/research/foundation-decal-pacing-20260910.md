# Completed foundation-decal checkpoints

This bounded follow-up starts from `85aa9224a`. The retained
`heightfield-yield-local-r1/report.json` records 24.5 ms for the completed
foundation family (see [the loading receipt](structure-loading-work-20260910.md#native-terrain-follow-up-and-integration)).
That family measurement does not attribute the time among geometry collection,
texture painting and merging, or explain the separate 121.1 ms callback gap.

## Change and ownership

`props.ts` now delegates foundation collection through generators. Each completed
building, crushable, stack or accepted courtyard geometry emits a fine-only,
non-progress checkpoint, `ground-foundation-instances`. Geometry formulas,
iteration order, RNG draws, height queries and the completed-family checkpoints
remain unchanged. Coarse callers gain no callbacks or awaited boundaries.

At the new checkpoints, source geometries are still private: no foundation
texture or merged mesh exists yet. IteratorClose disposes every completed private
input, continuing if an individual disposer throws so the original build
cancellation is preserved. Successful collection follows the original texture,
merge, group transfer and foundry reconformation paths. No runtime is returned
on cancellation. Rubble, curbs, scars and track construction are not changed.

Texture painting, geometry merging, individual geometry construction and runs
of rejected courtyard candidates remain synchronous. Checkpoints permit the
existing covered-build pacing owner to yield; they do not guarantee a paint
after each instance or a particular maximum frame gap. No native/browser capture
or speedup claim is attached to this patch.

## Verification

The ordinary FIFO batch in
`/private/tmp/cot-interactive-baseline.gsRCvU/foundation-decal-yield-cpu-r1.log`
passes these seven entries:

- `propsScheduling.selftest.mjs`
- `propsResources.selftest.mjs`
- `propsMaterialGeometry.selftest.mjs`
- `propsTextureRows.selftest.mjs`
- `foundryServiceCourt.selftest.mjs`
- Native TypeScript (`@typescript/native/bin/tsc -p tsconfig.json --noEmit`)
- `core-unused-check.mjs`

The scheduling fixture executes the actual original and delegated decal owners.
It retains the original complete-ground SHA256
`5f9a3ac81e2135e1204c95e3cf62bab5dd3d4a884530b245bda2072ff2f0791e`
and the existing street-block hash, without changing either oracle. Exact
geometry arrays, shared/private RNG, height-query order, material flags, Canvas
commands/alpha output and foundry vertex-window reconformation match. The Canvas
command fixture is not a native final-pixel or browser-timing comparison.
Cancellation covers first/last buildings, last crushable/stack and first/final
courtyard boundaries, a held rejected callback, and a throwing input disposer. Every
completed private input is disposed exactly once; no later family, texture or
partial runtime is published. Coarse callback behavior is separately checked.

The eighth entry, the strict whole-file metric gate, **fails** on the two
inherited owners: `addWallRun` (cyclomatic 21, cognitive 28) and `propsBuildSteps`
(27, 26). All three changed generators are below the strict thresholds; there
are zero explicit `any` or `unknown` findings. No threshold was changed.

A separate FIFO baseline comparison, retained in
`foundation-decal-yield-metric-baseline-r1.log`, verifies the same two metrics at
`85aa9224a`. `addWallRun` is byte-identical, SHA256
`7222af5888a9aeb7d78e34a6fc12f02075b96a2c624e5e59fc03bdac99c21fb1`.
The enclosing `propsBuildSteps` is byte-identical outside the reviewed nested
`placeGroundBlendDecals` declaration; replacing that declaration with the same
marker gives SHA256
`1df8bed38a5edf09ef8ad593025043b554c918edc07946ffa3626ce7b453a85a`
for both versions. This baseline evidence does not turn the failed whole-file
gate into a pass. Native qualification and full-suite acceptance remain separate.

## Root integration and native functional check

Root cherry-picked the patch as `0a8a6267a` above the tools-only `d1585389e`.
`foundation-integration-gates-r1.log` passes the five focused props tests above,
action timing, native TypeScript, core-unused and the public production build.
The real-control native run `foundation-yield-local-r1` uses that public build,
Chrome 151 / ANGLE Metal Apple M5 Max, Urban, 14 vehicles, high quality, 1280×720
DPR 1, scale 1 and trim 0. Functional, trusted-entry audio, clock ownership,
warm-readiness and source-readiness gates pass, with no console/cleanup errors.
Day/night/Garage screenshots were inspected. These are functional gates, not a
strict frame-budget certificate.

Battle / rematch / Garage cover observations are 3.7 / 149.9 / 101.0 ms;
ready times are 8807.8 / 5790.3 / 375.7 ms; worst callback gaps remain
158.9 / 121.8 / 56.8 ms. The foundation family no longer appears among the eight
slowest props slices (the eighth is 16.7 ms), but that does not establish its
exact maximum or a whole-transition speedup. Remaining slowest props slices
include initial setup 29.5 ms and stone-tone 29.0 ms. The first 158.9 ms gap
contains a separate 108 ms Long Task; its nested owner is not classified by this
unprofiled run. Rematch's 121.8 ms gap has no overlapping ≥50 ms Long Task and a
97.3 ms LoAF with no attributed script. Do not assign either gap to this patch
or to GC/GPU activity from those observations alone.

Report SHA256: `2bdf81ee751e62702207dd012d187690191ce2bf7bc15511c24cfe3619367928`.
HTML SHA256: `e185cca9758f0dbd1bbb43ffbe3af5b526e57a932f5eb6432a20e5bda3a47201`.
Acquisition SHA256: `ca9af05238ca4f5c0fb1d2941892f9f19519f95cfa3196038d91f36d469262a4`.
Evidence lives under `/private/tmp/cot-interactive-baseline.gsRCvU/`.
