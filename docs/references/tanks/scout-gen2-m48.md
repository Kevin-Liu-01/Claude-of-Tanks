# M48 Patton (M48A3/A5) — scout-gen2 reference packet (stub, 2026-07-31)

Scout status: MODEL FOUND: ATModeler M48A5 (CC BY) in candidates-gen2/m48/

## Published dimensions
| dimension | value |
|---|---|
| overall | 9.31 m (M48A5, gun fwd) |
| hull | 6.42 m |
| width | 3.63 m |
| height | 3.09 m |
| weight | 49.6 t (A5) |

Dimension sources (secondary military references — cite the specific page at integration):
- https://tank-afv.com/coldwar/US/M48-Patton.php
- https://www.militaryfactory.com/armor/detail.php?armor_id=22

## Orthographic / blueprint references
- https://www.the-blueprints.com/blueprints/tanks/tanks-m/
- https://tank-afv.com/coldwar/US/M48-Patton.php
(the-blueprints.com links are letter-index pages — pick the exact sheet at integration; most of these tanks have a dedicated sheet there)

## Photo references
- https://commons.wikimedia.org/wiki/Category:M48_Patton

## Integration checklist (for the fleet program, NOT this scout round)
- [ ] verify dims against a second source; fill missing (hull-only length, track width)
- [ ] geometry gate: model scaled to overall/hull length, width, height above
- [ ] dual-gate render judgment vs the photo references

## Oracle instrument findings (orchestrator, 2026-08-03, REG batch 0a39d55)

- **Fused shell**: print has only HullMesh + Turret/TurretMesh — the M68
  tube is baked INTO TurretMesh (no gun node; loader + extract default gun
  regex correctly find nothing). Gun never elevates in-game; m1a1/abramsx
  fused-shell packet class.
- **Tube pitched at rest ~12.6°**: axis climbs 2.296 → 2.877 over gate-z
  2.4 → 5.0 (slope 0.223), bore evacuator riding the tube at z 2.85-2.95.
  This is a REAL print defect (triage probe read confirmed by extract).
  Pitch-flatten by regional vert rotation is possible but risky: fused
  mesh, trunnion obscured by the searchlight blob at z 2.0-2.1. DECISION
  DEFERRED to the m48 build round: either (i) regional rotate about the
  axis/face intersection, or (ii) §6 certified gun-region cap (never
  covers dims) + simple warp.
- **Dims warp sketch (gate meters)**: hullMask 7.13 → 6.42: body z ×0.9006
  about body center −1.4535 → z_map [(-5.018,-4.6637),(2.111,1.7567)] +
  muzzle pin (5.025,4.6463) for overall 9.31. Height: bodyH/cupola crest
  2.68-2.71 vs pub 3.09 (over-cupola) → uniform y ×1.1529 from ground
  (isu152 inverse-class), accepting the pitched muzzle tip rising to ~3.45
  under the cap. Execute alongside the pitch decision.
