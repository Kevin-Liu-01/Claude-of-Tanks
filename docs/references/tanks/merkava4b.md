# Merkava Mk.4B (`merkava4b`) — reference packet

Exact variant: Merkava Mk.4 early/B fit WITHOUT Trophy APS — same flat-roofed
wedge turret, angled gun-mount cheek, no loader's hatch, rear basket + chain
curtain, roof MG at the commander's station, twin smoke clusters; front
engine, 6 road wheels, FRONT sprocket, deep skirts with scalloped lower edge.

## Corroborated real dimensions
- Hull length 7.60 m; overall gun-forward 9.04 m; width 3.72 m; height 2.66 m
  to turret roof; ~65 t.
  Sources: https://en.wikipedia.org/wiki/Merkava ,
  http://www.army-guide.com/eng/product1602.html ,
  https://www.army-technology.com/projects/merkava4/
- Gun: MG253 120 mm L/44, tube ≈ 5.3 m, thermal sleeve + evacuator, overhang
  past the nose ≈ 1.3 m.
- Reference links: https://commons.wikimedia.org/wiki/Category:Merkava_Mark_IV ,
  https://www.primeportal.net/tanks/dmitry_derevyankin/merkava_4m/

## Local GLB oracle (public/models/tanks/community/recovered/merkava4b.glb)
Width-normalized ×1.313 (artist modeled narrow → oracle is proportionally
TALL: h/w ≈ 0.83 vs 0.72 real). Scoring targets ARE these oracle numbers:
- Whole z −4.29..+4.29; hull nose +3.50 (toe y ≈ 1.0), tail −4.20.
- Deck y ≈ 1.74–1.79; upper glacis (3.44, 1.2) → (1.1, 1.79); lower glacis
  (3.5, 1.0) → (2.0, 0.05); skirt bottom 0.43–0.48 with 6 wheel scallops;
  belly ≈ 0.5; rear slope (−3.6, 1.7) → (−4.16, 1.35); rear rack/basket band
  y 1.95–2.6 from z −2.4 back to −3.9.
- Turret: mantlet/cheek tip reaches z ≈ 2.4–2.6 at y 1.93..2.23; roof plateau
  y 2.82 over z −0.2..−1.35 (pano head 2.96–3.08); rear roof 2.73 to −1.9;
  basket top ≈ 2.5–2.6 to z −3.9, chains below; turret plan ≈ ±1.5, hull plan
  ±1.84–1.86.
- Gun: axis y 2.06, tip z +4.29, sleeved r ≈ 0.08. Ref hull mask carries a
  small fragment out to z ≈ 3.75, so the scored ref gun sliver is roughly
  z 3.79..4.29 at y ≈ 2.0.
- Tall whip antennas (to y 4.54) sit in the turret mask; thin, low IoU cost.

## Mismatch log (before → after per fidelity iteration)

| Iter | total | minView | hull | turret | gun | tracks | change |
|---|---|---|---|---|---|---|---|
| 0 (base:'merkava4' donor + kit) | 67.0 | 72.9 | 82 | 29 | 51 | 88 | baseline |
| 1 (bespoke rebuild via shared buildMerkavaMark) | 77.5 | — | 84 | 39 | 69 | 87 | no more base:'merkava4' donor |
| 2 (LOD0 buckets + rotor + gun radius/tip + rear extents) | 78.7 | 85.1 | 82 | 51 | 86 | 86 | turret comp capped by follower skirt capture + tall-oracle proportions |
| 3 (shaded-parity r2: dark basket frame + chains, dark loader/coax MGs + smoke tubes, detail-tone cheeks, dished wheels, deck/glacis/tail furniture, skirt bolts + hems, front fender boards) | 78.7 | — | 82 | 51 | 86 | 86 | material/furniture pass — silhouette pinned |

