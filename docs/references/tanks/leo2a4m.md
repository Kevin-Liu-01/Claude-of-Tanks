# leo2a4m — Leopard 2A4M (2A4M CAN class) — oracle packet

## Source
`public/models/community-candidates/leo2a4m_arrafi.glb` — Arrafi
(nazidefenseforceofficial), EXTRACTION-SUSPECT ×2 per docs/ATTRIBUTION.md
(rip-poster account + WT-lineage `chassis_vlo`). LOCAL-ONLY quarantine,
measurement/visual reference only, never ship. 4 prim-instances,
2 materials (chassis.0, chassis_vlo.1).

## _vlo SHELL-ISOLATION AUDIT (§5.248 germany round — verdict: NO USABLE
## SPLIT, whole-view instrument only; the _vlo node is benign-required)
Real-vertex scans (tools/tmp-leoM-vlo-audit.mjs, glb frame, nose +x):
- `Object_3` (14267v, x -4.44..6.096, y -1.02..3.527) and `Object_4`
  (6309v, x -3.98..6.096, y to 3.527): WHOLE-VEHICLE shell pair — hull +
  turret + gun (tube to x 6.096) + the raised whip pair (tops 3.527 at
  x -2.94..-2.44, z -0.91..1.03 = both bustle corners) fused in both.
- `Object_2` (7958v): partial detail shell (hull regions + turret-zone tops
  to 2.166) — duplicates Object_3 content where it overlaps.
- `Object_5` (chassis_vlo.1, 6835v, y -1.108..0.204): the running-gear band
  — the print's ONLY wheel train. BENIGN-REQUIRED (excision = no wheels).
No node isolates a turret or gun → registration = fixedMount +
componentMasks:false (t72m1_jaguar class), landed in all three maps + the
vertex REG row completed (fixedMount was missing — the extractor threw
'no turret node'; autoPivot must NOT ride along, it dereferences the
turret world matrix).

## Print scale self-consistency + the antenna instrument hazard
At the REGISTERED pubDims width 4.07 the safeScale chain CLAMPS (s 0.7714
binds on the 1.30×height guard because of the 3.527-glb whip tops, then k
1.324 re-inflates): overall reads +7.9%, bodyH +29.3% — **the bodyH read
is the whip-antenna cluster, NOT the roof** (§5.261 heightM law receipt:
the whip columns' full-column band passes the 12% filter and the pair
spans ≥4 columns on the print). At the print-true over-skirt width
**3.77** (z ±1.978/2.007 glb × 0.946 m/u): hull = 7.72 EXACT (its own
anchor), overall = 9.98 (+0.2% vs the 9.96 REG bracket). The 4.07 add-on
figure is not carried by the print (divergence reported).

## Measured lines (true meters; whole-shell decode, so attribution is by
## region not node)
- Running gear (Object_5 decode): 7 duals ~0.80-0.84 cadence, sprocket
  rear (x -3.6..-3.96 glb raised), idler forward (x +3.0..3.4 raised);
  ground = wheel bottoms.
- Deck ~1.91 print (print-tall class, published-first build), skirts ±1.78,
  full width over skirts 3.77.
- Turret: roof band world ~2.54; front face ~+2.30; bustle rear ~-2.10 with
  the rack/antenna zone to -2.45; REAR-LEFT tall stern frame: stern verts
  y 1.30 glb = world ~2.28 clustered CENTER-LEFT (z 0.16/-0.9 print frame)
  — NOT full width.
- Whips: raised pair at the bustle corners, tops world ~4.3-4.4, z-spread
  ~0.45 (two separate side-view columns on the print).
- Gun: L44 tube center ~1.93 world (LOW — print stylization), muzzle world
  6.10 glb-decoded ≈ rear + 9.96 within 0.2%.

## Spec decisions (src/vehicles/germany.js — silhouette* strip law applied)
dims 7.72 / 9.96 / **3.77** (over-skirt/armor, print-verified) / **2.62**
(the p95 hatch-drum hardware line — the family §5.73-1 datum class; 2.75
is an over-PERI figure the recipe cannot see, and the print's own 3.556
read is its whips). Rig: turretPivot [0,1.80,0.30], gunPivot [0,0.20,0.75]
(axis 2.00 = the honest trunnion floor; the print's 1.93 is below it —
documented cap), gunBarrel 5.19 → lit overall 9.94 (-0.18%).

## Gate close (FINAL state ×2 BIT-IDENTICAL, md5 afe049b2 ×2)
**min 89.5** | whole 89.5 = THE DOCUMENTED INSTRUMENT CEILING (china-lane
§5.261 precedent class) | dims 100 (heightM 2.64 +0.71%, hull 7.71 +0.16%,
overall 9.94 +0.18%, width 3.78 +0.2%) | floaters 100. Audits: track-clip
--exact --strict 0/0 + shoe 0/0 + sweep 0/0 (one REAL §B4 offender found
and fixed — receipts below); turret-parent 0/0/0. Baseline
(donor-wrapper): min 69 (whole 80.1, dims 69) —
shots/germany-wave/leo2a4m-gate-baseline.json.

