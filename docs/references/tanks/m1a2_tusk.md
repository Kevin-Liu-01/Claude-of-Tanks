# M1A2 Abrams TUSK — reference packet

Variant: M1A2 with Tank Urban Survival Kit — ARAT-1 reactive tile rows on the
skirts (XM19 boxes; ARAT-2 second course), loader's armored gun shield (LAGS),
Tank Infantry Phone, rear slat cage. Gun unchanged: M256 L/44.
Sources: GlobalSecurity TUSK (https://www.globalsecurity.org/military/systems/ground/m1a2-tusk.htm),
army-guide TUSK (http://www.army-guide.com/eng/product4072.html),
Wikipedia M1 Abrams (https://en.wikipedia.org/wiki/M1_Abrams).
Real ARAT adds only ~0.1–0.15 m per side over the 3.66 m hull — the old
profile `width: 3.90` was a score-chasing artifact and is gone.

## Local GLB oracle — IMPORTANT scale quirk
Reference = `/models/tanks/m1a2_tejas.glb` PLUS modelLoader's runtime TUSK kit
(addRuntimeTuskKit): ARAT instanced panels, skirt rails, rear slat cage, TIP
box, loader shield. The kit is positioned in REAL meters (spec.dims) while the
tejas asset itself is height-clamped small by modelLoader, so the assembled
oracle is a ~0.94-rescale of a tank body that was already ~27% under real
scale relative to its kit. After the page's width normalization the oracle is
(scoring frame, ground 0):
- hull body: deck ≈ 1.12…1.34 (bow → stern), z −3.68…2.87, turret ring at
  (0, 1.14, 0.25) — i.e. the whole tejas body × ≈ 0.727 of the m1a2_tejas
  targets.
- ARAT panels: two courses, y centers ≈ 0.59 / 0.89, panel 0.12×0.27×0.32,
  14 columns z −2.11…+2.12, outer face x ≈ ±1.83 (the widest point of the
  oracle — this is what the width normalization keys on).
- rails x ±1.72 at the same two heights; slat cage z ≈ −3.66 (3.35 wide,
  posts y 0.86 ± 0.34); TIP box ≈ (1.34, 1.02, −3.56).
- loader shield on the turret: turret-local ≈ (−0.58, 0.72, 0.32) front plate
  0.74×0.45 + side plate.
- gun: axis ≈ 1.37, muzzle z ≈ 4.15.

## Procedural strategy
Match the oracle: tejas-family geometry uniformly scaled 0.727, ARAT/rails/
slat/TIP/shield at the runtime-kit stations above, widest point = ARAT face
±1.83 so the page scale is 1.0.

## Mismatch note (shared machinery, not fixable in abrams.js)
The under-scale body is a modelLoader interaction (height-clamp normalization
of the tejas asset vs real-meter runtime kit). In-game the local GLB visual
has the same proportions, so the procedural matches what players see; but the
public-build TUSK will read smaller than its m1a1/m1a2 stablemates until the
loader normalization is revisited.

## Outcome (final lab state)
Baseline 58.9 (H58 T44 G42 R73) -> 86.5 (H91 T81 G78 R86). The 0.727 body
scale + real-scale runtime-kit mirror is what closed the gap; residual gun
loss comes from the very slim scaled tube (r ~0.065) anti-aliasing against
the reference's tube at mask resolution.

## Round 2 (shaded-parity, 2026-07-30)
- ARAT reads as a tile array: lower course DEAD FLAT at the ±1.83 oracle face
  (this plane is the width-normalization anchor — a leaned lower course only
  touched 1.83 at a rounded corner and silently re-scaled the whole tank),
  upper ARAT-2 course wedged out 0.22 rad, dark seam spacers between tiles,
  standoff arms tying the real-scale rails back to the under-scale hull.
- Slat cage gains horizontal slat bars + brace arms to the hull rear; TIP
  hangs on its bracket; LAGS gets a swept wing plate + vision window; thin
  belly-armor lip tucked at the toe. abramsHull's own TIP/mud-flaps are
  suppressed here (the runtime kit brings the real TIP; the scaled oracle
  body carries no flaps at those stations).
- Station is the shared CROWS build at s=0.727.
- Score 86.5 -> 84.1 (H 91->87, T 81->73, G 78->85). The T loss is the
  under-scale interaction: the critique-mandated fine kit (hatch fences,
  skate rail, banks, station facets) rasterizes smaller than round-1's
  chunky primitives at 0.727, and the glacis/grille furniture adds fronts
  the clamped oracle body lacks. 0.4 outside the ±2 gate — flagged rather
  than re-fattened, since the fat blobs are exactly what the shaded gate
  rejected.

## Round 4 — geometry gate forces full scale (2026-07-31)
The gate's dims anchor (published 7.93/9.77/3.66/2.44) cannot be met by the
0.727 oracle-scale body: the build now uses the FULL-SCALE tejas family hull
+ shell with the (already real-scale) ARAT/slat/TIP kit. IoU vs the small
oracle collapses by construction (~52 at full scale vs 85.4 at 0.727) — this
is the certified oracle-defect cap (modelLoader height-clamp normalization,
see the scale quirk section above); dims + published proportions win per
docs/GEOMETRY-GATE.md. The 0.727 table remains reproducible via
`oracleScale: 0.727` in ABRAMS_PROFILES.m1a2_tusk if the oracle is ever
re-normalized.


## Round 5 — gate v6/v7 iteration (2026-07-31)
PUBLISHED-TRUE REBUILD: the v5 0.727-scale body is retired. The tusk build
is now the full-scale tejas-family body + real-scale ARAT/slat/TIP kit, all
inside the committed +-1.83 width (lower ARAT course flush on the skirt
plane).
CERTIFIED CHIMERA ORACLE: MODEL_SOURCE.m1a2_tusk loads the tejas GLB, whose
modelLoader scale is height-clamped ~0.727, then addRuntimeTuskKit() attaches
the ARAT/slat kit in REAL meters (modelLoader.js:2261) — the reference is a
~0.68-scale body wearing a ~0.94-scale kit after the lab's width
re-normalization keys on the kit at +-1.94. No build can satisfy both that
mask and the published dims; hull/whole/turret/stations are capped at ~0 by
the certification, dims (97) and floaters (100) are green and sovereign.
Repair note: not rigid-transform repairable (two inconsistent scales inside
one oracle); the fix is loader-side (scale the kit with the GLB or exclude
it from the swap).


## Gate v10 cap re-verification (2026-07-31)
The chimera cert STANDS under v10: the tusk oracle remains the tejas GLB
height-clamped small PLUS a real-scale runtime kit — hull/whole/turret/
stations are structurally capped (0-18 range); the build keeps the
published-true full-scale body + real-scale ARAT/slat/TIP kit. Achievable
components green: dims 97 (heightM/width within grace), floaters 100.
A cap never excuses dims — dims holds >= 90.

## 2026-08-01 re-verification
Chimera cert STANDS against current files: in the lab, userdrops4 still
overrides MODEL_SOURCE.m1a2_tusk to the height-clamped tejas GLB and
modelLoader adds the real-meter runtime TUSK kit (the preprocessed
m1a2_tusk_dannzjs_variant.glb registered by variants.js is shadowed by that
later unconditional override — pointing the lab id at the variant bake is a
loader/userdrops-side ask, out of profile scope). Fresh run:
hull/whole/turret/stations 0 (structurally capped), dims 97, floaters 100 —
achievable components green, dims sovereign and >= 90. Board regenerated;
IoU 55.2 vs the small-body oracle (expected under the full-scale build).

## 2026-08-02 vertex round — triage classification: ORACLE DEFECT (chimera)
Zero-row triage per the fleet directive. Fresh gate run this round:
hull/whole/turret/stations 0, dims 97 -> 100 (family height fixes),
floaters 100 — the CHIMERA CERT STANDS and fully explains the zeros: the
lab id still resolves to the height-clamped tejas GLB + real-meter runtime
ARAT kit (two inconsistent scales in one oracle; not rigid-repairable).
NOT unstarted, NOT a registration bug in the page, NOT a missing file.
vertex-extract REG measures the BARE tejas print for this id (the runtime
kit is not modeled there): length/width true, height +34.8% — same W1/W2
warp options as m1a1.md IF the loader-side chimera is first resolved
(scale the kit with the GLB, exclude it from the swap, or point the lab id
at the m1a2_tusk_dannzjs_variant bake — loader/userdrops-side, out of
profile scope). Build meanwhile stays published-true full scale and moved
with the family (plan/hull/flank fixes shared via buildTejasFamily).
