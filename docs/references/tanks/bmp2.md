# BMP-2 — reference packet

Exact vehicle: **BMP-2** infantry fighting vehicle — low amphibious hull,
two-man conical turret with the long 30 mm 2A42 autocannon and the
roof-mounted 9M113 Konkurs ATGM.

## Real dimensions (2+ sources)
- Length **6.71-6.735 m**, width **3.09-3.15 m** —
  [Wikipedia: BMP-2](https://en.wikipedia.org/wiki/BMP-2),
  [militaryfactory BMP-2](https://www.militaryfactory.com/armor/detail.php?armor_id=50)
- Height: **2.06 m hull roof** (militaryfactory) / **2.45 m** over the
  turret+ATGM stack (Wikipedia) — TWO DATUMS, note which the in-game
  spec uses before dims scoring.
- Weight 14.3-14.6 t; crew 3 + 7 dismounts.
- Suspension: **6 double road wheels** per side, front drive sprocket,
  rear idler (BMP layout — drive at the BOW), 3 return rollers.

## Identity cues (visual laws for the build)
- VERY low, wide, boat-like amphibious hull with a sharp raked prow
  ("sharper prow" than BMP-1) and a near-flat top deck.
- Two-man CONICAL turret at hull center with the long thin 30 mm 2A42
  (small conical flash hider), coax 7.62 PKT; **Konkurs ATGM launcher
  tube on the turret ROOF** (the BMP-2 tell vs BMP-1's over-gun rail).
- 3+3 smoke dischargers on the turret front cheeks.
- Rear hull face: **twin outward-opening troop doors** (each with a
  fuel-cell bulge + firing port); firing ports along the hull (4 left /
  3 right) with vision blocks.
- Long side fenders/wave planes; trim vane folded on the bow; driver
  front-LEFT with the commander behind (BMP-2 moved the commander into
  the turret).
- Track run per §B6: raised FRONT sprocket + raised REAR idler (mirror
  of the western layout — the ramp rises at both ends regardless).

## Local oracle
`public/models/tanks/community/bmp2_bergman.glb` — m_bergman pack
(QUARANTINE class: gate/measure LOCAL-ONLY, never ship as visuals; the
in-game MODEL_SOURCE registration stays delisted). PROBE BEFORE FIRST
GATE (false-0 law): repair_oracles inspect + vertex-extract — the
Bergman pattons all carried print-bed packing defects (parked turrets);
assume nothing until measured. bmp1_bergman.glb also local (future
BMP-1 coverage).

## Gate wiring
bmp2 rides its procedural modern3.js builder in-game. For gate coverage
register the Bergman print through the fidelity harness override map
(LOCAL_REFERENCE_OVERRIDES, tools/procedural-fidelity.html) — the same
mechanism graduates use — NOT by re-enabling the quarantined
MODEL_SOURCE entry.
