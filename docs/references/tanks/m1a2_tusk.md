# M1A2 Abrams TUSK — reference packet

Variant: M1A2 with Tank Urban Survival Kit — ARAT-1 reactive tile rows on the
skirts (XM19 boxes; ARAT-2 second course), loader's armored gun shield (LAGS),
Tank Infantry Phone, rear slat cage. Gun unchanged: M256 L/44.
Sources: GlobalSecurity TUSK (https://www.globalsecurity.org/military/systems/ground/m1a2-tusk.htm),
army-guide TUSK (http://www.army-guide.com/eng/product4072.html),
Wikipedia M1 Abrams (https://en.wikipedia.org/wiki/M1_Abrams).
Real ARAT adds only ~0.1–0.15 m per side over the 3.66 m hull — the old
profile `width: 3.90` was a score-chasing artifact and is gone.

## Retired comparison source — historical scale notes
The former Tejas comparison adaptation and its runtime TUSK composition were
deleted and are no longer registered. Historical scoring notes for the old
assembled comparison are retained below:
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
m1a2_tusk_dannzjs_variant.glb retained by the comparison registry was shadowed by that
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

## 2026-08-02 shared-build side effect (abrams post-warp round)
The tejas-trio re-tune (see m1a1.md) moved this shared build: tusk min
0 -> 14.2 (hull 29 / whole 14.2 / turret 40.7 / stations 45.1), but dims
read 97 -> 83: on TUSK's slat-stretched frame phase the heightM p95 lands
on the 2.52 M240-shield column (4th tallest there). Chimera cert unchanged;
a tusk-owned round should revisit the 3-column spike allocation under its
own frame.

## §B1 TURRET FRONT SLOPE (2026-08-04, abrams builder — shared-shell move)
Inherits the TEJAS_TURRET faceRake 0.02 -> 0.32 + pitched slot plate via
buildTejasFamily (trio round notes in m1a1.md). Own chimera print measures
34.5° from vertical (probe shots/abrams-b1/probe-m1a2_tusk.json: chin
y 1.68 z 2.21, face band to y 2.00); the shared 0.32 lands 34.6° on the
built carrier — print-exact, §H.4-consistent (one family class, per-print
values). Gate x2 IDENTICAL: min 13.7 both runs (hull 24.3 / whole 13.7 /
turret 42.2 / stations 39 -> 39.6 / dims 100 / floaters 100) — stations
IMPROVED, nothing regressed; the pre-gate hull/whole caps (chimera oracle)
stand untouched. §B5 audit 0/0/0. Standard-check: pre-existing tail holes
(x -1.12/-1.02, z -3.9) + rear clip 10 unchanged (hull zones, unrelated).
Hash f1aebbec -> f7ecade4 (47/182584). After-pairs
shots/abrams-b1/after-m1a2_tusk/.

## FAMILY BATCH (2026-08-06, abrams builder — owner extension: "the
## abrams x has to be worked on with the other abramns, as well as
## ABRAMS TUSK")
Active-target round. Inherits via buildTejasFamily: the §B1.1 left-cheek
raked bulge (stair prisms retired) + the §B3.1 M256 elliptical thermal
jacket (m1a1.md mechanics). Gate x2 IDENTICAL: min 13.7 | 24.3/13.7/
42.3/39.6/100/100 — turret 42.2 -> 42.3 IMPROVED vs the round baseline,
nothing regressed; the CHIMERA CERT stands untouched (hull/whole/
stations structurally capped by the two-scale oracle; dims 100 +
floaters 100 sovereign-green; ceiling-measured, stop-rule CEILING).
§H.4 tells verified in the after-pairs: ARAT two-course tile grammar
(seam spacers, rails, standoff arms — §B3 tile pitch, not bare bricks),
slat cage + braces, TIP, LAGS with vision window, CROWS station:
distinct from tejas at a glance. standard-check: clip 0/10 + tail holes
(x -1.12/-1.02, z -3.9) PRE-EXISTING and byte-same as the §B1-round
listing (hull zones, chimera-print lane — documented, unchanged by this
round). §B5 0/0/0. Hash f7ecade4-class -> 51966e20 (43/175096,
non-graduate: no freeze law). Before/after:
shots/abrams-cheek-r1/{before,after}-m1a2_tusk/.

## §B3.2 DENSITY ROUND (2026-08-06, abrams builder — owner directive with
## screenshot: "sepv2s and sepv3 and tusk need to be based off of our
## existing m1a1 abrams with the extra armoring and ERA and urban survival
## kit ... add far more of these decorations on ALL abrams")
KIT REBUILD (real-system grammar; the box-pile kit retired):
- ARAT-1 lower course: 14 XM19 tiles/side — base brick at the 1.825 outer
  plane + raked wedge crown falling inboard + twin face bolts (outer 1.827
  < the 1.828 width plane; a first cut at 1.8325 was a WIDTH-GUARD
  violation, caught pre-gate) + bottom hook lip + course mount shelf; dark
  seam spacers keep the tile pitch.
- ARAT-2 upper course: 14 M32 shingles/side, tipped outboard rz 0.20 —
  leaned brick + pale face plate (8 mm border) + center V-seam + top lip.
- Rails ×2 + 5 standoff arms/side + 4 hanger straps/side (rack grammar).
- Slat cage: 6 slat rows at 0.098 pitch between heavy chords (0.92/1.58)
  + 7 posts + corner gussets + 3 brace arms + convoy lights on the chord
  ends. Braces pulled ±1.3 -> ±1.05 (§B4: the old arms crossed the
  sprocket shoe sweep at z -3.42..-3.58 — the audit's rear 10/14 vox; now
  0/0 with the front 336 belly-lip band correctly conformance-excluded as
  envelope-riding dressing).
- TIP re-stationed on the cage right end (old station z -3.85 grazed the
  shoe sweep plane): box + lid seam + latch + cable port + bracket +
  coiled handset cable to the bumper (towCable fitting r 0.011).
- LAGS completed: coping strip, left wing glass slit, MOUNTED M240
  (pintle post + receiver + barrel through the shield notch + hider +
  ammo pouch) — tops <= 0.86 local (2.43 world, under the 2.44 plateau).
- Urban kit: guarded lightCluster pods both fender wings (drums sunk into
  the 1.316 glacis line — a 1.40 seat FLOATED 8 cm; contig 22 -> 0),
  mirror masts + heads, CROWS-side spotlight (top 0.845 < the 0.883 knee).
- §B3.2 commons: RIGHT skirt-ledge tow cable (the m1a1 ledge class
  mirrored), glacis spare-link strip, jerry can pair on the left rear
  deck — re-seated (-1.10, -3.40) BEHIND the bustle-rack swept annulus
  (§B5 audit: at (-1.32,-2.98) the can tops sat inside the rack corner
  sweep r<=3.63; now r>=3.86 at every corner; audit reads the pair as
  ABUTTING = deck-gear review tier, adjudicated LEAVE) + pioneer tools
  (shovel/axe with §B3 handle+blade tells) + family deck D-rings +
  helmet bag (shared tejas-family §B3.2 block).
GATE x2 IDENTICAL: min 14.1 | 14.9/14.1/42.3/39.5/100/100 both runs —
min 13.7 -> 14.1, dims 100 + floaters 100 (the achievable components)
HELD; hull 24.3->14.9 / stations 40.4->39.5 are CHIMERA-CAPPED row
wobble (certified two-scale oracle, cert stands). track-clip 0/0 (was
0/10). §B5: stranded 0 real (1 merged-bucket 25% false-flag, boxed
[-1.58..1.58, 1.16..1.67] = the whole hullDark bucket; 2 ABUTTING =
the deck-gear cans, adjudicated). standard-check tail holes at
(±1.12, -3.9) PRE-EXISTING (chimera-print lane, documented above).
Hash 51966e20 -> 2bab773c (54 meshes / 194344 verts; non-graduate, no
freeze). Shots: shots/critic-m1a2_tusk-b32/ + shots/abrams-b32/yaw{0,90}-
m1a2_tusk/. §H.4 tells at a glance: two-course ARAT wall + slat cage +
TIP + LAGS-with-M240 + urban lights — no other abrams carries any of it.

## REAR + BORE + VISIBILITY ROUND (2026-08-06, abrams builder — full
## mechanics + §C decode in m1a1.md; gate-in-loop non-graduate)
Inherits the family stern rebuild (guard plates sit between the hull and
the -4.0 slat cage; the TIP phone keeps its cage station), the M256
bore, and the CROWS II mast (real TUSK-II fit). GATE x2: 0 |
14.9/0/42.3/39.2/100/100 both runs — the chimera-capped mask rows move
with the mast (whole 14.1 -> 0 under the cap; packet cert stands); the
ACHIEVABLE rows dims 100 / floaters 100 HELD x2. standard-check clip
0/0, contig 0, census mg1+7d. §B2 stern band improved (rearleft 84->63,
rearright 165->141); +14 hero px = mast/cage air classes (m1a1.md).
CANDIDATE (non-graduate, gate-in-loop) fc4018b8 (55 meshes / 199736
verts, tmp-hashgeo x2).

## CROWS-REWORK ROUND (2026-08-06/07, abrams builder — §4.999a; family
## round home m1a1.md, per-station table + laws there)
The family's REAL pointing delta (non-graduate): the whole CROWS II
station FLIPS OUTBOARD to -90 deg — the M2 overhangs the right cheek
like the real CROWS photo pose — plus the §4.999a FULL ARMOR WRAP:
flank plates both sides (7 mm proud of the receiver faces, 7 mm window
margins by construction at -90), rear plate, armored crown lid; second
urban spotlight on the yoke (the base spotlight stays); yoke/collar/can
GUN-LEFT/chute/IR pod as tejas, mirrored. LAGS M240 untouched (a loader
shield station faces frontal fire by design). GATE: the capped rows
absorbed the flip EXACTLY — 0 | 14.9/0/42.3/39.2/100/100 unchanged,
dims/floaters 100 held. Mode-2 425 px = the pre-existing deck-gear
class, unchanged. Non-graduate: no freeze; hash in m1a1.md close table.

## FLANK-PANEL PITCH BINDING (2026-08-08, owner order)
Shared flank carriers now follow the shell tumblehome; TUSK's ARAT, slat,
LAGS, and armored-CROWS identities remain intact. Three gate reports at the
edited bytes reproduce 1.8 | 14.9/1.8/42.2/23.5/100/100; the deterministic
42.3->42.2 plan slice remains inside the certified chimera-capped class.
Independent 14-view PASS, floor 9.0 / mean 9.13. Binding
**b1786e4c -> bd371600** (58 meshes / 199244 verts). Full verdict:
the archived visual-review receipt.

## §5.74 DISTINCTIVENESS + P95 BINDING (2026-08-08)
TUSK is now the unmistakable heavy urban member: enlarged fully wrapped CROWS,
strengthened loader shield/coping, four ARAT-style turret panels per flank,
and the retained two-course hull ARAT, TIP, LAGS-M240, lights and rear slat
cage. Mandatory-kit P95 = 3.2748 m; heightM 2.44 -> 3.27. Gate x2 exact: 0 |
14.7/0/39/23.1/100/100 — the owner-ordered silhouette remains inside the
documented chimera/oracle-divergence class, NOT a geometry PASS. Independent
14-view identity PASS, floor 9.1 / mean 9.26. Binding **bd371600 -> 7620b020**
(58 meshes / 200924 verts). Full verdict:
the archived visual-review receipt.

## FULL ARMOR/GHILLIE BINDING (2026-08-10, §5.107)
The full cover is seated around the unmistakable ARAT/slat urban package;
the rear cage remains open and hull-owned rather than being falsely sealed by
cloth. P95 height is 3.29 m. Corrected yaw ownership PASS; independent §B8
floor 9.4 / mean 9.47. Binding **7620b020 -> cfc006f2** (66 meshes / 261898
verts). Full verdict: the archived visual-review receipt.
