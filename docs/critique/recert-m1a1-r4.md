# m1a1 GRADUATE RE-CERT r4 (abrams track-rig + variety round) — 2026-08-03

Scope: dual-gate graduate, re-cert of CHANGED regions only (laneCarve bow/stern
wedges x±1.08 over bowZ [2.60,3.49] / sternZ [−3.61,−2.90] + narrowed tailShelf
ring; wrap-pads migrated to one per-side merged gear mesh; grille doors narrowed
0.50→0.185 onto the surviving ±1.08 wall + TIP box re-mounted 1.42→0.98; §H.4
loadout: stowed M2 across the freed rack + tow-cable run, census mg1+1d).
Graduation cert stands for unchanged views. Renders: fresh
`node tools/tmp-tank-critic.mjs --id=m1a1` → shots/critic-m1a1/ (14 views, zero
console errors). Zoom crops + diff overlays at shots/critic-m1a1/crops/ (tools:
tools/tmp-recert-m1a1-{crops,diff,cablehunt,cableprobe,skycheck,voids}.py).

## Official-rig evidence (my own runs, this tree)

- `tools/track-clip-audit.mjs --exact`: **front 0 / rear 0** (was 1139/683).
  The round's headline, confirmed on the official tool.
- `tools/tank-standard-check.mjs`: gate min **89.4** (91.7/89.4/89.6/93.5/
  100/100), clip 0/0 ✓, contiguity **0 holes** ✓, decor **mg1+1d ✓** (the
  FITTINGS M2 + towCable; roof pintle M2 is the carried hand-authored cert).
- `tools/geometry-gate.mjs`: 89.4 this tree. **Pristine-HEAD cross-check** (git
  worktree at 44600f5, since removed; HEAD renders preserved in session
  scratchpad): pristine HEAD reads **89.4** (91.8/89.4/89.6/93.5/100/100) — the
  sub-90 min is PRE-EXISTING override-path drift exactly as the orchestrator
  stated, independently confirmed ×1. Round cost: hull 91.8→91.7, min unchanged.
  (abrams.js byte-identical 44600f5..f598b08 — baseline exact.)
- `tools/tmp-hashgeo.mjs`: m1a1 **4640af94** (46 meshes / 158680 verts) —
  matches the packet's NEW HASH. Round-active siblings for the landing note:
  m1a1ha b14be581, m1a2_tejas 526341c0, m1a2_tusk f1aebbec.
- `tools/visual-evaluator.mjs --id=m1a1`: exit 0, **no RIG MISMATCH** —
  yawProxy worst 2.08° (front), rest ≤1.87° (abort 10°). Evidence at
  shots/visual-eval-m1a1/.
- **Determinism + render-identical proof** (HEAD-worktree pixel diff, proc
  halves, thresh 8/255; same-tree re-render baseline = 0 px on 5 views):
  view-left/view-right gear band (y 300..420) has **ZERO changed pixels outside
  the two carve windows** — including the z −2.55/−2.71 stern ramp pads that
  sit outside the window boxes. The wrap-pad bucket→merged-gear-mesh migration
  is **render-identical, verified**, not just claimed. Every in-window diff is
  the intended carve (wedge/shelf faces → band/shadow).
- **Evaluator NEW-vs-HEAD flag split** (worktree evaluator run): the round's
  total new measured cost is three short segments —
  1. top: plan corner **Δ−14.0° ±0.7°** len 0.38m at [−1.081, 1.20, 3.204]
     (ref 104.0° chamfer vs proc 90.0° lane step at the carve corner);
  2. left: stern silhouette **Δ+9.0° ±4°** len 0.34m at z −3.666 y 0.73
     (ref 98.0° plate corner vs proc 107.0° honest sprocket-wrap line);
  3. right: bow **Δ+5.1° ±4°** len 0.25m at z 3.435 (at the corner-bias
     floor — marginal, sub-visible).
  ALL other flags/deltas are pre-existing at HEAD (barrel class z≥3.9,
  turret-roof corners y≥2.1, skirt plan corners Δ+10.5/−7.3, rear track-column
  Δbot −0.796 at x±1.65, p95 profiles within 0.02m of HEAD). Rear and front
  views add **zero** new edge flags.
