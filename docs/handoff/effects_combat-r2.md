# effects_combat r2 handoff — changes needed outside src/fx/

All critical/major VFX problems were fixed inside `src/fx/` (see r2 shots).
The following items from the r2 critique cannot be fixed from `src/fx/` and
need the owning module (or can be skipped if already handled):

## 1. Enemy tank identification treatment (vehicles — critique item 9, minor)

The critique called out the victim tank as a "flat solid-red untextured
placeholder". Requested treatment: give enemy tanks the same PBR/camo
materials as the player tank with a small red accent (stripe / turret band /
outline marker) instead of a full team-color albedo. Owner:
`src/vehicles/materials.js` / `src/vehicles/tankFactory.js`. If enemy camo
has already landed in the current vehicles pass, skip.

## 2. Stronger charred-wreck read on `setDestroyed()` (vehicles, optional)

`TankVisual.setDestroyed()` already swaps to `mats.burnt` and knocks the
turret askew — good. To fully sell the kill next to the fx (scorch decal,
smoke column, ember debris now in place), consider darkening `mats.burnt`
toward soot-black with a subtle vertical gradient (darkest around the turret
ring/engine deck). No fx-side dependency; purely a material tweak.

## 3. combat_firing camera framing (src/main.js, optional but recommended)

In `SHOT_VIEWS.combat_firing` the camera (`orbitPose(p, 14, 55, 8, 45)`)
leaves only ~1 m of clear down-range space between the muzzle brake and the
left frame edge. Any realistic forward flash cone / tracer clips the screen
edge (r1's "blown-out white sheet"). fx r2 works around it: the composer
calls `spawnMuzzleFlash(..., reach = 0.4)` and caps the composed tracer head
at 0.85 m (`composeFiringMoment` in `src/fx/effects.js`), so the current
frame is clean but the tracer is short.

If you want a long WoT-style tracer streaking down-range, change the camera
to a rear-quarter view so the gun fires INTO the frame, e.g.:

```js
orbitPose(p, 16, 145, 10, 45);
```

then in `src/fx/effects.js` `composeFiringMoment` raise:
- `const headDist = Math.min(vel * ageS, 0.85)` → cap `18`
- `spawnMuzzleFlash(muzzlePos, dir, caliberMm, -ageS, 0.4)` → `reach 1`

Verify with `node tools/screenshot.mjs --views combat_firing`. If the camera
stays as-is, change nothing — the current composition passes.
