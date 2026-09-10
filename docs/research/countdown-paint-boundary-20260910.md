# Countdown preparation paint boundary

## Evidence and change

On production `6410962de`, `texture-preparation-production-controls-r1` records
an uncovered rematch countdown gap of 97.6 ms (98.0 ms by callback start/end).
The corresponding long animation frame contains a 47.2 ms main render callback
followed by 46.3 ms of deferred preparation in another animation callback,
both before style/layout. The retained visual timing overlaps T-62MV-1
construction. This is contemporary countdown evidence, not a causal trace of
the historical 214–319 ms gameplay stalls.

`deferredCombatWarmRuntime` now defaults to `nextPaintFrame` for both its first
wait and its six-millisecond budget yielder. The existing primitive crosses a
real animation callback and a following task, so preparation cannot resume in
that callback's pre-paint microtask checkpoint. It does not acknowledge physical
display or preempt a single construction/driver call. Global `nextFrame`, models,
quality, simulation, compiler work and readiness requirements are unchanged.

The visible-frame deadline is now the existing 1,000 ms rejection rather than
the old 34 ms successful timeout. Hidden/no-rAF hosts retain the bounded
fallback. Existing warm error reporting and generation-owned release handle
rejection. Tests cover production-default initial/batch scheduling, stale
generation resumption, successor ownership and visibility-handler cleanup.

## Verification

Six focused tests pass: deferred warm, frame scheduler, visual streamer, solo
deployment, combat warm coordinator and program warm. Typecheck/unused checks
and public build pass. Strict changed-runtime metrics have no complexity,
`any` or `unknown` violations. Independent review found no actionable ownership
regression. This is not a full-fleet `npm test` claim.

Changed-scope React Doctor is 92/100, unchanged from the prior scoped baseline.
Its two warnings are deliberate sequential microtask draining and isolated
global-host test cases; parallelizing those cases would invalidate the scheduling
test. No production warning or suppression was added.

First unprofiled public-build controls run:
`countdown-paint-local-controls-r1`, SHA-256
`880f406739c885ffd242cf05ac93aba1ef480bfd280392c48bd109afd45699a3`.
Build HTML SHA-256:
`f32ca1032c6fdaa9752d9426fb359260dd8ac426013d2d78fa3fecea7228df14`.
Functional, boot/audio-clock, source readiness and before-rollout warming pass;
errors and cleanup failures are empty. All three screenshots were inspected.
Battle / Again / Garage maximum callback gaps are 89.1 / 66.1 / 42.3 ms.
The worst Battle/Again gaps are under the opaque loader; no 70+ ms long frames
were recorded during the rematch action. Readiness is 6,495.9 / 5,556.1 /
323.4 ms respectively. Different acquisition conditions mean these observations
are not a controlled overall speedup against production.

The repeat, `countdown-paint-local-controls-r2`, also passes all four gates and
functional checks, with no console or cleanup failures. Report SHA-256:
`f6fdfe75eb2159897ae3b05a9587821f9749b6165185c81fe237cdb72fbc3802`.
Battle / Again / Garage maximum callback gaps are 108.3 / 70.5 / 42.6 ms;
readiness is 6,558.4 / 5,547.1 / 324.4 ms. These worst gaps remain covered by
loading UI. Neither acquisition records a long callback gap while the battle
countdown is uncovered. The probe stores thresholded gaps, so an empty list is
not a zero-millisecond maximum or a universal frame-budget guarantee. Both
rollouts pass deferred readiness; all three repeat screenshots were inspected.
The repeat's start-to-finish wall time includes waiting in the shared capture
FIFO and must not be interpreted as application load time.

## Rejected unrelated optimization

Static Garage track-instance spatial batching was checked against the actual
transferred matrices and canonical default frustum at 1280×577 and 1280×720.
The Burlak track was already culled; Abrams remained 186 submitted instances
and 34,596 triangles while its draws increased from one to eight. No runtime
code was retained. This analytic rejection is not a native visual gate.

The broader frame and resource failures recorded in
`source-texture-decode-20260910.md` remain open; this correction does not certify
all scenes or eliminate browser/OS scheduling limits.
