# Overlapping multiplayer roster assets — September 2026

## Boundary and ownership

Before this change, multiplayer waited for modules, battlefield construction,
and connection before beginning roster texture preparation. The first captured
control was labeled `139dda894.dirty`, not a clean `139dda894` build. It spent
324/747 ms in host/guest module acquisition but
2,270/2,126 ms preparing their worlds. Roster construction/painting then occupied
another 231/219 ms. This identifies available overlap, not a guaranteed saving:
both cooperative jobs still share the browser's main thread.

The already-lazy bridge module now exposes an entry-local roster asset owner.
After essential modules and battle visuals are ready, it imports only the
requested builders and cooperatively prepares the exact roster textures while
world/connection acquisition continues. It never creates scene geometry, starts
authority, activates the battle, changes graphics quality, or declares READY.
The ordinary bridge still constructs visuals only after acquisition and the
asset job have settled. Its existing optional-paint retry/fallback is retained.

`rosterAssets` in `preparationSlices` records the independent job lifetime. Do
not add this duration to the overlapping world/module durations. The sequential
`roster` stage measures any residual join and ordinary visual creation.
`rosterAssetsFailed` records optional preparation failure without claiming the
fallback visual path has failed.

## Appearance and resource invariants

- Copy roster intent before asynchronous work. Resolve AUTO against the explicit
  map, not a later mutable Garage biome. Preserve the existing seed, painter,
  texture dimensions, anisotropy and entity-derived visual seed.
- Share the viewer/spectator texture-quality decision with bridge construction.
  Duplicate vehicle picks remain separate entities; only identical
  spec/camouflage/quality preparation jobs are deduplicated.
- Preserve the existing internal urban AUTO painter when a resolved selection
  is passed back into materials. The network camouflage allowlist is unchanged.
- A material-owned reservation pins a pending cache identity; a completed lease
  owns a reference to the exact entry. Visual acquisition transfers practical
  ownership without replacing texture objects. Last-owner release disposes the
  maps. Old lease release cannot affect a replacement entry and is idempotent.
- Successful partial leases survive an optional sibling failure until ordinary
  visual creation or failed-entry cleanup. There is no persistent roster cache,
  fleet-wide prewarm, new geometry source, or painter/RNG modification.

## Failure and cancellation

Disposal stops admission between jobs, drains the current painter, then releases
every held lease. Cancellation is deliberately not thrown inside a painter
yield: existing entries are promoted in place, so abandoning halfway through
would leave borrowed maps incomplete. A lease owner's yield failure is reported
after its current paint finishes; legacy prebake failure behavior is unchanged.

Acquisition can fail before module imports settle. Entry closes asset admission
before draining, preventing those late imports from launching abandoned work.
Failures are immediately observed and the original entry error is retained.
The load trace settles only after the asset job has drained. A cancellation
checkpoint after successful lease disposal prevents entering an uninterruptible
initial-snapshot wait with an already-cancelled, unpublished bridge.

The five-second authority countdown, verified nonblack frame, covered reveal,
loader fade, and safe Garage-return sequence remain mandatory and unchanged.

## Verification

Focused regressions cover actual Three texture reference handoff, coalesced
bakes/promotions, exact original painter pixel equality, draft/live overlap,
failed-paint cleanup, fixed camouflage across sweeps, explicit-map AUTO identity,
duplicate picks, spectators, late imports, overlapping acquisition, optional
failure fallback, and cancellation during painting and lease disposal. The
post-disposal cancellation test was also checked against an in-memory negative
control removing only that checkpoint; it fails on premature snapshot admission.

The material test uses the declared `@napi-rs/canvas` 0.1.100. On this host the
shared linked dependencies lack that declared package; verification uses the
same version from the bundled runtime through the test-only, version-validated
`COT_TEST_CANVAS_MODULE` override. No dependency tree or lockfile was changed.

An existing FX wiring assertion expected an obsolete direct Solo intent alias.
The unchanged baseline already uses a room-aware adapter. Its regression now
checks that exact adapter and its authoritative-room guard; no FX runtime was
modified.

The countdown regression also contained pre-localization English literals;
its assertions now use the same reviewed translation keys as the unchanged
runtime. English and Chinese runs preserve the timing/visibility checks.

Strict metrics pass for the five touched runtime files (no complexity
violations and no explicit `any`/`unknown`). React Doctor reports
no new errors. Its four advisories are three test-only checks and the roster
owner's intentionally sequential cooperative loop: parallelizing every painter
would lose the bounded-work/memory property. The changed-scope repository score
is still 49, not a claim of a clean repository-wide scan.