Remaining gaps: oracle is 1.313x width-normalized (proportionally very tall);
its turret node also captured a front skirt section (MERKAVA_TURRET_FOLLOWERS
`ex_armor_(?!body)` in userdrops5.js), which the procedural turret cannot
mirror without swinging hull armor on turret yaw.
| 4 (r3 turret reconstruction: as merkava4 (shared modular rebuild — beak per the oracle low cheek tip y 1.93..2.23), paneled flanks (the r2-flagged missing kit), plateau/bustle/basket re-seated to the measured bands (basket -2.4..-3.9 top 2.56), rearTip bar DELETED (the r2 deck-skimming rail) — chains hang from the basket rim; smoke rosette on the cheek plane; hwMax 1.50 per plan ±1.5) | 79.3 | — | 82 | 53 | 86 | 86 | +0.6 total vs r2; clean-ref turret comp gains capped by the tall-oracle proportions |
| 5 (r5 FROM-SCRATCH curve rebuild: hull lofted from docs/references/profiles/merkava4b.json (deck 1.76, glacis (3.53,1.12)→(2.85,1.44)→(1.10,1.76), keel to (2.15,0.03), body ±1.66 with skirts ±1.835 over 2.48..−1.95, fender horns to 3.35); turret re-authored on the measured lines — beak tip (2.60, band 1.93..2.24) rising to the CREST (0.60,2.79), saddle 2.53 at 0.2..0.45, plateau 2.82 from −0.05 (r4 roofFront sat at −0.20), pano band to 3.08 with mast stubs, basket −2.36..−4.00 top 2.55, whips at −2.2/−2.5/−3.35; tail rack lowered to [1.42..1.94] (the 2.42 band erased our own basket — subtraction lesson), right-side frame kept to −4.24 | 79.5 | 85.3 | 83 | 55 | 84 | 86 | +0.2 over r4 79.3; T 53 → 55, H 82 → 83 |

## r5 notes (curve rebuild — shaded-pair verdicts, one per view)
- front: beak + crest + saddle + wide plateau match the tall oracle's massing.
- side L/R: the crest-forward roof line (2.79@0.6 → 2.82 plateau) replaces the
  r4 flat roof that started 0.9 too far back; ref keeps its captured front
  skirt section in the turret node.
- rear: long basket band to −4.0 with the whip trio aligns; ref's rack band
  sits slightly higher than my lowered frame.
- quarters: same vehicle; my paneled flanks are flatter than the print's.
- top: near-identical (96.5).
- CURVE FINDINGS vs r4: the roof CRESTS at z 0.5–0.75 (2.79) with a saddle
  behind it — the plateau begins at −0.05, not −0.20; the basket runs to
  −4.02 (r4 stopped at −3.88); the hull's 2.42 rear band belongs to the
  oracle's hull but erases our own turret mask if copied at height.

### Certified caps + standing (2026-07-31, geometry gate v8)
Standing: hull 24.6 / whole 17.5 / turret 0 / stations 63.8 / dims 93.7 /
floaters 100.
- hullCurves CAP: the print's turret casting is fused to its HULL node (hull
  mask tops 2.57-3.02 across z +2.0..-3.0) and mantlet fragments sit in the
  hull out to z 3.5. The deck pack reproduces part of the band; full parity
  would require a fixed (non-articulated) casting — program violation.
- turretCurves CAP: complementary defect — its rig_turret holds only sparse
  furniture (pano head, whips, basket sliver), so a complete turret can not
  match it. Needs an oracle re-rig (cf. 6fa0335).
- stations partial cap: the print is ~1.31x TALL (its plateau rides 2.80-3.14
  vs published 2.66); dims anchors the build at 2.66 so 4-5 mid slices carry
  a structural 7-9% roof-height delta (2 absorbed by the trimmed mean).
- wholeCurves gun cap: oracle MG253 muzzle +4.30 vs published-true +4.80.

### Round-2 mimic purge + cap re-certification (2026-07-31, gate v10)
Removed: ringFloor (repaired turret mask bottoms 1.53-1.79 at the carved
ring); deckPack (the "casting fused to a hull node" band was 18 stranded
fittings, ALL absorbed onto rig_turret in 86d1071 — the repaired hull
mask is a bare 1.76 deck, so the old hullCurves cap is REVOKED, not
excused); the 2.44 tall tailRack wall (measured low band [0.6..1.69]
with a thin high rail to -4.2); short skirts (ref skirt band is TALL
[0.80..1.78] at the corner columns and runs 2.50..-3.30).
Re-lined: FIVE whips on the measured columns (trio at z -3.22, x -1.00/
-0.20/+0.98 tops 4.53; flankers x -1.56/z -2.41 and x +1.62/z -2.21 tops
~4.31); basket to -3.90 (bot 1.96); wider turret shell (hwMax 1.60).
- RE-CERTIFIED STATURE CAP (the one TRUE 4B cap): the 1.313x
  width-normalized print rides its roof plateau at 2.99-3.12 and the
  cupola/pano band to 3.1+ vs published height 2.66; heightM (p95 of
  tops) pins the whole build roof at 2.655-2.665, leaving a structural
  0.25-0.45 m top delta across the ~50-column turret span:
  turretCurves ceiling ~60-75, wholeCurves ceiling ~75-80, stations
  ceiling ~80 (4-5 mid slices carry 7.5-9.6% roof deltas, 2 absorbed by
  the trimmed mean). hullCurves is NOT excused by this cap.
