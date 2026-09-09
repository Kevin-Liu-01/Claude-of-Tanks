# Abrams idler crown and low-detail wheel budget

The fleet optimization exposed a genuine rotating-idler regression: a
20-sector crown deviated by about 2.55 mm at the held-out pose, exceeding the
existing **1 mm** source tolerance. This was not an allowed root-height shift.

The replacement uses the shared cyclic stitched-annulus primitive: only the
two outside crown rings have 40 sectors; the interior rubber stations retain
their prior density. All seams are real shared edges of closed, outward stock.
The arbitrary-angle analytic sag bound is 0.976418 mm. Native rays every
half-degree on both idler halves at both detail levels confirm that bound.

To keep the fixed budgets, LOW pressed steel webs coalesce the small 8 mm
radial lip step. The entire pressing remains within the prior 4.2 mm
bidirectional sampled-surface tolerance (observed maximum 3.895746 mm).
HIGH road-wheel tire and steel buffers, and LOW road-wheel tires, stay exact.

| Complete primitive | High triangles | Low triangles |
| --- | ---: | ---: |
| Paired idler, hub and spindle | 1,904 | 1,016 |
| Paired road wheel, including axle | unchanged | 712 (previously 760) |

The 14 road wheels and two idlers together save another 320 LOW triangles
per Abrams tank, after paying for the improved end-wheel crowns. This is a
primitive calculation; the final input-stable fleet census remains required.

Passed: `stitchedGearStock.selftest.mjs`,
`abramsSourceXWheelQuality.selftest.mjs`, and the unchanged
`abramsSourceXEndGear.selftest.mjs` source109 hub/guide/crown checks in separate
and batched high/low native builds, before/after rotation, plus full-circle
rear-band clearance. Shoe contact, terrain, and whole-fleet release are
separate gates and are not certified by these idler results.

