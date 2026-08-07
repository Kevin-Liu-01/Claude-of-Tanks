# Challenger 2 (`challenger2`) — BASE-21 photo-class packet

**Exact variant modeled:** Challenger 2, British Army woodland fit (pre-TES):
Dorchester wedge turret with plan-swept AND elevation-raked cheek planes,
mantlet-less embrasure with canvas boot + L94A1 coax port on the left cheek,
GPS armored housing forward-right roof + SAGEM VS580 panoramic behind it,
episcope cupola right / loader hatch left with pintle GPMG, 2x5 smoke banks,
huge bustle bin + full-width basket, big flat squared skirts with the raised
stepped front panel, L30A1 with thermal sleeve + fume extractor + MRS.

## ORACLE STATE (adjudicated 2026-08-06, BASE-21 modern-first round)
**NO reference oracle.** MODEL_SOURCE is procedural, no ledger row,
tmp-tank-critic refuses the id. **FALSE-0 LAW: never run the gate on this
id.** Bar = photo class + published dims + §B battery + 14-view self-reads
(tools/tmp-ww2-photoclass rig — the PHOTO-CLASS FLOW law, leo2a4 lineage).

## Corroborated dimensions (photo-class targets)

| Measure | Value | Sources (2+ independent) |
|---|---|---|
| Hull length | 8.3 m | Wikipedia Challenger 2, army-technology |
| Overall length (gun fwd) | 11.50 m | Wikipedia Challenger 2, UK MoD data cards |
| Width | 3.52 m (over skirts) | Wikipedia, tanks-encyclopedia |
| Height | 2.49 m (turret roof) | Wikipedia, army-guide |
| Gun | 120 mm L30A1 rifled, sleeved, MRS | Wikipedia, RBSL data |
| Running gear | 6 road wheels (Hydrogas), 4 return rollers, rear drive | photos, tanks-encyclopedia |

Spec dims (modern1.js) match: 8.33 / 11.50 / 3.52 / 2.49. SPEC NOTE
(residual, orchestrator lane): armor `gunBarrel.lengthM` 6.7 vs the built
6.29 visible run — the shadow-proxy sizes law (§C) wants a true-up.

## r1 REBUILD (2026-08-06) — owner correction: "theres many modern tanks
## like challenger and t14 armata in there — focus on those first"

Old build (r4-era): authored ±1.895 vs the 3.52 published width (§D
violation — every probe rescaled), muzzle +7.75 = 11.9 overall, idler/
sprocket wraps buried in the bow/stern (clip 102/78 band + 182/74 shoe),
hand-rolled pintle (census mg0), §B5 abutting 1. Rebuilt IN
`src/vehicles/modern1.js` (its profile home — uk.js is owned by the live
uk round-4 agent; family-rig migration QUEUED for that lane).

### Build inventory (photo class, current rulebook)
- HULL: belly ±0.985 between the tracks (§B4 lane law); full-width band
  ±1.68 to the 1.55 roof; §B1 ONE shallow glacis plane (0.98@4.10 ->
  1.55@1.48) — the band front and fender line are cut by this plane;
  lower bow center-lane only (±0.985 — the idler lanes stay open); toe
  beam; rear plate center-lane below the band + full width above, grilles
  + louvres + convoy plate; fenders 1.02..1.76 with front mudguards
  swept over the idler (underside 1.035 over the 1.005 orbit crest) +
  rubber flaps at both ends clear of the wrap far edges (+4.085/−4.105).
- SKIRTS at ±1.76 EXACT (the §D width guard): raised stepped FRONT panel
  with raked leading edge (exposes the idler + §B6 approach run), 5 flat
  panels with seams, RECESSED dark handle strips (the old proud handles
  broke the guard), rubber fringe.
- GEAR (§B6): 6 Hydrogas wheels r 0.36 @0.46, REAR sprocket {−3.60, 0.55,
  0.33} + FRONT idler {3.60, 0.52, 0.31} both raised — trapezoid run; 4
  covered return rollers; track outer 1.665 = 0.035 clear of the skirt
  inner plane; paintedEnds; coveredTop 1.02.
