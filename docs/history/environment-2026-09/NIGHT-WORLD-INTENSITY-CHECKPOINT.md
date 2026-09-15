# Night fixture brightness checkpoint

Runtime checkpoint: `d8a3ea299` (source review `cc655f11e`).

Occupied-window emission is `.225`, formerly `.9`; the existing streetlamp
point is `6`, formerly `24`. These are two construction-time scalar changes.
Bulb radiance, tint, positions, masks, range, light pool, shaders and day/Garage
restoration are unchanged. Verdant's restored original horizon is untouched.

Three matched native Chrome/Metal Urban views were reviewed against the prior
driving-light checkpoint. The facade retains more plaster/brick contrast and
windows are softer amber. Headlights still illuminate the ground. Uniform panes
still lack interior detail; unshadowed point lights still lack occlusion. This
is not all-map visual certification or a measured loading/FPS improvement.

Evidence: `/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/night-world-intensity-r1/`.
The detailed protocol, exact poses, runtime/build hashes and cleanup receipt
are in the adjacent `night-world-intensity-r1-results.md`.
Native report SHA256:
`2b1bf6fc12872bed5705b8c42c00d6273b3ef6b3f5d357afd1e60c6d352d9e43`.

The broad probe's obsolete `.55` window floor was corrected *after* capture.
It now checks the selected authored pane's masked `.225` emission, identity,
face and sightline. Twelve negative controls reject wrong/unlit/unmasked panes
even with an unrelated valid window present. This tool change was CPU-tested;
the broad native matrix was not rerun or retroactively claimed.

Integrated world lighting, night runtime, atmosphere-probe and exact original
Verdant selftests pass, along with the native TypeScript check. The source
checkpoint additionally passed focused inspector tests and changed-scope
quality/React Doctor checks. Exact geometry, instance/mask bytes and the existing
three-light/no-shadow pool are covered by tests; no new resource path is added.
The integrated public production build also passes (existing large-chunk
warnings remain).
