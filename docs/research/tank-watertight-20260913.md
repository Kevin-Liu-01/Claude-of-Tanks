# Watertight tank bodies — the flood-fill check and the first fixes (2026-09-13)

Owner clarification: "sealed" means you can pour water into a turret or hull
(the main body, not the tracks or fenders) and it does not spill out. The M1 X
family and the Leclerc still read see-through even though the view-based
sealed check (`tools/tank-sealed-check.mjs`, 33 outside views) passed them.

## The check

`tools/tank-watertight-check.mjs --ids=… [--gate] [--json=…]`

1. Build the tank (procedural, shipped materials via the shared node canvas
   shim in `tools/tank-surface-collect.mjs`) and take every body triangle:
   running gear, wheels, hubs, sprockets, skirts, fenders, external skirt
   armour, decals, shadow proxies, wires and soft goods are excluded.
2. Voxelise conservatively at 2.5 cm (every voxel a triangle crosses is
   shell, tagged with its mesh group).
3. Flood-fill the exterior from the grid border.
4. A voxel is *deep interior* when a body shell lies in all six axis
   directions from it AND it sits inside the hull's or the turret's own
   vertical shell span at that column. The second rule drops exterior pockets
   that distant shells enclose in every direction (the slit under a turret
   bustle, the space between sponson and belly, wheel bays).
5. Every deep-interior voxel the exterior flood reaches is a leak. Leaks are
   clustered and reported with litres, extent, the shell groups around them,
   and their mouths (where water enters, clustered) with the open axis
   directions from there (which way it gets out).

`--gate` fails any tank leaking more than `--max-leak-l` (default 0.05 L).
The engine-bay recess behind a real rear grille counts as interior when a
bulkhead closes it (see below), so a per-tank ledger, not the strict default,
is the intended gate for the fleet.

## Results

| tank | before | after | what was open |
| --- | --- | --- | --- |
| m1a2_sepv2_x | 13,912 L | 528 L | the whole U-well from the stern engine mouth; roof-seam slits at the sponson pinch |
| ua_m1a1_x, m1a1_x, m1a1ha_x | 13,837 L | 443 L | same shared hull |
| m1a2_x, m1a2_tusk_x, m1a2_sepv3_x | ~13,800 L | 446–471 L | same shared hull |
| abramsx | 3,890 L | ~350 L | the tub between the tracks emptied by the beltCoreTop cap (55 cm tunnel bow to stern); hollow turret cheeks under the roof block (the owner's markup) |
| leclerc | 1,696 L | 218 L | sponson band floating 17 cm above the tub; hollow bow under the glacis; glacis/tub seam; turret roof voids |
| leclerc_xlr | 1,632 L | 178 L | same builder |
| amx56 | ~1,650 L | ~200 L | same builder |
| leclerc_x / leclerc_classic_x | 8.5 L / 52 L | unchanged | already tight (their earlier numbers were road-wheel hubs) |

The remaining M1 X litres are almost entirely the recess behind the rear
grille screens, now closed by the engine-bay bulkhead 48 cm behind the slats
(the dark radiator wall the real vehicle shows). The remaining Leclerc litres
are a 33–35 L void per side between the cheek core's sloped face and the
outer cheek skin, plus small seams. The view-based check reports
see-through 0 px and open ≤ 30 px for all of them, ledger holds.

## What changed in the geometry

`src/vehicles/profiles/abramsSourceXHull.ts` (all seven source-X Abrams):

- turret race cover — solid stock filling the bearing deck's 1.308 m aperture
  through the slit to the turret floor;
- engine-bay bulkhead — a wall inside the grille screens spanning the well;
- sponson fills — the hollow sponson tubes over their constant run;
- well fill — solid stock under the bearing deck inside the inner walls, so a
  pinhole anywhere no longer floods 13,000 L.

`src/vehicles/profiles/misc.ts` (`buildLeclerc`: leclerc, leclerc_xlr, amx56):

- the sponson band now fills down to the tub top (1.22, was 1.38);
- bow fill under the raked glacis and a tub-to-lower-glacis seam fill;
- full-width underfill of the glacis plate;
- turret cores under the mid roof (left one split around the commander's
  hatch well) and under the forward high-roof caps; cheek chamfer wedges
  filled along their full length.

`src/vehicles/profiles/abrams.ts` (`abramsHull`, only tanks with
`beltCoreTop`, i.e. abramsx): the tub between the inner track faces is
refilled from the belly pan to the belt; the under-sponson wheel-bay daylight
the §5.27 order asked for is untouched.

None of these touch a silhouette; all are buried inside existing surfaces.

## Why the old check missed it

Openings that face inward (the ring slit under a bustle, a grille recess, a
seam at a sponson pinch) are small from every outside view, but water finds
them. The flood fill is the owner's test made literal.
