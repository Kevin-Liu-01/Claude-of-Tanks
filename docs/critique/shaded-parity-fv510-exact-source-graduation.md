# FV510 exact-source redesign — independent §B8 graduation verdict

Date: 2026-08-10

Candidate: `fv510` freeze `7884762a` (10 meshes / 86,486 vertices)

Oracle: repaired attributed `community/fv510_warrior.glb`

Gate: **93.2 PASS** (`93.2/93.2/98.2/100/100/100`), JSON SHA-256
`2f9b6bb3d19bdf95fde07822e196150f6a4799c8f4ab1ad62a549d66dd112dd5`

## Verdict: PASS

Standard-order vector (front, frontleft, left, rearleft, rear, rearright,
right, frontright, top, hero-frontleft, hero-rearright, hero-toptilt,
close-front, close-roof):

`[9.4, 9.5, 9.5, 9.5, 9.4, 9.5, 9.5, 9.5, 9.5, 9.6, 9.6, 9.6, 9.5, 9.5]`

Floor **9.4**, mean **9.51**. Every required view clears the 9.0 law.

The procedural hull, six-wheel running gear, tall troop body, side/rear slat
packages, RARDEN turret/gun, roof hatches/sight/antennas, rear doors and plan
footprint track the repaired GLB in every camera. Residual differences are
surface, camo and transparency treatment—especially wheels seen through side
screening—not geometry, silhouette, attachment or variant-identity defects.

Yaw/load paths **PASS 9.4**. At 90 degrees, the RARDEN, turret shell, gun,
sight pedestal, hatch/cupola furniture and turret-owned rails rotate as a
continuously seated assembly. Hull-owned deck/antenna furniture correctly
remains with the hull. No unsupported hardware, empty-air seam, detached
fitting, collision, occlusion failure or fixed duplicate turret mass appears.

All fourteen fresh 1280×640 paired views and current-byte yaw 0/90 views were
rendered from the root Vite listener. Console health was clean: zero warnings
and zero errors. No blocker or fix order remains.
