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
## executes the archived visual-review receipt order list)
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

## FINISH r3 (2026-08-06/07 punch list 3 — owner order "finish the
## challenger 2"; challenger lane, DELIVERED-PENDING-CRITIC per §B8)
Baseline (post c48bf50 datum 3.04, x2): hull 0 / whole 0 / turret 0 /
stations 13.4 / dims 62 / floaters 100.
**FINAL (x2 bit-identical): hull 0 / whole 0 / turret 0 / stations 19.8 /
dims 100 / floaters 100** — plus plan_hull 43.5 -> 66.3 and plan_whole
53.7 -> 55.8 inside the zeroed hull/whole components (the side/front
rows stay print-capped; evidence below).

### What moved (buildChallenger2 / modern1.js)
1. **dims 62 -> 100:** the p95 read was 2.87 (the VS580 head at 2.90
   across ~3 columns; whatsat census attributed the tall set: whip 3.216,
   GPMG 2.75, pano 2.89). The VS580 mast is RAISED to the published
   sensor line: pedestal column +0.26, drum at CTH+0.40, armored head
   cap top = 1.49 local = **3.04 published**, z-sized 0.36 so THREE side
   columns carry the p95 (grid-phase-safe); whips spike above within the
   <=4-column budget aligned with the print's own 3.86/4.0 spikes.
   heightM reads 3.01 (0.85%, grace) -> dims 100 with hullLengthM 8.37
   (+0.44%) / overall 11.46 / width 3.51 all in grace.
2. **plan_hull +22.8:** the print's FULL-WIDTH skirt faces span only
   z -1.23..3.13 (gate frame) — the rear two bays + their handles/seams
   RECESS 25 mm off the anchor face (the §D width anchor stays on the
   front bays + stepped panel at 1.76 EXACT); the front panel is
   shortened to the print's 3.13 line (raked lead edge 2.98 -> 3.12);
   the mudguards pull to 1.735; the -2.18 scallop tab tucks with the
   rear bays; tabs pull to 1.7525 max (AA-sliver law).
3. **stations 13.4 -> 19.8:** the pano raise lifts the turret-zone
   station tops (st8 12.2 -> 5.2 topPct). REGISTRATION-ANCHOR LAW
   (measured mid-round): tucking the rear grille/louvre faces off
   -4.145/-4.16 dropped the rear BODY column -> hullLengthM 8.37 -> 8.22
   and dAlong 1.368 -> 1.443, re-phasing stations to 0. REVERTED
   exactly; the rear plate kit is the length anchor — never tuck it.
4. **§C.1 winding:** the standing r2 "1 reversed / 34 px top deficit"
   is CLOSED — winding-audit pinned it to the crest back-slope slab
   (modern1.js:756, signed vol -0.081, inside-out): its rings carried
   the inverted y-order vs the glacis slab convention; re-ordered.
5. **§B8.1 native-tone wheels:** tireHex '#565c50' — the acceptance
   verdict's "wheels buried/dark" residual; 6 Hydrogas wheels now read
   through the scallops at native tone.

### §E PRINT-CAP EVIDENCE (why side/front/turret rows honestly stay 0)
The buh print is a +28.8%-tall stylization with a MATERIAL-based node
split (packet ORACLE STATE): measured bodyHeightM 3.208 vs the real
2.49 roof / 3.04 sensor datum; hull -1.7% / overall -4.3%.
- side rows: 249 print side columns read >2.8 m tall (z -3.32..0.85 —
  its hull-partition shell carries a 3.14-3.21 superstructure over ~12
  mid-hull columns where the real CR2 deck is 1.55): side_hull mean
  11.38% at dy 0.432 — matching it means building a 3.2-tall hull.
- front rows: the same tall shell reads 3.13-3.19 across x 0.57..1.11
  (front_whole/hull mean ~9% at dy 0.51 — the print floats 0.5 high).
- turret rows: the turret node carries full-length fittings (z -4.56..
  +6.60, 3225 interpen verts, worst turret_plan err 2.58 m at z -1.51)
  — the turret masks are structurally polluted.
- stations: print whole-model station tops (extract table) run 2.38-3.98
  across st2-st10 vs the real 1.55 deck / 2.49 roof — trimmed topPct
  mean ~7.6% is the stylization floor; ceiling ≈ 20-25 with everything
  else perfect. Recommendation for the orchestrator: the filed §E
  height-normalize batch (leo2a5 band-flatten precedent) is the only
  honest route to non-zero side/front rows; alternatively a
  turretFollowers-style hull-partition split if the node census can
  separate the 3.2-tall shell from the true hull.

