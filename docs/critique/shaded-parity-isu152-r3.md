# isu152 shaded-parity verdict — post-r3 (independent critic)

Date: 2026-08-03. Judged commit: 8f3f8ea (HEAD; `src/vehicles/profiles/casemate.js`
clean — the render is the builder's r3 exactly; the abrams/merkava/russia/ww2
working-tree edits do not touch the casemate family).

Pairs: re-rendered fresh via `node tools/tmp-tank-critic.mjs --id=isu152`
(vite :7469, zero console errors, 14/14 saved 2026-08-03 10:05) →
`shots/critic-isu152/*.png`. Verdict scored ONLY on those files
(CRITIC-PAIRS VERIFICATION LAW). Diagnostic crops + rect tool:
`tools/tmp-isu152r3-critic-crops.py` (ITU-601 luma, bg discriminator
|px−0x151b20| maxch ≤13). Registration verified: pane bboxes identical to
±4px in view-left (550×157 both), view-front (524/520×444/442), view-top
(186/184×546), close-front (445/446×272/270) — proc rects = ref rects +640.

## HEADLINE: FAIL — no view reaches 9.0. Floors: close-roof 7.0,
## close-front 7.5, view-top 7.5, hero-toptilt 7.5, view-rear 8.0,
## hero-rearright 8.0; all eight remaining views 8.5.

r3 is a real step: r2's 4.0 close-roof floor is gone, the six-wheel gear
read exists, the fringe no longer erupts below the ground envelope, the
blue-lift is dead (B/G 0.62–0.65 everywhere I measured, ref-family), and
silhouette/dims are pixel-registered in all 14 panes. What keeps every
view under 9.0 is a consistent tier gap: flat-relief roof furniture, a
machined (not cast) mantlet language, missing engine-deck identity
texture, and a gear zone that reads filled-and-flat where the ref reads
open-and-shadowed.

## Per-view scores

