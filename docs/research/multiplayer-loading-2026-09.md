# Multiplayer entry and visible countdown — September 2026

## Scope

This change covers private/LAN and dedicated-adapter battle entry, the visible
five-second countdown, and covered recovery to Garage. It does not change
authority, vehicle geometry, network tick rates, or gameplay balance.

## Defects and corrections

1. **Countdown consumed by loading.** Previously READY preceded atomic visual
   activation, shader/first-frame verification, and loader fade. The authority
   correctly counted five seconds, but a slow first frame hid part of them.
   Entry now prepares the exact roster and initial snapshot, warms presentation,
   activates it atomically, verifies/paints the frame, and awaits loader fade
   before declaring READY. Gameplay remains authority-gated. Early peers see
   `WAITING FOR COMMANDERS / READY`; a late join displays the real remaining
   countdown (or live phase), never a fabricated new five seconds.
2. **Serial lazy initialization.** Battle-visual initialization ran before the
   parallel acquisition barrier. It now joins the module branch alongside world
   preparation and connection. Bridge creation still waits for all required
   initialization. Hosts still wait for collision before creating authority;
   guests can connect while constructing their own local world.
3. **Uncovered error recovery.** Failed entry uncovered rendering and hid the
   loader before restoring Garage. It now reacquires an opaque cover if needed,
   closes the owned match, restores Garage, allows its first paint, then fades.
   A failed restoration retains the opaque loader instead of exposing an
   incomplete scene. Private entry, rematch, dedicated entry, cancellation, and
   failures after reveal share this path.
4. **Late world activation after recovery.** A rejected sibling in acquisition
   could restore Garage while world acquisition still mutated the shared scene.
   Failure now settles that world operation before recovery, retaining the first
   error. It does not wait for a hung transport; late connections remain subject
   to the existing entry-abort publication check and teardown.

The HUD countdown controller owns only DOM state and its release timer. Hiding
the HUD clears waiting/countdown state and pending timers. Numeral animation
restarts only when the displayed second changes, not every frame.
Portrait phone layouts place the countdown below the initial minimap/chat
stack; the first phone capture exposed the previously obscured kicker.

## Verification

- Deferred-clock regressions model a 2,200 ms reveal and 230 ms fade before READY
  and verify that the authority still has its full 5,000 ms afterward.
- Late countdown/playing snapshots, delayed initialization, cancellation, and
  prime/fade/readiness failures are tested without changing authority policy.
- Deferred Garage/paint tests cover private, rematch, and dedicated entry before
  and after reveal, including exactly-once cleanup and failed restoration.
- Acquisition regressions test failure while the world is still pending, first
  error preservation, and an unrelated pending/rejected transport.
- `preBattleOverlay.selftest.mjs` verifies waiting, second deduplication, release,
  rematch/solo reset, and timer cancellation. It is registered in `npm test`.
- Run `node tools/multiplayer-guest-entry.mjs` for the real guest handoff and
  countdown; host-left and host-stall variants exercise browser recovery. This
  tool uses one actual rendered guest and a protocol host, not two rendering
  devices or a distant-network latency certification.

Recovered-tree checks passed: all 56 `src/net` selftest files plus seven
entry/HUD/failure/version suites (63 files total), `npm run typecheck` including
core-unused checks, and `npm run build`. The five focused typed entry/overlay
owners passed code-quality metrics with no complexity violations or explicit
`any`/`unknown`. React Doctor's changed-file scan reported four test-only
warnings (small array assertions and intentionally sequential failure cases),
no runtime findings; its repository score remained 49/100. This is not a claim
that the unrelated complete fleet test suite was rerun or that the whole
repository has a clean scanner score.

Fresh local browser verification passed on September 7, 2026, using the real
guest application, separate pristine Chromium contexts, local WebRTC/signaling,
Frosthollow 1v1, and the existing protocol-host regression harness:

| Scenario | Guest viewport | Entry receipt | World stage | Result |
| --- | --- | ---: | ---: | --- |
| Cold-entry cancellation | 800×600 desktop | 6,143 ms | 3,295 ms | Pass |
| Host closes | 390×844 emulated touch | 6,412 ms | 3,546 ms | Pass |
| Host stops authority, transport stays open | 390×844 emulated touch | 6,089 ms | 3,182 ms | Pass |

Every run recorded visible `5,4,3,2,1`, a nonblack initial frame without rescue,
no uncovered pre-battle frame, successful live-seat reload, no browser errors,
and an actionable Garage-return error after failure. The final phone screenshot
also confirms the countdown label is clear of chat. The stalled-host path
displayed `Host not responding` and completed its existing bounded recovery
policy in approximately 67.3 seconds; this change does not shorten that policy.
The additional mobile-layout selftest passed (51 representative viewport
contracts), bringing the selected top-level selftest total to 64.

Reproduce with `node tools/multiplayer-guest-entry.mjs --out=<qa-dir>`, adding
`--mobile --failure-scenario=host-left` or
`--mobile --failure-scenario=host-stall`. Use the shared capture queue and run
these GPU checks serially. The optional output saves the countdown timeline,
load/black-frame receipts, recovery report, and screenshot; transient captures
are not committed. These are local dev-server regression runs, not production
performance benchmarks or physical-phone/distant-network certification.

The displayed application version remains revision-derived by `tools/appVersion.ts`;
this commit changes the version label without an unrelated package-version bump.

## Performance evidence and remaining investigation

An earlier baseline on revision `12a5b9aec` used two pristine browser contexts,
desktop 1280×900 low graphics, M1A3 1v1, Frosthollow, local signaling/WebRTC,
and one Apple M5 Max machine. Recorded entry totals were 23,145 ms host and
25,235 ms guest; guest world preparation alone was 18,365 ms. One browser long
task lasted 9,578 ms while the last visible loading label was `Sealing
battlefield`. Both first-frame checks were nonblack. The host's first visible
five had only approximately 757 ms left after fade. Temporary raw capture files
were lost when that temporary worktree disappeared, so these are historical
observations, not a retained reproducible performance certificate.

The 9,578 ms task's exact function is **not yet proven**. The label spans more
than assembly: `ensureWorld` also synchronously compiles the world and warms
shadows before returning. The compile reaches one `renderer.compile` call;
shadow warm's top-level cohorts are whole terrain, vegetation, and props
subtrees. Those are inspection-based suspects, not measured attribution.
Next isolate assembly, forward compile, and shadow warm with timestamped partial
receipts, then profile the same scenario. Do not claim historical 214–319 ms
battle-frame stalls are explained by this separate cold-entry observation.

Entry stages overlap; do not add them together. Moving visual initialization
into the measured module stage changes what that stage includes. Compare the
same click-to-visible interval, viewport, cache state, renderer count, and
network conditions before making a speedup claim. This lifecycle fix is not a
claim of zero lag, a universal load-time budget, or perfect multiplayer.
