# Regression audit: `4fa937f7`

Commit `4fa937f7ea574c85966aaf375e995d0d95f71cac` (`perf(loading): eliminate cold tank switch stalls`, 2026-08-23) was audited after the normal garage stopped showing its authored repair bays and component displays.

## Findings

| Area changed by the commit | Finding | Current disposition |
| --- | --- | --- |
| Garage dressing | **Regression.** Boot changed from draining every dressing chunk to one `pump()` call, while no normal runtime path scheduled the remaining four chunks. The T-90A and M1A2 repair bays, T-90M gun/turret/Relikt display, K2 teardown, and machine-gun rack therefore disappeared. | Fixed: normal garage sessions now resolve the exact source families and build one set piece per quiet idle window. Failed chunks remain retryable and expose diagnostics instead of being skipped permanently. |
| Garage tank reuse | **Regression, previously fixed.** Reusing the battle visual on the pedestal allowed combat pose, destruction, recoil, track, suspension, and decal state to leak into the garage. | Fixed by `0fa957d6` and covered by `garageTankLifecycle.selftest.mjs` plus `garagePresentation.selftest.mjs`. |
| Adjacent tank prefetch | The texture-only preload was insufficient after later fleet splitting because a neighboring profile family could still be cold. | Fixed by `f5fa2712`; the dressing fix also explicitly resolves its T-90 source families before synchronous construction. |
| World prefetch | Eager construction could compete with player intent. | Current implementation preloads only the module/builder until Battle intent; no live regression remains. |
| Garage preview resolution | Preview textures were deliberately reduced to 1024/512 while high-quality presentation remains 2048/1024. | Retained. The current projected preview size does not justify the larger maps, and material-tier tests pass. |
| Vehicle marking seats | Runtime traversal was replaced with generated receipts. | Retained. All 122 receipts pass `tank:marking-seats:check`. |
| Offscreen warm/render gate | Warm-up and first-render sequencing changed. | Retained. Focused offscreen-warm and loading-screen tests pass. |
| Performance probes/package scripts | Diagnostic tooling was added or revised. | No runtime path or regression found. |

## Live verification

On a fresh garage load, all five chunks completed with no build error. Measured quiet-window build costs were 28 ms (core), 85 ms (T-90A bay), 126 ms (M1A2 bay), 67 ms (T-90M display), and 94 ms (K2/MG display). They run only after at least 1.6 seconds without garage input, one chunk per idle turn.

The resulting scene contains the repaired T-90A and M1A2 vehicles, T-90M gun/turret/Relikt assemblies, K2 hull/running-gear teardown, and M2/DShK service mounts. The captured trace reported zero freezes and a 16.7 ms median frame time.

## Prevention

`garageDressingLifecycle.selftest.mjs` now asserts that normal boot and every return to the garage arm the quiet builder, that input activity gates construction, and that every source vehicle family resolves before a dressing chunk runs. Dressing failures no longer consume their chunk, so a transient load failure is visible and retryable.
