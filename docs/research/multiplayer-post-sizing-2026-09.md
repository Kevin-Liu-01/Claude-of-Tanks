# Multiplayer post sizing: redundant work reduction and native comparison

## Evidence scope

Two retained native captures use identical immutable public bytes identifying
`v1.0.0+g199f4485d.dirty`. Neither capture includes the proposed sizing change.
Both use the same immediate-Start Winter private-room acquisition: fresh,
cache-disabled host/guest contexts, clear/day, High, render scale 1, local
loopback signaling, native background scheduling and timing-only observation.

- Initial release report: `/private/tmp/cot-props-loading-release-native-20260908-r1/report.json`
- Dedicated sizing baseline: `/private/tmp/cot-post-sizing-baseline-native-20260908-r1/report.json`
- Index SHA-256: `3289b34df00c77ca6b5f9a673034e44f182d114d6f1a6bb0c82abe33df7eb447`
- Complete dist SHA-256: `cbf3582d6683b868b8a961123d39c47bb9566116612cd1abd0ee197cf53ab12e`
- Acquisition SHA-256: `e29cccbf956c17212e676dcf49a84ebbafee2105ec5bb15efd86f574416751c2`
- Release report SHA-256: `480094d459cafea605094d44b3577e3af8b541494622774f5c464fd0f8db65fa`
- Sizing-baseline report SHA-256: `252af5a926f4ed988fe8167e0839a6a43dc2afc5ecaf173b088116b4b456bf1b`

Intervals below are milliseconds on each page's own `performance.now()` clock.
Do not align host and guest absolute timestamps. `frames` measures observer rAF
callbacks, not presentation/photons; renderer-frame counters include offscreen
submissions. `longTasks` has no stack attribution. Stage/preparation intervals
are elapsed lifetimes, including awaits; overlapping durations must not be added.

## Initial release interval attribution

Host launch is 15543.8; guest launch is 6226.6. Exact report fields distinguish
directly timed work from a task merely overlapping a named entry stage.

| Peer / interval | Recorded evidence | Supported conclusion |
|---|---|---|
| Host 20956.6–21171.8 | 215.2 ms rAF gap; 205 ms task at 20965.2; entirely `revealSlices.finalShadows`; `shadowPrime.maxMs=206`; seven new programs | One actual cascade render is expensive; specific shaders/driver operations are not identified. |
| Guest 11386.6–11548.6 | 162.0 ms gap; 152 ms task at 11395.2; final shadows; maximum cascade 152 ms; four new programs | Same cost family, not a cross-peer shared timestamp. |
| Host 20491.3–20590.3 | 99 ms task inside `preparationSlices.compile`, after masks completed; `programCompile.maxUniformMs=98.9` | Strong reflection candidate; this timer includes `getUniforms()` and `getAttributes()`, without an individual program timestamp. |
| Guest 11654.9–11818.9 | 164 ms task crosses into watchdog; its directly timed `renderer.render` takes 161.3 ms | Watchdog render is expensive, without new programs during that render. |
| Guest 12122.3–12274.3 | 152 ms task during `loaderFade`; five additional programs; `primeReveal` ended at 12118 | Late program creation is observed; no recorded pass/stack proves its cause. |
| Guest 7887.8–8101.1 | 213.3 ms rAF gap during world build; overlapping tasks of 66, 63 and 50 ms; no render/program increment | Multiple construction tasks can precede the next callback; not evidence of one 213 ms builder. |

Host roster contains 132/118 ms tasks; guest roster contains 86/98 ms tasks.
Absolute per-prop-slice timestamps are absent, so named CPU builder attribution
cannot be mapped onto these native tasks by proximity alone. World progress-label
timings include pacing and pre-join lifetime: `heightField=2006` is not a measured
two-second synchronous heightfield call.

The guest's 1151.3 ms scene-compile lifetime contains no 50 ms long task, yet its
receipt ends with `uniformPending=136`, `uniformCount=0`. Deferred first use is
a hypothesis, not proof of the cause of a later render. Post-hidden countdown
onset also includes host/guest tasks of 87/96 ms without program growth.