Native acquisition uses the committed `multiplayer-loading-build-probe.mjs`,
immutable public builds, pristine browser contexts, normal scheduling, native
private-room controls, local WebRTC/signaling, and serialized GPU ownership.
Reports are local evidence, not two physical devices, a distant-network test,
hardware-GPU certification, or proof that historical 214–319 ms stalls are fixed.

## Completed native measurements

The first three runs used two fresh, cache-disabled contexts on Winter,
clear/night/high at render scale 1, without waiting for room-map preparation
before launch. The final candidate below retained the native day setting;
it is not an identical-lighting performance comparison. Values
below are host/guest milliseconds. Loader duration is launch to the observer's
first loader-hidden sample; it is not network transaction duration.

| Measurement | r1 control | r1 candidate | r2 clean control |
|---|---:|---:|---:|
| Loader duration | 4820.8 / 4664.8 | 3418.9 / 3605.0 | 19890.6 / 19412.5 |
| Maximum rAF gap | 161.4 / 255.6 | 240.2 / 282.5 | 5810.5 / 2861.8 |
| World transaction | 2269 / 2124 | 1488 / 1677 | 1836 / 2070 |
| Sequential roster stage | 231 / 219 | 98 / 144 | 241 / 288 |
| Combat warming | 241 / 295 | 139 / 102 | 6878 / 2878 |
| Reveal | 746 / 786 | 635 / 638 | 7835 / 7691 |

The r1 candidate had shorter observed loader and roster intervals, but larger
maximum rAF gaps. World timing also changed, so the loader difference cannot be
attributed entirely to roster overlap. These single-run observations establish
neither a universal speedup nor smoothness certification. The r1 observer kept
only the first two preparation inputs and allowed only panel/compile tags: the
new roster interval was filtered out and displaced compile beyond that cap.
Consequently r1 does not retain the exact independent roster lifetime. The
observer was corrected before r2; historical reports remain unchanged.

### r2 control: functional entry, failed guest mask preparation

The clean control contains no roster overlap. Its guest mask transaction
**failed after 5028.5 ms**, ending in a 5024.9 ms `hullCompile` interval with
neither hull nor turret readback completed. Host masks completed in 1659.4 ms.
Full panel preparation overlapped scene compilation, but still left residual
`panelJoin` waits of 551.9/3912.1 ms.

This failure is handled by the existing fallback, not a successful mask barrier:
`buildTopDownMasks` catches failure and returns null; `prepareTankMasks` returns
false; the `warm.playerPanel` adapter awaits but ignores that boolean. The panel
can keep its vector fallback. The transaction duration is consistent with the
bounded five-second program wait, but the sanitized report does not preserve
the error reason. **r2 does not certify panel completeness or performance.**

The largest delays were after world/roster preparation. Scene compilation
retained 158/136 pending uniforms after 120 polls; opening-effect compilation
retained one each. Opening-render totals were 5793.5/1781.2 ms. Within pass 0,
`getProgramParameter` accounted for inclusive totals of 5698.1/1724.9 ms; these
nested measurements must not be added together. Watchdog render/readback times
were 1082.9/4834.2 ms for the host and 713.6/3932.8 ms for the guest.

All recorded long tasks of at least 200 ms follow. Intervals use each page's
own `performance.now()` clock, rounded to 0.1 ms; peer clocks are not aligned.

| Peer | Task interval (ms) | Duration (ms) | Recorded stage overlap |
|---|---:|---:|---|
| Host | 17280.0–23090.0 | 5810 | Combat warming, then activation |
| Host | 23094.7–24113.7 | 1019 | Final shadows |
| Host | 24114.7–24710.7 | 596 | Final shadows |
| Host | 24730.4–25814.4 | 1084 | Final shadows / watchdog render |
| Guest | 6782.0–7057.0 | 275 | Atmosphere |
| Guest | 14253.8–16047.8 | 1794 | Combat warming, then activation |
| Guest | 16171.7–16886.7 | 715 | Final shadows / watchdog render |
| Guest | 20845.7–23703.7 | 2858 | Loader fade |

These receipts identify delayed operations and overlapping intervals, not the
underlying cause of their stalls. r2 is also not a repeat of the identical r1
artifact: both build identity and acquisition hash differ.

### Functional evidence and retained identities

