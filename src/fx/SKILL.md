---
name: src-fx-skill
description: Work on pooled particles, impacts, destruction effects, decals, and shared FX time.
---

# claude-of-tanks / src/fx

## Purpose
<!-- agent-docs:fill:purpose -->
Render combat feedback from authoritative events without modifying simulation.

## Mental model & key files
<!-- agent-docs:fill:model -->
`fxRuntimeAccess.ts` owns retryable battle-only module/runtime acquisition,
`effects.ts` composes event reactions, `particles.ts` owns typed pools, `clock.ts`
owns presentation time, `effectAttachments.ts` owns the attachment policy
(continuous emitter anchors, and which muzzle parts leave with the shooter's
velocity: the bright parts keep it, the propellant and smoke shed it within a
quarter second and then trail, the ground's dust stays), and `impactDecals.ts` owns bounded surface marks. Scene Studio's
cinematic layer (`cinematicFx.ts` runtime, `cinematicRecipes.ts` recipes) is
Studio-only: it reaches the battle runtime through `effects.cinematicPort()`,
which battle never calls, and its emitters tick on absolute timeline grids so
renders are step-size independent (`cinematicFx.selftest.mjs`).
Destruction presentation: `volumeMedia.ts` draws baked 3D smoke, fire and dust
(`tools/fx-volume-bake.mjs`; ledgered atlases, loaded at battle warm, desktop
tiers), `blastRecipes.ts` builds each munition x surface burst through it
(`surfaceLooks.ts`, `debrisChunks.ts`), `craterMarks.ts` keeps the ground's marks,
and `structureMask.ts` / `structureStages.ts` / `structureDebris.ts` lay a
building's stages into the world's own geometry through the core's seam
(docs/DESTRUCTION.md §16.4) on every tier. What falls lands where its flight
meets the ground (`ballisticLanding.ts`), and a stage's larger pieces are rigid
bodies of the one engine (`rubbleBodies.ts` over `debrisPhysics.ts`;
docs/DESTRUCTION.md §17); `tools/destruction-check.mjs` judges the result.
What a round throws off a tank depends on the part it struck: `strikeLooks.ts` has one look per plate material
(`event.material`, sim/plateMaterial.ts). Sparks and a hot flash come only off steel, rubber and canvas tear cold,
and the running gear throws the ground it carries. `strikeLooks.selftest.mjs` holds its sparks to the audio's steel.
A graze (sim/shellSurface.ts `grazes`) sprays its ground forward and low instead of standing a spurt up.

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->
Pool hot objects, bound lifetime/count, use event positions as presentation
inputs only, and respect pause/killcam/shot-mode time scaling.
A moving source's media trail (track skirt, exhaust) is laid by the distance it
travels through `trailCadence.ts`, never by a per-call coin toss, and each body is
sized against that spacing so neighbours overlap (EF.01: deploy 208's random gate
broke trails into separate clouds). `trailCadence.selftest.mjs` measures the
side-view coverage at 15-60 Hz. A running hull's exhaust is the predecessor's
sprite streak; the media billow is only the cold start and throttle-ups
(`exhaustTrail.selftest.mjs`).

## Common tasks → first action
<!-- agent-docs:fill:tasks -->
Trace the bus event, confirm the access owner is acquired before the consumer,
confirm pool teardown/reset paths, then test live battle, killcam, and rematch
behavior.

## Gotchas
<!-- agent-docs:fill:gotchas -->
Worlds and tank visuals are reused across matches; decals and emitters must not
survive reset. Network event IDs will be needed for deduplication.
The structure mask patches every props bucket material (its depth materials too)
at world activation: keep its only fragment discard the desktop hole cut (early
depth), and touch the seam's shadows on every frame the GPU moves a building.
The muzzle light sits 0.15 m behind its own gun's muzzle, so that gun's forward
faces would take hundreds of suns: a gun's pulse claims its near field
(`boundGunNearField`, `engine/muzzleNearField.ts`), which every cascade-shadow
material bounds at `MUZZLE_NEAR_SUN_K` x the sun within a capsule round that gun.
A new gun pulse of the muzzle light calls it too, only when `flashLight`
returned true: a refused pulse binds nothing, and the pulse still burning stays
its own gun's. `effectAttachments.selftest` drives every caller's lit and
refused shot and counts the callers, so a new site joins its list. The hull,
ground and other vehicles keep the bare light. A site that yields to a brighter
pulse still burning (the roof-gun flash port) asks `pulseOutranks`, the pulse's
own level now with neither side under the Accessibility flash, never the
light's intensity: the attack ramp holds that under the level for 42 ms, a
replay suppression zeroes it, the flash scales it and it was written a frame
back. Against the old intensity guard a decaying pulse hands the light over one
frame sooner at its crossing at the default flash of 1 (below it the old guard
passed the light sooner, once the level fell under peak / flash). `effectAttachments.selftest` pins that every
comparison of a light's intensity in `effects.ts` is with a constant. The
intensity reads left show the light as it is and decide no yield: applyLight's
near-field publish, `writeLocalLights` and its spot lights, the suppression
report, and `engine/vehicleGroundOcclusion.ts` `packGroundKeyLights` (lamps by
`light.intensity > 1e-3`). The explosion light's reads of a burning pulse go by
its age (`lightAge < dur`): `writeLocalLights`' blast, `updateWreckLight` and
`cinematicFx` through `explosionFlashAgeS`. The pulse's level law
(`pulseDecayK`, `muzzleAttackK`) also sizes its gun's near field
(`muzzleEnvelopeMax`), so a change to it moves both.
A fast gun's flash goes by its cadence (`game/shotCadence.ts`, release 272): the full flash
and its smoke once each 0.15 s per weapon, the rounds between only their core cards at their
own barrel, and a sustained gun's muzzle light held (relit each round past its attack, never
from black). A round with no simulation clock flashes in full, as before.
