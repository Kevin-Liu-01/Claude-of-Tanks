# M46 Patton — reference packet

Exact vehicle: **Medium Tank M46 Patton** — re-engined M26 with the
**90 mm M3A1** gun (bore evacuator + single-baffle muzzle brake) and the big
fender **mufflers**; distinctive **track tension idler** below/ahead of the
rear drive sprocket.

## Real dimensions (2+ sources)
- Length gun forward 333.6 in = **8.48 m** (hull ≈ M26's 6.33 m), width
  138.3 in = **3.50 m**, height 125.1 in = **3.16–3.18 m** over MG —
  [Wikipedia: M46 Patton](https://en.wikipedia.org/wiki/M46_Patton)
- [tank-afv.com M46](https://tank-afv.com/coldwar/US/M46_Patton.php) — same
  dims; "large mufflers on the fender and the … track tension idler wheel
  below the drive sprocket" distinguish it from the M26A1.
- [HMDB M46 marker](https://www.hmdb.org/m.asp?m=101172): L 8.48 m, W 3.51 m,
  H 3.18 m.
- M3A1 90 mm: bore evacuator near the muzzle, single-baffle brake.
- Suspension: 6 road wheels, 5 return rollers, rear sprocket, front idler,
  tension idler; turret = the M26 T26 casting (cupola right, .50cal pintle).
- Photos: [Wikimedia Commons: M46 Patton](https://commons.wikimedia.org/wiki/Category:M46_Patton).

## GLB oracle (width-normalized to 3.51 m; +z forward, y from ground)
`/models/tanks/community/recovered/m46_patton.glb` (Bergman pack, local-only).

- Hull: z −3.43 … +2.66 (6.09 m), base roof y ≈ 1.61–1.67 with the rear deck
  reading 1.69–1.78 from −0.9 rearward (mufflers/engine furniture), tail
  (−3.43, ~1.50 falling to 1.59 at −3.23); glacis knee (+2.15, 1.65) → toe
  (+2.66, ~1.15).
- Gun: emerges +2.34, **muzzle +3.45** (0.79 m past nose), tube plan 0.27,
  bulge 0.41 near +3.20 (evacuator/brake), tip 0.34 (single baffle). Authored
  low (band 1.03–1.37; sunken-turret defect, below).
- Upper mask envelope: plateau **2.25–2.33 over z −0.03…−1.63**, MG hump
  1.91–1.97 at −1.7…−1.85, tail 1.86–1.95 to −2.4, deck bits 1.84 at −2.9.
- Front view: spike to 2.33 at x −0.8…−1.2 (.50cal), center 1.74–1.89.

### Oracle defect
Same Bergman defect as m26/m45: **turret casting sunk into the hull** (ring +
crest + poked-through .50cal + low barrel). Procedural keeps a correct proud
T26-family turret sized to the envelope (roof 2.29), matches the hull/muffler
deck line and the gun overhang length/brake plan widths exactly.

## Build targets (procedural, world coords)
hull tail −3.43 / nose +2.66 / roof 1.66 / knee +2.15 / toe y 1.15; fender
mufflers (hull bucket) ±1.15, z −0.95…−2.95, top 1.78; 6 wheels r 0.33 span
−2.50…+1.80, sprocket −2.90, idler +2.20, tension wheel −2.55; turret ring
(−0.85, 1.66), dome HW 1.22, roof 2.29, front −0.03, bustle to −2.40 top 1.92,
stow to −2.95 top ≤ 1.85; .50cal at x −0.85 topping 2.33; gun axis y 1.92,
r 0.125, evac 0.80 (drum just behind brake), single-baffle brake, muzzle
+3.45.

**Oracle re-processed (repair_oracles.py): turret seated** — fused Turret node
lifted +4.2 model units onto the muffler-line deck, recentred +7.1 x, origin
on the ring axis. Sunken-turret defect above is historical.
