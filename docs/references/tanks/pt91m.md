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
