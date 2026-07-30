# Leopard 2 Revolution (`leo2_revolution`)

**Exact variant modeled:** KMW Leopard 2A4 "Revolution" / MBT Revolution
demonstrator (2010) — 2A4 with the IBD/Rheinmetall AMAP passive composite
package: full faceted turret module cladding, modular hull-side courses,
bow appliqué, roof RWS station, retains the 120 mm L/44.

## Corroborated dimensions

| Measure | Value | Sources (2+ independent) |
|---|---|---|
| Hull length | 7.72 m (2A4 hull) | Wikipedia Leopard 2, army-guide product149 |
| Overall length (gun forward) | 9.97 m (L/44) | Wikipedia Leopard 2 (2A4), tank-afv Leopard 2 |
| Width (over AMAP courses) | ~4.0 m | spec row; fighting-vehicles.com Leopard 2 Evolution (wider over modules) |
| Combat weight | 60 t (vs 56.6 t 2A4) | armoredwarfare.com Revolution article, military-today MBT Revolution |
| Gun | 120 mm Rh L/44, tube 5.28 m | armoredwarfare.com Revolution, Wikipedia Leopard 2 |
| Running gear | 7 dual road wheels, rear sprocket | Wikipedia Leopard 2 |

## Identity cues

- Turret: the A4 box vanishes under FULL-DEPTH faceted AMAP cheek + bustle
  modules — flat angular panels with visible course seams, plan-view pointed
  nose, flat top; raised commander RWS station on the roof; rear stowage
  basket + slat course across the bustle.
- Hull: modular AMAP side courses (segmented, slightly splayed), bow appliqué
  wedge over the glacis, urban kit; L/44 keeps the overhang SHORT (~1.5-2 m).
- No wedge-shell gap like A5+ — the AMAP front is a closed faceted mass.

## Reference links

1. https://armoredwarfare.com/en/news/general/development-leopard-2-revolution — package description
2. https://fighting-vehicles.com/tanks/leopard-2-evolution/ — AMAP module layout
3. https://www.militarytoday.com/tanks/mbt_revolution.htm — MBT Revolution data

## Local GLB oracle notes

Path: `public/models/tanks/community/recovered/leo2_revolution.glb`
(recovered, yawOffset π). Width-normalized probe (ground = 0 after +0.06
shift):

- hull z −4.89..+3.45 — the rear −4.9..−4.2 stretch is a rear slat/stowage
  course (bottom 0.3-1.0, top 1.8-2.3), the true rear wall is ≈ −4.2; a thin
  gun-clamp rod at y 1.99 z 2.9-3.45 lives in the hull node (crops the gun
  overhang window at 3.45).
- side modules: hull mask tops 2.11-2.30 through the whole midship (tall AMAP
  side courses well above a bare 2A4 deck), rear posts 2.30-2.45 at −3.8..−3.6.
- glacis/bow: 2.08@1.95 → 1.99@2.5, bow appliqué shelf flat y≈1.99 to z 2.8,
  plan nose taper: ±2.0 to z 1.05, ±1.8 to z 2.6, ±1.2 @ 2.8.
- turret: refUpper roof band 2.24-2.48 (z −1.6..+0.4), wedge nose falls
  2.30@0.1 → 2.10@1.25 (front tip z≈1.4); rear station 2.76-2.90 (z −3.0..
  −1.8) peaking 3.10@−3.05 (RWS/mast); basket to z −3.47; antenna 4.09.
- turret width (front view upper): ±1.65; rear view upper ±1.75.
- gun: axis y≈1.90, muzzle z 4.95 (1.5 m past the bow shelf) — L/44 over the
  long AMAP bow; tube Ø≈0.19.
- tracks: bottom −0.02, wheels behind segmented skirt courses.

## Mismatch log (before → after per fidelity iteration)

| Date | total | minView | hull | turret | gun | tracks | change |
|---|---|---|---|---|---|---|---|
| 2026-07-30 | 70.6 | 78.1 | 83.5 | 42.0 | 48.5 | 81.1 | baseline (donor leo2a4 canonical + AMAP slab kit) |
| 2026-07-30 | 78.8 | — | 85.0 | 54.0 | 88.0 | 84.0 | r1: bespoke build — AMAP side courses, bow appliqué shelf, faceted closed turret, rear slat course, L/44 at the print's 4.89 muzzle |
| 2026-07-30 | 80.4 | 82.6 | 87.0 | 55.4 | 88.6 | 88.2 | r2: gear on the print's rear-set wheelbase, stepped rear RWS station sloping up to the −2.9 peak, travel-clamp rod on the bow (aligns the gun-overhang crop), module tops to the print line |

Gun channel fluctuates 79-89 between runs (thin-tube mask alignment noise);
totals quoted from the final full run. Shaded-parity notes
(boards/leo2_revolution.png): AMAP course seams, slat course standing off the
tail on brackets, raised RWS station with glass optic, sealed mantlet at
−9/+20, zero floaters on the turntable.
