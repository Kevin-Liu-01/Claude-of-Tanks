# M47 Patton — reference packet

Exact vehicle: **90mm Gun Tank M47 Patton II** — M46 chassis with the new
long-nosed T42-derived turret: **needle-nose front, long rear bustle overhang,
stereoscopic M12 rangefinder blisters on both cheeks**, bow MG (last US tank
with one), 90 mm **M36** gun with the cylindrical blast deflector / muzzle
brake and small bore evacuator.

## Real dimensions (2+ sources)
- Overall length 27 ft 11 in = **8.51 m** gun forward; width 11 ft 6.25 in =
  **3.51 m**; height 11 ft = **3.35 m** —
  [Wikipedia: M47 Patton](https://en.wikipedia.org/wiki/M47_Patton)
- [militaryfactory M47](https://www.militaryfactory.com/armor/detail.php?armor_id=33)
  — L 8.51 m, W 3.51 m, H 3.35 m, 90 mm M36.
- Walkaround photo sets: [Maloney: M47 Patton (Military Museum of Southern New
  England)](https://www.williammaloney.com/Aviation/MilitaryMuseumOfSouthernNewEngland/M47PattonTank/index.htm)
  and [AAF Tank Museum M47](https://www.williammaloney.com/Aviation/AAFTankMuseum/USTanks/M47PattonTank/index.htm).
- Suspension: 6 road wheels, 5 return rollers (early pattern), rear sprocket,
  front idler, track tension idler; big fender mufflers like the M46.

## GLB oracle (width-normalized to 3.51 m; +z forward, y from ground)
`/models/tanks/community/recovered/m47_patton.glb` (Bergman pack, local-only).

- Hull: z −3.37 … +2.85 (6.22 m), roof 1.62–1.66 mid, rear deck 1.71–1.79
  (mufflers/furniture) from −0.7 rearward, tail (−3.37, 1.53); glacis knee
  (+2.33, 1.53) → toe (+2.85, ~1.15).
- Gun: emerges +2.66, **muzzle +3.37** (0.52 m past nose), tube plan 0.28,
  muzzle device plan 0.49–0.67 at +3.20…+3.33 (blast deflector). Authored low
  (band 1.06–1.36; sunken-turret defect).
- Upper mask envelope: tall plateau **2.48–2.55 over z +0.07…−1.55**, step
  2.12 at −1.55…−1.9, then a LONG low band 1.73–1.96 all the way to the tail
  −3.37 (the M47 bustle-overhang signature reads even through the defect).
- Front view: peak 2.55 at x −0.31…−0.83, shoulder 2.16 at x −0.96…−1.35
  (rangefinder blister line), right side ≤ 1.99.

### Oracle defect
Same Bergman defect: **turret sunk into the hull** (open ring, crest at deck,
.50cal poking through = the 2.48–2.55 plateau, barrel low over the glacis).
Procedural builds the correct proud M47 turret fitted to the envelope: roof
2.50, long tapered nose to +0.1, stepped bustle then rack overhang running to
−3.3 at the 1.75–1.95 band, blister bumps at both cheeks.

## Build targets (procedural, world coords)
hull tail −3.37 / nose +2.85 / roof 1.64 / knee +2.33 / toe y 1.15; mufflers
top 1.78 (−0.8…−3.0); 6 wheels r 0.33 span −2.55…+1.95, sprocket −2.95, idler
+2.30, tension wheel −2.60; turret ring (−0.70, 1.64), roof 2.50 over
+0.07…−1.55, HW 1.14, nose taper, bustle step 2.12 to −1.95, rack band 1.78–
1.95 to −3.30, blisters ±1.05 at y ~2.16, cupola x −0.55 top 2.58; gun axis y 1.66 (wave 2: mantlet-center mount per the shaded critique),
r 0.125, small bore evacuator, oblong twin-drum blast deflector ~0.55 plan,
muzzle +3.37.

**Oracle re-processed (repair_oracles.py): turret seated** — fused Turret node
lifted +4.0 model units (bustle rack lands in the 1.78-1.95 band), recentred
+6.3 x, origin on the ring axis. Sunken-turret defect above is historical.

## Round-3 mismatch log (shaded-parity-r2 turret rebuild, 2026-07-30)
Repaired-oracle re-measurement: ring (0, 1.64, −1.00); needle nose to +0.38
(pinched band 1.39…1.92 at +0.2…+0.5); dome widest ±1.13 over −0.6…−1.6 with
the roof plateau 2.50 over −0.5…−1.9; rear step ≈2.35, then the LONG bustle
band top ≈2.15–2.25 / floor ≈1.50 running to −3.41 (stowage bump 2.35 at
−2.5); blister shoulders ≈2.2 at ±0.9–1.0; cupola top 2.55 (right); M2 band
2.87…2.94 with the barrel forward to +0.1; gun axis y ≈1.60 (gun node 1.657
is the mount, not the bore); M36 device = evacuator band ±0.15 over
+2.6…+3.1 + a SHORT WIDE deflector ±0.34 at +3.2…+3.4, muzzle ≈+3.45.
Two scorer findings recorded for future waves: (1) the oracle's hull PLAN
ends ≈−3.2 under the bustle overhang while its side profile runs to −3.37 —
the procedural rear deck now stops at −3.20 with twin deck tongues to −3.36
so the top-view upper strip matches the oracle's sparse rack read; (2) the
top-view compare registers masks by CENTROID, so the rear strip must carry
the oracle's ~24% mass share or the aligned masks shear and the top view
collapses — this, not shape, was most of the "worst turret mask" residue.
Turret component 50 → 64 (front 77 / sides 69–70 / rear 72 / top ≈32; the
top view is capped by the oracle's open-interior and below-deck junk pixels
the full-width procedural hull cannot reproduce). Total 80.2 → 85.1.
