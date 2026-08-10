# T-90SM Leclerc-method graduation — final independent sitting

Date: 2026-08-09
Candidate: final `codex/t90-family` working bytes (pre-landing)
Reference: recovered T-90SM source kit + normalized component oracle
Verdict: **PASS**

## Independent 14-view scorecard

Order: front, front-left, left, rear-left, rear, rear-right, right,
front-right, top, hero front-left, hero rear-right, hero top-tilt,
close front, close roof.

`[9.0, 9.1, 9.1, 9.0, 9.0, 9.0, 9.1, 9.1, 9.0, 9.1, 9.1, 9.0, 9.0, 9.0]`

- Floor: **9.0**
- Mean: **9.04**
- Yaw-90 attachment check: **9.1**
- All-decoration verdict: **PASS**

The independent critic inspected all 14 standard views plus three yaw panels.
The sights, MG cradle, smoke banks, ERA courses, antennas and bustle modules
rotate as one seated assembly, with continuous load paths and no empty-air
seams or unsupported hardware.  The low six-wheel hull, welded angular
turret, squared bustle, Relikt flank grammar and asymmetric roof/sight package
remain securely T-90SM across every view.  Residual blockiness is non-blocking.

## Machine receipts

- Geometry gate, twice identically: **90.0** minimum — hull 90.2, whole 90.3,
  turret 90.8, stations 90.0, dimensions 100, floaters 100.
- Gate JSON SHA-256, twice identically:
  `723648c49e6ef393b4b881bb2bfe7bcff7621d32a705f6c09c9e06000c840ca1`.
- Dimensions: height 2.24/2.23 m (0.58%); hull length 6.85/6.86 m (0.13%);
  overall length 9.67/9.63 m (0.36%); width 3.77/3.78 m (0.21%).
- Freeze, twice identically: **56324371** (46 meshes / 87,171 vertices).
- Standard: track band **0/0**, contiguity **0**, fittings **MG 1 + 3**.
- Winding: reversed/mixed **0/0**, FrontSide deficit 15 px (0.03%, left),
  yaw candidates **0**, static/coincident **10,108/10,108**; m1/m2 clean.
- Full `npm test`: green.
- Recovered source GLB SHA-256:
  `1768d28ccbfa8a55a8ce3fa9b3f0a840220b70ea16f648d3c76ab9aefffe4efc`.

## Method/result

The rebuild follows the Leclerc method: exact source-component inventory,
independent longitudinal stations, joined true-profile planes, deliberately
asymmetric equipment stations and P95-only height.  The small geometry used
to close standard and attachment findings was limited to real visible load
paths—rack webs, terminal toes, deck seats and track contact knees—rather than
generic proxy masses.  That preserves the T-90SM's distinct welded-turret
identity while making every decoration visibly supported.

This receipt records the final-byte sitting only.  Earlier provisional visual
reviews were superseded by the source-relative rebuild and fresh independent
graduation above.