| view | score | justification |
|---|---|---|
| view-front | 8.5 | Silhouette/width/track stance exact. Front face reads flatter than ref: stacked machined collar + perforated flange where the ref's dark ball mantlet dominates; roofline furniture (pipe, drum, donut ring) doesn't match ref's cupola bumps. Cleat row + bins present but subtler than ref's dark chevron combs. |
| view-frontleft | 8.5 | Same-vehicle read immediate; casemate slope, gun, rear drums correct. Deductions: punched slot row at the fender line, window band ~half the ref's sky, boxy front bins, flat gear band. |
| view-left | 8.5 | The r2 headline is delivered: six ROUND wheels with hub cones + 6-bolt rings, arcs against dark. But on the official rig the windows are thin slits: w2-w3 rect (local x150-262, y366-384) measures **7.0% sky vs ref 26.8%** (builder claimed 22.2 vs 38.2 — not reproduced, see Claims). Ground line: pads bright to y397, then a 1px sparse tooth row (y398: 101 non-bg px, p50 60.2, 37.6% dark) vs ref's continuous bright pads; both track descents carry dark tooth cascades the ref shows only faintly. Flank fender-line band flat (iqr 0.2 vs ref 2.6) with punched slots. |
| view-rearleft | 8.5 | Envelope + crate + drums right; same flank flatness, descent teeth visible at the rear wrap. |
| view-rear | 8.0 | Composition drift: two stacked dark-rimmed drum circles per shoulder (ref: one softer circle each side); center dominated by two plain crate slabs; lower plate carries a visible marbled mottle (iqr 2.9 vs ref's uniform 0.3, and the streaking reads at pane scale) around an otherwise-correct bolt circle. Twin covers present in the fall-plate slope as small ellipses (delivered). Flaps warm: p50 98.8 vs ref 94.4 — in family. |
| view-rearright | 8.5 | Drum pile reads well (cap rings, brackets); crate + donut composition and toothed sprocket wrap hold it below 9. |
| view-right | 8.5 | Mirror of view-left, same gear-zone story; additionally the ref's rear-fender curl horn (ref pane x560-595, y320-355) has no proc counterpart (flat slab). |
| view-frontright | 8.5 | As frontleft; cheek MG-port circle clearly delivered (visible ring + plug). |
| view-top | 7.5 | Plan silhouette + stations exact, no empty/unfilled regions (owner emptiness law PASS). But deck identity diverges: ref's two dark intake-grid patches + louvered slats are ABSENT; proc instead runs 6 bold full-width rails (ref has 3 short thin lines); a tone-inverted DARK donut sits on the crate lid where the ref box carries two BRIGHT domed covers; deck dome reads as a small bump, not the ref's dominant circle; muzzle carries 2 tip rings vs the ref's full fluted muzzle section (ordered simplification, still a plan-read delta). Roof: arc rings + crossbar X-disc present but sparse against the ref's two ringed cupolas + dome. |
| hero-frontleft | 8.5 | Strongest hero: mass, stance, gun, drums all read. Flank slot row + flat gear + smooth bins visible at this range. |
| hero-rearright | 8.0 | Crate with black donut lid + wall/plate mottle + toothed wrap read at first glance; drums themselves are good. |
| hero-toptilt | 7.5 | The owner's hollow/circle-check angle: proc aft two-thirds = rail stripes + low pillow dome + black donut; ref = intake grids, louvers, prominent dome, bright covers. Cupola circles read but flat. Not a hollow/empty failure — a furniture-identity failure. |
| close-front | 7.5 | The nose signature does not survive closeup: proc gun root = perforated bolt-hole flange + 3-4 segment machined sleeve + stepped collar on a flat plate; ref = bolted trapezoid frame + one smooth cast shield + sleeve. Ordered items ARE present (MG-port circle, visor hood, cleat bars, cast-bulge stack, muzzle recess/bore softened, 2 rings) but the read is lathe-work vs casting. Fender bins smooth vs ref's rib combs. Track wrap + wheels below actually read well here. |
| close-roof | 7.0 | Better than r2's 4.0 (rings/discs/cross exist) but the roof is still a relief class below the ref: ref shows two RAISED cupola drums with periscope heads + mushroom dome; proc shows a flush X-disc + dashed arc ring, one low drum, a bare pipe, and a ball dome that is by design only a painted circle (crown 2.358, disclosed). **DShK fails MG PHYSICS**: it renders as a thin rod + small block lying flat across the roof (proc pane ~x950-1030, y300-360 zone at pair scale) — no receiver mass read, no pintle column read, no sky silhouette in ANY of the 14 panes; the AA ring + 3 stanchions are the only parts that read. Owner decoration-minimum NOT met. Casemate wall band shows camo-cloth marbling louder than the ref's near-uniform plate. |

## Claims audit (official pairs outrank builder row analysis)

- Window sky "22.2% vs ref 38.2": **not reproduced** — 7.0% vs 26.8% on
  the official rig (w2-w3 rect above; whole gap band 15.8% vs 28.6%).
  Direction of the improvement vs r2 (0%) is real; magnitude is not.
  Likely the deleted per-model harness (tmp-isu152-critic.html) framed a
  different declination than the official generic rig.
- Fringe: "no low-view eruption" holds in the strict sense (proc bottom
  y399 = ref bottom y399; nothing below the ground envelope), and the run
  law is met (p50 ratio 1.075, law 0.92-1.16). But the y398 tooth row
  (37.6% dark, sparse) + dark cascades on both wrap descents are a
  first-glance read the ref does not have.
- Wall/appliqué retone: **verified** — wall p50 94.2 vs ref 96.6, B/G
  0.650 vs 0.649 (EXACT class); no blue-lift anywhere sampled.
- Rear flaps warm: verified (98.8 vs 94.4, warm family).
- Roof grammar (arc rings, crossbar discs, rail lines, deck dome, vent
  donut): all EXIST and are visible in view-top/toptilt/close-roof —
  delivered as geometry, but under-scaled in relief/prominence vs ref.
- DShK "panes carry the gun read": **not reproduced** — see close-roof.
- Muzzle: rings 2, recess softened, bore small — verified in close-front;
  plan view still misses the ref's fluted muzzle band.
- Twin covers, bolt circle, crate split: verified present; the covers
  read far smaller than the ref's two bright box-top circles, and the
  crate lid instead carries the tone-inverted vent donut.

## Fix orders (r4), in floor order

1. **MG (owner law, close-roof 7.0)**: rebuild the DShK read — receiver
   as a visible box mass on a real pintle column above the AA ring,
   barrel elevated 10-20 deg so the muzzle breaks the roof/sky line in at
   least view-left + one hero; thin-rod-lying-flat is a crowbar, not a
   gun. Pale top-lit edge faces per MG physics.
2. **Roof relief (close-roof)**: give the FWD cupola a real drum (the
   aft one half-reads already) and/or periscope heads; the flush X-disc +
   arc ring alone cannot match the ref's two raised drums. If heightM
   p95 blocks crown growth, spend relief on the drum WALL (wider
   footprint, darker under-shadow ring) not the crown.
3. **Deck identity (view-top / hero-toptilt)**: add the ref's two dark
   intake-grid patches + louver slats to the engine deck; cut the six
   full-width rails back to the ref's three short strips; repaint the
   crate-lid vent donut from near-black to the bright fitting family (or
   move the bright twin-cover read back on top of the box where the ref
   prints its two dominant circles); boost the deck dome rim-ring
   contrast so its circle competes in plan.
4. **Mantlet casting (close-front / view-front)**: paint out the
   bolt-hole dots on the root flange, merge the sleeve segments into one
   smooth taper, and add the ref's bolted trapezoid frame border on the
   cheek so the nose reads cast, not machined. Rib the front bin faces.
5. **Gear zone (all side views)**: reclaim window sky toward the ref's
   27% on the official rig — the shelf/run-base slivers are eating the
   openings the r2 order bought; verify on tmp-tank-critic.mjs output,
   not a bespoke rig. Lift the y398 tooth row to the pad family (or
   shorten teeth) and knock the wrap-descent teeth back to the ref's
   faint nub read. Break the punched-slot fender-line band's regularity.
6. **Mottle amplitude (view-rear / close-roof / heroes)**: halve the
   camo-cloth marbling on the wall band + fall-plate/lower rear plate
   (ref iqr 0.3 vs proc 2.9 with visible streak structure).

Diagnostic crops for all of the above: scratchpad `crops/` (this round
only). Fresh pairs remain in `shots/critic-isu152/`.
