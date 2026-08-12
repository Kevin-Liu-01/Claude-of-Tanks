# AMX-40 forward-turret correction — 2026-08-12

## Disposition

KEEP the repository-authored AMX-40 after extending the connected turret silhouette forward. The previous builder had already lengthened the overall turret, but the actual cheek/crown loft still stopped too close to the gun seat in the owner's elevated side view.

The comparison GLB is used only as a read-only visual and measurement oracle. Runtime geometry remains authored in `buildAMX40`; no source vertices, converted mesh payload, or source-backed wrapper are present.

## Geometry correction

- Forward center and outboard stations of the 20-point turret loft move 0.20–0.32 m forward.
- The change carries the lower shoulder, intermediate cheek, crown, weld seams, and armor skin together rather than translating the barrel or adding a detached nose plate.
- Forward flank cassettes and asymmetric cheek ties are lengthened into the new connected shoulder so the added silhouette has visible structure and no open seam.
- Aft turret stations, turret ring, turret height, bustle, and gun run remain unchanged.

## Evidence

- Quantitative shaded fidelity: 94.2 overall; the harness reports every required view above 90.
- Standard final evidence: 14 paired + 14 yaw 0° + 14 yaw 90° = 42 distinct PNG hashes.
- Owner-standard elevated profile: 15 paired + 15 yaw 0° + 15 yaw 90° = 45 distinct PNG hashes.
- The elevated yaw pair shows the extended cheek/crown, mantlet, gun, cupolas, optics, MG, smoke banks, antennas, flank bins, and rear turret package rotating as one assembly.

## Mechanical checks

- Model-rig probe: 10/10 checks pass.
- Winding mode 1: 0 reversed, 0 mixed, 0 missing pixels.
- The mode-2 raster candidates are the fixed rear engine plateau and its louvre/detail courses at world z -3.29..-2.30; yaw pixels show a continuous hull-owned deck after turret departure. They are legitimate hull geometry, not stranded turret equipment.
- Parent-audit nominees `fitting_spareTrackLinks`, `hullGlass`, and `fitting_towCable` remain fixed on visible hull/deck seats and have no turret semantics.
- Six native wheels and one linked course retain coherent terminal transitions with no visible collision.

## Residual gate note

The older curve/station geometry gate remains below threshold because its reference registration and published-dimension assumptions predate the owner's silhouette correction. Fresh shaded parity and yaw evidence are the acceptance authority for this targeted change; the failing diagnostic is retained rather than hidden.
