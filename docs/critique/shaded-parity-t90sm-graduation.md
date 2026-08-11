# T-90SM owner-priority redesign — final independent re-certification

Date: 2026-08-10
Candidate: frozen `7efc69c9` bytes (pre-landing)
Reference: recovered T-90SM source kit + normalized component oracle
Verdict: **PASS**

## Independent 14-view scorecard

Order: front, front-left, left, rear-left, rear, rear-right, right,
front-right, top, hero front-left, hero rear-right, hero top-tilt,
close front, close roof.

`[9.0, 9.1, 9.0, 9.1, 9.0, 9.1, 9.0, 9.1, 9.1, 9.1, 9.1, 9.1, 9.1, 9.2]`

- Floor: **9.0**
- Mean: **9.08**
- Yaw ownership/load-path check: **PASS** across 28 frames
- All-decoration verdict: **PASS**

The independent critic inspected all 14 paired source views and all 14 yaw-0
plus 14 yaw-90 views. The gun, embedded diamond cheek skin, primary turret,
backed slat wrap, optics, RWS/MG, smoke kit and antennas rotate as one seated
assembly. Deep scalloped skirts, rear service field and tow cable remain
correctly hull-owned. No empty-air seam, unsupported fitting, fused duplicate
turret mass or stranded decoration remains.

## Machine receipts

- Geometry gate, twice identically: **90.0** minimum — hull 90.2, whole 90.3,
  turret 90.9, stations 90.0, dimensions 100, floaters 100.
- Gate JSON SHA-256, twice identically:
  `55c349c191fbb584620fe0cf0d88f315ff4a72c23156d19951b31a73b6a22c61`.
- Dimensions: height 2.24/2.23 m (0.58%); hull length 6.85/6.86 m (0.13%);
  overall length 9.67/9.63 m (0.36%); width 3.77/3.78 m (0.21%).
- Freeze, twice identically: **7efc69c9** (48 meshes / 93,257 vertices).
- Direct fidelity: **93.3** (H96/T88/G94/R91), every whole view above 93.
- Standard: clips **24/49**, contiguity **0**, fittings **MG 1 + 3**.
- Winding: reversed/mixed **0/0**, FrontSide deficit 15 px (0.03%, left),
  yaw candidates **0**, static/coincident **9,709/9,709**; m1/m2 clean.
- Full `npm test`: green.
- Recovered source GLB SHA-256:
  `1768d28ccbfa8a55a8ce3fa9b3f0a840220b70ea16f648d3c76ab9aefffe4efc`.

## Method/result

The rebuild follows the Leclerc method by retaining the exact source-section
core and repairing its visible structure instead of substituting a generic
family shell. Solid vertical bustle steps become backed slat cells with real
rails and buried carrier feet; the low diamond cheek is embedded in the
measured turret; scalloped skirts stay clear of the native shoes; and the rear
service planes remain inside the certified envelope. Every added form has a
visible physical load path.

This receipt records the final-byte sitting only. The earlier `56324371`
graduation and every provisional redesign board are superseded by the fresh
42-frame re-certification above.
