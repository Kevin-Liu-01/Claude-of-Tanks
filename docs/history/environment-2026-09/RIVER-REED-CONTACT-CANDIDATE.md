# River reed contact checkpoint

This narrow correction replaces thick square reed posts with tapered, leaning
stems on Autumn, Delta and Mangrove. Each existing stem seats 0.06 metres into
its own terrain bed; the occasional head attaches to its emitted stem tip.
It reuses the unchanged winter stem builder. Winter output, clump/root XZ draws,
counts, collision, palettes and material families stay unchanged. Saltwind still
has no river reeds. This is not a lush wetland redesign or completion of the
broader plant/farm request; distribution and shoreline coverage are unchanged.

## Cost and verification

The focused source-executed test checks actual buffers, root/head seating,
RNG, collision and unaffected material buckets over three seeds. Negative
controls reject old square posts, clump-center grounding and detached heads.

| Seed 1337 kit | Existing pieces | Whole-kit primitive bytes, before → after |
| --- | ---: | ---: |
| Autumn | 1,644 | 1,398,600 → 872,520 |
| Delta | 859 | 745,920 → 471,040 |
| Mangrove | 85 | 131,880 → 104,680 |

Pieces include heads. Each retains 12 triangles. Primitive storage falls by
320 bytes per piece (24 to 14 vertices), but both expand to 36 nonindexed
vertices / 1,152 attribute bytes in the production bucket. **Final GPU geometry
bytes are unchanged, not reduced.** No new texture, material, draw family,
animation or per-frame work. Construction adds 7–13 height queries per clump;
this is not zero added CPU work.

The original packet `river-reed-contact-r1.Dzj7Sk` passes the focused test,
full TypeScript 7 and strict changed-file quality checks. Doctor exits 0 with
two test-only bounded array-lookup warnings. Original stale aggregate failures
remain retained; see `SHORELINE-REGRESSION-RECONCILIATION.md` for attribution.

The combined packet `shoreline-combined-packet-r1.PsvvAm` passes the focused
reed test, full TS7, production build, then all three reconciled normal suites
(boats, winter geometry, river landings) and scoped Doctor. The final release
omits the unrelated, rejected Coastal/Fjord driftwood candidate and receives
its own normal release checks.

## Actual native visual review

Evidence root:
`/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/`.

- Baseline: `shoreline-combined-packet-r1.PsvvAm/baseline-autumn-close.png`.
- Candidate: `river-reed-autumn-native-r3.ougp01/candidate-autumn-close.png`.
- Same actual eight-stem Autumn clump, merged-mesh offsets, absolute camera,
  High quality, 1440×900/DPR 1 and Apple M5 Max/Metal Chrome. No added test plants.
  All eight roots seat 0.06 metres below their own bed, within 2e-7 metres
  numerical discrepancy; measured head attachment error is zero.
- Root and independent reviewer inspected both images: square posts and floating
  crossbar are gone; thin leaning stems are seated. They remain dark, wiry and
  sparse. Accepted for this contact/shape correction, not full-bank composition.
- No observed page/GL/program errors; exact camera/quality/texture policy and
  source/build pins held. Browser/server closed and FIFO released after the
  14.265-second candidate run. Delta/Mangrove native views, temporal aliasing,
  physical iPad/Safari and steady-state performance remain uncertified.
- Attached counts changed during ordinary terrain/grass preparation. Separated
  captures are **not** stable whole-scene resource or timing parity evidence.
  The geometry-budget claim comes from actual nonindexed expansion tests.

Earlier acquisition failures remain intact. In-page JSON strings avoid CLI
numeric rounding. Changing `AGENT_BROWSER_DEFAULT_TIMEOUT` between commands
caused blank pages: agent-browser 0.34 fingerprints it and restarts its daemon.
The fixed runner keeps it constant and retains a separate external deadline.
Short namespace/session names avoid macOS's 103-byte socket limit. None of these
capture fixes changes game code or disables a visual guard.

## Reed-only release verification

`river-reed-release-r1.yTbFdT` checks clean `687aa19b2`, containing only the
reed runtime correction over published `1db45b0ad`. The focused reed test,
normal beached-boat, winter-geometry and river-landing suites, full native TS7,
scoped Doctor and production build all exit 0. Source pins are unchanged;
wrapper 88165 / worker 90475 finish and release their FIFO lease. No browser
is acquired for this CPU/build packet. Existing build chunk warnings and
Doctor's non-fatal test warnings are not suppressed.

Build index SHA256:
`2054a0173a7c4ba9df2e6840eb16034ede2168d67f25fbc90526be2418de67ec`.
The previously inspected Autumn pixels use the identical reed implementation;
the release merely omits the rejected changes on Coastal/Fjord. This is not a
full-suite, all-map visual or no-performance-regression certificate.
