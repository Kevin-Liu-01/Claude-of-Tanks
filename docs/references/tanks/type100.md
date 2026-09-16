# Type 100 (`type100`) — reference packet (rebuilt 2026-09-16)

**Exact vehicle modeled:** the PLA's next-generation medium tank ZTZ-100 / "Type 100" as shown in
the owner's ten reference renders (renderhub.com/finiask/ztz-100-or-type-100-tank, viewed
2026-09-16): a long, low hull with a single wide glacis over a steep lower bow, chamfered bow
corners, vertical upper sides flush with seven bolted skirt panels over a rubber apron, two hull
crew hatches at the glacis top, a round intake grille and a louvred deck panel behind the turret,
twin louvred exhaust grilles between the tail lamps; a low unmanned turret with a wedge front and a
boxed 105 mm mantlet, the gunner's sight box right of the gun and the panoramic drum left of it,
two roof hatches, four corner sensor cubes, twin quad hard-kill pods on the rear roof corners, the
tall mast-mounted remote weapon station at the rear centre, two whip antennas and a louvred
turret-rear grille. Digital woodland finish; hull number LZ|83 with the PLA star on both upper hull
sides, the emblem field on both turret flanks.

## OWNERSHIP / ROUND STATE (2026-09-16, owner request)
COMPLETE REDESIGN of the 2026-09-15 parade build ("redesign the type 100 completely … use all of
these as references"). Spec in `src/vehicles/chineseFrontlineSpecs.ts`; builder `buildType100` in
`src/vehicles/profiles/type100.ts` (registered through `CHINESE_FRONTLINE_PROFILES`). The renders are
references only: no model geometry, GLB or measurement oracle participates; every dimension below is a
design decision read from the renders at the 3.66 m width anchor.

## DIMS DECISION — RENDER-PROPORTIONAL
| Measure | Value | Basis |
|---|---|---|
| Hull length | 7.30 m | bow z 3.78 to stern z −3.75 (mud flap at −3.82) |
| Overall length (with gun) | 9.40 m | 105 mm muzzle at z 5.65 |
| Width (over skirts) | 3.66 m | skirt doors at ±1.82 |
| Height (turret roof / weapon station top) | 2.42 m / 3.55 m | roof y 2.42 above ground, RWS cradle top 3.52 |
| Turret pivot / gun pivot | (0, 1.80, −0.40) / (0, 0.34, 1.10) | low trunnion in the wedge front |
| Gun | 105 mm, 4.95 m from the trunnion | thermal sleeve, evacuator, MRS collar |
| Road wheels / rollers / sprocket | 6 / 3 / rear | idler forward, `pressed-eight` wheels |

## Identity cues (render numbers refer to the owner's set)
- Hull (1, 5, 7, 8): steep lower bow, one glacis plane from the sponson floor (y 1.02) to the roof
  (y 1.80), chamfered bow corners, vertical upper sides at ±1.70 with the skirt line seam, cut stern
  corners, roof seams, two crew hatches with periscopes (three left, two right), bow handrail loop,
  lifting eyes, two bow sensor cubes, recessed lamp clusters, bow and stern tow hooks.
- Skirts (5, 8): seven bolted doors a side (leading door cut back over the idler), four bolts along
  every door top, dark seams, a trailing cap over the sprocket, rubber apron.
- Stern (3, 4): louvred deck panel, round intake grille right of the ring, twin louvred exhaust
  grilles, tail lamps red over amber, mud flap.
- Turret (2, 3, 4, 6, 8, 9): ten-facet plan lofted to y 0.62 with a wedge front, two flat cheek
  slabs a side, angled cheek sensor blocks, boxed mantlet with a chamfered top and trunnion, gunner's
  sight box right of the gun (hooded), panoramic drum and head left of it, meteorological mast, two
  roof hatches, four corner sensor cubes, twin quad pods pitched −0.38 and splayed ±0.30, remote
  weapon station (base, column, cradle, 12.7 mm barrel with receiver and flash hider, sensor pod,
  ammunition box; top 1.72 m above the ring), two whips on the bustle corners, grab handles, louvred
  turret-rear grille.
- Finish: `sig_type100` digital woodland (base #59654a, weather #65704f, cells #8a9370 / #3a452f /
  #7f8477, cell scale 0.34, `digitalCellK` 1.0); PLA star + "LZ83" on both upper hull sides; star on
  both turret flanks.

## Receipts
`src/vehicles/profiles/type100.selftest.mjs` (identity, part census at the builder port, one glacis,
14 doors / 56 bolts / 12 seams, 8 tubes, weapon station tallest and inside the silhouette, sight left/
right placement, envelope, muzzle anchor, build receipt `type100-ztz100-r2`); the registry receipts
(fleetLazy, tier, taxonomy, vehicleMarkings, camoPolicy, garageOrder, fleetOrder, productStats); the
regeneration chain (`gen-interior-fills --ids=type100`, `presentation-centering --update --ids=type100`,
`tank:anatomy:update`, `genIcons --ids=type100`, `tank-sealed-check --update-ledger`, `tank:freeze`,
`tank:roster -- --write`) and `npm run tank:release:check -- --ids=type100 --gate` in the main worktree.
