# M113A1 FSV (`m113a1_fsv`) — reference packet

## Current status (release 269, 2026-11-02): a new Australian M113

Main's ruling 2026-11-02 on the owner's "flesh out south african and australian tank trees": the M113A1 Fire Support
Vehicle opens the Australia tree's cavalry line ("M113 and Redback") at I, off the Leopard AS1 root; its tier is
provisional until the same-tier duels run after the regen. 15 converted at Bandiana from 1970, six in Vietnam in 1971
(RESEARCH.md), reserve to 1986. Built by the lane's new first-party M113 builder (`src/vehicles/profiles/m113.ts`, the
'fsv' mark, `buildM113A1Fsv`; datums `src/vehicles/m113Datums.ts`): the M113A1 hull under the Alvis Saladin's turret, in
the `australia` fleet group (`profiles/australia.ts`). Spec `src/vehicles/australiaSpecs.ts`: a clone of the M41A3's
light-tank footing, its armour re-enveloped on the build's datums (the aluminium hull, 12-38 mm), 11.9 t and the GM 6V53
of 212 hp (RM Sotheby's), the 76 mm L5A1 firing L29 HESH and L24 HE (no armour-piercing round). Photo packet
`docs/references/photos/aus-m113-20261102.json`; fixture `src/vehicles/profiles/australia.selftest.mjs`.
Implementation: DONE; qualification: the packet's envelope PASS, regeneration and critics pending
(`docs/history/research/australia-line-269.md`).

### Sources

| Key | Source |
|---|---|
| RM | https://rmsothebys.com/auctions/lc14/lots/r0068-m113a1-fire-support-vehicle-fsv/ (4.86 m long, 2.69 m wide, 2.78 m high; 11,939 kg; the 76 mm L5A1 with 55 rounds; two .30 cal; the 6V53 diesel, 212 hp; the lot shows one photograph, not a gallery) |
| WA | https://en.wikipedia.org/wiki/M113_armoured_personnel_carriers_in_Australian_service (15 converted at Bandiana from 1970; in Vietnam July 1971 to February 1972; retired 1986) |
| WM | https://en.wikipedia.org/wiki/M113_armored_personnel_carrier (the M113 base: 4.863 x 2.686 x 2.5 m to the cupola, five road wheels a side) |
| Photos | Commons `M113_FSV.JPG` (front 3/4 left); the Puckapunyal set (`Puckapunyal-M113-FSV-3-1`, front 3/4 left; `-2-1`, rear 3/4 right with the turret reversed; `Puckapunyal-M113A1-FSV-1`, rear); `Interior_of_M113_FSV.jpg`; RM Sotheby's preserved Vietnam-marked FSV (side/front 3/4 right, reference only). No pure side, front or top view |

### Gap table (photo class)

| # | Photo read | Baseline (the builder's M113A1 hull) | Build |
|---|---|---|---|
| 1 | the rounded cast Saladin turret, set centre-forward | the APC's cupola | a drum 1.60 m across on its ring, sloping in to a flat roof, its front flattened behind the mantlet; the ring 1.95 m behind the nose |
| 2 | the short 76 mm, no fume extractor | — | the L5A1 1.66 m ahead of the trunnion, its root under a canvas mantlet cover, no extractor |
| 3 | smoke clusters on both front flanks of the turret (tube count unverified **[?]**) | — | three dischargers a side on a block |
| 4 | the .30 cal on the hatch | — | a 12.7 mm M2 on the commander's cupola on the right (the owner 2026-11-03: "make our m113s look much much cooler annd have more firepoweer/tow missiles"; the photographs' .30 before); the loader's hatch on the left |
| 5 | the standard M113A1 hull: front sprocket, the trim vane on the glacis, guarded headlights, the rear ramp | the builder's hull | kept: the vane folded flat on its hinges and stays, the lamp clusters in their guards on the glacis' top corners, the driver's hatch front left and the engine grille front right, the ramp's outline on the rear plate, two whips at the roof's rear corners |
| 9 | — (owner's request) | — | a twin TOW launcher on the turret's right flank (the owner 2026-11-03: "make our m113s look much much cooler annd have more firepoweer/tow missiles", first-party, not on the service vehicle; m113Datums.ts `M113_TOW`): an armoured two-tube box on two arms from the drum, its sight on top, two spare rounds strapped on the roof's rear left; its mouths launch the BGM-71A TOW (430 mm, 320; six rounds: two ready in the box, four stowed) (fleetLauncherMuzzles.ts, launcherTubes 2) |
| 6 | olive drab; the unit triangle "41 A", registration 1347xx, names ("ARGUS") | — | `paint_m113a1_fsv` "RAAC Bands Woodland": the olive drab (#5a5c30) under broad black and earth field bands (owner 2026-11-03: no plain coats), number 41A on the left hull side; the Army's kangaroo |
| 7 | a round item on the right front, perhaps a spare wheel **[?]** | — | not drawn |

### Datums

The published M113A1 hull (`M113_BASE`): 4.863 m long, the roof 1.86 m and the nose 0.99 m high, the glacis 0.79 m long
in plan, 0.43 m clearance, 0.38 m tracks 1.15 m off the centre line (2.68 m over the tracks), five 0.61 m road wheels 0.70 m
apart (the first 1.00 m behind the nose), the sprocket 0.34 m behind the nose and the idler 0.32 m ahead of the stern, its centre 0.46 m up (272: about 0.07 m over
the road wheels' centres in the M163's side photographs 06 and 09; 0.56 m before), no return rollers. As built: 2.724 m wide, 5.409 m long (the muzzle 0.43 m ahead of the nose), 4.13 m to the whips' tips
(RM Sotheby's: 2.78 m to the cupola). Gun depression (`tools/gun-depression-sweep.mjs --no-suit`): 9.7 degrees ahead and
abeam; over the front quarters (yaw 21-59) the trim vane and the lamp guards hold it to 4.0 degrees at its least (yaw
39-42); astern of yaw 147, 6.8 degrees (the ramp's hinge line).
