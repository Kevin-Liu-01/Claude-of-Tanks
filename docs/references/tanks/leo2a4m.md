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

## §5.299 OWNER ORDER — pre-wave turret splice (lane E, §5.311 recovery; 2026-08-17)
ORDER (verbatim): "for our leopard 2a4m, use the new hull and gun but use
the turret from before we were using."
Baseline 94a83234 (§5.248 ground-up, row 89.5/100/100 gatePassed=false =
the certified instrument ceiling). DELIVERED: buildLeo2A4M keeps the
§5.248 leoHullV3 hull + L44 leoMantletGun package VERBATIM; the turret is
the PRE-WAVE donor-wrapper turret — buildLeo2A4's welded A4 construction
(A4_PLAN loft + apron + EMES hood + PERI R17 + hatch drums + Wegmann 2×4 +
bustle rack, copied verbatim) dressed with the b66d6d03^ germany.js
wrapper package (wrapArmorCheeks MEXAS wedges, wrapPlate flank modules,
wrapSideSlat/wrapRearSlat cage, wrapCanadianSmoke; helpers copied verbatim
and renamed wrap*). Ring seat: spec turretPivot 1.80→1.70 reproduces the
donor's exact seat margins on this hull (loft base 4.5 cm over the 1.67
deck, ring plinth closes §B2 sight-lines); gun re-seated to the OLD
turret's mantlet face (gunPivot z 1.13, tube 4.81) with world landmarks
HELD (axis 2.00, muzzle 6.24 bore-mouth law, overall 9.96).

### §5.311 hardware-line rework (heightM sovereignty receipts)
The as-copied wrapper furniture broke the certified 2.62 p95 line exactly
like the dossier's r1 (gate read heightM 3.30, +26%, dims 0):
- era roofWeapon: floating 0.90 station + shielded 0.86 pintle (2.73 drum
  / 2.96 MG world) → SEATED plate+collar on the 0.68 roof + certified low
  side-swing C6 (§5.248 recipe verbatim; tops ≤2.52).
- era radioPair whips (tips 3.26-3.38, drums floating 0.16 behind the
  -2.30 loft rear) → capped base drums seated on the bustle-rack end
  rails; the donor SEM 25 pair carries the whip read.
