# M48A5 Patton — reference packet (release 262 rebuild)

Exact vehicle: **105 mm Gun Tank M48A5**, the US Army's 1975-79 Anniston conversion of M48A1/A3 hulls to the M60's
105 mm M68 gun and AVDS-1790 diesel, in its standard post-1976 fit: the Israeli-designed low-profile cupola with the
commander's 7.62 mm M60D, a second M60D at the loader's hatch, the xenon searchlight over the gun, five return rollers
on the M48A1 hull and no track-tension wheel. Earlier history of this id (the ATModeler print, the 2026-08 builds, the
258 mantlet fix): [m48.md](m48.md).

## Current status

- Updated: 2026-10-27 (lane `item/patton-family-262`, worktree `~/cot-lanes/patton-family-262`, base `b93941ce9d`).
- Owner request: "also should update/redesign the m47, m46, and m48 pattons"; for the batch, "update/redesign ...
  turrets and hullls as well based on proper historical referrences so they will no longer look so chungus". Mid-run,
  2026-10-27: "use this patton for the m48" with `~/Downloads/m48a5_patton.glb`.
- Implementation: new hull, turret and gun in `src/vehicles/profiles/pattonCast.ts` (`buildM48A5CastSteps`). The old
  `buildM48` and its configs were deleted from `patton.ts`.
- Qualification: see the release-262 receipts table at the end.
- Publication: lane branch only; integration through Claude of Tanks Main (release 262).

## Sources

| Key | Source | Use |
|---|---|---|
| OWNER | `~/Downloads/m48a5_patton.glb`, ater.studio, "M48A5 Patton", https://sketchfab.com/3d-models/m48a5-patton-54472c743ee3489994b0d638c14789f4, Sketchfab Standard licence, sha256 `a7c370976e97612da398735573f810984c48ff57df125c05208971064089c7fc`, 13,253,388 bytes | The owner's chosen shape reference. Separate hull, turret, gun, track and running-gear nodes; metres, ground at y 0, faces -z (registered with `yawOffset: Math.PI`). Local comparison oracle `public/models/tanks/community/m48a5_patton_ater.glb` (gitignored, never shipped) |
| WP48 | https://en.wikipedia.org/wiki/M48_Patton (Hunnicutt 1984 p.438; 2015 p.242) | dimensions, gun limits, conversion history |
| AFV48 | https://afvdatabase.com/usa/m48patton.html | per-variant table: hull length with fenders, track, rollers, idlers |
| WP68 | https://en.wikipedia.org/wiki/M68_tank_gun | M68 tube, eccentric evacuator |
| TMB | https://tankmuseum.org/article/the-patton-family/ | identification (rounded hull front, evacuator halfway down the barrel) |
| Photos | Wikimedia Commons: `Product_Improved_M48A5.jpg` (TACOM 1976, right profile, PD), `M48A5.png` (Anniston 1975, PD), `Family_Day_1981_-_Children_Examining_a_M48_Patton.jpg` (PD), `M48A5_Forsvarsmuseet_01.jpg` (CC BY-SA 4.0, Bene Riobo) | configuration checks |

The ATModeler print (`m48a5_atmodeler.glb`) is retired as the comparison oracle: it has seven road wheels, a 12.6°
pitched tube and a primitive dome (its gate packet read 59.6). Full research notes:
`~/cot-lanes/patton-262-evidence/references-research.md`.

## Gap table — release 260 build vs sources vs release 262 build

| Item | Release 260 build | Source | Release 262 build |
|---|---|---|---|
| Hull length with fenders | 6.79 m | 6.871 m (AFV48); owner model 6.93 | 6.93 m over the hull rig (fender tips, rear grille) |
| Width over tracks | 3.631 | 3.632 m (115 in centres + 28 in track) | track 0.711 on 2.921 centres; 3.685 over the end-wheel hubs |
| Height | 3.749 (top) / 3.09 spec | 3.061 m over the low-profile cupola | roof 2.64, cupola 2.86, spec 3.06 |
| Belly / ground clearance | 0.626 | 0.419 m | 0.43 |
| Turret casting | 2.96 W × 0.99 H × 3.04 L (old print's 1.48 half-width) | owner model: 2.40 W, floor 1.83, roof 2.65, nose z 1.86 to tail -1.12 | 2.36 W × 0.80 H × 3.00 L; floor 1.84, roof 2.64 |
| Turret ring | z 0.563 | 85 in (2.159 m); owner model's ring well centre z ≈ 0.48 | z 0.48, y 1.595 |
| Road wheels | 6, r 0.34 | 6 dual, ~26 in | 6, r 0.33, 0.80 m pitch (owner model) |
| Return rollers | 5 | 5 on M48A1-hull A5s (3 on A2 hulls) | 5 at y 1.15 |
| Track-tension wheel | yes (z -2.487) | absent on M48A3/A5 (AFV48; photos) | none |
| Gun | M68, trunnion 2.10 at z 1.514 (258 owner fix) | 105 mm M68 L/52; overall 9.307 m; axis 2.00 m | trunnion kept at 2.10 / z 1.514; muzzle 5.914 (overall 9.29); evacuator 3.56-4.12 |
| Gun limits | +20 / -9 (M60A1 donor) | +19 / -9 | +19 / -9, measured depression curve |
| Cupola and MGs | commander M2, loader M60D | low-profile cupola + commander's M60D, loader's M60D | low-profile cupola (r 0.42) + M60D; loader's hatch + M60D |
| Searchlight | on the mantlet | over the gun shield | on brackets over the tube, ahead of the shield |
| Smoke dischargers | none | not confirmed on US A5s | none |
| Rear | louvred plate | grille doors on the upper rear plate | grille doors, tail lights, pintle, phone box |