### Round-close battery (final tree)
track-clip --exact 0/0 + 0/0; turret-parent stranded 0 / abutting 1
(the KNOWN crest driver-station audit-artifact, adjudicated r2) /
dangling 0; winding-audit mode-1 0 reversed 0 deficit (post-fix),
mode-2 HARD flag = the rear-deck kit behind the bustle (legitimate-
deck-gear adjudication banked in r2 — correctly static under yaw;
coincidencePx-dominated); standard-check contig 0, census mg1+5d;
hashgeo x2 identical (see report). §B8 pairs re-rendered:
shots/critic-challenger2/. DELIVERED-PENDING-CRITIC.

### FINAL GATE LINE (x2 bit-identical, FINISH r3 tree)
hull 0 / whole 0 / turret 0 / stations 19.8 / dims 100 / floaters 100
(plan_hull 66.3 / plan_whole 55.8 inside the components). tmp-hashgeo
x2: **b4e51df8** (54 meshes / 69637 verts) — record hash, NOT a
freeze. Round-close: track-clip --exact 0/0 + 0/0; turret-parent
stranded 0 / abutting 1 (the banked crest audit-artifact) / dangling
0; winding-audit mode-1 rev 0 (the r2 standing reversed crest slab
CLOSED), mode-2 HARD = the banked rear-deck-kit legitimate-deck-gear
adjudication (coincidencePx-dominated, correctly static); standard-
check contig 0 census mg1+5d; npm test 166 + track-geometry PASS.

## batch-48 HEIGHT-NORMALIZE EXECUTED (2026-08-07, orchestrator §E)

The filed +28.8% stature stylization is closed: band-flatten per the
leo2a5/t72bu class — identity through the gear band (-0.993..0.24,
wheels stay round; the gear was already near-real proportion), body
band 0.24..2.295 -> 0.24..1.60 (roof lands 2.59 above ground = pub
2.49 +4% grace, factor 0.662), antenna 3.05 -> 2.06 (the published
3.04 sight line). Byte-idempotent x2 md5 3c6a15dc. Gate x2: stations
19.8 -> 25.5, dims 100 held; the REF pane now renders REAL CR2
proportions (future §B8 pairs stop reading stretched).

CURVE ROWS STAY 0 — ROOT CAUSE NOW ISOLATED: the side registration
walks dAlong 1.368 (side_hull/side_whole reg), i.e. the print
registers 1.37 m off along the hull because the material-split turret
node carries FULL-LENGTH fittings (z -4.56..+6.60) that pollute the
anchor mid. This is the packet's documented split disease, now the
SOLE curve blocker (mean errs 10-13% are pure shift). FILED:
batch-48b hull-partition split (batch-43 _index_surgery class — move
the turret node's full-length fittings to the hull side, or window
the anchor off them), THEN the curve rows can measure. plan_hull 66.3
(dAlong 0 in plan) corroborates: where registration is clean the
print now scores.

## batch-48b/48c ATTEMPTS — BOTH NEGATIVE, REVERTED (2026-08-07)