- donor SEM whips de-raked to VERTICAL (the -0.10 z-rake smeared tops
  across the ramp — whip-rough coupling law; this id's budget can't
  afford the donor's smear).
- FLW 200 (§5.73-3, returns with the pre-wave turret) sunk 0.05 to the
  era WORLD seat class (trough 2.63, RWS gun 2.61).
- donor PERI R17 head compacted in z (box 0.19→0.14, cap r 0.08→0.065)
  and re-phased to the §5.248-certified world-z window (local -0.28): the
  as-copied head straddled THREE stations (p95 landed on its third column:
  2.82, +7.7%).
Final tall set = PERI ×2 + SEM spike ×1 = exactly the excluded p95 budget;
p95 lands at the 2.63-2.65 hardware line (probe h 2.602, 0.69%).

### Gate close (final bytes ×2 BIT-IDENTICAL, md5 9f98ac78 ×2)
**min 86.2** | whole 86.2 | dims 100 (heightM 2.60/2.62, hull 7.70/7.72,
overall 9.92/9.96, width 3.76/3.77 — published dims UNCHANGED, true) |
floaters 100. The −3.3 vs the 89.5 ceiling is the honest cost of the
ordered turret: the print resembles the retired §5.248 turret; the
pre-wave welded turret + MEXAS wedges diverge more (order supersedes,
gate stays honest; the id was below-gate at baseline too). Audits:
track-clip --exact --strict 0/0 front/rear/shoe/sweep; turret-parent
0/0/0; duplicate-course PASS. Hash 94a83234→**dd1de614** (58/114107).
Guards leo2a4 3e07c84f / leo2a5 6ecdfb06 / leo2a6 e99dd7f8 / leo2a7v
a755d23c / leo1a5 2aee1f9d / kf51 ffb1144c EXACT; leopard2_proto
2a88d640 / leo2_revolution f55a29c8 byte-held. Evidence:
shots/germany-order/leo2a4m-before/ (94a83234 bytes) vs
shots/germany-order/leo2a4m-after/leo2a4m/ (final bytes, 14 views).

## §5.345/§5.358 ORDERED ROUND — two-band skirts + ERA, glacis field, stern
## cage, hull quality (§5.359 clean-room completion; 2026-08-17)
Orders: owner §5.328-class round ("fix the leopard 2a4m sideskirts and era",
"update the hull and make it look a lot better") + the caging order. Built in
the PINNED CLEAN WORKTREE wt-5335 @ a7218931 (clean-room law §5.359: the live
tree's foreign WIP poisons measurements — bisect receipts: the live pre-edit
gate read a4m dims 39.7 / a6m dims 25; those POLLUTED rows sat in main's gate
JSONs until this completion replaced them with fresh clean-frame rows).

### Items (buildLeo2A4M, src/vehicles/profiles/leopard.js)
1. TWO-BAND SKIRT SYSTEM — helper frontSkirt/rearSkirt OPTED OUT
   (§SRCFIX-0808; the segRun curtain read as a uniform plank fence, §5.284
   class). FORE (z 1.52..3.67): the A4M armor-module row IS the upper band —
   five modules (4 full + 1 short at the idler) at the ±1.885 width anchor
   (spec widthM 3.77 EXACT, §5.263 face-at-anchor law), each face carrying an
   ARTICULATED §5.266 ERA grid: dark joint lines, varied proud cassettes
   (staggered per module), cassette seam ticks, one pulled-cassette dark
   recess on modules 2/4; segmented lower rubber hem + hanger strip. REAR
   (z -3.00..1.44): paneled course at the print's own ±1.78 base-skirt line —
   proud mounting band over recessed panels + rubber hem, panel joints, band
   latch dots, band shadow line. §B9: hems at 0.52 leave ~65% of the 0.72
   wheel disc reading below (family 40-70 band; the old 0.87 skirt line read
   bare-wheeled). §B4: every inner face >= 1.746 vs the 1.69 shoe envelope.
2. CONTINUOUS MOUNTING RAILS (the final3 batch): fore rail z 0.35..3.61 at
   1.7775 + rear rail z -2.98..1.42 at 1.7175, bridging course -> hull side.
   §B2/§K.4 receipts: the 17 cm fender<->skirt trench read 101 enclosed
   top-down cells per side, the 9.5 cm rear trench 10 — the real vehicles
   carry exactly this rail (the a6m's 10 cm gap class needed none).
3. GLACIS ERA FIELD (§5.266, asymmetric): two bays riding their local glacis
   planes (+0.035 proud, inboard of the 0.90 lane cuts), cassette lips +
   center joints + a pulled-cassette recess; the right 2.94-band bay stays
   kit (the spare-links fitting owns it).
4. STERN SLAT CAGE (CAN class — the a6m §5.324 grammar at the A4M frame):
   5 transverse rows x 7 posts UNDER the rack tiers, rear faces -3.766
   INSIDE the -3.78 rack tail anchor (overall 9.96 holds); drop brackets
   INTER-TRACK only (§B4: the sprocket wrap reaches z -3.64 across
   x 0.97..1.63 — no bracket crosses the band).
   CAGE RULING (orchestrator-decided §5.359, executed here): KEEP at the
   honest cost — the owner ordered "caging"; the §5.335 order-supersedes
   precedent applies. LADDER receipts: the 0.50-deep r1 band read side_whole
   p95 8.66->10.38 (-2.1 pts, reverted); the 0.72 and 0.78 bands both settle
   at whole 86.1 — the cage columns' floor cost is -0.1 total (86.2 -> 86.1);
   the print's tail carries only the tall basket.
5. HULL QUALITY: certified a6-class fan WELLS + gunmetal jack (fanWell +
   jackDark opt-ins; chieftain5 O3b law — the hullWood jack block fired
   orange), center transverse grille BETWEEN the fan wells (frame inner
   edges ±0.375 clear the 0.40 fan-rim line) + 4-rib ladder with depth,
   tail-frame service boxes + lid lips + latches, rear pod guard bars,
   headlight brush guards (3 bars riding the glacis plane), tow-eye shackle
   pins.
6. PIONEER TOOLS -> STERN SHELF (the final3 batch): shovel/axe-helve/axe-head
   re-seated fully aft of the turret casting envelope — every part z < -3.04
   (envelope x ±1.72, z -3.04..nose; ring 1.70 vs deck 1.82 = the audit's
   documented low-ring false-flag shape; the jackDark tone fix had shrunk
   the wood bucket to the mid-deck tools and the AABB-coarse §B5 audit
   flagged the bucket — the kf51b §5.311 shovel class; CAN refits carry the
   pioneer kit rear when flank racks are fitted).

### Gate close (§5.359 completion — verified at BOTH frames)
**min 86.1 | whole 86.1 | dims 100 | floaters 100** — identical scores ×2 in
the pinned worktree (a7218931 frame) AND ×2+×2 at the main frame (70444dcc +
the hunk-merged leopard.js). The -0.1 vs the §5.335 86.2 is the ordered stern
cage's honest floor cost (ladder receipts above; dims 100 HELD). Audits:
standard-check row 86.1 | clip 0/0+0/0 | contig 0 | decor mg3+5d; track-clip
--exact --strict 0/0 front/rear/shoe/sweep; turret-parent 0/0/0 (the §5.345
pioneer re-seat cleared the wood-bucket flag). Default-mode (dilated,
non-strict) note: a rear shoe-envelope blind-spot of 61 vox (hull 53 +
hullDetail 8) is PRE-EXISTING — byte-identical at the a7218931 baseline,
final2 and final3 (attribution receipts in the completion transcript); it
vanishes under the canonical --exact --strict criterion.
Hash dd1de614 -> **af74fbf2** (58/116693) — FRAME-INVARIANT (identical at
a7218931 and at the merged main frame). Guards (both frames, byte-identical
pristine-vs-merged at main): leo2a4 3e07c84f / leo2a6 e99dd7f8 / leo2a5
6ecdfb06 / leo2a7v a755d23c / leopard2_proto 2a88d640 / leo1a5 2aee1f9d /
strv122 1ca18498 EXACT; kf51 ffb1144c at the pinned frame -> d73007e4 at the
main frame and leo2_revolution f55a29c8 -> e3a8a246 — both movers are the
owner's 3635217c addEquipment conversions (7 lines in buildKF51/
buildLeo2Revolution; §5.278/§5.354 re-bind class), proven NOT this lane's
(pristine-HEAD vs merged hashgeo identical on all nine guards).
Evidence: shots/leo2a4m-skirts/{before,after-b1,after}/ (§5.254 sets, final
bytes). Merge receipt: 3-way onto main db3b1375 (base a7218931) — zero
region overlap, the 7 addEquipment lines preserved verbatim; merged file
md5 10ce81d2. npm test exit 0 at the merged state.

## 2026-08-17 — 5f26bfde hull-cage restoration

The owner selected the A4M CAN flank treatment visible at repository state
`5f26bfde0a771415e354e096a209878103ec3840`. Its hull-owned side package is
restored without rolling back the current hull, tracks, ERA, or two-band inner
skirt:

- seven stand-off armor cassettes per side use the cited revision's exact
  `x=±1.89`, `y=1.18`, 0.82 m cadence;
- five open slat-cage bays per side retain the cited `x=±2.02`,
  `z=-3.12..1.30`, `y=0.92..1.42` envelope;
- recessed dark seam bridges, backed divider strips, mounting shoes, and one
  shallow continuous upper seat plus inboard fender lip return every cassette
  and cage bay into the retained inner skirt/armor course; the four side-facing
  rail rows remain open/readable, the cage is not a free-standing track
  decoration, and panel joints remain;
- the current segmented fore/rear skirt remains the inner weather/rubber layer,
  so the restoration adds the requested protected silhouette without replacing
  or duplicating the suspension-driven track course.
