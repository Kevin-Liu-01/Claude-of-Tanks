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

## Subsequent root acquisition

`opaque-paint-script-trace-local-r1` exercised the same public `e7735a2ff`
runtime as the preceding unprofiled and Canvas runs. Functional/audio/source/
warm-readiness checks pass, with no page or cleanup errors. The first two traces
are globally incomplete because of open tail tasks on other threads; Garage is
complete. There are no row drops, buffer loss, malformed rows or stack overflow.
The incomplete receipts are retained as failures of diagnostic completeness,
not relabeled as complete or used to certify absent work.

The first 105.2 ms action callback interval (3512.0–3617.2 ms, terrain meshes)
contains a retained 55.859 ms page-main microtask drain beginning at 3535.025 ms.
The overlapping LoAF independently attributes a 55.9 ms scheduler continuation.
Rematch's 69.4 ms callback interval similarly contains a 51.005 ms drain during
deployment priming. These positive observations fill part of the former script
coverage gap but do not name the nested hot function, establish JIT/Canvas/GPU
cost, or reproduce the prior 98/112 ms terrain-setup task. No timing improvement
is claimed from tracing.

A retained 529.55 ms timer/function envelope spans 2698.38–3227.93 ms, entirely
before the trusted Battle click at 3248.8 ms. Action callback recording is not
active there; its absence from action gaps is expected, not evidence of a B/E
pairing bug or proof of an in-action 529 ms stall. This envelope's owner remains
unattributed. Capture setup and pre-click activity are not click-to-ready work.

HTML SHA256: `1b02dba11b8eb706f9fb0a198b47b9c39bc010015c9f44bce86816da5c2dd98a`.
Acquisition SHA256: `d4ca7a3428eed92d81dc1818cc2b0d5860300e42dc584fa27e555ed2309d610f`.
Report SHA256: `3c41c82f97cb7dccd34009f9680e3b62915d8e11352f43eb0f4fdcb076f0f120`.
Battle / rematch / Garage trace SHA256:
`e55b420eb24e958a51e21ee27142e30b044c4d84afd7eac32afeee547d8948ad`,
`0f852267e7f2cf11165612566db466d42aebbe322fa5d48e4ea0256a1fc2a725`,
`06451951ac0f71a404ef949df33a453a46716c23fa5887bdb425276483a9a1fb`.
Evidence remains under `/private/tmp/cot-interactive-baseline.gsRCvU/`.
