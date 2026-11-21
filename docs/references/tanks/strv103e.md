# Stridsvagn 103E (`strv103e`), concept

**Status:** concept (vehicleFacets `concept`): the project's own design, not a built vehicle. Owner 2026-11-20: "keep our
version of strv 103b then make a new modernized souped up version in tier X with a new modern design better armor etc
because our old models were kind of outdated".

**Name:** the real marks run 103A (1967), 103B (1971), 103C (1986-89 rebuild) and 103D (an early-1990s programme dropped
for the Strv 122; sources disagree on its fit). E is the next letter never used, so it reads as the mark after the last
real one.

## Real basis and what is invented

| Area | Real record | Invented here |
|---|---|---|
| Hull | Same casemate, hull-aimed gun, hydropneumatic suspension; dozer blade kept by the 103C | Composite nose wedges, glacis-edge appliqué and four side modules a side in place of the stowage bins |
| Fire control | 103C laser rangefinder in the gunner's sight; REMO fire-control computer; 103D thermal sight | Raised gunner's day/thermal head; stabilised panoramic commander's sight |
| Gun | 1980s 120 mm studies for the S-tank; UDES XX 20 carried a 120 mm | Fixed 120 mm L/55-class with a thermal sleeve and muzzle reference sensor |
| Protection | 30 mm anti-HEAT rod fence; 103C bar armour; diesel cans as skirt armour | Bar armour over the rear plate; laser warners; two trainable soft-kill launcher pods; smoke banks |
| Kit | — | Remote 12.7 mm station on the cupola race; modern rear basket; M90-style splinter |

Sources: Wikipedia (Stridsvagn 103); hhogman.se (Swedish tanks: the anti-HEAT fence, 103C fit); Russell Phillips, "The
Swedish Strv 103"; svppbellum (103C/103D programme).

## Build

`src/vehicles/profiles/strv103Family.ts` mark `e` on the family casemate (the 103A's measured loft). Dims: hull 7.20 (the
nose module to z 3.68), overall 9.22 (muzzle 5.70), width 3.80 (side modules), height 2.14 (hull; the panoramic head and
the station are narrow).

## Balance (tier X, shown-tier floors in fleetBalancePass)

Against strv103b: 105 mm APDS 380 mm / 520 becomes 120 mm APFSDS 860 mm / 525, reload 4.4 to 5.5 s (next to the Type 10's
5.2), accuracy 0.21, aim 1.40 s; glacis KE/CE 220/300 becomes 520/720; 900 hp / 39.7 t becomes 1,100 hp / 45 t, 65 km/h
forward and 55 reverse; HP 2,550 (the Challenger 3 TD, the tier X casemate-role peer). Tree: Sweden `strv` line, X,
lane 0, parents strv103b and strv122.
