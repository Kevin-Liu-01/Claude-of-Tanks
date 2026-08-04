# m1a1 GRADUATE RE-CERT r5 (tow-cable relocation, F1 closure) — 2026-08-04

Scope: dual-gate graduate, focused re-cert of the ONE changed region — the r4
F1 tow cable relocated off the occluded turret band onto the LEFT SKIRT TOP
LEDGE, hull-frame seated (FITTINGS.towCable eyes:false seed 3, r 0.021, knots
x −1.776..−1.788 / y 1.431..1.437 / z −2.20..1.20, + 3 hullDark clamp blocks
at z −2.16/−0.45/1.16), src/vehicles/profiles/abrams.js ~1975-1998. The r4
re-cert (YES, all views ≥9.0) stands for everything else; r4-certified regions
spot-checked only. Renders: fresh `node tools/tmp-tank-critic.mjs --id=m1a1`
(14 views, zero console errors) + `node tools/visual-evaluator.mjs --id=m1a1`
(§D official rig). Crops + scans: shots/critic-m1a1/crops/r5-*,
tools/tmp-recert-m1a1-r5-cablescan{,2}.py.

## Official-rig evidence (my own runs, this tree)

- `tools/tmp-hashgeo.mjs`: m1a1 **e500174c** (46 meshes / 158932 verts) —
  matches the packet's NEW HASH. Siblings byte-frozen: m1a1ha b14be581,
  m1a2_tejas 526341c0, m1a2_tusk f1aebbec — all verified this round.
