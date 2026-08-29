# Leopard 2A4 (`leo2a4`) — BASE-21 photo-class packet

**Exact variant modeled:** Leopard 2A4, Bundeswehr, mid-production fit —
the pre-wedge mark: boxy welded turret with VERTICAL faces, EMES-15 hood
at the right cheek roof, PERI R17, loader MG3, 2x8 Wegmann smoke
mortars, full-width slatted bustle rack, flat-panel skirts with heavy
sculpted fore blocks, Rh 120 L/44.

## ORACLE STATE (superseded 2026-08-12)
The gameplay source remains `procedural` and fully first-party. A repaired
private GLB is registered only for the read-only QA/measurement harness. It is
not shipped, instantiated at runtime, converted into a playable payload or
used as source topology. The earlier false-zero/no-oracle notes below are
historical context; current certification uses the private oracle for
silhouette and station comparison while preserving authored geometry.

## Corroborated dimensions (photo-class targets)

| Measure | Value | Sources (2+ independent) |
|---|---|---|
| Hull length | 7.72 m | Wikipedia Leopard 2, army-guide |
| Overall length (gun fwd) | 9.67 m | Wikipedia Leopard 2 (L/44 marks), KMW heritage data |
| Width | 3.70 m | Wikipedia Leopard 2 (2A4 row), tanks-encyclopedia |
| Height (turret roof) | 2.48 m | Wikipedia Leopard 2, steelbeasts SBWiki |
| Gun | 120 mm Rh L/44, tube 5.28 m | Rheinmetall L/44 data, Wikipedia |
| Running gear | 7 dual road wheels, rear sprocket, raised idler+sprocket | photos, Wikipedia |

SPEC NOTE (residual, needs a modern2.ts true-up — outside this file's
ownership): TANK_SPECS.leo2a4.dims.overallLengthM is 9.97 (an L/55-class
carry-over). The real 2A4 with L/44 is 9.67; the BUILD carries the real
configuration (muzzle +5.82 over the −3.86 tail = 9.68).

## r1 REBUILD (2026-08-06) — owner directive: base-game customs are
## "wholly ancient"; leopard-lane starter round

Old build (modern2.ts buildLeo2A4): slab-pile hull, parallelogram track
run (§B6 fail), to-the-ground skirt curtain, hand-rolled pintle (census
0), clip 83/436 + shoe 51/14. The new build lives in
src/vehicles/profiles/leopard.js (LEOPARD_PROFILES.leo2a4 — the profile
map overrides MODERN2_BUILDERS because PROFILED_BUILDERS is assigned
last in tankFactory).

### Build inventory (photo class, current rulebook)
- HULL = family V3 rig (`leoHullV3` param delta; same physical hull as
  the a5): deck crease 1.665 -> flat 1.775 engine deck to the −3.78 wall
  (+ lip to −3.86 = published 7.72 with the +3.86 nose); two-slope
  glacis + beak wings (§B1 one raked surface each); §B4 lane opt-ins
  (glacisLaneCut x1.02@3.14, sponsonLaneLift −3.56..−2.82 @1.545 —
  re-derived for THIS deck, the a5 window left 156 shoe vox + 30 band);
  fenders to 2.92; heavy fore skirt blocks at ±1.85 EXACT (width guard
  3.70) + flat rear run at 1.80 + segmented rubber lower lip; fan wells
  (a5 r6 recipe); front mudguard assembly = post + over-track lip (z
  3.91..3.95, PAST the 3.905 idler shoe-orbit far edge) + rubber flap
  (top 0.98); rear mudflaps hung from the fender ends (the kit's
  knee-height plank + floating bracket class deleted); glacis
  spare-track links (FITTINGS, §I dressing); per-tank rubber tone
  0x33352b.
- GEAR: a5-class Leopard 2 geometry — 7 wheels r 0.37 @0.395, idler
  {3.48, 1.11, 0.25}, sprocket {−3.19, 1.09, 0.295}: §B6 trapezoid with
  BOTH ends raised.
