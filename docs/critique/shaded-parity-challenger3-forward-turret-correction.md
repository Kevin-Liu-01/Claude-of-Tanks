# Challenger 3 forward-turret correction — 2026-08-12

## Disposition

KEEP the repository-authored Challenger 3 after extending the connected fighting-compartment silhouette toward the mantlet. The old mesh had a long numerical envelope, but its broad crown and cheek mass collapsed into a paper-thin brow too early in the owner's elevated side/profile view.

The comparison model and owner screenshot are read-only visual/measurement oracles. Runtime geometry remains authored in `buildChallenger3`; no reference vertices, converted payload, or source-backed wrapper enter the playable model.

## Geometry correction

- The forward connected shell station moves from local z 0.88 to 1.22 m.
- Its outer wall, shoulder, and crown retain useful vertical section through the new station instead of collapsing to a thin triangular brow.
- The central armored throat and both lower cheek wedges continue forward to local z 1.70 m while leaving the center open for the existing mantlet/gun seat.
- The aft casting, bustle, ring, turret height, and gun run remain unchanged. No detached applique plate is used to fake turret length.

## Evidence

- Quantitative shaded fidelity: 92.9 overall; the harness reports every required view at or above 90.
- Standard final evidence: 14 paired + 14 yaw 0° + 14 yaw 90° = 42 distinct PNG hashes.
- Owner-standard elevated profile: 15 paired + 15 yaw 0° + 15 yaw 90° = 45 distinct PNG hashes.
- Elevated and top yaw pairs show the extended shell/cheeks, gun and mantlet, RWS/MG, hatches, optics, smoke/APS equipment, antennas, and bustle/rack rotating as one assembly.

## Mechanical checks

- Turret-parent audit: 0 stranded, 0 abutting, 0 dangling.
- Model-rig probe: 10/10 checks pass.
- Winding audit: 0 reversed, 0 mixed, 0 yaw-stranded candidates; the 33-pixel/0.05% front-left raster deficit has no visible wound.
- Hull, deck, skirts, six-wheel courses, and rear service field remain fixed through yaw.
- No attachment floats, clips through the gun seat, or separates at yaw 90°.

## Residual diagnostic note

The legacy curve gate reports 83.3 for turret-plan curves and 88.9 for stations even though shaded parity and every required view clear 90. Its largest residuals are in the older reference's aft/edge plan registration, outside this owner-directed forward-profile correction. The diagnostic is retained rather than hidden; live elevated-profile and yaw evidence are the acceptance authority for this targeted authored change.
