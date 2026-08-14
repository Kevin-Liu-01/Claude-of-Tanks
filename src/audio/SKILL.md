---
name: src-audio-skill
description: Work on event-driven spatial audio, radio voices, engines, weapons, ambience, and mix state.
---

# claude-of-tanks / src/audio

## Purpose
<!-- agent-docs:fill:purpose -->
Translate canonical game-bus events and listener state into responsive spatial
audio without owning gameplay decisions.

## Mental model & key files
<!-- agent-docs:fill:model -->
`audio.js` owns Web Audio routing and synthesized/decoded effects;
`voices.js` owns crew-line scheduling and priority.

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->
Initialize only after user gesture, subscribe through the injected bus, cap
voices/loops, and stop stale sounds on phase or entity teardown.

## Common tasks → first action
<!-- agent-docs:fill:tasks -->
Trace the originating bus event, verify payload semantics, then test scheduler
timing and live pause/phase behavior.

## Gotchas
<!-- agent-docs:fill:gotchas -->
Camera direction and occupied-tank position form a hybrid listener. Network
events may arrive late or duplicated, so presentation must key/dedupe them.