- TURRET (pre-wedge boxy welded; §B1.1 both cheeks carry the same
  VERTICAL plan-raked face — vertical IS the real 2A4): mirrored cheek
  slabs (±0.40 slot -> ±1.20 shoulders, winding via the corner-swap
  law), plan-tapering core (±1.20 -> ±1.10 at the bustle), slot bay
  (back wall + brow + chin + dark cheek walls), ring plinth (§B2 slit
  closure, yaws with the mass), EMES-15 hood + lid + RECESSED
  aperture/glass (a proud first cut read as a floating billboard), PERI
  R17 stalk+head (top 2.79 = the spike budget), hatch rings + periscope
  ring, loader MG3 = FITTINGS.pintleMG mag/two-tone (§B3 census),
  crosswind mast, twin whips, 2x4 Wegmann banks per side on mount
  plates, segmented grab rails + lift eyes, full-width slatted bustle
  rack + strapped kit (stowage/jerry/tarp/ammo/spare links), cross
  decals ON the wall planes.
- GUN (§B3.1): trunnion roll + plate mantlet + yoke + collar + coax
  port (`leoMantletGun`), L/44 tube len 4.95 from trunnion world z 0.87
  -> muzzle +5.82 (real 9.67 overall), thermal sleeve segments + clamp
  rings, bore evacuator at 0.56, MRS collar. No prisms on the gun run.

### Close battery (2026-08-06, official rigs)
- track-clip --exact: front 0 / rear 0 band, shoe 0 / 0, blind spots 0
  (better than the frozen a5/a6, which carry standing §B4-queue shoe
  findings).
- tank-standard-check: clip ✓, contig 0 ✓ (a −3.72 deck first cut left
  a 6 cm enclosed slot to the tail lip — fixed by running the deck to
  the wall plane), decor mg1+1d ✓.
- turret-parent: stranded 0 / abutting 0 / dangling 0.
- §B5 yaw-90 pair: shots/leo-a4-r1/after2-yaw90 — the whole turret
  (box, EMES, PERI, MG fitting, whips, mast, smoke banks, rack + kit)
  yaws as one mass.
- npm test: 166 + track-geometry PASS.
- Geometry record hash (NOT a freeze — no graduation without a dual
  gate): 5dd00289 (41 meshes / 83624 verts).

### 14-view SELF-READS (photo class; builder reads, not critic verdicts;
### views = the critic rig exactly, shots/leo-a4-r1/after2)
front 8.6 / frontleft 8.7 / left 8.7 / rearleft 8.6 / rear 8.6 /
rearright 8.6 / right 8.7 / frontright 8.7 / top 8.8 / hero-fl 8.7 /
hero-rr 8.6 / hero-toptilt 8.8 / close-front 8.5 / close-roof 8.8.
Weakest named reads: close-front mantlet/trunnion zone reads slightly
bare vs the photo class (candidate: coax port tell + mantlet lifting
lugs); the slot bezel sits a touch deep-set; fan wells read as drawn
rings at grazing top angles (the known a5 r5 class, already on the
fanWell recipe).

### §H.4 distinctness (six built marks, strip:
### shots/leo-family-h4/six-marks-strip.png)
a4 = BOXY VERTICAL turret + EMES hood + flat skirts + L/44;
a5 = low wedge appliqué + sculpted skirt blocks;
a6 = wedge + LONG L/55 + pale-rim wheels;
a7v = 4.0-wide deep modular skirts + forward wedge + sensor farm +
L/55A1; revolution = faceted AMAP wedge + panel courses + SEOSS/RWS;
kf51 = Panther hull/turret + big RWS + coil dressing. Any pair
separable at a glance.

### Residuals / next-round candidates
- Spec overallLengthM 9.97 -> 9.67 true-up (modern2.ts, orchestrator
  lane; icons/garage cards read spec dims).
- close-front mantlet-zone dressing (coax collar tell, lug pair).
- p95 spike census: PERI 2.79 + MG cap ~2.70 + mast 2.74 + whips ~2.76
  + EMES 2.64 — five roof carriers above the 2.48 roof; all real
  fittings on the real vehicle, but if this id ever gains an oracle the
  whip tops may need the fold-down treatment (a6 precedent).
