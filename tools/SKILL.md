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
tools enforce public asset boundaries.

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
waiting room with readiness reset.
Tank work must run `npm run tank:anatomy:update` before asset/release checks;
the update refreshes the receipt map and only the three fleet technical views,
preserving unrelated garage/top/side/markings assets.

## Gotchas
<!-- agent-docs:fill:gotchas -->
Many `tmp-*` tools and `.qa-dev/` outputs are transient and must not be staged.
Own and stop every dev server/browser process you start.
