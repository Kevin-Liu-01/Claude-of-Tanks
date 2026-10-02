# Shadow and cloud artifact repair — September 29, 2026

The supplied screenshots show two separate artifacts: long striped contact
shadows beneath tracks/on terrain, and rectangular steps around cloud edges.
Ambient occlusion remains disabled. Native cascaded cast shadows remain enabled.

## Contact shadows

The original twelve jittered samples covered a world-space distance which could
project to hundreds of pixels near the camera. Those widely separated samples
left repeated track silhouettes and a noisy striped pattern. Removing only the
contact pass removed the artifact while keeping the native cast shadows.

The contact pass now bounds each ray to eight screen pixels, solves that bound
under perspective, and distributes the same twelve samples in projected space.
A stable half-step phase replaces per-pixel jitter. Near-plane clipping is
explicit. The focused regression independently projects 560 rays across four
viewport shapes, four fields of view, five depths and seven light directions;
the maximum sample gap is 1.056 pixels. A negative control demonstrates why a
linear world-length approximation is insufficient.

No extra pass, texture, sample, or shadow-map resolution is introduced. Two
projected vectors replace the twelve repeated matrix transforms in the loop.

## Cloud history

The history-clamp neighborhood used integer low-resolution texel centers.
Every output pixel in one four-by-four history tile therefore shared abrupt
clamp bounds. The neighborhood now follows the exact reprojected position with
continuous bilinear samples. Trace resolution, ray-march count, history targets
and the nine resolve texture calls remain unchanged.

A paired native-GPU regression measures 264 artificial flat steps out of 352
in the old resolve and zero in the new resolve. Uniform-history cases stay
stable for 512 frames. An isolated 800×500 resolve benchmark measured medians
of 0.170 ms before and 0.184 ms after, with noisy individual batches. This is
not evidence of strictly zero GPU cost or a whole-game performance guarantee.

## Cloud underside stability

A second native Polders audit isolated a smaller moving checker pattern to the
vertical column-light estimate. Its two sample heights changed with every trace
refresh. They now keep their existing positions and weights stable; the sun
march, view march, targets and sample counts are unchanged. A production-shader
regression checks constant and sloped density columns and requires the previous
jittered version to fail phase invariance.

Equal-frame stationary captures reduce temporal RMS from 0.430 to 0.207 byte
levels; panning captures also lose the obvious checker pattern. Isolated native
trace medians were 0.928 ms before and 0.868 ms after, with overlapping noisy
samples. This supports keeping the existing performance budget, not a promised
frame-rate gain. Against a diagnostic 64-tap column integral, the stable two-tap
approximation reduces global brightness bias but slightly increases spatial
error; some localized smooth dark patches remain. Broad cloud layering survives
the dense reference and is retained as part of the authored cloud form.

## Recovery and verification

WebGL restoration preserves JavaScript depth-texture objects but loses their
GPU contents. A same-size quality recovery could consequently accept stale
far-cascade readiness and perform only a partial warmup. Restoration now
releases all old shadow targets and invalidates dormancy/priming before the
covered rebuild. This addresses a demonstrated recovery gap; it does not prove
that every reported intermittent missing shadow had that cause.

The recovery probe also found stale disposal listeners deleting old-context
textures, framebuffers, buffers and vertex arrays against the restored context.
Resource creation now records context generation. Deletion skips only known
objects from a lost generation, which the browser has already destroyed;
current and unknown handles retain native validation. Eleven resource families
are covered, with no drawing wrapper or per-frame polling. The attributed
lifecycle probe passes 39 stages, including two forced resets, all four restored
shadow cascades, quality changes and a cached garage return, with zero unexpected
GL errors.

The shadow audit also had a false-green risk: reading a discarded default
framebuffer after an animation-frame wait could compare zeros. It now renders
and reads in the same task, requires visible scene detail, and requires a
measurable difference when native shadows are removed. Composition checks
record the actual AO-off state rather than claiming to validate enabled AO.

