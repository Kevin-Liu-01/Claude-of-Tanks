# SHADED-PARITY VERDICT — T-90 family trio (t90 · t90ms · t90a_burlak), §5.38 owner-priority round

Independent §B8 critic, 2026-08-08. Adversarial to the builder's packets; every number
below is my own run on the official rigs. IDENTITY is the bar (§5.60: the trio's gate
rows are documented build-vs-print ladder caps — NOT penalized here; presentation
verified CLEAN in my own pairs: every ref half renders forward-correct, no yaw artifact).

## 1. Header / provenance

- Candidates (tmp-hashgeo, bracketed BEFORE all browser work, before the render batch,
  and AFTER the last render — stable all four reads):
  t90 `c9e7dcd8` (58 meshes / 86449 verts) · t90ms `8eae0c78` (49/78885) ·
  t90a_burlak `847b7184` (52/78995).
- Family guards stable: t90m `e345ee8a`, t90sm `d98f27dc`, t90a `265610e2`,
  t90a_vladimir `bdfe7d24`.
- Tree: trio WIP uncommitted in src/vehicles/profiles/russia.js + userdrops7 (marker
  grep 6/6 immediately pre-batch). Mid-window landing ff5b005→327ca77 (MOBILE-QA r6)
  adjudicated: `git diff --stat` over src/vehicles/ + src/engine/ + all critic/gate
  harnesses = EMPTY — render path byte-clean, evidence valid.
- Load-gate: 14.94 (<15) at render start. One cot-shots FIFO ticket for the whole
  14-view+yaw90+garage batch (tools/tmp-critic-t90fam-batch.mjs, korea-critic clone,
  zero console errors, 27 sheets/id + 6 garage panels per landed comparator).
  Official rigs run bare (self-ticketing).