## Readback is not one synchronous stall

`blackCheck.measurements.renderMs` directly brackets `renderer.render`:
125.8/161.3 ms host/guest in the release capture. Its `readbackMs` is 252.3/259.9 ms,
but `enqueueMs` is 0.2 ms and most elapsed time is awaited fence polling
(`waitMs=252.1/259.7`). Measured `readPixels` time is zero at timer precision.
These receipts do not support a claim that `readPixels` blocked for 250 ms.
Panel-mask readback and compilation also overlap; their elapsed times are not
independent CPU costs. No CPU source profile or GPU execution trace was captured.

## Dedicated unchanged-build baseline

| Metric, host / guest | Release capture | Sizing baseline |
|---|---:|---:|
| Start → own loader hidden | 6432.7 / 6173.7 ms | 3414.6 / 4593.0 ms |
| Network-entry owner total | 6386 / 6422 ms | 4547 / 4531 ms |
| Largest observed rAF gap | 215.2 / 213.3 ms | 245.9 / 229.9 ms |
| Maximum cascade render | 206 / 152 ms | 241 / 119 ms |
| Watchdog render | 125.8 / 161.3 ms | 42.1 / 93.0 ms |
| Pending uniform reflection at compile end | 0 / 136 | 0 / 0 |

Sizing-baseline host gap 10657.0–10902.9 contains the 241 ms final-shadow task
at 10661.3. Guest maximum gap 5426.8–5656.7 is in roster, with a 192 ms task
at 5464.3. Host task 10387.2–10530.2 overlaps both panel-mask preparation and
scene compilation; its `maxUniformMs=1.2` does not explain that 143 ms task.
The large variation on unchanged bytes is not a candidate improvement or proof
of a code regression. Network owner totals include the peer-ready barrier and
are distinct from each client's own loader-hidden boundary.

Both captures retained unchanged build/acquisition identities, zero observer
drops, foreground-observed 5→1, primed nonblack reveal without rescue, and native
room cleanup. The sizing baseline's 5→rollout spans are 4955.6/4855.0 ms.
Reports confirm browser, preview, signaling and FIFO cleanup, with zero rooms.

## Candidate mechanism and deterministic verification

The proposed `post.ts` change avoids redundant full composer sizing traversals
when effective dimensions, ratio and pass-sizing inputs are unchanged. It also
avoids repeating the traversal already performed by a pixel-ratio update when
CSS size is unchanged. Expected benefit is less repeated sizing/history/target
work, not fewer pixels, lower quality, different AA or a bypassed reveal gate.
Real size/ratio/quality/context changes and failed-sizing retries must still run.
Neither native report measures sizing-call counts; neither proves redundant
sizing caused its long tasks or any historical gameplay/transition pause.

The pinned Three.js `EffectComposer.setPixelRatio()` already invokes its public
`setSize()`. The old unconditional pair traverses the pass chain twice, including
at unchanged dimensions. The GTAO sizing wrapper reseeds temporal history and
`LateFxPass.setSize()` invalidates its preparation flag on each traversal. The
candidate records a successful sizing transaction, not a GPU-residency promise:

- Unchanged viewport/effective raster: zero full-chain sizing traversals.
- CSS-only or ratio-only change: one traversal; both together: two, using the
  public composer API and its existing intermediate-size behavior.
- First use, AO/bloom sizing, MSAA or renewed renderer lifetime: replay sizing.
- Exceptions: invalidate before work and publish only after all setters finish,
  so a partial failure cannot suppress its retry.
- Phase/preset/governor resets still reseed AO independently of physical sizing.
- Native output size, inverse pixel size, and diagnostics remain updated even
  when a capped internal raster can be reused.

