---
name: tools-skill
description: Maintain deterministic performance, screenshot, fleet, geometry, asset, and release verification tools.
---

# claude-of-tanks / tools

## Purpose
<!-- agent-docs:fill:purpose -->
Provide reproducible evidence for game performance, rendering, tank fidelity,
asset provenance, and public builds.
`attribution-audit.mjs` enforces the repository-wide Kevin B. Liu notice,
named authorship for every playable model, and exact records for tracked
external model files.

## Mental model & key files
<!-- agent-docs:fill:model -->
Performance probes drive the browser and record JSON; fleet/geometry tools audit
authored tanks; screenshot/visual tools stage canonical views; strip/release
tools enforce public asset boundaries. `local-import-integrity.selftest.mjs`
rejects stale static source/server/tool import paths after file migrations.

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->
Pin URL, flags, roster, timings, and output path. Make gates fail visibly and
avoid editing generated evidence manually. Combat-anatomy generation always
uses `ALL_TANK_IDS`; donor/retired spec rows are not part of the playable gate.

## Common tasks → first action
<!-- agent-docs:fill:tasks -->
Read the tool's CLI/help and its current evidence doc, run a baseline, then
compare the same scenario after changes. Multiplayer release checks include the
two-player persistent-room soak, human 2v2 (`npm run test:net:four`), and full
human 7v7 capacity (`npm run test:net:seven`) browser paths. Visual combat
certification is the separate `npm run test:net:seven:live` gate: two real 7v7
matches render the host and an impaired remote client while all fourteen tanks
move, fire, deal damage, and report transport/prediction/frame/shadow health.
`npm run test:net:seven:full` continues both pristine-context battles through a
natural authority result and proves that every participant retains the same
waiting room with readiness reset. It uses the existing 60-second simulation
limit only inside the certification authority; production keeps its 900-second
safety cap. Use `--only=host` or `--only=client` for targeted diagnosis.
`npm run net:prod:check` probes distributed signaling and TURN independently,
then uses a pristine browser context with relay-only ICE policy to require a
real relay candidate. URL presence is not allocation proof. Use
`--dependency-only` only to diagnose endpoint health; failure output must
retain both dependency results so one outage cannot mask the other.
Cold-start claims require `npm run perf:cold`; use `--sessions` for repeated
cache-disabled contexts and record `--cpu`, `--down-kbps`, `--up-kbps`, and
`--latency` so a warm navigation cannot masquerade as first-visit reliability.
The standard 4× CPU, 150 ms, 1.6 Mbps gate enforces an 8-second navigation-to-
ready ceiling and a 2.5-second post-transfer application-work ceiling for every
pristine session; slower custom conditions must declare intentional
`--max-wall-ms` and `--max-app-ms` budgets rather than silently weakening the
default evidence.
Garage-entry claims additionally require `npm run perf:garage-entry`. The
standard 4×-CPU five-second sample starts from an empty browser cache and fails
on post-ready environment texture warming, eager fleet/map artwork, frame-gap
spikes, long-task bursts, or console errors. Environment-transition claims use
`tools/garage-variants-probe.mjs`; exercise all ten destinations, rapid stale
selection, cache eviction, persisted reload, iPad, and phone layouts.
Static-screen and transition claims require `npm run perf:resources:gate`; it
records task/script CPU, forced-GC heap, scene and renderer residency, cache
ownership, actual paint cadence, and complete-frame draw/primitive totals
across Garage, battle, and returned Garage. The gate enforces broad CPU, heap,
shader-program, geometry, texture, draw-call, primitive, cadence, and
cache-residency ceilings; its frame history also attributes exact native-shadow
submissions by cascade mask and reports conservative scene-owner,
texture-source, and program-use distributions. Do not reduce it to an FPS-only
check. Static Garage presentation is one watchdog paint per second; the
workshop must publish its proxy-safe shadow-pruning receipt before the gate's
settled sample.
Tank work must run `npm run tank:anatomy:update` before asset/release checks;
the update refreshes the receipt map and only the three fleet technical views,
preserving unrelated garage/top/side/markings assets.

## Gotchas
<!-- agent-docs:fill:gotchas -->
Many `tmp-*` tools and `.qa-dev/` outputs are transient and must not be staged.
Own and stop every dev server/browser process you start.