- Evidence: shots/critic-t90fam/<id>/ (mine) · builder boards shots/t90fam/*-board.png
  (used AFTER hash verify, claims-audit only).

## 2. Standing checks (§F.4, measured by me)

| check | result |
|---|---|
| geometry-gate ×2 | EXACT both runs vs ledger: t90 24.9 (67.5/40.2/41.6/24.9/95.2/100) · t90ms 11.7 (71.5/50.8/11.7/45.8/95.4/100) · burlak 0 (53/23.6/0/0/75/100) — §5.60 capped rows, not scored |
| tmp-hashgeo bracketing | stable across whole window (4 reads) |
| track-clip-audit --exact | OVER BAR all three: band f/r 112/89 · 118/66 · 112/66; shoe f/r 215/351 · 233/267 · 215/321 (bar ≤~60, 0-target new builds). Family context: donor t90a reads 331/403/591/608; t90m + t90sm read 0/0/0/0 — achievable on this family. Blind spots 0. ORDER, not blocker-alone |
| turret-parent-audit | stranded: t90 1, t90ms 1 (both fitting_spareTrackLinks at deck y1.47–1.55, z+0.23..0.92 — INSIDE casting AABB span = documented audit-artifact deck-gear class; yaw90 renders show no stranded kit) · burlak 0. dangling 0×3. t90ms abutting 2 = stern unditching logs (deck gear ⇒ leave). ADJUDICATED CLEAN |
| tank-standard-check | mg≥1 ✓×3 (t90 mg1+8d, t90ms mg1+5d, burlak mg1+5d). §B2 contig: t90 2 cells (±1.56,−3.05), t90ms 8 cells (±1.18,−3.39 ×3c + −1.56,−3.05), burlak 0 ✓ |
| visual-evaluator | RIG PARITY OK ×3 (exit 0; worst yawProxy 5.0° t90 close-front, abort bar >10°) |
| §J yaw-90 pairs | re-rendered at verdict hashes: §B5 UNITY PASS ×3 — dome+rails+kit, shield+bustle+side box, casting+mega-bustle all rotate whole |
| §B3.1 bore | muzzle hole reads ×3 (dead-front crops) |
| §C missing-side | left/right kit symmetric ±intentional asymmetries ×3 ✓ |

## 3. HEADLINE VERDICT — ALL THREE FAIL the 9.0 bar

| id | headline | min view | verdict |
|---|---|---|---|
| t90 | **7.0** | 6.0 (close-roof) | FAIL |
| t90ms | **6.5** | 5.5 (rear) | FAIL |
| t90a_burlak | **6.5** | 5.5 (rear) | FAIL |

Hygiene passes (hashes, gate-exactness, rig parity, yaw90 unity, bores, mantlet
collars, wheel countability, trio distinctness at garage). Identity fails — the same
§5.61-class turret-grammar gap, three ways.

## 4. Per-view scores

t90: front 7.5 · frontleft 7.5 · left 7.0 · rearleft 7.0 · rear 6.5 · rearright 7.0 ·
right 7.0 · frontright 7.5 · top 6.5 · hero-frontleft 7.5 · hero-rearright 7.0 ·
hero-toptilt 6.5 · close-front 7.5 · close-roof 6.0

t90ms: front 6.5 · frontleft 7.0 · left 6.5 · rearleft 6.0 · rear 5.5 · rearright 6.0 ·
right 6.5 · frontright 7.0 · top 6.0 · hero-frontleft 7.0 · hero-rearright 6.0 ·
hero-toptilt 6.5 · close-front 7.0 · close-roof 6.5

t90a_burlak: front 6.5 · frontleft 7.0 · left 6.0 · rearleft 6.0 · rear 5.5 ·
rearright 6.0 · right 6.5 · frontright 7.0 · top 6.0 · hero-frontleft 7.5 ·
hero-rearright 6.0 · hero-toptilt 6.5 · close-front 7.0 · close-roof 6.5

## 5. The killers (exact, with views)

### SHARED — per-construction in the shared t90a-base make() (all three)

1. **§5.29 CHEVRON AS WIRE** (top, front, close-front, close-gunfront, both heroes,
   garage): the V is two THIN RAILS (~0.1 m beams + stand-off brackets) floating over
   a smooth shell. §5.29 demands TWO PANELS with real plan area meeting at a pointed
   tip. The landed kin prove the grammar (t90a/t90m/t90sm cheek wedge BANKS read as
   armor masses at garage angle). Fix per mark: t90 = K-5 clamshell LEAF BANKS on the
   packet's own V line (±0.30,1.42)→(±1.62,0.45); t90ms = Relikt cheek WEDGES whose
   edges ARE the plan silhouette; burlak = the '<' module pair. Measurable: chevron
   plan footprint ≈ the print's leaf-band coverage; today it is two <0.15 m lines.
2. **ONE SHARED EGG/SHIELD TURRET PLAN** (top, rear, hero-toptilt): all three plans
   are the same rounded egg/shield with a bald crown — "same front re-badged" inside
   the trio (§H.4) and off-grammar vs the §5.13 family. t90's cast dome is the RIGHT
   call for the 1992 mark but needs the angular clamshell front + crowded crown (K-5
   roof plates as raised panels — the current crown carries one floating TAN SHEET,
   §B3 mystery-slab, close-roof 6.0); its max chord also sits rear of mid (packet:
   max chord ~mid-dome, 1.66@−0.27). t90ms MUST read welded PRISM in plan (straight
   cheek edges, parallel flanks) — it reads rounded shield. burlak keeps the rounded
   front but needs the print's staircase taper (1.6→1.05→0.77) + module plates.
3. **FLOATING-SLAT ERA ROWS** (close-gunfront, close-front, view-front, sides, garage
   — all three): glacis + bow ERA authored as thin shelves standing OFF the plate
   with visible air slots beneath + BLUE untinted cells in every row (blue plastic
   read on green/sand tanks, visible at garage). Violates NO-AIR + K-5 brick grammar:
   author flush brick courses ON the falling plate at the packet's own z-bands; kill
   the blue-material sub-elements.
4. **LOUD-CARRIER TONES (§C detail-slot class)** (rear, top, closeups, garage): flat
   TAN masses — t90 crown sheet + transom rack band; mud-flap slabs ×3; burlak cheek
   modules + roof-front field read as dark-brown decals; t90 fender bins — plus
   PALE/SALMON wheel rims on all three (t90m's drums lesson, banked). Retint/re-bucket
   to family mats.
5. **§B4 rows over bar** (machine, family-inherited): shoe 215–351 per zone vs ≤~60
   (donor t90a worse at 591/608; t90m/t90sm prove 0/0). Re-seat bow/stern plates +
   flaps off the shoe envelope during the fix round.
6. **§B2 cells**: t90 2 (stern corners), t90ms 8 (slat-cage corners + stern) — close
   them (t90m holds 0; adjudicate any true slat-armor air as authored-open-structure
   with receipts, don't leave enclosed pockets).

### t90 (base 1992)

7. **NSVT is a wire** (close-roof, front, top): barrel line only — no receiver,
   cradle, ammo box at 1×. §5.29 "MG prominent on the cupola"; t62mv1 DShK recipe.
   The RED Shtora eyes + collar/boot + smoke banks + splash strip all READ ✓ — keep.
8. **Rear rack + log read as a tan smear** (rear, hero-rearright): author the split
   log as a cylinder with end grain + the rack as a bin row (print: band tops
   1.58–1.68 at z −3.24..−3.58 authored to the −3.60 sliver line).
9. **Ring-skirt brim** (rear, rearleft/rearright): the ringSkin flares into a hat-brim
   shadow line all round — tuck it; the print's skirt is 1.408 close-fitting.

### t90ms (Tagil)

10. **Slat cage = louver grille INSET in the bustle rear face** (rear 5.5, rearleft,
    rearright): must be a STAND-OFF lattice BEHIND the bustle tail (print: cage to
    −3.27 behind bustle −2.79, x ±1.0..1.09) with open air/shadow between — the
    merkava authored-open-structure class. Today it reads as an engine radiator.
11. **Perimeter "cage" = one pipe railing** (rear, sides): the full-perimeter bar
    armor is a single round rail on stanchions; author the multi-bar bank (≥3 bars,
    print cage01_hull wraps rear flanks + transom to ±1.89).
12. **Bustle invisible in plan** (top 6.0 — the gate's own 11.7 receipt): the bustle
    exists (yaw90 proves it) but reads flush with the deck at rest — needs the
    squared silhouette + side shadow separation + the module ROWS down both flanks
    (print detachparts x ±1.33, y 1.68–2.12, z −3.05..−0.88); the current single
    plain box on the left is a §B3 mystery crate (no lid seams/latches).
13. **Square-section mid-barrel** (left, frontleft): the 2A46M-5 thermal sleeve step
    renders as a rectangular slab section — make the sleeve steps cylindrical.
14. Positives kept: sand paint (the garage tell vs t90sm ✓), low-profile RWS + pano
    spike (cap-compliant, forward-facing ✓), Sosna housing right of gun ✓, corner
    smoke banks ✓, tall skirt wall present (needs its 3-panel articulation depth).

### t90a_burlak

15. **Bustle proportion inverted** (rear 5.5, left, top, yaw90): the bustle renders
    WIDER than its own front casting and its rear face reads ~2.4–2.6 m with a
    garage-door inset panel; the print's bustle is the NARROW long magazine
    (x |0.63|..|0.96| ⇒ ~1.9 m max, roof 2.245–2.30, tail −3.66) riding OVER the
    deck, clearly narrower than the casting (±1.6). Restore the hierarchy: narrow
    long box + feed/ejection hatch grammar on its roof, plain tail, engine-deck
    cover visible UNDER the overhang (it exists — keep).
16. **Commander Kord = L-bracket** (close-roof): the left-rear cluster (cupola +
    pano + periscopes) is present ✓ but the MG reads as a bent bracket — real
    receiver/barrel mass (t90a Kord recipe, pintle sunk per cap 2).
17. **Casemate side-merge** (left 6.0): turret + bustle + module band read as ONE
    slab from pure side — the casting/bustle step + module standoff lines must
    break the run (print: casting z −1.55..+1.05 vs bustle from −1.7).

## 6. Claims audit (packets + boards)

- Packet gate rows: reproduced EXACT ×2 (r2/r3 "BIT-IDENTICAL PAIR" claims corroborated).
- §5.60 presentation-clean: corroborated in my pairs (all ref halves forward-correct).
- Board IoU lane (81.3 / 83.5 / 79.4): credible for what it measures — my renders
  reproduce the same geometry, and the boards' OWN turret components (53.5 / 61.6 / —)
  flag exactly the zone my verdict kills. IoU does not rescue §B8 identity.
- "Distinct reads at a glance": TRUE at garage angles (green dome+eyes / sand
  prism+bustle / green mega-bustle) — but distinctness inside the trio leans on bulk
  + paint while all three share the same wire-V/egg front grammar (§H.4 residual).
- §5.13 kinship: hull = kin ✓ (t90a-base reads through). Turret grammar diverges
  from the approved t90sm/t90m welded family read (panel banks) — closing defect 1+2
  restores kinship.

## 7. Residuals certified (not penalized)

- Gate component caps per §5.60 (t90 turret p95 13.3% antenna/roof cols; t90ms
  bustle-cage plan footprint; burlak plan footprint + §B7 width-normalization cap +
  dims-75 bustle-span datum, ASK-OWNER banked).
- AW sunk-turret interpen (§B7 print stylization, all three prints).
- burlak overallLengthM 9.76 honest-variant (ASK-OWNER banked at landing).
- t90 NSVT-prominence-vs-heightM trade (§5.37 polish bank) — the fix in defect 7 must
  stay inside the p95 grace (receiver ≈2.24, barrel drooped).

## 8. Law candidates for the bank

- WIRE-CHEVRON CLASS: a §5.29 V whose members read <0.15 m wide in plan is a rail,
  not a panel — chevron orders must carry a plan-footprint number, and critics should
  measure the V's plan area vs the print's leaf band, not just tip presence.
- GRILLE-INSET SLAT FALSE-FRIEND: slat/bar armor authored as a recessed louver panel
  INSIDE a face passes contiguity and reads as a radiator — slat orders must specify
  STAND-OFF geometry (gap + open air behind).

## 9. Orders

FAIL → fix round on the live WIP (russia.js single-writer): close defects 1–6 shared,
7–9 (t90), 10–14 (t90ms), 15–17 (burlak); fresh independent sitting on new hashes at
delivery. Landing of russia.js + userdrops7 + packets + ledger rows HOLDS pending that
sitting (the §5.38 turret shape-ladder queues behind it).

---

# SITTING 2 — fix round adjudication (independent critic, 2026-08-08)

Adversarial §B8, fresh agent, self-reads never accepted. All evidence re-shot
on my own rigs at the fix-round hashes.

## 1. Header / provenance

- Hashes (tmp-hashgeo, bracketed at sitting start, immediately pre-batch, and
  post-batch — stable all three reads): t90 `fe57fdf4` (57/88393) ·
  t90ms `a8aceea0` (49/81945) · t90a_burlak `8ef4d428` (51/79643). Family
  guards stable: t90m `e345ee8a` · t90sm `d98f27dc` · t90a `265610e2` ·
  t90a_vladimir `bdfe7d24`.
- Tree: trio WIP uncommitted in russia.js + userdrops7 (20 CRITIC-FIX markers
  grep-verified pre-batch). Mid-window landing c58be68→6c36267 (batch-52b, k2)
  adjudicated: diff touches src/vehicles/modern3.js ONLY — trio render path
  byte-clean, evidence valid.
- **LOAD-GATE EXCEPTION (documented)**: 1-min <15 unreachable this window — a
  foreign iOS-simulator QA lane held the box at a 20–26 plateau with bursts to
  201 (MTLCompilerService storm + a sibling worktree perf chain). Waited 66 min
  across four bounded waiters; batch fired at ~23 AFTER the sibling perf chain
  exited (never concurrent with foreign timing runs). Determinism receipts:
  geometry-gate ×2 BIT-IDENTICAL at load 24–26 this sitting; batch exit 0, zero
  console errors ×7, empty-half sanity armed. No timing-sensitive row in this
  battery.
- One cot-shots FIFO ticket for the whole batch (tmp-critic-t90fam-s2-batch.mjs,
  diff-clean clone of the sitting-1 driver, output-dir-only delta). Official
  rigs ran bare (self-ticketing; queue empty throughout).
- Evidence: shots/critic-t90fam-s2/<id>/ (27 sheets ×3 + 6 garage panels ×4 kin)
  · builder boards read AFTER hash verify, claims-audit only.

## 2. Standing checks (§F.4, measured by me)

| check | result |
|---|---|
| geometry-gate ×2 | EXACT both runs vs packets: t90 29.8 (68.2/42.5/43.2/29.8/95.2/100) · t90ms 20.7 (72.7/51.3/20.7/41/95.4/100) · burlak 0 (52.7/23.1/0/0/75/100). §5.60-capped rows, not scored. **Both ORDERED-TRADE receipts verified**: t90ms stations 45.8→41.0 (−4.8, bustle plan-presence order) · burlak whole 23.6→23.1 (−0.5, rear-taper order) — owner-order-over-rows class, acknowledged not penalized. t90 min +4.9 IMPROVE, t90ms min +9.0 IMPROVE |
| track-clip-audit --exact | t90 0/0 band + 0/0 shoe ✓ (from 112/89+215/351) · burlak 0/0 + 0/0 ✓ (from 112/66+215/321) · t90ms 16/0 + 14/0 = the brief's pre-declared legal rows ✓ |
| tank-standard-check | §B2 contig 0 ✓×3 (from 2/8/0) · mg1+8d / mg1+5d / mg1+5d ✓ |
| turret-parent-audit | burlak 0/0/0 CLEAN · t90 stranded 1, t90ms stranded 4 — all fitting_spareTrackLinks/unditchingLog = the documented deck-gear audit-artifact class (t90ms count grew because the ORDERED bigger bustle AABB now spans the stern); yaw90 renders prove hull parenting (gear stays put under turret yaw). dangling 0×3 |
| visual-evaluator | exit 0 ×3, worst yawProxy 5.4° (t90 close-front), abort bar >10° — RIG PARITY OK |
| §J yaw-90 | §B5 UNITY PASS ×3 — dome+leaves+eyes+rack+NSVT · prism+wedges+bustle+rows+cage+RWS · casting+modules+chin+narrow-bustle+Kord all rotate whole; burlak engine-deck cover stays hull-side |
| §B3.1 bore | muzzle reads ×3 |
| §C missing-side | symmetric ± print asymmetries ×3 ✓ |
| MG-forward | NSVT fwd (t90) · RWS fwd (t90ms) · Kord fwd (burlak) ✓ |

## 3. HEADLINE VERDICT — ALL THREE PASS at 9.0

| id | s1 | s2 headline | min view | verdict |
|---|---|---|---|---|
| t90 | 7.0 | **9.0** | 8.5 | **PASS** |
| t90ms | 6.5 | **9.0** | 8.5 | **PASS** |
| t90a_burlak | 6.5 | **9.0** | 8.5 | **PASS** |

## 4. Per-view scores (sitting 2)

t90: front 8.5 · frontleft 8.5 · left 8.5 · rearleft 8.5 · rear 8.5 ·
rearright 8.5 · right 8.5 · frontright 8.5 · top 9.0 · hero-frontleft 9.0 ·
hero-rearright 8.5 · hero-toptilt 9.0 · close-front 9.0 · close-roof 8.5

t90ms: front 8.5 · frontleft 8.5 · left 8.5 · rearleft 9.0 · rear 8.5 ·
rearright 8.5 · right 8.5 · frontright 8.5 · top 9.0 · hero-frontleft 9.0 ·
hero-rearright 8.5 · hero-toptilt 8.5 · close-front 9.0 · close-roof 8.5

t90a_burlak: front 8.5 · frontleft 8.5 · left 8.5 · rearleft 9.0 · rear 8.5 ·
rearright 8.5 · right 8.5 · frontright 8.5 · top 9.0 · hero-frontleft 9.0 ·
hero-rearright 9.0 · hero-toptilt 8.5 · close-front 8.5 · close-roof 8.5

## 5. Kill-check of the 17 — ALL DEAD in my pixels

SHARED: (1) §5.29 chevron-as-wire DEAD ×3 — t90 K-5 clamshell LEAF BANKS
proud of a brim-tucked dome on the packet V line w/ vertex gap plate (top,
close-gunfront); t90ms Relikt WEDGE BANKS whose edges ARE the plan silhouette;
burlak chunky '<' MODULE PAIR + chin block closing the V. Plan footprints are
real panel areas, not <0.15 m rails. (2) one-shared-egg DEAD — three distinct
plan grammars now (crowded-crown dome / parallel-flank prism / staircase-taper
into narrow bustle). (3) floating-slat rows DEAD ×3 — per-plane rake, bricks
sunk into the plate, gap blocks→flush seams; light pods re-seated to fender
shelves (blue reads only as small intended lenses). (4) loud carriers DEAD —
tan crown sheet deleted (SCHEME K-5 roof panels), bins/flaps scheme-bodied
w/ seams+latches, no salmon rims; residual thin warm accents (tow ropes,
module edge bands, wood log = wood) are polish-class. (5) §B4 receipts above.
(6) §B2 0×3.
T90: (7) NSVT receiver/cradle/ammo mass at 1×, receiver at the 2.24 cap ✓.
(8) transom bin ROW + split log w/ end-grain discs + straps ✓. (9) ring-skirt
brim tucked ✓.
T90MS: (10) slat cage = STAND-OFF lattice, backdrop deleted, OPEN AIR reads
through the cells and behind (plan shows ~0.5 m gap behind the bustle tail,
print-true; the grille-inset false-friend is dead). (11) perimeter = 4–5-bar
bank + dense verticals + transom weave wrapping rear flanks ✓. (12) bustle
present in plan w/ squared silhouette + SEAMED module rows BOTH flanks +
ejection port ✓ (station cost = the documented ordered trade). (13) mid-barrel
cylindrical ✓. (14) positives all kept (sand, low RWS fwd, Sosna right,
corner banks, tall 3-panel skirts).
BURLAK: (15) hierarchy RESTORED and MEASURED — AABB vertex census: bustle
walls ±0.82–0.84 (≈1.68 m, the narrow ~1.9m-class magazine) vs casting
±1.50–1.54 (≈3.05 m); tail zone (z −3.7..−3.3) carries nothing wider than
±0.96; roof feed/ejection hatch plates + plain tail + engine-deck cover
visible under the overhang. The dead-rear "wide" read = the casting+modules
silhouette layered BEHIND the proud narrow bustle (ortho flattening), correct
in every depth view. (16) Kord = receiver/cradle/barrel mass ×1.25 fwd;
missing shield NOT penalized (dims-law-blocked, receipts in the packet).
(17) side carve — casting/bustle step + vertical step plates break the run ✓.

## 6. §5.13 / §H.4 / claims audit

- Kinship: hull grammar kin ✓; the three turret grammars now speak the family
  panel-bank language (t90a/t90m/t90sm exemplar class) while staying
  three-marks-distinct at garage glance: green dome + red eyes / sand prism +
  cage / green mega-bustle. §H.4 "same front re-badged" residual: CLOSED.
- Builder packets: gate rows reproduced EXACT ×2; both ordered-trade rows
  match the brief's receipts; boards (81.4/83.2/79.3) corroborate — IoU
  stable vs s1 as expected (silhouette metrics are blind to panel grammar;
  the reworked zones read in the shaded lanes).

## 7. Residuals (certified, polish-class — not blockers)

- §5.60 gate caps stand as documented (incl. burlak turret-plan footprint,
  §B7 width cap, dims-75 bustle-span datum, 9.76 ASK-OWNER banked).
- Crown/roof kit granularity vs the prints (cabling, small boxes, burlak left
  rail-bin stack density) — ordinary §5.37 polish-bank material.
- t90ms turret bulk vs ref at hero angles (cap + ordered-trade class).
- Thin warm accents (tow ropes, module edge bands) — tone-polish nits.
- t90 close-front ortho framing differs between halves (rig box artifact).

## 8. Orders

PASS ×3 → land the round: russia.js + userdrops7 + the three gate packets +
reference docs + ledger rows. The §5.38 turret shape-ladder queues next as
planned. Law candidates from sitting 1 (WIRE-CHEVRON plan-footprint numbers;
GRILLE-INSET slat false-friend) both validated by this fix round — recommend
ratification.
