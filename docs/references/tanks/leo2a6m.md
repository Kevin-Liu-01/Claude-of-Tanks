# leo2a6m — Leopard 2A6M (mine-protection package, ISAF bar-armor fit) — oracle packet

## Source
`public/models/community-candidates/leo2a6m_arrafi.glb` — Arrafi
(nazidefenseforceofficial), EXTRACTION-SUSPECT ×2 per docs/ATTRIBUTION.md
(adjudicated rip-poster account + WT-lineage `chassis_vlo` scheme).
LOCAL-ONLY quarantine, measurement/visual reference only, never ship.
9 prim-instances, 4 materials (chassis.0/.1, Slat_Armor.0, chassis_vlo.1).

## _vlo SHELL-ISOLATION AUDIT (§5.248 germany round — REQUIRED first; the
## §5.261 pt91 POLLUTED precedent. Verdict: POLLUTED-for-components, by the
## chassis.0 detail shells — NOT by the _vlo pair itself)
Real-vertex scans (tools/tmp-leoM-vlo-audit.mjs — referenced verts only,
accessor min/max never used per the §5.261 law; glb frame, nose +x):
- `Object_9/10` (chassis_vlo.1, 9264/840 verts, IDENTICAL AABBs x -4.120..
  4.223, y -1.067..0.495): a running-gear LOD duplicate pair confined to the
  wheel band — **the print's ONLY full wheel train**. y ≤ 0.495: no turret,
  no gun. BENIGN-REQUIRED — excising them amputates the wheels; duplicate
  shells inside one envelope cannot move a binary mask.
- `Object_5` (15781v) + `Object_7` (9135v), both chassis.0, both spanning
  x -4.44..7.964: detail shells that BAKE THE FULL GUN TUBE into the hull
  side (sparse tube rings |z| ≤ 0.21, y 1.14..1.56, x 4.31..7.964 — muzzle
  7.964 = the overall-length extreme) plus an at-rest TURRET BAND: Object_5
  carries sparse tops 1.636..1.847 across x -3.44..3.06 that MIRROR the
  turret component's own band tops (receipts: 1.725/-3.0, 1.847/-2.3 in
  both). Object_8 (2392v) = rear track section duplicate (y ≤ -0.113).
- `Object_3` (Slat_Armor.0, 4746v): the bar-armor cage INCLUDING turret
  cage panels at turret heights (y to 1.897, x -3.6..2.4, z ±1.62..1.74) —
  parked hull-side, so at-rest turret-height mass rides every hull mask.
- `Object_6` (turret component, 15102v, x -3.286..3.663, y 0.812..2.811):
  CLEAN — a real welded wedge turret with PERI/hatch/mast content and NO
  gun. `Object_4` (28150v): clean hull tub + skirts (y ≤ 1.122). `Object_2`:
  a 4-vert plate.
INSTRUMENT CONFIRMATION (vertex-extract): hullMask span reads 11.687 m =
+51.4% vs hull 7.72 — the gun-bake receipt. The hull-row registration and
every hull/turret/station component row are structurally dishonest no matter
the build (marder1a3/t72m1_jaguar class) → registration completed as
`componentMasks:false` in all three maps (procedural-fidelity,
visual-evaluator-page, tmp-tank-critic). Honest rows: whole views (9), dims,
floaters. FALSE-0 law respected — no component rows recorded.

## Print scale self-consistency (the width-anchor finding)
At the REGISTERED pubDims width 4.24 every read inflates: bodyH +5.2%,
bodyLen +7.3%, overall +6.5% (vertex-extract receipts). At the print-true
over-cage width **3.98** (slat z ±2.277 glb × the hull-anchored 0.8739 m/u):
overall = 10.97 EXACT, hull = 7.71, bodyH = 2.99 ≈ the 3.03 over-PERI
figure. The print is a self-consistent 3.98-wide-over-cage vehicle; the
4.24 REG figure is the odd one out (divergence reported, orchestrator item).

