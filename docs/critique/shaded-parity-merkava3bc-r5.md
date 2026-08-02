# merkava3b + merkava3c shaded-parity r5 — independent critic (2026-08-02)

Gates hold (90.3/90.7, 8db49ca). Verdict: BOTH FAIL — min 8.0 each
(from 7.5; floor rising). Laws PASS, no regression. Run tone VERIFIED
FIXED on the render (56 vs ref 54-56 both tanks — the claim-vs-render
cycle is closed on this item). Roofline/wall rhythm FIXED. Towers (3B)
and pot saucer (3C) FIXED.

## R6 work order — the three 9.0-gating items

1. TURRET-REAR CANVAS VOLUME: the vane band still renders as
   stroke-drawn rails + dot row on a FLAT wall; the ref shows sculpted
   DRAPED CANVAS with zero linework. Build actual displaced canvas
   geometry (billowed panels with sag depth, shading from form — not
   strokes). Dead-rear at 1x is the test. (Certified amplitude cap
   governs CROWN HEIGHT only — depth/relief inside the band is free.)
2. CORNER FLAPS FULL-HEIGHT: the brown flap covers only the upper half;
   the lower 36-44-lum ribbed under-stack spans ~half of each corner
   (ref: uniform 60-64 full height). Extend/cover to full height.
3. MG BARREL LINES (3rd claim-vs-render miss): two long horizontal
   lines must PHYSICALLY break the side silhouettes at the ref's
   heights — the ref's own mask holds those pixels, so matching rods
   are gate-neutral/positive. Verify by Reading the elevations, not by
   asserting yaw values.
Secondary: turret-mass slab-side softening (taper shading), rear panel
seam contrast toward ref, gear character (wheel shading depth, kill
the bright ~70 under-band), top-bustle billow read, discharger pods
proud not painted.
