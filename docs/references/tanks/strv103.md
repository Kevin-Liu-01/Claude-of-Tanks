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

## §5.248 GROUND-UP REBUILD (sweden lane, 2026-08-17) — NEW ORACLE, NEW BUILD
The batch-B print `strv103b_lamonekeli.glb` ("strv 103b" by lamonekeli,
CC-BY-4.0, LOCAL-ONLY quarantine) became THE gate reference; the committed
wesiora candidateGlb stays in specs as a second reference. The old
casemate.ts donor-clone registration (`buildStrv103 + oracle package`) is
retired: strv103 is now a self-contained §K measured-loft build in
`src/vehicles/profiles/sweden.ts`.

REGISTRATION FIX (this round, all four maps): the print loads with its
length on raw X, nose -X (thin fixed-gun tube width 0.043-0.051 at raw
X -1.00..-0.48 at the ~1.4 m gun line) -> **yawOffset +PI/2**. Pre-fix rows
measured the print SIDEWAYS (overall read -81.8%; the whole-view baseline
15.4 was a scale artifact).

INSTRUMENT DEFECT — LENGTH-SHORT PRINT (certified-cap candidate + queued
repair): at the gate's width anchor (3.63) the print's body reads 5.76 m
long vs published 7.04 (-18.2%; overall 8.00 vs 8.99, height 2.21 vs 2.14).
Published dims are sovereign: the build lofts the print's wedge shape onto
the published frame (print z x1.2229 about the body mid). The fused
whole-view rows carry the print-frame cost with a measured ceiling ~83-86:
side/plan views cannot IoU>=0.9 a body 18% shorter at the same width.
QUEUED FOR THE ORCHESTRATOR LANE (§E): piecewise z-stretch of the body
(x1.223 about the body mid; the gun region translates to keep the published
2.0 m overhang, width NEVER warped). After the warp the whole rows become
satisfiable.

CLUSTER STATURE CAP carried over from the wesiora era, same class on this
print: its commander cluster reads 2.33+; published heightM (2.14,
p95-sovereign) pins the build cluster at 2.16.

Round receipts: honest baseline (old build vs new print, post-yaw-fix)
whole 75.8 / dims 67.7. Delivered (gate x2 identical, hash x2 bit-identical
4ac3c8c8): **whole 76.7 / dims 100 / floaters 100**; fidelity whole-views
76.7-82.7 (overall 79.9). The build carries the print's identity kit fresh:
nose fence (two planted carriers + 11 ribs at the 2.03-2.08 tip line),
folded dozer with arms/braces, glacis louvre banks, planted commander
plinth/cupola/dome cluster (Ksp 58 held p95-safe), twin rear grilles,
flotation rim strips, four-disc course with front drive + raised rear
idler, rear air-cleaner boxes carrying the published 3.63 width at ±1.815.

NEXT: (1) the orchestrator length-warp, then re-ladder the whole rows to
>=90; (2) side-view bottom line at the wheel gaps (print reads tighter);
(3) fence rib count/pitch fine-match at closeup (critic lane).

## §E EXECUTED — batch 57 (2026-08-17, §5.248 §E round)
Print z-warp LANDED per the filed plan (repair_oracles.py batch 57): body
×1.222859 about the gate mid -1.0845 (extract-frame literals in-recipe),
rear slab translated, muzzle pinned at tail'+8.99; y/width untouched.
Receipts: .bak = pristine sha256 eed21cd3…, output 58411c83… byte-idempotent
×2; census guard (3, 174965, 253638). Gate ×2 BIT-IDENTICAL at the
then-current graduate proc (4ac3c8c8): whole 76.7 -> **82.4**, dims 100 ->
92.1 (proc hullLengthM re-quantized 6.90 in the longer shared frame —
1-2 filter-column class, the t64bv-forecast dims-requantization; re-anchor
debt for the build lane), floaters 100. Post-warp ref body reads 7.011
(pub 7.04, -0.4%) / overall 9.01 — the length-short defect is RETIRED at
the source. NOTE (§5.301, landed mid-batch): the owner reverts the strv103
BUILD to the pre-§5.271 state (lane A); per the §5.299 adjudication the
print repair stays as the honest reference (lane A's post-revert re-gate
re-prices the row — the 08:29 in-flight ledger row 78.5/57 reflects lane-A
churn, not this repair).

## §5.299/§5.301 REVERT — owner extension: strv103 joins the undo (2026-08-17)
Owner extended the §5.299 order mid-flight (banked c60fc8aa): "revert the
strv 103b as well" — the §5.271 wholesale graduate replacement is undone.
Reverted to the pre-wave build at 75780d72^ (both sweden files restored
byte-exact; delivered uncommitted-unstaged). What went: the ground-up
§5.248 build re-frozen 4ac3c8c8 (31/64,589; whole 76.7 / dims 100). What
returned: casemate buildStrv103(P) + addStrv103BOraclePackage (the
§5.198-era graduate build).
- Reverted hash: **4c8f1330** (39 meshes / 74,847 verts). Before: 4ac3c8c8.
  NOTE: the restored build does NOT reproduce the historical 4d0ff518
  freeze hash — post-§5.229 standardization moved hashing, not geometry.
  §3 graduates-table row reversion is the orchestrator's at landing.
- Honest gate row ×2 bit-identical at the reverted build: **min 57**
  (whole 78.5 / dims 57 / floaters 100). The maps NOW carry the corrected
  +π/2 yawOffset (§5.271 registration repair kept), so this is the
  honest-current row, not the historical pre-yaw-fix whole 75.8 / dims
  67.7. Tool-written rows only.
- Guards unmoved: centurion3 63f6a82c, leo2a5 6ecdfb06.
- §5.254 pairs: shots/sweden-undo/{before,after}/strv103/ (14 sheets each,
  captured at their respective trees, 0/14 byte-identical).
The NEXT list above is suspended while the pre-wave build stands.
