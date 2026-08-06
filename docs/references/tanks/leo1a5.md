# Leopard 1A5 (`leo1a5`) — family-influence oracle packet

Spec home: src/vehicles/modern2.js (dims 7.09 / 9.54 / 3.37 / 2.62).
Build: buildLeo1A5 (modern2), pre-oracle era. Family guidance (owner
2026-08-06): leo1a5 takes inspiration from the leopard1 family.

## LEOPARD 1A4 PHOTOGRAMMETRY SCAN (2026-08-06 base-21 wave — report-only)
"Leopard 1A4 [photogrammetry scan]" by pervonharke, CC-BY-4.0 verified —
`community/leopard_1a4_photogrammetry_scan.glb` (56 MB, 1,085,034 verts
/ 583,305 tris, 17 mesh chunks named `Stereo textured mesh`, unlit
photogrammetry texture). The 1A4 shares the 1A5's hull/turret lineage
(welded turret family) — banked as leo1a5 build INFLUENCE. Extract
committed: docs/references/vertex/leo1a4_scan.json (vertex REG id
`leo1a4_scan`, fixedMount whole-box — no turret node exists in a scan;
NOT in any harness map).

### The scan is NOT oracle-grade as-is (accessor-outlier crush, §E class)
- The accessor min/max corner box spans ~2.5x the visible tank along
  the length axis (raw bbox 586 x 321 x 1000 units) — photogrammetry
  OUTLIER POINTS far from the vehicle inflate it. Loader-parity
  normalization (which trusts accessor boxes, GLTFLoader semantics)
  therefore CRUSHES the visible tank to ~39% scale: every mask dim
  reads -57..-62% (overall 3.74 vs the 9.54 target it was scaled to).
  The same crush would hit the runtime loader and every harness — DO
  NOT register this print in any map until a §E repair strips the
  outliers and rebuilds accessor min/max (orchestrator lane).
- The VISIBLE geometry itself is proportionally trustworthy: body
  height / width = 0.783 vs published 0.777 (2.62/3.37) — sub-1%
  agreement. Station widths across the body (crush-scale): 1.30-1.42
  wide over stations 0-10 with the gun spike at stations 11-13 —
  a clean single-vehicle scan (no ground plane in the mask; the
  outliers are sparse points, not terrain).
- Length reads short of published even proportionally (overall/width
  2.61 vs 2.83 published): muzzle-end truncation in the scan is likely
  — verify before using it as a length authority.

### What the leo1a5 lane can use TODAY (influence, not gate)
Curve/station data in the extract for the welded-turret grammar, wheel
spacing, and the 1A4/1A5 turret-face read; photos remain the primary
photo-class source. If the §E outlier-strip lands, re-extract and
re-evaluate as a real leo1a5-family oracle candidate (the 1A4/1A5
turret differences — B&V add-on armor, EMES-18 vs the 1A4's EMES-12A1 —
must be priced as parity deviations, never chased).