- DRESSING (§I census): 2x lightCluster fittings on the mudguards,
  towCable fitting draped on the glacis, splash V-strips ON the raked
  plane, driver hatch + periscope at the glacis crest (moved out of the
  turret casting box — the AABB-stranded flag), sponson bins, rear-deck
  kit bags (moved from under the bustle — second stranded flag), lift
  eyes, KC91AA ZAP decal.
- TURRET (Dorchester wedge; §B1/§B1.1): ratified 2.80 plan width; both
  cheeks carry the same plan-sweep + elevation rake; embrasure block +
  dark walls + §B3.1 canvas boot collar + seam ring; L94A1 coax port on
  the left cheek face; Dorchester side module slabs with seams; GPS
  armored housing (hood + brow + RECESSED angled glass, crest 2.49 = the
  published height line); VS580 pano pedestal + drum + window; episcope
  cupola; loader hatch + census GPMG (FITTINGS.pintleMG mag/two-tone);
  2x whip antenna fittings; 2x5 smoke banks; bustle bin + full-width
  basket + strapped kit + camo-net roll; side baskets.
- GUN (§B3.1): TOGS II barbette above the gun (pitches with it), L30A1
  len 6.29 — thermal sleeve segments + clamp rings, fume extractor at
  0.58, MRS collar; muzzle +7.335 = 11.505 overall. No prisms.

### Machine battery (2026-08-06, official rigs; before -> after)
- track-clip --exact: 102/78 band + 182/74 shoe -> **0/0 + 0/0**.
- tank-standard-check: clip ✓, contig 0 ✓, decor mg0+0d -> **mg1+5d ✓**.
- turret-parent: abutting 1 + (post-rebuild) stranded 2 (driver
  periscope AABB-flag + deck bags under the bustle) -> **0/0/0** by
  re-seating the real equipment (no re-parenting needed).
- §B5 yaw-90 pair: shots/base21-modern-r1/challenger2-after2-yaw90 — the
  whole turret (cheeks, GPS, pano, cupola, GPMG fitting, whips, smoke
  banks, bin, basket, side baskets, TOGS+gun) yaws as one mass.
- npm test: 166 + track-geometry PASS.
- Geometry record hash (NOT a freeze — no graduation without a dual
  gate): 22c8127 (52 meshes / 68820 verts) at the final round tree
  (coax port + all fixes included).

### 14-view SELF-READS (photo class; builder reads, not critic verdicts;
### views = the critic rig exactly, shots/base21-modern-r1/challenger2-after2)
front 8.6 / frontleft 8.7 / left 8.7 / rearleft 8.6 / rear 8.6 /
rearright 8.6 / right 8.6 / frontright 8.6 / top 8.7 / hero-fl 8.7 /
hero-rr 8.6 / hero-toptilt 8.7 / close-front 8.6 / close-roof 8.7.
Weakest named reads: glacis camo patchwork reads busy around the splash
strips; the cheek faces could carry stronger appliqué module seam lines;
the boot collar sits slightly deep in the slot shadow at close-front.

### Residuals / next-round candidates
- Spec gunBarrel.lengthM 6.7 -> ~6.3 proxy true-up (specs live in
  modern1.js armorChallenger2 — same file, but §C says verify the
  shadow-proxy harness before touching; orchestrator lane).
- p95 spike census over the 2.49 line: VS580 head 2.90, whips ~3.1
  (raked), GPMG ~2.72 — all real fittings; if this id ever gains an
  oracle the whip fold-down treatment applies (a6 precedent).
- Family-rig migration to uk.js when that lane frees (challenger1
  recipes; QUEUED in PROGRAM-STATE-base21).
- NO ORACLE: §E re-source lane open for a clean-license CR2 print.

### Law notes for the bank (no-oracle modern lane)
1. §D WIDTH-GUARD RECESSED-FURNITURE COROLLARY: skirt lifting handles on
   a width-defining face must be recessed dark strips — any proud detail
   on the guard face silently re-anchors the §D scale of the whole build.
