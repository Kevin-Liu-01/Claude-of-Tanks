# Multiplayer launch-edge audio preparation — 2026-09-08

## Finding and bounded change

The repeatable ~200 ms pause before `__NETWORK_LOAD.startedAt` was real
application work, separate from CPU-profiler startup. Earlier completion-order
r2/r3 guest profiles attributed 200.215/195.016 ms of self samples to
`main-V_awLOXO.js:2182:166585`, the default `createContext` callback in
`src/audio/lazyAudio.ts`: `new AudioContext({ latencyHint: 'interactive' })`.
Private launch calls `audio.resume()` before presentation starts its trace.
The unprofiled host also stalled for 235/236 ms at that boundary.

Those profiles ALSO had 251.9/238.5 ms profiler-start brackets and initial
`(program)` sample weights of 250.798/237.342 ms. These are different intervals;
do not assign every 200 ms sample to either the app or the diagnostic tool.
The historical 214–319 ms gameplay stalls are not proven to share this cause.

A fresh, unchanged-build, timings-only control reproduced 241/203 ms host/guest
tasks between launch and network loading. No CPU profiler ran in that control.

`LazyAudio.prepare()` now creates/resumes the one shared audio context at an
explicit, locally eligible Ready click, from either the room drawer or Garage.
It does not transfer/build the mixer, synthesize PCM, play a tone, change phase,
or wait on the resume promise. Battle still adopts that exact context and owns
loading sound/mixer initialization. Normal launcher fallback remains for
spectators, automatic/live-room entries, and unsuccessful preparation.

Browser device creation remains synchronous: **this moves the one-time cost to
Ready; it does not eliminate it or prove smooth Ready animation**. Neither
hover/preload, invite auto-join, replicated room state, nor Unready opens audio.
The callback runs after existing local command guards, not after a server ACK.
An unavailable device, synchronous initialization error, or rejected/hung
resume cannot prevent the optional preparation call from returning. A later
gesture can retry. Existing Battle failure policy is otherwise unchanged.

The gesture boundary follows [MDN's Web Audio best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices).
There is no global pointer listener, pre-gesture device initialization, browser
autoplay override, or new mixer/cache per room.

## Native evidence

Local public builds; two fresh browser contexts on one Apple M5 Max using
Chrome 151.0.7922.47 / ANGLE Metal. Real controls create a private 1v1 room,
open the guest invite, Ready both players, wait for the independent fixed
Winter-map preloads, then Start. All three runs naturally selected clear/day;
HIGH preset, scale 1 at entry. No runtime quality/seed/weather overrides were
added. Subsequent 20-second-per-peer movement/fire samples use the maintained
tool's ordinary lower-quality workload and are not HIGH-entry frame budgets.

Evidence under the owner's untracked `.qa-entry/` directory is retained, not
edited or committed:

| Receipt | Profiler | Launch → trace, H/G ms | Launch → first hidden loader, H/G ms | Largest observed entry task, H/G ms |
| --- | --- | --- | --- | --- |
| `audio-baseline-timings-r1/report.json` | none | 244.2 / 214.7 | 1997.6 / 2055.7 | 241 / 203 |
| `audio-ready-timings-r1/report.json` | none | 59.4 / 26.3 | 1748.2 / 2062.2 | 134 / 91 |
| `audio-ready-profile-r2/report.json` | guest | 52.7 / 75.5 | 1737.3 / 2050.7 | 116 / 113 |

The host opening improved in these samples; **guest total reveal was essentially
unchanged**. This is proof of removing a particular launch-edge stall, not a
general loading speedup, stable frame-budget certification, or production test.
The R2 profiler still has startup overhead (largest sample interval 244.29 ms).
Its largest retained application self sample is now material work at 37.364 ms,
not the previous ~195 ms audio-context callback. The profile truncates low-rank
function rows; absence from that table is not a complete native-call audit.

Every run passed native invite/readiness, foreground 5–4–3–2–1 countdown on both
peers, verified battlefield frame without rescue, movement/fire, Garage return,
room closure and browser cleanup; zero page errors. Host/guest screenshot pairs
in each candidate receipt's `screenshots/` were visually checked for a rendered
tank, world and HUD rather than a blank canvas. Follow-on maximum frame gaps
were baseline 41.7/44.4 ms, candidate R1 50.4/46.5 ms and R2 46.1/53.2 ms, with
zero hard snaps. These still do not meet a universal 16.7 ms budget.

### Frozen identity

- Baseline HEAD: `3d640d07a9589f3dbc9886de98c50ca51a8c3209`.
  Its preserved build was produced before that commit, stamped
  `v1.0.0+g29ae6ebb2.dirty`; index SHA-256
  `31fcad07939f81af9b11daec96fa4382eda0e5215d7cf915143aa1f33e655e46`.
- Candidate base: `ca3ae80a212fb1f1a4b3efb7eb0a74f49f411006`, whose intervening
  commit only changes map-audit tooling. Build stamp `v1.0.0+gca3ae80a2.dirty`;
  index SHA-256 `2703deffde29f2b1a77823702eaf2ac6cc52586ffa7fda91946f7587f2292b6d`.
- Both candidate captures used that identical frozen build. R1 `src/` diff hash:
  `e9ac9cada56210934a0b4a6174cd993210e28d000cddbe4905c241f42a00de5f`.
  R2: `a83982a53ab8137cff9ad0151d4db890693e4d2b2528bd9b5324196fd0b4f4e5`.
  Only tests were strengthened between captures, not served runtime code.

## Regression gates and remaining work

Thirteen focused suites passed: lazy audio, audio timing, Play menu, loading
screens, play-surface runtime, room coordinator, network launcher, network
presentation, countdown, network barrier, entry observer, private-room UI tool,
and build version. The Play-menu suite executes the exact source event bindings
in Node VM as well as structural checks; it proves command/prepare order,
Unready, local guard rejection, stale identity, and synchronous Garage
preparation before deferred menu resolution. Audio tests cover no eager device,
context reuse/adoption, no mixer/tone, unavailable devices, failed-constructor
retry, synchronous/rejected resume retry and a non-settling resume.

Typecheck/core-unused and public build passed. Audio-owner complexity gates
passed: 29 functions, zero violations, no explicit any/unknown. Full-project
React Doctor baseline was 43/100 (pre-existing findings); final changed scope
was 92/100 with only an intentional await-in-loop warning in the callback-order
selftest. Cases wait separately to test microtask order; no suppression or
production per-frame work was added. Independent read-only review found no
blocker after executable callback tests were added.

Full-suite green is **not** claimed. A fresh focused reproduction still fails
the unrelated `sourceXFleet.selftest.mjs` T-90M geometry receipt (`27bb658d`
actual, `ffbd40d4` expected). No vehicle files or generated artifacts changed.

Remaining loading work includes first-draw/native shadow costs, mask shader and
asynchronous readback waits, the retained earlier nighttime failure, rapid or
late joins without Ready preparation, and production/broader-device coverage.
For mask work, add the existing readback timing breakdown before claiming the
wait interval is blocking CPU. The broader loading/transition goal stays open.
