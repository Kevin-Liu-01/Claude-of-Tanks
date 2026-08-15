# K1A1 raised-terminal track profile — verification (2026-08-15)

## Scope

Only the first-party K1A1 terminal running-gear stations change. The front
idler and rear final drive rise above the road-wheel centerline while the six
road wheels, suspension travel, covered support rollers, hull, skirts,
mudguards and turret remain unchanged.

## Rendered evidence

- Baseline left profile: `/private/tmp/k1a1-track-before-left.png`.
- Corrected left profile: `/private/tmp/k1a1-track-final-left.png`.
- Corrected right profile: `/private/tmp/k1a1-track-final-right.png`.
- Both corrected profiles show a long loaded ground run with distinct rising
  terminal transitions instead of the retired rectangular loop.

## Mechanical receipts

- Exact band audit: **front 0 / rear 0**.
- Exact individual-shoe audit: **front 0 / rear 0**.
- Complete strict sweep: **0 / 0**.
- Duplicate-track audit: **PASS**, one integrated animated course.
- Winding mode 1: **PASS**, zero reversed or mixed meshes.
- K1A1 presentation, silhouette, armor, hit-zone and module assets regenerated.

## Frozen geometry

- Freeze: `642e144c`.
- Instance freeze: `5c64a0c8`.
- Asset geometry: `c868def5`.
- 62 rendered meshes / 73,888 vertices.

Disposition: **KEEP**. The K1A1 now has the intended raised-terminal track
silhouette without subtracting or relocating any exterior armor.
