# 0279 — Battle entry stages only reveal-critical work before first paint

## Decision

Decode the selected battlefield's baked minimap asset in the same acquisition
barrier as world construction. Before the first battlefield paint, construct
the player team, terrain contact, shadows, post-processing, and the exact
visible camera frame. Stream detached opponents and finish hidden combat-effect
programs during the existing two-second deployment countdown.

## Why

The former order began minimap decoding only after roster setup. The next
cooperative vehicle-stage yield then admitted that decode as a 1.1-second main
thread task, which diagnostics incorrectly attributed to the player tank.
Entry also reflected every private ANGLE uniform table for hidden effects and
built opponents that cannot render before spotting. On Apple Metal this added
roughly another second despite none of that work participating in the reveal
frame.

## Consequences

- The minimap, vehicle builders, materials, effects, shadows, and gameplay
  rules are unchanged; only independent work is overlapped or deferred.
- Hidden opponents finish during the deployment countdown before controls
  release. The existing generation guard still cancels stale entries.
- Per-vehicle timing now separates scheduler wait, texture upload, shader
  compile, and post-compile yield so background work cannot masquerade as a
  tank upload regression again.
- Static-preview performance probes ignore the expected local-only 404 for the
  optional GitHub-star service while production HTTP failures remain errors.
- The `gfxreset` diagnostic flag is consumed once per page, allowing the live
  quality governor to step High → Medium → Low instead of resetting itself on
  every preset read under sustained load.
- A three-map production-build gate measured 3.632–4.091 seconds to revealed
  battle, 5.648–6.102 seconds to control, and 257–420 ms worst frame gaps.
