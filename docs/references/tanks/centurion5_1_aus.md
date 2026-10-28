# Centurion Mk 5/1 (Australia) (`centurion5_1_aus`) — reference packet

## Current status (release 262, 2026-10-28): a new Australian Centurion

Owner, 2026-10-28: "add the australian centurion mk.5/1" (with a reference render: the laced mantlet cover with a
red-lensed searchlight on top, two spare road wheels on the glacis, the skirts off, the 20-pdr with its fume extractor;
and a 1st Armoured Regiment photograph: mesh baskets round the turrets, the squadron numbers on them, the skirts off).
Built as the `mk5_1_aus` mark of `src/vehicles/profiles/centurionFamily.ts` on the rebuilt Mk 5 hull and turret (the
shared gap table is in `centurion3.md`); spec `src/vehicles/centurionAusSpecs.ts`, a clone of the Strv 81 (the Mk 5
with the 20-pdr Type B) keeping its stats (ledger entry `centurion5_1_aus`). It flies Australia's flag (country
`australia`, flag-icons `au`, a red kangaroo roundel), drawn in the UK tree's special lane at II beside the Strv 81.
Configuration: C Squadron, 1st Armoured Regiment, Vietnam, 1968-71. Implementation: DONE.

### Sources

| Key | Source |
|---|---|
| 5RAR | https://5rar.asn.au/centurion-mk5-tank/ (the coaxial .50 as the 20-pdr's ranging gun: three tracers, then the 20-pdr) |
| HN | https://historynet.com/australias-centurion-mark-5-tank/ (most Australian Centurions upgraded to Mk 5/1 before Vietnam; C Squadron in Vietnam from February 1968; the 100-gallon armoured fuel tank on the rear hull plate, soon seen as a fire hazard) |
| WT | https://wiki.warthunder.com/Centurion_Mk.5/1 (the 1967 refit's infra-red night equipment for commander, driver and gunner) |
| Owner | the reference render and the 1st Armoured Regiment photograph supplied 2026-10-28 |

### Differences from the rebuilt Mk 5/2 and Strv 81

| Item | Source | Build |
|---|---|---|
| Gun | the 20-pdr Type B with its fume extractor (Owner; HN) | the Strv 81's 20-pdr Type B |
| Ranging gun | the coaxial .50 (5RAR) | a heavier coaxial barrel and flash hider at the mantlet's coaxial port |
| Searchlight | the red-lensed infra-red/white searchlight on the mantlet (Owner; WT's night equipment) | a 0.30 m drum on a pedestal on the mantlet's top right, pitching with the gun, its lens a searchlight |
| Mantlet | the laced canvas cover (Owner) | the Sho't Kal's canvas cover |
| Glacis | the Mk 5/1's extra glacis plate; two spare road wheels carried on it (Owner) | the appliqué plate and two 0.76 m wheels on studs side by side; the armoured headlight boxes moved onto the front bins |
| Skirts | off in Vietnam (Owner's photograph) | no side plates: the Horstmann bogies drawn (hanger brackets, spring housings, arms) |
| Rear | the 100-gallon armoured fuel tank on the rear plate (HN) | a 1.78 x 0.46 x 0.40 m tank on two brackets with its filler and feed, the infantry telephone on its right end; no slung tow cable there |
| Turret stowage | mesh baskets round the bustle and the turret's side, the squadron number on them (Owner's photograph) | a deep rear basket on arms, a side basket along the left rear bins, the number on the rear basket |
| Roof gun | the commander's .30 Browning (no Browning class in the fleet) | the Mk 5's cupola MAG 58 station |
| Coat | Australian khaki green (Owner) | `paint_centurion5_1_aus` "RAAC Plain Olive Drab" |
| Length | 8.02 m over the fuel tank and telephone (the family hull 7.56 m) | measured |
