# merkava3d shaded-parity r9 — independent critic verdict (2026-08-03)

Rig: fresh 14 pairs `node tools/tmp-tank-critic.mjs --id=merkava3d` →
shots/critic-merkava3d/ (10:37, zero console errors). Profile
src/vehicles/profiles/merkava.js md5 223f29a4 byte-identical before/after
render — no sibling interference, no 3d gate anomaly. ITU-601 via
tools/tmp-r7-merkava.py (ref x0..639 / proc x640..1279, bg 0x151b20);
framings verified 1-6px on all anchor views (rear 478/480w, top exact,
left 550/550, hero-rr 538/539). All numbers below re-run on THESE pairs.

## HEADLINE: FAIL — floor 8.6, mean 8.78 (r8 was all-8.5; fourth rise, gate needs >=9.0 every view)

front 8.8 · frontleft 8.9 · left 8.8 · rearleft 8.7 · rear 8.7 ·
rearright 8.7 · right 8.8 · frontright 8.8 · top 9.0 · hero-fl 8.6 ·
hero-rr 8.8 · toptilt 8.9 · close-front 8.8 · close-roof 8.6

## r9 claims audit (five checked, one not reproduced)

1. Dead-rear center p5/med — **VERIFIED**: my window view-rear x240..400
   y300..355: proc p5 72.7 / med 94.4 vs ref p5 85.6 / med 94.5 (builder
   74.0/94.1/94.5). The r8 open-scaffold inversion is gone; band interior
   is med-parity.
2. Top vane band pale fill — **VERIFIED**: view-top x210..430 y50..78
   proc med 88.0 vs ref 83.2 (pale class, was the dark comb).
