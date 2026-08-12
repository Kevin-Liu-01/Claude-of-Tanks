# Type 90 owner-height correction — 2026-08-12

## Disposition

KEEP the repository-authored Type 90 after the owner-directed turret-section correction. The previous live silhouette was approximately twice the requested turret-body height. This pass compresses the authored turret body to 50% in local Y, then rebuilds the functional roof station at full component height on the corrected roof.

No reference mesh, source vertex payload, or source-backed runtime wrapper is used. The comparison asset remains a read-only visual oracle.

## Geometry changes

- The connected turret, cloth, glass, dark, and detail buckets are scaled to 50% local height without changing their authored plan footprint.
- The gun pivot is re-seated through the corrected face instead of remaining at the previous tall-section bore line.
- Commander and loader cupolas, vision blocks, commander/gunner sights, periscopes, and the MG cradle are rebuilt at normal component proportions on the lower roof.
- Direct-child MG, smoke-bank, and antenna roots are moved onto the corrected cupola, flank, and collar datums.

## Live evidence

- Standard paired packet: 14 views.
- Standard final packet: 14 paired + 14 yaw 0° + 14 yaw 90° = 42 distinct PNG hashes.
- Optional owner-standard elevated profile: one additional paired/yaw view, producing 45 distinct frames without changing the immutable certification packet.
- Elevated yaw evidence shows the gun, complete turret, roof sights, MG, smoke, and antennas rotating together while hull, skirts, deck, and running gear remain fixed.

## Mechanical checks

- Turret-parent audit: 0 stranded, 0 abutting, 0 dangling.
- Model-rig probe: 10/10 checks pass.
- Winding audit: 0 reversed, 0 mixed; 0.11% rear-left raster deficit with no visible wound; mode 1 and mode 2 clean.
- Track corridor remains 0/0 at the front and rear terminals.

## Oracle-gate note

The legacy source-derived height and curve gate intentionally fails this owner override because it still expects the discarded tall turret envelope (published/oracle height 2.55 m versus the corrected live body envelope near 2.01 m). That receipt is retained as diagnostic evidence, not treated as authority over the explicit owner correction or the fresh paired/yaw pixels.