Local evidence lives in `.qa-dev/shadow-cloud-r2/`: garage and real-battle
captures, paired cloud history, isolated timings, actual context-loss recovery,
quality switching, cached garage return, and the rendered motion audit.
The repaired standalone audit passes Ultra, High, Medium and Low: every preset
has real shadow coverage, zero frozen-frame changes and no GL errors. Its live
drive sampled 417 frames with 16.7 ms median and 17.5 ms 95th-percentile frame
time on the test machine. These are local measurements, not device-wide claims.

## Cloud silhouettes — October 2, 2026

The repeated cylindrical clouds came from broad, circular plateau footprints
combined with upright lower columns. Fine erosion softened their edges without
changing the underlying outline. The weather bake now varies each lobe's
orientation, aspect ratio, radius, shoulder and position, then warps the field
with periodic noise. The same mesoscale grouping and histogram equalization
preserve the authored weather-coverage setting and mesoscale clearings. This
stays deterministic and is baked in the existing worker, with no new texture
or render target. Cached cell attributes avoid repeating hashes and rotations
for every pixel of that bake. Wind-aligned rows retain their prevailing
direction but use different cloud populations and spacing instead of a
repeated fourteen-cell cadence.

Wind shear now starts above the condensation base rather than only in the top
third. Cumulus tapers earlier, while storm towers retain their deeper profile.
The existing curl sample also distorts the larger billows. Their density and
height vary through the body so they remain distinct within a weather mass;
the edge noise is stretched along the wind to form trailing wisps. The base remains relatively
flat, and stratiform clouds receive less distortion. The march limits, temporal
history, texture dimensions and lighting passes remain unchanged. Moving the
curl lookup earlier can sample it at points previously rejected before edge
erosion, so unchanged maximum sample counts do not imply zero GPU cost.

Research references:

- [WMO Cumulus humilis](https://cloudatlas.wmo.int/en/clouds-species-humilis.html):
  shallow vertical development; flattened shapes are plausible.
- [WMO Fractus](https://cloudatlas.wmo.int/en/clouds-species-fractus.html):
  irregular, ragged fragments in cumulus and stratus.
- [NOAA cloud development](https://www.weather.gov/source/zhu/ZHU_Training_Page/clouds/cloud_development/clouds.htm):
  condensation bases and the different development of shallow and tall cumulus.
- [Guerrilla's real-time volumetric cloudscapes](https://www.guerrilla-games.com/read/the-real-time-volumetric-cloudscapes-of-horizon-zero-dawn):
  broad weather coverage, volumetric shape and finer erosion are separate controls.

Noise regression checks cover reproducibility, wrapped seams, coverage
histograms, wind-aligned streets, the map preset table and history behavior.
The baked-cloud fallback remains unchanged. Native visual evidence is acquired
separately from these numerical checks.


Final native comparison: eight 1440 × 900 captures cover Verdant Fields and
Steinburg, with matched horizon and underside cameras before/after, seed 2
(day), source-default High quality and fixed cloud drift. The final images
show narrower, unequal cumulus lobes, broken/ragged edges and less repetitive
spacing; Steinburg retains its broader stratiform deck. All eight captures
reported no browser errors. Local evidence is in
`.qa-dev/cloud-shape-audit-r2/` (`report.json`, source hashes and PNGs).
The first visual pass was rejected because its larger cumulus still looked too
solid and its urban camera was obstructed; the final pass fixes both.

Median cloud GPU times (before → after): Verdant horizon 1.658 → 1.809 ms,
Verdant underside 1.496 → 2.146 ms; Steinburg horizon 1.533 → 1.504 ms,
Steinburg underside 1.148 → 1.281 ms. Frame medians remained 16.55–16.8 ms.
These are local diagnostic samples, not a performance certification: adaptive
resolution and independently generated bot rosters were not held constant.
The cloud selftest, baked-sky fallback selftest, typecheck and private build
passed. No assertion thresholds were relaxed; deterministic texture hashes
were refreshed for the intentionally changed fields.