(b) STERN-BINS RE-PARENT (uint32 _index_surgery, 2 components / 1,188
verts / 2,176 tris to the hull node): dAlong stayed BYTE-IDENTICAL at
1.368 — the side-registration anchor reads the WHOLE silhouette, not
the node partition. Mechanism disproven for the walk (the partition
itself is mask-neutral).
(c) LENGTH PARITY (+0.43 hull-centering shift + tube stretch 6.597 ->
7.335): dAlong WORSENED 1.368 -> 1.532 and plan_hull fell 66.3 ->
60.1. Direction disproven — the anchor is not a whole-mask mid delta
either.
CONCLUSION: the dAlong mechanism ("dims anchors symmetric about the
ref's own 12%-band mid, at the ref's own band heights") must be
analyzed at SOURCE level (the fidelity page's registration code) in a
dedicated round before any further ch2 oracle surgery. The batch-48
warp-only chain stands (md5 3c6a15dc verified restored); the uint32
surgery extension is KEPT in the helper (byte-proven on t90sm).

## UK ROUND r4 — CH1-BASE PORT (2026-08-07, uk round builder; owner order
## "challenger 2 and 3 using the actual models we have now using the base
## of the challenger 1"; DELIVERED-PENDING-CRITIC per §B8)
Baseline (batch-48 tree, x2): 0 | hull 0 / whole 0 / turret 0 / stations
25.5 / dims 100 / floaters 100 — plan_hull 66.3 / plan_whole 55.8 inside
the zeroed components; the §5.06 dAlong 1.368 side-registration walk
stands (harness mechanism under source-level investigation — side/front
rows stay walk-capped regardless of build; photo class governs there).

### The CH1-BASE PORT (what came over from challenger1Build, uk.js —
### PORTED not imported: uk.js is single-owner + hash-guarded dbe33204)
- ch1BaseToneKit (modern1.js — the ch1 r8/r9 family recipes): pale-olive
  Hydrogas DISC faces vs DARK-drawn tire rings (the r8 WHEEL-RING
  GRAMMAR; the builders' 0x565c50 tireHex clone re-keyed to the ring
  tone), warm-olive pads/chain, muted band multipliers, smoked dark-olive
  glass (blue-chip kill), dark-olive fittings hue, canvas retone.
  Per-instance material work only — masks byte-identical (§C).
- ch1BaseGearBackers (the r9 O1b/O2 lane): render-only /shadow/-named
  catch plates — an x-thin inter-wheel shadow wall (x 0.99..1.006, 30 mm
  inside the 1.035 band inner face) + five per-bay plates at the scallop
  stations. Gate/evaluator/critic masks exclude them by name.
- ch1 r10b SMOKE TUBE TIPS + BORES (smokeTubeTips, exact cluster
  transform math): both 2x5 banks read circular mouths at 1x.
- ch1 r10 O5a RAIL-OVER-MESH basketry: dark mesh panels seated 2 mm into
  the bustle bin rear face + pale rail pairs/posts over them.
- ch1 r10b/r11 ROOF GRAMMAR: loader-hatch periscope blocks + lid seam
  disc, MG-station ammo cluster (cans + belt tray inside the cupola-line
  envelope), flush roof seam strips; deck panel seams + filler caps.
- ch1 r10 O5b STERN KIT (CR2 fit): draped tow cable + cleats across the
  upper rear face, outlet boxes + pipe stubs — everything z >= -4.145
  (the rear plate kit is the hullLengthM/dAlong anchor, never extended).
- CROWS-FORWARD spirit (§5.07): loader GPMG rest yaw 0.55 -> 0.12.

### Measured edits (workorder-authored)
- SHOE-ENVELOPE IN-WINDOW fix: xc 1.34/trackW 0.65 put the shoe outer
  face at 1.75 — 2 mm inside the plan ±1.82 column window (1.748..): the
  wrap shoes painted those columns to z -3.3 where the batch-48 ref's
  skirt content ends -2.43 (worst plan_hull columns, err ~1.03 x2).
  xc 1.325 / trackW 0.58 -> shoe outer 1.70 (48 mm clear; the 1.688
  front window keeps its matched ground read; belly lane 0.05 held §B4).
- WHIPS to the batch-48 ref's ONE antenna column (x -0.886, top 2.94):
  a1 re-seated + trimmed h 0.44 (tip ~2.98); a2 kept as the real CR2
  second whip (variant truth), shortened h 0.36 under the sensor band —
  its ref column carries no antenna (honest ~0.5 residual, one column).

### CERTIFIED RESIDUAL (new, batch-48 artifact class)
The batch-48 knee took the REF's own pano/sensor masts BELOW the
published 3.04 sensor line (ref front tops x 0.42..0.62 now read
2.32..2.52) while our VS580 head carries the published 3.04 datum that
dims sovereignty REQUIRES (dims 100 holds only at the real sensor
line). The ~4 front columns x 0.42..0.62 reading +0.5 over the kneed
ref are a REF-ARTIFACT residual, not a build defect — never lower the
mast to a print artifact (dims outranks; the §5.06 registration-source
round owns the harness side).

### FINAL GATE LINE (x2 bit-identical, uk round r4 tree)
hull 0 / whole 0 / turret 0 / stations 25.5 / dims 100 / floaters 100 —
HELD EXACT vs the batch-48 baseline through the whole port (the
walk-capped side/front rows stay 0 per §5.06; stations/dims/floaters
unmoved). tmp-hashgeo: **25af6210** (66 meshes / 74,893 verts) — record
hash, NOT a freeze. Round-close battery: track-clip --exact 0/0 + 0/0;
turret-parent stranded 0 / abutting 1 (the banked crest driver-station
audit-artifact) / dangling 0; winding-audit mode-2 HARD =
rig_hull/mesh#38 1733 px — the EXACT banked rear-deck-kit signature
(legitimate-deck-gear, correctly static under yaw; r2/r3 adjudication
stands, mesh index moved with the round's added meshes); standard-check
contig 0 / census mg1+5d; npm test 166 + track-geometry PASS. Evidence:
shots/critic-challenger2/ (fresh pairs at the final tree). Guarded
hashes at close: challenger1 dbe33204 / chieftain5 d4f2a9a6 /
chieftain_mk10 59551064 — byte-identical. DELIVERED-PENDING-CRITIC.

## LECLERC-METHOD COMPLETE REDESIGN + GRADUATION (2026-08-09)

This rebuild supersedes every FINISH/CH1-base candidate above. The repaired
oracle was inventoried by connected components, exact longitudinal side
profiles, plan stations and direct articulated trees before construction.
The final procedural uses exact center/shoulder side strips, joined V-section
bow and stern lofts, stepped plan bands, a three-band closed turret shell with
separate lower/upper brow and true cassette undercuts, six 0.403 m Hydrogas
wheel faces at source spacing, nested dishes/hubs, and exact track runs. The
roof follows the actual single flattened loader lid plus thin right plate;
the L30 stack carries its boot, sleeve and extractor; the rear keeps its open
basket, recessed shoulder/service structure and recovery beam. Guarded bow
lights/tools and the full remote-station hierarchy preserve the source's
asymmetry and readable equipment rather than averaging it into boxes.

The final source-specific station receiver and folded transverse L7A2/MAG
tube are grouped as one `FITTINGS.markExact(..., 'pintleMG')` assembly. This
is real visible geometry with the standard marker/AABB contract, not a census
escape. A generic upright MAG was built and measured at gate 89.5, so it was
rejected in favor of the already-certified source exterior. Two 4x4 plan
holes at the rear shoulder were closed by the narrow measured x=±1.12
hardpoint; a broad fill also measured 89.5 and was rejected because it erased
the surrounding recess. Earlier broad terminal housings (88.2) and proud
12 mm cassette growth (88.6) remain rejected.

### Graduation receipts

- geometry gate x2 bit-identical: **90.1** |
  hull 90.1 / whole 90.3 / turret 90.3 / stations 91.1 / dims 93.8 /
  floaters 100; fleet row 28/96;
- freeze x2: **63ee160** (42 meshes / 250,769 vertices);
- direct-tree fidelity **91.3**, minimum whole view **93.31**;
- exact track clip band 0/0, shoes 0/0; standard contiguity 0, MG 1+1d;
- winding mode 1 clean (0 reversed / 0 mixed; 70 px / 0.12% worst deficit);
- fresh independent §B8: **14/14 PASS**, floor **9.0**, mean **9.03**,
  captured 2026-08-09 13:30:34 PDT with zero console/browser errors;
- npm test green.

The turret-parent 38% hit is a merged `hullDetail` AABB artifact: connected
components prove the sole above-ring member is the 11 x 2.8 x 10.2 cm fixed
driver periscope slit. The winding mode-2 `rig_hull/mesh#19` candidate is the
measured fixed hull profiles, shoulder slabs and driver hood, all correctly
static under turret yaw. Both are explicitly adjudicated false positives;
neither justifies re-parenting real hull structure.

Oracle SHA-256:
`d2e22673103353436517c1d17be38531b530b8936538f921d996a26fcfab5f3f`;
pristine `.bak`:
`1be3ef855ac9c441e38262a4ae26600d14c763c70c867024554499a451f9ad48`.
Verdict: the archived visual-review receipt.

## OWNER FUSED-BLOCK REPAIR + RE-CERTIFICATION (2026-08-10)

The owner's garage screenshot exposed a failure hidden by the prior source
partition: a broad turret/casemate course was still owned by the fixed hull,
overlapping the articulated turret and remaining behind at yaw. The corrected
oracle repair classifies ring-crossing connected components out of the raw
material-fused primitive and moves 572 components / 12,313 vertices / 14,546
triangles into `TurretParts`. The procedural hull now follows the true 1.55 m
deck/ring trace instead of the contaminated 2.07 m course. A 35 mm ring landing
is the sole fixed load surface beneath the rotating turret.

The centre bow strip and V-section loft also had two enclosed eight-centimetre
seams over the idler station. A narrow measured-profile bridge closes them
inside the existing glacis silhouette: standard contiguity 26 -> 0, with no
change to the external plan or exact 0/0 track clip.

### Frozen receipts

- geometry gate x2: **90.1** minimum; hull 90.5 / whole 90.1 / turret 90.3 /
  stations 91.8 / dims 93.1 / floaters 100;
- standard: track 0/0, contiguity 0, MG 1+1d;
- turret parent: 0 stranded / 0 abutting / 0 dangling;
- winding: 0 reversed / 0 mixed, 80 px / 0.14% worst FrontSide deficit,
  0 yaw-stranded candidates;
- freeze x2: **3b4bd5f0** (42 meshes / 250,157 vertices);
- fresh independent §B8: floor **9.0**, mean **9.06**, 14/14 pass;
  yaw/load paths **9.3**;
- `npm test` green.

The critic specifically confirms one rotating turret footprint, no fixed
duplicate shell, no empty-air seam, and continuously seated RWS, optics,
hatches, smoke furniture and gun package. The narrow bow bridge is visually
subordinate and creates no silhouette or track regression. Repaired oracle
SHA-256: `f44e3b46ee07a457b04fff6cdf8950f880a45fd22d952226e2ef16a4bd3c49ba`;
pristine `.bak`:
`1be3ef855ac9c441e38262a4ae26600d14c763c70c867024554499a451f9ad48`.
Verdict: the archived visual-review receipt.
