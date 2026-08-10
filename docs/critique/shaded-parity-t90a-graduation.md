# T-90A Leclerc-method graduation — final independent sitting

Date: 2026-08-09
Candidate: final `codex/t90-family` working bytes (pre-landing)
Reference: recovered T-90A source kit + normalized component oracle
Verdict: **PASS**

## Independent 14-view scorecard

Order: front, front-left, left, rear-left, rear, rear-right, right,
front-right, top, hero front-left, hero rear-right, hero top-tilt,
close front, close roof.

`[9.1, 9.2, 9.0, 9.1, 9.1, 9.1, 9.0, 9.2, 9.1, 9.2, 9.1, 9.1, 9.1, 9.1]`

- Floor: **9.0**
- Mean: **9.11**
- Yaw-90 attachment check: **9.2**
- All-decoration verdict: **PASS**

The independent critic confirmed that the cast primary mass, K-5 leaf banks,
Shtora/optic crown, seated Kord cradle, bustle bins, antennas, gun sleeve and
muzzle remain attached and rotate coherently.  The final deck-hardpoint feet
are continuous, the stern pintle foundation is embedded, and the two local
fender shoe-clearance notches do not erode the visible outer course.  There
are no unsupported decorations, empty-air seams, floaters or occlusion
failures.

## Machine receipts

- Geometry gate, twice identically: **90.4** minimum — hull 90.6, whole 90.5,
  turret 90.4, stations 90.4, dimensions 97.8, floaters 100.
- Current gate JSON SHA-256:
  `4d770409a0ecb184876a18c665e95ad86fe2144424696460ee49ee4395a9f218`.
- Dimensions: height 2.25/2.23 m (0.78%); hull length 6.77/6.86 m (1.28%);
  overall length 9.55/9.53 m (0.25%); width 3.77/3.78 m (0.29%).
- Freeze, twice identically: **810a6f18** (58 meshes / 129,205 vertices).
- Standard: track band **0/10**, contiguity **0**, fittings **MG 1 + 6**.
- Winding: reversed/mixed **0/0**, FrontSide deficit **0 px**, HARD **0**.
- Turret-parent audit: dangling/abutting **0/0**.  Its two `stranded`
  candidates are adjudicated false positives: the fixed-hull deck tow cable
  and spare-track run correctly remain on the hull while the turret yaws.
- Full `npm test`: green.
- Recovered source ZIP SHA-256:
  `4aec50062e433ad11b09fdd35994d927cb06da274b0f6d891fcca04cb9d4259c`.

## Method/result

The rebuild follows the Leclerc method: source connected components first,
independent longitudinal stations, joined true-profile planes, asymmetric
equipment stations, and P95-only height.  It keeps the T-90A's low cast dome
and radial K-5 grammar distinct from the welded T-90SM/MS variants; family
harmony comes from shared fabrication logic, not a generic shared turret.

The earlier first sitting (floor 9.0 / mean 9.06) was deliberately superseded
after the standard-only stern and fender closures.  This document records the
fresh final-byte re-certification above.
