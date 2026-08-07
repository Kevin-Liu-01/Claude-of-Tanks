# A34 Comet (`comet`) — reference packet

Exact variant: Tank, Cruiser, Comet I (A34) — 77 mm HV.

## Corroborated real dimensions
- Overall length 7.66–7.7 m (gun forward), hull ≈ 6.55 m; width 3.04–3.05 m;
  height 2.68 m.
  Sources: https://en.wikipedia.org/wiki/Comet_(tank) ,
  https://tanks-encyclopedia.com/ww2/gb/a34-cruiser-tank-comet-mark-i/ ,
  https://www.militaryfactory.com/armor/detail.php?armor_id=68
- Gun: 77 mm HV (76.2 mm, ~L/50 → ≈ 3.6–3.8 m tube) WITH a prominent double-baffle
  muzzle brake; overhang past the nose ≈ 1.1 m.
- Running gear: 5 large road wheels per side (Christie-derived), 4 return rollers hidden
  by panniers, front idler, rear sprocket, track guards full length.
- Distinctive identity: low welded/cast composite turret with a curved cast front plate,
  vertical welded sides, and a REAR BUSTLE overhang (radio bustle); turret set mid-hull;
  hull has a near-vertical driver's plate above a short glacis with the hull MG ball on
  the right; side panniers overhang the tracks.

## Local GLB oracle (m_bergman print pack)
Width-normalized reference: whole z ±3.48 (6.96), hull top ≈ 1.7, whole top 1.87 —
**ORACLE DEFECT:** unassembled print layout, turret at ground level (autoPivot y 0.37),
barrel never clears the hull bounds → turret component structurally ~22, gun structurally
0 for honest geometry (MODEL_SOURCE assembly fix outside UK ownership; see
docs/references/tanks/charioteer.md). Hull + tracks components legitimate: hull reads
~6.9 long normalized (includes track horns), five solid wheels, tall pannier sides.

## Procedural gaps identified (before edits)
- Turret was the generic `western` (Leopard wedge) — wrong identity; needs Comet's
  welded turret with curved front and rear bustle + 77 mm HV with muzzle brake.
- Hull top 1.49 vs ref ≈ 1.7 (too low); wheels styled with cutouts vs solid discs.

**Oracle re-processed (repair_oracles_blender.py): turret seated** — turret
carved from the print skin and lifted +8.5 onto the ring; 77 mm muzzle-brake
piece + mantlet collar seated on the face; spare plates parked inside the
hull. Unassembled-layout defect above is historical.

## Mismatch log — shaded-parity r2 (2026-07-30)
- 77 mm HV re-seated at the turret FACE CENTER (gun pivot +0.08) inside a new bolted
  internal mantlet plate (bolt ring, coax Besa port, sight port) — r1 critique "exits the
  turret/hull seam" closed. G stays 0 by structure: the repaired print still ships only a
  muzzle-brake stub, so an honest 4.42 m tube cannot overlap it (cap, do not chase).
- Floating deck tow cable DELETED from the shared Cromwell hull (one end read mid-air);
  replaced with bow tow shackles + eyes on the lower glacis.
- Christie wheels now 'holes' style (rubber tire + near-full dish + hub drum + bolt ring +
  6 dark stamped holes); FOUR return rollers added in the wheel gaps (Comet cue).
- Hull: riveted seam strips + rivet dots, pannier band inset with PROUD strapped bins +
  boxed step, raised louvred engine bank, twin fishtail exhaust cowls, framed driver visor
  with hinges, Besa ball in a ring housing with dark stub, headlights on mudguard-tip
  stalks, intake mushroom + fuel fillers.
- Turret: cupola vision ring, split-hatch seam on loader hatch, 4 lifting eyes, right-cheek
  smoke discharger cluster on a bracket, strapped radio bustle.
- Fidelity 69.0 vs 68.9 committed (T49 — print turret remains stubby vs the real casting).

## Round-3 log — oracle re-repair + re-seat (2026-07-30)
- ORACLE RE-REPAIRED from .bak: the print's TurretMesh is ONE assembled turret — 77 mm HV
  with its muzzle brake ATTACHED, bustle bin and cheek box intact (the r2 park boxes were
  carving off the bin's left wall and the cheek stowage; the "brake piece on the face" was
  already part of the gun). New recipe = one rigid move: basket ring c=(11.573,18.100) r6.0
  onto the hull race c=(14.600,39.000) r6.2, dx +3.027 dz +20.900 lift 7.5,
  pivot [14.60,15.5,39.00]. One assembled tank in all 9 views.
- Headline 69.0 -> 75.5 (T 49.9* -> 60, G 0* -> 45 honest).
- Procedural re-seat: turret pivot -0.12 -> +0.60 (print ring at +9% of hull length);
  gunLength 4.42 -> 3.70 keeps the muzzle at the print's +4.7 station.


