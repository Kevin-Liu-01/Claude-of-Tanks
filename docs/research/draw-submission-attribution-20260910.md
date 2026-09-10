# Gameplay draw-submission attribution, September 10

## Bounded diagnostic, not a speed certificate

The existing 923-draw peak lacked object/pass identities. An opt-in
`perfprobe --draw-attribution` mode now observes actual
`renderer.info.render.calls` deltas around `renderBufferDirect`, including
zero-call and multiple-call entries. It preserves the original receiver,
arguments, return/throw behavior and method descriptor. Identity storage is
capped at 4,096; dropped identities, accounting mismatches, observer errors
or failed cleanup invalidate coverage. Normal runtime and uninstrumented
probes do not install it. Instrumented runs explicitly refuse performance
certification and cannot update the performance trend baseline.

The observer uses the sampler's existing admitted callback cohort, including
zero-submission callbacks. Pre-window and terminal pending submissions are
separately discarded rather than silently changing the sampling interval.
Camera identity distinguishes all four CSM cascades; scene identity also
distinguishes the retained late-effects view from the main scene.

## Native acquisition

Evidence: `/private/tmp/cot-interactive-baseline.gsRCvU/`
`gameplay-draw-attribution-r1.json`, SHA256
`78ea138cb73ce692e1eaa735fae3cbf2f192ae951c92880a8503de45c9d6cb8f`.
Acquisition hash:
`3dba94d3e2e779cb4ff799c03016a2c4d2fb91f898d0db07af5c64bdde33ada5`.
Public-build HTML hash:
`033468500976fabefeb700774b2fe2c17271d11445a2b4e2babf37e74e78a216`.
The checkout was `b2aaac31b` with only diagnostic tooling changes; runtime
source hashes matched at both ends. The build hash is recorded separately,
not inferred from the checkout revision.

Chrome151, native ANGLE Metal Apple M5 Max, Verdant, high quality,
1280×720, DPR1, scale1 and trim0. Sixty seconds after control release;
the same pinned fourteen-tank roster, movement, firing and camera-input
protocol used by the preceding qualification packet. No graphics or shadow
cadence setting was reduced.

- 7,070 admitted callbacks; all 2,592,618 counted submissions reconciled.
- 903 identities, zero drops, zero mismatched frames and zero observer errors.
- 2,604,767 observed entries include 12,149 zero-call entries.
- Median/peak draws: 746/810. Peak at 37,775.8 ms: 810 actual calls from
  811 entries, including one zero-call entry.
- The peak includes 136 vehicle-shadow calls and 252 vehicle-color calls.
  Vegetation contributes 56 shadow and 61 color calls. This identifies a
  concrete batching candidate; it does not prove the earlier peak's cause.
- Terminal pending work excludes 788 calls from 789 entries. Original
  wrapper ownership is restored; cleanup errors are empty.

This run did **not** reproduce the historical 923-draw peak. Its strict
budget still fails (median59.9 FPS, p99 25.3 ms), and diagnostic overhead
independently refuses speed certification. The process exits1 accordingly.
Do not use these numbers as an uninstrumented before/after speed comparison.

## Articulated vehicle-shadow batching

The candidate preserves the original hull/turret/gun proxy vertices, materials,
owning rigs and all four moving shadow cascades. Compatible two- or three-proxy
vehicles use one `BatchedMesh` submission per eligible cascade. Unsupported
inputs retain the original path; late mirrored transforms use an original-object
draw over the already-uploaded packed geometry range. Browsers without
`WEBGL_multi_draw` retain the original number of native submissions, not an
assumed saving. No shadow cadence, resolution, model detail or simulation
setting changes.

Focused CPU checks cover immutable geometry, independent cascade culling,
articulation, hidden and mirrored parts, atomic admission and disposal. Real
factory checks cover an articulated M1A2 and fixed-casemate Jagdpanzer, including
movement, distant detail, wreck presentation and Garage reset. These and full
typecheck pass after the mirrored-range fix. The registry discovers 950 checks;
that is not a claim that all 950 were rerun for this render-only slice.

### Native first-run failure and corrected contract

`articulated-shadow-native-r1/report.json` is retained as a **failure**, not
overwritten. Five ordinary poses produced byte-identical composed PCF images,
but the mirrored gun lost 418 shadow-coverage pixels across four light cameras.
That was a real bug: its noncasting source geometry had never been uploaded
through `WebGLObjects.update`. The fallback now uses the already-uploaded exact
packed range while retaining the original object's winding and model-view.