- NO ORACLE: §E re-source lane stays open for a clean-license 2A4 print
  (the bergman NC-SA stays quarantined).

### Law discoveries banked for the BASE-21 no-oracle lane (NEW flow)
1. PHOTO-CLASS FLOW: with no oracle, the working loop is
   tmp-leo-photoclass (proc-only renders on the critic's EXACT 14-view
   rig + yaw pose) + the §B machine battery + published-dims
   self-anchoring. The critic tool itself refuses no-GLB ids — the
   proc-only rig is the missing instrument, now in tools/.
2. LANE-EDGE COPLANARITY: §B4 lane opt-ins (glacisLaneCut/x0/x1/
   rearWallHW) must sit 0.03 INBOARD of the track inner face — exact
   coplanarity voxelizes as clip (378/184 on the a7v first cut; the
   family's 1.02-vs-1.05 values are the same rule).
3. SHOE-ORBIT ARITHMETIC: the player-visible shoe orbit = wheel r +
   trackTh/2 + 0.012 + 0.073 (≈ r + 0.175(idler) / +0.175(sprocket
   with its own r)); every bow/stern cover plate derives its z-plane
   from THIS radius, not the band radius (the a5's certified 0.88 flap
   top decodes as exactly 0.02 under the shoe arc, not the band arc).
4. DECK-TO-LIP CONTIGUITY: the deck polyline must END on the rear-wall
   plane — any gap to the lip overhang is an enclosed §B2 pocket over
   the sprocket bay (16 cells at ±1.25 on the first cut).

## ORACLE REFUSED (2026-08-06 base-21 wave — the §E re-source line stays OPEN)
The wave's dropped `leopard_2a4_otco.glb` ("Leopard 2A4 OTCO" by
Jeyhun1985, embedded CC-BY-4.0) was REFUSED and DELETED (28bf608):
- Live Sketchfab description reads verbatim "Leopard 2A4 OTCO from War
  Thunder." with tag `warthunder`; internal root node
  `Leopard_2_(OTCo).obj...` — a WT extraction (OTCo is the WT variant
  designation).
