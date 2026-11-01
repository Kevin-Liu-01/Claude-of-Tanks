# Danish Leopard 2s (Leopard 2A5 DK, 2A7 DK): run packet

## Current status

- Updated: 2026-10-29. Lane item/denmark-line-265 (docs/history/research/denmark-line-265.md).
- IDs: leo2a5dk (Leopard 2A5 DK, IX, the owner's 2A5 anchor), leo2a7dk (Leopard 2A7 DK, X). Main's ruling 2026-10-29.
- Implementation: profiles/leopard2Dk.ts on the source-study builds (profiles/leopardX.ts `buildLeopard2A5X` and
  `buildLeopard2A7VX`, each given a `{ danish }` kit option that drops the German PERI R17 head (2A5) and the remote 30 mm
  station; leo2a5 and leo2a7v rebuild byte-identical: 160810 a8b0f30e35e37b4e, 167515 cfa125e8edf8ec98).
- Qualification: photo-class (leopard-2a5-dk-20261029.json, leopard-2a7-dk-20261029.json); fixture PASS; critics owed.

| id | Danish kit | coat |
|---|---|---|
| leo2a5dk | Elop stabilised commander's day/thermal sight (a drum on the PERI bearing); Helmand bar armour: the stern cage 0.35 m off the louvres, the rear quarter cages outboard of the skirts, a cage round the bustle bins; no ghillie suit | 2010s three-tone: olive, khaki sand, black |
| leo2a7dk | ribbed stowage modules across the bustle and down both rear turret sides; the Barracuda mobile camouflage cover (ghillieFleetSuits.ts `ulcans` row in Danish greens) | olive under the cover |

## Sources

armyvehicles.dk leopard2a5.htm (the 29 June 2000 contract, 51 tanks, the Elop commander's sight, A/C, generator) and
leopard2a5desert.htm (bar armour 2008); US Army photographs at Grafenwöhr, 3-4 July 2014 (public domain, Commons); the
Forsvaret Leopard 2A7 fact sheet (44 tanks, 68 t, 60 km/h, 1,500 hp, L55A1, new thermals, generator, A/C, CBRN, driver
camera, stowage modules, the mobile camouflage system, MLC 77); KMW's 2A7 delivery release (EDR); Commons: the Latvian
live-fire photograph and the Danish Army's Broshuis transporter photograph; esut.de May 2022 (the Danish DM53A1 stock
upgraded to DM73).

## Combat data

The donors' fleet footing (protection, mobility), the published weights (2A5 DK about 61 t before the bar armour, 62 t
as built; 2A7 DK 68 t, 60 km/h); rounds DM53A1 (2A5 DK) and DM73 (2A7 DK) named on the donors' figures.
