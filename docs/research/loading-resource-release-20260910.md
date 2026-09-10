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
physical display/GPU durations. Certification was REFUSED: starting machine load
16.23 exceeded 9, and peak 16.45 exceeded 14 (9 plus 5 probe headroom); ending load
was 14.65. The unrelated interactive-browser GPU
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

`origin/main` was non-force fast-forwarded through `b2b37420b` and `57fe26ac9`;
the public site returned HTTP 200 with `v1.0.0+g57fe26ac9`. Production real-button
controls then passed splash entry, Battle, Rematch and Garage return, with all
four boot/audio-clock/warm/source gates passing. Both day/night reveals applied
six of six source sets with no failures. Errors, cleanup errors and failures
were empty; the three final screenshots were inspected. The owned browser closed.

Receipt: `/private/tmp/cot-interactive-baseline.gsRCvU/loading-resource-production-controls-r1/report.json`.
SHA-256: `a2504c1825d38744bc872bdaff2d38456d7af841320cfb978f3b95683a59e727`.
Built HTML SHA-256:
`986a21c7175733849158e2d8fc9f99198afcffee483a200a03abeb9b93d6503f`.
Chrome 151.0.7922.47 / native ANGLE Metal Apple M5 Max, high 1280×720/DPR 1,
normal transitions, no quality reduction. No profiler or trace overhead was
enabled. These control timings are separate from the sustained failed probe.

| Action | Cover observed | Click to probe-ready | Largest callback-start gap |
| --- | ---: | ---: | ---: |
| Battle | 2.3 ms | 23,543.9 ms | 111.8 ms |
| Rematch | 159.5 ms | 6,447.0 ms | 183.9 ms |
| Garage | 94.3 ms | 369.1 ms | 54.1 ms |

**Functional pass is not a responsiveness pass.** The rematch gap was uncovered
at countdown 1. Its LoAF contained a 169.2 ms `Scheduler.yield.then` continuation,
not the earlier paired pre-paint callbacks. Recorded visual construction ended
before it. Reconstructed rounded stage boundaries place it inside the 545 ms
rare hidden-variant warm; that stage's three actual renders were only 8/5/5 ms.
No per-operation trace identifies the exact leaf. Source inspection found that
hidden-variant compilation still directly reflects new `getUniforms()` before
its 6 ms checkpoint, bypassing the existing parallel-link readiness owner. This
is the next bounded correction, not proof of the historical gameplay stall cause.

The cold Battle also spent 16,300 ms wall time placing props, with 2,091.7 ms
reported synchronous slice time; waiting/network/scheduling time must not be
called CPU time. The 23.5 second first entry is not an instant-loading result.

## Follow-up landing and production result

`c4c56ac68` corrects the hidden-reflection readiness bypass, and `f6622924a`
adds bounded props-wait attribution without changing pacing. Both are pushed
and live. The subsequent production controls passed all four gates, with no
recorded >50 ms callback gap inside either exact hidden-warm interval. Other
uncovered countdown gaps still reached 71.4 ms; sustained-frame/resource failures
above remain open. Full details and immutable receipt hashes are in
[hidden program readiness](hidden-program-readiness-20260910.md) and
[props wait attribution](props-await-attribution-20260910.md). The combined scan's
raw Doctor49 result and reviewed fixed-source test-fixture findings are retained,
not represented as a scanner pass. Tests, typecheck and public build passed.
