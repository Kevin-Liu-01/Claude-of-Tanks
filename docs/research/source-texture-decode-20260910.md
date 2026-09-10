# Source-image decode qualification — 2026-09-10

## Reproduced cost

The earlier world warm-up fix is independently qualified in
[garage-environment-reuse-20260910.md](garage-environment-reuse-20260910.md).
It did not remove every loading pause. The next acquisition uses the maintained
actual-controls probe with CPU profiling, boot/audio ownership, and warm/source
readiness gates, without changing graphics settings or adding diagnostic work to
the production frame loop.

`/private/tmp/cot-interactive-baseline.gsRCvU/texture-response-profile-r1/`
retains the production report and three raw per-action CPU profiles. Its root
HTML matches `v1.0.0+g486bf2c67` (SHA-256
`04f548bba94596b3badabb65c4ed902b775cb7991f33b9e148d28ee2fbac67db`).
Report SHA-256:
`f148ffe133cca8a3e9272371713ffaf5453c9826c0398f1121619137441eff09`.
Acquisition: Chrome 151.0.7922.47, high desktop, 1280×720/DPR 1, Urban,
2026-09-10 19:17:04–19:20:54 UTC, including FIFO admission time. All functional,
audio, readiness and cleanup gates pass. These are profiled observations, not a
throughput acceptance or an uncontended speedup measurement.

In `battle.cpuprofile`, two native `createImageBitmap` leaves beneath the
`terrain-CJTvV5JN.js` worker handler carry 35/21 samples and 43.895/26.464 ms
of summed sample weight. The stack resolves to `browserWorker` → `receive` →
`advance`/`finishActive` → `prepare` → `makeBitmap` → native conversion in
`sourcedTextureCompositionClient.ts`. Texture-pixel adoption has three samples
and 3.806 ms. The trace therefore identifies native bitmap creation, rather
than metadata validation or a large JavaScript pixel loop, as the next cost.
Sample weights are neither individual-call wall times nor proof of the native
implementation's internal decoding/copying stages.

| Profiled action | Opaque cover | Ready | Worst callback gap |
| --- | ---: | ---: | ---: |
| Battle | 4.5 ms | 10,322.3 ms | 172.6 ms |
| Battle Again | 159.7 ms | 6,036.4 ms | 78.2 ms |
| Return to Garage | 89.2 ms | 390.0 ms | 51.2 ms |

## Rejected early-decode candidate

Source image loading currently resolves at `onload`, which does not express
decoded-pixel readiness. The candidate requests asynchronous decoding and waits
for `HTMLImageElement.decode()` before resolving the existing shared image
promise. This API's readiness contract is documented by
[MDN](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/decode).
Whether this reduces later native conversion cost must be measured, not inferred
from that contract alone.

- Keep the original HTML image, URLs, composition options, pixel dimensions,
  texture bindings and color-space policy.
- Share one load/decode promise per source URL; do not allocate another bitmap
  cache or alter the existing bounded composite caches.
- Preserve authoring and unsupported-browser behavior. Decode rejection or a
  synchronous throw produces the existing URL-bearing source failure receipt;
  required images retain procedural fallback, optional images report fallback.
- Consumer cancellation remains independent of shared image preparation. No
  canceled application publishes a texture; source readiness follows real swaps.
- Keep worker serial ownership, transfer cleanup and deadlines unchanged.

Nine focused selftests and the public/localized build pass for this candidate.
Coverage includes full-byte composition parity, source preparation, worker
protocol/lifecycle, adoption/cache ownership, readiness, deployment, and the new
deferred decode/shared-consumer/failure cases. Typecheck/unused-code and strict
source metrics also pass; Doctor exits zero at 91 with six warnings. None of
those checks establish acceleration.

The local native comparison (`texture-decode-local-profile-r1`) still records
29/22 native bitmap samples, 36.352/27.632 ms summed sample weight. Its contiguous
bitmap sample bursts are 27.6/21.4/15.0 ms, versus 26.5/16.1/27.8 ms in the
production baseline. It passes all functional/readiness gates, but does not
establish that early decode solves the conversion bursts. The early-decode
runtime and its dedicated test additions were reverted before landing anything.
Report SHA-256:
`66195dd6309dde4cc8efb874c271793aa7536b1d46447e3cd1cccfc2ad7b38a8`.

## Per-image preparation boundary

The next candidate targets the observed batch directly. The worker client
reserves its active job, then awaits a paint opportunity before each used input
image's native bitmap conversion. It awaits that conversion before preparing
the next one. A worker reply therefore settles existing consumers without
immediately starting three native conversions in the same callback.

The optional test port is `yieldPreparation`; the browser uses the existing
`nextPaintFrame` scheduler with its bounded hidden-document behavior. Ownership,
completion and consumer presence are checked on both sides of the boundary.
Deadline/dispose still drains callers and closes late native results; an
abandoned active job cannot be overtaken during native conversion or a held
preparation turn. No source loader, protocol, pixel operation, cache, resolution,
or graphics-quality setting changes. This separates work rather than claiming
to make a native call preemptible or reduce its total CPU cost.

Ten focused selftests pass, including serial used-image conversion, held
preparation turns, abort/dispose/deadline during either boundary, same-key
replacement, late bitmap closure and scheduling failure. Public build passes.

### Failed profiled acquisition

`texture-preparation-local-profile-r1` did not finish its first Battle action.
The trusted boot gesture and native AudioContext construction completed
(186.9 ms); the hang occurred later, while the action's CPU profiler was active.
The 90-second action deadline expired, and the unresponsive renderer also
prevented ordinary diagnostic/cleanup calls from completing. Only this probe's
verified renderer/browser were terminated; its report records failure and the
incomplete profile, not a passing readiness receipt.

