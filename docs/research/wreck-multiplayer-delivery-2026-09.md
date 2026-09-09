# Wreck and multiplayer delivery closeout

This closes the outstanding implementation work from the wreck/loading thread.
It does not relabel historical performance observations as proof of zero
latency or a universally fixed frame budget.

## Already delivered before this integration

The following changes are ancestors of the integration base `d0d01a903`:

| Requested behavior | Maintained implementation history |
| --- | --- |
| Redis-free private rooms and LAN, failure handling and cleanup | Cloudflare signaling `e60d2839a`; private-room acquisition `ce9941ff7`; responsiveness hardening `10ac577de` |
| Movement reconciliation without the reproduced suspension wobble | `72d46c8f8`; see `multiplayer-moving-jitter-2026-09.md` |
| Normal bot turret and gun aiming | `bdee8b423` |
| Ready can be reversed to Not Ready | `bcd0946a5` |
| Joined-room preparation, covered failure recovery and nonblack reveal | `6dbc1de07`, `7c444d80d` |
| Concurrent roster/world acquisition and shader preparation | `fcbcc961a`, `92d55cdbd`, `c5ca781e2` |
| Full five-second countdown, not simulation-slowed countdown | `cd7939351` |
| Version displayed and derived from each build revision | `bc9670667` |
| Ammo depletion and independent shell/missile selection | `846826e73`, `519de9de5`, `c63f136c8` |
| Shared vehicle muzzle seating, Browning-family weapons and camouflage fixes | `133cef6b3`, `e70dafdfd`, `445d2e4bf`, `d1f451df2`, `f19b47d2e` |

These are implementation/ancestry references, not new certification of every
old vehicle annotation or every possible runtime/network condition.

## Remaining implementation delivered by this integration

- Expand the contemporary wreck pool from 14 to 32 public playable donors;
  use explicit casts across all 30 maps and replace retired Leopard 2A7 with
  public Leopard 2A7V. All era pools together contain 51 unique donors.
- Keep existing char/rust, destroyed poses and debris, while admitting the
  additional light, missile, infantry-fighting and main-battle silhouettes.
  Preserve desktop/mobile placement caps and only advance an authored donor
  after successful placement. Refresh the canonical collision receipts.
- Move asynchronous wreck baking to an owned module worker, transfer only
  retained geometry, acquire only selected families, and drain cancellation,
  startup, timeout, transfer and partial-hydration failures.
- Avoid discarded factory paint and duplicate wreck paint work without
  changing the final visible geometry/paint. Keep the synchronous path usable.
- Prepare sourced terrain before fallback painting, pace overdue loading
  frames, batch wall fits and first shadow work, and avoid full shell-profile
  derivation when a non-building pool needs only its contact band.
- Deduplicate repeated progress DOM writes and restart countdown motion
  without forced layout. Preserve the existing fade/covered-reveal lifecycle.
- Keep every profiler metric enforced after the optimized compaction path;
  instrument the shared compaction body, not iterator creation.

The source checkpoint is `835b1d3c9`; the three-way integration starts at
`3b0844f48`. It preserves incoming HUD/layout, Verdant horizon, night-fixture
and test-registry changes. No shared dirty checkout, temporary QA output,
credentials, or unrelated vehicle bodywork is included.

## Evidence and limits

Detailed retained evidence lives in `wreck-roster-expansion-2026-09.md` and
`multiplayer-loading-paint-dedup-2026-09.md`. The pre-integration frozen native
two-client test passed complete 5/4/3/2/1, nonblack reveal, advancing battle,
Garage return and cleanup. Preparation measured 3,139/3,312 ms; sampled
post-reveal frame gaps reached 35.4/38.5 ms, while covered loading reached
132.4/129.3 ms. These are measured limits, not stall-free claims.

The original 214–319 ms gaps lack the contemporaneous trace needed to assign
an exact cause. Browser/OS background-host throttling and real network latency
cannot be eliminated by this client patch. Same-machine relay/impairment/room
scale tests are not physical-device or distant-network certification.

Integrated test, build, native and landing results are recorded below when
they actually complete; retained evidence above is not substituted for them.
