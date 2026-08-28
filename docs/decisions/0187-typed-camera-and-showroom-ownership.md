# 0187 — Battle and showroom camera ownership is strict TypeScript

Status: accepted

## Decision

Arcade orbit, sniper optics, shared aim-ray publication, collision pull-in,
terrain clearance, battle cinematics, death camera, ally spectating, trauma and
recoil response, deterministic capture poses, and Garage showroom framing are
owned by `src/engine/cameraRig.ts` behind explicit camera, entity, raycast,
input, and lifecycle contracts.

The application composition root consumes the exported rig directly. Its
former duplicate camera-runtime interface is removed; the not-yet-migrated
game-entity shape is narrowed only at the one construction boundary.

## Why

The camera is simultaneously a rendering owner and part of the firing
contract. Unchecked player visuals, aim input, cinematic state, spectate state,
showroom geometry, and DOM-owned letterboxing made it easy for presentation
changes to desynchronize the reticle, physical bore, or camera lifecycle.
Those relationships need to be visible to both maintainers and the compiler.

## Consequences

- Every orbit distance, pitch limit, zoom step, damping constant, collision
  margin, cinematic path, trauma response, and showroom framing rule remains
  unchanged.
- Battle raycasts distinguish their required hit data from optional diagnostic
  metadata, and mobile auto-aim accepts the minimal point contract it consumes.
- Cinematic, death-camera, and spectate states are distinct nullable owners;
  their transitions cannot accidentally read fields from another camera mode.
- Garage bounds use typed reusable vectors and explicit mesh narrowing without
  adding per-frame allocation.
- The root no longer maintains a second partial description of the rig.
- Strict typecheck, shared aim, frame-input, mobile-auto-aim, replay-pose,
  showroom lifecycle, production build, and import-integrity gates certify the
  migration.