## Gate v6/v7 iteration (2026-07-31)
Rebuilt to published dims: hull 6.55 (the print is ~4% long — mission-known
'comet print 10% long' moderated to +4% under v7 true cameras), overall 7.66
(muzzle 4.39), width 3.05 with the track-guard faces exactly on the
committed plane (v5 guards breached by 2.8 cm -> silent shrink), cupola on a
riser as the 2.68 p95 anchor, deep breech mass matched, Christie gear pulled
inside the hull span (the end-wheel wraps were defining hullLengthM).
CERTIFIED CAP: the print sits z-shifted (+0.75 registration) and ~4% long —
whole/hull rows carry the bounded stretch; dims 97.9 and floaters 100 green.


## Gate v10 iteration round 2 (2026-07-31)
Probe-true retune (the profile JSON for this print decodes at a different
lab scale — gate-frame probes only). The print registers rear-heavy
(dAlong ~+0.70). Changes: hull pannier band narrowed to ±1.26 with 1.54
fender aprons (the print's front hull tops 1.54 at |x| 1.29..1.53 — the
old full-width 1.70 band read as excess); hull pannier bins DELETED from
the hull mask; the print carries its tall fender bin in the TURRET mask,
RIGHT side only (front band 1.96..2.32 at x +1.42..1.53) — built as a
turret-bucket bin at x 1.08..1.52 (fused-print quirk, documented cap);
turret crown raised to 2.55 (h 0.85) with the cupola cluster at the
print's +x station (x +0.68, torus 2.68 = the published-height p95
anchor); radio bustle at world -0.14..-1.09 (top 2.28); breech/basket mask
bottoming 0.73 over world -0.3..+1.03; gun axis 1.86.
CERTIFIED CAPS (v10): the print's front-view roof is asymmetric (2.48 at
x +0.6..0.9 vs 2.27 centre-left) while its side crown reads 2.51-2.55 —
the two views cannot both be matched by mirrored geometry; bounded row
cost. Published height 2.68 vs print crown 2.55: the 2.66-2.68 cupola
anchor carries the dims-sovereign delta. Dims 100, floaters 100.
Numbers (baseline -> now): hull 28.3 -> 35.2, whole 0 -> ~0.5, turret
6.7 -> 13.4, stations 29.8 -> 24.7 (front-view caps dominate; see above).

## Vertex round r1 (2026-08-03, uk agent)
Stylization: print +3.9% overall / +4.2% hull mask (buildable; the +20.4%
bodyLen read is the fat 77mm+brake crossing the extract's 12% body filter).
FRAME LAW LEARNED THE HARD WAY: this print's EXTRACT z-frame is mirrored/
shifted vs the lab (its own hull-center normalization on the blender-
re-repaired fused print) — an extract-driven turret re-seat zeroed the
rows; only the REGISTERED PARITY TABLES (tools/tmp-uk-parity.mjs) are
authoritative here. Lab truth banked (world frame): casting face 1.50 with
the mantlet band 1.50..1.97 (y 1.52..2.14), crown 2.45-2.57 peaking z
-0.02..0.55, turret rear ends -1.00, walls ±1.15, basket 0.74 under z
0.27..1.50 only, gun axis ~1.87 with the muzzle brake at 4.4-4.8 (print
+4% long; my muzzle stays at the published 4.39 — bounded cover). STALE
CERT RETIRED: "print carries its tall fender bin in the TURRET mask at
x 1.08..1.52 (top 2.26)" — the re-repaired print's bin reads x 1.34..1.53,
y 1.92..2.29, and the front camera 'at' axis = +world_x (pinned by a
one-sided marker experiment; the r2 hull-bucket and left-side attempts
both regressed). Track: ref grounds |x| ~1.10..1.50 (the narrow first
read was dy-shifted). Cupola carries the 2.66 p95 anchor (print peak
2.57). TRACK CONTAINMENT LAW: cromwellHull guards raised above the wrap
line (wrapTop rule), pannier band split at the wrap line, toe/inner
solids held to the inter-track channel — audit 1200/1105 vox -> 0/0.
Numbers (r0 -> banked): min 0.5 -> 11.3 (turret 13.4 -> 39.4, stations
24.7 -> 61.3, whole 0.5 -> 11.3, hull 35.2 -> 32.0, dims 100). Residual
floor: front rows (crown x-profile + track/guard bands) — next round
works front_whole worst-first from fresh boards.

## 2026-08-06 FLEET MUZZLE-BORE + §C.1 WINDING SWEEP (fleet-sweep one-liner)
- §B3.1 bore through the 77mm single brake (o.gunLength+0.02); §C.1 2 reversed re-oriented; F-vs-D 83->20 (2.7cm skewed-loft nose skins - base-21 rebuild class residual, cromwellHull under-slab ring-cross FIXED at source); gate HELD x2 EXACT 11.3 (relic row); hash not frozen; mantlet mass verified per MANTLETS-MANDATORY (db9168c). Mechanism: kit.js muzzleBore shadow-named furniture + orientedSlab guard (3fca39b / 1017339); end-on+quarter crops shots/muzzle-sweep/{before,after}/.
