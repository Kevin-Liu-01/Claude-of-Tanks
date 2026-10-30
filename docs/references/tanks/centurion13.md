# Centurion Mk 13 (`centurion13`) — reference packet

## Current status (release 262, 2026-10-27): a new British Centurion

Owner, 2026-10-27: "make one of em have a huge floodlight to right of gun ... can add a new centurion variants for the
big floodlight", then "for that one the light should be next to the gun, and should be on left side" (with a Mk 13
head-on photograph: the round searchlight beside the mantlet, the 2x3 discharger blocks at the turret's front corners,
mesh-guarded lamps on the glacis). Built as the `mk13` mark of `src/vehicles/profiles/centurionFamily.ts` on the rebuilt
family's hull and turret (the shared gap table is in `centurion3.md`); spec `src/vehicles/centurion13Specs.ts`, a clone of
the Mk 5/2 sharing its balanced package (fleetBalancePass, ledger entry `centurion13`). UK tree: tier III, after the
Mk 5/2. Implementation: DONE.

### Sources

| Key | Source |
|---|---|
| W | https://en.wikipedia.org/wiki/Centurion_(tank): the Mk 10 (the Mk 8 turret, the 105 mm L7, extra glacis armour), the Mk 13 (the Mk 10 with infra-red equipment and a ranging gun) |
| AC10 | https://www.armedconflicts.com/-t73139 (Mk 10: hull 7.823 m, 9.855 m gun forward) |
| L7 | https://en.wikipedia.org/wiki/Royal_Ordnance_L7 (L7A2: the L7A1 with a thermal sleeve) |
| Owner | the Mk 13 head-on photograph and the Hum3D Mk 3 render supplied 2026-10-27 |
| BovMk13 | Centurion Mk 13, The Tank Museum, Bovington, 2017, front-right, right and rear-left (Morio, Wikimedia Commons, CC BY-SA 4.0): the searchlight on the turret's left front beside the mantlet, the 2x3 discharger clusters on the turret's front corners, the mesh-guarded glacis lamps |

### Mark identity (against the rebuilt Mk 5/2)

| Item | Source | Build |
|---|---|---|
| Searchlight | the L2 infra-red/white-light searchlight beside the mantlet on the turret's left, linked to the gun (W; owner photograph) | a 0.56 m drum with louvred front, rim, fins and arm, at gun height outboard of the mantlet on the tank's left (right of the gun seen from ahead), ahead of the left discharger block; drawn fixed to the turret on its arm |
| Ranging gun | the .50 ranging machine gun (W) | in its armoured sleeve on the mantlet's upper left |
| Gun | L7A2 with thermal sleeve (L7) | the L7 with its sleeve, the evacuator 45 % along |
| Glacis | the Mk 10's extra glacis armour (W) | an appliqué plate over the upper glacis, the two link runs on it |
| Lights | mesh-guarded lamp boxes (owner photograph) | the Mk 5's armoured lamp boxes with mesh guards (IR driving lamps) |
| Roof gun | the commander's cupola gun | MAG 58 station `centurion13_cupola_machine_gun` (no Browning class) |
| Hull length | 7.823 m (AC10): the Mk 7-and-later engine deck is 0.27 m longer | NOT DRAWN: the family's hull frame is the Mk 3/5's (7.56 m); the spec carries the drawn length. Owed: a longer-deck hull variant |
| Cupola | the Mk 8-and-later cupola | the family cupola (owed) |