## Ceiling certification (why whole holds at ~89.5, with receipts)
1. Print-tall lower body (+6% deck band): translation-only registration
   splits the residual across the works band (grid receipts: full-length
   upper-band procOnly row + stern refOnly cells).
2. The print's left-rear roof cluster (~2.7-2.9 world, 3-4 columns): my
   heightM p95 budget (3 columns above the 2.62 line: whip + PERI ×2) is
   already spent — matching that cluster breaks dims (heightM sovereignty).
   Front-view receipt: the ref cluster also sits LEFT of center where
   photos put the PERI right — photo-truth kept, residual documented.
3. Tube axis: print 1.93 vs my 2.00 honest floor (half-tube red understrip).
4. Whip z-spread: the print's pair splits 2 columns; mine hold ONE z (a
   tied-back rake was tried and REVERTED — see the whip-rough receipt).

## Ladder receipts (losers reverted with receipts — the honest-iteration log)
- r1 heightM 2.84 (+9.1%): MG/PERI/whip cluster over the p95 budget →
  hardware line law: drums to 2.62/2.64, PERI compact 2.77-2.84 ≤2 cols,
  C6 low side-swing mount, whips raised THIN (bbox recovered: refWH
  154px vs procWH 118px → 154/154).
- r2 dims 100 landed (2.64/7.71/9.94/3.78 — all ≤0.71%).
- r3 gunPivot 0.38 raise: whole 87.4 → 86.8 REVERTED.
- r4 gun drop 0.26 + rack trim 3.40→3.16: 88.3. r5 axis 2.00: 89.3.
- r6 flap/pod/appliqué/mantlet trims: 89.5.
- r7-r9 REGRESSION CHAIN (banked laws): (a) tied-back whip rake → p95 read
  the tip 4.23 (+61%) — the diagonal spreads tall tops across ~10 columns
  AND inflates rough (whip-rough coupling law); (b) tube 5.19→5.25 → the
  proc lit span (10.01) outgrew the ref's (9.95) and RE-OWNED THE SHARED
  GATE CAMERA — every column re-phased (hull 7.63, heightM 2.82). Both
  reverted with in-code receipts.
- r10-r13: turret rack 2.96→2.60, stern tier full-width→center-left basket
  (print-true), cheek/flank +0.08 widening toward the ref's ±1.55 front
  frame tried → 88.6 REVERTED (top-view plan paid more than front gained).
- r14 §B4 exact: front mudflaps (inner 1.605) pierced the course 20/10 →
  outboard re-hang (inner 1.70) → floaters 0 (islands!) → hinge arms into
  the skirt plate / hull wall (no course at z -3.58) → 0/0 + floaters 100.

## §E SKIPPED — optional ×0.94 measures below the raw ceiling, twice
## (2026-08-17, §5.248 §E round; print PRISTINE sha b3911324…, no recipe)
The §5.280 optional deck y-normalize ("would release 89.5→≥90 if clean")
is DISPROVEN by two request-interception sims vs the standing 89.5/100/
100 row (receipts scratchpad e-round/leo2a4m-cand*-sim.json):
1. Uniform ×0.94 above ground (deck 1.91->1.80, whips ride): **86.2** —
   the whip-top drop re-keys the safeScale clamp chain (the packet's own
   s 0.7714/k 1.324 hazard) and re-frames every court.
2. Deck-band-only (belt 0.204 raw -> deck 0.8686, identity above 1.60,
   whip tops PINNED exact — frame clamp unchanged): **87.3** — the
   print-tall deck was already priced INTO the translation registration
   (ceiling cert #1); lowering it re-splits the residual worse.
VERDICT: the 89.5 certified instrument ceiling STANDS; both normalize
shapes lose points. Also DEFER-consistent (§5.299: leo2a4m §E defers
until lane E lands — lane E replaces the turret anyway, re-pricing any
future normalize plan).

## Build notes (ground-up §5.248 rebuild — buildLeo2A4M,
## src/vehicles/profiles/leopard.js)
leoHullV3 family loft (same real base hull as the a6m — print corroborates
within a column), leoGear print cadence, GROUND-UP boxy A4 turret (frustum
walls + angled-back cheek faces + gun-slot bridge + roof plate), A4M slab
package (double-stepped angled cheek wedges, flank slab modules with seam
ribs — a flat-dark face read as a hole, §5.04 receipt), CAN rear turret
rack (2.60 wide, strapped load) + center-left tall stern basket (print
line 2.28), hull-flank armor slab row at ±1.885 = the widthM anchor,
mine-belly plate, German fender grammar + pioneer kit, front/rear mudflaps
with §B4-safe hinge arms, EMES well + brow, PERI R12 compact, round-lid
hatch drums at the 2.62/2.64 p95 line, C6 low mount, Wegmann 2×4 per side
on the forward cheeks, raised vertical whips, L44 via leoMantletGun +
§B3.1 muzzleBore at 5.19.
