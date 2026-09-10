# Actual-control Canvas API diagnostic

Candidate tooling based on `82bc34ec4c970e147c2d5e9191a2966c7c829f67`.
No production runtime, texture arithmetic, context options or quality changes.
No native capture or performance improvement is claimed by this tooling change.

Append `--canvas-actions` to the maintained
`tools/garage-battle-actions-probe.mjs --url=<served-build> --out=<fresh-directory>`
command. The probe owns the ordinary FIFO and fresh browser; do not add an outer
capture lock. It rejects simultaneous `--profile-actions` or `--trace-actions`.
The existing report retains exact build-index and acquisition hashes and labels
this mode `canvas-api-attribution-only`. Functional/readiness gates are unchanged;
`canvasDiagnostics.complete` reports diagnostic coverage separately.

Each action installs transparent main-page Canvas2D prototype wrappers for
`getImageData`, `putImageData` and `drawImage`. Only the trusted target click opens
recording; readiness closes it. Finish, rearm and stop disable the owner and
restore full original descriptors only while still owning each wrapper. Foreign
replacements are preserved and failed restoration remains explicit.

`actions[].canvasActions` contains at most 1,024 scalar rows: method, page-clock
start/end, duration and whether the native call threw. Per-method counts, native
errors, total/max boundary time continue after the row cap. Drops, invalid timing,
logging errors, unavailable methods and incomplete actions prevent a complete
coverage claim. Zero calls with unavailable wrappers are not evidence of absence.
No arguments, receiver, result, error, image, canvas, pixels, URL or stack is
retained. Logging failures preserve the original return or thrown value, including
falsy thrown values. Disabled mode does not install Canvas wrappers.

Join raw page-clock intervals with callback gaps and LongTask/LoAF observations;
use interval unions, not nested-duration sums. Measurements include synchronous
API-boundary work and observer overhead, not GPU hardware duration. A long call
does not distinguish decoding, raster flush, driver wait or argument conversion.
The observer cannot name the texture owner or cover worker realms, cached native
method references, other Canvas methods or WebGL uploads. The existing native
context/readback-hint experiment remains rejected; this option changes no hints.

CPU validation through one ordinary FIFO admission passed: syntax checks for the
probe/helper/selftest, the existing `garage-action-timing.selftest.mjs` including
the new fake-native lifecycle/exception cases, and strict metrics on all three
changed JavaScript files (186 functions; zero complexity/type violations).
Native acquisition was pending at that CPU checkpoint; the subsequent approved
capture is recorded below.

## Native acquisition on the opaque-loading candidate

`opaque-paint-canvas-local-r1` subsequently exercised the unchanged public
`e7735a2ff` runtime on native Chrome 151 / ANGLE Metal Apple M5 Max. All actual
Battle, rematch and Garage controls, audio, warm/source readiness and cleanup
checks pass. All three Canvas observation windows are complete, without drops,
invalid timing, observation/native errors or failed descriptor restoration.
The acquisition is diagnostic-only and does not supersede the unprofiled gate.

The largest first-Battle callback interval is 2655.7–2803.8 ms (148.1 ms), with
a 112 ms Long Task at 2655.6–2767.6 ms and a 117 ms LoAF with no script rows.
No observed Canvas call intersects that callback interval. Its first-action
52 `getImageData` calls total 142.4 ms across the entire action, with maximum
18.6 ms; those aggregate costs cannot explain this separate 112 ms task.
The rematch's 66.7 ms worst callback also overlaps no observed Canvas call.
The Garage's 48.7 ms worst callback overlaps only 0.3 ms of `drawImage` calls.

This rules out these intercepted API calls as the overlapping owner in this
capture, not all rasterization, WebGL, worker or browser work. No source owner or
cause is assigned to the historical 214–319 ms stalls. The previously rejected
readback-hint experiment stays rejected; no pixel arithmetic, context option,
graphics setting or quality threshold has changed.

Report SHA256: `956f88d4b734dcccf5325a9e7a8b8e8005b92a1302199b4d9108c2adb6921e1f`.
HTML SHA256: `1b02dba11b8eb706f9fb0a198b47b9c39bc010015c9f44bce86816da5c2dd98a`.
Acquisition SHA256: `0c1ae77bb2d11603fc11e0416a4628ab9979229d32e7be6f9d7ee9396679052c`.
Evidence is under `/private/tmp/cot-interactive-baseline.gsRCvU/`.

The sampler is not the 112 ms owner in this capture. Its callback-start maximum
is 148.1 ms; its legacy end-of-sample-to-next-start maximum is 148.0 ms. These
maxima identify the same interval because every other retained callback gap is
at most 77.0 ms, with no dropped gap rows. The starting sample's synchronous
`state()` work therefore costs approximately 0.1 ms, at page-clock precision.
That includes its `getClientRects`/computed-style observations, not other rAF or
PerformanceObserver callbacks or subsequent browser work. LoAF's
`scriptsFiltered=0` also confirms that the tool did not remove a browser-supplied
script entry for this gap.
