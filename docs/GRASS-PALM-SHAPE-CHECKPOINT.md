# Finer grass and connected palm stems

Runtime checkpoint: `902d9882f886cacb9fa58dbe6b1b104b0448bf3e` on
published `7145bf3f1`. Grass blade width is 45% of its former value, retaining
the exact roots, tips, pigment, curves and random stream. Near and far palm
segments now tilt by their full horizontal displacement before yawing into
the authored lean direction; the former signed-X tilt misaligned many joints.
No card, plant, material, texture, collider or per-frame operation is added.

## Visual review

Root and an independent reviewer personally viewed all eight native images:
Autumn and Delta, close and establishing, baseline and candidate at matching
poses. Both changes are accepted as incremental improvements.

- Grass reads as finer stems instead of broad spear-like clumps. More ground
  shows through, exposing the inherited flat ground and regular crop rows;
  pale flower flecks also stand out more.
- Delta's stepped/disconnected palm sections become continuous leaning stems.
  The establishing view shows no new obvious stem/crown discontinuity, but
  does not isolate every far-LOD joint or grass-obscured root contact.
- Orange/black bush cards, broad palm fronds, blocky distant crowns, terrain
  materials, pale sun-facing Delta water and overall composition remain open.

## Verification and preserved failures

Evidence root: `/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/`.

- `grass-palm-checks-r2.NRnZUs`: eleven focused selftests, TS7, strict source
  complexity, scoped Doctor and diff check pass. Public build passes on clean
  runtime checkpoint; source remains stable. The grass test exercises240
  real Canvas cases; palm tests exercise90 near/far builds with actual cap
  centers, direction, unchanged non-stem geometry, RNG and contact checks.
- Earlier CPU R1 failed an atlas test's thick-blade-specific alpha255 count.
  The replacement checks substantial coverage at the actual .44 cutoff and
  retains exact alpha/pigment/padding checks. Runtime was not changed for R2.
- `grass-blade-native-r1.B5YTzy` remains a failed acquisition: four invisible
  chunks finished during the candidate Autumn near screenshot bracket.
  A fixed120 post renders had not proved deferred world work was complete.
- `grass-blade-native-r2.2ImOoT`: ordinary source-derived world-update waits
  at initial and comparison cameras, no manual update/LOD/visibility forcing.
  All four exact grass-owner A/B contracts and screenshot brackets pass.
  Apple M5 Max/Metal Chrome, High,1440×900,DPR1,trim0,scale1,fixed wind2.
  No observed page/GL/program/context errors; both browsers and previews close,
  ordinary FIFO releases, source/build/tools remain pinned. Elapsed100.475s.

Grass retains four geometry objects, four materials and two128² RGBA sources.
Exact allocated CPU buffer bytes (including source pixels) and actual grass
submissions match in each120-frame comparison:

| View | Owners | Buffer bytes | Draw submissions | Logical triangles |
| --- | ---: | ---: | ---: | ---: |
| Autumn close | 72 | 24,371,960 | 1,680 | 23,184,960 |
| Autumn establishing | 74 | 25,117,520 | 1,920 | 28,487,280 |
| Delta close | 80 | 29,775,636 | 1,920 | 19,398,720 |
| Delta establishing | 80 | 29,775,636 | 1,680 | 18,616,560 |

Raw post-render CPU p50/p95 milliseconds, baseline→candidate: Autumn close
2.5/2.9→2.4/2.8; Autumn establishing2.8/3.7→2.5/3.5; Delta close3.8/4.2→3.9/4.4;
Delta establishing3.9/4.5→3.9/4.3. Delivered-interval medians stay16.6–16.7ms.
These short observations are not a statistical whole-frame cost gate or GPU
timing; the small Delta-close CPU increase is retained, not hidden. Renderer
resource counts match, but its last-post-pass draw counter is not a full frame.
CPU buffer equality is not a complete heap/GPU-memory certificate.

Build index SHA256:
`d0398686188b4f8e45ff528ff792adfc86d3710a2159d0928a92721cce907ddb`.
Motion/shimmer, all30-map native rollout, physical iPad/Safari and whole-game
performance/memory verification remain open. This does not complete the full
plant-variety, farm, shoreline or environment beautification request.
