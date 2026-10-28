# Centurion Mk 5 AVRE (`centurion5_avre`) — reference packet

## Current status (release 262, 2026-10-27): a new British Centurion

Owner, 2026-10-27: "add ... centurion mk 5 avre (extra era special turret, dozer)" (with a reference render: the dozer
blade, the short fat demolition gun, reactive cassettes on the turret, bolted side plates). Built as the `avre` mark of
`src/vehicles/profiles/centurionFamily.ts` on the rebuilt Mk 5 hull and turret (the shared gap table is in
`centurion3.md`); spec `src/vehicles/centurionAvreSpecs.ts` (a clone of the Mk 5/2 with its own gun, ledger entry
`centurion5_avre`, measured in its own `demolition-gun` balance cohort). UK tree: the special lane at II (its same-tier duels: 0.28 at II, 0.07 at III).
Configuration: the Gulf War AVRE of 1991 (32 Armoured Engineer Regiment), without its fascine cradle. Implementation: DONE.

### Sources

| Key | Source |
|---|---|
| TE | https://tanks-encyclopedia.com/coldwar-uk-fv4003-centurion-avre/ (FV4003 on Mk 5 hulls, about 40, 1963-91; 165 mm L9A1, +20/-10; 3.39 m wide, 3.0 m high; reactive armour "all over the front half" in the Gulf) |
| TA | https://tanks-alot.co.uk/?p=5440 (25 ft 6 in overall; 52 t; crew 5) |
| L9 | https://en.wikipedia.org/wiki/Royal_Ordnance_L9 (165 mm demolition gun, 29 kg HESH, about 2,400 m) |
| ARC | https://arcaneafvs.com/centavre165.html (the Gulf configuration had no fascine cradle) |
| Photos (Commons) | `File:Centurion-AVRE-165-Fosgene.jpg` (Oliver Gottlob, CC BY-SA 2.0 de: a Gulf-configured AVRE, blade lowered, glacis slabs, turret front panels), `File:Centurion_AVRE_Duxford.jpg` (TheManStan, CC BY-SA 3.0: right profile, blade raised, the gun's sections), `File:FV4003_Centurion_Mk.5_AVRE_’02_BA_33’_(51616146520).jpg` (Alan Wilson, CC BY-SA 2.0), `File:FV4003_Centurion_AVRE_165_“11_BA_46”_(45384689342).jpg` (Alan Wilson, CC BY-SA 2.0) |

### Differences from the rebuilt Mk 5/2

| Item | Source | Build |
|---|---|---|
| Gun | 165 mm L9A1; about 1.4 m out of the mantlet: a thin root, a fat evacuator drum, a short chase, a double-ringed muzzle collar (the Duxford profile scaled to the 3.0 m height, about ±15%) | root 0.24 m across, drum 0.38 m across and 0.56 m long, chase 0.21 m, collar 0.28 m with two rings, 2.15 m from the trunnion; a 29 kg HESH round on a 20 s cycle at 259 m/s |
| Dozer | the FV4019 blade (T.B. Pearson), hydraulic, on the upper glacis with anchors on the lower; about 3.4 x 0.9-1.0 m from photographs | a 3.38 x 0.95 m curved mouldboard carried raised (0.62-1.57 m) ahead of the nose on two push arms pinned to the nose plate's sides, a ram from a glacis bracket, end cheeks, six back ribs, the cutting edge and lip; 8.00 m over the blade's lip |
| Glacis armour | two raised slabs either side of the centre line, headlight boxes at the corners (Fosgene) | two continuous panels (`centurion5_avre_glacis_era`) beside the ram's bracket, a lip over the top edge |
| Turret armour | reactive armour on the turret front and cheeks (TE; the owner's reference); no block layout is published | on each front corner a housing sloped back about 45 deg with two large flat panels, and two courses of bricks along the bins' outer faces (`centurion5_avre_turret_era_L`/`_R`); no roof armour (no photograph shows it) |
| Side plates | bolted plates on the hull sides (the owner's reference; one fan-site source) | rows of bolt heads over the three side plates |
| Rear basket | the tall mesh basket on the turret rear (Duxford, 02 BA 33) | an open rack on arms from the bustle bin |
| Fascine cradle | carried in service; not in the Gulf (ARC) | omitted |
| Power train | Meteor 650 hp (TE) | spec: the Mk 5/2's shown-tier engine (880 hp) |
