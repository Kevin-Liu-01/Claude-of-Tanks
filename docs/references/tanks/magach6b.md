# Magach 6B (`magach6b`) — reference packet

## Current status (release 267, 2026-10-29): a new Israeli M60

Owner, 2026-10-28: "for the m60 new variants, lets add the: * Magach Series (Israel) ... (Magach 6 and Magach 7
families)". Built as the `magach6b` mark of `src/vehicles/profiles/pattonCast.ts` (`buildM60CastSteps`) on the M60A1's
measured hull and turret ([m60a1.md](m60a1.md)); spec `src/vehicles/m60VariantSpecs.ts`, a clone of the M60A1 sharing
its package (fleetBalancePass). Israel's special line at I. Implementation: first build; blind critics and the
release check pending.

Stage A (Main, 2026-10-31): no 3D model exists for this mark, so it passes stage A through the Latrun photo packet
(`docs/references/photos/magach-latrun-20261031.json`, `tools/photo-reference-policy.mjs`), proved by
`src/vehicles/profiles/pattonCastProportions.selftest.mjs`. Its round-18 blind photo critic scored 7/10; rounds 19-22 (267) worked the critic items each photograph confirms (round 8 critic: 7/10; the critics' asks reverse between runs, so only photo-backed items were built).

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
| Turret Blazer | eight tall boxes on brackets along each flank, their tops stepping down rearward; two courses round each cheek, the boxes nearest the mantlet standing off on brackets and tipped forward; a row along the roof's front edge (Latrun) | `m60BlazerTurret`: one consumable cluster a side (`magach6b_turret_era_L/R`); rounds 19-22: a wedge of two boxes on a bracket beside the mantlet, its edge forward, faces turned 40 degrees out and in; the cheek's courses behind it on the casting; the flank row fanned aft (tops leaning back 5 to 25 degrees), its feet stepping up 8 cm and its rear tops to 5 cm under the roof's edge; every box a flat shell with its foot chamfered, hex bolts and a bolted tab; the upper glacis row a sawtooth 11 degrees steeper than the plate |
| Glacis Blazer | two rows of slabs up the glacis between the light groups, one either side of the driver's hatch (Latrun, memorial) | `m60BlazerGlacis` (`magach6b_glacis_era`) |
| Cupola | the low Urdan cupola: a vision-block ring under a domed hatch, the commander's MAG on its pintle (photographs) | `m60UrdanCupola` (round 20): one turned casting, its flange 1.15 m across, a short drum leaning in, the dome rounding to a raised hatch ring 0.60 m across, 0.32 m over the roof; eight periscope heads standing out of the drum, the hinge block and grab handles; the loader's MAG on its post |
| Gun | the M68 in its thermal sleeve and clamp bands; the .50 on a pedestal over the mantlet; the canvas bag over the mantlet (Latrun) | the A3's sleeve; the .50 on a frame of two struts with its cradle, the big box beside its receiver and its flash hider (rounds 20 and 22); the bag 0.95 x 0.65 m with its tapered sleeve and two straps |
| Stowage | the IDF wire basket round the bustle and along the flanks, loaded (photographs) | the deep bar basket; two kit bags and a pair of jerrycans in it (round 19); a taut tow cable a side up the glacis (round 21) |
| Rear grille | the IDF engine grille box over the rear plate: two doors of louvres raked into an inverted V either side of a post (latrun-3, Tank Square 4) | `m60IdfGrille` (round 21), shared with the 7C |
| Searchlight | none (photographs) | the A1's AN/VSS-1 left off |

### Not drawn

The radio fit and the crew's personal stowage.
