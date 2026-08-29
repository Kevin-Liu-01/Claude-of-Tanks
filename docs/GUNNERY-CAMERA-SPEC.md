# Gunnery camera/aim coupling — deployed-build spec (gunnery r1)

Owner ground truth (2026-07-31): the deployed build at
**https://claude-of-tanks.vercel.app** carries the camera/aim behavior he wants
("camera in relation to where we're aiming"). This document is the coupling
spec **derived empirically** from that deployment with
`tools/aim-parity-probe.mjs` (identical scripted input against deployed and
local; per-frame traces in the probe's `--json` dump), plus the deliberate
local deviations and their rationale.

Deployment fingerprint: bundle `assets/index-C70t46o1.js` contains the
battle-load screen (`cot-bl`, commit c33c60f) and the mobile battle flow's
touch-layout gate (`innerWidth<=900`, commit 39e43c0), and none of the
uncommitted 2026-07-31 work — i.e. a recent committed `main` state whose
camera/aim source equals HEAD's `src/engine/cameraRig.ts` / `src/game/input.ts`.

## Derived coupling rules (the spec)

1. **Mouse-look leads the camera; the gun chases the reticle.** +400 px of
   mouse-right under pointer lock yaws the camera ~-50 deg (BASE_SENS
   0.0022 rad/px); the turret then converges the gun onto the camera's
   center-ray aim point. Measured end error gun-vs-camera: **-0.25 deg on the
   deployment, -0.25 deg locally.**
2. **Vertical mouse pitches the view; the gun follows within its physical
   elevation/depression limits** (deployed +25.96 deg cam / +21.52 deg gun at
   the clamp; local +25.13 / +21.61).
3. **Driving translates the camera with the hull without rotating the view**
   (chase anchor is the tank position, aim yaw is world-stable): hull moved
   2.6 m -> camera moved 2.75 m, camera yaw drift 0.00 deg (local: 2.38 m /
   2.61 m / 0.00 deg).
4. **Hull rotation never rotates the camera; the turret compensates** to keep
   the gun on the world-space reticle: 42 deg of hull turn produced 0.00 deg of
   camera yaw drift and -0.02 deg of net gun-bearing change on BOTH builds.
5. **Wheel zoom ladder:** arcade orbit steps [24,18,13,9,6,4] m, then sniper
   x2/x4/x8; FOV 60 in arcade, 60/zoom scoped. Mode boundary at the last
   arcade step (wheel-in) / first sniper step (wheel-out).
6. **Cursor-aim fallback (pointer lock denied — embedded panes):** the turret
   chases the terrain point under the real cursor; **the camera stays parked**
   behind the tank (no camera-follow scheme). Owner course-correction
   2026-07-31 confirmed the classic scheme; an experimental
   camera-follows-gun ease for this mode was built and then **reverted**.

## Parity traces (identical scripted input, 2026-07-31)

| Sequence | Metric | Deployed | Local (fixed tree) |
|---|---|---|---|
| A +400 px yaw sweep | camera yaw delta | -54.21 deg | -49.95 deg * |
| A | gun-vs-camera end error | **-0.25 deg** | **-0.25 deg** |
| A | hull yaw delta | 0.00 | 0.00 |
| B 200 px pitch sweep | camera pitch delta | +25.96 deg | +25.13 deg * |
| B | gun pitch delta | +21.52 deg | +21.61 deg |
| C 1.2 s W drive | hull/camera translation | 2.60 m / 2.75 m | 2.38 m / 2.61 m |
| C | camera yaw drift | 0.00 deg | 0.00 deg |
| D 1.0 s A turn | hull yaw delta | +42.42 deg | +41.72 deg |
| D | camera yaw drift | 0.00 deg | 0.00 deg |
| D | net gun-bearing change | -0.02 deg | -0.02 deg |
| E zoom ladder in x6/out x6 | pitch net across ladder | +0.33 deg | **0.00 deg** |

\* deltas differ by CDP input pacing vs frame sampling (one 40 px step of
noise), not by sensitivity — both builds integrate the same 0.0022 rad/px.

Raw per-frame traces: `aim-parity-probe.mjs --json` dumps
(`parity-deployed.json` / `parity-local.json` in the session scratchpad; the
summaries above are reproducible with the commands in the probe header).

## Deliberate local deviations from the deployment

1. **Scope pitch preservation (the owner's actual complaint — "aimed by
   scrolling -> looking at the sky").** Deployed behavior: `enterSniper` lifts
   any close (<50 m) aim to a -1.5 deg scan pitch and ray-probes UPWARD in
   2 deg steps (to PITCH_MAX +30 deg against rising ground), and `exitSniper`
   KEEPS the scope-mutated pitch. Each close-aim scope cycle ratchets the view
   up (+8.5 deg on flat ground, sky-bound on slopes) with nothing restoring
   it. Local fix (`cameraRig.ts`): once the player has aimed (`aimTouched`),
   scope entry preserves the reticle's world point exactly (yaw+pitch
   re-solved from the gun trunnion), and every exit re-solves the arcade PITCH
   from the current reticle point (yaw stays the classic behind-the-cannon
   sync). The never-aimed battle opening keeps the r4 dirt-guard scan-lift.
   Gate: `tools/aimflow-probe.mjs` (preserved-point pitch error <= 1.25 deg at
   every zoom step; 3 close-aim scope cycles ratchet < 2 deg; parity trace E
   nets 0.00 deg vs deployed +0.33 deg).
2. **RMB aiming (separate owner ask).** `settings.rmbMode`:
   `hold` (default) = hold RMB to scope, release returns to the pre-scope
   arcade orbit + preserved pitch; `toggle` = tap to toggle scope; `freelook` =
   classic gun-lock free look. Wired
   through the existing `freeCamera` binding + settings GAMEPLAY chips.
   A separate rebindable `freeLook` action (default `Caps Lock`, secondary
   `Left Alt`, controller
   `RB`) holds the current turret rotation and gun elevation while the camera
   continues updating the one live sight point. Release lets the articulated
   gun catch up without snapping the view; guided missiles receive the live
   sight throughout the hold;
   `Left Shift` toggles sniper mode, and the selected RMB mode is
   unchanged.
3. **Interaction-mode regression fix.** `input.isTouchLayout()` once treated a
   narrow window as a touch device (commit 39e43c0), which disabled pointer
   lock AND the cursor-aim fallback in embedded desktop panes. It now consumes
   the shared responsive contract's coarse/fine input signal, independent of
   width: a resized mouse window keeps desktop aim while an iPad with a
   laptop-class CSS width still receives touch controls and overlay panels.
4. **Physical-bore cannon-marker parity (owner follow-up, 2026-08-15).** The
   fixed camera marker is only the requested look direction. The aiming circle
   and gun marker expose the actual articulated bore as it traverses and as it
   pins at elevation/depression limits, matching Wargaming's official controls
   guide. A shell always leaves along that visible bore: the former two-degree
   server snap and trigger-time ballistic auto-elevation are removed. The gun
   lay now uses an exact inverse YXZ hull transform, avoiding the old >1°
   pitch/roll error on combined sidehills. Unguided shells drop physically
   after muzzle exit; bots visibly elevate their own guns using an explicit
   pre-fire ballistic lay. Gate: `node tools/reticle-shot-parity-probe.mjs`.