3. Crate band air parity "35.6 vs 34.4" — **NOT REPRODUCED** at the
   dead-rear crown in any bracket (window unbanked → contradiction #1):
   x160..480 y195..232 ref 87.2% vs proc 66.7%; y200..240 77.8 vs 50.8;
   y210..250 61.6 vs 26.3. See defect C.
4. Re-anchored backer sliver / no floating panels — **VERIFIED**: swept
   all 14 pairs at zoom; no floating pale panel anywhere.
5. Shelf runs at certified tops — **VERIFIED** both sides (thin plates +
   pale legs on the falling band, view-right x470..600 y280..360 crop).

r8 orders executed: rearTip rail pale-refund **LANDED** (view-left tail
x46..100 y255..330 proc block med 94.1 vs ref 97.3, view-right 81.7 vs
85.0 — was −35/−37). Corner air roughly doubled (18.0% → 27.5-32.0%).

## Defects (all with banked windows)

**A. WARM-HUE MATERIAL, proc-only (7+ views).** The hatch-ring tori +
seam rings render mauve-brown, plus warm rim rails/caps and one top bar;
ref decks are hue-uniform olive. Warm census (R>G+3, R>55, deck views):
close-roof ref 116 vs proc 1396 (rings, clusters x480..560 y280..320);
view-top ref 17 vs proc 419 (bar at x260..370 y94..104: RGB (91,87,78)
vs field (88,89,74)); hero-rr corner rails ref 0 vs proc 229 (x515..593
y270..344); view-front turret zone ref 7 vs proc 346 — the two ring rims
read as MAROON ELLIPSES riding the roofline at y180..210.

**B. Wing-rack dark under-rim bars (dead-rear + both quarters).** The r8
dark-overshoot class recurring on unrefunded members (r8 shared law:
pale-refund EVERY new thin member by default). view-rearleft x70..210
y340..354: proc p5 56.3 (cells 45.9) vs ref p5 102.6 in a pale strip;
view-rearright x430..570 y340..354: proc p5 51.3 vs ref 79.0; view-rear
x150..295 & x345..490 y382..392: proc p5 56.0 vs ref 82.5/77.6.

**C. Dead-rear crown parapet vs ref broken skyline.** Proc top edge
x170..464 is one solid run (only 2 breaks ≤2px) riding 15-25px higher
through center (tops 204-218 vs ref 232-243); ref skyline has 12+ sky
gaps (2-25px) behind kit spikes. Crown air x160..480 y195..232: ref
87.2% vs proc 66.7%. Root is twofold: the six kit-wall heaps form a
continuous wall, AND the 0.08-elevation cam projects the near-common
roof-band tops (plinth 2.615 / furniture 2.617 / kitCap 2.64 / cupola
block 2.645) over the rear band as one ruled parapet (the r4
elevated-cam crown law; x-lane dips are the prescribed, refund-class fix).

**D. Rear-face panel polarity inverted.** Ref wing-rack rear faces are
PALE-textured mesh (x150..295 y385..480: p95 106.2, sd 5.36, only 25
sub-70px); proc faces are flat-94 with dark frames (p95 95.6, sd 13.81,
1274 sub-70px). Same for x345..490. Center bay: ref med 98.5 vs proc
94.4 (−4.1).

**E. Hero-rr corner air short (honest, improved).** x545..625 y285..395:
ref 38.3% vs proc 27.5%; wider x520..638 y270..410: 38.1 vs 32.0.
Matches the builder's declared residual.

**F. Roof reads (top/toptilt/close-roof/front).** (i) Hatch DOMES: ref
hatches are domed volumes (sphere shading both hatches, top + toptilt);
proc lids are flat with thin dashed circles — at close-roof range the
flat maroon rims are the loudest item on the deck. (ii) Roof guns from
above: ref M2 window x270..320 y185..240 carries 485 sub-78px (clear gun
form on the cupola); proc M2 lane x323..335 y225..295 has 92 faint px;
plinth (x246..262 y240..300) 32 and .50 (x374..392 y270..330) 34 —
invisible. The r9 pale-deck law demands dark crown-riding lines on pale
decks: the r7 side-ortho rod engineering does not print top-down.
(iii) Louvre: view-top x325..375 y128..155 ref sd 8.31 / p95 107.2
(visible ribs) vs proc sd 3.70 / p95 92.7 (grilleSoft went too soft).

**G. Side dark-bias accents (med-parity holds).** view-left arch row
x150..450 y392..420: med parity (56.0 vs 55.5) but proc p5 29.5 vs ref
52.9 (near-black pockets) and proc p95 71.0 vs ref 94.6 (no pale wheel
rims — the hem row reads as a hard dark M-beat). Skirt band y360..392:
proc p5 60.8 vs ref 91.8 (slit lines). Turret band + hull band meds all
within ~2L (94.4 family) — tone table otherwise clean.

**H. Hero-fl turret character (certified, longstanding).** The band wall
+ module staircase read tall/boxy vs ref's swept wedge; r6 audit proved
no stance drift. Treatments, not extents: see order 6.

## Owner laws

- NO EMPTY AREAS (top): **PASS** — cells 77-100 both halves across rear/
  mid/front deck; no blank cells.
- Turret contiguity: **PASS** all 14 views.
- Decoration minimum (roof guns must read as guns): **PARTIAL** — orthos
  read (crops confirm M2/plinth/.50 forms + free-sky); top/toptilt FAIL
  the pale-deck axis (defect F-ii).
- FILL/CIRC: CIRC PASS (rings round); FILL PASS-w/-residual (arch-pocket
  near-blacks p5 29.5, defect G).

## Per-view justifications

- **view-front 8.8** — mass/stance/whip/gun excellent; maroon ring
  ellipses on the roofline (A, 346 warm px vs 7); proc M2 near-invisible
  dead-front vs ref's clear pintle gun; cheek stipple pattern vs ref's
  smooth casting + end mesh; bow furniture sparser.
- **view-frontleft 8.9** — best quarter: silhouette, band tone, gun
  furniture all in class; arch-row dark beat (G) and mild band boxiness
  hold it under 9.
- **view-left 8.8** — med-parity bands; tail rail FIXED; shelf runs
  present; deductions: G (p5 29.5 pockets + missing pale rims + skirt
  slits) and the ruled band-top line.
- **view-rearleft 8.7** — wing-rack dark bar (B) is the loudest tonal
  error on the view; scaffold-vs-mesh corner texture; else strong.
- **view-rear 8.7** — band interior med-parity (claim 1 verified), but
  crown parapet (C) + rear-face polarity (D) + bars (B) are all
  1x-visible; corners correctly pale-backed per the per-face law.
- **view-rearright 8.7** — as rearleft (B: p5 51.3 vs 79.0) + warm rail
  bits (A).
- **view-right 8.8** — as view-left; tail rail FIXED (81.7 vs 85.0).
- **view-frontright 8.8** — as frontleft minus the cleaner read: cheek
  prism + warm plate visible.
- **view-top 9.0** — PASS: cells parity, no empty areas, vane band pale,
  mottle matched, module plan edges clean; the mauve bar (A) is the one
  1x-visible flaw; rings/louvre/guns need zoom to fault.
- **hero-frontleft 8.6** — turret character gap (H) largest here: tall
  flat band wall + square corners vs ref's low sweep; plus thin dark rail
  on the band face. Hull/skirt/gun strong.
- **hero-rearright 8.8** — corner air 27.5-32 vs 38 (E, honest); brown
  rails (A); crate/rack boxes read slightly slabby; big improvement from
  r8's 8.0.
- **hero-toptilt 8.9** — rich, near-parity deck; flat drawn rings vs
  domed hatches (F-i), no louvre texture, no top-visible guns (F-ii).
- **close-front 8.8** — bow reads clean but sparse vs ref's headlight
  cluster + splash-board diagonal; chevron = isolated dash groups;
  towLit eye-plates fine; skirt fronts + muzzle good.
- **close-roof 8.6** — at close range the flat maroon ring rims (A + F-i)
  dominate; deck mid-frequency kit sparser than ref; no dome volume; no
  gun read; sleeve/collar/saddle good.

## Fix orders for r10 (in refund order)

1. **RETONE the warm material family** (A; fixes front/top/close-roof/
   toptilt/hero-rr/quarters in one change): ring tori + seam rings + rim
   rails/cap plates + the top bar → olive detail tone, R ≤ G−1 (field is
   (88,89,74); bar is (91,87,78)). Verify: warm census ≤ ref+50 on
   close-roof (ref 116), view-top (ref 17), view-front turret zone (ref 7).
2. **Pale-refund the wing-rack under-rim bars** (B): thin to hairline
   ≤1px at detail tone ~80L or delete. Verify: view-rearleft x70..210
   y340..354 p5 ≥ 85; view-rearright x430..570 y340..354 p5 ≥ 70;
   view-rear x150..295 y382..392 p5 ≥ 72.
3. **Break the dead-rear crown parapet** (C): stagger the six kit-wall
   heap tops (uneven 2.20-2.35, camera-side edges kept) AND cut x-lane
   dips into the 2.60-2.65 roof-band members (plinth/furniture/kitCap
   segments) so the view-rear top edge x170..470 gains ≥6 sky gaps of
   3-10px and crown air y195..232 reaches ≥80% (ref 87.2). Keep the
   verified band-interior med 94.4.
4. **Re-polarize the rear-face panels** (D): tone-on-tone PALE mesh/stow
   fill on both wing-rack rear faces (target p95 104-106, ref class) and
   thin the dark frame lines (sub-70 census 1274 → ≤300 in x150..295
   y385..480); lift center bay toward ref med 98.5.
5. **Roof volume + top-down gun mass** (F): low dome caps on both hatch
   lids inside certified caps (kill the drawn-circle read; this also
   feeds hero-fl); give M2 + loader MG a dark top-down footprint
   (receiver/cradle plate, detail-dark, no new silhouette columns —
   ref window carries 485 sub-78px vs proc 92); restore louvre ribs
   pale-on-tone to sd ≥ 6 in view-top x325..375 y128..155.
6. **Polish (no-regression budget)**: hero-rr corner air +6pp (thin one
   scaffold member / shrink the mid-corner beam in x545..625 y285..395);
   arch-row floors p5 ≥ 45 + faint pale rim hints p95 ≥ 85 (G); skirt
   slit p5 ≥ 75; hero-fl band-wall relief within certified extents
   (raked washes/curb shadows per the r4 swept-low pattern).

Gate margin note: budgets 90.6/90.0 — orders 2-4 are tonal/segmentation
(refund-class), order 5's gun plates must hide inside existing turret
mask extents (the r4 MASK-NODE law), order 3's dips are refund-class
where the ref rim falls (r4 elevated-cam law).
