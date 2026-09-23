# Unshipped Garage draw-range candidate

Base: `465a68f7c43cd9ed1cc23ce62853ab9d1c6e0b43`, freshly fetched `origin/main`.
Branch: `codex/garage-draw-range-20260910`. No build/browser/release performed.

The existing static merge retains exact contiguous top-level section runs and
owner-local bounds. Only non-shadow-casting, frustum-culled merged batches with
2–64 runs participate. One range encloses all camera-intersecting runs; invisible
interior runs remain conservatively submitted. Buffers, material identities,
draw owners, full geometry bounds, quality and thresholds do not change.

Each actual draw uses its camera and mesh-world transform, including projection,
coordinate system and reversed depth. Scratch/cached selection is retained.
Range edits restore after each successful draw; the real post `finally` drains
failed draws. Outside that transaction, warm/debug paths retain full ranges.

`.local-evidence/garage-draw-range-focused-r2.log` passes five focused checks,
strict metrics (43 functions, zero violations/any/unknown), and full typecheck
plus unused-owner checks. The initial Node parameter-property parse failure is
preserved in r1. The actual optimizer/post/composer/native buffer-owner fixture
submits 75 versus 27 total triangles at unchanged four calls; this is controlled
CPU WebGL-I/O evidence, not a production Garage saving or pixel/GPU proof.
It covers immutable bytes/owners, camera and owner transforms, all-visible and
edge geometry, visible-removal negative control, exception/recovery, standalone
warm draws, caster exclusion and fragmented-batch fallback.

Read-only Doctor 0.9.13 reports 49/100 on five tracked changed files, flagging
the existing repository-source execution in `postFrameAccounting.selftest.mjs`.
Untracked new files are covered by explicit tests/metrics, not that scan. No
scanner rules were changed. Three.js/game/engine/tools guidance informed the
allocation, ownership and evidence boundaries. Native per-camera pixel and
complete-frame resource comparisons remain required before release.

The final r3 FIFO batch passes six focused checks, strict metrics and typecheck.
Independent review found no supported visibility/restoration blocker; its
duplicate bounds-scan finding was corrected by reusing existing transformed
bounds. `tools/garage-draw-range-probe.mjs` is an unrun maintained Puppeteer
diagnostic against an already served actual app. It owns the FIFO lease, waits
for complete workshop construction, captures fixed-camera control/A/B/drop-all
negative RGBA and PNG pairs, checks zero pixel difference and native submitted
triangle reduction without extra calls/residency, and restores state in finally.
Its CPU gate has thirteen failure controls. No browser acceptance is claimed.
