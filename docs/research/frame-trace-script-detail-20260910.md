# Bounded script detail in frame traces

This is an opt-in diagnostic collector change, not a runtime optimization or an
uninstrumented performance gate. Older sanitized receipts cannot recover events
discarded by their whitelist. The observed 53 ms continuation and 98 ms
unattributed LongTask motivated better coverage; neither has a newly proven cause.

## Exact scope

The collector adds six exact, case-sensitive event names and four normalized
kinds. It retains no raw event names, arguments, URLs, stacks or script identity.

| Chrome event | Report kind | Emitter category |
| --- | --- | --- |
| `EvaluateScript` | `script-evaluation` | `devtools.timeline` |
| `v8.evaluateModule` | `script-evaluation` | `v8,devtools.timeline` |
| `v8.compile` | `script-compilation` | `v8,devtools.timeline` |
| `v8.compileModule` | `script-compilation` | `v8,devtools.timeline` |
| `RunMicrotasks` | `microtasks` | `v8.execute` |
| `RunYieldContinuation` | `yield-continuation` | `devtools.timeline` |

Blink's [script runner](https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/bindings/core/v8/v8_script_runner.cc)
emits the evaluation/compilation rows. Their categories already include the
enabled timeline category; no broad `v8` or compiler-phase category is needed.
Only [V8's microtask drain](https://chromium.googlesource.com/v8/v8/+/refs/heads/main/src/execution/microtask-queue.cc)
requires the added `v8.execute` category. Blink's
[yield continuation](https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/core/scheduler/dom_task_continuation.cc)
wraps promise resolution, so its duration need not include the subsequent
application continuation: that work may instead be inside `RunMicrotasks`.

These are current upstream emitter checks, not a verified mapping to every
installed Chrome revision. A missing row is not evidence that no script ran.
This scope does not collect all lazy/JIT compilation or verbose V8/GC/GPU phases.

## Interpretation, bounds and privacy

Durations are inclusive wall time, potentially including nested native work.
For the uniquely identified `page-main`, clip intervals to the measured window
and take their union. Do not sum nested events or call them leaf/self CPU. Other
normalized thread labels can combine multiple actual threads, so they cannot
support per-thread unions or page-main blocking attribution. The report records
this interpretation and the selected script scope. The fully nested regression
occupies 8 ms despite 17 ms of summed durations. No production aggregation
algorithm or source-identity capture is added.

The existing 0.1 ms ordinary-event threshold, all-duration GC threshold, 50,000-row
maximum, 32 MiB trace buffer, capture/command/flush deadlines and bounded stack
state remain unchanged. Loss, malformed evidence, overflow or open in-window
intervals still invalidate completeness. Argument filtering and normalized-only
retention remain enabled; browser/session ownership and cleanup are unchanged.

Adding `v8.execute` can produce extra native trace traffic even when unrecognized
events are immediately discarded. Its overhead and row/buffer sufficiency require
an authorized bounded capture; this CPU-only change quantifies neither. Preserve
incomplete receipts rather than enlarging limits or reclassifying failures.

## Focused qualification

The initial focused FIFO batch passed all three entries: collector, existing
live-combat wrapper and strict collector metric gate (50 functions, zero
violations and zero explicit `any`/`unknown`). Its retained receipt is
`/private/tmp/cot-interactive-baseline.gsRCvU/frame-trace-script-detail-cpu-r1.log`.
Review then restricted the union guidance to uniquely identified `page-main`
intervals; other role labels can combine actual threads.
The final frozen-byte repeat passes the same three entries in
`frame-trace-script-detail-cpu-r2.log`, which records both source hashes before
every child; metrics remain 50 functions with zero violations or explicit
`any`/`unknown`.
New fixtures cover all six names in complete
and begin/end form, inclusive nesting, exact threshold boundaries, row loss,
malformed/open intervals, normalized redaction and the exact four-category list.
Existing timeout, error and cleanup regressions remain intact. No native capture,
build, full suite or runtime change is part of this isolated slice.
