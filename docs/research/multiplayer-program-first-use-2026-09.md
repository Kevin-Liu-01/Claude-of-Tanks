# Multiplayer selected-material first-use experiment

## Scope and evidence

This follows the corrected native profiles in
[the renderer attribution report](multiplayer-entry-render-attribution-2026-09.md).
Those profiles retain substantial inclusive weight under Three's lazy
`WebGLProgram.getUniforms` / `onFirstUse` / `WebGLUniforms` path. They do not
prove which native reflection query blocks, GPU execution duration, or the
cause of every historical frame stall.

The candidate enables first-use preparation only in the multiplayer covered
loading adapter. It does not alter graphics quality, authority, readiness,
countdown, world construction, or vehicle geometry. The earlier rejected
effects-to-activation checkpoint is not included.

## Finite work and lifetime

Pinned Three 0.185.1 returns materials from `compile`, not a receipt of the
exact programs used by that call. Each synchronous compile batch therefore
captures the submitted materials' program-cache values, including retained
back/front and shared-material variants. This is a **conservative
selected-material cache union**, not exact current-draw coverage and not a
renderer-wide sweep. Later unrelated additions cannot expand it. Wrapper and
native-handle identities are retained together.

The opt-in job checks cancellation, owner epoch, renderer-info identity,
context loss, program removal, and native-handle replacement around cooperative
checkpoints. Camera layers and render targets are restored before yielding.
When KHR parallel compilation is available, only an explicit completed query
permits reflection; unsupported KHR uses guarded synchronous reflection, one
program per yield, without claiming observed link completion. Query failures
and unfinished programs retain the real-render fallback.

The first-use phase is bounded between native calls by five seconds and 120
unsuccessful readiness rounds. Individual native operations cannot be
preempted, so the wall-clock limit is not a hard cap on a driver call. Numeric
diagnostics retain total/max reflection duration, attempts, failures, yields,
and still-live unfinished programs. No room/player text or program identifiers
are added to the production capture's allowlist.

## Coverage limits

Ordinary `compile` does not submit all shadow depth/distance programs. Opening
effects, activation's camera change, and the canonical final-camera cascade
update can expose other cold variants. Therefore effects warming, real
watchdog rendering, nonblack-frame verification, loader fade, and the all-peer
five-second countdown remain mandatory. A completed cohort is not permission
to reveal an unrendered frame.

## Publication status

**Runtime withheld.** Candidate `cdb7be8c9` is preserved on
`codex/multiplayer-program-first-use-r1`. The main landing contains only the
capture allowlist, its regression test, and this report. No `src/` changes are
included and no production speed improvement is claimed.

## Native result

The fresh `first-use-dwell-cpu-visual` private 1v1 passed functional checks on
local production build `v1.0.0+gcdb7be8c9.dirty`, `main-B3GIutgZ.js`. Tracked
runtime source was committed; only the temporary QA runner/output was
untracked. The build includes main's existing canopy changes at `ace937820`.
Two cache-disabled native contexts on one machine entered Winter, clear/day,
HIGH at render scale 1, after waiting-room map preparation. Both showed
`5,4,3,2,1`, moved, fired, returned to Garage, and closed their room connections.
There were zero page errors, no black-frame rescue, and browser closure was
verified. Both inspected screenshots show tank, terrain and HUD. The later
moving/firing probe uses its existing LOW settings and is not HIGH live-frame
certification; external GPU contention is not controlled by this probe.

| Covered loading measurement | Host | Guest |
| --- | ---: | ---: |
| Total, including ready barrier | 3,961 ms | 3,887 ms |
| Initial snapshot wait (rounded) | 0 ms | 0 ms |
| Scene compile / first-use phase | 1,484 ms | 1,281 ms |
| Uniform calls | 158 | 136 |
| Total / maximum uniform-call time | 6.5 / 0.2 ms | 7.1 / 0.2 ms |
| First-use yields | 159 | 137 |
| Uniform failures / live pending | 0 / 0 | 0 / 0 |
| Largest readiness query | 79.6 ms | 82.7 ms |
| Effects/cards warm | 180 ms | 217 ms |
| Watchdog render, excluding readback | 742.3 ms | 89.4 ms |
| Watchdog asynchronous readback | 61.0 ms | 703.2 ms |
| Largest observed loading long task | 910 ms | 295 ms |

The host's 910 ms task still coalesces effects, activation and watchdog work.
The guest's corrected profile retains about 681.5 ms inclusive under
`getUniforms`, whereas the explicit warm's measured calls total only 7.1 ms:
the selected-material warm does not eliminate later cold render work. Sampling
has a 234.5 ms maximum interval and about ±117.9 ms start-clock uncertainty;
although entry coverage is complete, this is not exact per-program attribution.
The later LOW moving/firing sample measured maximum callback gaps of
45.3/55.1 ms and zero hard snaps; it is not a frame-budget guarantee.

The unconditional yield after every tiny reflection creates substantial
scheduler overhead: 136–158 calls consume only 6.5–7.1 ms but require
137–159 separate checkpoints. The next candidate should use a bounded time
budget, retaining lifetime/readiness checks, rather than one checkpoint per
already-cheap call. Shadow/activation cohorts remain a separate unresolved
cost center. The earlier 1,903/1,808 ms production run is not a controlled A/B
for this build, but the present evidence is insufficient to publish this
candidate as faster or smoother. All failed/withheld evidence is retained.

## Validation boundary

Red-first program/scene tests pass, including 45 scene cases, reused variants,
pass restoration, exact handle lifetimes, unsupported KHR, failed reflection,
deadlines, and cancellation after the final pending yield. Typecheck and core
unused checks pass. Engine metrics report 51 functions with no complexity
violations or explicit any/unknown types. Focused presentation, activation,
entry lifecycle, session, scheduler, source-profile and private-room capture
tests pass. Production build passes (174 procedural playables; no GLB-backed
playables). These checks do not override failed performance acceptance.

React Doctor's changed-file scan reports 49/100: four cold-test chained-array
warnings and the intentionally sequential yield/await in the loading adapter.
The unchanged full-repository scan reports 43/100; the two scopes are not
directly comparable. No rules were disabled or graphics settings changed.
The pre-existing T-90M receipt failure remains reproducible in
`sourceXFleet.selftest.mjs` (`27bb658d` versus `ffbd40d4`), outside multiplayer;
the full suite is not claimed green.

For the diagnostic-only landing, the six optional uniform metrics are accepted
only as finite numbers; arbitrary strings/nested details remain excluded. Its
observer test first failed on the omitted fields, then passed. Source-profile,
private-room capture selftests, changed-tool metrics and whitespace checks pass.
No QA runner, report JSON, screenshots, build output, or unrelated work is staged.
