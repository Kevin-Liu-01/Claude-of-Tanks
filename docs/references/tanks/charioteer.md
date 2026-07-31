# FV4101 Charioteer (`charioteer`) — reference packet

Exact variant: FV4101 Charioteer tank destroyer — Cromwell (A27M) hull re-turreted with the
84 mm QF 20-pounder in a tall angular welded turret.

## Corroborated real dimensions
- Hull length ≈ 6.35–6.55 m (Cromwell hull); overall length gun-forward ≈ 8.8–9.2 m;
  width 3.05–3.10 m; height ≈ 2.5–2.59 m.
  Sources: https://en.wikipedia.org/wiki/Charioteer_(tank) ,
  https://www.militaryfactory.com/armor/detail.php?armor_id=422 ,
  https://www.wardrawings.be/Modern/Site/Ground/UK/MBT/Charioteer.htm
- Gun: QF 20-pounder, 84 mm L/66.7 → ≈ 5.6 m tube, slim, no evacuator on early Type A
  barrel; large forward overhang (≈ 2.3–2.6 m past the nose).
- Running gear: Christie — 5 large road wheels per side, no return rollers, front idler,
  rear drive sprocket, exposed track run under flat full-length track guards.
- Distinctive identity: LARGE angular late welded turret (wide slab base, strongly sloped
  face with a narrow gun throat, flat tall sides, chamfered rear bustle) set mid-hull on a
  low, boxy Cromwell hull with near-vertical driver's plate and panniers over the tracks.

## Local GLB oracle (m_bergman print pack)
Width-normalized reference: hull z −3.36..+2.89 (6.25 long), hull top y 1.67, whole to
y 1.80 only. **ORACLE DEFECT:** the pack is an unassembled 3D-print layout — the turret
part lies at GROUND level (its `Turret` node pivot autoPivots to y 0.37) poking past the
hull nose/rear at track height; the barrel never clears the hull length bounds. Fidelity
turret component is therefore structurally ~22 (occluded ground blob) and gun is
structurally 0 for any honest geometry. MODEL_SOURCE fix (assemble/seat the turret; see
src/vehicles/userdrops6.js `articulated()` rows) is outside UK-family ownership.
Hull + tracks components are legitimate: the printed hull matches real Cromwell
proportions (6.25 long × 3.05 wide normalized, hull top 1.67, five 0.9 m-class wheels).

## Procedural gaps identified (before edits)
- Procedural hull 6.67 long (vs 6.25) and hull top 1.48 (vs 1.67): too long, too low.
- Wheels: 'rubber' discs with visible star cutouts read wrong vs the solid Christie discs.
- Turret was the generic Leopard-style `western` wedge — wrong identity (needs the tall
  angular Charioteer slab turret) — and the 20-pdr had no real overhang (tip 1.0 m past
  nose vs ≈ 2.4 m real).

**Oracle re-processed (repair_oracles_blender.py): turret seated** — turret
part carved from the fused print skin and lifted +8.0 onto the ring
(recentred +3.3 x), 20-pdr base collar seated on the gun throat, print spares
parked inside the hull. Gun stays structurally 0: the print expects a rod
barrel (only a 0.4 m collar ships).

## Mismatch log — shaded-parity r2 (2026-07-30)
- 20-pdr re-seated at the upper-tier face CENTER (gun pivot 0.52 -> 0.64; r1 critique said
  it emerged at the tier seam) behind a narrow bolted internal mantlet + recoil collar.
  Type B kit added: mid-tube fume extractor (evac 0.52, 1.75x) + muzzle counterweight
  collar. G stays 0 by structure: print ships a 0.4 m collar, no rod barrel (cap).
- Floating deck tow cable DELETED (shared Cromwell hull); bow shackles instead.
- Christie wheels 'holes' style (tires, bolt hubs, stamped holes). No return rollers
  (correct for the Cromwell run).
- Hull: rivet seams + dots (extended), inset pannier band with PROUD strapped bins + boxed
  step (r1 "single tall plates"), raised louvre bank, twin fishtail exhaust cowls, framed
  visor + hinges, Besa ball housing + stub, stalk headlights on the mudguard tips.
- Turret: cupola vision ring, loader split-hatch seam, 4 corner lifting eyes, 2" smoke
  discharger boxes with tube triplets on both cheeks, strapped bustle stowage bin.
- Fidelity 67.4 vs 67.9 committed (T50 — print turret stubbier than the real slab; noted).

## Round-3 log — oracle re-repair + re-seat (2026-07-30)
- ORACLE RE-REPAIRED from .bak: solo-mesh renders proved the print's TurretMesh is ONE
  fully-assembled turret (complete 20-pdr with counterweight muzzle ATTACHED, rear
  stowage/spare wheel intact) sunk in the rear hull. The r2 "muzzle stub" and the parked
  "tail spares" were carve artifacts — the old recipe sliced the barrel and stole rear
  furniture. New recipe = one rigid move of the whole mesh: basket ring (36-vert circle,
  Kasa fit c=(11.795,18.033) r6.0) onto the hull ring race (c=(15.300,37.400) r6.2),
  dx +3.505 dz +19.367 lift 7.0, pivot [15.30,15.2,37.40]. Reference now renders as ONE
  assembled tank in all 9 views; turret yaws cleanly with the full gun.
- Headline 67.4 -> 76.2 (T 50.3* -> 65, G 0* -> 46 — both honest for the first time).
- Procedural re-seat vs the honest print: turret pivot -0.18 -> +0.55 (ring race sits at
  +9.7% of hull length, forward); gunLength 5.45 -> 4.62 keeps the muzzle at the print's
  +5.5 station.


## Gate v6/v7 iteration (2026-07-31)
Rebuilt to published dims: hull 6.55, overall 9.20 (20-pdr muzzle 5.93 vs
the print's 5.59 — bounded cover), width 3.05 with guard faces on the
committed plane, cupola riser as the 2.58 p95 anchor, deep breech mass
matched, gear inside the hull span. The print sits z-shifted (+1.31) —
absorbed by registration. dims 100, floaters 100 green; curve rows capped by
the short/shifted print (~14-32).
