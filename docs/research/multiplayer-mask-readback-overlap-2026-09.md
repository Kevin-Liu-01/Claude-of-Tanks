# Multiplayer panel-mask GPU overlap — 2026-09-08

## Change and lifetime contract

`src/ui/tankThumbs.ts` formerly awaited hull compile, draw, readback, and canvas
conversion before starting the turret pass. Both diagrams are exact alpha
coverage from the real vehicle, not interchangeable icons or proxies.

The mask transaction now starts turret preparation after hull readback has
been enqueued into its independently owned pixel-pack buffer (PBO). It keeps
one shared framebuffer but two reusable 384×384 RGBA pixel arrays. Each PBO
captures its own frame before visibility changes. Hull/turret compile and draw
submissions remain ordered: blindly running the old whole passes in parallel
would let a delayed hull draw see turret-only visibility.

- Each layer restores render target, cube face, mip and clear state before the
  next task. PBO enqueue/copy restores the then-current pixel-pack binding.
- Synchronous rendering/restoration failure drains any submitted copy before
  allowing another submission. Asynchronous completion is immediately observed
  as a settled result, including canvas failures.
- Transaction cleanup joins all submitted results, even if the other layer's
  compile fails. No next tank, clone disposal, completed cache, or subscriber
  can race an outstanding writer.
- Existing source geometry/material disposal invalidation, bounded shader and
  readback waits, same-ID coalescing, and ten-entry completed cache remain.
  The preparation API still does not take the battle-entry AbortSignal; this
  change does not claim immediate cancellation for a retained live source.
- The cost is one extra 589,824-byte reusable CPU array (576 KiB) and, while
  both copies are pending, one extra same-sized PBO. There is no additional
  draw, framebuffer, GL context, lower-resolution mask, or quality override.

Readback traces now separate fixed native-call timings from asynchronous wait
time. The committed entry observer copies only hull/turret and twelve fixed
finite nonnegative numeric fields. Unknown fields are not serialized. Wait
includes task scheduling and poll context checks; overlapping wait totals are
neither additive transaction time nor a measurement of blocking CPU/GPU work.

## Native receipts

Fresh local public-build contexts on Chrome 151 / Apple M5 Max / ANGLE Metal,
using the maintained native private-room controls and independent Winter-map
preloads. No CPU profiler or forced seed/weather/quality changes at entry.

`.qa-entry/mask-overlap-timings-r1/report.json` (untracked evidence) passed a naturally selected clear/night
HIGH, scale-1 entry. Host/guest mask totals were 175.8/262.9 ms. The hull and
turret wait intervals overlapped: host 115/111.5 ms, guest 144.1/140.6 ms;
actual pixel copies were host 0.7/1.9 ms, guest 0.8/0.5 ms. Neither peer recorded
a >50 ms long task inside its mask interval.

Launch-to-first-hidden-loader was 1830.5/1955.9 ms, with foreground countdown
5–4–3–2–1 on both peers and no black-screen rescue or page errors. Native
movement/fire, Garage return, room closure and browser cleanup passed. The
post-sample screenshot pair visibly contains the tank, Winter terrain and HUD
including the two-layer damage diagram. Follow-on lower-preset dual-render
movement samples reached 46.2/44.2 ms maximum gaps, with zero hard snaps; these
are not HIGH-entry or single-device 16.7 ms budget certification. Entry itself
still had maximum observed tasks of 107/109 ms outside the mask interval.

`.qa-entry/mask-overlap-timings-r2/report.json` passed a second fresh pair on
the same frozen runtime, naturally clear/day and HIGH, scale 1 at entry.
Host/guest launch-to-first-hidden-loader was 1759/1800.9 ms, and mask totals
were 203.4/236.6 ms. Host hull/turret readback waits were 26.4/30.4 ms with
7.8/6.3 ms copies; guest waits were 116.4/114.8 ms with 1.8/0.7 ms copies.
Both peers again passed the foreground 5–4–3–2–1 countdown, battlefield
reveal without black-screen rescue, movement/fire, Garage return and cleanup.
The inspected screenshot pair retains the battlefield, vehicle and exact HUD
damage mask. Follow-on dual-render maximum gaps were 39/48.1 ms, with zero
hard snaps; the observed follow-on presets were medium/low, not HIGH entry.

R2 maximum entry tasks were 90/104 ms. A guest 60 ms task overlaps the hull
compile interval, before either readback starts. No CPU profile was collected
in these timing runs, so temporal overlap alone does not identify that task's
call stack or explain the historical 214–319 ms stalls.

The prior unchanged-audio build's two mask samples were 210.5/273.7 ms and
91.1/223.2 ms. Both used clear/day, and the second used a guest CPU profiler.
Those are context, **not a matched speedup proof**. One new night success also
does not explain the much older eleven-second night failure.

### Frozen identity

- Candidate base: `d9d685c3999c3a8dcd661bbce0a8186e1f9783cb`.
- Build stamp: `v1.0.0+gd9d685c39.dirty`.
- Index SHA-256: `97b3b9f85691821303369098f3a2c2e9fc57e9bee7352a4c39bca5296e43da42`.
- R1 source/test diff SHA-256:
  `fead7d87b5680e72d3ec1add59933c06c53f3afb0ec2a9655a28635be1bad687`.
- R2 source/test diff SHA-256:
  `99e1bb08a1345dca02ec16758709bc81996806485dc18b33cd67a1fdf770e77b`.
  Only selftest guards changed between captures; the runtime/index was frozen.

## Regression proof and limits

The real exported-mask selftest verifies distinct alpha data, row flipping,
pixel-derived metric bounds, 384→192 supersampling, shared-target reuse,
independent layer buffers, turret-first completion, held turret compile,
then-current renderer-state restoration, both directions of copy failure,
turret compile/restoration failure while hull work remains pending, and source
disposal and context loss with both writers pending. It checks queue exclusion,
exactly-once PBO/fence/clone cleanup, no unhandled rejection, and fresh-source retry.

After fast-forwarding onto `e2952b17f30e3c36f7531db303f962c84dc25570`, the
mask/readback/program-warm, loading screens, multiplayer presentation/launch,
five-second countdown, observer/native-UI harness, app-version, minimap and
world-activation selftests passed. Typecheck and the public production build
passed on that integrated tree. The native receipts above remain attributed
to their earlier frozen base, not relabeled as post-integration captures.
The changed runtime has 78 functions and zero complexity/type-inventory
violations. Changed-scope React Doctor scored 89/100; five remaining warnings
are test-only (deliberately ordered failure cases, assertion array transforms,
and actual cross-VM JSON serialization checks), not frame-loop work. No rules
were suppressed. Independent review found no blocking lifetime issue.

This is not a full-suite green claim: the unchanged
`src/vehicles/sourceXFleet.selftest.mjs` still fails its preexisting T-90M
geometry fingerprint (`27bb658d` actual, `ffbd40d4` expected). That failure was
reproduced on the integrated tree; no vehicle files or expected fingerprints
were changed by this slice. No new production browser certification was run.

This is an ownership-safe scheduling improvement with native overlap evidence,
not a claim that total guest entry or all transition frame budgets are solved.
The next source-backed experiment is to start masks after wreck preparation,
overlap scene compilation, and join before opening effects. Starting before
the viewer snapshot risks cloning an invisible root; crossing wreck preparation
risks changing shared shader hooks between mask compile and draw. A future
overlap must observe rejection immediately and drain both jobs on failure or
abort before source disposal, while reporting actual overlapping intervals.
First-draw/shadow costs and production/late-join coverage also remain open.
