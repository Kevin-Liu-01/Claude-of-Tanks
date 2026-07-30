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
