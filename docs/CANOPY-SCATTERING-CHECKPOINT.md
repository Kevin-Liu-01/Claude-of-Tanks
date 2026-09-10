# Canopy lighting — small accepted refinement

Matte foliage now mixes its existing directional diffuse wrap with a 30%
isotropic volume approximation: `0.70 * wrap + 0.075`. Both lobes integrate
to 0.5 over incidence `[-1, 1]`, so this redistributes light rather than adding
an emissive floor. Solid bark, microfacet irradiance, indirect lighting,
global lights, grading and shadow maps are unchanged. Near cards and far
canopy proxies share the response; both material cache keys advance.

This is **not the completed shrub-shape repair**. Native before/after review
finds slightly gentler Autumn contrast, with no obvious bleaching, new crown
gaps or near/far mismatch in the Verdant controls. The upright dark rear
sprays and existing blocky crown shapes remain. A separate thinner broadleaf
atlas experiment was rejected and is not included in this checkpoint.

## Verification

Evidence root:
`/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/`.

- `canopy-scattering-checks-r1.K9bKp8/report.json`: all 17 stages pass,
  including installed-shader energy/continuity tests, non-matte safeguards,
  geometry/resources, atlas padding, near/far contracts, map integration,
  TypeScript 7, strict changed-function metrics, Doctor (zero findings),
  diff check and production build. Existing build chunk-size warning remains.
- `canopy-backscatter-native-r1.0MnGVZ/native.json`: six matched originals,
  Autumn shrub and Verdant near/wide, native Apple M5 Max/Metal Chrome,
  1440x900/DPR1/High/trim0. Source/build stable, no errors, owned browsers and
  previews closed, shared capture lease released. Actual geometry, instance
  data, observed atlas pixels/storage and material policy are exact apart
  from the two approved cache-key changes. No new texture, geometry,
  material or instance owners; only the diffuse arithmetic changes.
  Actual foliage submissions remain 42 draws/frame in all three views.
- Fixed Autumn pixels illustrate the modest result: front `204/117/39` to
  `198/113/38`, rear `36/23/14` to `40/24/13`. These are not removal of the
  dark plane. Root and independent review accept only the small refinement.
- The earlier live AO diagnostic records GTAO disabled and zero executions
  across 30 normal frames. The old `aoExclude` flag is inert metadata, not
  evidence that active AO caused these dark leaves.

This is settled-art and bounded-resource evidence, not a GPU/FPS, physical
iPad, motion or full memory-plateau certificate. Autumn grass readiness is
about 33.5 seconds on both builds, exceeding the retained 20-second check;
that existing loading limitation is not relabeled a pass. No quality,
resolution or visibility reduction is used to obtain the comparison.

The separate-context 120-frame submission-wall samples are mixed, not a
no-regression certificate: median/p95 milliseconds are Autumn 2.1/3.1 to
2.2/2.5, Verdant near 3.1/3.7 to 3.0/3.3, and Verdant wide 4.2/4.5 to
4.1/5.0. The wide p95 increase remains recorded; cadence medians stay
16.6–16.7 ms. These are not GPU execution-time measurements.

Integration over `4b321885c` preserves all three tested source-file hashes.
`canopy-scattering-release-r1.QOYTqT/report.json` passes eight final checks:
lighting, resources, program keys, test registry, the upstream deployment
regression, full TS7, diff and production build. The intervening upstream
changes concern vehicles and covered allied deployment, not world shading.

Base revision: `063514d5168d590f8097cea5dff88e85720a0870`.
Tested candidate build index SHA-256:
`5d8d5b7a09a7e15fa194f944f6e37eff871af86c0a69b35de46380ae22ef645b`.
Water/contact and rail-coal repairs remain separate published checkpoints;
this change does not complete the broader map decoration/vegetation pass.
