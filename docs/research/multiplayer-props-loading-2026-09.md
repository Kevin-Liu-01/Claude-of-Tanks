# Multiplayer props construction: exact-output loading reductions

## Scope and attribution

The cold Winter private-room path still performed expensive, indivisible map
construction on each peer. Independent loading removes a network dependency;
it does not remove each browser's geometry, collision, wreck and GPU work.
These changes reduce repeated construction work without changing map detail,
cover, render quality, input authority or the verified reveal gate.

The pinned original is `3cca022ff825f60f68a6bac037c530112e53515f`.
`tools/props-build-profile.mjs` runs separate unmodified and instrumented Node
workers against an explicitly selected source checkout. In-memory observers
preserve generator values, evaluation order and random draws. Both workers
must produce the same ordered geometry and physical records, and reproduce the
native Winter path's 121 generator slices. This uses a Canvas fixture, not a
GPU/browser performance measurement. Inclusive parent/child timings overlap
and must not be summed.

The original CPU attribution isolated these generator slices:

| Slice | Actual synchronous work | Original observed time |
|---|---|---:|
| 21 | Onion church collision extraction/projection | 154.6 ms; collision 152.7 ms |
| 64 | T-90M wreck plus its debris | 151.4 ms; wreck bake 137.9 ms |
| 82 | Finalizing the large sandbag destructible pool | 99.6 ms; collision 98.3 ms |

Slice 82 is **after** the preceding yield; the yield's label alone is not the
expensive operation. Repeated triangle-array identities explained 1,153
projection calls and 126.2 ms within this instrumented capture. The matched
candidate's respective slices were 27.4, 108.2 and 21.7 ms; both used profiler
SHA-256 `25b1b8cc681cb11b3f0380068333600357c7ee7058235e72e1f7c9c53470bfe6`.
These are
attributions of this loading capture, not proof of the cause of historical
214–319 ms gameplay stalls.

## Changes and invariants

1. Runtime collision extraction reuses each solid's unchanged projection across
   its contact and shell bands. The cache belongs to one extraction, preserves
   the dense-source cutoff and returns independent output polygons. Later
   calls re-extract geometry normally.
2. Exact polygon merging reuses welded vertex-key sets for unchanged arrays.
   Pair search, restart order, area tolerance and accepted hulls are unchanged.
   Every replacement hull has a new array identity. The cache dies with that
   merge call; there is no global retention or per-frame work.
3. Dense runtime footprint rasterization filters candidates by conservative
   per-polygon bounds before invoking the original point-in-polygon predicate.
   It preserves sample positions, resolution, row/span order and fallback.
   Rejection is restricted to finite, exactly representable Float32 positions;
   unsafe/malformed/other numeric domains retain the original path. Authoring
   rasterization is unchanged.
4. Static wreck baking explicitly disables only `eraVisualBindingReceipt`.
   That expensive audit metadata was immediately discarded by the bake.
   ERA creation, seating, cluster names/owners, geometry, shadows and colors
   remain intact. The factory option defaults to true, including geometry-only,
   workshop and anatomy callers; there is no broad geometry-only exemption.

A separate actual T-90M constructor attribution measured 82.6 ms in its ERA
assembly stage. The receipt omission targets discarded work within that stage;
it does not remove all ERA assembly or the authored builder. A proposed
indexed-geometry normalization shortcut saved only about 0.02 ms in the sampled
normalization median and was **not** implemented.

## Exact-output regressions

- `structureCollisionReuse.selftest.mjs`: baseline-controlled band reuse,
  empty projections, dense cutoff, output independence and later mutation.
- `structureCollisionMergeKeys.selftest.mjs`: exact Float64 results and accepted
  pair/hull trace versus the SHA-verified original. The real church runtime
  test reduces key-set construction from 167,622 to 1,713 while preserving
  all 164,203 pair tests and 487 accepted merges. Authoring output is also exact.
- `structureCollisionRaster.selftest.mjs`: original-predicate equivalence at
  boundaries, degenerate and extreme numeric cases, seeded mixtures and real
  packed sandbag streams. Large-pool predicate calls fall from 6,670,367 to
  4,261 without changing output rectangles.
- `wreckEraReceipt.selftest.mjs`: actual T-90M popped/unseated wreck outputs
  match a forced-default receipt path exactly, including vertices, normals,
  RGB, indices, shadow geometry and bounds. Default/anatomy receipts stay
  populated. An RGB mutation fails the equivalence gate.

The complete Winter props control output also matches the original across
94 meshes, 435,635 vertices and all ten physical record collections. Geometry
SHA-256 is `ae5ab614ccd8b854141cf99dce1a5f9b4444ab1deb15793ae3066281e032c056`.
No authored obstacle change or generated collision-manifest refresh is needed.

