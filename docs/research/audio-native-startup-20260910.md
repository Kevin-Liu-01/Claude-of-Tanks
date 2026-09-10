# Native audio startup — 2026-09-10

## Decision

Keep the existing audio startup policy. The tested silent-sink workaround did
not remove synchronous native `AudioContext` construction: fresh-browser
candidate constructors still took 137.9–139.6 ms, and eventual default-output
readiness became later. Functional success is not a performance success.
No game runtime change or further native experiment was authorized by this result.

## Production witness

The actual-control production capture
`deployment-upload-batches-production-actions-r1/report.json` tested
`v1.0.0+gbcf8ae4f0` on **Chrome 151.0.7922.47**. Its passive constructor observer
recorded **4550.0–4709.9 ms (159.9 ms)** on the page's `performance.now()` clock,
inside a 164 ms long task and the **4486.8–4715.9 ms (229.1 ms)** callback-start
gap. This attributes part of that particular gap to native context construction,
not the adjacent work or the constructor's internal OS/driver implementation.
Functional, loading-clock, Garage-gesture and cleanup gates passed.

HTML SHA256:
`83d40c88512a81e567bde99f101946052e4f16c1701b4aa89804fd97857f8cc7`.
Capture SHA256:
`4be85c77e2b4a9596a9046b8b8bd6956bc44b3e3543677409654626ca119f137`.
See [covered deployment evidence](covered-deployment-pacing-20260910.md).

## Experiment contract

The standalone committed [probe](../../tools/audio-default-sink-probe.mjs) uses
real trusted button clicks, native foreground/unmuted Chrome and its own shared
capture FIFO. A constructs `{ latencyHint: 'interactive' }`; B adds
`sinkId: { type: 'none' }`, then awaits `setSinkId('')` for the default output.
Neither arm specifies `sampleRate`. No game boot, microphone, device enumeration,
permission prompt, fake audio, autoplay bypass or quality change is involved.

The browser exposes [silent-sink construction](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/AudioContext)
and [asynchronous sink selection](https://developer.chrome.com/blog/audiocontext-setsinkid/);
these interfaces do not establish that construction or default-device discovery
is asynchronous. That was the hypothesis under test, not an assumed benefit.

### R1: shared-browser diagnostic, preserved failure

Chrome **151.0.7922.47**, three ABBA blocks, fresh browser contexts but one shared
browser/audio service. The first A constructor took 147.8 ms; subsequent A
constructors were 0.9–1.8 ms and B constructors 1.0–1.7 ms. This ordering cannot
demonstrate cold B startup because the browser service was already initialized.

All six A attempts passed graph/clock checks. All six B attempts selected the
default sink but were suspended immediately upon sink-promise settlement. R1's
premature immediate-running assertion closed them before observing eventual
resume; this is **not permanent-silence evidence**. Six separately clicked
default fallbacks passed and were excluded from candidate scoring. All 18 audio
contexts, 12 browser contexts, browser/server and FIFO owners cleaned up.
The original failed receipt remains unchanged.

### R2: fresh browser per arm, functional pass / hypothesis rejected

Exactly **A, B, B, A**, one fresh browser process/audio service per arm; the
previous browser exited before the next was admitted. Installed executable:
`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`; every launch
reported **Chrome 152.0.7977.83** and passed the explicit version gate. This is
not the same browser version as the production witness above.

R2 preserves the intermediate route-at-settlement receipt. If suspended, it
separately times a bounded `resume()` on that same context, then requires the
same default-route, nonzero analyser and audio/output-clock witnesses as A.
All times below are milliseconds, measured on each arm's own page clock.

| Arm | Constructor | Sync handler | Route settlement | Running route | Extra resume | Max callback gap | Long task |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 147.0 | 147.4 | 147.4 | 147.4 | — | 152.8 | 149 |
| B | 139.6 | 139.9 | 146.8 | 161.9 | 15.0 | 142.8 | 141 |
| B | 137.9 | 138.2 | 141.1 | 156.8 | 15.7 | 140.6 | 139 |
| A | 141.4 | 141.6 | 141.7 | 141.7 | — | 144.5 | 143 |

All four passed full readiness: running default sink, signal peak approximately
0.01, 560–576 ms of audio-clock advancement and 527–549 ms of output-clock
advancement over 601–614 ms wall time. Every arm retained **48 kHz**, **5.333 ms
base latency** and **24 ms output latency**. B's constructor remained a long
task; its median running-route time was 159.35 ms versus A's 144.55 ms.

Browser PIDs **63825, 63871, 63886, 63902** each exited zero and were subsequently
verified absent. All four AudioContexts and browser contexts closed; all four
servers/isolated cache lifetimes completed, FIFO released, and no application
or cleanup errors were recorded. `ok: true` means functional acquisition passed;
`hypothesisPassed: false` / `verdict: reject` rejects the performance workaround.

## Frozen receipts and verification

Evidence root: `/private/tmp/cot-interactive-baseline.gsRCvU/`. Raw JSON is
retained outside Git; it was not edited or overwritten.

- `audio-default-sink-native-r1/report.json`: protocol `audio-default-sink-ABBA-v1`,
  tool revision `66f790b889d682ce35631becd50679d978c9ef15`, acquisition SHA256
  `28df34362575acc2506db009d6fe5b2e3b77069bdfd51956997ef1b12413561a`,
  report SHA256 `4e65c20411b29c319eb97d8eb78d2bd54d836c712fd8289dc285cfbeb90b334f`.
- `audio-default-sink-native-r2/report.json`: protocol `audio-default-sink-ABBA-v2`,
  tool revision `68dd2ddbbaecce894c7f133f21dbbfe0a0ad2d2a`, acquisition SHA256
  `736152363efb72b8127f02556773d1381107614bccf5fd634b9848d25f9377b7`,
  report SHA256 `1d1360338acf31532e682b338742d54b28b51f4d9e2fa730b0f986c6127df5dc`.

The focused [CPU regression](../../tools/audio-default-sink.selftest.mjs) passed
through the ordinary selftest FIFO: trusted gesture/order, ignored/unsupported
sink options, suspended-after-switch recovery, resume rejection/timeouts,
cleanup failures, exact version gates and serial browser admission. Syntax,
diff and strict complexity gates passed. No full-suite or runtime acceptance
claim follows from these tooling tests.

## Preserved behavior and inference limits

[Lazy audio](../../src/audio/lazyAudio.ts) still owns one shared context with
interactive latency and browser-preferred sample rate/default output. Explicit
eligible Ready intent may prepare that context without mixer transfer or a
tone. Battle preserves loading audio and exact-context mixer adoption; verified
sticky activation permits the existing cover-paint opportunity, while legacy
activation retains in-gesture unlocking. Cancellation does not revive loading
audio, and ordinary Garage orbit is not sound intent. Existing retry, mute,
phase and fallback contracts remain unchanged; see
[Ready preparation](multiplayer-ready-audio-preparation-2026-09.md) and
[lazy-audio tests](../../src/audio/lazyAudio.selftest.mjs).

Native construction is synchronous on this tested browser path and remains an
observed startup limitation under the preserved options. An asynchronous
`setSinkId`/`resume` continuation does not make the preceding constructor
asynchronous. These samples do not identify its internal device query, driver
or OS cost, prove a universal browser lower bound, or establish an off-thread
replacement. Fresh browser processes do not reset OS/device caches. The probe
verifies browser-reported route and graph processing, not physical speaker
audibility or full-game loading performance. Four R2 arms are not broad-device
statistics. In particular, **none of this proves the cause of historical
214–319 ms gameplay stalls** or unrelated untraced frame gaps.
