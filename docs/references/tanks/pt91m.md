# PT-91M Pendekar (`pt91m`)

**Exact variant modeled:** PT-91M Pendekar (Malaysia, 2000s) — Polish T-72M1
deep upgrade: ERAWA-1/2 flat ERA tiles over glacis/turret/skirt fronts,
2A46MS gun, SAVAN-15 sight, distinctive tall met mast on the turret rear and
large rear turret basket; big engine-deck stack (S-1000R powerpack).
NOT a Russian T-72B (different ERA type — flat square ERAWA tiles, not K-1
bricks) and NOT the Polish base PT-91 Twardy.

## Corroborated dimensions

| Measure | Value | Sources (2+ independent) |
|---|---|---|
| Hull length | 6.86 m (T-72M1 hull ~6.86–6.95) | en.wikipedia.org/wiki/PT-91_Twardy; army-guide.com/eng/product3431.html |
| Overall length (gun forward) | ~9.53 m | en.wikipedia.org/wiki/PT-91_Twardy |
| Width | 3.59 m (PT-91M with side skirts ~3.7) | en.wikipedia.org/wiki/PT-91_Twardy; army-technology.com twardymainbattletank |
| Height | 2.19 m roof | en.wikipedia.org/wiki/PT-91_Twardy |
| Gun | 2A46MS 125 mm (Slovak ZTS), tube 6.0 m, mid evacuator, sleeve | army-guide.com/eng/product3431.html; en.wikipedia.org/wiki/2A46_125_mm_gun |
| Road wheels | 6 T-72 pattern wheels, rear sprocket, rubber skirts with ERAWA on forward third | en.wikipedia.org/wiki/PT-91_Twardy |

## Identity cues

- Turret: T-72 low dome carrying flat square ERAWA tiles across the whole
  front arc; big pipe-frame stowage basket wrapping the rear; tall
  meteorological mast on the bustle; OBRA laser-warning corner sensors.
- Mantlet/gun: 2A46MS with sleeve; WW-2 smoke banks angled on both cheeks.
- Hull: ERAWA raft on glacis; tall engine-deck rear stack (upgraded pack)
  ~1.9–2.1 m; skirts full length.
- Running gear: standard T-72 6-wheel set.

## Reference links (links only)

1. https://en.wikipedia.org/wiki/PT-91_Twardy — family data (CC BY-SA)
2. http://www.army-guide.com/eng/product3431.html — PT-91M specifics
3. https://www.army-technology.com/projects/twardymainbattletank/ — dims
4. https://www.army-guide.com/eng/product.php?prodID=3862 — ERAWA ERA

## Local GLB oracle notes

Path: `public/models/tanks/community/recovered/pt91m.glb` (misc_a turret /
misc_b gun, gun authored −z; the fidelity tool flips it before scoring).
Width-normalized (3.59 m) probe, flipped to +z-forward convention:
- whole 3.59 × 3.82 × 10.42; hull ±3.83 (7.67), glacis nose ≈ 1.35, deck
  rises rearward 1.51→1.70, tall REAR stack y→1.9–2.07 near z −3.0…−3.7;
  halfW 1.59–1.79.
- turret: dome z −1.53…+1.65 (plan ~3.2 deep), halfW 1.61–1.62 (3.23 m),
  roof 2.64–2.75, met mast to 3.82 at bustle (z ≈ −1.0 rel pivot), basket
  halfW ~0.9–1.0 to z −1.4.
- gun: muzzle-to-pivot ≈ 6.52, overhang beyond hull nose 2.75, fat sleeve
  r ≈ 0.23; axis y ≈ 1.88.
- rig: fully segmented (turret + gun nodes).
Oracle defects: model proportionally tall (scale 1.34 after width norm).

## Mismatch log

| Date | total | minView | hull | turret | gun | tracks | change |
|---|---|---|---|---|---|---|---|
| 2026-07-30 | 70.5 | 75.8 | 82 | 41 | 60 | 87 | baseline (t72b3 donor + small kit) |
| 2026-07-30 | 77.5 | 77.3 | 83 | 57 | 87 | 78 | donor->standalone: hull 7.67 roof 1.52, dome 3.15x3.10 h1.10 + flat crown cap, ERAWA tile arcs, met mast, basket, tall rear powerpack stack, 6.05 m gun |
| 2026-07-30 r2 | 79.2 | — | 85 | 58 | 91 | 79 | shaded r2: ERAWA tile field + corner chevrons, met mast full height + sensor cross, louvered powerpack stack, rear drums added, basket mesh face, evac, NSVT |

r3 (shaded-parity r2 items): 79.2 → 79.3. ERAWA tile FIELD (3 rows x 5 tiles per cheek,
steel-dark, seated on the dome skin — r2 rows above the first were buried) + corner
chevron stacks re-seated; evacuator w/ dark seam rings in a 0.61 m gap; skirts
fender-lip→axle, rollers lowered (rust-band cover).

r4 FROM-SCRATCH rebuild (2026-07-31, profiles/pt91m.json): 79.3 -> 81.1 (H85->84 T59->67
G91->89 R79->80, minView 80.1). Lofted hull at the measured tall deck (1.80) with the
two-step Malaysian powerpack hump (±0.9 wide — the old build made it full width) and high
overhanging tail; ERAWA-1 tile fields on glacis + cheeks, ERAWA skirt plates at the measured
±1.795 front course; dome crown 2.33 at center 0.18; 2A46MS to the measured contour (sleeve
r.122, muzzle 6.58, axis 2.008). WIDTH GUARD lesson: the first pass overshot the normalized
width by 6 mm and safeScale sank every authored height ~0.6% — an exact-width anchor stud now
pins procScale to 1.0 (applied family-wide). A trial parenting of the skirt course into the
turret (suspected misparent) scored WORSE and was reverted — this print's skirts are hull-side.

## Geometry-gate v6 certification (2026-07-31, gate 8d552c2, dims-first rebuild r5)
Final v6 row: hull 44.3 whole 23.3 turret 33.1 stations 8.0 dims 98.9 floaters 100
Dims vs published: heightM 2.18 hullL 6.91 overall 9.49 width 3.63 - all within grace but width (-1.14%, -1.1 pts).
Oracle audit (v6 true cameras, width-normalized frame): safeScale 1.341 print: height +24.4% (2.725), hullLength +11.0% (7.617), overall +9.4% (10.429).
Certified oracle-defect caps (component | ceiling | cause):
- wholeCurves | ceiling ~24-35 | stature/length defect vs published-pinned build (the r5 floater fix also re-seated the pano/OBRA/mast furniture the print carries 0.5-1.6 m higher)
- stations | ceiling ~8-25 | roof topPct 12-20% on the turret slices from the +24% stature defect
- hullCurves | ceiling ~45-60 | length defect concentrated at both hull ends
- turretCurves | ceiling ~33-45 | print turret towers (Sosna/pano to 2.9-3.7) vs published 2.19 roof
A cap never excuses dims: every dim other than the certified widthM bias is inside the 1% grace (see row above). Build is dims-first: published spec.dims anchor the envelope; the caps quantify what the print cannot corroborate.
