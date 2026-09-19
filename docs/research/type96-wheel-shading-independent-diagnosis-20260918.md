# Type96 r4 wheel shading: independent causal diagnosis

Read-only investigation, 2026-09-18. Profile `3be8eafbf97ffeddae3c930e0cf179f18a698b0ad8cdf76581920540c3dedae8`; core `22598a957e95b159fe56e9a3f9e7ec5bf4d609534b8bd120b1f0610ebbc183e3`; material `463071192afe3f83d1228ba57e6ac6b7c184ce74d8985b1a6122ac689ac983e9`.

## Finding

The shared `vehicleAmbientFloorHook` is the demonstrated dominant cause of the weak/flat cast-wheel read in the official left source-world camera. The Type96 wheel is neither a flat disc nor hidden under other foreground stock in this fixture. Do not prescribe extra wheel geometry or a darker paint palette as a response to this finding.

The browser builds the full normal rendered tank (not `geometryReceipt`). The current official evaluator was copied into private QA with only object/camera exposure instrumentation. Camera, lighting, all geometry, matrices, stock, source registration, and source renderer remained unchanged. Materials were swapped only on the actual emitted `gearRoadWheelDiscs` instance mesh, restored in `finally`, then captured again. Both runs used the shared FIFO. Actual hardware: ANGLE Metal / Apple M5 Max. Browser errors 0; recorded source drift none; final restored pixels exactly match baseline.

## Controlled rendered evidence

The original wheels use `cot:wheel-paint`, color `#504e3b`, standard roughness .92 / metalness .08, FrontSide, vertexColors false, no instance colors, no color map. Normal/roughness textures exist. The Ajax absent-color/vertexColors failure does **not** apply.

| Material-only diagnostic | Changed pixels vs baseline | Largest RGB channel difference | Visible result |
|---|---:|---:|---|
| Remove complete ambient/readability hook; original paint/textures retained | 4,836 | 104 | Clearly shaded cast dish/hub/rim, though too dark to adopt blindly as a final gameplay treatment |
| Suppress only absolute outgoing-luminance floor | 4,836 | 60 | Darker; remaining camera-facing ambient floor still suppresses the modeled shading |
| Suppress only camera-facing indirect-diffuse floor | 4,834 | 30 | Even brighter/flatter because the later shade estimate now sees less indirect irradiance and increases its absolute floor |
| Remove normal and roughness textures, retain complete hook/paint | 762 | 4 | Essentially same flat read |
| Neutral standard material, no hook/textures | 4,836 | 93 | Cast dish relief visible |
| Restore exact original material | 0 | 0 | Exact baseline recovery |

The interaction is explicit in `materials.ts`: the first `max(indirectDiffuse, diffuseColor * vehFill)` sets a camera-facing brightness floor; the second absolute `vehFloorL` floor uses `vehIndL` **after** that first floor to determine `vehShade`. Therefore removing only the first clamp can paradoxically increase the second. Both are active in this actual fixture. Normal-material output independently shows real smoothly varying hub/web/rim normals. Camouflage normalization/wheelPaintFloor sets the initial solid albedo, but it was held identical in the no-hook comparison and cannot explain the A/B change.

## Full emitted scene physical witness

Actual FrontSide rays queried all visible color-writing meshes under the complete runtime tank, with full instance/world matrices. Six camera-facing wheel instances (0,2,4,6,8,10), eight radial stations each. For every one of these 48 rays, first visible stock was `gearRoadWheelDiscs`, not a covering cap, generic wheel, armor plate, or phantom proxy. At the off-seam azimuth .317 rad, every wheel hub is world X=-1.5582000017m and radius .150m web is X=-1.4330281344m: **125.171867mm physical recess**. This is consistent with the prior ~122mm probe at a different angular station on the faceted lathe.

R1 exact-cardinal radial rays sometimes passed through tessellation-edge roundoff to a farther wall. R1 is preserved, not erased; R2 uses a declared off-seam azimuth and retains every raw hit. This is a ray precision issue, not evidence to patch faces or enable DoubleSide. The rendered normal image and full scene first-hit R2 witness show the actual exposed casting.

## Specific correction recommendation

Fix material-role-aware readability shading, not Type96 profile geometry or palette. For the `wheelPaint` role, preserve physically lit standard-material normal response and replace the two absolute/max clamps with a bounded additive ambient contribution (or an explicitly narrower wheel-specific treatment). Calculate any deep-shade detector from **unmodified** received lighting before applying synthetic fill, so the two mechanisms do not feed back into each other. Leave armor and ordinary legacy gear unchanged in the first bounded candidate. A blind total hook removal is a diagnostic, not an accepted final patch: its very dark wheel result needs sunlit/shaded/night controls and wheel-versus-tire separation checks. No constant palette countertuning, no extra invented bolts, no source shape change follows from this evidence.

Next smallest verification: implement a separate wheel-role shader candidate, reuse this exact A/B camera plus a lit opposite-side camera and a low-ambient control, and require unchanged silhouette/physical stock/normal maps, restored baseline equality, visible hub/web contrast, and retained dark wheel readability. Then review the updated official fourteen originals; this diagnosis does not retroactively make r4 visually qualified.

## Original evidence

- [baseline](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/independent-regional-review/type96-wheel-render-r2/baseline.png)
- [no-hook](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/independent-regional-review/type96-wheel-render-r2/no-hook.png)
- [no-absolute-floor](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/independent-regional-review/type96-wheel-render-r2/no-absolute-floor.png)
- [no-ambient-floor](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/independent-regional-review/type96-wheel-render-r2/no-ambient-floor.png)
- [no-textures](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/independent-regional-review/type96-wheel-render-r2/no-textures.png)
- [neutral-standard](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/independent-regional-review/type96-wheel-render-r2/neutral-standard.png)
- [normals](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/independent-regional-review/type96-wheel-render-r2/normals.png)
- [restored](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/independent-regional-review/type96-wheel-render-r2/restored.png)

[Raw ray/material/camera/identity report](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/independent-regional-review/type96-wheel-render-r2/report.json), [image hashes](/Users/kevinliu/.codex/worktrees/cot-kurganets-odztz-20260917/.qa-dev/tank-run/independent-regional-review/type96-wheel-render-r2/image-hashes.json).

Only private QA and this critique were written. No runtime/profile changes, no source or camera changes, no publication.
