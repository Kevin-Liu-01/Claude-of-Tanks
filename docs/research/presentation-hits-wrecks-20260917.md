# Scope exit, wreck smoke, hit-mark ownership, frontline reinforcement (2026-09-17)

Owner round 11: "if you die you should get kicked out of scope mode"; "fire/smoke effects intrinsically linked to the
vehicle object/corpse (remove with corpse; rethink exceptions)"; "hit marks registered to hull when on turret →
attach to turret/gun"; "capturing bases in frontline assault shouldnt reset tanks".

## Death leaves the scope (camera rig, death r1)

`src/engine/cameraRig.ts` `update()` checks the player's own `combat.destroyed` before any early return: a wreck in
SNIPER calls `exitSniper(true)` (Shift-exit semantics — the pre-scope orbit step comes back) the frame the tank
dies, whatever presentation follows (death cam, killcam pose, spectate, result). `enterSniper()` refuses a wreck,
so the scope key is inert until a respawn clears `destroyed`; `startDeathCam()` clears the scoped flag the same
frame. Receipt: `cameraRig.selftest.mjs` death r1 block (alive holds; wreck leaves; cannot re-enter; external pose
does not hide the rule; released rig resumes in arcade).

## Wreck smoke rides and leaves with the corpse (fx, wreck r1)

Before: a kill raised a world-fixed 40 s column (+35 s smolder) at the death position, regardless of the corpse.
Now `spawnDestruction(..., wreckOf)` keys the column `wreck:<id>`; `syncColumnAnchors` anchors it to the corpse's
visual root through `syncSubjectEmitterAnchor` (a shoved wreck carries its smoke) and retires it the frame the
corpse is gone: the entity no longer resolves, has no visual root (released to the pool), or reads alive again
(`visual.isDestroyed()` false / `combat.destroyed` false after it was once seen wrecked — a respawn). Killcam
replays (`replaySuppressed`) skip the alive check because they restage the victim intact for a moment. Composed
replays, warm-ups and Studio pass no id and keep the world-fixed column. Attachment policy:
`destroyedTankColumn: 'wreck-local-emitter'`. Exceptions kept on purpose: terrain scorch and track prints stay
world-fixed (they are on the ground, not on the vehicle); burst particles stay world-space after birth (smoke
should trail a moving tank, not ride it rigidly). Receipt: `effectAttachments.selftest.mjs` wreck block (headless
`createFx` with the canvas shim: raise, follow, revive → gone, release → gone, unnamed → world-fixed).

## Hit marks belong to the rig that owns the struck skin (impactDecals, owner r1)

The armour frame names the PLATE that stopped the shell; the rendered surface under the contact can belong to
another rig (hull armour boxes reaching into the turret volume, mantlets modelled on the gun, splash contacts
routed hull-local by the envelope guess). `adoptVisualOwner` casts the same launch ray as the skin clamp against
the whole vehicle, walks the first visible opaque hit up to `rig_gun` / `rig_turret` / the root, and re-parents the
stamp there (contact re-expressed in the owner's frame) before `clampToSkin`. Receipt: `impactDecals.selftest.mjs`
owner block — a hull-frame contact on turret skin lands in `rig_turret`, a hull contact stays on the root, a
hull-frame contact on the gun tube rides `rig_gun`.

## Capturing a sector reinforces the line (matchModes)

`startAssaultWave` re-fielded the whole horde on every line advance (`fieldWave(drawWave(n))`: living defenders
revived at spawn with fresh identity and health). Now only the opening wave is a fresh draw; every later sector
calls `reinforceLine(n, healthScale)`: living defenders keep identity, position and damage; the shortfall arrives
as a fresh draw (rested identities first, this sector's wrecks last); destroyed bot allies still come back with the
captured sector. Receipt: `matchModes.selftest.mjs` reinforcement block (scarred defender keeps hp/position, the
wreck stays a wreck, exactly two arrivals at the new line's strength).