The first diagnostic also compared packed RGBA shadow-color attachments
bit-for-bit. All twenty non-mirrored attachments had identical clear/nonclear
coverage; their maximum decoded depth difference was `2^-23`. Large byte
differences were packing carries, not missing surfaces. Pinned Three r185's
`WebGLLights`, `WebGLShadowMap` and PCF shader sample the native comparison depth
texture, **not** this RGBA attachment. Consequently native-v2 requires exact
composed PCF pixels and exact per-camera coverage, retaining packed-color and
decoded-depth differences diagnostically without inventing a tolerance. This
does not establish bit identity of the native depth texture, nor universal
image parity outside the exercised poses and cameras.

### Corrected native acquisition

`articulated-shadow-native-r2/report.json` passes native-v2, SHA256
`d21e78b85f796b388f4fdb0599f49904649f1dcd84a426b813ad554c69a50875`.
Chrome151 / native ANGLE Metal Apple M5 Max / Three185, with
`WEBGL_multi_draw` actually available. All six poses (initial, yaw/pitch,
translated, hidden gun, mirrored gun and reset) have **zero** composed-pixel
differences and **zero** coverage-mask differences in all four shadow cameras.
Same-owner reset additionally restores every raw RGBA byte exactly. Deliberately
missing and stale guns both fail the rendered-image and coverage gates.

Normal reference/candidate total submissions are 13/5, including the common
ground draw: vehicle shadows fall from twelve to four. Hidden-gun totals are
9/5; the mirrored fallback is 13/9. The latter now preserves every pixel.
Packed-color diagnostic depth differences remain at most `2^-23`. All source
hashes stay fixed through acquisition; 70 raw images are retained and all
browser/server/fixture/lock cleanup checks pass. The native fixture canvas was
visually inspected. This is an exact exercised-image and submission result,
not an FPS result or a native test of hardware without multi-draw support.

### Uninstrumented full-game result: draw budget passes, timing still fails

`articulated-shadow-gameplay-unprofiled-r1.json`, SHA256
`92adff7970c1169cc5006390349e164ef8bab278de44209c2b4e7c635b75e195`,
captures the clean `5f7cbfe20` candidate and public HTML hash
`e13c8cc769c5de382c33e5bc343407a9173f721a81f5155e9da464e522fc123d`.
It uses the same sixty-second early-control-release Verdant protocol, pinned
fourteen-tank roster, native Chrome151, high quality, 1280×720/DPR1/scale1/trim0,
movement, firing and camera input as the earlier uninstrumented baseline.
Source hashes remain unchanged. All 3,601 submitted-frame intervals retain the
four-cascade mask15; there are no console errors.

| Metric | Earlier uninstrumented baseline | Candidate |
| --- | ---: | ---: |
| Draw calls, median / worst | 772 / 923 | 770 / 872 |
| Frame time, median / p95 / p99 (ms) | 16.7 / 17.8 / 24.9 | 16.7 / 18.4 / 25.3 |
| FPS, median | 59.9 | 59.9 |
| Scene texture estimate (MB) | 166.9 | 166.9 |

The worst-draw budget now passes, but the unchanged strict timing limits still
fail (`59.9 < 60` median FPS and `25.3 > 25` ms p99). Preserve the overall
**FAIL** and exit1; this is not a frame-time improvement or a perfect-performance
certificate. The exact native fixture isolates the batching mechanism; full
battle trajectories and scheduling vary, so these single-run draw differences
are not an isolated causal estimate. The candidate heap endpoint fell, but no
matched pre/post-GC baseline exists to certify absence of leaks. No repeated
acquisitions were made to search for a passing timing result.

Historical untraced 214–319 ms stalls remain unproven.

### Context-restoration integration

Lifecycle review found an existing recovery omission: Three reconstructs its
`shadowMap` on WebGL context restoration, discarding the wrapper that exposes
layer29 during shadow traversal. The renderer restore listener now reinstalls
that idempotent adapter synchronously before application recovery can draw.
This repairs recovery for original proxies as well as their new batches.
The actual listener regression exercises replacement owners, ordering,
idempotence, subsequent losses and exception-safe camera-mask restoration.
No normal-frame or shadow-cadence behavior changes.

Existing covered deployment and depth-program warm renders reach the batch.
GPU suspension deliberately preserves its control textures and copied CPU
geometry; final disposal remains traversal-safe. The pre-existing caster
cohort selector omits layer29, so those proxies stay enabled during warm
cohorts rather than being bounded by that selector. This is not missing
first-use coverage, but the current change does not claim to improve that
separate loading-pacing behavior.
