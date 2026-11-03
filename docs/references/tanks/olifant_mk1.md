# Olifant Mk 1 (`olifant_mk1`) and Semel (`semel`) — reference packet

## Current status (release 269, 2026-11-02): new South African Centurions

Main's ruling 2026-11-02 on the owner's "flesh out south african and australian tank trees": the Olifant Mk 1 is the
root of the South Africa tree at II, the Semel its twin build (the Skokiaan folds into it). Built as the Centurion
family's `olifant_mk1` and `semel` marks (`src/vehicles/profiles/centurionFamily.ts`, the optional `sa` field; an
additive edit, the 47 other family-group ids proved byte-identical by `tools/fleet-geometry-ledger.mjs --check`), on
`profiles/uk.ts` beside the Olifant Mk 2 for its tone kit; specs in `src/vehicles/southAfricaSpecs.ts` (clones of the
Strv 81, the Mk 5 with the 20-pdr Type B). Photo packet `docs/references/photos/olifant-centurions-20261102.json`;
fixture `src/vehicles/profiles/southAfrica.selftest.mjs`. Implementation: DONE; qualification: the packet's envelope
PASS, regeneration and critics pending (`docs/history/research/south-africa-line-269.md`).

### Sources

| Key | Source |
|---|---|
| TE | https://tanks-encyclopedia.com/coldwar/south_africa/olifant_mk.i (Skokiaan: 9, AVI-1790-8 810 hp petrol, Allison CD-850-5, cancelled 1974; Semel: 35 Mk 5s from 1974, the air filters moved, hydraulic steering and brakes, 1,400 L; Olifant Mk 1: 153 Mk 3s converted 1979-84, 750 hp diesel, semi-automatic gearbox) |
| WTF | https://forum.warthunder.com/t/216405 (the Mk 1 keeps the 20-pdr with the new fire control and laser rangefinder; "only 2x4 sets of smoke grenades, instead of 2x6 seen on earlier South African Centurions"; 7.56 x 3.39 x 2.94 m; two photographs) |
| W | https://en.wikipedia.org/wiki/Olifant_(tank) (lists the Mk 1 on the Meteor petrol pack: contradicted by TE and WTF; the GT-1 label unsourced) |
| SAAM | https://www.saarmourmuseum.com/centurion-mk-5-skokiaan-britainrsa (the Skokiaan survivor R90587 at Tempe) |
| Photos | the WTF Mk 1 photographs (at speed, skirts off; head-on with the 20-pdr and the 4-tube banks); TE's Angola photographs (1987-88, F Squadron, skirts off); TE's Skokiaan at the School of Armour (side plates on, six-tube dischargers) |

### Gap table (photo class)

| # | Photo read | Baseline (the Strv 81 / Mk 5/2 marks) | Build |
|---|---|---|---|
| 1 | the Mk 1 runs skirts off, the Horstmann bogies bare | Mk 5 side plates | `saSkirtless`: the Australian mark's bogies, no side plates; the hull numbers move to the turret's side bin |
| 2 | the raised louvred 1790 deck, the box air cleaners on the rear guards, the grille boxes on the upper rear plate | Meteor louvres, fishtail silencers | the Sho't Kal's AVDS deck and grille boxes (no IDF racks, guns or chevrons); the charging silencer, telephone and rear tow cable left off |
| 3 | the 20-pdr with its fume extractor | the 20-pdr Type B | kept |
| 4 | two banks of four 81 mm dischargers raised forward on the turret's sides (Mk 1) / the Mk 5's two six-tube blocks (Semel) | the Mk 5/2's six-tube blocks | Mk 1: a 2x2 block on a bracket over each side bin; Semel: the Mk 5's blocks |
| 5 | rolled camouflage nets on the bustle | the Mk 5/2's tall basket | Mk 1: an open net rack on arms carrying two fat rolled nets; Semel: the Mk 3/5 box bin |
| 6 | SADF nutria brown, the tactical number | — | `paint_semel` "SANDF Plain Khaki" (#857356) |

### Datums

Hull, turret, gun and running gear are the family's (7.557 m hull, ring 0.47 m ahead of the middle, 20-pdr Type B 4.97 m
ahead of the trunnion). As built: 3.352 m wide (Mk 1, over the guards; 3.384 m the Semel over its side plates), 9.912 m
over the gun, 4.896 m to the whips' tips.
