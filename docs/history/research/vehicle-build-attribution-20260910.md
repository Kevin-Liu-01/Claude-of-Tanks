# Vehicle construction: bounded stage attribution

The live `f6622924a` control acquisition passed the functional/readiness gates,
but retained pre-warm countdown gaps of 50–71 ms. They precede the exact hidden
shader intervals; the hidden-readiness fix does not explain or fix those gaps.
Earlier local build timestamps implicated individual first construction steps,
without separating material generation, authored geometry, merging and assembly.

The existing bounded visual-load receipt now records raw build start/end,
first and maximum synchronous iterator-step elapsed time, the first maximum's
zero-based index and endpoints. It includes terminal/throwing `next()` calls,
but excludes waits and iterator close. The adapter caches `next`, preserves its
receiver/result identity, and preserves zero-argument IteratorClose and original
error precedence. It adds no scheduling checkpoint or awaited hop.

The factory additionally stamps eight scalar fields before its existing first
yield. These delimit materials, authored construction, binding/merge and the
remaining assembly. An explicit setup remainder accounts for time before
materials and between materials and authored construction. They are elapsed
intervals, not isolated CPU measurements. The streamer only copies finite
receipts inside its current build span; older pooled receipts are excluded.
No geometry, material policy, ownership, build ordering or first-yield boundary
changes. The first step remains atomic because earlier cancellation would need
an explicit partial-construction resource owner.

## Qualification

Five isolated focused selftests passed: `battleVisualStreamer`,
`rosterVisualStaging`, `soloBattleDeploymentRuntime`, `tankFactoryCore` and
`tankFactoryStaging`. Staging retained 3,795 checks across six immutable
geometry/material/order fixtures. The final held-wait and core-accounting rerun
passed, and native TypeScript `--noEmit` exited 0. All four integrated source
hashes match that qualification. Independent integrated review found no blocker.
No new complexity violations were introduced; the six inherited factory
violations were not increased. This is not a full-fleet release certification.

Qualification log:
`/private/tmp/cot-visual-step-qualification.rs9qbg/qualification.log`, SHA-256
`8dd24afa32ddcee7f2a5c15f90d724cca50a1136fb9550d901f1220c5e05b228`.
Patch SHA-256:
`a0ff221ca50d78b4e9ad4afbeefa6222611bb03d314472bb07d30131abd53bd8`.

Native acquisition of these new fields is pending. Instrumentation itself is
not a frame-time improvement and does not establish the cause of the historical
214–319 ms stalls. Its own small clock/receipt overhead is included.

Combined root verification passed streamer/factory/Source/sourced-texture
selftests, the extended native-lease runner contract, typecheck and public build
(`build-attribution-source-sharing-build-r3.log` in the interactive receipt
directory). React Doctor's changed tracked-code scan returned 84/100 with four
warnings, all serial awaits in this streamer's test fixtures. Those awaits
intentionally exercise iterator suspension, error precedence and independent
fake-clock scenarios; parallelizing them would invalidate the contracts. No
runtime warning or suppression was added. This eight-file scan is not comparable
to earlier scans with different scope and is not a full-repository clean bill.