2. AABB-STRANDED RE-SEAT FIRST: both stranded flags here were real
   equipment in legal hull parentage sitting inside the turret casting
   AABB — the cheapest lawful fix was moving the equipment to its
   photo-true station (driver sight to the glacis crest, kit bags to the
   rear deck), not re-parenting and not documenting an artifact.

## ORACLE ONBOARDED (2026-08-06 base-21 wave — closes the §E re-source line above)
"Challenger II" by buh (the leo2a6 author), CC-BY-4.0 verified live —
`community/challenger_ii.glb` (80 MB). Registered in all THREE harness
maps + the vertex-extract REG (turretNode `^challendger[ _]2_0$` — raw
name has a space, GLTFLoader sanitizes to `challendger_2_0`; regex takes
both; autoPivot; NO gun node — tube is fused in the turret mesh, loader
normalizes the FULL box to overallLengthM). Extract:
docs/references/vertex/challenger2.json.

### Print facts (vertex extract + node census)
- ~1:1 meters, nose +z, no yaw needed. Hull mask span 8.192 (-1.7% vs
  8.33), overall 11.01 (-4.3%), width 3.519 (0%). Node split is
  MATERIAL-based, not assembly-based: `challendger 2_0` (ch2_1 mat)
  carries turret+gun+full-length fittings (z -4.56..+6.60, dips 2.60 m
  below deck, 3225 interpen verts); `challendger 2_1` = hull shell;
  `truck.001` = running gear.
- STYLIZATION: print body height 3.208 = +28.8% vs the 2.49 roof datum
  (deep running gear + tall turret read). §E height clamp BINDS (thin
  turret-left antenna tops the raw box at y 3.05; s 0.8007) — the width
  safeScale k 1.2318 recovers the frame (net -1.6% class). A §E
  height-normalize batch is the candidate repair if curve rows are to
  measure the real vehicle (leo2a5 band-flatten precedent).
- ORIENTATION-ASSERT ARTIFACT (law note): the extract's glacis vote
  reads -z because CR2's REAR deck plateau (1.71-1.81) tops the long low
  bow run — deck evidence (nose tip 1.13 at z +2.70, stern 1.46->1.81
  in 0.4 m) + muzzle overhang +2.82 m adjudicate nose=+z. Print is
  correctly oriented; the Soviet-tuned deck-descent heuristic misfired.

### HONEST BASELINE (single-id gate x2, 2026-08-06 — first CR2 ledger rows ever)
geoMin 0 x2 identical: hull 0, whole 0, turret 0, stations 13.6, dims 0,
floaters 100. dims 0 is the PROC's own read (height 2.87 vs 2.49 datum =
+15.07% -> score 0; length/width/overall all <=0.44%). Curve zeros are
real print-vs-build divergence + the print's +28.8% height stylization;
turret rows additionally print-capped by the material split (turret_plan
worst err 2.58 m at z -1.51). Worst columns: side_hull z 0.07 (refTop
1.14 vs procTop -0.11, err 0.855), plan_hull z -1.8 (err 1.90),
front_whole z 1.51 (err 0.77). Work order: reconcile the proc height
datum first (cheap +dims), then price a §E normalize before chasing
curves.

## §B8 ACCEPTANCE REWORK r2 (2026-08-06 — owner priority "build the
## type 10 and challenger 2 as a priority using the real glbs";
## executes docs/critique/photo-acceptance-20260806.md order list)
All four verdict orders landed in `buildChallenger2` (modern1.js):
1. **WHEEL EXPOSURE:** skirt bays lifted to the 0.58 hub line (panels
   0.58..1.145) with a SCALLOPED lower edge (inter-wheel tabs at 0.55,
   z 2.38/1.24/0.10/-1.04/-2.18); the 0.42..0.52 rubber fringe is GONE —
   6 Hydrogas wheels now read ~60-65% exposed like the print.
