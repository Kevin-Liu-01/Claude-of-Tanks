---
name: tools-marketing-shots-skill
description: Generate deterministic branded marketing screenshots from staged game states.
---

# claude-of-tanks / tools/marketing-shots

## Purpose
<!-- agent-docs:fill:purpose -->
Capture reproducible public-facing game imagery without changing live gameplay.

## Mental model & key files
<!-- agent-docs:fill:model -->
Scripts drive the game's shot/studio hooks and save canonical viewport outputs;
the game remains the renderer of record.

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->
Pin viewport, quality, camera, map, vehicle, sim time, and UI visibility. Keep
captures reproducible and separate from runtime assets.

## Common tasks → first action
<!-- agent-docs:fill:tasks -->
Read the screenshot contract, run one known shot, compare composition and pixel
dimensions, then generate the requested set.

## Gotchas
<!-- agent-docs:fill:gotchas -->
Do not use stale source/comparison models or transient overlays in public shots.
Stop the capture server/browser at closeout.
