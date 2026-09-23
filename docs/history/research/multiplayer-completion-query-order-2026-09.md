# Multiplayer shader-completion query order

## Current evidence and hypothesis

The successful-reflection checkpoint in
[the first-use ledger](multiplayer-program-first-use-2026-09.md#successful-program-reuse-checkpoint)
removed 18 repeat preparations per client, but `program-proof-r1` still measured
222.1/229.4-ms maximum native readiness calls. The main scene added 78 programs
per peer, reaching 218/180 resident programs. These timings identify an API
call site; they do not by themselves identify the internal browser operation.

The capture reports Chrome **151.0.7922.47**. Its exact-tag Chromium sources
provide a specific explanation to test:

- [WebGLRenderingContextBase's header](https://chromium.googlesource.com/chromium/src/+/151.0.7922.47/third_party/blink/renderer/modules/webgl/webgl_rendering_context_base.h)
  limits retained program-completion queries to 128.
- [The corresponding implementation](https://chromium.googlesource.com/chromium/src/+/151.0.7922.47/third_party/blink/renderer/modules/webgl/webgl_rendering_context_base.cc)
  creates an asynchronous completion query when linking with KHR enabled,
  evicts the oldest query beyond that limit, and uses it for KHR readiness
  only while its entry is retained. Otherwise it calls `CompletionStatus`.
- [WebGLProgram](https://chromium.googlesource.com/chromium/src/+/151.0.7922.47/third_party/blink/renderer/modules/webgl/webgl_program.cc)
  implements that fallback through `GetProgramiv`.
- [The command-buffer implementation](https://chromium.googlesource.com/chromium/src/+/151.0.7922.47/gpu/command_buffer/client/gles2_implementation_impl_autogen.h)
  waits for the command when the client-side parameter cache cannot answer it;
  [ProgramInfoManager](https://chromium.googlesource.com/chromium/src/+/151.0.7922.47/gpu/command_buffer/client/program_info_manager.cc)
  does not cache the KHR completion parameter.

Thus an old program's nominally asynchronous query can require a synchronous
GPU-process round trip, potentially paying for newer queued work. This is a
source-supported mechanism, not a proven native trace of this exact occurrence.
Program count alone does not identify which queries were evicted, and the
implementation does not depend on a browser-specific count or user agent.

## Candidate boundary

All selected variants are still submitted before first-use preparation. The
candidate prioritizes the most recently created exact Three program wrappers
and yields on a pending newer link before checking older ones. It subsequently
queries and reflects every still-live older unwitnessed variant too: a newer
completion is **not** evidence that older compiler tasks finished. Existing
dual-table witnesses, cancellation/context checks, bounded work, and mandatory
covered render/reveal checks remain in place.

Ordering uses validated creation IDs from the pinned Three 0.185.1 wrapper,
whose constructor assigns monotonically increasing IDs. If ordering metadata
is incomplete or invalid, retain the ordinary traversal order. Do not sort by
the renderer's mutable program-array indices, which can compact on disposal.
This neither narrows the conservative selected-material cache union nor
replaces actual completion queries with a guessed wait.

The previously rejected submission fence is not restored. Its mixed-condition
results did not establish a speedup or remove all synchronous queries; see
[the loading ledger](multiplayer-loading-2026-09.md). Native improvement and
nighttime behavior remain unproven until this candidate is measured.

An earlier newest-first experiment also failed: the preserved
`idle-wake-recent-links-dwell-cpu-visual/report.json` in the
`cot-multiplayer-roster-landing.hkbIVo` worktree exhausted its 24-round bound
with 24 new-program queries and **zero existing-program queries** per peer.
Its near-zero query timings concealed 351/257-ms FX preparation,
350.2/179.1-ms watchdog draws, and 689/426-ms maximum tasks. The current
first-use path retains its existing 120-round/5-second bounds and dual-table
reflection, rather than that older linker-only preparation. This is a
meaningful implementation difference, not proof that the failure is gone.
Acceptance requires zero pending preparation, full live-cohort coverage, and
end-to-end measurements; lower query timings alone do not qualify.

## Candidate verification

The 158-program retained-query-window regression failed before the change
(30 evicted older handles queried before a checkpoint), then passed: only the
newest pending handle is queried before yielding, and all 158 are subsequently
queried and reflected. Metadata fallback, frozen creation IDs, separately
pending older links, failed queries, handle/context/info/epoch changes,
context loss, abort/return/throw, deadline and final-round cancellation are
covered. Sixteen focused suites, typecheck/core-unused, public build and
the changed-engine complexity gate pass (73 functions, zero violations or
explicit `any`/`unknown`). The changed-file React Doctor scan is 49/100 with
chained-array warnings only in cold test assertions; no suppression or
per-frame runtime change is included. The unrelated existing T-90M fleet
receipt failure still prevents claiming a green full suite.

### First native run: rejected

`completion-order-r1` used the frozen local public build
`v1.0.0+g29ae6ebb2.dirty`, index SHA-256
`31fcad07939f81af9b11daec96fa4382eda0e5215d7cf915143aa1f33e655e46`,
runtime diff SHA-256
`a15c118d3a3d74824190986a1abb0f5a9cef5065919253c0a885ab492850b00e`.
Both peers completed waiting-room map preparation. Host entry was clear/day,
HIGH/scale 1. Its scene prepared 140 programs and reused 18 with zero pending
or failures; maximum query fell to 0.2 ms, opening draw was 55.4 ms, final
shadow maximum 64 ms, and watchdog draw 37.9 ms. These are incomplete-host
measurements, **not accepted multiplayer improvement**.

The guest became unresponsive to observation/state commands during
`both_live_battles`; CPU-profile stop also timed out. No renderer-crash or
application-exception event was observed, which does not establish the cause
or exclude a native stall. The host reached the ready barrier, then returned
to Garage with the failure state. Browser closure and host room closure were
verified, but guest room cleanup could not be verified. Owned preview and
signaling servers were closed. Preserve this failed receipt; require a fresh
complete run before considering runtime publication.

### Second native run: complete

`completion-order-r2` used the identical frozen source and build hashes above,
with fresh native Chrome 151 contexts and ordinary room controls. Both peers
completed Winter clear/day loading at HIGH/scale 1, verified a rendered frame
without black rescue, showed `5,4,3,2,1`, moved/fired, returned to Garage, and
closed the room. Page errors, renderer-crash events and application exceptions
were zero; both room closures and browser closure were verified. Inspected
host/guest screenshots show tank, terrain and HUD on Apple M5 Max/ANGLE Metal.

| Second-run measurement | Host | Guest |
| --- | ---: | ---: |
| Covered entry including ready barrier | 1,987 ms | 2,175 ms |
| Scene compile/preparation | 239 ms | 490 ms |
| Reflected / safely reused programs | 140 / 18 | 118 / 18 |
| Pending / reflection failures | 0 / 0 | 0 / 0 |
| Maximum readiness query | 1.1 ms | 28.7 ms |
| Preparation yields | 21 | 50 |
| Actual opening draw | 95.4 ms | 63.3 ms |
| Final-shadow maximum draw | 121 ms | 34 ms |
| Watchdog draw | 40.8 ms | 41.9 ms |
| Largest task beginning inside covered network entry | 121 ms | 87 ms |

This completes the cohort rather than hiding unfinished work. Compared with
the preceding successful-reflection capture, readiness-query stalls are much
smaller, but total entry is **not faster** (previously 1,877/1,975 ms). This is
not a controlled timing A/B: natural scheduling, selected match state and GPU
contention are not pinned. Pre-entry tasks still reached 235/202 ms. Later
20-second LOW moving/firing samples reached 56.3/47.5-ms maximum callback gaps
with zero hard snaps; they are not HIGH frame-budget certification. The first
run's unresponsive guest and nighttime behavior remain unresolved by this
single complete day run.

### Third native run and publication boundary

`completion-order-r3` repeated the identical build with two fresh contexts and
again completed clear/day HIGH/scale-1 entry, the full foreground countdown,
moving/firing, Garage return, and both room/browser closures. Zero page errors,
crash/exception events, reflection failures, live pending programs, or black
rescues were recorded. Both peers again reflected 140/118 programs and safely
reused 18 each; the scar program also completed separately. The inspected
native screenshots show both battles rather than a blank/loading surface.

| Third-run measurement | Host | Guest |
| --- | ---: | ---: |
| Covered entry including ready barrier | 1,923 ms | 2,134 ms |
| Scene compile/preparation | 534 ms | 299 ms |
| Maximum readiness query | 23.2 ms | 1.1 ms |
| Preparation yields | 47 | 28 |
| Actual opening draw | 55.6 ms | 81.3 ms |
| Final-shadow maximum draw | 101 ms | 50 ms |
| Watchdog draw | 37.2 ms | 74.8 ms |
| Later LOW moving/firing maximum callback gap | 47.0 ms | 45.6 ms |

The two complete repeats support shipping this narrow scheduling improvement:
the previously measured 222–229-ms individual readiness queries did not recur,
all preparation finished, and the debt was not simply abandoned for first
render. The third host still spent 240.8 ms in readiness queries **in total**,
spread across smaller calls/checkpoints. This is a main-thread responsiveness
improvement in the tested scenario, not eliminated compilation work or a
demonstrated total-loading speedup. No rendering quality, asset coverage,
countdown, authority or vehicle geometry is changed.

The first guest timeout remains an unexplained failed sample, not discarded
as a presumed harness problem. No JavaScript unbounded loop was found in an
independent review; individual native calls remain non-preemptible. Night
loading, pre-entry 200+-ms tasks, remaining 50–121-ms draw tasks and broad
frame-budget guarantees are **not resolved** by this release. Temporary
runners, JSON reports, screenshots and build output remain local and excluded
from the commit; this ledger retains the successful and failed conclusions.
