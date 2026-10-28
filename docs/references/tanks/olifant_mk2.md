# Olifant Mk 2 (`olifant_mk2`) — reference packet

## Current status (release 262, 2026-10-27): a new South African Centurion derivative

Owner, 2026-10-27: "add ... olifant mk2 (special turret with remote control machine gun and optics)" (with a reference
render: the slab-sided turret, the box sight on its post, the bolted skirts). Built as the `olifant_mk2` mark of
`src/vehicles/profiles/centurionFamily.ts`: the family hull with the Olifant's own skirts, fenders, torsion-bar running
gear, turret, roof and mantlet; spec `src/vehicles/olifantMk2Specs.ts` (a clone of the Mk 5/2 with its own package,
ledger entry `olifant_mk2`). It flies South Africa's flag (owner 2026-10-28) and is drawn in the UK tree's special lane
at III beside the Centurions it came from (its same-tier duels: 0.60 at III, 0.08 at IV). Implementation: DONE.

### Sources

| Key | Source |
|---|---|
| TE | https://tanks-encyclopedia.com/modern/south-africa/Olifant-mk2-main-battle-tank (LIW/Denel turret of modular composite armour, in service 2007, 26 built; 60.5 t; 1,040 hp AV-1790; GT-3B 105 mm with thermal sleeve and fume extractor; commander's stabilised thermal sight, removed when not in operational use; hull 8.30 m, contested) |
| W | https://en.wikipedia.org/wiki/Olifant_(tank) (58 t; the family's 7.557 m hull; GT-8 can be fitted) |
| AT | https://www.army-technology.com/projects/olifant/ (Mk 1B: torsion bars, dampers on the first and last stations, a 7.62 mm anti-aircraft gun) |
| Photos (Commons) | `File:Olifant_Mk_2_Tank_(9689832846).jpg` (Bob Adams, CC BY-SA 2.0: the right side in profile), `File:SANDF_Armed_Forces_Day_2017_-_South_African_Army_Olifant_Mk_2_MBT_(32203179904).jpg` (Bob Adams, CC BY-SA 2.0: left front), `File:SANDF_Oliphant_mark_2_mbtank.jpg` (Caracal Rooikat, CC BY-SA 4.0), `File:Olifant_Mk_2_Tank_(9676457154).jpg` (Bob Adams, CC BY-SA 2.0) |

### Build against the sources

| Item | Source | Build |
|---|---|---|
| Hull length | 8.30 m (TE) vs 7.557 m (W) | the family hull: the profile photograph's hull length to deck height (4.43) matches the Centurion's (4.45) |
| Turret | slab-sided box of modular composite armour round the Centurion turret; flat sides and roof, the front faces raked back to the gun, chamfered top edges, a long bustle overhanging the deck with its underside rising aft (TE; photos) | a box 2.90 m wide, 0.75 m high at the sides over a 10 cm undercut, 4.26 m over the bustle, roof 2.63 m up; two cheeks either side of the gun's slot, their flat vertical faces raked back in plan, the top front edge chamfered (owner 2026-10-28, with a head-on photograph: "front should be flat"); module joints, bolt heads and a round port on each side |
| Commander's sight | a box head about 0.47 m long and 0.50 m high with chamfered vertical corners and a front window, on a post on the right half of the roof ahead of the commander's cupola, about 42% back from the front (photos) | as measured, on a 0.26 m post at 0.37 m behind the ring centre |
| Remote gun | none in any source or photograph; the Mk 1B's 7.62 mm anti-aircraft gun (AT) | the loader's pintle 7.62 mm (fleet `mag` class); the owner's "remote control machine gun" is the sight head |
| Smoke | two banks of four at the bustle's rear corners, raised forward (photos) | two rails of four tubes |
| Mantlet | a narrow mantlet with a ribbed canvas bellows round the tube (photos) | a cast block in the slot and six-rib bellows |
| Gun | GT-3B 105 mm (L7 pattern) with the thermal sleeve and fume extractor (TE) | the L7 with its sleeve |
| Running gear | torsion bars from the Mk 1B, six evenly spaced road wheels (AT; profile) | six wheels 0.90 m apart on trailing arms, four return rollers behind the skirts |
| Skirts | bolted armoured skirts the full length, a wedge fender over each idler, a large flap hanging from each fender's point (photos) | five 6 cm modules a side standing 8 cm over the bins, a belt along them, bolt heads; the fender's outer plate and top falling to its point at 3.85 m; a 0.62 x 0.50 m flap under each point |
| Glacis | add-on composite armour, armoured headlight boxes at the corners (photos) | a 10 cm bolted pack between the Mk 5's headlight boxes |
| Exhausts | the diesel exhausts through the rear (photo laying smoke) | the Meteor's guard silencers omitted |
| Coat | SANDF sand, green and brown (photos) | `paint_olifant_mk2` "SANDF Woodland Desert" |
