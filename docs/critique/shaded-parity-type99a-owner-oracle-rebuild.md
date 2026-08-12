# Type 99A owner-oracle rebuild — 2026-08-12

## Disposition

KEEP the rebuilt first-party Type 99A. The former live candidate had the wrong hull, turret, and running-gear geometry. The active playable now uses one repository-authored hull, a variable-height clipped-arrow turret loft, and the native linked-track system rebuilt around the source-measured six-wheel cadence.

The supplied `type_99a2_armored_warfare.glb` is a read-only visual and measurement oracle. It is not shipped, imported, wrapped, traced, or converted into a vertex payload. Every runtime triangle is created by our own `KIT` primitives, authored lofts, fittings, and linked-track code in `buildType99A`.

## Source component and station inventory

The oracle census was reduced to measurements and semantic stations before authoring:

- overall scene envelope: 3.705 m wide, 4.357 m high, 11.656 m long;
- principal hull island: z -3.592..+3.228 m, with fender islands reaching about -3.59/+3.46 m and only the thin supported recovery course reaching -4.242 m;
- six road-wheel centers per side: z `[2.266, 1.365, 0.464, -0.436, -1.337, -2.238]`, y 0.491 m, radius 0.405 m, x ±1.473 m;
- idler: z +3.069 m, y 0.919 m, radius 0.255 m; sprocket: z -3.066 m, y 0.903 m, radius 0.385 m;
- linked-course envelope: top y 1.276 m, bottom y 0.025 m, width 0.629 m;
- principal turret shell: x ±1.30 m, world y 1.44..2.55 m, local z -1.976..+1.750 m, with supported external equipment to about x ±1.75 m/local z -2.33 m;
- primary sight: x 0.706..1.205 m, world y 2.475..3.14 m, local z -1.016..-0.514 m;
- connected secondary stabilized station: world y to 3.49 m, with the thinner probe/whip courses above it;
- gun face: world z +7.414 m.

Those values are datums, not copied geometry.

## Authored geometry changes

- Replaced the tall, short, slab-like turret with one 13-station `polyMultiLoft`. A full-width structural shoulder turns through a stepped crown instead of stacking a cabinet on the ring.
- Rebuilt the arrow cheeks, mantlet seam, conformal ERA, smoke banks, optics, panoramic stations, hatches, MG, antennas, bustle bins, rails, and basket on visible armor roots, plinths, collars, or braces.
- Rebuilt the hull around the measured central tub/fender span, two-plane glacis, raised terminal shoulder bridges, thin source-width skirts, backed split transom, and supported rear recovery loop.
- Removed the inherited orange T-72-style unditching log that was absent from this oracle.
- Rebuilt the native running gear on the exact six-wheel station cadence. Visible terminal-wheel radii remain source-measured while a smaller hidden native track-wrap radius keeps the linked shoes inside the measured course ceiling and clear of the bow/stern structure.
- Restored source-like painted rear skirts, dark flexible fringes, exposed wheel cadence, centered driver station, deck/service grammar, and the full gun run.

## P95 normalization

Width is the normalization anchor. Hull-length comparison uses the 7.08 m thick-body span rather than letting a thin recovery cable become a hull block. Height comparison uses the connected 3.49 m stabilized-sensor station; thin whip tips are excluded from the P95 anchor but remain present in the live model. This changes comparison semantics only and does not scale or replace runtime geometry.

## Fresh visual evidence

- Standard paired packet: all 14 required source/procedural directions.
- Final packet: 14 paired + 14 yaw 0° + 14 yaw 90° = 42 PNGs / 42 distinct hashes.
- Owner-standard elevated profile packet: 15 paired + 15 yaw 0° + 15 yaw 90° = 45 PNGs / 45 distinct hashes.
- Automated shaded silhouette fidelity: 93.09 overall; minimum standard direction 90.77. Standard-direction scores are front 93.41, front-left 93.17, left 90.90, rear-left 92.25, rear 93.47, rear-right 91.84, right 90.77, front-right 93.00, top 95.65.
- Track silhouette fidelity: 94.74.
- Authoritative geometry gate: 90.8 PASS; dimensions 99; floater component 100.

The elevated side/profile view verifies the turret length and gun seating. In yaw 0°/90°, the gun, whole turret loft, cheek armor, ERA, smoke banks, sight cabinets, hatches, panoramic stations, MG, antennas, rear bins, basket, and rails make the same quarter-turn. The glacis, engine deck, skirts, transom, recovery loop, wheels, and tracks remain fixed.

## Geometry, ownership, and physical gates

- Exact track audit: band front 0 / rear 0; linked shoes front 0 / rear 0.
- Model-rig probe: 10/10 checks pass.
- Winding audit: 0 reversed, 0 mixed, 0 suspect call sites. The nine-pixel/0.01% rear-quarter raster difference has no visible open face or silhouette wound.
- Parent audit reports one broad `hullDark` overlap candidate. Fresh top, roof, rear, and elevated yaw evidence proves it is legitimate hull-owned engine-deck/transom/service geometry: it remains fixed while the complete turret departs and keeps continuous hull support.
- Winding mode 2 likewise reports fixed `rig_hull` mass inside the swept ring zone. The candidate is the same continuous engine-deck/service field, not turret-semantic equipment. It is visibly exposed intact at yaw 90° and is therefore adjudicated as a correct hull split, not stranded mass.
- The intentional open rear basket is supported by longitudinal rails, transverse ties, and returns into the bustle. Its negative space is not a missing face.

## Remaining difference

The first-party surface treatment is deliberately more procedural than the commercial oracle, particularly in rear micro-detail and the exact casting texture. The full hull, turret, gun, track, station, ownership, and attachment silhouettes nevertheless clear the mandatory 90 threshold in every measured direction without using any source mesh data at runtime.