- **Enclosed-void inventory vs HEAD** (flood-fill from border, bg mask
  |px−0x151b20| maxch≤13): front 32=32, left 22=22, right +1 cluster of 4px,
  rear 29 vs 30 (the "new" 622px block at (801,317)-(821,348) is the TIP box's
  near-black face RELOCATED — its 623px twin at the old x 1.42 position
  vanished; solid box, not a hole), close-front +119px under-bow daylight
  pocket (same class as the pre-existing 153/170px front pair and the ref
  half's own 11 clusters), hero-toptilt 40 vs 37 (relocated under-sponson
  slivers; ref half carries 39 same-class). The evaluator's 2.517m²/6.035m²
  void flags are the disclaimed under-barrel / under-sponson-corridor classes:
  §B2 machine scan 0 ✓, ref pair shows the same open regions (leo2a6-r4
  precedent). No see-through regression.

## Per-focus-view verdicts (changed regions, same-vehicle-same-tier)

| view | score | read |
|---|---|---|
| front | 9.3 | Evaluator: 29 matched, **0 flagged** — front slopes clean to the ref (§B1). Tracks in true air under the fender line, no bow clip at 1x (0/0 exact audit). The carve shows only as coherent under-wing shadow slots (MASK: 0.0% bg both sides); zero new voids (32=32). Roof MG silhouettes present. Pre-existing residuals only (p95 Δbot 0.516 = outboard track columns vs ref's flap line, identical at HEAD). |
| close-front | 9.1 | Full idler wrap visible with the two-layer shoe read, NO hull solid through the band; wing bay inner wall (the x±1.08 carve step) reads attached, glacis blade centre intact. All 6 edge flags identical to HEAD (barrel/turret class, worst Δ+8.4 at z 3.91..4.08 = gun region, untouched). New 119px under-bow daylight pocket at (801,404)-(812,422) reads as under-vehicle air, ref half carries the same class. yawProxy 1.1°. |
| rear | 9.1 | **Zero new edge flags** (4 flags = HEAD's own 4, all turret-top class). Narrowed grille doors sit ON the surviving inter-track wall (backing 0.90..1.085 vs wall ±1.08 — 95% contact; slats fully on-wall) — attached, deliberately subdued vs the pale grille; TIP box re-mounted at (0.98, 1.52) on-wall with its lid strip. The vacated outboard spans honestly show the sprocket wraps top-to-bottom, both sides symmetric; no daylight (right span 0.0% bg; left 2.2% = true background at the silhouette edge). TIP face reads near-black against the pale grille — tonal, same class/px-count as its pre-round self (622 vs 623px), noted below. |
| left | 9.0 | Wrap-pads **pixel-identical** outside the carve windows (0 px >8/255 across the whole gear band; the z −2.55/−2.71 pads prove it outside the windows too). Bow/stern windows read as pad-over-shadow, skirt hem intact, stern slit 0.0% bg. New stern silhouette Δ+9.0°±4° (0.34m at z −3.666): the owner's containment law traded the ref-matching wedge corner for the honest wrap line — law-driven, named residual. Tow cable: see F1 — does NOT read (22px total). View undamaged. |
| right | 9.0 | Mirror-clean: gear band 0 px outside windows; new bow Δ+5.1°±4° on 0.25m is at the noise floor. Pre-existing 1-2px stern slit at (1215,301)-(1216,312) (existed at HEAD, sub-visible at 1x). Shelf-ring narrowing reads as shadow bay above the wrap, sprocket drum face attached through the band. |
| top | 9.0 | Deck FILLED (§B2 scan 0; no sky through hull or turret). The four carve corners now show track pads in plan — symmetric, reads as real exposed runs; measured cost is the one new plan flag Δ−14.0°±0.7° (0.38m, left bow lane corner, ref's 104° chamfer vs proc's 90° step). Skirt-corner flags ±10.5/−7.3 are HEAD's own. **Stowed M2 reads at 1x** — dark receiver+barrel across the pale rack floor, muzzle to the crate edge. |
| hero-toptilt | 9.1 | 55° tilt: decks filled, no sky through interiors; stowed M2 + dark crown-riding roof M2 (MG PHYSICS pale-deck inversion, receiver mass ✓) both read. 6.035m² void flag = under-sponson corridor class (disclaimed; ref half 39 same-class clusters; machine scan 0). Carve slivers relocated, net inventory 40 vs 37. |
| close-roof (supporting) | 9.2 | Roof M2 crown-dark with mass, smoke bank, periscopes; wheel discs live below. Changed-region content (rack edge) clean. |
| hero-rearright (supporting) | 9.0 | Sprocket wrap clean under the bustle; rack rails + hoops attached; 2.517m² flag = under-barrel/deck class (disclaimed, ref pair same). |

## §H.4 VARIANT-DISTINCTIVENESS (standing check — tells NAMED)

Pair-read done against a fresh m1a1ha render (shots/critic-m1a1ha/, comparison
strips at shots/critic-m1a1/crops/h4-*):

- **m1a1**: stowed BARE M2 lying across the freed rack floor (muzzle to
  x 0.878) — reads at 1x in top/toptilt and at the rearright quarter; single
  left duffel (rackDufMul [1,0,0]) opens the rack floor.
- **m1a1ha**: same-station M2 **with shield** (reads as the cross-bar at the
  receiver from top, plate from quarters) + spare-link strip on the freed
  floor + its own red-brown camo tint (tint is paint, not a loadout tell).
- **m1a2_tejas / m1a2_tusk**: [0.7,0,1] duffel pattern, stowed M240 (MAG
  class, smaller silhouette), antenna pot at the rear post, plus their
  structural CROWS/TUSK kits — strong tells, not re-badges.
- **F1 (the round's one delivery gap)**: the m1a1 **tow-cable run does NOT
  render**. Forensic: its total footprint across ALL 14 official views is
  ~22px — three 2-4px specks in view-left at (807,276)/(869,281)/(929,277)
  (the catenary high points grazing the −1.695 flank plane); rows above/below
  read maxΔ 0 vs HEAD. Placed tangent-inside the certified flank plane, it is
  occluded by the very wall it dresses. Census-true (the 1d), render-false.
  m1a1↔m1a1ha distinctiveness therefore rests on the shield/links alone —
  thin but present, era-appropriate. NOT 'same tank re-badged', but the
  cable's read must be restored to deliver the owner directive as written.

## RE-CERT: YES

All changed views ≥9.0 (min 9.0 left/right/top; max 9.3 front). §B1 front
slopes 0-flagged; §B2 zero new see-through (machine scan 0, inventory matched
to HEAD); §B3 census mg1+1d with the roof M2 carried; §B4 containment
1139/683 → **0/0 on the exact audit** with the wrap read verified at 1x in
every focus view. Gate 89.4 = pristine HEAD's own 89.4 (drift pre-existing,
confirmed independently); hash 4640af94 matches the packet. Re-freeze at the
orchestrator's landing is approved from the critic side.

### Coordinate orders

1. **CABLE READ (F1 — strongly recommended INSIDE this still-open
   graduate-change round; non-blocking for the view scores, but it is the
   cheapest moment to make the §H.4 claim render-true)**: relocate the
   towCable run off the occluded turret band onto the LEFT SKIRT TOP STEP,
   hull frame, tangent-inside the ±1.812 skirt plan extent (zero plan/
   silhouette cost, sun-catching in left/rearleft/hero-frontleft):
   pts ≈ [[−1.79, 1.30, −2.20], [−1.785, 1.24, −1.10], [−1.79, 1.28, 0.10],
   [−1.786, 1.22, 1.20]] (eyes:false, seed kept). Acceptance: ≥200px
   footprint in view-left at 1x (re-run tools/tmp-recert-m1a1-cablehunt.py
   class of check), gate line ×2 unchanged, spot re-render left/rearleft.
   Alternative if the skirt band is judged busy: turret wall proud at
   x −1.72 with a PALE-REFUND pair (≤0.4 pintle-allowance budget check).
2. **TIP-box tone (optional, cosmetic)**: the relocated box face reads
   near-black at 1x against the pale grille (622px bg-tone at rear-view
   (801,317)-(821,348)). A mid-dark detail slot or a lid seam split would
   stop the black-cutout read. Same tone class as pre-round; no §B law hit.
3. No orders on containment, doors, wrap-pads, or the stowed M2 — verified
   clean.

### Law candidates for the bank

- **Render-truth floor for §H.4 tells**: a tell placed tangent-inside its own
  occluder is census-true and render-false (this cable: 22px/14 views).
  Propose: every packet §H.4 tell names its carrying view; critics verify a
  minimum on-view footprint (≥200px at 1x or equivalent) before counting it.
- **Tooling**: tone-based void masks false-positive on hullDark faces (the
  TIP box). The evaluator's depth-based void detector + §B2 machine scan stay
  authoritative; MASK-METHOD rects need the enclosed/tone/geometry
  cross-check (tools/tmp-recert-m1a1-voids.py pattern).

Residuals (declared, priced, non-blocking): top plan corner Δ−14.0°±0.7°
(0.38m, left lane step vs ref chamfer — owner containment law outranks the
plan-parity read); left stern Δ+9.0°±4° / right bow Δ+5.1°±4° honest-wrap
silhouette trades; rear outboard columns Δbot −0.796 vs ref's mudflap line
(pre-existing at HEAD; if ever ordered, flaps must stay outboard-clear of the
wrap per §B4 — leopard r4 'rear plate between the sprockets' law); TIP box
black read (order 2, optional); pre-existing 1-2px right stern slit.
