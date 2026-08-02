# perf-smooth r1 — sim-step measurement + handoff (goal 5, no code landed)

The round charter allowed sim-step work ONLY if provably semantics-preserving
(spotting gates are gameplay contracts). The measurement says the premise has
moved, so this round lands measurement + this handoff instead of code.

## Measurement (tools/tmp-perfsmooth-simprofile.mjs, 15 s driven 14-tank battle,
## verdant, pinned r7 worst-case roster, V8 sampling profile @200 µs)

Raw: shots/perf-smooth-r1/simprofile.json (this tree, post perf-smooth-r1).

- Total `src/sim` + `src/game` self-time: **487 ms / 15.3 s ≈ 32 ms/s ≈
  0.53 ms per 60 Hz frame** for the whole 14-tank sim+AI slice.
- Leaders (self-time over the window):
  - `collide` (state.js:1125) — 186 ms (38% of the sim slice)
  - `avoidObstacles` (ai.js:1006) — 122 ms (25%)
  - `movement.updateTank` — 45 ms
  - spotting TOTAL (`getConcealment` 19 + `bushBonusBetween` 18 +
    `spotting.update` 2.2 + `isSpotted` 1.9 + `bushNearby` 2.2) — **~43 ms
    (≈2.8 ms/s ≈ 0.05 ms/frame)**
- For scale, the same profile's engine-side leaders: `uniformMatrix4fv`
  4427 ms (draw submission — shrunk by this round's draw-call work),
  `simplexFast.noise` 734 ms + `terrain.heightAt` 482 ms (wind/LOD/ground
  probes), `tankFactory.placeLinks` 284 ms (track-link pose updates).

## What this means for the battle-ai r7 "sim step 1.68 → 4.49 ms" number

On this tree the sim slice is nowhere near 4.49 ms/frame, and
spotting/LOS-pairwise is ~6% of a small pie — either the r7 measurement
included engine work billed to the sim step, or the r7 tree's spotting
hot-path has since been amortized. **Re-measure before optimizing spotting;
by this profile it is not worth an amortization's risk.**

## If a future round still wants sim-step wins (in measured order)

1. `collide` (state.js:1125): pairwise tank-tank + tank-prop sweeps each
   step. Semantics-safe options: spatial hash reuse between steps (positions
   move < 0.5 m/step; rebuild every K steps with a K·vmax margin), and an
   early AABB reject before the OBB math. No gameplay contract encodes
   collide's evaluation ORDER; resolution stays per-step.
2. `avoidObstacles` (ai.js:1006): per-bot obstacle scans against the props
   list. The scan result feeds steering smoothing, not a gate — staggering
   bots round-robin (each bot re-scans every 2-3 steps, using its cached
   avoidance vector otherwise) changes steering by less than the existing
   smoothing constant. Verify with the movement selftests + a driving-lane
   probe (bots on the same seeds should keep identical waypoint sequences).
3. `placeLinks` (tankFactory): track-link matrix recompute runs per frame
   per tank regardless of distance; distance-gating updates for tanks
   > ~150 m from the camera (LOD1 already hides greeble there) is a pure
   visual-update amortization, not sim semantics at all — the safest win of
   the three and it is in the ENGINE slice, not the sim step.

## Spotting contract notes for whoever picks this up

- `SpottingSystem.update` already runs on its own cadence (see
  src/sim/spotting.js); `isSpotted` reads a cached set — the expensive
  pairwise pieces are `getConcealment`/`bushBonusBetween`, which the profile
  shows as ALREADY CHEAP in this roster/map.
- The spotting selftest (99 checks) pins reveal/forget timing; any staggering
  must keep `timeS`-driven gate edges bit-identical for the same inputs, or
  it is a gameplay change and out of a perf round's charter.
