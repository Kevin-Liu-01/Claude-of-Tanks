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
Native acquisition remains pending and requires a separate approved capture.