2. **BOW REBUILD:** the horizontal upper band no longer runs past the
   ring (z front 1.45 -> 0.90); §B1 glacis now rises PAST the ring plane
   to the verdict's 1.78 DRIVER CREST (plateau z 1.28..1.70) with a
   back-slope down to the 1.55 ring roof — the real CR2 bow hump; the
   lower bow is a REAL RAKE (0.40@3.72 -> 1.00@4.105, was near-vertical
   = the "cliff"); driver hatch + periscope moved onto the crest; splash
   V-strips re-raked (0.334). Track horns stay proud via the exposed
   idler + approach run (front skirt step retained — verdict-praised).
3. **LEDGE DELETE:** the full-length fender shelf (fenders() at y 1.135,
   x 1.02..1.76) is DELETED — the skirt top meets the band line
   directly; only the real front mudguards over the idler remain.
4. **TURRET FACE:** both cheek planes now carry the Dorchester rake ALL
   THE WAY to the roof line (top ring 0.92 -> 0.94 = the 2.49 crest);
   the GPS housing body is SUNK so nothing pokes above the raked plane
   (brow lid stays the 2.49 crest line); cheek UNDERSIDES rise toward
   the apex (0 -> 0.26 at the tip) clearing the new 1.78 hump — the
   real CR2 turret front floats over the crest.
Gate at the rework tree: 0 / 0 / 0 / 13.4 / 0 / 100, x2 identical — the
same print-stylization-capped class as the banked baseline (the
+28.8%-tall print keeps absolute-y curve rows unsatisfiable; §B8
verdicts here are adjudicated on REF|PROC pairs, not curve rows).
Geometry record hash 22c8127 is SUPERSEDED by this ordered rework (§B8
lane; new record hash at landing). Evidence: shots/critic-challenger2/
REF|PROC pairs at the rework tree (the verdict's decisive views are
left/frontleft/front). §B5 audit at the rework tree: stranded 0 /
abutting 1 / dangling 0 — the abutting flag is the CREST-region driver
hatch/periscope inside the coarse turret AABB (the real CR2's driver
station sits under the turret-front overhang; audit-artifact per the
adjudication tiers, equipment stays hull-side). Track-clip --exact
0/0 + 0/0; standard-check contig 0, census mg1+5d.
HONEST RESIDUAL for the acceptance critic: the wheels are now
geometrically exposed per order 1 (pair: the wheel run reads below the
0.58 skirt line) but they read DARK vs the print's pale Hydrogas rims —
a MATERIAL tone item (§C tone lane), not geometry; flagged as the
follow-up if the §B8 re-adjudication still reads "buried".
§C.1 winding at the rework tree: mode-1 "1 reversed / 34 px top
deficit" (flag tier) — the one reversed piece is in the reworked bow/
crest slab set; mode-2 HARD 2858 candidate px, top attribution
rig_hull/mesh#26 (1733 px) at ring height = the rear-deck kit
(bins/bags) which is REAL hull deck gear behind the bustle (correctly
static under yaw; §B5 stranded reads 0 — the DECK-AT-RING per-pixel
gate names hull-attributed content, not turret-borne mass).
ADJUDICATION: legitimate-deck-gear, no re-parent; the 34-px top-view
winding deficit is the standing next-round order (find + re-order the
one reversed slab).

## 2026-08-06 FLEET MUZZLE-BORE + §C.1 WINDING SWEEP (fleet-sweep one-liner)
- §B3.1 bore on the L30 tube (len 6.29); boot collar+seam mantlet verified; §C.1 0 reversed; F-vs-D 0 (owner-named line CLEAN); gate HELD x2 EXACT (broken row pre-existing - fresh-oracle re-baseline is the queued orchestrator item); hash not frozen; mantlet mass verified per MANTLETS-MANDATORY (db9168c). Mechanism: kit.js muzzleBore shadow-named furniture + orientedSlab guard (3fca39b / 1017339); end-on+quarter crops shots/muzzle-sweep/{before,after}/.
