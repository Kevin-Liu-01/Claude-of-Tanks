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
