# Type 90 owner-height correction — 2026-08-12

## Disposition

KEEP the repository-authored Type 90 after the owner's second live-silhouette correction. The first pass compressed the turret body to 50% local Y and made it visibly too shallow. This pass raises that corrected body by 50%, to 75% of its original authored local section, then re-seats the functional roof station on the higher armor surface.

No reference mesh, source vertex payload, or source-backed runtime wrapper is used. The comparison asset remains a read-only visual oracle.

## Geometry changes

- The connected turret, cloth, glass, dark, and detail buckets now use 75% local height without changing their authored plan footprint.
- The gun remains through the established face datum; the taller connected cheek surrounds it without moving the muzzle or breaking elevation.
- Commander and loader cupolas, vision blocks, commander/gunner sights, periscopes, and the MG cradle retain normal component proportions on the raised roof.
- Direct-child MG, smoke-bank, decal, and antenna roots move upward with the cupola, flank, and collar datums.

## Live evidence

- Fresh fidelity score: 91.32 overall, up from 86.95 before the 50% raise; standard-view floor 89.77.
- Standard paired packet: 14 views plus the owner-standard elevated profile.
- Fresh final packet: 15 paired + 15 yaw 0° + 15 yaw 90° = 45 distinct PNG hashes.
- Elevated yaw evidence shows the gun, complete turret, roof sights, MG, smoke, and antennas rotating together while hull, skirts, deck, and running gear remain fixed.

## Mechanical checks

- Turret-parent audit: 0 stranded, 0 abutting, 0 dangling.
- Model-rig probe: 10/10 checks pass.
- Winding audit: 0 reversed, 0 mixed; 0.06% rear-left raster deficit with no visible wound; mode 1 and mode 2 clean.
- Native-playable provenance audit: 108 battle playables, 0 GLB-sourced.
- Track topology is unchanged by this turret-only correction; terminal-clearance work remains with the dedicated tracks/physics task.

## Oracle-gate note

The strict curve gate remains registration-sensitive for this comparison asset, but the live silhouette now reaches 2.44 m overall versus the 2.60 m oracle envelope and visually preserves the requested 50% increase. The receipt is retained as diagnostic evidence rather than treated as authority over the explicit owner correction and fresh paired/yaw pixels.
