# Loading/resource release qualification

## Shipped mechanisms, not an all-performance certification

This release combines the already-landed countdown paint boundary with two
separately reviewed changes:

- [Demand-owned terrain source composition](terrain-source-checkpoints-20260910.md):
  async terrain requests already-loaded source layers through worker checkpoints,
  with generation guards and final cancellation ownership.
- [Track image residency](track-texture-source-sharing-20260910.md): two independent
  track UV views share one immutable pixel Source. Native pixel/disposal tests
  measure two GPU images becoming one without changing scrolling or appearance.

No tank geometry, source painter, visual-quality target, simulation or performance
threshold is reduced. Combined typecheck, public build and Doctor passed. Focused
source/material/runner tests and actual-browser controls are linked in those
receipts. The full repository test suite was not completed for this batch.

## Sustained camera test: failure retained

The combined frozen runtime was measured for 60 seconds in the production-format
local build: Verdant, player entry, high desktop quality, 1280×720/DPR 1, the same
pinned full 7:7 mixed roster, driving/steering/firing and trusted mouse input.
This is a solo rendering probe, not a multiplayer or separate-device test.

Receipt: `/private/tmp/cot-interactive-baseline.gsRCvU/loading-closure-camera-r2.json`.
SHA-256: `69cac198503494f8106bd61770fbd5776e0bb10e37ab5b642d38b860c0b18ddd`.
Built HTML SHA-256:
`840d11945ec49b68581f21515bc6aa5d59137b9c13226da409782266bb976172`.
Checkout source hash was unchanged at both sample edges:
`8afb3c8c7727a69ee955d398b4b143719fa28e80e788366500742b84434c69a6`.

| Gate | Measured | Existing limit | Result |
| --- | ---: | ---: | --- |
| Median FPS | 59.9 | ≥60 | FAIL |
| Fifth-percentile FPS | 40 | ≥45 | FAIL |
| 99th-percentile submission interval | 26.3 ms | ≤25 ms | FAIL |
| Worst draw calls | 867 | ≤900 | PASS |
| Median triangles | 4,515,566 | ≤7,000,000 | PASS |
| Load to ready | 1,445 ms | <5,000 ms | PASS |
| Scene texture estimate | 166.9 MB | ≤512 MB | PASS |
| Heap trend | −1.12 MB/s | ≤1 MB/s | PASS |
| Console errors | 0 | 0 | PASS |

The 3,449 positive renderer submissions covered 60,006.9 ms with an admitted
terminal interval of 16 ms. These are RAF-observed submission intervals, not
physical display/GPU durations. Certification was REFUSED: machine load ranged
16.23→14.65 (maximum 16.45; allowed 9), and the unrelated interactive-browser GPU
process reached 103.7% CPU (allowed 15%). That is process CPU, not GPU utilization.
No foreign headless GPU processes were observed. Foreign processes were neither
terminated nor altered for this test.

All 28 dispatched trusted camera inputs were observed/responded, with no misses
or spacing violations. Coverage still failed: 29 were planned, and the final
slot correctly lacked the required full response window after minimum-spacing
delays. The sample was not extended, the plan was not shortened, and the
thresholds were not relaxed. This is not a complete camera certification.

The previous `loading-closure-camera-r1` and nine failed inventory caps in
`loading-closure-resources-r1` remain valid failed/refused evidence. Sharing track
storage does not reduce logical texture counts, triangles, draws or summed
per-view canvas pixels. The exact cause of historical 214–319 ms gameplay stalls
remains unproven; this release does not claim those failures are all resolved.

## Live verification

The already-published countdown boundary was verified at `v1.0.0+gdab4f986e`.
Post-publication version and real-button controls for the combined release are
recorded after deployment, separately from the sustained failed probe above.
