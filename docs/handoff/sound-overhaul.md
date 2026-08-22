# Handoff — sound quality and routing audit (2026-08-22)

## COMBAT-SFX r3 quality round

The r2 event coverage and spatial model were sound, but its timbre was not.
Offline analysis reproduced player reports: the penetration sample placed
34.8% of its energy in 2–6.5 kHz narrow metal modes, ricochets placed 48.5%
there, and the largest explosions placed 88–94% below 120 Hz with only 3–7%
in the audible 120–1200 Hz body band. In practice that produced small “tin
can” impacts and muddy blasts, especially on phones and laptop speakers.

r3 replaces all 29 deterministic combat assets and both live fallbacks. Armor
hits now combine short contact fracture with broad 185–1180 Hz plate flex;
ricochets use compact scrape/glance motion over a plate body; cannon reports
balance pressure, bark, and outdoor tail; explosions balance sub pressure with
low-mid blast body and wide debris. Current preview measurements are:

- penetration: 22.2% bass, 56.3% body, 0.1% harsh presence;
- ricochet: 0.0% bass, 49.8% body, 9.9% presence;
- tank destruction: 35.0% bass, 31.1% body, 4.9% presence;
- cannon classes: 40–43% bass, 31–35% body, 3.5–4.1% presence.

`tools/make-sfx.mjs --verify` now gates all preview mixes on integrated
loudness, true peak, payload, bass, body, and harsh-band energy. This prevents
both narrow metallic ringing and sub-only mud from returning.

The runtime mix also changed. Master compression moved from 8:1 with a 3 ms
attack to 3:1 with a 12 ms attack, and the soft-clip knee moved from 0.55 to
0.78, preserving authored transients while still containing 7v7 volleys.
Broad combat EQ adds 360 Hz body and trims 2.7 kHz presence. Continuous audio
now resolves turbine, modern diesel, legacy diesel, and light-diesel vehicle
families; T-80 and Strv 103 correctly use turbine character. Running gear,
turret servos, reloads, collisions, UI cues, and garage workshop foley were
retuned away from narrow high-Q bands.

The browser probes preserve the audible battlefield horizon. r3 adds a modest
long-range cannon-tail carry after 180 m so a 900 m report remains measurable
without lifting near shots. The real browser mix now records combat one-shots
at -20.3 dBFS RMS and the representative battle mix at -22.8 dBFS RMS, leaving
material headroom instead of keeping the master compressor continuously hot.

## Routing and spatial contract

The current contract lives in `docs/ARCHITECTURE.md` §3.9. The earlier routing audit removed
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