- `tools/geometry-gate.mjs` ×2: **89.4 both runs, component-identical**
  (91.7/89.4/89.6/93.5/100/**100**) — the documented pre-existing
  override-drift baseline, with **floaters 100**. The r4-deferred attempt
  died exactly here (turretG-seated hull coordinates → yaw-90 island →
  floaters 0); the hullG-seated delivery holds 100. Root cause banked.
- `tools/tank-standard-check.mjs`: clip 0/0 ✓, contiguity 0 holes ✓, decor
  **mg1+1d ✓** — the cable remains the census 1d and is now render-true.
- `tools/track-clip-audit.mjs --exact`: front 0 / rear 0 (r4 containment
  intact — spot-check).
- `tools/visual-evaluator.mjs`: exit 0, **RIG PARITY OK** (max yawProxy 2.1°
  @front, abort is 10°). **Zero flagged edges in the cable band** (z −2.2..1.2,
  y 1.30..1.55) in left/frontleft/rearleft/top. Every r4-quoted number on
  unchanged classes reproduces EXACTLY: front 29 matched/0 flagged, close-front
  worst Δ+8.4° z 3.91..4.08 (gun class), top worst Δ−14.0°±0.7° (r4 lane-carve
  residual) + skirt plan corners Δ+10.5/−7.3, left stern Δ+9.0°±4° len 0.34m
  z −3.67 (r4's named honest-wrap trade), rear track-column Δbot −0.796 at
  x −1.65 — all pre-existing, none in this round's region. Evidence:
  shots/visual-eval-m1a1/.

## Cable delivery — acceptance terms vs measured (direct footprint, fresh renders)

Measured with tools/tmp-recert-m1a1-r5-cablescan2.py (dark-core scan in
interior zones; method note below).

| acceptance | claim | measured (mine) | verdict |
|---|---|---|---|
| (a) ≥200px in view-left | 600px diff, bbox (783,276)-(976,316) | **545px direct footprint, 192 CONTIGUOUS columns x 784..975** (rows 311-317, y-mid drift 313.5→314.0), thickness 2-3px | PASS 2.7× — claim bbox reproduced within 1px (its y-top 276 = the r4 turret-band specks REMOVED, per r4 forensic coords) |
| quarters/hero | +457/458/474px | frontleft **395px** (140-col run), rearleft **340px** (140-col run), hero-frontleft **598px** (108-col run) | PASS — all carry a 1x-readable run (claims were diff-counts incl. removal + AA; same magnitude) |
| view-top | 476px | **190-row contiguous dark core** (rows 145..334 ≈ 3.36m = the run's length) hugging the left plan edge; plan mask edge CONSTANT at col 857/858 through the cable rows | PASS — present in plan, **zero plan-silhouette cost** |
| view-right | 0 | mirror band longest dark run 50 cols (pre-existing panel detail), **no cable-class 190-col signature**; m1a1ha same band **0 dark px** | PASS |
| (b) rests ATTACHED (§B2) | tangent + clamps | bottoms 1.410..1.416 on the **1.41 ledge** (0-6mm = sub-pixel tangency), contact-shadow row under the full run (luma 54-57 vs surround 65-86), clamp blocks stake both ends + mid (merged thickenings side-on; ends read staked in the 4x crop), bg-below-cable samples 0/21 | PASS — reads seated, not floating |
| (c) gate + census | 89.4 ×3, floaters 100 | 89.4 ×2 component-identical, floaters 100, mg1+1d | PASS |

Geometry cross-check (code, packet claims verified): cable outer face
−1.809 ≥ −1.810, INSIDE the ±1.812 skirt plane; clamp outer faces flush at
−1.812 exactly; tops ≤1.458 under the 1.48 deck side line and on the ref's own
1.37-1.48 skirt-zone band. TEJAS_HULL sets noCable:true — this run is m1a1's
only cable; the old turret-band run is gone (no leftover).

## Per-focus-view verdicts (changed region, same-vehicle-same-tier)

| view | score | read |
|---|---|---|
| left | 9.3 | The carrying view delivers. One clean dark cable line seated ON the skirt-top step across z −2.2..1.2 — 545px, 192 columns contiguous, tube volume reads at 4x (2-3px core, top-light gradient, contact shadow under the run), ends staked by clamps. Not floating (tangent + 0/21 bg-below), not a paint stripe (volume + terminations + the m1a1ha pair strip shows the identical band EMPTY). Zero new silhouette flags; gate line unmoved. Residual (cosmetic, non-blocking): the run reads taut/clamped-straight, not sagged — era-true for a clamped skirt-ledge stowage run (the knots' 6mm undulation is sub-pixel at 56.8px/m), but a hair less "rope-like" than the r4 order's catenary sketch. |
| frontleft | 9.2 | 395px, 140-col contiguous diagonal run riding the ledge line, clean standoff read against the wall band; no new in-band flags; quarter silhouette classes = r4's own (rear-left 83.8° etc. pre-existing). |
| rearleft | 9.2 | 340px, 140-col run, same seated read from behind; skirt hem/step intact; no new flags (upper 175.8°/rear-right classes = r4 inventory). |
| hero-frontleft | 9.2 | 598px in perspective along the flank — the sun-catching left-side read the relocation was ordered for; arcs/parity unchanged (paired arc 1 = r4's). |
| top | 9.1 | Plan read undamaged: left mask edge dead-constant col 857/858 through the cable rows (zero plan cost, measured); the cable itself present as a 190-row dark core against the ledge band; stowed M2 still reads at 1x; plan flags = r4's own (Δ−14° lane corner, ±10.5/−7.3 skirt corners). |
| right (spot) | 9.0 | Null-verified: no cable bleed (longest band run 50 cols = pre-existing panel detail); digest classes all known (turret-roof y≥2.1, deck lines, r4 bow-carve fender zone z 3.4-3.8); standing cert holds. |
| rear / front / toptilt / close-* (spot) | 9.0-9.2 | No regression: front 29/0-flagged identical to r4; rear grille-on-wall + TIP + symmetric wraps as certified (TIP still dark — r4's optional order 2 untaken, still optional); toptilt decks filled, both MGs + cable read, void flags = the disclaimed under-barrel/under-sponson classes at r4's own values (2.517/6.035 m²). |

## §H.4 VARIANT-DISTINCTIVENESS (standing check — the round's point)

Pair strip: shots/critic-m1a1/crops/r5-h4-left-m1a1-vs-m1a1ha.png (fresh m1a1
vs certified frozen m1a1ha b14be581, same band 2x).

- **m1a1**: bare stowed M2 across the rack floor **+ the now-VISIBLE clamped
  tow cable on the left skirt ledge** — the second tell is restored and reads
  at 1x in its named carrying view (545px) and in both left quarters + hero.
- **m1a1ha**: shielded M2 + spare-link strip; its cable band measures **0 dark
  px** — the tell is exclusive, the garage pair-read is instant.
- F1 is CLOSED as the owner directive intended: tell named, carrying view
  named, on-view footprint ≥200px verified (2.7×).

## RE-CERT: YES

All changed/focus views ≥9.0 (min 9.1 top among changed views; left 9.3). The
one r4 delivery gap (F1) is closed render-true with zero gate, plan, or
silhouette cost; containment/census/contiguity spot-checks clean; every
pre-existing residual sits at its r4-documented value. Re-freeze m1a1 at
**e500174c** at the orchestrator landing is approved from the critic side.

### Coordinate orders

None blocking. Carried optional (from r4, cosmetic): TIP-box tone detail slot.
Declined-not-ordered: adding catenary sag (a mid-span knot at y ≈ 1.415 would
read +1px of drape) — the clamped-straight run is era-correct for this
station; change only if the owner asks for the rope look.

### Law candidates for the bank

- **Frame-seating law (root cause of the r4 deferral, now proven both ways)**:
  §H.4 fitting coordinates are FRAME-SPECIFIC — hull-frame values seated into
  turretG survive zero articulation poses (yaw-90 swung the run to world
  x −2.55 mid-air → floaters 0); the same values in hullG are pose-static by
  construction. Rule: seat a fitting in the frame its coordinates were
  authored in, and every relocation acceptance includes a floaters-bearing
  gate run.
- **Near-bg dark tones defeat MASK-METHOD (r4 tooling note, confirmed +
  sharpened)**: the cable core renders (23,24,21) — INSIDE the bg tolerance
  |px−0x151b20| maxch ≤13. Any bg-masked scan EATS the darkest fittings
  (this round's first scanner produced a false 22px-class undercount and
  false gaps until the bg-exclusion was dropped for interior zones —
  tools/tmp-recert-m1a1-r5-cablescan2.py pattern). Footprint acceptance
  checks for dark fittings must count luma-dark px in interior zones, with
  §B2's machine hole-scan (not tone) owning the see-through question.