- RE-CERTIFIED short-gun cap: oracle MG253 tip +4.30..4.39 vs published
  +4.80 (wholeCurves coverage only).
Standing (gate v10): hull 59.9 / whole 39.9 / turret 26 / stations 70 /
dims 99.9 / floaters 100 (was 0/0/0/63.8/99.8/100 at v10 start).

### Round-3 (2026-07-31): registration nulled; stature ceilings RE-DERIVED
Side dAlong nulled (nose to the print's 3.24 toe + wings rails -4.17):
side_whole 39.7 -> 63.8, side_hull 79.8. dims 100 (bow post 3.43 + tail
pins -4.24 carry the published lengths). RE-DERIVED CEILINGS under v10
pixel metrology (supersede the r2 "turret 60-75 / whole 75-80 / stations
~80" bands, which predate hull-anchored dy and pixel dims): the 1.313x
print rides its plateau 2.99-3.12 and hull skirts high; front_whole is
the binder — the capped 2.655 roof loses ~0.35 x 20+ columns = mean +3%
(ceiling ~45-50); front_hull ~60 (its hull rides the stature too, dy
absorbs only the mean); stations tops 3-9% capped residuals (~60).
Standing: min 26 -> 42.7 (hull 59.9 / whole 42.7 / turret 51.0 /
stations 58.7 / dims 100 / floaters 100) — at/near the re-derived
ceilings everywhere except turret plan (~5 pts of honest wedge work
left, r3 anatomy params are mechanical scales).

## SLOPE-MASS + NO-MYSTERY-BOXES round (2026-08-05, merkava family agent)
Owner directives §B1 c1ad424 + §B3 ff50bf5. Baseline this round:
min 34.6 (hull 60.6 / whole 34.6 / turret 51 / stations 58.7 / dims 100).

### §B1 findings (before)
- Same slab-turret class as merkava4: vertical shell walls to 2.58 with the
  small 0.06-rake cheek appliqué; crest a flat 2.60-2.665 cap wall; side
  panels + wedge head reading as a leaning DOOR + crates (§B3).

### Re-mass (landed) — owner-law-over-oracle, M1-slope precedent
- cheekRake 0.45 elevation rake on the CERTIFIED r5 plan pts (the pts
  polyline is near-straight: per-strip twist measured (C-A)*n ~ -0.021r,
  no tooth row) + wedgeFront V-fillets (wedgeRake 0.40); crest re-lined as
  the rising ridge top0 2.30 (zW 1.50) -> top1 2.655 @ z1 0.60 under the
  certified stature cap; nose/shell/roofInset kept at the r5-certified
  envelope (bisect: dropping the shell top / retreating the nose cost
  ~-1.0 whole against the 1.313x-tall print for zero law gain — the rake
  read carries on the front planes).
- §B3: side-panel bin grammar (lid seam + latch pair + handle + spare
  periscope block on the wedge head), panel stud rows + course seams.
- §B4 (r12 recipe): keel.hwClamp 1.13 — clip 6/78 -> 0/6 exact-voxel PASS
  (<= 60 band, 0-target residual 6 rear).

### Bisect record (measured, official gate)
- extended arrowhead pts: turret_plan 51 -> 25.5 vs the SPARSE rig_turret
  print (certified defect: turret node holds only furniture) — REVERTED,
  plan stays on the measured lines; elevation carries the law.
- chin (hw 0.95): turret 33.8 vs 52.3 without — its top face crossed the
  raked cheeks (intersection seam) AND dragged side bottoms 0.4 under the
  sparse print's high mask floor — REMOVED (the r5 nose face still backs
  the notch: no §B2 void; verified holes 0).
- crest ridge: stations 58.7 -> 61.8 (+3.1) at zero turret cost — KEPT.

### Done-gates (official rigs)
- geometry-gate x2: min 34.1 BOTH runs — hull 60.6 / whole 34.1 / turret
  52.3 / stations 61.8 / dims 100 / floaters 100.
- vs baseline: turret +1.3, stations +3.1, whole -0.5 (front_whole: the
  raked cheeks vacate part of the tall print's solid 2.5-3.0 front band —
  the certified owner-law residual, "build the real rake, measure the
  delta"), hull/dims/floaters unchanged. Track clip PASS; parent audit 0/0.

### Honest residuals
- front_whole -0.5 rake residual (above); whole 34.1 remains the binder at
  its documented ~45-50 stature ceiling class.
- Rear basket/rack slabs read olive-cloth at 1x (tone lane).

## §B3.1 GUN-RUN round (2026-08-06, merkava family agent)
Owner directive (BUILD-STANDARD §B3.1 "gun rectangular prisms"): the 4B
gun root was the family's worst §B3.1 read — the drum pierced a
flat-faced, vertical-walled crest slab (the owner's "rectangular block")
with a buried bore evacuator (evac 0.30 = world z 1.27, inside the
casting: the tube showed NO evacuator).

### Change
- evac 0.30 -> 0.751 + evacR 1.35: MG253 evacuator drum lands at world
  ~3.24..3.60 (~37-53% of the visible tube, the Mk.4 photo station),
  r 0.105 vs the 0.095 sleeve.
- gunBoot { rAdd: 0.020 }: fabric dust boot at the recessed trough mouth
  (roll + bellows taper + step-shadow seam ring + dark slot shadow).
  SLIM on 4B: the sparse-turret print prices every proud mm — rAdd 0.045
  measured turretCurves 52.3 -> 51.4; 0.020 measures 0.0. Boot is
  gun-bucket (pitches with the gun, as the real fabric does).
- crest.rakeTop 0.10 / rakeTop1 0.30 (new opt-in in the default crest
  branch): the gun hood's flanks now LEAN (real Mk.4B ridge) instead of
  the vertical-walled box. Mask carriers untouched by construction: plan
  rides the unchanged BOTTOM edges, side max-over-x rides the unchanged
  centerline top lines. Params absent = byte-identical old slabs (3-series
  graduates unaffected, verified by frozen-row gate holds + hashes).
- SMOKE RE-SEAT (§B2, measured): the shared cheekPoint(f 0.58) line
  assumes an apex-reaching cheek (m4 class); the 4B cheek polyline starts
  at z_local 1.85, so the rosette HOVERED over the notch void — a true
  standoff that stayed mask-connected only through the old vertical hood
  corner (fq-right islands 392 px rest / 413 px yaw-180 at the gate's
  400 px threshold — floaters flipped to 0 the moment the hood raked).
  It now sits ON the left cheek sheet (pts[0] +0.15 outboard, 0.15
  down-slope).
- Over-gun .50 on the hood (merkavaMG at crest z0-1.0, post base embedded
  in the raked hood top): real Mk.4B fit, §B3 roof-MG law, §H.4 tell vs
  m4's roof-edge mount — and the HONEST carrier for the station slice the
  floating smoke pod had been holding by accident (stations 61.8 -> 59.0
  when the pod re-seated; 64.9 with the MG).

### Done-gates (official rigs, x2 at close)
- geometry-gate x2 IDENTICAL: min 34.1 — hull 60.6 / whole 34.1 /
  turret 53.2 / stations 64.9 / dims 100 / floaters 100.
  vs baseline 60.6/34.1/52.3/61.8/100/100: turret +0.9, stations +3.1,
  everything else exact. floaters 100 restored (see smoke re-seat).
- npm test green. Track-clip: band rear 6 / shoe rear 38 (pre-existing
  class, gear untouched). Turret-parent: 0/0/0. Standard-check: contig
  0 holes.
- Yaw pair at final bytes (shots/merkava-gunrun/pairs/*merkava4b).

### Law discoveries (bank)
- FLOATER-BY-BRIDGE (§B2 corollary, measured end to end): a standoff
  mass can sit for ROUNDS at 392 px — 8 px under the gate's 400 px
  island threshold — connected only through a neighbor's silhouette
  corner; ANY slimming of that neighbor flips it to a floater. Helper-
  placed fittings (cheekPoint class) must be audited against the actual
  mark's geometry, not the helper's assumed anatomy.
- PROUD-RING-ON-GUN-RUN: a cinch ring 1.5 mm proud of a boot/collar can
  crest the assembly silhouette at articulation poses once casting
  bridges rake away — keep rings at or under the body surface (the
  step-shadow seam pattern) on anything that pitches.
- ISLAND HUNTS RUN AT GATE RESOLUTION: the debug renderMask (384) dilates
  2 px of 384 and bridges gaps the 1024 gate mask keeps open — hunting
  floaters below gate resolution reports false-clean.

### Honest residuals
- whole 34.1 unchanged — the documented stature/fused-print ceiling
  class binds this mark, not the gun run.
- Track-clip rear 6/38 + decor census mg0+0d: pre-existing documented
  lanes (idler-wrap class; §I fittings migration).