All three reports passed their entry protocol with complete foreground
5→4→3→2→1 countdowns, primed reveal, nonblack source watchdog results without
rescue, connected battles, and advancing snapshots/inputs. r2 recorded no page
errors, renderer crashes, app exceptions, browser disconnection, or observer
failure. Every sampled frame was focused and visible, background-tick deltas
were zero, and no frame/transition/long-task records were dropped. This does not
establish the absence of console warnings or visibility between samples.

All three reports retained unchanged build/acquisition identities through the
run and verified complete room/browser/preview/signaling/lock cleanup, with no
owned rooms remaining. r2's 391013.7 ms FIFO wait preceded the scenario clock;
it is not included in loader duration. Functional success is limited to the
declared DOM/watchdog protocol, not screenshot or complete-panel certification.

- [r1 control report](/private/tmp/cot-roster-overlap-baseline-native-20260908-r1/report.json):
  `v1.0.0+g139dda894.dirty`.
  Index SHA-256: `93ddbac3586d4184b67eb1723e4b4c1eacc963a9e856a2c7ae6ee8a3dc5809ae`.
  Report SHA-256: `d2a00f3e2582e1f58e15fe6df0292c641f34b9426e638a9f6996ccf0846ca7e3`.
- [r1 candidate report](/private/tmp/cot-roster-overlap-candidate-native-20260908-r1/report.json):
  `v1.0.0+g139dda894.dirty`.
  Index SHA-256: `ee3070722ca88d4d788601fa332b8e068b873acc59c2dca0970a6a31bf9798a5`.
  Report SHA-256: `608a7ae551cb796bd776de1d6166333a1e76837915c12709493f9c17a49ae4a6`.
- [r2 clean control report](/private/tmp/cot-roster-overlap-baseline-native-20260908-r2/report.json):
  `v1.0.0+g139dda894`.
  Index SHA-256: `5ab381ec0bf47c4571c1c82b7670f86a9bf0a04ed50b59c9ce0915b6eedd8160`.
  Report SHA-256: `4e56334b930cb2c66dc68994504cd8d3cd35076a15369662778581c68063dfa7`.

The r1 pair shares acquisition SHA-256
`9cb48e21d6784d1ba3db11d7cc69c28a06822f30fc4c7f2a2100e08cfbee1204`;
r2 control uses
`d1bb72fe2fbc5ba04d8f3594b967f65171451f5ebee1d62e8e5daed9da43f613`.
All use Node v24.13.0. Local report links refer to retained acquisition artifacts,
not publicly hosted evidence.

### Final candidate r2

The final candidate passed the native entry/countdown/exit protocol with both
players connected, advancing snapshots/inputs, no page errors, no dropped
observer records, nonblack unrecovered watchdog samples, primed reveals, and
zero owned rooms remaining after complete browser/server/lock cleanup.
Foreground countdowns lasted 4959.9/4755.0 ms. Both panel-mask transactions
completed, in 5041.5/4497.5 ms.

This capture retains direct overlap evidence. Host `rosterAssets` ran at
15225.3–15378.0 ms, inside acquisition at 14815.2–16163.5 ms; guest assets ran
at 3596.8–3827.0 ms, inside acquisition at 3108.5–4683.3 ms. Both optional
failure flags were false. Thus asset work settled before scene-roster creation;
the residual roster stages were 91/99 ms. These are page-local clocks.

Loader durations were 14309.0/13958.8 ms and maximum rAF gaps remained
1574.8/1628.2 ms. Residual panel waits were 3961/3373 ms and reveals
6426/6259 ms. These are unacceptable stalls, not a smoothness pass. The run
used clear/day/high at scale 1, whereas the earlier captures used night;
neither the lighting difference nor variable shader/readback behavior permits
attributing total-load differences to this change. No quality setting was
overridden by the implementation or probe. Historical stall causality and
repeatable frame-budget compliance remain open.

The [final candidate report](/private/tmp/cot-roster-overlap-candidate-native-20260908-r2/report.json)
uses index SHA-256
`19c9a10c01eef4f94076d63111deb1b80f96ec2216aa0d00078aecdc3f723324`
and report SHA-256
`ec0b75d28678e7cca0e4c77e62e8939b81010c1e19a162085b42d3d0982898d7`,
with the same acquisition SHA-256 as the r2 clean control. Its build and
acquisition identities remained unchanged throughout the run. Focused
regressions, full typecheck and public build passed on this candidate;
the unrelated full-fleet `npm test` suite was not rerun for this slice.
