# Centurion Mk.3 (`centurion3`) — reference packet

Exact variant: Centurion Mk.3, QF 20-pounder (84 mm).

## Corroborated real dimensions
- Hull length 7.56–7.82 m; overall length gun-forward 9.83–9.85 m; width 3.38–3.39 m;
  height 2.94 m.
  Sources: https://en.wikipedia.org/wiki/Centurion_(tank) ,
  https://www.iwm.org.uk/collections/item/object/70000144 ,
  https://wiki.warthunder.com/unit/uk_centurion_mk_3
- Gun: QF 20-pounder 84 mm L/66.7 ≈ 5.6 m tube (Type A: bare tube; overhang past nose
  ≈ 2.3 m).
- Running gear: 6 road wheels per side on Horstmann bogies (3 twin bogies), rear drive
  sprocket, front idler, exposed upper run under prominent full-length side SKIRTING
  PLATES (the Centurion's signature armoured skirts cover the return run and upper wheels).
- Distinctive identity: long cast/welded turret with rounded cast front and long rear
  stowage bin, loader hatch + commander cupola, 20-pdr with a slim exposed tube; hull with
  a well-sloped glacis meeting vertical-ish sides, skirts flaring at the fenders.

## Local GLB oracle (m_bergman print pack)
Width-normalized reference: hull z ±3.75 (7.50 long ✓ matches real hull/width ratio),
hull top y 1.74, whole top 2.20 (turret bits on the deck at ground level).
**ORACLE DEFECT:** unassembled print layout — turret at ground level under/behind the
hull, barrel never clears the hull length bounds → turret component structurally ~27, gun
structurally 0 for honest geometry (same userdrops6.js articulated() issue as charioteer).
Hull + tracks components legitimate; the printed hull shows the skirted Centurion side
with 6 exposed lower wheels.

## Procedural gaps identified (before edits)
- Procedural hull top 1.50 vs oracle 1.74 — hull/side skirt band too low; skirts absent
  (CLASSIC template defaults skirts:false) though the real Mk.3 and the print both carry
  full skirts.
- Turret 'cast' dome is passable but sits slightly narrow; 20-pdr overhang was 0.85 m —
  should be ≈ 2.3 m for identity (gun component stays 0 either way under the print oracle).

**Oracle re-processed (repair_oracles_blender.py): turret seated** — cast
turret section carved from the print skin and lifted +8.0 onto the ring;
20-pdr stub seated on the face; flat-pack plates parked inside the hull.
Turret stays partially capped: the print splits the long turret into the cast
front (assembled) plus flat-pack panels no rigid move can assemble.

## Mismatch log — shaded-parity r2 (2026-07-30)
- Roof "RWS" read closed: pintleMG removed; cupola + loader hatch now stand on cast
  pedestals bridging them to the dome surface (they previously levitated ~0.2 m — the
  buildTurretAndGun default seats hatches at h over a curved casting).
- Floating diagonal deck rod: the buildHull tow cable is now CLAMPED — cleat posts under
  both ends + a mid saddle block (cable geometry itself lives in shared kit.js).
- Turret: big rectangular strapped bustle bin filling the rack, 4 lifting eyes, cheek
  bracket + triple smoke dischargers (was three painted dots), antennas moved to
  bustle-corner base pots, recessed dark mantlet ring + low canvas hood over the gun root.
- Gun: 20-pdr B-barrel mid-tube fume extractor added (evac 0.55). G stays 0 by structure —
  the print ships a stub tube (cap; honest 5.60 m barrel kept).
- Glacis: driver hatch lids, headlight pods with guard bars, splash V-rail, tow shackles.
  "Shorten the glacis" NOT taken: post-repair H sits at 91 with this length — shortening
  regresses the hull mask (accepted deviation from the r1 bullet).
- Deck: raised louvre field + fuel fillers + rear track-link rack. Skirts: panel gap
  strips + lifting handles. Wheels: 'dished' style (hub drum, bolt ring, rubber tire).
- Fidelity 66.6 vs 66.9 committed. T38 capped: the print turret remains part flat-pack
  (see oracle note above).