`postViewportScale.selftest.mjs` executes the production sizing/reset source
against the actual pinned composer, render targets, GTAO, bloom, scene-AA and
LateFX classes. Only renderer/GPU ports are simulated. The original two-call
path remains a negative control. Tests cover startup, DPR floors and retained
adaptive evidence, mobile/capped raster, actual pass target dimensions, context
replacement, quality/phase resets, native output, and failed-transaction retry.
All test-owned disposable targets and passes are released. This is deterministic
CPU behavior evidence, not native rendering or pixel equivalence.

Independent source review found no external production composer-size writer;
Studio capture restores the renderer and then calls the post owner. The pinned
renderer renews `renderer.info` on WebGL restoration, and viewport recovery
reapplies post sizing. An explicit scene-AA sample override disposes its own
storage and is not treated as proof that GPU storage is resident.

Typecheck, production build and the strict runtime complexity gate pass. The
equal four-runtime-file React Doctor population remains 90/90 with the same
five warnings. The separate changed-files scan is not clean: it flags the
expanded test's `new Function` source fixture (`no-eval`, score 49). That fixture
executes fixed repository source in a Node self-test, not external input or
browser runtime code; the pattern also existed before this change. No scanner
suppression was added. All 18 selected related renderer, quality, viewport,
warm/reveal, entry-lifecycle, network-presentation and probe tests pass through
the serialized self-test runner.

## Candidate results

The candidate changes only runtime `src/engine/post.ts` relative to `199f4485d`;
its expanded test and these research notes do not affect public rendering.
Retained report: `/private/tmp/cot-post-sizing-candidate-native-20260908-r1/report.json`.

- Build stamp: `v1.0.0+g199f4485d.dirty` (distinguished from baseline by hashes).
- Index SHA-256: `8b599f3d5250d2f5d269907caaf2871976b96b8446b49c5b2c9fbaa4da892bd8`.
- Complete dist SHA-256: `af5054b1b00db7e2b50b3ed896b4e8b09e38e6f20d65d121ffb958813c2012b0`.
- Acquisition SHA-256: `e29cccbf956c17212e676dcf49a84ebbafee2105ec5bb15efd86f574416751c2`
  (identical to both baseline captures).
- Report SHA-256: `2880efeb41c063625d8d33104cb2547dadb264acdd4f24fb55b7860c04e022ef`.

| Metric, host / guest | Sizing baseline | Candidate |
|---|---:|---:|
| Start → own loader hidden | 3414.6 / 4593.0 ms | 3591.3 / 4053.2 ms |
| Network-entry owner total | 4547 / 4531 ms | 4015 / 4174 ms |
| Largest observed rAF gap | 245.9 / 229.9 ms | 246.9 / 188.5 ms |
| Maximum cascade render | 241 / 119 ms | 241 / 106 ms |
| Watchdog render | 42.1 / 93.0 ms | 105.1 / 76.3 ms |
| Pending uniform reflection at compile end | 0 / 0 | 0 / 0 |

The guest enters earlier in this pair, while the host's own loader is later;
the unchanged-build variation above is larger than either delta. Therefore this
comparison establishes functional compatibility, not a repeatable end-to-end
speedup. The source-executed negative control proves redundant sizing work was
removed. It does not prove that work caused the expensive shadow renders.

Both candidate clients observe the full foreground 5→1 countdown, spanning
4962.9/4862.8 ms from 5 to rollout. Both have primed reveal and hidden loaders,
zero observer drops, and unchanged watchdog luminance 106.8589/137.7611 without
rescue or errors. Native exit/room-close succeeds; zero owned rooms remain, and
browser, preview, signaling and FIFO ownership are closed/released. Immutable
build and acquisition identities are unchanged across the capture.

Remaining pauses are explicit: a 240 ms host task at 12860.5 overlaps the final
shadow phase, whose maximum cascade remains 241 ms; the guest has a 187 ms task
at 6914.0. This does not resolve the historical 214–319 ms gameplay-stall cause.
The evidence remains local-loopback, two renderers on one machine—not a
production-network, separate-device, hardware-GPU, screenshot-equivalence or
hitch-free certification. The change keeps quality, shaders, geometry, pass
order, authority and reveal/countdown/cleanup gates intact.
