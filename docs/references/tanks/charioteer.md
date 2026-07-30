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