- ATTRIBUTION.md had ALREADY rejected this exact author+title on
  2026-07-27 ("identical face count to a known WT-extraction upload.
  Ripped game asset — forbidden. Deleted."). The re-drop verified only
  the embedded license — which is exactly what the new §E ORACLE
  PROVENANCE law (BUILD-STANDARD) now forbids trusting alone.
- THE ONE ABSOLUTE RULE refuses rips even as measurement-only oracles
  (the type_89 precedent, same day). No registration was ever written;
  the briefly-recorded false-0 ledger row was dropped.
leo2a4 remains a NO-ORACLE photo-class id; the visual critic stays its
bar. Clean-license candidates for a future drop: 42manako's catalog
(bradley/fv510/puma/t72b3m/challenger_3 all verified) has no 2A4 today;
the leo2a5/leo2_revolution recovered prints remain the nearest family
instruments (family-transfer measurement is NOT sanctioned — influence
only).

## 2026-08-06 FLEET MUZZLE-BORE + §C.1 WINDING SWEEP (fleet-sweep one-liner)
- §B3.1 bore via leoMantletGun (shared with a7v), tube face len-0.02; §C.1 8 reversed re-oriented (leoHullV3 glacis/bow); F-vs-D 131->0; gate no oracle row (render-verified; standard-check contig 0 after the checker law-alignment); hash not frozen; mantlet mass verified per MANTLETS-MANDATORY (db9168c). Mechanism: kit.js muzzleBore shadow-named furniture + orientedSlab guard (3fca39b / 1017339); end-on+quarter crops shots/muzzle-sweep/{before,after}/.

## 2026-08-07 §5.09/§5.16 ROUND (leopard builder) — TYPE90 FAMILY REBASE +
## HUGE FLW 200 RCWS
Owner orders executed: §5.09 "update the leopard 2a4 to match its
reference" + §5.09-5 "huge automated turret crows system" + §5.16 "the
2a4 is also similar to the type 90, so make all of them similar to each
other with the type 90 giving the most basis."

### §5.16 family rebase (type90 = read-only donor, misc.ts buildType90)
- TURRET SHELL re-laid as the donor's CLOSED-POLYGON construction
  (KIT.polyTurret, flare=inset=1 vertical walls) on the SAME certified
  §B8 footprint — flat center front ±0.40 @ z 1.10, swept cheeks to the
  ±1.20 shoulders, taper to the ±1.10 bustle; two stacked bands keep the
  real 2A4 rising bottom line (fore 1.695w / bustle 1.74w — the certified
  yaw-margin class). §B8 numbers unchanged by construction (face 0.785,
  turretMass 42%, VERTICAL faces = the named §5.16 variant tell).
- type90 grammar adds: hatch-zone plates (tops 2.50w), rack MESH BACK
  panel, RAKED-AFT whips (FITTINGS.antennaWhip, rx -0.72 — the donor's
  identity sweep; no oracle so the ~2.95w tips are legal), V SPLASH BOARD
  on the upper glacis (+rx flush per the sign law; the real Leopard 2
  carries it), cross-country Notek light (glacis left), stepped-deck
  course seams (thin tone lines ON the deck planes).
- Variant tells kept: EMES-15 hood, PERI R17, blocky plate mantlet
  (leoMantletGun), 2x8 Wegmann, full-width slatted rack, wavy skirts.
### §5.09-5 RCWS (leoFLW200 private helper — shared by the four
### non-graduate leopards only; §5.07 CROWS-FORWARD; §4.9999 connections)
Full FLW 200-class station at (0.05, 0.76, -1.12) s 1.15: base plate +
gussets -> powered slew ring/drum -> pedestal + slew plate -> cradle arms
+ trunnion cross-shaft -> ARMORED GUN TROUGH with flank SHIELDS + rear
plate; §B3-census pintleMG (m2, two-tone, ammo:false) FITTING-SUNK at
origin 0.90 (receiver ~2.74-2.92w, cap ~3.02w — no oracle, the station
rides the real ~0.6 m over the roof); sensor pod ON the aim face (day +
thermal glass recessed + LRF + wiper), ammo bin GUN-LEFT + bracket +
feed chute (M2 feeds left), IR pointer light, cable drop + flush roof
conduit. FORWARD rest, elev 0.03. No optic tower on this mark (the gun
itself rides high).
### Close battery (2026-08-07)
- FALSE-0 law: no gate on this id (photo class; visual bar).
- track-clip --exact / turret-parent / standard-check / winding --check:
  see the round report (shots/leo-509/) — all clean at close.
- npm test 166 + track-geometry PASS.
- Renders: shots/leo-509/final/leo2a4 (14 views) + leo2a4-yaw90 (§B5
  pair). Hash: 551cb30e -> 12db10a0 (64 meshes / 92978 verts — the
  family-rebase + RCWS move it by design; no graduation state).
- §H.4: the type90-family strip (type90/proto/a4) at
  shots/leo-509/evidence/family-strip-*.png — one family, three marks.

## 2026-08-08 §SRCFIX ROUND (leopard builder) — OWNER: "fix the leopard
## prototype and leopard 2a4, they dont match their source material at all"
FALSE-0/no-oracle id — the verdict is VISUAL (photo class). The owner
rejected the tank in the garage. Root reads from the before-evidence
(shots/leo-sourcefix/before/): the §5.16 type90 rebase had made the turret
a POINTED DART in plan (45° swept cheeks — wrong family grammar: the real
2A4 is a blunt brick), the EMES floated mid-roof, a huge RCWS + shields
dominated the roof, the skirt run read as a uniform plank fence with
ambient-black gear below, and the bow read a flat band over an open belly
tunnel. §5.16 family law is KEPT as proportions grammar (low flat roof
2.48, hull stance); borrowed type90 FITTINGS are gone.

### GAP TABLE (photo class = Bundeswehr mid-production 2A4)
| # | Photo read (real 2A4) | Baseline (was) | Fix (now) |
|---|---|---|---|
| 1 | turret plan = wide BLUNT BRICK: near-transverse front face ~2/3 width, short ~40° corner chamfers, parallel sides | pointed type90 sweep (face 0.80 m, 45° cheeks) | plan re-laid: face ±0.88 @ z 1.10, chamfers to ±1.20 @ 0.70; fore lower band + weld seams re-derived (§B1.1 symmetric, corner-swap winding) |
| 2 | EMES-15 doghouse AT the right front corner, aperture reading in the face | hood floated mid-roof (z 0.42..0.84), glass a billboard | hood z 0.64..1.06 (front 4 cm behind the cheek tips), aperture back + divider + twin RECESSED windows in the mouth |
| 3 | NO RCWS; roof = low cupolas + PERI R17 + loader MG3 | §5.09-5 FLW200 w/ shields (receiver 2.74-3.02w) | REMOVED (newer owner order supersedes §5.09-5 for this id; restoration = one commented call) |
| 4 | two thin near-vertical whips at the bustle corners | type90 raked-aft sweep (identity-foreign) | near-vertical (rx -0.20), same census fittings |
| 5 | clean glacis | type90 V splash board + a5-recipe deflector boards | both deleted; Notek + headlights + spare links kept |
| 6 | skirts: paneled, upper mounting band over recessed lower band, heavy fore blocks with the CHAMFERED leading edge; lower wheel arcs READ | one uniform segRun curtain at the hub line; garage counted zero wheels | BESPOKE skirts (helper opt-out): 3 fore armor blocks at ±1.85 EXACT (§D anchor) w/ chamfered leader, 6 aft panels = proud upper band (1.80) + 13 mm recessed lower band + joints; bottoms RAISED 0.38/0.44 -> 0.46/0.52 (calibrated against the owner-accepted a5 read; §B8.1 exposure 59%/67%, in the real 40-70%); hubs r 0.125, tire 0x2b2d24 |
| 7 | under-nose recedes to the belly | §B8 overlay above an OPEN under-tub tunnel (barn-door read) | §5.18-class closure: receding lower front plate + belly run at 0.555, inter-track ±1.00 |
| 8 | Wegmann 2x8, full-width slatted rack + kit, hatch rings, crosswind mast | present (certified) | kept; verified seated post-plan-change (rails/eyes/banks/decals on the new walls) |

### Close battery (2026-08-08, §SRCFIX round; HEAD fdf0320 live-tree)
- FALSE-0 law: no gate on this id (photo class; the §B battery + dims
  self-anchoring are the machine bar).
- §B8.1 anchors re-verified by construction: width 3.70 (fore blocks at
  ±1.85 EXACT), roof 2.48, muzzle +5.82 (real 9.67 overall over the -3.86
  tail), turretMass footprint extremes unchanged (±1.20 shoulders,
  z -1.75..1.10 = 42% of hull, <55% merge alarm).
- track-clip --exact 0/0 band 0/0 shoe; turret-parent 0/0/0;
  standard-check contig 0 ✓ decor mg1+3d ✓; winding m1 rev0/mix0
  deficit 0 + m2 clean; npm test 166 + track-geometry PASS.
- see-through sweep: worst 529px @ y0-side-l-T + 310 @ y0-top =
  rack-open-frame + certified 1.74-over-1.71 bustle margin classes
  (adjudicator hole-count 2; several graduates carry 6 — fleet-normal).
- Hash: 12db10a0 -> 327e81fe (turret/roof/glacis batch) -> b68e42c2 x2
  deterministic (62 meshes / 86174 verts — moves by design; no
  graduation state). Graduates byte-held through EVERY batch (x4
  sweeps): leo2a5 e215a738 / leo2a6 09912270 / kf51 9ac547ac /
  leo2_revolution db70c929.
- Evidence: shots/leo-sourcefix/{before,after}/a4* (14-view + yaw-90 §B5
  pair + 6-angle garage sets), crop-wheels + calib-a5 comparison strips.

### 14-view SELF-READS (§B8 builder estimates, NOT an acceptance bar —
### independent critic adjudication pending)
front 8.7 / frontleft 8.8 / left 8.7 / rearleft 8.6 / rear 8.5 /
rearright 8.6 / right 8.8 / frontright 8.7 / top 8.7 / hero-fl 8.8 /
hero-rr 8.6 / hero-toptilt 8.7 / close-front 8.6 / close-roof 8.7.
Weakest named: rear (rack kit reads dark-on-dark at native tone); left
(wheel arcs read but darker than the a5 class — the pipeline's albedo-
floored shade, §B8.1 mid-gray-flat class, distinct from the defect
class); under-nose band tones flat-equal to the glacis (geometry now
real; tone is the documented ambient-floor cap).

## 2026-08-06 §B8 PROPORTION REWORK (photo-acceptance orders; PROPORTIONS
## BEFORE DETAIL per §B8.1)
Orders (the archived visual-review receipt): 1 WHEEL EXPOSURE,
2 BOW cliff, 3 TURRET PRESENCE (+ rack/smoke profile detail).

### Order done-gates (official rigs; four-box = tmp-b8-measure)
1. WHEEL EXPOSURE: skirt bottoms 0.78/0.80 -> 0.38 fore blocks / 0.44
   aft run (rubber lip 0.39..0.44 kissing the 0.395 hub line) = the
   ordered "skirt bottom at hub line". §B8.1 exposure (skirtBot-wheelBot)
   /dia = 48% fore / 56% aft (real family 40-70%). Countability: the
   under-skirt zone rendered ambient-black (merkava r12 13.8L class) —
   gearFloor + tireHex 0x24261f opt-ins (leoGear passthrough added,
   undefined defaults, sibling hashes PROVEN below) + seven pale hub
   discs/side (revolution P-1 recipe, x ±1.486 inside the skirt plane,
   zero silhouette): seven hubs countable in view-left. Fore-block
   emphasis = the real stepped line (blocks 6 cm deeper than the run;
   proud-face relief is width-guard-forbidden at ±1.85).
2. BOW: nose interior fill's front face (tip-0.40) painted a full-width
   vertical wall between the tracks — H.noseFillZFront opt-in
   (byte-identical default, hash-proven) pulls it inside the beak
   underside's belt-foot band (3.36); the visible under-nose is now the
   real 48.5° receding plane, TONE-fixed (it rendered 69-82, BRIGHTER
   than the 58 glacis) by a hooked near-black overlay ON the plane
   ((0.62,3.48)->(1.05,3.86), rx -0.847 — the +rx first cut floated
   half-proud/half-sunk, empirically bisected). Lit vertical front is
   now the real 0.19 m nose band (1.05..1.24). Track horns + shallow
   glacis read ✓.
3. TURRET PRESENCE: cheek/mid walls 1.74 -> 1.695w (bustle slab keeps
   1.74 — the real 2A4 rising bottom line, yaw-honest); aft deck
   TRUE-UP 1.775 -> 1.70/1.71 one-plane (the old plane stood 8-11 cm
   over the real hull roof; rear wall/lip yTop follow). Face 2.48-1.695
   = 0.785 wall + band-to-EMES-lid 2.638-1.695 = 0.943 ~ the ordered
   0.95. Rest clearance 5 mm at the fore corners; yaw-sweep dip <=2.5 cm
   at the extreme corner arc = the same margin class the certified
   1.74-over-1.775 build carried.
   DETAIL (after gates): bustle rack mid rail + closed end frames +
   fore/aft end posts; Wegmann banks: heavier plate + support arm +
   muzzle collar rings per tube. §B3.1 gun run unchanged (leoMantletGun
   carries the fleet-sweep muzzle bore; no prisms).

### §B8.1 gate table (four-box before -> after)
- overall 9.660x3.703x2.806 (PERI 2.79 spike; roof 2.48) — unchanged,
  pub 9.67/3.70/2.48 ✓
- hull l 7.81 (body 7.72 + mudguard lip, the critique's noted +1.2%
  residual) — h 1.836 -> 1.771 (deck true-up) ✓
- turretMass 3.256 l = 42% of hull (<55% merge alarm) ✓ w 2.712 ✓
- gun bore y 2.00 ✓ muzzle +5.82 (9.68 overall) ✓
- gear: 7 duals pitch 0.84, raised idler 3.48/1.11 + sprocket -3.19/1.09
  (§B6 trapezoid) ✓
- wheel exposure 48/56% + countable ✓ (gate 1); glacis targets carried
  (gate 2); face 0.785/band 0.943 + boxy VERTICAL family line (gate 3).

### Evidence + battery (2026-08-06)
shots/leo-a4-b8/{before,after9-probe,final,final-yaw90} (14-view
photoclass + four-box measures.json per stage; the before set is the
b8-batch acceptance rig re-run). Battery: winding-audit m1 rev0/mix0
deficit 0 + m2 clean; track-clip --exact 0/0 band 0/0 shoe (skirt drop
x-clear by 6 cm); turret-parent 0/0/0; standard-check no-gate (FALSE-0
law) + clip ✓ contig 0 ✓ mg1+1d ✓; npm test 166 + track-geometry PASS.
HASHES: leo2a4 5dd00289 -> 551cb30e (58 meshes); graduates PROVEN
unmoved through both shared-helper opt-ins (leoGear passthrough +
noseFillZFront): leo2a5 e215a738 / leo2a6 09912270 / kf51 9ac547ac
(checked before AND after each helper edit); leo2_revolution bbae2c80
(this round's own candidate). Independent §B8 critic adjudication
PENDING (builder self-reads are not the bar).

## 2026-08-08 §5.73-3 RCWS RESTORE ROUND (leopard builder)
Owner ruling §5.73-3 (interactive session): RESTORE the automated turret
CROWS on leopard2_proto + leo2a4 — "§5.09 stands for ALL leopards"; the
owner OVERRIDES the §SRCFIX-0808 historical default (gap-table row 3's
REMOVED verdict is superseded by the newer order).

### What changed
- The §5.09-5 FLW 200 leoFLW200 call re-enabled VERBATIM at the
  certified seat (x 0.05, y 0.76, z -1.12, s 1.15, gunY 0.90, shields
  true, seed 13): base plate + gussets -> powered slew ring/drum ->
  pedestal + slew plate -> cradle arms + trunnion shaft -> armored gun
  trough with flank shields + rear plate; m2 pintleMG FITTING-SUNK at
  0.90 (receiver ~2.74-2.92w, cap ~3.02w — the real ~0.6 m ride over
  the 2.48 roof); sensor pod on the aim face, ammo bin gun-left, IR
  pointer, cable drop + conduit. §5.07 CROWS-FORWARD BY CONSTRUCTION
  (fitting barrel +z, no rotation) and verified in pixels.
- Clash-checked against the §5.55 blunt-brick turret: base z
  -1.41..-0.83 clears the hatch rings / front-corner EMES / PERI
  (z -0.32) / near-vertical whips (-1.60) / crosswind mast (-0.85,
  -1.50) / bustle rack (-2.12). Only lap: the base-plate corner tucks
  7 mm under the right hatch-zone plate top — the same stacked-plate
  lap the ratified §5.09 build carried. NO geometry re-seat needed.
- Ratified §5.55 reads verified surviving in pixels: blunt-brick plan,
  EMES-15 at the right front corner, 3+6 bespoke skirts with 7 wheel
  arcs countable, slatted bustle rack, Wegmann banks.

### §5.73-1 P95-ENVELOPE heightM DATUM NOTE (for the landing)
The RCWS is MANDATORY roof kit now; spec heightM 2.48 (modern2.ts —
OUTSIDE this file's ownership) is no longer the honest envelope.
Law-verbatim derivation (tmp-leorcws-p95: 1024-column side silhouette,
12%-of-rough band filter, p95 of body-column tops minus min bottom —
the gate bodyExtent law, CPU-exact): h 3.029 (p95Top 3.020, minBot
-0.008, 826 body cols; 261 cols above 2.48, 164 above 2.80 — the
station trough/shields 2.91-2.94w + receiver/cap band own the p95, not
a thin spike). RECOMMENDED DATUM: heightM 2.48 -> 3.03 at landing
(m26/m45 over-mounted-M2 + type99a 2.86 precedents). FALSE-0/no-oracle
id — no gate row moves; the spec edit is the orchestrator's landing
action. Probe cross-check on the gated proto agrees with its gate
verdict (see the proto packet).

### Close battery (2026-08-08, HEAD e898cdb)
- FALSE-0 law: no gate on this id (visual bar). npm test 166 +
  track-geometry PASS.
- Hash as first reported by the builder: b68e42c2 -> 8fb73bdd (62 -> 64
  meshes, 86174 -> 90926 verts). LANDING CORRECTION: the orchestrator's
  coupled P95 datum edit (heightM 2.48 -> 3.03) changes the spec-fed
  procedural scale, so the authoritative clean-HEAD hash is **41587e99**
  (64 / 90926), reproduced at acc0a48. The re-cert verdict below binds
  41587e99, not the pre-datum candidate. Guards
  byte-held through the round (hashed before AND after): leo2a5
  e215a738 / leo2a6 09912270 / kf51 9ac547ac / leo2_revolution
  db70c929 / leo2a7v 3ca4af86 / leo1a5 1c79188 — no shared-helper
  edits (leoFLW200 body untouched; per-tank call sites only).
- Evidence: shots/leo-rcws/{before,after}/leo2a4 (20 views: 9 orthos +
  3 heroes + 2 closes + 6 garage) + after yaw90 pair (§B5 unity — the
  station translates with the turret; gun stays with the aim frame).

### Independent re-cert verdict (2026-08-08; §5.73-3)
**PASS — floor 9.1 / mean 9.21 across the fresh 14-view sitting, at
clean-HEAD hash 41587e99.** Scores in canonical view order:
`9.2 / 9.3 / 9.1 / 9.1 / 9.1 / 9.1 / 9.2 / 9.3 / 9.2 / 9.3 /
9.1 / 9.2 / 9.2 / 9.3`.

- The restored FLW-200 reads as a complete automated station: powered
  slew drum and pedestal, armored trough, receiver, forward M2, gun-left
  ammunition bin, sensor/LRF pod, shields, cable drop, and roof conduit.
  Nothing reads as an unexplained box or unsupported floater.
- CROWS-FORWARD is unambiguous in both side crops; the yaw-90 plan/right/
  hero battery proves the entire station follows `rig_turret` while the
  gun stays in its aim frame.
- The §SRCFIX identity survives in every fresh view: blunt-brick 2A4
  turret, right-front EMES-15, 3+6 skirts, seven readable wheel arcs,
  Wegmann banks, and slatted bustle rack. The station is additive owner-
  ordered kit, not a return to the type90-dart silhouette.
- Evidence: `shots/critic-leo-rcws/leo2a4/` (35 fresh sheets) plus the
  unchanged-family garage controls. Full verdict:
  the archived visual-review receipt.

## 2026-08-12 FORWARD WELDED-LOFT / STRICT COURSE FINAL

Owner order: move the Leopard 2A4 turret forward, make it longer and better
shaped, restore supported decoration, and prohibit every track intersection.

- Primary turret: one connected ten-point authored loft, forward **0.10 m**,
  with extended nose, clipped shoulders and longer aft walls. No imported
  geometry or detached extension plate.
- Mantlet/EMES/gun: all re-seated on the new shell; exposed L/44 tube shortened
  by the matching offset so the muzzle envelope stays source-correct.
- Service grammar: extended grab rails, shallow roof weld, rear-shoulder
  latches and a rear-shifted full slatted basket with supported stowage.
- Hull/course: outboard sponson floor lifted over the full return; skirts moved
  outside the shoe lane and carried by a visible rail/hanger course; supported
  shoulder/mudguard caps close the remaining front plan pockets.
- Machine receipt: hash **`4011c71c`** twice, 66 meshes / 89,443 vertices;
  bands **0/0**, shoes **0/0**, strict sweep **0/0**, plan holes **0**, parent
  **0/0/0**, winding **0/0 with 0 px deficit**.
- Fidelity: **92.14** composite, **90.18** minimum whole view, gun **91.53**,
  tracks **96.03**. Fresh final evidence is 15 paired + 15 yaw0 + 15 yaw90,
  **45/45 distinct hashes**. Full verdict:
  the archived visual-review receipt.
