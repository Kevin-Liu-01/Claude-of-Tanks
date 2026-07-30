# M1A2 Abrams SEPv2 — reference packet

Variant: M1A2 SEPv2 — CROWS II station (tall mast), otherwise SEP-family roof;
M256 L/44; deep skirts.
Sources: GlobalSecurity (https://www.globalsecurity.org/military/systems/ground/m1-specs.htm),
Wikipedia M1 Abrams (https://en.wikipedia.org/wiki/M1_Abrams),
armyrecognition M1A2 (https://www.armyrecognition.com/military-products/army/main-battle-tanks/main-battle-tanks/m1a2-abrams-main-battle-tank).

## Local GLB oracle
`/models/tanks/community/recovered/m1a2_sepv2.glb` (m_bergman pack), yaw 180,
turret `^Turret$` + follower list, gun `^misc_b$`.
Scoring frame (ground 0):
- hull: z −3.32…3.32 (6.64 — short), deck 1.26 (z 3.2) → 1.40…1.47 (mid),
  rear deck 1.64…1.76 (z −2.5…−3.4). Belly ≈ 0.30. Skirts to ≈ 0.0 (ground
  brushing) mid-run; nose bottom rake (3.5, 0.85) → (2.6, −0.02); tail rake
  (−2.4, 0.11) → (−3.4, 0.65).
- SPLIT QUIRK: part of the upper works does NOT follow the yaw node and lands
  in the hull mask: a commander pedestal hump z −0.4…0.3 up to y ≈ 2.79 and a
  rear rack z −0.6…−2.2 up to y ≈ 2.23 (x ≈ ±1.55).
- yawing turret shell: x ±1.55, z −2.77…1.98 world, y 1.38 up to roughly 2.4
  roof; CROWS II mast + antennas to y ≈ 3.6–3.9 near (x −0.5…−1.0).
- gun: mesh y 1.17…2.20 (visual axis ≈ 1.68), muzzle z 4.85.

## Procedural strategy
Mirror the split: static hull-bucket pedestal + rear deck rack at the stations
above (they read as deck furniture), yawing turret shell + CROWS II mast in
the turret buckets, low gun axis, muzzle 4.85.

## Mismatch note
The oracle's own turret split is partial (recovered asset); a perfect turret
component score is capped by whatever follower list modelLoader applies.

## Outcome (final lab state)
Baseline 66.2 (H73 T39 G60 R71) -> 74.4 (H82 T55 G75 R78).
Mirrored: static commander pedestal + rear deck rack in the hull mask,
stepped turret (tall front block / low saddle / separate rear stowage box),
CROWS II mast at the rear-left, broad rotor-shield mantlet (kept inside the
hull-length bound so the gun-overhang mask stays a clean tube).
Residual gaps: the asset's turret follower split leaves parts of the shell
in whichever mask modelLoader's follower regex assigns them, and its widest
point (one-station protrusion) narrows the whole reference body after width
normalization — the uniform-width procedural reads ~4% wide against it in
plan. Both are recovered-asset quirks, not geometry choices.
