# Stridsvagn 152 (`strv152`), concept

**Status:** concept (vehicleFacets `concept`), the project's own design. Owner 2026-11-20: "make a strv 152 with a 152mm and
designed hull to accommodate that cannon to complement the strv 103 e".

**Basis:** the S-tank casemate with the Strv 103E's modern fit (docs/references/tanks/strv103e.md): composite nose,
glacis-edge and side modules, bar armour, raised gunner's head, panoramic sight, remote 12.7 mm, laser warners and
soft-kill launchers. Nothing about a 152 mm S-tank is in the real record; the hull changes are invented around the gun.

## Hull built round the 152 mm (`src/vehicles/profiles/strv103Family.ts` mark `x`)
- The bore rides 11 cm higher (1.70) in a wider, taller housing (half-widths 0.34/0.28, top 1.93) over the glacis.
- A breech hump runs back from the housing over the glacis break to the fighting compartment; the deck louvre field splits
  either side of it.
- The autoloader bustle for the 152 mm rounds lengthens the hull 0.60 m behind the tail plate (to z -4.12), its loading
  doors on its own rear face, its roof hatch; the bar-armour cage stands off it.
- The 152 mm L/50 with a five-port muzzle brake, a sleeve-jointed tube and the heavy chamber run into its housing.
Dims: hull 7.80 (nose module to bustle), overall 10.42 (brake mouth 6.30), width 3.80, height 2.14.

## Balance (tier X; the 152 mm line's band: t14_152 and object195, 1,000 mm, 740-820 damage, 8.5 s)
APFSDS 1,000 mm / 760, reload 8.2 s, accuracy 0.23, aim 1.60 s; HP 2,600; 1,500 hp / 52 t, 60 km/h forward, 50 reverse;
glacis KE/CE 600/800. Tree: Sweden `strv` line, X, lane 2, straight on from the Strv 122; the Strv 103E beside it at X.

Owner 2026-11-20 (field fit): "make the strv 152 have camo netting and crew machine guns and a different remote gun station
and side skirt/rubber stuff and 2 big fuel canisters": the field net and garnish (ghillieFleetSuits.ts `strv152`), the radio
operator's Ksp 58 at his hatch and a second crew pintle at the right rear, an open-yoke 12.7 mm station with its sensor head
on the cupola race (the 103E keeps its own), rubber skirt panels under the side modules, and two 200 L drums across the
bustle roof in their cradles.