## Measured lines (true meters, build frame: ground 0, bow hull face ~3.77,
## rear wall -3.62; from the CLEAN components only)
- Running gear (Object_9 decode): 7 duals at 0.804 m cadence, set mid ~0.11
  rear-of-hull-mid; sprocket REAR, raised idler far forward — wrap far edge
  ~3.98 (the print's own bow anchor); ground = wheel bottoms = track plane.
- Hull tub (Object_4): deck 1.91 print (PRINT-TALL vs 1.80 published class
  — verticals built published-first, pt91 pattern), skirts ±1.84, sponson
  band ±1.72-1.84.
- Turret (Object_6): bustle rear world -2.60/-2.65; roof band 2.55-2.66;
  PERI cluster tops 2.98-3.00 (x -0.79..-0.04 — WIDE enough to own the
  print's own p95); mast spike 3.39 (1 column); wedge apex reaches world
  ~3.40 (0.6 behind the bow); cheek chord ±1.51 max; side modules ±1.42-1.44.
- Cage (Object_3): hull run world -3.80..+3.38 at ±1.99, y 0.70..1.90;
  turret panels world 2.0-2.59 band; stern panel at -3.80.
- Gun (from the baked tube, measurement only): tube rings to muzzle world
  7.18 at my anchor = rear cage -3.80 + overall 10.97 EXACT.

## Spec decisions (src/vehicles/germany.js — silhouette* strip law applied)
dims 7.72 / 10.97 / **3.98** (over-cage, print-verified) / **3.03**
(published over-PERI; the PERI crown is authored 0.34 deep = 3+ side
columns so the p95 heightM law lands ON it — whips excluded by the
3-column p95 budget). Rig: turretPivot [0,1.80,0.45], gunPivot [0,0.33,
0.85], gunBarrel 5.98 (the lit bore mouth lands ~7.15; the r1 5.88 tube
read 0.13 short on the lit-pixel span — bore-mouth law vs overall 10.97).

## Gate close (FINAL state ×2 BIT-IDENTICAL, md5 e9fd1cac ×2)
**min 90.9 PASS** | whole 90.9 (registered-standard-view masks, fused-ref
metric) | dims 100 (heightM 3.02 +0.25%, hull 7.68 +0.52%, overall 10.94
+0.24%, width 3.99 +0.26%) | floaters 100 (5 poses incl yaw90/180).
Audits: track-clip --exact --strict 0/0 + shoe 0/0 + sweep 0/0;
turret-parent 0/0/0. Baseline (donor-wrapper): min 82.8 (whole 82.8, dims
95.6) — shots/germany-wave/leo2a6m-gate-baseline.json.

## Ladder receipts (honest-adjustment log; losers reverted with receipts)
1. r1 heightM 2.79 vs spec 2.66 (+4.7%): tall-cluster overflow of the p95
   3-column budget (probe: tools/tmp-leoM-heightprobe.mjs).
2. r2 trims (mast 2.62, pots 2.68, rack cargo:false, cooler 2.63) + tall
   whips 3.42: p95 fell ON the 3-col PERI crown → 2.93 (+10%) — WORSE:
   the whip column pushed the PERI into the p95 index.
3. r3 RESOLUTION: spec heightM = the published 3.03 over-PERI datum; PERI
   crown authored 0.34 z-deep (3+ columns at 3.03) so p95 lands on it for
   ANY whip column count (1 or 2). Read 2.99 → crown +0.04 nudge → 3.02 ✓.
4. overall -1.12%: the buildGun lit tip measures ~0.10-0.13 behind len —
   len 5.88 → 5.98 → overall 10.94 (-0.24%) ✓.
5. Cage rails 4 rows → 7 (hero receipt: 4 rows read as a luggage rack, not
   bar armor); scores held 90.9/100/100 — visual-only within the envelope.

## Certified caps / residuals (documented, not mirrored)
- Print-tall lower body: deck 1.91 vs my published-first 1.80 (+6%) —
  translation registration absorbs most; residual in the whole rows.
- Print mast 3.39 vs mine 2.62 (p95 law bars a tall wide mast; whips carry
  the bbox instead).
- The 4.24 REG width divergence (print-true 3.98) — orchestrator true-up ask.

## §E repair plan (orchestrator lane; warp law v2, COUPLED — restores
## component gating for a future re-registration)
1. MOVE (index-surgery, tri-level) from `Object_5` and `Object_7` into a
   new child of `Object_6`: all tris whose verts ALL satisfy
   (x > 4.31 ∧ |z| < 0.25 ∧ 1.10 < y < 1.60)  — the baked tube — and all
   tris fully inside (y > 1.25 ∧ -3.45 < x < 3.10 ∧ |z| < 1.55) — the
   at-rest turret band.
2. MOVE from `Object_3` into the same child: tris fully above y 1.25 (the
   turret cage panels; the hull cage run stays hull-side).
3. KEEP `Object_9/10` untouched (required running gear; benign LOD pair).
4. Optional normalize: y ×0.94 above the 0.50 belt line (deck 1.91 → 1.80)
   about the wheel-top plane — print-tall correction.
5. Re-register with componentMasks restored; re-gate; expect hull/turret/
   station rows to become satisfiable (hullMask 11.69 → ~7.8).

## §E EXECUTED — batch 63 (2026-08-17, §5.248 §E round; steps 1-3 landed,
## step 4 optional-skipped, step 5 deferred)
The tri-level de-bake LANDED (repair_oracles.py batch 63, new
census-guarded _tri_region_move op — challenger2 batch-48e class,
generalized): complete triangles inside the filed rule boxes moved
verbatim from Object_5 (753t/1040v), Object_7 (615t/621v — incl. the
baked tube to muzzle 7.964) and Object_3 (668t/1336v cage panels y>1.25)
into the new TurretBake node under Object_6; source accessor min/max
re-derived (batch-52 law); Object_9/10 (chassis_vlo wheel-train pair)
UNTOUCHED as required. Receipts: .bak = pristine c10680a8…, output
8ece5895… byte-idempotent ×2; per-source censuses exact. OFFICIAL GATE
×2 BIT-IDENTICAL: **90.9 PASS / dims 100 / floaters 100 — EXACT HOLD**
(the whole-view mask is move-invariant; the hold IS the byte-move proof).
Step 4 (y ×0.94 print-tall normalize) NOT taken — optional, no sim
receipt, and the row passes. Step 5 (componentMasks re-registration)
DEFERRED per §5.299 ("leo2a6m/leo2a4m §E items DEFER until lane E
lands") — this repair is provably gate-inert now and simply unlocks the
future component re-registration lane E will want (hullMask 11.69 ->
honest post-re-registration). If lane E prefers the pristine print, the
revert is one command (restore the .bak; demote batch 63 to history).

## Build notes (ground-up §5.248 rebuild — buildLeo2A6M,
## src/vehicles/profiles/leopard.js)
leoHullV3 family loft (own deck/glacis tables, family stations), leoGear
print cadence (7 @ 0.804, span [2.53,-2.29], sprocket -3.11, idler 3.60
wrap-to-3.98), wedgeTurretV3 with print-traced nose/crest/body tables
(apex local 2.90, cheeks ±1.51 via tipPads/sideMods), M-package: bolted
belly plate + raised belly line (bellyY 0.56), reinforced driver hatch,
full bar-armor cage at ±1.99 EXACT (hull runs ×6 sections, stern panel
-3.80 = the overall anchor, turret flank ×3 + tail sections turret-owned
per the parent law), German fender grammar (bins, width rods, Bosch horn,
pioneer kit, tow cable, spare links, convoy plate, tow eyes, shackles),
Wegmann 2×4 banks per side on the chamfer slopes, ISAF cooler box, PERI
crown at the 3.03 datum, raised whips (vertical-only — see the a4m packet
whip-rough law), L55 via leoMantletGun + §B3.1 muzzleBore at 5.98.

## §5.299 OWNER ORDER — turret FINISH (lane E, §5.311 recovery; 2026-08-17)
ORDER (verbatim): "and finally finish the leopard 2a6m turret."
Baseline 59452b7a; row baseline 90.9/100/100 (post-§5.306 print detail-
shell excision, EXACT-HOLD move-invariance proof). DELIVERED (the critic
polish list, all five items, in buildLeo2A6M):
1. BOW-CORNER cage flare panels: the run terminus turns in across z
   3.06..3.42 (face swing 1.978→1.792), corner+forward posts, brackets
   into the skirt band/lip; inner ends outboard of the 1.66 shoe envelope
   (§B4 a4m mudflap-law class); every extreme inside the certified ±2.00
   cage frame (widthM 3.98 anchor untouched).
2. REAR-WALL service grammar behind the stern cage: crossed tow cables
   (X) over the transom with upper/lower cable eyes, corner tail-lamp
   pods + lenses + guard bars — all inside the -3.80 cage-tail overall
   anchor, seated on the tail frame/rear wall.
3. FLANK cage run extended FORWARD 3→5 sections (nose flank was bare vs
   the ref's fuller run); forward sections seat both brackets on the
   side-module band; existing sections byte-identical; ISAF placard
   bridging the sec-3/sec-4 rail gap (flank decals ride the slat — the
   wall decals would hide behind the extended run).
4. FRONT detail density toward the print: driver periscope trio at the
   deck crease, glacis clamp studs inboard of the lane cuts (ref-matched
   density), center service cover + seam, EMES brow gutter, §B3.1-class
   coax port mouth on the slot wall.
5. WEDGE-BAND soften where dims-legal: Barracuda strap studs half-buried
   on the cheek plates, chamfer hardware studs, side-module panel joints
   (dark engravings ON the certified mod face — zero column growth; the
   heightM spike columns untouched).

### Gate close (final bytes ×2 BIT-IDENTICAL, md5 a83b28c2 ×2)
**min 91 PASS** | whole 91 | dims 100 | floaters 100 — HOLD-OR-IMPROVE
vs 90.9 satisfied (+0.1, dims 100 held EXACT). Audits: track-clip --exact
--strict 0/0; turret-parent 0/0/0; duplicate-course PASS. Hash 59452b7a→
**e004f4d8** (49/112843). Guards as the a4m packet (all EXACT). Evidence:
shots/germany-order/leo2a6m-before/leo2a6m/ (59452b7a bytes) vs
shots/germany-order/leo2a6m-after/leo2a6m/ (final bytes, 14 views).
