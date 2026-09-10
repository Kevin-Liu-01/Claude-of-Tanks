# Props wait attribution, without changing pacing

The `57fe26ac9` production control run spent 16,300 ms in the props stage, but
only 2091.7 ms inside timed generator slices. The other 14,208.3 ms is outside
those timers, not proven CPU work or proven network time. Source image promises
do not directly hold this stage. The same-URL earlier production fixture had
3935/1722.9 ms, and the relevant props/archive/worker/pacing source was unchanged.
No recorded LongTask overlapped the reconstructed long props interval.

New bounded fields in the existing build receipt distinguish:

- Time at the already-existing prop-model consumer await, not the full overlapped
  request's transfer time.
- Aggregate slice-tick and nested wreck-checkpoint elapsed/count/maximum.
- Builder-import await time for the non-worker fallback.
- Inclusive wreck-bake elapsed and at most 32 actual request rows, with a dropped
  row count and explicitly **included**, not additive, checkpoint time.

All times use the page performance clock. Bake time still includes worker
imports/construction/transfer and main-thread hydration; it is not worker CPU.
The observer returns the original tick promise and retains synchronous ignored
return values. No scheduling constants, worker protocol, source policy, runtime
cancellation, geometry or visual quality change.

The actual source-executed wrapper tests use held promises and an injected clock
to prove independent versus nested totals, pacing-promise identity, callback
order/count, bounded rows, no-tick behavior and falsy rejection cleanup. The map
fixture proves the archive request overlaps earlier work while only its later
consumer wait is recorded. Props scheduling, wreck-worker lifecycle and world
coordinator tests passed in the isolated owner branch.

The first test run exposed ignored numeric tick returns; callable-then detection
was corrected before qualification. Separately, the old coordinator source
assertion failed against exact unmodified `57fe26ac9`: it did not allow the
already-shipped terrain-source cancellation before destructible unregistration.
The assertion now requires source cancellation → unregistration → vegetation
cleanup. That is a strengthened regression contract, not a runtime cleanup edit.

Isolated four-file patch SHA-256:
`061b8eee840b7a5c160762ab3f6f98d74541770de657064487b74cf0e63fb69c`.
Receipt: `/private/tmp/cot-interactive-baseline.gsRCvU/props-await-diagnostics-receipt.json`.
Baseline/candidate metrics have no new or increased inherited violations and no
explicit `any`/`unknown`. On the combined parent candidate, all three focused
tests, typecheck (including unused-code enforcement), and public build passed.
Live acquisition is still pending; instrumentation does not claim to shorten loading.

The combined ten-file React Doctor scan returned **49/100 and exit 1**, with
nine performance warnings and two `no-eval` errors in the test fixture. This is
not a green scanner result. Independent review confirmed both `Function` calls
execute fixed repository-owned source slices with local injected ports, not
user/network/CLI code strings, and are excluded from the public runtime. One
call predates this change; the second exercises the real map await wrapper.
No rule was suppressed. Serial test awaits preserve pacing/lifetime assertions;
the runtime array/checkpoint observations are qualified in the hidden-readiness
receipt. The observer adds one settlement reaction, but no extra awaited hop;
current production ticks return native promises, not exotic thenables.

## Production acquisition

The same `f6622924a` real-control production run linked in the hidden-readiness
receipt passed all four functional/readiness gates. Its cold Battle recorded
5217 ms props wall time: 2250.8 ms generator slices, 213.6 ms ordinary slice-tick
awaits, and 2748.4 ms inclusive wreck-bake awaits. The roughly 4.2 ms remainder
includes wrapper/bookkeeping/rounding; it is not attributed CPU time. The
prop-model consumer await was 0 ms at the available clock resolution.

Six actual wreck requests took 703.8 ms (Leclerc XLR), 501.4 ms (BMPT T-90),
426.4 ms (Challenger 2), 371.1 ms (M1A2), 309.2 ms (T-90M), and 436.5 ms
(Leopard 2A7V). Their 204.8 ms nested checkpoint time is already included, not
another additive delay. There were no fallback builder imports or dropped rows.
The largest ordinary generator slice was 24.4 ms; the largest tick await was
26.3 ms. These are elapsed timings, not isolated worker CPU measurements.

The prior 16.3-second props run predates these fields, so its unexplained
remainder cannot retroactively be assigned to wrecks or the network. This new
receipt closes attribution for this acquisition, not the old cause or a claim
that cold loading is instant. Wreck imports/construction/transfer/hydration are
still one inclusive operation. Geometry, requested donor diversity and pacing
were not reduced to obtain the result.
