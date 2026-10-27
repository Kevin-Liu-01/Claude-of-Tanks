# Sho't Kal (`shot_kal`) — reference packet

## Current status (release 262, 2026-10-27): a new Israeli Centurion

Owner, 2026-10-27: "also add a nnew israeli centurionn onnce u make the new centurions with proper equipment geometries
and etc, add a nnew one called the sho't" (with a photograph of a sand-painted 1973 Sho't Kal model: L7 with extractor,
cupola Browning, tall twin whips, bustle basket with jerrycans, the chevron on the side plate). Built as the `shot_kal`
mark of `src/vehicles/profiles/centurionFamily.ts`; spec `src/vehicles/shotKalSpecs.ts` (a clone of the Mk 5/2).
Configuration: the Sho't Kal Alef of the 1973 war, before Blazer armour. Implementation: DONE.

### Sources

| Key | Source |
|---|---|
| HE | https://he.wikipedia.org/wiki/שוט_(טנק) |
| EN | https://en.wikipedia.org/wiki/Sho%27t (citing Manasherob, *Centurion Tanks of the IDF*, 2009) |
| WT | https://wiki.warthunder.com/unit/il_centurion_shot_kal_alef |
| CM | https://www.cybermodeler.com/hobby/kits/afv/kit_afv_35124.shtml (AFV Club 1973 kit: rear deck, air cleaners, US tail lights, IDF sand) |
| KM | https://forums.kitmaker.net/t/amusing-hobby-idf-shot-kal-alef-valley-of-tears-1973/24487 ; https://forums.kitmaker.net/t/confused-by-idf-vehicle-markings/20250 |
| Photos (Commons) | `File:Centurion-Shot-Kal-Alef-latrun-2.jpg` (Bukvoed, CC BY 3.0), `File:Latrun_220917_Shot_Kal_A_01.jpg` (Oren Rozen, CC BY-SA 4.0), `File:Israeli_Centurion_Tank_with_Turret_Traversed_During_Yom_Kippur_War,_11_October_1973.jpg` (IPPA/NLI, CC BY 4.0), `File:Operation_Litani_XXI.jpg` (CC BY-SA 3.0, rear) |

### Differences from the rebuilt Mk 5/2 (the shared table is in `centurion5_2.md`)

| Item | Source | Build |
|---|---|---|
| Power train | AVDS-1790-2A diesel, 750 hp; Allison CD-850-6 (HE, EN) | spec: the Mk 5/2's balanced package with 960 hp (fleetBalancePass, ledger entry `shot_kal`) |
| Engine deck | enlarged, raised M48/M60-style louvred "humpback" (HE, EN, CM) | hump to 1.90 m from behind the turret's sweep, two longitudinal grille doors, the rear louvre grille raked to the rear plate |
| Rear guards | the British exhausts and silencers removed; M48-style box air cleaners (HE, CM) | a clamped box air cleaner and its duct on each rear guard |
| Rear plate | US-pattern tail lights in round guards (CM, forum); links on the rear | guarded lights, two three-link runs |
| Roof guns | the commander's .30 M1919A4 or a .50 on the cupola (EN, KM); the Yad La-Shiryon Alef carries a .50 at the cupola and a 7.62 mm gun at the loader's hatch | owner 2026-10-27 ("machine guns ... depending on the variants"): the Latrun configuration, a .50 M2 on the cupola and a loader's pintle gun (fleet `mag` class) |
| Smoke dischargers | the British units removed on the Alef, empty mounts remained (EN) | the empty brackets only |
| Stowage | the IDF bustle basket, jerrycans, bedrolls (EN, CM) | the open bustle basket with its load, a jerrycan cage at the right rear, curated soft stowage (decorations.ts) |
| Antennas | two whips | two 2.6-2.9 m whips at the bustle corners |
| Glacis | spare links on the upper glacis in 1973 (forum); Mk 5 front bins reused (CM) | the Mk 5 bin and link run |
| Paint | IDF sand / Sinai grey, conflicting (CM: 1973 kits all IDF sand; modellers: grey-tan) | its own plain grey-sand `#8c8670` (`paint_shot_kal`, appended after the 233 paints) |
| Markings | white company chevron on the side plates and turret (KM) | a "V" chevron on both middle side plates |
| Searchlight | Alefs commonly carried a searchlight over the mantlet: a Luna L-2 or a canvas-covered xenon (EN) | a canvas-covered searchlight on a bracket over the mantlet, moving with the gun |
| Lights | US-pattern lights (CM) | US-pattern headlight pairs in bent guards; tail lights in round guards; the convoy light box |
| Rear | AVDS conversion grilles (the 1978 rear photograph) | two louvred grille boxes on the upper rear plate |
| Running gear | the Centurion's own Horstmann bogies | the UK Centurion wheel (`nationWheelSets.ts` exception) instead of the Israeli (Merkava) standard |
| Not modelled | the .50 over the gun (mostly post-war), the 60 mm mortar (Bet), IS-10 launchers (Gimel), Blazer ERA (Dalet), the 44 mm glacis plate on ex-Mk 3 hulls | |
| Dimensions | 7.6 m hull, 3.38 m wide, 2.94 m high, 51.8 t (HE, WT) | hull 7.56 (spec), overall 9.62 with the L7, width 3.39, height 3.01 over the cupola |
| Tier | | III in the Israel tree's special lane beside the Sabra (both foreign hulls in IDF service): the Mk 5/2's tier |
