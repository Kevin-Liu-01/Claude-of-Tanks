# Magach 7C (`magach7c`) — reference packet

## Current status (release 267, 2026-10-29): a new Israeli M60

Owner, 2026-10-28: "for the m60 new variants, lets add the: * Magach Series (Israel) ... (Magach 6 and Magach 7
families) ... which look crazyyy". Built as the `magach7c` mark of `src/vehicles/profiles/pattonCast.ts`
(`buildM60CastSteps`) on the M60A1's measured hull and turret casting ([m60a1.md](m60a1.md)); spec
`src/vehicles/m60VariantSpecs.ts`, a clone of the M60A1 sharing its package with the 7C's armour factor and the
AVDS-1790-5A's 908 hp (fleetBalancePass). Israel's special line at II. Implementation: first build; blind critics and
the release check pending.

Stage A (Main, 2026-10-31): no 3D model exists for this mark, so it passes stage A through the Latrun photo packet
(`docs/references/photos/magach-latrun-20261031.json`, `tools/photo-reference-policy.mjs`), proved by
`src/vehicles/profiles/pattonCastProportions.selftest.mjs`. Its round-18 blind photo critic scored 7/10; round 19 (267) rebuilt the front modules, openings and rear grille from those items.

Exact vehicle: the IDF's **Magach 7C** of the late 1980s and 1990s: the M60 turret under flat passive armour modules,
a plate over the upper glacis, deep bolted side skirts, the low Urdan cupola with the commander's .50, the 105 mm M68
in its thermal sleeve, as the Yad la-Shiryon (Latrun) museum tank.

### Sources

| Key | Source |
|---|---|
| Latrun | Wikimedia Commons, User:Bukvoed: Magach-7-latrun-1..4 (CC BY 2.5), Magach-7-latrun-5 (CC BY 3.0; dozer blade not drawn) |
| Field | Wikimedia Commons: Magach-7c-055 (CC BY-SA 3.0), Magach7tank, IDF Magach Merkaz (public domain), Tanks in Gilo, Operation Defensive Shield 45/91 (CC BY-SA 3.0) |
| 7A | Wikimedia Commons: Idf m60 magach 7a 1990 (CC BY-SA 4.0), the Magach 7A drawing: layout only |
| Local copies | `~/cot-lanes/m60-variants-refs/magach7c/` (reference only; never shipped), `SOURCES.md` there |

### Differences from the M60A1 build

| Item | Source | Build |
|---|---|---|
| Turret armour | flat bolted modules with joints between them: either side of the gun's slot a chisel-fronted inner module, outboard of it a module turned back and a corner module turned further, the side pack's three modules back to the bustle (Latrun) | `m60Magach7Armour` (round 19): inner modules 0.72 m wide (knife at the bore, upper face 30 degrees, lower 32), a middle module turned 25 degrees with its knife 0.10 m back, a corner module turned 55, the pack in three lofts; 1.5 cm joints; bolts and a lifting eye along each module's top; a plate over the roof's front |
| Openings | beside the gun on the left a round-topped aperture and a slot outboard of it; on the right a small round port (latrun-1) | the inner modules' upper faces are plates 0.15 m thick on cores sunk under them, the openings cut through them with dark backs: the aperture 0.28 x 0.30 m, the slot 0.12 x 0.50 m round-ended, the port 0.14 m; the gun's slot lined dark |
| Rear grille | the Magach 7's grille box: two doors of slats raked into an inverted V either side of a post, its top corners chamfered, standing proud of the rear plate (latrun-4, Tanks in Gilo) | `m60Magach7Grille`: 1.65 x 0.69 m, 0.20 m proud, fifteen 4 cm blades a door at 28 degrees, two shackles under it, the tail lights moved down under it |
| Glacis | a thick plate over the upper glacis between the light groups (Latrun front) | `m60Magach7Hull`: its lower lip 0.10 m (round 19), its bolts and lifting eyes |
| Skirts | deep skirts of bolted panels a side hung on the fenders' lips, their fronts raked over the idlers (Latrun side) | `m60Magach7Hull`; round 19: a drain slot in each panel's foot |
| Cupola | the low Urdan cupola with the commander's .50; the loader's MAG on its post (photographs) | `m60UrdanCupola` |
| Gun | the M68 in its thermal sleeve and clamp bands (photographs) | the A3's sleeve |
| Stowage | the large IDF wire basket round the bustle (Latrun rear) | the A1's rack with four rails and its mesh |
| Rangefinder | its ends covered by the armour | the blisters left off |

### Not drawn

The smoke dischargers' exact pattern (unclear in the photographs) and the crew's stowage.
