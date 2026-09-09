# Terrain texture chart / coastal sand checkpoint

## Runtime scope

`42ea275df` replaces the camera-/interpolated-normal-derived meadow detail UV
frames with a fixed world-XZ chart. Pigment no longer moves to a different
texture coordinate when the camera turns. Decoded normals return through the
chart transpose to the existing world-XZ accumulator. Existing blend weights,
distance bands, exclusions and texture sample counts are retained.

`97f143920` confines sand ripple, bedform and steep-sand relief to the existing
beach blend on Coastal and inherited Saltwind. An explicit authoring flag is
necessary: Oasis and Skybridge also have water but their dry sand must keep its
relief. No terrain height, collision, road, placement or texture-painter path
changes. The existing ripple uniform grows from three to four scalars; this is
not literally zero additional bytes. There are no new textures or geometries.

Tests execute the production GLSL scalar helpers, compare normals to an
independent numerical gradient, reproduce the retired moving chart, and reject
wrong rotations, lost water/road masks and added texture fetches. Shore coverage
tests check the actual branch and all three relief contributions, including
negative controls and the complete current map opt-in list.

## Native comparison

Fresh output, never overwritten:

`/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/terrain-chart-shore-r1`

- Clean source `97f1439201e60d40f84722ba9251bf5daaca6583`.
- Public index SHA256 `2e54d9b4c5bd5c043eaed99c914f0841aa4a6cc4aa6545de6dc90833dbc257fa`.
- Report SHA256 `a956d2c6bca99e863e717e1d6ba8661fb1cc4eb7a24e66134833bb73c6f8df02`.
- Observed Chrome 151.0.7922.47 / ANGLE Metal Apple M5 Max, 1440×900, DPR1,
  high preset, scale1, trim0, settled sourced textures, zero page errors.
- All ten saved Coastal camera poses exactly match `canopy-only-before-r1`.
- Same scene inventory: 186 mesh families, 36,665 instances, 1,382,602 triangles,
  172 geometries, 32 materials and 40 scene-visible textures. Shader-only
  textures are not counted by that inventory; their ownership is unchanged.
- All authored/grounding gates pass. Owned browser/server and capture lease
  closed normally, exit0.

The establishing and close-detail images were inspected side by side. Excess
inland relief is reduced; the water, beach, roads and scene placement remain.
The prominent pale inland dirt/sand patches still need a separate material
composition pass. This checkpoint does not claim the overall visual bar is met.
Static images and these short frame-interval samples do not certify live-motion
stability, completed GPU cost, constrained-device performance or total memory.

## Validation / integration

Projection, shoreline coverage, surface detail, road material, native Mangrove
pigment, map-quality (all30), horizon lifetime, TypeScript7 and public-build
checks passed before integration. The initial sea-mode-only coverage test
failed on Oasis/Skybridge/Saltwind; that failure led to the explicit opt-in.
The old surface-detail expression check was updated to retain its water
exclusion while allowing the new shoreline multiplier.

Merge `fdba96038` incorporates published `origin/main` at `0aada3574`, including
the approved newer Verdant horizon and independently shipped wreck/loading
work. It does not roll those changes back. Final integrated checks follow below.

The integrated public build and native TypeScript7 check passed. Focused
projection, sand-coverage, road-material, source-preparation, all-30-map quality,
newer-Verdant horizon and local-import-integrity checks passed. The Mangrove
palette receipt now excludes only independently owned wreck donor IDs from its
historical palette projection; all other non-palette values remain checked,
with the original frozen receipt and independently derived projection retained.
Its native Canvas pigment, physical and mutation checks passed. The scoped
scanner still reports test-only source-expression evaluators/loop lookups; it
did not find a runtime defect. This is not a claim that every scanner check or
the full repository test suite passed.

Final native capture: clean `d6cc60fe38bfef5143075c900728603797a27e94`, output
`/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/terrain-chart-shore-integrated-r1`.

- Public index SHA256: `59ab7595eef38f12b8677e607f3c6182cdb5bd1b67b99afbefb3817a1a56a6ee`.
- Report SHA256: `961a65834d5677d2a79b73be517e2e7eaea9bfd43709dd7c461be507a7955aa7`.
- Coastal, Saltwind and Verdant establishing views were captured at 1440×900,
  DPR1, with zero page errors and no authored-quality/grounding failures.
- All three images were inspected. Verdant retains the approved low pastoral
  horizon; both coastal maps retain the beach and still need the separate
  inland sand-pigment correction identified above.
- This integrated run has no baseline cost comparison. Its scene includes
  independently published wreck changes, so it must not be presented as a
  whole-scene resource A/B against the older canopy baseline.
- Browser, server and owned capture lease closed normally (exit0).

After capture, published `508bb19b0` was merged normally; it changes only
historical vehicle-light tests/documentation, not this captured runtime.
