# Strv 105 (`strv105`) — reference packet

## Current status (release 262, 2026-10-27): a new Swedish Centurion

Owner, 2026-10-27: "add the strv 105 (special turret, era, machine gun, gun)" (with a reference render: reactive
cassettes on the glacis and the turret's front corners, a round sight window beside the gun, the cupola gun, the L7 with
its thermal sleeve). Built as the `strv105` mark of `src/vehicles/profiles/centurionFamily.ts` on the rebuilt family's
hull and turret (the shared gap table is in `centurion3.md`); spec `src/vehicles/strv105Specs.ts`, a clone of the Mk 5/2
sharing its balanced package (fleetBalancePass, ledger entry `strv105`). Sweden tree: the special lane at III (a single
prototype; its same-tier duels: 0.28 at III, 0.03 at IV). Implementation: DONE.

### Sources

| Key | Source |
|---|---|
| SV104 | https://sv.wikipedia.org/wiki/Stridsvagn_104 (80 Strv 102 rebuilt 1984-87 by Hägglunds: FFV reactive armour, AVDS-1790-2DC, 7.823 m hull, 9.854 m gun forward, 3.390 m wide, 3.009 m high, 54 t; two 71 mm Lyran launchers) |
| SV105 | Swedish Wikipedia, Stridsvagn 105 (one prototype from a Strv 104, 1994: a new suspension, a thermal sight beside the gun, a new driver's hatch; dropped for the Leopard 2) |
| WT | https://wiki.warthunder.com/unit/sw_strv_105 and the Japanese War Thunder wikis (game data: about 900 hp, 56 t; contested reactive armour on the turret front) |
| Skaraborg | `File:Swedish_Strv_104_Centurion_Tank_with_Upgrades.jpg` (Garnisonsmuseet Skaraborg, CC0; catalogued as a Strv 104, the caption and the thermal sight box match the Strv 105) |
| Bov104 | `File:Stridsvagn_104_front-right_2017_Bovington.jpg` (Morio, CC BY-SA 4.0): the Strv 104's cassette layout |

### Differences from the rebuilt Mk 5/2 and Strv 81

| Item | Source | Build |
|---|---|---|
| Glacis armour | FFV cassettes in courses across the upper glacis (Bov104; kept on the prototype, Skaraborg) | two courses a side of long slabs angled in a V converging on the centre line (`strv105_glacis_era`, a consumable plate the anatomy fits to the drawn slabs); the glacis link brackets and lamps moved off it |
| Turret armour | two cassette blocks on each front corner of the Strv 104 (Bov104); the prototype's photograph shows the right corner taken by the thermal sight | a housing raked back in plan and elevation on each front corner carrying a row of three thick boxes (`strv105_turret_era_L`/`_R`), ribbed panels on a sloped housing along the roof's front edge (`strv105_turret_roof_era`); owner's reference followed over the contested photograph |
| Thermal sight | the prototype's armoured box beside the gun on the right, a round window (SV105, Skaraborg) | a 0.30 x 0.28 x 0.36 m box on the right front corner, its round window, rim and shutter, on a bracket |
| Mantlet | the laced canvas cover (Bov104, Skaraborg) | the Sho't Kal's canvas cover over the family mantlet |
| Gun | L7 ("kan Strv 101") with the thermal sleeve and fume extractor (SV104; Skaraborg) | the L7 with its sleeve |
| Dischargers | the 2x3 clusters high on the turret sides (Bov104) | the family's blocks raised onto the shoulders behind the corner cassettes |
| Illumination | two 71 mm Lyran launchers (SV104) | two tubes on a bracket at the right roof edge |
| Roof gun | the cupola's Ksp 58 on its tall arm (Skaraborg) | the Strv 81's cupola Ksp |
| Lamps | lamp pairs on the front bins (Bov104) | Swedish lamp clusters on the front bins' lids; the blackout boxes on their faces |
| Power train | AVDS-1790-2DC, 750 hp; "about 900 hp" on the prototype (SV104; WT) | spec: the Sho't Kal's diesel step (960 hp shown), 56 t |
| Hull length | 7.823 m (SV104, the Mk 10 figure) | NOT DRAWN: the family hull (7.56 m); the spec carries the drawn length |
| Suspension | a new suspension, type unpublished (SV105) | the family's Horstmann bogies (no source names the new type) |
| Rear | the Strv 81B's rear box (not shown on the Strv 104/105) | omitted |