A one-second macOS sample is retained in
`texture-preparation-startup-hang.sample.txt`. All 801 main-thread samples end
in `_platform_strlen` below two nested signal-handler frames; `vDSP_fft_zrop`
is an interrupted ancestor, not the sampled leaf. This identifies a native
signal-handler hang during the profiled run, but does not establish that FFT,
AudioContext construction or bitmap preparation caused it. Do not count it as
native performance qualification or discard it when comparing later runs.

### Unprofiled actual controls

`texture-preparation-local-controls-r1` passes all four boot/audio/warm/source
gates, with empty errors, failures and cleanup errors. Battle, Battle Again and
Garage screenshots were inspected: day/night terrain, vehicles, HUD and the
returned Garage are present. The report SHA-256 is
`790b6461fe27ede85874173bb743fa29b846dd1b3629378f5b252309abf02980`;
served build HTML SHA-256 is
`5fe39dc9da32b12b99b41987653a63a599c888d5ae0bc2df7e5a947739732c82`.
This is the local public build at `486bf2c67` plus the preparation candidate,
not a deployed production commit.

| Unprofiled action | Opaque cover | Ready | Worst callback gap |
| --- | ---: | ---: | ---: |
| Battle | 4.4 ms | 7,195.5 ms | 109.8 ms |
| Battle Again | 130.4 ms | 5,596.7 ms | 97.6 ms |
| Return to Garage | 150.9 ms | 448.5 ms | 49.8 ms |

These remain measurable loading/transition pauses, not an all-frame smoothness
pass. The worst Battle and Again gaps occur while the opaque loader is present.
The success without profiling is compatible with a profiling-specific native
hang, but does not prove the cause of the failed acquisition.

Typecheck and unused-code checks pass. Strict metrics report zero complexity
violations and no explicit `any`/`unknown`; changed-code Doctor scores 92 with
five await-in-loop warnings. The runtime warning is intentional serialization
of native conversions; four selftest warnings cover ordered lifecycle scenarios
and microtask draining. No rule or budget was suppressed.

### Repeat profile and scope of the improvement

The identical profiled acquisition succeeds in
`texture-preparation-local-profile-r2`, with all four gates, complete three-action
profiles and empty errors/cleanup failures. Report SHA-256:
`32a8ab2d765dbc110a2292fdfe94462065ebd294d9069e6cc0d913342a31b4ff`.
The native bitmap samples now descend from the resumed asynchronous preparation
function, not the worker reply handler. The baseline's long-animation-frame
records attribute 26.1, 18.0 and 30.8 ms scripts to the matching
`Worker.onmessage`; no matching worker handler appears in the repeat's recorded
long frames. Absence from those records is not proof that every handler is free.

Candidate native bitmap sample weight totals 90.817 ms in eight contiguous
sample runs, compared with 70.359 ms in three baseline runs. Candidate sampling
is noisier: some deltas are 5–15 ms, and a 15.153 ms run consists of one sample.
Neither the difference nor these runs establish native CPU cost or individual
call duration. Profiled Battle readiness is 12,695.3 ms versus 10,322.3 ms in
the baseline; the worst callback gap is 169.2 versus 172.2 ms. Do not claim an
overall speedup from this acquisition. The qualified change is narrower:
explicit per-image scheduling, outside worker-reply callbacks, with verified
readiness, pixels, ownership and cancellation.

## Broader acceptance results

The 60-second native-cadence, full 7:7 roster camera test is retained as
`loading-closure-camera-r1.json` (SHA-256
`a2edc677e31bd33e42393f46f260e4a58fc458780274cf19542724ccd44b04e2`).
Median 59.9 fps, p5 40 fps and p99 25.9 ms fail the unchanged 60/45/25
thresholds. All 28 dispatched camera inputs are observed, but the final planned
input is dropped because its response window no longer fits; coverage is
incomplete. Certification is additionally refused for load above the existing
limit, two foreign headless-GPU processes, and interactive-browser GPU-process
CPU at 153% (not GPU utilization). No foreign process was closed and no budget
was relaxed. The source candidate cannot be blamed or certified from this
contended result.

The phase-resource gate also remains red:
`loading-closure-resources-r1.json` (SHA-256
`0d84425b0da1affe1bfa0f7a43a4013a503a15e7abaece64789a5ea96d831e92`).
There are no application, console or response errors. Nine caps fail:

- Garage submitted triangles: 309,447 idle / 313,093 returned, limit 240,000.
- Battle scene objects: 1,356 / 1,150.
- Battle renderer geometries: 741 / 680; textures: 319 / 316.
- Battle attached geometry/material/texture identities: 767/258/132 versus
  680/220/124; texture pixels: 28,914,944 / 27,000,000.

The submitted Garage triangles and attached battle identity/pixel counts match
the prior matched baseline. Attached scene totals include hidden children;
they are not exclusive draw attribution or proof of leaking resources. Idle
sleep, bounded caches, phase detachment, heap and cleanup checks pass. These
content-budget failures require their own evidence-backed optimization, not
deleting useful caches or labeling this gate green.

## Remaining acceptance scope

After the candidate is qualified, use the existing unprofiled actual-controls
probe, 60-second native-cadence camera-input battle probe, and phase-resource
gate. Do not replace them with microbenchmarks or relax their budgets.

Historical 214–319 ms gameplay stalls still lack a contemporaneous causal trace.
This work does not claim to explain those historical events, eliminate browser
or OS scheduling, or establish instantaneous physical display response.
