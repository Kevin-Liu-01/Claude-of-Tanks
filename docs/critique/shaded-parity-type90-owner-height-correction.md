# Type 90 owner-height correction — 2026-08-12

## Disposition

KEEP the repository-authored Type 90 after the owner's second live-silhouette correction and strict running-gear pass. The first pass compressed the turret body to 50% local Y and made it visibly too shallow. The owner then ordered it 50% taller. A final controlled section pass brings the connected body to 80% of the original authored local section: this preserves the requested large increase while closing the last side-view fidelity deficit. Every functional roof station is re-seated on the higher armor surface.

No reference mesh, source vertex payload, or source-backed runtime wrapper is used. The comparison asset remains a read-only visual oracle.

## Geometry changes

- The connected turret, cloth, glass, dark, and detail buckets now use 80% local height without changing their authored plan footprint.
- The gun remains through the established face datum; the taller connected cheek surrounds it without moving the muzzle or breaking elevation.
- Commander and loader cupolas, vision blocks, commander/gunner sights, periscopes, and the MG cradle retain normal component proportions on the raised roof.
- Direct-child MG, smoke-bank, decal, and antenna roots move upward with the cupola, flank, and collar datums.
- Mid-skirts share one outboard datum, and the wheel-bay shadow is explicitly running-gear-owned. No armor, trim, or shadow strip enters the native band or any individual shoe through the full strict sweep.

## Live evidence

- Fresh fidelity score: 92.22 overall, up from 86.95 before the owner raise; every machine-scored whole view is at least 90.53.
- Standard paired packet: 14 views plus the owner-standard elevated profile.
- Fresh final packet: 15 paired + 15 yaw 0° + 15 yaw 90° = 45 distinct PNG hashes, including the repeatable elevated-left profile.
- Elevated yaw evidence shows the gun, complete turret, roof sights, MG, smoke, and antennas rotating together while hull, skirts, deck, and running gear remain fixed.
- Fresh fixed visual vector is `[9.1,9.1,9.0,9.0,9.0,9.0,9.0,9.1,9.2,9.1,9.0,9.2,9.1,9.2]`, floor 9.0 and mean 9.08.

## Mechanical checks

- Turret-parent audit: 0 stranded, 0 abutting, 0 dangling.
- Model-rig probe: 10/10 checks pass.
- Winding audit: 0 reversed, 0 mixed; 0.03% right raster deficit with no visible wound; mode 1 and mode 2 clean.
- Strict track audit: band front/rear 0/0, shoes 0/0, full sweep 0/0.
- Muzzle-bore and all eight generated presentation assets pass currentness checks.
- Native-playable provenance audit: 108 battle playables, 0 GLB-sourced.
- Deterministic freeze reproduces twice at `d8f8a3a8` (53 rendered meshes / 67,557 vertices).

## Oracle-gate note

The legacy curve/component gate remains registration-sensitive for this comparison asset and now reports an honest diagnostic 27.5 (hull 88.4 / whole 56.0 / turret 43.7 / stations 27.5 / dimensions 64 / floaters 100). Its recovered mask still encodes the old lower turret and source component split, so chasing that row would directly undo the owner's explicit height correction. It is retained as red diagnostic evidence rather than treated as authority over the first-party build's 90.53 all-view floor, strict physical receipts, and fresh paired/yaw pixels.

## 2026-08-13 terminal-identity supersession

The accepted 0.80 turret section and all re-seated roof equipment remain
unchanged. This pass only restores explicit running-gear identity at the ends
of the native course: concentric front-idler and rear-final-drive faces now
occupy the established terminal carrier centers, outside the six road-wheel
cadence and inside the linked-shoe envelope.

Freeze `b77a57f6` reproduces twice at 54 meshes / 83,829 vertices. Fresh
evidence in `/private/tmp/modern-drift-final-r3/type90` contains 15 paired,
15 yaw0 and 15 yaw90 frames: 45 PNGs / 45 distinct hashes, no identical yaw
pair. Exact band, shoes and strict sweep remain 0/0; parent audit is 0/0/0;
winding is visually clean and the muzzle passes. Elevated profile, front and
close views show the front idler, six road wheels and rear final drive as
distinct assemblies in one continuous native course. The complete gun,
turret, bustle and roof suite perform a genuine quarter-turn over the fixed
hull and running gear with no floating or stranded fitting.

PASS / KEEP `b77a57f6`; retire `d8f8a3a8`.
