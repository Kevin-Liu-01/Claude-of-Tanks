# AbramsX — reference packet

Variant: GDLS AbramsX technology demonstrator (2022): unmanned low-profile
turret, XM360 120 mm, 30 mm RWS on top, hybrid drive, ~60 t.
Sources: armyrecognition AbramsX data
(https://www.armyrecognition.com/military-products/army/main-battle-tanks/main-battle-tanks/abramsx-mbt-main-batlle-tank-technology-demonstrator-data),
National Interest (https://nationalinterest.org/blog/buzz/introducing-abramsx-americas-next-gen-battle-tank-209169),
Warrior Maven (https://warriormaven.com/news/land/-abramsx-ai-enabled-fuel-efficient-unmanned-turret-silent-attack).

## Local GLB oracle
`/models/tanks/community/abramsx-mortavex.glb` (owner-supplied, local-only).
Its `Turret` pivot carries no meshes — the shell is static in the hull mask;
only the `stvol` barrel articulates. Scoring frame (ground 0):
- hull: z −3.96…3.96, deck 1.44…1.53 (z 3.5…1.7), track band bottom −0.07
  (run z 1.7…−1.5), belly 0.25; nose bottom rake (2.8, 0.63) → (1.9, −0.02);
  rear: deck steps DOWN behind the turret: 1.84 (z −1.8…−2.2) → 1.34…1.29
  (z −2.6…−2.8), tail block z −3.5…−3.9 y 0.4…1.3; tail bottom rake
  (−2.0, 0.01) → (−2.8, 0.70).
- turret (static shell, scored inside the HULL mask): x ±1.34, z −1.9…1.85,
  sharp front face at z ≈ 1.4, roof plateau ≈ 2.36–2.43 (z 1.3…0.0), rear
  shelf 1.74–1.94 (z −0.3…−1.3), low bustle 1.84 to z −2.2.
- RWS: head to y ≈ 3.0 around z −1.3…−1.5; antenna spike to 4.18 (z −1.8);
  front-view side slopes 2.55…2.80 at x ±(1.3…1.6).
- gun: tube y 1.82…2.05 visible (box 1.61…2.30), axis ≈ 1.93, muzzle z 6.17
  (long XM360 — 2.2 m past the bow).

## Procedural strategy
Build the turret shell + RWS body as HULL-bucket geometry to mirror the
oracle's static shell (turret bucket keeps the RWS head so the rig probe sees
a turret mesh; the barrel keeps full articulation).

## Mismatch note (shared machinery)
The asset's empty turret pivot means the in-game GLB turret does not visually
yaw either; a yawing procedural shell would actually diverge from the oracle.
Flagged for a future modelLoader-side autoPivot fallback.

## Outcome (final lab state)
Baseline 73.8 (H80 T50 G63 R88) -> 81.0 (H84 T60 G77 R94), min view ~79.
Mirrored: blade bow (underside sweeping (3.9,1.05) -> (3.0,0.10)), low deck,
stepped rear, hull-bucket RWS/sensor bridge resting on a yawing chamfered
shell (the asset's shell scores in the turret mask; its bridge does not),
XM360 at axis 1.93 with muzzle 6.17 and a chin cradle at the mantlet root.
Residual gaps: the shell band's exact chamfer profile and the bridge
mass (front view) each hold ~3-5 pts; the asset's empty turret pivot means
its shell yaws around an off-body origin in the articulation strip, which
the procedural intentionally does not copy (its shell yaws about the ring).

## Round 2 (shaded-parity, 2026-07-30)
- XM914 RWS built out on the static bridge (hull bucket, matching the
  asset's non-yawing shell): slew ring, cradle cheeks, stepped 30 mm barrel
  with muzzle ring, dark-faced sensor heads with glass.
- Faceted corner sensor pods flank the bridge at the measured front-view
  slopes (2.62..2.82, x to ±1.58), floored above the yawing shell's swing.
- Round-1 floaters fixed: front mud flaps deleted (nothing behind the blade
  bow to carry them; rears hang at the tail block), and the antenna rods —
  which floated 0.9 m over the deck — now stand on base pods on the rear
  deck at (±1.5, -2.85), outside the shell's yaw sweep. Turret-rear bases
  would orbit/clip a static-antenna asset, so hull-deck pods are the
  closest feasible read of that critique bullet.
- Splitter undercut below the nose tip, hybrid-drive louver panels on the
  raised rear deck, shell panel seams + tie-downs, XM360 angular shroud +
  dark pepperpot muzzle over the tube tip, family glacis/skirt kit with the
  diagonal lead-panel cut.
- Score 81.0 -> 79.4 (T 60->61, R 94->92.5, G 77->71 — the real-XM360
  muzzle furniture the asset's plain tube lacks; within the ±2 gate).


## Gate v6/v7 iteration (2026-07-31)
Rebuilt: hull retabled to the true-camera deck/rakes, corner pods + RWS
bridge seated on hull pylons (v5 left both floating -> 2-pose floater
failure), XM360 at the published 9.77 overall, rear tow-pintle bar at the
oracle's rear overhang (also anchors the shared camera grid so the plan
width columns read the true 3.66 skirt plane — the oracle's 6.16 muzzle
otherwise quantizes widthM to 3.55), shell roof 2.44-2.47 with the undercut
rear block.
CERTIFIED CAP: the oracle carries its RWS bridge as a 2.4 m-long mass at
3.25-3.45 IN ITS HULL MASK plus twin whips at 4.12 — under the published
2.44 heightM (p95) only a 2-column mast head at 3.44 is affordable; the
remaining ~20 columns cap hullCurves/wholeCurves/front rows (~0-26) and
pull the hull registration dy ~0.12-0.27, spreading residual error over
every column. turret rows (the yawing shell) score independently; dims 98.9
and floaters 100 are green.


## Gate v10 cap re-verification (2026-07-31)
The RWS-in-hull-mask cert STANDS under v10: the oracle's hull mask carries
the 3.25-3.45 sensor bridge over 2.4 m plus 4.1 whips; under published
heightM 2.44 those clamp to the 2.44 bridge deck + single 3-column mast
head (hull/whole capped at 0 by the bridge band, turret ~26-31). The
XM360 runs to the published 9.77 overall against the oracle's long tube
(cover-capped). Dims green 98.9; floaters 100.

## 2026-08-01 rebuild — oracle re-derived from CURRENT files
The mortavex bake CHANGED since the v10 cert was written — re-measured with
tools/tmp-abrams-refcurves.mjs (full-curve probe, world coordinates):
- THE SHELL + XM360 NOW RIDE THE TURRET PIVOT AND YAW (the old "empty
  Turret pivot / static shell in the hull mask" cert clause is retired).
  turretCurves is scored against the live shell: hexagonal plan (face 2.34
  wide ±0.6 chamfering to ±1.70 flanks at z 1.9, flank run to -1.29, rear
  chamfer to a flat ±0.78 stern at world -2.45), roof 2.45-2.48 plateau
  (z 0.65..-0.55) easing to a 2.39 shelf and a 2.13 tail, bottom 1.57
  forward rising to 2.04 at the stern, tube band 1.80..2.04 to muzzle 6.22.
- The RWS bridge cert STANDS with confirmed numbers: the HULL mask carries
  a 3.22-3.46 band over z 1.61..-0.75 (~21 columns, plan peak at x ~0.5,
  z -0.3..-0.5) plus twin 4.10-4.13 whips at (x ±1.15, z -1.9..-2.05).
- Rear deck REBAKED LOW: 1.54-1.62 at z -2.3..-2.8 (the old 1.84 -> 1.29
  step table is obsolete); hull-mask sensor stubs 2.33-2.48 at z -1.3..-1.7
  and a 2.75 spike at -1.81; plan bow chamfered (center 3.87, corners 3.65),
  tail plate -3.86 at |x|<=1.55 with a -4.04 pintle bump.
CERTIFIED CAPS (quantified from this rebuild's runs):
- Bridge band + whips under published heightM 2.44: the p95 skip budget on
  this ~7.6 m body is THREE columns; the whips own two (matched at the
  oracle's own stations, tops 4.12 — they also zero the whip station
  slice). The mast head is CLAMPED to the plateau: a 3.46 head kept
  straddling a third column and blew measured heightM to 2.9-3.45 (dims 0).
  The ~21 bridge columns therefore stay unmatched: side/front hull rows are
  structurally capped (~0-15).
- REGISTRATION POLLUTION COROLLARY (new): the bridge band shifts the
  side/front hull mean-dy registration by +0.16-0.20, and that frame is
  REUSED for the whole and turret rows — every turret/whole column carries
  a ~0.17 systematic offset (~-25 pts). turret_side ceiling ≈ 70-75 with a
  physically-true build; matching the polluted frame would need the tube at
  axis ~1.76 and the roof at 2.30 (a dims-breaking, score-chasing distortion
  — rejected per the m1a1_aim gunLength-6.15 precedent).
- Long oracle tube (6.22 vs published 5.71 muzzle): bounded whole-row cover.
Numbers (session start -> now): turret 31.2 -> 46.6 (plan 87.2 side 46.6 —
side is the polluted row), stations 29.1 -> 41.2, dims 98.9 -> 100 (mast
clamp + pintle/prow/rear-face fixes recovered hullLengthM/heightM),
hull/whole 0-9 (capped, registration-polluted), floaters 100.
