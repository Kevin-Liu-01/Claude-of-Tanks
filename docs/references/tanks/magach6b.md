# Magach 6B (`magach6b`) — reference packet

## Current status (release 267, 2026-10-29): a new Israeli M60

Owner, 2026-10-28: "for the m60 new variants, lets add the: * Magach Series (Israel) ... (Magach 6 and Magach 7
families)". Built as the `magach6b` mark of `src/vehicles/profiles/pattonCast.ts` (`buildM60CastSteps`) on the M60A1's
measured hull and turret ([m60a1.md](m60a1.md)); spec `src/vehicles/m60VariantSpecs.ts`, a clone of the M60A1 sharing
its package (fleetBalancePass). Israel's special line at I. Implementation: first build; blind critics and the
release check pending.

Exact vehicle: the IDF's **Magach 6B**, an M60A1 rebuilt in the early 1980s with Blazer explosive reactive armour, the
low Urdan commander's cupola, the 105 mm M68 in its thermal sleeve and the .50 over the gun, as the Yad la-Shiryon
(Latrun) museum tank.

### Sources

| Key | Source |
|---|---|
| Latrun | Wikimedia Commons, User:Bukvoed: M60A1-Patton-Blazer-latrun-2/3/4 (CC BY 2.5), the Yad la-Shiryon tank |
| Memorial | Wikimedia Commons: 7th Armored Brigade memorial 100925 Patton (CC BY-SA 4.0), Tank Square 1/2/4 (CC BY-SA 4.0) |
| Blazer | Wikimedia Commons: Blazer ERA (CC BY-SA 4.0), one module |
| Gal | Wikimedia Commons: Idf m60 magach 6b gal 1985 (CC BY-SA 4.0), the later Gal (Batash) drawing: hull and cupola only |
| Local copies | `~/cot-lanes/m60-variants-refs/magach6b/` (reference only; never shipped), `SOURCES.md` there |

### Differences from the M60A1 build

| Item | Source | Build |
|---|---|---|
| Turret Blazer | eight tall boxes on brackets along each flank, their tops stepping down rearward; two courses round each cheek; a row along the roof's front edge (Latrun) | `m60BlazerTurret`: one consumable cluster a side (`magach6b_turret_era_L/R`) |
| Glacis Blazer | two rows of slabs up the glacis between the light groups, one either side of the driver's hatch (Latrun, memorial) | `m60BlazerGlacis` (`magach6b_glacis_era`) |
| Cupola | the low Urdan cupola: a vision-block ring under a domed hatch, the commander's MAG on its pintle (photographs) | `m60UrdanCupola`; the loader's MAG on its post |
| Gun | the M68 in its thermal sleeve and clamp bands; the .50 on a cradle over the mantlet (Latrun) | the A3's sleeve; the .50 in the gun frame |
| Stowage | the IDF wire basket round the bustle and along the flanks (photographs) | the A1's rack with four rails and its mesh |
| Searchlight | none (photographs) | the A1's AN/VSS-1 left off |

### Not drawn

The radio fit and the crew's personal stowage.
