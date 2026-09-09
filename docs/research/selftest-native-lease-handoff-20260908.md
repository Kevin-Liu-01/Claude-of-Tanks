# Native self-test lease handoff repair

The scoped fleet release diagnostic reached
`tools/resolved-depth-copy.browser.selftest.mjs` after 699 recorded results.
The suite runner held the shared FIFO lease while this child attempted to
acquire that same lease. The existing exemption named only the source-dimension
browser test. No native browser had launched: the wait was nested ownership,
not a slow GPU result or a tank-geometry failure.

The owned diagnostic parent was interrupted, forwarding SIGINT only to its
owned child. Its recorded child status is 130, overall `pass:false`,
`complete:false`. Earlier failures remain in
`cot-fleet-qualified-bodywork-20260908/.qa-dev/release-tail-diagnostic-rBa4lI/receipt.json`.
Neither a queue ticket nor another task's lease/process was manually removed.

The repair adds only the depth-copy test to the explicit child-owned registry.
It does not exempt arbitrary browser-named files: the lobby-prefetch test's
normal no-argument invocation runs CPU-only guards and retains the runner lease.
The actual depth-copy test continues to own acquisition, heartbeat, browser
cleanup and release. No application, geometry, pixel threshold or assertion in
that test changes.

The runner's focused regression now executes scheduling against the production
registry, covering consecutive owned browser children followed by the real
CPU-only browser guard. It rejects the old missing exemption and an overbroad
exemption, while preserving existing failure, signal, FIFO batch and heartbeat
coverage. This repair does not turn the interrupted full suite into a pass.

## Validation boundary

The runner, capture-lock and capture-command focused tests passed. The real
depth-copy browser child then acquired normally, exercised all 12 native
Apple M5 Max pixel cases (including context loss/restoration), and closed its
browser/server/lease. Its overall test still **failed** on an HTTP 404 console
error. Pixel parity, color preservation and the negative copy/sampler controls
all passed; that does not excuse the separate console-error gate. The browser
test and its thresholds are unchanged. The queue handoff is fixed; the full
native test and full repository suite are not claimed green.
