# Stridsvagn 103B (`strv103`)

**Exact variant modeled:** Strv 103B, 1970s Swedish service fit — fixed
105 mm L74 (L/62), hull-aimed, dozer blade under the nose, ribbed radiator
louvres ON the glacis, flotation-screen rim around the hull top.

## Corroborated dimensions

| Measure | Value | Sources (2+ independent) |
|---|---|---|
| Hull length | 7.04 m | en.wikipedia.org/wiki/Stridsvagn_103; globalsecurity.org/military/world/europe/strv-103.htm |
| Overall length (w/ gun) | 8.99 m | Wikipedia; militaryfactory.com/armor/detail.php?armor_id=104 |
| Width | 3.63 m (3.6–3.8 across marks) | Wikipedia (103B 3.6 m); spec sheet 3.63 m |
| Height (to cupola) | 2.14 m | Wikipedia; globalsecurity |
| Gun | 105 mm kan Strv 103 L74, L/62 (~6.5 m tube), fixed to hull | Wikipedia; militaryfactory |
| Running gear | 4 road wheels/side + raised rear idler, FRONT drive sprocket, tensioned top run behind shallow skirts | Wikipedia; globalsecurity |

## Identity cues

- No turret at all: one low wedge. VERY long, hard-raked glacis (~78° from
  vertical) carrying transverse louvre ribs (radiators) and the gun tube
  emerging at its middle; travel clamp near the nose tip.
- Dozer blade folded flat under the nose (103B), its top edge visible ahead
  of the sprockets.
- Roof: low commander's cupola (right) with vision ring; fixed observation
  dome left; two whip antennas at the rear corners; flat engine deck with
  intake ribs immediately behind the glacis break.
- Rear: tall near-vertical plate, stowage rail/boxes, the hull-top rim strip
  (flotation screen stowage) running around the deck edge.
- Running gear: 4 biggish road wheels + similar-size raised idler at the
  rear, front sprocket, thin fender/skirt band over the top run.

## Reference links

1. https://en.wikipedia.org/wiki/Stridsvagn_103 — dims, L74, dozer, config
2. https://www.globalsecurity.org/military/world/europe/strv-103.htm — layout
3. https://www.militaryfactory.com/armor/detail.php?armor_id=104 — table

## Local GLB oracle notes

Path: `public/models/tanks/community/strv103_wesiora.glb` (fixedMount,
CC-BY). Width-normalized to 3.63 m: 9.17 m long × 2.82 m tall — height is
the two whip antennas over a ~2.1 m hull; gun projects ~2 m past the nose.
Oracle shows the louvred glacis, cupola, fender rib line and exposed wheel
run. Fused mesh: component masks N/A.

## Mismatch log (before → after per fidelity iteration)

| Date | total | minView | whole | tracks | change |
|---|---|---|---|---|---|
| 2026-07-30 | 80.0 | 75.3 | 83.4 | 65.3 | baseline (slab box, tracks fully hidden — worst tracks band in family) |
| 2026-07-30 | 82.4 | 73.3 | 83.8 | 76.1 | bespoke rebuild: raked louvred glacis w/ splash rail, fixed L74 exiting mid-glacis + travel clamp, dozer blade, flotation-screen rim, cupola + obs dome + fender MG box, ribbed skirt band over 4 exposed wheels + raised idler, dark bay walls (tracks band 65→76) |

Remaining gap: left/right ≈73 — the wesiora oracle carries a busier rear
deck massing and larger wheel read than the packet photos; its baked
texture also 404s one map in the lab (oracle-side quirk). Next lever:
deck piping + rear stowage massing.


## Geometry gate v9 (2026-07-31, from-scratch agent)

Rebuilt table-driven against docs/references/profiles/strv103.json (all-hull
rig per the fixedMount mask topology). v9: hull 42.9 / whole 43.3 / turret 100
/ stations 30.8 / dims 91.4 / floaters 100 (was all-zero rows + dims 75.8).

CERTIFIED ORACLE-DEFECT CAPS (dims held sovereign):
- heightM: the print's commander cluster reads 2.33-2.38 over ~1 m of roof and
  its antenna mast rake tops 2.80; published 2.14 pins the build crown at 2.18
  (heightM measures 2.16). Every cluster column carries ~0.2 m of curve error:
  side/front curve ceiling ~70-75.
- Nose line: the oracle's dozer/fender front line runs to +3.86 from body mid,
  but any sub-gun geometry past +3.52 lifts the 12%-band span over published
  hullLengthM 7.04 (side columns integrate all x), so the blade stops at the
  published span; the plan view carries ~0.28 m error on ~12 mid columns and
  the tail (oracle -3.86 vs build -3.58) ~4 cover columns: plan ceiling ~70.
Stations 30.8: two onlyOne slices at the muzzle-side (the ref's fused-gun
z-range vs the build's thin tube) — improvable by fattening the exposed tube
band toward the oracle's 0.18-0.2 read.


## Geometry gate v10 round-2 (2026-07-31)
Round-2 row: hull 41.5 whole 41.5 turret 100 (fixedMount) stations 37.1
dims 98.2 floaters 100 (ledger: 42.9/43.3/100/30.8/91.4/100).
Changes: dims closed (muzzle/exhaust trimmed to published overall 8.99);
station width killers fixed per the slice probe — tail underside wedge
narrowed to the print's ±1.18, fender plates pulled to its ±1.63 line,
5 cm antenna masts (the print's own pair to 2.80) so the slices rasterize
them, dozer blade widened to ±1.20, muzzle collar to the print's 0.22 dia.
REMAINING (live): slice 11 width (print's full-width dozer/fender assembly
at +3.4..+4.0 vs my capped blade — the packet cap: sub-gun geometry past
+3.52 would lift hullLengthM over published); the 2.33-2.38 cupola-cluster
stature cap (published heightM 2.14 pins the build at 2.18) still costs
~6-8 topPct on 3 slices and the side-row crown columns.

## 2026-08-06 FLEET MUZZLE-BORE + §C.1 WINDING SWEEP (fleet-sweep one-liner)
- §B3.1 bore inside the L74 muzzle collar on the fixed glacis gun (hullG parent, z 5.40); §C.1 1 reversed re-oriented (dozer blade slab); F-vs-D 27->0; gate HELD x2 EXACT 37.1; hash not frozen; mantlet mass verified per MANTLETS-MANDATORY (db9168c). Mechanism: kit.js muzzleBore shadow-named furniture + orientedSlab guard (3fca39b / 1017339); end-on+quarter crops shots/muzzle-sweep/{before,after}/.
