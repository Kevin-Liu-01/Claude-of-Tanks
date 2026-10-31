# Magach 3 (`magach3`) — reference packet

## Current status (release 266, 2026-10-28): a new Israeli M48

Owner, 2026-10-28: "add the israeli m48 variant to israel and add a new m48 variant for the usa since its a really great
modeel". Built as the `magach3` mark of `src/vehicles/profiles/pattonCast.ts` (`buildM48VariantCastSteps`,
`M48_VARIANTS.magach3`) on the M48A5's measured hull and dome (the owner's model, [m48a5_patton.md](m48a5_patton.md));
spec `src/vehicles/m48VariantSpecs.ts`, a clone of the M48A5 sharing its balanced package (fleetBalancePass, ledger
entry `magach3`). Israel tree: the special lane at I. Implementation: DONE; qualification per the release check.

Exact vehicle: the **Magach 3** captured at Sultan Yacoub in June 1982, shown at Kubinka and returned to Yad La-Shiryon
(Latrun) in 2016: an M48 rebuilt by the IDF with the 105 mm gun, the AVDS-1790-2A diesel and the low Urdan cupola,
wearing Blazer reactive armour as it fought in Lebanon. (Kubinka labelled it "M48A5 Magach 5"; Latrun calls it a
Magach 3. The fit drawn is the photographed tank's.)

### Sources

| Key | Source |
|---|---|
| WPM | https://en.wikipedia.org/wiki/Magach (Magach 3: M48A1/A2/A3 with the 105 mm, the AVDS-1790-2A, the Urdan cupola) |
| WP48 | https://en.wikipedia.org/wiki/M48_Patton |
| Kubinka | the museum's placard on the Sultan Yacoub tank: 49.1 t, 750 hp, 42 km/h |
| IPMS | https://reviews.ipmsusa.org/review/idf-magach-3-wera (box counts, the bustle's) |
| WT | https://wiki.warthunder.com/unit/il_magach_3 (Blazer weight about 1 t; game data) |
| Photos | Wikimedia Commons, the Sultan Yacoub tank at Latrun (right side, front left, head-on, the turret's armour close up); a Tel Aviv Magach without its boxes (rear, the studs, the basket); a Magach 3 from above without armour (the Urdan cupola). Local copies: `~/cot-lanes/m48-variants-266-refs/magach/` |

### Differences from the M48A5 build

| Item | Source | Build |
|---|---|---|
| Gun | 105 mm M68/L7 with its evacuator halfway along, no sleeve (photos) | the A5's M68 (`m48Gun`) |
| Cupola | the low Urdan type with a pintle MG, the loader's 7.62 on its pintle (photos, WPM) | the A5's low cupola and its two pintle guns (the A5's is the Urdan's twin) |
| Searchlight | none; armour over the mantlet (photos) | the A5's AN/VSS-1 omitted |
| Mantlet | a canvas boot round the gun, two wedge boxes either side of the barrel at its height and a brow of four over it, faces raked back (photos) | on the gun frame (they elevate with it): the boot, 2 + 2 wedges, a brow of 4 |
| Turret armour | Blazer: two or three courses of raked wedges on each cheek running into the flank, a course of eight or nine tall flat-topped boxes along each flank from the ring nearly to the roof over most of the length (photos; counts and sizes estimated) | each side one consumable cluster (`magach3_turret_era_L`/`_R`): 3 x 2 cheek wedges, 8 flank boxes 0.25 x 0.62 m, each seated on the dome by its normal (`magachTurretEra`) |
| Hull armour | seven or eight slabs lying flush up the glacis between the light clusters, a row of nine or ten across the nose, two beside the driver's hatch (photos) | `magach3_glacis_era`: eight slabs, nine nose boxes wrapping its curve, two on the deck (`magachGlacisEra`); the A5's light guards omitted |
| Running gear | five return rollers and the small track-tension wheel (the early hull; the Latrun photographs) | the A5's five and the tension wheel behind the last road wheel (`m48Gear`, 'a1') |
| Stowage | the large IDF bustle basket (photos) | the A5's rack taller and wider, with a heavier load; no flank racks (the boxes cover the flanks) |
| Power | AVDS-1790-2A, 750 hp (Kubinka) | the A5's diesel deck and air cleaners |
| Weight | 49.1 t (Kubinka) | spec |
| Coat | IDF sand-grey | the IDF service coat (camo stock `service_merkava2d`) |

### Not drawn

The boxes on the bustle (a kit review counts nine; the photographs show the basket over them). The studs of the bare
mounts. Per-box sizes are estimates from photographs: no drawing of the Blazer layout is published.
