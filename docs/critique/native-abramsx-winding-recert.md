# AbramsX first-party winding re-certification

Date: 2026-08-12

Frozen candidate: `976a1370` (77 meshes / 162,506 vertices)

Disposition: **PASS / KEEP**

## Authored update

AbramsX continues to use the repository-authored `buildAbramsX`. The private
Mortavex GLB is comparison-only. An AbramsX-local outward-order guard corrects
the mirrored lower-bow facets, central keel recesses, XM360 tunnel jambs and
both open D-hood sight cheek pairs. Positions and dimensions are unchanged;
the update repairs triangle order rather than copying or reshaping toward the
oracle.

## Receipts

- Deterministic freeze `976a1370` x2.
- Procedural fidelity 94.29, minimum view 93.99; overall 95.56, hull 96.15,
  turret 92.13, gun 89.05 and tracks 96.25.
- Geometry gate 90.4: 90.4/90.6/91.0/93.4/99.8/100.
- Winding 0 reversed / 0 mixed, improved from 8 reversed. The 10-pixel top
  difference is stable and has no visible open sheet or silhouette wound.
- Parent 0 stranded / 0 abutting / 0 dangling; contiguity 0; `mg1+5d`;
  muzzle bore PASS.
- Native course remains within its certified loaded-contact class: band
  37/26 and shoes 10/0, no blind spot and no visible penetration.

The final packet at `/tmp/critic-abramsx-native-final-r2/abramsx` contains 42
PNGs with 42 distinct hashes. Fresh fixed vector:
`[9.4,9.5,9.4,9.3,9.3,9.4,9.4,9.5,9.6,9.6,9.5,9.7,9.6,9.7]`, floor
**9.3**, mean **9.49**. Yaw is a genuine quarter-turn. The complete turret,
gun, RWS, sights, smoke, antennae and roof package rotate together over the
fixed hull and native seven-wheel course. All equipment retains a visible
seat, bracket, plinth or collar; no fused duplicate, stranded fitting or
empty-air decoration appears.

**Final verdict: KEEP `976a1370`.**
