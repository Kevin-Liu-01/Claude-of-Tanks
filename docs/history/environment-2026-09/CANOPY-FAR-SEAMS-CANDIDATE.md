# Distant canopy seam repair

2026-09-09. Geometry-only candidate `1b4c33f6c` was authored on `0823acd74`, then integrated onto `f547a34ad` without changing the accepted roof fix. It has narrow visual and measured-cost acceptance below, not whole-environment certification. Held combined candidate `25b13b5aa2d3b31797066ff46913d14475d5ab30` remains untouched; its near-card indexing optimization is not included.

## Scope

`vegetation.ts` adds a construction-only coordinate-coherent `jitterFarShell` and routes six far oak/pine/palm/birch shell callsites through it. Original `jitterRadial`, including the near-palm core, and all near merges remain unchanged. Each far caller retains the original two RNG draws per eligible vertex and final normal projection. The redundant intermediate far face-normal calculation is omitted; no array/map scratch is added.

Near geometry remains non-indexed, with the baseline draw API/storage. The combined candidate's **182,520-byte near-card savings are deliberately not retained**; this returns to 0823, not an additional near-resource regression against 0823. Materials, textures, placement, shaders, frame updates and existing lighting fixtures are untouched. New code/compilation and far-fragment costs remain unmeasured here; geometry budget equality is not whole-process memory or performance acceptance.

One focused `vegetationFarSeams.selftest.mjs` and its registry entry cover 225 real duplicated-corner fixtures; 528 actual near libraries/forms; 352 far libraries/forms; and 36 bush cases across all30 map palettes plus every species with additional seeds/snow. It checks exact near attribute/index/UV/color/metadata/bounds and internal constructor RNG tails, actual authored scale/merge transforms, far budgets/topology/UVs/RNG, and poisoned intermediate-normal overwrite. Authentic old gaps of 0.914702/0.176233m fail physical closure; near-palm opt-in, indexed merge and altered vertex channels fail independent controls.

## Actual checks and limits

[CPU receipt](/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/canopy-far-seams-checks-r1.iJGm2J/receipt.json): full-source replay against clean actual0823 near builders and held25b13 complete far output PASS; TypeScript7 and core-unused PASS. Doctor100/100 scanned the two tracked files, not the then-untracked test. The initial strict scan correctly failed the new test's nested `compareLibrary` (cognitive28). A test-only split preserved every assertion; [follow-up](/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/canopy-far-seams-checks-r1.iJGm2J/test-organization-followup.log) reran the exact frozen-source replay and strict three-file scan: both PASS, zero violations/any/unknown. Both checks used normal FIFO. No runtime adjustment followed these tests.

The earlier default test smoke first failed because identical RNG receipt objects came from different VM prototypes. Comparing their exact JSON data fixed that test-only issue; the subsequent default run passed. The optional full-source arguments strengthen checkpoint provenance without requiring Git history or an external worktree in ordinary committed test execution. All failures remain in the tool transcript or linked raw logs; no historical golden was refreshed.

Frozen input `vegetation.ts` SHA-256: 0823 `9c5b94fac8f923dce53d7bd9e48cf59420e8777b6c5d9bd6c5ac82bd65dd9747`; 25b13 `3b31ccf58ba01d0e9833b9335d99584d8d903bc0436faeeb374c059cccfcc07e`. Final candidate runtime SHA-256: `d440b7ae374c564df0e9851b6f3c850ca1ec53e26af097111b697c371200d83f`; focused test `6c43679ec78da123e20a5d9deed4c5a4c9fb7c7653dc5e0f7b7e11242729a4c9`.

This simplification follows the [attribution-only profile pair](/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/canopy-phase-cpu-attribution-r1.cTWpn9/ANALYSIS.md), which suggested renderer/binding work but did not prove canopy-index causation. All ten original phase failures, adverse CPU observations and mixed fixed-work evidence remain held; this new source candidate does not retroactively pass them.

## Native review and integration

The primary agent and independent reviewer personally viewed all 12 matched
native PNGs across Verdant and Coastal: establishing, detail and foliage.
Distant broadleaf crowns become coherent; nearby foliage, trunks, grass,
roads, props and horizons stay stable. Remaining blocky distant caps, peg-like
crops and the old Verdant inside-canopy dither are not fixed. The coastal
foliage view is not a clear isolated palm inspection. Static pictures do not
certify motion, every species or physical iPad/Safari behavior.

One separate 75-sample ×3 synchronized A/B passed the maintained comparisons
on actual High/Chrome152/M5 Max, 1440×900 DPR1. No baseline rebuild or retry.
Render medians stay 4.4ms for Verdant and 3.3ms for Coastal; p95 increases
0.1ms on each. Delivered interval medians increase 22.3→22.4ms and21.2→22.0ms
respectively. These adverse observations remain recorded; passing existing
tolerances is not proof of literally zero regression or live-game FPS.
Draws, triangles, materials, textures and renderer allocation counts match.
Complete commands, frozen hashes, raw repeats, resource comparisons and limits:
[native/cost receipt](/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/canopy-far-seams-native-r1.JRwpnz/ANALYSIS.md).

Final current-main integration passes the far-seam, existing vegetation
lighting/resource tests, native TS7, core-unused, strict module-quality and
ordinary public build. Source/test/registry and roof hashes stayed unchanged.
Doctor scanned all three files and exited0, score91, with six nonblocking
warnings in the Node-only test: fixed-source AST lookups and intentional
JSON normalization of cross-VM receipt metadata. These are not frame-loop
operations; no rule is suppressed and the report is not described as clean.
Receipt: `canopy-far-seams-main-check.DShGKD/report.json` in the archive above.
Public index SHA256: `1a44928268a65febc5ad9bdff47e8530c52f57a5ea8cdaf72267aa9fda6edf48`.