## Matched cold native comparison

The baseline-r2 and candidate-r2 runs used the same acquisition SHA-256
`e29cccbf956c17212e676dcf49a84ebbafee2105ec5bb15efd86f574416751c2`,
Node 24.13.0, fresh Chromium contexts, Winter clear/day, High, render scale 1,
and immediate native Start with unfinished prefetch on both peers. No timing
or visual-quality setting was changed between them.

| Metric (host / guest) | Original | Candidate |
|---|---:|---:|
| Props synchronous work | 1097.5 / 1133.9 ms | 714.8 / 724.9 ms |
| Largest props slice | 158.7 / 164.1 ms | 64.5 / 63.4 ms |
| World preparation | 1716 / 2060 ms | 1299 / 1631 ms |
| Network-entry owner total | 3850 / 4062 ms | 3334 / 3546 ms |
| Largest observed loading rAF gap | 259.0 / 264.3 ms | 157.8 / 187.6 ms |

The props work reduction in this pair is 34.9% / 36.1%. These are observations
from one matched pair, not population percentiles or a zero-hitch guarantee.
The largest candidate props operation remains a wreck, and other loading work
still exceeds a display-frame budget. The original church and sandbag slices
no longer appear among the candidate's eight slowest props slices.

Both runs passed foreground 5→1, nonblack without rescue, primed reveal, hidden
loaders, zero observation drops and native room cleanup. Candidate 5→rollout
was 4935.5 / 4864.8 ms. The sampled nonblack values were exactly identical in
both builds (106.8589 / 137.7611), without claiming screenshot equivalence.
Browsers, preview, signaling and the FIFO lease closed; no rooms remained.

Pinned public index SHA-256:

- Original: `ec7f537c3ab3f6385fc4b9a2071f8ed6be473dd0dca627090cda35d74a3f67b6`
- Candidate: `b41eeb4078a2eba299b1fafea5729c9263617d65c65922f50b139b1e53af94ff`

Complete public dist SHA-256:

- Original: `e26fb2e30807928cfdebed00fc4f9e121a54f65c50300450c03eeffbbfd47fc4`
- Candidate: `429f25337dcc849c154581913aa25e3fed5729946afe56b9863f55d95489da4e`

These candidate bytes precede integration of unrelated concurrent main changes.
A missing-approved-index preflight attempt was refused before browser creation;
it is not included as a completed performance sample.

## Reproduction and evidence limits

```sh
node tools/props-build-profile.mjs --root=/absolute/pinned-source --out=/absolute/new-cpu-report
node tools/wreck-build-profile.mjs --root=/absolute/pinned-source --out=/absolute/new-wreck-report --constructor
node tools/multiplayer-loading-build-probe.mjs --dist=/absolute/immutable-public-dist --out=/absolute/new-native-report --expected-build-index-hash=APPROVED_SHA256
```

The native wrapper owns loopback signaling, an immutable public-build preview,
fresh cache-disabled host/guest contexts and the normal immediate-Start flow.
It verifies the same acquisition and build bytes before/after, complete 5→1
countdowns, at least 4.5 seconds from 5 to rollout, primed nonblack reveals,
native Garage exits and zero remaining rooms. It records rescue state; neither
matched run required rescue. Shared capture
FIFO wait is excluded from scenario timing. Cancellation drains owned resources;
queued cancellation waits for acquisition/timeout before releasing its ticket.

This is a same-machine local-loopback comparison, not a production deployment,
physical-device, distant-network, hardware-GPU or photon-level certification.
Its nonblack sample is not a screenshot review. Loading rAF maxima are not
steady gameplay frame budgets, and faster individual atoms do not imply that
all transitions are hitch-free.

## Validation at the checkpoint

The 111-family × two-variant structure collision audit passes (minimum 94.1,
maximum 64 parts), alongside all four new runtime regressions, existing wreck,
resource and ground-cover tests, diagnostic CPU selftests, typecheck and the
public build (914 modules; 174 procedural playables, zero GLB-sourced). All 801
ordered test paths exist without duplicates. The seven changed runtime/tool
modules pass the strict quality gate: 1,026 functions, zero complexity violations,
zero explicit `any`/`unknown`.

The equal-population two-file React Doctor result remains 92 with the same
pre-existing `props.ts` lookup warning. The complete 15-file staged scan finds
two existing factory instance-update errors and eight existing factory warnings;
the updates are set by the surrounding construction/caller paths. The
base-relative changed-issues scan completes with zero new diagnostics. None
was suppressed. An initial untracked scan accidentally included local built QA
assets and was cancelled; it is not a quality result. No wiki/config source was
changed. Full `npm test` was not rerun for this checkpoint; the earlier full-suite
T-90M source-receipt failure is not represented as a pass.
