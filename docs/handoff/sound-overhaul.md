# Handoff — sound quality and routing audit (2026-08-18)

The current contract lives in `docs/ARCHITECTURE.md` §3.9. The audit removed
the old 120/140 m remote-engine cutoff, made the occupied vehicle explicit in
listener state, and added a scoped interior/headset mix that preserves level
while reducing exposed track and muzzle high frequencies. The occupied engine
is always retained; up to the nine nearest remote engines use 900/1000 m range
hysteresis and monotonic distance gain/filtering. One-shots use the same wider
battlefield distance curve and remain measurable at 900 m.

Canonical audio routing now covers shell reports and impacts, terrain expiry,
tank destruction/fire, blocked-drive impact, tank-on-tank ram, prop crush,
module state, reload, spotting, phase/result, and killcam events. Networked
shell reports preserve the authoritative muzzle index and muzzle position.
Leaving battle tears down world loops; killcam ducking is applied before its
first impact rather than waiting for the next frame.

Verification is split by failure domain:

- `node src/audio/audioTiming.selftest.mjs` — pure distance, perspective,
  scheduling, and weapon-report contracts.
- `node tools/audio-spatial-killcam-probe.mjs` — real browser PCM for own tank,
  scope, remote distance matrices, engines, ram, killcam, and phase cleanup.
- `node tools/audio-probe.mjs` — recorded canonical event, voice, bus-slider,
  clipping, and live-mix matrix under `shots/audio-probe/`.
- `node tools/sfx-smoke.mjs` — baked layers, bass, volleys, and clipping.
- `node tools/voice-smoke.mjs` — production event gates and radio scheduling.
- `node tools/make-sfx.mjs --verify` and
  `node tools/make-voices.mjs --verify` — asset loudness, peak, duration, and
  payload budgets.

The visible countdown culminates in the `battle:rollout` horn and radio call;
there is no separate per-number tick in the current mix.
